/*
 * KEŞİF ses — ARAÇ RADYOSU VERİSİ (Neon Meridyen Faz 3, paket vehicle_audio). Saf veri; WebAudio/DOM yok. Sözleşme §9, design_vehicles.md §6.
 *
 * 5 uydurma istasyon + Sessiz (cityNames.RADIO_STATIONS ile aynı sıra/kimlik; garaj `radio` 0..5 bu dizinin indeksidir). Müzik tamamen
 * prosedürel üretilir (audioRadio.js): her istasyonun tohumu, tempo (70–140 BPM), kip (gam), davul/bas/arp/ezgi kalıpları burada.
 * Gerçek şarkı, ses kaydı, sesli konuşma YOK; DJ satırları ve reklamlar yalnız YAZI bandı (ticker). Parça/sanatçı adları uydurmadır.
 * Aile dostu: tüm metinler citySafe taramasından geçer (testte denetlenir).
 *
 *   RADIO_STATIONS_DATA     dizi (6): {id,index,name,short,seed,bpm,root,scale,intervals,swing,...,silent}
 *   RADIO_SCALES            gam adı → aralıklar (yarım ses) — yalnız bu aralıklardaki notalar üretilir
 *   STEPS_PER_BAR (16)  TRACK_BARS (32)  STING_SECONDS (90)  TICKER_SECONDS (24)
 *   TITLE_ADJ / TITLE_NOUN / DJ_LINES / ARTISTS     metin tabloları
 */
import { RADIO_STATIONS } from './sim/city/cityNames.js';

export const STEPS_PER_BAR = 16;
export const TRACK_BARS = 32;
export const STING_SECONDS = 90;
export const TICKER_SECONDS = 24;

/** Gamlar (yarım ses aralıkları). 7 notalı gamlarda akor = d, d+2, d+4 derece; beşlilerde aynı derece yığını. */
export const RADIO_SCALES = Object.freeze({
  aeolian: Object.freeze([0, 2, 3, 5, 7, 8, 10]), // doğal minör
  dorian: Object.freeze([0, 2, 3, 5, 7, 9, 10]),
  lydian: Object.freeze([0, 2, 4, 6, 7, 9, 11]),
  majorPenta: Object.freeze([0, 2, 4, 7, 9]),
  minorPenta: Object.freeze([0, 3, 5, 7, 10]),
});

const fz = (o) => Object.freeze(o);
const pat = (s) => fz(s.split('').map((c) => (c === 'x' ? 1 : c === 'o' ? 0.45 : 0)));

/**
 * Davul/ritim kalıpları 16 adım (x = vuruş, o = hayalet). `lead`/`bassPat` 32 karakter (2 ölçü). prob = vuruşun gerçekleşme olasılığı.
 * Alan anlamı: kick/snare/hat/ohat kalıbı; bass kalıbı ve oktav; lead ritmi + yoğunluğu; arp yoğunluğu ve süresi; pad (akor tutma ölçü sayısı).
 */
const RAW = [
  {
    id: 'neonfm', seed: 0x4e454f46, bpm: 100, root: 57, scale: 'aeolian', swing: 0, genre: 'Sentez dalgası',
    progs: [[0, 5, 2, 6], [0, 6, 5, 6], [0, 3, 5, 4], [0, 5, 3, 6]],
    drums: {
      kick: 'x.......x.....x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '......x.......x.', hatProb: 0.9,
    },
    bass: { pat: 'x.xx.xx.x.xx.xx.x.xx.xx.x.xx.x.x', steps: 2, vel: 0.5, octave: -24 },
    lead: { rhythm: 'x...x.x.....x...x.x...x.x...x...', vel: 0.34, steps: 3, density: 0.9, wave: 'sawtooth', lp: 3200 },
    arp: { density: 0.55, steps: 1.4, vel: 0.2, wave: 'square', lp: 2600 },
    pad: { wave: 'triangle', vel: 0.17, bars: 1, notes: 3, lp: 1800 },
    bell: { density: 0.18 },
    sound: { bassWave: 'sawtooth', bassLp: 520, kickF: 130 },
  },
  {
    id: 'gece_taksisi', seed: 0x4745544b, bpm: 78, root: 50, scale: 'dorian', swing: 0.22, genre: 'Lo-fi',
    progs: [[1, 4, 0, 3], [0, 3, 1, 4], [1, 5, 0, 4], [3, 4, 1, 0]],
    drums: {
      kick: 'x.....o...x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '...............o', hatProb: 0.78,
    },
    bass: { pat: 'x.....x.x.....x.x......x.x.....x', steps: 3, vel: 0.46, octave: -24 },
    lead: { rhythm: '..x.......x.....x.....x.......x.', vel: 0.26, steps: 4, density: 0.6, wave: 'triangle', lp: 2200 },
    arp: { density: 0.4, steps: 2.5, vel: 0.17, wave: 'triangle', lp: 1800 },
    pad: { wave: 'sine', vel: 0.2, bars: 2, notes: 3, lp: 1400 },
    bell: { density: 0.28 },
    sound: { bassWave: 'triangle', bassLp: 420, kickF: 100 },
  },
  {
    id: 'hiz_hatti', seed: 0x48495a48, bpm: 140, root: 52, scale: 'aeolian', swing: 0, genre: 'Dört vuruş',
    progs: [[0, 0, 5, 6], [0, 5, 2, 6], [0, 3, 0, 6], [0, 6, 5, 4]],
    drums: {
      kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..x...x...x...x.', hatProb: 0.95,
    },
    bass: { pat: 'x.xxx.xxx.xxx.xxx.xxx.xxx.xxx.xx', steps: 1, vel: 0.46, octave: -24 },
    lead: { rhythm: 'x.x.x...x.x.x...x.x.x...x.x.xx..', vel: 0.3, steps: 1.5, density: 0.95, wave: 'sawtooth', lp: 4200 },
    arp: { density: 0.75, steps: 1, vel: 0.17, wave: 'square', lp: 3400 },
    pad: { wave: 'sawtooth', vel: 0.08, bars: 1, notes: 2, lp: 1300 },
    bell: { density: 0.08 },
    sound: { bassWave: 'sawtooth', bassLp: 700, kickF: 150 },
  },
  {
    id: 'pazar_sokagi', seed: 0x50415a53, bpm: 112, root: 60, scale: 'majorPenta', swing: 0.12, genre: 'Elektro funk',
    progs: [[0, 2, 3, 1], [0, 3, 1, 4], [0, 1, 2, 3], [2, 0, 3, 1]],
    drums: {
      kick: 'x..x..x...x..x..', snare: '....x..o....x..x', hat: 'x.xxx.xxx.xxx.xx', ohat: '..x...x...x...x.', hatProb: 0.85,
    },
    bass: { pat: 'x..xx.x.x..xx.x.x.xx..x.x..x.xx.', steps: 1.2, vel: 0.5, octave: -12 },
    lead: { rhythm: 'x.xx..x...x.x..xx..x.x..x.xx..x.', vel: 0.3, steps: 1, density: 0.85, wave: 'square', lp: 3000 },
    arp: { density: 0.5, steps: 0.9, vel: 0.15, wave: 'triangle', lp: 2800 },
    pad: { wave: 'square', vel: 0.07, bars: 1, notes: 2, lp: 1500, stab: true },
    bell: { density: 0.12 },
    sound: { bassWave: 'square', bassLp: 640, kickF: 125 },
  },
  {
    id: 'yildiz_ambient', seed: 0x59494c44, bpm: 70, root: 53, scale: 'lydian', swing: 0, genre: 'Ambient', silentDrums: true,
    progs: [[0, 3, 4, 1], [0, 4, 3, 5], [3, 0, 4, 1], [0, 2, 3, 4]],
    drums: null,
    bass: { pat: 'x...............................', steps: 14, vel: 0.34, octave: -24 },
    lead: { rhythm: '........x...............x.......', vel: 0.18, steps: 6, density: 0.7, wave: 'sine', lp: 2600 },
    arp: { density: 0.22, steps: 4, vel: 0.12, wave: 'sine', lp: 2200 },
    pad: { wave: 'triangle', vel: 0.22, bars: 2, notes: 3, lp: 1200 },
    bell: { density: 0.34 },
    sound: { bassWave: 'sine', bassLp: 300, kickF: 100 },
  },
];

function build(raw, i) {
  const meta = RADIO_STATIONS.find((s) => s.id === raw.id);
  const d = raw.drums;
  return fz({
    id: raw.id,
    index: i,
    name: meta ? meta.name : raw.id,
    genre: raw.genre,
    seed: raw.seed | 0,
    bpm: raw.bpm,
    root: raw.root,
    scale: raw.scale,
    intervals: RADIO_SCALES[raw.scale],
    swing: raw.swing,
    silent: false,
    progs: fz(raw.progs.map((p) => fz(p.slice()))),
    drums: d ? fz({
      kick: pat(d.kick), snare: pat(d.snare), hat: pat(d.hat), ohat: pat(d.ohat), hatProb: d.hatProb,
    }) : null,
    bass: fz({
      pat: pat(raw.bass.pat), steps: raw.bass.steps, vel: raw.bass.vel, octave: raw.bass.octave,
    }),
    lead: fz({
      rhythm: pat(raw.lead.rhythm), vel: raw.lead.vel, steps: raw.lead.steps, density: raw.lead.density, wave: raw.lead.wave, lp: raw.lead.lp,
    }),
    arp: fz(Object.assign({}, raw.arp)),
    pad: fz(Object.assign({}, raw.pad)),
    bell: fz(Object.assign({}, raw.bell)),
    sound: fz(Object.assign({}, raw.sound)),
  });
}

const SILENT = fz({
  id: 'sessiz', index: 5, name: 'Sessiz', genre: '', seed: 0, bpm: 0, root: 0, scale: '', intervals: fz([]), swing: 0, silent: true,
});

export const RADIO_STATIONS_DATA = fz(RAW.map(build).concat([SILENT]));

/* ------------------------------------------------------------------------------------------------
 * Metin tabloları (yalnız yazı bandı; sesli konuşma yok)
 * ---------------------------------------------------------------------------------------------- */
export const TITLE_ADJ = fz([
  'Parlak', 'Uzak', 'Yumuşak', 'Sessiz', 'Gümüş', 'Turuncu', 'Neşeli', 'Kuzey', 'Altın', 'Hızlı', 'Tatlı', 'Geniş',
]);
export const TITLE_NOUN = fz([
  'Işıklar', 'Cadde', 'Köprü', 'Rüzgâr', 'Liman', 'Dalga', 'Kule', 'Yol', 'Bulut', 'Sokak', 'Gökyüzü', 'Pencere', 'Saat', 'Durak',
]);

export const ARTISTS = fz({
  neonfm: fz(['Parlak Devre', 'Camgöbeği Hattı', 'Elektrik Ormanı', 'Gece Röleleri', 'Kıvılcım Kulübü', 'Neon Kediler']),
  gece_taksisi: fz(['Sessiz Taksi', 'Pencere Yağmuru', 'Kuzey Çaycısı', 'Yumuşak Kablo', 'Uykulu Anten', 'Durak Defteri']),
  hiz_hatti: fz(['Turbo Kirpi', 'Çizgi Çizgi', 'Hız Duvarı', 'Zıpkın Pili', 'Kırmızı Lamba', 'Gaz Pedalı']),
  pazar_sokagi: fz(['Tezgâh Takımı', 'Limon Funk', 'Sepet Grubu', 'Baharat Bandosu', 'Kiraz Kasası', 'Pazar Pırıl']),
  yildiz_ambient: fz(['Uzak Işıklar', 'Yıldız Tozu', 'Gökyüzü Defteri', 'Sessiz Kuyruklu', 'Ay Penceresi', 'Derin Nefes']),
});

/** DJ satırları (≤ 56 karakter): yazı bandında dönüşümlü gösterilir. */
export const DJ_LINES = fz({
  neonfm: fz([
    'Neon FM 88.8: ışıklar açık, yollar senin!',
    'Hoş geldin sürücü, kemerini bağlamayı unutma.',
    'Bu saatte şehir en güzel halinde.',
    'Yağmur damlaları ritme eşlik ediyor.',
    'Pencereden bak: neonlar da dans ediyor.',
    'Hepinize iyi yolculuklar, müzik hiç susmasın!',
    'Trafik kurallarına uyan herkese selam.',
  ]),
  gece_taksisi: fz([
    'Gece Taksisi: yavaş sür, güzel dinle.',
    'Şehir uyurken biz hâlâ buradayız.',
    'Bu parça yolun sonuna kadar eşlik eder.',
    'Bir fincan sıcak çay, bir de sakin müzik.',
    'Işıklar yeşile dönene kadar sakin kal.',
    'Taksi durağından herkese iyi geceler.',
  ]),
  hiz_hatti: fz([
    'Hız Hattı: ritim yüksek, direksiyon sağlam!',
    'Hazır mısın? Hız göstergesi seninle yarışıyor.',
    'Kırmızıda dur, yeşilde ritme kapıl!',
    'Çevreyolunda parlak bir tur seni bekliyor.',
    'Gaza bas ama kurallara uyarak!',
    'Nitro hazır, gülümsemen de hazır olsun.',
  ]),
  pazar_sokagi: fz([
    'Pazar Sokağı: funk ritmiyle çarşıya hoş geldin!',
    'Tezgâhlar kuruldu, müzik başladı.',
    'Bugünün önerisi: bir şeker, bir şarkı.',
    'Neşe bedava, ritim ücretsiz!',
    'Pazarda herkes dans ediyor, sen de katıl.',
    'Elma, armut ve bol ritim!',
  ]),
  yildiz_ambient: fz([
    'Yıldız Ambient: gökyüzüne bir göz at.',
    'Derin bir nefes al, yol uzun ve güzel.',
    'Yıldızlar kuleler arasından göz kırpıyor.',
    'Sakin ol, şehir seninle nefes alıyor.',
    'Uzayın sessizliğinden küçük bir melodi.',
    'Işıklar ve yıldızlar aynı gökte buluşur.',
  ]),
});
