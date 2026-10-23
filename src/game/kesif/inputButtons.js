/*
 * KEŞİF girdi — ekran düğmeleri (React TouchControls `pressButton(name, down)` çağırır).
 * input.js'ten ayrıldı (dosya boyutu sınırı); durum nesneleri input.js ile paylaşılır.
 */
import { touchButtonDef } from './inputMath.js';

// Panel açıkken de geçen düğme/olaylar (E ile envanteri kapatmak, Esc ile duraklatmak için).
export const UI_PASS = new Set(['inventory', 'craft', 'map', 'pause']);

/**
 * deps: { getCfg, hold, pend, latch:{crouch,sprint}, emit, haptic, gesture, isActive, isGameplay, isDisposed, jumpTap, now }
 * Dönen fonksiyon düğmeyi kabul ettiyse true, bilinmeyen/engelli ise false verir.
 */
export function createButtonPress(deps) {
  const { getCfg, hold, pend, latch, emit, haptic, gesture, isActive, isGameplay, isDisposed, jumpTap, now } = deps;

  return function pressButton(name, isDown = true) {
    // sürüş düğmeleri (vhandbrake, vnitro, vcamera, vhorn, vradio, vreset): inputVehicle.js
    if (deps.vehicle && deps.vehicle.press(name, isDown)) {
      if (isDown) {
        gesture();
        haptic('selection');
      }
      return true;
    }
    const def = touchButtonDef(name);
    if (!def || isDisposed()) return false;
    const cfg = getCfg();
    if (!isDown) {
      // Bırakmalar her zaman işlenir.
      if (name === 'jump') hold.jump = false;
      else if (name === 'break') hold.break = false;
      else if (name === 'place') hold.place = false;
      else if (name === 'crouch' && !cfg.crouchToggle) hold.crouch = false;
      else if (name === 'sprint') hold.sprint = false;
      return true;
    }
    if (!isActive()) return false;
    if (!isGameplay() && !UI_PASS.has(name)) return false;
    gesture();
    haptic(def.kind === 'hold' ? 'light' : 'selection');
    switch (name) {
      case 'jump':
        hold.jump = true;
        pend.jump = true;
        if (cfg.flyDoubleTap && jumpTap.tap(now())) emit('fly');
        break;
      case 'break':
        hold.break = true;
        pend.attack = true;
        break;
      case 'place':
        hold.place = true;
        pend.place = true;
        break;
      case 'interact':
        pend.interact = true;
        break;
      case 'crouch':
        if (cfg.crouchToggle) latch.crouch = !latch.crouch;
        else hold.crouch = true;
        break;
      case 'crouchToggle':
        latch.crouch = !latch.crouch;
        break;
      case 'sprint':
        hold.sprint = true;
        break;
      case 'sprintToggle':
        latch.sprint = !latch.sprint;
        break;
      case 'hotbarPrev':
        emit('hotbarDelta', { delta: -1 });
        break;
      case 'hotbarNext':
        emit('hotbarDelta', { delta: 1 });
        break;
      default: {
        const m = /^hotbar([1-9])$/.exec(name);
        if (m) emit('hotbarSet', { index: Number(m[1]) - 1 });
        else if (/^ability[1-4]$/.test(name)) emit(name, { n: Number(name.slice(7)) });
        else emit(name);
      }
    }
    return true;
  };
}
