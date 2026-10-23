import { describe, expect, it } from 'vitest';
import {
  FLAG_LIMITS, NPC_LIMITS, SHOP_LIMITS, START_KREDI, bumpRel, createWallet, emptyShop, getFlag, markOnce, noteTalk, nodeCount, npcRel, npcVisits, rollDay,
  sanitizeFlags, sanitizeNpcSave, sanitizeNpcs, sanitizeShop, setFlag, shopOf,
} from './npcSave.js';
import { mulberry32 } from '../../rng.js';

describe('npcSave: bayraklar', () => {
  it('sanitizeFlags: geçerli anahtarlar, aralıklar, prototip güvenliği, 200 sınırı', () => {
    const raw = JSON.parse('{"q_a":2,"b":true,"c":0,"d":-5,"e":99999,"F":1,"ab-c":1,"__proto__":{"x":1},"constructor":3,"toString":2,"g":"7","h":1.9}');
    const out = sanitizeFlags(raw);
    expect(out).toEqual({ q_a: 2, b: 1, e: 9999, h: 1 });
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.x).toBeUndefined();
    const many = {};
    for (let i = 0; i < 400; i++) many['k' + i] = 1;
    expect(Object.keys(sanitizeFlags(many))).toHaveLength(FLAG_LIMITS.keys);
    expect(sanitizeFlags(null)).toEqual({});
    expect(sanitizeFlags([1, 2])).toEqual({});
    expect(sanitizeFlags('x')).toEqual({});
  });

  it('getFlag/setFlag: yaz, oku, sil, sınır, kötü anahtar', () => {
    const city = {};
    expect(getFlag(city, 'a')).toBe(0);
    expect(setFlag(city, 'a', true)).toBe(true);
    expect(getFlag(city, 'a')).toBe(1);
    expect(setFlag(city, 'a', 7)).toBe(true);
    expect(getFlag(city, 'a')).toBe(7);
    expect(setFlag(city, 'a', 0)).toBe(true);
    expect(getFlag(city, 'a')).toBe(0);
    expect(city.flags).toEqual({});
    expect(setFlag(city, '__proto__', 1)).toBe(false);
    expect(setFlag(city, 'A', 1)).toBe(false);
    expect(setFlag(city, 'x', NaN)).toBe(true);
    expect(getFlag(city, 'x')).toBe(0);
    expect(setFlag(null, 'a', 1)).toBe(false);
    for (let i = 0; i < FLAG_LIMITS.keys; i++) expect(setFlag(city, 'k' + i, 1)).toBe(true);
    expect(setFlag(city, 'yeni', 1)).toBe(false);
    expect(setFlag(city, 'k5', 3)).toBe(true); // mevcut anahtar güncellenir
    expect(getFlag(city, 'k5')).toBe(3);
    expect(getFlag({ flags: { a: NaN } }, 'a')).toBe(0);
  });
});

describe('npcSave: NPC ilişki/ziyaret', () => {
  it('sanitizeNpcs: sınırlar, kötü kimlik/düğüm anahtarı, proto', () => {
    const raw = JSON.parse('{"kerem":{"r":99,"v":5000,"d":3,"s":{"kerem.root":2,"A":1,"__proto__":1,"x.y":-1}},"__proto__":{"r":1},"Bad":{"r":1},"x":5,"y":{"r":-3,"s":7}}');
    const out = sanitizeNpcs(raw);
    expect(out.kerem).toEqual({ r: NPC_LIMITS.rel, v: NPC_LIMITS.visits, d: 3, s: { 'kerem.root': 2 } });
    expect(out.y).toEqual({ r: 0, v: 0, d: 0, s: {} });
    expect(Object.keys(out).sort()).toEqual(['kerem', 'y']);
    const many = {};
    for (let i = 0; i < 500; i++) many['n' + i] = { r: 1 };
    expect(Object.keys(sanitizeNpcs(many))).toHaveLength(NPC_LIMITS.npcs);
    const nodes = { s: {} };
    for (let i = 0; i < 80; i++) nodes.s['n' + i] = 1;
    expect(Object.keys(sanitizeNpcs({ a: nodes }).a.s)).toHaveLength(NPC_LIMITS.nodes);
  });

  it('noteTalk: ilk ziyaret, günde bir kez ilişki +1, 9 tavan, düğüm sayacı; bumpRel; markOnce', () => {
    const city = {};
    let r = noteTalk(city, 'kerem', 0, null);
    expect(r).toMatchObject({ first: true, visits: 1, dayFirst: true });
    expect(npcRel(city, 'kerem')).toBe(1);
    r = noteTalk(city, 'kerem', 0, 'kerem.root');
    expect(r).toMatchObject({ first: false, visits: 2, dayFirst: false });
    expect(npcRel(city, 'kerem')).toBe(1);
    expect(nodeCount(city, 'kerem', 'kerem.root')).toBe(1);
    for (let d = 1; d < 30; d++) noteTalk(city, 'kerem', d, null);
    expect(npcRel(city, 'kerem')).toBe(NPC_LIMITS.rel);
    expect(npcVisits(city, 'kerem')).toBe(31);
    expect(bumpRel(city, 'kerem', -2)).toBe(NPC_LIMITS.rel - 2);
    expect(bumpRel(city, 'kerem', 2)).toBe(NPC_LIMITS.rel);
    expect(bumpRel(city, '__proto__', 1)).toBe(0);
    expect(markOnce(city, 'kerem', 'kerem.gift')).toBe(true);
    expect(nodeCount(city, 'kerem', 'kerem.gift')).toBe(1);
    expect(noteTalk(city, 'Bad', 0, null)).toMatchObject({ first: false, visits: 0 });
    expect(npcRel({}, 'x')).toBe(0);
  });

  it('300 NPC sınırı: 301. NPC için kayıt açılmaz', () => {
    const city = {};
    for (let i = 0; i < NPC_LIMITS.npcs; i++) noteTalk(city, 'n' + i, 0, null);
    expect(Object.keys(city.npcs)).toHaveLength(NPC_LIMITS.npcs);
    expect(noteTalk(city, 'extra', 0, null).visits).toBe(0);
    expect(city.npcs.extra).toBeUndefined();
  });
});

describe('npcSave: dükkân kaydı', () => {
  it('sanitizeShop: sınırlar ve temiz alanlar; bozuk girdi boş dükkâna döner', () => {
    const s = sanitizeShop({
      d: 12.7, t: 55.5, kg: 9999, s: { 'kerem|item:elma': 3, 'Bad|item:elma': 1, 'kerem|elma': 1, 'kerem|item:x': -3 }, g: { 'item:elma': 5, bad: 1 }, k: { 'blok:cam': 2 },
    });
    expect(s).toEqual({
      d: 12, s: { 'kerem|item:elma': 3 }, g: { 'item:elma': 5 }, k: { 'blok:cam': 2 }, t: 55.5, kg: SHOP_LIMITS.creditGift,
    });
    expect(sanitizeShop(null)).toEqual(emptyShop());
    expect(sanitizeShop({ t: NaN, d: 'x', kg: -3 })).toEqual(emptyShop());
    expect(sanitizeShop({ s: JSON.parse('{"__proto__":5}') }).s).toEqual({});
  });

  it('shopOf onarır; rollDay günlük sayaçları yalnız gün değişince sıfırlar', () => {
    const city = { shop: { d: 1, s: { 'kerem|item:elma': 2 }, g: { 'item:elma': 2 }, k: { 'item:elma': 1 }, t: 10, kg: 40 } };
    expect(rollDay(city, 1)).toBe(false);
    expect(city.shop.s['kerem|item:elma']).toBe(2);
    expect(rollDay(city, 2)).toBe(true);
    expect(city.shop).toMatchObject({ d: 2, s: {}, g: {}, k: {}, kg: 0, t: 10 });
    const broken = { shop: { s: 5, g: null, t: 'x', d: 1.5, kg: NaN } };
    const s = shopOf(broken);
    expect(s.s).toEqual({});
    expect(s.g).toEqual({});
    expect(s.t).toBe(0);
    expect(s.d).toBe(0);
    expect(s.kg).toBe(0);
    expect(shopOf(null)).toBe(null);
  });

  it('sanitizeNpcSave: üç alanı da temiz döndürür (sınır/proto/fuzz)', () => {
    const rnd = mulberry32(7);
    const junk = () => [null, 5, 'x', NaN, [], {}, true, JSON.parse('{"__proto__":{"a":1}}'), { r: 1 }, { d: 1e12 }][Math.floor(rnd() * 10)];
    for (let i = 0; i < 400; i++) {
      const raw = { flags: junk(), npcs: junk(), shop: junk() };
      if (rnd() < 0.5) raw.npcs = { kerem: junk(), 'a b': junk() };
      const o = sanitizeNpcSave(raw);
      expect(Object.keys(o).sort()).toEqual(['flags', 'npcs', 'shop']);
      expect(JSON.parse(JSON.stringify(o))).toEqual(o);
    }
    expect(sanitizeNpcSave(null)).toEqual({ flags: {}, npcs: {}, shop: emptyShop() });
  });
});

describe('npcSave: ASCII kayıt anahtarı', () => {
  it('foldKey Türkçe harfleri katlar; katlanmış anahtarlar sanitizeShop içinden geçer ve itemByKey ile geri çözülür', async () => {
    const { foldKey: fk } = await import('./npcSave.js');
    const { itemByKey } = await import('../../items.js');
    expect(fk('item:bakır_tel')).toBe('item:bakir_tel');
    expect(fk('blok:neon_camgöbeği')).toBe('blok:neon_camgobegi');
    expect(itemByKey(fk('item:enerji_hücresi')).key).toBe('item:enerji_hücresi');
    const shop = sanitizeShop({ g: { [fk('item:bakır_tel')]: 3, 'item:bakır_tel': 2 }, s: { ['kerem|' + fk('blok:neon_camgöbeği')]: 1 } });
    expect(shop.g).toEqual({ 'item:bakir_tel': 3 }); // katlanmamış (Türkçe harfli) anahtar atılır
    expect(Object.keys(shop.s)).toEqual(['kerem|blok:neon_camgobegi']);
  });
});

describe('npcSave: cüzdan', () => {
  it('Kredi tamsayı yoksa 100 başlar; harca/ekle olay yayar; yetersiz reddedilir; geçersiz n reddedilir', () => {
    const city = {};
    const ev = [];
    const w = createWallet(() => city, (e) => ev.push(e));
    expect(w.get()).toBe(START_KREDI);
    expect(w.spend(30, 'x')).toBe(true);
    expect(city.kredi).toBe(70);
    expect(ev[0]).toEqual({ type: 'kredi', value: 70, delta: -30, why: 'x' });
    expect(w.spend(71)).toBe(false);
    expect(w.spend(-1)).toBe(false);
    expect(w.spend(1.5)).toBe(false);
    expect(w.add(5, 'y')).toBe(true);
    expect(ev[1]).toEqual({ type: 'kredi', value: 75, delta: 5, why: 'y' });
    expect(w.add(0)).toBe(false);
    expect(w.add(NaN)).toBe(false);
    city.kredi = NaN;
    expect(w.get()).toBe(START_KREDI);
    expect(createWallet(() => null).get()).toBe(0);
    expect(createWallet(() => null).spend(1)).toBe(false);
    expect(createWallet(() => null).add(1)).toBe(false);
    expect(createWallet(() => ({}), null, 5).get()).toBe(5);
  });
});
