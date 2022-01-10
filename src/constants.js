// Graphical constants.
const gfxTileSize = 130;
const gfxTileBorder = 2;
const gfxScreenWidth = 10.5 * gfxTileSize;
const gfxScreenHeight = 6.5 * gfxTileSize;
const gfxFov = 90;
const gfxFarPlane = 15;
const gfxMinimapSize = gfxScreenHeight * 3 / 8;
const gfxStatusParticleTimerInterval = 0.3;
const gfxThScale = 0.1;
const gfxNumLights = 32;

// Map-generation constants.
const mapOverworldMapSize = 16;
const mapGameMapSize = 5;
const mapTileUpscale = 3;
const mapSecondTileUpscale = 3;
const mapRegionSize = 12;
let mapMaxMapWidth = mapOverworldMapSize * mapGameMapSize *
    mapTileUpscale * mapSecondTileUpscale;
// Round mapMaxMapWidth up to the nearest power of 10.
for (let i = 0; ; i++) {
  const power = Math.pow(10, i);
  if (power > mapMaxMapWidth) {
    mapMaxMapWidth = power;
    break;
  }
}

// Mechanical constants.
const mechMaxSeed = 1000000;
const mechBaseDamage = 50;
const mechBaseLife = 100;
const mechLevelsPerSkill = 3;
const mechLevelsPerTier = mechLevelsPerSkill * 4;
const mechRegionsPerTier = 2;
const mechNumTiers = 3;
const mechMaxLevel = mechNumTiers * mechLevelsPerTier;
const mechNumPlayers = 4;
const mechPowerPerTier = 10;
const mechPlayerAstraMult = 3;
const mechArmorProfiencyDefense = 20;
const mechCritBonus = 50;
const mechHitsToCritsValue = mechCritBonus / 100;
const mechInventoryWidth = 4;
const mechInventoryHeight = 5;
const mechNumTechSlots = 3;
const mechRedundantZoningPower = 50;

/**
 * @param {number} tier
 * @return {number} mult
 */
function multForTier(tier) {
  return Math.pow(1.4, tier);
}

/**
 * @param {number} level
 * @return {number} exp
 */
function expForNextLevel(level) {
  return Math.floor(100 * Math.pow(1.5, level));
}

/**
 * @param {number} level
 * @return {number} tier
 */
function tierForLevelSmth(level) {
  return Math.min(mechNumTiers - 1, (level - 1) / mechLevelsPerTier);
}

/**
 * @param {number} level
 * @return {number} tier
 */
function tierForLevel(level) {
  return Math.floor(tierForLevelSmth(level));
}

/**
 * @param {number} tier
 * @return {number} level
 */
function levelForTier(tier) {
  if (tier < 0) return 1;
  for (let level = 1; level <= mechMaxLevel; level++) {
    if (tierForLevel(level) != tier) continue;
    return level + 1; // A little extra!
  }
  return mechMaxLevel;
}

/**
 * @param {number} number
 * @return {number}
 */
function randomRound(number) {
  if (Math.random() < (number % 1)) {
    return Math.ceil(number);
  } else {
    return Math.floor(number);
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @return {number} i
 */
function toI(x, y) {
  return x + y * mapMaxMapWidth;
}

/**
 * @param {number} i
 * @return {number} x
 */
function toX(i) {
  return i % mapMaxMapWidth;
}

/**
 * @param {number} i
 * @return {number} y
 */
function toY(i) {
  return Math.floor(i / mapMaxMapWidth);
}

/**
 * @param {rng=} optRng
 * @return {number}
 */
function generateSeed(optRng) {
  const rng = optRng || defaultRNG();
  return Math.floor(1 + rng() * mechMaxSeed);
}

/**
 * Shuffles an array in place.
 * @param {Array} array
 * @param {rng=} optRng
 */
function shuffleArray(array, optRng) {
  const rng = optRng ? optRng : defaultRNG();
  let j; let x; let i;
  for (i = array.length - 1; i > 0; i--) {
    j = Math.floor(rng() * (i + 1));
    x = array[i];
    array[i] = array[j];
    array[j] = x;
  }
}

/**
 * @param {!Array.<T>} array
 * @param {rng=} optRng
 * @return {T}
 * @template T
 */
function getRandomArrayEntry(array, optRng) {
  const rng = optRng ? optRng : defaultRNG();
  const index = Math.floor(rng() * array.length);
  return array[index];
}

/**
 * @param {string} part
 * @param {rng} rng
 * @return {string} name
 */
function nameGenerate(part, rng) {
  const possibilities = data.getNumSubtypes('name parts', part);
  const pick = Math.floor(rng() * possibilities);
  let text = data.getValue('name parts', part, 's', pick) || '';
  let last = '';
  const picked = new Set();
  while (text.includes('$')) {
    const open = text.indexOf('(');
    const close = text.indexOf(')');
    const before = text.substr(0, open - 1);
    let replacer = text.substr(open + 1, close - open - 1);
    const after = text.substr(close + 1, text.length);
    const capitalize = replacer.endsWith('!capitalize');
    if (capitalize) {
      replacer = replacer.replace('!capitalize', '');
    }
    if (replacer != 'last') {
      if (replacer.endsWith('!last')) {
        const no = last;
        while (last == no) {
          last = nameGenerate(replacer.replace('!last', ''), rng);
        }
      } else if (replacer.endsWith('!picked')) {
        do {
          last = nameGenerate(replacer.replace('!picked', ''), rng);
        } while (picked.has(last));
      } else {
        last = nameGenerate(replacer, rng);
      }
    }
    picked.add(last);
    if (capitalize) {
      last = capitalizeFirstLetter(last);
    }
    text = before + last + after;
  }
  return text;
}


/**
 * @param {number} dX
 * @param {number} dY
 * @return {number}
 */
function calcDistance(dX, dY) {
  return Math.sqrt(dX*dX + dY*dY);
}


/**
 * @param {number} angle
 * @return {number}
 */
function normalizeAngle(angle) {
  return (angle + 13 * Math.PI) % (2 * Math.PI) - Math.PI;
}


/**
 * @param {number} dX
 * @param {number} dY
 * @return {number}
 */
function calcAngle(dX, dY) {
  return normalizeAngle(Math.atan2(dY, dX));
}


/**
 * @param {number} angle1
 * @param {number} angle2
 * @return {number}
 */
function angleDistance(angle1, angle2) {
  const d = angle2 - angle1;
  return normalizeAngle((d + Math.PI) % (2 * Math.PI) - Math.PI);
}


class HSV {
  /**
   * @param {number} h
   * @param {number} s
   * @param {number} v
   */
  constructor(h, s, v) {
    this.h = h;
    this.s = s;
    this.v = v;
  }
}


class RGB {
  /**
   * @param {number} r
   * @param {number} g
   * @param {number} b
   */
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
}


/**
 * @param {string} color
 * @return {!HSV}
 */
function getHSV(color) {
  const rgb = getRGB(color);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  if (min == max) return new HSV(0, 0, min);
  let hue = 0;
  switch (max) {
    case r: hue = (g - b) / (max - min) + (g < b ? 6 : 0); break;
    case g: hue = (b - r) / (max - min) + 2; break;
    case b: hue = (r - g) / (max - min) + 4; break;
  }
  return new HSV(hue / 6, (max - min) / max, max);
}


/**
 * @param {!HSV} hsv
 * @return {string}
 */
function constructColorHSV(hsv) {
  let r;
  let g;
  let b;
  const h = hsv.h % 1;
  const s = Math.max(0, Math.min(1, hsv.s));
  const v = Math.max(0, Math.min(1, hsv.v));

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }

  return constructColor(
      Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}


/**
 * @param {string} color
 * @return {!RGB}
 */
function getRGB(color) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5), 16);
  return new RGB(r, g, b);
}


/**
 * @param {string} color
 * @return {number}
 */
function getHexColor(color) {
  return parseInt(color.substr(1), 16);
}


/**
 * @param {string} color1
 * @param {string} color2
 * @param {number} prop
 * @return {string}
 */
function colorLerp(color1, color2, prop) {
  if (prop <= 0) {
    return color1;
  }
  if (prop >= 1) {
    return color2;
  }

  const rgb1 = getRGB(color1);
  const rgb2 = getRGB(color2);
  const r = Math.floor((1 - prop) * rgb1.r + prop * rgb2.r);
  const g = Math.floor((1 - prop) * rgb1.g + prop * rgb2.g);
  const b = Math.floor((1 - prop) * rgb1.b + prop * rgb2.b);
  return constructColor(r, g, b);
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @return {string}
 */
function constructColor(r, g, b) {
  let rS = r.toString(16);
  while (rS.length < 2) {
    rS = '0' + rS;
  }
  let gS = g.toString(16);
  while (gS.length < 2) {
    gS = '0' + gS;
  }
  let bS = b.toString(16);
  while (bS.length < 2) {
    bS = '0' + bS;
  }
  return ('#' + rS + gS + bS).toUpperCase();
}


/**
 * @param {number} number
 * @return {string}
 */
function numberToRomanNumeral(number) {
  let numeral = '';
  while (number >= 10) {
    number -= 10;
    numeral += 'X';
  }
  while (number >= 9) {
    number -= 9;
    numeral += 'IX';
  }
  while (number >= 5) {
    number -= 5;
    numeral += 'V';
  }
  while (number >= 4) {
    number -= 4;
    numeral += 'IV';
  }
  while (number >= 1) {
    number -= 1;
    numeral += 'I';
  }
  return numeral;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} f
 * @return {number}
 */
function lerp(a, b, f) {
  return (a * (1 - f)) + (b * f);
}

/**
 * @param {string} str
 * @return {string}
 */
function capitalizeFirstLetterOfFirstWord(str) {
  return capitalizeFirstLetterOfEachWord(str, true);
}

/**
 * @param {string} str
 * @param {boolean=} optFirstWordOnly
 * @return {string}
 */
function capitalizeFirstLetterOfEachWord(str, optFirstWordOnly) {
  const words = str.split(' ');
  const capitalize = (str) => {
    let prefix = '';
    if (str.charAt(0) == '(') {
      str = str.slice(1);
      prefix = '(';
    }
    return prefix + capitalizeFirstLetter(str);
  };
  if (optFirstWordOnly) {
    for (let i = 0; i < words.length; i++) {
      if (words[i].length == 0) continue;
      words[i] = capitalize(words[i]);
      break;
    }
    return words.join(' ');
  } else {
    const capitalizedWords = words.map(capitalize);
    return capitalizedWords.join(' ');
  }
}

/**
 * @param {string} str
 * @return {string}
 */
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * @type {!Object.<string, {
 *  runningTotal: number,
 *  numReadings: number,
 *  topLevel: boolean
 * }>}
 */
const debugTrackTimeRecords = {};

/**
 * @type {!Array.<{
 *  startTime: number,
 *  name: string
 * }>}
 */
const debugTrackTimeStack = [];

let debugTrackTimeLastSummaryTime = 0;

let debugTrackTimeStarted = false;
let debugTrackFpsStarted = false;
// Pointlessly re-assign debugTrackFpsStarted so that the compiler doesn't
// stupidly turn it into a constant
debugTrackFpsStarted = false;

/** Begins the process of debug time tracking. */
function debugTrackTimeBeginTracking() {
  debugTrackTimeLastSummaryTime = Date.now() / 1000;
  debugTrackTimeStarted = true;
}

/** @param {string} name */
function debugTrackTime(name) {
  if (!debugTrackTimeStarted) return;

  debugTrackTimeStack.push({
    startTime: new Date().getTime(),
    name: name,
  });
}

/** Stops tracking a specific process. */
function debugTrackTimeDone() {
  if (!debugTrackTimeStarted) return;
  const comp = debugTrackTimeStack.pop();

  if (!debugTrackTimeRecords[comp.name]) {
    debugTrackTimeRecords[comp.name] = {
      runningTotal: 0,
      numReadings: 0,
      topLevel: debugTrackTimeStack.length == 0,
    };
  }


  const time = (new Date().getTime()) - comp.startTime;
  debugTrackTimeRecords[comp.name].runningTotal += time;
  debugTrackTimeRecords[comp.name].numReadings += 1;

  const clockTime = Date.now() / 1000;
  if (clockTime > debugTrackTimeLastSummaryTime + 5) {
    debugTrackTimeLastSummaryTime = clockTime;

    let totalTime = 0;
    for (const recordName in debugTrackTimeRecords) {
      const record = debugTrackTimeRecords[recordName];
      if (record.topLevel) {
        totalTime += record.runningTotal;
      }
    }
    console.log('DEBUG PERFORMANCE TRACKER:');
    for (const recordName in debugTrackTimeRecords) {
      const record = debugTrackTimeRecords[recordName];
      const average =
          Math.floor(1000 * record.runningTotal / record.numReadings);
      const percent = Math.floor(record.runningTotal * 100 / totalTime);
      const message = '  Average time for ' + recordName + ': ' + average +
                    ' microseconds (' + percent + '% of total), with ' +
                    record.numReadings + ' readings.';
      console.log(message);
    }
  }
}
