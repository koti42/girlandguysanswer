/*
 * KEŞİF render/city — İKİ TEKERLEKLİ / SÜZÜLEN ARAÇLAR (SAF): motor (Neon Moto), hoverbike (Rüzgâr Hoverı), süzülkay (hover tahtası).
 * Binici sürücü sahnede görünür (üslup: yuvarlak kask, kısa gövde). Motor yatışı (roll) gölgelendirici tarafında bayrak F_BIKE ile ölçeklenir.
 */
import {
  SLOT, F_STEER, F_BIKE, loft, smooth,
} from './vehicleGeoKit.js';
import {
  C, addExhaust, addPlate, addRiderCrouched, addRiderStanding, addWheel,
} from './vehicleGeoParts.js';

const NEON = [1, 1, 1];

function steerGroup(g, pivot, fn) {
  g.with({ flags: F_STEER | F_BIKE, pivot }, fn);
}

export function buildMotor(g, lod, look) {
  const hi = lod === 'hi';
  const r = 0.3;
  const zf = -0.72;
  const zr = 0.7;
  // tekerlekler (iki yüz görünür)
  addWheel(g, 0, r, zf, r, 0.085, 1, { steer: true, both: true, seg: hi ? 12 : 8, flags: F_BIKE });
  addWheel(g, 0, r, zr, r, 0.1, 1, { steer: false, both: true, seg: hi ? 12 : 8, flags: F_BIKE });
  // ön takım (direksiyonla döner): çatal, far kapsülü, cam, çamurluk, gidon
  steerGroup(g, [0, r, zf], () => {
    g.with({ slot: SLOT.CHROME, col: C.chrome }, () => {
      g.sym(() => g.box(0.085, r, zf - 0.025, 0.115, 0.92, zf + 0.025));
    });
    g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
      g.box(-0.42, 0.95, zf + 0.14, 0.42, 1.0, zf + 0.2);
      g.sym(() => g.box(0.38, 0.93, zf + 0.12, 0.48, 1.03, zf + 0.26));
    });
    // far kapsülü (gövde renginde) + far
    g.with({ slot: SLOT.BODY, col: [1, 1, 1] }, () => {
      g.hull(
        [[-0.12, 0.6, zf - 0.26], [0.12, 0.6, zf - 0.26], [0.17, 0.6, zf + 0.16], [-0.17, 0.6, zf + 0.16]],
        [[-0.08, 0.98, zf - 0.2], [0.08, 0.98, zf - 0.2], [0.15, 1.0, zf + 0.14], [-0.15, 1.0, zf + 0.14]],
      );
    });
    g.with({ slot: SLOT.HEAD, col: C.headW, emit: 0.22 }, () => {
      g.quad([-0.07, 0.74, zf - 0.262], [-0.06, 0.9, zf - 0.205], [0.06, 0.9, zf - 0.205], [0.07, 0.74, zf - 0.262], { f: 'z-' });
    });
    g.with({ slot: SLOT.GLASS, layer: 'glass', col: [1, 1, 1] }, () => {
      g.quad([-0.14, 1.0, zf - 0.04], [-0.1, 1.2, zf + 0.1], [0.1, 1.2, zf + 0.1], [0.14, 1.0, zf - 0.04], { f: 'z-' });
    });
    g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
      g.taper(zf - 0.3, zf + 0.28, r + 0.18, r + 0.26, 0.055, 0.07, 0.055, 0.07);
    });
    g.sym(() => {
      g.with({ slot: SLOT.INDICATOR, col: C.amber, emit: 0.1 }, () => g.box(0.14, 0.82, zf - 0.17, 0.19, 0.87, zf - 0.12));
    });
  });
  // gövde: motor bloğu, sarkaç, depo, koltuk, kuyruk kapağı
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.box(-0.12, 0.3, -0.3, 0.12, 0.5, 0.3);
    g.sym(() => g.box(0.09, 0.3, 0.28, 0.13, 0.42, zr));
    g.box(-0.1, 0.42, -0.5, 0.1, 0.54, -0.28);
  });
  g.with({ slot: SLOT.BODY, col: [1, 1, 1] }, () => {
    g.hull(
      [[-0.15, 0.5, -0.56], [0.15, 0.5, -0.56], [0.2, 0.5, 0.14], [-0.2, 0.5, 0.14]],
      [[-0.11, 0.92, -0.5], [0.11, 0.92, -0.5], [0.17, 0.86, 0.1], [-0.17, 0.86, 0.1]],
    );
  });
  g.with({ slot: SLOT.SEAT, col: C.seat }, () => {
    g.box(-0.14, 0.8, 0.1, 0.14, 0.87, 0.66);
  });
  g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
    g.hull(
      [[-0.13, 0.56, 0.56], [0.13, 0.56, 0.56], [0.09, 0.56, 1.02], [-0.09, 0.56, 1.02]],
      [[-0.15, 0.84, 0.5], [0.15, 0.84, 0.5], [0.07, 0.76, 1.0], [-0.07, 0.76, 1.0]],
    );
    // arka çamurluk
    g.taper(0.5, 1.04, zr - 0.05 + r * 0.9, zr + r * 0.9, 0.09, 0.09, 0.09, 0.09);
  });
  // neon şeritler
  g.sym(() => {
    g.with({ slot: SLOT.NEON, col: NEON, emit: 1 }, () => {
      g.quad([0.205, 0.64, -0.4], [0.205, 0.64, 0.08], [0.2, 0.67, 0.08], [0.2, 0.67, -0.4], { f: 'x+' });
      g.quad([0.12, 0.62, 0.62], [0.12, 0.62, 0.95], [0.1, 0.65, 0.95], [0.1, 0.65, 0.62], { f: 'x+' });
    });
  });
  // kuyruk lambası + plaka + egzoz
  g.with({ slot: SLOT.TAIL, col: C.tail, emit: 0.3 }, () => {
    g.quad([0.1, 0.72, 1.035], [-0.1, 0.72, 1.035], [-0.1, 0.78, 1.015], [0.1, 0.78, 1.015], { f: 'z+' });
  });
  addPlate(g, 0, 0.62, 1.06, 0.15, 0.05, 1);
  g.sym(() => {
    g.with({ slot: SLOT.INDICATOR, col: C.amber, emit: 0.1 }, () => {
      g.box(0.15, 0.66, 0.98, 0.2, 0.71, 1.02);
    });
  });
  g.with({ slot: SLOT.EXHAUST, col: C.exhaust }, () => {
    g.box(0.15, 0.3, 0.2, 0.22, 0.4, 1.05);
  });
  addExhaust(g, 0.19, 0.35, 1.03, 0.05);
  if (hi) {
    const m = g.mark();
    addRiderCrouched(g, 0, 0.83, 0.38, look, 0.5, 0.38 - 0.88);
    g.scaleSince(m, 0.66, 0, 0.83, 0.38);
  }
}

export function buildHoverbike(g, lod, look) {
  const hi = lod === 'hi';
  // gövde: sivri burunlu kama
  const rg = (yb, yt, w) => [[w * 0.5, yb], [w, yb + (yt - yb) * 0.4], [w * 0.85, yt], [0, yt + 0.03], [-w * 0.85, yt], [-w, yb + (yt - yb) * 0.4], [-w * 0.5, yb]];
  const st = [
    { z: -1.3, ring: rg(0.34, 0.5, 0.07) }, { z: -1.1, ring: rg(0.26, 0.58, 0.2) }, { z: -0.6, ring: rg(0.22, 0.7, 0.36) },
    { z: 0.0, ring: rg(0.22, 0.74, 0.4) }, { z: 0.7, ring: rg(0.24, 0.7, 0.38) }, { z: 1.15, ring: rg(0.3, 0.6, 0.26) }, { z: 1.3, ring: rg(0.34, 0.52, 0.12) },
  ];
  loft(g, st, {
    crease: [true, false, false, false, false, false, true],
    aoFn: (x, y) => 0.58 + 0.42 * smooth(0.2, 0.7, y),
    slotAt: (i, j) => (j === 6 ? { skip: true } : null),
    capStart: { slot: SLOT.BODY },
    capEnd: { slot: SLOT.TRIM, col: C.trim },
  });
  // yan itici podlar (neon halkalı)
  g.sym(() => {
    g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
      g.cylZ(0.44, 0.42, 0.45, 0.15, 0.15, 1.1, hi ? 10 : 6, {
        capF: { slot: SLOT.TRIM, col: C.trim },
        capB: { slot: SLOT.NEON, col: NEON, emit: 1 },
      });
    });
    g.with({ slot: SLOT.NEON, col: NEON, emit: 1 }, () => {
      g.cylZ(0.44, 0.42, -0.1, 0.16, 0.16, 0.05, hi ? 10 : 6, {});
    });
    g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
      g.taper(-0.2, 0.9, 0.5, 0.6, 0.3, 0.2, 0.3, 0.18);
    });
  });
  // kokpit: cam kalkan, koltuk, gidon
  g.with({ slot: SLOT.GLASS, layer: 'glass', col: [1, 1, 1] }, () => {
    g.quad([-0.27, 0.7, -0.62], [-0.15, 1.08, -0.18], [0.15, 1.08, -0.18], [0.27, 0.7, -0.62], { f: 'z-' });
  });
  // kalkan çerçevesi + sırt çıkıntısı + arka kanat + ön ayırıcı
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.sym(() => g.quad([0.27, 0.7, -0.62], [0.15, 1.08, -0.18], [0.12, 1.08, -0.18], [0.24, 0.7, -0.62], { f: 'x+' }));
    g.taper(-1.3, -0.86, 0.2, 0.25, 0.1, 0.1, 0.34, 0.34);
  });
  g.with({ slot: SLOT.ACCENT, col: [1, 1, 1] }, () => {
    g.hull(
      [[-0.06, 0.74, 0.0], [0.06, 0.74, 0.0], [0.06, 0.76, 1.0], [-0.06, 0.76, 1.0]],
      [[-0.035, 0.84, 0.1], [0.035, 0.84, 0.1], [0.03, 0.8, 0.95], [-0.03, 0.8, 0.95]],
    );
    g.taper(0.98, 1.3, 0.66, 0.7, 0.4, 0.4, 0.4, 0.4);
    g.sym(() => g.box(0.38, 0.52, 1.0, 0.42, 0.78, 1.3));
  });
  g.with({ slot: SLOT.NEON, col: NEON, emit: 1 }, () => {
    g.quad([-0.4, 0.665, 1.32], [0.4, 0.665, 1.32], [0.4, 0.69, 1.32], [-0.4, 0.69, 1.32], { f: 'z+' });
  });
  g.with({ slot: SLOT.SEAT, col: C.seat }, () => {
    g.box(-0.16, 0.7, 0.0, 0.16, 0.8, 0.75);
  });
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.box(-0.34, 0.76, -0.42, 0.34, 0.82, -0.34);
  });
  // far + stop
  g.with({ slot: SLOT.HEAD, col: C.headW, emit: 0.22 }, () => {
    g.quad([-0.12, 0.43, -1.28], [-0.1, 0.52, -1.25], [0.1, 0.52, -1.25], [0.12, 0.43, -1.28], { f: 'z-' });
  });
  g.with({ slot: SLOT.TAIL, col: C.tail, emit: 0.3 }, () => {
    g.quad([0.2, 0.5, 1.26], [-0.2, 0.5, 1.26], [-0.2, 0.56, 1.24], [0.2, 0.56, 1.24], { f: 'z+' });
  });
  g.sym(() => {
    g.with({ slot: SLOT.INDICATOR, col: C.amber, emit: 0.1 }, () => {
      g.box(0.3, 0.52, -0.82, 0.34, 0.58, -0.76);
      g.box(0.34, 0.56, 1.1, 0.4, 0.62, 1.14);
    });
  });
  addPlate(g, 0, 0.42, 1.31, 0.17, 0.05, 1);
  // alt itiş plakaları (neon taban ışığı): iki yassı levha
  g.with({ slot: SLOT.UNDER, col: NEON, emit: 1 }, () => {
    g.quad([-0.3, 0.2, -0.9], [-0.3, 0.2, 0.9], [0.3, 0.2, 0.9], [0.3, 0.2, -0.9], { f: 'y-' });
  });
  if (hi) {
    const m = g.mark();
    addRiderCrouched(g, 0, 0.78, 0.36, look, 0.5, 0.36 - 0.8);
    g.scaleSince(m, 0.68, 0, 0.78, 0.36);
  }
}

export function buildBoard(g, lod, look) {
  const hi = lod === 'hi';
  const rg = (yb, yt, w) => [[w * 0.7, yb], [w, (yb + yt) / 2], [w * 0.8, yt], [-w * 0.8, yt], [-w, (yb + yt) / 2], [-w * 0.7, yb]];
  const st = [
    { z: -0.7, ring: rg(0.1, 0.2, 0.12) }, { z: -0.55, ring: rg(0.06, 0.26, 0.26) }, { z: -0.1, ring: rg(0.05, 0.28, 0.3) },
    { z: 0.35, ring: rg(0.05, 0.28, 0.3) }, { z: 0.58, ring: rg(0.06, 0.26, 0.26) }, { z: 0.7, ring: rg(0.1, 0.2, 0.12) },
  ];
  loft(g, st, {
    crease: [false, false, true, true, false, false],
    aoFn: (x, y) => 0.7 + 0.3 * smooth(0.05, 0.28, y),
    slotAt: (i, j) => (j === 5 ? { skip: true } : null),
    capStart: { slot: SLOT.BODY },
    capEnd: { slot: SLOT.BODY },
  });
  // üst yüz: tutuş pedi + neon kenar şeritleri
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.quad([-0.2, 0.285, -0.5], [-0.2, 0.285, 0.5], [0.2, 0.285, 0.5], [0.2, 0.285, -0.5], { f: 'y+' });
  });
  g.sym(() => {
    g.with({ slot: SLOT.NEON, col: NEON, emit: 1 }, () => {
      g.quad([0.205, 0.286, -0.52], [0.205, 0.286, 0.52], [0.235, 0.286, 0.52], [0.235, 0.286, -0.52], { f: 'y+' });
    });
  });
  // alt neon plaka + iki itici
  g.with({ slot: SLOT.UNDER, col: NEON, emit: 1 }, () => {
    g.quad([-0.22, 0.048, -0.5], [-0.22, 0.048, 0.5], [0.22, 0.048, 0.5], [0.22, 0.048, -0.5], { f: 'y-' });
  });
  g.with({ slot: SLOT.EXHAUST, col: C.exhaust }, () => {
    g.cylZ(0, 0.14, 0.64, 0.1, 0.07, 0.1, hi ? 8 : 6, { capB: { slot: SLOT.NEON, col: NEON, emit: 1 } });
  });
  g.with({ slot: SLOT.HEAD, col: C.headW, emit: 0.22 }, () => {
    g.quad([-0.08, 0.15, -0.69], [-0.08, 0.22, -0.68], [0.08, 0.22, -0.68], [0.08, 0.15, -0.69], { f: 'z-' });
  });
  g.with({ slot: SLOT.TAIL, col: C.tail, emit: 0.3 }, () => {
    g.quad([0.07, 0.15, 0.72], [-0.07, 0.15, 0.72], [-0.07, 0.2, 0.7], [0.07, 0.2, 0.7], { f: 'z+' });
  });
  if (hi) {
    const m = g.mark();
    addRiderStanding(g, 0, 0.285, 0, look);
    g.scaleSince(m, 0.74, 0, 0.285, 0);
  }
}
