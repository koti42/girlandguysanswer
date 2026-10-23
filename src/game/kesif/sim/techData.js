/*
 * KEŞİF sim — TEKNOLOJİ katmanı: saf veri tabloları (bloklar 200–222, eşyalar, tarifler, makine sabitleri).
 *
 * blocks.js bu dosyanın blok tanımlarını, items.js eşya + tarif tablolarını İÇE AKTARIR (append-only; craftData/magicData ile
 * aynı örüntü). Döngü olmasın diye bu dosya HİÇBİR sim modülünü içe aktarmaz (yalnız düz değerler). Mantık tech*.js'tedir.
 *
 * Enerji birimi: 'EU' (enerji birimi). Hız birimi EU/sn. Makine sabitleri TECH_RATES içindedir; testler bu tabloyu okur.
 * Blok kimlikleri: 200–222 (tech blokları macera-only; id > 99 → paylaşılan haritada yasak). 223–239 yedek.
 *
 * Her blok kaydı: {id, constName, key, name, type, role, base, opts, item}
 *   type  makine türü (ASCII; TechState.machines[..].t) | null (kablo / laboratuvar kayıt gerektirmez)
 *   role  'station' | 'gen' | 'store' | 'wire' | 'load' | 'switch'
 *   base  durum varyantı ise taban blok kimliği (ör. Lamba Paneli ETKİN → Lamba Paneli)
 *   item  taban blok için yerleştirme eşyası var mı
 */

export const TECH_VERSION = 1;
export const ENERGY_UNIT = 'EU';

/** Blok kimlikleri (B.TECH_* sabitleri blocks.js'te üretilir). */
export const TECH_BLOCK_IDS = Object.freeze({
  LAB: 200,
  SOLAR: 201,
  GENERATOR: 202,
  GENERATOR_ON: 203,
  BATTERY: 204,
  CABLE: 205,
  FURNACE: 206,
  FURNACE_ON: 207,
  DRILL: 208,
  DRILL_ON: 209,
  LAMP: 210,
  LAMP_ON: 211,
  TELEPORTER: 212,
  TELEPORTER_ON: 213,
  LIFT: 214,
  DOOR: 215,
  DOOR_OPEN: 216,
  BUTTON: 217,
  BUTTON_ON: 218,
  SENSOR: 219,
  SENSOR_ON: 220,
  CHARGER: 221,
  CHARGER_ON: 222,
});
export const TECH_ID_MIN = 200;
export const TECH_ID_MAX = 222;

/** Makine türleri (ASCII). */
export const MACHINE_TYPES = Object.freeze([
  'gunes', 'jenerator', 'pil', 'ocak', 'matkap', 'lamba', 'isinlayici', 'asansor', 'kapi', 'dugme', 'sensor', 'sarj',
]);

/* ------------------------------------------------------------------------------------------------
 * Makine sabitleri (hız = EU/sn; süre = sn; kapasite = EU)
 * ---------------------------------------------------------------------------------------------- */
export const TECH_RATES = Object.freeze({
  solar: Object.freeze({ peak: 4, rainMul: 0.35, stormMul: 0.1, skyCheckEvery: 5 }),
  generator: Object.freeze({ rate: 12, maxFuel: 64 }),
  battery: Object.freeze({ cap: 5000, io: 50 }),
  furnace: Object.freeze({ power: 10, baseTime: 10, speed: 2, stack: 64 }),
  drill: Object.freeze({
    power: 20, minTime: 0.25, timePerHardness: 0.45, maxDepth: 400, area: 2, layerStepsPerTick: 24, bufferCap: 256,
  }),
  lamp: Object.freeze({ power: 1 }),
  door: Object.freeze({ power: 0.5 }),
  teleporter: Object.freeze({ cap: 240, charge: 25, baseCost: 60, perDistance: 0.25, maxCost: 240, cooldown: 5, minReady: 60 }),
  lift: Object.freeze({ cap: 80, charge: 12, costPerBlock: 1.5, minCost: 6, cooldown: 0.6, maxRange: 96, speed: 8 }),
  charger: Object.freeze({ cap: 600, intake: 45, outRate: 60, range: 3.5 }),
  button: Object.freeze({ pulse: 3 }),
  sensor: Object.freeze({ radius: 5, minRadius: 2, maxRadius: 8 }),
  network: Object.freeze({ maxNodes: 2000, energyStep: 1, maxStepsPerTick: 5 }),
});

/** Yakıt tablosu (Yakıt Jeneratörü): eşya → yanma süresi (sn). Ocak ısısının yarısı (kömür 80 → 40 sn). */
export const GENERATOR_FUEL = Object.freeze({
  'item:kömür': 40,
  'item:odun_kömürü': 40,
  'blok:akasya_kütük': 8,
  'blok:çam_kütük': 8,
  'blok:huş_kütük': 8,
  'blok:meşe_kütük': 8,
  'blok:akasya_tahta': 5,
  'blok:çam_tahta': 5,
  'blok:huş_tahta': 5,
  'blok:meşe_tahta': 5,
  'item:sopa': 2.5,
});

/** Işınlanma frekansı: 4 sembol, her biri 0..7. Sembol adları (renk körlüğü için şekil). */
export const FREQ_SYMBOLS = Object.freeze(['üçgen', 'daire', 'kare', 'yıldız', 'baklava', 'ay', 'güneş', 'kristal']);
export const FREQ_LENGTH = 4;

/** Matkabın kullandığı sanal alet (tüm doğal cevherleri kazar). */
export const DRILL_TOOL = 'item:kazma_elmas';

/* ------------------------------------------------------------------------------------------------
 * Şarj edilebilir eşya sabitleri
 * ---------------------------------------------------------------------------------------------- */
export const ITEM_CELL = 'item:enerji_hücresi';
export const JETPACK = Object.freeze({
  max: 1000, start: 0.5, accel: 48, maxVy: 7.2, fuelPerSec: 22, cellFuel: 220, fallMul: 0.3, engageVy: 3,
});
export const SCANNER = Object.freeze({
  max: 400, period: 6, cost: 8, radius: 24, maxPings: 24, clusterGap: 4, maxCells: 70000,
});
export const ELECTRIC_TOOL = Object.freeze({ max: 800, useCost: 2, chargedMul: 1.6, deadMul: 0.35 });
export const SHIELD = Object.freeze({ max: 250, start: 0.5, perPiece: 0.18, costPerHp: 6 });
export const PORTAL_GUN = Object.freeze({ max: 24, start: 1, shotCost: 1, cellCharges: 12 });

/** Hızlı arama: bu anahtarlı eşyalar şarj taşır (tech.chargeMax). */
export const CHARGE_KINDS = Object.freeze(['jetpack', 'scanner', 'elektrikli', 'kalkan', 'portalgun']);

/* ------------------------------------------------------------------------------------------------
 * Bloklar
 * ---------------------------------------------------------------------------------------------- */
const blockDefs = [];
function BD(constName, key, name, o) {
  const id = TECH_BLOCK_IDS[constName];
  blockDefs.push(Object.freeze({
    id,
    constName: 'TECH_' + constName,
    key,
    name,
    type: o.type || null,
    role: o.role,
    base: o.base || 0,
    item: !o.base,
    desc: o.desc || '',
    opts: Object.freeze(o.opts),
  }));
}

const METAL = { tool: 'kazma', tier: 1, sound: 'metal', group: 'mekanizma' };
const slab = { shape: 'slab' };

BD('LAB', 'teknoloji_laboratuvarı', 'Teknoloji Laboratuvarı', {
  role: 'station',
  desc: 'Gelişmiş malzeme, makine ve cihaz üretim istasyonu. Yanında durunca Üret menüsünde Teknoloji tarifleri açılır.',
  opts: Object.assign({ t: ['laboratuvar_üst', 'demir_bloğu', 'laboratuvar_yan'], hardness: 3, interact: 'laboratuvar', emission: 4 }, METAL),
});
BD('SOLAR', 'güneş_paneli', 'Güneş Paneli', {
  type: 'gunes',
  role: 'gen',
  desc: 'Gündüz enerji üretir (en çok 4 EU/sn). Üstü açık olmalı; gece ve yağmurda zayıflar.',
  opts: Object.assign({ t: ['güneş_üst', 'demir_bloğu', 'güneş_yan'], hardness: 1.5, interact: 'makine' }, METAL, slab),
});
BD('GENERATOR', 'yakıt_jeneratörü', 'Yakıt Jeneratörü', {
  type: 'jenerator',
  role: 'gen',
  desc: 'Kömür ve odun yakıp 12 EU/sn üretir. Yalnız enerjiye ihtiyaç varken yakıt harcar.',
  opts: Object.assign({ t: ['jeneratör_üst', 'demir_bloğu', 'jeneratör_yan'], hardness: 3, interact: 'makine' }, METAL),
});
BD('GENERATOR_ON', 'yakıt_jeneratörü_etkin', 'Yakıt Jeneratörü (Etkin)', {
  type: 'jenerator',
  role: 'gen',
  base: TECH_BLOCK_IDS.GENERATOR,
  opts: Object.assign({ t: ['jeneratör_üst', 'demir_bloğu', 'jeneratör_yan_etkin'], hardness: 3, interact: 'makine', emission: 8 }, METAL),
});
BD('BATTERY', 'pil_bankası', 'Pil Bankası', {
  type: 'pil',
  role: 'store',
  desc: 'Enerji depolar (5000 EU). Elindeki şarjlı aletleri doldurmak için ona sağ tıkla.',
  opts: Object.assign({ t: ['pil_üst', 'demir_bloğu', 'pil_yan'], hardness: 3, interact: 'makine' }, METAL),
});
BD('CABLE', 'kablo', 'Kablo', {
  role: 'wire',
  desc: 'Yan yana duran enerji bloklarını birbirine bağlar. 2000 bloğa kadar tek ağ olur.',
  opts: Object.assign({ t: 'kablo', hardness: 0.8 }, METAL),
});
BD('FURNACE', 'elektrikli_ocak', 'Elektrikli Ocak', {
  type: 'ocak',
  role: 'load',
  desc: 'Cevher eritir ve yemek pişirir, normal ocaktan 2 kat hızlı. Yakıt yerine enerji ister.',
  opts: Object.assign({ t: ['elektrikli_ocak_üst', 'demir_bloğu', 'elektrikli_ocak_yan'], hardness: 3, interact: 'makine' }, METAL),
});
BD('FURNACE_ON', 'elektrikli_ocak_etkin', 'Elektrikli Ocak (Etkin)', {
  type: 'ocak',
  role: 'load',
  base: TECH_BLOCK_IDS.FURNACE,
  opts: Object.assign({ t: ['elektrikli_ocak_üst', 'demir_bloğu', 'elektrikli_ocak_yan_etkin'], hardness: 3, interact: 'makine', emission: 9 }, METAL),
});
BD('DRILL', 'otomatik_madenci', 'Otomatik Madenci', {
  type: 'matkap',
  role: 'load',
  desc: 'Altındaki sütunu ya da 5x5 alanı aşağı doğru kazar; kırılamaz kayaya gelince durur. Yanındaki sandığa boşaltır.',
  opts: Object.assign({ t: ['matkap_üst', 'matkap_alt', 'matkap_yan'], hardness: 3.5, interact: 'makine' }, METAL),
});
BD('DRILL_ON', 'otomatik_madenci_etkin', 'Otomatik Madenci (Etkin)', {
  type: 'matkap',
  role: 'load',
  base: TECH_BLOCK_IDS.DRILL,
  opts: Object.assign({ t: ['matkap_üst', 'matkap_alt', 'matkap_yan_etkin'], hardness: 3.5, interact: 'makine', emission: 3 }, METAL),
});
BD('LAMP', 'lamba_paneli', 'Lamba Paneli', {
  type: 'lamba',
  role: 'load',
  desc: 'Enerji alınca çok parlak yanar (1 EU/sn). Sağ tık: ışık rengi ve açma/kapama anahtarı (çömelip sağ tık: blok koy).',
  opts: { t: 'lamba', hardness: 0.8, tool: 'kazma', sound: 'cam', group: 'mekanizma', interact: 'makine' },
});
BD('LAMP_ON', 'lamba_paneli_etkin', 'Lamba Paneli (Etkin)', {
  type: 'lamba',
  role: 'load',
  base: TECH_BLOCK_IDS.LAMP,
  opts: { t: 'lamba_etkin', hardness: 0.8, tool: 'kazma', sound: 'cam', group: 'mekanizma', emission: 15, interact: 'makine' },
});
BD('TELEPORTER', 'ışınlanma_platformu', 'Işınlanma Platformu', {
  type: 'isinlayici',
  role: 'load',
  desc: 'Aynı 4 sembollü frekansa ayarlı eşine ışınlar. Enerji harcar, bekleme süresi vardır.',
  opts: Object.assign({ t: ['ışınlayıcı_üst', 'demir_bloğu', 'ışınlayıcı_yan'], hardness: 3, interact: 'ışınlayıcı' }, METAL, slab),
});
BD('TELEPORTER_ON', 'ışınlanma_platformu_hazır', 'Işınlanma Platformu (Hazır)', {
  type: 'isinlayici',
  role: 'load',
  base: TECH_BLOCK_IDS.TELEPORTER,
  opts: Object.assign({ t: ['ışınlayıcı_üst_etkin', 'demir_bloğu', 'ışınlayıcı_yan'], hardness: 3, interact: 'ışınlayıcı', emission: 6 }, METAL, slab),
});
BD('LIFT', 'asansör_platformu', 'Asansör Platformu', {
  type: 'asansor',
  role: 'load',
  desc: 'Aynı sütundaki diğer asansör platformlarına yukarı ve aşağı taşır. Enerji harcar.',
  opts: Object.assign({ t: ['asansör_üst', 'demir_bloğu', 'asansör_yan'], hardness: 3, interact: 'asansör' }, METAL, slab),
});
BD('DOOR', 'güç_kapısı', 'Güç Kapısı', {
  type: 'kapi',
  role: 'load',
  desc: 'Enerji varken açılır, yoksa kapanır (0,5 EU/sn).',
  opts: Object.assign({ t: 'güç_kapısı', hardness: 4, interact: 'makine' }, METAL),
});
BD('DOOR_OPEN', 'güç_kapısı_açık', 'Güç Kapısı (Açık)', {
  type: 'kapi',
  role: 'load',
  base: TECH_BLOCK_IDS.DOOR,
  opts: Object.assign({
    t: 'güç_kapısı_açık', hardness: 4, interact: 'makine', collision: [], opaque: false, layer: 'cutout', light: 0, emission: 2,
  }, METAL),
});
BD('BUTTON', 'düğme', 'Düğme', {
  type: 'dugme',
  role: 'switch',
  desc: 'Sağ tıkla açıp kapat. Yalnız açıkken akımı geçirir; devrenin anahtarıdır.',
  opts: { shape: 'torch', t: 'düğme', hardness: 0.5, tool: 'kazma', sound: 'metal', interact: 'düğme', group: 'mekanizma' },
});
BD('BUTTON_ON', 'düğme_açık', 'Düğme (Açık)', {
  type: 'dugme',
  role: 'switch',
  base: TECH_BLOCK_IDS.BUTTON,
  opts: {
    shape: 'torch', t: 'düğme_açık', hardness: 0.5, tool: 'kazma', sound: 'metal', interact: 'düğme', emission: 4, group: 'mekanizma',
  },
});
BD('SENSOR', 'sensör', 'Sensör', {
  type: 'sensor',
  role: 'switch',
  desc: 'Yakınında oyuncu varken akımı geçirir (menzil 2–8 blok).',
  opts: { shape: 'torch', t: 'sensör', hardness: 0.5, tool: 'kazma', sound: 'metal', interact: 'makine', group: 'mekanizma' },
});
BD('SENSOR_ON', 'sensör_etkin', 'Sensör (Etkin)', {
  type: 'sensor',
  role: 'switch',
  base: TECH_BLOCK_IDS.SENSOR,
  opts: {
    shape: 'torch', t: 'sensör_etkin', hardness: 0.5, tool: 'kazma', sound: 'metal', interact: 'makine', emission: 5, group: 'mekanizma',
  },
});
BD('CHARGER', 'şarj_istasyonu', 'Şarj İstasyonu', {
  type: 'sarj',
  role: 'load',
  desc: 'Yanında durunca çantandaki şarjlı eşyaları (jetpack, alet, zırh, tarayıcı) doldurur.',
  opts: Object.assign({ t: ['şarj_üst', 'demir_bloğu', 'şarj_yan'], hardness: 3, interact: 'makine' }, METAL),
});
BD('CHARGER_ON', 'şarj_istasyonu_etkin', 'Şarj İstasyonu (Etkin)', {
  type: 'sarj',
  role: 'load',
  base: TECH_BLOCK_IDS.CHARGER,
  opts: Object.assign({ t: ['şarj_üst_etkin', 'demir_bloğu', 'şarj_yan_etkin'], hardness: 3, interact: 'makine', emission: 6 }, METAL),
});

export const TECH_BLOCK_DEFS = Object.freeze(blockDefs);

/** Durum varyantı → taban kimlik; tabanın kendisi de kendisine eşlenir (yalnız tech blokları için tanımlı). */
const baseOf = Object.create(null);
/** Taban kimlik → ETKİN varyant kimliği (varsa). */
const onOf = Object.create(null);
blockDefs.forEach((d) => {
  baseOf[d.id] = d.base || d.id;
  if (d.base) onOf[d.base] = d.id;
});
export function techBaseId(id) {
  const v = baseOf[id];
  return v === undefined ? 0 : v;
}
export function techOnId(baseId) {
  const v = onOf[baseId];
  return v === undefined ? baseId : v;
}
export function isTechBlockId(id) {
  return baseOf[id] !== undefined;
}
/** Makine türü (kablo/laboratuvar için null). */
export function machineTypeOfBlock(id) {
  for (let i = 0; i < blockDefs.length; i++) if (blockDefs[i].id === id) return blockDefs[i].type;
  return null;
}
const defById = Object.create(null);
blockDefs.forEach((d) => { defById[d.id] = d; });
export function techBlockDef(id) {
  return defById[id] || null;
}
/** Enerji ağına katılan (kablo dahil) blok mu? Laboratuvar katılmaz. Anahtarlar (düğme/sensör) yalnız ETKİN iken iletir. */
export function conductsPower(id) {
  const d = defById[id];
  if (!d || d.role === 'station') return false;
  if (d.role === 'switch') return d.base !== 0;
  return true;
}

/** Tech blok eşyaları (id > 99 olduğu için items.js otomatik üretmez): yalnız taban bloklar. */
export const TECH_BLOCK_ITEMS = Object.freeze(blockDefs.filter((d) => d.item).map((d) => Object.freeze({
  key: 'blok:' + d.key,
  name: d.name,
  desc: d.desc,
  color: 0x6a7480,
  rarity: d.key === 'ışınlanma_platformu' || d.key === 'otomatik_madenci' ? 'nadir' : 'seyrek',
  model: 'cube',
  placesBlock: d.id,
})));

/** İstasyon blokları (items.js STATION_BLOCKS'a eklenir). */
export const TECH_STATIONS = Object.freeze({ laboratuvar: Object.freeze([TECH_BLOCK_IDS.LAB]) });

export const TECH_RECIPE_CATEGORY = Object.freeze({ key: 'teknoloji', name: 'Teknoloji' });

/* ------------------------------------------------------------------------------------------------
 * Eşyalar (items.js sonuna eklenir). Alanlar items.js add() ile aynı; `tech` yeni alandır:
 *   tech:{kind, chargeMax, start}   (start: yeni eşyanın başlangıç şarj oranı 0..1)
 * ---------------------------------------------------------------------------------------------- */
const itemDefs = [];
function I(key, name, kind, o) {
  itemDefs.push(Object.freeze(Object.assign({ key, name, kind }, o)));
}

I('item:bakır_tel', 'Bakır Tel', 'malzeme', {
  desc: 'İnce bakır tel. Kablo, devre ve bataryaların temeli.', color: 0xd1773f, rarity: 'yaygın',
});
I('item:devre_kartı', 'Devre Kartı', 'malzeme', {
  desc: 'Her makinenin beyni. Bakır tel, kızıltaş tozu ve kristal tozundan yapılır.', color: 0x2f9a5a, rarity: 'seyrek',
});
I('item:enerji_çekirdeği', 'Enerji Çekirdeği', 'malzeme', {
  desc: 'Yoğun enerji depolayan kararlı çekirdek. Laboratuvarda üretilir.', color: 0x5ad7ff, rarity: 'nadir',
});
I('item:kuantum_çekirdeği', 'Kuantum Çekirdeği', 'malzeme', {
  desc: 'Uzayı bükebilen kuantum çekirdeği. Portal Silahının kalbi.', color: 0xb25cff, rarity: 'efsanevi',
});
I('item:lazer_merceği', 'Lazer Merceği', 'malzeme', {
  desc: 'Işını tek noktaya toplayan elmas mercek.', color: 0xbff4ff, rarity: 'nadir',
});
I('item:pil_hücresi', 'Pil Hücresi', 'malzeme', {
  desc: 'Pil Bankası ve çekirdeklerin yapıtaşı.', color: 0xe0b030, rarity: 'seyrek',
});
I('item:çelik_levha', 'Çelik Levha', 'malzeme', {
  desc: 'Demir ve kömürden dövülen sağlam levha. Örsta yapılır.', color: 0x9aa6b4, rarity: 'seyrek',
});

I('item:jetpack', 'Jetpack', 'özel', {
  desc: 'Çubukta taşırken zıplamayı basılı tut: yukarı itiş. Yakıtı Enerji Hücresiyle dolar; düşme hasarını azaltır.',
  model: 'flat', color: 0xff9a3a, rarity: 'nadir', stack: 1, tech: Object.freeze({ kind: 'jetpack', chargeMax: JETPACK.max, start: JETPACK.start }),
});
I('item:tarayıcı', 'Tarayıcı', 'özel', {
  desc: 'Çubukta taşırken belli aralıkla çevredeki cevher, yapı ve canlıları bulur. Şarj harcar.',
  model: 'flat', color: 0x5ad7ff, rarity: 'nadir', stack: 1, tech: Object.freeze({ kind: 'scanner', chargeMax: SCANNER.max, start: 1 }),
});
I('item:kazma_elektrikli', 'Elektrikli Kazma', 'alet', {
  desc: 'Çok hızlı kazar, her blokta şarj harcar. Pil Bankası ya da Şarj İstasyonunda dolar.',
  model: 'tool', color: 0x5ad7ff, rarity: 'nadir', stack: 1,
  tool: Object.freeze({ type: 'kazma', tier: 5, speed: 9, durability: 0 }),
  weapon: Object.freeze({ damage: 6, reach: 2.9, cooldown: 0.55 }),
  tech: Object.freeze({ kind: 'elektrikli', chargeMax: ELECTRIC_TOOL.max, start: 1 }),
});
I('item:balta_elektrikli', 'Elektrikli Balta', 'alet', {
  desc: 'Ağaçları anında devirir, her blokta şarj harcar. Pil Bankası ya da Şarj İstasyonunda dolar.',
  model: 'tool', color: 0x5ad7ff, rarity: 'nadir', stack: 1,
  tool: Object.freeze({ type: 'balta', tier: 5, speed: 9, durability: 0 }),
  weapon: Object.freeze({ damage: 8, reach: 3.1, cooldown: 0.8 }),
  tech: Object.freeze({ kind: 'elektrikli', chargeMax: ELECTRIC_TOOL.max, start: 1 }),
});
I('item:ışın_tüfeği_mk2', 'Işın Tüfeği Mk2', 'silah', {
  desc: 'Daha güçlü ve hızlı ışın tüfeği; Enerji Hücresiyle çalışır, blokları da kırar.',
  model: 'gun', color: 0x7affd8, rarity: 'efsanevi', durability: 1200,
  weapon: Object.freeze({
    damage: 14, reach: 80, cooldown: 0.28, ranged: true, ammo: ITEM_CELL, hitscan: true, blockDamage: true,
  }),
});

/** Kuantum Zırhı: enerji kalkanı (şarj harcayarak gelen hasarın bir kısmını emer). */
export const SHIELD_SET = Object.freeze({ set: 'kzırh', name: 'Kuantum Zırhı' });
const SHIELD_PARTS = [
  { slot: 'kafa', key: 'miğfer_kzırh', name: 'Kuantum Miğferi', def: 3, dur: 600 },
  { slot: 'göğüs', key: 'göğüslük_kzırh', name: 'Kuantum Göğüslüğü', def: 8, dur: 880 },
  { slot: 'bacak', key: 'bacaklık_kzırh', name: 'Kuantum Bacaklığı', def: 6, dur: 820 },
  { slot: 'ayak', key: 'çizme_kzırh', name: 'Kuantum Çizmesi', def: 3, dur: 700 },
];
SHIELD_PARTS.forEach((p) => {
  I('item:' + p.key, p.name, 'zırh', {
    desc: 'Kuantum Zırhı parçası: şarjlıyken gelen hasarın bir kısmını enerji kalkanı emer. Şarj Pil Bankasında dolar.',
    model: 'armor', color: 0x6ad8ff, rarity: 'efsanevi', durability: p.dur,
    armor: Object.freeze({ slot: p.slot, defense: p.def, set: SHIELD_SET.set }),
    tech: Object.freeze({ kind: 'kalkan', chargeMax: SHIELD.max, start: SHIELD.start }),
  });
});
export const SHIELD_ITEM_KEYS = Object.freeze(SHIELD_PARTS.map((p) => 'item:' + p.key));

/** Blok eşyaları. */
TECH_BLOCK_ITEMS.forEach((d) => {
  I(d.key, d.name, 'blok', {
    desc: d.desc, color: d.color, rarity: d.rarity, model: d.model, placesBlock: d.placesBlock,
  });
});

export const TECH_ITEM_DEFS = Object.freeze(itemDefs);
export const TECH_ITEM_KEYS = Object.freeze(itemDefs.map((d) => d.key));
/** Şarj taşıyan eşyalar (portal tabancası items.js'te `tech` alanıyla ayrıca tanımlanır). */
export const PORTAL_GUN_ITEM = 'item:portal_tabancası';
export const PORTAL_GUN_TECH = Object.freeze({ kind: 'portalgun', chargeMax: PORTAL_GUN.max, start: PORTAL_GUN.start });

/** Alet bilgisi (blocks.toolInfoFromKey yedeği): TOOL_TIERS'ta olmayan elektrikli aletler. */
export const TECH_TOOL_INFO = Object.freeze({
  'item:kazma_elektrikli': Object.freeze({ type: 'kazma', tierKey: 'elektrikli', level: 5, speed: 9, index: 5 }),
  'item:balta_elektrikli': Object.freeze({ type: 'balta', tierKey: 'elektrikli', level: 5, speed: 9, index: 5 }),
});

/* ------------------------------------------------------------------------------------------------
 * Tarifler: [id, çıktı, adet, [[girdi, adet]...], istasyon, kategori]  (items.js R() biçimi)
 * ---------------------------------------------------------------------------------------------- */
const T = 'teknoloji';
const WIRE = 'item:bakır_tel';
const BOARD = 'item:devre_kartı';
const CELLI = 'item:pil_hücresi';
const ECORE = 'item:enerji_çekirdeği';
const QCORE = 'item:kuantum_çekirdeği';
const LENS = 'item:lazer_merceği';
const PLATE = 'item:çelik_levha';
const INGOT = 'item:demir_külçe';
const REDS = 'item:kızıltaş_tozu';
const CRYS = 'item:kristal_tozu';
const GLASS = 'blok:cam';
const QINGOT = 'item:kuantum_külçe';
const SHARD = 'item:kuantum_kıymığı';

/** Laboratuvarı yapmak için gereken ara malzemeler 'tezgah'/'örs'te üretilir (laboratuvar kendini bekleyemez). */
export const TECH_RECIPES = Object.freeze([
  ['bakır_tel', WIRE, 6, [['item:bakır_külçe', 2]], 'tezgah', T],
  ['devre_kartı', BOARD, 1, [[WIRE, 4], [REDS, 2], [CRYS, 1]], 'tezgah', T],
  ['pil_hücresi', CELLI, 1, [[WIRE, 2], [REDS, 3], [INGOT, 1], ['item:kömür', 1]], 'tezgah', T],
  ['çelik_levha', PLATE, 2, [[INGOT, 2], ['item:kömür', 2]], 'örs', T],
  ['teknoloji_laboratuvarı', 'blok:teknoloji_laboratuvarı', 1, [[INGOT, 6], [BOARD, 2], [PLATE, 2], [GLASS, 2]], 'tezgah', T],

  ['enerji_çekirdeği', ECORE, 1, [[CELLI, 2], [REDS, 4], ['item:altın_külçe', 1], [BOARD, 1]], 'laboratuvar', T],
  ['lazer_merceği', LENS, 1, [[GLASS, 2], ['item:elmas', 1], [WIRE, 2], [CRYS, 2]], 'laboratuvar', T],
  ['kuantum_çekirdeği', QCORE, 1, [[QINGOT, 2], [ECORE, 1], [BOARD, 2], [SHARD, 2]], 'laboratuvar', T],
  ['lab:enerji_hücresi', ITEM_CELL, 2, [[CELLI, 1], [REDS, 2], [WIRE, 2]], 'laboratuvar', T],

  ['kablo', 'blok:kablo', 6, [[WIRE, 3], ['item:ip', 1]], 'laboratuvar', T],
  ['güneş_paneli', 'blok:güneş_paneli', 1, [[BOARD, 2], [GLASS, 3], [PLATE, 1], [WIRE, 2]], 'laboratuvar', T],
  ['yakıt_jeneratörü', 'blok:yakıt_jeneratörü', 1, [[INGOT, 4], [PLATE, 1], ['blok:ocak', 1], [WIRE, 2]], 'laboratuvar', T],
  ['pil_bankası', 'blok:pil_bankası', 1, [[CELLI, 4], [PLATE, 2], [WIRE, 2]], 'laboratuvar', T],
  ['elektrikli_ocak', 'blok:elektrikli_ocak', 1, [['blok:ocak', 1], [BOARD, 1], [WIRE, 4], [PLATE, 1]], 'laboratuvar', T],
  ['otomatik_madenci', 'blok:otomatik_madenci', 1, [['item:kazma_demir', 1], [BOARD, 2], [PLATE, 4], [ECORE, 1]], 'laboratuvar', T],
  ['lamba_paneli', 'blok:lamba_paneli', 2, [[CRYS, 2], [GLASS, 1], [WIRE, 1]], 'laboratuvar', T],
  ['ışınlanma_platformu', 'blok:ışınlanma_platformu', 2, [[BOARD, 3], [ECORE, 1], [PLATE, 2], [SHARD, 2]], 'laboratuvar', T],
  ['asansör_platformu', 'blok:asansör_platformu', 2, [[PLATE, 2], [BOARD, 1], [WIRE, 2], [INGOT, 2]], 'laboratuvar', T],
  ['güç_kapısı', 'blok:güç_kapısı', 1, [[PLATE, 4], [BOARD, 1], [WIRE, 2]], 'laboratuvar', T],
  ['düğme', 'blok:düğme', 2, [[WIRE, 1], ['blok:taş', 1], [REDS, 1]], 'laboratuvar', T],
  ['sensör', 'blok:sensör', 1, [[BOARD, 1], [CRYS, 2], [WIRE, 2], [REDS, 1]], 'laboratuvar', T],
  ['şarj_istasyonu', 'blok:şarj_istasyonu', 1, [[CELLI, 2], [PLATE, 2], [BOARD, 1], [WIRE, 2]], 'laboratuvar', T],

  ['portal_tabancası', PORTAL_GUN_ITEM, 1, [[QCORE, 1], [LENS, 1], [PLATE, 1], [ECORE, 1]], 'laboratuvar', T],
  ['jetpack', 'item:jetpack', 1, [[PLATE, 4], [ECORE, 1], [CELLI, 2], ['item:deri', 2]], 'laboratuvar', T],
  ['tarayıcı', 'item:tarayıcı', 1, [[BOARD, 2], [LENS, 1], [CELLI, 1], [PLATE, 1]], 'laboratuvar', T],
  ['kazma_elektrikli', 'item:kazma_elektrikli', 1, [['item:kazma_demir', 1], [BOARD, 1], [CELLI, 2], [PLATE, 2], [WIRE, 2]], 'laboratuvar', 'alet'],
  ['balta_elektrikli', 'item:balta_elektrikli', 1, [['item:balta_demir', 1], [BOARD, 1], [CELLI, 2], [PLATE, 2], [WIRE, 2]], 'laboratuvar', 'alet'],
  ['ışın_tüfeği_mk2', 'item:ışın_tüfeği_mk2', 1, [['item:ışın_tüfeği', 1], [ECORE, 1], [LENS, 1], [PLATE, 2]], 'laboratuvar', 'silah'],
  ['miğfer_kzırh', 'item:miğfer_kzırh', 1, [[QINGOT, 3], [PLATE, 2], [ECORE, 1]], 'laboratuvar', 'zırh'],
  ['göğüslük_kzırh', 'item:göğüslük_kzırh', 1, [[QINGOT, 5], [PLATE, 3], [ECORE, 2]], 'laboratuvar', 'zırh'],
  ['bacaklık_kzırh', 'item:bacaklık_kzırh', 1, [[QINGOT, 4], [PLATE, 3], [ECORE, 1]], 'laboratuvar', 'zırh'],
  ['çizme_kzırh', 'item:çizme_kzırh', 1, [[QINGOT, 3], [PLATE, 2], [ECORE, 1]], 'laboratuvar', 'zırh'],
].map((r) => Object.freeze(r)));

/** Tarif çıktılarından ve eşyalardan üretilen, görev/başarım ölçütlerinin baktığı tech anahtarları. */
export const TECH_CRAFTED_KEYS = Object.freeze(TECH_RECIPES.map((r) => r[1]));
/** Yerleştirilebilir (taban) tech blok kimlikleri (görev/başarım ölçütleri için). */
export const TECH_PLACEABLE_IDS = Object.freeze(blockDefs.filter((d) => d.item).map((d) => d.id));
/** Tüm tech blok kimlikleri (varyantlar dahil). */
export const TECH_ALL_IDS = Object.freeze(blockDefs.map((d) => d.id));

/** Tarama sınıflandırması için cevher blok kimliği → tür (blocks.js'in bilinen kimlikleri; 24..32). */
export const SCAN_ORES = Object.freeze({
  24: Object.freeze({ kind: 'kömür', name: 'Kömür', color: 0x3a3a44, rank: 1 }),
  25: Object.freeze({ kind: 'bakır', name: 'Bakır', color: 0xd1773f, rank: 2 }),
  26: Object.freeze({ kind: 'demir', name: 'Demir', color: 0xd6d9dd, rank: 3 }),
  27: Object.freeze({ kind: 'altın', name: 'Altın', color: 0xf4c940, rank: 5 }),
  28: Object.freeze({ kind: 'elmas', name: 'Elmas', color: 0x4fe3d6, rank: 7 }),
  29: Object.freeze({ kind: 'kuantum', name: 'Kuantum', color: 0xb25cff, rank: 9 }),
  30: Object.freeze({ kind: 'kızıltaş', name: 'Kızıltaş', color: 0xd0302a, rank: 4 }),
  31: Object.freeze({ kind: 'zümrüt', name: 'Zümrüt', color: 0x3fd070, rank: 6 }),
  32: Object.freeze({ kind: 'ametist', name: 'Ametist', color: 0xb06ae8, rank: 4 }),
});
