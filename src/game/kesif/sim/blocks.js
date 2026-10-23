/*
 * KEŞİF sim — blok tablosu (tek doğruluk kaynağı; saf).
 *
 * Kimlikler Uint8 (0 = hava, MAX_BLOCK_ID = 254; 255 kayıt farkı işaretidir). 1–99 inşa edilebilir (kullanıcı haritasında
 * serbest), 100–127 sistem blokları, 128–135 büyü, 136–159 üretim, 160–199 biyom, 200–222 teknoloji, 223–240 şehir (Neon Meridyen), 241–254 yedek/ağaç (>99 haritada yasak). Aralıklar: arazi 1–19, sıvı 20–23, maden 24–39,
 * bitki/ahşap 40–59, yapı 60–99, sistem 100–127. Yapı sınıfı 99 yuvaya sığmadığı için dört dekor bloğu
 * (kitaplık 18, işaret levhası 19, ışık bloğu 38, zıplama bloğu 39) boş arazi/maden yuvalarındadır
 * (OVERFLOW_BUILD_IDS); ayrım `category` alanındadır, kimlik aralığına güvenme.
 *
 * Kayıt alanları:
 *   id,key,name,category,group  kimlik, anahtar (Türkçe, 'taş'), ad, sınıf, palet grubu
 *   solid       çarpışma kutusu var mı (kapı/kaktüs gibi kısmi kutular da solid) — physics collision[] kullanır
 *   cube        çarpışma tam birim küp mü (hızlı yol)
 *   opaque      arkasını gizler mi (yüz kırpma/ışık için tam opak küp)
 *   transparent !opaque (görüş/ışık geçirir)
 *   liquid, climbable
 *   hardness    elle kırma süresi sn; 0 = anında; -1 = kırılamaz (unbreakable:true)
 *   tool        'kazma'|'balta'|'kürek'|'kılıç'|null; toolTier gereken hasat seviyesi (0 = elle olur)
 *   drops       'self' | [{item,min,max,chance}] (resolveDrops çözer)
 *   tiles       {top,bottom,side} atlas dokusu İNDEKSLERİ; tileNames aynı üçlü, AD olarak
 *   emission    0..15 blok ışığı; lightFilter 0..15 geçerken sönümleme (opak = 15)
 *   sound       'taş'|'toprak'|'kum'|'ahşap'|'cam'|'su'|'çim'|'metal'|'yaprak'|'kar'
 *   tint        'grass'|'foliage'|'water'|null; tintFaces ('top'|'all')
 *   placeable   oyuncu yerleştirebilir mi (sıvı kaynakları yalnız yaratıcı modda anlamlı)
 *   shape       'cube'|'cross'|'slab'|'stair'|'fence'|'torch'|'plate'|'door'|'liquid'
 *   collision   [[x0,y0,z0,x1,y1,z1],...] blok-yerel 0..1 (solid olmayanda boş)
 *   layer       'opaque'|'cutout'|'transparent' çizim geçişi; cullSame aynı bloklar arası yüz çizme
 *   interact    etkileşim etiketi (sandık, tezgah, ocak, kapı, kol, …) | null
 *   slip        0..1 kayma (buz); bounce zıplama bloğu fırlatma çarpanı; damage temas hasarı (can/sn)
 *   rune        {color,symbol} (rün taşları)
 *   buildable   id <= BUILDABLE_MAX
 */
import { BUILDABLE_MAX, MAX_BLOCK_ID, TOOL_TIERS, TOOL_TYPES, foldTr } from './constants.js';
import { CRAFT_BLOCK_DEFS } from './craftData.js';
import { MAGIC_BLOCK_DEFS } from './magicData.js';
import { TREE_BLOCK_DEFS } from './treeData.js';
import { TECH_BLOCK_DEFS, TECH_TOOL_INFO } from './techData.js';
import { BIOME_BLOCK_DEFS } from './biomeData.js';
import { CITY_BLOCK_DEFS } from './cityData.js';

export const SOUND_TYPES = Object.freeze([
  'taş', 'toprak', 'kum', 'ahşap', 'cam', 'su', 'çim', 'metal', 'yaprak', 'kar',
]);
export const SHAPES = Object.freeze([
  'cube', 'cross', 'slab', 'stair', 'fence', 'torch', 'plate', 'door', 'liquid',
]);
export const BLOCK_LAYERS = Object.freeze(['opaque', 'cutout', 'transparent']);
export const BLOCK_RANGES = Object.freeze({
  arazi: [1, 19],
  sıvı: [20, 23],
  maden: [24, 39],
  bitki: [40, 59],
  yapı: [60, 99],
  sistem: [100, 127],
});
export const OVERFLOW_BUILD_IDS = Object.freeze([18, 19, 38, 39]);

/** İnşa paleti grupları (sıralı). */
export const BUILD_GROUPS = Object.freeze([
  { key: 'doğa', name: 'Doğa' },
  { key: 'taş', name: 'Taş ve Tuğla' },
  { key: 'maden', name: 'Maden' },
  { key: 'ahşap', name: 'Ahşap' },
  { key: 'cam', name: 'Cam' },
  { key: 'renkli', name: 'Renkli' },
  { key: 'ışık', name: 'Işık' },
  { key: 'dekor', name: 'Eşya ve Dekor' },
  { key: 'sıvı', name: 'Sıvılar' },
  { key: 'mekanizma', name: 'Mekanizma' },
]);

/** Renkli blok (cam/beton/kumaş) paleti: 8 renk. hex atlas üreticisi içindir. */
export const BLOCK_COLORS = Object.freeze([
  { key: 'beyaz', name: 'Beyaz', up: 'WHITE', hex: 0xf0f0f0 },
  { key: 'siyah', name: 'Siyah', up: 'BLACK', hex: 0x1d1d22 },
  { key: 'kırmızı', name: 'Kırmızı', up: 'RED', hex: 0xc8312f },
  { key: 'turuncu', name: 'Turuncu', up: 'ORANGE', hex: 0xe8842a },
  { key: 'sarı', name: 'Sarı', up: 'YELLOW', hex: 0xf2c91e },
  { key: 'yeşil', name: 'Yeşil', up: 'GREEN', hex: 0x3f9a3a },
  { key: 'mavi', name: 'Mavi', up: 'BLUE', hex: 0x2f5fc8 },
  { key: 'mor', name: 'Mor', up: 'PURPLE', hex: 0x8a3fc4 },
]);

/* ------------------------------------------------------------------------------------------------
 * Doku adları → indeks (atlas üreticisi TILE_NAMES'i ada göre çizer).
 * ---------------------------------------------------------------------------------------------- */
const tileNameList = [];
const tileIndexMap = new Map();
function tileId(name) {
  let i = tileIndexMap.get(name);
  if (i === undefined) {
    i = tileNameList.length;
    tileNameList.push(name);
    tileIndexMap.set(name, i);
  }
  return i;
}
function normTiles(t) {
  if (typeof t === 'string') return { top: t, bottom: t, side: t };
  if (Array.isArray(t)) return { top: t[0], bottom: t[1], side: t[2] };
  const top = t.top;
  return { top, bottom: t.bottom === undefined ? top : t.bottom, side: t.side === undefined ? top : t.side };
}

/* ------------------------------------------------------------------------------------------------
 * Tanım yardımcıları
 * ---------------------------------------------------------------------------------------------- */
const FULL = [[0, 0, 0, 1, 1, 1]];
const NONE = [];
const PICK = 'kazma';
const AXE = 'balta';
const SHOVEL = 'kürek';
const SWORD = 'kılıç';

const drop = (item, min = 1, max = min, chance = 1) => ({ item, min, max, chance });

// Şekil varsayılanları: opaque, collision, layer, ışık süzgeci.
const SHAPE_DEFAULTS = {
  cube: { opaque: true, collision: FULL, layer: 'opaque', light: 15 },
  cross: { opaque: false, collision: NONE, layer: 'cutout', light: 0 },
  torch: { opaque: false, collision: NONE, layer: 'cutout', light: 0 },
  plate: { opaque: false, collision: NONE, layer: 'opaque', light: 0 },
  slab: { opaque: false, collision: [[0, 0, 0, 1, 0.5, 1]], layer: 'opaque', light: 15 },
  stair: {
    opaque: false,
    collision: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]],
    layer: 'opaque',
    light: 15,
  },
  fence: { opaque: false, collision: [[0.375, 0, 0.375, 0.625, 1.5, 0.625]], layer: 'cutout', light: 0 },
  door: { opaque: false, collision: [[0, 0, 0.8125, 1, 1, 1]], layer: 'cutout', light: 15 },
  liquid: { opaque: false, collision: NONE, layer: 'transparent', light: 2 },
};

function categoryOf(id) {
  if (OVERFLOW_BUILD_IDS.indexOf(id) >= 0) return 'yapı';
  const names = Object.keys(BLOCK_RANGES);
  for (let i = 0; i < names.length; i++) {
    const r = BLOCK_RANGES[names[i]];
    if (id >= r[0] && id <= r[1]) return names[i];
  }
  return 'hava';
}

const DEFAULT_GROUP = {
  arazi: 'doğa', sıvı: 'sıvı', maden: 'maden', bitki: 'doğa', yapı: 'dekor', sistem: 'mekanizma',
};

const records = new Array(MAX_BLOCK_ID + 1).fill(null);
const B = {};

function def(id, constName, key, name, o = {}) {
  if (records[id]) throw new Error('Blok kimliği çakışması: ' + id + ' ' + key);
  if (B[constName] !== undefined) throw new Error('Blok sabiti çakışması: ' + constName);
  const shape = o.shape || 'cube';
  const sd = SHAPE_DEFAULTS[shape];
  const category = o.category || categoryOf(id);
  const names = normTiles(o.t || key);
  const tiles = { top: tileId(names.top), bottom: tileId(names.bottom), side: tileId(names.side) };
  const collision = o.collision !== undefined ? o.collision : sd.collision;
  const opaque = o.opaque !== undefined ? o.opaque : sd.opaque;
  const hardness = o.hardness === undefined ? 1 : o.hardness;
  const rec = {
    id,
    key,
    name,
    category,
    group: o.group || DEFAULT_GROUP[category],
    solid: collision.length > 0,
    cube: collision.length === 1 && collision[0].join(',') === '0,0,0,1,1,1',
    opaque,
    transparent: !opaque,
    liquid: shape === 'liquid',
    climbable: !!o.climbable,
    hardness,
    unbreakable: hardness < 0,
    tool: o.tool || null,
    toolTier: o.tier || 0,
    drops: o.drops === undefined ? 'self' : o.drops,
    tiles,
    tileNames: names,
    emission: o.emission || 0,
    lightFilter: o.light !== undefined ? o.light : (opaque ? 15 : sd.light),
    sound: o.sound || 'taş',
    tint: o.tint || null,
    tintFaces: o.tintFaces || 'all',
    placeable: o.placeable !== undefined ? o.placeable : (id <= BUILDABLE_MAX && hardness >= 0 ? true : false),
    shape,
    collision,
    layer: o.layer || sd.layer,
    cullSame: !!o.cullSame,
    interact: o.interact || null,
    slip: o.slip || 0,
    bounce: o.bounce || 0,
    damage: o.damage || 0,
    rune: o.rune || null,
    buildable: id <= BUILDABLE_MAX,
  };
  if (o.placeable === undefined && shape === 'liquid') rec.placeable = id === 20 || id === 22;
  records[id] = rec;
  B[constName] = id;
}

/* --- 0 hava --- */
records[0] = {
  id: 0, key: 'hava', name: 'Hava', category: 'hava', group: 'doğa',
  solid: false, cube: false, opaque: false, transparent: true, liquid: false, climbable: false,
  hardness: 0, unbreakable: false, tool: null, toolTier: 0, drops: [],
  tiles: { top: -1, bottom: -1, side: -1 }, tileNames: { top: null, bottom: null, side: null },
  emission: 0, lightFilter: 0, sound: 'çim', tint: null, tintFaces: 'all',
  placeable: false, shape: 'cube', collision: NONE, layer: 'cutout', cullSame: false,
  interact: null, slip: 0, bounce: 0, damage: 0, rune: null, buildable: true,
};
B.AIR = 0;

/* --- 1–19 arazi --- */
def(1, 'STONE', 'taş', 'Taş', { hardness: 2.5, tool: PICK, tier: 1, drops: [drop('blok:kırıktaş')], group: 'taş' });
def(2, 'COBBLE', 'kırıktaş', 'Kırık Taş', { hardness: 3, tool: PICK, tier: 1, group: 'taş' });
def(3, 'DIRT', 'toprak', 'Toprak', { hardness: 0.6, tool: SHOVEL, sound: 'toprak' });
def(4, 'GRASS', 'çimen', 'Çimenli Toprak', {
  t: ['çimen_üst', 'toprak', 'çimen_yan'], hardness: 0.7, tool: SHOVEL, sound: 'çim',
  drops: [drop('blok:toprak')], tint: 'grass', tintFaces: 'top',
});
def(5, 'SNOW_GRASS', 'çim_kar', 'Karlı Toprak', {
  t: ['kar', 'toprak', 'çim_kar_yan'], hardness: 0.7, tool: SHOVEL, sound: 'kar', drops: [drop('blok:toprak')],
});
def(6, 'SAND', 'kum', 'Kum', { hardness: 0.5, tool: SHOVEL, sound: 'kum' });
def(7, 'RED_SAND', 'kızıl_kum', 'Kızıl Kum', { hardness: 0.5, tool: SHOVEL, sound: 'kum' });
def(8, 'GRAVEL', 'çakıl', 'Çakıl', {
  hardness: 0.7, tool: SHOVEL, sound: 'kum', drops: [drop('blok:çakıl'), drop('item:çakmaktaşı', 1, 1, 0.12)],
});
def(9, 'SNOW', 'kar', 'Kar', { hardness: 0.3, tool: SHOVEL, sound: 'kar' });
def(10, 'ICE', 'buz', 'Buz', {
  hardness: 0.6, tool: PICK, sound: 'cam', opaque: false, layer: 'transparent', cullSame: true, light: 1, slip: 0.6,
});
def(11, 'CLAY', 'kil', 'Kil', { hardness: 0.8, tool: SHOVEL, sound: 'toprak', drops: [drop('item:kil_topu', 4)] });
def(12, 'SANDSTONE', 'kumtaşı', 'Kumtaşı', {
  t: ['kumtaşı_üst', 'kumtaşı_alt', 'kumtaşı_yan'], hardness: 1.5, tool: PICK, tier: 1, group: 'taş',
});
def(13, 'BASALT', 'bazalt', 'Bazalt', {
  t: ['bazalt_üst', 'bazalt_üst', 'bazalt_yan'], hardness: 3.5, tool: PICK, tier: 1, group: 'taş',
});
def(14, 'CRYSTAL_ROCK', 'kristal_kaya', 'Kristal Kaya', {
  hardness: 3, tool: PICK, tier: 2, emission: 5, sound: 'cam', group: 'taş',
  drops: [drop('blok:kristal_kaya'), drop('item:kristal_tozu', 1, 2, 0.5), drop('item:kuantum_kıymığı', 1, 1, 0.08)],
});
def(15, 'MUD', 'çamur', 'Çamur', { hardness: 0.6, tool: SHOVEL, sound: 'toprak' });
def(16, 'SLIPPERY_ICE', 'kaygan_buz', 'Kaygan Buz', {
  hardness: 1, tool: PICK, sound: 'cam', slip: 0.95, group: 'doğa',
});
def(17, 'CANYON_ROCK', 'kanyon_taşı', 'Kanyon Taşı', {
  t: ['kanyon_üst', 'kanyon_üst', 'kanyon_yan'], hardness: 1.8, tool: PICK, tier: 1, group: 'taş',
});
def(18, 'BOOKSHELF', 'kitaplık', 'Kitaplık', {
  t: ['kitaplık_üst', 'kitaplık_üst', 'kitaplık_yan'], hardness: 1.5, tool: AXE, sound: 'ahşap', interact: 'kitaplık',
});
def(19, 'SIGN', 'işaret_levhası', 'İşaret Levhası', {
  t: 'levha', hardness: 1, tool: AXE, sound: 'ahşap', interact: 'levha',
});

/* --- 20–23 sıvılar --- */
def(20, 'WATER', 'su', 'Su', {
  shape: 'liquid', t: 'su', hardness: -1, drops: [], sound: 'su', tint: 'water', cullSame: true, light: 2,
});
def(21, 'WATER_FLOW', 'akan_su', 'Akan Su', {
  shape: 'liquid', t: 'akan_su', hardness: -1, drops: [], sound: 'su', tint: 'water', cullSame: true, light: 2,
});
def(22, 'LAVA', 'lav', 'Lav', {
  shape: 'liquid', t: 'lav', hardness: -1, drops: [], sound: 'su', emission: 15, damage: 6, cullSame: true, light: 1,
});
def(23, 'LAVA_FLOW', 'akan_lav', 'Akan Lav', {
  shape: 'liquid', t: 'akan_lav', hardness: -1, drops: [], sound: 'su', emission: 15, damage: 6, cullSame: true, light: 1,
});

/* --- 24–39 madenler (+ dekor taşan 38/39) --- */
def(24, 'COAL_ORE', 'kömür_cevheri', 'Kömür Cevheri', {
  t: 'cevher_kömür', hardness: 3.5, tool: PICK, tier: 1, drops: [drop('item:kömür', 1, 2)],
});
def(25, 'COPPER_ORE', 'bakır_cevheri', 'Bakır Cevheri', {
  t: 'cevher_bakır', hardness: 4, tool: PICK, tier: 2, drops: [drop('item:ham_bakır', 1, 3)],
});
def(26, 'IRON_ORE', 'demir_cevheri', 'Demir Cevheri', {
  t: 'cevher_demir', hardness: 4.5, tool: PICK, tier: 3, drops: [drop('item:ham_demir')],
});
def(27, 'GOLD_ORE', 'altın_cevheri', 'Altın Cevheri', {
  t: 'cevher_altın', hardness: 5, tool: PICK, tier: 4, drops: [drop('item:ham_altın')],
});
def(28, 'DIAMOND_ORE', 'elmas_cevheri', 'Elmas Cevheri', {
  t: 'cevher_elmas', hardness: 6, tool: PICK, tier: 4, drops: [drop('item:elmas')],
});
def(29, 'QUANTUM_ORE', 'kuantum_kristali', 'Kuantum Kristali', {
  t: 'cevher_kuantum', hardness: 9, tool: PICK, tier: 5, emission: 9, sound: 'cam',
  drops: [drop('item:kuantum_parçası', 1, 2), drop('item:büyü_tozu', 1, 3, 0.6), drop('item:kuantum_kıymığı', 1, 2, 0.4)],
});
def(30, 'REDSTONE_ORE', 'kızıltaş_cevheri', 'Kızıltaş Cevheri', {
  t: 'cevher_kızıltaş', hardness: 4, tool: PICK, tier: 4, emission: 4, drops: [drop('item:kızıltaş_tozu', 2, 4)],
});
def(31, 'EMERALD_ORE', 'zümrüt_cevheri', 'Zümrüt Cevheri', {
  t: 'cevher_zümrüt', hardness: 6, tool: PICK, tier: 4, drops: [drop('item:zümrüt')],
});
def(32, 'AMETHYST', 'ametist_kümesi', 'Ametist Kümesi', {
  hardness: 3, tool: PICK, tier: 1, emission: 6, sound: 'cam',
  drops: [drop('item:ametist_parçası', 2, 4), drop('item:büyü_tozu', 1, 2, 0.3)],
});
def(33, 'COPPER_BLOCK', 'bakır_bloğu', 'Bakır Bloğu', { hardness: 5, tool: PICK, tier: 2, sound: 'metal' });
def(34, 'IRON_BLOCK', 'demir_bloğu', 'Demir Bloğu', {
  hardness: 6, tool: PICK, tier: 3, sound: 'metal', interact: 'örs',
});
def(35, 'GOLD_BLOCK', 'altın_bloğu', 'Altın Bloğu', { hardness: 5, tool: PICK, tier: 3, sound: 'metal' });
def(36, 'DIAMOND_BLOCK', 'elmas_bloğu', 'Elmas Bloğu', { hardness: 7, tool: PICK, tier: 4, sound: 'metal' });
def(37, 'QUANTUM_BLOCK', 'kuantum_bloğu', 'Kuantum Bloğu', {
  hardness: 10, tool: PICK, tier: 5, sound: 'metal', emission: 7,
});
def(38, 'LIGHT_BLOCK', 'ışık_bloğu', 'Işık Bloğu', {
  hardness: 0.8, tool: PICK, sound: 'cam', emission: 15, group: 'ışık',
});
def(39, 'BOUNCE', 'zıplama_bloğu', 'Zıplama Bloğu', {
  t: ['zıplama_üst', 'zıplama_alt', 'zıplama_yan'], hardness: 0.8, sound: 'metal', bounce: 2.2, group: 'dekor',
});

/* --- 40–59 ağaç ve bitkiler --- */
const WOODS = [
  { k: 'meşe', n: 'Meşe', up: 'OAK' },
  { k: 'huş', n: 'Huş', up: 'BIRCH' },
  { k: 'çam', n: 'Çam', up: 'PINE' },
  { k: 'akasya', n: 'Akasya', up: 'ACACIA' },
];
WOODS.forEach((w, i) => {
  def(40 + i, 'LOG_' + w.up, w.k + '_kütük', w.n + ' Kütüğü', {
    t: ['kütük_' + w.k + '_üst', 'kütük_' + w.k + '_üst', 'kütük_' + w.k + '_yan'],
    hardness: 2, tool: AXE, sound: 'ahşap', group: 'ahşap',
  });
  def(44 + i, 'PLANKS_' + w.up, w.k + '_tahta', w.n + ' Tahta', {
    t: 'tahta_' + w.k, hardness: 1.5, tool: AXE, sound: 'ahşap', group: 'ahşap',
  });
  // yaprak bloğu ara sıra kendisi düşer (inşa/dekor için; makas/ipek dokunuş gerektirmez)
  const leafDrops = [drop('item:sopa', 1, 2, 0.2), drop('blok:' + w.k + '_yaprak', 1, 1, 0.12)];
  if (w.k === 'meşe') leafDrops.push(drop('item:elma', 1, 1, 0.06));
  leafDrops.push(drop('blok:' + w.k + '_fidanı', 1, 1, 0.05)); // fidan (treeData.js): dikilir, ağaca dönüşür
  def(48 + i, 'LEAVES_' + w.up, w.k + '_yaprak', w.n + ' Yaprağı', {
    t: 'yaprak_' + w.k, hardness: 0.2, tool: SWORD, sound: 'yaprak', opaque: false, layer: 'cutout',
    light: 1, tint: 'foliage', cullSame: true, drops: leafDrops, group: 'doğa',
  });
});
def(52, 'FLOWER_RED', 'gelincik', 'Gelincik', {
  shape: 'cross', t: 'gelincik', hardness: 0, sound: 'çim',
});
def(53, 'FLOWER_YELLOW', 'sarı_çiçek', 'Sarı Çiçek', {
  shape: 'cross', t: 'sarı_çiçek', hardness: 0, sound: 'çim',
});
def(54, 'TALL_GRASS', 'uzun_ot', 'Uzun Ot', {
  shape: 'cross', t: 'uzun_ot', hardness: 0, sound: 'çim', tint: 'grass',
  drops: [drop('blok:uzun_ot'), drop('item:havuç', 1, 1, 0.03), drop('item:patates', 1, 1, 0.03)],
});
def(55, 'BUSH', 'çalı', 'Çilek Çalısı', {
  shape: 'cross', t: 'çalı', hardness: 0, sound: 'yaprak', tint: 'foliage',
  drops: [drop('item:çilek', 1, 3), drop('item:sopa', 1, 1, 0.5), drop('blok:çalı', 1, 1, 0.2)],
});
def(56, 'CACTUS', 'kaktüs', 'Kaktüs', {
  t: ['kaktüs_üst', 'kaktüs_alt', 'kaktüs_yan'], hardness: 0.4, sound: 'çim', damage: 1, opaque: false,
  layer: 'cutout', collision: [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]], light: 0, group: 'doğa',
});
def(57, 'MUSHROOM', 'ışıklı_mantar', 'Işıklı Mantar', {
  shape: 'cross', t: 'ışıklı_mantar', hardness: 0, sound: 'çim', emission: 6,
});
def(58, 'MOSS', 'yosun', 'Yosun', { hardness: 0.3, sound: 'çim', tint: 'foliage' });
def(59, 'VINE', 'sarmaşık', 'Sarmaşık', {
  shape: 'cross', t: 'sarmaşık', hardness: 0.2, tool: SWORD, sound: 'yaprak', climbable: true, tint: 'foliage',
});

/* --- 60–99 yapı --- */
def(60, 'BRICK', 'tuğla', 'Tuğla', { t: 'tuğla', hardness: 2, tool: PICK, tier: 1, group: 'taş' });
def(61, 'STONE_BRICK', 'taş_tuğla', 'Taş Tuğla', { t: 'taş_tuğla', hardness: 2, tool: PICK, tier: 1, group: 'taş' });
def(62, 'POLISHED', 'cilalı_taş', 'Cilalı Taş', { t: 'cilalı_taş', hardness: 2, tool: PICK, tier: 1, group: 'taş' });
def(63, 'PILLAR', 'sütun', 'Sütun', {
  t: ['sütun_üst', 'sütun_üst', 'sütun_yan'], hardness: 2, tool: PICK, tier: 1, group: 'taş',
});
def(64, 'GLASS', 'cam', 'Cam', {
  t: 'cam', hardness: 0.3, sound: 'cam', opaque: false, layer: 'transparent', cullSame: true, light: 0, group: 'cam',
});
BLOCK_COLORS.forEach((c, i) => {
  def(65 + i, 'GLASS_' + c.up, 'cam_' + c.key, c.name + ' Cam', {
    t: 'cam_' + c.key, hardness: 0.3, sound: 'cam', opaque: false, layer: 'transparent', cullSame: true,
    light: 0, group: 'cam',
  });
  def(73 + i, 'CONCRETE_' + c.up, 'beton_' + c.key, c.name + ' Beton', {
    t: 'beton_' + c.key, hardness: 1.8, tool: PICK, tier: 1, group: 'renkli',
  });
  def(81 + i, 'CLOTH_' + c.up, 'kumaş_' + c.key, c.name + ' Kumaş', {
    t: 'kumaş_' + c.key, hardness: 0.4, tool: SWORD, sound: 'çim', group: 'renkli',
  });
});
def(89, 'LANTERN', 'fener', 'Fener', {
  shape: 'torch', t: 'fener', hardness: 1, tool: PICK, sound: 'metal', emission: 14, group: 'ışık',
});
def(90, 'TORCH', 'meşale', 'Meşale', {
  shape: 'torch', t: 'meşale', hardness: 0, sound: 'ahşap', emission: 14, group: 'ışık',
});
def(91, 'CHEST', 'sandık', 'Sandık', {
  t: ['sandık_üst', 'sandık_üst', 'sandık_yan'], hardness: 1.5, tool: AXE, sound: 'ahşap', interact: 'sandık',
  opaque: false, layer: 'opaque', collision: [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]], light: 15,
});
def(92, 'WORKBENCH', 'tezgah', 'Üretim Tezgahı', {
  t: ['tezgah_üst', 'tahta_meşe', 'tezgah_yan'], hardness: 1.5, tool: AXE, sound: 'ahşap', interact: 'tezgah',
});
def(93, 'FURNACE', 'ocak', 'Ocak', {
  t: ['ocak_üst', 'ocak_üst', 'ocak_yan'], hardness: 2.5, tool: PICK, tier: 1, interact: 'ocak',
});
def(94, 'STAIRS', 'taş_basamak', 'Taş Basamak', {
  shape: 'stair', t: 'cilalı_taş', hardness: 2, tool: PICK, tier: 1, group: 'taş',
});
def(95, 'SLAB', 'taş_plaka', 'Taş Plaka', {
  shape: 'slab', t: 'cilalı_taş', hardness: 2, tool: PICK, tier: 1, group: 'taş',
});
def(96, 'FENCE', 'çit', 'Ahşap Çit', {
  shape: 'fence', t: 'tahta_meşe', hardness: 1.5, tool: AXE, sound: 'ahşap',
});
def(97, 'DOOR', 'kapı', 'Ahşap Kapı', {
  shape: 'door', t: 'kapı', hardness: 1.5, tool: AXE, sound: 'ahşap', interact: 'kapı_aç',
});
def(98, 'DOOR_OPEN', 'kapı_açık', 'Açık Kapı', {
  shape: 'door', t: 'kapı', hardness: 1.5, tool: AXE, sound: 'ahşap', interact: 'kapı_kapat', placeable: false,
  collision: [[0, 0, 0, 0.1875, 1, 1]], light: 0, drops: [drop('blok:kapı')],
});
def(99, 'BED', 'yatak', 'Yatak', {
  shape: 'slab', t: ['yatak_üst', 'tahta_meşe', 'yatak_yan'], hardness: 0.3, tool: SWORD, sound: 'çim',
  interact: 'yatak', collision: [[0, 0, 0, 1, 0.5625, 1]],
});

/* --- 100–127 sistem blokları (kırılamaz, haritada yasak) --- */
function sys(id, constName, key, name, o = {}) {
  def(id, constName, key, name, Object.assign({ hardness: -1, drops: [], placeable: false, group: 'mekanizma' }, o));
}
sys(100, 'BEDROCK', 'ana_kaya', 'Ana Kaya', { sound: 'taş' });
sys(101, 'SEAL_BARRIER', 'mühür_bariyeri', 'Mühür Bariyeri', {
  opaque: false, layer: 'transparent', cullSame: true, emission: 6, sound: 'cam', light: 0,
});
sys(102, 'PRESSURE_PLATE', 'baskı_plakası', 'Baskı Plakası', {
  shape: 'plate', t: 'plaka', sound: 'taş', interact: 'plaka',
});
sys(103, 'PRESSURE_PLATE_ON', 'basılı_plaka', 'Basılı Plaka', {
  shape: 'plate', t: 'plaka_basılı', sound: 'taş', emission: 4, interact: 'plaka',
});
sys(104, 'LEVER', 'kol', 'Kol', { shape: 'torch', t: 'kol', sound: 'metal', interact: 'kol' });
sys(105, 'LEVER_ON', 'kol_açık', 'Açık Kol', {
  shape: 'torch', t: 'kol_açık', sound: 'metal', emission: 3, interact: 'kol',
});
export const RUNES = [];
[
  { color: 'kırmızı', up: 'RED', symbol: 'üçgen', hex: 0xe0443e },
  { color: 'mavi', up: 'BLUE', symbol: 'daire', hex: 0x3d7be0 },
  { color: 'yeşil', up: 'GREEN', symbol: 'kare', hex: 0x3fbf5a },
  { color: 'sarı', up: 'YELLOW', symbol: 'yıldız', hex: 0xf2c91e },
  { color: 'mor', up: 'PURPLE', symbol: 'baklava', hex: 0x9a4fe0 },
].forEach((r, i) => {
  const color = r.color.charAt(0).toUpperCase() + r.color.slice(1);
  sys(106 + i, 'RUNE_' + r.up, 'rün_' + r.color, color + ' Rün Taşı', {
    t: 'rün_' + r.color, sound: 'taş', emission: 6, interact: 'rün', rune: { color: r.color, symbol: r.symbol },
  });
  RUNES.push({ id: 106 + i, color: r.color, symbol: r.symbol, hex: r.hex });
});
sys(111, 'LOGIC_GATE', 'mantık_kapısı', 'Mantık Kapısı', { sound: 'metal', emission: 3, interact: 'mantık' });
sys(112, 'RECEIVER', 'kristal_alıcı', 'Kristal Alıcı', { t: 'alıcı', sound: 'cam', emission: 2, interact: 'alıcı' });
sys(113, 'RECEIVER_ON', 'kristal_alıcı_aktif', 'Etkin Kristal Alıcı', {
  t: 'alıcı_aktif', sound: 'cam', emission: 12, interact: 'alıcı',
});
sys(114, 'MIRROR', 'ayna', 'Ayna', { sound: 'cam', interact: 'ayna' });
sys(115, 'BEAM_SOURCE', 'ışın_kaynağı', 'Işın Kaynağı', { sound: 'metal', emission: 10 });
sys(116, 'PUSH_BLOCK', 'itilebilir_blok', 'İtilebilir Blok', { sound: 'taş', interact: 'it' });
sys(117, 'MOVING_PLATFORM', 'hareketli_platform', 'Hareketli Platform', { sound: 'metal', emission: 2 });
sys(118, 'LOCKED_DOOR', 'kilitli_kapı', 'Kilitli Kapı', { sound: 'metal', interact: 'kilitli_kapı' });
sys(119, 'REWARD_CHEST', 'ödül_sandığı', 'Ödül Sandığı', {
  t: ['ödül_sandığı_üst', 'ödül_sandığı_üst', 'ödül_sandığı'], sound: 'ahşap', emission: 5, interact: 'ödül_sandığı',
  opaque: false, layer: 'opaque', collision: [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]], light: 15,
});
sys(120, 'PARKOUR_START', 'parkur_başlangıç', 'Parkur Başlangıcı', {
  shape: 'plate', sound: 'metal', emission: 8, interact: 'parkur',
});
sys(121, 'PARKOUR_END', 'parkur_bitiş', 'Parkur Bitişi', {
  shape: 'plate', sound: 'metal', emission: 8, interact: 'parkur',
});
sys(122, 'PARKOUR_CHECKPOINT', 'parkur_kontrol', 'Kontrol Noktası', {
  shape: 'plate', sound: 'metal', emission: 6, interact: 'parkur',
});
sys(123, 'PORTAL_BLUE', 'portal_mavi', 'Mavi Portal', {
  t: 'portal_mavi', collision: NONE, opaque: false, layer: 'transparent', cullSame: true, emission: 12,
  sound: 'cam', light: 0,
});
sys(124, 'PORTAL_ORANGE', 'portal_turuncu', 'Turuncu Portal', {
  t: 'portal_turuncu', collision: NONE, opaque: false, layer: 'transparent', cullSame: true, emission: 12,
  sound: 'cam', light: 0,
});
sys(125, 'BOSS_DOOR', 'boss_kapısı', 'Boss Kapısı', { sound: 'metal', emission: 4 });
sys(126, 'ALTAR', 'sunak', 'Mühür Sunağı', {
  t: ['sunak_üst', 'sunak_yan', 'sunak_yan'], sound: 'taş', emission: 8, interact: 'sunak',
});
sys(127, 'PORTAL_FRAME', 'portal_çerçevesi', 'Portal Çerçevesi', {
  t: 'portal_çerçeve', sound: 'metal', emission: 3,
});

/* --- 136–159 üretim/yapı genişletmesi (craftData.js; id > 99 → haritada yasak, yalnız macera) --- */
CRAFT_BLOCK_DEFS.forEach((d) => {
  def(d.id, d.constName, d.key, d.name, Object.assign({ category: 'yapı', placeable: true }, d.opts));
});

/* --- 250–253 ağaç devirme (treeData.js): fidanlar (id > 99 → haritada yasak, yalnız macera) --- */
TREE_BLOCK_DEFS.forEach((d) => {
  def(d.id, d.constName, d.key, d.name, Object.assign({ category: 'yapı', placeable: true }, d.opts));
});

/* --- 128–135 büyü sistemi (magicData.js): Büyü Masası, Simya Kazanı (id > 99 → haritada yasak, yalnız macera) --- */
MAGIC_BLOCK_DEFS.forEach((d) => {
  const table = d.id === MAGIC_BLOCK_DEFS[0].id;
  def(d.id, d.constName, d.key, d.name, {
    category: 'yapı', group: 'dekor', placeable: true, t: d.tiles.slice(), hardness: table ? 3 : 2.5, tool: PICK, tier: 1,
    sound: table ? 'taş' : 'metal', emission: d.emission, interact: d.interact,
    // masa ~3/4 yükseklikte (collision[0] kutusu görsel de olur), kazan tam küp
    opaque: !table, layer: 'opaque', collision: table ? [[0, 0, 0, 1, 0.75, 1]] : FULL, light: table ? 15 : undefined,
  });
});

/* --- 200–222 teknoloji (techData.js): enerji, makineler, laboratuvar. Durum varyantları (…_etkin/açık) yerleştirilemez, taban bloğu düşürür --- */
TECH_BLOCK_DEFS.forEach((d) => {
  const variant = d.base !== 0;
  const o = Object.assign({ category: 'yapı', placeable: !variant }, d.opts);
  if (variant) o.drops = [drop('blok:' + TECH_BLOCK_DEFS.find((x) => x.id === d.base).key)];
  def(d.id, d.constName, d.key, d.name, o);
});

/* --- 160–199 biyom genişletmesi (biomeData.js): yapraklar, ahşaplar, bitkiler, mağara/yanardağ/buz blokları (id > 99 → haritada yasak, yalnız macera) --- */
BIOME_BLOCK_DEFS.forEach((d) => {
  def(d.id, d.constName, d.key, d.name, Object.assign({ category: d.opts.shape === 'cross' ? 'bitki' : 'yapı', placeable: true }, d.opts));
});

/* --- 223–240 Neon Meridyen şehir blokları (cityData.js; id > 99 → haritada yasak, yalnız macera; 239/240 yerleştirilemez) --- */
CITY_BLOCK_DEFS.forEach((d) => {
  def(d.id, d.constName, d.key, d.name, Object.assign({ category: 'yapı', placeable: true }, d.opts));
});

/* Tanımsız (ayrılmış) kimlikler: BLOCKS dizisi yoğun kalsın diye hava gibi davranan, yerleştirilemeyen kayıtlar. */
for (let i = 1; i <= MAX_BLOCK_ID; i++) {
  if (!records[i]) {
    records[i] = Object.assign({}, records[0], {
      id: i, key: 'ayrılmış_' + i, name: 'Ayrılmış', category: 'hava', group: 'mekanizma', unbreakable: true, hardness: -1,
      drops: [], placeable: false, buildable: i <= BUILDABLE_MAX,
    });
  }
}

export { B };
Object.freeze(B);
export const BLOCKS = Object.freeze(records.map((r) => Object.freeze(r)));
export const TILE_NAMES = Object.freeze(tileNameList.slice());
export const TILE_COUNT = TILE_NAMES.length;
export const TILE_INDEX = tileIndexMap;

/** Doku adı → indeks; yoksa -1. */
export function tileIndex(name) {
  const i = tileIndexMap.get(name);
  return i === undefined ? -1 : i;
}

/* ------------------------------------------------------------------------------------------------
 * Hızlı arama tabloları (mesher / ışık / fizik sıcak yolları için; 256 girişli, dışı güvenli)
 * ---------------------------------------------------------------------------------------------- */
export const SOLID_LUT = new Uint8Array(256);
export const CUBE_LUT = new Uint8Array(256);
export const OPAQUE_LUT = new Uint8Array(256);
export const LIQUID_LUT = new Uint8Array(256);
export const EMIT_LUT = new Uint8Array(256);
export const FILTER_LUT = new Uint8Array(256);
for (let i = 0; i < BLOCKS.length; i++) {
  const b = BLOCKS[i];
  SOLID_LUT[i] = b.solid ? 1 : 0;
  CUBE_LUT[i] = b.cube ? 1 : 0;
  OPAQUE_LUT[i] = b.opaque ? 1 : 0;
  LIQUID_LUT[i] = b.liquid ? 1 : 0;
  EMIT_LUT[i] = b.emission;
  FILTER_LUT[i] = b.lightFilter;
}

const byKey = new Map();
const byFold = new Map();
BLOCKS.forEach((b) => {
  byKey.set(b.key, b);
  byFold.set(foldTr(b.key), b);
});

/* ------------------------------------------------------------------------------------------------
 * Sorgular
 * ---------------------------------------------------------------------------------------------- */
const AIR_RECORD = BLOCKS[0];

/** Kimlik → kayıt; geçersiz kimlik hava sayılır. */
export function getBlock(id) {
  return BLOCKS[id] || AIR_RECORD;
}
export function isSolid(id) {
  return id >= 0 && id < 256 && SOLID_LUT[id] === 1;
}
export function isOpaque(id) {
  return id >= 0 && id < 256 && OPAQUE_LUT[id] === 1;
}
export function isLiquid(id) {
  return id >= 0 && id < 256 && LIQUID_LUT[id] === 1;
}
export function isClimbable(id) {
  return getBlock(id).climbable;
}
/** Anahtar (ASCII takma adı da olur: 'tas') → kayıt | null. */
export function blockByKey(key) {
  return byKey.get(key) || byFold.get(foldTr(key)) || null;
}
/** Çarpışma kutuları (blok-yerel); katı değilse boş dizi. */
export function collisionBoxes(id) {
  return getBlock(id).collision;
}
/** Işın izleme hedeflenebilir mi (hava ve sıvı değil). */
export function isTargetable(id) {
  return id !== 0 && !isLiquid(id);
}

/** Haritada serbest kimlikler (1..99, hepsi). */
export const BUILDABLE_IDS = Object.freeze(
  BLOCKS.filter((b) => b.id >= 1 && b.buildable).map((b) => b.id),
);
/** Yaratıcı palette yerleştirilebilir kimlikler (inşa edilebilir ve placeable). */
export const PLACEABLE_IDS = Object.freeze(
  BLOCKS.filter((b) => b.id >= 1 && b.buildable && b.placeable).map((b) => b.id),
);

/** Palet grubundaki yerleştirilebilir blok kimlikleri. */
export function blocksInGroup(group) {
  return PLACEABLE_IDS.filter((id) => BLOCKS[id].group === group);
}

/* ------------------------------------------------------------------------------------------------
 * Alet çözümleme ve kırma süresi
 * ---------------------------------------------------------------------------------------------- */
const TIER_BY_KEY = new Map();
TOOL_TIERS.forEach((t, i) => TIER_BY_KEY.set(t.key, { tier: t, index: i }));
const toolCache = new Map();

/**
 * 'item:kazma_demir' → {type:'kazma', tierKey:'demir', level, speed, index} | null.
 * Kılıçlar da ('item:kılıç_*') 'kılıç' türü alettir. Yalnız anahtar biçimine bakar (items.js'e bağımlı değil).
 */
export function toolInfoFromKey(itemKey) {
  if (typeof itemKey !== 'string') return null;
  let info = toolCache.get(itemKey);
  if (info !== undefined) return info;
  info = null;
  // elektrikli aletler (techData): TOOL_TIERS'ta olmayan özel kademe
  if (Object.prototype.hasOwnProperty.call(TECH_TOOL_INFO, itemKey)) info = TECH_TOOL_INFO[itemKey];
  const m = info ? null : /^item:([^_:]+)_([^_:]+)$/.exec(foldTr(itemKey));
  if (m) {
    const type = TOOL_TYPES.find((t) => foldTr(t) === m[1]);
    const tier = TOOL_TIERS.find((t) => foldTr(t.key) === m[2]);
    if (type && tier) {
      info = { type, tierKey: tier.key, level: tier.level, speed: tier.speed, index: TIER_BY_KEY.get(tier.key).index };
    }
  }
  toolCache.set(itemKey, info);
  return info;
}

/** Eldeki eşya bu bloğu "doğru" hasat eder mi (düşme için)? */
export function canHarvest(blockId, heldItemKey) {
  const b = getBlock(blockId);
  if (b.unbreakable) return false;
  if (b.toolTier === 0) return true;
  const tool = toolInfoFromKey(heldItemKey);
  return !!(tool && b.tool && tool.type === b.tool && tool.level >= b.toolTier);
}

/**
 * Kırma süresi (sn). 0 = anında, Infinity = kırılamaz.
 * Eşleşen alet hızla bölünür; yetersiz/yanlış alet gereken seviyedeyse 3,3 kat yavaşlar (ve düşmez).
 * mods (magicMods): digMul (Verimlilik) eşleşen alette hızı çarpar; verilmezse kimlik.
 */
export function breakTime(blockId, heldItemKey, mods) {
  const b = getBlock(blockId);
  if (b.unbreakable) return Infinity;
  if (b.hardness === 0) return 0;
  const tool = toolInfoFromKey(heldItemKey);
  const matches = !!(tool && b.tool && tool.type === b.tool);
  let t = b.hardness;
  if (matches) t /= tool.speed * (mods && mods.digMul > 0 ? mods.digMul : 1);
  if (!canHarvest(blockId, heldItemKey)) t *= 3.3;
  return Math.max(0.05, t);
}

/**
 * Blok kırılınca düşen eşyalar: [{item,count}]. rng {next()} nesnesi ya da () => [0,1).
 * Yetersiz alette boş döner. rng verilmezse yalnız kesin (chance=1) girdiler, en küçük adetle düşer.
 * mods (magicMods): silkTouch → yerleştirilebilir blok kendi halinde düşer (İpek Dokunuş); fortune L → cevher
 * adetleri 1..L+1 kat (Servet; rng gerekir).
 */
export function resolveDrops(blockId, rng, heldItemKey, mods) {
  const b = getBlock(blockId);
  if (b.unbreakable || !canHarvest(blockId, heldItemKey)) return [];
  if (b.drops === 'self') return [{ item: 'blok:' + b.key, count: 1 }];
  if (mods && mods.silkTouch && b.placeable && !b.liquid) return [{ item: 'blok:' + b.key, count: 1 }];
  const nx = typeof rng === 'function' ? rng : rng && typeof rng.next === 'function' ? () => rng.next() : null;
  const fortune = mods && mods.fortune > 0 && nx && b.category === 'maden' ? Math.floor(mods.fortune) : 0;
  const out = [];
  for (let i = 0; i < b.drops.length; i++) {
    const d = b.drops[i];
    if (d.chance < 1) {
      if (!nx || nx() >= d.chance) continue;
    }
    let count = d.min;
    if (d.max > d.min && nx) count += Math.floor(nx() * (d.max - d.min + 1));
    if (count <= 0) continue;
    if (fortune > 0 && d.item.indexOf('item:') === 0) count = Math.min(64, count * (1 + Math.floor(nx() * (fortune + 1))));
    const prev = out.find((o) => o.item === d.item);
    if (prev) prev.count += count;
    else out.push({ item: d.item, count });
  }
  return out;
}
