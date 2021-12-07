class Stat extends BonusSource {
  /**
   * @param {string} type
   * @param {number} number
   * @param {!Species} species
   */
  constructor(type, number, species) {
    super(type);
    this.number = number;
    this.species = species;
  }

  /** @return {string} */
  get category() {
    return 'stats';
  }

  /** @return {number} */
  get maxNumber() {
    return 25 + this.species.getStatModifierFor(this.type);
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
