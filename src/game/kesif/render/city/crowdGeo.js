/*
 * KEŞİF render/city — VATANDAŞ MODELİ (Neon Meridyen Faz 4, crowd_ai). SAF (three/DOM yok), belirlenimci, düğümde test edilir.
 * Üslup: yontulmuş düşük-poli gelecek-şehir vatandaşı (kutu yığını değil): konik gövde, omuz-bel-kalça silueti, bere/kep/neon vizör/geniş şapka, 7 saç biçimi, 4 üst giysi,
 * 3 alt giysi, 6 aksesuar. Tek geometri tüm varyantları taşır; seçim örnek özniteliğiyle gölgelendiricide (seçilmeyen köşe gizlenir) → tek çizim çağrısı.
 *
 *   SLOT, PART, GROUP, variantCode(group, value)
 *   buildCitizen(lod) → {position, normal, aMat, aPivot, index, tris, verts, bounds}      lod 0 yakın (≤ ~1000 üçgen, tüm varyantlar dahil) · 1 orta (≤ ~360)
 *   lodValue(lod, group, value) → bu LOD'un geometrisinde kullanılan varyant değeri (orta LOD'da benzer biçimler birleşir; -1 = gösterme)
 *   buildUmbrella() → aynı biçim (kubbe + sap)
 *   MODEL = {height: 1.78, hipY, kneeY, legUp, armUp, shoulderY, neckY}                  gölgelendirici sabitleri
 *   Not: render bütçesi üçgenleri tris × örnek olarak sayar (seçilmeyen varyantlar da çizim istatistiğine girer); görünen üçgen çok daha azdır.
 */
import { CG } from './crowdGeoKit.js';

export const SLOT = Object.freeze({
  SKIN: 0, TOP: 1, BOTTOM: 2, SHOE: 3, HAIR: 4, HAT: 5, GLOW: 6, ACC: 7, LENS: 8, DARK: 9, TRIM: 10, FOREARM: 11, CANOPY: 12, HANDLE: 13, PARCEL: 14, SHIN: 15,
});
export const PART = Object.freeze({
  ROOT: 0, LEG_L: 1, LEG_R: 2, ARM_L: 3, ARM_R: 4, HEAD: 5,
});
export const GROUP = Object.freeze({
  HAIR: 1, HAT: 2, ACC: 3, TOP: 4, LOW: 5,
});
export function variantCode(group, value) {
  return group * 16 + value;
}

export const MODEL = Object.freeze({
  height: 1.78, hipY: 0.92, kneeY: 0.5, legUp: 0.42, shoulderY: 1.44, armUp: 0.27, neckY: 1.52, headY: 1.665, legX: 0.095, armX: 0.215,
});

/** Orta LOD'da birleşen varyantlar: saç [0 kısa,1 küt,2 uzun,3 topuz,4 bulut,5 at kuyruğu,6 dazlak,7 sivri]. */
const LOD1_HAIR = Object.freeze([0, 1, 1, 0, 4, 0, 6, 0]);
const LOD1_ACC = Object.freeze([0, 1, 2, 0, 4, 0, 0]);

export function lodValue(lod, group, value) {
  if (lod === 0) return value;
  if (group === GROUP.HAIR) return LOD1_HAIR[value & 7];
  if (group === GROUP.ACC) return LOD1_ACC[value] === undefined ? 0 : LOD1_ACC[value];
  return value;
}

const V = variantCode;

function ring(y, rx, rz, cx, cz) {
  return {
    y, cx: cx || 0, cz: cz || 0, rx, rz,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Alt parçalar
 * ---------------------------------------------------------------------------------------------- */
function legs(g, N, lod) {
  for (let side = -1; side <= 1; side += 2) {
    const part = side < 0 ? PART.LEG_L : PART.LEG_R;
    const x = side * MODEL.legX;
    const piv = [x, MODEL.hipY, 0];
    g.set({
      slot: SLOT.BOTTOM, part, variant: 0, flags: 0, pivot: piv,
    });
    g.loft([ring(0.5, 0.063, 0.065, x, 0.005), ring(0.95, 0.092, 0.09, x, 0)], N, { cap: 'top' });
    g.set({ slot: SLOT.SHIN, flags: 1 });
    g.loft([ring(0.1, 0.045, 0.049, x, 0.01), ring(0.5, 0.063, 0.065, x, 0.005)], N, { cap: 'none' });
    g.set({ slot: SLOT.SHOE, flags: 3 });
    g.box(x, 0.056, -0.045, 0.092, 0.092, 0.27, { taper: 0.2 });
    g.set({ slot: SLOT.GLOW, flags: 3 });
    g.box(x, 0.012, -0.045, 0.098, 0.02, 0.274);
    void lod;
  }
}

function pelvisTorso(g, N, lod) {
  g.set({
    slot: SLOT.BOTTOM, part: PART.ROOT, variant: 0, flags: 0, pivot: [0, 0.95, 0],
  });
  g.loft([ring(0.84, 0.158, 0.1), ring(0.95, 0.17, 0.108), ring(1.03, 0.15, 0.095)], N + 2, { cap: 'bottom' });
  g.set({ slot: SLOT.TOP });
  if (lod === 0) {
    g.loft([ring(1.0, 0.142, 0.092), ring(1.16, 0.154, 0.1), ring(1.32, 0.19, 0.116), ring(1.43, 0.2, 0.104), ring(1.5, 0.11, 0.078), ring(1.54, 0.045, 0.045)], N + 2, { cap: 'top' });
  } else {
    g.loft([ring(1.0, 0.142, 0.092), ring(1.32, 0.19, 0.116), ring(1.45, 0.195, 0.1), ring(1.54, 0.045, 0.045)], N + 1, { cap: 'top' });
  }
}

function head(g, N, lod) {
  const piv = [0, MODEL.neckY, 0];
  g.set({
    slot: SLOT.SKIN, part: PART.HEAD, variant: 0, flags: 0, pivot: piv,
  });
  g.cyl(0, 0.005, 1.49, 1.58, 0.046, 0.042, 5, { cap: 'none' });
  g.ellipsoid(0, MODEL.headY, 0, 0.094, 0.116, 0.104, N + 1, lod === 0 ? 4 : 3);
  if (lod === 0) {
    g.set({ slot: SLOT.DARK });
    g.box(-0.036, 1.678, -0.1, 0.02, 0.024, 0.012);
    g.box(0.036, 1.678, -0.1, 0.02, 0.024, 0.012);
    g.set({ slot: SLOT.SKIN });
    g.box(0, 1.646, -0.108, 0.022, 0.03, 0.02, { taper: 0.3 });
  }
}

function arms(g, N, lod) {
  for (let side = -1; side <= 1; side += 2) {
    const part = side < 0 ? PART.ARM_L : PART.ARM_R;
    const x = side * MODEL.armX;
    const piv = [x, MODEL.shoulderY, 0];
    g.set({
      slot: SLOT.TOP, part, variant: 0, flags: 0, pivot: piv,
    });
    g.loft([ring(1.17, 0.044, 0.046, x, 0), ring(1.43, 0.06, 0.062, x, 0), ring(1.485, 0.045, 0.05, x - side * 0.01, 0)], N, { cap: 'top' });
    g.set({ slot: SLOT.FOREARM, flags: 1 });
    g.loft([ring(0.9, 0.034, 0.036, x, 0), ring(1.17, 0.044, 0.046, x, 0)], N, { cap: 'bottom' });
    g.set({ slot: SLOT.SKIN, flags: 3 });
    g.box(x, 0.86, 0, 0.05, 0.09, 0.05, { taper: 0.2 });
    if (lod === 0) {
      g.set({ slot: SLOT.GLOW, flags: 1 });
      g.box(x, 0.935, 0, 0.074, 0.014, 0.074);
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Üst giysi varyantları (grup 4) ve alt (grup 5)
 * ---------------------------------------------------------------------------------------------- */
function topStyles(g, N, lod) {
  const root = { part: PART.ROOT, flags: 0, pivot: [0, 0.95, 0] };
  // 0 tişört: neon yaka çizgisi
  g.set(Object.assign({ slot: SLOT.GLOW, variant: V(GROUP.TOP, 0) }, root));
  if (lod === 0) g.loft([ring(1.505, 0.072, 0.061), ring(1.519, 0.069, 0.059)], N + 1, { cap: 'none' });
  // 1 ceket: yaka + kalça uzantısı + neon dikiş
  g.set(Object.assign({ slot: SLOT.TOP, variant: V(GROUP.TOP, 1) }, root));
  g.loft([ring(1.02, 0.152, 0.098), ring(0.9, 0.172, 0.114)], N + 1, { cap: 'none' });
  if (lod === 0) {
    g.set({ slot: SLOT.TRIM });
    g.loft([ring(1.49, 0.088, 0.072), ring(1.545, 0.07, 0.06)], N + 1, { cap: 'none' });
    g.set({ slot: SLOT.GLOW });
    g.box(-0.075, 1.2, -0.112, 0.012, 0.24, 0.01);
    g.box(0.075, 1.2, -0.112, 0.012, 0.24, 0.01);
  }
  // 2 kapüşonlu: kapüşon + cep
  g.set(Object.assign({ slot: SLOT.TRIM, variant: V(GROUP.TOP, 2) }, root));
  g.ellipsoid(0, 1.58, 0.05, 0.115, 0.075, 0.1, N + 1, 2, { k0: 0, k1: Math.PI * 0.62 });
  g.loft([ring(1.0, 0.146, 0.095), ring(0.92, 0.158, 0.105)], N + 1, { cap: 'none' });
  if (lod === 0) g.box(0, 1.08, -0.104, 0.19, 0.085, 0.014, { taper: 0.08 });
  // 3 uzun palto: etek + yaka + neon kenar
  g.set(Object.assign({ slot: SLOT.TOP, variant: V(GROUP.TOP, 3) }, root));
  g.loft([ring(1.03, 0.15, 0.098), ring(0.78, 0.18, 0.122), ring(0.52, 0.205, 0.138)], N + 1, { cap: 'none' });
  if (lod === 0) {
    g.set({ slot: SLOT.TRIM });
    g.loft([ring(1.49, 0.092, 0.075), ring(1.56, 0.075, 0.062)], N + 1, { cap: 'none' });
    g.set({ slot: SLOT.GLOW });
    g.loft([ring(0.53, 0.206, 0.139), ring(0.505, 0.207, 0.14)], N + 1, { cap: 'none' });
  }
}

function lowStyles(g, N, lod) {
  g.set({
    slot: SLOT.BOTTOM, part: PART.ROOT, variant: V(GROUP.LOW, 2), flags: 0, pivot: [0, 0.95, 0],
  });
  g.loft([ring(1.0, 0.152, 0.1), ring(0.82, 0.19, 0.125), ring(0.62, 0.218, 0.146)], N + 1, { cap: 'none' });
  if (lod !== 0) return;
  g.set({ slot: SLOT.GLOW });
  g.loft([ring(0.625, 0.219, 0.147), ring(0.61, 0.22, 0.148)], N + 1, { cap: 'none' });
}

/* ------------------------------------------------------------------------------------------------
 * Saç (grup 1), şapka (grup 2), aksesuar (grup 3)
 * ---------------------------------------------------------------------------------------------- */
function hair(g, N, lod) {
  const base = {
    slot: SLOT.HAIR, part: PART.HEAD, flags: 0, pivot: [0, MODEL.neckY, 0],
  };
  const cy = MODEL.headY;
  const cap = (code, k1, scale, a0, a1) => {
    g.set(Object.assign({ variant: code }, base));
    g.ellipsoid(0, cy + 0.012, 0.012, 0.1 * scale, 0.112 * scale, 0.11 * scale, N, 2, {
      k0: 0, k1: Math.PI * k1, a0: Math.PI * (1.5 + a0), a1: Math.PI * (1.5 + a1),
    });
  };
  const want = (v) => lod === 0 || v === 0 || v === 1 || v === 4;
  // 0 kısa kesim
  cap(V(GROUP.HAIR, 0), 0.5, 1, 0.18, 1.82);
  // 1 küt (omuz üstü) / orta LOD'da uzun saçla birleşir
  if (lod === 1) {
    cap(V(GROUP.HAIR, 1), 0.52, 1.03, 0.1, 1.9);
    g.loft([ring(cy + 0.0, 0.106, 0.113, 0, 0.012), ring(cy - 0.3, 0.115, 0.125, 0, 0.05)], N, { cap: 'none', a0: Math.PI * 1.6, a1: Math.PI * 3.4 });
  } else {
    cap(V(GROUP.HAIR, 1), 0.52, 1.03, 0.12, 1.88);
    g.loft([ring(cy + 0.0, 0.106, 0.113, 0, 0.012), ring(cy - 0.12, 0.112, 0.118, 0, 0.02)], N, { cap: 'none', a0: Math.PI * 1.62, a1: Math.PI * 3.38 });
    // 2 uzun
    cap(V(GROUP.HAIR, 2), 0.52, 1.03, 0.1, 1.9);
    g.loft([ring(cy + 0.0, 0.106, 0.113, 0, 0.012), ring(cy - 0.22, 0.115, 0.125, 0, 0.04), ring(cy - 0.42, 0.1, 0.1, 0, 0.07)], N, { cap: 'none', a0: Math.PI * 1.6, a1: Math.PI * 3.4 });
    // 3 topuz
    cap(V(GROUP.HAIR, 3), 0.5, 1, 0.18, 1.82);
    g.ellipsoid(0, cy + 0.125, 0.02, 0.05, 0.045, 0.05, 5, 2);
  }
  // 4 kıvırcık / bulut
  g.set(Object.assign({ variant: V(GROUP.HAIR, 4) }, base));
  g.ellipsoid(0, cy + 0.035, 0.018, 0.14, 0.13, 0.14, N, 2, {
    k0: 0, k1: Math.PI * 0.62, a0: Math.PI * 1.65, a1: Math.PI * 3.35,
  });
  // 5 at kuyruğu
  if (lod === 0) {
    cap(V(GROUP.HAIR, 5), 0.5, 1, 0.18, 1.82);
    g.loft([ring(cy + 0.06, 0.03, 0.03, 0, 0.12), ring(cy - 0.06, 0.04, 0.04, 0, 0.17), ring(cy - 0.25, 0.022, 0.022, 0, 0.2)], 4, { cap: 'bottom' });
  }
  void want;
}

function hats(g, N, lod) {
  const base = {
    slot: SLOT.HAT, part: PART.HEAD, flags: 0, pivot: [0, MODEL.neckY, 0],
  };
  const cy = MODEL.headY;
  g.set(Object.assign({ variant: V(GROUP.HAT, 1) }, base));
  g.ellipsoid(0, cy + 0.03, 0.005, 0.104, 0.1, 0.113, N, 2, { k0: 0, k1: Math.PI * 0.5 });
  g.box(0, cy + 0.045, -0.145, 0.15, 0.014, 0.11);
  g.set(Object.assign({ variant: V(GROUP.HAT, 2) }, base));
  g.ellipsoid(0, cy + 0.045, 0.0, 0.108, 0.098, 0.116, N, 2, { k0: 0, k1: Math.PI * 0.52 });
  if (lod === 0) {
    g.set({ slot: SLOT.TRIM });
    g.loft([ring(cy + 0.035, 0.113, 0.121, 0, 0), ring(cy + 0.0, 0.112, 0.12, 0, 0)], N, { cap: 'none' });
  }
  g.set(Object.assign({ variant: V(GROUP.HAT, 3), slot: SLOT.LENS }, base));
  g.loft([ring(cy + 0.035, 0.1, 0.108, 0, 0), ring(cy + 0.005, 0.1, 0.108, 0, 0)], 6, { cap: 'none', a0: Math.PI * 1.1, a1: Math.PI * 1.9 });
  if (lod === 0) {
    g.set({ slot: SLOT.DARK });
    g.box(-0.1, cy + 0.02, 0.02, 0.012, 0.02, 0.16);
    g.box(0.1, cy + 0.02, 0.02, 0.012, 0.02, 0.16);
  }
  g.set(Object.assign({ variant: V(GROUP.HAT, 4) }, base));
  g.ellipsoid(0, cy + 0.04, 0.0, 0.1, 0.085, 0.108, N, 2, { k0: 0, k1: Math.PI * 0.5 });
  g.loft([ring(cy + 0.045, 0.2, 0.2), ring(cy + 0.03, 0.21, 0.21)], 7, { cap: 'top' });
}

function accessories(g, N, lod) {
  const root = { part: PART.ROOT, flags: 0, pivot: [0, 0.95, 0] };
  // 1 sırt çantası
  g.set(Object.assign({ slot: SLOT.ACC, variant: V(GROUP.ACC, 1) }, root));
  g.box(0, 1.24, 0.15, 0.27, 0.36, 0.15, { taper: 0.1 });
  if (lod === 0) {
    g.set({ slot: SLOT.GLOW });
    g.box(0, 1.24, 0.228, 0.05, 0.24, 0.01);
  }
  // 2 omuz çantası (sağ kalça) + çapraz kayış
  g.set(Object.assign({ slot: SLOT.ACC, variant: V(GROUP.ACC, 2) }, root));
  g.box(0.215, 0.99, 0.03, 0.09, 0.2, 0.22, { taper: 0.05 });
  if (lod === 0) {
    g.set({ slot: SLOT.GLOW });
    g.box(0.262, 1.0, 0.03, 0.01, 0.1, 0.1);
  }
  // 4 paket (kurye): önde kutu
  g.set(Object.assign({ slot: SLOT.PARCEL, variant: V(GROUP.ACC, 4) }, root));
  g.box(0, 1.1, -0.255, 0.32, 0.24, 0.22);
  if (lod !== 0) return;
  g.set({ slot: SLOT.GLOW });
  g.box(0, 1.1, -0.367, 0.06, 0.24, 0.006);
  g.box(0, 1.222, -0.255, 0.32, 0.006, 0.06);
  // 3 kulaklık
  g.set({
    slot: SLOT.DARK, part: PART.HEAD, variant: V(GROUP.ACC, 3), flags: 0, pivot: [0, MODEL.neckY, 0],
  });
  g.box(-0.1, MODEL.headY + 0.09, 0, 0.014, 0.1, 0.02);
  g.box(0.1, MODEL.headY + 0.09, 0, 0.014, 0.1, 0.02);
  g.box(0, MODEL.headY + 0.145, 0, 0.2, 0.014, 0.02);
  g.box(-0.103, MODEL.headY - 0.01, 0, 0.05, 0.08, 0.075);
  g.box(0.103, MODEL.headY - 0.01, 0, 0.05, 0.08, 0.075);
  g.set({ slot: SLOT.GLOW });
  g.box(-0.13, MODEL.headY - 0.01, 0, 0.008, 0.055, 0.05);
  g.box(0.13, MODEL.headY - 0.01, 0, 0.008, 0.055, 0.05);
  // 5 kamera (turist): göğüste
  g.set(Object.assign({ slot: SLOT.DARK, variant: V(GROUP.ACC, 5) }, root));
  g.box(0, 1.24, -0.135, 0.12, 0.075, 0.07);
  g.set({ slot: SLOT.LENS });
  g.box(0, 1.24, -0.18, 0.04, 0.04, 0.02);
  // 6 baston (yaşlı): sağ elde
  g.set(Object.assign({ slot: SLOT.ACC, variant: V(GROUP.ACC, 6) }, root));
  g.cyl(0.26, -0.07, 0.0, 0.9, 0.014, 0.014, 4, { cap: 'both' });
  g.set({ slot: SLOT.GLOW });
  g.box(0.26, 0.88, -0.07, 0.05, 0.024, 0.024);
  void N;
}

export function buildCitizen(lod) {
  const g = new CG();
  const N = lod === 0 ? 5 : 4;
  legs(g, N, lod);
  pelvisTorso(g, N, lod);
  arms(g, N, lod);
  head(g, N, lod);
  topStyles(g, N, lod);
  lowStyles(g, N, lod);
  hair(g, N, lod);
  hats(g, N, lod);
  accessories(g, N, lod);
  return g.finalize();
}

/** Şemsiye: kubbe (ışıklı kenar) + sap; orijin = sap altı el (yerel y=0 el, tepe y≈0.62). */
export function buildUmbrella() {
  const g = new CG();
  g.set({
    slot: SLOT.CANOPY, part: 0, variant: 0, flags: 0, pivot: [0, 0, 0],
  });
  g.loft([ring(0.62, 0.0, 0.0), ring(0.55, 0.3, 0.3), ring(0.47, 0.46, 0.46), ring(0.42, 0.52, 0.52)], 8, { cap: 'none' });
  g.set({ slot: SLOT.GLOW });
  g.loft([ring(0.425, 0.521, 0.521), ring(0.405, 0.525, 0.525)], 8, { cap: 'none' });
  g.set({ slot: SLOT.HANDLE });
  g.cyl(0, 0, -0.02, 0.62, 0.012, 0.012, 4, { cap: 'both' });
  return g.finalize();
}
