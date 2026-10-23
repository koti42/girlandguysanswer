/*
 * KEŞİF sim/city — YERALTI KİLİT GRAFI (Faz 2, interiors_d). Saf, belirlenimci. Sözleşme §8 (Kilit modeli, DAG kuralı, hapis yok).
 *
 *  undergroundDoors(plan) → Door[]    kilitli/gizli tüm yeraltı kapıları (gizli oda kapısı 30, lab giriş kapağı 12, lab bulkhead 12+1, personel odası 4, kasa kapağı 1)
 *  undergroundLocks(plan) → Lock[]    {id,kind,tier,data}; kimlik ^[0-9a-z]{1,10}$ (dims.neon.locks anahtarı)
 *  lockGraph(plan)        → {locks, doors, providers, requires}
 *  solveUnderground(plan) → {open:Set, items:Set, unsolved:[lockId]}    sabit-nokta çözümü: DAG ise tüm kilitler çözülür
 *  BASE_ITEMS             hiçbir kilidin arkasında olmayan başlangıç eşyaları ('tarayici')
 *
 * Door = {id, kind:'door'|'hatch', x,y,z, axis, w,h, cells:[{x,y,z,closed,open}], lock:Lock, hidden:bool, exitFree:true, deep:{x,y,z}, …}
 *   - cells: kilit durumuna göre blok kimlikleri (kapalı → açık). Sürgülü kapı 239↔240; gizli duvar tuğla↔hava; kapak (hatch) 239/zemin ↔ MERDİVEN (düşüş yok).
 *   - exitFree: içeriden (deep tarafından) çıkış HER ZAMAN serbest; kilit kalıcı değil (yanlış denemede 20 sn soğuma).
 * Provider = {item, behind:[lockId], at:{x,y,z}, room} — eşyanın bulunduğu yer, oraya varmak için açılması gereken kilitler.
 * requires[lockId] = ['tarayici' | 'clue:<id>' | 'kart_1'…]; DAG: bir kilidi açan eşya, o kilidin (ya da ardılının) arkasında olamaz.
 */
import { B } from '../blocks.js';
import { ID } from './cityEmit.js';
import { sewerExtras } from './cityUndergroundExtra.js';
import { hiddenLockPlan, kart1RoomId } from './cityUndergroundSewer.js';
import { kartStationId, metroStaffLockPlan } from './cityUndergroundMetro.js';
import { labData } from './cityUndergroundLabs.js';
import { vaultData } from './cityUndergroundVault.js';
import { mkLock } from './cityContentKit.js';

export const BASE_ITEMS = Object.freeze(['tarayici']);
const FY = 31;

function hiddenDoor(H, lock) {
  const cells = [];
  for (let c = 0; c < H.door.cells.length; c++) {
    for (let h = 0; h < 3; h++) cells.push({ x: H.door.cells[c].x, y: FY + h, z: H.door.cells[c].z, closed: ID.STONE_BRICK, open: 0 });
  }
  return {
    id: 'hd' + H.id, kind: 'door', x: H.door.cells[0].x, y: FY, z: H.door.cells[0].z, axis: H.axis, w: 2, h: 3, cells, lock, hidden: true, exitFree: true,
    deep: { x: H.center.x, y: FY, z: H.center.z }, room: H.id,
  };
}

function staffDoor(S, lock) {
  const cells = [];
  const pl = S.door.plane;
  for (let z = pl.z0; z < pl.z1; z++) for (let x = pl.x0; x < pl.x1; x++) for (let h = 0; h < 3; h++) cells.push({ x, y: 44 + h, z, closed: ID.DOOR, open: ID.DOOR_OPEN });
  const mid = S.cell(9, 0);
  const deep = S.cell(14, 0);
  return {
    id: 'sd' + S.id, kind: 'door', x: mid[0], y: 44, z: mid[1], axis: S.axis, w: 3, h: 3, cells, lock, hidden: false, exitFree: true,
    deep: { x: deep[0], y: 44, z: deep[1] }, station: S.id,
  };
}

/** Kilit/kapı/sağlayıcı/gereksinim grafı (plan üstünde önbellekli). */
export function lockGraph(plan) {
  if (plan._ugGraph) return plan._ugGraph;
  const doors = [];
  const locks = [];
  const providers = [];
  const requires = {};
  const reg = (door) => {
    doors.push(door);
    if (door.lock) locks.push(door.lock);
  };
  const ex = sewerExtras(plan);
  // 1) gizli odalar
  const k1 = kart1RoomId(plan);
  for (let i = 0; i < ex.hidden.length; i++) {
    const H = ex.hidden[i];
    const lp = hiddenLockPlan(plan, H);
    reg(hiddenDoor(H, lp.lock));
    if (lp.lock.kind === 'kod') {
      requires[lp.lock.id] = ['clue:' + lp.lock.id];
      providers.push({ item: 'clue:' + lp.lock.id, behind: [], at: lp.lock.data.clue, room: 'tunel' });
    } else if (lp.lock.data.reveal === 'tarayici') requires[lp.lock.id] = ['tarayici'];
    else requires[lp.lock.id] = [];
    if (H.id === k1) providers.push({ item: 'kart_1', behind: [lp.lock.id], at: { x: H.center.x, y: FY, z: H.center.z }, room: 'gizli' + H.id });
  }
  // 2) metro personel odaları
  const ks = kartStationId(plan);
  for (let i = 0; i < ex.staff.length; i++) {
    const S = ex.staff[i];
    const lp = metroStaffLockPlan(plan, S);
    reg(staffDoor(S, lp.lock));
    if (lp.lock) {
      requires[lp.lock.id] = ['kart_1'];
      if (S.id === ks) providers.push({ item: 'kart_2', behind: [lp.lock.id], at: { x: S.clear.x0 + 1, y: 44, z: S.clear.z0 + 1 }, room: 'personel' + S.id });
    }
  }
  // 3) laboratuvarlar
  const LD = labData(plan);
  const V = plan.underground.vault;
  for (let i = 0; i < LD.labs.length; i++) {
    const lab = LD.labs[i];
    reg(lab.entry);
    const e = lab.entry.lock;
    if (e.kind === 'kod') {
      requires[e.id] = ['clue:' + e.id];
      providers.push({ item: 'clue:' + e.id, behind: [], at: e.data.clue, room: 'tunel' });
    } else requires[e.id] = ['tarayici'];
    if (lab.d1) {
      reg(lab.d1);
      requires[lab.d1.lock.id] = ['kart_2'];
    }
    reg(lab.d2);
    requires[lab.d2.lock.id] = [];
    if (lab.id === V.labId) {
      const r1 = lab.rooms.find((r) => r.k === 1);
      providers.push({
        item: 'kart_3', behind: [e.id, lab.d1.lock.id], at: { x: Math.floor((r1.x0 + r1.x1) / 2), y: r1.y0, z: Math.floor((r1.z0 + r1.z1) / 2) }, room: 'lab' + lab.id + 'calisma',
      });
    }
  }
  // 4) kasa kapağı
  const VD = vaultData(plan);
  reg(VD.door);
  requires[VD.door.lock.id] = ['kart_3'];
  const out = { locks, doors, providers, requires };
  Object.defineProperty(plan, '_ugGraph', { value: out, enumerable: false, configurable: true, writable: true });
  return out;
}

export function undergroundLocks(plan) {
  return lockGraph(plan).locks;
}

export function undergroundDoors(plan) {
  return lockGraph(plan).doors;
}

/** Sabit-nokta çözümü: hangi kilitler açılır, hangi eşyalar elde edilir. DAG ise `unsolved` boştur. */
export function solveUnderground(plan, opts) {
  const G = lockGraph(plan);
  const base = (opts && opts.base) || BASE_ITEMS;
  const items = new Set(base);
  const open = new Set();
  for (let guard = 0; guard < 64; guard++) {
    let changed = false;
    for (let i = 0; i < G.locks.length; i++) {
      const L = G.locks[i];
      if (open.has(L.id)) continue;
      const req = G.requires[L.id] || [];
      if (req.every((r) => items.has(r))) {
        open.add(L.id);
        changed = true;
      }
    }
    for (let i = 0; i < G.providers.length; i++) {
      const P = G.providers[i];
      if (items.has(P.item)) continue;
      if (P.behind.every((b) => open.has(b))) {
        items.add(P.item);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { open, items, unsolved: G.locks.filter((l) => !open.has(l.id)).map((l) => l.id) };
}

/** Çözümden sonra blok durumu: kapı hücresi (x,y,z) → açık blok kimliği. Testler için. */
export function openCells(plan) {
  const m = new Map();
  const G = lockGraph(plan);
  for (let i = 0; i < G.doors.length; i++) {
    const d = G.doors[i];
    for (let c = 0; c < d.cells.length; c++) m.set(d.cells[c].x + ',' + d.cells[c].y + ',' + d.cells[c].z, d.cells[c].open);
  }
  return m;
}

export { mkLock, B };
