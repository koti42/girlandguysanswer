/*
 * KEŞİF sim/props — ColliderIndex: voxel dışı çarpışma kutuları (prop mobilyası, kapılar, asansör kabini, araçlar, yayalar).
 * Sözleşme KESIF_CITY_CONTRACT §6. Saf (DOM/three yok), worker-güvenli, Math.random/Date.now yok.
 *
 *   const idx = new ColliderIndex();
 *   idx.add(id, aabbs)           statik: aabbs = [[x0,y0,z0,x1,y1,z1], …] dünya uzayı (≤8 kutu); aynı id yeniden eklenirse değiştirilir
 *   idx.remove(id)               id'nin tüm kutularını siler (statik ya da dinamik); yoksa false
 *   idx.setDynamic(id, aabb, vel?)  dinamik kinematik kutu: aabb {minX..maxZ} | [x0,y0,z0,x1,y1,z1]; vel {x,y,z} (b/s) → platform taşıma
 *   idx.query(aabb, out, max=64) → n   aabb ile KESİŞEN kutuları out (Float64Array, n*6 sayı: x0,y0,z0,x1,y1,z1) dizisine yazar;
 *                                      idx.ids[i] / idx.slots[i] i. kutunun sahibi/yuvasıdır. TAHSİSSİZ.
 *   idx.queryRaw(x0,y0,z0,x1,y1,z1,out,max) → n   aynı, sayı bağımsız değişkenli (sıcak yol: fizik)
 *
 * Yapı: 4×4×4 blokluk hücre ızgarası; kutular tek TİPLİ dizi havuzunda (6 sayı/yuva), hücre → düğüm zinciri; hücre arama tablosu
 * açık adresli Int32Array (Map yok). Sorgu tahsissizdir (yineleme damgası ile aynı kutu iki hücreden bir kez döner).
 * Kutu koordinatları Float64'tür (sözleşmedeki Float32 yerine bilerek): platform üstünde duran gövde ile kutu üst yüzeyi 1e-7 (physics EPS)
 * içinde eşleşmek zorundadır; Float32 yuvarlaması (~1.2e-7) dinamik kutuda desteği koparıyordu. Bellek: 48 bayt/kutu.
 * Kesişim kesindir (dokunma kesişim sayılmaz): fizik kırpması ayrıntıyı kendisi çözer.
 * Dinamik kutular `maxVel` (b/s) izler: fizik, sorgu hacmini adım başına bu kadar genişletir (kutu adım sonunda içeri girebilir).
 */

const CELL = 4;
const INV_CELL = 1 / CELL;
const MAX_COORD = 1e6;
/** Bir kutunun kapsayabileceği en büyük hücre sayısı (aşılırsa kutu reddedilir): dev kutu tabloyu şişirmesin. */
const MAX_BOX_CELLS = 4096;
const MAX_IDS_PER_ENTRY = 8;
/** Tek kutunun bir eksendeki en büyük uzunluğu (blok): prop/kabin/araç boyutları bunun çok altındadır. */
const MAX_EXTENT = 128;
const KIND_FREE = 0;
const KIND_STATIC = 1;
const KIND_DYN = 2;

function cellKey(ix, iy, iz) {
  return ((ix + 512) & 1023) | (((iy + 512) & 1023) << 10) | (((iz + 512) & 1023) << 20);
}

export class ColliderIndex {
  constructor(opts) {
    const o = opts || {};
    let cap = o.capacity > 0 ? o.capacity | 0 : 256;
    if (cap < 16) cap = 16;
    this._cap = cap;
    this.boxes = new Float64Array(cap * 6);
    this.owner = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
    this.vel = new Float64Array(cap * 3);
    this._stamp = new Uint32Array(cap);
    this._cr = new Int32Array(cap * 6); // yuva başına hücre aralığı (kaldırma için)
    this._free = [];
    this._top = 0;
    this._queryStamp = 0;
    /** id → yuva (tek) | yuva dizisi */
    this._byId = new Map();
    this.size = 0;
    this.dynCount = 0;
    /** Dinamik kutuların en büyük |hız bileşeni| (b/s); dynCount 0'a inince sıfırlanır. */
    this.maxVel = 0;
    // hücre tablosu (açık adresli, doğrusal yoklama)
    this._tBits = 10;
    this._tCap = 1 << 10;
    this._tKey = new Int32Array(this._tCap).fill(-1);
    this._tHead = new Int32Array(this._tCap).fill(-1);
    this._tUsed = 0;
    // düğüm havuzu
    this._nCap = 1024;
    this._nSlot = new Int32Array(this._nCap);
    this._nNext = new Int32Array(this._nCap);
    this._nFree = -1;
    this._nTop = 0;
    // sorgu çıktı yardımcıları (tahsissiz; en çok 256 kutu)
    this.ids = new Uint32Array(256);
    this.slots = new Int32Array(256);
  }

  /* ---------------------------------------------------------------------------------------------- tablo */
  _find(key) {
    const mask = this._tCap - 1;
    let i = Math.imul(key, 0x9e3779b1) >>> (32 - this._tBits);
    const tk = this._tKey;
    for (;;) {
      const k = tk[i];
      if (k === key) return i;
      if (k === -1) return -1;
      i = (i + 1) & mask;
    }
  }

  _findOrInsert(key) {
    const mask = this._tCap - 1;
    let i = Math.imul(key, 0x9e3779b1) >>> (32 - this._tBits);
    const tk = this._tKey;
    for (;;) {
      const k = tk[i];
      if (k === key) return i;
      if (k === -1) {
        if ((this._tUsed + 1) * 2 > this._tCap) {
          this._rehash(); // yer açılmadan eklenmez (eklenen anahtar henüz boş baş taşıyacağı için sonradan elenirdi)
          return this._findOrInsert(key);
        }
        tk[i] = key;
        this._tHead[i] = -1;
        this._tUsed++;
        return i;
      }
      i = (i + 1) & mask;
    }
  }

  _rehash() {
    const oldKey = this._tKey;
    const oldHead = this._tHead;
    let live = 0;
    for (let i = 0; i < oldKey.length; i++) if (oldKey[i] !== -1 && oldHead[i] !== -1) live++;
    let bits = 10;
    while ((1 << bits) < live * 4 + 16) bits++;
    const cap = 1 << bits;
    const nk = new Int32Array(cap).fill(-1);
    const nh = new Int32Array(cap).fill(-1);
    const mask = cap - 1;
    let used = 0;
    for (let i = 0; i < oldKey.length; i++) {
      const key = oldKey[i];
      if (key === -1 || oldHead[i] === -1) continue;
      let j = Math.imul(key, 0x9e3779b1) >>> (32 - bits);
      while (nk[j] !== -1) j = (j + 1) & mask;
      nk[j] = key;
      nh[j] = oldHead[i];
      used++;
    }
    this._tBits = bits;
    this._tCap = cap;
    this._tKey = nk;
    this._tHead = nh;
    this._tUsed = used;
  }

  _allocNode() {
    if (this._nFree !== -1) {
      const n = this._nFree;
      this._nFree = this._nNext[n];
      return n;
    }
    if (this._nTop >= this._nCap) {
      const cap = this._nCap * 2;
      const s = new Int32Array(cap);
      s.set(this._nSlot);
      const x = new Int32Array(cap);
      x.set(this._nNext);
      this._nSlot = s;
      this._nNext = x;
      this._nCap = cap;
    }
    return this._nTop++;
  }

  _linkCells(slot) {
    const r = this._cr;
    const b = slot * 6;
    for (let ix = r[b]; ix <= r[b + 3]; ix++) {
      for (let iy = r[b + 1]; iy <= r[b + 4]; iy++) {
        for (let iz = r[b + 2]; iz <= r[b + 5]; iz++) {
          const node = this._allocNode();
          const t = this._findOrInsert(cellKey(ix, iy, iz));
          this._nSlot[node] = slot;
          this._nNext[node] = this._tHead[t];
          this._tHead[t] = node;
        }
      }
    }
  }

  _unlinkCells(slot, base) {
    const cr = this._cr;
    for (let ix = cr[base]; ix <= cr[base + 3]; ix++) {
      for (let iy = cr[base + 1]; iy <= cr[base + 4]; iy++) {
        for (let iz = cr[base + 2]; iz <= cr[base + 5]; iz++) {
          const t = this._find(cellKey(ix, iy, iz));
          if (t < 0) continue;
          let prev = -1;
          for (let n = this._tHead[t]; n !== -1; n = this._nNext[n]) {
            if (this._nSlot[n] === slot) {
              if (prev === -1) this._tHead[t] = this._nNext[n];
              else this._nNext[prev] = this._nNext[n];
              this._nNext[n] = this._nFree;
              this._nFree = n;
              break;
            }
            prev = n;
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------------------------------------- yuvalar */
  _allocSlot() {
    if (this._free.length > 0) return this._free.pop();
    if (this._top >= this._cap) this._grow();
    return this._top++;
  }

  _grow() {
    const cap = this._cap * 2;
    const b = new Float64Array(cap * 6);
    b.set(this.boxes);
    const ow = new Uint32Array(cap);
    ow.set(this.owner);
    const kd = new Uint8Array(cap);
    kd.set(this.kind);
    const vl = new Float64Array(cap * 3);
    vl.set(this.vel);
    const st = new Uint32Array(cap);
    st.set(this._stamp);
    const cr = new Int32Array(cap * 6);
    cr.set(this._cr);
    this.boxes = b;
    this.owner = ow;
    this.kind = kd;
    this.vel = vl;
    this._stamp = st;
    this._cr = cr;
    this._cap = cap;
  }

  _range(slot, x0, y0, z0, x1, y1, z1) {
    const cr = this._cr;
    const b = slot * 6;
    cr[b] = Math.floor(x0 * INV_CELL);
    cr[b + 1] = Math.floor(y0 * INV_CELL);
    cr[b + 2] = Math.floor(z0 * INV_CELL);
    cr[b + 3] = Math.floor(x1 * INV_CELL);
    cr[b + 4] = Math.floor(y1 * INV_CELL);
    cr[b + 5] = Math.floor(z1 * INV_CELL);
  }

  static _valid(x0, y0, z0, x1, y1, z1) {
    if (!(x0 > -MAX_COORD && x1 < MAX_COORD && y0 > -MAX_COORD && y1 < MAX_COORD && z0 > -MAX_COORD && z1 < MAX_COORD)) return false;
    if (!(x1 > x0 && y1 > y0 && z1 > z0)) return false;
    if (x1 - x0 > MAX_EXTENT || y1 - y0 > MAX_EXTENT || z1 - z0 > MAX_EXTENT) return false;
    const cx = Math.floor(x1 * INV_CELL) - Math.floor(x0 * INV_CELL) + 1;
    const cy = Math.floor(y1 * INV_CELL) - Math.floor(y0 * INV_CELL) + 1;
    const cz = Math.floor(z1 * INV_CELL) - Math.floor(z0 * INV_CELL) + 1;
    return cx * cy * cz <= MAX_BOX_CELLS;
  }

  _putBox(slot, x0, y0, z0, x1, y1, z1) {
    const b = slot * 6;
    const bx = this.boxes;
    bx[b] = x0; bx[b + 1] = y0; bx[b + 2] = z0; bx[b + 3] = x1; bx[b + 4] = y1; bx[b + 5] = z1;
  }

  _freeSlot(slot) {
    this._unlinkCells(slot, slot * 6);
    if (this.kind[slot] === KIND_DYN && --this.dynCount === 0) this.maxVel = 0;
    this.kind[slot] = KIND_FREE;
    this.owner[slot] = 0;
    this._free.push(slot);
    this.size--;
  }

  /* ---------------------------------------------------------------------------------------------- genel */
  /** Statik kutuları ekler (id yeniden eklenirse eskisi silinir). Geçerli kutu sayısını döner (hiç geçerli yoksa 0, id eklenmez). */
  add(id, aabbs) {
    id = id >>> 0;
    this.remove(id);
    if (!aabbs || typeof aabbs.length !== 'number') return 0;
    const slots = [];
    const n = Math.min(aabbs.length, MAX_IDS_PER_ENTRY);
    for (let i = 0; i < n; i++) {
      const a = aabbs[i];
      if (!a) continue;
      const x0 = +a[0]; const y0 = +a[1]; const z0 = +a[2];
      const x1 = +a[3]; const y1 = +a[4]; const z1 = +a[5];
      if (!ColliderIndex._valid(x0, y0, z0, x1, y1, z1)) continue;
      const slot = this._allocSlot();
      this._putBox(slot, x0, y0, z0, x1, y1, z1);
      this.kind[slot] = KIND_STATIC;
      this.owner[slot] = id;
      this.vel[slot * 3] = 0; this.vel[slot * 3 + 1] = 0; this.vel[slot * 3 + 2] = 0;
      this._range(slot, x0, y0, z0, x1, y1, z1);
      this._linkCells(slot);
      this.size++;
      slots.push(slot);
    }
    if (slots.length === 0) return 0;
    this._byId.set(id, slots.length === 1 ? slots[0] : slots);
    return slots.length;
  }

  /** Dinamik kutu (tek): oluşturur ya da taşır. aabb {minX…maxZ} | dizi. vel yoksa sıfır. Geçersizse kutuyu kaldırır ve false döner. */
  setDynamic(id, aabb, vel) {
    id = id >>> 0;
    let x0; let y0; let z0; let x1; let y1; let z1;
    if (aabb && aabb.minX !== undefined) {
      x0 = aabb.minX; y0 = aabb.minY; z0 = aabb.minZ; x1 = aabb.maxX; y1 = aabb.maxY; z1 = aabb.maxZ;
    } else if (aabb) {
      x0 = aabb[0]; y0 = aabb[1]; z0 = aabb[2]; x1 = aabb[3]; y1 = aabb[4]; z1 = aabb[5];
    } else {
      this.remove(id);
      return false;
    }
    if (!ColliderIndex._valid(x0, y0, z0, x1, y1, z1)) {
      this.remove(id);
      return false;
    }
    const cur = this._byId.get(id);
    let slot = typeof cur === 'number' && this.kind[cur] === KIND_DYN ? cur : -1;
    if (slot < 0) {
      if (cur !== undefined) this.remove(id);
      slot = this._allocSlot();
      this.kind[slot] = KIND_DYN;
      this.owner[slot] = id;
      this._putBox(slot, x0, y0, z0, x1, y1, z1);
      this._range(slot, x0, y0, z0, x1, y1, z1);
      this._linkCells(slot);
      this._byId.set(id, slot);
      this.size++;
      this.dynCount++;
    } else {
      const cr = this._cr;
      const b = slot * 6;
      const o0 = cr[b]; const o1 = cr[b + 1]; const o2 = cr[b + 2]; const o3 = cr[b + 3]; const o4 = cr[b + 4]; const o5 = cr[b + 5];
      this._putBox(slot, x0, y0, z0, x1, y1, z1);
      const n0 = Math.floor(x0 * INV_CELL); const n1 = Math.floor(y0 * INV_CELL); const n2 = Math.floor(z0 * INV_CELL);
      const n3 = Math.floor(x1 * INV_CELL); const n4 = Math.floor(y1 * INV_CELL); const n5 = Math.floor(z1 * INV_CELL);
      if (n0 !== o0 || n1 !== o1 || n2 !== o2 || n3 !== o3 || n4 !== o4 || n5 !== o5) {
        this._unlinkCells(slot, b);
        cr[b] = n0; cr[b + 1] = n1; cr[b + 2] = n2; cr[b + 3] = n3; cr[b + 4] = n4; cr[b + 5] = n5;
        this._linkCells(slot);
      }
    }
    const v = this.vel;
    const vi = slot * 3;
    if (vel) {
      v[vi] = Number.isFinite(vel.x) ? vel.x : 0;
      v[vi + 1] = Number.isFinite(vel.y) ? vel.y : 0;
      v[vi + 2] = Number.isFinite(vel.z) ? vel.z : 0;
      const m = Math.max(Math.abs(v[vi]), Math.abs(v[vi + 1]), Math.abs(v[vi + 2]));
      if (m > this.maxVel) this.maxVel = m;
    } else {
      v[vi] = 0; v[vi + 1] = 0; v[vi + 2] = 0;
    }
    return true;
  }

  remove(id) {
    id = id >>> 0;
    const cur = this._byId.get(id);
    if (cur === undefined) return false;
    this._byId.delete(id);
    if (typeof cur === 'number') this._freeSlot(cur);
    else for (let i = 0; i < cur.length; i++) this._freeSlot(cur[i]);
    return true;
  }

  has(id) {
    return this._byId.has(id >>> 0);
  }

  /** id'nin kutularını [[x0..z1],…] olarak döner (test/hata ayıklama; tahsis eder). */
  boxesOf(id) {
    const cur = this._byId.get(id >>> 0);
    if (cur === undefined) return [];
    const list = typeof cur === 'number' ? [cur] : cur;
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i] * 6;
      out.push([this.boxes[b], this.boxes[b + 1], this.boxes[b + 2], this.boxes[b + 3], this.boxes[b + 4], this.boxes[b + 5]]);
    }
    return out;
  }

  clear() {
    this._byId.clear();
    this._free.length = 0;
    this._top = 0;
    this.kind.fill(0);
    this.size = 0;
    this.dynCount = 0;
    this.maxVel = 0;
    this._tKey.fill(-1);
    this._tHead.fill(-1);
    this._tUsed = 0;
    this._nFree = -1;
    this._nTop = 0;
  }

  /** Bellek ayak izi (bayt, yaklaşık). */
  memoryBytes() {
    return this.boxes.byteLength + this.owner.byteLength + this.kind.byteLength + this.vel.byteLength + this._stamp.byteLength
      + this._cr.byteLength + this._tKey.byteLength + this._tHead.byteLength + this._nSlot.byteLength + this._nNext.byteLength;
  }

  /* ---------------------------------------------------------------------------------------------- sorgu */
  /** aabb {minX…} | dizi. */
  query(aabb, out, max) {
    if (aabb && aabb.minX !== undefined) {
      return this.queryRaw(aabb.minX, aabb.minY, aabb.minZ, aabb.maxX, aabb.maxY, aabb.maxZ, out, max);
    }
    if (!aabb) return 0;
    return this.queryRaw(aabb[0], aabb[1], aabb[2], aabb[3], aabb[4], aabb[5], out, max);
  }

  queryRaw(x0, y0, z0, x1, y1, z1, out, max) {
    let cap = max > 0 ? max | 0 : 64;
    if (cap > 256) cap = 256;
    if (!(x0 > -MAX_COORD && x1 < MAX_COORD && y0 > -MAX_COORD && y1 < MAX_COORD && z0 > -MAX_COORD && z1 < MAX_COORD)) return 0;
    if (this.size === 0) return 0;
    const ix0 = Math.floor(x0 * INV_CELL);
    const iy0 = Math.floor(y0 * INV_CELL);
    const iz0 = Math.floor(z0 * INV_CELL);
    const ix1 = Math.floor(x1 * INV_CELL);
    const iy1 = Math.floor(y1 * INV_CELL);
    const iz1 = Math.floor(z1 * INV_CELL);
    const bx = this.boxes;
    let n = 0;
    if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) * (iz1 - iz0 + 1) > 512) {
      // dev sorgu hacmi: hücreleri gezmek yerine tüm yuvaları tara
      for (let s = 0; s < this._top; s++) {
        if (this.kind[s] === KIND_FREE) continue;
        const b = s * 6;
        if (bx[b] < x1 && bx[b + 3] > x0 && bx[b + 1] < y1 && bx[b + 4] > y0 && bx[b + 2] < z1 && bx[b + 5] > z0) {
          const o = n * 6;
          out[o] = bx[b]; out[o + 1] = bx[b + 1]; out[o + 2] = bx[b + 2]; out[o + 3] = bx[b + 3]; out[o + 4] = bx[b + 4]; out[o + 5] = bx[b + 5];
          this.ids[n] = this.owner[s];
          this.slots[n] = s;
          n++;
          if (n >= cap) return n;
        }
      }
      return n;
    }
    let stamp = ++this._queryStamp;
    if (stamp >= 0xfffffff0) {
      this._stamp.fill(0);
      this._queryStamp = stamp = 1;
    }
    const st = this._stamp;
    const tKey = this._tKey;
    const tHead = this._tHead;
    const mask = this._tCap - 1;
    const shift = 32 - this._tBits;
    const nSlot = this._nSlot;
    const nNext = this._nNext;
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const key = cellKey(ix, iy, iz);
          let t = Math.imul(key, 0x9e3779b1) >>> shift;
          let k = tKey[t];
          while (k !== key && k !== -1) {
            t = (t + 1) & mask;
            k = tKey[t];
          }
          if (k === -1) continue;
          for (let node = tHead[t]; node !== -1; node = nNext[node]) {
            const s = nSlot[node];
            if (st[s] === stamp) continue;
            st[s] = stamp;
            const b = s * 6;
            if (bx[b] < x1 && bx[b + 3] > x0 && bx[b + 1] < y1 && bx[b + 4] > y0 && bx[b + 2] < z1 && bx[b + 5] > z0) {
              const o = n * 6;
              out[o] = bx[b]; out[o + 1] = bx[b + 1]; out[o + 2] = bx[b + 2];
              out[o + 3] = bx[b + 3]; out[o + 4] = bx[b + 4]; out[o + 5] = bx[b + 5];
              this.ids[n] = this.owner[s];
              this.slots[n] = s;
              n++;
              if (n >= cap) return n;
            }
          }
        }
      }
    }
    return n;
  }
}
