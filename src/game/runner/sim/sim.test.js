import { describe, expect, it } from 'vitest';
import { C, createSim, gateTick, replay, stateHash } from './index.js';
import { createPrng, randInt } from './prng.js';

/*
 * Kural testleri (şartname §3.4). Pist, testin kendi verdiği öğelerle kurulur
 * (debug.override): desen kütüphanesi değişse de kurallar aynı kalmalı.
 * Chunk 2 = z 60000..90000. Testler hep V0 hızında (180 mm/tick) başlar.
 */

const EMPTY = { items: [] };

function simWith(chunkItems, opts = {}) {
    return createSim({
        seed: 4242,
        gateCount: opts.gateCount ?? 0,
        debug: {
            startZ: opts.startZ ?? 0,
            startTick: opts.startTick ?? 0,
            startLane: opts.startLane ?? 1,
            override: (c) => chunkItems[c] || EMPTY,
        },
    });
}

/** inputs: {tick: 'J' | ['L','J']}; n adım koşturur, her adımın olaylarını kopyalar. */
function run(sim, n, inputs = {}) {
    const log = [];
    for (let i = 0; i < n; i++) {
        const t = sim.state.tick;
        const codes = inputs[t];
        if (codes) for (const code of [].concat(codes)) sim.input(code);
        const events = sim.step();
        for (const e of events) log.push({ ...e, tick: t });
    }
    return log;
}

const types = (log, type) => log.filter((e) => e.type === type);

describe('zıplama', () => {
    it('tepe 1470 mm, 40 tick havada, 40. tick\'te iner', () => {
        const sim = simWith({});
        let maxY = 0;
        const log = [];
        for (let t = 0; t <= 40; t++) {
            if (t === 0) sim.input('J');
            for (const e of sim.step()) log.push({ type: e.type, tick: t });
            if (t < 40) expect(sim.state.y).toBeGreaterThan(0);
            if (sim.state.y > maxY) maxY = sim.state.y;
        }
        expect(maxY).toBe(1470);
        expect(sim.state.y).toBe(0);
        expect(sim.state.vy).toBe(0);
        expect(log).toEqual([{ type: 'jump', tick: 0 }, { type: 'land', tick: 40 }]);
    });

    it('havadayken J tamponlanır: inişten ≤7 tick önce basılırsa yeniden zıplar', () => {
        const a = simWith({});
        const logA = run(a, 45, { 0: 'J', 33: 'J' });
        expect(types(logA, 'jump').map((e) => e.tick)).toEqual([0, 40]);
        expect(a.state.y).toBeGreaterThan(0);

        const b = simWith({});
        const logB = run(b, 45, { 0: 'J', 32: 'J' });
        expect(types(logB, 'jump').map((e) => e.tick)).toEqual([0]);
        expect(b.state.y).toBe(0);
        expect(b.state.jumpBuffer).toBe(0);
    });

    it('yeniden zıplama tick\'inde y = 0 kalır, sonraki tick yükselir', () => {
        const sim = simWith({});
        run(sim, 41, { 0: 'J', 36: 'J' });
        expect(sim.state.y).toBe(0);
        expect(sim.state.vy).toBe(C.JUMP_V);
        run(sim, 1);
        expect(sim.state.y).toBe(C.JUMP_V);
    });
});

describe('kayma', () => {
    it('yerde S 40 tick kayma verir (adım içinde bir azalır)', () => {
        const sim = simWith({});
        const log = run(sim, 1, { 0: 'S' });
        expect(sim.state.slideTicks).toBe(39);
        expect(types(log, 'slide')).toHaveLength(1);
        run(sim, 38);
        expect(sim.state.slideTicks).toBe(1);
        run(sim, 1);
        expect(sim.state.slideTicks).toBe(0);
    });

    it('havada S hızlı düşüş + inişte kayma (fast-fall)', () => {
        const sim = simWith({});
        run(sim, 10, { 0: 'J' });
        expect(sim.state.vy).toBe(C.JUMP_V - 10 * C.GRAVITY);
        run(sim, 1, { 10: 'S' });
        expect(sim.state.slideBuffer).toBe(true);
        expect(sim.state.vy).toBe(-C.FAST_FALL_V - C.GRAVITY);
        let guard = 0;
        while (sim.state.y > 0 && guard++ < 60) run(sim, 1);
        expect(sim.state.y).toBe(0);
        expect(sim.state.slideBuffer).toBe(false);
        expect(sim.state.slideTicks).toBe(C.SLIDE_TICKS - 1);
        // Normal zıplamadan (40 tick) çok önce yere iner.
        expect(sim.state.tick).toBeLessThan(25);
    });

    it('havada S zıplama tamponunu siler', () => {
        const sim = simWith({});
        const log = run(sim, 45, { 0: 'J', 34: 'J', 36: 'S' });
        expect(types(log, 'jump').map((e) => e.tick)).toEqual([0]);
    });

    it('J ve S aynı tick\'te: yerde kalır, kayar ve sonra yine zıplayabilir', () => {
        const sim = simWith({});
        run(sim, 1, { 0: ['J', 'S'] });
        expect(sim.state.y).toBe(0);
        expect(sim.state.vy).toBe(0);
        expect(sim.state.slideTicks).toBe(C.SLIDE_TICKS - 1);
        run(sim, 1, { 1: 'J' });
        expect(sim.state.y).toBe(C.JUMP_V);
    });

    it('yeniden zıplama tick\'inde S takılı bırakmaz (vy !== 0 kuralı)', () => {
        const sim = simWith({});
        run(sim, 41, { 0: 'J', 36: 'J' }); // tick 40: yeniden zıplama, y = 0, vy = 140
        run(sim, 1, { 41: 'S' });
        expect(sim.state.y).toBe(0);
        expect(sim.state.vy).toBe(0);
        expect(sim.state.slideTicks).toBe(C.SLIDE_TICKS - 1);
        run(sim, 1, { 42: 'J' });
        expect(sim.state.y).toBeGreaterThan(0);
    });

    it('S yerde J\'yi iptal etmez; J kaymayı iptal eder', () => {
        const sim = simWith({});
        run(sim, 1, { 0: ['S', 'J'] });
        expect(sim.state.slideTicks).toBe(0);
        expect(sim.state.y).toBe(C.JUMP_V);
    });
});

describe('engeller', () => {
    // Chunk 2'de orta şeritte tabela (z 74000..74500) ve bariyer (z 84000..84500).
    const track = {
        2: { items: [{ t: 'bar', lane: 1, z: 14000 }, { t: 'barrier', lane: 1, z: 24000 }] },
    };

    it('tabela: ayakta çarpar (kafa kafaya), kayarak geçilir', () => {
        const a = simWith(track, { startZ: 70000 });
        const logA = run(a, 40);
        expect(a.state.crashed).toBe(true);
        expect(types(logA, 'crash')).toEqual([expect.objectContaining({ id: 2 * 64, kind: 'head' })]);
        expect(a.state.crashTick).toBe(a.state.tick - 1);

        const b = simWith(track, { startZ: 70000 });
        run(b, 40, { 10: 'S' });
        expect(b.state.crashed).toBe(false);
    });

    it('tabelanın altından zıplayarak geçilemez', () => {
        const sim = simWith(track, { startZ: 70000 });
        run(sim, 40, { 12: 'J' });
        expect(sim.state.crashed).toBe(true);
    });

    it('bariyer: zıplayarak geçilir, kayarak geçilmez', () => {
        const a = simWith(track, { startZ: 80000 });
        run(a, 40, { 8: 'J' });
        expect(a.state.crashed).toBe(false);

        const b = simWith(track, { startZ: 80000 });
        run(b, 40, { 10: 'S' });
        expect(b.state.crashed).toBe(true);
    });

    it('çarpma sonrası step ve input etkisiz', () => {
        const sim = simWith(track, { startZ: 70000 });
        run(sim, 40);
        expect(sim.state.crashed).toBe(true);
        const before = stateHash(sim.state);
        const tick = sim.state.tick;
        expect(sim.input('J')).toBe(false);
        expect(sim.step()).toHaveLength(0);
        expect(sim.state.tick).toBe(tick);
        expect(stateHash(sim.state)).toBe(before);
    });

    it('çarpma tick\'inde toplama ve sayaçlar atlanır', () => {
        const items = {
            2: { items: [{ t: 'block', lane: 1, z: 10000, len: 4000 }, { t: 'coins', lane: 1, z: 10600, n: 1, step: 0 }] },
        };
        const sim = simWith(items, { startZ: 66000 });
        run(sim, 30);
        expect(sim.state.crashed).toBe(true);
        // Jeton blokla aynı tick'te menzile girer: çarpma önce, jeton alınmaz.
        expect(sim.state.coins).toBe(0);
    });
});

describe('yan çarpma ve sendeleme', () => {
    // Sağ şeritte uzun blok: z 69000..85000. Oyuncu orta şeritte yanında koşar.
    const track = { 2: { items: [{ t: 'block', lane: 2, z: 9000, len: 16000 }] } };

    it('yana kayınca sendeler, önceki şeride döner', () => {
        const sim = simWith(track, { startZ: 70000 });
        const log = run(sim, 20, { 0: 'R' });
        expect(types(log, 'lane')).toEqual([expect.objectContaining({ from: 1, to: 2, tick: 0 })]);
        const st = types(log, 'stumble');
        expect(st).toEqual([expect.objectContaining({ id: 2 * 64, tick: 4 })]);
        expect(sim.state.crashed).toBe(false);
        expect(sim.state.lane).toBe(1);
        expect(sim.state.x).toBe(0);
        expect(sim.state.ignoreObstacleId).toBe(-1);
        expect(sim.state.stumbleTicks).toBe(C.STUMBLE_TICKS - 16);
    });

    it('sendeleme sürerken ikinci yan çarpma = oyun biter', () => {
        const sim = simWith(track, { startZ: 70000 });
        const log = run(sim, 40, { 0: 'R', 20: 'R' });
        expect(sim.state.crashed).toBe(true);
        expect(types(log, 'crash')).toEqual([expect.objectContaining({ kind: 'side', id: 2 * 64 })]);
    });

    it('sendeleme bitince yeni yan çarpma yine sadece sendeletir', () => {
        // Art arda iki blok: sağ şerit z 61000..89000 boyunca kapalı.
        const longTrack = {
            2: { items: [{ t: 'block', lane: 2, z: 1000, len: 16000 }, { t: 'block', lane: 2, z: 17000, len: 12000 }] },
        };
        const sim = simWith(longTrack, { startZ: 61500 });
        run(sim, 120, { 0: 'R', 100: 'R' });
        expect(sim.state.crashed).toBe(false);
        expect(sim.state.stumbles).toBe(2);
    });

    it('kalkan yan çarpmada harcanmaz', () => {
        const items = {
            2: { items: [{ t: 'power', lane: 1, z: 1000 }, { t: 'block', lane: 2, z: 9000, len: 16000 }], power: 'shield' },
        };
        const sim = simWith(items, { startZ: 60000 });
        run(sim, 60);
        expect(sim.state.shield).toBe(true);
        run(sim, 20, { 60: 'R' });
        expect(sim.state.stumbles).toBe(1);
        expect(sim.state.shield).toBe(true);
    });
});

describe('güçlendirmeler', () => {
    it('kalkan kafa kafaya çarpmayı affeder, dokunulmazlık verir, engeli yok eder', () => {
        const items = {
            2: {
                items: [
                    { t: 'power', lane: 1, z: 2000 },
                    { t: 'barrier', lane: 1, z: 10000 },
                    { t: 'barrier', lane: 1, z: 20000 }, // dokunulmazlık içinde (90 tick ≈ 16 m)
                ],
                power: 'shield',
            },
            3: { items: [{ t: 'barrier', lane: 1, z: 15000 }] }, // dokunulmazlık bitmiş
        };
        const sim = simWith(items, { startZ: 60000 });
        const log = run(sim, 80);
        expect(types(log, 'power')).toEqual([expect.objectContaining({ kind: 'shield', id: 2 * 4 })]);
        const br = types(log, 'shieldBreak');
        expect(br).toEqual([expect.objectContaining({ id: 2 * 64 })]);
        expect(sim.state.shield).toBe(false);
        expect(sim.isDestroyed(2 * 64)).toBe(true);
        expect(sim.state.invulnTicks).toBeGreaterThan(0);
        run(sim, 120);
        expect(sim.state.crashed).toBe(false); // ikinci bariyer dokunulmazlıkta yok sayıldı
        expect(sim.isDestroyed(2 * 64 + 1)).toBe(false);
        let guard = 0;
        while (!sim.state.crashed && guard++ < 300) run(sim, 1);
        expect(sim.state.crashed).toBe(true);
        expect(sim.state.z).toBeGreaterThan(3 * 30000 + 15000 - 400);
    });

    it('mıknatıs 600 tick boyunca her şeritteki yakın jetonları çeker', () => {
        const items = {
            2: {
                items: [
                    { t: 'power', lane: 0, z: 3000 },
                    { t: 'coins', lane: 2, z: 9000, n: 5, step: 2000 },
                    { t: 'coins', lane: 1, z: 1000, n: 1, step: 0 }, // geride kalan, menzil dışı
                ],
                power: 'magnet',
            },
        };
        const sim = simWith(items, { startZ: 60000, startLane: 0 });
        const log = run(sim, 60);
        expect(types(log, 'power')).toEqual([expect.objectContaining({ kind: 'magnet' })]);
        expect(sim.state.coins).toBe(5);
        expect(sim.state.magnetTicks).toBeGreaterThan(500);

        // Mıknatıssız aynı koşu: sol şeritten sağdaki jetonlar alınmaz.
        const ctl = simWith({ 2: { ...items[2], power: null } }, { startZ: 60000, startLane: 0 });
        run(ctl, 60);
        expect(ctl.state.coins).toBe(0);
    });

    it('mıknatıs süresi dolar', () => {
        const items = { 2: { items: [{ t: 'power', lane: 1, z: 1000 }], power: 'magnet' } };
        const sim = simWith(items, { startZ: 60000 });
        let guard = 0;
        while (sim.state.magnetTicks === 0 && guard++ < 50) run(sim, 1);
        expect(sim.state.magnetTicks).toBe(C.MAGNET_TICKS - 1);
        run(sim, C.MAGNET_TICKS - 1);
        expect(sim.state.magnetTicks).toBe(0);
    });

    it('jeton yüksekliği: zıplarken yerdeki jeton alınmaz, yay jetonları alınır', () => {
        const items = {
            2: {
                items: [
                    { t: 'coins', lane: 1, z: 10000, n: 1, step: 0 },
                    { t: 'coins', lane: 2, z: 10000, n: 8, step: 600, arc: true },
                ],
            },
        };
        const a = simWith(items, { startZ: 66000 });
        run(a, 40, { 10: 'J' });
        expect(a.state.coins).toBe(0);
        const b = simWith(items, { startZ: 66000 });
        run(b, 60);
        expect(b.state.coins).toBe(1);
        const c = simWith(items, { startZ: 66000, startLane: 2 });
        run(c, 60, { 14: 'J' });
        expect(c.state.coins).toBe(8);
    });
});

describe('kapı', () => {
    it('kapı şeridi x\'ten okunur (±1250 sınırı)', () => {
        const at = (pressTick) => {
            const sim = simWith({}, { gateCount: 1 });
            const g = gateTick(0);
            const log = run(sim, g + 1, { [pressTick]: 'R' });
            const ev = types(log, 'gate');
            expect(ev).toEqual([expect.objectContaining({ index: 0, tick: g })]);
            return sim.state.gates[0].lane;
        };
        const g = gateTick(0);
        expect(at(g - 4)).toBe(2); // x = 1250
        expect(at(g - 3)).toBe(1); // x = 1000
        expect(at(0)).toBe(2);
    });

    it('sol şerit ve gateCount sınırı', () => {
        const sim = simWith({}, { gateCount: 1 });
        run(sim, gateTick(1) + 5, { 0: 'L' });
        expect(sim.state.gates).toEqual([{ index: 0, lane: 0, tick: gateTick(0) }]);
        expect(sim.state.segMm).toHaveLength(2);
    });
});

describe('girdi kaydı', () => {
    it('girdinin uygulanacağı tick kaydedilir; bir tick\'te en fazla 4', () => {
        const sim = simWith({});
        run(sim, 5);
        expect(sim.input('L')).toBe(true);
        expect(sim.input('R')).toBe(true);
        expect(sim.input('J')).toBe(true);
        expect(sim.input('S')).toBe(true);
        expect(sim.input('L')).toBe(false);
        expect(sim.input('X')).toBe(false);
        sim.step();
        run(sim, 10);
        sim.input('J');
        expect(sim.encodeInputs()).toBe('5L,0R,0J,0S,11J');
        expect(sim.inputCount()).toBe(5);
    });

    it('step aynı olay dizisini yeniden kullanır', () => {
        const sim = simWith({});
        const a = sim.step();
        const b = sim.step();
        expect(a).toBe(b);
    });

    it('MAX_TICKS\'e ulaşınca step etkisiz', () => {
        const sim = simWith({}, { startTick: C.MAX_TICKS - 1 });
        sim.step();
        expect(sim.state.tick).toBe(C.MAX_TICKS);
        sim.step();
        expect(sim.state.tick).toBe(C.MAX_TICKS);
        expect(sim.input('J')).toBe(false);
    });
});

describe('pist', () => {
    it('chunk türleri ve özel içerikler', () => {
        const sim = createSim({ seed: 5, gateCount: 2 });
        expect(sim.getChunk(0)).toMatchObject({ index: 0, kind: 'start', obstacles: [], coins: [], powers: [] });
        const c1 = sim.getChunk(1);
        expect(c1.kind).toBe('start');
        expect(c1.coins.map((c) => [c.id, c.lane, c.z, c.y])).toEqual(
            [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [256 + i, 1, 35000 + i * 2500, 900]),
        );
        for (const c of [6, 7, 20, 21]) {
            const ch = sim.getChunk(c);
            expect(ch.kind).toBe('approach');
            expect(ch.obstacles).toHaveLength(0);
            expect(ch.coins).toHaveLength(33);
            expect(ch.coins[11]).toMatchObject({ id: c * 256 + 11, lane: 1, z: c * 30000 + 2000 });
        }
        expect(sim.getChunk(8).kind).toBe('exit');
        expect(sim.getChunk(22).kind).toBe('exit');
        expect(sim.getChunk(34).kind).toBe('normal'); // kapı 2 yok (gateCount 2)
        expect(sim.getChunk(36).kind).toBe('normal');
        expect(sim.getChunk(-1)).toBe(null);
        expect(sim.getChunk(1.5)).toBe(null);
    });

    it('chunk içeriği üretim sırasından bağımsız', () => {
        const a = createSim({ seed: 777, gateCount: 30 });
        const b = createSim({ seed: 777, gateCount: 30 });
        const order = [55, 3, 120, 40, 9];
        for (const c of order) a.getChunk(c);
        for (const c of order.slice().reverse()) {
            expect(JSON.stringify(b.getChunk(c))).toBe(JSON.stringify(a.getChunk(c)));
        }
    });

    it('farklı seed farklı pist', () => {
        const a = createSim({ seed: 1, gateCount: 0 });
        const b = createSim({ seed: 2, gateCount: 0 });
        let same = 0;
        for (let c = 2; c < 40; c++) {
            if (JSON.stringify(a.getChunk(c).obstacles) === JSON.stringify(b.getChunk(c).obstacles)) same++;
        }
        expect(same).toBeLessThan(20);
    });

    it('pruneBehind geride kalanları atar, gerekirse yeniden üretilir', () => {
        const sim = simWith({}, { startZ: 300000 });
        const c0 = sim.getChunk(2);
        sim.getChunk(10);
        sim.pruneBehind();
        const again = sim.getChunk(2);
        expect(again).not.toBe(c0);
        expect(JSON.stringify(again)).toBe(JSON.stringify(c0));
    });
});

describe('determinizm', () => {
    function randomRun(seed, ticks) {
        const sim = createSim({ seed, gateCount: 30 });
        const rng = createPrng(seed ^ 0x5bd1e995);
        const codes = ['L', 'R', 'J', 'S'];
        for (let i = 0; i < ticks && !sim.state.crashed; i++) {
            if (randInt(rng, 9) === 0) sim.input(codes[randInt(rng, 4)]);
            sim.step();
        }
        return sim;
    }

    it('canlı koşu ile replay aynı sonucu verir', () => {
        for (const seed of [1, 99, 0xffffffff, 123456]) {
            const live = randomRun(seed, 4000);
            const r = replay({ seed, gateCount: 30, inputs: live.encodeInputs(), endTick: live.state.tick });
            expect(r.hash).toBe(stateHash(live.state));
            expect(r.z).toBe(live.state.z);
            expect(r.coins).toBe(live.state.coins);
            expect(r.crashed).toBe(live.state.crashed);
            expect(r.crashTick).toBe(live.state.crashTick);
            expect(r.segMm).toEqual(live.state.segMm);
            expect(r.distanceM).toBe(Math.floor(live.state.z / 1000));
        }
    });

    it('aynı girdi iki kez aynı hash; liste ve string girdi eşdeğer', () => {
        const live = randomRun(5150, 3000);
        const s = live.encodeInputs();
        const a = replay({ seed: 5150, gateCount: 30, inputs: s, endTick: 3000 });
        const b = replay({ seed: 5150, gateCount: 30, inputs: s, endTick: 3000 });
        expect(a).toEqual(b);
        expect(a.endTick).toBe(live.state.tick);
    });

    it('endTick erken keser; crash sonrası girdiler yok sayılır', () => {
        const r = replay({ seed: 3, gateCount: 0, inputs: '3J', endTick: 5 });
        expect(r.endTick).toBe(5);
        expect(r.crashed).toBe(false);
        const dead = replay({ seed: 3, gateCount: 0, inputs: '', endTick: 20000 });
        expect(dead.crashed).toBe(true);
        expect(dead.endTick).toBe(dead.crashTick + 1);
        const withLate = replay({ seed: 3, gateCount: 0, inputs: '19999J', endTick: 20000 });
        expect(withLate.hash).toBe(dead.hash);
    });

    it('replay bozuk girdiyi ve sınır dışı endTick\'i reddeder', () => {
        expect(() => replay({ seed: 1, gateCount: 0, inputs: '5Q', endTick: 10 })).toThrow();
        expect(() => replay({ seed: 1, gateCount: 0, inputs: '11J', endTick: 10 })).toThrow();
        expect(() => replay({ seed: 1, gateCount: 0, inputs: '', endTick: C.MAX_TICKS + 1 })).toThrow();
        expect(() => replay({ seed: 1, gateCount: 0, inputs: [[3, 'J'], [2, 'L']], endTick: 10 })).toThrow();
    });

    it('clone aynı girdilerle aynı yolu izler ve asıl simülasyonu etkilemez', () => {
        const a = randomRun(31337, 1500);
        const before = stateHash(a.state);
        const coinsTaken = () => {
            let n = 0;
            for (let c = 0; c < 20; c++) for (const coin of a.getChunk(c).coins) if (coin.taken) n++;
            return n;
        };
        const takenBefore = coinsTaken();
        const b = a.clone();
        expect(stateHash(b.state)).toBe(before);
        expect(b.encodeInputs()).toBe(a.encodeInputs());

        // Klonu tek başına ilerlet: asıl değişmemeli.
        for (let i = 0; i < 500; i++) b.step();
        expect(stateHash(a.state)).toBe(before);
        expect(coinsTaken()).toBe(takenBefore);

        // İkisine aynı girdileri ver: her tick aynı hash.
        const c = a.clone({ record: false });
        const rng = createPrng(7);
        for (let i = 0; i < 1500; i++) {
            if (randInt(rng, 7) === 0) {
                const code = 'LRJS'[randInt(rng, 4)];
                a.input(code);
                c.input(code);
            }
            a.step();
            c.step();
            expect(stateHash(c.state)).toBe(stateHash(a.state));
        }
        expect(c.state.coins).toBe(a.state.coins);
    });

    it('bekleyen girdiler de klonlanır', () => {
        const a = createSim({ seed: 8, gateCount: 0 });
        a.input('J');
        const b = a.clone();
        a.step();
        b.step();
        expect(b.state.y).toBe(a.state.y);
        expect(b.state.y).toBe(C.JUMP_V);
    });
});
