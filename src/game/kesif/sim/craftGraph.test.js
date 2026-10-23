import { describe, expect, it } from 'vitest';
import {
  CREATIVE_ONLY, NATURAL_BLOCK_KEYS, SPECIAL_ITEMS, deadRecipes, findProfitLoops, naturalBlockIds, obtainability, rawSources,
  recipeOrphans, stationItem,
} from './craftGraph.js';
import {
  ITEMS, ITEM_LIST, RECIPES, STATIONS, STATION_BLOCKS, getRecipe, itemByKey, recipesProducing,
} from './items.js';
import { BLOCKS, B, blockByKey } from './blocks.js';
import { CRAFT_BLOCK_DEFS, CRAFT_BLOCK_IDS, CRAFT_RECIPES } from './craftData.js';
import { MAX_BLOCK_ID } from './constants.js';
import { TECH_ITEM_DEFS } from './techData.js';
import { biomeAt, generateChunk } from './worldgen.js';

describe('edinilebilirlik grafiği', () => {
  const { via, unobtainable } = obtainability();

  it('her eşya oyunda edinilebilir (yaratıcı-yalnız liste dışında)', () => {
    const orphans = unobtainable.filter((k) => CREATIVE_ONLY.indexOf(k) < 0);
    expect(orphans).toEqual([]);
  });

  it('yaratıcı-yalnız liste dürüst ve dar: gerçekten edinilemeyenler, kısa liste', () => {
    expect(CREATIVE_ONLY.length).toBeLessThanOrEqual(15);
    CREATIVE_ONLY.forEach((k) => {
      expect(itemByKey(k), k).toBeTruthy();
      expect(via.has(k), k + ' aslında edinilebiliyor: listeden çıkar').toBe(false);
    });
  });

  it('hiçbir tarif ölü değil: tüm girdiler ve istasyon blokları edinilebilir, ocak için yakıt var', () => {
    expect(deadRecipes()).toEqual([]);
  });

  it('tarifi ve ham kaynağı olmayan yapı/dekor blok eşyası yok', () => {
    expect(recipeOrphans()).toEqual([]);
  });

  it('kârlı tek-girdili dönüşüm döngüsü yok (sıkıştır/aç dahil)', () => {
    expect(findProfitLoops()).toEqual([]);
  });

  it('ham kaynak listesi gerçek eşyalardan oluşur', () => {
    rawSources().forEach((hows, item) => {
      expect(itemByKey(item), item).toBeTruthy();
      expect(hows.length).toBeGreaterThan(0);
    });
    SPECIAL_ITEMS.forEach((k) => expect(itemByKey(k), k).toBeTruthy());
    NATURAL_BLOCK_KEYS.forEach((k) => expect(blockByKey(k), k).toBeTruthy());
  });

  it('erken oyun zinciri sığ: kütük → tahta → tezgah → sandık/ocak/kazma', () => {
    const d = (k) => via.get(k).depth;
    expect(d('blok:meşe_kütük')).toBe(0);
    expect(d('blok:meşe_tahta')).toBeLessThanOrEqual(1);
    expect(d('item:sopa')).toBeLessThanOrEqual(2);
    expect(d('blok:tezgah')).toBeLessThanOrEqual(2);
    // elle üretim zinciri tezgah gerektirmez: kütük → tahta → sopa/tezgah hep 'el'
    ['tahta_meşe', 'sopa', 'tezgah'].forEach((id) => expect(getRecipe(id).station).toBe('el'));
    expect(d('blok:sandık')).toBeLessThanOrEqual(3);
    expect(d('blok:ocak')).toBeLessThanOrEqual(3);
    expect(d('blok:meşale')).toBeLessThanOrEqual(3);
    expect(d('item:kazma_ahşap')).toBeLessThanOrEqual(3);
    expect(d('blok:taş_kesici')).toBeLessThanOrEqual(6);
    expect(d('blok:dokuma_tezgahı')).toBeLessThanOrEqual(5);
  });

  it('her tahta türü: tahta, basamak, plaka, kütük yolu var', () => {
    ['meşe', 'huş', 'çam', 'akasya'].forEach((w) => {
      ['_tahta', '_basamak', '_plaka'].forEach((s) => {
        expect(via.has('blok:' + w + s), w + s).toBe(true);
      });
      expect(recipesProducing('blok:' + w + '_tahta').length, w).toBeGreaterThan(0);
    });
  });

  it('istasyon blokları: her istasyonun bloğu edinilebilir ve tarifi var', () => {
    STATIONS.filter((s) => s !== 'el').forEach((s) => {
      const k = stationItem(s);
      expect(k, s).toBeTruthy();
      expect(via.has(k), s).toBe(true);
      expect(STATION_BLOCKS[s].length).toBeGreaterThan(0);
    });
    expect(recipesProducing('blok:taş_kesici').length).toBe(1);
    expect(recipesProducing('blok:dokuma_tezgahı').length).toBe(1);
    expect(getRecipe('taş_kesici').station).toBe('tezgah');
  });

  // Örnekleme AŞAMALARA bölünür (her biri ayrı test): tek senkron 40 sn+ blok yüklü makinede vitest işçisinin RPC'sini açlığa uğratırdı.
  const seen = new Set();
  const addAll = (b) => { for (let i = 0; i < b.length; i++) if (b[i]) seen.add(b[i]); };

  it.each([1, 7])('dünya üretimi örneklemesi (a): yüzey bandı ızgarası, tohum %i', (seed) => {
    for (let cx = -44; cx <= 44; cx += 3) {
      for (let cz = -44; cz <= 44; cz += 3) {
        // yüzey bandı (y 0..367)
        addAll(generateChunk(seed, cx, cz, {}).toDense(0, 368));
      }
    }
  }, 120000);

  it.each([1, 7])('dünya üretimi örneklemesi (b): derin kesitler (kuantum/elmas vb. derin madenler), tohum %i', (seed) => {
    for (let cx = -44; cx <= 44; cx += 8) {
      for (let cz = -44; cz <= 44; cz += 8) {
        addAll(generateChunk(seed, cx, cz, { light: false, sections: 'all' }).toDense(-400, 400));
      }
    }
  }, 120000);

  // hedefli örnekleme: her biyomdan (Z4 dahil, ±704 blok ötesi) birkaç chunk — seyrek biyomların blokları da görülsün
  it.each([1, 7])('dünya üretimi örneklemesi (c): her biyomdan chunk, tohum %i', (seed) => {
    const want = new Map();
    for (let z = -1400; z <= 1400; z += 40) {
      for (let x = -1400; x <= 1400; x += 40) {
        const b = biomeAt(seed, x, z);
        const l = want.get(b) || [];
        if (l.length < 6 && (x * x + z * z) < 1408 * 1408) { l.push([x >> 4, z >> 4]); want.set(b, l); }
      }
    }
    want.forEach((l) => l.forEach(([cx, cz]) => {
      addAll(generateChunk(seed, cx, cz, { light: false }).toDense(0, 368));
    }));
  }, 120000);

  it('dünya üretimi örneklemesi: NATURAL_BLOCK_KEYS gerçekten üretilen bloklardır', () => {
    if (seen.size === 0) return; // yalnız bu test süzgeçle koşarsa örnekleme aşamaları çalışmamıştır
    const missing = naturalBlockIds().filter((id) => !seen.has(id)).map((id) => BLOCKS[id].key);
    expect(missing).toEqual([]);
  });
});

describe('teknoloji edinilebilirliği (techData)', () => {
  it('her teknoloji eşyası ve makine bloğu edinilebilir; Laboratuvar istasyonu tarifli ve erken', () => {
    const { via } = obtainability();
    TECH_ITEM_DEFS.forEach((d) => expect(via.has(d.key), d.key).toBe(true));
    expect(via.has('blok:teknoloji_laboratuvarı')).toBe(true);
    expect(via.get('blok:teknoloji_laboratuvarı').depth).toBeLessThanOrEqual(8);
    expect(stationItem('laboratuvar')).toBe('blok:teknoloji_laboratuvarı');
    expect(getRecipe('portal_tabancası').station).toBe('laboratuvar');
    expect(via.get('item:portal_tabancası')).toBeTruthy();
  });
});

describe('üretim genişletmesi verisi (craftData)', () => {
  it('blok kimlikleri 136–159 aralığında, benzersiz ve MAX_BLOCK_ID içinde', () => {
    const ids = Object.values(CRAFT_BLOCK_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toBeGreaterThanOrEqual(136);
      expect(id).toBeLessThanOrEqual(159);
      expect(id).toBeLessThanOrEqual(MAX_BLOCK_ID);
    });
    CRAFT_BLOCK_DEFS.forEach((d) => {
      expect(B[d.constName]).toBe(d.id);
      expect(BLOCKS[d.id].key).toBe(d.key);
      expect(BLOCKS[d.id].placeable).toBe(true);
      expect(BLOCKS[d.id].buildable).toBe(false); // haritada yasak, yalnız macera
      expect(ITEMS['blok:' + d.key].placesBlock).toBe(d.id);
    });
  });

  it('tarif kimlikleri çakışmaz, çıktı ve girdi eşyaları var, istasyon geçerli', () => {
    CRAFT_RECIPES.forEach((r) => {
      expect(getRecipe(r[0]), r[0]).toBeTruthy();
      expect(itemByKey(r[1]), r[1]).toBeTruthy();
      r[3].forEach((p) => expect(itemByKey(p[0]), r[0] + ' girdi ' + p[0]).toBeTruthy());
      expect(STATIONS).toContain(r[4]);
    });
  });

  it('taş kesici tarifleri yalnız kesici istasyonunda ve 1 girdi → ≥ 1 çıktı', () => {
    RECIPES.filter((r) => r.station === 'kesici').forEach((r) => {
      expect(r.in).toHaveLength(1);
      expect(r.out.count).toBeGreaterThanOrEqual(1);
      expect(r.out.count).toBeLessThanOrEqual(2);
    });
    expect(RECIPES.filter((r) => r.station === 'kesici').length).toBeGreaterThanOrEqual(8);
    expect(RECIPES.filter((r) => r.station === 'dokuma').length).toBe(8);
  });

  it('merdiven tırmanılır, basamak/plaka şekilleri doğru', () => {
    expect(BLOCKS[B.LADDER].climbable).toBe(true);
    expect(BLOCKS[B.LADDER].solid).toBe(false);
    expect(BLOCKS[B.STAIRS_OAK].shape).toBe('stair');
    expect(BLOCKS[B.SLAB_PINE].shape).toBe('slab');
    expect(BLOCKS[B.STONECUTTER].interact).toBe('kesici');
    expect(BLOCKS[B.LOOM].interact).toBe('dokuma');
  });

  it('boya ve kumaş: 8 rengin hepsi birden çok yoldan, bütün renkli bloklar yapılabilir', () => {
    ['beyaz', 'siyah', 'kırmızı', 'turuncu', 'sarı', 'yeşil', 'mavi', 'mor'].forEach((c) => {
      expect(recipesProducing('item:boya_' + c).length, c).toBeGreaterThan(0);
      expect(recipesProducing('blok:kumaş_' + c).length, c).toBeGreaterThan(0);
      expect(recipesProducing('blok:cam_' + c).length, c).toBeGreaterThan(0);
      expect(recipesProducing('blok:beton_' + c).length, c).toBeGreaterThan(0);
    });
    expect(ITEM_LIST.length).toBeGreaterThan(200);
  });
});
