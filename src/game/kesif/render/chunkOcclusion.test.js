import { describe, it, expect } from 'vitest';
import {
  OCC_STRIDE, isGroundId, groundTopAt, computeOccCells, createOcclusion,
} from './chunkOcclusion.js';
import { B } from '../sim/blocks.js';
import { hash2 } from '../sim/rng.js';

const LAYER = 256;
const AIR = 0;

function finishChunk(cx, cz, blocks) {
  const heightMap = new Uint8Array(256);
  for (let col = 0; col < 256; col++) {
    let y = 127;
    while (y > 0 && blocks[y * LAYER + col] === AIR) y--;
    heightMap[col] = y;
  }
  return { cx, cz, blocks, heightMap };
}

/** Yükseklik fonksiyonundan chunk kurar: y < h sütunları taş. carve(x,y,z) → true ise o hücre boşaltılır. */
function makeChunk(cx, cz, hFn, carve) {
  const blocks = new Uint8Array(LAYER * 128);
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const wx = cx * 16 + lx;
      const wz = cz * 16 + lz;
      const h = hFn(wx, wz);
      for (let y = 0; y < h; y++) {
        if (carve && carve(wx, y, wz)) continue;
        blocks[y * LAYER + lz * 16 + lx] = B.STONE;
      }
    }
  }
  return finishChunk(cx, cz, blocks);
}

function setBlk(chunk, x, y, z, id) {
  chunk.blocks[y * LAYER + (z - chunk.cz * 16) * 16 + (x - chunk.cx * 16)] = id;
}

function refresh(chunk) {
  chunk.heightMap = finishChunk(chunk.cx, chunk.cz, chunk.blocks).heightMap;
  return chunk;
}

function rec(chunk, extra) {
  let top = 0;
  for (let i = 0; i < 256; i++) top = Math.max(top, chunk.heightMap[i] + 1);
  return Object.assign({
    cx: chunk.cx,
    cz: chunk.cz,
    occ: computeOccCells(chunk.blocks, chunk.heightMap),
    edited: false,
    hasMesh: true,
    occluded: false,
    box: [chunk.cx * 16, 0, chunk.cz * 16, chunk.cx * 16 + 16, top, chunk.cz * 16 + 16],
  }, extra || {});
}

describe('zemin sınıflaması ve hücre bandı', () => {
  it('yaprak/su/hava zemin sayılmaz, taş/toprak/çimen sayılır', () => {
    expect(isGroundId(B.STONE)).toBe(true);
    expect(isGroundId(B.GRASS)).toBe(true);
    expect(isGroundId(B.WATER)).toBe(false);
    expect(isGroundId(0)).toBe(false);
  });

  it('groundTopAt: yaprak ve su örtüsünü atlayıp alttaki sağlam bloğu bulur', () => {
    const blocks = new Uint8Array(LAYER * 128);
    const hm = new Uint8Array(256);
    for (let y = 0; y < 40; y++) blocks[y * LAYER] = B.STONE;
    for (let y = 40; y < 44; y++) blocks[y * LAYER] = B.WATER;
    hm[0] = 43;
    expect(groundTopAt(blocks, hm, 0, 0)).toBe(40);
    const leaves = Object.keys(B).find((k) => /LEAVES|LEAF/.test(k));
    if (leaves) {
      for (let y = 44; y < 47; y++) blocks[y * LAYER] = B[leaves];
      hm[0] = 46;
      expect(groundTopAt(blocks, hm, 0, 0)).toBe(40);
    }
  });

  it('computeOccCells: topMin = hücredeki en alçak sütun; bandLo = en yüksek sütun bandı (kalınlık 40 ile sınırlı)', () => {
    const c = makeChunk(0, 0, (x, z) => 50 + (x === 5 && z === 1 ? -7 : 0) + (x >= 8 ? 20 : 0));
    const cells = computeOccCells(c.blocks, c.heightMap);
    expect(cells.length).toBe(OCC_STRIDE);
    expect(cells[0]).toBe(50);
    expect(cells[1]).toBe(43); // (5,1) alçak
    expect(cells[2]).toBe(70);
    expect(cells[16]).toBe(10); // 50 yüksek sütun: 50-40
    expect(cells[18]).toBe(30); // 70 yüksek sütun: 70-40
    const low = makeChunk(0, 0, () => 30);
    expect(computeOccCells(low.blocks, low.heightMap)[16]).toBe(0); // dibe kadar dolu
  });

  it('mağara/tünel: sütunun kesintisiz dolu bölümü tavanda biter → bandLo yükselir; hücre bilinmiyorsa 0/0', () => {
    const c = makeChunk(0, 0, () => 60, (x, y) => y >= 30 && y <= 33);
    const cells = computeOccCells(c.blocks, c.heightMap);
    expect(cells[0]).toBe(60);
    expect(cells[16]).toBe(34); // 34..59 dolu
    const e = { blocks: new Uint8Array(LAYER * 128), heightMap: new Uint8Array(256) };
    const ec = computeOccCells(e.blocks, e.heightMap);
    expect(ec[0]).toBe(0);
    expect(ec[16]).toBe(0);
  });
});

describe('createOcclusion: ufuk testi', () => {
  // düz zemin y=60; +x yönünde sırt (x 32..63), arkada uzak chunk'lar
  function scene(ridgeH) {
    const chunks = [];
    for (let cx = 0; cx <= 8; cx++) chunks.push(makeChunk(cx, 0, (x) => (ridgeH && x >= 32 && x < 64 ? ridgeH : 60)));
    return chunks.map((c) => rec(c));
  }

  it('düz arazide hiçbir şey gizlenmez', () => {
    const rs = scene(0);
    const occ = createOcclusion();
    expect(occ.run(8.5, 61.6, 8.5, rs, rs.length)).toBe(0);
    expect(rs.every((r) => !r.occluded)).toBe(true);
  });

  it('sırtın arkasındaki alçak chunk gizlenir, sırtı aşan yüksek chunk görünür', () => {
    const rs = scene(75);
    rs[6].box[4] = 128;
    const occ = createOcclusion();
    const hidden = occ.run(8.5, 61.6, 8.5, rs, rs.length);
    expect(hidden).toBeGreaterThan(0);
    expect(rs[5].occluded).toBe(true);
    expect(rs[7].occluded).toBe(true);
    expect(rs[6].occluded).toBe(false);
    expect(rs[2].occluded).toBe(false);
    expect(rs[0].occluded).toBe(false);
  });

  it('düzenlenmiş tepe tıkayıcı sayılmaz', () => {
    const rs = scene(75);
    rs[2].edited = true;
    rs[3].edited = true;
    const occ = createOcclusion();
    occ.run(8.5, 61.6, 8.5, rs, rs.length);
    expect(rs[5].occluded).toBe(false);
  });

  it('göz zeminin altındayken (tünel/mağara) test tümden kapanır', () => {
    const rs = scene(75);
    const occ = createOcclusion();
    expect(occ.run(8.5, 40, 8.5, rs, rs.length)).toBe(0);
    expect(rs.every((r) => !r.occluded)).toBe(true);
  });

  it('occ verisi olmayan chunk tıkayıcı olmaz ama gizlenebilir', () => {
    const rs = scene(75);
    rs[2].occ = null;
    rs[3].occ = null;
    const occ = createOcclusion();
    occ.run(8.5, 61.6, 8.5, rs, rs.length);
    expect(rs[5].occluded).toBe(false);
    const rs2 = scene(75);
    rs2[7].occ = null;
    occ.run(8.5, 61.6, 8.5, rs2, rs2.length);
    expect(rs2[7].occluded).toBe(true);
  });

  it('tünel: sırtı boydan boya delen tünel arkadaki chunk\'ı görünür bırakır', () => {
    // sırt x 32..63 yükseklik 90; gözün hizasında (y 60..63) z 8..9 şeridinde tünel
    const carve = (x, y, z) => y >= 60 && y <= 63 && z >= 8 && z <= 9;
    const chunks = [];
    for (let cx = 0; cx <= 8; cx++) chunks.push(makeChunk(cx, 0, (x) => (x >= 32 && x < 64 ? 90 : 60), carve));
    const rs = chunks.map((c) => rec(c));
    rs[6].box[4] = 70;
    rs[7].box[4] = 70;
    const occ = createOcclusion();
    occ.run(20.5, 61.6, 8.9, rs, rs.length);
    expect(rs[6].occluded).toBe(false);
    expect(rs[7].occluded).toBe(false);
  });

  it('kemer/çatı: altı boş ince tabaka tıkayıcı değildir', () => {
    const chunks = [];
    for (let cx = 0; cx <= 8; cx++) {
      const c = makeChunk(cx, 0, () => 60);
      if (cx >= 2 && cx <= 3) {
        for (let z = 0; z < 16; z++) {
          for (let lx = 0; lx < 16; lx++) {
            setBlk(c, cx * 16 + lx, 70, z, B.STONE);
            setBlk(c, cx * 16 + lx, 71, z, B.STONE);
          }
        }
      }
      chunks.push(refresh(c));
    }
    const rs = chunks.map((c) => rec(c));
    const occ = createOcclusion();
    occ.run(8.5, 61.6, 8.5, rs, rs.length);
    expect(rs[6].occluded).toBe(false);
    expect(rs[7].occluded).toBe(false);
  });

  it('tekrarlanan çalıştırma bayrakları sıfırlar (sonuç belirlenimci)', () => {
    const rs = scene(75);
    const occ = createOcclusion();
    const a = occ.run(8.5, 61.6, 8.5, rs, rs.length);
    const flags = rs.map((r) => r.occluded);
    const b = occ.run(8.5, 61.6, 8.5, rs, rs.length);
    expect(b).toBe(a);
    expect(rs.map((r) => r.occluded)).toEqual(flags);
    expect(occ.run(8.5, 40, 8.5, rs, rs.length)).toBe(0);
    expect(rs.every((r) => !r.occluded)).toBe(true);
  });
});

/**
 * Özellik testi: rastgele arazi + rastgele mağaralar/tüneller/kemerler (gerçek voksel verisi). Gizlenen her chunk'ın dışa açık
 * yüzlerinin merkezlerinden gözü gören ışın olmamalı (voksel DDA ile gerçek görünürlük): yanlış gizleme sıfır.
 */
describe('createOcclusion: mağaralı/kemerli rastgele arazide yanlış gizleme yok', () => {
  function valueNoise(seed) {
    return (x, z) => {
      let h = 0;
      let amp = 1;
      let fr = 1;
      let norm = 0;
      for (let o = 0; o < 4; o++) {
        const gx = Math.floor(x / (48 / fr));
        const gz = Math.floor(z / (48 / fr));
        const tx = (x / (48 / fr)) - gx;
        const tz = (z / (48 / fr)) - gz;
        const sx = tx * tx * (3 - 2 * tx);
        const sz = tz * tz * (3 - 2 * tz);
        const v = (a, b) => (hash2(a, b, seed + o) >>> 0) / 4294967296;
        const top = v(gx, gz) * (1 - sx) + v(gx + 1, gz) * sx;
        const bot = v(gx, gz + 1) * (1 - sx) + v(gx + 1, gz + 1) * sx;
        h += (top * (1 - sz) + bot * sz) * amp;
        norm += amp;
        amp *= 0.5;
        fr *= 2;
      }
      return Math.max(6, Math.min(120, Math.floor(18 + (h / norm) * 95)));
    };
  }

  function buildWorld(seed, radius) {
    const hf = valueNoise(seed * 977);
    const boxes = [];
    for (let i = 0; i < 70; i++) {
      const x = (hash2(i, 1, seed) % (radius * 32)) - radius * 16;
      const z = (hash2(i, 2, seed) % (radius * 32)) - radius * 16;
      const y = 8 + (hash2(i, 3, seed) % 70);
      const horiz = hash2(i, 4, seed) % 2 === 0;
      const lx = horiz ? 10 + (hash2(i, 5, seed) % 40) : 3 + (hash2(i, 5, seed) % 4);
      const lz = 3 + (hash2(i, 6, seed) % 4);
      boxes.push([x, y, z, x + lx, y + 2 + (hash2(i, 7, seed) % 3), z + lz]);
    }
    const carve = (x, y, z) => {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x >= b[0] && x < b[3] && y >= b[1] && y < b[4] && z >= b[2] && z < b[5]) return true;
      }
      return false;
    };
    const map = new Map();
    const chunks = [];
    for (let cx = -radius; cx <= radius; cx++) {
      for (let cz = -radius; cz <= radius; cz++) {
        const c = makeChunk(cx, cz, hf, carve);
        map.set(cx + ',' + cz, c);
        chunks.push(c);
      }
    }
    // kemerler: havada duran 2 kalın tabaka (yüzey + 6), altı boş
    for (let i = 0; i < 25; i++) {
      const x = (hash2(i, 11, seed) % (radius * 32)) - radius * 16;
      const z = (hash2(i, 12, seed) % (radius * 32)) - radius * 16;
      const len = 6 + (hash2(i, 13, seed) % 14);
      for (let dx = 0; dx < len; dx++) {
        const wx = x + dx;
        const cc = map.get(Math.floor(wx / 16) + ',' + Math.floor(z / 16));
        if (!cc) continue;
        const y = Math.min(124, hf(wx, z) + 6);
        setBlk(cc, wx, y, z, B.STONE);
        setBlk(cc, wx, y + 1, z, B.STONE);
      }
    }
    chunks.forEach(refresh);
    const blockAt = (x, y, z) => {
      if (y < 0) return B.STONE;
      if (y >= 128) return AIR;
      const c = map.get((x >> 4) + ',' + (z >> 4));
      return c ? c.blocks[y * LAYER + (z & 15) * 16 + (x & 15)] : B.STONE;
    };
    return { chunks, blockAt, hf };
  }

  /** Gözden hedefe gerçek voksel DDA: hedef hücre hariç opak küp var mı? */
  function visible(blockAt, ex, ey, ez, tx, ty, tz, tb) {
    let dx = tx - ex;
    let dy = ty - ey;
    let dz = tz - ez;
    const len = Math.hypot(dx, dy, dz);
    dx /= len;
    dy /= len;
    dz /= len;
    let x = Math.floor(ex);
    let y = Math.floor(ey);
    let z = Math.floor(ez);
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tdx = dx === 0 ? Infinity : Math.abs(1 / dx);
    const tdy = dy === 0 ? Infinity : Math.abs(1 / dy);
    const tdz = dz === 0 ? Infinity : Math.abs(1 / dz);
    let tmx = dx === 0 ? Infinity : (dx > 0 ? x + 1 - ex : ex - x) * tdx;
    let tmy = dy === 0 ? Infinity : (dy > 0 ? y + 1 - ey : ey - y) * tdy;
    let tmz = dz === 0 ? Infinity : (dz > 0 ? z + 1 - ez : ez - z) * tdz;
    let t = 0;
    while (t < len - 0.05) {
      if (!(x === tb[0] && y === tb[1] && z === tb[2]) && isGroundId(blockAt(x, y, z))) return false;
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        t = tmx;
        tmx += tdx;
      } else if (tmy < tmz) {
        y += sy;
        t = tmy;
        tmy += tdy;
      } else {
        z += sz;
        t = tmz;
        tmz += tdz;
      }
    }
    return true;
  }

  const DIRS = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

  it('6 tohum × 4 göz: gizlenen chunk\'ların dışa açık yüzlerinden hiçbiri gözden görünmez', () => {
    let hiddenTotal = 0;
    let sampled = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { chunks, blockAt, hf } = buildWorld(seed, 5);
      const recs = chunks.map((c) => rec(c));
      const occ = createOcclusion();
      for (let k = 0; k < 4; k++) {
        const ex = 3 + k * 2.7;
        const ez = 5 + k * 1.9;
        // gözü yüzeye koy (kemerin üstü değil: yüzey zemininin hemen üstündeki ilk hava)
        let gy = Math.min(125, hf(Math.floor(ex), Math.floor(ez)) + 3);
        while (gy > 1 && !isGroundId(blockAt(Math.floor(ex), gy - 1, Math.floor(ez)))) gy--;
        const ey = gy + 1.62;
        if (isGroundId(blockAt(Math.floor(ex), Math.floor(ey), Math.floor(ez)))) continue;
        hiddenTotal += occ.run(ex, ey, ez, recs, recs.length);
        for (let i = 0; i < recs.length; i++) {
          if (!recs[i].occluded) continue;
          const c = chunks[i];
          let tested = 0;
          for (let s = 0; s < 500 && tested < 25; s++) {
            const lx = hash2(s, i, 5) % 16;
            const lz = hash2(s, i, 9) % 16;
            const y = hash2(s, i, 13) % 125;
            if (!isGroundId(c.blocks[y * LAYER + lz * 16 + lx])) continue;
            const wx = c.cx * 16 + lx;
            const wz = c.cz * 16 + lz;
            for (let d = 0; d < DIRS.length; d++) {
              if (blockAt(wx + DIRS[d][0], y + DIRS[d][1], wz + DIRS[d][2]) !== AIR) continue;
              const tx = wx + 0.5 + DIRS[d][0] * 0.52;
              const ty = y + 0.5 + DIRS[d][1] * 0.52;
              const tz = wz + 0.5 + DIRS[d][2] * 0.52;
              if (DIRS[d][0] * (ex - tx) + DIRS[d][1] * (ey - ty) + DIRS[d][2] * (ez - tz) <= 0) continue;
              tested++;
              expect(visible(blockAt, ex, ey, ez, tx, ty, tz, [wx, y, wz])).toBe(false);
              break;
            }
          }
          sampled += tested;
        }
      }
    }
    expect(hiddenTotal).toBeGreaterThan(10); // test boş geçmesin
    expect(sampled).toBeGreaterThan(200);
  }, 180000);
});
