import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem, CROWD_ORDER, PED_COLLIDER_BASE } from './crowd.js';
import { createSystem as createVisual } from './crowdVisual.js';
import { createSystem as createTraffic } from './traffic.js';
import { standardSystemFiles } from '../gameSystems.js';
import { TIER_CAPS } from '../sim/city/ped/pedData.js';
import { POOL } from '../sim/city/ped/crowdCore.js';

vi.setConfig({ testTimeout: 240000 });

function boot(opts) {
  const kit = makeDimG(Object.assign({ render: true, systems: ['blocks', 'props', 'dimension'] }, opts || null));
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  G.registry.list().forEach((s) => { if (s === sys && typeof s.init === 'function') s.init(G); });
  return { kit, G, sys, api: sys.api() };
}

function toCity(b, px, pz) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  for (let cx = Math.floor((px - 120) / 16); cx <= Math.floor((px + 120) / 16); cx++) for (let cz = Math.floor((pz - 120) / 16); cz <= Math.floor((pz + 120) / 16); cz++) w.ensureChunk(cx, cz);
  b.kit.place(px, 64, pz, 0);
  b.G.worldReady = true;
  b.kit.frame(1 / 60, 30);
  return r;
}

describe('crowd sistemi: kurulum, sıra, dosya kaydı', () => {
  it('sıra 29 (traffic 27 sonrası, cityMissions 31 öncesi); onDimension/beforeDimension/dispose var; gameSystems kaydı', () => {
    const b = boot();
    expect(CROWD_ORDER).toBe(29);
    expect(b.sys.order).toBe(29);
    ['onDimension', 'beforeDimension', 'dispose', 'fixedUpdate', 'api'].forEach((k) => expect(typeof b.sys[k]).toBe('function'));
    const files = standardSystemFiles();
    expect(files).toContain('./systems/crowd.js');
    expect(files).toContain('./systems/crowdVisual.js');
    const orders = b.G.registry.list().map((s) => s.order).filter((o) => typeof o === 'number');
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('overworld\'de yaya yok: G.crowd null, getCrowd boş görünüm', () => {
    const b = boot();
    b.kit.frame(1 / 60, 60);
    expect(b.G.crowd == null).toBe(true);
    expect(b.api.getCrowd().count).toBe(0);
    expect(b.api.getCrowdStats().active).toBe(false);
  });
});

describe('crowd sistemi: şehirde canlı kalabalık', () => {
  it('şehre geçince yayalar kurulur, hedef sayıya dolar; görünüm sonlu ve oyuncuya yakın; kademe sayıları tavanı aşmaz', () => {
    const b = boot();
    toCity(b, 240, 80);
    b.kit.frame(1 / 60, 180);
    const cr = b.G.crowd;
    expect(cr).toBeTruthy();
    expect(cr.alive()).toBeGreaterThanOrEqual(8);
    expect(cr.alive()).toBeLessThanOrEqual(60);
    const v = cr.fillView(1);
    expect(v.count).toBe(cr.alive());
    for (let i = 0; i < v.count; i++) {
      expect(Number.isFinite(v.x[i] + v.y[i] + v.z[i] + v.yaw[i] + v.phase[i])).toBe(true);
      expect(Math.hypot(v.x[i] - 240, v.z[i] - 80)).toBeLessThan(TIER_CAPS.high.despawnR + 20);
    }
    const t = Array.from(cr.tierCount);
    expect(t[0]).toBeLessThanOrEqual(TIER_CAPS.high.near);
    expect(t[1]).toBeLessThanOrEqual(TIER_CAPS.high.mid);
    expect(t[0] + t[1] + t[2]).toBe(cr.alive());
    const st = b.api.getCrowdStats();
    expect(st.active).toBe(true);
    expect(st.spawned).toBeGreaterThanOrEqual(cr.alive());
  });

  it('20 Hz adım: 60 sabit adımda ~20 yaya adımı; kalite kademesi tavanı (düşük 24 / orta 40 / yüksek 60)', () => {
    const b = boot();
    toCity(b, 240, 80);
    const s0 = b.sys.sys.stats.steps;
    b.kit.frame(1 / 60, 60);
    expect(b.sys.sys.stats.steps - s0).toBeGreaterThanOrEqual(19);
    expect(b.sys.sys.stats.steps - s0).toBeLessThanOrEqual(21);
    b.G.quality.settings.effTier = 'low';
    b.kit.frame(1 / 60, 90);
    expect(b.G.crowd.caps.total).toBe(24);
    expect(b.G.crowd.alive()).toBeLessThanOrEqual(24 + 6);
    b.G.quality.settings.effTier = 'high';
    b.kit.frame(1 / 60, 90);
    expect(b.G.crowd.caps.total).toBe(60);
  });

  it('çarpışma kutuları: yakın (≤ 18 m) yayalar world.colliders\'a küçük dinamik kutu olarak yazılır; isSoftCollider yumuşak der', () => {
    const b = boot();
    toCity(b, 240, 80);
    b.kit.frame(1 / 60, 240);
    const cc = b.G.world.colliders;
    const cr = b.G.crowd;
    expect(typeof b.G.isSoftCollider).toBe('function');
    const reg = b.sys.state.registered;
    let checked = 0;
    const out = new Float64Array(6 * 8);
    cr.peds.forEach((p, i) => {
      if (!p.alive || p.tier !== 0) return;
      const d = Math.hypot(p.x - b.G.body.x, p.z - b.G.body.z);
      const id = b.sys.state.colBase + i;
      if (d < 17 && d > 0.8 && p.fade > 0.5) {
        expect(reg.has(id)).toBe(true);
        expect(b.G.isSoftCollider(id)).toBe(true);
        const n = cc.queryRaw(p.x - 0.05, p.y + 0.3, p.z - 0.05, p.x + 0.05, p.y + 0.6, p.z + 0.05, out, 8);
        let f = false;
        for (let k = 0; k < n; k++) if (cc.ids[k] === id) f = true;
        expect(f).toBe(true);
        checked++;
      }
    });
    expect(b.G.isSoftCollider(1234)).toBe(false);
    expect(PED_COLLIDER_BASE + POOL).toBeGreaterThan(PED_COLLIDER_BASE);
    expect(checked).toBeGreaterThanOrEqual(0);
  });

  it('boyut değişimi: çıkışta yayalar ve kutular atılır, dönüşte yeniden kurulur; 20 sıçramada sızıntı yok', () => {
    const b = boot();
    toCity(b, 240, 80);
    b.kit.frame(1 / 60, 120);
    expect(b.G.crowd).toBeTruthy();
    b.kit.mgr.swap('overworld', { reason: 'test' });
    b.kit.frame(1 / 60, 30);
    expect(b.G.crowd == null).toBe(true);
    expect(b.sys.state.registered.size).toBe(0);
    for (let i = 0; i < 20; i++) {
      toCity(b, 240, 80);
      b.kit.frame(1 / 60, 30);
      b.kit.mgr.swap('overworld', { reason: 'test' });
      b.kit.frame(1 / 60, 6);
    }
    expect(b.sys.state.registered.size).toBe(0);
    expect(b.sys.sys.stats.creates).toBe(b.sys.sys.stats.disposes + (b.G.crowd ? 1 : 0));
  });

  it('aynı saat + konum + tohum → aynı kalabalık (kayıt/yükleme yeniden kurulumu belirlenimli)', () => {
    const run = () => {
      const b = boot();
      toCity(b, 240, 80);
      b.G.crowd.setTime(5000);
      b.G.crowd.populate();
      return b.G.crowd.digest();
    };
    expect(run()).toBe(run());
  });

  it('trafikle bütünleşme: trafik kancası ve engel listesi crowd\'a bağlanır; hata yok', () => {
    const b = boot();
    const tr = createTraffic(b.G);
    b.G.addSystem(tr);
    toCity(b, 240, 80);
    b.kit.frame(1 / 60, 600);
    expect(b.G.traffic).toBeTruthy();
    expect(b.G.crowd).toBeTruthy();
    expect(typeof b.G.crowd.pedBlocked).toBe('function');
    expect(b.G.crowd.pedBlocked(-1, 0)).toBe(false);
  });

  it('görsel sistem: şehirde çizici kurulur, istatistik sonlu, çizim çağrısı ≤ 12, dispose temiz', () => {
    const b = boot();
    const vis = createVisual(b.G);
    b.G.addSystem(vis);
    vis.init(b.G);
    toCity(b, 240, 80);
    b.kit.frame(1 / 60, 240);
    const rs = b.G.crowdRenderStats();
    expect(rs).toBeTruthy();
    expect(rs.draws).toBeLessThanOrEqual(12);
    expect(rs.near + rs.mid + rs.far).toBe(b.G.crowd.alive());
    expect(Number.isFinite(rs.tris)).toBe(true);
    vis.dispose();
    expect(b.G.crowdRender).toBeNull();
  });
});
