/*
 * KEŞİF ses — BOYUT geçişi ve NEON MERİDYEN ambiyans tarifleri (audioRecipes.js'e reg ile eklenir). Dosya yok; osilatör + gürültü + süzgeç.
 * Aile dostu: siren YOK, silah sesi YOK, bağırış YOK — yalnız şehir uğultusu, yağmur, neon vızıltısı ve geçiş efektleri.
 *
 *   Geçiş (gameTransition/gate; her biri < 5 sn, konumsuz ya da kapıdan duyulur)
 *     dim:charge     kapı/boyut şarjı: yükselen uğultu + parıltı (0,8 sn)
 *     dim:whoosh     warp süpürmesi: gürültü süpürme + alçalan ton (0,7 sn)
 *     dim:arrive     varış: alçak gümleme + üç notalı yumuşak çınlama
 *     dim:gateOpen   kapı açılışı: alçak kabarma + parıltı    dim:gateHum  açık kapı uğultusu (kısa, sessiz)    dim:gateClose  kapı kapanışı
 *     dim:terminal   terminal kullanımı: iki yumuşak "blip"
 *   Şehir ambiyans YATAKLARI (audioCity.js sürekli yeniden başlatır; her biri ≤ 4,8 sn, 0,8 sn çapraz geçiş, düz plato — makeSynth.sustain)
 *     city:traffic    uzak trafik uğultusu (kahverengi gürültü + alçak üçgen)
 *     city:drone      şehir drone'u: sirensiz, yavaş vuruşlu alçak akor
 *     city:rain_metal metal yüzeye yağmur: parlak gürültü + davul + rastgele "tık"lar
 *     city:neon_buzz  neon vızıltısı: 100/200 Hz şebeke uğultusu + ince cızırtı
 * `BED_NODES`: yatak başına en çok düğüm (audioCity bütçe hesabı; testle doğrulanır).
 */
const BED_DUR = 4.8;
const BED_FADE = 0.8;

export const BED_NODES = Object.freeze({
  'city:traffic': 3,
  'city:drone': 3,
  'city:rain_metal': 5,
  'city:neon_buzz': 3,
});
export const BED_DURATION = BED_DUR;
export const BED_CROSSFADE = BED_FADE;

const bed = (extra) => Object.assign({ dur: BED_DUR, fadeIn: BED_FADE, fadeOut: BED_FADE }, extra);

export const DIM_SOUNDS = [
  ['dim:charge', (s) => {
    s.tone('sine', 90, 480, 0, 0.8, 0.22, 0.12);
    s.tone('sawtooth', 60, 240, 0, 0.8, 0.07, 0.15, { filter: ['lowpass', 900, 1.2] });
    s.noise(0, 0.8, 0.1, 'bandpass', 400, 2400, 1.4, 0.2);
    s.tone('sine', 1200, 1800, 0.45, 0.35, 0.07, 0.05);
    s.tone('sine', 1800, 2700, 0.55, 0.25, 0.05, 0.04);
  }, { p: 4, r: Infinity, wet: 0.25, gap: 0.3 }],
  ['dim:whoosh', (s) => {
    s.noise(0, 0.7, 0.3, 'bandpass', 250, 3800, 1.2, 0.12);
    s.tone('sine', 260, 70, 0, 0.7, 0.2, 0.05);
    s.tone('triangle', 1500, 400, 0.05, 0.6, 0.06, 0.08);
    s.noise(0.35, 0.35, 0.12, 'highpass', 3000, 7000, 0.8, 0.1);
  }, { p: 4, r: Infinity, wet: 0.3, gap: 0.3 }],
  ['dim:arrive', (s) => {
    s.tone('sine', 70, 40, 0, 0.55, 0.45, 0.006);
    [523.25, 659.25, 783.99].forEach((f, i) => {
      s.tone('triangle', f, f, 0.12 + i * 0.15, 1.8, 0.1 - i * 0.012, 0.03);
      s.tone('sine', f * 2.005, f * 2.005, 0.12 + i * 0.15, 1.4, 0.035, 0.03);
    });
    s.noise(0.15, 1.6, 0.05, 'highpass', 5000, 9000, 0.7, 0.4);
    s.tone('sine', 1046.5, 1046.5, 0.55, 1.6, 0.04, 0.2, { vib: { hz: 5, cents: 8 } });
  }, { p: 5, r: Infinity, wet: 0.6, gap: 0.5 }],
  ['dim:gateOpen', (s) => {
    s.tone('sine', 110, 220, 0, 1.2, 0.3, 0.4);
    s.tone('sawtooth', 55, 110, 0, 1.2, 0.06, 0.4, { filter: ['lowpass', 700, 1] });
    s.noise(0, 1.1, 0.2, 'bandpass', 600, 2200, 1.1, 0.35);
    s.tone('sine', 1760, 1760, 0.6, 0.5, 0.06, 0.01);
    s.tone('sine', 2349.3, 2349.3, 0.75, 0.5, 0.05, 0.01);
  }, { p: 4, r: 60, wet: 0.35, gap: 0.5 }],
  ['dim:gateHum', (s) => {
    s.tone('sine', 130, 132, 0, 0.7, 0.06, 0.15);
    s.tone('sawtooth', 65, 66, 0, 0.7, 0.03, 0.15, { filter: ['lowpass', 300, 1] });
    s.noise(0, 0.6, 0.02, 'bandpass', 900, 900, 3, 0.15);
  }, { p: 1, r: 30, gap: 0.6 }],
  ['dim:gateClose', (s) => {
    s.tone('sine', 300, 60, 0, 0.6, 0.3, 0.01);
    s.noise(0, 0.5, 0.2, 'lowpass', 1500, 200, 1, 0.01, 'brown');
    s.tone('triangle', 800, 300, 0, 0.3, 0.06, 0.005);
  }, { p: 3, r: 60, wet: 0.2, gap: 0.5 }],
  ['dim:terminal', (s) => {
    s.tone('sine', 880, 1320, 0, 0.14, 0.12, 0.004);
    s.tone('sine', 1320, 1760, 0.12, 0.18, 0.1, 0.004);
    s.noise(0, 0.03, 0.05, 'bandpass', 3000, 3000, 2, 0.001);
  }, { p: 3, r: 24, wet: 0.2, gap: 0.2 }],

  // ---- şehir ambiyans yatakları ----
  ['city:traffic', (s) => {
    s.sustain(bed({ src: 'noise', type: 'brown', filter: ['lowpass', 200, 0.8], f0: 200, vol: 0.22 }));
    s.sustain(bed({ src: 'noise', type: 'brown', filter: ['bandpass', 480, 0.7], f0: 480, f1: 620, vol: 0.05 }));
    s.sustain(bed({ src: 'osc', type: 'triangle', f0: 46, f1: 50, vol: 0.05 }));
  }, { p: 1, r: Infinity, wet: 0.1 }],
  ['city:drone', (s) => {
    s.sustain(bed({ src: 'osc', type: 'sine', f0: 82.41, vol: 0.05 }));
    s.sustain(bed({ src: 'osc', type: 'sine', f0: 82.9, vol: 0.045 }));
    s.sustain(bed({ src: 'osc', type: 'sine', f0: 123.47, vol: 0.03 }));
  }, { p: 1, r: Infinity, wet: 0.25 }],
  ['city:rain_metal', (s) => {
    s.sustain(bed({ src: 'noise', type: 'white', filter: ['bandpass', 3400, 0.7], f0: 3400, vol: 0.07 }));
    s.sustain(bed({ src: 'noise', type: 'brown', filter: ['lowpass', 900, 0.8], f0: 900, vol: 0.05 }));
    for (let i = 0; i < 3; i++) s.noise(1 + s.rr(0, 2.8), 0.035, 0.05, 'bandpass', s.rr(2000, 4200), s.rr(1400, 2400), 2.4, 0.002);
  }, { p: 1, r: Infinity, wet: 0.12 }],
  ['city:neon_buzz', (s) => {
    s.sustain(bed({ src: 'osc', type: 'sawtooth', f0: 100, vol: 0.03, filter: ['lowpass', 380, 1] }));
    s.sustain(bed({ src: 'noise', type: 'white', filter: ['highpass', 5200, 0.7], f0: 5200, vol: 0.009 }));
    s.noise(0.8 + s.rr(0, 3), 0.02, 0.03, 'highpass', 5500, 5500, 0.7, 0.001);
  }, { p: 1, r: Infinity, wet: 0.08 }],
];
