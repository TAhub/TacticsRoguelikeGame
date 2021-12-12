class BonusSource {
  /** @param {string} type */
  constructor(type) {
    this.type = type;
    /** @type {number|undefined} */
    this.subtype = undefined;
  }

  /** @return {string} */
  get category() {
    return '';
  }

  /** @return {number} */
  get numSubtypes() {
    return data.getNumSubtypes(this.category, this.type);
  }

  /**
   * @param {string} name
   * @return {string|null}
   */
  getValue(name) {
    return data.getValue(this.category, this.type, name, this.subtype);
  }

  /**
   * @param {string} name
   * @return {Array.<string>|null}
   */
  getArrayValue(name) {
    return data.getArrayValue(this.category, this.type, name, this.subtype);
  }

  /**
   * @param {string} name
   * @return {?string}
   */
  getColorValue(name) {
    return data.getColorValue(this.category, this.type, name, this.subtype);
  }

  /**
   * @param {string} name
   * @return {number}
   */
  getNumberValue(name) {
    return data.getNumberValue(
        this.category, this.type, name, this.subtype) || 0;
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  getBooleanValue(name) {
    return data.getBooleanValue(this.category, this.type, name, this.subtype);
  }

  /** @return {string} */
  get name() {
    return capitalizeFirstLetterOfEachWord(this.getValue('name') || this.type);
  }

  /** @return {?string} */
  get fluff() {
    return this.getValue('fluff');
  }

  /** @return {number} */
  get powerVsUninjured() {
    return this.getNumberValue('powerVsUninjured');
  }

  /** @return {number} */
  get attackPower() {
    return this.getNumberValue('attackPower');
  }

  /** @return {number} */
  get attackPowerWhenDisengaged() {
    return this.getNumberValue('attackPowerWhenDisengaged');
  }

  /** @return {number} */
  get specialPower() {
    return this.getNumberValue('specialPower');
  }

  /** @return {number} */
  get specialAttackPower() {
    return this.getNumberValue('specialAttackPower');
  }

  /** @return {number} */
  get defense() {
    return this.getNumberValue('defense');
  }

  /** @return {number} */
  get resistance() {
    return this.getNumberValue('resistance');
  }

  /** @return {number} */
  get accuracy() {
    return this.getNumberValue('accuracy');
  }

  /** @return {number} */
  get dodge() {
    return this.getNumberValue('dodge');
  }

  /** @return {number} */
  get dodgeVsDisengage() {
    return this.getNumberValue('dodgeVsDisengage');
  }

  /** @return {number} */
  get hitsToCrits() {
    return this.getNumberValue('hitsToCrits');
  }

  /** @return {number} */
  get life() {
    return this.getNumberValue('life');
  }

  /** @return {number} */
  get astra() {
    return this.getNumberValue('astra');
  }

  /** @return {number} */
  get initiative() {
    return this.getNumberValue('initiative');
  }

  /** @return {number} */
  get moveDistance() {
    return this.getNumberValue('moveDistance');
  }

  /** @return {boolean} */
  get zones() {
    return this.getBooleanValue('zones');
  }

  /** @return {boolean} */
  get halveStatuses() {
    return this.getBooleanValue('halveStatuses');
  }

  /** @return {boolean} */
  get martialArts() {
    return this.getBooleanValue('martialArts');
  }

  /** @return {boolean} */
  get unarmoredDefense() {
    return this.getBooleanValue('unarmoredDefense');
  }

  /** @return {number} */
  getBonusSourceValue() {
    let value = 0;
    value += this.specialAttackPower / 2;
    value += this.attackPower;
    value += this.attackPowerWhenDisengaged / 2;
    value += this.specialPower;
    value += this.powerVsUninjured * 0.75;
    value += this.defense;
    value += this.resistance;
    value += this.accuracy;
    value += this.dodge;
    value += this.dodgeVsDisengage / 3;
    value += this.life;
    value += this.initiative;
    value += this.moveDistance * 8;
    value += this.hitsToCrits * mechHitsToCritsValue;
    value += this.halveStatuses ? 15 : 0;
    value += this.astra;
    value += this.zones ? 9 : 0;
    return value;
  }

  /**
   * @param {string} stat
   * @return {number}
   */
  getStatModifierFor(stat) {
    return this.getNumberValue(stat + 'Modifier');
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {}

  /**
   * @param {!Creature} creature
   * @param {boolean=} optNoFluff
   * @return {!Array.<string>}
   */
  getDescription(creature, optNoFluff) {
    const effects = [];
    this.addCategorySpecificEffectsToDescription(effects, creature);

    // Abilities.
    if (this.martialArts) {
      effects.push(
          'makes unarmed attacks stronger and lets you use them like a weapon');
    }
    if (this.halveStatuses) effects.push('halve effect of status effects');
    if (this.zones) effects.push('allows you to make weak zoning attacks');

    // Numerical values.
    /**
     * @param {number} value
     * @param {string} suffix
     */
    const addFn = (value, suffix) => {
      if (value == 0) return;
      effects.push((value > 0 ? '+' : '') + Math.round(value) + suffix);
    };
    for (const stat of creature.stats) {
      addFn(this.getStatModifierFor(stat.type), ' starting ' + stat.type);
    }
    addFn(this.attackPower, '% attack power');
    addFn(this.attackPowerWhenDisengaged, '% attack power when not engaged');
    addFn(this.specialAttackPower, '% power to zoning and disengage attacks');
    addFn(this.specialPower, '% special power');
    addFn(this.powerVsUninjured, '% bonus power vs uninjured');
    addFn(this.accuracy, '% accuracy');
    addFn(this.defense, '% defense');
    addFn(this.resistance, '% resistance');
    addFn(this.dodge, '% dodge');
    addFn(this.dodgeVsDisengage, '% bonus dodge vs disengage attacks');
    addFn(this.hitsToCrits, '% hits to crits');
    addFn(this.life, '% life');
    addFn(this.astra, '% astra');
    addFn(this.initiative, ' initiative');
    addFn(this.moveDistance, ' move distance');

    const lines = [];
    if (this.fluff && !optNoFluff) {
      lines.push(this.fluff);
    }
    if (effects.length > 0) {
      lines.push(effects.join(', '));
    }
    return lines;
  }
}
