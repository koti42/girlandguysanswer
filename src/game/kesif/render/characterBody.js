/*
 * KEŞİF karakter gövdesi: iskelet yerleşimi, ölçüler ve çıplak (ten) heykel.
 *
 * ≈7 baş boy (1.78 m), +z geri / -z ileri (yüz -z'ye bakar), +x karakterin SAĞI.
 * Dinlenme pozu: kollar yanda düz aşağı, bacaklar düz. Tüm yüzeyler `characterGeo` süpürme/elipsoit/boru
 * parçalarıyla kurulur; eklem bölgelerinde (omuz, dirsek, bilek, kalça, diz, bilek-ayak, boyun, parmak
 * eklemi) köşe ağırlıkları smoothstep ile iki-üç kemik arasında yayılır → yumuşak bükülme.
 */
import * as THREE from 'three';
import {
  chainWeights, withExtra, sweep, ellipsoid, tube, smooth01, resampleSections, shade, mixHex, lerp,
} from './characterGeo.js';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, normalizeAvatar } from '../../avatar/catalog.js';

/* ------------------------------------------------------------------------------------------------
 * İskelet
 * ---------------------------------------------------------------------------------------------- */
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'hair1', 'hair2', 'hair3',
  'clavicleL', 'armL', 'foreArmL', 'handL', 'fingersL',
  'clavicleR', 'armR', 'foreArmR', 'handR', 'fingersR',
  'legL', 'shinL', 'footL', 'toesL', 'legR', 'shinR', 'footR', 'toesR',
];
export const PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  hair1: 'head', hair2: 'hair1', hair3: 'hair2',
  clavicleL: 'chest', armL: 'clavicleL', foreArmL: 'armL', handL: 'foreArmL', fingersL: 'handL',
  clavicleR: 'chest', armR: 'clavicleR', foreArmR: 'armR', handR: 'foreArmR', fingersR: 'handR',
  legL: 'hips', shinL: 'legL', footL: 'shinL', toesL: 'footL',
  legR: 'hips', shinR: 'legR', footR: 'shinR', toesR: 'footR',
};

/** Vücut ölçüleri (metre, dünya dinlenme koordinatları; ayak tabanı y=0). */
export const BODY_DIMS = {
  erkek: {
    hipY: 0.92, kneeY: 0.51, ankleY: 0.085, legX: 0.09,
    spineY: 1.02, chestY: 1.21, neckY: 1.455, headY: 1.545,
    shX: 0.175, shY: 1.375, clavX: 0.035, clavY: 1.385,
    elbowY: 1.075, wristY: 0.815, knuckleY: 0.722,
    toeZ: -0.13, toeY: 0.03,
    chinY: 1.515, crownY: 1.746, eyeY: 1.628, eyeX: 0.032,
    hairPivot: [0, 1.74, 0.07],
  },
  kiz: {
    hipY: 0.91, kneeY: 0.50, ankleY: 0.082, legX: 0.088,
    spineY: 1.01, chestY: 1.20, neckY: 1.445, headY: 1.535,
    shX: 0.155, shY: 1.37, clavX: 0.03, clavY: 1.378,
    elbowY: 1.07, wristY: 0.815, knuckleY: 0.726,
    toeZ: -0.12, toeY: 0.03,
    chinY: 1.505, crownY: 1.736, eyeY: 1.618, eyeX: 0.031,
    hairPivot: [0, 1.73, 0.07],
  },
};

/** Kemiklerin dünya (dinlenme) ve ebeveyne göre konumları. */
export function getLayout(body) {
  const d = BODY_DIMS[body] || BODY_DIMS.erkek;
  const w = {
    hips: [0, d.hipY, 0],
    spine: [0, d.spineY, 0],
    chest: [0, d.chestY, 0],
    neck: [0, d.neckY, 0],
    head: [0, d.headY, 0],
    hair1: [d.hairPivot[0], d.hairPivot[1], d.hairPivot[2]],
    hair2: [0, d.hairPivot[1] - 0.13, d.hairPivot[2] + 0.015],
    hair3: [0, d.hairPivot[1] - 0.26, d.hairPivot[2] + 0.02],
  };
  [['L', -1], ['R', 1]].forEach(([n, s]) => {
    w['clavicle' + n] = [s * d.clavX, d.clavY, 0];
    w['arm' + n] = [s * d.shX, d.shY, 0];
    w['foreArm' + n] = [s * d.shX, d.elbowY, 0];
    w['hand' + n] = [s * d.shX, d.wristY, 0];
    w['fingers' + n] = [s * d.shX, d.knuckleY, 0];
    w['leg' + n] = [s * d.legX, d.hipY, 0];
    w['shin' + n] = [s * d.legX, d.kneeY, 0];
    w['foot' + n] = [s * d.legX, d.ankleY, 0];
    w['toes' + n] = [s * d.legX, d.toeY, d.toeZ];
  });
  const local = {};
  BONES.forEach((b) => {
    const p = PARENT[b];
    local[b] = p ? [w[b][0] - w[p][0], w[b][1] - w[p][1], w[b][2] - w[p][2]] : w[b].slice();
  });
  return { dims: d, world: w, local, hipY: d.hipY };
}

/** Çözülmüş renkler. Göz rengi saç rengi indeksinden türetilir (katalogda göz yok). */
const IRIS = [0x4a2f1c, 0x5a3a22, 0x6b4a2a, 0x7a5a2e, 0x3f78b8, 0x4f8f5a, 0x7a4a2a, 0x5a6fb0, 0x6a58c8, 0x2fa8a0];
export function avatarColors(config) {
  const a = normalizeAvatar(config);
  return {
    skin: SKIN_TONES[a.skin],
    hair: HAIR_COLORS[a.hair.color],
    top: CLOTH_COLORS[a.top.color],
    bottom: CLOTH_COLORS[a.bottom.color],
    shoes: CLOTH_COLORS[a.shoes.color],
    iris: IRIS[a.hair.color % IRIS.length],
  };
}

/* ------------------------------------------------------------------------------------------------
 * Kesit anahtarları
 * ---------------------------------------------------------------------------------------------- */
export function torsoKeys(kiz) {
  if (kiz) {
    return [
      { y: 0.80, rx: 0.100, rz: 0.082 }, { y: 0.86, rx: 0.156, rz: 0.098 }, { y: 0.92, rx: 0.174, rz: 0.104 },
      { y: 0.99, rx: 0.148, rz: 0.096 }, { y: 1.05, rx: 0.113, rz: 0.080 }, { y: 1.13, rx: 0.126, rz: 0.090, cz: -0.003 },
      { y: 1.23, rx: 0.142, rz: 0.100, cz: -0.008 }, { y: 1.30, rx: 0.146, rz: 0.100, cz: -0.006 },
      { y: 1.375, rx: 0.134, rz: 0.090 }, { y: 1.425, rx: 0.082, rz: 0.062, cz: 0.004 }, { y: 1.455, rx: 0.048, rz: 0.048, cz: 0.004 },
    ];
  }
  return [
    { y: 0.80, rx: 0.098, rz: 0.082 }, { y: 0.86, rx: 0.152, rz: 0.098 }, { y: 0.93, rx: 0.170, rz: 0.104 },
    { y: 1.00, rx: 0.152, rz: 0.098 }, { y: 1.06, rx: 0.138, rz: 0.092 }, { y: 1.14, rx: 0.148, rz: 0.100, cz: -0.002 },
    { y: 1.24, rx: 0.164, rz: 0.110, cz: -0.005 }, { y: 1.32, rx: 0.168, rz: 0.112, cz: -0.006 },
    { y: 1.385, rx: 0.150, rz: 0.096 }, { y: 1.43, rx: 0.092, rz: 0.068, cz: 0.004 }, { y: 1.462, rx: 0.052, rz: 0.052, cz: 0.004 },
  ];
}

/** Bacak (x merkezi dışarıda eklenir): ayak bileğinden kalça içine. */
export function legKeys(kiz) {
  const f = kiz ? 0.94 : 1;
  const k = [
    { y: 0.078, rx: 0.033, rz: 0.036 }, { y: 0.12, rx: 0.036, rz: 0.040 }, { y: 0.22, rx: 0.046, rz: 0.051, cz: 0.004 },
    { y: 0.34, rx: 0.057, rz: 0.061, cz: 0.010 }, { y: 0.45, rx: 0.048, rz: 0.055, cz: 0.004 }, { y: 0.51, rx: 0.052, rz: 0.058 },
    { y: 0.60, rx: 0.061, rz: 0.068 }, { y: 0.74, rx: 0.073, rz: 0.080 }, { y: 0.88, rx: 0.078, rz: 0.088 },
    { y: 0.96, rx: 0.078, rz: 0.086 }, { y: 1.00, rx: 0.046, rz: 0.058 },
  ];
  return k.map((s) => ({ ...s, rx: s.rx * f, rz: s.rz * f }));
}

/** Kol (x merkezi dışarıda eklenir): bilekten omuz topuna. */
export function armKeys(kiz) {
  const f = kiz ? 0.88 : 1;
  const k = [
    { y: 0.78, rx: 0.025, rz: 0.021 }, { y: 0.815, rx: 0.027, rz: 0.022 }, { y: 0.88, rx: 0.033, rz: 0.029 },
    { y: 0.96, rx: 0.041, rz: 0.036 }, { y: 1.02, rx: 0.044, rz: 0.040 }, { y: 1.075, rx: 0.040, rz: 0.038 },
    { y: 1.15, rx: 0.046, rz: 0.043 }, { y: 1.25, rx: 0.050, rz: 0.047 }, { y: 1.31, rx: 0.053, rz: 0.051 },
    { y: 1.355, rx: 0.052, rz: 0.051 }, { y: 1.40, rx: 0.036, rz: 0.036 },
  ];
  return k.map((s) => ({ ...s, rx: s.rx * f, rz: s.rz * f }));
}

export function neckKeys(kiz) {
  const f = kiz ? 0.9 : 1;
  return [
    { y: 1.40, rx: 0.056 * f, rz: 0.056 * f }, { y: 1.46, rx: 0.049 * f, rz: 0.050 * f },
    { y: 1.51, rx: 0.045 * f, rz: 0.047 * f, cz: -0.004 }, { y: 1.57, rx: 0.044 * f, rz: 0.046 * f, cz: -0.002 },
  ];
}

/** Kafa: (y, rx, zÖn, zArka) → süpürme anahtarları. Kız: daha küçük çene/elmacık. */
export function headKeys(kiz) {
  const t = [
    [1.515, 0.012, -0.040, -0.010],
    [1.525, 0.034, -0.075, 0.010],
    [1.540, 0.050, -0.080, 0.040],
    [1.560, 0.066, -0.082, 0.070],
    [1.585, 0.074, -0.086, 0.088],
    [1.620, 0.077, -0.090, 0.100],
    [1.655, 0.078, -0.089, 0.104],
    [1.690, 0.076, -0.080, 0.104],
    [1.720, 0.066, -0.060, 0.094],
    [1.738, 0.046, -0.035, 0.070],
    [1.746, 0.020, -0.012, 0.040],
  ];
  return t.map((r, i) => {
    let rx = r[1];
    let zf = r[2];
    if (kiz) {
      const jaw = i >= 1 && i <= 3 ? 0.88 : 1;
      rx *= i >= 4 ? 0.965 : jaw;
      zf = r[2] * (i <= 2 ? 0.92 : 0.97);
    }
    return { y: r[0] + (kiz ? -0.01 : 0), rx, rz: (r[3] - zf) / 2, cz: (r[3] + zf) / 2 };
  });
}

const surfCache = new Map();
function surfaceTable(kiz) {
  const key = kiz ? 'k' : 'e';
  let t = surfCache.get(key);
  if (!t) {
    t = resampleSections(headKeys(kiz), 6);
    surfCache.set(key, t);
  }
  return t;
}
/** Başın y yüksekliğindeki kesiti {rx,rz,cz} (doğrusal aradeğer). */
export function headSection(kiz, y) {
  const t = surfaceTable(kiz);
  if (y <= t[0].y) return t[0];
  if (y >= t[t.length - 1].y) return t[t.length - 1];
  for (let i = 0; i < t.length - 1; i++) {
    if (y <= t[i + 1].y) {
      const u = (y - t[i].y) / (t[i + 1].y - t[i].y);
      return { y, rx: lerp(t[i].rx, t[i + 1].rx, u), rz: lerp(t[i].rz, t[i + 1].rz, u), cz: lerp(t[i].cz, t[i + 1].cz, u) };
    }
  }
  return t[t.length - 1];
}
/** Baş yüzeyinde (x,y) noktasının z'si (ön yüz, -z). */
export function headFaceZ(kiz, x, y, out = 0) {
  const s = headSection(kiz, y);
  const nx = Math.min(0.999, Math.abs(x) / s.rx);
  return s.cz - s.rz * Math.sqrt(1 - nx * nx) - out;
}
/** Başın ARKA yüzeyinde (x,y) noktasının z'si. */
export function headBackZ(kiz, x, y) {
  const s = headSection(kiz, y);
  const nx = Math.min(0.999, Math.abs(x) / s.rx);
  return s.cz + s.rz * Math.sqrt(1 - nx * nx);
}

/** Ayrıntı düzeyine göre örgülü küçük elipsoit. */
export function E(ctx, rx, ry, rz, level = 1) {
  if (ctx.hi) return ellipsoid(rx, ry, rz, level === 2 ? { seg: 12, rings: 8 } : level === 0 ? { seg: 6, rings: 4 } : { seg: 8, rings: 5 });
  return ellipsoid(rx, ry, rz, level === 2 ? { seg: 8, rings: 5 } : { seg: 5, rings: 3 });
}

/** Kesit anahtarını bir ofsetle şişirir (giysi kabuğu). */
export function offsetKeys(keys, e, ey = e) {
  return keys.map((k) => ({ ...k, rx: k.rx + e, rz: k.rz + ey }));
}
/** Anahtarlardan [y0,y1] aralığını n örnekle kırpar (hem uçlar dahil). */
export function sliceKeys(keys, y0, y1, n = 6) {
  const dense = resampleSections(keys, 8);
  const at = (y) => {
    if (y <= dense[0].y) return dense[0];
    if (y >= dense[dense.length - 1].y) return dense[dense.length - 1];
    for (let i = 0; i < dense.length - 1; i++) {
      if (y <= dense[i + 1].y) {
        const u = (y - dense[i].y) / (dense[i + 1].y - dense[i].y || 1);
        return {
          rx: lerp(dense[i].rx, dense[i + 1].rx, u), rz: lerp(dense[i].rz, dense[i + 1].rz, u),
          cx: lerp(dense[i].cx, dense[i + 1].cx, u), cz: lerp(dense[i].cz, dense[i + 1].cz, u),
        };
      }
    }
    return dense[dense.length - 1];
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = lerp(y0, y1, i / (n - 1));
    const s = at(y);
    out.push({ y, rx: s.rx, rz: s.rz, cx: s.cx, cz: s.cz });
  }
  return out;
}
export function shiftKeys(keys, dx, dz = 0) {
  return keys.map((k) => ({ ...k, cx: (k.cx || 0) + dx, cz: (k.cz || 0) + dz }));
}

/* ------------------------------------------------------------------------------------------------
 * Bağlam (ctx): ölçüler, renkler, ağırlık fonksiyonları, ayrıntı düzeyi
 * ---------------------------------------------------------------------------------------------- */
export function makeContext(config, detail) {
  const a = normalizeAvatar(config);
  const hi = detail !== 'low';
  const kiz = a.body === 'kiz';
  const L = getLayout(a.body);
  const d = L.dims;
  const col = avatarColors(a);
  const side = (n) => ({
    arm: chainWeights([{ bone: 'arm' + n }, { bone: 'foreArm' + n, y: d.elbowY, band: 0.055 }, { bone: 'hand' + n, y: d.wristY, band: 0.03 }]),
    leg: withExtra(
      chainWeights([{ bone: 'leg' + n }, { bone: 'shin' + n, y: d.kneeY, band: 0.055 }, { bone: 'foot' + n, y: d.ankleY, band: 0.03 }]),
      () => null,
    ),
  });
  const SL = side('L');
  const SR = side('R');
  const torsoBase = chainWeights([
    { bone: 'neck' }, { bone: 'chest', y: d.neckY, band: 0.05 }, { bone: 'spine', y: d.chestY, band: 0.08 }, { bone: 'hips', y: d.spineY, band: 0.08 },
  ]);
  const torso = withExtra(torsoBase, (x, y) => {
    const ax = Math.abs(x);
    const bone = x < 0 ? 'armL' : 'armR';
    const lat = smooth01((ax - 0.10) / 0.07) * smooth01((y - 1.24) / 0.08);
    if (lat > 0.01) return [[bone, lat * 0.85]];
    const lg = smooth01((0.94 - y) / 0.12) * smooth01((ax - 0.03) / 0.08);
    if (lg > 0.01) return [[x < 0 ? 'legL' : 'legR', lg * 0.6]];
    return null;
  });
  const neck = chainWeights([{ bone: 'head' }, { bone: 'neck', y: d.headY, band: 0.035 }, { bone: 'chest', y: d.neckY, band: 0.04 }]);
  const fingers = (n) => chainWeights([{ bone: 'hand' + n }, { bone: 'fingers' + n, y: d.knuckleY, band: 0.013 }]);
  const shin = (n) => chainWeights([{ bone: 'shin' + n }, { bone: 'foot' + n, y: d.ankleY, band: 0.03 }]);
  const footW = (n) => (x, y, z) => {
    const toe = smooth01(((-z) - (-d.toeZ - 0.025)) / 0.05) * smooth01((0.075 - y) / 0.04 + 0.4);
    const base = shin(n)(x, y, z);
    if (toe < 0.01) return base;
    return base.map((p) => [p[0], p[1] * (1 - toe)]).concat([['toes' + n, toe]]);
  };
  return {
    cfg: a, hi, kiz, L, d, col,
    seg: hi ? { body: 12, torso: 14, head: 24, fine: 6, ball: 10 } : { body: 8, torso: 10, head: 14, fine: 5, ball: 7 },
    sub: hi ? 2 : 1,
    W: { torso, neck, armL: SL.arm, armR: SR.arm, legL: SL.leg, legR: SR.leg, fingersL: fingers('L'), fingersR: fingers('R'), footL: footW('L'), footR: footW('R'), shinL: shin('L'), shinR: shin('R') },
    skinCol: (shadeF = 1) => shade(col.skin, shadeF),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Ten heykeli
 * ---------------------------------------------------------------------------------------------- */
/** Kadın gövdesinde göğüs hacmi: ön yüzeyde yumuşak kabartma (kabuklarda da kullanılır). */
export function bustBump(piece, ctx, amp) {
  if (!ctx.kiz) return piece;
  const pos = piece.pos;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    if (z > -0.02) continue;
    const w = Math.min(1, (-z - 0.02) / 0.06);
    const g = Math.exp(-(Math.pow((Math.abs(x) - 0.06) / 0.05, 2) + Math.pow((y - 1.225) / 0.055, 2)));
    pos[i + 2] = z - amp * g * w;
  }
  return piece;
}

/** Kol (ten) + el: karakter ve birinci şahıs kolları ortak kullanır. */
export function buildArms(b, ctx) {
  const { d, kiz, col, seg, sub, W } = ctx;
  const skin = col.skin;
  const warmC = new THREE.Color().set(mixHex(skin, 0xb04a3a, 0.35));
  [['L', -1], ['R', 1]].forEach(([n, s]) => {
    b.add(sweep(shiftKeys(armKeys(kiz), s * d.shX), { seg: seg.body, sub }), {
      color: skin, weights: W['arm' + n], skin: 1,
      colorFn: (x, y, z, nx, ny, nz, c) => {
        // dirsek içi ve bilek iç yüzü hafif sıcak ton
        const inner = -s * nx;
        if (inner > 0.6 && y > 0.9 && y < 1.2) c.lerp(warmC, 0.1);
      },
    });
    buildHand(b, ctx, n, s);
  });
}

export function buildBody(b, ctx) {
  const { d, kiz, col, seg, sub, W } = ctx;
  const skin = col.skin;
  // gövde (yakalıkta ten, giysi kabukları üstte)
  b.add(bustBump(sweep(torsoKeys(kiz), { seg: seg.torso, sub }), ctx, 0.008), { color: skin, weights: W.torso, skin: 1 });
  // boyun
  b.add(sweep(neckKeys(kiz), { seg: seg.body, sub, capBottom: false, capTop: false }), {
    color: skin, weights: W.neck, skin: 1,
    colorFn: (x, y, z, nx, ny, nz, c) => { if (y < 1.44) c.multiplyScalar(0.92); if (nz < -0.4 && y > 1.5) c.multiplyScalar(0.9); },
  });
  // bacaklar
  [['L', -1], ['R', 1]].forEach(([n, s]) => {
    b.add(sweep(shiftKeys(legKeys(kiz), s * d.legX), { seg: seg.body, sub }), { color: skin, weights: W['leg' + n], skin: 1 });
  });
  buildArms(b, ctx);
  buildHead(b, ctx);
}


/** El: avuç, 4 parmak (hafif kıvrık), başparmak, tırnaklar. */
function buildHand(b, ctx, n, s) {
  const { d, col, kiz, seg, hi } = ctx;
  const sc = kiz ? 0.9 : 1;
  const xc = s * d.shX;
  const inward = -s;
  const skin = col.skin;
  const tipSkin = mixHex(skin, 0xd88a7a, 0.18);
  // avuç
  b.add(E(ctx, 0.0195 * sc, 0.047 * sc, 0.0385 * sc, 1), {
    color: skin, weights: 'hand' + n, skin: 1,
    xf: { pos: [xc + inward * 0.002, d.wristY - 0.052, 0.0] },
  });
  const lens = [0.080, 0.090, 0.084, 0.066];
  const zs = [-0.0255, -0.0085, 0.0085, 0.0255];
  const base = d.knuckleY + 0.004;
  for (let i = 0; i < 4; i++) {
    const L = lens[i] * sc;
    const z = zs[i] * sc;
    const pts = [
      [xc + inward * 0.003, base, z],
      [xc + inward * (0.006 + i * 0.0005), base - L * 0.48, z],
      [xc + inward * (0.016 + i * 0.001), base - L * 0.88, z],
      [xc + inward * 0.021, base - L * 0.99 - 0.004, z],
    ];
    b.add(tube(pts, (t) => (0.0098 - t * 0.0034) * sc, { seg: seg.fine, cap: 'round' }), { color: skin, weights: ctx.W['fingers' + n], skin: 1 });
    if (hi) {
      // tırnak: parmağın dış (sırt) yüzünde küçük, açık tonlu elipsoit
      b.add(E(ctx, 0.0042 * sc, 0.0046 * sc, 0.0062 * sc, 0), {
        mesh: 'gloss', color: mixHex(tipSkin, 0xffe9e2, 0.55), weights: ctx.W['fingers' + n],
        xf: { pos: [pts[3][0] - inward * 0.0075, pts[3][1] + 0.012, z], rot: [0, 0, inward * 0.12] },
      });
    }
  }
  // başparmak (önde, -z), avuca bağlı
  const tp = [
    [xc + inward * 0.003, d.wristY - 0.025, -0.030 * sc],
    [xc + inward * 0.008, d.wristY - 0.058 * sc, -0.046 * sc],
    [xc + inward * 0.013, d.wristY - 0.088 * sc, -0.054 * sc],
    [xc + inward * 0.018, d.wristY - 0.108 * sc, -0.052 * sc],
  ];
  b.add(tube(tp, (t) => (0.0125 - t * 0.0048) * sc, { seg: seg.fine, cap: 'round' }), {
    color: skin, weights: (x, y) => (y < d.knuckleY - 0.02 ? [['fingers' + n, 0.4], ['hand' + n, 0.6]] : [['hand' + n, 1]]), skin: 1,
  });
}

/** Baş yüzeyinin dış normali (yaklaşık: elipsoit merkezinden). */
export function headNormalAt(kiz, x, y, z, out) {
  const s = headSection(kiz, Math.min(1.745, Math.max(1.52, y)));
  const nx = x / (s.rx * s.rx);
  const nz = (z - s.cz) / (s.rz * s.rz);
  const ny = (y - 1.64) * 0.5;
  const l = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
}

const gauss = (d) => Math.exp(-d * d);

/** Yüz yüzeyine yumuşak kabartma/çukur (kaş sırtı, göz çukuru, elmacık, çene). Ön yüzü -z'ye iter. */
function sculptFace(piece, ctx) {
  const { kiz, d } = ctx;
  const pos = piece.pos;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    const s = headSection(kiz, y);
    const front = clamp01(((s.cz - z) / s.rz - 0.15) / 0.5); // 0 arka .. 1 ön
    if (front <= 0) continue;
    const ax = Math.abs(x);
    let dz = 0;
    dz += (kiz ? 0.0022 : 0.0042) * gauss((y - (d.eyeY + 0.022)) / 0.011) * smoothEdge(ax, 0.052); // kaş sırtı
    dz -= 0.0024 * gauss(Math.hypot((ax - d.eyeX) / 0.02, (y - d.eyeY) / 0.014)); // göz çukuru
    dz += 0.0032 * gauss(Math.hypot((ax - 0.052) / 0.016, (y - (d.eyeY - 0.03)) / 0.016)); // elmacık
    dz += (kiz ? 0.0035 : 0.0055) * gauss(Math.hypot(x / 0.017, (y - (d.chinY + 0.011)) / 0.014)); // çene ucu
    dz += 0.0018 * gauss((y - (d.eyeY + 0.062)) / 0.025) * smoothEdge(ax, 0.05); // alın
    dz -= (kiz ? 0.0008 : 0.0022) * gauss(Math.hypot((ax - 0.046) / 0.016, (y - (d.eyeY - 0.07)) / 0.018)); // yanak altı
    pos[i + 2] = z - dz * front;
  }
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothEdge = (ax, w) => 1 - Math.min(1, Math.max(0, (ax - w) / w));

/* ------------------------------------------------------------------------------------------------
 * Baş ve yüz
 * ---------------------------------------------------------------------------------------------- */
export function buildHead(b, ctx) {
  const { kiz, col, seg, hi, d } = ctx;
  const skin = col.skin;
  const lipC = mixHex(skin, kiz ? 0xc4565f : 0xa9625a, kiz ? 0.6 : 0.42);
  const blushC = new THREE.Color().set(mixHex(skin, 0xe0707a, 1));
  const headPiece = sweep(headKeys(kiz), { seg: seg.head, sub: hi ? 2 : 1 });
  sculptFace(headPiece, ctx);
  b.add(headPiece, {
    color: skin, weights: 'head', skin: 1,
    colorFn: (x, y, z, nx, ny, nz, c) => {
      if (ny < -0.45) c.multiplyScalar(0.82); // çene altı gölgesi
      if (z < -0.04) {
        const ax = Math.abs(x);
        const bd = Math.hypot((ax - 0.05) / 0.03, (y - (d.eyeY - 0.035)) / 0.026);
        if (bd < 1) c.lerp(blushC, (kiz ? 0.2 : 0.11) * (1 - bd));
        const ed = Math.hypot((ax - d.eyeX) / 0.03, (y - d.eyeY) / 0.02);
        if (ed < 1) c.multiplyScalar(1 - 0.07 * (1 - ed));
        if (!kiz && y < d.chinY + 0.05 && ax < 0.062) c.multiplyScalar(0.955);
      }
    },
  });
  const fz = (x, y, o = 0) => headFaceZ(kiz, x, y, o) - 0.0 + 0; // yüzeyin z'si (sculpt payı aşağıda)
  const eyeY = d.eyeY;
  const eyeR = kiz ? 1.08 : 1;
  const nAt = (x, y, z, out) => headNormalAt(kiz, x, y, z, out);
  const L = (n) => (hi ? n : Math.max(5, Math.round(n * 0.6)));
  [-1, 1].forEach((s) => {
    const x = s * d.eyeX;
    const sz = fz(x, eyeY);
    const zc = sz + 0.0035;
    const yaw = s * 0.18;
    const rxE = 0.0145 * eyeR;
    const ryE = 0.0128 * eyeR;
    // --- göz küresi
    b.add(ellipsoid(rxE, ryE, 0.0115, { seg: L(12), rings: L(8) }), {
      mesh: 'gloss', color: 0xf1ece6, weights: 'head', xf: { pos: [x, eyeY, zc], rot: [0, yaw, 0] },
      colorFn: (px, py, pz, nx, ny, nz, c) => { if (Math.abs(px - x) > rxE * 0.75) c.multiplyScalar(0.9); },
    });
    // --- iris + göz bebeği + parıltı
    const ir = 0.0098 * eyeR;
    b.add(ellipsoid(ir, ir, 0.0028, { seg: L(12), rings: 3 }), {
      mesh: 'gloss', color: col.iris, weights: 'head', xf: { pos: [x + s * 0.0006, eyeY - 0.0004, zc - 0.0108], rot: [0, yaw * 0.5, 0] },
      colorFn: (px, py, pz, nx, ny, nz, c) => {
        const r = Math.hypot(px - x, py - eyeY) / ir;
        c.multiplyScalar(0.75 + 0.5 * Math.min(1, r)); // merkez koyu halka, kenar açık
        if (py > eyeY + ir * 0.35) c.multiplyScalar(0.8);
      },
    });
    b.add(ellipsoid(ir * 0.47, ir * 0.47, 0.0016, { seg: L(8), rings: 3 }), {
      mesh: 'gloss', color: 0x0b0a0c, weights: 'head', xf: { pos: [x + s * 0.0006, eyeY - 0.0004, zc - 0.0123], rot: [0, yaw * 0.5, 0] },
    });
    b.add(ellipsoid(0.0024, 0.0024, 0.0012, { seg: 6, rings: 4 }), {
      mesh: 'glow', color: 0xffffff, weights: 'head', xf: { pos: [x + s * 0.0006 + 0.003, eyeY + 0.0031, zc - 0.0128] },
    });
    b.add(ellipsoid(0.0012, 0.0012, 0.0008, { seg: 5, rings: 3 }), {
      mesh: 'glow', color: 0xdfe8ff, weights: 'head', xf: { pos: [x + s * 0.0006 - 0.0026, eyeY - 0.0028, zc - 0.0126] },
    });
    // --- göz kapakları: küre kabuğunun üst/alt kısmı (y düzlemine kırpılmış)
    const lidTone = shade(skin, 0.95);
    if (hi) {
      b.add(ellipsoid(rxE * 1.07, ryE * 1.1, 0.0123, {
        seg: 10, rings: 6, deform: (px, py, pz, out) => { out[1] = Math.max(py, ryE * 0.52); },
      }), { color: lidTone, weights: 'head', skin: 1, xf: { pos: [x, eyeY, zc], rot: [0, yaw, s * 0.06] } });
      b.add(ellipsoid(rxE * 1.05, ryE * 1.06, 0.0121, {
        seg: 10, rings: 5, deform: (px, py, pz, out) => { out[1] = Math.min(py, -ryE * 0.8); },
      }), { color: skin, weights: 'head', skin: 1, xf: { pos: [x, eyeY, zc], rot: [0, yaw, 0] } });
    }
    // kirpik hattı
    const lashBoost = kiz ? 1.5 : 1;
    const up = [-1, -0.5, 0, 0.5, 1].map((u) => {
      const xx = x + u * rxE * 1.02;
      const yy = eyeY + ryE * 0.5 + (1 - u * u) * 0.0016 - (u * s > 0.6 ? 0.0 : 0);
      return [xx, yy, zc - 0.0118 * Math.sqrt(Math.max(0.05, 1 - u * u * 0.8)) - 0.0003];
    });
    b.add(tube(up, (t) => (0.0017 + Math.sin(t * Math.PI) * 0.0011) * lashBoost, { seg: 5, cap: 'round' }), {
      color: shade(col.hair, 0.5), weights: 'head', mesh: 'hair',
    });
    if (kiz) {
      const wing = [
        [x + s * rxE * 1.0, eyeY + 0.0042, zc - 0.0105],
        [x + s * (rxE + 0.0055), eyeY + 0.0075, zc - 0.0085],
        [x + s * (rxE + 0.0098), eyeY + 0.0112, zc - 0.0045],
      ];
      b.add(tube(wing, (t) => 0.0017 - t * 0.0009, { seg: 4, cap: 'round' }), { color: shade(col.hair, 0.45), weights: 'head', mesh: 'hair' });
    }
    // --- kaş (yüzeye yatık şerit)
    const bx = (u) => x + s * (u - 0.022);
    const by = eyeY + 0.0265;
    const arch = kiz ? 0.0105 : 0.0055;
    const browPts = [
      [bx(-0.004), by - 0.0015], [bx(0.012), by + arch * 0.55], [bx(0.03), by + arch], [bx(0.048), by + arch * 0.25 - 0.003],
    ].map((p) => [p[0], p[1], fz(p[0], p[1]) - 0.0036]);
    b.add(tube(browPts, (t) => (kiz ? 0.0038 : 0.0050) * (1 - t * 0.6) + 0.0004, { seg: 5, cap: 'round', normalAt: nAt, flat: 0.42 }), {
      color: shade(col.hair, kiz ? 0.95 : 0.9), weights: 'head', mesh: 'hair',
    });
    // --- kulak
    const ez = (headFaceZ(kiz, 0, eyeY) + headBackZ(kiz, 0, eyeY)) / 2 + 0.014;
    const ex = s * (headSection(kiz, eyeY).rx - 0.001);
    b.add(E(ctx, 0.0075, 0.0255, 0.0165, 2), { color: skin, weights: 'head', skin: 1, xf: { pos: [ex, eyeY - 0.004, ez], rot: [0.05, s * 0.22, s * 0.04] } });
    if (hi) b.add(E(ctx, 0.0042, 0.016, 0.009, 0), { color: shade(mixHex(skin, 0xc86a64, 0.35), 0.9), weights: 'head', skin: 1, xf: { pos: [ex + s * 0.0035, eyeY - 0.003, ez - 0.0015], rot: [0.05, s * 0.22, s * 0.04] } });
    if (hi) b.add(E(ctx, 0.006, 0.0075, 0.0085, 0), { color: skin, weights: 'head', skin: 1, xf: { pos: [ex, eyeY - 0.027, ez + 0.002] } });
  });
  // --- burun: sırt, uç, kanatlar, delikler (aynı ten; yumuşak birleşim)
  const ny = eyeY - 0.03;
  const nzTip = fz(0, ny - 0.002) - 0.0245;
  const bridge = [
    [0, eyeY + 0.004, fz(0, eyeY + 0.004) - 0.0005],
    [0, eyeY - 0.01, fz(0, eyeY - 0.01) - 0.0092],
    [0, ny, nzTip + 0.0035],
  ];
  b.add(tube(bridge, (t) => 0.0048 + t * t * 0.0034, { seg: L(10), cap: 'round' }), { color: skin, weights: 'head', skin: 1 });
  b.add(ellipsoid(0.0092, 0.0078, 0.0092, { seg: L(12), rings: L(7) }), {
    color: skin, weights: 'head', skin: 1, xf: { pos: [0, ny - 0.0016, nzTip + 0.0022] },
  });
  [-1, 1].forEach((s) => {
    b.add(ellipsoid(0.0058, 0.0062, 0.0066, { seg: L(8), rings: L(5) }), {
      color: skin, weights: 'head', skin: 1, xf: { pos: [s * 0.0092, ny - 0.0046, nzTip + 0.0092], rot: [0, s * 0.2, 0] },
    });
    b.add(ellipsoid(0.0034, 0.0024, 0.0036, { seg: 6, rings: 4 }), {
      color: shade(skin, 0.42), weights: 'head', xf: { pos: [s * 0.0058, ny - 0.0082, nzTip + 0.0042] },
    });
  });
  // --- dudaklar
  const mY = d.chinY + 0.043;
  const mz = fz(0, mY);
  b.add(ellipsoid(0.0215, 0.0046, 0.0082, { seg: L(14), rings: L(7) }), {
    mesh: 'gloss', color: shade(lipC, 0.97), weights: 'head', xf: { pos: [0, mY + 0.0044, mz - 0.0022] },
  });
  b.add(ellipsoid(0.0198, 0.0068, 0.0088, { seg: L(14), rings: L(7) }), {
    mesh: 'gloss', color: shade(lipC, 1.1), weights: 'head', xf: { pos: [0, mY - 0.0058, mz - 0.0018] },
  });
  const mouth = [-1, -0.5, 0, 0.5, 1].map((u) => {
    const xx = u * 0.0196;
    const yy = mY - 0.0004 + (Math.abs(u) > 0.7 ? 0.0011 : 0) - (kiz ? 0 : 0.0003);
    return [xx, yy, fz(xx, yy) - 0.0044];
  });
  b.add(tube(mouth, 0.0011, { seg: 4, cap: 'round' }), { color: shade(lipC, 0.5), weights: 'head' });
}
