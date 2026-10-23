/*
 * KEŞİF sim/city/ped — YAYA VERİSİ (Neon Meridyen Faz 4, paket crowd_ai). SAF: three/DOM/Math.random/Date.now yok, worker-güvenli, es2020.
 * Sözleşme §10 (yayalar), §17 (bütçeler), design_city §8 (neon tonu). Aile dostu: şiddet/korku/suç teması yok; yayalar asla zarar görmez.
 *
 *   PED_TYPE, PED_TYPE_KEYS, TYPE_DEF[type]       halk cocuk turist kurye sporcu yasli (robotlar bu pakette YOK)
 *   ANIM                                          animasyon kodları (çizici gölgelendirici ile AYNI sayılar)
 *   ST                                            davranış durumları
 *   ROLE                                          rol: gezinti, işe/metroya gidiş, alışveriş, kafe, kulüp, turist, kurye, koşu
 *   TIER_CAPS[quality]                            {total, near, mid, nearR, midR, spawnMin, spawnMax, despawnR}
 *   densityAt(district, phase) → 0..1             bölge × gün fazı yoğunluğu (gece pazarı geceleri, merkez yoğun saatlerde …)
 *   rushAt(phase) → 0..1                          metro yoğun saati (şafak + gün batımı)
 *   roleWeights(district, phase, rain, out)       rol ağırlıkları (6 sayı: ROLE sırası)
 *   rollLook(seed, id, type, district, out) → look   görünüm (silüet, kıyafet, saç, şapka, aksesuar, renkler); belirlenimci
 *   lookHash(look) → u32                          özet
 *   unpackRgb(hex, out) → [r,g,b] 0..1 sRGB
 *   SKIN_HEX, HAIR_HEX, ACCENT_HEX, UMBRELLA_HEX
 *   Faz ekseni: motor fazı (0 gün doğumu, 0,25 öğle, 0,5 gün batımı, 0,75 gece yarısı).
 */
import { subHash } from '../../dim/dimensions.js';

export const PED_TYPE = Object.freeze({
  halk: 0, cocuk: 1, turist: 2, kurye: 3, sporcu: 4, yasli: 5,
});
export const PED_TYPE_KEYS = Object.freeze(['halk', 'cocuk', 'turist', 'kurye', 'sporcu', 'yasli']);

/** Tür tanımı: hız (m/s) aralığı, boy ölçeği aralığı (1 = 1,75 m), baş büyüklüğü, ağırlık. */
export const TYPE_DEF = Object.freeze([
  Object.freeze({
    key: 'halk', speed: [1.15, 1.6], h: [0.9, 1.07], head: 1.0, weight: 62,
  }),
  Object.freeze({
    key: 'cocuk', speed: [1.3, 1.75], h: [0.58, 0.74], head: 1.22, weight: 6,
  }),
  Object.freeze({
    key: 'turist', speed: [0.85, 1.2], h: [0.9, 1.06], head: 1.0, weight: 10,
  }),
  Object.freeze({
    key: 'kurye', speed: [1.9, 2.4], h: [0.92, 1.05], head: 1.0, weight: 8,
  }),
  Object.freeze({
    key: 'sporcu', speed: [2.7, 3.3], h: [0.94, 1.08], head: 0.98, weight: 6,
  }),
  Object.freeze({
    key: 'yasli', speed: [0.75, 1.0], h: [0.86, 0.98], head: 1.02, weight: 8,
  }),
]);

/** Animasyon kodları (render/city/crowdShaders.js ile aynı). */
export const ANIM = Object.freeze({
  IDLE: 0, WALK: 1, RUN: 2, PHONE: 3, CHAT: 4, DANCE: 5, WAVE: 6, HOP: 7, PHOTO: 8, POCKET: 9, QUEUE: 10, UMBRELLA: 11, SIT: 12,
});

/** Davranış durumları. */
export const ST = Object.freeze({
  WALK: 0, WAIT: 1, CROSS: 2, IDLE: 3, CHAT: 4, DANCE: 5, QUEUE: 6, SHELTER: 7, LOOK: 8, ENTER: 9, EMERGE: 10, STEP: 11,
});

export const ROLE = Object.freeze({
  STROLL: 0, COMMUTE: 1, SHOP: 2, CAFE: 3, CLUB: 4, TOUR: 5,
});
export const ROLE_COUNT = 6;

/** Kalite kademesi → kademe sayıları. total = yaya tavanı; near ≤ tam animasyon; mid ≤ ucuz animasyon; kalan = uzak afiş. */
export const TIER_CAPS = Object.freeze({
  high: Object.freeze({
    total: 60, near: 22, mid: 24, nearR: 26, midR: 50, spawnMin: 18, spawnMax: 58, despawnR: 70,
  }),
  medium: Object.freeze({
    total: 40, near: 14, mid: 18, nearR: 22, midR: 44, spawnMin: 16, spawnMax: 50, despawnR: 60,
  }),
  low: Object.freeze({
    total: 24, near: 7, mid: 12, nearR: 18, midR: 36, spawnMin: 14, spawnMax: 42, despawnR: 50,
  }),
});

/* ------------------------------------------------------------------------------------------------
 * Çizelge: bölge × faz yoğunluğu
 * ---------------------------------------------------------------------------------------------- */
const SCHEDULE = Object.freeze({
  merkez: [[0, 0.55], [0.05, 0.95], [0.15, 0.8], [0.3, 0.7], [0.42, 0.85], [0.5, 0.95], [0.6, 0.72], [0.75, 0.42], [0.9, 0.36], [1, 0.55]],
  gece_pazari: [[0, 0.2], [0.1, 0.24], [0.25, 0.42], [0.4, 0.62], [0.5, 0.9], [0.6, 1.0], [0.75, 0.96], [0.9, 0.62], [1, 0.2]],
  konteyner: [[0, 0.5], [0.08, 0.7], [0.3, 0.6], [0.5, 0.55], [0.6, 0.42], [0.8, 0.26], [1, 0.5]],
  liman: [[0, 0.45], [0.1, 0.7], [0.3, 0.6], [0.5, 0.45], [0.65, 0.25], [0.85, 0.2], [1, 0.45]],
  teknoloji: [[0, 0.3], [0.08, 0.8], [0.25, 0.65], [0.45, 0.85], [0.55, 0.55], [0.75, 0.22], [1, 0.3]],
  tepe: [[0, 0.3], [0.1, 0.55], [0.3, 0.5], [0.5, 0.62], [0.62, 0.55], [0.8, 0.3], [1, 0.3]],
});
const DEFAULT_SCHED = SCHEDULE.merkez;

function lerpKeys(keys, p) {
  const q = p - Math.floor(p);
  for (let i = 1; i < keys.length; i++) {
    if (q <= keys[i][0]) {
      const a = keys[i - 1];
      const b = keys[i];
      return a[1] + ((b[1] - a[1]) * (q - a[0])) / (b[0] - a[0] || 1);
    }
  }
  return keys[keys.length - 1][1];
}

export function densityAt(district, phase) {
  const keys = SCHEDULE[district] || DEFAULT_SCHED;
  const p = Number.isFinite(phase) ? phase : 0.25;
  return lerpKeys(keys, p);
}

const RUSH_KEYS = [[0, 0.7], [0.04, 1], [0.12, 0.4], [0.3, 0], [0.4, 0.2], [0.48, 1], [0.56, 0.6], [0.66, 0.1], [0.8, 0], [0.94, 0.3], [1, 0.7]];
/** Metro yoğun saati: şafak ve gün batımı. */
export function rushAt(phase) {
  return lerpKeys(RUSH_KEYS, Number.isFinite(phase) ? phase : 0.25);
}

/** Gece mi (alacakaranlıktan sabaha)? */
export function isNightPhase(phase) {
  const p = phase - Math.floor(phase);
  return p >= 0.52 || p < 0.03;
}

/** Rol ağırlıkları [gezinti, işe/metro, alışveriş, kafe, kulüp, turist] — out (6 sayı) doldurulur, toplam 1'e normalize edilmez (çağıran toplar). */
export function roleWeights(district, phase, rain, out) {
  const night = isNightPhase(phase) ? 1 : 0;
  const rush = rushAt(phase);
  const market = district === 'gece_pazari';
  out[ROLE.STROLL] = 0.34;
  out[ROLE.COMMUTE] = 0.1 + 0.55 * rush;
  out[ROLE.SHOP] = market ? 0.3 + 0.35 * night : district === 'merkez' || district === 'teknoloji' ? 0.18 : 0.12;
  out[ROLE.CAFE] = 0.1 + (district === 'tepe' || district === 'teknoloji' ? 0.1 : 0) + (rain > 0.4 ? 0.06 : 0);
  out[ROLE.CLUB] = night && (market || district === 'merkez') ? 0.13 : 0.01;
  out[ROLE.TOUR] = district === 'merkez' || market ? 0.08 + 0.07 * (1 - night) : 0.02;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Görünüm
 * ---------------------------------------------------------------------------------------------- */
export const SKIN_HEX = Object.freeze([0xf3cfb3, 0xe9b78e, 0xd49a6a, 0xb97b4f, 0x95603a, 0x6f452b, 0x4b2e1e, 0xf0c2a0]);
export const HAIR_HEX = Object.freeze([0x15110f, 0x2a1d14, 0x5a3a22, 0x7a4a2a, 0xc9a064, 0xa8512a, 0x9a9a9a, 0x23d3c4, 0xe04c9a, 0x7b4be0]);
export const ACCENT_HEX = Object.freeze([0x22e6ff, 0xff3ea8, 0xffb02e, 0xb6ff3a, 0x9a6bff, 0xe8f4ff]);
export const UMBRELLA_HEX = Object.freeze([0x1f2a44, 0xc43a5a, 0x1f8f8a, 0xe8a32d, 0x5a3fa0, 0x2a2f36, 0x3a7bd5, 0xd9d4c8]);

const TOPS = Object.freeze({
  merkez: [0x23272f, 0x1d2a44, 0xd8dde6, 0x3a3f4b, 0x14424a, 0x4a1e32, 0x2d3a52],
  gece_pazari: [0xd69a2d, 0xa63d2f, 0x1f8f8a, 0x6a3fa0, 0xe9dcc3, 0xe8742c, 0xd9468f, 0x2a2f45],
  konteyner: [0xf26a21, 0xb6d334, 0xf2c230, 0x2f4f7a, 0x5d6672, 0xd9d4c8, 0x2a7f62],
  liman: [0xf0d13a, 0x5d6672, 0x1e3350, 0xd9d4c8, 0xe8742c, 0x3f4650],
  teknoloji: [0xeef2f6, 0xbfd3e6, 0x9be3ff, 0x9ee0c0, 0x3a3f4b, 0xc9c4f2, 0xf2f0e6],
  tepe: [0x6b7a3e, 0xc0673d, 0xe8dec6, 0x6c90b5, 0x7a5236, 0xd8a53a, 0x8e4a5a],
});
const BOTTOMS = Object.freeze({
  merkez: [0x14161b, 0x24344f, 0x4a4f5a, 0x8f8470, 0x2b2d36],
  gece_pazari: [0x1a1a22, 0x2b2f6b, 0x56602f, 0x3a2f2a, 0x24344f],
  konteyner: [0x24344f, 0x3f4650, 0x14161b, 0x5a4a36],
  liman: [0x1e3350, 0x3f4650, 0x14161b, 0x5d6672],
  teknoloji: [0x3a3f4b, 0xcfd6de, 0x24344f, 0x14161b, 0x7d8794],
  tepe: [0x3f4a5a, 0x7a6a50, 0x2b2d36, 0x5a6a46],
});
const ACCENT_BIAS = Object.freeze({
  merkez: [0, 0, 1, 1, 5, 4],
  gece_pazari: [2, 2, 1, 1, 3, 4],
  konteyner: [3, 3, 2, 0, 2, 3],
  liman: [2, 2, 0, 2, 0, 5],
  teknoloji: [0, 0, 3, 3, 4, 5],
  tepe: [2, 2, 1, 3, 2, 5],
});

function pick(arr, h) {
  return arr[(h >>> 0) % arr.length];
}

function range(h, a, b) {
  return a + ((h >>> 0) / 4294967296) * (b - a);
}

const TAGS = Object.freeze({
  type: 0xe001, body: 0xe002, skin: 0xe003, hair: 0xe004, hairC: 0xe005, hat: 0xe006, acc: 0xe007, top: 0xe008, cTop: 0xe009, cBot: 0xe00a, cAcc: 0xe00b,
  umb: 0xe00c, speed: 0xe00d, shape: 0xe00e, glow: 0xe00f, topStyle: 0xe010, friendly: 0xe011, lat: 0xe012,
});

/** Tür seçimi (ağırlıklı). h: u32. */
export function pickType(h) {
  let tot = 0;
  for (let i = 0; i < TYPE_DEF.length; i++) tot += TYPE_DEF[i].weight;
  let x = ((h >>> 0) / 4294967296) * tot;
  for (let i = 0; i < TYPE_DEF.length; i++) {
    if (x < TYPE_DEF[i].weight) return i;
    x -= TYPE_DEF[i].weight;
  }
  return 0;
}

export function newLook() {
  return {
    type: 0, h: 1, sh: 1, gi: 1, sp: 0, head: 1, skin: 0, hair: 0, hairC: 0, hat: 0, acc: 0, top: 0, cTop: 0, cBot: 0, cAcc: 0, cHair: 0, cUmb: 0,
    glow: 0.5, vmax: 1.3, friendly: false, latPref: 0.5, district: 'merkez',
  };
}

/**
 * Görünüm üretimi. seed + id + tür + bölge → look. Saç: 0 kısa 1 küt 2 uzun 3 topuz 4 kıvırcık 5 at kuyruğu 6 dazlak. Şapka: 0 yok 1 kep 2 bere 3 neon vizör 4 geniş kenar.
 * Aksesuar: 0 yok 1 sırt çantası 2 omuz çantası 3 kulaklık 4 paket (kurye) 5 kamera (turist) 6 baston (yaşlı). Üst: 0 tişört 1 ceket 2 kapüşon 3 uzun palto.
 */
export function rollLook(seed, id, type, district, out) {
  const L = out || newLook();
  const s = seed | 0;
  const i = id | 0;
  const td = TYPE_DEF[type] || TYPE_DEF[0];
  const dk = SCHEDULE[district] ? district : 'merkez';
  L.type = type;
  L.district = dk;
  L.h = range(subHash(s, i, TAGS.body), td.h[0], td.h[1]);
  L.sh = range(subHash(s, i, TAGS.body + 100), 0.92, 1.24);
  L.gi = range(subHash(s, i, TAGS.body + 200), 0.84, 1.26);
  L.sp = range(subHash(s, i, TAGS.shape), -1, 1);
  L.head = td.head * range(subHash(s, i, TAGS.shape + 50), 1.1, 1.24);
  L.skin = subHash(s, i, TAGS.skin) % SKIN_HEX.length;
  const hh = subHash(s, i, TAGS.hair);
  L.hair = hh % 7;
  const neonHair = (subHash(s, i, TAGS.hairC + 77) % 100) < (dk === 'gece_pazari' || dk === 'merkez' ? 13 : 4);
  L.hairC = neonHair ? 7 + (subHash(s, i, TAGS.hairC) % 3) : (subHash(s, i, TAGS.hairC) % 7);
  L.cHair = HAIR_HEX[L.hairC];
  const hatRoll = subHash(s, i, TAGS.hat) % 100;
  L.hat = hatRoll < 58 ? 0 : hatRoll < 70 ? 1 : hatRoll < 80 ? 2 : hatRoll < (dk === 'merkez' || dk === 'teknoloji' ? 92 : 88) ? 3 : 4;
  if (L.hair === 6 && L.hat === 3) L.hat = 0;
  const topStyle = subHash(s, i, TAGS.topStyle) % 4;
  L.top = topStyle;
  L.cTop = pick(TOPS[dk], subHash(s, i, TAGS.cTop));
  L.cBot = pick(BOTTOMS[dk], subHash(s, i, TAGS.cBot));
  L.cAcc = ACCENT_HEX[pick(ACCENT_BIAS[dk], subHash(s, i, TAGS.cAcc))];
  L.cUmb = UMBRELLA_HEX[subHash(s, i, TAGS.umb) % UMBRELLA_HEX.length];
  L.glow = range(subHash(s, i, TAGS.glow), 0.35, 1);
  const accRoll = subHash(s, i, TAGS.acc) % 100;
  let acc = accRoll < 52 ? 0 : accRoll < 66 ? 1 : accRoll < 80 ? 2 : 3;
  if (type === PED_TYPE.kurye) acc = 4;
  else if (type === PED_TYPE.turist) acc = accRoll < 70 ? 5 : 1;
  else if (type === PED_TYPE.yasli) acc = accRoll < 55 ? 6 : accRoll < 80 ? 0 : 2;
  else if (type === PED_TYPE.sporcu) acc = accRoll < 50 ? 3 : 0;
  else if (type === PED_TYPE.cocuk) acc = accRoll < 55 ? 1 : 0;
  L.acc = acc;
  if (type === PED_TYPE.cocuk) {
    L.hat = L.hat === 4 || L.hat === 3 ? 0 : L.hat;
    L.top = L.top === 3 ? 2 : L.top;
  }
  L.vmax = range(subHash(s, i, TAGS.speed), td.speed[0], td.speed[1]);
  L.friendly = (subHash(s, i, TAGS.friendly) % 100) < 14;
  L.latPref = range(subHash(s, i, TAGS.lat), 0.2, 0.9);
  return L;
}

export function lookHash(L) {
  let h = 2166136261 >>> 0;
  const mix = (v) => {
    h ^= (v | 0) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= ((v | 0) >>> 16) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  mix(L.type); mix(L.skin); mix(L.hair); mix(L.hairC); mix(L.hat); mix(L.acc); mix(L.top); mix(L.cTop); mix(L.cBot); mix(L.cAcc); mix(L.cUmb);
  mix(Math.round(L.h * 1000)); mix(Math.round(L.sh * 1000)); mix(Math.round(L.gi * 1000)); mix(Math.round(L.vmax * 1000));
  return h >>> 0;
}

const SRGB = new Float32Array(256);
for (let i = 0; i < 256; i++) SRGB[i] = i / 255;

/** 0xRRGGBB → [r,g,b] 0..1 (sRGB; çizici doğrusala çevirir). */
export function unpackRgb(hex, out) {
  const o = out || [0, 0, 0];
  o[0] = SRGB[(hex >> 16) & 255];
  o[1] = SRGB[(hex >> 8) & 255];
  o[2] = SRGB[hex & 255];
  return o;
}
