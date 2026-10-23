/*
 * KEŞİF sim — TEKNOLOJİ: eşya şarjı (saf). Şarj, yığınlanmayan eşya yuvasında `charge` alanıdır ({item,count:1,dur?,ench?,charge}).
 *
 *   techOf(itemKey) → it.tech | null            maxCharge(itemKey) → int            isChargeable(itemKey)
 *   startCharge(itemKey) → int                   sanitizeCharge(raw, itemKey) → int | undefined
 *   chargeOf(slot) / slotMax(slot) / chargeFraction(slot)
 *   addChargeToSlot(slot, n) → eklenen            drainSlot(slot, n) → harcanan
 *   consumeHeldCharge(inv, n) → bool (yeterli şarj vardı; yoksa kalan tüketilir)
 *   chargeInventory(inv, budget, opts?) → harcanan bütçe     (çanta + zırh; önce çubuk, sonra çanta, sonra zırh)
 *   inventoryChargeNeed(inv) → doldurmak için gereken toplam
 *   findCarried(inv, kind, {hotbarOnly=true}) → {slot, index, zone} | null
 *   techDescribe(slotOrKey) → string[] (ipucu satırları)
 *
 * Şarj enerji birimidir (EU); yakıt (jetpack) ve portal tabancası şarjı aynı alanı kullanır (birim adı eşyaya göre değişir).
 */
import { itemByKey } from './items.js';

const UNITS = Object.freeze({ jetpack: 'yakıt', portalgun: 'portal', scanner: 'şarj', elektrikli: 'şarj', kalkan: 'kalkan' });

/** Eşyanın teknoloji tanımı ({kind, chargeMax, start}) | null. */
export function techOf(itemKey) {
  const it = itemByKey(itemKey);
  return it && it.tech ? it.tech : null;
}
export function maxCharge(itemKey) {
  const t = techOf(itemKey);
  return t && t.chargeMax > 0 ? t.chargeMax | 0 : 0;
}
export function isChargeable(itemKey) {
  return maxCharge(itemKey) > 0;
}
/** Yeni (üretilen / eksik alanlı) eşyanın başlangıç şarjı. */
export function startCharge(itemKey) {
  const t = techOf(itemKey);
  if (!t || !(t.chargeMax > 0)) return 0;
  const s = t.start === undefined ? 1 : Math.max(0, Math.min(1, Number(t.start)));
  return Math.round(t.chargeMax * (Number.isFinite(s) ? s : 1));
}
/**
 * Dış kaynaktan (kayıt/sandık/yer eşyası) gelen şarj değerini temizler: sayı değilse başlangıç şarjı, aralık 0..max.
 * Şarj taşımayan eşya için undefined döner.
 */
export function sanitizeCharge(raw, itemKey) {
  const max = maxCharge(itemKey);
  if (!(max > 0)) return undefined;
  if (raw === undefined || raw === null || typeof raw === 'boolean' || (typeof raw !== 'number' && typeof raw !== 'string')) {
    return startCharge(itemKey);
  }
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return startCharge(itemKey);
  return n < 0 ? 0 : n > max ? max : n;
}

export function chargeOf(slot) {
  return slot && slot.charge > 0 ? slot.charge : 0;
}
export function slotMax(slot) {
  return slot ? maxCharge(slot.item) : 0;
}
export function chargeFraction(slot) {
  const m = slotMax(slot);
  return m > 0 ? Math.min(1, chargeOf(slot) / m) : 0;
}

/** Yuvaya n şarj ekler (üst sınıra kırpar); gerçekte eklenen. Şarj taşımayan yuvada 0. */
export function addChargeToSlot(slot, n) {
  const max = slotMax(slot);
  if (!(max > 0) || !(n > 0)) return 0;
  const cur = chargeOf(slot);
  const add = Math.min(max - cur, Math.floor(n));
  if (add <= 0) return 0;
  slot.charge = cur + add;
  return add;
}
/** Yuvadan en çok n şarj çeker; gerçekte harcanan. */
export function drainSlot(slot, n) {
  if (!slot || !(slotMax(slot) > 0) || !(n > 0)) return 0;
  const cur = chargeOf(slot);
  const use = Math.min(cur, Math.ceil(n));
  if (use <= 0) return 0;
  slot.charge = cur - use;
  return use;
}

function emit(inv) {
  if (inv && typeof inv._emit === 'function') inv._emit();
}

/** Eldeki şarjlı eşyadan n şarj harcar. Yeterliyse true; yetmezse kalan tüketilir ve false. Şarjsız eşyada false. */
export function consumeHeldCharge(inv, n) {
  const s = inv && typeof inv.held === 'function' ? inv.held() : null;
  if (!s || !(slotMax(s) > 0)) return false;
  if (inv.infinite) return true;
  const want = Math.max(0, n);
  const used = drainSlot(s, want);
  if (used > 0) emit(inv);
  return used >= Math.ceil(want);
}

function eachChargeable(inv, fn) {
  const hot = inv.hotbarSize || 0;
  for (let i = 0; i < inv.size; i++) {
    const s = inv.slots[i];
    if (s && slotMax(s) > 0) fn(s, i < hot ? 'hotbar' : 'slots', i);
  }
  const armor = inv.armor || [];
  for (let a = 0; a < armor.length; a++) {
    if (armor[a] && slotMax(armor[a]) > 0) fn(armor[a], 'armor', a);
  }
}

/** Çanta + giyili zırhtaki tüm şarjlı eşyaları doldurmak için gereken toplam şarj. */
export function inventoryChargeNeed(inv) {
  let need = 0;
  if (!inv) return 0;
  eachChargeable(inv, (s) => { need += slotMax(s) - chargeOf(s); });
  return need;
}

/**
 * Bütçe kadar şarjı envanterdeki şarjlı eşyalara dağıtır (en boş orana sahip önce; eşitlikte çubuk → çanta → zırh).
 * opts: {onlyHeld:boolean, kinds:[tech.kind...]}. Döner: gerçekten harcanan bütçe.
 */
export function chargeInventory(inv, budget, opts) {
  if (!inv || !(budget > 0)) return 0;
  const o = opts || {};
  const items = [];
  eachChargeable(inv, (s, zone, index) => {
    if (o.onlyHeld && !(zone !== 'armor' && index === inv.selected)) return;
    const t = techOf(s.item);
    if (o.kinds && o.kinds.indexOf(t.kind) < 0) return;
    if (slotMax(s) - chargeOf(s) > 0) items.push({ s, zone, index });
  });
  items.sort((a, b) => chargeFraction(a.s) - chargeFraction(b.s) || zoneRank(a.zone) - zoneRank(b.zone) || a.index - b.index);
  let left = Math.floor(budget);
  let used = 0;
  for (let i = 0; i < items.length && left > 0; i++) {
    const got = addChargeToSlot(items[i].s, left);
    left -= got;
    used += got;
  }
  if (used > 0) emit(inv);
  return used;
}
function zoneRank(z) {
  return z === 'hotbar' ? 0 : z === 'slots' ? 1 : 2;
}

/** Çantada (varsayılan yalnız çubukta) ilk şarjlı eşya bu `tech.kind`'a sahip mi? */
export function findCarried(inv, kind, opts) {
  if (!inv || !inv.slots) return null;
  const hotbarOnly = !opts || opts.hotbarOnly !== false;
  const lim = hotbarOnly ? Math.min(inv.hotbarSize || 9, inv.size) : inv.size;
  for (let i = 0; i < lim; i++) {
    const s = inv.slots[i];
    if (!s) continue;
    const t = techOf(s.item);
    if (t && t.kind === kind) return { slot: s, index: i, zone: i < (inv.hotbarSize || 0) ? 'hotbar' : 'slots' };
  }
  return null;
}
/** Giyili zırhta bu türden şarjlı parçalar (kalkan). */
export function armorWith(inv, kind) {
  const out = [];
  const armor = (inv && inv.armor) || [];
  for (let a = 0; a < armor.length; a++) {
    const s = armor[a];
    const t = s ? techOf(s.item) : null;
    if (t && t.kind === kind) out.push({ slot: s, index: a });
  }
  return out;
}

/** Eşya ipucu satırları (şarj + tür açıklaması). Şarjsız eşyada boş dizi. */
export function techDescribe(slotOrKey) {
  const slot = typeof slotOrKey === 'string' ? { item: slotOrKey } : slotOrKey;
  if (!slot) return [];
  const t = techOf(slot.item);
  if (!t) return [];
  const lines = [];
  const max = maxCharge(slot.item);
  const cur = slot.charge === undefined ? startCharge(slot.item) : chargeOf(slot);
  if (max > 0) {
    const unit = UNITS[t.kind] || 'şarj';
    lines.push((unit.charAt(0).toUpperCase() + unit.slice(1)) + ': ' + cur + ' / ' + max + (t.kind === 'portalgun' ? '' : ' EU'));
    if (cur <= 0) lines.push('Şarj bitti: ' + (t.kind === 'jetpack' ? 'Enerji Hücresiyle doldur.' : t.kind === 'portalgun' ? 'Enerji Hücresiyle doldur.' : 'Pil Bankası ya da Şarj İstasyonunda doldur.'));
  }
  if (t.kind === 'jetpack') lines.push('Çubukta taşırken zıplamayı basılı tut.');
  else if (t.kind === 'scanner') lines.push('Çubukta taşırken çevreyi periyodik tarar.');
  else if (t.kind === 'elektrikli') lines.push('Her kırılan blok şarj harcar.');
  else if (t.kind === 'kalkan') lines.push('Şarjlıyken gelen hasarın bir kısmını emer.');
  else if (t.kind === 'portalgun') lines.push('Her portal atışı 1 şarj harcar.');
  return lines;
}
