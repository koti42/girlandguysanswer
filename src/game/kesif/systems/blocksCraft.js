/*
 * KEŞİF blok sistemi — üretim: yakındaki istasyonlar, tarif listesi, üretim.
 *
 *   nearbyStations(G,S) → ['el', 'tezgah'?, 'ocak'?, 'örs'?]    oyuncunun 4 blok yakınındaki istasyon blokları (+ tıklanıp sabitlenen)
 *   createCraftApi(G,S) → { getStations, getStationFocus, getRecipes({station,category,query}), craft(recipeId,{times}) }
 *
 * getRecipes: tüm tarifler (süzgeç verilirse daraltılır); her satır
 *   {id, out:{item,count}, outName, in:[{item,count,have}], station, category, heat, craftable}
 *   craftable = istasyon yakında + malzeme (+ ocak için yakıt/ısı) + çıktı sığıyor (Inventory.canCraft).
 * craft: `times` adet üretimi ATOMİK dener (biri başarısızsa envanter eski haline döner, false). Ocak tarifleri Inventory'nin yakıt/ısı
 * mantığını kullanır (kömür/odun yakılıp ısı birikir). Her üretim 'itemCrafted' {item,count,recipeId,station} yayar; ses/haptik tek sefer.
 * Harita modunda üretim yok. Yaratıcı modda malzeme tüketilmez.
 */
import {
  RECIPES, STATION_BLOCKS, STATIONS, getRecipe, itemByKey,
} from '../sim/items.js';
import { foldTr } from '../sim/constants.js';
import { isReadOnly } from './blocksCore.js';

const SCAN_R = 4;
const NAMES = Object.keys(STATION_BLOCKS);
const IDS = [];
NAMES.forEach((n) => STATION_BLOCKS[n].forEach((id) => IDS.push([id, n])));

function stationOfBlock(id) {
  for (let i = 0; i < IDS.length; i++) if (IDS[i][0] === id) return IDS[i][1];
  return null;
}

/** 'el' her zaman; menzildeki blok istasyonları STATIONS sırasında. */
export function nearbyStations(G, S) {
  const found = { el: true };
  const b = G.body;
  const world = G.world;
  if (b && world) {
    const x0 = Math.floor(b.x - SCAN_R);
    const x1 = Math.floor(b.x + SCAN_R);
    const z0 = Math.floor(b.z - SCAN_R);
    const z1 = Math.floor(b.z + SCAN_R);
    const y0 = Math.floor(b.y - 2);
    const y1 = Math.floor(b.y + 3);
    const r2 = (SCAN_R + 0.5) * (SCAN_R + 0.5);
    const cy = b.y + 0.9;
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          const id = world.getBlock(x, y, z);
          if (!id) continue;
          const n = stationOfBlock(id);
          if (!n || found[n]) continue;
          const dx = x + 0.5 - b.x;
          const dy = y + 0.5 - cy;
          const dz = z + 0.5 - b.z;
          if (dx * dx + dy * dy + dz * dz <= r2) found[n] = true;
        }
      }
    }
  }
  const pin = S.pinned;
  if (pin && b) {
    const dx = pin.x + 0.5 - b.x;
    const dy = pin.y + 0.5 - (b.y + 0.9);
    const dz = pin.z + 0.5 - b.z;
    if (dx * dx + dy * dy + dz * dz <= 49 && stationOfBlock(world.getBlock(pin.x, pin.y, pin.z)) === pin.kind) found[pin.kind] = true;
  }
  const out = [];
  for (let i = 0; i < STATIONS.length; i++) if (found[STATIONS[i]]) out.push(STATIONS[i]);
  return out;
}

function matchesQuery(r, q) {
  if (!q) return true;
  const words = foldTr(q).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const outIt = itemByKey(r.out.item);
  let hay = foldTr(outIt ? outIt.name : r.out.item);
  for (let i = 0; i < r.in.length; i++) {
    const it = itemByKey(r.in[i].item);
    hay += ' ' + foldTr(it ? it.name : r.in[i].item);
  }
  for (let i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false;
  return true;
}

export function createCraftApi(G, S, notify) {
  const stationsNow = () => nearbyStations(G, S);

  function getStations() {
    return stationsNow();
  }

  /** Üretim bir istasyon bloğuna sağ tıklanarak açıldıysa o istasyonun adı ('tezgah'|'ocak'|'örs'|'kesici'|'dokuma'); aksi halde null. */
  function getStationFocus() {
    const pin = S.pinned;
    if (!pin || !G.world) return null;
    return stationOfBlock(G.world.getBlock(pin.x, pin.y, pin.z)) === pin.kind ? pin.kind : null;
  }

  function getRecipes(filter) {
    const f = filter || {};
    const inv = G.inventory;
    const st = stationsNow();
    const canUse = !isReadOnly(G);
    const out = [];
    for (let i = 0; i < RECIPES.length; i++) {
      const r = RECIPES[i];
      if (f.station && r.station !== f.station) continue;
      if (f.category && r.category !== f.category) continue;
      if (f.query && !matchesQuery(r, f.query)) continue;
      const ins = new Array(r.in.length);
      for (let k = 0; k < r.in.length; k++) {
        ins[k] = { item: r.in[k].item, count: r.in[k].count, have: inv.count(r.in[k].item) };
      }
      const oi = itemByKey(r.out.item);
      out.push({
        id: r.id,
        out: { item: r.out.item, count: r.out.count },
        outName: oi ? oi.name : r.out.item,
        in: ins,
        station: r.station,
        category: r.category,
        heat: r.heat || 0,
        craftable: canUse && inv.canCraft(r, st),
      });
    }
    return out;
  }

  function craft(recipeId, opts) {
    if (isReadOnly(G) || G.player.dead) return false;
    const r = getRecipe(recipeId);
    if (!r) return false;
    let times = Math.floor(Number(opts && opts.times));
    if (!(times >= 1)) times = 1;
    if (times > 64) times = 64;
    const inv = G.inventory;
    const st = stationsNow();
    const snap = inv._saveState();
    const lis = inv._listeners;
    inv._listeners = [];
    let made = 0;
    for (let i = 0; i < times; i++) {
      if (!inv.craft(r, st)) break;
      made++;
    }
    inv._listeners = lis;
    if (made < times) {
      inv._restoreState(snap);
      return false;
    }
    inv._emit();
    G._invDirty = true;
    G.sound('craft', undefined, { vol: 0.8 });
    G.haptic('light');
    for (let i = 0; i < made; i++) {
      G.emit({
        type: 'itemCrafted', item: r.out.item, count: r.out.count, recipeId: r.id, station: r.station,
      });
    }
    if (notify) notify(r, made);
    return true;
  }

  return {
    getStations, getStationFocus, getRecipes, craft,
  };
}
