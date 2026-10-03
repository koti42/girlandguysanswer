import { describe, expect, it } from 'vitest';
import { TC, createTowerSim, offsetAt, replayTower, speedFor, towerStateHash } from './index.js';
import { runTowerBot } from './bot.js';

/*
 * Kural testleri (şartname §B.1). Kat 1-3 hızı 60 mm/tick: off(t) = -4500 + 60t
 * (ilk yaklaşma), t = 75'te off = 0. Kat 1 tick 0'da doğar.
 */

const T_AT = (off) => (off + TC.R) / 60; // v = 60 iken bu ofsetin t'si

/** Olayları kopyalar (dizi ve nesneler yeniden kullanılıyor). */
function copyEvents(events, tick) {
    return events.map((e) => ({ ...e, cut: e.cut ? { ...e.cut } : null, tick }));
}

/** Hareketli kat state.t === t olana kadar adımlar, sonra dokunur; o adımın olaylarını döner. */
function tapAt(sim, t, log) {
    const s = sim.state;
    let guard = 0;
    while (!(s.phase === 'moving' && s.t === t)) {
        const tick = s.tick;
        const ev = copyEvents(sim.step(), tick);
        if (log) log.push(...ev);
        if (++guard > 20000 || s.phase === 'over') throw new Error('kat dokunulabilir hale gelmedi');
    }
    expect(sim.input('T')).toBe(true);
    const tick = s.tick;
    const ev = copyEvents(sim.step(), tick);
    if (log) log.push(...ev);
    return ev;
}

/** n adım; girdisiz. */
function steps(sim, n, log) {
    for (let i = 0; i < n; i++) {
        const tick = sim.state.tick;
        const ev = copyEvents(sim.step(), tick);
        if (log) log.push(...ev);
    }
}

describe('başlangıç ve doğma', () => {
    it('taban 3000 × 3000, kat 1 tick 0\'da x ekseninde −R\'de doğar', () => {
        const sim = createTowerSim({ questionCount: 0 });
        const s = sim.state;
        expect(s.phase).toBe('spawn');
        expect(s.floor).toBe(0);
        expect(s.prev).toEqual({ x0: -1500, x1: 1500, z0: -1500, z1: 1500 });
        const ev = copyEvents(sim.step(), 0);
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ type: 'spawn', floor: 1, axis: 'x' });
        expect(s).toMatchObject({ phase: 'moving', t: 0, off: -4500, v: 60, axis: 'x', tick: 1 });
        steps(sim, 1);
        expect(s.t).toBe(1);
        expect(s.off).toBe(-4440);
    });

    it('yerleştirmeden SPAWN_DELAY tick sonra yeni kat (z ekseni) doğar', () => {
        const sim = createTowerSim();
        const ev = tapAt(sim, 75);
        const placedTick = ev[0].tick;
        const log = [];
        steps(sim, TC.SPAWN_DELAY, log);
        const sp = log.filter((e) => e.type === 'spawn');
        expect(sp).toHaveLength(1);
        expect(sp[0]).toMatchObject({ floor: 2, axis: 'z', tick: placedTick + TC.SPAWN_DELAY });
        expect(sim.state.axis).toBe('z');
        expect(sim.state.off).toBe(-TC.R);
    });

    it('doğma beklemesinde T etkisiz ama kaydedilir', () => {
        const sim = createTowerSim();
        tapAt(sim, 75);
        const s = sim.state;
        expect(s.phase).toBe('spawn');
        const before = towerStateHash(s);
        for (let i = 0; i < TC.SPAWN_DELAY - 1; i++) {
            expect(sim.input('T')).toBe(true);
            sim.step();
            expect(s.floor).toBe(1);
            expect(s.crashed).toBe(false);
        }
        expect(sim.inputCount()).toBe(1 + TC.SPAWN_DELAY - 1);
        // Doğma adımındaki T de etkisiz (girdiler fazdan önce işlenir).
        expect(sim.input('T')).toBe(true);
        const ev = copyEvents(sim.step(), 0);
        expect(ev.map((e) => e.type)).toEqual(['spawn']);
        expect(s.phase).toBe('moving');
        expect(towerStateHash(s)).not.toBe(before);
        // Doğduktan hemen sonra dokunmak: off = −4500, |off| ≥ 3000 → ıska.
        sim.input('T');
        const miss = copyEvents(sim.step(), 0);
        expect(miss[0]).toMatchObject({ type: 'miss', floor: 2 });
    });
});

describe('yerleştirme', () => {
    it('mükemmel: off = 0, aralık aynen, combo 1, büyüme yok', () => {
        const sim = createTowerSim();
        const ev = tapAt(sim, T_AT(0));
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ type: 'place', floor: 1, perfect: true, combo: 1, grew: 0, cut: null });
        expect(sim.state.prev).toEqual({ x0: -1500, x1: 1500, z0: -1500, z1: 1500 });
        expect(sim.state.basePoints).toBe(10 + 5);
        expect(sim.state.perfects).toBe(1);
    });

    it('|off| ≤ 90 mükemmel sayılır (off 60), 120 sayılmaz', () => {
        const a = createTowerSim();
        expect(tapAt(a, T_AT(60))[0].perfect).toBe(true);
        expect(a.state.prev.x0).toBe(-1500);

        const b = createTowerSim();
        const ev = tapAt(b, T_AT(120))[0];
        expect(ev.perfect).toBe(false);
        expect(ev.combo).toBe(0);
        expect(ev.cut).toEqual({ axis: 'x', from: 1500, to: 1620 });
        expect(b.state.prev).toEqual({ x0: -1380, x1: 1500, z0: -1500, z1: 1500 });
        expect(b.state.basePoints).toBe(10);
    });

    it('kırpma: önceki ∩ (önceki + off), iki yönde de', () => {
        const sim = createTowerSim();
        // Kat 1 (x): off = +300 → [−1200, 1500], düşen [1500, 1800]
        let ev = tapAt(sim, T_AT(300))[0];
        expect(ev.cut).toEqual({ axis: 'x', from: 1500, to: 1800 });
        expect(sim.state.prev).toEqual({ x0: -1200, x1: 1500, z0: -1500, z1: 1500 });
        // Kat 2 (z): off = −600 → [−1500, 900], düşen [−2100, −1500]
        ev = tapAt(sim, T_AT(-600))[0];
        expect(ev.cut).toEqual({ axis: 'z', from: -2100, to: -1500 });
        expect(sim.state.prev).toEqual({ x0: -1200, x1: 1500, z0: -1500, z1: 900 });
        // Kat 3 (x): x aralığı 2700 boyunda; off = −2640 → [−1200, −1140]
        ev = tapAt(sim, T_AT(-2640))[0];
        expect(ev.cut).toEqual({ axis: 'x', from: -3840, to: -1200 });
        expect(sim.state.prev).toEqual({ x0: -1200, x1: -1140, z0: -1500, z1: 900 });
        expect(sim.state.floor).toBe(3);
        expect(sim.state.basePoints).toBe(30);
    });

    it('ıska: |off| ≥ boy → oyun biter, floor değişmez', () => {
        const sim = createTowerSim();
        tapAt(sim, T_AT(300));
        const ev = tapAt(sim, T_AT(-3000)); // z boyu 3000, |off| == 3000
        expect(ev).toHaveLength(1);
        expect(ev[0]).toMatchObject({ type: 'miss', floor: 2 });
        const s = sim.state;
        expect(s).toMatchObject({ crashed: true, phase: 'over', floor: 1, off: -3000 });
        expect(s.crashTick).toBe(s.tick - 1);
        expect(sim.input('T')).toBe(false);
        const h = towerStateHash(s);
        expect(sim.step()).toHaveLength(0);
        expect(towerStateHash(s)).toBe(h);
    });

    it('dar katta |off| ≤ 90 olsa da örtüşme yoksa ıska (ıska önce)', () => {
        const sim = createTowerSim();
        tapAt(sim, T_AT(2940)); // x: [1440, 1500], boy 60
        expect(sim.state.prev.x1 - sim.state.prev.x0).toBe(60);
        tapAt(sim, T_AT(0)); // kat 2 (z) mükemmel
        const ev = tapAt(sim, T_AT(60)); // kat 3 (x): |off| = 60 ≤ 90 ama 60 ≥ boy
        expect(ev[0]).toMatchObject({ type: 'miss', floor: 3 });
        expect(sim.state.floor).toBe(2);
    });

    it('büyüme: combo ≥ 2 iken her yana 60, merkez korunur, boy ≤ 3000', () => {
        const sim = createTowerSim();
        tapAt(sim, T_AT(600)); // x: [−900, 1500] (2400)
        tapAt(sim, T_AT(-300)); // z: [−1500, 1200] (2700)
        let ev = tapAt(sim, T_AT(0))[0]; // x, combo 1: büyüme yok
        expect(ev).toMatchObject({ perfect: true, combo: 1, grew: 0 });
        expect(sim.state.prev.x0).toBe(-900);
        ev = tapAt(sim, Math.round(4500 / 62))[0]; // z, combo 2: z her yana 60
        expect(ev).toMatchObject({ perfect: true, combo: 2, grew: 60 });
        expect(sim.state.prev).toEqual({ x0: -900, x1: 1500, z0: -1560, z1: 1260 });
        expect(sim.state.basePoints).toBe(10 + 10 + 15 + 20);
    });

    it('büyüme sınırı: 3000\'e kalan açık kadar büyür, merkez korunur', () => {
        const sim = createTowerSim();
        tapAt(sim, T_AT(180)); // x: [−1320, 1500] (2820), merkez 90
        tapAt(sim, T_AT(0)); // z, combo 1
        let ev = tapAt(sim, T_AT(0))[0]; // x, combo 2 → [−1380, 1560] (2940)
        expect(ev.grew).toBe(60);
        ev = tapAt(sim, 73)[0]; // z (v 62, off 26), combo 3: z zaten 3000 → büyümez
        expect(ev).toMatchObject({ perfect: true, combo: 3, grew: 0 });
        ev = tapAt(sim, 73)[0]; // x, combo 4: açık 60 → her yana 30
        expect(ev).toMatchObject({ perfect: true, combo: 4, grew: 30 });
        expect(sim.state.prev).toEqual({ x0: -1410, x1: 1590, z0: -1500, z1: 1500 });
        // Uzun mükemmel seri boyunca boy 3000'de kalır
        runTowerBot(sim, { mode: 'perfect', maxFloors: 60 });
        expect(sim.state.prev).toEqual({ x0: -1410, x1: 1590, z0: -1500, z1: 1500 });
        expect(sim.state.maxCombo).toBe(59); // kat 1 kırpıldı, 2..60 mükemmel
    });

    it('hızlar çift, ofsetler çift → boylar hep çift (büyüme yarım birim üretmez)', () => {
        const odd = [];
        for (let k = 1; k <= 200; k++) {
            const v = speedFor(k);
            if (v % 2 !== 0) odd.push(['v', k]);
            for (let t = 0; t < 400; t++) if (offsetAt(t, v) % 2 !== 0) odd.push([k, t]);
        }
        expect(odd).toEqual([]);
    });

    it('puan: 10 + mükemmelde 5 × min(combo, 10)', () => {
        const sim = runTowerBot(createTowerSim(), { mode: 'perfect', maxFloors: 15 });
        let expected = 0;
        for (let c = 1; c <= 15; c++) expected += 10 + 5 * Math.min(c, 10);
        expect(sim.state.basePoints).toBe(expected);
        expect(sim.state.perfects).toBe(15);
    });
});

describe('aralık kesişimi her zaman tamsayı', () => {
    it('rastgele ve insan botları boyunca aralıklar tamsayı ve iç içe', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const sim = createTowerSim({ questionCount: 20 });
            const s = sim.state;
            let px = s.prev.x1 - s.prev.x0;
            let pz = s.prev.z1 - s.prev.z0;
            for (let guard = 0; guard < 30000 && !s.crashed; guard++) {
                runTowerBot(sim, { mode: 'human', jitter: 3, botSeed: seed * 1000 + s.floor, maxFloors: s.floor + 1 });
                const p = s.prev;
                for (const v of [p.x0, p.x1, p.z0, p.z1]) expect(Number.isInteger(v)).toBe(true);
                const wx = p.x1 - p.x0;
                const wz = p.z1 - p.z0;
                expect(wx).toBeGreaterThan(0);
                expect(wz).toBeGreaterThan(0);
                expect(wx).toBeLessThanOrEqual(3000);
                expect(wz).toBeLessThanOrEqual(3000);
                // Bir katta yalnızca bir eksen değişir; büyüme en fazla 120.
                expect(wx === px || wz === pz).toBe(true);
                expect(wx - px).toBeLessThanOrEqual(120);
                expect(wz - pz).toBeLessThanOrEqual(120);
                px = wx;
                pz = wz;
            }
            expect(s.crashed).toBe(true);
        }
    });
});

describe('soru katları', () => {
    it('kat 12 yerleşince soru açılır, T yok sayılır, A şık 0', () => {
        const sim = createTowerSim({ questionCount: 3 });
        const log = [];
        runTowerBot(sim, { mode: 'perfect', maxFloors: 12 });
        const s = sim.state;
        expect(s.floor).toBe(12);
        expect(s.phase).toBe('question');
        expect(s.qIndex).toBe(0);
        expect(s.qt).toBe(0);
        const h = towerStateHash(s);
        // Soru sırasında T: kaydedilir, etkisiz
        for (let i = 0; i < 30; i++) {
            expect(sim.input('T')).toBe(true);
            steps(sim, 1, log);
        }
        expect(s.phase).toBe('question');
        expect(s.floor).toBe(12);
        expect(s.qt).toBe(30);
        expect(log).toHaveLength(0);
        expect(towerStateHash(s)).not.toBe(h); // yalnız tick değişti
        sim.input('A');
        const tick = s.tick;
        steps(sim, 1, log);
        expect(log).toEqual([expect.objectContaining({ type: 'answer', index: 0, choice: 0, tick })]);
        expect(s.answers).toEqual([{ index: 0, choice: 0, tick }]);
        expect(s.qIndex).toBe(1);
        expect(s.phase).toBe('spawn');
        steps(sim, TC.SPAWN_DELAY, log);
        expect(log[log.length - 1]).toMatchObject({ type: 'spawn', floor: 13, tick: tick + TC.SPAWN_DELAY });
    });

    it('soru olayı yerleştirmeyle aynı adımda; aynı adımda B cevabı da işlenir', () => {
        const sim = createTowerSim({ questionCount: 1 });
        runTowerBot(sim, { mode: 'perfect', maxFloors: 11 });
        const s = sim.state;
        const log = [];
        // Kat 12'yi yerleştiren adımda T + B
        while (!(s.phase === 'moving' && Math.abs(s.off) <= TC.PERFECT)) steps(sim, 1);
        sim.input('T');
        sim.input('B');
        expect(sim.input('A')).toBe(false); // tick başına en fazla 2
        steps(sim, 1, log);
        expect(log.map((e) => e.type)).toEqual(['place', 'question', 'answer']);
        expect(log[1].index).toBe(0);
        expect(log[2]).toMatchObject({ index: 0, choice: 1 });
        expect(s.phase).toBe('spawn');
    });

    it('480 tick içinde cevap yoksa cevapsız (−1), sonra devam', () => {
        const sim = createTowerSim({ questionCount: 20 });
        runTowerBot(sim, { mode: 'perfect', maxFloors: 12 });
        const s = sim.state;
        const qTick = s.tick - 1; // soru katının yerleştiği adım
        const log = [];
        steps(sim, TC.QUESTION_TICKS - 1, log);
        expect(s.phase).toBe('question');
        expect(log).toHaveLength(0);

        // Son tick'te gelen cevap hâlâ sayılır (girdiler fazdan önce)
        const late = sim.clone();
        late.input('A');
        late.step();
        expect(late.state.answers).toEqual([{ index: 0, choice: 0, tick: qTick + TC.QUESTION_TICKS }]);

        steps(sim, 1, log);
        expect(log).toEqual([expect.objectContaining({ type: 'answer', index: 0, choice: -1, tick: qTick + TC.QUESTION_TICKS })]);
        expect(s.answers).toEqual([{ index: 0, choice: -1, tick: qTick + TC.QUESTION_TICKS }]);
        expect(s.phase).toBe('spawn');
        expect(s.qIndex).toBe(1);
        sim.input('B'); // artık soru yok: etkisiz
        steps(sim, TC.SPAWN_DELAY, log);
        expect(s.answers).toHaveLength(1);
        expect(log[log.length - 1]).toMatchObject({ type: 'spawn', floor: 13 });
    });

    it('soru dışında A/B etkisiz; kota dolunca soru gelmez', () => {
        const sim = createTowerSim({ questionCount: 1 });
        const s = sim.state;
        steps(sim, 10);
        sim.input('A');
        sim.input('B');
        steps(sim, 1);
        expect(s.answers).toHaveLength(0);
        expect(s.phase).toBe('moving');
        expect(s.t).toBe(10); // A/B faz ilerlemesini durdurmaz
        runTowerBot(sim, { mode: 'perfect', maxFloors: 30, answerAfter: 5 });
        expect(s.answers).toHaveLength(1);
        expect(s.qIndex).toBe(1);
        expect(s.floor).toBe(30);

        const none = runTowerBot(createTowerSim({ questionCount: 0 }), { mode: 'perfect', maxFloors: 30 });
        expect(none.state.answers).toHaveLength(0);
    });

    it('20 soru: 12, 24, … 240. katlarda', () => {
        const sim = createTowerSim({ questionCount: 20 });
        const floors = [];
        const s = sim.state;
        while (s.floor < 260) {
            runTowerBot(sim, { mode: 'perfect', maxFloors: s.floor + 1, answerAfter: 3 });
            if (s.phase === 'question') floors.push(s.floor);
        }
        expect(floors).toEqual([...Array(20).keys()].map((i) => (i + 1) * 12));
        expect(s.qIndex).toBe(20);
    });
});

describe('girdi kabulü', () => {
    it('geçersiz kod, tick başına 2, kayıt sınırı', () => {
        const sim = createTowerSim();
        expect(sim.input('J')).toBe(false);
        expect(sim.input('t')).toBe(false);
        expect(sim.input('T')).toBe(true);
        expect(sim.input('A')).toBe(true);
        expect(sim.input('B')).toBe(false);
        expect(sim.inputCount()).toBe(2);
        expect(sim.encodeInputs()).toBe('0T,0A');
        sim.step();
        // 6000 sınırı: soru katı yok, beklemede/soru dışında etkisiz A ile doldur
        for (let i = 0; i < 5998; i++) {
            expect(sim.input('A')).toBe(true);
            if (i % 2 === 1) sim.step();
        }
        expect(sim.inputCount()).toBe(6000);
        expect(sim.input('A')).toBe(false);
        expect(sim.input('T')).toBe(false);
        expect(() => replayTower({ questionCount: 0, inputs: sim.encodeInputs(), endTick: sim.state.tick })).not.toThrow();
    });

    it('geçersiz soru sayısı', () => {
        expect(() => createTowerSim({ questionCount: -1 })).toThrow(RangeError);
        expect(() => createTowerSim({ questionCount: 256 })).toThrow(RangeError);
        expect(() => createTowerSim({ questionCount: 1.5 })).toThrow(RangeError);
        expect(() => createTowerSim({ questionCount: '3' })).toThrow(RangeError);
        expect(createTowerSim().questionCount).toBe(0);
    });
});

describe('MAX_TICKS', () => {
    it('108000 tick sonra step hiçbir şey yapmaz, girdi alınmaz', () => {
        const sim = createTowerSim({ questionCount: 20 });
        const s = sim.state;
        // Girdisiz: kat sonsuza dek gider-gelir (oyun bitmez)
        for (let i = 0; i < TC.MAX_TICKS + 50; i++) sim.step();
        expect(s.tick).toBe(TC.MAX_TICKS);
        expect(s.phase).toBe('moving');
        expect(s.t).toBe(TC.MAX_TICKS - 1);
        expect(s.crashed).toBe(false);
        expect(sim.input('T')).toBe(false);
        const r = replayTower({ questionCount: 20, inputs: '', endTick: TC.MAX_TICKS });
        expect(r.endTick).toBe(TC.MAX_TICKS);
        expect(r.hash).toBe(towerStateHash(s));
        expect(() => replayTower({ questionCount: 20, inputs: '', endTick: TC.MAX_TICKS + 1 })).toThrow(RangeError);
    });
});

describe('determinism ve clone', () => {
    it('aynı girdi → aynı durum; replay sim ile birebir', () => {
        const a = runTowerBot(createTowerSim({ questionCount: 20 }), { mode: 'human', jitter: 2, botSeed: 77 });
        const r1 = replayTower({ questionCount: 20, inputs: a.encodeInputs(), endTick: a.state.tick });
        const r2 = replayTower({ questionCount: 20, inputs: a.encodeInputs(), endTick: a.state.tick, seed: 999 });
        expect(r1).toEqual(r2);
        expect(r1.hash).toBe(towerStateHash(a.state));
        expect(r1.floor).toBe(a.state.floor);
        expect(r1.crashed).toBe(true);
        expect(r1.endTick).toBe(a.state.crashTick + 1);
        // Liste biçimi de kabul
        const list = [];
        let tick = 0;
        for (const tok of a.encodeInputs().split(',')) {
            tick += parseInt(tok, 10);
            list.push([tick, tok[tok.length - 1]]);
        }
        expect(replayTower({ questionCount: 20, inputs: list, endTick: a.state.tick })).toEqual(r1);
        // endTick ıskadan sonra da olsa replay ıskada durur
        expect(replayTower({ questionCount: 20, inputs: a.encodeInputs(), endTick: a.state.tick + 500 })).toEqual(r1);
    });

    it('clone bağımsız ilerler, bekleyen girdiyi taşır', () => {
        const sim = createTowerSim({ questionCount: 5 });
        runTowerBot(sim, { mode: 'human', jitter: 2, botSeed: 5, maxFloors: 20 });
        sim.input('T');
        const c = sim.clone();
        expect(c.state).toEqual(sim.state);
        expect(c.state).not.toBe(sim.state);
        expect(c.state.prev).not.toBe(sim.state.prev);
        expect(c.encodeInputs()).toBe(sim.encodeInputs());
        sim.step();
        c.step();
        expect(towerStateHash(c.state)).toBe(towerStateHash(sim.state));
        runTowerBot(c, { mode: 'random', botSeed: 3 });
        expect(c.state.crashed).toBe(true);
        expect(sim.state.crashed).toBe(false);
        expect(sim.state.floor).toBeLessThanOrEqual(21);
        const nr = sim.clone({ record: false });
        expect(nr.inputCount()).toBe(0);
        expect(nr.state).toEqual(sim.state);
    });

    it('olay dizisi ve nesneleri yeniden kullanılır', () => {
        const sim = createTowerSim();
        const e1 = sim.step();
        const first = e1[0];
        expect(first.type).toBe('spawn');
        const e2 = sim.step();
        expect(e2).toBe(e1);
        expect(e2).toHaveLength(0);
        while (sim.state.phase !== 'moving' || sim.state.t !== 75) sim.step();
        sim.input('T');
        const e3 = sim.step();
        expect(e3[0]).toBe(first);
        expect(e3[0].type).toBe('place');
        expect(e3[0].axis).toBe(null);
    });
});
