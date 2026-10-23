/*
 * KEŞİF render — Neon Meridyen robot modelleri (süpürge bot, kurye bot, yardım dronu, bekçi robot, hatabot, gözcü dron).
 * Düşük poligonlu ama parlak vurgulu, aile dostu: yuvarlak hatlar, sevimli yüzler, silah/diken/kan yok. Her kurucu (rig, def) → anim(s, dt).
 * mobModels.js, `MODEL_BUILDERS` bulamazsa buradaki ROBOT_BUILDERS tablosuna bakar (ana diyar yaratık tablosu ve testleri değişmez).
 *
 * Model önü -Z. Saldırı işaretleri (ent.attacking): bekçi 'dur' (avuç kalkar), hatabot 'kivilcim' (titreme/kıvılcım), gözcü 'tarama' (halka büyür);
 * hepsi ≥0.6 sn önceden görünür. Titreşim ≤2 Hz; reducedMotion'da hareketler küçülür (s.reduced).
 */
import {
  clamp, eye, makeLimb, swingLimb,
} from './mobGeo.js';

const TAU = Math.PI * 2;

/* ================================================================================================
 * SÜPÜRGE BOT — yassı beyaz gövde, dönen yan fırçalar, tekerlekler, turkuaz tampon ışığı.
 * ============================================================================================== */
function supurgebot(rig) {
  const C = { a: 0xeef2f7, b: 0xb7c2d0, dark: 0x2b323f, acc: 0x3de0c8 };
  rig.stride = 3.4;
  rig.attackDur = 1;
  rig.glowColor = C.acc;
  rig.deathColor = 0x7ff3e0;
  rig.baseEmissive('lit', 0x2c3a42); // gece sokağında da okunur: kabuk hafif kendi ışığıyla parlar
  const body = rig.part('body', null, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.34, 0.14, 0.34, { p: [0, 0.2, 0], c: C.a, c2: C.b, e: 0.7, w: 16, h: 8 });
    b.ellipsoid(0.2, 0.13, 0.14, { p: [0, 0.31, 0.24], c: C.b, c2: C.dark, e: 0.55, w: 10, h: 6 }); // çöp haznesi
    g.torus(0.335, 0.013, { p: [0, 0.2, 0], c: C.acc, i: 1.7, w: 26, m: 5 });
    for (const sx of [-1, 1]) g.ellipsoid(0.022, 0.022, 0.012, { p: [sx * 0.26, 0.22, -0.3], c: 0xffffff, i: 1.6, w: 6, h: 4 });
  });
  const dome = rig.part('dome', body, [0, 0.3, -0.02], (b, g) => {
    b.ellipsoid(0.23, 0.15, 0.23, { p: [0, 0.07, 0], c: C.a, c2: C.b, e: [1, 0.85], w: 14, h: 8 });
    b.ellipsoid(0.15, 0.065, 0.06, { p: [0, 0.09, -0.19], c: C.dark, e: 0.6, w: 10, h: 6, ao: 0, noise: 0 });
    g.ellipsoid(0.1, 0.025, 0.012, { p: [0, 0.095, -0.245], c: 0xdffff8, i: 2.4, w: 10, h: 5 });
    b.limb([0.1, 0.2, 0.08], [0.13, 0.38, 0.1], 0.012, 0.008, { c: C.dark, cap: 2, w: 5 });
    g.ellipsoid(0.028, 0.028, 0.028, { p: [0.13, 0.4, 0.1], c: C.acc, i: 2.4, w: 6, h: 4 });
  });
  const wheels = [-1, 1].map((sx) => rig.part(sx < 0 ? 'wheelL' : 'wheelR', body, [sx * 0.34, 0.13, 0.05], (b) => {
    b.lathe([[0.001, -0.06], [0.115, -0.06], [0.13, -0.04], [0.13, 0.04], [0.115, 0.06], [0.001, 0.06]], {
      rot: [0, 0, Math.PI / 2], sides: 12, c: C.dark, c2: 0x161a22, ao: 0.2,
    });
  }));
  const brushes = [-1, 1].map((sx) => rig.part(sx < 0 ? 'brushL' : 'brushR', body, [sx * 0.2, 0.05, -0.3], (b, g) => {
    b.lathe([[0.001, 0], [0.11, 0.0], [0.11, 0.025], [0.001, 0.04]], { sides: 10, c: C.dark, c2: C.b });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      g.ellipsoid(0.018, 0.012, 0.018, { p: [Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1], c: C.acc, i: 1.5, w: 5, h: 4 });
    }
  }));
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    body.position.y = Math.abs(Math.sin(s.walk * 0.5)) * 0.008 * m;
    body.rotation.x = -0.03 * m;
    dome.rotation.y = s.headYaw * 0.8;
    dome.rotation.x = s.headPitch * 0.25;
    for (let i = 0; i < 2; i++) wheels[i].rotation.x = s.walk * 1.1;
    const spin = s.reduced ? 1.5 : 6 + m * 3;
    brushes[0].rotation.y = s.t * spin;
    brushes[1].rotation.y = -s.t * spin;
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.2);
  };
}

/* ================================================================================================
 * KURYE BOT — turuncu ceketli küçük iki ayaklı robot, kollarında parıldayan şeritli paket.
 * ============================================================================================== */
function kuryebot(rig) {
  const C = { a: 0xf2f4f8, b: 0xaeb8c6, dark: 0x2c3340, acc: 0xffa93a, box: 0xd8b07a };
  rig.stride = 4.4;
  rig.attackDur = 1;
  rig.glowColor = C.acc;
  rig.deathColor = 0xffd08a;
  rig.baseEmissive('lit', 0x40301e);
  const hips = rig.part('hips', null, [0, 0.4, 0], (b) => {
    b.ellipsoid(0.15, 0.08, 0.11, { c: C.dark, c2: 0x161a22, e: 0.6, w: 12, h: 6 });
  });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.085, -0.04, 0], 0.18,
    (b) => { b.limb([0, 0, 0], [0, -0.18, 0], 0.042, 0.036, { c: C.b, c2: C.dark, cap: 3, w: 8 }); },
    (b, g) => {
      b.limb([0, 0, 0], [0, -0.17, 0], 0.036, 0.03, { c: C.b, c2: C.dark, cap: 3, w: 8 });
      b.ellipsoid(0.05, 0.028, 0.08, { p: [0, -0.18, -0.025], c: C.dark, e: 0.7, w: 8, h: 5 });
      g.ellipsoid(0.03, 0.008, 0.05, { p: [0, -0.205, -0.03], c: C.acc, i: 1.2, w: 6, h: 3 });
    },
    { pkUpper: 'kLegU', pkLower: 'kLegLo' },
  ));
  const torso = rig.part('torso', hips, [0, 0.05, 0], (b, g) => {
    b.ellipsoid(0.19, 0.2, 0.13, { p: [0, 0.2, 0], c: C.acc, c2: 0xc87a1c, e: 0.65, w: 14, h: 8 });
    b.ellipsoid(0.15, 0.17, 0.08, { p: [0, 0.22, 0.17], c: C.b, c2: C.dark, e: 0.55, w: 10, h: 6 }); // sırt çantası
    g.limb([-0.12, 0.3, -0.125], [0.12, 0.3, -0.125], 0.01, 0.01, { c: 0xfff0d0, i: 1.5, cap: 2, w: 5 });
    g.ellipsoid(0.03, 0.03, 0.012, { p: [0.09, 0.15, -0.125], c: C.acc, i: 1.8, w: 6, h: 4 });
  });
  const head = rig.part('head', torso, [0, 0.4, 0], (b, g) => {
    b.ellipsoid(0.13, 0.115, 0.12, { p: [0, 0.1, 0], c: C.a, c2: C.b, e: [0.9, 0.8], w: 14, h: 9 });
    b.ellipsoid(0.1, 0.05, 0.05, { p: [0, 0.1, -0.1], c: C.dark, e: 0.6, w: 10, h: 6, ao: 0, noise: 0 });
    for (const sx of [-1, 1]) eye(b, g, sx * 0.045, 0.105, -0.142, 0.022, { glow: true, c: 0xfff1cf, i: 2.2 });
    b.limb([0.07, 0.2, 0.02], [0.09, 0.3, 0.03], 0.01, 0.007, { c: C.dark, cap: 2, w: 5 });
    g.ellipsoid(0.022, 0.022, 0.022, { p: [0.09, 0.31, 0.03], c: C.acc, i: 2.2, w: 6, h: 4 });
  });
  const arms = [-1, 1].map((sx) => {
    const up = rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.2, 0.32, 0], (b) => {
      b.ellipsoid(0.045, 0.045, 0.045, { c: C.b, w: 8, h: 6 });
      b.limb([0, 0, 0], [0, -0.16, 0], 0.036, 0.03, { c: C.a, c2: C.b, cap: 3, w: 8 });
    }, { pk: 'kArmU' });
    const fore = rig.part(sx < 0 ? 'foreL' : 'foreR', up, [0, -0.16, 0], (b) => {
      b.limb([0, 0, 0], [0, -0.15, 0], 0.03, 0.026, { c: C.a, c2: C.b, cap: 3, w: 8 });
      b.ellipsoid(0.034, 0.034, 0.034, { p: [0, -0.16, 0], c: C.dark, w: 8, h: 6 });
    }, { pk: 'kArmF' });
    return { up, fore };
  });
  rig.part('parcel', torso, [0, 0.17, -0.24], (b, g) => {
    b.ellipsoid(0.12, 0.09, 0.09, { c: C.box, c2: 0xa07a46, e: 0.3, w: 10, h: 6 });
    g.limb([-0.125, 0, -0.01], [0.125, 0, -0.01], 0.012, 0.012, { c: C.acc, i: 1.4, cap: 2, w: 5 });
    g.limb([0, 0.095, -0.01], [0, -0.095, -0.01], 0.012, 0.012, { c: C.acc, i: 1.4, cap: 2, w: 5 });
  });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    hips.position.y = 0.4 + Math.abs(Math.sin(w)) * 0.025 * m;
    swingLimb(legs[0], w, 0.55 * m, 0.8, -1);
    swingLimb(legs[1], w + Math.PI, 0.55 * m, 0.8, -1);
    torso.rotation.x = -0.05 * m;
    torso.rotation.y = Math.sin(w) * 0.06 * m;
    head.rotation.y = s.headYaw * 0.9;
    head.rotation.x = s.headPitch * 0.4;
    for (let i = 0; i < 2; i++) {
      arms[i].up.rotation.x = 0.9 + Math.sin(w + i * Math.PI) * 0.05 * m; // paketi önde taşır
      arms[i].up.rotation.z = (i === 0 ? -1 : 1) * 0.12;
      arms[i].fore.rotation.x = 0.7;
    }
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2);
  };
}

/* ================================================================================================
 * YARDIM DRONU — yuvarlak beyaz gövde, dört yumuşak pervane, alt halka ışığı, tek sevimli göz.
 * ============================================================================================== */
function yardimdron(rig) {
  const C = { a: 0xf4f7fb, b: 0xbac5d4, dark: 0x2b323f, acc: 0x7dff9a };
  rig.stride = 1;
  rig.attackDur = 1;
  rig.glowColor = C.acc;
  rig.deathColor = 0xa8ffc0;
  rig.baseEmissive('lit', 0x2e3c34);
  rig.addMat('blur', 'additive', { opacity: 0.3 });
  const body = rig.node('body', null, [0, 0.3, 0]);
  rig.part('shell', body, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.17, 0.18, 0.17, { c: C.a, c2: C.b, w: 14, h: 9 });
    b.ellipsoid(0.1, 0.07, 0.06, { p: [0, 0.01, -0.13], c: C.dark, e: 0.7, w: 10, h: 6, ao: 0, noise: 0 });
    g.ellipsoid(0.048, 0.048, 0.02, { p: [0, 0.012, -0.178], c: C.acc, i: 2.4, w: 8, h: 6 });
    g.torus(0.15, 0.011, { p: [0, -0.12, 0], c: C.acc, i: 1.6, w: 20, m: 5 });
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + Math.PI / 4;
      b.limb([Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12], [Math.cos(a) * 0.23, 0.08, Math.sin(a) * 0.23], 0.022, 0.018, { c: C.b, c2: C.dark, cap: 3, w: 6 });
    }
  });
  const rotors = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + Math.PI / 4;
    const r = rig.part('rotor' + k, body, [Math.cos(a) * 0.23, 0.1, Math.sin(a) * 0.23], (b, g, x) => {
      b.lathe([[0.001, -0.004], [0.034, -0.004], [0.034, 0.012], [0.001, 0.014]], { sides: 8, c: C.dark });
      x.lathe([[0.001, 0.0], [0.15, 0.0], [0.15, 0.004], [0.001, 0.004]], { sides: 14, c: C.acc, ao: 0, noise: 0 });
    }, { mats: ['lit', 'glow', 'blur'] });
    rotors.push(r);
  }
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    body.position.y = 0.3 + Math.sin(s.t * 2.1 + 1) * 0.025;
    body.rotation.x = -0.12 * m;
    body.rotation.z = Math.sin(s.t * 1.3) * 0.04;
    const spin = s.reduced ? 7 : 24;
    for (let k = 0; k < 4; k++) rotors[k].rotation.y = s.t * spin * (k % 2 === 0 ? 1 : -1);
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.6);
  };
}

/* ================================================================================================
 * BEKÇİ ROBOT — kobalt gövdeli, omuzlukları yuvarlak, kehribar vizörlü kibar nöbetçi; uyarırken AVUCUNU kaldırır ("dur").
 * ============================================================================================== */
function bekcirobot(rig) {
  const C = { a: 0x4a5f9a, b: 0x27345c, dark: 0x1a2038, silver: 0xd3dae6, acc: 0xffc24a };
  rig.stride = 5;
  rig.attackDur = 2.25; // rüzgâr evresi (%40) ≈ 0.9 sn
  rig.glowColor = C.acc;
  rig.deathColor = 0xffe0a0;
  rig.baseEmissive('lit', 0x28365c);
  const hips = rig.part('hips', null, [0, 0.9, 0], (b) => {
    b.ellipsoid(0.22, 0.1, 0.14, { c: C.b, c2: C.dark, e: 0.6, w: 12, h: 6 });
  });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.13, -0.05, 0], 0.42,
    (b) => { b.limb([0, 0, 0], [0, -0.42, 0], 0.075, 0.06, { c: C.a, c2: C.b, cap: 3, w: 8 }); },
    (b, g) => {
      b.limb([0, 0, 0], [0, -0.4, 0], 0.06, 0.05, { c: C.a, c2: C.b, cap: 3, w: 8 });
      b.ellipsoid(0.075, 0.05, 0.12, { p: [0, -0.42, -0.03], c: C.b, c2: C.dark, e: 0.7, w: 8, h: 5 });
      g.ellipsoid(0.05, 0.01, 0.06, { p: [0, -0.465, -0.06], c: C.acc, i: 1.1, w: 6, h: 3 });
    },
    { pkUpper: 'gLegU', pkLower: 'gLegLo' },
  ));
  const torso = rig.part('torso', hips, [0, 0.08, 0], (b, g) => {
    b.ellipsoid(0.27, 0.3, 0.17, { p: [0, 0.3, 0], c: C.a, c2: C.b, e: 0.65, w: 16, h: 10 });
    b.ellipsoid(0.17, 0.12, 0.13, { p: [0, 0.03, 0], c: C.b, c2: C.dark, e: 0.6, w: 12, h: 6 });
    for (const sx of [-1, 1]) b.ellipsoid(0.1, 0.085, 0.1, { p: [sx * 0.31, 0.52, 0], c: C.silver, c2: C.a, w: 10, h: 7 }); // omuzluk
    g.ellipsoid(0.07, 0.045, 0.012, { p: [0, 0.36, -0.168], c: C.acc, i: 1.8, w: 8, h: 5 }); // göğüs rozeti
    g.limb([-0.14, 0.2, -0.165], [0.14, 0.2, -0.165], 0.008, 0.008, { c: C.acc, i: 1.2, cap: 2, w: 5 });
  });
  const head = rig.part('head', torso, [0, 0.62, 0], (b, g) => {
    b.ellipsoid(0.16, 0.14, 0.15, { p: [0, 0.1, 0], c: C.silver, c2: C.a, e: [0.9, 0.85], w: 14, h: 9 });
    b.ellipsoid(0.13, 0.055, 0.06, { p: [0, 0.11, -0.12], c: C.dark, e: 0.6, w: 12, h: 6, ao: 0, noise: 0 });
    g.ellipsoid(0.1, 0.022, 0.012, { p: [0, 0.115, -0.178], c: C.acc, i: 2.4, w: 10, h: 5 });
    b.ellipsoid(0.04, 0.05, 0.04, { p: [0, 0.27, 0], c: C.a, w: 8, h: 6 });
  });
  const arms = [-1, 1].map((sx) => {
    const up = rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.34, 0.52, 0], (b) => {
      b.limb([0, 0, 0], [0, -0.3, 0], 0.06, 0.05, { c: C.a, c2: C.b, cap: 3, w: 8 });
    }, { pk: 'gArmU' });
    const fore = rig.part(sx < 0 ? 'foreL' : 'foreR', up, [0, -0.3, 0], (b, g) => {
      b.limb([0, 0, 0], [0, -0.28, 0], 0.05, 0.042, { c: C.a, c2: C.b, cap: 3, w: 8 });
      b.ellipsoid(0.055, 0.06, 0.03, { p: [0, -0.31, 0], c: C.silver, c2: C.b, e: 0.7, w: 8, h: 6 });
      g.ellipsoid(0.04, 0.045, 0.01, { p: [0, -0.31, -0.03], c: C.acc, i: 1.4, w: 8, h: 5 }); // "dur" avucu
    }, { pk: 'gArmF' });
    return { up, fore };
  });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    hips.position.y = 0.9 + Math.abs(Math.sin(w)) * 0.03 * m + Math.sin(s.t * 1.2) * 0.006;
    swingLimb(legs[0], w, 0.5 * m, 0.8, -1);
    swingLimb(legs[1], w + Math.PI, 0.5 * m, 0.8, -1);
    torso.rotation.y = Math.sin(w) * 0.05 * m;
    head.rotation.y = s.headYaw * 0.9;
    head.rotation.x = s.headPitch * 0.4;
    const swing = Math.sin(w) * 0.4 * m;
    // sol kol sakin; sağ kol uyarırken öne kalkar (avuç dışa)
    arms[0].up.rotation.x = swing * 0.8;
    arms[1].up.rotation.x = -swing * 0.8 + s.wind * 1.5; // +x: kol öne kalkar (avuç dışa)
    arms[1].fore.rotation.x = -0.1 + s.wind * 0.35;
    arms[0].fore.rotation.x = -0.1;
    arms[1].up.rotation.z = 0.05 + s.wind * 0.1;
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 1.6) + s.wind * 0.35;
  };
}

/* ================================================================================================
 * HATABOT — pembe vurgulu, kafası gövdesine biraz büyük, tek gözü iri; çevresinde minik "hata" küpleri döner. Çarpınca özür dilercesine eğilir.
 * ============================================================================================== */
function hatabot(rig) {
  const C = { a: 0xd9dfe9, b: 0x9aa5b8, dark: 0x2a2e3b, acc: 0xff4fd8, acc2: 0x35e6ff };
  rig.stride = 5.2;
  rig.attackDur = 1.5; // rüzgâr ≈ 0.6 sn
  rig.glowColor = C.acc;
  rig.deathColor = 0xffa0ec;
  rig.baseEmissive('lit', 0x3c3040);
  const hips = rig.part('hips', null, [0, 0.3, 0], (b) => {
    b.ellipsoid(0.12, 0.07, 0.09, { c: C.dark, c2: 0x15171f, e: 0.6, w: 10, h: 6 });
  });
  const legs = [-1, 1].map((sx) => makeLimb(
    rig, sx < 0 ? 'legL' : 'legR', hips, [sx * 0.07, -0.03, 0], 0.13,
    (b) => { b.limb([0, 0, 0], [0, -0.13, 0], 0.03, 0.026, { c: C.b, c2: C.dark, cap: 3, w: 7 }); },
    (b) => {
      b.limb([0, 0, 0], [0, -0.12, 0], 0.026, 0.022, { c: C.b, c2: C.dark, cap: 3, w: 7 });
      b.ellipsoid(0.04, 0.022, 0.06, { p: [0, -0.13, -0.02], c: C.acc, c2: 0xb0309a, e: 0.7, w: 8, h: 5 });
    },
    { pkUpper: 'hLegU', pkLower: 'hLegLo' },
  ));
  const torso = rig.part('torso', hips, [0, 0.03, 0], (b, g) => {
    b.ellipsoid(0.15, 0.15, 0.11, { p: [0, 0.14, 0], c: C.a, c2: C.b, e: 0.55, w: 12, h: 8 });
    g.limb([-0.1, 0.2, -0.105], [0.1, 0.2, -0.105], 0.009, 0.009, { c: C.acc2, i: 1.5, cap: 2, w: 5 });
    g.limb([-0.1, 0.12, -0.105], [0.04, 0.12, -0.105], 0.009, 0.009, { c: C.acc, i: 1.5, cap: 2, w: 5 });
  });
  const head = rig.part('head', torso, [0, 0.3, 0], (b, g) => {
    b.ellipsoid(0.17, 0.14, 0.14, { p: [0, 0.11, 0], c: C.a, c2: C.b, e: 0.5, w: 12, h: 8 }); // kutumsu iri kafa
    b.ellipsoid(0.12, 0.09, 0.05, { p: [-0.01, 0.12, -0.12], c: C.dark, e: 0.7, w: 10, h: 6, ao: 0, noise: 0 });
    g.ellipsoid(0.07, 0.07, 0.03, { p: [-0.035, 0.13, -0.168], c: C.acc2, i: 2.4, w: 10, h: 7 }); // iri göz
    g.ellipsoid(0.03, 0.03, 0.02, { p: [0.065, 0.1, -0.165], c: C.acc, i: 2.2, w: 8, h: 5 }); // minik göz
    b.limb([-0.05, 0.24, 0], [-0.08, 0.36, 0.02], 0.01, 0.007, { c: C.dark, cap: 2, w: 5 });
    g.ellipsoid(0.026, 0.026, 0.026, { p: [-0.08, 0.375, 0.02], c: C.acc, i: 2.4, w: 6, h: 4 });
  });
  const arms = [-1, 1].map((sx) => rig.part(sx < 0 ? 'armL' : 'armR', torso, [sx * 0.17, 0.24, 0], (b) => {
    b.ellipsoid(0.03, 0.03, 0.03, { c: C.b, w: 6, h: 5 });
    b.limb([0, 0, 0], [0, -0.2, 0], 0.028, 0.024, { c: C.a, c2: C.b, cap: 3, w: 7 });
    b.ellipsoid(0.034, 0.034, 0.034, { p: [0, -0.21, 0], c: C.acc, c2: 0xb0309a, w: 7, h: 5 });
  }));
  // çevresinde dönen minik "hata" küpleri (yalnız süs)
  const bits = rig.part('bits', torso, [0, 0.28, 0], (b, g) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      const p = [Math.cos(a) * 0.3, 0.05 + k * 0.05, Math.sin(a) * 0.3];
      g.ellipsoid(0.03, 0.03, 0.03, { p, c: k === 1 ? C.acc2 : C.acc, i: 1.5, e: 0.25, w: 6, h: 4 });
    }
  });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    const w = s.walk;
    hips.position.y = 0.3 + Math.abs(Math.sin(w)) * 0.045 * m;
    swingLimb(legs[0], w, 0.7 * m, 1, -1);
    swingLimb(legs[1], w + Math.PI, 0.7 * m, 1, -1);
    torso.rotation.z = Math.sin(w) * 0.1 * m;
    torso.rotation.x = -0.1 * m + s.wind * 0.18 - s.hit * 0.3; // çarpmadan önce hafif geriye, sonra "özür" eğilmesi
    head.rotation.y = s.headYaw * 0.9 + Math.sin(s.t * 1.7) * (s.reduced ? 0 : 0.08);
    head.rotation.x = s.headPitch * 0.4 + s.hit * 0.5;
    const wob = s.reduced ? 0.2 : 1;
    arms[0].rotation.x = Math.sin(w) * 0.8 * m + s.wind * 1.2;
    arms[1].rotation.x = -Math.sin(w) * 0.8 * m + s.wind * 1.2;
    arms[0].rotation.z = 0.15 + Math.sin(s.t * 3) * 0.12 * wob * s.wind;
    arms[1].rotation.z = -0.15 - Math.sin(s.t * 3) * 0.12 * wob * s.wind;
    bits.rotation.y = s.t * (s.reduced ? 0.4 : 1.2 + s.wind * 1.5);
    rig.mats.glow.userData.k = 0.85 + 0.15 * Math.sin(s.t * 2) + s.wind * 0.5; // ≤2 Hz
  };
}

/* ================================================================================================
 * GÖZCÜ DRON — disk gövde, iri parlak "göz" merceği, iki yan kapsül; tarama sırasında çevresinde ışık halkası büyür.
 * ============================================================================================== */
function gozdrone(rig) {
  const C = { a: 0xe3e9f2, b: 0xa4afc2, dark: 0x252b38, acc: 0x35e6ff };
  rig.stride = 1;
  rig.attackDur = 2; // rüzgâr ≈ 0.8 sn
  rig.glowColor = C.acc;
  rig.deathColor = 0x9ff4ff;
  rig.baseEmissive('lit', 0x2e4050);
  rig.addMat('ring', 'additive', { opacity: 0.4 });
  const body = rig.node('body', null, [0, 0.34, 0]);
  rig.part('disc', body, [0, 0, 0], (b, g) => {
    b.ellipsoid(0.3, 0.09, 0.3, { c: C.a, c2: C.b, w: 18, h: 8 });
    b.ellipsoid(0.17, 0.12, 0.17, { p: [0, 0.07, 0], c: C.a, c2: C.b, w: 12, h: 7 });
    b.ellipsoid(0.1, 0.1, 0.06, { p: [0, 0.02, -0.26], c: C.dark, w: 10, h: 7, ao: 0, noise: 0 });
    g.ellipsoid(0.07, 0.07, 0.03, { p: [0, 0.02, -0.3], c: C.acc, i: 2.6, w: 10, h: 7 });
    g.torus(0.28, 0.012, { p: [0, -0.04, 0], c: C.acc, i: 1.6, w: 26, m: 5 });
    for (const sx of [-1, 1]) {
      b.ellipsoid(0.07, 0.06, 0.13, { p: [sx * 0.34, 0, 0.02], c: C.b, c2: C.dark, e: 0.7, w: 10, h: 6 });
      g.ellipsoid(0.02, 0.02, 0.02, { p: [sx * 0.34, 0.01, -0.12], c: C.acc, i: 2, w: 6, h: 4 });
    }
    b.limb([0, 0.15, 0.05], [0, 0.26, 0.08], 0.012, 0.008, { c: C.dark, cap: 2, w: 5 });
    g.ellipsoid(0.026, 0.026, 0.026, { p: [0, 0.27, 0.08], c: C.acc, i: 2.4, w: 6, h: 4 });
  });
  const rot = rig.part('rot', body, [0, 0.0, 0], (b, g, x) => {
    x.lathe([[0.34, 0.0], [0.38, 0.0], [0.38, 0.006], [0.34, 0.006]], { sides: 24, closed: true, c: C.acc, ao: 0, noise: 0 });
  }, { mats: ['lit', 'glow', 'ring'] });
  return (s) => {
    const m = clamp(s.moving, 0, 1.2);
    body.position.y = 0.34 + Math.sin(s.t * 1.9) * 0.03;
    body.rotation.x = -0.1 * m;
    body.rotation.z = Math.sin(s.t * 1.1) * 0.05;
    body.rotation.y = s.headYaw * 0.5;
    // tarama halkası: rüzgâr evresinde 0 → 1 büyür, sonra söner
    const ring = clamp(s.wind, 0, 1);
    const sc = 0.001 + ring * (s.reduced ? 1.6 : 2.6);
    rot.scale.set(sc, ring > 0.01 ? 1 : 0.001, sc);
    rot.rotation.y = s.t * 0.8;
    rig.mats.glow.userData.k = 0.9 + 0.1 * Math.sin(s.t * 2.4) + ring * 0.4;
  };
}

/** Tür anahtarı → model kurucu (rig, def) → anim(s, dt). MODEL_BUILDERS'tan ayrı (ana diyar tablosu/testleri değişmez). */
export const ROBOT_BUILDERS = Object.freeze({
  supurgebot, kuryebot, yardimdron, bekcirobot, hatabot, gozdrone,
});

