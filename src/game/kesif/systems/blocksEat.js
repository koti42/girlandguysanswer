/*
 * KEŞİF blok sistemi — yemek/içecek: basılı tutarak yeme animasyonu (G.fpState.eating) ve anında yeme (arayüz).
 *
 *   startEat(G,S) → bool            eldeki yiyeceğe yemeyi başlatır (tok/canı dolu ise ipucu verir)
 *   updateEat(G,S,dt,s)             sabit adım: ilerleme, iptal (eşya değişti, hasar alındı, UI açıldı, tuş bırakıldı)
 *   cancelEat(G,S)                  yemeyi iptal et
 *   eatNow(G,S,slotIndex) → bool    çantadaki yuvadan anında ye (InventoryPanel "Kullan")
 *
 * Sonuç survival.eat ile uygulanır (açlık/can; 'eat' sesi + iyileşme titremesi çekirdekte işlenir), 1 adet tüketilir (yaratıcı modda tüketmez),
 * 'eaten' olayı yayılır (ilerleme/başarım). Dokunmatik ve erişilebilirlik modunda tuş bırakılsa da yeme sürer
 * (bir kez dokunup ilerlemek yeterli); eşya değişimi/hasar iptal eder.
 */
import { canEat, eat } from '../sim/survival.js';
import { ITEMS } from '../sim/items.js';
import { setHint } from './blocksCore.js';

const EAT_TIME = 1.4;
const DRINK_TIME = 1.0;

function foodOf(key) {
  const it = key ? ITEMS[key] : null;
  return it && it.food ? it : null;
}

function refuse(G, S, food) {
  const sv = G.survival;
  const fullHunger = sv.hunger >= sv.maxHunger;
  setHint(G, S, food.hunger > 0 && fullHunger && !(food.heal > 0 && sv.hp < sv.maxHp) ? 'Karnın tok.' : 'Canın zaten dolu.', 1.8);
  G.sound('ui_error', undefined, { vol: 0.4 });
}

export function cancelEat(G, S) {
  const e = S.eat;
  if (e.active) {
    e.active = false;
    e.t = 0;
  }
  if (G.fpState.eating !== -1) G.fpState.eating = -1;
}

export function startEat(G, S) {
  const inv = G.inventory;
  const key = inv ? inv.heldItem() : null;
  const it = foodOf(key);
  if (!it || G.player.dead) return false;
  const e = S.eat;
  if (e.active) return true;
  if (e.needRelease) return false;
  if (!canEat(G.survival, it.food)) {
    refuse(G, S, it.food);
    e.needRelease = true;
    return false;
  }
  e.active = true;
  e.t = 0;
  e.dur = it.drink ? DRINK_TIME : EAT_TIME;
  e.slot = inv.selected;
  e.item = key;
  e.hp0 = G.survival.hp;
  e.chompT = 0.25;
  G.fpState.eating = 0;
  return true;
}

export function eatNow(G, S, slotIndex) {
  const inv = G.inventory;
  const slot = inv ? inv.slotAt(slotIndex) : null;
  const it = slot ? foodOf(slot.item) : null;
  if (!it || G.player.dead) return false;
  if (!canEat(G.survival, it.food)) {
    refuse(G, S, it.food);
    return false;
  }
  const r = eat(G.survival, it.food);
  if (!r.ate) return false;
  if (!inv.infinite) {
    if (slot.count > 1) inv.setSlot(slotIndex, slot.item, slot.count - 1);
    else inv.setSlot(slotIndex, null);
  }
  G.emit({ type: 'eaten', item: it.key });
  G.haptic('light');
  return true;
}

export function updateEat(G, S, dt, s) {
  const e = S.eat;
  if (e.needRelease && !s.placeHeld) e.needRelease = false;
  if (!e.active) return;
  const inv = G.inventory;
  const hold = !!s.placeHeld || !!s.touch || G.accessibility;
  const keep = inv.selected === e.slot && inv.heldItem() === e.item && !G.player.dead;
  const hp = G.survival.hp;
  if (!keep || !hold || hp < e.hp0 - 0.01) {
    cancelEat(G, S);
    return;
  }
  e.hp0 = hp;
  e.t += dt;
  e.chompT -= dt;
  if (e.chompT <= 0) {
    e.chompT = 0.5;
    G.sound(ITEMS[e.item] && ITEMS[e.item].drink ? 'bubble' : 'eat', G.body, { vol: 0.35, pitch: 1.1 });
  }
  if (e.t < e.dur) {
    G.fpState.eating = Math.min(0.999, e.t / e.dur);
    return;
  }
  const slot = e.slot;
  const ok = eatNow(G, S, slot);
  e.active = false;
  e.t = 0;
  e.needRelease = true;
  G.fpState.eating = -1;
  if (ok && G.viewModel && G.viewModel.swing) G.viewModel.swing('use');
}
