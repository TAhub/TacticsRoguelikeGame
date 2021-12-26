class Level extends BonusSource {
  /** @return {string} */
  get category() {
    return ''; // Does not actually get any data!
  }

  /** @return {number} */
  get number() {
    return parseInt(this.type, 10);
  }

  /** @return {number} */
  get tier() {
    return tierForLevel(this.number);
  }

  /** @return {number} */
  get tierSmth() {
    return tierForLevelSmth(this.number);
  }

  /** @return {number} */
  get scalingBonus() {
    return Math.floor(this.tierSmth * mechPowerPerTier);
  }

  /** @return {number} */
  get attackPower() {
    return this.scalingBonus;
  }

  /** @return {number} */
  get specialPower() {
    return this.scalingBonus;
  }

  /** @return {number} */
  get resistance() {
    return this.scalingBonus;
  }

  /** @return {number} */
  get accuracy() {
    return this.scalingBonus;
  }

  /** @return {number} */
  get dodge() {
    return this.scalingBonus;
  }

  /** @return {number} */
  get initiative() {
    return this.scalingBonus;
  }

  /**
   * @param {number} level
   * @return {number}
   */
  static numSkillPointsAtLevel(level) {
    return 1 + Math.floor(level / mechLevelsPerSkill);
  }

  /**
   * @param {number} level
   * @return {!Stat}
   */
  static scaledStatForLevel(level) {
    const numStatPoints = (level - this.numSkillPointsAtLevel(level) - 1) / 4;
    return new Stat('physique', 10 + numStatPoints, new Species(''), []);
  }

  /** @return {number} */
  get scalingDefenseValue() {
    let defense = this.scalingBonus;
    defense += Level.scaledStatForLevel(this.number).attackPower;
    const numSkillPoints = Level.numSkillPointsAtLevel(this.number);
    const skill = new Skill('enemy');
    defense += skill.defense * numSkillPoints;
    return Math.floor(defense);
  }

  /** @return {number} */
  get lifeMultiplier() {
    let tier = this.tierSmth;
    // Life should jump up some when you reach a tier.
    tier = Math.floor(tier) + (tier % 1) * 0.6;
    return multForTier(tier);
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {
    super.addCategorySpecificEffectsToDescription(effects, creature);
    const baseLife = Math.floor(mechBaseLife * this.lifeMultiplier);
    effects.push(baseLife + ' base life');
  }
}
