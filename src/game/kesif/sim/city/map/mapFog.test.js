import { describe, expect, it } from 'vitest';
import {
  MAP_POI_TYPES, MARKER_STYLE, POI_REVEAL_R, TERMINAL_REVEAL_R, cityMapLayer, decodePmap, districtGrid, emptyPmap, foggedRaster, foundDistricts, mapPoiList, poiBit,
  poiMarkers, revealNear, setPoiBit, stationList,
} from './mapFog.js';
import { CITY_MAP_CELL, CITY_MAP_GRID, CITY_MAP_HALF, cityMapRaster } from '../cityMapRaster.js';
import { getCityPlan } from '../cityPlan.js';
import { DISTRICT_KEYS } from '../cityBrands.js';
import { dimSeed } from '../../dim/dimensions.js';
import { mulberry32 } from '../../rng.js';
import { scanText } from '../citySafeData.js';
import { sanitizeCityState } from '../cityState.js';

const SEED = dimSeed(77, 'neon');
const SEED2 = dimSeed(1234, 'neon');
const cellX = (i) => (i - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;

describe('harita sisi: POI listesi ve bitler', () => {
  it('54 POI, kararlı sıra, yalnız harita türleri, her biri sokak seviyesinde sonlu konum', () => {
    const l = mapPoiList(SEED);
    expect(l.length).toBe(54);
    expect(l).toBe(mapPoiList(SEED));
    const counts = {};
    l.forEach((p, k) => {
      expect(p.i).toBe(k);
      expect(MAP_POI_TYPES.indexOf(p.type)).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.y)).toBe(true);
      counts[p.type] = (counts[p.type] || 0) + 1;
      expect(scanText(p.name)).toEqual([]);
    });
    expect(counts).toEqual({
      race_gate: 8, courier_desk: 7, rental: 7, photo_spot: 24, roof_start: 8,
    });
    expect(stationList(SEED).length).toBe(5);
    expect(mapPoiList(SEED2).map((p) => p.type)).toEqual(l.map((p) => p.type));
  });

  it('pmap: kodlama sağlam (bozuk girdi sıfırlanır), bit koy/oku, ikinci koyuş yeni değil', () => {
    const pm = emptyPmap();
    expect(poiBit(pm, 5)).toBe(false);
    expect(setPoiBit(pm, 5)).toBe(true);
    expect(setPoiBit(pm, 5)).toBe(false);
    expect(poiBit(pm, 5)).toBe(true);
    expect(setPoiBit(pm, 89)).toBe(true);
    expect(poiBit(pm, 89)).toBe(true);
    expect(setPoiBit(pm, 90)).toBe(false);
    expect(setPoiBit(pm, -1)).toBe(false);
    expect(setPoiBit(pm, 1.5)).toBe(false);
    expect(decodePmap(null).p).toEqual([0, 0, 0]);
    expect(decodePmap({ p: ['x', NaN, 1e12] }).p).toEqual([0, 0, 0x3fffffff]);
    expect(decodePmap({ p: [3] }).p).toEqual([3, 0, 0]);
    expect(decodePmap({ p: 'xx' }).p).toEqual([0, 0, 0]);
    const clean = sanitizeCityState({ v: 1, pmap: pm });
    expect(clean.pmap).toEqual(pm); // kayıt sanitize'ından geçer (ileri uyum anahtarı)
  });

  it('revealNear: yalnız yakın POI açılır; ikinci çağrı yeni açmaz; yükseklik farkı büyükse açılmaz', () => {
    const pm = emptyPmap();
    const l = mapPoiList(SEED);
    const p = l[20];
    const got = revealNear(SEED, pm, p.x + 10, p.y, p.z, POI_REVEAL_R);
    expect(got).toContain(20);
    got.forEach((i) => {
      const q = l[i];
      expect(Math.hypot(q.x - (p.x + 10), q.z - p.z)).toBeLessThanOrEqual(POI_REVEAL_R);
    });
    expect(revealNear(SEED, pm, p.x + 10, p.y, p.z)).toEqual([]);
    const pm2 = emptyPmap();
    expect(revealNear(SEED, pm2, p.x, p.y - 100, p.z)).toEqual([]); // metro tünelinden üst sokak POI'si bulunmaz
    expect(revealNear(SEED, pm2, NaN, 0, NaN)).toEqual([]);
    expect(revealNear(SEED, pm2, 99999, 64, 99999)).toEqual([]);
  });
});

describe('harita sisi: raster yalnız bulunmuşu gösterir', () => {
  it('bölge ızgarası 6 bölgeyi kaplar; başlangıçta yalnız Kapı Meydanı çevresi açık', () => {
    const g = districtGrid(SEED);
    expect(g.length).toBe(CITY_MAP_GRID * CITY_MAP_GRID);
    const seen = new Set();
    for (let k = 0; k < g.length; k++) seen.add(g[k]);
    for (let d = 0; d < 6; d++) expect(seen.has(d)).toBe(true);
    const r = foggedRaster(SEED, 0, 0, null);
    expect(r.known).toBeGreaterThan(200);
    expect(r.known).toBeLessThan(CITY_MAP_GRID * CITY_MAP_GRID * 0.05);
    const base = cityMapRaster(SEED);
    expect(r.w).toBe(base.w);
    expect(r.palette).toBe(base.palette);
    expect(r.paletteBase).toBe(1);
    const mid = (CITY_MAP_HALF) * CITY_MAP_GRID + CITY_MAP_HALF;
    expect(r.data[mid]).toBe(base.data[mid]); // meydan görünür
    expect(r.data[0]).toBe(0); // köşe bilinmiyor
  });

  it('bulunmuş bölge tamamen açılır; başkası kapalı kalır; tüm bölgeler = tüm raster', () => {
    const base = cityMapRaster(SEED);
    const g = districtGrid(SEED);
    const only = foggedRaster(SEED, 1 << 1, 0, null);
    let inside = 0;
    for (let k = 0; k < g.length; k++) {
      if (g[k] === 1) {
        expect(only.data[k]).toBe(base.data[k]);
        inside++;
      }
    }
    expect(inside).toBeGreaterThan(3000);
    expect(only.known).toBeGreaterThanOrEqual(inside);
    const all = foggedRaster(SEED, 0x3f, 0xffff, null);
    for (let k = 0; k < g.length; k += 7) expect(all.data[k]).toBe(base.data[k]);
  });

  it('aynı girdi → AYNI nesne (önbellek); farklı maske → farklı nesne', () => {
    const a = foggedRaster(SEED, 5, 3, { p: [1, 0, 0] });
    const b = foggedRaster(SEED, 5, 3, { p: [1, 0, 0] });
    expect(b).toBe(a);
    expect(foggedRaster(SEED, 5, 3, { p: [2, 0, 0] })).not.toBe(a);
    expect(foggedRaster(SEED, 4, 3, { p: [1, 0, 0] })).not.toBe(a);
  });

  it('ÖZELLİK: her açık hücre bulunmuş bölge/terminal/POI diskindedir; her kapalı hücre dışındadır (rastgele durumlar, 2 tohum)', () => {
    const rnd = mulberry32(99);
    [SEED, SEED2].forEach((seed) => {
      const plan = getCityPlan(seed);
      const list = mapPoiList(seed);
      const grid = districtGrid(seed);
      const base = cityMapRaster(seed);
      for (let trial = 0; trial < 10; trial++) {
        const dmask = Math.floor(rnd() * 64);
        const tmask = Math.floor(rnd() * 65536);
        const pm = emptyPmap();
        for (let k = 0; k < list.length; k++) if (rnd() < 0.25) setPoiBit(pm, k);
        const r = foggedRaster(seed, dmask, tmask, pm);
        for (let j = 0; j < CITY_MAP_GRID; j += 2) {
          for (let i = 0; i < CITY_MAP_GRID; i += 2) {
            const k = j * CITY_MAP_GRID + i;
            const x = cellX(i);
            const z = cellX(j);
            const inDistrict = grid[k] < 6 && ((dmask >> grid[k]) & 1) === 1;
            let inTerminal = false;
            for (let t = 0; t < 16; t++) {
              if ((t === 0 || ((tmask >> t) & 1) === 1) && Math.hypot(plan.terminals[t].x - x, plan.terminals[t].z - z) <= TERMINAL_REVEAL_R) inTerminal = true;
            }
            let inPoi = false;
            for (let q = 0; q < list.length; q++) if (poiBit(pm, q) && Math.hypot(list[q].x - x, list[q].z - z) <= 48) inPoi = true;
            const expected = inDistrict || inTerminal || inPoi;
            if (expected) expect(r.data[k]).toBe(base.data[k]);
            else expect(r.data[k]).toBe(0);
          }
        }
      }
    });
  });

  it('bölge etiketleri yalnız bulunmuş bölgeleri verir; bulunmayanın adı hiçbir yerde geçmez', () => {
    expect(foundDistricts(SEED, 0)).toEqual([]);
    const f = foundDistricts(SEED, (1 << 0) | (1 << 4));
    expect(f.map((d) => d.key)).toEqual(['merkez', 'teknoloji']);
    const layer = cityMapLayer(SEED, { dmask: 1, tmask: 0, mmask: 0, pmap: emptyPmap() });
    const text = JSON.stringify({ d: layer.districts, m: layer.markers });
    expect(text).toContain('Merkez');
    ['Liman', 'Konteyner', 'Tepe Konutları', 'Teknoloji', 'Gece Pazarı'].forEach((n) => expect(text).not.toContain(n));
    DISTRICT_KEYS.forEach((k) => expect(typeof k).toBe('string'));
  });
});

describe('harita sisi: işaretler', () => {
  it('yalnız bulunmuş POI ve metro durakları; bulunmayanların kimliği/konumu yok', () => {
    const pm = emptyPmap();
    const l = mapPoiList(SEED);
    setPoiBit(pm, 0);
    setPoiBit(pm, 30);
    const ms = poiMarkers(SEED, pm, 0b00110);
    expect(ms.length).toBe(4);
    const ids = ms.map((m) => m.id);
    expect(ids).toContain('yaris:' + l[0].id);
    expect(ids).toContain('foto:' + l[30].id);
    expect(ids).toContain('metro:1');
    expect(ids).toContain('metro:2');
    ms.forEach((m) => {
      expect(m.discovered).toBe(true);
      expect(MARKER_STYLE[m.type]).toBeTruthy();
      expect(Number.isFinite(m.x) && Number.isFinite(m.z)).toBe(true);
    });
    expect(poiMarkers(SEED, emptyPmap(), 0)).toEqual([]);
    expect(poiMarkers(SEED, null, 0)).toEqual([]);
  });

  it('ÖZELLİK: rastgele durumlarda işaret sayısı = açık bit sayısı + metro bit sayısı', () => {
    const rnd = mulberry32(5);
    const l = mapPoiList(SEED);
    for (let t = 0; t < 40; t++) {
      const pm = emptyPmap();
      let n = 0;
      for (let k = 0; k < l.length; k++) if (rnd() < 0.4) { setPoiBit(pm, k); n++; }
      const mm = Math.floor(rnd() * 32);
      let m = 0;
      for (let k = 0; k < 5; k++) if ((mm >> k) & 1) m++;
      expect(poiMarkers(SEED, pm, mm).length).toBe(n + m);
    }
  });
});
