/*
 * KEŞİF render — biyom genişletmesi pasif yaratıkları: tilki, kurbağa, papağan (sim/mobTypes.js ile aynı hitbox ölçüleri).
 * Her kurucu (rig, def) → anim(s, dt). Ayak noktası y=0, ön -Z. Bkz. mobPassive.js (aynı rig sözleşmesi).
 */
import {
  clamp, eye, makeLimb, smoothstep, swingLimb,
} from './mobGeo.js';

/** İki kemikli bacak (mobPassive.leg ile aynı biçim). */
function leg(rig, name, parent, pivot, o) {
  const fh = o.fh === undefined ? 0.05 : o.fh;
  return makeLimb(
    rig, name, parent, pivot, o.up,
    (b) => {
      b.limb([0, 0, 0], [0, -o.up, 0], o.r0, o.r1, { c: o.c, c2: o.c2 === undefined ? o.c : o.c2, cap: 3, w: 8 });
    },
    (b) => {
      b.limb([0, 0, 0], [0, -o.low + fh, 0], o.r1 * 0.95, o.r2, { c: o.cLow === undefined ? o.c : o.cLow, c2: o.c, cap: 3, w: 8 });
      b.ellipsoid(o.r2 * 1.5, o.r2 * 0.95, o.r2 * 2.2, { p: [0, -o.low + o.r2 * 0.8, -o.r2 * 0.9], c: o.fc, w: 8, h: 6 });
    },
    { pkUpper: o.pk + 'U', pkLower: o.pk + 'L' },
  );
}

/* ================================================================================================
 * TİLKİ
 * ============================================================================================== */
function tilki(rig) {
  const V = [
    { fur: 0xd8702a, dark: 0x2a1c14, belly: 0xf6ecdc, tip: 0xfaf4ea, eye: 0xffc83a },
    { fur: 0xb85a22, dark: 0x1c1410, belly: 0xeadcc4, tip: 0xf2e8d8, eye: 0xffd24a },
    { fur: 0xe4e8ec, dark: 0x8a9298, belly: 0xffffff, tip: 0xffffff, eye: 0x7cd8ff },
  ][rig.variant];
  rig.stride = 8;
  rig.attackDur = 0.5;
  rig.glowColor = V.eye;
  rig.deathColor = V.eye;
  const coat = (x, y, z, nx, ny) => (ny < -0.3 ? V.belly : V.fur);
  const body = rig.part('body', null, [0, 0.3, 0.06], (b) => {
    b.ellipsoid(0.115, 0.11, 0.23, { c: V.fur, cfn: coat, w: 18, h: 12 });
    b.ellipsoid(0.1, 0.1, 0.1, { p: [0, 0.005, -0.15], c: V.fur, cfn: coat, w: 10, h: 7 });
    b.ellipsoid(0.095, 0.095, 0.1, { p: [0, 0.0, 0.16], c: V.fur, cfn: coat, w: 10, h: 7 });
  });
  const head = rig.part('head', body, [0, 0.07, -0.23], (b, g) => {
    b.ellipsoid(0.095, 0.08, 0.085, { p: [0, 0.02, -0.035], c: V.fur, w: 12, h: 8 });
    b.ellipsoid(0.1, 0.045, 0.06, { p: [0, 0.0, -0.04], c: V.belly, w: 10, h: 6 });
    // uzun sivri burun
    b.ellipsoid(0.045, 0.04, 0.085, { p: [0, -0.005, -0.12], c: V.fur, c2: V.belly, w: 10, h: 7 });
    b.ellipsoid(0.016, 0.012, 0.012, { p: [0, 0.005, -0.2], c: 0x0e0a08, w: 6, h: 4, ao: 0 });
    for (const sx of [-1, 1]) {
      b.spike([sx * 0.055, 0.075, -0.015], [sx * 0.08, 0.2, 0.0], 0.046, { c: V.fur, s: [1, 1, 0.45], w: 6 });
      b.spike([sx * 0.057, 0.08, -0.02], [sx * 0.078, 0.17, -0.005], 0.026, { c: V.dark, s: [1, 1, 0.4], w: 6 });
      g.ellipsoid(0.022, 0.016, 0.01, { p: [sx * 0.048, 0.04, -0.078], rot: [0, sx * 0.3, sx * 0.3], c: V.eye, i: 1.3, w: 8, h: 6 });
      b.ellipsoid(0.004, 0.014, 0.003, { p: [sx * 0.048, 0.04, -0.088], c: 0x0a0a0a, w: 5, h: 4, ao: 0 });
    }
  });
  const tail = [];
  let par = body;
  const tl = rig.level === 0 ? 4 : 6;
  for (let i = 0; i < tl; i++) {
    const seg = rig.part('tail' + i, par, i === 0 ? [0, 0.03, 0.23] : [0, 0, 0.085], (b) => {
      const rr = 0.045 + Math.sin((i / (tl - 1)) * Math.PI) * 0.03;
      b.limb([0, 0, 0], [0, 0, 0.09], rr, rr, {
        c: i >= tl - 2 ? V.tip : V.fur, c2: i >= tl - 2 ? V.tip : V.fur, cap: 3, w: 8,
      });
    }, { pk: 'tail' + i });
    tail.push(seg);
    par = seg;
  }
  const o = (pk, r0) => ({
    up: 0.14, low: 0.14, r0, r1: 0.028, r2: 0.022, c: V.fur, cLow: V.dark, fc: V.dark, foot: 'paw', pk,
  });
  const L = {
    fl: leg(rig, 'legFL', null, [-0.07, 0.28, -0.1], o('legF', 0.04)),
    fr: leg(rig, 'legFR', null, [0.07, 0.28, -0.1], o('legF', 0.04)),
    hl: leg(rig, 'legHL', null, [-0.075, 0.28, 0.23], o('legH', 0.055)),
    hr: leg(rig, 'legHR', null, [0.075, 0.28, 0.23], o('legH', 0.055)),
  };
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const amp = 0.75 * m;
    swingLimb(L.fl, w, amp, 0.85, 1);
    swingLimb(L.hr, w, amp, 0.85, -1);
    swingLimb(L.fr, w + Math.PI, amp, 0.85, 1);
    swingLimb(L.hl, w + Math.PI, amp, 0.85, -1);
    // koşarken gövde yay gibi uzanır; dururken burun yere (koklama)
    const sniff = smoothstep(0.7, 0.85, Math.sin(s.t * 0.23 + s.variant * 2)) * (1 - Math.min(1, m * 2));
    body.position.y = 0.3 + Math.sin(w * 2) * 0.014 * m + Math.sin(s.t * 1.7) * 0.003;
    body.rotation.x = Math.sin(w * 2 + 0.5) * 0.05 * m;
    head.rotation.y = s.headYaw * 0.9;
    head.rotation.x = sniff * 0.7 + s.headPitch * 0.6 + Math.sin(w * 2) * 0.04 * m - s.hit * 0.3;
    const calm = s.reduced ? 0.4 : 1;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.y = Math.sin(s.t * (1.3 + m * 1.2) - i * 0.6) * (0.14 + 0.05 * i) * calm;
      tail[i].rotation.x = i === 0 ? -0.55 - m * 0.45 : (-0.14 - 0.05 * Math.sin(s.t * 0.8 + i));
    }
  };
}

/* ================================================================================================
 * KURBAĞA
 * ============================================================================================== */
function kurbaga(rig) {
  const V = [
    { top: 0x4c9a3a, mid: 0x3a7a2c, belly: 0xe6e2a8, spot: 0x2a5a22, eye: 0xf2c43a },
    { top: 0x7a8a34, mid: 0x5a6a26, belly: 0xd8cf9a, spot: 0x3e4a1a, eye: 0xf0a030 },
    { top: 0x2f9a8a, mid: 0x1f7a6a, belly: 0xf4f0b8, spot: 0xffd23a, eye: 0xff7a3a },
  ][rig.variant];
  rig.stride = 5;
  rig.attackDur = 0.4;
  rig.glowColor = V.eye;
  rig.deathColor = V.eye;
  const pat = (x, y, z, nx, ny) => {
    if (ny < -0.25) return V.belly;
    if (ny > 0.3 && Math.sin(x * 38) * Math.sin(z * 31) > 0.55) return V.spot;
    return ny > 0.1 ? V.top : V.mid;
  };
  const body = rig.part('body', null, [0, 0.1, 0.02], (b, g) => {
    b.ellipsoid(0.13, 0.095, 0.16, { c: V.top, cfn: pat, w: 16, h: 10 });
    b.ellipsoid(0.115, 0.075, 0.1, { p: [0, 0.0, -0.1], c: V.top, cfn: pat, w: 12, h: 8 });
    // geniş ağız çizgisi + kabarık gerdan
    b.ellipsoid(0.1, 0.012, 0.08, { p: [0, -0.015, -0.13], c: V.mid, w: 10, h: 4, ao: 0 });
    b.ellipsoid(0.07, 0.04, 0.06, { p: [0, -0.06, -0.08], c: V.belly, w: 10, h: 6 });
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.04, 0.04, 0.04, { p: [sx * 0.065, 0.085, -0.095], c: V.top, w: 8, h: 6 });
      g.ellipsoid(0.026, 0.026, 0.02, { p: [sx * 0.065, 0.095, -0.12], c: V.eye, i: 1.1, w: 8, h: 6 });
      b.ellipsoid(0.006, 0.02, 0.006, { p: [sx * 0.065, 0.095, -0.138], c: 0x0a0a0a, w: 5, h: 4, ao: 0 });
    }
  });
  const hind = [-1, 1].map((sx) => rig.part(sx < 0 ? 'hindL' : 'hindR', body, [sx * 0.1, -0.02, 0.1], (b) => {
    b.ellipsoid(0.04, 0.075, 0.1, { p: [sx * 0.03, 0.0, 0.04], rot: [0.4, 0, sx * 0.2], c: V.top, cfn: pat, w: 10, h: 7 });
    b.limb([sx * 0.04, -0.03, 0.1], [sx * 0.06, -0.075, 0.0], 0.026, 0.016, { c: V.mid, cap: 3, w: 7 });
    b.ellipsoid(0.05, 0.012, 0.075, { p: [sx * 0.07, -0.085, -0.04], c: V.mid, w: 8, h: 5 });
  }, { pk: 'hind' + (sx < 0 ? 'L' : 'R') }));
  const front = [-1, 1].map((sx) => rig.part(sx < 0 ? 'armL' : 'armR', body, [sx * 0.085, -0.03, -0.08], (b) => {
    b.limb([0, 0, 0], [sx * 0.02, -0.05, -0.02], 0.018, 0.012, { c: V.mid, cap: 3, w: 6 });
    b.ellipsoid(0.03, 0.01, 0.04, { p: [sx * 0.025, -0.07, -0.04], c: V.mid, w: 8, h: 5 });
  }, { pk: 'arm' + (sx < 0 ? 'L' : 'R') }));
  const sac = rig.part('sac', body, [0, -0.05, -0.12], (b) => {
    b.ellipsoid(0.045, 0.035, 0.04, { c: V.belly, c2: V.belly, w: 10, h: 6 });
  });
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    // sıçrama: yürüme fazı → yay (arka bacaklar gerilir, gövde havalanır)
    const hop = Math.max(0, Math.sin(s.walk)) * m;
    body.position.y = 0.1 + hop * 0.06 + Math.sin(s.t * 1.6) * 0.002;
    body.rotation.x = -hop * 0.35 + s.headPitch * 0.2;
    for (let i = 0; i < 2; i++) {
      hind[i].rotation.x = -hop * 0.9 + (1 - Math.min(1, m)) * 0.15;
      front[i].rotation.x = hop * 0.5;
    }
    // gerdan kabarması (tıkırtı)
    const inflate = 0.5 + 0.5 * Math.sin(s.t * (s.reduced ? 1.2 : 2.6) + s.variant);
    sac.scale.set(1 + inflate * 0.35, 1 + inflate * 0.6, 1 + inflate * 0.35);
    body.rotation.y = s.headYaw * 0.35;
  };
}

/* ================================================================================================
 * PAPAĞAN
 * ============================================================================================== */
function papagan(rig) {
  const V = [
    { main: 0xd82a2a, wing: 0x2f6fe0, wing2: 0xf2c82a, tail: 0xd82a2a, face: 0xf6f0e0, beak: 0xf4ecd8 },
    { main: 0x2f9a4a, wing: 0x1f6a38, wing2: 0xf2d63a, tail: 0x2a8a8a, face: 0xe6f0d0, beak: 0x2a2a2a },
    { main: 0x3a7ae8, wing: 0x1f4ab8, wing2: 0xffd23a, tail: 0x1f4ab8, face: 0xf4f0e8, beak: 0x202020 },
  ][rig.variant];
  rig.stride = 1;
  rig.attackDur = 0.4;
  rig.glowColor = V.main;
  rig.deathColor = V.main;
  const body = rig.node('body', null, [0, 0.24, 0]);
  rig.part('torso', body, [0, 0, 0], (b) => {
    b.ellipsoid(0.075, 0.105, 0.075, { p: [0, 0, 0.0], rot: [-0.35, 0, 0], c: V.main, c2: V.main, w: 12, h: 9 });
    b.ellipsoid(0.07, 0.05, 0.07, { p: [0, -0.09, 0.05], rot: [-0.35, 0, 0], c: V.main, c2: V.wing, w: 8, h: 6 });
    // uzun kuyruk
    b.limb([0, -0.1, 0.07], [0, -0.28, 0.2], 0.03, 0.012, { c: V.tail, c2: V.wing, cap: 3, w: 8 });
    b.limb([0.015, -0.1, 0.07], [0.04, -0.26, 0.19], 0.018, 0.008, { c: V.wing2, cap: 2, w: 6, ao: 0, noise: 0 });
  });
  const head = rig.part('head', body, [0, 0.12, -0.04], (b, g) => {
    b.ellipsoid(0.058, 0.058, 0.06, { p: [0, 0.02, 0], c: V.main, w: 12, h: 8 });
    b.ellipsoid(0.04, 0.03, 0.03, { p: [0, 0.015, -0.045], c: V.face, w: 8, h: 6 });
    // kancalı gaga: üst yarı aşağı kıvrılır
    b.limb([0, 0.005, -0.055], [0, -0.005, -0.098], 0.026, 0.014, { c: V.beak, cap: 3, w: 8 });
    b.spike([0, -0.002, -0.09], [0, -0.05, -0.088], 0.018, { c: V.beak, w: 6 });
    for (const sx of [-1, 1]) {
      eye(b, g, sx * 0.04, 0.04, -0.03, 0.014, { c: 0x0e0a08 });
      b.ellipsoid(0.02, 0.02, 0.012, { p: [sx * 0.04, 0.04, -0.03], c: V.face, w: 8, h: 6, ao: 0 });
    }
  });
  const wings = [-1, 1].map((sx) => rig.part(sx < 0 ? 'wingL' : 'wingR', body, [sx * 0.07, 0.04, 0.02], (b) => {
    b.ellipsoid(0.12, 0.012, 0.075, { p: [sx * 0.12, -0.01, 0.025], rot: [0, 0, sx * 0.08], c: V.wing, c2: V.wing2, w: 12, h: 6 });
    b.ellipsoid(0.07, 0.01, 0.05, { p: [sx * 0.06, -0.008, 0.0], c: V.main, w: 8, h: 5 });
  }, { pk: 'wing' + (sx < 0 ? 'L' : 'R') }));
  return (s) => {
    const calm = s.reduced ? 0.5 : 1;
    const m = clamp(s.moving, 0, 1.2);
    const f = (5 + m * 5) * calm;
    const flap = Math.sin(s.t * f * 1.9);
    const ang = (0.1 + (flap * 0.5 + 0.5) * 0.9) * calm + (1 - calm) * 0.35;
    wings[0].rotation.z = -ang * 1.1;
    wings[1].rotation.z = ang * 1.1;
    wings[0].rotation.x = flap * 0.08 * calm;
    wings[1].rotation.x = flap * 0.08 * calm;
    body.position.y = 0.24 + Math.sin(s.t * f * 0.95) * 0.02;
    body.rotation.x = -0.2 + Math.sin(s.t * 1.3) * 0.05;
    head.rotation.y = s.headYaw * 0.8 + Math.sin(s.t * 0.9 + s.variant) * 0.15 * calm;
    head.rotation.x = s.headPitch * 0.5 - s.hit * 0.3;
  };
}

export const PASSIVE_BIOME_BUILDERS = Object.freeze({ tilki, kurbaga, papagan });
