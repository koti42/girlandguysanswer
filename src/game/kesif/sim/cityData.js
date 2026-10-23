/*
 * KEŞİF sim — NEON MERİDYEN şehir blokları: kimlikler 223–240 (18 blok), neon ton tablosu, ıslak yüzey kümesi, pencere
 * emisyon grubu ve `uNeon` sözleşmesi (saf veri; döngü olmasın diye HİÇBİR sim modülünü içe aktarmaz).
 *
 * blocks.js bu dosyanın blok tanımlarını, items.js eşya tanımlarını İÇE AKTARIR (append-only; biomeData/techData ile aynı örüntü).
 * Doku boyayıcıları render/atlasTilesCity.js'tedir (ad → (tile, seed)); mesher `opts.city` render/mesherCity.js'tedir.
 *
 * Kimlik planı (KESIF_CITY_CONTRACT §4):
 *   223 asfalt (ıslak yüzey)      224/225 asfalt_çizgi_x/_z (şerit)   226/227 zebra_x/_z (yaya geçidi)   228 kaldırım (ıslak yüzey)
 *   229–232 neon_camgöbeği/pembe/kehribar/limon (emisyon 12, yayılım 11)         233 pencere_karanlık (opak)
 *   234/235 pencere_sıcak/soğuk (opak; ışıma doku emisyonundan + shader grubundan; blok ışığı YOK → ışık BFS maliyeti artmaz)
 *   236/237 cephe_koyu/açık (panel)     238 holo_panel (emisyon 8, tarama çizgisi)
 *   239/240 kayar_kapı / kayar_kapı_açık (239: çarpışma + parlak çerçeve, 240: çarpışmasız; placeable:false, kırılamaz)
 * Boş ve rezerv: 241–249, 254 (250–253 ağaç fidanları). Haritada (insa/harita) id > 99 olduğu için yasak (validateMap / PHP id ≤ 99 değişmez).
 *
 * Her blok kaydı: {id, constName, key, name, opts} (blocks.js def() seçenekleri; BIOME_BLOCK_DEFS ile aynı biçim).
 *
 * ─── Görsel sözleşme (citylook ↔ citygen_blocks) ────────────────────────────────────────────────────────────────
 * Mesher `opts.city === true` iken her köşeye ek öznitelik `aCity` (Uint8x4, NORMALIZED → shader'da 0..1; ×255 bayt) yazar:
 *   a (bayt) = bayraklar | şiddet:   bit7 (128) WET = ıslak yüzeyin ÜST yüzü (WET_BLOCK_IDS)
 *                                    bit6 (64)  WINDOW = yanık pencere (234/235) yüzü; düşük 2 bit = pencere grubu 0..2
 *                                    bit0–5     şiddet 0..63 (pencerede grup)
 *   rgb      = neon ton ipucu (sRGB bayt; NEON_HUE) — şiddet > 0 iken; WINDOW yüzünde r = gece eşiği (51/128/204), g = b = 0
 *   WET yüz: rgb = üstteki (3×3 sütun × 6 yukarı) en güçlü neonun tonu, şiddet = yakınlık × parlaklık (yoksa ışık ≥ 8 neon ipucu).
 *   Diğer yüzler: ışık ≥ 8 ve 3×3×3'teki EN GÜÇLÜ emisyon neon/holo ise rgb = ton, şiddet = (blokIşığı−7)/8 ∈ [0,1].
 * Shader çözümü (GLSL):  float ab = aCity.a*255.0+0.5; float wet = step(128.0, ab); float win = step(64.0, ab - wet*128.0);
 *   float inten = (ab - wet*128.0 - win*64.0)/63.0 (pencerede grup = ab - wet*128.0 - 64.0).
 * `uNeon` = vec4 (Float32Array(4); alanlar NEON_UNIFORM_FIELDS): x gece faktörü 0..1, y neon kazancı, z ıslak yansıma kazancı,
 *   w pencere ışıma kazancı. Pencere yanma eşiği gruba göre: yanık ⇔ smoothstep(eşik−0.08, eşik+0.08, gece); WINDOW_GROUP_THRESHOLDS.
 */

/** Blok kimlikleri (B.ASPHALT … B.SLIDING_DOOR_OPEN blocks.js'te üretilir). */
export const CITY_BLOCK_IDS = Object.freeze({
  ASPHALT: 223,
  LANE_X: 224,
  LANE_Z: 225,
  ZEBRA_X: 226,
  ZEBRA_Z: 227,
  SIDEWALK: 228,
  NEON_CYAN: 229,
  NEON_PINK: 230,
  NEON_AMBER: 231,
  NEON_LIME: 232,
  WINDOW_DARK: 233,
  WINDOW_WARM: 234,
  WINDOW_COOL: 235,
  FACADE_DARK: 236,
  FACADE_LIGHT: 237,
  HOLO_PANEL: 238,
  SLIDING_DOOR: 239,
  SLIDING_DOOR_OPEN: 240,
});
export const CITY_ID_MIN = 223;
export const CITY_ID_MAX = 240;
/** Sahipsiz kalması gereken kimlikler (250–253 ağaç fidanlarıdır; 130–135 / 153–159 dokunulmaz). */
export const CITY_RESERVED_IDS = Object.freeze([241, 242, 243, 244, 245, 246, 247, 248, 249, 254]);

const I = CITY_BLOCK_IDS;

/** Neon/holo ton tablosu: blok kimliği → sRGB bayt [r,g,b] (mesher aCity ipucu; katmanlı neon boyası). */
export const NEON_HUE = Object.freeze({
  [I.NEON_CYAN]: Object.freeze([40, 232, 255]),
  [I.NEON_PINK]: Object.freeze([255, 60, 168]),
  [I.NEON_AMBER]: Object.freeze([255, 169, 30]),
  [I.NEON_LIME]: Object.freeze([184, 255, 44]),
  [I.HOLO_PANEL]: Object.freeze([108, 168, 255]),
});

/** Islak yüzey (WET_SURFACE) bayrağı taşıyan bloklar (üst yüzü ıslanır / yansır). */
export const WET_BLOCK_IDS = Object.freeze([I.ASPHALT, I.LANE_X, I.LANE_Z, I.ZEBRA_X, I.ZEBRA_Z, I.SIDEWALK]);
/** Aynı kümenin doku adları (atlas WET_SURFACE doku bayrağı; üst yüz dokuları). */
export const WET_TILE_NAMES = Object.freeze(['asfalt', 'asfalt_çizgi_x', 'asfalt_çizgi_z', 'zebra_x', 'zebra_z', 'kaldırım']);

/** Yanık pencereler (ışıma grubu hesaplanan bloklar). */
export const WINDOW_LIT_IDS = Object.freeze([I.WINDOW_WARM, I.WINDOW_COOL]);

/** Pencere grubu g = windowGroup(x,y,z) ∈ {0,1,2} → shader gece eşiği (akşam kademeli yanar). */
export const WINDOW_GROUP_THRESHOLDS = Object.freeze([0.2, 0.5, 0.8]);
/** Aynı eşiklerin bayt kodu (aCity.r, WINDOW yüzünde). */
export const WINDOW_GROUP_THRESHOLD_BYTES = Object.freeze([51, 128, 204]);
/** Yumuşak geçiş yarı genişliği. */
export const WINDOW_LIT_SOFT = 0.08;

/**
 * Blok koordinatı (tam sayı dünya x,y,z) → pencere grubu 0..2. GLSL karşılığı WINDOW_GROUP_GLSL ile BİREBİR aynı tamsayı hash'i.
 */
export function windowGroup(x, y, z) {
  let h = Math.imul(x | 0, 0x2c1b3c6d) ^ Math.imul(y | 0, 0x297a2d39) ^ Math.imul(z | 0, 0x1b873593);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) % 3;
}

/** Gece faktörü n (0..1) için grup g penceresi yanıyor mu (0..1 yumuşak). Shader ile aynı formül. */
export function windowLit(night, group) {
  const e = WINDOW_GROUP_THRESHOLDS[group] === undefined ? 1 : WINDOW_GROUP_THRESHOLDS[group];
  const t = Math.min(1, Math.max(0, (night - (e - WINDOW_LIT_SOFT)) / (2 * WINDOW_LIT_SOFT)));
  return t * t * (3 - 2 * t);
}

/** GLSL (WebGL2 / GLSL ES 3.00) parçası: windowGroup'un tamsayı hash'i + yanma işlevi. materialShaders/skyline buna dayanır. */
export const WINDOW_GROUP_GLSL = `
uint kWinHash(ivec3 p) {
  uint h = uint(p.x) * 0x2c1b3c6du ^ uint(p.y) * 0x297a2d39u ^ uint(p.z) * 0x1b873593u;
  h ^= h >> 15u;
  h *= 0x85ebca6bu;
  h ^= h >> 13u;
  h *= 0xc2b2ae35u;
  h ^= h >> 16u;
  return h;
}
int kWindowGroup(ivec3 p) { return int(kWinHash(p) % 3u); }
float kWindowLit(float night, int group) {
  float e = group == 0 ? 0.2 : (group == 1 ? 0.5 : 0.8);
  return smoothstep(e - 0.08, e + 0.08, night);
}
`;

/** `uNeon` alanları (Float32Array(4) sırası). */
export const NEON_UNIFORM_FIELDS = Object.freeze(['night', 'neon', 'wet', 'window']);

/**
 * Gün fazı (0 = gece yarısı, 0.5 = öğle; daynight.js ile aynı) → gece faktörü 0..1 (gün batımından sonra hızla 1'e çıkar,
 * şafakta düşer). Saf, süreklidir.
 */
export function neonNightFactor(phase) {
  const p = ((phase % 1) + 1) % 1;
  const sunElev = Math.sin((p - 0.25) * Math.PI * 2); // 1 öğle, −1 gece yarısı
  const x = Math.min(1, Math.max(0, (0.18 - sunElev) / 0.5));
  return x * x * (3 - 2 * x);
}

/**
 * `uNeon` değerini doldurur (out: Float32Array(4) | dizi). night 0..1; wet 0..1 (uWet); rain 0..1.
 * y neon kazancı: gündüz sönük, gece tam (0.45..1.25); z ıslak yansıma kazancı: ıslaklık × (0.35 + 0.65·gece);
 * w pencere ışıma kazancı: gece × (yağmurda biraz artar).
 */
export function fillNeonUniform(out, night, wet = 0, rain = 0) {
  const n = Math.min(1, Math.max(0, night));
  const w = Math.min(1, Math.max(0, wet));
  const r = Math.min(1, Math.max(0, rain));
  out[0] = n;
  out[1] = 0.45 + 0.8 * n;
  out[2] = w * (0.35 + 0.65 * n);
  out[3] = n * (1 + 0.15 * r);
  return out;
}

export function isCityBlockId(id) {
  return id >= CITY_ID_MIN && id <= CITY_ID_MAX;
}

/* ------------------------------------------------------------------------------------------------
 * Blok tanımları
 * ---------------------------------------------------------------------------------------------- */
const PICK = 'kazma';
const blockDefs = [];
function BD(constName, key, name, opts) {
  blockDefs.push(Object.freeze({
    id: I[constName], constName, key, name, opts: Object.freeze(opts),
  }));
}

// Yol / kaldırım: tam opak küp; üst dokusu sanat, yan/alt tabaka dokusu. Taş ses sınıfı; kırınca kendisi düşer (yalnız oyuncunun koyduğu
// bloklar kırılabilir: dimRules; blok tanımı yine de normal sertliktedir).
const ROAD = { hardness: 2, tool: PICK, sound: 'taş', group: 'taş' };
BD('ASPHALT', 'asfalt', 'Asfalt', Object.assign({ t: ['asfalt', 'asfalt_yan', 'asfalt_yan'] }, ROAD));
BD('LANE_X', 'asfalt_çizgi_x', 'Şeritli Asfalt (X)', Object.assign({ t: ['asfalt_çizgi_x', 'asfalt_yan', 'asfalt_yan'] }, ROAD));
BD('LANE_Z', 'asfalt_çizgi_z', 'Şeritli Asfalt (Z)', Object.assign({ t: ['asfalt_çizgi_z', 'asfalt_yan', 'asfalt_yan'] }, ROAD));
BD('ZEBRA_X', 'zebra_x', 'Yaya Geçidi (X)', Object.assign({ t: ['zebra_x', 'asfalt_yan', 'asfalt_yan'] }, ROAD));
BD('ZEBRA_Z', 'zebra_z', 'Yaya Geçidi (Z)', Object.assign({ t: ['zebra_z', 'asfalt_yan', 'asfalt_yan'] }, ROAD));
BD('SIDEWALK', 'kaldırım', 'Kaldırım', Object.assign({ t: ['kaldırım', 'kaldırım_yan', 'kaldırım_yan'] }, ROAD));

// Neon tüpler: emisyon 12 (ışık BFS 11 yayılır), tüm yüzler aynı tüp dokusu; cam sesi.
const NEON = { hardness: 0.6, sound: 'cam', emission: 12, group: 'ışık' };
BD('NEON_CYAN', 'neon_camgöbeği', 'Neon Tüp (Camgöbeği)', Object.assign({ t: 'neon_camgöbeği' }, NEON));
BD('NEON_PINK', 'neon_pembe', 'Neon Tüp (Pembe)', Object.assign({ t: 'neon_pembe' }, NEON));
BD('NEON_AMBER', 'neon_kehribar', 'Neon Tüp (Kehribar)', Object.assign({ t: 'neon_kehribar' }, NEON));
BD('NEON_LIME', 'neon_limon', 'Neon Tüp (Limon)', Object.assign({ t: 'neon_limon' }, NEON));

// Pencereler: opak (ışık/saydamlık sıralaması yok); blok ışığı 0 (ışıma doku emisyonu + shader grubu).
const WINDOW = { hardness: 0.8, sound: 'cam', group: 'dekor' };
BD('WINDOW_DARK', 'pencere_karanlık', 'Pencere (Sönük)', Object.assign({ t: 'pencere_karanlık' }, WINDOW));
BD('WINDOW_WARM', 'pencere_sıcak', 'Pencere (Sıcak Işık)', Object.assign({ t: 'pencere_sıcak' }, WINDOW));
BD('WINDOW_COOL', 'pencere_soğuk', 'Pencere (Soğuk Işık)', Object.assign({ t: 'pencere_soğuk' }, WINDOW));

// Cephe panelleri
BD('FACADE_DARK', 'cephe_koyu', 'Cephe Paneli (Koyu)', {
  t: 'cephe_koyu', hardness: 2, tool: PICK, sound: 'metal', group: 'dekor',
});
BD('FACADE_LIGHT', 'cephe_açık', 'Cephe Paneli (Açık)', {
  t: 'cephe_açık', hardness: 2, tool: PICK, sound: 'metal', group: 'dekor',
});
BD('HOLO_PANEL', 'holo_panel', 'Holo Panel', {
  t: 'holo_panel', hardness: 0.8, sound: 'cam', emission: 8, group: 'ışık',
});

// Kayar kapı: kapalı = çarpışma + parlak çerçeve; açık = çarpışmasız (kesik doku: orta boşluk). Kırılamaz, yerleştirilemez, eşya vermez
// (CityLocks world.setBlock(...,{record:false}) ile 239↔240 değiştirir). emisyon 3 (<4: titreşim "parıltı" türü olmaz).
BD('SLIDING_DOOR', 'kayar_kapı', 'Kayar Kapı', {
  t: ['cephe_koyu', 'cephe_koyu', 'kayar_kapı'], hardness: -1, drops: [], placeable: false, sound: 'metal', emission: 3,
  group: 'mekanizma',
});
BD('SLIDING_DOOR_OPEN', 'kayar_kapı_açık', 'Kayar Kapı (Açık)', {
  t: ['cephe_koyu', 'cephe_koyu', 'kayar_kapı_açık'], hardness: -1, drops: [], placeable: false, sound: 'metal', emission: 3,
  collision: [], opaque: false, layer: 'cutout', light: 0, group: 'mekanizma',
});

export const CITY_BLOCK_DEFS = Object.freeze(blockDefs);

/** Anahtar → tanım. */
export const CITY_BLOCK_BY_KEY = Object.freeze(blockDefs.reduce((m, d) => {
  m[d.key] = d;
  return m;
}, {}));

/* ------------------------------------------------------------------------------------------------
 * Eşyalar: yalnız yerleştirilebilir bloklar (223–238); 239/240 eşya değildir.
 * ---------------------------------------------------------------------------------------------- */
const itemDesc = {
  asfalt: 'Şehir yollarının koyu asfaltı. Yağmurda parlar.',
  asfalt_çizgi_x: 'X yönünde şerit çizgili asfalt.',
  asfalt_çizgi_z: 'Z yönünde şerit çizgili asfalt.',
  zebra_x: 'X yönünde yaya geçidi çizgileri.',
  zebra_z: 'Z yönünde yaya geçidi çizgileri.',
  kaldırım: 'Dokunsal plakalı kaldırım taşı.',
  neon_camgöbeği: 'Parlayan camgöbeği neon tüp. Yakınındaki yüzeyleri boyar.',
  neon_pembe: 'Parlayan pembe neon tüp. Yakınındaki yüzeyleri boyar.',
  neon_kehribar: 'Parlayan kehribar neon tüp. Yakınındaki yüzeyleri boyar.',
  neon_limon: 'Parlayan limon neon tüp. Yakınındaki yüzeyleri boyar.',
  pencere_karanlık: 'Işığı sönük gökdelen penceresi.',
  pencere_sıcak: 'Akşam olunca sarı ışıkla yanan pencere.',
  pencere_soğuk: 'Akşam olunca mavi ışıkla yanan pencere.',
  cephe_koyu: 'Karbon görünümlü koyu cephe paneli.',
  cephe_açık: 'Perçinli açık renk alüminyum cephe paneli.',
  holo_panel: 'Tarama çizgili, kendi kendine parlayan holo ekran.',
};
const itemColor = {
  asfalt: 0x2f3239, asfalt_çizgi_x: 0x2f3239, asfalt_çizgi_z: 0x2f3239, zebra_x: 0x2f3239, zebra_z: 0x2f3239, kaldırım: 0x9a9ca0,
  neon_camgöbeği: 0x28e8ff, neon_pembe: 0xff3ca8, neon_kehribar: 0xffa91e, neon_limon: 0xb8ff2c,
  pencere_karanlık: 0x141a24, pencere_sıcak: 0xffc566, pencere_soğuk: 0x9edcff, cephe_koyu: 0x262a31, cephe_açık: 0xb9c0c8,
  holo_panel: 0x6ca8ff,
};

/** Eşya tanımları (items.js `CITY_BLOCK_ITEMS.forEach((d) => add(d.key, d.name, 'blok', d))`). */
export const CITY_BLOCK_ITEMS = Object.freeze(blockDefs
  .filter((d) => d.opts.placeable !== false)
  .map((d) => Object.freeze({
    key: 'blok:' + d.key,
    name: d.name,
    desc: itemDesc[d.key] || d.name + ' bloğu.',
    color: itemColor[d.key] === undefined ? 0x888888 : itemColor[d.key],
    rarity: d.opts.emission >= 8 ? 'seyrek' : 'yaygın',
    model: 'cube',
    placesBlock: d.id,
  })));

/* ------------------------------------------------------------------------------------------------
 * Tarifler: şehir dekor blokları ana diyarda da üretilebilir (edinilebilirlik grafiği: her eşyanın bir yolu olur; şehirde satıcılar ayrıca
 * satar). Biçim BIOME_RECIPES ile aynı: [id, çıktı, adet, [[girdi, adet]...], istasyon, kategori]. Hiçbir tarif tek-girdili kârlı döngü kurmaz.
 * ---------------------------------------------------------------------------------------------- */
const R = (id, out, count, ins, station, category) => Object.freeze([id, 'blok:' + out, count, Object.freeze(ins.map((p) => Object.freeze(p))), station, category]);
export const CITY_RECIPES = Object.freeze([
  R('asfalt_yap', 'asfalt', 4, [['blok:çakıl', 2], ['item:kömür', 1]], 'tezgah', 'yapı'),
  R('asfalt_çizgi_x_yap', 'asfalt_çizgi_x', 2, [['blok:asfalt', 2], ['item:boya_sarı', 1]], 'el', 'yapı'),
  R('asfalt_çizgi_z_yap', 'asfalt_çizgi_z', 2, [['blok:asfalt', 2], ['item:boya_sarı', 1]], 'el', 'yapı'),
  R('zebra_x_yap', 'zebra_x', 2, [['blok:asfalt', 2], ['item:boya_beyaz', 1]], 'el', 'yapı'),
  R('zebra_z_yap', 'zebra_z', 2, [['blok:asfalt', 2], ['item:boya_beyaz', 1]], 'el', 'yapı'),
  R('kaldırım_yap', 'kaldırım', 4, [['blok:cilalı_taş', 2], ['blok:çakıl', 1]], 'tezgah', 'yapı'),
  R('neon_camgöbeği_yap', 'neon_camgöbeği', 2, [['blok:cam', 1], ['item:kristal_tozu', 1], ['item:boya_mavi', 1]], 'tezgah', 'ışık'),
  R('neon_pembe_yap', 'neon_pembe', 2, [['blok:cam', 1], ['item:kristal_tozu', 1], ['item:boya_kırmızı', 1]], 'tezgah', 'ışık'),
  R('neon_kehribar_yap', 'neon_kehribar', 2, [['blok:cam', 1], ['item:kristal_tozu', 1], ['item:boya_turuncu', 1]], 'tezgah', 'ışık'),
  R('neon_limon_yap', 'neon_limon', 2, [['blok:cam', 1], ['item:kristal_tozu', 1], ['item:boya_yeşil', 1]], 'tezgah', 'ışık'),
  R('cephe_koyu_yap', 'cephe_koyu', 2, [['blok:beton_siyah', 2], ['item:demir_külçe', 1]], 'tezgah', 'yapı'),
  R('cephe_açık_yap', 'cephe_açık', 2, [['blok:beton_beyaz', 2], ['item:demir_külçe', 1]], 'tezgah', 'yapı'),
  R('pencere_karanlık_yap', 'pencere_karanlık', 2, [['blok:cam_siyah', 1], ['blok:cephe_koyu', 1]], 'tezgah', 'dekor'),
  R('pencere_sıcak_yap', 'pencere_sıcak', 1, [['blok:pencere_karanlık', 1], ['blok:meşale', 1]], 'tezgah', 'ışık'),
  R('pencere_soğuk_yap', 'pencere_soğuk', 1, [['blok:pencere_karanlık', 1], ['item:kristal_tozu', 1]], 'tezgah', 'ışık'),
  R('holo_panel_yap', 'holo_panel', 2, [['blok:cam', 1], ['item:devre_kartı', 1], ['item:kristal_tozu', 1]], 'laboratuvar', 'ışık'),
]);

/* ------------------------------------------------------------------------------------------------
 * Kimlik kartları (locks_hack, sözleşme §8/§15): Kart-1 gri, Kart-2 turuncu, Kart-3 mor. Yalnız şehir kilitlerinin ödülüdür (tarifsiz; craftGraph
 * SPECIAL_ITEMS); şehirden çıkarken `dims.neon.stash`e alınır (dimBound 'neon': cityLocks sistemi travel.registerDimBound ile kaydeder). Blok kimliği yok.
 * ---------------------------------------------------------------------------------------------- */
export const CITY_ITEM_DEFS = Object.freeze([
  Object.freeze({
    key: 'item:kart_gri', name: 'Kimlik Kartı 1 (Gri)', kind: 'anahtar', stack: 1, rarity: 'seyrek', model: 'flat', color: 0x9aa3b2,
    desc: 'Neon Meridyen kart okuyucularını açar. Kart 2 ve 3 de bu kilidi açar.',
  }),
  Object.freeze({
    key: 'item:kart_turuncu', name: 'Kimlik Kartı 2 (Turuncu)', kind: 'anahtar', stack: 1, rarity: 'nadir', model: 'flat', color: 0xff9a3c,
    desc: 'Orta seviye kart okuyucuları açar. Kart 3 de bu kilidi açar.',
  }),
  Object.freeze({
    key: 'item:kart_mor', name: 'Kimlik Kartı 3 (Mor)', kind: 'anahtar', stack: 1, rarity: 'efsanevi', model: 'flat', color: 0xb07cff,
    desc: 'En yüksek seviye kart okuyucuları açar.',
  }),
]);
