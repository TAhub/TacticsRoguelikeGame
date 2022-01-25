class AudioController {
  constructor() {
    /** @type {?Tone.Player} */
    this.musicPlayer;
    this.musicPlaying = '';
    /** @type {!Map.<string, !Array.<!Tone.GrainPlayer>>} */
    this.playerBuffers = new Map();
    /** @type {!Set.<!Tone.GrainPlayer>} */
    this.activePlayerBuffers = new Set();
  }

  stopMusic() {
    if (this.musicPlayer) {
      this.musicPlayer.stop();
    }
    this.musicPlayer = null;
    this.musicPlaying = '';
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
    const buffer = data.sounds.get(type);
    if (!buffer) return;
    const player = new Tone.Player(buffer);
    player.playbackRate = 1;
    player.volume.value = data.getNumberValue('sounds', type, 'volume') || 0;
    player.volume.value -= Math.floor((100 - volume) / 5);
    player.toMaster();
    player.start();
    player.loop = true;
    this.musicPlayer = player;
  }

  /**
   * @param {string} type
   * @param {number} pitch
   * @param {number} playbackRate
   * @param {number=} optVolumeMult
   * @return {!Promise}
   */
  async play(type, pitch, playbackRate, optVolumeMult) {
    const buffer = data.sounds.get(type);
    if (!buffer) return;

    let volume = saveManager.getConfiguration('soundVolume');
    if (volume == 0) return;
    if (optVolumeMult != undefined) {
      volume *= optVolumeMult;
    }

    playbackRate *=
        data.getNumberValue('sounds', type, 'playbackRateMult') || 1;

    let player;
    const existingPlayers = this.playerBuffers.get(type) || [];
    for (const existing of existingPlayers) {
      if (this.activePlayerBuffers.has(existing)) continue;
      player = existing;
      existing.stop();
      break;
    }
    if (!player) {
      player = new Tone.GrainPlayer(buffer);
      existingPlayers.push(player);
      this.playerBuffers.set(type, existingPlayers);
    }
    player.detune = pitch;
    player.playbackRate = playbackRate;
    player.volume.value = data.getNumberValue('sounds', type, 'volume') || 0;
    player.volume.value -= Math.floor((100 - volume) / 5);
    player.toMaster();
    player.start();

    this.activePlayerBuffers.add(player);
    await new Promise((resolve, reject) => {
      setTimeout(resolve, buffer.duration * 1000 / playbackRate);
    });
    this.activePlayerBuffers.delete(player);
  }
}

const audio = new AudioController();
