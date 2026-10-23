/*
 * KEŞİF content sistemi — ŞEHİR HARİTASI (api.getMapInfo, G.dim ≠ 'overworld'). Sözleşme §11.
 * Ana diyar haritası (biyom döşemeleri, bölge halkaları, yapı işaretleri) şehir koordinatlarıyla ANLAMSIZDIR: şehirde yerine şehir rasteri
 * (yol/bina/park/su; sim/city/cityMapRaster), şehir sınırları, bulunmuş Boyut Terminalleri ve oyuncu/doğuş (terminal) döner.
 * Ana diyar keşif durumu (`progression.reveal`) şehirde HİÇ değişmez ve haritaya karışmaz.
 *
 *   cityMapInfo(S) → { dim:'neon', zone:{id,name}, size, bounds, player, spawn, tiles, zones:[], markers:[…], guide:null, explored:0 }
 */
import { cityMapRaster, CITY_MAP_BOUNDS, CITY_MAP_SIZE } from '../sim/city/cityMapRaster.js';
import { districtAt } from '../sim/city/cityPlan.js';
import { districtDisplay } from '../sim/city/cityHudData.js';
import { dimSeed } from '../sim/dim/dimensions.js';
import { isTerminalFound } from '../sim/dim/travel.js';

const TERMINAL_COLOR = '#4fe3d6';
const player = { x: 0, z: 0, yaw: 0 };
const spawn = { x: 0, z: 0 };
const zone = { id: 0, name: '' };

function terminalMarkers(G) {
  const out = [];
  const mgr = G.dimMgr;
  const ctx = mgr && typeof mgr.get === 'function' ? mgr.get('neon') : null;
  const tm = ctx && ctx.terminals ? ctx.terminals : null;
  const list = tm && Array.isArray(tm.list) ? tm.list : null;
  if (!list) return out;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t || !isTerminalFound(tm.found, i)) continue;
    out.push({
      id: 'terminal:' + i, type: 'terminal', name: i === 0 ? 'Kapı Meydanı Terminali' : 'Boyut Terminali ' + i, x: t.x, z: t.z, discovered: true, color: TERMINAL_COLOR,
    });
  }
  return out;
}

/** Bulunmuş çip/grafiti/gizli oda işaretleri (systems/cityDiscovery; bulunmayan HİÇ görünmez). */
function discoveryMarkers(G) {
  const d = G.cityDiscovery;
  return d && typeof d.markers === 'function' ? d.markers() : [];
}

export function cityMapInfo(S) {
  const G = S.G;
  const b = G.body;
  const seed = dimSeed(S.seed, 'neon'); // şehir tohumu (dünya tohumundan türetilir)
  player.x = b.x;
  player.z = b.z;
  player.yaw = G.player.yaw;
  spawn.x = G.spawn ? G.spawn.x : 0;
  spawn.z = G.spawn ? G.spawn.z : 0;
  let key = '';
  try {
    key = districtAt(seed, b.x, b.z, b.y);
  } catch {
    key = '';
  }
  zone.id = 0;
  zone.name = (G.hud && G.hud.district) || districtDisplay(key) || 'Neon Meridyen';
  const info = {
    dim: 'neon',
    zone,
    size: CITY_MAP_SIZE,
    bounds: CITY_MAP_BOUNDS,
    player,
    spawn,
    tiles: cityMapRaster(seed),
    zones: [],
    markers: terminalMarkers(G).concat(discoveryMarkers(G)),
    guide: null,
    explored: 0,
  };
  // photo_map (systems/cityMapView): bölge sisi + bulunmuş yer/metro işaretleri; sistem yoksa tam raster (eski davranış)
  return G.cityMap && typeof G.cityMap.decorate === 'function' ? G.cityMap.decorate(info) : info;
}
