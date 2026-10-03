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

describe('geçilebilirlik: 40 seed × 6000 m', () => {
    it('bot hiçbir seed\'de ölmez, sendelemez', () => {
        let total = 0;
        let roofs = 0;
        let supers = 0;
        const bad = [];
        for (const seed of SEEDS) {
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
            total += sim.state.z;
            roofs += r.roofLandings;
            if (sawSuper) supers++;
            if (r.crashed || r.stumbles || r.shieldBreaks || sim.state.z < 6000000) {
                bad.push({ seed, z: sim.state.z, ...r });
            }
            // Kapıların hepsi geçildi ve kayıt sunucu sınırları içinde.
            expect(sim.state.gates.length).toBe(14);
            expect(sim.inputCount()).toBeLessThan(2000);
        }
        expect(bad).toEqual([]);
        expect(Math.floor(total / SEEDS.length / 1000)).toBe(6000);
        // v2 öğeleri gerçekten kullanıldı: araba/çatı inişleri ve Süper Zıplamalı koşular.
        expect(roofs).toBeGreaterThan(200);
        expect(supers).toBeGreaterThanOrEqual(10);
    }, 180000);
});
