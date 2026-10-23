/*
 * KEŞİF sim/city/interior — kilit SORGULARI: bir prop'tan / dünya konumundan iç mekân kapısı, kilidi, ipucu notu ve tarafları bulur (saf, önbellekli).
 * systems/cityLocks bu dosyayı kullanır (prop etkileşiminde `propUsed {key,x,y,z}` konumu → kilit). Hiçbir durum saklamaz (yalnız plan önbelleği).
 *
 *   interiorAt(seed, x, z) → {lot, bp, it} | null           iç mekân ayak izi içindeki nokta için planlanmış iç mekân
 *   doorOfProp(seed, prop) → {lotId, it, door, lock, side} | null   kapı propunun (kapı hücresi merkezi) kapısı + kilidi + tarafları
 *   padOfProp(seed, prop, padKey) → {lotId, it, door, lock, side} | null   kilit düzeneği propunun (kod_paneli | kart_okuyucu | hack_terminali) kilidi
 *   lockById(seed, x, z, lockId) → {lotId, it, door, lock, side} | null   (x,z) binasındaki kilit
 *   clueOfProp(seed, prop) → {lotId, lock, digits:int[]} | null  kod notunun işaret ettiği kilit ve kodu
 *   padPropsOf(pw, door, radius?) → [{id,key,x,y,z}]        kapı çevresindeki düzenek proplarını (yüklü PropWorld'den) listeler
 */
import { lotAt, planBuilding } from '../cityPlan.js';
import { planInterior } from './index.js';
import {
  assignClues, doorSides, lockSeed, lockSpec, makeLock, normalizeLock,
} from './locks.js';

const EPS = 0.3;
const PAD_KIND = Object.freeze({ kod_paneli: 'kod', kart_okuyucu: 'kart', hack_terminali: 'mini_hack' });
const MEMO = new WeakMap();

export function interiorAt(seed, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const lot = lotAt(seed, Math.floor(x), Math.floor(z));
  if (!lot || !lot.built) return null;
  const bp = planBuilding(seed, lot);
  if (!bp || !bp.interior) return null;
  const r = bp.interior;
  if (x < r.x0 - 1 || x >= r.x1 + 1 || z < r.z0 - 1 || z >= r.z1 + 1) return null;
  let it = null;
  try {
    it = planInterior(bp, lot);
  } catch {
    it = null;
  }
  return it ? { lot, bp, it } : null;
}

function memoOf(it) {
  let m = MEMO.get(it);
  if (!m) {
    m = { sides: doorSides(it), clues: assignClues(it) };
    MEMO.set(it, m);
  }
  return m;
}

/** Gizli kapı: kapıda hidden bayrağı, kilitte data.hidden ya da iç mekân `hidden` kaydı (kindKitB / furnishA şemaları). */
export function isHiddenDoor(it, door) {
  if (!door) return false;
  if (door.hidden === true) return true;
  if (door.lock && door.lock.data && door.lock.data.hidden === true) return true;
  return !!(it && it.hidden && it.hidden.door === door.id);
}

function pack(lot, it, door) {
  const m = memoOf(it);
  const hidden = isHiddenDoor(it, door);
  let lock = door.lock ? normalizeLock(door.lock) : null;
  // gizli kapı ama kilit yok / kilit gizli bayrağı taşımıyor: kayıt anahtarı için sentetik serbest kilit (kapının kimliğinden)
  if (hidden && (!lock || (lock.kind === 'serbest' && !(lock.data && lock.data.hidden)))) {
    try {
      lock = makeLock(lock ? lock.id : 'hid_' + door.id, 'serbest', 0, { hidden: true });
    } catch {
      lock = null;
    }
  }
  return {
    lotId: lot.id,
    it,
    door,
    lock,
    hidden,
    side: m.sides.get(door.id) || null,
  };
}

export function sidesOf(it) {
  return memoOf(it).sides;
}

export function doorOfProp(seed, prop) {
  const c = interiorAt(seed, prop.x, prop.z);
  if (!c) return null;
  const doors = c.it.doors || [];
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (d.kind !== 'door' && d.kind !== 'arch') continue;
    if (Math.abs(d.x + 0.5 - prop.x) < EPS && Math.abs(d.z + 0.5 - prop.z) < EPS && Math.abs(d.y - prop.y) < 1.01) return pack(c.lot, c.it, d);
  }
  return null;
}

export function padOfProp(seed, prop, padKey) {
  const c = interiorAt(seed, prop.x, prop.z);
  if (!c) return null;
  const want = PAD_KIND[padKey];
  const doors = c.it.doors || [];
  let best = null;
  let bd = 36;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (!d.lock || (want && d.lock.kind !== want)) continue;
    const dx = d.x + 0.5 - prop.x;
    const dz = d.z + 0.5 - prop.z;
    const dy = Math.abs(d.y + 1 - prop.y);
    const dd = dx * dx + dz * dz + dy * dy;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best ? pack(c.lot, c.it, best) : null;
}

export function lockById(seed, x, z, lockId) {
  const c = interiorAt(seed, x, z);
  if (!c) return null;
  const doors = c.it.doors || [];
  for (let i = 0; i < doors.length; i++) if (doors[i].lock && doors[i].lock.id === lockId) return pack(c.lot, c.it, doors[i]);
  return null;
}

export function clueOfProp(seed, prop) {
  const c = interiorAt(seed, prop.x, prop.z);
  if (!c) return null;
  const clues = memoOf(c.it).clues;
  let found = null;
  clues.forEach((v, lockId) => {
    const p = v.prop;
    if (!found && Math.abs(p.x - prop.x) < EPS && Math.abs(p.z - prop.z) < EPS && Math.abs(p.y - prop.y) < 0.8) found = lockId;
  });
  if (found === null) return null;
  const doors = c.it.doors || [];
  for (let i = 0; i < doors.length; i++) {
    const lk = doors[i].lock;
    if (lk && lk.id === found) {
      const L = normalizeLock(lk);
      if (!L || L.kind !== 'kod') return null;
      const sp = lockSpec(L, lockSeed(seed, c.lot.id, L.id));
      return { lotId: c.lot.id, lock: L, digits: sp.code };
    }
  }
  return null;
}

/** Kapı çevresindeki (yarıçap, varsayılan 4.5) düzenek proplarını yüklü PropWorld'den toplar. */
export function padPropsOf(pw, door, radius) {
  const r = radius === undefined ? 4.5 : radius;
  const out = [];
  if (!pw || !door) return out;
  const cx = Math.floor((door.x + 0.5) / 16);
  const cz = Math.floor((door.z + 0.5) / 16);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const list = pw.chunkProps(cx + dx, cz + dz);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const e = pw.entry(p.id);
        if (!e || !e.def || e.def.tags.indexOf('lockpad') < 0) continue;
        const ddx = p.x - (door.x + 0.5);
        const ddz = p.z - (door.z + 0.5);
        if (ddx * ddx + ddz * ddz <= r * r && Math.abs(p.y - (door.y + 1)) < 2.5) out.push({ id: p.id, key: e.def.key, x: p.x, y: p.y, z: p.z });
      }
    }
  }
  return out;
}
