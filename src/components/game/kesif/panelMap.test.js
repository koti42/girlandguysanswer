import { describe, expect, it } from 'vitest';
import {
    bearingLabel, buildTileRGBA, localScale, overviewView, centerOn, clampCenter, fitScale, formatDistance, hitTestMarker, listPlaces, mapBounds, mapSummary,
    markerInfo, normalizeMarkers, panBy, parseColor, scaleLimits, screenToWorld, shapePoints, toCssColor, worldToScreen, zoneRings, zoomAt,
} from './panelMap.js';
import { WORLD_RADIUS, ZONES } from '../../../game/kesif/sim/constants.js';

describe('mapBounds', () => {
    it('bounds, sayı, {x,z}, {w,h} ve varsayılan', () => {
        expect(mapBounds({ bounds: { minX: -10, minZ: -20, maxX: 30, maxZ: 40 } })).toEqual({ minX: -10, minZ: -20, maxX: 30, maxZ: 40 });
        expect(mapBounds({ size: 200 })).toEqual({ minX: -100, minZ: -100, maxX: 100, maxZ: 100 });
        expect(mapBounds({ size: { x: 100, z: 60 } })).toEqual({ minX: -50, minZ: -30, maxX: 50, maxZ: 30 });
        expect(mapBounds({ size: { w: 40, h: 40 } }).maxX).toBe(20);
        const def = mapBounds({});
        expect(def.maxX).toBe(WORLD_RADIUS);
        expect(mapBounds(null).minZ).toBe(-WORLD_RADIUS);
    });
    it('bozuk bounds yok sayılır', () => {
        expect(mapBounds({ bounds: { minX: 5, minZ: 5, maxX: 1, maxZ: 9 }, size: 100 }).maxX).toBe(50);
        expect(mapBounds({ bounds: { minX: NaN, minZ: 0, maxX: 1, maxZ: 1 }, size: 100 }).maxX).toBe(50);
    });
});

describe('görünüm dönüşümleri', () => {
    const bounds = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };
    const view = { cx: 10, cz: -20, scale: 2 };
    it('worldToScreen ve screenToWorld birbirinin tersi', () => {
        const s = worldToScreen(view, 400, 300, 25, 5);
        const w = screenToWorld(view, 400, 300, s[0], s[1]);
        expect(w[0]).toBeCloseTo(25);
        expect(w[1]).toBeCloseTo(5);
        expect(worldToScreen(view, 400, 300, 10, -20)).toEqual([200, 150]);
    });
    it('fitScale / scaleLimits', () => {
        expect(fitScale(bounds, 400, 200)).toBe(1);
        const l = scaleLimits(bounds, 400, 400);
        expect(l.min).toBeCloseTo(2 * 0.6);
        expect(l.max).toBeGreaterThan(l.fit);
    });
    it('zoomAt işaretçinin altındaki dünya noktasını sabit tutar', () => {
        const lim = scaleLimits(bounds, 400, 300);
        const before = screenToWorld(view, 400, 300, 120, 80);
        const next = zoomAt(view, 1.5, 120, 80, 400, 300, lim);
        const after = screenToWorld(next, 400, 300, 120, 80);
        expect(next.scale).toBeCloseTo(3);
        expect(after[0]).toBeCloseTo(before[0]);
        expect(after[1]).toBeCloseTo(before[1]);
    });
    it('zoomAt ölçeği sınırlar', () => {
        const lim = scaleLimits(bounds, 400, 300);
        expect(zoomAt(view, 1e6, 0, 0, 400, 300, lim).scale).toBe(lim.max);
        expect(zoomAt(view, 1e-6, 0, 0, 400, 300, lim).scale).toBe(lim.min);
    });
    it('panBy sürükleme yönünün tersine merkezi kaydırır ve sınırlar', () => {
        const p = panBy({ cx: 0, cz: 0, scale: 2 }, 40, -20);
        expect(p).toEqual({ cx: -20, cz: 10, scale: 2 });
        const far = panBy({ cx: 0, cz: 0, scale: 1 }, -1e6, 0, bounds);
        expect(far.cx).toBe(bounds.maxX + 20);
        expect(clampCenter({ cx: -1e9, cz: 1e9, scale: 1 }, bounds)).toEqual({ cx: -120, cz: 120, scale: 1 });
        expect(centerOn({ cx: 0, cz: 0, scale: 3 }, 5, 6).scale).toBe(3);
    });
});

describe('renkler ve kare dokusu', () => {
    it('parseColor çeşitli biçimleri okur', () => {
        expect(parseColor('#ff8000')).toEqual([255, 128, 0]);
        expect(parseColor('0a0b0c')).toEqual([10, 11, 12]);
        expect(parseColor('#f80')).toEqual([255, 136, 0]);
        expect(parseColor(0x112233)).toEqual([17, 34, 51]);
        expect(parseColor('mavi')).toEqual([128, 128, 128]);
        expect(parseColor(null)).toEqual([128, 128, 128]);
    });
    it('toCssColor yalnız güvenli renk döndürür', () => {
        expect(toCssColor('#abc')).toBe('#abc');
        expect(toCssColor(0xff0000)).toBe('#ff0000');
        expect(toCssColor('red;background:url(x)')).toBe('#ffd36b');
        expect(toCssColor(undefined, '#000')).toBe('#000');
    });
    it('buildTileRGBA: 0 = sis, v>=1 = palette[v-1]', () => {
        const t = buildTileRGBA({ w: 2, h: 2, data: Uint8Array.from([0, 1, 2, 9]), palette: ['#ff0000', '#00ff00'] });
        expect(t.w).toBe(2);
        expect(t.known).toBe(3);
        expect(Array.from(t.rgba.slice(4, 8))).toEqual([255, 0, 0, 255]);
        expect(Array.from(t.rgba.slice(8, 12))).toEqual([0, 255, 0, 255]);
        expect(Array.from(t.rgba.slice(12, 16))).toEqual([128, 128, 128, 255]); // palet dışı
        expect(t.rgba[0]).toBeLessThan(40); // sis koyu
        expect(t.rgba[3]).toBe(255);
    });
    it('paletteBase 1: palette[v]', () => {
        const t = buildTileRGBA({ w: 1, h: 1, data: Uint8Array.from([1]), palette: ['#000000', '#102030'], paletteBase: 1 });
        expect(Array.from(t.rgba.slice(0, 3))).toEqual([16, 32, 48]);
    });
    it('geçersiz tiles boş döner', () => {
        expect(buildTileRGBA(null).w).toBe(0);
        expect(buildTileRGBA({ w: 0, h: 4, data: new Uint8Array(0) }).rgba.length).toBe(0);
        expect(buildTileRGBA({ w: 2, h: 2 }).w).toBe(0);
    });
});

describe('yönler, uzaklık, işaretler', () => {
    it('bearingLabel: kuzey = −Z, doğu = +X', () => {
        expect(bearingLabel(0, -10)).toBe('kuzey');
        expect(bearingLabel(10, 0)).toBe('doğu');
        expect(bearingLabel(0, 10)).toBe('güney');
        expect(bearingLabel(-10, 0)).toBe('batı');
        expect(bearingLabel(10, -10)).toBe('kuzeydoğu');
        expect(bearingLabel(10, 10)).toBe('güneydoğu');
        expect(bearingLabel(-10, 10)).toBe('güneybatı');
        expect(bearingLabel(-10, -10)).toBe('kuzeybatı');
        expect(bearingLabel(0, 0)).toBe('tam burada');
    });
    it('formatDistance', () => {
        expect(formatDistance(0)).toBe('0 m');
        expect(formatDistance(123.6)).toBe('124 m');
        expect(formatDistance(1500)).toBe('1,5 km');
        expect(formatDistance(-5)).toBe('0 m');
        expect(formatDistance(NaN)).toBe('0 m');
    });
    it('markerInfo prototip anahtarlarına karşı güvenli', () => {
        expect(markerInfo('gozcukulesi').label).toBe('Gözcü Kulesi');
        expect(markerInfo('constructor').label).toBe('Yer');
        expect(markerInfo(undefined).shape).toBe('circle');
    });
    it('shapePoints her şekil için çokgen, daire için null', () => {
        ['square', 'diamond', 'triangle', 'hex', 'star', 'cross', 'flag', 'arrow'].forEach((s) => {
            const p = shapePoints(s, 10, 10, 8);
            expect(p.length).toBeGreaterThanOrEqual(3);
            p.forEach((q) => q.forEach((v) => expect(Number.isFinite(v)).toBe(true)));
        });
        expect(shapePoints('circle', 0, 0, 5)).toBeNull();
    });
    const raw = [
        { type: 'gozcukulesi', name: 'Kuzey Kulesi', x: 0, z: -100, discovered: true, color: '#ffcc00' },
        { type: 'hazine', name: 'Hazine', x: 30, z: 40, discovered: true },
        { type: 'turbe', name: 'Gizli', x: 500, z: 500, discovered: false },
        { type: 'kamp', name: 'Bozuk', x: 'a', z: 1 },
        null,
        { type: 'harabe', x: 10, z: 10, color: 'url(javascript:x)' },
    ];
    it('normalizeMarkers bozukları atar, rengi güvenli yapar, adı varsayılana düşürür', () => {
        const m = normalizeMarkers(raw);
        expect(m.length).toBe(4);
        expect(m[0]).toMatchObject({ name: 'Kuzey Kulesi', shape: 'flag', discovered: true });
        expect(m[2].discovered).toBe(false);
        expect(m[3].name).toBe('Harabe');
        expect(m[3].color).toBe('#ffd36b');
        expect(normalizeMarkers(null)).toEqual([]);
        expect(new Set(m.map((x) => x.key)).size).toBe(4);
    });
    it('listPlaces yalnız keşfedilenleri yakından uzağa sıralar', () => {
        const m = normalizeMarkers(raw);
        const list = listPlaces(m, { x: 0, z: 0 });
        expect(list.map((p) => p.name)).toEqual(['Harabe', 'Hazine', 'Kuzey Kulesi']);
        expect(list[0].dist).toBeCloseTo(Math.hypot(10, 10));
        expect(list[2].dir).toBe('kuzey');
        expect(listPlaces(m, null).length).toBe(3);
    });
    it('hitTestMarker yarıçap içindeki en yakın işareti bulur', () => {
        const m = normalizeMarkers(raw);
        const view = { cx: 0, cz: 0, scale: 1 };
        const s = worldToScreen(view, 400, 300, 30, 40);
        expect(hitTestMarker(m, view, 400, 300, s[0] + 3, s[1] - 2, 14).name).toBe('Hazine');
        expect(hitTestMarker(m, view, 400, 300, 5, 5, 14)).toBeNull();
        // keşfedilmemiş de seçilebilir
        const u = worldToScreen(view, 1000, 1000, 500, 500);
        expect(hitTestMarker(m, view, 1000, 1000, u[0], u[1], 14).discovered).toBe(false);
    });
    it('zoneRings bölge tablosunu izler; zones verilirse kilit durumu eklenir', () => {
        const r = zoneRings({});
        expect(r.length).toBe(ZONES.length);
        expect(r[0].unlocked).toBeNull();
        expect(r[1].r).toBe(ZONES[1].rOut);
        const r2 = zoneRings({ zones: [{ id: 0, unlocked: true }, { id: 1, unlocked: false }] });
        expect(r2[0].unlocked).toBe(true);
        expect(r2[1].unlocked).toBe(false);
        expect(r2[2].unlocked).toBeNull();
    });
    it('mapSummary sayıları ve bölgeyi söyler', () => {
        const s = mapSummary({ zone: { name: 'Başlangıç Vadisi' } }, normalizeMarkers(raw));
        expect(s).toContain('Başlangıç Vadisi');
        expect(s).toContain('3 keşfedilmiş yer');
        expect(s).toContain('1 keşfedilmemiş');
    });

    it('localScale makul aralıkta', () => {
        expect(localScale(480)).toBe(2);
        expect(localScale(10)).toBe(0.5);
        expect(localScale(1e6)).toBe(12);
    });
    it('overviewView: keşfedilmiş yerleri ve oyuncuyu kapsar; gizli yerleri saymaz', () => {
        const bounds = { minX: -352, minZ: -352, maxX: 352, maxZ: 352 };
        const markers = normalizeMarkers([
            { type: 'kamp', name: 'A', x: 100, z: 100, discovered: true },
            { type: 'kamp', name: 'B', x: -100, z: -100, discovered: true },
            { type: 'kamp', name: 'Gizli', x: 340, z: 340, discovered: false },
        ]);
        const v = overviewView(bounds, 640, 400, { x: 0, z: 0 }, markers);
        expect(v.cx).toBeCloseTo(0);
        expect(v.cz).toBeCloseTo(0);
        // 300 blok genişlik (200 + 100 pay) 640 px'e sığmalı
        expect(v.scale).toBeLessThanOrEqual(640 / 300 + 1e-9);
        expect(v.scale).toBeLessThanOrEqual(400 / 300 + 1e-9);
        const a = worldToScreen(v, 640, 400, 100, 100);
        expect(a[0]).toBeGreaterThan(0);
        expect(a[0]).toBeLessThan(640);
        expect(a[1]).toBeLessThan(400);
    });
    it('overviewView: yer yoksa oyuncuda yakın plan; ölçek sınırlı', () => {
        const bounds = { minX: -100, minZ: -100, maxX: 100, maxZ: 100 };
        const v = overviewView(bounds, 640, 400, { x: 30, z: -20 }, []);
        expect(v.cx).toBe(30);
        expect(v.cz).toBe(-20);
        const lim = scaleLimits(bounds, 640, 400);
        expect(v.scale).toBeLessThanOrEqual(lim.max);
        expect(v.scale).toBeGreaterThanOrEqual(lim.min);
        expect(overviewView(bounds, 640, 400, null, null).cx).toBe(0);
    });
});
