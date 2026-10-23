/*
 * KEŞİF render — düşman modelleri: gölge, kemikçi, kum akrebi, buz hortlağı, kristal böceği, lav slime, taş yarasası.
 * Şiddet çizgi-film düzeyindedir: gözler parlar, kan yok; ölünce çözülme çekirdekte (mobModels.js) işlenir.
 * Her kurucu (rig, def) → anim(s, dt).
 */
import {
  TAU, clamp, damp, hash1, lerp, lerpHex, makeLimb, swingLimb,
} from './mobGeo.js';

/* ================================================================================================
 * GÖLGE — ince, kamburca, mor-siyah duman gövdeli insansı; parlayan gözler, süzülen dumanlar.
 * ============================================================================================== */
function golge(rig) {
  rig.root.scale.setScalar(0.93);
  rig.stride = 5.5;
  rig.attackDur = 1.0;
  rig.glowColor = 0x9a6bff;
  rig.deathColor = 0x8a5cff;
  rig.baseEmissive('lit', 0x1c0a38);
  const SK = { a: 0x3a2c5e, b: 0x1a1434 };
  const hips = rig.part('hips', null, [0, 0.92, 0], (b) => {
    b.ellipsoid(0.15, 0.1, 0.1, { p: [0, 0.0, 0], c: SK.a, c2: SK.b });
  });
  const torso = rig.part('torso', hips, [0, 0.04, 0], (b, g) => {
    b.ellipsoid(0.13, 0.2, 0.1, { p: [0, 0.14, 0], c: SK.a, c2: SK.b });
    b.ellipsoid(0.21, 0.26, 0.14, { p: [0, 0.4, 0.01], c: SK.a, c2: SK.b });
    b.ellipsoid(0.1, 0.1, 0.08, { p: [0, 0.6, 0.0], c: SK.a, c2: SK.b });
    // sırttan duman dikenleri
    for (let i = 0; i < 4; i++) {
      b.spike([0, 0.2 + i * 0.13, 0.1], [0, 0.26 + i * 0.13, 0.26 - i * 0.02], 0.045 - i * 0.006, { c: SK.a, w: 6 });
    }
    // göğüste donuk mor çatlak
    g.limb([0, 0.28, -0.135], [0, 0.5, -0.145], 0.006, 0.004, { c: 0x9a6bff, i: 1.1, cap: 2, w: 4 });
  });
  const head = rig.part('head', torso, [0, 0.64, 0], (b, g) => {
    b.ellipsoid(0.125, 0.15, 0.135, { p: [0, 0.16, -0.015], c: SK.a, c2: SK.b, w: 14, h: 10 });
    b.ellipsoid(0.1, 0.1, 0.05, { p: [0, 0.14, -0.1], c: 0x07050e, w: 10, h: 7, ao: 0, noise: 0 });
    for (const sx of [-1, 1]) {
      g.ellipsoid(0.04, 0.016, 0.014, { p: [sx * 0.05, 0.17, -0.138], rot: [0, 0, sx * -0.35], c: 0xd8c8ff, i: 2.6, w: 8, h: 5 });
      // geriye süpürülmüş boynuz
      b.tube([[sx * 0.07, 0.27, -0.01], [sx * 0.1, 0.38, 0.03], [sx * 0.13, 0.46, 0.12]], [0.028, 0.018, 0.006], { c: SK.a, c2: 0x3a2d5c, w: 6 });
    }
  });
  const arms = [-1, 1].map((sx) => {
    const up = rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.23, 0.5, 0.0], (b) => {
      b.ellipsoid(0.06, 0.06, 0.06, { c: SK.a, w: 8, h: 6 });
      b.limb([0, 0, 0], [0, -0.34, 0], 0.045, 0.038, { c: SK.a, c2: SK.b, cap: 3, w: 8 });
    }, { pk: 'armU' });
    const fore = rig.part(sx < 0 ? 'foreL' : 'foreR', up, [0, -0.34, 0], (b) => {
      b.limb([0, 0, 0], [0, -0.38, 0], 0.036, 0.026, { c: SK.a, c2: SK.b, cap: 3, w: 8 });
      b.ellipsoid(0.04, 0.05, 0.03, { p: [0, -0.4, 0], c: SK.b, w: 8, h: 6 });
      for (let k = -1; k <= 1; k++) b.spike([k * 0.02, -0.43, 0], [k * 0.03, -0.56, -0.02], 0.012, { c: 0x3a2d5c, w: 5, mid: 1 });
    }, { pk: 'foreArm' });
    return { up, fore };
  });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.09, -0.04, 0], 0.44,
    (b) => { b.limb([0, 0, 0], [0, -0.44, 0], 0.062, 0.045, { c: SK.a, c2: SK.b, cap: 3, w: 8 }); },
    (b) => {
      b.limb([0, 0, 0], [0, -0.42, 0], 0.045, 0.03, { c: SK.a, c2: SK.b, cap: 3, w: 8 });
      b.spike([0, -0.42, 0.02], [0, -0.45, -0.18], 0.032, { c: SK.b, s: [1, 0.6, 1], w: 6 });
    },
    { pkUpper: 'legU', pkLower: 'legLo' },
  ));
  const tends = [];
  for (let i = 0; i < 4; i++) {
    const t = rig.tendril(torso, {
      segments: 8, radius: (u) => 0.05 * (1 - u) + 0.008, color0: 0x2e2350, color1: 0x8a5cff, seed: i, length: 0.5,
    });
    tends.push({ t, ax: (i < 2 ? -1 : 1) * (0.1 + (i % 2) * 0.09), ay: 0.52 - (i % 2) * 0.16, az: 0.12 });
  }
  const wisps = rig.part('wisps', torso, [0, 0.4, 0], (b, g) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const r = 0.34 + (i % 2) * 0.08;
      const p = [Math.cos(a) * r, -0.1 + (i % 3) * 0.16, Math.sin(a) * r];
      g.ellipsoid(0.04, 0.12, 0.04, { p, rot: [0.2, 0, 0.3], c: 0x8a5cff, i: 1.1, w: 8, h: 6 });
    }
  });

  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    hips.position.y = 0.92 + Math.abs(Math.sin(w)) * 0.03 * m + Math.sin(s.t * 1.4) * 0.008;
    swingLimb(legs[0], w, 0.6 * m, 0.9, -1);
    swingLimb(legs[1], w + Math.PI, 0.6 * m, 0.9, -1);
    torso.rotation.x = -0.14 - 0.06 * m + s.wind * 0.35 - s.hit * 0.55;
    torso.rotation.y = Math.sin(w) * 0.08 * m;
    torso.rotation.z = Math.sin(s.t * 0.9) * 0.025;
    head.rotation.y = s.headYaw * 0.9;
    head.rotation.x = 0.12 + s.headPitch * 0.5 - s.wind * 0.25;
    const swing = Math.sin(w) * 0.5 * m;
    for (let i = 0; i < 2; i++) {
      const dir = i === 0 ? 1 : -1;
      const base = -0.12 + dir * swing + Math.sin(s.t * 1.1 + i) * 0.04;
      arms[i].up.rotation.x = base - s.wind * 1.15 + s.hit * 2.9;
      arms[i].up.rotation.z = (i === 0 ? 1 : -1) * (0.08 + s.hit * 0.25);
      arms[i].fore.rotation.x = -0.25 - s.wind * 0.3 + s.hit * 0.6 + Math.sin(s.t * 1.7 + i * 2) * 0.05;
    }
    const calm = s.reduced ? 0.3 : 1;
    for (let i = 0; i < tends.length; i++) {
      const T = tends[i];
      for (let j = 0; j <= 8; j++) {
        const u = j / 8;
        const ph = s.t * 1.7 * calm + i * 1.9 - u * 3.2;
        T.t.set(j, T.ax + Math.sin(ph) * 0.07 * u * (0.6 + m), T.ay - u * 0.62 + Math.cos(ph * 0.7) * 0.03 * u, T.az + u * (0.12 + 0.3 * m) + Math.sin(ph + 1) * 0.05 * u);
      }
      T.t.refresh();
    }
    wisps.rotation.y = s.t * (s.reduced ? 0.3 : 0.7);
    wisps.position.y = 0.4 + Math.sin(s.t * 1.2) * 0.04;
    rig.mats.glow.userData.k = 0.85 + 0.15 * Math.sin(s.t * 1.7) + s.hit * 0.8;
  };
}

/* ================================================================================================
 * KEMİKÇİ — fildişi, yuvarlak hatlı iskelet okçu; yayını çeker, ok atar (IK ile kollar).
 * ============================================================================================== */
function kemikci(rig) {
  const kit = rig.kit;
  const BONE = { a: 0xece6d2, b: 0xcfc6a8, dark: 0x1a1612 };
  rig.stride = 5.2;
  rig.attackDur = 1.5;
  rig.glowColor = 0xffb030;
  rig.deathColor = 0xffe0a0;
  rig.addMat('wood', 'lit', { rough: 0.7 });
  rig.addMat('string', 'glow', {});
  const hips = rig.part('hips', null, [0, 0.9, 0], (b) => {
    b.ellipsoid(0.15, 0.075, 0.085, { c: BONE.a, c2: BONE.b });
    for (const sx of [-1, 1]) b.ellipsoid(0.04, 0.05, 0.04, { p: [sx * 0.09, -0.04, 0], c: BONE.b });
  });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.09, -0.04, 0], 0.44,
    (b) => {
      b.limb([0, 0, 0], [0, -0.44, 0], 0.036, 0.026, { c: BONE.a, c2: BONE.b, cap: 3, w: 8, mid: 1, bulge: 0.15 });
      b.ellipsoid(0.04, 0.04, 0.04, { p: [0, -0.44, 0], c: BONE.b, w: 8, h: 6 });
    },
    (b) => {
      b.limb([0, 0, 0], [0, -0.4, 0], 0.026, 0.02, { c: BONE.a, c2: BONE.b, cap: 3, w: 8, mid: 1, bulge: 0.12 });
      b.ellipsoid(0.035, 0.022, 0.07, { p: [0, -0.41, -0.04], c: BONE.a, w: 8, h: 6 });
    },
    { pkUpper: 'legU', pkLower: 'legLo' },
  ));
  const torso = rig.part('torso', hips, [0, 0.05, 0], (b) => {
    b.limb([0, 0.0, 0.045], [0, 0.55, 0.03], 0.022, 0.02, { c: BONE.a, c2: BONE.b, cap: 3, w: 8 });
    for (let i = 0; i < 6; i++) b.ellipsoid(0.03, 0.02, 0.028, { p: [0, 0.03 + i * 0.09, 0.045 - i * 0.003], c: BONE.b, w: 8, h: 6 });
    const R = [0.1, 0.115, 0.118, 0.105, 0.085];
    for (let i = 0; i < R.length; i++) {
      b.torus(R[i], 0.011, { p: [0, 0.14 + i * 0.075, -0.005], s: [1, 1, 0.78], c: BONE.a, c2: BONE.b, w: 18, m: 6, noise: 0.015 });
    }
    b.limb([0, 0.12, -0.085], [0, 0.42, -0.075], 0.014, 0.012, { c: BONE.a, cap: 3, w: 6 });
    b.limb([-0.2, 0.52, 0.0], [0.2, 0.52, 0.0], 0.017, 0.017, { c: BONE.a, cap: 3, w: 8 });
    b.limb([0, 0.5, 0.02], [0, 0.6, 0.0], 0.02, 0.018, { c: BONE.a, cap: 3, w: 8 });
  });
  const head = rig.part('head', torso, [0, 0.6, 0.0], (b, g) => {
    b.ellipsoid(0.11, 0.115, 0.125, { p: [0, 0.12, -0.01], c: BONE.a, c2: BONE.b, w: 16, h: 11 });
    b.ellipsoid(0.07, 0.04, 0.07, { p: [0, 0.04, -0.07], c: BONE.a, c2: BONE.b, w: 10, h: 6 });
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.034, 0.04, 0.03, { p: [sx * 0.05, 0.13, -0.098], c: BONE.dark, w: 10, h: 7, ao: 0, noise: 0 });
      g.ellipsoid(0.017, 0.02, 0.012, { p: [sx * 0.05, 0.13, -0.116], c: 0xffb030, i: 2.4, w: 8, h: 6 });
    }
    b.ellipsoid(0.012, 0.02, 0.01, { p: [0, 0.08, -0.128], c: BONE.dark, w: 6, h: 5, ao: 0, noise: 0 });
  });
  const jaw = rig.part('jaw', head, [0, 0.05, -0.03], (b) => {
    b.ellipsoid(0.075, 0.028, 0.085, { p: [0, -0.015, -0.045], c: BONE.a, c2: BONE.b, w: 12, h: 6 });
    for (let i = -2; i <= 2; i++) b.spike([i * 0.025, 0.005, -0.1 + Math.abs(i) * 0.012], [i * 0.025, 0.03, -0.1 + Math.abs(i) * 0.012], 0.009, { c: 0xfffaf0, w: 4 });
  });
  const L1 = 0.28;
  const L2 = 0.27;
  const armU = [-1, 1].map((sx) => rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.2, 0.5, 0], (b) => {
    b.ellipsoid(0.04, 0.04, 0.04, { c: BONE.b, w: 8, h: 6 });
    b.limb([0, 0, 0], [0, -L1, 0], 0.025, 0.02, { c: BONE.a, c2: BONE.b, cap: 3, w: 8, mid: 1, bulge: 0.1 });
  }, { pk: 'armU' }));
  const armF = [0, 1].map((i) => rig.part(i === 0 ? 'foreL' : 'foreR', armU[i], [0, -L1, 0], (b) => {
    b.ellipsoid(0.03, 0.03, 0.03, { c: BONE.b, w: 8, h: 6 });
    b.limb([0, 0, 0], [0, -L2, 0], 0.02, 0.016, { c: BONE.a, c2: BONE.b, cap: 3, w: 8, mid: 1, bulge: 0.1 });
    b.ellipsoid(0.026, 0.04, 0.02, { p: [0, -L2 - 0.03, 0], c: BONE.a, w: 8, h: 6 });
    for (let k = -1; k <= 1; k++) b.spike([k * 0.014, -L2 - 0.06, 0], [k * 0.016, -L2 - 0.12, -0.008], 0.007, { c: BONE.a, w: 4 });
  }, { pk: 'foreArm' }));
  // yay (gövdeye bağlı; kollar ona uzanır). Yerel: sap orijinde, uçlar +Z'ye kıvrık.
  const bow = rig.part('bow', torso, [-0.22, 0.22, -0.06], (b) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const y = -0.46 + (i / 8) * 0.92;
      pts.push([0, y, 0.13 * (y / 0.46) * (y / 0.46)]);
    }
    b.tube(pts, [0.012, 0.02, 0.026, 0.02, 0.014, 0.02, 0.026, 0.02, 0.012], { c: 0x8a5a30, c2: 0x6a4222, w: 6 });
    b.ellipsoid(0.026, 0.06, 0.03, { p: [0, 0, 0.0], c: 0x3a2a1c, w: 8, h: 6 });
  }, { mats: ['wood', 'glow', 'wood'] });
  const strU = rig.part('strU', bow, [0, 0.46, 0.13], (b, g) => {
    g.limb([0, 0, 0], [0, -0.46, 0], 0.003, 0.003, { c: 0xe8e0c8, i: 0.8, cap: 2, w: 4 });
  });
  const strL = rig.part('strL', bow, [0, -0.46, 0.13], (b, g) => {
    g.limb([0, 0, 0], [0, 0.46, 0], 0.003, 0.003, { c: 0xe8e0c8, i: 0.8, cap: 2, w: 4 });
  });
  const arrow = rig.part('arrow', bow, [0, 0, 0.13], (b, g) => {
    b.limb([0, 0, 0], [0, 0, -0.78], 0.008, 0.008, { c: 0xb59a6a, cap: 2, w: 5, ao: 0 });
    b.spike([0, 0, -0.78], [0, 0, -0.9], 0.02, { c: 0xcfd2d6, w: 5 });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      b.ellipsoid(0.002, 0.026, 0.05, { p: [Math.cos(a) * 0.02, Math.sin(a) * 0.02, -0.05], rot: [0, 0, a], c: 0xc83a2a, w: 5, h: 4, ao: 0 });
    }
    g.ellipsoid(0.01, 0.01, 0.01, { p: [0, 0, -0.9], c: 0xffd070, i: 1.2, w: 5, h: 4 });
  }, { keep: true }); // ok düğümü görünürlükle açılıp kapanır → birleşmez

  let aimW = 0;
  let shotN = -1;
  const POLE = [[-1, -0.2, 0.3], [1, 0.1, 0.8]];
  function reach(i, tx, ty, tz) {
    const ik = kit.ik2(L1, L2, i === 0 ? -0.2 : 0.2, 0.5, 0, tx, ty, tz, POLE[i][0], POLE[i][1], POLE[i][2]);
    armU[i].quaternion.copy(ik.qU);
    armF[i].quaternion.copy(ik.qF);
  }

  return (s, dt) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    hips.position.y = 0.9 + Math.abs(Math.sin(w)) * 0.025 * m + Math.sin(s.t * 1.3) * 0.004;
    swingLimb(legs[0], w, 0.55 * m, 0.7, -1);
    swingLimb(legs[1], w + Math.PI, 0.55 * m, 0.7, -1);
    torso.rotation.z = Math.sin(w) * 0.04 * m;
    torso.rotation.x = -0.04 * m;
    head.rotation.y = s.headYaw * 0.8;
    head.rotation.x = s.headPitch * 0.5;
    // nişan hazırlığı: yay öne kalkar, kiriş gerilir
    const want = s.attack > 0 || s.attacking ? 1 : 0;
    aimW = damp(aimW, want, 9, dt);
    const drawing = s.attacking || s.attack > 0;
    const draw = drawing ? s.wind : 0;
    const d = 0.42 * draw;
    const sw = Math.sin(w) * 0.1 * m;
    const bx = lerp(-0.22, -0.18, aimW);
    const by = lerp(0.22, 0.52, aimW);
    const bz = lerp(-0.06 + sw, -0.6, aimW);
    bow.position.set(bx, by, bz);
    bow.rotation.set(lerp(0.1, 0, aimW), 0, lerp(0.12, 0, aimW));
    reach(0, bx, by, bz);
    reach(1, lerp(0.24, bx, aimW), lerp(0.2, by, aimW), lerp(-sw, bz + 0.13 + d, aimW));
    const dd = Math.max(0, d - 0.03 * s.hit);
    const ang = Math.atan2(dd, 0.46);
    const len = Math.hypot(0.46, dd) / 0.46;
    strU.rotation.x = -ang;
    strU.scale.y = len;
    strL.rotation.x = ang;
    strL.scale.y = len;
    arrow.position.z = 0.13 + dd;
    arrow.visible = aimW > 0.5 && s.attack > 0.02 && s.attack < 0.52;
    jaw.rotation.x = -0.12 - draw * 0.25 - Math.max(0, Math.sin(s.t * 0.7)) * 0.04;
    if (s.attackN !== shotN && s.attack >= 0.5 && s.attack < 0.7) {
      shotN = s.attackN;
      rig.cue('shoot', bx, by + 0.95, bz - 0.6);
    }
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.1) + draw * 0.5;
  };
}

/* ================================================================================================
 * KUM AKREBİ — kum rengi kabuk, kıvrık kuyruk ve parlayan iğne, kıskaçlar, 8 bacak.
 * ============================================================================================== */
function kumakrebi(rig) {
  const SH = { a: 0xd2a45e, b: 0xa27a3c, dark: 0x6e4f26 };
  const M3 = ['shell', 'glow', 'shell'];
  rig.stride = 7;
  rig.attackDur = 0.9;
  rig.glowColor = 0xffb02a;
  rig.deathColor = 0xffc85a;
  rig.addMat('shell', 'lit', { rough: 0.45, metal: 0.15 });
  const plate = (x, y, z, nx, ny) => (ny > 0.2 && Math.sin(z * 34) > 0.55 ? SH.b : SH.a);
  const body = rig.part('body', null, [0, 0.27, 0.05], (b, g) => {
    b.ellipsoid(0.26, 0.14, 0.3, { p: [0, 0, 0], c: SH.a, c2: SH.b, cfn: plate, w: 20, h: 12 });
    b.ellipsoid(0.17, 0.095, 0.14, { p: [0, -0.015, -0.33], c: SH.a, c2: SH.b, w: 12, h: 8 });
    for (let i = 0; i < 3; i++) b.ellipsoid(0.2 - i * 0.02, 0.1 - i * 0.008, 0.07, { p: [0, 0.0, 0.26 + i * 0.1], c: SH.a, c2: SH.b, cfn: plate, w: 12, h: 8 });
    for (const sx of [-1, 1]) {
      g.ellipsoid(0.02, 0.016, 0.012, { p: [sx * 0.05, 0.05, -0.43], c: 0xff5a2a, i: 2.2, w: 6, h: 5 });
      g.ellipsoid(0.012, 0.01, 0.01, { p: [sx * 0.12, 0.03, -0.38], c: 0xff5a2a, i: 1.8, w: 6, h: 5 });
      b.spike([sx * 0.07, 0.07, -0.3], [sx * 0.11, 0.17, -0.38], 0.03, { c: SH.dark, w: 6 });
    }
  }, { mats: M3 });
  // kuyruk: 6 halka, yukarı ve öne kıvrılır
  const TL = 6;
  const tail = [];
  let par = body;
  for (let i = 0; i < TL; i++) {
    const last = i === TL - 1;
    par = rig.part('tail' + i, par, i === 0 ? [0, 0.04, 0.44] : [0, 0, 0.11], (b, g) => {
      const r = 0.075 - i * 0.008;
      b.limb([0, 0, 0], [0, 0, 0.12], r, r - 0.007, { c: SH.a, c2: SH.b, cap: 3, w: 10 });
      b.ellipsoid(r * 1.06, r * 1.06, 0.04, { p: [0, 0, 0.04], c: SH.b, w: 10, h: 6 });
      if (last) {
        b.ellipsoid(0.075, 0.075, 0.09, { p: [0, 0, 0.11], c: SH.dark, w: 10, h: 8 });
        g.spike([0, 0.0, 0.16], [0, 0.0, 0.3], 0.035, { c: 0xffb02a, i: 2.2, w: 7, mid: 1 });
      }
    }, { pk: 'tail' + i, mats: M3 });
    tail.push(par);
  }
  // kıskaçlar
  const claws = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const up = rig.part('clawU' + tag, body, [sx * 0.18, -0.01, -0.3], (b) => {
      b.limb([0, 0, 0], [sx * 0.12, 0.0, -0.2], 0.04, 0.035, { c: SH.a, c2: SH.b, cap: 3, w: 8 });
    }, { pk: 'clawU' + tag, mats: M3 });
    const fore = rig.part('clawF' + tag, up, [sx * 0.12, 0, -0.2], (b) => {
      b.limb([0, 0, 0], [sx * 0.04, 0, -0.16], 0.035, 0.05, { c: SH.a, c2: SH.b, cap: 3, w: 8 });
      b.ellipsoid(0.06, 0.035, 0.1, { p: [sx * 0.05, 0, -0.24], c: SH.a, c2: SH.b, w: 12, h: 8 });
    }, { pk: 'clawF' + tag, mats: M3 });
    const jaw = rig.part('clawJ' + tag, fore, [sx * 0.05, 0, -0.3], (b) => {
      b.ellipsoid(0.028, 0.025, 0.1, { p: [sx * -0.025, 0, -0.06], rot: [0, sx * 0.25, 0], c: SH.b, c2: SH.dark, w: 10, h: 6 });
      b.spike([sx * -0.02, 0, -0.14], [sx * -0.035, 0, -0.2], 0.022, { c: SH.dark, w: 6 });
    }, { pk: 'clawJ' + tag, mats: M3 });
    return { up, fore, jaw, sx };
  });
  // 8 bacak (yanlarda 4'er)
  const legs = [];
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) {
      const tag = sx < 0 ? 'L' : 'R';
      const z = -0.15 + i * 0.14;
      const up = rig.part('leg' + i + tag, body, [sx * 0.2, -0.05, z], (b) => {
        b.limb([0, 0, 0], [sx * 0.18, 0.1, 0], 0.028, 0.024, { c: SH.b, c2: SH.a, cap: 3, w: 7 });
      }, { pk: 'legU' + tag, mats: M3 });
      const lo = rig.part('legLo' + i + tag, up, [sx * 0.18, 0.1, 0], (b) => {
        b.limb([0, 0, 0], [sx * 0.1, -0.36, 0], 0.024, 0.014, { c: SH.b, c2: SH.dark, cap: 3, w: 7 });
      }, { pk: 'legLo' + tag, mats: M3 });
      legs.push({ up, lo, i, sx });
    }
  }
  const BASE = [-0.55, -1.05, -1.5, -1.95, -2.35, -2.65];
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    body.position.y = 0.27 + Math.abs(Math.sin(w * 2)) * 0.012 * m + Math.sin(s.t * 1.6) * 0.004;
    body.rotation.x = s.wind * 0.12 - s.hit * 0.1;
    for (let k = 0; k < legs.length; k++) {
      const L = legs[k];
      const ph = w + (L.i % 2) * Math.PI + (L.sx < 0 ? Math.PI : 0) + L.i * 0.5;
      L.up.rotation.y = L.sx * Math.sin(ph) * 0.45 * m - (L.i - 1.5) * 0.18 * L.sx;
      L.lo.rotation.z = -L.sx * Math.max(0, Math.cos(ph)) * 0.5 * m;
    }
    // kuyruk: dinlenmede hafif sallanır, saldırıda önce kıvrılır sonra öne fırlar
    for (let i = 0; i < TL; i++) {
      const sway = Math.sin(s.t * 1.1 - i * 0.5) * 0.04;
      const coil = 1 + s.wind * 0.22 - s.hit * 0.62;
      tail[i].rotation.x = BASE[i] * coil + sway;
      tail[i].rotation.y = s.headYaw * 0.15 * (i / TL);
    }
    for (let i = 0; i < 2; i++) {
      const c = claws[i];
      c.up.rotation.y = c.sx * (-0.2 - s.wind * 0.25 + s.hit * 0.4) + Math.sin(w + i * Math.PI) * 0.12 * m;
      c.fore.rotation.y = c.sx * (0.15 - s.hit * 0.3);
      c.jaw.rotation.y = c.sx * (0.18 + (s.attack > 0 ? 0.5 * s.wind - 0.5 * s.hit : Math.max(0, Math.sin(s.t * 0.9 + i)) * 0.08));
    }
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.3) + s.hit * 0.9;
  };
}

/* ================================================================================================
 * BUZ HORTLAĞI — süzülen kapüşonlu buz hayaleti; kristal taçlı, dönen buz kıymıkları.
 * ============================================================================================== */
function buzhortlagi(rig) {
  const IC = { a: 0xbfe6f8, b: 0x5a9cc4, dark: 0x1c3a58 };
  const M3 = ['ice', 'glow', 'crystal'];
  rig.stride = 4;
  rig.attackDur = 1.1;
  rig.glowColor = 0xbff4ff;
  rig.deathColor = 0xbff4ff;
  rig.addMat('ice', 'lit', { rough: 0.16, metal: 0.08, opacity: 0.9, emissive: 0x0b2a3c });
  rig.addMat('crystal', 'lit', { rough: 0.12, metal: 0.1, emissive: 0x1a5a78 });
  const hover = rig.node('hover', null, [0, 0.3, 0]);
  const torso = rig.part('torso', hover, [0, 0.95, 0], (b, g, x) => {
    b.ellipsoid(0.2, 0.26, 0.14, { p: [0, 0.18, 0], c: IC.a, c2: IC.b, w: 16, h: 11 });
    b.ellipsoid(0.15, 0.2, 0.11, { p: [0, -0.04, 0], c: IC.b, c2: IC.dark, w: 14, h: 9 });
    g.ellipsoid(0.09, 0.11, 0.06, { p: [0, 0.2, -0.02], c: 0x6fe3ff, i: 1.5, w: 10, h: 7 });
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.09, 0.07, 0.09, { p: [sx * 0.2, 0.36, 0], c: IC.a, w: 10, h: 7 });
      x.crystal(0.26, 0.05, { p: [sx * 0.22, 0.4, 0.0], rot: [0, 0, sx * -0.9], c: 0xe4f8ff, c2: 0x8cd4f0 });
      x.crystal(0.18, 0.04, { p: [sx * 0.26, 0.36, 0.04], rot: [0.5, 0, sx * -1.3], c: 0xe4f8ff, c2: 0x8cd4f0 });
    }
  }, { mats: M3 });
  const head = rig.part('head', torso, [0, 0.45, 0], (b, g, x) => {
    b.ellipsoid(0.15, 0.17, 0.16, { p: [0, 0.12, 0], c: IC.b, c2: IC.dark, w: 14, h: 10 });
    b.spike([0, 0.18, 0.12], [0, 0.06, 0.4], 0.12, { c: IC.b, c2: IC.dark, s: [1, 0.8, 1], w: 10, mid: 1 });
    b.ellipsoid(0.1, 0.12, 0.07, { p: [0, 0.1, -0.1], c: 0x06121e, w: 10, h: 8, ao: 0, noise: 0 });
    for (const sx of [-1, 1]) g.ellipsoid(0.04, 0.014, 0.012, { p: [sx * 0.05, 0.13, -0.152], rot: [0, 0, sx * -0.3], c: 0xd8fbff, i: 2.8, w: 8, h: 5 });
    const R = rig.level === 0 ? 4 : 6;
    for (let i = 0; i < R; i++) {
      const a = (i / R) * TAU;
      const h = 0.2 + (i % 2) * 0.08;
      x.crystal(h, 0.035, { p: [Math.cos(a) * 0.1, 0.25, Math.sin(a) * 0.1], rot: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], c: 0xe4f8ff, c2: 0x8cd4f0 });
    }
  }, { mats: M3 });
  const arms = [-1, 1].map((sx) => {
    const up = rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.24, 0.34, 0], (b) => {
      b.limb([0, 0, 0], [0, -0.34, 0], 0.045, 0.034, { c: IC.a, c2: IC.b, cap: 3, w: 8 });
    }, { pk: 'armU', mats: M3 });
    const fore = rig.part(sx < 0 ? 'foreL' : 'foreR', up, [0, -0.34, 0], (b, g, x) => {
      b.limb([0, 0, 0], [0, -0.36, 0], 0.034, 0.024, { c: IC.a, c2: IC.b, cap: 3, w: 8 });
      for (let k = -1; k <= 1; k++) x.crystal(0.2, 0.014, { p: [k * 0.025, -0.36, -0.01], rot: [Math.PI + 0.1, 0, k * 0.15], c: 0xe4f8ff, c2: 0x8cd4f0 });
    }, { pk: 'foreArm', mats: M3 });
    return { up, fore };
  });
  // kuyruk (alt gövde): 5 halka dalgalanır
  const TLN = 5;
  const tail = [];
  let par = hover;
  for (let i = 0; i < TLN; i++) {
    par = rig.part('tail' + i, par, i === 0 ? [0, 0.9, 0] : [0, -0.2, 0], (b) => {
      const r0 = 0.17 - i * 0.026;
      b.limb([0, 0, 0], [0, -0.2, 0], r0, r0 - 0.026, { c: lerpHex(IC.b, IC.dark, i / TLN), c2: lerpHex(IC.b, IC.dark, (i + 1) / TLN), cap: 3, w: 10 });
    }, { pk: 'tail' + i, mats: M3 });
    tail.push(par);
  }
  const ring = rig.part('ring', hover, [0, 1.15, 0], (b, g, x) => {
    const n = rig.level === 0 ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      x.crystal(0.22 + (i % 2) * 0.05, 0.04, { p: [Math.cos(a) * 0.32, Math.sin(i * 2.1) * 0.12, Math.sin(a) * 0.32], rot: [0.9 * Math.sin(a), 0, -0.9 * Math.cos(a)], c: 0xe4f8ff, c2: 0x8cd4f0 });
    }
  }, { mats: M3 });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    hover.position.y = 0.3 + Math.sin(s.t * 1.6) * 0.07 + m * 0.03;
    hover.rotation.x = -0.1 * m - s.hit * 0.15;
    torso.rotation.x = -0.08 + s.wind * 0.3 - s.hit * 0.4;
    torso.rotation.y = s.headYaw * 0.3;
    head.rotation.y = s.headYaw * 0.7;
    head.rotation.x = s.headPitch * 0.4;
    for (let i = 0; i < 2; i++) {
      arms[i].up.rotation.x = -0.25 + Math.sin(s.t * 1.2 + i * 1.7) * 0.12 - s.wind * 0.9 + s.hit * 2.2;
      arms[i].up.rotation.z = (i === 0 ? 1 : -1) * (0.2 + Math.sin(s.t * 0.9 + i) * 0.05);
      arms[i].fore.rotation.x = -0.35 + s.hit * 0.5;
    }
    const sp = s.reduced ? 0.3 : 1;
    for (let i = 0; i < TLN; i++) {
      tail[i].rotation.z = Math.sin(s.t * 2.1 * sp - i * 0.9) * (0.14 + i * 0.05);
      tail[i].rotation.x = Math.sin(s.t * 1.7 * sp - i * 0.8 + 1) * 0.1 - 0.05 * m;
    }
    ring.rotation.y = s.t * (0.9 + s.wind * 2.5 + s.hit * 3) * sp;
    ring.scale.setScalar(1 + s.hit * 0.6);
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 1.9) + s.hit * 0.8;
  };
}

/* ================================================================================================
 * KRİSTAL BÖCEĞİ — metalik çivit kabuk, sırtında parlayan kristaller, kıskaçlı çeneler.
 * ============================================================================================== */
function kristalbocegi(rig) {
  const SH = { a: 0x5a52b4, b: 0x2a2860, rim: 0x8a82e0 };
  const M3 = ['shell', 'glow', 'shell'];
  rig.stride = 7;
  rig.attackDur = 1.0;
  rig.glowColor = 0x6fe8ff;
  rig.deathColor = 0xc08cff;
  rig.addMat('shell', 'lit', { rough: 0.28, metal: 0.55 });
  rig.addMat('crystal', 'lit', { rough: 0.15, metal: 0.1, emissive: 0x4a1fa8 });
  const body = rig.part('body', null, [0, 0.28, 0.02], (b) => {
    b.ellipsoid(0.34, 0.15, 0.44, { p: [0, 0.0, 0.02], c: SH.b, c2: SH.b, w: 18, h: 10 });
  }, { mats: M3 });
  const shell = rig.part('shell', body, [0, 0.04, 0.04], (b) => {
    b.ellipsoid(0.44, 0.3, 0.52, {
      p: [0, 0.06, 0], c: SH.rim, c2: SH.a, w: 22, h: 14, e: [0.85, 0.9],
      cfn: (x, y, z, nx, ny) => (Math.abs(x) < 0.02 && ny > 0.1 ? 0x0c0c26 : (ny > 0.55 ? SH.rim : SH.a)),
    });
  }, { mats: M3 });
  const crystals = rig.part('crystals', shell, [0, 0.33, 0.05], (b, g, x) => {
    const spec = [
      [0.0, 0.0, 0.0, 0.5, 0.085, 0, 0], [0.17, -0.02, 0.12, 0.38, 0.07, -0.35, -0.3], [-0.17, -0.02, 0.1, 0.42, 0.072, 0.4, -0.25],
      [0.12, -0.04, -0.16, 0.32, 0.06, -0.3, 0.35], [-0.12, -0.04, -0.18, 0.3, 0.06, 0.3, 0.3], [0.0, -0.05, 0.27, 0.28, 0.055, 0, -0.6],
      [0.28, -0.12, -0.02, 0.26, 0.05, -0.9, 0.0], [-0.28, -0.12, -0.02, 0.26, 0.05, 0.9, 0.0],
    ];
    const n = rig.level === 0 ? 5 : spec.length;
    for (let i = 0; i < n; i++) {
      const c = spec[i];
      const tone = i % 3;
      x.crystal(c[3] * 0.78, c[4] * 0.9, {
        p: [c[0], c[1], c[2]], rot: [c[6], 0, c[5]], c: [0xd8f6ff, 0xf0c8ff, 0x9af0ff][tone], c2: [0x5ac8ff, 0xb05aff, 0x4a9aff][tone], tip: 0.35,
      });
    }
    g.ellipsoid(0.1, 0.06, 0.1, { p: [0, 0.0, 0.0], c: 0x8a6aff, i: 1.2, w: 8, h: 6 });
  }, { mats: ['shell', 'glow', 'crystal'] });
  const head = rig.part('head', body, [0, 0.02, -0.4], (b, g) => {
    b.ellipsoid(0.2, 0.14, 0.17, { p: [0, 0, -0.02], c: SH.a, c2: SH.b, w: 14, h: 9 });
    for (const sx of [-1, 1]) {
      g.ellipsoid(0.04, 0.045, 0.025, { p: [sx * 0.1, 0.05, -0.17], c: 0xc8fbff, i: 2.4, w: 8, h: 6 });
      g.ellipsoid(0.022, 0.025, 0.014, { p: [sx * 0.16, 0.0, -0.12], c: 0x9a8aff, i: 2.0, w: 6, h: 5 });
      b.tube([[sx * 0.06, 0.1, -0.12], [sx * 0.12, 0.28, -0.2], [sx * 0.2, 0.4, -0.12]], [0.012, 0.009, 0.005], { c: SH.rim, w: 5 });
    }
  }, { mats: M3 });
  const mands = [-1, 1].map((sx) => rig.part(sx < 0 ? 'mandL' : 'mandR', head, [sx * 0.09, -0.04, -0.16], (b) => {
    b.tube([[0, 0, 0], [sx * -0.03, 0, -0.1], [sx * -0.1, 0, -0.18], [sx * -0.15, 0, -0.17]], [0.03, 0.026, 0.016, 0.004], { c: SH.rim, c2: 0xc8c8f8, w: 7 });
  }, { pk: 'mand' + (sx < 0 ? 'L' : 'R'), mats: M3 }));
  const legs = [];
  for (let i = 0; i < 3; i++) {
    for (const sx of [-1, 1]) {
      const tag = sx < 0 ? 'L' : 'R';
      const z = -0.22 + i * 0.26;
      const up = rig.part('legU' + i + tag, body, [sx * 0.3, -0.04, z], (b) => {
        b.limb([0, 0, 0], [sx * 0.2, 0.06, 0], 0.045, 0.036, { c: SH.a, c2: SH.b, cap: 3, w: 8 });
        b.ellipsoid(0.05, 0.05, 0.05, { p: [sx * 0.2, 0.06, 0], c: SH.rim, w: 8, h: 6 });
      }, { pk: 'legU' + tag, mats: M3 });
      const lo = rig.part('legL' + i + tag, up, [sx * 0.2, 0.06, 0], (b) => {
        b.limb([0, 0, 0], [sx * 0.08, -0.32, 0], 0.036, 0.02, { c: SH.a, c2: SH.b, cap: 3, w: 8 });
      }, { pk: 'legLo' + tag, mats: M3 });
      legs.push({ up, lo, i, sx });
    }
  }
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    body.position.y = 0.28 + Math.abs(Math.sin(w * 2)) * 0.01 * m + Math.sin(s.t * 1.3) * 0.004 + s.wind * 0.04;
    body.rotation.x = s.wind * 0.18 - s.hit * 0.14;
    for (let k = 0; k < legs.length; k++) {
      const L = legs[k];
      const ph = w + (L.i % 2) * Math.PI + (L.sx < 0 ? Math.PI : 0);
      L.up.rotation.y = L.sx * Math.sin(ph) * 0.4 * m - (L.i - 1) * 0.2 * L.sx;
      L.lo.rotation.z = -L.sx * Math.max(0, Math.cos(ph)) * 0.5 * m;
    }
    head.rotation.y = s.headYaw * 0.6;
    head.rotation.x = s.headPitch * 0.4 - s.wind * 0.2 + s.hit * 0.35;
    const open = 0.15 + Math.max(0, Math.sin(s.t * 0.9)) * 0.05 + s.wind * 0.55 - s.hit * 0.75;
    mands[0].rotation.y = -open;
    mands[1].rotation.y = open;
    // saldırıda kristaller uzar ve parlar
    crystals.scale.setScalar(1 + s.wind * 0.18 + s.hit * 0.22);
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 1.8) + s.wind * 0.4 + s.hit * 0.7;
  };
}

/* ================================================================================================
 * LAV SLIME — yarı saydam lav kabuğu içinde parlayan çekirdek, bazalt kabuk plakaları; sekerek ilerler.
 * ============================================================================================== */
function lavslime(rig) {
  const M3 = ['shell', 'glow', 'shell'];
  rig.stride = 2.4;
  rig.attackDur = 1.0;
  rig.glowColor = 0xffa020;
  rig.deathColor = 0xffa020;
  rig.addMat('shell', 'lit', { rough: 0.25, metal: 0.0, opacity: 0.8, emissive: 0x6a1604 });
  rig.addMat('crust', 'lit', { rough: 0.95 });
  const blob = rig.node('blob', null, [0, 0, 0]);
  rig.part('shell', blob, [0, 0.0, 0], (b) => {
    b.ellipsoid(0.44, 0.4, 0.44, { p: [0, 0.4, 0], c: 0xff7a22, c2: 0xc22a0a, w: 22, h: 14, e: [0.92, 0.92], noise: 0.0 });
  }, { mats: M3 });
  const core = rig.part('core', blob, [0, 0.38, 0], (b, g) => {
    g.ellipsoid(0.26, 0.24, 0.26, { c: 0xffc040, i: 1.9, w: 14, h: 9 });
    g.ellipsoid(0.15, 0.14, 0.15, { p: [0.04, 0.02, -0.02], c: 0xfff0a0, i: 2.4, w: 10, h: 7 });
  });
  rig.part('face', blob, [0, 0.0, 0], (b, g) => {
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.07, 0.085, 0.045, { p: [sx * 0.15, 0.5, -0.38], rot: [0, sx * 0.3, 0], c: 0x1a0a06, w: 10, h: 7, ao: 0, noise: 0 });
      g.ellipsoid(0.028, 0.034, 0.02, { p: [sx * 0.15, 0.51, -0.425], c: 0xfff0b0, i: 2.0, w: 8, h: 6 });
      b.ellipsoid(0.1, 0.022, 0.03, { p: [sx * 0.15, 0.6, -0.37], rot: [0, 0, sx * -0.4], c: 0x3a1208, w: 8, h: 5, ao: 0, noise: 0 });
    }
    b.ellipsoid(0.13, 0.03, 0.03, { p: [0, 0.3, -0.4], c: 0x1a0a06, w: 10, h: 6, ao: 0, noise: 0 });
    for (let i = -2; i <= 2; i++) b.spike([i * 0.05, 0.33, -0.42], [i * 0.05, 0.28, -0.43], 0.012, { c: 0xffe8b0, w: 4 });
  }, { mats: M3 });
  rig.part('crust', blob, [0, 0, 0], (b) => {
    const spec = [[0.0, 0.8, 0.0, 0.2, 0.0, 0.0], [-0.2, 0.7, 0.12, 0.15, 0.3, -0.4], [0.2, 0.68, 0.1, 0.16, -0.3, 0.45], [0.05, 0.62, 0.3, 0.14, -0.7, 0.1], [-0.28, 0.5, -0.1, 0.12, 0.2, -0.9], [0.3, 0.52, -0.08, 0.12, 0.2, 0.9]];
    for (const c of spec) b.ellipsoid(c[3], 0.045, c[3] * 0.85, { p: [c[0], c[1], c[2]], rot: [c[4], 0, c[5]], c: 0x3a302c, c2: 0x1c1816, w: 12, h: 6, e: [0.9, 0.95] });
  }, { mats: ['crust', 'glow', 'crust'] });
  const drips = [-1, 1].map((sx) => rig.part(sx < 0 ? 'dripL' : 'dripR', blob, [sx * 0.34, 0.3, 0.1], (b) => {
    b.ellipsoid(0.05, 0.09, 0.05, { p: [0, -0.06, 0], c: 0xff7a22, c2: 0xffa040, w: 8, h: 6 });
  }, { pk: 'drip', mats: M3 }));
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    // zıplama döngüsü: yerde ezilir, havada uzar
    const hop = m > 0.05 ? (s.walk / TAU) % 1 : 0;
    let sy = 1;
    let lift = 0;
    if (m > 0.05) {
      if (hop < 0.35) sy = 1 - 0.22 * Math.sin((hop / 0.35) * Math.PI);
      else {
        const q = (hop - 0.35) / 0.65;
        lift = Math.sin(q * Math.PI) * 0.4;
        sy = 1 + 0.14 * Math.sin(q * Math.PI);
      }
    }
    // saldırı: ezil → öne atıl
    sy += Math.sin(s.t * 2.2) * 0.025 - s.wind * 0.3 + s.hit * 0.18;
    const sxz = 1 / Math.sqrt(Math.max(0.4, sy));
    blob.scale.set(sxz, sy, sxz);
    blob.position.y = lift;
    blob.position.z = -s.hit * 0.45 + s.wind * 0.06;
    blob.rotation.x = -s.hit * 0.25;
    core.scale.setScalar(1 + 0.08 * Math.sin(s.t * 2.6) + s.hit * 0.2);
    rig.mats.glow.userData.k = 0.9 + 0.12 * Math.sin(s.t * 2.4) + s.hit * 0.6;
    for (let i = 0; i < 2; i++) {
      drips[i].scale.y = 1 + 0.4 * Math.sin(s.t * 1.7 + i * 2) + 0.2 * Math.abs(Math.sin(s.walk));
      drips[i].position.y = 0.3 - 0.04 * Math.sin(s.t * 1.7 + i * 2);
    }
  };
}

/* ================================================================================================
 * TAŞ YARASASI — çatlak taş gövdeli, kemikli kanatlı uçan yaratık; sarı gözler.
 * ============================================================================================== */
function tasyarasasi(rig) {
  const ST = { a: 0x8c8884, b: 0x56524f, mem: 0x6e6a67, dark: 0x3a3735 };
  const MW = ['lit', 'glow', 'wing'];
  rig.stride = 1;
  rig.attackDur = 0.8;
  rig.glowColor = 0xffd24a;
  rig.deathColor = 0xffd890;
  rig.addMat('wing', 'lit', { double: true, rough: 0.95 });
  const crack = (x, y, z) => (Math.abs(Math.sin(x * 38 + z * 21 + y * 17)) < 0.07 ? ST.dark : (hash1(Math.floor(x * 14) + Math.floor(z * 14) * 3.7) > 0.7 ? 0x9a9692 : ST.a));
  const body = rig.node('body', null, [0, 0.32, 0]);
  rig.part('torso', body, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.16, 0.15, 0.2, { c: ST.a, c2: ST.b, cfn: crack, w: 14, h: 10 });
    for (const sx of [-1, 1]) {
      b.limb([sx * 0.06, -0.12, 0.0], [sx * 0.07, -0.26, -0.05], 0.02, 0.014, { c: ST.b, cap: 3, w: 5 });
      for (let k = -1; k <= 1; k++) b.spike([sx * 0.07 + k * 0.012, -0.26, -0.05], [sx * 0.07 + k * 0.014, -0.3, -0.1], 0.007, { c: ST.dark, w: 4 });
    }
    for (let i = 0; i < 3; i++) b.spike([0, 0.1 - i * 0.05, 0.1 + i * 0.07], [0, 0.17 - i * 0.04, 0.14 + i * 0.08], 0.03, { c: ST.b, w: 5 });
    g.ellipsoid(0.02, 0.04, 0.012, { p: [0, 0.02, -0.2], c: 0xffb830, i: 0.9, w: 5, h: 4 });
  });
  const head = rig.part('head', body, [0, 0.08, -0.17], (b, g) => {
    b.ellipsoid(0.13, 0.11, 0.12, { p: [0, 0.04, -0.03], c: ST.a, c2: ST.b, cfn: crack, w: 14, h: 9 });
    b.ellipsoid(0.06, 0.05, 0.05, { p: [0, 0.0, -0.12], c: ST.b, w: 10, h: 6 });
    b.ellipsoid(0.014, 0.01, 0.01, { p: [0, 0.012, -0.165], c: ST.dark, w: 6, h: 4, ao: 0 });
    for (const sx of [-1, 1]) {
      b.spike([sx * 0.08, 0.09, -0.02], [sx * 0.13, 0.27, 0.02], 0.055, { c: ST.a, c2: ST.b, s: [1, 1, 0.45], w: 7 });
      b.spike([sx * 0.025, -0.03, -0.14], [sx * 0.03, -0.1, -0.15], 0.012, { c: 0xf4eee0, w: 5 });
      g.ellipsoid(0.03, 0.026, 0.014, { p: [sx * 0.06, 0.06, -0.1], c: 0xffd24a, i: 2.4, w: 8, h: 6 });
      b.ellipsoid(0.008, 0.026, 0.006, { p: [sx * 0.06, 0.06, -0.113], c: 0x1a1612, w: 5, h: 4, ao: 0 });
    }
  });
  const wings = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const sh = rig.part('wing' + tag, body, [sx * 0.14, 0.06, 0.0], (b) => {
      b.limb([0, 0, 0], [sx * 0.26, 0.03, 0.02], 0.026, 0.018, { c: ST.b, c2: ST.a, cap: 3, w: 6 });
      b.ellipsoid(0.032, 0.032, 0.032, { p: [sx * 0.26, 0.03, 0.02], c: ST.a, w: 6, h: 5 });
    }, { pk: 'wingIn' + tag });
    rig.attach(sh, 'wingInMem' + tag, (b, g, x) => {
      x.sheet(8, 5, (u, v) => [sx * (0.02 + u * 0.24), 0.03 * u, 0.02 + v * (0.26 - 0.05 * u)], {
        flip: sx > 0, ao: 0.1, noise: 0.03, cu: (u, v) => (Math.abs(Math.sin(u * 9 + v * 6)) < 0.06 ? ST.dark : (v > 0.9 ? ST.b : ST.mem)),
      });
    }, { mats: MW });
    const tip = rig.part('tip' + tag, sh, [sx * 0.26, 0.03, 0.02], (b) => {
      b.limb([0, 0, 0], [sx * 0.16, 0.0, -0.05], 0.018, 0.012, { c: ST.b, cap: 3, w: 6 });
      for (let k = 0; k < 3; k++) {
        b.limb([sx * 0.03, 0, -0.01], [sx * (0.17 + k * 0.015), 0.0, 0.08 + k * 0.08], 0.009, 0.005, { c: ST.b, cap: 2, w: 4 });
      }
      b.spike([sx * 0.16, 0, -0.05], [sx * 0.21, 0, -0.1], 0.01, { c: ST.dark, w: 4 });
    }, { pk: 'wingTip' + tag });
    rig.attach(tip, 'wingTipMem' + tag, (b, g, x) => {
      const pts = (u, v) => {
        const span = sx * (0.03 + u * 0.18);
        const trail = 0.05 + v * (0.24 - u * 0.16) + Math.sin(v * Math.PI * 3) * 0.012 * u;
        return [span, 0, -0.04 * (1 - v) * (1 - u * 0.7) + trail * (v > 0.001 ? 1 : 0) * 0.9];
      };
      x.sheet(8, 6, pts, {
        flip: sx > 0, ao: 0.1, noise: 0.03, cu: (u, v) => (v > 0.88 ? ST.b : (Math.abs(Math.sin(u * 7 + v * 8)) < 0.05 ? ST.dark : ST.mem)),
      });
    }, { mats: MW });
    return { sh, tip, sx };
  });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const f = (s.reduced ? 9 : 14) + m * (s.reduced ? 2 : 5) + s.wind * 4;
    const amp = 0.62 + m * 0.15;
    const ph = s.t * f;
    for (let i = 0; i < 2; i++) {
      const W = wings[i];
      const dir = W.sx < 0 ? -1 : 1;
      W.sh.rotation.z = dir * Math.sin(ph) * amp;
      W.tip.rotation.z = dir * (Math.sin(ph - 1.0) * amp * 1.2 + 0.15);
      W.tip.rotation.y = dir * -(s.hit * 0.5 + 0.1);
      W.sh.rotation.y = dir * (-s.hit * 0.45);
    }
    body.position.y = 0.34 + Math.cos(ph) * 0.045 + Math.sin(s.t * 1.1) * 0.02 - s.hit * 0.08;
    body.rotation.x = -0.1 * m - s.hit * 0.55 + s.wind * 0.4;
    head.rotation.y = s.headYaw * 0.8;
    head.rotation.x = s.headPitch * 0.5 + 0.1;
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.2) + s.hit * 0.7;
  };
}

export const HOSTILE_BUILDERS = Object.freeze({
  golge, kemikci, kumakrebi, buzhortlagi, kristalbocegi, lavslime, tasyarasasi,
});
