/*
 * KEŞİF render/city — DÖRT TEKERLEKLİ GÖVDE İNŞASI (SAF). taksi · hatch · sedan · spor · kamyonet aynı yapıcıyı farklı tablolarla kullanır:
 * alt gövde halka-loft (yumuşak normaller, tekerlek yuvaları), kabin loft (cam yanlar, direkler, tavan), ışıklar, tamponlar, iç mekân, sürücü.
 * Tüm tablolar METRE ve −Z ileri; t yerine mutlak z. `lod` 'hi' | 'lo'.
 */
import {
  SLOT, F_INTERIOR, lin, loft, mix, smooth,
} from './vehicleGeoKit.js';
import {
  C, addArch, addDash, addDriverSeated, addExhaust, addHeadlamp, addLampDot, addMirror, addPlate, addSeat, addSteeringWheel, addTaillamp, addWheel,
} from './vehicleGeoParts.js';

const INTERP = (arr, z, k) => {
  if (z <= arr[0][0]) return arr[0][k];
  for (let i = 0; i < arr.length - 1; i++) {
    if (z <= arr[i + 1][0]) {
      const t = (z - arr[i][0]) / (arr[i + 1][0] - arr[i][0] || 1);
      return mix(arr[i][k], arr[i + 1][k], t);
    }
  }
  return arr[arr.length - 1][k];
};

/** lo model: her ikinci istasyon (ilk/son korunur). */
function decimate(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) if (i === 0 || i === list.length - 1 || i % 2 === 0) out.push(list[i]);
  return out;
}

/** Alt gövde halkası: [R1..R5, T, L5..L1] (11 nokta) ya da lo için 7 nokta. */
function lowerRing(s, hi) {
  const [, yb, yt, wb, w, wt, crown] = s;
  const h = yt - yb;
  const R = hi
    ? [[wb, yb], [w * 0.985, yb + 0.16 * h], [w, yb + 0.5 * h], [w * 0.975, yb + 0.8 * h], [wt, yt]]
    : [[wb, yb], [w, yb + 0.5 * h], [wt, yt]];
  const ring = R.concat([[0, yt + (crown || 0)]]);
  for (let i = R.length - 1; i >= 0; i--) ring.push([-R[i][0], R[i][1]]);
  return ring;
}

/** Kabin halkası (8 nokta): [B1,B2,C,D,D',C',B2',B1'] */
function cabinRing(c) {
  const [, yBelt, yRoof, wB, wG, wR] = c;
  const rail = 0.035;
  return [
    [wB, yBelt], [wG, yBelt + 0.035], [wR, yRoof - rail], [wR * 0.78, yRoof],
    [-wR * 0.78, yRoof], [-wR, yRoof - rail], [-wG, yBelt + 0.035], [-wB, yBelt],
  ];
}

/**
 * spec: {
 *   L W H wb track wheelR wheelHW  lower:[[z,yb,yt,wb,w,wt,crown]…]  cabin:[[z,yBelt,yRoof,wB,wG,wR]…]  topKinds:['glass'|'body'…] (kabin segmentleri)
 *   headX headY headZ  headW headH  tailX tailY tailW tailH  plateY  bumper:{…}  seats:[{x,z}]  driver:{x,z}  mirrorZ  exhaust:[x…]
 *   pillars:[z…]  seams:[z…]  sign?:{…}  extra(g, ctx) kancası, wheelBulge
 * }
 */
export function buildCar(g, spec, lod, look) {
  const hi = lod === 'hi';
  const lower = hi ? spec.lower : decimate(spec.lower);
  const ring = (s) => lowerRing(s, hi);
  const yTop = (z) => INTERP(spec.lower, z, 2);
  const zN = spec.lower[0][0];
  const zT = spec.lower[spec.lower.length - 1][0];
  const cabinZ0 = spec.cabin[0][0];
  const cabinZ1 = spec.cabin[spec.cabin.length - 1][0];
  const ao = (x, y) => {
    const k = smooth(0.1, 0.62, y);
    return 0.5 + 0.5 * k + (Math.abs(x) > 0.7 ? 0 : 0.0);
  };
  const stations = lower.map((s) => ({ z: s[0], ring: ring(s) }));
  const Nn = stations[0].ring.length;
  const mid = (Nn - 1) / 2;
  const crease = [];
  crease[0] = true;
  crease[Nn - 1] = true;
  loft(g, stations, {
    crease,
    aoFn: (x, y) => ao(x, y),
    slotAt: (i, j) => {
      if (j === Nn - 1) return { skip: true }; // alt kenar
      const zm = (lower[i][0] + lower[i + 1][0]) / 2;
      const top = j === mid - 1 || j === mid; // üst iki kenar
      if (top && zm > cabinZ0 + 0.02 && zm < cabinZ1 - 0.02) return { slot: SLOT.INTERIOR, col: C.interior, flags: F_INTERIOR };
      if (j === 0 || j === Nn - 2) return { slot: SLOT.BODY, col: [0.5, 0.5, 0.5] }; // etek altı: koyu
      return null;
    },
    capStart: { slot: SLOT.BODY },
    capEnd: { slot: SLOT.BODY },
  });

  // kabin
  const cst = spec.cabin.map((c) => ({ z: c[0], ring: cabinRing(c) }));
  loft(g, cst, {
    crease: [true, false, true, false, true, false, true, true],
    aoFn: (x, y) => 0.8 + 0.2 * smooth(0.6, 1.4, y),
    slotAt: (i, j) => {
      if (j === 7) return { skip: true };
      if (j === 1 || j === 5) return { slot: SLOT.GLASS, layer: 'glass', col: [1, 1, 1] };
      if (j === 3) return spec.topKinds[i] === 'glass' ? { slot: SLOT.GLASS, layer: 'glass', col: [1, 1, 1] } : { slot: SLOT.BODY };
      if (j === 0 || j === 6) return { slot: SLOT.TRIM, col: C.trim };
      return { slot: SLOT.BODY };
    },
    capStart: { slot: SLOT.BODY },
    capEnd: { slot: SLOT.BODY },
  });

  // direkler (B/C): yan cama üstünde gövde renginde ince şerit
  if (hi) {
    g.with({ slot: SLOT.BODY, col: [0.9, 0.9, 0.9] }, () => {
      (spec.pillars || []).forEach((pz) => {
        const yR = INTERP(spec.cabin, pz, 2);
        const yB = INTERP(spec.cabin, pz, 1) + 0.035;
        const wG = INTERP(spec.cabin, pz, 4);
        const wR = INTERP(spec.cabin, pz, 5);
        g.sym(() => {
          g.quad([wG + 0.004, yB, pz - 0.04], [wR + 0.004, yR - 0.035, pz - 0.04], [wR + 0.004, yR - 0.035, pz + 0.04], [wG + 0.004, yB, pz + 0.04], { f: 'x+' });
        });
      });
    });
  }

  // tekerlek yuvaları + tekerlekler
  const wz = spec.wb / 2;
  const wx = spec.track / 2 + (spec.wheelBulge || 0);
  const wR = spec.wheelR;
  const seg = hi ? 12 : 8;
  [[-1, true], [1, false]].forEach(([zs, front]) => {
    g.sym(() => {
      const cz = zs * wz;
      const bodyW = INTERP(spec.lower, cz, 4);
      if (hi) addArch(g, bodyW + 0.01, wR, cz, wR + 0.1, 1, 8);
      addWheel(g, wx, wR, cz, wR, spec.wheelHW, 1, { steer: front, seg });
    });
  });

  // ön
  const nz = zN;
  g.sym(() => {
    addHeadlamp(g, spec.headX, spec.headY, nz + (spec.headZ || 0.05), spec.headW, spec.headH, spec.headSweep);
    addTaillamp(g, spec.tailX, spec.tailY, zT - (spec.tailZ || 0.04), spec.tailW, spec.tailH, spec.tailSweep);
    addLampDot(g, SLOT.INDICATOR, C.amber, spec.headX + spec.headW + 0.08, spec.headY - 0.02, nz + (spec.headZ || 0.05) + 0.015, 0.05, 0.035, -1);
    addLampDot(g, SLOT.INDICATOR, C.amber, spec.tailX + spec.tailW + 0.07, spec.tailY, zT - (spec.tailZ || 0.04) - 0.005, 0.05, 0.035, 1);
    addLampDot(g, SLOT.REVERSE, C.white, spec.tailX - 0.2, spec.tailY - spec.tailH - 0.05, zT - (spec.tailZ || 0.04) - 0.005, 0.07, 0.025, 1);
  });
  // ön ışık şeridi (kozmetik neon rengi) + arka tam genişlik stop şeridi: neon-gelecek kimliği
  g.sym(() => {
    const x1 = Math.max(0.1, spec.headX - spec.headW - 0.01);
    const yH = spec.headY - 0.005;
    const zl = nz + (spec.headZ || 0.05) - 0.004;
    g.with({ slot: SLOT.NEON, col: [1, 1, 1], emit: 0.9 }, () => {
      g.quad([0, yH, nz - 0.004], [0, yH + 0.03, nz - 0.004], [x1, yH + 0.03, zl], [x1, yH, zl], { f: 'z-' });
    });
    const x2 = Math.max(0.1, spec.tailX - spec.tailW - 0.01);
    const zt = zT - (spec.tailZ || 0.04) - 0.004;
    g.with({ slot: SLOT.TAIL, col: C.tail, emit: 0.3 }, () => {
      g.quad([x2, spec.tailY - 0.02, zt], [0, spec.tailY - 0.02, zT + 0.004], [0, spec.tailY + 0.02, zT + 0.004], [x2, spec.tailY + 0.02, zt], { f: 'z+' });
    });
  });
  // ızgara + tamponlar
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.box(-spec.grilleW, spec.grilleY0, nz + 0.01, spec.grilleW, spec.grilleY1, nz + 0.07);
    g.box(-spec.bumperW, spec.bumperY, nz - 0.01, spec.bumperW, spec.bumperY + 0.08, nz + 0.06);
    g.box(-spec.bumperW, spec.bumperY + 0.02, zT - 0.06, spec.bumperW, spec.bumperY + 0.1, zT + 0.01);
  });
  // plakalar
  addPlate(g, 0, spec.plateY, nz - 0.005, 0.26, 0.065, -1);
  addPlate(g, 0, spec.plateY + 0.05, zT + 0.012, 0.26, 0.065, 1);
  // neon etek şeridi (kozmetik neon rengi)
  g.sym(() => {
    const zf = spec.neonZ0;
    const zb = spec.neonZ1;
    const yb = spec.neonY;
    const w = INTERP(spec.lower, (zf + zb) / 2, 3) + 0.01;
    g.with({ slot: SLOT.NEON, col: [1, 1, 1], emit: 1 }, () => {
      g.quad([w, yb, zf], [w, yb, zb], [w + 0.0, yb + 0.035, zb], [w + 0.0, yb + 0.035, zf], { f: 'x+' });
    });
  });
  // egzoz
  (spec.exhaust || []).forEach((ex) => addExhaust(g, ex, 0.3, zT, 0.045));
  // aynalar
  if (hi && spec.mirrorZ !== undefined) {
    g.sym(() => {
      const yy = INTERP(spec.cabin, spec.mirrorZ, 1) + 0.03;
      addMirror(g, 1, INTERP(spec.cabin, spec.mirrorZ, 3) - 0.02, yy, spec.mirrorZ);
    });
  }
  // kapı çizgileri (ince koyu şeritler)
  if (hi) {
    g.sym(() => {
      (spec.seams || []).forEach((sz) => {
        const w = INTERP(spec.lower, sz, 4) + 0.003;
        const yt = yTop(sz) - 0.04;
        const yb = spec.lower[3][1] + 0.2;
        g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
          g.quad([w, yb, sz - 0.008], [w, yb, sz + 0.008], [w, yt, sz + 0.008], [w, yt, sz - 0.008], { f: 'x+' });
        });
      });
    });
  }
  // kapı kolları (ayrıntılı)
  if (hi) {
    g.sym(() => {
      (spec.seams || []).slice(0, 2).forEach((sz) => {
        const zc = sz + 0.28;
        const w = INTERP(spec.lower, zc, 4) + 0.004;
        const yh = yTop(zc) - 0.11;
        g.with({ slot: SLOT.TRIM, col: C.trimLight }, () => {
          g.box(w, yh - 0.012, zc - 0.08, w + 0.028, yh + 0.012, zc + 0.08);
        });
      });
    });
  }
  if (spec.extra) spec.extra(g, { hi, spec, yTop });

  // iç mekân + sürücü
  if (hi) {
    const dr = spec.driver;
    const seatY = spec.seatY;
    (spec.seats || []).forEach((s) => addSeat(g, s.x, seatY, s.z, 0.46));
    addDash(g, spec.dash[0], spec.dash[1], spec.dash[2], spec.dash[3], spec.dash[4]);
    addSteeringWheel(g, dr.x, spec.wheelY, dr.z - 0.52, 0.17, 10);
    const mk = g.mark();
    addDriverSeated(g, dr.x, seatY + 0.16, dr.z + 0.04, look, { lean: 0.1 });
    g.scaleSince(mk, spec.driverScale || 0.78, dr.x, seatY + 0.16, dr.z + 0.04);
  }
}

/** Gölge/yer tabanı için alt kapak: araç altını kapatan koyu levha (alttan bakış, hover için). */
export function addUndercarriage(g, z0, z1, y, hw) {
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.quad([-hw, y, z0], [-hw, y, z1], [hw, y, z1], [hw, y, z0], { f: 'y-' });
  });
}

export { lin };
