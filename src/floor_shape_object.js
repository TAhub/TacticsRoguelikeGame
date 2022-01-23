class FloorShapeObject {
  constructor() {
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
   * @param {!HTMLCanvasElement} buffer
   * @param {number} scale
   */
  setBuffer(buffer, scale) {
    this.clear3DData();
    this.texture = new THREE.CanvasTexture(buffer);
    this.wScale = scale;
    this.hScale = scale;
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
   * @param {number} x
   * @param {number} y
   * @param {number} th
   */
  addToGroup(group, x, y, th) {
    if (!this.texture) return;
    if (!this.mesh) {
      this.geometry = new THREE.PlaneGeometry(this.wScale, this.hScale);
      // Right now this uses a MeshBasicMaterial instead of a
      // MeshStandardMaterial to prevent the problem where, if a light source
      // is directly behind (or inside the center of!) a SpriteObject, the
      // sprite object is pure black... SpriteObjects might be flat planes,
      // but they are meant to represent 3D objects, and they should not respond
      // to light sources in the way a flat plane should!
      // TODO: Once I can figure out how to let light pass through a plane while
      // still illuminating it, I should go back to using a MeshLambertMaterial.
      this.material = new THREE.MeshBasicMaterial({
        'map': this.texture,
        'transparent': true,
      });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }

    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(x, 0.01 + th * gfxThScale, y);
    group.add(this.mesh);
  }
}
