class MapController {
  constructor() {
    /** @type {?OverworldMap} */
    this.overworldMap;
    /** @type {!Map.<number, !GameMap>} */
    this.gameMaps = new Map();
    /** @type {!Set.<!GameMapTile>} */
    this.visibleTiles = new Set();
    /** @type {!Set.<number>} */
    this.restMapIs = new Set();
    /** @type {!Set.<number>} */
    this.visitedMapIs = new Set();
    this.staticMeshGroup = new THREE.Group();
    this.dynamicMeshGroup = new THREE.Group();
    this.lightGroup = new THREE.Group();
    this.lightController = new LightController();
    /** @type {!Array.<!Particle>} */
    this.particles = [];
    /** @type {!Array.<!Creature>} */
    this.creatures = [];
    /** @type {!Array.<!Creature>} */
    this.players = [];
    /** @type {Creature} */
    this.active;
    /** @type {!Set.<!Creature>} */
    this.turnTaken = new Set();
    /** @type {!Array.<?Item>} */
    this.inventory = [];
    /** @type {!Set.<number>} */
    this.deathLedger = new Set();
    this.sleepFadeEffect = 0;
    /** @type {!Set.<number>} */
    this.reviveLedger = new Set();
    for (let i = 0; i < mechInventoryWidth * mechInventoryHeight; i++) {
      this.inventory.push(null);
    }
    this.inCombat = false;
    /** @type {!Set.<!Creature>} */
    this.combatBosses = new Set();
    this.cameraAngle = 0;
  }

  /**
   * @param {!Array.<!Creature>} players
   * @param {number=} optGenLimit
   */
  async generateNew(players, optGenLimit) {
    /**
     * @param {function((function(string))=):Promise.<T>} genFn
     * @param {string} identifier
     * @return {!Promise.<T>}
     * @template T
     */
    const generateWrapper = async (genFn, identifier) => {
      if (optGenLimit) {
        const errors = new Map();
        const logFn = (error) => {
          errors.set(error, (errors.get(error) || 0) + 1);
        };
        const value = await genFn(logFn);
        if (value.tiles.size == 0) {
          console.log('--WARNING: Failed to generate ' + identifier + ':');
          for (const error of errors.keys()) {
            console.log('  ' + errors.get(error) + 'x: ' + error);
          }
        }
        return value;
      } else {
        return genFn();
      }
    };

    // Generate the overworld.
    this.overworldMap = await generateWrapper((logFn) => {
      const om = new OverworldMap(generateSeed());
      return om.generate(optGenLimit, logFn).then(() => om);
    }, 'overworld map');

    // Generate all of the maps, as a first pass-through.
    this.gameMaps.clear();
    for (const i of this.overworldMap.tiles.keys()) {
      const gm = await generateWrapper((logFn) => {
        const tile = this.overworldMap.tiles.get(i);
        const gm = new GameMap(tile, optGenLimit, logFn);
        return Promise.resolve(gm);
      }, 'game map #' + i);
      this.gameMaps.set(i, gm);
    }

    // Move the player to the start position.
    this.players = players;
    for (const gameMap of this.gameMaps.values()) {
      if (!gameMap.startI) continue;
      for (const player of this.players) {
        this.pickNewSpotFor(player, toX(gameMap.startI), toY(gameMap.startI));
      }
      break;
    }
    this.active = this.players[0];

    // Generate and distribute items.
    this.overworldMap.generateLoot(defaultRNG());
    for (const i of this.overworldMap.tiles.keys()) {
      const gameMap = this.gameMaps.get(i);
      const tile = this.overworldMap.tiles.get(i);
      gameMap.distributeLoot(tile, defaultRNG());
      await tinyWait();
    }

    // Generate all encounters.
    let encounterTally = 1;
    let deathLedgerId = 1;
    for (const i of this.overworldMap.tiles.keys()) {
      const gameMap = this.gameMaps.get(i);
      const tile = this.overworldMap.tiles.get(i);
      for (let j = 0; ; j++) {
        if (j >= 100) {
          // Too many failures... start over from the start!
          await this.generateNew(players, optGenLimit);
          return;
        }
        const enemies = await gameMap.generateEncounters(
            tile, defaultRNG(), encounterTally);
        if (enemies) {
          for (const enemy of enemies) {
            this.addCreature(enemy);

            // Some "enemies" are actually NPCs... they don't need to be added
            // to the death ledger, as they will never be killed.
            // Similarly, bosses should not respawn, since it'd be a pain to
            // fight them again.
            if (enemy.side == Creature.Side.Enemy && !enemy.boss) {
              enemy.deathLedgerId = deathLedgerId++;
              encounterTally = Math.max(encounterTally, enemy.encounterId + 1);

              // Before adding the creature to the map's ledger, set its EXP to
              // 0 temporarily. This ensures that you can't grind by killing and
              // respawning the same enemy over and over.
              // Also reduce the creature's current life, so that they respawn
              // at reduced life, to give the impression they are "injured".
              const [oldLife, oldEXP] = [enemy.life, enemy.exp];
              enemy.exp = 0;
              enemy.life = Math.ceil(enemy.life * 0.7);
              gameMap.enemyRecords.set(enemy.deathLedgerId, enemy.saveString);
              [enemy.life, enemy.exp] = [oldLife, oldEXP];
            }
          }
          break;
        }
        await tinyWait();
      }
    }

    // Assign EXP to enemies. EXP is divvied out by map level.
    for (let level = 1; level <= mechMaxLevel; level++) {
      const exp = mechNumPlayers * expForNextLevel(level);

      // Get all enemies that were generated by maps of the appropriate level.
      const enemies = [];
      for (const cr of this.creatures) {
        if (cr.side != Creature.Side.Enemy) continue;
        const gameMap = this.gameMapAt(cr.x, cr.y);
        if (!gameMap) continue;
        const overworldMapTile = this.overworldMap.tiles.get(toI(
            gameMap.overworldX, gameMap.overworldY));
        if (!overworldMapTile || overworldMapTile.level != level) continue;
        enemies.push(cr);
      }

      let totalGenerationPoints = 0;
      for (const cr of enemies) {
        totalGenerationPoints += cr.generationPoints;
      }
      for (const cr of enemies) {
        cr.exp = Math.ceil(exp * cr.generationPoints / totalGenerationPoints);
      }
    }
  }

  async load() {
    // Pull the last "true save".
    saveManager.pullSave();

    const save = /** @type {!Object.<string, string>} */ (
      saveManager.loadSaveObj('game'));

    const seed = saveManager.intFromSaveObj(save, 'seed');
    this.overworldMap = new OverworldMap(seed);
    await this.overworldMap.generate();
    // Does not load the game maps yet. They will be loaded in the first
    // "reloadMaps" call. EXCEPT for the map the players are in, of course.
    for (let i = 0; ; i++) {
      const raw = save['player' + i];
      if (!raw) break;
      const player = Creature.load(raw);
      this.players.push(player);
      if (player.dead) continue; // Don't bother adding to map...
      this.loadGameMap(this.overworldIFor(player.x, player.y));
      this.addCreature(player);
    }
    this.active = this.players[0];
    if (save['dLedger']) {
      this.deathLedger =
          new Set(save['dLedger'].split(',').map((s) => parseInt(s, 10)));
    }
    if (save['rLedger']) {
      this.deathLedger =
          new Set(save['rLedger'].split(',').map((s) => parseInt(s, 10)));
    }
    if (save['rMapIs']) {
      this.restMapIs =
          new Set(save['rMapIs'].split(',').map((s) => parseInt(s, 10)));
    }
    if (save['vMapIs']) {
      this.visitedMapIs =
          new Set(save['vMapIs'].split(',').map((s) => parseInt(s, 10)));
    }
    for (let i = 0; i < this.inventory.length; i++) {
      const saveString = save['i' + i];
      if (!saveString) continue;
      this.inventory[i] = Item.load(saveString);
    }
  }

  revive() {
    // Transfer everything in the death ledger to the revive ledger, so that
    // when we load a map we know to respawn that enemy.
    for (const deathLedgerId of this.deathLedger) {
      this.reviveLedger.add(deathLedgerId);
    }
    this.deathLedger.clear();

    // Also respawn any enemies inside currently-loaded maps.
    for (const gameMap of this.gameMaps.values()) {
      this.reviveForMap_(gameMap);
    }
  }

  /**
   * @param {!GameMap} gameMap
   * @private
   */
  reviveForMap_(gameMap) {
    for (const deathLedgerId of gameMap.enemyRecords.keys()) {
      if (!this.reviveLedger.has(deathLedgerId)) continue;
      const record = gameMap.enemyRecords.get(deathLedgerId);
      this.reviveLedger.delete(deathLedgerId);

      // Revive that record as close to it's original position as possible.
      const creature = Creature.load(record);
      this.pickNewSpotFor(creature, creature.x, creature.y);
    }
  }

  /** Save everything currently loaded into memory. */
  save() {
    const save = {};
    saveManager.intToSaveObj(save, 'seed', this.overworldMap.seed);
    for (let i = 0; i < this.players.length; i++) {
      save['player' + i] = this.players[i].saveString;
    }
    save['dLedger'] = Array.from(this.deathLedger).join(',');
    save['rLedger'] = Array.from(this.reviveLedger).join(',');
    if (this.restMapIs.size > 0) {
      save['rMapIs'] = Array.from(this.restMapIs).join(',');
    }
    if (this.visitedMapIs.size > 0) {
      save['vMapIs'] = Array.from(this.visitedMapIs).join(',');
    }
    for (let i = 0; i < this.inventory.length; i++) {
      const item = this.inventory[i];
      if (!item) continue;
      save['i' + i] = item.saveString;
    }
    for (const gameMap of this.gameMaps.values()) {
      this.saveGameMap_(gameMap);
    }
    saveManager.save('game', JSON.stringify(save));

    // Since this is a true save, push the save and make it persist!
    saveManager.pushSave();
  }

  /**
   * @param {!GameMap} gameMap
   * @private
   */
  saveGameMap_(gameMap) {
    const i = toI(gameMap.overworldX, gameMap.overworldY);
    const overworldMapTile = this.overworldMap.tiles.get(i);
    const save = {};
    saveManager.intToSaveObj(save, 'seed', overworldMapTile.seed);
    const creaturesToSave = new Set();
    const doorFrameIs = [];
    for (const tile of gameMap.tiles.values()) {
      for (const i of tile.doorFrameIs) {
        doorFrameIs.push(toI(tile.x, tile.y) + '-' + i);
      }
    }
    if (doorFrameIs.length > 0) {
      save['dfi'] = doorFrameIs.join(',');
    }
    /**
     * @param {string} name
     * @param {!Set.<number>} takeFrom
     */
    const saveLocalIList = (name, takeFrom) => {
      if (takeFrom.size == 0) return;
      save[name] = Array.from(takeFrom).map((i) => {
        // Convert to map-space to make it a little smaller.
        const x = toX(i) - gameMap.xOff;
        const y = toY(i) - gameMap.yOff;
        return toI(x, y);
      }).join(',');
    };
    saveLocalIList('discovered', gameMap.discoveredTileIs);
    for (const tile of gameMap.tiles.values()) {
      if (tile.item) {
        save['i' + toI(tile.x, tile.y)] = tile.item.saveString;
      }
      for (const creature of tile.creatures) {
        if (creature.side == Creature.Side.Player) continue;
        creaturesToSave.add(creature);
      }
    }
    for (const ledgerId of gameMap.enemyRecords.keys()) {
      save['er-' + ledgerId] = gameMap.enemyRecords.get(ledgerId);
    }
    const creaturesToSaveAr = Array.from(creaturesToSave);
    for (let i = 0; i < creaturesToSaveAr.length; i++) {
      save['c' + i] = creaturesToSaveAr[i].saveString;
    }
    saveManager.save('map-' + i, JSON.stringify(save));
  }

  /** @param {number} i */
  loadGameMap(i) {
    if (this.gameMaps.has(i)) return; // No need!
    const save = saveManager.loadSaveObj('map-' + i);
    const tile = this.overworldMap.tiles.get(i);
    if (save) tile.seed = saveManager.intFromSaveObj(save, 'seed');
    const gameMap = new GameMap(tile);
    this.gameMaps.set(i, gameMap);
    if (save['dfi']) {
      for (const pair of save['dfi'].split(',')) {
        const split = pair.split('-').map((s) => parseInt(s, 10));
        const tile = gameMap.tiles.get(split[0]);
        if (!tile) continue;
        tile.doorIds.set(split[1], 0);
        tile.doorFrameIs.add(split[1]);
      }
    }
    /**
     * @param {string} name
     * @param {!Set.<number>} addTo
     */
    const loadLocalIList = (name, addTo) => {
      if (!save[name]) return;
      for (const iStr of save[name].split(',')) {
        // Convert back from map-space.
        const i = parseInt(iStr, 10);
        const x = toX(i) + gameMap.xOff;
        const y = toY(i) + gameMap.yOff;
        addTo.add(toI(x, y));
      }
    };
    loadLocalIList('discovered', gameMap.discoveredTileIs);
    for (const key in save) {
      if (!key.startsWith('er-')) continue;
      gameMap.enemyRecords.set(parseInt(key.replace('er-', ''), 10), save[key]);
    }
    for (let i = 0; ; i++) {
      const saveString = save['c' + i];
      if (!saveString) break;
      const creature = Creature.load(saveString);
      this.addCreature(creature);
    }
    for (const tile of gameMap.tiles.values()) {
      // Clear any items made in generation (e.g. keys, campfires, etc).
      // In case they got used up.
      tile.item = null;
      // Then load whatever was saved.
      const saveString = save['i' + toI(tile.x, tile.y)];
      if (saveString) {
        tile.item = Item.load(saveString);
      }
    }
    this.reviveForMap_(gameMap);
  }

  pickNewActive() {
    if (this.active) this.turnTaken.add(this.active);
    this.active = null;
    for (const creature of this.creatures) {
      if (creature.encounterId) continue;
      if (creature.side == Creature.Side.Npc) continue;
      if (this.turnTaken.has(creature)) continue;
      if (this.active) {
        if (this.active.getModifiedInitiative() >=
            creature.getModifiedInitiative()) continue;
      }
      this.active = creature;
    }
  }

  /**
   * Note this function assumes the creature is not in a tile already
   * e.g. it was dead before, for example.
   * @param {!Creature} creature
   * @param {number} aroundX
   * @param {number} aroundY
   * @return {boolean}
   */
  pickNewSpotFor(creature, aroundX, aroundY) {
    let bestD = Infinity;
    let bestIs = [];
    const explore = (x, y, d, oldTile) => {
      if (oldTile) {
        const doorId = oldTile.doorIds.get(toI(x, y));
        if (doorId != 0) return; // Can't go through walls!
      }
      const tile = this.tileAt(x, y);
      if (!tile) return;
      if (tile.creatures.length == 0 && !tile.item) {
        if (d < bestD) bestIs = [];
        if (d <= bestD) {
          bestIs.push(toI(x, y));
          bestD = d;
        }
      }
      if (d >= 3) return; // Don't look too far!
      explore(x + 1, y, d + 1, tile);
      explore(x - 1, y, d + 1, tile);
      explore(x, y + 1, d + 1, tile);
      explore(x, y - 1, d + 1, tile);
    };
    explore(aroundX, aroundY, 0, null);
    if (bestIs.length == 0) return false;
    const i = getRandomArrayEntry(bestIs);
    creature.x = toX(i);
    creature.y = toY(i);
    this.addCreature(creature);
    return true;
  }

  /** @param {function()} extraEffectsFn */
  rest(extraEffectsFn) {
    /**
     * @type {!Array.<{
     *   line: string,
     *   speaker: !Creature,
     *   trigger: string,
     * }>}
     */
    const lines = [];

    // Determine which line should play.
    const shouldPlaySleepLines = this.players.some((player) => {
      return player.life < player.maxLife || player.astra < player.maxAstra;
    });
    if (shouldPlaySleepLines) {
      for (const trigger of ['pre-sleep', 'post-sleep']) {
        for (const player of this.players) {
          if (player.dead) continue;
          for (const line of player.getLinesForTrigger(trigger, this)) {
            lines.push({
              line,
              speaker: player,
              trigger,
            });
          }
        }
      }
    }
    const line = lines.length > 0 ? getRandomArrayEntry(lines) : null;

    // Determine which creature's action-line should be responsible for the
    // sleep animation.
    const sleeper = line ? line.speaker : this.players[0];
    const waitForBlockingParticles = () => {
      sleeper.actions.push((elapsed) => {
        for (const particle of this.particles) {
          if (particle.blocking) return false;
        }
        return true;
      });
    };

    // Perform the sleep effect.
    sleeper.effectAction(() => {
      if (line && line.trigger == 'pre-sleep') {
        line.speaker.say(line.line);
      }
    });
    waitForBlockingParticles();
    sleeper.effectAction(() => {
      // TODO: "sleep" sound effect
    });
    sleeper.actions.push((elapsed) => {
      this.sleepFadeEffect += elapsed;
      if (this.sleepFadeEffect < 1) return false;
      this.sleepFadeEffect = 1;
      return true;
    });
    sleeper.effectAction(() => {
      for (const player of this.players) {
        if (player.dead) {
          this.pickNewSpotFor(player, this.active.x, this.active.y);
        }
        player.refill();
      }
      this.revive();

      // Clean all creatures, but keep the action intact as you do.
      const oldSleeperIdx = this.players.indexOf(sleeper);
      const oldSleeperActions = sleeper.actions;
      this.cleanCreatures();
      const newSleeper = this.players[oldSleeperIdx];
      newSleeper.actions = oldSleeperActions;
      if (line) line.speaker = newSleeper;

      this.save();
      extraEffectsFn();
    });
    sleeper.actions.push((elapsed) => {
      this.sleepFadeEffect -= elapsed;
      if (this.sleepFadeEffect > 0) return false;
      this.sleepFadeEffect = 0;
      return true;
    });
    sleeper.effectAction(() => {
      if (line && line.trigger == 'post-sleep') {
        line.speaker.say(line.line);
      }
    });
    waitForBlockingParticles();
  }

  /** Remove status effects from all creatures, etc. */
  cleanCreatures() {
    const oldCreatures = this.creatures;
    this.creatures = [];
    for (const creature of oldCreatures) {
      // Save and load to clear status effects.
      creature.removeFromTiles(this);
      if (creature.summonOwner) continue; // Get rid of summons, instead.
      const saveString = creature.saveString;
      const freshCopy = Creature.load(saveString);
      this.addCreature(freshCopy);

      // Be sure for the player array to have it!
      if (freshCopy.side == Creature.Side.Player) {
        const idx = this.players.indexOf(creature);
        if (idx != -1) {
          this.players[idx] = freshCopy;
        }
      }
      if (this.active == creature) this.active = freshCopy;
    }

    if (!this.inCombat) {
      // The active player cannot be dead, out of combat.
      const i = this.players.findIndex((c) => !c.dead);
      if (i > 0) {
        this.active = this.players[i];
        [this.players[0], this.players[i]] = [this.players[i], this.players[0]];
      }
    }
  }

  /** @return {boolean} */
  get animating() {
    for (const particle of this.particles) {
      if (particle.blocking) return true;
    }
    for (const creature of this.creatures) {
      if (creature.animating) return true;
    }
    return false;
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  awardEXPFor_(creature) {
    // Award that EXP to all players, evenly distributed among them.
    const livingPlayers = this.players.filter((p) => !p.dead);
    for (const player of livingPlayers) {
      player.awardEXP(Math.ceil(creature.exp / livingPlayers.length));
    }
    creature.exp = 0;
  }

  /** @param {number} elapsed */
  update(elapsed) {
    let creatureDead = false;
    for (const creature of this.creatures) {
      creature.update(elapsed);
      for (const particle of creature.cachedParticles) {
        this.particles.push(particle);
      }
      creature.cachedParticles = [];
      if (creature.shouldDisposeOf) {
        creature.removeFromTiles(this);
        creatureDead = true;
        creature.clear3DData();
        if (creature.side == Creature.Side.Enemy && creature.exp > 0) {
          this.awardEXPFor_(creature);
        }
        if (creature.deathLedgerId) {
          this.deathLedger.add(creature.deathLedgerId);
        }
      }
    }
    if (creatureDead) {
      this.creatures = this.creatures.filter((cr) => !cr.shouldDisposeOf);
    }

    let particleDead = false;
    for (const particle of this.particles) {
      particle.update(elapsed, this);
      if (particle.dead) {
        particleDead = true;
        particle.clear3DData();
      }
    }
    if (particleDead) {
      this.particles = this.particles.filter((pr) => !pr.dead);
    }

    for (const tile of this.visibleTiles) {
      tile.update(elapsed);
      for (const particle of tile.cachedParticles) {
        this.particles.push(particle);
      }
    }
  }

  /** @param {!Creature} creature */
  addCreature(creature) {
    this.creatures.push(creature);
    creature.addToTiles(this);
  }

  /**
   * @param {!Array.<Item>} items
   * @param {!Creature} nearCreature
   */
  dropItemsOnFloor(items, nearCreature) {
    let r = 0;
    while (items.length > 0) {
      const validTiles = [];
      for (let y = nearCreature.y - r; y <= nearCreature.y + r; y++) {
        for (let x = nearCreature.x - r; x <= nearCreature.x + r; x++) {
          const tile = this.tileAt(x, y);
          if (!tile || tile.item) continue;
          const hasNpc =
              tile.creatures.some((c) => c.side == Creature.Side.Npc);
          if (hasNpc) continue;
          const distance =
              Math.abs(x - nearCreature.x) + Math.abs(y - nearCreature.y);
          if (distance != r) continue;
          validTiles.push(tile);
        }
      }
      shuffleArray(validTiles);
      for (const tile of validTiles) {
        tile.item = items.pop();
        if (items.length == 0) break;
      }
      r += 1;
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?GameMapTile}
   */
  tileAt(x, y) {
    const gameMap = this.gameMapAt(x, y);
    return gameMap ? gameMap.tileAt(x, y) : null;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?GameMap}
   */
  gameMapAt(x, y) {
    return this.gameMaps.get(this.overworldIFor(x, y));
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {number}
   */
  overworldIFor(x, y) {
    const size = mapGameMapSize * mapTileUpscale * mapSecondTileUpscale;
    return toI(Math.floor(x / size), Math.floor(y / size));
  }

  clear3DData() {
    // Reload maps with a fake position so that everything will unload.
    this.reloadMaps(toI(999, 99));
    // Also unload all players.
    for (const player of this.players) player.clear3DData();
  }

  /**
   * Makes sure that the map that corresponds to the player position and all
   * nearby maps, are all in memory. All other maps unload.
   * @param {number=} optForceOverworldTileI
   */
  reloadMaps(optForceOverworldTileI) {
    const overworldTileI = optForceOverworldTileI != undefined ?
        optForceOverworldTileI :
        this.overworldIFor(this.active.x, this.active.y);
    const overworldTile = this.overworldMap.tiles.get(overworldTileI);

    const desiredMapIs = new Set();
    if (overworldTile) {
      desiredMapIs.add(toI(overworldTile.x, overworldTile.y));
      for (const i of overworldTile.doorIds.keys()) {
        desiredMapIs.add(i);
      }
    }

    // Unload any maps that are no longer necessary.
    for (const i of this.gameMaps.keys()) {
      if (desiredMapIs.has(i)) continue;
      const gameMap = this.gameMaps.get(i);
      this.saveGameMap_(gameMap);
      for (const tile of gameMap.tiles.values()) {
        // Avoid memory leaks by disposing of any generated 3D data.
        tile.clear3DData();
      }
      this.gameMaps.delete(i);
      // Unload any creatures in this map.
      this.creatures = this.creatures.filter((creature) => {
        if (creature.side == Creature.Side.Player) return true;
        if (this.overworldIFor(creature.x, creature.y) == i) {
          creature.clear3DData();
          return false;
        }
        return true;
      });
    }

    // Load any maps that are needed but we do not have yet.
    for (const i of desiredMapIs) {
      if (this.gameMaps.has(i)) continue;
      this.loadGameMap(i);
    }

    // Mark the central map as visited.
    this.visitedMapIs.add(overworldTileI);
  }

  /**
   * @param {!THREE.Scene} scene
   * @param {!THREE.PerspectiveCamera} camera
   * @param {number} cX
   * @param {number} cY
   */
  draw(scene, camera, cX, cY) {
    const cZ = 0.25;
    const cameraDistance = 2.5;
    camera.position.set(
        cX - Math.cos(this.cameraAngle) * cameraDistance,
        cZ + cameraDistance,
        cY - Math.sin(this.cameraAngle) * cameraDistance);
    camera.lookAt(cX, cZ, cY);

    if (this.dynamicMeshGroup.parent != scene) scene.add(this.dynamicMeshGroup);
    if (this.staticMeshGroup.parent != scene) scene.add(this.staticMeshGroup);
    if (this.lightGroup.parent != scene) scene.add(this.lightGroup);

    // Add light sources in the camera position.
    this.lightGroup.clear();
    this.lightController.addToGroup(this.lightGroup);
    const centerTile = this.tileAt(
        Math.floor(this.active.cX), Math.floor(this.active.cY));
    if (centerTile) {
      // Personal light.
      const i = 0.75 - centerTile.lightingIntensity;
      if (i > 0) {
        this.lightController.add(cX, cY, cZ, i, '#FFFFFF');
      }
    }
    for (const gameMap of this.gameMaps.values()) {
      gameMap.addAmbientLight(this.lightGroup);
    }

    // Determine what tiles should be drawn.
    this.visibleTiles.clear();
    const r = 5; // TODO: get?
    for (let y = cY - r; y <= cY + r; y++) {
      for (let x = cX - r; x <= cX + r; x++) {
        const tile = this.tileAt(Math.floor(x), Math.floor(y));
        if (!tile) continue;
        this.visibleTiles.add(tile);
        tile.calculateScreenSpaceCorners(camera);
      }
    }

    // Add creatures and such to the mesh group.
    this.dynamicMeshGroup.clear();
    const alreadyAddedCreatures = new Set();
    for (const tile of this.visibleTiles) {
      for (const creature of tile.creatures) {
        if (alreadyAddedCreatures.has(creature)) continue;
        creature.addToGroup(this.dynamicMeshGroup, camera, this.inCombat);
        alreadyAddedCreatures.add(creature);
      }
    }

    // Add particles to the mesh group.
    for (const particle of this.particles) {
      particle.addToGroup(this.dynamicMeshGroup, this.lightController, camera);
    }

    // Discover all visible tiles.
    for (const tile of this.visibleTiles) {
      const gameMap = this.gameMapAt(tile.x, tile.y);
      if (!gameMap) continue;
      gameMap.discoveredTileIs.add(toI(tile.x, tile.y));
    }

    // Add the visible tiles to the scene.
    this.staticMeshGroup.clear();
    for (const tile of this.visibleTiles) {
      tile.addToGroup(this.staticMeshGroup, this.lightController, this, camera);
    }

    // Finalize the lights, so that they aren't over-assigned.
    this.lightController.finalize();
  }
}
