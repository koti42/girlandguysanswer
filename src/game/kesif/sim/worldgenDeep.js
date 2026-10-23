/*
 * KEŞİF sim — DERİN dünya üretimi (saf, belirlenimci; worldgen.js kullanır). y < 0 kesitleri TEMBEL üretilir:
 *
 *   generateDeepSection(seed, cx, cz, si, {openRings}) → {blocks: Uint8Array(4096) | null, uniform}
 *
 * Her kesit YALNIZ (seed, cx, cz, si, openRings)'e bağlıdır: üretim sırası, işçi/ana thread ayrımı sonucu değiştirmez.
 * Tüm "oyma" adımları mutlak koordinatın işlevidir (kaba kafes düğümleri mutlak y'nin 4'ün katları; solucan/salon/yarık hücre
 * tabanlı), böylece komşu kesitler dikişsiz birleşir. Yalnız mağara süsü (sarkıt/dikit, kristal kümeleri, mantar) kesit-yerel kalır.
 *
 * Sıra: kaya gövdesi (derinlikle bazalt bantları) → gürültü mağaraları (peynir+spagetti) → solucan tüneller → büyük salonlar
 * (göl/lav/kristal) → dikey yarıklar (şaftlar) → madenler → sıvılar (göl y ∈ (-150, 24], lav denizi y ≤ -262) → süs → TABAN ANA KAYASI
 * (en sonda: delik bırakmaz) → Mühür halkaları.
 *
 * Bantlar:  Mağaralar [-80,20)  Derin Mağaralar [-220,-80)  Ham Kayalık [-340,-220)  Dip [-400,-340) (uçurum: lav, kristal, nadir maden).
 */
import {
  SECTION_VOLUME, WORLD_Y_MIN, ZONES, zoneIndexAt,
} from './constants.js';
import { B, OPAQUE_LUT } from './blocks.js';
import { hash2, hash3, mulberry32 } from './rng.js';
import { SEAL_RING_RADII, getGen, ringIndexAt } from './worldgenTerrain.js';
import {
  LAVA_LAKE_Y, LAVA_SEA_Y, UG_WATER_DEEP_Y, UG_WATER_Y, carveNoiseCavesWin,
} from './worldgenCaves.js';
import { placeOresWin } from './worldgenOres.js';
import { applyCaveStyles, carveUndergroundRivers } from './worldgenCaveStyles.js';

export const BEDROCK_FLOOR_Y = WORLD_Y_MIN; // -400
/** Ana kaya üst yüzeyi sütun başına -399..-396 arasında pürüzlüdür; y ≤ -399 her sütunda KESİN ana kaya. */
export const BEDROCK_SOLID_Y = WORLD_Y_MIN + 1; // -399
export const BEDROCK_ROUGH_MAX_Y = WORLD_Y_MIN + 4; // -396

const SV = SECTION_VOLUME;
const SB = new Uint8Array(SV);
const SNAP = new Uint8Array(SV);
const TAU = Math.PI * 2;
const INV32 = 1 / 4294967296;

/** Ana kaya üst yüzeyi (dahil) bu sütunda. */
export function bedrockTopY(seed, wx, wz) {
  return BEDROCK_SOLID_Y + (hash2(wx, wz, seed ^ 0xbed10c) & 3) - 0;
}

/* ------------------------------------------------------------------------------------------------
 * 1) kaya gövdesi
 * ---------------------------------------------------------------------------------------------- */
function basaltFrac(y) {
  if (y >= -20) return 0.02;
  const f = 0.02 + ((-y - 20) / 380) * 0.9;
  return f > 0.9 ? 0.9 : f;
}

/** Kaya bantlarının sütun kayması (-4..4): bantlar yatay değil hafif dalgalıdır. Yüzey bandı tabanı da bunu kullanır. */
export function rockWob(g, wx, wz) {
  return Math.floor(g.c.simplex2(wx * 0.02 + 55, wz * 0.02 - 17) * 4.5);
}

/** Mutlak y'deki kaya türü (taş / bazalt bandı): bant (4 kalın) başına karar yalnızca (bant, tohum)'dur. */
export function rockIdAt(seed, y, wob) {
  const bh = hash2((y + wob) >> 2, 7, seed ^ 0x57a7) * INV32;
  return bh < basaltFrac(y) ? B.BASALT : B.STONE;
}

function fillRock(g, y0, x0, z0) {
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const wob = rockWob(g, x0 + lx, z0 + lz);
      for (let ly = 0; ly < 16; ly++) SB[(ly << 8) + col] = rockIdAt(g.seed, y0 + ly, wob);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 2) solucan tüneller (derin aile)
 * ---------------------------------------------------------------------------------------------- */
const WORM_CELL = 64;
const WORM_REACH = 5;

function getDeepWorms(g, wx, wz) {
  if (!g.dworms) g.dworms = new Map();
  const key = (wx + 1024) * 4096 + (wz + 1024);
  let list = g.dworms.get(key);
  if (list) return list;
  list = [];
  const rnd = mulberry32(hash2(wx, wz, g.seed ^ 0x3a2fd));
  const r0 = rnd();
  const n = r0 < 0.08 ? 1 : (r0 < 0.4 ? 2 : (r0 < 0.8 ? 3 : 4));
  for (let w = 0; w < n; w++) {
    let x = wx * WORM_CELL + rnd() * WORM_CELL;
    let z = wz * WORM_CELL + rnd() * WORM_CELL;
    let y = -388 + rnd() * 382;
    const home = y;
    let yaw = rnd() * TAU;
    let pitch = (rnd() - 0.5) * 0.4;
    const steps = 80 + Math.floor(rnd() * 70);
    const baseR = 1.8 + rnd() * 2.6;
    const phase = rnd() * TAU;
    const pts = new Float32Array(steps * 4);
    let minX = 1e9;
    let maxX = -1e9;
    let minY = 1e9;
    let maxY = -1e9;
    let minZ = 1e9;
    let maxZ = -1e9;
    let blob = 0;
    for (let i = 0; i < steps; i++) {
      if (blob <= 0 && rnd() < 0.03) blob = 7;
      let r = baseR * (0.72 + 0.38 * Math.sin(i * 0.21 + phase));
      if (blob > 0) {
        r += 1.8 + 0.3 * blob;
        blob--;
      }
      pts[i * 4] = x;
      pts[i * 4 + 1] = y;
      pts[i * 4 + 2] = z;
      pts[i * 4 + 3] = r;
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (y - r < minY) minY = y - r;
      if (y + r > maxY) maxY = y + r;
      if (z - r < minZ) minZ = z - r;
      if (z + r > maxZ) maxZ = z + r;
      yaw += (rnd() - 0.5) * 0.5;
      pitch += (rnd() - 0.5) * 0.28 + (home - y) * 0.004;
      pitch *= 0.9;
      if (y < -392) pitch += 0.12;
      else if (y > -3) pitch -= 0.12;
      if (pitch > 0.5) pitch = 0.5;
      else if (pitch < -0.5) pitch = -0.5;
      const cp = Math.cos(pitch);
      x += Math.cos(yaw) * cp * 1.8;
      z += Math.sin(yaw) * cp * 1.8;
      y += Math.sin(pitch) * 1.8;
    }
    list.push({
      pts, steps, minX, maxX, minY, maxY, minZ, maxZ,
    });
  }
  if (g.dworms.size > 1200) g.dworms.clear();
  g.dworms.set(key, list);
  return list;
}

function carveSphereWin(y0, x0, z0, px, py, pz, pr) {
  const xa = Math.max(x0, Math.floor(px - pr));
  const xb = Math.min(x0 + 15, Math.ceil(px + pr));
  const za = Math.max(z0, Math.floor(pz - pr));
  const zb = Math.min(z0 + 15, Math.ceil(pz + pr));
  const ya = Math.max(y0, Math.floor(py - pr));
  const yb = Math.min(y0 + 15, Math.ceil(py + pr));
  if (xa > xb || za > zb || ya > yb) return;
  const r2 = pr * pr;
  for (let z = za; z <= zb; z++) {
    const dz = z + 0.5 - pz;
    for (let x = xa; x <= xb; x++) {
      const dx = x + 0.5 - px;
      const dd = dx * dx + dz * dz;
      if (dd > r2) continue;
      const col = ((z - z0) << 4) + (x - x0);
      for (let y = ya; y <= yb; y++) {
        const dy = y + 0.5 - py;
        if (dd + dy * dy <= r2) SB[((y - y0) << 8) + col] = 0;
      }
    }
  }
}

function carveWorms(g, y0, x0, z0) {
  const cwa = Math.floor(x0 / WORM_CELL) - WORM_REACH;
  const cwb = Math.floor((x0 + 15) / WORM_CELL) + WORM_REACH;
  const cza = Math.floor(z0 / WORM_CELL) - WORM_REACH;
  const czb = Math.floor((z0 + 15) / WORM_CELL) + WORM_REACH;
  for (let cz = cza; cz <= czb; cz++) {
    for (let cx = cwa; cx <= cwb; cx++) {
      const worms = getDeepWorms(g, cx, cz);
      for (let w = 0; w < worms.length; w++) {
        const wm = worms[w];
        if (wm.maxX < x0 || wm.minX > x0 + 16 || wm.maxZ < z0 || wm.minZ > z0 + 16
          || wm.maxY < y0 || wm.minY > y0 + 16) continue;
        const p = wm.pts;
        for (let i = 0; i < wm.steps; i++) {
          const px = p[i * 4];
          const py = p[i * 4 + 1];
          const pz = p[i * 4 + 2];
          const pr = p[i * 4 + 3];
          if (px + pr < x0 || px - pr > x0 + 16 || pz + pr < z0 || pz - pr > z0 + 16
            || py + pr < y0 || py - pr > y0 + 16) continue;
          carveSphereWin(y0, x0, z0, px, py, pz, pr);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 3) büyük salonlar (derin aile; göl / lav / kristal)
 * ---------------------------------------------------------------------------------------------- */
const HALL_CELL = 96;

/** Salon hücresindeki derin salonlar (önbellekli): {x,y,z,rx,ry,rz,crystal,waterY,lavaY,zone}. */
export function deepHallsInCell(g, hx, hz) {
  if (!g.dhalls) g.dhalls = new Map();
  const key = (hx + 1024) * 4096 + (hz + 1024);
  let list = g.dhalls.get(key);
  if (list) return list;
  list = [];
  const rnd = mulberry32(hash2(hx, hz, g.seed ^ 0x4a11d));
  const r0 = rnd();
  const n = r0 < 0.15 ? 0 : (r0 < 0.55 ? 1 : (r0 < 0.9 ? 2 : 3));
  for (let i = 0; i < n; i++) {
    const x = hx * HALL_CELL + 22 + rnd() * (HALL_CELL - 44);
    const z = hz * HALL_CELL + 22 + rnd() * (HALL_CELL - 44);
    const y = -375 + rnd() * 335;
    const rx = 11 + rnd() * 14;
    const rz = rx * (0.7 + rnd() * 0.6);
    const ry = 5 + rnd() * 8;
    const depthF = Math.min(1, Math.max(0, (-y - 40) / 340));
    const zone = zoneIndexAt(x, z);
    const crystal = rnd() < 0.1 + 0.3 * depthF;
    const lake = !crystal && y > -140 && rnd() < 0.35;
    const lava = !crystal && !lake && y < -190 && rnd() < 0.55;
    list.push({
      x, y, z, rx, ry, rz, crystal, zone,
      waterY: lake ? Math.floor(y - ry * 0.3) : -9999,
      lavaY: lava ? Math.floor(y - ry * 0.25) : -9999,
    });
  }
  if (g.dhalls.size > 300) g.dhalls.clear();
  g.dhalls.set(key, list);
  return list;
}

function carveHalls(g, y0, x0, z0) {
  const K = g.k;
  const ca = Math.floor((x0 - 40) / HALL_CELL);
  const cb = Math.floor((x0 + 55) / HALL_CELL);
  const za = Math.floor((z0 - 40) / HALL_CELL);
  const zb = Math.floor((z0 + 55) / HALL_CELL);
  for (let hz = za; hz <= zb; hz++) {
    for (let hx = ca; hx <= cb; hx++) {
      const halls = deepHallsInCell(g, hx, hz);
      for (let k = 0; k < halls.length; k++) {
        const h = halls[k];
        const ext = h.crystal ? 1.25 : 1.0;
        const ax = h.rx * ext + 2;
        const az = h.rz * ext + 2;
        if (h.x + ax < x0 || h.x - ax > x0 + 16 || h.z + az < z0 || h.z - az > z0 + 16) continue;
        const ya = Math.max(y0, Math.floor(h.y - h.ry * 1.8 * ext - 2));
        const yb = Math.min(y0 + 15, Math.ceil(h.y + h.ry * ext + 2));
        if (ya > yb) continue;
        const xa = Math.max(x0, Math.floor(h.x - ax));
        const xb = Math.min(x0 + 15, Math.ceil(h.x + ax));
        const za2 = Math.max(z0, Math.floor(h.z - az));
        const zb2 = Math.min(z0 + 15, Math.ceil(h.z + az));
        for (let z = za2; z <= zb2; z++) {
          const dz = (z + 0.5 - h.z) / h.rz;
          for (let x = xa; x <= xb; x++) {
            const dx = (x + 0.5 - h.x) / h.rx;
            const dxz = dx * dx + dz * dz;
            if (dxz > 1.6) continue;
            const col = ((z - z0) << 4) + (x - x0);
            for (let y = ya; y <= yb; y++) {
              let dy = (y + 0.5 - h.y) / h.ry;
              if (dy < 0) dy *= 1.6;
              const q = dxz + dy * dy + K.simplex3(x * 0.08, y * 0.11, z * 0.08) * 0.34;
              const i = ((y - y0) << 8) + col;
              if (q < 1) {
                if (y <= h.lavaY) SB[i] = B.LAVA;
                else if (y <= h.waterY) SB[i] = B.WATER;
                else SB[i] = 0;
              } else if (h.crystal && q < 1.22) {
                const b = SB[i];
                if (b === B.STONE || b === B.BASALT) {
                  const r = hash3(x, y, z, g.seed ^ 0x77c2) * INV32;
                  if (r < 0.5) SB[i] = B.CRYSTAL_ROCK;
                  else if (r < 0.61) SB[i] = B.AMETHYST;
                  else if (r < 0.63 && y < -190) SB[i] = B.QUANTUM_ORE;
                }
              }
            }
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 4) dikey yarıklar (şaftlar / uçurumlar)
 * ---------------------------------------------------------------------------------------------- */
const SHAFT_CELL = 96;

/** Yarık hücresindeki yarık ({x,z,cos,sin,len,wid,y0,y1}) ya da null. */
export function deepShaftInCell(g, sx, sz) {
  if (!g.dshafts) g.dshafts = new Map();
  const key = (sx + 1024) * 4096 + (sz + 1024);
  let s = g.dshafts.get(key);
  if (s !== undefined) return s;
  s = null;
  const rnd = mulberry32(hash2(sx, sz, g.seed ^ 0x5a37f));
  if (rnd() < 0.34) {
    const x = sx * SHAFT_CELL + 14 + rnd() * (SHAFT_CELL - 28);
    const z = sz * SHAFT_CELL + 14 + rnd() * (SHAFT_CELL - 28);
    const ang = rnd() * Math.PI;
    const len = 26 + rnd() * 46;
    const wid = 2.6 + rnd() * 3.4;
    const y0 = -300 + rnd() * 280;
    const h = 70 + rnd() * 130;
    s = {
      x, z, cos: Math.cos(ang), sin: Math.sin(ang), len, wid, y0, y1: Math.min(y0 + h, 8),
    };
  }
  if (g.dshafts.size > 300) g.dshafts.clear();
  g.dshafts.set(key, s);
  return s;
}

function carveShafts(g, y0, x0, z0) {
  const K = g.k;
  const a = Math.floor((x0 - 40) / SHAFT_CELL);
  const b = Math.floor((x0 + 55) / SHAFT_CELL);
  const c = Math.floor((z0 - 40) / SHAFT_CELL);
  const d = Math.floor((z0 + 55) / SHAFT_CELL);
  for (let sz = c; sz <= d; sz++) {
    for (let sx = a; sx <= b; sx++) {
      const s = deepShaftInCell(g, sx, sz);
      if (!s) continue;
      const reach = s.len * 0.5 + s.wid + 4;
      if (s.x + reach < x0 || s.x - reach > x0 + 16 || s.z + reach < z0 || s.z - reach > z0 + 16) continue;
      const ya = Math.max(y0, Math.ceil(s.y0));
      const yb = Math.min(y0 + 15, Math.floor(s.y1));
      if (ya > yb) continue;
      const span = s.y1 - s.y0;
      for (let lz = 0; lz < 16; lz++) {
        const dz = z0 + lz + 0.5 - s.z;
        for (let lx = 0; lx < 16; lx++) {
          const dx = x0 + lx + 0.5 - s.x;
          const u = (dx * s.cos + dz * s.sin) / (s.len * 0.5);
          const v = (-dx * s.sin + dz * s.cos) / (s.wid * 0.5);
          const q0 = u * u + v * v;
          if (q0 > 2.2) continue;
          const col = (lz << 4) + lx;
          for (let y = ya; y <= yb; y++) {
            const t = span > 0 ? (y - s.y0) / span : 0.5;
            const taper = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
            const q = q0 / (taper * taper + 0.04) + K.simplex3((x0 + lx) * 0.1, y * 0.12, (z0 + lz) * 0.1) * 0.3;
            if (q < 1) SB[((y - y0) << 8) + col] = 0;
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 5) sıvılar
 * ---------------------------------------------------------------------------------------------- */
function fillLiquids(g, y0, x0, z0) {
  const K = g.c;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      let lake = 0; // 0 = hesaplanmadı, 1 = göl yok, 2 = göl var
      let lava = 0;
      for (let ly = 0; ly < 16; ly++) {
        const i = (ly << 8) + col;
        if (SB[i] !== 0) continue;
        const y = y0 + ly;
        if (y <= LAVA_SEA_Y) {
          SB[i] = B.LAVA;
        } else if (y <= LAVA_LAKE_Y) {
          if (lava === 0) {
            const m = K.fbm2((x0 + lx) * 0.013 + 900, (z0 + lz) * 0.013 - 500, 2) * 1.5;
            lava = m > 0.25 ? 2 : 1;
          }
          if (lava === 2) SB[i] = B.LAVA;
        } else if (y <= UG_WATER_Y && y > UG_WATER_DEEP_Y) {
          if (lake === 0) {
            const m = K.fbm2((x0 + lx) * 0.011 + 3100, (z0 + lz) * 0.011 - 700, 2) * 1.5;
            lake = m > 0.2 ? 2 : 1;
          }
          if (lake === 2) SB[i] = B.WATER;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 6) mağara süsü (kesit-yerel; anlık görüntüye göre karar → sıra bağımsız)
 * ---------------------------------------------------------------------------------------------- */
function decorate(g, y0, x0, z0) {
  SNAP.set(SB);
  const s1 = g.seed ^ 0x6c0d1;
  for (let ly = 0; ly < 16; ly++) {
    const y = y0 + ly;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const i = (ly << 8) + (lz << 4) + lx;
        if (SNAP[i] !== 0) continue;
        const wx = x0 + lx;
        const wz = z0 + lz;
        const below = ly > 0 ? SNAP[i - 256] : 0;
        const above = ly < 15 ? SNAP[i + 256] : 0;
        if (below !== 0 && OPAQUE_LUT[below] === 1) {
          const r = hash3(wx, y, wz, s1) * INV32;
          if (r < 0.0009) {
            // kristal kümesi: zeminde 1-3 yüksek ametist/kristal sütunu
            const id = hash3(wx, y, wz, s1 ^ 0x11) & 1 ? B.AMETHYST : B.CRYSTAL_ROCK;
            const len = 1 + (hash3(wx, y, wz, s1 ^ 0x12) % 3);
            for (let k = 0; k < len && ly + k < 16 && SNAP[i + k * 256] === 0; k++) SB[i + k * 256] = id;
          } else if (r < 0.006) {
            // dikit
            const len = 1 + (hash3(wx, y, wz, s1 ^ 0x21) % 3);
            for (let k = 0; k < len && ly + k < 16 && SNAP[i + k * 256] === 0; k++) SB[i + k * 256] = below === B.BASALT ? B.BASALT : B.STONE;
          } else if (r < 0.0095 && y > -170 && below === B.STONE) {
            SB[i] = B.MUSHROOM;
          }
        } else if (above !== 0 && OPAQUE_LUT[above] === 1) {
          const r = hash3(wx, y, wz, s1 ^ 0x31) * INV32;
          if (r < 0.0012) {
            const id = hash3(wx, y, wz, s1 ^ 0x32) & 1 ? B.AMETHYST : B.CRYSTAL_ROCK;
            SB[i] = id;
          } else if (r < 0.0095) {
            // sarkıt
            const len = 1 + (hash3(wx, y, wz, s1 ^ 0x33) % 5);
            for (let k = 0; k < len && ly - k >= 0 && SNAP[i - k * 256] === 0; k++) SB[i - k * 256] = above === B.BASALT ? B.BASALT : B.STONE;
          }
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 7) taban ana kayası + mühür
 * ---------------------------------------------------------------------------------------------- */
function bedrockFloor(g, y0, x0, z0) {
  if (y0 > BEDROCK_ROUGH_MAX_Y) return;
  const seed = g.seed;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const top = bedrockTopY(seed, x0 + lx, z0 + lz);
      for (let ly = 0; ly < 16; ly++) {
        if (y0 + ly > top) break;
        SB[(ly << 8) + col] = B.BEDROCK;
      }
    }
  }
}

function sealRings(y0, x0, z0, openRings) {
  const rc = Math.sqrt((x0 + 8) * (x0 + 8) + (z0 + 8) * (z0 + 8));
  for (let ring = 0; ring < SEAL_RING_RADII.length; ring++) {
    if (ring < 4 && ((openRings >> ring) & 1)) continue;
    if (Math.abs(rc - SEAL_RING_RADII[ring]) > 13.5) continue;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        if (ringIndexAt(x0 + lx, z0 + lz) !== ring) continue;
        const col = (lz << 4) + lx;
        for (let ly = 0; ly < 16; ly++) {
          const i = (ly << 8) + col;
          if (SB[i] !== B.BEDROCK) SB[i] = B.SEAL_BARRIER;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Ana giriş
 * ---------------------------------------------------------------------------------------------- */
/**
 * Derin kesit üretir (si: kesit indeksi, 0 = y -400..-385). Tek tip ise {blocks:null, uniform}. Yeni dizi sahiplidir.
 * opts.openRings: Mühür halkaları açık bit maskesi (bit i = i. halka). opts.seal === false: halkasız.
 */
export function generateDeepSection(seed, cx, cz, si, opts) {
  const g = getGen(seed);
  const o = opts || {};
  const y0 = WORLD_Y_MIN + si * 16;
  const x0 = cx * 16;
  const z0 = cz * 16;
  fillRock(g, y0, x0, z0);
  carveNoiseCavesWin(g, SB, y0, x0, z0, y0, y0 + 15, null);
  carveWorms(g, y0, x0, z0);
  carveHalls(g, y0, x0, z0);
  carveShafts(g, y0, x0, z0);
  carveUndergroundRivers(g, SB, y0, y0, y0 + 15, x0, z0);
  placeOresWin(g.seed, SB, y0, y0, y0 + 15, cx, cz, null, ZONES.length ? zoneIndexAt(x0 + 8, z0 + 8) : 0);
  fillLiquids(g, y0, x0, z0);
  applyCaveStyles(g, SB, y0, y0, y0 + 15, x0, z0, null);
  decorate(g, y0, x0, z0);
  bedrockFloor(g, y0, x0, z0);
  if (o.seal !== false) sealRings(y0, x0, z0, o.openRings | 0);
  const v = SB[0];
  let uni = true;
  for (let i = 1; i < SV; i++) {
    if (SB[i] !== v) {
      uni = false;
      break;
    }
  }
  if (uni) return { blocks: null, uniform: v };
  return { blocks: SB.slice(), uniform: 0 };
}
