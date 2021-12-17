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
   * @param {boolean} player
   * @param {string} species
   * @param {!Array.<string>} jobs
   */
  constructor(player, species, jobs) {
    // Stats.
    this.name = '';
    this.player = player;
    this.level = 1;
    this.species = new Species(species);
    this.jobs = jobs.map((type) => new Job(type));
    /** @type {!Array.<!Stat>} */
    this.stats = [];
    const allStats = data.getCategoryEntriesArray('stats') || [];
    for (const type of allStats) {
      this.stats.push(new Stat(type, 10, this.species));
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
    /** @type {?Accessory} */
    this.accessory;
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
    this.exp = 0;

    // Temporary.
    this.facing = 0;
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
    for (const job of this.jobs) {
      total += fn(job);
    }
    this.stats.forEach((stat) => total += fn(stat));
    this.skills.forEach((skill) => total += fn(skill));
    this.armors.forEach((armor) => total += fn(armor));
    if (this.accessory) total += fn(this.accessory);
    if (this.weapon) total += fn(this.weapon);
    return total;
  }

  /** @return {!Level} */
  get levelObj() {
    return new Level('' + this.level);
  }

  /** @return {number} */
  get monsterAttackBonus() {
    return this.monstrous ? 15 : 0;
  }

  /** @return {number} */
  get maxAstra() {
    const mult = 100 + this.tallyBonusSources_((bS) => bS.astra);
    let astra = 50 * mult / 100;
    if (this.player) astra *= mechPlayerAstraMult;
    return Math.floor(astra);
  }

  /** @return {number} */
  get powerVsUninjured() {
    return this.tallyBonusSources_((bS) => bS.powerVsUninjured);
  }

  /** @return {number} */
  get attackPower() {
    let attackPower = 100 + this.summonModifier + this.monsterAttackBonus;
    attackPower += this.tallyBonusSources_((bS) => bS.attackPower);
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
    let specialPower = 100 + this.summonModifier + this.monsterAttackBonus;
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
    let defense = this.summonModifier + this.monsterAttackBonus;
    defense += this.tallyBonusSources_((bS) => bS.defense);
    defense += this.defenseFromExcessArmorProfiencyLevel;
    if (this.unarmoredDefense) defense += this.levelObj.scalingBonus;
    return defense;
  }

  /** @return {number} */
  get resistance() {
    let resistance = this.summonModifier + this.monsterAttackBonus;
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
    if (this.monstrous) life *= 4;
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
  get initiative() {
    let initiative = 100 + this.summonModifier;
    initiative += this.tallyBonusSources_((bS) => bS.initiative);
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
  get desiredNumJobs() {
    return (this.levelObj.tier >= 2) ? 2 : 1;
  }

  /** @return {number} */
  get generationPoints() {
    /**
     * @param {!Weapon} weapon
     * @return {number}
     */
    const weaponValue = (weapon) => {
      let mult = 0;
      mult += this.powerVsUninjured * 0.4;
      if (weapon.usesSpecialPower) {
        mult += this.specialPower;
      } else {
        mult += this.attackPower;
        mult += this.attackPowerWhenDisengaged / 2;
        mult += this.specialAttackPower / 4;
      }
      if (!weapon.helpful && !weapon.summon) {
        const critChance = this.hitsToCrits + weapon.weaponHitsToCrits;
        mult += critChance * mechHitsToCritsValue;
      }
      let value = weapon.generationPointsDamage / mechBaseDamage;
      value *= mult / 100;
      if (!weapon.helpful && !weapon.summon) {
        value *= (100 + weapon.weaponAccuracy + this.accuracy) / 200;
      }
      return value;
    };

    let freeAttackValue = 0;
    for (const weapon of this.usableWeapons) {
      const value = weaponValue(weapon);
      if (weapon.astraCost != 0) continue;
      freeAttackValue = Math.max(freeAttackValue, value);
    }
    let techAttackValue = 0;
    let techs = 0;
    for (const weapon of this.usableWeapons) {
      if (weapon.astraCost == 0) continue;
      techs += 1;
      const value = weaponValue(weapon) - freeAttackValue;
      if (value <= 0) continue;
      const adjMaxAstra =
          this.maxAstra / (this.player ? mechPlayerAstraMult : 1);
      const uses = adjMaxAstra / weapon.astraCost;
      techAttackValue += value * uses / 10;
    }
    if (techs > 0) techAttackValue /= techs;

    const totalDefense = this.resistance + this.defense;

    let generationPoints = this.maxLife / mechBaseLife;
    generationPoints *= (mechBaseDamage + totalDefense) / 100;
    generationPoints *= (100 + this.dodge + this.dodgeVsDisengage / 3) / 100;
    generationPoints *= (100 + this.initiative) / 100;
    generationPoints *= 0.3 + freeAttackValue + techAttackValue;
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

  /** @return {boolean} */
  get zones() {
    return this.tallyBonusSources_((bS) => bS.zones ? 1 : 0) > 0;
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
        this.armors, this.weapon, this.accessory, statusTypes);
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

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @private
   */
  drawFloorShape_(ctx) {
    ctx.translate(-this.x * gfxTileSize, -this.y * gfxTileSize);

    const color = data.getColorByNameSafe(
        'tile' + (this.player ? ' player' : ' enemy'));
    const fsd = this.getFloorShapeDimensions_();

    if (this.engaged) {
      const oColor = data.getColorByNameSafe(
          'tile' + (this.engaged.player ? ' player' : ' enemy'));
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
    const colorSuffix = this.player ? ' player' : ' enemy';
    const setAstraFont = () => gfx.setFont(ctx, aH);
    const setLifeFont = () => gfx.setFont(ctx, lH);

    // Get astra number size.
    const astraText = ' ' + this.astra + '/' + this.maxAstra;
    setAstraFont();
    const lW = w - gfx.measureText(ctx, astraText);

    // Life bar border.
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(0, 0, lW, lH);

    // Life bar back.
    ctx.fillStyle = data.getColorByNameSafe('tile slot back');
    ctx.fillRect(b, b, lW - 2 * b, lH - 2 * b);

    // Life bar.
    ctx.fillStyle = data.getColorByNameSafe('tile' + colorSuffix);
    ctx.fillRect(b, b, (lW - 2 * b) * this.life / this.maxLife, lH - 2 * b);

    // Life number.
    ctx.fillStyle = data.getColorByNameSafe('tile text' + colorSuffix);
    setLifeFont();
    gfx.drawText(ctx, 0, 0, ' ' + this.life,
        Graphics.TextAlign.Left, Graphics.TextBaseline.Top);

    // Astra back.
    ctx.fillStyle = data.getColorByNameSafe('tile slot border');
    ctx.fillRect(lW, 0, w - lW, h);

    // Astra number.
    ctx.fillStyle = data.getColorByNameSafe('tile text' + colorSuffix);
    setAstraFont();
    gfx.drawText(ctx, w, h - aH / 2, astraText,
        Graphics.TextAlign.Right, Graphics.TextBaseline.Middle);
  }

  /** @return {number} */
  get appearanceSizeMult() {
    return this.species.appearanceSizeMult;
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
    const heightMult = tallFrame ? 1.5 : 1;
    const buffer = gfx.makeBuffer();
    buffer.width = gfxTileSize;
    buffer.height = heightMult * gfxTileSize;
    const ctx = gfx.getContext(buffer);
    this.draw(ctx);
    if (!this.spriteObject) this.spriteObject = new SpriteObject();
    const s = this.s * this.appearanceSizeMult;
    this.spriteObject.setBuffer(buffer, s, heightMult * s);
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
    this.tileCallback(mapController, this.x, this.y, (tile) => {
      if (!tile) return;
      tile.creatures.push(this);
    });
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
    this.shakeEffect = Math.max(0, this.shakeEffect - elapsed);
    if (this.actions.length > 0) {
      if (this.actions[0](elapsed)) {
        this.actions.shift();
      }
    } else if (this.engaged) {
      this.facing =
          calcAngle(this.engaged.cX - this.cX, this.engaged.cY - this.cY);
    }
    this.particleDelayTimer -= elapsed;
    if (this.particleDelayTimer <= 0) {
      this.particleDelayTimer = 0;
      if (this.delayedCachedParticles.length > 0) {
        this.cachedParticles.push(this.delayedCachedParticles.shift());
        this.particleDelayTimer = 0.35;
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
            ((2 * Math.random() - 1) * 0.01);
        const x = from.cX + Math.cos(a) * r;
        const y = from.cY + Math.sin(a) * r;
        return [x, y, h];
      };

      const [x, y, h] = getPosition(this);
      const [xD, yD, hD] = getPosition(this.chargingTarget);

      const color = data.getColorByNameSafe('white'); // TODO: color of spell
      const alpha = 0.5;
      const radius = 0.075; // TODO: based on cost of spell
      const particle = Particle.makeLineParticle(
          xD, yD, hD, color, alpha, radius);
      particle.x = x;
      particle.y = y;
      particle.h = h;
      this.cachedParticles.push(particle);
    }
    if (Math.random() < 0.25 - (this.life / this.maxLife)) {
      this.addBloodParticle_();
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
      if (Math.random() < 0.25) {
        const color = data.getColorByNameSafe('fire');
        const scatter = 0.1;
        const sprites = [500, 501];
        const scale = 0.1;
        this.addGenericParticle_(
            Particle.makePuffParticle(sprites, scale, color, scatter));
      } else {
        const color = data.getColorByNameSafe('smoke');
        const scatter = 0.05;
        const sprites = [502, 503, 504];
        const scale = 0.4;
        this.addGenericParticle_(
            Particle.makePuffParticle(sprites, scale, color, scatter));
      }
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
    this.spriteObject.addToGroup(group, camera, x, y, {facing: this.facing});
    if (!this.barSpriteObject) this.makeBar();
    this.barSpriteObject.addToGroup(
        group, camera, this.cX, this.cY, {drawBack: -0.05});
    if (inCombat) {
      if (!this.floorShapeObject) this.makeFloorShape_();
      this.floorShapeObject.addToGroup(group, this.cX, this.cY);
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

  /**
   * @param {number} healing
   * @private
   */
  receiveHealing_(healing) {
    this.life = Math.min(this.maxLife, this.life + healing);
    this.addTextParticle_('+' + healing, 0);
    this.makeBar();
  }

  /**
   * @param {number} damage
   * @param {!Creature.HitResult} hitResult
   * @private
   */
  takeDamage_(damage, hitResult) {
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
          if (creature.player == this.player && ignoreAllies) continue;
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

  turnStart() {
    if (this.summonAwake) {
      this.hasMove = true;
      this.hasAction = true;
    }
    if (this.chargingTarget && this.chargingWeapon &&
        !this.chargingTarget.dead) {
      this.effectAction(() => {
        this.chargingTarget = null;
        this.chargingWeapon = null;
      });
      this.attack_(this.chargingTarget, this.chargingWeapon,
          Creature.AttackType.Charged);
    }
  }

  turnEnd() {
    let dot = 0;
    dot += this.statuses.get(Weapon.Status.Burning) || 0;
    dot += this.statuses.get(Weapon.Status.Poisoned) || 0;
    if (dot > 0) {
      dot *= 0.8 + 0.4 * Math.random();
      dot = randomRound(dot);
      if (dot) {
        this.takeDamage_(dot, Creature.HitResult.Graze);
      }
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

    // Add techniques.
    const exhaustedTechTypes = this.exhaustedTechTypes.slice();
    for (const type of this.techTypes) {
      const idx = exhaustedTechTypes.indexOf(type);
      if (idx != -1) {
        // If it's been exhausted, don't add (this instance of) the tech.
        exhaustedTechTypes.splice(idx, 1);
        continue;
      }

      const weapon = new Weapon(type);
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
      let tier = undefined;
      if (weapon.scaling) {
        switch (weapon.scaling) {
          case Weapon.Scaling.MeleeWeapon:
          case Weapon.Scaling.RangedWeapon:
            if (!this.weapon) break;
            let weaponUsed = this.weapon;
            if (weapon.scaling == Weapon.Scaling.MeleeWeapon) {
              if (this.martialArts) weaponUsed = this.unarmed;
              if (weaponUsed.ranged) break;
            } else {
              if (!weaponUsed.ranged) break;
            }
            tier = weaponUsed.tier;
            weapon.baseWeapon = weaponUsed;
            break;
          case Weapon.Scaling.Level:
            tier = this.levelObj.tier;
            break;
        }
      }
      if (tier == undefined) continue;
      weapon.forceTier = tier;
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
    const minRange = weapon.minRange;
    const maxRange = weapon.maxRange + (weapon.ranged ? this.rangeBonus : 0);
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
        const isFriend = target.player == this.player;
        if (isFriend != weapon.helpful) continue;
        if (!this.hasLOS(tile.x + 0.5, tile.y + 0.5, mapController)) continue;
        if (this.engaged) {
          willBreakEngagement = target != this && target != this.engaged;
        }
      }

      // Make the attack info.
      const fn = () => {
        if (willBreakEngagement) this.breakEngagement_();
        const target = tile.creatures[0];
        if (weapon.spell && this.engaged != target) {
          this.chargingTarget = target;
          this.chargingWeapon = weapon;
          this.hasAction = false;
          this.hasMove = false;
          this.addTextParticle_('CASTING...', 0);
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
    let target;
    let tile;
    if (weapon.summon) {
      if (targetOrTile instanceof Creature) return;
      tile = targetOrTile;
    } else {
      if (targetOrTile instanceof GameMapTile) return;
      target = targetOrTile;
    }

    // TODO: animation
    // TODO: be sure set facing in the animation!

    for (let hit = 0; hit < weapon.numHits; hit++) {
      // TODO: projectile

      this.effectAction(() => {
        if (weapon.summon) {
          if (tile && optMapController) {
            const estimate = this.getAttackEstimate(this, weapon,
                Creature.HitResult.Hit, Creature.AttackType.Normal);
            const damage = Math.ceil(weapon.damage * estimate.mult / 100);
            const summon = this.makeSummon_(weapon, damage);
            summon.x = tile.x;
            summon.y = tile.y;
            optMapController.addCreature(summon);
            // TODO: this isn't showing up in the map creatures list?
          }
        } else if (target) {
          this.strike_(target, weapon, attackType);
        }
      });
    }

    // Pay costs.
    this.effectAction(() => {
      if (weapon.lifeCost > 0) {
        this.takeDamage_(weapon.lifeCost, Creature.HitResult.Graze);
      }
      if (weapon.astraCost > 0) {
        this.astra -= weapon.astraCost;
        this.makeBar();
      }
      if (weapon.summon) {
        // Summons exhaust after one use.
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

    // TODO: animation return
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
    const summon = new Creature(this.player, summonSpecies, summonJobs);
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
    this.currentSummon = summon;
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
      if (!this.engaged && attackType == Creature.AttackType.Normal) {
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
    mult = Math.max(0, mult);
    if (attackType == Creature.AttackType.Zoning) mult /= 2;
    return new AttackEstimate(mult, hitChance, hitsToCrits);
  }

  /**
   * @param {!Particle} particle
   * @private
   */
  addGenericParticle_(particle) {
    particle.x = this.cX;
    particle.y = this.cY;
    particle.h = Math.random() *
        (this.s * this.headHeightPoint * this.appearanceSizeMult);
    this.cachedParticles.push(particle);
  }

  /** @private */
  addBloodParticle_() {
    const color = data.getColorByNameSafe('blood');
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
    particle.h = this.s;
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

    const hitResult = this.getHitResult_(target, weapon, attackType);
    switch (hitResult) {
      case Creature.HitResult.Miss:
        // TODO: dodge visual/audio effects on target?
        target.addTextParticle_('DODGE', -1);
        return;
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

    const mult = this.getAttackEstimate(
        target, weapon, hitResult, attackType, true).mult / weapon.numHits;

    // Damage.
    const damage = Math.ceil(mult * weapon.damage / 100);
    if (weapon.heals) {
      target.receiveHealing_(damage);
    } else {
      target.takeDamage_(damage, hitResult);
    }
    if (weapon.drains && damage) this.receiveHealing_(damage);

    // Don't show status effects if the attack did NOTHING.
    if (mult == 0) return;

    for (const status of Weapon.allStatuses) {
      let effect = weapon.getStatus(status) * mult / 100;
      if (effect <= 0) continue;
      if (status == Weapon.Status.Burning || status == Weapon.Status.Poisoned) {
        // Pretty fast, but not as fast as normal damage.
        effect *= 0.7;
      } else {
        effect /= target.baseMaxLife;
        // Doing enough damage to kill the base life for their level
        // (e.g. ignoring their life multipliers) inflicts this penalty:
        effect *= 250;
      }
      effect = Math.ceil(effect / (target.halveStatuses ? 2 : 1));
      const old = target.statuses.get(status) || 0;
      target.statuses.set(status, old + effect);
      target.addTextParticle_(status.toUpperCase(), 0);
      if (old == 0) target.makeAppearance();
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
   * @param {!MapController} mapController
   * @param {(function())=} optInterceptionFn
   * @return {!Map.<number, !AttackOrMoveInfo>} moves
   */
  getMoves(mapController, optInterceptionFn) {
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
        if (creature.player == this.player) return;
        if (!creature.zones) return;
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
        for (const i of path) {
          const x = toX(i);
          const y = toY(i);
          let progress = 0;
          let oldX = 0;
          let oldY = 0;
          this.actions.push((elapsed) => {
            if (progress == 0) {
              oldX = this.x;
              oldY = this.y;
              this.removeFromTiles(mapController);
              this.x = x;
              this.y = y;
              this.addToTiles(mapController);
              this.facing = calcAngle(x - oldX, y - oldY);
            }
            progress = Math.min(1, progress + elapsed * 12);
            this.x = oldX + (x - oldX) * progress;
            this.y = oldY + (y - oldY) * progress;
            // TODO: rock back and forth visually (rotate) while walking...
            return progress == 1;
          });
          if (optInterceptionFn) {
            this.effectAction(optInterceptionFn);
          }
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
    const creature = new Creature(false, speciesType, jobTypes);
    const species = creature.species;
    const jobs = creature.jobs;

    // Set stats.
    for (const stat of creature.stats) {
      stat.number += species.getStatModifierFor(stat.type);
      for (const job of jobs) {
        stat.number += job.getStatModifierFor(stat.type);
      }
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

    // Set name.
    creature.name = capitalizeFirstLetterOfEachWord(template);

    // Random gender.
    species.gender = rng() < 0.3; // TODO: species-based chance?

    // Hairstyle is always fixed.
    species.hairstyle.type = getVVariants('hairstyle') || 'bald';

    // Fixed coloration?
    const coloration = getV('coloration');
    if (coloration) {
      species.coloration = parseInt(coloration, 10);
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
    const player = !template;
    let creature;
    if (!player) { // TODO: if it's an enemy
      // Reproduction info.
      const seed = saveManager.intFromSaveObj(save, 's');
      creature = Creature.makeFromTemplate(template, seed);
    } else {
      // Stats.
      creature = new Creature(player, save['species'], save['jobs'].split(','));
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
      if (save['accessory']) {
        creature.accessory = new Accessory(save['accessory']);
      }
      if (save['techniques']) {
        creature.techTypes = save['techniques'].split(',');
      }
    }

    // Variables.
    creature.x = saveManager.intFromSaveObj(save, 'x');
    creature.y = saveManager.intFromSaveObj(save, 'y');
    creature.exp = saveManager.intFromSaveObj(save, 'xp');
    if (player) {
      creature.statPoints = saveManager.intFromSaveObj(save, 'stP');
      creature.skillPoints = saveManager.intFromSaveObj(save, 'skP');
      creature.astra = saveManager.intFromSaveObj(save, 'a');
    } else {
      creature.refill(); // Enemies refill astra if you flee.
      creature.encounterId = saveManager.intFromSaveObj(save, 'eId');
    }
    creature.life = saveManager.intFromSaveObj(save, 'l');
    creature.makeBar();

    return creature;
  }

  /** @return {string} */
  get saveString() {
    const save = {};

    if (!this.player) {
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
      if (this.accessory) {
        save['accessory'] = this.accessory.saveString;
      }
      if (this.techTypes.length > 0) {
        save['techniques'] = this.techTypes.join(',');
      }
    }

    // Variables.
    saveManager.intToSaveObj(save, 'x', this.x);
    saveManager.intToSaveObj(save, 'y', this.y);
    saveManager.intToSaveObj(save, 'xp', this.exp);
    saveManager.intToSaveObj(save, 'l', this.life);
    if (this.player) {
      saveManager.intToSaveObj(save, 'stP', this.statPoints);
      saveManager.intToSaveObj(save, 'skP', this.skillPoints);
      saveManager.intToSaveObj(save, 'a', this.astra);
    } else {
      saveManager.intToSaveObj(save, 'eId', this.encounterId);
    }

    return JSON.stringify(save);
  }
}

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
