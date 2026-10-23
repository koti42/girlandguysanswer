/*
 * KEŞİF sim — eşya, alet, silah, zırh, yiyecek tablosu ve üretim tarifleri (saf).
 *
 * Eşya kimliği string anahtardır: blok eşyaları 'blok:<blokAnahtarı>', diğerleri 'item:<ad>'
 * (örn. 'item:kazma_demir'). itemByKey ASCII takma adlarını da çözer ('item:kazma_ahsap').
 * Kayıt: {key,name,desc,stack,kind,rarity,model,color, durability?, tool?, weapon?, food?, armor?,
 *         placesBlock?, ammo?, ability?, zone?}
 *   kind    'blok'|'alet'|'silah'|'yiyecek'|'malzeme'|'zırh'|'özel'|'anahtar'|'cephane'
 *   model   'cube'|'tool'|'sword'|'bow'|'torch'|'gun'|'flat'|'armor'|'shield'|'boots'|'hook'|'glider'|'compass'
 *   tool    {type,tier,speed,durability}   tier = hasat seviyesi (constants TOOL_TIERS.level)
 *   weapon  {damage,reach,cooldown,ranged?,ammo?,hitscan?,blockDamage?}
 *   food    {hunger,heal}                  armor {slot:'kafa'|'göğüs'|'bacak'|'ayak', defense, set}
 * Dayanıklılığı olan eşya yığılmaz (stack 1).
 *
 * Tarifler şekilsiz (ızgara yok): {id, out:{item,count}, in:[{item,count}], station, category, heat?}.
 * İstasyonlar: 'el' (her zaman), 'tezgah' (tezgah bloğu), 'ocak' (ocak bloğu; yakıt gerekir), 'örs'
 * (demir bloğu). Ocak tarifleri `heat` (ısı birimi) harcar; yakıt FUEL_HEAT tablosundadır.
 */
import { TOOL_TIERS, foldTr } from './constants.js';
import { B, BLOCKS, BLOCK_COLORS, getBlock, toolInfoFromKey } from './blocks.js';
import { CRAFT_BLOCK_ITEMS, CRAFT_FOOD_ITEMS, CRAFT_RECIPES, CRAFT_STATIONS } from './craftData.js';
import { MAGIC_ITEM_DEFS } from './magicData.js';
import { TREE_BLOCK_ITEMS } from './treeData.js';
import { BIOME_BLOCK_ITEMS, BIOME_ITEM_DEFS, BIOME_RECIPES } from './biomeData.js';
import { CITY_BLOCK_ITEMS, CITY_ITEM_DEFS, CITY_RECIPES } from './cityData.js';
import { MAGIC_RECIPES, MAGIC_RECIPE_CATEGORY } from './magicRecipes.js';
import {
  PORTAL_GUN_TECH, TECH_ITEM_DEFS, TECH_RECIPES, TECH_RECIPE_CATEGORY, TECH_STATIONS,
} from './techData.js';

export const ITEM_KINDS = Object.freeze([
  'blok', 'alet', 'silah', 'yiyecek', 'malzeme', 'zırh', 'özel', 'anahtar', 'cephane',
]);
export const RARITIES = Object.freeze(['yaygın', 'seyrek', 'nadir', 'efsanevi']);
export const ARMOR_SLOTS = Object.freeze(['kafa', 'göğüs', 'bacak', 'ayak']);
export const STATIONS = Object.freeze(['el', 'tezgah', 'ocak', 'örs', 'kesici', 'dokuma', 'laboratuvar']);
/** Hangi blok hangi istasyonu sağlar (oyuncuya yakın bloklardan istasyon kümesi türetmek için). */
export const STATION_BLOCKS = Object.freeze({
  tezgah: Object.freeze([B.WORKBENCH]),
  ocak: Object.freeze([B.FURNACE]),
  örs: Object.freeze([B.IRON_BLOCK]),
  kesici: CRAFT_STATIONS.kesici,
  dokuma: CRAFT_STATIONS.dokuma,
  laboratuvar: TECH_STATIONS.laboratuvar,
});
export const RECIPE_CATEGORIES = Object.freeze([
  { key: 'alet', name: 'Aletler' },
  { key: 'silah', name: 'Silahlar' },
  { key: 'zırh', name: 'Zırhlar' },
  { key: 'yiyecek', name: 'Yiyecek' },
  { key: 'yapı', name: 'Yapı Blokları' },
  { key: 'dekor', name: 'Eşya ve Dekor' },
  { key: 'ışık', name: 'Işık' },
  { key: 'malzeme', name: 'Malzemeler' },
  { key: 'ocak', name: 'Ocak' },
  MAGIC_RECIPE_CATEGORY,
  TECH_RECIPE_CATEGORY,
]);

/* ------------------------------------------------------------------------------------------------
 * Eşya tablosu
 * ---------------------------------------------------------------------------------------------- */
const list = [];
// qa5: prototipsiz tablo — ITEMS['constructor'] / ['__proto__'] / ['toString'] gibi düşmanca anahtarlar işlev/nesne DÖNDÜRMEZ (kayıtlı eşya sanılmaz)
const table = Object.create(null);

function add(key, name, kind, o = {}) {
  if (table[key]) throw new Error('Eşya anahtarı çakışması: ' + key);
  const durability = o.durability || 0;
  const rec = {
    key,
    name,
    desc: o.desc || '',
    stack: durability > 0 ? 1 : (o.stack || 64),
    kind,
    rarity: o.rarity || 'yaygın',
    model: o.model || 'flat',
    color: o.color === undefined ? 0xcccccc : o.color,
  };
  if (durability > 0) rec.durability = durability;
  ['tool', 'weapon', 'food', 'armor', 'placesBlock', 'ammo', 'ability', 'zone', 'shield', 'drink', 'magic', 'potion', 'tech'].forEach((f) => {
    if (o[f] !== undefined) rec[f] = o[f];
  });
  table[key] = Object.freeze(rec);
  list.push(table[key]);
}

/* --- blok eşyaları (otomatik) --- */
const RARE_BLOCK_GROUPS = { maden: 'seyrek' };
BLOCKS.forEach((b) => {
  if (b.id < 1 || !b.buildable || !b.placeable) return;
  let rarity = RARE_BLOCK_GROUPS[b.group] || 'yaygın';
  if (b.id === B.QUANTUM_BLOCK || b.id === B.DIAMOND_BLOCK || b.id === B.LAVA) rarity = 'nadir';
  add('blok:' + b.key, b.name, 'blok', {
    desc: b.interact ? b.name + ' (etkileşimli blok).' : b.name + ' bloğu.',
    placesBlock: b.id,
    rarity,
    model: b.shape === 'torch' ? 'torch' : b.shape === 'cross' ? 'flat' : 'cube',
    color: 0x888888,
  });
});

/* --- aletler: kazma, balta, kürek (7 kademe) + kılıçlar --- */
const TOOL_DEFS = [
  { type: 'kazma', name: 'Kazma', dmg: (d) => Math.max(1, d - 1.5), cd: 0.6, reach: 2.8 },
  { type: 'balta', name: 'Balta', dmg: (d) => d + 1, cd: 0.85, reach: 3 },
  { type: 'kürek', name: 'Kürek', dmg: (d) => Math.max(1, d - 2), cd: 0.6, reach: 2.8 },
];
TOOL_TIERS.forEach((t) => {
  TOOL_DEFS.forEach((d) => {
    add('item:' + d.type + '_' + t.key, t.name + ' ' + d.name, 'alet', {
      desc: d.type === 'kazma' ? 'Taş ve madenleri kırar.' : d.type === 'balta' ? 'Ağaç ve tahtayı keser.' : 'Toprak, kum ve karı kazar.',
      model: 'tool',
      color: t.color,
      durability: t.durability,
      rarity: t.level >= 5 ? 'nadir' : 'yaygın',
      tool: { type: d.type, tier: t.level, speed: t.speed, durability: t.durability },
      weapon: { damage: d.dmg(t.damage), reach: d.reach, cooldown: d.cd },
    });
  });
  add('item:kılıç_' + t.key, t.name + ' Kılıç', 'silah', {
    desc: 'Yaratıklara karşı en hızlı yakın dövüş silahı.',
    model: 'sword',
    color: t.color,
    durability: t.durability,
    rarity: t.level >= 5 ? 'nadir' : 'yaygın',
    tool: { type: 'kılıç', tier: t.level, speed: t.speed, durability: t.durability },
    weapon: { damage: t.damage, reach: 3.2, cooldown: 0.45 },
  });
});

/* --- menzilli silahlar, kalkan, cephane --- */
add('item:yay', 'Yay', 'silah', {
  desc: 'Ok atar. Basılı tutarak ger.',
  model: 'bow', color: 0x8a5a33, durability: 384,
  weapon: { damage: 6, reach: 48, cooldown: 0.9, ranged: true, ammo: 'item:ok' },
});
add('item:ok', 'Ok', 'cephane', { desc: 'Yay için cephane.', color: 0xc9b48a, ammo: 'ok' });
add('item:ışın_tüfeği', 'Işın Tüfeği', 'silah', {
  desc: 'Enerji hücresiyle ışın atar; blokları yavaşça kırabilir.',
  model: 'gun', color: 0x5ad7ff, durability: 600, rarity: 'nadir',
  weapon: { damage: 8, reach: 60, cooldown: 0.35, ranged: true, ammo: 'item:enerji_hücresi', hitscan: true, blockDamage: true },
});
add('item:enerji_hücresi', 'Enerji Hücresi', 'cephane', {
  desc: 'Işın tüfeği için cephane.', color: 0x5ad7ff, rarity: 'seyrek', ammo: 'enerji',
});
add('item:kalkan', 'Kalkan', 'özel', {
  desc: 'Önden gelen hasarı azaltır.',
  model: 'shield', color: 0x9aa0a6, durability: 336, shield: { reduce: 0.6 },
});

/* --- zırhlar: 6 set x 4 parça --- */
const ARMOR_SETS = [
  { k: 'deri', n: 'Deri', mat: 'item:deri', def: [1, 3, 2, 1], dur: 5, color: 0x8a5a33, station: 'tezgah' },
  { k: 'bakır', n: 'Bakır', mat: 'item:bakır_külçe', def: [2, 5, 4, 2], dur: 11, color: 0xd1773f, station: 'tezgah' },
  { k: 'demir', n: 'Demir', mat: 'item:demir_külçe', def: [2, 6, 5, 2], dur: 15, color: 0xd6d9dd, station: 'tezgah' },
  { k: 'altın', n: 'Altın', mat: 'item:altın_külçe', def: [2, 5, 3, 1], dur: 7, color: 0xf4c940, station: 'tezgah' },
  { k: 'elmas', n: 'Elmas', mat: 'item:elmas', def: [3, 8, 6, 3], dur: 33, color: 0x4fe3d6, station: 'örs' },
  { k: 'kuantum', n: 'Kuantum', mat: 'item:kuantum_külçe', def: [4, 9, 7, 4], dur: 50, color: 0xb25cff, station: 'örs' },
];
const ARMOR_PARTS = [
  { slot: 'kafa', key: 'miğfer', name: 'Miğfer', base: 11, cost: 5 },
  { slot: 'göğüs', key: 'göğüslük', name: 'Göğüslük', base: 16, cost: 8 },
  { slot: 'bacak', key: 'bacaklık', name: 'Bacaklık', base: 15, cost: 7 },
  { slot: 'ayak', key: 'çizme', name: 'Çizme', base: 13, cost: 4 },
];
ARMOR_SETS.forEach((s) => {
  ARMOR_PARTS.forEach((p, i) => {
    add('item:' + p.key + '_' + s.k, s.n + ' ' + p.name, 'zırh', {
      desc: s.n + ' zırh parçası.',
      model: 'armor', color: s.color, durability: p.base * s.dur,
      rarity: s.k === 'kuantum' ? 'efsanevi' : s.k === 'elmas' ? 'nadir' : 'yaygın',
      armor: { slot: p.slot, defense: s.def[i], set: s.k },
    });
  });
});

/* --- yiyecekler --- */
const FOODS = [
  ['elma', 'Elma', 4, 0, 0xd8322f, 'yaygın'],
  ['çilek', 'Çilek', 2, 0, 0xe0386b, 'yaygın'],
  ['havuç', 'Havuç', 3, 0, 0xee8a2a, 'yaygın'],
  ['patates', 'Patates', 1, 0, 0xc9a35a, 'yaygın'],
  ['pişmiş_patates', 'Pişmiş Patates', 5, 1, 0xb88a3a, 'yaygın'],
  ['çiğ_tavuk', 'Çiğ Tavuk', 2, 0, 0xe8b8a0, 'yaygın'],
  ['pişmiş_tavuk', 'Pişmiş Tavuk', 6, 1, 0xc98a45, 'yaygın'],
  ['çiğ_koyun_eti', 'Çiğ Koyun Eti', 3, 0, 0xc0505a, 'yaygın'],
  ['pişmiş_koyun_eti', 'Pişmiş Koyun Eti', 8, 2, 0x8a5a38, 'yaygın'],
  ['çiğ_balık', 'Çiğ Balık', 2, 0, 0x8fb8d0, 'yaygın'],
  ['pişmiş_balık', 'Pişmiş Balık', 5, 1, 0xc08a58, 'yaygın'],
  ['mantar_çorbası', 'Mantar Çorbası', 6, 2, 0xb08a68, 'seyrek'],
  ['meyve_salatası', 'Meyve Salatası', 7, 2, 0xf06a5a, 'seyrek'],
  ['altın_elma', 'Altın Elma', 4, 8, 0xf4c940, 'nadir'],
];
FOODS.forEach((f) => {
  add('item:' + f[0], f[1], 'yiyecek', {
    desc: 'Açlığı ' + f[2] + (f[3] > 0 ? ' doldurur, ' + f[3] + ' can iyileştirir.' : ' doldurur.'),
    color: f[4], rarity: f[5], food: { hunger: f[2], heal: f[3] }, stack: 32,
  });
});
add('item:şifa_iksiri', 'Şifa İksiri', 'yiyecek', {
  desc: 'İçilince 12 can iyileştirir.', color: 0xff5a8a, rarity: 'seyrek', stack: 8, drink: true,
  food: { hunger: 0, heal: 12 },
});

/* --- malzemeler --- */
const MATERIALS = [
  ['sopa', 'Sopa', 0xa87a45, 'Alet ve silah sapı.'],
  ['kömür', 'Kömür', 0x2b2b30, 'Yakıt ve meşale malzemesi.'],
  ['odun_kömürü', 'Odun Kömürü', 0x3a3430, 'Kütükten ocakta yapılır; yakıttır.'],
  ['ham_bakır', 'Ham Bakır', 0xc98a5a, 'Ocakta eritilir.'],
  ['ham_demir', 'Ham Demir', 0xc8b0a0, 'Ocakta eritilir.'],
  ['ham_altın', 'Ham Altın', 0xe8d070, 'Ocakta eritilir.'],
  ['bakır_külçe', 'Bakır Külçe', 0xd1773f, 'Bakır alet ve zırh yapımı.'],
  ['demir_külçe', 'Demir Külçe', 0xd6d9dd, 'Demir alet, zırh ve düzenekler.'],
  ['altın_külçe', 'Altın Külçe', 0xf4c940, 'Hızlı ama kırılgan aletler.'],
  ['elmas', 'Elmas', 0x4fe3d6, 'En sert doğal malzeme.'],
  ['zümrüt', 'Zümrüt', 0x3fd070, 'Parlak bir değerli taş.'],
  ['kuantum_parçası', 'Kuantum Parçası', 0xb25cff, 'Derinlerdeki kuantum kristalinden kopar.'],
  ['kuantum_külçe', 'Kuantum Külçe', 0xc98cff, 'Kuantum alet ve zırhların temeli.'],
  ['kızıltaş_tozu', 'Kızıltaş Tozu', 0xd0302a, 'Enerji ve düzenek malzemesi.'],
  ['ip', 'İp', 0xe8e0d0, 'Yün ipliği.'],
  ['yün', 'Yün', 0xf2f2ee, 'Koyundan elde edilir.'],
  ['deri', 'Deri', 0x8a5a33, 'Hayvanlardan elde edilir.'],
  ['tüy', 'Tüy', 0xf5f5f0, 'Ok yapımında kullanılır.'],
  ['çakmaktaşı', 'Çakmaktaşı', 0x55575c, 'Ok ucu için sivri taş.'],
  ['kemik', 'Kemik', 0xeeeadc, 'Kemikçilerden düşer.'],
  ['kil_topu', 'Kil Topu', 0xa9b0c0, 'Ocakta tuğlaya dönüşür.'],
  ['tuğla', 'Tuğla Parçası', 0xb5533c, 'Dört tanesiyle tuğla bloğu.'],
  ['kristal_tozu', 'Kristal Tozu', 0x7fd8ff, 'Kristal kayadan çıkar; mavi boya ve ışık.'],
  ['ametist_parçası', 'Ametist Parçası', 0xb06ae8, 'Mor boya ve süs.'],
  ['kağıt', 'Kağıt', 0xf0ead8, 'Uzun otlardan yapılır.'],
  ['kitap', 'Kitap', 0x8a4a2a, 'Kitaplık yapımında kullanılır.'],
  ['kase', 'Kase', 0xa87a45, 'Çorba ve salata için.'],
  ['cam_şişe', 'Cam Şişe', 0xcfeaf5, 'İksir için şişe.'],
  ['kök_özü', 'Kök Özü', 0x4faa3a, 'Kök Ana yenilince düşer.', 'efsanevi'],
  ['taş_kalp', 'Taş Kalp', 0x9a8f80, 'Taş Bekçi yenilince düşer.', 'efsanevi'],
  ['buz_kalbi', 'Buz Kalbi', 0x9ad8f8, 'Buz Kral yenilince düşer.', 'efsanevi'],
  ['gölge_özü', 'Gölge Özü', 0x4a2a7a, 'Gölge Hükümdar yenilince düşer.', 'efsanevi'],
  ['yıldız', 'Parkur Yıldızı', 0xffe066, 'Parkur ödülü; kozmetik puan.', 'nadir'],
];
MATERIALS.forEach((m) => {
  add('item:' + m[0], m[1], 'malzeme', { desc: m[3], color: m[2], rarity: m[4] || 'yaygın' });
});
BLOCK_COLORS.forEach((c) => {
  add('item:boya_' + c.key, c.name + ' Boya', 'malzeme', { desc: 'Cam, beton ve kumaş boyar.', color: c.hex });
});

/* --- anahtarlar --- */
const ZONE_NAMES = ['Başlangıç Vadisi', 'Fısıldayan Ormanlar', 'Yanık Kanyonlar', 'Donmuş Zirveler', 'Çekirdek'];
ZONE_NAMES.forEach((zn, i) => {
  add('item:anahtar_kristali_z' + i, 'Anahtar Kristali (' + zn + ')', 'anahtar', {
    desc: zn + ' mührünü açmak için sunağa konur.', color: 0x7fe8ff, rarity: 'nadir', stack: 8, zone: i,
  });
});
add('item:küçük_anahtar', 'Küçük Anahtar', 'anahtar', {
  desc: 'Kilitli bir kapıyı açar.', color: 0xd6d9dd, rarity: 'seyrek', stack: 16,
});
add('item:boss_anahtarı', 'Boss Anahtarı', 'anahtar', {
  desc: 'Boss kapısını açar.', color: 0xff7a3a, rarity: 'nadir', stack: 4,
});

/* --- özel (yetenek) eşyaları --- */
add('item:çift_zıplama_botları', 'Çift Zıplama Botları', 'özel', {
  desc: 'Havadayken bir kez daha zıplamanı sağlar.', model: 'boots', color: 0x5ad7ff, rarity: 'efsanevi',
  stack: 1, ability: 'doubleJump',
});
add('item:kanca', 'Kanca', 'özel', {
  desc: 'Kanca noktalarına tutunarak sallan.', model: 'hook', color: 0xd6d9dd, rarity: 'efsanevi',
  stack: 1, ability: 'grapple',
});
add('item:planör', 'Planör', 'özel', {
  desc: 'Havada süzül; uçurumları aş.', model: 'glider', color: 0xf0f0f0, rarity: 'efsanevi',
  stack: 1, ability: 'glide',
});
add('item:portal_tabancası', 'Kuantum Portal Tabancası', 'özel', {
  desc: 'İki renkli portal açar: mavi ve turuncu.', model: 'gun', color: 0xff9a3a, rarity: 'efsanevi',
  stack: 1, ability: 'portalGun', tech: PORTAL_GUN_TECH,
});
add('item:pusula', 'Pusula', 'özel', {
  desc: 'Başlangıç noktasının yönünü gösterir.', model: 'compass', color: 0xd6d9dd, rarity: 'seyrek', stack: 1,
});

/* --- üretim genişletmesi (craftData.js): yeni blok eşyaları ve yemekler --- */
CRAFT_BLOCK_ITEMS.forEach((d) => {
  add(d.key, d.name, 'blok', {
    desc: d.desc, placesBlock: d.placesBlock, rarity: d.rarity, model: d.model, color: d.color,
  });
});
CRAFT_FOOD_ITEMS.forEach((f) => {
  add(f.key, f.name, 'yiyecek', {
    desc: 'Açlığı ' + f.hunger + ' doldurur, ' + f.heal + ' can iyileştirir.',
    color: f.color, rarity: f.rarity, food: { hunger: f.hunger, heal: f.heal }, stack: 32,
  });
});

/* --- büyü sistemi (magicData.js): büyü tozu, asalar, iksirler, masa/kazan eşyaları --- */
MAGIC_ITEM_DEFS.forEach((d) => add(d.key, d.name, d.kind, d));

/* --- ağaç devirme (treeData.js): fidan eşyaları --- */
TREE_BLOCK_ITEMS.forEach((d) => {
  add(d.key, d.name, 'blok', {
    desc: d.desc, placesBlock: d.placesBlock, rarity: d.rarity, model: d.model, color: d.color,
  });
});

/* --- teknoloji (techData.js): malzemeler, cihazlar, elektrikli aletler, kuantum zırhı, makine blok eşyaları --- */
TECH_ITEM_DEFS.forEach((d) => add(d.key, d.name, d.kind, d));

/* --- biyom genişletmesi (biomeData.js): yeni ağaç/bitki/arazi blok eşyaları + parlak meyve --- */
BIOME_BLOCK_ITEMS.forEach((d) => {
  add(d.key, d.name, 'blok', {
    desc: d.desc, placesBlock: d.placesBlock, rarity: d.rarity, model: d.model, color: d.color,
  });
});
BIOME_ITEM_DEFS.forEach((d) => add(d.key, d.name, d.kind, d));

/* --- Neon Meridyen şehir blokları (cityData.js): 223–238 dekor blok eşyaları --- */
CITY_BLOCK_ITEMS.forEach((d) => add(d.key, d.name, 'blok', d));
CITY_ITEM_DEFS.forEach((d) => add(d.key, d.name, d.kind, d)); // kimlik kartları (locks_hack)

export const ITEMS = Object.freeze(table);
export const ITEM_LIST = Object.freeze(list.slice());

const aliasMap = new Map();
list.forEach((it) => aliasMap.set(foldTr(it.key), it));

/* ------------------------------------------------------------------------------------------------
 * Sorgular
 * ---------------------------------------------------------------------------------------------- */
/** Anahtar (ASCII takma adı da olur) → eşya kaydı | null. */
export function itemByKey(key) {
  if (typeof key !== 'string') return null;
  return table[key] || aliasMap.get(foldTr(key)) || null;
}
/** Anahtarı kanonik biçime çevirir (bilinmiyorsa null). */
export function canonicalItemKey(key) {
  const it = itemByKey(key);
  return it ? it.key : null;
}
/** Blok kimliği → 'blok:<anahtar>' (hava için null). */
export function blockItemKey(id) {
  if (!(id >= 1)) return null;
  const b = getBlock(id);
  return b.id === id ? 'blok:' + b.key : null;
}
/** Eşya bir bloğu yerleştiriyorsa blok kimliği; aksi halde 0 (hava). */
export function itemToBlockId(key) {
  const it = itemByKey(key);
  return it && it.placesBlock ? it.placesBlock : 0;
}
export function maxStack(key) {
  const it = itemByKey(key);
  return it ? it.stack : 0;
}
export function maxDurability(key) {
  const it = itemByKey(key);
  return it && it.durability ? it.durability : 0;
}
/** Eşya bu bloğa uygun alet mi ve hız çarpanı (uygun değilse 1). */
export function toolSpeed(itemKey, blockId) {
  const info = toolInfoFromKey(itemKey);
  const b = getBlock(blockId);
  if (!info || !b.tool || info.type !== b.tool) return 1;
  return info.speed;
}
export function armorSlotIndex(slot) {
  return ARMOR_SLOTS.indexOf(slot);
}

/* ------------------------------------------------------------------------------------------------
 * Yakıt (ocak). Bir eritme SMELT_HEAT ısı harcar; yakıt eşyası kendi ısısını envantere ekler.
 * ---------------------------------------------------------------------------------------------- */
export const SMELT_HEAT = 10;
export const FUEL_HEAT = Object.freeze({
  'blok:akasya_tahta': 10,
  'blok:çam_tahta': 10,
  'blok:huş_tahta': 10,
  'blok:meşe_tahta': 10,
  'blok:akasya_kütük': 15,
  'blok:çam_kütük': 15,
  'blok:huş_kütük': 15,
  'blok:meşe_kütük': 15,
  'blok:kiraz_kütük': 15,
  'blok:cangıl_kütük': 15,
  'blok:mangrov_kütük': 15,
  'blok:kiraz_tahta': 10,
  'blok:cangıl_tahta': 10,
  'blok:mangrov_tahta': 10,
  'blok:bambu_tahta': 8,
  'blok:bambu': 4,
  'blok:kuru_çalı': 4,
  'item:sopa': 5,
  'item:odun_kömürü': 80,
  'item:kömür': 80,
});
export function fuelHeat(key) {
  return FUEL_HEAT[key] || 0;
}

/* ------------------------------------------------------------------------------------------------
 * Tarifler
 * ---------------------------------------------------------------------------------------------- */
const recipes = [];
const recipeIds = new Set();
const PL = 'blok:meşe_tahta';
const ST = 'item:sopa';

function R(id, out, outCount, ins, station, category) {
  if (recipeIds.has(id)) throw new Error('Tarif kimliği çakışması: ' + id);
  recipeIds.add(id);
  const rec = {
    id,
    out: { item: out, count: outCount },
    in: ins.map((p) => ({ item: p[0], count: p[1] })),
    station,
    category,
  };
  if (station === 'ocak') rec.heat = SMELT_HEAT;
  recipes.push(Object.freeze(rec));
  Object.freeze(rec.out);
  rec.in.forEach(Object.freeze);
  Object.freeze(rec.in);
}

/* ahşap işleme */
['meşe', 'huş', 'çam', 'akasya'].forEach((w) => {
  R('tahta_' + w, 'blok:' + w + '_tahta', 4, [['blok:' + w + '_kütük', 1]], 'el', 'yapı');
  if (w !== 'meşe') R('tahta_çevir_' + w, PL, 1, [['blok:' + w + '_tahta', 1]], 'el', 'yapı');
});
R('sopa', ST, 4, [[PL, 2]], 'el', 'malzeme');
R('tezgah', 'blok:tezgah', 1, [[PL, 4]], 'el', 'dekor');
R('ocak', 'blok:ocak', 1, [['blok:kırıktaş', 8]], 'tezgah', 'dekor');
R('sandık', 'blok:sandık', 1, [[PL, 8]], 'tezgah', 'dekor');

/* aletler ve kılıçlar */
const TIER_MATS = {
  ahşap: [PL, 'tezgah'],
  taş: ['blok:kırıktaş', 'tezgah'],
  bakır: ['item:bakır_külçe', 'tezgah'],
  demir: ['item:demir_külçe', 'tezgah'],
  altın: ['item:altın_külçe', 'tezgah'],
  elmas: ['item:elmas', 'örs'],
  kuantum: ['item:kuantum_külçe', 'örs'],
};
TOOL_TIERS.forEach((t) => {
  const mat = TIER_MATS[t.key][0];
  const st = TIER_MATS[t.key][1];
  R('kazma_' + t.key, 'item:kazma_' + t.key, 1, [[mat, 3], [ST, 2]], st, 'alet');
  R('balta_' + t.key, 'item:balta_' + t.key, 1, [[mat, 3], [ST, 2]], st, 'alet');
  R('kürek_' + t.key, 'item:kürek_' + t.key, 1, [[mat, 1], [ST, 2]], st, 'alet');
  R('kılıç_' + t.key, 'item:kılıç_' + t.key, 1, [[mat, 2], [ST, 1]], st, 'silah');
});

/* zırhlar */
ARMOR_SETS.forEach((s) => {
  ARMOR_PARTS.forEach((p) => {
    R(p.key + '_' + s.k, 'item:' + p.key + '_' + s.k, 1, [[s.mat, p.cost]], s.station, 'zırh');
  });
});

/* ocak: eritme, pişirme, kömür */
R('ocak:bakır', 'item:bakır_külçe', 1, [['item:ham_bakır', 1]], 'ocak', 'ocak');
R('ocak:demir', 'item:demir_külçe', 1, [['item:ham_demir', 1]], 'ocak', 'ocak');
R('ocak:altın', 'item:altın_külçe', 1, [['item:ham_altın', 1]], 'ocak', 'ocak');
R('ocak:kuantum', 'item:kuantum_külçe', 1, [['item:kuantum_parçası', 2]], 'ocak', 'ocak');
R('ocak:cam', 'blok:cam', 1, [['blok:kum', 1]], 'ocak', 'ocak');
R('ocak:taş', 'blok:taş', 1, [['blok:kırıktaş', 1]], 'ocak', 'ocak');
R('ocak:tuğla', 'item:tuğla', 1, [['item:kil_topu', 1]], 'ocak', 'ocak');
['meşe', 'huş', 'çam', 'akasya'].forEach((w) => {
  R('ocak:odun_kömürü_' + w, 'item:odun_kömürü', 1, [['blok:' + w + '_kütük', 1]], 'ocak', 'ocak');
});
R('ocak:pişmiş_tavuk', 'item:pişmiş_tavuk', 1, [['item:çiğ_tavuk', 1]], 'ocak', 'yiyecek');
R('ocak:pişmiş_koyun_eti', 'item:pişmiş_koyun_eti', 1, [['item:çiğ_koyun_eti', 1]], 'ocak', 'yiyecek');
R('ocak:pişmiş_balık', 'item:pişmiş_balık', 1, [['item:çiğ_balık', 1]], 'ocak', 'yiyecek');
R('ocak:pişmiş_patates', 'item:pişmiş_patates', 1, [['item:patates', 1]], 'ocak', 'yiyecek');

/* külçe <-> blok */
[
  ['bakır', 'item:bakır_külçe', B.COPPER_BLOCK],
  ['demir', 'item:demir_külçe', B.IRON_BLOCK],
  ['altın', 'item:altın_külçe', B.GOLD_BLOCK],
  ['elmas', 'item:elmas', B.DIAMOND_BLOCK],
  ['kuantum', 'item:kuantum_külçe', B.QUANTUM_BLOCK],
].forEach((m) => {
  const blockKey = 'blok:' + getBlock(m[2]).key;
  R('blok_' + m[0], blockKey, 1, [[m[1], 9]], 'tezgah', 'yapı');
  R('blok_aç_' + m[0], m[1], 9, [[blockKey, 1]], 'tezgah', 'malzeme');
});

/* boyalar */
R('boya_beyaz', 'item:boya_beyaz', 2, [['item:kemik', 1]], 'el', 'malzeme');
R('boya_siyah', 'item:boya_siyah', 1, [['item:kömür', 1]], 'el', 'malzeme');
R('boya_kırmızı', 'item:boya_kırmızı', 2, [['blok:gelincik', 1]], 'el', 'malzeme');
R('boya_sarı', 'item:boya_sarı', 2, [['blok:sarı_çiçek', 1]], 'el', 'malzeme');
R('boya_yeşil', 'item:boya_yeşil', 2, [['blok:yosun', 1]], 'el', 'malzeme');
R('boya_mavi', 'item:boya_mavi', 2, [['item:kristal_tozu', 1]], 'el', 'malzeme');
R('boya_mor', 'item:boya_mor', 2, [['item:ametist_parçası', 1]], 'el', 'malzeme');
R('boya_turuncu', 'item:boya_turuncu', 2, [['item:boya_kırmızı', 1], ['item:boya_sarı', 1]], 'el', 'malzeme');

/* renkli cam, beton, kumaş */
R('kumaş_beyaz', 'blok:kumaş_beyaz', 1, [['item:ip', 4]], 'tezgah', 'yapı');
BLOCK_COLORS.forEach((c) => {
  R('cam_' + c.key, 'blok:cam_' + c.key, 4, [['blok:cam', 4], ['item:boya_' + c.key, 1]], 'el', 'yapı');
  R('beton_' + c.key, 'blok:beton_' + c.key, 8,
    [['blok:kum', 4], ['blok:çakıl', 4], ['item:boya_' + c.key, 1]], 'tezgah', 'yapı');
  if (c.key !== 'beyaz') {
    R('kumaş_' + c.key, 'blok:kumaş_' + c.key, 1, [['blok:kumaş_beyaz', 1], ['item:boya_' + c.key, 1]], 'el', 'yapı');
  }
});

/* yapı blokları ve dekor */
R('tuğla', 'blok:tuğla', 1, [['item:tuğla', 4]], 'tezgah', 'yapı');
R('taş_tuğla', 'blok:taş_tuğla', 4, [['blok:taş', 4]], 'tezgah', 'yapı');
R('cilalı_taş', 'blok:cilalı_taş', 4, [['blok:taş', 4]], 'tezgah', 'yapı');
R('sütun', 'blok:sütun', 2, [['blok:cilalı_taş', 2]], 'tezgah', 'yapı');
R('taş_basamak', 'blok:taş_basamak', 4, [['blok:cilalı_taş', 6]], 'tezgah', 'yapı');
R('taş_plaka', 'blok:taş_plaka', 6, [['blok:cilalı_taş', 3]], 'tezgah', 'yapı');
R('kumtaşı', 'blok:kumtaşı', 1, [['blok:kum', 4]], 'el', 'yapı');
R('kil_bloğu', 'blok:kil', 1, [['item:kil_topu', 4]], 'el', 'yapı');
R('kil_topu', 'item:kil_topu', 4, [['blok:kil', 1]], 'el', 'malzeme');
R('kaygan_buz', 'blok:kaygan_buz', 1, [['blok:buz', 4]], 'el', 'yapı');
R('ametist_kümesi', 'blok:ametist_kümesi', 1, [['item:ametist_parçası', 4]], 'el', 'yapı');
R('çit', 'blok:çit', 3, [[PL, 4], [ST, 2]], 'tezgah', 'dekor');
R('kapı', 'blok:kapı', 3, [[PL, 6]], 'tezgah', 'dekor');
R('yatak', 'blok:yatak', 1, [['item:yün', 3], [PL, 3]], 'tezgah', 'dekor');
R('kitaplık', 'blok:kitaplık', 1, [[PL, 6], ['item:kitap', 3]], 'tezgah', 'dekor');
R('işaret_levhası', 'blok:işaret_levhası', 3, [[PL, 6], [ST, 1]], 'tezgah', 'dekor');
R('zıplama_bloğu', 'blok:zıplama_bloğu', 1, [['item:yün', 4], ['item:demir_külçe', 1]], 'tezgah', 'dekor');
R('meşale_kömür', 'blok:meşale', 4, [['item:kömür', 1], [ST, 1]], 'el', 'ışık');
R('meşale_odun_kömürü', 'blok:meşale', 4, [['item:odun_kömürü', 1], [ST, 1]], 'el', 'ışık');
R('fener', 'blok:fener', 1, [['blok:meşale', 1], ['item:demir_külçe', 1]], 'tezgah', 'ışık');
R('ışık_bloğu', 'blok:ışık_bloğu', 1, [['item:kristal_tozu', 4], ['blok:meşale', 1]], 'tezgah', 'ışık');

/* ara malzemeler */
R('ip', 'item:ip', 4, [['item:yün', 1]], 'el', 'malzeme');
R('kağıt', 'item:kağıt', 3, [['blok:uzun_ot', 3]], 'el', 'malzeme');
R('kitap', 'item:kitap', 1, [['item:kağıt', 3], ['item:deri', 1]], 'el', 'malzeme');
R('kase', 'item:kase', 4, [[PL, 3]], 'el', 'malzeme');
R('cam_şişe', 'item:cam_şişe', 3, [['blok:cam', 3]], 'tezgah', 'malzeme');

/* silah ve donanım */
R('yay', 'item:yay', 1, [[ST, 3], ['item:ip', 3]], 'tezgah', 'silah');
R('ok', 'item:ok', 4, [['item:çakmaktaşı', 1], [ST, 1], ['item:tüy', 1]], 'tezgah', 'silah');
R('kalkan', 'item:kalkan', 1, [[PL, 6], ['item:demir_külçe', 1]], 'tezgah', 'silah');
R('enerji_hücresi', 'item:enerji_hücresi', 4,
  [['item:kuantum_parçası', 1], ['item:kızıltaş_tozu', 1], ['item:demir_külçe', 1]], 'örs', 'silah');
R('ışın_tüfeği', 'item:ışın_tüfeği', 1,
  [['item:demir_külçe', 4], ['item:kuantum_parçası', 2], ['item:kızıltaş_tozu', 2], ['blok:cam', 1]], 'örs', 'silah');
R('pusula', 'item:pusula', 1, [['item:demir_külçe', 4], ['item:kızıltaş_tozu', 1]], 'tezgah', 'malzeme');

/* yiyecek */
R('mantar_çorbası', 'item:mantar_çorbası', 1, [['blok:ışıklı_mantar', 2], ['item:kase', 1]], 'el', 'yiyecek');
R('meyve_salatası', 'item:meyve_salatası', 1,
  [['item:elma', 1], ['item:çilek', 2], ['item:kase', 1]], 'el', 'yiyecek');
R('altın_elma', 'item:altın_elma', 1, [['item:altın_külçe', 8], ['item:elma', 1]], 'tezgah', 'yiyecek');
R('şifa_iksiri', 'item:şifa_iksiri', 1,
  [['item:cam_şişe', 1], ['item:çilek', 2], ['item:kızıltaş_tozu', 1]], 'tezgah', 'yiyecek');

/* üretim genişletmesi (craftData.js) */
CRAFT_RECIPES.forEach((r) => R(r[0], r[1], r[2], r[3], r[4], r[5]));
/* büyü sistemi (magicRecipes.js) */
MAGIC_RECIPES.forEach((r) => R(r[0], r[1], r[2], r[3], r[4], r[5]));
/* teknoloji (techData.js) */
TECH_RECIPES.forEach((r) => R(r[0], r[1], r[2], r[3], r[4], r[5]));
/* biyom genişletmesi (biomeData.js): yeni tahtalar, boyalar */
BIOME_RECIPES.forEach((r) => R(r[0], r[1], r[2], r[3], r[4], r[5]));
/* Neon Meridyen şehir blokları (cityData.js): dekor tarifleri */
CITY_RECIPES.forEach((r) => R(r[0], r[1], r[2], r[3], r[4], r[5]));

export const RECIPES = Object.freeze(recipes);

const recipeById = new Map();
recipes.forEach((r) => recipeById.set(r.id, r));
export function getRecipe(id) {
  return recipeById.get(id) || null;
}

function stationList(stationSet) {
  const out = new Set(['el']);
  if (!stationSet) return out;
  if (typeof stationSet === 'string') {
    out.add(stationSet);
  } else if (typeof stationSet.forEach === 'function') {
    stationSet.forEach((s) => out.add(s));
  } else {
    Object.keys(stationSet).forEach((s) => {
      if (stationSet[s]) out.add(s);
    });
  }
  return out;
}

/** İstasyon kümesinde (Set | dizi | nesne) üretilebilen tarifler; 'el' her zaman vardır. */
export function recipesFor(stationSet) {
  const st = stationList(stationSet);
  return recipes.filter((r) => st.has(r.station));
}
export function stationAvailable(recipe, stationSet) {
  return stationList(stationSet).has(recipe.station);
}
export function recipesProducing(itemKey) {
  return recipes.filter((r) => r.out.item === itemKey);
}
export function recipesUsing(itemKey) {
  return recipes.filter((r) => r.in.some((p) => p.item === itemKey));
}

/**
 * Envanter bu tarifin malzemelerini (ve ocak ise yakıtı) karşılıyor mu?
 * stationSet verilirse istasyon da denetlenir. Çıktının sığması Inventory.craft'ta denetlenir.
 */
export function canCraft(inv, recipe, stationSet) {
  if (!recipe) return false;
  if (stationSet !== undefined && !stationAvailable(recipe, stationSet)) return false;
  for (let i = 0; i < recipe.in.length; i++) {
    const p = recipe.in[i];
    if (inv.count(p.item) < p.count) return false;
  }
  if (recipe.heat) {
    // yakıt malzemelerle çakışabilir (ör. odun kömürü tarifi kütük ister, kütük de yakıttır): ingredient çıkarıldıktan sonra kalan yakıt sayılır
    const heat = typeof inv.availableHeat === 'function' ? inv.availableHeat(recipe.in) : 0;
    if (heat < recipe.heat) return false;
  }
  return true;
}
