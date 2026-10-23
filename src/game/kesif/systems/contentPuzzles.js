/*
 * KEŞİF content sistemi — BULMACA köprüsü (oyuncu ↔ PuzzleManager).
 *
 * Oyuncu eylemleri:
 *   'use'      blockUse olayı (blocks sistemi) ya da — yedek olarak — etkileşim kenarında hedef bloğa kendi ışınımız:
 *              önce G.puzzles.handleInteract; bulmaca işlemediyse sırayla S.useHandlers (kristal/sunak/tabela/mühür/boss kapısı).
 *              blocks sistemi handleInteract'ı kendisi çağırıyorsa (G.puzzles.handleInteract sarılır) aynı tikte tekrar çağrılmaz.
 *   'step'     her sabit adımda oyuncunun ayağındaki hücre plaka (PRESSURE_PLATE/_ON) ise; ayrıca itilebilir bloğa yürüme
 *              (dx/dz yönüyle) ve portal hücresine temas ('entity' + yaw/vx/vz).
 *   'entity'   yakın yaratıkların plaka üstünde durması (10 Hz).
 *   'portalShot' olayı ya da elde Portal Tabancası varken sol/sağ tıkla ışın izleme (mavi/turuncu).
 *   blockBroken/blockPlaced: blocks sistemi G.puzzles.handleInteract'ı KENDİSİ çağırır → burada yeniden iletilmez.
 * Efektler (PuzzleManager 'effect'): sound, particles, message, giveItem, takeItem, teleport{x,y,z,yaw,keepMomentum,vx,vz,entityId},
 *   carry{dx,dy,dz,box}; setBlock/spawn/solved/reset zaten yönetici tarafından uygulanır.
 * Çözüm kutlaması: puzzleSolved → parçacık + ses + ileti (tapınakta n/N sayacı).
 *
 *   initPuzzles(S)  fixedPuzzles(S, dt)  handleUse(S, x, y, z, evt)  puzzleApi(S)  disposePuzzles(S)
 *   structureSolved(S, rec) → {solved, total}
 */
import { B, BLOCKS } from '../sim/blocks.js';
import { ITEMS } from '../sim/items.js';
import { lookDir } from '../sim/physics.js';
import { createRayHit, raycastBlocks } from '../sim/raycast.js';
import { itemName } from './contentHelpers.js';

const PLATE = {};
PLATE[B.PRESSURE_PLATE] = true;
PLATE[B.PRESSURE_PLATE_ON] = true;
const PORTAL = {};
PORTAL[B.PORTAL_BLUE] = true;
PORTAL[B.PORTAL_ORANGE] = true;
const GUN = 'item:portal_tabancası';
const _look = { x: 0, y: 0, z: -1 };
const _eye = { x: 0, y: 0, z: 0 };
const _hit = createRayHit();

export function structureSolved(S, rec) {
  const list = rec.def.puzzles || [];
  let solved = 0;
  for (let i = 0; i < list.length; i++) if (S.G.puzzles.isSolved(list[i].id)) solved++;
  return { solved, total: list.length };
}

export function initPuzzles(S) {
  const G = S.G;
  const pm = G.puzzles;
  if (!pm) return;
  // blocks sistemi handleInteract'ı doğrudan çağırıyorsa 'use' çift işlenmesin
  const orig = pm.handleInteract.bind(pm);
  S._origHandle = pm.handleInteract;
  pm.handleInteract = (ev) => {
    const r = orig(ev);
    if (ev && ev.type === 'use') {
      S.lastUse.tick = G.time.tick;
      S.lastUse.x = Math.floor(ev.x);
      S.lastUse.y = Math.floor(ev.y);
      S.lastUse.z = Math.floor(ev.z);
      S.lastUse.handled = !!r;
    }
    return r;
  };
  S._unEffect = pm.on('effect', (ef) => applyEffect(S, ef));
}

export function disposePuzzles(S) {
  const pm = S.G.puzzles;
  if (S._unEffect) S._unEffect();
  S._unEffect = null;
  if (pm && S._origHandle) pm.handleInteract = S._origHandle;
  S._origHandle = null;
}

/* ---------------------------------------------------------------------------------------------
 * Kullan
 * ------------------------------------------------------------------------------------------- */
/** Bir 'use' (sağ tık/dokun) eylemini işler. Döner: işlendi mi. evt.handled işaretlenir. */
export function handleUse(S, x, y, z, evt) {
  const G = S.G;
  const k = x + ',' + y + ',' + z;
  if (S.useTick === G.time.tick && S.useKey === k) return true;
  S.useTick = G.time.tick;
  S.useKey = k;
  const b = G.body;
  const item = evt && evt.item ? evt.item : (G.inventory ? G.inventory.heldItem() : null);
  let handled = false;
  const pm = G.puzzles;
  const already = S.lastUse.tick === G.time.tick && S.lastUse.x === x && S.lastUse.y === y && S.lastUse.z === z;
  if (pm && !already) {
    handled = !!pm.handleInteract({
      type: 'use', x, y, z, item: item || undefined, playerId: 'player', px: b.x, pz: b.z,
    });
  } else if (already) {
    handled = S.lastUse.handled === true; // blocks sistemi bulmacaya zaten iletti
  }
  if (!handled) {
    let id = evt && Number.isFinite(evt.id) ? evt.id : G.world.getBlock(x, y, z);
    if (id === null || id === undefined) id = 0;
    for (let i = 0; i < S.useHandlers.length && !handled; i++) handled = !!S.useHandlers[i](S, x, y, z, id, evt || null);
  }
  if (handled && evt) evt.handled = true;
  return handled;
}

/* ---------------------------------------------------------------------------------------------
 * Her sabit adım
 * ------------------------------------------------------------------------------------------- */
export function fixedPuzzles(S, dt) {
  const G = S.G;
  const pm = G.puzzles;
  const b = G.body;
  if (!pm || !b) return;
  const world = G.world;
  const owned = pm.size > 0;
  if (owned && !G.player.dead) {
    stepEvents(S, b, world, pm);
    S.pushT -= dt;
    pushEvents(S, b, world, pm);
    S.mobT += dt;
    if (S.mobT >= 0.1) {
      S.mobT = 0;
      mobEvents(S, world, pm);
    }
  }
  portalGun(S);
  edgeUse(S);
  if (owned) pm.update(dt, b);
}

function stepEvents(S, b, world, pm) {
  const bx = Math.floor(b.x);
  const by = Math.floor(b.y + 0.02);
  const bz = Math.floor(b.z);
  const id = world.getBlock(bx, by, bz);
  if (id !== null && PLATE[id] === true) {
    pm.handleInteract({
      type: 'step', x: bx, y: by, z: bz, playerId: 'player',
    });
    return;
  }
  // portal: ayak/baş hücresi + hareket yönünde küçük ileri bakış
  const inv = inputDir(S);
  const px = inv.len > 0.2 ? b.x + (inv.dx / inv.len) * 0.35 : b.x;
  const pz = inv.len > 0.2 ? b.z + (inv.dz / inv.len) * 0.35 : b.z;
  const cx = Math.floor(px);
  const cz = Math.floor(pz);
  for (let h = 0; h < 2; h++) {
    const y = by + h;
    let pid = world.getBlock(bx, y, bz);
    let tx = bx;
    let tz = bz;
    if (!(pid !== null && PORTAL[pid] === true) && (cx !== bx || cz !== bz)) {
      pid = world.getBlock(cx, y, cz);
      tx = cx;
      tz = cz;
    }
    if (pid !== null && PORTAL[pid] === true) {
      pm.handleInteract({
        type: 'entity', x: tx, y, z: tz, playerId: 'player', yaw: S.G.player.yaw, vx: b.vx, vz: b.vz,
      });
      return;
    }
  }
}

const _dir = { dx: 0, dz: 0, len: 0 };
function inputDir(S) {
  const s = S.G.inputState;
  const yaw = S.G.player.yaw;
  const mx = s ? s.moveX : 0;
  const mz = s ? s.moveZ : 0;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  _dir.dx = fx * mz + rx * mx;
  _dir.dz = fz * mz + rz * mx;
  _dir.len = Math.sqrt(_dir.dx * _dir.dx + _dir.dz * _dir.dz);
  return _dir;
}

function pushEvents(S, b, world, pm) {
  if (S.pushT > 0) return;
  const d = inputDir(S);
  if (d.len < 0.3) return;
  let ax = 0;
  let az = 0;
  if (Math.abs(d.dx) > Math.abs(d.dz)) ax = d.dx > 0 ? 1 : -1;
  else az = d.dz > 0 ? 1 : -1;
  const x = Math.floor(b.x + ax * 0.55);
  const z = Math.floor(b.z + az * 0.55);
  const y = Math.floor(b.y + 0.02);
  for (let h = 0; h < 2; h++) {
    const id = world.getBlock(x, y + h, z);
    if (id === B.PUSH_BLOCK) {
      S.pushT = 0.18;
      pm.handleInteract({
        type: 'step', x, y: y + h, z, dx: ax, dz: az, px: b.x, pz: b.z, playerId: 'player',
      });
      return;
    }
  }
}

function mobEvents(S, world, pm) {
  const em = S.G.em;
  const b = S.G.body;
  if (!em || typeof em.queryMobs !== 'function') return;
  const list = em.queryMobs(b.x, b.z, 32);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const x = Math.floor(e.x);
    const y = Math.floor(e.y + 0.02);
    const z = Math.floor(e.z);
    const id = world.getBlock(x, y, z);
    if (id !== null && PLATE[id] === true) {
      pm.handleInteract({
        type: 'entity', x, y, z, entityId: e.id,
      });
    }
  }
}

/* ---------------------------------------------------------------------------------------------
 * Portal tabancası (yedek: blocks/mobs sistemi 'portalShot' yayarsa orada işlenir)
 * ------------------------------------------------------------------------------------------- */
function portalGun(S) {
  const G = S.G;
  const s = G.inputState;
  if (!s || G.ui !== 'none' || G.player.dead) return;
  if (!(s.attackPressed || s.placePressed)) return;
  if (!G.inventory || G.inventory.heldItem() !== GUN) return;
  if (S.portalShotTick >= G.time.tick - 1) return; // başka sistem ateşledi / bu kenar işlendi
  const pm = G.puzzles;
  if (!pm) return;
  // aynı sağ tık bir kol/sandık/bulmaca bloğunu KULLANDIYSA (ör. raftan tabanca alma) ateş etme
  if (!s.attackPressed && (S.useTick >= G.time.tick - 1 || S.lastUse.tick >= G.time.tick - 1)) return;
  S.portalShotTick = G.time.tick;
  const b = G.body;
  _eye.x = b.x;
  _eye.y = b.y + b.eyeH;
  _eye.z = b.z;
  lookDir(G.player.yaw, G.player.pitch, _look);
  const hit = raycastBlocks(G.world, _eye, _look, 40, { out: _hit });
  const color = s.attackPressed ? 'mavi' : 'turuncu';
  if (!hit) {
    S.fx.sound('gun_empty', b.x, b.y + 1, b.z);
    return;
  }
  if (!s.attackPressed && BLOCKS[hit.id] && BLOCKS[hit.id].interact && hit.t <= 5) return; // sağ tık = kullan
  G.emit({
    type: 'portalShot', x: hit.x, y: hit.y, z: hit.z, face: { nx: hit.face.nx, ny: hit.face.ny, nz: hit.face.nz }, color,
  });
}

/** 'portalShot' olayı → bulmaca. */
export function onPortalShot(S, evt) {
  S.portalShotTick = S.G.time.tick;
  const pm = S.G.puzzles;
  if (!pm || !evt) return;
  const handled = pm.handleInteract({
    type: 'portalShot', x: evt.x, y: evt.y, z: evt.z, face: evt.face, color: evt.color, playerId: 'player',
  });
  if (handled) evt.handled = true;
}

/* ---------------------------------------------------------------------------------------------
 * Yedek 'use' algılama: blocks sistemi blockUse yayımlamadıysa etkileşim kenarında hedef bloğu biz çözeriz.
 * ------------------------------------------------------------------------------------------- */
function edgeUse(S) {
  const G = S.G;
  const s = G.inputState;
  if (!s || !(s.placePressed || s.interactPressed)) return;
  if (G.ui !== 'none' || G.player.dead || !G.worldReady) return;
  const tick = G.time.tick;
  if (S.edgeTick >= 0 && tick - S.edgeTick < 6) return;
  S.edgeTick = tick;
  // blocks sistemi bu kenarda zaten 'use' işlediyse dokunma
  if (S.useTick >= tick - 1 || S.lastUse.tick >= tick - 1) return;
  const held = G.inventory ? G.inventory.heldItem() : null;
  const it = held ? ITEMS[held] : null;
  if (it && it.placesBlock) return; // yerleştirme niyeti
  const b = G.body;
  _eye.x = b.x;
  _eye.y = b.y + b.eyeH;
  _eye.z = b.z;
  lookDir(G.player.yaw, G.player.pitch, _look);
  const hit = raycastBlocks(G.world, _eye, _look, 5, { out: _hit });
  if (!hit) return;
  if (S.useInterest[hit.id] !== true) return;
  handleUse(S, hit.x, hit.y, hit.z, { type: 'blockUse', x: hit.x, y: hit.y, z: hit.z, id: hit.id, item: held, fallback: true });
}

/* ---------------------------------------------------------------------------------------------
 * Efektler
 * ------------------------------------------------------------------------------------------- */
const _c = { x: 0, y: 0, z: 0 };
function centerOf(ef) {
  _c.x = Number.isFinite(ef.x) ? (Number.isInteger(ef.x) ? ef.x + 0.5 : ef.x) : NaN;
  _c.y = Number.isFinite(ef.y) ? (Number.isInteger(ef.y) ? ef.y + 0.5 : ef.y) : NaN;
  _c.z = Number.isFinite(ef.z) ? (Number.isInteger(ef.z) ? ef.z + 0.5 : ef.z) : NaN;
  return _c;
}

export function applyEffect(S, ef) {
  if (!ef || typeof ef.kind !== 'string') return;
  const G = S.G;
  switch (ef.kind) {
    case 'sound': {
      const c = centerOf(ef);
      S.fx.sound(ef.name, c.x, c.y, c.z, ef.pitch);
      break;
    }
    case 'particles': {
      const c = centerOf(ef);
      S.fx.particles(ef.fx, c.x, c.y, c.z, ef.color);
      break;
    }
    case 'message':
      S.fx.message(ef.text);
      break;
    case 'giveItem':
      giveItem(S, ef.item, ef.count === undefined ? 1 : ef.count);
      break;
    case 'takeItem':
      takeItem(S, ef.item, ef.count === undefined ? 1 : ef.count);
      break;
    case 'teleport':
      teleport(S, ef);
      break;
    case 'carry':
      carry(S, ef);
      break;
    default:
      break;
  }
  void G;
}

function giveItem(S, item, count) {
  const G = S.G;
  const n = Math.floor(count);
  if (!G.inventory || typeof item !== 'string' || !(n > 0) || !ITEMS[item]) return;
  const left = G.inventory.add(item, n);
  const given = n - (left > 0 ? left : 0);
  if (left > 0 && G.em && typeof G.em.spawnItem === 'function') G.em.spawnItem(item, left, G.body.x, G.body.y + 0.6, G.body.z);
  if (given > 0) {
    S.fx.sound('pickup', G.body.x, G.body.y + 1, G.body.z);
    S.fx.message(itemName(item) + (given > 1 ? ' ×' + given : '') + ' aldın.', { speak: true });
    G.emit({ type: 'itemPickedUp', item, count: given, source: 'puzzle' });
  }
}

/** Kırılan gösterim bloğunun düşen kopyasını geri al: önce envanter, yoksa yakındaki yerdeki eşya. */
function takeItem(S, item, count) {
  const G = S.G;
  const n = Math.floor(count);
  if (typeof item !== 'string' || !(n > 0)) return;
  if (G.inventory && G.inventory.remove(item, n)) return;
  const em = G.em;
  if (!em || !em.items) return;
  const lb = S.lastBroken;
  const cx = G.time.tick - lb.tick < 600 ? lb.x + 0.5 : G.body.x;
  const cy = G.time.tick - lb.tick < 600 ? lb.y + 0.5 : G.body.y;
  const cz = G.time.tick - lb.tick < 600 ? lb.z + 0.5 : G.body.z;
  let best = null;
  let bd = 16;
  em.items.forEach((e) => {
    if (e.item !== item || e.removed) return;
    const d = (e.x - cx) * (e.x - cx) + (e.y - cy) * (e.y - cy) + (e.z - cz) * (e.z - cz);
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  if (best) {
    if (best.count > n) best.count -= n;
    else {
      best.removed = true;
      em.items.delete(best.id);
    }
  }
}

function teleport(S, ef) {
  const G = S.G;
  if (!Number.isFinite(ef.x) || !Number.isFinite(ef.y) || !Number.isFinite(ef.z)) return;
  if (ef.entityId !== undefined && ef.entityId !== null && ef.entityId !== 'player') {
    const e = G.em && typeof G.em.get === 'function' ? G.em.get(ef.entityId) : null;
    if (e) {
      e.x = ef.x;
      e.y = ef.y;
      e.z = ef.z;
      if (Number.isFinite(ef.yaw)) e.yaw = ef.yaw;
    }
    return;
  }
  const b = G.body;
  const vy = b.vy;
  const keep = ef.keepMomentum === true;
  G.teleport(ef.x, ef.y, ef.z, { safe: false, yaw: Number.isFinite(ef.yaw) ? ef.yaw : undefined });
  if (keep) {
    b.vx = Number.isFinite(ef.vx) ? ef.vx : 0;
    b.vz = Number.isFinite(ef.vz) ? ef.vz : 0;
    b.vy = vy;
    b.fallPeakY = ef.y;
  }
  if (ef.reason === 'dusme' || ef.reason === 'kurtarma') G.haptic('light');
}

/** Hareketli platform bir hücre kaydı: ayakları kutunun üst yüzeyinde duranları (oyuncu + yaratıklar) taşı. */
function carry(S, ef) {
  const G = S.G;
  const box = ef.box;
  if (!box || !Number.isFinite(ef.dx) || !Number.isFinite(ef.dy) || !Number.isFinite(ef.dz)) return;
  const top = box.y1 + 1;
  const on = (x, y, z) => x >= box.x0 - 0.0001 && x < box.x1 + 1.0001 && z >= box.z0 - 0.0001 && z < box.z1 + 1.0001 && Math.abs(y - top) <= 0.12;
  const b = G.body;
  if (b && !b.flying && on(b.x, b.y, b.z)) {
    b.x += ef.dx;
    b.y += ef.dy;
    b.z += ef.dz;
    if (Number.isFinite(b.fallPeakY)) b.fallPeakY += ef.dy;
    if (G.eyeSim) {
      G.eyeSim.x = b.x;
      G.eyeSim.y = b.y + b.eyeH;
      G.eyeSim.z = b.z;
    }
  }
  const em = G.em;
  if (em && typeof em.forEachMob === 'function') {
    em.forEachMob((e) => {
      if (!e.dead && on(e.x, e.y, e.z)) {
        e.x += ef.dx;
        e.y += ef.dy;
        e.z += ef.dz;
      }
    });
  }
}

/* ---------------------------------------------------------------------------------------------
 * Çözüm kutlaması
 * ------------------------------------------------------------------------------------------- */
export function onPuzzleSolved(S, evt) {
  const G = S.G;
  const pm = G.puzzles;
  const info = pm && typeof pm.get === 'function' ? pm.get(evt.id) : null;
  let cx = G.body.x;
  let cy = G.body.y + 1;
  let cz = G.body.z;
  if (info && info.bounds && info.bounds.inner) {
    const i = info.bounds.inner;
    cx = (i.x0 + i.x1 + 1) / 2;
    cy = i.y0 + 1.5;
    cz = (i.z0 + i.z1 + 1) / 2;
  }
  S.fx.particles('magicBurst', cx, cy, cz, 0xffd24a, { radius: 2.6, scale: 1.4 });
  S.fx.particles('levelUp', cx, cy - 0.5, cz, 0xffd24a);
  S.fx.sound('puzzle_solved', cx, cy, cz);
  G.haptic('success');
  const rec = evt.structureId ? S.structs.get(evt.structureId) : null;
  if (rec && rec.type === 'anahtartapinagi') {
    const st = structureSolved(S, rec);
    if (st.solved >= st.total) S.fx.message('Bulmaca çözüldü! Tüm odalar tamam: sunaktaki Anahtar Kristali seni bekliyor.');
    else S.fx.message('Bulmaca çözüldü! Oda ' + st.solved + '/' + st.total + ' — sıradaki odaya ilerle.');
  } else if (rec && rec.type === 'turbe') {
    S.fx.message('Bulmaca çözüldü! Arka kapı açıldı: hazine odasına bak.');
  } else {
    S.fx.message('Bulmaca çözüldü!');
  }
}

/* ---------------------------------------------------------------------------------------------
 * api
 * ------------------------------------------------------------------------------------------- */
export function puzzleApi(S) {
  const G = S.G;
  return {
    /** Yakındaki (≤ 24 blok) bulmacanın ipucu; yoksa hedef metni. */
    getPuzzleHint() {
      const b = G.body;
      if (!b || !G.puzzles) return null;
      const t = G.puzzles.hintNear(b.x, b.y, b.z, 24);
      if (t) {
        S.fx.message(t, { speak: true });
        return t;
      }
      return null;
    },
    /** Yakındaki (≤ 32 blok) bulmacayı başlangıca döndürür (çözülmüşse dokunmaz). */
    resetNearestPuzzle() {
      const b = G.body;
      if (!b || !G.puzzles) return false;
      const id = G.puzzles.nearest(b.x, b.y, b.z, 32);
      if (id === null) {
        S.fx.message('Yakında sıfırlanacak bir bulmaca yok.');
        return false;
      }
      const info = G.puzzles.get(id);
      if (info && info.solved) {
        S.fx.message('Bu bulmaca zaten çözüldü.');
        return false;
      }
      const ok = G.puzzles.reset(id);
      if (ok) {
        S.fx.sound('lever', b.x, b.y + 1, b.z);
        S.fx.message('Bulmaca başa döndü.');
      }
      return !!ok;
    },
  };
}
