/*
 * KEŞİF sim — yerel kayıt depolama (saf API + enjekte edilen adaptör).
 *
 * Adaptör arayüzü (hepsi Promise döner; eşzamanlı adaptörler de `await` ile çalışır):
 *   get(key) → string | null     set(key, value:string)     remove(key)     list(prefix) → string[]
 * Hazır adaptörler: createMemoryAdapter, createLocalStorageAdapter(storage?), createIndexedDbAdapter(opts?) (tarayıcı;
 * yoksa null), createFallbackAdapter(birincil, yedek), createBestAdapter(env?) (IndexedDB → localStorage yedeği).
 *
 * Slot API: saveToSlot / loadFromSlot / listSlots / deleteSlot. Her slot iki anahtar: kayıt JSON'u ve küçük özet (liste
 * büyük kaydı çözmeden okunur). Atmaz: hata → {ok:false, code}.
 */
import { foldTr } from './constants.js';
import { deserializeGame, estimateSaveSize, summarizeSave } from './save.js';

export const SAVE_KEY_PREFIX = 'kesif:save:';
export const META_KEY_PREFIX = 'kesif:meta:';
export const SLOT_AUTO = 'otomatik';
export const MAX_SLOTS = 20;
const SLOT_RE = /^[a-z0-9_-]{1,32}$/;

/** Slot adını güvenli biçime getirir (küçük harf, a-z0-9_-, ≤32); geçersizse null. */
export function normalizeSlot(slot) {
  if (typeof slot !== 'string') return null;
  const s = foldTr(slot.trim()).replace(/\s+/g, '-');
  return SLOT_RE.test(s) ? s : null;
}

/* ------------------------------------------------------------------------------------------------
 * Adaptörler
 * ---------------------------------------------------------------------------------------------- */
export function createMemoryAdapter() {
  const m = new Map();
  return {
    kind: 'memory',
    get: async (k) => (m.has(k) ? m.get(k) : null),
    set: async (k, v) => { m.set(k, String(v)); },
    remove: async (k) => { m.delete(k); },
    list: async (prefix) => Array.from(m.keys()).filter((k) => k.indexOf(prefix || '') === 0).sort(),
  };
}

/** localStorage (ya da aynı arayüzlü nesne). Kullanılamıyorsa null. */
export function createLocalStorageAdapter(storage) {
  let st = storage;
  if (st === undefined) {
    try {
      st = typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
    } catch {
      st = null;
    }
  }
  if (!st || typeof st.getItem !== 'function') return null;
  try {
    const probe = '__kesif_probe__';
    st.setItem(probe, '1');
    st.removeItem(probe);
  } catch {
    return null;
  }
  return {
    kind: 'localStorage',
    get: async (k) => {
      const v = st.getItem(k);
      return v === null || v === undefined ? null : v;
    },
    set: async (k, v) => { st.setItem(k, String(v)); },
    remove: async (k) => { st.removeItem(k); },
    list: async (prefix) => {
      const out = [];
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i);
        if (typeof k === 'string' && k.indexOf(prefix || '') === 0) out.push(k);
      }
      return out.sort();
    },
  };
}

function idbOpen(idb, name, store) {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = idb.open(name, 1);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open'));
    req.onblocked = () => reject(new Error('idb_blocked'));
  });
}

/** IndexedDB adaptörü; tarayıcı desteği yoksa null. Veritabanı ilk kullanımda açılır; açılış hatası sonraki çağrıda yeniden denenir. */
export function createIndexedDbAdapter(opts) {
  const o = opts || {};
  let idb = o.indexedDB;
  if (idb === undefined) {
    try {
      idb = typeof globalThis !== 'undefined' ? globalThis.indexedDB : null;
    } catch {
      idb = null;
    }
  }
  if (!idb || typeof idb.open !== 'function') return null;
  const dbName = o.dbName || 'kesif-saves';
  const store = o.storeName || 'saves';
  let dbPromise = null;
  const db = () => {
    if (!dbPromise) {
      dbPromise = idbOpen(idb, dbName, store).catch((e) => {
        dbPromise = null;
        throw e;
      });
    }
    return dbPromise;
  };
  const run = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    let result;
    let tx;
    try {
      tx = d.transaction(store, mode);
      const req = fn(tx.objectStore(store));
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error || new Error('idb_req'));
    } catch (e) {
      reject(e);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('idb_tx'));
    tx.onabort = () => reject(tx.error || new Error('idb_abort'));
  }));
  return {
    kind: 'indexedDB',
    get: (k) => run('readonly', (os) => os.get(k)).then((v) => (typeof v === 'string' ? v : null)),
    set: (k, v) => run('readwrite', (os) => os.put(String(v), k)).then(() => undefined),
    remove: (k) => run('readwrite', (os) => os.delete(k)).then(() => undefined),
    list: (prefix) => run('readonly', (os) => os.getAllKeys()).then((keys) => (Array.isArray(keys) ? keys : [])
      .filter((k) => typeof k === 'string' && k.indexOf(prefix || '') === 0).sort()),
  };
}

/** Birincil başarısızsa (ya da değer yoksa) yedek adaptöre düşer; yazma birincile gider, olmazsa yedeğe. */
export function createFallbackAdapter(primary, secondary) {
  if (!primary) return secondary || createMemoryAdapter();
  if (!secondary) return primary;
  return {
    kind: primary.kind + '+' + secondary.kind,
    async get(k) {
      try {
        const v = await primary.get(k);
        if (v !== null && v !== undefined) return v;
      } catch {
        // birincil okunamadı: yedeğe bak
      }
      try {
        return await secondary.get(k);
      } catch {
        return null;
      }
    },
    async set(k, v) {
      try {
        await primary.set(k, v);
        try {
          await secondary.remove(k);
        } catch {
          // bayat kopya silinemedi: sorun değil
        }
        return;
      } catch {
        // birincil yazılamadı: yedeğe yaz
      }
      await secondary.set(k, v);
    },
    async remove(k) {
      let err = null;
      try {
        await primary.remove(k);
      } catch (e) {
        err = e;
      }
      try {
        await secondary.remove(k);
        err = null;
      } catch (e) {
        if (!err) err = e;
      }
      if (err) throw err;
    },
    async list(prefix) {
      const set = new Set();
      try {
        (await primary.list(prefix)).forEach((k) => set.add(k));
      } catch {
        // atla
      }
      try {
        (await secondary.list(prefix)).forEach((k) => set.add(k));
      } catch {
        // atla
      }
      return Array.from(set).sort();
    },
  };
}

/** Ortama göre en iyi adaptör: IndexedDB (+ localStorage yedeği) → localStorage → bellek. */
export function createBestAdapter(env) {
  const e = env || {};
  const idb = createIndexedDbAdapter({ indexedDB: e.indexedDB });
  const ls = createLocalStorageAdapter(e.localStorage);
  if (idb && ls) return createFallbackAdapter(idb, ls);
  return idb || ls || createMemoryAdapter();
}

/* ------------------------------------------------------------------------------------------------
 * Slot API
 * ---------------------------------------------------------------------------------------------- */
function errCode(e) {
  const n = e && (e.name || '');
  const m = e && (e.message || '');
  if (/quota/i.test(n) || /quota/i.test(m) || (e && e.code === 22)) return 'quota';
  return 'storage';
}

/** Kaydı slota yazar. save: serializeGame çıktısı. → {ok, bytes} | {ok:false, code:'slot'|'quota'|'storage'|'format'} */
export async function saveToSlot(adapter, slot, save) {
  const s = normalizeSlot(slot);
  if (!s) return { ok: false, code: 'slot' };
  let json;
  try {
    json = JSON.stringify(save);
  } catch {
    return { ok: false, code: 'format' };
  }
  if (typeof json !== 'string' || json.length < 2) return { ok: false, code: 'format' };
  try {
    const existing = await adapter.list(SAVE_KEY_PREFIX);
    if (existing.indexOf(SAVE_KEY_PREFIX + s) < 0 && existing.length >= MAX_SLOTS) return { ok: false, code: 'full' };
    await adapter.set(SAVE_KEY_PREFIX + s, json);
  } catch (e) {
    return { ok: false, code: errCode(e) };
  }
  const summary = summarizeSave(save);
  summary.bytes = estimateSaveSize(save);
  try {
    await adapter.set(META_KEY_PREFIX + s, JSON.stringify(summary));
  } catch {
    // özet yazılamadı: listede kayıttan türetilir
  }
  return { ok: true, bytes: summary.bytes, slot: s };
}

/** Slotu okur ve doğrular. → deserializeGame sonucu + {slot, raw}; yoksa {ok:false, code:'missing'}. */
export async function loadFromSlot(adapter, slot, opts) {
  const s = normalizeSlot(slot);
  if (!s) return { ok: false, code: 'slot' };
  let raw;
  try {
    raw = await adapter.get(SAVE_KEY_PREFIX + s);
  } catch {
    return { ok: false, code: 'storage' };
  }
  if (raw === null || raw === undefined) return { ok: false, code: 'missing' };
  const r = deserializeGame(raw, opts);
  r.slot = s;
  r.bytes = raw.length;
  return r;
}

/** Tüm slotlar, en yeni önce: [{slot, summary:{name,seed,worldCode,mode,playTime,savedAt,zone,level,bytes}}]. */
export async function listSlots(adapter) {
  let keys;
  try {
    keys = await adapter.list(SAVE_KEY_PREFIX);
  } catch {
    return [];
  }
  const out = [];
  for (let i = 0; i < keys.length && out.length < MAX_SLOTS; i++) {
    const slot = keys[i].slice(SAVE_KEY_PREFIX.length);
    if (!SLOT_RE.test(slot)) continue;
    let summary = null;
    try {
      const m = await adapter.get(META_KEY_PREFIX + slot);
      if (m) summary = JSON.parse(m);
    } catch {
      summary = null;
    }
    if (!summary || typeof summary !== 'object') {
      try {
        const raw = await adapter.get(keys[i]);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
          summary = summarizeSave(parsed);
          summary.bytes = raw.length;
        }
      } catch {
        summary = null;
      }
    }
    if (summary) out.push({ slot, summary });
  }
  out.sort((a, b) => (b.summary.savedAt || 0) - (a.summary.savedAt || 0) || (a.slot < b.slot ? -1 : 1));
  return out;
}

export async function deleteSlot(adapter, slot) {
  const s = normalizeSlot(slot);
  if (!s) return { ok: false, code: 'slot' };
  try {
    await adapter.remove(SAVE_KEY_PREFIX + s);
    try {
      await adapter.remove(META_KEY_PREFIX + s);
    } catch {
      // özet silinemedi
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'storage' };
  }
}
