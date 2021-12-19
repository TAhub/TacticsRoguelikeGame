class Stat extends BonusSource {
  /**
   * @param {string} type
   * @param {number} number
   * @param {!Species} species
   * @param {!Array.<!Job>} jobs
   */
  constructor(type, number, species, jobs) {
    super(type);
    this.number = number;

    // Calculate the extra max number.
    this.extraMaxNumber = species.getStatModifierFor(this.type);
    for (const job of jobs) {
      this.extraMaxNumber += job.getStatModifierFor(this.type);
    }
  }

  /** @return {string} */
  get category() {
    return 'stats';
  }

  /** @return {number} */
  get maxNumber() {
    return 20 + this.extraMaxNumber;
  }

  /**
   * @param {string} name
   * @return {number}
   */
  getNumberValue(name) {
    const modifier = this.number - 10;
    if (modifier == 0) return 0;
    return super.getNumberValue(name) * modifier;
  }
}
