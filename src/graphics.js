class Graphics {
  constructor() {
    /** @type (HTMLCanvasElement) */
    this.buffer = this.makeBuffer();
    this.buffer.width = gfxTileSize;
    this.buffer.height = gfxTileSize;
  }

  /**
  * @return {!HTMLCanvasElement} buffer
  */
  makeBuffer() {
    return /** @type (!HTMLCanvasElement) */ (document.createElement('canvas'));
  }


  /**
   * @param {!HTMLCanvasElement} buffer
   * @return {!CanvasRenderingContext2D} ctx
   */
  getContext(buffer) {
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      buffer.getContext('2d'));
    ctx.imageSmoothingEnabled = false;
    return ctx;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} size
   * @param {boolean=} optBold
   * @param {boolean=} optItalic
   */
  setFont(ctx, size, optBold, optItalic) {
    ctx.font = (optBold ? 'bold ' : '') + (optItalic ? 'italic ' : '') + size +
               'px RobotoSlab';
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {Graphics.TextAlign=} optTextAlign
   * @param {Graphics.TextBaseline=} optTextBaseline
   */
  drawText(ctx, x, y, text, optTextAlign, optTextBaseline) {
    ctx.textAlign = optTextAlign || Graphics.TextAlign.Center;
    ctx.textBaseline = optTextBaseline || Graphics.TextBaseline.Bottom;
    ctx.fillText(text, x, y);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @return {number}
   */
  measureText(ctx, text) {
    return ctx.measureText(text).width;
  }

  /**
   * @param {number} num
   * @param {string} tint
   * @return {!THREE.CanvasTexture}
   */
  getSpriteAsTexture(num, tint) {
    const id = num + ':' + tint;
    if (!Graphics.spriteTextureCache_.has(id)) {
      if (DEBUG) debugTrackTime('Graphics.getSpriteAsTexture');
      const buffer = this.makeBuffer();
      buffer.width = gfxTileSize;
      buffer.height = gfxTileSize;
      const ctx = this.getContext(buffer);
      this.drawSprite(ctx, num, gfxTileSize / 2, gfxTileSize / 2, tint, 1);
      const texture = new THREE.CanvasTexture(buffer);
      Graphics.spriteTextureCache_.set(id, texture);
      if (DEBUG) debugTrackTimeDone();
    }
    return Graphics.spriteTextureCache_.get(id);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} num
   * @param {number} x
   * @param {number} y
   * @param {string} tint
   * @param {number} scale
   * @param {boolean=} optFlip
   * @param {boolean=} optUpsidedown
   * @param {number=} optRotate
   */
  drawSprite(ctx, num, x, y, tint, scale,
      optFlip, optUpsidedown, optRotate) {
    this.drawSpriteInner_(data.sprites, gfxTileSize,
        ctx, num, x, y, tint, scale,
        optFlip || false, optUpsidedown || false, optRotate);
  }

  /**
   * @param {Image} sheet
   * @param {number} sheetSize
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} num
   * @param {number} x
   * @param {number} y
   * @param {string} tint
   * @param {number} scale
   * @param {boolean} flip
   * @param {boolean} upsidedown
   * @param {number=} optRotate
   * @private
   */
  drawSpriteInner_(sheet, sheetSize, ctx, num, x, y,
      tint, scale, flip, upsidedown, optRotate) {
    const ts = sheetSize;
    const imageX = (num % 100) * (ts + gfxTileBorder) + gfxTileBorder;
    const imageY =
        Math.floor(num / 100) * (ts + gfxTileBorder) + gfxTileBorder;
    const rotate = ((optRotate || 0) + 32) % 4;

    if (imageX >= sheet.width) return;

    // Draw the tinted image.
    ctx.save();
    const addXM = flip ? -1 : 1;
    const addYM = upsidedown ? -1 : 1;
    ctx.translate(x - (ts / 2) * addXM * scale, y - (ts / 2) * addYM * scale);
    if (flip) {
      // TODO: apparently this is very slow; it might be smarter to just
      // make a pre-flipped version of the spritesheet
      ctx.scale(-1, 1);
    }

    if (upsidedown) {
      // TODO: see above
      ctx.scale(1, -1);
    }

    if (scale != 1) {
      ctx.scale(scale, scale);
    }
    if (rotate != 0) {
      ctx.rotate(rotate * Math.PI / 2);
      switch (rotate) {
        case 1: ctx.translate(0, -ts); break;
        case 2: ctx.translate(-ts, -ts); break;
        case 3: ctx.translate(-ts, 0); break;
      }
    }
    if (this.buffer && tint != '#FFFFFF') {
      const bx = this.getContext(this.buffer);
      bx.clearRect(0, 0, ts, ts);
      this.applyFilter(tint, bx);
      bx.drawImage(sheet, imageX, imageY, ts, ts, 0, 0, ts, ts);
      ctx.drawImage(this.buffer, 0, 0, ts, ts);
    } else {
      ctx.drawImage(sheet, imageX, imageY, ts, ts, 0, 0, ts, ts);
    }

    ctx.restore();
  }

  /**
   * @param {string} tint
   * @param {CanvasRenderingContext2D} ctx
   */
  applyFilter(tint, ctx) {
    const id = 'filter-' + tint.replace('#', '');
    if (!Graphics.filterContainer) {
      Graphics.filterContainer = document.createElementNS(
          'http://www.w3.org/2000/svg', 'svg');
      Graphics.filterContainer.style.width = 0;
      Graphics.filterContainer.style.height = 0;
      Graphics.filterContainer.style.position = 'absolute';
      document.body.appendChild(Graphics.filterContainer);
    }
    if (!Graphics.filters.get(id)) {
      const filter = document.createElementNS(
          'http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', id);
      filter.setAttribute('color-interpolation-value', 'sRGB');
      const matrix = document.createElementNS(
          'http://www.w3.org/2000/svg', 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', this.makeColorMatrix_(tint).join(' '));
      filter.appendChild(matrix);
      Graphics.filters.set(id, filter);
      Graphics.filterContainer.appendChild(Graphics.filters.get(id));
    }
    ctx.filter = 'url(#' + id + ')';
  }

  /**
   * @param {string} tint
   * @return {!Array.<number>} matrix
   * @private
   */
  makeColorMatrix_(tint) {
    const rgb = getRGB(tint);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const o = '0';
    const l = '1';
    return [
      r, o, o, o, o,
      o, g, o, o, o,
      o, o, b, o, o,
      o, o, o, l, o,
    ];
  }
}

/** @type {!Map.<string, !THREE.CanvasTexture>} */
Graphics.spriteTextureCache_ = new Map();

/** @enum {string} */
Graphics.TextAlign = {
  Center: 'center',
  Left: 'left',
  Right: 'right',
};

/** @enum {string} */
Graphics.TextBaseline = {
  Top: 'top',
  Bottom: 'bottom',
  Middle: 'middle',
};

/** @type {?Element} */
Graphics.filterContainer;

/** @type {!Map.<string, !Element>} */
Graphics.filters = new Map();

const gfx = new Graphics();
