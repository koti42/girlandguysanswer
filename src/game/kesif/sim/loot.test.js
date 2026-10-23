import { describe, expect, it } from 'vitest';
import {
  LOOT_KINDS, LOOT_TABLE, STRUCT_THEME, ZONE_BASE_TOOL, allLootItems, guaranteedLoot, lootForChest, rarityWeights,
} from './loot.js';
import { itemByKey } from './items.js';
import { ZONES } from './constants.js';

const ZONE_N = ZONES.length;

describe('loot tabloları', () => {
  it('tablodaki her eşya items.js içinde var', () => {
    const items = allLootItems();
    expect(items.length).toBeGreaterThan(40);
    items.forEach((k) => expect(itemByKey(k), k).toBeTruthy());
    Object.keys(LOOT_TABLE).forEach((cls) => LOOT_TABLE[cls].forEach((e) => {
      expect(itemByKey(e.item), e.item).toBeTruthy();
      expect(e.min).toBeGreaterThanOrEqual(1);
      expect(e.max).toBeGreaterThanOrEqual(e.min);
      expect(e.max).toBeLessThanOrEqual(itemByKey(e.item).stack);
      expect(e.z0).toBeLessThanOrEqual(e.z1);
    }));
  });

  it('yapı temaları: mağara sandıkları cevher, harabe taş/kitap, kamp yemek/meşale ağırlıklı', () => {
    const count = (type, zone, kind, re) => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const l = lootForChest(11, { x: i * 3, y: 40, z: i * 5 }, { structType: type, zone, tier: 2, kind, index: 1 });
        n += l.filter((s) => re.test(s.item)).length;
      }
      return n;
    };
    const ore = /ham_|kızıltaş|ametist|kömür/;
    expect(count('gizlimagara', 1, 'gizli', ore)).toBeGreaterThan(count('harabe', 1, 'sandık', ore) * 1.5);
    expect(count('harabe', 1, 'sandık', /taş_tuğla|sütun|kitap/)).toBeGreaterThan(count('kamp', 1, 'kamp', /taş_tuğla|sütun|kitap/));
    expect(count('kamp', 1, 'kamp', /pişmiş|meşale|çilek/)).toBeGreaterThan(count('gizlimagara', 1, 'gizli', /pişmiş|meşale|çilek/) * 0.8);
    // tema tabloları geçerli eşyalar
    Object.keys(STRUCT_THEME).forEach((k) => STRUCT_THEME[k].forEach((e) => expect(itemByKey(e.item), e.item).toBeTruthy()));
  });

  it('belirlenimli: aynı (seed, konum, bağlam) → aynı liste; konum/seed değişince değişir', () => {
    const ctx = { structType: 'turbe', zone: 2, tier: 3, kind: 'ödül', index: 0 };
    const a = lootForChest(777, { x: 10, y: 50, z: -20 }, ctx);
    const b = lootForChest(777, { x: 10, y: 50, z: -20 }, ctx);
    expect(a).toEqual(b);
    let differ = 0;
    for (let i = 0; i < 20; i++) {
      const c = lootForChest(777, { x: 10 + i + 1, y: 50, z: -20 }, ctx);
      if (JSON.stringify(c) !== JSON.stringify(a)) differ++;
    }
    expect(differ).toBeGreaterThan(15);
    expect(JSON.stringify(lootForChest(778, { x: 10, y: 50, z: -20 }, ctx))).not.toBe(JSON.stringify(a));
  });

  it('çıktı geçerli: eşya anahtarları, adetler yığın sınırında, tekrarsız, ≤ 27 yuva', () => {
    LOOT_KINDS.forEach((kind) => {
      for (let zone = 0; zone < ZONE_N; zone++) {
        for (let i = 0; i < 25; i++) {
          const l = lootForChest(31 + zone, { x: i * 7, y: 40 + zone, z: i * 3 }, {
            structType: 'harabe', zone, tier: 1 + (i % 5), kind, index: i % 3, parkourTier: 1 + (i % 5),
          });
          expect(l.length).toBeGreaterThan(0);
          expect(l.length).toBeLessThanOrEqual(27);
          const seen = new Set();
          l.forEach((s) => {
            const it = itemByKey(s.item);
            expect(it, s.item).toBeTruthy();
            expect(s.count).toBeGreaterThanOrEqual(1);
            expect(s.count).toBeLessThanOrEqual(it.stack);
            expect(seen.has(s.item)).toBe(false);
            seen.add(s.item);
          });
        }
      }
    });
  });

  it('erken yapılarda ilerleme için kritik eşyalar GARANTİ: meşale + yemek (+ bölge aleti)', () => {
    for (let i = 0; i < 40; i++) {
      const pos = { x: i * 13, y: 60, z: i * -5 };
      const camp = lootForChest(5, pos, { structType: 'kamp', zone: 0, tier: 1, kind: 'kamp', index: 0 });
      expect(camp.some((s) => s.item === 'blok:meşale')).toBe(true);
      expect(camp.some((s) => s.item === 'item:elma')).toBe(true);
      expect(camp.some((s) => s.item === 'item:kazma_ahşap')).toBe(true);
      expect(camp.some((s) => s.item === 'item:balta_ahşap')).toBe(true);
      const reward = lootForChest(5, pos, { structType: 'anahtartapinagi', zone: 0, tier: 1, kind: 'ödül', index: 0 });
      expect(reward.some((s) => s.item === 'blok:meşale')).toBe(true);
      expect(reward.some((s) => s.item === 'item:kazma_taş')).toBe(true);
      const z1 = lootForChest(5, pos, { structType: 'turbe', zone: 1, tier: 2, kind: 'ödül', index: 0 });
      expect(z1.some((s) => s.item === 'item:kazma_bakır')).toBe(true);
      expect(z1.some((s) => s.item === 'blok:meşale')).toBe(true);
    }
    for (let zone = 0; zone < ZONE_N; zone++) {
      const g = guaranteedLoot({ structType: 'turbe', zone, kind: 'ödül', index: 0 });
      expect(g.some((s) => s.item === 'item:kazma_' + ZONE_BASE_TOOL[zone])).toBe(true);
    }
    // ilk olmayan sandıkta alet garantisi yok; parkur/boss sandıklarında garanti listesi yok
    expect(guaranteedLoot({ structType: 'turbe', zone: 2, kind: 'sandık', index: 1 }).some((s) => s.item.indexOf('kazma') >= 0)).toBe(false);
    expect(guaranteedLoot({ structType: 'parkur', zone: 0, kind: 'parkur', index: 0 })).toEqual([]);
  });

  it('başlangıç kampı bayrağı: hangi bölgede olursa olsun ahşap alet + meşale + yemek garantili', () => {
    for (let zone = 0; zone <= 2; zone++) {
      const l = lootForChest(4, { x: 1, y: 60, z: 2 }, { structType: 'kamp', zone, tier: 1, kind: 'kamp', index: 0, starter: true });
      expect(l.some((s) => s.item === 'item:kazma_ahşap')).toBe(true);
      expect(l.some((s) => s.item === 'item:balta_ahşap')).toBe(true);
      expect(l.some((s) => s.item === 'blok:meşale')).toBe(true);
      expect(l.some((s) => s.item === 'item:elma')).toBe(true);
    }
  });

  it('seyreklik bölgeye ve türe göre kayar: boss/ödül sandığı daha değerli, ileri bölge daha nadir', () => {
    const w0 = rarityWeights(0, 1, 'sandık');
    const w4 = rarityWeights(4, 5, 'sandık');
    const wb = rarityWeights(2, 3, 'boss');
    expect(w4[2]).toBeGreaterThan(w0[2]);
    expect(w4[3]).toBeGreaterThan(w0[3]);
    expect(w4[0]).toBeLessThan(w0[0]);
    expect(wb[2]).toBeGreaterThan(rarityWeights(2, 3, 'sandık')[2]);
    // istatistik: z0 sandıklarında kuantum eşyası YOK, z4'te ışın tüfeği/kuantum görülebilir
    let q0 = 0;
    let q4 = 0;
    for (let i = 0; i < 300; i++) {
      const a = lootForChest(9, { x: i, y: 50, z: i * 2 }, { zone: 0, tier: 1, kind: 'sandık' });
      const b = lootForChest(9, { x: i, y: 50, z: i * 2 }, { zone: 4, tier: 5, kind: 'boss' });
      q0 += a.filter((s) => /kuantum/.test(s.item)).length;
      q4 += b.filter((s) => /kuantum/.test(s.item)).length;
    }
    expect(q0).toBe(0);
    expect(q4).toBeGreaterThan(20);
  });

  it('bölge aletleri tutarlı: z0 sandığında demir/elmas alet yok; z3 sandığında ahşap alet yok', () => {
    for (let i = 0; i < 200; i++) {
      const a = lootForChest(3, { x: i * 5, y: 50, z: i }, { zone: 0, tier: 1, kind: 'ödül', index: 1 });
      expect(a.some((s) => /_(demir|elmas|kuantum|altın)$/.test(s.item))).toBe(false);
      const b = lootForChest(3, { x: i * 5, y: 50, z: i }, { zone: 3, tier: 4, kind: 'ödül', index: 1 });
      expect(b.some((s) => /_(ahşap)$/.test(s.item))).toBe(false);
    }
  });

  it('parkur sandığı yıldız içerir (kademe kadar)', () => {
    for (let t = 1; t <= 5; t++) {
      const l = lootForChest(2, { x: t, y: 80, z: t }, { structType: 'parkur', zone: 2, tier: 3, kind: 'parkur', parkourTier: t });
      const star = l.find((s) => s.item === 'item:yıldız');
      expect(star).toBeTruthy();
      expect(star.count).toBe(t);
    }
  });

  it('geçersiz bağlam çökmez ve makul varsayılan verir', () => {
    expect(lootForChest(1, { x: 0, y: 0, z: 0 }).length).toBeGreaterThan(0);
    expect(lootForChest('metin-seed', { x: 1.5, y: 2.5, z: 3.5 }, { zone: 99, tier: 99, kind: 'yok' }).length).toBeGreaterThan(0);
    expect(lootForChest(1, { x: 0, y: 0, z: 0 }, { zone: -3 }).length).toBeGreaterThan(0);
  });
});
