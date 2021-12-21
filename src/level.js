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

  /** @return {number} */
  get scalingDefenseValue() {
    const numSkillPoints = 1 + Math.floor(this.number / mechLevelsPerSkill);
    const numStatPoints = (this.number - numSkillPoints - 1 ) / 4;
    let defense = this.scalingBonus;
    const scaledStat =
        new Stat('physique', 10 + numStatPoints, new Species(''), []);
    defense += scaledStat.attackPower;
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
