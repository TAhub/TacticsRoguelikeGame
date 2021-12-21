/** @externs */

/** @const */
const THREE = {};

THREE.Vector3 = class {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  constructor(x, y, z) {
    /** @type {number} */
    this.x;
    /** @type {number} */
    this.y;
    /** @type {number} */
    this.z;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  set(x, y, z) {};

  /**
   * @param {!THREE.Camera} camera
   * @return {!THREE.Vector3}
   */
  project(camera) {};
}

THREE.LineCurve3 = class {
  /**
   * @param {!THREE.Vector3} v1
   * @param {!THREE.Vector3} v2
   */
  constructor(v1, v2) {}
}

THREE.Euler = class {
  constructor() {
    /** @type {number} */
    this.x;
    /** @type {number} */
    this.y;
    /** @type {number} */
    this.z;
  }
}

THREE.Object3D = class {
  constructor() {
    /** @type {?THREE.Object3D} */
    this.parent;
    /** @type {!THREE.Vector3} */
    this.position;
    /** @type {!THREE.Euler} */
    this.rotation;
    /** @type {!THREE.Vector3} */
    this.scale;
    /** @type {number} */
    this.renderOrder;
  }

  clear() {};

  /** @param {THREE.Object3D} object */
  add(object) {};

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   */
  lookAt(x, y, z) {};

  /** @param {number} x */
  translateX(x) {};

  /** @param {number} z */
  translateZ(z) {};

  /** @param {number} angle */
  rotateZ(angle) {};
}

THREE.Scene = class extends THREE.Object3D {
}

THREE.Group = class extends THREE.Object3D {
}

THREE.BufferGeometry = class {
  dispose() {};

  /**
   * @param {string} name
   * @return {!Object}
   */
  getAttribute(name) {};
}

THREE.PlaneGeometry = class extends THREE.BufferGeometry {
}

THREE.TubeGeometry = class extends THREE.BufferGeometry {
  /**
   * @param {!THREE.LineCurve3} path
   * @param {number} tubularSegments
   * @param {number} radius
   * @param {number} radialSegments
   * @param {boolean} closed
   */
  constructor(path, tubularSegments, radius, radialSegments, closed) {}
}

THREE.Mesh = class extends THREE.Object3D {
}

THREE.Material = class {
  dispose() {};
}

THREE.MeshStandardMaterial = class extends THREE.Material {
}

THREE.MeshBasicMaterial = class extends THREE.Material {
}

THREE.Renderer = class {
  /**
   * @param {!THREE.Scene} scene
   * @param {!THREE.Camera} camera
   */
  render(scene, camera) {};
}

THREE.WebGLRenderer = class extends THREE.Renderer {
  /**
   * @param {number} width
   * @param {number} height
   */
  setSize(width, height) {};
}

THREE.Texture = class {
  dispose() {};
}

THREE.CanvasTexture = class extends THREE.Texture {
}

THREE.Light = class extends THREE.Object3D {
}

THREE.PointLight = class extends THREE.Light {
}

THREE.RectAreaLight = class extends THREE.Light {
}

THREE.Camera = class extends THREE.Object3D {
}

THREE.PerspectiveCamera = class extends THREE.Camera {
}
