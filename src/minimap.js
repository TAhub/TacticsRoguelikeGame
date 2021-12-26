class Minimap {
  constructor() {
    this.buffer = gfx.makeBuffer();
    this.bufferLastId = '';
  }

  clearBuffer() {
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
    const scale = 6;
    const angle = mapController.cameraAngle;

    /**
     * @param {!CanvasRenderingContext2D} ctx
     * @param {number=} optExtraAngle
     */
    const applyTransformations = (ctx, optExtraAngle) => {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(-angle - Math.PI / 2);
      if (optExtraAngle) ctx.rotate(optExtraAngle);
      ctx.translate(-scale * active.cX, -scale * active.cY);
    };

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
      applyTransformations(ctx);

      // Draw the tiles.
      // TODO: don't draw a tile if it's off-screen?
      for (const gameMap of mapController.gameMaps.values()) {
        for (const tile of gameMap.tiles.values()) {
          const i = toI(tile.x, tile.y);
          if (!gameMap.discoveredTileIs.has(i)) continue;
          // TODO: actual drawing (including walls)
          ctx.fillStyle = data.getColorByNameSafe(
              tile.item ? 'tile selected' : 'tile');
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
      ctx.arc(w / 2, h / 2, compassRadius + outsideThickness / 2 + 2,
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

      // Draw compass markers.
      const markerFontSize = 20;
      gfx.setFont(ctx, markerFontSize);
      let extraAngle = 0;
      for (const dir of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
        ctx.save();
        applyTransformations(ctx, extraAngle);
        extraAngle += Math.PI / 4;
        const northX = scale * active.cX;
        const northY = scale * active.cY - h / 2;
        const width = gfx.measureText(ctx, ' ' + dir + ' ');
        ctx.fillStyle = data.getColorByNameSafe('tile border');
        ctx.fillRect(northX - width / 2, northY, width, markerFontSize);
        ctx.fillStyle = data.getColorByNameSafe('title');
        gfx.drawText(ctx, northX, northY, dir,
            Graphics.TextAlign.Center, Graphics.TextBaseline.Top);
        ctx.restore();
      }
    }

    // Copy the buffer onto the actual drawing surface.
    ctx.drawImage(this.buffer, x, y, w, h);

    ctx.save();
    // TODO: account for non (0, 0) minimap positions?
    applyTransformations(ctx);
    const maxDistance = Math.min(w, h) * 0.3 / scale;
    for (const creature of mapController.creatures) {
      if (creature != active) {
        const distance = calcDistance(
            creature.cX - active.cX, creature.cY - active.cY);
        if (distance > maxDistance) continue;
      }
      if (creature.side != Creature.Side.Player) {
        const x = Math.round(creature.x);
        const y = Math.round(creature.y);
        const tile = mapController.tileAt(x, y);
        if (!tile) continue;
        const gameMap = mapController.gameMapAt(x, y);
        if (!gameMap) continue;
        if (!gameMap.discoveredTileIs.has(toI(x, y))) continue;
      }
      ctx.fillStyle = data.getColorByNameSafe(
          'tile selected' + creature.colorSuffix);
      ctx.fillRect(scale * creature.x, scale * creature.y,
          scale * creature.s, scale * creature.s);
    }
    ctx.restore();

    if (DEBUG) debugTrackTimeDone();
  }
}
