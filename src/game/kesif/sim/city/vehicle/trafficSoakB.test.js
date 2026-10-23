import { describe, expect, it, vi } from 'vitest';
import { soakGrid } from './trafficTestKit.js';

/*
 * Trafik soak B: üretilmiş ızgaralar 10–19 (alan varyantları, tümü sokak/dirsek olan 19) × 1000 ışık döngüsü.
 * Değişmezler (bağımsız denetimle): min boşluk > 0,5 m · kırmızı ihlali 0 · çatışan hareket aynı anda kavşakta 0 · kavşak kilitlenmesi/açlığı 0
 * (en eski bekleyen istek < 60 sn) · bekçi 0 (nominal) · sert sınır geri dönüşü 0 · kilitlenme 0 (araç sürekli ≤ 90 sn durmaz).
 * KESIF_SOAK_CYCLES ile döngü sayısı küçültülebilir (yerel hız); varsayılan 1000.
 */
vi.setConfig({ testTimeout: 900000 });

const ENV = globalThis.process && globalThis.process.env ? globalThis.process.env : {};
const CYCLES = Number(ENV.KESIF_SOAK_CYCLES) > 0 ? Number(ENV.KESIF_SOAK_CYCLES) : 1000;

describe('trafficSoak: ızgara 10–19 × ' + CYCLES + ' döngü — nominal yoğunluk (0,75 araç/düğüm)', () => {
  const grids = Array.from({ length: 10 }, (_, k) => k + 10);
  it.each(grids)('ızgara %i', (k) => {
    const r = soakGrid(k, 0.75, CYCLES);
    expect(r.minGap, 'asgari boşluk').toBeGreaterThan(0.5);
    expect(r.redViolations, 'kırmızı ihlali').toBe(0);
    expect(r.redRuns, 'kırmızı ihlali (trafik sayacı)').toBe(0);
    expect(r.conflictViolations, 'çatışan hareketler').toBe(0);
    expect(r.watchdog, 'bekçi').toBe(0);
    expect(r.wallClamps, 'sert DUR sınırı').toBe(0);
    expect(r.gapClamps, 'sert boşluk sınırı').toBe(0);
    expect(r.maxStill, 'sürekli duruş (kilitlenme)').toBeLessThan(90);
    expect(r.maxTicket, 'kavşak istek bekleme (açlık/livelock)').toBeLessThan(60);
    expect(r.crossings, 'ilerleme').toBeGreaterThan(CYCLES * 4);
  });
});
