class Encounter {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} id
   * @param {number} size
   */
  constructor(x, y, id, size) {
    this.x = x;
    this.y = y;
    this.id = id;
    this.size = size;
  }
}

class GameMapTile {
  /**
   * @param {number} x
   * @param {number} y
   * @param {string} tileset
   */
  constructor(x, y, tileset) {
    this.x = x;
    this.y = y;
    this.th = 0;
    this.tileset = tileset;
    /** @type {!Array.<!Creature>} */
    this.creatures = [];
    /** @type {!Map.<number, number>} */
    this.doorIds = new Map();
    /** @type {!Set.<number>} */
    this.doorFrameIs = new Set();
    /** @type {?Item} */
    this.item;

    this.particleTimer = Math.random();
    /** @type {!Array.<!Particle>} */
    this.cachedParticles = [];

    /** @type {?string} */
    this.cursorColor = null;

    // A cache of 3D values, stored so that they can be re-added later, or
    // disposed of when this object is destroyed.
    /** @type {!Array.<!THREE.BufferGeometry>} */
    this.geometryCache = [];
    /** @type {!Array.<!THREE.Material>} */
    this.materialCache = [];
    /** @type {!Array.<!THREE.Mesh>} */
    this.meshCache = [];

    /** @type {!Array.<{x: number, y: number}>} */
    this.screenSpaceCorners = [];
    this.offScreen = false;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {boolean}
   */
  pointInScreenSpace(x, y) {
    if (this.offScreen) return false;
    if (this.screenSpaceCorners.length == 0) return false;
    const points = this.screenSpaceCorners;
    const cP = {x: 0, y: 0};
    for (const p of points) {
      cP.x += p.x;
      cP.y += p.y;
    }
    cP.x /= 4;
    cP.y /= 4;
    const sign = (p1, p2) => {
      return ((x - p2.x) * (p1.y - p2.y)) -
             ((p1.x - p2.x) * (y - p2.y));
    };
    const inTriangle = (p1, p2) => {
      const d1 = sign(cP, p1);
      const d2 = sign(p1, p2);
      const d3 = sign(p2, cP);
      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      return !hasNeg || !hasPos;
    };
    if (inTriangle(points[0], points[1])) return true;
    if (inTriangle(points[1], points[2])) return true;
    if (inTriangle(points[2], points[3])) return true;
    if (inTriangle(points[3], points[0])) return true;
    return false;
  }

  /** @param {!THREE.PerspectiveCamera} camera */
  calculateScreenSpaceCorners(camera) {
    // These are checked in a specific order, so that each corner is
    // next to each corner adjacent in the list. Or, put another way,
    // no two neighbors in the list order are across from each other.
    this.offScreen = false;
    this.screenSpaceCorners = [
      this.calculateOneScreenSpaceCorner_(camera, 0, 0),
      this.calculateOneScreenSpaceCorner_(camera, 1, 0),
      this.calculateOneScreenSpaceCorner_(camera, 1, 1),
      this.calculateOneScreenSpaceCorner_(camera, 0, 1),
    ];
  }

  /**
   * @param {!THREE.PerspectiveCamera} camera
   * @param {number} xA
   * @param {number} yA
   * @return {{x: number, y: number}} pos
   * @private
   */
  calculateOneScreenSpaceCorner_(camera, xA, yA) {
    const point = new THREE.Vector3(this.x + xA, 0, this.y + yA);
    const vector = point.project(camera);
    vector.x = gfxScreenWidth * (vector.x + 1) / 2;
    vector.y = -gfxScreenHeight * (vector.y - 1) / 2;
    if (vector.z < 0 || vector.z > 1) this.offScreen = true;
    return {x: vector.x, y: vector.y};
  }

  /** @param {?string} color */
  setCursorColor(color) {
    if (this.cursorColor == color) return;
    this.cursorColor = color;
    this.clear3DData();
  }

  /**
   * Unused data has to be cleared manually in THREE.js.
   * See:
   * https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects
   */
  clear3DData() {
    for (const geometry of this.geometryCache) {
      geometry.dispose();
    }
    for (const material of this.materialCache) {
      material.dispose();
    }
    // Meshes do not need to be disposed of, they are cached in this object so
    // they can be re-used later.
    this.geometryCache = [];
    this.materialCache = [];
    this.meshCache = [];
    if (this.item) this.item.clear3DData();
  }

  /**
   * @param {rng} rng
   * @param {string} prefix
   * @return {number}
   * @private
   */
  getSprite_(rng, prefix) {
    const sprites = data.getArrayValue(
        'tilesets', this.tileset, prefix + 'Sprites') || ['0'];
    return parseInt(getRandomArrayEntry(sprites, rng), 10);
  }

  /** @return {string} */
  get lightingColor() {
    return this.getColor_('lighting');
  }

  /** @return {number} */
  get lightingIntensity() {
    return (data.getNumberValue(
        'tilesets', this.tileset, 'lightingIntensity') || 0) / 100;
  }

  /**
   * @param {string} prefix
   * @return {string}
   * @private
   */
  getColor_(prefix) {
    return data.getColorValue(
        'tilesets', this.tileset, prefix + 'Color') || '#FFFFFF';
  }

  /**
   * @param {!THREE.Group} group
   * @param {rng} rng
   * @private
   */
  addFloorToGroup_(group, rng) {
    let material;
    if (this.cursorColor) {
      material = new THREE.MeshBasicMaterial({
        'color': getHexColor(this.cursorColor),
      });
    } else {
      const color = this.getColor_('floor');
      const sprite = this.getSprite_(rng, 'floor');
      material = new THREE.MeshStandardMaterial({
        'map': gfx.getSpriteAsTexture(sprite, color),
      });
    }
    const geometry = new THREE.PlaneGeometry(1, 1);
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(this.x + 0.5, this.th * gfxThScale, this.y + 0.5);
    plane.rotation.x = -Math.PI / 2;
    group.add(plane);

    // Store for later.
    this.geometryCache.push(geometry);
    this.materialCache.push(material);
    this.meshCache.push(plane);
  }

  /**
   * @param {!THREE.Group} group
   * @param {!GameMapTile} oTile
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @private
   */
  addArbitraryLedgeToGroup_(group, oTile, x1, y1, x2, y2) {
    const width = calcDistance(x2 - x1, y2 - y1);
    const height = (this.th - oTile.th) * gfxThScale;
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshStandardMaterial({
      'color': getHexColor(this.getColor_('ledge')),
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(
        (x2 + x1) / 2, (oTile.th * gfxThScale) + height / 2, (y2 + y1) / 2);
    plane.rotation.y = normalizeAngle(calcAngle(x2 - x1, y2 - y1) + Math.PI);
    group.add(plane);

    // Store for later.
    this.geometryCache.push(geometry);
    this.materialCache.push(material);
    this.meshCache.push(plane);
  }

  /**
   * @param {!THREE.Group} group
   * @param {rng} rng
   * @param {number} x1
   * @param {number} y1
   * @param {number} x2
   * @param {number} y2
   * @param {boolean} isDoor
   * @param {boolean} isFrame
   * @private
   */
  addArbitraryWallToGroup_(group, rng, x1, y1, x2, y2, isDoor, isFrame) {
    const width = calcDistance(x2 - x1, y2 - y1);
    const geometry = new THREE.PlaneGeometry(width, 1);
    let color = '';
    let sprite = 0;
    if (isFrame) {
      color = data.getColorByNameSafe('stone wall');
      sprite = 9;
    } else if (isDoor) {
      color = data.getColorByNameSafe('stone wall');
      sprite = 8;
    } else {
      color = this.getColor_('wall');
      sprite = this.getSprite_(rng, 'wall');
    }
    const map = gfx.getSpriteAsTexture(sprite, color);
    const materialProperties = {'map': map};
    if (isFrame) {
      materialProperties['transparent'] = true;
      materialProperties['alphaTest'] = 0.5;
    }
    const material = new THREE.MeshStandardMaterial(materialProperties);
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(
        (x2 + x1) / 2, 0.5 + this.th * gfxThScale, (y2 + y1) / 2);
    plane.rotation.y = calcAngle(x2 - x1, y2 - y1);
    group.add(plane);

    if (width < 1) {
      // Set UV values so that only a bit of the texture is visible.
      const uv = geometry.getAttribute('uv');
      uv['array'][2] = width / gfxTileSize;
      uv['array'][6] = width / gfxTileSize;
    }

    // Store for later.
    this.geometryCache.push(geometry);
    this.materialCache.push(material);
    this.meshCache.push(plane);
  }

  /**
   * @param {number} xW
   * @param {number} yW
   * @param {boolean} end
   * @return {!Array.<number>}
   * @private
   */
  getWallEndPoint_(xW, yW, end) {
    let dX = this.x;
    let dY = this.y;
    if (xW == -1) {
      dY += end ? 1 : 0;
    } else if (xW == 1) {
      dX += 1;
      dY += end ? 0 : 1;
    } else if (yW == -1) {
      dX += end ? 1 : 0;
    } else if (yW == 1) {
      dX += end ? 0 : 1;
      dY += 1;
    }
    return [dX, dY];
  }

  /**
   * @param {!THREE.Group} group
   * @param {rng} rng
   * @param {number} xW
   * @param {number} yW
   * @private
   */
  addWallToGroup_(group, rng, xW, yW) {
    const i = toI(this.x + xW, this.y + yW);
    const isFrame = this.doorFrameIs.has(i);
    if (!isFrame && this.doorIds.has(i) && this.doorIds.get(i) == 0) return;
    const [x1, y1] = this.getWallEndPoint_(xW, yW, false);
    const [x2, y2] = this.getWallEndPoint_(xW, yW, true);
    const isDoor = this.doorIds.has(i);
    this.addArbitraryWallToGroup_(group, rng, x1, y1, x2, y2, isDoor, isFrame);
  }

  /**
   * @param {!THREE.Group} group
   * @param {!MapController} mapController
   * @param {number} xW
   * @param {number} yW
   * @private
   */
  addLedgeToGroup_(group, mapController, xW, yW) {
    const i = toI(this.x + xW, this.y + yW);
    if (!this.doorIds.has(i) || this.doorIds.get(i) != 0) return;
    const oTile = mapController.tileAt(this.x + xW, this.y + yW);
    if (!oTile || oTile.th >= this.th) return;
    const [x1, y1] = this.getWallEndPoint_(xW, yW, false);
    const [x2, y2] = this.getWallEndPoint_(xW, yW, true);
    this.addArbitraryLedgeToGroup_(group, oTile, x1, y1, x2, y2);
  }

  /**
   * @param {!THREE.Group} staticMeshGroup
   * @param {!LightController} lightController
   * @param {!MapController} mapController
   * @param {!THREE.PerspectiveCamera} camera
   */
  addToGroup(staticMeshGroup, lightController, mapController, camera) {
    if (this.item) {
      this.item.addToGroup(staticMeshGroup, lightController, camera,
          this.x + 0.5, this.y + 0.5, this.th);
    }
    if (this.meshCache.length > 0) {
      // No need to make this stuff again!
      for (const mesh of this.meshCache) {
        staticMeshGroup.add(mesh);
      }
      return;
    }
    const rng = seededRNG(1 + toI(this.x, this.y));
    this.addWallToGroup_(staticMeshGroup, rng, -1, 0);
    this.addWallToGroup_(staticMeshGroup, rng, 1, 0);
    this.addWallToGroup_(staticMeshGroup, rng, 0, -1);
    this.addWallToGroup_(staticMeshGroup, rng, 0, 1);
    this.addLedgeToGroup_(staticMeshGroup, mapController, -1, 0);
    this.addLedgeToGroup_(staticMeshGroup, mapController, 1, 0);
    this.addLedgeToGroup_(staticMeshGroup, mapController, 0, -1);
    this.addLedgeToGroup_(staticMeshGroup, mapController, 0, 1);
    this.addFloorToGroup_(staticMeshGroup, rng);
  }

  /** @param {number} elapsed */
  update(elapsed) {
    if (this.item && this.item.contents == Item.Code.Campfire) {
      this.particleTimer += elapsed;
      if (this.particleTimer < 1.5) return;
      this.particleTimer = 0;

      const color = data.getColorByNameSafe('smoke');
      const scatter = 0.05;
      const sprites = [502, 503, 504];
      const scale = 0.5;
      const particle = Particle.makePuffParticle(
          sprites, scale, color, scatter);
      const angle = Math.random() * 2 * Math.PI;
      const radius = Math.random() * 0.25;
      particle.x = this.x + 0.5 + Math.cos(angle) * radius;
      particle.y = this.y + 0.5 + Math.sin(angle) * radius;
      this.cachedParticles.push(particle);
    }
  }
}

class GameMap {
  /**
   * @param {!OverworldMapTile} overworldMapTile
   * @param {number=} optGenLimit
   * @param {(function(string))=} optLogFn
   */
  constructor(overworldMapTile, optGenLimit, optLogFn) {
    this.startI = 0;
    this.centerI =
        toI(Math.floor(mapGameMapSize / 2), Math.floor(mapGameMapSize / 2));

    /** @type {!Map.<number, string>} */
    this.enemyRecords = new Map();

    /** @type {!Set.<number>} */
    this.discoveredTileIs = new Set();

    this.overworldX = overworldMapTile.x;
    this.overworldY = overworldMapTile.y;

    // Determine the goals.
    // Note that the first goal is going to be the point that the map branches
    // from (AKA the "start")... if it isn't, the key system might break.
    const goalIs = [];
    if (overworldMapTile.isStart) {
      // Add the start room!
      goalIs.push(this.centerI);
    }
    /** @type {!Map.<number, number>} */
    const overworldMapIToGoalI = new Map();
    for (const otherMapTileI of overworldMapTile.doorIds.keys()) {
      const otherMapTileX = toX(otherMapTileI);
      const otherMapTileY = toY(otherMapTileI);
      let x = toX(this.centerI);
      let y = toY(this.centerI);
      if (otherMapTileX < overworldMapTile.x) {
        x = 0;
      } else if (otherMapTileX > overworldMapTile.x) {
        x = mapGameMapSize - 1;
      } else if (otherMapTileY < overworldMapTile.y) {
        y = 0;
      } else if (otherMapTileY > overworldMapTile.y) {
        y = mapGameMapSize - 1;
      }
      const i = toI(x, y);
      overworldMapIToGoalI.set(otherMapTileI, i);
      goalIs.push(i);
    }
    if (!overworldMapTile.isStart &&
        (overworldMapTile.doorIds.size == 1 ||
         overworldMapTile.shouldGenerateBoss)) {
      // Add a non-start center room.
      // For example a boss room, or a center room to give a leaf-map shape.
      goalIs.push(this.centerI);
    }

    // Generate the meta map.
    const numSecurityLevels = overworldMapTile.numSecurityLevels;
    const branchLimitPerSecurityLevel = 4;
    let directness = 1;
    const branchChance = 35;
    const tilesPerNumGoalIs = [
      mapGameMapSize * 2,
      mapGameMapSize * 2.5,
      mapGameMapSize * 3,
      mapGameMapSize * 3.5,
    ];
    let tilesPerSecurityLevel =
        (tilesPerNumGoalIs[goalIs.length]) / numSecurityLevels;
    if (data.getBooleanValue('tilesets', overworldMapTile.tileset, 'small')) {
      tilesPerSecurityLevel *= 0.4;
      directness += 2;
    }
    tilesPerSecurityLevel = Math.ceil(tilesPerSecurityLevel);
    const metaMap = new MetaMap(
        mapGameMapSize, mapGameMapSize, goalIs, numSecurityLevels,
        tilesPerSecurityLevel, branchLimitPerSecurityLevel, directness,
        branchChance);
    overworldMapTile.seed = metaMap.generate(
        overworldMapTile.seed, optGenLimit, optLogFn);

    /** @type {!Map.<number, !GameMapTile>} */
    this.tiles = new Map();
    if (metaMap.tiles.size == 0) return; // It failed...

    // Make the meta-map into the actual tiles, with actual contents.
    const rng = seededRNG(overworldMapTile.seed);
    const notUpscaledTiles = this.translateTilesInitial_(
        metaMap, rng, overworldMapTile, overworldMapIToGoalI);
    this.upscaleTiles_(notUpscaledTiles, rng, mapTileUpscale, mapTileUpscale);
    const firstUpscaleTiles = this.tiles;
    this.tiles = new Map();
    this.upscaleTiles_(firstUpscaleTiles, rng, mapSecondTileUpscale,
        mapTileUpscale * mapSecondTileUpscale, 'second upscale');
    if (overworldMapTile.hasCampfire) {
      this.placeObject_(rng, Item.Code.Campfire);
    }
    if (overworldMapTile.lampColorName) {
      const numLamps = Math.round(mapGameMapSize * mapGameMapSize *
          (rng() * 0.75 + 0.5) *
          mapTileUpscale * mapSecondTileUpscale / 30);
      for (let i = 0; i < numLamps; i++) {
        this.placeObject_(rng, Item.Code.Lamp, overworldMapTile.lampColorName);
      }
    }
    this.setTerrainHeights_();
    this.placeSpikes_(rng, overworldMapTile);
  }

  /** @private */
  setTerrainHeights_() {
    let cellularThMap = new Map();
    const size = mapGameMapSize * mapTileUpscale * mapSecondTileUpscale;
    const rng = seededRNG(1 + toI(this.overworldX, this.overworldY));

    // Initial state.
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        cellularThMap.set(toI(x, y), rng() < 0.47);
      }
    }

    // Cellular steps.
    for (let step = 0; step < 5; step++) {
      const newCellularThMap = new Map();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          let surrounding = 0;
          // The edges are always false.
          if (x > 0 && y > 0 && x < size - 1 && y < size - 1) {
            for (let y2 = y - 1; y2 <= y + 1; y2++) {
              for (let x2 = x - 1; x2 <= x + 1; x2++) {
                surrounding += cellularThMap.get(toI(x2, y2)) ? 1 : 0;
              }
            }
          }
          newCellularThMap.set(toI(x, y), surrounding >= 5);
        }
      }
      cellularThMap = newCellularThMap;
    }

    // Choose th values for tiles.
    const tileset = this.tiles.values().next().value.tileset;
    const baseTh = data.getNumberValue('tilesets', tileset, 'baseTh') || 0;
    const noiseTh = data.getNumberValue('tilesets', tileset, 'noiseTh');
    const cellularTh = data.getNumberValue('tilesets', tileset, 'cellularTh');
    for (const tile of this.tiles.values()) {
      const noise = rng() < 0.15;
      const cellular =
          cellularThMap.get(toI(tile.x - this.xOff, tile.y - this.yOff));
      if (noise && noiseTh != null) {
        tile.th = noiseTh;
      } else if (cellular && cellularTh != null) {
        tile.th = cellularTh;
      } else {
        tile.th = baseTh;
      }
    }
  }

  /** @param {!THREE.Group} group */
  addAmbientLight(group) {
    const sampleTile = this.tiles.values().next().value;
    if (!sampleTile) return;
    const i = sampleTile.lightingIntensity;
    if (i == 0) return;
    const color = getHexColor(sampleTile.lightingColor);
    const s = mapGameMapSize * mapTileUpscale * mapSecondTileUpscale;
    const x = this.xOff + (s / 2);
    const y = this.yOff + (s / 2);
    const h = 2;
    const light = new THREE.RectAreaLight(color, i, s, s);
    light.position.set(x, h, y);
    light.lookAt(x, 0, y);
    group.add(light);
  }

  /**
   * @param {rng} rng
   * @param {!OverworldMapTile} overworldMapTile
   * @private
   */
  placeSpikes_(rng, overworldMapTile) {
    const minSpikes = overworldMapTile.minSpikes;
    const maxSpikes = overworldMapTile.maxSpikes;
    let numSpikes = (maxSpikes - minSpikes + 1) * rng() + minSpikes;
    if (numSpikes <= 0) return;

    const tickets = [];
    for (const tile of this.tiles.values()) {
      if (tile.item) continue;
      let numTickets = 3;
      for (const doorI of tile.doorIds.keys()) {
        if (tile.doorIds.get(doorI) > 0) {
          // Don't put spikes by doors, probably.
          numTickets -= 4;
        } else {
          // A spike in a corner is boring. More doors, the better!
          numTickets += 1;
          // Try to spread the spikes out, however.
          const otherTile = this.tiles.get(doorI);
          if (otherTile && otherTile.item) {
            numTickets -= 2;
          }
        }
      }
      for (let i = 0; i < numTickets; i++) {
        tickets.push(tile);
      }
    }

    shuffleArray(tickets, rng);
    for (const tile of tickets) {
      if (tile.item) continue;
      tile.item = new Item(Item.Code.Spikes);
      tile.item.tier = tierForLevel(overworldMapTile.level);
      numSpikes -= 1;
      if (numSpikes <= 0) return;
    }
  }

  /**
   * @param {rng} rng
   * @param {!Item.Code} itemCode
   * @param {string=} optColorName
   * @private
   */
  placeObject_(rng, itemCode, optColorName) {
    const tickets = [];
    for (const tile of this.tiles.values()) {
      if (tile.item || tile.creatures.length > 0) continue;
      let numTickets = 0;

      // The more open tiles around this one, the better.
      let openAdjacentTiles = 0;
      for (const i of tile.doorIds.keys()) {
        const doorId = tile.doorIds.get(i);
        if (doorId != 0) continue;
        const other = this.tiles.get(i);
        if (!other) continue; // It's a path to another map! Ignore it.
        if (other.item || other.creatures.length > 0) continue;
        openAdjacentTiles += 1;
      }
      numTickets += openAdjacentTiles * 5;

      // The closer to the center, the better.
      const distanceToCenter =
          calcDistance(tile.x - toX(this.centerI), tile.y - toY(this.centerI));
      const finalSize = mapGameMapSize * mapTileUpscale * mapSecondTileUpscale;
      numTickets += Math.max(0, Math.ceil(
          10 * (finalSize - distanceToCenter) / finalSize));

      // Add that many tickets.
      for (let i = 0; i < numTickets; i++) tickets.push(tile);
    }
    if (tickets.length == 0) {
      // TODO: uh-oh?
    } else {
      const tile = getRandomArrayEntry(tickets, rng);
      tile.item = new Item(itemCode);
      if (optColorName) tile.item.colorName = optColorName;
    }
  }

  /**
   * @param {!Map.<number, !GameMapTile>} notUpscaledTiles
   * @param {number} notUpscaledI
   * @param {boolean} nullReplacerMode
   * @param {number} xS
   * @param {number} yS
   * @param {rng} rng
   * @param {number} upscale
   * @param {string=} optForceTileset
   * @return {boolean} success
   * @private
   */
  upscaleTile_(
      notUpscaledTiles, notUpscaledI, nullReplacerMode, xS, yS, rng, upscale,
      optForceTileset) {
    const notUpscaledTile = notUpscaledTiles.get(notUpscaledI);
    const tileset = notUpscaledTile.tileset;

    const minusX = notUpscaledTile.doorIds.has(notUpscaledI - 1);
    const plusX = notUpscaledTile.doorIds.has(notUpscaledI + 1);
    const minusY = notUpscaledTile.doorIds.has(notUpscaledI - mapMaxMapWidth);
    const plusY = notUpscaledTile.doorIds.has(notUpscaledI + mapMaxMapWidth);

    // Get join type.
    let joinType = '';
    let numRotates = 0;
    switch (notUpscaledTile.doorIds.size) {
      case 1:
        joinType = 'N';
        if (minusX) numRotates = 0;
        else if (minusY) numRotates = 1;
        else if (plusX) numRotates = 2;
        else if (plusY) numRotates = 3;
        break;
      case 2:
        if (minusX && plusX) {
          joinType = 'I';
          numRotates = rng() < 0.5 ? 2 : 0;
        } else if (minusY && plusY) {
          joinType = 'I';
          numRotates = rng() < 0.5 ? 3 : 1;
        } else {
          joinType = 'L';
          if (minusX && plusY) numRotates = 0;
          else if (minusX && minusY) numRotates = 1;
          else if (plusX && minusY) numRotates = 2;
          else if (plusX && plusY) numRotates = 3;
        }
        break;
      case 3:
        joinType = 'T';
        if (!plusX) numRotates = 0;
        else if (!plusY) numRotates = 1;
        else if (!minusX) numRotates = 2;
        else if (!minusY) numRotates = 3;
        break;
      case 4:
        joinType = 'H';
        numRotates = Math.floor(rng() * 4);
        break;
    }

    // Pick a replacer.
    let replacerType = 'null';
    if (!nullReplacerMode) {
      const replacersTileset = optForceTileset ||
          data.getValue('tilesets', tileset, 'inheritJoinsFrom') || tileset;
      const replacers = data.getArrayValue(
          'tilesets', replacersTileset, 'replacers' + joinType + 'Joins');
      if (replacers) {
        replacerType = getRandomArrayEntry(replacers, rng);
      }
    }

    // Get the array for that replacer.
    let replacerArray = [];
    for (let line = 0; line < upscale; line++) {
      const text = data.getValue('tile replacers', replacerType, 'l' + line);
      if (!text) {
        for (let i = 0; i < upscale; i++) {
          replacerArray.push('X');
        }
      } else {
        for (const char of text.split('')) {
          replacerArray.push(char);
        }
      }
    }
    const toReplacerI = (x, y) => x + (y * upscale);

    // Rotate replacer based on join type.
    for (let i = 0; i < numRotates; i++) {
      const newReplacerArray = [];
      for (let y = 0; y < upscale; y++) {
        for (let x = 0; x < upscale; x++) {
          newReplacerArray[toReplacerI(x, y)] =
              replacerArray[toReplacerI(y, upscale - x - 1)];
        }
      }
      replacerArray = newReplacerArray;
    }

    // Upscale the tiles.
    let itemPlaced = false;
    for (let y = 0; y < upscale; y++) {
      for (let x = 0; x < upscale; x++) {
        const char = replacerArray[toReplacerI(x, y)];
        if (char == 'X') continue; // Does not exist.
        const tile = new GameMapTile(xS + x, yS + y, tileset);
        this.tiles.set(toI(tile.x, tile.y), tile);
        if (x == 1 && y == 1) {
          tile.item = notUpscaledTile.item;
          itemPlaced = true;
        }
      }
    }
    if (!itemPlaced && notUpscaledTile.item) {
      // You failed to place an item here! Try again.
      return false;
    }

    // Link tiles internally.
    for (let y = 0; y < upscale; y++) {
      for (let x = 0; x < upscale; x++) {
        const tile = this.tileAt(xS + x, yS + y);
        if (!tile) continue;
        /**
         * @param {number} xA
         * @param {number} yA
         */
        const internalLink = (xA, yA) => {
          const otherTile = this.tileAt(xS + x + xA, yS + y + yA);
          if (!otherTile) return;
          tile.doorIds.set(toI(otherTile.x, otherTile.y), 0);
          otherTile.doorIds.set(toI(tile.x, tile.y), 0);
          // TODO: maybe not every internal tile link will exist? based on
          // the replacer...
        };
        if (x > 0) internalLink(-1, 0);
        if (y > 0) internalLink(0, -1);
      }
    }

    // Link tiles externally, based on the non-upscaled tiles links.
    const placedDoorIs = new Set();
    for (let y = 0; y < upscale; y++) {
      for (let x = 0; x < upscale; x++) {
        const tile = this.tileAt(x + xS, y + yS);
        if (!tile) continue;
        const doorIds = new Map();
        for (const doorI of notUpscaledTile.doorIds.keys()) {
          const doorId = notUpscaledTile.doorIds.get(doorI);
          let centerOnly = doorId != 0;
          if (!notUpscaledTiles.has(doorI)) {
            // The other tile is off the map... this has to be in the center,
            // since this replacer has no way of knowing where the
            // corresponding exit will be otherwise.
            centerOnly = true;
          }
          if (!centerOnly || y == 1) {
            if (x == 0 && toX(doorI) < notUpscaledTile.x) {
              doorIds.set(toI(tile.x - 1, tile.y), doorId);
              placedDoorIs.add(doorI);
            }
            if (x == upscale - 1 && toX(doorI) > notUpscaledTile.x) {
              doorIds.set(toI(tile.x + 1, tile.y), doorId);
              placedDoorIs.add(doorI);
            }
          }
          if (!centerOnly || x == 1) {
            if (y == 0 && toY(doorI) < notUpscaledTile.y) {
              doorIds.set(toI(tile.x, tile.y - 1), doorId);
              placedDoorIs.add(doorI);
            }
            if (y == upscale - 1 && toY(doorI) > notUpscaledTile.y) {
              doorIds.set(toI(tile.x, tile.y + 1), doorId);
              placedDoorIs.add(doorI);
            }
          }
        }
        for (const i of doorIds.keys()) {
          if (tile.doorIds.has(i)) continue;
          tile.doorIds.set(i, doorIds.get(i));
          const otherTile = this.tileAt(toX(i), toY(i));
          if (otherTile) {
            otherTile.doorIds.set(toI(tile.x, tile.y), doorIds.get(i));
          }
        }
      }
    }

    // This fails if the replace won't link up.
    for (const doorI of notUpscaledTile.doorIds.keys()) {
      if (!placedDoorIs.has(doorI)) {
        // This replacer won't link up. Try again, with the "null" replacer.
        return false;
      }
    }

    // For any lack-of-tiles, remove any incoming links. In case something
    // made a link to this spot, assuming there'd be a tile here.
    for (let y = 0; y < upscale; y++) {
      for (let x = 0; x < upscale; x++) {
        if (this.tileAt(x + xS, y + yS)) continue;
        const i = toI(x + xS, y + yS);
        const checkXY = (x, y) => {
          const tile = this.tileAt(x, y);
          if (!tile) return;
          tile.doorIds.delete(i);
        };
        checkXY(x + xS - 1, y + yS);
        checkXY(x + xS + 1, y + yS);
        checkXY(x + xS, y + yS - 1);
        checkXY(x + xS, y + yS + 1);
      }
    }

    return true;
  }

  /**
   * @param {!Map.<number, !GameMapTile>} notUpscaledTiles
   * @param {rng} rng
   * @param {number} upscale
   * @param {number} totalUpscale
   * @param {string=} optForceTileset
   * @private
   */
  upscaleTiles_(notUpscaledTiles, rng, upscale, totalUpscale, optForceTileset) {
    const centerOff = Math.floor(mapGameMapSize * totalUpscale / 2);
    this.centerI = toI(this.xOff + centerOff, this.yOff + centerOff);

    for (const notUpscaledI of notUpscaledTiles.keys()) {
      const xS = this.xOff + (toX(notUpscaledI) - this.xOff) * upscale;
      const yS = this.yOff + (toY(notUpscaledI) - this.yOff) * upscale;
      const isStart = this.startI == notUpscaledI;

      let success = false;
      for (let i = 0; i < 3; i++) {
        // Try in normal replacer mode.
        success = this.upscaleTile_(notUpscaledTiles, notUpscaledI, false,
            xS, yS, rng, upscale, optForceTileset);
        if (success && isStart) {
          // It's not a success if this covers up the startI!
          if (!this.tileAt(toX(this.startI), toY(this.startI))) {
            success = false;
          }
        }
        if (success) break;

        // Clear whatever was placed in the last try.
        for (let y = 0; y < upscale; y++) {
          for (let x = 0; x < upscale; x++) {
            const tile = this.tileAt(x + xS, y + yS);
            if (!tile) continue;
            for (const i of tile.doorIds.keys()) {
              const otherTile = this.tiles.get(i);
              if (!otherTile) continue;
              otherTile.doorIds.delete(toI(tile.x, tile.y));
            }
          }
        }
        for (let y = 0; y < upscale; y++) {
          for (let x = 0; x < upscale; x++) {
            this.tiles.delete(toI(x + xS, y + yS));
          }
        }
      }

      if (!success) {
        // If the normal replacer fails, use a null replacer.
        this.upscaleTile_(
            notUpscaledTiles, notUpscaledI, true, xS, yS, rng, upscale);
      }
    }

    // Clean up null links.
    let maxX = 0;
    let maxY = 0;
    for (const tile of this.tiles.values()) {
      maxX = Math.max(tile.x, maxX);
      maxY = Math.max(tile.y, maxY);
    }
    for (const tile of this.tiles.values()) {
      for (const i of tile.doorIds.keys()) {
        const x = toX(i);
        const y = toY(i);
        // Don't care about offscreen maps!
        if (x < this.xOff || y < this.yOff) continue;
        if (x >= this.xOff + mapGameMapSize * totalUpscale) continue;
        if (y >= this.yOff + mapGameMapSize * totalUpscale) continue;
        if (!this.tileAt(x, y)) {
          tile.doorIds.delete(i);
        }
      }
    }
    // TODO: I have no idea why adding these links then removing the broken ones
    // doesn't leave the whole thing broken...? But it doesn't.

    if (this.startI) this.startI = this.centerI;
  }

  /**
   * @param {!MetaMap} metaMap
   * @param {rng} rng
   * @param {!OverworldMapTile} overworldMapTile
   * @param {!Map.<number, number>} overworldMapIToGoalI
   * @return {!Map.<number, !GameMapTile>}
   * @private
   */
  translateTilesInitial_(metaMap, rng, overworldMapTile, overworldMapIToGoalI) {
    const tiles = new Map();

    // Translate tiles.
    for (const metaMapTile of metaMap.tiles.values()) {
      const tile = new GameMapTile(
          metaMapTile.x + this.xOff, metaMapTile.y + this.yOff,
          overworldMapTile.tileset);
      if (metaMapTile.keyId) {
        tile.item = new Item(Item.Code.Key);
        tile.item.keyCode = metaMapTile.keyId;
        tile.item.colorName = 'bronze';
      }
      tiles.set(toI(tile.x, tile.y), tile);
      if (toI(metaMapTile.x, metaMapTile.y) == this.centerI) {
        if (overworldMapTile.isStart) {
          this.startI = toI(tile.x, tile.y);
        } else if (overworldMapTile.keyId) {
          if (tile.keyId) {
            // Uh-oh!
            console.log('WARNING: Two keys are overlapping!');
            // TODO: error or something?
          }
          tile.item = new Item(Item.Code.Key);
          tile.item.keyCode = overworldMapTile.keyId;
          tile.item.colorName = 'silver';
        }
      }
    }
    // Set tile links.
    for (const metaMapTile of metaMap.tiles.values()) {
      const tile = tiles.get(toI(
          metaMapTile.x + this.xOff, metaMapTile.y + this.yOff));
      for (const doorTileI of metaMapTile.doorIds.keys()) {
        const doorTileX = toX(doorTileI) + this.xOff;
        const doorTileY = toY(doorTileI) + this.yOff;
        tile.doorIds.set(
            toI(doorTileX, doorTileY), metaMapTile.doorIds.get(doorTileI));
      }
      // Sometimes link together tiles with adjacent tiles of the SAME
      // security level. This allows for circular paths in maps, to somewhat
      // disguise the fact that meta-maps are all trees.
      const tryXY = (x, y) => {
        const oI = toI(x, y);
        if (tile.doorIds.has(oI)) return; // Already linked.
        const otherTile = tiles.get(toI(x, y));
        if (!otherTile) return; // No tile there.
        const otherMetaMapTile = metaMap.tileAt(x - this.xOff, y - this.yOff);
        if (!otherMetaMapTile) return; // No tile there...
        if (otherMetaMapTile.securityLevel != metaMapTile.securityLevel) {
          // It's insecure to link these together!
          return;
        }
        // TODO: link chance based on tileset? some could even have like 90%...
        if (rng() > 0.2) return; // It's only a chance.
        const i = toI(tile.x, tile.y);
        tile.doorIds.set(oI, 0);
        otherTile.doorIds.set(i, 0);
      };
      tryXY(tile.x - 1, tile.y);
      tryXY(tile.x, tile.y - 1);
      // Only try negative, so as not to "double try" each link.
    }

    // Expand tiles with extra space around them.
    // TODO: do so... chance based on tileset?

    // Attach exits to other maps.
    for (const overworldI of overworldMapTile.doorIds.keys()) {
      const overworldX = toX(overworldI);
      const overworldY = toY(overworldI);
      const i = overworldMapIToGoalI.get(overworldI);
      let x = toX(i) + this.xOff;
      let y = toY(i) + this.yOff;
      const tile = tiles.get(toI(x, y));
      if (!tile) continue;
      x += overworldX - overworldMapTile.x;
      y += overworldY - overworldMapTile.y;
      tile.doorIds.set(toI(x, y), overworldMapTile.doorIds.get(overworldI));
    }

    return tiles;
  }

  /** @return {number} */
  get xOff() {
    return this.overworldX * mapGameMapSize *
        mapTileUpscale * mapSecondTileUpscale;
  }

  /** @return {number} */
  get yOff() {
    return this.overworldY * mapGameMapSize *
        mapTileUpscale * mapSecondTileUpscale;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?GameMapTile}
   */
  tileAt(x, y) {
    return this.tiles.get(toI(x, y));
  }

  /**
   * @param {!GameMapTile} center
   * @return {!Array.<!GameMapTile>}
   * @private
   */
  getEncounterTerritory_(center) {
    const tiles = new Set();
    tiles.add(center);
    const expand = (tile, distance) => {
      if (distance >= 5) return;
      for (const i of tile.doorIds.keys()) {
        if (tile.doorIds.get(i) != 0) continue;
        const otherTile = this.tiles.get(i);
        if (!otherTile || tiles.has(otherTile)) continue;
        tiles.add(otherTile);
        expand(otherTile, distance + 1);
      }
    };
    expand(center, 0);
    return Array.from(tiles);
  }

  /**
   * @param {rng} rng
   * @param {!OverworldMapTile} overworldMapTile
   * @param {!Array.<!Encounter>} encounters
   * @return {!Array.<!Creature>}
   * @private
   */
  generateCreaturesOverall_(rng, overworldMapTile, encounters) {
    let boss;
    if (overworldMapTile.bossTemplate) {
      boss = Creature.makeFromTemplate(
          overworldMapTile.bossTemplate, generateSeed(rng));
    }

    const level = overworldMapTile.level;
    const samplePlayer = Creature.makeSamplePlayerAtLevel(level);
    let generationPoints = samplePlayer.generationPoints * mechNumPlayers;
    if (overworldMapTile.bossMap) {
      generationPoints *= (boss && boss.finalBoss) ? 1.9 : 1.6;
    } else if (overworldMapTile.keyId > 0 ||
               overworldMapTile.offshootBossTemplate) {
      generationPoints *= 1.25;
    }
    generationPoints *= 1 + (encounters.length - 1) * 0.25;
    generationPoints *= Math.min(1, 0.6 + level * 0.15);
    if (overworldMapTile.isStart) generationPoints *= 0.6;

    const templates = overworldMapTile.enemyTemplates;

    if (templates.length == 0) {
      console.log('WARNING: Sub-region #' +
                  overworldMapTile.regionId + ' has no templates!');
      samplePlayer.side = Creature.Side.Enemy;
      return [samplePlayer];
    }

    const creatures = [];
    if (overworldMapTile.shouldGenerateBoss) {
      if (!boss) {
        console.log('WARNING: Sub-region #' + overworldMapTile.regionId +
                    ' has no boss template!');
        boss = Creature.makeSamplePlayerAtLevel(level);
      }
      creatures.push(boss);
      generationPoints -= boss.generationPoints;
    }
    while (generationPoints > 0) {
      const validCreatures = templates.map((template) => {
        return Creature.makeFromTemplate(template, generateSeed(rng));
      }).filter((creature) => creature.generationPoints <= generationPoints);
      if (validCreatures.length == 0) break;
      const creature = getRandomArrayEntry(validCreatures, rng);
      creatures.push(creature);
      generationPoints -= creature.generationPoints;
    }

    return creatures;
  }

  /**
   * @param {rng} rng
   * @param {!Array.<!Creature>} creatures
   * @param {!Array.<!Encounter>} encounters
   * @param {!OverworldMapTile} overworldMapTile
   * @return {!Promise.<!Map.<!Encounter, !Array.<!Creature>>>}
   * @private
   */
  async splitCreaturesForEncounters_(
      rng, creatures, encounters, overworldMapTile) {
    const combination = new Map();

    /**
     * @param {!Creature} creature
     * @param {!Encounter} encounter
     */
    const addCreatureToEncounter = (creature, encounter) => {
      // Remove creature from circulation.
      const idx = creatures.indexOf(creature);
      creatures.splice(idx, 1);

      // Add to that part of the combination.
      const array = combination.get(encounter) || [];
      array.push(creature);
      combination.set(encounter, array);
    };

    let totalSize = 0;
    for (const encounter of encounters) {
      totalSize += encounter.size;
    }

    let totalPoints = 0;
    for (const creature of creatures) {
      totalPoints += creature.generationPoints;
    }
    const expectedPointsPerSize = totalPoints / totalSize;

    /**
     * @param {!Encounter} encounter
     * @return {number}
     */
    const generationPointsLeftForEncounter = (encounter) => {
      const array = combination.get(encounter) || [];
      let points = expectedPointsPerSize * encounter.size;
      for (const creature of array) {
        points -= creature.generationPoints;
      }
      return points;
    };

    if (overworldMapTile.shouldGenerateBoss) {
      // Put the boss into the boss encounter.
      addCreatureToEncounter(creatures[0], encounters[0]);
    }

    // Round-robin claim creatures at random.
    while (true) {
      const creaturesLengthBefore = creatures.length;
      for (const encounter of encounters) {
        const points = generationPointsLeftForEncounter(encounter);
        const validCreatures = creatures.filter((creature) => {
          return creature.generationPoints <= points;
        });
        if (validCreatures.length == 0) continue;
        const creature = getRandomArrayEntry(validCreatures, rng);
        addCreatureToEncounter(creature, encounter);
      }
      if (creaturesLengthBefore == creatures.length) break; // Done!
      await tinyWait();
    }

    // Sort by points remaining, highest to lowest, so that the
    // encounter that needs creatures most gets first pick in the
    // next stage.
    encounters.sort((a, b) => {
      return generationPointsLeftForEncounter(b) -
             generationPointsLeftForEncounter(a);
    });

    // Just give leftover creatures out.
    while (creatures.length > 0) {
      for (const encounter of encounters) {
        addCreatureToEncounter(creatures[0], encounter);
        if (creatures.length == 0) break;
      }
    }

    return combination;
  }

  /**
   * @param {!OverworldMapTile} overworldMapTile
   * @param {rng} rng
   */
  distributeLoot(overworldMapTile, rng) {
    if (overworldMapTile.loot.length == 0) return;
    const tiles = new Set();
    const fallbackTiles = new Set();
    for (const tile of this.tiles.values()) {
      if (tile.item) continue;
      if (tile.creatures.length > 0) continue;
      tiles.add(tile);
    }
    for (const item of overworldMapTile.loot) {
      const set = tiles.size > 0 ? tiles : fallbackTiles;
      const tickets = [];
      for (const tile of set) {
        // Dead ends and corners are more likely to get an item.
        const numTickets = 5 - tile.doorIds.size;
        for (let i = 0; i < numTickets; i++) tickets.push(tile);
      }
      const tile = getRandomArrayEntry(tickets, rng);
      tile.item = item;
      const eliminate = (x, y) => {
        const tile = this.tileAt(x, y);
        if (!tile) return;
        if (!tiles.has(tile)) return;
        tiles.delete(tile);
        fallbackTiles.add(tile);
      };
      eliminate(tile.x, tile.y);
      eliminate(tile.x - 1, tile.y);
      eliminate(tile.x + 1, tile.y);
      eliminate(tile.x, tile.y - 1);
      eliminate(tile.x, tile.y + 1);
      fallbackTiles.delete(tile);
    }
  }

  /**
   * @param {!OverworldMapTile} overworldMapTile
   * @param {rng} rng
   * @param {number} encounterTally
   * @return {!Promise.<?Array.<!Creature>>} encounterTally
   * @private
   */
  async generateEncountersInner_(overworldMapTile, rng, encounterTally) {
    if (overworldMapTile.enemyTemplates.length == 0) return [];
    const numEncounters = overworldMapTile.bossMap ? 3 : 4;
    const encounters = [];

    // Pre-filter tiles, to get rid of tiles that wouldn't make good encounters.
    const validTiles = new Set();
    for (const tile of this.tiles.values()) {
      if (this.startI) {
        const fromStart = Math.abs(toX(this.startI) - tile.x) +
                          Math.abs(toY(this.startI) - tile.y);
        if (fromStart < 10) continue; // Too close to the start!
      }

      const territory = this.getEncounterTerritory_(tile);
      if (territory.length < 7) continue; // Too cramped!

      let nearCampfire = false;
      for (const tile of territory) {
        if (!tile.item || tile.item.contents != Item.Code.Campfire) continue;
        nearCampfire = true;
        break;
      }
      if (nearCampfire) continue; // Too close to a campfire!

      validTiles.add(tile);
    }

    // Pick spots for the encounters.
    for (let j = 0; j < numEncounters; j++) {
      let size = 2; // TODO: higher size for "big encounters"
      let tile;
      if (j == 0 && overworldMapTile.shouldGenerateBoss) {
        // This is the boss encounter!
        size = 6;
        // Put it in the center, or as close to the center as possible!
        let bestDistance = 999;
        for (const possibility of this.tiles.values()) {
          if (possibility.creatures.length > 0) continue;
          const distance = Math.abs(toX(this.centerI) - possibility.x) +
                           Math.abs(toY(this.centerI) - possibility.y);
          if (distance >= bestDistance) continue;
          bestDistance = distance;
          tile = possibility;
        }
      } else {
        /** @type {!Map.<!GameMapTile, number>} */
        const tileDistances = new Map();
        let averageDistance = 0;
        for (const tile of validTiles) {
          let distance = 100; // Purposefully a low maximum...
          for (const encounter of encounters) {
            distance = Math.min(distance, Math.abs(encounter.x - tile.x) +
                                          Math.abs(encounter.y - tile.y));
          }
          averageDistance += distance;
          tileDistances.set(tile, distance);
        }
        if (tileDistances.size == 0) {
          return null; // Uh-oh! Try again!
        }
        averageDistance /= tileDistances.size;

        // Filter out everything that is CLOSER than the average distance!
        // We don't want encounters to get too close to each other.
        const possibleTiles = [];
        for (const tile of tileDistances.keys()) {
          const distance = tileDistances.get(tile);
          if (distance < averageDistance) continue;
          possibleTiles.push(tile);
        }
        tile = getRandomArrayEntry(possibleTiles, rng);
      }
      if (!tile) {
        return null; // Uh-oh! Try again!
      }
      encounters.push(new Encounter(tile.x, tile.y, encounterTally++, size));
    }

    // Make creatures overall.
    const allCreatures = this.generateCreaturesOverall_(
        rng, overworldMapTile, encounters);

    // Split more-or-less evenly.
    const splitCreatures = await this.splitCreaturesForEncounters_(
        rng, allCreatures, encounters, overworldMapTile);

    // Pick enemies for each encounter.
    const bannedTiles = new Set();
    const enemies = [];
    for (const encounter of encounters) {
      const tile = /** @type {!GameMapTile} */ (this.tileAt(
          encounter.x, encounter.y));
      const territory = this.getEncounterTerritory_(tile);

      const encounterEnemies = splitCreatures.get(encounter) || [];

      // All enemies in the encounter start out "asleep", linked to it.
      for (const enemy of encounterEnemies) {
        enemy.encounterId = encounter.id;
      }

      // Pick spots for the enemies!
      for (const enemy of encounterEnemies) {
        let success = false;
        while (!success) {
          if (territory.length == 0) {
            return null; // Uh-oh! Try again!
          }
          const tile = territory.shift();
          // Are all of the tiles present and linked?
          if (!enemy.fitsInSpot(this, tile.x, tile.y, false)) continue;
          // Is there any overlap with other people?
          let overlap = false;
          enemy.tileCallback(this, tile.x, tile.y, (tile) => {
            if (!tile) return;
            if (bannedTiles.has(tile)) overlap = true;
          });
          if (overlap) continue;
          // Don't put people in spikes.
          let hasSpike = false;
          enemy.tileCallback(this, tile.x, tile.y, (tile) => {
            if (hasSpike) return;
            if (!tile || !tile.item) return;
            hasSpike = tile.item.spikeDamage > 0;
          });
          if (!hasSpike) continue;

          // Now that we know this is a valid spot, finalize the choice and
          // ban all of the tiles the creature will go in for future people.
          enemy.tileCallback(this, tile.x, tile.y, (tile) => {
            if (!tile) return;
            bannedTiles.add(tile);
          });
          enemy.x = tile.x;
          enemy.y = tile.y;
          enemies.push(enemy);
          success = true;
          await tinyWait();
        }
      }
    }

    return enemies;
  }

  /**
   * @param {!OverworldMapTile} overworldMapTile
   * @param {rng} rng
   * @param {number} encounterTally
   * @return {!Promise.<?Array.<!Creature>>} encounterTally
   */
  async generateEncounters(overworldMapTile, rng, encounterTally) {
    let enemies = await this.generateEncountersInner_(
        overworldMapTile, rng, encounterTally);

    // After all of the enemies have been added, add the NPC (if any).
    if (overworldMapTile.npc) {
      const validTiles = [];
      for (const tile of this.tiles.values()) {
        if (tile.creatures.length > 0) continue;
        if (tile.item) continue;
        let tooClose = false;
        for (const enemy of (enemies || [])) {
          const dist = Math.abs(enemy.x - tile.x) + Math.abs(enemy.y - tile.y);
          if (dist > 6) continue;
          tooClose = true;
          break;
        }
        if (tooClose) continue;
        validTiles.push(tile);
      }
      // If the NPC cannot find a place to spawn, try again.
      if (validTiles.length == 0) {
        return this.generateEncounters(overworldMapTile, rng, encounterTally);
      }
      const tile = getRandomArrayEntry(validTiles, rng);
      const npc = Creature.makeFromTemplate(overworldMapTile.npc, 1);
      npc.x = tile.x;
      npc.y = tile.y;
      if (!enemies) enemies = [];
      enemies.push(npc);
    }

    return enemies;
  }
}
