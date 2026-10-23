/*
 * KEŞİF — sistem kayıt defteri (saf mantık; three/DOM yok, node'da test edilir).
 *
 *   const reg = createSystemRegistry();
 *   reg.add(sys)            doğrular; ad benzersiz olmalı; `order` küçük olan önce (eşitse eklenme sırası)
 *   reg.get(name) / reg.list() / reg.has(name)
 *   reg.remove(name)
 *   reg.mergeApi(base, G)   base üstüne her sistemin api(G) çıktısını birleştirir; AD ÇAKIŞMASI = Error
 *   reg.serialize(G) → {ad: obj}        reg.restore(G, map)
 *
 * Kancaları çağırmak çekirdeğin işidir (hata yalıtımı gameCtx.callSafe ile); burada yalnızca düzen ve birleştirme var.
 */

const HOOKS = ['init', 'fixedUpdate', 'frameUpdate', 'onEvent', 'onAction', 'api', 'serialize', 'restore', 'dispose'];

export function createSystemRegistry() {
  let sorted = [];
  const byName = new Map();
  let seq = 0;

  function resort() {
    sorted = Array.from(byName.values());
    sorted.sort((a, b) => (a.order - b.order) || (a._seq - b._seq));
  }

  return {
    add(sys) {
      if (!sys || typeof sys !== 'object') throw new TypeError('addSystem: sistem nesnesi gerekli');
      if (typeof sys.name !== 'string' || sys.name === '') throw new TypeError('addSystem: name gerekli');
      if (byName.has(sys.name)) throw new Error('addSystem: "' + sys.name + '" adlı sistem zaten kayıtlı');
      for (let i = 0; i < HOOKS.length; i++) {
        const h = HOOKS[i];
        if (sys[h] !== undefined && typeof sys[h] !== 'function') throw new TypeError('addSystem: ' + sys.name + '.' + h + ' fonksiyon olmalı');
      }
      if (sys.order !== undefined && !Number.isFinite(sys.order)) throw new TypeError('addSystem: ' + sys.name + '.order sayı olmalı');
      if (sys.order === undefined) sys.order = 0;
      Object.defineProperty(sys, '_seq', { value: seq++, enumerable: false, configurable: true });
      byName.set(sys.name, sys);
      resort();
      return sys;
    },
    remove(name) {
      const ok = byName.delete(name);
      if (ok) resort();
      return ok;
    },
    get(name) {
      return byName.get(name) || null;
    },
    has(name) {
      return byName.has(name);
    },
    /** order sırasıyla dizi (paylaşılan; değiştirme). */
    list() {
      return sorted;
    },
    /**
     * base'in üstüne sistem yöntemlerini ekler. Aynı adı iki sistem (ya da sistem ve çekirdek) verirse hata.
     * @param {object} base çekirdek api'si
     * @param {object} G bağlam (api(G) çağrılır)
     * @param {(sys:object, fn:Function)=>any} [guard] hata yalıtımı sarmalayıcısı
     * @param {Iterable<string>} [soft] çekirdeğin YEDEK olarak sunduğu adlar: bir sistem aynı adı verirse sistem kazanır (çakışma sayılmaz)
     */
    mergeApi(base, G, guard, soft) {
      const out = base;
      const owner = {};
      const softSet = {};
      if (soft) for (const k of soft) softSet[k] = true;
      Object.keys(out).forEach((k) => { owner[k] = softSet[k] === true ? 'yedek' : 'çekirdek'; });
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (typeof s.api !== 'function') continue;
        const part = guard ? guard(s, () => s.api(G)) : s.api(G);
        if (!part || typeof part !== 'object') continue;
        const keys = Object.keys(part);
        for (let k = 0; k < keys.length; k++) {
          const key = keys[k];
          if (Object.prototype.hasOwnProperty.call(owner, key) && owner[key] !== 'yedek') {
            throw new Error('api çakışması: "' + key + '" hem ' + owner[key] + ' hem ' + s.name + ' sisteminde tanımlı');
          }
          owner[key] = s.name;
          out[key] = part[key];
        }
      }
      return out;
    },
    serialize(G, guard) {
      const out = {};
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (typeof s.serialize !== 'function') continue;
        const v = guard ? guard(s, () => s.serialize(G)) : s.serialize(G);
        if (v !== undefined && v !== null) out[s.name] = v;
      }
      return out;
    },
    restore(G, map, guard) {
      if (!map || typeof map !== 'object') return;
      for (let i = 0; i < sorted.length; i++) {
        const s = sorted[i];
        if (typeof s.restore !== 'function') continue;
        if (!Object.prototype.hasOwnProperty.call(map, s.name)) continue;
        if (guard) guard(s, () => s.restore(G, map[s.name]));
        else s.restore(G, map[s.name]);
      }
    },
  };
}
