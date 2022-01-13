const allDiagnostics = new Map();

/** @param {!BonusSource} bS */
function checkBonusSourceValidity(bS) {
  let category = '';
  if (bS instanceof Weapon) {
    category = 'weapons';
  } else if (bS instanceof Armor) {
    category = 'armors';
  } else if (bS instanceof Accessory) {
    category = 'accessories';
  } else if (bS instanceof Ring) {
    category = 'rings';
  } else if (bS instanceof Skill) {
    category = 'skills';
  } else if (bS instanceof Species) {
    category = 'species';
  } else if (bS instanceof Job) {
    category = 'jobs';
  } else if (bS instanceof FightingStyle) {
    category = 'fighting styles';
  } else {
    console.log('--WARNING: ' + bS.type + ' has invalid category');
    return;
  }
  const allTypes = data.getCategoryEntriesArray(category) || [];
  if (!allTypes.includes(bS.type)) {
    console.log('--WARNING: ' + bS.type + ' has invalid type');
  }
}

/** @param {!Creature} creature */
function checkCreatureValidity(creature) {
  const slots = new Set();
  for (const armor of creature.armors) {
    checkBonusSourceValidity(armor);
    if (slots.has(armor.slot)) {
      console.log('--WARNING: ' + creature.name + ' has multiple ' +
                  armor.slot + ' armors');
    }
    if (creature.armorProfiencyLevel < armor.armorProfiencyLevel) {
      console.log('--WARNING: ' + creature.name +
                  ' armorProfiencyLevel too low');
    }
  }
  for (const skill of creature.skills) {
    checkBonusSourceValidity(skill);
  }
  if (creature.accessory) checkBonusSourceValidity(creature.accessory);
  if (creature.ring) checkBonusSourceValidity(creature.ring);
  if (creature.weapon) checkBonusSourceValidity(creature.weapon);
  if (creature.activeFightingStyle) {
    checkBonusSourceValidity(creature.activeFightingStyle);
  }
  checkBonusSourceValidity(creature.species);
  for (const job of creature.jobs) {
    checkBonusSourceValidity(job);
  }
  if (creature.jobs.length != creature.desiredNumJobs) {
    console.log('--WARNING: ' + creature.name + ' has ' + creature.jobs.length +
                ' jobs, should have ' + creature.desiredNumJobs);
  }
  const allProficiencies = new Set();
  for (const job of creature.jobs) {
    for (const proficiency of job.proficiencies) {
      allProficiencies.add(proficiency);
    }
  }
  for (const weapon of creature.usableWeapons) {
    checkBonusSourceValidity(weapon);
    // If the creature has actual proficiencies (e.g. it's using a player job),
    // then make sure it actually FOLLOWS those proficiencies.
    // Ah, but only do that for stuff with fluff. It's okay for anyone to have
    // unarmed strike, or to equip enemy-only stuff.
    if (allProficiencies.size > 0 && !allProficiencies.has(weapon.type) &&
        weapon.fluff && !weapon.noProficiency) {
      if (!creature.ring || creature.ring.techType != weapon.type) {
        console.log('--WARNING: ' + creature.name +
                    ' is missing proficiency for ' + weapon.type);
      }
    }
    if (weapon.teleports && creature.monstrous) {
      console.log('--WARNING: ' + creature.name +
                  ' is monstrous but has a teleporting move');
    }
  }
  if (creature.moveDistance < 0) {
    console.log('--WARNING: ' + creature.name + ' has negative move distance');
  }
}

class SpeciesAppearanceViewerPlugin extends GamePlugin {
  constructor() {
    super();
    this.page = 0;
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    const allSpecies = data.getCategoryEntriesArray('species') || [];
    const r = 5;
    const drawDot = (xA, mult) => {
      const x = gfxTileSize - r + xA;
      const y = ctx.canvas.height - mult * gfxTileSize - r;
      const s = 2 * r;
      ctx.fillRect(x, y, s, s);
    };
    let y = 0;
    let i = 0;
    for (const species of allSpecies) {
      const creature = new Creature(Creature.Side.Player, species, []);
      if (Math.floor(i) == this.page) {
        y += gfxTileSize;
        ctx.save();
        ctx.translate(0, -ctx.canvas.height + y);

        // Sprite.
        creature.draw(ctx);

        // Head
        ctx.fillStyle = data.getColorByNameSafe('arcana');
        drawDot(0, creature.headHeightPoint);

        // Weapon
        ctx.fillStyle = data.getColorByNameSafe('blood');
        drawDot(3 * r, creature.weaponHeightPoint);

        ctx.restore();
      }
      i += 0.2;
    }
  }

  /** @param {!Controls} controls */
  input(controls) {
    if (controls.keyPressed(Controls.Key.UP)) {
      this.page -= 1;
    } else if (controls.keyPressed(Controls.Key.DOWN)) {
      this.page += 1;
    }
  }
}

/** @suppress {checkVars} */
class MapPreviewDiagnosticPlugin extends GamePlugin {
  constructor() {
    super();
    /** @type {MapController} */
    this.mapController;
    this.cursorX = 0;
    this.cursorY = 0;
    /** @type {!Set.<number>} */
    this.errorTileIs = new Set();
    /** @type {!Set.<number>} */
    this.inaccessibleTileIs = new Set();
    this.ranTests = false;
  }

  /**
   * @param {boolean} loadMode
   * @return {!Promise.<!GamePlugin>}
   */
  async generate(loadMode) {
    this.mapController = new MapController();
    const player = new Creature(Creature.Side.Player, 'firin', ['warrior']);
    if (loadMode) {
      await this.mapController.load();
      for (const tile of this.mapController.overworldMap.tiles.values()) {
        const i = toI(tile.x, tile.y);
        if (this.mapController.gameMaps.has(i)) continue;
        this.mapController.loadGameMap(i);
      }
    } else {
      await this.mapController.generateNew([player], 10000);
    }

    this.cursorX = this.mapController.players[0].x;
    this.cursorY = this.mapController.players[0].y;

    return this;
  }

  /** @private */
  templateBreakdown_() {
    const allCreatureTemplates =
        data.getCategoryEntriesArray('creature templates') || [];
    const byType = new Map();
    for (const type of allCreatureTemplates) {
      byType.set(type, 0);
    }
    for (const creature of this.mapController.creatures) {
      if (!creature.template) continue;
      byType.set(creature.template, byType.get(creature.template) + 1);
    }
    console.log('CREATURE TEMPLATE BREAKDOWN:');
    for (const type of allCreatureTemplates) {
      console.log('  ' + type + ': ' + byType.get(type));
    }
  }

  /** @private */
  validityText_() {
    const allTilesets = data.getCategoryEntriesArray('tilesets') || [];
    for (const tile of this.mapController.overworldMap.tiles.values()) {
      if (!allTilesets.includes(tile.tileset)) {
        console.log('--WARNING: Invalid tileset ' + tile.tileset);
      }
      // TODO: any other overall validity checks?
    }
  }

  /** @private */
  lootTest_() {
    /**
     * @param {!Equipment} gear
     * @return {boolean}
     */
    const isOverall = (gear) => {
      if (gear instanceof Weapon) {
        return gear.astraCost > 0;
      } else if (gear instanceof Accessory) {
        return true;
      } else if (gear instanceof Ring) {
        return true;
      } else {
        return false;
      }
    };

    /** @type {!Array.<!Array.<string>>} */
    const desiredByTier = [];
    for (let tier = 0; tier < mechNumTiers; tier++) {
      desiredByTier.push([]);
    }
    /** @type {!Array.<string>} */
    const desiredOverall = [];
    /**
     * @param {string} category
     * @param {function(string):!Equipment} makeFn
     * @param {function(!Equipment):number} desiredMultFn
     */
    const addCategory = (category, makeFn, desiredMultFn) => {
      const allTypes = data.getCategoryEntriesArray(category) || [];
      /** @type {!Map.<string, !Array.<!Equipment>>} */
      const byDiv = new Map();
      const addToByReq = (sample) => {
        if (!sample.fluff) return;
        const divAr = [];
        if (sample instanceof Armor) {
          divAr.push(sample.slot);
          divAr.push(sample.armorProfiencyLevel);
        } else if (sample instanceof Weapon) {
          divAr.push(sample.type);
        }
        if (isOverall(sample)) {
          divAr.push('u');
        }
        const div = divAr.join(':');
        const ar = byDiv.get(div) || [];
        ar.push(sample);
        byDiv.set(div, ar);
      };
      for (const type of allTypes) {
        const sample = makeFn(type);
        const numSubtypes = sample.numSubtypes;
        if (numSubtypes == 0) {
          addToByReq(sample);
        } else {
          for (let subtype = 0; subtype < numSubtypes; subtype++) {
            addToByReq(makeFn(type + ':' + subtype));
          }
        }
      }
      for (let tier = 0; tier < mechNumTiers; tier++) {
        for (const div of byDiv.keys()) {
          const gears = byDiv.get(div).filter((g) => g.tier == tier);
          for (const gear of gears) {
            let numDesired = desiredMultFn(gear);
            if (!isOverall(gear)) numDesired /= gears.length;
            numDesired = Math.ceil(numDesired);
            for (let i = 0; i < numDesired; i++) {
              if (isOverall(gear)) {
                desiredOverall.push(gear.saveString);
              } else {
                desiredByTier[tier].push(gear.saveString);
              }
            }
          }
        }
      }
    };
    addCategory('weapons', (type) => new Weapon(type), (gear) => {
      if (!(gear instanceof Weapon)) return 0;
      if (gear.astraCost > 0) {
        const allRings = data.getCategoryEntriesArray('rings') || [];
        for (const type of allRings) {
          if ((new Ring(type)).techType == gear.type) return 0;
        }
        return 1;
      } else {
        return gear.noProficiency ? 3 : 1;
      }
    });
    addCategory('armors', (type) => new Armor(type), (gear) => {
      if (!(gear instanceof Armor)) return 0;
      return 2;
    });
    addCategory('accessories', (type) => new Accessory(type), (gear) => 1);
    addCategory('rings', (type) => new Ring(type), (gear) => {
      if (!(gear instanceof Ring)) return 0;
      return (new Weapon(gear.techType)).targetRingUser ? 2 : 1;
    });

    /**
     * @param {!Array.<string>} loot
     * @param {!Array.<string>} desired
     * @param {string} suffix
     */
    const checkLoot = (loot, desired, suffix) => {
      const missing = desired.slice();
      for (const item of loot) {
        const idx = missing.indexOf(item);
        if (idx == -1) continue;
        missing.splice(idx, 1);
      }
      const excess = loot.slice();
      for (const item of desired) {
        const idx = excess.indexOf(item);
        if (idx == -1) continue;
        excess.splice(idx, 1);
      }
      if (missing.length > 0) {
        console.log('--WARNING: missing items' + suffix + ':', missing);
      }
      if (excess.length > 0) {
        console.log('--WARNING: excess items' + suffix + ':', excess);
      }
    };

    /** @type {!Array.<string>} */
    const overallLoot = [];
    for (let tier = 0; tier < mechNumTiers; tier++) {
      /** @type {!Array.<string>} */
      const allLoot = [];
      for (const gameMap of this.mapController.gameMaps.values()) {
        const overworldTile = this.mapController.overworldMap.tiles.get(toI(
            gameMap.overworldX, gameMap.overworldY));
        if (tierForLevel(overworldTile.level) != tier) continue;

        for (const tile of gameMap.tiles.values()) {
          if (!tile.item || !tile.item.contents) continue;
          const item = tile.item.contents;
          if (!(item instanceof Equipment)) continue;
          checkBonusSourceValidity(item);
          if (isOverall(item)) {
            overallLoot.push(item.saveString);
          } else {
            allLoot.push(item.saveString);
            if (Math.round(item.tier) != tier) {
              console.log('--WARNING: item in wrong tier (' + item.saveString +
                          ' in tier ' + tier + ')');
            }
          }
        }
      }

      checkLoot(allLoot, desiredByTier[tier], ' in tier ' + tier);
    }
    checkLoot(overallLoot, desiredOverall, ' overall');
  }

  /**
   * @param {number} cursorX
   * @param {number} cursorY
   * @param {Set.<number>=} optKeys
   * @private
   */
  tileAccessibilityTest_(cursorX, cursorY, optKeys) {
    const accessibleTiles = new Set();
    const toExplore = new Set();
    const cursorI = toI(cursorX, cursorY);
    toExplore.add(cursorI);
    accessibleTiles.add(cursorI);
    while (toExplore.size > 0) {
      const i = toExplore.values().next().value;
      toExplore.delete(i);
      const tile = this.mapController.tileAt(toX(i), toY(i));
      for (const i of tile.doorIds.keys()) {
        if (accessibleTiles.has(i)) continue;

        const keyId = tile.doorIds.get(i);
        if (keyId != 0) {
          if (!optKeys) continue;
          if (!optKeys.has(keyId)) continue;
        }

        const otherTile = this.mapController.tileAt(toX(i), toY(i));
        if (!otherTile) {
          console.log('--WARNING: Link to null tile: ' + i);
          this.errorTileIs.add(toI(tile.x, tile.y));
          continue;
        } else if (!otherTile.doorIds.has(toI(tile.x, tile.y))) {
          console.log('--WARNING: Un-reciprocated tile link: ' + i);
          this.errorTileIs.add(toI(tile.x, tile.y));
        }
        accessibleTiles.add(i);
        toExplore.add(i);

        if (otherTile.item && otherTile.item.contents == Item.Code.Key) {
          if (!optKeys) optKeys = new Set();
          if (!optKeys.has(otherTile.item.keyCode)) {
            optKeys.add(otherTile.item.keyCode);
            this.tileAccessibilityTest_(cursorX, cursorY, optKeys);
            return;
          }
        }
      }
    }
    const inaccessibleTiles = new Set();
    for (const gameMap of this.mapController.gameMaps.values()) {
      for (const tile of gameMap.tiles.values()) {
        const i = toI(tile.x, tile.y);
        if (accessibleTiles.has(i)) continue;
        inaccessibleTiles.add(i);
      }
    }
    if (inaccessibleTiles.size > 0) {
      console.log(
          '--WARNING: Overworld has inaccessible tiles=', inaccessibleTiles,
          'accessible tiles=', accessibleTiles);
      this.inaccessibleTileIs = inaccessibleTiles;
    }
  }

  /** @param {number} elapsed */
  update(elapsed) {
    if (this.ranTests) return;
    this.ranTests = true;
    // Do the tests async.
    this.runTests_();
  }

  async runTests_() {
    const [cursorX, cursorY] = [this.cursorX, this.cursorY];
    await tinyWait();
    this.validityText_();
    await tinyWait();
    this.tileAccessibilityTest_(cursorX, cursorY);
    await tinyWait();
    for (const creature of this.mapController.creatures) {
      checkCreatureValidity(creature);
    }
    await tinyWait();
    this.lootTest_();
    await tinyWait();
    this.templateBreakdown_();
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    const allSubRegions = data.getCategoryEntriesArray('sub regions') || [];

    // Draw neutral background.
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(0, 0, gfxScreenWidth, gfxScreenHeight);

    const scale = 2;
    const width = Math.floor(gfxScreenWidth / scale);
    const height = Math.floor(gfxScreenHeight / scale);
    const startX = Math.floor(this.cursorX - width / 2);
    const endX = Math.ceil(this.cursorX + width / 2);
    const startY = Math.floor(this.cursorY - height / 2);
    const endY = Math.ceil(this.cursorY + height / 2);

    const mapSize = mapTileUpscale * mapGameMapSize * mapSecondTileUpscale;

    // Draw presence of maps.
    const overworldMap = this.mapController.overworldMap;
    for (const overworldTile of overworldMap.tiles.values()) {
      const subregionIdx = allSubRegions.indexOf(overworldTile.type);
      const hsv = getHSV(data.getColorByNameSafe('tile slot back'));
      hsv.h = subregionIdx / allSubRegions.length;
      ctx.fillStyle = constructColorHSV(hsv);

      const x = overworldTile.x - startX / mapSize;
      const y = overworldTile.y - startY / mapSize;
      const size = mapSize * scale;
      ctx.fillRect(x * size, y * size, size, size);
    }

    // Draw tiles.
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const tile = this.mapController.tileAt(x, y);
        if (!tile) continue;
        ctx.fillStyle = data.getColorByNameSafe('tile');
        if (this.inaccessibleTileIs.has(toI(x, y))) {
          ctx.fillStyle = data.getColorByNameSafe('orange');
        }
        if (tile.item && tile.item.contents == Item.Code.Key) {
          ctx.fillStyle = data.getColorByNameSafe('tile over');
        } else if (tile.item && tile.item.contents == Item.Code.Campfire) {
          ctx.fillStyle = data.getColorByNameSafe('green');
        }
        if (this.errorTileIs.has(toI(x, y))) {
          ctx.fillStyle = data.getColorByNameSafe('red');
        }
        if (x == this.cursorX && y == this.cursorY) {
          ctx.fillStyle = data.getColorByNameSafe('tile text');
        }
        ctx.fillRect((x - startX) * scale, (y - startY) * scale, scale, scale);
      }
    }

    // Draw map levels.
    for (const overworldTile of overworldMap.tiles.values()) {
      ctx.fillStyle = data.getColorByNameSafe('tile text');
      gfx.setFont(ctx, 6);
      const x = scale * mapSize * (0.5 + overworldTile.x - startX / mapSize);
      const y = scale * mapSize * (overworldTile.y - startY / mapSize);
      let text = 'lv' + overworldTile.level + ' (' + overworldTile.type + ')';
      const terms = [];
      if (overworldTile.keyId) terms.push('K');
      if (overworldTile.bossMap) terms.push('B');
      if (overworldTile.hasCampfire) terms.push('C');
      if (terms.length > 0) text += ' [' + terms.join(',') + ']';
      text += ' {' + overworldTile.numSecurityLevels + '}';
      gfx.drawText(ctx, x, y, text,
          Graphics.TextAlign.Center, Graphics.TextBaseline.Top);
    }
  }

  /** @param {!Controls} controls */
  input(controls) {
    let xA = 0;
    let yA = 0;
    if (controls.keyPressed(Controls.Key.UP)) {
      yA -= 1;
    } else if (controls.keyPressed(Controls.Key.DOWN)) {
      yA += 1;
    } else if (controls.keyPressed(Controls.Key.LEFT)) {
      xA -= 1;
    } else if (controls.keyPressed(Controls.Key.RIGHT)) {
      xA += 1;
    }
    if (xA == 0 && yA == 0) return;
    const currentGameMap = this.mapController.gameMapAt(
        this.cursorX, this.cursorY);
    if (!currentGameMap) return;
    const x = currentGameMap.overworldX;
    const y = currentGameMap.overworldY;
    const gameMap = this.mapController.gameMaps.get(toI(x + xA, y + yA));
    if (!gameMap) return;
    // Move the cursor to the center-most tile.
    let bestDistance = Infinity;
    const size = mapGameMapSize * mapTileUpscale * mapSecondTileUpscale;
    const centerX = (x + xA + 0.5) * size;
    const centerY = (y + yA + 0.5) * size;
    for (const tile of gameMap.tiles.values()) {
      const distance = calcDistance(tile.x - centerX, tile.y - centerY);
      if (distance >= bestDistance) continue;
      bestDistance = distance;
      this.cursorX = tile.x;
      this.cursorY = tile.y;
    }
  }
}

allDiagnostics.set('Name Picker', () => {
  const allSpecies = data.getCategoryEntriesArray('species') || [];
  for (const type of allSpecies) {
    const species = new Species(type);
    if (!species.fluff) continue;
    for (const gender of [false, true]) {
      console.log((gender ? 'Female ' : 'Male ') + type + ':');
      const nameGenerator = type + (gender ? ' female' : ' male') + ' names';
      for (let i = 0; i < 5; i++) {
        const name = nameGenerate(nameGenerator, defaultRNG());
        console.log('  ' + name);
      }
    }
  }
});

allDiagnostics.set('Random Map Preview', () => {
  const dp = new MapPreviewDiagnosticPlugin();
  game.plugin.switchToPlugin(new LoadingPlugin(dp.generate(false)));
});

allDiagnostics.set('Last Map Viewer', () => {
  const dp = new MapPreviewDiagnosticPlugin();
  game.plugin.switchToPlugin(new LoadingPlugin(dp.generate(true)));
});

allDiagnostics.set('Species Appearance Viewer', () => {
  game.plugin.switchToPlugin(new SpeciesAppearanceViewerPlugin());
});

allDiagnostics.set('Generation Points Diagnostic', () => {
  for (let level = 1; level <= mechMaxLevel; level++) {
    const sample = Creature.makeSamplePlayerAtLevel(level);
    checkCreatureValidity(sample);
    console.log(level + ': ' + sample.generationPoints);
  }
});

allDiagnostics.set('Weapon Diagnostic', () => {
  const allWeapons = data.getCategoryEntriesArray('weapons') || [];
  for (const type of allWeapons) {
    const weapon = new Weapon(type);
    const subtypes = [];
    if (weapon.numSubtypes > 0) {
      for (let i = 0; i < weapon.numSubtypes; i++) subtypes.push(i);
    } else {
      subtypes.push(undefined);
    }
    for (const subtype of subtypes) {
      weapon.subtype = subtype;
      console.log(weapon.name + ' (t' + weapon.tier + '):');

      if (weapon.scaling == Weapon.Scaling.Level || weapon.astraCost == 0) {
        if (!weapon.summon && !weapon.animSound) {
          console.log('  --WARNING: has no attack sound');
        }
        if (!weapon.animStrikeSound) {
          console.log('  --WARNING: has no strike sound');
        }
      }

      // TODO: other diagnostics?
    }
  }
});

allDiagnostics.set('Job Diagnostic', () => {
  const allJobs = data.getCategoryEntriesArray('jobs') || [];
  for (const type of allJobs) {
    console.log(type + ':');
    const job = new Job(type);

    if (!job.fluff && job.proficiencies.length > 0) {
      console.log('  --WARNING: non-player jobs should not have proficiencies');
    }
    if (job.fluff && job.unarmoredDefense) {
      console.log('  --WARNING: player jobs cannot provide unarmoredDefense');
    }

    if (job.fluff) {
      let hasSpecial = false;
      let numTechs = 0;
      for (const proficiency of job.proficiencies) {
        const weapon = new Weapon(proficiency);
        if (weapon.numSubtypes > 0) weapon.subtype = 0;
        checkBonusSourceValidity(weapon);
        if (weapon.usesSpecialPower) hasSpecial = true;
        if (weapon.astraCost > 0) numTechs += 1;
      }
      if (numTechs < 4) {
        console.log('  --WARNING: too few techs! (' + numTechs + ' < 4)');
      } else if (!hasSpecial) {
        console.log('  --WARNING: has no specialPower tech!');
      }
      if (numTechs > 5) {
        console.log('  --WARNING: too many techs! (' + numTechs + ' > 5)');
      }
    }
  }
});

allDiagnostics.set('Bonus Source Diagnostic', () => {
  const creature = new Creature(Creature.Side.Player, 'firin', ['warrior']);

  /**
   * @param {string} category
   * @param {function(string):BonusSource} buildFn
   * @param {function(BonusSource):number} expFn
   * @param {number=} optExpStat
   */
  const check = (category, buildFn, expFn, optExpStat) => {
    console.log(category + ':');
    const allTypes = data.getCategoryEntriesArray(category) || [];
    const check = (type, subtype) => {
      const bS = buildFn(type);
      bS.subtype = subtype;
      console.log('  ' + bS.name + ':');
      const bonusSourceValue = bS.getBonusSourceValue();
      const tolerance = 0.1 + expFn(bS) / 400;
      if (Math.abs(bonusSourceValue - expFn(bS)) > tolerance) {
        console.log('    --WARNING: bonus source value is ' +
                    bonusSourceValue + ' (expected ' + expFn(bS) + ')');
      }
      let statM = 0;
      for (const stat of creature.stats) {
        statM += bS.getStatModifierFor(stat.type);
        if (statM != 0 && optExpStat == undefined) {
          console.log('  --WARNING: should not have stat modifiers');
          break;
        }
      }
      if (optExpStat != undefined && statM != optExpStat) {
        console.log('  --WARNING: total stat modifier is ' + statM +
                    ' (expected ' + optExpStat + ')');
      }
    };
    for (const type of allTypes) {
      const sample = buildFn(type);
      if (sample instanceof Equipment) {
        if (sample.numSubtypes == 0) {
          check(type, undefined);
        } else {
          for (let i = 0; i < sample.numSubtypes; i++) {
            check(type, i);
          }
        }
      } else {
        check(type, undefined);
      }
    }
  };
  check('stats', (type) => new Stat(type, 11, new Species(''), []), (bS) => 4);
  check('species', (type) => new Species(type), (bS) => 10, 0);
  check('jobs', (type) => new Job(type), (bS) => 50, 2);
  check('skills', (type) => new Skill(type), (bS) => 12);
  check('fighting styles', (type) => new FightingStyle(type), (bS) => 25);
  check('armors', (type) => new Armor(type), (bS) => {
    if (!(bS instanceof Armor)) return 0;
    let value = 10;
    value += bS.armorProfiencyLevel * mechArmorProfiencyDefense;
    value += bS.tier * mechPowerPerTier;
    return value * bS.slotMult;
  });
  check('accessories', (type) => new Accessory(type), (bS) => 15);
  check('rings', (type) => new Ring(type), (bS) => 5);
});

allDiagnostics.set('Sound Test', async () => {
  const allSounds = data.getCategoryEntriesArray('sounds') || [];
  for (const sound of allSounds) {
    for (let pitch = -750; pitch <= 750; pitch += 250) {
      console.log('sound=' + sound, 'pitch=' + pitch);
      await audio.play(sound, pitch, 1);
    }
  }
});
