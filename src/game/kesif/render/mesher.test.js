import { describe, it, expect } from 'vitest';
import { B, BLOCKS, TILE_COUNT } from '../sim/blocks.js';
import {
  meshChunk, collectTransferables, stairFacing, resolveUvTable, MESH_ATTRIBUTES, FLAG, KIND, WIND, isEmptyMesh,
} from './mesher.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { bestOf, cpuMs, scaled } from '../../../test/perfScale.js';

const VOL = 16 * 16 * 128;
const idx = (x, y, z) => ((y * 16) + z) * 16 + x;

function makeChunk(cx = 0, cz = 0, light = true) {
  const c = {
    cx, cz, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL), biomeMap: new Uint8Array(256),
  };
  if (light) c.light.fill(0xf0);
  return c;
}
/** Blok koy; opak ışık süzgeci 15 olan hücrenin ışığını 0 yap (gerçek ışık sistemi gibi). */
function put(c, x, y, z, id) {
  c.blocks[idx(x, y, z)] = id;
  c.light[idx(x, y, z)] = BLOCKS[id].lightFilter >= 15 ? 0 : 0xf0;
}
function fillBox(c, x0, y0, z0, x1, y1, z1, id) {
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) put(c, x, y, z, id);
}
const NB = {};
function mesh(c, nb = NB, opts = {}) {
  return meshChunk(c, nb, null, Object.assign({ nullNeighbor: 'air' }, opts));
}
function faces(m) {
  return m.opaque.vertexCount / 4 + m.cutout.vertexCount / 4 + m.transparent.vertexCount / 4;
}

describe('meshChunk: temel yüz üretimi', () => {
  it('tek blok = 6 yüz, 24 köşe, 36 indeks, Uint16', () => {
    const c = makeChunk();
    put(c, 8, 10, 8, B.STONE);
    const m = mesh(c);
    expect(m.opaque.vertexCount).toBe(24);
    expect(m.opaque.indexCount).toBe(36);
    expect(m.opaque.index).toBeInstanceOf(Uint16Array);
    expect(m.cutout.vertexCount).toBe(0);
    expect(m.transparent.vertexCount).toBe(0);
    expect(m.bounds.min).toEqual([8, 10, 8]);
    expect(m.bounds.max).toEqual([9, 11, 9]);
    expect(m.stats.faces).toBe(6);
    expect(m.stats.triangles).toBe(12);
  });

  it('bitişik iki blok ortak yüzü kırpar (10 yüz)', () => {
    const c = makeChunk();
    put(c, 8, 10, 8, B.STONE);
    put(c, 9, 10, 8, B.DIRT);
    expect(faces(mesh(c))).toBe(10);
  });

  it('tam dolu 2x2x2 küp yalnız dış yüzeyi çizer (24 yüz)', () => {
    const c = makeChunk();
    fillBox(c, 4, 4, 4, 5, 5, 5, B.STONE);
    expect(faces(mesh(c))).toBe(24);
  });

  it('boş chunk boş mesh döndürür', () => {
    const m = mesh(makeChunk());
    expect(isEmptyMesh(m)).toBe(true);
    expect(m.stats.faces).toBe(0);
    expect(m.bounds.radius).toBe(0);
  });

  it('chunk sınırı: komşudaki opak blok yüzü gizler, hava/yok olan göstermez', () => {
    const c = makeChunk(0, 0);
    put(c, 15, 10, 8, B.STONE);
    const e = makeChunk(1, 0);
    put(e, 0, 10, 8, B.STONE);
    expect(faces(mesh(c, { e }))).toBe(5);
    expect(faces(mesh(c, { e: makeChunk(1, 0) }))).toBe(6);
    expect(faces(mesh(c, {}, { nullNeighbor: 'air' }))).toBe(6);
    expect(faces(mesh(c, {}, { nullNeighbor: 'solid' }))).toBe(5);
    expect(faces(mesh(c, {}, { nullNeighbor: 'replicate' }))).toBe(5);
  });

  it('dört yönde komşu chunk sınırı (n,s,e,w) doğru eşlenir', () => {
    const c = makeChunk(0, 0);
    put(c, 0, 5, 0, B.STONE); // kuzeybatı köşe
    const n = makeChunk(0, -1);
    put(n, 0, 5, 15, B.STONE); // (0,5,-1) dünya
    const w = makeChunk(-1, 0);
    put(w, 15, 5, 0, B.STONE); // (-1,5,0)
    expect(faces(mesh(c, { n }))).toBe(5);
    expect(faces(mesh(c, { w }))).toBe(5);
    expect(faces(mesh(c, { n, w }))).toBe(4);
    // yanlış komşu (s) yüzü etkilemez
    expect(faces(mesh(c, { s: n }))).toBe(6);
  });

  it('dünya tabanı (y=0) alt yüzü çizilmez', () => {
    const c = makeChunk();
    put(c, 3, 0, 3, B.STONE);
    expect(faces(mesh(c))).toBe(5);
  });

  it('yaprak aynı tür yaprağa karşı yüz çizmez; farklı türle çizer', () => {
    const c = makeChunk();
    put(c, 4, 10, 4, B.LEAVES_OAK);
    put(c, 5, 10, 4, B.LEAVES_OAK);
    const m = mesh(c);
    expect(m.cutout.vertexCount / 4).toBe(10);
    const c2 = makeChunk();
    put(c2, 4, 10, 4, B.LEAVES_OAK);
    put(c2, 5, 10, 4, B.LEAVES_PINE);
    expect(mesh(c2).cutout.vertexCount / 4).toBe(12);
  });

  it('cam/su/buz geçişleri: aynı sıvı arası kırpılır, cam şeffaf geçişe girer', () => {
    const c = makeChunk();
    put(c, 4, 10, 4, B.GLASS);
    put(c, 5, 10, 4, B.GLASS);
    const m = mesh(c);
    expect(m.transparent.vertexCount / 4).toBe(10);
    expect(m.opaque.vertexCount).toBe(0);

    const w = makeChunk();
    fillBox(w, 4, 10, 4, 5, 10, 4, B.WATER);
    fillBox(w, 4, 9, 4, 5, 9, 4, B.STONE);
    const mw = mesh(w);
    expect(mw.transparent.vertexCount / 4).toBeGreaterThan(0);
    // iki su hücresi arası yan yüz yok
    const sideBetween = [];
    for (let i = 0; i < mw.transparent.vertexCount; i++) {
      if (mw.transparent.normal[i * 3] === 1 && Math.abs(mw.transparent.pos[i * 3] - 5) < 1e-6) sideBetween.push(i);
    }
    expect(sideBetween.length).toBe(0);
  });

  it('su üstü 0.12 alçak, lav opak geçişte', () => {
    const c = makeChunk();
    put(c, 4, 10, 4, B.WATER);
    put(c, 10, 10, 4, B.LAVA);
    const m = mesh(c);
    let maxY = -1;
    for (let i = 0; i < m.transparent.vertexCount; i++) maxY = Math.max(maxY, m.transparent.pos[i * 3 + 1]);
    expect(maxY).toBeCloseTo(10.88, 5);
    let lavaMax = -1;
    for (let i = 0; i < m.opaque.vertexCount; i++) lavaMax = Math.max(lavaMax, m.opaque.pos[i * 3 + 1]);
    expect(lavaMax).toBeCloseTo(10.88, 5);
    expect(m.opaque.vertexCount).toBeGreaterThan(0);
  });

  it('üstünde su olan su tam yükseklik; komşu alçak su ile boşluk şeridi kapanır', () => {
    const c = makeChunk();
    put(c, 4, 10, 4, B.WATER);
    put(c, 4, 11, 4, B.WATER);
    put(c, 5, 10, 4, B.WATER); // üstü hava → alçak
    const m = mesh(c);
    // (4,10,4)'in +X yüzü: kendi h=1, komşu hN=0.88 → 0.12'lik şerit çizilir
    let sliver = false;
    for (let i = 0; i < m.transparent.vertexCount; i += 4) {
      if (m.transparent.normal[i * 3] === 1 && Math.abs(m.transparent.pos[i * 3] - 5) < 1e-6) {
        const ys = [0, 1, 2, 3].map((k) => m.transparent.pos[(i + k) * 3 + 1]);
        if (Math.abs(Math.min(...ys) - 10.88) < 1e-5 && Math.abs(Math.max(...ys) - 11) < 1e-5) sliver = true;
      }
    }
    expect(sliver).toBe(true);
  });

  it('su alt yüzü (yüzeyi aşağıdan görmek için) varsayılan açık, kapatılabilir', () => {
    const c = makeChunk();
    put(c, 4, 10, 4, B.WATER);
    const a = mesh(c).transparent.vertexCount;
    const b = mesh(c, NB, { waterUnderside: false }).transparent.vertexCount;
    expect(a - b).toBe(4);
  });
});

describe('meshChunk: AO ve ışık', () => {
  function topFaceVertices(m, x0, y, z0) {
    const out = [];
    const p = m.opaque;
    for (let i = 0; i < p.vertexCount; i++) {
      if (p.normal[i * 3 + 1] === 1 && Math.abs(p.pos[i * 3 + 1] - y) < 1e-6
        && p.pos[i * 3] >= x0 - 1e-6 && p.pos[i * 3] <= x0 + 1 + 1e-6
        && p.pos[i * 3 + 2] >= z0 - 1e-6 && p.pos[i * 3 + 2] <= z0 + 1 + 1e-6) {
        out.push({ x: p.pos[i * 3], z: p.pos[i * 3 + 2], ao: p.color[i * 4 + 3] });
      }
    }
    return out;
  }

  it('tek yan engel: bitişik iki köşe AO 0.82, uzak köşeler 1', () => {
    const c = makeChunk();
    fillBox(c, 0, 0, 0, 15, 10, 15, B.STONE);
    put(c, 8, 11, 8, B.STONE);
    const m = mesh(c);
    const v = topFaceVertices(m, 7, 11, 8).filter((q) => q.x >= 7 && q.x <= 8 && q.z >= 8 && q.z <= 9);
    // (7,11,8) hücresinin üst yüzü yok (y=10 zemin üstü = y 11); zemin üst yüzü y=11 düzleminde
    const near = v.filter((q) => q.x === 8);
    const far = v.filter((q) => q.x === 7);
    expect(near.length).toBeGreaterThanOrEqual(2);
    near.forEach((q) => expect(q.ao).toBeCloseTo(0.82, 5));
    far.forEach((q) => expect(q.ao).toBeCloseTo(1, 5));
  });

  it('iç köşe (iki yan engel) AO 0.46', () => {
    const c = makeChunk();
    fillBox(c, 0, 0, 0, 15, 10, 15, B.STONE);
    put(c, 8, 11, 8, B.STONE);
    put(c, 7, 11, 7, B.STONE);
    const m = mesh(c);
    const v = topFaceVertices(m, 7, 11, 8).filter((q) => q.x === 8 && q.z === 8);
    expect(v.length).toBeGreaterThan(0);
    v.forEach((q) => expect(q.ao).toBeCloseTo(0.46, 5));
  });

  it('AO kapatılınca tüm köşeler 1', () => {
    const c = makeChunk();
    fillBox(c, 0, 0, 0, 15, 10, 15, B.STONE);
    put(c, 8, 11, 8, B.STONE);
    const m = mesh(c, NB, { ao: false });
    for (let i = 0; i < m.opaque.vertexCount; i++) expect(m.opaque.color[i * 4 + 3]).toBe(1);
  });

  it('yumuşak ışık: köşe ışığı 4 hücrenin ortalaması', () => {
    const c = makeChunk();
    put(c, 8, 10, 8, B.STONE);
    c.light[idx(8, 11, 8)] = 0x0f; // üst hücre: gökyüzü 0, blok 15
    const m = mesh(c);
    const p = m.opaque;
    let n = 0;
    for (let i = 0; i < p.vertexCount; i++) {
      if (p.normal[i * 3 + 1] === 1) {
        expect(p.light[i * 2]).toBeCloseTo(11.25 / 15, 5);
        expect(p.light[i * 2 + 1]).toBeCloseTo(3.75 / 15, 5);
        n++;
      }
    }
    expect(n).toBe(4);
  });

  it('yan yüz ışığı dış komşu hücreden gelir; ışık yayılımı köşelere ulaşır', () => {
    const c = makeChunk();
    put(c, 8, 10, 8, B.STONE);
    c.light.fill(0x00);
    c.light[idx(9, 10, 8)] = 0x0c; // +X komşu: blok ışığı 12
    c.light[idx(8, 10, 8)] = 0;
    const m = mesh(c);
    const p = m.opaque;
    let found = 0;
    for (let i = 0; i < p.vertexCount; i++) {
      if (p.normal[i * 3] === 1) {
        // 4 örnekten yalnız merkez 12; diğerleri 0 → ort. 3
        expect(p.light[i * 2 + 1]).toBeGreaterThan(0.1);
        expect(p.light[i * 2 + 1]).toBeLessThanOrEqual(12 / 15 + 1e-6);
        found++;
      }
    }
    expect(found).toBe(4);
  });

  it('anizotropi düzeltmesi: tek koyu köşe için köşegen o köşeden geçer', () => {
    const c = makeChunk();
    fillBox(c, 0, 0, 0, 15, 10, 15, B.STONE);
    put(c, 8, 11, 8, B.STONE);
    const m = mesh(c);
    const p = m.opaque;
    // (7,11,8) üst yüzü: karanlık köşeler x=8 tarafında (iki tane) → köşegen seçimi farkı için indeks sıralarını doğrula
    for (let f = 0; f < p.vertexCount; f += 4) {
      if (p.normal[f * 3 + 1] !== 1) continue;
      const ao = [0, 1, 2, 3].map((k) => p.color[(f + k) * 4 + 3]);
      const i0 = (f / 4) * 6;
      const tri = Array.from(p.index.slice(i0, i0 + 6)).map((v) => v - f);
      const flipped = tri[0] === 1;
      const sumA = ao[0] + ao[2];
      const sumB = ao[1] + ao[3];
      if (sumA > sumB) expect(flipped).toBe(true);
      else expect(flipped).toBe(false);
    }
  });
});

describe('meshChunk: biyom tonu, belirlenimcilik, sınırlar', () => {
  it('çimen üstü biyoma göre tonlanır; yan yüzde de ton var, alt yüzde yok', () => {
    const meadow = makeChunk();
    put(meadow, 5, 10, 5, B.GRASS);
    const tundra = makeChunk();
    tundra.biomeMap.fill(4);
    put(tundra, 5, 10, 5, B.GRASS);
    const a = mesh(meadow).opaque;
    const b = mesh(tundra).opaque;
    const topA = [];
    const topB = [];
    let bottomMax = 0;
    for (let i = 0; i < a.vertexCount; i++) {
      if (a.normal[i * 3 + 1] === 1) topA.push([a.color[i * 4], a.color[i * 4 + 1], a.color[i * 4 + 2]]);
      if (b.normal[i * 3 + 1] === 1) topB.push([b.color[i * 4], b.color[i * 4 + 1], b.color[i * 4 + 2]]);
      if (a.normal[i * 3 + 1] === -1) bottomMax = Math.max(bottomMax, Math.abs(a.color[i * 4] - a.color[i * 4 + 2]));
    }
    expect(topA.length).toBe(4);
    // çayır: yeşil baskın; tundra daha mavimsi/soluk
    expect(topA[0][1]).toBeGreaterThan(topA[0][0]);
    expect(topA[0][1]).not.toBeCloseTo(topB[0][1], 2);
    expect(bottomMax).toBeLessThan(1e-6);
  });

  it('komşu chunk biyomu köşe tonunu yumuşatır', () => {
    const c = makeChunk(0, 0);
    put(c, 15, 10, 8, B.GRASS);
    put(c, 14, 10, 8, B.GRASS);
    put(c, 4, 10, 8, B.GRASS);
    const e = makeChunk(1, 0);
    e.biomeMap.fill(3); // çöl
    const without = mesh(c).opaque;
    const withE = mesh(c, { e }).opaque;
    const g = (m, x) => {
      for (let i = 0; i < m.vertexCount; i++) {
        if (m.normal[i * 3 + 1] === 1 && m.pos[i * 3] === x) return m.color[i * 4 + 1];
      }
      return -1;
    };
    expect(g(withE, 16)).not.toBeCloseTo(g(without, 16), 3);
    // yumuşatma ~12 blok (köşe başına örnekler ±6): komşuya yakın kenar etkilenir, uzak kenar etkilenmez
    expect(g(withE, 14)).not.toBeCloseTo(g(without, 14), 3);
    expect(g(withE, 4)).toBeCloseTo(g(without, 4), 5);
  });

  it('belirlenimci: aynı girdi aynı çıktı, araya başka mesh girse bile', () => {
    const c = makeChunk(3, -2);
    fillBox(c, 0, 0, 0, 15, 20, 15, B.STONE);
    put(c, 4, 21, 4, B.GRASS);
    put(c, 5, 21, 4, B.TALL_GRASS);
    put(c, 6, 21, 4, B.WATER);
    const a = mesh(c);
    mesh(makeChunk(9, 9)); // kirli durum denemesi
    const other = makeChunk();
    fillBox(other, 0, 0, 0, 15, 90, 15, B.DIRT);
    mesh(other);
    const b = mesh(c);
    ['opaque', 'cutout', 'transparent'].forEach((k) => {
      ['pos', 'normal', 'uv', 'color', 'light', 'flags', 'index'].forEach((f) => {
        expect(Array.from(b[k][f])).toEqual(Array.from(a[k][f]));
      });
    });
    expect(b.bounds).toEqual(a.bounds);
  });

  it('indeksler geçerli, değerler sınırlar içinde, normaller birim', () => {
    const c = makeChunk(1, 1);
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const h = 20 + ((x * 7 + z * 13) % 9);
        fillBox(c, x, 0, z, x, h - 3, z, B.STONE);
        fillBox(c, x, h - 2, z, x, h - 1, z, B.DIRT);
        put(c, x, h, z, B.GRASS);
        if ((x + z) % 5 === 0) put(c, x, h + 1, z, B.TALL_GRASS);
      }
    }
    const m = mesh(c);
    ['opaque', 'cutout', 'transparent'].forEach((k) => {
      const p = m[k];
      expect(p.indexCount % 3).toBe(0);
      expect(p.pos.length).toBe(p.vertexCount * 3);
      expect(p.color.length).toBe(p.vertexCount * 4);
      expect(p.light.length).toBe(p.vertexCount * 2);
      expect(p.flags.length).toBe(p.vertexCount * 4);
      for (let i = 0; i < p.indexCount; i++) expect(p.index[i]).toBeLessThan(p.vertexCount);
      for (let i = 0; i < p.vertexCount; i++) {
        expect(p.pos[i * 3]).toBeGreaterThanOrEqual(0);
        expect(p.pos[i * 3]).toBeLessThanOrEqual(16);
        expect(p.pos[i * 3 + 1]).toBeGreaterThanOrEqual(0);
        expect(p.pos[i * 3 + 1]).toBeLessThanOrEqual(128);
        expect(p.uv[i * 2]).toBeGreaterThanOrEqual(0);
        expect(p.uv[i * 2]).toBeLessThanOrEqual(1);
        expect(p.light[i * 2]).toBeGreaterThanOrEqual(0);
        expect(p.light[i * 2]).toBeLessThanOrEqual(1);
        const nl = Math.hypot(p.normal[i * 3], p.normal[i * 3 + 1], p.normal[i * 3 + 2]);
        expect(nl).toBeCloseTo(1, 4);
        expect(p.color[i * 4 + 3]).toBeGreaterThan(0.4);
        expect(p.color[i * 4 + 3]).toBeLessThanOrEqual(1.0001);
      }
    });
    // dünya bütçesi: yüz başına 4 köşe + 6 indeks
    expect(m.opaque.vertexCount).toBe((m.opaque.indexCount / 6) * 4);
    expect(m.opaque.index).toBeInstanceOf(Uint16Array);
    // üst yüzeyli arazi: köşe sayısı yaklaşık ≤ 256 üst + yan
    expect(m.opaque.vertexCount).toBeLessThan(65535);
    expect(collectTransferables(m).length).toBe(21);
  });

  it('65535 köşeyi aşınca Uint32 indeks kullanır', () => {
    const c = makeChunk();
    // satranç tahtası: her blok yalıtılmış → 6 yüz/blok, 8192*... > 16384 yüz
    for (let y = 0; y < 128; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          if ((x + y + z) % 2 === 0) put(c, x, y, z, B.STONE);
        }
      }
    }
    const m = mesh(c);
    expect(m.opaque.vertexCount).toBeGreaterThan(65535);
    expect(m.opaque.index).toBeInstanceOf(Uint32Array);
    for (let i = 0; i < m.opaque.indexCount; i += 997) expect(m.opaque.index[i]).toBeLessThan(m.opaque.vertexCount);
  });

  it('atlasUV çeşitleri aynı sonucu verir (işlev, tablo, {uvTable})', () => {
    const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
    const c = makeChunk();
    put(c, 3, 3, 3, B.STONE);
    const a = meshChunk(c, NB, layout.uvFor, { nullNeighbor: 'air' });
    const b = meshChunk(c, NB, layout.uvTable, { nullNeighbor: 'air' });
    const d = meshChunk(c, NB, { uvTable: layout.uvTable }, { nullNeighbor: 'air' });
    const e = meshChunk(c, NB, null, { nullNeighbor: 'air' });
    expect(Array.from(a.opaque.uv)).toEqual(Array.from(b.opaque.uv));
    expect(Array.from(a.opaque.uv)).toEqual(Array.from(d.opaque.uv));
    expect(Array.from(a.opaque.uv)).toEqual(Array.from(e.opaque.uv));
    expect(resolveUvTable(layout.uvFor).length).toBe(TILE_COUNT * 4);
    expect(() => meshChunk(c, NB, 42, {})).toThrow(TypeError);
  });

  it('uv tile dikdörtgeni içinde kalır (ton sızıntısı yok)', () => {
    const layout = computeAtlasLayout({ tileCount: 144, tileSize: 32 });
    const c = makeChunk();
    put(c, 3, 3, 3, B.GRASS);
    const m = meshChunk(c, NB, layout.uvFor, { nullNeighbor: 'air' });
    const tiles = BLOCKS[B.GRASS].tiles;
    const rects = [tiles.top, tiles.bottom, tiles.side].map((t) => layout.uvFor(t));
    for (let i = 0; i < m.opaque.vertexCount; i++) {
      const u = m.opaque.uv[i * 2];
      const v = m.opaque.uv[i * 2 + 1];
      expect(rects.some((r) => u >= r[0] - 1e-6 && u <= r[2] + 1e-6 && v >= r[1] - 1e-6 && v <= r[3] + 1e-6)).toBe(true);
    }
  });

  it('yan yüzde v yukarı artar (sanat dik durur)', () => {
    const layout = computeAtlasLayout({ tileCount: 144, tileSize: 32 });
    const c = makeChunk();
    put(c, 3, 3, 3, B.STONE);
    const m = meshChunk(c, NB, layout.uvFor, { nullNeighbor: 'air', randomize: false });
    const p = m.opaque;
    for (let i = 0; i < p.vertexCount; i++) {
      if (p.normal[i * 3] === 1) {
        // +X yüzü: üstteki köşeler (y=4) alttakilerden (y=3) daha büyük v
        const top = p.pos[i * 3 + 1] === 4;
        const r = layout.uvFor(BLOCKS[B.STONE].tiles.side);
        expect(p.uv[i * 2 + 1]).toBeCloseTo(top ? r[3] : r[1], 6);
      }
    }
  });
});

describe('meshChunk: özel şekiller', () => {
  function bbox(p) {
    const mn = [1e9, 1e9, 1e9];
    const mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p.vertexCount; i++) {
      for (let a = 0; a < 3; a++) {
        mn[a] = Math.min(mn[a], p.pos[i * 3 + a]);
        mx[a] = Math.max(mx[a], p.pos[i * 3 + a]);
      }
    }
    return { mn, mx };
  }

  it('döşeme (slab): yüksekliği 0.5, 6 yüz', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.SLAB);
    const m = mesh(c);
    const { mn, mx } = bbox(m.opaque);
    expect(m.opaque.vertexCount / 4).toBe(6);
    expect(mn).toEqual([5, 5, 5]);
    expect(mx).toEqual([6, 5.5, 6]);
  });

  it('çapraz bitki: 4 dörtgen (16 köşe), yumuşak+rüzgâr bayrağı, kesik geçiş', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.FLOWER_RED);
    const m = mesh(c);
    expect(m.cutout.vertexCount).toBe(16);
    expect(m.opaque.vertexCount).toBe(0);
    const f = m.cutout.flags;
    expect(f[0] & FLAG.WIND_MASK).toBe(WIND.PLANT);
    expect(f[0] & FLAG.SOFT).toBe(FLAG.SOFT);
    // alt köşeler sallanma 0, üst 1
    const ws = [];
    for (let i = 0; i < 16; i++) ws.push([m.cutout.pos[i * 3 + 1], f[i * 4 + 1]]);
    ws.forEach(([y, w]) => expect(w).toBe(y > 5.5 ? 1 : 0));
    const { mn, mx } = bbox(m.cutout);
    expect(mn[0]).toBeGreaterThanOrEqual(5);
    expect(mx[0]).toBeLessThanOrEqual(6);
    expect(mn[1]).toBe(5);
    expect(mx[1]).toBe(6);
  });

  it('uzun ot boyu 0.78..1 arası değişir', () => {
    const c = makeChunk();
    for (let x = 0; x < 16; x++) put(c, x, 5, 3, B.TALL_GRASS);
    const m = mesh(c);
    const { mn, mx } = bbox(m.cutout);
    expect(mn[1]).toBe(5);
    expect(mx[1]).toBeLessThanOrEqual(6);
    expect(mx[1]).toBeGreaterThan(5.7);
  });

  it('meşale: 4 dörtgen; duvara yaslıysa duvara kayar ve üst dışa eğilir', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.TORCH);
    const free = bbox(mesh(c).cutout);
    expect((free.mn[0] + free.mx[0]) / 2).toBeCloseTo(5.5, 5);
    put(c, 6, 5, 5, B.STONE); // doğuda duvar
    const w = mesh(c);
    let torchMaxX = -1;
    for (let i = 0; i < w.cutout.vertexCount; i++) torchMaxX = Math.max(torchMaxX, w.cutout.pos[i * 3]);
    expect(w.cutout.vertexCount).toBe(16);
    // alt orta nokta duvara doğru kaymıştır
    let bottomCenterX = 0;
    let n = 0;
    for (let i = 0; i < w.cutout.vertexCount; i++) {
      if (w.cutout.pos[i * 3 + 1] === 5 && Math.abs(w.cutout.pos[i * 3 + 2] - 5.5) < 1e-6) {
        bottomCenterX += w.cutout.pos[i * 3];
        n++;
      }
    }
    expect(bottomCenterX / n).toBeGreaterThan(5.5);
  });

  it('merdiven: sırt ilk opak komşuya döner; üst yarı o tarafta', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.STAIRS);
    fillBox(c, 6, 5, 5, 6, 7, 5, B.STONE); // doğu (sütun: üst yüzleri y=6'yı bozmasın)
    const m = mesh(c);
    const p = m.opaque;
    // y=6 (üst) yüzü yalnız x∈[5.5,6]
    for (let i = 0; i < p.vertexCount; i++) {
      if (p.normal[i * 3 + 1] === 1 && Math.abs(p.pos[i * 3 + 1] - 6) < 1e-6) {
        expect(p.pos[i * 3]).toBeGreaterThanOrEqual(5.5 - 1e-6);
      }
    }
    expect(stairFacing(0, 0, 0, 0)).toBe(0);
    expect(stairFacing(B.STONE, B.STONE, 0, 0)).toBe(0);
    expect(stairFacing(0, B.STONE, 0, B.STONE)).toBe(1);
    expect(stairFacing(0, 0, B.STONE, 0)).toBe(2);
    expect(stairFacing(0, 0, 0, B.STONE)).toBe(3);
    // 'fixed': sırt kuzey
    const f = mesh(c, NB, { stairs: 'fixed' });
    let minZtop = 9;
    let maxZtop = -9;
    for (let i = 0; i < f.opaque.vertexCount; i++) {
      if (f.opaque.normal[i * 3 + 1] === 1 && Math.abs(f.opaque.pos[i * 3 + 1] - 6) < 1e-6) {
        minZtop = Math.min(minZtop, f.opaque.pos[i * 3 + 2]);
        maxZtop = Math.max(maxZtop, f.opaque.pos[i * 3 + 2]);
      }
    }
    expect(minZtop).toBeCloseTo(5, 5);
    expect(maxZtop).toBeCloseTo(5.5, 5);
  });

  it('merdiven dört yönde: üst yarı yüzü komşu duvara bitişik yarıda', () => {
    const dirs = [[0, -1, 'z', 5, 5.5], [1, 0, 'x', 5.5, 6], [0, 1, 'z', 5.5, 6], [-1, 0, 'x', 5, 5.5]];
    dirs.forEach(([dx, dz, axis, lo, hi]) => {
      const c = makeChunk();
      put(c, 5, 5, 5, B.STAIRS);
      fillBox(c, 5 + dx, 5, 5 + dz, 5 + dx, 7, 5 + dz, B.STONE);
      const p = mesh(c).opaque;
      let mn = 9;
      let mx = -9;
      for (let i = 0; i < p.vertexCount; i++) {
        if (p.normal[i * 3 + 1] === 1 && Math.abs(p.pos[i * 3 + 1] - 6) < 1e-6) {
          const v = p.pos[i * 3 + (axis === 'x' ? 0 : 2)];
          mn = Math.min(mn, v);
          mx = Math.max(mx, v);
        }
      }
      expect(mn).toBeCloseTo(lo, 5);
      expect(mx).toBeCloseTo(hi, 5);
    });
  });

  it('çit: direk 0.25 genişlikte; çit komşusu kollar ekler', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.FENCE);
    const lone = mesh(c);
    const bb = bbox(lone.cutout);
    expect(bb.mn[0]).toBeCloseTo(5.375, 5);
    expect(bb.mx[0]).toBeCloseTo(5.625, 5);
    expect(lone.cutout.vertexCount / 4).toBe(6);
    put(c, 6, 5, 5, B.FENCE);
    const pair = mesh(c);
    expect(pair.cutout.vertexCount).toBeGreaterThan(2 * 24 - 8);
    const bb2 = bbox(pair.cutout);
    expect(bb2.mx[0]).toBeGreaterThan(6.5);
    expect(bb2.mn[0]).toBeLessThan(5.4);
  });

  it('plaka: 1/16 yüksekliğinde; basılı plaka daha alçak', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.PRESSURE_PLATE);
    put(c, 8, 5, 5, B.PRESSURE_PLATE_ON);
    const m = mesh(c);
    const bb = bbox(m.opaque);
    expect(bb.mx[1]).toBeCloseTo(5.0625, 5);
    let pressedTop = -1;
    for (let i = 0; i < m.opaque.vertexCount; i++) {
      if (m.opaque.pos[i * 3] > 8) pressedTop = Math.max(pressedTop, m.opaque.pos[i * 3 + 1]);
    }
    expect(pressedTop).toBeCloseTo(5.03125, 5);
  });

  it('kapı (collision kutusu), sandık ve kaktüs ince kutu olarak', () => {
    const c = makeChunk();
    put(c, 2, 5, 2, B.DOOR);
    put(c, 6, 5, 2, B.CHEST);
    put(c, 10, 5, 2, B.CACTUS);
    const m = mesh(c);
    const door = [];
    for (let i = 0; i < m.cutout.vertexCount; i++) if (m.cutout.pos[i * 3] < 4) door.push(m.cutout.pos[i * 3 + 2]);
    expect(Math.min(...door)).toBeCloseTo(2.8125, 5);
    expect(Math.max(...door)).toBeCloseTo(3, 5);
    let chestTop = -1;
    for (let i = 0; i < m.opaque.vertexCount; i++) chestTop = Math.max(chestTop, m.opaque.pos[i * 3 + 1]);
    expect(chestTop).toBeCloseTo(5.875, 5);
    let cactusMinX = 99;
    for (let i = 0; i < m.cutout.vertexCount; i++) if (m.cutout.pos[i * 3] > 9) cactusMinX = Math.min(cactusMinX, m.cutout.pos[i * 3]);
    expect(cactusMinX).toBeCloseTo(10.0625, 5);
  });

  it('sarmaşık duvara yapışır; duvar yoksa çapraz çizilir', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.VINE);
    expect(mesh(c).cutout.vertexCount).toBe(16);
    put(c, 6, 5, 5, B.STONE);
    const m = mesh(c);
    expect(m.cutout.vertexCount).toBe(4);
    for (let i = 0; i < 4; i++) expect(m.cutout.pos[i * 3]).toBeCloseTo(5.96, 5);
    expect(m.cutout.normal[0]).toBe(-1);
    expect(m.cutout.flags[0] & FLAG.WIND_MASK).toBe(WIND.VINE);
  });

  it('fener: kutu + kapak bölge uv\'si; sistem blokları kalıplanır', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.LANTERN);
    put(c, 7, 5, 5, B.SEAL_BARRIER);
    put(c, 9, 5, 5, B.RUNE_RED);
    put(c, 11, 5, 5, B.PORTAL_BLUE);
    const m = mesh(c);
    expect(m.cutout.vertexCount / 4).toBe(12);
    expect(m.transparent.vertexCount / 4).toBe(12);
    // mühür kind=SEAL, portal kind=PORTAL
    const kinds = new Set();
    for (let i = 0; i < m.transparent.vertexCount; i++) kinds.add((m.transparent.flags[i * 4] >> FLAG.KIND_SHIFT) & FLAG.KIND_MASK);
    expect(kinds.has(KIND.SEAL)).toBe(true);
    expect(kinds.has(KIND.PORTAL)).toBe(true);
    // rün parlama türü
    let glow = false;
    for (let i = 0; i < m.opaque.vertexCount; i++) {
      if (((m.opaque.flags[i * 4] >> FLAG.KIND_SHIFT) & FLAG.KIND_MASK) === KIND.GLOW) glow = true;
    }
    expect(glow).toBe(true);
  });

  it('yaprak rüzgâr bayrağı ve tam sallanma ağırlığı', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.LEAVES_BIRCH);
    const m = mesh(c);
    expect(m.cutout.flags[0] & FLAG.WIND_MASK).toBe(WIND.LEAVES);
    expect(m.cutout.flags[1]).toBe(1);
  });

  it('su kıyısında köpük, derinlik 0..1', () => {
    const c = makeChunk();
    fillBox(c, 3, 8, 3, 7, 8, 7, B.STONE);
    fillBox(c, 4, 9, 4, 6, 9, 6, B.WATER);
    fillBox(c, 4, 8, 4, 6, 8, 6, B.WATER);
    fillBox(c, 3, 9, 3, 7, 9, 3, B.STONE);
    const m = mesh(c);
    const p = m.transparent;
    let foam = 0;
    let deep = 0;
    for (let i = 0; i < p.vertexCount; i++) {
      expect(p.flags[i * 4 + 2]).toBeGreaterThanOrEqual(0);
      expect(p.flags[i * 4 + 2]).toBeLessThanOrEqual(1);
      if (p.flags[i * 4 + 3] > 0) foam++;
      if (p.flags[i * 4 + 2] > 0.2) deep++;
    }
    expect(foam).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(0);
  });

  it('MESH_ATTRIBUTES tampon alanlarıyla uyumlu', () => {
    const c = makeChunk();
    put(c, 5, 5, 5, B.STONE);
    const m = mesh(c);
    MESH_ATTRIBUTES.forEach((a) => {
      expect(m.opaque[a.key].length).toBe(m.opaque.vertexCount * a.itemSize);
    });
  });
});

describe('meshChunk: başarım', () => {
  it('arazi benzeri chunk için ms/chunk (hedef < 6 ms)', () => {
    function terrain(cx, cz) {
      const c = makeChunk(cx, cz, false);
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          const wx = cx * 16 + x;
          const wz = cz * 16 + z;
          const h = Math.floor(44 + 10 * Math.sin(wx * 0.11) * Math.cos(wz * 0.09) + 4 * Math.sin(wx * 0.31 + wz * 0.17));
          for (let y = 0; y <= h; y++) {
            const id = y === h ? B.GRASS : y > h - 4 ? B.DIRT : (y * 31 + x * 7 + z * 13) % 97 === 0 ? B.COAL_ORE : B.STONE;
            c.blocks[idx(x, y, z)] = id;
          }
          for (let y = h + 1; y <= 42; y++) c.blocks[idx(x, y, z)] = B.WATER;
          if ((x * 5 + z * 3 + cx) % 11 === 0 && h > 42) c.blocks[idx(x, h + 1, z)] = B.TALL_GRASS;
          if ((x * 7 + z * 11) % 53 === 0 && h > 43) {
            for (let t = 1; t <= 4; t++) c.blocks[idx(x, h + t, z)] = B.LOG_OAK;
            for (let ly = 3; ly <= 6; ly++) {
              for (let dz = -2; dz <= 2; dz++) {
                for (let dx = -2; dx <= 2; dx++) {
                  const lx = x + dx;
                  const lz = z + dz;
                  if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
                  if (c.blocks[idx(lx, h + ly, lz)] === 0) c.blocks[idx(lx, h + ly, lz)] = B.LEAVES_OAK;
                }
              }
            }
          }
          // ışık: sütun tabanlı gökyüzü 15 + hafif yan geçiş
          let sky = 15;
          for (let y = 127; y >= 0; y--) {
            const id = c.blocks[idx(x, y, z)];
            if (id !== 0 && BLOCKS[id].lightFilter >= 15) sky = 0;
            else if (id !== 0) sky = Math.max(0, sky - BLOCKS[id].lightFilter);
            c.light[idx(x, y, z)] = sky << 4;
          }
        }
      }
      return c;
    }
    const chunks = [];
    for (let i = 0; i < 9; i++) chunks.push(terrain((i % 3) - 1, ((i / 3) | 0) - 1));
    const center = chunks[4];
    const nb = {
      nw: chunks[0], n: chunks[1], ne: chunks[2], w: chunks[3], e: chunks[5], sw: chunks[6], s: chunks[7], se: chunks[8],
    };
    for (let i = 0; i < 20; i++) meshChunk(center, nb, null, {});
    const N = 120;
    let last = null;
    // En iyi 3 tur: geçici yük sıçramaları tek turu şişirir, en iyi turu bozmaz.
    const ms = bestOf(3, () => {
      const t0 = cpuMs();
      for (let i = 0; i < N; i++) last = meshChunk(center, nb, null, {});
      return (cpuMs() - t0) / N;
    });
    console.log(`[mesher benchmark] ${ms.toFixed(2)} ms/chunk, ${last.stats.faces} yüz, ${last.stats.vertices} köşe, ${last.stats.triangles} üçgen`);
    expect(last.stats.faces).toBeGreaterThan(300);
    expect(last.opaque.index).toBeInstanceOf(Uint16Array);
    expect(ms).toBeLessThan(scaled(30));
  });
});

describe('meshChunk: farFlora (çok uzak kademe)', () => {
  function meadow() {
    const c = makeChunk();
    fillBox(c, 0, 0, 0, 15, 9, 15, B.STONE);
    fillBox(c, 0, 10, 0, 15, 10, 15, B.GRASS);
    // dağınık bitkiler + kalıcı kalacaklar
    put(c, 3, 11, 3, B.TALL_GRASS);
    put(c, 4, 11, 7, B.FLOWER_RED);
    put(c, 9, 11, 5, B.FLOWER_YELLOW);
    put(c, 12, 11, 12, B.MUSHROOM);
    return c;
  }

  it('farFlora kapalıyken her çapraz bitki 4 yüz (8 üçgen) çizer; açıkken uzun ot/çiçekler atlanır, diğerleri kalır', () => {
    const c = meadow();
    const near = mesh(c);
    const far = mesh(c, NB, { farFlora: true });
    const crossFaces = (m) => m.cutout.vertexCount / 4;
    expect(crossFaces(near)).toBe(16); // 4 bitki × 4 yüz
    expect(crossFaces(far)).toBe(4); // yalnız mantar
    // opak yüzey (zemin) aynı
    expect(far.opaque.vertexCount).toBe(near.opaque.vertexCount);
    expect(far.stats.triangles).toBe(near.stats.triangles - 3 * 8); // 3 bitki × 8 üçgen
  });
});
