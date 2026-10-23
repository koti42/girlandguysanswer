import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CRACK_STAGES, createBlockHighlight, crackStage, generateCrackData, normalizeHit, outlineBoxesFor,
} from './blockHighlight.js';
import { B, BLOCKS } from '../sim/blocks.js';

describe('normalizeHit', () => {
  it('çeşitli çarpma biçimlerini ortak kayda çevirir', () => {
    const o = {};
    expect(normalizeHit({ x: 3, y: 4, z: 5 }, o)).toBe(true);
    expect([o.x, o.y, o.z, o.hasNormal, o.blockId]).toEqual([3, 4, 5, false, -1]);
    expect(normalizeHit({ pos: [1.7, 2.2, -0.5], blockId: 9, normal: [0, 1, 0] }, o)).toBe(true);
    expect([o.x, o.y, o.z, o.blockId, o.hasNormal, o.ny]).toEqual([1, 2, -1, 9, true, 1]);
    expect(normalizeHit({ block: { x: 7, y: 8, z: 9 }, face: 'west' }, o)).toBe(true);
    expect([o.x, o.y, o.z, o.nx, o.hasNormal]).toEqual([7, 8, 9, -1, true]);
    expect(normalizeHit({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: -1 }, o)).toBe(true);
    expect(o.nz).toBe(-1);
    expect(normalizeHit({ x: 0, y: 0, z: 0, normal: [0, 0, 0] }, o)).toBe(true);
    expect(o.hasNormal).toBe(false);
    expect(normalizeHit({ id: 5, x: 1, y: 1, z: 1 }, o)).toBe(true);
    expect(o.blockId).toBe(5);
  });

  it('geçersiz girdi reddedilir', () => {
    const o = {};
    expect(normalizeHit(null, o)).toBe(false);
    expect(normalizeHit(undefined, o)).toBe(false);
    expect(normalizeHit({ x: NaN, y: 0, z: 0 }, o)).toBe(false);
    expect(normalizeHit({ pos: { x: 'a', y: 1, z: 2 } }, o)).toBe(false);
  });
});

describe('outlineBoxesFor', () => {
  it('tam küp, plaka, merdiven, meşale, çiçek, çit ve plaka şekilleri', () => {
    expect(outlineBoxesFor(B.STONE)).toEqual([[0, 0, 0, 1, 1, 1]]);
    expect(outlineBoxesFor(0)).toEqual([[0, 0, 0, 1, 1, 1]]);
    expect(outlineBoxesFor(246)).toEqual([[0, 0, 0, 1, 1, 1]]); // kullanılmayan (yedek) kimlik → tam küp
    expect(outlineBoxesFor(B.SLAB)[0][4]).toBeCloseTo(0.5, 6);
    expect(outlineBoxesFor(B.STAIRS).length).toBe(2);
    const torch = outlineBoxesFor(B.TORCH)[0];
    expect(torch[3] - torch[0]).toBeLessThan(0.4);
    const flower = outlineBoxesFor(B.FLOWER_RED)[0];
    expect(flower[4]).toBeLessThan(1);
    expect(outlineBoxesFor(B.FENCE)[0][4]).toBeCloseTo(1.5, 6);
    const plate = outlineBoxesFor(B.PRESSURE_PLATE)[0];
    expect(plate[4]).toBeLessThan(0.2);
  });

  it('tüm bloklar için 1..3 geçerli kutu', () => {
    for (const b of BLOCKS) {
      const boxes = outlineBoxesFor(b.id);
      expect(boxes.length).toBeGreaterThanOrEqual(1);
      expect(boxes.length).toBeLessThanOrEqual(3);
      for (const x of boxes) {
        expect(x.length).toBe(6);
        for (let i = 0; i < 6; i++) expect(Number.isFinite(x[i])).toBe(true);
        expect(x[3]).toBeGreaterThan(x[0]);
        expect(x[4]).toBeGreaterThan(x[1]);
        expect(x[5]).toBeGreaterThan(x[2]);
        expect(x[4]).toBeLessThanOrEqual(1.6);
      }
    }
  });
});

describe('çatlak aşamaları', () => {
  it('crackStage: 0 → gizli, (0,1] → 0..9', () => {
    expect(crackStage(0)).toBe(-1);
    expect(crackStage(-1)).toBe(-1);
    expect(crackStage(NaN)).toBe(-1);
    expect(crackStage(0.0001)).toBe(0);
    expect(crackStage(0.099)).toBe(0);
    expect(crackStage(0.1)).toBe(1);
    expect(crackStage(0.55)).toBe(5);
    expect(crackStage(0.999)).toBe(9);
    expect(crackStage(1)).toBe(9);
    expect(crackStage(5)).toBe(9);
    expect(CRACK_STAGES).toBe(10);
  });

  it('doku: belirlenimci, tohuma bağlı; her aşama öncekinin üst kümesi ve her aşamada yeni piksel var', () => {
    const a = generateCrackData(64, 1337);
    const b = generateCrackData(64, 1337);
    const c = generateCrackData(64, 99);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(Array.from(a.data)).not.toEqual(Array.from(c.data));
    expect(a.size).toBe(64);
    expect(a.data.length).toBe(64 * 64 * 4);
    expect(a.stages).toBe(10);
    // aşama s'de görünen piksel sayısı (kümülatif) kesin artar
    let prev = 0;
    for (let s = 0; s < 10; s++) {
      expect(a.counts[s]).toBeGreaterThan(0);
      let visible = 0;
      for (let i = 0; i < 64 * 64; i++) {
        const stage = Math.floor((a.data[i * 4] / 255) * 10);
        const cover = a.data[i * 4 + 1];
        if (stage <= s && stage < 10 && cover > 40) visible++;
      }
      expect(visible).toBeGreaterThan(prev);
      prev = visible;
    }
    const total = a.counts.reduce((x, y) => x + y, 0);
    expect(total / (64 * 64)).toBeGreaterThan(0.03);
    expect(total / (64 * 64)).toBeLessThan(0.35);
    for (let i = 0; i < 64 * 64; i++) expect(a.data[i * 4 + 3]).toBe(255);
  });

  it('doku: örtü kanalı çatlak dışında 0, arka plan eşiği 255 (dolgu hariç aşama değeri)', () => {
    const a = generateCrackData(64, 7);
    let bg = 0;
    for (let i = 0; i < 64 * 64; i++) if (a.data[i * 4] === 255) bg++;
    expect(bg / (64 * 64)).toBeGreaterThan(0.4);
    for (let i = 0; i < 64 * 64; i++) if (a.data[i * 4 + 1] === 0) expect(a.data[i * 4 + 2]).toBeLessThanOrEqual(255);
  });

  it('küçük ve büyük boyutlarda da çalışır', () => {
    for (const size of [16, 32, 128]) {
      const d = generateCrackData(size, 5);
      expect(d.data.length).toBe(size * size * 4);
      expect(d.counts.reduce((x, y) => x + y, 0)).toBeGreaterThan(size);
    }
  });
});

describe('createBlockHighlight', () => {
  const edgesVisible = (h) => h.object3D.children.filter((c) => c.material && c.material.uniforms && c.material.uniforms.uWidth && c.visible).length;
  const cracksVisible = (h) => h.object3D.children.filter((c) => c.material && c.material.uniforms && c.material.uniforms.uCrack && c.visible).length;

  it('başta gizli; hedef verilince çerçeve görünür, null ile kaybolur', () => {
    const h = createBlockHighlight(THREE);
    expect(edgesVisible(h)).toBe(0);
    h.setTarget({ x: 3, y: 4, z: 5, blockId: B.STONE, normal: [0, 1, 0] });
    expect(edgesVisible(h)).toBe(1);
    expect(h.state.hasTarget).toBe(true);
    expect(h.state).toMatchObject({ x: 3, y: 4, z: 5 });
    h.setTarget(null);
    expect(edgesVisible(h)).toBe(0);
    expect(h.state.hasTarget).toBe(false);
    h.dispose();
  });

  it('kısmi şekiller kendi kutu sayısını çerçeveler (merdiven 2, plaka 1)', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.STAIRS });
    expect(edgesVisible(h)).toBe(2);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.SLAB });
    expect(edgesVisible(h)).toBe(1);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.TORCH });
    expect(edgesVisible(h)).toBe(1);
    h.dispose();
  });

  it('çatlak: ilerleme aşamayı ve görünürlüğü sürer; blok değişince sıfırlanır', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 1, y: 1, z: 1, blockId: B.STONE });
    expect(cracksVisible(h)).toBe(0);
    h.setBreakProgress(0.04);
    expect(h.state.stage).toBe(0);
    expect(cracksVisible(h)).toBe(1);
    h.setBreakProgress(0.73);
    expect(h.state.stage).toBe(7);
    h.setBreakProgress(1);
    expect(h.state.stage).toBe(9);
    h.setTarget({ x: 1, y: 1, z: 1, blockId: B.STONE });
    expect(h.state.stage).toBe(9);
    h.setTarget({ x: 2, y: 1, z: 1, blockId: B.STONE });
    expect(h.state.stage).toBe(-1);
    expect(h.state.progress).toBe(0);
    expect(cracksVisible(h)).toBe(0);
    h.setBreakProgress(0.5);
    h.setBreakProgress(0);
    expect(cracksVisible(h)).toBe(0);
    h.setBreakProgress(NaN);
    expect(h.state.progress).toBe(0);
    h.setTarget(null);
    h.setBreakProgress(0.9);
    expect(cracksVisible(h)).toBe(0);
    h.dispose();
  });

  it('çatlak kutusu hedef bloğa tam oturur', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 10, y: 20, z: 30, blockId: B.STONE });
    h.setBreakProgress(0.5);
    const crack = h.object3D.children.find((c) => c.material.uniforms.uCrack && c.visible);
    expect(crack.material.uniforms.uMin.value.toArray()).toEqual([10, 20, 30]);
    expect(crack.material.uniforms.uMax.value.toArray()).toEqual([11, 21, 31]);
    expect(crack.material.uniforms.uStage.value).toBe(5);
    h.dispose();
  });

  it('çerçeve yeni hedefe akarak kayar; ilk hedefte ve kısıtlı harekette anında oturur', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.STONE });
    h.update(0.016);
    const edge = h.object3D.children.find((c) => c.material.uniforms.uWidth && c.visible);
    expect(edge.material.uniforms.uMin.value.x).toBeCloseTo(0, 6);
    h.setTarget({ x: 4, y: 0, z: 0, blockId: B.STONE });
    h.update(0.016);
    const x1 = edge.material.uniforms.uMin.value.x;
    expect(x1).toBeGreaterThan(0);
    expect(x1).toBeLessThan(4);
    for (let i = 0; i < 30; i++) h.update(0.016);
    expect(edge.material.uniforms.uMin.value.x).toBeCloseTo(4, 2);
    h.setTarget(null);
    h.setTarget({ x: 9, y: 0, z: 0, blockId: B.STONE });
    h.update(0.016);
    expect(edge.material.uniforms.uMin.value.x).toBeCloseTo(9, 6);
    h.dispose();

    const r = createBlockHighlight(THREE, { reducedMotion: true });
    r.setTarget({ x: 0, y: 0, z: 0, blockId: B.STONE });
    r.update(0.016);
    r.setTarget({ x: 6, y: 0, z: 0, blockId: B.STONE });
    r.update(0.016);
    const e2 = r.object3D.children.find((c) => c.material.uniforms.uWidth && c.visible);
    expect(e2.material.uniforms.uMin.value.x).toBeCloseTo(6, 6);
    r.dispose();
  });

  it('nabız yumuşak: normal modda 0,56..1 arası, kısıtlı modda neredeyse sabit', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.STONE });
    const edge = h.object3D.children.find((c) => c.material.uniforms.uWidth && c.visible);
    let lo = 9;
    let hi = 0;
    for (let i = 0; i < 300; i++) {
      h.update(0.016);
      const p = edge.material.uniforms.uPulse.value;
      lo = Math.min(lo, p); hi = Math.max(hi, p);
    }
    expect(lo).toBeGreaterThan(0.55);
    expect(hi).toBeLessThanOrEqual(1.001);
    expect(hi - lo).toBeGreaterThan(0.3);
    h.setReducedMotion(true);
    h.update(0.016);
    expect(edge.material.uniforms.uPulse.value).toBeCloseTo(0.92, 6);
    h.dispose();
  });

  it('yüz tonu: normal verilince hedef yüzün üstünde, yoksa gizli', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 2, y: 3, z: 4, blockId: B.STONE, normal: [0, 1, 0] });
    const face = h.object3D.children.find((c) => c.geometry && c.geometry.type === 'PlaneGeometry');
    expect(face.visible).toBe(true);
    expect(face.position.y).toBeCloseTo(4.004, 6);
    h.setTarget({ x: 2, y: 3, z: 4, blockId: B.STONE, normal: [-1, 0, 0] });
    expect(face.position.x).toBeCloseTo(1.996, 6);
    h.setTarget({ x: 2, y: 3, z: 4, blockId: B.STONE });
    expect(face.visible).toBe(false);
    h.dispose();
  });

  it('yerleştirme hayaleti: blok şekline uyar, geçersizde kırmızı, null ile kaybolur', () => {
    const h = createBlockHighlight(THREE);
    const fills = () => h.object3D.children.filter((c) => c.material && c.material.type === 'MeshBasicMaterial' && c.visible);
    expect(fills().length).toBe(0);
    h.setPlacementGhost(B.BRICK, { x: 1, y: 2, z: 3 }, true);
    expect(fills().length).toBe(1);
    const f = fills()[0];
    expect(f.position.toArray().map((v) => Math.round(v * 100) / 100)).toEqual([1.5, 2.5, 3.5]);
    const okColor = f.material.color.getHex();
    h.setPlacementGhost(B.BRICK, [1, 2, 3], false);
    expect(f.material.color.r).toBeGreaterThan(f.material.color.g);
    expect(f.material.color.getHex()).not.toBe(okColor);
    h.setPlacementGhost(B.STAIRS, { x: 0, y: 0, z: 0 });
    expect(fills().length).toBe(2);
    h.setPlacementGhost(B.SLAB, { x: 0, y: 0, z: 0 });
    expect(fills().length).toBe(1);
    expect(fills()[0].scale.y).toBeCloseTo(0.504, 3);
    h.update(0.016);
    h.setPlacementGhost(null, { x: 0, y: 0, z: 0 });
    expect(fills().length).toBe(0);
    h.setPlacementGhost(B.STONE, null);
    expect(fills().length).toBe(0);
    h.dispose();
  });

  it('onBeforeRender: çözünürlüğü ve piksel kalınlığını işleyiciden alır', () => {
    const h = createBlockHighlight(THREE);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.STONE });
    const edge = h.object3D.children.find((c) => c.material.uniforms.uWidth && c.visible);
    const fake = {
      getRenderTarget: () => null,
      getDrawingBufferSize: (v) => v.set(2400, 1200),
      getPixelRatio: () => 2,
    };
    edge.onBeforeRender(fake);
    expect(edge.material.uniforms.uRes.value.toArray()).toEqual([2400, 1200]);
    expect(edge.material.uniforms.uWidth.value).toBeCloseTo(6, 6);
    edge.onBeforeRender({ ...fake, getRenderTarget: () => ({ width: 800, height: 400 }) });
    expect(edge.material.uniforms.uRes.value.toArray()).toEqual([800, 400]);
    expect(edge.material.uniforms.uWidth.value).toBeCloseTo(3, 6);
    h.dispose();
  });

  it('setColor çerçeve rengini değiştirir; dispose sahneden ayırır ve tekrar çağrılabilir', () => {
    const scene = new THREE.Scene();
    const h = createBlockHighlight(THREE);
    scene.add(h.object3D);
    h.setTarget({ x: 0, y: 0, z: 0, blockId: B.STONE });
    h.setColor(0xff0000);
    const edge = h.object3D.children.find((c) => c.material.uniforms.uWidth && c.visible);
    expect(edge.material.uniforms.uColor.value.getHex()).toBe(0xff0000);
    h.dispose();
    expect(scene.children.length).toBe(0);
    h.dispose();
  });

  it('100 hedef değişimi/ilerleme/hayalet çağrısı hata vermez, durum tutarlı kalır', () => {
    const h = createBlockHighlight(THREE);
    let s = 1;
    const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < 100; i++) {
      const ids = [B.STONE, B.SLAB, B.STAIRS, B.TORCH, B.GLASS, B.FENCE];
      h.setTarget(rnd() < 0.15 ? null : { x: Math.floor(rnd() * 8), y: Math.floor(rnd() * 8), z: Math.floor(rnd() * 8), blockId: ids[Math.floor(rnd() * ids.length)], normal: [0, 1, 0] });
      h.setBreakProgress(rnd());
      h.setPlacementGhost(rnd() < 0.3 ? null : ids[Math.floor(rnd() * ids.length)], { x: 1, y: 1, z: 1 }, rnd() < 0.5);
      h.update(0.016);
    }
    expect(Number.isFinite(h.state.progress)).toBe(true);
    h.dispose();
  });
});
