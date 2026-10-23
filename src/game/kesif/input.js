/*
 * KEŞİF — girdi katmanı: masaüstü (pointer lock, WASD, fare), dokunmatik (yüzen joystick, sağ yarı bakış,
 * ekran düğmeleri, jiroskop) ve oyun kolu; hepsi tek eylem soyutlamasına iner.
 *
 *   const input = createKesifInput({ container, canvas, controls, settings, callbacks, isActive });
 *   // her karede:
 *   const s = input.getState();        // AYNI nesne yeniden kullanılır; tüketilen alanlar (look*, *Pressed) sıfırlanır
 *   for (const ev of input.consumeEvents()) ...   // { type:'inventory'|'craft'|'hotbarSet'|'hotbarDelta'|'camera'|'fly'
 *                                                  //   |'pause'|'drop'|'map'|'ability1'..'ability4', index?, delta?, n? }
 *
 * Eksenler: moveX +1 sağ, moveZ +1 İLERİ; lookDX + = sağa dön, lookDY + = yukarı bak (radyan, kareye ait,
 * hassasiyet+invertY uygulanmış). `jumpPressed/attackPressed/placePressed/interactPressed` son getState'ten
 * beri basıldı (kenar); `jump/crouch/sprint/breakHeld/placeHeld` basılı tutuluyor. Sağ tık / yerleştir düğmesi
 * hem "yerleştir" hem "kullan"dır (hedef bloğa göre motor seçer); F / "Etkileş" ayrı `interactPressed`.
 *
 * callbacks (hepsi isteğe bağlı): onGesture() ses kilidi için her kullanıcı jestinde, onHaptic(style),
 * onLockChange(locked), onControlsChange(isTouch), onTouchView(view) joystick görünümü değişince.
 *
 * isActive(): oturum canlıysa true (false iken hiçbir olay işlenmez, tarayıcı varsayılanı bastırılmaz).
 * setGameplayEnabled(false): UI paneli açıkken hareket/bakış/eylem kapanır; yalnız envanter/üret/harita/duraklat
 * olayları akar (E ile paneli kapatabilmek için).
 */
import {
  MOUSE_RAD_PER_PX,
  TOUCH_RAD_PER_PX,
  JOYSTICK_DEFAULTS,
  createDoubleTap,
  createEventQueue,
  createGamepadState,
  createGyroLook,
  createJoystick,
  createLookSmoother,
  createTapGesture,
  filterMouseDelta,
  isEditableTarget,
  isInteractiveTarget,
  joystickRadius,
  keyToAction,
  keyboardAxes,
  isModifierSafeCode,
  normalizeInputSettings,
  pickGamepad,
  pollGamepad,
  requestGyroPermission,
  shouldPreventKey,
  touchLookGain,
  touchZoneFor,
  wheelSteps,
  HELD_ACTION_CODES,
} from './inputMath.js';
import { UI_PASS, createButtonPress } from './inputButtons.js';
import { createVehicleInput } from './inputVehicle.js';
import { buildTouchLayoutHints, createStyleLock, detectTouchDevice, screenAngleOf } from './inputDom.js';

export { detectTouchDevice };
export {
  aimAssist,
  requestGyroPermission,
  normalizeInputSettings,
  DEFAULT_INPUT_SETTINGS,
  TOUCH_BUTTONS,
  keyToAction,
  deviceLookAngles,
} from './inputMath.js';

const HELD_ACTIONS = Object.keys(HELD_ACTION_CODES);
const TAP_MS = 230;
const HOLD_MS = 380;
const HAPTIC_GAP_MS = 45;

const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function createKesifInput({
  container,
  canvas,
  controls = 'auto',
  settings,
  callbacks = {},
  isActive = () => true,
  now: nowFn = defaultNow,
  getGamepads,
  win: winIn,
} = {}) {
  if (!container || typeof container.addEventListener !== 'function') throw new TypeError('createKesifInput: container gerekli');
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : null);
  const win = winIn || (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
  const surface = canvas || container;
  const cb = callbacks || {};

  let cfg = normalizeInputSettings(settings);
  let touchMode = controls === 'touch' || (controls !== 'desktop' && detectTouchDevice(win));
  let disposed = false;
  let gameplay = true;
  let lastFrame = -1;

  const queue = createEventQueue();
  const emit = (type, extra) => queue.push(extra ? { type, ...extra } : { type }, nowFn());

  /* ---- Çıktı: her çağrıda yeniden kullanılan anlık görüntü ---- */
  const state = {
    moveX: 0,
    moveZ: 0,
    lookDX: 0,
    lookDY: 0,
    jump: false,
    jumpPressed: false,
    crouch: false,
    sprint: false,
    breakHeld: false,
    placeHeld: false,
    attackPressed: false,
    placePressed: false,
    interactPressed: false,
    aimAssist: 0,
    usingGamepad: false,
    touch: touchMode,
    locked: false,
    gyro: false,
    vehicle: null,
  };

  /* ---- Klavye ---- */
  const codesDown = new Set();
  const down = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, crouch: false };
  const kbAxes = { x: 0, z: 0 };
  const jumpTap = createDoubleTap();

  function recomputeDown() {
    for (let i = 0; i < HELD_ACTIONS.length; i++) {
      const a = HELD_ACTIONS[i];
      const codes = HELD_ACTION_CODES[a];
      let on = false;
      for (let j = 0; j < codes.length; j++) if (codesDown.has(codes[j])) on = true;
      down[a] = on;
    }
  }

  /* ---- Ekran düğmeleri / fare / jest ---- */
  const hold = { jump: false, break: false, place: false, crouch: false, sprint: false };
  const latch = { crouch: false, sprint: false };
  let mouseBreak = false;
  let mousePlace = false;
  let mouseDX = 0;
  let mouseDY = 0;
  let wheelAcc = 0;
  let gestureBreak = false;
  const pend = { jump: false, attack: false, place: false, interact: false };

  /* ---- Dokunmatik ---- */
  const joystick = createJoystick({ ...JOYSTICK_DEFAULTS });
  const smoother = createLookSmoother(cfg.lookSmoothing);
  const tap = createTapGesture({ tapMs: TAP_MS, holdMs: HOLD_MS, slop: 12 });
  const view = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, radius: 56, sprint: false, x: 0, y: 0 };
  const lookTmp = { x: 0, y: 0 };
  let lookId = null;
  let lastX = 0;
  let lastY = 0;
  let lastT = 0;
  let portrait = false;

  /* ---- Oyun kolu ---- */
  const gpState = createGamepadState();
  const gpOut = {};
  let gpAt = -Infinity;
  let padsSeen = typeof getGamepads === 'function';

  /* ---- Jiroskop ---- */
  const gyro = createGyroLook();
  let gyroOn = false;

  /* ---- Pointer lock ---- */
  let expectedUnlock = false;
  let wasLocked = false;
  let lastHaptic = -Infinity;

  const listeners = [];
  function on(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    listeners.push([target, type, fn, opts]);
  }

  function haptic(style) {
    if (!cfg.haptics || !cb.onHaptic) return;
    const t = nowFn();
    if (t - lastHaptic < HAPTIC_GAP_MS) return;
    lastHaptic = t;
    try {
      cb.onHaptic(style);
    } catch {
      // Titreşim hatası oyunu durdurmamalı.
    }
  }

  function gesture() {
    if (cb.onGesture) {
      try {
        cb.onGesture();
      } catch {
        // Ses kilidi hatası girdiyi engellemesin.
      }
    }
  }

  const live = () => !disposed && isActive();
  const rectOf = () => container.getBoundingClientRect();

  /* ---- Sürüş kipi (vehicle_ui, inputVehicle.js): G.player.vehicle iken klavye/dokunmatik/kol → state.vehicle; yürüme eylemleri bastırılır ---- */
  const veh = createVehicleInput({
    onEvent: (type, extra) => emit(type, extra),
    haptic: (st) => haptic(st),
    getTelemetry: cb.getDriveTelemetry,
    isTouch: () => touchMode,
    reducedMotion: cb.isReducedMotion,
  });
  const gpEmit = (type, extra) => {
    if (!veh.mapPadEvent(type, extra)) emit(type, extra);
  };
  let lastPad = null;
  const vkeys = { forward: false, back: false, left: false, right: false, jump: false, sprint: false };

  function pushView() {
    const j = joystick.state;
    view.active = j.active;
    view.baseX = j.baseX;
    view.baseY = j.baseY;
    view.knobX = j.knobX;
    view.knobY = j.knobY;
    view.radius = j.radius;
    view.sprint = j.sprint;
    view.x = j.x;
    view.y = j.y;
    if (cb.onTouchView) {
      try {
        cb.onTouchView(view);
      } catch {
        // Görünüm geri çağrısı hatası yutulur.
      }
    }
  }

  // ---- Pointer lock ----
  // Otomasyon tarayıcıları (puppeteer/selenium: navigator.webdriver) gerçek imleç kilidi İSTEMEZ: Windows'ta
  // gizli pencerenin dikdörtgenine geliştiricinin GERÇEK fare imlecini hapseder. Orada kilit oyun içinde taklit edilir.
  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  let fakeLock = false;
  const lockEl = () => (doc ? doc.pointerLockElement : null);
  const isLocked = () => fakeLock || (Boolean(lockEl()) && (lockEl() === surface || lockEl() === container));
  const canLock = () => !touchMode && typeof surface.requestPointerLock === 'function';

  function requestPointerLock() {
    if (disposed || !canLock()) return false;
    if (isLocked()) return true;
    if (automated) {
      fakeLock = true;
      onLockChange();
      return true;
    }
    const retryPlain = () => {
      try {
        const q = surface.requestPointerLock();
        if (q && typeof q.catch === 'function') q.catch(() => {});
      } catch {
        // Kilit reddedildi (kullanıcı jesti yok / Esc'ten hemen sonra); sonraki tıklamada yeniden denenir.
      }
    };
    try {
      const p = surface.requestPointerLock(cfg.rawInput ? { unadjustedMovement: true } : undefined);
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // unadjustedMovement desteklenmiyorsa (bazı platformlar) normal kilitle dene.
          if (cfg.rawInput && !disposed && !isLocked()) retryPlain();
        });
      }
    } catch {
      retryPlain();
    }
    return true;
  }

  function releasePointerLock() {
    if (!doc || !isLocked()) return false;
    if (fakeLock) {
      fakeLock = false;
      expectedUnlock = true;
      onLockChange();
      return true;
    }
    expectedUnlock = true;
    try {
      doc.exitPointerLock();
    } catch {
      expectedUnlock = false;
    }
    return true;
  }

  function onLockChange() {
    const locked = isLocked();
    state.locked = locked;
    if (locked) {
      mouseDX = 0;
      mouseDY = 0;
    } else {
      releaseMouse();
      if (expectedUnlock) expectedUnlock = false;
      else if (wasLocked && gameplay && live()) emit('pause', { source: 'lock' });
    }
    wasLocked = locked;
    if (cb.onLockChange) {
      try {
        cb.onLockChange(locked);
      } catch {
        // yut
      }
    }
  }

  // ---- Klavye ----
  function onKeyDown(e) {
    if (!live()) return;
    const code = e.code;
    // Esc'i bir panel/pencere zaten işlediyse (PanelShell: preventDefault + kapat) motor ikinci kez 'duraklat' üretmez.
    if (code === 'Escape' && e.defaultPrevented) return;
    const act = keyToAction(code);
    const vk = veh.handlesKey(code);
    if (!act && !vk) return;
    if (isEditableTarget(e.target)) return;
    if ((e.altKey || e.metaKey || e.ctrlKey) && !isModifierSafeCode(code)) return;
    const locked = isLocked();
    // Odaktaki düğmede Space/Enter düğmenin kendisine ait (pointer lock yokken).
    if (!locked && act && act.kind === 'held' && act.action === 'jump' && isInteractiveTarget(e.target)) return;

    if (!gameplay) {
      // Panel açıkken yalnız panel olayları; Tab odak gezintisi için serbest bırakılır.
      if (!act || code === 'Tab' || act.kind !== 'press' || !UI_PASS.has(act.action)) return;
      gesture();
      if (!e.repeat) emit(act.action);
      if (code !== 'Escape' && shouldPreventKey(code) && !isInteractiveTarget(e.target)) e.preventDefault();
      return;
    }

    gesture();
    if (vk) {
      if (!e.repeat) veh.keyDown(code);
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (shouldPreventKey(code) && code !== 'Escape') e.preventDefault();
    if (e.repeat) {
      // Panel/duraklatma kapanırken tuş hâlâ basılıysa (releaseAll sildi): otomatik tekrar tuşu yeniden 'basılı' yapar; kenar olayı üretmez.
      if (act.kind === 'held' && !codesDown.has(code)) {
        codesDown.add(code);
        recomputeDown();
      }
      return;
    }

    if (act.kind === 'held') {
      codesDown.add(code);
      recomputeDown();
      if (act.action === 'jump') {
        pend.jump = true;
        if (cfg.flyDoubleTap && jumpTap.tap(nowFn())) emit('fly');
      }
    } else if (act.kind === 'hotbar') {
      emit('hotbarSet', { index: act.index });
    } else if (act.action === 'interact') {
      pend.interact = true;
    } else if (/^ability[1-4]$/.test(act.action)) {
      emit(act.action, { n: Number(act.action.slice(7)) });
    } else {
      emit(act.action);
    }
  }

  function onKeyUp(e) {
    // Etkin olmasa da bırakma işlenir: takılı tuş kalmasın.
    if (codesDown.delete(e.code)) recomputeDown();
  }

  // ---- Fare (masaüstü) ----
  const dragging = () => mouseBreak || mousePlace;

  function releaseMouse() {
    mouseBreak = false;
    mousePlace = false;
  }

  function onMouseDown(e) {
    if (touchMode || !live()) return;
    if (!isLocked() && isInteractiveTarget(e.target)) return;
    gesture();
    if (!isLocked()) {
      // Tıklama yalnızca yakalar; saldırı/yerleştirme sayılmaz.
      if (canLock()) {
        if (e.button === 0 && gameplay) requestPointerLock();
        return;
      }
    }
    if (!gameplay || veh.active) return;
    if (e.button === 0) {
      mouseBreak = true;
      pend.attack = true;
    } else if (e.button === 2) {
      mousePlace = true;
      pend.place = true;
    } else {
      return;
    }
    if (e.cancelable) e.preventDefault();
  }

  function onMouseUp(e) {
    if (e.button === 0) mouseBreak = false;
    else if (e.button === 2) mousePlace = false;
  }

  function onMouseMove(e) {
    if (touchMode || !gameplay || !live()) return;
    if (!isLocked() && !(canLock() === false && dragging())) return;
    mouseDX += filterMouseDelta(e.movementX);
    mouseDY += filterMouseDelta(e.movementY);
  }

  function onWheel(e) {
    if (touchMode || !live()) return;
    if (isInteractiveTarget(e.target)) return;
    if (!gameplay) return;
    if (veh.active) {
      if (e.cancelable) e.preventDefault();
      return;
    }
    const r = wheelSteps(wheelAcc, e.deltaY, e.deltaMode);
    wheelAcc = r.acc;
    for (let i = 0; i < Math.abs(r.steps); i++) emit('hotbarDelta', { delta: r.steps > 0 ? 1 : -1 });
    if (e.cancelable) e.preventDefault();
  }

  function onContextMenu(e) {
    if (live() && e.cancelable && !isInteractiveTarget(e.target)) e.preventDefault();
  }

  // ---- Dokunmatik ----
  function setTouchMode(on) {
    if (touchMode === on) return;
    touchMode = on;
    state.touch = on;
    if (on) {
      releaseMouse();
      releasePointerLock();
    }
    if (cb.onControlsChange) {
      try {
        cb.onControlsChange(on);
      } catch {
        // yut
      }
    }
  }

  function localPoint(e, rect) {
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function endJoystick() {
    if (!joystick.state.active) return;
    joystick.end();
    pushView();
  }

  /*
   * Dokunuş olayının GERÇEK zamanı. Ana iş parçacığı bir karede takılırsa (chunk yükleme, GC) pointerdown/up
   * kuyrukta bekler ve işlendikleri an arasındaki fark gerçek basış süresinden uzun olur: kısa dokunuş
   * "yerleştir" yerine kaybolur ya da "kır"a dönerdi. Süre olayın kendi zaman damgasından hesaplanır
   * (yalnız varsayılan saatte: sahte `now` verilen testlerde zaman ölçeği farklıdır).
   */
  const eventClock = nowFn === defaultNow;
  function evTime(e) {
    const n = nowFn();
    if (!eventClock) return n;
    const ts = e && typeof e.timeStamp === 'number' ? e.timeStamp : 0;
    return ts > 0 && ts <= n && n - ts < 3000 ? ts : n;
  }

  function endLook(cancel, t = nowFn()) {
    if (lookId === null) return;
    lookId = null;
    const res = cancel ? tap.cancel() : tap.end(t);
    if (res === 'tap') {
      pend.place = true;
      haptic('light');
    } else if (res === 'holdEnd') {
      gestureBreak = false;
    }
  }

  function cancelTouches() {
    endJoystick();
    endLook(true);
    gestureBreak = false;
  }

  function onPointerDown(e) {
    if (disposed) return;
    const touchLike = e.pointerType !== 'mouse';
    if (!touchMode) {
      if (!touchLike || controls !== 'auto') return;
      setTouchMode(true);
    }
    gesture();
    if (!live() || !gameplay || veh.active) return;
    if (isInteractiveTarget(e.target)) return;
    const rect = rectOf();
    const p = localPoint(e, rect);
    const zone = touchZoneFor(p.x, rect.width, cfg.joystickZone, cfg.leftHanded);
    if (zone === 'joystick') {
      if (joystick.state.active) return;
      joystick.setRadius(joystickRadius(rect.width, rect.height, cfg.joystickScale));
      joystick.begin(e.pointerId, p.x, p.y);
      pushView();
    } else {
      if (lookId !== null) return;
      lookId = e.pointerId;
      lastX = p.x;
      lastY = p.y;
      lastT = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : nowFn();
      if (cfg.touchGestures) tap.begin(evTime(e), p.x, p.y);
      else tap.cancel();
    }
    try {
      if (typeof container.setPointerCapture === 'function') container.setPointerCapture(e.pointerId);
    } catch {
      // Yakalama desteklenmiyor/gerekmiyor.
    }
    if (e.cancelable) e.preventDefault();
  }

  function onPointerMove(e) {
    if (!touchMode || disposed) return;
    if (e.pointerId === joystick.state.id && joystick.state.active) {
      const p = localPoint(e, rectOf());
      const ev = joystick.move(p.x, p.y);
      if (ev === 'sprintOn') haptic('light');
      else if (ev === 'ring') haptic('selection');
      pushView();
    } else if (e.pointerId === lookId) {
      const p = localPoint(e, rectOf());
      const t = typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : nowFn();
      const dx = p.x - lastX;
      const dy = p.y - lastY;
      const dtMs = Math.max(4, t - lastT);
      const speed = (Math.hypot(dx, dy) * 1000) / dtMs;
      const k = TOUCH_RAD_PER_PX * cfg.sensitivity * touchLookGain(speed, cfg.lookAccel);
      smoother.push(dx * k, -dy * k * (cfg.invertY ? -1 : 1));
      tap.move(p.x, p.y);
      lastX = p.x;
      lastY = p.y;
      lastT = t;
    }
  }

  function onPointerUp(e) {
    if (e.pointerType !== 'mouse') gesture();
    if (disposed) return;
    veh.pointerEnd(e.pointerId);
    if (e.pointerId === joystick.state.id) endJoystick();
    if (e.pointerId === lookId) endLook(e.type === 'pointercancel', evTime(e));
  }

  // Sayfa kaydırma/yakınlaştırma/uzun basış menüsü engelleri.
  function onTouchBlock(e) {
    if (!touchMode || !live()) return;
    if (isInteractiveTarget(e.target)) return;
    if (e.cancelable) e.preventDefault();
  }

  function onTouchEnd() {
    gesture();
  }

  function onGestureBlock(e) {
    if (live() && e.cancelable) e.preventDefault();
  }

  function onBlockSelect(e) {
    if (live() && e.cancelable && !isEditableTarget(e.target)) e.preventDefault();
  }

  /* Yön değişimi: parmaklar iptal olur ve ölçüler değişir; adres çubuğu yüzünden her resize'ı iptal sayma. */
  function onOrientation() {
    cancelTouches();
    gyro.reset();
    portrait = isPortrait();
  }

  function isPortrait() {
    try {
      const r = rectOf();
      return r.height > r.width;
    } catch {
      return false;
    }
  }

  function onResize() {
    const p = isPortrait();
    if (p !== portrait) onOrientation();
  }

  // ---- Jiroskop ----
  function onDeviceOrientation(e) {
    if (!cfg.gyro || disposed) return;
    gyro.update(e.alpha, e.beta, e.gamma, screenAngleOf(win), cfg.gyroSensitivity);
  }

  function syncGyro() {
    const want = cfg.gyro && Boolean(win);
    if (want && !gyroOn) {
      gyro.reset();
      win.addEventListener('deviceorientation', onDeviceOrientation);
      gyroOn = true;
    } else if (!want && gyroOn) {
      win.removeEventListener('deviceorientation', onDeviceOrientation);
      gyroOn = false;
      gyro.reset();
    }
  }

  // ---- Sıfırlama ----
  function releaseAll() {
    codesDown.clear();
    recomputeDown();
    hold.jump = false;
    hold.break = false;
    hold.place = false;
    hold.crouch = false;
    hold.sprint = false;
    releaseMouse();
    cancelTouches();
    pend.jump = false;
    pend.attack = false;
    pend.place = false;
    pend.interact = false;
    mouseDX = 0;
    mouseDY = 0;
    wheelAcc = 0;
    smoother.clear();
    jumpTap.reset();
    veh.releaseAll();
  }

  function onVisibility() {
    if (doc && doc.hidden) releaseAll();
  }

  const pressButton = createButtonPress({
    getCfg: () => cfg,
    hold,
    pend,
    latch,
    emit,
    haptic,
    gesture,
    isActive,
    isGameplay: () => gameplay,
    isDisposed: () => disposed,
    jumpTap,
    now: nowFn,
    vehicle: veh,
  });

  // ---- Kare anlık görüntüsü ----
  function neutral() {
    state.moveX = 0;
    state.moveZ = 0;
    state.lookDX = 0;
    state.lookDY = 0;
    state.jump = false;
    state.jumpPressed = false;
    state.crouch = false;
    state.sprint = false;
    state.breakHeld = false;
    state.placeHeld = false;
    state.attackPressed = false;
    state.placePressed = false;
    state.interactPressed = false;
    state.aimAssist = 0;
    state.vehicle = null;
  }

  function readGamepad(t, dt) {
    let pad = null;
    if (padsSeen || getGamepads) {
      try {
        const list = getGamepads ? getGamepads() : win && win.navigator && win.navigator.getGamepads ? win.navigator.getGamepads() : null;
        pad = pickGamepad(list);
      } catch {
        pad = null;
      }
    }
    lastPad = pad;
    pollGamepad(
      pad,
      gpState,
      { deadZone: cfg.gamepadDeadZone, sensitivity: cfg.gamepadSensitivity, invertY: cfg.invertY, crouchToggle: cfg.crouchToggle, flyDoubleTap: cfg.flyDoubleTap },
      dt,
      t,
      gpOut,
      veh.active ? gpEmit : emit
    );
    if (gpOut.active) gpAt = t;
  }

  function getState(dtIn) {
    const t = nowFn();
    let dt = typeof dtIn === 'number' && dtIn > 0 ? dtIn : lastFrame < 0 ? 1 / 60 : (t - lastFrame) / 1000;
    dt = Math.min(0.1, Math.max(0.001, dt));
    lastFrame = t;
    if (typeof cb.isVehicleMode === 'function') veh.setActive(!disposed && isActive() && Boolean(cb.isVehicleMode()));

    if (disposed || !isActive()) {
      neutral();
      mouseDX = 0;
      mouseDY = 0;
      smoother.clear();
      gyro.consume(lookTmp);
      pend.jump = pend.attack = pend.place = pend.interact = false;
      return state;
    }

    readGamepad(t, dt);

    if (!gameplay) {
      neutral();
      mouseDX = 0;
      mouseDY = 0;
      smoother.clear();
      gyro.consume(lookTmp);
      pend.jump = pend.attack = pend.place = pend.interact = false;
      return state;
    }

    // Basılı tutma jesti eşiği (parmak sabitken olay gelmez; burada zamanla çözülür).
    if (lookId !== null && tap.tick(t) === 'hold') {
      gestureBreak = true;
      pend.attack = true;
      haptic('medium');
    }

    // --- Hareket: klavye + joystick + kol toplanır, uzunluk 1'e sıkışır ---
    keyboardAxes(down, kbAxes);
    const js = joystick.state;
    let mx = kbAxes.x + (js.active ? js.x : 0) + gpOut.moveX;
    let mz = kbAxes.z + (js.active ? js.y : 0) + gpOut.moveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    state.moveX = mx;
    state.moveZ = mz;

    // --- Bakış ---
    const sens = cfg.sensitivity;
    const inv = cfg.invertY ? -1 : 1;
    let lx = mouseDX * MOUSE_RAD_PER_PX * sens;
    let ly = -mouseDY * MOUSE_RAD_PER_PX * sens * inv;
    mouseDX = 0;
    mouseDY = 0;
    smoother.consume(dt, lookTmp);
    lx += lookTmp.x;
    ly += lookTmp.y;
    gyro.consume(lookTmp);
    lx += lookTmp.x;
    ly += lookTmp.y;
    lx += gpOut.lookX;
    ly += gpOut.lookY;
    state.lookDX = lx;
    state.lookDY = ly;
    state.gyro = gyro.active;

    // --- Eylemler ---
    state.jump = down.jump || hold.jump || gpOut.jump || pend.jump;
    state.jumpPressed = pend.jump || gpOut.jumpPressed;
    state.crouch = down.crouch || hold.crouch || latch.crouch || gpOut.crouch;
    state.sprint = down.sprint || hold.sprint || latch.sprint || (js.active && js.sprint) || gpOut.sprint;
    state.breakHeld = mouseBreak || hold.break || gestureBreak || gpOut.breakHeld;
    state.placeHeld = mousePlace || hold.place || gpOut.placeHeld;
    state.attackPressed = pend.attack || gpOut.attackPressed;
    state.placePressed = pend.place || gpOut.placePressed;
    state.interactPressed = pend.interact || gpOut.interactPressed;
    pend.jump = false;
    pend.attack = false;
    pend.place = false;
    pend.interact = false;

    if (veh.active) {
      vkeys.forward = down.forward; vkeys.back = down.back; vkeys.left = down.left; vkeys.right = down.right;
      vkeys.jump = down.jump || hold.jump; vkeys.sprint = down.sprint || hold.sprint;
    }
    state.vehicle = veh.active ? veh.update(dt, vkeys, lastPad) : null;
    state.usingGamepad = t - gpAt < 3000;
    state.aimAssist = cfg.aimAssist !== null ? cfg.aimAssist : state.usingGamepad ? 0.35 : touchMode ? 0.5 : 0;
    return state;
  }

  // ---- Kurulum ----
  const styles = createStyleLock();
  const NO_SELECT = { touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', webkitTouchCallout: 'none', webkitTapHighlightColor: 'transparent' };
  styles.lock(container, NO_SELECT);
  if (canvas && canvas !== container) styles.lock(canvas, { touchAction: 'none', webkitTouchCallout: 'none' });

  portrait = isPortrait();

  on(win, 'keydown', onKeyDown);
  on(win, 'keyup', onKeyUp);
  on(win, 'blur', releaseAll);
  on(doc, 'visibilitychange', onVisibility);
  on(win, 'pagehide', releaseAll);
  on(doc, 'pointerlockchange', onLockChange);
  on(win, 'mouseup', onMouseUp);
  on(doc, 'mousemove', onMouseMove);
  on(container, 'mousedown', onMouseDown);
  on(container, 'wheel', onWheel, { passive: false });
  on(container, 'contextmenu', onContextMenu);
  on(container, 'selectstart', onBlockSelect);
  on(container, 'dragstart', onBlockSelect);
  on(container, 'pointerdown', onPointerDown);
  on(win, 'pointermove', onPointerMove);
  on(win, 'pointerup', onPointerUp);
  on(win, 'pointercancel', onPointerUp);
  on(container, 'touchstart', onTouchBlock, { passive: false });
  on(container, 'touchmove', onTouchBlock, { passive: false });
  on(container, 'touchend', onTouchEnd, { passive: true });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => on(container, n, onGestureBlock, { passive: false }));
  on(win, 'orientationchange', onOrientation);
  on(win, 'resize', onResize);
  if (win && win.screen && win.screen.orientation) on(win.screen.orientation, 'change', onOrientation);
  on(win, 'gamepadconnected', () => {
    padsSeen = true;
  });
  syncGyro();

  return {
    getState,
    consumeEvents: () => queue.drain(),

    /** Ayarları birleştirir (`{ sensitivity, invertY, gyro, aimAssist, … }`); fazladan alanlar yok sayılır. */
    setSettings(patch) {
      cfg = normalizeInputSettings(patch, cfg);
      smoother.setTau(cfg.lookSmoothing);
      syncGyro();
      if (joystick.state.radius && !joystick.state.active) {
        try {
          const r = rectOf();
          if (r.width > 0) joystick.setRadius(joystickRadius(r.width, r.height, cfg.joystickScale));
        } catch {
          // ölçü alınamadı
        }
      }
      return { ...cfg };
    },
    getSettings: () => ({ ...cfg }),

    /** `{ leftHanded, joystickScale, joystickZone }` */
    setTouchLayout(layout) {
      const l = layout || {};
      this.setSettings({ leftHanded: l.leftHanded, joystickScale: l.joystickScale, joystickZone: l.joystickZone });
    },

    /** Arayüzün (TouchControls.jsx) düğme/jest/joystick yerleşimi için ipuçları. */
    getTouchLayoutHints() {
      let rect = null;
      try {
        rect = rectOf();
      } catch {
        rect = null;
      }
      return buildTouchLayoutHints({ cfg, rect, touchMode, win, sprintLatch: latch.sprint, crouchLatch: latch.crouch, tapMs: TAP_MS, holdMs: HOLD_MS });
    },

    /** Joystick görünümü (kapsayıcıya göre px); aynı nesne yeniden kullanılır. */
    getJoystickView() {
      const j = joystick.state;
      view.active = j.active;
      view.baseX = j.baseX;
      view.baseY = j.baseY;
      view.knobX = j.knobX;
      view.knobY = j.knobY;
      view.radius = j.radius;
      view.sprint = j.sprint;
      view.x = j.x;
      view.y = j.y;
      return view;
    },

    pressButton,
    releaseButton: (name) => pressButton(name, false),

    /** Sürüş denetleyicisi (inputVehicle.js): React TouchDriveControls direksiyon/pedal izleyicilerini buradan sürer. */
    vehicle: veh,
    /** Elle sürüş kipi (G.player.vehicle geri çağrısı yoksa, ör. testler). */
    setVehicleMode: (on) => veh.setActive(Boolean(on)),

    /** Yalnız kullanıcı jesti içinde çağır (iOS izin penceresi). İzin verilirse jiroskop açılır. */
    async enableGyro(enabled = true) {
      if (!enabled) {
        this.setSettings({ gyro: false });
        return false;
      }
      const ok = await requestGyroPermission(win);
      this.setSettings({ gyro: ok });
      return ok;
    },

    /** Panel açıkken false: hareket/bakış/eylem kapanır, basılı tuşlar bırakılır, yalnız panel olayları akar. */
    setGameplayEnabled(enabled) {
      const next = Boolean(enabled);
      if (next === gameplay) return;
      gameplay = next;
      if (!next) releaseAll();
    },
    get gameplayEnabled() {
      return gameplay;
    },

    /** Tüm basılı durumları bırakır (sekme değişimi, menü, ölüm). */
    releaseAll,

    requestPointerLock,
    releasePointerLock,
    isLocked,

    get isTouch() {
      return touchMode;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      releaseAll();
      releasePointerLock();
      listeners.forEach(([target, type, fn, opts]) => {
        try {
          target.removeEventListener(type, fn, opts);
        } catch {
          // yut
        }
      });
      listeners.length = 0;
      if (gyroOn && win) win.removeEventListener('deviceorientation', onDeviceOrientation);
      gyroOn = false;
      styles.restore();
      queue.clear();
      neutral();
    },
  };
}
