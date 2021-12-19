/**
 * @typedef {{
 *   sampleFn: (function(string):?BonusSource),
 *   clickFn: (function(string)),
 *   selected: (Array.<string>|undefined),
 *   nameFn: ((function(string):string)|undefined),
 *   disabledReasonFn: ((function(string):?string)|undefined),
 * }}
 */
let CharacterCreatorGenericPickerOptions;

/**
 * @typedef {{
 *   statPoints: number,
 *   skillPoints: number,
 *   stats: !Array.<!Stat>,
 *   skills: !Array.<!Skill>,
 * }}
 */
let CharacterCreatorResetValues;

class CharacterCreatorPlugin extends GamePlugin {
  /**
   * @param {function(!Array.<!Creature>):!GamePlugin} getNextPluginFn
   * @param {Array.<!Creature>=} optPlayersToLevelUp
   */
  constructor(getNextPluginFn, optPlayersToLevelUp) {
    super();

    this.getNextPluginFn = getNextPluginFn;
    this.levelUpMode = !!optPlayersToLevelUp;

    /** @type {!Map.<!Creature, !Map.<string, number>>} */
    this.arrayValuesMap = new Map();
    /** @type {!Array.<!Creature>} */
    this.players = optPlayersToLevelUp || [];
    if (!optPlayersToLevelUp) {
      for (let i = 0; i < mechNumPlayers; i++) {
        this.players.push(this.makeBasePlayer_('firin', null, false));
      }
    }
    /** @type {!Array.<CharacterCreatorResetValues>} */
    this.resetValues = [];
    for (const player of this.players) {
      this.resetValues.push(this.resetValuesFor_(player));
    }
    this.menuController = new MenuController();
    this.selectedCreature = this.players[0];
    this.appearanceMode = false;
    this.remakeUI_();
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  updateStatArray_(creature) {
    if (!this.arrayValuesMap.get(creature)) {
      const map = new Map();
      const remaining = [9, 10, 10, 11, 12];
      for (const stat of creature.stats) {
        map.set(stat.type, remaining.pop());
      }
      this.arrayValuesMap.set(creature, map);
    }
    const arrayValues = this.arrayValuesMap.get(creature);
    for (const stat of creature.stats) {
      stat.number = arrayValues.get(stat.type);
      stat.number += creature.species.getStatModifierFor(stat.type);
      for (const job of creature.jobs) {
        stat.number += job.getStatModifierFor(stat.type);
      }
    }
    this.applyResetValuesFor_(creature, false, true);
  }

  /** @private */
  remakeUI_() {
    this.menuController.clear();

    const pSize = 1.5;
    for (let i = 0; i < this.players.length; i++) {
      const creature = this.players[i];
      const slot = new MenuTileSlot(i * pSize, 0, pSize, pSize);
      const clickFn = () => {
        this.appearanceMode = false;
        this.selectedCreature = creature;
        this.remakeUI_();
      };
      const selected = creature == this.selectedCreature;
      const spriteCanvas = gfx.makeBuffer();
      spriteCanvas.width = gfxTileSize;
      spriteCanvas.height = gfxTileSize;
      creature.draw(gfx.getContext(spriteCanvas));
      slot.attachTile(new MenuTile(creature.name,
          {clickFn, selected, spriteCanvas}));
      this.menuController.slots.push(slot);
    }

    const doneClickFn = () => {
      if (!this.levelUpMode) {
        // Get rid of this starting gear! And refill everyone too...
        for (const player of this.players) {
          player.armors = [];
          player.weapon = null;
          player.accessory = null;
          player.makeAppearance();
          player.refill();
        }
      }
      this.switchToPlugin(this.getNextPluginFn(this.players));
    };
    const doneSlot = new MenuTileSlot(this.players.length * pSize, 0, 1, 1);
    doneSlot.attachTile(new MenuTile('Done', {clickFn: doneClickFn}));
    this.menuController.slots.push(doneSlot);

    const creature = /** @type {!Creature} */ (this.selectedCreature);
    let startX = 0;
    const headerHeight = 0.5;
    /**
     * @param {string} header
     * @param {function()} wrappedFn
     * @param {(function())=} optClickFn
     */
    const headerWrapper = (header, wrappedFn, optClickFn) => {
      // TODO: header appearance modifier?
      const startXBefore = startX;
      wrappedFn();
      const slot = new MenuTileSlot(
          startXBefore, pSize, startX - startXBefore, headerHeight);
      slot.attachTile(new MenuTile(header, {clickFn: optClickFn}));
      this.menuController.slots.push(slot);
    };

    if (this.appearanceMode) {
      headerWrapper('Gender', () => {
        startX = this.addGenderPicker_(creature, startX, pSize + headerHeight);
      });

      headerWrapper('Coloration', () => {
        startX = this.addColorationPicker_(
            creature, startX, pSize + headerHeight);
      });

      headerWrapper('Hairstyles', () => {
        startX = this.addHairstylePicker_(
            creature, startX, pSize + headerHeight);
      });
    } else {
      if (this.levelUpMode) {
        headerWrapper('Overview', () => {
          startX = this.addOverview_(creature, startX, pSize + headerHeight);
        });

        if (creature.jobs.length < creature.desiredNumJobs) {
          const header = creature.jobs.length == 0 ? 'First Job' : 'Second Job';
          headerWrapper(header, () => {
            startX = this.addJobPicker_(creature, startX, pSize + headerHeight);
          });
        }

        let statHeaderName = 'Stats';
        if (creature.statPoints > 0) {
          statHeaderName += ' (' + creature.statPoints + ' points)';
        }
        headerWrapper(statHeaderName, () => {
          startX = this.addStatPicker_(creature, startX, pSize + headerHeight);
        }, () => {
          this.applyResetValuesFor_(creature, true, true);
          this.remakeUI_();
        });
      } else {
        headerWrapper('Species', () => {
          startX = this.addSpeciesPicker_(
              creature, startX, pSize + headerHeight);
        });

        headerWrapper('Job', () => {
          startX = this.addJobPicker_(creature, startX, pSize + headerHeight);
        });

        headerWrapper('Stats', () => {
          startX = this.addStatArrayPicker_(
              creature, startX, pSize + headerHeight);
        });
      }

      if (creature.skillPoints > 0 || creature.skills.length > 0) {
        let skillHeaderName = 'Skills';
        if (creature.skillPoints > 0) {
          skillHeaderName += ' (' + creature.skillPoints + ' points)';
        }
        headerWrapper(skillHeaderName, () => {
          startX = this.addSkillPicker_(creature, startX, pSize + headerHeight);
        }, () => {
          this.applyResetValuesFor_(creature, false, true);
          this.remakeUI_();
        });
      }
    }

    if (!this.levelUpMode) {
      let startY = pSize + headerHeight;
      for (const appearanceMode of [false, true]) {
        const slot = new MenuTileSlot(startX, startY, 1, 1);
        const name = appearanceMode ? 'Appearance' : 'Stats';
        const clickFn = () => {
          this.appearanceMode = appearanceMode;
          this.remakeUI_();
        };
        const selected = appearanceMode == this.appearanceMode;
        slot.attachTile(new MenuTile(name, {clickFn, selected}));
        this.menuController.slots.push(slot);
        startY += 1;
      }
    }

    this.menuController.resizeToFit(gfxScreenWidth, gfxScreenHeight);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /**
   * @param {!Array.<!{
   *   selected: (boolean|undefined),
   *   name: string,
   *   tooltip: (Array.<string>|undefined),
   *   disabled: (boolean|undefined),
   *   clickFn: ((function())|undefined),
   * }>} items
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addGenericItems_(items, startX, startY) {
    while (items.length > 0) {
      let y = startY;
      for (let i = 0; i < 5 && items.length > 0; i++) {
        const item = items.shift();
        const name = item.name;
        const tooltip = item.tooltip;
        const slotOptions = {};
        if (item.disabled) slotOptions.disabled = true;
        const clickFn = item.clickFn;
        const selected = item.selected;
        const slot = new MenuTileSlot(startX, y, 1, 1, slotOptions);
        slot.attachTile(new MenuTile(name, {clickFn, selected, tooltip}));
        this.menuController.slots.push(slot);
        y += 1;
      }
      startX += 1;
    }
    return startX;
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @param {string} category
   * @param {!CharacterCreatorGenericPickerOptions} options
   * @return {number} startX
   * @private
   */
  addGenericPicker_(creature, startX, startY, category, options) {
    const allTypes = data.getCategoryEntriesArray(category) || [];
    const allSamples = allTypes.map(options.sampleFn).filter((sample) => {
      return sample && sample.fluff;
    });
    const items = [];
    while (allSamples.length > 0) {
      const sample = allSamples.shift();
      if (!sample.fluff) continue;
      let name = sample.name;
      if (options.nameFn) {
        name = options.nameFn(sample.type);
      }
      let tooltip = sample.getDescription(creature);
      let disabled = false;
      if (options.disabledReasonFn) {
        const reason = options.disabledReasonFn(sample.type);
        if (reason) {
          tooltip = [reason];
          disabled = true;
        }
      }
      const selected =
          !!options.selected && options.selected.includes(sample.type);
      const clickFn = () => options.clickFn(sample.type);
      items.push({name, selected, clickFn, tooltip, disabled});
    }
    return this.addGenericItems_(items, startX, startY);
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addColorationPicker_(creature, startX, startY) {
    const oldColoration = creature.species.coloration;
    const items = [];
    for (let i = 0; ; i += 1) {
      creature.species.coloration = i;
      const name = creature.species.colorationName;
      const fluff = creature.species.colorationFluff;
      if (!name || !fluff) break;
      const selected = i == oldColoration;
      const tooltip = [fluff];
      const clickFn = () => {
        creature.species.coloration = i;
        creature.makeAppearance();
        this.remakeUI_();
      };
      items.push({name, selected, clickFn, tooltip});
    }
    creature.species.coloration = oldColoration;
    return this.addGenericItems_(items, startX, startY);
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addOverview_(creature, startX, startY) {
    const items = [];
    const addItem = (name, tooltip) => items.push({name, tooltip});
    addItem('Level ' + creature.level,
        creature.levelObj.getDescription(creature));
    addItem(creature.species.name, creature.species.getDescription(creature));
    for (const job of creature.jobs) {
      addItem(job.name, job.getDescription(creature));
    }
    return this.addGenericItems_(items, startX, startY);
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addGenderPicker_(creature, startX, startY) {
    const items = [];
    for (const gender of [false, true]) {
      const name = gender ? 'Female' : 'Male';
      const selected = gender == creature.species.gender;
      const clickFn = () => {
        creature.species.gender = gender;
        this.pickNameFor_(creature);
        this.pickCosmeticShowGearFor_(creature);
        creature.makeAppearance();
        this.remakeUI_();
      };
      items.push({name, selected, clickFn});
    }
    return this.addGenericItems_(items, startX, startY);
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addSpeciesPicker_(creature, startX, startY) {
    const sampleFn = (type) => new Species(type);
    const clickFn = (type) => {
      const idx = this.players.indexOf(creature);
      this.selectedCreature = this.makeBasePlayer_(type, null, false);
      this.players[idx] = this.selectedCreature;
      this.resetValues[idx] = this.resetValuesFor_(this.selectedCreature);
      this.remakeUI_();
    };
    const selected = [creature.species.type];
    return this.addGenericPicker_(creature, startX, startY, 'species',
        {sampleFn, clickFn, selected});
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addHairstylePicker_(creature, startX, startY) {
    const sampleFn = (type) => new Hairstyle(type);
    const clickFn = (type) => {
      this.selectedCreature.species.hairstyle.type = type;
      this.remakeUI_();
    };
    const selected = [creature.species.hairstyle.type];
    return this.addGenericPicker_(creature, startX, startY, 'hairstyles',
        {sampleFn, clickFn, selected});
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addStatPicker_(creature, startX, startY) {
    const items = [];
    for (const stat of creature.stats) {
      const name = stat.name + ': ' + stat.number + '/' + stat.maxNumber;
      const tooltip = stat.getDescription(creature);
      const clickFn = () => {
        if (creature.statPoints <= 0) return;
        if (stat.number >= stat.maxNumber) return;
        stat.number += 1;
        creature.statPoints -= 1;
        this.remakeUI_();
      };
      items.push({name, clickFn, tooltip});
    }
    return this.addGenericItems_(items, startX, startY);
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addJobPicker_(creature, startX, startY) {
    const sampleFn = (type) => {
      const job = new Job(type);
      if (job.reqSpecies) {
        if (!job.reqSpecies.includes(creature.species.type)) return null;
      }
      if (this.levelUpMode) {
        if (creature.jobs.some((job) => job.type == type)) return null;
      }
      return job;
    };
    const clickFn = (type) => {
      if (creature.jobs.some((job) => job.type == type)) return;
      const latestI = creature.jobs.length - 1;
      if (creature.jobs.length < creature.desiredNumJobs) {
        creature.jobs.push(new Job(type));
      } else {
        creature.jobs[latestI].type = type;
        if (!this.levelUpMode) {
          this.pickCosmeticShowGearFor_(creature);
        }
      }
      if (this.levelUpMode) {
        creature.stats = creature.stats.map((stat) => {
          const bonus = creature.jobs[latestI].getStatModifierFor(stat.type);
          return new Stat(
              stat.type, stat.number + bonus, creature.species, creature.jobs);
        });
      } else {
        this.updateStatArray_(creature);
      }
      this.remakeUI_();
    };
    const selected = creature.jobs.map((t) => t.type);
    return this.addGenericPicker_(creature, startX, startY, 'jobs',
        {sampleFn, clickFn, selected});
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addSkillPicker_(creature, startX, startY) {
    const sampleFn = (type) => {
      const skill = new Skill(type);
      if (skill.prereq) {
        if (!creature.skills.some((t) => t.type == skill.prereq)) return null;
      }
      if (skill.reqSpecies) {
        if (skill.reqSpecies != creature.species.type) return null;
      }
      return skill;
    };
    const clickFn = (type) => {
      if (creature.skillPoints <= 0) return;
      if (creature.skills.some((t) => t.type == type)) return;
      const skill = sampleFn(type);
      for (const stat of creature.stats) {
        const req = skill.getStatRequirementFor(stat.type);
        if (req > stat.number) return;
      }
      creature.skillPoints -= 1;
      creature.skills.push(skill);
      this.remakeUI_();
    };
    const selected = creature.skills.map((t) => t.type);
    return this.addGenericPicker_(creature, startX, startY, 'skills',
        {sampleFn, clickFn, selected});
  }

  /**
   * @param {!Creature} creature
   * @param {number} startX
   * @param {number} startY
   * @return {number} startX
   * @private
   */
  addStatArrayPicker_(creature, startX, startY) {
    for (let i = 0; i < creature.stats.length; i++) {
      const stat = creature.stats[i];
      const attachData = stat.type;
      const arraySlot = new MenuTileSlot(
          startX, startY + i, 1, 1, {attachData});
      const arrayValues = this.arrayValuesMap.get(creature);
      const arrayValue = arrayValues.get(stat.type);
      const clickFn = undefined;
      const attachFn = (slot) => {
        const otherStatType = slot.attachData;
        const otherArrayValue = arrayValues.get(otherStatType);
        arrayValues.set(otherStatType, arrayValue);
        arrayValues.set(stat.type, otherArrayValue);
        this.updateStatArray_(creature);
        this.remakeUI_();
        return true;
      };
      const statTooltip = ['Right click and drag to assign this stat!'];
      arraySlot.attachTile(new MenuTile(
          '' + arrayValue, {clickFn, attachFn, tooltip: statTooltip}));
      this.menuController.slots.push(arraySlot);
      const finalSlot = new MenuTileSlot(startX + 1, startY + i, 1, 1);
      let modifier = '';
      if (stat.number >= arrayValue) {
        modifier = '+ ' + (stat.number - arrayValue);
      } else {
        modifier = '- ' + (arrayValue - stat.number);
      }
      const statName = modifier + ' = ' + stat.number + ' ' + stat.type;
      const tooltip = stat.getDescription(creature);
      finalSlot.attachTile(new MenuTile(statName, {tooltip}));
      this.menuController.slots.push(finalSlot);
    }
    return startX + 2;
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  pickNameFor_(creature) {
    const nameGenerator = creature.species.type +
        (creature.species.gender ? ' female' : ' male') + ' names';
    creature.name = nameGenerate(nameGenerator, defaultRNG());
  }

  /**
   * @param {!Creature} creature
   * @private
   */
  pickCosmeticShowGearFor_(creature) {
    for (const type of creature.jobs[0].proficiencies) {
      creature.weapon = new Weapon(type + ':0');
      if (creature.weapon.astraCost == 0) break;
    }
    if (creature.weapon.astraCost > 0) creature.weapon = null;
    creature.armors = [];
    switch (creature.jobs[0].armorProfiencyLevel) {
      case 0:
        creature.armors.push(new Armor('shirt:0'));
        const pantsType = creature.species.gender ? 'skirt:0' : 'pants:0';
        creature.armors.push(new Armor(pantsType));
        break;
      case 1:
        creature.armors.push(new Armor('jerkin:0'));
        creature.armors.push(new Armor('leggings:0'));
        break;
      case 2:
        creature.armors.push(new Armor('breastplate:0'));
        creature.armors.push(new Armor('greaves:0'));
        break;
    }
  }

  /**
   * @param {!Creature} creature
   * @param {boolean} forStats
   * @param {boolean} forSkills
   * @private
   */
  applyResetValuesFor_(creature, forStats, forSkills) {
    const idx = this.players.indexOf(this.selectedCreature);
    if (idx == -1) return;
    const resetValue = this.resetValues[idx];
    if (forStats) {
      creature.statPoints = resetValue.statPoints;
      creature.stats = resetValue.stats.map((stat) => {
        return new Stat(
            stat.type, stat.number, creature.species, creature.jobs);
      });
    }
    if (forSkills) {
      creature.skillPoints = resetValue.skillPoints;
      creature.skills = resetValue.skills.slice();
    }
  }

  /**
   * @param {!Creature} creature
   * @return {!CharacterCreatorResetValues}
   * @private
   */
  resetValuesFor_(creature) {
    const statPoints = creature.statPoints;
    const skillPoints = creature.skillPoints;
    const stats = creature.stats.map((stat) => {
      return new Stat(stat.type, stat.number, creature.species, creature.jobs);
    });
    const skills = creature.skills.slice();
    return {statPoints, skillPoints, stats, skills};
  }

  /**
   * @param {string} species
   * @param {?string} job
   * @param {boolean} gender
   * @return {!Creature}
   * @private
   */
  makeBasePlayer_(species, job, gender) {
    if (!job) {
      const allJobs = data.getCategoryEntriesArray('jobs') || [];
      for (const type of allJobs) {
        const sample = new Job(type);
        if (!sample.fluff) continue;
        if (!sample.reqSpecies.includes(species)) continue;
        job = type;
        break;
      }
    }

    const creature = new Creature(true, species, [job]);
    creature.species.gender = gender;
    creature.species.hairstyle.type = 'short';
    this.pickNameFor_(creature);
    this.pickCosmeticShowGearFor_(creature);
    this.updateStatArray_(creature);

    creature.makeAppearance();
    return creature;
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    ctx.save();
    const scale = 2 * this.selectedCreature.appearanceSizeMult;
    ctx.translate(-gfxTileSize * scale / 6, 0);
    ctx.scale(scale, scale);
    this.selectedCreature.draw(ctx);
    ctx.restore();
    this.menuController.draw2D(ctx);
  }

  /** @param {!Controls} controls */
  input(controls) {
    this.menuController.input(controls);
  }
}
