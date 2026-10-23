import { describe, expect, it } from 'vitest';
import {
  createStepper, createFrameStats, createGameLoop, MAX_STEPS_PER_FRAME, TICK_MS,
} from './gameLoop.js';

describe('createStepper (sabit adım biriktirici)', () => {
  it('60 Hz: 16.667 ms → 1 adım, 8 ms → 0 adım ama biriker', () => {
    const s = createStepper();
    expect(s.advance(8)).toBe(0);
    expect(s.alpha).toBeCloseTo(8 / TICK_MS, 5);
    expect(s.advance(9)).toBe(1);
    expect(s.alpha).toBeLessThan(0.1);
  });

  it('144 Hz ekran: 60 adım/sn ortalaması korunur, gerçek zamandan hızlı koşmaz', () => {
    const s = createStepper();
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += s.advance(1000 / 144);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });

  it('kare süresi 250 ms ile sınırlı ve kare başı adım tavanı uygulanır (sekme dönüşü ışınlamaz)', () => {
    const s = createStepper();
    const n = s.advance(10000);
    expect(n).toBe(MAX_STEPS_PER_FRAME);
    expect(s.dropped).toBeGreaterThan(0);
    expect(s.alpha).toBeGreaterThanOrEqual(0);
    expect(s.alpha).toBeLessThan(1);
  });

  it('negatif/NaN süre 0 sayılır; reset biriktiriciyi sıfırlar', () => {
    const s = createStepper();
    expect(s.advance(-5)).toBe(0);
    expect(s.advance(NaN)).toBe(0);
    s.advance(10);
    s.reset();
    expect(s.alpha).toBe(0);
  });

  it('alpha her zaman [0,1)', () => {
    const s = createStepper();
    for (let i = 0; i < 500; i++) {
      s.advance((i * 7919) % 41);
      expect(s.alpha).toBeGreaterThanOrEqual(0);
      expect(s.alpha).toBeLessThan(1);
    }
  });
});

describe('createFrameStats', () => {
  it('fps, ortalama, en kötü kare ve spike (>50 ms) sayar', () => {
    const f = createFrameStats({ window: 4 });
    [16, 16, 16, 16].forEach((m) => f.push(m));
    expect(f.fps).toBe(63);
    f.push(120);
    expect(f.spikes).toBe(1);
    expect(f.worstMs).toBe(120);
    expect(f.avgMs).toBeCloseTo((16 * 3 + 120) / 4, 5);
    f.push(NaN);
    f.push(-3);
    expect(f.frames).toBe(5);
  });

  it('boşken sıfır', () => {
    const f = createFrameStats();
    expect(f.fps).toBe(0);
    expect(f.avgMs).toBe(0);
  });
});

describe('createGameLoop', () => {
  function fakeRaf() {
    const q = [];
    let id = 0;
    return {
      raf: (cb) => { q.push({ id: ++id, cb }); return id; },
      caf: (i) => { const k = q.findIndex((e) => e.id === i); if (k >= 0) q.splice(k, 1); },
      run: (t) => { const e = q.shift(); if (e) e.cb(t); return !!e; },
      size: () => q.length,
    };
  }

  it('ilk kare 0 ms alır, sonrakiler gerçek fark; stop() RAF iptal eder', () => {
    const r = fakeRaf();
    const got = [];
    const loop = createGameLoop({ frame: (ms) => got.push(ms), raf: r.raf, caf: r.caf, now: () => 0 });
    expect(loop.start()).toBe(true);
    expect(loop.start()).toBe(false);
    r.run(1000);
    r.run(1016);
    r.run(1050);
    expect(got).toEqual([0, 16, 34]);
    expect(loop.stop()).toBe(true);
    expect(r.size()).toBe(0);
    expect(loop.running).toBe(false);
  });

  it('restartClock sonraki kareyi 0 ms yapar (duraklatma dönüşü)', () => {
    const r = fakeRaf();
    const got = [];
    const loop = createGameLoop({ frame: (ms) => got.push(ms), raf: r.raf, caf: r.caf });
    loop.start();
    r.run(0);
    r.run(16);
    loop.restartClock();
    r.run(9000);
    expect(got).toEqual([0, 16, 0]);
  });

  it('frame fırlatsa bile bir sonraki kare zaten istenmiştir', () => {
    const r = fakeRaf();
    let n = 0;
    const loop = createGameLoop({ frame: () => { n++; if (n === 1) throw new Error('x'); }, raf: r.raf, caf: r.caf });
    loop.start();
    expect(() => r.run(0)).toThrow();
    expect(r.size()).toBe(1);
    r.run(16);
    expect(n).toBe(2);
  });
});
