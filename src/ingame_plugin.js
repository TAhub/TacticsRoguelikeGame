class IngamePlugin extends GamePlugin {
  /** @param {Array.<!Creature>=} optPlayers */
  constructor(optPlayers) {
    super();

    this.mapController = new MapController();
    if (saveManager.loadTrue('game')) {
      this.mapController.load();
    } else {
      this.mapController.generateNew(optPlayers || []);
      this.mapController.save();
    }
    this.mapController.reloadMaps();

    this.minimap = new Minimap();
    this.menuController = new MenuController();

    /** @type {?Creature} */
    this.inventoryPlayer;

    this.cursorX = 0;
    this.cursorY = 0;
    this.cursorRealX = 0;
    this.cursorRealY = 0;
    /** @type {?number} */
    this.cameraSpinX;
    /** @type {!Set.<!Creature>} */
    this.highlighted = new Set();
    this.turnStartX = 0;
    this.turnStartY = 0;
    /** @type {?number} */
    this.selectedWeaponI;

    this.maybeTriggerEncounters_();
  }

  /**
   * @return {!Set.<number>}
   * @private
   */
  getEncounterIdsToWake_() {
    const mapC = this.mapController;
    if (mapC.active.side != Creature.Side.Player) return new Set(); // No need.

    const toWake = new Set();
    for (const creature of mapC.creatures) {
      if (toWake.has(creature.encounterId)) continue;
      if (creature.side != Creature.Side.Enemy) continue;

      // Don't bother triggering already-awake creatures, if in combat already.
      if (mapC.inCombat && !creature.encounterId) continue;

      const distance = Math.abs(mapC.active.cX - creature.cX) +
                       Math.abs(mapC.active.cY - creature.cY);
      if (distance > 4) continue;

      if (!creature.hasLOS(mapC.active.cX, mapC.active.cY, mapC)) continue;

      toWake.add(creature.encounterId);
    }
    return toWake;
  }

  /** @private */
  maybeTriggerEncounters_() {
    const idsToWake = this.getEncounterIdsToWake_();
    if (idsToWake.size > 0) {
      for (const creature of this.mapController.creatures) {
        if (!idsToWake.has(creature.encounterId)) continue;
        if (creature.side != Creature.Side.Enemy) continue;
        creature.encounterId = 0;
      }
      if (!this.mapController.inCombat) {
        this.mapController.inCombat = true;
        this.mapController.active = null;
        this.endTurn_();
      }
    }
  }

  /** @private */
  endTurn_() {
    this.selectedWeaponI = null;

    const mapController = this.mapController;
    this.checkBattleOver_();
    if (!mapController.inCombat) return;

    // Deal with overlapping players.
    const inhabitedTiles = new Set();
    for (const creature of mapController.creatures) {
      creature.tileCallback(mapController, creature.x, creature.y, (tile) => {
        if (!tile) return;
        inhabitedTiles.add(tile);
      });
    }
    for (const tile of inhabitedTiles) {
      while (tile.creatures.length > 1) {
        const creature = tile.creatures[1];
        creature.removeFromTiles(mapController);
        mapController.pickNewSpotFor(creature, creature.x, creature.y);
      }
    }

    if (mapController.active) mapController.active.turnEnd();
    while (true) {
      mapController.pickNewActive();
      if (mapController.active) break;
      mapController.turnTaken = new Set();
    }
    mapController.active.turnStart();
    this.turnStartX = mapController.active.x;
    this.turnStartY = mapController.active.y;
    this.menuController.clear();
  }

  /** @private */
  makeUI_() {
    const mapC = this.mapController;
    const active = mapC.active;

    // Make top bar.
    let topBarCreatures = [];
    if (mapC.inCombat) {
      const oldTurnTaken = new Set(mapC.turnTaken);
      topBarCreatures.push(active);
      while (topBarCreatures.length < 6) {
        mapC.pickNewActive();
        if (mapC.active) {
          if (mapC.active.summonAwake) {
            topBarCreatures.push(mapC.active);
          }
        } else {
          mapC.turnTaken = new Set();
        }
      }
      mapC.turnTaken = oldTurnTaken;
      mapC.active = active;
    } else {
      topBarCreatures = mapC.players;
    }
    const minimapSize = mapC.inCombat ? 0 : gfxMinimapSize;
    const topW = (gfxScreenWidth - minimapSize) / topBarCreatures.length;
    const topH = topW / 3;
    for (let i = 0; i < topBarCreatures.length; i++) {
      const player = topBarCreatures[i];
      const spriteCanvas = gfx.makeBuffer();
      spriteCanvas.width = gfxTileSize;
      spriteCanvas.height = gfxTileSize;
      player.draw(gfx.getContext(spriteCanvas));
      const x = gfxScreenWidth - ((topBarCreatures.length - i) * topW);
      const y = 0;
      const attachData = 'order-' + i;
      let mouseOverFn = undefined;
      let mouseOffFn = undefined;
      if (!player.dead) {
        mouseOverFn = () => this.highlighted.add(player);
        mouseOffFn = () => this.highlighted.delete(player);
      }
      const slot = new MenuTileSlot(x, y, topW, topH,
          {attachData, mouseOverFn, mouseOffFn, disabled: player.dead});
      const clickFn = mapC.inCombat ? undefined : () => {
        if (player.side != Creature.Side.Player) return;
        this.inventoryPlayer = this.inventoryPlayer == player ? null : player;
        this.selectedWeaponI = null;
        this.menuController.clear();
      };
      const attachFn = mapC.inCombat ? undefined : (slot) => {
        if (mapC.inCombat) return false; // Cannot re-order in combat!
        if (!slot.attachData) return false;
        const split = slot.attachData.split('-');
        if (split[0] != 'order') return false;
        const j = parseInt(split[1], 10);
        if (j == 0 && player.dead) return false; // Don't make a corpse lead!
        [topBarCreatures[i], topBarCreatures[j]] =
            [topBarCreatures[j], topBarCreatures[i]];
        mapC.active = topBarCreatures[0];
        this.menuController.clear();
        return true;
      };
      const selected = player == this.inventoryPlayer;
      const tileOptions = {clickFn, attachFn, spriteCanvas, selected};
      if (mapC.inCombat) tileOptions.colorSuffix = player.colorSuffix;
      slot.attachTile(new MenuTile(player.name, tileOptions));
      this.menuController.slots.push(slot);
    }

    if (this.inventoryPlayer) {
      this.makeInventoryUI_(topH, this.inventoryPlayer);
    } else if (!mapC.inCombat) {
      this.makeLevelUpUI_(topH);
    }

    // Make bottom bar.
    const bottomBarSlots = 10; // TODO: const?
    for (let i = 0; i < bottomBarSlots; i++) {
      const s = gfxScreenWidth / bottomBarSlots;
      const x = s * i;
      const y = gfxScreenHeight - s;
      // TODO: maybe slots that represent items should be
      // draggable...? how would that work?
      const slot = new MenuTileSlot(x, y, s, s, {});
      if (active.side == Creature.Side.Player) {
        if (i == bottomBarSlots - 2) {
          // Undo move button.
          const x = this.turnStartX;
          const y = this.turnStartY;
          if ((active.x != x || active.y != y) && mapC.inCombat) {
            const clickFn = () => {
              if (mapC.animating) return;
              this.selectedWeaponI = null;
              active.hasMove = true;
              const moves = active.getMoves(mapC);
              active.hasMove = false;
              const moveInfo = moves.get(toI(x, y));
              if (moveInfo) {
                moveInfo.fn();
                active.effectAction(() => {
                  active.hasMove = true;
                  this.menuController.clear();
                });
              } else {
                // Just teleport there.
                active.teleport(x, y, mapC);
                active.hasMove = true;
                this.menuController.clear();
              }
            };
            slot.attachTile(new MenuTile('Undo Move', {clickFn}));
          }
        } else if (i == bottomBarSlots - 1) {
          const tile = mapC.tileAt(active.x, active.y);
          const item = tile ? tile.item : null;
          if (mapC.inCombat) {
            // Skip turn button.
            const clickFn = () => {
              if (mapC.animating) return;
              this.inventoryPlayer = null;
              active.skipTurn();
            };
            const name = active.statuses.has(Weapon.Status.Burning) ?
                'Put Out Fire' : 'Skip Turn';
            slot.attachTile(new MenuTile(name, {clickFn}));
          } else {
            // Talk with NPCs.
            for (let j = 0; j < 4; j++) {
              let x = active.x;
              let y = active.y;
              switch (j) {
                case 0: x -= 1; break;
                case 1: x += 1; break;
                case 2: y -= 1; break;
                case 3: y += 1; break;
              }
              const tile = mapC.tileAt(x, y);
              if (!tile) continue;
              const creature = tile.creatures[0];
              if (!creature || creature.side != Creature.Side.Npc) continue;
              const clickFn = () => creature.talk();
              slot.attachTile(new MenuTile('Talk', {clickFn}));
            }

            // Interact with items.
            if (item && item.contents == Item.Code.Campfire) {
              // It's a rest button instead, out of combat, if over a campfire.
              const clickFn = () => {
                mapC.rest();
                this.inventoryPlayer = null;
                this.mapController.revive();
                this.menuController.clear();
                this.mapController.save();
              };
              slot.attachTile(new MenuTile('Rest', {clickFn}));
            } else if (item && item.canPickUp) {
              // It's a pick up button, if the tile has an item that could be...
              // actually picked up.
              let slotNum = -1;
              for (let i = 0; i < mapC.inventory.length; i++) {
                if (mapC.inventory[i]) continue;
                slotNum = i;
                break;
              }
              let clickFn = () => {};
              const tooltip = item.getDescription(active);
              if (slotNum == -1) {
                slot.disabled = true;
                tooltip.push('WARNING: Cannot pick up! No inventory space!');
              } else {
                clickFn = () => {
                  item.clear3DData();
                  mapC.inventory[slotNum] = tile.item;
                  tile.item = null;
                  this.inventoryPlayer = active;
                  this.menuController.clear();
                  this.minimap.clearBuffer();
                };
              }
              const name = 'Get ' + item.name;
              slot.attachTile(new MenuTile(name, {clickFn, tooltip}));
            }
          }
        } else {
          const usableWeapons = active.usableWeapons;
          const weapon = usableWeapons[i];
          const specialActionI = i - usableWeapons.length;
          if (specialActionI >= 0) {
            let clickFn = () => {};
            const tooltip = [];
            let name = '';

            // Summon special actions.
            const summon = active.currentSummon;
            if (summon && !summon.dead) {
              switch (specialActionI) {
                case 0:
                  clickFn = () => {
                    summon.summonAwake = true;
                    active.hasAction = false;
                    active.hasMove = false;
                    this.menuController.clear();
                  };
                  tooltip.push('Give your summon a command, ' +
                               'letting it move and attack this round.');
                  name = 'Command Summon';
                  break;
                case 1:
                  clickFn = () => {
                    summon.life = 0;
                    this.menuController.clear();
                  };
                  tooltip.push('Deactivate your current summon, ' +
                               'if you want to summon something new.');
                  name = 'Dismiss Summon';
                  break;
              }
            }

            if (name) {
              slot.attachTile(new MenuTile(name, {clickFn, tooltip}));
            }
          }
          if (weapon && (mapC.inCombat || !weapon.helpful || weapon.heals)) {
            // Don't use non-healing helpful actions out of combat. E.g. don't
            // pre-buff before battle.
            const selected = this.selectedWeaponI == i;
            const clickFn = () => {
              if (mapC.animating) return;
              this.inventoryPlayer = null;
              if (selected) {
                this.selectedWeaponI = null;
                if (!mapC.inCombat) {
                  // Clean the players.
                  this.mapController.cleanCreatures();
                }
              } else {
                this.selectedWeaponI = i;
              }
              this.menuController.clear();
            };
            const tooltip = weapon.getDescription(active);
            let name = weapon.name;
            if (weapon.engagementMode) {
              name = 'Engage';
            } else if (active.weapon && weapon.type == active.weapon.type) {
              name = 'Attack';
            }
            slot.attachTile(new MenuTile(name, {clickFn, selected, tooltip}));
          }
        }
      }
      this.menuController.slots.push(slot);
    }
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  respec_(creature) {
    creature.stats = creature.stats.map((stat) => {
      let number = stat.number;
      // Un-apply job bonuses.
      for (const job of creature.jobs) {
        number -= job.getStatModifierFor(stat.type);
      }
      return new Stat(stat.type, number, creature.species, []);
    });
    creature.jobs = [];
    creature.skillPoints += creature.skills.length;
    creature.skills = [];

    // Un-equip all gear that requires a proficiency.
    const unequipped = [];
    if (creature.weapon && !creature.weapon.noProficiency) {
      unequipped.push(creature.weapon);
      creature.weapon = null;
    }
    creature.armors = creature.armors.filter((armor) => {
      if (armor.armorProfiencyLevel == 0) return true;
      unequipped.push(armor);
      return false;
    });
    creature.techTypes = creature.techTypes.filter((type) => {
      const sample = new Weapon(type);
      if (sample.noProficiency) return true;
      unequipped.push(sample);
      return false;
    });
    this.equipCleanUp_(creature);

    // Put the unequipped stuff into the inventory on the floor, as required.
    const mapC = this.mapController;
    for (let i = 0; i < mapC.inventory.length && unequipped.length > 0; i++) {
      if (mapC.inventory[i]) continue;
      mapC.inventory[i] = new Item(unequipped.pop());
    }
    let r = 0;
    while (unequipped.length > 0) {
      const validTiles = [];
      for (let y = creature.y - r; y <= creature.y + r; y++) {
        for (let x = creature.x - r; x <= creature.x + r; x++) {
          const tile = mapC.tileAt(x, y);
          if (!tile || tile.item) continue;
          const distance = Math.abs(x - creature.x) + Math.abs(y - creature.y);
          if (distance != r) continue;
          validTiles.push(tile);
        }
      }
      shuffleArray(validTiles);
      for (const tile of validTiles) {
        tile.item = new Item(unequipped.pop());
        if (unequipped.length == 0) break;
      }
      r += 1;
    }
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  equipCleanUp_(creature) {
    creature.makeAppearance();
    creature.life = Math.min(creature.life, creature.maxLife);
    creature.astra = Math.min(creature.astra, creature.maxAstra);
    creature.makeBar();
  }

  /**
   * @param {number} topH
   * @param {!Creature} creature
   * @private
   */
  makeInventoryUI_(topH, creature) {
    const mapC = this.mapController;
    const active = mapC.active;
    if (!active) return;
    const s = 0.75 * gfxTileSize;

    /**
     * @param {!Item} item
     * @param {function(?Item)} setFn
     * @return {!MenuTile}
     */
    const makeEquipTile = (item, setFn) => {
      const spriteCanvas = item.get2DCanvas();
      const clickFn = () => {
        if (item.contents == Item.Code.Healing) {
          if (creature.life == creature.maxLife) return;
          creature.receiveHealing(item.healingAmount);
          // TODO: poultice sound
          setFn(null);
          this.inventoryPlayer = null;
          this.menuController.clear();
        } else if (item.contents == Item.Code.Respec) {
          if (creature.jobs.length == 0 && creature.skills.length == 0) return;
          setFn(null);
          this.respec_(creature);
          // TODO: respec sound
          this.inventoryPlayer = null;
          this.menuController.clear();
          this.openLevelUpUI_(creature);
        } else if (item.contents == Item.Code.Key) {
          const tile = mapC.tileAt(active.x, active.y);
          if (tile) {
            let used = false;
            for (const doorI of tile.doorIds.keys()) {
              const doorId = tile.doorIds.get(doorI);
              if (doorId != item.keyCode) continue;
              const otherTile = mapC.tileAt(toX(doorI), toY(doorI));
              if (!otherTile) continue;
              tile.doorIds.set(doorI, 0);
              tile.doorFrameIs.add(doorI);
              tile.clear3DData();
              otherTile.doorIds.set(toI(active.x, active.y), 0);
              otherTile.doorFrameIs.add(toI(active.x, active.y));
              otherTile.clear3DData();
              this.minimap.clearBuffer();
              // TODO: unlock door sound effect?
              setFn(null);
              used = true;
              this.inventoryPlayer = null;
              this.menuController.clear();
              break;
            }
            if (!used) {
              for (const doorI of tile.doorIds.keys()) {
                const doorId = tile.doorIds.get(doorI);
                if (doorId == 0) continue;
                // TODO: fail to unlock sound effect
                break;
              }
            }
          }
        } else {
          console.log('TODO: using misc item');
        }
      };
      const attachFn = (slot) => {
        if (!slot.attachData) return false;
        const split = slot.attachData.split('-');
        if (split[0] == 'inv') {
          const j = parseInt(split[1], 10);
          const other = mapC.inventory[j];
          mapC.inventory[j] = item;
          setFn(other);
          this.equipCleanUp_(creature); // In case you un-equipped something.
          this.menuController.clear();
          return true;
        } else if (split[0] == 'eqp') {
          if (!(item.contents instanceof Equipment)) return false;
          if ((item.contents instanceof Weapon)) {
            if (!item.contents.noProficiency) {
              const hasProficiency = creature.jobs.some((job) => {
                return job.proficiencies.includes(item.contents.type);
              });
              if (!hasProficiency) return false;
            }
          }
          if (split[1] == 'tech') {
            if (!(item.contents instanceof Weapon)) return false;
            if (item.contents.astraCost == 0) return false;
            const i = parseInt(split[2], 10);
            const old = creature.techTypes[i];
            creature.techTypes[i] = item.contents.type;
            if (old) {
              setFn(new Item(new Weapon(old)));
            } else {
              setFn(null);
            }
            creature.techTypes = creature.techTypes.filter((t) => t);
            this.menuController.clear();
            return true;
          } else if (split[1] == 'weapon') {
            if (!(item.contents instanceof Weapon)) return false;
            if (item.contents.astraCost > 0) return false;
            if (creature.weapon) {
              setFn(new Item(creature.weapon));
            } else {
              setFn(null);
            }
            creature.weapon = item.contents;
            this.equipCleanUp_(creature);
            this.menuController.clear();
            return true;
          } else if (split[1] == 'ring') {
            if (!(item.contents instanceof Ring)) return false;
            if (creature.ring) {
              setFn(new Item(creature.ring));
            } else {
              setFn(null);
            }
            creature.ring = item.contents;
            this.equipCleanUp_(creature);
            this.menuController.clear();
            return true;
          } else if (split[1] == 'accessory') {
            if (!(item.contents instanceof Accessory)) return false;
            if (creature.accessory) {
              setFn(new Item(creature.accessory));
            } else {
              setFn(null);
            }
            creature.accessory = item.contents;
            this.equipCleanUp_(creature);
            this.menuController.clear();
            return true;
          } else {
            if (!(item.contents instanceof Armor)) return false;
            if (item.contents.slot != split[1]) return false;
            if (item.contents.armorProfiencyLevel >
                creature.armorProfiencyLevel) return false;
            const existing = creature.armors.filter((a) => {
              return a.slot == split[1];
            })[0];
            if (existing) {
              creature.armors = creature.armors.filter((a) => a != existing);
              setFn(new Item(existing));
            } else {
              setFn(null);
            }
            creature.armors.push(item.contents);
            this.equipCleanUp_(creature);
            this.menuController.clear();
            return true;
          }
        }
        return false;
      };
      const tooltip = item.getDescription(creature);
      const textBackground = true;
      return new MenuTile(item.name,
          {clickFn, attachFn, tooltip, spriteCanvas, textBackground});
    };

    // Make inventory slots.
    for (let y = 0; y < mechInventoryHeight; y++) {
      for (let x = 0; x < mechInventoryWidth; x++) {
        const i = y * mechInventoryWidth + x;
        const item = mapC.inventory[i];
        const dX = gfxMinimapSize + s * x;
        const dY = topH + s * y;
        const attachData = 'inv-' + i;
        const slot = new MenuTileSlot(dX, dY, s, s, {attachData});
        if (item) {
          slot.attachTile(makeEquipTile(item, (newItem) => {
            mapC.inventory[i] = newItem;
          }));
        }
        this.menuController.slots.push(slot);
      }
    }

    // Make equipment slots.
    let x = (mechInventoryWidth + 0.5) * s + gfxMinimapSize;
    let y = topH;
    /**
     * @param {?T} current
     * @param {string} attachData
     * @param {string} defaultText
     * @param {function(?T)} setFn
     * @template T
     */
    const addEquipmentSlot = (current, attachData, defaultText, setFn) => {
      const slot = new MenuTileSlot(x, y, s, s, {attachData, defaultText});
      if (current) {
        slot.attachTile(makeEquipTile(new Item(current), (newItem) => {
          setFn(newItem ? newItem.contents : null);
        }));
      }
      this.menuController.slots.push(slot);
      y += s;
    };

    // First column (gear).
    addEquipmentSlot(creature.weapon, 'eqp-weapon', 'Weapon', (g) => {
      creature.weapon = g;
    });
    for (const slot of Armor.allSlots) {
      const current = creature.armors.filter((a) => a.slot == slot)[0];
      const defaultText = capitalizeFirstLetterOfEachWord(slot) + ' Armor';
      addEquipmentSlot(current, 'eqp-' + slot, defaultText, (g) => {
        creature.armors = creature.armors.filter((a) => a != current);
        if (g) creature.armors.push(g);
      });
    }
    addEquipmentSlot(creature.accessory, 'eqp-accessory', 'Accessory', (g) => {
      creature.accessory = g;
    });

    // Reset slot info for the second column.
    x += 1.5 * s;
    y = topH;

    // Second column (techniques).
    addEquipmentSlot(creature.ring, 'eqp-ring', 'Ring', (g) => {
      creature.ring = g;
    });
    for (let i = 0; i < mechNumTechSlots; i++) {
      const current =
          creature.techTypes[i] ? new Weapon(creature.techTypes[i]) : null;
      addEquipmentSlot(current, 'eqp-tech-' + i, 'Technique', (g) => {
        creature.techTypes[i] = g ? g.type : null;
        creature.techTypes = creature.techTypes.filter((t) => t);
      });
      if (!current) break;
    }
  }

  /**
   * @param {Creature=} optFocusPlayer
   * @private
   */
  openLevelUpUI_(optFocusPlayer) {
    const creator = new CharacterCreatorPlugin((players) => {
      this.menuController.clear();
      // In level-up mode, the character creator cannot actually
      // REPLACE any players, so no need to use the "players" arg.
      return this;
    }, this.mapController.players, optFocusPlayer);
    this.switchToPlugin(creator);
  }

  /**
   * @param {number} topH
   * @private
   */
  makeLevelUpUI_(topH) {
    const w = gfxTileSize;
    const h = w / 2;
    const name = this.mapController.players.some((pl) => {
      return pl.statPoints > 0 || pl.skillPoints > 0;
    }) ? 'Level Up' : 'Stats';
    const clickFn = () => this.openLevelUpUI_();
    const slot = new MenuTileSlot(gfxScreenWidth - w, topH, w, h);
    slot.attachTile(new MenuTile(name, {clickFn}));
    this.menuController.slots.push(slot);
  }

  /** @param {number} elapsed */
  update(elapsed) {
    const mapController = this.mapController;

    mapController.update(elapsed);

    // Update selected tiles.
    for (const gameMap of mapController.gameMaps.values()) {
      for (const tile of gameMap.tiles.values()) {
        tile.setCursorColor(null);
      }
    }
    if (mapController.active.side == Creature.Side.Player &&
        !mapController.animating) {
      if (mapController.inCombat || this.selectedWeapon) {
        let actions;
        if (this.selectedWeapon) {
          actions = mapController.active.getAttacks(
              mapController, this.selectedWeapon);
        } else {
          actions = mapController.active.getMoves(mapController);
        }
        for (const action of actions.values()) {
          const tile = mapController.tileAt(action.x, action.y);
          if (tile) tile.setCursorColor(data.getColorByNameSafe('tile'));
        }
      }
      const tileOver = mapController.tileAt(this.cursorX, this.cursorY);
      if (tileOver) {
        tileOver.setCursorColor(data.getColorByNameSafe('tile over'));
      }
      for (const cr of this.highlighted) {
        const colorName = 'tile over' + cr.colorSuffix;
        const color = data.getColorByNameSafe(colorName);
        cr.tileCallback(this.mapController, cr.x, cr.y, (tile) => {
          if (tile) tile.setCursorColor(color);
        });
      }
    }

    if (mapController.inCombat) {
      const active = mapController.active;
      if (active && ((!active.hasAction && !active.hasMove) || active.dead)) {
        if (!mapController.animating) this.endTurn_();
      } else if (active && active.side == Creature.Side.Enemy) {
        if (!mapController.animating) AI.aiDecision(this.mapController);
      }
    }
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @private
   */
  drawCombatTooltip_(ctx) {
    const mapC = this.mapController;
    const active = mapC.active;
    const tooltip = [];

    let willBreakEngagement = false;
    let numZoningAttacks = 0;
    if (this.selectedWeapon) {
      const weapon = this.selectedWeapon;
      const tile = mapC.tileAt(this.cursorX, this.cursorY);
      if (!tile) return;
      const target = tile.creatures[0];
      if (!target) return;
      const attacks = active.getAttacks(mapC, weapon);
      const attack = attacks.get(toI(this.cursorX, this.cursorY));
      if (!attack) return;
      willBreakEngagement = attack.willBreakEngagement;
      const est = active.getAttackEstimate(
          target, weapon, Creature.HitResult.Hit, Creature.AttackType.Normal);

      // Add the effects line.
      const effects = [];
      effects.push(Math.floor(est.mult * weapon.damage / 100) +
                   ' ' + weapon.damageTerm);
      for (const status of Weapon.allStatuses) {
        const effect = weapon.getStatus(status);
        if (!effect) continue;
        effects.push(Math.floor(est.mult * effect / 100) + ' ' + status);
      }
      if (weapon.engagementMode) effects.push('engages');
      tooltip.push(effects.join(', '));

      // Add the chances line.
      const chances = [];
      /**
       * @param {!Creature.HitResult} hitResult
       * @param {string} suffix
       */
      const addChance = (hitResult, suffix) => {
        const chance = est.chances.get(hitResult);
        if (!chance) return;
        chances.push(chance + suffix);
      };
      addChance(Creature.HitResult.Graze, '% graze');
      addChance(Creature.HitResult.Hit, '% hit');
      addChance(Creature.HitResult.Crit, '% crit');
      tooltip.push(chances.join(', '));
    } else if (mapC.inCombat) {
      const moves = active.getMoves(mapC);
      const move = moves.get(toI(this.cursorX, this.cursorY));
      if (!move) return;
      willBreakEngagement = move.willBreakEngagement;
      numZoningAttacks = move.zoningAttacks.size;

      // TODO: any move tooltip info?
    }
    if (willBreakEngagement) {
      tooltip.push('WARNING: this will break your engagement, and give your ' +
                   'opponent a free attack');
    }
    if (numZoningAttacks > 0) {
      tooltip.push('WARNING: this will trigger ' + numZoningAttacks +
                   ' zoning attacks');
    }

    // Draw the tooltip.
    const x = this.cursorRealX;
    const y = this.cursorRealY;
    MenuTile.drawArbitrary2DTooltip(ctx, x, y, tooltip);
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    if (!this.mapController.inCombat) {
      this.minimap.draw(ctx, this.mapController,
          0, 0, gfxMinimapSize, gfxMinimapSize);
    }
    if (this.menuController.slots.length == 0) this.makeUI_();
    this.menuController.draw2D(ctx);
    this.drawCombatTooltip_(ctx);
  }

  /**
   * @param {!THREE.Scene} scene
   * @param {!THREE.PerspectiveCamera} camera
   */
  draw3D(scene, camera) {
    this.mapController.draw(scene, camera);
  }

  /** @private */
  checkBattleOver_() {
    const mapController = this.mapController;
    const playersAlive = mapController.players.some((cr) => !cr.dead);
    if (!playersAlive) {
      // TODO: navigate to a game-over screen
      return;
    }
    if (!mapController.inCombat) return;
    const enemiesAlive = mapController.creatures.some((cr) => {
      return !cr.dead && cr.side == Creature.Side.Enemy && !cr.encounterId;
    });
    if (!enemiesAlive) {
      // Combat over!
      mapController.inCombat = false;
      mapController.cleanCreatures();
      mapController.active = mapController.players[0];
      this.menuController.clear();
    }
  }

  /** @return {?Weapon} */
  get selectedWeapon() {
    if (this.selectedWeaponI == null) return null;
    return this.mapController.active.usableWeapons[this.selectedWeaponI];
  }

  /** @private */
  move_() {
    const mapC = this.mapController;
    const active = mapC.active;

    // If multiple people are moving, only do post-move checks once every one of
    // them has moved.
    const movesInProgress = new Set();
    const registerPostMoveCheckTo = (creature) => {
      movesInProgress.add(creature);
      creature.effectAction(() => {
        movesInProgress.delete(creature);
        if (movesInProgress.size == 0) {
          mapC.reloadMaps();
          this.maybeTriggerEncounters_();
          this.checkBattleOver_();
          this.menuController.clear();
        }
      });
    };

    const moveInfos = active.getMoves(mapC);
    let moveInfo = moveInfos.get(toI(this.cursorX, this.cursorY));
    if (!moveInfo) return;

    // Out of combat, end moves early if they will trigger an encounter.
    if (!mapC.inCombat) {
      const [oldX, oldY] = [active.x, active.y];
      let shouldStop = false;
      for (const i of moveInfo.path) {
        if (!shouldStop) {
          [active.x, active.y] = [toX(i), toY(i)];
          shouldStop = this.getEncounterIdsToWake_().size > 0;
        }
        if (!shouldStop) continue;

        // If "shouldStop" has been set, stop as soon as you have a clear path.
        const newMoveInfo = moveInfos.get(i);
        if (!newMoveInfo) continue; // Whoops, can't stop here. Keep going!
        // Move here instead.
        moveInfo = newMoveInfo;
        break;
      }
      [active.x, active.y] = [oldX, oldY];
    }

    // Move to that spot!
    moveInfo.fn();
    registerPostMoveCheckTo(active);

    // Out of combat, other party members follow the active player.
    if (!mapC.inCombat) {
      const followPath = [toI(active.x, active.y)].concat(moveInfo.path);
      const reservedI = [followPath.pop()];
      for (const player of mapC.players) {
        if (player.dead || player == active) continue;

        const moveInfos = player.getMoves(mapC);
        let moveInfo = moveInfos.get(followPath.pop());
        const followI = reservedI[reservedI.length - 1];
        const followX = toX(followI);
        const followY = toY(followI);
        if (!moveInfo) {
          // If you can't follow exactly, stand next to the last person in line.
          let bestValue = -Infinity;
          for (const info of moveInfos.values()) {
            const distance = Math.abs(info.x - followX) +
                             Math.abs(info.y - followY);
            const value = -(info.path.length + 10 * distance);
            if (value <= bestValue) continue;
            if (reservedI.includes(toI(info.x, info.y))) continue;
            bestValue = value;
            moveInfo = info;
          }
        }
        if (moveInfo) {
          reservedI.push(toI(moveInfo.x, moveInfo.y));
          moveInfo.fn();
          registerPostMoveCheckTo(player);
        } else {
          // Just teleport next to someone.
          player.removeFromTiles(mapC);
          if (!mapC.pickNewSpotFor(player, followX, followY)) {
            // It failed to find anywhere! So return to the old position.
            player.addToTiles(mapC);
          }
          reservedI.push(toI(player.x, player.y));
        }
      }
    }
  }

  /** @param {!Controls} controls */
  input(controls) {
    this.cursorRealX = controls.mouseX;
    this.cursorRealY = controls.mouseY;
    if (this.menuController.slots.length == 0) this.makeUI_();
    this.menuController.input(controls);
    if (this.menuController.heldTile) return; // Block all input!
    if (this.inventoryPlayer) return; // Also block input.

    if (controls.rightMousePressed > 0) {
      if (this.cameraSpinX != null) {
        const diff = controls.mouseX - this.cameraSpinX;
        this.mapController.cameraAngle += diff * 4 * Math.PI / gfxScreenWidth;
        this.mapController.cameraAngle =
            normalizeAngle(this.mapController.cameraAngle);
      }
      this.cameraSpinX = controls.mouseX;
    } else {
      this.cameraSpinX = null;
    }

    if (this.menuController.slotOver) return; // Block all non-spin input!
    const active = this.mapController.active;
    if (!active || active.side != Creature.Side.Player) return;
    if (this.mapController.animating) return;

    let tileOver;
    for (const tile of this.mapController.visibleTiles) {
      if (!tile.pointInScreenSpace(controls.mouseX, controls.mouseY)) continue;
      tileOver = tile;
      break;
    }

    this.cursorX = 0;
    this.cursorY = 0;
    if (tileOver) {
      this.cursorX = tileOver.x;
      this.cursorY = tileOver.y;
      if (controls.mousePressed == 2) {
        if (this.selectedWeapon) {
          const attackInfos = active.getAttacks(
              this.mapController, this.selectedWeapon);
          const attackInfo = attackInfos.get(toI(this.cursorX, this.cursorY));
          if (attackInfo) {
            attackInfo.fn();
            active.effectAction(() => {
              if (!this.mapController.inCombat) {
                // Clean the players.
                this.mapController.cleanCreatures();
              }
              this.selectedWeaponI = null;
              this.menuController.clear();
            });
          }
        } else {
          this.move_();
        }
      }
    }
  }
}
