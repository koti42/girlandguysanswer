import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FLOATER_STYLE, atlasCell, createFloaters, floaterAlpha, floaterPop, styleOf,
} from './mobsFloaters.js';
import { DamageNumbers } from '../sim/combat.js';

function fakeCanvas(w, h) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'calls') return calls;
      if (typeof t[k] === 'function' || k in t) return t[k];
      return (...a) => { calls.push([String(k), ...a]); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: w, height: h, getContext: () => ctx, calls };
}

describe('floater yardımcıları', () => {
  it('stil, alfa, pop', () => {
    expect(styleOf('crit')).toBe(FLOATER_STYLE.crit);
    expect(styleOf('bilinmeyen')).toBe(FLOATER_STYLE.hit);
    expect(floaterAlpha(0, 1)).toBe(1);
    expect(floaterAlpha(0.45, 1)).toBe(1);
    expect(floaterAlpha(0.725, 1)).toBeCloseTo(0.5);
    expect(floaterAlpha(1, 1)).toBe(0);
    expect(floaterAlpha(0.5, 0)).toBe(0);
    expect(floaterPop(0, false)).toBeCloseTo(1.35);
    expect(floaterPop(0.2, false)).toBe(1);
    expect(floaterPop(0, true)).toBe(1);
  });

  it('atlas hücreleri 8×3 ve UV aralıkları çakışmaz', () => {
    const seen = new Set();
    for (let i = 0; i < 24; i++) {
      const c = atlasCell(i);
      expect(c.col).toBeLessThan(8);
      expect(c.row).toBeLessThan(3);
      expect(c.ox).toBeGreaterThanOrEqual(0);
      expect(c.ox + c.rx).toBeLessThanOrEqual(1.0000001);
      expect(c.oy + c.ry).toBeLessThanOrEqual(1.0000001);
      seen.add(c.col + ',' + c.row);
    }
    expect(seen.size).toBe(24);
  });
});

describe('createFloaters', () => {
  function setup(opts) {
    const root = new THREE.Group();
    const canvases = [];
    const f = createFloaters(THREE, root, Object.assign({ makeCanvas: (w, h) => { const c = fakeCanvas(w, h); canvases.push(c); return c; } }, opts || {}));
    return { root, f, canvases };
  }
  const cam = { x: 0, y: 60, z: 0 };

  it('tek paylaşılan tuval; ısınma çizimi sonrası temizlenir; yeni sayı yalnızca bir kez çizilir', () => {
    const { f, canvases } = setup();
    expect(canvases).toHaveLength(1);
    expect(canvases[0].width).toBe(160 * 8);
    const c = canvases[0];
    const warmCalls = c.calls.length;
    expect(warmCalls).toBeGreaterThan(0);
    expect(c.calls.some((x) => x[0] === 'clearRect' && x[3] === 160 * 8)).toBe(true);
    const nums = new DamageNumbers();
    nums.add(0, 61, -4, 6, 'hit');
    const before = c.calls.length;
    f.update(nums.list, cam);
    expect(f.stats.active).toBe(1);
    const fills = c.calls.slice(before).filter((x) => x[0] === 'fillText');
    expect(fills).toHaveLength(1);
    expect(fills[0][1]).toBe('6');
    const mid = c.calls.length;
    nums.update(0.05);
    f.update(nums.list, cam);
    expect(c.calls.slice(mid).filter((x) => x[0] === 'fillText')).toHaveLength(0);
    f.dispose();
  });

  it('sprite konumu/ölçeği/opaklık; uzak sayı gizli; setVisible(false) hepsini gizler', () => {
    const { root, f } = setup();
    const grp = root.children.find((x) => x.name === 'hasar-sayilari');
    const nums = new DamageNumbers();
    nums.add(0, 61, -4, 3, 'crit');
    nums.add(300, 61, 0, 3, 'hit');
    f.update(nums.list, cam);
    const vis = grp.children.filter((s) => s.visible);
    expect(vis).toHaveLength(1);
    expect(vis[0].position.z).toBe(-4);
    expect(vis[0].scale.x).toBeGreaterThan(vis[0].scale.y);
    expect(vis[0].material.opacity).toBe(1);
    f.setVisible(false);
    f.update(nums.list, cam);
    expect(grp.children.filter((s) => s.visible)).toHaveLength(0);
    f.setVisible(true);
    f.update(nums.list, cam);
    expect(grp.children.filter((s) => s.visible)).toHaveLength(1);
    f.dispose();
  });

  it('oyuncu hasar sayısı hidePlayer iken gösterilmez', () => {
    let hide = true;
    const { root, f } = setup({ hidePlayer: () => hide });
    const grp = root.children.find((x) => x.name === 'hasar-sayilari');
    const nums = new DamageNumbers();
    nums.add(0, 61, -2, 4, 'player');
    f.update(nums.list, cam);
    expect(grp.children.filter((s) => s.visible)).toHaveLength(0);
    hide = false;
    f.update(nums.list, cam);
    expect(grp.children.filter((s) => s.visible)).toHaveLength(1);
    f.dispose();
  });

  it('tuval yoksa (node) çökmeden çalışır', () => {
    const root = new THREE.Group();
    const f = createFloaters(THREE, root, { makeCanvas: () => null });
    const nums = new DamageNumbers();
    nums.add(0, 61, -2, 4, 'hit');
    expect(() => f.update(nums.list, cam)).not.toThrow();
    f.dispose();
  });
});
