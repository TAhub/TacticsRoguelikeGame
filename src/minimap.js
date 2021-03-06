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

      const compassThickness = 15;
      const compassRadius = (Math.min(w, h) / 2) - compassThickness;
      const outsideThickness = (calcDistance(w, h) / 2) - compassRadius;

      // Get which tiles should be drawn.
      const drawTiles = new Set();
      const faintDrawTiles = new Set();
      for (const gameMap of mapController.gameMaps.values()) {
        for (const tile of gameMap.tiles.values()) {
          const i = toI(tile.x, tile.y);
          const distance = scale * calcDistance(
              tile.x + 0.5 - active.cX, tile.y + 0.5 - active.cY);
          if (distance > compassRadius * 1.25) continue;
          if (gameMap.discoveredTileIs.has(i)) {
            drawTiles.add(tile);
          } else {
            // If you haven't discovered the tile, but it's next to a tile you
            // have, draw it faintly.
            for (const doorI of tile.doorIds.keys()) {
              if (!gameMap.discoveredTileIs.has(doorI)) continue;
              faintDrawTiles.add(tile);
              break;
            }
          }
        }
      }

      // Draw the tiles.
      for (const set of [faintDrawTiles, drawTiles]) {
        for (const tile of set) {
          const hasItem = tile.item && tile.item.showOnMinimap;
          ctx.fillStyle = data.getColorByNameSafe(
              (hasItem && set == drawTiles) ? 'tile selected' : 'tile');
          if (set == faintDrawTiles) {
            ctx.fillStyle = colorLerp(
                ctx.fillStyle, data.getColorByNameSafe('tile slot back'), 0.5);
          }
          ctx.fillRect(tile.x * scale - 0.25, tile.y * scale - 0.25,
              scale + 0.5, scale + 0.5);
        }
      }

      // Draw walls and doors.
      for (const tile of drawTiles) {
        const i = toI(tile.x, tile.y);
        const tryXY = (xD, yD) => {
          const oTile = mapController.tileAt(tile.x + xD, tile.y + yD);
          if (!oTile) return;
          if (oTile.doorIds.get(i) == 0) return; // No need for a wall!
          const isDoor = oTile.doorIds.has(i);
          ctx.fillStyle = data.getColorByNameSafe(
              isDoor ? 'tile selected over' : 'tile slot back');
          const b = isDoor ? 2 : 1;
          let x = tile.x * scale;
          let y = tile.y * scale;
          let w = 2 * b;
          let h = 2 * b;
          if (xD == 1) {
            h = scale;
            x += scale - b;
          } else {
            w = scale;
            y += scale - b;
          }
          ctx.fillRect(x, y, w, h);
        };
        tryXY(1, 0);
        tryXY(0, 1);
      }

      // Undo the transformations.
      ctx.restore();

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
        ctx.fillStyle = data.getColorByNameSafe('tile text selected');
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
      if (creature.species.hideUIOutOfBattle) continue;
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
      const b = 1;
      ctx.fillRect(scale * creature.x + b, scale * creature.y + b,
          scale * creature.s - 2 * b, scale * creature.s - 2 * b);
    }
    ctx.restore();

    if (DEBUG) debugTrackTimeDone();
  }
}
