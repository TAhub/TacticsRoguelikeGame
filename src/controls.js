class Controls {
  /** @param {!HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.mouseX = 0;
    this.mouseY = 0;
    this.mousePressed = 0;
    this.rightMousePressed = 0;
    canvas.onmousedown = (e) => {
      if (e.which == 1) {
        this.mousePressed = 2;
      } else {
        this.rightMousePressed = 2;
      }
      e.preventDefault();
    };
    canvas.onmouseup = (e) => {
      if (e.which == 1) {
        this.mousePressed = 0;
      } else {
        this.rightMousePressed = 0;
      }
      e.preventDefault();
    };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.onmousemove = (e) => {
      if (e.offsetX != undefined) {
        this.mouseX = e.offsetX;
        this.mouseY = e.offsetY;
      } else if (e.layerX != undefined) {
        this.mouseX = e.layerX;
        this.mouseY = e.layerY;
      }
    };
    canvas.onmouseleave = (e) => {
      // It's at some arbitrary offscreen point.
      this.mouseX = gfxScreenWidth + 1;
      this.mouseY = gfxScreenHeight + 1;
    };

    /** @type {!Map.<Controls.Key, !Set.<number>>} */
    this.keyBindings = new Map();
    const addBinding = (key, charCode) => {
      const ar = this.keyBindings.get(key) || new Set();
      ar.add(charCode);
      this.keyBindings.set(key, ar);
    };

    // TODO: think about these keybinding schemes...
    // http://www.rpg-maker.fr/dl/monos/aide/vx/source/rpgvx/control.html
    addBinding(Controls.Key.UP, 'W'.charCodeAt(0));
    addBinding(Controls.Key.LEFT, 'A'.charCodeAt(0));
    addBinding(Controls.Key.RIGHT, 'D'.charCodeAt(0));
    addBinding(Controls.Key.TURNLEFT, 'Q'.charCodeAt(0));
    addBinding(Controls.Key.TURNRIGHT, 'E'.charCodeAt(0));
    addBinding(Controls.Key.DOWN, 'S'.charCodeAt(0));

    // TODO: alternate keybindings?

    /** @type {!Map.<number, number>} */
    this.pressed = new Map();
    document.onkeydown = (e) => {
      if (!this.pressed.has(e.keyCode)) {
        this.pressed.set(e.keyCode, 2);
      }
    };
    document.onkeyup = (e) => {
      this.pressed.delete(e.keyCode);
    };
  }

  /**
   * @param {!Controls.Key} key
   * @return {boolean}
   */
  keyPressed(key) {
    const bindings = this.keyBindings.get(key);
    if (bindings.size == 0) return false;
    for (const keyCode of bindings) {
      // If any of the bindings is being held down, it wasn't pressed.
      if (this.pressed.get(keyCode) == 1) return false;
    }
    return this.keyDown(key);
  }

  /**
   * @param {!Controls.Key} key
   * @return {boolean}
   */
  keyDown(key) {
    const bindings = this.keyBindings.get(key);
    if (bindings.size == 0) return false;
    for (const keyCode of bindings) {
      if (this.pressed.has(keyCode)) return true;
    }
    return false;
  }

  degradeJustPressed() {
    this.mousePressed = this.mousePressed ? 1 : 0;
    this.rightMousePressed = this.rightMousePressed ? 1 : 0;
    for (const keyCode of this.pressed.keys()) {
      this.pressed.set(keyCode, 1);
    }
  }
}

/** @enum {number} */
Controls.Key = {
  UP: 1,
  DOWN: 2,
  LEFT: 3,
  RIGHT: 4,
  TURNLEFT: 5,
  TURNRIGHT: 6,
};
