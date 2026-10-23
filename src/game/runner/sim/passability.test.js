import { describe, expect, it } from 'vitest';
import { createSim } from './index.js';
import { runBot } from './bot.js';

/*
 * Geçilebilirlik kanıtı (şartname §3.9, v2 §A.7): ileriye bakan bot, gerçek pist
 * üretimiyle 40 farklı seed'de 6000 m koşar ve hiçbirinde ölmez. Bot yalnızca
 * oyuncunun da yapabildiği girdileri kullanır (tick başına en fazla 4); ölürse
 * ya desen kütüphanesinde adil olmayan bir kombinasyon vardır ya da hız/kural
 * değişikliği desenleri bozmuştur. Bot rampalara tırmanıp çatılarda koşar:
 * çatıdan düşüşler ve iniş alanları da bu koşularda sınanır.
 */

const SEEDS = [];
for (let i = 0; i < 40; i++) SEEDS.push(((i * 2654435761 + 12345) >>> 0) || 1);

/*
 * Tek bir `it` içinde 40 seed 60 sn+ eşzamanlı CPU tutardı (yük altında 115 sn): vitest işçisi bu sürede
 * ana sürece RPC yanıtı alamaz ("Timeout calling onTaskUpdate" -> çalışma kırmızı). Seed'ler küçük
 * gruplara bölünür (araya setup.js'teki afterEach makro-görev turu girer); toplam doğrulamalar son
 * testte yapılır (aynı dosyada sıralı koşar).
 */
const GROUP = 5;
const acc = { total: 0, roofs: 0, supers: 0, bad: [], seen: 0 };

describe('geçilebilirlik: 40 seed × 6000 m', () => {
    for (let g = 0; g < SEEDS.length; g += GROUP) {
        it('bot seed grubunda ölmez, sendelemez (' + (g + 1) + '-' + Math.min(g + GROUP, SEEDS.length) + ')', () => {
            for (const seed of SEEDS.slice(g, g + GROUP)) {
                const sim = createSim({ seed, gateCount: 30 });
                let sawSuper = false;
                const r = runBot(sim, {
                    untilZ: 6000000,
                    botSeed: seed,
                    stop: (s) => {
                        if (s.state.superTicks > 0) sawSuper = true;
                        return false;
                    },
                });
                acc.seen++;
                acc.total += sim.state.z;
                acc.roofs += r.roofLandings;
                if (sawSuper) acc.supers++;
                if (r.crashed || r.stumbles || r.shieldBreaks || sim.state.z < 6000000) {
                    acc.bad.push({ seed, z: sim.state.z, ...r });
                }
                // Kapıların hepsi geçildi ve kayıt sunucu sınırları içinde.
                expect(sim.state.gates.length).toBe(14);
                expect(sim.inputCount()).toBeLessThan(2000);
            }
        }, 180000);
    }

    it('toplam: hiçbir seedde ölüm yok, ortalama 6000 m, v2 öğeleri kullanıldı', () => {
        expect(acc.seen).toBe(SEEDS.length);
        expect(acc.bad).toEqual([]);
        expect(Math.floor(acc.total / SEEDS.length / 1000)).toBe(6000);
        // v2 öğeleri gerçekten kullanıldı: araba/çatı inişleri ve Süper Zıplamalı koşular.
        expect(acc.roofs).toBeGreaterThan(200);
        expect(acc.supers).toBeGreaterThanOrEqual(10);
    });
});
