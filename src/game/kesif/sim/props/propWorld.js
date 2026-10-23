/*
 * KEŞİF sim/props — PropWorld: yüklü chunk'lardaki propların çalışma zamanı katmanı (saf; DOM/three yok, worker-güvenli).
 * Sözleşme KESIF_CITY_CONTRACT §6. Her boyut bağlamının (DimCtx) kendi PropWorld'ü ve ColliderIndex'i vardır.
 *
 *   const pw = new PropWorld({citySeed, colliders?:ColliderIndex, density?, planner?, getDef?, choiceUi?})
 *   pw.loadChunk(cx,cz) → eklenen prop sayısı       chunk'ın proplarını planlar, çarpışma+ışın kutularını kurar, kayıtlı durumu uygular
 *   pw.unloadChunk(cx,cz)                           durumu (varsayılandan farklıysa) saklar, kutuları siler
 *   pw.get(id) → Prop|null       pw.state(id) → int      pw.entry(id) → {prop,def,state,rflags,extra,tmp,…}|null
 *   pw.nearest(x,y,z,r,filter?) → Prop|null         en yakın prop (ışın kutusuna uzaklık); filter(prop, def) → bool
 *   pw.raycast(o,d,max) → {id,dist,t}|null          ışın = en yakın GİRİŞ (başlangıç kutunun içindeyse o kutu sayılmaz); eşitlikte küçük id
 *   pw.setState(id, state) → bool                   {kind:'setProp'} efekti için doğrudan durum
 *   pw.use(id, actor?) → Effect[]                   etkileşim: davranışın onUse'unu çalıştırır (menzil denetimi çağıranındır)
 *   pw.tick(dt) → Effect[]                          sabit adım: etkin davranışlar (zamanlayıcılar)
 *   pw.serialize() → {id36:[state,flags,extra?]}    YALNIZ varsayılandan farklı + kalıcı (volatile olmayan) olanlar; ≤ 40 KB
 *   pw.restore(o)                                   güvensiz girdi temizlenir; yüklü proplara hemen uygulanır, kalanlar chunk yüklenince
 *   pw.addDynamic(prop) / moveDynamic(id,x,y,z,yaw,vel?) / removeDynamic(id)    `dyn` proplar (kabin, araç): chunk'a bağlı değil
 *
 * Mutasyon yalnızca use()/tick()/restore() içindedir → belirlenimci. `version` yüklü küme değişince, `stateVersion` durum değişince artar
 * (render yeniden kurma/senkron göstergeleri).
 */
import { ColliderIndex } from './colliderIndex.js';
import {
  PROP_BY_T, hitBoxes, rotateBox, worldBoxes,
} from './propDefs.js';
import { propsForChunk } from './propPlan.js';
import { getPropBehavior, propHint } from './propBehaviors.js';
import './propBehaviorsInterior.js'; // Faz 2: iç mekân davranışlarını kaydeder (sit/open/toggle/read/buy/lockpad/elevator/dialog/pickup)
import { decodeProps, encodeProps, sanitizeExtra } from './propSave.js';

const EMPTY = Object.freeze([]);
const RAY_SEG = 6;
const RAY_CAP = 256;
const MAX_RAY = 256;

function chunkKey(cx, cz) {
  return ((cx + 1024) << 12) | (cz + 1024);
}

function defaultGetDef(t) {
  return PROP_BY_T[t] || null;
}

export class PropWorld {
  constructor(opts) {
    const o = opts || {};
    this.citySeed = (o.citySeed | 0) >>> 0;
    this.colliders = o.colliders === undefined ? new ColliderIndex() : o.colliders;
    this.density = o.density === undefined ? 1 : o.density;
    this.planner = typeof o.planner === 'function' ? o.planner : propsForChunk;
    this.getDef = typeof o.getDef === 'function' ? o.getDef : defaultGetDef;
    this.choiceUi = !!o.choiceUi;
    this.time = 0;
    this.version = 0;
    this.stateVersion = 0;
    this.duplicateIds = 0;
    this._entries = new Map();
    this._chunks = new Map();
    this._saved = new Map();
    this._hit = new ColliderIndex();
    this._active = new Set();
    this._order = 0;
    this._ctx = {
      time: 0, seed: this.citySeed, def: null, world: this, choiceUi: this.choiceUi,
    };
    this._qb = new Float64Array(RAY_CAP * 6);
    this._scratchBoxes = [];
  }

  get size() {
    return this._entries.size;
  }

  get chunkCount() {
    return this._chunks.size;
  }

  setChoiceUi(on) {
    this.choiceUi = !!on;
    this._ctx.choiceUi = this.choiceUi;
  }

  /* ---------------------------------------------------------------------------------------------- yükleme */
  _ctxFor(e) {
    const c = this._ctx;
    c.time = this.time;
    c.def = e.def;
    c.choiceUi = this.choiceUi;
    return c;
  }

  _install(prop, def, cx, cz, dyn) {
    const e = {
      prop, def, cx, cz, state: 0, rflags: 0, extra: undefined, tmp: null, order: 0, dyn: !!dyn, vel: null, ls: undefined, lb: 0,
    };
    this._entries.set(prop.id, e);
    return e;
  }

  _indexBoxes(e) {
    const p = e.prop;
    const d = e.def;
    if (this.colliders) {
      if (d.colliders.length > 0) {
        if (e.dyn) {
          const u = unionBox(worldBoxes(d, p.x, p.y, p.z, p.yaw, this._scratchBoxes));
          this.colliders.setDynamic(p.id, u, e.vel || null);
        } else if (!(d.openFree && e.state >= 1)) {
          this.colliders.add(p.id, worldBoxes(d, p.x, p.y, p.z, p.yaw, []));
        }
      }
    }
    const hb = hitBoxes(d);
    const wb = [];
    for (let i = 0; i < hb.length; i++) {
      const r = rotateBox(hb[i], p.yaw, [0, 0, 0, 0, 0, 0]);
      r[0] += p.x; r[3] += p.x; r[1] += p.y; r[4] += p.y; r[2] += p.z; r[5] += p.z;
      wb.push(r);
    }
    if (e.dyn) this._hit.setDynamic(p.id, unionBox(wb), null);
    else this._hit.add(p.id, wb);
  }

  _applySaved(e, row) {
    const st = row[0];
    e.state = st < e.def.states ? st : 0;
    e.rflags = row[1];
    e.extra = row.length > 2 ? row[2] : undefined;
    e.order = ++this._order;
  }

  /** chunk'ı yükler (zaten yüklüyse 0 döner). */
  loadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    if (this._chunks.has(key)) return 0;
    const list = this.planner(this.citySeed, cx, cz, { density: this.density });
    const ids = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const def = this.getDef(p.t);
      if (!def) continue;
      if (this._entries.has(p.id)) {
        this.duplicateIds++;
        continue;
      }
      const e = this._install(p, def, cx, cz, false);
      const sv = this._saved.get(p.id);
      if (sv) {
        this._applySaved(e, sv);
        this._saved.delete(p.id);
      }
      this._indexBoxes(e);
      ids.push(p.id);
    }
    this._chunks.set(key, { cx, cz, ids });
    this.version++;
    return ids.length;
  }

  /** Durum ≥ 1 iken çarpışması kalkan tanımlar (def.openFree: açık kapı, katlı masa): kutuları durumla eşler. */
  _syncCollider(e) {
    if (!this.colliders || !e.def.openFree || e.dyn || e.def.colliders.length === 0) return;
    if (e.state >= 1) this.colliders.remove(e.prop.id);
    else this.colliders.add(e.prop.id, worldBoxes(e.def, e.prop.x, e.prop.y, e.prop.z, e.prop.yaw, []));
  }

  _persistent(e) {
    if (e.dyn || e.def.transient) return false; // transient: zamanlı cihazlar (duş, şarj…) kayda girmez, yüklemede sıfırlanır
    const b = e.def.interact ? getPropBehavior(e.def.interact.kind) : null;
    if (b && b.volatile) return false;
    return e.state !== 0 || e.rflags !== 0 || e.extra !== undefined;
  }

  unloadChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const ch = this._chunks.get(key);
    if (!ch) return false;
    for (let i = 0; i < ch.ids.length; i++) {
      const id = ch.ids[i];
      const e = this._entries.get(id);
      if (!e) continue;
      if (this._persistent(e)) {
        this._saved.set(id, e.extra === undefined ? [e.state, e.rflags] : [e.state, e.rflags, e.extra]);
      }
      if (this.colliders) this.colliders.remove(id);
      this._hit.remove(id);
      this._active.delete(id);
      this._entries.delete(id);
    }
    this._chunks.delete(key);
    this.version++;
    return true;
  }

  /** Yüklü tüm chunk'ları boşaltır (boyut değişimi). */
  clear() {
    const keys = Array.from(this._chunks.values());
    for (let i = 0; i < keys.length; i++) this.unloadChunk(keys[i].cx, keys[i].cz);
    const dyn = [];
    this._entries.forEach((e, id) => { if (e.dyn) dyn.push(id); });
    for (let i = 0; i < dyn.length; i++) this.removeDynamic(dyn[i]);
  }

  /* ---------------------------------------------------------------------------------------------- sorgular */
  has(id) {
    return this._entries.has(id >>> 0);
  }

  get(id) {
    const e = this._entries.get(id >>> 0);
    return e ? e.prop : null;
  }

  entry(id) {
    return this._entries.get(id >>> 0) || null;
  }

  state(id) {
    const e = this._entries.get(id >>> 0);
    return e ? e.state : 0;
  }

  /** chunk'ın prop dizisi (yüklü değilse boş). Çağıran değiştirmemeli. */
  chunkProps(cx, cz) {
    const ch = this._chunks.get(chunkKey(cx, cz));
    if (!ch) return EMPTY;
    const out = [];
    for (let i = 0; i < ch.ids.length; i++) {
      const e = this._entries.get(ch.ids[i]);
      if (e) out.push(e.prop);
    }
    return out;
  }

  forEachChunk(cb) {
    this._chunks.forEach((ch) => cb(ch.cx, ch.cz, ch.ids));
  }

  forEachEntry(cb) {
    this._entries.forEach(cb);
  }

  forEachDynamic(cb) {
    this._entries.forEach((e) => { if (e.dyn) cb(e); });
  }

  hint(id) {
    const e = this._entries.get(id >>> 0);
    if (!e) return '';
    return propHint(e.def, e, e.prop, this._ctxFor(e));
  }

  nearest(x, y, z, r, filter) {
    if (!(r > 0)) return null;
    const qb = this._qb;
    const n = this._hit.queryRaw(x - r, y - r, z - r, x + r, y + r, z + r, qb, RAY_CAP);
    let best = null;
    let bestD = r * r;
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      const dx = x < qb[o] ? qb[o] - x : x > qb[o + 3] ? x - qb[o + 3] : 0;
      const dy = y < qb[o + 1] ? qb[o + 1] - y : y > qb[o + 4] ? y - qb[o + 4] : 0;
      const dz = z < qb[o + 2] ? qb[o + 2] - z : z > qb[o + 5] ? z - qb[o + 5] : 0;
      const d2 = dx * dx + dy * dy + dz * dz;
      const id = this._hit.ids[i];
      if (d2 > bestD || (d2 === bestD && best !== null && id > best.id)) continue;
      const e = this._entries.get(id);
      if (!e) continue;
      if (filter && !filter(e.prop, e.def)) continue;
      best = e.prop;
      bestD = d2;
    }
    return best;
  }

  /**
   * Işın: o {x,y,z}, d {x,y,z} (birim olmasa da olur; dist parametrik değil gerçek uzunluktur), max uzunluk.
   * Sonuç {id, dist, t}|null; t = prop türü. Başlangıcı bir kutunun içinde olan ışın o kutuyu "vurmaz" (arkaya bakan oyuncu kendi
   * yanındaki prop'u kullanmasın); kutuya giriş uzaklığı en küçük olan kazanır, eşitlikte küçük id.
   */
  raycast(o, d, max) {
    let len = Math.sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    if (!(len > 1e-12) || !(max > 0) || !Number.isFinite(max)) return null;
    if (max > MAX_RAY) max = MAX_RAY;
    const dx = d.x / len;
    const dy = d.y / len;
    const dz = d.z / len;
    len = 1;
    let bestT = Infinity;
    let bestId = -1;
    const qb = this._qb;
    const hit = this._hit;
    for (let t0 = 0; t0 < max; t0 += RAY_SEG) {
      const t1 = t0 + RAY_SEG < max ? t0 + RAY_SEG : max;
      const ax = o.x + dx * t0;
      const ay = o.y + dy * t0;
      const az = o.z + dz * t0;
      const bx = o.x + dx * t1;
      const by = o.y + dy * t1;
      const bz = o.z + dz * t1;
      const n = hit.queryRaw(
        Math.min(ax, bx) - 1e-6, Math.min(ay, by) - 1e-6, Math.min(az, bz) - 1e-6,
        Math.max(ax, bx) + 1e-6, Math.max(ay, by) + 1e-6, Math.max(az, bz) + 1e-6, qb, RAY_CAP,
      );
      for (let i = 0; i < n; i++) {
        const k = i * 6;
        const tt = slab(o.x, o.y, o.z, dx, dy, dz, qb[k], qb[k + 1], qb[k + 2], qb[k + 3], qb[k + 4], qb[k + 5]);
        if (tt < 0 || tt > max) continue;
        const id = hit.ids[i];
        if (tt < bestT || (tt === bestT && id < bestId)) {
          bestT = tt;
          bestId = id;
        }
      }
      if (bestT <= t1) break;
    }
    if (bestId < 0) return null;
    const e = this._entries.get(bestId);
    return { id: bestId, dist: bestT, t: e ? e.prop.t : 0 };
  }

  /* ---------------------------------------------------------------------------------------------- etkileşim */
  _apply(e, res) {
    if (!res) return;
    let persisted = false;
    if (res.state !== undefined && Number.isInteger(res.state) && res.state >= 0 && res.state < e.def.states && res.state !== e.state) {
      e.state = res.state;
      this._syncCollider(e);
      persisted = true;
      this.stateVersion++;
    }
    if (res.rflags !== undefined && Number.isInteger(res.rflags) && res.rflags >= 0 && res.rflags <= 0xffff && res.rflags !== e.rflags) {
      e.rflags = res.rflags;
      persisted = true;
    }
    if (res.extra !== undefined) {
      const ex = res.extra === null ? undefined : sanitizeExtra(res.extra);
      if (res.extra === null || ex !== undefined) {
        e.extra = ex;
        persisted = true;
      }
    }
    if (persisted) e.order = ++this._order;
    if (res.tmp !== undefined) e.tmp = res.tmp;
    if (res.active === true) this._active.add(e.prop.id);
    else if (res.active === false) this._active.delete(e.prop.id);
  }

  /** setProp efekti: durumu doğrudan ayarlar (geçerli aralık 0..states-1). Değişince true. */
  setState(id, state) {
    const e = this._entries.get(id >>> 0);
    if (!e || !Number.isInteger(state) || state < 0 || state >= e.def.states) return false;
    if (state === e.state) return false;
    e.state = state;
    this._syncCollider(e);
    e.order = ++this._order;
    this.stateVersion++;
    return true;
  }

  use(id, actor) {
    const e = this._entries.get(id >>> 0);
    if (!e || !e.def.interact) return EMPTY;
    const b = getPropBehavior(e.def.interact.kind);
    if (!b) return EMPTY;
    const res = b.onUse(this._ctxFor(e), e.prop, e, actor || null);
    this._apply(e, res);
    return res && Array.isArray(res.effects) ? res.effects : EMPTY;
  }

  tick(dt) {
    if (!(dt > 0)) return EMPTY;
    this.time += dt;
    if (this._active.size === 0) return EMPTY;
    let out = null;
    const ids = Array.from(this._active);
    for (let i = 0; i < ids.length; i++) {
      const e = this._entries.get(ids[i]);
      if (!e) {
        this._active.delete(ids[i]);
        continue;
      }
      const b = e.def.interact ? getPropBehavior(e.def.interact.kind) : null;
      if (!b || !b.tick) {
        this._active.delete(ids[i]);
        continue;
      }
      const res = b.tick(this._ctxFor(e), e.prop, e, dt);
      this._apply(e, res);
      if (res && res.effects && res.effects.length) {
        if (out === null) out = [];
        for (let k = 0; k < res.effects.length; k++) out.push(res.effects[k]);
      }
    }
    return out === null ? EMPTY : out;
  }

  /* ---------------------------------------------------------------------------------------------- kayıt */
  serialize(maxBytes) {
    const map = new Map();
    this._saved.forEach((row, id) => {
      map.set(id, { state: row[0], rflags: row[1], extra: row.length > 2 ? row[2] : undefined, order: 0 });
    });
    this._entries.forEach((e, id) => {
      if (this._persistent(e)) map.set(id, { state: e.state, rflags: e.rflags, extra: e.extra, order: e.order });
    });
    return encodeProps(map, maxBytes);
  }

  restore(obj) {
    const rows = decodeProps(obj);
    this._saved.clear();
    this._active.clear();
    this._entries.forEach((e, id) => {
      const row = rows.get(id);
      if (row) {
        this._applySaved(e, row);
        rows.delete(id);
      } else {
        e.state = 0;
        e.rflags = 0;
        e.extra = undefined;
      }
      this._syncCollider(e);
      e.tmp = null;
    });
    rows.forEach((row, id) => { this._saved.set(id, row); });
    this.stateVersion++;
  }

  /* ---------------------------------------------------------------------------------------------- dinamik */
  addDynamic(prop, vel) {
    if (!prop || this._entries.has(prop.id >>> 0)) return false;
    const def = this.getDef(prop.t);
    if (!def) return false;
    const p = {
      id: prop.id >>> 0, t: prop.t, x: +prop.x, y: +prop.y, z: +prop.z, yaw: prop.yaw & 3, variant: (prop.variant | 0) & 7, flags: prop.flags >>> 0,
    };
    if (!Number.isFinite(p.x + p.y + p.z)) return false;
    const e = this._install(p, def, 0, 0, true);
    e.vel = vel || null;
    this._indexBoxes(e);
    this.version++;
    return true;
  }

  moveDynamic(id, x, y, z, yaw, vel) {
    const e = this._entries.get(id >>> 0);
    if (!e || !e.dyn || !Number.isFinite(x + y + z)) return false;
    const p = e.prop;
    p.x = x; p.y = y; p.z = z;
    if (yaw !== undefined) p.yaw = yaw & 3;
    e.vel = vel || null;
    this._indexBoxes(e);
    this.stateVersion++;
    return true;
  }

  removeDynamic(id) {
    id = id >>> 0;
    const e = this._entries.get(id);
    if (!e || !e.dyn) return false;
    if (this.colliders) this.colliders.remove(id);
    this._hit.remove(id);
    this._active.delete(id);
    this._entries.delete(id);
    this.version++;
    return true;
  }
}

function unionBox(boxes) {
  let x0 = Infinity; let y0 = Infinity; let z0 = Infinity;
  let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b[0] < x0) x0 = b[0];
    if (b[1] < y0) y0 = b[1];
    if (b[2] < z0) z0 = b[2];
    if (b[3] > x1) x1 = b[3];
    if (b[4] > y1) y1 = b[4];
    if (b[5] > z1) z1 = b[5];
  }
  return [x0, y0, z0, x1, y1, z1];
}

/** Işın–kutu (slab). Dönüş: giriş uzaklığı ≥ 0 | -1 (ıskalama ya da başlangıç kutunun içinde). */
export function slab(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity;
  let tmax = Infinity;
  if (dx !== 0) {
    const a = (x0 - ox) / dx;
    const b = (x1 - ox) / dx;
    tmin = a < b ? a : b;
    tmax = a < b ? b : a;
  } else if (ox <= x0 || ox >= x1) return -1;
  if (dy !== 0) {
    const a = (y0 - oy) / dy;
    const b = (y1 - oy) / dy;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (lo > tmin) tmin = lo;
    if (hi < tmax) tmax = hi;
  } else if (oy <= y0 || oy >= y1) return -1;
  if (dz !== 0) {
    const a = (z0 - oz) / dz;
    const b = (z1 - oz) / dz;
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    if (lo > tmin) tmin = lo;
    if (hi < tmax) tmax = hi;
  } else if (oz <= z0 || oz >= z1) return -1;
  if (tmax < tmin || tmax < 0) return -1;
  return tmin >= 0 ? tmin : -1;
}
