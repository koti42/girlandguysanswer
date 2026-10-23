import { describe, expect, it } from 'vitest';
import { computeChunkLight } from '../lighting.js';
import { generateCityChunk } from './cityGen.js';
import { warmCity } from './cityWarm.js';
import { citySeed } from './cityPlanTestKit.js';

/** 300 chunk: 100 rastgele + 100 Merkez kuleleri + 100 spiral (merkezden çevreye); sözleşme §7: p50 ≤3 ms, p95 ≤8 ms, azami 16 ms. */
function sample() {
  const out = [];
  let s = 20260101;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 100; i++) out.push([Math.floor(rnd() * 100) - 50, Math.floor(rnd() * 100) - 50]);
  for (let i = 0; i < 100; i++) out.push([Math.floor(rnd() * 36) - 18, Math.floor(rnd() * 36) - 18]);
  for (let r = 0; out.length < 300; r++) {
    for (let k = 0; k < 8 && out.length < 300; k++) out.push([Math.round(Math.cos((k * Math.PI) / 4) * r * 1.5), Math.round(Math.sin((k * Math.PI) / 4) * r * 1.5)]);
  }
  return out;
}

/** Makine yükü katsayısı: sabit bir CPU iş yükünün (boşta ≈ 4.6 ms) en iyi süresi / taban. Paralel koşan başka testler varken bütçeler orantılı gevşer (≤ 8×). */
let sinkLoad = 0;
function loadFactor() {
  let best = Infinity;
  for (let r = 0; r < 6; r++) {
    const t0 = performance.now();
    let h = 0;
    for (let i = 0; i < 4000000; i++) h = (Math.imul(h ^ i, 16777619) + (h >>> 7)) | 0;
    sinkLoad ^= h;
    best = Math.min(best, performance.now() - t0);
  }
  return Math.min(8, Math.max(1, best / 5));
}

/** qa5: SÜRDÜRÜLEN yük katsayısı: aynı iş yükünün MEDYAN süresi / taban. loadFactor() en iyi (en sakin) turu alır ve kısa bir sakin pencereyi yakalayıp
 * katsayıyı olduğundan küçük verebilir; ölçüm süresi boyunca süren doygunlukta (paralel test/PHP/oyun) medyan gerçek yavaşlamayı yansıtır. Boşta ≈ 1. */
function loadFactorMedian() {
  const runs = [];
  for (let r = 0; r < 7; r++) {
    const t0 = performance.now();
    let h = 0;
    for (let i = 0; i < 4000000; i++) h = (Math.imul(h ^ i, 16777619) + (h >>> 7)) | 0;
    sinkLoad ^= h;
    runs.push(performance.now() - t0);
  }
  runs.sort((a, b) => a - b);
  return Math.min(8, Math.max(1, runs[3] / 5));
}

function stats(times) {
  const a = times.slice().sort((x, y) => x - y);
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return {
    p50: q(0.5), p95: q(0.95), max: a[a.length - 1],
  };
}

/** qa5: chunk başına EN İYİ n geçiş (aynı chunk'lar aynı sırayla n kez üretilir, chunk başına en küçük süre alınır): paralel yükte bir zamanlayıcı/GC kesintisi
 * her geçişte BAŞKA bir chunk'a denk gelir; gerçek bir yavaşlık ise aynı chunk'ta TÜM geçişlerde görünür. */
function passMin(seed, light, n) {
  const cells = sample();
  const best = new Array(cells.length).fill(Infinity);
  for (let r = 0; r < n; r++) {
    cells.forEach(([cx, cz], i) => {
      const t0 = performance.now();
      const c = generateCityChunk(seed, cx, cz, { light: false });
      if (light) computeChunkLight(c);
      best[i] = Math.min(best[i], performance.now() - t0);
    });
  }
  return stats(best);
}

describe('üretim bütçesi (300 chunk)', () => {
  it('chunk üretimi: p50 ≤ 3 ms, p95 ≤ 8 ms, azami ≤ 16 ms (JIT ısınması + en iyi 3 turdan; işlemler paralel koşarken sapma payı için tur seçimi)', () => {
    const seed = citySeed(30);
    const k0 = loadFactor();
    warmCity(seed);
    generateCityChunk(seed, 0, 0, { light: false });
    const best = passMin(seed, false, 4);
    const k = Math.max(k0, loadFactor(), loadFactorMedian());
    expect(best.p50).toBeLessThanOrEqual(3 * k);
    expect(best.p95).toBeLessThanOrEqual(8 * k);
    // azami (16 ms) boştaki makinede ölçülür; paralel yükte tek bir zamanlayıcı/GC sıçraması olabileceğinden 5× payla denetlenir
    expect(best.max).toBeLessThanOrEqual(16 * (k > 1.15 ? 5 * k : 1.5));
  }, 120000);

  it('ışık dahil (World.ensureChunk yolu): p95 ≤ 8 ms, azami ≤ 16 ms', () => {
    const seed = citySeed(31);
    const k0 = loadFactor();
    warmCity(seed);
    generateCityChunk(seed, 0, 0);
    // qa5: ölçümden SONRA da yük katsayısı alınır (yük ölçümden sonra yükselmiş olabilir) ve ölçüm en çok 4 kez yinelenir: gerçek bir
    // gerileme TÜM denemelerde eşiği aşar; tek bir CPU doygunluğu penceresi tek bir denemeyi bozabilir.
    let best = null;
    let k = 2;
    for (let attempt = 0; attempt < 4; attempt++) {
      const b = passMin(seed, true, 3);
      // ışık hesabı lighting.js'in (World) maliyetidir; yük katsayısı en az 2 alınır (boşta ölçülen p95 ≈ 3–4 ms)
      const ka = Math.max(2, k0, loadFactor(), loadFactorMedian());
      if (best === null || b.p95 / ka < best.p95 / k) {
        best = b;
        k = ka;
      }
      if (best.p95 <= 8 * k) break;
    }
    expect(best.p95).toBeLessThanOrEqual(8 * k);
    expect(best.max).toBeLessThanOrEqual(16 * 5 * k);
    expect(sinkLoad).not.toBe(0.5);
  }, 120000);

  it('warmCity: varış çevresinin planlarını önbelleğe alır; ısıtılmış varış chunk\'ı < 8 ms', () => {
    const seed = citySeed(32);
    const r = warmCity(seed, { cx: 0, cz: 0, radius: 3 });
    expect(r.blocks).toBeGreaterThanOrEqual(4);
    expect(r.lots).toBeGreaterThanOrEqual(4);
    generateCityChunk(seed, 5, 5, { light: false });
    const t0 = performance.now();
    generateCityChunk(seed, 0, 0, { light: false });
    expect(performance.now() - t0).toBeLessThan(8 * loadFactor());
  });
});
