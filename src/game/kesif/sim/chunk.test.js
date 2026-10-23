import { describe, expect, it } from 'vitest';
import {
  CHUNK_AREA, CHUNK_VOLUME, SECTION_VOLUME, WORLD_SECTION_COUNT, WORLD_Y_MIN,
} from './constants.js';
import {
  Chunk, chunkCoord, chunkId, chunkKey, parseChunkKey, uniformArray, uniformValueOf,
} from './chunk.js';

describe('Chunk (kesitli sütun)', () => {
  it('macera düzeniyle kurulur: 48 kesit, y -400..367, tüm kesitler üretilmiş hava', () => {
    const c = new Chunk(3, -2);
    expect(c.cx).toBe(3);
    expect(c.cz).toBe(-2);
    expect(c.legacy).toBe(false);
    expect(c.yMin).toBe(WORLD_Y_MIN);
    expect(c.sectionCount).toBe(WORLD_SECTION_COUNT);
    expect(c.yTop).toBe(368);
    expect(c.heightMap).toBeInstanceOf(Int16Array);
    expect(c.heightMap.length).toBe(CHUNK_AREA);
    expect(c.biomeMap.length).toBe(CHUNK_AREA);
    expect(c.generatedSections()).toBe(48);
    expect(c.isEmpty()).toBe(true);
    expect(c.dirty).toBe(true);
    expect(c.generated).toBe(false);
    expect(c.edited).toBe(false);
    expect(c.version).toBe(0);
    expect(c.originX).toBe(48);
    expect(c.originZ).toBe(-32);
    // tek tip kesitler dizi tutmaz
    for (let si = 0; si < c.sectionCount; si++) {
      expect(c.secBlocks[si]).toBeNull();
      expect(c.secLight[si]).toBeNull();
    }
  });

  it('lazy: kesitler üretilmemiş başlar; legacy: 8 kesit y 0..127', () => {
    const lz = new Chunk(0, 0, { lazy: true });
    expect(lz.generatedSections()).toBe(0);
    expect(lz.get(1, 5, 1)).toBe(0);
    const lg = new Chunk(0, 0, { legacy: true });
    expect(lg.legacy).toBe(true);
    expect(lg.yMin).toBe(0);
    expect(lg.sectionCount).toBe(8);
    expect(lg.yTop).toBe(128);
    expect(lg.inRangeY(127)).toBe(true);
    expect(lg.inRangeY(128)).toBe(false);
    expect(lg.inRangeY(-1)).toBe(false);
  });

  it('get/set mutlak y (negatif dahil), kesit sınırlarında doğru kesite düşer', () => {
    const c = new Chunk(0, 0);
    expect(c.set(5, 77, 9, 42)).toBe(true);
    expect(c.get(5, 77, 9)).toBe(42);
    expect(c.get(5, 76, 9)).toBe(0);
    expect(c.set(5, 77, 9, 42)).toBe(false); // aynı değer
    // kesit sınırları: y=-1/0, 15/16, -17/-16, taban ve tavan
    const ys = [-400, -385, -384, -17, -16, -1, 0, 15, 16, 367];
    ys.forEach((y, i) => c.set(i, y, i, 10 + i));
    ys.forEach((y, i) => expect(c.get(i, y, i)).toBe(10 + i));
    expect(c.sectionOfY(-1)).toBe(24);
    expect(c.sectionOfY(0)).toBe(25);
    expect(c.sectionBase(24)).toBe(-16);
    // aralık dışı
    expect(c.set(0, -401, 0, 1)).toBe(false);
    expect(c.set(0, 368, 0, 1)).toBe(false);
    expect(c.get(0, -401, 0)).toBe(0);
    expect(c.get(0, 400, 0)).toBe(0);
  });

  it('tek tip kesitler yazılınca gerçek diziye çevrilir; compactSection geri tek tipe indirir', () => {
    const c = new Chunk(0, 0);
    c.fillSection(3, 7);
    expect(c.isUniformSection(3)).toBe(true);
    expect(c.uniformId(3)).toBe(7);
    expect(c.get(1, WORLD_Y_MIN + 3 * 16 + 4, 1)).toBe(7);
    c.set(1, WORLD_Y_MIN + 3 * 16 + 4, 1, 9);
    expect(c.isUniformSection(3)).toBe(false);
    expect(c.secBlocks[3]).toBeInstanceOf(Uint8Array);
    expect(c.get(0, WORLD_Y_MIN + 3 * 16, 0)).toBe(7); // geri kalan hücreler 7 kaldı
    expect(c.compactSection(3)).toBe(false);
    c.set(1, WORLD_Y_MIN + 3 * 16 + 4, 1, 7);
    expect(c.compactSection(3)).toBe(true);
    expect(c.secBlocks[3]).toBeNull();
    expect(c.uniformId(3)).toBe(7);
  });

  it('paylaşılan tek tip diziler okunur ama gerçek yazma dizisi ayrıdır', () => {
    const c = new Chunk(0, 0);
    c.fillSection(5, 3);
    const ro = c.getSectionBlocks(5);
    expect(ro).toBe(uniformArray(3));
    expect(ro.length).toBe(SECTION_VOLUME);
    expect(uniformValueOf(ro)).toBe(3);
    const rw = c.getSectionBlocksW(5);
    expect(rw).not.toBe(ro);
    rw[10] = 4;
    expect(uniformArray(3)[10]).toBe(3);
    expect(c.getSectionBlocks(0)).toBe(uniformArray(0));
    expect(new Chunk(0, 0, { lazy: true }).getSectionBlocks(2)).toBeNull();
  });

  it('ışık: tek tip ışık dizisiz, yazınca gerçek dizi, compactLight tek tipe indirir', () => {
    const c = new Chunk(0, 0);
    expect(c.getLight(0, 10, 0)).toBe(0);
    c.setSectionLightUniform(30, 0xf0);
    expect(c.getLight(2, 3 * 16 - 400 + 30 * 0 + 14 * 16, 2)).toBeDefined();
    const y = WORLD_Y_MIN + 30 * 16 + 5;
    expect(c.getLight(1, y, 1)).toBe(0xf0);
    expect(c.getSkyLight(1, y, 1)).toBe(15);
    c.setLight(1, y, 1, 0xab);
    expect(c.secLight[30]).toBeInstanceOf(Uint8Array);
    expect(c.getSkyLight(1, y, 1)).toBe(0xa);
    expect(c.getBlockLight(1, y, 1)).toBe(0xb);
    expect(c.getLight(2, y, 1)).toBe(0xf0);
    expect(c.compactLight(30)).toBe(false);
    c.setLight(1, y, 1, 0xf0);
    expect(c.compactLight(30)).toBe(true);
    expect(c.secLight[30]).toBeNull();
    expect(c.lightUniformId(30)).toBe(0xf0);
    // üretilmemiş kesitte ışık 0
    const lz = new Chunk(0, 0, { lazy: true });
    expect(lz.getLight(0, 10, 0)).toBe(0);
  });

  it('heightMap en üstteki hava-olmayan bloğu bulur (mutlak y); boş sütun yMin; üretilmemiş kesit katı sayılır', () => {
    const c = new Chunk(0, 0);
    c.recomputeHeightMap();
    expect(c.topY(4, 4)).toBe(WORLD_Y_MIN);
    c.set(4, 30, 4, 1);
    c.set(4, 55, 4, 3);
    c.set(0, 367, 15, 9);
    c.set(7, -123, 7, 5);
    c.recomputeHeightMap();
    expect(c.topY(4, 4)).toBe(55);
    expect(c.topY(0, 15)).toBe(367);
    expect(c.topY(7, 7)).toBe(-123);
    c.set(4, 55, 4, 0);
    expect(c.recomputeColumn(4, 4)).toBe(30);
    // üretilmemiş kesit: tarama orada durur (bilinmeyen katı)
    const lz = new Chunk(0, 0, { lazy: true });
    for (let si = 40; si < 48; si++) lz.fillSection(si, 0);
    expect(lz.recomputeColumn(0, 0)).toBe(WORLD_Y_MIN + 39 * 16 + 15);
  });

  it('markDirty tüm kesit sürümlerini, markSectionDirty yalnız birini günceller; sectionsVersion aralık en yenisi', () => {
    const c = new Chunk(0, 0);
    c.dirty = false;
    c.markDirty();
    expect(c.dirty).toBe(true);
    expect(c.version).toBe(1);
    expect(c.secVersion[10]).toBe(1);
    c.markDirty();
    expect(c.version).toBe(2);
    c.markSectionDirty(10);
    expect(c.version).toBe(3);
    expect(c.secVersion[10]).toBe(3);
    expect(c.secVersion[11]).toBe(2);
    expect(c.sectionsVersion(10, 12)).toBe(3);
    expect(c.sectionsVersion(11, 12)).toBe(2);
    expect(c.sectionsVersion(-5, 100)).toBe(3);
    c.markSectionDirty(-1); // aralık dışı: etkisiz
    c.markSectionDirty(99);
    expect(c.version).toBe(3);
  });

  it('fromBlocks (legacy 32768) kopyalar, uzunluğu doğrular, heightMap hesaplar; toDense gidiş-dönüş', () => {
    const src = new Uint8Array(CHUNK_VOLUME);
    src[((10 * 16) + 3) * 16 + 2] = 7;
    src[((100 * 16) + 5) * 16 + 5] = 9;
    const c = Chunk.fromBlocks(1, 1, src);
    expect(c.legacy).toBe(true);
    expect(c.generated).toBe(true);
    expect(c.topY(2, 3)).toBe(10);
    expect(c.topY(5, 5)).toBe(100);
    src[((10 * 16) + 3) * 16 + 2] = 0;
    expect(c.get(2, 10, 3)).toBe(7);
    expect(() => Chunk.fromBlocks(0, 0, new Uint8Array(10))).toThrow(RangeError);
    const back = c.toDense(0, 128);
    expect(back.length).toBe(CHUNK_VOLUME);
    expect(back[((10 * 16) + 3) * 16 + 2]).toBe(7);
    expect(back[((100 * 16) + 5) * 16 + 5]).toBe(9);
    // yalnız dolu kesitler dizi tutar
    expect(c.secBlocks[0]).toBeInstanceOf(Uint8Array);
    expect(c.secBlocks[1]).toBeNull();
    expect(c.secBlocks[6]).toBeInstanceOf(Uint8Array);
  });

  it('loadDense: maxRow üstündeki satırlar taranmadan tek tip hava; toDense macerada negatif aralığı da okur', () => {
    const c = new Chunk(0, 0, { lazy: true });
    const dense = new Uint8Array(368 * 256);
    dense[(50 << 8) + 5] = 3;
    dense[(300 << 8) + 6] = 4; // maxRow'un üstünde → yok sayılır (taranmaz)
    c.loadDense(dense, 0, 60);
    expect(c.get(5, 50, 0)).toBe(3);
    expect(c.get(6, 300, 0)).toBe(0);
    expect(c.isUniformSection((300 + 400) >> 4)).toBe(true);
    c.fillSection(10, 5);
    const d = c.toDense(-400 + 10 * 16 - 16, 48);
    expect(d[16 * 256]).toBe(5);
    expect(d[0]).toBe(0);
  });

  it('clone derin kopyadır (ışık dahil)', () => {
    const c = new Chunk(2, 2);
    c.set(1, 1, 1, 5);
    c.set(1, -50, 1, 8);
    c.setSectionLightUniform(28, 0xf0);
    c.setLight(3, 70, 3, 0x12);
    c.biomeMap[3] = 4;
    c.generated = true;
    const d = c.clone();
    c.set(1, 1, 1, 6);
    c.setLight(3, 70, 3, 0x34);
    c.biomeMap[3] = 1;
    expect(d.get(1, 1, 1)).toBe(5);
    expect(d.get(1, -50, 1)).toBe(8);
    expect(d.getLight(3, 70, 3)).toBe(0x12);
    expect(d.biomeMap[3]).toBe(4);
    expect(d.generated).toBe(true);
    expect(d.cx).toBe(2);
  });

  it('isEmpty / countSolid / bellek tahmini', () => {
    const c = new Chunk(0, 0);
    expect(c.isEmpty()).toBe(true);
    c.set(0, -300, 0, 1);
    c.set(1, 0, 0, 1);
    expect(c.isEmpty()).toBe(false);
    expect(c.countSolid()).toBe(2);
    c.fillSection(0, 1);
    expect(c.countSolid()).toBe(2 + 4096);
    const small = new Chunk(0, 0).memoryBytes();
    expect(small).toBeLessThan(4000); // tamamı tek tip: yalnız harita + sabit alanlar
    c.set(0, 100, 0, 3);
    expect(c.memoryBytes()).toBeGreaterThan(small);
  });
});

describe('chunk anahtarları', () => {
  it('chunkKey / parseChunkKey gidiş dönüş (negatifler dahil)', () => {
    expect(chunkKey(3, -4)).toBe('3,-4');
    expect(parseChunkKey('3,-4')).toEqual({ cx: 3, cz: -4 });
    expect(parseChunkKey('x,1')).toBeNull();
    expect(parseChunkKey('1.5,2')).toBeNull();
    expect(parseChunkKey('12')).toBeNull();
    expect(parseChunkKey(5)).toBeNull();
  });

  it('chunkId çakışmaz', () => {
    const seen = new Set();
    for (let x = -30; x <= 30; x++) {
      for (let z = -30; z <= 30; z++) seen.add(chunkId(x, z));
    }
    expect(seen.size).toBe(61 * 61);
  });

  it('chunkCoord negatifte aşağı yuvarlar', () => {
    expect(chunkCoord(0)).toBe(0);
    expect(chunkCoord(15)).toBe(0);
    expect(chunkCoord(16)).toBe(1);
    expect(chunkCoord(-1)).toBe(-1);
    expect(chunkCoord(-16)).toBe(-1);
    expect(chunkCoord(-17)).toBe(-2);
  });
});
