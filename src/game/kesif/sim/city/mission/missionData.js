/*
 * KEŞİF sim/city/mission — ORTAK SABİTLER VE METİN TABLOLARI (discovery_missions, Neon Meridyen Faz 4). SAF, es2020, aile dostu, özgün adlar.
 *
 * Tüm kullanıcı metni Türkçe; şiddet/suç/korku yok. `missionSafe.test.js` bu dosyadaki ve mission/* altındaki her dizgeyi citySafe tarayıcısından geçirir.
 *
 *   TAG                       subHash alt akış etiketleri (mission paketi; benzersiz)
 *   COUNTS                    {chips:240, graffiti:90, rooms:30, terminals:16, races:8}
 *   KREDI                     keşif/iş ödülleri (şehir-yerel Kredi; jetona çevrilmez)
 *   STORY_FRAGMENTS           24 hikâye parçası (her 10 çipte biri)
 *   DISCOVERY_TEXT            keşif metinleri (ipucu, duyuru)
 *   ROOM_NAMES                gizli oda adları (tür başına)
 *   fmtTime(sec) → 'm:ss.d'   süre biçimi        fmtDist(m) → '420 m' | '1,2 km'
 */
import { GRAFFITI_COLORS, GRAFFITI_STENCILS } from '../cityNames.js';

export const TAG = Object.freeze({
  HIDDEN: 0x4d495301, JOB_A: 0x4d495302, JOB_B: 0x4d495303, JOB_TIER: 0x4d495304, JOB_NAME: 0x4d495305, TAXI: 0x4d495306, POD: 0x4d495307,
  FIX: 0x4d495308, PASSENGER: 0x4d495309, CHIP_ORDER: 0x4d49530a, TIP: 0x4d49530b,
});

export const COUNTS = Object.freeze({
  chips: 240, graffiti: 90, rooms: 30, terminals: 16, races: 8, roofRoutes: 8,
});

/** Şehir-yerel Kredi ödülleri (jetona ASLA çevrilmez; jeton yalnız cityEvents.NEON_CLAIMS). */
export const KREDI = Object.freeze({
  chip: 5, chipStory: 25, graffiti: 15, room: 50, roof: 60, terminal: 10, set: 60, photo: 30, easter: 150, quest: 40, race: [0, 40, 70, 120],
});

/** Kurye/iş bölgesi başına sınırlar. */
export const JOB_LIMITS = Object.freeze({ offers: 3, decayWindow: 600, decayStep: 0.15, decayFloor: 0.4, logMax: 8 });

export const STORY_FRAGMENTS = Object.freeze([
  'Meridyen\'in ilk sokak lambasını bir çocuk ve küçük bir robot birlikte yaktı.',
  'Robotun adı Çıkrık\'tı. Işık yanınca şehir ona "hoş geldin" dedi.',
  'Neon tüpler sokakları boyadı; her renk bir mahalleye ev oldu.',
  'Gece Pazarı\'nın ilk tezgâhı bir simit sepetiyle kuruldu.',
  'Konteynerlerden evler yapıldı; çatılar komşuları birbirine bağladı.',
  'Liman\'da ilk kurye dronları paketleri su üstünden taşıdı.',
  'Teknoloji Parkı\'nda herkes soru sormayı öğrendi; cevaplar sonradan geldi.',
  'Tepe Konutları\'nda ilk bahçe bir çatı terasında filizlendi.',
  'Metro hatları şehrin altında gizli bir nehir gibi aktı.',
  'Kanalizasyon duvarlarına minik ışıklar bırakıldı; kimse yolunu kaybetmesin diye.',
  'Her mahallenin bir ses plağı vardı. Plaklar birleşince şehir şarkı söyledi.',
  'Yarışlar bir oyun olarak doğdu: kazanan yoktu, güzel bir tur vardı.',
  'Grafiti duvarları çocukların fikriyle doldu: yıldız, roket, bulut.',
  'Kasa, şehrin en değerli şeyini saklamak için yapıldı: ilk ışığı.',
  'Işık, kimlik kartıyla değil merakla bulunur derlerdi.',
  'Gri kart, Turuncu kart, Mor kart: üç anahtar, üç sır.',
  'Çıkrık her gece bir vida sıkardı; şehir de bir adım yaklaşırdı.',
  'Yağmur gelince neonlar yola yansır; şehir iki kat parlar.',
  'Bir gün sınırın ötesinden bir yolcu geldi: eski diyarın ışığını arıyordu.',
  'Yolcu ana diyarın dağlarında bir portal açmıştı; şehir ona kapı oldu.',
  'Kapı Meydanı\'ndaki terminal o ilk geçişin anısıdır.',
  'Terminaller birbirini tanır; birine dokunan hepsine selam gönderir.',
  'Diyar Işığı iki dünyayı birbirine bağlayan küçük bir kıvılcımdır.',
  'Sen de çip topladın, sokak boyadın; şehir seni artık tanıyor. Hoş geldin!',
]);

export const DISCOVERY_TEXT = Object.freeze({
  chipFound: 'Veri çipi bulundu',
  chipNear: 'Yakında bir veri çipi var',
  chipScan: 'Tarayıcı: veri çipi',
  roomFound: 'Gizli oda bulundu',
  roomNear: 'Duvarlarda bir şey saklı gibi',
  graffitiAsk: 'Boya yapmak için etkileşime geç',
  graffitiHold: 'Boyuyor…',
  graffitiDone: 'Grafiti tamam',
  graffitiAway: 'Duvardan uzaklaştın; boya yarım kaldı.',
  graffitiAlready: 'Bu duvar zaten boyalı.',
  storyTitle: 'Meridyen Günlüğü',
  setDone: 'Koleksiyon tamamlandı',
  easterTitle: 'Diyar Işığı',
  easterLine: 'Kasadaki küçük ışık seni selamladı. İki dünya arasında yeni bir kıvılcım doğdu.',
  terminalFound: 'Boyut Terminali bulundu',
});

/** Gizli oda adı (iç mekân türüne göre). */
export const ROOM_NAMES = Object.freeze({
  kitap_kafe: 'Kitaplı Gizli Oda',
  sanat_studyosu: 'Gizli Sergi Odası',
  hacker_odasi: 'Gizli Çalışma Köşesi',
  genel: 'Gizli Oda',
});

/** Süre biçimi: 83.4 → '1:23.4'. */
export function fmtTime(sec) {
  const s = Number.isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  const whole = Math.floor(r);
  const tenth = Math.floor((r - whole) * 10 + 1e-9);
  return m + ':' + (whole < 10 ? '0' : '') + whole + '.' + tenth;
}

/** Süre (tamsayı saniye) → 'm:ss'. */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

export function fmtDist(m) {
  const v = Number.isFinite(m) && m > 0 ? m : 0;
  if (v < 1000) return Math.round(v) + ' m';
  return (Math.round(v / 100) / 10).toString().replace('.', ',') + ' km';
}

export function stencilName(i) {
  return GRAFFITI_STENCILS[((i % GRAFFITI_STENCILS.length) + GRAFFITI_STENCILS.length) % GRAFFITI_STENCILS.length];
}

export function colorName(i) {
  return GRAFFITI_COLORS[((i % GRAFFITI_COLORS.length) + GRAFFITI_COLORS.length) % GRAFFITI_COLORS.length];
}

/** Madalya adları: 0 yok, 1 bronz, 2 gümüş, 3 altın. */
export const MEDAL_NAMES = Object.freeze(['Madalya yok', 'Bronz', 'Gümüş', 'Altın']);
