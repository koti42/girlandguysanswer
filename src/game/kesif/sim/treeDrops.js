/*
 * KEŞİF sim — devrilen ağaç ve çürüyen yaprak EŞYA DÜŞÜŞLERİ (saf; rng = () => [0,1) işlevi).
 *
 *   dropBoost(mods) → çarpan                      Servet (fortune) + Yağmacı (luck) + Verimlilik (digMul) etkisi; 1..2,5
 *   leafDrops(leafId, rng, boost, out?) → [{item,count}]   tek yaprağın şans düşüşleri (sopa, fidan, meşede elma)
 *   computeFellDrops(result, rng, {heldKey, mods}) → {items, logs, leaves}   devrilen tüm ağaç (toplanmış yığınlar)
 *   stackify(items, {stack, maxStacks}) → [{item,count}]   eşya varlığı bütçesi için yığınlara böl
 *
 * Kütükler blok kendi düşüşünü (resolveDrops: 'self') verir. Yapraklar: sopa %7 (1–2), fidan %3 (türe özgü; ağaç başına ≤ 3),
 * meşe yaprağı elma %2 — hepsi dropBoost ile büyür. Dönüş her zaman belirlenimcidir (rng akışı sıralı sonuçla tüketilir).
 */
import { BLOCKS, resolveDrops } from './blocks.js';
import { maxStack } from './items.js';
import { TREE_SPECIES, TREE_TUNING, speciesIndexByBlockKey } from './treeData.js';

/** Büyü etkisi (G.mods): Servet +%40/sv, Yağmacı +%50 (luck 0..1), Verimlilik (digMul−1) ×0,5 (en çok +%50). */
export function dropBoost(mods) {
  if (!mods) return 1;
  const fortune = mods.fortune > 0 ? Math.min(3, mods.fortune) : 0;
  const luck = mods.luck > 0 ? Math.min(1, mods.luck) : 0;
  const dig = mods.digMul > 1 ? Math.min(1, mods.digMul - 1) : 0;
  return Math.min(2.5, 1 + 0.4 * fortune + 0.5 * luck + 0.5 * dig);
}

function add(list, item, count) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].item === item) {
      list[i].count += count;
      return;
    }
  }
  list.push({ item, count });
}

function saplingItemFor(leafId) {
  const b = BLOCKS[leafId];
  if (!b) return null;
  const i = speciesIndexByBlockKey(b.key);
  return i < 0 ? null : 'blok:' + TREE_SPECIES[i].key + '_fidanı';
}

/** Tek yaprak. out verilirse birikir. saplingBudget {n}: kalan fidan hakkı (ağaç başına tavan). */
export function leafDrops(leafId, rng, boost, out, saplingBudget) {
  const list = out || [];
  const T = TREE_TUNING;
  const k = boost > 0 ? boost : 1;
  if (rng() < T.stickChance * k) add(list, 'item:sopa', 1 + (rng() < 0.4 ? 1 : 0));
  const sap = saplingItemFor(leafId);
  if (sap && rng() < T.saplingChance * k && (!saplingBudget || saplingBudget.n > 0)) {
    add(list, sap, 1);
    if (saplingBudget) saplingBudget.n--;
  }
  const b = BLOCKS[leafId];
  if (b && b.key === 'meşe_yaprak' && rng() < T.appleChance * k) add(list, 'item:elma', 1);
  return list;
}

export function computeFellDrops(result, rng, opts) {
  const o = opts || {};
  const items = [];
  const boost = dropBoost(o.mods);
  const logs = result.logs;
  for (let i = 0; i < logs.length; i++) {
    const d = resolveDrops(logs[i].id, rng, o.heldKey || null);
    for (let j = 0; j < d.length; j++) add(items, d[j].item, d[j].count);
  }
  const budget = { n: 3 };
  const leaves = result.leaves;
  for (let i = 0; i < leaves.length; i++) leafDrops(leaves[i].id, rng, boost, items, budget);
  return { items, logs: logs.length, leaves: leaves.length };
}

/** Yığınlara böler; toplam yığın sayısı maxStacks'i aşarsa yığın boyu (eşyanın tavanına dek) büyütülür. */
export function stackify(items, opts) {
  const o = opts || {};
  const maxStacks = o.maxStacks > 0 ? o.maxStacks : TREE_TUNING.maxDropStacks;
  let size = o.stack > 0 ? o.stack : TREE_TUNING.dropStack;
  const build = (sz) => {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      const cap = Math.max(1, Math.min(sz, maxStack(items[i].item) || sz));
      let left = items[i].count;
      while (left > 0) {
        const n = Math.min(cap, left);
        out.push({ item: items[i].item, count: n });
        left -= n;
      }
    }
    return out;
  };
  let out = build(size);
  while (out.length > maxStacks && size < 64) {
    size *= 2;
    out = build(size);
  }
  return out;
}
