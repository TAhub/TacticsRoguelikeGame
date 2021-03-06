class Weapon extends Equipment {
  /** @param {string} type */
  constructor(type) {
    super(type);
    /** @type {?Weapon} */
    this.baseWeapon;
    /** @type {?number} */
    this.forceTier;
    this.engagementMode = false;
  }

  /** @return {string} */
  get category() {
    return 'weapons';
  }

  /** @return {string} */
  get idChar() {
    return 'W';
  }

  /** @return {number} */
  get tier() {
    if (this.forceTier != null) return this.forceTier;
    return this.getNumberValue('tier');
  }

  /** @return {boolean} */
  get noProficiency() {
    return this.getBooleanValue('noProficiency');
  }

  /** @return {boolean} */
  get onePerBattle() {
    return this.getBooleanValue('onePerBattle');
  }

  /** @return {boolean} */
  get usesSpecialPower() {
    return this.getBooleanValue('usesSpecialPower');
  }

  /** @return {boolean} */
  get reliable() {
    return this.getBooleanValue('reliable');
  }

  /** @return {number} */
  get weaponAccuracy() {
    if (this.reliable) return 120;
    return (this.baseWeapon ? (this.baseWeapon.weaponAccuracy - 90) : 0) +
           this.getNumberValue('weaponAccuracy');
  }

  /** @return {number} */
  get weaponHitsToCrits() {
    return (this.baseWeapon ? this.baseWeapon.weaponHitsToCrits : 0) +
           this.getNumberValue('weaponHitsToCrits');
  }

  /** @return {number} */
  get generationPointsDamage() {
    let effectiveBonusSourceValue = 0;
    if (!this.helpful) {
      // The value of the base accuracy and such is reduced, since they normally
      // also help spells and such, but these only apply to this weapon.
      effectiveBonusSourceValue += 0.6 *
        (this.weaponAccuracy - 100 +
         this.weaponHitsToCrits * mechHitsToCritsValue);
    }
    if (this.baseWeapon) {
      // Take on some of the bonus source value of your base weapon, but a
      // reduced amount. More if the base weapon is a downside-weapon.
      const bsv = this.baseWeapon.getBonusSourceValue();
      effectiveBonusSourceValue += bsv * (bsv < 0 ? 0.75 : 0.5);
    }
    // Longer range is useful, but it's less useful if this is a charging attack
    // since they'll just walk up to you while you are charging anyway.
    let scaledWRB = this.weaponRangeBonus;
    if (scaledWRB < 0) scaledWRB *= 1.5; // Reduced range is more impactful.
    effectiveBonusSourceValue += scaledWRB * (this.charged ? 3 : 5);
    // BSV has a slightly bigger effect on weapon damage, since high-BSV weapons
    // have the advantage that you can use use a spell and ignore your weapon's
    // actual base damage. So low-BSV weapons can get the gimmick of actually
    // being good at basic attacks. This multiplier is lower for downsides,
    // since downside-weapons are going to be better at weapon techs.
    const bsv = this.getBonusSourceValue();
    effectiveBonusSourceValue += bsv * (bsv < 0 ? 1 : 1.2);
    // A minor BSV refund for being a WEAPON that gives zoning attacks, since
    // otherwise the ideal way to get zoning attacks would be to just pick up
    // the skill, and non-spear weapons being the perfect weapons for zoning
    // attacks feels off.
    if (this.zones) effectiveBonusSourceValue -= 2;

    // Compute the damage.
    let damage = mechBaseDamage;
    damage *= 100 / (100 + effectiveBonusSourceValue);
    damage *= multForTier(this.tier);
    if (this.astraCost > 0) {
      damage *= 1.03 + this.astraCost * (this.usesSpecialPower ? 0.05 : 0.02);
    }
    if (this.noProficiency) damage *= 0.85;
    return damage;
  }

  /** @return {number} */
  get numHits() {
    return this.getNumberValue('numHits') || 1;
  }

  /** @return {number} */
  get astraCost() {
    return this.getNumberValue('astraCost') || 0;
  }

  /** @return {number} */
  get lifeCost() {
    const percent = this.getNumberValue('lifeCostPercent');
    if (!percent) return 0;
    return Math.floor(percent * multForTier(this.tier) * mechBaseDamage / 100);
  }

  /**
   * Put factors which SHOULDN'T change the GP value of the weapon here.
   * @return {number}
   */
  get baseDamage() {
    let damage = this.generationPointsDamage + this.lifeCost;
    if (this.armorPiercing) damage *= 0.87; // Vs heavy armor
    if (this.armorBlunted) damage *= 1.3 + this.tier * 0.05; // Vs light armor.
    if (this.charged) damage *= 1.15; // To make up for it being inconvenient.
    if (this.magic && !this.charged) damage *= 0.9; // Possible, but non-ideal.
    if (this.selfTargeting) damage *= 1.15;
    if (this.teleports) damage *= 0.9;
    if (this.helpful) damage *= 0.8;
    if (this.commandsSummon) damage *= this.usesSpecialPower ? 0.45 : 0.65;
    if (this.summon) {
      // Summons that are unlimited should be stronger, since the summon
      // basically becomes inert after one attack.
      if (!this.onePerBattle) damage *= 1.15;
    } else {
      // Attacks that are usable once-per-battle should be a bit better.
      if (this.onePerBattle) damage *= 1.075;
    }
    return damage;
  }

  /**
   * @param {!Weapon.Status} status
   * @return {number}
   */
  getStatusPercent(status) {
    let percent = this.getNumberValue(status + 'Percent');
    if (this.baseWeapon) percent += this.baseWeapon.getStatusPercent(status);
    return percent;
  }

  /**
   * @param {!Weapon.Status} status
   * @return {number}
   */
  getStatus(status) {
    const percent = this.getStatusPercent(status);
    if (percent <= 0) return 0;
    let effect = percent * this.baseDamage / 100;

    // Some modifiers are applied in here, so they are visible in the weapon
    // description.
    switch (status) {
      case Weapon.Status.Barrier:
        // Barrier is strong, since it can be applied before the enemy arrives.
        effect *= 0.6;
        // Barrier also raises TWO stats, so halve it on top of that.
        effect /= 2;
        break;
      case Weapon.Status.Cure:
        // Cure is a bit stronger than the other non-damaging status effects
        // since it's purely reactive.
        effect *= 1.3;
        break;
      case Weapon.Status.Bleeding:
        // Bleeding is an upgrade over direct damage, a bit.
        effect *= 1.15;
        break;
      case Weapon.Status.Burning:
      case Weapon.Status.Poisoned:
        // DoT is pretty fast, but not as fast as normal damage.
        effect *= 0.7;
        break;
    }

    return effect;
  }

  /** @return {number} */
  get damage() {
    let percent = 100;
    for (const status of Weapon.allStatuses) {
      percent -= this.getStatusPercent(status);
    }
    if (percent <= 0) return 0;
    if (this.drains) percent *= 0.7;
    return percent * this.baseDamage / 100;
  }

  /** @return {number} */
  get minRange() {
    if (this.heals || this.selfTargeting) return 0;
    if (!this.ranged) return 1;
    if (this.charged || this.usesSpecialPower) return 1;
    return 2;
  }

  /** @return {number} */
  get weaponRangeBonus() {
    if (!this.ranged) return 0;
    let weaponRangeBonus = this.getNumberValue('weaponRangeBonus');
    if (this.baseWeapon) weaponRangeBonus += this.baseWeapon.weaponRangeBonus;
    return weaponRangeBonus;
  }

  /** @return {number} */
  get maxRange() {
    if (this.selfTargeting) return 0;
    return this.ranged ? (3 + this.weaponRangeBonus) : 1;
  }

  /** @return {boolean} */
  get teleports() {
    return this.getBooleanValue('teleports');
  }

  /** @return {boolean} */
  get commandsSummon() {
    return this.getBooleanValue('commandsSummon');
  }

  /** @return {boolean} */
  get ranged() {
    return this.getBooleanValue('ranged');
  }

  /** @return {?string} */
  get targetRingUser() {
    return this.getValue('targetRingUser');
  }

  /** @return {boolean} */
  get selfTargeting() {
    return this.getBooleanValue('selfTargeting');
  }

  /** @return {?Weapon.Scaling} */
  get scaling() {
    const raw = this.getValue('scaling');
    return raw ? /** @type {!Weapon.Scaling} */ (raw) : null;
  }

  /** @return {boolean} */
  get magic() {
    return this.getBooleanValue('magic');
  }

  /** @return {boolean} */
  get summon() {
    return !!this.summonSpecies && this.summonJobs.length > 0;
  }

  /** @return {?string} */
  get summonSpecies() {
    return this.getValue('summonSpecies');
  }

  /** @return {?Array.<string>} */
  get summonJobs() {
    return this.getArrayValue('summonJobs');
  }

  /** @return {?number} */
  get summonColoration() {
    const raw = this.getValue('summonColoration');
    return raw ? parseInt(raw, 10) : null;
  }

  /** @return {?string} */
  get summonWeapon() {
    return this.getValue('summonWeapon');
  }

  /** @return {?Array.<string>} */
  get summonArmors() {
    return this.getArrayValue('summonArmors');
  }

  /** @return {boolean} */
  get charged() {
    return this.getBooleanValue('charged');
  }

  /** @return {boolean} */
  get heals() {
    return this.getBooleanValue('heals');
  }

  /** @return {boolean} */
  get drains() {
    if (this.baseWeapon && this.baseWeapon.drains) return true;
    return this.getBooleanValue('drains');
  }

  /** @return {boolean} */
  get helpful() {
    return this.heals;
  }

  /** @return {boolean} */
  get armorPiercing() {
    if (this.magic || this.summon) return false;
    if (this.baseWeapon && this.baseWeapon.armorPiercing) return true;
    return this.getBooleanValue('armorPiercing');
  }

  /** @return {boolean} */
  get armorBlunted() {
    if (this.magic || this.summon || this.armorPiercing) return false;
    if (this.baseWeapon && this.baseWeapon.armorBlunted) return true;
    return this.getBooleanValue('armorBlunted');
  }

  /** @return {string} */
  get damageTerm() {
    if (this.summon) return 'summon strength';
    if (this.heals) return 'healing';
    const prefix = this.drains ? 'draining ' : '';
    if (this.magic) return prefix + 'magic damage';
    return prefix + 'damage';
  }

  /** @return {number} */
  get animProjSprite() {
    const sprite = this.getNumberValue('animProjSprite');
    if (!sprite && this.baseWeapon) return this.baseWeapon.animProjSprite;
    return sprite || 0;
  }

  /** @return {number} */
  get animProjScale() {
    const scale = (this.getNumberValue('animProjScale') || 100) / 100;
    if (this.baseWeapon) return scale * this.baseWeapon.animProjScale;
    return scale;
  }

  /** @return {number} */
  get animProjDelay() {
    const delay = this.getNumberValue('animProjDelay') || 0;
    if (!delay && this.baseWeapon) return this.baseWeapon.animProjDelay;
    return delay / 100;
  }

  /** @return {number} */
  get animStep() {
    if (this.baseWeapon && this.baseWeapon.animStep) {
      return this.baseWeapon.animStep;
    }
    return (this.getNumberValue('animStep') || 0) / 100;
  }

  /** @return {number} */
  get animPreStepPause() {
    let pause = this.getNumberValue('animPreStepPause') || 0;
    if (this.baseWeapon) pause += this.baseWeapon.animPreStepPause;
    return Math.max(0, pause) / 100;
  }

  /** @return {number} */
  get animPostStepPause() {
    let pause = this.getNumberValue('animPostStepPause') || 0;
    if (this.baseWeapon) pause += this.baseWeapon.animPostStepPause;
    return Math.max(0, pause) / 100;
  }

  /** @return {number} */
  get animProjSpeed() {
    let speed = this.getNumberValue('animProjSpeed') || 0;
    if (this.baseWeapon) speed += this.baseWeapon.animProjSpeed;
    return speed || 1;
  }

  /** @return {boolean} */
  get animProjSkinColor() {
    if (this.baseWeapon && this.baseWeapon.animProjSkinColor) return true;
    return this.getBooleanValue('animProjSkinColor');
  }

  /** @return {?string} */
  get animProjStrikePulseColor() {
    return this.getColorValue('animProjStrikePulseColor');
  }

  /** @return {boolean} */
  get animProjGlows() {
    if (this.baseWeapon && this.baseWeapon.animProjGlows) return true;
    return this.getBooleanValue('animProjGlows');
  }

  /** @return {string} */
  get animProjColor() {
    const color = this.getColorValue('animProjColor');
    if (!color && this.baseWeapon) return this.baseWeapon.animProjColor;
    return color || this.color;
  }

  /** @return {?string} */
  get animSound() {
    const sound = this.getValue('animSound');
    if (!sound && this.baseWeapon) return this.baseWeapon.animSound;
    return sound;
  }

  /** @return {?string} */
  get animStrikeSound() {
    const sound = this.getValue('animStrikeSound');
    if (!sound && this.baseWeapon) return this.baseWeapon.animStrikeSound;
    return sound;
  }

  /** @return {number} */
  get animPitch() {
    let pitch = 0;
    const ranged = this.ranged || this.targetRingUser;
    pitch += (this.animProjSpeed - (ranged ? 8 : 5)) * 200;
    pitch += (this.numHits - 1) * 75;
    pitch += (this.animProjScale - 1) * -400;
    return pitch;
  }

  /**
   * @param {!Array.<string>} effects
   * @param {!Creature} creature
   */
  addCategorySpecificEffectsToDescription(effects, creature) {
    super.addCategorySpecificEffectsToDescription(effects, creature);

    const hitEffects = [];
    if (this.damage > 0) {
      hitEffects.push(
          Math.ceil(this.damage / this.numHits) + ' ' + this.damageTerm);
    }
    for (const status of Weapon.allStatuses) {
      const effect = this.getStatus(status);
      if (!effect) continue;
      hitEffects.push(Math.ceil(effect / this.numHits) + ' ' + status);
    }
    if (this.engagementMode) hitEffects.push('engages');
    effects.push(hitEffects.join(' and '));

    if (this.numHits > 1) effects.push('hits ' + this.numHits + ' times');
    if (this.armorPiercing) effects.push('ignores part of target armor');
    if (this.armorBlunted) effects.push('strongly resisted by target armor');
    if (this.teleports) effects.push('teleports next to target if possible');
    if (this.commandsSummon) {
      effects.push('lets your summon move and act this round');
    }
    if (this.charged) effects.push('takes a turn to charge');

    if (this.summon) {
      const summonFluff = this.getValue('summonFluff') || 'summon';
      effects.push('summons a ' + summonFluff + ' once per battle');
    }

    // Misc properties.
    if (this.targetRingUser) {
      effects.push('targets another person wearing a ' + this.targetRingUser +
                   ' at any range');
    } else {
      effects.push(this.minRange + '-' + this.maxRange + ' range');
    }
    if (!this.helpful && !this.summon) {
      if (this.reliable) {
        effects.push('cannot get natural misses grazes or crits');
      } else {
        effects.push(this.weaponAccuracy + '% accuracy');
      }
      if (this.weaponHitsToCrits > 0) {
        effects.push(this.weaponHitsToCrits + '% hits to crits');
      }
    }
    const costs = [];
    if (this.astraCost > 0) costs.push(this.astraCost + ' astra');
    if (this.lifeCost > 0) costs.push(this.lifeCost + ' life');
    if (costs.length > 0) effects.push('costs ' + costs.join(' and '));
    effects.push('uses ' + (this.usesSpecialPower ? 'special' : 'attack') +
                 ' power');
    if (this.scaling) effects.push('scales with ' + this.scaling);
    if (this.noProficiency) effects.push('no proficiency required');
    if (this.onePerBattle) effects.push('can only be used once per fight');
  }
}

/** @enum {string} */
Weapon.Scaling = {
  MeleeWeapon: 'melee weapon',
  RangedWeapon: 'ranged weapon',
  Level: 'level',
};

/** @enum {string} */
Weapon.Status = {
  Burning: 'burning',
  Poisoned: 'poisoned',
  Bleeding: 'bleeding',
  Shaken: 'shaken',
  Blinded: 'blinded',
  Confused: 'confused',
  Cure: 'cure',
  Barrier: 'barrier',
};
/** @type {!Array.<!Weapon.Status>} */
Weapon.allStatuses = [
  Weapon.Status.Burning,
  Weapon.Status.Poisoned,
  Weapon.Status.Bleeding,
  Weapon.Status.Shaken,
  Weapon.Status.Blinded,
  Weapon.Status.Confused,
  Weapon.Status.Cure,
  Weapon.Status.Barrier,
];
