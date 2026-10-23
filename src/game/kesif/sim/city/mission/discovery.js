/*
 * KEŞİF sim/city/mission — KEŞİF KATALOĞU (240 veri çipi, 90 grafiti noktası, 30 gizli oda, 16 terminal, Kasa). SAF, belirlenimci, es2020.
 * Çapalar diğer paketlerin planlarından gelir (yeni konum üretilmez):
 *   çip 240        pois(seed) 'chip': çatı parkuru 60 (yürünerek) + kanalizasyon menholü 40 + zemin 140 (kapı yanı/park)       [cityPois]
 *   grafiti 90     72 sokak duvarı (pois 'graffiti' ilk 72: Pazar/Konteyner/Tepe 6×4 boş duvar) + 18 kanalizasyon paneli (7×3)  [cityPois + cityUndergroundSewer]
 *   gizli oda 30   kanalizasyon cepleri (tarayıcı 12 · düğme 9 · kod 9; cityUnderground.undergroundDiscovery().hiddenRooms)      [interiors_d]
 *   terminal 16    plan.terminals · Kasa tetikleyicisi: undergroundDiscovery().vault (Diyar Işığı)
 *
 *   buildDiscovery(seed) → katalog {seed, chips[], graffiti[], rooms[], terminals[], vault, sets[], nearChips(x,z,r,out), nearGraffiti(x,z,r,out)}   (önbellekli, LRU 4)
 *       chips[i]    {id, x, y, z, kind:'cati'|'kanal'|'kapi'|'park', lot, dist, access:'sokak'|'cati'|'kanal'}
 *       graffiti[i] {id, x, y, z (ayakta durulacak nokta), yaw (duvarın bakış yönü: n=(−sin,−cos)), w, h, where:'sokak'|'kanal', cx,cy,cz (duvar merkezi), dist}
 *       rooms[i]    {id, name, theme, unlock:'tarayici'|'dugme'|'kod', x, y, z, dist, box:{x0,y0,z0,x1,y1,z1}}
 *       sets[i]     {id, name, kind:'chip'|'graffiti'|'room'|'terminal', ids:[…]|null, need, reward}
 *   Durum (city.discovery): {chips: hex(60), graffiti: {id:[tasarım,renk]}, rooms: bit30, sets: bit, story: n, shops:[sahip kimlikleri]}
 *   emptyDiscovery() · sanitizeDiscovery(raw) · decodeBits/encodeBits · chipBits(ds) · hasChip/countChips/markChip · hasGraffiti/countGraffiti/paintGraffiti
 *   hasRoom/markRoom/countRooms · setStatus(cat, ds, terminalMask) · newSets(cat, ds, terminalMask) → [yeni tamamlanan set]
 *   storyUnlocked(nChips) · discoveredMarkers(cat, ds, terminalMask) → harita işaretleri (YALNIZ bulunmuşlar) · journalChips/journalGraffiti/journalRooms/journalStory
 */
import { getCityPlan, pois } from '../cityPlan.js';
import { undergroundDiscovery } from '../cityUnderground.js';
import { junctionAnchors } from '../cityUndergroundSewer.js';
import { UT, hh } from '../cityContentKit.js';
import { HR_THEMES } from '../cityUndergroundExtra.js';
import { DISTRICT_KEYS, DISTRICT_NAMES } from '../cityBrands.js';
import { GRAFFITI_COLORS, GRAFFITI_STENCILS, terminalName } from '../cityNames.js';
import { COUNTS, KREDI, STORY_FRAGMENTS } from './missionData.js';

const CELL = 32;
const CACHE = new Map();
const HEX = '0123456789abcdef';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clampInt = (v, lo, hi, d) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : NaN;
  if (!(n === n)) return d;
  return n < lo ? lo : n > hi ? hi : n;
};

/* ------------------------------------------------------------------------------------------------
 * Bit kümeleri
 * ---------------------------------------------------------------------------------------------- */
const CHIP_HEX = Math.ceil(COUNTS.chips / 4);

export function emptyDiscovery() {
  return {
    chips: '0'.repeat(CHIP_HEX), graffiti: {}, rooms: 0, sets: 0, story: 0, shops: [],
  };
}

export function decodeBits(hex, n) {
  const out = new Uint8Array(n);
  if (typeof hex !== 'string') return out;
  for (let c = 0; c < hex.length && c < Math.ceil(n / 4); c++) {
    const v = HEX.indexOf(hex[c]);
    if (v < 0) continue;
    for (let b = 0; b < 4; b++) {
      const i = c * 4 + b;
      if (i < n && ((v >> b) & 1) === 1) out[i] = 1;
    }
  }
  return out;
}

export function encodeBits(bits, n) {
  let s = '';
  const len = Math.ceil(n / 4);
  for (let c = 0; c < len; c++) {
    let v = 0;
    for (let b = 0; b < 4; b++) {
      const i = c * 4 + b;
      if (i < n && bits[i]) v |= 1 << b;
    }
    s += HEX[v];
  }
  return s;
}

export function sanitizeDiscovery(raw) {
  const out = emptyDiscovery();
  if (!isObj(raw)) return out;
  out.chips = encodeBits(decodeBits(raw.chips, COUNTS.chips), COUNTS.chips);
  if (isObj(raw.graffiti)) {
    const ks = Object.keys(raw.graffiti);
    let n = 0;
    for (let i = 0; i < ks.length && n < COUNTS.graffiti; i++) {
      const k = ks[i];
      if (!/^[0-9]{1,2}$/.test(k)) continue;
      const id = Number(k);
      const v = raw.graffiti[k];
      if (id >= COUNTS.graffiti || !Array.isArray(v) || v.length < 2) continue;
      out.graffiti[id] = [clampInt(v[0], 0, GRAFFITI_STENCILS.length - 1, 0), clampInt(v[1], 0, GRAFFITI_COLORS.length - 1, 0)];
      n++;
    }
  }
  out.rooms = clampInt(raw.rooms, 0, (1 << COUNTS.rooms) - 1, 0);
  out.sets = clampInt(raw.sets, 0, 0x3fffffff, 0);
  out.story = clampInt(raw.story, 0, STORY_FRAGMENTS.length, 0);
  if (Array.isArray(raw.shops)) {
    const seen = {};
    for (let i = 0; i < raw.shops.length && out.shops.length < 24; i++) {
      const s = raw.shops[i];
      if (typeof s === 'string' && /^[a-z0-9_]{1,24}$/.test(s) && s !== '__proto__' && s !== 'constructor' && !seen[s]) {
        seen[s] = 1;
        out.shops.push(s);
      }
    }
  }
  return out;
}

export function chipBits(ds) {
  return decodeBits(ds && ds.chips, COUNTS.chips);
}

export function hasChip(ds, i) {
  if (!Number.isInteger(i) || i < 0 || i >= COUNTS.chips || !ds || typeof ds.chips !== 'string') return false;
  const v = HEX.indexOf(ds.chips[i >> 2]);
  return v >= 0 && ((v >> (i & 3)) & 1) === 1;
}

export function countChips(ds) {
  const b = chipBits(ds);
  let n = 0;
  for (let i = 0; i < b.length; i++) n += b[i];
  return n;
}

/** Çipi bulunmuş yapar; yeniyse true. */
export function markChip(ds, i) {
  if (!Number.isInteger(i) || i < 0 || i >= COUNTS.chips || hasChip(ds, i)) return false;
  const b = chipBits(ds);
  b[i] = 1;
  ds.chips = encodeBits(b, COUNTS.chips);
  return true;
}

export function hasGraffiti(ds, i) {
  return !!ds && isObj(ds.graffiti) && Object.prototype.hasOwnProperty.call(ds.graffiti, i);
}

export function countGraffiti(ds) {
  return ds && isObj(ds.graffiti) ? Object.keys(ds.graffiti).length : 0;
}

export function paintGraffiti(ds, i, design, color) {
  if (!Number.isInteger(i) || i < 0 || i >= COUNTS.graffiti || hasGraffiti(ds, i)) return false;
  ds.graffiti[i] = [clampInt(design, 0, GRAFFITI_STENCILS.length - 1, 0), clampInt(color, 0, GRAFFITI_COLORS.length - 1, 0)];
  return true;
}

export function hasRoom(ds, i) {
  return Number.isInteger(i) && i >= 0 && i < COUNTS.rooms && !!ds && ((ds.rooms >> i) & 1) === 1;
}

export function markRoom(ds, i) {
  if (!Number.isInteger(i) || i < 0 || i >= COUNTS.rooms || hasRoom(ds, i)) return false;
  ds.rooms |= 1 << i;
  return true;
}

export function countRooms(ds) {
  let n = 0;
  const v = ds ? ds.rooms | 0 : 0;
  for (let i = 0; i < COUNTS.rooms; i++) n += (v >> i) & 1;
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Katalog
 * ---------------------------------------------------------------------------------------------- */
const KIND_ACCESS = Object.freeze({
  cati: 'cati', kanal: 'kanal', kapi: 'sokak', park: 'sokak',
});

function distKey(plan, x, z) {
  try {
    return plan.districts.districtAt(x, z);
  } catch {
    return 'merkez';
  }
}

function gridKey(cx, cz) {
  return (cx + 64) * 256 + (cz + 64);
}

function buildGrid(items) {
  const g = new Map();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const k = gridKey(Math.floor(it.x / CELL), Math.floor(it.z / CELL));
    let a = g.get(k);
    if (!a) {
      a = [];
      g.set(k, a);
    }
    a.push(i);
  }
  return g;
}

function nearIn(grid, items, x, z, r, out) {
  out.length = 0;
  const c0 = Math.floor((x - r) / CELL);
  const c1 = Math.floor((x + r) / CELL);
  const d0 = Math.floor((z - r) / CELL);
  const d1 = Math.floor((z + r) / CELL);
  const r2 = r * r;
  for (let cx = c0; cx <= c1; cx++) {
    for (let cz = d0; cz <= d1; cz++) {
      const a = grid.get(gridKey(cx, cz));
      if (!a) continue;
      for (let k = 0; k < a.length; k++) {
        const it = items[a[k]];
        const dx = it.x - x;
        const dz = it.z - z;
        if (dx * dx + dz * dz <= r2) out.push(a[k]);
      }
    }
  }
  return out;
}

function buildSets(chips, graffiti) {
  const sets = [];
  const add = (id, name, kind, ids, need, reward) => sets.push({
    id, name, kind, ids, need, reward,
  });
  DISTRICT_KEYS.forEach((k) => {
    const ids = chips.filter((c) => (c.kind === 'kapi' || c.kind === 'park') && c.dist === k).map((c) => c.id);
    if (ids.length > 0) add('cip_' + k, DISTRICT_NAMES[k] + ' Arşivi', 'chip', ids, ids.length, KREDI.set);
  });
  const roof = chips.filter((c) => c.kind === 'cati').map((c) => c.id);
  const sew = chips.filter((c) => c.kind === 'kanal').map((c) => c.id);
  add('cip_cati', 'Çatı Arşivi', 'chip', roof, roof.length, KREDI.set * 2);
  add('cip_kanal', 'Alt Şehir Arşivi', 'chip', sew, sew.length, KREDI.set * 2);
  ['gece_pazari', 'konteyner', 'tepe'].forEach((k) => {
    const ids = graffiti.filter((g) => g.where === 'sokak' && g.dist === k).map((g) => g.id);
    if (ids.length > 0) add('graf_' + k, DISTRICT_NAMES[k] + ' Duvarları', 'graffiti', ids, ids.length, KREDI.set);
  });
  const canal = graffiti.filter((g) => g.where === 'kanal').map((g) => g.id);
  add('graf_kanal', 'Kanal Duvarları', 'graffiti', canal, canal.length, KREDI.set);
  add('graf_kalip', 'Altı Kalıp', 'graffiti', null, GRAFFITI_STENCILS.length, KREDI.set);
  [10, 20, 30].forEach((n) => add('oda_' + n, n + ' Gizli Oda', 'room', null, n, KREDI.set));
  add('terminal_hepsi', 'Terminal Haritacısı', 'terminal', null, COUNTS.terminals, KREDI.set * 2);
  return sets;
}

const UG_GRAFFITI = 18;

/** undergroundDiscovery'nin 18 resmî paneli (aynı duvara düşen kopyalar atlanıp sıradaki panellerle tamamlanır; sıra aynı hash sırasıdır). */
function sewerPanels(plan, ug) {
  const seen = new Set();
  const out = [];
  const key = (g) => g.rect.x0 + ',' + g.rect.z0 + ',' + g.rect.x1 + ',' + g.rect.z1;
  const take = (g) => {
    const k = key(g);
    if (seen.has(k) || out.length >= UG_GRAFFITI) return;
    seen.add(k);
    out.push(g);
  };
  ug.graffiti.forEach(take);
  if (out.length < UG_GRAFFITI) {
    const jg = junctionAnchors(plan);
    jg.map((g, i) => ({ g, i, h: hh(plan.seed, i, UT.DG_PICK) })).sort((a, b) => a.h - b.h || a.i - b.i).forEach((e) => take(e.g));
  }
  return out;
}
const STREET_GRAFFITI = COUNTS.graffiti - UG_GRAFFITI;

export function buildDiscovery(seed) {
  const key = seed | 0;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const plan = getCityPlan(key);
  const list = pois(key);
  const ug = undergroundDiscovery(plan);
  const chips = [];
  const graffiti = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.type === 'chip') {
      chips.push({
        id: chips.length, x: p.x, y: p.y, z: p.z, kind: p.kind, lot: p.lot === undefined ? -1 : p.lot, dist: distKey(plan, p.x, p.z), access: KIND_ACCESS[p.kind] || 'sokak', poi: p.id,
      });
    } else if (p.type === 'graffiti' && graffiti.length < STREET_GRAFFITI) {
      const nx = -Math.sin(p.yaw);
      const nz = -Math.cos(p.yaw);
      graffiti.push({
        id: graffiti.length,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        w: p.w,
        h: p.h,
        where: 'sokak',
        cx: p.x - nx * 0.5 + nx * 0.03,
        cy: p.y + p.h / 2,
        cz: p.z - nz * 0.5 + nz * 0.03,
        dist: distKey(plan, p.x, p.z),
        lot: p.lot,
      });
    }
  }
  // kanalizasyon grafiti panelleri: 18 resmî nokta (yan duvar, yüz tünel eksenine bakar). Aynı duvarı gösteren kopyalar atlanır (iki panel aynı kol/yana düşebilir).
  const panels = sewerPanels(plan, ug);
  for (let i = 0; i < panels.length && graffiti.length < COUNTS.graffiti; i++) {
    const g = panels[i];
    const r = g.rect;
    const alongX = r.x1 - r.x0 > r.z1 - r.z0;
    const sgn = g.side > 0 ? 1 : -1;
    const nx = alongX ? 0 : -sgn;
    const nz = alongX ? -sgn : 0;
    const wx = (r.x0 + r.x1) / 2;
    const wz = (r.z0 + r.z1) / 2;
    graffiti.push({
      id: graffiti.length,
      x: wx + nx * 1.6,
      y: g.y - 1,
      z: wz + nz * 1.6,
      yaw: Math.atan2(-nx, -nz),
      w: 7,
      h: 3,
      where: 'kanal',
      cx: wx + nx * 0.5 + nx * 0.03,
      cy: g.y + 0.5,
      cz: wz + nz * 0.5 + nz * 0.03,
      dist: distKey(plan, wx, wz),
      lot: -1,
    });
  }
  const rooms = ug.hiddenRooms.map((h) => {
    const th = HR_THEMES.find((t) => t.name === h.theme);
    return {
      id: h.id,
      name: 'Gizli Oda: ' + h.theme,
      theme: th ? th.key : 'depo',
      unlock: h.unlock,
      x: h.x,
      y: h.y,
      z: h.z,
      dist: h.district,
      box: {
        x0: h.trigger.x0, x1: h.trigger.x1, z0: h.trigger.z0, z1: h.trigger.z1, y0: h.trigger.y0, y1: h.trigger.y1,
      },
    };
  });
  const terminals = plan.terminals.map((t, i) => ({
    id: i, x: t.x, y: t.y, z: t.z, name: terminalName(i),
  }));
  const V = plan.underground.vault;
  const vault = ug.vault ? {
    name: ug.vault.name,
    trigger: ug.vault.trigger,
    anchor: ug.vault.anchor,
    rect: {
      x0: V.x0, x1: V.x1, z0: V.z0, z1: V.z1, y0: V.y0, y1: V.y1,
    },
  } : null;
  const cg = buildGrid(chips);
  const gg = buildGrid(graffiti);
  const out = {
    seed: key,
    chips,
    graffiti,
    rooms,
    terminals,
    vault,
    sets: buildSets(chips, graffiti),
    nearChips: (x, z, r, o) => nearIn(cg, chips, x, z, r, o),
    nearGraffiti: (x, z, r, o) => nearIn(gg, graffiti, x, z, r, o),
  };
  CACHE.set(key, out);
  if (CACHE.size > 4) CACHE.delete(CACHE.keys().next().value);
  return out;
}

/** (x,y,z) hangi gizli odanın tetikleyici kutusunda? → oda | null (kutu yarı açık, dikeyde ±1 pay). */
export function roomAt(cat, x, y, z) {
  for (let i = 0; i < cat.rooms.length; i++) {
    const b = cat.rooms[i].box;
    if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1 && y >= b.y0 - 1 && y < b.y1 + 1) return cat.rooms[i];
  }
  return null;
}

/** Kasa salonunun içinde mi (nm_kasa)? */
export function inVaultRect(cat, x, y, z) {
  const t = cat.vault && cat.vault.rect;
  return !!t && x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1 && y >= t.y0 - 1 && y < t.y1 + 1;
}

/** Kasa Diyar Işığı tetikleyicisinde mi? */
export function inVaultTrigger(cat, x, y, z) {
  const t = cat.vault && cat.vault.trigger;
  return !!t && x >= t.x0 && x < t.x1 && z >= t.z0 && z < t.z1 && y >= t.y0 - 1 && y < t.y1 + 1;
}

/* ------------------------------------------------------------------------------------------------
 * Koleksiyonlar
 * ---------------------------------------------------------------------------------------------- */
function setProgress(cat, ds, set) {
  if (set.kind === 'chip') {
    let n = 0;
    for (let i = 0; i < set.ids.length; i++) if (hasChip(ds, set.ids[i])) n++;
    return n;
  }
  if (set.kind === 'graffiti') {
    if (set.ids) {
      let n = 0;
      for (let i = 0; i < set.ids.length; i++) if (hasGraffiti(ds, set.ids[i])) n++;
      return n;
    }
    const used = {};
    Object.keys(ds.graffiti).forEach((k) => { used[ds.graffiti[k][0]] = 1; });
    return Object.keys(used).length;
  }
  if (set.kind === 'room') return countRooms(ds);
  return 0;
}

/** Koleksiyon ilerlemesi: [{id,name,have,need,done,reward,index}] (terminal seti dışarıdan verilen 16 bitlik maskeyle). */
export function setStatus(cat, ds, terminalMask) {
  const out = [];
  for (let i = 0; i < cat.sets.length; i++) {
    const s = cat.sets[i];
    let have = setProgress(cat, ds, s);
    if (s.kind === 'terminal') {
      have = 0;
      for (let t = 0; t < COUNTS.terminals; t++) have += ((terminalMask | 0) >> t) & 1;
    }
    out.push({
      id: s.id, name: s.name, have, need: s.need, done: have >= s.need && s.need > 0, reward: s.reward, index: i,
    });
  }
  return out;
}

/** Yeni tamamlanan setleri döndürür ve ds.sets bitlerini işler. */
export function newSets(cat, ds, terminalMask) {
  const fresh = [];
  const st = setStatus(cat, ds, terminalMask);
  for (let i = 0; i < st.length && i < 30; i++) {
    if (st[i].done && ((ds.sets >> i) & 1) === 0) {
      ds.sets |= 1 << i;
      fresh.push(st[i]);
    }
  }
  return fresh;
}

/* ------------------------------------------------------------------------------------------------
 * Hikâye, harita, günlük
 * ---------------------------------------------------------------------------------------------- */
/** n çip bulunduğunda açılmış hikâye parçası sayısı (her 10 çipte bir). */
export function storyUnlocked(nChips) {
  return Math.min(STORY_FRAGMENTS.length, Math.floor(Math.max(0, nChips) / 10));
}

/** Harita işaretleri — YALNIZ bulunmuş çipler/grafitiler/odalar (terminaller contentMapCity'de ayrıca işaretlenir). */
export function discoveredMarkers(cat, ds) {
  const out = [];
  for (let i = 0; i < cat.chips.length; i++) {
    if (!hasChip(ds, i)) continue;
    const c = cat.chips[i];
    out.push({
      id: 'cip:' + i, type: 'cip', name: 'Veri çipi ' + (i + 1), x: c.x, z: c.z, discovered: true, color: '#7dffb0',
    });
  }
  for (let i = 0; i < cat.graffiti.length; i++) {
    if (!hasGraffiti(ds, i)) continue;
    const g = cat.graffiti[i];
    out.push({
      id: 'grafiti:' + i, type: 'grafiti', name: 'Grafiti ' + (i + 1), x: g.x, z: g.z, discovered: true, color: '#ff8de0',
    });
  }
  for (let i = 0; i < cat.rooms.length; i++) {
    if (!hasRoom(ds, i)) continue;
    const r = cat.rooms[i];
    out.push({
      id: 'oda:' + i, type: 'oda', name: r.name, x: r.x, z: r.z, discovered: true, color: '#ffd24a',
    });
  }
  return out;
}

export function journalChips(cat, ds) {
  const out = [];
  for (let i = 0; i < cat.chips.length; i++) {
    if (!hasChip(ds, i)) continue;
    const c = cat.chips[i];
    out.push({
      id: i, name: 'Veri çipi ' + (i + 1), dist: DISTRICT_NAMES[c.dist] || '', kind: c.kind,
    });
  }
  return out;
}

export function journalGraffiti(cat, ds) {
  const out = [];
  for (let i = 0; i < cat.graffiti.length; i++) {
    if (!hasGraffiti(ds, i)) continue;
    const v = ds.graffiti[i];
    out.push({
      id: i, name: 'Grafiti ' + (i + 1), design: GRAFFITI_STENCILS[v[0]], color: GRAFFITI_COLORS[v[1]], dist: DISTRICT_NAMES[cat.graffiti[i].dist] || '',
    });
  }
  return out;
}

export function journalRooms(cat, ds) {
  const out = [];
  for (let i = 0; i < cat.rooms.length; i++) {
    if (!hasRoom(ds, i)) continue;
    out.push({ id: i, name: cat.rooms[i].name, dist: DISTRICT_NAMES[cat.rooms[i].dist] || '' });
  }
  return out;
}

/** Hikâye parçaları: açık olanların metinleri. */
export function journalStory(nChips) {
  const n = storyUnlocked(nChips);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: i, text: STORY_FRAGMENTS[i] });
  return out;
}
