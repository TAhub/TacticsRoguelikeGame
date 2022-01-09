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
    const slotsToDelete = new Set();
    for (const overworldMapTile of mapController.overworldMap.tiles.values()) {
      const x = overworldMapTile.x;
      const y = overworldMapTile.y;
      const disabled = !mapController.visitedMapIs.has(toI(x, y));
      const slot = new MenuTileSlot(x, y, 1, 1, {disabled});
      if (disabled) {
        // Disabled maps should be deleted unless they are next to
        // a visited map. This makes the fast-travel map "fill out"
        // as you explore.
        const doorIs = Array.from(overworldMapTile.doorIds.keys());
        const nextToVisitedMap = doorIs.some((i) => {
          return mapController.visitedMapIs.has(i);
        });
        if (!nextToVisitedMap) slotsToDelete.add(slot);
      } else {
        // The slot should be empty, unless you can fast-travel there.
        if (mapController.restMapIs.has(toI(x, y))) {
          const clickFn = () => travelFn(x, y);
          const selected =
              toI(x, y) == mapController.overworldIFor(active.x, active.y);
          const tooltip =
              [capitalizeFirstLetterOfEachWord(overworldMapTile.type)];
          slot.attachTile(new MenuTile('', {clickFn, selected, tooltip}));
        }
      }
      this.menuController.slots.push(slot);
    }
    this.menuController.resizeToFit(gfxScreenWidth, gfxScreenHeight, true);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);

    // Retroactively remove all slots that correspond to.
    // Add them first, so that the map doesn't resize when you discover
    // more maps.
    this.menuController.slots = this.menuController.slots.filter((slot) => {
      return !slotsToDelete.has(slot);
    });
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
