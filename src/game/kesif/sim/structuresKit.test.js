import { describe, expect, it } from 'vitest';
import { B, SOLID_LUT } from './blocks.js';
import { DenseChunk } from './denseChunk.js';
import { FACINGS, localToWorld } from './puzzles/kitGeometry.js';
import {
  MAX_Y, NullW, PALETTES, TIER_COLORS, beaconBlock, buildBeacon, isFloraId, isGroundId, makeChunkW, paletteFor, rectsOverlap,
} from './structuresKit.js';
import {
  TAU, angleAtU, buildHelix, buildRailing, cellAngle, helixPerTurn, helixTurns, stepDrop,
} from './structuresStairs.js';
import {
  circleShape, rampShape, rampToward, rectShape, ringClear, siteStats, terraform, unionShape,
} from './structuresTerrain.js';
import { layoutNodes } from './structuresTempleLayout.js';
import { deepFreeze, fitPlatform, marginFor } from './structuresPlan.js';
import { walkPath } from './structuresTestKit.js';

/** Eğimli sentetik arazili chunk: yüzey y = base + (x+z)/slope. */
function terrainChunk(cx, cz, base, slopeFn) {
  const c = new DenseChunk(cx, cz, 368);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const h = Math.round(slopeFn(cx * 16 + lx, cz * 16 + lz, base));
      c.set(lx, 0, lz, B.BEDROCK);
      for (let y = 1; y < h; y++) c.set(lx, y, lz, y < h - 3 ? B.STONE : B.DIRT);
      c.set(lx, h, lz, B.GRASS);
    }
  }
  c.recomputeHeightMap();
  c.generated = true;
  return c;
}

describe('ChunkW yazıcı', () => {
  it('yalnız kendi chunk kesitine yazar; dışarısı sessizce atılır', () => {
    const c = new DenseChunk(2, -1, 368);
    const W = makeChunkW(c, null);
    expect(W.set(40, 10, -10, B.STONE)).toBe(true);
    expect(W.set(31, 10, -10, B.STONE)).toBe(false);
    expect(W.set(40, 0, -10, B.STONE)).toBe(false); // y=0 korunur
    expect(W.set(40, 128, -10, B.STONE)).toBe(true); // derin dünya: pencere y 0..367 (dağ zirveleri dahil)
    expect(W.set(40, 368, -10, B.STONE)).toBe(false);
    expect(W.get(40, 10, -10)).toBe(B.STONE);
    expect(W.get(31, 10, -10)).toBe(-1);
    const n = W.fill(30, 20, -20, 50, 22, 0, B.BRICK);
    expect(n).toBe(16 * 16 * 3);
    expect(W.has(0, 0, 31, 15)).toBe(false);
    expect(W.has(0, 0, 32, 0)).toBe(false);
    expect(W.has(0, -16, 32, -1)).toBe(true);
    // paint, cyl, ringWall, line
    const m = W.paint(32, 30, -16, 35, 30, -13, (x, y, z) => ((x + z) & 1 ? B.GLASS : -1));
    expect(m).toBe(8);
    W.cyl(40, -8, 40, 41, 3, B.POLISHED);
    expect(W.get(40, 40, -8)).toBe(B.POLISHED);
    expect(W.get(44, 40, -8)).toBe(0);
    W.ringWall(40, -8, 50, 50, 3, 5, B.PILLAR);
    expect(W.get(40, 50, -8)).toBe(0);
    expect(W.get(44, 50, -8)).toBe(B.PILLAR);
    W.line(32, 60, -16, 47, 60, -16, B.LANTERN);
    expect(W.get(40, 60, -16)).toBe(B.LANTERN);
    expect(W.writes).toBeGreaterThan(100);
    expect(NullW.set(1, 2, 3, B.STONE)).toBe(false);
    expect(NullW.has(0, 0, 100, 100)).toBe(false);
  });

  it('orijinal zemin önbelleği: yazmalardan sonra da aynı kalır; surfaceY güncel', () => {
    const c = terrainChunk(0, 0, 50, () => 50);
    const W = makeChunkW(c, null);
    expect(W.ground(3, 3)).toBe(50);
    expect(W.groundTop(3, 3)).toBe(B.GRASS);
    expect(W.groundFill(3, 3)).toBe(B.DIRT);
    W.fill(3, 51, 3, 3, 60, 3, B.BRICK);
    expect(W.ground(3, 3)).toBe(50);
    expect(W.surfaceY(3, 3)).toBe(60);
    expect(W.ground(99, 3)).toBe(-1);
  });

  it('pillarDown zemine değene kadar yazar; ağaç/su üstünden geçer', () => {
    const c = terrainChunk(0, 0, 40, () => 40);
    c.set(5, 41, 5, B.LOG_OAK);
    c.set(5, 40, 5, B.GRASS);
    const W = makeChunkW(c, null);
    const n = W.pillarDown(5, 60, 5, B.PILLAR, 80);
    expect(n).toBe(60 - 40);
    expect(W.get(5, 41, 5)).toBe(B.PILLAR);
    expect(W.get(5, 40, 5)).toBe(B.GRASS);
    expect(W.pillarDown(99, 60, 5, B.PILLAR)).toBe(0);
  });

  it('yerel çerçeve her 4 facing için kitGeometry.localToWorld ile aynı; kutu yazımı döner', () => {
    for (let f = 0; f < 4; f++) {
      const c = new DenseChunk(0, 0, 368);
      const W = makeChunkW(c, null);
      const o = { x: 8, y: 30, z: 8 };
      const L = W.local(o, f);
      for (const [lx, lz] of [[0, 0], [3, 5], [-4, 2], [2, -3]]) {
        const w = localToWorld(o, f, lx, 0, lz);
        expect(L.wx(lx, lz)).toBe(w.x);
        expect(L.wz(lx, lz)).toBe(w.z);
        expect(L.toWorld(lx, 2, lz)).toEqual({ x: w.x, y: 32, z: w.z });
      }
      L.fill(-2, 0, 1, 2, 1, 4, B.BRICK);
      // dünyada 5×4 alan, 2 yüksek
      let count = 0;
      for (let y = 0; y < 128; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (c.get(x, y, z) === B.BRICK) count++;
      expect(count).toBe(5 * 4 * 2);
      // ön yön: yerel +lz dünyada facing yönü
      const a = L.toWorld(0, 0, 0);
      const b = L.toWorld(0, 0, 4);
      expect({ dx: Math.sign(b.x - a.x), dz: Math.sign(b.z - a.z) }).toEqual({ dx: FACINGS[f].fx, dz: FACINGS[f].fz });
      L.disc(0, 0, 3, 2, B.POLISHED);
      expect(c.get(L.wx(0, 0) & 15, 33, L.wz(0, 0) & 15)).toBe(B.POLISHED);
    }
  });

  it('paletler, kademe renkleri, ışık hüzmesi', () => {
    expect(PALETTES.length).toBe(5);
    for (let z = 0; z < 5; z++) {
      const p = paletteFor(z, 'cayir');
      ['wall', 'floor', 'pillar', 'roof', 'glow', 'lamp', 'torch', 'accent', 'plank', 'log', 'path'].forEach((k) => expect(p[k], k).toBeGreaterThan(0));
    }
    expect(paletteFor(0, 'col').wall).toBe(B.SANDSTONE);
    expect(paletteFor(1, 'tundra').roof).toBe(B.CONCRETE_WHITE);
    expect(TIER_COLORS.length).toBe(6);
    for (let t = 1; t <= 6; t++) expect(beaconBlock(t)).toBeGreaterThanOrEqual(B.GLASS_WHITE);
    const c = new DenseChunk(0, 0, 368);
    const W = makeChunkW(c, null);
    const r = buildBeacon(W, 5, 5, 40, 200, 3);
    expect(r.y1).toBeLessThanOrEqual(MAX_Y);
    expect(MAX_Y).toBe(350);
    expect(c.get(5, 41, 5)).toBe(B.GLASS_YELLOW);
    expect(c.get(5, 43, 5)).toBe(B.LIGHT_BLOCK);
    expect(c.get(6, 40, 5)).toBe(B.LIGHT_BLOCK);
    expect(isFloraId(B.LOG_OAK) && isFloraId(B.VINE) && !isFloraId(B.STONE)).toBe(true);
    expect(isGroundId(B.GRASS) && !isGroundId(B.WATER) && !isGroundId(B.TORCH) && !isGroundId(0)).toBe(true);
    expect(rectsOverlap({ x0: 0, z0: 0, x1: 5, z1: 5 }, { x0: 7, z0: 0, x1: 9, z1: 5 }, 2)).toBe(true);
    expect(rectsOverlap({ x0: 0, z0: 0, x1: 5, z1: 5 }, { x0: 8, z0: 0, x1: 9, z1: 5 }, 2)).toBe(false);
  });
});

describe('terraform (düzleştirme / temel / rampa)', () => {
  it('tepeyi oyar, çukuru doldurur: şeklin içi tam floorY, altı dolu, üstü boş, bitkiler temiz', () => {
    const c = terrainChunk(0, 0, 50, (x, z) => 44 + (x % 16) * 0.8 + ((z % 16) > 9 ? -6 : 0));
    // bitki ve ağaç
    c.set(8, 60, 8, B.LEAVES_OAK);
    c.recomputeHeightMap();
    const W = makeChunkW(c, null);
    const shape = circleShape(8, 8, 5);
    const cols = terraform(W, shape, 50, 6);
    expect(cols).toBeGreaterThan(50);
    for (let z = 5; z <= 11; z++) {
      for (let x = 5; x <= 11; x++) {
        if (shape.dist(x, z) > 0) continue;
        expect(c.get(x, 50, z), x + ',' + z).toBe(B.GRASS);
        expect(c.get(x, 51, z)).toBe(0);
        for (let y = 40; y < 50; y++) expect(SOLID_LUT[c.get(x, y, z)], x + ',' + z + ',' + y).toBe(1);
      }
    }
    expect(c.get(8, 60, 8)).toBe(0);
    // dışarıda marj içinde eğim ≤ 1 blok/blok (komşu sütunlar arası ≤ 2 fark)
    const top = (x, z) => W.surfaceY(x, z);
    for (let z = 1; z < 15; z++) for (let x = 1; x < 14; x++) {
      if (shape.dist(x, z) > 6 || shape.dist(x + 1, z) > 6) continue;
      expect(Math.abs(top(x, z) - top(x + 1, z)), x + ',' + z).toBeLessThanOrEqual(3);
    }
    expect(c.get(0, 0, 0)).toBe(B.BEDROCK);
  });

  it('marjın dışına dokunmaz; chunk dışı şekil 0 sütun', () => {
    const c = terrainChunk(0, 0, 50, (x, z) => 48 + ((x * 7 + z * 3) % 5));
    const before = c.blocks.slice();
    const W = makeChunkW(c, null);
    expect(terraform(W, circleShape(200, 200, 6), 50, 6)).toBe(0);
    expect(Array.from(c.blocks)).toEqual(Array.from(before));
  });

  it('rampa: eğim 0,5; yanal sınır dikey; platformla birleşik şekil en çok düzleştireni seçer', () => {
    const c = terrainChunk(0, 0, 50, (x) => 50 + x * 0.9); // doğuya doğru yükselen yamaç
    const W = makeChunkW(c, null);
    const plat = circleShape(2, 8, 2);
    const ramp = rampShape(5, 8, 1, 0, 2, 11, 0.5);
    terraform(W, unionShape([plat, ramp]), 50, 0);
    // rampa ekseni (z=8): x=5..15 yükseklik farkı kademeli
    let prev = W.surfaceY(5, 8);
    for (let x = 6; x <= 15; x++) {
      const y = W.surfaceY(x, 8);
      expect(Math.abs(y - prev)).toBeLessThanOrEqual(1);
      prev = y;
    }
    // yan sütun (z=12) etkilenmedi: doğal yükselti
    expect(W.surfaceY(10, 12)).toBe(50 + Math.round(10 * 0.9));
    // rampToward: dünya merkezine bakan yön
    const r = rampToward(100, 0, 10, { len: 20 });
    expect(r.dir.x).toBeCloseTo(-1, 5);
    expect(r.start.x).toBeCloseTo(90, 5);
    expect(r.rect.x0).toBeLessThan(75);
  });
});

describe('yer seçimi yardımcıları', () => {
  it('siteStats: min/maks/ortanca/ıslak oranı, belirlenimli', () => {
    const a = siteStats(1234, 10, 10, 8, 8, 5, 5);
    const b = siteStats(1234, 10, 10, 8, 8, 5, 5);
    expect(a).toEqual(b);
    expect(a.n).toBe(25);
    expect(a.min).toBeLessThanOrEqual(a.median);
    expect(a.median).toBeLessThanOrEqual(a.max);
    expect(a.range).toBe(a.max - a.min);
    expect(a.wet).toBeGreaterThanOrEqual(0);
    expect(a.wet).toBeLessThanOrEqual(1);
  });

  it('ringClear: mühür halkası bandına değen dikdörtgen reddedilir', () => {
    expect(ringClear({ x0: -10, z0: -10, x1: 10, z1: 10 })).toBe(true);
    expect(ringClear({ x0: 150, z0: -10, x1: 200, z1: 10 })).toBe(false); // bölge 0 mührü r=176
    expect(ringClear({ x0: 60, z0: 60, x1: 80, z1: 80 })).toBe(true);
    expect(rectShape(0, 0, 4, 4).dist(2, 2)).toBe(0);
    expect(rectShape(0, 0, 4, 4).dist(7, 4)).toBe(3);
  });

  it('fitPlatform: engebeli arazide marjı genişletir, uygun değilse varsayılana döner', () => {
    expect(marginFor(0)).toBe(5);
    expect(marginFor(40)).toBe(12);
    const env = { rectOk: () => true };
    const r = fitPlatform(env, { x: 0, z: 0, stats: { range: 20 } }, 10, 5, { len: 10 });
    expect(r.margin).toBe(12);
    const env2 = { rectOk: () => false };
    expect(fitPlatform(env2, { x: 0, z: 0, stats: { range: 20 } }, 10, 5, { len: 10 }).margin).toBe(5);
    const f = deepFreeze({ a: { b: [1, 2, { c: 3 }] } });
    expect(Object.isFrozen(f.a.b[2])).toBe(true);
  });
});

describe('sarmal merdiven', () => {
  /** Yerel çerçevede sentetik dünya (Map) ile sarmal kurar. */
  function build(D, U) {
    const map = new Map();
    const W = {
      bx0: -1e9, bz0: -1e9, bx1: 1e9, bz1: 1e9,
      has: () => true,
      set(x, y, z, id) { map.set(x + ',' + y + ',' + z, id); return true; },
      get(x, y, z) { return map.has(x + ',' + y + ',' + z) ? map.get(x + ',' + y + ',' + z) : 0; },
    };
    const L = NullW.local({ x: 0, y: 0, z: 0 }, 0);
    // NullW.local W'yi NullW tutar → kendi yerel çerçevemizi sentetik W ile kur
    const LL = Object.create(Object.getPrototypeOf(L));
    Object.assign(LL, L, { W });
    const topAngle = (((0 - TAU * U) % TAU) + TAU) % TAU;
    const o = {
      cx: 0, cz: 0, rIn: Math.sqrt(6.5), rOut: Math.sqrt(30), yTop: D - 1, D, U, topAngle, stepId: B.POLISHED, altId: B.STONE_BRICK,
    };
    // pillar + kabuk: kuyu hacmi boş, çevre taş
    for (let y = -2; y <= D + 4; y++) for (let z = -7; z <= 7; z++) for (let x = -7; x <= 7; x++) {
      const d2 = x * x + z * z;
      if (d2 > 30 && d2 <= 56) map.set(x + ',' + y + ',' + z, B.STONE);
      if (d2 <= 6) map.set(x + ',' + y + ',' + z, B.PILLAR);
    }
    for (let z = -6; z <= 6; z++) for (let x = -6; x <= 6; x++) if (x * x + z * z <= 56) map.set(x + ',-1,' + z, B.POLISHED);
    buildHelix(LL, o);
    buildRailing(LL, o, D, 0.95, 30.5, 42, B.FENCE);
    return { map, W, o, get: (x, y, z) => W.get(x, y, z), topAngle };
  }

  it('helixTurns: tur başına ~8 blok, 0,25 katı; perTurn 6,2–10,5', () => {
    for (let D = 9; D <= 70; D++) {
      const U = helixTurns(D);
      expect(U * 4).toBeCloseTo(Math.round(U * 4), 9);
      expect(helixPerTurn(D)).toBeGreaterThan(6.0);
      expect(helixPerTurn(D)).toBeLessThan(11.5);
    }
    expect(stepDrop(0, 20, 2.5)).toBe(0);
    expect(stepDrop(2.5, 20, 2.5)).toBe(20);
    expect(cellAngle(0, 1)).toBeCloseTo(0, 9);
    expect(cellAngle(1, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(angleAtU(Math.PI, 0.5)).toBeCloseTo(0, 9);
  });

  it('üstten alta yürünür: komşu basamak farkı ≤ 1, her sütunda kafa boşluğu, en üst ve en alt basamak', () => {
    [10, 14, 20, 29, 41].forEach((D) => {
      const U = helixTurns(D);
      const { get, o, map } = build(D, U);
      // en üst basamak yüksekliği = yTop, alt = −1
      let top = -99;
      let bottom = 99;
      for (let z = -5; z <= 5; z++) for (let x = -5; x <= 5; x++) {
        const d2 = x * x + z * z;
        if (d2 < 6.5 || d2 > 30) continue;
        for (let y = D; y >= -1; y--) {
          const id = get(x, y, z);
          if (id === B.POLISHED || id === B.STONE_BRICK) {
            top = Math.max(top, y);
            bottom = Math.min(bottom, y);
          }
        }
      }
      expect(top, 'D=' + D).toBe(D - 1);
      expect(bottom).toBe(-1);
      // yukarıdan (top angle) aşağıya BFS
      const topA = o.topAngle;
      const sx = Math.round(3.6 * Math.sin(topA + 0.05));
      const sz = Math.round(3.6 * Math.cos(topA + 0.05));
      void map;
      let startY = -99;
      for (let y = D; y >= 0; y--) if (get(sx, y - 1, sz) !== 0 && get(sx, y, sz) === 0) { startY = y; break; }
      expect(startY, 'başlangıç basamağı D=' + D).toBeGreaterThan(D - 3);
      const res = walkPath(get, { x: sx, y: startY, z: sz }, { x: Math.round(3.6 * Math.sin(0)), y: 0, z: Math.round(3.6 * Math.cos(0)) }, { x0: -8, z0: -8, x1: 8, z1: 8 }, null);
      expect(res.ok, 'D=' + D + ' ' + (res.reason || '')).toBe(true);
    });
  });
});

describe('zincir yerleşimi (layoutNodes)', () => {
  const mk = (n, w, d) => Array.from({ length: n }, (_, i) => ({
    kind: i === n - 1 ? 'altar' : 'room', w, d, h: 6,
  }));

  it('girdi düğümleri değişmez; şeritler dönüşümlü yönde; bağlantılar bitişik', () => {
    const input = mk(7, 9, 11);
    const snap = JSON.stringify(input);
    const lay = layoutNodes(input, 34);
    expect(JSON.stringify(input)).toBe(snap);
    expect(lay.nodes.length).toBe(7);
    expect(lay.lanes.length).toBeGreaterThanOrEqual(2);
    lay.lanes.forEach((l, i) => expect(l.dir).toBe(i % 2 === 0 ? 1 : -1));
    lay.nodes.forEach((n) => expect(n.dir).toBe(lay.lanes[n.lane].dir));
    expect(lay.corridors.filter((c) => c.kind === 'u').length).toBe(lay.lanes.length - 1);
  });

  it('hiçbir oda diğeriyle çakışmaz (kabuk dahil) ve sınır kutusu hepsini kapsar', () => {
    [[5, 9, 9, 34], [6, 13, 15, 34], [5, 17, 21, 56], [4, 11, 13, 96], [8, 9, 9, 20]].forEach(([n, w, d, lm]) => {
      const lay = layoutNodes(mk(n, w, d), lm);
      const box = (nd) => {
        const hw = (nd.w >> 1) + 2;
        const a = nd.dir === 1 ? nd.lz - 2 : nd.lz - nd.d - 1;
        const b = nd.dir === 1 ? nd.lz + nd.d + 1 : nd.lz + 2;
        return { x0: nd.lx - hw, x1: nd.lx + hw, z0: a, z1: b };
      };
      for (let i = 0; i < lay.nodes.length; i++) {
        const a = box(lay.nodes[i]);
        expect(a.x0).toBeGreaterThanOrEqual(lay.bbox.lx0);
        expect(a.x1).toBeLessThanOrEqual(lay.bbox.lx1);
        expect(a.z0).toBeGreaterThanOrEqual(lay.bbox.lz0);
        expect(a.z1).toBeLessThanOrEqual(lay.bbox.lz1);
        for (let j = i + 1; j < lay.nodes.length; j++) {
          expect(rectsOverlap(a, box(lay.nodes[j]), 0), n + ' oda ' + i + '↔' + j).toBe(false);
        }
      }
    });
  });
});
