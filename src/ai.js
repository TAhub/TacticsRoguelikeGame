class AI {
  /**
   * @param {!MapController} mapController
   * @return {{
   *   info: ?AttackOrMoveInfo,
   *   value: number,
   * }}
   */
  static getBestAttack_(mapController) {
    const active = mapController.active;

    let best = {info: null, value: 0};

    // Check all attacks.
    for (const weapon of active.usableWeapons) {
      const attacks = active.getAttacks(mapController, weapon);
      for (const info of attacks.values()) {
        const tile = mapController.tileAt(info.x, info.y);
        let value = 0;
        if (weapon.summon) {
          if (active.boss || active.monstrous) {
            // Big-time enemies don't use summons until injured.
            if (active.life > active.maxLife / 2) continue;
          }
          const mult = active.getAttackEstimate(active, weapon,
              Creature.HitResult.Hit, Creature.AttackType.Normal).mult;
          value += weapon.damage * mult / 100;
        } else {
          if (!tile || tile.creatures.length == 0) continue;
          const target = tile.creatures[0];

          value += AI.oneAttackValue_(
              active, target, weapon, Creature.AttackType.Normal);
          if (weapon.engages && target.engaged != active) {
            if (active.attackPowerWhenDisengaged > 0) {
              // It's not a good idea to engage someone if that will make you
              // actively weaker...
              value -=
                  active.attackPowerWhenDisengaged * active.baseMaxLife / 100;
            }
            if (target.engaged) {
              // They're already engaged to someone else. Is it worthwhile to
              // break the engagement? It'd be a shame for a shitty little enemy
              // to break a boss monster's engagement with the player, just
              // because it can. This has a higher multiplier than the value of
              // adding an engagement, to strongly discourage that.
              value -= 0.65 * AI.oneAttackValue_(
                  target.engaged, target, target.engaged.disengageWeapon,
                  Creature.AttackType.Disengage);
            } else {
              // Also, engaging someone who is disengaged and wants to stay that
              // way is valuable.
              value +=
                  target.attackPowerWhenDisengaged * target.baseMaxLife / 100;
            }
            // Making a NEW engagement (e.g. not just re-upping an old
            // engagement with someone else) will MAYBE give you a melee attack
            // vs them.
            value += 0.5 * AI.oneAttackValue_(active, target,
                active.disengageWeapon, Creature.AttackType.Disengage);
          }
        }

        if (info.willBreakEngagement) {
          value += AI.breakEngagementValueModifier_(mapController);
        }
        value += AI.zoningAttacksValueModifier_(
            mapController, info.zoningAttacks);

        // Finally, the value of the attack gets a small random factor,
        // to make the AI a bit less predictable.
        value *= 0.85 + 0.3 * Math.random();

        if (value <= best.value) continue;
        best = {info, value};
      }
    }

    return best;
  }

  /**
   * @param {!Creature} attacker
   * @param {!Creature} defender
   * @param {!Weapon} weapon
   * @param {!Creature.AttackType} attackType
   * @return {number}
   * @private
   */
  static oneAttackValue_(attacker, defender, weapon, attackType) {
    if (!weapon) return 0; // Whoops.

    // Determine average damage.
    const chances = attacker.getAttackEstimate(
        defender, weapon, Creature.HitResult.Hit, attackType).chances;
    let averageMult = 0;
    for (const hitResult of chances.keys()) {
      averageMult += chances.get(hitResult) * attacker.getAttackEstimate(
          defender, weapon, hitResult, attackType).mult;
    }
    averageMult /= 100;
    let value = averageMult * weapon.baseDamage / 100;
    if (weapon.heals) {
      // Cap the value of healing at the amount it will actually heal.
      value = Math.min(value, defender.maxLife - defender.life);
    } else if (weapon.drains) {
      // Draining weapons are most useful when you are injured.
      value += Math.min(value, attacker.maxLife - attacker.life);
    }

    // Don't heal enemies, or attack friends!
    const isFriend = defender.side == attacker.side;
    if (isFriend != weapon.helpful) value *= -1; // Bad idea!

    return value;
  }

  /**
   * @param {!MapController} mapController
   * @param {!Set.<!Creature>} zoningAttacks
   * @return {number}
   * @private
   */
  static zoningAttacksValueModifier_(mapController, zoningAttacks) {
    const active = mapController.active;
    if (!active) return 0;
    let modifier = 0;
    for (const creature of zoningAttacks) {
      // The AI doesn't value zoning attacks very much. It'd be lame if the AI
      // totally avoided triggering them.
      modifier -= 0.3 * AI.oneAttackValue_(
          creature, active, creature.disengageWeapon,
          Creature.AttackType.Zoning);
    }
    return modifier;
  }

  /**
   * @param {!MapController} mapController
   * @return {number}
   * @private
   */
  static breakEngagementValueModifier_(mapController) {
    const active = mapController.active;
    if (!active) return 0;
    const engaged = active.engaged;
    if (!engaged) return 0;
    // The AI should dislike breaking engagement, but not completely
    // avoid it, or else disengage damage will be irrelevant.
    // The more life the AI has left, the more careless they are with
    // breaking engagement.
    const lifeFactor = active.life / active.maxLife;
    return -(1 - lifeFactor * 0.3) * AI.oneAttackValue_(
        engaged, active, engaged.disengageWeapon,
        Creature.AttackType.Disengage);
  }

  /**
   * @param {!MapController} mapController
   * @return {{
   *   info: ?AttackOrMoveInfo,
   *   value: number,
   * }}
   */
  static getBestMove_(mapController) {
    const active = mapController.active;

    let best = {info: null, value: -25};
    /** @param {?AttackOrMoveInfo} info */
    const check = (info) => {
      const bestAttack = AI.getBestAttack_(mapController);
      let value = bestAttack.value;
      if (info && info.willBreakEngagement) {
        value += AI.breakEngagementValueModifier_(mapController);
      }
      if (info) {
        value += AI.zoningAttacksValueModifier_(
            mapController, info.zoningAttacks);
      }
      let distanceToNearestEnemy = 999;
      for (const creature of mapController.creatures) {
        if (creature.side == active.side) continue;
        const distance = Math.abs(creature.x - active.x) +
                         Math.abs(creature.y - active.y);
        distanceToNearestEnemy = Math.min(distance, distanceToNearestEnemy);
      }
      if (!bestAttack.info) { // TODO: also for defending?
        // The closer the better! You want to approach.
        value -= distanceToNearestEnemy;
      } else {
        // The further the better! Shoot from the edge of your
        // range!
        value += distanceToNearestEnemy;
      }
      if (value <= best.value) return;
      best = {info, value};
    };

    // Check current position.
    check(null);

    // Check each possible move.
    const [oldX, oldY] = [active.x, active.y];
    const moves = active.getMoves(mapController);
    for (const moveInfo of moves.values()) {
      active.teleport(moveInfo.x, moveInfo.y, mapController);
      check(moveInfo);
    }
    active.teleport(oldX, oldY, mapController);

    return best;
  }

  /** @param {!MapController} mapController */
  static aiDecision(mapController) {
    const active = mapController.active;
    if (active.currentSummon) {
      // If the AI has something summoned, it always controls that.
      active.currentSummon.summonAwake = true;
      active.hasAction = false;
      active.hasMove = false;
      return;
    }
    const best = active.hasMove ?
        AI.getBestMove_(mapController) :
        AI.getBestAttack_(mapController);
    if (best.info) {
      // Do that!
      best.info.fn();
    } else if (active.hasMove) {
      // Don't move!
      active.hasMove = false;
    } else {
      // Skip turn!
      active.skipTurn();
    }
  }
}
