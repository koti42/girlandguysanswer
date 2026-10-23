/*
 * KEŞİF sim — mağara sistemi (saf, belirlenimci; worldgen.js kullanır).
 *
 *  1. Kaba ızgaradan (4 blok) üç doğrusal enterpolasyonlu 3B gürültü: yassı "peynir" salonları + spagetti tüneller
 *  2. Solucan tüneller: 64×64 hücre başına belirlenimci yollar (önbellekli), chunk sınırlarını aşar
 *  3. Büyük salonlar (128×128 hücre): elipsoid, gürültüyle pürüzlü; kristal salon (kristal kaya/ametist/kuantum kabuğu),
 *     yeraltı gölü, lav havuzu
 *  4. Çukurlar (sinkhole): yüzeyden mağara katına inen dik şaftlar (mağara girişi)
 *  5. Yeraltı sıvıları (derin lav, göl) + mağara süsü (ışıklı mantar, yosun, sarmaşık)
 *
 * Normal oyma yüzeyin 3 blok altına kadar iner (ağaç/yüzey bozulmaz); yalnız çukurlar yüzeyi deler.
 */
import { SEA_LEVEL, zoneIndexAt } from './constants.js';
import { B, OPAQUE_LUT } from './blocks.js';
import { hash2, hash3, mulberry32 } from './rng.js';
import { sinkholeInCell, SINKHOLE_CELL_SIZE } from './worldgenTerrain.js';
import { applyCaveStyles, carveRavines } from './worldgenCaveStyles.js';

/**
 * Derin dünya: yüzey bandı (y ≥ 0) penceresinde artık lav gölü yoktur (lav denizi y < LAVA_SEA_Y, worldgenDeep.js);
 * yeraltı suyu (göl) mağaralarda y ≤ UG_WATER_Y'den y > UG_WATER_DEEP_Y'ye kadar (maske sütunlarında) iner.
 */
export const LAVA_Y = -300;
/** Lav denizi: y ≤ LAVA_SEA_Y her mağara boşluğu lavdır (Dip); LAVA_SEA_Y < y ≤ LAVA_LAKE_Y arası maske sütunlarında lav gölleri. */
export const LAVA_SEA_Y = -330;
export const LAVA_LAKE_Y = -250;
export const UG_WATER_Y = 24;
export const UG_WATER_DEEP_Y = -150;
const MAX_CARVE_Y = 150;
const LAT = 5;
const MAX_ROWS = 48;

const latCav = new Float32Array(LAT * LAT * MAX_ROWS);
const latT1 = new Float32Array(LAT * LAT * MAX_ROWS);
const latT2 = new Float32Array(LAT * LAT * MAX_ROWS);
const colC = new Float32Array(MAX_ROWS);
const colA = new Float32Array(MAX_ROWS);
const colB = new Float32Array(MAX_ROWS);

/* ------------------------------------------------------------------------------------------------
 * 1) 3B gürültü salonları + tüneller
 * ---------------------------------------------------------------------------------------------- */
/**
 * Peynir mağara eşiği (küçük = daha çok mağara): derinde mağaralar büyür (y<30), yüksek dağ içinde (y>100) yumuşakça kapanır.
 * Yüzeye yakın (dep<12) kapanır. Pencereden bağımsız (mutlak y'nin işlevi) → kesitler ve yüzey bandı dikişsiz birleşir.
 */
export function cheeseThreshold(y, dep) {
  let thr = 0.50;
  if (y < 30) thr -= Math.min(30 - y, 55) * 0.0028;
  else if (y > 100) thr += (y - 100) * 0.02;
  if (dep < 12) thr += (12 - dep) * 0.035;
  return thr;
}

/**
 * Pencereli gürültü mağaraları: mutlak y ∈ [yA, yB] aralığını oyar; blocks indeksi ((y - yBase) << 8) + sütun.
 * ht (Int16Array 256) verilirse oyma sütun yüzeyinin 3 blok altında durur ve yüzeye yakın kapanır; verilmezse (derin kesit) sınır yok.
 * Kaba kafes (4 blok) düğümleri mutlak y'nin 4'ün katlarındadır (x/z: chunk başlangıcı + 4k) → her pencere aynı değeri üretir.
 */
export function carveNoiseCavesWin(g, blocks, yBase, x0, z0, yA, yB, ht) {
  let ymaxC = yB < MAX_CARVE_Y ? yB : MAX_CARVE_Y;
  if (ht) {
    let maxLimit = -1e9;
    for (let i = 0; i < 256; i++) {
      const l = ht[i] - 3;
      if (l > maxLimit) maxLimit = l;
    }
    if (maxLimit < yA + 1) return;
    if (maxLimit < ymaxC) ymaxC = maxLimit;
  }
  if (ymaxC < yA) return;
  const jA = yA >> 2;
  const rows = (ymaxC >> 2) + 2 - jA;
  const K = g.k;
  for (let kz = 0; kz < LAT; kz++) {
    for (let kx = 0; kx < LAT; kx++) {
      const wx = x0 + kx * 4;
      const wz = z0 + kz * 4;
      const base = (kz * LAT + kx) * rows;
      for (let j = 0; j < rows; j++) {
        const wy = (jA + j) * 4;
        latCav[base + j] = K.fbm3(wx * 0.019, wy * 0.03, wz * 0.019, 2);
        latT1[base + j] = K.simplex3(wx * 0.028 + 100, wy * 0.034, wz * 0.028);
        latT2[base + j] = K.simplex3(wx * 0.028 - 300, wy * 0.034 + 50, wz * 0.028 + 700);
      }
    }
  }
  for (let lz = 0; lz < 16; lz++) {
    const iz = lz >> 2;
    const fz = (lz & 3) * 0.25;
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      let limit = 1e9;
      let top = ymaxC;
      if (ht) {
        limit = ht[col] - 3;
        if (limit < yA) continue;
        if (limit < top) top = limit;
      }
      const ix = lx >> 2;
      const fx = (lx & 3) * 0.25;
      const b00 = (iz * LAT + ix) * rows;
      const b10 = b00 + rows;
      const b01 = ((iz + 1) * LAT + ix) * rows;
      const b11 = b01 + rows;
      const w00 = (1 - fx) * (1 - fz);
      const w10 = fx * (1 - fz);
      const w01 = (1 - fx) * fz;
      const w11 = fx * fz;
      const jm = (top >> 2) + 1 - jA;
      for (let j = 0; j <= jm; j++) {
        colC[j] = w00 * latCav[b00 + j] + w10 * latCav[b10 + j] + w01 * latCav[b01 + j] + w11 * latCav[b11 + j];
        colA[j] = w00 * latT1[b00 + j] + w10 * latT1[b10 + j] + w01 * latT1[b01 + j] + w11 * latT1[b11 + j];
        colB[j] = w00 * latT2[b00 + j] + w10 * latT2[b10 + j] + w01 * latT2[b01 + j] + w11 * latT2[b11 + j];
      }
      for (let y = yA; y <= top; y++) {
        const j = (y >> 2) - jA;
        const fy = (y & 3) * 0.25;
        const dep = limit - y;
        const c = colC[j] + (colC[j + 1] - colC[j]) * fy;
        const thr = cheeseThreshold(y, dep);
        if (c > thr) {
          blocks[((y - yBase) << 8) + col] = 0;
          continue;
        }
        const t1 = colA[j] + (colA[j + 1] - colA[j]) * fy;
        const t2 = colB[j] + (colB[j + 1] - colB[j]) * fy;
        let w2 = dep < 10 ? 0.014 * (dep / 10) : 0.014;
        if (y < 0) w2 *= 1 + Math.min(-y, 200) * 0.003;
        if (t1 * t1 + t2 * t2 < w2) blocks[((y - yBase) << 8) + col] = 0;
      }
    }
  }
}

function carveNoiseCaves(g, blocks, x0, z0, ht) {
  carveNoiseCavesWin(g, blocks, 0, x0, z0, 0, MAX_CARVE_Y, ht);
}

/* ------------------------------------------------------------------------------------------------
 * 2) solucan tüneller
 * ---------------------------------------------------------------------------------------------- */
const WORM_CELL = 64;
const WORM_REACH_CELLS = 4;
const TAU = Math.PI * 2;

function getWorms(g, wx, wz) {
  const key = (wx + 1024) * 4096 + (wz + 1024);
  let list = g.worms.get(key);
  if (list) return list;
  list = [];
  const rnd = mulberry32(hash2(wx, wz, g.seed ^ 0x3a2f));
  const r0 = rnd();
  const n = r0 < 0.1 ? 0 : (r0 < 0.45 ? 1 : (r0 < 0.82 ? 2 : 3));
  for (let w = 0; w < n; w++) {
    let x = wx * WORM_CELL + rnd() * WORM_CELL;
    let z = wz * WORM_CELL + rnd() * WORM_CELL;
    let y = 9 + rnd() * 50;
    let yaw = rnd() * TAU;
    let pitch = (rnd() - 0.5) * 0.5;
    const steps = 70 + Math.floor(rnd() * 70);
    const baseR = 1.8 + rnd() * 2.2;
    const phase = rnd() * TAU;
    const pts = new Float32Array(steps * 4);
    let minX = 1e9;
    let maxX = -1e9;
    let minZ = 1e9;
    let maxZ = -1e9;
    let blob = 0;
    for (let i = 0; i < steps; i++) {
      if (blob <= 0 && rnd() < 0.025) blob = 6;
      let r = baseR * (0.72 + 0.38 * Math.sin(i * 0.21 + phase));
      if (blob > 0) {
        r += 1.4 + 0.25 * blob;
        blob--;
      }
      pts[i * 4] = x;
      pts[i * 4 + 1] = y;
      pts[i * 4 + 2] = z;
      pts[i * 4 + 3] = r;
      if (x - r < minX) minX = x - r;
      if (x + r > maxX) maxX = x + r;
      if (z - r < minZ) minZ = z - r;
      if (z + r > maxZ) maxZ = z + r;
      yaw += (rnd() - 0.5) * 0.55;
      pitch += (rnd() - 0.5) * 0.3;
      pitch *= 0.93;
      if (y < 12) pitch += 0.06;
      else if (y > 64) pitch -= 0.06;
      if (pitch > 0.55) pitch = 0.55;
      else if (pitch < -0.55) pitch = -0.55;
      const cp = Math.cos(pitch);
      x += Math.cos(yaw) * cp * 1.7;
      z += Math.sin(yaw) * cp * 1.7;
      y += Math.sin(pitch) * 1.7;
    }
    list.push({ pts, steps, minX, maxX, minZ, maxZ });
  }
  if (g.worms.size > 800) g.worms.clear();
  g.worms.set(key, list);
  return list;
}

function carveSphere(blocks, x0, z0, ht, px, py, pz, pr) {
  const xa = Math.max(x0, Math.floor(px - pr));
  const xb = Math.min(x0 + 15, Math.ceil(px + pr));
  const za = Math.max(z0, Math.floor(pz - pr));
  const zb = Math.min(z0 + 15, Math.ceil(pz + pr));
  const ya = Math.max(0, Math.floor(py - pr));
  const yb = Math.min(MAX_CARVE_Y, Math.ceil(py + pr));
  const r2 = pr * pr;
  for (let z = za; z <= zb; z++) {
    const dz = z + 0.5 - pz;
    for (let x = xa; x <= xb; x++) {
      const dx = x + 0.5 - px;
      const col = ((z - z0) << 4) + (x - x0);
      const lim = ht[col] - 3;
      const dd = dx * dx + dz * dz;
      if (dd > r2) continue;
      const ye = yb < lim ? yb : lim;
      for (let y = ya; y <= ye; y++) {
        const dy = y + 0.5 - py;
        if (dd + dy * dy <= r2) blocks[(y << 8) + col] = 0;
      }
    }
  }
}

function carveWorms(g, blocks, x0, z0, ht) {
  const cwa = Math.floor(x0 / WORM_CELL) - WORM_REACH_CELLS;
  const cwb = Math.floor((x0 + 15) / WORM_CELL) + WORM_REACH_CELLS;
  const cza = Math.floor(z0 / WORM_CELL) - WORM_REACH_CELLS;
  const czb = Math.floor((z0 + 15) / WORM_CELL) + WORM_REACH_CELLS;
  for (let cz = cza; cz <= czb; cz++) {
    for (let cx = cwa; cx <= cwb; cx++) {
      const worms = getWorms(g, cx, cz);
      for (let w = 0; w < worms.length; w++) {
        const wm = worms[w];
        if (wm.maxX < x0 || wm.minX > x0 + 16 || wm.maxZ < z0 || wm.minZ > z0 + 16) continue;
        const p = wm.pts;
        for (let i = 0; i < wm.steps; i++) {
          const px = p[i * 4];
          const pz = p[i * 4 + 2];
          const pr = p[i * 4 + 3];
          if (px + pr < x0 || px - pr > x0 + 16 || pz + pr < z0 || pz - pr > z0 + 16) continue;
          carveSphere(blocks, x0, z0, ht, px, p[i * 4 + 1], pz, pr);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 3) büyük salonlar
 * ---------------------------------------------------------------------------------------------- */
const HALL_CELL = 128;
const CRYSTAL_P = [0.10, 0.15, 0.30, 0.30, 0.45];

/** Salon hücresindeki salonlar (önbellekli): {x,y,z,rx,ry,rz,crystal,waterY,lavaY,zone}. */
export function hallsInCell(g, hx, hz) {
  const key = (hx + 1024) * 4096 + (hz + 1024);
  let list = g.halls.get(key);
  if (list) return list;
  list = [];
  const rnd = mulberry32(hash2(hx, hz, g.seed ^ 0x4a11));
  const r0 = rnd();
  const n = r0 < 0.12 ? 0 : (r0 < 0.72 ? 1 : 2);
  for (let i = 0; i < n; i++) {
    const x = hx * HALL_CELL + 24 + rnd() * (HALL_CELL - 48);
    const z = hz * HALL_CELL + 24 + rnd() * (HALL_CELL - 48);
    const y = 14 + rnd() * 20;
    const rx = 10 + rnd() * 10;
    const rz = rx * (0.7 + rnd() * 0.6);
    const ry = 4.5 + rnd() * 4.5;
    const zone = zoneIndexAt(x, z);
    const crystal = rnd() < CRYSTAL_P[zone];
    const lake = !crystal && rnd() < 0.35;
    const lava = !crystal && !lake && y < 20 && rnd() < 0.5;
    list.push({
      x, y, z, rx, ry, rz, crystal, zone,
      waterY: lake ? Math.floor(y - ry * 0.35) : 0,
      lavaY: lava ? Math.floor(y - ry * 0.3) : 0,
    });
  }
  if (g.halls.size > 200) g.halls.clear();
  g.halls.set(key, list);
  return list;
}

function carveHalls(g, blocks, x0, z0, ht) {
  const K = g.k;
  const ca = Math.floor((x0 - 30) / HALL_CELL);
  const cb = Math.floor((x0 + 45) / HALL_CELL);
  const za = Math.floor((z0 - 30) / HALL_CELL);
  const zb = Math.floor((z0 + 45) / HALL_CELL);
  for (let hz = za; hz <= zb; hz++) {
    for (let hx = ca; hx <= cb; hx++) {
      const halls = hallsInCell(g, hx, hz);
      for (let k = 0; k < halls.length; k++) {
        const h = halls[k];
        const ext = h.crystal ? 1.25 : 1.0;
        const ax = h.rx * ext + 2;
        const az = h.rz * ext + 2;
        if (h.x + ax < x0 || h.x - ax > x0 + 16 || h.z + az < z0 || h.z - az > z0 + 16) continue;
        const xa = Math.max(x0, Math.floor(h.x - ax));
        const xb = Math.min(x0 + 15, Math.ceil(h.x + ax));
        const za2 = Math.max(z0, Math.floor(h.z - az));
        const zb2 = Math.min(z0 + 15, Math.ceil(h.z + az));
        const ya = Math.max(0, Math.floor(h.y - h.ry * 1.8 * ext - 2));
        const yb = Math.min(MAX_CARVE_Y, Math.ceil(h.y + h.ry * ext + 2));
        for (let z = za2; z <= zb2; z++) {
          const dz = (z + 0.5 - h.z) / h.rz;
          for (let x = xa; x <= xb; x++) {
            const dx = (x + 0.5 - h.x) / h.rx;
            const dxz = dx * dx + dz * dz;
            if (dxz > 1.6) continue;
            const col = ((z - z0) << 4) + (x - x0);
            const lim = ht[col] - 3;
            for (let y = ya; y <= yb; y++) {
              if (y > lim) break;
              let dy = (y + 0.5 - h.y) / h.ry;
              if (dy < 0) dy *= 1.6;
              const q = dxz + dy * dy + K.simplex3(x * 0.08, y * 0.11, z * 0.08) * 0.34;
              const i = (y << 8) + col;
              if (q < 1) {
                if (h.lavaY && y <= h.lavaY) blocks[i] = B.LAVA;
                else if (h.waterY && y <= h.waterY) blocks[i] = B.WATER;
                else blocks[i] = 0;
              } else if (h.crystal && q < 1.22) {
                const b = blocks[i];
                if (b === B.STONE || b === B.BASALT) {
                  const r = hash3(x, y, z, g.seed ^ 0x77c1) / 4294967296;
                  if (r < 0.5) blocks[i] = B.CRYSTAL_ROCK;
                  else if (r < 0.61) blocks[i] = B.AMETHYST;
                  else if (r < 0.63 && h.zone >= 2) blocks[i] = B.QUANTUM_ORE;
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
 * 4) çukurlar
 * ---------------------------------------------------------------------------------------------- */
function carveSinkholes(g, blocks, x0, z0, ht) {
  const a = Math.floor(x0 / SINKHOLE_CELL_SIZE);
  const b = Math.floor((x0 + 15) / SINKHOLE_CELL_SIZE);
  const c = Math.floor(z0 / SINKHOLE_CELL_SIZE);
  const d = Math.floor((z0 + 15) / SINKHOLE_CELL_SIZE);
  for (let cz = c; cz <= d; cz++) {
    for (let cx = a; cx <= b; cx++) {
      const s = sinkholeInCell(g, cx, cz);
      if (!s) continue;
      for (let lz = 0; lz < 16; lz++) {
        const dz = z0 + lz + 0.5 - s.z;
        for (let lx = 0; lx < 16; lx++) {
          const dx = x0 + lx + 0.5 - s.x;
          if (dx * dx + dz * dz > s.r * s.r) continue;
          const col = (lz << 4) + lx;
          const h = ht[col];
          if (h < SEA_LEVEL + 3) continue;
          for (let y = 26; y <= h; y++) blocks[(y << 8) + col] = 0;
        }
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * 5) yeraltı sıvıları ve süs
 * ---------------------------------------------------------------------------------------------- */
function fillLiquids(g, blocks, x0, z0, ht) {
  const K = g.c;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const lim = ht[col] - 3;
      const top = lim < UG_WATER_Y ? lim : UG_WATER_Y;
      let lake = 0; // 0 = hesaplanmadı, 1 = göl yok, 2 = göl var
      for (let y = 0; y <= top; y++) {
        const i = (y << 8) + col;
        if (blocks[i] !== 0) continue;
        if (y <= LAVA_Y) {
          blocks[i] = B.LAVA;
        } else {
          if (lake === 0) {
            const m = K.fbm2((x0 + lx) * 0.011 + 3100, (z0 + lz) * 0.011 - 700, 2) * 1.5;
            lake = m > 0.2 ? 2 : 1;
          }
          if (lake === 2) blocks[i] = B.WATER;
        }
      }
    }
  }
}

function decorateCaves(g, blocks, x0, z0, ht) {
  const seed = g.seed ^ 0x6c07;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const col = (lz << 4) + lx;
      const lim = ht[col] - 4;
      const top = lim < 52 ? lim : 52;
      for (let y = 1; y <= top; y++) {
        const i = (y << 8) + col;
        if (blocks[i] !== 0) continue;
        const below = blocks[i - 256];
        if (below !== 0 && OPAQUE_LUT[below] === 1 && below !== B.MOSS) {
          const r = hash3(x0 + lx, y, z0 + lz, seed) / 4294967296;
          if (r < 0.008) blocks[i] = B.MUSHROOM;
          else if (r < 0.03 && below === B.STONE) blocks[i - 256] = B.MOSS;
        } else {
          const above = blocks[i + 256];
          if (above !== 0 && OPAQUE_LUT[above] === 1) {
            const r = hash3(x0 + lx, y, z0 + lz, seed ^ 0x1234) / 4294967296;
            if (r < 0.012) {
              const len = 1 + (hash3(x0 + lx, y, z0 + lz, seed ^ 0x4321) & 3);
              for (let k = 0; k < len && y - k > 3; k++) {
                const ci = i - k * 256;
                if (blocks[ci] !== 0) break;
                blocks[ci] = B.VINE;
              }
            }
          }
        }
      }
    }
  }
}

/** Tüm mağara geçişi. ht: sütun yüzey yükseklikleri (Int16Array 256, indeks z*16+x). */
export function carveCaves(g, blocks, cx, cz, ht) {
  const x0 = cx * 16;
  const z0 = cz * 16;
  carveNoiseCaves(g, blocks, x0, z0, ht);
  carveWorms(g, blocks, x0, z0, ht);
  carveHalls(g, blocks, x0, z0, ht);
  carveSinkholes(g, blocks, x0, z0, ht);
  carveRavines(g, blocks, x0, z0, ht); // yüzeyden inen dar yarıklar (+ şelale): mağara girişleri
  fillLiquids(g, blocks, x0, z0, ht);
  decorateCaves(g, blocks, x0, z0, ht);
  applyCaveStyles(g, blocks, 0, 1, MAX_CARVE_Y, x0, z0, ht); // bölgesel mağara stilleri (çiçekli, geod, sarkıt, buzul, lav tüpü, harabe)
}
