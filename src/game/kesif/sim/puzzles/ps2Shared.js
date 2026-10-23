/*
 * KEŞİF bulmaca grubu 2 (hareketliplatform, golgekopru, portaloda, terazi, suakisi) — ortak yardımcılar (saf).
 *
 *   clamp, smoothstep, cloneJson, cellKey          küçük matematik/yardımcı işlevler
 *   roomYaw(facing), yawOfDir(dx,dz)              yaw: 0 = −Z'ye bakar, + sola (sözleşme; bkz. fizik girdisi)
 *   sfx(name,x,y,z,pitch?)                        ses efekti (pitch isteğe bağlı: oyun/ses katmanı çarpan olarak uygular)
 *   noWriteCtx(ctx), chamberOf(ctx,opts)          yazım YAPMAYAN buildChamber (restore'da kapı/boyut öğrenmek için)
 *   teleportFx(ctx, lx,ly,lz, reason)             {kind:'teleport'} efekti (oyuncuyu oda içindeki yerel hücreye taşı)
 *   carvePit(F, o)                                oda genişliğinde çukur oyar (+kurtarma plakaları +çıkış rampası)
 *   pitBackground(o, lx,ly,lz)                    çukur bölgesinde bir hücrenin "arka plan" bloğu (dinamik parçalar silinince)
 *
 * Oyunun desteklemesi gereken ek efektler (kit'in bilinmeyen efekt kuralıyla onEffect'e iletilir; hepsi isteğe bağlı güçlendirmedir,
 * desteklenmezse oda yine takılmadan oynanır — çukurlarda çıkış rampası, portal odasında oto-sıfırlama vb. vardır):
 *   {kind:'teleport', x,y,z, yaw, reason, [entityId, yawDelta, vx, vz, keepMomentum]}   gövdeyi (x,y,z) AYAK konumuna taşı, yaw'ı ayarla,
 *       hızı sıfırla (keepMomentum:true ise hız (vx,vz) ile korunur; dikey hız kalır). reason: 'dusme' | 'portal'.
 *   {kind:'carry', id, dx,dy,dz, box:{x0,y0,z0,x1,y1,z1}}   hareketli platform bir hücre kaydı: ayakları box (eski hücre AABB'si, uçlar dahil)
 *       üst yüzeyinde (y1+1) duran gövdeyi (dx,dy,dz) kadar taşı. Ayrıca state.movers[] her tick güncellenir (hareketliplatform.js başlığı).
 *   {kind:'takeItem', item, count, reason}   (terazi) kırılan gösterim bloğunun düşen kopyasını envanterden düş.
 *   sound efektlerindeki `pitch` (çarpan, 1 = normal) alanı isteğe bağlıdır; yoksa yok sayılır.
 */
import { B } from '../blocks.js';
import { localDir, normFacing } from './kitGeometry.js';
import { buildChamber } from './kitChamber.js';

const noop = () => {};

export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/** 0..1 → 0..1 yumuşak geçiş. */
export function smoothstep(u) {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
}

export function cloneJson(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

export function cellKey(x, y, z) {
  return x + ',' + y + ',' + z;
}

/** Bakış yönü (dx,dz) → yaw (0 = −Z, + sola). */
export function yawOfDir(dx, dz) {
  return Math.atan2(-dx, -dz);
}

/** Odaya girerken bakılan yön (yerel +lz) için yaw. */
export function roomYaw(facing) {
  const d = localDir(normFacing(facing), 0, 1);
  return yawOfDir(d.dx, d.dz);
}

/** Ses efekti; pitch verilirse (≠1) eklenir. */
export function sfx(name, x, y, z, pitch) {
  const e = {
    kind: 'sound', name, x, y, z,
  };
  if (pitch !== undefined && pitch !== 1) e.pitch = Math.round(pitch * 1000) / 1000;
  return e;
}

/** Aynı ctx, ama yazım yok ve clip yok: yalnızca geometri bilgisi almak için. */
export function noWriteCtx(ctx) {
  return Object.assign({}, ctx, { setBlock: noop, clip: null });
}

/** buildChamber'ın yazımsız çalıştırılması → {inner, innerWorld, doorFront, doorBack, theme, floorY, ...}. */
export function chamberOf(ctx, opts) {
  return buildChamber(noWriteCtx(ctx), opts);
}

/** Yerel hücreye ışınlama efekti (ayak konumu hücre merkezi). `ctx.origin/facing` kullanılır. */
export function teleportFx(F, lx, ly, lz, reason) {
  const w = F.toWorld(lx, ly, lz);
  return {
    kind: 'teleport',
    x: w.x + 0.5,
    y: w.y,
    z: w.z + 0.5,
    yaw: roomYaw(F.facing),
    reason: reason || 'kurtarma',
  };
}

/*
 * Çukur: oda genişliğinde (lx x0..x1) ve lz0..lz1 satırlarında.
 *   o = { x0,x1, lz0,lz1, stand (çukur zemininde ayakta durulan seviye), floorId, plateOk?:(lx,lz)=>bool,
 *         ramp?:boolean (lz0 satırının iki yan sütununda 1 basamaklık çıkış rampası) }
 * Zemin bloğu ly=stand−1'de, kurtarma plakaları ly=stand'de (plateOk true ise). Üstü hava (zaten oyulmuş oda içi).
 */
export function carvePit(F, o) {
  const lo = Math.min(-2, o.stand - 1);
  F.fill(o.x0, lo, o.lz0, o.x1, o.stand - 1, o.lz1, o.floorId);
  if (o.stand <= -1) F.carve(o.x0, o.stand, o.lz0, o.x1, -1, o.lz1);
  for (let lz = o.lz0; lz <= o.lz1; lz++) {
    for (let lx = o.x0; lx <= o.x1; lx++) {
      if (pitBackground(o, lx, o.stand, lz) === B.PRESSURE_PLATE) F.set(lx, o.stand, lz, B.PRESSURE_PLATE);
    }
  }
  if (o.ramp) {
    F.set(o.x0, o.stand, o.lz0, o.floorId);
    F.set(o.x1, o.stand, o.lz0, o.floorId);
  }
}

/**
 * Çukur bölgesindeki bir hücrenin başlangıç (statik) bloğu: zemin / kurtarma plakası / rampa basamağı / hava.
 * Bölge dışında null döner. Hareketli parçalar silinirken "arka plan" olarak bunu yaz.
 */
export function pitBackground(o, lx, ly, lz) {
  if (lx < o.x0 || lx > o.x1 || lz < o.lz0 || lz > o.lz1) return null;
  if (ly < o.stand) return o.floorId;
  if (ly === o.stand) {
    if (o.ramp && lz === o.lz0 && (lx === o.x0 || lx === o.x1)) return o.floorId;
    return !o.plateOk || o.plateOk(lx, lz) ? B.PRESSURE_PLATE : 0;
  }
  return 0;
}
