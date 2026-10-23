/*
 * KEŞİF content sistemi — YAPI KAYIT DEFTERİ.
 *
 * Oyuncu hareket ettikçe çevresindeki (≈160 blok) 64×64 hücreler için structuresInRegion çağrılır (hücre başına bir kez, kare başına en
 * çok bir hücre — ilk dolum init'te eşzamanlı); her yapı için:
 *   - bulmacalar G.puzzles'a kaydedilir (yapı sınır kutusuna ≤ 80 blok kala; 150 blok ötesinde kayıttan düşer, durumları PuzzleManager'da
 *     "bekleyen" olarak korunur → kayıt/yükleme kaybı yok),
 *   - sandık ganimet tanımları G.structureChests'e ("x,y,z" → {x,y,z,block,blockKey,kind,index,loot,structureId,zone,structType}),
 *     tabelalar G.structureSigns'a, güvenli bölgeler G.safeZones'a, boss arenaları G.arenas'a yazılır,
 *   - keşif: oyuncu yapıya ≤ 24 blok yaklaşınca (ya da sınır kutusunun içine girince) 'structureDiscovered' yayılır (görev/ilerleme + büyük
 *     başlık + harita işareti).
 * Diğer alt modüller S.hooks.add / S.hooks.remove ile yapı eklenince/çıkarılınca haberdar olur.
 *
 *   initStructures(S)   updateStructures(S, dt)   addStructure(S, def)   removeStructure(S, rec)
 *   fillRegion(S, x, z, r)   typeName(type)   recAt(S, x, z)   structureList(S, type?)
 */
import { structuresInRegion, warmStructures } from '../sim/structures.js';
import { TYPES } from '../sim/structuresTypes.js';
import { zoneIndexAt, ZONES } from '../sim/constants.js';
import {
  CELL, cellsAround, distToRect, parseCellId,
} from './contentHelpers.js';
import {
  DISCOVER_R, NOTABLE, PUZZLE_OFF_R, PUZZLE_ON_R, REGION_R, UNLOAD_R, emit,
} from './contentState.js';

export function typeName(type) {
  const t = TYPES[type];
  return t && t.name ? t.name : String(type);
}

function key3(x, y, z) {
  return x + ',' + y + ',' + z;
}

export function initStructures(S) {
  const G = S.G;
  if (!(G.structureChests instanceof Map)) G.structureChests = new Map();
  if (!(G.structureSigns instanceof Map)) G.structureSigns = new Map();
  if (!Array.isArray(G.safeZones)) G.safeZones = [];
  if (!Array.isArray(G.arenas)) G.arenas = [];
  G.content = S;
  S.discSet = new Set();
  const p = G.progression;
  if (p && p.discovered && Array.isArray(p.discovered.structures)) {
    for (let i = 0; i < p.discovered.structures.length; i++) {
      const id = p.discovered.structures[i];
      S.discSet.add(id);
      // kayıttan gelen keşiflerin yaklaşık haritası: hücre merkezi (gerçek konum, yapı görülünce düzeltilir)
      const c = parseCellId(id);
      if (c && !S.known.has(id)) {
        const x = c.ci * CELL;
        const z = c.cj * CELL;
        S.known.set(id, {
          id, type: c.type, name: typeName(c.type), x, y: 64, z, zone: zoneIndexAt(x, z), exact: false,
        });
      }
    }
  }
  try {
    warmStructures(S.seed);
  } catch { /* ısınma başarısız olsa da oyun sürer */ }
  const b = G.body;
  if (b) fillRegion(S, b.x, b.z, REGION_R);
  updateRecords(S, true);
}

/** (x,z) çevresindeki r yarıçaplı tüm hücreleri eşzamanlı yükler (init/ışınlanma sonrası). */
export function fillRegion(S, x, z, r) {
  const cells = cellsAround(x, z, r);
  for (let i = 0; i < cells.length; i++) loadCell(S, cells[i]);
}

function loadCell(S, c) {
  if (S.cellsDone.has(c.key)) return 0;
  S.cellsDone.add(c.key);
  const x0 = c.ci * CELL - CELL / 2;
  const z0 = c.cj * CELL - CELL / 2;
  let n = 0;
  try {
    const list = structuresInRegion(S.seed, x0, z0, x0 + CELL - 1, z0 + CELL - 1);
    for (let i = 0; i < list.length; i++) {
      let rec = S.structs.get(list[i].id);
      if (!rec) {
        rec = addStructure(S, list[i]);
        n++;
      }
      if (rec.cells.indexOf(c.key) < 0) rec.cells.push(c.key);
    }
  } catch (e) {
    S.cellsDone.delete(c.key); // sonraki seferde yeniden dene
    throw e;
  }
  return n;
}

export function addStructure(S, def) {
  const G = S.G;
  const b = G.body;
  const rec = {
    id: def.id,
    def,
    type: def.type,
    zone: def.zone,
    x: def.x,
    y: def.y,
    z: def.z,
    bounds: def.bounds,
    dist: b ? distToRect(b.x, b.z, def.bounds) : 1e9,
    puzzleIds: def.puzzles ? def.puzzles.map((p) => p.id) : [],
    puzzlesOn: false,
    cells: [],
    discovered: S.discSet.has(def.id),
  };
  S.structs.set(def.id, rec);
  const prev = S.known.get(def.id);
  S.known.set(def.id, {
    id: def.id, type: def.type, name: def.name || typeName(def.type), x: def.x, y: def.y, z: def.z, zone: def.zone, exact: true,
    tier: def.parkour ? def.parkour.tier : undefined,
  });
  if (!prev || !prev.exact) S.version++;
  const chests = def.chests || [];
  for (let i = 0; i < chests.length; i++) {
    const c = chests[i];
    G.structureChests.set(key3(c.x, c.y, c.z), {
      x: c.x, y: c.y, z: c.z, block: c.block, blockKey: c.blockKey, kind: c.kind, index: c.index, loot: c.loot, structureId: def.id, zone: def.zone, structType: def.type,
    });
  }
  const signs = def.signs || [];
  for (let i = 0; i < signs.length; i++) {
    const s = signs[i];
    G.structureSigns.set(key3(s.x, s.y, s.z), { text: s.text, name: def.name, structureId: def.id });
  }
  if (def.safeRadius > 0) G.safeZones.push({ id: def.id, x: def.x, z: def.z, r: def.safeRadius });
  for (let i = 0; i < S.hooks.add.length; i++) S.hooks.add[i](S, rec);
  return rec;
}

export function removeStructure(S, rec) {
  const G = S.G;
  const def = rec.def;
  for (let i = 0; i < S.hooks.remove.length; i++) S.hooks.remove[i](S, rec);
  if (rec.puzzlesOn) unregisterPuzzles(S, rec);
  (def.chests || []).forEach((c) => G.structureChests.delete(key3(c.x, c.y, c.z)));
  (def.signs || []).forEach((s) => G.structureSigns.delete(key3(s.x, s.y, s.z)));
  const si = G.safeZones.findIndex((z) => z.id === def.id);
  if (si >= 0) G.safeZones.splice(si, 1);
  S.structs.delete(def.id);
  // bu yapıyı listeleyen hücreler yeniden taranabilsin (geri dönünce yeniden kaydolur)
  for (let i = 0; i < rec.cells.length; i++) S.cellsDone.delete(rec.cells[i]);
}

export function structureList(S, type) {
  const out = [];
  S.structs.forEach((r) => {
    if (!type || r.type === type) out.push(r);
  });
  return out;
}

/** (x,z)'yi sınır kutusunda barındıran en küçük alanlı yapı kaydı | null. */
export function recAt(S, x, z) {
  let best = null;
  let area = Infinity;
  S.structs.forEach((r) => {
    const b = r.bounds;
    if (x >= b.x0 && x <= b.x1 + 1 && z >= b.z0 && z <= b.z1 + 1) {
      const a = (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1);
      if (a < area) {
        area = a;
        best = r;
      }
    }
  });
  return best;
}

function registerPuzzles(S, rec) {
  rec.puzzlesOn = true;
  const list = rec.def.puzzles || [];
  for (let i = 0; i < list.length; i++) S.regQueue.push({ rec, p: list[i] });
}

function unregisterPuzzles(S, rec) {
  rec.puzzlesOn = false;
  const pm = S.G.puzzles;
  const list = rec.def.puzzles || [];
  for (let i = S.regQueue.length - 1; i >= 0; i--) if (S.regQueue[i].rec === rec) S.regQueue.splice(i, 1);
  if (!pm || typeof pm.unregister !== 'function') return;
  for (let i = 0; i < list.length; i++) pm.unregister(list[i].id);
}

/** 5 Hz: uzaklıklar, bulmaca kayıt/düşürme, keşif. force: ilk çağrıda kuyruğu da boşaltır. */
function updateRecords(S, force) {
  const G = S.G;
  const b = G.body;
  if (!b) return;
  S.structs.forEach((rec) => {
    rec.dist = distToRect(b.x, b.z, rec.bounds);
    if (rec.def.puzzles && rec.def.puzzles.length > 0) {
      if (!rec.puzzlesOn && rec.dist <= PUZZLE_ON_R) registerPuzzles(S, rec);
      else if (rec.puzzlesOn && rec.dist > PUZZLE_OFF_R) unregisterPuzzles(S, rec);
    }
    if (!rec.discovered) maybeDiscover(S, rec, b);
  });
  if (force) drainRegQueue(S, 64);
}

function drainRegQueue(S, max) {
  const pm = S.G.puzzles;
  let n = 0;
  while (S.regQueue.length > 0 && n < max) {
    const item = S.regQueue.shift();
    n++;
    if (!pm || !item.rec.puzzlesOn || pm.has(item.p.id)) continue;
    try {
      pm.register(item.p.id, item.p);
    } catch (e) {
      if (S.G.opts && S.G.opts.strictSystems) throw e;
    }
  }
}

function maybeDiscover(S, rec, b) {
  if (rec.discovered) return;
  const def = rec.def;
  const dx = b.x - def.x;
  const dz = b.z - def.z;
  const r = def.boss ? def.boss.radius + 6 : DISCOVER_R;
  if (dx * dx + dz * dz > r * r) return;
  if (Math.abs(b.y - def.y) > 70) return;
  discover(S, rec);
}

export function discover(S, rec) {
  if (rec.discovered) return false;
  rec.discovered = true;
  S.discSet.add(rec.id);
  S.version++;
  const def = rec.def;
  emit(S, {
    type: 'structureDiscovered', id: def.id, structType: def.type, name: def.name, zone: def.zone, x: def.x, z: def.z, difficulty: def.difficulty,
  });
  if (NOTABLE.indexOf(def.type) >= 0) {
    const zn = ZONES[def.zone] ? ZONES[def.zone].name : '';
    let sub = zn;
    if (def.type === 'parkur' && def.parkour) sub = def.parkour.tierName + ' kademe · ' + zn;
    S.fx.banner(def.name, sub, 4200);
    S.fx.sound('quest', undefined, undefined, undefined);
    S.G.speak(def.name + ' keşfedildi');
  }
  return true;
}

/** Her sabit adımda çağrılır. */
export function updateStructures(S, dt) {
  const G = S.G;
  const b = G.body;
  if (!b) return;
  S.regionT += dt;
  // büyük atlama (ışınlanma): beklemeden yeniden hesapla
  const jump = Math.abs(b.x - S.lastX) > 48 || Math.abs(b.z - S.lastZ) > 48;
  if (S.regionT >= 0.25 || jump) {
    S.regionT = 0;
    S.lastX = b.x;
    S.lastZ = b.z;
    // hücre kuyruğu: oyuncu konumuna göre (hücre değişince) yeniden sırala
    const ck = Math.floor((b.x + CELL / 2) / CELL) + ',' + Math.floor((b.z + CELL / 2) / CELL);
    if (ck !== S.lastCellKey) {
      S.lastCellKey = ck;
      S.cellQueue = cellsAround(b.x, b.z, REGION_R).filter((c) => !S.cellsDone.has(c.key));
    }
    updateRecords(S, false);
    S.slowT += 0.25;
    if (S.slowT >= 2) {
      S.slowT = 0;
      unloadFar(S, b);
    }
  }
  if (S.cellQueue.length > 0) {
    const c = S.cellQueue.shift();
    try {
      loadCell(S, c);
    } catch (e) {
      if (G.opts && G.opts.strictSystems) throw e;
    }
  } else if (S.regQueue.length > 0) {
    drainRegQueue(S, 1);
  }
}

function unloadFar(S, b) {
  const drop = [];
  S.structs.forEach((rec) => {
    if (rec.dist > UNLOAD_R) drop.push(rec);
  });
  for (let i = 0; i < drop.length; i++) removeStructure(S, drop[i]);
  if (S.cellsDone.size > 120) {
    const keep = new Set();
    const near = cellsAround(b.x, b.z, UNLOAD_R);
    for (let i = 0; i < near.length; i++) if (S.cellsDone.has(near[i].key)) keep.add(near[i].key);
    S.cellsDone = keep;
  }
}

/** Test/hata ayıklama: tüm kayıt kuyruğunu hemen boşalt. */
export function flushRegistrations(S) {
  drainRegQueue(S, 1e6);
}
