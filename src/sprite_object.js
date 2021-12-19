/**
 * @typedef {{
 *   facing: (number|undefined),
 *   h: (number|undefined),
 *   drawBack: (number|undefined),
 *   renderOrder: (number|undefined),
 * }}
 */
let SpriteObjectOptions;

class SpriteObject {
  constructor() {
    this.sprite = 0;
    this.color = '#FFFFFF';
    this.wScale = 0;
    this.hScale = 0;

    /** @type {?THREE.BufferGeometry} */
    this.geometry;
    /** @type {?THREE.Material} */
    this.material;
    /** @type {?THREE.Texture} */
    this.texture;
    /** @type {?THREE.Mesh} */
    this.mesh;
  }

  /**
   * @param {number} sprite
   * @param {string} color
   * @param {number} scale
   * @param {number=} optHScale
   */
  setAppearance(sprite, color, scale, optHScale) {
    this.clear3DData();
    this.sprite = sprite;
    this.color = color;
    this.wScale = scale;
    this.hScale = optHScale == undefined ? scale : optHScale;
  }

  /**
   * @param {!HTMLCanvasElement} buffer
   * @param {number} scale
   * @param {number=} optHScale
   */
  setBuffer(buffer, scale, optHScale) {
    this.clear3DData();
    this.texture = new THREE.CanvasTexture(buffer);
    this.wScale = scale;
    this.hScale = optHScale == undefined ? scale : optHScale;
  }

  clear3DData() {
    if (this.mesh) {
      this.geometry.dispose();
      this.material.dispose();
    }
    if (this.texture) this.texture.dispose();
    this.geometry = null;
    this.material = null;
    this.mesh = null;
    this.texture = null;
  }

  /**
   * @param {!THREE.Group} group
   * @param {!THREE.PerspectiveCamera} camera
   * @param {number} x
   * @param {number} y
   * @param {number} th
   * @param {SpriteObjectOptions=} optOptions
   */
  addToGroup(group, camera, x, y, th, optOptions) {
    if (!this.mesh) {
      this.geometry = new THREE.PlaneGeometry(this.wScale, this.hScale);
      let map = this.texture;
      if (!map) map = gfx.getSpriteAsTexture(this.sprite, this.color);
      // Right now this uses a MeshBasicMaterial instead of a
      // MeshStandardMaterial to prevent the problem where, if a light source
      // is directly behind (or inside the center of!) a SpriteObject, the
      // sprite object is pure black... SpriteObjects might be flat planes,
      // but they are meant to represent 3D objects, and they should not respond
      // to light sources in the way a flat plane should!
      // TODO: Once I can figure out how to let light pass through a plane while
      // still illuminating it, I should go back to using a MeshLambertMaterial.
      this.material = new THREE.MeshBasicMaterial({map, transparent: true});
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }

    // Set position, and look at the camera.
    let h = this.hScale / 2;
    if (optOptions && optOptions.h != undefined) {
      h = optOptions.h;
    }
    h += th * gfxThScale;
    this.mesh.position.set(x, h, y);
    this.mesh.lookAt(camera.position.x, h, camera.position.z);

    if (optOptions && optOptions.renderOrder != undefined) {
      this.mesh.renderOrder = optOptions.renderOrder;
    }

    // If configured, the object will move back slightly, so that it doesn't
    // overlap with players standing in this square.
    if (optOptions && optOptions.drawBack != undefined) {
      this.mesh.translateZ(-optOptions.drawBack);
    }

    // Determine whether the sprite should be flipped.
    if (optOptions && optOptions.facing != undefined) {
      const oldX = this.mesh.position.x;
      const oldY = this.mesh.position.z;
      /** @return {number} */
      const getDistance = () => {
        const angleX = oldX + Math.cos(optOptions.facing);
        const angleY = oldY + Math.sin(optOptions.facing);
        return calcDistance(
            this.mesh.position.x - angleX, this.mesh.position.z - angleY);
      };

      // If moving x=-1 makes you CLOSER to the "facing" direction, you should
      // be flipped!
      this.mesh.scale.x = 1;
      const oldDistance = getDistance();
      this.mesh.translateX(-0.5);
      const newDistance = getDistance();
      this.mesh.translateX(0.5);
      if (oldDistance > newDistance) {
        this.mesh.scale.x = -1;
      }
    }

    group.add(this.mesh);
  }
}
