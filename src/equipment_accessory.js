class Accessory extends Equipment {
  /** @return {string} */
  get category() {
    return 'accessories';
  }

  /** @return {string} */
  get saveString() {
    return '(C)' + this.type + ':' + this.subtype;
  }
}
