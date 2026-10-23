import { describe, expect, it } from 'vitest';
import { cpuMs, scaled } from '../../../../test/perfScale.js';
import * as THREE from 'three';
import { createPropRenderer, PROP_TIERS } from './propRenderer.js';
import { INTERIOR_TIERS, createInteriorPropRenderer } from './propRendererInterior.js';
import { PropWorld } from '../../sim/props/propWorld.js';
import { propsForChunk } from '../../sim/props/propPlan.js';
import { getPropDef } from '../../sim/props/propDefs.js';
import { createMaterialUniforms } from '../materials.js';
import { dimSeed } from '../../sim/dim/dimensions.js';

const SEED = dimSeed(777, 'neon');
const BUDGET = {
  high: { calls: 40, inst: 2500, tris: 60000 },
  medium: { calls: 36, inst: 1600, tris: 40000 },
  low: { calls: 30, inst: 900, tris: 20000 },
};

function fakeCanvas() {
  const state = { font: '' };
  const ctx = {
    set font(v) { state.font = v; },
    get font() { return state.font; },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, fillText() {},
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  return { width: 0, height: 0, getContext: () => ctx };
}

/** Şehirde iç mekân prop yoğunluğu en yüksek 3×3 chunk penceresi (en kötü durum). */
function densestWindow() {
  let best = null;
  for (let cz = -22; cz <= 22; cz += 2) {
    for (let cx = -22; cx <= 22; cx += 2) {
      let n = 0;
      for (let dz = 0; dz < 3; dz++) {
        for (let dx = 0; dx < 3; dx++) {
          n += propsForChunk(SEED, cx + dx, cz + dz).filter((p) => getPropDef(p.t).interior).length;
        }
      }
      if (!best || n > best.n) best = { cx, cz, n };
    }
  }
  return best;
}

function camAt(x, y, z, yaw) {
  const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.06, 1600);
  cam.position.set(x, y, z);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = yaw || 0;
  cam.updateMatrixWorld(true);
  return cam;
}

describe('prop çizim bütçesi — şehrin en yoğun iç mekân bölgesi', () => {
  const win = densestWindow();
  // qa5: pişirme süresi ürün kodunda duvar saatiyle ölçülür (maxBakeMs); CPU doygunluğunda tek bir kesinti onu şişirir. Eşik aşılırsa taze çizicilerle
  // en çok 3 kez yeniden ölçülür: gerçek bir yavaşlama TÜM denemelerde aşar.
  function remeasureBake(pw, tier, cx, cz) {
    let best = Infinity;
    for (let a = 0; a < 3; a++) {
      const u = createMaterialUniforms(THREE);
      u.uFadeEnd.value = 400;
      const p = createPropRenderer({ THREE, uniforms: u, quality: tier, createCanvas: () => fakeCanvas() });
      const r = createInteriorPropRenderer({ THREE, uniforms: u, quality: tier, signAtlas: p.atlas, createCanvas: () => fakeCanvas() });
      p.setWorld(pw);
      r.setWorld(pw);
      for (let yaw = 0; yaw < 6.3; yaw += 0.9) {
        const cam = camAt(cx, 65.6, cz, yaw);
        for (let i = 0; i < 40; i++) { p.update(1 / 60, cam); r.update(1 / 60, cam); }
      }
      best = Math.min(best, r.stats.maxBakeMs);
      r.dispose();
      p.dispose();
      if (best < scaled(120)) break;
    }
    return best;
  }
  it('en yoğun pencere gerçekten yoğun (≥ 100 iç mekân propu)', () => {
    expect(win.n).toBeGreaterThanOrEqual(100);
  });

  ['high', 'medium', 'low'].forEach((tier) => {
    it('kademe ' + tier + ': çizim çağrısı, örnek ve üçgen toplamı (sokak + iç mekân) bütçe içinde; pişirme/güncelleme CPU\'su sınırlı', () => {
      const pw = new PropWorld({ citySeed: SEED });
      for (let cz = win.cz - 4; cz <= win.cz + 6; cz++) for (let cx = win.cx - 4; cx <= win.cx + 6; cx++) pw.loadChunk(cx, cz);
      const uniforms = createMaterialUniforms(THREE);
      uniforms.uFadeEnd.value = 400;
      const pr = createPropRenderer({
        THREE, uniforms, quality: tier, createCanvas: () => fakeCanvas(),
      });
      const ir = createInteriorPropRenderer({
        THREE, uniforms, quality: tier, signAtlas: pr.atlas, createCanvas: () => fakeCanvas(),
      });
      pr.setWorld(pw);
      ir.setWorld(pw);
      let worstCalls = 0;
      let worstInst = 0;
      let worstTris = 0;
      let sumMs = 0;
      let frames = 0;
      // kamera pencerenin merkezinde dönerek bakar (kalabalık görünüm)
      const cx = win.cx * 16 + 24;
      const cz = win.cz * 16 + 24;
      for (let yaw = 0; yaw < 6.3; yaw += 0.9) {
        const cam = camAt(cx, 65.6, cz, yaw);
        for (let i = 0; i < 40; i++) {
          const t0 = cpuMs();
          pr.update(1 / 60, cam);
          ir.update(1 / 60, cam);
          sumMs += cpuMs() - t0;
          frames++;
        }
        const calls = pr.stats.draws + ir.stats.draws;
        const inst = pr.stats.instances + ir.stats.instances;
        const tris = pr.stats.tris + ir.stats.tris;
        worstCalls = Math.max(worstCalls, calls);
        worstInst = Math.max(worstInst, inst);
        worstTris = Math.max(worstTris, tris);
      }
      console.log('[propBudget]', tier, JSON.stringify({ win, worstCalls, worstInst, worstTris, ir: ir.stats, maxBake: ir.stats.maxBakeMs.toFixed(1), avgMs: (sumMs / frames).toFixed(3) }));
      const b = BUDGET[tier];
      expect(worstCalls, 'çağrı').toBeLessThanOrEqual(b.calls);
      expect(worstInst, 'örnek').toBeLessThanOrEqual(b.inst);
      expect(worstTris, 'üçgen').toBeLessThanOrEqual(b.tris);
      const bakeMs = ir.stats.maxBakeMs < scaled(120) ? ir.stats.maxBakeMs : Math.min(ir.stats.maxBakeMs, remeasureBake(pw, tier, cx, cz));
      expect(bakeMs, 'pişirme').toBeLessThan(scaled(120));
      expect(sumMs / frames, 'ortalama güncelleme').toBeLessThan(scaled(2.5));
      expect(INTERIOR_TIERS[tier].maxChunks + 1).toBeLessThanOrEqual(b.calls - 8);
      expect(PROP_TIERS[tier].maxInst).toBeLessThanOrEqual(b.inst);
      // bellek: pişirilmiş tamponlar ≤ 25 MB
      expect(ir.stats.memBytes).toBeLessThan(25 * 1024 * 1024);
      ir.dispose();
      pr.dispose();
    }, 120000);
  });

  it('tüm şehir prop kümeleri yüklü olsa bile (yüksek kademe) iç mekân çizicisi yalnız yakın chunk\'ları çizer', () => {
    const pw = new PropWorld({ citySeed: SEED });
    for (let cz = win.cz - 8; cz <= win.cz + 10; cz++) for (let cx = win.cx - 8; cx <= win.cx + 10; cx++) pw.loadChunk(cx, cz);
    const ir = createInteriorPropRenderer({
      THREE, uniforms: createMaterialUniforms(THREE), quality: 'high', createCanvas: () => fakeCanvas(),
    });
    ir.setWorld(pw);
    const cam = camAt(win.cx * 16 + 24, 65.6, win.cz * 16 + 24, 0);
    for (let i = 0; i < 400; i++) ir.update(1 / 60, cam);
    expect(ir.stats.shown).toBeLessThanOrEqual(INTERIOR_TIERS.high.maxChunks);
    expect(ir.stats.chunks).toBeLessThanOrEqual(INTERIOR_TIERS.high.maxChunks + 8);
    ir.dispose();
  }, 120000);
});
