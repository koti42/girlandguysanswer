/*
 * KEŞİF sim — yerdeki eşyalar (saf): düşme, birleşme (merge), mıknatıs + toplama, 5 dk sonra kaybolma.
 *
 * Eşya varlığı: {id, kind:'item', item, count, dur?, ench?, charge?, x,y,z, vx,vy,vz, w,h, age, life, delay, onGround, removed}
 * Toplama: ctx.pickup(itemKey, count, dur, ench, charge) → kalan adet (envanter dolu ise > 0). Yoksa tamamı alınır.
 * Olaylar: {type:'itemPickup', item, count, x,y,z}, {type:'fx', name:'itemPuff'|'itemBurn'}.
 */
import { moveBox } from './physics.js';
import { itemByKey, maxStack } from './items.js';
import { sanitizeEnch } from './magicEnchant.js';
import { sanitizeCharge } from './techCharge.js';
import { liquidDamage } from './mobAIUtil.js';
import { itemCeilY, itemKillY } from './constants.js';

export const ITEM_LIFE = 300;
export const ITEM_MAGNET = 3.2;
export const ITEM_PICKUP = 1.0;
const MAX_ITEMS = 256;
const MERGE_EVERY = 0.5;
const GRAVITY = 22;

const _box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
const _vel = { x: 0, y: 0, z: 0 };
const _res = {
  onGround: false, hitX: false, hitY: false, hitZ: false, hitCeiling: false, inLiquid: false, headInLiquid: false,
  liquidId: 0, climbable: false, damage: 0, impactVy: 0, stepped: false,
};
const _opts = { stepHeight: 0, stickToGround: false, collideLiquids: false, unloadedSolid: true, out: _res };

/** Yere eşya bırakır. opts: {vx,vy,vz, dur, life, delay}. Dönüş: eşya varlığı | null (bilinmeyen eşya). */
export function spawnItem(em, itemKey, count, x, y, z, opts) {
  const it = itemByKey(itemKey);
  const n = Math.floor(count);
  if (!it || !(n > 0)) return null;
  const o = opts || {};
  if (em.items.size >= MAX_ITEMS) {
    // en eskiyi at (ilk eklenen)
    const first = em.items.keys().next().value;
    em.items.delete(first);
  }
  const e = {
    id: o.id !== undefined ? o.id : em.nextId++,
    kind: 'item',
    item: it.key,
    count: n,
    x, y, z,
    vx: o.vx === undefined ? 0 : o.vx,
    vy: o.vy === undefined ? 3 : o.vy,
    vz: o.vz === undefined ? 0 : o.vz,
    w: 0.3,
    h: 0.3,
    age: o.age || 0,
    life: o.life === undefined ? ITEM_LIFE : o.life,
    delay: o.delay === undefined ? 0.5 : o.delay,
    onGround: false,
    removed: false,
  };
  if (o.dur !== undefined) e.dur = o.dur;
  const ench = o.ench ? sanitizeEnch(o.ench, it.key) : null; // büyülü eşya (yalnız dayanıklılığı olanlar; temizlenir)
  if (ench) e.ench = ench;
  if (o.charge !== undefined) {
    const ch = sanitizeCharge(o.charge, it.key); // teknoloji şarjı (yalnız şarj taşıyan eşyada)
    if (ch !== undefined) e.charge = ch;
  }
  em.items.set(e.id, e);
  return e;
}

/** Ganimet listesini bir noktadan saçarak düşürür (belirlenimci saçılma: em.rng). */
export function dropLoot(em, list, x, y, z) {
  for (let i = 0; i < list.length; i++) {
    const a = em.rng.next() * Math.PI * 2;
    const s = 1.2 + em.rng.next() * 1.6;
    spawnItem(em, list[i].item, list[i].count, x, y, z, {
      vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3.2 + em.rng.next() * 1.5, dur: list[i].dur, ench: list[i].ench, charge: list[i].charge,
    });
  }
}

function canMerge(a, b) {
  if (a.item !== b.item) return false;
  if (a.dur !== undefined || b.dur !== undefined) return false;
  return a.count + b.count <= maxStack(a.item);
}

/** Aynı hücredeki aynı eşyaları birleştirir (0,5 sn'de bir). */
function mergePass(em) {
  const seen = new Map();
  const dead = [];
  em.items.forEach((e) => {
    if (e.removed || e.age < 0.4) return;
    const key = e.item + '|' + Math.floor(e.x / 1.2) + '|' + Math.floor(e.y / 1.2) + '|' + Math.floor(e.z / 1.2);
    const o = seen.get(key);
    if (o && canMerge(o, e)) {
      o.count += e.count;
      if (e.age > o.age) o.age = e.age;
      e.removed = true;
      dead.push(e.id);
    } else if (!o) {
      seen.set(key, e);
    }
  });
  for (let i = 0; i < dead.length; i++) em.items.delete(dead[i]);
}

/** Eşyaları ilerletir + toplatır. */
export function updateItems(em, dt, player, ctx) {
  if (em.items.size === 0) return;
  em.itemMergeT -= dt;
  if (em.itemMergeT <= 0) {
    em.itemMergeT = MERGE_EVERY;
    mergePass(em);
  }
  const world = em.world;
  const alive = player && !player.dead;
  const pcx = alive ? player.x : 0;
  const pcy = alive ? player.y + player.h * 0.5 : 0;
  const pcz = alive ? player.z : 0;
  const gone = [];
  em.items.forEach((e) => {
    e.age += dt;
    if (e.delay > 0) e.delay -= dt;
    if (e.y > itemCeilY(world)) {
      e.y = itemCeilY(world);
      if (e.vy > 0) e.vy = 0;
    }
    if (e.age >= e.life || e.y < itemKillY(world)) {
      em.emit({ type: 'fx', name: 'itemPuff', x: e.x, y: e.y, z: e.z });
      gone.push(e.id);
      return;
    }
    // mıknatıs
    let pulled = false;
    if (alive && e.delay <= 0) {
      const dx = pcx - e.x;
      const dy = pcy - (e.y + 0.15);
      const dz = pcz - e.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < ITEM_PICKUP * ITEM_PICKUP) {
        const want = e.count;
        const left = ctx && ctx.pickup ? ctx.pickup(e.item, want, e.dur, e.ench, e.charge) : 0;
        const got = want - (left > 0 ? left : 0);
        if (got > 0) {
          em.emit({ type: 'itemPickup', item: e.item, count: got, x: e.x, y: e.y, z: e.z, id: e.id });
          e.count -= got;
          if (e.count <= 0) {
            gone.push(e.id);
            return;
          }
        }
        e.delay = 0.6; // envanter dolu: tekrar deneme aralığı
      } else if (d2 < ITEM_MAGNET * ITEM_MAGNET) {
        const d = Math.sqrt(d2);
        const sp = 7 + (ITEM_MAGNET - d) * 3;
        e.vx += (dx / d) * sp * dt * 6;
        e.vy += (dy / d) * sp * dt * 6;
        e.vz += (dz / d) * sp * dt * 6;
        const hv = Math.sqrt(e.vx * e.vx + e.vy * e.vy + e.vz * e.vz);
        if (hv > sp) {
          const k = sp / hv;
          e.vx *= k; e.vy *= k; e.vz *= k;
        }
        pulled = true;
      }
    }
    if (!pulled) e.vy -= GRAVITY * dt;
    _box.minX = e.x - 0.15; _box.maxX = e.x + 0.15;
    _box.minY = e.y; _box.maxY = e.y + 0.3;
    _box.minZ = e.z - 0.15; _box.maxZ = e.z + 0.15;
    _vel.x = e.vx; _vel.y = e.vy; _vel.z = e.vz;
    const r = moveBox(world, _box, _vel, dt, _opts);
    e.x = (_box.minX + _box.maxX) * 0.5;
    e.y = _box.minY;
    e.z = (_box.minZ + _box.maxZ) * 0.5;
    e.vx = _vel.x; e.vy = _vel.y; e.vz = _vel.z;
    e.onGround = r.onGround;
    if (r.onGround) {
      const f = Math.max(0, 1 - 9 * dt);
      e.vx *= f;
      e.vz *= f;
    }
    if (r.inLiquid) {
      if (liquidDamage(r.liquidId) > 0) {
        em.emit({ type: 'fx', name: 'itemBurn', x: e.x, y: e.y, z: e.z });
        gone.push(e.id);
        return;
      }
      e.vy = Math.max(e.vy, 0) + (e.vy < 1.2 ? 4 * dt : 0);
      e.vx *= 0.9;
      e.vz *= 0.9;
    }
  });
  for (let i = 0; i < gone.length; i++) em.items.delete(gone[i]);
}
