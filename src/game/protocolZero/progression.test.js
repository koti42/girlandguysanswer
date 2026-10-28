import { describe, expect, it } from 'vitest';
import { GENES, GENE_CATEGORIES, LEVEL_XP, geneMods, levelFor, newlyUnlocked, sanitizeGenes, unlockedGenes, xpFor } from './progression';
import { createSim, purge, tick, toggleIsolate, upgradeFirewall } from './sim';
import { COSTS } from './constants';

describe('xp ve seviye', () => {
    it('xpFor sunucu formülüyle aynı: skor/50 + gün×2 + zafer 300 + zorluk', () => {
        expect(xpFor({ score: 9000, days: 42, outcome: 'victory', difficulty: 'normal' })).toBe(180 + 84 + 300 + 50);
        expect(xpFor({ score: 3835, days: 23, outcome: 'defeat', difficulty: 'normal' })).toBe(76 + 46 + 0 + 50);
        expect(xpFor({ score: 100, days: 1, outcome: 'defeat', difficulty: 'nightmare' })).toBe(2 + 2 + 250);
        expect(xpFor({})).toBe(2 + 50);
    });

    it('seviye eşikleri ve yüzde', () => {
        expect(levelFor(0)).toMatchObject({ level: 1, rank: 'Analist', percent: 0 });
        expect(levelFor(299).level).toBe(1);
        expect(levelFor(300)).toMatchObject({ level: 2, rank: 'Operatör' });
        expect(levelFor(1500).level).toBe(4);
        expect(levelFor(LEVEL_XP[LEVEL_XP.length - 1] + 999)).toMatchObject({ level: 12, max: true, percent: 100 });
        expect(levelFor(550).percent).toBe(50);
    });
});

describe('genler', () => {
    it('15 gen, 5 kategori × 3; seviyeyle açılır', () => {
        expect(GENES).toHaveLength(15);
        for (const c of GENE_CATEGORIES) expect(GENES.filter((g) => g.category === c.key)).toHaveLength(3);
        expect(unlockedGenes(0)).toEqual(['reserve', 'calm']);
        expect(unlockedGenes(300)).toContain('hardened');
        expect(unlockedGenes(300)).not.toContain('efficiency');
        expect(unlockedGenes(99999)).toHaveLength(15);
    });

    it('sanitizeGenes kilitli, bilinmeyen ve aynı kategoriden ikinciyi eler', () => {
        expect(sanitizeGenes(['reserve', 'efficiency', 'yok', 'calm'], 0)).toEqual(['reserve', 'calm']);
        expect(sanitizeGenes(['reserve', 'efficiency', 'calm'])).toEqual(['reserve', 'calm']);
        expect(sanitizeGenes(null)).toEqual([]);
    });

    it('geneMods birleşik etki', () => {
        const m = geneMods(['reserve', 'quarantine', 'fast_decrypt', 'calm', 'breach_time']);
        expect(m.startBudget).toBe(150);
        expect(m.isolatePanicSpike).toBe(false);
        expect(m.isolatePressure).toBeCloseTo(0.7);
        expect(m.decryptBase).toBeCloseTo(1.15);
        expect(m.panicRecovery).toBeCloseTo(0.2);
        expect(m.breachSeconds).toBe(3);
        expect(geneMods([]).income).toBe(1);
    });

    it('newlyUnlocked', () => {
        expect(newlyUnlocked(0, 300).map((g) => g.key)).toEqual(['hardened', 'fast_decrypt']);
        expect(newlyUnlocked(300, 310)).toEqual([]);
    });
});

describe('genler simülasyonda', () => {
    it('başlangıç bütçesi, firewall, deşifre ve indirimler uygulanır', () => {
        const s = createSim('normal', { seed: 1, genes: ['reserve', 'hardened', 'head_start', 'calm', 'breach_time'] });
        expect(s.budget).toBe(650 + 150);
        expect(s.decrypt).toBe(5);
        expect(s.nodes.cai.firewall).toBe(2); // 1 + 1
        expect(s.cfg.breachSeconds).toBe(12 + 3);
        expect(s.genes).toEqual(['reserve', 'hardened', 'head_start', 'calm', 'breach_time']);
    });

    it('verimli tedarik firewall maliyetini, derin temizlik puanı değiştirir; sessiz karantina anlık panik vermez', () => {
        const s = createSim('normal', { seed: 1, genes: ['efficiency', 'purge_plus'] });
        s.budget = 10000;
        const before = s.budget;
        upgradeFirewall(s, 'cai'); // seviye 1 → 120 × 0.85 = 102
        expect(before - s.budget).toBe(102);
        s.nodes.ist.infection = 60;
        purge(s, 'ist');
        expect(s.nodes.ist.infection).toBe(60 - (COSTS.purgeAmount + 10));

        const q = createSim('normal', { seed: 1, genes: ['quarantine'] });
        toggleIsolate(q, 'svl');
        expect(q.panic).toBe(0);
    });

    it('soğukkanlı sözcü paniği daha hızlı düşürür', () => {
        const run = (genes) => {
            const s = createSim('normal', { seed: 2, genes });
            s.panic = 40;
            s.timers.nextReseed = 1e9;
            s.timers.nextBreach = 1e9;
            s.timers.nextDilemma = 1e9;
            s.timers.nextDataBubble = 1e9;
            for (let t = 0; t < 10; t += 0.25) tick(s, 0.25);
            return s.panic;
        };
        expect(run(['calm'])).toBeLessThan(run([]));
    });
});
