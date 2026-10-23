/*
 * KEŞİF eşya görünüm tablosu (saf; three/DOM yok): eşya anahtarı → model türü + palet.
 *
 * heldItems.js (3D) ve itemIcons.js (2D) aynı tabloyu kullanır; böylece elde tutulan eşya ile
 * envanter simgesi aynı renklerde ve aynı türde olur. Her eşya (sim/items.js) bir `kind`'a çözülür;
 * MODEL_KINDS listesi her iki tarafta da kurucusu/çizicisi bulunması gereken tam kümedir (testle denetlenir).
 */
import { ITEM_LIST, itemByKey } from '../sim/items.js';
import { getBlock, blockByKey } from '../sim/blocks.js';

export const TIER_KEYS = ['ahşap', 'taş', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'];

/** Alet/silah kademesi paletleri (renkler 0xRRGGBB). glow: ışıyan kenar/damar rengi veya null. */
export const TIER_PALETTES = {
  ahşap: { head: 0xb0814a, light: 0xd2a367, dark: 0x7c5430, edge: 0x5a3b20, handle: 0x8a5a33, handleDark: 0x5e3c20, wrap: 0x6b4a2a, glow: null, rough: 0.82, metal: 0 },
  taş: { head: 0x9a9da3, light: 0xc3c6cc, dark: 0x6a6d73, edge: 0x45474d, handle: 0x8a5a33, handleDark: 0x5e3c20, wrap: 0x55402a, glow: null, rough: 0.88, metal: 0 },
  bakır: { head: 0xd1773f, light: 0xf2a566, dark: 0x8d4a22, edge: 0x65320f, handle: 0x7a4a2a, handleDark: 0x52301a, wrap: 0x2f6e5a, glow: null, rough: 0.4, metal: 0.18 },
  demir: { head: 0xd9dce1, light: 0xf7f9fc, dark: 0x9a9ea7, edge: 0x6a6e78, handle: 0x6a4a30, handleDark: 0x45301e, wrap: 0x3a3a42, glow: null, rough: 0.34, metal: 0.2 },
  altın: { head: 0xf4c940, light: 0xffe78c, dark: 0xc2901c, edge: 0x8a6410, handle: 0x7a4a2a, handleDark: 0x52301a, wrap: 0xb07018, glow: null, rough: 0.28, metal: 0.22 },
  elmas: { head: 0x4fe3d6, light: 0xb0fff7, dark: 0x1ea89e, edge: 0x0e6a64, handle: 0x2b4e56, handleDark: 0x1a3036, wrap: 0x0f8f86, glow: 0x28d8c8, rough: 0.2, metal: 0.1 },
  kuantum: { head: 0xb25cff, light: 0xe3b4ff, dark: 0x6a2fc0, edge: 0x3a1480, handle: 0x2a1848, handleDark: 0x180d2c, wrap: 0x8a3dff, glow: 0x9a4dff, rough: 0.18, metal: 0.1 },
  // teknoloji (sim/techData): elektrikli alet — TIER_KEYS'te (kazma/kılıç ilerleme kademeleri) YOK; yalnız görünüm paleti
  elektrikli: { head: 0x5ad7ff, light: 0xc4f4ff, dark: 0x1f7fa8, edge: 0x0e3f58, handle: 0x2b3340, handleDark: 0x161b24, wrap: 0x7affea, glow: 0x38e0ff, rough: 0.22, metal: 0.35 },
};
/** Zırh setleri: deri ayrı, diğerleri kademe paletleri. */
export const ARMOR_PALETTES = {
  deri: { head: 0x8a5a33, light: 0xb27a4a, dark: 0x5e3c20, edge: 0x3e2812, handle: 0x5e3c20, handleDark: 0x3e2812, wrap: 0xc9a35a, glow: null, rough: 0.8, metal: 0 },
  bakır: TIER_PALETTES.bakır,
  demir: TIER_PALETTES.demir,
  altın: TIER_PALETTES.altın,
  elmas: TIER_PALETTES.elmas,
  kuantum: TIER_PALETTES.kuantum,
  // Kuantum Zırhı (sim/techData SHIELD_SET): mavi enerji damarlı koyu metal
  kzırh: { head: 0x4a5a72, light: 0x9fb4d0, dark: 0x252f40, edge: 0x131a26, handle: 0x252f40, handleDark: 0x131a26, wrap: 0x6ad8ff, glow: 0x38c8ff, rough: 0.3, metal: 0.35 },
};

/** Her iki tarafta (3D kurucu + 2D çizici) bulunması gereken model türleri. */
export const MODEL_KINDS = [
  'block', 'plant', 'lantern', 'torch', 'pick', 'axe', 'shovel', 'sword', 'bow', 'arrow', 'gun', 'portalgun', 'cell', 'shield',
  'boots', 'hook', 'glider', 'compass', 'armor', 'apple', 'strawberry', 'carrot', 'potato', 'drumstick', 'chop', 'fish', 'bowl',
  'potion', 'stick', 'coal', 'raw', 'ingot', 'gem', 'crystal', 'dust', 'string', 'wool', 'leather', 'feather', 'flint', 'bone',
  'clay', 'brick', 'paper', 'book', 'orb', 'star', 'dye', 'crystalkey', 'key', 'bosskey', 'staff', 'jetpack', 'scanner', 'flat',
];

/** Elde tutuş: karakter kol duruşu (characterPoses HOLD anahtarı) ve el. */
const HOLDS = {
  pick: 'tool', axe: 'tool', shovel: 'tool', sword: 'sword', bow: 'bow', gun: 'gun', portalgun: 'gun', hook: 'gun',
  torch: 'torch', lantern: 'torch', block: 'block', plant: 'block', shield: 'shield', staff: 'torch', scanner: 'torch', jetpack: 'block',
};

/** 'item:<ad>' için düz (flat) eşya alt türleri. [kind, ayrıntı] */
const FLAT = {
  ok: ['arrow'], enerji_hücresi: ['cell'],
  elma: ['apple', 'red'], altın_elma: ['apple', 'gold'], çilek: ['strawberry'], havuç: ['carrot'],
  patates: ['potato', 'raw'], pişmiş_patates: ['potato', 'cooked'],
  çiğ_tavuk: ['drumstick', 'raw'], pişmiş_tavuk: ['drumstick', 'cooked'],
  çiğ_koyun_eti: ['chop', 'raw'], pişmiş_koyun_eti: ['chop', 'cooked'],
  çiğ_balık: ['fish', 'raw'], pişmiş_balık: ['fish', 'cooked'],
  mantar_çorbası: ['bowl', 'soup'], meyve_salatası: ['bowl', 'salad'], kase: ['bowl', 'empty'],
  sebze_çorbası: ['bowl', 'soup'], balık_güveci: ['bowl', 'soup'],
  şifa_iksiri: ['potion'], cam_şişe: ['potion', 'empty'],
  sopa: ['stick'], kömür: ['coal'], odun_kömürü: ['coal', 'charcoal'],
  ham_bakır: ['raw'], ham_demir: ['raw'], ham_altın: ['raw'],
  bakır_külçe: ['ingot'], demir_külçe: ['ingot'], altın_külçe: ['ingot'], kuantum_külçe: ['ingot'],
  elmas: ['gem'], zümrüt: ['gem'], kuantum_parçası: ['crystal'], ametist_parçası: ['crystal'],
  kızıltaş_tozu: ['dust'], kristal_tozu: ['dust'],
  ip: ['string'], yün: ['wool'], deri: ['leather'], tüy: ['feather'], çakmaktaşı: ['flint'], kemik: ['bone'],
  kil_topu: ['clay'], tuğla: ['brick'], kağıt: ['paper'], kitap: ['book'],
  kök_özü: ['orb'], taş_kalp: ['orb'], buz_kalbi: ['orb'], gölge_özü: ['orb'], yıldız: ['star'],
  küçük_anahtar: ['key'], boss_anahtarı: ['bosskey'],
  // büyü sistemi (sim/magicData.js): toz/kıymık/kristal ve iksir şişeleri (asalar 'staff' modeli ayrı kind)
  büyü_tozu: ['dust'], kuantum_kıymığı: ['crystal'], mana_kristali: ['gem'],
  iksir_guclu_sifa: ['potion'], iksir_hiz: ['potion'], iksir_ziplama: ['potion'], iksir_guc: ['potion'],
  iksir_gece_gorusu: ['potion'], iksir_ates_direnci: ['potion'], iksir_su_solugu: ['potion'], iksir_yenilenme: ['potion'],
  iksir_mana: ['potion'],
  // teknoloji (sim/techData.js): malzemeler mevcut simge türleriyle, cihazlar kendi türüyle
  bakır_tel: ['string'], devre_kartı: ['paper'], enerji_çekirdeği: ['orb'], kuantum_çekirdeği: ['orb'], lazer_merceği: ['gem'],
  pil_hücresi: ['cell'], çelik_levha: ['ingot'], jetpack: ['jetpack'], tarayıcı: ['scanner'],
};

/* ------------------------------------------------------------------------------------------------
 * Blok rengi (atlas yokken yedek): anahtar sözcüklerinden
 * ---------------------------------------------------------------------------------------------- */
const COLOR_RULES = [
  [/kırıktaş|kanyon/, 0x8a7a72], [/^taş_tuğla|taş_basamak|taş_plaka|cilalı|sütun/, 0xa4a6aa], [/^taş$/, 0x8d9094],
  [/çim_kar/, 0xe8eef4], [/çimen/, 0x6fae48], [/toprak/, 0x7a5638], [/kızıl_kum/, 0xc9703a], [/kumtaşı/, 0xd8c487],
  [/kum$/, 0xe6d49a], [/çakıl/, 0x8e8c8a], [/^kar$/, 0xf4f8fb], [/kaygan_buz|buz/, 0xa8d8f2], [/kil/, 0x9aa4b8],
  [/bazalt/, 0x3f4045], [/kristal_kaya/, 0x7fb4e8], [/çamur/, 0x5a4636],
  [/lav/, 0xff7a1c], [/su/, 0x3a8fd9],
  [/kömür/, 0x34343a], [/bakır_cev/, 0xc98a5a], [/demir_cev/, 0xc8b0a0], [/altın_cev/, 0xe8d070], [/elmas_cev/, 0x4fe3d6],
  [/kuantum_kristali/, 0xb25cff], [/kızıltaş/, 0xd0302a], [/zümrüt/, 0x3fd070], [/ametist/, 0xb06ae8],
  [/bakır_bl/, 0xd1773f], [/demir_bl/, 0xd6d9dd], [/altın_bl/, 0xf4c940], [/elmas_bl/, 0x4fe3d6], [/kuantum_bl/, 0xb25cff],
  [/ışık_bl/, 0xfff2b0], [/zıplama/, 0xe8504a],
  [/meşe_kütük/, 0x6a4c2e], [/huş_kütük/, 0xdcd8cc], [/çam_kütük/, 0x4a3524], [/akasya_kütük/, 0x8a6a48],
  [/meşe_(basamak|plaka)/, 0xb08850], [/huş_(basamak|plaka)/, 0xd8c890], [/çam_(basamak|plaka)/, 0x8a6a40],
  [/akasya_(basamak|plaka)/, 0xc88a4a], [/merdiven/, 0xa87a45], [/kesici/, 0x9a9da3], [/dokuma/, 0xa87a45],
  [/meşe_tahta/, 0xb08850], [/huş_tahta/, 0xd8c890], [/çam_tahta/, 0x8a6a40], [/akasya_tahta/, 0xc88a4a],
  [/meşe_yaprak/, 0x4f9a3a], [/huş_yaprak/, 0x78b84a], [/çam_yaprak/, 0x2f6a40], [/akasya_yaprak/, 0x88a83a],
  [/gelincik/, 0xe03a3a], [/sarı_çiçek/, 0xf2c91e], [/uzun_ot/, 0x6aa84a], [/çalı/, 0x5a8a3a], [/kaktüs/, 0x3a8a4a],
  [/mantar/, 0x7ad8ff], [/yosun/, 0x4a7a3a], [/sarmaşık/, 0x3a7a3a],
  [/^tuğla/, 0xb5533c], [/kitaplık/, 0x8a5a33], [/işaret/, 0xb08850], [/sandık/, 0x9a6a38], [/tezgah/, 0xa87a45],
  [/ocak/, 0x7a7a80], [/çit/, 0xa87a45], [/kapı/, 0x9a6a38], [/yatak/, 0xd84a4a], [/fener/, 0xffc760], [/meşale/, 0xffa030],
  [/ana_kaya/, 0x2a2a30], [/mühür/, 0x9a6aff], [/rün_kırmızı/, 0xe8504a], [/rün_mavi/, 0x4a8aff], [/rün_yeşil/, 0x4acf6a],
  [/rün_sarı/, 0xf2c91e], [/rün_mor/, 0xb06aff], [/portal_mavi/, 0x3aa0ff], [/portal_turuncu/, 0xff8a2a],
];
const FLAT_COLORS = {
  beyaz: 0xf0f0f0, siyah: 0x1d1d22, kırmızı: 0xc8312f, turuncu: 0xe8842a, sarı: 0xf2c91e, yeşil: 0x3f9a3a, mavi: 0x2f5fc8, mor: 0x8a3fc4,
};
/** Blok kaydı → temsilî renk (atlas yoksa küp/simge için). */
export function blockFallbackColor(block) {
  if (!block) return 0x888888;
  const key = block.key;
  const m = /_(beyaz|siyah|kırmızı|turuncu|sarı|yeşil|mavi|mor)$/.exec(key);
  if (m && /^(cam|beton|kumaş)_/.test(key)) return FLAT_COLORS[m[1]];
  for (let i = 0; i < COLOR_RULES.length; i++) if (COLOR_RULES[i][0].test(key)) return COLOR_RULES[i][1];
  // kararlı karma → ton
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = (h % 360) / 360;
  const c = hslToHex(hue, 0.35, 0.5);
  return c;
}
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

function tierFromKey(key) {
  const us = key.lastIndexOf('_');
  const t = us >= 0 ? key.slice(us + 1) : '';
  return TIER_KEYS.indexOf(t) >= 0 || t === 'elektrikli' ? t : null;
}

const cache = new Map();
const FALLBACK = Object.freeze({ key: '', kind: 'flat', sub: null, tier: null, palette: null, color: 0xbbbbbb, glow: 0, hold: 'food', hand: 'R', blockId: 0 });

/**
 * Eşya (anahtar | kayıt) → {key, kind, sub, tier, palette, color, glow, hold, hand, blockId}.
 * Bilinmeyen eşya 'flat' yedeğine düşer. Sonuçlar önbelleklidir ve dondurulmuştur.
 */
export function itemSpec(keyOrItem) {
  const it = typeof keyOrItem === 'string' ? itemByKey(keyOrItem) : keyOrItem;
  if (!it) return FALLBACK;
  const hit = cache.get(it.key);
  if (hit) return hit;
  const spec = { key: it.key, kind: 'flat', sub: null, tier: null, palette: null, color: it.color, glow: 0, hold: 'food', hand: 'R', blockId: 0 };
  const name = it.key.indexOf(':') >= 0 ? it.key.slice(it.key.indexOf(':') + 1) : it.key;
  const bareName = name;
  switch (it.model) {
    case 'cube': {
      const b = it.placesBlock ? getBlock(it.placesBlock) : blockByKey(name);
      spec.kind = 'block';
      spec.blockId = b ? b.id : 0;
      spec.color = blockFallbackColor(b);
      spec.glow = b ? b.emission : 0;
      spec.sub = b ? b.shape : 'cube';
      break;
    }
    case 'torch':
      spec.kind = name === 'fener' ? 'lantern' : 'torch';
      spec.color = name === 'fener' ? 0xffc760 : 0xffa030;
      spec.glow = 14;
      break;
    case 'tool': {
      const type = it.tool && it.tool.type;
      spec.kind = type === 'balta' ? 'axe' : type === 'kürek' ? 'shovel' : 'pick';
      spec.tier = tierFromKey(it.key) || 'ahşap';
      spec.palette = TIER_PALETTES[spec.tier];
      break;
    }
    case 'sword':
      spec.kind = 'sword';
      spec.tier = tierFromKey(it.key) || 'ahşap';
      spec.palette = TIER_PALETTES[spec.tier];
      break;
    case 'bow': spec.kind = 'bow'; break;
    case 'gun':
      spec.kind = it.ability === 'portalGun' ? 'portalgun' : 'gun';
      if (spec.kind === 'gun' && /_mk2$/.test(name)) spec.sub = 'mk2'; // Işın Tüfeği Mk2: yeşil-turkuaz çekirdek, 6 bobin
      break;
    case 'shield': spec.kind = 'shield'; spec.hand = 'L'; break;
    case 'boots': spec.kind = 'boots'; break;
    case 'hook': spec.kind = 'hook'; break;
    case 'glider': spec.kind = 'glider'; break;
    case 'compass': spec.kind = 'compass'; break;
    case 'staff': spec.kind = 'staff'; spec.glow = 6; break; // büyü asası (sim/magicData)
    case 'armor':
      spec.kind = 'armor';
      spec.sub = it.armor ? it.armor.slot : 'göğüs';
      spec.tier = it.armor ? it.armor.set : 'demir';
      spec.palette = ARMOR_PALETTES[spec.tier] || TIER_PALETTES.demir;
      break;
    default: {
      // düz eşyalar
      if (it.key.indexOf('blok:') === 0) {
        spec.kind = 'plant';
        const b = blockByKey(name);
        spec.color = blockFallbackColor(b);
        spec.glow = b ? b.emission : 0;
        spec.blockId = b ? b.id : 0;
      } else if (/^boya_/.test(bareName)) {
        spec.kind = 'dye';
      } else if (/^anahtar_kristali_z/.test(bareName)) {
        spec.kind = 'crystalkey';
        spec.sub = Number(bareName.slice(bareName.lastIndexOf('z') + 1)) || 0;
        spec.glow = 8;
      } else {
        const f = FLAT[name];
        if (f) { spec.kind = f[0]; spec.sub = f[1] || null; } else spec.kind = 'flat';
      }
    }
  }
  spec.hold = HOLDS[spec.kind] || 'food';
  if (spec.kind === 'bow') spec.hand = 'L';
  if (it.rarity === 'nadir' || it.rarity === 'efsanevi') spec.glow = Math.max(spec.glow, 2);
  const frozen = Object.freeze(spec);
  cache.set(it.key, frozen);
  return frozen;
}

/** Kademe paleti (bilinmeyen kademe → ahşap). */
export function tierPalette(tier) {
  return TIER_PALETTES[tier] || TIER_PALETTES.ahşap;
}

/** Tüm eşyaların tür sayımı (test/teşhis). */
export function kindCoverage() {
  const out = {};
  ITEM_LIST.forEach((it) => {
    const k = itemSpec(it).kind;
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

