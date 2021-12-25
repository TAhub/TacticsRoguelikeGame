class Ring extends Equipment {
  /** @return {string} */
  get category() {
    return 'rings';
  }

  /** @return {string} */
  get idChar() {
    return 'R';
  }

  /** @return {string} */
  get techType() {
    return this.getValue('techType') || '';
  }

  /**
   * @param {!Creature} creature
   * @param {boolean=} optNoFluff
   * @return {!Array.<string>}
   */
  getDescription(creature, optNoFluff) {
    const lines = super.getDescription(creature, optNoFluff);

    // Description of spell.
    lines.push('Allows casting of ' + this.techType + ':');
    const sample = creature.makeTech(this.techType);
    if (sample) {
      for (const line of sample.getDescription(creature)) {
        lines.push(line);
      }
    }

    return lines;
  }
}
