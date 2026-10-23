/*
 * KEŞİF sim — AĞAÇ DEVİRME genişletmesi: fidan blokları/eşyaları, ayarlar, görev ve başarım verisi (saf veri).
 *
 * blocks.js bu dosyanın blok tanımlarını, items.js eşya tanımlarını, questsData/achievementsData görev-başarım satırlarını
 * İÇE AKTARIR (append-only; craftData.js / magicData.js ile aynı desen). Bu dosya HİÇBİR sim modülünü içe aktarmaz
 * (döngü olmasın diye yalnızca düz değerler).
 *
 * Blok kimlikleri: 250–253 (yedek aralık; biyom 160–199 ve teknoloji 200–239 aralıklarına dokunulmaz).
 *   250 meşe fidanı · 251 huş fidanı · 252 çam fidanı · 253 akasya fidanı   (çapraz bitki; çimen/toprak üstüne dikilir)
 */

export const TREE_BLOCK_IDS = Object.freeze({
  SAPLING_OAK: 250,
  SAPLING_BIRCH: 251,
  SAPLING_PINE: 252,
  SAPLING_ACACIA: 253,
});

/** Türler: ağaç türü ↔ fidan ↔ kütük/yaprak anahtarı. treeIndex = worldgenFlora.TREE değeri (küçük biçim). */
export const TREE_SPECIES = Object.freeze([
  Object.freeze({
    key: 'meşe', name: 'Meşe', up: 'OAK', sapling: 250, treeIndex: 0, log: 'meşe_kütük', leaf: 'meşe_yaprak', color: 0x5a9a3a,
  }),
  Object.freeze({
    key: 'huş', name: 'Huş', up: 'BIRCH', sapling: 251, treeIndex: 1, log: 'huş_kütük', leaf: 'huş_yaprak', color: 0x7bb85a,
  }),
  Object.freeze({
    key: 'çam', name: 'Çam', up: 'PINE', sapling: 252, treeIndex: 2, log: 'çam_kütük', leaf: 'çam_yaprak', color: 0x2f6e3c,
  }),
  Object.freeze({
    key: 'akasya', name: 'Akasya', up: 'ACACIA', sapling: 253, treeIndex: 3, log: 'akasya_kütük', leaf: 'akasya_yaprak', color: 0x9aa84a,
  }),
]);

export const SAPLING_BLOCK_IDS = Object.freeze(TREE_SPECIES.map((s) => s.sapling));

/** Fidan bloğu mu (kimlik 250–253). */
export function isSaplingId(id) {
  return id >= 250 && id <= 253;
}

/** Blok tanımları: {id, constName, key, name, opts} (blocks.js def() seçenekleri; CRAFT_BLOCK_DEFS ile aynı biçim). */
export const TREE_BLOCK_DEFS = Object.freeze(TREE_SPECIES.map((s) => Object.freeze({
  id: s.sapling,
  constName: 'SAPLING_' + s.up,
  key: s.key + '_fidanı',
  name: s.name + ' Fidanı',
  opts: Object.freeze({
    shape: 'cross', t: 'fidan_' + s.key, hardness: 0, sound: 'çim', group: 'doğa', tint: 'foliage',
  }),
})));

/** Fidan eşyaları (items.js otomatik üretmez: id > 99). */
export const TREE_BLOCK_ITEMS = Object.freeze(TREE_BLOCK_DEFS.map((d, i) => Object.freeze({
  key: 'blok:' + d.key,
  name: d.name,
  desc: TREE_SPECIES[i].name + ' ağacı olur: çimenli toprağa dik, bir süre bekle. Yaprakları kesince düşer.',
  color: TREE_SPECIES[i].color,
  rarity: 'yaygın',
  model: 'flat',
  placesBlock: d.id,
})));

/** Kütük/yaprak anahtarı → tür indeksi (TREE_SPECIES). */
export function speciesIndexByBlockKey(key) {
  for (let i = 0; i < TREE_SPECIES.length; i++) {
    if (TREE_SPECIES[i].log === key || TREE_SPECIES[i].leaf === key) return i;
  }
  return -1;
}

/* ------------------------------------------------------------------------------------------------
 * Ayarlar (sim + oyun katmanı ortak)
 * ---------------------------------------------------------------------------------------------- */
export const TREE_TUNING = Object.freeze({
  /** Bir devrilmede en çok kütük (aşarsa ağaç sayılmaz: dev orman zinciri çökmesin). */
  maxLogs: 600,
  /** Yaprağın kütüğe adım uzaklığı (26 komşu, yalnız yaprak hücreleri üzerinden). Bu içindeyse yaprak canlı kalır. */
  leafSteps: 4,
  /** Ağaç sayılması için gereken en az doğal yaprak. */
  minLeaves: 3,
  /** Bu toplam blok sayısı üstünde devrilme "basitleştirilmiş çöküş" olur (uzun çam ≈ 235 blok hâlâ gerçek devrilir; cangıl dev ağaçları çöker). */
  bigBlocks: 300,
  /** Basitleştirilmiş çöküş süresi (sn). */
  bigDuration: 1.5,
  /** Devrilme animasyonu süresi (sn): ağaç boyuna göre [kısa, uzun]. */
  fallMin: 1.2,
  fallMax: 1.8,
  /** Aynı anda en çok canlı devrilme. */
  maxActive: 3,
  /** Sıra bekleyen devrilme (sabit adım başına bir işlenir). */
  maxQueue: 24,
  /** Devrilen kütük başına en çok yığın sayısı (eşya varlığı bütçesi). */
  maxDropStacks: 16,
  dropStack: 8,
  /** Yaprak başına şans (çarpanla büyür). */
  stickChance: 0.07,
  saplingChance: 0.03,
  appleChance: 0.02,
  /** Yaprak çürümesi: tek adımda en çok bakılan hücre, kuyruk tavanı, gecikme aralığı (sn). */
  decayScan: 900,
  decayQueue: 480,
  decayMin: 1.2,
  decayMax: 9,
  /** Fidan büyümesi (yüklü dünyada sn): [en az, en çok]; ışık gerekir. */
  growMin: 50,
  growMax: 120,
  growRange: 80,
  growLight: 9,
  maxSaplings: 256,
  maxGrown: 300,
});

/* ------------------------------------------------------------------------------------------------
 * Görev / başarım (questsData.js ve achievementsData.js içe aktarır)
 * ---------------------------------------------------------------------------------------------- */
/** [id, başlık, açıklama, ipucu, hedef adedi, ön koşul[], xp]. Hedef: {type:'stat', name:'treesFelled'} (keşif zinciri). */
export const TREE_QUESTS = Object.freeze([
  Object.freeze({
    id: 'ks_agac_devir',
    title: 'Ağaç Devir',
    desc: 'Bir ağacı gövdesinden keserek devir.',
    hint: 'Bir ağacın en alttaki kütüğünü kır: üstündeki gövde ve yapraklar bir bütün olarak devrilir. Etraftan çekil.',
    n: 1,
    requires: Object.freeze([]),
    xp: 25,
  }),
  Object.freeze({
    id: 'ks_agac_dik',
    title: 'Yeniden Yeşersin',
    desc: 'Bir fidan dik ve ağaç olmasını bekle.',
    hint: 'Yaprakları kesince fidan düşebilir. Çimenli toprağa dik; aydınlıkta bir süre sonra ağaca dönüşür.',
    n: 1,
    requires: Object.freeze(['ks_agac_devir']),
    xp: 40,
  }),
]);

/** [id, başlık, açıklama, simge, ölçüt, hedef, xp]. */
export const TREE_ACHIEVEMENTS = Object.freeze([
  Object.freeze({
    id: 'ilk_agac', title: 'İlk Ağacı Devir', desc: 'Bir ağacı kökünden keserek devir.', icon: 'cekic', metric: 'treesFelled', target: 1, xp: 10,
  }),
  Object.freeze({
    id: 'kereste_ustasi', title: 'Kereste Ustası', desc: 'Yirmi beş ağaç devir.', icon: 'kazma', metric: 'treesFelled', target: 25, xp: 60,
  }),
  Object.freeze({
    id: 'fidanci', title: 'Fidancı', desc: 'On fidanı ağaca dönüştür.', icon: 'elma', metric: 'treesGrown', target: 10, xp: 40,
  }),
]);
