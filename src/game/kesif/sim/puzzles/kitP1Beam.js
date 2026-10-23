/*
 * KEŞİF bulmaca "Işın & Ayna" — ışın izleme + yerleşim üretici (saf; DOM/three yok, worker-güvenli).
 *
 * Model (YEREL ızgara, x = lx, z = lz; ışın yatay düzlemde ilerler):
 *   yönler    0:K(0,−1) 1:D(+1,0) 2:G(0,+1) 3:B(−1,0)
 *   ayna      tek yüzlü köşegen ayna; yansıtan yüzün normali n ∈ {KD(1,−1), GD(1,1), GB(−1,1), KB(−1,−1)} (o = 0..3,
 *             saat yönünde); sağ tık o'yu +1 çevirir. Işın v, yüzüne gelirse (v·n < 0) v' = v − (v·n)n ile yansır; arkasına
 *             çarparsa söner (v·n > 0).
 *   bölücü    ışını düz geçirir + o yönünde (yalnız ışına dik ise) yan ışın üretir; o = yan ışının mutlak yönü (0..3).
 *   alıcı     ışını yutar ve yanar; engel: ışını durdurur; kaynak: sabit yönde ışın saçar.
 * Çözüm yolu ÖNCE kurulur (kaynak → aynalar → [bölücü → dal] → alıcı), sonra aynalar çözümden saptırılır: üretilen her düzen
 * çözüm yönelimleriyle izlendiğinde tüm alıcılar yanar (üreticide doğrulanır).
 */

export const DIRS = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);
export const NORMS = Object.freeze([[1, -1], [1, 1], [-1, 1], [-1, -1]]);
const MAX_STEPS = 900;

export function normIndex(nx, nz) {
  for (let i = 0; i < 4; i++) if (NORMS[i][0] === nx && NORMS[i][1] === nz) return i;
  return 0;
}

export function dirIndex(dx, dz) {
  for (let i = 0; i < 4; i++) if (DIRS[i][0] === dx && DIRS[i][1] === dz) return i;
  return 0;
}

const key = (x, z) => x + ',' + z;

/**
 * Işınları izler. L: {src:[[x,z,dir]], mir:[[x,z,o,…]], spl:[[x,z,o]], rec:[[x,z]], obs:[[x,z]], gx0,gx1,gz0,gz1}.
 * Döner: { beam:Set("x,z"), lit:boolean[] (alıcı başına), mirLit:boolean[], mirDead:number[] (arkasına çarpılan ayna indeksleri),
 *          splLit:boolean[] }
 */
export function traceBeams(L) {
  const items = new Map();
  for (let i = 0; i < L.mir.length; i++) items.set(key(L.mir[i][0], L.mir[i][1]), { t: 'm', i });
  for (let i = 0; i < L.spl.length; i++) items.set(key(L.spl[i][0], L.spl[i][1]), { t: 's', i });
  for (let i = 0; i < L.rec.length; i++) items.set(key(L.rec[i][0], L.rec[i][1]), { t: 'r', i });
  for (let i = 0; i < L.obs.length; i++) items.set(key(L.obs[i][0], L.obs[i][1]), { t: 'o', i });
  for (let i = 0; i < L.src.length; i++) items.set(key(L.src[i][0], L.src[i][1]), { t: 'b', i });
  const beam = new Set();
  const lit = new Array(L.rec.length).fill(false);
  const mirLit = new Array(L.mir.length).fill(false);
  const splLit = new Array(L.spl.length).fill(false);
  const mirDead = [];
  const seen = new Set();
  const stack = [];
  for (let i = 0; i < L.src.length; i++) {
    const s = L.src[i];
    stack.push([s[0], s[1], DIRS[s[2]][0], DIRS[s[2]][1]]);
  }
  let steps = 0;
  while (stack.length && steps < MAX_STEPS) {
    const cur = stack.pop();
    let x = cur[0];
    let z = cur[1];
    let dx = cur[2];
    let dz = cur[3];
    const sk = x + ',' + z + ',' + dx + ',' + dz;
    if (seen.has(sk)) continue;
    seen.add(sk);
    while (steps++ < MAX_STEPS) {
      x += dx;
      z += dz;
      if (x < L.gx0 || x > L.gx1 || z < L.gz0 || z > L.gz1) break;
      const it = items.get(key(x, z));
      if (!it) {
        beam.add(key(x, z));
        continue;
      }
      if (it.t === 'o' || it.t === 'b') break;
      if (it.t === 'r') {
        lit[it.i] = true;
        break;
      }
      if (it.t === 'm') {
        const n = NORMS[L.mir[it.i][2]];
        const dot = dx * n[0] + dz * n[1];
        if (dot >= 0) {
          mirDead.push(it.i);
          break;
        }
        mirLit[it.i] = true;
        const ndx = dx - dot * n[0];
        const ndz = dz - dot * n[1];
        dx = ndx;
        dz = ndz;
        const rk = x + ',' + z + ',' + dx + ',' + dz;
        if (seen.has(rk)) break;
        seen.add(rk);
        continue;
      }
      // bölücü: düz devam + (dik ise) yan ışın
      splLit[it.i] = true;
      const sd = DIRS[L.spl[it.i][2]];
      if (sd[0] * dx + sd[1] * dz === 0) stack.push([x, z, sd[0], sd[1]]);
    }
  }
  return { beam, lit, mirLit, mirDead, splLit };
}

export function allLit(tr) {
  for (let i = 0; i < tr.lit.length; i++) if (!tr.lit[i]) return false;
  return tr.lit.length > 0;
}

/* ------------------------------------------------------------------------------------------------
 * Üretim
 * ---------------------------------------------------------------------------------------------- */
const PARAMS = [
  { main: 1, branch: 0, src2: -1, split: false, decoys: 0, obs: 0 },
  { main: 2, branch: 0, src2: -1, split: false, decoys: 1, obs: 2 },
  { main: 3, branch: 0, src2: -1, split: false, decoys: 2, obs: 4 },
  { main: 2, branch: 1, src2: -1, split: true, decoys: 2, obs: 5 },
  { main: 3, branch: 2, src2: 2, split: true, decoys: 3, obs: 6 },
];
export const SIZES = Object.freeze([[9, 9], [11, 11], [13, 13], [15, 15], [17, 17]]);

/** Ortak bölge: ızgara sınırları (kapı sırası lz 0..1 serbest bırakılır). */
export function gridBounds(x0, x1, d) {
  return { gx0: x0 + 1, gx1: x1 - 1, gz0: 2, gz1: d - 2 };
}

function cheb(ax, az, bx, bz) {
  return Math.max(Math.abs(ax - bx), Math.abs(az - bz));
}

function tryLayout(rng, P, g) {
  const L = {
    src: [], mir: [], spl: [], rec: [], obs: [], ...g,
  };
  const real = { mir: [], spl: [] }; // çözüm yönelimleri
  const beamCells = new Set();
  const itemsList = [];
  const itemSet = new Set();
  const inGrid = (x, z) => x >= g.gx0 && x <= g.gx1 && z >= g.gz0 && z <= g.gz1;
  const itemOK = (x, z) => {
    if (!inGrid(x, z) || beamCells.has(key(x, z))) return false;
    for (let i = 0; i < itemsList.length; i++) if (cheb(x, z, itemsList[i][0], itemsList[i][1]) < 3) return false;
    return true;
  };
  const lineClear = (cx, cz, dx, dz, len) => {
    for (let i = 1; i < len; i++) {
      const x = cx + dx * i;
      const z = cz + dz * i;
      if (!inGrid(x, z) || itemSet.has(key(x, z)) || beamCells.has(key(x, z))) return false;
    }
    return true;
  };
  const addItem = (x, z) => {
    itemsList.push([x, z]);
    itemSet.add(key(x, z));
  };
  const maxL = Math.min(8, Math.max(g.gx1 - g.gx0, g.gz1 - g.gz0));
  const lengths = () => {
    const a = [];
    for (let l = 3; l <= maxL; l++) a.push(l);
    return rng.shuffle(a);
  };

  /** Bir kaynaktan/bölücüden zincir kurar. nodes: ['m','s','m',…] (son: alıcı). Başarılıysa true. */
  function chain(sx, sz, dir, nodes) {
    let cx = sx;
    let cz = sz;
    let d = dir;
    for (let k = 0; k <= nodes.length; k++) {
      const dx = DIRS[d][0];
      const dz = DIRS[d][1];
      let placed = false;
      const ls = lengths();
      for (let a = 0; a < ls.length && !placed; a++) {
        const len = ls[a];
        const nx = cx + dx * len;
        const nz = cz + dz * len;
        if (!itemOK(nx, nz) || !lineClear(cx, cz, dx, dz, len)) continue;
        const type = k < nodes.length ? nodes[k] : 'r';
        let turn = -1;
        if (type === 'm') {
          const opts = rng.shuffle([(d + 1) % 4, (d + 3) % 4]);
          for (let t = 0; t < 2 && turn < 0; t++) {
            const td = DIRS[opts[t]];
            if (inGrid(nx + td[0] * 3, nz + td[1] * 3)) turn = opts[t];
          }
          if (turn < 0) continue;
        } else if (type === 's') {
          if (!inGrid(nx + dx * 3, nz + dz * 3)) continue;
        }
        // geçerli: ışın hücrelerini işaretle
        for (let i = 1; i < len; i++) beamCells.add(key(cx + dx * i, cz + dz * i));
        addItem(nx, nz);
        if (type === 'r') {
          L.rec.push([nx, nz]);
        } else if (type === 'm') {
          const td = DIRS[turn];
          L.mir.push([nx, nz, 0, 1]);
          real.mir.push(normIndex(td[0] - dx, td[1] - dz));
          d = turn;
        } else {
          L.spl.push([nx, nz, 0]);
          real.spl.push(-1); // yan yön sonra belirlenir
        }
        cx = nx;
        cz = nz;
        placed = true;
      }
      if (!placed) return false;
    }
    return true;
  }

  function placeSource() {
    for (let tries = 0; tries < 30; tries++) {
      const side = rng.int(0, 3);
      let x;
      let z;
      let dir;
      if (side === 0) { x = g.gx0; z = rng.int(g.gz0, g.gz1); dir = 1; }
      else if (side === 1) { x = g.gx1; z = rng.int(g.gz0, g.gz1); dir = 3; }
      else if (side === 2) { z = g.gz1; x = rng.int(g.gx0, g.gx1); dir = 0; }
      else { z = g.gz0; x = rng.int(g.gx0, g.gx1); dir = 2; }
      if (!itemOK(x, z)) continue;
      addItem(x, z);
      L.src.push([x, z, dir]);
      return L.src.length - 1;
    }
    return -1;
  }

  // ana zincir (bölücü varsa ortada bir yere eklenir)
  const nodes = [];
  for (let i = 0; i < P.main; i++) nodes.push('m');
  if (P.split) nodes.splice(rng.int(0, nodes.length), 0, 's');
  const si = placeSource();
  if (si < 0) return null;
  const s0 = L.src[si];
  // zincir kurulurken bölücünün yan yönü, yerleştirildikten sonra seçilir: önce ana zinciri bitir
  if (!chain(s0[0], s0[1], s0[2], nodes)) return null;
  // bölücüler için yan yönü ve dalı kur
  for (let i = 0; i < L.spl.length; i++) {
    const sx = L.spl[i][0];
    const sz = L.spl[i][1];
    // ana ışının bölücüdeki yönü: ana zincirde, bölücüye gelen yön = kaynaktan/aynadan gelen yön
    const inDir = incomingDir(L, real, i);
    const sides = rng.shuffle([(inDir + 1) % 4, (inDir + 3) % 4]);
    let ok = false;
    for (let t = 0; t < 2 && !ok; t++) {
      real.spl[i] = sides[t];
      const nodesB = [];
      for (let k = 0; k < P.branch; k++) nodesB.push('m');
      const snapshot = { m: L.mir.length, r: L.rec.length, il: itemsList.length, b: new Set(beamCells) };
      const snapItems = itemSet.size;
      if (chain(sx, sz, sides[t], nodesB)) ok = true;
      else {
        L.mir.length = snapshot.m;
        L.rec.length = snapshot.r;
        real.mir.length = snapshot.m;
        itemsList.length = snapshot.il;
        beamCells.clear();
        snapshot.b.forEach((v) => beamCells.add(v));
        itemSet.clear();
        for (let q = 0; q < itemsList.length; q++) itemSet.add(key(itemsList[q][0], itemsList[q][1]));
        if (itemSet.size !== snapItems) return null;
      }
    }
    if (!ok) return null;
  }
  // ikinci bağımsız kaynak
  if (P.src2 >= 0) {
    const sj = placeSource();
    if (sj < 0) return null;
    const s1 = L.src[sj];
    const n2 = [];
    for (let i = 0; i < P.src2; i++) n2.push('m');
    if (!chain(s1[0], s1[1], s1[2], n2)) return null;
  }
  // çözüm yönelimleriyle tüm alıcılar yanmalı
  for (let i = 0; i < L.mir.length; i++) L.mir[i][2] = real.mir[i];
  for (let i = 0; i < L.spl.length; i++) L.spl[i][2] = real.spl[i];
  const solved = traceBeams(L);
  if (!allLit(solved)) return null;
  const solBeam = new Set(solved.beam);
  // sahte aynalar (çözüm ışınlarına değmez)
  const free = (x, z, minCheb) => {
    if (!inGrid(x, z) || solBeam.has(key(x, z)) || itemSet.has(key(x, z))) return false;
    for (let i = 0; i < itemsList.length; i++) if (cheb(x, z, itemsList[i][0], itemsList[i][1]) < minCheb) return false;
    return true;
  };
  const cells = [];
  for (let z = g.gz0; z <= g.gz1; z++) for (let x = g.gx0; x <= g.gx1; x++) cells.push([x, z]);
  rng.shuffle(cells);
  let decoys = 0;
  for (let i = 0; i < cells.length && decoys < P.decoys; i++) {
    if (!free(cells[i][0], cells[i][1], 3)) continue;
    L.mir.push([cells[i][0], cells[i][1], rng.int(0, 3), 0]);
    addItem(cells[i][0], cells[i][1]);
    decoys++;
  }
  if (decoys < P.decoys) return null;
  let obs = 0;
  for (let i = 0; i < cells.length && obs < P.obs; i++) {
    const [x, z] = cells[i];
    if (!free(x, z, 2)) continue;
    L.obs.push([x, z]);
    addItem(x, z);
    obs++;
  }
  // çözümü sakla, aynaları/bölücüleri karıştır
  const sol = { mir: L.mir.map((m) => m[2]), spl: L.spl.map((s) => s[2]) };
  const scramble = () => {
    for (let i = 0; i < L.mir.length; i++) {
      if (L.mir[i][3] === 1) {
        let o = rng.int(0, 3);
        if (o === sol.mir[i]) o = (o + 1 + rng.int(0, 2)) % 4;
        L.mir[i][2] = o;
      }
    }
    for (let i = 0; i < L.spl.length; i++) {
      let o = rng.int(0, 3);
      if (o === sol.spl[i]) o = (o + 1 + rng.int(0, 2)) % 4;
      L.spl[i][2] = o;
    }
  };
  for (let a = 0; a < 8; a++) {
    scramble();
    if (!allLit(traceBeams(L))) {
      L.sol = sol;
      return L;
    }
  }
  return null;
}

/** i. bölücüye gelen ana ışının yönü: zincir sırasından (kaynak yönü + aynaların dönüşleri) hesaplanır. */
function incomingDir(L, real, splIdx) {
  const sx = L.spl[splIdx][0];
  const sz = L.spl[splIdx][1];
  const s = L.src[0];
  let x = s[0];
  let z = s[1];
  let d = s[2];
  for (let guard = 0; guard < 60; guard++) {
    x += DIRS[d][0];
    z += DIRS[d][1];
    if (x === sx && z === sz) return d;
    for (let i = 0; i < L.mir.length; i++) {
      if (L.mir[i][0] === x && L.mir[i][1] === z && L.mir[i][3] === 1) {
        const n = NORMS[real.mir[i]];
        const dx = DIRS[d][0];
        const dz = DIRS[d][1];
        const dot = dx * n[0] + dz * n[1];
        d = dirIndex(dx - dot * n[0], dz - dot * n[1]);
      }
    }
  }
  return 0;
}

/** Güvenli yedek düzen (kaynak → ayna → alıcı), tüm boyutlarda geçerli. */
function fallbackLayout(g) {
  const z = g.gz0 + 1;
  const x = g.gx0 + 3;
  const L = {
    src: [[g.gx0, z, 1]],
    mir: [[x, z, 0, 1]],
    spl: [],
    rec: [[x, z + 3]],
    obs: [],
    ...g,
  };
  L.sol = { mir: [2], spl: [] };
  return L;
}

/** Zorluk d için yerleşim. rngFor(i) → bağımsız tohumlu rng (belirlenimli). */
export function generateBeamLayout(d, x0, x1, dd, rngFor) {
  const P = PARAMS[Math.max(1, Math.min(5, d)) - 1];
  const g = gridBounds(x0, x1, dd);
  for (let a = 0; a < 120; a++) {
    const L = tryLayout(rngFor(a), P, g);
    if (L) return L;
  }
  return fallbackLayout(g);
}
