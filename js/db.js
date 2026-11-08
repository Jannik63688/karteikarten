// Kleine Promise-Hülle um IndexedDB. Alle Daten bleiben lokal auf dem Gerät.
const DB_NAME = 'karteikarten';
const DB_VERSION = 1;
export const STORES = ['decks', 'cards', 'images', 'meta'];

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['decks', 'cards', 'images']) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('Datenbank ist blockiert. Bitte App neu öffnen.'));
  });
  return dbPromise;
}

const reqP = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
  });

export async function getAll(store) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await open();
  return reqP(db.transaction(store).objectStore(store).get(key));
}

export async function put(store, value) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  return txDone(tx);
}

export async function del(store, key) {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  return txDone(tx);
}

/**
 * Mehrere Operationen atomar ausführen.
 * ops: [{ store, op: 'put' | 'del' | 'clear', value?, key? }]
 */
export async function bulk(ops) {
  if (!ops.length) return;
  const db = await open();
  const stores = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const o of ops) {
    const st = tx.objectStore(o.store);
    if (o.op === 'put') st.put(o.value);
    else if (o.op === 'del') st.delete(o.key);
    else if (o.op === 'clear') st.clear();
  }
  return txDone(tx);
}

export async function getMeta(key, fallback) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}

export function setMeta(key, value) {
  return put('meta', { key, value });
}
