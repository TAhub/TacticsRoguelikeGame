class FastTravelPlugin extends GamePlugin {
  /**
   * @param {!MapController} mapController
   * @param {function(number, number)} travelFn
   */
  constructor(mapController, travelFn) {
    super();
    this.travelFn = travelFn;
    this.menuController = new MenuController();
    const active = mapController.active;

    // Set up the menu controller.
    for (const overworldMapTile of mapController.overworldMap.tiles.values()) {
      const x = overworldMapTile.x;
      const y = overworldMapTile.y;
      const slot = new MenuTileSlot(x, y, 1, 1);
      // The slot should be empty, unless you can fast-travel there.
      if (mapController.restMapIs.has(toI(x, y))) {
        const clickFn = () => travelFn(x, y);
        const selected =
            toI(x, y) == mapController.overworldIFor(active.x, active.y);
        slot.attachTile(new MenuTile('', {clickFn, selected}));
      }
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
