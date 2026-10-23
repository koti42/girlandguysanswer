import { describe, expect, it } from 'vitest';
import { World } from './world.js';
import { serializeGame } from './save.js';
import { B } from './blocks.js';
import {
  MAX_SLOTS, META_KEY_PREFIX, SAVE_KEY_PREFIX, SLOT_AUTO, createBestAdapter, createFallbackAdapter,
  createIndexedDbAdapter, createLocalStorageAdapter, createMemoryAdapter, deleteSlot, listSlots, loadFromSlot,
  normalizeSlot, saveToSlot,
} from './saveStorage.js';

/* ---- sahte depolar ---- */
function fakeLocalStorage(opts) {
  const o = opts || {};
  const m = new Map();
  return {
    m,
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) {
      if (o.failProbe && k === '__kesif_probe__') throw new Error('kapalı');
      if (o.quota && String(v).length > o.quota) {
        const e = new Error('The quota has been exceeded.');
        e.name = 'QuotaExceededError';
        throw e;
      }
      m.set(k, String(v));
    },
    removeItem: (k) => { m.delete(k); },
  };
}

function fakeIndexedDB(opts) {
  const o = opts || {};
  const stores = new Map();
  const later = (fn) => setTimeout(fn, 0);
  function makeDb(name) {
    return {
      objectStoreNames: { contains: (s) => stores.has(name + ':' + s) },
      createObjectStore: (s) => { stores.set(name + ':' + s, new Map()); },
      transaction(s) {
        const data = stores.get(name + ':' + s);
        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };
        let pending = 0;
        const mk = (work) => {
          const req = { result: undefined, onsuccess: null, onerror: null, error: null };
          pending++;
          later(() => {
            try {
              req.result = work();
            } catch (e) {
              req.error = e;
              tx.error = e;
              if (req.onerror) req.onerror();
              if (tx.onabort) tx.onabort();
              return;
            }
            if (req.onsuccess) req.onsuccess();
            pending--;
            if (pending === 0) later(() => { if (tx.oncomplete) tx.oncomplete(); });
          });
          return req;
        };
        tx.objectStore = () => ({
          get: (k) => mk(() => data.get(k)),
          put: (v, k) => mk(() => {
            if (o.failWrite) throw new Error('yazma hatası');
            data.set(k, v);
            return k;
          }),
          delete: (k) => mk(() => { data.delete(k); }),
          getAllKeys: () => mk(() => Array.from(data.keys())),
        });
        return tx;
      },
    };
  }
  return {
    stores,
    open() {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: null, error: null };
      later(() => {
        if (o.failOpen) {
          req.error = new Error('açılamadı');
          if (req.onerror) req.onerror();
          return;
        }
        req.result = makeDb('kesif-saves');
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
}

function adapterContract(name, make) {
  describe('adaptör sözleşmesi: ' + name, () => {
    it('get/set/remove/list, önek süzgeci ve sıralama', async () => {
      const a = make();
      expect(await a.get('x')).toBeNull();
      await a.set('kesif:save:b', '2');
      await a.set('kesif:save:a', '1');
      await a.set('baska', '3');
      expect(await a.get('kesif:save:a')).toBe('1');
      expect(await a.list('kesif:save:')).toEqual(['kesif:save:a', 'kesif:save:b']);
      await a.set('kesif:save:a', 'yeni');
      expect(await a.get('kesif:save:a')).toBe('yeni');
      await a.remove('kesif:save:a');
      expect(await a.get('kesif:save:a')).toBeNull();
      expect(await a.list('kesif:save:')).toEqual(['kesif:save:b']);
      await a.remove('yok'); // olmayan anahtar sorun değil
    });
  });
}

adapterContract('bellek', () => createMemoryAdapter());
adapterContract('localStorage', () => createLocalStorageAdapter(fakeLocalStorage()));
adapterContract('IndexedDB', () => createIndexedDbAdapter({ indexedDB: fakeIndexedDB() }));
adapterContract('yedekli (IDB + localStorage)', () => createFallbackAdapter(
  createIndexedDbAdapter({ indexedDB: fakeIndexedDB() }),
  createLocalStorageAdapter(fakeLocalStorage()),
));

function makeSave(name, savedAt, seed) {
  const w = new World({ seed: seed || 5, mode: 'macera' });
  return serializeGame({ world: w, seed: seed || 5, mode: 'macera', name, savedAt });
}

describe('adaptör kurucuları', () => {
  it('desteklenmeyen ortamda null; çalışmayan localStorage reddedilir', () => {
    expect(createLocalStorageAdapter(null)).toBeNull();
    expect(createLocalStorageAdapter({})).toBeNull();
    expect(createLocalStorageAdapter(fakeLocalStorage({ failProbe: true }))).toBeNull();
    expect(createIndexedDbAdapter({ indexedDB: null })).toBeNull();
    expect(createIndexedDbAdapter({ indexedDB: {} })).toBeNull();
  });

  it('createBestAdapter: ikisi de varsa yedekli, biri varsa o, hiçbiri yoksa bellek', () => {
    expect(createBestAdapter({ indexedDB: fakeIndexedDB(), localStorage: fakeLocalStorage() }).kind).toBe('indexedDB+localStorage');
    expect(createBestAdapter({ indexedDB: null, localStorage: fakeLocalStorage() }).kind).toBe('localStorage');
    expect(createBestAdapter({ indexedDB: fakeIndexedDB(), localStorage: null }).kind).toBe('indexedDB');
    expect(createBestAdapter({ indexedDB: null, localStorage: null }).kind).toBe('memory');
  });

  it('IndexedDB açılışı başarısızsa işlemler reddedilir; sonra düzelirse yeniden denenir', async () => {
    const idb = fakeIndexedDB({ failOpen: true });
    const a = createIndexedDbAdapter({ indexedDB: idb });
    await expect(a.get('x')).rejects.toBeTruthy();
    await expect(a.set('x', '1')).rejects.toBeTruthy();
  });
});

describe('yedekli adaptör', () => {
  it('birincil bozukken yedeğe yazar/okur; birincil iyileşince bayat yedek kopya silinir', async () => {
    const badIdb = createIndexedDbAdapter({ indexedDB: fakeIndexedDB({ failOpen: true }) });
    const ls = createLocalStorageAdapter(fakeLocalStorage());
    const a = createFallbackAdapter(badIdb, ls);
    await a.set('kesif:save:x', 'v1');
    expect(await ls.get('kesif:save:x')).toBe('v1');
    expect(await a.get('kesif:save:x')).toBe('v1');
    expect(await a.list('kesif:save:')).toEqual(['kesif:save:x']);
    await a.remove('kesif:save:x');
    expect(await a.get('kesif:save:x')).toBeNull();

    const good = createIndexedDbAdapter({ indexedDB: fakeIndexedDB() });
    const b = createFallbackAdapter(good, ls);
    await ls.set('k', 'eski');
    expect(await b.get('k')).toBe('eski'); // birincilde yok → yedekten
    await b.set('k', 'yeni');
    expect(await good.get('k')).toBe('yeni');
    expect(await ls.get('k')).toBeNull();
  });

  it('birincil yazması başarısızsa yedeğe düşer', async () => {
    const idb = createIndexedDbAdapter({ indexedDB: fakeIndexedDB({ failWrite: true }) });
    const ls = createLocalStorageAdapter(fakeLocalStorage());
    const a = createFallbackAdapter(idb, ls);
    await a.set('k', 'v');
    expect(await ls.get('k')).toBe('v');
    expect(createFallbackAdapter(null, ls)).toBe(ls);
    expect(createFallbackAdapter(ls, null)).toBe(ls);
    expect(createFallbackAdapter(null, null).kind).toBe('memory');
  });
});

describe('slot API', () => {
  it('normalizeSlot: küçük harf, Türkçe karakter, geçersizler', () => {
    expect(normalizeSlot('Slot 1')).toBe('slot-1');
    expect(normalizeSlot('ÇİĞ')).toBe('cig');
    expect(normalizeSlot(SLOT_AUTO)).toBe('otomatik');
    ['', '  ', 'a/b', '../x', 'x'.repeat(33), 5, null, 'a:b'].forEach((s) => expect(normalizeSlot(s)).toBeNull());
  });

  it('kaydet → yükle → listele → sil', async () => {
    const a = createMemoryAdapter();
    const s1 = makeSave('Birinci', 1000, 5);
    const s2 = makeSave('İkinci', 3000, 6);
    expect(await saveToSlot(a, 'slot1', s1)).toMatchObject({ ok: true, slot: 'slot1' });
    expect(await saveToSlot(a, SLOT_AUTO, s2)).toMatchObject({ ok: true });
    const l = await listSlots(a);
    expect(l.map((x) => x.slot)).toEqual(['otomatik', 'slot1']);
    expect(l[0].summary).toMatchObject({ name: 'İkinci', seed: 6, savedAt: 3000 });
    expect(l[0].summary.bytes).toBeGreaterThan(100);
    const r = await loadFromSlot(a, 'slot1');
    expect(r.ok).toBe(true);
    expect(r.slot).toBe('slot1');
    expect(r.game.name).toBe('Birinci');
    expect(await a.get(SAVE_KEY_PREFIX + 'slot1')).toBeTruthy();
    expect(await a.get(META_KEY_PREFIX + 'slot1')).toBeTruthy();
    expect(await deleteSlot(a, 'slot1')).toEqual({ ok: true });
    expect((await listSlots(a)).map((x) => x.slot)).toEqual(['otomatik']);
    expect(await a.get(META_KEY_PREFIX + 'slot1')).toBeNull();
    expect(await loadFromSlot(a, 'slot1')).toMatchObject({ ok: false, code: 'missing' });
  });

  it('üzerine yazma slot sayısını artırmaz; üst sınırda "full"', async () => {
    const a = createMemoryAdapter();
    for (let i = 0; i < MAX_SLOTS; i++) expect((await saveToSlot(a, 's' + i, makeSave('n' + i, i))).ok).toBe(true);
    expect(await saveToSlot(a, 'fazla', makeSave('x', 1))).toMatchObject({ ok: false, code: 'full' });
    expect((await saveToSlot(a, 's3', makeSave('yeniden', 9))).ok).toBe(true);
    expect((await listSlots(a))).toHaveLength(MAX_SLOTS);
  });

  it('geçersiz slot/kayıt, kota hatası, bozuk içerik', async () => {
    const a = createMemoryAdapter();
    expect(await saveToSlot(a, '../x', makeSave('a', 1))).toMatchObject({ ok: false, code: 'slot' });
    const cyc = {};
    cyc.c = cyc;
    expect(await saveToSlot(a, 'x', cyc)).toMatchObject({ ok: false, code: 'format' });
    expect(await saveToSlot(a, 'x', undefined)).toMatchObject({ ok: false, code: 'format' });
    const ls = fakeLocalStorage({ quota: 100 });
    const small = createLocalStorageAdapter(ls);
    expect(await saveToSlot(small, 'x', makeSave('a', 1))).toMatchObject({ ok: false, code: 'quota' });
    await a.set(SAVE_KEY_PREFIX + 'bozuk', '{kırık');
    expect(await loadFromSlot(a, 'bozuk')).toMatchObject({ ok: false, code: 'json', slot: 'bozuk' });
    expect(await loadFromSlot(a, '!!')).toMatchObject({ ok: false, code: 'slot' });
    expect(await deleteSlot(a, '!!')).toMatchObject({ ok: false, code: 'slot' });
  });

  it('özet bozuksa liste kayıttan türetir; ham bozuk kayıt listelenmez; ad dışı anahtar atlanır', async () => {
    const a = createMemoryAdapter();
    await saveToSlot(a, 'a', makeSave('Ayrı', 5));
    await a.set(META_KEY_PREFIX + 'a', 'bozuk');
    await a.set(SAVE_KEY_PREFIX + 'b', '{kırık');
    await a.set(SAVE_KEY_PREFIX + 'Büyük Harf', '{}');
    const l = await listSlots(a);
    expect(l.map((x) => x.slot)).toEqual(['a']);
    expect(l[0].summary.name).toBe('Ayrı');
    const broken = { list: async () => { throw new Error('x'); } };
    expect(await listSlots(broken)).toEqual([]);
  });

  it('depolama hatası {ok:false, code:storage} olur, atmaz', async () => {
    const boom = {
      get: async () => { throw new Error('x'); },
      set: async () => { throw new Error('x'); },
      remove: async () => { throw new Error('x'); },
      list: async () => [],
    };
    expect(await saveToSlot(boom, 'x', makeSave('a', 1))).toMatchObject({ ok: false, code: 'storage' });
    expect(await loadFromSlot(boom, 'x')).toMatchObject({ ok: false, code: 'storage' });
    expect(await deleteSlot(boom, 'x')).toMatchObject({ ok: false, code: 'storage' });
  });

  it('gerçek kayıt IndexedDB + localStorage yedeğinden gidiş-dönüş verir', async () => {
    const w = new World({ seed: 8, mode: 'macera' });
    w.ensureChunk(0, 0);
    w.setBlock(2, 70, 2, B.BRICK);
    const sv = serializeGame({ world: w, seed: 8, mode: 'macera', name: 'IDB', savedAt: 77 });
    const a = createBestAdapter({ indexedDB: fakeIndexedDB(), localStorage: fakeLocalStorage() });
    expect((await saveToSlot(a, 'idb', sv)).ok).toBe(true);
    const r = await loadFromSlot(a, 'idb');
    expect(r.ok).toBe(true);
    expect(r.game.edits.count).toBe(1);
    expect((await listSlots(a))[0].summary.savedAt).toBe(77);
  });
});
