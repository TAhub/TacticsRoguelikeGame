class LoadingPlugin extends GamePlugin {
  /** @param {!Promise.<!GamePlugin>} promise */
  constructor(promise) {
    super();

    this.timer = 0;
    /** @type {?GamePlugin} */
    this.plugin;
    promise.then((plugin) => this.plugin = plugin);
  }

  /** @param {number} elapsed */
  update(elapsed) {
    if (DEBUG) debugTrackTime('LoadingPlugin.update');

    this.timer += elapsed * 0.15;
    if (this.switchToPlugin && this.plugin) this.switchToPlugin(this.plugin);

    if (DEBUG) debugTrackTimeDone();
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    if (DEBUG) debugTrackTime('LoadingPlugin.draw');

    const x = ctx.canvas.width / 2;
    const y = ctx.canvas.height / 2;
    const r = Math.min(x, y);
    /**
     * @param {string} colorName
     * @param {number} rAdd
     * @param {number} aS
     * @param {number} aAdd
     */
    const drawCircle = (colorName, rAdd, aS, aAdd) => {
      ctx.fillStyle = data.getColorByNameSafe(colorName);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r + rAdd, aS * 2 * Math.PI, (aS + aAdd) * 2 * Math.PI);
      ctx.lineTo(x, y);
      ctx.fill();
    };

    drawCircle('tile border', 10, 0, 1);
    const t = this.timer * 7;
    if (t % 2 < 1) {
      drawCircle('tile selected', 0, 0, 1);
      drawCircle('tile selected over', 0, this.timer, (t % 2));
    } else {
      drawCircle('tile selected over', 0, 0, 1);
      drawCircle('tile selected', 0, this.timer, (t % 2) - 1);
    }

    if (DEBUG) debugTrackTimeDone();
  }
}
