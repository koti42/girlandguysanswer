/*
 * KEŞİF render — parçacık efekt tarifleri (blok kırma, vuruş, büyü, portal, boss, ortam…).
 * Her tarif, sistemin yeniden kullanılan "S" taslağını doldurup sys.emit(S) çağırır (ayırma yok).
 * sys: {S, emit(S), rnd(), density, reduced, col(hex) → [r,g,b]} — bkz. particles.js
 */
import { AMBIENT_RATES, orientFromNormal, px, py, pz, scaleCount } from './particleLogic.js';
import { paletteFrom } from './blockColors.js';

export const KIND = Object.freeze({
  GLOW: 0, SPARK: 1, RING: 2, CHIP: 3, SMOKE: 4, HEART: 5, STAR: 6, MOTE: 7,
});

const TAU = Math.PI * 2;

/** Yeniden kullanılan parçacık taslağı. reset() varsayılanları kurar. */
export function createScratch() {
  return {
    kind: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, s0: 0.1, s1: 0.1, grav: 0, drag: 0.05,
    r0: 1, g0: 1, b0: 1, a0: 1, r1: 1, g1: 1, b1: 1, a1: 0, spin: 0, tw: 15, seed: 0, mode: 0,
    turb: 0, tfreq: 3, swirl: 0, endR: 0, delay: 0,
    reset() {
      this.kind = 0; this.x = 0; this.y = 0; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0; this.life = 1;
      this.s0 = 0.1; this.s1 = 0.1; this.grav = 0; this.drag = 0.05;
      this.r0 = 1; this.g0 = 1; this.b0 = 1; this.a0 = 1; this.r1 = 1; this.g1 = 1; this.b1 = 1; this.a1 = 0;
      this.spin = 0; this.tw = 15; this.seed = 0; this.mode = 0; this.turb = 0; this.tfreq = 3; this.swirl = 0;
      this.endR = 0; this.delay = 0;
      return this;
    },
  };
}

const LEAF_COLORS = [0xe0731c, 0xc02a22, 0xe2bc26];
const PETAL_COLORS = [0xf6a8c4, 0xffd0e0, 0xe888ac];
const ASH_COLORS = [0x5a5a5e, 0x8a8a90, 0x3e3e44];

export function createFx(sys) {
  const S = sys.S;
  const rnd = () => sys.rnd();
  const n = (count) => scaleCount(count, sys.density, rnd);
  const rv = (a, b) => a + rnd() * (b - a);
  const dir = { x: 0, y: 0, z: 0 };
  /** Küre üzerinde düzgün rastgele yön. */
  function randDir() {
    const z = rnd() * 2 - 1;
    const a = rnd() * TAU;
    const s = Math.sqrt(Math.max(0, 1 - z * z));
    dir.x = s * Math.cos(a); dir.y = z; dir.z = s * Math.sin(a);
    return dir;
  }
  function c0(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r0 = c[0] * k; S.g0 = c[1] * k; S.b0 = c[2] * k; S.a0 = a;
  }
  function c1(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r1 = c[0] * k; S.g1 = c[1] * k; S.b1 = c[2] * k; S.a1 = a;
  }
  function from(p) { S.x = px(p); S.y = py(p); S.z = pz(p); }
  const calm = () => (sys.reduced ? 0 : 1);

  /* ---------------------------------------------------------------- blok */

  /** Blok kırıldı: renkli kırıntılar + toz. arg: blok kimliği | {color,color2} | hex dizisi. p: blok merkezi. */
  function blockBreak(arg, p, scale = 1) {
    const pal = paletteFrom(arg);
    const cx = px(p);
    const cy = py(p);
    const cz = pz(p);
    const chips = n(16 * scale);
    for (let i = 0; i < chips; i++) {
      S.reset();
      S.kind = KIND.CHIP;
      S.x = cx + rv(-0.4, 0.4); S.y = cy + rv(-0.4, 0.4); S.z = cz + rv(-0.4, 0.4);
      const d = randDir();
      const sp = rv(1.4, 3.6);
      S.vx = d.x * sp; S.vy = Math.abs(d.y) * sp * 0.8 + rv(1.2, 2.6); S.vz = d.z * sp;
      S.grav = -15; S.drag = 0.35; S.life = rv(0.55, 1.0);
      S.s0 = rv(0.04, 0.075); S.s1 = S.s0 * 0.8;
      S.spin = rv(-8, 8) * calm();
      const hex = pal[(rnd() * 4) | 0];
      const k = rv(0.85, 1.12);
      c0(hex, 1, k); c1(hex, 1, k * 0.9);
      sys.emit(S);
    }
    const puffs = n(5 * scale);
    for (let i = 0; i < puffs; i++) {
      S.reset();
      S.kind = KIND.SMOKE;
      S.x = cx + rv(-0.4, 0.4); S.y = cy + rv(-0.3, 0.4); S.z = cz + rv(-0.4, 0.4);
      S.vx = rv(-0.6, 0.6); S.vy = rv(0.2, 0.9); S.vz = rv(-0.6, 0.6);
      S.drag = 2.2; S.life = rv(0.5, 0.85); S.s0 = rv(0.1, 0.16); S.s1 = rv(0.32, 0.46);
      S.spin = rv(-1, 1) * calm();
      c0(pal[2], 0.42, 1); c1(0xb8b0a4, 0, 1);
      sys.emit(S);
    }
  }

  /** Kazarken yüzeyden ufak kırıntı. face: yüzey normali {x,y,z}|[x,y,z] (yoksa yukarı). p: blok merkezi. */
  function blockDust(arg, p, face) {
    const pal = paletteFrom(arg);
    const nx = face ? px(face) : 0;
    const ny = face ? py(face) : 1;
    const nz = face ? pz(face) : 0;
    const cnt = n(3);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.CHIP;
      S.x = px(p) + nx * 0.5 + rv(-0.3, 0.3) * (1 - Math.abs(nx));
      S.y = py(p) + ny * 0.5 + rv(-0.3, 0.3) * (1 - Math.abs(ny));
      S.z = pz(p) + nz * 0.5 + rv(-0.3, 0.3) * (1 - Math.abs(nz));
      const sp = rv(0.8, 1.7);
      S.vx = nx * sp + rv(-0.7, 0.7); S.vy = ny * sp + rv(0.2, 1.3); S.vz = nz * sp + rv(-0.7, 0.7);
      S.grav = -10; S.drag = 0.6; S.life = rv(0.35, 0.6);
      S.s0 = rv(0.025, 0.045); S.s1 = S.s0;
      S.spin = rv(-6, 6) * calm();
      const hex = pal[(rnd() * 4) | 0];
      c0(hex, 1, rv(0.9, 1.1)); c1(hex, 1, 0.9);
      sys.emit(S);
    }
  }

  /** Adım tozu (ayak altı). */
  function stepDust(arg, p) {
    const pal = paletteFrom(arg);
    const cnt = n(2);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SMOKE;
      from(p);
      S.x += rv(-0.15, 0.15); S.z += rv(-0.15, 0.15); S.y += 0.05;
      S.vx = rv(-0.4, 0.4); S.vy = rv(0.15, 0.5); S.vz = rv(-0.4, 0.4);
      S.drag = 2.5; S.life = rv(0.35, 0.6); S.s0 = 0.06; S.s1 = rv(0.2, 0.3);
      c0(pal[2], 0.3, 1); c1(0xb8b0a4, 0, 1);
      sys.emit(S);
    }
  }

  /* ---------------------------------------------------------------- savaş */

  /** Vuruş kıvılcımı: yönlü (dir verilirse koni) kıvılcımlar + kısa parlama. */
  function hitSpark(p, d, color = 0xffe9a0, count = 9) {
    const cnt = n(count);
    const hasDir = d !== null && d !== undefined;
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SPARK;
      from(p);
      const r = randDir();
      let vx = r.x; let vy = r.y; let vz = r.z;
      if (hasDir) { vx = px(d) * 1.4 + r.x * 0.7; vy = py(d) * 1.4 + r.y * 0.7; vz = pz(d) * 1.4 + r.z * 0.7; }
      const sp = rv(3, 7);
      S.vx = vx * sp; S.vy = vy * sp; S.vz = vz * sp;
      S.grav = -6; S.drag = 3; S.life = rv(0.18, 0.35); S.s0 = rv(0.03, 0.05); S.s1 = 0.012;
      c0(color, 1, 1.2); c1(color, 0, 0.8);
      sys.emit(S);
    }
    if (!sys.reduced) {
      S.reset();
      S.kind = KIND.GLOW; from(p); S.life = 0.14; S.s0 = 0.38; S.s1 = 0.1; c0(0xffffff, 0.75, 1); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** Eşya alma parıltısı: yıldız parıltıları yükselir. */
  function pickup(p, color = 0xfff3a0) {
    const cnt = n(7);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.STAR; from(p);
      S.x += rv(-0.15, 0.15); S.z += rv(-0.15, 0.15);
      S.vx = rv(-0.5, 0.5); S.vy = rv(0.8, 1.9); S.vz = rv(-0.5, 0.5);
      S.drag = 1.2; S.life = rv(0.5, 0.85); S.s0 = rv(0.07, 0.11); S.s1 = 0.02;
      S.tw = 9 * calm() + 0.01;
      c0(color, 1, 1.1); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
    S.reset();
    S.kind = KIND.GLOW; from(p); S.life = 0.3; S.s0 = 0.3; S.s1 = 0.05; c0(color, 0.6, 1); c1(color, 0, 1);
    sys.emit(S);
  }

  /** XP/deney küresi toplandı: yukarı sarmal yükselen zerreler. */
  function xpOrb(p, color = 0x7dff6a) {
    const cnt = n(8);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      S.mode = 4;
      S.vx = rv(0.18, 0.34); S.vy = rv(1.0, 1.8); S.vz = rv(0, TAU);
      S.endR = 0.02; S.swirl = (i % 2 ? 1 : -1) * rv(5, 8) * (sys.reduced ? 0.5 : 1);
      S.life = rv(0.5, 0.85); S.s0 = rv(0.05, 0.08); S.s1 = 0.02; S.tw = 8;
      c0(color, 1, 1.2); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  /** Uçan küre/eşya izi: her çağrıda 1 zerre. */
  function orbTrail(p, color = 0x7dff6a) {
    if (rnd() > sys.density) return;
    S.reset();
    S.kind = KIND.MOTE; from(p);
    S.x += rv(-0.05, 0.05); S.y += rv(-0.05, 0.05); S.z += rv(-0.05, 0.05);
    S.vx = rv(-0.2, 0.2); S.vy = rv(-0.1, 0.4); S.vz = rv(-0.2, 0.2);
    S.drag = 1.5; S.life = rv(0.3, 0.5); S.s0 = rv(0.04, 0.06); S.s1 = 0.01; S.tw = 9;
    c0(color, 0.9, 1.1); c1(color, 0, 1);
    sys.emit(S);
  }

  /* ---------------------------------------------------------------- büyü / bulmaca */

  /** Bulmaca çözüldü: halkalar + yükselen zerreler + yıldız patlaması (bulmaca renginde). */
  function magicBurst(p, color = 0xb08cff, o = {}) {
    const radius = (o.radius === undefined ? 2.2 : o.radius) * (o.scale || 1);
    const rings = [[0, 0, 0.18, radius, 0.85, 0.9], [0.12, 3, 0.12, radius * 0.7, 0.75, 0.7], [0.2, 0, 0.2, radius * 1.4, 1.25, 0.45]];
    for (let i = 0; i < rings.length; i++) {
      const R = rings[i];
      S.reset();
      S.kind = KIND.RING; from(p);
      if (R[1] === 0) S.y += 0.08;
      S.mode = R[1]; S.delay = R[0]; S.s0 = R[2]; S.s1 = R[3]; S.life = R[4];
      c0(color, R[5], 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
    if (!sys.reduced) {
      S.reset();
      S.kind = KIND.GLOW; from(p); S.y += 0.5; S.life = 0.3; S.s0 = radius * 0.7; S.s1 = radius * 0.2; c0(0xffffff, 0.5, 1); c1(color, 0, 1);
      sys.emit(S);
    }
    const motes = n(26);
    for (let i = 0; i < motes; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      const a = rnd() * TAU;
      const rr = Math.sqrt(rnd()) * radius * 0.65;
      S.x += Math.cos(a) * rr; S.z += Math.sin(a) * rr; S.y += rv(0, 0.3);
      S.vx = 0; S.vy = rv(0.8, 2.4); S.vz = 0;
      S.drag = 0.5; S.life = rv(1.0, 1.7); S.s0 = rv(0.05, 0.09); S.s1 = 0.02; S.turb = 0.15; S.tfreq = 2.5; S.tw = 6;
      S.delay = rv(0, 0.3);
      c0(color, 1, 1.25); c1(color, 0, 1);
      sys.emit(S);
    }
    const stars = n(9);
    for (let i = 0; i < stars; i++) {
      S.reset();
      S.kind = KIND.STAR; from(p); S.y += 0.4;
      const d = randDir();
      const sp = rv(2, 4.2);
      S.vx = d.x * sp; S.vy = Math.abs(d.y) * sp + 1; S.vz = d.z * sp;
      S.grav = -1.2; S.drag = 1.1; S.life = rv(0.7, 1.2); S.s0 = rv(0.08, 0.13); S.s1 = 0.03; S.tw = 8 * calm() + 0.01;
      c0(0xffffff, 1, 1); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** Portal çevrimi (tek seferlik): içe doğru sarmal zerreler. axis: 'y'|'x'|'z' (portalın normali). */
  function portalSwirl(p, color = 0x3a8fff, o = {}) {
    const radius = o.radius === undefined ? 1.0 : o.radius;
    const axis = o.axis === 'x' ? 1 : o.axis === 'z' ? 2 : 0;
    const cnt = n(o.count === undefined ? 34 : o.count);
    for (let i = 0; i < cnt; i++) portalSpawnOne(p, color, radius, axis, i);
    S.reset();
    S.kind = KIND.RING; from(p); S.mode = axis; S.s0 = radius * 0.4; S.s1 = radius * 1.25; S.life = 0.6;
    c0(color, 0.8, 1.3); c1(color, 0, 1);
    sys.emit(S);
  }
  function portalSpawnOne(p, color, radius, axis, i) {
    S.reset();
    S.kind = KIND.MOTE; from(p);
    S.mode = 4 + axis;
    S.vx = rv(0.35, 1.0) * radius; S.vy = rv(-0.15, 0.15); S.vz = rnd() * TAU;
    S.endR = rv(0, 0.12) * radius;
    S.swirl = (i % 2 ? 1 : 1) * rv(4, 7.5) * (sys.reduced ? 0.45 : 1);
    S.life = rv(0.9, 1.5); S.s0 = rv(0.045, 0.085); S.s1 = 0.015; S.tw = 7;
    c0(color, 1, 1.3); c1(0xffffff, 0, 1);
    sys.emit(S);
  }

  /* ---------------------------------------------------------------- sürekli yayıcılar (tick) */

  /** Meşale/fener: alev + duman + ara sıra kıvılcım. e: yayıcı durumu. */
  function torchTick(e, dt) {
    e.a += dt * 22 * sys.density;
    while (e.a >= 1) {
      e.a -= 1;
      S.reset();
      S.kind = KIND.GLOW; S.x = e.x + rv(-0.035, 0.035); S.y = e.y; S.z = e.z + rv(-0.035, 0.035);
      S.vx = rv(-0.06, 0.06); S.vy = rv(0.5, 0.95); S.vz = rv(-0.06, 0.06);
      S.drag = 0.8; S.life = rv(0.35, 0.6); S.s0 = rv(0.1, 0.14); S.s1 = 0.02; S.turb = 0.03; S.tfreq = 9;
      c0(0xffa63a, 0.85, 1.1); c1(0xff3a0a, 0, 1);
      sys.emit(S);
    }
    e.b += dt * 5 * sys.density;
    while (e.b >= 1) {
      e.b -= 1;
      S.reset();
      S.kind = KIND.SMOKE; S.x = e.x + rv(-0.04, 0.04); S.y = e.y + 0.18; S.z = e.z + rv(-0.04, 0.04);
      S.vx = rv(-0.08, 0.08); S.vy = rv(0.45, 0.85); S.vz = rv(-0.08, 0.08);
      S.drag = 0.5; S.life = rv(1.2, 1.9); S.s0 = 0.07; S.s1 = rv(0.28, 0.4); S.turb = 0.12; S.tfreq = 1.5; S.spin = rv(-0.4, 0.4) * calm();
      c0(0x5a5650, 0.2, 1); c1(0x3a3834, 0, 1);
      sys.emit(S);
    }
    e.c += dt * 1.8 * sys.density;
    while (e.c >= 1) {
      e.c -= 1;
      S.reset();
      S.kind = KIND.SPARK; S.x = e.x; S.y = e.y + 0.05; S.z = e.z;
      S.vx = rv(-0.7, 0.7); S.vy = rv(1.2, 2.4); S.vz = rv(-0.7, 0.7);
      S.grav = -2.5; S.drag = 0.6; S.life = rv(0.5, 0.9); S.s0 = 0.022; S.s1 = 0.008;
      c0(0xffc060, 1, 1.2); c1(0xff5a1a, 0, 1);
      sys.emit(S);
    }
  }

  /** Lav yüzeyi: parlayan kor zerreleri. */
  function lavaTick(e, dt) {
    e.a += dt * 4.5 * sys.density;
    while (e.a >= 1) {
      e.a -= 1;
      S.reset();
      S.kind = KIND.MOTE; S.x = e.x + rv(-0.45, 0.45); S.y = e.y + 0.05; S.z = e.z + rv(-0.45, 0.45);
      S.vx = rv(-0.15, 0.15); S.vy = rv(0.7, 1.7); S.vz = rv(-0.15, 0.15);
      S.grav = 0.2; S.drag = 0.3; S.life = rv(1.0, 2.2); S.s0 = rv(0.035, 0.07); S.s1 = 0.012; S.turb = 0.25; S.tfreq = 3; S.tw = 5;
      c0(0xff8a2a, 1, 1.3); c1(0xff2a0a, 0, 1);
      sys.emit(S);
    }
  }

  /** Portal yayıcısı: sürekli içe sarmal. */
  function portalTick(e, dt) {
    e.a += dt * 30 * sys.density;
    while (e.a >= 1) {
      e.a -= 1;
      portalSpawnOne({ x: e.x, y: e.y, z: e.z }, e.color, e.radius, e.axis, (rnd() * 8) | 0);
    }
  }

  /* ---------------------------------------------------------------- boss / ölüm */

  /** Boss şok dalgası: genişleyen halkalar, toz halkası, kırıntı, kıvılcım. */
  function bossShockwave(p, o = {}) {
    const radius = o.radius === undefined ? 8 : o.radius;
    const color = o.color === undefined ? 0xffb060 : o.color;
    for (let i = 0; i < 2; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.y += 0.1; S.mode = 0; S.delay = i * 0.12;
      S.s0 = 0.5; S.s1 = radius * (i ? 0.75 : 1); S.life = i ? 0.85 : 0.7;
      c0(color, i ? 0.55 : 0.9, 1.4); c1(color, 0, 1);
      sys.emit(S);
    }
    const dust = n(30);
    for (let i = 0; i < dust; i++) {
      S.reset();
      S.kind = KIND.SMOKE; from(p);
      const a = (i / dust) * TAU + rnd() * 0.2;
      const sp = (radius / 0.8) * rv(0.55, 0.9);
      S.x += Math.cos(a) * 0.6; S.z += Math.sin(a) * 0.6; S.y += 0.15;
      S.vx = Math.cos(a) * sp; S.vy = rv(0.3, 1.1); S.vz = Math.sin(a) * sp;
      S.drag = 2.4; S.life = rv(0.8, 1.3); S.s0 = rv(0.25, 0.4); S.s1 = rv(0.8, 1.2); S.spin = rv(-1, 1) * calm();
      c0(0xb0a090, 0.5, 1); c1(0x80786c, 0, 1);
      sys.emit(S);
    }
    const chips = n(16);
    for (let i = 0; i < chips; i++) {
      S.reset();
      S.kind = KIND.CHIP; from(p);
      const a = rnd() * TAU;
      const sp = rv(2, radius * 0.6);
      S.vx = Math.cos(a) * sp; S.vy = rv(3, 7); S.vz = Math.sin(a) * sp;
      S.grav = -16; S.drag = 0.3; S.life = rv(0.7, 1.2); S.s0 = rv(0.05, 0.1); S.s1 = S.s0; S.spin = rv(-7, 7) * calm();
      c0(0x8a8478, 1, rv(0.8, 1.1)); c1(0x6a6458, 1, 1);
      sys.emit(S);
    }
    const sparks = n(12);
    for (let i = 0; i < sparks; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p); S.y += 0.2;
      const a = rnd() * TAU;
      const sp = rv(3, 8);
      S.vx = Math.cos(a) * sp; S.vy = rv(2, 6); S.vz = Math.sin(a) * sp;
      S.grav = -9; S.drag = 1.2; S.life = rv(0.3, 0.6); S.s0 = 0.045; S.s1 = 0.012;
      c0(color, 1, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** Yaratık/boss çözülürken: yukarı süzülen ışıltılı zerreler (kan yok). scale: yaratık boyu. */
  function deathMotes(p, color = 0xc8b0ff, scale = 1) {
    const cnt = n(Math.min(90, 28 + 18 * scale));
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      S.x += rv(-0.35, 0.35) * scale; S.y += rv(-0.5, 0.5) * scale; S.z += rv(-0.35, 0.35) * scale;
      S.vx = rv(-0.3, 0.3); S.vy = rv(0.6, 1.8); S.vz = rv(-0.3, 0.3);
      S.drag = 0.5; S.life = rv(0.8, 1.6); S.s0 = rv(0.05, 0.09) * Math.sqrt(scale); S.s1 = 0.015; S.turb = 0.2; S.tfreq = 3; S.tw = 7;
      c0(color, 1, 1.3); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
    const puffs = n(6);
    for (let i = 0; i < puffs; i++) {
      S.reset();
      S.kind = KIND.GLOW; from(p);
      S.x += rv(-0.25, 0.25) * scale; S.y += rv(-0.4, 0.4) * scale; S.z += rv(-0.25, 0.25) * scale;
      S.vy = rv(0.2, 0.7); S.drag = 1; S.life = rv(0.45, 0.8); S.s0 = rv(0.25, 0.42) * Math.sqrt(scale); S.s1 = 0.05;
      c0(color, 0.5, 1); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** Ok izi: çağrı başına 1 duman zerresi + solgun ışık. */
  function arrowTrail(p, color = 0xe8e0d0) {
    if (rnd() > sys.density) return;
    S.reset();
    S.kind = KIND.SMOKE; from(p); S.drag = 2; S.life = 0.4; S.s0 = 0.04; S.s1 = rv(0.1, 0.16);
    S.vx = rv(-0.1, 0.1); S.vy = rv(-0.05, 0.15); S.vz = rv(-0.1, 0.1);
    c0(color, 0.2, 1); c1(color, 0, 1);
    sys.emit(S);
    S.reset();
    S.kind = KIND.MOTE; from(p); S.drag = 2; S.life = 0.25; S.s0 = 0.04; S.s1 = 0.01; S.tw = 8;
    c0(0xfff2c0, 0.8, 1.2); c1(0xffffff, 0, 1);
    sys.emit(S);
  }

  /** Enerji ışını isabeti: parlama, halka (yüzey yönünde), kıvılcımlar. n: yüzey normali. */
  function beamImpact(p, normal, color = 0x9affff) {
    const nx = normal ? px(normal) : 0;
    const ny = normal ? py(normal) : 1;
    const nz = normal ? pz(normal) : 0;
    S.reset();
    S.kind = KIND.GLOW; from(p); S.x += nx * 0.05; S.y += ny * 0.05; S.z += nz * 0.05;
    S.life = sys.reduced ? 0.3 : 0.18; S.s0 = 0.6; S.s1 = 0.15; c0(0xffffff, sys.reduced ? 0.45 : 0.8, 1); c1(color, 0, 1);
    sys.emit(S);
    S.reset();
    S.kind = KIND.RING; from(p); S.x += nx * 0.04; S.y += ny * 0.04; S.z += nz * 0.04;
    S.mode = orientFromNormal(nx, ny, nz); S.s0 = 0.08; S.s1 = 0.85; S.life = 0.35; c0(color, 0.9, 1.4); c1(color, 0, 1);
    sys.emit(S);
    const cnt = n(10);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p);
      const d = randDir();
      const dd = d.x * nx + d.y * ny + d.z * nz;
      const sx = d.x - (dd < 0 ? 2 * dd * nx : 0);
      const sy = d.y - (dd < 0 ? 2 * dd * ny : 0);
      const sz = d.z - (dd < 0 ? 2 * dd * nz : 0);
      const sp = rv(3, 6);
      S.vx = sx * sp + nx * 1.5; S.vy = sy * sp + ny * 1.5; S.vz = sz * sp + nz * 1.5;
      S.grav = -8; S.drag = 1.8; S.life = rv(0.25, 0.4); S.s0 = 0.035; S.s1 = 0.01;
      c0(color, 1, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** Işın hattı boyunca zerreler (ateş ederken her karede çağrılabilir). a→b. */
  function beamTrail(a, b, color = 0x9affff) {
    const ax = px(a); const ay = py(a); const az = pz(a);
    const dx = px(b) - ax; const dy = py(b) - ay; const dz = pz(b) - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const cnt = Math.min(24, n(len / 1.2));
    for (let i = 0; i < cnt; i++) {
      const t = rnd();
      S.reset();
      S.kind = KIND.MOTE; S.x = ax + dx * t; S.y = ay + dy * t; S.z = az + dz * t;
      S.vx = rv(-0.2, 0.2); S.vy = rv(-0.2, 0.2); S.vz = rv(-0.2, 0.2);
      S.drag = 2; S.life = rv(0.15, 0.3); S.s0 = rv(0.035, 0.06); S.s1 = 0.01; S.tw = 8;
      c0(color, 0.9, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
  }

  /** İyileşme kalpleri: sallanarak yükselir. */
  function healHearts(p, count = 5) {
    const cnt = Math.max(1, n(count));
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.HEART; from(p);
      S.x += rv(-0.35, 0.35); S.y += rv(0, 0.5); S.z += rv(-0.35, 0.35);
      S.vx = 0; S.vy = rv(0.8, 1.3); S.vz = 0;
      S.drag = 0.6; S.life = rv(1.1, 1.6); S.s0 = 0.03; S.s1 = rv(0.17, 0.23); S.turb = 0.12; S.tfreq = 3; S.delay = rv(0, 0.4);
      c0(0xff5a7a, 1, 1.1); c1(0xff2a55, 0, 1);
      sys.emit(S);
    }
  }

  /** Seviye atlama / başarım: yukarı fışkıran yıldız ve zerre çeşmesi + halkalar. */
  function levelUp(p, color = 0xffd24a, o = {}) {
    const multi = !!o.multi;
    const cnt = n(38);
    const cols = multi ? [0xff6a9a, 0x6affb0, 0x6ab0ff, 0xffd24a, 0xffffff] : [color, 0xffffff, 0xfff0b0];
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = i % 3 === 0 ? KIND.STAR : KIND.MOTE; from(p); S.y += 0.2;
      const a = rnd() * TAU;
      const sp = rv(0.2, 1.3);
      S.vx = Math.cos(a) * sp; S.vy = rv(5, 8.5); S.vz = Math.sin(a) * sp;
      S.grav = -9.5; S.drag = 0.3; S.life = rv(1.0, 1.7); S.s0 = rv(0.06, 0.12); S.s1 = 0.02;
      S.tw = 8 * calm() + 0.01; S.delay = rv(0, 0.35);
      const hex = cols[(rnd() * cols.length) | 0];
      c0(hex, 1, 1.25); c1(hex, 0, 1);
      sys.emit(S);
    }
    for (let i = 0; i < 2; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.y += 0.1 + i * 0.5; S.mode = 0; S.delay = i * 0.18; S.s0 = 0.2; S.s1 = 2.4 - i * 0.6; S.life = 0.9;
      c0(color, 0.8, 1.3); c1(color, 0, 1);
      sys.emit(S);
    }
    if (!sys.reduced) {
      for (let i = 0; i < 4; i++) {
        S.reset();
        S.kind = KIND.GLOW; from(p); S.y += 0.4 + i * 0.5; S.life = 0.5; S.s0 = 0.9; S.s1 = 0.2; S.delay = i * 0.08;
        c0(color, 0.35, 1); c1(color, 0, 1);
        sys.emit(S);
      }
    }
  }

  /* ---------------------------------------------------------------- ortam */

  /** Ortam zerresi: kind ∈ AMBIENT_KINDS; (x,y,z) doğma noktası. */
  function ambientSpawn(kind, x, y, z) {
    S.reset();
    S.x = x; S.y = y; S.z = z;
    switch (kind) {
      case 'fireflies':
        S.kind = KIND.MOTE; S.vx = rv(-0.15, 0.15); S.vy = rv(-0.05, 0.12); S.vz = rv(-0.15, 0.15);
        S.drag = 0.4; S.life = rv(7, 10); S.s0 = rv(0.04, 0.06); S.s1 = S.s0; S.turb = 0.6; S.tfreq = 0.8; S.tw = sys.reduced ? 0 : 3.4;
        c0(0xd8ff4a, 1, 1.4); c1(0xb8ff30, 1, 1.2);
        break;
      case 'pollen':
        S.kind = KIND.MOTE; S.vx = rv(0.05, 0.3); S.vy = rv(0, 0.1); S.vz = rv(-0.1, 0.15);
        S.drag = 0.3; S.life = rv(6, 9); S.s0 = rv(0.025, 0.04); S.s1 = S.s0; S.turb = 0.4; S.tfreq = 1.1; S.tw = 4;
        c0(0xfff0a0, 0.8, 1); c1(0xfff0a0, 0.8, 1);
        break;
      case 'dust':
        S.kind = KIND.GLOW; S.vx = rv(-0.06, 0.06); S.vy = rv(-0.03, 0.05); S.vz = rv(-0.06, 0.06);
        S.drag = 0.3; S.life = rv(6, 9); S.s0 = rv(0.03, 0.05); S.s1 = S.s0; S.turb = 0.3; S.tfreq = 0.7;
        c0(0xe8e0d0, 0.28, 1); c1(0xe8e0d0, 0.28, 1);
        break;
      case 'snow':
        S.kind = KIND.STAR; S.vx = rv(-0.04, 0.04); S.vy = rv(-0.05, 0.02); S.vz = rv(-0.04, 0.04);
        S.drag = 0.3; S.life = rv(1.2, 2.2); S.s0 = rv(0.03, 0.055); S.s1 = S.s0; S.tw = sys.reduced ? 0 : 7;
        c0(0xdff4ff, 0.9, 1.3); c1(0xffffff, 0.9, 1.2);
        break;
      case 'embers':
        S.kind = KIND.MOTE; S.vx = rv(-0.2, 0.2); S.vy = rv(0.4, 1.0); S.vz = rv(-0.2, 0.2);
        S.drag = 0.25; S.life = rv(3, 5); S.s0 = rv(0.03, 0.055); S.s1 = 0.012; S.turb = 0.4; S.tfreq = 1.6; S.tw = sys.reduced ? 0 : 3;
        c0(0xff8a2a, 1, 1.3); c1(0xff3a0a, 0, 1);
        break;
      case 'leaves': {
        // sonbahar yaprağı: turuncu / kırmızı / sarı; yavaş düşer, savrulur, döner
        S.kind = KIND.CHIP; S.vx = rv(0.1, 0.5); S.vy = rv(-0.2, 0.0); S.vz = rv(-0.2, 0.2);
        S.grav = -1.7; S.drag = 2.0; S.life = rv(7, 10); S.s0 = rv(0.055, 0.085); S.s1 = S.s0;
        S.turb = 0.7; S.tfreq = 1.3; S.spin = sys.reduced ? 0 : rv(-2.5, 2.5);
        const lc = LEAF_COLORS[(rnd() * 3) | 0];
        c0(lc, 0.95, rv(0.85, 1.1)); c1(lc, 0.9, rv(0.7, 0.9));
        break;
      }
      case 'petals': {
        S.kind = KIND.CHIP; S.vx = rv(0.15, 0.6); S.vy = rv(-0.1, 0.1); S.vz = rv(-0.2, 0.2);
        S.grav = -1.3; S.drag = 2.3; S.life = rv(8, 11); S.s0 = rv(0.045, 0.07); S.s1 = S.s0;
        S.turb = 0.8; S.tfreq = 1.1; S.spin = sys.reduced ? 0 : rv(-2, 2);
        const pc = PETAL_COLORS[(rnd() * 3) | 0];
        c0(pc, 0.95, 1.05); c1(pc, 0.9, 0.9);
        break;
      }
      case 'ash': {
        S.kind = KIND.CHIP; S.vx = rv(-0.25, 0.35); S.vy = rv(-0.1, 0.1); S.vz = rv(-0.25, 0.25);
        S.grav = -0.9; S.drag = 1.9; S.life = rv(7, 10); S.s0 = rv(0.03, 0.052); S.s1 = S.s0 * 0.8;
        S.turb = 0.55; S.tfreq = 1.6; S.spin = sys.reduced ? 0 : rv(-3, 3);
        const ac = ASH_COLORS[(rnd() * 3) | 0];
        c0(ac, 0.9, 1); c1(ac, 0.8, 0.8);
        break;
      }
      default: // spores
        S.kind = KIND.MOTE; S.vx = rv(-0.1, 0.1); S.vy = rv(0.05, 0.3); S.vz = rv(-0.1, 0.1);
        S.drag = 0.3; S.life = rv(6, 8); S.s0 = rv(0.035, 0.06); S.s1 = S.s0; S.turb = 0.5; S.tfreq = 0.9; S.tw = sys.reduced ? 0 : 3;
        c0(0x7affd8, 0.9, 1.3); c1(0xb08cff, 0.9, 1.2);
    }
    sys.emit(S);
  }

  return {
    blockBreak,
    blockDust,
    stepDust,
    hitSpark,
    pickup,
    xpOrb,
    orbTrail,
    magicBurst,
    portalSwirl,
    torchTick,
    lavaTick,
    portalTick,
    bossShockwave,
    deathMotes,
    arrowTrail,
    beamImpact,
    beamTrail,
    healHearts,
    levelUp,
    ambientSpawn,
    ambientRates: AMBIENT_RATES,
  };
}
