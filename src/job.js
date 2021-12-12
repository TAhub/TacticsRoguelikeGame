class Job extends BonusSource {
  /** @return {string} */
  get category() {
    return 'jobs';
  }

  /** @return {number} */
  get armorProfiencyLevel() {
    return this.getNumberValue('armorProfiencyLevel');
  }

  /** @return {!Array.<string>} */
  get reqSpecies() {
    return this.getArrayValue('reqSpecies') || [];
  }

  /** @return {number} */
  getBonusSourceValue() {
    let value = super.getBonusSourceValue();
    value += this.armorProfiencyLevel * mechArmorProfiencyDefense;
    return value;
  }

  /** @return {!Array.<string>} */
  get proficiencies() {
    return this.getArrayValue('proficiencies') || [];
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {
    super.addCategorySpecificEffectsToDescription(effects, creature);

    const wProficiencies = [];
    const tProficiencies = [];
    for (const type of this.proficiencies) {
      const weapon = new Weapon(type);
      if (weapon.numSubtypes > 0) weapon.subtype = 0;
      (weapon.astraCost > 0 ? tProficiencies : wProficiencies).push(type);
    }
    if (wProficiencies.length > 0) {
      effects.push('proficient with ' + wProficiencies.join(' and '));
    }
    if (tProficiencies.length > 0) {
      effects.push('can learn ' + tProficiencies.join(' and '));
    }

    // Armor proficiency level.
    const level = this.armorProfiencyLevel;
    if (level > 0) {
      const bonus = level * mechArmorProfiencyDefense;
      effects.push(Armor.armorProficiencyDescription(level) +
                   ' proficiency (+' + bonus + '% defense if redundant)');
    }
  }
}
