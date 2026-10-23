/*
 * KEŞİF render — BÜYÜ parçacık tarifleri (particleFx.js ile aynı sözleşme: sys.S taslağı + sys.emit).
 *
 *   fireTrail(p) · fireBurst(p, r)        ateş topu izi (kor/ışıma) ve patlaması (flaş + halka + kor + duman)
 *   frostTrail(p) · frostBurst(p, r)      buz mızrağı izi ve kırılması (kristal kıymıkları + kırağı halkası)
 *   healRing(p, color)                    şifa: yükselen halka + sarmal yeşil zerreler + kalpler
 *   blinkBurst(p, color)                  kuantum sıçrayışı: çıkış/varış parıltısı (dikey halka + yıldız çizgileri)
 *   enchantBurst(p, tier)                 büyü yapıldı: yükselen rünler, halkalar, yıldız fışkırması (kademe arttıkça yoğun)
 *   arcaneTick(e, dt)                     Büyü Masası yayıcısı: etrafında dönen rün/kitap parıltıları + yükselen toz
 *   cauldronTick(e, dt)                   Simya Kazanı yayıcısı: kabarcıklar + buhar (e.radius: 0 boşta, 1 demleniyor; e.color iksir rengi)
 *   spellCast(p, color, kind)             asa ucunda kısa parıltı (el konumunda)
 *
 * Bütçe: hiçbir tarif 40 parçacığı aşmaz (yoğunluk ve kısıtlı hareket sys.density/sys.reduced ile ölçeklenir); kare başı ayırma yok.
 */
import { KIND } from './particleFx.js';
import { px, py, pz, scaleCount } from './particleLogic.js';

const TAU = Math.PI * 2;

export function createFxMagic(sys) {
  const S = sys.S;
  const rnd = () => sys.rnd();
  const n = (count) => scaleCount(count, sys.density, rnd);
  const rv = (a, b) => a + rnd() * (b - a);
  const calm = () => (sys.reduced ? 0 : 1);
  function c0(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r0 = c[0] * k; S.g0 = c[1] * k; S.b0 = c[2] * k; S.a0 = a;
  }
  function c1(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r1 = c[0] * k; S.g1 = c[1] * k; S.b1 = c[2] * k; S.a1 = a;
  }
  function from(p) { S.x = px(p); S.y = py(p); S.z = pz(p); }

  /* ---------------------------------------------------------------- ateş */
  function fireTrail(p) {
    if (rnd() > sys.density) return;
    S.reset();
    S.kind = KIND.GLOW; from(p);
    S.x += rv(-0.06, 0.06); S.y += rv(-0.06, 0.06); S.z += rv(-0.06, 0.06);
    S.vx = rv(-0.2, 0.2); S.vy = rv(0.1, 0.55); S.vz = rv(-0.2, 0.2);
    S.drag = 1.6; S.life = rv(0.3, 0.5); S.s0 = rv(0.2, 0.3); S.s1 = 0.03;
    c0(0xffa63a, 0.8, 1.1); c1(0xff3a0a, 0, 1);
    sys.emit(S);
    if (rnd() < 0.5) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      S.vx = rv(-0.5, 0.5); S.vy = rv(0.2, 0.9); S.vz = rv(-0.5, 0.5);
      S.grav = -1.2; S.drag = 0.8; S.life = rv(0.4, 0.8); S.s0 = rv(0.03, 0.05); S.s1 = 0.01; S.tw = 8 * calm() + 0.01;
      c0(0xffd070, 1, 1.3); c1(0xff4a10, 0, 1);
      sys.emit(S);
    }
    if (rnd() < 0.25) {
      S.reset();
      S.kind = KIND.SMOKE; from(p);
      S.vy = rv(0.3, 0.7); S.drag = 1.5; S.life = rv(0.5, 0.8); S.s0 = 0.08; S.s1 = rv(0.2, 0.3);
      c0(0x4a4440, 0.22, 1); c1(0x2a2826, 0, 1);
      sys.emit(S);
    }
  }

  function fireBurst(p, radius) {
    const r = radius > 0 ? Math.min(radius, 4) : 2;
    S.reset();
    S.kind = KIND.GLOW; from(p); S.y += 0.15; S.life = sys.reduced ? 0.3 : 0.2; S.s0 = r * 1.2; S.s1 = r * 0.3;
    c0(0xfff0c0, sys.reduced ? 0.5 : 0.9, 1); c1(0xff7a1c, 0, 1);
    sys.emit(S);
    S.reset();
    S.kind = KIND.RING; from(p); S.y += 0.12; S.mode = 0; S.s0 = 0.3; S.s1 = r * 1.15; S.life = 0.45;
    c0(0xffa040, 0.9, 1.4); c1(0xff3a0a, 0, 1);
    sys.emit(S);
    const embers = n(16);
    for (let i = 0; i < embers; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p); S.y += 0.15;
      const a = rnd() * TAU;
      const sp = rv(2.5, 6.5);
      S.vx = Math.cos(a) * sp; S.vy = rv(1.5, 5.5); S.vz = Math.sin(a) * sp;
      S.grav = -9; S.drag = 1.1; S.life = rv(0.4, 0.85); S.s0 = rv(0.035, 0.06); S.s1 = 0.01;
      c0(0xffc060, 1, 1.35); c1(0xff4a10, 0, 1);
      sys.emit(S);
    }
    const flames = n(8);
    for (let i = 0; i < flames; i++) {
      S.reset();
      S.kind = KIND.GLOW; from(p);
      const a = rnd() * TAU;
      const rr = rv(0.1, r * 0.55);
      S.x += Math.cos(a) * rr; S.z += Math.sin(a) * rr; S.y += 0.1;
      S.vx = rv(-0.3, 0.3); S.vy = rv(0.8, 2.2); S.vz = rv(-0.3, 0.3);
      S.drag = 1.2; S.life = rv(0.4, 0.8); S.s0 = rv(0.22, 0.36); S.s1 = 0.04; S.turb = 0.1; S.tfreq = 5;
      c0(0xff9a30, 0.7, 1.1); c1(0xff3a0a, 0, 1);
      sys.emit(S);
    }
    const smoke = n(6);
    for (let i = 0; i < smoke; i++) {
      S.reset();
      S.kind = KIND.SMOKE; from(p); S.y += 0.3;
      S.x += rv(-0.4, 0.4); S.z += rv(-0.4, 0.4);
      S.vy = rv(0.6, 1.4); S.vx = rv(-0.3, 0.3); S.vz = rv(-0.3, 0.3);
      S.drag = 1.4; S.life = rv(0.8, 1.3); S.s0 = rv(0.2, 0.3); S.s1 = rv(0.6, 0.9); S.spin = rv(-1, 1) * calm();
      c0(0x5a5048, 0.45, 1); c1(0x2a2826, 0, 1);
      sys.emit(S);
    }
  }

  /* ---------------------------------------------------------------- buz */
  function frostTrail(p) {
    if (rnd() > sys.density) return;
    S.reset();
    S.kind = KIND.STAR; from(p);
    S.x += rv(-0.05, 0.05); S.y += rv(-0.05, 0.05); S.z += rv(-0.05, 0.05);
    S.vx = rv(-0.2, 0.2); S.vy = rv(-0.2, 0.2); S.vz = rv(-0.2, 0.2);
    S.drag = 2; S.life = rv(0.35, 0.6); S.s0 = rv(0.09, 0.15); S.s1 = 0.01; S.tw = 9 * calm() + 0.01;
    c0(0xdff6ff, 0.95, 1.3); c1(0x7fd4ff, 0, 1);
    sys.emit(S);
    if (rnd() < 0.5) {
      S.reset();
      S.kind = KIND.GLOW; from(p); S.life = 0.2; S.s0 = 0.16; S.s1 = 0.02;
      c0(0x9fe0ff, 0.5, 1); c1(0x9fe0ff, 0, 1);
      sys.emit(S);
    }
  }

  function frostBurst(p, radius) {
    const r = radius > 0 ? Math.min(radius, 3) : 1.2;
    S.reset();
    S.kind = KIND.GLOW; from(p); S.life = sys.reduced ? 0.26 : 0.16; S.s0 = 0.8 + r * 0.3; S.s1 = 0.15;
    c0(0xffffff, sys.reduced ? 0.45 : 0.85, 1); c1(0x9fe0ff, 0, 1);
    sys.emit(S);
    S.reset();
    S.kind = KIND.RING; from(p); S.mode = 3; S.s0 = 0.12; S.s1 = 0.9 + r * 0.5; S.life = 0.38;
    c0(0xbfeaff, 0.9, 1.4); c1(0x7fd4ff, 0, 1);
    sys.emit(S);
    const shards = n(14);
    for (let i = 0; i < shards; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p);
      const a = rnd() * TAU;
      const sp = rv(2.5, 6);
      S.vx = Math.cos(a) * sp; S.vy = rv(0.5, 4.5); S.vz = Math.sin(a) * sp;
      S.grav = -10; S.drag = 1.5; S.life = rv(0.35, 0.7); S.s0 = rv(0.04, 0.07); S.s1 = 0.012;
      c0(0xe8fbff, 1, 1.3); c1(0x7fd4ff, 0, 1);
      sys.emit(S);
    }
    const flakes = n(9);
    for (let i = 0; i < flakes; i++) {
      S.reset();
      S.kind = KIND.STAR; from(p);
      S.vx = rv(-1.4, 1.4); S.vy = rv(0.4, 2); S.vz = rv(-1.4, 1.4);
      S.grav = -0.8; S.drag = 1; S.life = rv(0.7, 1.2); S.s0 = rv(0.07, 0.12); S.s1 = 0.02; S.tw = 7 * calm() + 0.01; S.turb = 0.12; S.tfreq = 3;
      c0(0xffffff, 1, 1.2); c1(0x9fe0ff, 0, 1);
      sys.emit(S);
    }
  }

  /* ---------------------------------------------------------------- şifa / sıçrayış */
  function healRing(p, color = 0x7dffb0) {
    for (let i = 0; i < 2; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.y += 0.1 + i * 0.7; S.mode = 0; S.delay = i * 0.14; S.s0 = 0.25; S.s1 = 1.15; S.life = 0.7;
      c0(color, 0.8, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
    const motes = n(20);
    for (let i = 0; i < motes; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p); S.y += 0.05;
      S.mode = 4; // yörünge: yükselen sarmal
      S.vx = rv(0.45, 0.8); S.vy = rv(0.9, 1.9); S.vz = rnd() * TAU;
      S.endR = 0.12; S.swirl = (i % 2 ? 1 : -1) * rv(2.2, 4) * (sys.reduced ? 0.5 : 1);
      S.life = rv(0.8, 1.3); S.s0 = rv(0.05, 0.085); S.s1 = 0.015; S.tw = 7; S.delay = rv(0, 0.25);
      c0(color, 1, 1.3); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
    if (!sys.reduced) {
      S.reset();
      S.kind = KIND.GLOW; from(p); S.y += 0.9; S.life = 0.45; S.s0 = 1.6; S.s1 = 0.5;
      c0(color, 0.3, 1); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  function blinkBurst(p, color = 0xb25cff) {
    S.reset();
    S.kind = KIND.GLOW; from(p); S.y += 0.9; S.life = sys.reduced ? 0.3 : 0.18; S.s0 = 1.5; S.s1 = 0.3;
    c0(0xffffff, sys.reduced ? 0.4 : 0.8, 1); c1(color, 0, 1);
    sys.emit(S);
    for (let i = 0; i < 2; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.y += 0.9; S.mode = i ? 1 : 2; S.s0 = 0.2; S.s1 = 1.05 + i * 0.2; S.life = 0.42 + i * 0.08;
      c0(color, 0.85, 1.4); c1(color, 0, 1);
      sys.emit(S);
    }
    const lines = n(12);
    for (let i = 0; i < lines; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p); S.y += rv(0.1, 1.7);
      const a = rnd() * TAU;
      const sp = rv(1.5, 4);
      S.vx = Math.cos(a) * sp; S.vy = rv(-0.5, 1.2); S.vz = Math.sin(a) * sp;
      S.drag = 1.8; S.life = rv(0.25, 0.5); S.s0 = rv(0.04, 0.07); S.s1 = 0.01;
      c0(color, 1, 1.4); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
    const motes = n(10);
    for (let i = 0; i < motes; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p); S.y += rv(0, 1.8);
      S.x += rv(-0.35, 0.35); S.z += rv(-0.35, 0.35);
      S.vy = rv(0.2, 0.9); S.drag = 0.8; S.life = rv(0.5, 0.9); S.s0 = rv(0.04, 0.07); S.s1 = 0.012; S.tw = 8;
      c0(color, 1, 1.2); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  function spellCast(p, color = 0xffffff) {
    S.reset();
    S.kind = KIND.GLOW; from(p); S.life = 0.18; S.s0 = 0.34; S.s1 = 0.08;
    c0(color, sys.reduced ? 0.4 : 0.75, 1.1); c1(color, 0, 1);
    sys.emit(S);
    const cnt = n(6);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p);
      const a = rnd() * TAU;
      const sp = rv(0.8, 2.4);
      S.vx = Math.cos(a) * sp; S.vy = rv(-0.4, 1.4); S.vz = Math.sin(a) * sp;
      S.drag = 1.5; S.life = rv(0.2, 0.4); S.s0 = 0.03; S.s1 = 0.008;
      c0(color, 1, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /* ---------------------------------------------------------------- büyü yapıldı (Büyü Masası) */
  function enchantBurst(p, tier = 1) {
    const t = Math.max(1, Math.min(5, tier | 0 || 1));
    const col = [0xb06aff, 0xc27aff, 0xd68cff, 0xff9aff, 0xffe0ff][t - 1];
    for (let i = 0; i < 3; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.y += 0.1 + i * 0.35; S.mode = 0; S.delay = i * 0.1; S.s0 = 0.3; S.s1 = 1.4 + i * 0.3; S.life = 0.8 + i * 0.1;
      c0(col, 0.85, 1.35); c1(col, 0, 1);
      sys.emit(S);
    }
    if (!sys.reduced) {
      S.reset();
      S.kind = KIND.GLOW; from(p); S.y += 0.6; S.life = 0.4; S.s0 = 1.8; S.s1 = 0.4;
      c0(0xffffff, 0.45, 1); c1(col, 0, 1);
      sys.emit(S);
    }
    const runes = n(16 + t * 4);
    for (let i = 0; i < runes; i++) {
      S.reset();
      S.kind = KIND.STAR; from(p); S.y += 0.4;
      S.mode = 4; // yörünge: yükselen rünler
      S.vx = rv(0.4, 1.1); S.vy = rv(1.0, 2.4); S.vz = rnd() * TAU;
      S.endR = rv(0.05, 0.4); S.swirl = (i % 2 ? 1 : -1) * rv(1.4, 3.4) * (sys.reduced ? 0.5 : 1);
      S.life = rv(1.1, 1.9); S.s0 = rv(0.12, 0.2); S.s1 = 0.03; S.tw = 7 * calm() + 0.01; S.delay = rv(0, 0.35);
      c0(i % 3 === 0 ? 0xffffff : col, 1, 1.3); c1(col, 0, 1);
      sys.emit(S);
    }
    const sparks = n(12 + t * 3);
    for (let i = 0; i < sparks; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p); S.y += 0.5;
      const a = rnd() * TAU;
      const sp = rv(2, 5);
      S.vx = Math.cos(a) * sp; S.vy = rv(1.5, 4.5); S.vz = Math.sin(a) * sp;
      S.grav = -6; S.drag = 1.1; S.life = rv(0.5, 0.95); S.s0 = rv(0.05, 0.085); S.s1 = 0.012;
      c0(col, 1, 1.4); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  /* ---------------------------------------------------------------- sürekli yayıcılar */
  /** Büyü Masası: e.x/e.y/e.z masanın üstü (blok merkezi + 0,8). */
  function arcaneTick(e, dt) {
    e.a += dt * 11 * sys.density;
    while (e.a >= 1) {
      e.a -= 1;
      S.reset();
      S.kind = rnd() < 0.5 ? KIND.STAR : KIND.MOTE; S.x = e.x; S.y = e.y + rv(0.05, 0.35); S.z = e.z;
      S.mode = 4; // masa çevresinde dönen rün/kitap parıltıları
      const r = rv(0.55, 0.95);
      S.vx = r; S.vy = rv(0.18, 0.4); S.vz = rnd() * TAU;
      S.endR = r * rv(0.5, 0.9); S.swirl = (rnd() < 0.5 ? 1 : -1) * rv(0.7, 1.5) * (sys.reduced ? 0.5 : 1);
      S.life = rv(2.2, 3.4); S.s0 = rv(0.09, 0.16); S.s1 = 0.03; S.tw = 4.5 * calm() + 0.01;
      const hex = rnd() < 0.6 ? 0xb88aff : rnd() < 0.5 ? 0x7fe0ff : 0xffffff;
      c0(hex, 0.95, 1.25); c1(hex, 0, 1);
      sys.emit(S);
    }
    e.b += dt * 1.6 * sys.density;
    while (e.b >= 1) {
      e.b -= 1;
      S.reset();
      S.kind = KIND.GLOW; S.x = e.x + rv(-0.25, 0.25); S.y = e.y - 0.05; S.z = e.z + rv(-0.25, 0.25);
      S.vy = rv(0.25, 0.5); S.drag = 0.6; S.life = rv(1.3, 2); S.s0 = rv(0.24, 0.36); S.s1 = 0.05;
      c0(0xa070ff, 0.32, 1); c1(0xa070ff, 0, 1);
      sys.emit(S);
    }
  }

  /** Simya Kazanı: e.radius 0..1 yoğunluk (demlenirken 1), e.color iksir rengi. e.y kazanın üst yüzü. */
  function cauldronTick(e, dt) {
    const k = e.radius > 0 ? Math.min(1, e.radius) : 0;
    const color = e.color === undefined ? 0x5fe08a : e.color;
    e.a += dt * (2.4 + 9 * k) * sys.density;
    while (e.a >= 1) {
      e.a -= 1;
      S.reset();
      S.kind = KIND.RING; S.x = e.x + rv(-0.28, 0.28); S.y = e.y + 0.01; S.z = e.z + rv(-0.28, 0.28);
      S.mode = 0; S.s0 = 0.03; S.s1 = rv(0.1, 0.2); S.life = rv(0.4, 0.7);
      c0(color, 0.75, 1.3); c1(color, 0, 1);
      sys.emit(S);
      S.reset();
      S.kind = KIND.GLOW; S.x = e.x + rv(-0.28, 0.28); S.y = e.y + 0.02; S.z = e.z + rv(-0.28, 0.28);
      S.vy = rv(0.2, 0.6) * (0.6 + k); S.drag = 1.2; S.life = rv(0.35, 0.65); S.s0 = rv(0.08, 0.13); S.s1 = 0.02;
      c0(color, 0.85, 1.4); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
    e.b += dt * (0.8 + 4 * k) * sys.density;
    while (e.b >= 1) {
      e.b -= 1;
      S.reset();
      S.kind = KIND.SMOKE; S.x = e.x + rv(-0.2, 0.2); S.y = e.y + 0.05; S.z = e.z + rv(-0.2, 0.2);
      S.vx = rv(-0.05, 0.05); S.vy = rv(0.35, 0.8); S.vz = rv(-0.05, 0.05);
      S.drag = 0.5; S.life = rv(1.2, 2); S.s0 = 0.12; S.s1 = rv(0.4, 0.6); S.turb = 0.1; S.tfreq = 1.5; S.spin = rv(-0.4, 0.4) * calm();
      c0(0xe8f4ee, 0.22 + 0.16 * k, 1); c1(0xc8d8d0, 0, 1);
      sys.emit(S);
    }
    if (k > 0.5) {
      e.c += dt * 2 * sys.density;
      while (e.c >= 1) {
        e.c -= 1;
        S.reset();
        S.kind = KIND.MOTE; S.x = e.x + rv(-0.2, 0.2); S.y = e.y + 0.05; S.z = e.z + rv(-0.2, 0.2);
        S.vx = rv(-0.3, 0.3); S.vy = rv(1.2, 2.2); S.vz = rv(-0.3, 0.3);
        S.grav = -2.4; S.drag = 0.5; S.life = rv(0.5, 0.95); S.s0 = rv(0.05, 0.08); S.s1 = 0.012; S.tw = 8 * calm() + 0.01;
        c0(color, 1, 1.4); c1(color, 0, 1);
        sys.emit(S);
      }
    }
  }

  return {
    fireTrail, fireBurst, frostTrail, frostBurst, healRing, blinkBurst, spellCast, enchantBurst, arcaneTick, cauldronTick,
  };
}
