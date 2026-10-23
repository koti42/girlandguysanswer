/*
 * KEŞİF sim — TEKNOLOJİ: AÇIK DÜNYA portal kuralları (saf; DOM/three yok). Portal Silahı (item:portal_tabancası): oyuncu başına
 * iki portal (mavi / turuncu), katı sistem-dışı blok yüzlerine 1×2 hücre olarak açılır. Bulmaca odasındaki panel tabanlı
 * puzzles/portalodaLogic.js ile aynı renkler/kavramlar; çıkış, hız ve bakış dönüşü genel (duvar/zemin/tavan) çerçevelerle yapılır.
 *
 *   placeOpenPortal(portals, hit, color, opts) → {ok, reason, message, portals, portal, replaced}      (SAF: girdiyi değiştirmez)
 *   portalFrame(portal) → {center, n, u, r, width, height, yaw, cells, back}                            (çizim için çerçeve)
 *   portalCellAt(portals, x,y,z) → 'mavi' | 'turuncu' | null
 *   portalEntry(portal, body, vel) → bool            gövde portala GİRİYOR mu (konum + hız koşulu)
 *   travelThrough(portals, fromColor, state, getBlock) → {ok, reason?, x,y,z, vx,vy,vz, yaw, pitch, speed, to} | {ok:false}
 *   pruneBrokenPortals(portals, getBlock) → {portals, closed:[color…]}   (arka blok kırılınca kapanır)
 *   serializePortals(p) / restorePortals(raw)    (katı doğrulama, __proto__ güvenli)
 *   bodyFits(getBlock, x,y,z, w, h) → bool       safeExit(…) → {x,y,z} | null
 *
 * Kurallar:
 *  - Yüzey: tam küp, opak/saydam fark etmez ama kırılamaz/sistem(100–127)/sıvı/portal/hava OLMAZ. Göz–isabet arası görüş hattı (en çok 48 blok).
 *  - Duvar portalı: iki hücre dikey (isabet hücresi alt ya da üst olur). Zemin/tavan portalı: iki hücre, oyuncunun bakış ekseni boyunca.
 *    İki hücrenin de ön hücresi boş (katı değil, sıvı değil), arka hücresi destekleyici olmalı.
 *  - Aynı renk yenisi eskisini TAŞIR; farklı renk portallarla üst üste gelemez. Arka blok kırılırsa portal kapanır (kayıtta kalır).
 *  - Işınlanma: bekleme 1 sn (ping-pong yok); çıkışta güvenli yer araması (en çok 6 aday); sığmazsa ışınlanma reddedilir.
 *  - Hız: giriş çerçevesinde bileşenlerine ayrılır; yanal bileşen yansılanır (r→−r), normal bileşen çıkış normaline döner
 *    (en az MIN_EXIT); bakış vektörü aynı dönüşümle dönüştürülür (yaw 0 = −Z, + sola).
 */
import { BLOCKS } from './blocks.js';
import { hasLineOfSight } from './raycast.js';

export const PORTAL_RANGE = 48;
export const PORTAL_COOLDOWN = 1.0;
/** Art arda iki geçiş arası en kısa süre (sn): karşılıklı bakan portallarda saniyede onlarca geçiş/olay yağmasın. */
export const PORTAL_MIN_GAP = 0.25;
export const MIN_EXIT_SPEED = Object.freeze({ wall: 3.5, floor: 6, ceiling: 3 });
export const MAX_EXIT_SPEED = 60;
export const COLORS = Object.freeze(['mavi', 'turuncu']);
const BODY_W = 0.6;
const BODY_H = 1.8;
const AXES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

const PORTAL_BLOCK_IDS = [123, 124];
export function other(color) {
  return color === 'mavi' ? 'turuncu' : 'mavi';
}

/** Bu blok kimliği portal tutabilir mi (tam küp, kırılabilir, sistem/sıvı/portal değil)? */
export function portalSupport(id) {
  if (!(id > 0)) return false;
  const b = BLOCKS[id];
  if (!b || !b.cube || b.liquid || b.unbreakable) return false;
  if (b.category === 'sistem' || b.category === 'hava') return false;
  if (PORTAL_BLOCK_IDS.indexOf(id) >= 0) return false;
  return true;
}
function passable(id) {
  if (id === null || id === undefined) return false;
  if (id === 0) return true;
  const b = BLOCKS[id];
  return !!b && !b.solid && !b.liquid;
}

function frameOf(p) {
  const n = [p.nx, p.ny, p.nz];
  const u = [p.ux, p.uy, p.uz];
  // r = u × n
  // +0: −0 üretmesin (JSON/eşitlik)
  const r = [u[1] * n[2] - u[2] * n[1] + 0, u[2] * n[0] - u[0] * n[2] + 0, u[0] * n[1] - u[1] * n[0] + 0];
  return { n, u, r };
}

/** Portal kaydı (kimlik değil, saf geometri): hücreler ve arka hücreler türetilir. */
function makePortal(color, x, y, z, n, u) {
  const p = {
    color, x, y, z, nx: n[0], ny: n[1], nz: n[2], ux: u[0], uy: u[1], uz: u[2],
  };
  p.cells = [{ x, y, z }, { x: x + u[0], y: y + u[1], z: z + u[2] }];
  p.back = p.cells.map((c) => ({ x: c.x - n[0], y: c.y - n[1], z: c.z - n[2] }));
  return p;
}

/** Çizim çerçevesi: merkez arka yüzeyin (duvar) üstünde, 1×2. yaw: portalın baktığı yöne bakan yaw. */
export function portalFrame(p) {
  const { n, u, r } = frameOf(p);
  const cx = p.x + 0.5 + u[0] * 0.5 - n[0] * 0.49;
  const cy = p.y + 0.5 + u[1] * 0.5 - n[1] * 0.49;
  const cz = p.z + 0.5 + u[2] * 0.5 - n[2] * 0.49;
  return {
    center: [cx, cy, cz], n, u, r, width: 1, height: 2, yaw: Math.atan2(-n[0], -n[2]), cells: p.cells, back: p.back,
  };
}

function cellsOverlap(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (a[i].x === b[j].x && a[i].y === b[j].y && a[i].z === b[j].z) return true;
    }
  }
  return false;
}

function fail(portals, reason, message) {
  return {
    ok: false, reason, message, portals, portal: null, replaced: null,
  };
}

function axisUnit(v) {
  const a = [Math.abs(v.nx || 0), Math.abs(v.ny || 0), Math.abs(v.nz || 0)];
  const sum = a[0] + a[1] + a[2];
  if (sum !== 1) return null;
  return [v.nx || 0, v.ny || 0, v.nz || 0];
}

/** Bakış yaw'ından yatay eksenler: [önde, önde-ters, yan, yan-ters] sırası. */
function yawAxes(yaw) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const f = Math.abs(fx) >= Math.abs(fz) ? [Math.sign(fx) || 1, 0, 0] : [0, 0, Math.sign(fz) || -1];
  const side = f[0] !== 0 ? [0, 0, 1] : [1, 0, 0];
  return [f, [-f[0], 0, -f[2]], side, [-side[0], 0, -side[2]]];
}

/**
 * Portal yerleştirir (saf). hit: {x,y,z (vurulan blok), face:{nx,ny,nz}} ya da {x,y,z,nx,ny,nz} (raycastBlocks sonucu).
 * opts: {getBlock(x,y,z)→id|null, world? (yMin/yMax'lı dünya; LOS için), eye:{x,y,z}, yaw, range=48, los=true}.
 * Başarıda yeni `portals` ({mavi, turuncu}) döner; reddedilirse girdi AYNEN döner.
 */
export function placeOpenPortal(portals, hit, color, opts) {
  const o = opts || {};
  if (color !== 'mavi' && color !== 'turuncu') return fail(portals, 'renk', 'Portal rengi geçersiz.');
  if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.y) || !Number.isFinite(hit.z)) {
    return fail(portals, 'yuzey', 'Portal için bir yüzey vurmalısın.');
  }
  const face = hit.face || hit;
  const n = axisUnit(face);
  if (!n) return fail(portals, 'yuzey', 'Portal için düz bir blok yüzü vurmalısın.');
  const getBlock = o.getBlock;
  if (typeof getBlock !== 'function') return fail(portals, 'yuzey', 'Dünya erişimi yok.');
  const hx = Math.floor(hit.x);
  const hy = Math.floor(hit.y);
  const hz = Math.floor(hit.z);
  const range = o.range > 0 ? o.range : PORTAL_RANGE;
  const eye = o.eye;
  if (eye && Number.isFinite(eye.x)) {
    const dx = hx + 0.5 - eye.x;
    const dy = hy + 0.5 - eye.y;
    const dz = hz + 0.5 - eye.z;
    if (dx * dx + dy * dy + dz * dz > range * range) return fail(portals, 'uzak', 'Hedef çok uzakta (en çok ' + range + ' blok).');
    if (o.los !== false) {
      const px = hx + 0.5 + n[0] * 0.52;
      const py = hy + 0.5 + n[1] * 0.52;
      const pz = hz + 0.5 + n[2] * 0.52;
      // world verilirse (yMin/yMax ile) derin dünyada da doğru aralık kullanılır
      if (!hasLineOfSight(o.world && typeof o.world.getBlock === 'function' ? o.world : { getBlock }, eye.x, eye.y, eye.z, px, py, pz)) {
        return fail(portals, 'gorus', 'Hedefi göremiyorsun: araya bir şey giriyor.');
      }
    }
  }
  if (!portalSupport(getBlock(hx, hy, hz))) return fail(portals, 'yuzey', 'Bu yüzey portal tutmaz.');

  const candidates = [];
  const fx = hx + n[0];
  const fy = hy + n[1];
  const fz = hz + n[2];
  if (n[1] === 0) {
    const up = [0, 1, 0];
    candidates.push([fx, fy, fz, up], [fx, fy - 1, fz, up]);
  } else {
    const axes = yawAxes(o.yaw || 0);
    for (let i = 0; i < axes.length; i++) candidates.push([fx, fy, fz, axes[i]]);
  }
  let portal = null;
  for (let i = 0; i < candidates.length && !portal; i++) {
    const c = candidates[i];
    const p = makePortal(color, c[0], c[1], c[2], n, c[3]);
    let ok = true;
    for (let k = 0; k < 2 && ok; k++) {
      if (!passable(getBlock(p.cells[k].x, p.cells[k].y, p.cells[k].z))) ok = false;
      else if (!portalSupport(getBlock(p.back[k].x, p.back[k].y, p.back[k].z))) ok = false;
    }
    if (ok) portal = p;
  }
  if (!portal) return fail(portals, 'yer', 'Portal için yeterli düz yer yok.');
  const old = portals[color];
  if (old && old.x === portal.x && old.y === portal.y && old.z === portal.z && old.nx === portal.nx && old.ny === portal.ny
    && old.nz === portal.nz && old.ux === portal.ux && old.uy === portal.uy && old.uz === portal.uz) {
    return fail(portals, 'ayni', 'Portal zaten burada.');
  }
  const mate = portals[other(color)];
  if (mate && cellsOverlap(mate.cells, portal.cells)) return fail(portals, 'ustuste', 'Portallar üst üste gelemez.');
  const next = { mavi: portals.mavi, turuncu: portals.turuncu };
  next[color] = portal;
  return {
    ok: true,
    reason: '',
    message: (color === 'mavi' ? 'Mavi' : 'Turuncu') + ' portal açıldı.',
    portals: next,
    portal,
    replaced: old || null,
  };
}

/** Hücre bir portalın içinde mi? */
export function portalCellAt(portals, x, y, z) {
  for (let i = 0; i < 2; i++) {
    const p = portals[COLORS[i]];
    if (!p) continue;
    for (let k = 0; k < 2; k++) if (p.cells[k].x === x && p.cells[k].y === y && p.cells[k].z === z) return COLORS[i];
  }
  return null;
}

function kindOf(p) {
  return p.ny === 1 ? 'floor' : p.ny === -1 ? 'ceiling' : 'wall';
}

/** Giriş noktası q için portal düzlemindeki koordinatlar: dn (arka yüzeyden derinlik), du, dr. */
function planeCoords(p, qx, qy, qz) {
  const { n, u, r } = frameOf(p);
  const rx = qx - (p.x + 0.5);
  const ry = qy - (p.y + 0.5);
  const rz = qz - (p.z + 0.5);
  return {
    dn: rx * n[0] + ry * n[1] + rz * n[2] + 0.5,
    du: rx * u[0] + ry * u[1] + rz * u[2],
    dr: rx * r[0] + ry * r[1] + rz * r[2],
  };
}
function entryPoint(p, b) {
  const k = kindOf(p);
  const h = b.h > 0 ? b.h : BODY_H;
  if (k === 'wall') return [b.x, b.y + h * 0.5, b.z];
  if (k === 'floor') return [b.x, b.y, b.z];
  return [b.x, b.y + h, b.z];
}

/**
 * Gövde (ayak merkezi x,y,z; h yükseklik) portala giriyor mu? vel: {x,y,z}. Konum portal dikdörtgeninde (hafif toleranslı) ve
 * hız yönü yüzeye doğru (duvar/tavan: normale ters; zemin: aşağı ya da duruyor).
 */
export function portalEntry(p, b, vel) {
  const q = entryPoint(p, b);
  const c = planeCoords(p, q[0], q[1], q[2]);
  const k = kindOf(p);
  const dnMin = k === 'wall' ? -0.25 : -0.15;
  const dnMax = k === 'wall' ? 0.7 : 0.45;
  if (c.dn < dnMin || c.dn > dnMax) return false;
  if (c.du < -0.5 - 0.3 || c.du > 1.5 + 0.3 || Math.abs(c.dr) > 0.5 + 0.2) return false;
  const { n } = frameOf(p);
  const vn = (vel.x || 0) * n[0] + (vel.y || 0) * n[1] + (vel.z || 0) * n[2];
  return k === 'floor' ? vn <= 0.05 : vn < -0.05;
}

/** AABB (ayak merkezi) boş mu? (tüm kesişen hücreler katı değil, null değil) */
export function bodyFits(getBlock, x, y, z, w = BODY_W, h = BODY_H) {
  const hw = w * 0.5;
  const x0 = Math.floor(x - hw + 1e-6);
  const x1 = Math.floor(x + hw - 1e-6);
  const y0 = Math.floor(y + 1e-6);
  const y1 = Math.floor(y + h - 1e-6);
  const z0 = Math.floor(z - hw + 1e-6);
  const z1 = Math.floor(z + hw - 1e-6);
  for (let yy = y0; yy <= y1; yy++) {
    for (let zz = z0; zz <= z1; zz++) {
      for (let xx = x0; xx <= x1; xx++) {
        const id = getBlock(xx, yy, zz);
        if (id === null || id === undefined) return false;
        if (id !== 0 && BLOCKS[id] && BLOCKS[id].solid) {
          const boxes = BLOCKS[id].collision;
          for (let i = 0; i < boxes.length; i++) {
            const bx = boxes[i];
            if (x + hw > xx + bx[0] + 1e-6 && x - hw < xx + bx[3] - 1e-6
              && y + h > yy + bx[1] + 1e-6 && y < yy + bx[4] - 1e-6
              && z + hw > zz + bx[2] + 1e-6 && z - hw < zz + bx[5] - 1e-6) return false;
          }
        }
      }
    }
  }
  return true;
}

/** Güvenli çıkış araması: önce ideal konum, sonra çıkış normali boyunca ve dikey kaydırmalar (en çok 6 aday). */
export function safeExit(getBlock, x, y, z, n, w, h) {
  const cand = [
    [0, 0, 0], [n[0] * 0.3, n[1] * 0.3, n[2] * 0.3], [n[0] * 0.65, n[1] * 0.65, n[2] * 0.65],
    [n[0] * 1.0, n[1] * 1.0, n[2] * 1.0], [0, 1, 0], [0, -1, 0],
  ];
  for (let i = 0; i < cand.length; i++) {
    const cx = x + cand[i][0];
    const cy = y + cand[i][1];
    const cz = z + cand[i][2];
    if (bodyFits(getBlock, cx, cy, cz, w, h)) return { x: cx, y: cy, z: cz };
  }
  return null;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function look(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/**
 * Giriş portalından ('mavi'/'turuncu') diğerine: konum, hız ve bakış dönüşümü.
 * state: {x,y,z (ayak), vx,vy,vz, yaw, pitch, w?, h?}. Döner {ok, x,y,z, vx,vy,vz, yaw, pitch, speed, to} ya da {ok:false, reason}:
 *   'es_yok' (diğer portal açık değil) · 'engelli' (güvenli çıkış yok)
 */
export function travelThrough(portals, fromColor, state, getBlock) {
  const from = portals[fromColor];
  const to = portals[other(fromColor)];
  if (!from || !to) return { ok: false, reason: 'es_yok' };
  const fi = frameOf(from);
  const fo = frameOf(to);
  const h = state.h > 0 ? state.h : BODY_H;
  const w = state.w > 0 ? state.w : BODY_W;
  const kOut = kindOf(to);
  const q = entryPoint(from, { x: state.x, y: state.y, z: state.z, h });
  const c = planeCoords(from, q[0], q[1], q[2]);
  const a = Math.max(-0.2, Math.min(0.2, -c.dr)); // r yansıtılır
  const b = Math.max(-0.45, Math.min(0.45, c.du - 0.5));
  // çıkış konumu (ayak merkezi): duvarda hücre merkezi + yansıtılmış yanal kayma; zeminde/tavanda dikdörtgen merkezi + kayma
  let x;
  let y;
  let z;
  if (kOut === 'wall') {
    x = to.x + 0.5 + fo.r[0] * a;
    z = to.z + 0.5 + fo.r[2] * a;
    y = to.y + 0.02 + (kindOf(from) === 'wall' ? Math.max(0, Math.min(0.2, state.y - from.y)) : 0);
  } else {
    x = to.x + 0.5 + fo.u[0] * 0.5 + fo.r[0] * a + fo.u[0] * b;
    z = to.z + 0.5 + fo.u[2] * 0.5 + fo.r[2] * a + fo.u[2] * b;
    y = kOut === 'floor' ? to.y + 0.02 : to.y + 1 - h;
  }
  const spot = safeExit(getBlock, x, y, z, fo.n, w, h);
  if (!spot) return { ok: false, reason: 'engelli' };

  const v = [state.vx || 0, state.vy || 0, state.vz || 0];
  const vn = dot(v, fi.n);
  const vr = dot(v, fi.r);
  const vu = dot(v, fi.u);
  const minExit = MIN_EXIT_SPEED[kOut];
  const outN = Math.min(MAX_EXIT_SPEED, Math.max(-vn, minExit));
  const ov = [
    -vr * fo.r[0] + vu * fo.u[0] + outN * fo.n[0],
    -vr * fo.r[1] + vu * fo.u[1] + outN * fo.n[1],
    -vr * fo.r[2] + vu * fo.u[2] + outN * fo.n[2],
  ];
  let sp = Math.hypot(ov[0], ov[1], ov[2]);
  if (sp > MAX_EXIT_SPEED) {
    const k = MAX_EXIT_SPEED / sp;
    ov[0] *= k;
    ov[1] *= k;
    ov[2] *= k;
    sp = MAX_EXIT_SPEED;
  }
  const L = look(state.yaw || 0, state.pitch || 0);
  const Ln = dot(L, fi.n);
  const Lr = dot(L, fi.r);
  const Lu = dot(L, fi.u);
  const lo = [
    -Lr * fo.r[0] + Lu * fo.u[0] - Ln * fo.n[0],
    -Lr * fo.r[1] + Lu * fo.u[1] - Ln * fo.n[1],
    -Lr * fo.r[2] + Lu * fo.u[2] - Ln * fo.n[2],
  ];
  const ll = Math.hypot(lo[0], lo[1], lo[2]) || 1;
  const yaw = Math.hypot(lo[0], lo[2]) < 1e-4 ? (state.yaw || 0) : Math.atan2(-lo[0], -lo[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, lo[1] / ll)));
  return {
    ok: true, x: spot.x, y: spot.y, z: spot.z, vx: ov[0], vy: ov[1], vz: ov[2], yaw, pitch, speed: sp, to: other(fromColor),
  };
}

/** Arka bloğu artık destekleyici olmayan ya da ön hücresi katı bir blokla dolan portalları kapatır (üretilmemiş chunk'ta bekler). */
export function pruneBrokenPortals(portals, getBlock) {
  const next = { mavi: portals.mavi, turuncu: portals.turuncu };
  const closed = [];
  for (let i = 0; i < 2; i++) {
    const p = portals[COLORS[i]];
    if (!p) continue;
    for (let k = 0; k < 2; k++) {
      const id = getBlock(p.back[k].x, p.back[k].y, p.back[k].z);
      if (id === null || id === undefined) continue;
      if (!portalSupport(id)) {
        next[COLORS[i]] = null;
        closed.push(COLORS[i]);
        break;
      }
    }
    if (next[COLORS[i]] === null) continue;
    for (let k = 0; k < 2; k++) {
      // oyuncu portalın içine blok koydu: kapı kapanır (görünmez, geçilemez bir portal kalmasın)
      const id = getBlock(p.cells[k].x, p.cells[k].y, p.cells[k].z);
      if (id === null || id === undefined) continue;
      if (!passable(id)) {
        next[COLORS[i]] = null;
        closed.push(COLORS[i]);
        break;
      }
    }
  }
  return { portals: next, closed };
}

/* ------------------------------------------------------------------------------------------------
 * Kayıt
 * ---------------------------------------------------------------------------------------------- */
function intIn(v, lim) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && Math.abs(n) <= lim ? n : null;
}
export function serializePortals(portals) {
  const out = {};
  for (let i = 0; i < 2; i++) {
    const p = portals[COLORS[i]];
    if (p) {
      out[COLORS[i]] = [p.x, p.y, p.z, p.nx, p.ny, p.nz, p.ux, p.uy, p.uz];
    }
  }
  return out;
}
/** Katı doğrulama: eksen birimleri, u ⟂ n, sınırlı koordinat; bozuk kayıt atılır. */
export function restorePortals(raw) {
  const out = { mavi: null, turuncu: null };
  if (!raw || typeof raw !== 'object') return out;
  for (let i = 0; i < 2; i++) {
    const col = COLORS[i];
    if (!Object.prototype.hasOwnProperty.call(raw, col)) continue;
    const a = raw[col];
    if (!Array.isArray(a) || a.length !== 9) continue;
    const v = a.map((x) => intIn(x, 1e7));
    if (v.some((x) => x === null)) continue;
    const n = [v[3], v[4], v[5]];
    const u = [v[6], v[7], v[8]];
    const ok = (t) => Math.abs(t[0]) + Math.abs(t[1]) + Math.abs(t[2]) === 1;
    if (!ok(n) || !ok(u) || dot(n, u) !== 0) continue;
    out[col] = makePortal(col, v[0], v[1], v[2], n, u);
  }
  if (out.mavi && out.turuncu && cellsOverlap(out.mavi.cells, out.turuncu.cells)) out.turuncu = null;
  return out;
}
