class MessagePlugin extends GamePlugin {
  /** @param {string} message */
  constructor(message) {
    super();
    this.menuController = new MenuController();

    for (let y = 0; y < 999; y++) {
      const line = data.getValue('messages', message, 's', y);
      if (!line) break;
      const slot = new MenuTileSlot(0, y, 5, 1);
      const clickFn = () => this.switchToPlugin(new MainMenuPlugin());
      slot.attachTile(new MenuTile(line, {clickFn}));
      this.menuController.slots.push(slot);
    }
    this.menuController.resizeToFit(gfxScreenWidth, gfxScreenHeight);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    this.menuController.draw2D(ctx);
  }

  /** @param {!Controls} controls */
  input(controls) {
    this.menuController.input(controls);
  }
}
