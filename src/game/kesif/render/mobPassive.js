/*
 * KEŞİF render — pasif yaratık modelleri: tavuk, koyun, orman kedisi, ceylan, balık, kelebek, ateş böceği.
 * Her kurucu (rig, def) → anim(s, dt). Bkz. mobModels.js durum alanları (s.moving, s.walk, s.t, s.headYaw…).
 * Ayak noktası y=0, ön -Z. Ölçüler sim/mobTypes.js hitbox'ına uyar.
 */
import {
  TAU, clamp, eye, hash1, lerp, makeLimb, rng, smoothstep, swingLimb,
} from './mobGeo.js';

/** İki kemikli bacak kurar (kalça düğümü + diz düğümü). */
function leg(rig, name, parent, pivot, o) {
  const fh = o.fh === undefined ? 0.05 : o.fh;
  return makeLimb(
    rig, name, parent, pivot, o.up,
    (b) => {
      b.limb([0, 0, 0], [0, -o.up, 0], o.r0, o.r1, { c: o.c, c2: o.c2 === undefined ? o.c : o.c2, cap: 3, w: 8 });
      if (o.cuff) b.ellipsoid(o.cuff[0], o.cuff[1], o.cuff[2], { p: [0, -o.up * 0.15, 0], c: o.cuffC, w: 8, h: 6 });
    },
    (b) => {
      b.limb([0, 0, 0], [0, -o.low + fh, 0], o.r1 * 0.95, o.r2, { c: o.c, c2: o.c, cap: 3, w: 8 });
      if (o.foot === 'paw') {
        b.ellipsoid(o.r2 * 1.5, o.r2 * 0.95, o.r2 * 2.2, { p: [0, -o.low + o.r2 * 0.8, -o.r2 * 0.9], c: o.fc, w: 8, h: 6 });
      } else {
        b.ellipsoid(o.r2 * 1.3, fh * 0.6, o.r2 * 1.6, { p: [0, -o.low + fh * 0.5, -o.r2 * 0.25], c: o.fc, w: 8, h: 6 });
      }
    },
    { pkUpper: o.pk + 'U', pkLower: o.pk + 'L' },
  );
}

/* ================================================================================================
 * TAVUK
 * ============================================================================================== */
function tavuk(rig) {
  const V = [
    { body: 0xf4f1ea, belly: 0xe2dccb, tail: 0xd2cab6 },
    { body: 0xb06a3c, belly: 0x93552f, tail: 0x3a2a24 },
    { body: 0xbfae92, belly: 0xa08e72, tail: 0x4a4038 },
  ][rig.variant];
  rig.stride = 17;
  rig.attackDur = 0.5;
  rig.glowColor = 0xfff3c8;
  rig.deathColor = 0xffe9b0;
  const body = rig.part('body', null, [0, 0.33, 0], (b) => {
    b.ellipsoid(0.15, 0.15, 0.19, { p: [0, 0, 0.03], c: V.body, c2: V.belly, h: 10 });
    b.ellipsoid(0.125, 0.135, 0.13, { p: [0, -0.015, -0.09], c: V.body, c2: V.belly });
    for (let i = -1; i <= 1; i++) {
      b.ellipsoid(0.026, 0.085, 0.03, { p: [i * 0.04, 0.12, 0.205], rot: [0.75, 0, -i * 0.35], c: V.tail, c2: V.body, w: 8, h: 6 });
    }
  });
  const head = rig.part('head', body, [0, 0.12, -0.14], (b, g) => {
    b.limb([0, 0, 0], [0, 0.1, -0.01], 0.05, 0.04, { c: V.body, cap: 3, w: 8 });
    b.ellipsoid(0.065, 0.07, 0.075, { p: [0, 0.13, -0.025], c: V.body, w: 10, h: 7 });
    b.spike([0, 0.135, -0.085], [0, 0.125, -0.15], 0.026, { c: 0xf0a020, s: [1, 0.8, 1], w: 8 });
    b.ellipsoid(0.014, 0.032, 0.014, { p: [0, 0.09, -0.095], c: 0xd8342c, w: 8, h: 6 });
    for (let i = 0; i < 3; i++) b.ellipsoid(0.013, 0.03 - i * 0.004, 0.02, { p: [0, 0.205 + i * 0.002, -0.05 + i * 0.03], c: 0xd8342c, w: 8, h: 6 });
    eye(b, g, 0.052, 0.15, -0.045, 0.014);
    eye(b, g, -0.052, 0.15, -0.045, 0.014);
  });
  const legs = [-1, 1].map((sx) => rig.part(sx < 0 ? 'legL' : 'legR', null, [sx * 0.055, 0.2, 0.02], (b) => {
    b.limb([0, 0, 0], [0, -0.19, 0], 0.016, 0.011, { c: 0xe8a43a, cap: 3, w: 6 });
    for (let k = -1; k <= 1; k++) b.spike([0, -0.19, 0], [k * 0.028, -0.195, -0.06], 0.009, { c: 0xe8a43a, w: 5 });
  }, { pk: 'leg' }));
  const wings = [-1, 1].map((sx) => rig.part(sx < 0 ? 'wingL' : 'wingR', body, [sx * 0.145, 0.06, -0.02], (b) => {
    b.ellipsoid(0.02, 0.09, 0.1, { p: [sx * 0.012, -0.05, 0.04], rot: [0.12, 0, sx * 0.05], c: V.body, c2: V.tail, w: 10, h: 7 });
  }, { pk: 'wing' + (sx < 0 ? 'L' : 'R') }));

  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    body.position.y = 0.33 + Math.abs(Math.sin(w)) * 0.014 * m + Math.sin(s.t * 1.8) * 0.003;
    body.rotation.x = -0.04 * m + Math.sin(s.t * 1.8) * 0.01;
    legs[0].rotation.x = Math.sin(w) * 0.85 * m;
    legs[1].rotation.x = Math.sin(w + Math.PI) * 0.85 * m;
    // yürürken kafa ileri-geri; dururken gagalama
    const u = ((s.t + s.variant * 1.3) % 4.4) / 4.4;
    const peck = u < 0.2 ? Math.max(0, Math.sin((u / 0.2) * TAU)) : 0;
    head.position.z = -0.14 + Math.sin(w + 1.2) * 0.03 * m - s.hit * 0.05;
    head.rotation.x = -peck * 1.05 * (1 - Math.min(1, m)) - s.hit * 0.5 + s.headPitch * 0.4 - s.hurt * 0.3;
    head.rotation.y = s.headYaw * 0.8;
    const flap = (0.5 + 0.5 * Math.sin(s.t * (s.reduced ? 12 : 26))) * 0.8 * smoothstep(0.75, 1.1, m) * (s.reduced ? 0.5 : 1);
    const flare = 0.1 + flap + s.hurt * 0.9;
    wings[0].rotation.z = -flare;
    wings[1].rotation.z = flare;
  };
}

/* ================================================================================================
 * KOYUN
 * ============================================================================================== */
function koyun(rig) {
  const V = [
    { wool: [0xf4efe3, 0xe3dccb], face: 0x3b342f, leg: 0x3b342f },
    { wool: [0xf1e6cf, 0xdccdac], face: 0xcdb48c, leg: 0xcdb48c },
    { wool: [0x5a524b, 0x3e3833], face: 0xd9c9a6, leg: 0x2c2723 },
  ][rig.variant];
  rig.stride = 6.2;
  rig.root.scale.setScalar(1.15);
  rig.attackDur = 0.6;
  rig.glowColor = 0xfff6e0;
  rig.deathColor = 0xfff2d0;
  const body = rig.part('body', null, [0, 0.62, 0.04], (b) => {
    b.ellipsoid(0.29, 0.28, 0.3, { c: V.wool[0], c2: V.wool[1], w: 14, h: 9 });
    const r = rng(11);
    const puffs = rig.level === 0 ? 10 : 20;
    for (let i = 0; i < puffs; i++) {
      const th = r() * TAU;
      const ph = (r() - 0.35) * 2.2;
      const x = Math.cos(th) * Math.cos(ph) * 0.28;
      const y = Math.sin(ph) * 0.26;
      const z = Math.sin(th) * Math.cos(ph) * 0.34;
      const rr = 0.12 + r() * 0.05;
      b.ellipsoid(rr, rr * 0.92, rr, { p: [x, y, z], c: V.wool[0], c2: V.wool[1], w: 11, h: 8, noise: 0.04 });
    }
    b.ellipsoid(0.07, 0.07, 0.07, { p: [0, 0.03, 0.34], c: V.wool[0], c2: V.wool[1], w: 8, h: 6 });
  });
  const head = rig.part('head', body, [0, 0.12, -0.2], (b, g) => {
    b.limb([0, 0, 0], [0, 0.06, -0.08], 0.08, 0.07, { c: V.wool[0], cap: 3 });
    b.ellipsoid(0.1, 0.115, 0.14, { p: [0, 0.06, -0.14], rot: [0.2, 0, 0], c: V.face, w: 12, h: 8 });
    b.ellipsoid(0.06, 0.055, 0.075, { p: [0, 0.0, -0.25], c: V.face, c2: V.face, w: 10, h: 6 });
    b.ellipsoid(0.022, 0.016, 0.014, { p: [0, 0.015, -0.322], c: 0x2a1f1c, w: 6, h: 4, ao: 0 });
    // alın tüyü
    b.ellipsoid(0.1, 0.06, 0.09, { p: [0, 0.145, -0.105], c: V.wool[0], c2: V.wool[1], w: 9, h: 6 });
    for (const sx of [-1, 1]) {
      eye(b, g, sx * 0.075, 0.07, -0.19, 0.026, { c: 0xe6dca0, hi: true });
      b.ellipsoid(0.017, 0.007, 0.01, { p: [sx * 0.082, 0.07, -0.213], c: 0x14100c, w: 6, h: 4, ao: 0 });
    }
  });
  const ears = [-1, 1].map((sx) => rig.part(sx < 0 ? 'earL' : 'earR', head, [sx * 0.1, 0.1, -0.1], (b) => {
    b.ellipsoid(0.085, 0.022, 0.045, { p: [sx * 0.07, -0.01, 0], rot: [0, 0, sx * -0.15], c: V.face, w: 8, h: 6 });
  }, { pk: 'ear' + (sx < 0 ? 'L' : 'R') }));
  const L = {
    fl: leg(rig, 'legFL', null, [-0.17, 0.46, -0.2], { up: 0.23, low: 0.23, r0: 0.05, r1: 0.04, r2: 0.032, c: V.leg, fc: 0x1f1b18, pk: 'legF', cuff: [0.075, 0.08, 0.075], cuffC: V.wool[1] }),
    fr: leg(rig, 'legFR', null, [0.17, 0.46, -0.2], { up: 0.23, low: 0.23, r0: 0.05, r1: 0.04, r2: 0.032, c: V.leg, fc: 0x1f1b18, pk: 'legF', cuff: [0.075, 0.08, 0.075], cuffC: V.wool[1] }),
    hl: leg(rig, 'legHL', null, [-0.17, 0.46, 0.26], { up: 0.23, low: 0.23, r0: 0.055, r1: 0.04, r2: 0.032, c: V.leg, fc: 0x1f1b18, pk: 'legH', cuff: [0.08, 0.085, 0.08], cuffC: V.wool[1] }),
    hr: leg(rig, 'legHR', null, [0.17, 0.46, 0.26], { up: 0.23, low: 0.23, r0: 0.055, r1: 0.04, r2: 0.032, c: V.leg, fc: 0x1f1b18, pk: 'legH', cuff: [0.08, 0.085, 0.08], cuffC: V.wool[1] }),
  };

  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    const amp = 0.55 * m;
    swingLimb(L.fl, w, amp, 0.7, 1);
    swingLimb(L.hr, w, amp, 0.7, -1);
    swingLimb(L.fr, w + Math.PI, amp, 0.7, 1);
    swingLimb(L.hl, w + Math.PI, amp, 0.7, -1);
    body.position.y = 0.62 + Math.abs(Math.sin(w)) * 0.025 * m + Math.sin(s.t * 1.5) * 0.004;
    body.rotation.z = Math.sin(w) * 0.03 * m;
    // otlama (idle): baş aşağı, çene hareketi
    const graze = smoothstep(0.55, 0.7, Math.sin(s.t * 0.21 + s.variant)) * (1 - Math.min(1, m * 2));
    head.rotation.x = graze * 0.95 + Math.sin(w * 2) * 0.05 * m - s.headPitch * 0.3 - s.hit * 0.3;
    head.rotation.x += graze > 0.3 ? Math.sin(s.t * 9) * 0.04 : 0;
    head.rotation.y = s.headYaw * (1 - graze * 0.7);
    ears[0].rotation.z = -Math.sin(s.t * 1.3 + 1) * 0.1 - m * 0.2 + Math.max(0, Math.sin(s.t * 0.5)) * 0.08 - 0.1;
    ears[1].rotation.z = Math.sin(s.t * 1.1) * 0.1 + m * 0.2 - Math.max(0, Math.sin(s.t * 0.5 + 2)) * 0.08 + 0.1;
  };
}

/* ================================================================================================
 * ORMAN KEDİSİ
 * ============================================================================================== */
function ormankedisi(rig) {
  const V = [
    { fur: 0x8d9296, dark: 0x4a4f55, belly: 0xd8d6cc, ear: 0xe9a8a8, eye: 0x6dff9e },
    { fur: 0xd98d44, dark: 0xa5591f, belly: 0xf3dcb8, ear: 0xf0a898, eye: 0xa8ff6a },
    { fur: 0x3b3e46, dark: 0x1f2126, belly: 0xf0f0ea, ear: 0xc89a9a, eye: 0x7cf0ff },
  ][rig.variant];
  rig.stride = 8.5;
  rig.attackDur = 0.5;
  rig.glowColor = V.eye;
  rig.deathColor = V.eye;
  const stripe = (x, y, z, nx, ny) => {
    if (ny < -0.35) return V.belly;
    if (ny > 0.15 && Math.sin(z * 46) > 0.35) return V.dark;
    return V.fur;
  };
  const body = rig.part('body', null, [0, 0.36, 0.06], (b) => {
    b.ellipsoid(0.125, 0.12, 0.25, { c: V.fur, cfn: stripe, w: 18, h: 12 });
    b.ellipsoid(0.1, 0.1, 0.1, { p: [0, 0.01, -0.16], c: V.fur, cfn: stripe, w: 10, h: 7 });
    b.ellipsoid(0.095, 0.1, 0.1, { p: [0, 0.01, 0.17], c: V.fur, cfn: stripe, w: 10, h: 7 });
  });
  const head = rig.part('head', body, [0, 0.08, -0.25], (b, g) => {
    b.ellipsoid(0.105, 0.088, 0.09, { p: [0, 0.03, -0.04], c: V.fur, c2: V.fur, w: 12, h: 8 });
    b.ellipsoid(0.115, 0.05, 0.07, { p: [0, 0.0, -0.045], c: V.fur, w: 10, h: 6 });
    b.ellipsoid(0.045, 0.034, 0.04, { p: [0, -0.005, -0.1], c: V.belly, w: 8, h: 6 });
    b.ellipsoid(0.014, 0.01, 0.01, { p: [0, 0.012, -0.137], c: V.ear, w: 6, h: 4, ao: 0 });
    for (const sx of [-1, 1]) {
      b.spike([sx * 0.06, 0.085, -0.025], [sx * 0.085, 0.19, -0.02], 0.042, { c: V.fur, s: [1, 1, 0.5], w: 6 });
      b.spike([sx * 0.062, 0.088, -0.032], [sx * 0.083, 0.165, -0.03], 0.026, { c: V.ear, s: [1, 1, 0.4], w: 6 });
      g.ellipsoid(0.026, 0.02, 0.012, { p: [sx * 0.05, 0.05, -0.088], rot: [0, sx * 0.3, sx * -0.25], c: V.eye, i: 1.5, w: 8, h: 6 });
      b.ellipsoid(0.005, 0.017, 0.004, { p: [sx * 0.05, 0.05, -0.1], rot: [0, sx * 0.3, 0], c: 0x0a0a0a, w: 5, h: 4, ao: 0 });
      for (let k = -1; k <= 1; k++) {
        b.limb([sx * 0.04, -0.005, -0.1], [sx * 0.15, -0.005 + k * 0.025, -0.1 + k * 0.01 + 0.02], 0.003, 0.0015, { c: 0xe8e8e0, cap: 2, w: 4, ao: 0, noise: 0 });
      }
    }
  }, { keep: [1] }); // göz kırpma: ışıma ağı (head:glow) ölçekle sürülür → birleşmez
  const tail = [];
  let par = body;
  const tl = rig.level === 0 ? 4 : 5;
  for (let i = 0; i < tl; i++) {
    const seg = rig.part('tail' + i, par, i === 0 ? [0, 0.04, 0.26] : [0, 0, 0.09], (b) => {
      const rr = 0.04 - i * 0.004;
      b.limb([0, 0, 0], [0, 0, 0.095], rr, rr - 0.004, { c: i >= tl - 1 ? V.dark : V.fur, c2: V.fur, cap: 3, w: 8 });
    }, { pk: 'tail' + i });
    tail.push(seg);
    par = seg;
  }
  const L = {
    fl: leg(rig, 'legFL', null, [-0.075, 0.3, -0.13], { up: 0.15, low: 0.15, r0: 0.04, r1: 0.032, r2: 0.025, c: V.fur, fc: V.belly, foot: 'paw', pk: 'legF' }),
    fr: leg(rig, 'legFR', null, [0.075, 0.3, -0.13], { up: 0.15, low: 0.15, r0: 0.04, r1: 0.032, r2: 0.025, c: V.fur, fc: V.belly, foot: 'paw', pk: 'legF' }),
    hl: leg(rig, 'legHL', null, [-0.08, 0.3, 0.25], { up: 0.15, low: 0.15, r0: 0.06, r1: 0.032, r2: 0.025, c: V.fur, fc: V.belly, foot: 'paw', pk: 'legH' }),
    hr: leg(rig, 'legHR', null, [0.08, 0.3, 0.25], { up: 0.15, low: 0.15, r0: 0.06, r1: 0.032, r2: 0.025, c: V.fur, fc: V.belly, foot: 'paw', pk: 'legH' }),
  };
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const amp = 0.7 * m;
    swingLimb(L.fl, w, amp, 0.8, 1);
    swingLimb(L.hr, w, amp, 0.8, -1);
    swingLimb(L.fr, w + Math.PI, amp, 0.8, 1);
    swingLimb(L.hl, w + Math.PI, amp, 0.8, -1);
    body.position.y = 0.36 + Math.sin(w * 2) * 0.012 * m + Math.sin(s.t * 1.7) * 0.003;
    body.rotation.x = Math.sin(w * 2 + 0.5) * 0.04 * m;
    head.rotation.y = s.headYaw * 0.9;
    head.rotation.x = s.headPitch * 0.6 + Math.sin(w * 2) * 0.04 * m - s.hit * 0.3;
    const calm = s.reduced ? 0.4 : 1;
    for (let i = 0; i < tail.length; i++) {
      const k = i / tail.length;
      tail[i].rotation.y = Math.sin(s.t * (1.4 + m) - i * 0.7) * (0.16 + 0.1 * k) * calm;
      tail[i].rotation.x = i === 0 ? -0.85 - m * 0.2 : (-0.2 - 0.06 * Math.sin(s.t * 0.9 + i)) * (1 + (i > 2 ? 0.5 : 0));
    }
    const blink = 1 - s.blink * 0.9;
    head.scale.y = 1;
    head.children.forEach((c) => { if (c.name.endsWith(':glow')) c.scale.y = blink; });
  };
}

/* ================================================================================================
 * CEYLAN
 * ============================================================================================== */
function ceylan(rig) {
  const V = [
    { fur: 0xc08f5a, belly: 0xf0e4cf, dark: 0x6a4a2a, horn: false },
    { fur: 0x9c7448, belly: 0xe8dcc6, dark: 0x4a3420, horn: true },
  ][rig.variant];
  rig.stride = 4.3;
  rig.attackDur = 0.6;
  rig.glowColor = 0xffeed0;
  rig.deathColor = 0xffe6b8;
  const spots = (x, y, z, nx, ny) => {
    if (ny < -0.25) return V.belly;
    if (z > 0.2 && ny < 0.5) return V.belly;
    if (ny > 0.3 && hash1(Math.floor(x * 22) * 3.1 + Math.floor(z * 22) * 7.7) > 0.86) return 0xefe2c8;
    return V.fur;
  };
  const body = rig.part('body', null, [0, 0.88, 0.05], (b) => {
    b.ellipsoid(0.185, 0.21, 0.33, { c: V.fur, cfn: spots, w: 16, h: 12 });
    b.ellipsoid(0.17, 0.19, 0.17, { p: [0, 0.0, 0.2], c: V.fur, cfn: spots, w: 10, h: 8 });
    b.ellipsoid(0.04, 0.07, 0.035, { p: [0, 0.07, 0.4], rot: [-0.5, 0, 0], c: 0xf6efe0, w: 8, h: 6 });
    b.ellipsoid(0.17, 0.19, 0.17, { p: [0, 0.01, -0.2], c: V.fur, cfn: spots, w: 10, h: 8 });
  });
  const neck = rig.part('neck', body, [0, 0.1, -0.24], (b) => {
    b.limb([0, 0, 0], [0, 0.27, -0.12], 0.105, 0.065, { c: V.fur, c2: V.fur, cap: 3, w: 10, mid: 1 });
  });
  const head = rig.part('head', neck, [0, 0.28, -0.12], (b, g) => {
    b.ellipsoid(0.07, 0.075, 0.115, { p: [0, 0.0, -0.06], rot: [0.55, 0, 0], c: V.fur, w: 12, h: 8 });
    b.ellipsoid(0.045, 0.042, 0.075, { p: [0, -0.06, -0.15], rot: [0.55, 0, 0], c: V.belly, w: 10, h: 7 });
    b.ellipsoid(0.02, 0.016, 0.014, { p: [0, -0.075, -0.22], rot: [0.55, 0, 0], c: 0x1a1210, w: 6, h: 4, ao: 0 });
    for (const sx of [-1, 1]) eye(b, g, sx * 0.058, 0.02, -0.075, 0.021, { c: 0x2a1c12 });
    if (V.horn) {
      for (const sx of [-1, 1]) {
        const pts = [[sx * 0.04, 0.06, -0.01], [sx * 0.07, 0.15, 0.0], [sx * 0.1, 0.24, 0.03], [sx * 0.1, 0.33, 0.08]];
        b.tube(pts, [0.016, 0.012, 0.009, 0.005], { c: 0xdacdb0, c2: 0xb59f78, w: 6 });
        b.spike([sx * 0.085, 0.2, 0.02], [sx * 0.15, 0.28, 0.0], 0.008, { c: 0xdacdb0, w: 5 });
        b.spike([sx * 0.1, 0.285, 0.05], [sx * 0.065, 0.38, 0.03], 0.007, { c: 0xdacdb0, w: 5 });
      }
    } else {
      for (const sx of [-1, 1]) b.spike([sx * 0.04, 0.06, -0.01], [sx * 0.05, 0.1, 0.0], 0.014, { c: 0xb59f78, w: 5 });
    }
  });
  const ears = [-1, 1].map((sx) => rig.part(sx < 0 ? 'earL' : 'earR', head, [sx * 0.055, 0.05, 0.0], (b) => {
    b.ellipsoid(0.03, 0.1, 0.022, { p: [sx * 0.07, 0.03, 0], rot: [0, 0, sx * -0.9], c: V.fur, w: 8, h: 6 });
    b.ellipsoid(0.018, 0.075, 0.012, { p: [sx * 0.07, 0.03, -0.006], rot: [0, 0, sx * -0.9], c: 0xe8b0a0, w: 6, h: 4 });
  }, { pk: 'ear' + (sx < 0 ? 'L' : 'R') }));
  const o = (z, pk) => ({ up: 0.38, low: 0.42, r0: 0.062, r1: 0.04, r2: 0.027, c: V.fur, c2: V.fur, fc: 0x2a2018, fh: 0.06, pk });
  const L = {
    fl: leg(rig, 'legFL', null, [-0.1, 0.8, -0.2], o(0, 'legF')),
    fr: leg(rig, 'legFR', null, [0.1, 0.8, -0.2], o(0, 'legF')),
    hl: leg(rig, 'legHL', null, [-0.1, 0.8, 0.25], { ...o(0, 'legH'), r0: 0.06 }),
    hr: leg(rig, 'legHR', null, [0.1, 0.8, 0.25], { ...o(0, 'legH'), r0: 0.06 }),
  };
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const amp = 0.5 * m;
    swingLimb(L.fl, w, amp, 0.9, 1);
    swingLimb(L.hr, w, amp, 0.9, -1);
    swingLimb(L.fr, w + Math.PI, amp, 0.9, 1);
    swingLimb(L.hl, w + Math.PI, amp, 0.9, -1);
    body.position.y = 0.88 + Math.abs(Math.sin(w)) * 0.03 * m + Math.sin(s.t * 1.4) * 0.005;
    body.rotation.x = Math.sin(w * 2) * 0.015 * m;
    const graze = smoothstep(0.7, 0.82, Math.sin(s.t * 0.17 + s.variant * 2)) * (1 - Math.min(1, m * 2));
    neck.rotation.x = graze * 1.0 + Math.sin(w) * 0.05 * m - s.headPitch * 0.3 - s.hit * 0.3;
    neck.rotation.y = s.headYaw * 0.4;
    head.rotation.x = graze * 0.3 + s.headPitch * 0.2;
    head.rotation.y = s.headYaw * 0.6;
    const tw = s.reduced ? 0 : Math.max(0, Math.sin(s.t * 0.9 + s.variant)) * Math.max(0, Math.sin(s.t * 14)) * 0.25;
    ears[0].rotation.z = -0.1 - tw - m * 0.1;
    ears[1].rotation.z = 0.1 + Math.max(0, Math.sin(s.t * 0.7 + 1.5)) * 0.12 + m * 0.1;
  };
}

/* ================================================================================================
 * BALIK
 * ============================================================================================== */
function balik(rig) {
  const V = [
    { top: 0xf0883a, belly: 0xffe0b8, fin: 0xf6a850, band: 0xffffff },
    { top: 0x4a8fd8, belly: 0xd4eaff, fin: 0x7cb4ec, band: 0x2a5fa8 },
    { top: 0xf2cc3a, belly: 0xfff4c0, fin: 0xf8dc6a, band: 0x3a3a3a },
    { top: 0x7fb59a, belly: 0xe8f6ee, fin: 0xaad4c0, band: 0x4f8a72 },
  ][rig.variant];
  rig.stride = 12;
  rig.root.scale.set(1, 1, 0.8);
  rig.attackDur = 0.4;
  rig.glowColor = 0xbfe8ff;
  rig.deathColor = 0xbfe8ff;
  const pat = (x, y, z, nx, ny) => {
    if (ny < -0.3) return V.belly;
    const band = rig.variant === 0 ? Math.sin(z * 30) > 0.7 : rig.variant === 2 ? Math.sin(z * 34) > 0.55 : rig.variant === 1 ? Math.sin(z * 26) > 0.82 : false;
    return band ? V.band : V.top;
  };
  const fish = rig.node('fish', null, [0, 0.2, 0]);
  const b0 = rig.part('b0', fish, [0, 0, -0.04], (b, g) => {
    b.ellipsoid(0.075, 0.115, 0.18, { p: [0, 0, 0], c: V.top, cfn: pat, w: 16, h: 12, e: [1, 0.95] });
    b.ellipsoid(0.02, 0.09, 0.07, { p: [0, 0.14, 0.0], c: V.fin, c2: V.fin, w: 8, h: 6, rot: [0.15, 0, 0] });
    for (const sx of [-1, 1]) {
      eye(b, g, sx * 0.062, 0.03, -0.1, 0.03, { c: 0xf8f6ee, hi: false });
      b.ellipsoid(0.017, 0.017, 0.012, { p: [sx * 0.078, 0.03, -0.108], c: 0x101010, w: 6, h: 5, ao: 0 });
      g.ellipsoid(0.006, 0.006, 0.004, { p: [sx * 0.082, 0.04, -0.118], c: 0xffffff, i: 1.3, w: 5, h: 4 });
    }
  });
  const b1 = rig.part('b1', b0, [0, 0, 0.16], (b) => {
    b.ellipsoid(0.05, 0.085, 0.14, { p: [0, 0, 0.04], c: V.top, cfn: pat, w: 12, h: 8 });
  });
  const b2 = rig.part('b2', b1, [0, 0, 0.17], (b) => {
    b.ellipsoid(0.03, 0.05, 0.08, { p: [0, 0, 0.03], c: V.top, w: 10, h: 6 });
    b.ellipsoid(0.01, 0.12, 0.09, { p: [0, 0, 0.12], rot: [0.0, 0, 0], c: V.fin, c2: V.top, w: 8, h: 8, e: [0.9, 1] });
  });
  const fins = [-1, 1].map((sx) => rig.part(sx < 0 ? 'finL' : 'finR', b0, [sx * 0.065, -0.03, -0.03], (b) => {
    b.ellipsoid(0.07, 0.008, 0.045, { p: [sx * 0.05, 0, 0.03], rot: [0, sx * -0.3, 0], c: V.fin, w: 8, h: 4 });
  }, { pk: 'fin' + (sx < 0 ? 'L' : 'R') }));
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const ph = s.t * (5 + m * 6);
    const a = 0.22 + m * 0.2;
    b0.rotation.y = Math.sin(ph) * a * 0.5;
    b1.rotation.y = Math.sin(ph - 0.9) * a;
    b2.rotation.y = Math.sin(ph - 1.8) * a * 1.5;
    fish.position.y = 0.2 + Math.sin(s.t * 1.3) * 0.02;
    fish.rotation.z = Math.sin(ph + 0.5) * 0.03;
    fish.rotation.x = s.headPitch * 0.4;
    const f = Math.sin(s.t * (3 + m * 4)) * 0.4 + 0.5;
    fins[0].rotation.z = -f * 0.5;
    fins[1].rotation.z = f * 0.5;
    fins[0].rotation.y = f * 0.2;
    fins[1].rotation.y = -f * 0.2;
  };
}

/* ================================================================================================
 * KELEBEK
 * ============================================================================================== */
function kelebek(rig) {
  const V = [
    { a: 0xf08a1c, e: 0x1a1210, dot: 0xfff2dc },
    { a: 0x3fa0ff, e: 0x0e1d40, dot: 0xcfeaff },
    { a: 0xf6e050, e: 0x5a4a10, dot: 0xffffff },
    { a: 0xe070c0, e: 0x401448, dot: 0xffe0f4 },
  ][rig.variant];
  rig.stride = 1;
  rig.attackDur = 0.4;
  rig.glowColor = V.a;
  rig.deathColor = V.a;
  rig.addMat('wing', 'lit', { double: true, rough: 0.9, emissive: 0x1c0e06 });
  const wingFn = (len, chord, off, sweep) => (u, v) => {
    const prof = Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * u)), 0.6);
    const z = off + (v - 0.5) * chord * prof - u * sweep;
    return [u * len, Math.sin(u * 2.2) * 0.012 * (v - 0.5), z];
  };
  // u: gövdeden uca, v: ön kenardan arka kenara. Dış şerit koyu, içinde benekler, gövde yanında koyulaşma.
  const wingCol = (fore) => (u, v) => {
    const rim = Math.min(1 - u, v, 1 - v);
    if (rim < 0.11) return V.e;
    if (u < 0.16) return V.e;
    if (fore && rim > 0.13 && rim < 0.25 && Math.sin(u * 24 + v * 4) > 0.62) return V.dot;
    if (!fore && rim > 0.14 && rim < 0.3 && Math.sin(u * 20 + v * 9) > 0.7) return V.dot;
    return V.a;
  };
  const body = rig.node('body', null, [0, 0.15, 0]);
  rig.part('torso', body, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.012, 0.012, 0.035, { p: [0, 0, -0.005], c: 0x2a1f1a, w: 8, h: 6 });
    b.ellipsoid(0.009, 0.009, 0.05, { p: [0, -0.002, 0.06], c: 0x3a2c22, c2: 0x2a1f1a, w: 8, h: 6 });
    b.ellipsoid(0.013, 0.013, 0.013, { p: [0, 0.002, -0.04], c: 0x2a1f1a, w: 8, h: 6 });
    for (const sx of [-1, 1]) {
      b.limb([sx * 0.004, 0.008, -0.05], [sx * 0.03, 0.05, -0.1], 0.0025, 0.002, { c: 0x2a1f1a, cap: 2, w: 4, ao: 0, noise: 0 });
      g.ellipsoid(0.005, 0.005, 0.005, { p: [sx * 0.03, 0.052, -0.102], c: V.a, i: 1.3, w: 5, h: 4 });
      g.ellipsoid(0.004, 0.004, 0.004, { p: [sx * 0.009, 0.006, -0.05], c: 0xffffff, i: 1.2, w: 5, h: 4 });
    }
  });
  const wings = [];
  for (const sx of [-1, 1]) {
    const mk = (nm, fn, pk) => rig.part(nm, body, [0, 0.005, -0.005], (b) => {
      b.sheet(12, 10, fn, { cu: wingCol(pk === 'fore'), ao: 0, noise: 0.02, flip: false });
    }, { pk, mats: ['wing', 'glow', 'wing'] });
    const fore = mk(sx < 0 ? 'foreL' : 'foreR', wingFn(0.14, 0.12, -0.03, 0.02), 'fore');
    const hind = mk(sx < 0 ? 'hindL' : 'hindR', wingFn(0.1, 0.1, 0.045, 0.0), 'hind');
    if (sx < 0) { fore.scale.x = -1; hind.scale.x = -1; }
    wings.push(fore, hind);
  }
  return (s) => {
    const calm = s.reduced ? 0.55 : 1;
    const f = (6 + clamp(s.moving, 0, 1) * 6) * (s.reduced ? 0.55 : 1);
    const flap = Math.sin(s.t * f * 1.9);
    const ang = (0.1 + (flap * 0.5 + 0.5) * 0.95) * calm + (1 - calm) * 0.4;
    for (let i = 0; i < wings.length; i++) {
      const sgn = i < 2 ? -1 : 1;
      wings[i].rotation.z = sgn * (i % 2 === 1 ? ang * 0.85 + 0.05 : ang);
    }
    body.position.y = 0.15 + Math.sin(s.t * f * 0.95) * 0.012;
    body.rotation.x = Math.sin(s.t * f * 0.95 + 1) * 0.12 - 0.1;
    body.rotation.z = Math.sin(s.t * 1.3) * 0.08;
  };
}

/* ================================================================================================
 * ATEŞ BÖCEĞİ
 * ============================================================================================== */
function atesbocegi(rig) {
  rig.stride = 1;
  rig.attackDur = 0.4;
  rig.glowColor = 0xd8ff4a;
  rig.deathColor = 0xd8ff4a;
  rig.addMat('wing', 'lit', { double: true, opacity: 0.55, rough: 0.5, emissive: 0x0a0e04 });
  const body = rig.node('body', null, [0, 0.125, 0]);
  rig.part('shell', body, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.017, 0.014, 0.038, { p: [0, 0, 0.0], c: 0x3a2a1c, c2: 0x241810, w: 10, h: 7 });
    b.ellipsoid(0.019, 0.015, 0.02, { p: [0, 0.003, -0.03], c: 0xd8452a, w: 8, h: 6 });
    b.ellipsoid(0.011, 0.011, 0.011, { p: [0, 0.0, -0.058], c: 0x1a120c, w: 8, h: 6 });
    b.limb([0, 0.006, -0.062], [0.014, 0.03, -0.09], 0.002, 0.0015, { c: 0x1a120c, cap: 2, w: 4, ao: 0, noise: 0 });
    b.limb([0, 0.006, -0.062], [-0.014, 0.03, -0.09], 0.002, 0.0015, { c: 0x1a120c, cap: 2, w: 4, ao: 0, noise: 0 });
    g.ellipsoid(0.016, 0.013, 0.02, { p: [0, -0.004, 0.05], c: 0xd8ff4a, i: 2.4, w: 10, h: 7 });
    for (const sx of [-1, 1]) g.ellipsoid(0.003, 0.003, 0.003, { p: [sx * 0.008, 0.004, -0.066], c: 0xffffff, i: 1.2, w: 4, h: 3 });
  });
  const halo = rig.glowSprite(body, 0xc8ff40, 0.34, 0.5);
  halo.position.set(0, -0.004, 0.05);
  const wings = [-1, 1].map((sx) => rig.part(sx < 0 ? 'wingL' : 'wingR', body, [sx * 0.008, 0.012, 0.0], (b) => {
    b.ellipsoid(0.05, 0.003, 0.018, { p: [sx * 0.045, 0, 0.012], rot: [0, 0, 0], c: 0xdfe8c8, w: 8, h: 4, ao: 0 });
  }, { pk: 'wing' + (sx < 0 ? 'L' : 'R'), mats: ['wing', 'glow', 'wing'] }));
  return (s) => {
    const calm = s.reduced ? 0.4 : 1;
    // Yavaş nabız (~0,4 Hz): yanıp sönme 3 Hz altında
    const k = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.t * 2.5 + s.variant));
    rig.mats.glow.userData.k = lerp(1, k * 1.2 + 0.2, calm);
    halo.material.userData.k = 0.35 + 0.9 * k;
    halo.scale.setScalar(0.26 + 0.14 * k);
    const f = s.reduced ? 18 : 42;
    const flap = Math.sin(s.t * f) * 0.7 * calm;
    wings[0].rotation.z = -0.3 - flap;
    wings[1].rotation.z = 0.3 + flap;
    body.position.y = 0.125 + Math.sin(s.t * 2.1) * 0.012;
    body.rotation.x = -0.15 + Math.sin(s.t * 1.7) * 0.06;
    body.rotation.z = Math.sin(s.t * 1.1) * 0.1;
  };
}

export const PASSIVE_BUILDERS = Object.freeze({
  tavuk, koyun, ormankedisi, ceylan, balik, kelebek, atesbocegi,
});
