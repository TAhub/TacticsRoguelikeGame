/** @suppress {checkVars} */
class MainMenuPlugin extends GamePlugin {
  constructor() {
    super();

    this.menuController = new MenuController();

    this.setup = false;
  }

  /** @private */
  initialSetup_() {
    this.menuController.clear();

    const size = gfxTileSize * 3;
    const beginSlot = new MenuTileSlot(0, 0, size, size);
    const clickFn = () => {
      this.makeMainView_();
      audio.playMusic('menu bgm'); // TODO: temp
    };
    beginSlot.attachTile(new MenuTile('Begin', {clickFn}));
    this.menuController.slots.push(beginSlot);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /** @private */
  makeMainView_() {
    this.menuController.clear();

    // Clear any temp saves.
    saveManager.clear(/* tempOnly= */ true);

    const hasSave = !!saveManager.loadTrue('game');

    // Load game button.
    if (hasSave) {
      const loadGameSlot = new MenuTileSlot(0, 1, 1, 1);
      const clickFn = () => this.switchToPlugin(new IngamePlugin());
      loadGameSlot.attachTile(new MenuTile('Load Game', {clickFn}));
      this.menuController.slots.push(loadGameSlot);
    }

    // New game button.
    const newGameSlot = new MenuTileSlot(0, 0, 1, 1);
    const newGameClickFn = () => {
      const makeFn = () => {
        saveManager.clear(/* tempOnly= */ false);
        this.switchToPlugin(new CharacterCreatorPlugin((players) => {
          return new IngamePlugin(players);
        }));
      };
      if (hasSave) {
        this.makeConfirmView_('Overwrite Save', makeFn);
      } else {
        makeFn();
      }
    };
    newGameSlot.attachTile(new MenuTile('New Game', {clickFn: newGameClickFn}));
    this.menuController.slots.push(newGameSlot);

    // Credits button.
    const creditsSlot = new MenuTileSlot(1, 0, 1, 1);
    const creditsClickFn = () => this.makeCreditsView_();
    creditsSlot.attachTile(new MenuTile('Credits', {clickFn: creditsClickFn}));
    this.menuController.slots.push(creditsSlot);

    let configOn = 0;
    /**
     * @param {string} name
     * @param {string} key
     * @param {function(string, number)} changeFn
     */
    const addConfig = (name, key, changeFn) => {
      const slot = new MenuTileSlot(2, configOn, 1, 1);
      const value = saveManager.getConfiguration(key);
      name += ': ' + value + '%';
      const clickFn = () => {
        changeFn(key, value);
        this.makeMainView_();
      };
      slot.attachTile(new MenuTile(name, {clickFn}));
      this.menuController.slots.push(slot);
      configOn += 1;
    };
    addConfig('Sound Volume', 'soundVolume', (key, value) => {
      saveManager.setConfiguration(key, (value + 25) % 100);
      // TODO: load sounds?
    });
    addConfig('Music Volume', 'musicVolume', (key, value) => {
      saveManager.setConfiguration(key, (value + 25) % 100);
      // TODO: load music?
    });
    if (DEBUG) {
      if (saveManager.getConfiguration('performanceTracker')) {
        debugTrackTimeBeginTracking();
      }
      addConfig('Performance Tracker', 'performanceTracker', (key, value) => {
        if (debugTrackTimeStarted) {
          debugTrackTimeStarted = false;
          saveManager.setConfiguration(key, 0);
        } else {
          debugTrackTimeBeginTracking();
          saveManager.setConfiguration(key, 100);
        }
      });
      if (saveManager.getConfiguration('fpsTracker')) {
        debugTrackFpsStarted = true;
      }
      addConfig('FPS Tracker', 'fpsTracker', (key, value) => {
        debugTrackFpsStarted = !debugTrackFpsStarted;
        saveManager.setConfiguration(key, value == 0 ? 100 : 0);
      });
    }

    // Diagnostic buttons.
    if (DEBUG) {
      const diagnosticNames = Array.from(allDiagnostics.keys());
      for (let i = 0; i < diagnosticNames.length; i++) {
        const name = diagnosticNames[i];
        const diagnosticSlot = new MenuTileSlot(3, i, 1, 1);
        const clickFn = () => allDiagnostics.get(name)();
        diagnosticSlot.attachTile(new MenuTile(name, {clickFn}));
        this.menuController.slots.push(diagnosticSlot);
      }
    }

    this.menuController.resizeToFit(gfxScreenWidth, gfxScreenHeight, true);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /**
   * @param {number=} optPage
   * @private
   */
  makeCreditsView_(optPage) {
    this.menuController.clear();

    // Entries.
    const allSounds = data.getCategoryEntriesArray('sounds') || [];
    let pageProgress = 0;
    let y = 0;
    const page = optPage || 0;
    for (const sound of allSounds) {
      if (Math.floor(pageProgress) == page) {
        const text = (data.getValue('sounds', sound, 'credit') || '')
            .split('*NL*').join('\n');
        if (text) {
          const slot = new MenuTileSlot(0, y, 2, 1);
          slot.attachTile(new MenuTile(text));
          this.menuController.slots.push(slot);
          y += 1;
        }
      }
      pageProgress += 0.1;
    }
    if (y == 0) {
      // Nothing was drawn, so loop back to the start.
      this.makeCreditsView_();
      return;
    }

    // Back button.
    const backSlot = new MenuTileSlot(0, y, 1, 1);
    backSlot.attachTile(new MenuTile(
        'Return', {clickFn: () => this.makeMainView_()}));
    this.menuController.slots.push(backSlot);

    // Navigation button.
    const navSlot = new MenuTileSlot(1, y, 1, 1);
    navSlot.attachTile(new MenuTile(
        'Next', {clickFn: () => this.makeCreditsView_(page + 1)}));
    this.menuController.slots.push(navSlot);

    this.menuController.resizeToFit(gfxScreenWidth, gfxScreenHeight, false);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /**
   * @param {string} yesPrompt
   * @param {function()} yesFn
   * @private
   */
  makeConfirmView_(yesPrompt, yesFn) {
    this.menuController.clear();

    const size = gfxTileSize * 3;
    const yesSlot = new MenuTileSlot(0, 0, size, size);
    yesSlot.attachTile(new MenuTile(yesPrompt, {clickFn: yesFn}));
    this.menuController.slots.push(yesSlot);
    const noSlot = new MenuTileSlot(0, size, size, size);
    noSlot.attachTile(new MenuTile(
        'Nevermind', {clickFn: () => this.makeMainView_()}));
    this.menuController.slots.push(noSlot);
    this.menuController.recenter(gfxScreenWidth, gfxScreenHeight);
  }

  /**
   * @return {!Promise}
   * @private
   */
  loadSounds_() {
    if (data.soundsToFetch.length == 0) return Promise.resolve();
    let complete = false;
    const promise = data.fetchAppropriateSounds().then(() => complete = true);
    this.switchToPlugin(new LoadingPlugin(() => complete ? this : null));
    return promise;
  }

  /** @param {number} elapsed */
  update(elapsed) {
    this.menuController.update(elapsed);
    if (!this.setup) {
      this.setup = true;
      // Fetch sounds manually, so it can have a loading screen.
      this.loadSounds_().then(() => {
        this.initialSetup_();
      });
    }
  }

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {
    this.menuController.draw2D(ctx);
  }

  // TODO: 3D preview background?

  /** @param {!Controls} controls */
  input(controls) {
    this.menuController.input(controls);
  }
}
