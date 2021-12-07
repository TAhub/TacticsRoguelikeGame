class Skill extends BonusSource {
  /** @return {string} */
  get category() {
    return 'skills';
  }

  /** @return {?string} */
  get prereq() {
    return this.getValue('prereq');
  }

  /**
   * @param {string} stat
   * @return {number}
   */
  getStatRequirementFor(stat) {
    if (this.prereq) {
      const prereq = new Skill(this.prereq);
      const prereqReq = prereq.getStatRequirementFor(stat);
      return prereqReq ? (prereqReq + 10) : 0;
    }
    return this.getNumberValue(stat + 'Req');
  }

  /** @return {?string} */
  get reqSpecies() {
    return this.getValue('reqSpecies');
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {
    super.addCategorySpecificEffectsToDescription(effects, creature);
    const reqs = [];
    if (this.prereq) reqs.push(this.prereq + ' skill');
    for (const stat of creature.stats) {
      const req = this.getStatRequirementFor(stat.type);
      if (req == 0) continue;
      reqs.push(req + ' ' + stat.type);
    }
    if (reqs.length > 0) effects.push('requires ' + reqs.join(' and '));
  }
}
