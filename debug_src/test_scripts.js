/**
 * Advance the game-state to where it would be if you had just reached the
 * specified level, in a normal playthrough.
 * For testing purposes only.
 * @param {number} level
 */
function debugFastStart(level) {
  if (!(game.plugin instanceof IngamePlugin)) return;
  const mapC = game.plugin.mapController;
  const tier = tierForLevel(level);
  const keyCodes = new Set();
  let itemsToDrop = [];

  // Load and harvest all maps that are below that level.
  for (const overworldMapTile of mapC.overworldMap.tiles.values()) {
    if (overworldMapTile.level >= level) continue;
    const i = toI(overworldMapTile.x, overworldMapTile.y);
    if (!mapC.gameMaps.has(i)) {
      mapC.loadGameMap(i);
    }
    const gameMap = mapC.gameMaps.get(i);
    if (!gameMap) continue; // Huh?
    mapC.visitedMapIs.add(i);

    for (const tile of gameMap.tiles.values()) {
      // Kill all enemies in this map, so that you get their EXP.
      for (const creature of tile.creatures) {
        if (creature.side != Creature.Side.Enemy) continue;
        creature.life = 0;
      }

      // Harvest all pick-up-able items.
      if (tile.item && tile.item.canPickUp) {
        const item = tile.item;
        tile.item = null;

        if (item.contents == Item.Code.Key) {
          // Keys are handled specially. Rather than giving them to the player,
          // use them to unlock doors in a separate step.
          keyCodes.add(item.keyCode);
        } else if (item.contents != Item.Code.Respec) { // Don't need respecs.
          // All lower-tier healing poultices are "used up".
          if (item.contents != Item.Code.Healing || item.tier >= tier) {
            itemsToDrop.push(item);
          }
        }
      }

      // If this map has a campfire, mark it for the dream map.
      if (tile.item && tile.item.contents == Item.Code.Campfire) {
        mapC.restMapIs.add(i);
      }
    }
  }

  // Use the learned keyCodes to unlock all key doors
  const usedKeyCodes = new Set();
  for (const gameMap of mapC.gameMaps.values()) {
    for (const tile of gameMap.tiles.values()) {
      for (const doorI of tile.doorIds.keys()) {
        const keyCode = tile.doorIds.get(doorI);
        if (!keyCodes.has(keyCode)) continue;
        usedKeyCodes.add(keyCode);
        tile.doorIds.set(doorI, 0);
      }
    }
  }

  // Filter out all equipments that are "obsolete", to make the floor-pile a bit
  // more manageable.
  const obsoleteItems = new Set();
  const usedToObsolete = new Set();
  for (const item of itemsToDrop) {
    const contents = item.contents;
    if (!(contents instanceof Weapon) && !(contents instanceof Armor)) continue;
    for (const oItem of itemsToDrop) {
      if (usedToObsolete.has(oItem)) continue;
      const oContents = oItem.contents;
      if (contents == oContents) continue;
      if (!(oContents instanceof Equipment)) continue;
      if (oContents.category != contents.category) continue;
      if (oContents.type != contents.type) continue;
      if (oContents.tier != contents.tier + 1) continue;
      obsoleteItems.add(item);
      usedToObsolete.add(oItem);
      break;
    }
  }
  itemsToDrop = itemsToDrop.filter((i) => !obsoleteItems.has(i));

  // Keys that WEREN'T used yet do drop on the floor.
  for (const keyCode of keyCodes) {
    if (usedKeyCodes.has(keyCode)) continue;
    const key = new Item(Item.Code.Key);
    key.keyCode = keyCode;
    key.colorName = 'silver';
    itemsToDrop.push(key);
  }

  // Drop all of the items that should be dropped.
  mapC.dropItemsOnFloor(itemsToDrop, mapC.active || mapC.creatures[0]);

  // Do a single "0-length" update on the plugin, so all of the dead enemies
  // are turned into EXP.
  game.plugin.update(0);

  // Clear the delayed text particles for players, so you don't have to sit
  // through 10 minutes of level up notices.
  for (const player of mapC.players) {
    player.delayedCachedParticles = [];
  }

  // Reload the map controller, so that those maps don't stay in memory.
  mapC.reloadMaps();
  mapC.save();
}
