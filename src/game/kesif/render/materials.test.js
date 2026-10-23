import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { B } from '../sim/blocks.js';
import { generateAtlasPixels, createAtlasTextures } from './atlas.js';
import {
  createMaterialUniforms, createChunkMaterials, updateMaterialsFrame, createChunkGeometry,
} from './materials.js';
import { CHUNK_VERTEX, CHUNK_FRAGMENT } from './materialShaders.js';
import { meshChunk, MESH_ATTRIBUTES } from './mesher.js';

const pixels = generateAtlasPixels({ quality: 'low' });
const atlas = createAtlasTextures(THREE, pixels);

function sampleMesh() {
  const VOL = 16 * 16 * 128;
  const c = { cx: 2, cz: 3, blocks: new Uint8Array(VOL), light: new Uint8Array(VOL).fill(0xf0), biomeMap: new Uint8Array(256) };
  const idx = (x, y, z) => ((y * 16) + z) * 16 + x;
  c.blocks[idx(4, 10, 4)] = B.STONE;
  c.blocks[idx(6, 10, 4)] = B.GLASS;
  c.blocks[idx(8, 10, 4)] = B.FLOWER_RED;
  return meshChunk(c, {}, pixels.uvTable, { nullNeighbor: 'air' });
}

describe('shader kaynakları', () => {
  const declared = (src) => {
    const out = new Set();
    src.replace(/uniform\s+\w+\s+(\w+)\s*;/g, (m, n) => {
      out.add(n);
      return m;
    });
    return out;
  };

  it('her özel uniform createMaterialUniforms içinde tanımlı', () => {
    const u = createMaterialUniforms(THREE);
    const builtin = new Set(['viewMatrix', 'cameraPosition', 'isOrthographic']);
    [...declared(CHUNK_VERTEX), ...declared(CHUNK_FRAGMENT)].forEach((n) => {
      if (!builtin.has(n)) expect(u[n], n).toBeDefined();
    });
  });

  it('köşe öznitelik adları MESH_ATTRIBUTES ile uyuşur', () => {
    ['aColor', 'aLight', 'aFlags'].forEach((n) => expect(CHUNK_VERTEX).toContain('attribute ' + (n === 'aLight' ? 'vec2' : 'vec4') + ' ' + n));
    MESH_ATTRIBUTES.forEach((a) => {
      if (a.name.startsWith('a')) expect(CHUNK_VERTEX).toContain(a.name);
    });
    expect(CHUNK_FRAGMENT).toContain('#include <tonemapping_fragment>');
    expect(CHUNK_FRAGMENT).toContain('#include <colorspace_fragment>');
  });

  it('süslemeler: rüzgâr, dalga, su, lav, mühür, portal, sis, eriyik mevcut', () => {
    ['wind', 'kWaveH', 'kWaterNormal', 'kind == 2', 'kind == 3', 'kind == 4', 'uFogNear', 'uFadeStart', 'uUnderwater', 'uSkyLight', 'uTime']
      .forEach((s) => expect(CHUNK_VERTEX + CHUNK_FRAGMENT).toContain(s));
  });

  it('parantezler/süslü parantezler dengeli (kaba sözdizimi denetimi)', () => {
    [CHUNK_VERTEX, CHUNK_FRAGMENT].forEach((src) => {
      const count = (ch) => src.split(ch).length - 1;
      expect(count('{')).toBe(count('}'));
      expect(count('(')).toBe(count(')'));
      // #if / #endif dengesi
      const ifs = (src.match(/^\s*#if(def|ndef)?\b/gm) || []).length;
      const ends = (src.match(/^\s*#endif\b/gm) || []).length;
      expect(ifs).toBe(ends);
    });
  });
});

describe('createChunkMaterials', () => {
  it('üç malzeme aynı uniform nesnesini paylaşır; geçişe göre PASS ve durum', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'high' });
    expect(m.opaque.uniforms).toBe(m.uniforms);
    expect(m.cutout.uniforms).toBe(m.uniforms);
    expect(m.transparent.uniforms).toBe(m.uniforms);
    expect(m.opaque.defines.PASS).toBe(0);
    expect(m.cutout.defines.PASS).toBe(1);
    expect(m.transparent.defines.PASS).toBe(2);
    expect(m.opaque.transparent).toBe(false);
    expect(m.opaque.depthWrite).toBe(true);
    expect(m.transparent.transparent).toBe(true);
    expect(m.transparent.depthWrite).toBe(false);
    expect(m.transparent.polygonOffset).toBe(true);
    expect(m.uniforms.uMap.value).toBe(atlas.map);
    expect(m.uniforms.uNormalMap.value).toBe(atlas.normalMap);
    expect(m.uniforms.uMaterialMap.value).toBe(atlas.materialMap);
    expect(m.uniforms.uAtlasSize.value.x).toBe(atlas.width);
    expect(m.uniforms.uCellSize.value.x).toBe(atlas.cell);
    expect(m.uniforms.uPad.value).toBe(atlas.pad);
    expect(m.uniforms.uTile.value).toBe(atlas.tileSize);
    expect('USE_NORMAL_MAP' in m.opaque.defines).toBe(true);
    expect('HIGH_DETAIL' in m.opaque.defines).toBe(true);
    m.dispose();
  });

  it('kalite kademesi shader tanımlarını değiştirir', () => {
    const m = createChunkMaterials(THREE, atlas, null, { quality: 'low' });
    expect('USE_NORMAL_MAP' in m.cutout.defines).toBe(false);
    expect('HIGH_DETAIL' in m.cutout.defines).toBe(false);
    const v0 = m.opaque.version;
    m.setQuality('medium');
    expect('USE_NORMAL_MAP' in m.cutout.defines).toBe(true);
    expect('HIGH_DETAIL' in m.cutout.defines).toBe(false);
    expect(m.opaque.version).toBeGreaterThan(v0);
    m.setQuality('high');
    expect('HIGH_DETAIL' in m.transparent.defines).toBe(true);
    m.dispose();
  });

  it('dışarıdan verilen uniform nesnesi korunur, eksikler tamamlanır', () => {
    const shared = { uTime: { value: 5 } };
    const m = createChunkMaterials(THREE, atlas, shared);
    expect(m.uniforms).toBe(shared);
    expect(m.uniforms.uTime.value).toBe(5);
    expect(m.uniforms.uSkyLight).toBeDefined();
    m.dispose();
  });
});

describe('updateMaterialsFrame', () => {
  it('zaman, gün faktörü, yön (normalize) ve renkleri yazar', () => {
    const m = createChunkMaterials(THREE, atlas);
    updateMaterialsFrame(m, {
      time: 12.5, dayFactor: 0.4, sunDir: [3, 4, 0], sunColor: [0.5, 0.4, 0.3], fogColor: 0xff0000, fogNear: 20, fogFar: 100,
    });
    const u = m.uniforms;
    expect(u.uTime.value).toBe(12.5);
    expect(u.uSkyLight.value).toBe(0.4);
    expect(u.uSunDir.value.length()).toBeCloseTo(1, 6);
    expect(u.uSunDir.value.y).toBeCloseTo(0.8, 6);
    expect(u.uSunColor.value.r).toBeCloseTo(0.5, 6);
    expect(u.uFogColor.value.r).toBeCloseTo(1, 6);
    expect(u.uFogColor.value.g).toBeCloseTo(0, 6);
    expect(u.uFogNear.value).toBe(20);
    expect(u.uFogFar.value).toBe(100);
    expect(u.uFadeEnd.value).toBeLessThan(100);
    expect(u.uFadeStart.value).toBeLessThan(u.uFadeEnd.value);
    expect(u.uUnderwater.value).toBe(0);
    // verilmeyen alan değişmez
    updateMaterialsFrame(m, { time: 13 });
    expect(u.uFogFar.value).toBe(100);
    expect(u.uSkyLight.value).toBe(0.4);
    m.dispose();
  });

  it('su altı: sis yakın/yoğun, bayrak açık; çıkınca geri döner', () => {
    const m = createChunkMaterials(THREE, atlas);
    updateMaterialsFrame(m, { fogColor: 0xcfe6f5, fogNear: 60, fogFar: 150 });
    updateMaterialsFrame(m, { underwater: true });
    expect(m.uniforms.uUnderwater.value).toBe(1);
    expect(m.uniforms.uFogFar.value).toBeLessThan(40);
    expect(m.uniforms.uFogNear.value).toBeLessThan(2);
    updateMaterialsFrame(m, { underwater: false, fogColor: 0xcfe6f5, fogNear: 60, fogFar: 150 });
    expect(m.uniforms.uUnderwater.value).toBe(0);
    expect(m.uniforms.uFogFar.value).toBe(150);
    m.dispose();
  });

  it('hareket azaltma: uMotion 0; motion açıkça verilirse o', () => {
    const m = createChunkMaterials(THREE, atlas);
    updateMaterialsFrame(m, { reducedMotion: true });
    expect(m.uniforms.uMotion.value).toBe(0);
    updateMaterialsFrame(m, { reducedMotion: false });
    expect(m.uniforms.uMotion.value).toBe(1);
    updateMaterialsFrame(m, { motion: 0.3, reducedMotion: true });
    expect(m.uniforms.uMotion.value).toBe(0.3);
    m.dispose();
  });

  it('THREE.Color ve {x,y,z} girdileri kabul edilir', () => {
    const m = createChunkMaterials(THREE, atlas);
    updateMaterialsFrame(m, { sunDir: { x: 0, y: 2, z: 0 }, skyColor: new THREE.Color(0.1, 0.2, 0.3), horizonColor: [0.4, 0.5, 0.6] });
    expect(m.uniforms.uSunDir.value.y).toBeCloseTo(1, 6);
    expect(m.uniforms.uSkyColor.value.b).toBeCloseTo(0.3, 6);
    expect(m.uniforms.uHorizonColor.value.g).toBeCloseTo(0.5, 6);
    expect(() => updateMaterialsFrame(m, undefined)).not.toThrow();
    m.dispose();
  });
});

describe('createChunkGeometry', () => {
  it('mesh geçişinden BufferGeometry kurar; boş geçiş null', () => {
    const mesh = sampleMesh();
    const g = createChunkGeometry(THREE, mesh.opaque, mesh.bounds);
    expect(g).toBeInstanceOf(THREE.BufferGeometry);
    MESH_ATTRIBUTES.forEach((a) => {
      const attr = g.getAttribute(a.name);
      expect(attr, a.name).toBeDefined();
      expect(attr.itemSize).toBe(a.itemSize);
      expect(attr.count).toBe(mesh.opaque.vertexCount);
    });
    expect(g.index.count).toBe(mesh.opaque.indexCount);
    expect(g.boundingSphere.radius).toBeGreaterThan(0);
    expect(g.boundingBox.min.x).toBe(mesh.bounds.min[0]);
    expect(createChunkGeometry(THREE, { vertexCount: 0 }, null)).toBeNull();
    expect(createChunkGeometry(THREE, null)).toBeNull();
    const gc = createChunkGeometry(THREE, mesh.cutout);
    expect(gc.boundingSphere).not.toBeNull();
    g.dispose();
    gc.dispose();
  });

  it('geometri üç geçiş malzemesiyle Mesh olarak kurulabilir', () => {
    const mesh = sampleMesh();
    const mats = createChunkMaterials(THREE, atlas);
    ['opaque', 'cutout', 'transparent'].forEach((k) => {
      const g = createChunkGeometry(THREE, mesh[k], mesh.bounds);
      expect(g).not.toBeNull();
      const obj = new THREE.Mesh(g, mats[k]);
      expect(obj.material.defines.PASS).toBeGreaterThanOrEqual(0);
      g.dispose();
    });
    mats.dispose();
  });
});
