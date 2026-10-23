/*
 * KEŞİF — suakisi ("Su Akışı"): saf mantık (karo ızgarası, akış hesabı, çözülebilir üretim). DOM/three yok.
 *
 * Boru bulmacası: C×R karo ızgarası; her karo 3×3 blok. Karoda oluk kolları vardır (yön 0=K(−gz) 1=D(+gx) 2=G(+gz) 3=B(−gx)); karo
 * sağa-çevirme (saat yönü) ile döner: kol d → (d+rot)%4. İki komşu karo, birinin kolu diğerine bakıp diğerinin kolu da ona
 * bakıyorsa bağlıdır. Su kaynağından başlayan bağlı bileşen "ıslak"tır; kaynaktan uzaklık (karo adımı) akışın dolma sırasını verir.
 *
 *   tipler: 'straight' (K,G) · 'corner' (K,D) · 'tee' (K,D,G) · 'blank' (kolsuz engel) ·
 *           'ws' su kaynağı · 'wk' su alıcısı · 'ls' lav kaynağı · 'lk' lav havuzu (uçlar tek kollu: K, sabit dönüşlü)
 *   armsOf(type, rot) → [dir…],  armMask(type, rot)
 *   evaluate(lay, rots) → { W, V (uzaklık dizileri, −1 = ıslak değil / null), conflict:[idx], waterOk, lavaOk, solved, maxDist }
 *   generateSu(difficulty, rng) → { lay, rots (karıştırılmış başlangıç) , sol (çözüm dönüşleri) }
 *
 * Çözüm kuralı: su alıcıya ulaşır; lav bileşeni su bileşenine HİÇ bağlanmaz (karışım = çakışma → obsidyen); lav havuzu gerekiyorsa
 * (d5) lav kaynağından havuza da ulaşır. Üretici çözümü kurar, kanıtlar (evaluate) ve karıştırır (başlangıç çözülmüş değildir).
 *
 * lay: { w,d,h, x0,x1, C,R, bx,bz (tahta sol-ön köşe, yerel), tiles:[{t, fixed, rot0}], src, sink, lsrc, lsink (−1 yok), needLava,
 *        reset:{lx,lz}, movable:[idx…] }
 */
import { localXRange } from './kitGeometry.js';
import { chamberSize } from './kitChamber.js';

export const TILE = 3;
export const REVEAL_STEP = 0.3;
export const SU_HOLD = 1.0;

const BASE_ARMS = {
  straight: [0, 2], corner: [0, 1], tee: [0, 1, 2], blank: [], ws: [0], wk: [0], ls: [0], lk: [0],
};
const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];

const LEVELS = {
  1: {
    C: 5, R: 3, minLen: 5, tees: 0, decoy: 0.0, lava: 0,
  },
  2: {
    C: 6, R: 4, minLen: 8, tees: 0, decoy: 0.5, lava: 0,
  },
  3: {
    C: 6, R: 5, minLen: 11, tees: 1, decoy: 0.7, lava: 0,
  },
  4: {
    C: 7, R: 5, minLen: 12, tees: 2, decoy: 0.7, lava: 1,
  },
  5: {
    C: 8, R: 5, minLen: 14, tees: 3, decoy: 0.8, lava: 2,
  },
};

export function clampSuDifficulty(d) {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(5, n));
}

export function suSize(difficulty) {
  const c = LEVELS[clampSuDifficulty(difficulty)];
  return chamberSize(TILE * c.C + 5, TILE * c.R + 6, 6);
}

export function armsOf(type, rot) {
  const base = BASE_ARMS[type] || [];
  const out = [];
  for (let i = 0; i < base.length; i++) out.push((base[i] + rot) % 4);
  return out;
}

export function armMask(type, rot) {
  const a = armsOf(type, rot);
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= 1 << a[i];
  return m;
}

/** Karo içi oluk hücreleri (karo-yerel 0..2): merkez + kollar. */
export function grooveCells(type, rot) {
  if (type === 'blank') return [];
  const out = [[1, 1]];
  const arms = armsOf(type, rot);
  const off = [[1, 0], [2, 1], [1, 2], [0, 1]];
  for (let i = 0; i < arms.length; i++) out.push(off[arms[i]]);
  return out;
}

function flood(lay, masks, start) {
  const n = lay.C * lay.R;
  const dist = new Array(n).fill(-1);
  if (start < 0) return dist;
  dist[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const gx = i % lay.C;
    const gz = (i - gx) / lay.C;
    for (let d = 0; d < 4; d++) {
      if (!(masks[i] & (1 << d))) continue;
      const nx = gx + DX[d];
      const nz = gz + DZ[d];
      if (nx < 0 || nx >= lay.C || nz < 0 || nz >= lay.R) continue;
      const j = nz * lay.C + nx;
      if (dist[j] >= 0 || !(masks[j] & (1 << ((d + 2) % 4)))) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return dist;
}

export function evaluate(lay, rots) {
  const n = lay.C * lay.R;
  const masks = new Array(n);
  for (let i = 0; i < n; i++) masks[i] = armMask(lay.tiles[i].t, rots[i]);
  const W = flood(lay, masks, lay.src);
  const V = lay.lsrc >= 0 ? flood(lay, masks, lay.lsrc) : null;
  const conflict = [];
  if (V) for (let i = 0; i < n; i++) if (W[i] >= 0 && V[i] >= 0) conflict.push(i);
  const waterOk = W[lay.sink] >= 0 && conflict.length === 0;
  const lavaOk = V ? V[lay.lsink] >= 0 : true;
  const solved = waterOk && (!lay.needLava || lavaOk) && conflict.length === 0;
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    if (W[i] > maxDist) maxDist = W[i];
    if (V && V[i] > maxDist) maxDist = V[i];
  }
  return {
    W, V, conflict, waterOk, lavaOk, solved, maxDist,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Üretici
 * ---------------------------------------------------------------------------------------------- */
function neighbors(C, R, gx, gz) {
  const out = [];
  for (let d = 0; d < 4; d++) {
    const nx = gx + DX[d];
    const nz = gz + DZ[d];
    if (nx >= 1 && nx <= C - 2 && nz >= 0 && nz < R) out.push({ d, gx: nx, gz: nz });
  }
  return out;
}

/** Kendini kesmeyen rastgele yol (başlangıç ve bitiş hücreleri dahil); sütunlar 1..C−2. */
function randomPath(rng, C, R, start, end, blocked, minLen, maxLen) {
  const used = new Set(blocked);
  const path = [start];
  used.add(start.gz * C + start.gx);
  let budget = 4000;
  const dfs = () => {
    budget--;
    if (budget < 0) return false;
    const cur = path[path.length - 1];
    if (cur.gx === end.gx && cur.gz === end.gz) return path.length >= minLen;
    if (path.length >= maxLen) return false;
    const nb = neighbors(C, R, cur.gx, cur.gz);
    rng.shuffle(nb);
    for (let i = 0; i < nb.length; i++) {
      const key = nb[i].gz * C + nb[i].gx;
      if (used.has(key)) continue;
      // bitişe ulaşmadan bitiş hücresine girme
      if (nb[i].gx === end.gx && nb[i].gz === end.gz && path.length + 1 < minLen) continue;
      used.add(key);
      path.push({ gx: nb[i].gx, gz: nb[i].gz });
      if (dfs()) return true;
      path.pop();
      used.delete(key);
    }
    return false;
  };
  return dfs() ? path.slice() : null;
}

function dirBetween(a, b) {
  for (let d = 0; d < 4; d++) if (a.gx + DX[d] === b.gx && a.gz + DZ[d] === b.gz) return d;
  return 0;
}

/** İstenen kol kümesini (dir listesi) veren (tip, rot) çifti. */
function rotFor(type, dirs) {
  for (let r = 0; r < 4; r++) {
    const a = armsOf(type, r).slice().sort().join(',');
    if (a === dirs.slice().sort().join(',')) return r;
  }
  return -1;
}

function pathTiles(path, tiles, rots, C, teeSet) {
  for (let k = 1; k < path.length - 1; k++) {
    const prev = dirBetween(path[k], path[k - 1]);
    const next = dirBetween(path[k], path[k + 1]);
    const idx = path[k].gz * C + path[k].gx;
    if (teeSet.has(idx)) continue;
    const type = (prev + 2) % 4 === next ? 'straight' : 'corner';
    tiles[idx] = { t: type, fixed: false, rot0: 0 };
    rots[idx] = rotFor(type, [prev, next]);
  }
}

function makeCandidate(rng, diff, relax) {
  const c = relax ? Object.assign({}, LEVELS[diff], { minLen: 3, tees: 0, lava: 0 }) : LEVELS[diff];
  const { C, R } = c;
  const n = C * R;
  const tiles = new Array(n);
  const rots = new Array(n).fill(0);
  for (let i = 0; i < n; i++) tiles[i] = { t: 'blank', fixed: true, rot0: 0 };
  const sr = rng.int(0, R - 1);
  const tr = rng.int(0, R - 1);
  const wpath = randomPath(rng, C, R, { gx: 1, gz: sr }, { gx: C - 2, gz: tr }, [], c.minLen, C * R);
  if (!wpath) return null;
  const src = sr * C;
  const sink = tr * C + (C - 1);
  tiles[src] = { t: 'ws', fixed: true, rot0: 1 };
  rots[src] = 1;
  tiles[sink] = { t: 'wk', fixed: true, rot0: 3 };
  rots[sink] = 3;
  const full = [{ gx: 0, gz: sr }].concat(wpath, [{ gx: C - 1, gz: tr }]);
  // tee seçimi: yol ortasındaki hücrelerden, yan komşusu serbest olanlar
  const pathKeys = new Set(full.map((p) => p.gz * C + p.gx));
  const teeSet = new Map();
  let lsrc = -1;
  let lsink = -1;
  let lpath = null;
  if (c.lava > 0) {
    let lr = rng.int(0, R - 1);
    let tries = 0;
    while (lr === sr && tries++ < 10) lr = rng.int(0, R - 1);
    let lk = rng.int(0, R - 1);
    tries = 0;
    while (lk === tr && tries++ < 10) lk = rng.int(0, R - 1);
    lpath = randomPath(rng, C, R, { gx: 1, gz: lr }, { gx: C - 2, gz: lk }, wpath.map((p) => p.gz * C + p.gx), 3, C * R);
    if (!lpath || lr === sr || lk === tr) return null;
    lsrc = lr * C;
    lsink = lk * C + (C - 1);
    tiles[lsrc] = { t: 'ls', fixed: true, rot0: 1 };
    rots[lsrc] = 1;
    tiles[lsink] = { t: 'lk', fixed: true, rot0: 3 };
    rots[lsink] = 3;
  }
  // tee'ler
  const cand = [];
  for (let k = 1; k < full.length - 1; k++) {
    const p = full[k];
    const prev = dirBetween(p, full[k - 1]);
    const next = dirBetween(p, full[k + 1]);
    for (let d = 0; d < 4; d++) {
      if (d === prev || d === next) continue;
      const nx = p.gx + DX[d];
      const nz = p.gz + DZ[d];
      if (nx < 1 || nx > C - 2 || nz < 0 || nz >= R) continue;
      const key = nz * C + nx;
      if (pathKeys.has(key)) continue;
      cand.push({ k, p, prev, next, extra: d, nkey: key });
    }
  }
  rng.shuffle(cand);
  const usedCells = new Set();
  let wantTees = c.tees;
  for (let i = 0; i < cand.length && wantTees > 0; i++) {
    const t = cand[i];
    const idx = t.p.gz * C + t.p.gx;
    if (teeSet.has(idx) || usedCells.has(t.nkey)) continue;
    teeSet.set(idx, t);
    usedCells.add(t.nkey);
    wantTees--;
  }
  const teeKeys = new Set(teeSet.keys());
  pathTiles(full, tiles, rots, C, teeKeys);
  teeSet.forEach((t, idx) => {
    tiles[idx] = { t: 'tee', fixed: false, rot0: 0 };
    rots[idx] = rotFor('tee', [t.prev, t.next, t.extra]);
  });
  if (lpath) {
    const lfull = [{ gx: 0, gz: lsrc / C }].concat(lpath, [{ gx: C - 1, gz: (lsink - (C - 1)) / C }]);
    const lKeys = new Set();
    pathTiles(lfull, tiles, rots, C, lKeys);
  }
  const lay = {
    C,
    R,
    tiles,
    src,
    sink,
    lsrc,
    lsink,
    needLava: c.lava === 2,
  };
  // karo kolları: ön tanımlı dönüşleri rot0 olarak kaydet
  for (let i = 0; i < n; i++) tiles[i].rot0 = rots[i];
  // dekor karolar (çözümde çatışma çıkarmayan dönüşle)
  const empties = [];
  for (let i = 0; i < n; i++) {
    const gx = i % C;
    if (tiles[i].t === 'blank' && gx >= 1 && gx <= C - 2) empties.push(i);
  }
  rng.shuffle(empties);
  for (let q = 0; q < empties.length; q++) {
    const i = empties[q];
    if (!rng.chance(c.decoy)) continue;
    const type = rng.pick(['straight', 'corner', 'corner', 'tee']);
    const order = [0, 1, 2, 3];
    rng.shuffle(order);
    let ok = false;
    for (let k = 0; k < 4 && !ok; k++) {
      tiles[i] = { t: type, fixed: false, rot0: order[k] };
      rots[i] = order[k];
      if (evaluate(lay, rots).solved) ok = true;
    }
    if (!ok) {
      tiles[i] = { t: 'blank', fixed: true, rot0: 0 };
      rots[i] = 0;
    }
  }
  return { lay, rots, sol: rots.slice() };
}

function scramble(rng, lay, sol) {
  const n = lay.C * lay.R;
  const rots = sol.slice();
  for (let i = 0; i < n; i++) {
    if (lay.tiles[i].fixed) continue;
    rots[i] = rng.int(0, 3);
  }
  return rots;
}

function equivalent(type, a, b) {
  if (type === 'straight') return a % 2 === b % 2;
  return a === b;
}

/** Son çare: kaynak ile alıcı arasında düz bir sıra; her zaman çözülebilir (üretici başarısız olursa). */
function trivialCandidate(diff) {
  const c = LEVELS[diff];
  const { C, R } = c;
  const n = C * R;
  const tiles = new Array(n);
  const sol = new Array(n).fill(0);
  for (let i = 0; i < n; i++) tiles[i] = { t: 'blank', fixed: true, rot0: 0 };
  const row = R >> 1;
  const base = row * C;
  tiles[base] = { t: 'ws', fixed: true, rot0: 1 };
  sol[base] = 1;
  tiles[base + C - 1] = { t: 'wk', fixed: true, rot0: 3 };
  sol[base + C - 1] = 3;
  for (let gx = 1; gx <= C - 2; gx++) {
    tiles[base + gx] = { t: 'straight', fixed: false, rot0: 1 };
    sol[base + gx] = 1;
  }
  const lay = {
    C, R, tiles, src: base, sink: base + C - 1, lsrc: -1, lsink: -1, needLava: false,
  };
  const start = sol.slice();
  for (let gx = 1; gx <= C - 2; gx++) start[base + gx] = gx % 2 === 0 ? 0 : 1;
  start[base + 1] = 0;
  start[base + 2] = 0;
  return { c: { lay, rots: sol, sol }, start };
}

/** Karıştırılmış başlangıç + çözüm; belirlenimli. */
export function generateSu(difficulty, rng) {
  const diff = clampSuDifficulty(difficulty);
  const size = suSize(diff);
  const xr = localXRange(size.w);
  let cand = null;
  for (let attempt = 0; attempt < 260 && !cand; attempt++) {
    const c = makeCandidate(rng, diff, attempt >= 200);
    if (!c) continue;
    if (!evaluate(c.lay, c.sol).solved) continue;
    let start = null;
    for (let s = 0; s < 30 && !start; s++) {
      const r = scramble(rng, c.lay, c.sol);
      if (evaluate(c.lay, r).solved) continue;
      let wrong = 0;
      let total = 0;
      for (let i = 0; i < r.length; i++) {
        if (c.lay.tiles[i].fixed) continue;
        total++;
        if (!equivalent(c.lay.tiles[i].t, r[i], c.sol[i])) wrong++;
      }
      if (wrong >= Math.max(2, Math.ceil(total * 0.4))) start = r;
    }
    if (start) cand = { c, start };
  }
  if (!cand) cand = trivialCandidate(diff);
  const { lay, sol } = cand.c;
  const movable = [];
  for (let i = 0; i < lay.tiles.length; i++) if (!lay.tiles[i].fixed) movable.push(i);
  const full = Object.assign({}, lay, {
    w: size.w,
    d: size.d,
    h: size.h,
    x0: xr.x0,
    x1: xr.x1,
    bx: xr.x0 + 2,
    bz: 3,
    reset: { lx: xr.x1 - 1, lz: 1 },
    movable,
  });
  return { lay: full, rots: cand.start, sol };
}
