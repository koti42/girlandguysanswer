import { describe, expect, it } from 'vitest';
import { HUE_STEP, NEON_FLOOR, SKY_KEYS, createSkyState, floorColor, hexToRgb, hslToRgb, paletteHue, skyAt } from './palette.js';
import {
    BASE_H,
    FLOOR_H,
    MAX_DIST,
    MIN_DIST,
    REVEAL_MAX_DIST,
    cameraDir,
    debrisKick,
    fitDistance,
    floorCenterY,
    floorTopY,
    pingPongMm,
    PLAY_FY_LAND,
    PLAY_FY_PORTRAIT,
    playDistance,
    playPitch,
    playTargetFy,
    rectCoversPoint,
    revealDistance,
} from './cameraMath.js';
import { comboFrequency } from './audio.js';
import { keyAction } from './input.js';
import { TC, offsetAt, speedFor } from '../sim/index.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe('palette', () => {
    it('hex ve HSL dönüşümleri', () => {
        expect(hexToRgb('#ff8000')).toEqual([1, 128 / 255, 0]);
        expect(hexToRgb(0x00ff00)).toEqual([0, 1, 0]);
        const red = hslToRgb(0, 1, 0.5);
        expect(red.map((v) => Math.round(v * 255))).toEqual([255, 0, 0]);
        // Negatif ton da [0,1)'e sarılır
        expect(hslToRgb(-1 / 3, 1, 0.5).map((v) => Math.round(v * 255))).toEqual([0, 0, 255]);
    });

    it('taban koyu; katlar pastelden neona, ton kat kat kayar', () => {
        const base = floorColor(0, 0.5);
        expect(Math.max(...base)).toBeLessThan(0.4);
        const sat = (c) => Math.max(...c) - Math.min(...c);
        const f1 = floorColor(1, 0.2);
        const fNeon = floorColor(NEON_FLOOR + 10, 0.2);
        expect(sat(fNeon)).toBeGreaterThan(sat(f1));
        // Açık pastel ile başlar
        expect(Math.min(...f1)).toBeGreaterThan(0.45);
        // Komşu katlar farklı tonda
        expect(floorColor(10, 0.2)).not.toEqual(floorColor(11, 0.2));
        expect(HUE_STEP).toBeGreaterThan(0);
        for (const k of [1, 7, 50, 200, 999]) {
            for (const v of floorColor(k, 0.73)) {
                expect(v).toBeGreaterThanOrEqual(0);
                expect(v).toBeLessThanOrEqual(1);
            }
        }
    });

    it('paletteHue tohumdan deterministik, tohumsuz sabit', () => {
        expect(paletteHue(1234)).toBe(paletteHue(1234));
        expect(paletteHue(1234)).not.toBe(paletteHue(1235));
        expect(paletteHue(null)).toBe(paletteHue(undefined));
        const h = paletteHue(0xffffffff);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
    });

    it('gökyüzü: gün batımı → gece → yıldızlar → (150+) kuzey ışıkları', () => {
        const s = createSkyState();
        skyAt(0, s);
        expect(s.sun).toBe(1);
        expect(s.stars).toBe(0);
        expect(s.aurora).toBe(0);
        skyAt(90, s);
        expect(s.sun).toBe(0);
        expect(s.stars).toBeGreaterThan(0.7);
        expect(s.aurora).toBe(0);
        skyAt(130, s);
        expect(s.aurora).toBe(0);
        skyAt(160, s);
        expect(s.aurora).toBeGreaterThan(0.4);
        skyAt(10000, s);
        expect(s.aurora).toBe(1);
        // Gece pencere ışıkları artar
        const n0 = skyAt(0, createSkyState()).night;
        const n1 = skyAt(100, createSkyState()).night;
        expect(n1).toBeGreaterThan(n0);
    });

    it('skyAt aynı nesneye yazar, anahtarlarda tam değer, aralarda arada', () => {
        const s = createSkyState();
        const top = s.top;
        skyAt(SKY_KEYS[2].at, s);
        expect(s.top).toBe(top);
        const k = hexToRgb(SKY_KEYS[2].top);
        expect(s.top.every((v, i) => close(v, k[i]))).toBe(true);
        const mid = (SKY_KEYS[0].at + SKY_KEYS[1].at) / 2;
        skyAt(mid, s);
        expect(s.sun).toBeLessThan(SKY_KEYS[0].sun);
        expect(s.sun).toBeGreaterThan(SKY_KEYS[1].sun);
        // Bozuk girdi tabana düşer
        skyAt(NaN, s);
        expect(s.sun).toBe(1);
        skyAt(-50, s);
        expect(s.sun).toBe(1);
    });
});

describe('kamera ve geometri', () => {
    it('kat yükseklikleri', () => {
        expect(floorTopY(0)).toBe(0);
        expect(floorTopY(-3)).toBe(0);
        expect(floorTopY(4)).toBeCloseTo(4 * FLOOR_H);
        expect(floorCenterY(1)).toBeCloseTo(FLOOR_H / 2);
        expect(BASE_H).toBeGreaterThan(0);
    });

    it('pingPongMm tamsayı t\'de sim offsetAt ile birebir, aralarda sürekli', () => {
        for (const floor of [1, 4, 30, 80, 200]) {
            const v = speedFor(floor);
            for (let t = 0; t < 600; t++) {
                expect(pingPongMm(t, v, TC.R)).toBe(offsetAt(t, v));
            }
            // Kesirli t komşu tick'lerin arasında (dönüş noktası hariç tek yönlü)
            const a = pingPongMm(10, v, TC.R);
            const b = pingPongMm(11, v, TC.R);
            const m = pingPongMm(10.5, v, TC.R);
            expect(m).toBeGreaterThanOrEqual(Math.min(a, b) - 1e-9);
            expect(m).toBeLessThanOrEqual(Math.max(a, b) + 1e-9);
        }
        expect(pingPongMm(0, 60, TC.R)).toBe(-TC.R);
    });

    it('kadraj: dikey ekranda genişlik, yatayda yükseklik belirler; sınırlar içinde', () => {
        const portrait = fitDistance(390 / 844, 44, 10, 10);
        const landscape = fitDistance(1366 / 800, 44, 10, 10);
        expect(portrait).toBeGreaterThan(landscape);
        expect(fitDistance(0, 44, 10, 10)).toBe(fitDistance(1, 44, 10, 10));
        for (const a of [0.3, 0.46, 1, 1.78, 3]) {
            const d = playDistance(a, 44);
            expect(d).toBeGreaterThanOrEqual(MIN_DIST);
            expect(d).toBeLessThanOrEqual(MAX_DIST);
        }
    });

    it('geri çekilme mesafesi kuleyle büyür ve üst sınırla kesilir', () => {
        const a = 390 / 844;
        expect(revealDistance(100, a, 44)).toBeGreaterThan(revealDistance(10, a, 44));
        expect(revealDistance(100000, a, 44)).toBe(REVEAL_MAX_DIST);
        expect(revealDistance(0, 1.6, 44)).toBeGreaterThanOrEqual(MIN_DIST);
    });

    it('bakış açısı: yatayda eski kadraj (PITCH 0.136), dikeyde kule tepesi ortaya yaklaşır', () => {
        const EL = 0.22;
        const tv = Math.tan((44 * Math.PI) / 360);
        expect(playTargetFy(16 / 9)).toBe(PLAY_FY_LAND);
        expect(playTargetFy(1)).toBe(PLAY_FY_LAND);
        expect(playTargetFy(0.45)).toBeCloseTo(PLAY_FY_PORTRAIT, 9);
        expect(playTargetFy(0.3)).toBeCloseTo(PLAY_FY_PORTRAIT, 9);
        expect(playTargetFy(0.46)).toBeGreaterThan(playTargetFy(0.75));
        expect(playTargetFy(NaN)).toBe(PLAY_FY_LAND);
        expect(playPitch(16 / 9, 44, EL)).toBeCloseTo(0.136, 2);
        // Tepenin ekrandaki yeri: NDC y = -tan(el - pitch) / tan(vfov/2)
        const fy = (aspect) => -Math.tan(EL - playPitch(aspect, 44, EL)) / tv;
        expect(fy(16 / 9)).toBeCloseTo(-0.21, 6);
        // Telefon dikey (≈0,46): tepe ekranın üstünden ~%46 aşağıda
        const down = (1 - fy(0.46)) / 2;
        expect(down).toBeGreaterThan(0.44);
        expect(down).toBeLessThan(0.48);
    });

    it('hareketli kat karakterin ayaklarını payla örtüyor mu', () => {
        const r = { x0: -1500, x1: 1500, z0: 1000, z1: 4000 };
        expect(rectCoversPoint(r, 0, 2000)).toBe(true);
        expect(rectCoversPoint(r, 0, 0)).toBe(false);
        expect(rectCoversPoint(r, 0, 800, 250)).toBe(true);
        expect(rectCoversPoint(r, 0, 700, 250)).toBe(false);
        expect(rectCoversPoint(r, 1700, 2000, 250)).toBe(true);
        expect(rectCoversPoint(r, 1800, 2000, 250)).toBe(false);
    });

    it('kamera yönü birim vektör', () => {
        const d = cameraDir(Math.PI / 4, 0.22);
        expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
        expect(d.x).toBeCloseTo(d.z);
        expect(d.y).toBeGreaterThan(0);
    });

    it('düşen parça kesik tarafa doğru itilir ve kenardan devrilir', () => {
        const px = debrisKick('x', 1);
        expect(px.vx).toBeGreaterThan(0);
        expect(px.vz).toBe(0);
        expect(px.wz).toBeLessThan(0);
        expect(px.wx).toBe(0);
        const nz = debrisKick('z', -1);
        expect(nz.vz).toBeLessThan(0);
        expect(nz.vx).toBe(0);
        expect(nz.wx).toBeLessThan(0);
    });
});

describe('ses ve girdi (saf)', () => {
    it('kombo notası pentatonikte yükselir, 5\'te bir oktav, tavanlı', () => {
        const f1 = comboFrequency(1);
        const f2 = comboFrequency(2);
        const f6 = comboFrequency(6);
        expect(f1).toBeCloseTo(523.25, 1);
        expect(f2).toBeGreaterThan(f1);
        expect(f6).toBeCloseTo(f1 * 2, 1);
        expect(comboFrequency(99)).toBe(comboFrequency(16));
        expect(comboFrequency(0)).toBe(f1);
        for (let c = 1; c < 16; c++) expect(comboFrequency(c + 1)).toBeGreaterThan(comboFrequency(c));
    });

    it('tuş eşlemesi: Boşluk/Enter bırakır, ok ve 1/2 şık seçer, kısayollar yok sayılır', () => {
        expect(keyAction({ code: 'Space', key: ' ' })).toEqual({ kind: 'tap' });
        expect(keyAction({ code: 'Enter', key: 'Enter' })).toEqual({ kind: 'tap' });
        expect(keyAction({ code: 'NumpadEnter', key: 'Enter' })).toEqual({ kind: 'tap' });
        expect(keyAction({ code: 'ArrowLeft' })).toEqual({ kind: 'choice', choice: 0 });
        expect(keyAction({ code: 'Digit2' })).toEqual({ kind: 'choice', choice: 1 });
        expect(keyAction({ code: 'KeyB' })).toEqual({ kind: 'choice', choice: 1 });
        expect(keyAction({ code: 'Space', key: ' ', ctrlKey: true })).toBeNull();
        expect(keyAction({ code: 'KeyX', key: 'x' })).toBeNull();
        expect(keyAction(null)).toBeNull();
        // "constructor" gibi prototip anahtarları eşleşmez
        expect(keyAction({ code: 'constructor' })).toBeNull();
    });
});
