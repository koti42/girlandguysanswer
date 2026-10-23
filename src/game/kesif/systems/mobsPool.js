/*
 * KEŞİF mobs sistemi — havuz yardımcıları (saf; three/DOM yok).
 *
 *   createKeyedSlots(cap, subs=1)    nesne→yuva eşlemesi (kare başına ayırma yok). Kullanım:
 *       ks.begin(); for (...) { const s = ks.use(src, sub); if (s) { if (s.fresh) kur(s.idx); güncelle(s.idx); } } ks.end(onFree);
 *       s.fresh: yuva bu karede yeni atandı (doku/ölçü yeniden kurulmalı).  ks.slots[idx]  dış dizilerle (mesh) aynı indeks.
 *   createFloaterSync(cap)           hasar sayıları (em.numbers.list) → yuvalar; yeniden kullanılan sayı nesnesini (t geri sarar) ve metin
 *                                    değişimini "yeni" sayar. En yeni sayılar yuva önceliğine sahiptir.
 *   createFreeList(make, cap)        basit nesne havuzu (acquire/release).
 */

export function createKeyedSlots(cap, subs) {
  const nSubs = subs > 0 ? subs : 1;
  const maps = [];
  for (let i = 0; i < nSubs; i++) maps.push(new Map());
  const slots = [];
  const free = [];
  for (let i = 0; i < cap; i++) {
    slots.push({
      idx: i, src: null, sub: 0, fresh: false, seen: false, used: false, data: 0,
    });
    free.push(cap - 1 - i);
  }
  let active = 0;
  return {
    slots,
    get active() { return active; },
    begin() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].seen = false;
        slots[i].fresh = false;
      }
    },
    use(src, sub) {
      const k = sub > 0 && sub < nSubs ? sub : 0;
      let s = maps[k].get(src);
      if (s) {
        s.seen = true;
        return s;
      }
      if (free.length === 0) return null;
      s = slots[free.pop()];
      s.src = src;
      s.sub = k;
      s.fresh = true;
      s.seen = true;
      s.used = true;
      maps[k].set(src, s);
      active++;
      return s;
    },
    /** Görülmeyen yuvaları serbest bırakır; onFree(slot) her biri için. */
    end(onFree) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.used || s.seen) continue;
        if (onFree) onFree(s);
        maps[s.sub].delete(s.src);
        s.src = null;
        s.used = false;
        free.push(s.idx);
        active--;
      }
    },
    releaseAll(onFree) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.used) continue;
        if (onFree) onFree(s);
        maps[s.sub].delete(s.src);
        s.src = null;
        s.used = false;
        free.push(s.idx);
      }
      active = 0;
    },
    has(src, sub) {
      return maps[sub > 0 && sub < nSubs ? sub : 0].has(src);
    },
  };
}

/**
 * Hasar sayısı yuvaları. list: DamageNumbers.list (en yeni sonda). sync.update(list) sonrası sync.slots[i]:
 * {used, src, fresh, text} — fresh ise sprite dokusu yeniden çizilmeli. Dönüş: etkin yuva sayısı.
 */
export function createFloaterSync(cap) {
  const slots = [];
  for (let i = 0; i < cap; i++) {
    slots.push({
      idx: i, used: false, src: null, fresh: false, text: '', lastT: 0, kind: '',
    });
  }
  let active = 0;
  const holds = (list, src) => {
    for (let i = 0; i < list.length; i++) if (list[i] === src) return true;
    return false;
  };
  return {
    slots,
    get active() { return active; },
    update(list) {
      // bitenleri bırak
      active = 0;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        s.fresh = false;
        if (s.used && !holds(list, s.src)) {
          s.used = false;
          s.src = null;
        }
      }
      // yeniden kullanılan nesne (t geri sardı) ya da metni değişen: yeni say
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.used) continue;
        const n = s.src;
        if (n.t + 1e-6 < s.lastT || n.text !== s.text || n.kind !== s.kind) s.fresh = true;
        s.lastT = n.t;
        s.text = n.text;
        s.kind = n.kind;
      }
      // en yeniden eskiye: atanmamışlara yuva ver
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i];
        let have = false;
        let free = null;
        for (let k = 0; k < slots.length; k++) {
          const s = slots[k];
          if (s.used && s.src === n) {
            have = true;
            break;
          }
          if (!s.used && free === null) free = s;
        }
        if (have) continue;
        if (free === null) break;
        free.used = true;
        free.src = n;
        free.fresh = true;
        free.text = n.text;
        free.kind = n.kind;
        free.lastT = n.t;
      }
      for (let i = 0; i < slots.length; i++) if (slots[i].used) active++;
      return active;
    },
    clear() {
      for (let i = 0; i < slots.length; i++) {
        slots[i].used = false;
        slots[i].src = null;
        slots[i].fresh = false;
      }
      active = 0;
    },
  };
}

export function createFreeList(make, cap) {
  const free = [];
  return {
    acquire() {
      return free.length > 0 ? free.pop() : make();
    },
    /** Havuza geri verir; doluysa false (çağıran dispose eder). */
    release(x) {
      if (free.length >= cap) return false;
      free.push(x);
      return true;
    },
    get size() { return free.length; },
    drain(fn) {
      while (free.length > 0) fn(free.pop());
    },
  };
}
