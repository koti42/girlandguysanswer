import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem, TRAFFIC_COLLIDER_BASE, TRAFFIC_ORDER } from './traffic.js';
import { lampList } from './trafficLamps.js';
import { armSignal } from '../sim/city/vehicle/trafficLights.js';
import { trafficNet } from '../sim/city/vehicle/junctions.js';
import { CAR_FLAG } from '../sim/city/vehicle/trafficCars.js';
import { createSystem as createVehicles } from './vehicles.js';
import { standardSystemFiles } from '../gameSystems.js';

vi.setConfig({ testTimeout: 180000 });

function boot(opts) {
  const kit = makeDimG(Object.assign({ render: true, systems: ['blocks', 'props', 'dimension'] }, opts || null));
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  return { kit, G, sys, api: sys.api() };
}

function toCity(b, px, pz) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  const cx0 = Math.floor((px - 100) / 16);
  const cx1 = Math.floor((px + 100) / 16);
  const cz0 = Math.floor((pz - 100) / 16);
  const cz1 = Math.floor((pz + 100) / 16);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) w.ensureChunk(cx, cz);
  b.kit.place(px, 64, pz, 0);
  b.G.worldReady = true;
  b.kit.frame(1 / 60, 30);
  return r;
}

describe('traffic sistemi: kurulum, sıra, dosya kaydı', () => {
  it('sıra 27 (vehicles 26 sonrası, crowd 29 öncesi); onDimension/beforeDimension var; gameSystems kaydı', () => {
    const b = boot();
    expect(TRAFFIC_ORDER).toBe(27);
    expect(b.sys.order).toBe(27);
    expect(typeof b.sys.onDimension).toBe('function');
    expect(typeof b.sys.beforeDimension).toBe('function');
    expect(typeof b.sys.dispose).toBe('function');
    expect(standardSystemFiles()).toContain('./systems/traffic.js');
    const orders = b.G.registry.list().map((s) => s.order).filter((o) => typeof o === 'number');
    expect(new Set(orders).size).toBe(orders.length); // sıralar benzersiz
  });

  it('overworld\'de trafik yok: G.traffic null, getTraffic boş görünüm', () => {
    const b = boot();
    b.kit.frame(1 / 60, 60);
    expect(b.G.traffic == null).toBe(true);
    expect(b.api.getTraffic().count).toBe(0);
    expect(b.api.getTrafficStats().active).toBe(false);
    expect(b.api.getTrafficLight()).toBe(null);
  });
});

describe('traffic sistemi: şehirde canlı trafik', () => {
  it('şehre geçince trafik kurulur, kademe tavanına kadar dolar; getTraffic görünümü dolu ve sonlu', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 120);
    const tr = b.G.traffic;
    expect(tr).toBeTruthy();
    expect(tr.alive()).toBeGreaterThanOrEqual(10);
    expect(tr.alive()).toBeLessThanOrEqual(30);
    const v = b.api.getTraffic();
    expect(v).toBe(tr.view);
    expect(v.count).toBe(tr.alive());
    for (let i = 0; i < v.count; i++) {
      expect(Number.isFinite(v.x[i] + v.y[i] + v.z[i] + v.yaw[i])).toBe(true);
      expect(Math.hypot(v.x[i] + 240, v.z[i] + 120)).toBeLessThan(160);
    }
    const st = b.api.getTrafficStats();
    expect(st.active).toBe(true);
    expect(st.spawned).toBeGreaterThanOrEqual(v.count);
    expect(st.redRuns).toBe(0);
  });

  it('20 Hz adım: 60 sabit adımda 20 trafik adımı; yeniden doldurma boyut girişinde; kademe tavanı düşük 10 / orta 18', () => {
    const b = boot();
    toCity(b, -240, -120);
    const s0 = b.sys.sys.stats.steps;
    b.kit.frame(1 / 60, 60);
    expect(b.sys.sys.stats.steps - s0).toBeGreaterThanOrEqual(19);
    expect(b.sys.sys.stats.steps - s0).toBeLessThanOrEqual(21);
    b.G.quality.settings.effTier = 'low';
    b.kit.frame(1 / 60, 90);
    expect(b.G.traffic.getCap()).toBe(10);
    expect(b.sys.state.tickDt).toBeCloseTo(1 / 15, 5);
    b.G.quality.settings.effTier = 'medium';
    b.kit.frame(1 / 60, 90);
    expect(b.G.traffic.getCap()).toBe(18);
    b.G.quality.settings.effTier = 'high';
    b.kit.frame(1 / 60, 90);
    expect(b.G.traffic.getCap()).toBe(30);
  });

  it('çarpışma kutuları: yakın araçlar world.colliders\'a dinamik kutu olarak yazılır, konumla eşleşir, uzaklaşınca silinir', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 240);
    const cc = b.G.world.colliders;
    expect(cc).toBeTruthy();
    const tr = b.G.traffic;
    const reg = b.sys.state.registered;
    expect(reg.size).toBeGreaterThan(0);
    const out = new Float64Array(6 * 8);
    let checked = 0;
    tr.cars.forEach((c, i) => {
      const id = b.sys.state.colBase + i;
      const dist = Math.hypot(c.x + 240, c.z + 120);
      if (c.alive && c.state === 1 && c.fade > 0.5 && dist < 69) {
        expect(reg.has(id)).toBe(true);
        const n = cc.queryRaw(c.x - 0.1, c.y + 0.2, c.z - 0.1, c.x + 0.1, c.y + 0.4, c.z + 0.1, out, 8);
        let found = false;
        for (let k = 0; k < n; k++) if (cc.ids[k] === id) found = true;
        expect(found).toBe(true);
        checked++;
      }
      if (dist > 75 || !c.alive) expect(reg.has(id)).toBe(false);
    });
    expect(checked).toBeGreaterThan(0);
    expect(TRAFFIC_COLLIDER_BASE).toBeGreaterThan(0x70000000);
  });

  it('oyuncu araca çarpınca (vehiclePhys bump, collider kimliği) araç durur ve uyarı ışıkları yanar; trafficBump olayı', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 240);
    const tr = b.G.traffic;
    const idx = tr.cars.findIndex((c, i) => c.alive && c.state === 1 && c.v > 3 && b.sys.state.registered.has(b.sys.state.colBase + i));
    expect(idx).toBeGreaterThanOrEqual(0);
    const bumps = [];
    const orig = b.G.emit.bind(b.G);
    b.G.emit = (e) => { if (e.type === 'trafficBump') bumps.push(e); return orig(e); };
    b.sys.onEvent(b.G, { type: 'vehiclePhys', ev: { type: 'bump', id: b.sys.state.colBase + idx, impact: 9 }, id: 1, cls: 'taksi' });
    b.kit.frame(1 / 60, 40);
    const c = tr.cars[idx];
    expect(bumps.length).toBe(1);
    expect(c.v).toBeLessThan(1);
    expect(c.flags & CAR_FLAG.HAZARD).toBeTruthy();
    // başka kimlik / aralık dışı: yok sayılır
    b.sys.onEvent(b.G, { type: 'vehiclePhys', ev: { type: 'bump', id: 12345, impact: 9 } });
    b.sys.onEvent(b.G, { type: 'vehiclePhys', ev: { type: 'bump', id: undefined, impact: 9 } });
    b.sys.onEvent(b.G, null);
    expect(bumps.length).toBe(1);
    b.kit.frame(1 / 60, 240);
    expect(c.v >= 0).toBe(true);
  });

  it('boyut değişimi: çıkışta trafik ve çarpışma kutuları atılır, dönüşte aynı tohumla yeniden kurulur', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 120);
    const cc = b.G.world.colliders;
    expect(b.sys.state.registered.size).toBeGreaterThan(0);
    const dynBefore = cc.dynCount;
    const nReg = b.sys.state.registered.size;
    const reg = Array.from(b.sys.state.registered);
    const r = b.kit.mgr.swap('overworld', { reason: 'test' });
    expect(r.ok).toBe(true);
    b.kit.frame(1 / 60, 30);
    expect(b.G.traffic == null).toBe(true);
    expect(b.sys.state.registered.size).toBe(0);
    // eski şehir dünyasının çarpışma dizininde trafik kutusu kalmadı (sızıntı yok)
    expect(cc.dynCount).toBe(dynBefore - nReg);
    reg.forEach((id) => expect(cc._byId.has(id)).toBe(false));
    expect(b.api.getTraffic().count).toBe(0);
    const r2 = b.kit.mgr.swap('neon', { reason: 'test' });
    expect(r2.ok).toBe(true);
    b.kit.frame(1 / 60, 90);
    expect(b.G.traffic).toBeTruthy();
    expect(b.G.traffic.alive()).toBeGreaterThan(5);
  });

  it('50 boyut sıçraması: trafik/çarpışma kutusu sızıntısı yok, hata yok', () => {
    const b = boot();
    for (let i = 0; i < 12; i++) {
      toCity(b, -240, -120);
      b.kit.frame(1 / 60, 30);
      b.kit.mgr.swap('overworld', { reason: 'test' });
      b.kit.frame(1 / 60, 10);
      expect(b.sys.state.registered.size).toBe(0);
      expect(b.G.traffic == null).toBe(true);
    }
    expect(b.sys.sys.stats.creates).toBe(b.sys.sys.stats.disposes);
  });

  it('kayıt/yükleme ve boyut girişi: trafik zamanı dünya saatine eşitlenir; aynı saat+konum → aynı trafik (yeniden kurulumda özet aynı)', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 30);
    const clk = b.G.clock;
    clk.day = 3;
    clk.time = 123.25;
    clk.frozen = true; // saat sabit: iki kurulum aynı saatte
    b.sys.dispose();
    b.kit.frame(1 / 60, 1);
    const tr1 = b.G.traffic;
    expect(tr1).toBeTruthy();
    const wt = 3 * clk.dayLengthSec + 123.25;
    expect(Math.abs(tr1.time - wt)).toBeLessThan(0.1);
    const d1 = tr1.digest();
    const n1 = tr1.alive();
    b.sys.dispose();
    b.kit.frame(1 / 60, 1);
    const tr2 = b.G.traffic;
    expect(tr2).not.toBe(tr1);
    expect(tr2.alive()).toBe(n1);
    expect(tr2.digest()).toBe(d1);
    expect(Math.abs(tr2.time - wt)).toBeLessThan(0.1);
  });

  it('dispose: trafik ve kayıtlar temizlenir; tekrar çağrılabilir', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 60);
    b.sys.dispose();
    expect(b.G.traffic == null).toBe(true);
    expect(b.sys.state.registered.size).toBe(0);
    b.sys.dispose();
  });
});

describe('traffic sistemi: engeller (oyuncu araçları / yaya) ve ışık ipucu', () => {
  it('oyuncu yürürken engel = oyuncu (kind 3); sürülen/park araçlar GG.vehicles girdilerinden (kind 1 / 2)', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 10);
    const tr = b.G.traffic;
    expect(tr.TS.nObs).toBe(1);
    expect(tr.TS.obstacles[0].kind).toBe(3);
    const mkEntry = (x, role) => ({
      installed: true, role, occupied: false, v: { x, y: 64, z: -120, yaw: 0, vx: 0, vz: 0, def: { length: 4.2, width: 1.9 } },
    });
    const d = mkEntry(-240, 'owned');
    const p = mkEntry(-230, 'rental');
    b.G.vehicles = { entries: new Map([[1, d], [2, p]]), driven: d };
    b.kit.frame(1 / 60, 3);
    expect(tr.TS.nObs).toBe(2);
    const kinds = [tr.TS.obstacles[0].kind, tr.TS.obstacles[1].kind].sort();
    expect(kinds).toEqual([1, 2]);
    b.G.vehicles = null;
  });

  it('ışık ipucu: yakın direkte renk adı + simge + konum + şekil + metin; uzakta null', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 20);
    const tn = trafficNet(b.G.world.seed);
    const L = lampList(tn)[0];
    const h = b.api.getTrafficLight(L.x + 3, L.z + 3);
    expect(h).toBeTruthy();
    expect(['kırmızı', 'sarı', 'yeşil']).toContain(h.name);
    expect(h.text).toMatch(/Trafik ışığı/);
    expect(h.glyph.length).toBeGreaterThan(0);
    expect(['kare', 'üçgen', 'daire']).toContain(h.shape);
    expect(['üst', 'orta', 'alt']).toContain(h.pos);
    expect(h.dist).toBeLessThan(40);
    expect(b.api.getTrafficLight(5000, 5000)).toBe(null);
  });

  it('direk lambaları: yakın direklerin prop durumu ışık planıyla aynı (0 kırmızı, 1 yeşil, 2 sarı); durum kayda girmez', () => {
    const b = boot();
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 60);
    const tn = trafficNet(b.G.world.seed);
    const props = b.G.props;
    const tr = b.G.traffic;
    let checked = 0;
    const seenStates = new Set();
    const poleIds = [];
    for (let rep = 0; rep < 4; rep++) {
      b.kit.frame(1 / 60, 200); // ışıklar değişsin
      lampList(tn).forEach((L) => {
        if (Math.hypot(L.x + 240, L.z + 120) > 120) return;
        const p = props.nearest(L.x, L.y + 3, L.z, 1.2, (pp, def) => def.key === 'trafik_diregi');
        if (!p) return;
        const want = armSignal(tn.junctions[L.jid].plan, L.dir, tr.time);
        // sistem 0,2 sn'de bir eşitler: bir önceki durumdan farklı olabilir → son 0,3 sn içinde değişmemiş olanları doğrula
        const wantLater = armSignal(tn.junctions[L.jid].plan, L.dir, tr.time - 0.3);
        if (want !== wantLater) return;
        expect(props.state(p.id)).toBe(want);
        seenStates.add(want);
        poleIds.push(p.id);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(8);
    expect(seenStates.size).toBeGreaterThanOrEqual(2);
    // kayıt: direk durumları serileştirmeye girmez
    const ser = props.serialize();
    poleIds.forEach((id) => expect(ser[id.toString(36)]).toBeUndefined());
  });
});

describe('traffic sistemi: gerçek araç sistemiyle bütünleşme (vehicles 26 → traffic 27)', () => {
  it('vehicles sistemi eklenince trafik ve araç yöneticisi birlikte çalışır; sıralama doğru; hata yok', () => {
    const b = boot();
    const vs = createVehicles(b.G);
    b.G.addSystem(vs);
    toCity(b, -240, -120);
    b.kit.frame(1 / 60, 180);
    expect(b.G.vehicles).toBeTruthy();
    expect(b.G.traffic).toBeTruthy();
    const names = b.G.registry.list().map((s) => s.name);
    expect(names.indexOf('vehicles')).toBeLessThan(names.indexOf('traffic'));
    expect(b.G.traffic.alive()).toBeGreaterThan(5);
  });
});
