/*
 * KEŞİF ses — prosedürel ses tarifleri (dosya yok; osilatör + gürültü + süzgeç).
 *
 * Her tarif `fn(s)`: `s` makeSynth çıktısıdır (tone/noise). Tarifler yalnızca düğüm kurar ve zamanlar;
 * ses seviyesi, uzamsal konum, ses sınırlayıcı ve yankı gönderimi audio.js'te.
 *
 * Çeşitleme: audio.js her çağrıya pitch/ses sapması ekler (adım sesleri, kazma vuruşları farklı duyulur).
 * Düğüm bütçesi: tek sesin kaynak sayısı `maxNodes` ile sınırlıdır (mobil güvenli).
 */
import { MATERIALS, foldKey, mobSoundFor, normMaterial } from './audioMix.js';
import { MAGIC_SOUNDS } from './audioRecipesMagic.js';
import { TREE_SOUNDS } from './audioRecipesTree.js';
import { TECH_SOUNDS } from './audioRecipesTech.js';
import { DIM_SOUNDS } from './audioRecipesDim.js';
import { PROP_SOUNDS } from './audioRecipesProps.js';

const TWO_PI = Math.PI * 2;
const MIN_GAIN = 0.0002;

/* ------------------------------------------------------------------------------------------------
 * Sentez yardımcısı
 * ---------------------------------------------------------------------------------------------- */

export function makeSynth(ctx, out, bufs, { t0, pitch = 1, rand = Math.random, maxNodes = 14 } = {}) {
  let nodes = 0;
  let endAt = t0;

  const s = {
    t0,
    pitch,
    rand,
    get endAt() {
      return endAt;
    },
    get nodes() {
      return nodes;
    },
    /** Aralıktan rastgele değer. */
    rr(a, b) {
      return a + (b - a) * rand();
    },
    /**
     * Osilatör: f0→f1 (üstel), `delay` sn sonra başlar, `dur` sn sürer. extra: { detune, filter:[tip,f,q], vib:{hz,cents} }.
     * Bütçe aşılırsa false.
     */
    tone(type, f0, f1, delay, dur, vol, attack = 0.006, extra) {
      if (nodes >= maxNodes || !(dur > 0) || !(f0 > 0)) return false;
      nodes++;
      const t = t0 + delay;
      const atk = Math.min(attack, dur * 0.5);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0 * pitch, t);
      if (f1 > 0 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dur);
      if (extra && extra.detune) o.detune.value = extra.detune;
      if (extra && extra.vib && o.detune.setValueCurveAtTime) {
        const n = 24;
        const curve = new Float32Array(n);
        const base = extra.detune || 0;
        for (let i = 0; i < n; i++) curve[i] = base + extra.vib.cents * Math.sin((TWO_PI * extra.vib.hz * (i / (n - 1)) * dur));
        o.detune.setValueCurveAtTime(curve, t, dur);
      }
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, vol), t + atk);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
      if (extra && extra.filter) {
        const f = ctx.createBiquadFilter();
        f.type = extra.filter[0];
        f.frequency.value = extra.filter[1] * pitch;
        f.Q.value = extra.filter[2] || 1;
        o.connect(f);
        f.connect(g);
      } else {
        o.connect(g);
      }
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.03);
      if (t + dur + 0.03 > endAt) endAt = t + dur + 0.03;
      return true;
    },
    /** Süzgeçli gürültü atışı. src: 'white' | 'brown'. */
    noise(delay, dur, vol, ftype, f0, f1, q = 1, attack = 0.004, src = 'white') {
      const buf = bufs && (bufs[src] || bufs.white);
      if (nodes >= maxNodes || !buf || !(dur > 0)) return false;
      nodes++;
      const t = t0 + delay;
      const atk = Math.min(attack, dur * 0.5);
      const n = ctx.createBufferSource();
      n.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = ftype;
      f.frequency.setValueAtTime(Math.max(20, f0 * pitch), t);
      if (f1 > 0 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * pitch), t + dur);
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(MIN_GAIN, t);
      g.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, vol), t + atk);
      g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);
      n.connect(f);
      f.connect(g);
      g.connect(out);
      n.start(t, rand() * 0.5);
      n.stop(t + dur + 0.03);
      if (t + dur + 0.03 > endAt) endAt = t + dur + 0.03;
      return true;
    },
    /**
     * Sürekli YATAK parçası (düz plato; doğrusal giriş/çıkış — üstel rampa değil): şehir ambiyansı gibi uzun, kesintisiz katmanlar için.
     * spec: {src:'noise'|'osc', type ('osc' dalga | 'noise' 'white'|'brown'), f0, f1, vol, dur, fadeIn, fadeOut, delay, filter:[tip,f,q]}.
     * noise: filter yoksa ham gürültü; filter frekansı f0→f1 doğrusal süpürülür. osc: frekans f0→f1. Bütçe aşılırsa/geçersizse false.
     */
    sustain(spec) {
      const sp = spec || {};
      const dur = sp.dur;
      if (nodes >= maxNodes || !(dur > 0)) return false;
      const isNoise = sp.src === 'noise';
      const buf = isNoise ? bufs && (bufs[sp.type] || bufs.white) : null;
      if (isNoise && !buf) return false;
      if (!isNoise && !(sp.f0 > 0)) return false;
      nodes++;
      const t = t0 + (sp.delay || 0);
      const vol = Math.max(0, sp.vol === undefined ? 0.1 : sp.vol);
      const fi = Math.min(Math.max(0, sp.fadeIn === undefined ? 0.5 : sp.fadeIn), dur * 0.5);
      const fo = Math.min(Math.max(0, sp.fadeOut === undefined ? 0.5 : sp.fadeOut), dur * 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + fi);
      g.gain.setValueAtTime(vol, t + dur - fo);
      g.gain.linearRampToValueAtTime(0, t + dur);
      let src;
      if (isNoise) {
        src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        let tail = src;
        if (sp.filter) {
          const f = ctx.createBiquadFilter();
          f.type = sp.filter[0];
          const fa = Math.max(20, (sp.f0 > 0 ? sp.f0 : sp.filter[1]) * pitch);
          const fb = Math.max(20, (sp.f1 > 0 ? sp.f1 : sp.f0 > 0 ? sp.f0 : sp.filter[1]) * pitch);
          f.frequency.setValueAtTime(fa, t);
          if (fb !== fa) f.frequency.linearRampToValueAtTime(fb, t + dur);
          f.Q.value = sp.filter[2] || 1;
          src.connect(f);
          tail = f;
        }
        tail.connect(g);
        g.connect(out);
        src.start(t, rand() * 0.5);
      } else {
        src = ctx.createOscillator();
        src.type = sp.type || 'sine';
        src.frequency.setValueAtTime(sp.f0 * pitch, t);
        if (sp.f1 > 0 && sp.f1 !== sp.f0) src.frequency.linearRampToValueAtTime(sp.f1 * pitch, t + dur);
        if (sp.detune) src.detune.value = sp.detune;
        if (sp.filter) {
          const f = ctx.createBiquadFilter();
          f.type = sp.filter[0];
          f.frequency.value = sp.filter[1] * pitch;
          f.Q.value = sp.filter[2] || 1;
          src.connect(f);
          f.connect(g);
        } else {
          src.connect(g);
        }
        g.connect(out);
        src.start(t);
      }
      src.stop(t + dur + 0.03);
      if (t + dur + 0.03 > endAt) endAt = t + dur + 0.03;
      return true;
    },
  };
  return s;
}

/* ------------------------------------------------------------------------------------------------
 * Malzeme sesleri: adım, kazma vuruşu, kırılma, yerleştirme, iniş
 * ---------------------------------------------------------------------------------------------- */

// n: [süzgeç, f0, f1, Q, süre, ses]; th: [dalga, f0, f1, süre, ses]; ring: [taban Hz, oranlar, süre, ses]
const MAT = {
  taş: { n: ['bandpass', 2600, 800, 1.2, 0.07, 0.55], th: ['sine', 150, 65, 0.11, 0.6], grains: 1 },
  toprak: { n: ['lowpass', 1300, 330, 0.7, 0.1, 0.6], th: ['sine', 105, 50, 0.13, 0.65], grains: 0 },
  kum: { n: ['bandpass', 3800, 1800, 0.5, 0.15, 0.5], th: null, grains: 2 },
  ahşap: { n: ['bandpass', 1300, 650, 3, 0.05, 0.35], th: ['triangle', 270, 160, 0.1, 0.55], knock: true, grains: 0 },
  çim: { n: ['lowpass', 3400, 1300, 0.5, 0.08, 0.32], th: ['sine', 90, 55, 0.08, 0.28], grains: 1 },
  kar: { n: ['bandpass', 5400, 2800, 0.8, 0.06, 0.45], th: null, grains: 3 },
  su: { n: ['bandpass', 500, 1600, 2.2, 0.16, 0.45], th: null, bubble: true, grains: 1 },
  metal: { n: ['highpass', 3200, 3200, 0.7, 0.03, 0.3], th: ['triangle', 300, 180, 0.05, 0.2], ring: [520, [1, 2.76, 5.4], 0.3, 0.22], grains: 0 },
  yaprak: { n: ['bandpass', 6200, 3400, 0.7, 0.1, 0.38], th: null, grains: 3 },
  cam: { n: ['highpass', 5000, 5000, 0.7, 0.03, 0.25], th: null, ring: [2300, [1, 1.5, 2.2], 0.2, 0.16], grains: 1 },
};

// v: ses çarpanı, d: süre çarpanı, th: gövde vuruşu çarpanı, g: ek parçacık sayısı, p: gövde perdesi
const KIND = {
  step: { v: 0.45, d: 0.9, th: 0.7, g: 0, p: 1 },
  dig: { v: 0.5, d: 0.6, th: 0.5, g: 0, p: 1.1 },
  break: { v: 1, d: 1.7, th: 1, g: 4, p: 0.9 },
  place: { v: 0.75, d: 1, th: 1.1, g: 0, p: 1.05 },
  land: { v: 0.9, d: 1.4, th: 1.2, g: 1, p: 0.75 },
};

export function materialSound(s, matName, kindName) {
  const m = MAT[matName] || MAT.taş;
  const k = KIND[kindName] || KIND.step;
  const [nt, nf0, nf1, nq, nd, nv] = m.n;
  const jit = s.rr(0.92, 1.08);
  s.noise(0, nd * k.d, nv * k.v, nt, nf0 * jit, nf1 * jit, nq);
  if (m.th) {
    const [tt, tf0, tf1, td, tv] = m.th;
    s.tone(tt, tf0 * k.p * jit, tf1 * k.p, 0, td * k.d, tv * k.th * k.v, 0.004);
  }
  if (m.ring) {
    const [base, ratios, rd, rv] = m.ring;
    for (let i = 0; i < ratios.length; i++) {
      const f = base * ratios[i] * s.rr(0.98, 1.02);
      s.tone('sine', f, f, i * 0.002, rd * k.d * (1 - i * 0.2), (rv * k.v) / (1 + i), 0.002);
    }
  }
  if (m.knock) s.tone('triangle', 420 * jit, 280, 0.005, 0.07 * k.d, 0.18 * k.v, 0.002);
  if (m.bubble) {
    s.tone('sine', 320 * jit, 760, 0.03, 0.07, 0.14 * k.v, 0.004);
    if (kindName === 'break' || kindName === 'land') s.tone('sine', 280 * jit, 640, 0.11, 0.09, 0.12 * k.v, 0.004);
  }
  const grains = m.grains + k.g;
  let at = 0.015;
  for (let i = 0; i < grains; i++) {
    at += s.rr(0.025, 0.06);
    s.noise(at, s.rr(0.035, 0.07), nv * k.v * 0.45, nt === 'lowpass' ? 'bandpass' : nt, nf0 * s.rr(0.6, 1.3), nf1 * s.rr(0.7, 1.2), nq);
  }
}

/* ------------------------------------------------------------------------------------------------
 * Yaratıklar
 * ---------------------------------------------------------------------------------------------- */

// p: perde, d: süre, v: ses, glide: sonda perde çarpanı
const MOB_MODE = {
  idle: { p: 1, d: 1, v: 0.7, glide: 1 },
  hurt: { p: 1.3, d: 0.55, v: 1, glide: 1.1 },
  die: { p: 0.88, d: 1.7, v: 1, glide: 0.5 },
  attack: { p: 1.1, d: 0.8, v: 1.15, glide: 0.9 },
};

export const MOB_MODES = Object.freeze(Object.keys(MOB_MODE));

const FAMILY = {
  growl(s, m) {
    const dur = 0.7 * m.d;
    const f = { filter: ['bandpass', 320, 2], vib: { hz: 14, cents: 55 } };
    s.tone('sawtooth', 95 * m.p, 62 * m.p * m.glide, 0, dur, 0.22 * m.v, 0.04, f);
    s.tone('sawtooth', 97 * m.p, 60 * m.p * m.glide, 0, dur, 0.16 * m.v, 0.05, { ...f, detune: 14 });
    s.noise(0.02, dur * 0.8, 0.12 * m.v, 'bandpass', 420, 260, 1.4, 0.05);
  },
  rattle(s, m) {
    const n = m === MOB_MODE.hurt ? 3 : m === MOB_MODE.die ? 7 : 5;
    let t = 0;
    for (let i = 0; i < n; i++) {
      s.noise(t, 0.035, 0.34 * m.v, 'bandpass', s.rr(1600, 2300) * m.p, 1100, 3, 0.002);
      s.tone('triangle', s.rr(650, 1100) * m.p, 400, t, 0.03, 0.12 * m.v, 0.002);
      t += s.rr(0.05, 0.09) * (m.glide < 1 ? 1.4 : 1);
    }
  },
  skitter(s, m, info) {
    const n = m === MOB_MODE.idle ? 6 : 8;
    let t = 0;
    for (let i = 0; i < n; i++) {
      s.noise(t, 0.018, 0.22 * m.v, 'bandpass', s.rr(4000, 5400) * m.p, 3000, 2, 0.001);
      t += s.rr(0.02, 0.055);
    }
    if (info && info.crystal) {
      s.tone('sine', 2400 * m.p, 2380 * m.p, 0.02, 0.35 * m.d, 0.05 * m.v, 0.002);
      s.tone('sine', 3100 * m.p, 3080 * m.p, 0.05, 0.28 * m.d, 0.035 * m.v, 0.002);
    }
  },
  hiss(s, m, info) {
    s.noise(0, 0.8 * m.d, 0.3 * m.v, 'highpass', 4200 * m.p, 2600, 0.7, 0.05);
    if (info && info.icy) s.tone('sine', 3400 * m.p, 3000 * m.p, 0.05, 0.5 * m.d, 0.04 * m.v, 0.05);
    s.tone('sawtooth', 180 * m.p, 150 * m.p, 0, 0.5 * m.d, 0.05 * m.v, 0.05, { filter: ['lowpass', 500, 1] });
  },
  gloop(s, m) {
    s.tone('sine', 140 * m.p, 360 * m.p, 0, 0.12 * m.d, 0.3 * m.v, 0.01);
    s.tone('sine', 200 * m.p, 520 * m.p, 0.13 * m.d, 0.1 * m.d, 0.25 * m.v, 0.01);
    s.noise(0, 0.2 * m.d, 0.15 * m.v, 'lowpass', 500, 250, 0.8, 0.01);
  },
  flutter(s, m) {
    s.tone('sine', 3200 * m.p, 5200 * m.p, 0, 0.06, 0.12 * m.v, 0.004);
    s.tone('sine', 3400 * m.p, 5400 * m.p, 0.09, 0.06, 0.1 * m.v, 0.004);
    s.tone('sine', 4100 * m.p, 2800 * m.p, 0.2 * m.d, 0.05, 0.08 * m.v, 0.004);
    s.noise(0, 0.15 * m.d, 0.1 * m.v, 'bandpass', 3000, 1800, 1, 0.01);
  },
  cluck(s, m) {
    const n = m === MOB_MODE.hurt ? 4 : 3;
    for (let i = 0; i < n; i++) s.tone('triangle', s.rr(500, 560) * m.p, 780 * m.p, i * 0.09, 0.05, 0.16 * m.v, 0.004, { filter: ['bandpass', 900, 2] });
  },
  baa(s, m) {
    const f = { filter: ['bandpass', 900, 3], vib: { hz: 10, cents: 40 } };
    s.tone('sawtooth', 330 * m.p, 290 * m.p * m.glide, 0, 0.6 * m.d, 0.12 * m.v, 0.04, f);
    s.tone('sawtooth', 334 * m.p, 288 * m.p * m.glide, 0, 0.6 * m.d, 0.08 * m.v, 0.04, { ...f, detune: 12 });
  },
  meow(s, m) {
    const f = { filter: ['bandpass', 1400, 2] };
    s.tone('sine', 560 * m.p, 860 * m.p, 0, 0.2 * m.d, 0.15 * m.v, 0.03, f);
    s.tone('sine', 860 * m.p, 540 * m.p * m.glide, 0.2 * m.d, 0.3 * m.d, 0.13 * m.v, 0.02, f);
  },
  snort(s, m) {
    s.noise(0, 0.12 * m.d, 0.25 * m.v, 'bandpass', 700 * m.p, 500, 1.5, 0.01);
    s.noise(0.02, 0.1 * m.d, 0.12 * m.v, 'highpass', 1800, 1800, 0.7, 0.01);
  },
  blub(s, m) {
    s.tone('sine', 400 * m.p, 800 * m.p, 0, 0.06, 0.15 * m.v, 0.004);
  },
  roar(s, m, info) {
    const boss = info && info.boss;
    const d = m.d;
    if (boss === 'kokana') {
      s.tone('sawtooth', 70 * m.p, 45 * m.p * m.glide, 0, 1.0 * d, 0.3 * m.v, 0.08, { filter: ['lowpass', 500, 1], vib: { hz: 9, cents: 50 } });
      s.noise(0, 0.9 * d, 0.2 * m.v, 'bandpass', 600, 1400, 1, 0.1);
      for (let i = 0; i < 3; i++) s.noise(0.15 + i * 0.2, 0.08, 0.1 * m.v, 'bandpass', 5000, 3000, 0.7, 0.01);
    } else if (boss === 'tasbekci') {
      s.noise(0, 1.1 * d, 0.5 * m.v, 'lowpass', 170, 120, 1, 0.1, 'brown');
      s.noise(0, 1.0 * d, 0.25 * m.v, 'bandpass', 320, 200, 2, 0.12);
      s.tone('sine', 55 * m.p, 40 * m.p * m.glide, 0, 1.1 * d, 0.5 * m.v, 0.05);
    } else if (boss === 'buzkral') {
      s.tone('sawtooth', 150 * m.p, 90 * m.p * m.glide, 0, 1.0 * d, 0.22 * m.v, 0.06, { filter: ['lowpass', 900, 1], vib: { hz: 7, cents: 40 } });
      s.tone('sine', 2200 * m.p, 3300 * m.p, 0.05, 0.8 * d, 0.04 * m.v, 0.1);
      s.tone('sine', 2900 * m.p, 2500 * m.p, 0.1, 0.7 * d, 0.03 * m.v, 0.1);
      s.noise(0, 0.6 * d, 0.12 * m.v, 'highpass', 4000, 6000, 0.7, 0.08);
    } else {
      // Gölge Hükümdar (ve bilinmeyen roar): detone testereler + karanlık gürültü
      const f = { filter: ['lowpass', 600, 1], vib: { hz: 5, cents: 60 } };
      s.tone('sawtooth', 80 * m.p, 40 * m.p * m.glide, 0, 1.4 * d, 0.3 * m.v, 0.1, { ...f, detune: -15 });
      s.tone('sawtooth', 82 * m.p, 41 * m.p * m.glide, 0, 1.4 * d, 0.25 * m.v, 0.1, { ...f, detune: 15 });
      s.tone('square', 160 * m.p, 70 * m.p, 0, 1.2 * d, 0.08 * m.v, 0.1, { filter: ['lowpass', 500, 1] });
      s.noise(0, 1.2 * d, 0.25 * m.v, 'lowpass', 300, 150, 1, 0.1, 'brown');
    }
  },
};

/* ------------------------------------------------------------------------------------------------
 * Tarif tablosu
 * ---------------------------------------------------------------------------------------------- */

const DEFS = {};

/** reg(ad, tarif, { p: öncelik 1..5, r: menzil (blok), wet: yankı 0..1, gap: aynı sesin en kısa aralığı (sn) }) */
function reg(name, fn, def = {}) {
  DEFS[name] = { fn, p: def.p || 2, r: def.r === undefined ? 30 : def.r, wet: def.wet || 0, gap: def.gap || 0 };
}

// --- Arayüz (konumsuz) ---
reg(
  'ui_click',
  (s) => {
    s.tone('sine', 1300, 800, 0, 0.05, 0.25, 0.002);
    s.noise(0, 0.015, 0.08, 'highpass', 6000, 6000, 0.7, 0.001);
  },
  { p: 1, r: Infinity, gap: 0.03 }
);
reg('ui_hover', (s) => s.tone('sine', 1800, 1800, 0, 0.03, 0.08, 0.002), { p: 1, r: Infinity, gap: 0.05 });
reg(
  'ui_open',
  (s) => {
    s.tone('sine', 520, 520, 0, 0.12, 0.2, 0.004);
    s.tone('sine', 780, 780, 0.07, 0.16, 0.2, 0.004);
    s.noise(0, 0.08, 0.05, 'bandpass', 1200, 2400, 1, 0.01);
  },
  { p: 2, r: Infinity, gap: 0.08 }
);
reg(
  'ui_close',
  (s) => {
    s.tone('sine', 780, 780, 0, 0.1, 0.18, 0.004);
    s.tone('sine', 520, 520, 0.07, 0.14, 0.18, 0.004);
  },
  { p: 2, r: Infinity, gap: 0.08 }
);
reg(
  'ui_error',
  (s) => {
    s.tone('square', 150, 110, 0, 0.12, 0.13, 0.004, { filter: ['lowpass', 900, 1] });
    s.tone('square', 150, 105, 0.12, 0.14, 0.13, 0.004, { filter: ['lowpass', 900, 1] });
  },
  { p: 2, r: Infinity, gap: 0.2 }
);

// --- Eşya ve üretim ---
reg(
  'pickup',
  (s) => {
    s.tone('sine', 880, 1320, 0, 0.09, 0.22, 0.003);
    s.tone('triangle', 1320, 1760, 0.07, 0.12, 0.16, 0.003);
  },
  { p: 2, r: 20, gap: 0.04 }
);
reg(
  'craft',
  (s) => {
    for (let i = 0; i < 3; i++) {
      s.noise(i * 0.11, 0.04, 0.3, 'bandpass', 1800, 1200, 2, 0.002);
      s.tone('triangle', 700 - i * 40, 500, i * 0.11, 0.06, 0.18, 0.002);
    }
    s.tone('sine', 1568, 1568, 0.4, 0.5, 0.18, 0.004);
    s.tone('sine', 2350, 2350, 0.4, 0.4, 0.08, 0.004);
  },
  { p: 3, r: Infinity, wet: 0.2 }
);
reg(
  'eat',
  (s) => {
    for (let i = 0; i < 3; i++) s.noise(i * 0.12, 0.06, 0.32, 'bandpass', s.rr(1800, 2800), 1200, 1.5, 0.003);
    s.tone('sine', 120, 80, 0.36, 0.1, 0.18, 0.004);
  },
  { p: 2, r: 20 }
);

// --- Savaş ---
reg(
  'hit',
  (s) => {
    s.noise(0, 0.12, 0.5, 'bandpass', 1800, 600, 1.2, 0.003);
    s.tone('sine', 140, 70, 0, 0.12, 0.5, 0.003);
    s.tone('triangle', 500, 250, 0, 0.08, 0.2, 0.002);
  },
  { p: 3, r: 40, gap: 0.04 }
);
reg(
  'hurt',
  (s) => {
    s.tone('sawtooth', 240, 120, 0, 0.28, 0.22, 0.006, { filter: ['lowpass', 1200, 1] });
    s.tone('sine', 110, 60, 0, 0.25, 0.5, 0.004);
    s.noise(0, 0.15, 0.4, 'lowpass', 900, 300, 1, 0.003);
  },
  { p: 5, r: Infinity, gap: 0.12 }
);
reg(
  'die',
  (s) => {
    s.tone('sawtooth', 330, 55, 0, 1.4, 0.2, 0.02, { filter: ['lowpass', 1000, 1] });
    s.tone('sine', 160, 40, 0, 1.2, 0.35, 0.02);
    s.noise(0, 1.0, 0.25, 'lowpass', 800, 150, 1, 0.02);
  },
  { p: 5, r: Infinity, wet: 0.4 }
);
reg(
  'block',
  (s) => {
    s.tone('sine', 640, 640, 0, 0.3, 0.2, 0.002);
    s.tone('sine', 1766, 1766, 0.001, 0.24, 0.1, 0.002);
    s.tone('sine', 3456, 3456, 0.002, 0.16, 0.06, 0.002);
    s.noise(0, 0.03, 0.3, 'highpass', 3200, 3200, 0.7, 0.001);
  },
  { p: 3, r: 30, gap: 0.05 }
);
reg(
  'bow',
  (s) => {
    s.tone('triangle', 180, 110, 0, 0.12, 0.3, 0.002);
    s.noise(0, 0.03, 0.25, 'bandpass', 2400, 1800, 2, 0.001);
    s.tone('sine', 220, 220, 0.005, 0.35, 0.12, 0.002);
    s.tone('sine', 440, 440, 0.005, 0.25, 0.08, 0.002);
    s.tone('sine', 660, 660, 0.005, 0.18, 0.05, 0.002);
  },
  { p: 3, r: 50, gap: 0.08 }
);
reg('arrow', (s) => s.noise(0, 0.35, 0.28, 'bandpass', 3000, 1200, 2.5, 0.05), { p: 2, r: 50, gap: 0.05 });
reg(
  'arrow_hit',
  (s) => {
    s.tone('triangle', 220, 120, 0, 0.06, 0.4, 0.002);
    s.noise(0, 0.05, 0.3, 'bandpass', 2000, 1200, 1.5, 0.002);
    s.tone('sine', 900, 700, 0.01, 0.1, 0.06, 0.002);
  },
  { p: 3, r: 50, gap: 0.04 }
);
reg(
  'gun',
  (s) => {
    s.tone('sawtooth', 1400, 180, 0, 0.18, 0.18, 0.002, { filter: ['lowpass', 3000, 1] });
    s.tone('square', 600, 90, 0, 0.16, 0.1, 0.002);
    s.noise(0, 0.06, 0.3, 'highpass', 3500, 5000, 0.7, 0.001);
    s.tone('sine', 90, 50, 0, 0.25, 0.3, 0.004);
  },
  { p: 3, r: 60, wet: 0.15, gap: 0.06 }
);
reg('gun_charge', (s) => s.tone('sawtooth', 200, 1800, 0, 0.45, 0.1, 0.1, { filter: ['lowpass', 2400, 1] }), { p: 2, r: 30 });
reg(
  'gun_empty',
  (s) => {
    s.noise(0, 0.015, 0.15, 'highpass', 5000, 5000, 0.7, 0.001);
    s.tone('square', 900, 700, 0, 0.02, 0.06, 0.001);
  },
  { p: 1, r: 20, gap: 0.1 }
);
reg('beam', (s) => s.noise(0, 0.25, 0.3, 'highpass', 3000, 5000, 0.8, 0.02), { p: 2, r: 40, gap: 0.05 });

// --- Hareket ---
reg(
  'jump',
  (s) => {
    s.noise(0, 0.1, 0.15, 'bandpass', 900, 1800, 1, 0.01);
    s.tone('sine', 200, 320, 0, 0.08, 0.15, 0.004);
  },
  { p: 1, r: 25, gap: 0.1 }
);
reg(
  'fly',
  (s) => {
    s.tone('sine', 300, 700, 0, 0.25, 0.14, 0.02);
    s.noise(0, 0.3, 0.14, 'bandpass', 600, 2200, 1, 0.05);
  },
  { p: 2, r: 25, gap: 0.2 }
);
reg(
  'splash',
  (s) => {
    s.noise(0, 0.35, 0.6, 'bandpass', 700, 2200, 1, 0.01);
    s.noise(0.03, 0.5, 0.5, 'lowpass', 1500, 300, 1, 0.02);
    for (let i = 0; i < 3; i++) s.tone('sine', s.rr(350, 500), s.rr(800, 1000), 0.08 + i * 0.07, 0.06, 0.1, 0.004);
  },
  { p: 3, r: 35, wet: 0.2, gap: 0.1 }
);
reg(
  'swim',
  (s) => {
    s.noise(0, 0.3, 0.2, 'bandpass', 600, 1400, 1.5, 0.05);
    s.tone('sine', s.rr(400, 600), s.rr(800, 1100), 0.1, 0.06, 0.06, 0.004);
  },
  { p: 1, r: 20, gap: 0.25 }
);
reg('bubble', (s) => s.tone('sine', s.rr(500, 800), s.rr(1000, 1500), 0, 0.07, 0.12, 0.004), { p: 1, r: 20, gap: 0.05 });
reg(
  'lava',
  (s) => {
    s.tone('sine', 90, 60, 0, 0.25, 0.3, 0.01);
    s.tone('sine', 140, 320, 0.05, 0.1, 0.15, 0.005);
    s.noise(0, 0.2, 0.2, 'lowpass', 400, 150, 1, 0.01, 'brown');
  },
  { p: 1, r: 25, wet: 0.2, gap: 0.08 }
);

// --- Ortam tek atışları ---
reg(
  'drip',
  (s) => {
    s.tone('sine', 2200, 1300, 0, 0.07, 0.22, 0.001);
    s.tone('sine', 3300, 2000, 0, 0.05, 0.06, 0.001);
  },
  { p: 1, r: 24, wet: 0.9, gap: 0.2 }
);
reg(
  'bird',
  (s) => {
    const n = 3 + Math.floor(s.rand() * 2);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const f = s.rr(2600, 4200);
      s.tone('sine', f, f * s.rr(0.8, 1.3), t, 0.07, 0.1, 0.004);
      t += s.rr(0.08, 0.12);
    }
  },
  { p: 1, r: 40, wet: 0.15, gap: 0.5 }
);
reg(
  'cricket',
  (s) => {
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 3; i++) s.tone('sine', 4300, 4300, c * 0.22 + i * 0.05, 0.03, 0.04, 0.003);
    }
  },
  { p: 1, r: 30, gap: 0.5 }
);
reg(
  'frog',
  (s) => {
    s.tone('square', 160, 120, 0, 0.09, 0.1, 0.005, { filter: ['lowpass', 600, 1] });
    s.tone('square', 150, 110, 0.14, 0.1, 0.1, 0.005, { filter: ['lowpass', 600, 1] });
  },
  { p: 1, r: 30, gap: 0.5 }
);

// --- Bulmaca, bölge, ilerleme ---
const RUNE_FREQS = [392.0, 440.0, 523.25, 587.33, 659.25];
export const RUNE_COUNT = RUNE_FREQS.length;

function runeTone(s, idx) {
  const f = RUNE_FREQS[((idx % RUNE_COUNT) + RUNE_COUNT) % RUNE_COUNT];
  s.tone('sine', f, f, 0, 0.45, 0.25, 0.004);
  s.tone('triangle', f * 2, f * 2, 0, 0.3, 0.08, 0.004);
  s.tone('sine', f * 3.01, f * 3.01, 0, 0.2, 0.03, 0.004);
}

reg(
  'puzzle_solved',
  (s) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      s.tone('sine', f, f, i * 0.11, 0.6, 0.18, 0.004);
      s.tone('triangle', f * 2, f * 2, i * 0.11, 0.4, 0.06, 0.004);
    });
  },
  { p: 5, r: Infinity, wet: 0.45 }
);
reg(
  'puzzle_wrong',
  (s) => {
    s.tone('square', 110, 100, 0, 0.35, 0.12, 0.01, { filter: ['lowpass', 700, 1] });
    s.tone('sawtooth', 117, 105, 0, 0.35, 0.1, 0.01, { filter: ['lowpass', 700, 1] });
    s.noise(0, 0.2, 0.15, 'lowpass', 400, 200, 1, 0.01);
  },
  { p: 4, r: Infinity, gap: 0.15 }
);
reg(
  'achievement',
  (s) => {
    [659.25, 830.61, 987.77, 1318.5, 1661.2].forEach((f, i) => {
      s.tone('sine', f, f, i * 0.09, 0.5, 0.14, 0.004);
      if (i >= 2) s.tone('triangle', f * 2, f * 2, i * 0.09, 0.3, 0.04, 0.004);
    });
    s.tone('sine', 1318.5, 1318.5, 0.45, 1.2, 0.08, 0.2);
  },
  { p: 5, r: Infinity, wet: 0.5 }
);
reg(
  'zone_unlock',
  (s) => {
    s.tone('sine', 90, 55, 0, 0.6, 0.6, 0.005);
    s.noise(0, 0.25, 0.3, 'lowpass', 500, 150, 1, 0.005, 'brown');
    [261.63, 329.63, 392.0, 523.25].forEach((f, i) => s.tone('sawtooth', f, f, 0.25 + i * 0.18, 0.9, 0.09, 0.05, { filter: ['lowpass', 1400, 1] }));
    s.tone('sine', 523.25, 523.25, 0.5, 2.2, 0.08, 0.6);
    s.tone('sine', 659.25, 659.25, 0.6, 2.0, 0.06, 0.6);
    s.tone('sine', 784.0, 784.0, 0.7, 1.8, 0.05, 0.6);
  },
  { p: 5, r: Infinity, wet: 0.6 }
);
reg(
  'parkour_done',
  (s) => {
    [523.25, 659.25, 783.99].forEach((f, i) => {
      s.tone('triangle', f, f, i * 0.1, 0.5, 0.16, 0.004);
      s.tone('sine', f * 2, f * 2, i * 0.1, 0.35, 0.05, 0.004);
    });
    s.tone('sine', 1046.5, 1046.5, 0.35, 0.8, 0.12, 0.02);
  },
  { p: 4, r: Infinity, wet: 0.35 }
);
reg(
  'checkpoint',
  (s) => {
    s.tone('sine', 1046.5, 1046.5, 0, 0.3, 0.15, 0.004);
    s.tone('sine', 1568, 1568, 0.08, 0.35, 0.1, 0.004);
  },
  { p: 3, r: Infinity, wet: 0.25 }
);
reg(
  'quest',
  (s) => {
    s.tone('triangle', 587.33, 587.33, 0, 0.2, 0.12, 0.004);
    s.tone('triangle', 880, 880, 0.1, 0.3, 0.12, 0.004);
  },
  { p: 3, r: Infinity, wet: 0.25 }
);
reg(
  'boss_spawn',
  (s) => {
    s.tone('sine', 65, 55, 0, 2.0, 0.5, 0.01);
    s.tone('sine', 130.8, 120, 0, 1.6, 0.3, 0.01);
    [1, 2.76, 5.4].forEach((r, i) => s.tone('sine', 220 * r, 220 * r, 0.005, 1.4 - i * 0.3, 0.12 / (1 + i), 0.003));
    s.noise(0, 1.2, 0.25, 'lowpass', 300, 120, 1, 0.05, 'brown');
  },
  { p: 5, r: Infinity, wet: 0.6 }
);
reg(
  'portal',
  (s) => {
    s.noise(0, 0.7, 0.4, 'bandpass', 250, 3200, 2, 0.05);
    s.tone('sine', 180, 900, 0, 0.7, 0.15, 0.05, { vib: { hz: 7, cents: 40 } });
    s.tone('triangle', 360, 1800, 0.05, 0.6, 0.06, 0.05);
  },
  { p: 3, r: 30, wet: 0.4 }
);
reg(
  'door',
  (s) => {
    s.noise(0, 1.4, 0.5, 'lowpass', 240, 180, 1, 0.08, 'brown');
    s.tone('sawtooth', 52, 46, 0, 1.4, 0.12, 0.1, { filter: ['lowpass', 160, 1] });
    s.noise(0.1, 1.2, 0.1, 'bandpass', 900, 700, 3, 0.2);
    s.tone('sine', 80, 40, 1.4, 0.25, 0.6, 0.004);
    s.noise(1.4, 0.15, 0.3, 'lowpass', 600, 200, 1, 0.003);
  },
  { p: 3, r: 40, wet: 0.35 }
);
reg(
  'door_open',
  (s) => {
    s.tone('sawtooth', 160, 240, 0, 0.35, 0.08, 0.04, { filter: ['bandpass', 700, 4] });
    s.noise(0, 0.25, 0.12, 'bandpass', 500, 800, 2, 0.04);
  },
  { p: 2, r: 25, gap: 0.2 }
);
reg(
  'chest_open',
  (s) => {
    s.tone('sawtooth', 150, 230, 0, 0.3, 0.07, 0.04, { filter: ['bandpass', 650, 4] });
    s.noise(0, 0.2, 0.1, 'bandpass', 500, 800, 2, 0.04);
    [1760, 2349, 2794].forEach((f, i) => s.tone('sine', f, f, 0.25 + i * 0.07, 0.3, 0.08, 0.003));
  },
  { p: 3, r: 25, wet: 0.2 }
);
reg(
  'lever',
  (s) => {
    s.tone('triangle', 200, 120, 0, 0.05, 0.4, 0.002);
    s.noise(0, 0.03, 0.3, 'bandpass', 1500, 1500, 2, 0.001);
    s.tone('triangle', 170, 100, 0.12, 0.05, 0.3, 0.002);
  },
  { p: 2, r: 25, gap: 0.1 }
);
reg(
  'plate',
  (s) => {
    s.noise(0, 0.08, 0.5, 'lowpass', 1800, 500, 1, 0.002);
    s.tone('sine', 130, 70, 0, 0.12, 0.5, 0.003);
    s.tone('square', 1200, 1000, 0, 0.01, 0.1, 0.001);
  },
  { p: 2, r: 25, gap: 0.1 }
);

// --- Büyü / simya (audioRecipesMagic.js) ---
MAGIC_SOUNDS.forEach((m) => reg(m[0], m[1], m[2]));

// --- Ağaç devirme (audioRecipesTree.js) ---
TREE_SOUNDS.forEach((m) => reg(m[0], m[1], m[2]));

// --- Teknoloji (audioRecipesTech.js) ---
TECH_SOUNDS.forEach((m) => reg(m[0], m[1], m[2]));

// --- Boyutlar / Neon Meridyen (audioRecipesDim.js): geçiş sesleri + şehir ambiyans yatakları ---
DIM_SOUNDS.forEach((m) => reg(m[0], m[1], m[2]));

// --- İç mekân propları (audioRecipesProps.js): kullanım efektleri + ortam sesleri ---
PROP_SOUNDS.forEach((m) => reg(m[0], m[1], m[2]));

/** Doğrudan kayıtlı (varyantsız) ses adları. */
export const BASE_SOUND_NAMES = Object.freeze(Object.keys(DEFS));

const MATERIAL_KINDS = Object.keys(KIND);
const MAT_DEF = {
  step: { p: 1, r: 18, wet: 0, gap: 0.09 },
  dig: { p: 2, r: 24, wet: 0, gap: 0.05 },
  break: { p: 3, r: 32, wet: 0.05, gap: 0.05 },
  place: { p: 2, r: 28, wet: 0.03, gap: 0.05 },
  land: { p: 2, r: 24, wet: 0.03, gap: 0.12 },
};

/**
 * Ad çözümleme. Biçimler:
 *   'step' | 'step:taş' (+ opts.material), 'dig', 'break', 'place', 'land'
 *   'mob:<anahtar|aile>[:idle|hurt|die|attack]'   (+ opts.mode), 'mobhurt:<…>', 'mobdie:<…>', 'mobattack:<…>'
 *   'rune:<0..4>'
 *   ve BASE_SOUND_NAMES'teki doğrudan adlar.
 * Dönüş: { id, def:{fn,p,r,wet,gap}, fn } | null.
 */
export function resolveSound(name, opts) {
  if (typeof name !== 'string' || !name) return null;
  const raw = name.trim();
  const parts = raw.split(':');
  const head = foldKey(parts[0]);
  const arg = parts.length > 1 ? parts.slice(1).join(':') : '';
  const o = opts || {};

  if (MATERIAL_KINDS.indexOf(head) >= 0) {
    const mat = normMaterial(arg || o.material);
    const d = MAT_DEF[head];
    const def = { fn: null, p: d.p, r: d.r, wet: d.wet, gap: d.gap };
    return { id: head + ':' + mat, def, fn: (s) => materialSound(s, mat, head) };
  }
  const mobHead = /^mob(hurt|die|attack)?$/.exec(head);
  if (mobHead) {
    const segs = arg.split(':');
    const info = mobSoundFor(segs[0] || o.mob);
    if (!info) return null;
    const modeName = mobHead[1] || foldKey(segs[1] || o.mode) || 'idle';
    const m = MOB_MODE[modeName] || MOB_MODE.idle;
    const boss = Boolean(info.boss);
    const def = { fn: null, p: boss ? 4 : 3, r: boss ? 70 : 40, wet: boss ? 0.3 : 0.05, gap: 0.12 };
    return { id: 'mob:' + info.family + ':' + (info.boss || '') + ':' + modeName, def, fn: (s) => FAMILY[info.family](s, m, info) };
  }
  if (head === 'rune') {
    if (!/^-?\d+$/.test(arg)) return null;
    const i = Number(arg);
    return { id: 'rune:' + (((i % RUNE_COUNT) + RUNE_COUNT) % RUNE_COUNT), def: { fn: null, p: 3, r: Infinity, wet: 0.25, gap: 0.05 }, fn: (s) => runeTone(s, i) };
  }
  const direct = Object.prototype.hasOwnProperty.call(DEFS, raw) ? raw : Object.prototype.hasOwnProperty.call(DEFS, parts[0]) ? parts[0] : null;
  if (direct) {
    const def = DEFS[direct];
    return { id: direct, def, fn: def.fn };
  }
  return null;
}

/** Test/arayüz için: çözülebilen tüm somut ses adları. */
export function listSoundNames() {
  const out = BASE_SOUND_NAMES.slice();
  MATERIAL_KINDS.forEach((k) => MATERIALS.forEach((m) => out.push(k + ':' + m)));
  ['growl', 'rattle', 'skitter', 'hiss', 'gloop', 'flutter', 'roar', 'cluck', 'baa', 'meow', 'snort', 'blub'].forEach((f) => MOB_MODES.forEach((md) => out.push('mob:' + f + ':' + md)));
  ['kokana', 'tasbekci', 'buzkral', 'golgehukumdar'].forEach((b) => MOB_MODES.forEach((md) => out.push('mob:' + b + ':' + md)));
  for (let i = 0; i < RUNE_COUNT; i++) out.push('rune:' + i);
  return out;
}
