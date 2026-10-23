/*
 * KEŞİF "treefall" sistemi — ortak durum ve yardımcılar (saf mantık + G alanları).
 *
 *   createState() → S
 *   active(G)                         yalnız macera modu, salt-okunur değil, dünya var
 *   cellKey(x,y,z)                    "x,y,z"
 *   naturalOpts(G, S, base) → {isPlaced, isProtected, seed}   detectTreeFall / findOrphanLeaves seçenekleri
 *   makeProtect(G, x, z) → (x,y,z)=>bool   yapı sınırı (±1 pay) içindeki hücreler (ağaç değil yapı malzemesi sayılır)
 *   breakerNear(G, x, z) → {x,z}|null      kıran oyuncu (14 blok içindeyse)
 *   rng(seed) / rngFor(G, x, y, z)         belirlenimci [0,1) akışı (konum + dünya tohumu)
 *   budgetMs(fn, ms)                       süre bütçeli döngü yardımcısı
 */
import { structuresInRegion } from '../sim/structures.js';
import { mulberry32, hash3 } from '../sim/rng.js';

export function createState() {
  return {
    queue: [],
    queued: new Set(),
    active: [],
    removing: [],
    claimed: new Set(),
    busy: false,
    pendingDrops: [],
    shake: { amp: 0, t: 0, dur: 1 },
    saplings: new Map(),
    sapT: 0,
    grown: new Set(),
    grownTrees: [],
    decayScans: [],
    decay: [],
    decayHeld: new Set(),
    stats: {
      felled: 0, grown: 0, decayed: 0, popped: 0, skipped: 0, logsDropped: 0,
    },
    nextId: 1,
    hintedSapling: false,
  };
}

export function active(G) {
  return G.mode === 'macera' && G.readOnly !== true && !!G.world && G.dim !== 'neon';
}

export const cellKey = (x, y, z) => x + ',' + y + ',' + z;

export function makeProtect(G, x, z) {
  if (G.noStructureProtect === true) return null; // yalnız harness/test: gerçek yapı sorgusunu atla
  let list = [];
  try {
    list = structuresInRegion(G.world.seed, x - 40, z - 40, x + 40, z + 40).map((s) => s.bounds);
  } catch (_e) {
    list = [];
  }
  if (list.length === 0) return null;
  return (px, py, pz) => {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (px >= b.x0 - 1 && px <= b.x1 + 1 && pz >= b.z0 - 1 && pz <= b.z1 + 1 && (b.y0 === undefined || (py >= b.y0 - 2 && py <= b.y1 + 2))) return true;
    }
    return false;
  };
}

export function naturalOpts(G, S, base) {
  const edits = G.world.edits;
  const grown = S.grown;
  return {
    seed: G.world.seed | 0,
    isPlaced: (x, y, z, id) => {
      if (!edits || typeof edits.get !== 'function') return false;
      const k = cellKey(x, y, z);
      return edits.get(k) === id && !grown.has(k);
    },
    isProtected: makeProtect(G, base.x, base.z),
  };
}

export function breakerNear(G, x, z) {
  const b = G.body;
  if (!b || !(G.player && !G.player.dead)) return null;
  const dx = b.x - (x + 0.5);
  const dz = b.z - (z + 0.5);
  return dx * dx + dz * dz <= 14 * 14 ? { x: b.x, z: b.z } : null;
}

export function rngFor(G, x, y, z, salt) {
  return mulberry32(hash3(x | 0, y | 0, z | 0, ((G.world.seed | 0) ^ 0x2c1b3c6d) + (salt | 0)));
}

/** fn() true dönerse devam; süre dolunca (ya da fn false) durur. Yapılan adım sayısını döner. */
export function budgetMs(fn, ms) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let n = 0;
  while (fn()) {
    n++;
    if (typeof performance !== 'undefined' && performance.now() - t0 > ms) break;
  }
  return n;
}
