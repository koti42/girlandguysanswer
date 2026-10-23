import { describe, expect, it } from 'vitest';
import { createKesifQuality } from './quality.js';

/*
 * Otomatik kalite: kare süresi, ayarlara bağlı basit bir maliyet modelinden gelir (piksel oranı², görüş mesafesi, post-fx).
 * "base" CPU/GPU yavaşlığıdır (CDP 4x kısma ≈ base × 4). Sınanan: kısma altında kademe iner, ama gidip gelme (titreme) olmaz:
 * değişim sayısı sınırlı ve ilk dakikadan sonra ayarlar durağan kalır.
 */
function simulate({ base, noise = 0.3, secs = 150, dpr = 3 }) {
  const q = createKesifQuality({ dpr, coarse: true, start: 'auto', persist: false, hints: { coarse: true, deviceMemory: 6, hardwareConcurrency: 8 } });
  q.warmup(0);
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let t = 0;
  const changes = [];
  while (t < secs * 1000) {
    const s = q.describe();
    const ms = base * s.pixelRatio * s.pixelRatio * (1 + 0.06 * s.viewDist) * (s.post ? 1.15 : 1) * (s.effTier === 'low' ? 0.8 : 1) * (1 + (rnd() - 0.5) * noise);
    const frame = Math.max(8, ms);
    const ch = q.sample(frame);
    t += frame;
    if (ch) changes.push({ at: t / 1000, settings: ch.settings });
  }
  return { q, changes, final: q.describe() };
}

describe('otomatik kalite: kısma altında kademe iner, titremez', () => {
  it('hızlı cihaz hiç değişmez', () => {
    const r = simulate({ base: 2 });
    expect(r.changes).toHaveLength(0);
  });

  it('4x yavaşlatılmış orta cihaz: piksel oranı/görüş mesafesi düşer, sınırlı sayıda değişim, 40 sn sonra durağan', () => {
    const r = simulate({ base: 8 });
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.changes.length).toBeLessThanOrEqual(8);
    const last = r.changes[r.changes.length - 1];
    expect(last.at).toBeLessThan(40);
    expect(r.final.pixelRatio).toBeLessThan(1.5);
    // yükseltme denemeleri sınırlı: aynı ayara tekrar tekrar dönülmez
    const seen = {};
    r.changes.forEach((c) => {
      const k = c.settings.pixelRatio + '/' + c.settings.viewDist + '/' + c.settings.effTier;
      seen[k] = (seen[k] || 0) + 1;
    });
    Object.keys(seen).forEach((k) => expect(seen[k]).toBeLessThanOrEqual(3));
  });

  it('çok yavaş cihaz birkaç saniyede iner ve orada kalır', () => {
    const r = simulate({ base: 30 });
    expect(r.changes.length).toBeGreaterThan(0);
    expect(r.changes[0].at).toBeLessThan(6);
    expect(r.changes.length).toBeLessThanOrEqual(10);
    expect(r.changes[r.changes.length - 1].at).toBeLessThan(60);
  });
});
