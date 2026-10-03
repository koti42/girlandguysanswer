import { describe, expect, it } from 'vitest';
import { C, createSim, rampHeight, replay, stateHash, tunnelAt } from './index.js';
import { buildChunk, PATTERNS } from './generator.js';

/*
 * v2 kural testleri (şartname §A.2–§A.6): araba, otobüs, rampa, çatıda koşma,
 * kenar yakalama, Süper Zıplama, kalın tabela, tüneller. Pist testin verdiği
 * öğelerle kurulur (debug.override). Chunk 2 = z 60000..90000.
 */

const EMPTY = { items: [] };
const VMAX_TICK = (C.VMAX - C.V0) * C.SPEED_STEP_TICKS; // 19200

function simWith(chunkItems, opts = {}) {
    return createSim({
        seed: 4242,
        gateCount: 0,
        debug: {
            startZ: opts.startZ ?? 0,
            startTick: opts.startTick ?? 0,
            startLane: opts.startLane ?? 1,
            override: (c) => chunkItems[c] || EMPTY,
        },
    });
}

/** inputs: {tick: 'J' | ['L','J']}; n adım koşturur. Olayları ve her adım sonrası y'yi kaydeder. */
function run(sim, n, inputs = {}) {
    const log = [];
    const ys = [];
    for (let i = 0; i < n && !sim.state.crashed; i++) {
        const t = sim.state.tick;
        const codes = inputs[t];
        if (codes) for (const code of [].concat(codes)) sim.input(code);
        for (const e of sim.step()) log.push({ ...e, tick: t });
        ys.push(sim.state.y);
    }
    log.ys = ys;
    return log;
}

const types = (log, type) => log.filter((e) => e.type === type);

/** Bir koşulu sağlayan ilk zıplama tick'ini tarar (kurulumdan bağımsız, ayrıntıyı sim belirlesin). */
function findJump(make, from, to, ok) {
    for (let t = from; t <= to; t++) {
        const sim = make();
        const log = run(sim, 200, { [t]: 'J' });
        if (ok(sim, log)) return { t, sim, log };
    }
    return null;
}

describe('araba', () => {
    // Orta şeritte araba: z 72000..76200, üstü 1200.
    const car = { 2: { items: [{ t: 'car', lane: 1, z: 12000 }] } };

    it('önden çarpınca oyun biter (kalkansız)', () => {
        const sim = simWith(car, { startZ: 66000 });
        const log = run(sim, 60);
        expect(sim.state.crashed).toBe(true);
        expect(types(log, 'crash')).toEqual([expect.objectContaining({ id: 2 * 64, kind: 'head' })]);
    });

    it('zıplayıp çatısına çıkılır, çatıda koşulur, sonunda düşülür', () => {
        const sim = simWith(car, { startZ: 66000 });
        const log = run(sim, 120, { 20: 'J' });
        expect(sim.state.crashed).toBe(false);
        const lands = types(log, 'land');
        expect(lands[0]).toMatchObject({ kind: 'car' });
        expect(lands[1]).toMatchObject({ kind: 'ground' });
        const onRoof = lands[0].tick;
        // Çatıda: y = 1200, yerde (grounded) — zıplama yeniden mümkün.
        expect(log.ys[onRoof]).toBe(C.CAR_TOP);
        const fall = types(log, 'fall');
        expect(fall).toHaveLength(1);
        expect(fall[0].tick).toBeGreaterThan(onRoof);
        // Düşüşün ilk tick'inde y değişmez, sonra yerçekimi.
        expect(log.ys[fall[0].tick]).toBe(C.CAR_TOP);
        expect(log.ys[fall[0].tick + 1]).toBe(C.CAR_TOP);
        expect(log.ys[fall[0].tick + 2]).toBe(C.CAR_TOP - C.GRAVITY);
        expect(sim.state.y).toBe(0);
        expect(sim.state.grounded).toBe(true);
        expect(sim.state.roofLandings).toBe(1);
    });

    it('çatıdayken zıplama çatıdan başlar', () => {
        const sim = simWith(car, { startZ: 66000 });
        const log = run(sim, 52, { 20: 'J' });
        const onRoof = types(log, 'land')[0].tick;
        expect(sim.state.grounded).toBe(true);
        expect(sim.state.y).toBe(C.CAR_TOP);
        run(sim, 1, { [onRoof + 3 > sim.state.tick ? onRoof + 3 : sim.state.tick]: 'J' });
        expect(sim.state.y).toBe(C.CAR_TOP + C.JUMP_V);
        expect(sim.state.grounded).toBe(false);
    });

    it('VMAX\'ta üstünden aşılır ya da kenarı yükselirken yakalanır', () => {
        const startZ = 60000;
        const make = () => simWith(car, { startZ, startTick: VMAX_TICK });
        const ok = [];
        for (let t = 0; t < 40; t++) {
            const sim = make();
            run(sim, 80, { [VMAX_TICK + t]: 'J' });
            if (!sim.state.crashed) ok.push(t);
        }
        // Yeterince geniş bir zıplama penceresi (≈ 8 tick'ten fazla) var.
        expect(ok.length).toBeGreaterThanOrEqual(8);
    });

    it('araba sırasında çatıdan çatıya kesintisiz koşulur', () => {
        const row = { 2: { items: [{ t: 'car', lane: 1, z: 9000 }, { t: 'car', lane: 1, z: 13200 }, { t: 'car', lane: 1, z: 17400 }] } };
        const found = findJump(() => simWith(row, { startZ: 63000 }), 0, 40, (sim, log) => !sim.state.crashed
            && types(log, 'land')[0]?.kind === 'car');
        expect(found).not.toBe(null);
        // İlk inişten sonraki tek düşüş sıranın sonunda (z ≥ 81600 + 300).
        const fall = types(found.log, 'fall');
        expect(fall).toHaveLength(1);
    });
});

describe('otobüs ve rampa', () => {
    // Orta şeritte rampa z 69000..75000, ardından otobüs 75000..84000.
    const roof = {
        2: { items: [
            { t: 'ramp', lane: 1, z: 9000 },
            { t: 'bus', lane: 1, z: 15000, len: 9000 },
            { t: 'coins', lane: 1, z: 17000, n: 3, step: 2000, base: 2700 },
        ] },
    };

    it('otobüse önden çarpınca oyun biter; yerden normal zıplamayla çıkılamaz', () => {
        const wall = { 2: { items: [{ t: 'bus', lane: 1, z: 12000, len: 8000 }] } };
        const a = simWith(wall, { startZ: 66000 });
        const log = run(a, 60);
        expect(types(log, 'crash')).toEqual([expect.objectContaining({ id: 2 * 64, kind: 'head' })]);
        const any = findJump(() => simWith(wall, { startZ: 66000 }), 0, 40, (sim) => !sim.state.crashed);
        expect(any).toBe(null);
    });

    it('rampa takibi: yerdeyken yüzey yüksekliğine birebir uyulur, sonra çatıda koşulur', () => {
        const sim = simWith(roof, { startZ: 66000 });
        let prevY = 0;
        let maxStep = 0;
        for (let i = 0; i < 70; i++) {
            sim.step();
            const s = sim.state;
            expect(s.crashed).toBe(false);
            expect(s.grounded).toBe(true);
            const ramp = sim.getChunk(2).obstacles[0];
            if (s.z + C.PLAYER_HALF_D > ramp.z0 && s.z - C.PLAYER_HALF_D < ramp.z1 && s.z < ramp.z1 - C.PLAYER_HALF_D) {
                expect(s.y).toBe(rampHeight(ramp, s.z));
            }
            if (s.y - prevY > maxStep) maxStep = s.y - prevY;
            prevY = s.y;
        }
        expect(maxStep).toBeLessThanOrEqual(C.STEP_UP);
        expect(sim.state.y).toBe(C.BUS_TOP);
        expect(sim.state.ground).toBe(C.BUS_TOP);
    });

    it('çatıda koşma: çatı jetonları alınır, çatı bitince düşülür ve yere inilir', () => {
        const sim = simWith(roof, { startZ: 66000 });
        const log = run(sim, 160);
        expect(sim.state.crashed).toBe(false);
        expect(sim.state.coins).toBe(3);
        expect(types(log, 'fall')).toHaveLength(1);
        expect(types(log, 'land')).toEqual([expect.objectContaining({ kind: 'ground' })]);
        expect(sim.state.y).toBe(0);
        expect(sim.state.grounded).toBe(true);
    });

    it('çatıda kayma: yükseklik korunur, kayma süresi işler', () => {
        const sim = simWith(roof, { startZ: 66000 });
        run(sim, 60);
        expect(sim.state.y).toBe(C.BUS_TOP);
        const t = sim.state.tick;
        const log = run(sim, 1, { [t]: 'S' });
        expect(types(log, 'slide')).toHaveLength(1);
        expect(sim.state.slideTicks).toBe(C.SLIDE_TICKS - 1);
        expect(sim.state.y).toBe(C.BUS_TOP);
        expect(sim.state.grounded).toBe(true);
    });

    it('çatıdan zıplama: 2700\'den yükselir, otobüs bitmişse yere iner', () => {
        const sim = simWith(roof, { startZ: 66000 });
        run(sim, 60);
        const t = sim.state.tick;
        const log = run(sim, 120, { [t]: 'J' });
        expect(Math.max(...log.ys)).toBe(C.BUS_TOP + 1470);
        expect(sim.state.crashed).toBe(false);
        const lands = types(log, 'land');
        expect(lands[lands.length - 1]).toMatchObject({ kind: 'ground' });
        expect(sim.state.y).toBe(0);
    });

    it('çatıdan zıplayıp aynı çatıya geri inilir', () => {
        const sim = simWith(roof, { startZ: 66000 });
        run(sim, 50); // rampanın sonu, çatının başı
        const t = sim.state.tick;
        const log = run(sim, 45, { [t]: 'J' });
        expect(types(log, 'land')[0]).toMatchObject({ kind: 'bus' });
        expect(sim.state.y).toBe(C.BUS_TOP);
    });

    it('rampaya yandan alçakta girilir (yüzey takibi), yüksekte girilince sendeler', () => {
        // Soldan orta şeride: rampanın başında (yükseklik < STEP_UP) sorun yok.
        const early = simWith(roof, { startZ: 67000, startLane: 0 });
        const logA = run(early, 60, { 8: 'R' });
        expect(types(logA, 'stumble')).toHaveLength(0);
        expect(early.state.crashed).toBe(false);
        expect(early.state.y).toBeGreaterThan(0);

        // Rampanın ortasında yandan: y < h - STEP_UP → sendeleme, eski şeride dönüş.
        const mid = simWith(roof, { startZ: 69000, startLane: 0 });
        const logB = run(mid, 30, { 12: 'R' });
        const st = types(logB, 'stumble');
        expect(st).toEqual([expect.objectContaining({ id: 2 * 64 })]);
        expect(mid.state.crashed).toBe(false);
        expect(mid.state.lane).toBe(0);
    });

    it('rampaya önden çarpılmaz; yüksek hızda rampada zıplamak ölümcül değil', () => {
        for (const jumpAt of [0, 3, 6, 9]) {
            const sim = simWith(roof, { startZ: 66000, startTick: VMAX_TICK });
            // z 66000'den VMAX'ta rampanın başına ≈ 7 tick; 35 tick sonra çatının ortası.
            run(sim, 35, { [VMAX_TICK + 7 + jumpAt]: 'J' });
            expect(sim.state.crashed, 'zıplama +' + jumpAt).toBe(false);
            expect(sim.state.y).toBe(C.BUS_TOP);
        }
    });

    it('otobüsün yanından geçmek (x örtüşmesi yok) güvenli; yana kayınca sendeleme', () => {
        const side = { 2: { items: [{ t: 'bus', lane: 2, z: 9000, len: 16000 }] } };
        const sim = simWith(side, { startZ: 70000 });
        const log = run(sim, 20, { 0: 'R' });
        expect(types(log, 'stumble')).toEqual([expect.objectContaining({ id: 2 * 64, tick: 4 })]);
        expect(sim.state.lane).toBe(1);
    });
});

describe('kenar yakalama (LAND_TOL)', () => {
    it('araba çatısından otobüse: tepe 2670 < 2700 ama çatıya inilir', () => {
        // Araba 72000..76200, otobüs 79000..87000 (aynı şerit).
        const chain = { 2: { items: [{ t: 'car', lane: 1, z: 12000 }, { t: 'bus', lane: 1, z: 19000, len: 8000 }] } };
        let found = null;
        for (let j1 = 10; j1 <= 30 && !found; j1++) {
            const probe = simWith(chain, { startZ: 66000 });
            const l1 = run(probe, 60, { [j1]: 'J' });
            const land = types(l1, 'land')[0];
            if (!land || land.kind !== 'car' || probe.state.crashed) continue;
            for (let j2 = land.tick + 1; j2 < land.tick + 40 && !found; j2++) {
                const sim = simWith(chain, { startZ: 66000 });
                const log = run(sim, 140, { [j1]: 'J', [j2]: 'J' });
                const lands = types(log, 'land');
                if (lands.some((e) => e.kind === 'bus') && !sim.state.crashed) found = { log, j2 };
            }
        }
        expect(found).not.toBe(null);
        const busLand = types(found.log, 'land').find((e) => e.kind === 'bus');
        // İnişten önceki en yüksek nokta çatının altında: kenar yakalandı.
        const before = found.log.ys.slice(found.j2, busLand.tick);
        expect(Math.max(...before)).toBeLessThan(C.BUS_TOP);
        expect(Math.max(...before)).toBeGreaterThanOrEqual(C.BUS_TOP - C.LAND_TOL);
        expect(found.log.ys[busLand.tick]).toBe(C.BUS_TOP);
    });

    it('LAND_TOL\'den aşağıda kalan oyuncu çatıya inmez, otobüse çarpar', () => {
        // Yerden normal zıplama (tepe 1470) otobüsün 2500 eşiğine yetişmez.
        const wall = { 2: { items: [{ t: 'bus', lane: 1, z: 12000, len: 8000 }] } };
        for (let t = 0; t < 40; t++) {
            const sim = simWith(wall, { startZ: 66000 });
            run(sim, 80, { [t]: 'J' });
            expect(sim.state.crashed).toBe(true);
        }
    });
});

describe('Süper Zıplama', () => {
    const powerThen = (more = []) => ({
        2: { items: [{ t: 'power', lane: 1, z: 2000 }, ...more], power: 'superjump' },
    });

    it('güçlendirme alınır, 600 tick sürer, zıplama tepesi 2958', () => {
        const sim = simWith(powerThen(), { startZ: 60000 });
        const log = run(sim, 20);
        expect(types(log, 'power')).toEqual([expect.objectContaining({ kind: 'superjump', id: 2 * 4 })]);
        expect(sim.state.superTicks).toBeGreaterThan(C.SUPER_TICKS - 20);
        const t = sim.state.tick;
        const jl = run(sim, 70, { [t]: 'J' });
        expect(types(jl, 'jump')).toEqual([expect.objectContaining({ kind: 'super' })]);
        expect(Math.max(...jl.ys)).toBe(2958);
        const air = types(jl, 'land')[0].tick - t;
        expect(air).toBeGreaterThanOrEqual(57);
        expect(air).toBeLessThanOrEqual(59);
        // Süre dolunca normal zıplama.
        run(sim, C.SUPER_TICKS);
        expect(sim.state.superTicks).toBe(0);
        const n = run(sim, 45, { [sim.state.tick]: 'J' });
        expect(types(n, 'jump')[0].kind).toBe(null);
        expect(Math.max(...n.ys)).toBe(1470);
    });

    it('süper zıplamayla rampasız otobüsün çatısına çıkılır', () => {
        const wall = powerThen([{ t: 'bus', lane: 1, z: 16000, len: 8000 }]);
        const found = findJump(() => simWith(wall, { startZ: 60000 }), 10, 70, (sim, log) => !sim.state.crashed
            && types(log, 'land').some((e) => e.kind === 'bus'));
        expect(found).not.toBe(null);
        expect(types(found.log, 'jump')[0].kind).toBe('super');
    });

    it('kalın tabela: normal zıplamayla aşılmaz, süper zıplamayla üstünden geçilir', () => {
        const bar = { 2: { items: [{ t: 'bar', lane: 1, z: 14000 }] } };
        const normal = findJump(() => simWith(bar, { startZ: 66000 }), 0, 45, (sim) => !sim.state.crashed);
        expect(normal).toBe(null);
        const sup = powerThen([{ t: 'bar', lane: 1, z: 14000 }]);
        const ok = findJump(() => simWith(sup, { startZ: 60000 }), 10, 80, (sim) => !sim.state.crashed);
        expect(ok).not.toBe(null);
    });

    it('havada alınan süper zıplama tampondaki zıplamayı da güçlendirir', () => {
        const sim = simWith(powerThen(), { startZ: 60000 });
        run(sim, 20);
        const t = sim.state.tick;
        // Süper zıplama, inişten hemen önce tamponlanan J ile inişte yeniden süper zıplar.
        const log = run(sim, 64, { [t]: 'J', [t + 55]: 'J' });
        const jumps = types(log, 'jump');
        expect(jumps).toHaveLength(2);
        expect(jumps[1].kind).toBe('super');
    });
});

describe('kalkan ve destek', () => {
    it('kalkanla kırılan otobüs destek vermez, içinden geçilir', () => {
        const items = {
            2: { items: [{ t: 'power', lane: 1, z: 2000 }, { t: 'bus', lane: 1, z: 12000, len: 8000 }], power: 'shield' },
        };
        const sim = simWith(items, { startZ: 60000 });
        const log = run(sim, 150);
        // Güçlendirme yuvası engel sayacını artırmaz: otobüs chunk'ın ilk engeli.
        expect(types(log, 'shieldBreak')).toEqual([expect.objectContaining({ id: 2 * 64 })]);
        expect(sim.state.crashed).toBe(false);
        expect(sim.isDestroyed(2 * 64)).toBe(true);
        expect(sim.groundAt(0, 76000)).toBe(0);
        expect(sim.state.y).toBe(0);
    });

    it('groundAt: rampa, otobüs, araba, şerit dışı ve geçersiz girdi', () => {
        const items = {
            2: { items: [
                { t: 'ramp', lane: 1, z: 9000 },
                { t: 'bus', lane: 1, z: 15000, len: 8000 },
                { t: 'car', lane: 0, z: 9000 },
                { t: 'barrier', lane: 2, z: 9000 },
            ] },
        };
        const sim = simWith(items);
        expect(sim.groundAt(0, 69000)).toBe(0);
        expect(sim.groundAt(0, 72000)).toBe(1350);
        expect(sim.groundAt(0, 74700)).toBe(2565); // otobüse henüz örtüşmüyor
        expect(sim.groundAt(0, 74701)).toBe(C.BUS_TOP);
        expect(sim.groundAt(0, 75200)).toBe(C.BUS_TOP);
        expect(sim.groundAt(0, 83299)).toBe(C.BUS_TOP);
        expect(sim.groundAt(0, 83300)).toBe(0);
        expect(sim.groundAt(1449, 80000)).toBe(C.BUS_TOP);
        expect(sim.groundAt(1450, 80000)).toBe(0);
        expect(sim.groundAt(-2500, 70000)).toBe(C.CAR_TOP);
        expect(sim.groundAt(2500, 69200)).toBe(0); // bariyer destek vermez
        expect(sim.groundAt(0.5, 72000.5)).toBe(1350);
        expect(sim.groundAt(NaN, 1)).toBe(0);
        expect(sim.groundAt(0, -5)).toBe(0);
        // Simülasyon durumu değişmez.
        expect(stateHash(sim.state)).toBe(stateHash(simWith(items).state));
    });

    it('engel nesneleri top alanı taşır', () => {
        const ch = buildChunk(1, 0, 5, () => ({ items: [
            { t: 'barrier', lane: 0, z: 3000 }, { t: 'bar', lane: 1, z: 3000 }, { t: 'car', lane: 2, z: 3000 },
            { t: 'ramp', lane: 0, z: 9000 }, { t: 'bus', lane: 0, z: 15000, len: 8000 },
        ] }));
        expect(ch.obstacles.map((o) => [o.type, o.z1 - o.z0, o.top])).toEqual([
            ['barrier', 500, 900], ['bar', 500, 1600], ['car', 4200, 1200], ['ramp', 6000, 2700], ['bus', 8000, 2700],
        ]);
    });
});

describe('durum ve olaylar', () => {
    it('başlangıç: grounded, superTicks 0; hash grounded ve superTicks içerir', () => {
        const sim = simWith({});
        expect(sim.state.grounded).toBe(true);
        expect(sim.state.superTicks).toBe(0);
        const before = stateHash(sim.state);
        sim.state.grounded = false;
        expect(stateHash(sim.state)).not.toBe(before);
        sim.state.grounded = true;
        sim.state.superTicks = 1;
        expect(stateHash(sim.state)).not.toBe(before);
    });

    it('step allocation yapmaz: olay nesneleri havuzdan', () => {
        const items = { 2: { items: [{ t: 'car', lane: 1, z: 12000 }] } };
        const sim = simWith(items, { startZ: 66000 });
        const seen = new Set();
        for (let t = 0; t < 120; t++) {
            if (t === 20) sim.input('J');
            for (const e of sim.step()) seen.add(e);
        }
        // jump, land(car), fall, land(ground): en fazla bir tick'te 2 olay → havuz küçük.
        expect(seen.size).toBeLessThanOrEqual(2);
    });

    it('canlı koşu ile replay aynı (çatı ve süper zıplama dahil)', () => {
        const items = {
            2: { items: [
                { t: 'power', lane: 1, z: 2000 },
                { t: 'ramp', lane: 1, z: 9000 },
                { t: 'bus', lane: 1, z: 15000, len: 9000 },
            ], power: 'superjump' },
        };
        const live = simWith(items, { startZ: 60000 });
        run(live, 200, { 40: 'J', 90: 'L', 120: 'J' });
        const clone = simWith(items, { startZ: 60000 });
        run(clone, 200, { 40: 'J', 90: 'L', 120: 'J' });
        expect(stateHash(clone.state)).toBe(stateHash(live.state));
    });
});

describe('tüneller (görsel)', () => {
    it('c >= 14, c % 26 ∈ [16, 19], yalnızca normal chunk', () => {
        const list = [];
        for (let c = 0; c < 130; c++) if (tunnelAt(c, 30)) list.push(c);
        // 120 = kapı 8'in chunk'ı (8 + 14·8): tünel değil.
        expect(list).toEqual([16, 17, 18, 19, 42, 43, 44, 45, 68, 69, 70, 71, 94, 95, 96, 97, 121, 122, 123]);
        expect(tunnelAt(120, 0)).toBe(true);
        expect(tunnelAt(-1, 0)).toBe(false);
        expect(tunnelAt(16.5, 0)).toBe(false);
        expect(tunnelAt(16, 1)).toBe(true);
    });

    it('PRNG akışına ve pist içeriğine dokunmaz', () => {
        const a = createSim({ seed: 99, gateCount: 30 });
        const before = JSON.stringify(a.getChunk(17));
        for (let c = 0; c < 200; c++) a.tunnelAt(c);
        const b = createSim({ seed: 99, gateCount: 30 });
        expect(JSON.stringify(b.getChunk(17))).toBe(before);
    });
});

describe('güçlendirme zarı', () => {
    it('mıknatıs < 28, kalkan < 50, süper < 70; üçü de gerçek pistte çıkar', () => {
        const kinds = new Map();
        for (let seed = 1; seed <= 30; seed++) {
            const sim = createSim({ seed, gateCount: 0 });
            for (let c = 2; c < 60; c++) {
                for (const p of sim.getChunk(c).powers) kinds.set(p.kind, (kinds.get(p.kind) || 0) + 1);
            }
        }
        expect([...kinds.keys()].sort()).toEqual(['magnet', 'shield', 'superjump']);
        const total = [...kinds.values()].reduce((a, b) => a + b, 0);
        // ~%7 chunk'ta güçlendirme; süper ~%2 (yuvası olan desenlerde).
        expect(total).toBeGreaterThan(50);
        expect(kinds.get('superjump') / total).toBeGreaterThan(0.15);
        expect(kinds.get('superjump') / total).toBeLessThan(0.45);
    });

    it('replay dışa aktarımı v2 alanlarını korur', () => {
        const r = replay({ seed: 3, gateCount: 0, inputs: '', endTick: 10 });
        expect(Object.keys(r).sort()).toEqual(['coins', 'crashTick', 'crashed', 'distanceM', 'endTick', 'gates', 'hash', 'segMm', 'z']);
        expect(PATTERNS.length).toBeGreaterThan(0);
    });
});
