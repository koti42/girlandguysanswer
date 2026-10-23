/*
 * KEŞİF ses — ARAÇ RADYOSU (Neon Meridyen Faz 3, paket vehicle_audio). Prosedürel müzik; dosya/ses kaydı/konuşma YOK. Sözleşme §9, design_vehicles.md §6.
 *
 * SAF BÖLÜM (node'da test edilir; Math.random/Date.now yok):
 *   getStation(idOrIndex)        istasyon verisi (varsayılan: Neon FM; geçersiz → Sessiz)       STATIONS (6: 5 istasyon + Sessiz)
 *   stepSeconds(st) barSeconds(st) stepAt(st, t)         tempo ↔ zaman
 *   radioStepEvents(st, step)    adım (16'lık) → nota/vuruş olayları; (istasyon tohumu, adım) rastgele erişimli ve BELİRLENİMCİ
 *                                olay: {kind:'kick'|'snare'|'hat'|'bass'|'pad'|'lead'|'arp'|'bell'|'sting', midi?, freq?, steps, vel, delay, open?}
 *                                Tüm perdeli notalar istasyon gamındadır (derece→MIDI; gam dışı nota üretilemez).
 *   trackAt(st, t) → {index,title,artist,startSec,endSec,elapsed}     tickerAt(st, t, seed) → {kind:'title'|'dj'|'ad', text, chip, key}
 * ÇALAR BÖLÜM (audio.js getLoopContext()):
 *   const radio = createRadio({ getLoop, nodeCap, seed })
 *   radio.update(dt, t, active)  her karede; t = radyo saati (sn, istasyonlar arasında ortak "canlı yayın" saati), active = araçtayken true
 *   radio.setStation(idOrIndex)  geçişte kısa çapraz geçiş + cızırtı;   radio.next() / radio.prev()  (Sessiz dahil döngü)
 *   radio.setDuck(0..1)          1 = açık hava, 0 = derin tünel/iç mekân (ses kısılır + tonu kararır)
 *   radio.info(t)                {station,index,name,genre,silent,title,artist,ticker,chip,playing}      radio.getStats()   radio.halt()   radio.dispose()
 * Düğüm tavanı: radyo kaynakları (osilatör + gürültü) ≤ nodeCap (24/18/12 → 16/12/8); öncelik sırası düşüşü: tepki > bas > davul > ezgi > fon > arp > hi-hat.
 */
import {
  ARTISTS, DJ_LINES, RADIO_STATIONS_DATA, STEPS_PER_BAR, STING_SECONDS, TICKER_SECONDS, TITLE_ADJ, TITLE_NOUN, TRACK_BARS,
} from './audioRadioData.js';
import { degreeToMidi } from './audioMusic.js';
import { midiToHz } from './audioMix.js';
import { createNodeKit } from './audioNodeKit.js';
import { CITY_AD_LINES } from './sim/city/cityBrands.js';
import { hash32, hash3 } from './sim/rng.js';

export const STATIONS = RADIO_STATIONS_DATA;
export { STEPS_PER_BAR, TRACK_BARS };
export const SILENT_INDEX = STATIONS.length - 1;

const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const TWO32 = 4294967296;
const rnd = (seed, a, b, c) => hash3(a | 0, b | 0, c | 0, seed | 0) / TWO32;

/** Kimlik ('neonfm'), indeks (0..5) ya da istasyon nesnesi → istasyon. Geçersiz → Sessiz. */
export function getStation(x) {
  if (x && typeof x === 'object' && typeof x.id === 'string') return getStation(x.id);
  if (typeof x === 'number' && Number.isFinite(x)) {
    const i = Math.floor(x);
    return i >= 0 && i < STATIONS.length ? STATIONS[i] : STATIONS[SILENT_INDEX];
  }
  if (typeof x === 'string') {
    for (let i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === x) return STATIONS[i];
  }
  return STATIONS[SILENT_INDEX];
}

export function stepSeconds(st) {
  return st && st.bpm > 0 ? 60 / st.bpm / 4 : 0;
}
export function barSeconds(st) {
  return stepSeconds(st) * STEPS_PER_BAR;
}
export function stepAt(st, t) {
  const ss = stepSeconds(st);
  return ss > 0 ? Math.floor(Math.max(0, num(t, 0)) / ss) : 0;
}

/* ------------------------------------------------------------------------------------------------
 * Parça (başlık, sanatçı, motif)
 * ---------------------------------------------------------------------------------------------- */
function trackSeed(st, ti) {
  return hash32((st.seed | 0) ^ Math.imul((ti | 0) + 1, 0x9e3779b1));
}

function titleFor(ts) {
  const a = TITLE_ADJ[ts % TITLE_ADJ.length];
  const n = TITLE_NOUN[Math.floor(ts / 16) % TITLE_NOUN.length];
  const n2 = TITLE_NOUN[Math.floor(ts / 256) % TITLE_NOUN.length];
  const kind = Math.floor(ts / 4096) % 3;
  if (kind === 0) return a + ' ' + n;
  if (kind === 1) return n === n2 ? a + ' ' + n : n + ' ve ' + n2;
  return n + ' İçin Şarkı';
}

const motifCache = new Map();
function motifFor(st, ts) {
  const key = st.id + ':' + ts;
  let m = motifCache.get(key);
  if (m) return m;
  m = [];
  let d = Math.floor(rnd(ts, 1, 2, 3) * 4) + 2;
  const moves = [-2, -1, -1, 0, 1, 1, 2];
  for (let i = 0; i < 8; i++) {
    m.push(d);
    d = clamp(d + moves[Math.floor(rnd(ts, 7, i, 9) * moves.length)], -1, 9);
  }
  if (motifCache.size > 64) motifCache.clear();
  motifCache.set(key, m);
  return m;
}

/** t (sn) anındaki parça. */
export function trackAt(st, t) {
  if (!st || st.silent) return null;
  const barSec = barSeconds(st);
  const len = barSec * TRACK_BARS;
  const tt = Math.max(0, num(t, 0));
  const index = Math.floor(tt / len);
  const ts = trackSeed(st, index);
  const artists = ARTISTS[st.id];
  return {
    index,
    title: titleFor(ts),
    artist: artists[Math.floor(ts / 65536) % artists.length],
    startSec: index * len,
    endSec: (index + 1) * len,
    elapsed: tt - index * len,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Yazı bandı (ticker): şimdi çalıyor / DJ satırı / uydurma marka reklamı — sesli konuşma yok
 * ---------------------------------------------------------------------------------------------- */
const BRANDED = CITY_AD_LINES.filter((a) => a.brand);

function clip(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

export function tickerAt(st, t, seed) {
  if (!st || st.silent) return { kind: 'off', text: '', chip: '', key: 'off' };
  const tr = trackAt(st, t);
  const k = Math.floor(Math.max(0, num(t, 0)) / TICKER_SECONDS);
  const h = hash3(st.seed | 0, k, 77, seed | 0) % 10;
  let kind = h < 4 ? 'title' : h < 7 ? 'dj' : 'ad';
  if (tr.elapsed < TICKER_SECONDS) kind = 'title';
  let text;
  if (kind === 'title') text = 'Şimdi çalıyor: ' + tr.title + ' — ' + tr.artist;
  else if (kind === 'dj') {
    const lines = DJ_LINES[st.id];
    text = lines[hash3(st.seed | 0, k, 78, seed | 0) % lines.length];
  } else {
    const ad = BRANDED[hash3(st.seed | 0, k, 79, seed | 0) % BRANDED.length];
    text = 'Reklam: ' + ad.text;
  }
  return {
    kind, text, chip: clip(text, 40), key: kind + ':' + k,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Besteci: adım → olaylar (belirlenimci, rastgele erişimli)
 * ---------------------------------------------------------------------------------------------- */
function ev(kind, st, midi, steps, vel, delay, extra) {
  const e = {
    kind, steps, vel, delay,
  };
  if (midi !== null) {
    e.midi = midi;
    e.freq = midiToHz(midi);
  }
  if (extra) e.open = true;
  return e;
}

function snapToChord(deg, chordDeg, n) {
  let best = deg;
  let bd = 1e9;
  const tones = [0, 2, 4];
  for (let j = -2; j <= 2; j++) {
    for (let i = 0; i < 3; i++) {
      const c = chordDeg + tones[i] + n * j;
      const d = Math.abs(c - deg);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
  }
  return best;
}

const prefixCache = new Map();
function prefixCounts(st) {
  let p = prefixCache.get(st.id);
  if (p) return p;
  const r = st.lead.rhythm;
  p = new Array(r.length + 1);
  p[0] = 0;
  for (let i = 0; i < r.length; i++) p[i + 1] = p[i] + (r[i] > 0 ? 1 : 0);
  prefixCache.set(st.id, p);
  return p;
}

export function radioStepEvents(st, step0) {
  const out = [];
  if (!st || st.silent || !(st.bpm > 0)) return out;
  const step = Math.max(0, Math.floor(num(step0, 0)));
  const bar = Math.floor(step / STEPS_PER_BAR);
  const s = step % STEPS_PER_BAR;
  const ti = Math.floor(bar / TRACK_BARS);
  const bt = bar % TRACK_BARS;
  const ts = trackSeed(st, ti);
  const iv = st.intervals;
  const n = iv.length;
  const section = Math.floor(bt / 8);
  const prog = st.progs[hash3(ts | 0, section, 11, 0) % st.progs.length];
  const chordDeg = prog[bt % prog.length];
  const stepSec = stepSeconds(st);
  const swingDelay = (s & 1) && st.swing > 0 ? st.swing * stepSec : 0;
  const hum = (salt) => rnd(ts, step, salt, 5) * 0.006;
  const intro = section === 0;
  const brk = section === 2;
  const outro = bt >= TRACK_BARS - 2;
  const hasDrums = Boolean(st.drums);
  const drumsOn = hasDrums && !intro && !brk && !outro;
  const pos = (bt % 2) * STEPS_PER_BAR + s; // 32'lik kalıp konumu

  // --- fon (pad) ---
  const padBars = st.pad.bars || 1;
  if (st.pad.stab) {
    if (!intro && (s === 2 || s === 6 || s === 10) && rnd(ts, step, 21, 0) < 0.8) {
      for (let i = 0; i < st.pad.notes; i++) out.push(ev('pad', st, degreeToMidi(st.root, iv, chordDeg + i * 2), 1.6, st.pad.vel * (1 - 0.1 * i), hum(21 + i)));
    }
  } else if (s === 0 && bt % padBars === 0) {
    const base = Math.floor(bt / padBars) * padBars;
    const cd = prog[base % prog.length];
    for (let i = 0; i < st.pad.notes; i++) {
      out.push(ev('pad', st, degreeToMidi(st.root - 12, iv, cd + i * 2), STEPS_PER_BAR * padBars, st.pad.vel * (1 - 0.1 * i), 0.01 * i));
    }
  }

  // --- bas (kırılımda yalnız uzun ambient notaları) ---
  const b = st.bass;
  if (b.pat[pos] > 0 && (!brk || b.steps > 8) && (!intro || rnd(ts, step, 31, 0) < 0.7)) {
    const fifth = rnd(ts, step, 32, 0) < 0.22;
    const midi = degreeToMidi(st.root + b.octave, iv, chordDeg + (fifth ? 4 : 0));
    out.push(ev('bass', st, midi, b.steps, b.vel * (0.85 + 0.3 * rnd(ts, step, 33, 0)), hum(34)));
  }

  // --- davul ---
  if (hasDrums) {
    const d = st.drums;
    if (drumsOn) {
      if (d.kick[s] > 0) out.push(ev('kick', st, null, 1, 0.9 * d.kick[s], 0));
      if (d.snare[s] > 0) out.push(ev('snare', st, null, 1, 0.8 * d.snare[s], hum(40)));
      // 8 ölçülük bölümün sonunda küçük doldurma
      if (bt % 8 === 7 && s >= 12 && (s & 1) === 0) out.push(ev('snare', st, null, 1, 0.5, 0));
    }
    if (!outro && !brk) {
      if (d.hat[s] > 0 && rnd(ts, step, 41, 0) < d.hatProb) out.push(ev('hat', st, null, 0.5, (0.55 + 0.4 * rnd(ts, step, 42, 0)) * (intro ? 0.7 : 1), swingDelay + hum(43)));
      if (!intro && d.ohat[s] > 0) out.push(ev('hat', st, null, 2, 0.7, swingDelay, true));
    }
  }

  // --- ezgi (motif; sahne yok: intro'nun ilk 4 ölçüsünde sessiz) ---
  if ((!intro || bt >= 4) && st.lead.rhythm[pos] > 0 && rnd(ts, step, 51, 0) < st.lead.density) {
    const hits = prefixCounts(st);
    const per = hits[hits.length - 1];
    const k = hits[pos] + per * Math.floor(bt / 2);
    const m = motifFor(st, ts);
    let deg = m[k % m.length];
    if (s % 4 === 0) deg = snapToChord(deg, chordDeg, n);
    out.push(ev('lead', st, degreeToMidi(st.root + 12, iv, deg), st.lead.steps, st.lead.vel * (0.85 + 0.3 * rnd(ts, step, 52, 0)), swingDelay + hum(53)));
  }

  // --- arpej ---
  if (!intro && !outro && (s & 1) === 0 && rnd(ts, step, 61, 0) < st.arp.density) {
    const tone = [0, 2, 4, 2][(s >> 1) & 3];
    const oct = rnd(ts, step, 62, 0) < 0.25 ? n : 0;
    out.push(ev('arp', st, degreeToMidi(st.root + 12, iv, chordDeg + tone + oct), st.arp.steps, st.arp.vel * (0.8 + 0.4 * rnd(ts, step, 63, 0)), swingDelay + hum(64)));
  }

  // --- çan ---
  if ((s === 0 || s === 8) && rnd(ts, step, 71, 0) < st.bell.density) {
    const tones = [0, 2, 4, n];
    const d = chordDeg + tones[Math.floor(rnd(ts, step, 72, 0) * 4)];
    out.push(ev('bell', st, degreeToMidi(st.root + 24, iv, d), 8, 0.2, hum(73)));
  }

  // --- istasyon jingle'ı (~90 sn'de bir; üç çan notası) ---
  const stingStep = Math.round(STING_SECONDS / stepSec);
  if (step > 0 && step % stingStep === 0) {
    const off = Math.floor(rnd(ts, step, 81, 0) * 3);
    for (let i = 0; i < 3; i++) out.push(ev('sting', st, degreeToMidi(st.root + 24, iv, (i * 2 + off) % (n + 2)), 6, 0.3, i * 0.14));
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * ÇALAR
 * ---------------------------------------------------------------------------------------------- */
const LOOKAHEAD = 0.3;
const MAX_NOTES_FRAME = 14;
const MAX_ENV = 0.0001;
const BASE_LEVEL = 3.0;
const PRIORITY = {
  kick: 0, bass: 0, snare: 0, lead: 1, pad: 1, sting: 1, bell: 2, arp: 2, hat: 3,
};
const ORDER = ['kick', 'bass', 'snare', 'lead', 'pad', 'sting', 'bell', 'arp', 'hat'];

/** Ses kademesi düğüm tavanı (24/18/12) → radyo kaynak tavanı (16/12/8). */
export function radioCapFor(vehicleCap) {
  return Math.max(0, Math.round(num(vehicleCap, 24) * 2 / 3));
}

let composerWarm = false;

/** Soğuk JIT yükünü ilk çalmadan önce alır (saf, ucuz: 5 istasyon × 48 adım). */
function warmComposer() {
  if (composerWarm) return;
  composerWarm = true;
  for (let i = 0; i < STATIONS.length; i++) {
    const st = STATIONS[i];
    if (st.silent) continue;
    for (let k = 0; k < 48; k++) radioStepEvents(st, k + 16 * 8);
    trackAt(st, 10);
    tickerAt(st, 10, 0);
  }
}

export function createRadio({ getLoop, nodeCap = 16, seed = 0 } = {}) {
  warmComposer();
  const kit = createNodeKit({ cap: nodeCap });
  let station = STATIONS[0];
  let loop = null;
  let ctx = null;
  let chain = null; // {g, master, hp, lp}
  let bus = null; // {g, gain, notes:[{g,end}], station}
  const dying = []; // çapraz geçişte sönen eski veriyollar
  let duck = 1;
  let duckApplied = -1;
  let playing = false;
  let held = false;
  let wantBlip = false;
  let blipAt = 0;
  let frameNo = 0;
  let frameNotes = 0;
  let disposed = false;
  const sched = { valid: false, step: 0, offset: 0 };
  const stats = { notes: 0, dropped: 0, resyncs: 0, switches: 0, skipped: 0 };
  let lastLoop = null;

  function holdMusic(b) {
    const l = loop || lastLoop;
    if (l && typeof l.holdMusic === 'function' && b !== held) {
      held = b;
      l.holdMusic(b);
    } else if (!l) held = b;
  }

  function setT(p, v, t, tc) {
    if (p && typeof p.setTargetAtTime === 'function') p.setTargetAtTime(v, t, tc);
    else if (p) p.value = v;
  }

  function buildChain() {
    const g = kit.group('radioChain');
    const master = g.gain(0);
    const lp = g.filter('lowpass', 9000, 0.5);
    const hp = g.filter('highpass', 70, 0.5);
    hp.connect(lp);
    lp.connect(master);
    master.connect(loop.music);
    chain = {
      g, master, hp, lp,
    };
    duckApplied = -1;
  }

  function buildBus() {
    const g = kit.group('radioBus');
    const gain = g.gain(0);
    gain.connect(chain.hp);
    const t = ctx.currentTime;
    setT(gain.gain, 1, t, 0.12);
    bus = {
      g, gain, notes: [], station,
    };
    sched.valid = false;
  }

  function endBus(b, fade) {
    if (!b) return;
    const t = ctx.currentTime;
    setT(b.gain.gain, 0, t, fade / 3);
    const stopAt = t + fade + 0.02;
    for (let i = 0; i < b.notes.length; i++) {
      const n = b.notes[i];
      if (n.end > stopAt) {
        n.g.stopAt(stopAt);
        n.end = stopAt;
      }
    }
    b.dieAt = stopAt + 0.1;
    dying.push(b);
  }

  function sweepBuses(now) {
    for (let i = dying.length - 1; i >= 0; i--) {
      const b = dying[i];
      if (now >= b.dieAt) {
        for (let k = 0; k < b.notes.length; k++) b.notes[k].g.destroy();
        b.g.destroy();
        dying.splice(i, 1);
      }
    }
    if (bus) {
      const ns = bus.notes;
      let w = 0;
      for (let i = 0; i < ns.length; i++) if (ns[i].end + 0.1 > now) ns[w++] = ns[i];
      ns.length = w;
    }
  }

  function applyDuck(force) {
    if (!chain) return;
    if (!force && Math.abs(duck - duckApplied) < 0.01) return;
    duckApplied = duck;
    const t = ctx.currentTime;
    setT(chain.master.gain, BASE_LEVEL * (0.2 + 0.8 * duck), t, 0.3);
    setT(chain.lp.frequency, 1100 + 7900 * duck, t, 0.3);
  }

  /* ---- nota üreticiler ---- */
  function room(kind) {
    return kit.count + 1 + PRIORITY[kind] <= kit.cap;
  }

  function envelope(param, t0, att, dur, rel, peak) {
    const hold = Math.max(0, dur - att - rel);
    param.setValueAtTime(MAX_ENV, t0);
    param.exponentialRampToValueAtTime(Math.max(MAX_ENV * 2, peak), t0 + att);
    param.setValueAtTime(Math.max(MAX_ENV * 2, peak), t0 + att + hold);
    param.exponentialRampToValueAtTime(MAX_ENV, t0 + att + hold + rel);
    return t0 + att + hold + rel;
  }

  function tone(kind, wave, f, t0, att, dur, rel, peak, lpHz, sweepTo) {
    if (!room(kind)) return false;
    const g = kit.group('radioNote');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(bus.gain);
      let head = out;
      if (lpHz) {
        const lp = g.filter('lowpass', lpHz, 0.6);
        lp.connect(out);
        head = lp;
      }
      const o = g.osc(wave, f, t0);
      o.connect(head);
      if (sweepTo) {
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
      }
      const end = envelope(out.gain, t0, att, dur, rel, peak) + 0.02;
      g.finish(end);
      bus.notes.push({ g, end });
      stats.notes++;
      return true;
    } catch {
      g.destroy();
      stats.dropped++;
      return false;
    }
  }

  function noiseHit(kind, type, f, q, t0, dur, peak) {
    if (!room(kind)) return false;
    const g = kit.group('radioPerc');
    try {
      const out = g.gain(MAX_ENV);
      out.connect(bus.gain);
      const flt = g.filter(type, f, q);
      flt.connect(out);
      const n = g.noise(loop.white, t0);
      n.connect(flt);
      const end = envelope(out.gain, t0, 0.003, dur, dur * 0.7, peak) + 0.02;
      g.finish(end);
      bus.notes.push({ g, end });
      stats.notes++;
      return true;
    } catch {
      g.destroy();
      stats.dropped++;
      return false;
    }
  }

  function playEvent(e, when, stepSec, st) {
    const t0 = when + e.delay;
    const dur = Math.max(0.05, e.steps * stepSec);
    switch (e.kind) {
      case 'kick': return tone('kick', 'sine', st.sound.kickF, t0, 0.004, 0.16, 0.12, e.vel * 0.55, 0, 42);
      case 'snare': return noiseHit('snare', 'bandpass', 1900, 0.8, t0, 0.13, e.vel * 0.26);
      case 'hat': return noiseHit('hat', 'highpass', 7200, 0.7, t0, e.open ? 0.12 : 0.035, e.vel * 0.08);
      case 'bass': return tone('bass', st.sound.bassWave, e.freq, t0, 0.01, dur, 0.06, e.vel * 0.3, st.sound.bassLp);
      case 'pad': return tone('pad', st.pad.wave, e.freq, t0, Math.min(0.4, dur * 0.4), dur, Math.min(0.7, dur * 0.4), e.vel * 0.55, st.pad.lp);
      case 'lead': return tone('lead', st.lead.wave, e.freq, t0, 0.012, dur, Math.min(0.12, dur * 0.4), e.vel * 0.3, st.lead.lp);
      case 'arp': return tone('arp', st.arp.wave, e.freq, t0, 0.008, dur, 0.08, e.vel * 0.4, st.arp.lp);
      case 'bell': return tone('bell', 'sine', e.freq, t0, 0.004, 1.5, 1.2, e.vel * 0.5, 0);
      case 'sting': return tone('sting', 'sine', e.freq, t0, 0.004, 1.1, 0.9, e.vel * 0.55, 0);
      default: return false;
    }
  }

  function playStep(step, when) {
    const st = station;
    const evs = radioStepEvents(st, step);
    if (evs.length === 0) return;
    const stepSec = stepSeconds(st);
    for (let o = 0; o < ORDER.length; o++) {
      for (let i = 0; i < evs.length; i++) {
        if (evs[i].kind === ORDER[o]) {
          if (!playEvent(evs[i], when, stepSec, st)) stats.dropped++;
        }
      }
    }
  }

  function blip() {
    if (!chain || !kit.canTake(1)) return;
    const g = kit.group('radioTune');
    try {
      const t0 = ctx.currentTime;
      const out = g.gain(MAX_ENV);
      out.connect(chain.hp);
      const f = g.filter('bandpass', 700, 1.4);
      f.connect(out);
      const n = g.noise(loop.white, t0);
      n.connect(f);
      f.frequency.setValueAtTime(700, t0);
      f.frequency.exponentialRampToValueAtTime(3200, t0 + 0.2);
      const end = envelope(out.gain, t0, 0.01, 0.2, 0.08, 0.1) + 0.02;
      g.finish(end);
    } catch {
      g.destroy();
    }
  }

  function schedule(t) {
    const ss = stepSeconds(station);
    if (!(ss > 0)) return;
    const now = ctx.currentTime;
    if (sched.valid && Math.abs(now - (t + sched.offset)) > 0.4) {
      sched.valid = false;
      stats.resyncs++;
    }
    if (!sched.valid) {
      sched.offset = now - t;
      sched.step = Math.ceil((t + 0.04) / ss);
      sched.valid = true;
    }
    const ahead = now + LOOKAHEAD;
    frameNotes = 0;
    let guard = 0;
    while (guard++ < 32) {
      const when = sched.step * ss + sched.offset;
      if (when >= ahead) break;
      if (when < now - 0.1) {
        sched.step++;
        stats.skipped++;
        continue;
      }
      if (frameNotes >= MAX_NOTES_FRAME && when > now + 0.06) break; // yük kareye yayılır; vuruş zamanı yaklaşmışsa yine de çalınır
      const n0 = stats.notes;
      playStep(sched.step, when);
      frameNotes += stats.notes - n0;
      sched.step++;
    }
  }

  function stopPlaying(fade) {
    if (bus) {
      endBus(bus, fade);
      bus = null;
    }
    playing = false;
    holdMusic(false);
  }

  const api = {
    /** t: radyo saati (sn); active: araçtayken true. */
    update(dt0, t0, active) {
      if (disposed) return;
      const dt = clamp(num(dt0, 0), 0, 0.5);
      frameNo++;
      loop = typeof getLoop === 'function' ? getLoop() : null;
      if (loop) lastLoop = loop;
      if (!loop || !loop.ctx || !loop.running || !loop.musicOn) {
        if (kit.count > 0 || kit.groups > 0 || playing || held) api.halt();
        return;
      }
      if (kit.ctx !== loop.ctx) {
        kit.setContext(loop.ctx);
        chain = null;
        bus = null;
        dying.length = 0;
        playing = false;
        sched.valid = false;
      }
      ctx = loop.ctx;
      const now = ctx.currentTime;
      kit.sweep(now);
      sweepBuses(now);
      const on = Boolean(active) && !station.silent;
      if (!on) {
        if (bus) stopPlaying(0.4);
        if (!bus && dying.length === 0 && chain) {
          chain.g.destroy();
          chain = null;
        }
        return;
      }
      if (!chain) buildChain();
      applyDuck(false);
      if (!bus || bus.station !== station) {
        if (bus) endBus(bus, 0.4);
        buildBus();
        bus.station = station;
        if (wantBlip) {
          blipAt = frameNo + 1; // cızırtı bir sonraki karede (kurulum yükü yayılır)
          wantBlip = false;
        }
      }
      if (!playing) {
        playing = true;
        holdMusic(true);
        applyDuck(true);
      }
      if (dt > 0) schedule(num(t0, 0));
      if (blipAt > 0 && frameNo >= blipAt) {
        blipAt = 0;
        blip();
      }
    },

    setStation(x) {
      const next = getStation(x);
      if (next === station) return false;
      station = next;
      stats.switches++;
      wantBlip = true;
      sched.valid = false;
      return true;
    },
    next() {
      api.setStation((station.index + 1) % STATIONS.length);
      return station;
    },
    prev() {
      api.setStation((station.index + STATIONS.length - 1) % STATIONS.length);
      return station;
    },
    get station() {
      return station;
    },

    /** 1 = açık hava, 0 = derin tünel/iç mekân. */
    setDuck(v) {
      duck = clamp(num(v, 1), 0, 1);
    },
    get duck() {
      return duck;
    },

    setNodeCap(n) {
      kit.setCap(Math.max(0, Math.floor(num(n, kit.cap))));
    },

    info(t) {
      const st = station;
      if (st.silent) {
        return {
          station: st.id, index: st.index, name: st.name, genre: '', silent: true, title: '', artist: '', ticker: '', chip: '', kind: 'off', playing: false,
        };
      }
      const tr = trackAt(st, t);
      const tk = tickerAt(st, t, seed);
      return {
        station: st.id, index: st.index, name: st.name, genre: st.genre, silent: false, title: tr.title, artist: tr.artist, ticker: tk.text, chip: tk.chip, kind: tk.kind, playing,
      };
    },

    halt() {
      kit.destroyAll();
      chain = null;
      bus = null;
      dying.length = 0;
      playing = false;
      sched.valid = false;
      wantBlip = false;
      blipAt = 0;
      holdMusic(false);
    },

    getStats() {
      const k = kit.stats();
      return {
        sources: k.count, peak: k.peak, cap: k.cap, playing, station: station.id, duck, notes: stats.notes, dropped: stats.dropped, resyncs: stats.resyncs,
        switches: stats.switches, skipped: stats.skipped, created: k.created, released: k.released, groups: k.groups, dying: dying.length,
      };
    },

    probe() {
      return { kit, chain, bus };
    },

    dispose() {
      if (disposed) return;
      api.halt();
      disposed = true;
    },
  };
  return api;
}
