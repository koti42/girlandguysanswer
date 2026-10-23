import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem } from './vehicles.js';
import { setPose } from '../sim/city/vehicle/vehiclePhysics.js';
import { canAct } from './blocksCore.js';
import { findExitSpot } from '../sim/city/vehicle/vehicleExit.js';
import { rentalPrice } from '../sim/city/vehicle/vehicleData.js';
import { makeRng } from '../sim/city/vehicle/vehicleTestKit.js';

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
  const cx0 = Math.floor((px - 90) / 16);
  const cx1 = Math.floor((px + 90) / 16);
  const cz0 = Math.floor((pz - 90) / 16);
  const cz1 = Math.floor((pz + 90) / 16);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) w.ensureChunk(cx, cz);
  b.kit.place(px, 64, pz, 0);
  b.G.worldReady = true;
  b.kit.frame(1 / 60, 40); // props sistemi katmanı kurar, sergi araçları belirir
  return r;
}

function press(b, key) {
  b.G.inputState[key] = true;
  b.kit.frame(1 / 60, 1);
  b.G.inputState[key] = false;
}

function setIn(G, o) {
  G.inputState.moveX = o.moveX || 0;
  G.inputState.moveZ = o.moveZ || 0;
  G.inputState.jump = !!o.jump;
  G.inputState.sprint = !!o.sprint;
  G.inputState.crouch = !!o.crouch;
  G.inputState.vehicle = o.vehicle || null;
}

/** Sürülen aracı (ve oyuncuyu) düz bir yola (x=-240 arter, z=-120) taşır; çevre chunk'ları üretir. */
function onRoad(b) {
  const e = b.G.vehicles.driven;
  const w = b.G.world;
  for (let cx = -18; cx <= -12; cx++) for (let cz = -12; cz <= -3; cz++) w.ensureChunk(cx, cz);
  setPose(e.v, -236.5, 64, -60, 0);
  b.G.vehicles.syncProp(e);
  b.kit.frame(1 / 60, 2);
  return e;
}

function rentNearest(b, cls) {
  const m = b.G.vehicles;
  const d = m.list().find((e) => e.role === 'display' && (!cls || e.v.cls === cls));
  expect(d, 'sergi aracı yok').toBeTruthy();
  const gx = d.v.x + 2.4;
  b.kit.place(gx, 64, d.v.z, Math.PI / 2);
  b.kit.frame(1 / 60, 3);
  press(b, 'interactPressed');
  return d;
}

describe('vehicles sistemi: kurulum ve bağlam', () => {
  it('overworld\'de yönetici yok; şehre geçince kurulur, sergi araçları ve garaj terminali belirir; dimAudit sözleşmesi (onDimension/beforeDimension)', () => {
    const b = boot();
    b.kit.frame(1 / 60, 5);
    expect(b.G.vehicles).toBe(null);
    expect(typeof b.sys.onDimension).toBe('function');
    expect(typeof b.sys.beforeDimension).toBe('function');
    toCity(b, 0.5, 2.5);
    expect(b.G.vehicles).toBeTruthy();
    expect(b.G.vehicles.list().filter((e) => e.role === 'display').length).toBeGreaterThanOrEqual(2);
    expect(b.kit.mgr.get('neon').vehicles).toBe(b.G.vehicles);
    expect(b.G.player.vehicle).toBe(null);
    expect(b.G.hud.vehicle == null).toBe(true);
  });

  it('F ile sergi aracına binince kiralanır: Kredi düşer, araç sürülür, gövde koltuğa sabitlenir, HUD dolar, bloklar sistemi pasifleşir', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    const k0 = b.kit.mgr.get('neon').city && b.kit.mgr.get('neon').city.kredi;
    expect(k0 === undefined || k0 === 100).toBe(true);
    const d = rentNearest(b);
    const price = rentalPrice(d.v.cls);
    expect(b.G.player.vehicle).toBeTruthy();
    const e = b.G.vehicles.driven;
    expect(e.role).toBe('rental');
    expect(b.kit.mgr.get('neon').city.kredi).toBe(100 - price);
    expect(b.G.body.x).toBeCloseTo(e.v.x, 6);
    expect(b.G.body.z).toBeCloseTo(e.v.z, 6);
    expect(canAct(b.G)).toBe(false);
    expect(b.api.getVehicleState().driving).toBe(true);
    // sürüş
    onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 75);
    expect(b.G.hud.vehicle).toBeTruthy();
    expect(b.G.hud.vehicle.cls).toBe(e.v.cls);
    expect(b.G.hud.vehicle.kmh).toBeGreaterThan(20);
    expect(b.G.hud.vehicle.camera).toBe(0);
    expect(b.G.body.z).toBeCloseTo(e.v.z, 6);
    expect(b.G.player.yaw).toBeCloseTo(e.v.yaw, 6);
    expect(b.G.camera.position.distanceTo({ x: e.v.x, y: e.v.y, z: e.v.z, isVector3: true }) >= 0).toBe(true);
    setIn(b.G, {});
  });

  it('inme: hızlıyken reddedilir (ipucu), yavaşlayınca güvenli noktaya iner; araç park halinde kalır, kayıt güncellenir', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    rentNearest(b);
    const e = onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 70);
    expect(Math.hypot(e.v.vx, e.v.vz)).toBeGreaterThan(8);
    setIn(b.G, {});
    press(b, 'interactPressed');
    expect(b.G.player.vehicle).toBeTruthy(); // hızlı: inilemez
    expect(b.kit.hints.some((h) => /yavaşla/.test(h.text))).toBe(true);
    setIn(b.G, { moveZ: -1 });
    for (let i = 0; i < 400 && Math.hypot(e.v.vx, e.v.vz) > 2; i++) b.kit.frame(1 / 60, 1);
    setIn(b.G, {});
    // dur
    for (let i = 0; i < 200 && Math.abs(e.v.u) > 0.4; i++) {
      setIn(b.G, { moveZ: e.v.u > 0 ? -1 : 0 });
      b.kit.frame(1 / 60, 1);
    }
    setIn(b.G, {});
    b.kit.frame(1 / 60, 20);
    press(b, 'interactPressed');
    expect(b.G.player.vehicle).toBe(null);
    expect(b.G.vehicles.driven).toBe(null);
    expect(b.G.hud.vehicle).toBe(null);
    expect(e.occupied).toBe(false);
    // oyuncu aracın dışında, güvenli noktada
    const spot = findExitSpot(b.G.world, e.v, { ignoreId: e.propId });
    expect(spot).toBeTruthy();
    const dx = b.G.body.x - e.v.x;
    const dz = b.G.body.z - e.v.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(1);
    expect(Math.hypot(dx, dz)).toBeLessThan(8);
    expect(canAct(b.G)).toBe(true);
    const city = b.kit.mgr.get('neon').city;
    expect(city.rental && city.rental.cls).toBe(e.v.cls);
    expect(city.vstats.enters).toBe(1);
    expect(city.vstats.km).toBeGreaterThan(0.004); // sürülen mesafe km olarak biriktirilir
    expect(city.vstats.km).toBeLessThan(0.3);
  });

  it('ölüm sürerken: zorunlu iniş (araç park kalır); sürücü ölürse kamera/HUD temizlenir', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    rentNearest(b);
    expect(b.G.player.vehicle).toBeTruthy();
    onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 90);
    setIn(b.G, {});
    b.G.player.dead = true;
    b.kit.frame(1 / 60, 2);
    expect(b.G.player.vehicle).toBe(null);
    expect(b.G.vehicles.driven).toBe(null);
    expect(b.G.hud.vehicle).toBe(null);
    b.G.player.dead = false;
  });

  it('boyut değişimi sürerken: araç iniş zorlanır, araçlar stash\'lanır; döndüğünde kiralık/çağrılmış araçlar yok, sergi yeniden kurulur', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    rentNearest(b);
    onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 40);
    setIn(b.G, {});
    expect(b.G.player.vehicle).toBeTruthy();
    const mgr = b.G.vehicles;
    const r = b.kit.mgr.swap('overworld', { reason: 'terminal' });
    expect(r.ok).toBe(true);
    expect(b.G.player.vehicle).toBe(null);
    expect(b.G.vehicles).toBe(null);
    expect(mgr.stashed).toBe(true);
    expect(mgr.list().length).toBe(0);
    b.kit.frame(1 / 60, 10);
    const r2 = b.kit.mgr.swap('neon', { reason: 'gate' });
    expect(r2.ok).toBe(true);
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) b.G.world.ensureChunk(cx, cz);
    b.kit.place(0.5, 64, 2.5, 0);
    b.kit.frame(1 / 60, 40);
    expect(b.G.vehicles).toBe(mgr);
    expect(mgr.stashed).toBe(false);
    expect(mgr.list().filter((e) => e.role === 'rental').length).toBe(0);
    expect(mgr.list().filter((e) => e.role === 'display').length).toBeGreaterThanOrEqual(2);
    expect(b.kit.mgr.get('neon').city.rental).toBe(null);
  });
});

describe('garaj, çağırma ve kayıt', () => {
  it('garaj terminali kullanımı paneli açar ve başlangıç Süzülkay\'ını verir; çağır / satın al / boya / kamera API\'si', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    const m = b.G.vehicles;
    // propUi olayı (garaj terminali) → G.ui garage
    b.G.emit({ type: 'propUi', ui: 'garage' });
    expect(b.G.ui).toBe('garage');
    expect(m.save.garage.owned.map((o) => o.cls)).toEqual(['suzulkay']);
    b.G.setUi(null);
    const g = b.api.getGarage();
    expect(g.owned.length).toBe(1);
    expect(g.catalog.length).toBe(6);
    expect(g.kredi).toBe(100);
    expect(g.swatches.body.length).toBe(16);
    expect(g.catalog.find((c) => c.cls === 'suzulkay').owned).toBe(true);
    expect(g.catalog.find((c) => c.cls === 'spor').unlocked).toBe(false);
    // çağır
    const r = b.api.summonVehicle();
    expect(r.ok).toBe(true);
    const e = m.get(r.id);
    expect(e.v.cls).toBe('suzulkay');
    expect(b.kit.mgr.get('neon').city.summoned.idx).toBe(0);
    // satın al: yetersiz Kredi, sonra yeterli
    expect(b.api.buyVehicle('taksi')).toMatchObject({ ok: false, reason: 'kredi' });
    b.G.emit({ type: 'kredi', value: 0, delta: 0 });
    b.kit.mgr.get('neon').city.kredi = 700;
    expect(b.api.buyVehicle('taksi')).toMatchObject({ ok: true });
    expect(b.kit.mgr.get('neon').city.kredi).toBe(100);
    expect(b.api.getGarage().owned.length).toBe(2);
    expect(b.api.setGarage({ active: 1 })).toBe(true);
    expect(b.api.setGarage({ paint: { idx: 1, cos: { body: 7, accent: 3 } } })).toBe(true);
    expect(b.api.getGarage().owned[1].cos.body).toBe(7);
    expect(b.api.setGarage({ active: 7 })).toBe(false);
    expect(b.api.setGarage(null)).toBe(false);
    expect(b.api.setVehicleCamera(2)).toBe(2);
    expect(b.api.setVehicleCamera(9)).toBe(0);
    // bin
    b.kit.place(e.v.x + 3, 64, e.v.z, 0);
    b.kit.frame(1 / 60, 2);
    // çağrılmış (aktif değişti: yeni çağır → taksi)
    const r2 = b.api.summonVehicle();
    expect(r2.ok).toBe(true);
    const t = m.get(r2.id);
    expect(t.v.cls).toBe('taksi');
    expect(t.v.cosmetics.body).toBe(7);
    b.kit.place(t.v.x + 2.6, 64, t.v.z, 0);
    b.kit.frame(1 / 60, 2);
    expect(b.api.enterVehicle()).toBe(true);
    expect(b.G.player.vehicle).toBe(t.id);
    expect(b.api.summonVehicle()).toMatchObject({ ok: false, reason: 'surulen' });
    expect(b.api.exitVehicle()).toBe(true);
  });

  it('kaydet → yükle: garaj/çağrılmış araç/kiralık/km dims.neon.city\'den geri gelir; kredi ve diğer şehir alanları dokunulmaz', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    b.api.getGarage();
    b.G.emit({ type: 'propUi', ui: 'garage' });
    b.G.setUi(null);
    expect(b.api.summonVehicle().ok).toBe(true);
    const city = b.kit.mgr.get('neon').city;
    city.flags = { merhaba: 1 };
    rentNearest(b);
    onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 90);
    setIn(b.G, {});
    for (let i = 0; i < 300 && Math.abs(b.G.vehicles.driven.v.u) > 0.4; i++) {
      setIn(b.G, { moveZ: b.G.vehicles.driven.v.u > 0 ? -1 : 0 });
      b.kit.frame(1 / 60, 1);
    }
    setIn(b.G, {});
    b.kit.frame(1 / 60, 15);
    press(b, 'interactPressed');
    expect(b.G.player.vehicle).toBe(null);
    b.kit.frame(1 / 60, 70); // 1 sn'lik kayıt
    const parts = b.kit.mgr.saveParts();
    const blob = JSON.parse(JSON.stringify(parts.dims.neon));
    expect(blob.city.garage.owned[0].cls).toBe('suzulkay');
    expect(blob.city.summoned.idx).toBe(0);
    expect(blob.city.rental.cls).toBeTruthy();
    expect(blob.city.flags).toEqual({ merhaba: 1 });
    expect(blob.city.kredi).toBeLessThan(100);
    // yeni oyun bağlamı: blob'u yükle
    const b2 = boot();
    b2.kit.mgr.restoreMeta(parts.dimMeta, { neon: blob });
    const r = b2.kit.mgr.swap('neon', { reason: 'restore', silent: true });
    expect(r.ok).toBe(true);
    const sx = blob.city.summoned.x;
    const sz = blob.city.summoned.z;
    [[sx, sz], [blob.city.rental.x, blob.city.rental.z]].forEach(([qx, qz]) => {
      for (let cx = Math.floor(qx / 16) - 5; cx <= Math.floor(qx / 16) + 5; cx++) for (let cz = Math.floor(qz / 16) - 5; cz <= Math.floor(qz / 16) + 5; cz++) b2.G.world.ensureChunk(cx, cz);
    });
    b2.kit.place(sx + 6, 64, sz, 0);
    b2.kit.frame(1 / 60, 40);
    const m2 = b2.G.vehicles;
    expect(m2.list().filter((e) => e.role === 'owned').length).toBe(1);
    expect(m2.list().filter((e) => e.role === 'rental').length).toBe(1);
    expect(m2.save.garage.owned[0].cls).toBe('suzulkay');
    expect(b2.kit.mgr.get('neon').city.kredi).toBe(blob.city.kredi);
    expect(b2.kit.mgr.get('neon').city.flags).toEqual({ merhaba: 1 });
  });
});

describe('Stil ve onarım', () => {
  it('Süzülkay havada çift zıplayıp dönünce Stil Kredisi verir (≤ 5), dakikada en çok 30; onarım API', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    b.G.emit({ type: 'propUi', ui: 'garage' });
    b.G.setUi(null);
    const r = b.api.summonVehicle();
    expect(r.ok).toBe(true);
    const e = b.G.vehicles.get(r.id);
    b.kit.place(e.v.x + 1.6, 64, e.v.z, 0);
    b.kit.frame(1 / 60, 2);
    expect(b.api.enterVehicle()).toBe(true);
    b.api.getGarage(); // cüzdanı başlatır (100 Kredi)
    const city = b.kit.mgr.get('neon').city;
    const k0 = city.kredi;
    let total = 0;
    for (let round = 0; round < 12; round++) {
      // iki zıplama + tam direksiyon (havada dönüş)
      for (let i = 0; i < 90; i++) {
        b.G.inputState.vehicle = { steer: 1, throttle: 0.4, hop: i === 0 || i === 30, steerDirect: true };
        b.kit.frame(1 / 60, 1);
      }
      b.G.inputState.vehicle = null;
      b.kit.frame(1 / 60, 40);
      total = city.kredi - k0;
    }
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(30);
    b.G.vehicles.driven.v.dmg = 0.7;
    expect(b.api.setGarage({ repair: true })).toBe(true);
    expect(b.G.vehicles.driven.v.dmg).toBe(0);
  });
});

describe('dayanıklılık', () => {
  it('bozuk sürüş girdisi (NaN/Infinity/tür hatalı vehicle nesnesi) sistemi bozmaz; 300 bin-in döngüsü sızıntı bırakmaz', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    rentNearest(b);
    expect(b.G.player.vehicle).toBeTruthy();
    const rng = makeRng(8);
    const junk = [NaN, Infinity, -Infinity, 'x', null, undefined, {}, [], 1e300, true];
    const pick = () => junk[Math.floor(rng() * junk.length)];
    for (let i = 0; i < 600; i++) {
      b.G.inputState.vehicle = rng() < 0.2 ? pick() : {
        steer: pick(), throttle: rng() < 0.5 ? rng() : pick(), brake: pick(), handbrake: pick(), nitro: pick(), cameraPressed: rng() < 0.1, hornPressed: rng() < 0.1, hop: pick(), steerDirect: pick(),
      };
      b.G.inputState.moveX = pick();
      b.G.inputState.moveZ = pick();
      b.kit.frame(1 / 60, 1);
      const v = b.G.vehicles.driven ? b.G.vehicles.driven.v : null;
      if (v) expect(Number.isFinite(v.x + v.y + v.z + v.vx + v.vz + v.yaw)).toBe(true);
      expect(Number.isFinite(b.G.body.x + b.G.body.y + b.G.body.z)).toBe(true);
    }
    b.G.inputState.vehicle = null;
    b.G.inputState.moveX = 0;
    b.G.inputState.moveZ = 0;
    const m = b.G.vehicles;
    const size0 = b.G.props.size;
    for (let i = 0; i < 300; i++) {
      if (m.driven) {
        m.driven.v.vx = 0; m.driven.v.vz = 0; m.driven.v.u = 0; m.driven.v.w = 0;
        b.kit.frame(1 / 60, 16);
        press(b, 'interactPressed');
      } else {
        const near = m.nearest(b.G.body.x, b.G.body.y, b.G.body.z, 6);
        if (near) b.kit.place(near.v.x + 2.6, 64, near.v.z, 0);
        b.kit.frame(1 / 60, 16);
        press(b, 'interactPressed');
      }
    }
    expect(b.G.props.size).toBeLessThanOrEqual(size0 + 4);
    expect(m.list().length).toBeLessThan(12);
  });

  it('dispose: yönetici ve alanlar temizlenir; getVehicleState sürmüyorken güvenli', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    expect(b.api.getVehicleState()).toMatchObject({ driving: false, cls: null });
    b.sys.dispose();
    expect(b.G.vehicles).toBe(null);
    expect(b.G.player.vehicle).toBe(null);
  });
});

describe('kayıt ve boyut stresi', () => {
  it('sürerken kaydet → yükle: oyuncu araçla iç içe açılmaz (güvenli noktaya taşınır), araç kayıtlı yerde park halinde', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    rentNearest(b);
    onRoad(b);
    setIn(b.G, { moveZ: 1 });
    b.kit.frame(1 / 60, 90);
    setIn(b.G, {});
    b.kit.frame(1 / 60, 70); // kayıt süresi (1 sn)
    expect(b.G.player.vehicle).toBeTruthy();
    const parts = b.kit.mgr.saveParts();
    const blob = JSON.parse(JSON.stringify(parts.dims.neon));
    const px = b.G.body.x;
    const pz = b.G.body.z;
    const b2 = boot();
    b2.kit.mgr.restoreMeta(parts.dimMeta, { neon: blob });
    expect(b2.kit.mgr.swap('neon', { reason: 'restore', silent: true, arrival: { x: px, y: 64, z: pz, yaw: 0 } }).ok).toBe(true);
    for (let cx = Math.floor(px / 16) - 5; cx <= Math.floor(px / 16) + 5; cx++) for (let cz = Math.floor(pz / 16) - 5; cz <= Math.floor(pz / 16) + 5; cz++) b2.G.world.ensureChunk(cx, cz);
    b2.kit.place(px, 64, pz, 0); // oyuncu kayıtta aracın koltuğundaydı
    b2.kit.frame(1 / 60, 30);
    const rental = b2.G.vehicles.list().find((e) => e.role === 'rental');
    expect(rental).toBeTruthy();
    expect(b2.G.player.vehicle).toBe(null);
    expect(b2.G.vehicles.nearest(b2.G.body.x, b2.G.body.y + 0.9, b2.G.body.z, 0.05)).toBe(null); // araç gövdesinin içinde değil
    expect(Math.hypot(b2.G.body.x - rental.v.x, b2.G.body.z - rental.v.z)).toBeGreaterThan(1);
  });

  it('40 boyut geçişi (bazıları sürerken, bazıları kiralıkla): bayat dünya erişimi YOK (retire tripwire fırlatır), prop sayısı sabit, yönetici tek', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    const mgr = b.G.vehicles;
    const dynCount = () => { let n = 0; b.G.props.forEachDynamic(() => { n++; }); return n; };
    const dyn0 = dynCount();
    for (let i = 0; i < 40; i++) {
      if (i % 2 === 0) {
        rentNearest(b);
        if (b.G.player.vehicle) {
          onRoad(b);
          setIn(b.G, { moveZ: 1 });
          b.kit.frame(1 / 60, 20);
          setIn(b.G, {});
        }
      }
      expect(b.kit.mgr.swap('overworld', { reason: 'terminal' }).ok).toBe(true);
      expect(b.G.player.vehicle).toBe(null);
      expect(b.G.vehicles).toBe(null);
      b.kit.frame(1 / 60, 6);
      expect(b.kit.mgr.swap('neon', { reason: 'gate' }).ok).toBe(true);
      for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) b.G.world.ensureChunk(cx, cz);
      b.kit.place(0.5, 64, 2.5, 0);
      b.kit.frame(1 / 60, 40);
      expect(b.G.vehicles).toBe(mgr);
    }
    expect(b.kit.mgr.stats.staleWorldHits).toBe(0);
    expect(dynCount()).toBeLessThanOrEqual(dyn0 + 2); // dinamik prop (araç + garaj terminali) sızıntısı yok
    expect(mgr.list().filter((e) => e.role === 'rental').length).toBe(0);
    expect(mgr.list().filter((e) => e.role === 'display').length).toBeGreaterThanOrEqual(2);
  });
});
