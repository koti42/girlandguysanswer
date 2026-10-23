/*
 * Robot modelleri (render/robotModels.js): hitbox uyumu, üçgen/ağ bütçeleri, NaN yok, dağılma süresi (0.6 sn), saldırı işaretleri, kısıtlı hareket, birleşik/ayrık deri.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MODEL_BUILDERS, MOB_TYPES, createMobModel } from './mobModels.js';
import { ROBOT_BUILDERS } from './robotModels.js';
import { MOB_KEYS, ROBOT_KEYS, ROBOT_TYPES } from '../sim/mobTypes.js';

function allFinite(root) {
  let bad = 0;
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    const e = o.matrixWorld.elements;
    for (let i = 0; i < 16; i++) if (!Number.isFinite(e[i])) bad++;
    if (o.isMesh) {
      const attrs = o.geometry.attributes;
      for (const name of Object.keys(attrs)) {
        const arr = attrs[name].array;
        for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) { bad++; break; }
      }
      const m = o.material;
      if (m.emissive && !Number.isFinite(m.emissive.r + m.emissive.g + m.emissive.b)) bad++;
      if (!Number.isFinite(m.opacity)) bad++;
    }
  });
  return bad;
}

describe('kayıt', () => {
  it('her robotun model kurucusu var; ana diyar MODEL_BUILDERS/MOB_TYPES tablosu DEĞİŞMEDİ', () => {
    ROBOT_KEYS.forEach((k) => expect(typeof ROBOT_BUILDERS[k]).toBe('function'));
    expect(Object.keys(ROBOT_BUILDERS).sort()).toEqual(ROBOT_KEYS.slice().sort());
    expect(Object.keys(MODEL_BUILDERS).sort()).toEqual(MOB_KEYS.slice().sort());
    ROBOT_KEYS.forEach((k) => {
      expect(MODEL_BUILDERS[k]).toBeUndefined();
      expect(MOB_TYPES[k]).toBeUndefined();
    });
  });

  it('createMobModel robot anahtarını çözer (def, tip, hitbox); bilinmeyen tür hâlâ yedek model', () => {
    ROBOT_KEYS.forEach((k) => {
      const m = createMobModel(THREE, k, { quality: 'low', seed: 1 });
      expect(m.type).toBe(k);
      expect(m.def).toBe(ROBOT_TYPES[k]);
      expect(m.hitbox).toBe(ROBOT_TYPES[k].hitbox);
      m.dispose();
    });
    const u = createMobModel(THREE, 'robot-degil', { quality: 'low' });
    expect(u.type).toBeNull();
    u.dispose();
  });
});

describe('geometri: hitbox uyumu ve bütçeler (3 kalite)', () => {
  ROBOT_KEYS.forEach((key) => {
    it(key + ': ölçüler hitbox ile uyumlu, ≤ 3500 üçgen (yüksek), ≤ 34 ağ, NaN yok', () => {
      const t = ROBOT_TYPES[key];
      const tri = {};
      for (const q of ['low', 'medium', 'high']) {
        const m = createMobModel(THREE, key, { quality: q, seed: 3 });
        const size = m.bounds.getSize(new THREE.Vector3());
        const c = m.bounds.getCenter(new THREE.Vector3());
        expect(m.bounds.isEmpty()).toBe(false);
        expect(size.y).toBeGreaterThan(t.hitbox.h * (t.hitbox.h < 0.5 ? 0.3 : 0.55));
        expect(size.y).toBeLessThan(t.hitbox.h * 1.25);
        expect(size.x).toBeLessThan(t.hitbox.w * 1.55 + 0.05);
        expect(size.z).toBeLessThan(t.hitbox.w * 1.55 + 0.05);
        expect(Math.abs(c.x)).toBeLessThan(Math.max(0.3, t.hitbox.w * 0.3));
        expect(Math.abs(c.z)).toBeLessThan(Math.max(0.3, t.hitbox.w * 0.3));
        expect(m.bounds.min.y).toBeGreaterThan(-0.25);
        const grounded = t.movement === 'yürü' || t.movement === 'sek';
        expect(m.bounds.min.y).toBeLessThan(grounded ? t.hitbox.h * 0.35 : 0.6);
        tri[q] = m.initialStats.triangles;
        expect(m.initialStats.meshes).toBeLessThanOrEqual(34);
        if (q === 'high') expect(m.initialStats.triangles).toBeLessThanOrEqual(3500);
        expect(allFinite(m.root)).toBe(0);
        m.root.traverse((o) => {
          if (!o.isMesh) return;
          const n = o.geometry.attributes.normal;
          for (let i = 0; i < Math.min(n.count, 200); i++) {
            const l = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
            expect(l).toBeGreaterThan(0.99);
            expect(l).toBeLessThan(1.01);
          }
        });
        m.dispose();
      }
      expect(tri.low).toBeLessThanOrEqual(tri.high);
      expect(tri.medium).toBeLessThanOrEqual(tri.high);
    });
  });

  it('birleşik deri ve ayrık ağ yolları ikisi de çizilebilir (ağ sayısı birleşikte daha az)', () => {
    ROBOT_KEYS.forEach((key) => {
      const a = createMobModel(THREE, key, { quality: 'high', seed: 2, merge: true });
      const b = createMobModel(THREE, key, { quality: 'high', seed: 2, merge: false });
      expect(allFinite(a.root)).toBe(0);
      expect(allFinite(b.root)).toBe(0);
      expect(a.initialStats.meshes).toBeLessThanOrEqual(b.initialStats.meshes);
      a.dispose();
      b.dispose();
    });
  });
});

describe('animasyon ve durumlar', () => {
  ROBOT_KEYS.forEach((key) => {
    it(key + ': yürüme/duruş/vuruş/saldırı karelerinde NaN yok; kısıtlı harekette de', () => {
      for (const reduced of [false, true]) {
        const m = createMobModel(THREE, key, { quality: 'medium', seed: 5, reducedMotion: reduced });
        const kinds = { bekcirobot: 'dur', hatabot: 'kivilcim', gozdrone: 'tarama' };
        for (let i = 0; i < 90; i++) {
          m.update(1 / 60, {
            speed: i % 40 < 20 ? 2 : 0, hurt: i === 10, attacking: i > 20 && i < 70 ? (kinds[key] || false) : false, aim: i > 30 ? { yaw: 0.5, pitch: -0.2 } : null,
          });
        }
        expect(allFinite(m.root)).toBe(0);
        m.dispose();
      }
    });
  });

  it('bekçi: "dur" işaretinde sağ kol kalkar (rüzgâr evresi, ≥0.8 sn görünür); hatabot kıvılcım evresinde eğilir', () => {
    const m = createMobModel(THREE, 'bekcirobot', { quality: 'high', seed: 1, merge: false });
    const arm = m.root.getObjectByName('armR');
    expect(arm).toBeTruthy();
    m.update(1 / 60, { speed: 0, attacking: false });
    const rest = arm.rotation.x;
    let peak = -9;
    let visible = 0;
    for (let i = 0; i < 150; i++) {
      m.update(1 / 60, { speed: 0, attacking: 'dur' });
      peak = Math.max(peak, arm.rotation.x);
      if (arm.rotation.x > rest + 0.4) visible++;
    }
    expect(peak).toBeGreaterThan(rest + 1);
    expect(visible / 60).toBeGreaterThanOrEqual(0.8);
    m.dispose();
  });

  it('gözcü dron: tarama halkası işaret sırasında büyür, bitince söner (≤ 1.1× hitbox yatayda halka dışında rest ölçüsü)', () => {
    const m = createMobModel(THREE, 'gozdrone', { quality: 'high', seed: 1, merge: false });
    const ring = m.root.getObjectByName('rot');
    expect(ring).toBeTruthy();
    m.update(1 / 60, { speed: 0, attacking: false });
    const s0 = ring.scale.x;
    for (let i = 0; i < 40; i++) m.update(1 / 60, { speed: 0, attacking: 'tarama' });
    expect(ring.scale.x).toBeGreaterThan(s0 + 0.5);
    for (let i = 0; i < 200; i++) m.update(1 / 60, { speed: 0, attacking: false });
    expect(ring.scale.x).toBeLessThan(0.05);
    m.dispose();
  });

  it('dağılma 0.6 sn: dead durumunda ~36 karede deathDone; ana diyar türleri hâlâ 1.1 sn', () => {
    ROBOT_KEYS.forEach((key) => {
      const m = createMobModel(THREE, key, { quality: 'low', seed: 4 });
      m.update(1 / 60, { dead: true });
      let n = 1;
      while (!m.deathDone && n < 200) { m.update(1 / 60, { dead: true }); n++; }
      expect(n / 60).toBeGreaterThanOrEqual(0.55);
      expect(n / 60).toBeLessThanOrEqual(0.7);
      expect(m.root.visible).toBe(false);
      m.dispose();
    });
    const g = createMobModel(THREE, 'golge', { quality: 'low', seed: 4 });
    g.update(1 / 60, { dead: true });
    let n = 1;
    while (!g.deathDone && n < 300) { g.update(1 / 60, { dead: true }); n++; }
    expect(n / 60).toBeGreaterThan(1.0);
    g.dispose();
  });

  it('kalite değişimi ve havuz yeniden kullanımı (reset) güvenli; dispose sonrası güncelleme sessiz', () => {
    const m = createMobModel(THREE, 'hatabot', { quality: 'high', seed: 9 });
    m.setQuality('low');
    m.update(1 / 60, { speed: 1 });
    m.setQuality('high');
    m.update(1 / 60, { dead: true });
    m.reset();
    expect(m.root.visible).toBe(true);
    m.update(1 / 60, { speed: 1 });
    expect(allFinite(m.root)).toBe(0);
    m.dispose();
    expect(() => m.update(1 / 60, { speed: 1 })).not.toThrow();
  });

  it('ölüm rengi ve ışıma rengi tanımlı (parlak vurgu): her robot', () => {
    ROBOT_KEYS.forEach((key) => {
      const m = createMobModel(THREE, key, { quality: 'low' });
      expect(m.deathColor).toBeGreaterThan(0);
      expect(m.glowColor).toBeGreaterThan(0);
      m.dispose();
    });
  });
});
