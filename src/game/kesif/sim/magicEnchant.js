/*
 * KEŞİF sim — BÜYÜ: büyüleme (enchant) mantığı. Saf; Math.random/Date.now yok (tohumlu rng).
 *
 * Eşya yığınları `ench: {anahtar: seviye}` taşır (yalnız dayanıklılığı olan = yığılmayan eşyalar büyülenebilir).
 *   enchantClassOf(itemKey) → 'kazma'|'balta'|'kürek'|'kılıç'|'yay'|'kafa'|'göğüs'|'bacak'|'ayak'|'kalkan'|'asa'|null
 *   sanitizeEnch(raw, itemKey?) → {anahtar:seviye} | null          beyaz liste + seviye kısma + çakışma + __proto__ reddi
 *   mergeEnchants(base, add, itemKey) → ench | null
 *   shelfTier(n) → 1..5      countShelves(getBlock, x, y, z) → 0..N
 *   magicOffers(enchantSeed, itemKey, shelfCount, existing?) → [{id,label,tier,tierName,enchants,costDust,costShard,index}]
 *   applyEnchantOffer(state, inv, target, optionId, shelfCount) → {ok, reason?, message?, offer?, ench?, event?}
 *   rerollEnchant(state, inv) → {ok, reason?, message?, cost}
 *   describeEnchant(key, level) → {key,level,name,text}      magicDescribe(slotOrKey) → string[]
 * Belirlenimci: aynı (enchantSeed, eşya, kitaplık sayısı, mevcut büyüler) → aynı 3 teklif.
 */
import { itemByKey } from './items.js';
import { hash2, hash3, hash32, seededRandom, stringSeedToInt, toSeedInt } from './rng.js';
import {
  ENCHANT_LIST, FULL_SHELF_COUNT, FULL_SHELF_DISCOUNT, ITEM_DUST, ITEM_SHARD, MAX_ENCH_PER_ITEM, MAX_SHELF_TIER, OFFER_COST,
  REROLL_DUST, SHELF_BLOCK_ID, SHELF_RADIUS, enchantDef, levelCapForTier, roman, spellDef, spellForStaff, effectDef,
  CLASS_NAMES, MANA,
} from './magicData.js';

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/* ------------------------------------------------------------------------------------------------
 * Sınıflandırma ve doğrulama
 * ---------------------------------------------------------------------------------------------- */
const classCache = new Map();

/** Eşya anahtarı → büyüleme sınıfı | null (bilinmeyen/büyülenemez). */
export function enchantClassOf(itemKey) {
  if (typeof itemKey !== 'string') return null;
  let c = classCache.get(itemKey);
  if (c !== undefined) return c;
  c = null;
  const it = itemByKey(itemKey);
  if (it && it.durability) {
    if (it.magic && it.magic.staff) c = 'asa';
    else if (it.key === 'item:yay') c = 'yay';
    else if (it.key === 'item:kalkan') c = 'kalkan';
    else if (it.armor) c = it.armor.slot;
    else if (it.tool && (it.tool.type === 'kazma' || it.tool.type === 'balta' || it.tool.type === 'kürek' || it.tool.type === 'kılıç')) {
      c = it.tool.type;
    }
  }
  classCache.set(itemKey, c);
  return c;
}
export function isEnchantable(itemKey) {
  return enchantClassOf(itemKey) !== null;
}

/** Anahtar bu sınıfa uygulanabilir mi? */
export function enchantFits(key, cls) {
  const d = enchantDef(key);
  return !!d && d.targets.indexOf(cls) >= 0;
}

/**
 * Ham büyü nesnesini temizler. itemKey verilirse eşyaya uymayanlar atılır (verilmezse yalnız anahtar/seviye süzülür).
 * Çıktı ENCHANT_LIST sırasındadır (kararlı JSON). Boşsa null.
 */
export function sanitizeEnch(raw, itemKey) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let cls = null;
  if (itemKey !== undefined && itemKey !== null) {
    cls = enchantClassOf(itemKey);
    if (!cls) return null;
  }
  const out = {};
  let n = 0;
  for (let i = 0; i < ENCHANT_LIST.length && n < MAX_ENCH_PER_ITEM; i++) {
    const d = ENCHANT_LIST[i];
    if (!hasOwn(raw, d.key)) continue;
    const v = raw[d.key];
    if (typeof v !== 'number' && typeof v !== 'string') continue;
    const lvl = Math.floor(Number(v));
    if (!(lvl >= 1)) continue;
    if (cls && d.targets.indexOf(cls) < 0) continue;
    let clash = false;
    for (let c = 0; c < d.conflicts.length; c++) if (hasOwn(out, d.conflicts[c])) clash = true;
    if (clash) continue;
    out[d.key] = Math.min(lvl, d.max);
    n++;
  }
  return n > 0 ? out : null;
}

export function cloneEnch(e) {
  if (!e) return undefined;
  const out = {};
  const ks = Object.keys(e);
  for (let i = 0; i < ks.length; i++) out[ks[i]] = e[ks[i]];
  return out;
}

export function enchLevel(ench, key) {
  return ench && hasOwn(ench, key) ? ench[key] | 0 : 0;
}

/** base'e add'i ekler: çakışanlar atlanır, aynı büyüde yüksek seviye kazanır. Sonuç temizlenmiş ench | null. */
export function mergeEnchants(base, add, itemKey) {
  const merged = {};
  const b = sanitizeEnch(base, itemKey) || {};
  const a = sanitizeEnch(add, itemKey) || {};
  Object.keys(b).forEach((k) => { merged[k] = b[k]; });
  for (let i = 0; i < ENCHANT_LIST.length; i++) {
    const d = ENCHANT_LIST[i];
    if (!hasOwn(a, d.key)) continue;
    let clash = false;
    for (let c = 0; c < d.conflicts.length; c++) if (hasOwn(merged, d.conflicts[c])) clash = true;
    if (clash) continue;
    merged[d.key] = Math.max(merged[d.key] || 0, a[d.key]);
  }
  return sanitizeEnch(merged, itemKey);
}

/* ------------------------------------------------------------------------------------------------
 * Kitaplık kademesi
 * ---------------------------------------------------------------------------------------------- */
/** 0–5 kitaplık → kademe I–V (kitaplık sayısı + 1, en çok V). */
export function shelfTier(shelfCount) {
  const n = Math.floor(Number(shelfCount));
  const s = Number.isFinite(n) && n > 0 ? n : 0;
  return Math.min(MAX_SHELF_TIER, s + 1);
}

/**
 * Masanın (x,y,z) çevresindeki kitaplıkları sayar: x/z'de ±4, y'de −1..+2. getBlock(x,y,z) → blok kimliği (null olabilir).
 * Masanın kendisi sayılmaz.
 */
export function countShelves(getBlock, x, y, z, radius) {
  const r = radius === undefined ? SHELF_RADIUS : radius;
  let n = 0;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        if (getBlock(x + dx, y + dy, z + dz) === SHELF_BLOCK_ID) n++;
      }
    }
  }
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Teklifler
 * ---------------------------------------------------------------------------------------------- */
/** k. teklifin (0..2) kademesi: 1/3, 2/3, tam kitaplık kademesi. */
export function offerTier(maxTier, k) {
  return Math.max(1, Math.min(maxTier, Math.round((maxTier * (k + 1)) / 3)));
}

function candidates(cls, tier, have) {
  const out = [];
  for (let i = 0; i < ENCHANT_LIST.length; i++) {
    const d = ENCHANT_LIST[i];
    if (d.targets.indexOf(cls) < 0) continue;
    let clash = false;
    for (let c = 0; c < d.conflicts.length; c++) if (hasOwn(have, d.conflicts[c])) clash = true;
    if (clash) continue;
    const cap = levelCapForTier(d, tier);
    const cur = have[d.key] || 0;
    if (cap < 1 || cur >= cap) continue;
    out.push({ def: d, cap, cur });
  }
  return out;
}

function pickWeighted(rng, list) {
  let total = 0;
  for (let i = 0; i < list.length; i++) total += list[i].def.weight;
  let r = rng.next() * total;
  for (let i = 0; i < list.length; i++) {
    r -= list[i].def.weight;
    if (r < 0) return i;
  }
  return list.length - 1;
}

function labelOf(ench) {
  const parts = [];
  for (let i = 0; i < ENCHANT_LIST.length; i++) {
    const d = ENCHANT_LIST[i];
    if (hasOwn(ench, d.key)) parts.push(d.max > 1 ? d.name + ' ' + roman(ench[d.key]) : d.name);
  }
  return parts.join(' + ');
}

/**
 * Üç büyü teklifi. existing: eşyanın mevcut büyüleri (yinelenmesin, çakışmasın, yükseltilebilsin).
 * Uygun büyü kalmadıysa boş dizi; bazı seçenekler aday bulamazsa daha az teklif dönebilir.
 */
export function magicOffers(enchantSeed, itemKey, shelfCount, existing) {
  const cls = enchantClassOf(itemKey);
  if (!cls) return [];
  const have = sanitizeEnch(existing, itemKey) || {};
  const maxTier = shelfTier(shelfCount);
  const seed = toSeedInt(enchantSeed);
  const itemHash = stringSeedToInt(itemKey);
  const out = [];
  for (let k = 0; k < 3; k++) {
    const tier = offerTier(maxTier, k);
    const salt = hash3(seed, itemHash, (maxTier << 4) | k, 0x6d61676b);
    const rng = seededRandom(salt);
    const pool = candidates(cls, tier, have);
    if (pool.length === 0) continue;
    let count = 1;
    if (tier >= 3 && rng.next() < 0.5) count++;
    if (tier >= 5 && rng.next() < 0.4) count++;
    const picked = {};
    let n = 0;
    const room = MAX_ENCH_PER_ITEM - Object.keys(have).length;
    while (n < count && n < room && pool.length > 0) {
      const idx = pickWeighted(rng, pool);
      const c = pool.splice(idx, 1)[0];
      let level = c.cap;
      if (level > c.cur + 1 && rng.next() < 0.3) level -= 1;
      picked[c.def.key] = level;
      n++;
      // çakışanları havuzdan çıkar
      for (let i = pool.length - 1; i >= 0; i--) {
        if (c.def.conflicts.indexOf(pool[i].def.key) >= 0) pool.splice(i, 1);
      }
    }
    if (n === 0) continue;
    const ench = sanitizeEnch(picked, itemKey);
    if (!ench) continue;
    let dust = OFFER_COST.dust[tier - 1] + OFFER_COST.extraDustPerEnchant * (n - 1);
    if (Math.floor(Number(shelfCount)) >= FULL_SHELF_COUNT) dust = Math.ceil(dust * (1 - FULL_SHELF_DISCOUNT));
    out.push({
      id: 'o' + (k + 1) + '_' + hash2(salt, tier, 0x1d).toString(36),
      index: k,
      tier,
      tierName: roman(tier),
      label: labelOf(ench),
      enchants: ench,
      costDust: dust,
      costShard: OFFER_COST.shard[tier - 1],
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Uygulama ve yeniden çekme
 * ---------------------------------------------------------------------------------------------- */
const MESSAGES = Object.freeze({
  esya_yok: 'Büyülenecek eşya seçilmedi.',
  uygun_degil: 'Bu eşya büyülenemez.',
  secenek_yok: 'Bu teklif artık geçerli değil.',
  toz: 'Yeterli Büyü Tozun yok.',
  kiymik: 'Yeterli Kuantum Kıymığın yok.',
  degisim_yok: 'Bu büyü eşyaya bir şey katmıyor.',
});

function fail(reason) {
  return { ok: false, reason, message: MESSAGES[reason] || 'Büyü yapılamadı.' };
}

/** Oyuncunun tohumunu döndürür (belirlenimci). */
export function rotateSeed(seed, salt) {
  return hash32((toSeedInt(seed) ^ 0x9e3779b9) + Math.imul((salt | 0) + 1, 0x85ebca6b)) >>> 0;
}

function resolveSlot(inv, target) {
  if (typeof inv.slotByAddr === 'function') return inv.slotByAddr(target);
  const i = typeof target === 'number' ? target : Number(target);
  return Number.isInteger(i) && inv.slots[i] ? inv.slots[i] : null;
}

/**
 * Teklifi uygular: maliyet çıkar, eşyaya ench yaz, enchantSeed'i döndür. state: MagicState (enchantSeed, enchantCount).
 * target: yuva indeksi | 's12' | 'a0' | {zone:'slots'|'armor', index}.
 */
export function applyEnchantOffer(state, inv, target, optionId, shelfCount) {
  const slot = resolveSlot(inv, target);
  if (!slot) return fail('esya_yok');
  if (!isEnchantable(slot.item)) return fail('uygun_degil');
  const offers = magicOffers(state.enchantSeed, slot.item, shelfCount, slot.ench);
  let offer = null;
  for (let i = 0; i < offers.length; i++) if (offers[i].id === optionId) offer = offers[i];
  if (!offer) return fail('secenek_yok');
  if (!inv.infinite) {
    if (inv.count(ITEM_DUST) < offer.costDust) return fail('toz');
    if (offer.costShard > 0 && inv.count(ITEM_SHARD) < offer.costShard) return fail('kiymik');
  }
  const merged = mergeEnchants(slot.ench, offer.enchants, slot.item);
  if (!merged || JSON.stringify(merged) === JSON.stringify(sanitizeEnch(slot.ench, slot.item) || {})) return fail('degisim_yok');
  if (!inv.infinite) {
    inv.remove(ITEM_DUST, offer.costDust);
    if (offer.costShard > 0) inv.remove(ITEM_SHARD, offer.costShard);
  }
  if (typeof inv.setEnchant === 'function') inv.setEnchant(target, merged);
  else slot.ench = merged;
  state.enchantSeed = rotateSeed(state.enchantSeed, hash2(offer.index, offer.tier, 0x51));
  state.enchantCount = (state.enchantCount | 0) + 1;
  return {
    ok: true,
    offer,
    ench: cloneEnch(merged),
    event: {
      type: 'enchanted', item: slot.item, enchants: cloneEnch(merged), added: cloneEnch(offer.enchants), tier: offer.tier,
      costDust: offer.costDust, costShard: offer.costShard,
    },
  };
}

/** 1 Büyü Tozu karşılığında teklifleri yeniden çek (enchantSeed döner). */
export function rerollEnchant(state, inv) {
  if (!inv.infinite && inv.count(ITEM_DUST) < REROLL_DUST) return Object.assign(fail('toz'), { cost: REROLL_DUST });
  if (!inv.infinite) inv.remove(ITEM_DUST, REROLL_DUST);
  state.enchantSeed = rotateSeed(state.enchantSeed, 0x7e11011 + (state.rerolls | 0));
  state.rerolls = (state.rerolls | 0) + 1;
  return { ok: true, cost: REROLL_DUST };
}

/* ------------------------------------------------------------------------------------------------
 * İpuçları
 * ---------------------------------------------------------------------------------------------- */
export function describeEnchant(key, level) {
  const d = enchantDef(key);
  if (!d) return null;
  const l = Math.max(1, Math.min(d.max, Math.floor(Number(level)) || 1));
  return { key: d.key, level: l, name: d.max > 1 ? d.name + ' ' + roman(l) : d.name, text: d.text(l) };
}

function effectLine(p) {
  if (p.heal) return 'Anında ' + p.heal + ' can iyileştirir.';
  if (p.mana) return 'Anında ' + p.mana + ' mana yeniler.';
  const e = effectDef(p.effect);
  return e ? e.name + (p.level > 1 ? ' ' + roman(p.level) : '') + ' — ' + formatSeconds(p.seconds) : '';
}

export function formatSeconds(s) {
  const n = Math.max(0, Math.round(s));
  const m = Math.floor(n / 60);
  const r = n % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/**
 * Eşya ipucu satırları (Türkçe). Girdi: yuva {item, ench?} ya da eşya anahtarı. Büyüsüz sıradan eşya için [] döner.
 */
export function magicDescribe(slotOrKey) {
  const key = typeof slotOrKey === 'string' ? slotOrKey : slotOrKey && slotOrKey.item;
  const ench = typeof slotOrKey === 'string' ? null : slotOrKey && slotOrKey.ench;
  const it = itemByKey(key);
  const lines = [];
  if (!it) return lines;
  const clean = ench ? sanitizeEnch(ench, it.key) : null;
  if (clean) {
    for (let i = 0; i < ENCHANT_LIST.length; i++) {
      const d = ENCHANT_LIST[i];
      if (!hasOwn(clean, d.key)) continue;
      const e = describeEnchant(d.key, clean[d.key]);
      lines.push(e.name + ' — ' + e.text);
    }
  }
  if (it.magic && it.magic.staff) {
    const sp = spellDef(it.magic.spell || spellForStaff(it.key));
    if (sp) {
      lines.unshift(sp.name + ' — ' + sp.manaCost + ' mana, ' + sp.cooldown + ' sn bekleme');
    }
  } else if (it.magic && it.magic.manaCrystal) {
    lines.push('Azami mana +' + MANA.crystalGain + ' (en çok +' + MANA.crystalMaxBonus + ')');
  } else if (it.potion) {
    const l = effectLine(it.potion);
    if (l) lines.push(l);
  }
  return lines;
}

export function classLabel(cls) {
  return CLASS_NAMES[cls] || '';
}

export { labelOf as enchantLabel };
