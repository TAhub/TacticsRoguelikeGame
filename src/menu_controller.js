/**
 * @typedef {{
 *   attachData: (string|undefined),
 *   disabled: (boolean|undefined),
 *   defaultText: (string|undefined),
 *   defaultClickFn: ((function())|undefined),
 *   mouseOverFn: ((function())|undefined),
 *   mouseOffFn: ((function())|undefined),
 * }}
 */
let MenuTileSlotOptions;

class MenuTileSlot {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {MenuTileSlotOptions=} optOptions
   */
  constructor(x, y, w, h, optOptions) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.attachData = optOptions ? optOptions.attachData : null;
    this.disabled = optOptions ? optOptions.disabled : false;
    this.defaultText = optOptions ? optOptions.defaultText : null;
    this.defaultClickFn =
        (optOptions ? optOptions.defaultClickFn : null) || null;
    this.mouseOffFn = (optOptions ? optOptions.mouseOffFn : null) || null;
    this.mouseOverFn = (optOptions ? optOptions.mouseOverFn : null) || null;
    this.over = false;
    /** @type {?MenuTile} */
    this.tile;
    /** @type {?MenuTile} */
    this.backgroundTile;
  }

  /** @return {boolean} */
  get liftable() {
    return !!this.attachData;
  }

  /** @param {!MenuTile} tile */
  attachTile(tile) {
    this.tile = tile;
    tile.x = this.x + this.b;
    tile.y = this.y + this.b;
    tile.w = this.w - 2 * this.b;
    tile.h = this.h - 2 * this.b;
    tile.lastSlot = this;
    tile.textSize = 0;
  }

  /** @return {number} */
  get b() {
    return 3; // TODO: const?
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(this.x, this.y, this.w, this.h);
    if (this.tile) {
      this.tile.draw2D(ctx);
    } else {
      if (!this.backgroundTile) {
        const options = {backgroundMode: true};
        this.backgroundTile = new MenuTile(this.defaultText || '', options);
      }
      this.attachTile(this.backgroundTile);
      this.tile = null;
      this.backgroundTile.over = this.over;
      this.backgroundTile.draw2D(ctx);
    }
    if (this.disabled) {
      ctx.fillStyle = data.getColorByNameSafe('black');
      ctx.globalAlpha = 0.25;
      ctx.fillRect(this.x + this.b, this.y + this.b,
          this.w - 2 * this.b, (this.h - 2 * this.b));
      ctx.globalAlpha = 1;
    }
  }
}

/**
 * @typedef {{
 *   clickFn: ((function())|undefined),
 *   attachFn: ((function(!MenuTileSlot): boolean)|undefined),
 *   offFn: ((function():{x: number, y: number})|undefined),
 *   selected: (boolean|undefined),
 *   tooltip: (Array.<string>|undefined),
 *   backgroundMode: (boolean|undefined),
 *   spriteCanvas: (HTMLCanvasElement|undefined),
 *   colorSuffix: (string|undefined),
 *   textBackground: (boolean|undefined),
 * }}
 */
let MenuTileOptions;

class MenuTile {
  /**
   * @param {string} text
   * @param {MenuTileOptions=} optOptions
   */
  constructor(text, optOptions) {
    this.clickFn = (optOptions ? optOptions.clickFn : null) || null;
    this.attachFn = (optOptions ? optOptions.attachFn : null) || null;
    this.offFn = (optOptions ? optOptions.offFn : null) || null;
    this.selected = !!optOptions && optOptions.selected;
    this.backgroundMode = !!optOptions && optOptions.backgroundMode;
    this.tooltip = (optOptions ? optOptions.tooltip : null) || null;
    this.spriteCanvas = (optOptions ? optOptions.spriteCanvas : null) || null;
    this.colorSuffix = (optOptions ? optOptions.colorSuffix : null) || null;
    this.textBackground = !!optOptions && optOptions.textBackground;
    this.over = false;
    this.text = text;
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    /** @type {?MenuTileSlot} */
    this.lastSlot;
    this.textSize = 0;
  }

  /** @return {number} */
  get b() {
    return 2; // TODO: const?
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    const suffix = (this.selected ? ' selected' : '') +
                   (this.over ? ' over' : '') +
                   (this.colorSuffix ? this.colorSuffix : '');

    let x = this.x;
    let y = this.y;
    if (this.offFn) {
      const pos = this.offFn();
      x += pos.x;
      y += pos.y;
    }

    if (this.backgroundMode) {
      ctx.fillStyle = data.getColorByNameSafe('tile slot back');
    } else {
      ctx.fillStyle = data.getColorByNameSafe('tile border');
    }
    ctx.fillRect(x, y, this.w, this.h);
    if (!this.backgroundMode) {
      ctx.fillStyle = data.getColorByNameSafe('tile' + suffix);
      ctx.fillRect(x + this.b, y + this.b,
          this.w - 2 * this.b, this.h - 2 * this.b);
    }

    // Determine text size.
    if (this.text && this.w > 0 && this.textSize == 0) {
      this.textSize = Math.min(this.h - 2 * this.b, this.w / 2);
      while (true) {
        gfx.setFont(ctx, this.textSize);
        const width = gfx.measureText(ctx, this.text);
        if (width < this.w - this.b * 2) break;
        this.textSize -= 2;
      }
    }
    gfx.setFont(ctx, this.textSize);

    ctx.save();
    if (this.spriteCanvas) {
      ctx.beginPath();
      ctx.rect(x, y, this.w, this.h - this.b);
      ctx.clip();
      const dX = x + (this.w - this.spriteCanvas.width) / 2;
      const dY = y + (this.h - this.spriteCanvas.height) / 2;
      ctx.drawImage(this.spriteCanvas, dX, dY);
    }

    if (this.text && this.w > 0) {
      gfx.setFont(ctx, this.textSize);
      if (this.textBackground) {
        // Make a background.
        ctx.fillStyle = data.getColorByNameSafe('tile' + suffix);
        const w = gfx.measureText(ctx, this.text);
        ctx.fillRect(x + (this.w - w) / 2, y + this.h - this.textSize,
            w, this.textSize);
      }
      ctx.fillStyle = data.getColorByNameSafe('tile text' + suffix);
      if (this.spriteCanvas) {
        gfx.drawText(ctx, x + this.w / 2, y + this.h, this.text,
            Graphics.TextAlign.Center, Graphics.TextBaseline.Bottom);
      } else {
        gfx.drawText(ctx, x + this.w / 2, y + this.h / 2, this.text,
            Graphics.TextAlign.Center, Graphics.TextBaseline.Middle);
      }
    }

    ctx.restore();
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {!Array.<string>} tooltip
   */
  static drawArbitrary2DTooltip(ctx, x, y, tooltip) {
    // Determine the tooltip size.
    let textSize = 20;
    let w = 0;
    let h = 0;
    while (true) {
      gfx.setFont(ctx, textSize);
      for (const line of tooltip) {
        w = Math.max(w, gfx.measureText(ctx, line));
        h += textSize;
      }
      if (w < gfxScreenWidth) break; // Good.

      // The tooltip is too big! Try again, at a smaller font size.
      textSize -= 2;
      w = 0;
      h = 0;
    }

    // Determine the position.
    x -= w / 2;
    y -= h;
    x = Math.max(0, x);
    y = Math.max(0, y);
    x = Math.min(gfxScreenWidth - w, x);
    y = Math.min(gfxScreenHeight - h, y);

    // Draw the background.
    ctx.fillStyle = data.getColorByNameSafe('tooltip');
    ctx.fillRect(x, y, w, h);

    // Draw the text.
    ctx.fillStyle = data.getColorByNameSafe('tooltip text');
    for (let i = 0; i < tooltip.length; i++) {
      gfx.drawText(ctx, x, y + (i + 0.5) * textSize, tooltip[i],
          Graphics.TextAlign.Left, Graphics.TextBaseline.Middle);
    }
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2DTooltip(ctx) {
    if (!this.tooltip) return;

    const x = this.x + this.w / 2;
    MenuTile.drawArbitrary2DTooltip(ctx, x, this.y, this.tooltip);
  }
}

class MenuController {
  constructor() {
    this.meshGroup = new THREE.Group();
    /** @type {!Array.<!MenuTileSlot>} */
    this.slots = [];
    /** @type {?MenuTileSlot} */
    this.slotOver;
    /** @type {?MenuTile} */
    this.heldTile;
    this.heldTileHandleX = 0;
    this.heldTileHandleY = 0;
  }

  clear() {
    this.slots = [];
    this.heldTile = null;
  }

  /**
   * @param {number} desiredWidth
   * @param {number} desiredHeight
   * @param {boolean} honorAspectRatio
   */
  resizeToFit(desiredWidth, desiredHeight, honorAspectRatio) {
    let width = 0;
    let height = 0;
    for (const slot of this.slots) {
      width = Math.max(width, slot.x + slot.w);
      height = Math.max(height, slot.y + slot.h);
    }
    let wMult = desiredWidth / width;
    let hMult = desiredHeight / height;
    if (honorAspectRatio) {
      const mult = Math.min(wMult, hMult);
      hMult = mult;
      wMult = mult;
    }
    for (const slot of this.slots) {
      slot.x *= wMult;
      slot.y *= hMult;
      slot.w *= wMult;
      slot.h *= hMult;
      if (slot.tile) slot.attachTile(slot.tile);
    }
  }

  /**
   * @param {number} desiredWidth
   * @param {number} desiredHeight
   */
  recenter(desiredWidth, desiredHeight) {
    let xMin = desiredWidth;
    let xMax = 0;
    let yMin = desiredHeight;
    let yMax = 0;
    for (const slot of this.slots) {
      xMin = Math.min(xMin, slot.x);
      yMin = Math.min(yMin, slot.y);
      xMax = Math.max(xMax, slot.x + slot.w);
      yMax = Math.max(yMax, slot.y + slot.h);
    }
    for (const slot of this.slots) {
      slot.x += (desiredWidth - xMax) / 2;
      slot.x -= xMin / 2;
      slot.y += (desiredHeight - yMax) / 2;
      slot.y -= yMin / 2;
      if (slot.tile) slot.attachTile(slot.tile);
    }
  }

  /** @param {number} elapsed */
  update(elapsed) {
    // TODO: any updating necessary?
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    if (DEBUG) debugTrackTime('MenuController.draw2D');
    for (const slot of this.slots) {
      slot.draw2D(ctx);
    }
    if (this.heldTile) {
      this.heldTile.draw2D(ctx);
    } else if (this.slotOver && this.slotOver.tile) {
      this.slotOver.tile.draw2DTooltip(ctx);
    }
    if (DEBUG) debugTrackTimeDone();
  }

  /** @param {!Controls} controls */
  input(controls) {
    const oldSlotOver = this.slotOver;
    this.slotOver = null;
    for (const slot of this.slots) {
      if (controls.mouseX < slot.x) continue;
      if (controls.mouseY < slot.y) continue;
      if (controls.mouseX > slot.x + slot.w) continue;
      if (controls.mouseY > slot.y + slot.h) continue;
      this.slotOver = slot;
      break;
    }
    if (oldSlotOver && oldSlotOver != this.slotOver) {
      if (oldSlotOver.mouseOffFn) oldSlotOver.mouseOffFn();
    }
    if (this.slotOver && this.slotOver != oldSlotOver) {
      if (this.slotOver.mouseOverFn) this.slotOver.mouseOverFn();
    }

    for (const slot of this.slots) {
      slot.over = false;
      if (slot.tile) slot.tile.over = false;
    }
    if (this.heldTile) {
      this.heldTile.x = controls.mouseX - this.heldTileHandleX;
      this.heldTile.y = controls.mouseY - this.heldTileHandleY;
      this.heldTile.over = true;
    } else if (this.slotOver) {
      this.slotOver.over = true;
      if (this.slotOver.tile) this.slotOver.tile.over = true;
    }

    if (controls.mousePressed == 2 || controls.rightMousePressed == 2) {
      // Pick up or use tiles!
      if (this.slotOver && this.slotOver.tile) {
        const clickable = this.slotOver.tile.clickFn;
        const liftable = this.slotOver.liftable && this.slotOver.tile.attachFn;
        if (clickable && controls.mousePressed == 2) {
          this.slotOver.tile.clickFn();
        } else if (liftable && controls.rightMousePressed == 2) {
          this.heldTile = this.slotOver.tile;
          this.heldTileHandleX = controls.mouseX - this.heldTile.x;
          this.heldTileHandleY = controls.mouseY - this.heldTile.y;
          this.slotOver.tile = null;
        }
      } else if (this.slotOver && this.slotOver.defaultClickFn &&
                 controls.mousePressed == 2) {
        this.slotOver.defaultClickFn();
      }
    } else if (controls.mousePressed == 0 && controls.rightMousePressed == 0) {
      if (this.heldTile) {
        // Drop the tile!
        if (this.slotOver && this.slotOver.liftable && this.heldTile.attachFn) {
          if (!this.heldTile.attachFn(this.slotOver)) {
            this.heldTile.lastSlot.attachTile(this.heldTile);
          }
        } else {
          this.heldTile.lastSlot.attachTile(this.heldTile);
        }
        this.heldTile = null;
      }
    }
  }
}
