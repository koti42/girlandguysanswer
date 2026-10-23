/*
 * KEŞİF sim — ÜRETİM genişletmesi: yeni bloklar (kimlik 136–152), eşyalar ve tarifler (saf veri).
 *
 * blocks.js bu dosyanın blok tanımlarını, items.js eşya + tarif tablolarını İÇE AKTARIR (append-only). Döngü olmasın
 * diye bu dosya hiçbir sim modülünü içe aktarmaz (yalnızca düz değerler). Büyü verisi (magicData/magicRecipes) ayrı
 * dosyalardadır; kimlik aralığı çakışmaz (128–135 büyü, 136–159 burası).
 *
 * Yeni istasyonlar: 'kesici' (Taş Kesici bloğu: taş türevlerini ucuza keser) ve 'dokuma' (Dokuma Tezgahı: kumaşı toplu
 * dokur/boyar). İkisi de macera modunda yakınlık (4 blok) ya da bloğa sağ tıklayarak açılır.
 *
 * Tarif biçimi (items.js R() ile aynı): [id, çıktı, adet, [[girdi, adet]...], istasyon, kategori].
 */

/** Yeni blok kimlikleri (B.* sabitleri blocks.js'te aynı adlarla üretilir). */
export const CRAFT_BLOCK_IDS = Object.freeze({
  STONECUTTER: 136,
  LOOM: 137,
  LADDER: 138,
  STAIRS_OAK: 139,
  STAIRS_BIRCH: 140,
  STAIRS_PINE: 141,
  STAIRS_ACACIA: 142,
  SLAB_OAK: 143,
  SLAB_BIRCH: 144,
  SLAB_PINE: 145,
  SLAB_ACACIA: 146,
  STAIRS_BRICK: 147,
  SLAB_BRICK: 148,
  STAIRS_SANDSTONE: 149,
  SLAB_SANDSTONE: 150,
  STAIRS_COBBLE: 151,
  SLAB_COBBLE: 152,
});

const WOODS = [
  { k: 'meşe', n: 'Meşe', up: 'OAK' },
  { k: 'huş', n: 'Huş', up: 'BIRCH' },
  { k: 'çam', n: 'Çam', up: 'PINE' },
  { k: 'akasya', n: 'Akasya', up: 'ACACIA' },
];

/**
 * Blok tanımları: {id, constName, key, name, opts}. opts düz değerlerdir (blocks.js def() seçenekleri):
 * t (doku adı|[üst,alt,yan]), shape, hardness, tool ('balta'|'kazma'...), tier, sound, group, interact, climbable.
 */
const blockDefs = [];
function BD(constName, key, name, opts) {
  blockDefs.push(Object.freeze({
    id: CRAFT_BLOCK_IDS[constName], constName, key, name, opts: Object.freeze(opts),
  }));
}

BD('STONECUTTER', 'taş_kesici', 'Taş Kesici', {
  t: ['kesici_üst', 'cilalı_taş', 'kesici_yan'], hardness: 2.5, tool: 'kazma', tier: 1, sound: 'metal', interact: 'kesici', group: 'dekor',
});
BD('LOOM', 'dokuma_tezgahı', 'Dokuma Tezgahı', {
  t: ['dokuma_üst', 'tahta_meşe', 'dokuma_yan'], hardness: 1.5, tool: 'balta', sound: 'ahşap', interact: 'dokuma', group: 'dekor',
});
BD('LADDER', 'merdiven', 'Merdiven', {
  shape: 'cross', t: 'merdiven', hardness: 0.4, tool: 'balta', sound: 'ahşap', climbable: true, group: 'dekor',
});
WOODS.forEach((w) => {
  BD('STAIRS_' + w.up, w.k + '_basamak', w.n + ' Basamak', {
    shape: 'stair', t: 'tahta_' + w.k, hardness: 1.5, tool: 'balta', sound: 'ahşap', group: 'ahşap',
  });
});
WOODS.forEach((w) => {
  BD('SLAB_' + w.up, w.k + '_plaka', w.n + ' Plaka', {
    shape: 'slab', t: 'tahta_' + w.k, hardness: 1.5, tool: 'balta', sound: 'ahşap', group: 'ahşap',
  });
});
BD('STAIRS_BRICK', 'tuğla_basamak', 'Tuğla Basamak', {
  shape: 'stair', t: 'tuğla', hardness: 2, tool: 'kazma', tier: 1, group: 'taş',
});
BD('SLAB_BRICK', 'tuğla_plaka', 'Tuğla Plaka', {
  shape: 'slab', t: 'tuğla', hardness: 2, tool: 'kazma', tier: 1, group: 'taş',
});
BD('STAIRS_SANDSTONE', 'kumtaşı_basamak', 'Kumtaşı Basamak', {
  shape: 'stair', t: 'kumtaşı_yan', hardness: 1.5, tool: 'kazma', tier: 1, group: 'taş',
});
BD('SLAB_SANDSTONE', 'kumtaşı_plaka', 'Kumtaşı Plaka', {
  shape: 'slab', t: 'kumtaşı_yan', hardness: 1.5, tool: 'kazma', tier: 1, group: 'taş',
});
BD('STAIRS_COBBLE', 'kırıktaş_basamak', 'Kırıktaş Basamak', {
  shape: 'stair', t: 'kırıktaş', hardness: 2.5, tool: 'kazma', tier: 1, group: 'taş',
});
BD('SLAB_COBBLE', 'kırıktaş_plaka', 'Kırıktaş Plaka', {
  shape: 'slab', t: 'kırıktaş', hardness: 2.5, tool: 'kazma', tier: 1, group: 'taş',
});

export const CRAFT_BLOCK_DEFS = Object.freeze(blockDefs);

/** Bu blokların eşyaları (items.js otomatik üretmez: id > 99). {key,name,desc,color,rarity,placesBlock,model}. */
const blockItemDesc = {
  taş_kesici: 'Taş türevlerini (basamak, plaka, tuğla, sütun) ucuza keser. Yanında durunca Üret menüsünde açılır.',
  dokuma_tezgahı: 'Kumaşı toplu dokur ve boyar. Yanında durunca Üret menüsünde açılır.',
  merdiven: 'Tırmanılabilir. Duvara ya da havaya dizip yükseğe çık.',
};
export const CRAFT_BLOCK_ITEMS = Object.freeze(blockDefs.map((d) => Object.freeze({
  key: 'blok:' + d.key,
  name: d.name,
  desc: blockItemDesc[d.key] || d.name + ' bloğu.',
  color: 0x888888,
  rarity: 'yaygın',
  model: d.opts.shape === 'cross' ? 'flat' : 'cube',
  placesBlock: d.id,
})));

/** Yeni istasyon blokları (items.js STATION_BLOCKS'a eklenir): istasyon adı → blok kimlikleri. */
export const CRAFT_STATIONS = Object.freeze({
  kesici: Object.freeze([CRAFT_BLOCK_IDS.STONECUTTER]),
  dokuma: Object.freeze([CRAFT_BLOCK_IDS.LOOM]),
});

/* ------------------------------------------------------------------------------------------------
 * Yeni eşyalar (yiyecek)
 * ---------------------------------------------------------------------------------------------- */
export const CRAFT_FOOD_ITEMS = Object.freeze([
  Object.freeze({
    key: 'item:sebze_çorbası', name: 'Sebze Çorbası', hunger: 7, heal: 2, color: 0xd88a3a, rarity: 'yaygın',
  }),
  Object.freeze({
    key: 'item:balık_güveci', name: 'Balık Güveci', hunger: 9, heal: 3, color: 0xc08a58, rarity: 'seyrek',
  }),
]);

/* ------------------------------------------------------------------------------------------------
 * Tarifler
 * ---------------------------------------------------------------------------------------------- */
const PL = 'blok:meşe_tahta';
const ST = 'item:sopa';
const recipes = [];
function R(id, out, count, ins, station, category) {
  recipes.push(Object.freeze([id, out, count, Object.freeze(ins.map((p) => Object.freeze(p.slice()))), station, category]));
}

/* ahşap: basamak, plaka, merdiven */
WOODS.forEach((w) => {
  R(w.k + '_basamak', 'blok:' + w.k + '_basamak', 4, [['blok:' + w.k + '_tahta', 6]], 'tezgah', 'yapı');
  R(w.k + '_plaka', 'blok:' + w.k + '_plaka', 6, [['blok:' + w.k + '_tahta', 3]], 'tezgah', 'yapı');
});
R('merdiven', 'blok:merdiven', 3, [[ST, 7]], 'tezgah', 'dekor');

/* istasyonlar */
R('taş_kesici', 'blok:taş_kesici', 1, [['blok:taş', 3], ['item:bakır_külçe', 1]], 'tezgah', 'dekor');
R('dokuma_tezgahı', 'blok:dokuma_tezgahı', 1, [['item:ip', 2], [PL, 2]], 'tezgah', 'dekor');

/* taş kesici: 1 taş → daha çok parça */
R('kesici:taş_tuğla', 'blok:taş_tuğla', 1, [['blok:taş', 1]], 'kesici', 'yapı');
R('kesici:cilalı_taş', 'blok:cilalı_taş', 1, [['blok:taş', 1]], 'kesici', 'yapı');
R('kesici:sütun', 'blok:sütun', 1, [['blok:taş', 1]], 'kesici', 'yapı');
R('kesici:taş_basamak', 'blok:taş_basamak', 2, [['blok:taş', 1]], 'kesici', 'yapı');
R('kesici:taş_plaka', 'blok:taş_plaka', 2, [['blok:taş', 1]], 'kesici', 'yapı');
R('kesici:kırıktaş_basamak', 'blok:kırıktaş_basamak', 2, [['blok:kırıktaş', 1]], 'kesici', 'yapı');
R('kesici:kırıktaş_plaka', 'blok:kırıktaş_plaka', 2, [['blok:kırıktaş', 1]], 'kesici', 'yapı');
R('kesici:tuğla_basamak', 'blok:tuğla_basamak', 2, [['blok:tuğla', 1]], 'kesici', 'yapı');
R('kesici:tuğla_plaka', 'blok:tuğla_plaka', 2, [['blok:tuğla', 1]], 'kesici', 'yapı');
R('kesici:kumtaşı_basamak', 'blok:kumtaşı_basamak', 2, [['blok:kumtaşı', 1]], 'kesici', 'yapı');
R('kesici:kumtaşı_plaka', 'blok:kumtaşı_plaka', 2, [['blok:kumtaşı', 1]], 'kesici', 'yapı');

/* dokuma tezgahı: ucuz kumaş + toplu boyama */
R('dokuma:kumaş_beyaz', 'blok:kumaş_beyaz', 2, [['item:ip', 3]], 'dokuma', 'yapı');
['siyah', 'kırmızı', 'turuncu', 'sarı', 'yeşil', 'mavi', 'mor'].forEach((c) => {
  R('dokuma:kumaş_' + c, 'blok:kumaş_' + c, 2, [['blok:kumaş_beyaz', 2], ['item:boya_' + c, 1]], 'dokuma', 'yapı');
});

/* boya: ek kaynaklar ve karışımlar (8 renk) */
R('boya_yeşil_ot', 'item:boya_yeşil', 1, [['blok:uzun_ot', 2]], 'el', 'malzeme');
R('boya_yeşil_kaktüs', 'item:boya_yeşil', 2, [['blok:kaktüs', 1]], 'el', 'malzeme');
R('boya_turuncu_havuç', 'item:boya_turuncu', 2, [['item:havuç', 1]], 'el', 'malzeme');
R('boya_siyah_odun', 'item:boya_siyah', 1, [['item:odun_kömürü', 1]], 'el', 'malzeme');
R('boya_mor_karışım', 'item:boya_mor', 2, [['item:boya_mavi', 1], ['item:boya_kırmızı', 1]], 'el', 'malzeme');

/* yemek */
R('sebze_çorbası', 'item:sebze_çorbası', 1, [['item:kase', 1], ['item:havuç', 2], ['item:patates', 1]], 'el', 'yiyecek');
R('balık_güveci', 'item:balık_güveci', 1, [['item:kase', 1], ['item:pişmiş_balık', 1], ['item:havuç', 1]], 'tezgah', 'yiyecek');

export const CRAFT_RECIPES = Object.freeze(recipes);
