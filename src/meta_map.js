class MetaMapTile {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} branchId
   * @param {number} securityLevel
   */
  constructor(x, y, branchId, securityLevel) {
    this.x = x;
    this.y = y;
    this.branchId = branchId;
    this.securityLevel = securityLevel;
    /** @type {!Map.<number, number>} */
    this.doorIds = new Map();
    this.keyId = 0;
  }
}

class MetaMap {
  /**
   * @param {number} width
   * @param {number} height
   * @param {!Array.<number>} goalIs
   * @param {number} numSecurityLevels
   * @param {number} tilesPerSecurityLevel
   * @param {number} branchLimitPerSecurityLevel
   * @param {number} directness
   * @param {number} branchChance
   */
  constructor(
      width, height, goalIs, numSecurityLevels, tilesPerSecurityLevel,
      branchLimitPerSecurityLevel, directness, branchChance) {
    this.width = width;
    this.height = height;
    this.goalIs = goalIs;
    /** @type {!Map.<number, !MetaMapTile>} */
    this.tiles = new Map();
    this.numSecurityLevels = numSecurityLevels;
    this.tilesPerSecurityLevel = tilesPerSecurityLevel;
    this.branchLimitPerSecurityLevel = branchLimitPerSecurityLevel;
    this.directness = directness;
    this.branchChance = branchChance;
  }

  /**
   * @param {number} seed
   * @param {number=} optGenLimit
   * @param {(function(string))=} optLogFn
   * @return {number} seed
   */
  generate(seed, optGenLimit, optLogFn) {
    for (let gen = 0; ; gen++) {
      if (optGenLimit && gen > optGenLimit) return seed;
      const rng = seededRNG(seed);
      if (this.generateOne_(rng, optLogFn)) break;
      this.tiles.clear();
      seed += 1;
    }
    return seed;
  }

  /** @return {number} */
  static generateGlobalDoorId() {
    return ++MetaMap.globalDoorId_;
  }

  /** @return {number} */
  static lastGlobalDoorId() {
    return MetaMap.globalDoorId_;
  }

  /**
   * @param {rng} rng
   * @param {(function(string))=} optLogFn
   * @return {boolean} success
   * @private
   */
  generateOne_(rng, optLogFn) {
    const startI = this.goalIs[0];
    const startTile = new MetaMapTile(toX(startI), toY(startI), 0, 0);
    this.tiles.set(startI, startTile);

    const goalIsLeft = new Set();
    for (let j = 1; j < this.goalIs.length; j++) {
      goalIsLeft.add(this.goalIs[j]);
    }

    /** @type {!Array.<number>} */
    const expandQ = [startI];

    // The branch ID tracker. To ensure that each branch has a unique ID.
    let nextBranchId = 1;

    // Security level tracking variables.
    let tilesLeftInSecurityLevel = this.tilesPerSecurityLevel;
    let branchesMadeInSecurityLevel = 0;
    let keyBranchId = 0;
    let securityLevelOn = 0;

    while (expandQ.length > 0 && goalIsLeft.size > 0) {
      const tI = expandQ.shift();
      const tX = toX(tI);
      const tY = toY(tI);
      const tile = this.tiles.get(tI);
      if (tile.securityLevel != securityLevelOn) {
        // Do not expand from this tile any more.
        continue;
      }

      // Determine the order of directions to try.
      // There are multiple "0", because that represents the "path-finding"
      // directive, as opposed to the random directions.
      const directions = [1, 2, 3, 4];
      for (let i = 0; i < this.directness; i++) directions.push(0);
      shuffleArray(directions, rng);
      // Get rid of all "0" but the first... since there's no reason to try it
      // multiple times. Adding it multiple times was just to give it a higher
      // chance to be first!
      let indexOfZero = directions.indexOf(0);
      while (true) {
        indexOfZero = directions.indexOf(0, indexOfZero + 1);
        if (indexOfZero == -1) break;
        directions.splice(indexOfZero, 1);
      }

      // Determine how many links to generate.
      let desiredLinks = 1;
      if (branchesMadeInSecurityLevel < this.branchLimitPerSecurityLevel) {
        if (rng() * 100 < this.branchChance) {
          desiredLinks += 1;
          branchesMadeInSecurityLevel += 1;
        }
      }

      let branchId = tile.branchId;
      for (const j of directions) {
        let [oX, oY] = [tX, tY];
        switch (j) {
          case 1: oY -= 1; break;
          case 2: oY += 1; break;
          case 3: oX -= 1; break;
          case 4: oX += 1; break;
          case 0:
            // This special case will go in the direction of the nearest
            // remaining goalI, to ensure that paths don't dawdle TOO much!
            let shortestDistance = Infinity;
            for (const goalI of goalIsLeft) {
              const gX = toX(goalI);
              const gY = toY(goalI);
              const distance = calcDistance(gX - tX, gY - tY);
              if (distance >= shortestDistance) continue;
              shortestDistance = distance;
              if (Math.abs(gX - tX) >= Math.abs(gY - tY)) {
                oX = tX + Math.sign(gX - tX);
                oY = tY;
              } else {
                oX = tX;
                oY = tY + Math.sign(gY - tY);
              }
            }
            break;
        }
        if (oX < 0 || oY < 0 || oX >= this.width || oY >= this.height) continue;
        const oI = toI(oX, oY);
        if (this.tiles.has(oI)) continue;

        let keyId = 0;
        let doorId = 0;
        tilesLeftInSecurityLevel -= 1;
        if (securityLevelOn < this.numSecurityLevels - 1) {
          if (tilesLeftInSecurityLevel == 0) {
            // Leave this security level, and enter the next!
            securityLevelOn += 1;
            doorId = MetaMap.lastGlobalDoorId();
            tilesLeftInSecurityLevel = this.tilesPerSecurityLevel;
            branchesMadeInSecurityLevel = 0;
            // The key and door should not be on the same branch. This cares
            // about the branchId of the PARENT tile, not this tile, so it's
            // not enough to just branch right in front of the door.
            if (keyBranchId == tile.branchId) {
              if (optLogFn) optLogFn('WARNING: Key should be in other branch!');
              return false;
            }
          } else if (tilesLeftInSecurityLevel == 1) {
            // This is the last tile in the security level, so it should have
            // the key.
            keyId = MetaMap.generateGlobalDoorId();
            keyBranchId = tile.branchId;
          }
        }

        // Make the tile for this position, now that you know it's available.
        const other = new MetaMapTile(oX, oY, branchId, securityLevelOn);
        this.tiles.set(oI, other);
        tile.doorIds.set(oI, doorId);
        other.doorIds.set(tI, doorId);
        goalIsLeft.delete(oI);

        if (keyId) {
          // This is a key room, so give it the key!
          other.keyId = keyId;
        } else {
          // Only expand from non-key rooms. Key rooms are dead ends!
          expandQ.push(oI);
        }

        // Mark one desired link off!
        desiredLinks -= 1;
        if (desiredLinks <= 0) break;
        branchId = nextBranchId++;
      }

      if (desiredLinks > 0) {
        // Failed to generate sufficient links!
        continue;
      }
    }

    if (goalIsLeft.size > 0) {
      if (optLogFn) optLogFn('WARNING: Not every goal has been met!');
      return false;
    }

    // Check to make sure each security level has been made, and the map is
    // about the right overall length.
    if (securityLevelOn < this.numSecurityLevels - 1) {
      if (optLogFn) optLogFn('WARNING: Too few security levels!');
      return false;
    }
    if (tilesLeftInSecurityLevel > this.tilesPerSecurityLevel / 2) {
      if (optLogFn) optLogFn('WARNING: Last security level too short!');
      return false;
    }
    if (tilesLeftInSecurityLevel < 0) {
      if (optLogFn) optLogFn('WARNING: Last security level too long!');
      return false;
    }

    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @return {?MetaMapTile}
   */
  tileAt(x, y) {
    return this.tiles.get(toI(x, y));
  }
}

/** @type {number} */
MetaMap.globalDoorId_ = 1;
