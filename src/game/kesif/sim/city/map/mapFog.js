/*
 * KEŞİF sim/city/map — ŞEHİR HARİTASI «SİS» KATMANI (photo_map, Neon Meridyen Faz 4). SAF (DOM/three yok), es2020, belirlenimci.
 *
 * Harita YALNIZ bulunmuşları gösterir:
 *   • bölgeler   dmask (stats.dmask; cityMissions bölgeye girince bit koyar) → o bölgenin tüm yol/bina rasteri; diğer hücreler bilinmiyor (0)
 *   • terminaller tmask (ctx.terminals.found) → bulunmuş terminalin çevresinde 72 blokluk daire de açılır (kapıdan çıkış noktası)
 *   • işaretler  yarış kapısı / kurye masası / kiralık / foto noktası / çatı parkuru: oyuncu 60 blok yaklaşınca KALICI bulunur (city.pmap.p bitleri)
 *   • metro      mmask (stats.mmask; istasyon çevresine girince)      • çip/grafiti/oda: systems/cityDiscovery (bulunmuş olanlar)
 * Bulunmamış hiçbir şey (ad, konum, işaret) dışarı sızmaz — mülkiyet testleri bunu doğrular.
 *
 *   MAP_POI_TYPES · POI_REVEAL_R · TERMINAL_REVEAL_R · MARKER_STYLE
 *   districtGrid(seed) → Uint8Array(200·200)   hücre → DISTRICT_KEYS dizini (6 = bölge yok)
 *   mapPoiList(seed) → [{i, id, type, name, x, y, z}]  (kararlı sıra; ≤ 62)         stationList(seed) → [{i, name, x, z}]
 *   emptyPmap() · decodePmap(raw) → {p:[int,int]} (sağlam) · poiBit(pmap, i) · setPoiBit(pmap, i) → yeni mi
 *   revealNear(seed, pmap, x, y, z, r?) → [yeni açılan POI dizinleri]
 *   foggedRaster(seed, dmask, tmask, pmap) → {w,h,cell,data,palette,paletteBase,known,key}  (aynı girdi → AYNI nesne; LRU 4)
 *   foundDistricts(seed, dmask) → [{key, name, x, z}]       (etiket konumu = bölge merkezi)
 *   cityMapLayer(seed, st) → {tiles, districts, markers}    st {dmask, tmask, mmask, pmap}
 */
import { CITY_MAP_CELL, CITY_MAP_GRID, CITY_MAP_HALF, cityMapRaster } from '../cityMapRaster.js';
import { districtAt, getCityPlan, pois } from '../cityPlan.js';
import { DISTRICT_KEYS } from '../cityBrands.js';
import { districtDisplay } from '../cityHudData.js';
import { RACE_NAMES, terminalName } from '../cityNames.js';

export const MAP_POI_TYPES = Object.freeze(['race_gate', 'courier_desk', 'rental', 'photo_spot', 'roof_start']);
export const POI_REVEAL_R = 60;
export const TERMINAL_REVEAL_R = 72;
export const POI_REVEAL_DY = 40;
const POI_DISC_R = 48;
const NONE = 255;

/** İşaret türü → görünüm (renk + şekil + ad). Şekiller panelMap.shapePoints ile uyumlu. */
export const MARKER_STYLE = Object.freeze({
  yaris: Object.freeze({ label: 'Yarış başlangıcı', shape: 'flag', color: '#b6ff3d' }),
  kurye: Object.freeze({ label: 'Kurye masası', shape: 'square', color: '#ffc24d' }),
  kiralik: Object.freeze({ label: 'Araç kiralama', shape: 'triangle', color: '#38e8ff' }),
  foto: Object.freeze({ label: 'Foto noktası', shape: 'star', color: '#ff4fd0' }),
  cati: Object.freeze({ label: 'Çatı parkuru', shape: 'cross', color: '#ffe066' }),
  metro: Object.freeze({ label: 'Metro durağı', shape: 'hex', color: '#b08cff' }),
});
const TYPE_KEY = Object.freeze({
  race_gate: 'yaris', courier_desk: 'kurye', rental: 'kiralik', photo_spot: 'foto', roof_start: 'cati',
});
const TYPE_NAME = Object.freeze({
  courier_desk: 'Kurye Masası', rental: 'Araç Kiralama', photo_spot: 'Foto Noktası', roof_start: 'Çatı Parkuru',
});
const STATION_NAMES = Object.freeze(['Merkez Durağı', 'Güney Durağı', 'Kuzey Durağı', 'Doğu Durağı', 'Batı Durağı']);

class Lru {
  constructor(n) {
    this.n = n;
    this.m = new Map();
  }

  get(k) {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }

  set(k, v) {
    if (this.m.size >= this.n) this.m.delete(this.m.keys().next().value);
    this.m.set(k, v);
  }
}

const GRID_CACHE = new Lru(3);
const POI_CACHE = new Lru(3);
const FOG_CACHE = new Lru(4);

/* ------------------------------------------------------------------------------------------------
 * Bölge ızgarası ve POI listesi
 * ---------------------------------------------------------------------------------------------- */
export function districtGrid(seed) {
  const key = seed >>> 0;
  const hit = GRID_CACHE.get(key);
  if (hit) return hit;
  const n = CITY_MAP_GRID;
  const g = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = (j - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
    for (let i = 0; i < n; i++) {
      const x = (i - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
      const di = DISTRICT_KEYS.indexOf(districtAt(seed, x, z));
      g[j * n + i] = di >= 0 ? di : DISTRICT_KEYS.length;
    }
  }
  GRID_CACHE.set(key, g);
  return g;
}

export function mapPoiList(seed) {
  const key = seed >>> 0;
  const hit = POI_CACHE.get(key);
  if (hit) return hit;
  const out = [];
  const all = pois(seed);
  for (let t = 0; t < MAP_POI_TYPES.length; t++) {
    const type = MAP_POI_TYPES[t];
    for (let k = 0; k < all.length; k++) {
      const p = all[k];
      if (p.type !== type) continue;
      const name = type === 'race_gate' ? (RACE_NAMES[p.raceId] || 'Yarış') : TYPE_NAME[type];
      out.push(Object.freeze({
        i: out.length, id: p.id, type, name, x: p.x, y: p.y, z: p.z,
      }));
    }
  }
  const frozen = Object.freeze(out);
  POI_CACHE.set(key, frozen);
  return frozen;
}

export function stationList(seed) {
  const ug = getCityPlan(seed).underground;
  const st = ug && ug.metro && Array.isArray(ug.metro.stations) ? ug.metro.stations : [];
  return st.map((s, i) => ({
    i, name: STATION_NAMES[i] || 'Metro Durağı', x: s.x, z: s.z,
  }));
}

/* ------------------------------------------------------------------------------------------------
 * Kalıcı POI bitleri (city.pmap = {p:[a,b]}; 30 bit/sayı → 60 POI)
 * ---------------------------------------------------------------------------------------------- */
export const PMAP_WORDS = 3;

export function emptyPmap() {
  return { p: [0, 0, 0] };
}

export function decodePmap(raw) {
  const out = emptyPmap();
  const arr = raw && typeof raw === 'object' && Array.isArray(raw.p) ? raw.p : null;
  if (arr) {
    for (let i = 0; i < PMAP_WORDS; i++) {
      const v = arr[i];
      out.p[i] = typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(0x3fffffff, Math.floor(v))) : 0;
    }
  }
  return out;
}

export function poiBit(pmap, i) {
  if (!pmap || !Array.isArray(pmap.p) || !Number.isInteger(i) || i < 0 || i >= PMAP_WORDS * 30) return false;
  return ((pmap.p[Math.floor(i / 30)] | 0) >> (i % 30) & 1) === 1;
}

export function setPoiBit(pmap, i) {
  if (!pmap || !Array.isArray(pmap.p) || !Number.isInteger(i) || i < 0 || i >= PMAP_WORDS * 30) return false;
  const w = Math.floor(i / 30);
  const cur = (pmap.p[w] | 0) & 0x3fffffff;
  const bit = 1 << (i % 30);
  if (cur & bit) return false;
  pmap.p[w] = cur | bit;
  return true;
}

/** Oyuncu yakınındaki henüz bulunmamış POI'leri bulunmuş yapar; yeni dizinleri döndürür (yatayda r, düşeyde ±40). */
export function revealNear(seed, pmap, x, y, z, r) {
  const rr = (r > 0 ? r : POI_REVEAL_R) ** 2;
  const list = mapPoiList(seed);
  const out = [];
  if (!(Number.isFinite(x) && Number.isFinite(z))) return out;
  const py = Number.isFinite(y) ? y : 64;
  for (let k = 0; k < list.length; k++) {
    const p = list[k];
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz > rr || Math.abs(p.y - py) > POI_REVEAL_DY) continue;
    if (setPoiBit(pmap, p.i)) out.push(p.i);
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Sisli raster
 * ---------------------------------------------------------------------------------------------- */
function discOpen(open, cx, cz, r) {
  const c0 = Math.floor((cx - r) / CITY_MAP_CELL) + CITY_MAP_HALF;
  const c1 = Math.floor((cx + r) / CITY_MAP_CELL) + CITY_MAP_HALF;
  const r0 = Math.floor((cz - r) / CITY_MAP_CELL) + CITY_MAP_HALF;
  const r1 = Math.floor((cz + r) / CITY_MAP_CELL) + CITY_MAP_HALF;
  const rr = r * r;
  for (let j = Math.max(0, r0); j <= Math.min(CITY_MAP_GRID - 1, r1); j++) {
    const z = (j - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
    for (let i = Math.max(0, c0); i <= Math.min(CITY_MAP_GRID - 1, c1); i++) {
      const x = (i - CITY_MAP_HALF) * CITY_MAP_CELL + CITY_MAP_CELL / 2;
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= rr) open[j * CITY_MAP_GRID + i] = 1;
    }
  }
}

export function foggedRaster(seed, dmask, tmask, pmap) {
  const pm = decodePmap(pmap);
  const dm = (dmask | 0) & 0x3f;
  const tm = (tmask | 0) & 0xffff;
  const key = (seed >>> 0) + '|' + dm + '|' + (tm | 1) + '|' + pm.p.join(',');
  const hit = FOG_CACHE.get(key);
  if (hit) return hit;
  const base = cityMapRaster(seed);
  const grid = districtGrid(seed);
  const n = CITY_MAP_GRID;
  const open = new Uint8Array(n * n);
  for (let k = 0; k < open.length; k++) if (grid[k] < DISTRICT_KEYS.length && ((dm >> grid[k]) & 1) === 1) open[k] = 1;
  const plan = getCityPlan(seed);
  for (let t = 0; t < plan.terminals.length; t++) {
    if (t === 0 || ((tm >> t) & 1) === 1) discOpen(open, plan.terminals[t].x, plan.terminals[t].z, TERMINAL_REVEAL_R);
  }
  const list = mapPoiList(seed);
  for (let k = 0; k < list.length; k++) if (poiBit(pm, k)) discOpen(open, list[k].x, list[k].z, POI_DISC_R);
  const data = new Uint8Array(n * n);
  let known = 0;
  for (let k = 0; k < data.length; k++) {
    if (open[k]) {
      data[k] = base.data[k];
      known++;
    }
  }
  const out = {
    w: n, h: n, cell: CITY_MAP_CELL, data, palette: base.palette, paletteBase: base.paletteBase, known, key,
  };
  FOG_CACHE.set(key, out);
  return out;
}

export function foundDistricts(seed, dmask) {
  const plan = getCityPlan(seed);
  const sites = plan.districts && Array.isArray(plan.districts.sites) ? plan.districts.sites : [];
  const out = [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    const di = DISTRICT_KEYS.indexOf(s.key);
    if (di < 0 || ((dmask >> di) & 1) !== 1) continue;
    out.push({
      key: s.key, name: districtDisplay(s.key), x: s.x, z: s.z,
    });
  }
  return out;
}

/** Bulunmuş POI ve metro durakları → işaretler (panelMap.normalizeMarkers biçimi). */
export function poiMarkers(seed, pmap, mmask) {
  const out = [];
  const pm = decodePmap(pmap);
  const list = mapPoiList(seed);
  for (let k = 0; k < list.length; k++) {
    const p = list[k];
    if (!poiBit(pm, k)) continue;
    const key = TYPE_KEY[p.type];
    out.push({
      id: key + ':' + p.id, type: key, name: p.name, x: p.x, z: p.z, discovered: true, color: MARKER_STYLE[key].color,
    });
  }
  const st = stationList(seed);
  for (let k = 0; k < st.length && k < 29; k++) {
    if (((mmask >> k) & 1) !== 1) continue;
    out.push({
      id: 'metro:' + k, type: 'metro', name: st[k].name, x: st[k].x, z: st[k].z, discovered: true, color: MARKER_STYLE.metro.color,
    });
  }
  return out;
}

export function cityMapLayer(seed, st) {
  const s = st || {};
  return {
    tiles: foggedRaster(seed, s.dmask | 0, s.tmask | 0, s.pmap),
    districts: foundDistricts(seed, s.dmask | 0),
    markers: poiMarkers(seed, s.pmap, s.mmask | 0),
  };
}

/** Terminal adı yardımcı (harita listesi/seyahat): cityNames.terminalName. */
export { terminalName };
