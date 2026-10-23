/*
 * KEŞİF sim/city/ped — ROBOT VERİSİ (Neon Meridyen "yaratıkları"). Saf veri + küçük saf yardımcılar; three/DOM/rastgele yok.
 *
 * Aile dostu kural (sözleşme §2): robotlar ASLA hasar vermez. Temas yalnızca nazik bir itme + kısa "statik" yavaşlama ve kıvılcımdır;
 * her itme 0.6–0.9 sn önceden işaretlenir (model "attacking" + 'beamHit'/'blocked' izi). Dost robotlar (süpürge, kurye, yardım dronu) yaralanmaz;
 * itici/yaramaz robotlar (bekçi, hatabot, gözcü dron) hasar alınca parçalarına dağılır (0.6 sn) ve zararsız eşya/Kredi bırakır.
 *
 *   ROBOT_KEYS                 ASCII mobTypes anahtarları (id kuralı ^[0-9a-z]{1,10}$ ile uyumlu)
 *   ROBOT_DEFS[key]            ham tür tanımı (sim/mobTypes.js mob() ile sarılır; `robot` alanı davranış parametreleri)
 *   ROBOT_INFO[key]            {name, hint}  Türkçe ad / ipucu;  ROBOT_LINES  kısa konuşma satırları (≤60 kr)
 *   ROBOT_CAPS[tier]           kademe başına tavanlar {pushyNear,pushyWorld,friendNear,friendWorld}; robotCapsFor(tier)
 *   ROBOT_SPAWN                doğma mesafeleri/zamanlayıcıları;  robotSpawnFor(tier)
 *   ROBOT_LAYERS               katman → [[tür, ağırlık], …] (yüzey/kanalizasyon/metro/laboratuvar)
 *   robotKredi(def, seed, id, recent) → tamsayı   dağılınca verilen küçük Kredi (belirlenimci, art arda dağıtmada azalır)
 */
import { hash3f } from '../../rng.js';

export const ROBOT_KEYS = Object.freeze(['supurgebot', 'kuryebot', 'yardimdron', 'bekcirobot', 'hatabot', 'gozdrone']);

const drop = (item, min, max, chance) => Object.freeze({ item, min, max, chance });

/** Ham tanımlar. hostile YOK (hepsi pasif aileden: savaş müziği/tehdit sayacı tetiklenmez); damage 0; attack yok. */
export const ROBOT_DEFS = Object.freeze({
  supurgebot: Object.freeze({
    name: 'Süpürge Bot', family: 'robot', w: 0.8, h: 0.75, hp: 8, speed: 1.6, walkSpeed: 1.0, xp: 0, eyeHeight: 0.6,
    movement: 'yürü', drops: Object.freeze([]),
    robot: Object.freeze({ role: 'sweeper', group: 'friendly', immune: true, leash: 16, kredi: null, night: false }),
  }),
  kuryebot: Object.freeze({
    name: 'Kurye Bot', family: 'robot', w: 0.7, h: 1.0, hp: 10, speed: 2.4, walkSpeed: 1.6, xp: 0, eyeHeight: 0.85,
    movement: 'yürü', drops: Object.freeze([]),
    robot: Object.freeze({ role: 'courier', group: 'friendly', immune: true, leash: 22, leg: Object.freeze([10, 18]), kredi: null, night: false }),
  }),
  yardimdron: Object.freeze({
    name: 'Yardım Dron', family: 'robot', w: 0.6, h: 0.55, hp: 6, speed: 3.4, walkSpeed: 2.2, xp: 0, eyeHeight: 0.4,
    movement: 'uç', drops: Object.freeze([]),
    robot: Object.freeze({
      role: 'helper', group: 'friendly', immune: true, leash: 26, follow: 16, hover: Object.freeze([1.6, 2.6]), kredi: null, night: false,
    }),
  }),
  bekcirobot: Object.freeze({
    name: 'Bekçi Robot', family: 'robot', w: 0.9, h: 1.9, hp: 12, speed: 2.8, walkSpeed: 1.4, xp: 3, eyeHeight: 1.6,
    movement: 'yürü',
    drops: Object.freeze([
      drop('item:bakır_tel', 1, 2, 0.5), drop('item:devre_kartı', 1, 1, 0.3), drop('item:çelik_levha', 1, 1, 0.2), drop('item:pil_hücresi', 1, 1, 0.1),
    ]),
    robot: Object.freeze({
      role: 'guard', group: 'pushy', immune: false, leash: 3, watch: 9, warnR: 4.5, reach: 3.2, windup: 0.9, push: 3.4, slow: 0.7, cool: 3.5,
      kredi: Object.freeze([12, 25]), night: false,
    }),
  }),
  hatabot: Object.freeze({
    name: 'Hatabot', family: 'robot', w: 0.6, h: 0.9, hp: 4, speed: 4.2, walkSpeed: 2.4, xp: 2, eyeHeight: 0.75,
    movement: 'yürü',
    drops: Object.freeze([
      drop('item:bakır_tel', 1, 1, 0.5), drop('item:devre_kartı', 1, 1, 0.3), drop('item:pil_hücresi', 1, 1, 0.15),
    ]),
    robot: Object.freeze({
      role: 'glitch', group: 'pushy', immune: false, leash: 20, sense: 11, reach: 1.7, windup: 0.6, push: 4.0, slow: 0.6, cool: 5,
      kredi: Object.freeze([8, 18]), night: true,
    }),
  }),
  gozdrone: Object.freeze({
    name: 'Gözcü Dron', family: 'robot', w: 0.7, h: 0.7, hp: 6, speed: 3.5, walkSpeed: 2.0, xp: 2, eyeHeight: 0.5,
    movement: 'uç',
    drops: Object.freeze([
      drop('item:bakır_tel', 1, 1, 0.5), drop('item:devre_kartı', 1, 1, 0.3), drop('item:lazer_merceği', 1, 1, 0.08),
    ]),
    robot: Object.freeze({
      role: 'scanner', group: 'pushy', immune: false, leash: 10, sense: 10, windup: 0.8, slow: 0.5, range: 9, cool: 7, hover: Object.freeze([2.4, 3.4]),
      kredi: Object.freeze([10, 22]), night: false,
    }),
  }),
});

/** Türkçe ad ve kısa ipucu (HUD/Günlük/ekran okuyucu). */
export const ROBOT_INFO = Object.freeze({
  supurgebot: Object.freeze({ name: 'Süpürge Bot', hint: 'Kaldırımları pırıl pırıl tutar.' }),
  kuryebot: Object.freeze({ name: 'Kurye Bot', hint: 'Paketini sabırla taşır; yol verirsen teşekkür eder.' }),
  yardimdron: Object.freeze({ name: 'Yardım Dron', hint: 'Yanında uçup sana eşlik eder.' }),
  bekcirobot: Object.freeze({ name: 'Bekçi Robot', hint: 'Kapalı alanları nazikçe korur; yalnızca geri çekilmeni ister.' }),
  hatabot: Object.freeze({ name: 'Hatabot', hint: 'Kısa devre yapar, çarpınca hemen özür diler.' }),
  gozdrone: Object.freeze({ name: 'Gözcü Dron', hint: 'Etrafı tarar; ışığı seni kısa süre yavaşlatır.' }),
});

/** Konuşma satırları (≤60 karakter). Anahtar: `rol:durum`. */
export const ROBOT_LINES = Object.freeze({
  'sweeper:greet': 'Pırıl pırıl! Günaydın, gezgin.',
  'courier:greet': 'Paket yolda, yol verdiğin için sağ ol!',
  'helper:greet': 'Yanındayım, birlikte keşfedelim!',
  'guard:warn': 'Burası kapalı alan. Biraz geri çekilir misin?',
  'guard:done': 'Teşekkürler, iyi gezintiler!',
  'glitch:oops': 'Hata! Kısa devre yaptım, özür dilerim!',
  'scanner:scan': 'Tarama başlıyor, bir an yavaşla.',
  'scanner:done': 'Tarama tamam. Teşekkürler!',
});

/** Kademe tavanları. high/low sözleşme §10 (4 yakın/12 dünya, düşük 3/6); dost robotlar ayrı sayılır. */
export const ROBOT_CAPS = Object.freeze({
  high: Object.freeze({ pushyNear: 4, pushyWorld: 12, friendNear: 3, friendWorld: 8 }),
  medium: Object.freeze({ pushyNear: 4, pushyWorld: 9, friendNear: 3, friendWorld: 6 }),
  low: Object.freeze({ pushyNear: 3, pushyWorld: 6, friendNear: 2, friendWorld: 4 }),
});

export function robotCapsFor(tier) {
  return ROBOT_CAPS[tier] || ROBOT_CAPS.medium;
}

/** Doğma/yok olma ayarları (blok, sn). */
export const ROBOT_SPAWN = Object.freeze({
  minDist: 22, maxDist: 72, near: 32, coneDist: 30, despawn: 100, maxDy: 14, every: 0.5, coolKilled: 120, coolFar: 20, coolFail: 30,
  maxPerAttempt: 1, sweepEvery: 1,
});
const ROBOT_SPAWN_LOW = Object.freeze(Object.assign({}, ROBOT_SPAWN, { maxDist: 56, despawn: 80 }));

export function robotSpawnFor(tier) {
  return tier === 'low' ? ROBOT_SPAWN_LOW : ROBOT_SPAWN;
}

/** Katman → ağırlıklı tür listesi. Yüzey: Liman/Sanayi + Konteyner sokakları; yeraltı: kanalizasyon, metro, laboratuvar. */
export const ROBOT_LAYERS = Object.freeze({
  surface: Object.freeze([['supurgebot', 3], ['kuryebot', 3], ['yardimdron', 2], ['bekcirobot', 2], ['gozdrone', 2], ['hatabot', 2]]),
  sewer: Object.freeze([['supurgebot', 2], ['yardimdron', 1], ['bekcirobot', 1], ['gozdrone', 2], ['hatabot', 2]]),
  metro: Object.freeze([['supurgebot', 2], ['kuryebot', 1], ['bekcirobot', 2], ['gozdrone', 2], ['hatabot', 1]]),
  lab: Object.freeze([['yardimdron', 2], ['bekcirobot', 2], ['gozdrone', 3], ['hatabot', 1]]),
});

/** Katman seçim ağırlıkları (yüzey en sık). */
export const ROBOT_LAYER_WEIGHTS = Object.freeze([['surface', 50], ['sewer', 22], ['metro', 10], ['lab', 18]]);

/** İtici (pushy) tür mü? (tavan sınıfı) */
export function isPushyKey(key) {
  const d = ROBOT_DEFS[key];
  return !!d && d.robot.group === 'pushy';
}

/**
 * Dağılan robotun verdiği Kredi (0 = vermez). Belirlenimci (tohum + varlık kimliği). `recent`: son 5 dk'da dağıtılan robot sayısı;
 * 6'dan sonra yarıya iner (en az 2) → Kredi çiftliği yok. Kredi şehir-yereldir; jetonla 1:1 değişmez (sözleşme §1.18).
 */
export function robotKredi(def, seed, id, recent) {
  const R = def && def.robot;
  if (!R || !R.kredi) return 0;
  const lo = R.kredi[0];
  const hi = R.kredi[1];
  let n = lo + Math.floor(hash3f(id | 0, 0x4b52, seed | 0) * (hi - lo + 1));
  if (n > hi) n = hi;
  if ((recent | 0) > 6) n = Math.max(2, Math.floor(n / 2));
  return n;
}
