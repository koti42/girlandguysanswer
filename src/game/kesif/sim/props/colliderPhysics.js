/*
 * KEŞİF sim/props — fizik ↔ ColliderIndex köprüsü (physics.moveBox kancasının gövdesi). Sözleşme KESIF_CITY_CONTRACT §6.
 *
 * physics.js yalnızca şu çağrıları yapar (world.colliders null/undefined iken HİÇBİRİ çalışmaz → sonuçlar bayt-bayt aynı):
 *   collBegin(cc, a, dx, dy, dz, stepH, sneakDrop, dt)   moveBox başı: tüm hareketin süpürme hacmini TEK sorguyla aday listesine alır
 *   collClip(a, axis, d)  → d'                       voxel kırpmasından sonra adaylara karşı aynı kırpma (kesin, EPS=1e-7)
 *   collOverlap(world, n0..n5) → bool                overlapsSolid: kutu bir collider ile kesişiyor mu (moveBox dışında doğrudan sorgular)
 *   collPredict(a, dt, grounded) → bool              dinamik kutuları adım sonuna öteler; altındaki platformun ötelemesi CS.vx/vy/vz (taşıma)
 *   collEnd()                                        moveBox sonu: aday durumunu kapatır
 *
 * Durum modül düzeyindedir (tahsissiz); moveBox yeniden girişli değildir. `CS.n` aday sayısıdır (0 iken kırpma atlanır).
 */

export const COLLIDER_MAX = 64;
const EPS = 1e-7;
const AJ = [1, 0, 0];
const AK = [2, 2, 1];
/** Hareketten bağımsız dikey pay: basamak çıkışı + yapışma + çömelme düşüşü (physics: stepHeight, 0.6 sneakDrop). */
const Y_PAD = 0.7;
const SUPPORT_TOL = 0.05;

export const CS = {
  on: false,
  n: 0,
  cc: null,
  buf: new Float64Array(COLLIDER_MAX * 6),
  vx: 0,
  vy: 0,
  vz: 0,
};
const _own = new Float64Array(COLLIDER_MAX * 6);

export function collBegin(cc, a, dx, dy, dz, stepH, sneakDrop, dt) {
  // dinamik kutular adım sonu konumuna öteleneceğinden sorgu hacmi onların adım yolu kadar genişler
  const dyn = cc.dynCount > 0 ? cc.maxVel * dt : 0;
  const ex = (dx < 0 ? -dx : dx) + 0.05 + dyn;
  const ez = (dz < 0 ? -dz : dz) + 0.05 + dyn;
  let pad = stepH > Y_PAD ? stepH : Y_PAD;
  if (sneakDrop > pad) pad = sneakDrop;
  const ey = (dy < 0 ? -dy : dy) + pad + 0.05 + dyn;
  CS.cc = cc;
  CS.on = true;
  CS.n = cc.queryRaw(a[0] - ex, a[1] - ey, a[2] - ez, a[3] + ex, a[4] + ey, a[5] + ez, CS.buf, COLLIDER_MAX);
}

export function collEnd() {
  CS.on = false;
  CS.n = 0;
  CS.cc = null;
}

/** a kutusu `axis` ekseninde d kadar ilerlerse izin verilen mesafe (voxel clipAxis ile aynı mantık, dünya uzayı kutulara). */
export function collClip(a, axis, d) {
  const j = AJ[axis];
  const k = AK[axis];
  const lo = a[axis];
  const hi = a[axis + 3];
  const aj0 = a[j];
  const aj1 = a[j + 3];
  const ak0 = a[k];
  const ak1 = a[k + 3];
  const buf = CS.buf;
  for (let i = 0, n = CS.n; i < n; i++) {
    const o = i * 6;
    if (!(aj0 < buf[o + j + 3] - EPS && aj1 > buf[o + j] + EPS)) continue;
    if (!(ak0 < buf[o + k + 3] - EPS && ak1 > buf[o + k] + EPS)) continue;
    if (d > 0) {
      const bmin = buf[o + axis];
      if (bmin >= hi - EPS) {
        let g = bmin - hi;
        if (g < 0) g = 0;
        if (g < d) d = g;
      }
    } else {
      const bmax = buf[o + axis + 3];
      if (bmax <= lo + EPS) {
        let g = bmax - lo;
        if (g > 0) g = 0;
        if (g > d) d = g;
      }
    }
  }
  return d;
}

/** Kutu (n0..n5, zaten ötelenmiş) bir collider ile iç içe mi? moveBox içindeyken aday listesi, dışındayken doğrudan sorgu. */
export function collOverlap(world, n0, n1, n2, n3, n4, n5) {
  let buf = CS.buf;
  let n = CS.n;
  if (!CS.on) {
    const cc = world.colliders;
    if (!cc) return false;
    buf = _own;
    n = cc.queryRaw(n0, n1, n2, n3, n4, n5, buf, COLLIDER_MAX);
  }
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    if (n0 < buf[o + 3] - EPS && n3 > buf[o] + EPS
      && n1 < buf[o + 4] - EPS && n4 > buf[o + 1] + EPS
      && n2 < buf[o + 5] - EPS && n5 > buf[o + 2] + EPS) return true;
  }
  return false;
}

/**
 * Dinamik kutular "adım sonu" konumuna öteletilir (aday tamponunda; dizin değişmez): platform sistemi oyuncu fiziğinden SONRA
 * (setDynamic ile) güncellediği için sürücü ve çarpışmalar aynı son konumu görür → kabinin içine batma/geç kalma yok.
 * grounded ise ayağın altındaki (üst yüzey ≈ a.minY, yatayda kesişen) dinamik kutunun ötelemesi CS.vx/vy/vz'ye yazılır ve true döner;
 * çağıran önce Y, sonra X/Z taşır.
 */
export function collPredict(a, dt, grounded) {
  const cc = CS.cc;
  if (cc === null || cc.dynCount === 0) return false;
  const buf = CS.buf;
  const kind = cc.kind;
  const slots = cc.slots;
  const vel = cc.vel;
  const feet = a[1];
  let found = false;
  CS.vx = 0;
  CS.vy = 0;
  CS.vz = 0;
  for (let i = 0, n = CS.n; i < n; i++) {
    const s = slots[i];
    if (kind[s] !== 2) continue;
    const v = s * 3;
    const mx = vel[v] * dt;
    const my = vel[v + 1] * dt;
    const mz = vel[v + 2] * dt;
    if (mx === 0 && my === 0 && mz === 0) continue;
    const o = i * 6;
    if (grounded && !found) {
      const top = buf[o + 4];
      if (top >= feet - SUPPORT_TOL && top <= feet + SUPPORT_TOL
        && a[0] < buf[o + 3] - EPS && a[3] > buf[o] + EPS && a[2] < buf[o + 5] - EPS && a[5] > buf[o + 2] + EPS) {
        found = true;
        CS.vx = mx;
        CS.vy = my;
        CS.vz = mz;
      }
    }
    buf[o] += mx; buf[o + 3] += mx;
    buf[o + 1] += my; buf[o + 4] += my;
    buf[o + 2] += mz; buf[o + 5] += mz;
  }
  return found;
}
