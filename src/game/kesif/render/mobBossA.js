/*
 * KEŞİF render — boss modelleri I: Kök Ana (Fısıldayan Ormanlar) ve Taş Bekçi (Yanık Kanyonlar).
 * Aşamalar (state.phase 0..2, yumuşak geçiş): renkler, çiçek açılması, tendril hızları, zırh parçaları.
 * Saldırı adları mobTypes.js phases.attacks ile aynıdır; 'slam' / 'vine' / 'roar' / 'step' işaretleri onCue ile bildirilir.
 */
import {
  TAU, clamp, hash1, lerpHex, makeLimb, smoothstep, swingLimb,
} from './mobGeo.js';

/* ================================================================================================
 * KÖK ANA — kök ve sarmaşıktan örülü bitki titanı: parlayan kalp, açılan dev çiçek, kamçılayan kökler.
 * ============================================================================================== */
function kokana(rig) {
  const BARK = { a: 0x73522c, b: 0x3a2816, moss: 0x55943a };
  rig.stride = 3.4;
  rig.attackDur = 2.0;
  rig.attackKinds = ['ezme', 'sarmaşık', 'sporlar'];
  rig.attackDurs = { ezme: 2.0, sarmaşık: 2.2, sporlar: 2.1 };
  rig.glowColor = 0x8aff5a;
  rig.deathColor = 0x9aff6a;
  rig.addMat('bark', 'lit', { rough: 0.95 });
  rig.addMat('petal', 'lit', { double: true, rough: 0.55, emissive: 0x3a0a28 });
  rig.addMat('leaf', 'lit', { double: true, rough: 0.7, emissive: 0x0a1a06 });
  rig.addMat('core', 'glow', {});
  rig.addMat('spore', 'glow', {});
  const MB = ['bark', 'glow', 'bark'];
  const mossy = (x, y, z, nx, ny) => {
    if (ny > 0.5 && hash1(Math.floor(x * 5) + Math.floor(z * 5) * 9.1 + Math.floor(y * 4) * 3.3) > 0.35) return BARK.moss;
    return Math.sin(x * 9 + z * 7 + y * 3) > 0.4 ? BARK.a : BARK.b;
  };

  // yer kökleri (statik): gövde tabanından yayılan payandalar
  rig.part('base', null, [0, 0, 0], (b) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3;
      const dx = Math.sin(a);
      const dz = -Math.cos(a);
      b.tube([[dx * 0.4, 1.6, dz * 0.4], [dx * 0.95, 1.0, dz * 0.95], [dx * 1.5, 0.42, dz * 1.5], [dx * 1.85, 0.03, dz * 1.85]],
        [0.4, 0.3, 0.2, 0.09], { cfn: mossy, w: 9, noise: 0.04 });
    }
    b.ellipsoid(1.25, 0.5, 1.25, { p: [0, 0.5, 0], cfn: mossy, w: 20, h: 9, e: 0.8 });
  }, { mats: MB });

  const trunk = rig.part('trunk', null, [0, 1.0, 0], (b, g) => {
    const prof = [[0.01, -0.4], [0.95, -0.3], [1.0, 0.1], [0.85, 0.8], [0.7, 1.5], [0.66, 2.1], [0.8, 2.5], [0.95, 2.85], [0.85, 3.15], [0.5, 3.4], [0.01, 3.55]];
    b.lathe(prof, { w: 24, cfn: mossy, noise: 0.04, rad: (a, j) => 1 + 0.09 * Math.sin(a * 6 + j * 0.9) + 0.05 * Math.sin(a * 11 - j * 1.7) });
    // yüz: oyuk gözler, kaş çıkıntısı, çatlak ağız
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.2, 0.13, 0.14, { p: [sx * 0.34, 2.55, -0.74], rot: [0, 0, sx * -0.3], c: 0x120c06, w: 10, h: 7, ao: 0, noise: 0 });
      g.ellipsoid(0.13, 0.06, 0.06, { p: [sx * 0.34, 2.55, -0.84], rot: [0, 0, sx * -0.3], c: 0xffffff, i: 2.6, w: 10, h: 6 });
      b.ellipsoid(0.26, 0.09, 0.14, { p: [sx * 0.34, 2.74, -0.76], rot: [0, 0, sx * 0.35], c: BARK.b, w: 10, h: 6 });
    }
    b.ellipsoid(0.3, 0.07, 0.1, { p: [0, 2.15, -0.7], c: 0x120c06, w: 10, h: 6, ao: 0, noise: 0 });
    // kalp boşluğu
    b.ellipsoid(0.45, 0.55, 0.22, { p: [0, 1.5, -0.62], c: 0x140e08, w: 14, h: 9, ao: 0, noise: 0 });
    for (const sx of [-1, 1]) {
      b.tube([[sx * 0.5, 0.95, -0.6], [sx * 0.42, 1.45, -0.8], [sx * 0.12, 2.0, -0.7]], [0.1, 0.09, 0.06], { c: BARK.a, c2: BARK.b, w: 7 });
    }
  }, { mats: MB });
  rig.part('heart', trunk, [0, 1.5, -0.7], (b, g) => {
    g.ellipsoid(0.27, 0.31, 0.22, { c: 0xffffff, i: 1.9, w: 14, h: 9 });
  }, { mats: ['bark', 'core', 'bark'] });
  // yaprak halkası
  rig.part('leaves', trunk, [0, 2.9, 0], (b) => {
    const leaf = (u, v) => [(u - 0.5) * 0.9 * Math.sin(Math.PI * Math.pow(v, 0.8)), v * 1.1 - 0.1, -v * v * 0.5];
    const n = rig.level === 0 ? 5 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.2;
      b.sheet(5, 8, leaf, {
        p: [Math.sin(a) * 0.85, 0.05 * Math.sin(i * 2), -Math.cos(a) * 0.85], rot: [0.15, -a + Math.PI, 0.0],
        cu: (u, v) => (Math.abs(u - 0.5) < 0.035 ? 0x9ad060 : (v < 0.2 ? 0x2a5a22 : 0x3f8a2e)), ao: 0.1, noise: 0.04,
      });
    }
  }, { mats: ['leaf', 'glow', 'leaf'] });

  // dev çiçek: taç yaprakları menteşelerde + pistil
  const crown = rig.node('crown', trunk, [0, 3.4, 0]);
  const petal = (u, v) => {
    const w = 0.85 * Math.sin(Math.PI * Math.pow(Math.max(v, 0.001), 0.7)) * (1 - 0.2 * v);
    return [(u - 0.5) * w, v * 1.65, -v * v * 0.4 + Math.sin(u * Math.PI) * 0.06];
  };
  const NP = rig.level === 0 ? 6 : 8;
  const petals = [];
  for (let i = 0; i < NP; i++) {
    const yaw = rig.node('petalYaw' + i, crown, [0, 0, 0]);
    yaw.rotation.y = (i / NP) * TAU;
    petals.push(rig.part('petal' + i, yaw, [0, 0, -0.3], (b) => {
      b.sheet(6, 11, petal, {
        cu: (u, v) => (Math.abs(u - 0.5) < 0.03 && v > 0.1 ? 0xffd0e8 : (v < 0.14 ? 0x2f6a2a : (v > 0.9 ? 0xffa6d4 : lerpHex(0xb82e80, 0xe04aa0, v)))),
        ao: 0.12, noise: 0.03,
      });
    }, { pk: 'petal', mats: ['petal', 'glow', 'petal'] }));
  }
  const pistil = rig.part('pistil', crown, [0, 0.2, 0], (b, g) => {
    g.ellipsoid(0.3, 0.3, 0.3, { p: [0, 0.25, 0], c: 0xffffff, i: 2.0, w: 14, h: 9 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const hgt = 0.7 + (i % 3) * 0.18;
      g.limb([Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12], [Math.cos(a) * 0.3, 0.3 + hgt, Math.sin(a) * 0.3], 0.014, 0.01, { c: 0xffffff, i: 1.5, cap: 2, w: 4 });
      g.ellipsoid(0.04, 0.04, 0.04, { p: [Math.cos(a) * 0.3, 0.32 + hgt, Math.sin(a) * 0.3], c: 0xffffff, i: 2.0, w: 6, h: 4 });
    }
  }, { mats: ['bark', 'core', 'bark'] });

  // kollar: iki kemikli kök kolları, pençe parmaklı
  const arms = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const sh = rig.part('arm' + tag, trunk, [sx * 0.9, 1.95, -0.05], (b) => {
      b.ellipsoid(0.42, 0.38, 0.4, { cfn: mossy, w: 14, h: 9 });
      b.tube([[0, 0, 0], [sx * 0.08, -0.4, -0.08], [sx * 0.05, -0.8, -0.1], [0, -1.2, 0]], [0.36, 0.32, 0.3, 0.27], { cfn: mossy, w: 9, noise: 0.04 });
      for (let i = 0; i < 3; i++) b.spike([sx * 0.25, -0.2 - i * 0.3, -0.1], [sx * 0.5, -0.1 - i * 0.3, -0.2], 0.07, { c: BARK.b, w: 5 });
    }, { pk: 'armU' + tag, mats: MB });
    const fore = rig.part('fore' + tag, sh, [0, -1.2, 0], (b) => {
      b.ellipsoid(0.3, 0.28, 0.3, { cfn: mossy, w: 12, h: 8 });
      b.tube([[0, 0, 0], [sx * 0.05, -0.4, -0.12], [sx * 0.03, -0.8, -0.2], [0, -1.15, -0.2]], [0.28, 0.26, 0.22, 0.18], { cfn: mossy, w: 9, noise: 0.04 });
      b.ellipsoid(0.26, 0.2, 0.26, { p: [0, -1.25, -0.2], c: BARK.a, c2: BARK.b, w: 12, h: 8 });
      for (let k = 0; k < 4; k++) {
        const a = (k - 1.5) * 0.5;
        b.tube([[Math.sin(a) * 0.12, -1.3, -0.2 - Math.cos(a) * 0.05], [Math.sin(a) * 0.3, -1.5, -0.4], [Math.sin(a) * 0.38, -1.68, -0.6]], [0.1, 0.07, 0.015], { c: BARK.a, c2: BARK.b, w: 6 });
      }
    }, { pk: 'foreArm' + tag, mats: MB });
    return { sh, fore, sx };
  });

  // dinamik kamçılar: yer kökleri + sarkan sarmaşıklar
  const GT = [];
  const NG = rig.level === 0 ? 5 : 8;
  for (let i = 0; i < NG; i++) {
    const t = rig.tendril(null, {
      segments: 11, radius: (u) => 0.26 * (1 - u) * (1 - u) + 0.03, color0: BARK.b, color1: 0x4a7a2a, seed: i, length: 1.2, name: 'root' + i,
    });
    GT.push({ t, a: (i / NG) * TAU + 0.15 });
  }
  const HV = [];
  for (let i = 0; i < 6; i++) {
    const t = rig.tendril(crown, {
      segments: 9, radius: (u) => 0.07 * (1 - u) + 0.012, color0: 0x3f6a2a, color1: 0x7ac04a, seed: 10 + i, length: 1.4, name: 'vine' + i,
    });
    HV.push({ t, a: (i / 6) * TAU + 0.5 });
  }
  const spores = rig.part('spores', crown, [0, 0.6, 0], (b, g) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.ellipsoid(0.07, 0.07, 0.07, { p: [Math.cos(a) * 1.15, Math.sin(i * 1.7) * 0.5, Math.sin(a) * 1.15], c: 0xffffff, i: 1.5, w: 6, h: 5 });
    }
  }, { mats: ['bark', 'spore', 'bark'] });

  const C_EYE = [0xffc840, 0xff8a28, 0xff3a30];
  const C_CORE = [0x72ff5a, 0xffb02a, 0xff3a5a];
  let lastSg = true;
  let slamN = -1;
  let cueN = -1;
  const mix = (arr, f) => (f < 1 ? lerpHex(arr[0], arr[1], f) : lerpHex(arr[1], arr[2], f - 1));

  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const pf = s.pf;
    const kind = s.attackKind;
    const atk = s.attack > 0;
    const calm = s.reduced ? 0.4 : 1;
    const open = 0.5 * smoothstep(0.3, 1.0, pf) + 0.5 * smoothstep(1.2, 2.0, pf);
    const spd = 1 + pf * 0.35;
    const ezme = atk && kind === 'ezme';
    const vine = atk && kind === 'sarmaşık';
    const spor = atk && kind === 'sporlar';
    // gövde: nefes, salınım, ağır yürüyüş
    trunk.position.y = 1.0 + Math.abs(Math.sin(w)) * 0.06 * m + Math.sin(s.t * 1.1) * 0.015;
    trunk.scale.y = 1 + Math.sin(s.t * 1.1) * 0.012;
    trunk.rotation.z = Math.sin(s.t * 0.5) * 0.02 * calm + Math.sin(w) * 0.05 * m;
    trunk.rotation.x = -0.03 * m + (ezme ? s.wind * 0.3 - s.hit * 0.38 : 0) + (spor ? -s.wind * 0.12 + Math.sin(s.t * 38) * 0.012 * s.hit * calm : 0);
    trunk.rotation.y = s.headYaw * 0.25;
    if (m > 0.15) {
      const sg = Math.sin(w) >= 0;
      if (sg !== lastSg) { lastSg = sg; rig.cue('step', sg ? 0.7 : -0.7, 0, 0); }
    }
    // çiçek
    const flare = spor ? 0.5 * s.hit + 0.15 * s.wind : vine ? 0.2 * s.hit : 0;
    for (let i = 0; i < petals.length; i++) {
      petals[i].rotation.x = 0.4 - (1.5 * clamp(open + flare, 0, 1.15)) + Math.sin(s.t * 1.3 + i) * 0.03 * calm;
    }
    pistil.scale.setScalar(0.55 + open * 0.7 + (spor ? s.hit * 0.5 : 0));
    pistil.position.y = 0.2 + open * 0.35;
    crown.rotation.y = s.t * 0.12 * calm;
    // kollar
    for (let i = 0; i < 2; i++) {
      const A = arms[i];
      const dir = A.sx;
      let ux = 0.12 + Math.sin(w + (i ? Math.PI : 0)) * 0.3 * m + Math.sin(s.t * 0.9 + i) * 0.03;
      let uz = dir * 0.28;
      let fx = 0.25 + Math.sin(s.t * 1.3 + i) * 0.04;
      if (ezme) { ux += 2.6 * s.wind - 0.3 * s.hit; fx += 0.9 * s.wind; uz = dir * (0.3 - 0.15 * s.wind); }
      if (vine) { uz = dir * (0.3 + 1.15 * s.wind - 0.5 * s.hit); ux += 0.4 * s.wind; fx += 0.2 * s.hit; }
      if (spor) { uz = dir * (0.3 + 1.7 * s.wind); ux += 0.7 * s.wind; fx += 0.5 * s.wind; }
      A.sh.rotation.x = ux;
      A.sh.rotation.z = uz;
      A.fore.rotation.x = fx;
    }
    // kamçılar
    const aim = s.hasAim ? s.aimYaw : 0;
    const lash = vine ? Math.min(1, s.wind * 0.6 + s.hit * 1.2) : 0;
    for (let i = 0; i < GT.length; i++) {
      const G = GT[i];
      const dx = Math.sin(G.a);
      const dz = -Math.cos(G.a);
      const px = -dz;
      const pz = dx;
      const wgt = Math.max(0, Math.cos(G.a - aim));
      const len = 1.15 + 0.35 * pf + lash * (0.7 + wgt * 0.7);
      const lift = 0.35 + 0.2 * Math.sin(s.t * 1.3 * spd + i) * calm + lash * (0.9 + wgt * 0.9);
      const amp = (0.18 + 0.06 * pf) * (1 + lash * 1.5) * calm + 0.04;
      const ph = s.t * (2.2 * spd + lash * 3) * (calm * 0.7 + 0.3) + i * 1.3;
      const bx = dx * 0.9;
      const bz = dz * 0.9;
      for (let j = 0; j <= 11; j++) {
        const u = j / 11;
        const sw = Math.sin(ph - u * 5.5) * amp * u;
        const hgt = 0.25 + lift * Math.sin(Math.PI * Math.min(1, u * 0.95)) * (1 - 0.25 * u) * (0.55 + 0.45 * Math.sin(ph * 0.5 + u * 2));
        G.t.set(j, bx + dx * len * u + px * sw, hgt * (j === 0 ? 0.6 : 1), bz + dz * len * u + pz * sw);
      }
      G.t.refresh();
    }
    for (let i = 0; i < HV.length; i++) {
      const H = HV[i];
      const ca = Math.cos(H.a);
      const sa = Math.sin(H.a);
      for (let j = 0; j <= 9; j++) {
        const u = j / 9;
        const sw = Math.sin(s.t * 1.2 * calm + i * 1.7 - u * 3) * 0.12 * u;
        H.t.set(j, ca * (0.7 + 0.25 * u) + sa * sw, -u * 1.6 + 0.1, sa * (0.7 + 0.25 * u) - ca * sw);
      }
      H.t.refresh();
    }
    spores.visible = pf > 0.55 || spor;
    spores.rotation.y = s.t * (0.5 + s.hit * 3) * calm;
    spores.scale.setScalar(0.4 + 0.6 * smoothstep(0.5, 1.4, pf) + (spor ? 0.5 * s.wind + 0.4 * s.hit : 0));
    spores.position.y = 0.6 + Math.sin(s.t * 0.8) * 0.1;
    // renkler ve kalp atışı (~1 Hz)
    const beat = 0.5 + 0.5 * Math.sin(s.t * (6 + pf * 1.5) * calm);
    const core = rig.mats.core;
    core.userData.baseColor.setHex(mix(C_CORE, pf));
    core.userData.k = 0.75 + 0.3 * beat + (spor ? s.hit * 0.8 : 0) + (ezme ? s.hit * 0.3 : 0);
    rig.mats.glow.userData.baseColor.setHex(mix(C_EYE, pf));
    rig.mats.glow.userData.k = 0.95 + 0.1 * Math.sin(s.t * 2.1) + s.hit * 0.5;
    rig.mats.spore.userData.baseColor.setHex(mix(C_CORE, pf));
    rig.mats.spore.userData.k = 0.8 + 0.3 * beat;
    // işaretler
    if (ezme && s.attack >= 0.5 && slamN !== s.attackN) { slamN = s.attackN; rig.cue('slam', 0, 0.1, -2.0); }
    if ((vine || spor) && s.attack >= 0.5 && cueN !== s.attackN) {
      cueN = s.attackN;
      rig.cue(vine ? 'vine' : 'roar', 0, vine ? 0.6 : 4.5, vine ? -2.2 : 0);
    }
  };
}

/* ================================================================================================
 * TAŞ BEKÇİ — yosunlu taş golem: parlayan rün çatlakları, yer şoku, aşamalarda kopan zırh plakaları.
 * ============================================================================================== */
function tasbekci(rig) {
  const ST = { a: 0x9c9c94, b: 0x5e5e58, c: 0x7c7468, moss: 0x5a8e36 };
  rig.stride = 2.6;
  rig.attackDur = 2.2;
  rig.attackKinds = ['ezme', 'şok', 'yumruk'];
  rig.attackDurs = { ezme: 2.2, şok: 2.2, yumruk: 1.6 };
  rig.glowColor = 0x5af0ff;
  rig.deathColor = 0xffe0a0;
  rig.addMat('stone', 'lit', { rough: 0.96 });
  const MS = ['stone', 'glow', 'stone'];
  const rock = (x, y, z, nx, ny) => {
    if (ny > 0.62 && hash1(Math.floor(x * 6) + Math.floor(z * 6) * 7.7 + Math.floor(y * 3) * 2.9) > 0.3) return ST.moss;
    return hash1(Math.floor(x * 5) * 3.3 + Math.floor(y * 5) * 5.1 + Math.floor(z * 5) * 1.7) > 0.62 ? ST.c : (ny < 0 ? ST.b : ST.a);
  };
  const R = (o = {}) => ({ cfn: rock, e: 0.6, w: 16, h: 10, noise: 0.05, ...o });
  const hips = rig.part('hips', null, [0, 1.9, 0], (b) => {
    b.ellipsoid(0.66, 0.42, 0.52, R());
    b.ellipsoid(0.5, 0.2, 0.45, R({ p: [0, -0.3, 0] }));
  }, { mats: MS });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.44, -0.15, 0], 0.95,
    (b) => { b.ellipsoid(0.44, 0.58, 0.44, R({ p: [0, -0.48, 0] })); },
    (b, g) => {
      b.ellipsoid(0.38, 0.45, 0.4, R({ p: [0, -0.4, 0] }));
      b.ellipsoid(0.52, 0.17, 0.66, R({ p: [0, -0.6, -0.1], e: 0.5 }));
      g.torus(0.4, 0.028, { p: [0, -0.1, 0], c: 0xffffff, i: 1.5, w: 16, m: 5 });
    },
    { pkUpper: 'legU', pkLower: 'legLo', mats: MS },
  ));
  const torso = rig.part('torso', hips, [0, 0.5, 0], (b, g) => {
    b.ellipsoid(0.72, 0.4, 0.52, R({ p: [0, 0.1, 0] }));
    b.ellipsoid(0.9, 0.88, 0.62, R({ p: [0, 0.84, 0] }));
    b.ellipsoid(0.74, 0.52, 0.42, R({ p: [0, 1.0, 0.36] }));
    // göğüs rünü: halka + semboller
    g.torus(0.36, 0.032, { p: [0, 0.8, -0.67], rot: [Math.PI / 2, 0, 0], c: 0xffffff, i: 1.8, w: 22, m: 5 });
    g.ellipsoid(0.1, 0.16, 0.035, { p: [0, 0.8, -0.67], rot: [0, 0, Math.PI / 4], c: 0xffffff, i: 2.0, w: 8, h: 6 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      g.ellipsoid(0.04, 0.04, 0.03, { p: [Math.cos(a) * 0.24, 0.8 + Math.sin(a) * 0.24, -0.68], c: 0xffffff, i: 1.8, w: 6, h: 4 });
    }
    g.limb([0, 0.42, -0.66], [0, 0.0, -0.5], 0.014, 0.01, { c: 0xffffff, i: 1.4, cap: 2, w: 4 });
    g.limb([-0.5, 0.95, -0.55], [-0.2, 0.9, -0.67], 0.012, 0.01, { c: 0xffffff, i: 1.4, cap: 2, w: 4 });
    g.limb([0.5, 0.95, -0.55], [0.2, 0.9, -0.67], 0.012, 0.01, { c: 0xffffff, i: 1.4, cap: 2, w: 4 });
    // sırtta yosun yığını
    b.ellipsoid(0.5, 0.14, 0.32, { p: [0, 1.52, 0.36], c: ST.moss, c2: 0x3a6a22, w: 12, h: 6 });
  }, { mats: MS });
  const head = rig.part('head', torso, [0, 1.5, -0.05], (b, g) => {
    b.ellipsoid(0.44, 0.4, 0.42, R({ p: [0, 0.3, -0.05] }));
    b.ellipsoid(0.42, 0.11, 0.22, R({ p: [0, 0.46, -0.3], c: ST.b, e: 0.5, cfn: undefined }));
    b.ellipsoid(0.3, 0.15, 0.26, R({ p: [0, 0.03, -0.18] }));
    g.ellipsoid(0.3, 0.045, 0.06, { p: [0, 0.34, -0.43], c: 0xffffff, i: 2.6, w: 12, h: 6 });
    g.ellipsoid(0.05, 0.1, 0.03, { p: [0, 0.58, -0.37], rot: [0, 0, Math.PI / 4], c: 0xffffff, i: 2.0, w: 6, h: 5 });
    b.ellipsoid(0.36, 0.09, 0.3, { p: [0, 0.66, -0.02], c: ST.moss, c2: 0x3a6a22, w: 10, h: 5 });
  }, { mats: MS });
  const arms = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const up = rig.part('arm' + tag, torso, [sx * 0.96, 1.3, 0], (b, g) => {
      b.ellipsoid(0.52, 0.46, 0.48, R({ p: [0, 0.05, 0] }));
      b.ellipsoid(0.42, 0.09, 0.36, { p: [0, 0.5, 0], c: ST.moss, c2: 0x3a6a22, w: 10, h: 5 });
      b.ellipsoid(0.37, 0.62, 0.37, R({ p: [0, -0.62, 0] }));
      g.torus(0.42, 0.03, { p: [0, -0.55, 0], c: 0xffffff, i: 1.5, w: 16, m: 5 });
      for (let i = 0; i < 3; i++) b.tube([[sx * 0.4, 0.3, 0.1 * i], [sx * 0.46, -0.1, 0.1 * i], [sx * 0.44, -0.55 - i * 0.12, 0.1 * i]], [0.03, 0.03, 0.02], { c: 0x3f6a2a, w: 5 });
    }, { pk: 'armU' + tag, mats: MS });
    const fore = rig.part('fore' + tag, up, [0, -1.2, 0], (b, g) => {
      b.ellipsoid(0.4, 0.62, 0.4, R({ p: [0, -0.5, 0] }));
      b.ellipsoid(0.52, 0.5, 0.52, R({ p: [0, -1.2, 0], e: 0.55 }));
      g.torus(0.46, 0.03, { p: [0, -0.2, 0], c: 0xffffff, i: 1.5, w: 16, m: 5 });
      g.torus(0.5, 0.03, { p: [0, -0.95, 0], c: 0xffffff, i: 1.5, w: 16, m: 5 });
    }, { pk: 'foreArm' + tag, mats: MS });
    return { up, fore, sx };
  });
  // kopabilen zırh plakaları (aşama 1'de savrulur)
  const plates = rig.part('plates', torso, [0, 0.8, 0], (b) => {
    b.ellipsoid(0.46, 0.36, 0.2, R({ p: [-0.45, 0.35, -0.6], rot: [0.2, 0.3, 0.2], c: ST.c, cfn: undefined }));
    b.ellipsoid(0.46, 0.36, 0.2, R({ p: [0.45, 0.35, -0.6], rot: [0.2, -0.3, -0.2], c: ST.c, cfn: undefined }));
    b.ellipsoid(0.4, 0.26, 0.2, R({ p: [0, -0.5, -0.55], rot: [0.3, 0, 0], c: ST.c, cfn: undefined }));
  }, { mats: MS });

  const C_RUNE = [0x5af0ff, 0xffb02a, 0xff4a2a];
  const mix = (f) => (f < 1 ? lerpHex(C_RUNE[0], C_RUNE[1], f) : lerpHex(C_RUNE[1], C_RUNE[2], f - 1));
  let lastSg = true;
  let slamN = -1;
  return (s) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const pf = s.pf;
    const kind = s.attackKind;
    const atk = s.attack > 0;
    const ezme = atk && kind === 'ezme';
    const sok = atk && kind === 'şok';
    const yum = atk && kind === 'yumruk';
    const hand = (s.attackN & 1) ? 1 : 0;
    const calm = s.reduced ? 0.4 : 1;
    hips.position.y = 1.9 + Math.abs(Math.sin(w)) * 0.07 * m + Math.sin(s.t * 1.0) * 0.012 - (sok ? 0.3 * s.hit : 0);
    swingLimb(legs[0], w, 0.45 * m, 0.55, -1);
    swingLimb(legs[1], w + Math.PI, 0.45 * m, 0.55, -1);
    if (sok) {
      legs[1].hip.rotation.x = 1.1 * s.wind - 0.2 * s.hit;
      legs[1].knee.rotation.x = -1.2 * s.wind;
    }
    torso.rotation.y = Math.sin(w) * 0.1 * m + (yum ? (hand ? 1 : -1) * (-0.35 * s.wind + 0.4 * s.hit) : 0);
    torso.rotation.x = -0.04 * m + (ezme ? s.wind * 0.28 - s.hit * 0.4 : 0) + (sok ? s.wind * 0.2 - s.hit * 0.2 : 0);
    torso.scale.setScalar(1 + Math.sin(s.t * 1.2) * 0.008);
    head.rotation.y = s.headYaw * 0.6;
    head.rotation.x = s.headPitch * 0.4 + (ezme ? -s.wind * 0.2 + s.hit * 0.2 : 0);
    for (let i = 0; i < 2; i++) {
      const A = arms[i];
      const dir = A.sx;
      let ux = 0.1 + Math.sin(w + (i ? 0 : Math.PI)) * 0.3 * m + Math.sin(s.t * 0.9 + i) * 0.02;
      let uz = dir * 0.1;
      let fx = 0.35;
      if (ezme) { ux += 2.7 * s.wind - 0.25 * s.hit; fx += 0.6 * s.wind; }
      if (sok) { uz = dir * (0.1 + 0.9 * s.wind); ux += 0.3 * s.wind; fx += 0.2 * s.wind; }
      if (yum && i === hand) { ux += -1.0 * s.wind + 1.9 * s.hit; fx += -0.2 * s.wind + 0.5 * s.hit; }
      A.up.rotation.x = ux;
      A.up.rotation.z = uz;
      A.fore.rotation.x = fx;
    }
    // aşama: zırh kopar, rün rengi ısınır
    const off = smoothstep(0.7, 1.3, pf);
    plates.scale.setScalar(Math.max(0.001, 1 - off));
    plates.position.set(0, 0.8 - off * 0.5, -off * 0.6);
    plates.visible = off < 0.99;
    rig.mats.glow.userData.baseColor.setHex(mix(pf));
    const beat = 0.5 + 0.5 * Math.sin(s.t * (1.8 + pf * 0.6) * calm);
    rig.mats.glow.userData.k = 0.7 + 0.35 * beat + pf * 0.15 + s.hit * 0.7 + s.wind * 0.3;
    if (m > 0.15) {
      const sg = Math.sin(w) >= 0;
      if (sg !== lastSg) { lastSg = sg; rig.cue('step', sg ? 0.5 : -0.5, 0, 0); }
    }
    if (atk && s.attack >= 0.5 && slamN !== s.attackN) {
      slamN = s.attackN;
      rig.cue('slam', sok ? 0 : (yum ? (hand ? 0.9 : -0.9) : 0), 0.1, yum ? -1.9 : -1.7);
    }
  };
}

export const BOSS_BUILDERS_A = Object.freeze({ kokana, tasbekci });
