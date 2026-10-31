// All reading and writing of phone data. Everything stays in this phone's IndexedDB.
const DB_NAME = 'daily-planner';
const DB_VERSION = 1;
const DATA_TABLE = 'data';
const SAFETY_TABLE = 'safety';
const SAVE_DELAY_MS = 150;
const SAVE_RETRY_MS = 2000;
const SAFETY_COPIES_KEPT = 10;
const BACKUP_APP = 'daily-planner-phone';
const BACKUP_VERSION = 1;
const BACKUP_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLACEHOLDER_RULES = [1, 2, 3, 4, 5].map((number) => `Rule ${number} - tap to edit`);
const STORES = sharedData.storeDefinitions(PLACEHOLDER_RULES);

function daysSince(isoTime) {
  // Rounded because a day with a clock change isn't exactly 24 hours long.
  return Math.round((keyToDate(todayKey()) - keyToDate(dateToKey(new Date(isoTime)))) / DAY_MS);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('The save was interrupted.'));
  });
}

class PhoneStorage extends sharedData.PlannerData {
  constructor({ onSaveStatus = () => {} } = {}) {
    super();
    this.onSaveStatus = onSaveStatus;
    this.dirty = new Set();
    this.timer = null;
    this.notices = [];
    this.saving = Promise.resolve(true);
    this.connection = null;
  }

  // iPhones can drop the connection while the app sits in the background, so reopen when needed.
  async database() {
    if (this.connection) return this.connection;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_TABLE)) db.createObjectStore(DATA_TABLE);
      if (!db.objectStoreNames.contains(SAFETY_TABLE)) db.createObjectStore(SAFETY_TABLE, { autoIncrement: true });
    };
    const db = await requestResult(request);
    db.onclose = () => {
      this.connection = null;
    };
    this.connection = db;
    return db;
  }

  async load() {
    const db = await this.database();
    const table = db.transaction(DATA_TABLE).objectStore(DATA_TABLE);
    const keys = Object.keys(STORES);
    const saved = await Promise.all(keys.map((key) => requestResult(table.get(key))));

    keys.forEach((key, index) => {
      this.data[key] = { ...STORES[key].defaults(), ...this.loadStore(key, saved[index]), version: sharedData.SCHEMA_VERSION };
    });
    if (!this.data.settings.createdAt) {
      this.data.settings.createdAt = new Date().toISOString();
      this.dirty.add('settings');
    }
    await this.flush();
    this.addBackupReminder();
  }

  loadStore(key, saved) {
    if (saved === undefined) {
      this.dirty.add(key);
      return {};
    }
    if (STORES[key].isValid(saved)) return saved;
    // Set aside rather than overwritten, in case it can still be rescued.
    this.pendingDamaged = { ...this.pendingDamaged, [`damaged-${key}-${Date.now()}`]: saved };
    this.notices.push(`Your ${key} could not be read, so they started empty. The damaged copy was kept.`);
    this.dirty.add(key);
    return {};
  }

  addBackupReminder() {
    const { days, overdue } = this.backupAge();
    if (overdue) this.notices.push(`It has been ${days} days since your last backup. Save one in Settings.`);
  }

  backupAge() {
    const { lastBackupAt, createdAt } = this.data.settings;
    const days = daysSince(lastBackupAt ?? createdAt);
    return { neverBackedUp: !lastBackupAt, days, overdue: days > BACKUP_WARNING_DAYS };
  }

  markDirty(key) {
    this.dirty.add(key);
    this.scheduleSave(SAVE_DELAY_MS);
  }

  scheduleSave(delay) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), delay);
  }

  // Saves run one at a time, so an older save can never land after a newer one.
  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    this.saving = this.saving.then(() => this.writeDirty());
    return this.saving;
  }

  // Failed writes stay queued and retry, so a problem delays a save instead of losing it.
  async writeDirty() {
    if (this.dirty.size === 0 && !this.pendingDamaged) return true;
    const keys = [...this.dirty];
    this.dirty.clear();
    try {
      const db = await this.database();
      const transaction = db.transaction(DATA_TABLE, 'readwrite');
      const table = transaction.objectStore(DATA_TABLE);
      for (const key of keys) table.put(this.data[key], key);
      for (const [key, value] of Object.entries(this.pendingDamaged ?? {})) table.put(value, key);
      await transactionDone(transaction);
      this.pendingDamaged = null;
      this.onSaveStatus(true);
      return true;
    } catch (error) {
      console.error('Save failed:', error);
      this.connection = null;
      for (const key of keys) this.dirty.add(key);
      this.onSaveStatus(false);
      this.scheduleSave(SAVE_RETRY_MS);
      return false;
    }
  }

  // Settings

  getSettings() {
    const { textSize, lastBackupAt = null } = this.data.settings;
    return { textSize, lastBackupAt };
  }

  // Backups

  allData() {
    return Object.fromEntries(Object.keys(STORES).map((key) => [key, this.data[key]]));
  }

  // Worked out straight from memory, because iPhones only open the share sheet right after a tap.
  backupFile() {
    const text = JSON.stringify(
      { app: BACKUP_APP, backupVersion: BACKUP_VERSION, savedAt: new Date().toISOString(), data: this.allData() },
      null,
      2
    );
    return new File([text], `Planner-backup-${todayKey()}.json`, { type: 'application/json' });
  }

  markBackupMade() {
    this.data.settings.lastBackupAt = new Date().toISOString();
    this.markDirty('settings');
    return this.getSettings();
  }

  // Checks the whole backup before anything is replaced.
  readBackup(text) {
    if (text.startsWith('PK')) {
      throw new Error('That is a PC backup. The phone can only read backups saved from the phone.');
    }
    let backup;
    try {
      backup = JSON.parse(text);
    } catch {
      throw new Error('That file is not a readable backup.');
    }
    if (backup?.app !== BACKUP_APP || !backup.data) throw new Error('That file is not a planner backup.');
    if (backup.backupVersion > BACKUP_VERSION) throw new Error('That backup was made by a newer version of the app.');
    for (const [key, store] of Object.entries(STORES)) {
      if (!store.isValid(backup.data[key])) throw new Error('That backup is damaged.');
    }
    return {
      savedAt: backup.savedAt,
      data: backup.data,
      recipeCount: backup.data.recipes.recipes.length,
      dayCount: Object.keys(backup.data.days.days).length,
    };
  }

  // The safety copy and the new data are written together, so it's all or nothing.
  async replaceData(incoming) {
    await this.flush();
    const db = await this.database();
    const transaction = db.transaction([DATA_TABLE, SAFETY_TABLE], 'readwrite');
    const data = transaction.objectStore(DATA_TABLE);
    const safety = transaction.objectStore(SAFETY_TABLE);
    safety.add({ savedAt: new Date().toISOString(), data: this.allData() });
    const safetyKeys = requestResult(safety.getAllKeys());

    const replacement = {};
    for (const key of Object.keys(STORES)) {
      replacement[key] = { ...STORES[key].defaults(), ...incoming[key], version: sharedData.SCHEMA_VERSION };
    }
    // A backup file holds this data, so the reminder starts over.
    replacement.settings.lastBackupAt = new Date().toISOString();
    replacement.settings.createdAt ??= this.data.settings.createdAt;
    for (const key of Object.keys(STORES)) data.put(replacement[key], key);

    for (const key of (await safetyKeys).slice(0, -SAFETY_COPIES_KEPT)) safety.delete(key);
    await transactionDone(transaction);
    this.data = replacement;
  }

  async latestSafetyCopy() {
    const db = await this.database();
    const table = db.transaction(SAFETY_TABLE).objectStore(SAFETY_TABLE);
    const keys = await requestResult(table.getAllKeys());
    return keys.length ? requestResult(table.get(keys.at(-1))) : null;
  }
}

let saveStatusListener = () => {};
const phoneStorage = new PhoneStorage({ onSaveStatus: (ok) => saveStatusListener(ok) });
const storageReady = phoneStorage.load();

// Each call gets its own copy of the data, the same way the PC app's screens do,
// so a screen can never change saved data by accident.
function storageCall(method) {
  return async (...args) => {
    await storageReady;
    return structuredClone(await phoneStorage[method](...structuredClone(args)));
  };
}

const planner = {
  ...Object.fromEntries(
    [
      'addRule',
      'updateRule',
      'deleteRule',
      'moveRule',
      'getDays',
      'setDayField',
      'getDayPlan',
      'addMeal',
      'removeMeal',
      'moveMeal',
      'copyMeals',
      'setGroceryChecked',
      'saveRecipe',
      'deleteRecipe',
      'recipeUseCount',
      'addTag',
      'renameTag',
      'deleteTag',
      'updateSettings',
      'markBackupMade',
      'readBackup',
      'replaceData',
      'latestSafetyCopy',
    ].map((method) => [method, storageCall(method)])
  ),

  async getState() {
    await storageReady;
    return structuredClone({
      settings: phoneStorage.getSettings(),
      rules: phoneStorage.getRules(),
      recipes: phoneStorage.getRecipes(),
      tags: phoneStorage.getTags(),
      units: sharedData.UNITS,
      minTextSize: sharedData.MIN_TEXT_SIZE,
      maxTextSize: sharedData.MAX_TEXT_SIZE,
    });
  },

  async getNotices() {
    await storageReady;
    return phoneStorage.notices.splice(0);
  },

  onSaveStatus(callback) {
    saveStatusListener = callback;
  },
};
