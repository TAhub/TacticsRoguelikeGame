class Hairstyle extends Equipment {
  /** @return {string} */
  get category() {
    return 'hairstyles';
  }

  /** @return {boolean} */
  get slotFillersUseLayerColor() {
    return true;
  }
}
