class Minimap {
  constructor() {
    this.buffer = gfx.makeBuffer();
    this.bufferLastId = '';
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @param {!MapController} mapController
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   */
  draw(ctx, mapController, x, y, w, h) {
    if (DEBUG) debugTrackTime('Minimap.draw');

    const active = mapController.active;
    const scale = 4;
    const angle = mapController.cameraAngle;

    const bufferId = [active.x, active.y, angle, w, h].join(':');
    if (bufferId != this.bufferLastId) {
      this.bufferLastId = bufferId;

      // Clear the buffer, and prepare it to draw.
      this.buffer.width = w;
      this.buffer.height = h;
      const ctx = gfx.getContext(this.buffer);

      // Draw the background of the compass.
      ctx.fillStyle = data.getColorByNameSafe('tile slot back');
      ctx.fillRect(0, 0, w, h);

      // Position and scale.
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-angle - Math.PI / 2);
      ctx.translate(-scale * active.cX, -scale * active.cY);

      // Draw the tiles.
      // TODO: don't draw a tile if it's off-screen?
      for (const gameMap of mapController.gameMaps.values()) {
        for (const tile of gameMap.tiles.values()) {
          const i = toI(tile.x, tile.y);
          if (!gameMap.discoveredTileIs.has(i)) continue;
          // TODO: actual drawing (including walls)
          ctx.fillStyle = '#AAAAAA';
          ctx.fillRect(tile.x * scale, tile.y * scale, scale, scale);
        }
      }

      // Undo the transformations.
      ctx.restore();

      const compassThickness = 15;
      const compassRadius = (Math.min(w, h) / 2) - compassThickness;
      const outsideThickness = (calcDistance(w, h) / 2) - compassRadius;

      // Crop the outside of the compass.
      ctx.lineWidth = outsideThickness;
      ctx.strokeStyle = '#000000';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, compassRadius + outsideThickness / 2,
          0, 2 * Math.PI);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Draw a compass frame around the minimap.
      ctx.lineWidth = compassThickness;
      ctx.strokeStyle = data.getColorByNameSafe('tile border');
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, compassRadius + compassThickness / 2,
          0, 2 * Math.PI);
      ctx.stroke();

      // TODO: draw a north marker on the compass?
    }

    // Copy the buffer onto the actual drawing surface.
    ctx.drawImage(this.buffer, x, y, w, h);

    for (const gameMap of mapController.gameMaps.values()) {
      for (const tile of gameMap.tiles.values()) {
        if (tile.creatures.length == 0) continue;
        // TODO: draw creature marker at this tile, if
        // it's within the minimap?
      }
    }

    if (DEBUG) debugTrackTimeDone();
  }
}
