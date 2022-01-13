class ParsedDataEntry {
  constructor() {
    /** @type {!Array.<!Map.<string, string>>} */
    this.subtypes = [];
    /** @type {!Map.<string, string>} */
    this.values = new Map();
  }
}

class ParsedDataCategory {
  constructor() {
    /** @type {!Map.<string, !ParsedDataEntry>} */
    this.entries = new Map();
  }
}

class Data {
  constructor() {
    /** @type (!Map.<string, ParsedDataCategory>) */
    this.categories = new Map();

    /** @type (Image) */
    this.sprites;

    /** @type {!Map.<string, !Tone.Buffer>} */
    this.sounds = new Map();

    /** @type {!Set.<string>} */
    this.lazyLoadSoundsRequested = new Set();
  }

  /**
   * @param {string} name
   * @return {Promise.<!Map.<string, ParsedDataCategory>>}
   * @private
   */
  fetchData_(name) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('GET', name);
      // TODO: handle failing to load
      request.onload = () => {
        const parser = new DOMParser();
        const loaded = request.responseText;
        const scheme = 'application/xml';
        const root = parser.parseFromString(loaded, scheme).firstChild;

        const errorParts = root.getElementsByTagName('parsererror');
        if (errorParts.length > 0) {
          // TODO: failed to load
          console.log('Parser error!');
          console.log(errorParts[0].outerHTML);
          return;
        }

        /** @type {!Map.<string, ParsedDataCategory>} */
        const categories = new Map();
        for (let i = 0; i < root.children.length; i++) {
          const categoryData = root.children[i];
          const category = new ParsedDataCategory();
          for (let j = 0; j < categoryData.children.length; j++) {
            const entryData = categoryData.children[j];
            const entry = new ParsedDataEntry();
            for (let k = 0; k < entryData.attributes.length; k++) {
              const attribute = entryData.attributes[k];
              if (attribute.name != 'name') {
                entry.values.set(attribute.name, attribute.value);
              }
            }
            if (entryData.children.length) {
              for (let k = 0; k < entryData.children.length; k++) {
                const typeData = entryData.children[k];
                const type = new Map();
                for (let l = 0; l < typeData.attributes.length; l++) {
                  const attribute = typeData.attributes[l];
                  type.set(attribute.name, attribute.value);
                }
                type.set('tag', typeData.nodeName);
                entry.subtypes.push(type);
              }
            }
            const name = entryData.getAttribute('name');
            if (DEBUG && category.entries.get(name)) {
              console.log('Duplicate entry', name, 'in category',
                  categoryData.getAttribute('name'));
            }
            category.entries.set(name, entry);
          }
          categories.set(categoryData.getAttribute('name'), category);
        }
        resolve(categories);
      };
      request.send();
    });
  }

  /**
   * @param {string} name
   * @return {Promise}
   * @private
   */
  fetchSound_(name) {
    const soundPromise = new Promise((resolve, reject) => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext();

      const request = new XMLHttpRequest();
      request.responseType = 'arraybuffer';
      request.open('GET', name, true);
      request.onload = () => {
        const buffer = /** @type {!ArrayBuffer} */ (request.response);
        audioContext.decodeAudioData(buffer, async (rawBuffer) => {
          const floatArray = new Float32Array(rawBuffer.length);
          rawBuffer.copyFromChannel(floatArray, 0, 0);
          const buffer = await Tone.Buffer.fromArray(floatArray);
          resolve(buffer);
        }, (error) => {
          // TODO: handle failure
        });
      };
      request.send();
    });

    return soundPromise;
  }

  /**
   * @param {string} name
   * @return {Promise}
   * @private
   */
  fetchSprite_(name) {
    const spritesPromise = new Promise((resolve, reject) => {
      // Load the sprites image.
      const image = new Image();
      image.onload = () => {
        resolve(image);
      };
      // TODO: handle failure
      image.src = name;
    });

    return spritesPromise;
  }

  /**
   * @param {string} name
   * @param {string} url
   * @return {Promise}
   * @private
   */
  async fetchFont_(name, url) {
    const font = new FontFace(name, 'url(' + url + ')');
    await font.load();
    document.fonts.add(font);
  }

  /** @return {Promise} */
  async setup() {
    const promises = [];
    promises.push(this.fetchSprite_('sprites.png').then((image) => {
      this.sprites = image;
    }));
    promises.push(this.fetchFont_(
        'RobotoSlab', 'Roboto_Slab/RobotoSlab-VariableFont_wght.ttf'));
    for (const filename of ['data.xml', 'strings.xml', 'sounds.xml']) {
      promises.push(this.fetchData_(filename).then((categories) => {
        for (const key of categories.keys()) {
          this.categories.set(key, categories.get(key));
        }
      }));
    }
    await Promise.all(promises);
    if (DEBUG) {
      console.log(this.categories);
    }
  }

  /** @return {!Array.<string>} */
  get soundsToFetch() {
    const soundVolume = saveManager.getConfiguration('soundVolume');
    const musicVolume = saveManager.getConfiguration('musicVolume');
    const allSounds = data.getCategoryEntriesArray('sounds') || [];
    return allSounds.filter((sound) => {
      if (this.sounds.has(sound)) return false;

      const isMusic = data.getBooleanValue('sounds', sound, 'music');
      if (isMusic && musicVolume == 0) return false;
      if (!isMusic && soundVolume == 0) return false;

      const lazyLoad = data.getBooleanValue('sounds', sound, 'lazyLoad');
      if (lazyLoad && !this.lazyLoadSoundsRequested.has(sound)) return false;

      const filename = data.getValue('sounds', sound, 'filename');
      if (!filename) return false;

      return true;
    });
  }

  async fetchAppropriateSounds() {
    const soundPromises = this.soundsToFetch.map((sound) => {
      const filename = data.getValue('sounds', sound, 'filename') || '';
      const fullPath = 'sound/' + filename;
      return this.fetchSound_(fullPath).then((parsed) => {
        this.sounds.set(sound, parsed);
      });
    });
    await Promise.all(soundPromises);
  }

  /**
   * @param {string} category
   * @return {?Array.<string>}
   */
  getCategoryEntriesArray(category) {
    const cat = this.getCategory(category);
    return cat ? Array.from(cat.entries.keys()) : null;
  }

  /**
   * @param {string} category
   * @return {?ParsedDataCategory}
   */
  getCategory(category) {
    return this.categories.get(category);
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @return {?ParsedDataEntry}
   */
  getEntry(category, entry) {
    const ca = this.getCategory(category);
    return ca ? ca.entries.get(entry) : null;
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @return {number}
   */
  getNumSubtypes(category, entry) {
    const en = this.getEntry(category, entry);
    return en ? en.subtypes.length : 0;
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @param {string} value
   * @param {number=} optSubtype
   * @return {?string}
   */
  getValue(category, entry, value, optSubtype) {
    const en = this.getEntry(category, entry);
    if (!en) return null;
    if (optSubtype != undefined && en.subtypes.length > 0) {
      const subtype = en.subtypes[optSubtype];
      if (subtype) {
        const subval = subtype.get(value);
        if (subval) {
          return subval;
        }
      }
    }
    return en.values.get(value);
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @param {string} value
   * @param {number=} optSubtype
   * @return {?Array.<!string>}
   */
  getArrayValue(category, entry, value, optSubtype) {
    const raw = this.getValue(category, entry, value, optSubtype);
    return raw ? raw.split(',') : null;
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @param {string} value
   * @param {number=} optSubtype
   * @return {boolean}
   */
  getBooleanValue(category, entry, value, optSubtype) {
    const numberValue =
        this.getNumberValue(category, entry, value, optSubtype);
    return numberValue ? numberValue != 0 : false;
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @param {string} value
   * @param {number=} optSubtype
   * @return {?number}
   */
  getNumberValue(category, entry, value, optSubtype) {
    const val = this.getValue(category, entry, value, optSubtype);
    if (val) {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  /**
   * @param {string} name
   * @return {?string}
   */
  getColorByName(name) {
    const color = this.getValue('colors', name, 'color');
    if (!color) {
      console.log('Invalid color', name);
    }
    return /** @type (?string) */ (color);
  }

  /**
   * @param {string} name
   * @return {string}
   */
  getColorByNameSafe(name) {
    return this.getColorByName(name) || '#FFFFFF';
  }

  /**
   * @param {string} category
   * @param {string} entry
   * @param {string} value
   * @param {number=} optSubtype
   * @return {?string}
   */
  getColorValue(category, entry, value, optSubtype) {
    const val = /** @type (?string) */ (
      this.getValue(category, entry, value, optSubtype));
    return val ? this.getColorByName(val) : null;
  }
}

const data = new Data();
