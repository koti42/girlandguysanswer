/*
 * KEŞİF sim — BİYOM genişletmesi: blok kimlikleri 160–199, eşyalar, tarifler ve biyom başına görsel/ses/hava verisi (saf veri).
 *
 * blocks.js bu dosyanın blok tanımlarını, items.js eşya + tarif tablolarını İÇE AKTARIR (append-only; craftData.js /
 * magicData.js / techData.js ile aynı desen). Bu dosya HİÇBİR sim modülünü içe aktarmaz (döngü olmasın diye yalnızca düz
 * değerler). Biyom anahtarları constants.js BIOMES ile aynıdır (indeks = chunk.biomeMap değeri).
 *
 * Kimlik planı (160–199, hepsi macera modunda; harita/inşa modunda yasak):
 *   160–162 sonbahar yaprakları (turuncu/kırmızı/sarı)      163–165 kiraz kütük/yaprak/tahta
 *   166–168 cangıl (yağmur ormanı) kütük/yaprak/tahta       169–172 mangrov kütük/yaprak/kök/tahta
 *   173–174 bambu gövdesi / bambu tahta                      175    karlı çam yaprağı
 *   176–178 dev mantar gövde / kırmızı şapka / mor şapka     179    paketli buz        180 kül
 *   181 volkanik cam   182 magma taşı                        183–186 mercan (pembe/mor/sarı/yelpaze)
 *   187 eğrelti        188–192 çiçekler (papatya, çan çiçeği, lavanta, lale, şakayık)
 *   193 sarkıt taşı    194 parlak meyve (mağara)             195 kalsit   196 miselyum   197 kuru çalı
 *   198 kamış          199 çiçekli yosun
 */

/* ------------------------------------------------------------------------------------------------
 * Blok kimlikleri
 * ---------------------------------------------------------------------------------------------- */
export const BIOME_BLOCK_IDS = Object.freeze({
  LEAVES_AUTUMN_ORANGE: 160,
  LEAVES_AUTUMN_RED: 161,
  LEAVES_AUTUMN_YELLOW: 162,
  LOG_CHERRY: 163,
  LEAVES_CHERRY: 164,
  PLANKS_CHERRY: 165,
  LOG_JUNGLE: 166,
  LEAVES_JUNGLE: 167,
  PLANKS_JUNGLE: 168,
  LOG_MANGROVE: 169,
  LEAVES_MANGROVE: 170,
  MANGROVE_ROOTS: 171,
  PLANKS_MANGROVE: 172,
  BAMBOO: 173,
  PLANKS_BAMBOO: 174,
  LEAVES_SNOWPINE: 175,
  MUSHROOM_STEM: 176,
  MUSHROOM_CAP_RED: 177,
  MUSHROOM_CAP_PURPLE: 178,
  PACKED_ICE: 179,
  ASH: 180,
  VOLCANIC_GLASS: 181,
  MAGMA_ROCK: 182,
  CORAL_PINK: 183,
  CORAL_PURPLE: 184,
  CORAL_YELLOW: 185,
  CORAL_FAN: 186,
  FERN: 187,
  DAISY: 188,
  BLUEBELL: 189,
  LAVENDER: 190,
  TULIP: 191,
  PEONY: 192,
  DRIPSTONE: 193,
  GLOW_BERRIES: 194,
  CALCITE: 195,
  MYCELIUM: 196,
  DEAD_BUSH: 197,
  REED: 198,
  FLOWERING_MOSS: 199,
});

export const BIOME_ID_MIN = 160;
export const BIOME_ID_MAX = 199;

const I = BIOME_BLOCK_IDS;
const blockDefs = [];
/** Doğal arazi gibi davranan bloklar (mesher: rastgele doku döndürme/parlaklık; kategori 'arazi'). */
const TERRAIN_LIKE = ['PACKED_ICE', 'ASH', 'VOLCANIC_GLASS', 'MAGMA_ROCK', 'CORAL_PINK', 'CORAL_PURPLE', 'CORAL_YELLOW', 'DRIPSTONE',
  'CALCITE', 'MYCELIUM', 'FLOWERING_MOSS'];
function BD(constName, key, name, opts) {
  const o = TERRAIN_LIKE.indexOf(constName) >= 0 ? Object.assign({ category: 'arazi' }, opts) : opts;
  blockDefs.push(Object.freeze({
    id: I[constName], constName, key, name, opts: Object.freeze(o),
  }));
}
const dr = (item, min = 1, max = min, chance = 1) => Object.freeze({ item, min, max, chance });

/** Yaprak ortak seçenekleri: kesik doku, rüzgârda sallanır (tint:'foliage'), kılıçla kırılır, ara sıra sopa/kendisi düşer. */
function leaf(tile, selfKey, extraDrops) {
  return {
    t: tile, hardness: 0.2, tool: 'kılıç', sound: 'yaprak', opaque: false, layer: 'cutout', light: 1, tint: 'foliage',
    cullSame: true, group: 'doğa',
    drops: [dr('item:sopa', 1, 2, 0.2), dr('blok:' + selfKey, 1, 1, 0.14)].concat(extraDrops || []),
  };
}
function logOpts(k) {
  return { t: ['kütük_' + k + '_üst', 'kütük_' + k + '_üst', 'kütük_' + k + '_yan'], hardness: 2, tool: 'balta', sound: 'ahşap', group: 'ahşap' };
}
function planksOpts(k) {
  return { t: 'tahta_' + k, hardness: 1.5, tool: 'balta', sound: 'ahşap', group: 'ahşap' };
}
const plant = (tile, o) => Object.assign({ shape: 'cross', t: tile, hardness: 0, sound: 'çim', group: 'doğa' }, o || {});

BD('LEAVES_AUTUMN_ORANGE', 'sonbahar_turuncu_yaprak', 'Turuncu Sonbahar Yaprağı', leaf('yaprak_sonbahar_turuncu', 'sonbahar_turuncu_yaprak'));
BD('LEAVES_AUTUMN_RED', 'sonbahar_kırmızı_yaprak', 'Kırmızı Sonbahar Yaprağı', leaf('yaprak_sonbahar_kırmızı', 'sonbahar_kırmızı_yaprak'));
BD('LEAVES_AUTUMN_YELLOW', 'sonbahar_sarı_yaprak', 'Sarı Sonbahar Yaprağı', leaf('yaprak_sonbahar_sarı', 'sonbahar_sarı_yaprak'));
BD('LOG_CHERRY', 'kiraz_kütük', 'Kiraz Kütüğü', logOpts('kiraz'));
BD('LEAVES_CHERRY', 'kiraz_yaprak', 'Kiraz Çiçeği Yaprağı', leaf('yaprak_kiraz', 'kiraz_yaprak', [dr('item:boya_kırmızı', 1, 1, 0.06)]));
BD('PLANKS_CHERRY', 'kiraz_tahta', 'Kiraz Tahtası', planksOpts('kiraz'));
BD('LOG_JUNGLE', 'cangıl_kütük', 'Cangıl Kütüğü', logOpts('cangıl'));
BD('LEAVES_JUNGLE', 'cangıl_yaprak', 'Cangıl Yaprağı', leaf('yaprak_cangıl', 'cangıl_yaprak'));
BD('PLANKS_JUNGLE', 'cangıl_tahta', 'Cangıl Tahtası', planksOpts('cangıl'));
BD('LOG_MANGROVE', 'mangrov_kütük', 'Mangrov Kütüğü', logOpts('mangrov'));
BD('LEAVES_MANGROVE', 'mangrov_yaprak', 'Mangrov Yaprağı', leaf('yaprak_mangrov', 'mangrov_yaprak'));
BD('MANGROVE_ROOTS', 'mangrov_kök', 'Mangrov Kökü', {
  t: 'mangrov_kök', hardness: 0.7, tool: 'balta', sound: 'ahşap', opaque: false, layer: 'cutout', light: 1, cullSame: true, group: 'doğa',
});
BD('PLANKS_MANGROVE', 'mangrov_tahta', 'Mangrov Tahtası', planksOpts('mangrov'));
BD('BAMBOO', 'bambu', 'Bambu', {
  shape: 'cross', t: 'bambu', hardness: 0.4, tool: 'balta', sound: 'ahşap', group: 'doğa', light: 0,
  collision: [[0.4, 0, 0.4, 0.6, 1, 0.6]],
});
BD('PLANKS_BAMBOO', 'bambu_tahta', 'Bambu Tahtası', planksOpts('bambu'));
BD('LEAVES_SNOWPINE', 'karlı_çam_yaprak', 'Karlı Çam Yaprağı', leaf('yaprak_karlı_çam', 'karlı_çam_yaprak'));
BD('MUSHROOM_STEM', 'mantar_gövde', 'Dev Mantar Gövdesi', {
  t: ['mantar_gövde_üst', 'mantar_gövde_üst', 'mantar_gövde_yan'], hardness: 0.6, tool: 'balta', sound: 'çim', group: 'doğa',
});
BD('MUSHROOM_CAP_RED', 'mantar_şapka_kırmızı', 'Kırmızı Mantar Şapkası', {
  t: ['mantar_şapka_kırmızı', 'mantar_alt', 'mantar_şapka_kırmızı'], hardness: 0.5, tool: 'balta', sound: 'çim', group: 'doğa',
  drops: [dr('blok:ışıklı_mantar', 1, 2, 0.7), dr('blok:mantar_şapka_kırmızı', 1, 1, 0.3)],
});
BD('MUSHROOM_CAP_PURPLE', 'mantar_şapka_mor', 'Mor Mantar Şapkası', {
  t: ['mantar_şapka_mor', 'mantar_alt', 'mantar_şapka_mor'], hardness: 0.5, tool: 'balta', sound: 'çim', group: 'doğa', emission: 5,
  drops: [dr('blok:ışıklı_mantar', 1, 2, 0.7), dr('blok:mantar_şapka_mor', 1, 1, 0.3)],
});
BD('PACKED_ICE', 'paketli_buz', 'Paketli Buz', {
  t: 'paketli_buz', hardness: 0.9, tool: 'kazma', sound: 'cam', slip: 0.25, group: 'doğa',
});
BD('ASH', 'kül', 'Kül', { t: 'kül', hardness: 0.4, tool: 'kürek', sound: 'kum', group: 'doğa' });
BD('VOLCANIC_GLASS', 'volkanik_cam', 'Volkanik Cam', {
  t: 'volkanik_cam', hardness: 7, tool: 'kazma', tier: 3, sound: 'cam', group: 'taş',
});
BD('MAGMA_ROCK', 'magma_taşı', 'Magma Taşı', {
  t: 'magma_taşı', hardness: 2.2, tool: 'kazma', tier: 1, sound: 'taş', emission: 8, group: 'taş',
});
BD('CORAL_PINK', 'mercan_pembe', 'Pembe Mercan', { t: 'mercan_pembe', hardness: 0.8, tool: 'kazma', sound: 'taş', group: 'doğa' });
BD('CORAL_PURPLE', 'mercan_mor', 'Mor Mercan', { t: 'mercan_mor', hardness: 0.8, tool: 'kazma', sound: 'taş', group: 'doğa' });
BD('CORAL_YELLOW', 'mercan_sarı', 'Sarı Mercan', { t: 'mercan_sarı', hardness: 0.8, tool: 'kazma', sound: 'taş', group: 'doğa' });
BD('CORAL_FAN', 'mercan_yelpaze', 'Mercan Yelpazesi', plant('mercan_yelpaze'));
BD('FERN', 'eğrelti', 'Eğrelti Otu', plant('eğrelti', { tint: 'foliage' }));
BD('DAISY', 'papatya', 'Papatya', plant('papatya'));
BD('BLUEBELL', 'çan_çiçeği', 'Çan Çiçeği', plant('çan_çiçeği'));
BD('LAVENDER', 'lavanta', 'Lavanta', plant('lavanta'));
BD('TULIP', 'lale', 'Lale', plant('lale'));
BD('PEONY', 'şakayık', 'Şakayık', plant('şakayık'));
BD('DRIPSTONE', 'sarkıt_taşı', 'Sarkıt Taşı', { t: 'sarkıt_taşı', hardness: 1.6, tool: 'kazma', tier: 1, sound: 'taş', group: 'taş' });
BD('GLOW_BERRIES', 'parlak_meyve', 'Parlak Meyve Sarmaşığı', plant('parlak_meyve', {
  emission: 7, drops: [dr('item:parlak_meyve', 1, 2), dr('blok:parlak_meyve', 1, 1, 0.25)],
}));
BD('CALCITE', 'kalsit', 'Kalsit', { t: 'kalsit', hardness: 1.8, tool: 'kazma', tier: 1, sound: 'cam', emission: 1, group: 'taş' });
BD('MYCELIUM', 'miselyum', 'Miselyum', {
  t: ['miselyum_üst', 'toprak', 'miselyum_yan'], hardness: 0.7, tool: 'kürek', sound: 'çim', group: 'doğa', drops: [dr('blok:miselyum')],
});
BD('DEAD_BUSH', 'kuru_çalı', 'Kuru Çalı', plant('kuru_çalı', { drops: [dr('item:sopa', 1, 2), dr('blok:kuru_çalı', 1, 1, 0.2)] }));
BD('REED', 'kamış', 'Kamış', plant('kamış', { tint: 'foliage' }));
BD('FLOWERING_MOSS', 'çiçekli_yosun', 'Çiçekli Yosun', { t: 'çiçekli_yosun', hardness: 0.3, tool: 'kürek', sound: 'çim', group: 'doğa' });

export const BIOME_BLOCK_DEFS = Object.freeze(blockDefs);

/** Biyom bitki/ağaç blokları (yapı düzleştirmesi, zemin tespiti, ağaç devirme ve destek kuralları bunları "zemin olmayan doğa" sayar). */
const FLORA = new Uint8Array(256);
[
  160, 161, 162, 163, 164, 166, 167, 169, 170, 171, 173, 175, 176, 177, 178, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192,
  194, 197, 198,
].forEach((id) => { FLORA[id] = 1; });
export function isBiomeFlora(id) {
  return id >= BIOME_ID_MIN && id <= BIOME_ID_MAX && FLORA[id] === 1;
}
/** Biyom ağaç yapraklarının tamamı (hepsi `*_yaprak`). */
export const BIOME_LEAF_IDS = Object.freeze([160, 161, 162, 164, 167, 170, 175]);
/** Biyom çapraz bitkileri (bir zemine dikilir). */
export const BIOME_PLANT_IDS = Object.freeze([173, 186, 187, 188, 189, 190, 191, 192, 197, 198]);
/** Bitkilerin üstünde durabildiği ek zemin blokları (blocksSupport 'plant' kuralı). */
export const BIOME_SOIL_IDS = Object.freeze([196, 180, 199, 183, 184, 185]);
/** Asılı (sarmaşık gibi üstten/yandan tutunan) biyom blokları. */
export const BIOME_HANGING_IDS = Object.freeze([194]);

/** craftGraph: dünya üretiminde görülen biyom blokları (anahtarlar). */
export const BIOME_NATURAL_KEYS = Object.freeze(blockDefs.filter((d) => ![
  'kiraz_tahta', 'cangıl_tahta', 'mangrov_tahta', 'bambu_tahta',
].includes(d.key)).map((d) => d.key));

/* ------------------------------------------------------------------------------------------------
 * Eşyalar
 * ---------------------------------------------------------------------------------------------- */
const itemDesc = {
  sonbahar_turuncu_yaprak: 'Sonbahar ağaçlarından; turuncu boya verir.',
  sonbahar_kırmızı_yaprak: 'Sonbahar ağaçlarından; kırmızı boya verir.',
  sonbahar_sarı_yaprak: 'Sonbahar ağaçlarından; sarı boya verir.',
  kiraz_kütük: 'Kiraz ağacından; pembemsi odun.',
  kiraz_yaprak: 'Pembe çiçek açmış kiraz yaprakları.',
  cangıl_kütük: 'Yağmur ormanlarının devasa ağaçlarından.',
  mangrov_kök: 'Mangrov ağaçlarının su üstüne uzanan kökleri.',
  bambu: 'Hafif ve dayanıklı; sopa ve tahta olur.',
  mantar_gövde: 'Dev mantarın gövdesi.',
  mantar_şapka_kırmızı: 'Beneklı dev mantar şapkası; ışıklı mantar düşürür.',
  mantar_şapka_mor: 'Hafifçe parlayan dev mantar şapkası.',
  paketli_buz: 'Sıkışmış buz; kaygan yürüyüş yolları kurar.',
  kül: 'Yanardağ küllerinden; yumuşak ve gri.',
  volkanik_cam: 'Yanardağın soğumuş camı; çok sert.',
  magma_taşı: 'İçinden kor gibi parlar.',
  mercan_pembe: 'Sıcak denizlerde yetişir; kırmızı boya verir.',
  mercan_mor: 'Sıcak denizlerde yetişir; mor boya verir.',
  mercan_sarı: 'Sıcak denizlerde yetişir; sarı boya verir.',
  mercan_yelpaze: 'Mercan kayalıklarında yetişen yelpaze.',
  eğrelti: 'Nemli ormanların yeşil dantelleri; yeşil boya verir.',
  papatya: 'Beyaz boya verir.',
  çan_çiçeği: 'Mavi boya verir.',
  lavanta: 'Mor boya verir.',
  lale: 'Turuncu boya verir.',
  şakayık: 'Kırmızı boya verir.',
  sarkıt_taşı: 'Mağara tavanından sarkan damlataşı.',
  parlak_meyve: 'Mağara tavanlarında parlayan meyve sarmaşığı.',
  kalsit: 'Beyaz, ışıltılı mağara minerali.',
  miselyum: 'Mantar ormanlarının morumsu toprağı.',
  kuru_çalı: 'Kurak topraklarda biter; sopa verir.',
  kamış: 'Bataklık kıyılarında; kağıt yapılır.',
  çiçekli_yosun: 'Çiçekli mağaraların yosunu.',
};
export const BIOME_BLOCK_ITEMS = Object.freeze(blockDefs.map((d) => Object.freeze({
  key: 'blok:' + d.key,
  name: d.name,
  desc: itemDesc[d.key] || d.name + ' bloğu.',
  color: 0x888888,
  rarity: d.key === 'volkanik_cam' || d.key === 'kalsit' ? 'seyrek' : 'yaygın',
  model: d.opts.shape === 'cross' ? 'flat' : 'cube',
  placesBlock: d.id,
})));

/** Ek eşyalar (items.js add(d.key,d.name,d.kind,d)). */
export const BIOME_ITEM_DEFS = Object.freeze([
  Object.freeze({
    key: 'item:parlak_meyve', name: 'Parlak Meyve', kind: 'yiyecek', desc: 'Açlığı 3 doldurur, 1 can iyileştirir. Mağarada parlar.',
    color: 0xffc23a, rarity: 'seyrek', food: Object.freeze({ hunger: 3, heal: 1 }), stack: 32,
  }),
]);

/* ------------------------------------------------------------------------------------------------
 * Tarifler: [id, çıktı, adet, [[girdi, adet]...], istasyon, kategori]
 * ---------------------------------------------------------------------------------------------- */
const recipes = [];
function R(id, out, count, ins, station, category) {
  recipes.push(Object.freeze([id, out, count, Object.freeze(ins.map((p) => Object.freeze(p.slice()))), station, category]));
}
[
  ['kiraz', 'kütük'], ['cangıl', 'kütük'], ['mangrov', 'kütük'],
].forEach((w) => {
  R('tahta_' + w[0], 'blok:' + w[0] + '_tahta', 4, [['blok:' + w[0] + '_kütük', 1]], 'el', 'yapı');
  R('tahta_çevir_' + w[0], 'blok:meşe_tahta', 1, [['blok:' + w[0] + '_tahta', 1]], 'el', 'yapı');
});
R('tahta_bambu', 'blok:bambu_tahta', 2, [['blok:bambu', 2]], 'el', 'yapı');
R('tahta_çevir_bambu', 'blok:meşe_tahta', 1, [['blok:bambu_tahta', 1]], 'el', 'yapı');
R('sopa_bambu', 'item:sopa', 2, [['blok:bambu', 1]], 'el', 'malzeme');
R('kağıt_kamış', 'item:kağıt', 3, [['blok:kamış', 3]], 'el', 'malzeme');
/* boyalar: çiçekler, yapraklar, mercanlar */
R('boya_beyaz_papatya', 'item:boya_beyaz', 2, [['blok:papatya', 1]], 'el', 'malzeme');
R('boya_mavi_çan', 'item:boya_mavi', 2, [['blok:çan_çiçeği', 1]], 'el', 'malzeme');
R('boya_mor_lavanta', 'item:boya_mor', 2, [['blok:lavanta', 1]], 'el', 'malzeme');
R('boya_turuncu_lale', 'item:boya_turuncu', 2, [['blok:lale', 1]], 'el', 'malzeme');
R('boya_kırmızı_şakayık', 'item:boya_kırmızı', 2, [['blok:şakayık', 1]], 'el', 'malzeme');
R('boya_turuncu_yaprak', 'item:boya_turuncu', 1, [['blok:sonbahar_turuncu_yaprak', 2]], 'el', 'malzeme');
R('boya_kırmızı_yaprak', 'item:boya_kırmızı', 1, [['blok:sonbahar_kırmızı_yaprak', 2]], 'el', 'malzeme');
R('boya_sarı_yaprak', 'item:boya_sarı', 1, [['blok:sonbahar_sarı_yaprak', 2]], 'el', 'malzeme');
R('boya_yeşil_eğrelti', 'item:boya_yeşil', 1, [['blok:eğrelti', 2]], 'el', 'malzeme');
R('boya_kırmızı_mercan', 'item:boya_kırmızı', 2, [['blok:mercan_pembe', 1]], 'el', 'malzeme');
R('boya_mor_mercan', 'item:boya_mor', 2, [['blok:mercan_mor', 1]], 'el', 'malzeme');
R('boya_sarı_mercan', 'item:boya_sarı', 2, [['blok:mercan_sarı', 1]], 'el', 'malzeme');
/* yapı: dekoratif taş türevleri */
R('cilalı_volkanik', 'blok:cilalı_taş', 2, [['blok:volkanik_cam', 1]], 'tezgah', 'yapı');
R('paketli_buz', 'blok:paketli_buz', 1, [['blok:buz', 4]], 'el', 'yapı');
export const BIOME_RECIPES = Object.freeze(recipes);

/* ------------------------------------------------------------------------------------------------
 * Biyom bilgisi (görünüm + ses + hava). Sıra constants.js BIOMES ile aynı değildir; anahtara göre okunur.
 *   tint      {grass, foliage, water}  mesher biyom tonları (0xRRGGBB)
 *   map       harita/mini harita rengi
 *   temp      sıcaklık (-1..1): yağış türü + HUD (daynight.temperatureFor)
 *   sky       {top, hor, fog, sun, amt, fogK} | null   gökyüzü ruh hâli: gün renklerine amt oranında karışır; fogK sis yoğunluğu çarpanı
 *   rain      0..1  asgari yağış şiddeti (kurak/kar hariç); snow 0..1 soğukta asgari kar
 *   fx        ortam parçacık yoğunlukları (yüzey)  {fireflies, pollen, dust, snow, embers, spores, leaves, petals, ash}
 *   music     {scale, shift, bpm, density, brightness} müzik kipi geçersiz kılmaları
 *   audio     {bird, cricket, frog, wind}  ortam ses ağırlıkları 0..1
 * ---------------------------------------------------------------------------------------------- */
function B(key, o) { return Object.freeze(Object.assign({ key }, o)); }
const FX0 = Object.freeze({});
export const BIOME_INFO = Object.freeze({
  cayir: B('cayir', {
    tint: { grass: 0x79bd4b, foliage: 0x5ea63a, water: 0x3a8fd9 }, map: '#7fbf5a', temp: 0.5, sky: null, rain: 0, snow: 0,
    fx: { pollen: 0.5 }, music: null, audio: { bird: 0.3, cricket: 0.9 },
  }),
  orman: B('orman', {
    tint: { grass: 0x4f9a3c, foliage: 0x3c8a30, water: 0x3a86c8 }, map: '#3f8f3a', temp: 0.45, sky: null, rain: 0, snow: 0,
    fx: { fireflies: 0.7, pollen: 0.35, spores: 0.12 }, music: null, audio: { bird: 0.4, cricket: 0.7 },
  }),
  karacam: B('karacam', {
    tint: { grass: 0x5a8f55, foliage: 0x3f7a4a, water: 0x2f78a8 }, map: '#2f6a48', temp: 0.1, sky: null, rain: 0, snow: 0,
    fx: { fireflies: 0.5 }, music: null, audio: { bird: 0.2, cricket: 0.4, wind: 0.2 },
  }),
  col: B('col', {
    tint: { grass: 0xb5a04a, foliage: 0x9a8a3c, water: 0x3f8fa8 }, map: '#d9b866', temp: 0.95, sky: null, rain: 0, snow: 0,
    fx: { dust: 0.3 }, music: null, audio: { wind: 0.3 },
  }),
  tundra: B('tundra', {
    tint: { grass: 0x8fb89a, foliage: 0x6f9f8a, water: 0x5fa8d8 }, map: '#cfe3ea', temp: -0.7, sky: null, rain: 0, snow: 0,
    fx: { snow: 0.15 }, music: null, audio: { wind: 0.4 },
  }),
  dag: B('dag', {
    tint: { grass: 0x6ea05a, foliage: 0x588f48, water: 0x3a86c8 }, map: '#8a8d92', temp: -0.1, sky: null, rain: 0, snow: 0,
    fx: FX0, music: null, audio: { wind: 0.5 },
  }),
  bataklik: B('bataklik', {
    tint: { grass: 0x5a7a3a, foliage: 0x4a6a30, water: 0x3a6a5a }, map: '#5a6e3a', temp: 0.55, sky: null, rain: 0, snow: 0,
    fx: { fireflies: 0.8, spores: 0.45 }, music: null, audio: { bird: 0.15, cricket: 0.8, frog: 0.7 },
  }),
  plaj: B('plaj', {
    tint: { grass: 0x8cc050, foliage: 0x6aa83e, water: 0x3ab0d8 }, map: '#e6d9a0', temp: 0.6, sky: null, rain: 0, snow: 0,
    fx: { pollen: 0.15 }, music: null, audio: { bird: 0.25 },
  }),
  kristal: B('kristal', {
    tint: { grass: 0x6a5a9a, foliage: 0x7a4a9a, water: 0x6a3fb0 }, map: '#9a7ad8', temp: 0, sky: null, rain: 0, snow: 0,
    fx: { fireflies: 0.3, spores: 0.35 }, music: null, audio: {},
  }),
  sonbahar: B('sonbahar', {
    tint: { grass: 0xa8a24a, foliage: 0xc98a30, water: 0x3a7fa8 }, map: '#d2882f', temp: 0.3,
    sky: { hor: 0xf0c48a, fog: 0xe2c49a, top: 0x6a9ad0, amt: 0.35, fogK: 1.1 }, rain: 0.08, snow: 0,
    fx: { leaves: 0.75, pollen: 0.08 }, music: { scale: 'egyptian', bpm: 0.95, density: 0.9 }, audio: { bird: 0.3, cricket: 0.6, wind: 0.2 },
  }),
  kiraz: B('kiraz', {
    tint: { grass: 0x9bd36a, foliage: 0xe88fb0, water: 0x4aa0d8 }, map: '#f0a0bc', temp: 0.45,
    sky: { hor: 0xffd8e4, fog: 0xf2d6de, top: 0x78b0f0, amt: 0.3, fogK: 1.05 }, rain: 0, snow: 0,
    fx: { petals: 0.85, pollen: 0.25 }, music: { scale: 'majorPenta', shift: 2, brightness: 1.15 }, audio: { bird: 0.5, cricket: 0.5 },
  }),
  yagmurorman: B('yagmurorman', {
    tint: { grass: 0x2f9a38, foliage: 0x1f8a2c, water: 0x2a8a9a }, map: '#1f7a34', temp: 0.8,
    sky: { top: 0x3a7a78, hor: 0x9ac8b8, fog: 0x8aaea0, amt: 0.5, fogK: 1.7 }, rain: 0.5, snow: 0,
    fx: { fireflies: 0.6, spores: 0.2 }, music: { scale: 'egyptian', bpm: 1.05, density: 1.25 }, audio: { bird: 0.75, cricket: 0.9, frog: 0.5 },
  }),
  mangrov: B('mangrov', {
    tint: { grass: 0x6a8a3a, foliage: 0x4a7a32, water: 0x3a7a6a }, map: '#4a7a58', temp: 0.7,
    sky: { hor: 0xb0c8a0, fog: 0x98b098, top: 0x5a96a0, amt: 0.45, fogK: 1.5 }, rain: 0.18, snow: 0,
    fx: { fireflies: 0.85, spores: 0.3 }, music: { scale: 'minorPenta', density: 0.8 }, audio: { bird: 0.2, cricket: 0.9, frog: 0.9 },
  }),
  savan: B('savan', {
    tint: { grass: 0xc2b04a, foliage: 0xa8a03c, water: 0x3a8fb8 }, map: '#cdb64e', temp: 0.9,
    sky: { top: 0xe09a4a, hor: 0xffd8a0, fog: 0xf0d0a0, amt: 0.45, fogK: 0.9 }, rain: 0, snow: 0,
    fx: { dust: 0.35, pollen: 0.2 }, music: { scale: 'hirajoshi', brightness: 1.05 }, audio: { bird: 0.3, cricket: 0.7, wind: 0.25 },
  }),
  taiga: B('taiga', {
    tint: { grass: 0x6f9a7a, foliage: 0x4a7a5a, water: 0x3a7fc0 }, map: '#6f9a8a', temp: -0.45,
    sky: { top: 0x5a86b0, hor: 0xc8dcea, fog: 0xc0d4e0, amt: 0.35, fogK: 1.15 }, rain: 0, snow: 0.3,
    fx: { snow: 0.35 }, music: { scale: 'insen', density: 0.8 }, audio: { bird: 0.08, wind: 0.5 },
  }),
  buzul: B('buzul', {
    tint: { grass: 0xa8d0c8, foliage: 0x88b8b0, water: 0x6ab8e8 }, map: '#b8e4f4', temp: -0.9,
    sky: { top: 0x7ab4e8, hor: 0xe8f6ff, fog: 0xe0f0fa, amt: 0.45, fogK: 1.0 }, rain: 0, snow: 0.4,
    fx: { snow: 0.5 }, music: { scale: 'insen', bpm: 0.9, brightness: 1.1 }, audio: { wind: 0.7 },
  }),
  mantar: B('mantar', {
    tint: { grass: 0x9a6aa8, foliage: 0x8a5a98, water: 0x7a5ac0 }, map: '#a36ab8', temp: 0.35,
    sky: { top: 0x6a4a9a, hor: 0xe0a8e8, fog: 0xb888c8, amt: 0.5, fogK: 1.3 }, rain: 0, snow: 0,
    fx: { spores: 0.7, fireflies: 0.3 }, music: { scale: 'egyptian', shift: -5, density: 0.7 }, audio: { cricket: 0.4 },
  }),
  bambu: B('bambu', {
    tint: { grass: 0x7ac040, foliage: 0x5aa838, water: 0x3a9ac0 }, map: '#6cb84a', temp: 0.6,
    sky: { hor: 0xc8e8c0, fog: 0xb8d8b8, top: 0x5aa0d0, amt: 0.3, fogK: 1.25 }, rain: 0.06, snow: 0,
    fx: { pollen: 0.3, fireflies: 0.5 }, music: { scale: 'hirajoshi', shift: 3, brightness: 1.1 }, audio: { bird: 0.4, cricket: 0.6, wind: 0.2 },
  }),
  volkanik: B('volkanik', {
    tint: { grass: 0x6a5a40, foliage: 0x5a4a38, water: 0x3a5a78 }, map: '#6a3f38', temp: 0.97,
    sky: { top: 0x5a3028, hor: 0xd8703a, fog: 0x7a4a3a, amt: 0.6, fogK: 1.35 }, rain: 0, snow: 0,
    fx: { ash: 0.8, embers: 0.4 }, music: { scale: 'minorPenta', bpm: 1.1, shift: -7, brightness: 0.6 }, audio: { wind: 0.5 },
  }),
  mercan: B('mercan', {
    tint: { grass: 0x7ccf50, foliage: 0x4cc060, water: 0x20c8d8 }, map: '#4fd0c8', temp: 0.75,
    sky: { top: 0x2f9ae0, hor: 0xc0f0ff, fog: 0xbfeaf0, amt: 0.3, fogK: 0.95 }, rain: 0, snow: 0,
    fx: { pollen: 0.12 }, music: { scale: 'majorPenta', shift: 4, bpm: 1.1 }, audio: { bird: 0.35, wind: 0.15 },
  }),
  cicek: B('cicek', {
    tint: { grass: 0x8ad45a, foliage: 0x6ab840, water: 0x3a96dc }, map: '#b4dc5a', temp: 0.5,
    sky: { hor: 0xfff0c8, fog: 0xf0f0d0, top: 0x4a96e4, amt: 0.2, fogK: 1 }, rain: 0, snow: 0,
    fx: { pollen: 0.7, petals: 0.15 }, music: { scale: 'majorPenta', brightness: 1.15, density: 1.15 }, audio: { bird: 0.5, cricket: 0.6 },
  }),
  golge: B('golge', {
    tint: { grass: 0x3a5a3a, foliage: 0x2a4a3a, water: 0x2a5a78 }, map: '#2c4a40', temp: 0.15,
    sky: { top: 0x1a2038, hor: 0x5a6a78, fog: 0x3a4658, amt: 0.6, fogK: 1.5 }, rain: 0.1, snow: 0,
    fx: { spores: 0.35, fireflies: 0.3 }, music: { scale: 'minorPenta', shift: -4, density: 0.7, brightness: 0.45 }, audio: { cricket: 0.5, wind: 0.2 },
  }),
});

/** Biyom anahtarı → bilgi (bilinmeyen anahtar → çayır). */
export function biomeInfo(key) {
  return BIOME_INFO[key] || BIOME_INFO.cayir;
}

/** Biyom başına yüzey ortam parçacığı yoğunlukları için okuma (eksik anahtar 0). */
export function biomeFx(key, name) {
  const v = biomeInfo(key).fx[name];
  return v === undefined ? 0 : v;
}

/* ------------------------------------------------------------------------------------------------
 * Mağara stilleri (worldgenCaveStyles.js üretir; HUD/ses/parçacık burayı okur)
 *   key        stil anahtarı (indeks = CAVE_STYLE_ID)
 *   name       HUD adı (Türkçe)
 *   fog        yeraltı gökyüzü-sis rengi (0xRRGGBB) ve amt (karışım)
 *   fx         ortam parçacıkları
 *   hint       ilk girişte kısa ipucu
 * ---------------------------------------------------------------------------------------------- */
export const CAVE_STYLES = Object.freeze([
  Object.freeze({ key: 'normal', name: 'Mağara', fog: 0x0a0e14, amt: 0, fx: Object.freeze({ dust: 0.5 }), hint: '' }),
  Object.freeze({
    key: 'cicekli', name: 'Çiçekli Mağara', fog: 0x1a3a2a, amt: 0.35, fx: Object.freeze({ spores: 0.5, fireflies: 0.25 }),
    hint: 'Işıklı meyveler ve yosun: burada meşalesiz de yol bulunur.',
  }),
  Object.freeze({
    key: 'geod', name: 'Kristal Geod', fog: 0x2a1a4a, amt: 0.4, fx: Object.freeze({ dust: 0.2, spores: 0.3 }),
    hint: 'Ametist ve kalsit duvarlar ışıldıyor.',
  }),
  Object.freeze({
    key: 'dripstone', name: 'Sarkıt Mağarası', fog: 0x2a2018, amt: 0.25, fx: Object.freeze({ dust: 0.25 }),
    hint: 'Tavandan sarkıtlar sarkıyor, tabandan dikitler yükseliyor.',
  }),
  Object.freeze({
    key: 'buzul', name: 'Buzul Mağarası', fog: 0x1a3a5a, amt: 0.45, fx: Object.freeze({ snow: 0.2, dust: 0.1 }),
    hint: 'Duvarlar mavi buz; zemin kaygan olabilir.',
  }),
  Object.freeze({
    key: 'lavtup', name: 'Lav Tüpü', fog: 0x3a1408, amt: 0.45, fx: Object.freeze({ embers: 0.5, dust: 0.1 }),
    hint: 'Bazalt tüp ve lav havuzları: adımlarına dikkat et.',
  }),
  Object.freeze({
    key: 'harabe', name: 'Antik Harabe', fog: 0x1a1a22, amt: 0.3, fx: Object.freeze({ dust: 0.4, spores: 0.1 }),
    hint: 'Çok eski bir yapının kalıntıları.',
  }),
]);
export const CAVE_STYLE_ID = Object.freeze(CAVE_STYLES.reduce((m, s, i) => { m[s.key] = i; return m; }, {}));
