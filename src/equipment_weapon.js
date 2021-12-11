class Weapon extends Equipment {
  /** @param {string} type */
  constructor(type) {
    super(type);
    /** @type {?number} */
    this.forceTier;
    this.baseArmorPiercing = false;
    this.baseWeaponHitsToCrits = 0;
    this.engagementMode = false;
  }

  /** @return {string} */
  get category() {
    return 'weapons';
  }

  /** @return {number} */
  get tier() {
    if (this.forceTier != null) return this.forceTier;
    return this.getNumberValue('tier');
  }

  /** @return {string} */
  get noProficiency() {
    return this.getBooleanValue('noProficiency');
  }

  /** @return {boolean} */
  get usesSpecialPower() {
    return this.getBooleanValue('usesSpecialPower');
  }

  /** @return {number} */
  get weaponAccuracy() {
    return this.getNumberValue('weaponAccuracy');
  }

  /** @return {number} */
  get weaponHitsToCrits() {
    return this.baseWeaponHitsToCrits +
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
    // BSV has a slightly bigger effect on weapon damage, since high-BSV weapons
    // have the advantage that you can use use a technique and ignore your
    // weapon's actual base damage. So low-BSV weapons can get the gimmick of
    // actually being good at basic attacks.
    effectiveBonusSourceValue += this.getBonusSourceValue() * 1.2;

    // Compute the damage.
    let damage = mechBaseDamage;
    damage *= 100 / (100 + effectiveBonusSourceValue);
    damage *= multForTier(this.tier);
    if (this.energyCost > 0) {
      damage *= 1.03 + this.energyCost * (this.usesSpecialPower ? 0.05 : 0.02);
    }
    if (this.noProficiency) damage *= 0.85;
    return damage;
  }

  /** @return {number} */
  get numHits() {
    return this.getNumberValue('numHits') || 1;
  }

  /** @return {number} */
  get energyCost() {
    return this.getNumberValue('energyCost') || 0;
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
    if (this.spell) damage *= 1.1; // To make up for it being inconvenient.
    if (this.magic && !this.spell) damage *= 0.9; // Possible, but non-ideal.
    return damage;
  }

  /**
   * @param {!Weapon.Status} status
   * @return {number}
   */
  getStatusPercent(status) {
    return this.getNumberValue(status + 'Percent');
  }

  /**
   * @param {!Weapon.Status} status
   * @return {number}
   */
  getStatus(status) {
    const percent = this.getStatusPercent(status);
    if (percent <= 0) return 0;
    return percent * this.baseDamage / 100;
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
    if (this.heals) return 0;
    return (this.ranged && !this.spell) ? 2 : 1;
  }

  /** @return {number} */
  get maxRange() {
    return this.ranged ? 3 : 1;
  }

  /** @return {boolean} */
  get ranged() {
    return this.getBooleanValue('ranged');
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

  /** @return {?string} */
  get summonWeapon() {
    return this.getValue('summonWeapon');
  }

  /** @return {boolean} */
  get spell() {
    return this.getBooleanValue('spell');
  }

  /** @return {boolean} */
  get heals() {
    return this.getBooleanValue('heals');
  }

  /** @return {boolean} */
  get drains() {
    return this.getBooleanValue('drains');
  }

  /** @return {boolean} */
  get helpful() {
    return this.heals;
  }

  /** @return {boolean} */
  get armorPiercing() {
    return this.baseArmorPiercing || this.getBooleanValue('armorPiercing');
  }

  /** @return {string} */
  get damageTerm() {
    if (this.summon) return 'summon strength';
    if (this.heals) return 'healing';
    const prefix = this.drains ? 'draining ' : '';
    if (this.magic) return prefix + 'magic damage';
    return prefix + 'damage';
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

    if (this.summon) {
      const summonFluff = this.getValue('summonFluff') || 'summon';
      effects.push('summons a ' + summonFluff + ' once per battle');
    }

    // Misc properties.
    effects.push(this.minRange + '-' + this.maxRange + ' range');
    if (!this.helpful && !this.summon) {
      effects.push(this.weaponAccuracy + '% accuracy');
      if (this.weaponHitsToCrits > 0) {
        effects.push(this.weaponHitsToCrits + '% hits to crits');
      }
    }
    const costs = [];
    if (this.energyCost > 0) costs.push(this.energyCost + ' energy');
    if (this.lifeCost > 0) costs.push(this.lifeCost + ' life');
    if (costs.length > 0) effects.push('costs ' + costs.join(' and '));
    effects.push('uses ' + (this.usesSpecialPower ? 'special' : 'attack') +
                 ' power');
    if (this.scaling) effects.push('scales with ' + this.scaling);
    if (this.noProficiency) effects.push('no proficiency required');
  }

  /** @return {string} */
  get saveString() {
    return '(W)' + this.type + ':' + this.subtype;
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
  Shaken: 'shaken',
  Blinded: 'blinded',
};
/** @type {!Array.<!Weapon.Status>} */
Weapon.allStatuses = [
  Weapon.Status.Burning,
  Weapon.Status.Poisoned,
  Weapon.Status.Shaken,
  Weapon.Status.Blinded,
];
