/*
 * KEŞİF tech sistemi — makine etkileşimi: sağ tık yönlendirmesi, makine paneli (G.setUi('machine')), makine eylemleri.
 *
 *   onBlockUse(T, e)                  'blockUse' olayı: makine bloğunu ele alır (e.handled = true)
 *   openPanel(T, x, y, z) → bool      makine panelini açar (G.techUi.pos)
 *   machineAction(T, x, y, z, a)      a.type: fuel takeFuel smelt takeSmelt takeInput drillTake press charge teleport lift → {ok, message?, …}
 *   teleportFrom(T, x, y, z) / liftFrom(T, x, y, z, dir)
 *   stepLift(T, dt)                   asansör animasyonu (oyuncuyu platformlar arasında yumuşakça taşır)
 *   panelGuard(T)                     panel açıkken uzaklaşma / makine kaybı denetimi
 *
 * Kurallar: ışınlayıcı/asansör yalnız platformun ÜSTÜNDE iken çalışır; hedef önce yüklenir; hedef kilitli bir bölgedeyse reddedilir
 * (mühür kuralı). Çömelince: ışınlayıcı/düğme paneli açar, asansör aşağı iner. Şarjlı eşya elde Pil Bankası/Şarj İstasyonuna sağ tık = doldur.
 */
import { BLOCKS } from '../sim/blocks.js';
import { techBlockDef } from '../sim/techData.js';
import { furnaceRecipe } from '../sim/techMachines.js';
import { inventoryChargeNeed } from '../sim/techCharge.js';
import {
  giveItems, nearPlayer, parkourActive, say, zoneUnlockedAt,
} from './techCtx.js';

const PANEL_REACH = 7.5;
const PAD_REACH = 1.45;

function inMacera(G) {
  return G.mode === 'macera';
}

function swing(G) {
  if (G.viewModel && G.viewModel.swing) G.viewModel.swing('use');
}

const P = { x: 0, y: 0, z: 0 };
function cell(x, y, z, dy) {
  P.x = x + 0.5; P.y = y + (dy === undefined ? 0.5 : dy); P.z = z + 0.5;
  return P;
}

/** Oyuncu platformun (x,y,z; yarım blok) üstünde mi? */
export function onPad(G, x, y, z) {
  const b = G.body;
  const dx = b.x - (x + 0.5);
  const dz = b.z - (z + 0.5);
  if (dx * dx + dz * dz > PAD_REACH * PAD_REACH) return false;
  const fy = b.y - y;
  return fy >= -0.3 && fy <= 1.3;
}

/** Hedefin çevresini (chunk + derin kesitler) önceden üretir: 'yuklenmedi' reddi olmasın. */
export function ensureAround(G, x, y, z) {
  const w = G.world;
  const cx = Math.floor(x) >> 4;
  const cz = Math.floor(z) >> 4;
  if (!w.hasChunk(cx, cz)) {
    if (!w.canGenerate(cx, cz)) return false;
    w.ensureChunk(cx, cz);
  }
  if (w.legacy === false && typeof w.ensureSectionsNear === 'function') w.ensureSectionsNear(x, y, z, 2, 6);
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Panel
 * ---------------------------------------------------------------------------------------------- */
export function openPanel(T, x, y, z) {
  const G = T.G;
  const tech = T.tech;
  let st = tech.get(x, y, z);
  if (!st) st = tech.onBlockPlaced(x, y, z, G.world.getBlock(x, y, z));
  if (!st) return false;
  G.techUi.pos = { x, y, z };
  G.techUi.type = st.t;
  swing(G);
  G.sound('ui_open', undefined, { vol: 0.55 });
  G.setUi('machine');
  return true;
}

export function panelGuard(T) {
  const G = T.G;
  if (G.ui !== 'machine') return;
  const p = G.techUi.pos;
  if (!p) {
    G.setUi(null);
    return;
  }
  const alive = T.tech.has(p.x, p.y, p.z) && G.world.getBlock(p.x, p.y, p.z) !== 0;
  if (!alive || !nearPlayer(G, p.x, p.y, p.z, PANEL_REACH)) G.setUi(null);
}

/* ------------------------------------------------------------------------------------------------
 * Işınlanma / asansör
 * ---------------------------------------------------------------------------------------------- */
function deny(T, key, text) {
  T.G.sound('tech:deny', undefined, { vol: 0.5 });
  say(T, key, text, { secs: 3, cooldown: 1.5 });
}

export function teleportFrom(T, x, y, z) {
  const G = T.G;
  const tech = T.tech;
  if (!inMacera(G)) return { ok: false, reason: 'mod', message: 'Işınlanma yalnızca macera modunda çalışır.' };
  if (parkourActive(G)) {
    deny(T, 'tp:parkur', 'Parkur sırasında ışınlanma kapalı.');
    return { ok: false, reason: 'parkur', message: 'Parkur sırasında ışınlanma kapalı.' };
  }
  if (!onPad(G, x, y, z)) {
    deny(T, 'tp:pad', 'Platformun üstüne çık, sonra kullan.');
    return { ok: false, reason: 'uzak', message: 'Platformun üstüne çık.' };
  }
  const tgt = tech.teleportTargetOf(x, y, z);
  if (tgt) {
    if (!ensureAround(G, tgt.x, tgt.y, tgt.z) || !zoneUnlockedAt(G, tgt.x, tgt.z)) {
      deny(T, 'tp:zone', 'Hedef platform henüz açılmamış bir bölgede: önce mührü aç.');
      return { ok: false, reason: 'kilitli', message: 'Hedef bölge kilitli.' };
    }
  }
  const res = tech.teleport(x, y, z, { world: G.world });
  if (!res.ok) {
    deny(T, 'tp:' + res.reason, res.message || 'Işınlanamadı.');
    return res;
  }
  const b = G.body;
  if (G.particles && G.particles.teleportRing) G.particles.teleportRing(cell(x, y, z, 0.6), 0x7affea);
  G.sound('tech:teleport', G.body, { vol: 0.9 });
  T.lift = null; // asansör animasyonu sürerken ışınlanırsa eski x/z'ye geri çekmesin
  G.teleport(res.to.x, res.to.y, res.to.z, { safe: false });
  b.fallPeakY = res.to.y;
  if (G.particles && G.particles.teleportRing) G.particles.teleportRing(cell(res.to.x - 0.5, res.to.y - 0.5, res.to.z - 0.5, 0.6), 0x7affea);
  G.sound('tech:teleport', G.body, { vol: 0.9, pitch: 1.2 });
  G.haptic('medium');
  G.emit(res.event);
  G.speak('Işınlandın: ' + res.distance + ' blok. ' + res.cost + ' EU harcandı.');
  T.hudDirty = true;
  return res;
}

/** İki platform (blok y: ya, yb) arasındaki sütun (gövde için) katı bloksuz mu? Üstteki platformun kendisi (yarım blok) sayılmaz. */
function shaftClear(G, x, ya, yb, z) {
  const lo = Math.min(ya, yb);
  const hi = Math.max(ya, yb);
  for (let yy = lo + 1; yy <= hi + 1; yy++) {
    if (yy === hi) continue;
    const id = G.world.getBlock(x, yy, z);
    if (id === null || id === undefined) return false;
    if (id !== 0 && BLOCKS[id] && BLOCKS[id].solid) return false;
  }
  return true;
}

export function liftFrom(T, x, y, z, dirArg) {
  const G = T.G;
  const tech = T.tech;
  if (!inMacera(G)) return { ok: false, reason: 'mod', message: 'Asansör yalnızca macera modunda çalışır.' };
  if (parkourActive(G)) {
    deny(T, 'lift:parkur', 'Parkur sırasında asansör kapalı.');
    return { ok: false, reason: 'parkur', message: 'Parkur sırasında asansör kapalı.' };
  }
  if (!onPad(G, x, y, z)) {
    deny(T, 'lift:pad', 'Platformun üstüne çık, sonra kullan.');
    return { ok: false, reason: 'uzak', message: 'Platformun üstüne çık.' };
  }
  const dir = dirArg < 0 ? -1 : 1;
  const info = tech.machineInfo(x, y, z);
  const ty = info && info.ok ? (dir > 0 ? info.up : info.down) : null;
  if (ty !== null && ty !== undefined) {
    if (!ensureAround(G, x, ty, z)) {
      deny(T, 'lift:zone', 'Hedef platform erişilemiyor.');
      return { ok: false, reason: 'yuklenmedi', message: 'Hedef yüklenemedi.' };
    }
  }
  const res = tech.lift(x, y, z, dir, { world: G.world });
  if (!res.ok) {
    deny(T, 'lift:' + res.reason, res.message || 'Asansör çalışmadı.');
    return res;
  }
  const b = G.body;
  G.sound('tech:lift', cell(x, y, z), { vol: 0.8 });
  const animate = shaftClear(G, x, y, res.to.y - 0.5, z) && res.distance <= 90;
  if (animate) {
    T.lift = {
      sy: b.y, ty: res.to.y, x: b.x, z: b.z, t: 0, dur: Math.max(0.35, Math.min(5, res.duration)),
    };
  } else {
    G.teleport(res.to.x, res.to.y, res.to.z, { safe: false });
    b.fallPeakY = res.to.y;
  }
  if (G.particles && G.particles.chargeBurst) G.particles.chargeBurst(cell(x, y, z, 0.7), 0xbfe6ff);
  G.emit(res.event);
  G.speak((dir > 0 ? 'Yukarı' : 'Aşağı') + ' çıkıyorsun: ' + res.distance + ' blok.');
  T.hudDirty = true;
  return res;
}

/** Asansör animasyonu: oyuncu sabit x/z'de, yumuşak ivmeli taşınır (yer çekimi/ düşme hasarı yok). */
export function stepLift(T, dt) {
  const L = T.lift;
  if (!L) return;
  const G = T.G;
  const b = G.body;
  if (G.player.dead) {
    T.lift = null;
    return;
  }
  L.t += dt;
  const u = Math.min(1, L.t / L.dur);
  const k = u * u * (3 - 2 * u);
  b.y = L.sy + (L.ty - L.sy) * k;
  b.x = L.x;
  b.z = L.z;
  b.vx = 0; b.vz = 0; b.vy = 0;
  b.fallPeakY = b.y;
  b.onGround = u >= 1;
  if (u >= 1) T.lift = null;
}

/* ------------------------------------------------------------------------------------------------
 * Sağ tık
 * ---------------------------------------------------------------------------------------------- */
function heldChargeable(G) {
  return inventoryChargeNeed(G.inventory) > 0;
}

export function onBlockUse(T, e) {
  const G = T.G;
  const def = techBlockDef(e.id);
  if (!def || !def.type) return;
  if (!inMacera(G)) {
    e.handled = true;
    say(T, 'mode', 'Teknoloji makineleri yalnızca macera modunda çalışır.', { cooldown: 4 });
    return;
  }
  const { x, y, z } = e;
  const crouch = !!G.player.crouching;
  e.handled = true;
  let st = T.tech.get(x, y, z);
  if (!st) st = T.tech.onBlockPlaced(x, y, z, e.id);
  if (!st) return;
  switch (def.type) {
    case 'dugme': {
      if (crouch) {
        openPanel(T, x, y, z);
        break;
      }
      const r = T.tech.pressButton(x, y, z);
      swing(G);
      G.sound('lever', cell(x, y, z), { vol: 0.8, pitch: r.on ? 1.15 : 0.9 });
      G.emit({
        type: 'buttonPressed', x, y, z, on: !!(r && r.on),
      });
      T.hudDirty = true;
      break;
    }
    case 'isinlayici':
      if (crouch || !st.freq) openPanel(T, x, y, z);
      else teleportFrom(T, x, y, z);
      break;
    case 'asansor':
      liftFrom(T, x, y, z, crouch ? -1 : 1);
      break;
    case 'pil':
    case 'sarj':
      if (!crouch && heldChargeable(G)) {
        const r = chargeFromBlock(T, x, y, z);
        if (r.ok || r.reason === 'bos') break;
      }
      openPanel(T, x, y, z);
      break;
    default:
      openPanel(T, x, y, z);
      break;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Eylemler (panel + api)
 * ---------------------------------------------------------------------------------------------- */
function chargeFromBlock(T, x, y, z) {
  const G = T.G;
  const r = T.tech.dischargeInto(x, y, z, G.inventory, 400);
  if (r.ok) {
    G.sound('tech:charge', undefined, { vol: 0.7 });
    if (G.particles && G.particles.chargeBurst) G.particles.chargeBurst({ x: G.body.x, y: G.body.y + 1.1, z: G.body.z }, 0x7affea);
    say(T, 'charge', 'Eşyaların şarj oldu: ' + r.used + ' EU aktarıldı.', { secs: 3, cooldown: 1 });
    G.haptic('light');
    swing(G);
    T.hudDirty = true;
  } else {
    G.sound('tech:deny', undefined, { vol: 0.5 });
    say(T, 'charge:' + r.reason, r.message || 'Şarj aktarılamadı.', { secs: 3, cooldown: 1.5 });
  }
  return r;
}

function reachOk(T, x, y, z) {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && nearPlayer(T.G, x, y, z, PANEL_REACH + 2.5);
}

function bad(reason, message) {
  return { ok: false, reason, message };
}

function takeToInventory(T, x, y, z, list, msg) {
  if (!list || list.length === 0) return bad('bos', 'Alınacak bir şey yok.');
  const drop = giveItems(T.G, list);
  T.G.sound('pickup', undefined, { vol: 0.5 });
  T.hudDirty = true;
  return { ok: true, message: msg + (drop > 0 ? ' Çanta dolu: bir kısmı yere düştü.' : ''), items: list };
}

export function machineAction(T, x0, y0, z0, a) {
  const G = T.G;
  const tech = T.tech;
  if (!inMacera(G)) return bad('mod', 'Yalnızca macera modunda.');
  if (G.player.dead) return bad('olu', 'Şu an yapılamaz.');
  const x = Math.floor(Number(x0));
  const y = Math.floor(Number(y0));
  const z = Math.floor(Number(z0));
  const act = a && typeof a === 'object' ? a : {};
  if (!reachOk(T, x, y, z)) return bad('uzak', 'Makine çok uzakta.');
  const st = tech.get(x, y, z);
  if (!st) return bad('yok', 'Burada bir makine yok.');
  const inv = G.inventory;
  const item = typeof act.item === 'string' ? act.item : '';
  let count = Math.floor(Number(act.count));
  if (!(count >= 1)) count = 64;
  switch (act.type) {
    case 'fuel': {
      if (st.t !== 'jenerator') return bad('tur', 'Bu makine yakıt kabul etmez.');
      const have = inv.count(item);
      if (have < 1) return bad('yok', 'Çantanda bu eşya yok.');
      const r = tech.insertFuel(x, y, z, item, Math.min(count, have));
      if (!r.ok) return r;
      inv.remove(item, r.accepted);
      G.sound('pickup', undefined, { vol: 0.4, pitch: 0.8 });
      T.hudDirty = true;
      return { ok: true, accepted: r.accepted, message: r.accepted + ' yakıt konuldu.' };
    }
    case 'takeFuel':
      return takeToInventory(T, x, y, z, [tech.takeFuel(x, y, z)].filter(Boolean), 'Yakıt geri alındı.');
    case 'smelt': {
      if (st.t !== 'ocak') return bad('tur', 'Bu makine eritme yapmaz.');
      if (!furnaceRecipe(item)) return bad('girdi', 'Bu eşya ocakta işlenmez.');
      const have = inv.count(item);
      if (have < 1) return bad('yok', 'Çantanda bu eşya yok.');
      const r = tech.furnaceInsert(x, y, z, item, Math.min(count, have));
      if (!r.ok) return r;
      inv.remove(item, r.accepted);
      G.sound('pickup', undefined, { vol: 0.4 });
      T.hudDirty = true;
      return { ok: true, accepted: r.accepted, message: r.accepted + ' parça konuldu.' };
    }
    case 'takeSmelt':
      return takeToInventory(T, x, y, z, [tech.furnaceTake(x, y, z)].filter(Boolean), 'Ürünler alındı.');
    case 'takeInput':
      return takeToInventory(T, x, y, z, [tech.furnaceTakeInput(x, y, z)].filter(Boolean), 'Girdi geri alındı.');
    case 'drillTake':
      return takeToInventory(T, x, y, z, tech.drillTake(x, y, z), 'Madenci tamponu boşaltıldı.');
    case 'press': {
      const r = tech.pressButton(x, y, z);
      if (r.ok) {
        G.sound('lever', cell(x, y, z), { vol: 0.7, pitch: r.on ? 1.15 : 0.9 });
        T.hudDirty = true;
      }
      return r;
    }
    case 'charge':
      return chargeFromBlock(T, x, y, z);
    case 'teleport': {
      const r = teleportFrom(T, x, y, z);
      if (r.ok && G.ui === 'machine') G.setUi(null);
      return r;
    }
    case 'lift': {
      const r = liftFrom(T, x, y, z, act.dir < 0 ? -1 : 1);
      if (r.ok && G.ui === 'machine') G.setUi(null);
      return r;
    }
    default:
      return bad('eylem', 'Bilinmeyen eylem.');
  }
}
