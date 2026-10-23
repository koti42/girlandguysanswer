/*
 * KEŞİF content sistemi — BOSS KAPILARI, ARENALAR ve ZAFER.
 *
 *   - Boss arenası kaydedilince G.arenas'a {id, zone, key, name, x,y,z, r, entrance, door, rewardDoor, chest, unlocked, done} eklenir
 *     (unlocked: mühür tamamlandı → büyük kapı açık; done: boss yenildi). Mobs sistemi boss'u doğurur; burada kapılar yönetilir.
 *   - 'bossDoor' (mühür tamamlanınca progression üretir): boss.door.cells (BOSS_DOOR) ~2,5 sn gürleyerek açılır.
 *   - 'bossDefeated': arka kasa kapısı (boss.rewardDoor.cells) açılır, şok dalgası/kutlama, arena done.
 *   - Kapalı kapıya sağ tık: kalan kristal sayısıyla ipucu.
 *   - 'victory' (Gölge Hükümdar): kutlama sonrası hud.ui = 'victory' (oyun duraklar, devam/çıkış ekranı).
 *   Kayıttan yükleme: yapı kaydedilince açık kapılar ilerlemeden yeniden kurulur.
 *
 *   initBoss(S)  fixedBoss(S, dt)  onBossEvent(S, evt)  bossArena(S, zone)
 */
import { B } from '../sim/blocks.js';
import { startOpenAnim } from './contentAnim.js';
import { directionText } from './contentGuide.js';

const VICTORY_DELAY = 3.2;

export function bossArena(S, zone) {
  const e = S.arenaByZone.get(zone);
  return e ? e.arena : null;
}

export function initBoss(S) {
  S.arenaByZone = new Map();
  S.doorCells = new Map();
  S.useInterest[B.BOSS_DOOR] = true;
  S.useHandlers.push(useBossDoor);
  S.hooks.add.push(onAdd);
  S.hooks.remove.push(onRemove);
}

function ck(c) {
  return c.x + ',' + c.y + ',' + c.z;
}

function onAdd(S, rec) {
  const boss = rec.def.boss;
  if (!boss) return;
  const G = S.G;
  const p = G.progression;
  const arena = {
    id: rec.id,
    zone: boss.zone,
    key: boss.key,
    name: boss.name,
    x: boss.x,
    y: boss.y,
    z: boss.z,
    r: boss.radius,
    entrance: boss.entrance,
    door: boss.door,
    rewardDoor: boss.rewardDoor,
    chest: boss.chest,
    unlocked: !!(p && p.bossDoors[boss.zone]),
    done: !!(p && p.bossesDefeated[boss.zone]),
  };
  const entry = { rec, arena, doorOpen: false, rewardOpen: false };
  S.arenaByZone.set(boss.zone, entry);
  G.arenas.push(arena);
  boss.door.cells.forEach((c) => S.doorCells.set(ck(c), { zone: boss.zone, kind: 'door' }));
  boss.rewardDoor.cells.forEach((c) => S.doorCells.set(ck(c), { zone: boss.zone, kind: 'reward' }));
  if (arena.unlocked) openCells(S, entry, 'door', true);
  if (arena.done) openCells(S, entry, 'reward', true);
}

function onRemove(S, rec) {
  const boss = rec.def.boss;
  if (!boss) return;
  const G = S.G;
  const e = S.arenaByZone.get(boss.zone);
  if (e && e.rec === rec) S.arenaByZone.delete(boss.zone);
  const i = G.arenas.findIndex((a) => a.id === rec.id);
  if (i >= 0) G.arenas.splice(i, 1);
  boss.door.cells.forEach((c) => S.doorCells.delete(ck(c)));
  boss.rewardDoor.cells.forEach((c) => S.doorCells.delete(ck(c)));
}

function openCells(S, entry, which, instant) {
  const boss = entry.rec.def.boss;
  const spec = which === 'door' ? boss.door : boss.rewardDoor;
  if (which === 'door') entry.doorOpen = true;
  else entry.rewardOpen = true;
  if (instant) {
    const G = S.G;
    for (let i = 0; i < spec.cells.length; i++) {
      const c = spec.cells[i];
      const cur = G.world.getBlock(c.x, c.y, c.z);
      if (cur === null) G.world.applyEdits([[c.x, c.y, c.z, 0]]);
      else if (cur === spec.id) G.world.setBlock(c.x, c.y, c.z, 0);
    }
    return;
  }
  startOpenAnim(S, spec.cells, {
    expect: spec.id, seconds: which === 'door' ? 2.6 : 1.8, sound: 'door', pitch: 0.5,
  });
}

function useBossDoor(S, x, y, z, id) {
  if (id !== B.BOSS_DOOR) return false;
  const info = S.doorCells.get(x + ',' + y + ',' + z);
  if (!info) return false;
  const p = S.G.progression;
  if (!p || !p.active) return false;
  const zone = info.zone;
  S.fx.sound('puzzle_wrong', x + 0.5, y + 0.5, z + 0.5);
  if (info.kind === 'reward') {
    S.fx.message('Arka kasa mühürlü: önce ' + (S.arenaByZone.get(zone) ? S.arenaByZone.get(zone).arena.name : 'bölgenin boss') + '\'u yen.');
    return true;
  }
  const seal = p.sealProgress(zone);
  if (seal && !seal.done) {
    const dir = directionText(S, 'muhursunagi', zone, null);
    S.fx.message('Boss kapısı mühürlü. Mühür açılmadan geçemezsin: ' + seal.placed + '/' + seal.required + ' kristal yerleşti.'
      + (dir ? ' Mühür Kulesi: ' + dir + '.' : ''));
  } else {
    S.fx.message('Kapı açılıyor...');
  }
  return true;
}

export function onBossEvent(S, evt) {
  const G = S.G;
  if (evt.type === 'bossDoor') {
    const e = S.arenaByZone.get(evt.zone);
    if (e) {
      e.arena.unlocked = true;
      if (!e.doorOpen) openCells(S, e, 'door', false);
    }
    const dir = directionText(S, 'bossarena', evt.zone, null);
    S.fx.message('Boss kapısı çözüldü!' + (dir ? ' ' + (e ? e.arena.name : 'Boss') + ' Arenası: ' + dir + '.' : '') + ' Zırhını kuşan ve hazırlan.', { speak: true });
  } else if (evt.type === 'bossDefeated') {
    const zone = Number.isInteger(evt.zone) ? evt.zone : -1;
    const e = S.arenaByZone.get(zone);
    if (e) {
      e.arena.done = true;
      if (!e.rewardOpen) openCells(S, e, 'reward', false);
    }
    const x = Number.isFinite(evt.x) ? evt.x : G.body.x;
    const y = Number.isFinite(evt.y) ? evt.y : G.body.y;
    const z = Number.isFinite(evt.z) ? evt.z : G.body.z;
    S.fx.particles('bossShockwave', x, y + 0.3, z, 0xffd24a, { radius: 9 });
    S.fx.particles('levelUp', x, y + 1.2, z, 0xffd24a, { multi: true });
    S.fx.sound('achievement', x, y + 1, z);
    G.haptic('success');
    const nm = evt.name || (e ? e.arena.name : 'Boss');
    S.fx.message(nm + ' yenildi!' + (e ? ' Arka kasanın kapısı açıldı: ödül sandığını al.' : ''), { speak: true });
    S.version++;
  } else if (evt.type === 'victory') {
    S.victoryT = VICTORY_DELAY;
    S.fx.message('Dünya fethedildi!', { speak: true });
  }
}

export function fixedBoss(S, dt) {
  if (S.victoryT >= 0) {
    if (S.victoryT > 0) S.victoryT = Math.max(0, S.victoryT - dt);
    if (S.victoryT === 0) {
      // Panel açıkken (envanter/üret/sandık) ya da ölüyken ekran kaybolmasın: boşalana kadar bekle (zafer yalnız bir kez yayılır).
      if (S.G.ui === 'none' && !S.G.player.dead) {
        S.victoryT = -1;
        S.G.setUi('victory');
      }
    }
  }
}
