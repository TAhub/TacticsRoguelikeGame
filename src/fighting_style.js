class FightingStyle extends BonusSource {
  /** @return {string} */
  get category() {
    return 'fighting styles';
  }

  /** @return {?string} */
  get reqSpecies() {
    return this.getValue('reqSpecies');
  }

  /** @return {?Array.<!string>} */
  get reqJobs() {
    return this.getArrayValue('reqJobs');
  }

  /**
   * @param {!Creature} creature
   * @param {boolean=} optNoFluff
   * @return {!Array.<string>}
   */
  getDescription(creature, optNoFluff) {
    const lines = super.getDescription(creature, optNoFluff);
    lines.push('Only one fighting style can be active at a time! ' +
               'Switch by spending your move!');
    return lines;
  }
}
