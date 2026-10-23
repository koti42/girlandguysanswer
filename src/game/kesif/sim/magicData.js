/*
 * KEŞİF sim — BÜYÜ sistemi: saf veri tabloları (büyülemeler, büyüler, etkiler, iksirler, eşya/blok tanımları).
 *
 * Bu dosya yalnızca `constants.js`e bağımlıdır (blocks.js ve items.js bu dosyayı İÇE AKTARIR; döngü olmasın diye
 * eşya/blok tablolarını burada İÇE AKTARMA). Mantık magicEnchant/magicEffects/magicSpells/magicBrew/magicState'te.
 *
 * Kimlikler ASCII'dir ('ates_direnci'); kullanıcıya görünen adlar Türkçe. Tüm tablolar dondurulmuştur.
 */

export const MAGIC_VERSION = 1;

/* ------------------------------------------------------------------------------------------------
 * Sabitler
 * ---------------------------------------------------------------------------------------------- */
export const ITEM_DUST = 'item:büyü_tozu';
export const ITEM_SHARD = 'item:kuantum_kıymığı';
export const ITEM_MANA_CRYSTAL = 'item:mana_kristali';
export const ITEM_BOTTLE = 'item:cam_şişe';
export const ITEM_HEAL_POTION = 'item:şifa_iksiri';

/** Sistem bloğu kimlikleri (blocks.js 128–129'u kullanır; MAX_BLOCK_ID 135). */
export const MAGIC_BLOCK_IDS = Object.freeze({ TABLE: 128, CAULDRON: 129 });

/** Büyü Masası'na kitaplık sayım yarıçapı (blok, Chebyshev) ve kitaplık blok kimliği (blocks.js B.BOOKSHELF). */
export const SHELF_RADIUS = 4;
export const SHELF_BLOCK_ID = 18;
export const MAX_SHELF_TIER = 5;
/** Tam kitaplık çemberi (bu kadar ve üstü): büyü tozu maliyetinde %15 indirim. */
export const FULL_SHELF_COUNT = 5;
export const FULL_SHELF_DISCOUNT = 0.15;

export const REROLL_DUST = 1;
export const MAX_ENCH_PER_ITEM = 6;

/** Mana havuzu. */
export const MANA = Object.freeze({
  base: 100,
  regenPerSec: 4,
  regenDelay: 1.0, // son büyüden sonra bu kadar sn yenilenme yok ("büyü yaparken yenilenmez")
  crystalGain: 10,
  crystalMaxBonus: 100,
});

/** Etki üst sınırları. */
export const EFFECT_LIMITS = Object.freeze({ maxSeconds: 3600, maxLevel: 5, maxActive: 12 });

export const TIER_NAMES = Object.freeze(['I', 'II', 'III', 'IV', 'V']);
export function roman(n) {
  const i = Math.floor(Number(n));
  return i >= 1 && i <= 5 ? TIER_NAMES[i - 1] : String(i > 0 ? i : 0);
}

/* ------------------------------------------------------------------------------------------------
 * Büyülenebilir eşya sınıfları
 * ---------------------------------------------------------------------------------------------- */
export const ENCHANT_CLASSES = Object.freeze([
  'kazma', 'balta', 'kürek', 'kılıç', 'yay', 'kafa', 'göğüs', 'bacak', 'ayak', 'kalkan', 'asa',
]);
const TOOLS = ['kazma', 'balta', 'kürek'];
const ARMOR = ['kafa', 'göğüs', 'bacak', 'ayak'];
const ALL = ENCHANT_CLASSES.slice();

export const CLASS_NAMES = Object.freeze({
  kazma: 'Kazma', balta: 'Balta', kürek: 'Kürek', kılıç: 'Kılıç', yay: 'Yay', kafa: 'Miğfer', göğüs: 'Göğüslük',
  bacak: 'Bacaklık', ayak: 'Çizme', kalkan: 'Kalkan', asa: 'Büyü Asası',
});

/* ------------------------------------------------------------------------------------------------
 * Büyülemeler
 *   key,name,max        anahtar (ASCII), ad, en yüksek seviye
 *   minTier             1. seviyenin kademesi (seviye L → kademe minTier+L-1, en çok V)
 *   weight              teklif seçiminde ağırlık
 *   targets             uygulanabilir eşya sınıfları
 *   conflicts           birlikte olamayan büyülemeler
 *   text(level)         ipucu satırı (Türkçe)
 * ---------------------------------------------------------------------------------------------- */
const list = [];
const table = Object.create(null);

function f1(n) {
  const r = Math.round(n * 10) / 10;
  return String(r).replace('.', ',');
}

function E(key, name, max, minTier, weight, targets, conflicts, text) {
  const def = Object.freeze({
    key, name, max, minTier, weight, targets: Object.freeze(targets.slice()), conflicts: Object.freeze(conflicts.slice()), text,
  });
  list.push(def);
  table[key] = def;
}

E('keskinlik', 'Keskinlik', 5, 1, 10, ['kılıç', 'balta'], [], (l) => '+' + f1(0.75 * l) + ' saldırı hasarı');
E('alev', 'Alev', 2, 2, 5, ['kılıç', 'balta', 'yay'], ['buz'], (l) => 'Hedefi ' + (3 + l * 2) + ' sn yakar (' + l + ' hasar/sn)');
E('buz', 'Buz', 2, 2, 5, ['kılıç', 'balta', 'yay'], ['alev'], (l) => 'Hedefi ' + f1(2 + l * 1.5) + ' sn yavaşlatır');
E('geri_tepme', 'Geri Tepme', 2, 1, 6, ['kılıç', 'balta'], [], (l) => 'Hedefi ' + f1(2.5 * l) + ' birim daha uzağa iter');
E('yagmaci', 'Yağmacı', 3, 3, 4, ['kılıç', 'balta'], [], (l) => 'Ganimet şansı +%' + (l * 12));
E('verimlilik', 'Verimlilik', 5, 1, 10, TOOLS, [], (l) => 'Kazma hızı x' + f1(1 + 0.3 * l + 0.05 * l * l));
E('dayaniklilik', 'Dayanıklılık', 3, 1, 8, ALL, [], (l) => 'Aşınmama şansı %' + Math.round(100 * l / (l + 1)));
E('ipek_dokunus', 'İpek Dokunuş', 1, 3, 3, ['kazma', 'balta', 'kürek'], ['servet'], () => 'Bloklar kendi halleriyle düşer');
E('servet', 'Servet', 3, 3, 4, ['kazma'], ['ipek_dokunus'], (l) => 'Cevher veriminde en çok x' + (l + 1) + ' şans');
E('miknatis', 'Mıknatıs', 1, 2, 5, TOOLS, [], () => 'Kırılan blokların eşyaları doğrudan çantaya gelir');
E('koruma', 'Koruma', 4, 1, 10, ARMOR, [], (l) => '+' + f1(0.5 * l) + ' zırh puanı');
E('ates_direnci', 'Ateş Direnci', 1, 2, 5, ARMOR, [], () => 'Lav ve ateş hasarı %60 azalır');
E('hafif_adim', 'Hafif Adım', 3, 1, 6, ['ayak'], [], (l) => 'Düşme hasarı %' + (l * 25) + ' azalır');
E('su_solugu', 'Su Soluğu', 3, 2, 5, ['kafa'], [], (l) => 'Su altında nefes süresi x' + (1 + l));
E('dikenler', 'Dikenler', 3, 2, 5, ['göğüs', 'bacak'], [], (l) => 'Vuran yaratığa ' + f1(1 + l) + ' hasar yansıtır');
E('guc', 'Güç', 5, 1, 10, ['yay'], [], (l) => 'Ok hasarı +%' + (l * 20));
E('sonsuzluk', 'Sonsuzluk', 1, 4, 2, ['yay'], [], () => 'Ok tüketmez');
E('hiz', 'Hız', 3, 2, 6, ['ayak'], [], (l) => 'Hareket hızı +%' + (l * 6));
E('yenilenme', 'Yenilenme', 2, 3, 4, ['kafa'], [], (l) => 'Yavaşça can yeniler (' + f1(0.1 * l) + ' can/sn)');
E('mana_verimi', 'Mana Verimi', 3, 1, 8, ['asa'], [], (l) => 'Büyü mana maliyeti -%' + (l * 15));
E('buyu_gucu', 'Büyü Gücü', 3, 1, 8, ['asa'], [], (l) => 'Büyü hasarı ve şifası +%' + (l * 20));

export const ENCHANT_LIST = Object.freeze(list);
export const ENCHANTS = Object.freeze(table);

export function enchantDef(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}
/** Seviye L'nin gerektirdiği kitaplık kademesi (1..5). */
export function tierOfLevel(def, level) {
  return Math.min(5, def.minTier + Math.max(1, level) - 1);
}
/** Kademe t'de verilebilecek en yüksek seviye (0 = bu kademede yok). */
export function levelCapForTier(def, tier) {
  let cap = 0;
  for (let l = 1; l <= def.max; l++) if (tierOfLevel(def, l) <= tier) cap = l;
  return cap;
}

/** Teklif maliyet tabloları (kademe 1..5). */
export const OFFER_COST = Object.freeze({
  dust: Object.freeze([4, 8, 14, 22, 32]),
  shard: Object.freeze([0, 0, 1, 2, 3]),
  extraDustPerEnchant: 3,
});

/* ------------------------------------------------------------------------------------------------
 * Büyüler (asa ile yapılır)
 *   kind 'projectile' | 'heal' | 'blink'; mana maliyeti, bekleme (sn); projectile: fx/projectile anahtarı (entitiesProjectiles)
 * ---------------------------------------------------------------------------------------------- */
const spellList = [];
const spellTable = Object.create(null);
function S(def) {
  const rec = Object.freeze(def);
  spellList.push(rec);
  spellTable[def.key] = rec;
}
S({
  key: 'ates_topu', name: 'Ateş Topu', staff: 'item:asa_ates', kind: 'projectile', manaCost: 12, cooldown: 1.0,
  projectile: 'buyuates', speed: 22, gravity: 3, life: 3, damage: 7, radius: 2.2, burn: 1, slow: 0, color: 0xff7a2a,
  desc: 'Çarptığı yerde patlayıp yakan bir ateş topu fırlatır.',
});
S({
  key: 'buz_mizragi', name: 'Buz Mızrağı', staff: 'item:asa_buz', kind: 'projectile', manaCost: 10, cooldown: 0.8,
  projectile: 'buyubuz', speed: 30, gravity: 0, life: 2.2, damage: 5, radius: 0, burn: 0, slow: 1, color: 0x9fdcff,
  desc: 'Hızlı bir buz mızrağı atar; vurduğu yaratığı yavaşlatır.',
});
S({
  key: 'sifa_isigi', name: 'Şifa Işığı', staff: 'item:asa_sifa', kind: 'heal', manaCost: 25, cooldown: 4, heal: 8, color: 0x7dffb0,
  desc: 'Seni iyileştiren yumuşak bir ışık saçar (8 can).',
});
S({
  key: 'kuantum_sicrayisi', name: 'Kuantum Sıçrayışı', staff: 'item:asa_kuantum', kind: 'blink', manaCost: 20, cooldown: 3,
  distance: 8, color: 0xb25cff,
  desc: 'Baktığın yönde kısa mesafe ışınlanırsın (8 blok).',
});

export const SPELL_LIST = Object.freeze(spellList);
export const SPELLS = Object.freeze(spellTable);
export function spellDef(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(spellTable, key) ? spellTable[key] : null;
}
/** Asa eşya anahtarı → büyü anahtarı | null. */
export function spellForStaff(itemKey) {
  for (let i = 0; i < spellList.length; i++) if (spellList[i].staff === itemKey) return spellList[i].key;
  return null;
}
export const STAFF_DURABILITY = 250;

/* ------------------------------------------------------------------------------------------------
 * Durum etkileri (iksir, büyü, kuşanılan eşya ipuçları)
 *   mods(level) → mods nesnesine uygulanacak kısmi değerler (magicMods.js birleştirir)
 * ---------------------------------------------------------------------------------------------- */
const effectList = [];
const effectTable = Object.create(null);
function X(key, name, icon, desc, mods) {
  const rec = Object.freeze({ key, name, icon, desc, mods });
  effectList.push(rec);
  effectTable[key] = rec;
}
X('hiz', 'Hız', 'hiz', 'Hareket hızı artar.', (l) => ({ speedMul: 1 + 0.3 * l }));
X('ziplama', 'Zıplama', 'ziplama', 'Daha yükseğe zıplarsın.', (l) => ({ jumpMul: 1 + 0.22 * l }));
X('guc', 'Güç', 'guc', 'Saldırı hasarın artar.', (l) => ({ damageMul: 1 + 0.3 * l }));
X('gece_gorusu', 'Gece Görüşü', 'goz', 'Karanlıkta ortalık aydınlık görünür.', () => ({ nightVision: true }));
X('ates_direnci', 'Ateş Direnci', 'ates', 'Lav ve ateşten zarar görmezsin.', () => ({ fireMul: 0 }));
X('su_solugu', 'Su Altı Soluğu', 'su', 'Su altında nefessiz kalmazsın.', () => ({ waterBreathing: true }));
X('yenilenme', 'Yenilenme', 'kalp', 'Canın yavaşça yenilenir.', (l) => ({ regen: 0.4 * l }));

export const EFFECT_LIST = Object.freeze(effectList);
export const EFFECTS = Object.freeze(effectTable);
export function effectDef(key) {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(effectTable, key) ? effectTable[key] : null;
}

/* ------------------------------------------------------------------------------------------------
 * Yeni eşyalar (items.js sonuna eklenir). Alanlar items.js `add` ile aynı; `magic` / `potion` yeni alanlardır.
 *   magic:{staff:true, spell}  magic:{manaCrystal:true}      potion:{effect?,level?,seconds?,heal?,mana?}
 * ---------------------------------------------------------------------------------------------- */
const itemDefs = [];
function I(key, name, kind, o) {
  itemDefs.push(Object.freeze(Object.assign({ key, name, kind }, o)));
}
I(ITEM_DUST, 'Büyü Tozu', 'malzeme', {
  desc: 'Büyü Masası\'nda büyü yapmanın bedeli. Kuantum kristali, ametist ve sandıklardan çıkar.', color: 0xb68cff, rarity: 'seyrek',
});
I(ITEM_SHARD, 'Kuantum Kıymığı', 'malzeme', {
  desc: 'Yüksek kademe büyüler ve Büyü Masası için. Kristal böcekleri ve kristal kayadan çıkar.', color: 0xd9a8ff, rarity: 'seyrek',
});
I(ITEM_MANA_CRYSTAL, 'Mana Kristali', 'özel', {
  desc: 'Kullanınca azami manan 10 artar (en çok +100).', color: 0x5ab8ff, rarity: 'nadir', stack: 16,
  magic: { manaCrystal: true },
});
I('item:asa_ates', 'Ateş Topu Asası', 'özel', {
  desc: 'Sağ tıkla: ateş topu fırlat.', model: 'staff', color: 0xff7a2a, rarity: 'nadir', durability: STAFF_DURABILITY,
  magic: { staff: true, spell: 'ates_topu' },
});
I('item:asa_buz', 'Buz Asası', 'özel', {
  desc: 'Sağ tıkla: buz mızrağı at.', model: 'staff', color: 0x9fdcff, rarity: 'nadir', durability: STAFF_DURABILITY,
  magic: { staff: true, spell: 'buz_mizragi' },
});
I('item:asa_sifa', 'Şifa Asası', 'özel', {
  desc: 'Sağ tıkla: seni iyileştiren bir ışık saç.', model: 'staff', color: 0x7dffb0, rarity: 'nadir', durability: STAFF_DURABILITY,
  magic: { staff: true, spell: 'sifa_isigi' },
});
I('item:asa_kuantum', 'Kuantum Sıçrayışı Asası', 'özel', {
  desc: 'Sağ tıkla: baktığın yönde kısa mesafe ışınlan.', model: 'staff', color: 0xb25cff, rarity: 'efsanevi',
  durability: STAFF_DURABILITY, magic: { staff: true, spell: 'kuantum_sicrayisi' },
});

/** İksirler: tek içimlik, şişe geri döner. potion.seconds etki süresi (sn). */
export const POTION_DEFS = Object.freeze([
  Object.freeze({
    key: 'item:iksir_guclu_sifa', name: 'Güçlü Şifa İksiri', color: 0xff3f7a, potion: Object.freeze({ heal: 20 }),
    desc: 'Anında 20 can iyileştirir.',
  }),
  Object.freeze({
    key: 'item:iksir_hiz', name: 'Hız İksiri', color: 0x7fe6ff, potion: Object.freeze({ effect: 'hiz', level: 1, seconds: 180 }),
    desc: '3 dakika boyunca %30 daha hızlı koşarsın.',
  }),
  Object.freeze({
    key: 'item:iksir_ziplama', name: 'Zıplama İksiri', color: 0x9dff7f,
    potion: Object.freeze({ effect: 'ziplama', level: 1, seconds: 180 }),
    desc: '3 dakika boyunca çok daha yükseğe zıplarsın.',
  }),
  Object.freeze({
    key: 'item:iksir_guc', name: 'Güç İksiri', color: 0xd9452f, potion: Object.freeze({ effect: 'guc', level: 1, seconds: 120 }),
    desc: '2 dakika boyunca saldırı hasarın %30 artar.',
  }),
  Object.freeze({
    key: 'item:iksir_gece_gorusu', name: 'Gece Görüşü İksiri', color: 0x4a5cff,
    potion: Object.freeze({ effect: 'gece_gorusu', level: 1, seconds: 300 }),
    desc: '5 dakika boyunca karanlıkta görürsün.',
  }),
  Object.freeze({
    key: 'item:iksir_ates_direnci', name: 'Ateş Direnci İksiri', color: 0xff9a3a,
    potion: Object.freeze({ effect: 'ates_direnci', level: 1, seconds: 180 }),
    desc: '3 dakika boyunca lav ve ateş sana zarar vermez.',
  }),
  Object.freeze({
    key: 'item:iksir_su_solugu', name: 'Su Altı Soluğu İksiri', color: 0x3fb8d9,
    potion: Object.freeze({ effect: 'su_solugu', level: 1, seconds: 180 }),
    desc: '3 dakika boyunca su altında nefes alırsın.',
  }),
  Object.freeze({
    key: 'item:iksir_yenilenme', name: 'Yenilenme İksiri', color: 0xff7ab8,
    potion: Object.freeze({ effect: 'yenilenme', level: 1, seconds: 45 }),
    desc: '45 saniye boyunca canın hızla yenilenir.',
  }),
  Object.freeze({
    key: 'item:iksir_mana', name: 'Mana İksiri', color: 0x5ab8ff, potion: Object.freeze({ mana: 50 }),
    desc: 'Anında 50 mana yeniler.',
  }),
]);
POTION_DEFS.forEach((p) => {
  I(p.key, p.name, 'özel', {
    desc: p.desc, color: p.color, rarity: 'seyrek', stack: 8, drink: true, potion: p.potion, model: 'flat',
  });
});

/** Blok eşyaları (id>99 olduğu için items.js otomatik üretmez). */
I('blok:büyü_masası', 'Büyü Masası', 'blok', {
  desc: 'Çevresindeki kitaplıklar büyü kademesini belirler. Eşyalarını büyülemek için kullan.', color: 0x6a4aa8,
  rarity: 'nadir', model: 'cube', placesBlock: MAGIC_BLOCK_IDS.TABLE,
});
I('blok:simya_kazanı', 'Simya Kazanı', 'blok', {
  desc: 'Şişeleri ve malzemeleri koyup 30 saniyede iksir demle.', color: 0x4a6a58,
  rarity: 'seyrek', model: 'cube', placesBlock: MAGIC_BLOCK_IDS.CAULDRON,
});

export const MAGIC_ITEM_DEFS = Object.freeze(itemDefs);
export const MAGIC_ITEM_KEYS = Object.freeze(itemDefs.map((d) => d.key));
export const POTION_KEYS = Object.freeze(POTION_DEFS.map((p) => p.key));
export const STAFF_KEYS = Object.freeze(spellList.map((s) => s.staff));

/** Blok tanımı için kısa veri (blocks.js def() ile kullanır). */
export const MAGIC_BLOCK_DEFS = Object.freeze([
  Object.freeze({
    id: MAGIC_BLOCK_IDS.TABLE, constName: 'MAGIC_TABLE', key: 'büyü_masası', name: 'Büyü Masası',
    tiles: Object.freeze(['büyü_masası_üst', 'bazalt_üst', 'büyü_masası_yan']), interact: 'büyü_masası', emission: 7,
  }),
  Object.freeze({
    id: MAGIC_BLOCK_IDS.CAULDRON, constName: 'ALCHEMY_CAULDRON', key: 'simya_kazanı', name: 'Simya Kazanı',
    tiles: Object.freeze(['simya_kazanı_üst', 'taş_tuğla', 'simya_kazanı_yan']), interact: 'simya_kazanı', emission: 4,
  }),
]);
