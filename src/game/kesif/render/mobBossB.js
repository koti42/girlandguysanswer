/*
 * KEŞİF render — boss modelleri II: Buz Kral (Donmuş Zirveler) ve Gölge Hükümdar (Çekirdek).
 * Aşamalar (state.phase 0..2, yumuşak geçiş), saldırılar mobTypes.js phases.attacks ile aynı adlarda.
 * İşaretler (onCue): 'spear', 'slam', 'roar' (Buz Kral); 'beam', 'roar', 'teleport' (Gölge Hükümdar).
 * Işınlanma titremesi konum kayması/solmadır; parlaklık 3 Hz üzerinde yanıp sönmez (kısıtlı harekette yumuşak solma).
 */
import {
  TAU, clamp, damp, hash1, lerp, lerpHex, smoothstep,
} from './mobGeo.js';

/* ================================================================================================
 * BUZ KRAL — kristalden oyulmuş hükümdar: dev buz asası, süzülen kıymıklar, don halkası.
 * ============================================================================================== */
function buzkral(rig) {
  const IC = { a: 0xd2f0ff, b: 0x6aa8d0, dark: 0x274a6e };
  rig.stride = 2.4;
  rig.attackDur = 2.0;
  rig.attackKinds = ['mızrak', 'zıplama', 'tipi'];
  rig.attackDurs = { mızrak: 1.8, zıplama: 2.2, tipi: 2.6 };
  rig.glowColor = 0xbff4ff;
  rig.deathColor = 0xbff4ff;
  rig.addMat('ice', 'lit', { rough: 0.15, metal: 0.08, opacity: 0.93, emissive: 0x0b2a40 });
  rig.addMat('crystal', 'lit', { rough: 0.1, metal: 0.1, emissive: 0x1a6a90 });
  rig.addMat('aura', 'additive', { opacity: 0.55 });
  const M3 = ['ice', 'glow', 'crystal'];
  const crystal = (x, len, r, p, rot, o = {}) => x.crystal(len, r, { p, rot, c: 0xeaf9ff, c2: 0x8cd4f0, ...o });

  const robe = rig.part('robe', null, [0, 0, 0], (b, g, x) => {
    const prof = [[0.01, 0.04], [0.9, 0.04], [0.88, 0.35], [0.74, 0.95], [0.56, 1.7], [0.46, 2.25], [0.01, 2.35]];
    b.lathe(prof, {
      w: 26, c: IC.a, c2: IC.b, noise: 0.03,
      rad: (a, j) => (j <= 1 ? 1 + 0.14 * Math.pow(Math.abs(Math.sin(a * 4.5)), 0.7) : 1 + 0.03 * Math.sin(a * 9)),
    });
    g.ellipsoid(0.34, 0.5, 0.3, { p: [0, 1.5, -0.05], c: 0x7fe6ff, i: 1.3, w: 12, h: 8 });
    const n = rig.level === 0 ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      crystal(x, 0.46 + 0.14 * (i % 3), 0.07, [Math.sin(a) * 0.88, 0.28, -Math.cos(a) * 0.88], [Math.cos(a) * -0.3, 0, Math.sin(a) * 0.3]);
    }
  }, { mats: M3 });
  const torso = rig.part('torso', null, [0, 2.2, 0], (b, g, x) => {
    b.ellipsoid(0.56, 0.62, 0.4, { p: [0, 0.5, 0], e: 0.85, c: IC.a, c2: IC.b, w: 18, h: 12 });
    for (let i = 0; i < 5; i++) {
      crystal(x, 0.3 + (i % 2) * 0.16, 0.06, [(i - 2) * 0.16, 0.5 + (i % 2) * 0.18, -0.38], [-1.2, 0, (i - 2) * 0.22]);
    }
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.3, 0.2, 0.3, { p: [sx * 0.66, 0.95, 0], c: IC.a, c2: IC.b, w: 12, h: 8 });
      const L = [0.9, 0.7, 0.6, 0.48];
      for (let i = 0; i < L.length; i++) {
        crystal(x, L[i], 0.08, [sx * (0.6 + i * 0.07), 1.0, (i - 1.5) * 0.12], [(i - 1.5) * 0.18, 0, sx * (-0.12 - i * 0.1)]);
      }
    }
  }, { mats: M3 });
  const spine = rig.part('spine', torso, [0, 0.5, 0.36], (b, g, x) => {
    for (let i = 0; i < 5; i++) {
      crystal(x, 0.55 + i * 0.12, 0.08, [(i % 2 ? 0.14 : -0.14), 0.1 + i * 0.16, 0.0], [0.6, 0, (i % 2 ? -0.25 : 0.25)]);
    }
  }, { mats: M3 });
  const head = rig.part('head', torso, [0, 1.12, 0], (b, g) => {
    b.ellipsoid(0.27, 0.33, 0.29, { p: [0, 0.28, 0], e: 0.88, c: IC.a, c2: IC.b, w: 16, h: 11 });
    b.ellipsoid(0.2, 0.26, 0.13, { p: [0, 0.26, -0.2], e: 0.9, c: 0xeefaff, c2: 0xbfe4f6, w: 12, h: 8 });
    for (const sx of [-1, 1]) {
      g.ellipsoid(0.09, 0.028, 0.03, { p: [sx * 0.1, 0.32, -0.3], rot: [0, 0, sx * -0.3], c: 0xffffff, i: 2.8, w: 10, h: 6 });
    }
  }, { mats: M3 });
  const crown = rig.part('crown', head, [0, 0.5, 0], (b, g, x) => {
    const n = rig.level === 0 ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      crystal(x, 0.55 + (i % 3) * 0.28, 0.06, [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22], [Math.sin(a) * 0.38, 0, -Math.cos(a) * 0.38]);
    }
  }, { mats: M3 });
  rig.part('beard', head, [0, 0.1, -0.2], (b, g, x) => {
    for (let i = -1; i <= 1; i++) crystal(x, 0.34 - Math.abs(i) * 0.08, 0.05, [i * 0.07, 0, -0.04], [Math.PI - 0.3, 0, i * 0.2]);
  }, { mats: M3 });

  const L1 = 0.8;
  const L2 = 0.75;
  const arms = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const up = rig.part('arm' + tag, torso, [sx * 0.74, 0.9, 0], (b) => {
      b.limb([0, 0, 0], [0, -L1, 0], 0.2, 0.15, { c: IC.a, c2: IC.b, cap: 4, w: 10 });
    }, { pk: 'armU' + tag, mats: M3 });
    const fore = rig.part('fore' + tag, up, [0, -L1, 0], (b, g, x) => {
      b.limb([0, 0, 0], [0, -L2, 0], 0.15, 0.11, { c: IC.a, c2: IC.b, cap: 4, w: 10 });
      b.ellipsoid(0.12, 0.15, 0.1, { p: [0, -L2 - 0.1, 0], c: IC.a, c2: IC.b, w: 10, h: 7 });
      for (let k = -1; k <= 2; k++) crystal(x, 0.22, 0.022, [(k - 0.5) * 0.05, -L2 - 0.2, 0], [Math.PI + 0.1, 0, (k - 0.5) * 0.12]);
    }, { pk: 'foreArm' + tag, mats: M3 });
    return { up, fore, sx };
  });
  // asa (sağ elde): dikey kalması için ters dönüşle telafi edilir
  const staff = rig.part('staff', arms[1].fore, [0, -L2 - 0.1, 0], (b, g, x) => {
    b.limb([0, -1.7, 0], [0, 1.95, 0], 0.045, 0.05, { c: IC.b, c2: IC.dark, cap: 3, w: 8 });
    for (let i = 0; i < 3; i++) b.ellipsoid(0.07, 0.05, 0.07, { p: [0, -0.6 + i * 1.1, 0], c: IC.a, w: 8, h: 6 });
    crystal(x, 1.0, 0.2, [0, 1.95, 0], [0, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      crystal(x, 0.5, 0.07, [Math.cos(a) * 0.14, 1.95, Math.sin(a) * 0.14], [Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7]);
    }
    g.ellipsoid(0.15, 0.2, 0.15, { p: [0, 2.35, 0], c: 0xbff4ff, i: 2.2, w: 10, h: 7 });
  }, { mats: M3 });
  const palm = rig.part('palm', arms[0].fore, [0, -L2 - 0.2, -0.05], (b, g) => {
    g.ellipsoid(0.1, 0.1, 0.1, { c: 0xbff4ff, i: 2.0, w: 8, h: 6 });
  });
  const orbitA = rig.part('orbitA', null, [0, 2.9, 0], (b, g, x) => {
    const n = rig.level === 0 ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      crystal(x, 0.46, 0.08, [Math.cos(a) * 1.1, Math.sin(i * 1.9) * 0.25, Math.sin(a) * 1.1], [0.9 * Math.sin(a), 0, -0.9 * Math.cos(a)]);
    }
  }, { mats: M3 });
  const orbitB = rig.part('orbitB', null, [0, 3.7, 0], (b, g, x) => {
    const n = rig.level === 0 ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      crystal(x, 0.38, 0.07, [Math.cos(a) * 0.82, Math.sin(i * 2.7) * 0.2, Math.sin(a) * 0.82], [0.9 * Math.sin(a), 0, -0.9 * Math.cos(a)]);
    }
  }, { mats: M3 });
  const frost = rig.part('frost', null, [0, 4.35, 0], (b, g) => {
    g.torus(0.62, 0.014, { c: 0xdff8ff, i: 1.6, w: 28, m: 5, rot: [0.25, 0, 0.1] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.ellipsoid(0.035, 0.035, 0.035, { p: [Math.cos(a) * 0.62, Math.sin(a) * 0.06, Math.sin(a) * 0.62], c: 0xffffff, i: 2.0, w: 6, h: 4 });
    }
  });
  const aura = rig.part('aura', null, [0, 0.03, 0], (b, g, x) => {
    const prof = [[0.001, 0]];
    for (let i = 1; i <= 24; i++) prof.push([i * 0.05, 0]);
    x.lathe(prof, {
      sides: 40, ao: 0, noise: 0,
      cfn: (px, py, pz) => {
        const r = Math.hypot(px, pz);
        const ring = Math.max(0, 1 - Math.abs(r - 0.95) / 0.07) * 0.9 + Math.max(0, 1 - Math.abs(r - 0.55) / 0.04) * 0.5;
        const a = Math.atan2(pz, px);
        const spoke = Math.pow(Math.abs(Math.cos(a * 6)), 18) * smoothstep(0.3, 0.9, r) * (1 - smoothstep(0.9, 1.2, r)) * 0.8;
        const f = clamp((1 - smoothstep(0.0, 1.2, r)) * 0.5 + ring + spoke, 0, 1.2);
        return lerpHex(0x000000, 0x9fe4ff, clamp(f, 0, 1));
      },
    });
  }, { mats: ['ice', 'glow', 'aura'] });

  const C_EYE = [0xffffff, 0xdff8ff, 0xffb0e8];
  let slamN = -1;
  let cueN = -1;
  let lift = 0;
  const mixE = (f) => (f < 1 ? lerpHex(C_EYE[0], C_EYE[1], f) : lerpHex(C_EYE[1], C_EYE[2], f - 1));

  return (s, dt) => {
    const m = clamp(s.moving, 0, 1.3);
    const w = s.walk;
    const pf = s.pf;
    const kind = s.attackKind;
    const atk = s.attack > 0;
    const spear = atk && kind === 'mızrak';
    const leap = atk && kind === 'zıplama';
    const blizz = atk && kind === 'tipi';
    const calm = s.reduced ? 0.4 : 1;
    const a = s.attack;
    // zıplama yayı: çömel (0..0.4) → fırla (0.4..0.85) → in
    let air = 0;
    let crouch = 0;
    if (leap) {
      crouch = a < 0.4 ? easeCrouch(a / 0.4) : 0;
      if (a >= 0.4 && a < 0.9) air = Math.sin(((a - 0.4) / 0.5) * Math.PI);
    }
    lift = damp(lift, air * 1.9, 18, dt);
    rig.root.position.y = lift;
    robe.scale.set(1 + crouch * 0.1, 1 - crouch * 0.18, 1 + crouch * 0.1);
    robe.rotation.z = Math.sin(s.t * 0.7) * 0.02 * calm + Math.sin(w) * 0.04 * m;
    robe.rotation.x = -0.05 * m;
    torso.position.y = 2.2 - crouch * 0.38 + Math.sin(s.t * 1.2) * 0.02;
    torso.rotation.x = -0.04 * m + (spear ? s.wind * 0.18 - s.hit * 0.24 : 0) + (blizz ? -s.wind * 0.18 : 0);
    torso.rotation.y = s.headYaw * 0.2 + (spear ? 0.5 * s.wind - 0.5 * s.hit : 0);
    head.rotation.y = s.headYaw * 0.6 - (spear ? 0.3 * s.wind : 0);
    head.rotation.x = s.headPitch * 0.4 + (blizz ? -s.wind * 0.25 : 0);
    // kollar + asa
    const L = arms[0];
    const R = arms[1];
    let lx = 0.15 + Math.sin(s.t * 0.9) * 0.03;
    let lz = -0.28;
    let lf = 0.5;
    let rx = 0.12;
    let rz = 0.2;
    let rf = 0.35;
    if (spear) {
      rx += -1.1 * s.wind + 1.7 * s.hit;
      rf += 0.4 * s.wind - 0.5 * s.hit;
      lx += 0.7 * s.wind;
      lf += 0.5 * s.wind;
    }
    if (leap) {
      lx += crouch * -0.5 + air * 2.4;
      rx += crouch * -0.5 + air * 2.2;
      lz += air * -0.5;
      rz += air * 0.5;
    }
    if (blizz) {
      lx += 2.4 * s.wind;
      rx += 2.3 * s.wind;
      lz += -0.5 * s.wind;
      rz += 0.5 * s.wind;
      lf += 0.3 * s.wind;
    }
    L.up.rotation.x = lx; L.up.rotation.z = lz; L.fore.rotation.x = lf;
    R.up.rotation.x = rx; R.up.rotation.z = rz; R.fore.rotation.x = rf;
    staff.rotation.x = -(rx + rf);
    staff.rotation.z = -rz;
    palm.scale.setScalar(0.8 + 0.3 * Math.sin(s.t * 2.2) + (blizz ? s.wind * 1.2 : 0));
    // aşama: taç büyür, kıymıklar hızlanır/genişler, aura yayılır, gözler rengini değiştirir
    const grow = 1 + 0.35 * smoothstep(0.3, 1.1, pf) + 0.35 * smoothstep(1.2, 2.0, pf);
    crown.scale.set(grow, 1 + (grow - 1) * 1.4, grow);
    spine.scale.setScalar(0.65 + 0.35 * smoothstep(0.2, 1.2, pf) + 0.2 * smoothstep(1.3, 2, pf));
    const spin = (0.7 + pf * 0.5 + (blizz ? 3.4 * s.wind + 2 * s.hit : 0)) * calm;
    orbitA.rotation.y += dt * spin;
    orbitB.rotation.y -= dt * spin * 1.3;
    const rad = 1 + 0.08 * pf + (blizz ? 0.25 * s.wind : 0);
    orbitA.scale.set(rad, 1, rad);
    orbitB.scale.set(rad, 1, rad);
    orbitA.position.y = 2.9 + Math.sin(s.t * 0.9) * 0.1;
    orbitB.position.y = 3.7 + Math.sin(s.t * 1.1 + 1) * 0.1;
    frost.visible = pf > 0.4;
    frost.rotation.y = s.t * 0.6 * calm;
    frost.scale.setScalar(0.6 + 0.4 * smoothstep(0.4, 1.2, pf));
    const as = 0.85 + 0.12 * pf + (blizz ? 0.5 * s.wind : 0) + (leap ? 0.3 * (a > 0.9 ? s.hit : 0) : 0);
    aura.scale.set(as, 1, as);
    aura.rotation.y = s.t * 0.2 * calm;
    rig.mats.aura.opacity = 0.35 + 0.15 * Math.sin(s.t * 1.4) + 0.1 * pf;
    rig.mats.glow.userData.baseColor.setHex(mixE(pf));
    rig.mats.glow.userData.k = 0.85 + 0.15 * Math.sin(s.t * 1.8) + s.hit * 0.8 + pf * 0.1;
    rig.mats.crystal.userData.baseEmissive.setRGB(0.1 + pf * 0.05 + s.hit * 0.1, 0.42 + s.wind * 0.1, 0.56 + pf * 0.06);
    // işaretler
    if (spear && a >= 0.5 && cueN !== s.attackN) { cueN = s.attackN; rig.cue('spear', 0, 1.6, -2.4); }
    if (leap && a >= 0.9 && slamN !== s.attackN) { slamN = s.attackN; rig.cue('slam', 0, 0.1, -0.6); }
    if (blizz && a >= 0.3 && cueN !== s.attackN) { cueN = s.attackN; rig.cue('roar', 0, 4.0, 0); }
  };
}

function easeCrouch(t) {
  return Math.sin(clamp(t, 0, 1) * Math.PI * 0.5);
}

/* ================================================================================================
 * GÖLGE HÜKÜMDAR — kapüşonlu, süzülen gölge varlık: mor alevler, ayrılan gölge klonlar, ışınlanma.
 * ============================================================================================== */
function golgehukumdar(rig) {
  const CL = { a: 0x2a1c4a, b: 0x06030c };
  const K = 0.88;
  rig.root.scale.setScalar(K);
  rig.stride = 3;
  rig.attackDur = 2.2;
  rig.attackKinds = ['ışın', 'çağır', 'ışınlan'];
  rig.attackDurs = { ışın: 2.4, çağır: 2.4, ışınlan: 1.6 };
  rig.glowColor = 0xb48cff;
  rig.deathColor = 0xa070ff;
  rig.addMat('cloak', 'lit', { rough: 0.9, emissive: 0x08031a });
  rig.addMat('clone', 'lit', { rough: 0.9, opacity: 0.46, emissive: 0x1c0a44 });
  rig.mats.clone.depthWrite = false;
  rig.addMat('cloneGlow', 'glow', { opacity: 0.75 });
  rig.addMat('flame', 'glow', {});
  rig.addMat('sigil', 'additive', { opacity: 0.6 });
  rig.addMat('beam', 'additive', { opacity: 0.75 });
  rig.mats.beam.side = rig.THREE.DoubleSide;
  const MC = ['cloak', 'glow', 'cloak'];
  const MCL = ['clone', 'cloneGlow', 'clone'];

  const buildCloak = (b, g) => {
    const prof = [[0.01, 0.0], [0.85, 0.0], [0.8, 0.5], [0.6, 1.2], [0.45, 2.0], [0.4, 2.6], [0.32, 3.0], [0.01, 3.1]];
    b.lathe(prof, {
      w: 32, noise: 0.03,
      // dikey kıvrım gölgeleri + alta doğru kararma
      cfn: (x, y, z) => lerpHex(0x06030c, 0x35235e, clamp((0.5 + 0.5 * Math.sin(Math.atan2(z, x) * 7 + y * 0.9)) * smoothstep(0.1, 2.4, y) * 1.1, 0, 1)),
      rad: (a, j) => (j <= 1 ? 1 + 0.2 * Math.pow(Math.abs(Math.sin(a * 6.5)), 0.6) + 0.1 * Math.sin(a * 17) : 1 + 0.045 * Math.sin(a * 7 + j) + 0.02 * Math.sin(a * 13 - j)),
    });
    b.ellipsoid(0.58, 0.26, 0.42, { p: [0, 2.72, 0], c: CL.a, c2: CL.b, w: 16, h: 9 });
    for (const sx of [-1, 1]) {
      b.tube([[sx * 0.45, 2.85, 0.0], [sx * 0.7, 3.0, 0.18], [sx * 0.95, 3.0, 0.5]], [0.08, 0.05, 0.01], { c: CL.a, c2: 0x5a3aa0, w: 6 });
    }
    // ön yırtıkta boşluk
    b.ellipsoid(0.24, 1.0, 0.1, { p: [0, 1.65, -0.43], c: 0x040208, w: 12, h: 9, ao: 0, noise: 0 });
    for (let i = -1; i <= 1; i++) g.limb([i * 0.09, 0.85 + Math.abs(i) * 0.2, -0.5], [i * 0.07, 2.2 - Math.abs(i) * 0.3, -0.5], 0.008, 0.004, { c: 0xb48cff, i: 1.2, cap: 2, w: 4 });
  };
  const buildHood = (b, g) => {
    b.ellipsoid(0.42, 0.5, 0.44, { p: [0, 0.3, 0], c: CL.a, c2: CL.b, w: 16, h: 11 });
    b.spike([0, 0.6, 0.2], [0, 0.42, 0.85], 0.2, { c: CL.a, c2: CL.b, s: [1, 0.8, 1], w: 10, mid: 1 });
    b.ellipsoid(0.29, 0.34, 0.22, { p: [0, 0.27, -0.28], c: 0x030106, w: 12, h: 9, ao: 0, noise: 0 });
    for (const sx of [-1, 1]) {
      g.ellipsoid(0.095, 0.03, 0.03, { p: [sx * 0.13, 0.34, -0.47], rot: [0, 0, sx * -0.28], c: 0xffffff, i: 2.8, w: 10, h: 6 });
    }
    g.limb([-0.1, 0.12, -0.47], [0.1, 0.12, -0.47], 0.006, 0.006, { c: 0xffffff, i: 1.2, cap: 2, w: 4 });
  };
  const body = rig.node('body', null, [0, 0.12, 0]);
  const cloak = rig.part('cloak', body, [0, 0, 0], buildCloak, { mats: MC });
  const hood = rig.part('hood', body, [0, 2.95, 0], buildHood, { mats: MC });
  // alev tacı
  const flames = [];
  const NF = rig.level === 0 ? 5 : 7;
  for (let i = 0; i < NF; i++) {
    const a = (i / NF) * TAU;
    const f = rig.part('flame' + i, hood, [Math.cos(a) * 0.3, 0.68, Math.sin(a) * 0.3], (b, g) => {
      const prof = [[0.001, 0], [0.09, 0.05], [0.13, 0.2], [0.09, 0.42], [0.04, 0.62], [0.001, 0.82]];
      g.lathe(prof, { w: 8, ao: 0, noise: 0, i: 1.7, cfn: (x, y) => lerpHex(0x5a2aff, 0xeed0ff, clamp(y / 0.8, 0, 1)) });
    }, { pk: 'flame', mats: ['cloak', 'flame', 'cloak'] });
    f.userData.a = a;
    flames.push(f);
  }
  // havada duran eller
  const hands = [-1, 1].map((sx) => {
    const tag = sx < 0 ? 'L' : 'R';
    const h = rig.part('hand' + tag, body, [sx * 0.95, 1.9, -0.55], (b, g) => {
      b.ellipsoid(0.15, 0.05, 0.17, { c: CL.a, c2: CL.b, w: 12, h: 7 });
      b.ellipsoid(0.12, 0.1, 0.1, { p: [0, 0.02, 0.18], c: CL.b, w: 10, h: 6 });
      for (let k = 0; k < 4; k++) {
        const x = (k - 1.5) * 0.065;
        b.limb([x, 0, -0.14], [x * 1.3, 0, -0.42], 0.022, 0.012, { c: CL.a, c2: CL.b, cap: 3, w: 6 });
        g.spike([x * 1.3, 0, -0.42], [x * 1.4, 0, -0.55], 0.014, { c: 0xe0c8ff, i: 1.8, w: 5 });
      }
    }, { pk: 'hand', mats: MC });
    if (sx < 0) h.scale.x = -1;
    const fl = rig.part('wristFlame' + tag, h, [0, 0, 0.22], (b, g) => {
      const prof = [[0.001, 0], [0.09, 0.05], [0.13, 0.2], [0.09, 0.42], [0.04, 0.62], [0.001, 0.82]];
      g.lathe(prof, { w: 8, ao: 0, noise: 0, i: 1.7, cfn: (x, y) => lerpHex(0x5a2aff, 0xeed0ff, clamp(y / 0.8, 0, 1)) });
    }, { pk: 'flame', mats: ['cloak', 'flame', 'cloak'] });
    fl.scale.setScalar(0.7);
    fl.rotation.x = Math.PI / 2 + 0.3;
    return { h, fl, sx, p: [sx * 0.95, 1.9, -0.55] };
  });
  // arkada dönen rün halkası
  const halo = rig.part('halo', body, [0, 2.45, 0.7], (b, g) => {
    g.torus(1.0, 0.04, { rot: [Math.PI / 2, 0, 0], c: 0xb48cff, i: 1.5, w: 40, m: 6 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const px = Math.cos(a) * 1.0;
      const py = Math.sin(a) * 1.0;
      if (i % 3 === 0) g.ellipsoid(0.07, 0.13, 0.025, { p: [px, py, 0], rot: [0, 0, a], c: 0xe8d8ff, i: 1.8, w: 6, h: 5 });
      else if (i % 3 === 1) g.torus(0.07, 0.014, { p: [px, py, 0], rot: [Math.PI / 2, 0, 0], c: 0xe8d8ff, i: 1.8, w: 10, m: 4 });
      else g.crystal(0.2, 0.03, { p: [px, py, 0], rot: [0, 0, a - Math.PI / 2], c: 0xe8d8ff, i: 1.8, tip: 0.4 });
    }
  });
  const halo2 = rig.part('halo2', body, [0, 2.45, 0.74], (b, g) => {
    g.torus(0.8, 0.03, { rot: [Math.PI / 2, 0, 0], c: 0xff9ad8, i: 1.4, w: 32, m: 5 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      g.ellipsoid(0.05, 0.1, 0.02, { p: [Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0], rot: [0, 0, a], c: 0xffd8ee, i: 1.8, w: 6, h: 4 });
    }
  });
  const wisps = [];
  for (let i = 0; i < 7; i++) {
    const t = rig.tendril(body, {
      segments: 9, radius: (u) => 0.1 * (1 - u) * (1 - u) + 0.012, color0: 0x1a1030, color1: 0xb48cff, seed: 20 + i, length: 1.2, name: 'wisp' + i,
    });
    wisps.push({ t, a: (i / 7) * TAU + 0.4 });
  }
  const sigil = rig.part('sigil', null, [0, 0.02, 0], (b, g, x) => {
    const prof = [[0.001, 0]];
    for (let i = 1; i <= 34; i++) prof.push([i * 0.05, 0]);
    x.lathe(prof, {
      sides: 48, ao: 0, noise: 0,
      cfn: (px, py, pz) => {
        const r = Math.hypot(px, pz);
        const a = Math.atan2(pz, px);
        const ring = Math.max(0, 1 - Math.abs(r - 1.55) / 0.06) + Math.max(0, 1 - Math.abs(r - 1.1) / 0.04) * 0.8 + Math.max(0, 1 - Math.abs(r - 0.6) / 0.04) * 0.6;
        const star = Math.pow(Math.abs(Math.cos(a * 4 + r * 0.5)), 24) * smoothstep(0.2, 0.8, r) * (1 - smoothstep(1.3, 1.6, r)) * 0.9;
        return lerpHex(0x000000, 0x9a6bff, clamp(ring + star + (1 - smoothstep(0, 1.6, r)) * 0.25, 0, 1));
      },
    });
  }, { mats: ['cloak', 'glow', 'sigil'] });
  // gölge klonlar: aynı geometriyi paylaşır (pk), saydam koyu malzeme
  const clones = [0, 1, 2].map((i) => {
    const node = rig.node('clone' + i, null, [0, 0.12, 0]);
    rig.attach(node, 'cloak', buildCloak, { mats: MCL });
    const hd = rig.node('cloneHood' + i, node, [0, 2.95, 0]);
    rig.attach(hd, 'hood', buildHood, { mats: MCL });
    node.visible = false;
    return { node, i };
  });
  // ışın: hedefe uzanan parlak sütun
  const beam = rig.part('beam', body, [0, 2.2, -0.9], (b, g, x) => {
    x.limb([0, 0, 0], [0, 0, -16], 0.14, 0.2, { c: 0x7a4cff, cap: 2, w: 10, ao: 0, noise: 0 });
    x.limb([0, 0, 0], [0, 0, -16], 0.05, 0.07, { c: 0xd8c8ff, cap: 2, w: 8, ao: 0, noise: 0 });
  }, { mats: ['cloak', 'glow', 'beam'] });
  beam.visible = false;
  const orb = rig.glowSprite(body, 0xc8a0ff, 1.0, 0.8, 'orb');
  orb.position.set(0, 2.2, -1.0);
  orb.visible = false;

  const C_EYE = [0xffffff, 0xe8d8ff, 0xffa0b8];
  const C_FLAME = [0xb48cff, 0xc890ff, 0xff7ad0];
  const mix3 = (arr, f) => (f < 1 ? lerpHex(arr[0], arr[1], f) : lerpHex(arr[1], arr[2], f - 1));
  let beamN = -1;
  let teleN = -1;
  let roarN = -1;
  const HP = [[-0.95, 1.9, -0.55], [0.95, 1.9, -0.55]];
  return (s, dt) => {
    const m = clamp(s.moving, 0, 1.3);
    const pf = s.pf;
    const kind = s.attackKind;
    const a = s.attack;
    const atk = a > 0;
    const isBeam = atk && kind === 'ışın';
    const isSum = atk && kind === 'çağır';
    const isTel = atk && kind === 'ışınlan';
    const calm = s.reduced ? 0.4 : 1;
    // süzülme + ağır salınım
    body.position.y = 0.2 + Math.sin(s.t * 1.1) * 0.06 + m * 0.03;
    body.rotation.x = -0.06 * m;
    cloak.rotation.z = Math.sin(s.t * 0.8) * 0.025 * calm;
    cloak.scale.set(1 + Math.sin(s.t * 1.4) * 0.012, 1, 1 + Math.sin(s.t * 1.4 + 1) * 0.012);
    hood.rotation.y = s.headYaw * 0.5;
    hood.rotation.x = s.headPitch * 0.4 + (isSum ? -s.wind * 0.25 : 0);
    // alevler
    for (let i = 0; i < flames.length; i++) {
      const F = flames[i];
      const ph = s.t * 6.5 * calm + i * 1.9;
      const sc = 0.9 + 0.3 * pf + 0.2 * Math.sin(ph) * calm + (isSum ? 0.4 * s.wind : 0);
      F.scale.set(0.8 + 0.15 * Math.sin(ph + 1) * calm, sc, 0.8 + 0.15 * Math.sin(ph + 2) * calm);
      F.rotation.z = Math.cos(F.userData.a) * -0.28 + Math.sin(ph * 0.6) * 0.1 * calm;
      F.rotation.x = Math.sin(F.userData.a) * 0.28 + Math.cos(ph * 0.5) * 0.1 * calm;
    }
    // eller
    for (let i = 0; i < 2; i++) {
      const H = hands[i];
      let tx = H.p[0];
      let ty = H.p[1] + Math.sin(s.t * 1.3 + i * 2) * 0.1;
      let tz = H.p[2];
      let rx = 0;
      if (isBeam) {
        const k = Math.max(s.wind, s.hit);
        tx = lerp(tx, H.sx * 0.28, k); ty = lerp(ty, 2.25, k); tz = lerp(tz, -1.25, k);
        rx = 0;
      } else if (isSum) {
        const k = s.wind;
        tx = lerp(tx, H.sx * 0.85, k); ty = lerp(ty, 3.4, k); tz = lerp(tz, -0.2, k);
        rx = -1.2 * k;
      } else if (isTel) {
        const k = Math.sin(clamp(a / 0.5, 0, 1) * Math.PI);
        tx = lerp(tx, H.sx * 0.3, k); ty = lerp(ty, 1.8, k); tz = lerp(tz, -0.35, k);
      }
      const p = H.h.position;
      p.x = damp(p.x, tx, 9, dt); p.y = damp(p.y, ty, 9, dt); p.z = damp(p.z, tz, 9, dt);
      H.h.rotation.x = damp(H.h.rotation.x, rx, 9, dt);
      H.h.rotation.z = Math.sin(s.t * 1.1 + i) * 0.08 + H.sx * 0.1;
      H.fl.scale.setScalar(0.55 + 0.25 * Math.sin(s.t * 5.5 + i * 2) * calm + 0.2 * pf);
    }
    for (let i = 0; i < wisps.length; i++) {
      const Wp = wisps[i];
      const ca = Math.sin(Wp.a);
      const sa = -Math.cos(Wp.a);
      for (let j = 0; j <= 9; j++) {
        const u = j / 9;
        const ph = s.t * 1.5 * calm + i * 1.3 - u * 3.2;
        const r0 = 0.75 - 0.2 * u;
        Wp.t.set(j, ca * r0 + Math.sin(ph) * 0.14 * u, 0.55 - u * 0.1 + Math.sin(ph * 0.8) * 0.12 * u + 0.3 * u * u, sa * r0 + Math.cos(ph) * 0.14 * u + u * (0.2 + 0.5 * m));
      }
      Wp.t.refresh();
    }
    // rün halkaları
    halo.rotation.z = s.t * (0.35 + pf * 0.15 + (isSum ? 2.2 * s.wind : 0)) * calm;
    halo2.visible = pf > 0.9;
    halo2.rotation.z = -s.t * 0.5 * calm;
    halo2.scale.setScalar(0.5 + 0.5 * smoothstep(0.9, 1.6, pf));
    sigil.rotation.y = s.t * 0.25 * calm;
    const sg = 0.85 + 0.2 * pf + (isSum ? 0.35 * s.wind : 0);
    sigil.scale.set(sg, 1, sg);
    rig.mats.sigil.opacity = 0.35 + 0.2 * Math.sin(s.t * 1.2) + 0.1 * pf;
    // klonlar: aşama 1'de 2, aşama 2'de 3
    for (let i = 0; i < clones.length; i++) {
      const C = clones[i];
      const want = i < 2 ? smoothstep(0.4, 1.0, pf) : smoothstep(1.4, 2.0, pf);
      const sp = isSum ? 1 + 1.5 * s.wind : 1;
      const ang = s.t * 0.35 * sp * calm + (i / 3) * TAU + 0.6;
      const r = 2.1 + 0.4 * i + (isSum ? 0.8 * s.wind : 0);
      C.node.visible = want > 0.02;
      C.node.position.set(Math.sin(ang) * r, 0.12 + 0.15 * Math.sin(s.t * 1.3 + i * 2), Math.cos(ang) * r * 0.8 - 0.3);
      C.node.scale.set(0.9 * want, 0.9 * (0.2 + 0.8 * want), 0.9 * want);
      C.node.rotation.y = Math.atan2(-C.node.position.x, -C.node.position.z) + Math.PI + Math.sin(s.t * 0.7 + i) * 0.15;
    }
    // ışın
    let showBeam = false;
    if (isBeam && a > 0.5 && a < 0.88) showBeam = true;
    beam.visible = showBeam;
    if (showBeam) {
      const k = Math.sin(((a - 0.5) / 0.38) * Math.PI);
      const wob = s.reduced ? 1 : 1 + Math.sin(s.t * 18) * 0.06;
      beam.scale.set((0.3 + 0.9 * k) * wob, (0.3 + 0.9 * k) * wob, 1);
      beam.rotation.y = s.hasAim ? s.aimYaw : 0;
      beam.rotation.x = s.hasAim ? s.aimPitch : 0;
    }
    orb.visible = isBeam && a < 0.88;
    if (orb.visible) {
      const k = a < 0.5 ? smoothstep(0, 0.5, a) : 1 - smoothstep(0.5, 0.88, a) * 0.6;
      orb.scale.setScalar(0.3 + 1.1 * k);
    }
    // ışınlanma: küçülüp çizgiye dönüş → yeniden belirme
    let vis = 1;
    let tsx = 1;
    let tsy = 1;
    if (isTel) {
      const u = a < 0.5 ? a / 0.5 : 1 - (a - 0.5) / 0.5;
      const e = smoothstep(0, 1, u);
      tsx = 1 - 0.94 * e;
      tsy = 1 + 0.4 * e;
      vis = e < 0.97 ? 1 : 0;
      if (!s.reduced) {
        const j = Math.floor(s.t * 24);
        rig.root.position.x = (hash1(j * 1.7) - 0.5) * 0.5 * e;
      } else rig.root.position.x = 0;
      if (a >= 0.45 && teleN !== s.attackN) { teleN = s.attackN; rig.cue('teleport', 0, 2.0, 0); }
    } else rig.root.position.x = 0;
    rig.root.scale.set(K * tsx, K * tsy, K * tsx);
    body.visible = vis === 1;
    for (let i = 0; i < hands.length; i++) hands[i].h.visible = vis === 1;
    // renkler
    rig.mats.glow.userData.baseColor.setHex(mix3(C_EYE, pf));
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 1.7) + s.hit * 0.6;
    rig.mats.flame.userData.baseColor.setHex(mix3(C_FLAME, pf));
    rig.mats.flame.userData.k = 0.9 + 0.2 * Math.sin(s.t * 2.2) * calm + pf * 0.15;
    rig.mats.cloneGlow.userData.k = 0.8;
    rig.mats.cloak.userData.baseEmissive.setRGB(0.012 + pf * 0.01, 0.006, 0.04 + pf * 0.02);
    if (isBeam && a >= 0.55 && beamN !== s.attackN) { beamN = s.attackN; rig.cue('beam', 0, 2.2, -1.2); }
    if (isSum && a >= 0.45 && roarN !== s.attackN) { roarN = s.attackN; rig.cue('roar', 0, 3.4, 0); }
  };
}

export const BOSS_BUILDERS_B = Object.freeze({ buzkral, golgehukumdar });
