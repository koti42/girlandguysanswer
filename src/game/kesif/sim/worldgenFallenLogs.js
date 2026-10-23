/*
 * KEŞİF sim — DEVRİK KÜTÜKLER (saf, belirlenimci; worldgen.js placeTrees'ten sonra çağırır).
 *
 * 10×10'luk hücre başına ≤ 1 devrik kütük: ormanlık biyomlarda düz zeminde 3–5 blokluk yatay kütük (yanında mantar/eğrelti süsü).
 * Konum yalnız tohum ve hücreye bağlıdır; kütük chunk sınırını aşabilir — her chunk kendine değen hücreleri (±6) aynı sırayla işler ve
 * yalnızca kendi kesitini yazar (yazım yalnız HAVAya: ağaçları/yaprakları ezmez, sonuç chunk sınırından bağımsızdır).
 * Devirme algılayıcısı (treefall) açısından bunlar doğal kütüktür ve altı katı olduğu için ayakta kalır.
 */
import { SEA_LEVEL } from './constants.js';
import { B } from './blocks.js';
import { hash2 } from './rng.js';
import {
  BIOME_ID, SEAL_RING_RADII, makeCol, sampleColumn, sinkholeNear,
} from './worldgenTerrain.js';
import {
  beginTrees, lf, peek,
} from './worldgenTreeKit.js';

export const LOG_CELL = 10;
const MARGIN = 6;
const col = makeCol();
const col2 = makeCol();

/** Biyom → [olasılık, kütük kimlikleri]; yoksa devrik kütük yok. */
const TABLE = [];
function T(biome, p, ids) {
  TABLE[BIOME_ID[biome]] = { p, ids };
}
T('orman', 0.1, [B.LOG_OAK, B.LOG_BIRCH]);
T('sonbahar', 0.14, [B.LOG_OAK]);
T('kiraz', 0.08, [B.LOG_CHERRY]);
T('yagmurorman', 0.2, [B.LOG_JUNGLE]);
T('mangrov', 0.1, [B.LOG_MANGROVE]);
T('karacam', 0.1, [B.LOG_PINE]);
T('taiga', 0.1, [B.LOG_PINE]);
T('golge', 0.16, [B.LOG_OAK]);
T('bataklik', 0.08, [B.LOG_OAK]);
T('cayir', 0.015, [B.LOG_OAK]);

function nearRing(x, z, margin) {
  const r = Math.sqrt(x * x + z * z);
  for (let i = 0; i < SEAL_RING_RADII.length; i++) if (Math.abs(r - SEAL_RING_RADII[i]) < margin) return true;
  return false;
}

const LOG = { ok: false, x: 0, z: 0, dx: 0, dz: 0, len: 0, id: 0, hash: 0 };

/** (ccx,ccz) hücresinin devrik kütüğü: LOG nesnesine yazar (ok=false → yok). Ayrıca zemin yükseklikleri LOG_H'ye. */
const LOG_H = new Int16Array(8);
export function fallenLogInCell(g, ccx, ccz) {
  LOG.ok = false;
  const h = hash2(ccx, ccz, g.seed ^ 0xf411);
  const roll = ((h >>> 8) & 0xffff) / 65536;
  if (roll > 0.2) return LOG; // en yüksek olasılık 0.2: hızlı çıkış
  const x = ccx * LOG_CELL + 2 + (h & 3);
  const z = ccz * LOG_CELL + 2 + ((h >>> 2) & 3);
  sampleColumn(g, x, z, col);
  const e = TABLE[col.biome];
  if (!e || roll >= e.p || col.h < SEA_LEVEL + 2) return LOG;
  const along = ((h >>> 4) & 1) === 0;
  const len = 3 + ((h >>> 5) % 3);
  const dx = along ? 1 : 0;
  const dz = along ? 0 : 1;
  LOG_H[0] = col.h;
  for (let i = 1; i < len; i++) {
    const px = x + dx * i;
    const pz = z + dz * i;
    sampleColumn(g, px, pz, col2);
    if (col2.biome !== col.biome || Math.abs(col2.h - col.h) > 1 || col2.h < SEA_LEVEL + 2) return LOG;
    LOG_H[i] = col2.h;
  }
  if (nearRing(x, z, 8) || sinkholeNear(g, x, z, 5) || sinkholeNear(g, x + dx * (len - 1), z + dz * (len - 1), 5)) return LOG;
  LOG.ok = true;
  LOG.x = x;
  LOG.z = z;
  LOG.dx = dx;
  LOG.dz = dz;
  LOG.len = len;
  LOG.id = e.ids[(h >>> 12) % e.ids.length];
  LOG.hash = h;
  LOG.biome = col.biome;
  return LOG;
}

/** Bu chunk'a değen devrik kütükleri yazar (ağaçlardan sonra; yalnız havaya). */
export function placeFallenLogs(g, blocks, x0, z0) {
  beginTrees(blocks, x0, z0);
  const ca = Math.floor((x0 - MARGIN) / LOG_CELL);
  const cb = Math.floor((x0 + 15 + MARGIN) / LOG_CELL);
  const za = Math.floor((z0 - MARGIN) / LOG_CELL);
  const zb = Math.floor((z0 + 15 + MARGIN) / LOG_CELL);
  for (let cz = za; cz <= zb; cz++) {
    for (let cx = ca; cx <= cb; cx++) {
      const L = fallenLogInCell(g, cx, cz);
      if (!L.ok) continue;
      for (let i = 0; i < L.len; i++) lf(L.x + L.dx * i, LOG_H[i] + 1, L.z + L.dz * i, L.id);
      // süs: kütüğün yanında mantar ya da eğrelti (yalnız havaya)
      const side = ((L.hash >>> 20) & 1) === 0 ? 1 : -1;
      const sx = L.x + (L.dx === 0 ? side : 0) + L.dx;
      const sz = L.z + (L.dz === 0 ? side : 0) + L.dz;
      const deco = ((L.hash >>> 22) & 3) === 0 ? B.MUSHROOM : B.FERN;
      const below = peek(sx, LOG_H[1], sz);
      if (below > 0 && below !== 20 && below !== 21) lf(sx, LOG_H[1] + 1, sz, deco); // yalnız katı zemin üstüne
    }
  }
}
