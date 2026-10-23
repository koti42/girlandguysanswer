/*
 * KEŞİF sim/city/ped — SATICI MANTIĞI (npc_vendors). SAF; envanter/cüzdan/kayıt arayüzle enjekte edilir (Inventory sınıfı + createWallet bu arayüzü karşılar).
 *
 *   vendorStock(seed, dayN, vendorId) → [{item, price, qty}]          günlük stok: havuzdaki tekliflerden STOCK_SIZE tanesi, hash(seed,gün,satıcı); belirlenimci, sıralı
 *   vendorView(ctx, vendorId) → VendorView | null                     arayüz görüntüsü (düz JSON): teklifler (kalan/sınır/neden) + satılabilir envanter
 *   buyFrom(ctx, vendorId, item, n) → {ok, reason, message, price, n}  Kredi → eşya (stok, günlük sınır, envanter yeri, Kredi denetimi)
 *   sellTo(ctx, vendorId, item, n) → {ok, reason, message, price, n}   eşya → Kredi (%40 türev fiyat; günlük satış sınırı)
 *   ctx = {seed, dayN, shop (npcSave.shopOf canlı nesne), inv {count, canAdd, add, remove}, wallet {get, spend, add}, isBound?(item)}
 * Neden kodları: yok · stokta-yok · gunluk-sinir · dolu · kredi · bagli · kabul-yok · yetersiz · gecersiz.
 */
import { ITEMS } from '../../items.js';
import { hash3, stringSeedToInt } from '../../rng.js';
import { foldKey } from './npcSave.js';
import {
  SELL_LIMIT, STOCK_SIZE, buyPrice, dailyCap, getVendor, offerQty, poolItems, sellAccepted, sellPrice,
} from './vendorData.js';

export const MAX_N = 64;

const MESSAGES = Object.freeze({
  yok: 'Bu satıcı bunu satmıyor.',
  'stokta-yok': 'Bugünlük bu ürün tükendi.',
  'gunluk-sinir': 'Bugün bu üründen daha fazla alamazsın.',
  dolu: 'Çantanda yer yok.',
  kredi: 'Yeterli Kredin yok.',
  bagli: 'Bu eşya şehirden çıkarılamaz.',
  'kabul-yok': 'Satıcı bunu almıyor.',
  yetersiz: 'Yeterli eşyan yok.',
  gecersiz: 'Geçersiz miktar.',
});

const fail = (reason) => ({
  ok: false, reason, message: MESSAGES[reason] || 'Olmadı.', price: 0, n: 0,
});

/** Günlük stok (STOCK_SIZE teklif): hash sırası; aynı (tohum, gün, satıcı) → aynı liste. */
export function vendorStock(seed, dayN, vendorId) {
  const v = getVendor(vendorId);
  if (!v) return [];
  const items = poolItems(v.pool);
  const vh = stringSeedToInt('vendor:' + vendorId) | 0;
  const day = Math.max(0, Math.floor(dayN) || 0);
  const order = items.map((item, i) => ({ item, i, h: hash3(i, day, vh, seed | 0) }));
  order.sort((a, b) => a.h - b.h || a.i - b.i);
  const picked = order.slice(0, STOCK_SIZE).sort((a, b) => a.i - b.i);
  return picked.map((o) => ({ item: o.item, price: buyPrice(vendorId, o.item), qty: offerQty(o.item) }));
}

const key = (vendorId, item) => vendorId + '|' + foldKey(item);
const countOf = (map, k) => (map && Object.prototype.hasOwnProperty.call(map, k) && Number.isFinite(map[k]) ? map[k] : 0);

function normN(n) {
  const k = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
  return k >= 1 && k <= MAX_N ? k : 0;
}

function isBound(ctx, item) {
  if (typeof ctx.isBound === 'function' && ctx.isBound(item)) return true;
  const it = ITEMS[item];
  return !!(it && it.dimBound);
}

export function buyFrom(ctx, vendorId, item, n) {
  const count = normN(n);
  if (!count) return fail('gecersiz');
  const v = getVendor(vendorId);
  if (!v || typeof item !== 'string') return fail('yok');
  const offer = vendorStock(ctx.seed, ctx.dayN, vendorId).find((o) => o.item === item);
  if (!offer || !ITEMS[item]) return fail('yok');
  if (isBound(ctx, item)) return fail('bagli');
  const s = ctx.shop;
  const leftOffer = offer.qty - countOf(s.s, key(vendorId, item));
  if (leftOffer <= 0) return fail('stokta-yok');
  if (count > leftOffer) return fail('stokta-yok');
  if (countOf(s.g, foldKey(item)) + count > dailyCap(item)) return fail('gunluk-sinir');
  const total = offer.price * count;
  if (!ctx.inv.canAdd(item, count)) return fail('dolu');
  if (ctx.wallet.get() < total) return fail('kredi');
  if (!ctx.wallet.spend(total, 'satici:' + vendorId)) return fail('kredi');
  const left = ctx.inv.add(item, count);
  if (left > 0) {
    // canAdd doğruydu; yine de taşan olursa iade et (kayıp yok)
    ctx.wallet.add(offer.price * left, 'iade');
  }
  const got = count - Math.max(0, left);
  s.s[key(vendorId, item)] = countOf(s.s, key(vendorId, item)) + got;
  s.g[foldKey(item)] = countOf(s.g, foldKey(item)) + got;
  return {
    ok: got > 0, reason: got > 0 ? '' : 'dolu', message: got > 0 ? ITEMS[item].name + ' x' + got + ' alındı.' : MESSAGES.dolu, price: offer.price * got, n: got,
  };
}

export function sellTo(ctx, vendorId, item, n) {
  const count = normN(n);
  if (!count) return fail('gecersiz');
  const v = getVendor(vendorId);
  if (!v || typeof item !== 'string' || !ITEMS[item]) return fail('yok');
  if (isBound(ctx, item)) return fail('bagli');
  if (!sellAccepted(vendorId, item)) return fail('kabul-yok');
  const s = ctx.shop;
  if (countOf(s.k, foldKey(item)) + count > SELL_LIMIT) return fail('gunluk-sinir');
  if (ctx.inv.count(item) < count) return fail('yetersiz');
  if (!ctx.inv.remove(item, count)) return fail('yetersiz');
  const price = sellPrice(item) * count;
  ctx.wallet.add(price, 'satis:' + vendorId);
  s.k[foldKey(item)] = countOf(s.k, foldKey(item)) + count;
  return {
    ok: true, reason: '', message: ITEMS[item].name + ' x' + count + ' satıldı: +' + price + ' Kredi.', price, n: count,
  };
}

/** Düz JSON arayüz görüntüsü. `info`: {id,name,title,brand} (npcData'dan). */
export function vendorView(ctx, vendorId, info) {
  const v = getVendor(vendorId);
  if (!v) return null;
  const stock = vendorStock(ctx.seed, ctx.dayN, vendorId);
  const s = ctx.shop;
  const kredi = ctx.wallet.get();
  const offers = stock.map((o) => {
    const it = ITEMS[o.item];
    const bound = isBound(ctx, o.item);
    const qtyLeft = Math.max(0, o.qty - countOf(s.s, key(vendorId, o.item)));
    const limit = Math.max(0, dailyCap(o.item) - countOf(s.g, foldKey(o.item)));
    const left = Math.min(qtyLeft, limit);
    let why = '';
    let canBuy = true;
    if (bound) { canBuy = false; why = MESSAGES.bagli; } else if (qtyLeft <= 0) { canBuy = false; why = MESSAGES['stokta-yok']; } else if (limit <= 0) { canBuy = false; why = MESSAGES['gunluk-sinir']; } else if (!ctx.inv.canAdd(o.item, 1)) { canBuy = false; why = MESSAGES.dolu; } else if (kredi < o.price) { canBuy = false; why = MESSAGES.kredi; }
    const out = {
      item: o.item, name: it ? it.name : o.item, desc: it && it.desc ? it.desc : '', price: o.price, left, limit, carry: bound ? 'city' : 'overworld', canBuy,
    };
    if (why) out.why = why;
    return out;
  });
  const sells = [];
  poolItems(v.pool).forEach((item) => {
    if (!sellAccepted(vendorId, item) || isBound(ctx, item)) return;
    const have = ctx.inv.count(item);
    if (have <= 0) return;
    const it = ITEMS[item];
    sells.push({
      item, name: it.name, count: have, price: sellPrice(item), left: Math.max(0, SELL_LIMIT - countOf(s.k, foldKey(item))),
    });
  });
  return {
    type: 'vendor',
    vendor: {
      id: v.id, name: (info && info.name) || v.name, title: (info && info.title) || v.title, brand: (info && info.brand) || v.brand || '',
    },
    day: ctx.dayN | 0,
    kredi,
    carryNote: 'Ana diyara taşınır',
    offers,
    sells,
  };
}
