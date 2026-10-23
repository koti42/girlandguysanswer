/*
 * KEŞİF sim — yaratık YZ ortak yardımcıları (saf; three/DOM yok, worker-güvenli).
 *
 * Açı/yön matematiği, belirlenimci varlık rastgeleliği, hücre sorguları, ışık seviyesi, yürünebilirlik
 * sondaları (basamak/zıplama/kenar/su/lav) ve yön seçimi. Sıcak yolda ayırma yapmaz.
 *
 * Koordinat: x,z yatay, y yukarı; yaw 0 → -Z'ye bakar, yaw artınca sola döner; ileri = (-sin yaw, -cos yaw).
 */
import { BLOCKS, LIQUID_LUT, SOLID_LUT } from './blocks.js';
import { worldMaxY, worldMinY } from './constants.js';
import { hash3f } from './rng.js';

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
/** v'yi hedefe en çok m adım yaklaştırır. */
export function approach(v, target, m) {
  if (v < target) return v + m > target ? target : v + m;
  return v - m < target ? target : v - m;
}
/** Açıyı (-π, π] aralığına sarar. */
export function wrapAngle(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r;
}
/** from → to en kısa işaretli fark. */
export function angleDiff(from, to) {
  return wrapAngle(to - from);
}
/** cur açısını hedefe en çok maxStep döndürür. */
export function turnToward(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  if (d > maxStep) return cur + maxStep;
  if (d < -maxStep) return cur - maxStep;
  return target;
}
/** Yön (dx,dz) → yaw (bkz. başlık). */
export function yawFromDir(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/* ------------------------------------------------------------------------------------------------
 * Belirlenimci varlık rastgeleliği: (varlık kimliği, sayaç, dünya tohumu) → [0,1). Sayaç kayda girer.
 * ---------------------------------------------------------------------------------------------- */
/** Üç tamsayıdan [0,1) belirlenimci değer (başlangıç durumları için). */
export function hash01(a, b, c) {
  return hash3f(a | 0, b | 0, c | 0, 0);
}
export function rnd(em, ent) {
  ent.rn = (ent.rn + 1) | 0;
  return hash3f(ent.id | 0, ent.rn, em.seed | 0);
}
export function rndRange(em, ent, a, b) {
  return a + rnd(em, ent) * (b - a);
}
export function rndInt(em, ent, a, b) {
  return a + Math.floor(rnd(em, ent) * (b - a + 1));
}
export function rndSign(em, ent) {
  return rnd(em, ent) < 0.5 ? -1 : 1;
}

/* ------------------------------------------------------------------------------------------------
 * Hücre sorguları (null = üretilmemiş chunk → katı/engel sayılır)
 * ---------------------------------------------------------------------------------------------- */
/** Hücre kimliği; üretilmemişse null; yükseklik dışı hava (0) / zemin altı katı. */
export function cellId(world, x, y, z) {
  if (y > worldMaxY(world)) return 0;
  if (y < worldMinY(world)) return 1;
  const id = world.getBlock(x, y, z);
  return id === undefined ? null : id;
}
export function cellSolid(world, x, y, z) {
  const id = cellId(world, x, y, z);
  return id === null || SOLID_LUT[id] === 1;
}
/** Sıvı kimliği (yoksa 0). */
export function cellLiquid(world, x, y, z) {
  const id = cellId(world, x, y, z);
  return id !== null && LIQUID_LUT[id] === 1 ? id : 0;
}
/** Lavdan etkilenmeyen türler (Lav Slime). */
export function lavaImmune(def) {
  return !!def && def.key === 'lavslime';
}
export function liquidDamage(id) {
  return id > 0 && BLOCKS[id] ? BLOCKS[id].damage || 0 : 0;
}

/**
 * Etkin ışık seviyesi 0..15: blok ışığı ile (gökyüzü × gün faktörü) büyüğü.
 * Dünya getLight yoksa (sahte dünya) tam gündüz sayılır.
 */
export function effectiveLight(world, x, y, z, dayFactor) {
  if (typeof world.getLight !== 'function') return 15;
  const L = world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
  const sky = L >> 4;
  const blk = L & 15;
  const df = dayFactor === undefined ? 1 : dayFactor;
  const s = Math.floor(sky * df + 0.5);
  return s > blk ? s : blk;
}

/** Ayak hücresinden aşağıda ilk katı zeminin üst y'si (tam sayı); bulunamazsa -1. */
export function groundYBelow(world, x, y, z, maxDown) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  const fy = Math.floor(y);
  for (let s = 0; s <= maxDown; s++) {
    const id = cellId(world, fx, fy - s - 1, fz);
    if (id === null) return -1;
    if (SOLID_LUT[id] === 1) return fy - s;
  }
  return -1;
}

/** Yürünebilir hücre: gövde hücreleri boş/zararsız, altı katı. hc = gövde hücre yüksekliği. */
export function standable(world, x, y, z, hc, o) {
  for (let j = 0; j < hc; j++) {
    const id = cellId(world, x, y + j, z);
    if (id === null || SOLID_LUT[id] === 1) return false;
    if (LIQUID_LUT[id] === 1) {
      if (liquidDamage(id) > 0 && !o.ignoreLava) return false;
      if (o.avoidWater) return false;
    }
  }
  const g = cellId(world, x, y - 1, z);
  return g !== null && SOLID_LUT[g] === 1;
}

/* ------------------------------------------------------------------------------------------------
 * Yürüme sondası: (dx,dz birim) yönünde 2 örnek (yakın/uzak) — engel/zıplama/kenar/su/lav.
 * Dönüş: 0 geçilmez, 1 açık, 2 zıplama gerekir.
 * o: {reach0, reach1, hc, canJump, maxDrop, avoidWater, ignoreLava}
 * ---------------------------------------------------------------------------------------------- */
export function probeMove(world, x, y, z, dx, dz, o) {
  const hc = o.hc;
  const fy = Math.floor(y + 0.05);
  const px = Math.floor(x);
  const pz = Math.floor(z);
  let needJump = false;
  for (let k = 0; k < 2; k++) {
    const d = k === 0 ? o.reach0 : o.reach1;
    const cx = Math.floor(x + dx * d);
    const cz = Math.floor(z + dz * d);
    let blocked = false;
    for (let j = 0; j < hc; j++) {
      if (cellSolid(world, cx, fy + j, cz)) {
        blocked = true;
        break;
      }
    }
    let baseY = fy;
    if (blocked) {
      if (!o.canJump) return 0;
      for (let j = 1; j <= hc; j++) if (cellSolid(world, cx, fy + j, cz)) return 0;
      if (cellSolid(world, px, fy + hc, pz)) return 0;
      baseY = fy + 1;
      needJump = true;
    }
    const bid = cellId(world, cx, baseY, cz);
    if (bid !== null && bid > 0 && LIQUID_LUT[bid] === 1) {
      if (liquidDamage(bid) > 0 && !o.ignoreLava) return 0;
      if (o.avoidWater) return 0;
    }
    let found = false;
    for (let s = 1; s <= o.maxDrop + 1; s++) {
      const id = cellId(world, cx, baseY - s, cz);
      if (id === null) return 0;
      if (SOLID_LUT[id] === 1) {
        found = true;
        break;
      }
      if (LIQUID_LUT[id] === 1) {
        if (liquidDamage(id) > 0 && !o.ignoreLava) return 0;
        if (o.avoidWater) return 0;
        found = true;
        break;
      }
    }
    if (!found) return 0;
  }
  return needJump ? 2 : 1;
}

export const STEER_ANGLES = [0, 0.61, -0.61, 1.22, -1.22, 1.92, -1.92];
const SA = STEER_ANGLES;
const SCOS = SA.map(Math.cos);
const SSIN = SA.map(Math.sin);

const PROBE = {
  reach0: 0.9, reach1: 1.9, hc: 2, canJump: true, maxDrop: 3, avoidWater: true, ignoreLava: false,
};

/** Probe seçeneklerini varlık/tür bilgisinden doldurur (paylaşılan nesne; hemen kullan). */
export function probeOptions(ent, def, extra) {
  const hw = ent.w * 0.5;
  PROBE.reach0 = hw + 0.55;
  PROBE.reach1 = hw + 1.45;
  PROBE.hc = Math.max(1, Math.ceil(ent.h - 0.05));
  PROBE.canJump = !(extra && extra.noJump);
  PROBE.maxDrop = extra && extra.maxDrop !== undefined ? extra.maxDrop : 3;
  PROBE.avoidWater = !(extra && extra.swims);
  PROBE.ignoreLava = lavaImmune(def);
  return PROBE;
}

/**
 * İstenen yöne (wx,wz birim) en yakın GEÇİLEBİLİR yönü seçer; ent.mv.dx/dz/jump'a yazar. Dönüş: seçilen indeks | -1.
 * Titreşimi önlemek için ent.ai.side (±1) tercih edilen yanı belirler.
 */
export function steerDirection(world, ent, def, wx, wz, extra) {
  const o = probeOptions(ent, def, extra);
  const mv = ent.mv;
  const side = ent.ai.side || 1;
  for (let i = 0; i < SA.length; i++) {
    let k = i;
    if (i > 0 && side < 0) k = (i & 1) ? i + 1 : i - 1; // yan sırasını çevir
    const c = SCOS[k];
    const s = SSIN[k];
    const dx = wx * c - wz * s;
    const dz = wx * s + wz * c;
    const r = probeMove(world, ent.x, ent.y, ent.z, dx, dz, o);
    if (r > 0) {
      mv.dx = dx;
      mv.dz = dz;
      mv.jump = r === 2;
      return k;
    }
  }
  mv.dx = 0;
  mv.dz = 0;
  mv.jump = false;
  return -1;
}

/** Uçan varlık için yön engeli: ileride (1.2 ve 2.6 blok) katı var mı? */
export function flyBlocked(world, x, y, z, dx, dy, dz, hw) {
  for (let k = 0; k < 2; k++) {
    const d = (k === 0 ? 1.2 : 2.6) + hw;
    if (cellSolid(world, Math.floor(x + dx * d), Math.floor(y + dy * d + 0.3), Math.floor(z + dz * d))) return true;
  }
  return false;
}

const FA = [0, 0.7, -0.7, 1.4, -1.4];
/**
 * Uçan yön seçimi: wx,wy,wz (birim) engelliyse yan açıları dener, hepsi engelliyse yükselir.
 * ent.mv.dx/dy/dz'ye yazar.
 */
export function steerFly(world, ent, wx, wy, wz) {
  const mv = ent.mv;
  const hw = ent.w * 0.5;
  const side = ent.ai.side || 1;
  for (let i = 0; i < FA.length; i++) {
    const a = FA[i] * side;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = wx * c - wz * s;
    const dz = wx * s + wz * c;
    if (!flyBlocked(world, ent.x, ent.y, ent.z, dx, wy, dz, hw)) {
      mv.dx = dx;
      mv.dy = wy;
      mv.dz = dz;
      return true;
    }
  }
  mv.dx = wx * 0.3;
  mv.dz = wz * 0.3;
  mv.dy = 1;
  return false;
}

/**
 * Çevrede en karanlık yön (yarıçap 3,5; 8 yön) → out {x,z} birim; hepsi aynıysa (ax,az) tercih yönü.
 * Dönüş: bulunan en düşük ışık.
 */
export function darkestDir(world, x, y, z, dayFactor, ax, az, out) {
  let best = 1e9;
  let bestLight = 99;
  let bx = ax;
  let bz = az;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const l = effectiveLight(world, x + dx * 3.5, y + 0.5, z + dz * 3.5, dayFactor);
    // eşitlikte tercih yönüne yakın olan kazanır
    const score = l * 10 - (dx * ax + dz * az);
    if (score < best) {
      best = score;
      bestLight = l;
      bx = dx;
      bz = dz;
    }
  }
  out.x = bx;
  out.z = bz;
  return bestLight;
}

/** Dünya yaw'ına göre ileri vektörü. */
export function forwardOf(yaw, out) {
  out.x = -Math.sin(yaw);
  out.z = -Math.cos(yaw);
  return out;
}
