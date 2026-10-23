import { describe, expect, it, vi } from 'vitest';
import { soakGrid } from './trafficTestKit.js';

/*
 * Trafik stres: 20 ızgara × 300 döngü, 1,5× yoğunluk (1,125 araç/düğüm) + belirlenimcilik.
 * Değişmezler (bağımsız denetimle): min boşluk > 0,5 m · kırmızı ihlali 0 · çatışan hareket aynı anda kavşakta 0 · kavşak kilitlenmesi/açlığı 0
 * (en eski bekleyen istek < 60 sn) · bekçi 0 (nominal) · sert sınır geri dönüşü 0 · kilitlenme 0 (araç sürekli ≤ 90 sn durmaz).
 * KESIF_SOAK_CYCLES ile döngü sayısı küçültülebilir (yerel hız); varsayılan 1000.
 */
vi.setConfig({ testTimeout: 900000 });

const ENV = globalThis.process && globalThis.process.env ? globalThis.process.env : {};
const CYCLES = Number(ENV.KESIF_SOAK_CYCLES) > 0 ? Number(ENV.KESIF_SOAK_CYCLES) : 1000;

describe('trafficStress: 1,5× yoğunluk', () => {
  const grids = Array.from({ length: 20 }, (_, k) => k);
  it.each(grids)('ızgara %i', (k) => {
    const r = soakGrid(k, 1.125, Math.min(CYCLES, 300));
    expect(r.minGap, 'asgari boşluk').toBeGreaterThan(0.5);
    expect(r.redViolations).toBe(0);
    expect(r.conflictViolations).toBe(0);
    expect(r.watchdog, 'bekçi ≤ 1/sa').toBeLessThanOrEqual(2);
    expect(r.maxTicket).toBeLessThan(90);
    expect(r.maxStill).toBeLessThan(150);
  });
});

describe('trafficStress: belirlenimcilik', () => {
  it('aynı ızgara/tohum/zaman → aynı özet ve geçiş sayısı; farklı ızgara farklı', () => {
    const a = soakGrid(3, 0.75, 60);
    const b = soakGrid(3, 0.75, 60);
    expect(a.traffic.digest()).toBe(b.traffic.digest());
    expect(a.crossings).toBe(b.crossings);
    const c = soakGrid(4, 0.75, 60);
    expect(c.traffic.digest()).not.toBe(a.traffic.digest());
  });
});
