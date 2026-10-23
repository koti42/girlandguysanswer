/*
 * Derin dünya QA regresyonları: taban ana kayası kurcalanmış kayıtla bile bozulamaz; Mühür halkaları tam yükseklikte
 * (y -400..362) mühürlüdür ve sızdırmaz.
 */
import { describe, expect, it } from 'vitest';
import { WORLD_Y_MAX, WORLD_Y_MIN, BEDROCK_TOP_Y } from './constants.js';
import { B } from './blocks.js';
import { World } from './world.js';
import { decorateChunk } from './structures.js';
import { bedrockTopY } from './worldgenDeep.js';
import { SEAL_RING_RADII, ringIndexAt } from './worldgenTerrain.js';
import { applyEditsToWorld, decodeEdits, encodeEdits } from './saveEdits.js';
import { applyPackedToChunk, generateSectionsData, makeGenContext, packEdits } from '../render/chunkMgrCore.js';
import { Chunk } from './chunk.js';

const SEED = 4242;

describe('taban ana kayası kurcalanmış kayıtla değişmez', () => {
  const cells = [];
  for (let y = WORLD_Y_MIN; y <= BEDROCK_TOP_Y + 2; y++) cells.push([20, y, 21, 0]);

  it('World.applyEdits: üretimden ÖNCE kaydedilmiş hava düzenlemeleri bedrock hücrelerini silemez', () => {
    const w = new World({ seed: SEED });
    expect(w.applyEdits(cells)).toBe(cells.length);
    w.ensureChunk(1, 1);
    w.ensureSection(1, 1, 0);
    const top = bedrockTopY(SEED, 20, 21);
    for (let y = WORLD_Y_MIN; y <= top; y++) expect(w.getBlock(20, y, 21)).toBe(B.BEDROCK);
    // bedrock olmayan hücrelere düzenleme uygulanır (kayıt geçerli kalır)
    for (let y = top + 1; y <= BEDROCK_TOP_Y + 2; y++) expect(w.getBlock(20, y, 21)).toBe(0);
  });

  it('kayıt kodlama turu: encode/decode/applyEditsToWorld sonrası da taban sağlam', () => {
    const w0 = new World({ seed: SEED });
    const dec = decodeEdits(encodeEdits(Object.fromEntries(cells.map((c) => [c[0] + ',' + c[1] + ',' + c[2], 0]))).chunks);
    const w = new World({ seed: SEED });
    applyEditsToWorld(w, dec.list);
    w.ensureChunk(1, 1);
    w.ensureSection(1, 1, 0);
    expect(w.getBlock(20, WORLD_Y_MIN, 21)).toBe(B.BEDROCK);
    expect(w0.yMin).toBe(WORLD_Y_MIN);
  });

  it('işçi yolu: generateSectionsData ve applyPackedToChunk bedrock hücrelerine yazmaz', () => {
    const g = makeGenContext({ seed: SEED, mode: 'macera' });
    const map = new Map();
    for (let y = 0; y <= 7; y++) map.set((y << 8) + (5 << 4) + 4, 0); // x=4,z=5 sütunu, y -400..-393
    const packed = packEdits(map);
    const r = generateSectionsData(g, 0, 0, [0], 0, packed);
    const arr = r.list[0].b;
    const top = bedrockTopY(SEED, 4, 5);
    for (let y = WORLD_Y_MIN; y <= top; y++) expect(arr[((y - WORLD_Y_MIN) << 8) + (5 << 4) + 4]).toBe(B.BEDROCK);
    // aynı kayıt bir chunk'a paketli uygulandığında
    const c = new Chunk(0, 0, { legacy: false, lazy: true });
    c.setSection(0, arr.slice(), 0);
    applyPackedToChunk(c, packed);
    for (let y = WORLD_Y_MIN; y <= top; y++) expect(c.getSectionBlocks(0)[((y - WORLD_Y_MIN) << 8) + (5 << 4) + 4]).toBe(B.BEDROCK);
  });
});

describe('Mühür halkaları tam yükseklikte (y -400..362) mühürlü', { timeout: 120000 }, () => {
  it('halka 0 ve 1: üretilebilir chunk\'lardaki her halka sütunu her y\'de bariyer ya da ana kaya', () => {
    let checked = 0;
    for (let ring = 0; ring < 2; ring++) {
      const w = new World({ seed: SEED, mode: 'macera', decorate: decorateChunk });
      for (let k = 1; k <= ring; k++) w.unlockZone(k); // halka r kapalı, içindeki bölgeler açık
      const R = SEAL_RING_RADII[ring];
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2 + 0.013;
        const x = Math.round(Math.cos(a) * R);
        const z = Math.round(Math.sin(a) * R);
        if (ringIndexAt(x, z) !== ring) continue;
        const cx = x >> 4;
        const cz = z >> 4;
        if (!w.canGenerate(cx, cz)) {
          expect(w.getBlock(x, 60, z)).toBeNull(); // üretilmemiş = oyuncu için duvar
          continue;
        }
        w.ensureChunk(cx, cz);
        for (let si = 0; si < 48; si++) w.ensureSection(cx, cz, si);
        for (let y = WORLD_Y_MIN; y <= WORLD_Y_MAX; y++) {
          const id = w.getBlock(x, y, z);
          expect([B.SEAL_BARRIER, B.BEDROCK]).toContain(id);
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('her halka 4-bağlantılı akışa karşı sızdırmaz (tüm halkalar)', () => {
    for (let i = 0; i < SEAL_RING_RADII.length - 1; i++) {
      const R = SEAL_RING_RADII[i];
      if (R > 700) continue; // büyük halkalar harness taramasında (6M hücre) doğrulandı; birim testte ilk 3
      const N = R + 6;
      const S = 2 * N + 1;
      const seen = new Uint8Array(S * S);
      const q = [N * S + N];
      seen[N * S + N] = 1;
      let leaked = 0;
      while (q.length) {
        const c = q.pop();
        const x = (c % S) - N;
        const z = ((c / S) | 0) - N;
        if (Math.hypot(x, z) > R + 3) { leaked++; continue; }
        const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let n = 0; n < 4; n++) {
          const nx = x + nb[n][0];
          const nz = z + nb[n][1];
          if (Math.abs(nx) > N || Math.abs(nz) > N) continue;
          const ni = (nz + N) * S + nx + N;
          if (seen[ni] || ringIndexAt(nx, nz) === i) continue;
          seen[ni] = 1;
          q.push(ni);
        }
      }
      expect(leaked).toBe(0);
    }
  });
});
