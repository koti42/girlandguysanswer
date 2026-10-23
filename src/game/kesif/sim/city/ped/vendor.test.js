import { describe, expect, it } from 'vitest';
import {
  BASE_PRICE, OFFER_POOLS, SELL_LIMIT, SELL_PRICE, STOCK_SIZE, VENDORS, acquisitionCost, buyPrice, dailyCap, getVendor, offerQty, poolItems, sellAccepted, sellPrice,
} from './vendorData.js';
import {
  buyFrom, sellTo, vendorStock, vendorView,
} from './vendorLogic.js';
import {
  createWallet, emptyShop, foldKey, shopOf, rollDay,
} from './npcSave.js';
import { ITEMS, RECIPES } from '../../items.js';
import { Inventory } from '../../inventory.js';
import { mulberry32 } from '../../rng.js';
import { NPCS } from './npcData.js';
import { scanText } from '../citySafeData.js';
import { dimBoundOf, registerDimBound, unregisterDimBound } from '../../dim/travel.js';

function makeCtx(o) {
  const opts = o || {};
  const city = { kredi: opts.kredi === undefined ? 100000 : opts.kredi };
  const inv = new Inventory();
  (opts.items || []).forEach((p) => inv.add(p[0], p[1]));
  const ctx = {
    seed: opts.seed === undefined ? 123456 : opts.seed,
    dayN: opts.dayN || 0,
    shop: shopOf(city),
    inv,
    wallet: createWallet(() => city, null),
    isBound: opts.isBound,
  };
  return { ctx, city, inv };
}

describe('vendorData: bütünlük', () => {
  it('her havuz ≥14 teklif; tüm eşyalar ITEMS\'te ve fiyatlı; bağlı/silah eşyası yok; tekrarsız', () => {
    expect(Object.keys(OFFER_POOLS).length).toBeGreaterThanOrEqual(15);
    Object.keys(OFFER_POOLS).forEach((p) => {
      const l = OFFER_POOLS[p];
      expect(l.length, p).toBeGreaterThanOrEqual(14);
      expect(new Set(l).size, p).toBe(l.length);
      l.forEach((item) => {
        expect(ITEMS[item], item).toBeTruthy();
        expect(BASE_PRICE[item], item).toBeGreaterThanOrEqual(2);
        expect(ITEMS[item].dimBound, item).toBeUndefined();
        expect(['silah', 'anahtar'], item).not.toContain(ITEMS[item].kind);
      });
    });
  });

  it('satıcılar: 16 sahip + 6 sokak + otomat; havuzları var; benzersiz; adları güvenli', () => {
    expect(VENDORS).toHaveLength(23);
    expect(new Set(VENDORS.map((v) => v.id)).size).toBe(23);
    expect(VENDORS.filter((v) => v.kind === 'owner')).toHaveLength(16);
    expect(VENDORS.filter((v) => v.kind === 'street')).toHaveLength(6);
    expect(getVendor('otomat').markup).toBeGreaterThan(1);
    VENDORS.forEach((v) => {
      expect(OFFER_POOLS[v.pool], v.id).toBeTruthy();
      expect(v.markup).toBeGreaterThanOrEqual(1);
      expect(scanText(v.name + ' ' + v.title)).toEqual([]);
    });
    expect(NPCS.filter((n) => n.shop).length).toBe(22);
    expect(getVendor('__proto__')).toBe(null);
    expect(getVendor('yok')).toBe(null);
    expect(buyPrice('yok', 'item:elma')).toBe(0);
    expect(buyPrice('kerem', 'item:yok')).toBe(0);
    expect(poolItems('yok')).toEqual([]);
  });

  it('taban fiyat tablosunun tüm anahtarları gerçek eşya; sınırlar: tech malzeme ≤16, iksir ≤4, nadir aygıt ≤2', () => {
    Object.keys(BASE_PRICE).forEach((k) => expect(ITEMS[k], k).toBeTruthy());
    ['item:bakır_tel', 'item:devre_kartı', 'item:pil_hücresi', 'item:çelik_levha', 'item:lazer_merceği', 'item:enerji_hücresi', 'item:kristal_tozu', 'blok:kablo', 'blok:sensör']
      .forEach((k) => expect(dailyCap(k), k).toBeLessThanOrEqual(16));
    expect(dailyCap('item:şifa_iksiri')).toBeLessThanOrEqual(4);
    expect(dailyCap('item:iksir_hiz')).toBeLessThanOrEqual(4);
    expect(dailyCap('item:tarayıcı')).toBe(1);
    expect(dailyCap('item:planör')).toBe(1);
    expect(dailyCap('item:yok')).toBe(0);
    Object.keys(OFFER_POOLS).forEach((p) => OFFER_POOLS[p].forEach((i) => {
      expect(offerQty(i), i).toBeGreaterThanOrEqual(1);
      expect(offerQty(i), i).toBeLessThanOrEqual(dailyCap(i));
    }));
  });
});

describe('vendorLogic: günlük stok', () => {
  it('belirlenimci: aynı (tohum,gün,satıcı) → aynı 6 teklif; havuz sırasıyla; fiyatlı', () => {
    VENDORS.forEach((v) => {
      const a = vendorStock(123456, 3, v.id);
      const b = vendorStock(123456, 3, v.id);
      expect(a).toEqual(b);
      expect(a).toHaveLength(STOCK_SIZE);
      const pool = poolItems(v.pool);
      let last = -1;
      a.forEach((o) => {
        const i = pool.indexOf(o.item);
        expect(i).toBeGreaterThan(last);
        last = i;
        expect(o.price).toBe(buyPrice(v.id, o.item));
        expect(o.qty).toBe(offerQty(o.item));
      });
      expect(new Set(a.map((o) => o.item)).size).toBe(STOCK_SIZE);
    });
    expect(vendorStock(1, 0, 'yok')).toEqual([]);
  });

  it('gün ve tohum stoku değiştirir; yeterince çeşitli (14 teklifin çoğu bir haftada görünür)', () => {
    const seen = new Set();
    let differ = 0;
    let prev = '';
    for (let d = 0; d < 14; d++) {
      const s = vendorStock(77, d, 'usta_selvi');
      s.forEach((o) => seen.add(o.item));
      const key = s.map((o) => o.item).join(',');
      if (key !== prev) differ++;
      prev = key;
    }
    expect(differ).toBeGreaterThanOrEqual(12);
    expect(seen.size).toBeGreaterThanOrEqual(12);
    expect(vendorStock(1, 5, 'kerem').map((o) => o.item).join()).not.toBe(vendorStock(2, 5, 'kerem').map((o) => o.item).join());
    expect(vendorStock(1, 5, 'kerem').map((o) => o.item).join()).not.toBe(vendorStock(1, 5, 'tuna').map((o) => o.item).join());
    expect(vendorStock(1, -4, 'kerem')).toEqual(vendorStock(1, 0, 'kerem'));
    expect(vendorStock(1, NaN, 'kerem')).toEqual(vendorStock(1, 0, 'kerem'));
  });
});

describe('vendorLogic: alım/satım kuralları', () => {
  it('alım: Kredi düşer, eşya gelir, sayaçlar artar; stok tükenince reddedilir; gün değişince yenilenir', () => {
    const { ctx, city, inv } = makeCtx({ kredi: 1000 });
    const offer = vendorStock(ctx.seed, ctx.dayN, 'usta_selvi')[0];
    const r = buyFrom(ctx, 'usta_selvi', offer.item, 2);
    expect(r).toMatchObject({ ok: true, n: 2, price: offer.price * 2 });
    expect(city.kredi).toBe(1000 - offer.price * 2);
    expect(inv.count(offer.item)).toBe(2);
    expect(ctx.shop.s['usta_selvi|' + foldKey(offer.item)]).toBe(2);
    expect(ctx.shop.g[foldKey(offer.item)]).toBe(2);
    // kalan stok kadar al, sonra bir fazlası
    const left = offer.qty - 2;
    const cap = dailyCap(offer.item) - 2;
    const take = Math.min(left, cap);
    if (take > 0) expect(buyFrom(ctx, 'usta_selvi', offer.item, take).ok).toBe(true);
    const over = buyFrom(ctx, 'usta_selvi', offer.item, 1);
    expect(over.ok).toBe(false);
    expect(['stokta-yok', 'gunluk-sinir']).toContain(over.reason);
    ctx.dayN = 1;
    rollDay(city, 1);
    const next = vendorStock(ctx.seed, 1, 'usta_selvi').find((o) => o.item === offer.item);
    if (next) expect(buyFrom(ctx, 'usta_selvi', offer.item, 1).ok).toBe(true);
  });

  it('reddedilen durumlar: yok, geçersiz miktar, yetersiz Kredi (atomik), dolu çanta (atomik), bağlı eşya', () => {
    const { ctx, city, inv } = makeCtx({ kredi: 3 });
    const stock = vendorStock(ctx.seed, ctx.dayN, 'hasan_amca');
    const it0 = stock[0];
    expect(buyFrom(ctx, 'hasan_amca', 'item:yok', 1)).toMatchObject({ ok: false, reason: 'yok' });
    expect(buyFrom(ctx, 'yok_satici', it0.item, 1)).toMatchObject({ ok: false, reason: 'yok' });
    expect(buyFrom(ctx, 'hasan_amca', it0.item, 0)).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(buyFrom(ctx, 'hasan_amca', it0.item, -1)).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(buyFrom(ctx, 'hasan_amca', it0.item, 65)).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(buyFrom(ctx, 'hasan_amca', it0.item, NaN)).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(buyFrom(ctx, 'hasan_amca', it0.item, 1.5).ok).toBe(false); // tabana yuvarlanır (1 adet) ama Kredi yetmez
    const pricey = stock.find((o) => o.price > 3);
    expect(buyFrom(ctx, 'hasan_amca', pricey.item, 1)).toMatchObject({ ok: false, reason: 'kredi' });
    expect(city.kredi).toBe(3);
    expect(inv.count(pricey.item)).toBe(0);
    expect(ctx.shop.s).toEqual({});
    // dolu çanta
    const full = makeCtx({ kredi: 99999 });
    for (let i = 0; i < full.inv.size; i++) full.inv.slots[i] = { item: 'item:odun_kömürü', count: 64 };
    const o = vendorStock(full.ctx.seed, 0, 'kerem')[0];
    expect(buyFrom(full.ctx, 'kerem', o.item, 1)).toMatchObject({ ok: false, reason: 'dolu' });
    expect(full.city.kredi).toBe(99999);
    // bağlı eşya reddedilir
    const b = makeCtx({ kredi: 9999, isBound: (i) => i === o.item });
    expect(buyFrom(b.ctx, 'kerem', o.item, 1)).toMatchObject({ ok: false, reason: 'bagli' });
    const view = vendorView(b.ctx, 'kerem', null);
    expect(view.offers.find((x) => x.item === o.item)).toMatchObject({ canBuy: false, carry: 'city' });
  });

  it('bugünün stokunda olmayan eşya satın alınamaz (başka günün/satıcının teklifi)', () => {
    const { ctx } = makeCtx({ kredi: 99999 });
    const today = new Set(vendorStock(ctx.seed, 0, 'ece').map((o) => o.item));
    const other = poolItems(getVendor('ece').pool).find((i) => !today.has(i));
    expect(buyFrom(ctx, 'ece', other, 1)).toMatchObject({ ok: false, reason: 'yok' });
  });

  it('günlük genel sınır: tech malzeme tüm satıcılar toplamı ≤16/gün', () => {
    const { ctx, inv } = makeCtx({ kredi: 1e7 });
    // bakır_tel'i stoklu her satıcıdan alabildiğin kadar al
    let total = 0;
    VENDORS.forEach((v) => {
      const o = vendorStock(ctx.seed, ctx.dayN, v.id).find((x) => x.item === 'item:bakır_tel');
      if (!o) return;
      for (let i = 0; i < 40; i++) {
        const r = buyFrom(ctx, v.id, 'item:bakır_tel', 1);
        if (!r.ok) break;
        total += 1;
      }
    });
    expect(total).toBeLessThanOrEqual(16);
    expect(inv.count('item:bakır_tel')).toBe(total);
    // her gün için 20 tohum: asla 16'yı aşmaz
    for (let seed = 1; seed <= 20; seed++) {
      const k = makeCtx({ kredi: 1e7, seed, dayN: seed });
      let n = 0;
      VENDORS.forEach((v) => {
        for (let i = 0; i < 30; i++) {
          if (!buyFrom(k.ctx, v.id, 'item:devre_kartı', 1).ok) break;
          n++;
        }
      });
      expect(n).toBeLessThanOrEqual(16);
    }
  });

  it('geri satış: yalnız satıcının havuzundaki, fiyatlı eşyalar; %40 türev fiyat; günlük satış sınırı; yetersiz eşya reddedilir', () => {
    const { ctx, city, inv } = makeCtx({ kredi: 0, items: [['item:elma', 40], ['item:tarayıcı', 1], ['item:kağıt', 3]] });
    expect(sellAccepted('usta_selvi', 'item:elma')).toBe(true);
    expect(sellAccepted('usta_selvi', 'item:tarayıcı')).toBe(false);
    expect(sellTo(ctx, 'usta_selvi', 'item:tarayıcı', 1)).toMatchObject({ ok: false, reason: 'kabul-yok' });
    expect(sellTo(ctx, 'usta_selvi', 'item:elma', 41)).toMatchObject({ ok: false });
    const price = sellPrice('item:elma');
    expect(price).toBeGreaterThanOrEqual(1);
    expect(price).toBeLessThan(buyPrice('usta_selvi', 'item:elma'));
    const r = sellTo(ctx, 'usta_selvi', 'item:elma', 10);
    expect(r).toMatchObject({ ok: true, n: 10, price: price * 10 });
    expect(city.kredi).toBe(price * 10);
    expect(inv.count('item:elma')).toBe(30);
    expect(sellTo(ctx, 'usta_selvi', 'item:elma', SELL_LIMIT - 10).ok).toBe(true);
    expect(sellTo(ctx, 'usta_selvi', 'item:elma', 1)).toMatchObject({ ok: false, reason: 'gunluk-sinir' });
    expect(sellTo(ctx, 'usta_selvi', 'item:yok', 1)).toMatchObject({ ok: false, reason: 'yok' });
    expect(sellTo(ctx, 'usta_selvi', 'item:elma', 0)).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(sellTo(makeCtx({ isBound: () => true }).ctx, 'usta_selvi', 'item:elma', 1)).toMatchObject({ ok: false, reason: 'bagli' });
  });

  it('görünüm düz JSON: teklifler, rozet, satılabilirler; Kredi yetersizse canBuy false + neden', () => {
    const { ctx } = makeCtx({ kredi: 1, items: [['item:elma', 5]] });
    const v = vendorView(ctx, 'usta_selvi', { name: 'Usta Selvi', title: 'Ramen ustası', brand: 'bulut_ramen' });
    expect(v.type).toBe('vendor');
    expect(v.carryNote).toBe('Ana diyara taşınır');
    expect(v.vendor).toEqual({
      id: 'usta_selvi', name: 'Usta Selvi', title: 'Ramen ustası', brand: 'bulut_ramen',
    });
    expect(v.offers).toHaveLength(STOCK_SIZE);
    v.offers.forEach((o) => {
      expect(o.carry).toBe('overworld');
      expect(typeof o.name).toBe('string');
      if (o.price > 1) expect(o).toMatchObject({ canBuy: false, why: 'Yeterli Kredin yok.' });
      expect(o.left).toBeGreaterThanOrEqual(0);
    });
    expect(v.sells.find((s) => s.item === 'item:elma')).toMatchObject({ count: 5, price: sellPrice('item:elma') });
    expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    expect(vendorView(ctx, 'yok', null)).toBe(null);
  });
});

describe('vendorLogic: dimBound eşya kuralları', () => {
  it('boyuta bağlı eşya (dimBoundOf) satılmaz, alınmaz; teklifte "Yalnız şehirde" (carry city); hiçbir havuz eşyası varsayılan olarak bağlı değil', () => {
    unregisterDimBound();
    Object.keys(OFFER_POOLS).forEach((p) => OFFER_POOLS[p].forEach((i) => expect(dimBoundOf(i), i).toBe(null)));
    const stock = vendorStock(123456, 0, 'hasan_amca');
    const target = stock[0].item;
    registerDimBound('neon', [target]);
    try {
      const { ctx, inv } = makeCtx({ kredi: 9999, items: [[target, 3]] });
      ctx.isBound = (i) => !!dimBoundOf(i);
      expect(buyFrom(ctx, 'hasan_amca', target, 1)).toMatchObject({ ok: false, reason: 'bagli' });
      expect(sellTo(ctx, 'hasan_amca', target, 1)).toMatchObject({ ok: false, reason: 'bagli' });
      expect(inv.count(target)).toBe(3);
      const v = vendorView(ctx, 'hasan_amca', null);
      expect(v.offers.find((o) => o.item === target)).toMatchObject({ carry: 'city', canBuy: false });
      expect(v.sells.find((s) => s.item === target)).toBeUndefined(); // bağlı eşya satış listesinde de görünmez
      const other = stock.find((o) => o.item !== target);
      expect(v.offers.find((o) => o.item === other.item).carry).toBe('overworld');
    } finally {
      unregisterDimBound();
    }
  });
});

describe('vendor: arbitraj yok (kapsamlı)', () => {
  it('her satıcı × her havuz eşyası: geri satış fiyatı alış fiyatından KESİN küçük (al-sat döngüsü zarar)', () => {
    let pairs = 0;
    VENDORS.forEach((v) => {
      poolItems(v.pool).forEach((item) => {
        const buy = buyPrice(v.id, item);
        expect(buy, v.id + item).toBeGreaterThanOrEqual(BASE_PRICE[item]);
        VENDORS.forEach((w) => {
          // her satıcıya satış (kabul ediyorsa) her satıcıdan alıştan küçük
          if (sellAccepted(w.id, item)) {
            expect(sellPrice(item), w.id + ' ← ' + v.id + ' ' + item).toBeLessThan(buy);
            pairs++;
          }
        });
      });
    });
    expect(pairs).toBeGreaterThan(1000);
  });

  it('simülasyon: 20 000 rastgele al/sat işlemi sonunda Kredi hiçbir zaman başlangıçtan fazla değil (tohum, gün, satıcı karışık)', () => {
    const rnd = mulberry32(8080);
    const { ctx, city, inv } = makeCtx({ kredi: 5000 });
    const start = city.kredi;
    let ops = 0;
    for (let i = 0; i < 20000; i++) {
      ctx.dayN = Math.floor(i / 400);
      rollDay(city, ctx.dayN);
      ctx.shop = shopOf(city);
      const v = VENDORS[Math.floor(rnd() * VENDORS.length)];
      const stock = vendorStock(ctx.seed, ctx.dayN, v.id);
      if (rnd() < 0.55) {
        const o = stock[Math.floor(rnd() * stock.length)];
        if (buyFrom(ctx, v.id, o.item, 1 + Math.floor(rnd() * 4)).ok) ops++;
      } else {
        const have = inv.list();
        if (have.length === 0) continue;
        const h = have[Math.floor(rnd() * have.length)];
        const item = h.item || h.key;
        if (sellTo(ctx, v.id, item, 1 + Math.floor(rnd() * 8)).ok) ops++;
      }
      expect(city.kredi).toBeLessThanOrEqual(start);
      expect(Number.isInteger(city.kredi)).toBe(true);
      expect(city.kredi).toBeGreaterThanOrEqual(0);
    }
    expect(ops).toBeGreaterThan(300);
  });

  it('tarif zinciri: hiçbir eşya, satın alınabilir/üretilebilir en ucuz maliyetinin ÜSTÜNDE geri satılamaz (üret-sat döngüsü zarar)', () => {
    let checked = 0;
    Object.keys(SELL_PRICE).forEach((item) => {
      const acq = acquisitionCost(item);
      if (acq !== Infinity) {
        expect(SELL_PRICE[item], item).toBeLessThan(acq);
        checked++;
      }
      expect(SELL_PRICE[item]).toBeLessThanOrEqual(Math.floor(BASE_PRICE[item] * 0.4));
      expect(SELL_PRICE[item]).toBeGreaterThanOrEqual(1);
    });
    expect(checked).toBeGreaterThan(40);
    // bağımsız yeniden hesap: tek geçişte her tarifte "girdi alış toplamı" ≥ çıktı geri satış (satın alınabilir girdiler için)
    let recipes = 0;
    RECIPES.forEach((r) => {
      const outKey = r.out.item;
      if (!SELL_PRICE[outKey]) return;
      let cost = 0;
      let ok = true;
      r.in.forEach((x) => {
        const c = acquisitionCost(x.item);
        if (c === Infinity) ok = false;
        else cost += c * x.count;
      });
      if (!ok) return;
      recipes++;
      expect(SELL_PRICE[outKey] * r.out.count, r.id).toBeLessThan(cost + 1e-9 + 1);
      expect(SELL_PRICE[outKey] * r.out.count, r.id).toBeLessThanOrEqual(Math.ceil(cost));
    });
    expect(recipes).toBeGreaterThan(5);
  });

  it('Kredi ↔ eşya yalnız: satıcı eşyaları jetona/başka para birimine çevrilmez (VendorView\'de yalnız Kredi alanları)', () => {
    const { ctx } = makeCtx();
    const v = vendorView(ctx, 'kerem', null);
    const text = JSON.stringify(v);
    expect(text).not.toMatch(/jeton/i);
    expect(Object.keys(v).sort()).toEqual(['carryNote', 'day', 'kredi', 'offers', 'sells', 'type', 'vendor']);
  });

  it('günlük sayaçlar bellekte sınırlı: 10 000 alımdan sonra shop kaydı sınır içinde ve JSON bayt < 10 KB', () => {
    const { ctx, city } = makeCtx({ kredi: 1e9 });
    for (let i = 0; i < 10000; i++) {
      const v = VENDORS[i % VENDORS.length];
      const stock = vendorStock(ctx.seed, ctx.dayN, v.id);
      buyFrom(ctx, v.id, stock[i % STOCK_SIZE].item, 1);
    }
    expect(JSON.stringify(city.shop).length).toBeLessThan(10000);
    expect(Object.keys(city.shop.s).length).toBeLessThanOrEqual(120);
    expect(emptyShop().d).toBe(0);
  });
});
