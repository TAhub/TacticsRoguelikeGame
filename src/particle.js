class Particle {
  constructor() {
    /** @type {?string} */
    this.text;
    /** @type {?number} */
    this.sprite;
    this.boldness = 0;
    this.lifetime = 0;
    this.x = 0;
    this.y = 0;
    this.h = 0;
    this.xD = 0;
    this.yD = 0;
    this.hD = 0;
    this.xSpeed = 0;
    this.ySpeed = 0;
    this.hSpeed = 0;
    this.hAccel = 0;
    this.scale = 1;
    this.blocking = false;
    this.alpha = 1;
    this.color = '#FFFFFF';
    this.delay = 0;
    /** @type {?string} */
    this.creationSound;
    /** @type {?string} */
    this.voiceLast;
    this.voiceRate = 1;
    this.soundPitch = 0;
    /** @type {?string} */
    this.lightColor;
    this.lightIntensity = 0;
    /** @type {?number} */
    this.facing;
    /** @type {?SpriteObject} */
    this.spriteObject;
    /** @type {?THREE.BufferGeometry} */
    this.geometry;
    /** @type {?THREE.Material} */
    this.material;
    /** @type {?THREE.Mesh} */
    this.mesh;
  }

  /**
   * @param {string} color
   * @param {number} sprite
   * @param {number} scale
   * @param {?string} sound
   * @param {number} pitch
   * @return {!Particle}
   */
  static makeProjectileParticle(color, sprite, scale, sound, pitch) {
    const particle = Particle.makePuffParticle([sprite], scale, color, 0);
    particle.blocking = true;
    particle.creationSound = sound;
    particle.soundPitch = pitch;
    return particle;
  }

  /**
   * @param {number} xD
   * @param {number} yD
   * @param {number} hD
   * @param {string} color
   * @param {number} alpha
   * @param {number} radius
   * @return {!Particle}
   */
  static makeLineParticle(xD, yD, hD, color, alpha, radius) {
    const particle = new Particle();
    particle.xD = xD;
    particle.yD = yD;
    particle.hD = hD;
    particle.alpha = alpha;
    particle.color = color;
    particle.scale = radius;
    particle.lifetime = gfxStatusParticleTimerInterval * 1.25;
    return particle;
  }

  /**
   * @param {string} text
   * @param {number} boldness
   * @param {boolean} isVoice
   * @param {number} soundPitch
   * @param {number} voiceRate
   * @return {!Particle}
   */
  static makeTextParticle(text, boldness, isVoice, soundPitch, voiceRate) {
    const particle = new Particle();
    particle.text = text;
    particle.boldness = boldness;
    particle.lifetime = (0.5 + (text.length / 30)) / voiceRate;
    particle.hSpeed = 0.3 / particle.lifetime;
    particle.color = data.getColorByNameSafe('tile text');
    particle.scale = 1.5;
    particle.blocking = true;
    if (isVoice) particle.voiceLast = '';
    particle.soundPitch = soundPitch;
    particle.voiceRate = voiceRate;
    return particle;
  }

  /**
   * @param {!Array.<number>} sprites
   * @param {number} scale
   * @param {string} color
   * @param {number} scatter
   * @return {!Particle}
   */
  static makePuffParticle(sprites, scale, color, scatter) {
    const particle = new Particle();
    if (scatter > 0) {
      const speed = (Math.random() * 0.5 + 0.75) * scatter;
      const angle = Math.random() * 2 * Math.PI;
      particle.xSpeed = Math.cos(angle) * speed;
      particle.ySpeed = Math.sin(angle) * speed;
    }
    particle.hSpeed = 0.93;
    particle.lifetime = 0.7;
    particle.color = color;
    particle.scale = scale;
    particle.sprite = getRandomArrayEntry(sprites);
    return particle;
  }

  /**
   * @param {!Array.<number>} sprites
   * @param {number} scale
   * @param {string} color
   * @param {number} scatter
   * @return {!Particle}
   */
  static makeDropParticle(sprites, scale, color, scatter) {
    const particle = Particle.makePuffParticle(sprites, scale, color, scatter);
    particle.hAccel = -5;
    return particle;
  }

  /** @return {boolean} */
  get dead() {
    return this.lifetime <= 0;
  }

  /**
   * @param {number} elapsed
   * @param {!MapController} mapController
   */
  update(elapsed, mapController) {
    if (this.delay > 0) {
      this.delay -= elapsed;
    } else {
      if (this.creationSound) {
        audio.play(this.creationSound, this.soundPitch, 1);
        this.creationSound = null;
      }
      if (this.voiceLast != null) {
        const voices = ['voice 1', 'voice 2', 'voice 3', 'voice 4'];
        const possibilites = voices.filter((type) => {
          if (!this.voiceLast) return true;
          const notAfter = data.getArrayValue('sounds', type, 'notAfter');
          if (notAfter && notAfter.includes(this.voiceLast)) return false;
          return true;
        });
        const particle = getRandomArrayEntry(possibilites);
        this.voiceLast = null;
        audio.play(particle, this.soundPitch, this.voiceRate).then(() => {
          // Wait for a moment before going on.
          setTimeout(() => this.voiceLast = particle, 150 / this.voiceRate);
        });
      }
      this.lifetime -= elapsed;
      this.x += this.xSpeed * elapsed;
      this.y += this.ySpeed * elapsed;
      const tile = mapController.tileAt(Math.floor(this.x), Math.floor(this.y));
      const baseH = tile ? tile.th * gfxThScale : 0;
      this.h = Math.max(this.h + this.hSpeed * elapsed, baseH);
      this.hSpeed += this.hAccel * elapsed;
    }
  }

  clear3DData() {
    if (this.spriteObject) this.spriteObject.clear3DData();
    if (this.mesh) {
      this.geometry.dispose();
      this.material.dispose();
    }
    this.geometry = null;
    this.material = null;
    this.mesh = null;
  }

  /**
   * @param {!THREE.Group} dynamicMeshGroup
   * @param {!LightController} lightController
   * @param {!THREE.PerspectiveCamera} camera
   */
  addToGroup(dynamicMeshGroup, lightController, camera) {
    if (this.delay > 0) return;

    if (this.lightColor && this.lightIntensity) {
      const i = this.lightIntensity;
      lightController.add(this.x, this.y, this.h, i, this.lightColor, true);
    }

    if (this.xD != 0 || this.yD != 0 || this.hD != 0) {
      if (!this.mesh) {
        const color = getHexColor(this.color);
        const opacity = this.alpha;
        const transparent = true;
        this.material =
            new THREE.MeshBasicMaterial({color, opacity, transparent});
        const curve = new THREE.LineCurve3(
            new THREE.Vector3(this.x, this.h, this.y),
            new THREE.Vector3(this.xD, this.hD, this.yD),
        );
        const numSegments = 2;
        const thickness = this.scale;
        const roundness = 8;
        this.geometry = new THREE.TubeGeometry(
            curve, numSegments, thickness, roundness, /* closed= */ false);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
      }
      dynamicMeshGroup.add(this.mesh);
    } else {
      if (!this.spriteObject) {
        this.spriteObject = new SpriteObject();

        if (this.text) {
          const buffer = gfx.makeBuffer();
          const ctx = gfx.getContext(buffer);

          const bold = this.boldness > 0;
          const italic = this.boldness < 0;
          gfx.setFont(ctx, 75 + this.boldness * 15, bold, italic);
          const width = gfx.measureText(ctx, this.text);
          buffer.width = width + 4;
          buffer.height = buffer.width;
          ctx.fillStyle = this.color;
          gfx.drawText(ctx, buffer.width / 2, buffer.height / 2, this.text);
          const scale = this.scale * width / gfxTileSize;

          this.spriteObject.setBuffer(buffer, scale);
        } else if (this.sprite) {
          this.spriteObject.setAppearance(this.sprite, this.color, this.scale);
        } else {
          return; // Huh...
        }
      }
      const options = {h: this.h, renderOrder: 1};
      if (this.facing != null) {
        options.facing = this.facing;
        options.facingCanRotate = true;
      }
      this.spriteObject.addToGroup(
          dynamicMeshGroup, camera, this.x, this.y, 0, options);
    }
  }
}
