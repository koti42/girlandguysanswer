/*
 * KEŞİF sim/city — yeraltı + çatı içeriği testleri için ORTAK YARDIMCILAR (yalnız test dosyaları içe aktarır; üretim yolu içe aktarmaz).
 *
 *  BigWriter(x0,z0,x1,z1,yBase,yEnd)   CityWriter arayüzlü, rastgele boyutlu yazıcı ("bütün" inşa referansı)
 *  chunkReader(seed, o?)               {getBlock(x,y,z)} gerçek generateCityChunk ile (o.deep: derin kesitler; o.overlay: Map("x,y,z"→id) kapı/açık durumu)
 *  sliceUnion(seed, region, fn)        region {x0,z0,x1,z1,y0,y1} için chunk dilimleriyle yazar → {get(x,y,z)} (fn(w) her chunk penceresinde çağrılır)
 *  Nav3(getBlock)                      3B yürüme/merdiven/zıplama/düşme BFS (oyuncu hücre modeli): bfs(starts, {box, maxNodes}) → {seen:Set, oneWay, nodes}
 *  hasNode(nav, x,y,z)                 ayakta durulabilir düğüm mü
 */
import { BLOCKS } from '../blocks.js';
import { CityWriter } from './cityEmit.js';
import { generateCityChunk, generateCitySection } from './cityGen.js';

export class BigWriter {
  constructor(x0, z0, x1, z1, yBase, yEnd) {
    this.x0 = x0;
    this.z0 = z0;
    this.x1 = x1;
    this.z1 = z1;
    this.yBase = yBase;
    this.yEnd = yEnd;
    this.w = x1 - x0;
    this.d = z1 - z0;
    this.blocks = new Uint8Array(this.w * this.d * (yEnd - yBase));
  }

  _i(x, y, z) {
    return ((y - this.yBase) * this.d + (z - this.z0)) * this.w + (x - this.x0);
  }

  _in(x, y, z) {
    return x >= this.x0 && x < this.x1 && z >= this.z0 && z < this.z1 && y >= this.yBase && y < this.yEnd;
  }

  touches(xa, za, xb, zb) {
    return xa < this.x1 && xb > this.x0 && za < this.z1 && zb > this.z0;
  }

  touchesY(ya, yb) {
    return ya < this.yEnd && yb > this.yBase;
  }

  set(x, y, z, id) {
    if (this._in(x, y, z)) this.blocks[this._i(x, y, z)] = id;
  }

  setAir(x, y, z, id) {
    if (this._in(x, y, z) && this.blocks[this._i(x, y, z)] === 0) this.blocks[this._i(x, y, z)] = id;
  }

  get(x, y, z) {
    return this._in(x, y, z) ? this.blocks[this._i(x, y, z)] : 0;
  }

  box(xa, ya, za, xb, yb, zb, id) {
    for (let y = Math.max(ya, this.yBase); y < Math.min(yb, this.yEnd); y++) {
      for (let z = Math.max(za, this.z0); z < Math.min(zb, this.z1); z++) {
        for (let x = Math.max(xa, this.x0); x < Math.min(xb, this.x1); x++) this.blocks[this._i(x, y, z)] = id;
      }
    }
  }

  boxAir(xa, ya, za, xb, yb, zb, id) {
    for (let y = Math.max(ya, this.yBase); y < Math.min(yb, this.yEnd); y++) {
      for (let z = Math.max(za, this.z0); z < Math.min(zb, this.z1); z++) {
        for (let x = Math.max(xa, this.x0); x < Math.min(xb, this.x1); x++) if (this.blocks[this._i(x, y, z)] === 0) this.blocks[this._i(x, y, z)] = id;
      }
    }
  }

  clearBox(xa, ya, za, xb, yb, zb) {
    this.box(xa, ya, za, xb, yb, zb, 0);
  }

  col(x, z, ya, yb, id) {
    this.box(x, ya, z, x + 1, yb, z + 1, id);
  }
}

/** Gerçek chunk üretimiyle blok okuyucu (önbellekli). o.deep: sections 'all' (y<0); o.overlay: Map("x,y,z" → blok). */
export function chunkReader(seed, o) {
  const op = o || {};
  const cache = new Map();
  const get = (x, y, z) => {
    if (op.overlay) {
      const v = op.overlay.get(x + ',' + y + ',' + z);
      if (v !== undefined) return v;
    }
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const k = cx + ',' + cz;
    let c = cache.get(k);
    if (!c) {
      c = generateCityChunk(seed, cx, cz, op.deep ? { light: false, sections: 'all' } : { light: false });
      cache.set(k, c);
    }
    return c.get(x - cx * 16, y, z - cz * 16);
  };
  return { getBlock: get, cache };
}

/** Yalnız belirli derin kesitleri tembel üreten okuyucu (lab/kasa); yüzey bandı chunk'tan. */
export function sectionReader(seed, o) {
  const op = o || {};
  const chunks = new Map();
  const secs = new Map();
  return {
    getBlock(x, y, z) {
      if (op.overlay) {
        const v = op.overlay.get(x + ',' + y + ',' + z);
        if (v !== undefined) return v;
      }
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      if (y >= 0) {
        const k = cx + ',' + cz;
        let c = chunks.get(k);
        if (!c) {
          c = generateCityChunk(seed, cx, cz, { light: false });
          chunks.set(k, c);
        }
        return c.get(x - cx * 16, y, z - cz * 16);
      }
      const si = (y + 400) >> 4;
      const k = cx + ',' + cz + ',' + si;
      let s = secs.get(k);
      if (!s) {
        const r = generateCitySection(seed, cx, cz, si);
        s = r.blocks ? { b: r.blocks.slice(), u: 0 } : { b: null, u: r.uniform };
        secs.set(k, s);
      }
      if (!s.b) return s.u;
      const ly = y + 400 - si * 16;
      return s.b[(ly << 8) + ((z - cz * 16) << 4) + (x - cx * 16)];
    },
  };
}

/** Chunk dilimleriyle yazım: region {x0,z0,x1,z1 (16 hizalı), y0,y1}; fn(w) her pencerede çağrılır; taban taş. */
export function sliceUnion(region, fn, baseId, order) {
  const H = region.y1 - region.y0;
  const maps = new Map();
  const cks = [];
  for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) cks.push([cx, cz]);
  if (order === 'reverse') cks.reverse();
  for (let i = 0; i < cks.length; i++) {
    const [cx, cz] = cks[i];
    const arr = new Uint8Array(H * 256);
    if (baseId) arr.fill(baseId);
    const w = new CityWriter(arr, cx * 16, cz * 16, region.y0, H);
    fn(w);
    maps.set(cx + ',' + cz, arr);
  }
  return {
    get(x, y, z) {
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const arr = maps.get(cx + ',' + cz);
      if (!arr || y < region.y0 || y >= region.y1) return 0;
      return arr[((y - region.y0) << 8) + ((z - cz * 16) << 4) + (x - cx * 16)];
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * 3B yürüme modeli (physics.js sabitleri: zıplama +1, düşüş ≤3, merdiven tırmanma)
 * ---------------------------------------------------------------------------------------------- */
const SOLID = new Uint8Array(256);
const CUBE = new Uint8Array(256);
const SLAB = new Uint8Array(256);
const LAD = new Uint8Array(256);
for (let id = 1; id < 255; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  const coll = b.collision || [];
  SOLID[id] = coll.length > 0 ? 1 : 0;
  CUBE[id] = b.cube ? 1 : 0;
  if (coll.length === 1 && coll[0][4] <= 0.5 && !b.cube) SLAB[id] = 1;
  LAD[id] = b.climbable ? 1 : 0;
}

export const isFree = (id) => id === 0 || SOLID[id] === 0 || SLAB[id] === 1;
export const isLadder = (id) => LAD[id] === 1;

const OFF = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const KX = 2048;
const KY = 2048 * 2048;
const key = (x, y, z) => (y + 512) * KY + (z + 1024) * KX + (x + 1024);

export class Nav3 {
  constructor(getBlock) {
    this.g = getBlock;
  }

  /** (x,y,z) ayak hücresi ayakta durulabilir bir düğüm mü. */
  node(x, y, z) {
    const g = this.g;
    const f = g(x, y, z);
    if (!isFree(f) || !isFree(g(x, y + 1, z))) return false;
    if (LAD[f] === 1) return true;
    const b = g(x, y - 1, z);
    return CUBE[b] === 1 || SLAB[b] === 1;
  }

  /**
   * starts: [[x,y,z]…] (düğüm olmalıdır); o: {box:{x0,x1,z0,z1,y0,y1}, maxNodes}. Döner {seen:Set<number>, count, oneWay, list:[x,y,z…]}.
   * oneWay: geri dönüşü olmayan düşüşler (≥2 blok) — dengeli alt yapıda 0 olmalıdır.
   */
  bfs(starts, o) {
    const op = o || {};
    const box = op.box || { x0: -800, x1: 800, z0: -800, z1: 800, y0: -400, y1: 360 };
    const maxNodes = op.maxNodes || 3000000;
    const g = this.g;
    const seen = new Map(); // anahtar → düğüm indeksi
    const qx = [];
    const qy = [];
    const qz = [];
    const eFrom = [];
    const eTo = [];
    let oneWay = 0;
    const oneWayAt = [];
    const inBox = (x, y, z) => x >= box.x0 && x < box.x1 && z >= box.z0 && z < box.z1 && y >= box.y0 && y < box.y1;
    const visit = (from, x, y, z) => {
      const k = key(x, y, z);
      let i = seen.get(k);
      if (i === undefined) {
        i = qx.length;
        seen.set(k, i);
        qx.push(x);
        qy.push(y);
        qz.push(z);
      }
      if (from >= 0) {
        eFrom.push(from);
        eTo.push(i);
      }
    };
    for (let i = 0; i < starts.length; i++) {
      const s0 = starts[i];
      if (inBox(s0[0], s0[1], s0[2]) && this.node(s0[0], s0[1], s0[2])) visit(-1, s0[0], s0[1], s0[2]);
    }
    const nStart = qx.length;
    let head = 0;
    while (head < qx.length && qx.length < maxNodes) {
      const x = qx[head];
      const y = qy[head];
      const z = qz[head];
      const me = head;
      head++;
      if (LAD[g(x, y, z)] === 1) {
        if (inBox(x, y + 1, z) && this.node(x, y + 1, z) && LAD[g(x, y + 1, z)] === 1) visit(me, x, y + 1, z);
        if (inBox(x, y - 1, z) && this.node(x, y - 1, z)) visit(me, x, y - 1, z);
      }
      for (let d = 0; d < 4; d++) {
        const nx = x + OFF[d][0];
        const nz = z + OFF[d][1];
        if (inBox(nx, y, nz) && this.node(nx, y, nz)) visit(me, nx, y, nz);
        if (inBox(nx, y + 1, nz) && isFree(g(x, y + 2, z)) && this.node(nx, y + 1, nz)) visit(me, nx, y + 1, nz);
        for (let dy = 1; dy <= 3; dy++) {
          const ty = y - dy;
          if (!inBox(nx, ty, nz)) break;
          let clear = true;
          for (let k = ty + 2; k <= y + 1; k++) if (!isFree(g(nx, k, nz))) { clear = false; break; }
          if (!clear) break;
          if (this.node(nx, ty, nz)) {
            if (dy >= 2) {
              oneWay++;
              if (oneWayAt.length < 6) oneWayAt.push([x, y, z, nx, ty, nz]);
            }
            visit(me, nx, ty, nz);
            break;
          }
        }
      }
    }
    // ters erişilebilirlik: başlangıçlara (sokak) geri dönemeyen düğümler (tuzak)
    const N = qx.length;
    const deg = new Int32Array(N + 1);
    for (let i = 0; i < eTo.length; i++) deg[eTo[i] + 1]++;
    for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
    const adj = new Int32Array(eTo.length);
    const pos = deg.slice(0, N);
    for (let i = 0; i < eTo.length; i++) adj[pos[eTo[i]]++] = eFrom[i];
    const back = new Uint8Array(N);
    const st = [];
    for (let i = 0; i < nStart; i++) { back[i] = 1; st.push(i); }
    while (st.length) {
      const v = st.pop();
      for (let p = deg[v]; p < deg[v + 1]; p++) {
        const u = adj[p];
        if (!back[u]) { back[u] = 1; st.push(u); }
      }
    }
    const trapped = [];
    let trappedCount = 0;
    for (let i = 0; i < N; i++) {
      if (!back[i]) {
        trappedCount++;
        if (trapped.length < 6) trapped.push([qx[i], qy[i], qz[i]]);
      }
    }
    return {
      seen, count: N, oneWay, oneWayAt, qx, qy, qz, trapped, trappedCount,
    };
  }

  has(res, x, y, z) {
    return res.seen.has(key(x, y, z));
  }
}

export { key as navKey };

/** Yüzey bandından yoğun dilimli hızlı okuyucu: y0..y0+h (y0 ≥ 0). o.overlay: Map("x,y,z" → id). */
export function denseReader(seed, y0, h, o) {
  const op = o || {};
  const cache = new Map();
  return {
    getBlock(x, y, z) {
      if (op.overlay) {
        const v = op.overlay.get(x + ',' + y + ',' + z);
        if (v !== undefined) return v;
      }
      if (y < y0 || y >= y0 + h) return 1;
      const cx = x >> 4;
      const cz = z >> 4;
      const k = (cx + 64) * 256 + (cz + 64);
      let a = cache.get(k);
      if (!a) {
        a = generateCityChunk(seed, cx, cz, { light: false }).toDense(y0, h).slice();
        cache.set(k, a);
      }
      return a[((y - y0) << 8) + ((z & 15) << 4) + (x & 15)];
    },
    cache,
  };
}

/** Kilit çözümü sonrası (tümü açık) ya da yalnız kilitsiz kapıların açık olduğu hücre örtüsü. */
export function doorOverlay(doors, mode) {
  const m = new Map();
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    const open = mode === 'all' || (mode === 'free' && d.lock === null) || (Array.isArray(mode) && d.lock && mode.indexOf(d.lock.id) >= 0) || (Array.isArray(mode) && d.lock === null);
    if (!open) continue;
    for (let c = 0; c < d.cells.length; c++) m.set(d.cells[c].x + ',' + d.cells[c].y + ',' + d.cells[c].z, d.cells[c].open);
  }
  return m;
}
