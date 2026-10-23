/*
 * KEŞİF büyü/simya panelleri — saf yardımcılar (DOM/React yok; node'da test edilir).
 *
 *   enchantList(ench)                 [{key,level,name:'Keskinlik III',text}] (ENCHANT_LIST sırası; geçersiz/bilinmeyen atılır)
 *   enchantNames(ench)                'Keskinlik III, Alev I'
 *   magicLinesOf(itemKey)             asa / mana kristali / iksir satırları (büyüsüz, eşyaya özgü)
 *   previewEnchants(slot, offer)      teklif uygulanırsa ortaya çıkacak liste + her satır için durum 'yeni'|'yükselir'|'aynı'
 *   offerState(offer, dust, shards)   {affordable, missing:[{what,need,have}], reason}
 *   shelfBooks(count)                 5 kitap için durum dizisi ('full'|'empty'), kademe ve etiket
 *   pickableSlots(inv)                büyülenebilir yuvalar [{addr, slot}] (çanta + zırh; hotbar önce)
 *   defaultTarget(inv, slots)         varsayılan hedef adres (eldeki uygunsa o, değilse ilk uygun)
 *   brewView(info)                    kazan panelinin durumu: 'bos' | 'demleniyor' | 'hazir'
 *   effectDuration(item)              iksirin etki metni 'Hız — 3:00'
 *   EFFECT_ICON_PATHS / EFFECT_COLORS HUD durum etkisi simgeleri (renk + şekil)
 */
import {
  ENCHANT_LIST, describeEnchant, enchantDef, isEnchantable, magicDescribe, mergeEnchants, shelfTier, roman,
} from '../../../game/kesif/sim/magic.js';

const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

export function enchantList(ench) {
  const out = [];
  if (!ench || typeof ench !== 'object') return out;
  for (let i = 0; i < ENCHANT_LIST.length; i++) {
    const d = ENCHANT_LIST[i];
    if (!hasOwn(ench, d.key)) continue;
    const e = describeEnchant(d.key, ench[d.key]);
    if (e) out.push(e);
  }
  return out;
}

export function enchantNames(ench) {
  return enchantList(ench).map((e) => e.name).join(', ');
}

/** Büyüsüz eşya satırları (asa büyüsü, mana kristali, iksir etkisi). */
export function magicLinesOf(itemKey) {
  if (!itemKey) return [];
  return magicDescribe({ item: itemKey });
}

/** Teklifin sonucu: mevcut büyüler + teklif. state: 'yeni' | 'yükselir' | 'aynı'. */
export function previewEnchants(slot, offer) {
  const base = slot && slot.ench ? slot.ench : null;
  if (!slot || !offer) return enchantList(base).map((e) => Object.assign({ state: 'aynı' }, e));
  const merged = mergeEnchants(base, offer.enchants, slot.item) || base || {};
  return enchantList(merged).map((e) => {
    const before = base && hasOwn(base, e.key) ? base[e.key] : 0;
    const state = before === 0 ? 'yeni' : before < e.level ? 'yükselir' : 'aynı';
    return Object.assign({ state }, e);
  });
}

/** Teklif karşılanabilir mi; eksikleri açıkla. */
export function offerState(offer, dust, shards) {
  if (!offer) return { affordable: false, missing: [], reason: '' };
  const missing = [];
  if (dust < offer.costDust) missing.push({ what: 'Büyü Tozu', need: offer.costDust, have: dust });
  if (shards < offer.costShard) missing.push({ what: 'Kuantum Kıymığı', need: offer.costShard, have: shards });
  const reason = missing.length ? missing.map((m) => m.what + ' eksik (' + m.have + '/' + m.need + ')').join(', ') : '';
  return { affordable: missing.length === 0, missing, reason };
}

/** Kitaplık göstergesi: 5 kitap; tier = sim kademesi. */
export function shelfBooks(count) {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  const tier = shelfTier(n);
  const books = [];
  for (let i = 0; i < 5; i++) books.push(i < n ? 'full' : 'empty');
  const full = n >= 5;
  return {
    books,
    tier,
    tierName: roman(tier),
    label: Math.min(n, 5) + '/5 kitaplık • Kademe ' + roman(tier),
    full,
    note: full ? 'Tam kitaplık çemberi: büyü tozu %15 indirimli.' : n >= 4 ? 'En yüksek kademe açık. Beşinci kitaplık indirim kazandırır.' : 'Masanın çevresine kitaplık diz: her kitaplık kademeyi yükseltir.',
  };
}

/** Büyülenebilir yuvalar: hotbar, çanta, sonra zırh. inv = getInventorySnapshot(). */
export function pickableSlots(inv) {
  const out = [];
  if (!inv) return out;
  const slots = inv.slots || [];
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.item && s.count > 0 && isEnchantable(s.item)) out.push({ addr: 's' + i, slot: s });
  }
  const armor = inv.armor || [];
  for (let i = 0; i < armor.length; i++) {
    const s = armor[i];
    if (s && s.item && s.count > 0 && isEnchantable(s.item)) out.push({ addr: 'a' + i, slot: s });
  }
  return out;
}

export function defaultTarget(inv, list) {
  if (!list || list.length === 0) return null;
  const held = inv ? 's' + inv.selected : null;
  const hit = list.find((p) => p.addr === held);
  return (hit || list[0]).addr;
}

export function brewView(info) {
  const c = info && info.cauldron;
  if (!c) return 'bos';
  return c.done ? 'hazir' : 'demleniyor';
}

export function fmtClock(sec) {
  const n = Math.max(0, Math.round(sec));
  return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
}

/** Durum etkisi simgeleri (24×24 yol). Her etkinin kendine özgü şekli var (renk körlüğü). */
export const EFFECT_ICON_PATHS = Object.freeze({
  hiz: 'M4 6l7 6-7 6V6zm9 0l7 6-7 6V6z',
  ziplama: 'M12 3l7 8h-4v4h-6v-4H5l7-8zM8 19h8v2H8z',
  guc: 'M12 2l2.4 6.4L21 9l-5 4.3L17.5 20 12 16.5 6.5 20 8 13.3 3 9l6.6-.6L12 2z',
  goz: 'M12 5c5 0 8.5 4.2 10 7-1.5 2.8-5 7-10 7S3.500 14.800 2 12c1.500-2.800 5-7 10-7zm0 3a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z',
  ates: 'M12 2c1 4 5 5.500 5 10a5 5 0 01-10 0c0-2 1-3.500 2-4.500C9 9.500 10 10 11 10c0-3 0-5 1-8z',
  su: 'M12 2.500C9 7 5.500 10.500 5.500 14.500a6.500 6.500 0 0013 0C18.500 10.500 15 7 12 2.500z',
  kalp: 'M12 21.200C5.200 15.800 2 12.200 2 8.200 2 5 4.400 2.600 7.300 2.600c1.900 0 3.700 1 4.700 2.700 1-1.700 2.800-2.700 4.700-2.700C19.600 2.600 22 5 22 8.200c0 4-3.200 7.600-10 13z',
});

export const EFFECT_COLORS = Object.freeze({
  hiz: '#7fe6ff', ziplama: '#9dff7f', guc: '#ff7a5c', goz: '#8b9cff', ates: '#ffab45', su: '#4fc3e8', kalp: '#ff7ab8',
});

export function effectColor(icon) {
  return EFFECT_COLORS[icon] || '#c8b4ff';
}

export function effectLabel(e) {
  if (!e) return '';
  const lvl = e.level > 1 ? ' ' + roman(e.level) : '';
  return e.name.replace(/ \d+$/, '') + lvl + ', ' + fmtClock(e.secondsLeft) + ' kaldı';
}

export function enchantDefName(key) {
  const d = enchantDef(key);
  return d ? d.name : key;
}
