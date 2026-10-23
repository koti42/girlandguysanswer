/*
 * KEŞİF sim/city — KANAL, KÖPRÜ ve MERKEZ MEYDANI TÜNELİ (kabuk). Saf, belirlenimci, chunk dilimi yazar. Sözleşme §7 yazma sırası 3.
 *
 * KANAL: eksen z = 560 + 30·sin(x/130) (cityRoads.CANAL), genişlik 40; yatak y42–43, su y44..58, kıyı kaplaması (2 hücre) y42..60 taş tuğla,
 *   rıhtım (6 hücre) yüzeyi cilalı taş; kıyıda 3 genişlikli çıkış basamakları her 80 blokta iki kez (x ≡ 20..22 ve 60..62) — suya düşen KİLİTLENMEZ
 *   (5 basamak: ayak 59→64), rıhtım kenarında çit (basamak ağzı hariç).
 * KÖPRÜ: dikey yolların kanal açıklığı (cityRoads.bridgeSpan) tabliyesi y62 (kiriş) + y63 (yol yüzeyi); altı su; her 12 blokta kolon; tabliyenin dışında
 *   1 hücre korkuluk duvarı (taş tuğla + çit).
 * TÜNEL: x=0 / z=0 arterleri r≤90 → yol ayağı y64→56 (48 blokta; r≤42 düz). r≤60 kapalı (tavan y62, üstü meydan güvertesi y63),
 *   60<r≤90 açık hendek (kenarlarda çit). Yan duvarlar koyu panel + seyrek neon şerit; tavan ışığı 8 blokta bir.
 *
 *  canalNear(x0,z0) · canalColumn(w,R,x,z,s,gnd) → bool (sütunu tamamen yazdıysa true) · tunnelNear(x0,z0) · tunnelColumn(w,R,x,z,s,t) · tunnelWalls(w)
 *  plazaInlayHue(plan, terminal) → [hueA, hueB]
 */
import { DISTRICTS } from './archetypes.js';
import {
  CANAL, GRID, PLAZA, SURF, asphaltHalf, bridgeAt, bridgeSpan, canalCenterZ, halfWidth, roadYAt, tunnelRoadY, tunnelZone,
} from './cityRoads.js';
import { ID, Y } from './cityEmit.js';
import { plazaBlockId, surfaceBlockId } from './citySurface.js';

const STAIR_PERIOD = 80;
const LINING = ID.STONE_BRICK;

/** Kanal şeridi (rıhtım dahil) bu chunk'a değebilir mi: eksen z ∈ [530,590]; |dz| < 20 + 8. */
export function canalNear(x0, z0) {
  return z0 + 16 > 498 && z0 < 622;
}

function stairColumn(x) {
  const m = ((x % STAIR_PERIOD) + STAIR_PERIOD) % STAIR_PERIOD;
  return (m >= 20 && m < 23) || (m >= 60 && m < 63);
}

function isRoadSurf(s) {
  return s >= SURF.ASPHALT && s <= SURF.SIDEWALK;
}

/** Köprü yolu kenar hücresi mi: koridor dış sütunu (kolon yeri). */
function bridgeEdge(x) {
  const i = Math.round((x + 0.5) / GRID);
  const d = x - i * GRID;
  const hw = halfWidth(i);
  return d === -hw || d === hw - 1;
}

/**
 * Köprü korkuluk duvarı: tabliyenin hemen DIŞINDAKİ su hücresi (x = c−hw−1 ya da c+hw), açıklık boyunca: kiriş + taş tuğla duvar (y62–63) + çit (y64).
 * Korkuluk koridorun dışında durur → sokak donanımı (bank, saksı, çöp kutusu) kaldırımın dış hücresine serbestçe konabilir.
 */
function bridgeRail(x, z) {
  const i = Math.round((x + 0.5) / GRID);
  const d = x - i * GRID;
  const hw = halfWidth(i);
  if (d !== -hw - 1 && d !== hw) return false;
  const b = bridgeSpan(i);
  return b !== null && z >= b.z0 && z < b.z1;
}

/**
 * Kanal şeridi sütunu. u = su kenarından uzaklık (<0 su, 0..2 kaplama, 2..6 rıhtım).
 * @returns {boolean} true: sütun (y63 dahil) tamamen yazıldı; false: genel yüzey yazıcısı devam etsin.
 */
export function canalColumn(w, R, x, z, s, gnd) {
  const zc = canalCenterZ(x + 0.5);
  const u = Math.abs(z + 0.5 - zc) - CANAL.half;
  if (u >= 4) return false;
  const road = isRoadSurf(s);
  const stair = !road && stairColumn(x) && u >= -1;
  if (u < 0) {
    // su hücresi: yatak + su; yol koridorunda köprü tabliyesi
    w.set(x, 42, z, LINING);
    w.set(x, Y.BED, z, ID.GRAVEL);
    w.col(x, z, Y.BED + 1, Y.SURFACE + 1, ID.AIR);
    w.col(x, z, Y.BED + 1, Y.WATER_TOP + 1, ID.WATER);
    if (stair) {
      w.col(x, z, Y.BED + 1, Y.WATER_TOP + 1, LINING); // k=0 basamağı: yataktan 58'e dolu
      return true;
    }
    if (!road && bridgeRail(x, z)) {
      w.col(x, z, Y.WATER_TOP + 1, 62, ID.AIR);
      w.set(x, 62, z, ID.FACADE_DARK);
      w.set(x, Y.SURFACE, z, ID.STONE_BRICK);
      w.set(x, Y.FOOT, z, ID.FENCE);
      return true;
    }
    if (road) {
      w.set(x, 62, z, ID.FACADE_DARK);
      w.set(x, Y.SURFACE, z, surfaceBlockId(s, x, z, gnd));
      if (bridgeAt(R, x, z)) bridgeFurniture(w, R, x, z);
    }
    return true;
  }
  // kıyı kaplaması (u<2): taş tuğla duvar; üstü rıhtım ya da yol
  if (u < 2) w.col(x, z, 42, 61, LINING);
  if (stair) {
    const k = Math.floor(u) + 1; // 1..4  (u∈[0,1)→1 … [3,4)→4)
    const top = 58 + k;
    w.set(x, top, z, LINING);
    w.col(x, z, top + 1, Y.SURFACE + 1, ID.AIR);
    return true;
  }
  if (road) {
    w.set(x, Y.SURFACE, z, surfaceBlockId(s, x, z, gnd));
    if (u < 2 && bridgeAt(R, x, z)) bridgeFurniture(w, R, x, z);
    return true;
  }
  if (u < 2) {
    w.set(x, Y.SURFACE, z, surfaceBlockId(s, x, z, gnd));
    if (u < 1 && s === SURF.QUAY) w.set(x, Y.FOOT, z, ID.FENCE);
    return true;
  }
  return false;
}

/** Köprü tabliyesi kenar hücresine (su altında) her 12 blokta kolon ekler. */
function bridgeFurniture(w, R, x, z) {
  if (!bridgeEdge(x)) return;
  const i = Math.round((x + 0.5) / GRID);
  const b = bridgeSpan(i);
  if (b && (z - b.z0) % 12 === 6) {
    // kolon: yataktan kirişe (yalnız su altında anlamlı; kıyı hücrelerinde taş içinde kalır)
    w.col(x, z, Y.BED + 1, 62, ID.PILLAR);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Merkez Meydanı tüneli
 * ---------------------------------------------------------------------------------------------- */
const TUN_LIM = PLAZA.r + 12;
export function tunnelNear(x0, z0) {
  return x0 + 16 > -TUN_LIM && x0 < TUN_LIM && z0 + 16 > -TUN_LIM && z0 < TUN_LIM;
}

function imod8(v) {
  return ((v % 8) + 8) % 8;
}

/** Kapalı tünel zemin bloğu (surfaceAt tünel üstünde meydan döndürdüğü için yol yüzeyi burada yeniden kurulur). */
function tunnelFloorId(x, z) {
  const xc = x + 0.5;
  const zc = z + 0.5;
  const alongZ = xc >= -10 && xc < 10;
  const alongX = zc >= -10 && zc < 10;
  const ah = asphaltHalf(0);
  if (alongZ && alongX) return Math.abs(xc) <= ah || Math.abs(zc) <= ah ? ID.ASPHALT : ID.SIDEWALK;
  if (alongZ) {
    if (Math.abs(xc) > ah) return ID.SIDEWALK;
    if (x === -1 || x === 0) return ID.LANE_Z;
    if ((x === 3 || x === -4) && imod8(z) < 4) return ID.LANE_Z;
    return ID.ASPHALT;
  }
  if (Math.abs(zc) > ah) return ID.SIDEWALK;
  if (z === -1 || z === 0) return ID.LANE_X;
  if ((z === 3 || z === -4) && imod8(x) < 4) return ID.LANE_X;
  return ID.ASPHALT;
}

/**
 * Tünel/hendek koridoru sütunu (t: 1 açık hendek · 2 kapalı rampa · 3 düz tünel). Yol ayağı = yuvarlanmış tünel yol yüksekliği.
 * Kapalı bölgede y62 tavan (koyu panel; 8 blokta bir ışık bloğu), y63 meydan güvertesi.
 */
export function tunnelColumn(w, R, x, z, s, t) {
  const foot = Math.round(roadYAt(R, x, z));
  const floor = t === 1 ? surfaceBlockId(s, x, z, ID.SIDEWALK) : tunnelFloorId(x, z);
  w.set(x, foot - 1, z, floor);
  w.col(x, z, foot, Y.SURFACE + 1, ID.AIR);
  if (t >= 2) {
    const xc = x + 0.5;
    const alongZ = xc >= -10 && xc < 10;
    const lane = alongZ ? x : z;
    const pos = alongZ ? z : x;
    const lit = imod8(pos) === 3 && (lane === -5 || lane === 4);
    w.set(x, 62, z, lit ? ID.LIGHT : ID.FACADE_DARK);
    w.set(x, Y.SURFACE, z, plazaBlockId(x, z));
  }
}

/** Yan duvarlar (koridor dışındaki ilk hücre): koyu panel kaplama, seyrek neon şerit, hendek kenarında çit. */
export function tunnelWalls(w) {
  const put = (x, z, rr, pinkAxis) => {
    if (x < w.x0 || x >= w.x1 || z < w.z0 || z >= w.z1) return;
    if (rr > PLAZA.r || rr < 0) return;
    const foot = Math.round(tunnelRoadY(rr));
    const zone = tunnelZone(rr);
    if (zone === 0) return;
    w.box(x, foot, z, x + 1, 63, z + 1, ID.FACADE_DARK);
    const strip = ((((pinkAxis ? x : z) % 6) + 6) % 6) < 3;
    if (strip) w.set(x, foot + 2, z, pinkAxis ? ID.NEON_PINK : ID.NEON_CYAN);
    if (zone === 1) w.set(x, Y.FOOT, z, ID.FENCE);
  };
  for (let z = w.z0; z < w.z1; z++) {
    const rz = Math.abs(z + 0.5);
    if (rz <= 10) continue;
    put(-11, z, rz, false);
    put(10, z, rz, false);
  }
  for (let x = w.x0; x < w.x1; x++) {
    const rx = Math.abs(x + 0.5);
    if (rx <= 10) continue;
    put(x, -11, rx, true);
    put(x, 10, rx, true);
  }
}

/** Plaza neon halkası tonları: [birincil, ikincil] (Kapı Meydanı camgöbeği+pembe; bölge meydanı bölgenin tonu). */
export function plazaInlayHue(plan, T) {
  if (T.kind === 'plaza') return [0, 1];
  const d = DISTRICTS[T.district];
  return d ? [d.hues[0], d.hues[1] === undefined ? d.hues[0] : d.hues[1]] : [0, 1];
}
