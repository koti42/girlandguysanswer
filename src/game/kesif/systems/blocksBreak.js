/*
 * KEŞİF blok sistemi — blok kırma.
 *
 *   updateBreak(G,S,dt,s)                 sabit adım: basılı tutma → ilerleme (breakTime), çatlak, kazma sesi/parçacığı, kırılma
 *   resetBreak(G,S)                       ilerlemeyi ve kol sallamayı sıfırla
 *   destroyBlock(G,S,x,y,z,opts) → bool   bloğu kır: setBlock(0), eşya saçılımı (resolveDrops), sandık içeriği, parçacık, ses, olaylar,
 *                                         bulmaca bildirimi, destek/düşen blok zinciri. opts: {by, heldKey, drops}
 *   breakAllowed(G)                       bu modda/eldeki eşyayla kırma serbest mi
 *
 * Kurallar: harita modunda kırma yok; sistem blokları (sertlik −1: ana kaya, mühür, bulmaca mekanizmaları) ve sıvılar kırılamaz;
 * inşa modunda anında kırılır ve eşya düşmez (sınırsız envanter); macera: breakTime(blok, eldeki alet) (kademe/alet türü), yetersiz
 * alette (örn. elle demir cevheri) çok yavaş ve eşya düşmez; alet dayanıklılığı her kırılan sert blokta 1 (kılıç 2) azalır, bitince kırılır.
 * Yaratık nişandaysa (G.aimEntity) ya da menzilli silah/kalkan elde iken kırılmaz (saldırı/atış mobs sisteminindir).
 */
import { BLOCKS, breakTime, resolveDrops } from '../sim/blocks.js';
import { ITEMS } from '../sim/items.js';
import {
  BREAK_GRACE, HOLD_REPEAT, centerOf, deny, isReadOnly, rngNext, soundFor, spawnDrops,
} from './blocksCore.js';
import { takeChestContents } from './blocksChest.js';
import { afterRemoval } from './blocksSupport.js';
import { onBlockBrokenWithTool } from '../sim/techMods.js';

const DIG_INTERVAL = 0.26;
const DUST_INTERVAL = 0.14;

export function breakAllowed(G) {
  if (isReadOnly(G)) return false;
  if (G.aimEntity || (G.combatClaim && G.combatClaim.attack)) return false;
  if (G.player.blocking) return false;
  const key = G.inventory ? G.inventory.heldItem() : null;
  if (key) {
    const it = ITEMS[key];
    if (it && ((it.weapon && it.weapon.ranged) || it.shield)) return false;
  }
  return true;
}

function stopSwing(G, S) {
  G.fpState.breaking = false;
  if (G.charAction === S.charMine) G.charAction = null;
}

export function resetBreak(G, S) {
  const b = S.brk;
  b.active = false;
  b.progress = 0;
  b.idle = 0;
  b.switchT = 0;
  stopSwing(G, S);
}

function wearTool(G, rec, held) {
  const inv = G.inventory;
  if (!held || held.dur === undefined || inv.infinite) return;
  const it = ITEMS[held.item];
  if (!it || (!it.tool && !it.weapon) || rec.hardness <= 0) return;
  const name = it.name;
  const broke = inv.damageHeld(it.kind === 'silah' ? 2 : 1);
  if (broke) {
    G.sound('break:metal', undefined, { vol: 0.7 });
    G.haptic('medium');
    G.speak(name + ' kırıldı.');
  }
}

/** Mıknatıs büyüsü: düşecek eşyaları doğrudan çantaya koyar; sığmayanı döner (yere düşer). */
function magnetPickup(G, list) {
  const inv = G.inventory;
  if (!inv) return list;
  const rest = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const left = inv.addStack(d.item, d.count, d.dur, d.ench, d.charge);
    if (left < d.count) {
      G.sound('pickup', G.body, { vol: 0.5, pitch: 1.1 });
      G.emit({ type: 'itemPickedUp', item: d.item, count: d.count - left });
    }
    if (left > 0) rest.push(Object.assign({}, d, { count: left }));
  }
  return rest;
}

/**
 * Bloğu kırar (oyuncu, destek zinciri ve betikler için ortak yol). Dönüş: kırıldı mı.
 * opts: {by:'player'|'script'|…, heldKey, drops:boolean, silent:boolean}
 */
export function destroyBlock(G, S, x, y, z, opts) {
  const o = opts || {};
  const world = G.world;
  const id = world.getBlock(x, y, z);
  if (!id) return false;
  const rec = BLOCKS[id];
  if (!rec || rec.unbreakable) return false;
  const heldKey = o.heldKey !== undefined ? o.heldKey : (G.inventory ? G.inventory.heldItem() : null);
  if (!world.setBlock(x, y, z, 0)) return false;
  const by = o.by || 'player';
  let restored = false;
  if (by === 'player' && G.puzzles && typeof G.puzzles.handleInteract === 'function') {
    G.puzzles.handleInteract({
      type: 'blockBroken', x, y, z, id, item: heldKey || undefined, playerId: 'player',
    });
    const now = world.getBlock(x, y, z);
    restored = now !== 0 && now !== null; // bulmaca bloğu geri koydu (ör. terazi gösterge bloğu)
  }
  let list = [];
  if (!restored) {
    const chest = rec.interact === 'sandık' || rec.interact === 'ödül_sandığı';
    const contents = chest ? takeChestContents(G, x, y, z) : null;
    // büyü (Servet / İpek Dokunuş): yalnız oyuncunun kırışında eldeki eşyanın büyüleri uygulanır
    const mods = by === 'player' && G.mode === 'macera' ? G.mods : undefined;
    if (o.drops !== false && G.mode !== 'insa') list = resolveDrops(id, () => rngNext(G, S), heldKey, mods);
    if (contents && contents.length > 0) list = list.concat(contents);
  }
  centerOf(S.pos, x, y, z);
  if (list.length > 0 && by === 'player' && G.mods && G.mods.magnet && G.mode === 'macera') list = magnetPickup(G, list); // Mıknatıs: doğrudan çantaya
  if (list.length > 0) spawnDrops(G, S, list, S.pos.x, S.pos.y - 0.1, S.pos.z);
  if (!o.silent) {
    if (G.particles && G.particles.blockBreak) G.particles.blockBreak(id, S.pos, 1);
    G.sound(soundFor('break', id), S.pos, { vol: 1 });
    G.haptic('light');
  }
  G.emit({
    type: 'blockBroken', x, y, z, id, by, item: heldKey || null,
  });
  afterRemoval(G, S, x, y, z);
  return true;
}

export function updateBreak(G, S, dt, s) {
  const b = S.brk;
  const fp = G.fpState;
  b.cool -= dt;
  if (b.unbreakableT > 0) b.unbreakableT -= dt;
  const edge = !!s.attackPressed;
  const want = (!!s.breakHeld || edge) && breakAllowed(G);
  if (!want) {
    stopSwing(G, S);
    if (b.active) {
      b.idle += dt;
      if (b.idle > BREAK_GRACE) resetBreak(G, S);
    }
    return;
  }
  fp.breaking = true;
  if (!G.charAction || G.charAction === S.charMine) {
    S.charMine.progress = b.progress;
    G.charAction = S.charMine;
  }
  if (!S.has) {
    if (b.active) {
      b.idle += dt;
      if (b.idle > BREAK_GRACE) {
        b.active = false;
        b.progress = 0;
      }
    }
    return;
  }
  const t = S.target;
  const id = t.id;
  const rec = BLOCKS[id];
  if (!rec) return;
  if (rec.unbreakable) {
    b.active = false;
    b.progress = 0;
    if (edge && b.unbreakableT <= 0) {
      deny(G, S, 'system', 'Bu blok kırılamaz.', 1.6);
      b.unbreakableT = 0.7;
    }
    return;
  }
  if (!edge && b.cool > 0) return; // bir blok kırıldıktan sonra kısa bekleme
  const same = b.active && b.x === t.x && b.y === t.y && b.z === t.z;
  if (!same) {
    if (b.active) {
      b.switchT += dt;
      if (b.switchT < BREAK_GRACE) return; // aniden başka bloğa kayma: ilerleme kısa süre korunur
    }
    b.x = t.x; b.y = t.y; b.z = t.z; b.id = id;
    b.active = true;
    b.progress = 0;
    b.digT = 0;
    b.dustT = 0;
  }
  b.switchT = 0;
  b.idle = 0;
  const inv = G.inventory;
  const held = inv ? inv.held() : null;
  const heldKey = held ? held.item : null;
  const total = G.mode === 'insa' ? 0 : breakTime(id, heldKey, G.mode === 'macera' ? G.mods : undefined);
  b.total = total;
  if (total > 0) {
    b.progress += dt / total;
    b.digT -= dt;
    if (b.digT <= 0) {
      b.digT = DIG_INTERVAL;
      centerOf(S.pos, t.x, t.y, t.z);
      G.sound(soundFor('dig', id), S.pos, { vol: 0.8 });
    }
    b.dustT -= dt;
    if (b.dustT <= 0 && G.particles && G.particles.blockDust) {
      b.dustT = DUST_INTERVAL;
      S.pos2.x = t.point.x; S.pos2.y = t.point.y; S.pos2.z = t.point.z;
      S.normal[0] = t.face.nx; S.normal[1] = t.face.ny; S.normal[2] = t.face.nz;
      G.particles.blockDust(id, S.pos2, S.normal);
    }
    if (b.progress < 1) return;
  }
  // kırıldı
  const ok = destroyBlock(G, S, t.x, t.y, t.z, { by: 'player', heldKey });
  b.active = false;
  b.progress = 0;
  b.cool = HOLD_REPEAT;
  if (ok) {
    wearTool(G, rec, held);
    // elektrikli alet: kırılan her sert blokta şarj harcar (şarjsızken yavaş kazar: mods.digMul); şarj bitince ipucu
    if (G.mode === 'macera' && rec.hardness > 0 && onBlockBrokenWithTool(inv)) afterElectricUse(G, inv);
  }
}

/** Elektrikli aletin şarjı bittiyse (bir kez) bildirir. */
function afterElectricUse(G, inv) {
  const h = inv.held();
  if (h && !(h.charge > 0)) {
    G.sound('ui_error', undefined, { vol: 0.4 });
    G.speak('Aletin şarjı bitti. Pil Bankası ya da Şarj İstasyonunda doldur.');
    if (typeof G.hint === 'function') G.hint('Aletin şarjı bitti: Pil Bankası ya da Şarj İstasyonuna sağ tıkla.', { ttl: 4000, priority: 3, key: 'tech:toolEmpty', cooldown: 20000 });
  }
}
