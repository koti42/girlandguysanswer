/*
 * KEŞİF sim — sandık ganimet tabloları (saf; belirlenimci).
 *
 *   lootForChest(seed, {x,y,z}, ctx) → [{item, count}]
 *     ctx: { structType, zone (0..4), tier (1..5; zorluk), kind: 'sandık'|'ödül'|'hazine'|'gizli'|'boss'|'parkur'|'kamp',
 *            index (yapı içi sandık sırası), parkourTier, starter (başlangıç kampı: ahşap alet garantisi) }
 *   Aynı (seed, konum, ctx) her zaman aynı listeyi verir; yalnızca konum+tohuma bağlıdır (sandık açılınca tüketilir).
 *
 * Seyreklik: yaygın / seyrek / nadir / efsanevi ağırlıkları bölge zorluğu ve sandık türüne göre kayar. İlerleme için kritik
 * eşyalar (meşale, yemek, bölgenin temel aleti) ERKEN yapılarda GARANTİ edilir (guaranteedLoot).
 */
import { hash3, seededRandom } from './rng.js';
import { ZONES } from './constants.js';
import { itemByKey } from './items.js';

const RARITY_ORDER = ['yaygın', 'seyrek', 'nadir', 'efsanevi'];
const TIER_KEYS = ['ahşap', 'taş', 'bakır', 'demir', 'altın', 'elmas', 'kuantum'];

/** [item, min, max, minZone, maxZone, ağırlık] */
const E = (item, min, max, z0, z1, w) => ({
  item, min, max, z0, z1, w: w === undefined ? 10 : w,
});

function tools(tierKey, z0, z1, w) {
  return [
    E('item:kazma_' + tierKey, 1, 1, z0, z1, w),
    E('item:balta_' + tierKey, 1, 1, z0, z1, w),
    E('item:kılıç_' + tierKey, 1, 1, z0, z1, w),
  ];
}

function armor(set, z0, z1, w) {
  return ['miğfer', 'göğüslük', 'bacaklık', 'çizme'].map((p) => E('item:' + p + '_' + set, 1, 1, z0, z1, w));
}

export const LOOT_TABLE = Object.freeze({
  yaygın: Object.freeze([
    E('blok:meşale', 3, 8, 0, 4, 14),
    E('item:elma', 2, 4, 0, 2, 10),
    E('item:havuç', 2, 5, 0, 2, 8),
    E('item:çilek', 2, 5, 0, 3, 6),
    E('item:pişmiş_tavuk', 1, 3, 0, 4, 8),
    E('item:pişmiş_patates', 2, 4, 0, 4, 6),
    E('item:sopa', 3, 8, 0, 2, 8),
    E('item:kömür', 3, 9, 0, 4, 10),
    E('blok:meşe_tahta', 6, 16, 0, 2, 8),
    E('blok:kırıktaş', 8, 24, 0, 3, 6),
    E('item:ok', 5, 14, 0, 4, 8),
    E('item:ip', 1, 4, 0, 3, 5),
    E('item:tüy', 2, 6, 0, 3, 4),
    E('item:kemik', 2, 5, 0, 4, 4),
    E('item:çakmaktaşı', 2, 5, 0, 3, 4),
    E('item:ham_bakır', 3, 7, 0, 2, 6),
    E('item:kil_topu', 3, 8, 0, 2, 3),
    E('blok:cam', 4, 10, 1, 4, 3),
    E('item:büyü_tozu', 2, 6, 0, 4, 5),
  ]),
  seyrek: Object.freeze([
    E('item:ham_demir', 2, 5, 1, 4, 8),
    E('item:bakır_külçe', 2, 5, 0, 3, 8),
    E('item:demir_külçe', 2, 5, 1, 4, 8),
    E('item:altın_külçe', 1, 4, 2, 4, 6),
    E('item:şifa_iksiri', 1, 2, 0, 4, 8),
    E('item:pişmiş_koyun_eti', 2, 4, 0, 4, 6),
    E('item:mantar_çorbası', 1, 2, 1, 4, 5),
    E('item:meyve_salatası', 1, 2, 1, 4, 5),
    E('item:yay', 1, 1, 0, 3, 6),
    E('item:kalkan', 1, 1, 0, 3, 5),
    E('item:kızıltaş_tozu', 2, 6, 1, 4, 6),
    E('item:kristal_tozu', 2, 6, 0, 4, 5),
    E('item:deri', 2, 5, 0, 2, 5),
    E('item:enerji_hücresi', 2, 5, 3, 4, 6),
    E('item:ametist_parçası', 2, 5, 1, 4, 4),
    E('blok:fener', 2, 4, 0, 4, 4),
    E('item:kuantum_kıymığı', 1, 3, 1, 4, 5),
    // teknoloji malzemeleri (techData.js): yaygın hammaddeler erken, çekirdekler geç
    E('item:bakır_tel', 3, 8, 1, 4, 5),
    E('item:pil_hücresi', 1, 2, 1, 4, 4),
    E('item:çelik_levha', 1, 3, 2, 4, 4),
    E('item:devre_kartı', 1, 2, 2, 4, 3),
    E('item:iksir_hiz', 1, 2, 0, 4, 3),
    E('item:iksir_gece_gorusu', 1, 2, 0, 4, 3),
    E('item:iksir_ziplama', 1, 2, 1, 4, 3),
    E('item:iksir_su_solugu', 1, 2, 1, 4, 3),
    E('item:iksir_mana', 1, 2, 1, 4, 3),
    ...armor('deri', 0, 1, 4),
    ...armor('bakır', 1, 2, 4),
    ...tools('taş', 0, 1, 5),
    ...tools('bakır', 1, 2, 4),
  ]),
  nadir: Object.freeze([
    E('item:elmas', 1, 2, 1, 4, 8),
    E('item:zümrüt', 1, 3, 1, 4, 5),
    E('item:altın_elma', 1, 2, 1, 4, 5),
    E('item:kuantum_parçası', 1, 3, 3, 4, 8),
    E('item:pusula', 1, 1, 0, 3, 3),
    E('item:ışın_tüfeği', 1, 1, 3, 4, 3),
    E('item:mana_kristali', 1, 1, 1, 4, 4),
    E('item:devre_kartı', 1, 3, 2, 4, 4),
    E('item:enerji_çekirdeği', 1, 1, 2, 4, 3),
    E('item:lazer_merceği', 1, 1, 3, 4, 2),
    E('item:asa_ates', 1, 1, 1, 4, 2),
    E('item:asa_buz', 1, 1, 2, 4, 2),
    E('item:asa_sifa', 1, 1, 1, 4, 2),
    E('item:iksir_guclu_sifa', 1, 2, 1, 4, 3),
    E('item:iksir_guc', 1, 2, 1, 4, 3),
    E('item:iksir_ates_direnci', 1, 2, 2, 4, 3),
    E('item:iksir_yenilenme', 1, 2, 1, 4, 3),
    ...tools('demir', 1, 3, 4),
    ...tools('altın', 2, 4, 2),
    ...tools('elmas', 3, 4, 3),
    ...armor('demir', 2, 3, 3),
    ...armor('altın', 2, 4, 2),
    ...armor('elmas', 3, 4, 2),
  ]),
  efsanevi: Object.freeze([
    E('item:elmas', 3, 5, 2, 4, 8),
    E('item:altın_elma', 2, 4, 1, 4, 6),
    E('item:kuantum_külçe', 1, 2, 3, 4, 6),
    E('item:kuantum_parçası', 3, 5, 3, 4, 6),
    ...tools('kuantum', 4, 4, 3),
    ...armor('kuantum', 4, 4, 2),
    ...armor('elmas', 3, 4, 3),
    E('item:ışın_tüfeği', 1, 1, 2, 4, 3),
    E('item:asa_kuantum', 1, 1, 3, 4, 3),
    E('item:mana_kristali', 2, 3, 2, 4, 4),
    E('item:büyü_tozu', 8, 16, 1, 4, 6),
    E('item:enerji_çekirdeği', 1, 2, 3, 4, 4),
    E('item:kuantum_çekirdeği', 1, 1, 4, 4, 2),
  ]),
});

/** Yapı temalı ek ganimet havuzları (sandık başına 1–2 ekstra çekim): yapı türüne özgü his. */
export const STRUCT_THEME = Object.freeze({
  kamp: Object.freeze([
    E('item:pişmiş_tavuk', 2, 4, 0, 4, 8), E('item:pişmiş_patates', 2, 5, 0, 4, 6), E('blok:meşale', 4, 10, 0, 4, 10),
    E('item:ip', 2, 5, 0, 3, 4), E('blok:kumaş_beyaz', 3, 6, 0, 4, 3), E('item:çilek', 3, 6, 0, 3, 4),
  ]),
  koy: Object.freeze([
    E('item:havuç', 3, 6, 0, 2, 8), E('item:elma', 2, 5, 0, 2, 8), E('item:meyve_salatası', 1, 2, 1, 4, 4),
    E('item:kitap', 1, 2, 0, 4, 4), E('item:yün', 2, 5, 0, 3, 5), E('item:deri', 1, 3, 0, 3, 4),
  ]),
  harabe: Object.freeze([
    E('blok:taş_tuğla', 8, 16, 0, 4, 8), E('blok:sütun', 2, 6, 0, 4, 5), E('item:kitap', 1, 2, 0, 4, 5),
    E('blok:kitaplık', 1, 2, 0, 4, 3), E('item:kömür', 4, 10, 0, 4, 6), E('item:kemik', 2, 5, 0, 4, 4),
    E('item:büyü_tozu', 2, 5, 0, 4, 5),
  ]),
  gizlimagara: Object.freeze([
    E('item:ham_bakır', 3, 6, 0, 2, 8), E('item:ham_demir', 2, 5, 1, 4, 8), E('item:kızıltaş_tozu', 3, 7, 1, 4, 6),
    E('item:ametist_parçası', 3, 6, 0, 4, 6), E('item:elmas', 1, 2, 2, 4, 4), E('item:zümrüt', 1, 2, 2, 4, 3),
    E('item:kömür', 5, 12, 0, 4, 6), E('item:büyü_tozu', 2, 6, 0, 4, 5), E('item:kuantum_kıymığı', 1, 2, 1, 4, 4),
    E('item:bakır_tel', 3, 8, 1, 4, 5), E('item:çelik_levha', 1, 3, 2, 4, 4), E('item:pil_hücresi', 1, 2, 1, 4, 4),
  ]),
  hazine: Object.freeze([
    E('item:altın_külçe', 2, 5, 1, 4, 8), E('item:zümrüt', 1, 3, 1, 4, 6), E('item:elmas', 1, 2, 1, 4, 5),
    E('item:altın_elma', 1, 2, 1, 4, 3), E('item:bakır_külçe', 3, 6, 0, 2, 6),
  ]),
  yuzenada: Object.freeze([
    E('item:kristal_tozu', 3, 7, 0, 4, 8), E('item:ametist_parçası', 2, 5, 0, 4, 6), E('item:enerji_hücresi', 2, 4, 3, 4, 4),
    E('item:altın_elma', 1, 1, 1, 4, 3), E('item:zümrüt', 1, 2, 1, 4, 3), E('item:büyü_tozu', 3, 7, 0, 4, 6),
    E('item:devre_kartı', 1, 3, 2, 4, 5), E('item:enerji_çekirdeği', 1, 1, 3, 4, 3),
  ]),
  turbe: Object.freeze([
    E('item:şifa_iksiri', 1, 2, 0, 4, 8), E('item:kitap', 1, 3, 0, 4, 5), E('item:kızıltaş_tozu', 2, 5, 1, 4, 5),
    E('item:kristal_tozu', 2, 5, 0, 4, 5), E('item:büyü_tozu', 2, 5, 0, 4, 6),
  ]),
  anahtartapinagi: Object.freeze([
    E('item:şifa_iksiri', 1, 2, 0, 4, 8), E('item:altın_elma', 1, 2, 1, 4, 4), E('item:demir_külçe', 2, 5, 1, 4, 6),
    E('item:kristal_tozu', 3, 6, 0, 4, 5), E('blok:fener', 2, 4, 0, 4, 4), E('item:büyü_tozu', 3, 7, 0, 4, 6),
    E('item:mana_kristali', 1, 1, 1, 4, 2),
  ]),
  parkur: Object.freeze([
    E('item:altın_külçe', 1, 3, 2, 4, 6), E('item:elma', 2, 4, 0, 2, 6), E('item:elmas', 1, 2, 3, 4, 4),
    E('item:kuantum_parçası', 1, 2, 4, 4, 4), E('item:pişmiş_tavuk', 2, 3, 0, 4, 5),
  ]),
  bossarena: Object.freeze([
    E('item:elmas', 2, 4, 1, 4, 8), E('item:altın_elma', 2, 3, 1, 4, 6), E('item:kuantum_parçası', 2, 4, 3, 4, 6),
    E('item:şifa_iksiri', 2, 3, 0, 4, 6), E('item:büyü_tozu', 6, 12, 0, 4, 8), E('item:mana_kristali', 1, 2, 1, 4, 5),
  ]),
});

/** Sandık türü → {rolls:[min,max], bonus (seyreklik kayması)} */
const KINDS = Object.freeze({
  sandık: { rolls: [3, 5], bonus: 0 },
  kamp: { rolls: [4, 6], bonus: 0 },
  ödül: { rolls: [5, 7], bonus: 1 },
  hazine: { rolls: [5, 7], bonus: 1.5 },
  gizli: { rolls: [4, 6], bonus: 1 },
  parkur: { rolls: [4, 6], bonus: 1 },
  boss: { rolls: [8, 10], bonus: 3 },
});

/** Bölge indeksi → temel alet kademesi (erken yapılarda garanti). */
export const ZONE_BASE_TOOL = Object.freeze(['taş', 'bakır', 'demir', 'elmas', 'kuantum']);

function clampZone(z) {
  const n = Math.floor(Number(z));
  return Number.isFinite(n) ? Math.max(0, Math.min(ZONES.length - 1, n)) : 0;
}

/** Seyreklik ağırlıkları [yaygın, seyrek, nadir, efsanevi]. */
export function rarityWeights(zone, tier, kind) {
  const z = clampZone(zone);
  const t = Math.max(1, Math.min(5, tier | 0 || 1));
  const k = KINDS[kind] || KINDS.sandık;
  const b = k.bonus + (t - 1) * 0.35;
  return [
    Math.max(8, 60 - z * 4 - b * 9),
    28 + z * 1 + b * 2,
    9 + z * 2 + b * 5,
    Math.max(0, -1 + z * 0.8 + b * 1.6),
  ];
}

/**
 * Erken yapılarda garanti edilen eşyalar [{item,count}] (meşale + yemek + bölge aleti).
 * index: yapı içi sandık sırası (0 = ilk sandık → alet de burada).
 */
export function guaranteedLoot(ctx) {
  const z = clampZone(ctx.zone);
  const out = [];
  const kind = ctx.kind || 'sandık';
  if (kind === 'parkur' || kind === 'boss') return out;
  if (z <= 1 || ctx.structType === 'kamp') {
    out.push({ item: 'blok:meşale', count: z === 0 || ctx.starter ? 6 : 4 });
    out.push({ item: z === 0 || ctx.starter ? 'item:elma' : 'item:pişmiş_tavuk', count: z === 0 || ctx.starter ? 3 : 2 });
  }
  const first = (ctx.index | 0) === 0;
  if (ctx.starter && first) {
    out.push({ item: 'item:kazma_ahşap', count: 1 });
    out.push({ item: 'item:balta_ahşap', count: 1 });
  } else if (ctx.structType === 'kamp' && z === 0) {
    out.push({ item: 'item:kazma_ahşap', count: 1 });
    out.push({ item: 'item:balta_ahşap', count: 1 });
  } else if (first && (kind === 'ödül' || ctx.structType === 'anahtartapinagi' || ctx.structType === 'turbe')) {
    out.push({ item: 'item:kazma_' + ZONE_BASE_TOOL[z], count: 1 });
    if (z <= 2) out.push({ item: 'item:kılıç_' + ZONE_BASE_TOOL[z], count: 1 });
  }
  return out;
}

function pickWeighted(rng, list) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i].w;
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].w;
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

function rollCount(rng, e, zone) {
  let n = e.min + Math.floor(rng.next() * (e.max - e.min + 1));
  if (e.max > 1 && zone >= 3 && e.item.indexOf('blok:') === 0) n = Math.min(64, n * 2);
  return n;
}

/**
 * Ganimet listesi. Belirlenimli: yalnız (seed, x,y,z, ctx). Birleştirilmiş yığınlar (aynı eşya tek satır), en çok 27.
 */
export function lootForChest(seed, pos, ctx) {
  const c = ctx || {};
  const zone = clampZone(c.zone);
  const tier = Math.max(1, Math.min(5, (c.tier | 0) || ZONES[zone].difficulty));
  const kind = KINDS[c.kind] ? c.kind : 'sandık';
  const kd = KINDS[kind];
  const rng = seededRandom(hash3(pos.x | 0, pos.y | 0, pos.z | 0, (seed | 0) ^ 0x10071e));
  const items = [];
  const seen = new Map();
  const add = (item, count) => {
    if (!itemByKey(item)) return;
    const prev = seen.get(item);
    if (prev) prev.count = Math.min(itemByKey(item).stack || 64, prev.count + count);
    else {
      const rec = { item, count: Math.min(itemByKey(item).stack || 64, count) };
      seen.set(item, rec);
      items.push(rec);
    }
  };
  const g = guaranteedLoot({
    structType: c.structType, zone, kind, index: c.index, starter: c.starter,
  });
  for (let i = 0; i < g.length; i++) add(g[i].item, g[i].count);

  if (kind === 'parkur') {
    const pt = Math.max(1, Math.min(5, (c.parkourTier | 0) || tier));
    add('item:yıldız', pt);
  }
  const rolls = kd.rolls[0] + Math.floor(rng.next() * (kd.rolls[1] - kd.rolls[0] + 1));
  const w = rarityWeights(zone, tier, kind);
  for (let r = 0; r < rolls; r++) {
    let cls = rng.weighted(w);
    if (cls < 0) cls = 0;
    let pool = LOOT_TABLE[RARITY_ORDER[cls]].filter((e) => zone >= e.z0 && zone <= e.z1);
    while (pool.length === 0 && cls > 0) {
      cls--;
      pool = LOOT_TABLE[RARITY_ORDER[cls]].filter((e) => zone >= e.z0 && zone <= e.z1);
    }
    if (pool.length === 0) continue;
    const e = pickWeighted(rng, pool);
    add(e.item, rollCount(rng, e, zone));
  }
  // yapıya özgü temalı ekstra çekimler (tema havuzu bölgeye göre süzülür)
  const theme = STRUCT_THEME[c.structType];
  if (theme) {
    const pool = theme.filter((e) => zone >= e.z0 && zone <= e.z1);
    const extra = (kind === 'sandık' || kind === 'kamp') ? 1 : 2;
    for (let i = 0; i < extra && pool.length > 0; i++) {
      const e = pickWeighted(rng, pool);
      add(e.item, rollCount(rng, e, zone));
    }
  }
  if (kind === 'boss') {
    add('item:altın_elma', 2 + zone);
    add('item:şifa_iksiri', 2);
    add('item:büyü_tozu', 6 + zone * 2);
  }
  return items.slice(0, 27);
}

/** Tüm tablo anahtarları (testler doğrulasın diye). */
export function allLootItems() {
  const out = new Set();
  Object.keys(LOOT_TABLE).forEach((k) => LOOT_TABLE[k].forEach((e) => out.add(e.item)));
  Object.keys(STRUCT_THEME).forEach((k) => STRUCT_THEME[k].forEach((e) => out.add(e.item)));
  ['kazma', 'kılıç'].forEach((t) => TIER_KEYS.forEach((k) => out.add('item:' + t + '_' + k)));
  out.add('item:balta_ahşap');
  out.add('item:yıldız');
  return Array.from(out);
}

export const LOOT_KINDS = Object.freeze(Object.keys(KINDS));
