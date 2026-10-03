import { describe, expect, it } from 'vitest';
import { chunkPrng, createPrng, nextU32, randInt } from './prng.js';
import { fnv1a, fnv1aBytes, stateHash } from './hash.js';
import { PATTERNS } from './generator.js';
import {
    C,
    computeScore,
    createSim,
    decodeInputs,
    encodeInputs,
    gateTick,
    InputFormatError,
    speedAt,
    zGate,
} from './index.js';

/*
 * Birim testleri: PHP portu aynı vektörleri üretmek zorunda. Buradaki sabit
 * sayılar BigInt ile yazılmış bağımsız bir xorshift32/FNV uygulamasıyla da
 * doğrulanıyor - JS'in 32 bit dönüşümlerinde bir kayma olursa iki taraf ayrışır.
 */

function refXorshift(seed, n) {
    const M = (1n << 32n) - 1n;
    let x = BigInt(seed);
    const out = [];
    for (let i = 0; i < n; i++) {
        x ^= (x << 13n) & M;
        x ^= x >> 17n;
        x ^= (x << 5n) & M;
        out.push(Number(x));
    }
    return out;
}

describe('prng (xorshift32)', () => {
    it('sabit vektörler', () => {
        const p = createPrng(1);
        const got = [];
        for (let i = 0; i < 5; i++) got.push(nextU32(p));
        expect(got).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
        expect(got).toEqual(refXorshift(1, 5));

        const q = createPrng(0xdeadbeef);
        expect([nextU32(q), nextU32(q), nextU32(q)]).toEqual([1199382711, 2384302402, 3129746520]);
    });

    it('büyük tohumlarda BigInt referansıyla aynı', () => {
        for (const seed of [0xffffffff, 0x80000000, 2654435761, 123456789]) {
            const p = createPrng(seed);
            const got = [];
            for (let i = 0; i < 50; i++) got.push(nextU32(p));
            expect(got).toEqual(refXorshift(seed, 50));
            for (const v of got) {
                expect(Number.isInteger(v) && v >= 0 && v <= 0xffffffff).toBe(true);
            }
        }
    });

    it('chunk tohumu: seed ^ (c * 2654435761 mod 2^32), 4 kez atılır', () => {
        const seed = 123456789;
        const c = 7;
        const s = Number((BigInt(seed) ^ ((BigInt(c) * 2654435761n) & 0xffffffffn)) & 0xffffffffn);
        const ref = refXorshift(s, 5);
        const p = chunkPrng(seed, c);
        expect(p.x).toBe(ref[3]);
        expect(nextU32(p)).toBe(ref[4]);
        expect(p.x).toBe(3884589690);
    });

    it('sıfır tohum 0x6D2B79F5 yedeğine düşer', () => {
        const a = chunkPrng(0, 0);
        const b = chunkPrng(2654435761, 1); // seed ^ c*K == 0
        const ref = refXorshift(0x6d2b79f5, 4);
        expect(a.x).toBe(ref[3]);
        expect(b.x).toBe(ref[3]);
    });

    it('randInt = next() % n', () => {
        const p = createPrng(1);
        expect(randInt(p, 1000)).toBe(270369 % 1000);
        expect(randInt(p, 2)).toBe(67634689 % 2);
    });
});

describe('speedAt / zGate / gateTick', () => {
    it('hız 80 tick adımlarla artar, VMAX ile sınırlı', () => {
        expect(speedAt(0)).toBe(180);
        expect(speedAt(79)).toBe(180);
        expect(speedAt(80)).toBe(181);
        expect(speedAt(19199)).toBe(419);
        expect(speedAt(19200)).toBe(420);
        expect(speedAt(108000)).toBe(420);
    });

    it('zGate(k) = (8 + 14k) * 30000', () => {
        expect(zGate(0)).toBe(240000);
        expect(zGate(1)).toBe(660000);
        expect(zGate(29)).toBe(414 * 30000);
    });

    it('gateTick kaba kuvvet taramasıyla aynı', () => {
        const expected = [];
        let z = 0;
        let k = 0;
        for (let t = 0; k < 40; t++) {
            const prevZ = z;
            z += speedAt(t);
            while (k < 40 && prevZ < zGate(k) && zGate(k) <= z) {
                expected.push(t);
                k++;
            }
        }
        const got = [];
        for (let i = 0; i < 40; i++) got.push(gateTick(i));
        expect(got).toEqual(expected);
        expect(gateTick(0)).toBe(1279);
        expect(gateTick(29)).toBe(35079);
    });

    it('gateTick geçersiz k reddeder', () => {
        expect(() => gateTick(-1)).toThrow();
        expect(() => gateTick(1.5)).toThrow();
        expect(() => gateTick(256)).toThrow();
    });

    it('kapı olayı gateTick(k) tick\'inde gelir', () => {
        // Normal chunk'lar engelsiz desene sabitlenir: kapı 0'a kadar girdisiz koşulur.
        const empty = PATTERNS.findIndex((p) => p.id === 'jeton-hatti');
        const sim = createSim({ seed: 99, gateCount: 2, debug: { override: () => ({ pattern: empty }) } });
        while (sim.state.gates.length < 1 && !sim.state.crashed && sim.state.tick < 5000) sim.step();
        expect(sim.state.crashed).toBe(false);
        expect(sim.state.gates[0]).toEqual({ index: 0, lane: 1, tick: gateTick(0) });
        expect(sim.state.segMm.length).toBe(2);
        expect(sim.state.segMm[0] + sim.state.segMm[1]).toBe(sim.state.z);
    });
});

describe('girdi kodlaması', () => {
    it('encode/decode gidiş-dönüş', () => {
        const list = [[75, 'J'], [115, 'L'], [115, 'S'], [400, 'R']];
        const s = encodeInputs(list);
        expect(s).toBe('75J,40L,0S,285R');
        expect(decodeInputs(s, 400)).toEqual(list);
        expect(encodeInputs([])).toBe('');
        expect(decodeInputs('', 0)).toEqual([]);
    });

    it('baştaki sıfırlar ve 6 haneli delta kabul edilir', () => {
        expect(decodeInputs('007J', 10)).toEqual([[7, 'J']]);
        expect(decodeInputs('100000J', C.MAX_TICKS)).toEqual([[100000, 'J']]);
    });

    it.each([
        ['boşluk', '1J, 2L'],
        ['küçük harf', '1j'],
        ['bilinmeyen kod', '1X'],
        ['kod yok', '12'],
        ['delta yok', 'J'],
        ['negatif', '-1J'],
        ['7 hane', '1000000J'],
        ['sonda virgül', '1J,'],
        ['başta virgül', ',1J'],
        ['çift virgül', '1J,,2J'],
        ['satır sonu', '1J\n'],
        ['ondalık', '1.5J'],
        ['unicode rakam', '١J'],
        ['art arda kod', '1JJ'],
    ])('bozuk biçim reddedilir: %s', (_, str) => {
        expect(() => decodeInputs(str, C.MAX_TICKS)).toThrow(InputFormatError);
    });

    it('end_tick sonrasındaki girdi reddedilir, tam end_tick kabul', () => {
        expect(() => decodeInputs('10J,5L', 14)).toThrow(/aşıyor/);
        expect(decodeInputs('10J,5L', 15)).toEqual([[10, 'J'], [15, 'L']]);
    });

    it('bir tick\'te en fazla 4 girdi', () => {
        expect(decodeInputs('5J,0L,0R,0S', 10)).toHaveLength(4);
        expect(() => decodeInputs('5J,0L,0R,0S,0J', 10)).toThrow(/çok fazla/);
        // Farklı tick'lere dağılan 5 girdi sorun değil.
        expect(decodeInputs('5J,0L,0R,0S,1J', 10)).toHaveLength(5);
    });

    it('token ve uzunluk sınırları', () => {
        const ok = new Array(C.MAX_INPUT_TOKENS).fill('0J');
        // 0 deltalı 12000 token tek tick'e düşer; tick sınırına takılmasın diye 1 delta.
        ok.fill('1J');
        expect(decodeInputs(ok.join(','), C.MAX_TICKS)).toHaveLength(C.MAX_INPUT_TOKENS);
        ok.push('1J');
        expect(() => decodeInputs(ok.join(','), C.MAX_TICKS)).toThrow(/çok fazla hamle/);
        expect(() => decodeInputs('1J,' + '0'.repeat(C.MAX_INPUT_CHARS) + 'J', C.MAX_TICKS)).toThrow(/uzun/);
    });

    it('geçersiz end_tick ve tür', () => {
        expect(() => decodeInputs('', -1)).toThrow();
        expect(() => decodeInputs('', C.MAX_TICKS + 1)).toThrow();
        expect(() => decodeInputs(null, 10)).toThrow(InputFormatError);
        expect(() => decodeInputs(['1J'], 10)).toThrow(InputFormatError);
    });

    it('encode sırasız ya da bozuk listeyi reddeder', () => {
        expect(() => encodeInputs([[5, 'J'], [4, 'L']])).toThrow();
        expect(() => encodeInputs([[5, 'X']])).toThrow();
        expect(() => encodeInputs([[5, 'LR']])).toThrow();
        expect(() => encodeInputs([[-1, 'J']])).toThrow();
    });
});

describe('computeScore', () => {
    it('kapısız koşu: mesafe + jeton', () => {
        const r = computeScore({ segMm: [123456], coins: 7, gates: [], correct: [] });
        expect(r).toEqual({
            score: 123 + 70,
            distPoints: 123,
            coinPoints: 70,
            gatePoints: 0,
            multipliers: [1],
            finalMult: 1,
            maxMult: 1,
        });
    });

    it('doğru kapılar çarpanı artırır (en fazla x5), yanlış x1\'e düşürür', () => {
        const gates = [0, 1, 2, 3, 4, 5].map((index) => ({ index, lane: 1, tick: index * 100 }));
        const segMm = [1000, 1000, 1000, 1000, 1000, 1000, 1500];
        const correct = [true, true, true, true, true, false];
        const r = computeScore({ segMm, coins: 0, gates, correct });
        expect(r.multipliers).toEqual([1, 2, 3, 4, 5, 5, 1]);
        expect(r.gatePoints).toBe(200 * (2 + 3 + 4 + 5 + 5));
        expect(r.distPoints).toBe(1 + 2 + 3 + 4 + 5 + 5 + 1); // 1500 × 1 / 1000 → 1 (aşağı)
        expect(r.finalMult).toBe(1);
        expect(r.maxMult).toBe(5);
        expect(r.score).toBe(r.distPoints + r.gatePoints);
    });

    it('sonucu bilinmeyen kapı çarpanı değiştirmez', () => {
        const gates = [{ index: 0, lane: 0, tick: 1 }, { index: 1, lane: 2, tick: 2 }];
        const r = computeScore({ segMm: [2000, 2000, 2000], coins: 1, gates, correct: [true, null] });
        expect(r.multipliers).toEqual([1, 2, 2]);
        expect(r.distPoints).toBe(2 + 4 + 4);
        expect(r.gatePoints).toBe(400);
        expect(r.coinPoints).toBe(10);
        const none = computeScore({ segMm: [2000, 2000, 2000], coins: 1, gates });
        expect(none.multipliers).toEqual([1, 1, 1]);
    });

    it('bölme aşağı yuvarlanır (Σ önce, sonra /1000)', () => {
        const gates = [{ index: 0, lane: 1, tick: 5 }];
        const r = computeScore({ segMm: [999, 999], coins: 0, gates, correct: [true] });
        // 999×1 + 999×2 = 2997 → 2
        expect(r.distPoints).toBe(2);
    });
});

describe('hash (FNV-1a 32)', () => {
    it('bilinen vektörler', () => {
        expect(fnv1a('')).toBe(0x811c9dc5);
        expect(fnv1a('a')).toBe(0xe40c292c);
        expect(fnv1a('foobar')).toBe(0xbf9cf968);
        expect(fnv1aBytes(new TextEncoder().encode('foobar'))).toBe(0xbf9cf968);
    });

    it('stateHash alanları sırayla "|" ile birleştirir (v2: grounded, superTicks)', () => {
        const s = {
            tick: 12, z: 3456, x: -2500, lane: 0, y: 140, vy: -7, grounded: false, slideTicks: 0, jumpBuffer: 3,
            stumbleTicks: 0, invulnTicks: 0, magnetTicks: 599, superTicks: 77, shield: true, crashed: false,
            coins: 4, gates: [{}, {}],
        };
        expect(stateHash(s)).toBe(fnv1a('12|3456|-2500|0|140|-7|0|0|3|0|0|599|77|1|0|4|2'));
        expect(stateHash(s)).toBe(3754951552); // PHP portu aynı sayıyı üretmeli (Python ile de doğrulandı)
        expect(stateHash({ ...s, grounded: true, y: 2700, vy: 0 })).toBe(fnv1a('12|3456|-2500|0|2700|0|1|0|3|0|0|599|77|1|0|4|2'));
    });

    it('başlangıç durumunun hash\'i', () => {
        const sim = createSim({ seed: 1, gateCount: 0 });
        expect(stateHash(sim.state)).toBe(fnv1a('0|0|0|1|0|0|1|0|0|0|0|0|0|0|0|0|0'));
        expect(stateHash(sim.state)).toBe(3864159127);
    });
});

describe('createSim doğrulaması', () => {
    it('geçersiz seed / gateCount reddedilir', () => {
        expect(() => createSim({ seed: -1, gateCount: 0 })).toThrow();
        expect(() => createSim({ seed: 2 ** 32, gateCount: 0 })).toThrow();
        expect(() => createSim({ seed: 1.5, gateCount: 0 })).toThrow();
        expect(() => createSim({ seed: '5', gateCount: 0 })).toThrow();
        expect(() => createSim({ seed: 5, gateCount: 256 })).toThrow();
        expect(() => createSim({ seed: 5, gateCount: -1 })).toThrow();
        expect(() => createSim({ seed: 0xffffffff, gateCount: 255 })).not.toThrow();
    });
});
