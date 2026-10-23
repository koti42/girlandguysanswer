/*
 * KEŞİF render/city — ARAÇ ŞEKİL TABLOLARI (SAF veri + küçük `extra` kancaları): taksi · hatch · sedan · spor · kamyonet.
 * lower: [z, altY, üstY, tabanYarıGenişlik, azamiYarıGenişlik, üstYarıGenişlik, tepeBombesi]   cabin: [z, kemerY, tavanY, kemerYG, camYG, tavanYG]
 * Birimler metre; −Z ileri; y = 0 tekerlek temas düzlemi.
 */
import { SLOT, F_INTERIOR, loft } from './vehicleGeoKit.js';
import { C, addSeat } from './vehicleGeoParts.js';

const AMBER = [1, 0.62, 0.08];

/** Taksi tavan lambası ("TAKSİ" yazılı kutu) + yan damalı şerit. */
function taxiExtra(g, ctx) {
  g.with({ slot: SLOT.SIGN, col: AMBER, emit: 0.9 }, () => {
    g.taper(-0.27, 0.33, 1.36, 1.5, 0.34, 0.3, 0.34, 0.3, { skip: ['front', 'back'] });
  });
  g.with({ slot: SLOT.SIGNTEXT, col: AMBER, emit: 1 }, () => {
    g.quad([-0.3, 1.365, -0.285], [-0.27, 1.5, -0.272], [0.27, 1.5, -0.272], [0.3, 1.365, -0.285], { uv: [[1, 1], [1, 0], [0, 0], [0, 1]], f: 'z-' });
    g.quad([0.3, 1.365, 0.345], [0.27, 1.5, 0.332], [-0.27, 1.5, 0.332], [-0.3, 1.365, 0.345], { uv: [[1, 1], [1, 0], [0, 0], [0, 1]], f: 'z+' });
  });
  if (!ctx.hi) return;
  // damalı şerit: kapı hizasında yan yüzde ACCENT / koyu dönüşümlü kareler
  const n = 12;
  const z0 = -1.2;
  const dz = 2.3 / n;
  g.sym(() => {
    for (let i = 0; i < n; i++) {
      const za = z0 + i * dz;
      const w = 0.953;
      const lo = i % 2 === 0;
      g.with({ slot: lo ? SLOT.ACCENT : SLOT.TRIM, col: lo ? [1, 1, 1] : C.trim }, () => {
        g.quad([w, 0.5, za], [w, 0.5, za + dz], [w, 0.585, za + dz], [w, 0.585, za], { f: 'x+' });
      });
      g.with({ slot: lo ? SLOT.TRIM : SLOT.ACCENT, col: lo ? C.trim : [1, 1, 1] }, () => {
        g.quad([w, 0.585, za], [w, 0.585, za + dz], [w, 0.67, za + dz], [w, 0.67, za], { f: 'x+' });
      });
    }
  });
}

/** Spor: kanatçık + motor kapağı panjurları. */
function sporExtra(g, ctx) {
  g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
    g.taper(1.86, 2.1, 0.98, 1.02, 0.78, 0.78, 0.8, 0.8);
    g.sym(() => g.box(0.7, 0.8, 1.92, 0.76, 0.98, 2.04));
  });
  if (!ctx.hi) return;
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    for (let i = 0; i < 4; i++) {
      const z = 0.55 + i * 0.16;
      const y = 0.9 - i * 0.025;
      g.quad([-0.34, y, z], [-0.34, y, z + 0.09], [0.34, y, z + 0.09], [0.34, y, z], { f: 'y+' });
    }
  });
}

/** Kamyonet: kargo kutusu (yuvarlak köşeli loft) + yan kapı çizgileri + kaplan şeridi (ACCENT). */
function vanExtra(g, ctx) {
  const z0 = -0.86;
  const z1 = 2.58;
  const yb = 0.62;
  const yt = 2.2;
  const w = 1.04;
  const r = 0.12;
  const ringOf = (zk) => [
    [w - 0.02, yb], [w, yb + 0.05], [w, yt - r], [w - r, yt], [0, yt + 0.01], [-(w - r), yt], [-w, yt - r], [-w, yb + 0.05], [-(w - 0.02), yb],
  ].map((p) => [p[0], p[1] + zk * 0]);
  loft(g, [
    { z: z0, ring: ringOf(0) }, { z: z0 + 0.06, ring: ringOf(0) }, { z: z1 - 0.06, ring: ringOf(0) }, { z: z1, ring: ringOf(0) },
  ], {
    crease: [true, false, false, true, false, true, false, false, true],
    aoFn: (x, y) => 0.62 + 0.38 * Math.min(1, Math.max(0, (y - 0.5) / 1.1)),
    slotAt: (i, j) => (j === 8 ? { skip: true } : null),
    capStart: { slot: SLOT.BODY },
    capEnd: { slot: SLOT.BODY },
  });
  // kaplan şeritleri: yan yüzde eğik koyu bantlar (ACCENT)
  const bands = ctx.hi ? 7 : 3;
  g.sym(() => {
    for (let i = 0; i < bands; i++) {
      const za = -0.6 + i * (3.0 / bands);
      g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
        g.quad([w + 0.004, 0.9, za], [w + 0.004, 0.9, za + 0.2], [w + 0.004, 1.9, za + 0.55], [w + 0.004, 1.9, za + 0.35], { f: 'x+' });
      });
    }
  });
  // arka kapı çizgisi + kargo kapısı kolu + şerit lamba
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.box(-0.55, 1.2, z1 + 0.0, 0.55, 1.26, z1 + 0.025);
    g.box(-0.012, 0.7, z1 + 0.0, 0.012, 1.2, z1 + 0.02);
    g.sym(() => g.box(w + 0.003, 0.7, 1.35, w + 0.006, 1.9, 1.37));
  });
  // kargo yan çizgisi: koli göstergesi (3 renkli kutu simgesi, kapı yanında)
  g.with({ slot: SLOT.NEON, col: [1, 1, 1], emit: 1 }, () => {
    g.sym(() => g.quad([w + 0.006, 0.7, -0.45], [w + 0.006, 0.7, 2.4], [w + 0.006, 0.76, 2.4], [w + 0.006, 0.76, -0.45], { f: 'x+' }));
  });
  void F_INTERIOR; void addSeat;
}

export const CAR_SPECS = {
  taksi: {
    L: 4.2, W: 1.9, H: 1.5, wb: 2.6, track: 1.6, wheelR: 0.34, wheelHW: 0.13, wheelBulge: 0.06,
    lower: [
      [-2.10, 0.34, 0.62, 0.52, 0.74, 0.62, 0.02], [-2.04, 0.26, 0.70, 0.66, 0.86, 0.72, 0.02], [-1.80, 0.22, 0.78, 0.80, 0.93, 0.80, 0.03],
      [-1.40, 0.20, 0.86, 0.84, 0.95, 0.84, 0.03], [-1.00, 0.19, 0.90, 0.85, 0.95, 0.86, 0.02], [-0.50, 0.19, 0.92, 0.85, 0.95, 0.86, 0.01],
      [0.40, 0.19, 0.93, 0.85, 0.95, 0.86, 0], [1.10, 0.19, 0.93, 0.85, 0.95, 0.86, 0], [1.55, 0.20, 0.92, 0.85, 0.95, 0.85, 0],
      [1.90, 0.22, 0.86, 0.82, 0.93, 0.80, 0.01], [2.05, 0.26, 0.78, 0.70, 0.88, 0.74, 0.01], [2.10, 0.34, 0.66, 0.54, 0.76, 0.64, 0],
    ],
    cabin: [
      [-1.50, 0.86, 0.97, 0.85, 0.83, 0.73], [-0.70, 0.91, 1.36, 0.85, 0.83, 0.68], [0.95, 0.93, 1.36, 0.85, 0.84, 0.68], [1.60, 0.92, 0.98, 0.85, 0.83, 0.72],
    ],
    topKinds: ['glass', 'body', 'glass'],
    headX: 0.62, headY: 0.6, headZ: 0.06, headW: 0.17, headH: 0.045, tailX: 0.66, tailY: 0.76, tailW: 0.2, tailH: 0.05,
    grilleW: 0.32, grilleY0: 0.36, grilleY1: 0.5, bumperW: 0.72, bumperY: 0.27, plateY: 0.42,
    neonZ0: -1.0, neonZ1: 1.0, neonY: 0.3, mirrorZ: -0.68, pillars: [0.12], seams: [-0.62, 0.12, 0.88], exhaust: [-0.5],
    seatY: 0.42, seats: [{ x: -0.36, z: -0.25 }, { x: 0.36, z: -0.25 }, { x: -0.3, z: 0.8 }, { x: 0.3, z: 0.8 }], driver: { x: -0.36, z: -0.25 },
    dash: [-1.38, -0.88, 0.55, 0.88, 0.8], wheelY: 0.82, extra: taxiExtra,
  },
  hatch: {
    L: 3.7, W: 1.75, H: 1.45, wb: 2.4, track: 1.5, wheelR: 0.32, wheelHW: 0.12, wheelBulge: 0.055,
    lower: [
      [-1.85, 0.34, 0.6, 0.5, 0.7, 0.58, 0.02], [-1.78, 0.26, 0.68, 0.62, 0.8, 0.68, 0.02], [-1.55, 0.22, 0.76, 0.74, 0.86, 0.75, 0.03],
      [-1.2, 0.2, 0.82, 0.77, 0.87, 0.78, 0.02], [-0.75, 0.19, 0.85, 0.78, 0.875, 0.79, 0.01], [0, 0.19, 0.88, 0.78, 0.875, 0.79, 0], [0.9, 0.19, 0.9, 0.78, 0.875, 0.79, 0],
      [1.5, 0.2, 0.9, 0.78, 0.87, 0.78, 0], [1.78, 0.24, 0.8, 0.72, 0.84, 0.72, 0], [1.85, 0.34, 0.66, 0.5, 0.7, 0.58, 0],
    ],
    cabin: [[-1.05, 0.83, 0.93, 0.78, 0.77, 0.68], [-0.35, 0.86, 1.4, 0.78, 0.77, 0.63], [1.05, 0.9, 1.4, 0.78, 0.77, 0.62], [1.74, 0.88, 0.98, 0.76, 0.75, 0.66]],
    topKinds: ['glass', 'body', 'glass'],
    headX: 0.56, headY: 0.58, headZ: 0.06, headW: 0.16, headH: 0.045, tailX: 0.6, tailY: 0.74, tailW: 0.17, tailH: 0.06,
    grilleW: 0.28, grilleY0: 0.35, grilleY1: 0.47, bumperW: 0.66, bumperY: 0.27, plateY: 0.42,
    neonZ0: -0.9, neonZ1: 0.9, neonY: 0.3, mirrorZ: -0.3, pillars: [0.3], seams: [-0.4, 0.3, 0.9], exhaust: [],
    seatY: 0.42, seats: [{ x: -0.34, z: -0.1 }, { x: 0.34, z: -0.1 }, { x: 0, z: 0.85 }], driver: { x: -0.34, z: -0.1 },
    dash: [-1.0, -0.6, 0.55, 0.86, 0.74], wheelY: 0.8,
  },
  sedan: {
    L: 4.5, W: 1.85, H: 1.4, wb: 2.75, track: 1.56, wheelR: 0.33, wheelHW: 0.125, wheelBulge: 0.06,
    lower: [
      [-2.25, 0.34, 0.6, 0.5, 0.72, 0.6, 0.02], [-2.18, 0.25, 0.68, 0.64, 0.84, 0.7, 0.02], [-1.95, 0.21, 0.76, 0.78, 0.9, 0.78, 0.03],
      [-1.5, 0.19, 0.84, 0.82, 0.925, 0.82, 0.03], [-1.05, 0.18, 0.88, 0.83, 0.925, 0.84, 0.02], [-0.4, 0.18, 0.9, 0.83, 0.925, 0.84, 0.01],
      [0.5, 0.18, 0.9, 0.83, 0.925, 0.84, 0], [1.2, 0.18, 0.9, 0.83, 0.925, 0.84, 0], [1.75, 0.19, 0.92, 0.83, 0.925, 0.83, 0],
      [2.1, 0.22, 0.88, 0.8, 0.91, 0.78, 0.01], [2.2, 0.28, 0.8, 0.7, 0.86, 0.72, 0.01], [2.25, 0.34, 0.68, 0.52, 0.74, 0.62, 0],
    ],
    cabin: [[-1.35, 0.85, 0.94, 0.83, 0.81, 0.72], [-0.55, 0.89, 1.32, 0.83, 0.81, 0.66], [0.85, 0.9, 1.32, 0.83, 0.81, 0.66], [1.5, 0.9, 0.96, 0.83, 0.81, 0.7]],
    topKinds: ['glass', 'body', 'glass'],
    headX: 0.6, headY: 0.6, headZ: 0.06, headW: 0.18, headH: 0.04, tailX: 0.65, tailY: 0.78, tailW: 0.22, tailH: 0.05,
    grilleW: 0.34, grilleY0: 0.36, grilleY1: 0.5, bumperW: 0.7, bumperY: 0.27, plateY: 0.42,
    neonZ0: -1.1, neonZ1: 1.1, neonY: 0.3, mirrorZ: -0.52, pillars: [0.1], seams: [-0.5, 0.1, 0.8], exhaust: [0.5],
    seatY: 0.42, seats: [{ x: -0.36, z: -0.2 }, { x: 0.36, z: -0.2 }, { x: -0.3, z: 0.75 }, { x: 0.3, z: 0.75 }], driver: { x: -0.36, z: -0.2 },
    dash: [-1.2, -0.75, 0.55, 0.86, 0.78], wheelY: 0.8,
  },
  spor: {
    L: 4.4, W: 1.9, H: 1.2, wb: 2.7, track: 1.62, wheelR: 0.33, wheelHW: 0.14, wheelBulge: 0.06,
    lower: [
      [-2.2, 0.3, 0.48, 0.55, 0.78, 0.62, 0.02], [-2.12, 0.2, 0.54, 0.7, 0.88, 0.72, 0.02], [-1.95, 0.17, 0.6, 0.82, 0.93, 0.82, 0.02],
      [-1.5, 0.15, 0.68, 0.86, 0.95, 0.88, 0.02], [-1.0, 0.15, 0.72, 0.88, 0.97, 0.9, 0.01], [-0.2, 0.15, 0.74, 0.88, 0.98, 0.9, 0],
      [0.7, 0.15, 0.78, 0.9, 0.99, 0.9, 0], [1.5, 0.16, 0.8, 0.9, 0.99, 0.86, 0], [1.95, 0.18, 0.78, 0.84, 0.96, 0.8, 0], [2.12, 0.24, 0.72, 0.74, 0.9, 0.74, 0],
      [2.2, 0.34, 0.62, 0.58, 0.82, 0.66, 0],
    ],
    cabin: [[-1.78, 0.67, 0.75, 0.86, 0.82, 0.72], [-0.78, 0.73, 1.19, 0.88, 0.82, 0.6], [0.2, 0.77, 1.19, 0.9, 0.84, 0.6], [1.3, 0.8, 0.86, 0.9, 0.85, 0.7]],
    topKinds: ['glass', 'body', 'body'],
    headX: 0.62, headY: 0.54, headZ: 0.05, headW: 0.2, headH: 0.03, headSweep: 0.1, tailX: 0.5, tailY: 0.68, tailW: 0.4, tailH: 0.04,
    grilleW: 0.42, grilleY0: 0.3, grilleY1: 0.4, bumperW: 0.78, bumperY: 0.22, plateY: 0.36,
    neonZ0: -1.2, neonZ1: 1.2, neonY: 0.27, mirrorZ: -1.0, pillars: [], seams: [-0.9, 0.0], exhaust: [-0.36, 0.36],
    seatY: 0.24, driverScale: 0.7, seats: [{ x: -0.38, z: -0.3 }, { x: 0.38, z: -0.3 }], driver: { x: -0.38, z: -0.3 },
    dash: [-1.5, -1.0, 0.52, 0.74, 0.8], wheelY: 0.74, extra: sporExtra,
  },
  kamyonet: {
    L: 5.2, W: 2.1, H: 2.2, wb: 3.2, track: 1.78, wheelR: 0.4, wheelHW: 0.16, wheelBulge: 0.1,
    lower: [
      [-2.6, 0.4, 0.78, 0.7, 0.96, 0.84, 0.02], [-2.52, 0.3, 0.9, 0.84, 1.03, 0.94, 0.02], [-2.2, 0.28, 0.95, 0.9, 1.04, 0.96, 0.01],
      [-1.5, 0.28, 0.98, 0.9, 1.04, 0.98, 0], [-0.8, 0.28, 0.98, 0.9, 1.04, 0.98, 0], [0.4, 0.3, 0.7, 0.9, 1.0, 0.94, 0], [1.4, 0.3, 0.64, 0.9, 1.0, 0.94, 0],
      [2.4, 0.3, 0.64, 0.9, 1.0, 0.94, 0], [2.58, 0.34, 0.62, 0.8, 0.96, 0.9, 0], [2.6, 0.4, 0.6, 0.7, 0.92, 0.86, 0],
    ],
    cabin: [[-2.42, 0.96, 1.08, 0.94, 0.92, 0.88], [-2.12, 0.98, 1.88, 0.94, 0.92, 0.82], [-1.1, 0.98, 1.9, 0.94, 0.92, 0.84], [-0.9, 0.98, 1.84, 0.94, 0.92, 0.84]],
    topKinds: ['glass', 'body', 'body'],
    headX: 0.7, headY: 0.64, headZ: 0.06, headW: 0.2, headH: 0.07, tailX: 0.9, tailY: 0.9, tailW: 0.1, tailH: 0.12,
    grilleW: 0.46, grilleY0: 0.46, grilleY1: 0.68, bumperW: 0.9, bumperY: 0.34, plateY: 0.5,
    neonZ0: -2.0, neonZ1: -1.0, neonY: 0.36, mirrorZ: -1.9, pillars: [], seams: [-1.5], exhaust: [0.6],
    seatY: 0.56, driverScale: 0.95, seats: [{ x: -0.42, z: -1.55 }, { x: 0.42, z: -1.55 }], driver: { x: -0.42, z: -1.55 },
    dash: [-2.1, -1.8, 0.78, 1.04, 0.86], wheelY: 1.0, extra: vanExtra,
  },
};
