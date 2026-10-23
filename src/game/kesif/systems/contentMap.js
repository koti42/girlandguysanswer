/*
 * KEŞİF content sistemi — HARİTA ve GÜNLÜK api'si (§E).
 *
 *   api.getMapInfo() → { zone:{id,name}, size, bounds:{minX,minZ,maxX,maxZ}, player:{x,z,yaw}, spawn:{x,z},
 *       tiles:{w,h,data:Uint8Array, palette:[hex], paletteBase:1}, zones:[{id,name,rIn,rOut,unlocked}],
 *       markers:[{id,type,name,x,z,discovered,color}], guide:{name,compass,distance,relYaw}|null, explored:% }
 *   api.getJournal() → progression.journal(): { quests, achievements, discovered:{structures,biomes}, stats, abilities }
 *
 * Döşemeler progression.mapView() ızgarasıdır (1 hücre = 8 blok; 0 = bilinmiyor). Hücre rengi ucuz bir tabloyla biyom/yükseklikten türetilir
 * (biyom + deniz seviyesi + dağ tonu) ve YALNIZ açılmış hücreler için tembel hesaplanır (arka planda 5 Hz × 120 hücre; api çağrısında ≤ 1200).
 * Palet: [0]=bilinmiyor, [1..22]=biyom, [23..44]=yüksek zemin tonu, [45]=sığ su, [46]=derin su. (Minimap palette[v], harita ekranı
 * paletteBase:1 ile palette[v] okur.)
 * İşaretler: keşfedilmiş yapılar + yatak + başlangıç; gözcü kulesi açımıyla (revealed=2) görünen ama keşfedilmemiş yapılar discovered:false
 * ('?' olarak). Hedef yönü işaret olarak değil `guide` alanı olarak (koordinatsız) verilir.
 *
 *   initMap(S)  tickMap(S)  mapApi(S)  biomeColors
 */
import {
  BIOME_KEYS, SEA_LEVEL, ZONES, ZONE_COUNT,
} from '../sim/constants.js';
import {
  MAP_CELL, MAP_CELLS, MAP_GRID, MAP_HALF, revealedPercent,
} from '../sim/progressionMap.js';
import { biomeKeyAt, heightAt } from '../sim/worldgen.js';
import { BIOME_INFO } from '../sim/biomeData.js';
import { getGuidance } from './contentGuide.js';
import { isTouchG, touchify } from './touchText.js';
import { cityMapInfo } from './contentMapCity.js';

// harita rengi: sim/biomeData BIOME_INFO[k].map; ilk dalga biyomlarının eski (daha açık) tonları korunur
const BIOME_HEX = {
  cayir: '#7fbf5a', orman: '#3f8a3a', karacam: '#2f6f4a', col: '#d8b878', tundra: '#dfeaf2', dag: '#8d9094', bataklik: '#4f7a55', plaj: '#e8d9a0', kristal: '#8fd8ff',
};
BIOME_KEYS.forEach((k) => { if (!BIOME_HEX[k] && BIOME_INFO[k]) BIOME_HEX[k] = BIOME_INFO[k].map; });
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * k));
  const b = Math.min(255, Math.round((n & 255) + (255 - (n & 255)) * k));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
export const MAP_PALETTE = (function build() {
  const p = ['#0b0f20'];
  BIOME_KEYS.forEach((k) => p.push(BIOME_HEX[k] || '#808080'));
  BIOME_KEYS.forEach((k) => p.push(lighten(BIOME_HEX[k] || '#808080', 0.35)));
  p.push('#4fa3d9', '#2f6fb0');
  return p;
}());
const BIOME_N = BIOME_KEYS.length;
/** Palet: [0] bilinmiyor, [1..N] biyom, [N+1..2N] yüksek zemin tonu, [2N+1] sığ su, [2N+2] derin su. */
const WATER_SHALLOW = 2 * BIOME_N + 1;
const WATER_DEEP = 2 * BIOME_N + 2;

const MARKER_COLOR = {
  anahtartapinagi: '#7fe8ff', muhursunagi: '#ffd24a', bossarena: '#ff5a5a', turbe: '#b08cff', kamp: '#ffa94d', koy: '#ffa94d', gozcukulesi: '#9be7ff', harabe: '#c9b79c',
  yuzenada: '#a7f3d0', gizlimagara: '#c084fc', hazine: '#ffe066', parkur: '#ffd24a',
};
const TIER_COLOR = ['#ffd24a', '#cd7f32', '#c0c0c0', '#ffd24a', '#4fe3d6', '#b25cff'];
const BASIC_TILES = { w: 0, h: 0, data: new Uint8Array(0), palette: MAP_PALETTE, paletteBase: 1 };

export function initMap(S) {
  S.map = {
    data: new Uint8Array(MAP_CELLS),
    scan: 0,
    markers: [],
    markerVer: -1,
    markerAt: -100,
    tiles: {
      w: MAP_GRID, h: MAP_GRID, data: null, palette: MAP_PALETTE, paletteBase: 1,
    },
    player: { x: 0, z: 0, yaw: 0 },
    spawn: { x: 0, z: 0 },
    zone: { id: 0, name: '' },
    bounds: {
      minX: -MAP_HALF * MAP_CELL, minZ: -MAP_HALF * MAP_CELL, maxX: MAP_HALF * MAP_CELL, maxZ: MAP_HALF * MAP_CELL,
    },
    zones: ZONES.map((z) => ({
      id: z.id, name: z.name, rIn: z.rIn, rOut: z.rOut, unlocked: z.id === 0,
    })),
  };
  S.map.tiles.data = S.map.data;
}

function colorOf(S, i) {
  const col = i % MAP_GRID;
  const row = (i / MAP_GRID) | 0;
  const x = (col - MAP_HALF + 0.5) * MAP_CELL;
  const z = (row - MAP_HALF + 0.5) * MAP_CELL;
  const h = heightAt(S.seed, x, z);
  if (h < SEA_LEVEL) return h > SEA_LEVEL - 6 ? WATER_SHALLOW : WATER_DEEP;
  const bi = BIOME_KEYS.indexOf(biomeKeyAt(S.seed, x, z));
  return 1 + (bi < 0 ? 0 : bi) + (h > 82 ? BIOME_N : 0);
}

/** Açılmış ama henüz boyanmamış hücrelere renk verir; en çok `budget` hücre. Döner: boyanan sayı. */
export function paintTiles(S, budget) {
  const p = S.G.progression;
  const m = S.map;
  if (!p || !m) return 0;
  const rv = p.reveal;
  let painted = 0;
  let scanned = 0;
  let i = m.scan;
  while (scanned < MAP_CELLS && painted < budget) {
    if (i >= MAP_CELLS) i = 0;
    if (rv[i] !== 0 && m.data[i] === 0) {
      m.data[i] = colorOf(S, i);
      painted++;
    }
    i++;
    scanned++;
  }
  m.scan = i >= MAP_CELLS ? 0 : i;
  return painted;
}

/** ≈5 Hz (sabit adım): boyama arka planı. */
export function tickMap(S) {
  if (!S.map || S.mode !== 'macera') return;
  paintTiles(S, 120);
}

function addMarker(list, id, type, name, x, z, discovered, color) {
  list.push({
    id, type, name, x, z, discovered, color,
  });
}

function rebuildMarkers(S) {
  const G = S.G;
  const p = G.progression;
  const m = S.map;
  const out = [];
  addMarker(out, 'spawn', 'spawn', 'Başlangıç', G.spawn.x, G.spawn.z, true, '#9be7ff');
  if (G.bedSpawn) addMarker(out, 'yatak', 'yatak', 'Yatağım', G.bedSpawn.x, G.bedSpawn.z, true, '#ff9fb2');
  const rv = p ? p.reveal : null;
  const cellIdx = (x, z) => {
    const c = Math.floor(x / MAP_CELL) + MAP_HALF;
    const r = Math.floor(z / MAP_CELL) + MAP_HALF;
    return c < 0 || r < 0 || c >= MAP_GRID || r >= MAP_GRID ? -1 : r * MAP_GRID + c;
  };
  S.known.forEach((k) => {
    if (out.length >= 360) return;
    const disc = S.discSet && S.discSet.has(k.id);
    let seen = disc;
    if (!seen && rv) {
      const ci = cellIdx(k.x, k.z);
      seen = ci >= 0 && rv[ci] === 2;
    }
    if (!seen) return;
    const color = k.type === 'parkur' ? TIER_COLOR[k.tier || 0] : (MARKER_COLOR[k.type] || '#e2b94c');
    addMarker(out, k.id, k.type, k.name, k.x, k.z, !!disc, color);
  });
  m.markers = out;
  m.markerVer = S.version;
  m.markerAt = G.time.seconds;
}

export function mapApi(S) {
  const G = S.G;
  return {
    getMapInfo() {
      const m = S.map;
      const p = G.progression;
      const b = G.body;
      if (!m || !b) return null;
      if (G.dim !== undefined && G.dim !== 'overworld') return cityMapInfo(S); // şehirde ana diyar haritası anlamsız: şehir rasteri
      m.player.x = b.x;
      m.player.z = b.z;
      m.player.yaw = G.player.yaw;
      m.spawn.x = G.spawn.x;
      m.spawn.z = G.spawn.z;
      m.zone.id = G.hud.zone ? G.hud.zone.id : 0;
      m.zone.name = G.hud.zone ? G.hud.zone.name : '';
      if (S.mode !== 'macera' || !p) {
        return {
          zone: m.zone, size: 0, bounds: null, player: m.player, spawn: m.spawn, tiles: BASIC_TILES, zones: [], markers: [], guide: null, explored: 0,
        };
      }
      paintTiles(S, 1200);
      for (let i = 0; i < ZONE_COUNT; i++) m.zones[i].unlocked = i === 0 || !!p.zonesUnlocked[i];
      if (m.markerVer !== S.version || G.time.seconds - m.markerAt > 3 || G.time.seconds < m.markerAt) rebuildMarkers(S);
      const gd = getGuidance(S);
      return {
        zone: m.zone,
        size: MAP_GRID * MAP_CELL,
        bounds: m.bounds,
        player: m.player,
        spawn: m.spawn,
        tiles: m.tiles,
        zones: m.zones,
        markers: m.markers,
        guide: gd.target ? {
          name: gd.target.name, compass: gd.target.compass, distance: Math.round(gd.target.distance), relYaw: gd.target.relYaw,
        } : null,
        explored: revealedPercent(p.revealCount),
      };
    },
    getJournal() {
      const p = G.progression;
      if (!p || S.mode !== 'macera') {
        return {
          quests: [], achievements: [], discovered: { structures: 0, biomes: 0 }, stats: {}, abilities: {},
        };
      }
      const j = p.journal();
      if (isTouchG(G)) j.quests = j.quests.map((q) => Object.assign({}, q, { hint: touchify(q.hint) }));
      // Neon Meridyen günlüğü (çipler, grafiti, odalar, yarışlar, işler; systems/cityMissions)
      if (G.dim === 'neon' && G.cityMissions && typeof G.cityMissions.journal === 'function') j.city = G.cityMissions.journal();
      return j;
    },
  };
}
