class SpeciesSpriteLayer {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} sprite
   * @param {string} color
   * @param {number} scale
   */
  constructor(x, y, sprite, color, scale) {
    this.x = x;
    this.y = y;
    this.sprite = sprite;
    this.color = color;
    this.scale = scale;
  }
}

class Species extends BonusSource {
  /** @param {string} type */
  constructor(type) {
    super(type);
    this.coloration = 0;
    this.gender = false;
    this.hairstyle = new Hairstyle('bald');
  }

  /** @return {string} */
  get category() {
    return 'species';
  }

  /** @return {boolean} */
  get monstrous() {
    return this.getBooleanValue('monstrous');
  }


  // Appearance.

  /** @return {boolean} */
  get hideUIOutOfBattle() {
    const category = 'species appearances';
    return data.getBooleanValue(category, this.type, 'hideUIOutOfBattle');
  }

  /** @return {number} */
  get voicePitch() {
    const category = 'species appearances';
    return data.getNumberValue(category, this.type, 'voicePitch') || 0;
  }

  /** @return {number} */
  get voiceRate() {
    const category = 'species appearances';
    return (data.getNumberValue(category, this.type, 'voiceRate') || 100) / 100;
  }

  /** @return {number} */
  get headHeightPoint() {
    const category = 'species appearances';
    return (data.getNumberValue(
        category, this.type, 'headHeightPoint') || 50) / 100;
  }

  /** @return {number} */
  get weaponHeightPoint() {
    const category = 'species appearances';
    const raw = data.getNumberValue(category, this.type, 'weaponHeightPoint');
    if (raw) return raw / 100;
    return this.headHeightPoint;
  }

  /**
   * @param {string} colorName
   * @param {!Array.<!Job>} jobs
   * @return {string}
   */
  getColor(colorName, jobs) {
    const category = 'species appearances';
    let color = data.getColorValue(
        category, this.type, colorName + this.coloration) || '#FFFFFF';
    for (const job of jobs) {
      color = job.modifyColor(colorName, color);
    }
    return color;
  }

  /** @return {?number} */
  get colorationTickets() {
    const category = 'species appearances';
    return data.getNumberValue(
        category, this.type, 'colorationTickets' + this.coloration);
  }

  /** @return {?string} */
  get colorationName() {
    const category = 'species appearances';
    return data.getValue(category, this.type, 'coloration' + this.coloration);
  }

  /** @return {?string} */
  get colorationFluff() {
    const category = 'species appearances';
    return data.getValue(
        category, this.type, 'colorationFluff' + this.coloration);
  }

  /** @return {number} */
  get appearanceSizeMult() {
    const value = data.getNumberValue(
        'species appearances', this.type, 'appearanceSizeMult');
    return (value || 100) / 100;
  }

  /**
   * @param {!Array.<!Armor>} armors
   * @param {?Weapon} weapon
   * @param {?Accessory} accessory
   * @param {!Set.<!Weapon.Status>} statusTypes
   * @param {!Array.<!Job>} jobs
   * @param {boolean} dying
   * @return {!Array.<!SpeciesSpriteLayer>}
   */
  getSpriteLayers(armors, weapon, accessory, statusTypes, jobs, dying) {
    /** @type {!Array.<!Equipment>} */
    const equips = armors.concat(
        [weapon, accessory, this.hairstyle]).filter((e) => e);

    const type = this.type;
    const category = 'species appearances';
    const numLayers = data.getNumSubtypes(category, type);
    const spriteLayers = [];
    let x = 0;
    let y = 0;
    let scale = 1;
    for (let i = 0; i < numLayers; i++) {
      // Check if this is gender-specific.
      const reqGender = data.getValue(category, type, 'reqGender', i);
      if (reqGender && reqGender != (this.gender ? '1' : '0')) continue;

      // Get the (base) sprite.
      const gSpriteName = 'sprite' + (this.gender ? 'F' : 'M');
      let sprite = data.getNumberValue(category, type, gSpriteName, i);
      if (!sprite) {
        sprite = data.getNumberValue(category, type, 'sprite', i);
      }

      // Should it be added, based on equipment conditions?
      let color = '';
      const armorLayerId = data.getValue(category, type, 'armorLayerId', i);
      const fillSlotId = data.getValue(category, type, 'fillSlotId', i);
      if (armorLayerId) {
        for (const equip of equips) {
          if (equip.armorLayerId != armorLayerId) continue;
          color = equip.color;
          break;
        }
        if (!color) continue;
      } else if (fillSlotId) {
        for (const equip of equips) {
          if (equip.slotFillers.has(fillSlotId)) {
            sprite = equip.slotFillers.get(fillSlotId);
            if (!equip.slotFillersUseLayerColor) {
              color = equip.color;
            }
            break;
          }
        }
      }
      if (!sprite) continue;

      // If no explicit color was provided, use the layer's color.
      if (!color) {
        const colorName = data.getValue(category, type, 'color', i) || '';
        color = this.getColor(colorName, jobs);
      }

      // Set the position and scale, if it shouldn't be kept.
      if (!data.getBooleanValue(category, type, 'matchLastLayer', i)) {
        x = data.getNumberValue(category, type, 'xAdd', i) || 0;
        y = data.getNumberValue(category, type, 'yAdd', i) || 0;
        scale = (data.getNumberValue(
            category, type, 'scale', i) || 100) / 100;
      }

      // If set, apply the color changes for ALL status effects!
      let finalColor = color;
      const showAllStatuses = data.getBooleanValue(
          category, type, 'showAllStatuses', i);
      if (dying) {
        const hsv = getHSV(finalColor);
        hsv.s *= 0.5;
        finalColor = constructColorHSV(hsv);
      }
      if (statusTypes.has(Weapon.Status.Poisoned) && showAllStatuses) {
        const poison = data.getColorByNameSafe('poison');
        finalColor = colorLerp(finalColor, poison, 0.3);
      }
      // If SPECIFICALLY set, apply the color changes only for statuses that
      // also apply to objects (e.g. fire but not poison).
      const showObjectStatuses = showAllStatuses || data.getBooleanValue(
          category, type, 'showObjectStatuses', i);
      if (statusTypes.has(Weapon.Status.Burning) && showObjectStatuses) {
        const hsv = getHSV(finalColor);
        hsv.s *= 0.75;
        hsv.v *= 0.5;
        finalColor = constructColorHSV(hsv);
      }

      // Draw it!
      spriteLayers.push(new SpeciesSpriteLayer(
          x, y, sprite, finalColor, scale));
    }
    return spriteLayers;
  }
}
