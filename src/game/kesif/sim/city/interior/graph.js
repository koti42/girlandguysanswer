/*
 * KEŞİF sim/city/interior — İÇ MEKÂN ŞEMASI, DOĞRULAYICILAR ve ULAŞILABİLİRLİK. Saf, belirlenimci, worker-güvenli. Sözleşme §8, §20 "BFS".
 *
 * Interior (dünya koordinatı; her kutu yarı açık):
 *   {v:1, kind, variant, lotId, ownerId, owner:Owner|null, signature:{key,name,itemKey,existing,x,y,z}|null, mood:{hue,light,ambient},
 *    bounds:{x0,y0,z0,x1,y1,z1}               ayrılan hacim (y0=64 ilk hava satırı, y1=tavan satırı)
 *    rooms:[{id,x0,y0,z0,x1,y1,z1,role}]       HAVA kutuları (duvar kalınlığı 1, odaların arasında)
 *    graph:[[roomA,roomB,doorId]]              kapı/geçit kenarları; dikey geçitte A alt oda, B üst oda
 *    doors:[{id,kind:'street'|'door'|'arch'|'stair'|'ladder'|'hatch', x,y,z, axis:'x'|'z', w:1|3, h:3, lock?:Lock, prop?:string, from?:[x,z], to?:[x,z], rect?:{x0,z0,x1,z1}}]
 *    props:[PropSpec], lights:[{x,y,z,room,type,level}], chips:[{slot,x,y,z}], accents:[{kind,x0,y0,z0,x1,y1,z1,block}], zones:[{id,x0,z0,x1,z1,role}],
 *    obstacles:[{x0,z0,x1,z1}]                  kule çekirdeği vb. (kullanılamaz hücreler)
 *    entry:{room, door:'sokak'}                 sokak kapısının içindeki oda}
 *   axis: duvarın UZANDIĞI eksen (sokak kapısıyla aynı kural: 'x' → kapı hücreleri x boyunca, geçiş z yönünde). Kapı (x,z) = orta hücre.
 *   Lock = {id, kind:'serbest'|'kod'|'mini_hack'|'kart', tier:0..3, data}
 *
 * API:
 *  validateInterior(it, opts?) -> {ok, errors:string[], warnings:string[], stats}
 *  planReachability(it, opts?) -> {total, reached, fraction, rooms:{id:{total,reached}}, unreachableRooms:[id], startBlocked}
 *  reachableFromStreet(world, props, building, opts?) -> {ok, streetOk, total, reached, fraction, rooms:[{id,total,reached,fraction}], unreachableRooms, unreachable}
 *      opts.trap=true → ek `trapped:{count,samples}` (sokaktan girilip GERİ DÖNÜLEMEYEN iç hücreler; sözleşme §22.2 "hapis yok")
 *      world: {getBlock(x,y,z)} | fn(x,y,z)  ·  props: Prop[]|PropSpec[] (kind|t) ·  building: {interior, door} (door = bp.doors[0]) -> buildingOf(bp, interior)
 *  propBoxes(props) · doorClearanceBoxes(door) · propDefOf(p) · DOOR_KINDS · LOCK_KINDS · MAX_LIGHTS_PER_ROOM
 */
import { BLOCKS, CUBE_LUT, SOLID_LUT } from '../../blocks.js';
import { getCatalogDef, getCatalogDefByT } from '../../props/propCatalog.js';
import { getPropDef, worldBoxes } from '../../props/propDefs.js';

export const MAX_LIGHTS_PER_ROOM = 4;
export const DOOR_KINDS = Object.freeze(['street', 'door', 'arch', 'stair', 'ladder', 'hatch']);
export const LOCK_KINDS = Object.freeze(['serbest', 'kod', 'mini_hack', 'kart']);
export const CLEAR_DEPTH = 2;
export const CLEAR_WIDTH = 3;
export const CLEAR_HEIGHT = 3;
export const MIN_REACH = 0.7;
/** Aksan (neon şerit vb.) emisyon blokları toplamı üst sınırı (ışık BFS maliyeti, sözleşme risk #12). */
export const MAX_ACCENT_CELLS = 120;
export const STREET_DOOR_ID = 'sokak';
/** Kapı önü boşluğu denetiminden muaf (kapının kendisi ve kilit düzenekleri). */
const CLEAR_EXEMPT_TAGS = ['door', 'lockpad'];
const EPS = 1e-6;
const VERT = { stair: 1, ladder: 1, hatch: 1 };

/** Prop → tanım (önce katalog, sonra PROP_DEFS: sokak propları, takma adlar, t). */
export function propDefOf(p) {
  if (!p) return null;
  const k = p.kind !== undefined ? p.kind : p.key;
  if (typeof k === 'string') {
    const c = getCatalogDef(k);
    if (c) return c;
    return getPropDef(k);
  }
  if (typeof p.t === 'number') return getPropDef(p.t) || getCatalogDefByT(p.t);
  return null;
}

/** Prop listesi → [{p, def, boxes:[[x0,y0,z0,x1,y1,z1]…]}] (yalnız çarpışması olanlar `boxes`ı dolu). */
export function propBoxes(props) {
  const out = [];
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const def = propDefOf(p);
    const yaw = (p.yaw !== undefined ? p.yaw : p.rot) | 0;
    out.push({ p, def, boxes: def && def.colliders.length ? worldBoxes(def, +p.x, +p.y, +p.z, yaw & 3, []) : [] });
  }
  return out;
}

function ovl(a, b) {
  return a[0] < b[3] - EPS && a[3] > b[0] + EPS && a[1] < b[4] - EPS && a[4] > b[1] + EPS && a[2] < b[5] - EPS && a[5] > b[2] + EPS;
}

function hasTag(def, list) {
  if (!def) return false;
  for (let i = 0; i < list.length; i++) if (def.tags.indexOf(list[i]) >= 0) return true;
  return false;
}

/** Yatay kapı (street/door/arch) önü boşluk hacmi: 3 geniş × her yana 2 derin (kapı hücresi dahil) × 3 yüksek. */
export function doorClearanceBoxes(d) {
  const half = (CLEAR_WIDTH - 1) / 2;
  if (d.axis === 'x') return [[d.x - half, d.y, d.z - CLEAR_DEPTH, d.x + half + 1, d.y + CLEAR_HEIGHT, d.z + CLEAR_DEPTH + 1]];
  return [[d.x - CLEAR_DEPTH, d.y, d.z - half, d.x + CLEAR_DEPTH + 1, d.y + CLEAR_HEIGHT, d.z + half + 1]];
}

function roomHas(r, x, y, z) {
  return x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1 && z >= r.z0 && z < r.z1;
}

function roomOfCell(rooms, x, y, z) {
  for (let i = 0; i < rooms.length; i++) if (roomHas(rooms[i], x, y, z)) return rooms[i];
  return null;
}

function doorCells(d) {
  const half = ((d.w || 1) - 1) / 2;
  const out = [];
  for (let k = -half; k <= half; k++) out.push(d.axis === 'x' ? [d.x + k, d.z] : [d.x, d.z + k]);
  return out;
}

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

/* ------------------------------------------------------------------------------------------------
 * validateInterior
 * ---------------------------------------------------------------------------------------------- */
export function validateInterior(it, opts) {
  const o = opts || {};
  const errors = [];
  const warnings = [];
  const err = (m) => { if (errors.length < 60) errors.push(m); };
  if (!it || typeof it !== 'object') return { ok: false, errors: ['iç mekân nesne değil'], warnings, stats: {} };
  const rooms = Array.isArray(it.rooms) ? it.rooms : [];
  const doors = Array.isArray(it.doors) ? it.doors : [];
  const graph = Array.isArray(it.graph) ? it.graph : [];
  const props = Array.isArray(it.props) ? it.props : [];
  const lights = Array.isArray(it.lights) ? it.lights : [];
  const B = it.bounds;
  if (!B || !isInt(B.x0) || !isInt(B.x1) || !isInt(B.z0) || !isInt(B.z1) || !isInt(B.y0) || !isInt(B.y1)) err('bounds geçersiz');
  if (rooms.length === 0) err('oda yok');
  if (typeof it.kind !== 'string') err('kind yok');
  if (!it.mood || typeof it.mood.hue !== 'string') err('mood.hue yok');

  // --- odalar
  const byId = new Map();
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (!r || typeof r.id !== 'string' || r.id === '') { err('oda ' + i + ': kimlik yok'); continue; }
    if (byId.has(r.id)) err('oda kimliği yinelendi: ' + r.id);
    byId.set(r.id, r);
    const ints = isInt(r.x0) && isInt(r.y0) && isInt(r.z0) && isInt(r.x1) && isInt(r.y1) && isInt(r.z1);
    if (!ints || !(r.x1 > r.x0 && r.y1 > r.y0 && r.z1 > r.z0)) { err('oda ' + r.id + ': kutu geçersiz'); continue; }
    if (B && (r.x0 < B.x0 || r.x1 > B.x1 || r.z0 < B.z0 || r.z1 > B.z1 || r.y0 < B.y0 || r.y1 > B.y1)) err('oda ' + r.id + ': bina hacminin dışında');
    if (r.y1 - r.y0 < 2) err('oda ' + r.id + ': 2 satırdan alçak');
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b || !byId.has(a.id) || !byId.has(b.id)) continue;
      if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0 && a.z0 < b.z1 && a.z1 > b.z0) err('odalar çakışıyor: ' + a.id + ' / ' + b.id);
    }
  }

  // --- kapılar
  const doorById = new Map();
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (!d || typeof d.id !== 'string' || d.id === '') { err('kapı ' + i + ': kimlik yok'); continue; }
    if (doorById.has(d.id)) err('kapı kimliği yinelendi: ' + d.id);
    doorById.set(d.id, d);
    if (DOOR_KINDS.indexOf(d.kind) < 0) err('kapı ' + d.id + ': tür geçersiz');
    if (!isInt(d.x) || !isInt(d.y) || !isInt(d.z)) err('kapı ' + d.id + ': konum tamsayı değil');
    if (!VERT[d.kind] && d.axis !== 'x' && d.axis !== 'z') err('kapı ' + d.id + ': axis x|z olmalı');
    if (!VERT[d.kind] && d.w !== 1 && d.w !== 3) err('kapı ' + d.id + ': w 1|3 olmalı');
    if (d.lock !== undefined && d.lock !== null) {
      const L = d.lock;
      if (typeof L.id !== 'string' || LOCK_KINDS.indexOf(L.kind) < 0 || !isInt(L.tier) || L.tier < 0 || L.tier > 3) err('kapı ' + d.id + ': kilit geçersiz');
      if (d.kind === 'street') err('sokak kapısı kilitlenemez (kilit yalnız iç kapıda)');
    }
  }
  const lockIds = new Set();
  doors.forEach((d) => {
    if (d && d.lock && typeof d.lock.id === 'string') {
      if (lockIds.has(d.lock.id)) err('kilit kimliği yinelendi: ' + d.lock.id);
      lockIds.add(d.lock.id);
    }
  });
  const street = doorById.get(STREET_DOOR_ID);
  if (!street) err('sokak kapısı (' + STREET_DOOR_ID + ') yok');
  else if (street.kind !== 'street') err('sokak kapısı türü street olmalı');

  // --- graf
  const adj = new Map();
  rooms.forEach((r) => { if (r && r.id) adj.set(r.id, []); });
  const usedDoor = new Set();
  for (let i = 0; i < graph.length; i++) {
    const e = graph[i];
    if (!Array.isArray(e) || e.length !== 3) { err('graf kenarı ' + i + ' [a,b,kapı] değil'); continue; }
    const [a, b, did] = e;
    const ra = byId.get(a);
    const rb = byId.get(b);
    const d = doorById.get(did);
    if (!ra || !rb) { err('graf: bilinmeyen oda ' + a + '/' + b); continue; }
    if (a === b) err('graf: oda kendine bağlı ' + a);
    if (!d) { err('graf: bilinmeyen kapı ' + did); continue; }
    if (d.kind === 'street') { err('graf: sokak kapısı odalar arası kenar olamaz'); continue; }
    if (usedDoor.has(did)) err('graf: kapı iki kez kullanıldı ' + did);
    usedDoor.add(did);
    adj.get(a).push(b);
    adj.get(b).push(a);
    // kapı konumu duvar çizgisinde mi
    if (VERT[d.kind]) {
      if (!d.from || !d.to) err('kapı ' + did + ': dikey geçit from/to ister');
      else {
        if (!(d.from[0] >= ra.x0 && d.from[0] < ra.x1 && d.from[1] >= ra.z0 && d.from[1] < ra.z1)) err('kapı ' + did + ': from alt odada değil');
        if (!(d.to[0] >= rb.x0 && d.to[0] < rb.x1 && d.to[1] >= rb.z0 && d.to[1] < rb.z1)) err('kapı ' + did + ': to üst odada değil');
        if (!(rb.y0 > ra.y0)) err('kapı ' + did + ': B odası A odasından yüksekte olmalı');
      }
    } else {
      const cells = doorCells(d);
      for (let k = 0; k < cells.length; k++) {
        const [cx, cz] = cells[k];
        const s1 = d.axis === 'x' ? [cx, cz - 1] : [cx - 1, cz];
        const s2 = d.axis === 'x' ? [cx, cz + 1] : [cx + 1, cz];
        let okLine = true;
        for (let yy = d.y; yy < d.y + (d.h || 3); yy++) {
          const p1 = roomOfCell(rooms, s1[0], yy, s1[1]);
          const p2 = roomOfCell(rooms, s2[0], yy, s2[1]);
          const mid = roomOfCell(rooms, cx, yy, cz);
          const pair = p1 && p2 && ((p1.id === a && p2.id === b) || (p1.id === b && p2.id === a));
          if (!pair || mid) { okLine = false; break; }
        }
        if (!okLine) { err('kapı ' + did + ': hücre (' + cx + ',' + cz + ') duvar çizgisinde değil (iki yanı ' + a + '/' + b + ' olmalı)'); break; }
      }
    }
  }
  doors.forEach((d) => {
    if (d && d.id && d.kind !== 'street' && !usedDoor.has(d.id)) err('kapı grafta yok: ' + d.id);
  });
  // bağlantı + giriş odası
  const entryRoom = it.entry && byId.get(it.entry.room);
  if (!entryRoom) err('entry.room yok/geçersiz');
  else {
    if (street && street.kind === 'street') {
      const ins = it.streetInside;
      if (ins && !roomHas(entryRoom, ins.x, B ? B.y0 : 64, ins.z)) err('sokak kapısının iç hücresi entry odasında değil');
    }
    const seen = new Set([entryRoom.id]);
    const q = [entryRoom.id];
    while (q.length) {
      const c = q.pop();
      const ns = adj.get(c) || [];
      for (let i = 0; i < ns.length; i++) if (!seen.has(ns[i])) { seen.add(ns[i]); q.push(ns[i]); }
    }
    rooms.forEach((r) => { if (r && r.id && !seen.has(r.id)) err('oda sokaktan erişilemez (graf): ' + r.id); });
  }

  // --- ışıklar
  const perRoom = new Map();
  for (let i = 0; i < lights.length; i++) {
    const l = lights[i];
    const r = l && byId.get(l.room);
    if (!r) { err('ışık ' + i + ': oda yok'); continue; }
    if (!(l.level >= 1 && l.level <= 15)) err('ışık ' + i + ': seviye 1..15');
    const lx = Math.floor(l.x);
    const ly = Math.floor(l.y);
    const lz = Math.floor(l.z);
    // tavan satırına gömülü panel ışığı (y = oda üst sınırı) odanın parçasıdır
    if (!(lx >= r.x0 && lx < r.x1 && lz >= r.z0 && lz < r.z1 && ly >= r.y0 && ly <= r.y1)) err('ışık ' + i + ': odasının dışında');
    perRoom.set(r.id, (perRoom.get(r.id) || 0) + 1);
  }
  perRoom.forEach((n, id) => { if (n > MAX_LIGHTS_PER_ROOM) err('oda ' + id + ': ışık sayısı ' + n + ' > ' + MAX_LIGHTS_PER_ROOM); });

  // --- aksanlar (emisyon bütçesi)
  const accents = Array.isArray(it.accents) ? it.accents : [];
  let av = 0;
  accents.forEach((a) => { av += Math.max(0, (a.x1 - a.x0) * (a.y1 - a.y0) * (a.z1 - a.z0)); });
  if (av > MAX_ACCENT_CELLS) err('aksan emisyon hücresi ' + av + ' > ' + MAX_ACCENT_CELLS);

  // --- proplar
  const pb = propBoxes(props);
  const obst = Array.isArray(it.obstacles) ? it.obstacles : [];
  const slots = new Set();
  for (let i = 0; i < pb.length; i++) {
    const e = pb[i];
    const p = e.p;
    const tag = 'prop ' + i + '(' + String(p.kind !== undefined ? p.kind : p.key) + ')';
    if (!e.def) { err(tag + ': tanım yok (katalog/PROP_DEFS)'); continue; }
    if (!isInt(p.slot) || !isInt(p.lotId)) err(tag + ': lotId/slot tamsayı olmalı');
    else {
      const sk = p.lotId + ':' + p.slot;
      if (slots.has(sk)) err(tag + ': slot yinelendi');
      slots.add(sk);
    }
    if (![+p.x, +p.y, +p.z].every(Number.isFinite)) { err(tag + ': konum sayı değil'); continue; }
    const isDoor = hasTag(e.def, ['door']);
    const wall = e.def.mount === 'wall' || e.def.mount === 'ceiling';
    const tol = wall ? 0.5 : 0.001;
    const room = roomOfCell(rooms, Math.floor(p.x), Math.floor(p.y + 0.001), Math.floor(p.z));
    const room2 = room || (wall ? nearestRoomForWall(rooms, p) : null);
    if (!room2 && !isDoor) err(tag + ': hiçbir odada değil');
    for (let k = 0; k < e.boxes.length; k++) {
      const b = e.boxes[k];
      if (B && (b[0] < B.x0 - tol || b[3] > B.x1 + tol || b[2] < B.z0 - tol || b[5] > B.z1 + tol || b[1] < B.y0 - tol || b[4] > B.y1 + tol)) err(tag + ': çarpışma hacmi dışında');
      if (!isDoor && room2 && (b[0] < room2.x0 - tol || b[3] > room2.x1 + tol || b[2] < room2.z0 - tol || b[5] > room2.z1 + tol)) err(tag + ': çarpışma odasının dışında');
      for (let q = 0; q < obst.length; q++) {
        const ob = obst[q];
        if (b[0] < ob.x1 - EPS && b[3] > ob.x0 + EPS && b[2] < ob.z1 - EPS && b[5] > ob.z0 + EPS) err(tag + ': engelin (çekirdek) içinde');
      }
    }
  }
  // prop-prop çarpışma örtüşmesi
  for (let i = 0; i < pb.length; i++) {
    if (!pb[i].boxes.length) continue;
    for (let j = i + 1; j < pb.length; j++) {
      if (!pb[j].boxes.length) continue;
      let hit = false;
      for (let a = 0; a < pb[i].boxes.length && !hit; a++) for (let b = 0; b < pb[j].boxes.length && !hit; b++) hit = ovl(pb[i].boxes[a], pb[j].boxes[b]);
      if (hit) err('prop çarpışmaları örtüşüyor: ' + String(pb[i].p.kind) + '#' + i + ' / ' + String(pb[j].p.kind) + '#' + j);
    }
  }
  // kapı önü boşluğu
  const clearDoors = doors.filter((d) => d && !VERT[d.kind] && (d.axis === 'x' || d.axis === 'z'));
  for (let q = 0; q < clearDoors.length; q++) {
    const zones = doorClearanceBoxes(clearDoors[q]);
    for (let i = 0; i < pb.length; i++) {
      if (!pb[i].boxes.length || hasTag(pb[i].def, CLEAR_EXEMPT_TAGS)) continue;
      for (let a = 0; a < pb[i].boxes.length; a++) {
        if (ovl(pb[i].boxes[a], zones[0])) { err('kapı önü 3×2 boş değil: ' + clearDoors[q].id + ' ← ' + String(pb[i].p.kind)); break; }
      }
    }
  }
  // dikey geçit ayak izi
  for (let q = 0; q < doors.length; q++) {
    const d = doors[q];
    if (!d || !VERT[d.kind] || !d.rect) continue;
    for (let i = 0; i < pb.length; i++) {
      for (let a = 0; a < pb[i].boxes.length; a++) {
        const b = pb[i].boxes[a];
        if (b[0] < d.rect.x1 - EPS && b[3] > d.rect.x0 + EPS && b[2] < d.rect.z1 - EPS && b[5] > d.rect.z0 + EPS && !hasTag(pb[i].def, CLEAR_EXEMPT_TAGS)) {
          err('dikey geçit alanı dolu: ' + d.id + ' ← ' + String(pb[i].p.kind));
          a = 99;
          break;
        }
      }
    }
  }

  // --- ulaşılabilir hava (plan düzeyi)
  let reach = null;
  if (errors.length === 0 || o.reach === true) {
    reach = planReachability(it);
    if (!(reach.fraction >= (o.minReach === undefined ? MIN_REACH : o.minReach))) err('ulaşılabilir hava %' + Math.round(reach.fraction * 100) + ' < %' + Math.round((o.minReach === undefined ? MIN_REACH : o.minReach) * 100));
    if (reach.unreachableRooms.length) err('plan düzeyinde ulaşılamayan oda: ' + reach.unreachableRooms.join(','));
  }
  if (props.length < (o.minProps === undefined ? 0 : o.minProps)) err('prop sayısı ' + props.length + ' < ' + o.minProps);
  const stats = {
    rooms: rooms.length, doors: doors.length, props: props.length, lights: lights.length, reach: reach ? reach.fraction : null,
    distinctKeys: new Set(props.map((p) => String(p.kind !== undefined ? p.kind : p.key))).size,
  };
  return { ok: errors.length === 0, errors, warnings, stats };
}

function nearestRoomForWall(rooms, p) {
  // duvara/tavana monte prop: çapa duvar çizgisinde olabilir → ±0.5 içindeki oda
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    if (p.x >= r.x0 - 0.51 && p.x <= r.x1 + 0.51 && p.z >= r.z0 - 0.51 && p.z <= r.z1 + 0.51 && p.y >= r.y0 - 0.01 && p.y <= r.y1 + 0.01) return r;
  }
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Plan düzeyi ulaşılabilirlik (blok üretmeden)
 * ---------------------------------------------------------------------------------------------- */
export function planReachability(it) {
  const rooms = it.rooms || [];
  const pb = propBoxes(it.props || []);
  const obst = it.obstacles || [];
  const cellKey = (ri, x, z) => ri + ':' + x + ':' + z;
  const blocked = new Set();
  const free = new Map(); // key -> [ri,x,z]
  for (let ri = 0; ri < rooms.length; ri++) {
    const r = rooms[ri];
    // engel + yüksek çarpışma kutularının kapladığı hücreler (kutu başına hücre aralığı; O(kutu alanı))
    const bad = new Set();
    for (let q = 0; q < obst.length; q++) {
      for (let x = Math.max(r.x0, obst[q].x0); x < Math.min(r.x1, obst[q].x1); x++) for (let z = Math.max(r.z0, obst[q].z0); z < Math.min(r.z1, obst[q].z1); z++) bad.add(x + ':' + z);
    }
    // merdiven koşusu (rect) yürünebilir hücre DEĞİLDİR: basamak kütlesi / üst kat boşluğu; geçiş yalnız from→to bağıyla (QA2: loft v2 buzdolabı merdiven yanındaki 1 geniş koridoru kesiyordu)
    for (let q = 0; q < (it.doors || []).length; q++) {
      const dq = it.doors[q];
      if (dq.kind !== 'stair' || !dq.rect) continue;
      for (let x = Math.max(r.x0, dq.rect.x0); x < Math.min(r.x1, dq.rect.x1); x++) {
        for (let z = Math.max(r.z0, dq.rect.z0); z < Math.min(r.z1, dq.rect.z1); z++) {
          // from/to (basamağa giriş / üst kata çıkış) hücreleri koşunun ucudur: yürünebilir kalır
          if ((dq.from && dq.from[0] === x && dq.from[1] === z) || (dq.to && dq.to[0] === x && dq.to[1] === z)) continue;
          bad.add(x + ':' + z);
        }
      }
    }
    for (let i = 0; i < pb.length; i++) {
      if (hasTag(pb[i].def, ['door'])) continue;
      for (let a = 0; a < pb[i].boxes.length; a++) {
        const b = pb[i].boxes[a];
        if (!(b[4] > r.y0 + 0.5 + EPS && b[1] < r.y0 + 1.8 - EPS)) continue;
        const xa = Math.max(r.x0, Math.floor(b[0] + EPS));
        const xb = Math.min(r.x1, Math.ceil(b[3] - EPS));
        const za = Math.max(r.z0, Math.floor(b[2] + EPS));
        const zb = Math.min(r.z1, Math.ceil(b[5] - EPS));
        for (let x = xa; x < xb; x++) for (let z = za; z < zb; z++) bad.add(x + ':' + z);
      }
    }
    for (let x = r.x0; x < r.x1; x++) {
      for (let z = r.z0; z < r.z1; z++) {
        const k = cellKey(ri, x, z);
        if (bad.has(x + ':' + z)) blocked.add(k);
        else free.set(k, [ri, x, z]);
      }
    }
  }
  const idxOf = new Map();
  rooms.forEach((r, i) => idxOf.set(r.id, i));
  const links = new Map();
  const link = (a, b) => {
    if (!free.has(a) || !free.has(b)) return;
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b);
    links.get(b).push(a);
  };
  const findIdx = (x, y, z) => {
    for (let i = 0; i < rooms.length; i++) if (roomHas(rooms[i], x, y, z)) return i;
    return -1;
  };
  (it.graph || []).forEach((e) => {
    const d = (it.doors || []).find((q) => q.id === e[2]);
    if (!d) return;
    if (VERT[d.kind]) {
      const ia = idxOf.get(e[0]);
      const ib = idxOf.get(e[1]);
      if (d.from && d.to && ia !== undefined && ib !== undefined) link(cellKey(ia, d.from[0], d.from[1]), cellKey(ib, d.to[0], d.to[1]));
      return;
    }
    const cells = doorCells(d);
    for (let k = 0; k < cells.length; k++) {
      const [cx, cz] = cells[k];
      const s1 = d.axis === 'x' ? [cx, cz - 1] : [cx - 1, cz];
      const s2 = d.axis === 'x' ? [cx, cz + 1] : [cx + 1, cz];
      const i1 = findIdx(s1[0], d.y, s1[1]);
      const i2 = findIdx(s2[0], d.y, s2[1]);
      if (i1 >= 0 && i2 >= 0) link(cellKey(i1, s1[0], s1[1]), cellKey(i2, s2[0], s2[1]));
    }
  });
  const DX = [1, -1, 0, 0];
  const DZ = [0, 0, 1, -1];
  const seen = new Set();
  let startBlocked = false;
  const er = it.entry && idxOf.get(it.entry.room);
  const ins = it.streetInside;
  const out = { total: free.size, reached: 0, fraction: 0, rooms: {}, unreachableRooms: [], startBlocked: false };
  rooms.forEach((r) => { out.rooms[r.id] = { total: 0, reached: 0 }; });
  free.forEach((v) => { out.rooms[rooms[v[0]].id].total++; });
  if (er === undefined || !ins) return out;
  const sk = cellKey(er, ins.x, ins.z);
  if (!free.has(sk)) {
    startBlocked = true;
  } else {
    const st = [sk];
    seen.add(sk);
    while (st.length) {
      const c = st.pop();
      const v = free.get(c);
      for (let d = 0; d < 4; d++) {
        const nk = cellKey(v[0], v[1] + DX[d], v[2] + DZ[d]);
        if (free.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); }
      }
      const ls = links.get(c);
      if (ls) for (let i = 0; i < ls.length; i++) if (!seen.has(ls[i])) { seen.add(ls[i]); st.push(ls[i]); }
    }
  }
  seen.forEach((k) => { out.rooms[rooms[free.get(k)[0]].id].reached++; });
  out.reached = seen.size;
  out.fraction = free.size > 0 ? seen.size / free.size : 0;
  out.startBlocked = startBlocked;
  rooms.forEach((r) => { if (out.rooms[r.id].reached === 0) out.unreachableRooms.push(r.id); });
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Blok + prop çarpışması üzerinde sokaktan ulaşılabilirlik (BFS)
 * Oyuncu modeli (cityNavKit ile aynı): ayakta durulabilir ⇔ altı tam küp/plaka, ayak ve baş boşluğu serbest; adım ≤ 0.5 yürür, +1 zıplar,
 * düşüş ≤ 3; merdiven bloğu (LADDER) dikey kenar. Kapalı kayar kapı (239) ve `door` etiketli prop çarpışmaları AÇIK sayılır (kilitler çözülmüş).
 * ---------------------------------------------------------------------------------------------- */
const SUPPORT = new Uint8Array(256); // yarım blok birimi: 2 tam küp, 1 plaka/yarım
const CLIMB = new Uint8Array(256);
for (let id = 1; id < 256; id++) {
  const b = BLOCKS[id];
  if (!b) continue;
  if (CUBE_LUT[id] === 1) SUPPORT[id] = 2;
  else if (b.collision && b.collision.length === 1 && b.collision[0][4] <= 0.5 && b.collision[0][3] - b.collision[0][0] > 0.9 && b.collision[0][5] - b.collision[0][2] > 0.9) SUPPORT[id] = 1;
  else if (b.shape === 'stair') SUPPORT[id] = 1;
  if (b.climbable) CLIMB[id] = 1;
}

export function buildingOf(bp, interior) {
  return { interior, door: bp.doors[0], bp };
}

/**
 * Tuzak denetimi: sokaktan ULAŞILAN (ileri BFS) ama sokağa GERİ DÖNÜLEMEYEN iç hücreler. edges = düz [from,to,…] anahtar çiftleri; ters BFS startKey'den.
 * Dönüş: {count, samples:[{x,y,z}]} (yalnız iç hacim B içindekiler; en çok 24 örnek).
 */
function trappedCells(edges, startKey, seen, decode, B) {
  const pred = new Map();
  for (let i = 0; i < edges.length; i += 2) {
    const l = pred.get(edges[i + 1]);
    if (l) l.push(edges[i]); else pred.set(edges[i + 1], [edges[i]]);
  }
  const back = new Set([startKey]);
  const st = [startKey];
  while (st.length) {
    const l = pred.get(st.pop());
    if (!l) continue;
    for (let i = 0; i < l.length; i++) if (!back.has(l[i])) { back.add(l[i]); st.push(l[i]); }
  }
  const out = { count: 0, samples: [] };
  seen.forEach((k) => {
    if (back.has(k)) return;
    const c = decode(k);
    if (c[0] < B.x0 || c[0] >= B.x1 || c[1] < B.z0 || c[1] >= B.z1 || c[2] < B.y0 || c[2] >= B.y1) return;
    out.count++;
    if (out.samples.length < 24) {
      const from = (pred.get(k) || []).slice(0, 4).map((p) => {
        const d = decode(p);
        return { x: d[0], y: d[2], z: d[1] };
      });
      out.samples.push({ x: c[0], y: c[2], z: c[1], from });
    }
  });
  return out;
}

export function reachableFromStreet(world, props, building, opts) {
  const o = opts || {};
  const it = building.interior;
  const door = building.door;
  const getB = typeof world === 'function' ? world : (x, y, z) => world.getBlock(x, y, z);
  const pass = new Set(o.passIds || [239]);
  const B = it.bounds;
  const R = { x0: B.x0 - 3, z0: B.z0 - 3, x1: B.x1 + 3, z1: B.z1 + 3 };
  const yLo = B.y0 - 5;
  const yHi = B.y1 + 2;
  const W = R.x1 - R.x0;
  const D = R.z1 - R.z0;
  const NY = yHi - yLo;
  const cache = new Uint8Array(W * D * NY);
  const have = new Uint8Array(W * D * NY);
  const blockAt = (x, y, z) => {
    if (x < R.x0 || x >= R.x1 || z < R.z0 || z >= R.z1 || y < yLo || y >= yHi) return 1; // dışarısı dolu
    const i = ((y - yLo) * D + (z - R.z0)) * W + (x - R.x0);
    if (have[i] === 0) { cache[i] = getB(x, y, z) & 255; have[i] = 1; }
    return cache[i];
  };
  const passable = (x, y, z) => {
    const id = blockAt(x, y, z);
    return id === 0 || SOLID_LUT[id] === 0 || pass.has(id);
  };
  // prop çarpışmaları -> hücre listeleri
  const pb = propBoxes(props || []);
  const cellBoxes = new Map();
  for (let i = 0; i < pb.length; i++) {
    if (hasTag(pb[i].def, ['door'])) continue;
    for (let a = 0; a < pb[i].boxes.length; a++) {
      const b = pb[i].boxes[a];
      for (let x = Math.floor(b[0] + EPS); x < Math.ceil(b[3] - EPS); x++) {
        for (let z = Math.floor(b[2] + EPS); z < Math.ceil(b[5] - EPS); z++) {
          const k = x + ',' + z;
          const l = cellBoxes.get(k);
          if (l) l.push(b); else cellBoxes.set(k, [b]);
        }
      }
    }
  }
  const propBlocked = (x, z, h2) => {
    const l = cellBoxes.get(x + ',' + z);
    if (!l) return false;
    const feet = h2 / 2;
    for (let i = 0; i < l.length; i++) if (l[i][4] > feet + 0.5 + EPS && l[i][1] < feet + 1.8 - EPS) return true;
    return false;
  };
  // sütun düğümleri
  const colCache = new Map();
  const nodesOfColumn = (x, z) => {
    const ck = x + ',' + z;
    let res = colCache.get(ck);
    if (res) return res;
    res = [];
    for (let y = yLo; y < yHi - 2; y++) {
      const id = blockAt(x, y, z);
      const t = SUPPORT[id];
      if (t > 0 && !pass.has(id)) {
        if (passable(x, y + 1, z) && passable(x, y + 2, z)) {
          const h2 = 2 * y + t;
          if (!propBlocked(x, z, h2)) res.push(h2);
        }
      }
      if (CLIMB[id] === 1 && (passable(x, y + 1, z) || CLIMB[blockAt(x, y + 1, z)] === 1)) {
        const h2 = 2 * y;
        if (res.indexOf(h2) < 0 && !propBlocked(x, z, h2)) res.push(h2);
      }
    }
    colCache.set(ck, res);
    return res;
  };
  const DX = [1, -1, 0, 0];
  const DZ = [0, 0, 1, -1];
  // başlangıç: sokak kapısının önündeki kaldırım hücresi
  const sx = door.front.x;
  const sz = door.front.z;
  const startCol = nodesOfColumn(sx, sz);
  const out = {
    ok: false, streetOk: startCol.length > 0, total: 0, reached: 0, fraction: 0, rooms: [], unreachableRooms: [], unreachable: [],
  };
  if (!startCol.length) return out;
  // sokak ayak seviyesine en yakın düğüm
  let sh2 = startCol[0];
  for (let i = 1; i < startCol.length; i++) if (Math.abs(startCol[i] - 128) < Math.abs(sh2 - 128)) sh2 = startCol[i];
  const key = (x, z, h2) => (x - R.x0) + W * ((z - R.z0) + D * (h2 - 2 * yLo));
  const seen = new Set([key(sx, sz, sh2)]);
  const startKey = key(sx, sz, sh2);
  const edges = o.trap ? [] : null; // trap: [from,to] anahtar çiftleri (ters BFS ile geri dönüşsüz hücreleri bulmak için)
  const q = [[sx, sz, sh2]];
  while (q.length) {
    const [x, z, h2] = q.pop();
    // dikey (merdiven)
    const yy = h2 >> 1;
    if ((h2 & 1) === 0 && (CLIMB[blockAt(x, yy, z)] === 1)) {
      for (let s = -1; s <= 1; s += 2) {
        const ny = yy + s;
        if (CLIMB[blockAt(x, ny, z)] === 1 || (s < 0 && SUPPORT[blockAt(x, ny, z)] > 0)) {
          const nh = 2 * ny;
          const col = nodesOfColumn(x, z);
          if (col.indexOf(nh) >= 0) {
            if (edges) edges.push(key(x, z, h2), key(x, z, nh));
            if (!seen.has(key(x, z, nh))) { seen.add(key(x, z, nh)); q.push([x, z, nh]); }
          }
        }
      }
    }
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const nz = z + DZ[d];
      if (nx < R.x0 || nx >= R.x1 || nz < R.z0 || nz >= R.z1) continue;
      const col = nodesOfColumn(nx, nz);
      for (let i = 0; i < col.length; i++) {
        const dh = col[i] - h2;
        if (dh > 2 || dh < -6) continue;
        // +1 blok zıplama: gövde (1,8) 1,0 yükselince ayak+2,8'e kadar çıkar → cityNavKit (clr ≥ 3) ile aynı: tam küp kaynağında ayak+2, plaka kaynağında ayak+3 hücresi serbest
        if (dh === 2 && !passable(x, (h2 >> 1) + 2 + (h2 & 1), z)) continue;
        if (dh < 0) {
          // düşüş: hedef sütunda kaynak ayak hizasından hedef zemine kadar (ve baş boşluğu) açık olmalı — döşeme/tavandan "düşülemez" (QA2)
          let open = true;
          for (let yy2 = (col[i] >> 1) + (col[i] & 1); yy2 <= (h2 >> 1) + 1; yy2++) {
            if (!passable(nx, yy2, nz)) { open = false; break; }
          }
          if (!open) continue;
        }
        const kk = key(nx, nz, col[i]);
        if (edges) edges.push(key(x, z, h2), kk);
        if (seen.has(kk)) continue;
        seen.add(kk);
        q.push([nx, nz, col[i]]);
      }
    }
  }
  // iç hacimdeki tüm durulabilir düğümler / ulaşılanlar
  const roomsStat = (it.rooms || []).map((r) => ({ id: r.id, total: 0, reached: 0, fraction: 0, r }));
  for (let x = B.x0; x < B.x1; x++) {
    for (let z = B.z0; z < B.z1; z++) {
      const col = nodesOfColumn(x, z);
      for (let i = 0; i < col.length; i++) {
        const fy = col[i] >> 1;
        if (fy < B.y0 || fy >= B.y1) continue;
        out.total++;
        const got = seen.has(key(x, z, col[i]));
        if (got) out.reached++;
        else if (out.unreachable.length < 24) out.unreachable.push({ x, y: fy, z });
        for (let r = 0; r < roomsStat.length; r++) {
          if (roomHas(roomsStat[r].r, x, fy, z)) {
            roomsStat[r].total++;
            if (got) roomsStat[r].reached++;
            break;
          }
        }
      }
    }
  }
  if (edges) {
    out.trapped = trappedCells(edges, startKey, seen, (k) => {
      const rest = Math.floor(k / W);
      return [(k % W) + R.x0, (rest % D) + R.z0, (Math.floor(rest / D) + 2 * yLo) >> 1];
    }, B);
  }
  out.fraction = out.total > 0 ? out.reached / out.total : 0;
  out.rooms = roomsStat.map((s) => ({ id: s.id, total: s.total, reached: s.reached, fraction: s.total ? s.reached / s.total : 0 }));
  out.unreachableRooms = out.rooms.filter((s) => s.total === 0 || s.reached === 0).map((s) => s.id);
  out.ok = out.unreachableRooms.length === 0 && out.fraction >= (o.minFraction === undefined ? MIN_REACH : o.minFraction);
  return out;
}
