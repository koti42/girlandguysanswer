/*
 * KEŞİF content sistemi — PARKUR.
 *
 * Yapı tanımındaki `parkour` (start, end, checkpoints[{index,x,y,z}], rect, fallMargin, minY/maxY, dynamics, tier) ile çalışır:
 *   - başlangıç plakasına (PARKOUR_START hücresi) adım atınca süre başlar (hud.parkour {timer, checkpoint, difficulty:tier});
 *   - kontrol noktası plakalarına (PARKOUR_CHECKPOINT) basınca 'checkpoint' olayı + son nokta güncellenir;
 *   - bitiş plakasına (PARKOUR_END) basınca 'parkourDone' {id,tier,ms,timeMs,newBest} yayılır (ilerleme: rekor + ilk bitirme ödülü);
 *   - düşüş: parkur alanındaki oyuncu son kontrol noktasının fallMargin kadar altına inerse ÖLMEDEN o noktaya ışınlanır (parkourFallReset);
 *     parkurdayken düşme hasarı alınmaz (düşme tepe noktası sınırlanır);
 *   - yok olan platformlar (dynamics) 20 Hz uygulanır (applyParkourDynamics, düzenleme kaydı YOK).
 * Süre G.time.seconds ile ölçülür (duraklatılmışken ilerlemez). Kontrol noktaları süreyi sıfırlamaz; başlangıç plakasına yeniden basmak
 * koşuyu yeniden başlatır. Başlamadan bitişe basmak rekor saymaz (ipucu verilir).
 *
 *   initParkour(S)  fixedParkour(S, dt)  parkourStatus(S) → {active, ...}|null
 */
import { B } from '../sim/blocks.js';
import { applyParkourDynamics, parkourFallReset } from '../sim/parkour.js';

const HUD = { timer: 0, checkpoint: 0, difficulty: 1 };
const MAX_RUN = 1200;

function fmtTime(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
}

export function initParkour(S) {
  S.courseHinted = new Set();
  S.parkFinalT = 0;
  S.hooks.add.push((_S, rec) => {
    const pk = rec.def.parkour;
    if (!pk) return;
    S.courses.push({
      id: pk.id,
      rec,
      pk,
      lastCp: -1,
      active: false,
      t0: 0,
      onStart: false,
      onCp: -2,
      onEnd: false,
      lastGroundT: -99,
      resetMsgT: -99,
      noStartMsgT: -99,
      finalMs: 0,
    });
  });
  S.hooks.remove.push((_S, rec) => {
    const i = S.courses.findIndex((c) => c.rec === rec);
    if (i >= 0) {
      if (S.courses[i].active && S.G.hud.parkour === HUD) S.G.hud.parkour = null;
      S.courses.splice(i, 1);
    }
  });
}

function rectDist(pk, x, z) {
  const r = pk.rect;
  const dx = x < r.x0 ? r.x0 - x : (x > r.x1 ? x - r.x1 : 0);
  const dz = z < r.z0 ? r.z0 - z : (z > r.z1 ? z - r.z1 : 0);
  return Math.sqrt(dx * dx + dz * dz);
}

export function parkourStatus(S) {
  for (let i = 0; i < S.courses.length; i++) {
    const c = S.courses[i];
    if (c.active) {
      return {
        id: c.id, tier: c.pk.tier, checkpoint: c.lastCp + 1, ms: Math.round((S.G.time.seconds - c.t0) * 1000), active: true,
      };
    }
  }
  return null;
}

function startRun(S, c) {
  const G = S.G;
  c.active = true;
  c.t0 = G.time.seconds;
  c.lastCp = -1;
  S.parkFinalT = 0;
  const b = G.body;
  S.fx.sound('checkpoint', b.x, b.y + 1, b.z);
  S.fx.message('Parkur başladı! Kontrol noktalarına bas, kulenin tepesindeki bitiş plakasına ulaş.', { speak: true });
  G.player.lastCheckpoint = { x: c.pk.start.x + 0.5, y: c.pk.start.y, z: c.pk.start.z + 0.5 };
}

function checkpoint(S, c, i) {
  const G = S.G;
  if (i <= c.lastCp) return;
  c.lastCp = i;
  const k = c.pk.checkpoints[i];
  G.player.lastCheckpoint = { x: k.x + 0.5, y: k.y, z: k.z + 0.5 };
  S.fx.sound('checkpoint', k.x + 0.5, k.y + 0.5, k.z + 0.5);
  S.fx.particles('magicBurst', k.x + 0.5, k.y + 0.8, k.z + 0.5, 0x7ae0ff, { radius: 1.4, scale: 0.8 });
  G.haptic('light');
  S.fx.message('Kontrol noktası ' + (i + 1) + '/' + c.pk.checkpoints.length + (c.active ? '' : ' (süre başlamadı)'), { speak: c.active });
  G.emit({
    type: 'checkpoint', id: c.id, index: i, count: c.pk.checkpoints.length,
  });
}

function finish(S, c) {
  const G = S.G;
  const ms = Math.max(1, Math.round((G.time.seconds - c.t0) * 1000));
  const p = G.progression;
  const prev = p && p.stats && p.stats.parkourBest ? p.stats.parkourBest[c.id] : undefined;
  const newBest = prev === undefined || ms < prev;
  c.active = false;
  c.finalMs = ms;
  S.parkFinalT = 6;
  S.parkFinalCourse = c;
  const e = c.pk.end;
  S.fx.sound('parkour_done', e.x + 0.5, e.y + 0.5, e.z + 0.5);
  S.fx.particles('levelUp', e.x + 0.5, e.y + 1, e.z + 0.5, 0xffd24a, { multi: true });
  S.fx.particles('magicBurst', e.x + 0.5, e.y + 1.2, e.z + 0.5, 0xffd24a, { radius: 3, scale: 1.4 });
  G.haptic('success');
  S.fx.message('Parkur tamamlandı! Süre ' + fmtTime(ms) + (newBest ? ' — yeni rekor!' : '') + ' Ödül sandığını aç.', { speak: true });
  G.emit({
    type: 'parkourDone', id: c.id, tier: c.pk.tier, ms, timeMs: ms, newBest, tierName: c.pk.tierName,
  });
}

function cancel(S, c) {
  c.active = false;
  if (S.G.hud.parkour === HUD) S.G.hud.parkour = null;
}

/** Her sabit adım. */
export function fixedParkour(S, dt) {
  const G = S.G;
  const b = G.body;
  if (!b || S.courses.length === 0) {
    if (G.hud.parkour === HUD && !(S.parkFinalT > 0)) G.hud.parkour = null;
    return;
  }
  const now = G.time.seconds;
  // yok olan platformlar (20 Hz)
  S.dynT += dt;
  const doDyn = S.dynT >= 0.05;
  if (doDyn) S.dynT = 0;
  let cur = null;
  let curD = 1e9;
  for (let i = 0; i < S.courses.length; i++) {
    const c = S.courses[i];
    const d = rectDist(c.pk, b.x, b.z);
    if (doDyn && d < 64 && c.pk.dynamics && c.pk.dynamics.length > 0) applyParkourDynamics(c.pk, now, G.world);
    if (d < curD) {
      curD = d;
      cur = c;
    }
  }
  if (S.parkFinalT > 0) {
    S.parkFinalT -= dt;
    if (S.parkFinalT <= 0 && G.hud.parkour === HUD && !(S.parkFinalCourse && S.parkFinalCourse.active)) G.hud.parkour = null;
  }
  for (let i = 0; i < S.courses.length; i++) {
    const c = S.courses[i];
    if (c.active && (c !== cur || curD > 16 || G.player.dead || now - c.t0 > MAX_RUN)) cancel(S, c);
  }
  if (!cur || curD > 6 || G.player.dead) return;
  const pk = cur.pk;
  // yaklaşma ipucu (bir kez)
  if (!S.courseHinted.has(cur.id) && curD < 4) {
    S.courseHinted.add(cur.id);
    S.fx.message(pk.tierName + ' parkur: başlangıç plakasına basınca süre başlar; düşersen son kontrol noktasına dönersin.');
  }
  // düşme hasarı yok + yerde olma izi
  const inY = b.y >= pk.minY - 2 && b.y <= pk.maxY + 6;
  if (curD <= 0.5 && inY && b.onGround) cur.lastGroundT = now;
  const onCourse = cur.active || now - cur.lastGroundT < 6;
  if (onCourse && curD <= 4) {
    const cap = b.y + 2.5;
    if (b.fallPeakY > cap) b.fallPeakY = cap;
  }
  // plakalar
  const bx = Math.floor(b.x);
  const by = Math.floor(b.y + 0.02);
  const bz = Math.floor(b.z);
  const onStart = bx === pk.start.x && bz === pk.start.z && by === pk.start.y;
  if (onStart && !cur.onStart) startRun(S, cur);
  cur.onStart = onStart;
  let cpHere = -1;
  for (let i = 0; i < pk.checkpoints.length; i++) {
    const k = pk.checkpoints[i];
    if (bx === k.x && bz === k.z && by === k.y) {
      cpHere = i;
      break;
    }
  }
  if (cpHere !== cur.onCp) {
    cur.onCp = cpHere;
    if (cpHere >= 0) checkpoint(S, cur, cpHere);
  }
  const onEnd = bx === pk.end.x && bz === pk.end.z && by === pk.end.y;
  if (onEnd && !cur.onEnd) {
    if (cur.active) finish(S, cur);
    else if (now - cur.noStartMsgT > 6) {
      cur.noStartMsgT = now;
      S.fx.message('Süre başlamadı: parkura başlangıç plakasından başla. Ödül sandığı yine de açılabilir.');
    }
  }
  cur.onEnd = onEnd;
  // düşüş sıfırlama
  if (onCourse && curD <= 1) {
    const tgt = parkourFallReset(pk, b, cur.lastCp);
    if (tgt && b.y < tgt.y - 0.5 && now - (cur.lastResetT || -99) > 0.4) {
      cur.lastResetT = now;
      G.teleport(tgt.x, tgt.y, tgt.z, { safe: false });
      S.fx.sound('plate', tgt.x, tgt.y + 0.5, tgt.z, 0.7);
      S.fx.particles('magicBurst', tgt.x, tgt.y + 0.8, tgt.z, 0x7ae0ff, { radius: 1.2, scale: 0.7 });
      if (now - cur.resetMsgT > 3) {
        cur.resetMsgT = now;
        S.fx.message('Düştün! Son kontrol noktasına döndün' + (cur.active ? '; süre işliyor.' : '.'));
      }
    }
  }
  // HUD
  if (cur.active) {
    HUD.timer = Math.min(86399, now - cur.t0);
    HUD.checkpoint = cur.lastCp + 1;
    HUD.difficulty = pk.tier;
    G.hud.parkour = HUD;
  } else if (S.parkFinalT > 0 && S.parkFinalCourse === cur) {
    HUD.timer = Math.min(86399, cur.finalMs / 1000);
    HUD.checkpoint = cur.lastCp + 1;
    HUD.difficulty = pk.tier;
    G.hud.parkour = HUD;
  } else if (G.hud.parkour === HUD) {
    G.hud.parkour = null;
  }
}

export const PARKOUR_BLOCKS = [B.PARKOUR_START, B.PARKOUR_CHECKPOINT, B.PARKOUR_END];
