class LoadingPlugin extends GamePlugin {
  /** @param {!function():?GamePlugin} loadFn */
  constructor(loadFn) {
    super();

    /** @type {?GamePlugin} */
    this.plugin;
    this.timer = 0;
    this.loadFn = loadFn;
  }

  /** @param {number} elapsed */
  update(elapsed) {
    if (DEBUG) debugTrackTime('LoadingPlugin.update');

    if (!this.plugin) {
      this.plugin = this.loadFn();
    }
    this.timer += elapsed * 0.5;
    if (this.timer >= 1) {
      if (this.switchToPlugin && this.plugin) {
        this.switchToPlugin(this.plugin);
      }
      this.timer -= 1;
    }

    if (DEBUG) debugTrackTimeDone();
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    if (DEBUG) debugTrackTime('LoadingPlugin.draw');

    // TODO: draw...?

    if (DEBUG) debugTrackTimeDone();
  }
}
