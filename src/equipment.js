class Equipment extends BonusSource {
  /** @param {string} saveString */
  constructor(saveString) {
    if (saveString.startsWith('(')) {
      saveString = saveString.split(')')[1];
    }
    const components = saveString.split(':');
    super(components[0]);
    if (components.length >= 2) {
      this.subtype = parseInt(components[1], 10);
    }
  }

  /** @return {string} */
  get idChar() {
    return '';
  }

  /**
   * @param {string} saveString
   * @return {!Equipment}
   */
  static load(saveString) {
    // Note that (I) is a reserved prefix (for item codes).
    // Same with (K), for keys.
    if (saveString.startsWith('(W)')) {
      return new Weapon(saveString);
    } else if (saveString.startsWith('(A)')) {
      return new Armor(saveString);
    } else if (saveString.startsWith('(C)')) {
      return new Accessory(saveString);
    } else if (saveString.startsWith('(R)')) {
      return new Ring(saveString);
    } else {
      return new Equipment(saveString); // Unknown type...
    }
  }

  /** @return {number} */
  get tier() {
    return this.getNumberValue('tier');
  }

  /** @return {string} */
  get color() {
    return this.getColorValue('color') || '#FFFFFF';
  }

  /** @return {?string} */
  get armorLayerId() {
    return this.getValue('armorLayerId');
  }

  /** @return {boolean} */
  get slotFillersUseLayerColor() {
    return false;
  }

  /** @return {!Map.<string, number>} */
  get slotFillers() {
    const map = new Map();
    const raw = this.getArrayValue('slotFillers');
    if (raw) {
      for (const pair of raw) {
        const split = pair.split(':');
        map.set(split[0], parseInt(split[1], 10));
      }
    }
    return map;
  }

  /** @return {string} */
  get saveString() {
    let saveString = '(' + this.idChar + ')' + this.type;
    if (this.subtype != undefined) saveString += ':' + this.subtype;
    return saveString;
  }
}
