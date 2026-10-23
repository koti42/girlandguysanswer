/*
 * KEŞİF girdi — küçük DOM yardımcıları (input.js'ten ayrıldı: dosya boyutu sınırı).
 * Hepsi enjekte edilen nesnelerle çalışır; modül yüklenirken DOM'a dokunmaz.
 */
import { JOYSTICK_DEFAULTS, TOUCH_BUTTONS, joystickRadius } from './inputMath.js';

/** Birincil işaretleyici dokunmatikse true (telefon/tablet); karma cihazda fare varsayılır, ilk dokunuşta geçilir. */
export function detectTouchDevice(win) {
  try {
    if (!win) return false;
    if (typeof win.matchMedia === 'function') {
      if (win.matchMedia('(pointer: coarse)').matches) return true;
      if (win.matchMedia('(pointer: fine)').matches) return false;
    }
    const nav = win.navigator;
    return Boolean('ontouchstart' in win || (nav && nav.maxTouchPoints > 0));
  } catch {
    return false;
  }
}

/** Ekran yönelimi açısı (0/90/180/270); bilinmiyorsa 0. */
export function screenAngleOf(win) {
  try {
    if (win && win.screen && win.screen.orientation && typeof win.screen.orientation.angle === 'number') return win.screen.orientation.angle;
    if (win && typeof win.orientation === 'number') return win.orientation;
  } catch {
    // yut
  }
  return 0;
}

/** Stil özelliklerini kilitler; restore() eski değerleri geri yükler. */
export function createStyleLock() {
  const backup = [];
  return {
    lock(el, props) {
      if (!el || !el.style) return;
      const prev = {};
      Object.keys(props).forEach((k) => {
        prev[k] = el.style[k];
        el.style[k] = props[k];
      });
      backup.push([el, prev]);
    },
    restore() {
      backup.forEach(([el, prev]) => {
        Object.keys(prev).forEach((k) => {
          el.style[k] = prev[k];
        });
      });
      backup.length = 0;
    },
  };
}

/** React TouchControls için yerleşim ipuçları (bkz. input.getTouchLayoutHints). */
export function buildTouchLayoutHints({ cfg, rect, touchMode, win, sprintLatch, crouchLatch, tapMs, holdMs }) {
  const w = (rect && rect.width) || 640;
  const h = (rect && rect.height) || 360;
  return {
    isTouch: touchMode,
    minTargetPx: 44,
    leftHanded: cfg.leftHanded,
    joystick: {
      side: cfg.leftHanded ? 'right' : 'left',
      zone: cfg.joystickZone,
      radius: joystickRadius(w, h, cfg.joystickScale),
      deadZone: JOYSTICK_DEFAULTS.deadZone,
      sprintRatio: JOYSTICK_DEFAULTS.sprintRatio,
      floating: true,
    },
    look: { side: cfg.leftHanded ? 'left' : 'right', zone: 1 - cfg.joystickZone },
    gestures: { enabled: cfg.touchGestures, tapMs, holdMs },
    gyro: { supported: Boolean(win && typeof win.DeviceOrientationEvent !== 'undefined'), enabled: cfg.gyro },
    crouchToggle: cfg.crouchToggle,
    buttons: TOUCH_BUTTONS,
    state: { sprintLocked: sprintLatch, crouchLocked: crouchLatch },
  };
}
