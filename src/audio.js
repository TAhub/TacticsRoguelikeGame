class AudioController {
  constructor() {
    /** @type {?Tone.Player} */
    this.musicPlayer;
    this.musicPlaying = '';
  }

  stopMusic() {
    if (this.musicPlayer) {
      this.musicPlayer.stop();
    }
    this.musicPlayer = null;
    this.musicPlaying = '';
  }

  /** @param {string} type */
  playMusic(type) {
    if (this.musicPlaying == type) return;
    this.stopMusic();

    const volume = saveManager.getConfiguration('musicVolume');
    if (volume == 0) return;

    this.musicPlaying = type;

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

    // TODO: Is it inefficient to make a separate player for each playback?
    const player = new Tone.GrainPlayer(buffer);
    player.detune = pitch;
    player.playbackRate = playbackRate;
    player.volume.value = data.getNumberValue('sounds', type, 'volume') || 0;
    player.volume.value -= Math.floor((100 - volume) / 5);
    player.toMaster();
    player.start();

    await new Promise((resolve, reject) => {
      setTimeout(resolve, buffer.duration * 1000 / playbackRate);
    });
  }
}

const audio = new AudioController();
