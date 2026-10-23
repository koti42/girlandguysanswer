/*
 * KEŞİF bulmaca "İtilebilir Blok" — Sokoban mantığı + ters hamleyle seviye üretici (saf; DOM/three yok).
 *
 * Seviye ÇÖZÜLMÜŞ durumdan (kutular hedeflerde) rastgele TERS hamleler ("çekme": oyuncu geri adım atar, kutu onun eski yerine gelir)
 * uygulanarak üretilir. Her ters hamle bir ileri itmenin tersi olduğundan, ters sırayla oynanan itme listesi (sol) seviyeyi her zaman
 * çözer; üreticide bu liste ayrıca oyuncunun yürüyebilirliği (BFS) dahil bağımsız bir ileri simülasyonla doğrulanır.
 * Izgara koordinatları (gx,gz): gx = 0..GW−1, gz = 0..GZ−1.
 */

export const DIRS4 = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

const k = (x, z) => x + ',' + z;

export function inGrid(GW, GZ, x, z) {
  return x >= 0 && x < GW && z >= 0 && z < GZ;
}

/** Ortak yardımcı: duvar kümesi + kutu kümesine göre hücre boş mu? */
export function makeGrid(GW, GZ, walls, boxes) {
  const wallSet = new Set(walls.map((w) => k(w[0], w[1])));
  const boxSet = new Set(boxes.map((b) => k(b[0], b[1])));
  return {
    wallSet,
    boxSet,
    floor: (x, z) => inGrid(GW, GZ, x, z) && !wallSet.has(k(x, z)),
    free: (x, z) => inGrid(GW, GZ, x, z) && !wallSet.has(k(x, z)) && !boxSet.has(k(x, z)),
  };
}

/** Oyuncunun (px,pz)'den yürüyerek ulaşabileceği hücreler (kutular ve duvarlar engel). */
export function reachable(GW, GZ, g, px, pz) {
  const seen = new Set([k(px, pz)]);
  const q = [[px, pz]];
  for (let i = 0; i < q.length; i++) {
    const [x, z] = q[i];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS4[d][0];
      const nz = z + DIRS4[d][1];
      if (!g.free(nx, nz) || seen.has(k(nx, nz))) continue;
      seen.add(k(nx, nz));
      q.push([nx, nz]);
    }
  }
  return seen;
}

/** Köşe kilidi: hedefte olmayan kutu iki dik yönde engelle çevrili mi (duvar/ızgara dışı)? */
export function cornerDead(GW, GZ, g, targetSet, bx, bz) {
  if (targetSet.has(k(bx, bz))) return false;
  const blocked = (x, z) => !g.floor(x, z);
  const hx = blocked(bx - 1, bz) || blocked(bx + 1, bz);
  const hz = blocked(bx, bz - 1) || blocked(bx, bz + 1);
  return hx && hz;
}

const PARAMS = [
  { GW: 6, GZ: 5, boxes: 1, wall: 0, steps: 6, minPush: 2 },
  { GW: 7, GZ: 6, boxes: 2, wall: 0.05, steps: 14, minPush: 5 },
  { GW: 8, GZ: 7, boxes: 3, wall: 0.08, steps: 24, minPush: 9 },
  { GW: 9, GZ: 8, boxes: 4, wall: 0.1, steps: 36, minPush: 14 },
  { GW: 10, GZ: 9, boxes: 5, wall: 0.12, steps: 52, minPush: 20 },
];
export const SOKO_SIZES = Object.freeze(PARAMS.map((p) => [p.GW, p.GZ]));

function floorConnected(GW, GZ, wallSet) {
  let start = null;
  let count = 0;
  for (let z = 0; z < GZ; z++) {
    for (let x = 0; x < GW; x++) {
      if (wallSet.has(k(x, z))) continue;
      count++;
      if (!start) start = [x, z];
    }
  }
  if (!start) return false;
  const seen = new Set([k(start[0], start[1])]);
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    for (let d = 0; d < 4; d++) {
      const nx = q[i][0] + DIRS4[d][0];
      const nz = q[i][1] + DIRS4[d][1];
      if (!inGrid(GW, GZ, nx, nz) || wallSet.has(k(nx, nz)) || seen.has(k(nx, nz))) continue;
      seen.add(k(nx, nz));
      q.push([nx, nz]);
    }
  }
  return seen.size === count;
}

/**
 * İleri simülasyon: başlangıç kutuları + sol (itme listesi) + oyuncu başlangıcı → tüm kutular hedefte mi?
 * Her itmede oyuncu, kutunun gerisindeki hücreye YÜRÜYEREK ulaşabilmeli.
 */
export function verifySolution(GW, GZ, walls, targets, boxes0, sol, player) {
  const boxes = boxes0.map((b) => [b[0], b[1]]);
  let px = player[0];
  let pz = player[1];
  for (let i = 0; i < sol.length; i++) {
    const [bx, bz, dx, dz] = sol[i];
    const g = makeGrid(GW, GZ, walls, boxes);
    const bi = boxes.findIndex((b) => b[0] === bx && b[1] === bz);
    if (bi < 0) return false;
    const fx = bx - dx;
    const fz = bz - dz;
    if (!g.free(fx, fz)) return false;
    if (!reachable(GW, GZ, g, px, pz).has(k(fx, fz))) return false;
    if (!g.free(bx + dx, bz + dz)) return false;
    boxes[bi] = [bx + dx, bz + dz];
    px = bx;
    pz = bz;
  }
  const ts = new Set(targets.map((t) => k(t[0], t[1])));
  return boxes.length === targets.length && boxes.every((b) => ts.has(k(b[0], b[1])));
}

function tryLevel(rng, P) {
  const { GW, GZ } = P;
  const wallSet = new Set();
  const walls = [];
  for (let z = 0; z < GZ; z++) {
    for (let x = 0; x < GW; x++) {
      if (rng.next() < P.wall) {
        wallSet.add(k(x, z));
        walls.push([x, z]);
      }
    }
  }
  if (!floorConnected(GW, GZ, wallSet)) return null;
  const floorCells = [];
  for (let z = 0; z < GZ; z++) for (let x = 0; x < GW; x++) if (!wallSet.has(k(x, z))) floorCells.push([x, z]);
  if (floorCells.length < P.boxes * 5 + 3) return null;
  rng.shuffle(floorCells);
  const targets = floorCells.slice(0, P.boxes).map((c) => [c[0], c[1]]);
  const boxes = targets.map((c) => [c[0], c[1]]);
  const player = [floorCells[P.boxes][0], floorCells[P.boxes][1]];
  let [px, pz] = player;
  const rev = []; // ters hamleler: {bx,bz (kutunun ileri itmedeki başlangıç hücresi), dx,dz}
  for (let s = 0; s < P.steps; s++) {
    const g = makeGrid(GW, GZ, walls, boxes);
    const reach = reachable(GW, GZ, g, px, pz);
    const cands = [];
    reach.forEach((key) => {
      const p = key.split(',');
      const x = Number(p[0]);
      const z = Number(p[1]);
      for (let d = 0; d < 4; d++) {
        const dx = DIRS4[d][0];
        const dz = DIRS4[d][1];
        // kutu p+d'de, p−d boş: çekme → oyuncu p−d'ye, kutu p'ye
        if (g.boxSet.has(k(x + dx, z + dz)) && g.free(x - dx, z - dz)) cands.push([x, z, dx, dz]);
      }
    });
    if (cands.length === 0) break;
    const c = cands[rng.int(0, cands.length - 1)];
    const bi = boxes.findIndex((b) => b[0] === c[0] + c[2] && b[1] === c[1] + c[3]);
    boxes[bi] = [c[0], c[1]];
    px = c[0] - c[2];
    pz = c[1] - c[3];
    rev.push([c[0], c[1], c[2], c[3]]);
  }
  // ileri itme listesi: ters hamlelerin tersi (son hamle önce): kutu c (p) konumundan p+d'ye itilir
  const sol = [];
  for (let i = rev.length - 1; i >= 0; i--) sol.push([rev[i][0], rev[i][1], rev[i][2], rev[i][3]]);
  if (sol.length < P.minPush) return null;
  const ts = new Set(targets.map((t) => k(t[0], t[1])));
  const off = boxes.filter((b) => !ts.has(k(b[0], b[1]))).length;
  if (off < Math.ceil(P.boxes * 0.6)) return null;
  const g = makeGrid(GW, GZ, walls, boxes);
  for (let i = 0; i < boxes.length; i++) if (cornerDead(GW, GZ, g, ts, boxes[i][0], boxes[i][1])) return null;
  // oyuncu başlangıcı (ters yürüyüşün sonu) ızgaranın ön sırasından (gz=0) yürünebilir olmalı
  const reach = reachable(GW, GZ, g, px, pz);
  let front = false;
  for (let x = 0; x < GW && !front; x++) if (reach.has(k(x, 0))) front = true;
  if (!front) return null;
  if (!verifySolution(GW, GZ, walls, targets, boxes, sol, [px, pz])) return null;
  return {
    GW, GZ, walls, targets, boxes, sol, player: [px, pz],
  };
}

/** Güvenli yedek: tek kutu, açık ızgara. */
function fallback(P) {
  const x = Math.floor(P.GW / 2);
  const z = P.GZ - 3;
  const sol = [[x, z, 0, 1]];
  return {
    GW: P.GW,
    GZ: P.GZ,
    walls: [],
    targets: [[x, z + 1]],
    boxes: [[x, z]],
    sol,
    player: [x, z - 1],
  };
}

/** Zorluk d (1..5) için seviye. rngFor(i) → bağımsız belirlenimli rng. */
export function generateSokoLevel(d, rngFor) {
  const P = PARAMS[Math.max(1, Math.min(5, d)) - 1];
  for (let a = 0; a < 400; a++) {
    const L = tryLevel(rngFor(a), P);
    if (L) return L;
  }
  return fallback(P);
}
