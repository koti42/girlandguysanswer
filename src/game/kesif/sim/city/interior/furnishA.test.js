/* interiors_a ortak yardımcıları (furnishA.js) birim testleri — sahte çerçeve/builder ile. */
import { describe, expect, it } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { PALETTES } from './kit.js';
import { planInterior, setInteriorStrict } from './index.js';
import { interiorLots } from './testKit.js';
import {
  MAX_KEYS, MAX_PROPS, NO_LOCK, capKeys, facing, linkLocks, lockOf, mkPal, packCode, trimProps, twoPass, usableRect,
} from './furnishA.js';
import { getCatalogDef } from '../../props/propCatalog.js';

describe('furnishA — küçük yardımcılar', () => {
  it('mkPal: donmuş, tüm alanlar var, bilinmeyen taban → varsayılan; üzerine yazma çalışır', () => {
    const p = mkPal('mor', { floor: 7 });
    expect(Object.isFrozen(p)).toBe(true);
    expect(p.floor).toBe(7);
    expect(p.wall).toBe(PALETTES.mor.wall);
    ['floor', 'floor2', 'wall', 'wall2', 'ceil', 'trim', 'glow', 'glow2', 'cloth', 'cloth2', 'glass'].forEach((k) => expect(Number.isInteger(p[k])).toBe(true));
    expect(mkPal('olmayan').wall).toBe(PALETTES.default.wall);
    expect(mkPal('__proto__').wall).toBe(PALETTES.default.wall);
  });

  it('usableRect: engelsizde tam çerçeve; engelde arka kırpılır (1 duvar hücresi), en yakın engele göre', () => {
    expect(usableRect({ W: 16, D: 12, obstacles: [] })).toEqual([0, 0, 16, 12]);
    expect(usableRect({ W: 16, D: 12, obstacles: [{ v0: 10 }] })).toEqual([0, 0, 16, 9]);
    expect(usableRect({ W: 16, D: 12, obstacles: [{ v0: 10 }, { v0: 8 }] })).toEqual([0, 0, 16, 7]);
    expect(usableRect({ W: 9, D: 9, obstacles: [{ v0: 0 }] })).toEqual([0, 0, 9, 0]);
  });

  it('facing: dört ana yön', () => {
    expect(facing(0, 0, 0, 5)).toBe(0);
    expect(facing(0, 0, 5, 1)).toBe(1);
    expect(facing(0, 5, 0, 0)).toBe(2);
    expect(facing(5, 0, 0, 1)).toBe(3);
    expect(facing(2, 2, 2, 2)).toBe(0);
  });

  it('lockOf: DIM_ID_RE uyumlu, parsel/sıra başına benzersiz, belirlenimci', () => {
    const seen = new Set();
    for (let lot = 0; lot < 3000; lot += 7) {
      for (let n = 0; n < 4; n++) {
        const l = lockOf(lot, n, 'kod', 1, { code: [1] });
        expect(l.id).toMatch(/^[0-9a-z]{1,10}$/);
        expect(seen.has(l.id)).toBe(false);
        seen.add(l.id);
        expect(lockOf(lot, n, 'kod', 1).id).toBe(l.id);
      }
    }
    expect(lockOf(1, 0, 'serbest', 0).data).toEqual({});
  });
});

describe('furnishA — prop bütçesi', () => {
  const KEYS = ['masa', 'sandalye', 'kanepe', 'dolap', 'yatak', 'puf', 'kitaplik', 'raf_unitesi', 'saksi_buyuk', 'akvaryum', 'hali', 'heykel', 'tuval', 'cerceve', 'koltuk', 'tabure', 'alcak_masa', 'buzdolabi'];
  function fakeInterior() {
    const props = [];
    let slot = 64;
    for (let i = 0; i < 60; i++) props.push({ kind: KEYS[i % KEYS.length], x: i, y: 64, z: 0, yaw: 0, variant: 0, lotId: 1, slot: slot++ });
    props.push({ kind: 'kapi', x: 0, y: 64, z: 0, yaw: 0, variant: 0, lotId: 1, slot: slot++ });
    props.push({ kind: 'kod_paneli', x: 0, y: 65, z: 0, yaw: 0, variant: 0, lotId: 1, slot: slot++ });
    return { props };
  }

  it('trimProps: ≤ MAX_PROPS ve ≤ MAX_KEYS; çekirdek anahtarlar, kapı/kilit ve korumalı slotlar kalır', () => {
    const it = fakeInterior();
    const protect = it.props[3].slot;
    trimProps(it, ['masa', 'kanepe', 'yatak'], [protect]);
    const keys = new Set(it.props.map((p) => p.kind));
    expect(it.props.length).toBeLessThanOrEqual(MAX_PROPS);
    expect(keys.size).toBeLessThanOrEqual(MAX_KEYS);
    ['masa', 'kanepe', 'yatak', 'kapi', 'kod_paneli'].forEach((k) => expect(keys.has(k), k).toBe(true));
    expect(it.props.some((p) => p.slot === protect)).toBe(true);
    // belirlenimci
    const it2 = fakeInterior();
    trimProps(it2, ['masa', 'kanepe', 'yatak'], [protect]);
    expect(it2.props.map((p) => p.slot)).toEqual(it.props.map((p) => p.slot));
  });

  it('trimProps: bütçe içindeyse dokunmaz', () => {
    const it = { props: fakeInterior().props.slice(0, 10) };
    const before = it.props.map((p) => p.slot);
    trimProps(it, [], []);
    expect(it.props.map((p) => p.slot)).toEqual(before);
  });

  it('capKeys: yeni anahtar sınırı aşınca null; çekirdek, cerceve ve kapı/kilit serbest; toplam sınır', () => {
    const placed = [];
    const b = {
      prop(key) { placed.push(key); return { kind: key }; },
      wallProp(key) { placed.push(key); return { kind: key }; },
    };
    capKeys(b, 3, 5, ['yatak']);
    expect(b.prop('masa')).not.toBeNull();
    expect(b.prop('sandalye')).not.toBeNull();
    expect(b.prop('kanepe')).not.toBeNull();
    expect(b.prop('dolap')).toBeNull(); // 4. yeni anahtar
    expect(b.prop('masa')).not.toBeNull(); // var olan anahtar serbest
    expect(b.prop('yatak')).not.toBeNull(); // çekirdek
    expect(b.wallProp('cerceve', 0, 0, 0)).toBeNull(); // toplam sınır 5'e ulaştı
    expect(b.prop('kapi')).not.toBeNull(); // kapı her zaman
    expect(b.wallProp('kod_paneli')).not.toBeNull(); // kilit düzeneği her zaman
    expect(getCatalogDef('kapi')).not.toBeNull();
  });

  it('linkLocks: kilit düzeneği slotu, ipucu notuna kod paketi + clues kaydı; süs kod notu NO_LOCK (0)', () => {
    const it = {
      doors: [{ id: 'd', x: 10, z: 10 }],
      props: [
        { kind: 'kod_paneli', x: 10.5, y: 65, z: 11.5, slot: 70 },
        { kind: 'kod_notu', x: 3, y: 65, z: 3, slot: 71 },
        { kind: 'kod_notu', x: 4, y: 65, z: 4, slot: 72 },
      ],
      locks: [{ id: 'l', kind: 'kod', door: 'd', data: { code: [1, 6, 3, 2], digits: 4 }, clue: { type: 'prop', room: 'a', slot: 71 } }],
    };
    linkLocks(it);
    expect(it.locks[0].pad).toBe(70);
    expect(it.props[0].data).toBeUndefined();
    expect(it.props[1].data).toBe(packCode([1, 6, 3, 2]));
    expect(it.props[2].data).toBe(NO_LOCK);
    expect(it.clues).toEqual([{ lockId: 'l', slot: 71, room: 'a', x: 3, y: 65, z: 3 }]);
    // packCode: basamak başına 3 bit, uzunluk << 12
    expect(packCode([1, 2, 3])).toBe((3 << 12) | 1 | (2 << 3) | (3 << 6));
  });
});

describe('furnishA — twoPass', () => {
  it('koruma kapalı sonuç yeterliyse tek geçiş; yetersizse (başlangıç tıkalı) aynı tohumla koruma AÇIK ikinci geçiş', () => {
    setInteriorStrict(true);
    const { lot, bp } = interiorLots(citySeed(1), { kinds: ['kapsul_daire'], limit: 1 })[0];
    const good = planInterior(bp, lot);
    const ctx = { seed: citySeed(1), bp };
    let calls = [];
    let r = twoPass(ctx, { tag: 'rng' }, (rng, guard) => { calls.push(guard); return good; });
    expect(r).toBe(good);
    expect(calls).toEqual([false]);
    const broken = Object.assign({}, good, { streetInside: { x: good.streetInside.x + 50, z: good.streetInside.z } });
    calls = [];
    const rngs = [];
    r = twoPass(ctx, { tag: 'rng' }, (rng, guard) => { calls.push(guard); rngs.push(rng); return guard ? good : broken; });
    expect(r).toBe(good);
    expect(calls).toEqual([false, true]);
    // ikinci geçiş taze akış alır; aynı girdiyle aynı değerleri üretir (belirlenimci)
    const again = [];
    twoPass(ctx, { tag: 'rng' }, (rng, guard) => { again.push(guard ? [rng.f(), rng.f()] : null); return guard ? good : broken; });
    expect(again[1]).toEqual([rngs[1].f(), rngs[1].f()]);
  });
});
