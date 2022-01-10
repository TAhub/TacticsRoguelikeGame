/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   h: number,
 *   i: number,
 *   c: string,
 * }}
 */
let LightData;

class LightController {
  constructor() {
    // Pre-create all the light objects, so that new light objects don't need
    // to be made on the fly, which causes lag.
    this.lights = [];
    for (let i = 0; i < gfxNumLights; i++) {
      const color = getHexColor('#FFFFFF');
      const light = new THREE.PointLight(color, 0, 0);
      light.position.set(0, 0, 0);
      this.lights.push(light);
    }

    /** @type {!Array.<!LightData>} */
    this.highPriorityLightDatas = [];
    /** @type {!Array.<!LightData>} */
    this.lowPriorityLightDatas = [];
  }

  /** @param {!THREE.Group} group */
  addToGroup(group) {
    for (const light of this.lights) {
      group.add(light);
    }
  }

  finalize() {
    let i = 0;
    let datas = this.highPriorityLightDatas;
    for (const light of this.lights) {
      // Get the appropriate light data.
      let data = datas[i];
      if (!data) {
        if (datas == this.highPriorityLightDatas) {
          datas = this.lowPriorityLightDatas;
          i = 0;
          data = datas[i];
        }
      }
      i++;

      // Format the light.
      if (data) {
        light.position.set(data.x, data.h, data.y);
        light.intensity = data.i;
        light.distance = 3 + 2 * data.i;
        const rgb = getRGB(data.c);
        light.color.r = rgb.r / 256;
        light.color.g = rgb.g / 256;
        light.color.b = rgb.b / 256;
      } else {
        light.position.set(0, 0, 0);
        light.intensity = 0;
        light.distance = 0.001;
      }
    }
    this.highPriorityLightDatas = [];
    this.lowPriorityLightDatas = [];
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} h
   * @param {number} i
   * @param {string} c
   * @param {boolean=} optLowPriority
   */
  add(x, y, h, i, c, optLowPriority) {
    const array = optLowPriority ?
        this.lowPriorityLightDatas : this.highPriorityLightDatas;
    array.push({x, y, h, i, c});
  }
}
