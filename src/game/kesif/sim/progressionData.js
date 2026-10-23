/*
 * KEŞİF sim — ilerleme tabloları (saf veri): bölge/mühür kuralları, yetenekler, zorluk ayarları, ödül anahtarları.
 *
 * Sunucu ödül anahtarları (config/game_kesif.php → rewards, KesifRewardService ile BİREBİR):
 *   zone:{1-4}:boss   bölge n'nin boss'u ilk kez yenildi
 *   zone:{1-4}:seal   bölge n'nin Mühür Sunağı tamamlandı (n=1..4; Başlangıç Vadisi'nin mührü jeton vermez)
 *   parkour:{1-5}:first   kademe n'de ilk parkur bitirme
 *   world:conquered   Gölge Hükümdar yenildi
 */
import { ZONES, ZONE_COUNT } from './constants.js';
import { itemByKey } from './items.js';
import { MOB_KEYS, normalizeMobKey } from './mobTypes.js';

export const PROGRESSION_VERSION = 1;

/** Yetenek → bilgi. Boss'la verilir (zone), eşya olarak da envantere konur. */
export const ABILITY_INFO = Object.freeze({
  doubleJump: Object.freeze({
    key: 'doubleJump', zone: 1, item: 'item:çift_zıplama_botları', name: 'Çift Zıplama Botları',
    desc: 'Havadayken bir kez daha zıpla.',
  }),
  grapple: Object.freeze({
    key: 'grapple', zone: 2, item: 'item:kanca', name: 'Kanca',
    desc: 'Kanca noktalarına tutunup sallan.',
  }),
  glide: Object.freeze({
    key: 'glide', zone: 3, item: 'item:planör', name: 'Planör',
    desc: 'Havada süzül, uçurumları aş.',
  }),
  portalGun: Object.freeze({
    key: 'portalGun', zone: 4, item: 'item:portal_tabancası', name: 'Kuantum Portal Tabancası',
    desc: 'Mavi ve turuncu portal açarak ışınlan.',
  }),
});
export const ABILITY_LIST = Object.freeze(Object.keys(ABILITY_INFO));

/** Bölge i'nin boss yenilgi ödülü (yetenek eşyası ayrıca verilir). */
export const BOSS_REWARD_ITEMS = Object.freeze({
  1: Object.freeze([{ item: 'item:altın_elma', count: 2 }, { item: 'item:elmas', count: 2 }]),
  2: Object.freeze([{ item: 'item:şifa_iksiri', count: 3 }, { item: 'item:elmas', count: 3 }]),
  3: Object.freeze([{ item: 'item:altın_elma', count: 3 }, { item: 'item:kuantum_parçası', count: 3 }]),
  4: Object.freeze([{ item: 'item:kuantum_külçe', count: 4 }, { item: 'item:altın_elma', count: 4 }]),
});

/** Mühür Sunağı tamamlanınca verilen eşyalar. */
export const SEAL_REWARD_ITEMS = Object.freeze({
  0: Object.freeze([{ item: 'item:pusula', count: 1 }, { item: 'item:şifa_iksiri', count: 2 }]),
  1: Object.freeze([{ item: 'item:şifa_iksiri', count: 2 }, { item: 'item:boss_anahtarı', count: 1 }]),
  2: Object.freeze([{ item: 'item:şifa_iksiri', count: 3 }, { item: 'item:boss_anahtarı', count: 1 }]),
  3: Object.freeze([{ item: 'item:şifa_iksiri', count: 3 }, { item: 'item:boss_anahtarı', count: 1 }]),
  4: Object.freeze([{ item: 'item:şifa_iksiri', count: 4 }, { item: 'item:boss_anahtarı', count: 1 }]),
});

/** Parkur kademesi → ilk bitirme eşyaları (kozmetik "yıldız" + küçük ödül). */
export const PARKOUR_REWARD_ITEMS = Object.freeze({
  1: Object.freeze([{ item: 'item:yıldız', count: 1 }]),
  2: Object.freeze([{ item: 'item:yıldız', count: 2 }, { item: 'item:elma', count: 4 }]),
  3: Object.freeze([{ item: 'item:yıldız', count: 3 }, { item: 'item:altın_külçe', count: 2 }]),
  4: Object.freeze([{ item: 'item:yıldız', count: 5 }, { item: 'item:elmas', count: 2 }]),
  5: Object.freeze([{ item: 'item:yıldız', count: 8 }, { item: 'item:kuantum_parçası', count: 2 }]),
});
export const PARKOUR_TIER_NAMES = Object.freeze(['', 'Bronz', 'Gümüş', 'Altın', 'Elmas', 'Kuantum']);

/** Bölge başına kurallar (ZONES'tan türetilir). */
export const ZONE_RULES = Object.freeze(ZONES.map((z, i) => Object.freeze({
  zone: i,
  name: z.name,
  required: z.temples,
  unlocks: i + 1 < ZONE_COUNT ? i + 1 : null,
  bossKey: z.bossKey,
  ability: z.abilityKey,
  bossRewardKey: i >= 1 ? 'zone:' + i + ':boss' : null,
  sealRewardKey: i >= 1 ? 'zone:' + i + ':seal' : null,
})));

/** Zorluk ayarları: oyun döngüsü çarpanları okur (progression yalnız saklar). */
export const DIFFICULTIES = Object.freeze({
  kolay: Object.freeze({
    key: 'kolay', name: 'Kolay', desc: 'Yaratıklar zayıf, açlık yavaş, hasar azalır.',
    mobDamage: 0.5, mobHealth: 0.8, hunger: 0.5, fallDamage: 0.5, keepInventory: true, easy: true,
  }),
  normal: Object.freeze({
    key: 'normal', name: 'Normal', desc: 'Dengeli macera.',
    mobDamage: 1, mobHealth: 1, hunger: 1, fallDamage: 1, keepInventory: false, easy: false,
  }),
  zor: Object.freeze({
    key: 'zor', name: 'Zor', desc: 'Güçlü yaratıklar, hızlı açlık.',
    mobDamage: 1.5, mobHealth: 1.4, hunger: 1.5, fallDamage: 1, keepInventory: false, easy: false,
  }),
});
export const DIFFICULTY_KEYS = Object.freeze(Object.keys(DIFFICULTIES));
export const DEFAULT_DIFFICULTY = 'normal';

/*
 * Güvenli anahtar çözücüler: items.js/mobTypes.js tabloları düz nesne olduğundan '__proto__', 'constructor' gibi
 * anahtarlar miras kayıt döndürebilir; burada yalnızca gerçek tablo girdileri kabul edilir.
 */
/** Eşya kaydı | null (yalnızca gerçek eşya). */
export function safeItem(key) {
  const it = itemByKey(key);
  return it && typeof it.key === 'string' && typeof it.stack === 'number' ? it : null;
}
/** Kanonik eşya anahtarı | null. */
export function canonKey(key) {
  const it = safeItem(key);
  return it ? it.key : null;
}
/** Kanonik yaratık anahtarı | null (yalnızca MOB_KEYS içindekiler). */
export function safeMobKey(key) {
  const n = normalizeMobKey(key);
  return typeof n === 'string' && MOB_KEYS.indexOf(n) >= 0 ? n : null;
}
const SAFE_ID_RE = /^[A-Za-z0-9_:.,#@|~+=/-]{1,64}$/;
/** Kimlik metni (harf/rakam/_:.,#@|~+=/-, ≤64; '__proto__' vb. hariç) | null. */
export function safeId(v) {
  if (typeof v !== 'string' || !SAFE_ID_RE.test(v)) return null;
  return v === '__proto__' || v === 'constructor' || v === 'prototype' ? null : v;
}

/** Sunucu ödül anahtarı geçerli mi (KesifRewardService::PATTERNS ile aynı). */
export function isRewardKey(key) {
  return typeof key === 'string'
    && (/^zone:[1-4]:(boss|seal)$/.test(key) || /^parkour:[1-5]:first$/.test(key) || key === 'world:conquered');
}

/** Toplam XP → seviye (0..60). */
export function xpLevel(xp) {
  const x = Number(xp);
  if (!(x > 0)) return 0;
  return Math.min(60, Math.floor(Math.sqrt(x / 25)));
}
/** Seviye l'ye ulaşmak için gereken XP. */
export function xpForLevel(l) {
  return l <= 0 ? 0 : 25 * l * l;
}

/* ------------------------------------------------------------------------------------------------
 * İstatistik şeması
 * ---------------------------------------------------------------------------------------------- */
export const STAT_COUNTERS = Object.freeze([
  'blocksBroken', 'blocksPlaced', 'mobsKilled', 'hostileKilled', 'distance', 'playTime', 'deaths',
  'puzzlesSolved', 'crystalsCollected', 'itemsCrafted', 'smelted', 'itemsPicked', 'foodEaten',
  'bedUses', 'chestsOpened', 'nights', 'abilityUses', 'xp', 'chestStores',
  // büyü sistemi: büyülenen eşya, yapılan büyü, demlenen/içilen iksir, kullanılan Mana Kristali
  'enchants', 'spellsCast', 'potionsBrewed', 'potionsDrunk', 'manaCrystals',
  // ağaç devirme: devrilen ağaç, fidandan büyüyen ağaç
  'treesFelled', 'treesGrown',
  // teknoloji: açılan/kullanılan portal, ışınlanma, tarama, matkapla kazılan blok, jetpack süresi (sn, ondalık)
  'portalsPlaced', 'portalsUsed', 'teleports', 'scans', 'drillBlocks', 'jetpackSeconds',
]);
export const STAT_MAPS = Object.freeze([
  'broken', 'placed', 'crafted', 'smeltedBy', 'picked', 'mobKinds', 'eaten', 'puzzlesByZone', 'parkourBest',
]);

export function emptyStats() {
  const s = {};
  STAT_COUNTERS.forEach((k) => { s[k] = 0; });
  STAT_MAPS.forEach((k) => { s[k] = {}; });
  return s;
}

export const STAT_LIMIT = 2147483000;
