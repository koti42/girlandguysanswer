/*
 * KEŞİF sim — DOĞAL AĞAÇ DEVİRME (saf, belirlenimci; three/DOM/Math.random/Date.now yok).
 *
 *   isLogId(id) · isLeafId(id)                      kütük/yaprak sınıflandırması (blok anahtarı sonekinden: *_kütük, *_yaprak)
 *   detectTreeFall(world, base, opts) → sonuç | null   tabanı kırılan kütüğün ürettiği devrilme
 *   findOrphanLeaves(world, box, opts) → [{x,y,z,id}]  hiçbir kütüğe ≤ leafSteps adımda bağlı olmayan doğal yapraklar (çürüme)
 *   FALL_DIRS · pickFallDir(seed, base, breaker)    sekiz yönlü devrilme yönü (belirlenimci)
 *
 * detectTreeFall(world, base, opts)
 *   world   {getBlock(x,y,z) → id|null (üretilmemiş), edits?: Map("x,y,z" → id)}
 *   base    kırılan (artık hava) kütüğün konumu {x,y,z}
 *   opts    seed, breaker:{x,z}|null, isPlaced(x,y,z,id) (oyuncu/kayıt elinden gelen blok mu; varsayılan: world.edits kaydı bu kimliği
 *           taşıyor), isProtected(x,y,z) (yapı/bulmaca sahipli), maxLogs, leafSteps, minLeaves
 *
 * Kurallar (özet):
 *  - Tohum: kırılan hücrenin 26 komşusundaki DOĞAL kütükler. Her tohumdan 26 komşuluklu kütük bileşeni taranır (çatal dallar,
 *    çapraz dallar, çok gövdeli cangıl ağaçları birleşir).
 *  - Destekli bileşen devrilmez: bir kütüğün hemen altı kütük/yaprak olmayan KATI blok (toprak, taş, tahta, oyuncu kütüğü…) ya da
 *    bilinmiyorsa (üretilmemiş chunk). Yani çok gövdeli ağaçta bir gövdeyi kesmek yetmez; ara gövde kesilirse yalnızca kesimin ÜSTÜ
 *    devrilir, alt kütük kalır (altı yerde).
 *  - Doğal olmayan (oyuncunun koyduğu / yapı-bulmaca sahipli) kütükler ve yapraklar ASLA bileşene girmez; en az `minLeaves` doğal yaprak
 *    şartı, oyuncu kütük sütunlarını/evlerini ve yaprağı olmayan yığınları korur.
 *  - Yaprak sahipliği: yapraklar kütüklere 26 komşuluklu, yalnız yaprak hücreleri üzerinden adım uzaklığıyla bağlanır (≤ leafSteps).
 *    Düşen kütüğe ayakta kalan kütükten kesin daha yakın olanlar ağaçla gider; eşitlikte kalır (çürüme halleder).
 *  - Üst sınır: maxLogs (600) aşılırsa ağaç sayılmaz (null).
 *  - Sonuç sıralıdır (y, x, z): aynı girdi → aynı bloklar ve aynı yön.
 */
import { BLOCKS, SOLID_LUT } from './blocks.js';
import { hash3 } from './rng.js';
import { TREE_TUNING } from './treeData.js';

export const LOG_LUT = new Uint8Array(256);
export const LEAF_LUT = new Uint8Array(256);
for (let i = 1; i < BLOCKS.length && i < 256; i++) {
  const b = BLOCKS[i];
  if (!b || b.shape !== 'cube') continue;
  if (/_k(ü|u)t(ü|u)k$/.test(b.key)) LOG_LUT[i] = 1;
  else if (/_yaprak$/.test(b.key)) LEAF_LUT[i] = 1;
}

export function isLogId(id) {
  return id > 0 && id < 256 && LOG_LUT[id] === 1;
}
export function isLeafId(id) {
  return id > 0 && id < 256 && LEAF_LUT[id] === 1;
}

/** Sekiz yön: indeks → [dx, dz] (birim). */
const D = Math.SQRT1_2;
export const FALL_DIRS = Object.freeze([
  Object.freeze({ dx: 0, dz: -1 }), Object.freeze({ dx: D, dz: -D }), Object.freeze({ dx: 1, dz: 0 }), Object.freeze({ dx: D, dz: D }),
  Object.freeze({ dx: 0, dz: 1 }), Object.freeze({ dx: -D, dz: D }), Object.freeze({ dx: -1, dz: 0 }), Object.freeze({ dx: -D, dz: -D }),
]);

/** Devrilme yönü indeksi: kıran kişiden uzağa (kıran biliniyorsa), yoksa tohum+konum özetinden. */
export function pickFallDir(seed, base, breaker) {
  if (breaker && Number.isFinite(breaker.x) && Number.isFinite(breaker.z)) {
    const vx = base.x + 0.5 - breaker.x;
    const vz = base.z + 0.5 - breaker.z;
    if (vx * vx + vz * vz > 0.0625) {
      let best = 0;
      let bd = -Infinity;
      for (let i = 0; i < 8; i++) {
        const d = vx * FALL_DIRS[i].dx + vz * FALL_DIRS[i].dz;
        if (d > bd + 1e-9) {
          bd = d;
          best = i;
        }
      }
      return best;
    }
  }
  return hash3(base.x | 0, base.y | 0, base.z | 0, (seed | 0) ^ 0x7f31a5) & 7;
}

const OFF = 1 << 18;
function key(x, y, z) {
  return ((x + OFF) * 524288 + (z + OFF)) * 2048 + (y + 1024);
}

const N26 = [];
for (let dy = -1; dy <= 1; dy++) {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx !== 0 || dy !== 0 || dz !== 0) N26.push([dx, dy, dz]);
    }
  }
}

function defaultPlaced(world) {
  const edits = world && world.edits;
  if (!edits || typeof edits.get !== 'function') return () => false;
  return (x, y, z, id) => edits.get(x + ',' + y + ',' + z) === id;
}

function byYXZ(a, b) {
  return a.y - b.y || a.x - b.x || a.z - b.z;
}

/** Doğal hücre sınayıcısı (önbellekli): oyuncu kaydı ya da yapı sahipli değil. */
function makeNatural(world, o) {
  const placed = o.isPlaced || defaultPlaced(world);
  const prot = o.isProtected || null;
  const cache = new Map();
  return (x, y, z, id) => {
    const k = key(x, y, z);
    let v = cache.get(k);
    if (v === undefined) {
      v = !placed(x, y, z, id) && !(prot && prot(x, y, z));
      cache.set(k, v);
    }
    return v;
  };
}

/**
 * Kesilen taban `base`ten kopan ağacı bulur. Devrilecek ağaç yoksa null.
 * Dönüş: {base, dirIndex, dx, dz, logs:[{x,y,z,id}], leaves:[{x,y,z,id}], count, big, species (kütük kimliği), hinge:{x,y,z},
 *         height, minY, maxY, bounds:{x0,y0,z0,x1,y1,z1}}
 */
export function detectTreeFall(world, base, opts) {
  const o = opts || {};
  const T = TREE_TUNING;
  const maxLogs = o.maxLogs > 0 ? o.maxLogs : T.maxLogs;
  const steps = o.leafSteps > 0 ? o.leafSteps : T.leafSteps;
  const minLeaves = o.minLeaves >= 0 ? o.minLeaves : T.minLeaves;
  const natural = makeNatural(world, o);
  const get = (x, y, z) => world.getBlock(x, y, z);

  // 1) tohumlar: kesim hücresinin doğal kütük komşuları
  const seeds = [];
  for (let i = 0; i < N26.length; i++) {
    const x = base.x + N26[i][0];
    const y = base.y + N26[i][1];
    const z = base.z + N26[i][2];
    const id = get(x, y, z);
    if (id && LOG_LUT[id] === 1 && natural(x, y, z, id)) seeds.push({ x, y, z, id });
  }
  if (seeds.length === 0) return null;
  seeds.sort(byYXZ);

  // 2) bileşenler (26 komşuluklu kütük taraması)
  const visited = new Map(); // key → bileşen no
  const falling = []; // devrilecek kütükler
  const fallKeys = new Set();
  let total = 0;
  for (let s = 0; s < seeds.length; s++) {
    const sd = seeds[s];
    if (visited.has(key(sd.x, sd.y, sd.z))) continue;
    const comp = [];
    let grounded = false;
    const stack = [sd];
    visited.set(key(sd.x, sd.y, sd.z), s);
    while (stack.length > 0) {
      const c = stack.pop();
      comp.push(c);
      total++;
      if (total > maxLogs) return null;
      const below = get(c.x, c.y - 1, c.z);
      if (below === null) grounded = true;
      else if (below !== 0 && SOLID_LUT[below] === 1 && LEAF_LUT[below] === 0) {
        if (LOG_LUT[below] === 0 || !natural(c.x, c.y - 1, c.z, below)) grounded = true;
      }
      for (let i = 0; i < N26.length; i++) {
        const x = c.x + N26[i][0];
        const y = c.y + N26[i][1];
        const z = c.z + N26[i][2];
        const id = get(x, y, z);
        if (id === null) {
          grounded = true; // üretilmemiş komşu: dokunma
          continue;
        }
        if (id === 0 || LOG_LUT[id] === 0) continue;
        const k = key(x, y, z);
        if (visited.has(k)) continue;
        if (!natural(x, y, z, id)) {
          // yapı sahipli kütük bileşene bağlıysa ağaç yapıya aittir: sabit kal. Oyuncunun kütüğü ise yok sayılır.
          if (o.isProtected && o.isProtected(x, y, z)) grounded = true;
          continue;
        }
        visited.set(k, s);
        stack.push({ x, y, z, id });
      }
    }
    if (!grounded) {
      for (let i = 0; i < comp.length; i++) {
        falling.push(comp[i]);
        fallKeys.add(key(comp[i].x, comp[i].y, comp[i].z));
      }
    }
  }
  if (falling.length === 0) return null;

  // 3) yapraklar: düşen kütüklerden yaprak hücreleri üzerinden adım uzaklığı; ayakta kalan kütüklere daha yakınlar kalır
  const maxDepth = steps + 4;
  const dF = new Map();
  const standing = new Map(); // key → {x,y,z}
  let qx = [];
  let qy = [];
  let qz = [];
  const noteStanding = (x, y, z, id) => {
    if (id !== 0 && LOG_LUT[id] === 1 && !fallKeys.has(key(x, y, z)) && natural(x, y, z, id)) {
      const k = key(x, y, z);
      if (!standing.has(k)) standing.set(k, { x, y, z });
    }
  };
  const expand = (cx, cy, cz, d) => {
    for (let i = 0; i < N26.length; i++) {
      const x = cx + N26[i][0];
      const y = cy + N26[i][1];
      const z = cz + N26[i][2];
      const id = get(x, y, z);
      if (!id) continue;
      if (LEAF_LUT[id] === 1) {
        const k = key(x, y, z);
        if (dF.has(k) || !natural(x, y, z, id)) continue;
        if (d + 1 <= maxDepth) {
          dF.set(k, d + 1);
          qx.push(x); qy.push(y); qz.push(z);
        }
      } else {
        noteStanding(x, y, z, id);
      }
    }
  };
  for (let i = 0; i < falling.length; i++) expand(falling[i].x, falling[i].y, falling[i].z, 0);
  let head = 0;
  let guard = 60000;
  while (head < qx.length && guard-- > 0) {
    const x = qx[head];
    const y = qy[head];
    const z = qz[head];
    head++;
    const d = dF.get(key(x, y, z));
    if (d < maxDepth) expand(x, y, z, d);
  }
  qx = []; qy = []; qz = [];

  // ayakta kalan kütüklerden yaprak uzaklığı (≤ steps)
  const dS = new Map();
  standing.forEach((p) => {
    for (let i = 0; i < N26.length; i++) {
      const x = p.x + N26[i][0];
      const y = p.y + N26[i][1];
      const z = p.z + N26[i][2];
      const id = get(x, y, z);
      if (!id || LEAF_LUT[id] === 0) continue;
      const k = key(x, y, z);
      if (!dS.has(k) && natural(x, y, z, id)) {
        dS.set(k, 1);
        qx.push(x); qy.push(y); qz.push(z);
      }
    }
  });
  head = 0;
  guard = 60000;
  while (head < qx.length && guard-- > 0) {
    const x = qx[head];
    const y = qy[head];
    const z = qz[head];
    head++;
    const d = dS.get(key(x, y, z));
    if (d >= steps) continue;
    for (let i = 0; i < N26.length; i++) {
      const nx = x + N26[i][0];
      const ny = y + N26[i][1];
      const nz = z + N26[i][2];
      const id = get(nx, ny, nz);
      if (!id || LEAF_LUT[id] === 0) continue;
      const k = key(nx, ny, nz);
      if (dS.has(k) || !natural(nx, ny, nz, id)) continue;
      dS.set(k, d + 1);
      qx.push(nx); qy.push(ny); qz.push(nz);
    }
  }

  const leaves = [];
  dF.forEach((d, k) => {
    if (d > steps) return;
    const s = dS.get(k);
    if (s !== undefined && s <= d) return;
    leaves.push(k);
  });
  // anahtar → konum (sayısal anahtarı çöz)
  const leafCells = [];
  for (let i = 0; i < leaves.length; i++) {
    const k = leaves[i];
    const y = (k % 2048) - 1024;
    const r = Math.floor(k / 2048);
    const z = (r % 524288) - OFF;
    const x = Math.floor(r / 524288) - OFF;
    leafCells.push({ x, y, z, id: get(x, y, z) });
  }
  if (leafCells.length < minLeaves) return null;

  falling.sort(byYXZ);
  leafCells.sort(byYXZ);

  // 4) yön, menteşe, ölçüler
  const dirIndex = pickFallDir(o.seed || 0, base, o.breaker || null);
  const dir = FALL_DIRS[dirIndex];
  const minY = falling[0].y;
  let maxY = falling[falling.length - 1].y;
  let hx0 = null;
  let bd = Infinity;
  for (let i = 0; i < falling.length && falling[i].y === minY; i++) {
    const c = falling[i];
    const d = (c.x - base.x) * (c.x - base.x) + (c.z - base.z) * (c.z - base.z);
    if (d < bd) {
      bd = d;
      hx0 = c;
    }
  }
  let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity; let y0 = minY; let y1 = maxY;
  const all = falling.concat(leafCells);
  for (let i = 0; i < all.length; i++) {
    const c = all[i];
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
    if (c.y < y0) y0 = c.y;
    if (c.y > y1) y1 = c.y;
  }
  maxY = y1;
  const logCount = falling.length;
  return {
    base: { x: base.x, y: base.y, z: base.z },
    dirIndex,
    dx: dir.dx,
    dz: dir.dz,
    logs: falling,
    leaves: leafCells,
    count: logCount + leafCells.length,
    big: logCount + leafCells.length > TREE_TUNING.bigBlocks,
    species: hx0.id,
    hinge: { x: hx0.x + 0.5 - dir.dx * 0.5, y: minY, z: hx0.z + 0.5 - dir.dz * 0.5 },
    height: maxY - minY + 1,
    minY,
    maxY,
    bounds: { x0, y0, z0, x1, y1, z1 },
  };
}

/**
 * Yaprak çürümesi: `box` ({x0,y0,z0,x1,y1,z1}, kapsayıcı) içindeki, hiçbir kütüğe 26 komşuluklu yaprak zinciriyle ≤ leafSteps adımda
 * bağlı olmayan DOĞAL yapraklar. Kütük aranan alan kutunun leafSteps kadar genişletilmişidir (üretilmemiş chunk yakını atlanır).
 * opts: isPlaced, isProtected, leafSteps, max (en çok döndürülen).
 */
export function findOrphanLeaves(world, box, opts) {
  const o = opts || {};
  const steps = o.leafSteps > 0 ? o.leafSteps : TREE_TUNING.leafSteps;
  const max = o.max > 0 ? o.max : 4000;
  const natural = makeNatural(world, o);
  const ex0 = box.x0 - steps; const ex1 = box.x1 + steps;
  const ey0 = box.y0 - steps; const ey1 = box.y1 + steps;
  const ez0 = box.z0 - steps; const ez1 = box.z1 + steps;
  const alive = new Map();
  const leaves = [];
  const unknown = [];
  let qx = [];
  let qy = [];
  let qz = [];
  for (let y = ey0; y <= ey1; y++) {
    for (let z = ez0; z <= ez1; z++) {
      for (let x = ex0; x <= ex1; x++) {
        const id = world.getBlock(x, y, z);
        if (id === null) {
          if (unknown.length < 192) unknown.push(x, y, z);
          continue;
        }
        if (id === 0) continue;
        if (LOG_LUT[id] === 1) {
          // kütüğe komşu yapraklar 1 adım
          for (let i = 0; i < N26.length; i++) {
            const nx = x + N26[i][0];
            const ny = y + N26[i][1];
            const nz = z + N26[i][2];
            if (nx < ex0 || nx > ex1 || ny < ey0 || ny > ey1 || nz < ez0 || nz > ez1) continue;
            const nid = world.getBlock(nx, ny, nz);
            if (!nid || LEAF_LUT[nid] === 0) continue;
            const k = key(nx, ny, nz);
            if (!alive.has(k)) {
              alive.set(k, 1);
              qx.push(nx); qy.push(ny); qz.push(nz);
            }
          }
        } else if (LEAF_LUT[id] === 1) {
          if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1 && z >= box.z0 && z <= box.z1 && natural(x, y, z, id)) {
            leaves.push({ x, y, z, id });
          }
        }
      }
    }
  }
  let head = 0;
  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    const z = qz[head];
    head++;
    const d = alive.get(key(x, y, z));
    if (d >= steps) continue;
    for (let i = 0; i < N26.length; i++) {
      const nx = x + N26[i][0];
      const ny = y + N26[i][1];
      const nz = z + N26[i][2];
      if (nx < ex0 || nx > ex1 || ny < ey0 || ny > ey1 || nz < ez0 || nz > ez1) continue;
      const nid = world.getBlock(nx, ny, nz);
      if (!nid || LEAF_LUT[nid] === 0) continue;
      const k = key(nx, ny, nz);
      if (alive.has(k)) continue;
      alive.set(k, d + 1);
      qx.push(nx); qy.push(ny); qz.push(nz);
    }
  }
  const out = [];
  const tooManyUnknown = unknown.length >= 192;
  for (let i = 0; i < leaves.length && out.length < max; i++) {
    const c = leaves[i];
    if (alive.has(key(c.x, c.y, c.z))) continue;
    if (tooManyUnknown) continue;
    let near = false;
    for (let u = 0; u < unknown.length; u += 3) {
      if (Math.abs(unknown[u] - c.x) <= steps && Math.abs(unknown[u + 1] - c.y) <= steps && Math.abs(unknown[u + 2] - c.z) <= steps) {
        near = true;
        break;
      }
    }
    if (!near) out.push(c);
  }
  out.sort(byYXZ);
  return out;
}
