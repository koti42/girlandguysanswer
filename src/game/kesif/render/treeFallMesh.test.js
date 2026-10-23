import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B, BLOCKS, TILE_COUNT } from '../sim/blocks.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { createFallObject, meshTreeBlocks } from './treeFallMesh.js';
import { buildTreeEnumCells } from '../sim/treeGrow.js';

const uv = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 }).uvTable;
const sample = { light: () => 0xf4, biome: () => 1 };
const hinge = { x: 0.5, y: 10, z: 0.5 };

describe('treeFallMesh', () => {
  it('kütük sütunu: 4 kütük = 4×4 yan + üst + alt yüz (iç yüzler yok), opak geçiş', () => {
    const cells = [];
    for (let y = 10; y < 14; y++) cells.push({ x: 0, y, z: 0, id: B.LOG_OAK });
    const m = meshTreeBlocks(cells, hinge, sample, uv);
    expect(m.stats.faces).toBe(18);
    expect(m.opaque.vertexCount).toBe(18 * 4);
    expect(m.cutout.vertexCount).toBe(0);
    expect(m.opaque.indexCount).toBe(18 * 6);
    // konumlar menteşeye göre: tabanın x,z ∈ [−0.5, 0.5], y ∈ [0, 4]
    const p = m.opaque.pos;
    let minY = 1e9; let maxY = -1e9;
    for (let i = 1; i < p.length; i += 3) { minY = Math.min(minY, p[i]); maxY = Math.max(maxY, p[i]); }
    expect(minY).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(4, 6);
    // normaller birim
    for (let i = 0; i < m.opaque.normal.length; i += 3) {
      expect(Math.hypot(m.opaque.normal[i], m.opaque.normal[i + 1], m.opaque.normal[i + 2])).toBeCloseTo(1, 6);
    }
  });

  it('yaprak: kesik geçiş, biyom tonlu renk; kütükle komşu yüzü çizilmez; aynı yapraklar arası çizilmez', () => {
    const cells = [{ x: 0, y: 10, z: 0, id: B.LOG_OAK }, { x: 1, y: 10, z: 0, id: B.LEAVES_OAK }, { x: 2, y: 10, z: 0, id: B.LEAVES_OAK }];
    const m = meshTreeBlocks(cells, hinge, sample, uv);
    // yaprak çifti: 2 küp, aralarındaki yüz yok → 10 yüz; kütüğe değen yüz de yok → 9
    expect(m.cutout.vertexCount / 4).toBe(9);
    // kütük: yaprağa değen yüz çizilir (yaprak opak değil) → 6 yüz
    expect(m.opaque.vertexCount / 4).toBe(6);
    // ton: yaprakta r,g,b hepsi 1'den küçük ve eşit değil (yeşilimsi), kütükte ao × 1
    const c = m.cutout.color;
    expect(c[1]).not.toBeCloseTo(c[2], 3);
    expect(BLOCKS[B.LEAVES_OAK].tint).toBe('foliage');
  });

  it('gerçek bir ağaç: üçgen sayısı makul, bütün öznitelikler aynı köşe sayısında, indeksler sınır içinde', () => {
    const cells = buildTreeEnumCells(4, 0, 11, 0, 5);
    const m = meshTreeBlocks(cells, { x: 0.5, y: 11, z: 0.5 }, sample, uv);
    ['opaque', 'cutout'].forEach((k) => {
      const p = m[k];
      expect(p.pos.length).toBe(p.vertexCount * 3);
      expect(p.uv.length).toBe(p.vertexCount * 2);
      expect(p.color.length).toBe(p.vertexCount * 4);
      expect(p.light.length).toBe(p.vertexCount * 2);
      expect(p.flags.length).toBe(p.vertexCount * 4);
      for (let i = 0; i < p.index.length; i++) expect(p.index[i]).toBeLessThan(p.vertexCount);
    });
    expect(m.stats.triangles).toBeGreaterThan(100);
    expect(m.stats.triangles).toBeLessThan(cells.length * 12);
    expect(m.bounds.radius).toBeGreaterThan(3);
  });

  it('createFallObject: grup menteşede, malzemeler paylaşılır, dispose geometriyi bırakır', () => {
    const cells = buildTreeEnumCells(0, 0, 11, 0, 5);
    const m = meshTreeBlocks(cells, { x: 0.5, y: 11, z: 0.5 }, sample, uv);
    const mats = { opaque: new THREE.MeshBasicMaterial(), cutout: new THREE.MeshBasicMaterial(), transparent: new THREE.MeshBasicMaterial() };
    const parent = new THREE.Group();
    const obj = createFallObject(THREE, m, mats, { x: 0.5, y: 11, z: 0.5 });
    parent.add(obj.group);
    expect(obj.group.position.toArray()).toEqual([0.5, 11, 0.5]);
    expect(obj.group.children.length).toBe(2);
    expect(obj.group.children.map((c) => c.material)).toContain(mats.opaque);
    expect(obj.group.children.map((c) => c.material)).toContain(mats.cutout);
    expect(obj.tris).toBe(m.stats.triangles);
    obj.dispose();
    expect(parent.children.length).toBe(0);
  });
});
