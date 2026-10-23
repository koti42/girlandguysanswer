import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MARK_TEXT, createPhotoFx, drawFrame } from './photoFx.js';
import { defaultPhotoSettings, sanitizePhotoPatch } from '../../sim/city/map/photoMath.js';
import { clockPhase } from '../../sim/daynight.js';

function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === 'calls') return calls;
      return (...a) => { calls.push([String(k)].concat(a)); };
    },
    set(_t, k, v) { calls.push(['set:' + String(k), v]); return true; },
  });
  return ctx;
}

function fakeG() {
  const camera = new THREE.PerspectiveCamera(70, 1.7, 0.06, 1600);
  const G = {
    dim: 'neon',
    camera,
    clock: { time: 1000, dayLengthSec: 600, origin: 0.1, day: 3 },
    weatherSim: { intensity: 0.2, renderKind: 'rain', kind: 'rain', storm: 0.1, cloudCover: 0.3, wind: { x: 1, z: 0 }, cycle: { index: 2 } },
    postfx: {
      tuned: [], photo: [], grades: [],
      tune(t) { this.tuned.push(t); },
      setPhoto(p) { this.photo.push(p); },
      setGrade(g) { this.grades.push(g); },
    },
    character: { root: { visible: false } },
    viewModel: { vis: null, setVisible(v) { this.vis = v; } },
    reducedMotion: false,
  };
  return G;
}

describe('photoFx: görsel denetleyici', () => {
  it('açılışta afterRender kancası kurulur; kapanışta eski kanca geri gelir', () => {
    const G = fakeG();
    const prev = vi.fn();
    G.afterRender = prev;
    const fx = createPhotoFx(G);
    expect(fx.active).toBe(false);
    fx.begin();
    expect(fx.active).toBe(true);
    expect(G.afterRender).not.toBe(prev);
    G.afterRender(0.016);
    expect(prev).toHaveBeenCalledTimes(1); // zincirlenir
    fx.end();
    expect(fx.active).toBe(false);
    expect(G.afterRender).toBe(prev);
    fx.end(); // idempotent
    expect(G.afterRender).toBe(prev);
  });

  it('saat/hava ön ayarı yalnız kare boyunca: apply uygular, afterRender asıl değerleri BİREBİR geri verir', () => {
    const G = fakeG();
    const weather = G.weatherSim;
    const t0 = G.clock.time;
    const fx = createPhotoFx(G);
    fx.begin();
    const s = sanitizePhotoPatch(defaultPhotoSettings(), { time: 'ogle', rain: 'kuru' });
    for (let i = 0; i < 20; i++) {
      fx.apply(s, { x: 1, y: 2, z: 3, yaw: 0.5, pitch: -0.1 }, {});
      expect(clockPhase(G.clock)).toBeCloseTo(0.25, 9);
      expect(G.weatherSim.intensity).toBe(0);
      expect(G.weatherSim.renderKind).toBe('clear');
      expect(G.weatherSim.wind).toBe(weather.wind); // alanlar kopyalanır
      G.afterRender(0.016);
      expect(G.clock.time).toBe(t0);
      expect(G.weatherSim).toBe(weather);
      expect(weather.intensity).toBe(0.2); // gerçek nesne ASLA değişmez
    }
    expect(fx.stats.frames).toBe(20);
    fx.apply(sanitizePhotoPatch(s, { rain: 'yagmurlu' }), { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, {});
    expect(G.weatherSim.intensity).toBeGreaterThan(0.5);
    expect(G.weatherSim.renderKind).toBe('rain');
    expect(G.weatherSim.storm).toBeGreaterThan(0.3);
    // gerçek saate dönünce geçersiz kılma kalkar (aynı karede)
    fx.apply(sanitizePhotoPatch(s, { time: 'gercek', rain: 'gercek' }), { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, {});
    expect(G.clock.time).toBe(t0);
    expect(G.weatherSim).toBe(weather);
    fx.end();
  });

  it('kapanış bekleyen geçersiz kılmayı da geri alır; postfx foto kapanır, derecelendirme şehre sıfırlanır', () => {
    const G = fakeG();
    const weather = G.weatherSim;
    const t0 = G.clock.time;
    const fx = createPhotoFx(G);
    fx.begin();
    fx.apply(sanitizePhotoPatch(defaultPhotoSettings(), { time: 'gece', rain: 'yagmurlu', filter: 'neon', grain: 0.2 }), { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, {});
    expect(G.postfx.photo[0]).toMatchObject({ filter: 1, grain: 0.2 });
    fx.end(); // afterRender hiç çalışmadan kapanış
    expect(G.clock.time).toBe(t0);
    expect(G.weatherSim).toBe(weather);
    expect(G.postfx.photo[G.postfx.photo.length - 1]).toBeNull();
    expect(G.postfx.grades[G.postfx.grades.length - 1]).toBe('neon');
    G.dim = 'overworld';
    const fx2 = createPhotoFx(G);
    fx2.begin();
    fx2.end();
    expect(G.postfx.grades[G.postfx.grades.length - 1]).toBe('overworld');
  });

  it('kamera: konum/yön/FOV yazılır; oyuncu görünür, araçtayken ya da gizliyken değil; elde eşya gizli; kısıtlı harekette gren tohumu 0', () => {
    const G = fakeG();
    const fx = createPhotoFx(G);
    fx.begin();
    const s = sanitizePhotoPatch(defaultPhotoSettings(), { fov: 35 });
    fx.apply(s, { x: 4, y: 70, z: -8, yaw: 1.2, pitch: -0.3 }, {});
    expect(G.camera.position.toArray()).toEqual([4, 70, -8]);
    expect(G.camera.rotation.y).toBeCloseTo(1.2, 9);
    expect(G.camera.rotation.x).toBeCloseTo(-0.3, 9);
    expect(G.camera.rotation.z).toBe(0);
    expect(G.camera.fov).toBe(35);
    expect(G.character.root.visible).toBe(true);
    expect(G.viewModel.vis).toBe(false);
    fx.apply(s, { x: 4, y: 70, z: -8, yaw: 1.2, pitch: -0.3 }, { hideSelf: true });
    expect(G.character.root.visible).toBe(false);
    fx.apply(s, { x: 4, y: 70, z: -8, yaw: 1.2, pitch: -0.3 }, { driving: true });
    expect(G.character.root.visible).toBe(false);
    expect(G.postfx.photo[0].seed).toBeGreaterThan(0);
    G.reducedMotion = true;
    fx.apply(s, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, {});
    expect(G.postfx.photo[G.postfx.photo.length - 1].seed).toBe(0);
    fx.end();
  });

  it('kapalıyken apply hiçbir şeye dokunmaz; eksik postfx/clock/camera ile çökmez', () => {
    const G = fakeG();
    const fx = createPhotoFx(G);
    fx.apply(defaultPhotoSettings(), { x: 9, y: 9, z: 9, yaw: 0, pitch: 0 }, {});
    expect(G.camera.position.x).toBe(0);
    expect(G.postfx.photo.length).toBe(0);
    const bare = createPhotoFx({ dim: 'neon' });
    bare.begin();
    expect(() => bare.apply(sanitizePhotoPatch(defaultPhotoSettings(), { time: 'gece', rain: 'yagmurlu' }), { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, {})).not.toThrow();
    bare.end();
  });
});

describe('photoFx: drawFrame', () => {
  it('çerçevesiz: yalnız imza; imza kapalı: hiçbir şey; bozuk boyut/bağlam sessiz', () => {
    const c = recorder();
    drawFrame(c, 800, 450, 'yok', { mark: true });
    expect(c.calls.filter((x) => x[0] === 'fillText').map((x) => x[1])).toEqual([MARK_TEXT]);
    expect(c.calls.filter((x) => x[0] === 'fillRect' || x[0] === 'strokeRect').length).toBe(0);
    const c2 = recorder();
    drawFrame(c2, 800, 450, 'yok', { mark: false });
    expect(c2.calls.filter((x) => x[0] === 'fillText').length).toBe(0);
    expect(() => drawFrame(null, 800, 450, 'ince')).not.toThrow();
    expect(() => drawFrame(recorder(), 0, 450, 'ince')).not.toThrow();
    expect(() => drawFrame(recorder(), NaN, NaN, 'neon')).not.toThrow();
  });

  it('her çerçeve kendi şeklini çizer: ince = kalın çizgi, anlık = 4 dolu şerit (alt şeritte imza ortada), sinema = 2 bant, neon = parlak çizgi + köşe işaretleri', () => {
    const ince = recorder();
    drawFrame(ince, 800, 450, 'ince');
    expect(ince.calls.some((x) => x[0] === 'strokeRect')).toBe(true);
    const anlik = recorder();
    drawFrame(anlik, 800, 450, 'anlik', { mark: true });
    expect(anlik.calls.filter((x) => x[0] === 'fillRect').length).toBe(4);
    const textAlign = anlik.calls.filter((x) => x[0] === 'set:textAlign').map((x) => x[1]);
    expect(textAlign).toContain('center');
    const sinema = recorder();
    drawFrame(sinema, 1280, 720, 'sinema', { mark: false });
    const bars = sinema.calls.filter((x) => x[0] === 'fillRect');
    expect(bars.length).toBe(2);
    expect(bars[0][2]).toBe(0);
    expect(bars[1][2]).toBeGreaterThan(300);
    const neon = recorder();
    drawFrame(neon, 800, 450, 'neon', { mark: false });
    expect(neon.calls.some((x) => x[0] === 'set:shadowBlur' && x[1] > 0)).toBe(true);
    expect(neon.calls.filter((x) => x[0] === 'lineTo').length).toBe(8);
    // çok geniş görüntüde sinema bandı yok
    const wide = recorder();
    drawFrame(wide, 2400, 900, 'sinema', { mark: false });
    expect(wide.calls.filter((x) => x[0] === 'fillRect').length).toBe(0);
  });
});
