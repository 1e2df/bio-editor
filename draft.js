// Unpublished edits shared between editor.html and the bio page (index.html?draft).
// Text and links live in localStorage; new photo/background/music files live in IndexedDB.

const BioDraft = (() => {
  const KEY = 'bioDraft';
  const USED_KEY = 'bioEditorUsed';
  const DB_NAME = 'bio-draft';
  const STORE = 'files';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const result = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : undefined); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  return {
    // cfg: the edited config; files: { avatar, background, music } -> File or null
    saveConfig(cfg) {
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {}
    },

    loadConfig() {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
    },

    async saveFile(kind, file) {
      try { await withStore('readwrite', store => file ? store.put(file, kind) : store.delete(kind)); } catch (e) {}
    },

    async loadFiles() {
      const files = {};
      try {
        for (const kind of ['avatar', 'background', 'music']) {
          const file = await withStore('readonly', store => store.get(kind));
          if (file) files[kind] = file;
        }
      } catch (e) {}
      return files;
    },

    async clear() {
      try { localStorage.removeItem(KEY); } catch (e) {}
      try { await withStore('readwrite', store => store.clear()); } catch (e) {}
    },

    markEditorUsed() {
      try { localStorage.setItem(USED_KEY, '1'); } catch (e) {}
    },

    editorUsed() {
      try { return localStorage.getItem(USED_KEY) === '1'; } catch (e) { return false; }
    }
  };
})();
