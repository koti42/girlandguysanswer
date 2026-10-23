/*
 * KEŞİF sim/props — İÇ MEKÂN BAĞLAMI (saf): bir iç mekân propunun hangi binada/odada olduğu, sahibi, kilidi ve kod ipucu. Davranışlar
 * (propBehaviorsInterior) ve çizici (propRendererInterior: ton, kod zarları) bunu kullanır. Kaynak: şehir planı → bina planı → iç mekân planı
 * (hepsi önbellekli, belirlenimci). Hiçbir durum saklamaz (kilit köprüsü hariç; aşağıda).
 *
 *   indoorAt(citySeed, x, z)            → {lot, bp, it, kind, owner} | null     (x,z dünya; iç mekân ayak izi içinde değilse null)
 *   indoorAtProp(citySeed, prop)        → aynısı; duvar propları kabuk düzleminde durur → bakış yönünde 0,3 blok içeri kaydırılır
 *   ownerAtProp(citySeed, prop)         → Owner | null
 *   moodHueAt(citySeed, prop)           → mood ton adı | null
 *   doorLockOf(citySeed, prop)          → {lock, door, back:{x0,z0,x1,z1,y0,y1}|null} | null     kapı propunun kapısı + kilidi (+ kilitli yan oda kutusu)
 *   padLockOf(citySeed, prop, padKind)  → {lock, door} | null                   kilit düzeneğinin (kod_paneli | kart_okuyucu | hack_terminali) kilidi
 *   clueDigitsOf(citySeed, prop)        → number[] | null                        kod_notu / ilan_panosu ipucu rakamları (1..6)
 *
 * Kilit köprüsü (locks_hack ile sözleşme): isLockOpen(lockId) → bool. Varsayılan: 'serbest' kilit açıktır; markLockOpen(id) (olay `lockOpened`)
 * ile açılanlar açık sayılır; setLockBridge({isOpen}) kendi durum kaynağını (cityLocks) bağlar. Kilitli bir kapıya içeriden (kilitli odanın
 * İÇİNDEN) kullanmak HER ZAMAN serbesttir (hapis yok; sözleşme §8, §22.2).
 */
import { lotAt, planBuilding } from '../city/cityPlan.js';
import { planInterior } from '../city/interior/index.js';
import { OWNER_BY_INTERIOR } from '../city/ownerData.js';

const EPS = 0.26;

/* ------------------------------------------------------------------------------------------------ bina */
export function indoorAt(citySeed, x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const lot = lotAt(citySeed, Math.floor(x), Math.floor(z));
  if (!lot || !lot.built) return null;
  const bp = planBuilding(citySeed, lot);
  if (!bp || !bp.interior) return null;
  const r = bp.interior;
  if (x < r.x0 || x >= r.x1 || z < r.z0 || z >= r.z1) return null;
  const it = planInterior(bp, lot);
  if (!it) return null;
  const kind = it.kind || r.kind;
  return {
    lot, bp, it, kind, owner: OWNER_BY_INTERIOR[kind] || it.owner || null,
  };
}

const FX = [0, 1, 0, -1];
const FZ = [1, 0, -1, 0];

/** Duvara yaslı proplar (kabuk düzlemi = tam blok sınırı) odanın İÇİNDEN sorgulanır: yerel +Z (ön) yönünde 0,3 blok. */
export function indoorAtProp(citySeed, prop) {
  const k = prop.yaw & 3;
  return indoorAt(citySeed, prop.x + FX[k] * 0.3, prop.z + FZ[k] * 0.3);
}

export function ownerAtProp(citySeed, prop) {
  const c = indoorAtProp(citySeed, prop);
  return c ? c.owner : null;
}

export function moodHueAt(citySeed, prop) {
  const c = indoorAtProp(citySeed, prop);
  if (!c) return null;
  if (c.it.mood && c.it.mood.hue) return c.it.mood.hue;
  return c.owner ? c.owner.mood.hue : null;
}

/* ------------------------------------------------------------------------------------------------ kilit köprüsü */
let BRIDGE = null;
const OPENED = new Set();

export function setLockBridge(b) {
  BRIDGE = b && typeof b.isOpen === 'function' ? b : null;
}

export function getLockBridge() {
  return BRIDGE;
}

export function markLockOpen(lockId) {
  if (typeof lockId === 'string' && lockId) OPENED.add(lockId);
}

export function clearOpenedLocks() {
  OPENED.clear();
}

export function isLockOpen(lock) {
  if (!lock || typeof lock.id !== 'string') return true;
  if (lock.kind === 'serbest') return true;
  if (OPENED.has(lock.id)) return true;
  if (BRIDGE) {
    try {
      return BRIDGE.isOpen(lock.id) === true;
    } catch {
      return false;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------------------------------ kapı / düzenek */
function near(a, b) {
  return Math.abs(a - b) < EPS;
}

function roomBox(it, id) {
  const rs = it.rooms || [];
  for (let i = 0; i < rs.length; i++) {
    if (rs[i].id === id) {
      return {
        x0: rs[i].x0, z0: rs[i].z0, x1: rs[i].x1, z1: rs[i].z1, y0: rs[i].y0, y1: rs[i].y1,
      };
    }
  }
  return null;
}

function doorCenters(d) {
  return { x: d.x + 0.5, z: d.z + 0.5 };
}

export function doorLockOf(citySeed, prop) {
  const c = indoorAt(citySeed, prop.x, prop.z);
  if (!c) return null;
  const doors = c.it.doors || [];
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (d.kind !== 'door' && d.kind !== 'arch') continue;
    const ct = doorCenters(d);
    if (near(ct.x, prop.x) && near(ct.z, prop.z) && Math.abs(d.y - prop.y) < 1.01) {
      let back = null;
      const gr = (c.it.graph || []).find((e) => e[2] === d.id);
      if (gr) back = roomBox(c.it, gr[1]);
      return { lock: d.lock || null, door: d, back };
    }
  }
  return null;
}

const PAD_LOCK = Object.freeze({ kod_paneli: 'kod', kart_okuyucu: 'kart', hack_terminali: 'mini_hack' });

export function padLockOf(citySeed, prop, padKind) {
  const c = indoorAtProp(citySeed, prop);
  if (!c) return null;
  const want = PAD_LOCK[padKind];
  const doors = c.it.doors || [];
  let best = null;
  let bestD = 1e9;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (!d.lock || (want && d.lock.kind !== want)) continue;
    const ct = doorCenters(d);
    const dx = ct.x - prop.x;
    const dz = ct.z - prop.z;
    const dy = Math.abs(d.y + 1 - prop.y);
    const dd = dx * dx + dz * dz + dy * dy;
    if (dd < bestD && dd < 36) {
      bestD = dd;
      best = { lock: d.lock, door: d };
    }
  }
  return best;
}

/* ------------------------------------------------------------------------------------------------ kod ipucu */
/** Kod notu `data` alanı (interior/cKit.packCode = kindKitB.packCode): basamak başına 3 bit (1..6), uzunluk << 12 (≤ 4 basamak). */
function digitsFromBits(data) {
  const n = (data >> 12) & 7;
  const out = [];
  for (let i = 0; i < n && i < 4; i++) out.push((data >> (3 * i)) & 7);
  return out;
}

function validDigits(a) {
  return a.length >= 3 && a.length <= 4 && a.every((d) => d >= 1 && d <= 6);
}

/** Kod notunun rakamları: önce iç mekân planındaki gerçek ipucu kaydı (kilit verisi), olmazsa `data` alanı (iki paketleme biçimi). */
export function clueDigitsOf(citySeed, prop) {
  const c = indoorAtProp(citySeed, prop);
  const data = (prop.flags >>> 0) & 0xffff;
  if (c && c.it) {
    const clues = c.it.clues || [];
    for (let i = 0; i < clues.length; i++) {
      const q = clues[i];
      if (near(q.x, prop.x) && near(q.z, prop.z) && Math.abs(q.y - prop.y) < 0.6) {
        const locks = [];
        (c.it.doors || []).forEach((d) => { if (d.lock) locks.push(d.lock); });
        (c.it.locks || []).forEach((l) => { if (l) locks.push(l); });
        for (let k = 0; k < locks.length; k++) {
          const dt = locks[k].data;
          if (locks[k].id === q.lockId && dt) {
            const code = Array.isArray(dt.code) ? dt.code : Array.isArray(dt.kod) ? dt.kod : null;
            if (code && validDigits(code)) return code.slice();
          }
        }
      }
    }
  }
  if (data === 0) return null;
  const b = digitsFromBits(data);
  return validDigits(b) ? b : null;
}
