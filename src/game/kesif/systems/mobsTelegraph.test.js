import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KIND, createTelegraphs, telegraphParams } from './mobsTelegraph.js';
import { createHazard } from '../sim/entitiesHazards.js';

const P = () => ({});
const mk = (spec, stage, progress) => {
  const h = createHazard(1, Object.assign({ x: 10, y: 60, z: -5 }, spec), null);
  h.stage = stage || 'windup';
  h.progress = progress === undefined ? 0.5 : progress;
  return h;
};

describe('telegraphParams', () => {
  it('daire: disk, yarıçap yerde, hazırlıkta ilerleme, etkinde flaş', () => {
    const o = P();
    expect(telegraphParams(mk({ shape: 'circle', r: 3 }, 'windup', 0.4), 0, o)).toBe(true);
    expect(o.kind).toBe(KIND.disc);
    expect(o.sx).toBeCloseTo(3.05);
    expect(o.prog).toBeCloseTo(0.4);
    expect(o.act).toBe(0);
    expect(o.y).toBeGreaterThan(60);
    telegraphParams(mk({ shape: 'circle', r: 3 }, 'active'), 0, o);
    expect(o.act).toBe(1);
    expect(o.prog).toBe(1);
  });

  it('halka: iç/dış yarıçap bölgesi oranları, genişledikçe ölçek büyür', () => {
    const o = P();
    const h = mk({ shape: 'ring', r: 2, rMax: 12, thick: 1 }, 'windup');
    telegraphParams(h, 0, o);
    expect(o.kind).toBe(KIND.ring);
    expect(o.rin).toBeGreaterThan(0);
    expect(o.rout).toBeLessThanOrEqual(1);
    expect(o.rin).toBeLessThan(o.rout);
    const s0 = o.sx;
    h.stage = 'active';
    h.r = 8;
    telegraphParams(h, 0, o);
    expect(o.sx).toBeGreaterThan(s0);
    expect(o.act).toBe(1);
  });

  it('çizgi: merkezde, yönde döner, uzunluk/2 × genişlik/2', () => {
    const o = P();
    telegraphParams(mk({ shape: 'line', dx: 1, dz: 0, len: 10, width: 2 }), 0, o);
    expect(o.kind).toBe(KIND.bar);
    expect(o.x).toBeCloseTo(15);
    expect(o.z).toBeCloseTo(-5);
    expect(o.sx).toBeCloseTo(5);
    expect(o.sz).toBeCloseTo(1);
    expect(o.rotY).toBeCloseTo(0);
    telegraphParams(mk({ shape: 'line', dx: 0, dz: 1, len: 10, width: 2 }), 0, o);
    expect(o.rotY).toBeCloseTo(-Math.PI / 2);
    expect(o.z).toBeCloseTo(0);
  });

  it('ışın: hazırlıkta süpürme dilimi (alt şekil 1), etkinde yok; etkin uzunluk bloktan kısalır', () => {
    const o = P();
    const b = mk({
      shape: 'beam', len: 18, width: 1, angle: 0, arc0: 0.2, arc1: 1.7,
    }, 'windup');
    expect(telegraphParams(b, 0, o)).toBe(true);
    expect(telegraphParams(b, 1, o)).toBe(true);
    expect(o.kind).toBe(KIND.sector);
    expect(o.a0).toBeCloseTo(0.2);
    expect(o.a1).toBeCloseTo(1.7);
    b.stage = 'active';
    b.effLen = 6;
    b.dx = 1;
    b.dz = 0;
    expect(telegraphParams(b, 1, o)).toBe(false);
    telegraphParams(b, 0, o);
    expect(o.sx).toBeCloseTo(3);
    // dar yay: dilim çizilmez
    const narrow = mk({ shape: 'beam', len: 10, arc0: 1, arc1: 1.01 }, 'windup');
    expect(telegraphParams(narrow, 1, o)).toBe(false);
  });

  it('bölge/rün/portal ve bilinmeyen şekil', () => {
    const o = P();
    telegraphParams(mk({ shape: 'zone', r: 4 }, 'active'), 0, o);
    expect(o.kind).toBe(KIND.disc);
    expect(o.act).toBeLessThan(0.5);
    telegraphParams(mk({ shape: 'rune', r: 2 }), 0, o);
    expect(o.kind).toBe(KIND.rune);
    expect(telegraphParams({ shape: 'garip', stage: 'windup', x: 0, y: 0, z: 0 }, 0, o)).toBe(false);
  });
});

describe('createTelegraphs (havuz)', () => {
  function setup() {
    const root = new THREE.Group();
    const t = createTelegraphs(THREE, root, { reducedMotion: false });
    return { root, t };
  }
  const cam = { x: 10, y: 62, z: -5 };

  it('tehlikeler için levha açar, biten tehlikede gizler, yuvayı yeniden kullanır', () => {
    const { root, t } = setup();
    const grp = root.children.find((c) => c.name === 'telegraf');
    const visible = () => grp.children.filter((c) => c.visible).length;
    const h1 = mk({ shape: 'circle', r: 2 });
    const h2 = mk({ shape: 'beam', len: 12, arc0: 0, arc1: 1.2 });
    t.update([h1, h2], cam, 1);
    expect(t.stats.active).toBe(3); // daire + ışın + dilim
    expect(visible()).toBe(3);
    h2.stage = 'active';
    t.update([h1, h2], cam, 1.1);
    expect(t.stats.active).toBe(2); // dilim bıraktı
    t.update([], cam, 1.2);
    expect(visible()).toBe(0);
    const h3 = mk({ shape: 'ring', r: 1, rMax: 6 });
    t.update([h3], cam, 1.3);
    expect(visible()).toBe(1);
    t.clear();
    expect(visible()).toBe(0);
    t.dispose();
    expect(root.children).toHaveLength(0);
  });

  it('uzak tehlike çizilmez; uniform değerleri güncellenir; kısıtlı hareket uCalm', () => {
    const { root, t } = setup();
    const grp = root.children.find((c) => c.name === 'telegraf');
    t.update([mk({ shape: 'circle', r: 2, x: 500, z: 500 })], cam, 0);
    expect(t.stats.active).toBe(0);
    const h = mk({ shape: 'circle', r: 2 }, 'windup', 0.7);
    t.update([h], cam, 2.5);
    const m = grp.children.find((c) => c.visible);
    expect(m.material.uniforms.uProg.value).toBeCloseTo(0.7);
    expect(m.material.uniforms.uTime.value).toBe(2.5);
    expect(m.material.uniforms.uKind.value).toBe(KIND.disc);
    t.setReducedMotion(true);
    expect(m.material.uniforms.uCalm.value).toBe(1);
    t.dispose();
  });

  it('havuz doluysa fazla tehlike sessizce atlanır', () => {
    const { t } = setup();
    const list = [];
    for (let i = 0; i < 60; i++) list.push(mk({ shape: 'circle', r: 1, x: 10 + (i % 5), z: -5 }));
    t.update(list, cam, 0);
    expect(t.stats.active).toBeLessThanOrEqual(28);
    expect(t.stats.active).toBeGreaterThan(20);
    t.dispose();
  });
});
