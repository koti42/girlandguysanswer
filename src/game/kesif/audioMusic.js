/*
 * KEŞİF müzik — üretken (generative) besteci; saf mantık, WebAudio yok.
 *
 * Sakin, evrilen pad + arpej + çan sesleri; bölgeye ve zamana göre değişen pentatonik kipler.
 * Savaşta ayrı bir "gergin" katman devreye girer (alçak drone, senkoplu nabız, sürtünmeli çınlamalar).
 * Besteci yalnızca nota olayları üretir; sese çevirme ve zamanlama audio.js'te.
 *
 * Belirlenimci: aynı rand fonksiyonu + aynı çağrı dizisi → aynı müzik (test edilebilir).
 * Math.random burada kullanılmaz; çağıran rand verir.
 */
import { midiToHz } from './audioMix.js';
import { BIOME_INFO } from './sim/biomeData.js';

export const SCALES = Object.freeze({
  majorPenta: Object.freeze([0, 2, 4, 7, 9]), // açık, huzurlu
  minorPenta: Object.freeze([0, 3, 5, 7, 10]), // karanlık, mağara
  egyptian: Object.freeze([0, 2, 5, 7, 10]), // asılı, gizemli orman
  hirajoshi: Object.freeze([0, 2, 3, 7, 8]), // kurak kanyon
  insen: Object.freeze([0, 1, 5, 7, 10]), // soğuk, seyrek zirve
});

/** Bölge başına kök (MIDI), kip, tempo (BPM), yoğunluk, parlaklık. */
export const ZONE_MUSIC = Object.freeze([
  Object.freeze({ key: 'baslangic', root: 60, scale: 'majorPenta', bpm: 68, density: 0.5, brightness: 0.8 }), // C
  Object.freeze({ key: 'fisildayan', root: 62, scale: 'egyptian', bpm: 60, density: 0.42, brightness: 0.6 }), // D
  Object.freeze({ key: 'yanik', root: 57, scale: 'hirajoshi', bpm: 72, density: 0.5, brightness: 0.7 }), // A
  Object.freeze({ key: 'donmus', root: 64, scale: 'insen', bpm: 54, density: 0.32, brightness: 0.95 }), // E
  Object.freeze({ key: 'cekirdek', root: 55, scale: 'minorPenta', bpm: 58, density: 0.38, brightness: 0.5 }), // G
]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Bağlamdan müzik parametreleri. Gece: yavaş, seyrek, kararmış; yeraltı: bir oktav aşağı, minör pentatonik,
 * çok seyrek; savaş: tense bayrağı (gergin katmanı açar, tempo artar).
 */
export function pickMusicParams({
  zone = 0, night = false, underground = false, combat = 0, biome = '',
} = {}) {
  const z = ZONE_MUSIC[clamp(Math.floor(Number.isFinite(zone) ? zone : 0), 0, ZONE_MUSIC.length - 1)];
  let scale = z.scale;
  let root = z.root;
  let bpm = z.bpm;
  let density = z.density;
  let brightness = z.brightness;
  // biyom kipi (sim/biomeData BIOME_INFO.music): kip / kök kaydırma / tempo-yoğunluk-parlaklık çarpanları; mağara ve savaş üstüne biner
  const bm = typeof biome === 'string' && BIOME_INFO[biome] ? BIOME_INFO[biome].music : null;
  if (bm) {
    if (bm.scale && SCALES[bm.scale]) scale = bm.scale;
    if (bm.shift) root += bm.shift;
    if (bm.bpm) bpm *= bm.bpm;
    if (bm.density) density *= bm.density;
    if (bm.brightness) brightness *= bm.brightness;
  }
  if (night) {
    if (scale === 'majorPenta') scale = 'egyptian';
    bpm *= 0.86;
    density *= 0.62;
    brightness *= 0.7;
  }
  if (underground) {
    scale = 'minorPenta';
    root -= 12;
    bpm *= 0.8;
    density *= 0.5;
    brightness *= 0.55;
  }
  const c = typeof combat === 'number' ? clamp(combat, 0, 1) : combat ? 1 : 0;
  const tense = c > 0.02;
  if (tense) bpm *= 1.18;
  return {
    zone: z.key,
    root,
    scaleName: scale,
    intervals: SCALES[scale],
    bpm,
    density,
    brightness,
    tense,
  };
}

/** Kök + kip ile birkaç oktavlık nota listesi (MIDI, artan). */
export function buildScale(root, intervals, octaves = 2, startOctave = 0) {
  const out = [];
  for (let o = startOctave; o < startOctave + octaves; o++) {
    for (let i = 0; i < intervals.length; i++) out.push(root + o * 12 + intervals[i]);
  }
  return out;
}

/** Pentatonik derece (0..) → MIDI (oktav sarar; negatif de olur). */
export function degreeToMidi(root, intervals, degree) {
  const n = intervals.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return root + oct * 12 + intervals[idx];
}

const PROGRESSIONS = [
  [0, 3, 2, 4],
  [0, 2, 3, 4],
  [0, 4, 3, 2],
  [0, 2, 4, 3],
  [0, 3, 4, 2],
];

export const STEPS_PER_BAR = 8; // sekizlikler
export const BARS_PER_PHRASE = 4;

/**
 * Üretken besteci. next(step, params) o sekizlik adımdaki nota olaylarını döndürür:
 *   { kind:'pad'|'bass'|'arp'|'bell'|'tensePulse'|'tenseDrone'|'tenseSting',
 *     midi, freq, beats (süre, vuruş), vel (0..1), delay (adım içi sn ofseti, 0..0.06 "insan" gevşekliği) }
 * Adımlar sırayla çağrılmalı (durumlu: akor ilerlemesi, melodi konumu).
 */
export function createMusicComposer({ rand }) {
  const r = typeof rand === 'function' ? rand : () => 0.5;
  let progression = PROGRESSIONS[0];
  let melodyIdx = 5;
  let lastScale = '';

  const pick = (list) => list[Math.min(list.length - 1, Math.floor(r() * list.length))];
  const ev = (kind, midi, beats, vel, delay = 0) => ({ kind, midi, freq: midiToHz(midi), beats, vel, delay });

  return {
    next(step, params) {
      const out = [];
      const iv = params.intervals;
      const root = params.root;
      const bar = Math.floor(step / STEPS_PER_BAR);
      const s = step % STEPS_PER_BAR;
      const barInPhrase = bar % BARS_PER_PHRASE;

      if (s === 0 && barInPhrase === 0) progression = pick(PROGRESSIONS);
      if (params.scaleName !== lastScale) {
        lastScale = params.scaleName;
        melodyIdx = 5;
      }
      const chordDeg = progression[barInPhrase];

      if (s === 0) {
        // Pad: yığılmış üçlüler (pentatonikte derece, +2, +4): yumuşak, çözülmesi gerekmeyen sesler.
        const base = root - 12;
        out.push(ev('pad', degreeToMidi(base, iv, chordDeg), 8, 0.5, 0));
        out.push(ev('pad', degreeToMidi(base, iv, chordDeg + 2), 8, 0.42, 0.03));
        out.push(ev('pad', degreeToMidi(base, iv, chordDeg + 4), 8, 0.36, 0.06));
        out.push(ev('bass', degreeToMidi(root - 24, iv, chordDeg), 3, 0.55, 0));
        // Parlak çan: yalnızca bazı ölçülerde, kök civarında.
        if ((barInPhrase === 0 || barInPhrase === 2) && r() < params.density * 0.7 * params.brightness) {
          out.push(ev('bell', degreeToMidi(root + 12, iv, chordDeg + pick([0, 2, 4])), 6, 0.22, 0.04));
        }
      } else if (s === 4 && r() < 0.35 * params.density + 0.1) {
        out.push(ev('bass', degreeToMidi(root - 24, iv, chordDeg + (r() < 0.5 ? 0 : 4)), 2, 0.4, 0));
      }

      // Arpej/melodi: rastgele yürüyüş, her 4. ölçüde nefes payı.
      const rest = barInPhrase === 3 ? 0.45 : 1;
      if (r() < params.density * 0.6 * rest) {
        const move = pick([-2, -1, -1, 0, 1, 1, 2]);
        melodyIdx = clamp(melodyIdx + move, 0, 12);
        // Güçlü vuruşlarda akor sesine yaklaş.
        if (s % 4 === 0 && r() < 0.5) {
          const target = chordDeg + pick([0, 2, 4]) + 5;
          melodyIdx = clamp(melodyIdx + Math.sign(target - melodyIdx), 0, 12);
        }
        const midi = degreeToMidi(root, iv, melodyIdx);
        const vel = 0.16 + r() * 0.16 + (s === 0 ? 0.08 : 0);
        out.push(ev('arp', midi, 1.5 + Math.floor(r() * 3), vel * (0.7 + 0.5 * params.brightness), r() * 0.05));
      }

      if (params.tense) {
        const tRoot = root - 24;
        if (s === 0) {
          out.push(ev('tenseDrone', tRoot - 12, 8, 0.5, 0));
          out.push(ev('tenseDrone', tRoot - 5, 8, 0.32, 0)); // aşağı beşli
        }
        // Senkoplu nabız: 0, 3, 6 (3+3+2).
        if (s === 0 || s === 3 || s === 6) out.push(ev('tensePulse', tRoot + (s === 6 ? 1 : 0), 0.5, s === 0 ? 0.7 : 0.5, 0));
        // İki ölçüde bir sürtünmeli çınlama: minör ikili + artırılmış dörtlü.
        if (s === 4 && bar % 2 === 1) {
          out.push(ev('tenseSting', root + 12 + 1, 3, 0.3, 0));
          out.push(ev('tenseSting', root + 12 + 6, 3, 0.26, 0.02));
        }
      }
      return out;
    },
    reset() {
      progression = PROGRESSIONS[0];
      melodyIdx = 5;
      lastScale = '';
    },
    get progression() {
      return progression;
    },
  };
}

/** Bir sekizlik adımın süresi (sn). */
export const stepSeconds = (bpm) => 60 / bpm / 2;
