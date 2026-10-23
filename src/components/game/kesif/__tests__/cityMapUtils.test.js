import { describe, expect, it } from 'vitest';
import {
  CITY_MARKER_TYPES, DISTRICT_TOTAL, cityMapSummary, cityOverview, districtSummary, drawCityUnder, knownBounds, legendRows, normalizeCityMarkers, travelIdOf, travelRow,
} from '../city/cityMapUtils.js';
import { MARKER_STYLE } from '../../../../game/kesif/sim/city/map/mapFog.js';

function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === 'calls') return calls;
      return (...a) => { calls.push([String(k)].concat(a)); };
    },
    set(_t, k, v) { calls.push(['set:' + String(k), v]); return true; },
  });
  return ctx;
}

describe('şehir haritası yardımcıları', () => {
  it('işaret türleri: etiket + şekil; mapFog.MARKER_STYLE ile uyumlu (renk körlüğü: şekil + ad)', () => {
    Object.keys(MARKER_STYLE).forEach((k) => {
      expect(CITY_MARKER_TYPES[k]).toBeTruthy();
      expect(CITY_MARKER_TYPES[k].label).toBe(MARKER_STYLE[k].label);
      expect(CITY_MARKER_TYPES[k].shape).toBe(MARKER_STYLE[k].shape);
    });
    ['terminal', 'cip', 'grafiti', 'oda'].forEach((k) => expect(CITY_MARKER_TYPES[k]).toBeTruthy());
    expect(CITY_MARKER_TYPES.terminal.travel).toBe(true);
    expect(CITY_MARKER_TYPES.metro.travel).toBe(true);
    expect(CITY_MARKER_TYPES.foto.travel).toBe(false);
  });

  it('normalizeCityMarkers: şehir türleri etiketlenir; bilinmeyen tür çökmez; travel bayrağı', () => {
    const m = normalizeCityMarkers([
      { id: 'terminal:3', type: 'terminal', name: 'Liman Terminali', x: 1, z: 2, discovered: true, color: '#4fe3d6' },
      { id: 'metro:1', type: 'metro', name: 'Güney Durağı', x: 0, z: 320, discovered: true, color: '#b08cff' },
      { id: 'foto:9', type: 'foto', name: 'Foto Noktası', x: 3, z: 4, discovered: true },
      { id: 'x', type: 'bilinmez', x: 1, z: 1 },
      { id: 'bozuk', type: 'foto', x: 'a', z: 1 },
    ]);
    expect(m.length).toBe(4);
    expect(m[0]).toMatchObject({ key: 'terminal:3', label: 'Boyut Terminali', shape: 'diamond', travel: true });
    expect(m[1]).toMatchObject({ label: 'Metro durağı', shape: 'hex', travel: true });
    expect(m[2]).toMatchObject({ label: 'Foto noktası', shape: 'star', travel: false });
    expect(m[3].travel).toBe(false);
    expect(normalizeCityMarkers(null)).toEqual([]);
  });

  it('travelIdOf: yalnız terminal/metro işaretleri düğüm kimliğine çevrilir', () => {
    expect(travelIdOf({ key: 'terminal:0' })).toBe('t0');
    expect(travelIdOf({ key: 'terminal:15' })).toBe('t15');
    expect(travelIdOf({ key: 'metro:4' })).toBe('m4');
    ['cip:3', 'foto:1', 'terminal:', 'terminal:123', '', null, undefined].forEach((k) => expect(travelIdOf(k === null || k === undefined ? k : { key: k })).toBe(''));
    expect(travelIdOf({})).toBe('');
  });

  it('özetler: bölge sayısı, ekran okuyucu metni, gösterge yalnız bulunmuş türler, hızlı seyahat satırı', () => {
    expect(DISTRICT_TOTAL).toBe(6);
    expect(districtSummary({ districts: [{ name: 'Merkez' }, { name: 'Gece Pazarı' }] })).toBe('Bölgeler: 2/6 (Merkez, Gece Pazarı)');
    expect(districtSummary({})).toBe('Bölgeler: 0/6');
    const ms = normalizeCityMarkers([{ id: 'foto:1', type: 'foto', x: 1, z: 1, discovered: true }, { id: 'foto:2', type: 'foto', x: 2, z: 2, discovered: true }, { id: 'oda:1', type: 'oda', x: 3, z: 3, discovered: false }]);
    expect(cityMapSummary({ zone: { name: 'Merkez' }, districts: [{ name: 'Merkez' }] }, ms)).toMatch(/Bulunduğun yer: Merkez.*2 keşfedilmiş yer/);
    expect(legendRows(ms).map((m) => m.type)).toEqual(['foto']);
    expect(travelRow({ name: 'Liman Terminali', dist: 850 })).toBe('Liman Terminali · 850 m');
    expect(travelRow({ name: 'Çevreyolu Doğu', dist: 1500 })).toBe('Çevreyolu Doğu · 1,5 km');
    expect(travelRow(null)).toBe('');
  });

  it('drawCityUnder: bölge etiketi ve rota çizer; rota yoksa yalnız etiket; ekran dışı etiket atlanır', () => {
    const view = { cx: 0, cz: 0, scale: 1 };
    const ctx = recorder();
    drawCityUnder(ctx, { w: 400, h: 300, view, districts: [{ name: 'Merkez', x: 0, z: 0 }, { name: 'Uzak', x: 5000, z: 0 }], cityRoute: { pts: [[0, 0], [50, 0], [50, 40]], straight: false } });
    const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toEqual(['Merkez']);
    expect(ctx.calls.filter((c) => c[0] === 'lineTo').length).toBe(2); // 3 noktalı tek yol
    expect(ctx.calls.filter((c) => c[0] === 'stroke').length).toBeGreaterThanOrEqual(2); // gölge + renkli çizgi
    expect(ctx.calls.some((c) => c[0] === 'set:strokeStyle' && c[1] === '#38e8ff')).toBe(true);
    const c2 = recorder();
    drawCityUnder(c2, { w: 400, h: 300, view, districts: [], cityRoute: { pts: [[0, 0], [10, 10]], straight: true } });
    expect(c2.calls.some((c) => c[0] === 'set:strokeStyle' && c[1] === '#ffb86b')).toBe(true);
    const c3 = recorder();
    drawCityUnder(c3, { w: 400, h: 300, view });
    expect(c3.calls.filter((c) => c[0] === 'stroke').length).toBe(0);
    drawCityUnder(recorder(), { w: 400, h: 300, view, cityRoute: { pts: [[0, 0]] }, districts: null });
    // üst üste binen etiket atlanır
    const c4 = recorder();
    drawCityUnder(c4, { w: 400, h: 300, view, districts: [{ name: 'Merkez Bölgesi', x: 0, z: 0 }, { name: 'Komşu Bölge', x: 10, z: 4 }, { name: 'Uzakta Bölge', x: 160, z: 100 }] });
    expect(c4.calls.filter((x) => x[0] === 'fillText').map((x) => x[1])).toEqual(['Merkez Bölgesi', 'Uzakta Bölge']);
  });
});

describe('şehir haritası açılış görünümü', () => {
  const bounds = { minX: -800, minZ: -800, maxX: 800, maxZ: 800 };

  it('knownBounds: yalnız 0 olmayan döşemeleri kapsar; hiç yoksa/bozuksa null', () => {
    const data = new Uint8Array(16);
    data[1 * 4 + 1] = 2; // (i=1, j=1)
    data[2 * 4 + 2] = 3; // (i=2, j=2)
    const kb = knownBounds({ w: 4, h: 4, data }, bounds);
    expect(kb).toEqual({ x0: -400, x1: 400, z0: -400, z1: 400 });
    expect(knownBounds({ w: 4, h: 4, data: new Uint8Array(16) }, bounds)).toBeNull();
    expect(knownBounds(null, bounds)).toBeNull();
    expect(knownBounds({ w: 0, h: 0, data }, bounds)).toBeNull();
    expect(knownBounds({ w: 4, h: 4, data }, null)).toBeNull();
  });

  it('cityOverview: bulunmuş alan + oyuncu + işaretler sığar; hiçbir şey yoksa tüm harita; sonlu', () => {
    const data = new Uint8Array(16);
    data[1 * 4 + 1] = 2;
    const info = { tiles: { w: 4, h: 4, data }, player: { x: 0, z: 0 } };
    const v = cityOverview(info, [{ x: 100, z: 100, discovered: true }, { x: 5000, z: 5000, discovered: false }], bounds, 800, 400);
    expect(Number.isFinite(v.cx) && Number.isFinite(v.cz) && v.scale > 0).toBe(true);
    // bulunmuş döşeme (−400..0) + oyuncu (0,0) + işaret (100,100): hepsi görünürde
    const halfW = 400 / v.scale;
    const halfH = 200 / v.scale;
    [[-400, -400], [0, 0], [100, 100]].forEach(([x, z]) => {
      expect(Math.abs(x - v.cx)).toBeLessThanOrEqual(halfW + 1e-6);
      expect(Math.abs(z - v.cz)).toBeLessThanOrEqual(halfH + 1e-6);
    });
    // bulunmamış (discovered:false) uzak işaret görünümü germez
    expect(v.scale).toBeGreaterThan(0.2);
    const empty = cityOverview({ tiles: { w: 4, h: 4, data: new Uint8Array(16) } }, [], bounds, 800, 400);
    expect(empty).toMatchObject({ cx: 0, cz: 0 });
    expect(empty.scale).toBeCloseTo(400 / 1600, 6);
    expect(cityOverview(null, null, bounds, 800, 400).scale).toBeGreaterThan(0);
  });
});
