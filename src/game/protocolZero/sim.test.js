import { describe, expect, it } from 'vitest';
import {
    breachResolve,
    buyTech,
    chooseDilemma,
    createSim,
    firewallCost,
    incomePerSecond,
    packetArrive,
    popBubble,
    purge,
    PURGE_VICTORY_DAY,
    snapshot,
    summary,
    tick,
    toggleIsolate,
    upgradeFirewall,
} from './sim';
import { BUBBLES, COSTS, DAY_SECONDS, DIFFICULTIES, DILEMMAS, NEIGHBORS, NODES, TECH_TREE } from './constants';

const run = (s, seconds, step = 0.25) => {
    const events = [];
    for (let t = 0; t < seconds; t += step) events.push(...tick(s, step));
    return events;
};

const infected = (s) => Object.values(s.nodes).filter((n) => n.infection > 0);

describe('createSim', () => {
    it('14 düğüm, zorluğa göre başlangıç bütçesi ve enfekte düğüm sayısı', () => {
        for (const key of Object.keys(DIFFICULTIES)) {
            const s = createSim(key, { seed: 7 });
            expect(Object.keys(s.nodes)).toHaveLength(14);
            expect(s.budget).toBe(DIFFICULTIES[key].startBudget);
            expect(infected(s)).toHaveLength(DIFFICULTIES[key].initialInfected);
            expect(s.status).toBe('running');
            expect(s.log[0].kind).toBe('alert');
        }
    });

    it('aynı tohum aynı sonucu verir (determinizm)', () => {
        const a = createSim('hard', { seed: 42 });
        const b = createSim('hard', { seed: 42 });
        run(a, 60);
        run(b, 60);
        expect(snapshot(a)).toEqual(snapshot(b));
    });

    it('bilinmeyen zorluk normale düşer', () => {
        expect(createSim('yok', { seed: 1 }).difficulty).toBe('normal');
    });
});

describe('veri', () => {
    it('komşuluk simetrik ve her düğümün en az bir komşusu var', () => {
        for (const n of NODES) {
            expect(NEIGHBORS[n.id].length).toBeGreaterThan(0);
            for (const nb of NEIGHBORS[n.id]) expect(NEIGHBORS[nb]).toContain(n.id);
        }
    });

    it('savunma ağacı 3 kategori × 3 geliştirme, ikilemler en az 6 kart', () => {
        expect(TECH_TREE).toHaveLength(3);
        for (const c of TECH_TREE) expect(c.items).toHaveLength(3);
        expect(DILEMMAS.length).toBeGreaterThanOrEqual(6);
        for (const d of DILEMMAS) expect(d.options).toHaveLength(2);
    });
});

describe('yayılım', () => {
    it('enfekte düğüm komşularına sızar; izole komşuya sızamaz', () => {
        const s = createSim('normal', { seed: 3 });
        for (const n of Object.values(s.nodes)) n.infection = 0;
        s.nodes.fra.infection = 60;
        s.nodes.lon.isolated = true;
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        run(s, 20);
        expect(s.nodes.ist.infection).toBeGreaterThan(0);
        expect(s.nodes.vir.infection).toBeGreaterThan(0);
        expect(s.nodes.lon.infection).toBe(0);
        // Komşu olmayan Sidney'e doğrudan sızma yok (yalnızca zincirle, 20 sn'de henüz değil)
        expect(s.nodes.syd.infection).toBe(0);
        expect(s.nodes.fra.infection).toBeGreaterThan(60);
    });

    it('yüksek firewall sızmayı yavaşlatır', () => {
        const make = (fw) => {
            const s = createSim('normal', { seed: 5 });
            for (const n of Object.values(s.nodes)) n.infection = 0;
            s.nodes.fra.infection = 80;
            s.nodes.ist.firewall = fw;
            s.timers.nextReseed = 1e9;
            s.timers.nextBreach = 1e9;
            s.timers.nextDilemma = 1e9;
            run(s, 10);
            return s.nodes.ist.infection;
        };
        expect(make(1)).toBeGreaterThan(make(5) * 2);
    });

    it('gün ilerler ve YZ zamanla arka kapı açar', () => {
        const s = createSim('normal', { seed: 9 });
        for (const n of Object.values(s.nodes)) n.infection = 0;
        s.timers.nextReseed = 1;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        const events = run(s, DAY_SECONDS * 3 + 1);
        expect(s.day).toBeGreaterThanOrEqual(4);
        expect(events.some((e) => e.type === 'day')).toBe(true);
        expect(events.some((e) => e.type === 'reseed')).toBe(true);
        expect(s.stats.reseeds).toBeGreaterThan(0);
    });
});

describe('düğüm aksiyonları', () => {
    it('firewall yükseltme maliyeti seviye × 120, en fazla 5', () => {
        const s = createSim('normal', { seed: 1 });
        s.budget = 10000;
        const n = s.nodes.cai; // başlangıç 1
        expect(firewallCost(n)).toBe(120);
        expect(upgradeFirewall(s, 'cai')).toEqual({ ok: true, cost: 120 });
        expect(n.firewall).toBe(2);
        expect(firewallCost(n)).toBe(240);
        while (n.firewall < COSTS.maxFirewall) upgradeFirewall(s, 'cai');
        expect(upgradeFirewall(s, 'cai').ok).toBe(false);
        expect(s.budget).toBe(10000 - 120 - 240 - 360 - 480);
    });

    it('bütçe yetmezse yükseltme ve temizlik reddedilir', () => {
        const s = createSim('normal', { seed: 1 });
        s.budget = 50;
        expect(upgradeFirewall(s, 'ist').reason).toBe('Yetersiz bütçe.');
        s.nodes.ist.infection = 50;
        expect(purge(s, 'ist').reason).toBe('Yetersiz bütçe.');
    });

    it('temizlik enfeksiyonu 25 puan düşürür, temiz düğümde çalışmaz', () => {
        const s = createSim('normal', { seed: 1 });
        s.budget = 1000;
        s.nodes.ist.infection = 40;
        expect(purge(s, 'ist').ok).toBe(true);
        expect(s.nodes.ist.infection).toBe(15);
        expect(s.budget).toBe(850);
        purge(s, 'ist');
        expect(s.nodes.ist.infection).toBe(0);
        expect(purge(s, 'ist').reason).toBe('Düğüm zaten temiz.');
    });

    it('izole etmek paniği artırır, gelirini keser; sıkıyönetimde anlık panik yok', () => {
        const s = createSim('normal', { seed: 1 });
        const before = incomePerSecond(s);
        expect(toggleIsolate(s, 'svl')).toEqual({ ok: true, isolated: true });
        expect(s.panic).toBe(6);
        expect(incomePerSecond(s)).toBeLessThan(before);
        expect(toggleIsolate(s, 'svl').isolated).toBe(false);

        const m = createSim('normal', { seed: 1 });
        m.techs.martial = true;
        toggleIsolate(m, 'svl');
        expect(m.panic).toBe(0);
    });

    it('izole düğümler zamanla küresel paniği yükseltir', () => {
        const s = createSim('normal', { seed: 1 });
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        for (const id of ['svl', 'vir', 'fra', 'lon']) toggleIsolate(s, id);
        const p0 = s.panic;
        run(s, 20);
        expect(s.panic).toBeGreaterThan(p0);
    });
});

describe('savunma ağacı', () => {
    it('ön koşul zinciri ve maliyet', () => {
        const s = createSim('normal', { seed: 1 });
        s.budget = 5000;
        expect(buyTech(s, 'decrypt2').ok).toBe(false);
        expect(buyTech(s, 'decrypt1')).toEqual({ ok: true, cost: 400 });
        expect(buyTech(s, 'decrypt1').reason).toBe('Zaten alındı.');
        expect(buyTech(s, 'decrypt2').ok).toBe(true);
        expect(buyTech(s, 'quantum').ok).toBe(true);
        expect(s.budget).toBe(5000 - 400 - 650 - 950);
        expect(s.stats.techs).toBe(3);
        expect(buyTech(s, 'yok').ok).toBe(false);
    });

    it('hızlandırıcılar deşifreyi, fon geliri artırır; hunter botlar temizler', () => {
        const s = createSim('normal', { seed: 1 });
        s.budget = 99999;
        s.timers.nextReseed = 1e9;
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        tick(s, 0.1);
        const d0 = s.rates.decrypt;
        const i0 = s.rates.income;
        buyTech(s, 'decrypt1');
        buyTech(s, 'fund');
        tick(s, 0.1);
        expect(s.rates.decrypt).toBeGreaterThan(d0 * 1.8);
        expect(s.rates.income).toBeGreaterThan(i0 * 1.3);

        const h = createSim('normal', { seed: 1 });
        for (const n of Object.values(h.nodes)) n.infection = 0;
        h.nodes.ist.infection = 30;
        h.nodes.ist.firewall = 5;
        h.techs.hunter = true;
        h.timers.nextReseed = 1e9;
        h.timers.nextBreach = 1e9;
        h.timers.nextDilemma = 1e9;
        run(h, 10);
        expect(h.nodes.ist.infection).toBeLessThan(30);
    });
});

describe('kriz kartları', () => {
    it('ikilem oyunu durdurur, seçim etkisini uygular ve kartı kapatır', () => {
        const s = createSim('normal', { seed: 11 });
        s.timers.nextDilemma = 0.1;
        s.timers.nextBreach = 1e9;
        s.timers.nextReseed = 1e9;
        const ev = run(s, 1);
        expect(ev.some((e) => e.type === 'dilemma')).toBe(true);
        expect(s.dilemma).not.toBeNull();
        const t0 = s.time;
        tick(s, 1);
        expect(s.time).toBe(t0); // ikilem beklerken zaman akmaz
        const res = chooseDilemma(s, 0);
        expect(res.ok).toBe(true);
        expect(typeof res.text).toBe('string');
        expect(s.dilemma).toBeNull();
        expect(s.stats.dilemmas).toBe(1);
        expect(chooseDilemma(s, 0).ok).toBe(false);
    });

    it('her kartın her seçeneği çökmeden uygulanır', () => {
        for (const card of DILEMMAS) {
            for (let i = 0; i < 2; i++) {
                const s = createSim('hard', { seed: 99 });
                s.dilemma = card;
                expect(chooseDilemma(s, i).ok).toBe(true);
                expect(s.panic).toBeGreaterThanOrEqual(0);
                expect(s.budget).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('sıfırıncı gün saldırısı', () => {
    const setup = () => {
        const s = createSim('normal', { seed: 21 });
        s.timers.nextBreach = 0.1;
        s.timers.nextDilemma = 1e9;
        s.timers.nextReseed = 1e9;
        const ev = run(s, 0.5);
        expect(ev.some((e) => e.type === 'breach')).toBe(true);
        expect(s.breach).not.toBeNull();
        expect(s.breach.total).toBe(DIFFICULTIES.normal.breachSeconds);
        return s;
    };

    it('müdahale edilmezse düğüm %100 düşer', () => {
        const s = setup();
        const id = s.breach.nodeId;
        const ev = run(s, DIFFICULTIES.normal.breachSeconds + 1);
        expect(ev.some((e) => e.type === 'breachLost' && e.nodeId === id)).toBe(true);
        expect(s.nodes[id].infection).toBe(100);
        expect(s.breach).toBeNull();
        expect(s.stats.breachesLost).toBe(1);
    });

    it('başarılı mini oyun düğümü sıfırlar, +150₵ verir ve paniği düşürür', () => {
        const s = setup();
        s.panic = 20;
        const id = s.breach.nodeId;
        const b0 = s.budget;
        expect(breachResolve(s, true)).toEqual({ ok: true, success: true });
        expect(s.nodes[id].infection).toBe(0);
        expect(s.budget).toBe(b0 + 150);
        expect(s.panic).toBe(15);
        expect(s.stats.breachesWon).toBe(1);
        expect(breachResolve(s, true).ok).toBe(false);
    });

    it('başarısız mini oyun düğümü YZ kontrolüne verir', () => {
        const s = setup();
        const id = s.breach.nodeId;
        breachResolve(s, false);
        expect(s.nodes[id].infection).toBe(100);
    });

    it('sıfırıncı gün kalkanı geri sayımı 4 sn uzatır', () => {
        const s = createSim('normal', { seed: 21 });
        s.techs.zeroday = true;
        s.timers.nextBreach = 0.1;
        s.timers.nextDilemma = 1e9;
        s.timers.nextReseed = 1e9;
        run(s, 0.5);
        expect(s.breach.total).toBe(DIFFICULTIES.normal.breachSeconds + 4);
    });
});

describe('baloncuklar ve veri paketleri', () => {
    const quiet = (s) => {
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        s.timers.nextReseed = 1e9;
        return s;
    };

    it('mavi veri baloncuğu temiz bir düğümde belirir, patlatılınca ₵ ve deşifre verir, süresi dolunca kaybolur', () => {
        const s = quiet(createSim('normal', { seed: 4 }));
        s.timers.nextDataBubble = 0.1;
        const ev = run(s, 0.5);
        const spawn = ev.find((e) => e.type === 'bubble' && e.bubble.kind === 'data');
        expect(spawn).toBeDefined();
        expect(s.nodes[spawn.bubble.nodeId].infection).toBeLessThan(50);
        const b0 = s.budget;
        const d0 = s.decrypt;
        expect(popBubble(s, spawn.bubble.id)).toMatchObject({ ok: true, kind: 'data', budget: BUBBLES.dataBudget });
        expect(s.budget).toBe(b0 + BUBBLES.dataBudget);
        expect(s.decrypt).toBeCloseTo(d0 + BUBBLES.dataDecrypt);
        expect(popBubble(s, spawn.bubble.id).ok).toBe(false);

        s.timers.nextDataBubble = 0.1;
        const ev2 = run(s, 0.5);
        const b = ev2.find((e) => e.type === 'bubble').bubble;
        s.timers.nextDataBubble = 1e9;
        const ev3 = run(s, BUBBLES.dataTtl + 1);
        expect(ev3.some((e) => e.type === 'bubbleExpired' && e.id === b.id)).toBe(true);
        expect(s.bubbles.find((x) => x.id === b.id)).toBeUndefined();
    });

    it('bir düğüm ilk kez enfekte olunca kızıl sızma baloncuğu çıkar; patlatılırsa düğüm temizlenir', () => {
        const s = quiet(createSim('normal', { seed: 4 }));
        s.timers.nextDataBubble = 1e9;
        for (const n of Object.values(s.nodes)) n.infection = 0;
        s.nodes.fra.infection = 70;
        s.nodes.fra.firewall = 1;
        const ev = run(s, 2);
        const spawn = ev.find((e) => e.type === 'bubble' && e.bubble.kind === 'breach');
        expect(spawn).toBeDefined();
        expect(NEIGHBORS.fra).toContain(spawn.bubble.nodeId);
        expect(spawn.bubble.ttl).toBe(BUBBLES.breachTtl);
        expect(s.nodes[spawn.bubble.nodeId].infection).toBeGreaterThan(0);
        expect(popBubble(s, spawn.bubble.id)).toMatchObject({ ok: true, kind: 'breach' });
        expect(s.nodes[spawn.bubble.nodeId].infection).toBe(0);
        expect(s.stats.breachBubbles).toBe(1);
        expect(s.bubbles.filter((b) => b.kind === 'breach').length).toBeLessThanOrEqual(NEIGHBORS.fra.length);
    });

    it('kızıl paket enfekte kaynaktan hedefe varınca küçük sızma ekler; temiz/izole kaynakta eklemez', () => {
        const s = quiet(createSim('normal', { seed: 1 }));
        for (const n of Object.values(s.nodes)) n.infection = 0;
        s.nodes.fra.infection = 60;
        expect(packetArrive(s, 'fra', 'lon')).toBe(true);
        expect(s.nodes.lon.infection).toBeGreaterThan(0);
        expect(s.nodes.lon.infection).toBeLessThan(5);
        expect(packetArrive(s, 'lon', 'rek')).toBe(false);
        s.nodes.fra.isolated = true;
        expect(packetArrive(s, 'fra', 'ist')).toBe(false);
        expect(s.stats.packets).toBe(1);
    });

    it('snapshot sunucu sayaçlarını ve bayrağı taşır', () => {
        const s = createSim('normal', { seed: 1 });
        s.nodes.svl.infection = 50;
        const svl = snapshot(s).nodes.find((n) => n.id === 'svl');
        expect(svl.flag).toBe('🇺🇸');
        expect(svl.servers).toBe(200 * 7400);
        expect(svl.infectedServers).toBe(200 * 7400 * 0.5);
    });
});

describe('zafer / yenilgi', () => {
    const quiet = (s) => {
        s.timers.nextBreach = 1e9;
        s.timers.nextDilemma = 1e9;
        s.timers.nextReseed = 1e9;
        return s;
    };

    it('deşifre %100 → zafer (decrypt), sonra tick etkisiz', () => {
        const s = quiet(createSim('normal', { seed: 1 }));
        s.decrypt = 99.99;
        s.techs.quantum = true;
        const ev = run(s, 5);
        expect(ev.some((e) => e.type === 'victory' && e.victoryType === 'decrypt')).toBe(true);
        expect(s.status).toBe('victory');
        const snap = snapshot(s);
        tick(s, 1);
        expect(snapshot(s).time).toBe(snap.time);
        expect(summary(s).outcome).toBe('victory');
        expect(summary(s).decrypt).toBe(100);
    });

    it('tam temizlik yalnızca 30. günden sonra zafer sayılır', () => {
        const s = quiet(createSim('normal', { seed: 1 }));
        for (const n of Object.values(s.nodes)) n.infection = 0;
        tick(s, 0.1);
        expect(s.status).toBe('running');
        s.time = DAY_SECONDS * (PURGE_VICTORY_DAY - 1) + 0.1;
        tick(s, 0.1);
        expect(s.status).toBe('victory');
        expect(s.victoryType).toBe('purge');
        expect(summary(s).nodesSaved).toBe(14);
    });

    it('panik %100 → yenilgi', () => {
        const s = quiet(createSim('normal', { seed: 1 }));
        s.panic = 99.9;
        for (const id of ['svl', 'vir', 'fra', 'lon', 'tyo']) s.nodes[id].isolated = true;
        run(s, 3);
        expect(s.status).toBe('defeat');
        expect(s.defeatReason).toBe('panic');
    });

    it('YZ hakimiyeti ≥ %99 → yenilgi', () => {
        const s = quiet(createSim('normal', { seed: 1 }));
        for (const n of Object.values(s.nodes)) n.infection = 99.5;
        tick(s, 0.1);
        expect(s.status).toBe('defeat');
        expect(s.defeatReason).toBe('dominance');
        expect(summary(s).nodesSaved).toBeLessThanOrEqual(14);
    });

    it('savunmasız oyun kâbusta eninde sonunda kaybeder; snapshot alanları tutarlı', () => {
        const s = createSim('nightmare', { seed: 5 });
        let guard = 0;
        while (s.status === 'running' && guard < 20000) {
            const ev = tick(s, 0.5);
            if (s.dilemma) chooseDilemma(s, 1);
            if (ev.some((e) => e.type === 'breach')) breachResolve(s, false);
            guard++;
        }
        expect(s.status).toBe('defeat');
        const snap = snapshot(s);
        expect(snap.nodes).toHaveLength(14);
        expect(snap.dominance).toBeGreaterThanOrEqual(0);
        expect(snap.dominance).toBeLessThanOrEqual(100);
        expect(snap.log.length).toBeGreaterThan(0);
        for (const n of snap.nodes) expect(['safe', 'warn', 'lost', 'isolated']).toContain(n.status);
    });
});
