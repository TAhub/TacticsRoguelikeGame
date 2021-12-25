class Armor extends Equipment {
  /** @return {string} */
  get category() {
    return 'armors';
  }

  /** @return {string} */
  get idChar() {
    return 'A';
  }

  /** @return {!Armor.Slot} */
  get slot() {
    const raw = this.getValue('slot');
    return raw ? /** @type {!Armor.Slot} */ (raw) : Armor.Slot.Torso;
  }

  /**
   * @param {number} level
   * @return {?string}
   */
  static armorProficiencyDescription(level) {
    switch (level) {
      case 1: return 'light armor';
      case 2: return 'heavy armor';
      default: return null;
    }
  }

  /** @return {number} */
  get armorProfiencyLevel() {
    return this.getNumberValue('armorProfiencyLevel');
  }

  /** @return {number} */
  get slotMult() {
    switch (this.slot) {
      case Armor.Slot.Torso: return 0.5;
      case Armor.Slot.Head: return 0.2;
      case Armor.Slot.Leg: return 0.3;
      default:
        console.log('WARNING: Unrecognized slot ' + this.slot);
        return 0;
    }
  }

  /** @return {number} */
  get defensePierced() {
    let defense = this.defense;
    defense -= this.slotMult * this.tier * mechPowerPerTier; // Undo tier!
    return defense / 2;
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {
    super.addCategorySpecificEffectsToDescription(effects, creature);

    // Armor proficiency level.
    const req = Armor.armorProficiencyDescription(this.armorProfiencyLevel);
    if (req) effects.push('requires ' + req + ' proficiency');
  }
}

/** @enum {string} */
Armor.Slot = {
  Torso: 'torso',
  Head: 'head',
  Leg: 'leg',
};
/** @type {!Array.<!Armor.Slot>} */
Armor.allSlots = [
  Armor.Slot.Head,
  Armor.Slot.Torso,
  Armor.Slot.Leg,
];
