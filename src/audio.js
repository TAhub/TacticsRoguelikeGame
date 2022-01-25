class AudioController {
  constructor() {
    /** @type {?AudioBufferSourceNode} */
    this.musicPlayer;
    /** @type {?GainNode} */
    this.musicGain;
    this.musicPlaying = '';
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  stopMusic() {
    if (this.musicPlayer) {
      this.musicPlayer.stop();
      this.musicPlayer.disconnect();
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
    }
    this.musicGain = null;
    this.musicPlayer = null;
    this.musicPlaying = '';
  }

  /**
   * @param {string} type
   * @return {?AudioBufferSourceNode}
   * @private
   */
  makePlayer_(type) {
    const buffer = data.sounds.get(type);
    if (!data) return null;
    const player = this.ctx.createBufferSource();
    player.buffer = buffer;
    return player;
  }

  /**
   * @param {!AudioBufferSourceNode} player
   * @param {string} type
   * @param {number} volume
   * @return {!GainNode} gain
   * @private
   */
  play_(player, type, volume) {
    volume += data.getNumberValue('sounds', type, 'volume') || 0;
    volume = Math.max(0, Math.min(1, volume / 100));

    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    player.connect(gain);
    gain.connect(this.ctx.destination);
    player.start();
    return gain;
  }

  /** @param {string} type */
  async playMusic(type) {
    // Don't switch if the song is already playing, or if music is off.
    if (this.musicPlaying == type) return;
    this.stopMusic();
    const volume = saveManager.getConfiguration('musicVolume');
    if (volume == 0) return;
    this.musicPlaying = type;

    // Lazy-load the song.
    data.lazyLoadSoundsRequested.add(type);
    await data.fetchAppropriateSounds();

    // During that await, another song could have started.
    // Check to see if this should still be played.
    if (this.musicPlaying != type) return;

    // Actually play it, now that it's loaded.
    this.musicPlayer = this.makePlayer_(type);
    if (!this.musicPlayer) return;
    this.musicPlayer.playbackRate.value = 1;
    this.musicGain = this.play_(this.musicPlayer, type, volume);
    this.musicPlayer.loop = true;
  }

  /**
   * @param {string} type
   * @param {number} pitch
   * @param {number} playbackRate
   * @return {!Promise}
   */
  async play(type, pitch, playbackRate) {
    const volume = saveManager.getConfiguration('soundVolume');
    if (volume == 0) return;
    const player = this.makePlayer_(type);
    if (!player) return;
    player.detune.value = pitch;
    player.playbackRate.value = playbackRate;
    const gain = this.play_(player, type, volume);

    // Wait for this to end.
    await new Promise((resolve, reject) => {
      setTimeout(resolve, player.buffer.duration * 1000 / playbackRate);
    });

    // Stop and disconnect, once you're done.
    player.stop();
    player.disconnect();
    gain.disconnect();
  }
}

const audio = new AudioController();
