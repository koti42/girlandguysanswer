import { describe, expect, it } from 'vitest';
import { cpuMs, scaled } from '../../../test/perfScale.js';
import {
  VEHICLE_AUDIO_ORDER, clockSeconds, createRadioClock, createSystem, duckFor, fillTrafficFeed,
} from './vehicleAudio.js';
import { CITY_HUD_ORDER } from './cityHud.js';
import { DIMENSION_ORDER } from './dimension.js';
import { VEHICLES_ORDER } from './vehicles.js';
import { CITY_LOCKS_ORDER } from './cityLocks.js';
import { CITY_LOOK_SYSTEM_ORDER } from '../render/city/cityLook.js';
import { advance, liveSources, makeLoop, makeVehicle } from '../audioLoopTestKit.js';
import { STATIONS } from '../audioRadio.js';

function makeG(over) {
  const loop = makeLoop();
  const events = [];
  const speaks = [];
  const G = {
    dim: 'neon',
    world: { seed: 4242 },
    eye: { x: 0, y: 65, z: 0 },
    look: { x: 0, y: 0, z: -1 },
    body: { x: 0, y: 64, z: 0 },
    hud: { city: { radio: '' } },
    clock: { day: 0, time: 480, dayLengthSec: 600 },
    quality: { settings: 'high' },
    settings: {},
    paused: false,
    transitionActive: false,
    vehicles: { driven: null },
    cityLook: { state: { wet: 0, shelter: 0 } },
    traffic: null,
    audio: { getLoopContext: () => loop, setVolumes() { G.audio.vol = arguments[0]; G.audio.volCalls++; }, volCalls: 0 },
    emit: (e) => events.push(e),
    speak: (t) => speaks.push(t),
    ...over,
  };
  return {
    G, loop, events, speaks, ctx: loop.ctx,
  };
}

function drive(r, secs, dt) {
  const h = dt || 1 / 30;
  for (let i = 0; i < secs / h; i++) {
    r.sys.frameUpdate(r.G, h);
    r.G.clock.time += h;
    advance(r.ctx, h, h);
  }
}

function setup(over, cls) {
  const r = makeG(over);
  r.sys = createSystem(r.G);
  if (cls) r.G.vehicles = { driven: { id: 1, v: makeVehicle(cls) } };
  return r;
}

describe('kayıt', () => {
  it('ad, sıra 37 ve benzersiz; onDimension zorunlu kancası; gameSystems listesinde', async () => {
    const { G } = makeG();
    const sys = createSystem(G);
    expect(sys.name).toBe('vehicleAudio');
    expect(sys.order).toBe(37);
    expect(VEHICLE_AUDIO_ORDER).toBe(37);
    const used = [DIMENSION_ORDER, CITY_LOOK_SYSTEM_ORDER, -110, 28, 20, 22, 23, 25, 30, 40, 10, 90, -60, CITY_HUD_ORDER, CITY_LOCKS_ORDER, VEHICLES_ORDER, 27];
    expect(used).not.toContain(37);
    expect(VEHICLES_ORDER).toBeLessThan(37);
    expect(CITY_HUD_ORDER).toBeGreaterThan(37);
    expect(typeof sys.onDimension).toBe('function');
    const { standardSystemFiles } = await import('../gameSystems.js');
    expect(standardSystemFiles()).toContain('./systems/vehicleAudio.js');
  });
});

describe('yardımcılar', () => {
  it('clockSeconds: gün·uzunluk + zaman; bozuk giriş güvenli', () => {
    expect(clockSeconds({ day: 2, time: 30, dayLengthSec: 600 })).toBe(1230);
    expect(clockSeconds(null)).toBe(0);
    expect(clockSeconds({ day: NaN, time: 5 })).toBe(5);
    expect(clockSeconds({ day: 1, time: 5, dayLengthSec: -3 })).toBe(605);
  });

  it('radyo saati: saate hizalanır, dt ile ilerler, donmuş saatte akar, sıçramada yeniden hizalanır', () => {
    const c = createRadioClock();
    expect(c.update(0.016, 1000)).toBe(1000);
    expect(c.update(0.016, 1000.016)).toBeCloseTo(1000.016, 9);
    // donmuş dünya saati: radyo ilerlemeye devam eder
    let t = 0;
    for (let i = 0; i < 100; i++) t = c.update(0.1, 1000.016);
    expect(t).toBeGreaterThan(1009);
    // duraklatma (dt=0, saat sabit): sıçrama sayılmaz
    const before = c.t;
    c.update(0, 1000.016);
    expect(c.t).toBe(before);
    // yatakta uyuma: saat 200 sn sıçradı
    expect(c.update(0.016, 1300)).toBe(1300);
    c.reset();
    expect(c.update(0.016, 50)).toBe(50);
    expect(Number.isFinite(c.update(NaN, NaN))).toBe(true);
  });

  it('duckFor: açık havada 1, sığınakta düşer, bina/oda en çok 0.5', () => {
    expect(duckFor(0, false)).toBe(1);
    expect(duckFor(1, false)).toBeCloseTo(0.25, 9);
    expect(duckFor(0, true)).toBe(0.5);
    expect(duckFor(0.8, true)).toBeCloseTo(0.4, 9);
    expect(duckFor(NaN, false)).toBe(1);
    expect(duckFor(9, false)).toBeCloseTo(0.25, 9);
  });

  it('fillTrafficFeed: SoA → liste; hız vektörü yaw kuralına göre (0 = −Z); şeffaf araçlar atlanır', () => {
    const feed = [];
    for (let i = 0; i < 8; i++) feed.push({ id: 0, x: 0, z: 0, vx: 0, vz: 0 });
    const view = {
      count: 3,
      x: [1, 2, 3],
      z: [4, 5, 6],
      yaw: [0, Math.PI / 2, 0],
      speed: [10, 10, 10],
      id: [7, 8, 9],
      fade: [1, 1, 0.1],
    };
    expect(fillTrafficFeed(view, feed)).toBe(2);
    expect(feed[0].id).toBe(7);
    expect(feed[0].vx).toBeCloseTo(0, 9);
    expect(feed[0].vz).toBeCloseTo(-10, 9);
    expect(feed[1].vx).toBeCloseTo(-10, 9);
    expect(feed[1].vz).toBeCloseTo(0, 6);
    expect(fillTrafficFeed(null, feed)).toBe(0);
    expect(fillTrafficFeed({ count: 0 }, feed)).toBe(0);
    expect(fillTrafficFeed({ count: 100, x: new Array(100).fill(0), z: new Array(100).fill(0) }, feed)).toBe(8);
  });
});

describe('akış', () => {
  it('şehir dışında hiçbir şey çalmaz ve araç sesi kurulmaz', () => {
    const r = setup({ dim: 'overworld' }, 'spor');
    drive(r, 2);
    expect(liveSources(r.ctx)).toBe(0);
    expect(r.G.hud.city.radio).toBe('');
  });

  it('şehirde yaya iken: motor yok, radyo yok; trafik sesi var', () => {
    const r = setup({}, null);
    r.G.traffic = { view: { count: 3, x: [10, 20, -30], z: [5, 5, 5], yaw: [0, 1, 2], speed: [8, 8, 8], id: [1, 2, 3], fade: [1, 1, 1] } };
    drive(r, 2);
    const s = r.sys.api().getVehicleAudioStats();
    expect(s.vehicle.player).toBe(false);
    expect(s.radio.playing).toBe(false);
    expect(s.vehicle.trafficVoices).toBe(3);
    expect(r.G.hud.city.radio).toBe('');
  });

  it('araçtayken: motor + radyo çalar, HUD radyo adı, ambiyans müziği tutulur; inince söner', () => {
    const r = setup({}, 'spor');
    drive(r, 8);
    const s = r.sys.api().getVehicleAudioStats();
    expect(s.vehicle.player).toBe(true);
    expect(s.radio.playing).toBe(true);
    expect(s.radio.notes).toBeGreaterThan(5);
    expect(r.G.hud.city.radio).toBe('Neon FM 88.8');
    expect(r.loop.held).toBe(true);
    r.G.vehicles = { driven: null };
    drive(r, 3);
    const s2 = r.sys.api().getVehicleAudioStats();
    expect(s2.vehicle.player).toBe(false);
    expect(s2.radio.sources).toBe(0);
    expect(r.G.hud.city.radio).toBe('');
    expect(r.loop.held).toBe(false);
  });

  it('olaylar: çarpma/korna/iniş sesi, radyo istasyon değişimi (olay + konuşma + HUD)', () => {
    const r = setup({}, 'taksi');
    drive(r, 2);
    const before = r.sys.api().getVehicleAudioStats().vehicle.shots;
    r.sys.onEvent(r.G, { type: 'vehiclePhys', ev: { type: 'bump', impact: 12, soft: false } });
    r.sys.onEvent(r.G, { type: 'vehiclePhys', ev: { type: 'land', impact: 9 } });
    r.sys.onEvent(r.G, { type: 'vehicleHorn' });
    r.sys.onEvent(r.G, { type: 'vehiclePhys', ev: { type: 'driftBoost', gain: 25 } }); // yok sayılır
    r.sys.onEvent(r.G, { type: 'trafficHonk', id: 4, x: 10, z: 3 });
    r.sys.onEvent(r.G, { type: 'bilinmeyen' });
    r.sys.onEvent(r.G, null);
    expect(r.sys.api().getVehicleAudioStats().vehicle.shots).toBe(before + 4);
    r.sys.onEvent(r.G, { type: 'radioNext' });
    expect(r.G.radio.station.id).toBe('gece_taksisi');
    expect(r.events.some((e) => e.type === 'radioStation' && e.station === 'gece_taksisi')).toBe(true);
    expect(r.speaks[r.speaks.length - 1]).toBe('Radyo: Gece Taksisi');
    r.sys.onAction(r.G, { type: 'radio' });
    expect(r.G.radio.station.id).toBe('hiz_hatti');
    r.sys.onAction(r.G, { type: 'radioPrev' });
    r.sys.onAction(r.G, { type: 'radioSet', index: 3 });
    expect(r.G.radio.station.id).toBe('pazar_sokagi');
    r.sys.onEvent(r.G, { type: 'radioSet', station: 'sessiz' });
    expect(r.G.radio.station.silent).toBe(true);
    expect(r.speaks[r.speaks.length - 1]).toBe('Radyo kapalı');
    drive(r, 3);
    expect(r.G.hud.city.radio).toBe('Sessiz');
    expect(r.sys.api().getVehicleAudioStats().radio.sources).toBe(0);
    expect(r.sys.api().selectRadioStation(2)).toBe('hiz_hatti');
    expect(r.sys.api().nextRadioStation()).toBe('pazar_sokagi');
    expect(r.sys.api().prevRadioStation()).toBe('hiz_hatti');
    expect(r.sys.api().getVehicleRadio().name).toBe('Hız Hattı');
  });

  it('araç kozmetiğindeki radyo yalnız oyuncu henüz seçmediyse uygulanır', () => {
    const r = setup({}, 'taksi');
    r.G.vehicles.driven.v.cosmetics = { radio: 3, horn: 2 };
    r.sys.onEvent(r.G, { type: 'vehicleEnter' });
    expect(r.G.radio.station.id).toBe('pazar_sokagi');
    r.sys.onEvent(r.G, { type: 'radioNext' });
    r.G.vehicles.driven.v.cosmetics.radio = 0;
    r.sys.onEvent(r.G, { type: 'vehicleEnter' });
    expect(r.G.radio.station.id).toBe('yildiz_ambient'); // oyuncunun seçimi korunur
    expect(STATIONS.length).toBe(6);
  });

  it('sığınak: radyo kısılır; açık havada geri döner', () => {
    const r = setup({}, 'taksi');
    drive(r, 3);
    r.G.cityLook.state.shelter = 1;
    drive(r, 2);
    expect(r.sys.api().getVehicleAudioStats().radio.duck).toBeCloseTo(0.25, 6);
    r.G.cityLook.state.shelter = 0;
    drive(r, 2);
    expect(r.sys.api().getVehicleAudioStats().radio.duck).toBeGreaterThan(0.45);
  });

  it('duraklatma: radyo yeni nota planlamaz; geçiş sürerken susar', () => {
    const r = setup({}, 'taksi');
    drive(r, 4);
    const n = r.sys.api().getVehicleAudioStats().radio.notes;
    r.G.paused = true;
    drive(r, 2);
    expect(r.sys.api().getVehicleAudioStats().radio.notes).toBe(n);
    r.G.paused = false;
    drive(r, 2);
    expect(r.sys.api().getVehicleAudioStats().radio.notes).toBeGreaterThan(n);
    r.G.transitionActive = true;
    drive(r, 2);
    expect(r.sys.api().getVehicleAudioStats().radio.sources).toBe(0);
  });

  it('kalite kademesi düğüm tavanını belirler (24/18/12); lowPower ≤ 12', () => {
    const r = setup({}, 'spor');
    drive(r, 1);
    expect(r.sys.api().getVehicleAudioStats().cap).toBe(24);
    r.G.quality.settings = 'medium';
    drive(r, 1);
    expect(r.sys.api().getVehicleAudioStats().cap).toBe(18);
    expect(r.sys.api().getVehicleAudioStats().vehicle.cap).toBe(18);
    expect(r.sys.api().getVehicleAudioStats().radio.cap).toBe(12);
    r.G.quality.settings = 'low';
    drive(r, 3);
    expect(r.sys.api().getVehicleAudioStats().cap).toBe(12);
    expect(r.sys.api().getVehicleAudioStats().radio.cap).toBe(8);
    r.G.quality.settings = 'high';
    r.loop.lowPower = true;
    drive(r, 1);
    expect(r.sys.api().getVehicleAudioStats().cap).toBe(12);
  });

  it('ses/müzik sürgüleri ayarlardan audio.setVolumes’a iletilir (yalnız değişince)', () => {
    const r = setup({}, null);
    drive(r, 1);
    expect(r.G.audio.volCalls).toBe(0);
    r.G.settings.musicVolume = 0.4;
    r.G.settings.sfxVolume = 0.7;
    drive(r, 1);
    expect(r.G.audio.vol).toEqual({ sfx: 0.7, music: 0.4 });
    const n = r.G.audio.volCalls;
    drive(r, 1);
    expect(r.G.audio.volCalls).toBe(n);
    r.G.settings.musicVolume = 9;
    r.G.settings.masterVolume = NaN;
    drive(r, 1);
    expect(r.G.audio.vol).toEqual({ sfx: 0.7, music: 1 });
  });

  it('boyut değişimi: her şey bırakılır, HUD radyo temizlenir', () => {
    const r = setup({}, 'taksi');
    drive(r, 4);
    expect(liveSources(r.ctx)).toBeGreaterThan(0);
    r.G.dim = 'overworld';
    r.sys.onDimension(r.G);
    expect(liveSources(r.ctx)).toBe(0);
    expect(r.G.hud.city.radio).toBe('');
    drive(r, 1);
    expect(liveSources(r.ctx)).toBe(0);
  });

  it('gizli sekme/sessiz (running=false) → sistem her şeyi bırakır, dönünce sürer', () => {
    const r = setup({}, 'spor');
    drive(r, 4);
    r.loop.running = false;
    drive(r, 2);
    expect(liveSources(r.ctx)).toBe(0);
    r.loop.running = true;
    drive(r, 3);
    const s = r.sys.api().getVehicleAudioStats();
    expect(s.vehicle.player).toBe(true);
    expect(s.radio.playing).toBe(true);
  });

  it('dispose sızıntı bırakmaz; G.radio temizlenir', () => {
    const r = setup({}, 'spor');
    drive(r, 4);
    r.sys.dispose();
    expect(liveSources(r.ctx)).toBe(0);
    expect(r.G.radio).toBeNull();
  });

  it('kare maliyeti: 20 000 kare (araçta, 30 araç) < 600 ms', () => {
    const r = setup({}, 'spor');
    r.G.traffic = {
      view: {
        count: 30, x: new Array(30).fill(0).map((_, i) => i * 3), z: new Array(30).fill(4), yaw: new Array(30).fill(0.3), speed: new Array(30).fill(9), id: new Array(30).fill(0).map((_, i) => i), fade: new Array(30).fill(1),
      },
    };
    const t0 = cpuMs();
    for (let i = 0; i < 20000; i++) {
      r.sys.frameUpdate(r.G, 1 / 60);
      if (i % 60 === 0) advance(r.ctx, 1 / 60, 1 / 60);
    }
    expect(cpuMs() - t0).toBeLessThan(scaled(600));
  });
});
