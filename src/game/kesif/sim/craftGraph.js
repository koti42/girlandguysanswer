/*
 * KEŞİF sim — edinilebilirlik grafiği (saf; test ve "nereden bulunur" ipuçları için).
 *
 * "Ham" kaynaklar: doğal bloklardan düşenler (dünya üretiminde bulunan bloklar), yaratık/boss ganimeti, sandık ganimet
 * tabloları, bulmaca/yapı ödülleri. Tarif çıktıları, TÜM girdileri edinilebilirse ve istasyon bloğu (varsa) edinilebilirse
 * edinilebilir olur; ocak tarifleri için yakıt da gerekir. Bir kapanış (fixed-point) hesabıyla her eşya için bir yol bulunur.
 *
 *   NATURAL_BLOCK_KEYS             dünya üretiminde görülen bloklar (worldgen örneklemesiyle test edilir)
 *   SPECIAL_ITEMS                  yapı/bulmaca/boss ödülü olarak verilen (tarifsiz) eşyalar
 *   CREATIVE_ONLY                  bilerek edinilemeyen eşyalar (silk-touch gerektiren cevher blokları, sıvı kaynakları…)
 *   rawSources() → Map<eşya, string[]>
 *   stationItem(station) → 'blok:…' | null
 *   obtainability() → { via: Map<eşya, {how, recipe?, depth}>, unobtainable: [eşya] }
 *   recipeDepth(id) → tarifin oyun içi derinliği (basit tarifler küçük; Üret listesi sıralaması)
 *   deadRecipes() → girdisi/istasyonu edinilemediği için yapılamayan tarif kimlikleri
 *   recipeOrphans() → tarifi olmayan ama edinilebilir olması beklenen yapı/dekor eşyaları
 *   findProfitLoops() → kârlı tek-girdili dönüşüm döngüleri [{path, gain}]
 */
import { blockByKey } from './blocks.js';
import {
  FUEL_HEAT, ITEM_LIST, RECIPES, STATION_BLOCKS, blockItemKey,
} from './items.js';
import { MOB_TYPES } from './mobTypes.js';
import { allLootItems } from './loot.js';
import { BREW_RECIPES } from './magicRecipes.js';
import { BIOME_NATURAL_KEYS } from './biomeData.js';

/** Dünya üretiminde (arazi/ağaç/cevher/bitki) bulunan bloklar. Test, worldgen örneklemesiyle doğrular. */
export const NATURAL_BLOCK_KEYS = Object.freeze([
  'taş', 'toprak', 'çimen', 'çim_kar', 'kum', 'kızıl_kum', 'çakıl', 'kar', 'buz', 'kil', 'kumtaşı', 'bazalt', 'kristal_kaya',
  'çamur', 'kaygan_buz', 'kanyon_taşı', 'kömür_cevheri', 'bakır_cevheri', 'demir_cevheri', 'altın_cevheri', 'elmas_cevheri',
  'kuantum_kristali', 'kızıltaş_cevheri', 'zümrüt_cevheri', 'ametist_kümesi',
  'meşe_kütük', 'huş_kütük', 'çam_kütük', 'akasya_kütük',
  'meşe_yaprak', 'huş_yaprak', 'çam_yaprak', 'akasya_yaprak',
  'gelincik', 'sarı_çiçek', 'uzun_ot', 'çalı', 'kaktüs', 'ışıklı_mantar', 'yosun', 'sarmaşık',
].concat(BIOME_NATURAL_KEYS)); // biyom genişletmesi: sonbahar/kiraz/cangıl/mangrov ağaçları, bambu, mercan, çiçekler, mağara blokları

/** Tarifsiz ama oyunda verilen eşyalar: anahtarlar (tapınak/boss), yetenek eşyaları (boss/bulmaca), parkur ödülü. */
export const SPECIAL_ITEMS = Object.freeze([
  'item:anahtar_kristali_z0', 'item:anahtar_kristali_z1', 'item:anahtar_kristali_z2', 'item:anahtar_kristali_z3',
  'item:anahtar_kristali_z4', 'item:küçük_anahtar', 'item:boss_anahtarı',
  'item:çift_zıplama_botları', 'item:kanca', 'item:planör', 'item:portal_tabancası',
  'item:yıldız',
  'item:kart_gri', 'item:kart_turuncu', 'item:kart_mor', // Neon Meridyen kilit ödülleri (locks_hack)
]);

/**
 * Bilerek edinilemeyen (ya da yalnız silk-touch ile): cevher blokları (kırınca madde düşer), çimenli bloklar (toprak düşer),
 * sıvı kaynakları (yalnız yaratıcı mod). Test bu listeyi dar tutar.
 */
export const CREATIVE_ONLY = Object.freeze([
  'blok:çimen', 'blok:çim_kar', 'blok:su', 'blok:lav',
  'blok:kömür_cevheri', 'blok:bakır_cevheri', 'blok:demir_cevheri', 'blok:altın_cevheri', 'blok:elmas_cevheri',
  'blok:kuantum_kristali', 'blok:kızıltaş_cevheri', 'blok:zümrüt_cevheri',
]);

function addSource(map, item, how) {
  const arr = map.get(item);
  if (arr) {
    if (arr.indexOf(how) < 0) arr.push(how);
  } else {
    map.set(item, [how]);
  }
}

/** Ham kaynaklar: eşya → ['blok:taş', 'yaratık:koyun', 'sandık', 'ödül'] */
export function rawSources() {
  const map = new Map();
  NATURAL_BLOCK_KEYS.forEach((key) => {
    const b = blockByKey(key);
    if (!b) return;
    if (b.drops === 'self') {
      addSource(map, 'blok:' + b.key, 'blok:' + b.key);
    } else if (Array.isArray(b.drops)) {
      b.drops.forEach((d) => addSource(map, d.item, 'blok:' + b.key));
    }
  });
  Object.keys(MOB_TYPES).forEach((k) => {
    ((MOB_TYPES[k] && MOB_TYPES[k].drops) || []).forEach((d) => addSource(map, d.item, 'yaratık:' + k));
  });
  allLootItems().forEach((k) => addSource(map, k, 'sandık'));
  SPECIAL_ITEMS.forEach((k) => addSource(map, k, 'ödül'));
  return map;
}

/** İstasyon adı → o istasyonu sağlayan blok eşyası (el için null). */
export function stationItem(station) {
  if (station === 'el') return null;
  const ids = STATION_BLOCKS[station];
  if (!ids || !ids.length) return undefined;
  return blockItemKey(ids[0]);
}

const FUEL_KEYS = Object.keys(FUEL_HEAT);

/** Tüm tarifler (üretim + simya kazanı) tek biçimde: {id, out, in:[item], station, heat}. */
function allRecipes() {
  const list = RECIPES.map((r) => ({
    id: r.id, out: r.out.item, in: r.in.map((p) => p.item), station: r.station, heat: !!r.heat,
  }));
  BREW_RECIPES.forEach((r) => {
    list.push({
      id: 'kazan:' + r.id, out: r.out, in: r.in.map((p) => p.item), station: 'kazan', heat: false,
    });
  });
  return list;
}

/**
 * Kapanış: her eşya için {how:'ham'|'tarif', from, recipe?, depth}. Edinilemeyenler ayrıca listelenir
 * (CREATIVE_ONLY hariç tutulmaz; çağıran süzer).
 */
export function obtainability() {
  const raw = rawSources();
  const via = new Map();
  raw.forEach((hows, item) => via.set(item, { how: 'ham', from: hows[0], depth: 0 }));
  const recipes = allRecipes();
  const stationOf = (s) => {
    if (s === 'el') return null;
    if (s === 'kazan') return 'blok:simya_kazanı';
    return stationItem(s);
  };
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let i = 0; i < recipes.length; i++) {
      const r = recipes[i];
      if (via.has(r.out)) continue;
      let depth = 0;
      let ok = true;
      for (let k = 0; k < r.in.length && ok; k++) {
        const v = via.get(r.in[k]);
        if (!v) ok = false;
        else depth = Math.max(depth, v.depth);
      }
      if (!ok) continue;
      const st = stationOf(r.station);
      if (st === undefined) continue;
      if (st) {
        const v = via.get(st);
        if (!v) continue;
        depth = Math.max(depth, v.depth);
      }
      if (r.heat && !FUEL_KEYS.some((f) => via.has(f))) continue;
      via.set(r.out, { how: 'tarif', recipe: r.id, depth: depth + 1 });
      changed = true;
    }
  }
  const unobtainable = ITEM_LIST.filter((it) => !via.has(it.key)).map((it) => it.key);
  return { via, unobtainable };
}

let depthCache = null;
/** Tarif kimliği → o tarifin "oyun içi derinliği" (girdi/istasyon derinliklerinin en büyüğü + 1; bilinmeyen: 99). Sıralama için. */
export function recipeDepth(id) {
  if (!depthCache) {
    const { via } = obtainability();
    depthCache = new Map();
    RECIPES.forEach((r) => {
      let d = 0;
      r.in.forEach((p) => {
        const v = via.get(p.item);
        d = Math.max(d, v ? v.depth : 98);
      });
      if (r.station !== 'el') {
        const st = stationItem(r.station);
        const v = st ? via.get(st) : null;
        d = Math.max(d, v ? v.depth : 98);
      }
      depthCache.set(r.id, d + 1);
    });
  }
  return depthCache.has(id) ? depthCache.get(id) : 99;
}

/** Girdilerinden ya da istasyonundan biri edinilemediği için hiç yapılamayan tarifler (kimlik listesi). */
export function deadRecipes() {
  const { via } = obtainability();
  const dead = [];
  allRecipes().forEach((r) => {
    const st = r.station === 'el' ? null : r.station === 'kazan' ? 'blok:simya_kazanı' : stationItem(r.station);
    const missing = r.in.some((k) => !via.has(k)) || (st === undefined) || (st && !via.has(st));
    if (missing || (r.heat && !FUEL_KEYS.some((f) => via.has(f)))) dead.push(r.id);
  });
  return dead;
}

/**
 * Edinilebilir olması beklenen (CREATIVE_ONLY dışı) yapı/dekor blok eşyalarından hiç tarifi ve ham kaynağı olmayanlar.
 */
export function recipeOrphans() {
  const raw = rawSources();
  const produced = new Set(RECIPES.map((r) => r.out.item));
  return ITEM_LIST.filter((it) => it.kind === 'blok' && CREATIVE_ONLY.indexOf(it.key) < 0 && !produced.has(it.key) && !raw.has(it.key))
    .map((it) => it.key);
}

/**
 * Tek girdili dönüşümlerde (A→B oranı) kârlı döngü ara: oranların çarpımı > 1 olan döngü bedava eşya demektir.
 * Floyd–Warshall (log oranları); döngü yoksa [] döner.
 */
export function findProfitLoops() {
  const items = [];
  const idx = new Map();
  const id = (k) => {
    if (!idx.has(k)) {
      idx.set(k, items.length);
      items.push(k);
    }
    return idx.get(k);
  };
  const edges = [];
  RECIPES.forEach((r) => {
    if (r.in.length !== 1) return;
    edges.push([id(r.in[0].item), id(r.out.item), Math.log(r.out.count / r.in[0].count), r.id]);
  });
  const n = items.length;
  const d = [];
  for (let i = 0; i < n; i++) d.push(new Float64Array(n).fill(-Infinity));
  edges.forEach((e) => {
    if (e[2] > d[e[0]][e[1]]) d[e[0]][e[1]] = e[2];
  });
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (d[i][k] === -Infinity) continue;
      for (let j = 0; j < n; j++) {
        const v = d[i][k] + d[k][j];
        if (v > d[i][j]) d[i][j] = v;
      }
    }
  }
  const bad = [];
  for (let i = 0; i < n; i++) if (d[i][i] > 1e-9) bad.push({ item: items[i], gain: Math.exp(d[i][i]) });
  return bad;
}

/** Test/teşhis: dünya üretiminde beklenen blok kimlikleri. */
export function naturalBlockIds() {
  return NATURAL_BLOCK_KEYS.map((k) => blockByKey(k)).filter(Boolean).map((b) => b.id);
}

