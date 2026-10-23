/*
 * KEŞİF paneller — saf yardımcılar (DOM/React yok; node'da test edilir).
 *
 * Adresler: 's12' (çanta/hotbar yuvası), 'a0' (zırh), 'c5' (sandık). 'slotN'/'armorN'/'chestN' de okunur.
 * Burada: adres ayrıştırma, eşya ipucu (tooltip) modeli, nadirlik renkleri, hızlı taşıma planı,
 * tarif görünümü/süzme/azami adet, ocak yakıt durumu, nereden bulunur ipuçları, inşa paleti süzme.
 */
import {
  ARMOR_SLOTS, FUEL_HEAT, SMELT_HEAT, itemByKey, recipesProducing,
} from '../../../game/kesif/sim/items.js';
import { BLOCKS, BUILD_GROUPS } from '../../../game/kesif/sim/blocks.js';
import { BUILDABLE_MAX, foldTr } from '../../../game/kesif/sim/constants.js';
import { enchantList, enchantNames, magicLinesOf } from './panelMagicUtils.js';
import { maxCharge, techDescribe } from '../../../game/kesif/sim/techCharge.js';

export const INV_SIZE = 36;
export const HOTBAR_SIZE = 9;
export const ARMOR_COUNT = 4;
export const CHEST_SIZE = 27;

/* ------------------------------------------------------------------------------------------------
 * Nadirlik, tür ve sayı biçimleri
 * ---------------------------------------------------------------------------------------------- */
/** Koyu zeminde okunur renkler (WCAG ≥ 4.5:1 #12162b üzerinde). */
export const RARITY_COLORS = Object.freeze({
  yaygın: '#d5dae6',
  seyrek: '#6fd0ff',
  nadir: '#c58bff',
  efsanevi: '#ffc247',
});
export const RARITY_LABELS = Object.freeze({
  yaygın: 'Yaygın',
  seyrek: 'Seyrek',
  nadir: 'Nadir',
  efsanevi: 'Efsanevi',
});
export const KIND_LABELS = Object.freeze({
  blok: 'Blok',
  alet: 'Alet',
  silah: 'Silah',
  yiyecek: 'Yiyecek',
  malzeme: 'Malzeme',
  zırh: 'Zırh',
  özel: 'Özel eşya',
  anahtar: 'Anahtar',
  cephane: 'Cephane',
});
export const STATION_LABELS = Object.freeze({
  el: 'El', tezgah: 'Tezgah', ocak: 'Ocak', örs: 'Örs', kesici: 'Taş Kesici', dokuma: 'Dokuma Tezgahı', laboratuvar: 'Laboratuvar',
});
export const ARMOR_SLOT_LABELS = Object.freeze(['Kafa', 'Göğüs', 'Bacak', 'Ayak']);

export function rarityColor(r) {
  return RARITY_COLORS[r] || RARITY_COLORS.yaygın;
}
export function rarityLabel(r) {
  return RARITY_LABELS[r] || RARITY_LABELS.yaygın;
}

/** 5.5 → '5,5'; 6 → '6' (Türkçe ondalık, en çok 1 basamak). */
export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 10) / 10;
  return String(r).replace('.', ',');
}

/** Eşya adı (bilinmiyorsa anahtarın kendisi). */
export function itemName(key) {
  const it = itemByKey(key);
  return it ? it.name : String(key || '');
}

/** 0xRRGGBB sayısı → '#rrggbb'. */
export function hexColor(n) {
  const v = Number.isFinite(n) ? (n >>> 0) & 0xffffff : 0xcccccc;
  return '#' + v.toString(16).padStart(6, '0');
}

/* ------------------------------------------------------------------------------------------------
 * Adresler
 * ---------------------------------------------------------------------------------------------- */
const ADDR_KINDS = { s: 's', slot: 's', a: 'a', armor: 'a', c: 'c', chest: 'c' };
/** 's12' → {kind:'s', index:12}; geçersizse null. */
export function parseAddr(addr) {
  if (typeof addr !== 'string') return null;
  const m = /^(slot|armor|chest|s|a|c)(\d{1,3})$/.exec(addr);
  if (!m) return null;
  return { kind: ADDR_KINDS[m[1]], index: Number(m[2]) };
}
export function makeAddr(kind, index) {
  return ADDR_KINDS[kind] + Math.max(0, Math.floor(index));
}
export function isHotbarAddr(addr) {
  const p = parseAddr(addr);
  return !!p && p.kind === 's' && p.index < HOTBAR_SIZE;
}
export function sameAddr(a, b) {
  const p = parseAddr(a);
  const q = parseAddr(b);
  return !!p && !!q && p.kind === q.kind && p.index === q.index;
}

/** Adres → yuva görünümü ({item,count,dur}|null). inv: getInventorySnapshot(), chest: getChest() | null. */
export function slotAtAddr(addr, inv, chest) {
  const p = parseAddr(addr);
  if (!p) return null;
  let arr = null;
  if (p.kind === 's') arr = inv && inv.slots;
  else if (p.kind === 'a') arr = inv && inv.armor;
  else arr = chest && chest.slots;
  const s = arr && arr[p.index];
  return s && s.item && s.count > 0 ? s : null;
}

/** Yuva ekran okuyucu etiketi: 'Hızlı çubuk 3: Taş ×12'. */
export function slotAriaLabel(addr, slot) {
  const p = parseAddr(addr);
  if (!p) return 'Yuva';
  let where;
  if (p.kind === 'a') where = (ARMOR_SLOT_LABELS[p.index] || 'Zırh') + ' zırhı';
  else if (p.kind === 'c') where = 'Sandık yuvası ' + (p.index + 1);
  else if (p.index < HOTBAR_SIZE) where = 'Hızlı çubuk ' + (p.index + 1);
  else where = 'Çanta yuvası ' + (p.index - HOTBAR_SIZE + 1);
  if (!slot || !slot.item) return where + ': boş';
  const it = itemByKey(slot.item);
  const name = it ? it.name : slot.item;
  let txt = where + ': ' + name;
  if (slot.count > 1) txt += ' ×' + slot.count;
  const max = it && it.durability ? it.durability : 0;
  if (max && slot.dur != null) txt += ', dayanıklılık ' + slot.dur + '/' + max;
  const chg = chargeInfo(slot);
  if (chg) txt += ', şarj yüzde ' + chg.pct;
  if (slot.ench) txt += ', büyülü: ' + enchantNames(slot.ench);
  return txt;
}

/* ------------------------------------------------------------------------------------------------
 * Eşya ipucu (tooltip) modeli
 * ---------------------------------------------------------------------------------------------- */
export function durabilityInfo(slot) {
  if (!slot) return null;
  const it = itemByKey(slot.item);
  const max = it && it.durability ? it.durability : 0;
  if (!max) return null;
  const cur = slot.dur == null ? max : Math.max(0, Math.min(max, slot.dur));
  const pct = Math.round((cur / max) * 100);
  return { cur, max, pct, level: pct <= 15 ? 'crit' : pct <= 40 ? 'low' : 'ok' };
}

/** Teknoloji şarjı (jetpack yakıtı, alet/zırh/tarayıcı şarjı, portal sayısı): {cur,max,pct,level,unit} | null (şarjsız eşya ya da şarj bilinmiyor). */
export function chargeInfo(slot) {
  if (!slot) return null;
  const max = maxCharge(slot.item);
  if (!(max > 0) || slot.charge === undefined || slot.charge === null) return null;
  const cur = Math.max(0, Math.min(max, Number(slot.charge) || 0));
  const pct = Math.round((cur / max) * 100);
  return { cur, max, pct, level: pct <= 10 ? 'crit' : pct <= 30 ? 'low' : 'ok' };
}

/** Yuva → {name,desc,rarity,rarityLabel,color,kindLabel,count,lines:[{label,value}],durability}|null. */
export function tooltipModel(slot) {
  if (!slot || !slot.item) return null;
  const it = itemByKey(slot.item);
  if (!it) {
    return {
      key: slot.item, name: String(slot.item), desc: '', rarity: 'yaygın', rarityLabel: rarityLabel('yaygın'),
      color: rarityColor('yaygın'), kind: 'malzeme', kindLabel: KIND_LABELS.malzeme, count: slot.count || 1, lines: [], durability: null,
      enchants: [], enchanted: false, magicLines: [], charge: null, techLines: [],
    };
  }
  const lines = [];
  if (it.weapon) {
    lines.push({ label: 'Hasar', value: fmtNum(it.weapon.damage) });
    lines.push({ label: 'Menzil', value: fmtNum(it.weapon.reach) + ' blok' });
    lines.push({ label: 'Saldırı aralığı', value: fmtNum(it.weapon.cooldown) + ' sn' });
    if (it.weapon.ammo) lines.push({ label: 'Cephane', value: itemName(it.weapon.ammo) });
  }
  if (it.tool) {
    lines.push({ label: 'Kazma hızı', value: '×' + fmtNum(it.tool.speed) });
    lines.push({ label: 'Hasat seviyesi', value: String(it.tool.tier) });
  }
  if (it.armor) {
    lines.push({ label: 'Savunma', value: '+' + it.armor.defense });
    const si = ARMOR_SLOTS.indexOf(it.armor.slot);
    lines.push({ label: 'Takılır', value: ARMOR_SLOT_LABELS[si] || it.armor.slot });
  }
  if (it.shield) lines.push({ label: 'Hasar azaltma', value: '%' + Math.round(it.shield.reduce * 100) });
  if (it.food) {
    if (it.food.hunger > 0) lines.push({ label: 'Açlık', value: '+' + it.food.hunger });
    if (it.food.heal > 0) lines.push({ label: 'Can', value: '+' + it.food.heal });
  }
  if (it.placesBlock) lines.push({ label: 'Kullanım', value: 'Yerleştirilebilir' });
  if (it.ability) lines.push({ label: 'Yetenek', value: 'Kalıcı yetenek' });
  if (it.stack > 1) lines.push({ label: 'Yığın', value: 'en çok ' + it.stack });
  return {
    key: it.key,
    name: it.name,
    desc: it.desc || '',
    rarity: it.rarity,
    rarityLabel: rarityLabel(it.rarity),
    color: rarityColor(it.rarity),
    kind: it.kind,
    kindLabel: KIND_LABELS[it.kind] || '',
    count: slot.count || 1,
    lines,
    durability: durabilityInfo(slot),
    // büyü: mor ipucu satırları ('Keskinlik III — +2,3 saldırı hasarı'), asa/iksir/mana kristali özel satırları
    enchants: enchantList(slot.ench),
    enchanted: !!(slot.ench && enchantList(slot.ench).length),
    magicLines: magicLinesOf(it.key),
    charge: chargeInfo(slot),
    techLines: techLinesOf(slot),
  };
}

/** Teknoloji ipucu satırları: şarj sayısal satırı çubukla gösterildiğinden atılır. */
function techLinesOf(slot) {
  if (!slot || !(maxCharge(slot.item) > 0)) return [];
  const raw = slot.techLines || techDescribe(slot);
  return raw.filter((l) => !/: \d+ \/ \d+/.test(l));
}

/** Tek satır düz metin ipucu (aria-label / test): 'Demir Kazma, Yaygın, Hasar 4,5, dayanıklılık 200/250'. */
export function tooltipText(slot) {
  const m = tooltipModel(slot);
  if (!m) return '';
  const parts = [m.name, m.rarityLabel];
  m.lines.forEach((l) => {
    if (l.label !== 'Yığın' && l.label !== 'Kullanım') parts.push(l.label + ' ' + l.value);
  });
  if (m.durability) parts.push('dayanıklılık ' + m.durability.cur + '/' + m.durability.max);
  if (m.charge) parts.push('şarj yüzde ' + m.charge.pct);
  if (m.enchants.length) parts.push('büyülü: ' + m.enchants.map((e) => e.name).join(' ve '));
  return parts.join(', ');
}

/** Yiyecek/kullanılabilir mi (useSlot düğmesi için). */
export function isUsable(slot) {
  const it = slot && itemByKey(slot.item);
  return !!(it && (it.food || it.kind === 'yiyecek' || it.potion || (it.magic && it.magic.manaCrystal)));
}
export function isArmorItem(slot) {
  const it = slot && itemByKey(slot.item);
  return !!(it && it.armor);
}
/** Zırh parçasının takılacağı zırh yuvası dizini (zırh değilse -1). */
export function armorIndexOf(slot) {
  const it = slot && itemByKey(slot.item);
  return it && it.armor ? ARMOR_SLOTS.indexOf(it.armor.slot) : -1;
}

/* ------------------------------------------------------------------------------------------------
 * Hızlı taşıma
 * ---------------------------------------------------------------------------------------------- */
export function stackLimit(itemKey) {
  const it = itemByKey(itemKey);
  return it ? it.stack : 1;
}
function hasDurability(itemKey) {
  const it = itemByKey(itemKey);
  return !!(it && it.durability);
}

/** [lo,hi) aralığında item için yer: önce dolmamış aynı yığın, sonra ilk boş yuva; yoksa -1. */
export function findRoom(slots, item, lo, hi, skip) {
  const arr = slots || [];
  const lim = stackLimit(item);
  if (!hasDurability(item)) {
    for (let i = lo; i < hi; i++) {
      const s = arr[i];
      if (i !== skip && s && s.item === item && s.dur == null && s.count < lim) return i;
    }
  }
  for (let i = lo; i < hi; i++) {
    if (i !== skip && !(arr[i] && arr[i].item)) return i;
  }
  return -1;
}

/**
 * Hızlı taşıma (shift+tık / çift dokunma) planı.
 * inv: getInventorySnapshot(); chest: getChest() | null.
 * → {action:'move', to:'s12'} | {action:'equip'} | null (yapılacak bir şey yok / yer yok)
 */
export function quickMovePlan(addr, inv, chest) {
  const p = parseAddr(addr);
  const slot = slotAtAddr(addr, inv, chest);
  if (!p || !slot || !inv) return null;
  const slots = inv.slots || [];
  const mainThenHotbar = () => {
    const i = findRoom(slots, slot.item, HOTBAR_SIZE, INV_SIZE);
    return i >= 0 ? i : findRoom(slots, slot.item, 0, HOTBAR_SIZE);
  };
  if (p.kind === 'a') {
    const i = mainThenHotbar();
    return i >= 0 ? { action: 'move', to: makeAddr('s', i) } : null;
  }
  if (p.kind === 'c') {
    const i = mainThenHotbar();
    return i >= 0 ? { action: 'move', to: makeAddr('s', i) } : null;
  }
  if (chest && chest.slots) {
    const i = findRoom(chest.slots, slot.item, 0, Math.min(CHEST_SIZE, chest.slots.length));
    return i >= 0 ? { action: 'move', to: makeAddr('c', i) } : null;
  }
  if (isArmorItem(slot)) return { action: 'equip' };
  if (p.index < HOTBAR_SIZE) {
    const i = findRoom(slots, slot.item, HOTBAR_SIZE, INV_SIZE, p.index);
    return i >= 0 ? { action: 'move', to: makeAddr('s', i) } : null;
  }
  const i = findRoom(slots, slot.item, 0, HOTBAR_SIZE, p.index);
  return i >= 0 ? { action: 'move', to: makeAddr('s', i) } : null;
}

/* ------------------------------------------------------------------------------------------------
 * Üretim: sekmeler, tarif görünümü, süzme, yakıt
 * ---------------------------------------------------------------------------------------------- */
/** Sekme → tarif kategorileri (cats null = hepsi; 'özel' tanımsız her şeyi toplar). */
export const CRAFT_TABS = Object.freeze([
  { key: 'tumu', name: 'Tümü', cats: null },
  { key: 'alet', name: 'Araçlar', cats: ['alet'] },
  { key: 'silah', name: 'Silahlar', cats: ['silah'] },
  { key: 'zırh', name: 'Zırh', cats: ['zırh'] },
  { key: 'yapı', name: 'Yapı', cats: ['yapı'] },
  { key: 'yiyecek', name: 'Yiyecek', cats: ['yiyecek'] },
  { key: 'malzeme', name: 'Malzeme', cats: ['malzeme'] },
  { key: 'ocak', name: 'Ocak', cats: ['ocak'] },
  { key: 'teknoloji', name: 'Teknoloji', cats: ['teknoloji'] },
  { key: 'özel', name: 'Özel', cats: ['dekor', 'ışık'], rest: true },
]);

export function tabOfCategory(cat) {
  for (let i = 1; i < CRAFT_TABS.length; i++) {
    if (!CRAFT_TABS[i].rest && CRAFT_TABS[i].cats.indexOf(cat) >= 0) return CRAFT_TABS[i].key;
  }
  return 'özel';
}

/** Metin aramasında Türkçe harf duyarsız eşleşme (boş sorgu hep eşleşir). */
export function matchesQuery(text, query) {
  const q = foldTr(String(query || '')).trim();
  if (!q) return true;
  const t = foldTr(String(text || ''));
  return q.split(/\s+/).every((w) => t.indexOf(w) >= 0);
}

/** Envanter görünümündeki yakıt/ısı durumu. */
export function fuelStatus(inv) {
  const slots = (inv && inv.slots) || [];
  const byItem = {};
  slots.forEach((s) => {
    if (s && s.item && FUEL_HEAT[s.item]) byItem[s.item] = (byItem[s.item] || 0) + s.count;
  });
  const fuels = Object.keys(byItem)
    .map((item) => ({ item, count: byItem[item], heat: FUEL_HEAT[item], total: byItem[item] * FUEL_HEAT[item] }))
    .sort((a, b) => b.total - a.total);
  const carried = Math.max(0, Number(inv && inv.heat) || 0);
  const total = carried + fuels.reduce((n, f) => n + f.total, 0);
  return { carried, fuels, total, smelts: Math.floor(total / SMELT_HEAT) };
}

/**
 * api.getRecipes() satırı → arayüz görünümü.
 * stations: api.getStations() (dizi); fuel: fuelStatus(inv).
 */
export function recipeView(recipe, stations, fuel) {
  const st = Array.isArray(stations) ? stations : [];
  const stationOk = recipe.station === 'el' || st.indexOf(recipe.station) >= 0;
  const ins = (recipe.in || []).map((p) => {
    const have = Math.max(0, Number(p.have) || 0);
    return { item: p.item, name: itemName(p.item), count: p.count, have, ok: have >= p.count };
  });
  const missing = ins.filter((p) => !p.ok);
  const heat = recipe.station === 'ocak' ? (recipe.heat || SMELT_HEAT) : 0;
  const fuelOk = !heat || !fuel || fuel.total >= heat;
  let maxTimes = ins.length ? Math.min.apply(null, ins.map((p) => Math.floor(p.have / p.count))) : 1;
  if (heat && fuel) maxTimes = Math.min(maxTimes, Math.floor(fuel.total / heat));
  if (!stationOk) maxTimes = 0;
  const craftable = stationOk && missing.length === 0 && fuelOk && recipe.craftable !== false;
  let reason = '';
  if (!stationOk) reason = (STATION_LABELS[recipe.station] || recipe.station) + ' gerekli';
  else if (missing.length) reason = 'Malzeme eksik';
  else if (!fuelOk) reason = 'Yakıt yetersiz';
  else if (recipe.craftable === false) reason = 'Yer yok veya üretilemiyor';
  return {
    id: recipe.id,
    out: recipe.out,
    outName: itemName(recipe.out.item),
    in: ins,
    station: recipe.station,
    category: recipe.category,
    tab: tabOfCategory(recipe.category),
    heat,
    stationOk,
    craftable,
    maxTimes: craftable ? Math.max(1, maxTimes) : 0,
    reason,
  };
}

/**
 * Süz — SIRALAMAZ, girdi sırasını korur: bir tarifin yeri envantere/istasyona göre kaymasın (sıra panelCraftUtils.orderViews'ta).
 * opts: {tab, query, craftableOnly (o anki duruma göre), onlyIds (Set: anlık görüntü; craftableOnly'yi ezer)}
 */
export function filterRecipes(views, opts) {
  const o = opts || {};
  const tab = o.tab || 'tumu';
  return views.filter((v) => {
    if (tab !== 'tumu' && v.tab !== tab) return false;
    if (o.onlyIds) {
      if (!o.onlyIds.has(v.id)) return false;
    } else if (o.craftableOnly && !v.craftable) return false;
    if (o.query) {
      const hay = v.outName + ' ' + v.in.map((p) => p.name).join(' ');
      if (!matchesQuery(hay, o.query)) return false;
    }
    return true;
  });
}

let dropIndex = null;
function blockDropIndex() {
  if (dropIndex) return dropIndex;
  dropIndex = new Map();
  BLOCKS.forEach((b) => {
    if (!b || b.id < 1 || b.unbreakable) return;
    if (Array.isArray(b.drops)) {
      b.drops.forEach((d) => {
        const arr = dropIndex.get(d.item) || [];
        arr.push(b);
        dropIndex.set(d.item, arr);
      });
    } else if (b.drops === 'self') {
      const k = 'blok:' + b.key;
      const arr = dropIndex.get(k) || [];
      arr.push(b);
      dropIndex.set(k, arr);
    }
  });
  return dropIndex;
}

/** Eşyanın nereden bulunacağına dair kısa Türkçe ipuçları (en çok 3). */
export function whereToFind(itemKey) {
  const hints = [];
  const recs = recipesProducing(itemKey);
  // 'self' bırakan bloklar (ör. tahta) üretilebiliyorsa "kazarak" ipucu yanıltıcı olur
  const blocks = (blockDropIndex().get(itemKey) || []).filter((b) => !(b.drops === 'self' && recs.length > 0));
  if (blocks.length) {
    const names = blocks.slice(0, 3).map((b) => b.name).join(', ');
    const tool = blocks[0].tool;
    hints.push('Kazarak çıkar: ' + names + (tool ? ' (' + tool + ' ile)' : ''));
  }
  if (recs.length) {
    const st = recs[0].station;
    hints.push(st === 'ocak' ? 'Ocakta pişirilir veya eritilir' : st === 'el' ? 'Elle üretilebilir' : (STATION_LABELS[st] || st) + ' yakınında üretilir');
  }
  const it = itemByKey(itemKey);
  if (!hints.length && it) {
    if (it.kind === 'anahtar') hints.push('Tapınaklarda ve sandıklarda bulunur');
    else if (it.kind === 'özel') hints.push('Boss ve bulmaca ödülü');
    else hints.push('Keşfederek, yaratıklardan veya sandıklardan edinilir');
  }
  return hints.slice(0, 3);
}

/* ------------------------------------------------------------------------------------------------
 * İnşa paleti
 * ---------------------------------------------------------------------------------------------- */
/** api.getBuildPalette() çıktısını temizler: yalnız inşa edilebilir (id ≤ 99) bloklar; sistem blokları atılır. */
export function normalizePalette(raw) {
  const out = [];
  const seen = new Set();
  (Array.isArray(raw) ? raw : []).forEach((e) => {
    if (!e || typeof e !== 'object') return;
    const id = Number(e.id);
    if (!(id >= 1 && id <= BUILDABLE_MAX)) return;
    const item = typeof e.item === 'string' && e.item ? e.item : typeof e.key === 'string' ? 'blok:' + e.key : null;
    if (!item || seen.has(item)) return;
    seen.add(item);
    out.push({
      id,
      item,
      name: String(e.name || itemName(item)),
      group: String(e.group || e.category || 'dekor'),
    });
  });
  return out;
}

export const PALETTE_SPECIAL_TABS = Object.freeze([
  { key: 'tumu', name: 'Tümü' },
  { key: 'fav', name: 'Favoriler' },
  { key: 'son', name: 'Son kullanılan' },
]);

/** Paletteki gruplara göre sekmeler (BUILD_GROUPS sırası, sonra bilinmeyenler) + özel sekmeler. */
export function paletteTabs(entries) {
  const counts = new Map();
  entries.forEach((e) => counts.set(e.group, (counts.get(e.group) || 0) + 1));
  const tabs = PALETTE_SPECIAL_TABS.slice();
  BUILD_GROUPS.forEach((g) => {
    if (counts.has(g.key)) {
      tabs.push({ key: g.key, name: g.name });
      counts.delete(g.key);
    }
  });
  counts.forEach((_n, k) => tabs.push({ key: k, name: k.charAt(0).toLocaleUpperCase('tr-TR') + k.slice(1) }));
  return tabs;
}

/** tab: 'tumu'|'fav'|'son'|grup anahtarı. favs/recents: eşya anahtarı listeleri. */
export function filterPalette(entries, opts) {
  const o = opts || {};
  const tab = o.tab || 'tumu';
  const favs = o.favs || [];
  const recents = o.recents || [];
  let list = entries;
  if (tab === 'fav') list = entries.filter((e) => favs.indexOf(e.item) >= 0);
  else if (tab === 'son') {
    list = recents.map((k) => entries.find((e) => e.item === k)).filter(Boolean);
  } else if (tab !== 'tumu') list = entries.filter((e) => e.group === tab);
  if (o.query) list = list.filter((e) => matchesQuery(e.name, o.query));
  return list;
}

/** Listeye başa ekle, yineleneni çıkar, en çok max tut. */
export function pushRecent(list, item, max = 12) {
  const out = [item].concat((list || []).filter((k) => k !== item));
  return out.slice(0, max);
}
export function toggleInList(list, item) {
  const arr = list || [];
  return arr.indexOf(item) >= 0 ? arr.filter((k) => k !== item) : arr.concat([item]);
}

/** Roving ızgara klavye gezinmesi: bir sonraki indeks (kenarlarda kısıtlı). */
export function gridNavTarget(key, index, cols, count) {
  if (count <= 0) return -1;
  let n = index;
  if (key === 'ArrowRight') n = index + 1;
  else if (key === 'ArrowLeft') n = index - 1;
  else if (key === 'ArrowDown') n = index + cols;
  else if (key === 'ArrowUp') n = index - cols;
  else if (key === 'Home') n = 0;
  else if (key === 'End') n = count - 1;
  else return -1;
  if (n < 0 || n >= count) return index;
  return n;
}
