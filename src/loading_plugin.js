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

    this.timer = (this.timer + elapsed * 0.5) % 1;
    if (this.switchToPlugin && this.plugin) this.switchToPlugin(this.plugin);

    if (DEBUG) debugTrackTimeDone();
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    if (DEBUG) debugTrackTime('LoadingPlugin.draw');

    const hsv = new HSV(this.timer, 0.5, 0.75);
    ctx.fillStyle = constructColorHSV(hsv);
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // TODO: real draw...?

    if (DEBUG) debugTrackTimeDone();
  }
}
