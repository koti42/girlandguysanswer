import { describe, expect, it, vi } from 'vitest';
import { createHaptics, hapticStyleFor, HAPTIC_COIN_MIN_MS } from './haptics.js';
import { DAY_CYCLE_M, nightAmount, normalizeTimeMode, tunnelBlend } from './ambience.js';
import { cameraHeightTarget } from './cameraMath.js';
import { SKY_PALETTES } from './palette.js';
import { resolveAvatar } from './game.js';
import { BUS_COLORS, CAR_COLORS, TAXI_COLOR, TRAM_COLOR, vehicleLook } from './entities.js';
import { TRAIL_KINDS } from './trail.js';
import { STYLES, isValidAvatar } from '../../avatar/catalog.js';
import { tunnelAt } from '../sim/index.js';

/*
 * Motor v2'nin three'ye/DOM'a dokunmayan kuralları: titreşim eşlemesi ve
 * seyreltme, gün/gece ve tünel karartması, kamera yükseklik hedefi, avatar
 * geriye uyumu, araç görünüm seçimi.
 */

describe('titreşim (onHaptic, şartname E.6)', () => {
    it('olaylar şartnamedeki stillere eşlenir', () => {
        expect(hapticStyleFor('coin')).toBe('light');
        expect(hapticStyleFor('jump')).toBe('light');
        expect(hapticStyleFor('land', 'bus')).toBe('medium');
        expect(hapticStyleFor('land', 'car')).toBe('medium');
        expect(hapticStyleFor('stumble')).toBe('warning');
        expect(hapticStyleFor('crash')).toBe('heavy');
        expect(hapticStyleFor('gateCorrect')).toBe('success');
        expect(hapticStyleFor('gateWrong')).toBe('error');
        expect(hapticStyleFor('power')).toBe('medium');
    });

    it('zemine/rampaya iniş, şerit ve kayma titreşmez', () => {
        expect(hapticStyleFor('land', 'ground')).toBeNull();
        expect(hapticStyleFor('land', 'ramp')).toBeNull();
        expect(hapticStyleFor('lane')).toBeNull();
        expect(hapticStyleFor('slide')).toBeNull();
        expect(hapticStyleFor('bilinmeyen')).toBeNull();
    });

    it('jeton titreşimi en fazla saniyede 10 (100 ms aralık); diğerleri seyreltilmez', () => {
        let t = 0;
        const emit = vi.fn();
        const h = createHaptics(emit, { now: () => t });
        // 1 saniye boyunca her 16 ms'de bir jeton
        for (t = 0; t < 1000; t += 16) h('coin');
        const coins = emit.mock.calls.filter((c) => c[0] === 'light').length;
        expect(coins).toBeLessThanOrEqual(10);
        expect(coins).toBeGreaterThanOrEqual(8);
        emit.mockClear();
        h('crash');
        h('crash');
        expect(emit).toHaveBeenCalledTimes(2);
        expect(HAPTIC_COIN_MIN_MS).toBe(100);
    });

    it('emit hatası oyunu durdurmaz', () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const h = createHaptics(() => {
            throw new Error('köprü yok');
        });
        expect(() => h('crash')).not.toThrow();
        err.mockRestore();
    });
});

describe('ortam: gün/gece ve tünel', () => {
    it('sabit kipler ve bilinmeyen kip', () => {
        expect(nightAmount(500, 'night')).toBe(1);
        expect(nightAmount(500, 'day')).toBeLessThan(0.15);
        expect(nightAmount(500, 'dusk')).toBeCloseTo(0.55, 5);
        expect(normalizeTimeMode('öğle')).toBe('auto');
    });

    it("'auto' alacakaranlıkta başlar, geceye ve altın saate döner, döngüseldir", () => {
        expect(nightAmount(0)).toBeCloseTo(0.55, 5);
        expect(nightAmount(DAY_CYCLE_M / 4)).toBeCloseTo(1, 5);
        expect(nightAmount((DAY_CYCLE_M * 3) / 4)).toBeCloseTo(0.1, 5);
        expect(nightAmount(DAY_CYCLE_M + 123)).toBeCloseTo(nightAmount(123), 9);
        for (let d = 0; d < DAY_CYCLE_M; d += 37) {
            const n = nightAmount(d);
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(1);
            // Ani geçiş yok: 10 m'de en fazla ~0.011
            expect(Math.abs(nightAmount(d + 10) - n)).toBeLessThan(0.012);
        }
        expect(nightAmount(NaN)).toBeCloseTo(0.55, 5);
    });

    it('tünel karartması: dışarıda 0, ortada 1, girişte kademeli', () => {
        // chunk 16..19 tünel (480..600 m)
        const isT = (c) => c >= 16 && c <= 19;
        expect(tunnelBlend(400, isT)).toBe(0);
        expect(tunnelBlend(540, isT)).toBe(1);
        const atDoor = tunnelBlend(480.5, isT);
        expect(atDoor).toBeGreaterThan(0.4);
        expect(atDoor).toBeLessThan(0.6);
        expect(tunnelBlend(475, isT)).toBeGreaterThan(0);
        expect(tunnelBlend(475, isT)).toBeLessThan(atDoor);
        expect(tunnelBlend(605, isT)).toBeGreaterThan(0);
        expect(tunnelBlend(620, isT)).toBe(0);
        // Monoton kararma girişte
        let prev = 0;
        for (let z = 468; z <= 500; z += 1) {
            const b = tunnelBlend(z, isT);
            expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = b;
        }
        expect(tunnelBlend(-5, isT)).toBe(0);
    });

    it("sim'in tunnelAt kuralıyla çalışır (kapı chunk'ları tünel değil)", () => {
        const gates = 4;
        const isT = (c) => tunnelAt(c, gates);
        expect(isT(16)).toBe(true);
        expect(tunnelBlend(16 * 30 + 15, isT)).toBeGreaterThan(0.9);
        // Kapı 1'in yaklaşma/çıkış chunk'ları (20, 21, 22) asla tünel değil
        for (const c of [20, 21, 22]) expect(isT(c)).toBe(false);
    });

    it('palet: üç ortam da gerekli anahtarlara sahip', () => {
        for (const k of ['day', 'dusk', 'night']) {
            const p = SKY_PALETTES[k];
            for (const key of ['skyTop', 'skyMid', 'skyLow', 'horizon', 'fog', 'hemi', 'keyI', 'rimI', 'windows', 'road']) {
                expect(p[key]).toBeTypeOf('number');
            }
        }
        expect(SKY_PALETTES.night.windows).toBeGreaterThan(SKY_PALETTES.day.windows);
    });
});

describe('kamera yükseklik hedefi', () => {
    it('zeminde zıplamanın %32si izlenir', () => {
        expect(cameraHeightTarget(0, 0)).toBe(0);
        expect(cameraHeightTarget(1.4, 0)).toBeCloseTo(0.448, 6);
    });

    it('çatıda destek büyük ölçüde izlenir ve kamera biraz fazladan yükselir', () => {
        const roof = cameraHeightTarget(2.7, 2.7);
        expect(roof).toBeGreaterThan(2.7 * 0.88);
        expect(roof).toBeCloseTo(2.7 * 0.88 + 0.35, 6);
        // Araba (1.2 m) arada: kısmi yükselme
        const car = cameraHeightTarget(1.2, 1.2);
        expect(car).toBeGreaterThan(1.2 * 0.88);
        expect(car).toBeLessThan(1.2 * 0.88 + 0.35);
    });

    it('geçersiz girdi güvenli', () => {
        expect(cameraHeightTarget(NaN, NaN)).toBe(0);
        expect(cameraHeightTarget(1, -3)).toBeCloseTo(0.32, 6);
    });
});

describe('avatar seçeneği', () => {
    it("avatar verilirse o kullanılır (normalize edilir)", () => {
        const a = resolveAvatar({ v: 1, body: 'erkek', skin: 4, hair: { style: 'mohawk', color: 7 }, top: { style: 'forma', color: 4 }, bottom: { style: 'sort', color: 1 }, shoes: { style: 'neon', color: 6 }, acc: 'tac', trail: 'neon' });
        expect(isValidAvatar(a)).toBe(true);
        expect(a.hair.style).toBe('mohawk');
        expect(a.trail).toBe('neon');
    });

    it('avatar yoksa ya da bozuksa geçerli varsayılan', () => {
        expect(isValidAvatar(resolveAvatar())).toBe(true);
        expect(isValidAvatar(resolveAvatar('kiz'))).toBe(true);
        const partial = resolveAvatar({ body: 'erkek' });
        expect(partial.body).toBe('erkek');
        expect(isValidAvatar(partial)).toBe(true);
    });

    it('koşu izi türleri katalogla birebir', () => {
        expect(TRAIL_KINDS).toEqual(STYLES.trail.map((t) => t.id));
    });
});

describe('araç görünümü', () => {
    it('belirlenimci ve paletten', () => {
        for (let id = 0; id < 200; id++) {
            const c = vehicleLook('car', id);
            expect(c).toEqual(vehicleLook('car', id));
            expect(c.taxi ? c.color === TAXI_COLOR : CAR_COLORS.includes(c.color)).toBe(true);
            const b = vehicleLook('bus', id);
            expect(b.tram ? b.color === TRAM_COLOR : BUS_COLORS.includes(b.color)).toBe(true);
        }
    });

    it('çeşitlilik: taksi ve renkli araba, tramvay ve otobüs birlikte görülür', () => {
        const cars = Array.from({ length: 300 }, (_, i) => vehicleLook('car', i * 64 + 3));
        const taxis = cars.filter((c) => c.taxi).length;
        expect(taxis).toBeGreaterThan(60);
        expect(taxis).toBeLessThan(200);
        expect(new Set(cars.filter((c) => !c.taxi).map((c) => c.color)).size).toBeGreaterThanOrEqual(4);
        const buses = Array.from({ length: 300 }, (_, i) => vehicleLook('bus', i * 64 + 1));
        const trams = buses.filter((b) => b.tram).length;
        expect(trams).toBeGreaterThan(90);
        expect(trams).toBeLessThan(210);
    });
});
