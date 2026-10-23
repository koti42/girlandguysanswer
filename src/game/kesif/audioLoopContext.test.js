// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKesifAudio } from './audio.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { createVehicleAudio } from './audioVehicle.js';
import { createRadio } from './audioRadio.js';
import { advance, connectedCount, liveSources, makeVehicle } from './audioLoopTestKit.js';
import { mulberry32 } from './sim/rng.js';

let AC;
let original;

const mk = (opts) => createKesifAudio({ rand: mulberry32(3), lowPower: false, ...(opts || {}) });
const lastCtx = () => AC.instances[AC.instances.length - 1];
const hide = (h) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  original = window.AudioContext;
  AC = createFakeAudioContextClass();
  window.AudioContext = AC;
});

afterEach(() => {
  window.AudioContext = original;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

function stack(audio) {
  const va = createVehicleAudio({ getLoop: () => audio.getLoopContext(), nodeCap: 24 });
  const radio = createRadio({ getLoop: () => audio.getLoopContext(), nodeCap: 16 });
  const st = {
    v: makeVehicle('spor'), wet: 0, listener: { x: 0, y: 64, z: 0, yaw: 0 }, traffic: [{ id: 1, x: 8, z: 3, vx: 5, vz: 0 }], trafficN: 1,
  };
  let t = 1000;
  return {
    va, radio, st, tick(dt, active) {
      t += dt;
      audio.update(dt);
      va.update(dt, st);
      radio.update(dt, t, active === undefined ? true : active);
      const c = lastCtx();
      if (c) advance(c, dt, dt);
    },
  };
}

describe('audio.js getLoopContext', () => {
  it('ilk kullanıcı jestinden önce null; araç sesi + radyo hiçbir AudioContext kurmaz (otomatik oynatma yok)', () => {
    const a = mk();
    expect(a.getLoopContext()).toBeNull();
    const s = stack(a);
    s.radio.setStation('neonfm');
    for (let i = 0; i < 120; i++) s.tick(1 / 30);
    expect(AC.instances).toHaveLength(0);
    expect(a.getLoopContext()).toBeNull();
    expect(s.va.getStats().sources).toBe(0);
    expect(s.radio.getStats().sources).toBe(0);
    a.dispose();
  });

  it('jest sonrası bağlam: {ctx,sfx,music,amb,white,brown,running,musicOn} dolu ve kararlı nesne', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const l = a.getLoopContext();
    expect(l).not.toBeNull();
    expect(l.ctx).toBe(lastCtx());
    ['sfx', 'music', 'amb', 'white', 'brown'].forEach((k) => expect(l[k]).toBeTruthy());
    expect(l.running).toBe(true);
    expect(l.musicOn).toBe(true);
    expect(a.getLoopContext()).toBe(l);
    expect(typeof l.holdMusic).toBe('function');
    a.dispose();
    expect(a.getLoopContext()).toBeNull();
  });

  it('sessiz başlayınca bağlam kurulmaz → getLoopContext null; sesi açınca kurulur', () => {
    const a = mk({ muted: true });
    document.dispatchEvent(new Event('pointerdown'));
    expect(a.getLoopContext()).toBeNull();
    expect(AC.instances).toHaveLength(0);
    a.setMuted(false);
    expect(a.getLoopContext()).not.toBeNull();
    expect(a.getLoopContext().running).toBe(true);
    a.dispose();
  });

  it('gerçek audio.js grafında: motor + trafik + radyo kurulur; düğüm sayıları tavanın içinde', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const s = stack(a);
    s.radio.setStation('hiz_hatti');
    const ctx = lastCtx();
    const base = liveSources(ctx);
    for (let i = 0; i < 900; i++) {
      s.st.v.rpm = 0.3 + 0.7 * ((i % 90) / 90);
      s.tick(1 / 30);
      s.va.event(i % 40 === 0 ? 'bump' : 'bilinmeyen', { impact: 9 });
      const mine = liveSources(ctx) - base;
      expect(s.va.getStats().sources).toBeLessThanOrEqual(24);
      expect(s.radio.getStats().sources).toBeLessThanOrEqual(16);
      expect(mine).toBeLessThanOrEqual(24 + 16);
    }
    expect(s.va.getStats().player).toBe(true);
    expect(s.radio.getStats().playing).toBe(true);
    a.dispose();
  });

  it('radyo çalarken ortam müziği tutulur; radyo bitince devam eder', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const s = stack(a);
    s.radio.setStation('neonfm');
    for (let i = 0; i < 90; i++) s.tick(1 / 30, true);
    expect(a.getStats().musicHold).toBe(true);
    const n0 = lastCtx().nodes.length;
    // tutulurken ortam müziği yeni osilatör eklemez: yalnızca radyo/ses düğümleri üretilir
    const musicNodes = a.getStats().musicNodes;
    for (let i = 0; i < 90; i++) s.tick(1 / 30, true);
    expect(a.getStats().musicNodes).toBeLessThanOrEqual(musicNodes);
    expect(lastCtx().nodes.length).toBeGreaterThan(n0);
    for (let i = 0; i < 30; i++) s.tick(1 / 30, false);
    expect(a.getStats().musicHold).toBe(false);
    a.dispose();
  });

  it('gizli sekme: bağlam askıya alınır, araç sesi + radyo her şeyi bırakır; dönünce yeniden kurulur', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const ctx = lastCtx();
    const s = stack(a);
    s.radio.setStation('pazar_sokagi');
    for (let i = 0; i < 90; i++) s.tick(1 / 30);
    expect(liveSources(ctx)).toBeGreaterThan(5);
    hide(true);
    expect(ctx.state).toBe('suspended');
    expect(a.getLoopContext().running).toBe(false);
    s.tick(1 / 30);
    expect(s.va.getStats().sources).toBe(0);
    expect(s.radio.getStats().sources).toBe(0);
    for (let i = 0; i < 60; i++) s.tick(1 / 30);
    expect(s.va.getStats().sources).toBe(0);
    expect(s.radio.getStats().sources).toBe(0);
    hide(false);
    expect(ctx.state).toBe('running');
    for (let i = 0; i < 60; i++) s.tick(1 / 30);
    expect(s.va.getStats().player).toBe(true);
    expect(s.radio.getStats().playing).toBe(true);
    a.dispose();
  });

  it('sessize alma / müzik kapatma: motor susar, radyo susar; açınca döner', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const s = stack(a);
    s.radio.setStation('gece_taksisi');
    for (let i = 0; i < 90; i++) s.tick(1 / 30);
    a.setMusicEnabled(false);
    for (let i = 0; i < 30; i++) s.tick(1 / 30);
    expect(s.radio.getStats().sources).toBe(0);
    expect(s.va.getStats().player).toBe(true); // motor sfx: müzik anahtarından bağımsız
    a.setMusicEnabled(true);
    for (let i = 0; i < 60; i++) s.tick(1 / 30);
    expect(s.radio.getStats().playing).toBe(true);
    a.setMuted(true);
    for (let i = 0; i < 30; i++) s.tick(1 / 30);
    expect(s.va.getStats().sources).toBe(0);
    expect(s.radio.getStats().sources).toBe(0);
    a.setMuted(false);
    for (let i = 0; i < 60; i++) s.tick(1 / 30);
    expect(s.va.getStats().player).toBe(true);
    expect(s.radio.getStats().playing).toBe(true);
    a.dispose();
  });

  it('ses/müzik sürgüleri: sfx veriyolu motoru, müzik veriyolu radyoyu ölçekler', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const l = a.getLoopContext();
    a.setVolumes({ sfx: 0.25, music: 0.5 });
    const last = (p) => { for (let i = p.events.length - 1; i >= 0; i--) if (p.events[i][0] === 'target') return p.events[i][1]; return p.value; };
    expect(last(l.sfx.gain)).toBeCloseTo(0.25, 6);
    expect(last(l.music.gain)).toBeGreaterThan(0);
    expect(last(l.music.gain)).toBeLessThan(0.16);
    a.setVolumes({ music: 0 });
    expect(last(l.music.gain)).toBe(0);
    a.dispose();
  });

  it('1000 bin/in + radyo aç/kapa gerçek grafta: oluşturulan = bırakılan, grup 0', () => {
    const a = mk();
    document.dispatchEvent(new Event('pointerdown'));
    const s = stack(a);
    s.radio.setStation('neonfm');
    s.st.v = null;
    s.tick(0.05, false);
    advance(lastCtx(), 1, 0.1);
    s.tick(0.05, false);
    const ctx = lastCtx();
    const base = connectedCount(ctx);
    for (let i = 0; i < 1000; i++) {
      s.st.v = i % 2 === 0 ? makeVehicle(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'][i % 6]) : null;
      s.tick(0.05, i % 2 === 0);
      advance(ctx, 0.1, 0.05);
    }
    s.st.v = null;
    s.st.traffic = [];
    s.st.trafficN = 0;
    for (let i = 0; i < 80; i++) s.tick(0.1, false);
    expect(s.va.getStats().sources).toBe(0);
    expect(s.radio.getStats().sources).toBe(0);
    const vs = s.va.getStats();
    const rs = s.radio.getStats();
    expect(vs.created).toBe(vs.released);
    expect(rs.created).toBe(rs.released);
    expect(vs.groups).toBe(0);
    expect(rs.groups).toBe(0);
    expect(connectedCount(ctx)).toBeGreaterThan(0);
    expect(base).toBeGreaterThan(0);
    a.dispose();
  });
});
