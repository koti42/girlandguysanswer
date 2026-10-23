/*
 * KEŞİF sim — sabitler (saf; DOM/three yok, worker-güvenli).
 *
 * Tek doğruluk kaynağı: chunk boyutları, dünya yüksekliği, bölge (zone) tablosu,
 * kayıt sürümü ve paylaşılan harita sınırları. Diğer tüm sim modülleri buradan okur.
 *
 * ── DERİN DÜNYA (macera modu) — dikey düzen ────────────────────────────────────────────────────────────────
 *   WORLD_Y_MIN = -400  Tabandaki kırılamaz Ana Kaya katmanı (y -400..-397 + pürüzlü üst yüzey ≤ -396). Altına inilemez.
 *   WORLD_Y_MAX =  362  (= SEA_LEVEL + 320) inşa/uçuş tavanı: üstüne blok konamaz, oyuncu/mob/eşya bunun üstüne çıkamaz
 *                       ("Yükseklik sınırına ulaştın"). Bloklar y ∈ [WORLD_Y_MIN, WORLD_Y_MAX] aralığında bulunur.
 *   SECTION_H = 16      Chunk sütunu 16 yüksekliğinde kesitlerden (section) oluşur: macera = 48 kesit (y -400..367),
 *                       harita/inşa = 8 kesit (y 0..127). Kesit indeksi si = (y - yMin) >> 4; kesit içi indeks
 *                       sectionVoxelIndex(lx, ly, lz) = (ly<<8)+(lz<<4)+lx (ly = y & 15; eski ((y*16)+z)*16+x ile aynı biçim).
 *   MAP_H = 128         Paylaşılan harita (insa/harita) ve sunucu harita biçimi yüksekliği: 0..127, RLE chunk = 32768 bayt,
 *                       kimlik ≤ 99. WORLD_H eski adıdır (= MAP_H; YALNIZ harita/legacy için; macera yüksekliği DEĞİLDİR).
 *   Dünya API'si mutlak y kullanır (negatif olabilir): world.getBlock/setBlock/getLight/surfaceY/ensureSection...
 *   world.yMin / world.yMax (dahil) / world.yTop (= yMax + 1, hariç) / world.sectionCount her modda doğru aralığı verir;
 *   fizik/ışın/varlık kodu worldMinY(world) / worldMaxY(world) yardımcılarını kullanır (taklit dünyalarda eski 0..127).
 *   Kesitler tembel üretilir: yüzey bandı (y ≥ SURFACE_BAND_MIN_Y = 0) chunk ile birlikte, y < 0 kesitleri ihtiyaç olunca
 *   (world.ensureSection / ensureSectionsNear); yalnız tek bir değerden oluşan (tek tip) kesitler tek bayt tutar.
 * ----------------------------------------------------------------------------------------------------------------
 */

export const CHUNK_SIZE = 16;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE; // 256
/** Harita (insa/harita) ve sunucu harita biçimi yüksekliği: 0..127. */
export const MAP_H = 128;
/** @deprecated eski ad = MAP_H. Yalnız harita/legacy yüksekliği; macera dünyası için WORLD_Y_MIN/WORLD_Y_MAX kullan. */
export const WORLD_H = MAP_H;
/** Eski (harita) chunk hacmi: 16×16×128 = 32768 bayt (harita biçimi, kayıt farkı, RLE). */
export const CHUNK_VOLUME = CHUNK_AREA * MAP_H; // 32768
export const SEA_LEVEL = 42;
export const SECTION_H = 16;
export const SECTION_VOLUME = CHUNK_AREA * SECTION_H; // 4096
export const WORLD_Y_MIN = -400;
/** Macera tabanı: y ≤ bu değerdeki ana kaya hiçbir yolla (kırma, komut, patlama, kayıt) değiştirilemez (taban yüzeyi -396'ya kadar pürüzlüdür). */
export const BEDROCK_TOP_Y = WORLD_Y_MIN + 6;
export const WORLD_Y_MAX = SEA_LEVEL + 320; // 362
/** Macera sütunundaki kesit sayısı: y -400..367 (WORLD_Y_MAX bu aralığın içindedir; üst kesit kısmen tavan dışıdır). */
export const WORLD_SECTION_COUNT = 48;
export const MAP_SECTION_COUNT = MAP_H / SECTION_H; // 8
/** Yüzey bandı: bu y ve üstü chunk üretilirken hemen üretilir; altı (derin) kesitler tembeldir. */
export const SURFACE_BAND_MIN_Y = 0;
/** Yüzey bandı üretim penceresinin üst sınırı (hariç): y 0..367. */
export const GEN_TOP_Y = WORLD_Y_MIN + WORLD_SECTION_COUNT * SECTION_H; // 368
// 1–99 inşa edilebilir, 100–127 sistem, 128–135 büyü sistemi, 136–159 üretim/yapı genişletmesi (craftData.js),
// 160–199 biyom blokları (biomeData.js), 200–222 teknoloji (techData.js), 223–240 Neon Meridyen şehir blokları (cityData.js;
// 18 kimlik: asfalt, çizgi, zebra, kaldırım, neonlar, pencereler, cepheler, holo panel, kayar kapı), 241–249 ve 254 boş rezerv,
// 250–253 ağaç blokları (treeData.js). 255 kayıt farkında "değişmedi" işaretidir (saveEdits.EDIT_UNCHANGED) — blok kimliği olamaz; bu yüzden üst sınır 254.
export const MAX_BLOCK_ID = 254;
export const BUILDABLE_MAX = 99;
export const SAVE_VERSION = 3;
// Sabit sim adımı (Hz). runner/engine/fixedStep.js ile aynı: 60 Hz.
export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Eski/harita chunk içi indeks: ((y*16)+z)*16+x (yerel 0..15, y 0..127). Kesit içi için sectionVoxelIndex. */
export function voxelIndex(lx, y, lz) {
  return ((y * CHUNK_SIZE) + lz) * CHUNK_SIZE + lx;
}

/** Kesit içi indeks: (ly<<8)+(lz<<4)+lx (ly 0..15). */
export function sectionVoxelIndex(lx, ly, lz) {
  return (ly << 8) + (lz << 4) + lx;
}

/** Mutlak y → kesit indeksi (yMin tabanlı; macera varsayılanı WORLD_Y_MIN). */
export function sectionIndexOf(y, yMin = WORLD_Y_MIN) {
  return (y - yMin) >> 4;
}

/** Kesit indeksi → kesidin en alçak mutlak y'si. */
export function sectionBaseY(si, yMin = WORLD_Y_MIN) {
  return yMin + si * SECTION_H;
}

/** Dünya (World) dikey aralığı: `world.yMin` yoksa (taklit dünyalar) eski harita aralığı 0..127. */
export function worldMinY(world) {
  return world && world.yMin !== undefined ? world.yMin : 0;
}
/** En yüksek geçerli y (dahil). */
export function worldMaxY(world) {
  return world && world.yMax !== undefined ? world.yMax : MAP_H - 1;
}

/** Eşya/mermi bu y'nin altında silinir: macera = kurtarma düzleminin biraz altı (taban ana kaya mühürlü), legacy -30. */
export function itemKillY(world) {
  return world && world.killPlaneY !== undefined ? world.killPlaneY - 6 : -30;
}
/** Eşya/mermi bu y'nin üstüne çıkamaz (macera: inşa tavanı + 4; taklit dünyada sınırsız). */
export function itemCeilY(world) {
  return world && world.yTop !== undefined ? world.yTop + 4 : 1e9;
}

/**
 * Derinlik bantları (HUD başlığı + erişilebilirlik); yukarıdan aşağı, minY = bandın en alçak y'si.
 *   yuzey      y ≥ 20           Yüzey (gökyüzü dahil)
 *   magaralar  -80 ≤ y < 20     Mağaralar
 *   derin      -220 ≤ y < -80   Derin Mağaralar
 *   ham        -340 ≤ y < -220  Ham Kayalık (uçurumlar, lav denizleri)
 *   dip        y < -340         Dip (ana kaya yakını)
 */
export const DEPTH_BANDS = Object.freeze([
  Object.freeze({ key: 'yuzey', name: 'Yüzey', minY: 20 }),
  Object.freeze({ key: 'magaralar', name: 'Mağaralar', minY: -80 }),
  Object.freeze({ key: 'derin', name: 'Derin Mağaralar', minY: -220 }),
  Object.freeze({ key: 'ham', name: 'Ham Kayalık', minY: -340 }),
  Object.freeze({ key: 'dip', name: 'Dip', minY: -Infinity }),
]);

/** y'nin derinlik bandı kaydı. */
export function depthBandAt(y) {
  for (let i = 0; i < DEPTH_BANDS.length; i++) if (y >= DEPTH_BANDS[i].minY) return DEPTH_BANDS[i];
  return DEPTH_BANDS[DEPTH_BANDS.length - 1];
}

/** Deniz seviyesine göre yükseklik (blok): + yukarı, − aşağı. */
export function relativeToSea(y) {
  return Math.floor(y) - SEA_LEVEL;
}

/** Paylaşılan harita (inşa/harita modu) sınırları. mapFormat.js ve PHP doğrulayıcısı aynısını uygular. */
export const MAP_LIMITS = Object.freeze({
  maxChunks: 64,
  chunksX: 8,
  chunksZ: 8,
  sizeX: 8 * CHUNK_SIZE, // 128 blok
  sizeZ: 8 * CHUNK_SIZE,
  maxEncodedBytes: 700 * 1024, // kodlanmış (base64) chunk dizilerinin toplam uzunluğu
  chunkBytes: CHUNK_VOLUME,
});

/* ------------------------------------------------------------------------------------------------
 * Alet kademeleri (blocks.js kırma süresi + items.js alet/silah/zırh üretimi aynı tabloyu kullanır).
 * level: hasat seviyesi (bir bloğun toolTier'ı ≤ level ise düşer). speed: eşleşen alet hız çarpanı.
 * Altın: en hızlı ama zayıf (düşük seviye, az dayanıklılık).
 * ---------------------------------------------------------------------------------------------- */
export const TOOL_TIERS = Object.freeze([
  { key: 'ahşap', name: 'Ahşap', level: 1, speed: 2, durability: 60, damage: 4, color: 0xa87a45 },
  { key: 'taş', name: 'Taş', level: 2, speed: 4, durability: 132, damage: 5, color: 0x8d9094 },
  { key: 'bakır', name: 'Bakır', level: 3, speed: 5, durability: 190, damage: 5.5, color: 0xd1773f },
  { key: 'demir', name: 'Demir', level: 4, speed: 6, durability: 250, damage: 6, color: 0xd6d9dd },
  { key: 'altın', name: 'Altın', level: 2, speed: 12, durability: 33, damage: 4, color: 0xf4c940 },
  { key: 'elmas', name: 'Elmas', level: 5, speed: 8, durability: 1000, damage: 7, color: 0x4fe3d6 },
  { key: 'kuantum', name: 'Kuantum', level: 6, speed: 11, durability: 2000, damage: 9, color: 0xb25cff },
]);

/** Alet türleri (blok kayıtlarındaki `tool` alanı bu değerlerden biridir). */
export const TOOL_TYPES = Object.freeze(['kazma', 'balta', 'kürek', 'kılıç']);

/* ------------------------------------------------------------------------------------------------
 * Biyomlar ve yaratık/boss anahtarları (worldgen, entities, progression aynı adları kullanır).
 * ---------------------------------------------------------------------------------------------- */
export const BIOMES = Object.freeze([
  // 0..8: ilk dalga (kimlikler kayıtlı dünyalarda sabit kalır; yalnız sona eklenir)
  { key: 'cayir', name: 'Çayır' },
  { key: 'orman', name: 'Orman' },
  { key: 'karacam', name: 'Karaçam Ormanı' },
  { key: 'col', name: 'Çöl ve Kanyon' },
  { key: 'tundra', name: 'Kar Tundrası' },
  { key: 'dag', name: 'Dağ ve Zirve' },
  { key: 'bataklik', name: 'Bataklık' },
  { key: 'plaj', name: 'Plaj ve Deniz' },
  { key: 'kristal', name: 'Kristal Vadisi' },
  // 9..21: biyom genişletmesi (sim/biomeData.js ayrıntıları taşır: ton, gökyüzü, hava, parçacık, müzik, harita rengi)
  { key: 'sonbahar', name: 'Sonbahar Ormanı' },
  { key: 'kiraz', name: 'Kiraz Ormanı' },
  { key: 'yagmurorman', name: 'Yağmur Ormanı' },
  { key: 'mangrov', name: 'Mangrov Bataklığı' },
  { key: 'savan', name: 'Savan' },
  { key: 'taiga', name: 'Karlı Çam Ormanı' },
  { key: 'buzul', name: 'Buzul Ovası' },
  { key: 'mantar', name: 'Mantar Ormanı' },
  { key: 'bambu', name: 'Bambu Ormanı' },
  { key: 'volkanik', name: 'Volkanik Çorak' },
  { key: 'mercan', name: 'Mercan Kıyısı' },
  { key: 'cicek', name: 'Çiçek Çayırı' },
  { key: 'golge', name: 'Gölge Ormanı' },
]);
export const BIOME_KEYS = Object.freeze(BIOMES.map((b) => b.key));

export const PASSIVE_MOBS = Object.freeze([
  'tavuk', 'koyun', 'ormankedisi', 'ceylan', 'balik', 'kelebek', 'atesbocegi', 'tilki', 'kurbaga', 'papagan',
]);
export const HOSTILE_MOBS = Object.freeze([
  'golge', 'kemikci', 'kumakrebi', 'buzhortlagi', 'kristalbocegi', 'lavslime', 'tasyarasasi',
]);
export const BOSS_KEYS = Object.freeze(['kokana', 'tasbekci', 'buzkral', 'golgehukumdar']);
export const ABILITY_KEYS = Object.freeze(['doubleJump', 'grapple', 'glide', 'portalGun']);

/* ------------------------------------------------------------------------------------------------
 * Bölgeler: halka bazlı, merkez (0,0) = spawn, Öklid yarıçapı (blok). Her bölgenin dış sınırında
 * Mühür Bariyeri vardır; bölge i'nin mührü i+1'i açar.
 *   rIn/rOut        iç/dış yarıçap (blok)
 *   difficulty      1..5 zorluk çarpanı
 *   biomes          biyom ağırlıkları (toplam 1)
 *   mobs            {passive:[...], hostile:[...]}
 *   bossKey         bölgenin boss'u (Başlangıç Vadisi'nde yok)
 *   abilityKey      boss/ödül yeteneği
 *   temples         bölgedeki Anahtar Tapınağı sayısı (= mühür için gereken kristal)
 *   ambient         renkler (0xRRGGBB): gökyüzü tepe/ufuk, sis, güneş, çimen/yaprak/su tonu
 * ---------------------------------------------------------------------------------------------- */
export const ZONES = Object.freeze([
  Object.freeze({
    id: 0,
    key: 'baslangic',
    name: 'Başlangıç Vadisi',
    rIn: 0,
    rOut: 176,
    difficulty: 1,
    biomes: Object.freeze({
      cayir: 0.2, orman: 0.16, cicek: 0.2, kiraz: 0.16, plaj: 0.08, dag: 0.08, sonbahar: 0.06, bataklik: 0.03, mercan: 0.03,
    }),
    mobs: Object.freeze({
      passive: Object.freeze(['tavuk', 'koyun', 'ceylan', 'ormankedisi', 'balik', 'kelebek', 'tilki', 'kurbaga']),
      hostile: Object.freeze(['golge']),
    }),
    bossKey: null,
    abilityKey: null,
    temples: 2,
    ambient: Object.freeze({
      skyTop: 0x3f8fe0, skyHorizon: 0xbfe3ff, fog: 0xcfe6f5, sun: 0xfff2d8,
      grass: 0x79bd4b, foliage: 0x5ea63a, water: 0x3a8fd9,
    }),
  }),
  Object.freeze({
    id: 1,
    key: 'fisildayan',
    name: 'Fısıldayan Ormanlar',
    rIn: 176,
    rOut: 352,
    difficulty: 2,
    biomes: Object.freeze({
      sonbahar: 0.16, yagmurorman: 0.15, mangrov: 0.13, bambu: 0.13, orman: 0.09, karacam: 0.08, bataklik: 0.11, kiraz: 0.04, golge: 0.05, dag: 0.06,
    }),
    mobs: Object.freeze({
      passive: Object.freeze(['ceylan', 'ormankedisi', 'kelebek', 'atesbocegi', 'tavuk', 'koyun', 'tilki', 'kurbaga', 'papagan', 'balik']),
      hostile: Object.freeze(['golge', 'kemikci', 'tasyarasasi']),
    }),
    bossKey: 'kokana',
    abilityKey: 'doubleJump',
    temples: 3,
    ambient: Object.freeze({
      skyTop: 0x2f7a8a, skyHorizon: 0xa8d4c0, fog: 0xa8c8b0, sun: 0xf3f0c8,
      grass: 0x4f9a3c, foliage: 0x3c8a30, water: 0x2f7f7a,
    }),
  }),
  Object.freeze({
    id: 2,
    key: 'yanik',
    name: 'Yanık Kanyonlar',
    rIn: 352,
    rOut: 608,
    difficulty: 3,
    biomes: Object.freeze({
      col: 0.3, savan: 0.22, volkanik: 0.16, dag: 0.16, kristal: 0.06, cayir: 0.04, mercan: 0.04, plaj: 0.02,
    }),
    mobs: Object.freeze({
      passive: Object.freeze(['ceylan', 'kelebek', 'papagan', 'balik']),
      hostile: Object.freeze(['golge', 'kemikci', 'kumakrebi', 'tasyarasasi', 'lavslime']),
    }),
    bossKey: 'tasbekci',
    abilityKey: 'grapple',
    temples: 3,
    ambient: Object.freeze({
      skyTop: 0xd9803f, skyHorizon: 0xf6c98f, fog: 0xe8c8a0, sun: 0xffd9a0,
      grass: 0xb5a04a, foliage: 0x9a8a3c, water: 0x3f8fa8,
    }),
  }),
  Object.freeze({
    id: 3,
    key: 'donmus',
    name: 'Donmuş Zirveler',
    rIn: 608,
    rOut: 960,
    difficulty: 4,
    biomes: Object.freeze({
      taiga: 0.24, buzul: 0.22, tundra: 0.2, dag: 0.2, karacam: 0.06, kristal: 0.04, golge: 0.04,
    }),
    mobs: Object.freeze({
      passive: Object.freeze(['ormankedisi', 'ceylan', 'tilki', 'balik']),
      hostile: Object.freeze(['golge', 'kemikci', 'buzhortlagi', 'tasyarasasi', 'kristalbocegi']),
    }),
    bossKey: 'buzkral',
    abilityKey: 'glide',
    temples: 3,
    ambient: Object.freeze({
      skyTop: 0x6fa4d8, skyHorizon: 0xdcecf8, fog: 0xdcecf8, sun: 0xe8f4ff,
      grass: 0x8fb89a, foliage: 0x6f9f8a, water: 0x5fa8d8,
    }),
  }),
  Object.freeze({
    id: 4,
    key: 'cekirdek',
    name: 'Çekirdek',
    rIn: 960,
    rOut: 1408,
    difficulty: 5,
    biomes: Object.freeze({
      kristal: 0.22, golge: 0.18, mantar: 0.18, dag: 0.14, volkanik: 0.06, taiga: 0.04, buzul: 0.04, bataklik: 0.06, col: 0.04, sonbahar: 0.04,
    }),
    mobs: Object.freeze({
      passive: Object.freeze(['atesbocegi', 'kurbaga']),
      hostile: Object.freeze([
        'golge', 'kemikci', 'kristalbocegi', 'lavslime', 'buzhortlagi', 'tasyarasasi', 'kumakrebi',
      ]),
    }),
    bossKey: 'golgehukumdar',
    abilityKey: 'portalGun',
    temples: 3,
    ambient: Object.freeze({
      skyTop: 0x1a0f33, skyHorizon: 0x5a3d7a, fog: 0x4a3368, sun: 0xd8b8ff,
      grass: 0x6a5a9a, foliage: 0x7a4a9a, water: 0x6a3fb0,
    }),
  }),
]);

export const ZONE_COUNT = ZONES.length;
/** Dünyanın dış yarıçapı (blok); ötesi sonsuz sis/boşluk. */
export const WORLD_RADIUS = ZONES[ZONES.length - 1].rOut;

/** (x,z) noktasının merkeze Öklid uzaklığı. */
export function radiusAt(x, z) {
  return Math.sqrt(x * x + z * z);
}

/** Bölge indeksi (0..4). Dünya yarıçapının ötesi son bölgeye sabitlenir. */
export function zoneIndexAt(x, z) {
  const r2 = x * x + z * z;
  for (let i = 0; i < ZONES.length - 1; i++) {
    const ro = ZONES[i].rOut;
    if (r2 < ro * ro) return i;
  }
  return ZONES.length - 1;
}

/** (x,z) noktasındaki bölge kaydı. */
export function zoneAt(x, z) {
  return ZONES[zoneIndexAt(x, z)];
}

/**
 * İçinde bulunulan bölgenin en yakın sınırına (iç veya dış halka) uzaklık, blok.
 * Başlangıç Vadisi'nde iç sınır yoktur (yalnız dış). Son bölgede dış sınır dünya kenarıdır.
 */
export function distanceToZoneBoundary(x, z) {
  const r = radiusAt(x, z);
  const zn = ZONES[zoneIndexAt(x, z)];
  const dOut = Math.abs(zn.rOut - r);
  if (zn.id === 0) return dOut;
  return Math.min(dOut, Math.abs(r - zn.rIn));
}

/** Verilen bölgenin dış sınırına (mühür) işaretli uzaklık: içerideyse pozitif. */
export function distanceToZoneOuter(x, z, zoneIndex = zoneIndexAt(x, z)) {
  return ZONES[zoneIndex].rOut - radiusAt(x, z);
}

/**
 * Türkçe karakterleri ASCII'ye indirger ve küçük harfe çevirir (anahtar takma adları için):
 * 'item:kazma_ahşap' ≡ 'item:kazma_ahsap'.
 */
export function foldTr(s) {
  return String(s)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}
