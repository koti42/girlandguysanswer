/*
 * KEŞİF sim — yaratık/boss tür tablosu (saf veri; three/DOM yok, worker-güvenli).
 *
 * Tek doğruluk kaynağı: hitbox, can, hasar, hız, ganimet ipucu, doğma kuralları, saldırı türü.
 * sim/entities.js, mobAI.js, combat.js buradan okur; render/mobModels.js aynı tablodan model üretir
 * (model gövdesi hitbox ile uyumludur).
 *
 * Anahtarlar ASCII'dir (constants.js PASSIVE_MOBS / HOSTILE_MOBS / BOSS_KEYS ile aynı).
 * 'golgehukumdari' yazımı da kabul edilir (normalizeMobKey → 'golgehukumdar').
 *
 * Birimler: blok (1 blok = 1 m). hitbox {w,h}: yatay kare ayak izi genişliği ve yükseklik (AABB).
 * Model önü -Z yönündedir (yaw=0 iken kameranın baktığı yön).
 */
import {
  BOSS_KEYS as BOSS_KEY_LIST,
  HOSTILE_MOBS,
  PASSIVE_MOBS,
  WORLD_Y_MAX,
  WORLD_Y_MIN,
  ZONES,
  foldTr,
} from './constants.js';
import { ROBOT_DEFS, ROBOT_KEYS as ROBOT_KEY_LIST } from './city/ped/robotData.js';

/** Bu derinliğin altındaki mağaralarda biyom kısıtı gevşer: kristal/lav yaratıkları tabana yakın her yerde olabilir. */
export const DEEP_BIOME_FREE_Y = -220;

/** Eski/alternatif yazımlar → kanonik anahtar. */
const ALIASES = Object.freeze({
  golgehukumdari: 'golgehukumdar',
  golge_hukumdar: 'golgehukumdar',
  kok_ana: 'kokana',
  tas_bekci: 'tasbekci',
  buz_kral: 'buzkral',
  orman_kedisi: 'ormankedisi',
  kum_akrebi: 'kumakrebi',
  buz_hortlagi: 'buzhortlagi',
  kristal_bocegi: 'kristalbocegi',
  lav_slime: 'lavslime',
  tas_yarasasi: 'tasyarasasi',
  ates_bocegi: 'atesbocegi',
});

const drop = (item, min = 1, max = min, chance = 1) => ({ item, min, max, chance });

/** Doğma kuralı kısayolu. */
function spawn(zones, o = {}) {
  return Object.freeze({
    zones: Object.freeze(zones.slice()),
    // Işık seviyesi aralığı (0..15, gökyüzü×gün faktörü ile blok ışığının büyüğü).
    minLight: o.minLight === undefined ? 0 : o.minLight,
    maxLight: o.maxLight === undefined ? 15 : o.maxLight,
    // Biyom anahtarları (constants BIOME_KEYS); null = her biyom.
    biomes: o.biomes ? Object.freeze(o.biomes.slice()) : null,
    // 'yüzey' | 'mağara' | 'su' | 'hava' | 'her yer'
    habitat: o.habitat || 'yüzey',
    // Yalnız gece mi / yalnız gündüz mü.
    night: !!o.night,
    day: !!o.day,
    weight: o.weight === undefined ? 10 : o.weight,
    group: Object.freeze(o.group ? o.group.slice() : [1, 1]),
    // derin dünya (-400..362): varsayılan aralık tüm dünya (eski 0..127 varsayılanı yer altında hiç doğmaya izin vermiyordu)
    minY: o.minY === undefined ? WORLD_Y_MIN : o.minY,
    maxY: o.maxY === undefined ? WORLD_Y_MAX : o.maxY,
    // Oyuncuya en yakın/en uzak doğma mesafesi (blok).
    minDist: o.minDist === undefined ? 18 : o.minDist,
    maxDist: o.maxDist === undefined ? 48 : o.maxDist,
  });
}

function mob(key, def) {
  const hostile = !!def.hostile;
  const boss = !!def.boss;
  return Object.freeze({
    key,
    name: def.name,
    family: def.family,
    boss,
    hostile: hostile || boss,
    passive: !hostile && !boss,
    // Hareket biçimi: yürü, uç, yüz, sek, süzül.
    movement: def.movement || 'yürü',
    hp: def.hp,
    damage: def.damage || 0,
    speed: def.speed, // koşu/kovalama hızı (blok/sn)
    walkSpeed: def.walkSpeed !== undefined ? def.walkSpeed : def.speed * 0.45,
    hitbox: Object.freeze({ w: def.w, h: def.h }),
    modelScale: def.modelScale || 1,
    eyeHeight: def.eyeHeight !== undefined ? def.eyeHeight : def.h * 0.85,
    knockbackResist: def.kbResist || 0,
    xp: def.xp || 0,
    drops: Object.freeze((def.drops || []).map((d) => Object.freeze(d))),
    spawn: def.spawn || null,
    // Kovalama menzili ve vazgeçme mesafesi; pasifte kaçma menzili.
    aggroRange: def.aggro ? def.aggro[0] : 0,
    loseRange: def.aggro ? def.aggro[1] : 0,
    fleeRange: def.flee || 0,
    // Işıkta davranış: 'kaç' (ışıktan uzaklaş), 'zayıfla' (hasar ×0.5), null.
    lightReaction: def.light || null,
    attack: def.attack
      ? Object.freeze({
        kind: def.attack.kind, // 'yakın' | 'ok' | 'sokma' | 'atılma' | 'şok' | 'ışın' | ...
        range: def.attack.range,
        cooldown: def.attack.cooldown,
        windup: def.attack.windup,
        projectile: def.attack.projectile || null,
      })
      : null,
    // Neon Meridyen robotları: davranış parametreleri (sim/city/ped/robotData.js); diğer türlerde alan yok
    ...(def.robot ? { robot: def.robot } : {}),
    // Boss'a özel: aşama eşikleri (can oranı), saldırı kümesi, arena.
    ...(boss
      ? {
        phases: Object.freeze({
          count: def.phases.count,
          thresholds: Object.freeze(def.phases.thresholds.slice()),
          attacks: Object.freeze(def.phases.attacks.slice()),
        }),
        zone: def.zone,
        arenaRadius: def.arena,
        ability: def.ability || null,
      }
      : {}),
  });
}

const DAY_PASSIVE = { minLight: 9, day: true };

const TABLE = {
  /* ------------------------------ pasif ------------------------------ */
  tavuk: mob('tavuk', {
    name: 'Tavuk', family: 'kuş', w: 0.4, h: 0.7, hp: 4, speed: 3.2, flee: 6, xp: 1, eyeHeight: 0.55,
    drops: [drop('item:çiğ_tavuk'), drop('item:tüy', 0, 2, 0.8)],
    spawn: spawn([0, 1], {
      ...DAY_PASSIVE, biomes: ['cayir', 'orman', 'cicek', 'kiraz', 'sonbahar', 'bambu'], weight: 12, group: [2, 4],
    }),
  }),
  koyun: mob('koyun', {
    name: 'Koyun', family: 'hayvan', w: 0.9, h: 1.3, hp: 8, speed: 3, flee: 5, xp: 2, eyeHeight: 1.0,
    drops: [drop('item:yün', 1, 2), drop('item:çiğ_koyun_eti', 1, 2)],
    spawn: spawn([0, 1], {
      ...DAY_PASSIVE, biomes: ['cayir', 'dag', 'cicek', 'kiraz', 'savan'], weight: 10, group: [2, 4],
    }),
  }),
  ormankedisi: mob('ormankedisi', {
    name: 'Orman Kedisi', family: 'hayvan', w: 0.6, h: 0.7, hp: 10, speed: 5, flee: 7, xp: 2, eyeHeight: 0.55,
    drops: [drop('item:deri', 0, 1, 0.5)],
    spawn: spawn([0, 1, 3], {
      minLight: 6,
      biomes: ['orman', 'karacam', 'tundra', 'cayir', 'sonbahar', 'taiga', 'bambu', 'yagmurorman', 'golge'],
      weight: 5,
      group: [1, 2],
    }),
  }),
  ceylan: mob('ceylan', {
    name: 'Ceylan', family: 'hayvan', w: 0.8, h: 1.6, hp: 10, speed: 6.5, flee: 12, xp: 3, eyeHeight: 1.45,
    drops: [drop('item:deri', 1, 2), drop('item:çiğ_koyun_eti', 1, 2)],
    spawn: spawn([0, 1, 2, 3], {
      ...DAY_PASSIVE,
      biomes: ['cayir', 'orman', 'col', 'tundra', 'dag', 'sonbahar', 'kiraz', 'cicek', 'savan', 'taiga'],
      weight: 8,
      group: [1, 3],
    }),
  }),
  balik: mob('balik', {
    name: 'Balık', family: 'balık', w: 0.5, h: 0.4, hp: 3, speed: 2.6, flee: 4, xp: 1, movement: 'yüz', eyeHeight: 0.25,
    drops: [drop('item:çiğ_balık')],
    spawn: spawn([0, 1, 2, 3], {
      minLight: 4,
      habitat: 'su',
      biomes: ['plaj', 'cayir', 'bataklik', 'mercan', 'mangrov', 'orman', 'kiraz', 'sonbahar', 'cicek', 'bambu', 'savan', 'taiga', 'yagmurorman'],
      weight: 10,
      group: [2, 5],
      maxY: 44,
    }),
  }),
  kelebek: mob('kelebek', {
    name: 'Kelebek', family: 'böcek', w: 0.3, h: 0.3, hp: 1, speed: 1.6, flee: 3, xp: 0, movement: 'uç', eyeHeight: 0.2,
    drops: [],
    spawn: spawn([0, 1, 2], {
      ...DAY_PASSIVE,
      habitat: 'hava',
      biomes: ['cayir', 'orman', 'col', 'cicek', 'kiraz', 'bambu', 'savan', 'mercan', 'yagmurorman'],
      weight: 7,
      group: [2, 4],
    }),
  }),
  atesbocegi: mob('atesbocegi', {
    name: 'Ateş Böceği', family: 'böcek', w: 0.25, h: 0.25, hp: 1, speed: 1.2, flee: 3, xp: 0, movement: 'uç', eyeHeight: 0.15,
    drops: [],
    spawn: spawn([1, 4], {
      habitat: 'hava',
      night: true,
      minLight: 0,
      maxLight: 9,
      biomes: ['orman', 'karacam', 'bataklik', 'kristal', 'mangrov', 'yagmurorman', 'bambu', 'golge', 'mantar'],
      weight: 8,
      group: [3, 6],
    }),
  }),
  tilki: mob('tilki', {
    name: 'Tilki', family: 'hayvan', w: 0.7, h: 0.75, hp: 10, speed: 5.5, flee: 9, xp: 2, eyeHeight: 0.6,
    drops: [drop('item:deri', 0, 1, 0.6), drop('item:tüy', 0, 1, 0.2)],
    spawn: spawn([0, 1, 3], {
      minLight: 6, biomes: ['orman', 'sonbahar', 'kiraz', 'taiga', 'tundra', 'cicek', 'bambu', 'buzul'], weight: 6, group: [1, 2],
    }),
  }),
  kurbaga: mob('kurbaga', {
    name: 'Kurbağa', family: 'hayvan', w: 0.35, h: 0.3, hp: 3, speed: 3.4, flee: 5, xp: 1, movement: 'sek', eyeHeight: 0.22,
    drops: [],
    spawn: spawn([0, 1, 4], { minLight: 4, biomes: ['bataklik', 'mangrov', 'yagmurorman'], weight: 10, group: [2, 4] }),
  }),
  papagan: mob('papagan', {
    name: 'Papağan', family: 'kuş', w: 0.35, h: 0.5, hp: 4, speed: 4, flee: 8, xp: 1, movement: 'uç', eyeHeight: 0.4,
    drops: [drop('item:tüy', 1, 3, 0.9)],
    spawn: spawn([1, 2], {
      ...DAY_PASSIVE, habitat: 'hava', biomes: ['yagmurorman', 'mercan', 'bambu', 'mangrov'], weight: 9, group: [2, 4],
    }),
  }),

  /* ------------------------------ düşman ------------------------------ */
  golge: mob('golge', {
    hostile: true, name: 'Gölge', family: 'gölge', w: 0.6, h: 1.9, hp: 20, damage: 3, speed: 3.6, xp: 5, eyeHeight: 1.65,
    aggro: [16, 28], light: 'kaç',
    drops: [drop('item:kömür', 0, 2, 0.6), drop('item:ip', 0, 1, 0.3), drop('item:büyü_tozu', 0, 1, 0.12)],
    attack: { kind: 'yakın', range: 1.6, cooldown: 1.1, windup: 0.35 },
    spawn: spawn([0, 1, 2, 3, 4], { maxLight: 7, habitat: 'her yer', weight: 14, group: [1, 3] }),
  }),
  kemikci: mob('kemikci', {
    hostile: true, name: 'Kemikçi', family: 'iskelet', w: 0.6, h: 1.9, hp: 18, damage: 3, speed: 3.2, xp: 6, eyeHeight: 1.65,
    aggro: [20, 32], light: 'kaç',
    drops: [drop('item:kemik', 0, 2, 0.8), drop('item:ok', 0, 3, 0.5), drop('item:yay', 0, 1, 0.05)],
    attack: { kind: 'ok', range: 14, cooldown: 2.2, windup: 0.8, projectile: 'ok' },
    spawn: spawn([1, 2, 3, 4], { maxLight: 7, habitat: 'her yer', weight: 8, group: [1, 2] }),
  }),
  kumakrebi: mob('kumakrebi', {
    hostile: true, name: 'Kum Akrebi', family: 'eklembacaklı', w: 1.0, h: 0.7, hp: 16, damage: 4, speed: 4.2, xp: 6, eyeHeight: 0.55,
    aggro: [12, 22], light: 'zayıfla',
    drops: [drop('item:deri', 0, 1, 0.4), drop('item:kristal_tozu', 0, 1, 0.1)],
    attack: { kind: 'sokma', range: 1.9, cooldown: 1.4, windup: 0.45 },
    spawn: spawn([2, 4], {
      maxLight: 7, biomes: ['col', 'dag', 'savan', 'volkanik'], habitat: 'yüzey', weight: 9, group: [1, 2],
    }),
  }),
  buzhortlagi: mob('buzhortlagi', {
    hostile: true, name: 'Buz Hortlağı', family: 'buz', w: 0.7, h: 1.9, hp: 24, damage: 4, speed: 3.4, xp: 8, movement: 'süzül', eyeHeight: 1.6,
    aggro: [18, 30], light: 'zayıfla',
    drops: [drop('item:kristal_tozu', 1, 2, 0.7), drop('item:kömür', 0, 1, 0.2)],
    attack: { kind: 'yakın', range: 2.0, cooldown: 1.5, windup: 0.5 },
    spawn: spawn([3, 4], {
      maxLight: 7, biomes: ['tundra', 'dag', 'kristal', 'taiga', 'buzul'], habitat: 'yüzey', weight: 7, group: [1, 2],
    }),
  }),
  kristalbocegi: mob('kristalbocegi', {
    hostile: true, name: 'Kristal Böceği', family: 'kristal', w: 1.1, h: 0.9, hp: 22, damage: 5, speed: 4.4, xp: 9, eyeHeight: 0.6,
    aggro: [12, 22], light: 'zayıfla', kbResist: 0.4,
    drops: [
      drop('item:kristal_tozu', 1, 3), drop('item:ametist_parçası', 0, 1, 0.3), drop('item:büyü_tozu', 0, 2, 0.45),
      drop('item:kuantum_kıymığı', 0, 1, 0.3), drop('item:devre_kartı', 0, 1, 0.12),
    ],
    attack: { kind: 'atılma', range: 2.2, cooldown: 1.8, windup: 0.5 },
    spawn: spawn([3, 4], {
      maxLight: 7, biomes: ['kristal', 'dag', 'buzul', 'mantar', 'golge'], habitat: 'mağara', weight: 8, group: [1, 3], maxY: 50,
    }),
  }),
  lavslime: mob('lavslime', {
    hostile: true, name: 'Lav Slime', family: 'çamur', w: 0.9, h: 0.9, hp: 20, damage: 4, speed: 3.4, xp: 8, movement: 'sek', eyeHeight: 0.6,
    aggro: [14, 24], light: 'zayıfla',
    drops: [drop('item:kömür', 1, 2), drop('item:kızıltaş_tozu', 0, 2, 0.3), drop('item:pil_hücresi', 0, 1, 0.15)],
    attack: { kind: 'atılma', range: 2.0, cooldown: 1.6, windup: 0.5 },
    // yüzeyde yalnız volkanik/sıcak biyomlarda (lav gölleri) ve mağarada: habitat 'her yer' + biyom listesi
    spawn: spawn([2, 4], {
      maxLight: 7, habitat: 'her yer', biomes: ['col', 'kristal', 'dag', 'volkanik', 'savan'], weight: 6, group: [1, 2], maxY: 70,
    }),
  }),
  tasyarasasi: mob('tasyarasasi', {
    hostile: true, name: 'Taş Yarasası', family: 'taş', w: 0.7, h: 0.6, hp: 10, damage: 2, speed: 5.2, xp: 4, movement: 'uç', eyeHeight: 0.4,
    aggro: [14, 24], light: 'kaç',
    drops: [drop('item:çakmaktaşı', 0, 2, 0.6), drop('item:bakır_tel', 0, 2, 0.25)],
    attack: { kind: 'dalış', range: 1.4, cooldown: 1.2, windup: 0.3 },
    spawn: spawn([1, 2, 3, 4], { maxLight: 7, habitat: 'mağara', weight: 9, group: [2, 4], maxY: 60 }),
  }),

  /* ------------------------------ boss ------------------------------ */
  kokana: mob('kokana', {
    boss: true, name: 'Kök Ana', family: 'bitki', w: 4.0, h: 6.0, hp: 400, damage: 5, speed: 2.0, walkSpeed: 0.8, xp: 120, kbResist: 1,
    eyeHeight: 4.6, zone: 1, arena: 22, ability: 'doubleJump',
    aggro: [28, 40],
    drops: [
      drop('item:kök_özü'), drop('item:odun_kömürü', 3, 6), drop('item:elma', 2, 4), drop('item:büyü_tozu', 6, 10),
      drop('item:mana_kristali', 1, 1, 0.5),
    ],
    attack: { kind: 'sarmaşık', range: 9, cooldown: 3.2, windup: 0.9 },
    phases: { count: 3, thresholds: [0.66, 0.33], attacks: ['ezme', 'sarmaşık', 'sporlar'] },
  }),
  tasbekci: mob('tasbekci', {
    boss: true, name: 'Taş Bekçi', family: 'golem', w: 3.0, h: 5.0, hp: 500, damage: 7, speed: 2.4, walkSpeed: 1.0, xp: 180, kbResist: 1,
    eyeHeight: 4.2, zone: 2, arena: 24, ability: 'grapple',
    aggro: [28, 40],
    drops: [
      drop('item:taş_kalp'), drop('item:demir_külçe', 2, 4), drop('item:kristal_tozu', 2, 5), drop('item:büyü_tozu', 8, 12),
      drop('item:kuantum_kıymığı', 1, 3, 0.7), drop('item:mana_kristali', 1, 1, 0.7),
      drop('item:çelik_levha', 2, 4), drop('item:devre_kartı', 1, 2, 0.8), drop('item:pil_hücresi', 1, 2, 0.6),
    ],
    attack: { kind: 'şok', range: 10, cooldown: 3.6, windup: 1.0 },
    phases: { count: 3, thresholds: [0.66, 0.33], attacks: ['ezme', 'şok', 'yumruk'] },
  }),
  buzkral: mob('buzkral', {
    boss: true, name: 'Buz Kral', family: 'buz', w: 2.4, h: 5.0, hp: 600, damage: 8, speed: 3.0, walkSpeed: 1.2, xp: 240, kbResist: 1,
    eyeHeight: 4.3, zone: 3, arena: 26, ability: 'glide',
    aggro: [30, 42],
    drops: [
      drop('item:buz_kalbi'), drop('item:elmas', 1, 3), drop('item:kristal_tozu', 3, 6), drop('item:büyü_tozu', 10, 14),
      drop('item:kuantum_kıymığı', 2, 4, 0.8), drop('item:mana_kristali', 1, 2, 0.8),
      drop('item:enerji_çekirdeği', 1, 1, 0.8), drop('item:lazer_merceği', 1, 1, 0.5), drop('item:devre_kartı', 1, 3, 0.8),
    ],
    attack: { kind: 'mızrak', range: 12, cooldown: 3.0, windup: 0.9 },
    phases: { count: 3, thresholds: [0.66, 0.33], attacks: ['mızrak', 'zıplama', 'tipi'] },
  }),
  golgehukumdar: mob('golgehukumdar', {
    boss: true, name: 'Gölge Hükümdar', family: 'hükümdar', w: 1.8, h: 4.0, hp: 800, damage: 9, speed: 3.6, walkSpeed: 1.4, xp: 400, kbResist: 1,
    movement: 'süzül', eyeHeight: 3.4, zone: 4, arena: 28, ability: 'portalGun',
    aggro: [32, 44],
    drops: [
      drop('item:gölge_özü'), drop('item:kuantum_parçası', 2, 5), drop('item:elmas', 2, 4), drop('item:büyü_tozu', 14, 20),
      drop('item:kuantum_kıymığı', 3, 6), drop('item:mana_kristali', 2, 3),
      drop('item:kuantum_çekirdeği', 1, 1, 0.6), drop('item:enerji_çekirdeği', 1, 2, 0.8),
    ],
    attack: { kind: 'ışın', range: 16, cooldown: 2.8, windup: 1.0 },
    phases: { count: 3, thresholds: [0.66, 0.33], attacks: ['ışın', 'çağır', 'ışınlan'] },
  }),
};

/**
 * Neon Meridyen robotları AYRI tabloda: MOB_TYPES/MOB_KEYS (ana diyar yaratıkları) değişmez; getMobType/normalizeMobKey robotları da çözer.
 * Robot türleri hiçbir doğma bölgesinde listelenmez (spawn=null): yalnızca şehir doğurucusu (sim/city/ped/robots.js) doğurur.
 */
const ROBOT_TABLE = Object.create(null); // prototipsiz: '__proto__'/'constructor' gibi adlar robot sayılmaz
for (let i = 0; i < ROBOT_KEY_LIST.length; i++) ROBOT_TABLE[ROBOT_KEY_LIST[i]] = mob(ROBOT_KEY_LIST[i], ROBOT_DEFS[ROBOT_KEY_LIST[i]]);
export const ROBOT_TYPES = Object.freeze(ROBOT_TABLE);
export const ROBOT_KEYS = ROBOT_KEY_LIST;

/** Anahtar bir Neon Meridyen robotu mu? */
export function isRobotKey(key) {
  const k = normalizeMobKey(key);
  return !!k && ROBOT_TABLE[k] !== undefined;
}

/** Tür kayıtları (anahtar → kayıt). Dondurulmuş. */
export const MOB_TYPES = Object.freeze(TABLE);
export const MOB_KEYS = Object.freeze(Object.keys(TABLE));
export const PASSIVE_KEYS = PASSIVE_MOBS;
export const HOSTILE_KEYS = HOSTILE_MOBS;
export const BOSS_KEYS = BOSS_KEY_LIST;

/** Anahtarı kanonik ASCII biçime çevirir; bilinmiyorsa null. */
export function normalizeMobKey(key) {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (TABLE[key]) return key;
  const f = foldTr(key).replace(/[\s-]+/g, '_');
  if (TABLE[f]) return f;
  const g = f.replace(/_/g, '');
  if (TABLE[g]) return g;
  return ALIASES[f] || ALIASES[g] || (ROBOT_TABLE[f] ? f : ROBOT_TABLE[g] ? g : null);
}

/** Anahtar/takma adtan tür kaydı; yoksa null. */
export function getMobType(key) {
  const k = normalizeMobKey(key);
  return k ? (TABLE[k] || ROBOT_TABLE[k]) : null;
}

export function isBossKey(key) {
  const t = getMobType(key);
  return !!(t && t.boss);
}

/** Bölgede doğabilecek yaratıklar: kind 'pasif' | 'düşman' | undefined (hepsi). */
export function mobsForZone(zoneIndex, kind) {
  const out = [];
  for (let i = 0; i < MOB_KEYS.length; i++) {
    const t = TABLE[MOB_KEYS[i]];
    if (t.boss || !t.spawn || t.spawn.zones.indexOf(zoneIndex) < 0) continue;
    if (kind === 'pasif' && !t.passive) continue;
    if (kind === 'düşman' && !t.hostile) continue;
    out.push(t);
  }
  return out;
}

/**
 * Doğma kuralı uygun mu? ctx: {zone, light, biome, y, night, habitat}
 * (habitat: 'yüzey'|'mağara'|'su'|'hava'; 'her yer' kuralı hepsini kabul eder).
 */
export function canSpawnAt(typeOrKey, ctx) {
  const t = typeof typeOrKey === 'string' ? getMobType(typeOrKey) : typeOrKey;
  if (!t || !t.spawn) return false;
  const s = t.spawn;
  if (s.zones.indexOf(ctx.zone) < 0) return false;
  if (ctx.light < s.minLight || ctx.light > s.maxLight) return false;
  // derin mağaralarda yüzey biyomu anlamsızdır: kristal/lav yaratıkları biyom listesine bakılmadan doğabilir
  const deepCave = ctx.habitat === 'mağara' && ctx.y < DEEP_BIOME_FREE_Y;
  if (s.biomes && !deepCave && s.biomes.indexOf(ctx.biome) < 0) return false;
  if (s.habitat !== 'her yer' && ctx.habitat !== undefined && s.habitat !== ctx.habitat) return false;
  if (s.night && ctx.night === false) return false;
  if (s.day && ctx.night === true) return false;
  if (ctx.y < s.minY || ctx.y > s.maxY) return false;
  return true;
}

/** Bölgenin boss tür kaydı (Başlangıç Vadisi'nde yok → null). */
export function bossForZone(zoneIndex) {
  const z = ZONES[zoneIndex];
  return z && z.bossKey ? TABLE[normalizeMobKey(z.bossKey)] : null;
}

/** AABB yarı genişlik/yükseklik (sim çarpışması için). */
export function hitboxOf(key) {
  const t = getMobType(key);
  return t ? t.hitbox : null;
}
