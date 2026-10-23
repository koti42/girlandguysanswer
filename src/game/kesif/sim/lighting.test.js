import { describe, expect, it } from 'vitest';
import { WORLD_Y_MIN } from './constants.js';
import { B } from './blocks.js';
import { Chunk } from './chunk.js';
import { mulberry32 } from './rng.js';
import {
  computeChunkLight, lightNewSection, relightChunk, stitchChunk, updateLightAt, updateLightBulk,
} from './lighting.js';

const GROUND = 20;
/** y=0 ve altı kesitler (si 0..24) tek tip taş: derin zemin. */
const DEEP_SECTIONS = 25;

function stoneUpTo(c, ground) {
  for (let si = 0; si < DEEP_SECTIONS; si++) c.fillSection(si, B.STONE);
  for (let y = 0; y <= ground; y++) {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.set(x, y, z, B.STONE);
  }
}

/** nx×nz chunk ızgarası: y <= GROUND taş (derin kısım tek tip taş), üstü hava. (0,0) sol üst. */
function makeGrid(nx, nz, fill) {
  const grid = new Map();
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const c = new Chunk(cx, cz);
      stoneUpTo(c, GROUND);
      if (fill) fill(c);
      c.recomputeHeightMap();
      c.generated = true;
      grid.set(cx + ',' + cz, c);
    }
  }
  const get = (cx, cz) => grid.get(cx + ',' + cz) || null;
  grid.forEach((c) => computeChunkLight(c));
  grid.forEach((c) => stitchChunk(get, c));
  return { grid, get };
}

function lightAt(w, x, y, z) {
  const c = w.get(x >> 4, z >> 4);
  return c ? c.getLight(x & 15, y, z & 15) : -1;
}
function sky(w, x, y, z) {
  return lightAt(w, x, y, z) >> 4;
}
function blk(w, x, y, z) {
  return lightAt(w, x, y, z) & 15;
}

/** World.setBlock'un ışık/yükseklik davranışını taklit eder. */
function edit(w, x, y, z, id) {
  const c = w.get(x >> 4, z >> 4);
  c.set(x & 15, y, z & 15, id);
  c.recomputeColumn(x & 15, z & 15);
  return updateLightAt(w.get, x, y, z);
}

/** Referans: tüm chunk'ları baştan bağımsız hesapla, sonra çift geçişli dikiş. */
function reference(w) {
  const ref = new Map();
  w.grid.forEach((c, k) => {
    const n = c.clone();
    n.generated = true;
    ref.set(k, n);
  });
  const get = (cx, cz) => ref.get(cx + ',' + cz) || null;
  ref.forEach((n) => computeChunkLight(n));
  for (let pass = 0; pass < 2; pass++) ref.forEach((n) => stitchChunk(get, n));
  return ref;
}

function sameLight(a, b, label) {
  for (let si = 0; si < a.sectionCount; si++) {
    const la = a.getSectionLight(si);
    const lb = b.getSectionLight(si);
    if (la === null || lb === null) {
      if (la !== lb) throw new Error(label + ': kesit ' + si + ' üretim durumu farklı');
      continue;
    }
    for (let i = 0; i < 4096; i++) {
      if (la[i] !== lb[i]) {
        const x = a.cx * 16 + (i & 15);
        const z = a.cz * 16 + ((i >> 4) & 15);
        const y = a.yMin + si * 16 + (i >> 8);
        throw new Error(label + ': ışık uyuşmazlığı (' + x + ',' + y + ',' + z + ') artımlı=' + la[i].toString(16)
          + ' referans=' + lb[i].toString(16));
      }
    }
  }
}

function expectSameAsReference(w) {
  const ref = reference(w);
  w.grid.forEach((c, k) => sameLight(c, ref.get(k), 'artımlı≠referans'));
}

describe('gökyüzü ışığı', () => {
  it('açık gökyüzü 15, katı zemin altı 0', () => {
    const w = makeGrid(1, 1);
    expect(sky(w, 8, 60, 8)).toBe(15);
    expect(sky(w, 8, GROUND + 1, 8)).toBe(15);
    expect(sky(w, 8, GROUND, 8)).toBe(0);
    expect(sky(w, 8, 3, 8)).toBe(0);
    expect(sky(w, 8, -100, 8)).toBe(0);
    expect(sky(w, 8, 367, 8)).toBe(15);
  });

  it('tavan altı yanal yayılır ve her adımda 1 azalır', () => {
    const w = makeGrid(1, 1, (c) => {
      for (let x = 4; x <= 12; x++) for (let z = 4; z <= 12; z++) c.set(x, GROUND + 3, z, B.STONE);
    });
    expect(sky(w, 3, GROUND + 2, 8)).toBe(15);
    expect(sky(w, 4, GROUND + 2, 8)).toBe(14);
    expect(sky(w, 5, GROUND + 2, 8)).toBe(13);
    expect(sky(w, 8, GROUND + 2, 8)).toBe(10);
    expect(sky(w, 8, GROUND + 1, 8)).toBe(10);
  });

  it('su ışığı sütunda hızla söner (filtre 2)', () => {
    const w = makeGrid(1, 1, (c) => {
      for (let y = GROUND + 1; y <= GROUND + 8; y++) {
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.set(x, y, z, B.WATER);
      }
    });
    const top = GROUND + 8;
    expect(sky(w, 8, top, 8)).toBe(13); // 15 - 2
    expect(sky(w, 8, top - 1, 8)).toBe(11);
    expect(sky(w, 8, top - 2, 8)).toBe(9);
    expect(sky(w, 8, top - 5, 8)).toBe(3);
    expect(sky(w, 8, top - 7, 8)).toBe(0);
  });

  it('yaprak altı bir kademe kararır', () => {
    const w = makeGrid(1, 1, (c) => {
      c.set(8, GROUND + 6, 8, B.LEAVES_OAK);
    });
    expect(sky(w, 8, GROUND + 6, 8)).toBe(14);
    expect(sky(w, 8, GROUND + 5, 8)).toBe(14); // yan komşu 15'ten yanal 14
  });
});

describe('blok ışığı', () => {
  it('meşale 14, mesafe başına 1 azalır, 14 blokta söner', () => {
    const w = makeGrid(1, 1);
    const y = GROUND + 1;
    edit(w, 8, y, 8, B.TORCH);
    expect(blk(w, 8, y, 8)).toBe(14);
    expect(blk(w, 9, y, 8)).toBe(13);
    expect(blk(w, 8, y + 3, 8)).toBe(11);
    expect(blk(w, 11, y, 9)).toBe(10); // Manhattan 4
    expect(blk(w, 8, y + 13, 8)).toBe(1);
    expect(blk(w, 8, y + 14, 8)).toBe(0);
  });

  it('katı duvar ışığı keser, kaldırılınca akar', () => {
    const w = makeGrid(1, 1);
    const y = GROUND + 1;
    edit(w, 5, y, 8, B.TORCH);
    for (let yy = y; yy < y + 6; yy++) for (let z = 0; z < 16; z++) edit(w, 7, yy, z, B.STONE);
    expect(blk(w, 8, y, 8)).toBe(0);
    expect(blk(w, 6, y, 8)).toBe(13);
    edit(w, 7, y, 8, 0);
    expect(blk(w, 7, y, 8)).toBe(12);
    expect(blk(w, 8, y, 8)).toBe(11);
  });

  it('meşale kaldırılınca tüm ışık söner', () => {
    const w = makeGrid(1, 1);
    const y = GROUND + 1;
    edit(w, 8, y, 8, B.TORCH);
    edit(w, 8, y, 8, 0);
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        for (let yy = y - 1; yy < y + 16; yy++) expect(blk(w, x, yy, z)).toBe(0);
      }
    }
  });

  it('iki kaynak: biri kalkınca diğerinin ışığı kalır', () => {
    const w = makeGrid(1, 1);
    const y = GROUND + 1;
    edit(w, 4, y, 8, B.TORCH);
    edit(w, 10, y, 8, B.TORCH);
    expect(blk(w, 7, y, 8)).toBe(11);
    edit(w, 4, y, 8, 0);
    expect(blk(w, 7, y, 8)).toBe(11);
    expect(blk(w, 4, y, 8)).toBe(8);
    expectSameAsReference(w);
  });

  it('ışık yayan opak blok (kristal kaya) kendi hücresinde emisyon taşır', () => {
    const w = makeGrid(1, 1);
    const y = GROUND + 1;
    edit(w, 8, y, 8, B.CRYSTAL_ROCK);
    expect(blk(w, 8, y, 8)).toBe(5);
    expect(blk(w, 9, y, 8)).toBe(4);
    expect(blk(w, 8, y + 4, 8)).toBe(1);
    edit(w, 9, y, 8, B.TORCH);
    edit(w, 9, y, 8, 0);
    expect(blk(w, 8, y, 8)).toBe(5);
    expectSameAsReference(w);
  });

  it('lav (emisyon 15) ve zemindeki sıvı filtresi', () => {
    const w = makeGrid(1, 1);
    edit(w, 8, GROUND + 1, 8, B.LAVA);
    expect(blk(w, 8, GROUND + 1, 8)).toBe(15);
    expect(blk(w, 9, GROUND + 1, 8)).toBe(14);
    expectSameAsReference(w);
  });
});

describe('chunk sınırı', () => {
  it('meşale ışığı komşu chunk\'a geçer ve geri alınır', () => {
    const w = makeGrid(2, 1);
    const y = GROUND + 1;
    edit(w, 15, y, 8, B.TORCH);
    expect(blk(w, 15, y, 8)).toBe(14);
    expect(blk(w, 16, y, 8)).toBe(13);
    expect(blk(w, 20, y, 8)).toBe(9);
    expect(w.get(1, 0).dirty).toBe(true);
    edit(w, 15, y, 8, 0);
    for (let x = 16; x < 32; x++) expect(blk(w, x, y, 8)).toBe(0);
  });

  it('stitchChunk: sonradan eklenen chunk komşuyla ışık alışverişi yapar', () => {
    const a = new Chunk(0, 0);
    const b = new Chunk(1, 0);
    [a, b].forEach((c) => stoneUpTo(c, GROUND));
    a.set(15, GROUND + 1, 8, B.TORCH);
    a.recomputeHeightMap();
    b.recomputeHeightMap();
    a.generated = true;
    b.generated = true;
    computeChunkLight(a);
    computeChunkLight(b);
    const map = new Map([['0,0', a]]);
    const get = (cx, cz) => map.get(cx + ',' + cz) || null;
    expect(stitchChunk(get, a)).toEqual([]);
    map.set('1,0', b);
    const touched = relightChunk(get, b);
    expect(touched).toContain(b);
    expect(b.getLight(0, GROUND + 1, 8) & 15).toBe(13);
    expectSameAsReference({ grid: map, get });
  });

  it('gökyüzü ışığı sınırda yanal sızar (mağara girişi)', () => {
    const w = makeGrid(2, 1, (c) => {
      if (c.cx === 1) {
        for (let y = GROUND + 1; y <= GROUND + 5; y++) {
          for (let z = 0; z < 16; z++) {
            for (let x = 0; x < 16; x++) {
              if (y === GROUND + 5 || x === 15 || z === 0 || z === 15) c.set(x, y, z, B.STONE);
            }
          }
        }
      }
    });
    expect(sky(w, 16, GROUND + 2, 8)).toBe(14);
    expect(sky(w, 18, GROUND + 2, 8)).toBe(12);
    expect(sky(w, 28, GROUND + 2, 8)).toBe(2);
    expectSameAsReference(w);
  });
});

describe('kesit sınırları ve negatif y', () => {
  it('meşale kesit sınırında (y=-1/0 ve y=15/16) simetrik yayılır', () => {
    const w = makeGrid(1, 1, (c) => {
      // y=-8..24 arası oyuk (mağara): kesit sınırları y=-1/0 ve y=15/16 oyuğun içinde
      for (let y = -8; y <= 24; y++) for (let z = 4; z <= 12; z++) for (let x = 4; x <= 12; x++) c.set(x, y, z, 0);
    });
    edit(w, 8, -1, 8, B.TORCH);
    expect(blk(w, 8, -1, 8)).toBe(14);
    expect(blk(w, 8, 0, 8)).toBe(13);
    expect(blk(w, 8, -2, 8)).toBe(13);
    expect(blk(w, 8, 8, 8)).toBe(5);
    expect(blk(w, 8, -9, 8)).toBe(0); // duvar (taş)
    expectSameAsReference(w);
    edit(w, 8, 15, 8, B.TORCH);
    expect(blk(w, 8, 16, 8)).toBe(13);
    expect(blk(w, 8, 14, 8)).toBe(13);
    expectSameAsReference(w);
  });

  it('derin yer altı: gökyüzü 0, kapalı kesitler dizisiz (tek tip)', () => {
    const w = makeGrid(1, 1);
    const c = w.get(0, 0);
    for (let si = 0; si < DEEP_SECTIONS; si++) {
      expect(c.secLight[si]).toBeNull();
      expect(c.getLight(3, WORLD_Y_MIN + si * 16 + 5, 3)).toBe(0);
    }
    for (let si = 27; si < 48; si++) {
      expect(c.secLight[si]).toBeNull();
      expect(c.secLightU[si]).toBe(0xf0);
    }
  });

  it('dikey gökyüzü şaftı (y=20..-300) tam 15 taşır; üstü kapanınca tüm şaft söner (artımlı = referans)', () => {
    const w = makeGrid(1, 1);
    const c = w.get(0, 0);
    for (let y = GROUND; y >= -300; y--) c.set(8, y, 8, 0);
    c.recomputeColumn(8, 8);
    const cells = [];
    for (let y = GROUND; y >= -300; y--) cells.push(8, y, 8);
    updateLightBulk(w.get, cells);
    expect(sky(w, 8, -300, 8)).toBe(15);
    expect(sky(w, 8, -1, 8)).toBe(15);
    expect(sky(w, 8, 0, 8)).toBe(15);
    expect(sky(w, 8, -301, 8)).toBe(0);
    expectSameAsReference(w);
    edit(w, 8, GROUND + 3, 8, B.STONE);
    expect(sky(w, 8, GROUND + 2, 8)).toBeLessThan(15);
    // üstü kapalı şaftın içi artık gökyüzü ışığı almaz (yanal sızıntı yalnız tepe çevresinde)
    expect(sky(w, 8, -300, 8)).toBe(0);
    expect(sky(w, 8, -100, 8)).toBe(0);
    expectSameAsReference(w);
  });

  it('tembel derin kesitler sonradan eklenince (lightNewSection) tam hesapla aynı ışığı verir', () => {
    const SH = 8;
    const inCave = (x, y, z) => y >= -40 && y <= -1 && z >= 5 && z <= 11 && x >= 5 && x <= 11;
    const deepSection = (si) => {
      const base = WORLD_Y_MIN + si * 16;
      const blocks = new Uint8Array(4096);
      for (let ly = 0; ly < 16; ly++) {
        for (let z = 0; z < 16; z++) {
          for (let x = 0; x < 16; x++) {
            const y = base + ly;
            let id = B.STONE;
            if (inCave(x, y, z) || (x === SH && z === SH && y === -1)) id = 0;
            if (y === -20 && x === 6 && z === 6) id = B.TORCH;
            blocks[(ly << 8) + (z << 4) + x] = id;
          }
        }
      }
      return blocks;
    };
    const surface = (c) => {
      for (let y = 0; y <= GROUND; y++) {
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.set(x, y, z, x === SH && z === SH ? 0 : B.STONE);
      }
    };
    const full = new Chunk(0, 0);
    for (let si = 0; si < DEEP_SECTIONS; si++) full.setSection(si, deepSection(si), 0);
    surface(full);
    full.recomputeHeightMap();
    full.generated = true;
    computeChunkLight(full);

    const lazy = new Chunk(0, 0, { lazy: true });
    for (let si = DEEP_SECTIONS; si < 48; si++) lazy.fillSection(si, 0);
    surface(lazy);
    lazy.recomputeHeightMap();
    lazy.generated = true;
    computeChunkLight(lazy);
    const map = new Map([['0,0', lazy]]);
    const get = (cx, cz) => map.get(cx + ',' + cz) || null;
    // rastgele sırada ekle (belirlenimci karıştırma)
    const order = [];
    for (let si = 0; si < DEEP_SECTIONS; si++) order.push(si);
    const rnd = mulberry32(99);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    for (let k = 0; k < order.length; k++) {
      lazy.setSection(order[k], deepSection(order[k]), 0);
      lightNewSection(get, lazy, order[k]);
    }
    lazy.recomputeHeightMap();
    sameLight(lazy, full, 'tembel≠tam');
  });
});

describe('artımlı güncelleme == tam hesap', () => {
  it('tavan açılınca sütun 15 ile dolar, kapanınca söner', () => {
    const w = makeGrid(1, 1, (c) => {
      for (let x = 3; x <= 12; x++) for (let z = 3; z <= 12; z++) c.set(x, GROUND + 6, z, B.STONE);
    });
    expect(sky(w, 8, GROUND + 3, 8)).toBeLessThan(15);
    edit(w, 8, GROUND + 6, 8, 0);
    expect(sky(w, 8, GROUND + 5, 8)).toBe(15);
    expect(sky(w, 8, GROUND + 1, 8)).toBe(15);
    expectSameAsReference(w);
    edit(w, 8, GROUND + 6, 8, B.STONE);
    expect(sky(w, 8, GROUND + 2, 8)).toBeLessThan(15);
    expectSameAsReference(w);
  });

  it('dünya tavanında yerleştirilen/kaldırılan blok', () => {
    const w = makeGrid(1, 1);
    const top = w.get(0, 0).yTop - 1;
    edit(w, 8, top, 8, B.STONE);
    expect(sky(w, 8, top - 1, 8)).toBeLessThan(15);
    expectSameAsReference(w);
    edit(w, 8, top, 8, 0);
    expect(sky(w, 8, top - 1, 8)).toBe(15);
    expectSameAsReference(w);
  });

  it('rastgele düzenleme dizisi (2×2 chunk) her adımda referansla birebir aynıdır', () => {
    const w = makeGrid(2, 2);
    const rnd = mulberry32(20261016);
    const palette = [
      0, 0, 0, B.STONE, B.STONE, B.TORCH, B.GLASS, B.WATER, B.LEAVES_OAK, B.LANTERN, B.CRYSTAL_ROCK,
      B.LAVA, B.SLAB, B.DIRT, B.TALL_GRASS, B.ICE,
    ];
    for (let step = 0; step < 260; step++) {
      const x = 4 + Math.floor(rnd() * 24);
      const z = 4 + Math.floor(rnd() * 24);
      const y = GROUND - 4 + Math.floor(rnd() * 22);
      const id = palette[Math.floor(rnd() * palette.length)];
      edit(w, x, y, z, id);
      if (step % 26 === 25) expectSameAsReference(w);
    }
    expectSameAsReference(w);
  });

  it('derin rastgele düzenleme (y -64..0, kesit sınırları dahil) referansla birebir aynıdır', () => {
    const w = makeGrid(2, 1, (c) => {
      for (let y = -60; y <= -5; y++) for (let z = 2; z <= 13; z++) for (let x = 2; x <= 13; x++) c.set(x, y, z, 0);
    });
    const rnd = mulberry32(31337);
    const palette = [B.STONE, B.TORCH, 0, B.LAVA, B.CRYSTAL_ROCK, B.WATER, B.GLASS];
    for (let step = 0; step < 160; step++) {
      const x = 4 + Math.floor(rnd() * 24);
      const z = 4 + Math.floor(rnd() * 8);
      const y = -64 + Math.floor(rnd() * 64);
      edit(w, x, y, z, palette[Math.floor(rnd() * palette.length)]);
      if (step % 40 === 39) expectSameAsReference(w);
    }
    expectSameAsReference(w);
  });

  it('toplu güncelleme (updateLightBulk) referansla aynıdır', () => {
    const w = makeGrid(2, 2);
    const rnd = mulberry32(777);
    for (let i = 0; i < 12; i++) {
      edit(w, 6 + Math.floor(rnd() * 20), GROUND + 1 + Math.floor(rnd() * 4), 6 + Math.floor(rnd() * 20), B.TORCH);
    }
    const cells = [];
    for (let i = 0; i < 90; i++) {
      const x = 5 + Math.floor(rnd() * 22);
      const z = 5 + Math.floor(rnd() * 22);
      const y = GROUND - 2 + Math.floor(rnd() * 12);
      const id = rnd() < 0.5 ? B.STONE : 0;
      const c = w.get(x >> 4, z >> 4);
      c.set(x & 15, y, z & 15, id);
      c.recomputeColumn(x & 15, z & 15);
      cells.push(x, y, z);
    }
    const touched = updateLightBulk(w.get, cells);
    expect(touched.length).toBeGreaterThan(0);
    expectSameAsReference(w);
  });

  it('dokunulan chunk\'lar dirty işaretlenir', () => {
    const w = makeGrid(2, 1);
    w.grid.forEach((c) => {
      c.dirty = false;
    });
    const v0 = w.get(1, 0).version;
    edit(w, 14, GROUND + 1, 8, B.TORCH);
    expect(w.get(0, 0).dirty).toBe(true);
    expect(w.get(1, 0).dirty).toBe(true);
    expect(w.get(1, 0).version).toBeGreaterThan(v0);
  });

  it('eksik komşu chunk sorun çıkarmaz (alan dışı yayılım yok sayılır)', () => {
    const w = makeGrid(1, 1);
    edit(w, 0, GROUND + 1, 0, B.TORCH);
    expect(blk(w, 0, GROUND + 1, 0)).toBe(14);
    expect(blk(w, 1, GROUND + 1, 0)).toBe(13);
  });
});
