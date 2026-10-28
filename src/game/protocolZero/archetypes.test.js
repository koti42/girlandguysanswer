import { describe, expect, it } from 'vitest';
import { ARCHETYPES, ARCHETYPE_KEYS, CONDITIONAL_STORY, GLOBAL_STORY, applyArchetype, archetypeOf } from './archetypes';
import { DAY_SECONDS, DIFFICULTIES } from './constants';
import { createSim, purge, snapshot, summary, tick } from './sim';

const run = (s, seconds, step = 0.25) => {
    const events = [];
    for (let t = 0; t < seconds; t += step) events.push(...tick(s, step));
    return events;
};

describe('tehdit türleri', () => {
    it('7 tür; her birinin hikâyesi, haber havuzu ve geçerli çarpanları var', () => {
        expect(ARCHETYPE_KEYS).toHaveLength(7);
        for (const k of ARCHETYPE_KEYS) {
            const a = ARCHETYPES[k];
            expect(a.lore.length).toBeGreaterThan(40);
            expect(a.story.length).toBeGreaterThanOrEqual(3);
            expect(a.news.length).toBeGreaterThanOrEqual(2);
            expect(a.threat).toBeGreaterThanOrEqual(1);
            const cfg = applyArchetype(DIFFICULTIES.normal, k);
            expect(cfg.spread).toBeGreaterThan(0);
            expect(cfg.breachSeconds).toBeGreaterThanOrEqual(6);
            expect(cfg.dilemmaEvery[0]).toBeLessThan(cfg.dilemmaEvery[1]);
        }
        expect(archetypeOf('yok').key).toBe('worm');
    });

    it('çarpanlar zorluğa uygulanır (deepfake panik, kuantum deşifre, botnet firewall, donanım temizlik)', () => {
        const base = DIFFICULTIES.normal;
        expect(applyArchetype(base, 'deepfake').panicRate).toBeCloseTo(base.panicRate * 1.45);
        expect(applyArchetype(base, 'quantum').decryptBase).toBeCloseTo(base.decryptBase * 0.6);
        expect(applyArchetype(base, 'botnet').firewallEff).toBe(0.85);
        expect(applyArchetype(base, 'firmware').purgeAmount).toBe(15);
        expect(applyArchetype(base, 'autonomous').breachSeconds).toBe(base.breachSeconds - 2);
        expect(applyArchetype(base, 'worm').purgeAmount).toBe(25);
    });

    it('sim türü taşır: donanım virüsünde temizlik 15 puan düşürür, snapshot/summary türü verir', () => {
        const s = createSim('normal', { seed: 3, archetype: 'firmware' });
        s.budget = 1000;
        s.nodes.ist.infection = 50;
        purge(s, 'ist');
        expect(s.nodes.ist.infection).toBe(35);
        expect(snapshot(s).archetype).toBe('firmware');
        expect(snapshot(s).purgeAmount).toBe(15);
        expect(summary(s).archetype).toBe('firmware');
        expect(s.log[0].text).toContain('Donanım Virüsü');
    });

    it('botnet türünde aynı firewall daha az korur', () => {
        const make = (arch) => {
            const s = createSim('normal', { seed: 5, archetype: arch });
            for (const n of Object.values(s.nodes)) n.infection = 0;
            s.nodes.fra.infection = 80;
            s.nodes.ist.firewall = 5;
            s.timers.nextReseed = 1e9;
            s.timers.nextBreach = 1e9;
            s.timers.nextDilemma = 1e9;
            s.timers.nextDataBubble = 1e9;
            run(s, 10);
            return s.nodes.ist.infection;
        };
        expect(make('botnet')).toBeGreaterThan(make('worm'));
    });
});

describe('senaryo ve haberler', () => {
    it('küresel ve türe özel vuruşlar gününde bir kez düşer; dolgu haberleri akar', () => {
        const s = createSim('normal', { seed: 9, archetype: 'deepfake' });
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        const events = run(s, DAY_SECONDS * 8 + 1); // ~9 gün
        const stories = events.filter((e) => e.type === 'story');
        const texts = stories.map((e) => e.text);
        expect(texts).toContain(GLOBAL_STORY[0].text);
        expect(texts).toContain(ARCHETYPES.deepfake.story[0].text);
        expect(texts).toContain(ARCHETYPES.deepfake.story[1].text);
        expect(new Set(texts).size).toBe(texts.length); // tekrar yok
        expect(s.log.some((l) => l.kind === 'news')).toBe(true);
        const news = s.log.filter((l) => l.kind === 'news');
        for (const n of news) expect(n.text).not.toMatch(/\{(node|country)\}/);
    });

    it('deşifre %75 eşiğinde YZ anahtar rotasyonu yapar (ilerleme -8, arka kapı aralığı kısalır)', () => {
        const s = createSim('normal', { seed: 1 });
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        const before = s.cfg.reseedEvery[0];
        s.decrypt = 76;
        run(s, 0.5);
        expect(s.decrypt).toBeLessThan(70);
        expect(s.cfg.reseedEvery[0]).toBeCloseTo(before * 0.75);
        expect(s.story.flags.decrypt75).toBe(true);
    });

    it('ağır enfekte bölgede hükümet tepkisi: bir kez firewall +1, panik +4', () => {
        const s = createSim('normal', { seed: 1 });
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        s.nodes.cai.infection = 85;
        const fw = s.nodes.cai.firewall;
        const p = s.panic;
        run(s, 0.5);
        expect(s.nodes.cai.firewall).toBe(fw + 1);
        expect(s.panic).toBeCloseTo(p + 4, 0);
        run(s, 1);
        expect(s.nodes.cai.firewall).toBe(fw + 1);
    });

    it('koşullu vuruşlar bir kez tetiklenir', () => {
        const s = createSim('normal', { seed: 1 });
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        s.panic = 55;
        run(s, 1);
        const panicBeat = CONDITIONAL_STORY.find((c) => c.flag === 'panic50').text;
        expect(s.log.filter((l) => l.text === panicBeat)).toHaveLength(1);
        run(s, 1);
        expect(s.log.filter((l) => l.text === panicBeat)).toHaveLength(1);
        expect(s.story.flags.panic50).toBe(true);
    });
});
