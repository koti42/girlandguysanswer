// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createKesifAudio } from './audio.js';
import { createCityAmbience, ambienceBudget } from './audioCity.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { mulberry32 } from './sim/rng.js';

let AC;
let original;
const lastCtx = () => AC.instances[AC.instances.length - 1];

beforeEach(() => {
  original = window.AudioContext;
  AC = createFakeAudioContextClass();
  window.AudioContext = AC;
});
afterEach(() => {
  window.AudioContext = original;
});

function setup(lowPower, nodeCap) {
  const audio = createKesifAudio({ muted: false, musicEnabled: false, lowPower, rand: mulberry32(9) });
  audio.unlock();
  const ctx = lastCtx();
  const amb = createCityAmbience({ play: (name, o) => audio.play(name, o), nodeCap, rand: mulberry32(3) });
  return { audio, ctx, amb };
}

function drive(h, secs, st) {
  const steps = Math.round(secs * 60);
  for (let i = 0; i < steps; i++) {
    h.amb.update(1 / 60, st(i / 60));
    h.ctx.advance(1 / 60);
    h.audio.update(1 / 60);
  }
}

describe('şehir ambiyansı gerçek ses motorunda (sahte AudioContext)', () => {
  it('60 sn: yataklar çalar; eşzamanlı ses ve canlı kaynak düğümü sınırlı; yağmur katmanı yağmurla gelir', () => {
    const h = setup(false, 24);
    const live = () => h.ctx.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'bufsrc') && n.stoppedAt !== undefined && !n.ended).length;
    let maxLive = 0;
    let maxVoices = 0;
    const steps = 60 * 60;
    for (let i = 0; i < steps; i++) {
      const t = i / 60;
      h.amb.update(1 / 60, { night: 1, rain: t > 30 ? 1 : 0, shelter: 0 });
      h.ctx.advance(1 / 60);
      h.audio.update(1 / 60);
      if (i % 30 === 0) {
        maxLive = Math.max(maxLive, live());
        maxVoices = Math.max(maxVoices, h.audio.getStats().voices);
      }
    }
    expect(maxVoices).toBeGreaterThan(0);
    expect(maxVoices).toBeLessThanOrEqual(24);
    // yüksek kademe: ambiyans payı (24×0,7 → 16) × çapraz geçiş çarpanı toleransı içinde
    expect(maxLive).toBeLessThanOrEqual(ambienceBudget(24) + 6);
    expect(maxLive).toBeGreaterThan(4);
    const stats = h.amb.getStats();
    expect(stats.active).toContain('rain');
    h.amb.stop();
    h.audio.dispose();
  });

  it('düşük güç (düğüm tavanı 12): canlı düğüm sayısı 12 civarını aşmaz', () => {
    const h = setup(true, 12);
    let maxLive = 0;
    for (let i = 0; i < 40 * 60; i++) {
      h.amb.update(1 / 60, { night: 0.5, rain: 0.8, shelter: 0 });
      h.ctx.advance(1 / 60);
      h.audio.update(1 / 60);
      if (i % 20 === 0) {
        maxLive = Math.max(maxLive, h.ctx.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'bufsrc') && n.stoppedAt !== undefined && !n.ended).length);
      }
    }
    expect(maxLive).toBeLessThanOrEqual(12);
    expect(maxLive).toBeGreaterThan(0);
    h.audio.dispose();
  });

  it('boyuttan çıkış (stop) tüm yatakları kısa sürede söndürür; ses sayısı düşer; yeni yatak başlamaz', () => {
    const h = setup(false, 24);
    drive(h, 6, () => ({ night: 1, rain: 0, shelter: 0 }));
    const before = h.audio.getStats().voices;
    expect(before).toBeGreaterThan(0);
    h.amb.stop();
    drive(h, 1, () => ({ night: 1, rain: 0, shelter: 0 }));
    h.amb.setEnabled(false);
    drive(h, 3, () => ({ night: 1, rain: 0, shelter: 0 }));
    expect(h.audio.getStats().voices).toBeLessThan(before);
    h.audio.dispose();
  });

  it('1000 başlat/durdur: canlı düğüm sayısı sınırsız büyümez (sızıntı yok)', () => {
    const h = setup(false, 24);
    for (let k = 0; k < 1000; k++) {
      h.amb.update(0.5, { night: 1, rain: k % 2 ? 1 : 0, shelter: 0 });
      h.ctx.advance(0.5);
      h.audio.update(0.5);
      if (k % 7 === 0) h.amb.stop();
    }
    const live = h.ctx.nodes.filter((n) => (n.kind === 'osc' || n.kind === 'bufsrc') && n.stoppedAt !== undefined && !n.ended).length;
    expect(live).toBeLessThanOrEqual(40);
    h.audio.dispose();
  });
});
