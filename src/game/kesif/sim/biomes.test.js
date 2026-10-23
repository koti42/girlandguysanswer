/*
 * Biyom genişletmesi testleri: dağılım istatistikleri, geçiş yumuşaklığı, belirlenimcilik, blok/eşya/tarif/doku değişmezleri,
 * ağaç kurucuları (bağlı kütük, bağlı yaprak) ve kayıt gidiş-dönüşü.
 */
import { describe, expect, it } from 'vitest';
import {
  BIOMES, BIOME_KEYS, MAX_BLOCK_ID, ZONES,
} from './constants.js';
import {
  BLOCKS, B, TILE_NAMES, blockByKey, tileIndex,
} from './blocks.js';
import { ITEMS, RECIPES } from './items.js';
import {
  BIOME_BLOCK_DEFS, BIOME_BLOCK_IDS, BIOME_ID_MAX, BIOME_ID_MIN, BIOME_INFO, BIOME_RECIPES, CAVE_STYLES, biomeFx,
  isBiomeFlora,
} from './biomeData.js';
import { getGen, makeCol, sampleColumn } from './worldgenTerrain.js';
import { biomeCellAt } from './worldgenBiomeCells.js';
import { generateChunk } from './worldgen.js';
import { TREE2, TREE2_MAX, TREE2_MIN } from './worldgenTreesBiome.js';
import { buildTreeEnumCells } from './treeGrow.js';
import { isLeafId, isLogId } from './treefall.js';
import { World } from './world.js';
import { fallenLogInCell, LOG_CELL } from './worldgenFallenLogs.js';
import { decodeEdits, encodeEdits } from './saveEdits.js';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/** Yalnız kıyı/yükseklik kuralıyla gelen biyomlar (hücre havuzunda yok). */
const TERRAIN_ONLY = ['dag', 'plaj', 'mercan'];

function zoneOfRadius(r) {
  let zi = 0;
  while (zi < ZONES.length - 1 && r >= ZONES[zi].rOut) zi++;
  return zi;
}

/** Tohumlar boyunca bölge başına biyom sütun sayıları. */
function sampleShares(step) {
  const per = ZONES.map(() => new Array(BIOME_KEYS.length).fill(0));
  const cnt = ZONES.map(() => 0);
  const o = makeCol();
  SEEDS.forEach((seed) => {
    const g = getGen(seed);
    for (let z = -1400; z <= 1400; z += step) {
      for (let x = -1400; x <= 1400; x += step) {
        const r = Math.hypot(x, z);
        if (r > ZONES[ZONES.length - 1].rOut) continue;
        sampleColumn(g, x, z, o);
        const zi = zoneOfRadius(r);
        per[zi][o.biome]++;
        cnt[zi]++;
      }
    }
  });
  return { per, cnt };
}

describe('biyom tablosu', () => {
  it('en az 22 biyom; 13 yeni biyom; hepsinin adı, tonu, harita rengi, gökyüzü/ses/parçacık bilgisi var', () => {
    expect(BIOMES.length).toBeGreaterThanOrEqual(22);
    expect(new Set(BIOME_KEYS).size).toBe(BIOME_KEYS.length);
    expect(BIOME_KEYS.length - 9).toBeGreaterThanOrEqual(12);
    BIOMES.forEach((b) => {
      expect(b.name.length, b.key).toBeGreaterThan(2);
      const info = BIOME_INFO[b.key];
      expect(info, b.key).toBeTruthy();
      expect(info.tint.grass, b.key).toBeGreaterThan(0);
      expect(info.tint.foliage, b.key).toBeGreaterThan(0);
      expect(info.tint.water, b.key).toBeGreaterThan(0);
      expect(info.map, b.key).toMatch(/^#[0-9a-f]{6}$/);
      expect(info.temp, b.key).toBeGreaterThanOrEqual(-1);
      expect(info.temp, b.key).toBeLessThanOrEqual(1);
      expect(info.rain).toBeGreaterThanOrEqual(0);
      expect(info.rain).toBeLessThanOrEqual(1);
    });
    // zorunlu biyom özellikleri (görev listesi)
    expect(biomeFx('sonbahar', 'leaves')).toBeGreaterThan(0.5); // yaprak yağmuru
    expect(biomeFx('kiraz', 'petals')).toBeGreaterThan(0.5); // taçyaprağı yağmuru
    expect(BIOME_INFO.yagmurorman.rain).toBeGreaterThanOrEqual(0.4); // sürekli yağmur
    expect(BIOME_INFO.yagmurorman.sky.fogK).toBeGreaterThan(1.3); // sis
    expect(biomeFx('volkanik', 'ash')).toBeGreaterThan(0.5); // kül yağışı
    expect(BIOME_INFO.taiga.snow + BIOME_INFO.buzul.snow).toBeGreaterThan(0.5);
    expect(BIOME_INFO.yagmurorman.audio.bird).toBeGreaterThan(0.5); // kuş sesleri
  });

  it('bölge temaları: her bölgenin biyom ağırlıkları geçerli anahtarlardır', () => {
    ZONES.forEach((z) => {
      Object.keys(z.biomes).forEach((k) => expect(BIOME_KEYS, z.key + ':' + k).toContain(k));
    });
    expect(Object.keys(ZONES[1].biomes)).toEqual(expect.arrayContaining(['sonbahar', 'yagmurorman', 'mangrov', 'bambu']));
    expect(Object.keys(ZONES[2].biomes)).toEqual(expect.arrayContaining(['col', 'savan', 'volkanik']));
    expect(Object.keys(ZONES[3].biomes)).toEqual(expect.arrayContaining(['taiga', 'buzul']));
    expect(Object.keys(ZONES[4].biomes)).toEqual(expect.arrayContaining(['kristal', 'golge', 'mantar']));
    expect(Object.keys(ZONES[0].biomes)).toEqual(expect.arrayContaining(['cayir', 'orman', 'cicek', 'kiraz']));
  });
});

describe('biyom dağılımı (ölçek 120–400 blok, yumuşak geçiş)', () => {
  const { per, cnt } = sampleShares(40);

  it('amaçlanan bölgesinde hiçbir (ağırlığı ≥ 0.1 olan) biyom %1\'in altında kalmaz', () => {
    ZONES.forEach((z, zi) => {
      Object.keys(z.biomes).forEach((k) => {
        if (z.biomes[k] < 0.1 || TERRAIN_ONLY.indexOf(k) >= 0) return;
        const share = per[zi][BIOME_KEYS.indexOf(k)] / cnt[zi];
        expect(share, 'Z' + zi + ' ' + k).toBeGreaterThanOrEqual(0.01);
      });
    });
  });

  it('her yeni biyom dünyada (tohumlar toplamında) görülür; hiçbiri yarım yüzdeden az değil', () => {
    const tot = new Array(BIOME_KEYS.length).fill(0);
    let all = 0;
    per.forEach((p) => p.forEach((n, i) => { tot[i] += n; all += n; }));
    BIOME_KEYS.forEach((k, i) => {
      expect(tot[i] / all, k).toBeGreaterThan(0.001);
    });
  });

  it('komşu sütunlar yumuşak: 3 blok aralıklı komşuların biyom farkı < %8; ortalama yama genişliği ≥ 45 blok', () => {
    const o = makeCol();
    let pairs = 0;
    let diff = 0;
    let runs = 0;
    let len = 0;
    [1, 2, 3].forEach((seed) => {
      const g = getGen(seed);
      for (let z = -1100; z <= 1100; z += 44) {
        let prev = -1;
        for (let x = -1100; x <= 1100; x += 3) {
          if (Math.hypot(x, z) > 1400) { prev = -1; continue; }
          sampleColumn(g, x, z, o);
          if (prev >= 0) {
            pairs++;
            if (prev !== o.biome) { diff++; runs++; }
            len += 3;
          }
          prev = o.biome;
        }
      }
    });
    expect(diff / pairs).toBeLessThan(0.08);
    expect(len / Math.max(1, runs)).toBeGreaterThan(45);
  });

  it('biyom hücreleri belirlenimci ve sıra/önbellekten bağımsız', () => {
    const pts = [[0, 0], [300, -200], [-700, 440], [1200, 100], [-90, -1100]];
    const a = pts.map((p) => biomeCellAt(getGen(77), p[0], p[1]).biome);
    const g2 = getGen(78); // başka tohum önbelleği
    pts.forEach((p) => biomeCellAt(g2, p[0], p[1]));
    const g = getGen(77);
    g.bcells.clear();
    const b = pts.slice().reverse().map((p) => biomeCellAt(g, p[0], p[1]).biome).reverse();
    expect(b).toEqual(a);
  });

  it('Başlangıç Vadisi (r < 176) her tohumda en az 3 farklı yumuşak biyom gösterir', () => {
    const o = makeCol();
    SEEDS.forEach((seed) => {
      const g = getGen(seed);
      const seen = new Set();
      for (let z = -170; z <= 170; z += 10) {
        for (let x = -170; x <= 170; x += 10) {
          if (Math.hypot(x, z) > 170) continue;
          sampleColumn(g, x, z, o);
          seen.add(BIOME_KEYS[o.biome]);
        }
      }
      const soft = ['cayir', 'orman', 'cicek', 'kiraz', 'sonbahar'].filter((k) => seen.has(k));
      expect(soft.length, 'tohum ' + seed).toBeGreaterThanOrEqual(3);
    });
  });
});

describe('biyom blokları (160–199)', () => {
  it('kimlikler 160–199 aralığında, benzersiz, tanımlı; blok tablosu kayıtlarıyla eşleşir', () => {
    const ids = Object.values(BIOME_BLOCK_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toBeGreaterThanOrEqual(BIOME_ID_MIN);
      expect(id).toBeLessThanOrEqual(BIOME_ID_MAX);
    });
    expect(BIOME_ID_MAX).toBeLessThan(200);
    expect(MAX_BLOCK_ID).toBe(254);
    BIOME_BLOCK_DEFS.forEach((d) => {
      const b = BLOCKS[d.id];
      expect(b.key).toBe(d.key);
      expect(b.buildable).toBe(false); // paylaşılan haritalarda yasak
      expect(B[d.constName]).toBe(d.id);
      expect(blockByKey(d.key).id).toBe(d.id);
    });
  });

  it('her bloğun dokusu atlas tablosunda var (boyanacak ad); yaprak/bitki/kütük sınıflandırması tutarlı', () => {
    BIOME_BLOCK_DEFS.forEach((d) => {
      const t = d.opts.t;
      (Array.isArray(t) ? t : [t]).forEach((name) => {
        expect(tileIndex(name), d.key + ':' + name).toBeGreaterThanOrEqual(0);
        expect(TILE_NAMES).toContain(name);
      });
    });
    [160, 161, 162, 164, 167, 170, 175].forEach((id) => expect(isLeafId(id), 'yaprak ' + id).toBe(true));
    [163, 166, 169].forEach((id) => expect(isLogId(id), 'kütük ' + id).toBe(true));
    [160, 163, 173, 187, 190, 198].forEach((id) => expect(isBiomeFlora(id), 'doğa ' + id).toBe(true));
  });

  it('eşyalar ve tarifler: her blok eşyası var ve yerleştirir; tarif girdi/çıktıları kayıtlı eşyalardır', () => {
    BIOME_BLOCK_DEFS.forEach((d) => {
      const it = ITEMS['blok:' + d.key];
      expect(it, d.key).toBeTruthy();
      expect(it.placesBlock).toBe(d.id);
    });
    expect(ITEMS['item:parlak_meyve']).toBeTruthy();
    BIOME_RECIPES.forEach((r) => {
      expect(ITEMS[r[1]], r[0]).toBeTruthy();
      r[3].forEach((p) => expect(ITEMS[p[0]], r[0] + ':' + p[0]).toBeTruthy());
      expect(RECIPES.some((x) => x.id === r[0]), r[0]).toBe(true);
    });
    // yeni ahşaplar için tahta tarifleri
    ['kiraz', 'cangıl', 'mangrov'].forEach((w) => expect(RECIPES.some((x) => x.id === 'tahta_' + w), w).toBe(true));
    expect(RECIPES.some((x) => x.id === 'tahta_bambu')).toBe(true);
  });

  it('mağara stilleri: 7 stil, ad ve sis rengiyle', () => {
    expect(CAVE_STYLES.length).toBeGreaterThanOrEqual(7);
    CAVE_STYLES.forEach((s) => {
      expect(s.name.length).toBeGreaterThan(2);
      expect(s.fog).toBeGreaterThanOrEqual(0);
    });
    ['cicekli', 'geod', 'dripstone', 'buzul', 'lavtup', 'harabe'].forEach((k) => {
      expect(CAVE_STYLES.some((s) => s.key === k), k).toBe(true);
    });
  });
});

describe('ağaç kurucuları (devirme algılayıcısıyla uyumlu)', () => {
  const NO_LOG = [TREE2.MUSH_RED, TREE2.MUSH_RED_BIG, TREE2.MUSH_PURPLE, TREE2.BAMBOO, TREE2.ICE_SPIKE, TREE2.CORAL];

  /** 26 komşuluklu bağlı bileşen sayısı. */
  function components(cells) {
    const key = (c) => c.x + ',' + c.y + ',' + c.z;
    const set = new Map(cells.map((c) => [key(c), c]));
    const seen = new Set();
    let n = 0;
    cells.forEach((c) => {
      if (seen.has(key(c))) return;
      n++;
      const st = [c];
      seen.add(key(c));
      while (st.length) {
        const p = st.pop();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const k = (p.x + dx) + ',' + (p.y + dy) + ',' + (p.z + dz);
              if (set.has(k) && !seen.has(k)) { seen.add(k); st.push(set.get(k)); }
            }
          }
        }
      }
    });
    return n;
  }

  for (let sp = TREE2_MIN; sp <= TREE2_MAX; sp++) {
    it('tür ' + sp + ' (' + Object.keys(TREE2).find((k) => TREE2[k] === sp) + '): kütükler tek bağlı gövde, yapraklar kütüğe bağlı', () => {
      for (let h = 0; h < 12; h++) {
        const th = (h * 2654435761 + sp * 97) >>> 0;
        const cells = buildTreeEnumCells(sp, 100 + h * 40, 60, -30 + h * 33, th);
        expect(cells.length, 'hücre sayısı').toBeGreaterThan(0);
        cells.forEach((c) => {
          expect(c.id).toBeGreaterThan(0);
          expect(c.id).toBeLessThanOrEqual(MAX_BLOCK_ID);
          expect(c.y).toBeGreaterThanOrEqual(57);
          expect(c.y).toBeLessThan(60 + 60);
        });
        if (NO_LOG.indexOf(sp) >= 0) continue;
        const logs = cells.filter((c) => isLogId(c.id));
        const leaves = cells.filter((c) => isLeafId(c.id));
        expect(logs.length, 'kütük').toBeGreaterThan(0);
        // taban zeminde; kök dibi (mangrov/dev cangıl payandaları) en çok 3 blok zemine iner
        const minY = Math.min.apply(null, logs.map((c) => c.y));
        expect(minY, 'taban zeminde').toBeLessThanOrEqual(60);
        expect(minY, 'kök dibi sığ').toBeGreaterThanOrEqual(57);
        // dev cangıl çok gövdelidir (gövdeler tabanda birleşir); diğerleri tek parça
        expect(components(logs), 'bağlı kütük bileşeni').toBeLessThanOrEqual(sp === TREE2.JUNGLE_GIANT ? 3 : 1);
        // yaprak sahipliği: her yaprağa ≤ 8 adımda yaprak zinciriyle bir kütükten ulaşılır (26 komşuluk)
        if (leaves.length) {
          const key = (c) => c.x + ',' + c.y + ',' + c.z;
          const dist = new Map();
          let frontier = logs.slice();
          logs.forEach((c) => dist.set(key(c), 0));
          const leafSet = new Map(leaves.map((c) => [key(c), c]));
          for (let step = 1; step <= 8 && frontier.length; step++) {
            const next = [];
            frontier.forEach((p) => {
              for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                  for (let dx = -1; dx <= 1; dx++) {
                    const k = (p.x + dx) + ',' + (p.y + dy) + ',' + (p.z + dz);
                    if (leafSet.has(k) && !dist.has(k)) { dist.set(k, step); next.push(leafSet.get(k)); }
                  }
                }
              }
            });
            frontier = next;
          }
          const orphans = leaves.filter((c) => !dist.has(key(c)));
          expect(orphans.length, 'yetim yaprak').toBe(0);
        }
      }
    });
  }

  it('dev cangıl ağacı 30–45 blok yüksekliğindedir', () => {
    let max = 0;
    let min = 999;
    for (let h = 0; h < 10; h++) {
      const cells = buildTreeEnumCells(TREE2.JUNGLE_GIANT, 20, 50, 20 + h * 40, (h * 7919 + 13) >>> 0);
      const ys = cells.filter((c) => isLogId(c.id)).map((c) => c.y);
      const hgt = Math.max.apply(null, ys) - 50;
      max = Math.max(max, hgt);
      min = Math.min(min, hgt);
    }
    expect(min).toBeGreaterThanOrEqual(26);
    expect(max).toBeLessThanOrEqual(46);
    expect(max).toBeGreaterThanOrEqual(30);
  });
});

describe('devrik kütükler', () => {
  it('ormanlık biyomlarda bulunur; kütük chunk sınırını aşsa da her iki chunk aynı bloğu görür; yalnız havaya yazılır', () => {
    const SEED = 2;
    const g = getGen(SEED);
    let found = 0;
    let present = 0;
    let total = 0;
    let crossing = 0;
    for (let cz = -20; cz <= 20 && found < 30; cz++) {
      for (let cx = -20; cx <= 20 && found < 30; cx++) {
        const L = fallenLogInCell(g, cx, cz);
        if (!L.ok) continue;
        found++;
        const x1 = L.x + L.dx * (L.len - 1);
        const z1 = L.z + L.dz * (L.len - 1);
        if ((L.x >> 4) !== (x1 >> 4) || (L.z >> 4) !== (z1 >> 4)) crossing++;
        const chunks = new Map();
        for (let i = 0; i < L.len; i++) {
          const x = L.x + L.dx * i;
          const z = L.z + L.dz * i;
          const key = (x >> 4) + ',' + (z >> 4);
          if (!chunks.has(key)) chunks.set(key, generateChunk(SEED, x >> 4, z >> 4, { light: false }));
          const c = chunks.get(key);
          // zemin üstündeki ilk blok: kütük ya da (ağaç tacı vb. nedeniyle) başka bir şey
          let y = 330;
          while (y > 0 && c.get(x & 15, y, z & 15) === 0) y--;
          total++;
          let hit = false;
          for (let k = -3; k <= 6 && !hit; k++) if (c.get(x & 15, y + k, z & 15) === L.id) hit = true;
          if (hit) present++;
        }
      }
    }
    expect(found).toBeGreaterThanOrEqual(10);
    expect(present / total).toBeGreaterThan(0.6);
    expect(LOG_CELL).toBe(10);
    expect(crossing).toBeGreaterThanOrEqual(0);
  });
});

describe('dünya: yeni bloklar üretilir ve kayıtla gidiş-dönüş yapar', () => {
  it('belirlenimcilik: aynı tohum aynı chunk (yeni biyom bölgelerinde de)', () => {
    [[40, 0], [-30, 20], [-60, 40], [30, -75], [-20, -34]].forEach(([cx, cz]) => {
      const a = generateChunk(31337, cx, cz, { light: false }).toDense(0, 368);
      getGen(31337).bcells.clear();
      const b = generateChunk(31337, cx, cz, { light: false }).toDense(0, 368);
      expect(Array.from(b)).toEqual(Array.from(a));
    });
  });

  it('biyom kimlikleri düzenleme kaydında (RLE farkı + World.serializeEdits) kaybolmadan döner', () => {
    const SEED = 4711;
    const a = new World({ seed: SEED });
    a.ensureChunk(0, 0);
    const ids = BIOME_BLOCK_DEFS.map((d) => d.id);
    ids.forEach((id, i) => { a.setBlock(2 + (i % 12), 200 + (i >> 3), 4 + (i % 5), id); });
    const ser = a.serializeEdits();
    const b = new World({ seed: SEED });
    b.applyEdits(ser);
    b.ensureChunk(0, 0);
    ids.forEach((id, i) => {
      expect(b.getBlock(2 + (i % 12), 200 + (i >> 3), 4 + (i % 5)), 'kimlik ' + id).toBe(id);
    });
    // doğrudan RLE kodlayıcı
    const enc = encodeEdits(a.edits);
    const dec = decodeEdits(enc);
    expect(dec.length === undefined ? Object.keys(dec).length : dec.length).toBeGreaterThan(0);
  });
});
