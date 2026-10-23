import { describe, it, expect } from 'vitest';
import { World } from '../sim/world.js';
import { chunkId } from '../sim/chunk.js';
import { generateSection } from '../sim/worldgen.js';
import { B } from '../sim/blocks.js';
import { meshChunk } from './mesher.js';
import {
  BAND_SECTIONS, MESH_DEFAULTS, applyPackedToChunk, bandCount, bandOfSection, bandRange, chunkToTransfer, chunkToWire,
  generateChunkData, generateSectionsData, makeGenContext, meshFromWire, packEdits,
} from './chunkMgrCore.js';
import { adoptChunk, adoptSections } from './chunkMgrWorld.js';

const SEED = 20260101;

function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Chunk'ın tüm üretilmiş kesitleri (blok + ışık) birebir aynı mı? */
function sameChunk(a, b) {
  for (let si = 0; si < a.sectionCount; si++) {
    const ba = a.getSectionBlocks(si);
    const bb = b.getSectionBlocks(si);
    if ((ba === null) !== (bb === null)) return false;
    if (ba !== null && !equalBytes(ba, bb)) return false;
    const la = a.getSectionLight(si);
    const lb = b.getSectionLight(si);
    if ((la === null) !== (lb === null)) return false;
    if (la !== null && !equalBytes(la, lb)) return false;
  }
  return equalBytes(a.heightMap, b.heightMap) && equalBytes(a.biomeMap, b.biomeMap);
}

describe('mesh bantları', () => {
  it('3 kesit = 48 blok; macera 16 bant, legacy 3 bant; aralık ve kesit→bant eşlemesi', () => {
    expect(BAND_SECTIONS).toBe(3);
    expect(bandCount(48)).toBe(16);
    expect(bandCount(8)).toBe(3);
    expect(bandRange(0, 48)).toEqual({ s0: 0, ns: 3 });
    expect(bandRange(15, 48)).toEqual({ s0: 45, ns: 3 });
    expect(bandRange(2, 8)).toEqual({ s0: 6, ns: 2 });
    expect(bandOfSection(0)).toBe(0);
    expect(bandOfSection(2)).toBe(0);
    expect(bandOfSection(3)).toBe(1);
    expect(bandOfSection(47)).toBe(15);
    // yüzey (y 32..79) tek bantta: si 27..29
    expect(bandOfSection(27)).toBe(9);
    expect(bandOfSection(29)).toBe(9);
  });
});

describe('generateChunkData', () => {
  it('World#ensureChunk ile birebir aynı yüzey bandı (blok/ışık/yükseklik/biyom) üretir (macera)', () => {
    const w = new World({ seed: SEED, mode: 'macera' });
    const g = makeGenContext({ seed: w.seed, mode: 'macera' });
    for (const [cx, cz] of [[0, 0], [3, -2], [-3, 4], [3, 3]]) {
      const ref = w.ensureChunk(cx, cz);
      const mine = generateChunkData(g, cx, cz, 0, null, null);
      expect(sameChunk(mine, ref)).toBe(true);
      expect(mine.generated).toBe(true);
      for (let si = 0; si < 25; si++) expect(mine.secGen[si]).toBe(0); // derin kesitler tembel
    }
  });

  it('belirlenimci: aynı girdi aynı çıktı', () => {
    const g = makeGenContext({ seed: SEED });
    const a = generateChunkData(g, 2, 2, 0, null, null);
    const b = generateChunkData(g, 2, 2, 0, null, null);
    expect(sameChunk(a, b)).toBe(true);
  });

  it('ışık hesaplanır (gökyüzü ışığı üstte 15; üstü açık kesitler tek tip, dizisiz)', () => {
    const g = makeGenContext({ seed: SEED });
    const c = generateChunkData(g, 0, 0, 0, null, null);
    expect(c.getLight(8, 367, 8) >> 4).toBe(15);
    expect(c.getLight(8, 127, 8) >> 4).toBe(15);
    expect(c.secLight[47]).toBeNull();
    expect(c.secLightU[47]).toBe(0xf0);
    expect(c.secBlocks[47]).toBeNull();
  });

  it('düzenlemeler üretimden sonra uygulanır ve chunk edited olur (derin kesit düzenlemesi bekler)', () => {
    const g = makeGenContext({ seed: SEED });
    const base = generateChunkData(g, 1, 1, 0, null, null);
    // idx = ((y - yMin) << 8) + (z << 4) + x
    const idx = ((300 + 400) << 8) + 5 * 16 + 5;
    const deepIdx = ((-100 + 400) << 8) + 5 * 16 + 5;
    expect(base.get(5, 300, 5)).toBe(B.AIR);
    const packed = packEdits(new Map([[idx, B.STONE], [deepIdx, B.BRICK]]));
    const ed = generateChunkData(g, 1, 1, 0, packed, null);
    expect(ed.get(5, 300, 5)).toBe(B.STONE);
    expect(ed.edited).toBe(true);
    expect(ed.heightMap[5 * 16 + 5]).toBeGreaterThanOrEqual(300);
    expect(ed.secGen[(-100 + 400) >> 4]).toBe(0);
    expect(applyPackedToChunk(ed, packed)).toBe(1); // yalnız üretilmiş (yüzey) kesit; derin kesit atlanır (sonra uygulanır)
  });

  it('World düzenlemeleriyle (setBlock → _editsByChunk) aynı sonuç: kaldırılan chunk yeniden üretilince düzenleme geri gelir', () => {
    const w = new World({ seed: SEED });
    w.ensureChunk(0, 0);
    const y = w.surfaceY(4, 4);
    w.setBlock(4, y + 3, 4, B.BRICK);
    const map = w._editsByChunk.get(chunkId(0, 0));
    const g = makeGenContext({ seed: w.seed });
    const c = generateChunkData(g, 0, 0, 0, packEdits(map), null);
    expect(c.get(4, y + 3, 4)).toBe(B.BRICK);
  });

  it('harita katmanı (overlay) tabanın üstüne yazılır (legacy chunk)', () => {
    const g = makeGenContext({ seed: SEED, mode: 'insa', base: 'düz' });
    const overlay = new Uint8Array(32768);
    overlay[(70 << 8) + 3 * 16 + 3] = B.STONE;
    const c = generateChunkData(g, 2, 2, 0, null, overlay);
    expect(c.legacy).toBe(true);
    expect(c.sectionCount).toBe(8);
    expect(c.get(3, 70, 3)).toBe(B.STONE);
    expect(c.get(0, 0, 0)).toBe(0);
  });

  it('inşa modunda taban dünya üretir', () => {
    const g = makeGenContext({ seed: 5, mode: 'insa', base: 'düz' });
    const c = generateChunkData(g, 3, 3, 0, null, null);
    expect(c.countSolid()).toBeGreaterThan(1000);
  });
});

describe('generateSectionsData (derin kesitler)', () => {
  it('generateSection ile birebir aynı; tek tip kesitler sayı olarak döner; düzenlemeler uygulanır', () => {
    const g = makeGenContext({ seed: SEED });
    const sis = [0, 1, 7, 12, 18, 24];
    const r = generateSectionsData(g, 3, -2, sis, 0, null);
    expect(r.list.map((x) => x.si)).toEqual(sis);
    r.list.forEach((it) => {
      const d = generateSection(SEED, 3, -2, it.si, {});
      if (typeof it.b === 'number') {
        expect(d.blocks).toBeNull();
        expect(d.uniform).toBe(it.b);
      } else {
        expect(equalBytes(it.b, d.blocks)).toBe(true);
      }
    });
    const idx = (12 << 12) + 7;
    const e = generateSectionsData(g, 3, -2, [12], 0, packEdits(new Map([[idx, B.GOLD_BLOCK]])));
    const blocks = typeof e.list[0].b === 'number' ? null : e.list[0].b;
    expect(blocks).not.toBeNull();
    expect(blocks[7]).toBe(B.GOLD_BLOCK);
    // aktarılacak tamponlar yalnız gerçek diziler
    expect(e.transfer.length).toBe(1);
  });

  it('işçiden gelen kesitler World#ensureSection ile aynı sonucu (blok + ışık) verir (adoptSections)', () => {
    const a = new World({ seed: SEED });
    const b = new World({ seed: SEED });
    [a, b].forEach((w) => {
      w.ensureChunk(0, 0);
      w.ensureChunk(1, 0);
    });
    const g = makeGenContext({ seed: SEED });
    const sis = [10, 11, 12, 13];
    sis.forEach((si) => a.ensureSection(0, 0, si));
    const r = generateSectionsData(g, 0, 0, sis, 0, null);
    expect(adoptSections(b, 0, 0, r.list)).toBe(sis.length);
    sis.forEach((si) => {
      expect(equalBytes(a.getChunk(0, 0).getSectionBlocks(si), b.getChunk(0, 0).getSectionBlocks(si))).toBe(true);
      expect(equalBytes(a.getChunk(0, 0).getSectionLight(si), b.getChunk(0, 0).getSectionLight(si))).toBe(true);
    });
    // aynı kesit ikinci kez alınmaz
    expect(adoptSections(b, 0, 0, r.list)).toBe(0);
  });
});

describe('packEdits / applyPackedToChunk', () => {
  it('boş ya da null → null', () => {
    expect(packEdits(null)).toBeNull();
    expect(packEdits(new Map())).toBeNull();
  });

  it('gidiş-dönüş (kesit sınırları, en uçtaki indeks ve kimlik dahil)', () => {
    const w = new World({ seed: SEED });
    const c = w.ensureChunk(0, 0);
    const idxTop = (767 << 8) + 15; // y=367 (macera üst satır), x=15
    const idxMid = ((100 + 400) << 8) + (3 << 4) + 4; // y=100
    const idxEdge = ((16 + 400) << 8); // y=16 (kesit başı)
    const m = new Map([[idxTop, 127], [idxMid, 99], [idxEdge, 254]]);
    const p = packEdits(m);
    expect(p).toBeInstanceOf(Uint32Array);
    expect(applyPackedToChunk(c, p)).toBe(3);
    expect(c.get(15, 367, 0)).toBe(127);
    expect(c.get(4, 100, 3)).toBe(99);
    expect(c.get(0, 16, 0)).toBe(254);
    // yalnız belirli kesit
    const c2 = new World({ seed: SEED }).ensureChunk(0, 0);
    expect(applyPackedToChunk(c2, p, (100 + 400) >> 4)).toBe(1);
    expect(c2.get(4, 100, 3)).toBe(99);
    expect(c2.get(15, 367, 0)).toBe(0);
  });
});

describe('chunkToTransfer / adoptChunk', () => {
  it('işçi → ana thread: sütun aktarımı ensureChunk ile aynı ışığı verir (dikişten sonra)', () => {
    const wRef = new World({ seed: SEED });
    const order = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]];
    order.forEach(([cx, cz]) => wRef.ensureChunk(cx, cz));

    const w2 = new World({ seed: SEED });
    const g = makeGenContext({ seed: w2.seed });
    order.forEach(([cx, cz]) => {
      const tr = chunkToTransfer(generateChunkData(g, cx, cz, 0, null, null));
      expect(tr.transfer.length).toBeGreaterThan(2);
      adoptChunk(w2, tr.data);
    });
    order.forEach(([cx, cz]) => {
      expect(sameChunk(w2.getChunk(cx, cz), wRef.getChunk(cx, cz))).toBe(true);
    });
  });

  it('paylaşılan tek tip diziler aktarım listesine girmez; kesit sayısı doğru', () => {
    const g = makeGenContext({ seed: SEED });
    const c = generateChunkData(g, 0, 0, 0, null, null);
    const tr = chunkToTransfer(c);
    expect(tr.data.secs.length).toBe(c.generatedSections() * 3);
    const bufs = new Set(tr.transfer);
    expect(bufs.size).toBe(tr.transfer.length);
    for (let si = 0; si < 48; si++) {
      if (c.secGen[si] === 0) continue;
      const shared = c.secBlocks[si] === null ? c.getSectionBlocks(si).buffer : null;
      if (shared) expect(bufs.has(shared)).toBe(false);
    }
  });
});

describe('meshFromWire', () => {
  function threeByThree(w) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) w.ensureChunk(dx, dz);
    const c = w.getChunk(0, 0);
    const nb = {
      n: w.getChunk(0, -1), s: w.getChunk(0, 1), e: w.getChunk(1, 0), w: w.getChunk(-1, 0),
      ne: w.getChunk(1, -1), nw: w.getChunk(-1, -1), se: w.getChunk(1, 1), sw: w.getChunk(-1, 1),
    };
    return { c, nb };
  }

  it('chunk + komşu için meshChunk ile aynı çıktıyı verir ve varsayılanlar stairs:fixed', () => {
    const w = new World({ seed: SEED });
    const { c, nb } = threeByThree(w);
    const a = meshFromWire(c, nb, undefined);
    const b = meshChunk(c, nb, undefined, MESH_DEFAULTS);
    expect(a.stats.vertices).toBe(b.stats.vertices);
    expect(a.stats.triangles).toBeGreaterThan(100);
    expect(equalBytes(new Uint8Array(a.opaque.pos.buffer), new Uint8Array(b.opaque.pos.buffer))).toBe(true);
    expect(MESH_DEFAULTS.stairs).toBe('fixed');
  });

  it('tel nesnesi (chunkToWire, band kesitleri + dikey komşular) Chunk ile AYNI mesh\'i verir', () => {
    const w = new World({ seed: SEED });
    const { c, nb } = threeByThree(w);
    const band = bandRange(9, 48); // y 32..79 yüzey bandı
    const wc = chunkToWire(c, band.s0 - 1, band.s0 + band.ns);
    expect(Object.keys(wc).sort()).toEqual(['biomeMap', 'cx', 'cz', 's0', 'sb', 'sectionCount', 'sl', 'yMin']);
    expect(wc.sb.length).toBe(band.ns + 2);
    const wn = {};
    Object.keys(nb).forEach((k) => {
      wn[k] = chunkToWire(nb[k], band.s0 - 1, band.s0 + band.ns);
    });
    const direct = meshFromWire(c, nb, undefined, undefined, 0, band);
    const wired = meshFromWire(wc, wn, undefined, undefined, 0, band);
    expect(direct.stats.triangles).toBeGreaterThan(100);
    expect(wired.stats.vertices).toBe(direct.stats.vertices);
    expect(equalBytes(new Uint8Array(wired.opaque.pos.buffer), new Uint8Array(direct.opaque.pos.buffer))).toBe(true);
    expect(equalBytes(new Uint8Array(wired.opaque.light.buffer), new Uint8Array(direct.opaque.light.buffer))).toBe(true);
    expect(wired.baseY).toBe(32);
    expect(direct.baseY).toBe(32);
  });

  it('bantlar birleşince tüm sütunun yüzlerini kapsar: üç bitişik bandın üçgen toplamı ≥ tek bantlar toplamı ve boş bant boş mesh', () => {
    const w = new World({ seed: SEED });
    const { c, nb } = threeByThree(w);
    let total = 0;
    for (let b = 8; b <= 11; b++) total += meshFromWire(c, nb, undefined, undefined, 0, bandRange(b, 48)).stats.triangles;
    expect(total).toBeGreaterThan(100);
    // en üst bant (y 320..367) tamamen hava → boş
    const top = meshFromWire(c, nb, undefined, undefined, 0, bandRange(15, 48));
    expect(top.stats.triangles).toBe(0);
    expect(top.baseY).toBe(320);
  });
});

describe('meshFromWire: kademe 2 (çok uzak) küçük bitkileri atlar', () => {
  it('darkLod=2 → farFlora; darkLod=1 → bitkiler durur', () => {
    const VOL = 16 * 16 * 128;
    const c = { cx: 0, cz: 0, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL).fill(0xf0), biomeMap: new Uint8Array(256) };
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) c.blocks[((10 * 16) + z) * 16 + x] = B.GRASS;
    for (let i = 0; i < 6; i++) c.blocks[((11 * 16) + 3 + i) * 16 + 5] = B.TALL_GRASS;
    const l0 = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 0);
    const l1 = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 1);
    const l2 = meshFromWire(c, {}, null, { nullNeighbor: 'air' }, 2);
    expect(l0.cutout.vertexCount).toBe(6 * 16);
    expect(l1.cutout.vertexCount).toBe(6 * 16);
    expect(l2.cutout.vertexCount).toBe(0);
    expect(l2.opaque.vertexCount).toBe(l1.opaque.vertexCount);
  });
});
