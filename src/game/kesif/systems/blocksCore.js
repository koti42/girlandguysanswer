/*
 * KEŞİF blok sistemi — ortak durum ve yardımcılar (saf mantık + G alanları; three/DOM yok).
 *
 *   createState(G) → S           sistemin tek durum nesnesi (kırma, yerleştirme, yeme, düşen bloklar, sandık, ipucu)
 *   reachFor(G)                  erişim: macera 5, inşa 8
 *   canAct(G)                    oyuncu şu an blok eylemi yapabilir mi (UI kapalı, canlı, duraklatılmamış, dünya hazır)
 *   blockAt(G,x,y,z)             world.getBlock (üretilmemiş chunk için null)
 *   overlapsPlayer(G,x,y,z,id)   blok çarpışma kutuları oyuncu gövdesiyle kesişir mi
 *   overlapsMobs(G,x,y,z,id)     … yakındaki yaratıklarla kesişir mi
 *   setHint(G,S,text,secs)       HUD ipucu (kendi yazdığını süresi dolunca siler)
 *   soundFor(kind, id)           'dig:taş' vb. (blok malzemesinden)
 *   rngNext(G)                   belirlenimci rastgele (em.rng); yoksa sabit bir akış
 *
 * Konvansiyon: blok kimliği 0 = hava; world.getBlock null = üretilmedi (desteklenmiş say, dokunma).
 */
import { BLOCKS } from '../sim/blocks.js';
import { createRayHit } from '../sim/raycast.js';
import { PLAYER } from '../sim/physics.js';

export const REACH_MACERA = 5;
export const REACH_INSA = 8;
/** Basılı tutarken tekrar aralığı (sn): yaratıcı kırma, anında kırılanlar, yerleştirme. */
export const HOLD_REPEAT = 0.22;
export const PLACE_REPEAT = 0.25;
/** Hedef kısa süre kaybolur/değişirse ilerleme korunur (dokunmatik titremesi). */
export const BREAK_GRACE = 0.12;

/** Harita modu / oturum sistemi G.readOnly: blok kırma, koyma ve üretim yok. */
export function isReadOnly(G) {
  return G.readOnly === true || G.mode === 'harita';
}

export function reachFor(G) {
  return G.mode === 'insa' ? REACH_INSA : REACH_MACERA;
}

export function createState() {
  return {
    // hedef (sabit adımda yetkili; kare güncellemesi yalnız görsel için ayrı bir ışın kullanır)
    target: createRayHit(),
    has: false,
    frameHit: createRayHit(),
    frameHas: false,
    hl: {
      x: 0, y: 0, z: 0, blockId: -1, nx: 0, ny: 1, nz: 0,
    },
    pos: { x: 0, y: 0, z: 0 },
    pos2: { x: 0, y: 0, z: 0 },
    normal: [0, 1, 0],
    // kırma
    brk: {
      x: 0, y: 0, z: 0, id: 0, active: false, progress: 0, total: 0, idle: 0, switchT: 0, cool: 0, digT: 0, dustT: 0, unbreakableT: 0, swing: 0,
    },
    // yerleştirme
    plc: {
      cool: 0, holdBlocked: false, ghostId: -1, ghostX: 0, ghostY: 0, ghostZ: 0, ghostOk: true, failT: 0,
    },
    // yeme
    eat: {
      active: false, t: 0, dur: 1.5, slot: 0, item: null, hp0: 0, chompT: 0, needRelease: false,
    },
    // düşen bloklar (kum, çakıl): kuyruk
    fall: {
      xs: [], ys: [], zs: [], moved: [], tries: [], acc: 0,
    },
    chestPos: null,
    pinned: null,
    hint: { text: null, t: 0, ctx: false },
    rngState: 0x9e3779b9,
    useCool: 0,
    pickupT: -10,
    fullHintT: -99,
    charMine: { name: 'mine', progress: 0 },
    charPlace: { name: 'place', progress: 0 },
    charT: 0,
    lastTargetId: -1,
    sleeping: false,
    message: { harita: 0 },
    dirtyFrame: 0,
  };
}

export function canAct(G) {
  return G.ui === 'none' && !G.player.dead && !G.time.paused && G.worldReady !== false && !G.player.vehicle;
}

export function blockAt(G, x, y, z) {
  return G.world.getBlock(x, y, z);
}

const _pb = [0, 0, 0, 0, 0, 0];
function playerBox(G) {
  const b = G.body;
  const hw = b.w * 0.5;
  _pb[0] = b.x - hw; _pb[1] = b.y; _pb[2] = b.z - hw;
  _pb[3] = b.x + hw; _pb[4] = b.y + (b.h || PLAYER.height); _pb[5] = b.z + hw;
  return _pb;
}

const EPS = 1e-4;
function boxesOverlap(id, x, y, z, minX, minY, minZ, maxX, maxY, maxZ) {
  const boxes = BLOCKS[id] ? BLOCKS[id].collision : null;
  if (!boxes) return false;
  for (let i = 0; i < boxes.length; i++) {
    const c = boxes[i];
    if (x + c[3] > minX + EPS && x + c[0] < maxX - EPS
      && y + c[4] > minY + EPS && y + c[1] < maxY - EPS
      && z + c[5] > minZ + EPS && z + c[2] < maxZ - EPS) return true;
  }
  return false;
}

/** Bloğun çarpışma kutuları oyuncu gövdesiyle kesişiyor mu (çarpışması olmayan şekiller hiç kesişmez). */
export function overlapsPlayer(G, x, y, z, id) {
  if (!G.body) return false;
  const p = playerBox(G);
  return boxesOverlap(id, x, y, z, p[0], p[1], p[2], p[3], p[4], p[5]);
}

/** Yakındaki (≤ 3 blok) yaratıklarla kesişim. */
export function overlapsMobs(G, x, y, z, id) {
  if (!G.em || typeof G.em.queryMobs !== 'function') return false;
  const rec = BLOCKS[id];
  if (!rec || !rec.solid) return false;
  const list = G.em.queryMobs(x + 0.5, z + 0.5, 3);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const hw = (e.w || 0.6) * 0.5;
    if (boxesOverlap(id, x, y, z, e.x - hw, e.y, e.z - hw, e.x + hw, e.y + (e.h || 1), e.z + hw)) return true;
  }
  return false;
}

export function setHint(G, S, text, secs) {
  S.hint.text = text;
  S.hint.t = secs > 0 ? secs : 2.5;
  S.hint.ctx = false;
  G.hud.hint = text;
}

/**
 * Reddedilen eylem: oturum sisteminin sözleşmesi G.emit({type:'actionDenied', reason}) (reason: 'readOnly'|'bounds'|'height'|'system'|
 * 'protected'); oturum sistemi yoksa yerel ipucu yazılır. Her durumda hata sesi çalar.
 */
export function deny(G, S, reason, fallback, secs) {
  G.emit({ type: 'actionDenied', reason });
  if (!(typeof G.getSystem === 'function' && G.getSystem('session'))) setHint(G, S, fallback, secs || 2.2);
  G.sound('ui_error', undefined, { vol: 0.4 });
}

/** Bağlamsal ipucu ("Sağ tık: Sandığı aç"): yalnız boşsa ya da kendi bağlamsal ipucunun yerine yazılır; bakış kayınca silinir. */
export function setContextHint(G, S, text) {
  const h = S.hint;
  if (G.hud.hint && !(G.hud.hint === h.text && h.ctx)) return;
  if (G.hud.hint !== text) G.hud.hint = text;
  h.text = text;
  h.ctx = true;
  h.t = 0.35;
}

export function clearContextHint(G, S) {
  const h = S.hint;
  if (h.ctx && h.text && G.hud.hint === h.text) G.hud.hint = null;
  if (h.ctx) {
    h.text = null;
    h.t = 0;
    h.ctx = false;
  }
}

export function tickHint(G, S, dt) {
  if (S.hint.t <= 0) return;
  S.hint.t -= dt;
  if (S.hint.t <= 0) {
    if (G.hud.hint === S.hint.text) G.hud.hint = null;
    S.hint.text = null;
    S.hint.ctx = false;
  }
}

/** kind: 'dig'|'break'|'place'|'step'|'land' → ses adı (blok malzemesine göre). */
export function soundFor(kind, id) {
  const b = BLOCKS[id];
  return kind + ':' + (b ? b.sound : 'taş');
}

/** Belirlenimci rastgele [0,1): em.rng varsa o, yoksa tohumsuz küçük akış (yalnız saçılma için). */
export function rngNext(G, S) {
  const em = G.em;
  if (em && em.rng && typeof em.rng.next === 'function') return em.rng.next();
  let t = (S.rngState = (S.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Blok eşyası için eşya anahtarı (yerleştirilebilirlik denetimi çağıranda). */
export function blockItem(id) {
  const b = BLOCKS[id];
  return b && id > 0 ? 'blok:' + b.key : null;
}

/** Konumu {x,y,z} nesnesine yazar (hücre merkezi). */
export function centerOf(out, x, y, z) {
  out.x = x + 0.5;
  out.y = y + 0.5;
  out.z = z + 0.5;
  return out;
}

/**
 * Yere eşya saçar (pop fiziği: yukarı + yanlara). list: [{item,count,dur?}]. Dönüş: bırakılan yığın sayısı.
 * em.spawnItem yoksa (test/yedek) envantere eklemeyi dener, sığmayanı yok sayar.
 */
export function spawnDrops(G, S, list, x, y, z) {
  if (!list || list.length === 0) return 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || !(d.count > 0)) continue;
    if (G.em && typeof G.em.spawnItem === 'function') {
      const a = rngNext(G, S) * Math.PI * 2;
      const sp = 0.6 + rngNext(G, S) * 1.1;
      const opts = {
        vx: Math.cos(a) * sp, vy: 2.4 + rngNext(G, S) * 1.2, vz: Math.sin(a) * sp, delay: 0.45,
      };
      if (d.dur !== undefined) opts.dur = d.dur;
      if (d.ench) opts.ench = d.ench;
      if (d.charge !== undefined) opts.charge = d.charge; // teknoloji şarjı yere düşünce de korunur
      if (G.em.spawnItem(d.item, d.count, x, y, z, opts)) n++;
    } else if (G.inventory) {
      G.inventory.addStack(d.item, d.count, d.dur, d.ench, d.charge);
      n++;
    }
  }
  return n;
}
