class OverworldMapTile {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} seed
   * @param {number} regionId
   */
  constructor(x, y, seed, regionId) {
    this.x = x;
    this.y = y;
    this.seed = seed;
    this.regionId = regionId;
    this.type = '';
    this.level = 1;
    /** @type {!Map.<number, number>} */
    this.doorIds = new Map();
    this.isStart = false;
    this.numSecurityLevels = 1;
    this.keyId = 0;
    this.hasCampfire = false;
    this.hasBoss = false;
    /** @type {!Array.<!Item>} */
    this.loot = [];
  }

  /** @return {string} */
  get npc() {
    return data.getValue('sub regions', this.type, 'npc') || '';
  }

  /** @return {string} */
  get tileset() {
    return data.getValue('sub regions', this.type, 'tileset') || '';
  }

  /** @return {!Array.<string>} */
  get enemyTemplates() {
    return data.getArrayValue('sub regions', this.type, 'enemyTemplates') || [];
  }
}

class OverworldMap {
  /**
   * @param {number} seed
   * @param {number=} optGenLimit
   * @param {(function(string))=} optLogFn
   */
  constructor(seed, optGenLimit, optLogFn) {
    this.seed = seed;
    /** @type {!Map.<number, !OverworldMapTile>} */
    this.tiles = new Map();

    while (true) {
      MetaMap.resetGlobalDoorId();
      if (this.tryGenerate_(optGenLimit, optLogFn)) return;
      this.tiles.clear();
      this.seed += 1;
    }
  }

  /**
   * @param {number=} optGenLimit
   * @param {(function(string))=} optLogFn
   * @return {boolean}
   * @private
   */
  tryGenerate_(optGenLimit, optLogFn) {
    const size = mapOverworldMapSize;
    const goalIs = [
      toI(0, 0),
      toI(size / 2, size - 1),
    ];
    const numSecurityLevels = mechNumTiers * mechRegionsPerTier;
    const tilesPerSecurityLevel = mapRegionSize;
    const branchLimitPerSecurityLevel = 1;
    const directness = 3;
    const branchChance = 40;
    const metaMap = new MetaMap(
        size, size, goalIs, numSecurityLevels, tilesPerSecurityLevel,
        branchLimitPerSecurityLevel, directness, branchChance);
    this.seed = metaMap.generate(this.seed, optGenLimit, optLogFn);
    const rng = seededRNG(this.seed);

    this.translateMetaMapTiles_(metaMap, rng);

    // Format and populate the individual regions of the overworld.
    for (let regionId = 0; regionId < numSecurityLevels; regionId++) {
      if (!this.finishRegion_(regionId, goalIs, metaMap, rng)) return false;
    }
    if (!this.makeOffshoots_(rng)) return false;
    return true;
  }

  /** @param {rng} rng */
  generateLoot(rng) {
    const allSubRegions = data.getCategoryEntriesArray('sub regions') || [];
    for (const type of allSubRegions) {
      const subRegionTiles = [];
      for (const tile of this.tiles.values()) {
        if (tile.type != type) continue;
        subRegionTiles.push(tile);
      }
      if (subRegionTiles.length == 0) {
        if (DEBUG) console.log('--WARNING: unpainted region ' + type);
      } else {
        shuffleArray(subRegionTiles, rng);
        const loot = [];
        const loots = data.getArrayValue('sub regions', type, 'loot');
        if (loots) {
          for (const saveString of loots) {
            loot.push(Item.load(saveString));
          }
        }
        while (loot.length > 0) {
          for (let i = 0; i < subRegionTiles.length && loot.length > 0; i++) {
            const tile = subRegionTiles[i];
            tile.loot.push(loot.pop());
          }
        }
      }
    }
  }

  /**
   * @param {!MetaMap} metaMap
   * @param {rng} rng
   * @private
   */
  translateMetaMapTiles_(metaMap, rng) {
    // Translate tiles.
    for (const metaMapTile of metaMap.tiles.values()) {
      const seed = generateSeed(rng);
      const tile = new OverworldMapTile(
          metaMapTile.x, metaMapTile.y, seed, metaMapTile.securityLevel);
      const i = toI(metaMapTile.x, metaMapTile.y);
      this.tiles.set(i, tile);
      tile.keyId = metaMapTile.keyId;
    }
    // Set tile links.
    for (const metaMapTile of metaMap.tiles.values()) {
      const tile = this.tileAt(metaMapTile.x, metaMapTile.y);
      for (const doorTileI of metaMapTile.doorIds.keys()) {
        tile.doorIds.set(doorTileI, metaMapTile.doorIds.get(doorTileI));
      }
    }
  }

  /**
   * @param {rng} rng
   * @return {boolean}
   * @private
   */
  makeOffshoots_(rng) {
    // Paint offshoot sub-regions.
    const allSubRegions = data.getCategoryEntriesArray('sub regions') || [];
    for (const type of allSubRegions) {
      const offshootFrom = data.getValue('sub regions', type, 'offshootFrom');
      if (!offshootFrom) continue;

      /**
       * @type {!Array.<{
       *   x: number,
       *   y: number,
       *   from: !OverworldMapTile,
       * }>}
       */
      const validSpots = [];
      for (const overworldMapTile of this.tiles.values()) {
        if (overworldMapTile.type != offshootFrom) continue;
        if (overworldMapTile.hasBoss) continue;
        if (overworldMapTile.keyId > 0) continue;
        const tryXY = (x, y) => {
          if (x < 0 || y < 0) return;
          if (x >= mapOverworldMapSize || y >= mapOverworldMapSize) return;
          if (this.tileAt(x, y)) return;
          validSpots.push({x, y, from: overworldMapTile});
        };
        tryXY(overworldMapTile.x - 1, overworldMapTile.y);
        tryXY(overworldMapTile.x + 1, overworldMapTile.y);
        tryXY(overworldMapTile.x, overworldMapTile.y - 1);
        tryXY(overworldMapTile.x, overworldMapTile.y + 1);
      }
      if (validSpots.length == 0) return false;

      // We have an open spot! Yay!
      const spot = getRandomArrayEntry(validSpots, rng);
      const tile = new OverworldMapTile(
          spot.x, spot.y, generateSeed(rng), spot.from.regionId);
      tile.level = spot.from.level;
      tile.type = type;
      tile.doorIds.set(toI(spot.from.x, spot.from.y), 0);
      spot.from.doorIds.set(toI(spot.x, spot.y), 0);
      this.tiles.set(toI(spot.x, spot.y), tile);
    }
    return true;
  }

  /**
   * @param {number} regionId
   * @param {!Array.<number>} goalIs
   * @param {!MetaMap} metaMap
   * @param {rng} rng
   * @return {boolean} success
   * @private
   */
  finishRegion_(regionId, goalIs, metaMap, rng) {
    const regionTiles = [];
    for (const tile of this.tiles.values()) {
      if (tile.regionId != regionId) continue;
      regionTiles.push(tile);
    }

    // Add start and end.
    let isLastRegion = false;
    for (const tile of regionTiles) {
      const i = toI(tile.x, tile.y);
      if (i == goalIs[0]) {
        tile.isStart = true;
      } else if (i == goalIs[1]) {
        tile.hasBoss = true;
        isLastRegion = true;
      }
    }

    // Place the boss in a map that links to the next regionId.
    for (const tile of regionTiles) {
      for (const i of tile.doorIds.keys()) {
        const link = this.tiles.get(i);
        if (!link) continue;
        if (link.regionId != regionId + 1) continue;
        tile.hasBoss = true;
        break;
      }
    }

    // Place campfires.
    if (!this.placeCampfires_(rng, regionTiles)) return false;

    // Assign levels.
    for (let i = 0; i < regionTiles.length; i++) {
      const regionProgress = regionId + (i / regionTiles.length);
      regionTiles[i].level = 1 + Math.floor(
          regionProgress * mechLevelsPerTier / mechRegionsPerTier);
    }

    // Find key map branch and boss map brnach.
    const keyMapBranchTiles = new Set();
    const bossMapBranchTiles = new Set();
    /**
     * @param {number} idx
     * @param {!Set.<!OverworldMapTile>} intoSet
     */
    const exploreBackFrom = (idx, intoSet) => {
      intoSet.add(regionTiles[idx]);
      for (let i = idx; ; i--) {
        const tile = regionTiles[i];
        if (!tile) break;
        const lastI = toI(regionTiles[idx].x, regionTiles[idx].y);
        const doorId = tile.doorIds.get(lastI);
        if (doorId >= 0) {
          idx = i;
          intoSet.add(tile);
        }
      }
    };

    // The key branch goes back from the key, and the boss branch goes back from
    // the boss.
    for (let i = regionTiles.length - 1; i >= 0; i--) {
      if (keyMapBranchTiles.size > 0 && bossMapBranchTiles.size > 0) break;
      const tile = regionTiles[i];
      if (tile.keyId > 0) {
        exploreBackFrom(i, keyMapBranchTiles);
      } else if (tile.hasBoss) {
        exploreBackFrom(i, bossMapBranchTiles);
      }
    }

    // When the key branch and boss branch intersect, remove both!
    // These branches both BEGIN when they split apart!
    for (const tile of Array.from(keyMapBranchTiles)) {
      if (!bossMapBranchTiles.has(tile)) continue;
      keyMapBranchTiles.delete(tile);
      bossMapBranchTiles.delete(tile);
    }

    // The key and boss map branches should be of a minimum size!
    const minLength = 4; // TODO: const?
    if (bossMapBranchTiles.size < minLength) return false;
    if (!isLastRegion && keyMapBranchTiles.size < minLength) return false;

    // Also pick the subset connecting maps.
    const connectingMaps = [];
    for (const tile of regionTiles) {
      if (tile == regionTiles[0]) continue; // Not the first tile!
      if (tile.keyId != 0 || tile.hasBoss) continue; // Nothing important.
      if (tile.doorIds.size != 2) continue; // No dead ends or intersections.
      connectingMaps.push(tile);
    }
    // Remove half of them at random.
    shuffleArray(connectingMaps, rng);
    const randomConnectingMaps = new Set();
    for (let i = 0; i < Math.ceil(connectingMaps.length * 0.35); i++) {
      randomConnectingMaps.add(connectingMaps[i]);
    }

    // Paint sub-regions.
    const allSubRegions = data.getCategoryEntriesArray('sub regions') || [];
    for (const type of allSubRegions) {
      const id = data.getNumberValue('sub regions', type, 'regionId');
      if (id != regionId) continue;

      // Offshoots are not placed in this step.
      const offshootFrom = data.getValue('sub regions', type, 'offshootFrom');
      if (offshootFrom) continue;

      const condition = data.getValue('sub regions', type, 'condition');

      // Paint tiles.
      const subRegionTiles = [];
      for (const tile of regionTiles) {
        if (tile.type) continue;
        if (condition) {
          let conditionMet = false;
          switch (condition) {
            case 'random connecting maps':
              conditionMet = randomConnectingMaps.has(tile);
              break;
            case 'first map':
              conditionMet = tile == regionTiles[0];
              break;
            case 'key map branch':
              conditionMet = keyMapBranchTiles.has(tile);
              break;
            case 'key map':
              conditionMet = tile.keyId != 0;
              break;
            case 'boss map branch':
              conditionMet = bossMapBranchTiles.has(tile);
              break;
            case 'boss map':
              conditionMet = tile.hasBoss;
              break;
          }
          if (!conditionMet) continue;
        }
        tile.type = type;
        subRegionTiles.push(tile);
      }

      // Determine how many security levels each tile should have.
      const securityLevelTickets =
          (data.getArrayValue('sub regions', type, 'securityLevelTickets') ||
          ['1']).map((s) => parseInt(s, 10));
      for (const tile of subRegionTiles) {
        tile.numSecurityLevels = getRandomArrayEntry(securityLevelTickets, rng);
      }
    }

    return true;
  }

  /**
   * @param {rng} rng
   * @param {!Array.<!OverworldMapTile>} tiles
   * @return {boolean} success
   * @private
   */
  placeCampfires_(rng, tiles) {
    for (let j = 0; ; j++) {
      if (j >= 200) return false;
      let numCampfires = Math.ceil(mapRegionSize / 2) - 2;
      const validTiles = new Set();
      const forceTiles = new Set();
      for (const tile of tiles) {
        // Maps with bosses and such cannot have campfires.
        if (tile.keyId > 0 || tile.hasBoss) continue;
        validTiles.add(tile);
        if (tile.isStart) forceTiles.add(tile);
      }
      while (numCampfires > 0) {
        if (validTiles.size == 0) break; // Can't place a tile!
        let tile;
        if (forceTiles.size > 0) {
          tile = getRandomArrayEntry(Array.from(forceTiles), rng);
        } else {
          tile = getRandomArrayEntry(Array.from(validTiles), rng);
        }
        tile.hasCampfire = true;
        numCampfires -= 1;

        // Mark all tiles within a certain radius as invalid.
        const explore = (tile, d) => {
          if (!tile) return;
          if (!validTiles.has(tile)) return; // You're doubling back.
          validTiles.delete(tile);
          if (d >= 1) return; // Stop exploring.
          for (const i of tile.doorIds.keys()) {
            const doorId = tile.doorIds.get(i);
            if (doorId != 0) continue;
            explore(this.tiles.get(i), d + 1);
          }
        };
        explore(tile, 0);
        forceTiles.delete(tile);
      }
      if (numCampfires == 0) break; // Success!
      // Clear campfires.
      for (const tile of tiles) tile.hasCampfire = false;
    }
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?OverworldMapTile}
   */
  tileAt(x, y) {
    return this.tiles.get(toI(x, y));
  }
}
