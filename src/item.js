class Item {
  /** @param {Equipment|Item.Code} contents */
  constructor(contents) {
    this.contents = contents;
    /** @type {?SpriteObject} */
    this.spriteObject;
    /** @type {number|undefined} */
    this.h = undefined;
    /** @type {?number} */
    this.keyCode;
    /** @type {?string} */
    this.keyColorName;
  }

  clear3DData() {
    if (this.spriteObject) this.spriteObject.clear3DData();
  }

  /**
   * @return {{
   *   h: (number|undefined),
   *   sprite: number,
   *   scale: number,
   *   color: string,
   * }}
   * @private
   */
  getSpriteDetails_() {
    let sprite = 0;
    let color = '#FFFFFF';
    const scale = 1;
    let h = undefined;
    if (this.contents instanceof Equipment) {
      if (this.contents instanceof Weapon) {
        if (this.contents.astraCost > 0) {
          sprite = 507;
          color = data.getColorByNameSafe('iron');
        } else {
          const slotFillers = this.contents.slotFillers;
          sprite = Array.from(slotFillers.values())[0];
          color = this.contents.color;
          h = 0.25;
        }
      } else if (this.contents instanceof Armor) {
        switch (this.contents.slot) {
          case Armor.Slot.Head: sprite = 510; break;
          case Armor.Slot.Torso: sprite = 508; break;
          case Armor.Slot.Leg: sprite = 509; break;
        }
        h = 0.4;
        color = this.contents.color;
      } else if (this.contents instanceof Accessory) {
        sprite = 511;
        h = 0.4;
        color = this.contents.color;
      }
    } else {
      switch (this.contents) {
        case Item.Code.Campfire:
          sprite = 505;
          color = data.getColorByNameSafe('stone wall');
          break;
        case Item.Code.Key:
          sprite = 506;
          color = data.getColorByNameSafe(this.keyColorName || '');
          break;
      }
    }
    return {sprite, color, scale, h};
  }

  /** @return {!HTMLCanvasElement} */
  get2DCanvas() {
    const buffer = gfx.makeBuffer();
    const {sprite, color, scale} = this.getSpriteDetails_();
    const size = Math.floor(gfxTileSize * scale);
    buffer.width = size;
    buffer.height = size;
    const ctx = gfx.getContext(buffer);
    gfx.drawSprite(ctx, sprite, size / 2, size / 2, color, scale);
    return buffer;
  }

  /**
   * @param {!THREE.Group} group
   * @param {!THREE.PerspectiveCamera} camera
   * @param {number} x
   * @param {number} y
   */
  addToGroup(group, camera, x, y) {
    if (!this.spriteObject) {
      const {sprite, color, scale, h} = this.getSpriteDetails_();
      this.h = h;
      this.spriteObject = new SpriteObject();
      this.spriteObject.setAppearance(sprite, color, scale);
    }
    this.spriteObject.addToGroup(
        group, camera, x, y, {h: this.h, drawBack: 0.05});
  }

  /** @return {boolean} */
  get canPickUp() {
    if (this.contents instanceof Equipment) {
      return true;
    } else {
      switch (this.contents) {
        case Item.Code.Key:
          return true;
      }
    }
    return false;
  }

  /** @return {string} */
  get name() {
    if (this.contents instanceof Equipment) {
      return this.contents.name;
    } else {
      switch (this.contents) {
        case Item.Code.Key:
          return capitalizeFirstLetter(this.keyColorName || '') + ' Key';
      }
    }
    return 'Unknown';
  }

  /**
   * @param {!Creature} creature
   * @param {boolean=} optNoFluff
   * @return {!Array.<string>}
   */
  getDescription(creature, optNoFluff) {
    if (this.contents instanceof Equipment) {
      return this.contents.getDescription(creature, optNoFluff);
    } else {
      switch (this.contents) {
        case Item.Code.Key:
          return [
            'An old key made of ' + (this.keyColorName || '') + '.',
            'Left click to use!',
          ];
      }
    }
    return [];
  }

  /**
   * @param {string} saveString
   * @return {!Item}
   */
  static load(saveString) {
    if (saveString.startsWith('(K)')) {
      const split = saveString.split(')')[1].split(':');
      const item = new Item(Item.Code.Key);
      item.keyCode = parseInt(split[0], 10);
      item.keyColorName = split[1];
      return item;
    } else if (saveString.startsWith('(I)')) {
      const split = saveString.split(')');
      return new Item(/** @type {!Item.Code} */ (parseInt(split[1], 10)));
    } else {
      return new Item(Equipment.load(saveString));
    }
  }

  /** @return {string} */
  get saveString() {
    if (this.contents instanceof Equipment) {
      return this.contents.saveString;
    } else if (this.contents == Item.Code.Key) {
      return '(K)' + this.keyCode + ':' + this.keyColorName;
    } else {
      return '(I)' + this.contents;
    }
  }
}

/** @enum {number} */
Item.Code = {
  Campfire: 1,
  Key: 2,
};
