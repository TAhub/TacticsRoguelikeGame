class AttackOrMoveInfo {
  /**
   * @param {number} x
   * @param {number} y
   * @param {!Array.<number>} path
   * @param {boolean} willBreakEngagement
   * @param {!Set.<!Creature>} zoningAttacks
   * @param {function()} fn
   */
  constructor(x, y, path, willBreakEngagement, zoningAttacks, fn) {
    this.x = x;
    this.y = y;
    this.fn = fn;
    this.path = path;
    this.willBreakEngagement = willBreakEngagement;
    this.zoningAttacks = zoningAttacks;
  }
}

class AttackEstimate {
  /**
   * @param {number} mult
   * @param {number} hitChance
   * @param {number} hitsToCrits
   */
  constructor(mult, hitChance, hitsToCrits) {
    this.mult = mult;
    this.hitChance = hitChance;
    this.hitsToCrits = hitsToCrits;
  }

  /** @return {!Map.<!Creature.HitResult, number>} */
  get chances() {
    const chances = new Map();
    for (let roll = this.hitChance - 100; roll < this.hitChance; roll++) {
      let hitResult = Creature.HitResult.Crit;
      if (roll < -40) {
        hitResult = Creature.HitResult.Miss;
      } else if (roll < 0) {
        hitResult = Creature.HitResult.Graze;
      } else if (roll < 110) {
        hitResult = Creature.HitResult.Hit;
      }
      let chance = chances.get(hitResult) || 0;
      chance += 1;
      chances.set(hitResult, chance);
    }
    if (this.hitsToCrits > 0) {
      const hitChance = chances.get(Creature.HitResult.Hit) || 0;
      if (hitChance > 0) {
        const bonusCrit = Math.floor(hitChance * this.hitsToCrits / 100);
        chances.set(Creature.HitResult.Hit, hitChance - bonusCrit);
        const critChance = chances.get(Creature.HitResult.Crit) || 0;
        chances.set(Creature.HitResult.Crit, critChance + bonusCrit);
      }
    }
    return chances;
  }
}

class Creature {
  /**
   * @param {!Creature.Side} side
   * @param {string} species
   * @param {!Array.<string>} jobs
   */
  constructor(side, species, jobs) {
    // Stats.
    this.name = '';
    this.side = side;
    this.level = 1;
    this.species = new Species(species);
    this.jobs = jobs.map((type) => new Job(type));
    /** @type {!Array.<!Stat>} */
    this.stats = [];
    const allStats = data.getCategoryEntriesArray('stats') || [];
    for (const type of allStats) {
      this.stats.push(new Stat(type, 10, this.species, this.jobs));
    }
    /** @type {!Array.<!Skill>} */
    this.skills = [];

    // Enemy reproduction info.
    this.template = '';
    this.seed = 0;

    // Gear.
    /** @type {!Array.<!Armor>} */
    this.armors = [];
    /** @type {?Weapon} */
    this.weapon;
    /** @type {?Weapon} */
    this.secondWeapon;
    /** @type {?Accessory} */
    this.accessory;
    /** @type {?FightingStyle} */
    this.activeFightingStyle;
    /** @type {!Array.<string>} */
    this.knownFightingStyleTypes = [];
    /** @type {?Ring} */
    this.ring;
    /** @type {!Array.<string>} */
    this.techTypes = [];

    // Variables.
    this.life = 0;
    this.astra = 0;
    this.x = 0;
    this.y = 0;
    this.statPoints = 0;
    this.skillPoints = 1;
    this.encounterId = 0;
    this.deathLedgerId = 0;
    this.exp = 0;
    this.npcLineOn = 0;
    this.boss = false;
    this.finalBoss = false;

    // Temporary.
    this.pulseColor = '';
    this.pulseCycle = -1;
    this.flyingEffectCycle = Math.random();
    this.th = 0;
    this.floorTh = 0;
    this.facing = 0;
    this.rockAngle = 0;
    /** @type {?string} */
    this.npcLines;
    this.hasMove = false;
    this.hasAction = false;
    /** @type {!Map.<!Weapon.Status, number>} */
    this.statuses = new Map();
    /** @type {?Creature} */
    this.engaged;
    /** @type {?Creature} */
    this.chargingTarget;
    /** @type {?Weapon} */
    this.chargingWeapon;
    /** @type {?SpriteObject} */
    this.spriteObject;
    /** @type {?SpriteObject} */
    this.barSpriteObject;
    /** @type {?FloorShapeObject} */
    this.floorShapeObject;
    /** @type {!Array.<!Particle>} */
    this.cachedParticles = [];
    /** @type {!Array.<!Particle>} */
    this.delayedCachedParticles = [];
    this.particleDelayTimer = 0;
    this.shakeEffect = 0;
    /** @type {!Array.<function(number):boolean>} */
    this.actions = [];
    this.statusParticleTimer = Math.random();
    /** @type {?Creature} */
    this.currentSummon;
    /** @type {?Creature} */
    this.summonOwner;
    this.summonModifier = 0;
    this.summonAwake = true;
    this.exhaustedTechTypes = [];
    /** @type {?number} */
    this.initiativeRoll;

    // Now that everything has been set, do an initial refill.
    this.refill();
  }


  // State checkers.

  /** @return {boolean} */
  get dead() {
    return this.life <= 0;
  }

  /** @return {boolean} */
  get shouldDisposeOf() {
    return this.dead && !this.animating;
  }

  /** @return {boolean} */
  get immune() {
    return this.boss && !!this.currentSummon;
  }

  /** @return {number} */
  get s() {
    return this.monstrous ? 2 : 1;
  }

  /** @return {number} */
  get cX() {
    return this.x + this.s / 2;
  }

  /** @return {number} */
  get cY() {
    return this.y + this.s / 2;
  }

  /** @return {boolean} */
  get animating() {
    return this.actions.length > 0 || this.delayedCachedParticles.length > 0;
  }


  // Derived stats.

  /** @return {boolean} */
  get monstrous() {
    return this.species.monstrous;
  }

  /**
   * @param {function(!BonusSource):number} fn
   * @return {number} total
   * @private
   */
  tallyBonusSources_(fn) {
    let total = 0;
    total += fn(this.levelObj);
    total += fn(this.species);
    this.jobs.forEach((job) => total += fn(job));
    this.stats.forEach((stat) => total += fn(stat));
    this.skills.forEach((skill) => total += fn(skill));
    this.armors.forEach((armor) => total += fn(armor));
    if (this.accessory) total += fn(this.accessory);
    if (this.ring) total += fn(this.ring);
    if (this.weapon) total += fn(this.weapon);
    if (this.activeFightingStyle) total += fn(this.activeFightingStyle);
    return total;
  }

  /** @return {!Level} */
  get levelObj() {
    return new Level('' + this.level);
  }

  /** @return {number} */
  get miscAttackBonus() {
    if (this.boss) return 15;
    if (this.monstrous) return 10;
    return 0;
  }

  /** @return {number} */
  get maxAstra() {
    const mult = 100 + this.tallyBonusSources_((bS) => bS.astra);
    let astra = 30 * mult / 100;
    if (this.side == Creature.Side.Player) astra *= mechPlayerAstraMult;
    if (this.boss) astra *= 2;
    return Math.floor(astra);
  }

  /** @return {number} */
  get powerVsUninjured() {
    return this.tallyBonusSources_((bS) => bS.powerVsUninjured);
  }

  /** @return {number} */
  get attackPower() {
    let attackPower = 100 + this.summonModifier + this.miscAttackBonus;
    attackPower += this.tallyBonusSources_((bS) => bS.attackPower);
    if (this.summonOwner) {
      // If you're a summon, and your weapon DOESN'T use special power, turn
      // specialPower modifiers from your stats into attackPower modifiers.
      if (!this.weapon || this.weapon.usesSpecialPower) {
        for (const stat of this.stats) attackPower += stat.specialPower;
      }
    }
    return attackPower;
  }

  /** @return {number} */
  get attackPowerWhenDisengaged() {
    return this.tallyBonusSources_((bS) => bS.attackPowerWhenDisengaged);
  }

  /** @return {number} */
  get specialAttackPower() {
    return this.tallyBonusSources_((bS) => bS.specialAttackPower);
  }

  /** @return {number} */
  get specialPower() {
    let specialPower = 100 + this.summonModifier + this.miscAttackBonus;
    specialPower += this.tallyBonusSources_((bS) => bS.specialPower);
    return specialPower;
  }

  /** @return {number} */
  get armorProfiencyLevel() {
    let armorProfiencyLevel = 0;
    for (const job of this.jobs) {
      armorProfiencyLevel =
          Math.max(armorProfiencyLevel, job.armorProfiencyLevel);
    }
    return armorProfiencyLevel;
  }

  /** @return {number} */
  get defenseFromExcessArmorProfiencyLevel() {
    /** @type {!Array.<number>} */
    const armorProficiencyLevels = [];
    for (const job of this.jobs) {
      armorProficiencyLevels.push(job.armorProfiencyLevel);
    }
    armorProficiencyLevels.sort((a, b) => b - a);
    let defense = 0;
    for (let i = 1; i < armorProficiencyLevels.length; i++) {
      defense += armorProficiencyLevels[i] * mechArmorProfiencyDefense;
    }
    return defense;
  }

  /** @return {number} */
  get defense() {
    let defense = this.summonModifier + this.miscAttackBonus;
    defense += this.tallyBonusSources_((bS) => bS.defense);
    defense += this.defenseFromExcessArmorProfiencyLevel;
    if (this.unarmoredDefense) defense += this.levelObj.scalingBonus;
    return defense;
  }

  /** @return {number} */
  get resistance() {
    let resistance = this.summonModifier + this.miscAttackBonus;
    resistance += this.tallyBonusSources_((bS) => bS.resistance);
    if (this.unarmoredDefense) resistance += this.levelObj.scalingBonus;
    return resistance;
  }

  /** @return {number} */
  get defensePierced() {
    let pierced = 0;
    for (const armor of this.armors) {
      pierced += armor.defensePierced;
    }
    for (const job of this.jobs) {
      pierced += job.defense / 2;
    }
    pierced += this.defenseFromExcessArmorProfiencyLevel / 2;
    return pierced;
  }

  /** @return {number} */
  get accuracy() {
    let accuracy = this.summonModifier;
    accuracy -= this.statuses.get(Weapon.Status.Blinded) || 0;
    accuracy += this.tallyBonusSources_((bS) => bS.accuracy);
    return accuracy;
  }

  /** @return {number} */
  get hitsToCrits() {
    let hitsToCrits = 0;
    hitsToCrits += this.tallyBonusSources_((bS) => bS.hitsToCrits);
    return hitsToCrits;
  }

  /** @return {number} */
  get dodge() {
    let dodge = 10 + this.summonModifier;
    dodge -= this.statuses.get(Weapon.Status.Shaken) || 0;
    dodge += this.tallyBonusSources_((bS) => bS.dodge);
    return dodge;
  }

  /** @return {number} */
  get dodgeVsDisengage() {
    return this.tallyBonusSources_((bS) => bS.dodgeVsDisengage);
  }

  /** @return {number} */
  get baseMaxLife() {
    let life = mechBaseLife;
    if (this.finalBoss) life *= 1.5;
    if (this.monstrous && this.boss) life *= 6;
    else if (this.monstrous) life *= 4;
    else if (this.boss) life *= 2;
    if (this.summonOwner) life *= 0.75; // Summons are a little more fragile.
    life *= this.levelObj.lifeMultiplier;
    return life;
  }

  /** @return {number} */
  get maxLife() {
    let mult = 100 + this.summonModifier;
    mult += this.tallyBonusSources_((bS) => bS.life);
    return Math.floor(this.baseMaxLife * mult / 100);
  }

  /** @return {number} */
  getModifiedInitiative() {
    if (this.initiativeRoll == null) {
      this.initiativeRoll = 50 * Math.random();
    }
    let initiative = this.initiative + this.initiativeRoll;
    if (!this.summonAwake) {
      // If you are a summon and you are asleep, set your initiative super low,
      // so that you will still get a "turn" to take DoT damage, but you won't
      // get your sort-of-turn before your summoner has a chance to refill your
      // actions.
      initiative -= 1000;
    }
    return initiative;
  }

  /** @return {number} */
  get initiative() {
    let initiative = 100 + this.summonModifier;
    initiative += this.tallyBonusSources_((bS) => bS.initiative);
    return initiative;
  }

  /** @return {number} */
  get desiredNumJobs() {
    return (this.levelObj.tier >= 2) ? 2 : 1;
  }

  /** @return {number} */
  get desiredNumFightingStyleTypes() {
    const tier = this.levelObj.tierSmth;
    if (tier >= 2) return 3;
    else if (tier >= 1.5) return 2;
    else if (tier >= 1) return 1;
    else return 0;
  }

  /** @return {number} */
  get generationPoints() {
    const zonesStacks = this.zonesStacks;
    const attackPower = this.attackPower;
    const specialPower = this.specialPower;
    const powerVsUninjured = this.powerVsUninjured;
    const attackPowerWhenDisengaged = this.attackPowerWhenDisengaged;
    const accuracy = this.accuracy;
    const specialAttackPower = this.specialAttackPower;
    const hitsToCrits = this.hitsToCrits;
    const maxAstra = this.maxAstra;
    const usableWeapons = this.usableWeapons;

    /**
     * @param {!Weapon} weapon
     * @return {number}
     */
    const weaponValue = (weapon) => {
      let mult = 0;
      mult += powerVsUninjured * 0.4;
      if (weapon.usesSpecialPower) {
        mult += specialPower;
      } else {
        mult += attackPower;
        mult += attackPowerWhenDisengaged / 2;
        if (zonesStacks) {
          mult += 10 + attackPowerWhenDisengaged / 5;
          mult += (zonesStacks - 1) * mechRedundantZoningPower / 2;
        }
        mult += specialAttackPower / 4;
      }
      if (!weapon.helpful && !weapon.summon) {
        const critChance = hitsToCrits + weapon.weaponHitsToCrits;
        mult += critChance * mechHitsToCritsValue;
      }
      let value = weapon.generationPointsDamage / mechBaseDamage;
      value *= mult / 100;
      if (!weapon.helpful && !weapon.summon) {
        value *= (50 + weapon.weaponAccuracy + accuracy) / 150;
      }
      return value;
    };

    // Get attack value.
    let freeAttackValue = 0;
    for (const weapon of usableWeapons) {
      const value = weaponValue(weapon);
      if (weapon.astraCost != 0) continue;
      freeAttackValue = Math.max(freeAttackValue, value);
    }
    let techAttackValue = 0;
    let techs = 0;
    for (const weapon of usableWeapons) {
      if (weapon.astraCost == 0) continue;
      techs += 1;
      const value = weaponValue(weapon) - freeAttackValue;
      if (value <= 0) continue;
      let uses = maxAstra / weapon.astraCost;
      if (this.side == Creature.Side.Player) uses /= mechPlayerAstraMult;
      else if (this.boss) uses /= 2;
      techAttackValue += value * uses / 4;
    }
    if (techs > 0) techAttackValue /= techs;

    // Get final points.
    let generationPoints = this.maxLife / mechBaseLife;
    generationPoints *= (100 + this.resistance + this.defense) / 100;
    const totalDodge =
        this.dodge + (this.dodgeVsDisengage / 3) + (this.flying ? 15 : 0);
    generationPoints *= (100 + totalDodge) / 100;
    generationPoints *= (200 + this.initiative) / 200;
    generationPoints *= 0.2 + freeAttackValue + techAttackValue;
    generationPoints *= (5 + this.moveDistance) / 8;
    if (this.monstrous) generationPoints *= 0.75; // Big monsters are unwieldly.
    return Math.floor(200 * generationPoints);
  }

  /** @return {number} */
  get rangeBonus() {
    return this.tallyBonusSources_((bS) => bS.rangeBonus);
  }

  /** @return {number} */
  get moveDistance() {
    let moveDistance = 3;
    moveDistance += this.tallyBonusSources_((bS) => bS.moveDistance);
    return moveDistance;
  }

  /** @return {number} */
  get zonesStacks() {
    return this.tallyBonusSources_((bS) => bS.zones ? 1 : 0);
  }

  /** @return {boolean} */
  get flying() {
    return this.tallyBonusSources_((bS) => bS.flying ? 1 : 0) > 0;
  }

  /** @return {boolean} */
  get halveStatuses() {
    return this.tallyBonusSources_((bS) => bS.halveStatuses ? 1 : 0) > 0;
  }

  /** @return {boolean} */
  get martialArts() {
    return this.tallyBonusSources_((bS) => bS.martialArts ? 1 : 0) > 0;
  }

  /** @return {boolean} */
  get unarmoredDefense() {
    if (this.armors.length > 0) return false;
    return this.tallyBonusSources_((bS) => bS.unarmoredDefense ? 1 : 0) > 0;
  }


  // Logic.

  /** @param {function()} fn */
  effectAction(fn) {
    this.actions.push((elapsed) => {
      fn();
      return true;
    });
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw(ctx) {
    const statusTypes = new Set(this.statuses.keys());
    const spriteLayers = this.species.getSpriteLayers(
        this.armors, this.weapon, this.accessory, statusTypes, this.jobs);
    for (const layer of spriteLayers) {
      const x = layer.x + gfxTileSize / 2;
      const y = layer.y + ctx.canvas.height - gfxTileSize / 2;
      gfx.drawSprite(ctx, layer.sprite, x, y, layer.color, layer.scale);
    }
  }

  /** @return {number} */
  get barWidth() {
    return gfxTileSize * this.s;
  }

  /** @return {number} */
  get barHeight() {
    return gfxTileSize * 0.15;
  }

  /**
   * @return {{
   *   x: number,
   *   y: number,
   *   r: number,
   * }}
   * @private
   */
  getFloorShapeDimensions_() {
    const r = ((this.s / 2) - 0.15) * gfxTileSize;
    const x = this.cX * gfxTileSize;
    const y = this.cY * gfxTileSize;
    return {x, y, r};
  }

  /** @return {string} */
  get colorSuffix() {
    switch (this.side) {
      case Creature.Side.Player: return ' player';
      case Creature.Side.Enemy: return ' enemy';
      case Creature.Side.Npc: return ' npc';
      default: return '';
    }
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @private
   */
  drawFloorShape_(ctx) {
    ctx.translate(-this.x * gfxTileSize, -this.y * gfxTileSize);

    const color = data.getColorByNameSafe('tile' + this.colorSuffix);
    const fsd = this.getFloorShapeDimensions_();

    if (this.engaged) {
      const oColor = data.getColorByNameSafe('tile' + this.engaged.colorSuffix);
      const oFsd = this.engaged.getFloorShapeDimensions_();
      const a = calcAngle(oFsd.x - fsd.x, oFsd.y - fsd.y);
      ctx.fillStyle = colorLerp(color, oColor, 0.5);
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const adjI = i % 4;
        const cFsd = (adjI == 1 || adjI == 2) ? oFsd : fsd;
        const cA = a + Math.PI * ((adjI >= 2) ? -1 : 1) / 2;
        const x = cFsd.x + Math.cos(cA) * cFsd.r;
        const y = cFsd.y + Math.sin(cA) * cFsd.r;
        if (i == 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.fill();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(fsd.x, fsd.y, fsd.r, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @private
   */
  drawBar_(ctx) {
    const w = this.barWidth;
    const h = this.barHeight;
    const b = 2;
    const lH = h * 0.75;
    const aH = h * 0.9;
    const setAstraFont = () => gfx.setFont(ctx, aH);
    const setLifeFont = () => gfx.setFont(ctx, lH);

    // Get astra number size.
    const astraText = ' ' + this.astra + ' ';
    setAstraFont();
    const lW = w - gfx.measureText(ctx, astraText);

    // Life bar border.
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(0, 0, lW, lH);

    // Life bar back.
    ctx.fillStyle = data.getColorByNameSafe('tile slot back');
    ctx.fillRect(b, b, lW - 2 * b, lH - 2 * b);

    // DoT bar.
    ctx.fillStyle = data.getColorByNameSafe('blood');
    ctx.fillRect(b, b, (lW - 2 * b) * this.life / this.maxLife, lH - 2 * b);

    // Life bar.
    ctx.fillStyle = data.getColorByNameSafe('tile' + this.colorSuffix);
    const modLife = this.life - this.dotDamage;
    ctx.fillRect(b, b, (lW - 2 * b) * modLife / this.maxLife, lH - 2 * b);

    // Life number.
    ctx.fillStyle = data.getColorByNameSafe('tile text' + this.colorSuffix);
    setLifeFont();
    gfx.drawText(ctx, 0, 0, ' ' + this.life,
        Graphics.TextAlign.Left, Graphics.TextBaseline.Top);

    // Astra back.
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(lW, 0, w - lW, h);

    // Astra number.
    ctx.fillStyle = data.getColorByNameSafe('tile text' + this.colorSuffix);
    setAstraFont();
    gfx.drawText(ctx, w, h - aH / 2, astraText,
        Graphics.TextAlign.Right, Graphics.TextBaseline.Middle);
  }

  /** @return {number} */
  get appearanceSizeMult() {
    return this.species.appearanceSizeMult * (this.boss ? 1.2 : 1);
  }

  /** @return {number} */
  get headHeightPoint() {
    return this.species.headHeightPoint;
  }

  /** @private */
  makeFloorShape_() {
    const buffer = gfx.makeBuffer();
    buffer.width = this.s * gfxTileSize;
    buffer.height = this.s * gfxTileSize;
    const ctx = gfx.getContext(buffer);
    this.drawFloorShape_(ctx);
    if (!this.floorShapeObject) this.floorShapeObject = new FloorShapeObject();
    this.floorShapeObject.setBuffer(buffer, this.s);
  }

  makeBar() {
    const buffer = gfx.makeBuffer();
    buffer.width = this.barWidth;
    buffer.height = this.barHeight;
    const ctx = gfx.getContext(buffer);
    this.drawBar_(ctx);
    if (!this.barSpriteObject) this.barSpriteObject = new SpriteObject();
    const w = this.barWidth / gfxTileSize;
    const h = this.barHeight / gfxTileSize;
    this.barSpriteObject.setBuffer(buffer, w, h);
  }

  makeAppearance() {
    const tallFrame = this.weapon && this.weapon.slotFillers.size > 0;
    // TODO: if you have a tall hat, turn on tallFrame also?
    const widthMult = tallFrame ? 1.5 : 1;
    const heightMult = tallFrame ? 1.5 : 1;
    const buffer = gfx.makeBuffer();
    buffer.width = widthMult * gfxTileSize;
    buffer.height = heightMult * gfxTileSize;
    const ctx = gfx.getContext(buffer);
    this.draw(ctx);
    if (!this.spriteObject) this.spriteObject = new SpriteObject();
    const s = this.s * this.appearanceSizeMult;
    this.spriteObject.setBuffer(buffer, widthMult * s, heightMult * s);
  }

  /**
   * @param {MapController|GameMap} map
   * @param {number} x
   * @param {number} y
   * @param {function(?GameMapTile)} fn
   */
  tileCallback(map, x, y, fn) {
    for (let y2 = y; y2 < y + this.s; y2++) {
      for (let x2 = x; x2 < x + this.s; x2++) {
        fn(map.tileAt(x2, y2));
      }
    }
  }

  /** @param {!MapController} mapController */
  addToTiles(mapController) {
    let thTotal = 0;
    let thDivisor = 0;
    this.floorTh = 0;
    this.tileCallback(mapController, this.x, this.y, (tile) => {
      if (!tile) return;
      tile.creatures.push(this);

      this.floorTh = Math.max(this.floorTh, tile.th);
      // Terrain height is calculated based on a weighted average, weighted to
      // bias the higher somewhat.
      const weight = tile.th + 2;
      thTotal += tile.th * weight;
      thDivisor += weight;
    });
    this.th = this.flying ? 4 : (thTotal / thDivisor);
  }

  /** @param {!MapController} mapController */
  removeFromTiles(mapController) {
    this.tileCallback(mapController, this.x, this.y, (tile) => {
      if (!tile) return;
      tile.creatures = tile.creatures.filter((creature) => creature != this);
    });
  }

  clear3DData() {
    if (this.spriteObject) this.spriteObject.clear3DData();
    if (this.barSpriteObject) this.barSpriteObject.clear3DData();
    if (this.floorShapeObject) this.floorShapeObject.clear3DData();
  }

  /** @param {number} elapsed */
  update(elapsed) {
    if (this.pulseCycle >= 0 && this.pulseCycle < 1) {
      this.pulseCycle = Math.min(1, this.pulseCycle + elapsed * 2);
    } else {
      this.pulseCycle = -1;
    }
    this.flyingEffectCycle = (this.flyingEffectCycle + (elapsed / 2)) % 1;
    this.shakeEffect = Math.max(0, this.shakeEffect - elapsed);
    if (this.actions.length > 0) {
      if (this.actions[0](elapsed)) {
        this.actions.shift();
      }
    } else {
      // Actions meant to happen when the creature is not doing something.

      if (this.engaged) {
        this.facing =
            calcAngle(this.engaged.cX - this.cX, this.engaged.cY - this.cY);
      }

      if (this.chargingTarget && this.chargingTarget.dead) {
        this.chargingTarget = null;
        this.chargingWeapon = null;
      }
    }
    this.particleDelayTimer -= elapsed;
    if (this.particleDelayTimer <= 0) {
      this.particleDelayTimer = 0;
      if (this.delayedCachedParticles.length > 0) {
        this.cachedParticles.push(this.delayedCachedParticles.shift());
        this.particleDelayTimer = 0.25;
      }
    }
    this.statusParticleTimer += elapsed;
    if (this.statusParticleTimer > gfxStatusParticleTimerInterval) {
      this.statusParticleTimer = 0;
      this.makeStatusParticles_();
    }
  }

  /** @private */
  makeStatusParticles_() {
    if (this.chargingTarget && this.chargingWeapon) {
      /**
       * @param {!Creature} from
       * @return {!Array.<number>}
       */
      const getPosition = (from) => {
        const a = Math.random() * 2 * Math.PI;
        const r = Math.random() * 0.015;
        const h = (from.s * from.headHeightPoint * from.appearanceSizeMult) +
            ((2 * Math.random() - 1) * 0.01) +
            (from.th * gfxThScale);
        const x = from.cX + Math.cos(a) * r;
        const y = from.cY + Math.sin(a) * r;
        return [x, y, h];
      };

      const [xD, yD, hD] = getPosition(this.chargingTarget);
      const color = this.chargingWeapon.animProjColor;
      const alpha = 0.5;
      const radius = 0.025 + this.chargingWeapon.astraCost * 0.005;
      const particle = Particle.makeLineParticle(
          xD, yD, hD, color, alpha, radius);
      [particle.x, particle.y, particle.h] = getPosition(this);
      this.cachedParticles.push(particle);
    }
    if (this.statuses.has(Weapon.Status.Bleeding) ||
        Math.random() < 0.25 - (this.life / this.maxLife)) {
      this.addBloodParticle_();
    }
    if (this.statuses.has(Weapon.Status.Confused)) {
      const color = data.getColorByNameSafe('confusion');
      const scatter = 0.3;
      const sprites = [500, 501];
      const scale = 0.15;
      this.addGenericParticle_(
          Particle.makePuffParticle(sprites, scale, color, scatter));
    }
    if (this.statuses.has(Weapon.Status.Poisoned)) {
      const color = data.getColorByNameSafe('poison');
      const scatter = 0.25;
      const sprites = [500, 501];
      const scale = 0.15;
      this.addGenericParticle_(
          Particle.makeDropParticle(sprites, scale, color, scatter));
    }
    if (this.statuses.has(Weapon.Status.Burning)) {
      const color = data.getColorByNameSafe('smoke');
      const scatter = 0.05;
      const sprites = [502, 503, 504];
      const scale = 0.3;
      this.addGenericParticle_(
          Particle.makePuffParticle(sprites, scale, color, scatter));
    }
  }

  /**
   * @param {!THREE.Group} group
   * @param {!THREE.PerspectiveCamera} camera
   * @param {boolean} inCombat
   */
  addToGroup(group, camera, inCombat) {
    let x = this.cX;
    let y = this.cY;
    if (this.shakeEffect > 0) {
      const distance = this.shakeEffect * 0.2 * (Math.random() * 0.5 + 0.5);
      const angle = Math.random() * 2 * Math.PI;
      x += Math.cos(angle) * distance;
      y += Math.sin(angle) * distance;
    }

    // Draw.
    if (!this.spriteObject) this.makeAppearance();
    const options = {facing: this.facing, rockAngle: this.rockAngle};
    if (this.immune) options.transparent = true;
    let th = this.th;
    if (this.flying) {
      const sign = this.flyingEffectCycle < 0.5 ? -1 : 1;
      const cycle = ((1 + this.flyingEffectCycle - 0.5) % 0.5) * 2;
      th += sign * (cycle < 0.5 ? cycle : (1 - cycle)) * 0.5;
    }
    if (this.pulseCycle > 0 && this.pulseColor) {
      options.blendColor = this.pulseColor;
      if (this.pulseCycle < 0.5) {
        options.blendColorAmount = lerp(0, 100, this.pulseCycle * 2);
      } else {
        options.blendColorAmount = lerp(100, 0, (this.pulseCycle * 2) - 1);
      }
    }
    this.spriteObject.addToGroup(group, camera, x, y, th, options);
    if (!this.barSpriteObject) this.makeBar();
    this.barSpriteObject.addToGroup(
        group, camera, this.cX, this.cY, this.th, {drawBack: -0.05});
    if (inCombat) {
      if (!this.floorShapeObject) this.makeFloorShape_();
      this.floorShapeObject.addToGroup(group, this.cX, this.cY, this.floorTh);
    }
  }

  /** @param {number} exp */
  awardEXP(exp) {
    if (this.level >= mechMaxLevel) return;
    let percent = 0;
    let leveledUp = false;
    while (exp > 0) {
      if (this.level >= mechMaxLevel) break;
      const forNextLevel = expForNextLevel(this.level);
      const expAward = Math.min(forNextLevel - this.exp, exp);
      exp -= expAward;
      this.exp += expAward;
      percent += 100 * expAward / forNextLevel;
      if (this.exp < forNextLevel) break;
      this.exp -= forNextLevel;
      this.levelUp();
      leveledUp = true;
    }
    if (this.level >= mechMaxLevel) this.exp = 0; // To make saveString smaller.
    if (percent > 0) {
      this.addTextParticle_('+' + Math.ceil(percent) + '% exp', 0);
    }
    if (leveledUp) {
      this.addTextParticle_('LEVEL UP', 1);
    }
  }

  levelUp() {
    this.level += 1;
    if (this.level % mechLevelsPerSkill == 0) this.skillPoints += 1;
    else this.statPoints += 1;
  }

  refill() {
    this.life = this.maxLife;
    this.astra = this.maxAstra;
    this.makeBar();
  }

  /** @param {number} healing */
  receiveHealing(healing) {
    let healingLeft = healing;

    const usedOnLife = Math.min(healingLeft, this.maxLife - this.life);
    this.life += usedOnLife;
    healingLeft -= usedOnLife;

    // Leftover healing can cure status effects.
    const cureStatus = (statusType) => {
      const used = Math.min(this.statuses.get(statusType) || 0, healingLeft);
      if (used == 0) return;
      this.statuses.set(statusType, this.statuses.get(statusType) - used);
      healingLeft -= used;
      if (this.statuses.get(statusType) == 0) {
        this.statuses.delete(statusType);
        this.makeAppearance();
      }
    };
    cureStatus(Weapon.Status.Poisoned);
    cureStatus(Weapon.Status.Bleeding);

    this.addTextParticle_('+' + healing, 0);
    this.makeBar();
  }

  /**
   * @param {number} damage
   * @param {!Creature.HitResult} hitResult
   */
  takeDamage(damage, hitResult) {
    this.life = Math.max(0, this.life - damage);
    this.makeBar();
    this.shakeEffect += 0.15 + 0.3 * damage / this.maxLife;
    const boldness = hitResult - Creature.HitResult.Hit;
    this.addTextParticle_('-' + damage, boldness);
    const numBlood = Math.floor(50 * damage / this.maxLife);
    for (let i = 0; i < numBlood; i++) {
      this.addBloodParticle_();
    }
    if (this.dead && this.engaged) {
      // Break engagements, since you can no longer maintain them.
      this.engaged.engaged = null;
      this.engaged.makeFloorShape_();
      this.engaged = null;
      this.makeFloorShape_();
    }
  }

  /**
   * @param {MapController|GameMap} map
   * @param {number} atX
   * @param {number} atY
   * @param {boolean} ignoreAllies
   * @param {number=} optOldX
   * @param {number=} optOldY
   * @return {boolean}
   */
  fitsInSpot(map, atX, atY, ignoreAllies, optOldX, optOldY) {
    let invalid = false;
    const tiles = new Map();
    const xys = [[atX, atY]];
    if (optOldX && optOldY) xys.push([optOldX, optOldY]);
    for (const [x, y] of xys) {
      this.tileCallback(map, x, y, (tile) => {
        if (!tile || invalid) {
          invalid = true;
          return;
        }
        const i = toI(tile.x, tile.y);
        if (tiles.has(i)) return; // No need to check creatures again!
        tiles.set(i, tile);
        for (const creature of tile.creatures) {
          if (creature == this) continue;
          if (creature.side == this.side && ignoreAllies) continue;
          invalid = true;
          break;
        }
      });
    }
    if (invalid) return false;
    // Does any tile in the area NOT have an unlocked link to an adjacent
    // tile in the area?
    for (const tile of tiles.values()) {
      /**
       * @param {number} x
       * @param {number} y
       * @return {boolean}
       */
      const testXY = (x, y) => {
        const i = toI(x, y);
        if (!tiles.get(i)) return true; // No need to look there!
        return tile.doorIds.get(i) == 0;
      };
      if (!testXY(tile.x - 1, tile.y)) return false;
      if (!testXY(tile.x + 1, tile.y)) return false;
      if (!testXY(tile.x, tile.y - 1)) return false;
      if (!testXY(tile.x, tile.y + 1)) return false;
    }
    return true;
  }

  /** @param {function():boolean} queryBattleOverFn */
  turnStart(queryBattleOverFn) {
    // Set off any charging spells.
    if (this.chargingTarget && this.chargingWeapon &&
        !this.chargingTarget.dead) {
      this.effectAction(() => {
        this.chargingTarget = null;
        this.chargingWeapon = null;
      });
      this.attack_(this.chargingTarget, this.chargingWeapon,
          Creature.AttackType.Charged);
    }

    // Once your charged spell is over, the battle might be over too. Try it!
    this.effectAction(() => {
      if (!queryBattleOverFn()) return;
      // If the battle is over, cancel any further actions.
      this.actions = [];
    });

    // Maybe lose your turn from confusion... or from being a sleeping summon.
    if (this.summonAwake) {
      this.effectAction(() => {
        // Do you lose your turn to confusion?
        let confused = this.statuses.get(Weapon.Status.Confused) || 0;
        if ((Math.random() * 100) < confused) {
          this.addTextParticle_('CONFUSED', 0);
          // Each time you lose your turn to confusion, your confusion lowers.
          confused -= 100;
          if (confused <= 0) {
            this.statuses.delete(Weapon.Status.Confused);
          } else {
            this.statuses.set(Weapon.Status.Confused, confused);
          }
        } else {
          this.hasMove = true;
          this.hasAction = true;
        }
      });
    }

    // Bosses talk on the start of each turn.
    if (this.side != Creature.Side.Npc && this.npcLines) {
      this.effectAction(() => {
        this.talk();
      });
    }
  }

  skipTurn() {
    this.hasMove = false;
    this.hasAction = false;
    // Skipping your turn puts out burning.
    if (this.statuses.has(Weapon.Status.Burning)) {
      this.statuses.delete(Weapon.Status.Burning);
      this.makeAppearance();
    }
  }

  /** @return {number} */
  get dotDamage() {
    let dot = 0;
    dot += this.statuses.get(Weapon.Status.Burning) || 0;
    dot += this.statuses.get(Weapon.Status.Poisoned) || 0;
    dot += this.statuses.get(Weapon.Status.Bleeding) || 0;
    return dot;
  }

  turnEnd() {
    const dotDamage = this.dotDamage;
    if (dotDamage > 0) {
      // Bleeding goes away after doing damage.
      this.statuses.delete(Weapon.Status.Bleeding);
      this.takeDamage(dotDamage, Creature.HitResult.Graze);
    }
    if (this.summonOwner) this.summonAwake = false;
  }

  /** @return {!Weapon} */
  get disengageWeapon() {
    if (this.martialArts) return this.unarmed;
    return this.weapon || this.unarmed;
  }

  /** @return {!Weapon} */
  get unarmed() {
    const unarmed = new Weapon('unarmed');
    unarmed.forceTier = this.levelObj.tier;
    if (!this.martialArts) unarmed.forceTier -= 1;
    return unarmed;
  }

  /**
   * @param {string} techType
   * @return {?Weapon}
   */
  makeTech(techType) {
    const weapon = new Weapon(techType);
    if (weapon.scaling) {
      switch (weapon.scaling) {
        case Weapon.Scaling.MeleeWeapon:
        case Weapon.Scaling.RangedWeapon:
          let weaponUsed = this.weapon;
          if (weapon.scaling == Weapon.Scaling.MeleeWeapon) {
            if (this.martialArts) weaponUsed = this.unarmed;
            if (!weaponUsed || weaponUsed.ranged) return null;
          } else {
            if (!this.weapon) return null;
            if (!weaponUsed || !weaponUsed.ranged) return null;
          }
          weapon.forceTier = weaponUsed.tier;
          weapon.baseWeapon = weaponUsed;
          break;
        case Weapon.Scaling.Level:
          weapon.forceTier = this.levelObj.tier;
          break;
      }
    }
    return weapon;
  }

  /** @return {!Array.<!Weapon>} */
  get usableWeapons() {
    const weapons = [];

    if (this.weapon) {
      weapons.push(this.weapon);
      if (!this.weapon.ranged && !this.martialArts) {
        const copy = new Weapon(this.weapon.saveString);
        copy.engagementMode = true;
        weapons.push(copy);
      }
    }

    // Add unarmed.
    weapons.push(this.unarmed);
    if (this.martialArts) {
      const copy = this.unarmed;
      copy.engagementMode = true;
      weapons.push(copy);
    }

    let techTypes = this.techTypes;
    if (this.ring) {
      techTypes = techTypes.slice();
      techTypes.push(this.ring.techType);
    }

    // Add techniques.
    const exhaustedTechTypes = this.exhaustedTechTypes.slice();
    for (const techType of techTypes) {
      const idx = exhaustedTechTypes.indexOf(techType);
      if (idx != -1) {
        // If it's been exhausted, don't add (this instance of) the tech.
        exhaustedTechTypes.splice(idx, 1);
        continue;
      }

      const weapon = this.makeTech(techType);
      if (!weapon) continue;
      if (weapon.summon) {
        if (this.currentSummon) {
          if (this.currentSummon.dead) {
            this.currentSummon = null; // Get rid of it, for later!
          } else {
            continue;
          }
        }
      }
      if (weapon.astraCost > this.astra) continue;
      weapons.push(weapon);
    }

    return weapons.filter((weapon) => this.life >= weapon.lifeCost);
  }

  /**
   * @param {!MapController} mapController
   * @param {!Weapon} weapon
   * @return {!Map.<number, !AttackOrMoveInfo>} attacks
   */
  getAttacks(mapController, weapon) {
    if (weapon.summon && !mapController.inCombat) return new Map();

    const inRangeTiles = new Set();
    const tooCloseTiles = new Set();

    if (weapon.targetRingUser) {
      for (const creature of mapController.creatures) {
        if (creature == this) continue;
        if (!creature.ring) continue;
        if (creature.ring.type != weapon.targetRingUser) continue;
        creature.tileCallback(mapController, creature.x, creature.y, (tile) => {
          if (!tile) return;
          inRangeTiles.add(tile);
        });
      }
    } else {
      let minRange = weapon.minRange;
      let maxRange = weapon.maxRange + (weapon.ranged ? this.rangeBonus : 0);
      if (!mapController.inCombat && weapon.helpful) {
        // Healing abilities have super-long range out of combat.
        minRange = 0;
        maxRange = 5;
      }
      this.tileCallback(mapController, this.x, this.y, (center) => {
        if (!center) return;
        for (let y = center.y - maxRange; y <= center.y + maxRange; y++) {
          for (let x = center.x - maxRange; x <= center.x + maxRange; x++) {
            const distance = Math.abs(x - center.x) + Math.abs(y - center.y);
            if (distance > maxRange) continue;
            const tile = mapController.tileAt(x, y);
            if (!tile) continue;
            inRangeTiles.add(tile);
            if (distance < minRange) tooCloseTiles.add(tile);
          }
        }
      });
    }

    const attackInfos = new Map();
    for (const tile of inRangeTiles) {
      if (tooCloseTiles.has(tile)) continue;

      // Check if this attack is valid.
      let willBreakEngagement = false;
      if (weapon.summon) {
        // Summons are a special case!
        if (tile.creatures.length != 0) continue;
        willBreakEngagement = !!this.engaged;
      } else {
        if (tile.creatures.length == 0) continue;
        const target = tile.creatures[0];
        if (weapon.helpful) {
          if (target.side != this.side) continue;
        } else {
          if (target.immune) continue;
          // Can't attack allies.
          if (this.side == Creature.Side.Player &&
              target.side != Creature.Side.Enemy) continue;
          if (this.side == Creature.Side.Enemy &&
                target.side != Creature.Side.Player) continue;
        }
        if (!this.hasLOS(tile.x + 0.5, tile.y + 0.5, mapController)) continue;
        if (this.engaged) {
          willBreakEngagement = target != this && target != this.engaged;
        }
      }

      // Make the attack info.
      const fn = () => {
        if (willBreakEngagement) this.breakEngagement_();
        const target = tile.creatures[0];
        if (weapon.charged && this.engaged != target &&
            mapController.inCombat && target != this) {
          this.chargingTarget = target;
          this.chargingWeapon = weapon;
          this.hasAction = false;
          this.hasMove = false;
          if (weapon.usesSpecialPower) {
            this.addTextParticle_('CASTING...', 0);
            audio.play('spell charge', 0, 1);
          } else {
            this.addTextParticle_('AIMING...', 0);
          }
        } else {
          this.attack_(target || tile, weapon, Creature.AttackType.Normal,
              mapController);
        }
      };
      attackInfos.set(toI(tile.x, tile.y), new AttackOrMoveInfo(
          tile.x, tile.y, [], willBreakEngagement, new Set(), fn));
    }
    return attackInfos;
  }

  /**
   * @param {!Creature} attacker
   * @param {!Creature.AttackType} attackType
   * @private
   */
  triggeredAttackOnSelf_(attacker, attackType) {
    // Trigger their attack.
    let doneWaiting = false;
    this.effectAction(() => {
      attacker.attack_(this, attacker.disengageWeapon, attackType);
      attacker.effectAction(() => doneWaiting = true);
    });

    // Wait for them to finish before you start doing your thing.
    this.actions.push((elapsed) => doneWaiting);
    this.effectAction(() => {
      // Cancel your entire action queue, if the triggered attack kills you!
      if (this.dead) this.actions = [];
    });
  }

  /**
   * @param {!Set.<!Creature>} attackers
   * @private
   */
  takeZoningAttacks_(attackers) {
    for (const creature of attackers) {
      this.triggeredAttackOnSelf_(creature, Creature.AttackType.Zoning);
    }
  }

  /** @private */
  breakEngagement_() {
    if (!this.engaged) return;
    this.triggeredAttackOnSelf_(this.engaged, Creature.AttackType.Disengage);
    this.engaged.engaged = null;
    this.engaged.makeFloorShape_();
    this.engaged = null;
    this.makeFloorShape_();
  }

  /**
   * @param {Creature|GameMapTile} targetOrTile
   * @param {!Weapon} weapon
   * @param {!Creature.AttackType} attackType
   * @param {MapController=} optMapController
   * @private
   */
  attack_(targetOrTile, weapon, attackType, optMapController) {
    let [oldX, oldY] = [this.x, this.y];
    let angle = 0;

    let target;
    let tile;
    if (weapon.summon) {
      if (targetOrTile instanceof Creature) return;
      tile = targetOrTile;
      angle = calcAngle(tile.x + 0.5 - this.cX, tile.y + 0.5 - this.cY);
    } else {
      if (targetOrTile instanceof GameMapTile) return;
      target = targetOrTile;
      angle = calcAngle(target.cX - this.cX, target.cY - this.cY);
    }

    if (weapon.teleports && optMapController &&
        !this.monstrous && !this.engaged) {
      let closestTile;
      let closestTileDistance = 0;
      let alreadyAdjacent = false;
      target.tileCallback(optMapController, target.x, target.y, (tile) => {
        if (!tile) return;
        for (const i of tile.doorIds.keys()) {
          if (tile.doorIds.get(i) != 0) continue;
          const oTile = optMapController.tileAt(toX(i), toY(i));
          if (!oTile) continue;
          if (oTile.creatures.length > 0) {
            if (oTile.creatures[0] == this) {
              // No need to teleport.
              alreadyAdjacent = true;
              return;
            }
            continue;
          }
          const distance =
              calcDistance(oTile.x + 0.5 - this.cX, oTile.y + 0.5 - this.cY);
          if (closestTile && closestTileDistance <= distance) continue;
          closestTile = oTile;
          closestTileDistance = distance;
        }
      });
      if (!alreadyAdjacent && closestTile) {
        [oldX, oldY] = [closestTile.x, closestTile.y];
        this.moveAction_(closestTile.x, closestTile.y, 20,
            Math.random() < 0.5 ? 1 : -1, null, optMapController);
      }
    }

    let preStepPause = weapon.animPreStepPause;
    if (preStepPause > 0) {
      this.actions.push((elapsed) => {
        preStepPause -= elapsed;
        return preStepPause <= 0;
      });
    }

    // Only move around if you can move. Turrets shouldn't move!
    if (this.moveDistance > 0) {
      const stepDistance = weapon.animStep;
      const x = oldX + Math.cos(angle) * stepDistance;
      const y = oldY + Math.sin(angle) * stepDistance;
      this.moveAction_(x, y, 12, Math.random() < 0.5 ? 1 : -1, angle);
    }
    this.effectAction(() => this.facing = angle);

    let postStepPause = weapon.animPostStepPause;
    if (postStepPause > 0) {
      this.actions.push((elapsed) => {
        postStepPause -= elapsed;
        return postStepPause <= 0;
      });
    }

    if (weapon.summon) {
      this.effectAction(() => {
        if (tile && optMapController) {
          const estimate = this.getAttackEstimate(this, weapon,
              Creature.HitResult.Hit, Creature.AttackType.Normal);
          const damage = Math.ceil(weapon.damage * estimate.mult / 100);
          const summon = this.makeSummon_(weapon, damage);
          summon.x = tile.x;
          summon.y = tile.y;
          optMapController.addCreature(summon);
          if (weapon.animStrikeSound) {
            const pitch = this.pitchForWeapon_(weapon);
            audio.play(weapon.animStrikeSound, pitch, 1);
          }
        }
      });
    } else {
      /** @type {!Array.<!Particle>} */
      let projectiles = [];

      /**
       * @param {!Creature} from
       * @return {!Array.<number>}
       */
      const getPosition = (from) => {
        const h = from.headHeightPoint * from.appearanceSizeMult * 0.75 +
                  from.th * gfxThScale;
        return [from.cX, from.cY, h];
      };

      // Make all of the projectiles at once.
      this.effectAction(() => {
        if (!target) return;
        for (let hit = 0; hit < weapon.numHits; hit++) {
          const sprite = weapon.animProjSprite;
          const scale = weapon.animProjScale * (this.monstrous ? 1.5 : 1);
          let color = weapon.animProjColor;
          if (weapon.animProjSkinColor) {
            color = this.species.getColor('skinColor', this.jobs);
          }
          const pitch = this.pitchForWeapon_(weapon);
          const projectile = Particle.makeProjectileParticle(
              color, sprite, scale, weapon.animSound, pitch);
          [projectile.x, projectile.y, projectile.h] = getPosition(this);
          const [xD, yD, hD] = getPosition(target);
          const speed = weapon.animProjSpeed;
          const distance = calcDistance(xD - projectile.x, yD - projectile.y);
          projectile.lifetime = distance / speed;
          projectile.xSpeed = (xD - projectile.x) / projectile.lifetime;
          projectile.ySpeed = (yD - projectile.y) / projectile.lifetime;
          projectile.hSpeed = (hD - projectile.h) / projectile.lifetime;
          projectile.facing = calcAngle(xD - projectile.x, yD - projectile.y);
          projectile.delay = weapon.animProjDelay * hit;
          if (weapon.animProjGlows) {
            projectile.lightColor = color;
            projectile.lightIntensity = 0.25 + weapon.astraCost * 0.02;
          }
          projectiles.push(projectile);
          this.cachedParticles.push(projectile);
        }
      });

      // Wait until each projectile has landed to go on.
      // Call their strike when they land.
      // Doing it this way allows multiple projectiles to be
      // onscreen at once.
      this.actions.push((elapsed) => {
        projectiles = projectiles.filter((projectile) => {
          if (!projectile.dead) return true;
          if (!target || target.dead) return false;
          this.strike_(target, weapon, attackType);
          return false;
        });
        return projectiles.length == 0;
      });
    }

    // Pay costs.
    this.effectAction(() => {
      if (weapon.lifeCost > 0) {
        this.takeDamage(weapon.lifeCost, Creature.HitResult.Graze);
      }
      if (weapon.astraCost > 0) {
        this.astra -= weapon.astraCost;
        this.makeBar();
      }
      if (weapon.onePerBattle) {
        // Exhausts after one use.
        this.exhaustedTechTypes.push(weapon.type);
      }
      if (attackType == Creature.AttackType.Normal) {
        this.hasAction = false;
        this.hasMove = false;
      }
    });

    if (weapon.engagementMode && target &&
        target.engaged != this && target.chargingTarget) {
      // Engaging someone redirects the spells they are casting onto you.
      let doneWaiting = false;
      this.effectAction(() => {
        if (!target.chargingTarget || !target.chargingWeapon) return;
        if (this.dead) {
          doneWaiting = true;
        } else {
          target.effectAction(() => {
            target.chargingTarget = null;
            target.chargingWeapon = null;
          });
          if (target.dead) {
            doneWaiting = true;
          } else {
            target.attack_(
                this, target.chargingWeapon, Creature.AttackType.Charged);
            target.effectAction(() => doneWaiting = true);
          }
        }
      });
      this.actions.push((elapsed) => doneWaiting);
    }
    if (weapon.commandsSummon) {
      this.effectAction(() => {
        if (!this.currentSummon) return;
        this.currentSummon.summonAwake = true;
      });
    }

    // Move back to where you were, if necessary.
    this.moveAction_(oldX, oldY, 8, Math.random() < 0.5 ? 1 : -1, angle);
  }

  /**
   * @param {!Weapon} weapon
   * @param {number} damage
   * @return {?Creature}
   * @private
   */
  makeSummon_(weapon, damage) {
    if (!weapon.summon) return null;

    // Get the desired summon modifier.
    let summonModifier = damage;
    summonModifier /= 2 * mechBaseDamage * multForTier(weapon.tier);
    summonModifier -= 3; // adjustment since summons act as extra life bars
    summonModifier *= 50; // 2x damage post-adjustment = total +50% bonus
    summonModifier /= 5; // summonModifier applies to so many stats...
    summonModifier = Math.ceil(summonModifier);

    // Make the summon.
    const summonSpecies = weapon.summonSpecies || '';
    const summonJobs = weapon.summonJobs || [];
    const summon = new Creature(this.side, summonSpecies, summonJobs);
    while (summon.level < this.level) {
      summon.levelUp();
    }
    while (summon.jobs.length > summon.desiredNumJobs) {
      summon.jobs.pop();
    }
    const summonWeapon = weapon.summonWeapon;
    if (summonWeapon) {
      summon.weapon = new Weapon(summonWeapon + ':' + weapon.tier);
    } else {
      summonModifier += 15; // Make up for being unarmed.
    }
    const summonArmors = weapon.summonArmors;
    if (summonArmors) {
      summon.armors = summonArmors.map((type) => {
        return new Armor(type + ':' + weapon.tier);
      });
    }
    if (weapon.summonColoration != null) {
      summon.species.coloration = weapon.summonColoration;
    }
    // Summon weapons that can be used endlessly are "one shot", so you
    // can't command them after the first turn.
    if (weapon.onePerBattle) this.currentSummon = summon;
    summon.summonOwner = this;
    summon.summonModifier = summonModifier;
    summon.name = weapon.name;
    summon.refill();

    return summon;
  }

  /**
   * @param {!Creature} target
   * @param {!Weapon} weapon
   * @param {!Creature.HitResult} hitResult
   * @param {!Creature.AttackType} attackType
   * @param {boolean=} optRandomFactor
   * @return {!AttackEstimate}
   */
  getAttackEstimate(target, weapon, hitResult, attackType, optRandomFactor) {
    const isSpecialAttack = attackType == Creature.AttackType.Disengage ||
                            attackType == Creature.AttackType.Zoning;

    let mult = 0;
    let hitChance = 100;
    let hitsToCrits = 0;
    if (weapon.usesSpecialPower) {
      mult += this.specialPower;
    } else {
      mult += this.attackPower;
      if (!this.engaged && attackType == Creature.AttackType.Normal &&
          !weapon.engagementMode) {
        mult += this.attackPowerWhenDisengaged;
      }
      if (isSpecialAttack) mult += this.specialAttackPower;
    }
    if (weapon.summon) {
      // Since summons always target yourself, as far as the attack estimate is
      // concerned, cancel out the scalingBonus of your level here.
      // We do this instead of just not applying a level scalingBonus to summons
      // to open the possibility of summons with other scaling in the future.
      mult -= target.levelObj.scalingBonus;
    } else if (weapon.helpful) {
      mult -= target.levelObj.scalingDefenseValue;
    } else {
      if (target.life >= target.maxLife * 0.95) mult += this.powerVsUninjured;
      hitChance = weapon.weaponAccuracy + this.accuracy - target.dodge;
      hitsToCrits = this.hitsToCrits + weapon.weaponHitsToCrits;
      if (weapon.magic) {
        mult -= target.resistance;
      } else {
        mult -= target.defense;
        if (weapon.armorPiercing) mult += target.defensePierced;
        else if (weapon.armorBlunted) mult -= target.defensePierced;
      }
    }
    if (attackType == Creature.AttackType.Disengage) {
      hitChance -= target.dodgeVsDisengage;
    }
    const rand = optRandomFactor ? (2 * Math.random() - 1) : 0;
    switch (hitResult) {
      case Creature.HitResult.Miss:
        return new AttackEstimate(0, 0, 0);
      case Creature.HitResult.Hit:
        mult += rand * mechCritBonus / 2;
        break;
      case Creature.HitResult.Crit:
        mult += mechCritBonus;
        mult += rand * mechCritBonus / 4;
        break;
      case Creature.HitResult.Graze:
        mult -= mechCritBonus;
        mult += rand * mechCritBonus / 4;
        break;
    }
    if (attackType == Creature.AttackType.Zoning) {
      // Having the zoning ability from multiple sources makes your zoning
      // attacks stronger.
      mult += mechRedundantZoningPower * (this.zonesStacks - 1);
      // Zoning attacks just straight up do half damage, though.
      mult /= 2;
    } else if (attackType != Creature.AttackType.Disengage &&
               !weapon.summon && !weapon.helpful) {
      // Apply terrain height modifiers to hit chance only for non-disengage,
      // non-zoning attacks.
      if (weapon.ranged) {
        // Get a small hit chance bonus for being over the enemy.
        hitChance += 3 * Math.max(0, this.th - target.th);
      } else {
        // Get a hit chance penalty for being on a different terrain height.
        hitChance -= 5 * Math.abs(this.th - target.th);
      }
    }
    mult = Math.max(0, mult);
    return new AttackEstimate(mult, hitChance, hitsToCrits);
  }

  /**
   * @param {!Particle} particle
   * @private
   */
  addGenericParticle_(particle) {
    particle.x = this.cX;
    particle.y = this.cY;
    particle.h = (this.th * gfxThScale) + Math.random() *
        (this.s * this.headHeightPoint * this.appearanceSizeMult);
    this.cachedParticles.push(particle);
  }

  /** @private */
  addBloodParticle_() {
    const color = this.species.getColor('bloodColor', this.jobs);
    const scatter = 0.2;
    const sprites = [500, 501];
    const scale = 0.125;
    this.addGenericParticle_(
        Particle.makeDropParticle(sprites, scale, color, scatter));
  }

  /**
   * @param {string} text
   * @param {number} boldness
   */
  addTextParticle_(text, boldness) {
    const particle = Particle.makeTextParticle(text, boldness);
    particle.x = this.cX;
    particle.y = this.cY;
    particle.h = this.s + (this.th * gfxThScale);
    this.delayedCachedParticles.push(particle);
  }

  /**
   * @param {!Creature} target
   * @param {!Weapon} weapon
   * @param {!Creature.AttackType} attackType
   * @return {!Creature.HitResult}
   * @private
   */
  getHitResult_(target, weapon, attackType) {
    const chances = this.getAttackEstimate(
        target, weapon, Creature.HitResult.Hit, attackType, false).chances;
    let roll = Math.random() * 100;
    for (const hitResult of chances.keys()) {
      roll -= chances.get(hitResult);
      if (roll <= 0) return hitResult;
    }
    return Creature.HitResult.Hit;
  }

  /**
   * @param {!Weapon} weapon
   * @return {number}
   * @private
   */
  pitchForWeapon_(weapon) {
    return weapon.animPitch +
        (Math.random() * 2 - 1) * 25 - (this.monstrous ? 200 : 0);
  }

  /**
   * @param {!Creature} target
   * @param {!Weapon} weapon
   * @param {!Creature.AttackType} attackType
   * @private
   */
  strike_(target, weapon, attackType) {
    if (weapon.engagementMode && target.engaged != this) {
      // Weapons that engage do so, EVEN if they miss!
      if (target.engaged) {
        // Harmlessly break their old engagement.
        target.engaged.engaged = null;
        target.engaged.makeFloorShape_();
      }
      this.engaged = target;
      target.engaged = this;
      target.addTextParticle_('ENGAGED', 0);
      target.makeFloorShape_();
      this.makeFloorShape_();
    }

    let hitResult = Creature.HitResult.Hit;
    if (!weapon.helpful && !weapon.summon) {
      hitResult = this.getHitResult_(target, weapon, attackType);
      switch (hitResult) {
        case Creature.HitResult.Miss:
          // TODO: dodge visual/audio effects on target?
          target.addTextParticle_('DODGE', -1);
          break;
        case Creature.HitResult.Graze:
          // TODO: graze visual/audio effects on target?
          target.addTextParticle_('GRAZE', -1);
          break;
        case Creature.HitResult.Hit:
          target.addTextParticle_('HIT', 0);
          break;
        case Creature.HitResult.Crit:
          // TODO: crit visual/audio effects on target?
          target.addTextParticle_('CRIT', 1);
          break;
      }
    }

    let pitch = this.pitchForWeapon_(weapon);
    let sound = weapon.animStrikeSound || '';
    switch (hitResult) {
      case Creature.HitResult.Miss:
        sound = 'dodge';
        pitch = target.monstrous ? -300 : 0;
        break;
      case Creature.HitResult.Crit:
        pitch -= 200;
        break;
      case Creature.HitResult.Graze:
        pitch += 200;
        break;
    }
    if (sound) audio.play(sound, pitch, 1);
    if (hitResult == Creature.HitResult.Miss) return;

    const mult = this.getAttackEstimate(
        target, weapon, hitResult, attackType, true).mult / weapon.numHits;

    if (mult > 0) {
      const pulseColor = weapon.animProjStrikePulseColor;
      if (pulseColor) target.startColorPulse(pulseColor);
    }

    // Status effects.
    if (mult > 0) {
      for (const statusType of Weapon.allStatuses) {
        let effect = weapon.getStatus(statusType) * mult / 100;
        if (effect <= 0) continue;
        switch (statusType) {
          case Weapon.Status.Bleeding:
          case Weapon.Status.Burning:
          case Weapon.Status.Poisoned:
            // These modifiers are applied inside getStatus()
            break;
          default:
            // Debilitating statuses are scaled based on max life.
            effect /= target.baseMaxLife;
            // Doing enough damage to kill the base life for their level
            // (e.g. ignoring their life multipliers) inflicts this penalty:
            effect *= 250;
            break;
        }
        if (statusType == Weapon.Status.Cure) {
          // Cure is a bit stronger than the other non-damaging status effects
          // since it's purely reactive.
          effect *= 1.3;
        } else if (target.halveStatuses) effect /= 2;
        effect = Math.ceil(effect);
        if (statusType == Weapon.Status.Cure) {
          const cureStatus = (statusType) => {
            const old = target.statuses.get(statusType) || 0;
            const used = Math.min(effect, old);
            if (used == 0) return;
            target.statuses.set(statusType, old - used);
            effect -= used;
          };
          cureStatus(Weapon.Status.Shaken);
          cureStatus(Weapon.Status.Blinded);
          cureStatus(Weapon.Status.Confused);
          target.makeAppearance();
        } else {
          const old = target.statuses.get(statusType) || 0;
          target.statuses.set(statusType, old + effect);
          if (old == 0) target.makeAppearance();
        }
        target.addTextParticle_(statusType.toUpperCase(), 0);
      }
      if (weapon.damage == 0) {
        // The damage script won't remake their bar, so do it manually here.
        target.makeBar();
      }
    }

    // Damage.
    const damage = Math.ceil(mult * weapon.damage / 100);
    if (weapon.heals) {
      target.receiveHealing(damage);
    } else {
      target.takeDamage(damage, hitResult);
    }
    if (weapon.drains && damage) {
      this.receiveHealing(damage);
      this.startColorPulse(this.species.getColor('bloodColor', this.jobs));
    }
  }

  /**
   * @param {number} toX
   * @param {number} toY
   * @param {!MapController} mapController
   * @return {boolean}
   */
  hasLOS(toX, toY, mapController) {
    const distance = calcDistance(toX - this.cX, toY - this.cY);
    if (distance < 0.75) return true;
    const steps = Math.ceil(distance * 2);
    /** @type {?GameMapTile} */
    let lastTile;
    for (let j = 0; j <= steps; j++) {
      const x = Math.floor(this.cX + (toX - this.cX) * j / steps);
      const y = Math.floor(this.cY + (toY - this.cY) * j / steps);
      const tile = mapController.tileAt(x, y);
      if (!tile) return false;
      if (lastTile && lastTile != tile) {
        // Is there a direct path?
        const doorId = lastTile.doorIds.get(toI(x, y));
        if (doorId != 0) {
          // Is there a two-step path?
          const halfSteps = [
            mapController.tileAt(x, lastTile.y),
            mapController.tileAt(lastTile.x, y),
          ];
          const halfStepReaches = halfSteps.some((halfStepTile) => {
            if (!halfStepTile) return false;
            const doorId = halfStepTile.doorIds.get(toI(x, y));
            return doorId == 0;
          });
          if (!halfStepReaches) return false;
        }
      }
      lastTile = tile;
    }
    return true;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {!MapController} mapController
   */
  teleport(x, y, mapController) {
    this.removeFromTiles(mapController);
    this.x = x;
    this.y = y;
    this.addToTiles(mapController);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} speed
   * @param {number} rockDir
   * @param {number|null} forceFacing
   * @param {MapController=} optMapController
   * @private
   */
  moveAction_(x, y, speed, rockDir, forceFacing, optMapController) {
    let progress = 0;
    let oldX = 0;
    let oldY = 0;
    let oldTh = 0;
    let newTh = 0;
    let oldFloorTh = 0;
    let newFloorTh = 0;
    this.actions.push((elapsed) => {
      if (progress == 0) {
        oldX = this.x;
        oldY = this.y;
        oldTh = this.th;
        oldFloorTh = this.floorTh;
        if (optMapController) {
          this.removeFromTiles(optMapController);
          this.x = x;
          this.y = y;
          this.addToTiles(optMapController);
          newTh = this.th;
          newFloorTh = this.floorTh;
        } else {
          // If no map controller is provided, only pretend to move.
          this.x = x;
          this.y = y;
          newTh = oldTh;
          newFloorTh = oldFloorTh;
        }
        if (forceFacing != null) this.facing = forceFacing;
        else this.facing = calcAngle(x - oldX, y - oldY);
      }
      progress = Math.min(1, progress + elapsed * speed);
      this.x = oldX + (x - oldX) * progress;
      this.y = oldY + (y - oldY) * progress;
      this.th = oldTh + (newTh - oldTh) * progress;

      // floorTh interpolates in a jerky way, moving slowly then zipping
      // in the middle, to make it clearer that it has to do with the
      // terrain and not you, as much.
      let iProgress = 0;
      if (progress < 0.3) {
        iProgress = lerp(0, 0.1, progress / 0.3);
      } else if (progress > 0.7) {
        iProgress = lerp(0.9, 1, (progress - 0.7) / 0.3);
      } else {
        iProgress = lerp(0.1, 0.9, (progress - 0.3) / 0.4);
      }
      this.floorTh = oldFloorTh + (newFloorTh - oldFloorTh) * iProgress;

      // Also rock back and forth.
      this.rockAngle = (0.5 - Math.abs(progress - 0.5)) * 0.075 * rockDir;
      return progress == 1;
    });
  }

  /** @param {string} color */
  startColorPulse(color) {
    this.pulseCycle = 0;
    this.pulseColor = color;
  }

  /**
   * @param {!MapController} mapController
   * @return {!Map.<number, !AttackOrMoveInfo>} moves
   */
  getMoves(mapController) {
    if (!this.hasMove && mapController.inCombat) return new Map();
    if (this.moveDistance <= 0) return new Map();
    const maxDistance = mapController.inCombat ? this.moveDistance : 10;
    /** @type {!Map.<number, !Array.<number>>} */
    const paths = new Map();
    const q = [toI(this.x, this.y)];
    paths.set(toI(this.x, this.y), []);
    while (q.length > 0) {
      const i = q.shift();
      const oldX = toX(i);
      const oldY = toY(i);
      const oldPath = paths.get(i) || [];
      const tryXY = (x, y) => {
        const i = toI(x, y);
        const existingPath = paths.get(i);
        if (existingPath && existingPath.length <= oldPath.length + 1) return;
        // Add in the oldX and oldY here, so that it will check that not only is
        // the spot valid, the PATH BETWEEN the two spots is valid!
        if (!this.fitsInSpot(mapController, x, y, true, oldX, oldY)) return;
        paths.set(i, oldPath.concat([i]));
        if (oldPath.length + 1 < maxDistance) {
          q.push(i);
        }
      };
      tryXY(oldX - 1, oldY);
      tryXY(oldX + 1, oldY);
      tryXY(oldX, oldY - 1);
      tryXY(oldX, oldY + 1);
    }

    // Turn final paths into move infos.
    const moveInfos = new Map();
    for (const i of paths.keys()) {
      const x = toX(i);
      const y = toY(i);
      if (x == this.x && y == this.y) continue;
      if (!this.fitsInSpot(mapController, x, y, !mapController.inCombat)) {
        continue;
      }
      const path = paths.get(i);
      const zoningAttacks = new Set();
      const checkForZoningAttacks = (x, y) => {
        const tile = mapController.tileAt(x, y);
        if (!tile) return;
        const creature = tile.creatures[0];
        if (!creature) return;
        if (creature.side == this.side) return;
        if (creature.zonesStacks == 0) return;
        zoningAttacks.add(creature);
      };
      this.tileCallback(mapController, x, y, (tile) => {
        checkForZoningAttacks(tile.x - 1, tile.y);
        checkForZoningAttacks(tile.x + 1, tile.y);
        checkForZoningAttacks(tile.x, tile.y - 1);
        checkForZoningAttacks(tile.x, tile.y + 1);
      });
      const fn = () => {
        this.breakEngagement_();
        let rockDir = Math.random() < 0.5 ? 1 : -1;
        for (const i of path) {
          this.moveAction_(toX(i), toY(i), 12, rockDir, null, mapController);
          rockDir *= -1;
        }
        this.effectAction(() => {
          this.hasMove = false;
        });
        this.takeZoningAttacks_(zoningAttacks);
      };
      moveInfos.set(i, new AttackOrMoveInfo(
          x, y, path, !!this.engaged, zoningAttacks, fn));
    }
    return moveInfos;
  }

  /** @param {string} text */
  say(text) {
    this.addTextParticle_(text, -1);
    // TODO: make talking sounds, based on the length of the line?
  }

  talk() {
    if (!this.npcLines) return;
    const line = data.getValue('npc lines', this.npcLines, 's', this.npcLineOn);
    if (line) {
      this.say(line);
      this.npcLineOn += 1;
    } else if (this.npcLineOn > 0 && this.side != Creature.Side.Npc) {
      // Whoops, you've gone past the last line. Back up, and try again.
      // Only do this if you're an NPC, of course; bosses shouldn't keep
      // blabbing once they are out of lines.
      this.npcLineOn -= 1;
      this.talk();
    }
  }


  // Save/load.

  /**
   * @param {number} level
   * @return {!Creature}
   */
  static makeSamplePlayerAtLevel(level) {
    const template = 'sample player t' + tierForLevel(level);
    const creature = Creature.makeFromTemplate(template, 10 + level, level);
    for (const stat of creature.stats) {
      stat.number += 1; // Average of [13, 12, 10, 9]
    }
    return creature;
  }

  /**
   * @param {string} template
   * @param {number} seed
   * @param {number=} optOverrideLevel
   * @return {!Creature}
   */
  static makeFromTemplate(template, seed, optOverrideLevel) {
    const rng = seededRNG(seed);
    /**
     * @param {string} name
     * @return {string}
     */
    const getV = (name) => {
      return data.getValue('creature templates', template, name) || '';
    };
    /**
     * @param {string} name
     * @return {string}
     */
    const getVVariants = (name) => {
      const variants = [];
      for (let i = 0; ; i++) {
        const variant = data.getValue('creature templates', template, name + i);
        if (variant == undefined) break;
        variants.push(variant);
      }
      if (variants.length == 0) return getV(name);
      return getRandomArrayEntry(variants, rng);
    };
    /**
     * @param {string} name
     * @return {!Array.<string>}
     */
    const getA = (name) => {
      return data.getArrayValue('creature templates', template, name) || [];
    };
    /**
     * @param {string} name
     * @return {!Array.<string>}
     */
    const getAVariants = (name) => {
      const variants = [];
      for (let i = 0; ; i++) {
        const variant = data.getArrayValue(
            'creature templates', template, name + i);
        if (variant == undefined) break;
        variants.push(variant);
      }
      if (variants.length == 0) return getA(name);
      return getRandomArrayEntry(variants, rng);
    };
    /**
     * @param {string} name
     * @return {number}
     */
    const getN = (name) => {
      return data.getNumberValue('creature templates', template, name) || 0;
    };

    // Make the base creature.
    const speciesType = getV('species');
    const jobTypes = getA('jobs');
    const creature = new Creature(Creature.Side.Enemy, speciesType, jobTypes);
    const species = creature.species;
    const jobs = creature.jobs;

    // Set stats.
    for (const stat of creature.stats) {
      stat.number += species.getStatModifierFor(stat.type);
      for (const job of jobs) {
        stat.number += job.getStatModifierFor(stat.type);
      }
    }

    // Bosses can be the FINAL BOSS.
    creature.finalBoss = getV('finalBoss') == '1';
    creature.boss = creature.finalBoss || (getV('boss') == '1');

    // Starting skills.
    const skills = getA('skills');
    if (skills.length > 0) {
      for (const type of skills) {
        creature.skillPoints -= 1;
        creature.skills.push(new Skill(type));
      }
    }

    // Give a fighting style, perhaps.
    const fightingStyle = getV('fightingStyle');
    if (fightingStyle) {
      creature.activeFightingStyle = new FightingStyle(fightingStyle);
    }

    // Give gear.
    const armors = getAVariants('armors');
    for (const type of armors) {
      creature.armors.push(new Armor(type));
    }
    const weapon = getVVariants('weapon');
    if (weapon) {
      creature.weapon = new Weapon(weapon);
    }
    const accessory = getVVariants('accessory');
    if (accessory) {
      creature.accessory = new Accessory(accessory);
    }
    const ring = getVVariants('ring');
    if (ring) {
      creature.ring = new Ring(ring);
    }
    creature.techTypes = getAVariants('techniques');

    // Level up.
    let level = getN('level');
    if (optOverrideLevel != undefined) level = optOverrideLevel;
    while (creature.level < level) {
      creature.levelUp();
    }

    // Spend stat points.
    /**
     * A measure of how good raising the stat is, measured based on how much it
     * increases your generation points.
     * @param {!Stat} stat
     * @return {number}
     */
    const statDesirability = (stat) => {
      let desirability = -creature.generationPoints;
      stat.number += 1;
      desirability += creature.generationPoints;
      stat.number -= 1;
      return desirability;
    };
    let totalStatDesirability = 0;
    let bestStat;
    let bestStatPoints = 0;
    for (const stat of creature.stats) {
      const points = statDesirability(stat);
      totalStatDesirability += points;
      if (points > bestStatPoints) {
        bestStat = stat;
        bestStatPoints = points;
      }
    }
    const totalStatPoints = creature.statPoints;
    for (const stat of creature.stats) {
      const toSpend = Math.floor(
          totalStatPoints * statDesirability(stat) / totalStatDesirability);
      creature.statPoints -= toSpend;
      stat.number += toSpend;
    }
    bestStat.number += creature.statPoints;
    creature.statPoints = 0;

    // Spend skill points.
    while (creature.skillPoints > 0) {
      creature.skills.push(new Skill('enemy'));
      creature.skillPoints -= 1;
    }

    // Fill up life, astra, etc.
    creature.refill();

    // Set NPC values.
    const npcLines = getV('npcLines');
    if (npcLines) {
      creature.side = Creature.Side.Npc;
      creature.npcLines = npcLines;
      creature.makeBar();
    }

    // Enemies (bosses, basically) also have lines.
    const enemyLines = getV('enemyLines');
    if (enemyLines) {
      creature.npcLines = enemyLines;
    }

    // Set name.
    creature.name = capitalizeFirstLetterOfEachWord(template);

    // Fixed gender.
    if (getV('gender')) {
      species.gender = getN('gender');
    } else {
      // Random gender.
      species.gender = rng() < 0.3; // TODO: species-based chance?
    }

    // Hairstyle is always fixed.
    species.hairstyle.type = getVVariants('hairstyle') || 'bald';

    // Fixed coloration.
    if (getV('coloration')) {
      species.coloration = getN('coloration');
    } else {
      // Random coloration.
      const colorationTickets = [];
      for (species.coloration = 0; ; species.coloration += 1) {
        const numTickets = species.colorationTickets;
        if (numTickets == null) break;
        for (let j = 0; j < numTickets; j++) {
          colorationTickets.push(species.coloration);
        }
      }
      species.coloration = getRandomArrayEntry(colorationTickets, rng);
    }

    // Record the reproduction info.
    creature.seed = seed;
    creature.template = template;

    return creature;
  }

  /**
   * @param {string} saveString
   * @return {!Creature}
   */
  static load(saveString) {
    const save = saveManager.stringToSaveObj(saveString);

    const template = save['t'];
    const side = template ? Creature.Side.Enemy : Creature.Side.Player;
    let creature;
    if (side != Creature.Side.Player) {
      // Reproduction info.
      const seed = saveManager.intFromSaveObj(save, 's');
      creature = Creature.makeFromTemplate(template, seed);
    } else {
      // Stats.
      creature = new Creature(side, save['species'], save['jobs'].split(','));
      creature.level = saveManager.intFromSaveObj(save, 'level');
      for (const stat of creature.stats) {
        stat.number = saveManager.intFromSaveObj(save, stat.type) + 10;
      }
      if (save['skills']) {
        creature.skills = save['skills'].split(',').map((str) => {
          return new Skill(str);
        });
      }

      // Appearance.
      creature.name = save['name'];
      creature.species.gender = saveManager.boolFromSaveObj(save, 'gender');
      creature.species.hairstyle.type = save['hairstyle'];
      creature.species.coloration = saveManager.intFromSaveObj(
          save, 'coloration');

      // Gear.
      if (save['armors']) {
        creature.armors = save['armors'].split(',').map((saveString) => {
          return new Armor(saveString);
        });
      }
      if (save['weapon']) {
        creature.weapon = new Weapon(save['weapon']);
      }
      if (save['secondWeapon']) {
        creature.secondWeapon = new Weapon(save['secondWeapon']);
      }
      if (save['accessory']) {
        creature.accessory = new Accessory(save['accessory']);
      }
      if (save['ring']) {
        creature.ring = new Ring(save['ring']);
      }
      if (save['techniques']) {
        creature.techTypes = save['techniques'].split(',');
      }
      if (save['activeFightingStyle']) {
        creature.activeFightingStyle =
            new FightingStyle(save['activeFightingStyle']);
      }
      if (save['knownFightingStyles']) {
        creature.knownFightingStyleTypes =
            save['knownFightingStyles'].split(',');
      }
    }

    // Variables.
    creature.x = saveManager.intFromSaveObj(save, 'x');
    creature.y = saveManager.intFromSaveObj(save, 'y');
    creature.exp = saveManager.intFromSaveObj(save, 'xp');
    creature.boss = saveManager.boolFromSaveObj(save, 'boss');
    creature.finalBoss = saveManager.boolFromSaveObj(save, 'fBoss');
    if (side == Creature.Side.Player) {
      creature.statPoints = saveManager.intFromSaveObj(save, 'stP');
      creature.skillPoints = saveManager.intFromSaveObj(save, 'skP');
      creature.astra = saveManager.intFromSaveObj(save, 'a');
    } else {
      creature.refill(); // Enemies refill astra if you flee.
      creature.encounterId = saveManager.intFromSaveObj(save, 'eId');
      creature.deathLedgerId = saveManager.intFromSaveObj(save, 'dId');
      creature.npcLineOn = saveManager.intFromSaveObj(save, 'nLO');
    }
    creature.life = saveManager.intFromSaveObj(save, 'l');
    creature.makeBar();

    return creature;
  }

  /** @return {string} */
  get saveString() {
    const save = {};

    if (this.side != Creature.Side.Player) {
      // Reproduction info.
      save['t'] = this.template;
      saveManager.intToSaveObj(save, 's', this.seed);
    } else {
      // Stats.
      save['species'] = this.species.type;
      save['jobs'] = this.jobs.map((job) => job.type).join(',');
      saveManager.intToSaveObj(save, 'level', this.level);
      for (const stat of this.stats) {
        saveManager.intToSaveObj(save, stat.type, stat.number - 10);
      }
      if (this.skills.length > 0) {
        save['skills'] = this.skills.map((skill) => skill.type).join(',');
      }

      // Appearance.
      save['name'] = this.name;
      saveManager.boolToSaveObj(save, 'gender', this.species.gender);
      save['hairstyle'] = this.species.hairstyle.type;
      saveManager.intToSaveObj(save, 'coloration', this.species.coloration);

      // Gear.
      if (this.armors.length > 0) {
        save['armors'] = this.armors.map((armor) => armor.saveString).join(',');
      }
      if (this.weapon) {
        save['weapon'] = this.weapon.saveString;
      }
      if (this.secondWeapon) {
        save['secondWeapon'] = this.secondWeapon.saveString;
      }
      if (this.accessory) {
        save['accessory'] = this.accessory.saveString;
      }
      if (this.ring) {
        save['ring'] = this.ring.saveString;
      }
      if (this.techTypes.length > 0) {
        save['techniques'] = this.techTypes.join(',');
      }
      if (this.activeFightingStyle) {
        save['activeFightingStyle'] = this.activeFightingStyle.type;
      }
      if (this.knownFightingStyleTypes.length > 0) {
        save['knownFightingStyles'] = this.knownFightingStyleTypes.join(',');
      }
    }

    // Variables.
    saveManager.intToSaveObj(save, 'x', this.x);
    saveManager.intToSaveObj(save, 'y', this.y);
    saveManager.intToSaveObj(save, 'xp', this.exp);
    saveManager.intToSaveObj(save, 'l', this.life);
    saveManager.boolToSaveObj(save, 'boss', this.boss);
    saveManager.boolToSaveObj(save, 'fBoss', this.finalBoss);
    if (this.side == Creature.Side.Player) {
      saveManager.intToSaveObj(save, 'stP', this.statPoints);
      saveManager.intToSaveObj(save, 'skP', this.skillPoints);
      saveManager.intToSaveObj(save, 'a', this.astra);
    } else {
      saveManager.intToSaveObj(save, 'eId', this.encounterId);
      saveManager.intToSaveObj(save, 'dId', this.deathLedgerId);
      saveManager.intToSaveObj(save, 'nLO', this.npcLineOn);
    }

    return JSON.stringify(save);
  }
}

/** @enum {number} */
Creature.Side = {
  Enemy: 0,
  Player: 1,
  Npc: 2,
};

/** @enum {number} */
Creature.HitResult = {
  Miss: 0,
  Graze: 1,
  Hit: 2,
  Crit: 3,
};

/** @enum {number} */
Creature.AttackType = {
  Normal: 1,
  Disengage: 2,
  Zoning: 3,
  Charged: 4,
};
