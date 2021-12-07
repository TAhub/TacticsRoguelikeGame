class GamePlugin {
  constructor() {
    /** @type {?function(!GamePlugin)} */
    this.switchToPlugin;
  }

  attach() {}

  /** @param {!Controls} controls */
  input(controls) {}

  /**
   * @param {number} elapsed
   */
  update(elapsed) {}

  /** @param {!CanvasRenderingContext2D} ctx */
  draw2D(ctx) {}

  /**
   * @param {!THREE.Scene} scene
   * @param {!THREE.PerspectiveCamera} camera
   */
  draw3D(scene, camera) {}
}

class Game {
  constructor() {
    /** @type {GamePlugin} */
    this.plugin;
  }

  setup() {
    this.plugin = new MainMenuPlugin();

    // Get and size canvases.
    const canvas2D =
    /** @type {!HTMLCanvasElement} */ (document.getElementById('canvas2D'));
    canvas2D.width = gfxScreenWidth;
    canvas2D.height = gfxScreenHeight;
    const canvas3D =
    /** @type {!HTMLCanvasElement} */ (document.getElementById('canvas3D'));
    canvas3D.width = gfxScreenWidth;
    canvas3D.height = gfxScreenHeight;

    // Set up THREE.js scene.
    const scene = new THREE.Scene();

    this.makeLogic_(canvas2D, scene);
    this.makeRendering_(canvas2D, canvas3D, scene);
  }

  /**
   * @param {!HTMLCanvasElement} canvas2D
   * @param {!HTMLCanvasElement} canvas3D
   * @param {!THREE.Scene} scene
   * @private
   */
  makeRendering_(canvas2D, canvas3D, scene) {
    // Make FPS tracker.
    let frameCount = 0;
    if (DEBUG) {
      setInterval(() => {
        if (debugTrackFpsStarted) console.log('DEBUG fps:', frameCount);
        frameCount = 0;
      }, 1000);
    }

    // Make THREE.js camera and renderer.
    const camera = new THREE.PerspectiveCamera(
        gfxFov, gfxScreenWidth / gfxScreenHeight, 0.01, gfxFarPlane);
    const renderer = new THREE.WebGLRenderer({canvas: canvas3D});
    renderer.setSize(gfxScreenWidth, gfxScreenHeight);

    // Create the render loop.
    const render = () => {
      if (DEBUG) frameCount += 1; // For FPS tracker.

      if (DEBUG) debugTrackTime('plugin.draw3D');
      this.plugin.draw3D(scene, camera);
      renderer.render(scene, camera);
      if (DEBUG) debugTrackTimeDone();

      if (DEBUG) debugTrackTime('plugin.draw2D');
      const ctx = gfx.getContext(canvas2D);
      ctx.clearRect(0, 0, gfxScreenWidth, gfxScreenHeight);
      this.plugin.draw2D(ctx);
      if (DEBUG) debugTrackTimeDone();

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  /**
   * @param {!HTMLCanvasElement} canvas
   * @param {!THREE.Scene} scene
   * @private
   */
  makeLogic_(canvas, scene) {
    /** @type {?GamePlugin} */
    let nextPlugin;
    const attach = (to) => {
      to.switchToPlugin = (newPlugin) => {
        nextPlugin = newPlugin;
      };
      to.attach();
    };
    attach(this.plugin);

    // Setup controls tracking.
    const controls = new Controls(canvas);

    // Create the update loop.
    let lastTime;
    setInterval(() => {
      const time = new Date().getTime() / 1000;
      if (lastTime) {
        const elapsed = time - lastTime;

        // Handle input.
        this.plugin.input(controls);

        // Progress time.
        if (DEBUG) debugTrackTime('plugin.update');
        this.plugin.update(elapsed);
        // TODO: is it really a good idea to update the game logic inside a
        // animation frame like this?
        if (DEBUG) debugTrackTimeDone();

        // Degrade presses to pressed instead of just-pressed.
        controls.degradeJustPressed();

        while (nextPlugin) {
          this.plugin = nextPlugin;
          nextPlugin = null;
          scene.clear();
          attach(this.plugin);
        }
      }
      lastTime = time;
    }, 33);
  }
}

const game = new Game();
/** Sets up the game. */
async function setup() {
  await Promise.resolve();
  await data.setup();
  game.setup();
}
setup();
