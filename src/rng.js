/** @typedef {!function(): number} rng */
const rng = function() {};

/**
 * @param {number} seed
 * @return {rng}
 */
function seededRNG(seed) {
  // This is an implementation of the Lehmer LCG.
  const lcg = (a) => {
    return a * 48271 % 2147483647;
  };
  // This algorithm endlessly returns 0 if you put in 0 as a seed, so
  // replace 0 with a fixed big number.
  let runningSeed = lcg(seed || 93973241);
  return () => {
    return (runningSeed = lcg(runningSeed)) / 2147483648;
  };

  // TODO: test how fairly this is distributed
}

/** @return {rng} */
function defaultRNG() {
  return Math.random;
}
