/** @externs */

/** @const */
const Tone = {};

Tone.Buffer = class {
  constructor() {
    /** @type {number} */
    this.duration;
  }

  /**
   * @param {!Float32Array} array
   * @return {!Tone.Buffer}
   */
  static fromArray(array) {};
}

Tone.Player = class {
  /** @param {!Tone.Buffer} buffer */
  constructor(buffer) {
    /** @type {number} */
    this.playbackRate;

    /**
     * @type {{
     *   value: number,
     * }}
     */
    this.volume;

    /** @type {boolean} */
    this.loop;
  };

  toMaster() {};

  start() {};

  stop() {};
}

Tone.GrainPlayer = class extends Tone.Player {
  /** @param {!Tone.Buffer} buffer */
  constructor(buffer) {
    /** @type {number} */
    this.detune;
  };
}
