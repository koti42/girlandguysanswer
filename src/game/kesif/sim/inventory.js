/*
 * KEŞİF sim — Envanter (saf; DOM yok).
 *
 *   new Inventory({size:36, hotbar:9, armor:4, infinite:false})
 *   Slot: null | {item, count, dur?}   (dur yalnız dayanıklılığı olan eşyada; bu eşya yığılmaz)
 *   0..hotbar-1 = hotbar, devamı ana çanta. Zırh ayrı dizide: [kafa, göğüs, bacak, ayak].
 *
 *   add(key,count)→kalan  remove(key,count)→bool  count(key)  has(list)  craft(recipeId, stationSet)→bool
 *   swap(i,j)  moveStack(from,to)  split(i,to?)→hedef|-1  selected  held()  damageHeld(n)→kırıldı mı
 *   equip(i)  unequip(a)  armorDefense()  toJSON()  fromJSON(data)  onChange(cb)→iptal
 *
 * Ocak tarifleri yakıt ister: envanter `heat` (taşınan ısı) tutar; yakıt eşyası yakılınca ısıya eklenir.
 * infinite (yaratıcı mod): remove/damageHeld/craft tüketmez.
 */
import { BUILD_GROUPS, PLACEABLE_IDS, BLOCKS } from './blocks.js';
import {
  ARMOR_SLOTS, FUEL_HEAT, canCraft, getRecipe, itemByKey, stationAvailable,
} from './items.js';
import { cloneEnch, sanitizeEnch } from './magicEnchant.js';
import { maxCharge, sanitizeCharge } from './techCharge.js';

export const INVENTORY_VERSION = 1;
const MAX_HEAT = 1000;

/**
 * Slot: {item,count,dur?,ench?,charge?}. ench yalnız dayanıklılığı olan (yığılmayan) eşyada, temizlenmiş {anahtar:seviye}.
 * charge (teknoloji, techCharge.js): `tech.chargeMax` taşıyan eşyada tamsayı 0..max; verilmezse başlangıç şarjı.
 */
function makeSlot(it, count, dur, ench, charge) {
  const s = { item: it.key, count };
  if (it.durability) {
    s.dur = dur === undefined ? it.durability : dur;
    const e = ench ? sanitizeEnch(ench, it.key) : null;
    if (e) s.ench = e;
  }
  if (it.tech && it.tech.chargeMax > 0) s.charge = sanitizeCharge(charge, it.key);
  return s;
}
function cloneSlot(s) {
  if (!s) return null;
  const c = s.dur === undefined ? { item: s.item, count: s.count } : { item: s.item, count: s.count, dur: s.dur };
  if (s.ench) c.ench = cloneEnch(s.ench);
  if (s.charge !== undefined) c.charge = s.charge;
  return c;
}
function clampInt(v, lo, hi) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return n < lo ? lo : n > hi ? hi : n;
}
/** Tarif girdisi {item,count} ya da [item,count] olabilir. */
function pairOf(p) {
  return Array.isArray(p) ? { item: p[0], count: p[1] } : p;
}

export class Inventory {
  constructor(opts = {}) {
    const o = opts || {};
    this.size = clampInt(o.size === undefined ? 36 : o.size, 1, 256);
    this.hotbarSize = clampInt(o.hotbar === undefined ? 9 : o.hotbar, 1, this.size);
    this.armorSize = clampInt(o.armor === undefined ? 4 : o.armor, 0, 8);
    this.infinite = !!o.infinite;
    this.slots = new Array(this.size).fill(null);
    this.armor = new Array(this.armorSize).fill(null);
    this.heat = 0;
    this._selected = 0;
    this._listeners = [];
    this._rn = 0x6d2b79f5; // Dayanıklılık büyüsü için belirlenimci zar
  }

  /* ---------------- değişiklik bildirimi ---------------- */
  onChange(cb) {
    this._listeners.push(cb);
    return () => {
      const i = this._listeners.indexOf(cb);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  }
  _emit() {
    const ls = this._listeners.slice();
    for (let i = 0; i < ls.length; i++) ls[i](this);
  }

  /* ---------------- seçili yuva ---------------- */
  get selected() {
    return this._selected;
  }
  set selected(i) {
    const v = clampInt(i, 0, this.hotbarSize - 1);
    if (v !== this._selected) {
      this._selected = v;
      this._emit();
    }
  }
  /** Hotbar'da d kadar kaydır (taşarsa başa sarar). */
  selectStep(d) {
    const n = this.hotbarSize;
    this.selected = (((this._selected + d) % n) + n) % n;
  }
  held() {
    return this.slots[this._selected];
  }
  heldItem() {
    const s = this.slots[this._selected];
    return s ? s.item : null;
  }

  /* ---------------- sorgular ---------------- */
  slotAt(i) {
    return i >= 0 && i < this.size ? this.slots[i] : null;
  }
  count(key) {
    const it = itemByKey(key);
    if (!it) return 0;
    let n = 0;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s && s.item === it.key) n += s.count;
    }
    return n;
  }
  find(key) {
    const it = itemByKey(key);
    if (!it) return -1;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s && s.item === it.key) return i;
    }
    return -1;
  }
  firstEmpty() {
    for (let i = 0; i < this.size; i++) if (!this.slots[i]) return i;
    return -1;
  }
  isEmpty() {
    for (let i = 0; i < this.size; i++) if (this.slots[i]) return false;
    return true;
  }
  /** [{index,item,count,dur?}] dolu yuvalar. */
  list() {
    const out = [];
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (s) out.push(Object.assign({ index: i }, cloneSlot(s)));
    }
    return out;
  }
  /** Tüm malzemeler var mı? list: [{item,count}] ya da [[item,count]]. */
  has(list) {
    for (let i = 0; i < list.length; i++) {
      const p = pairOf(list[i]);
      if (this.count(p.item) < p.count) return false;
    }
    return true;
  }
  /** Kalan eşya yığınını/uzay denetimi: key'den count tane sığar mı? */
  canAdd(key, count = 1) {
    const it = itemByKey(key);
    const need = Math.floor(count);
    if (!it || !(need > 0)) return !!it;
    let room = 0;
    for (let i = 0; i < this.size; i++) {
      const s = this.slots[i];
      if (!s) room += it.durability ? 1 : it.stack;
      else if (!it.durability && s.item === it.key) room += it.stack - s.count;
      if (room >= need) return true;
    }
    return room >= need;
  }

  /* ---------------- ekleme / çıkarma ---------------- */
  /** count tane ekler; sığmayan (kalan) adedi döner. Bilinmeyen eşya eklenmez (hepsi kalır). */
  add(key, count = 1) {
    const it = itemByKey(key);
    let left = Math.floor(count);
    if (!(left > 0)) return 0;
    if (!it) return left;
    return this._addItem(it, left, undefined);
  }
  /** Dayanıklılığı (ve büyülerini) korunarak ekle (yerden alınan eşya vb.). Kalanı döner. */
  addStack(key, count = 1, dur, ench, charge) {
    const it = itemByKey(key);
    const left = Math.floor(count);
    if (!(left > 0)) return 0;
    if (!it) return left;
    return this._addItem(it, left, it.durability && dur !== undefined ? clampInt(dur, 1, it.durability) : undefined, ench, charge);
  }
  _addItem(it, count, dur, ench, charge) {
    let left = count;
    let changed = false;
    if (!it.durability) {
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.item === it.key && s.count < it.stack) {
          const n = Math.min(it.stack - s.count, left);
          s.count += n;
          left -= n;
          changed = true;
        }
      }
    }
    for (let i = 0; i < this.size && left > 0; i++) {
      if (!this.slots[i]) {
        const n = it.durability ? 1 : Math.min(it.stack, left);
        this.slots[i] = makeSlot(it, n, dur, ench, charge);
        left -= n;
        changed = true;
      }
    }
    if (changed) this._emit();
    return left;
  }
  /** Hepsi ya da hiçbiri: yeterince varsa çıkarır (infinite'te tüketmez) ve true döner. */
  remove(key, count = 1) {
    const it = itemByKey(key);
    const n = Math.floor(count);
    if (!it) return false;
    if (!(n > 0)) return true;
    if (this.count(it.key) < n) return false;
    if (this.infinite) return true;
    let left = n;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.item === it.key) {
        const t = Math.min(s.count, left);
        s.count -= t;
        left -= t;
        if (s.count <= 0) this.slots[i] = null;
      }
    }
    this._emit();
    return true;
  }
  /** i. yuvadan count (varsayılan hepsi) alıp döner: {item,count,dur?} | null. (Yere bırakma için.) */
  drop(i, count) {
    const s = this.slotAt(i);
    if (!s) return null;
    const n = count === undefined ? s.count : clampInt(count, 1, s.count);
    const out = cloneSlot(s);
    out.count = n;
    if (!this.infinite) {
      s.count -= n;
      if (s.count <= 0) this.slots[i] = null;
    }
    this._emit();
    return out;
  }
  /** Doğrudan yuva yazar (yaratıcı palet / arayüz). item null → boşalt. */
  setSlot(i, key, count = 1, dur, ench, charge) {
    if (!(i >= 0 && i < this.size)) return false;
    if (key === null || key === undefined) {
      this.slots[i] = null;
      this._emit();
      return true;
    }
    const it = itemByKey(key);
    if (!it) return false;
    const n = it.durability ? 1 : clampInt(count, 1, it.stack);
    this.slots[i] = makeSlot(it, n, it.durability && dur !== undefined ? clampInt(dur, 1, it.durability) : undefined, ench, charge);
    this._emit();
    return true;
  }
  clear() {
    this.slots.fill(null);
    this.armor.fill(null);
    this.heat = 0;
    this._emit();
  }

  /* ---------------- adresli erişim ve büyüler ---------------- */
  /** Yuva adresi → yuva nesnesi | null. Adres: yuva indeksi | 's12' | 'a0' (zırh) | {zone:'slots'|'armor', index}. */
  slotByAddr(addr) {
    const loc = this._locate(addr);
    return loc ? loc.list[loc.idx] : null;
  }
  _locate(addr) {
    let armor = false;
    let idx = addr;
    if (addr && typeof addr === 'object') {
      armor = addr.zone === 'armor';
      idx = addr.index;
    } else if (typeof addr === 'string') {
      const m = /^([sa])(\d{1,3})$/.exec(addr);
      if (!m) return null;
      armor = m[1] === 'a';
      idx = Number(m[2]);
    }
    if (!Number.isInteger(idx) || idx < 0) return null;
    const list = armor ? this.armor : this.slots;
    return idx < list.length && list[idx] ? { list, idx } : null;
  }
  /** Yuvanın büyülerini yazar (temizlenir; null/boş → siler). Büyülenemeyen eşyada false. */
  setEnchant(addr, ench) {
    const s = this.slotByAddr(addr);
    if (!s) return false;
    const e = ench ? sanitizeEnch(ench, s.item) : null;
    if (ench && !e) return false;
    if (e) s.ench = e;
    else delete s.ench;
    this._emit();
    return true;
  }
  /** addr yuvasından n adet (varsayılan 1) alır → {item,count,dur?,ench?} | null (yaratıcı modda tüketmez). */
  takeFromSlot(addr, n = 1) {
    const loc = this._locate(addr);
    if (!loc) return null;
    const s = loc.list[loc.idx];
    const c = clampInt(n, 1, s.count);
    const out = cloneSlot(s);
    out.count = c;
    if (!this.infinite) {
      s.count -= c;
      if (s.count <= 0) loc.list[loc.idx] = null;
    }
    this._emit();
    return out;
  }
  /** Dayanıklılık büyüsü: n puanlık aşınmanın kaçı gerçekten işler (belirlenimci zar). */
  _wear(s, n) {
    const L = s.ench && s.ench.dayaniklilik > 0 ? s.ench.dayaniklilik | 0 : 0;
    if (!L || n <= 0) return n;
    let w = 0;
    for (let k = 0; k < n; k++) {
      this._rn = (Math.imul(this._rn, 1664525) + 1013904223) >>> 0;
      if (this._rn / 4294967296 >= L / (L + 1)) w++;
    }
    return w;
  }

  /* ---------------- yerleşim ---------------- */
  swap(i, j) {
    if (!(i >= 0 && i < this.size && j >= 0 && j < this.size) || i === j) return false;
    const t = this.slots[i];
    this.slots[i] = this.slots[j];
    this.slots[j] = t;
    this._emit();
    return true;
  }
  /** from → to: aynı yığılabilir eşyaysa birleştirir (artan kalır), değilse yer değiştirir. */
  moveStack(from, to) {
    if (!(from >= 0 && from < this.size && to >= 0 && to < this.size) || from === to) return false;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return false;
    if (b && a.item === b.item && a.dur === undefined && b.dur === undefined) {
      const it = itemByKey(a.item);
      const room = it.stack - b.count;
      if (room <= 0) return this.swap(from, to);
      const n = Math.min(room, a.count);
      b.count += n;
      a.count -= n;
      if (a.count <= 0) this.slots[from] = null;
      this._emit();
      return true;
    }
    return this.swap(from, to);
  }
  /** i. yığının yarısını (yukarı yuvarlı kalan i'de) boş bir yuvaya (to verilmezse ilk boş) ayırır. */
  split(i, to) {
    const s = this.slotAt(i);
    if (!s || s.count < 2 || s.dur !== undefined) return -1;
    const dest = to === undefined ? this.firstEmpty() : to;
    if (!(dest >= 0 && dest < this.size) || this.slots[dest]) return -1;
    const half = Math.floor(s.count / 2);
    s.count -= half;
    this.slots[dest] = { item: s.item, count: half };
    this._emit();
    return dest;
  }

  /* ---------------- dayanıklılık ---------------- */
  /** Eldeki eşyayı n aşındırır; kırıldıysa true (yuva boşalır). */
  damageHeld(n = 1) {
    const s = this.held();
    if (!s || s.dur === undefined || this.infinite) return false;
    s.dur -= this._wear(s, Math.max(0, Math.floor(n)));
    let broke = false;
    if (s.dur <= 0) {
      this.slots[this._selected] = null;
      broke = true;
    }
    this._emit();
    return broke;
  }
  /** Her giyili zırh parçasını n aşındırır; kırılan parça sayısını döner. */
  damageArmor(n = 1) {
    if (this.infinite) return 0;
    let broken = 0;
    for (let a = 0; a < this.armorSize; a++) {
      const s = this.armor[a];
      if (!s || s.dur === undefined) continue;
      s.dur -= this._wear(s, Math.max(0, Math.floor(n)));
      if (s.dur <= 0) {
        this.armor[a] = null;
        broken++;
      }
    }
    this._emit();
    return broken;
  }

  /* ---------------- zırh ---------------- */
  /** i. yuvadaki zırhı giyer; eski parça i'ye döner. */
  equip(i) {
    const s = this.slotAt(i);
    if (!s) return false;
    const it = itemByKey(s.item);
    if (!it || !it.armor) return false;
    const a = ARMOR_SLOTS.indexOf(it.armor.slot);
    if (a < 0 || a >= this.armorSize) return false;
    const old = this.armor[a];
    this.armor[a] = s;
    this.slots[i] = old || null;
    this._emit();
    return true;
  }
  /** Giyili a. parçayı çantaya alır; yer yoksa false. */
  unequip(a) {
    const s = this.armor[a];
    if (!s) return false;
    const dest = this.firstEmpty();
    if (dest < 0) return false;
    this.slots[dest] = s;
    this.armor[a] = null;
    this._emit();
    return true;
  }
  armorDefense() {
    let d = 0;
    for (let a = 0; a < this.armorSize; a++) {
      const s = this.armor[a];
      const it = s && itemByKey(s.item);
      if (it && it.armor) d += it.armor.defense + (s.ench && s.ench.koruma > 0 ? 0.5 * (s.ench.koruma | 0) : 0);
    }
    return d;
  }

  /* ---------------- üretim ---------------- */
  /**
   * Ocak için kullanılabilir toplam ısı: taşınan ısı + envanterdeki yakıtlar.
   * reserved: tarifin malzemeleri ([{item,count}]) — yakıt da olsalar yakılmaz.
   */
  availableHeat(reserved) {
    const keep = {};
    if (reserved) {
      for (let i = 0; i < reserved.length; i++) {
        const p = pairOf(reserved[i]);
        keep[p.item] = (keep[p.item] || 0) + p.count;
      }
    }
    let total = this.heat;
    const fuels = Object.keys(FUEL_HEAT);
    for (let i = 0; i < fuels.length; i++) {
      const k = fuels[i];
      const have = this.count(k) - (keep[k] || 0);
      if (have > 0) total += have * FUEL_HEAT[k];
    }
    return total;
  }
  _burnFor(cost) {
    // Yakıt önceliği: önce kömür sınıfı (>= 50 ısı; fazla ısı zaten saklanır, israf yok), sonra odun eşyaları en zayıftan.
    // Eskiden en zayıf yakıt önce yanıyordu: ocakta eritince alet sapı (sopa), tahta ve kütükler kömür dururken yok oluyordu.
    const coalClass = (k) => (FUEL_HEAT[k] >= 50 ? 0 : 1);
    const fuels = Object.keys(FUEL_HEAT).sort((x, y) => coalClass(x) - coalClass(y) || FUEL_HEAT[x] - FUEL_HEAT[y]);
    while (this.heat < cost) {
      let used = false;
      for (let i = 0; i < fuels.length; i++) {
        if (this.count(fuels[i]) > 0) {
          this.remove(fuels[i], 1);
          this.heat += FUEL_HEAT[fuels[i]];
          used = true;
          break;
        }
      }
      if (!used) return false;
    }
    this.heat -= cost;
    return true;
  }
  /** Bu tarif şu an üretilebilir mi (malzeme, istasyon, yakıt, çıktı yeri)? */
  canCraft(recipeId, stationSet) {
    const r = typeof recipeId === 'string' ? getRecipe(recipeId) : recipeId;
    if (!r || !stationAvailable(r, stationSet)) return false;
    if (!this.infinite && !canCraft(this, r)) return false;
    return this.canAdd(r.out.item, r.out.count) || this._fitsAfter(r);
  }
  _fitsAfter(r) {
    const snap = this._saveState();
    const lis = this._listeners;
    this._listeners = [];
    let ok = true;
    if (!this.infinite) {
      for (let i = 0; i < r.in.length; i++) {
        if (!this.remove(r.in[i].item, r.in[i].count)) ok = false;
      }
    }
    if (ok) ok = this.canAdd(r.out.item, r.out.count);
    this._restoreState(snap);
    this._listeners = lis;
    return ok;
  }
  /** Tarifi üretir (stationSet: Set|dizi; 'el' her zaman). Başarısızsa envanter değişmez. */
  craft(recipeId, stationSet) {
    const r = typeof recipeId === 'string' ? getRecipe(recipeId) : recipeId;
    if (!r || !stationAvailable(r, stationSet)) return false;
    if (!this.infinite && !canCraft(this, r)) return false;
    const snap = this._saveState();
    const lis = this._listeners;
    this._listeners = [];
    let ok = true;
    if (!this.infinite) {
      for (let i = 0; i < r.in.length && ok; i++) ok = this.remove(r.in[i].item, r.in[i].count);
      if (ok && r.heat) ok = this._burnFor(r.heat);
    }
    if (ok) ok = this.add(r.out.item, r.out.count) === 0;
    if (!ok) this._restoreState(snap);
    this._listeners = lis;
    if (ok) this._emit();
    return ok;
  }
  _saveState() {
    return {
      slots: this.slots.map(cloneSlot),
      armor: this.armor.map(cloneSlot),
      heat: this.heat,
    };
  }
  _restoreState(st) {
    this.slots = st.slots;
    this.armor = st.armor;
    this.heat = st.heat;
  }

  /* ---------------- serileştirme ---------------- */
  /** Arayüz için düz kopya: ad ve en yüksek dayanıklılık dahil. */
  snapshot() {
    const view = (s) => {
      if (!s) return null;
      const it = itemByKey(s.item);
      const v = {
        item: s.item,
        count: s.count,
        dur: s.dur,
        maxDur: it && it.durability ? it.durability : 0,
        name: it ? it.name : s.item,
        kind: it ? it.kind : 'malzeme',
      };
      if (s.ench) v.ench = cloneEnch(s.ench);
      if (s.charge !== undefined) {
        v.charge = s.charge;
        v.maxCharge = maxCharge(s.item);
      }
      return v;
    };
    return {
      size: this.size,
      hotbar: this.hotbarSize,
      selected: this._selected,
      heat: this.heat,
      slots: this.slots.map(view),
      armor: this.armor.map(view),
    };
  }
  toJSON() {
    const enc = (s) => {
      if (!s) return 0;
      // şarjlı eşya: [item,count,dur|0,ench|0,charge] (techCharge); aksi halde eski kısa biçimler
      if (s.charge !== undefined) return [s.item, s.count, s.dur === undefined ? 0 : s.dur, s.ench ? cloneEnch(s.ench) : 0, s.charge];
      if (s.dur === undefined) return [s.item, s.count];
      return s.ench ? [s.item, s.count, s.dur, cloneEnch(s.ench)] : [s.item, s.count, s.dur];
    };
    return {
      v: INVENTORY_VERSION,
      size: this.size,
      hotbar: this.hotbarSize,
      selected: this._selected,
      heat: Math.round(this.heat),
      slots: this.slots.map(enc),
      armor: this.armor.map(enc),
    };
  }
  /** Doğrulayarak yükler (asla atmaz): bilinmeyen anahtarlar atılır, sayılar kısılır. */
  fromJSON(data) {
    const d = data && typeof data === 'object' ? data : {};
    const decode = (raw, armorIndex) => {
      let key;
      let count;
      let dur;
      let ench;
      let charge;
      if (Array.isArray(raw)) {
        key = raw[0];
        count = raw[1];
        dur = raw[2];
        ench = raw[3];
        charge = raw[4];
      } else if (raw && typeof raw === 'object') {
        key = raw.item;
        count = raw.count;
        dur = raw.dur;
        ench = Object.prototype.hasOwnProperty.call(raw, 'ench') ? raw.ench : undefined;
        charge = Object.prototype.hasOwnProperty.call(raw, 'charge') ? raw.charge : undefined;
      } else {
        return null;
      }
      const it = itemByKey(key);
      if (!it) return null;
      if (armorIndex !== undefined) {
        if (!it.armor || ARMOR_SLOTS.indexOf(it.armor.slot) !== armorIndex) return null;
      }
      const n = it.durability ? 1 : clampInt(count === undefined ? 1 : count, 1, it.stack);
      if (!(Number(count) >= 1) && count !== undefined && !it.durability) return null;
      let du;
      if (it.durability) du = dur === undefined || !Number.isFinite(Number(dur)) ? it.durability : clampInt(dur, 1, it.durability);
      return makeSlot(it, n, du, ench && typeof ench === 'object' ? ench : undefined, charge);
    };
    const slots = Array.isArray(d.slots) ? d.slots : [];
    const armor = Array.isArray(d.armor) ? d.armor : [];
    this.slots = new Array(this.size).fill(null);
    for (let i = 0; i < this.size && i < slots.length; i++) this.slots[i] = decode(slots[i]);
    this.armor = new Array(this.armorSize).fill(null);
    for (let a = 0; a < this.armorSize && a < armor.length; a++) this.armor[a] = decode(armor[a], a);
    const sel = Number(d.selected);
    this._selected = Number.isFinite(sel) ? clampInt(sel, 0, this.hotbarSize - 1) : 0;
    const h = Number(d.heat);
    this.heat = Number.isFinite(h) ? Math.max(0, Math.min(MAX_HEAT, h)) : 0;
    this._emit();
    return this;
  }
  static fromJSON(data, opts) {
    return new Inventory(opts).fromJSON(data);
  }
}

/** Yaratıcı palet: BUILD_GROUPS sırasıyla tüm yerleştirilebilir blokların eşya anahtarları. */
export function creativeBlockKeys() {
  const out = [];
  for (let g = 0; g < BUILD_GROUPS.length; g++) {
    for (let i = 0; i < PLACEABLE_IDS.length; i++) {
      const b = BLOCKS[PLACEABLE_IDS[i]];
      if (b.group === BUILD_GROUPS[g].key) out.push('blok:' + b.key);
    }
  }
  return out;
}

const CREATIVE_HOTBAR = [
  'blok:taş', 'blok:toprak', 'blok:meşe_tahta', 'blok:cam', 'blok:tuğla',
  'blok:çimen', 'blok:kum', 'blok:meşale', 'blok:beton_beyaz',
];

/** İnşa modu envanteri: sınırsız (tüketmez), hotbar hazır bloklarla dolu. */
export function creativeInventory(opts = {}) {
  const inv = new Inventory(Object.assign({}, opts, { infinite: true }));
  for (let i = 0; i < CREATIVE_HOTBAR.length && i < inv.hotbarSize; i++) {
    inv.slots[i] = makeSlot(itemByKey(CREATIVE_HOTBAR[i]), 64);
  }
  return inv;
}
