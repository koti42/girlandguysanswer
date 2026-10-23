/*
 * KEŞİF — golgekopru ("Gölge Mimarisi"): saf mantık (yerleşim üretici + gölge izdüşümü + hizalama ölçüsü). DOM/three yok.
 *
 * Fizik modeli (basit, sezgisel, belirlenimli): ışık kulesinin yönü (azimut az, yükseklik açısı el) tektir. Yerden
 * `by − ps` yüksekte süzülen bir monolit (dikdörtgen levha; genişlik 3 × derinlik D), ışığın gölge yönü u(θ)=(sinθ, cosθ)
 * (yerel lx, lz) boyunca `ρ = (by − ps)·cot(φ)` kadar kayık bir gölge bırakır:
 *     gölge köşesi = yuvarla( taban + ρ·u(θ) )
 * Her monolitin gölgesi, köprü şeridindeki kendi HEDEF dilimine (tx,tz) oturunca o monolit "hizalı"dır. Hepsi hizalanınca
 * gölge köprü kristale katılaşır. Hizalama yüzdesi (ısınıyor ipucu) hücre uzaklıklarından türer: tam isabet = %100.
 *
 *   golgeLayout(difficulty, rng) → layout (JSON)
 *   shadowCells(sec, az, el) → [{x,z,dx,dz,d}]  her monolit için gölge köşesi ve hedefe hücre uzaklığı
 *   alignment(sec, az, el) → {pct, aligned:boolean, perMono:[bool]},  visibleShadowCells(sec, az, el, x0, x1)
 *   solveSection(sec) → {steps, path} | null    kol adımlarıyla (az ±1 dairesel, el ±1 sınırlı) hedefe en kısa yol (BFS)
 *   countAligned(sec) → hizalı (az,el) çiftlerinin sayısı (1 = tek çözüm)
 *   ringOffsets(nAz), lampOffset(sec, az), bridgeStage(row, bt), bridgeDuration(G)
 *
 * layout: { w,d,h, x0,x1, ps, reset:{lx,ly,lz}, cps:[{lx,ly,lz}], strict:boolean,
 *   sections:[{k, r0 (yakın bölge ilk satır), c0,c1,G (çukur satırları), P:{lx,lz} (kule), ringR, nAz, nEl, cot:[…el başına],
 *     mono:[{bx,bz,w,dz,by,tx,tz}], target:{az,el}, start:{az,el},
 *     lev:{azM,azP,elM,elP:{lx,ly,lz}}}] }
 */
import { localXRange } from './kitGeometry.js';
import { chamberSize } from './kitChamber.js';

export const SHADOW_PS = -2;
export const NEAR_ROWS = 5;
export const FAR_ROWS = 3;
export const MONO_W = 3;
export const HALL_H = 10;
export const BRIDGE_ROW_DELAY = 0.18;
export const BRIDGE_GHOST_TIME = 0.7;

const ELEV = { 3: [40, 50, 60], 4: [35, 45, 55, 65], 5: [30, 40, 50, 60, 70] };

const LEVELS = {
  1: {
    sections: 1, G: 6, nAz: 8, nEl: 3, depths: [3, 3],
  },
  2: {
    sections: 1, G: 6, nAz: 8, nEl: 4, depths: [2, 2, 2],
  },
  3: {
    sections: 1, G: 8, nAz: 12, nEl: 4, depths: [3, 3, 2],
  },
  4: {
    sections: 2, G: 6, nAz: 12, nEl: 4, depths: [2, 2, 2],
  },
  5: {
    sections: 2, G: 8, nAz: 12, nEl: 5, depths: [2, 2, 2, 2],
  },
};

export function clampGolgeDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

export function golgeSize(difficulty) {
  const c = LEVELS[clampGolgeDifficulty(difficulty)];
  const d = NEAR_ROWS + c.G + (c.sections - 1) * (NEAR_ROWS + c.G) + FAR_ROWS;
  return chamberSize(9, d, HALL_H);
}

/** Halka hücreleri (lamba/kadran): nAz=8 → yarıçap 1 (8 komşu), nAz=12 → yarıçap 2 (12 hücre); açı sırasıyla (θ=0 → +lz). */
export function ringOffsets(nAz) {
  if (nAz === 8) return [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
  return [[0, 2], [1, 2], [2, 1], [2, 0], [2, -1], [1, -2], [0, -2], [-1, -2], [-2, -1], [-2, 0], [-2, 1], [-1, 2]];
}

/** Işığın (lamba) halkadaki hücresi: gölge yönünün tersi. Döner [dx,dz] (kuleye göre). */
export function lampOffset(sec, az) {
  const offs = ringOffsets(sec.nAz);
  return offs[(az + (sec.nAz >> 1)) % sec.nAz];
}

function cotOf(deg) {
  return 1 / Math.tan((deg * Math.PI) / 180);
}

export function shadowCells(sec, az, el) {
  const th = (az * 2 * Math.PI) / sec.nAz;
  const su = Math.sin(th);
  const cu = Math.cos(th);
  const out = [];
  for (let k = 0; k < sec.mono.length; k++) {
    const m = sec.mono[k];
    const rho = (m.by - SHADOW_PS) * sec.cot[el];
    const x = Math.round(m.bx + rho * su);
    const z = Math.round(m.bz + rho * cu);
    const dx = x - m.tx;
    const dz = z - m.tz;
    out.push({
      x, z, dx, dz, d: Math.sqrt(dx * dx + dz * dz),
    });
  }
  return out;
}

/** Gölgelerin çukur zemini içinde kalan toplam hücre sayısı (başlangıçta en az birkaçı görünsün diye). */
export function visibleShadowCells(sec, az, el, x0, x1) {
  const sh = shadowCells(sec, az, el);
  let n = 0;
  for (let k = 0; k < sh.length; k++) {
    const m = sec.mono[k];
    for (let dz = 0; dz < m.dz; dz++) {
      for (let dx = 0; dx < m.w; dx++) {
        const lx = sh[k].x + dx;
        const lz = sh[k].z + dz;
        if (lx >= x0 && lx <= x1 && lz >= sec.c0 && lz <= sec.c1) n++;
      }
    }
  }
  return n;
}

export function alignment(sec, az, el) {
  const cells = shadowCells(sec, az, el);
  let sum = 0;
  const per = [];
  let all = true;
  for (let k = 0; k < cells.length; k++) {
    sum += cells[k].d;
    const ok = cells[k].d === 0;
    per.push(ok);
    if (!ok) all = false;
  }
  const mean = sum / cells.length;
  let pct = all ? 100 : Math.round(100 * (1 - mean / 6));
  if (!all) pct = Math.max(0, Math.min(99, pct));
  return { pct, aligned: all, perMono: per };
}

export function countAligned(sec) {
  let n = 0;
  for (let a = 0; a < sec.nAz; a++) {
    for (let e = 0; e < sec.nEl; e++) if (alignment(sec, a, e).aligned) n++;
  }
  return n;
}

/** Kol adımlarıyla (az ±1 dairesel, el ±1 sınırlı) başlangıçtan hizaya en kısa yol. */
export function solveSection(sec) {
  const key = (a, e) => a * 16 + e;
  const start = sec.start;
  const prev = new Map();
  prev.set(key(start.az, start.el), null);
  const q = [[start.az, start.el]];
  for (let i = 0; i < q.length; i++) {
    const [a, e] = q[i];
    if (alignment(sec, a, e).aligned) {
      const path = [];
      let cur = key(a, e);
      while (cur !== null) {
        path.push([Math.floor(cur / 16), cur % 16]);
        cur = prev.get(cur);
      }
      path.reverse();
      return { steps: path.length - 1, path };
    }
    const nbs = [[(a + 1) % sec.nAz, e], [(a + sec.nAz - 1) % sec.nAz, e], [a, e + 1], [a, e - 1]];
    for (let j = 0; j < nbs.length; j++) {
      const [na, ne] = nbs[j];
      if (ne < 0 || ne >= sec.nEl) continue;
      const kk = key(na, ne);
      if (prev.has(kk)) continue;
      prev.set(kk, key(a, e));
      q.push([na, ne]);
    }
  }
  return null;
}

/** Köprü satırı evresi: 0 yok, 1 hayalet (cam), 2 katı kristal. bt = köprünün kurulmaya başladığı andan beri süre (< 0 → yok). */
export function bridgeStage(row, bt) {
  if (bt < 0) return 0;
  const u = bt - row * BRIDGE_ROW_DELAY;
  if (u < 0) return 0;
  return u < BRIDGE_GHOST_TIME ? 1 : 2;
}

export function bridgeDuration(G) {
  return (G - 1) * BRIDGE_ROW_DELAY + BRIDGE_GHOST_TIME;
}

/* ------------------------------------------------------------------------------------------------
 * Üretici
 * ---------------------------------------------------------------------------------------------- */
function boxesOverlap(a, b) {
  return a.by === b.by && a.bx <= b.bx + b.w - 1 && b.bx <= a.bx + a.w - 1 && a.bz <= b.bz + b.dz - 1 && b.bz <= a.bz + a.dz - 1;
}

function tryGenerate(rng, sec, L, strict) {
  const th = (sec.target.az * 2 * Math.PI) / sec.nAz;
  const su = Math.sin(th);
  const cu = Math.cos(th);
  const hMax = HALL_H - 3;
  const mono = [];
  for (let k = 0; k < sec.depths.length; k++) {
    const dz = sec.depths[k];
    const tz = sec.c0 + sec.depths.slice(0, k).reduce((a, b) => a + b, 0);
    const tx = -1;
    let placed = null;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      const by = rng.int(1, hMax);
      const rho = (by - SHADOW_PS) * sec.cot[sec.target.el];
      const bx = Math.round(tx - rho * su);
      const bz = Math.round(tz - rho * cu);
      const m = {
        bx, bz, w: MONO_W, dz, by, tx, tz,
      };
      if (bx < L.x0 || bx + MONO_W - 1 > L.x1 || bz < 0 || bz + dz - 1 > L.d - 1) continue;
      const inChasm = bz >= sec.c0 && bz + dz - 1 <= sec.c1;
      const hitsCorridor = !(bx + MONO_W - 1 < -1 || bx > 1);
      if (inChasm) {
        if (hitsCorridor && by < 5) continue;
      } else if (by < 6) continue;
      // hedefle tam hizalanma (yuvarlama sonrası)
      const sx = Math.round(bx + rho * su);
      const sz = Math.round(bz + rho * cu);
      if (sx !== tx || sz !== tz) continue;
      let clash = false;
      for (let q = 0; q < mono.length; q++) if (boxesOverlap(m, mono[q])) clash = true;
      if (clash) continue;
      // aynı yükseklikte yakın dizilim görsel karışıklığı: monolitler ≥ 1 hücre arayla
      placed = m;
    }
    if (!placed) return null;
    mono.push(placed);
  }
  sec.mono = mono;
  if (strict && countAligned(sec) !== 1) return null;
  return true;
}

export function golgeLayout(difficulty, rng) {
  const diff = clampGolgeDifficulty(difficulty);
  const c = LEVELS[diff];
  const size = golgeSize(diff);
  const xr = localXRange(size.w);
  const sections = [];
  let r0 = 0;
  const cps = [{ lx: 0, ly: 0, lz: 1 }];
  let strictAll = true;
  for (let k = 0; k < c.sections; k++) {
    const degs = ELEV[c.nEl];
    const sec = {
      k,
      r0,
      c0: r0 + NEAR_ROWS,
      c1: r0 + NEAR_ROWS + c.G - 1,
      G: c.G,
      P: { lx: -2, lz: r0 + 2 },
      ringR: c.nAz === 8 ? 1 : 2,
      nAz: c.nAz,
      nEl: c.nEl,
      cot: degs.map((dg) => Math.round(cotOf(dg) * 1e6) / 1e6),
      depths: c.depths.slice(),
      mono: [],
      target: { az: 0, el: 0 },
      start: { az: 0, el: 0 },
      lev: {
        azM: { lx: 2, ly: 0, lz: r0 + 1 },
        azP: { lx: 3, ly: 0, lz: r0 + 1 },
        elM: { lx: 2, ly: 0, lz: r0 + 3 },
        elP: { lx: 3, ly: 0, lz: r0 + 3 },
      },
    };
    const bounds = { x0: xr.x0, x1: xr.x1, d: size.d };
    // Başlangıç: hedeften ≥ 2 adım uzak, %80'in altında ve gölgeler çukur zemininde en az 3 hücre görünür (ilk bakışta ipucu).
    const pickStart = (needVisible) => {
      const cands = [];
      for (let a2 = 0; a2 < c.nAz; a2++) {
        for (let e2 = 0; e2 < c.nEl; e2++) {
          const al = alignment(sec, a2, e2);
          if (al.aligned || al.pct >= 80) continue;
          const da = Math.min((a2 - sec.target.az + c.nAz) % c.nAz, (sec.target.az - a2 + c.nAz) % c.nAz);
          if (da + Math.abs(e2 - sec.target.el) < 2) continue;
          if (needVisible && visibleShadowCells(sec, a2, e2, bounds.x0, bounds.x1) < 3) continue;
          cands.push({ az: a2, el: e2 });
        }
      }
      return cands.length > 0 ? cands[rng.int(0, cands.length - 1)] : null;
    };
    let ok = false;
    let strict = true;
    for (let pass = 0; pass < 3 && !ok; pass++) {
      strict = pass === 0;
      const tries = pass === 0 ? 700 : 1500;
      for (let attempt = 0; attempt < tries && !ok; attempt++) {
        sec.target = { az: rng.int(0, c.nAz - 1), el: rng.int(0, c.nEl - 1) };
        if (!tryGenerate(rng, sec, bounds, strict)) continue;
        const st = pickStart(pass < 2);
        if (st) {
          sec.start = st;
          ok = true;
        }
      }
    }
    if (!strict) strictAll = false;
    delete sec.depths;
    sections.push(sec);
    cps.push({ lx: 0, ly: 0, lz: sec.c1 + 2 });
    r0 = sec.c1 + 1;
  }
  return {
    w: size.w,
    d: size.d,
    h: size.h,
    x0: xr.x0,
    x1: xr.x1,
    ps: SHADOW_PS,
    reset: { lx: 4, ly: 0, lz: 2 },
    cps,
    strict: strictAll,
    sections,
  };
}
