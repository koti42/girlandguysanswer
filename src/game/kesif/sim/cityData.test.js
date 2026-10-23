import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from './constants.js';
import {
  B, BLOCKS, BUILDABLE_IDS, PLACEABLE_IDS, blockByKey, getBlock, resolveDrops, tileIndex, TILE_NAMES,
} from './blocks.js';
import { itemByKey, ITEM_LIST } from './items.js';
import { CRAFT_BLOCK_DEFS } from './craftData.js';
import { MAGIC_BLOCK_DEFS } from './magicData.js';
import { TREE_BLOCK_DEFS } from './treeData.js';
import { TECH_BLOCK_DEFS } from './techData.js';
import { BIOME_BLOCK_DEFS } from './biomeData.js';
import { buildMap, decodeChunk, emptyMap, encodeChunk, validateMap } from './mapFormat.js';
import { mapReplacementId } from './saveMapIO.js';
import {
  CITY_BLOCK_DEFS, CITY_BLOCK_IDS, CITY_BLOCK_ITEMS, CITY_ID_MAX, CITY_ID_MIN, CITY_RESERVED_IDS, NEON_HUE,
  NEON_UNIFORM_FIELDS, WET_BLOCK_IDS, WET_TILE_NAMES, WINDOW_GROUP_GLSL, WINDOW_GROUP_THRESHOLDS,
  WINDOW_GROUP_THRESHOLD_BYTES, WINDOW_LIT_IDS, fillNeonUniform, isCityBlockId, neonNightFactor, windowGroup, windowLit,
} from './cityData.js';

/* KESIF_CITY_CONTRACT §4: 18 blok, kimlik/anahtar/emisyon/etiket birebir. */
const SPEC = [
  [223, 'ASPHALT', 'asfalt'], [224, 'LANE_X', 'asfalt_çizgi_x'], [225, 'LANE_Z', 'asfalt_çizgi_z'],
  [226, 'ZEBRA_X', 'zebra_x'], [227, 'ZEBRA_Z', 'zebra_z'], [228, 'SIDEWALK', 'kaldırım'],
  [229, 'NEON_CYAN', 'neon_camgöbeği'], [230, 'NEON_PINK', 'neon_pembe'], [231, 'NEON_AMBER', 'neon_kehribar'],
  [232, 'NEON_LIME', 'neon_limon'], [233, 'WINDOW_DARK', 'pencere_karanlık'], [234, 'WINDOW_WARM', 'pencere_sıcak'],
  [235, 'WINDOW_COOL', 'pencere_soğuk'], [236, 'FACADE_DARK', 'cephe_koyu'], [237, 'FACADE_LIGHT', 'cephe_açık'],
  [238, 'HOLO_PANEL', 'holo_panel'], [239, 'SLIDING_DOOR', 'kayar_kapı'], [240, 'SLIDING_DOOR_OPEN', 'kayar_kapı_açık'],
];

describe('cityData: 18 şehir bloğu (223–240)', () => {
  it('kimlik/anahtar/sabit tablosu §4 ile birebir', () => {
    expect(CITY_BLOCK_DEFS).toHaveLength(18);
    expect(CITY_ID_MIN).toBe(223);
    expect(CITY_ID_MAX).toBe(240);
    SPEC.forEach(([id, constName, key]) => {
      const r = getBlock(id);
      expect(r.key, 'key ' + id).toBe(key);
      expect(B[constName], constName).toBe(id);
      expect(CITY_BLOCK_IDS[constName]).toBe(id);
      expect(blockByKey(key).id).toBe(id);
      expect(r.category).toBe('yapı');
      expect(r.buildable).toBe(false);
      expect(isCityBlockId(id)).toBe(true);
    });
    expect(isCityBlockId(222)).toBe(false);
    expect(isCityBlockId(241)).toBe(false);
  });

  it('emisyon: neon 12, holo 8; diğerleri (pencereler dahil) blok ışığı vermez', () => {
    [229, 230, 231, 232].forEach((id) => expect(getBlock(id).emission, 'neon ' + id).toBe(12));
    expect(getBlock(238).emission).toBe(8);
    [223, 224, 225, 226, 227, 228, 233, 234, 235, 236, 237].forEach((id) => expect(getBlock(id).emission, 'id ' + id).toBe(0));
    // kapı çerçevesi hafif ışık (<4: "parıltı" titreşim türü olmaz)
    expect(getBlock(239).emission).toBeLessThan(4);
    expect(getBlock(240).emission).toBeLessThan(4);
  });

  it('opaklık, çarpışma, katman, placeable', () => {
    for (let id = 223; id <= 239; id++) {
      const r = getBlock(id);
      expect(r.opaque, 'opak ' + id).toBe(true);
      expect(r.solid).toBe(true);
      expect(r.cube).toBe(true);
      expect(r.layer).toBe('opaque');
    }
    for (let id = 223; id <= 238; id++) expect(getBlock(id).placeable, 'placeable ' + id).toBe(true);
    const open = getBlock(240);
    expect(open.solid).toBe(false);
    expect(open.collision).toEqual([]);
    expect(open.opaque).toBe(false);
    expect(open.layer).toBe('cutout');
    expect(open.lightFilter).toBe(0);
    [239, 240].forEach((id) => {
      const r = getBlock(id);
      expect(r.placeable).toBe(false);
      expect(r.unbreakable).toBe(true);
      expect(r.drops).toEqual([]);
      expect(resolveDrops(id, null, null)).toEqual([]);
    });
  });

  it('yaya geçidi/şerit/kaldırım/asfalt yüz dokuları: üst farklı, yan tabaka dokusu', () => {
    const side = (id) => getBlock(id).tileNames.side;
    expect(getBlock(223).tileNames.top).toBe('asfalt');
    expect(side(223)).toBe('asfalt_yan');
    [224, 225, 226, 227].forEach((id) => expect(side(id)).toBe('asfalt_yan'));
    expect(getBlock(224).tileNames.top).toBe('asfalt_çizgi_x');
    expect(getBlock(227).tileNames.top).toBe('zebra_z');
    expect(getBlock(228).tileNames.top).toBe('kaldırım');
    expect(side(228)).toBe('kaldırım_yan');
    expect(getBlock(239).tileNames.side).toBe('kayar_kapı');
    expect(getBlock(240).tileNames.side).toBe('kayar_kapı_açık');
  });

  it('ıslak yüzey kümesi: yol + kaldırım; üst yüz dokuları WET_TILE_NAMES içinde', () => {
    expect(WET_BLOCK_IDS).toEqual([223, 224, 225, 226, 227, 228]);
    WET_BLOCK_IDS.forEach((id) => expect(WET_TILE_NAMES).toContain(getBlock(id).tileNames.top));
    WET_TILE_NAMES.forEach((n) => expect(tileIndex(n)).toBeGreaterThanOrEqual(0));
    expect(WET_BLOCK_IDS).not.toContain(233);
  });

  it('neon ton tablosu: 4 neon + holo, hepsi geçerli sRGB bayt, birbirinden ayrı', () => {
    const keys = Object.keys(NEON_HUE).map(Number).sort();
    expect(keys).toEqual([229, 230, 231, 232, 238]);
    const seen = new Set();
    keys.forEach((k) => {
      const c = NEON_HUE[k];
      expect(c).toHaveLength(3);
      c.forEach((v) => {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      });
      seen.add(c.join(','));
    });
    expect(seen.size).toBe(5);
    expect(Object.isFrozen(NEON_HUE)).toBe(true);
  });
});

describe('cityData: kimlik sahipliği ve rezerv', () => {
  const owned = new Set(CITY_BLOCK_DEFS.map((d) => d.id));

  it('223–240 yalnız cityData tanımlarına aittir; başka veri modülüyle çakışma yok', () => {
    for (let id = 223; id <= 240; id++) {
      expect(owned.has(id), 'sahip ' + id).toBe(true);
      expect(getBlock(id).key.indexOf('ayrılmış_'), 'ayrılmış kalmamalı ' + id).toBe(-1);
    }
    const others = [].concat(CRAFT_BLOCK_DEFS, MAGIC_BLOCK_DEFS, TREE_BLOCK_DEFS, TECH_BLOCK_DEFS, BIOME_BLOCK_DEFS);
    others.forEach((d) => expect(owned.has(d.id), 'çakışma ' + d.id).toBe(false));
    // tech 200–222 ve ağaç 250–253 yerinde
    expect(getBlock(222).key).toBe('şarj_istasyonu_etkin');
    [250, 251, 252, 253].forEach((id) => expect(getBlock(id).key).toMatch(/_fidanı$/));
  });

  it('241–249 ve 254 hâlâ ayrılmış (hava gibi, yerleştirilemez, kırılamaz)', () => {
    expect(CITY_RESERVED_IDS).toEqual([241, 242, 243, 244, 245, 246, 247, 248, 249, 254]);
    CITY_RESERVED_IDS.forEach((id) => {
      const r = getBlock(id);
      expect(r.key, 'rezerv ' + id).toBe('ayrılmış_' + id);
      expect(r.placeable).toBe(false);
      expect(r.solid).toBe(false);
      expect(r.unbreakable).toBe(true);
    });
    expect(MAX_BLOCK_ID).toBe(254);
    expect(BLOCKS).toHaveLength(255);
  });

  it('dokunulmaz aralıklar (130–135, 153–159) tanımsız kalır', () => {
    [130, 131, 132, 133, 134, 135, 153, 154, 155, 156, 157, 158, 159].forEach((id) => {
      expect(getBlock(id).key, 'id ' + id).toBe('ayrılmış_' + id);
    });
  });

  it('KESIF_CITY_CONTRACT §4 ses/etiket: tüm şehir doku adları atlas adlarında ve tekil', () => {
    const names = new Set();
    CITY_BLOCK_DEFS.forEach((d) => {
      const r = getBlock(d.id);
      [r.tileNames.top, r.tileNames.bottom, r.tileNames.side].forEach((n) => {
        expect(TILE_NAMES).toContain(n);
        names.add(n);
      });
    });
    // 18 blokta kullanılan benzersiz doku adları (cephe_koyu kapı üst/altında yeniden kullanılır) ≤ 24 yeni doku
    expect(names.size).toBeLessThanOrEqual(24);
  });
});

describe('cityData: eşyalar', () => {
  it('223–238 için blok eşyası var ve doğru bloğu yerleştirir; 239/240 eşya değildir', () => {
    expect(CITY_BLOCK_ITEMS).toHaveLength(16);
    SPEC.slice(0, 16).forEach(([id, , key]) => {
      const it = itemByKey('blok:' + key);
      expect(it, key).toBeTruthy();
      expect(it.placesBlock).toBe(id);
      expect(it.kind).toBe('blok');
      expect(it.stack).toBe(64);
    });
    expect(itemByKey('blok:kayar_kapı')).toBeNull();
    expect(itemByKey('blok:kayar_kapı_açık')).toBeNull();
    const names = ITEM_LIST.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('blok yerleştirme eşyası olmayan placeable:false blok yok; PLACEABLE_IDS şehir kimliklerini içermez (id>99)', () => {
    PLACEABLE_IDS.forEach((id) => expect(isCityBlockId(id)).toBe(false));
    BUILDABLE_IDS.forEach((id) => expect(isCityBlockId(id)).toBe(false));
  });
});

describe('cityData: harita (id ≤ 99) kuralı değişmedi', () => {
  it('BUILDABLE_MAX 99; validateMap her şehir kimliğini reddeder; buildMap havaya çevirir', () => {
    expect(BUILDABLE_MAX).toBe(99);
    for (let id = 223; id <= 240; id++) {
      const b = new Uint8Array(16 * 16 * 128);
      b[91] = id;
      const m = Object.assign(emptyMap(), { chunks: { '1,1': encodeChunk(b) } });
      const v = validateMap(m);
      expect(v.ok, 'id ' + id).toBe(false);
      expect(v.codes).toContain('block_id');
      expect(mapReplacementId(id), 'id ' + id).toBe(0);
    }
    const dense = new Uint8Array(16 * 16 * 128);
    for (let id = 223; id <= 240; id++) dense[id] = id;
    const m = buildMap({ chunks: { '0,0': dense } });
    const back = decodeChunk(m.chunks['0,0']);
    for (let id = 223; id <= 240; id++) expect(back[id]).toBe(0);
    expect(validateMap(m).ok).toBe(true);
  });

  it('PHP tarafı (kardeş depo bulunursa): harita en büyük blok kimliği 99', () => {
    const cfg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', 'girlsandguys-api-v10', 'config', 'game_kesif.php');
    if (!fs.existsSync(cfg)) return; // CI'da kardeş depo yoksa atlanır
    const text = fs.readFileSync(cfg, 'utf8');
    const m = /'max_block_id'\s*=>\s*(?:env\([^)]*,\s*)?(\d+)/.exec(text);
    if (m) expect(Number(m[1])).toBe(99);
  });
});

/* GLSL ES 3.00 uint aritmetiğinin BigInt ile birebir emülasyonu (windowGroup ↔ WINDOW_GROUP_GLSL eşitliği). */
function glslGroup(x, y, z) {
  const M = 0xffffffffn;
  const u = (n) => BigInt.asUintN(32, BigInt(n));
  let h = ((u(x) * 0x2c1b3c6dn) & M) ^ ((u(y) * 0x297a2d39n) & M) ^ ((u(z) * 0x1b873593n) & M);
  h ^= h >> 15n;
  h = (h * 0x85ebca6bn) & M;
  h ^= h >> 13n;
  h = (h * 0xc2b2ae35n) & M;
  h ^= h >> 16n;
  return Number(h % 3n);
}

describe('cityData: pencere emisyon grubu ve uNeon sözleşmesi', () => {
  it('windowGroup belirlenimci, 0..2, yaklaşık eşit dağılım, negatif koordinatlar güvenli', () => {
    const cnt = [0, 0, 0];
    for (let i = 0; i < 30000; i++) {
      const x = ((i * 7919) % 1600) - 800;
      const y = 64 + ((i * 31) % 240);
      const z = ((i * 104729) % 1600) - 800;
      const g = windowGroup(x, y, z);
      expect(g === 0 || g === 1 || g === 2).toBe(true);
      expect(windowGroup(x, y, z)).toBe(g);
      cnt[g]++;
    }
    cnt.forEach((c) => {
      expect(c).toBeGreaterThan(9000);
      expect(c).toBeLessThan(11000);
    });
    expect(windowGroup(NaN, undefined, 5)).toBeGreaterThanOrEqual(0);
  });

  it('JS karması ile GLSL karması (uint emülasyonu) 20000 konumda aynı grubu verir', () => {
    for (let i = 0; i < 20000; i++) {
      const x = ((i * 2654435761) >>> 0) % 2048 - 1024;
      const y = (i * 40503) % 700 - 100;
      const z = ((i * 97) ^ (i << 5)) % 2048 - 1024;
      expect(glslGroup(x, y, z), `${x},${y},${z}`).toBe(windowGroup(x, y, z));
    }
  });

  it('GLSL parçası aynı sabitleri taşır; eşikler artan ve bayt kodları tutarlı', () => {
    ['0x2c1b3c6du', '0x297a2d39u', '0x1b873593u', '0x85ebca6bu', '0xc2b2ae35u', '% 3u', 'kWindowGroup', 'kWindowLit'].forEach((s) => {
      expect(WINDOW_GROUP_GLSL).toContain(s);
    });
    expect(WINDOW_GROUP_THRESHOLDS).toEqual([0.2, 0.5, 0.8]);
    expect(WINDOW_GROUP_THRESHOLD_BYTES.map((b) => Math.round((b / 255) * 10) / 10)).toEqual([0.2, 0.5, 0.8]);
    // GLSL eşik sabitleri JS eşikleriyle aynı
    expect(WINDOW_GROUP_GLSL).toContain('0.2 : (group == 1 ? 0.5 : 0.8)');
    expect(WINDOW_LIT_IDS).toEqual([234, 235]);
  });

  it('windowLit: akşam kademeli yanar (grup 0 → 1 → 2), monoton, 0..1', () => {
    for (let g = 0; g < 3; g++) {
      let prev = -1;
      for (let n = 0; n <= 1.0001; n += 0.01) {
        const v = windowLit(n, g);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
      expect(windowLit(0, g)).toBe(0);
      expect(windowLit(1, g)).toBe(1);
    }
    expect(windowLit(0.35, 0)).toBe(1);
    expect(windowLit(0.35, 1)).toBe(0);
    expect(windowLit(0.65, 1)).toBe(1);
    expect(windowLit(0.65, 2)).toBe(0);
    expect(windowLit(0.3, 7)).toBe(0); // geçersiz grup: hiç yanmaz
  });

  it('neonNightFactor: öğle 0, gece yarısı 1, 19:30 başlangıcı ≥ 0.9, sürekli ve 1 periyotlu', () => {
    expect(neonNightFactor(0.5)).toBe(0);
    expect(neonNightFactor(0)).toBe(1);
    expect(neonNightFactor(0.8125)).toBeGreaterThan(0.9);
    expect(neonNightFactor(1.8125)).toBeCloseTo(neonNightFactor(0.8125), 9);
    expect(neonNightFactor(-0.1875)).toBeCloseTo(neonNightFactor(0.8125), 9);
    let prev = neonNightFactor(0);
    for (let p = 0.001; p <= 1; p += 0.001) {
      const v = neonNightFactor(p);
      expect(Math.abs(v - prev)).toBeLessThan(0.05);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it('fillNeonUniform: 4 alan, sınırlar kenetli, gece+yağmur kazançları', () => {
    expect(NEON_UNIFORM_FIELDS).toEqual(['night', 'neon', 'wet', 'window']);
    const u = new Float32Array(4);
    fillNeonUniform(u, 0, 0, 0);
    expect(Array.from(u)).toEqual([0, expect.closeTo(0.45, 5), 0, 0]);
    fillNeonUniform(u, 1, 1, 1);
    expect(u[0]).toBe(1);
    expect(u[1]).toBeCloseTo(1.25, 5);
    expect(u[2]).toBeCloseTo(1, 5);
    expect(u[3]).toBeCloseTo(1.15, 5);
    fillNeonUniform(u, 9, -3, 7);
    u.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    expect(u[0]).toBe(1);
    expect(u[2]).toBeGreaterThanOrEqual(0);
    const arr = [0, 0, 0, 0];
    expect(fillNeonUniform(arr, 0.5, 0.5, 0)).toBe(arr);
  });
});
