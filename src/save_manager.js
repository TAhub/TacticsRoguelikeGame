class SaveManager {
  /**
   * @param {string} fromPrefix
   * @param {string} toPrefix
   * @private
   */
  convert_(fromPrefix, toPrefix) {
    const keysToCopy = [];
    for (let i = 0; ; i++) {
      const key = window.localStorage.key(i);
      if (!key) break;
      if (!key.startsWith(fromPrefix)) continue;
      keysToCopy.push(key.replace(fromPrefix, ''));
    }
    for (const strippedKey of keysToCopy) {
      const old = window.localStorage.getItem(fromPrefix + strippedKey);
      if (!old) continue;
      window.localStorage.setItem(toPrefix + strippedKey, old);
    }
  }

  pullSave() {
    this.convert_('save_', 'temp_');
  }

  pushSave() {
    this.convert_('temp_', 'save_');
  }

  /**
   * @param {string} key
   * @param {number} value
   */
  setConfiguration(key, value) {
    if (value > 0) {
      window.localStorage.setItem('config_' + key, '' + value);
    } else {
      window.localStorage.removeItem('config_' + key);
    }
  }

  /**
   * @param {string} key
   * @return {number} value
   */
  getConfiguration(key) {
    const raw = window.localStorage.getItem('config_' + key);
    if (!raw) return 0;
    return parseInt(raw, 10);
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  save(key, value) {
    window.localStorage.setItem('temp_' + key, value);
  }

  /**
   * @param {string} key
   * @return {?string} value
   */
  loadTrue(key) {
    return window.localStorage.getItem('save_' + key);
  }

  /**
   * @param {string} key
   * @return {?string} value
   */
  load(key) {
    return window.localStorage.getItem('temp_' + key);
  }

  /**
   * @param {string} key
   * @return {?number} value
   */
  loadInt(key) {
    const raw = this.load(key);
    return raw == null ? null : parseInt(raw, 10);
  }

  /**
   * @param {string} string
   * @return {!Object.<string, string>} obj
   */
  stringToSaveObj(string) {
    return /** @type {!Object.<string, string>} */ (JSON.parse(string));
  }

  /**
   * @param {string} name
   * @return {?Object.<string, string>} obj
   */
  loadSaveObj(name) {
    const objStr = this.load(name);
    if (!objStr) return null;
    return this.stringToSaveObj(objStr);
  }

  clear(tempOnly) {
    const keysToRemove = [];
    for (let i = 0; ; i++) {
      const key = window.localStorage.key(i);
      if (!key) break;
      if (tempOnly) {
        if (!key.startsWith('temp_')) continue;
      } else {
        if (!key.startsWith('temp_') && !key.startsWith('save_')) continue;
      }
      keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @param {number} float
   */
  floatToSaveObj(obj, key, float) {
    if (float == 0) {
      delete obj[key];
    } else {
      obj[key] = float.toString();
    }
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @param {number} int
   */
  intToSaveObj(obj, key, int) {
    if (int == 0) {
      delete obj[key];
    } else {
      obj[key] = int.toString(36);
    }
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @param {boolean} bool
   */
  boolToSaveObj(obj, key, bool) {
    if (!bool) {
      delete obj[key];
    } else {
      obj[key] = '1';
    }
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @return {number} float
   */
  floatFromSaveObj(obj, key) {
    if (!obj[key]) {
      return 0;
    }
    if (obj[key] == 'Infinity') {
      return Infinity;
    }
    return parseFloat(obj[key]);
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @return {number} int
   */
  intFromSaveObj(obj, key) {
    if (!obj[key]) {
      return 0;
    }
    if (obj[key] == 'Infinity') {
      return Infinity;
    }
    return parseInt(obj[key], 36);
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @return {boolean} bool
   */
  boolFromSaveObj(obj, key) {
    return obj[key] == '1';
  }

  /**
   * @param {!Object.<string, string>} obj
   * @param {string} key
   * @return {?Object.<string, string>} obj
   */
  saveObjFromSaveObj(obj, key) {
    if (!obj[key]) return null;
    return /** @type {!Object.<string, string>} */ (JSON.parse(obj[key]));
  }
}

const saveManager = new SaveManager();
