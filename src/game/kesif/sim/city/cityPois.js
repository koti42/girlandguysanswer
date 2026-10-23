/*
 * KEŞİF sim/city — İLGİ NOKTALARI (POI). Saf, belirlenimci. Sözleşme §7 `pois(seed)`.
 *
 *  buildPois(plan) → [{id,type,x,y,z,yaw,districtId, …}]    (yaw: radyan, 0 = −z'ye bakar)
 *  POI_TYPES  = park_slot garage rental courier_desk vendor door chip graffiti hidden_room race_gate roof_start portal_terminal photo_spot shelter
 *
 *  portal_terminal 16 · race_gate 8 (her yarışın başlangıç kapısı, raceId) · roof_start 8 (çatı parkuru dış merdiven dibi, route) · door (her binanın
 *  cephe girişi önü; lot) · graffiti 90 (boş duvar ≥6×4, Pazar/Konteyner/Tepe; lot,w,h) · chip 240 (çatı 60 [yalnız parkur çatıları: yürünerek ulaşılır],
 *  kanalizasyon 40, kalan 140 zemin: kapı yanı + park) · hidden_room 30 (iç mekân rezervli binalar; Faz 2 oda yerini bu parsele bağlar) ·
 *  garage (garaj binaları kapı önü) · park_slot (garaj ve terminal başına 2, asfalt kenarı) · rental (6 bölge meydanı + Kapı Meydanı) ·
 *  courier_desk (7: 6 bölge meydanı + Şule'nin dron kurye merkezi) · vendor (16 sahip kapısı + pazar tezgâhları) · photo_spot (24) · shelter (≤36, tentelı kapı önleri).
 * Konumlar yaya yolundan ulaşılabilirdir (kapı önü / apron / sokak); test cityPlan.pois.test.js doğrular.
 */
import { ARCHETYPES, DISTRICTS } from './archetypes.js';
import { GRID, surfaceAt as surfaceAtLocal } from './cityRoads.js';
import { allLots, blankOf, footprintOf } from './cityLots.js';
import { TAG, sh } from './cityPlanKit.js';

export const POI_TYPES = Object.freeze([
  'park_slot', 'garage', 'rental', 'courier_desk', 'vendor', 'door', 'chip', 'graffiti', 'hidden_room', 'race_gate', 'roof_start',
  'portal_terminal', 'photo_spot', 'shelter',
]);
export const POI_COUNTS = Object.freeze({ portal_terminal: 16, race_gate: 8, roof_start: 8, graffiti: 90, chip: 240, hidden_room: 30 });

const FACE_YAW = Object.freeze({ n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 });

export function buildPois(plan) {
  const seed = plan.seed;
  const out = [];
  const distId = (x, z) => DISTRICTS[plan.districts.districtAt(x, z)].idx;
  const add = (type, x, y, z, yaw, extra) => {
    const p = Object.assign({ id: out.length, type, x, y, z, yaw, districtId: distId(x, z) }, extra || null);
    out.push(p);
    return p;
  };
  const lots = allLots(plan);

  // terminaller
  for (let t = 0; t < plan.terminals.length; t++) {
    const T = plan.terminals[t];
    add('portal_terminal', T.x, T.y, T.z, T.yaw, { terminal: T.index });
  }
  // yarış başlangıçları, çatı parkurları
  for (let r = 0; r < plan.races.length; r++) {
    const R = plan.races[r];
    add('race_gate', R.start.x, R.start.y, R.start.z, R.start.yaw, { raceId: R.id });
  }
  for (let r = 0; r < plan.roofRoutes.length; r++) {
    const R = plan.roofRoutes[r];
    add('roof_start', R.start.x, R.start.y, R.start.z, 0, { route: R.id, lot: R.start.lot });
  }
  // kapılar, tentelı kapı önleri (barınak), garajlar, satıcılar
  const shelters = [];
  const garages = [];
  const doorOf = new Map();
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    const A0 = ARCHETYPES[l.archetype];
    if (!l.door || !A0.building) continue;
    const d = l.door;
    const p = add('door', d.front.x + 0.5, 64, d.front.z + 0.5, FACE_YAW[d.face], { lot: l.id, archetype: l.archetype });
    doorOf.set(l.id, p);
    if (l.archetype === 'dukkan_sirasi' && l.district !== 'konteyner') shelters.push(l);
    if (l.archetype === 'garaj') garages.push(l);
  }
  // sahip → satıcı / garaj / kurye
  plan.owners.forEach((v, ownerId) => {
    const dp = doorOf.get(v.lotId);
    if (!dp) return;
    add('vendor', dp.x, 64, dp.z, dp.yaw, { lot: v.lotId, owner: ownerId });
    if (v.interior === 'garaj_atolyesi') add('garage', dp.x, 64, dp.z, dp.yaw, { lot: v.lotId, owner: ownerId });
    if (v.interior === 'dron_kurye') add('courier_desk', dp.x, 64, dp.z, dp.yaw, { lot: v.lotId, owner: ownerId });
  });
  for (let g = 0; g < garages.length; g++) {
    const dp = doorOf.get(garages[g].id);
    add('garage', dp.x, 64, dp.z, dp.yaw, { lot: garages[g].id });
  }
  // park yerleri: garaj kapısı ve terminal yakınındaki asfalt kenarı (2'şer)
  const parkNear = (x, z, face, extra) => {
    // x,z: kaldırım hücresi (kapı önü/terminal); asfalt kenarı kaldırımı yola dik geçerek bulunur
    const px = x;
    const pz = z;
    const slot = roadEdgeSlot(plan, px, pz, face);
    if (slot) add('park_slot', slot.x, 64, slot.z, slot.yaw, extra);
  };
  garages.forEach((l) => {
    const d = l.door;
    parkNear(d.front.x, d.front.z, d.face, { lot: l.id });
    parkNear(d.front.x + (d.axis === 'x' ? 6 : 0), d.front.z + (d.axis === 'x' ? 0 : 6), d.face, { lot: l.id });
  });
  plan.owners.forEach((v) => {
    if (v.interior !== 'garaj_atolyesi') return;
    const l = lots.find((q) => q.id === v.lotId);
    if (!l || !l.door) return;
    parkNear(l.door.front.x, l.door.front.z, l.door.face, { lot: l.id });
  });
  // bölge meydanları: kiralama + kurye masası + park yeri
  for (let k = 0; k < 6; k++) {
    const T = plan.terminals[1 + k];
    add('rental', T.x + 4.5, 64, T.z + 4.5, T.yaw, { terminal: T.index });
    add('courier_desk', T.x - 4.5, 64, T.z + 4.5, T.yaw, { terminal: T.index });
  }
  add('rental', 4.5, 64, -6.5, 0, { terminal: 0 });
  // Pazar tezgâhları → satıcı
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    if (l.archetype !== 'pazar_tezgahi') continue;
    const cx = (l.x0 + l.x1) / 2;
    const cz = (l.z0 + l.z1) / 2;
    add('vendor', cx, 64, cz, FACE_YAW[l.front], { lot: l.id, stall: true });
  }
  // tentelı kapı önleri → barınak (≤36)
  const sh2 = shelters.map((l) => ({ l, h: sh(seed, l.id, TAG.POI_SHELTER) })).sort((a, b) => a.h - b.h || a.l.id - b.l.id).slice(0, 36);
  sh2.forEach((e) => {
    const dp = doorOf.get(e.l.id);
    add('shelter', dp.x, 64, dp.z, dp.yaw, { lot: e.l.id });
  });
  // bölge meydanlarında barınak (bank + saksı çevresi) — 6
  for (let k = 0; k < 6; k++) {
    const T = plan.terminals[1 + k];
    add('shelter', T.x + 5.5, 64, T.z - 5.5, T.yaw, { terminal: T.index });
  }

  // grafiti: boş duvarlar (90)
  const gcand = [];
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    const b = blankOf(plan, l);
    if (b) gcand.push({ l, b, h: sh(seed, l.id, TAG.POI_GRAF) });
  }
  gcand.sort((a, b) => a.h - b.h || a.l.id - b.l.id);
  const gsel = gcand.slice(0, POI_COUNTS.graffiti);
  gsel.forEach((e) => {
    const fp = footprintOf(e.l);
    const um = (e.b.u0 + e.b.u1) / 2;
    const f = e.l.front;
    let x;
    let z;
    if (f === 'n') { x = fp.x0 + um; z = fp.z0 - 0.5; } else if (f === 's') { x = fp.x0 + um; z = fp.z1 + 0.5; } else if (f === 'w') { x = fp.x0 - 0.5; z = fp.z0 + um; } else { x = fp.x1 + 0.5; z = fp.z0 + um; }
    add('graffiti', x, 64, z, FACE_YAW[f], { lot: e.l.id, w: e.b.w, h: e.b.h, face: f, u0: e.b.u0, u1: e.b.u1 });
  });

  // çipler (240): çatı 60 (parkur), kanalizasyon 40, zemin 140
  const chips = [];
  const roofPads = [];
  plan.roofRoutes.forEach((R) => {
    R.pads.forEach((p, idx) => roofPads.push({ x: p.x, y: p.y, z: p.z, lot: p.lot, route: R.id, idx, h: sh(seed, R.id * 64 + idx, TAG.POI_CHIP) }));
  });
  roofPads.sort((a, b) => a.h - b.h || a.lot - b.lot || a.idx - b.idx);
  const nRoof = Math.min(POI_COUNTS.chip >= 60 ? 60 : 0, roofPads.length);
  for (let q = 0; q < nRoof; q++) chips.push({ x: roofPads[q].x, y: roofPads[q].y, z: roofPads[q].z, kind: 'cati', lot: roofPads[q].lot });
  // kanalizasyon: kavşak merkezleri (merkez diski dışı)
  const sew = [];
  plan.underground.sewer.manholes.forEach((m) => sew.push({ m, h: sh(seed, m.i * 64 + m.j + 4096, TAG.POI_CHIP + 1) }));
  sew.sort((a, b) => a.h - b.h);
  for (let q = 0; q < 40 && q < sew.length; q++) {
    const m = sew[q].m;
    chips.push({ x: m.i * GRID + 0.5, y: 31, z: m.j * GRID + 0.5, kind: 'kanal', junction: [m.i, m.j] });
  }
  // zemin: kapı yanı (apron/kaldırım) ve park merkezleri
  const ground = [];
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    const A0 = ARCHETYPES[l.archetype];
    if (l.door && A0.building && A0.chipSlots.indexOf('door') >= 0) {
      const d = l.door;
      const side = (sh(seed, l.id, TAG.POI_CHIP + 2) & 1) === 0 ? 2 : -2;
      const x = d.axis === 'x' ? d.front.x + side : d.front.x;
      const z = d.axis === 'x' ? d.front.z : d.front.z + side;
      ground.push({ x: x + 0.5, y: 64, z: z + 0.5, kind: 'kapi', lot: l.id, h: sh(seed, l.id, TAG.POI_CHIP + 3) });
    } else if (l.archetype === 'park') {
      ground.push({ x: (l.x0 + l.x1) / 2 + 0.5, y: 64, z: (l.z0 + l.z1) / 2 + 0.5, kind: 'park', lot: l.id, h: sh(seed, l.id, TAG.POI_CHIP + 3) });
    }
  }
  ground.sort((a, b) => a.h - b.h || (a.lot || 0) - (b.lot || 0));
  const need = POI_COUNTS.chip - chips.length;
  for (let q = 0; q < need && q < ground.length; q++) chips.push(ground[q]);
  chips.forEach((c) => add('chip', c.x, c.y, c.z, 0, { kind: c.kind, lot: c.lot === undefined ? -1 : c.lot }));

  // gizli odalar (30): iç mekân rezervi olan binalardan hash sırasıyla (sahipli binalar hariç değil — sahipli de olabilir)
  const hr = [];
  for (let q = 0; q < lots.length; q++) {
    const l = lots[q];
    const A0 = ARCHETYPES[l.archetype];
    if (!l.door || !A0.building || A0.special || !A0.interiors.length || l.roof) continue;
    hr.push({ l, h: sh(seed, l.id, TAG.POI_ROOM) });
  }
  hr.sort((a, b) => a.h - b.h || a.l.id - b.l.id);
  for (let q = 0; q < POI_COUNTS.hidden_room && q < hr.length; q++) {
    const l = hr[q].l;
    const fp = footprintOf(l);
    add('hidden_room', (fp.x0 + fp.x1) / 2, 64, (fp.z0 + fp.z1) / 2, 0, { lot: l.id });
  }

  // fotoğraf noktaları (24)
  const photo = [];
  const bridgesSel = [-6, -3, 0, 3, 6];
  bridgesSel.forEach((i) => {
    const zc = 560 + 30 * Math.sin((i * GRID) / 130);
    photo.push([i * GRID + 0.5, 64, zc, Math.PI / 2]);
  });
  for (let k = 0; k < 6; k++) photo.push([plan.terminals[1 + k].x + 8.5, 64, plan.terminals[1 + k].z + 8.5, plan.terminals[1 + k].yaw]);
  photo.push([plan.hill.top.x, plan.hill.maxY, plan.hill.top.z - 6, 0]);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => photo.push([sx * 45.5, 64, sz * 45.5, Math.atan2(sx, sz)]));
  for (let c = 0; c < 8; c++) {
    const T = plan.terminals[7 + c];
    photo.push([T.x + (T.x > 0 ? -2 : 2), 64, T.z + (T.z > 0 ? -2 : 2), T.yaw]);
  }
  photo.forEach((p) => add('photo_spot', p[0], p[1], p[2], p[3]));
  return out;
}

/** Kaldırım hücresinden (x,z) `face` yönünün tersine (yola doğru) en yakın asfalt kenar hücresi: park yeri. */
function roadEdgeSlot(plan, x, z, face) {
  const R = plan.roads;
  // yol yönüne dik ilerle: face = binanın yüzü (yol bu yönde)
  const dx = face === 'e' ? 1 : face === 'w' ? -1 : 0;
  const dz = face === 's' ? 1 : face === 'n' ? -1 : 0;
  for (let step = 1; step <= 8; step++) {
    const sx = x + dx * step;
    const sz = z + dz * step;
    const s = surfaceAtLocal(R, sx, sz);
    if (s === 1 || s === 2 || s === 3) {
      const horizontalRoad = dz !== 0;
      return { x: sx + 0.5, z: sz + 0.5, yaw: horizontalRoad ? -Math.PI / 2 : 0 };
    }
  }
  return null;
}

