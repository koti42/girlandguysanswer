/*
 * KEŞİF sim/city — TEPE TERASI (Tepe Konutları, y64→112). Saf; blok dikdörtgeninden belirlenimci türetilir.
 *
 * Sokaklar her yerde y=64'te düzdür (sözleşme §7); Tepe'nin yükselen kısmı tek bir "tepe bloğu"dur (BK.HILL): 4 iç içe teras, her biri 12 blok
 * yüksek, 6 blok içeri çekilmiş (inset 6k, tepe yüzeyi y=64+12k). Teraslar arası 12 basamaklı (basamak 138/94) dış merdivenler duvar boyunca,
 * sarmal sırayla (G→D→K→B). Zirve terasında Tepe Terası terminali (15) ve çatı bahçesi.
 *
 *  buildHill(rect, bi, bj) → {bi,bj,rect,levels:[{k,inset,y,x0,z0,x1,z1}],stairs:[{k,side,x0,z0,x1,z1,dir,y0,y1,steps}],top:{x,y,z,x0,z0,x1,z1},rise,maxY}
 *  hillSurfaceY(hill, x, z) → ayak seviyesi (64..112; basamaklar dahil) | NaN (blok dışı)
 */
export const HILL_RISE = 12;
export const HILL_LEVELS = 4;
export const HILL_STEP = 6;

/** Basamak yönü: 0 +x, 1 −z, 2 −x, 3 +z. */
const SIDES = ['s', 'e', 'n', 'w'];

export function buildHill(rect, bi, bj) {
  const levels = [];
  for (let k = 1; k <= HILL_LEVELS; k++) {
    const ins = HILL_STEP * k;
    levels.push({
      k, inset: ins, y: 64 + HILL_RISE * k, x0: rect.x0 + ins, z0: rect.z0 + ins, x1: rect.x1 - ins, z1: rect.z1 - ins,
    });
  }
  const stairs = [];
  for (let k = 0; k < HILL_LEVELS; k++) {
    const side = SIDES[k];
    const yLo = 64 + HILL_RISE * k;
    const a = HILL_STEP * k; // halka dış inset
    // duvara bitişik 2 genişlikli şerit: inset ∈ [a+4, a+6)
    let x0;
    let z0;
    let x1;
    let z1;
    let dir;
    if (side === 's') {
      z0 = rect.z1 - a - 6;
      z1 = rect.z1 - a - 4;
      x0 = rect.x0 + a + 6;
      x1 = x0 + HILL_RISE;
      dir = 0;
    } else if (side === 'e') {
      x0 = rect.x1 - a - 6;
      x1 = rect.x1 - a - 4;
      z1 = rect.z1 - a - 6;
      z0 = z1 - HILL_RISE;
      dir = 1;
    } else if (side === 'n') {
      z0 = rect.z0 + a + 4;
      z1 = rect.z0 + a + 6;
      x1 = rect.x1 - a - 6;
      x0 = x1 - HILL_RISE;
      dir = 2;
    } else {
      x0 = rect.x0 + a + 4;
      x1 = rect.x0 + a + 6;
      z0 = rect.z0 + a + 6;
      z1 = z0 + HILL_RISE;
      dir = 3;
    }
    stairs.push({ k, side, x0, z0, x1, z1, dir, y0: yLo, y1: yLo + HILL_RISE, steps: HILL_RISE });
  }
  const top = levels[HILL_LEVELS - 1];
  return {
    bi, bj, rect, levels, stairs, rise: HILL_RISE, maxY: top.y,
    top: { x: (top.x0 + top.x1) / 2, y: top.y, z: (top.z0 + top.z1) / 2, x0: top.x0, z0: top.z0, x1: top.x1, z1: top.z1 },
  };
}

/** (x,z) hücresinin ayak seviyesi; tepe bloğu dışı NaN. Basamak hücreleri y0+adım+1. */
export function hillSurfaceY(hill, x, z) {
  const r = hill.rect;
  if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) return NaN;
  for (let s = 0; s < hill.stairs.length; s++) {
    const st = hill.stairs[s];
    if (x >= st.x0 && x < st.x1 && z >= st.z0 && z < st.z1) {
      const i = st.dir === 0 ? x - st.x0 : st.dir === 1 ? st.z1 - 1 - z : st.dir === 2 ? st.x1 - 1 - x : z - st.z0;
      return st.y0 + i + 1;
    }
  }
  let y = 64;
  for (let k = hill.levels.length - 1; k >= 0; k--) {
    const l = hill.levels[k];
    if (x >= l.x0 && x < l.x1 && z >= l.z0 && z < l.z1) {
      y = l.y;
      break;
    }
  }
  return y;
}
