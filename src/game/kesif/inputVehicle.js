/*
 * KEŞİF — sürüş girdisi denetleyicisi (vehicle_ui, Neon Meridyen Faz 3). Klavye + dokunmatik (direksiyon/kaydırıcı, pedallar, düğmeler) + oyun kolu → tek
 * `vehicle` nesnesi. DOM'a dokunmaz (olayları input.js ve React TouchDriveControls iletir); node'da/jsdom'da test edilir.
 *
 *   const ctl = createVehicleInput({ onEvent(type, extra), haptic(style), getTelemetry() → tele|null, isTouch() → bool, reducedMotion() → bool });
 *   ctl.setActive(true)                 sürüş kipi (G.player.vehicle != null). Kapanınca her şey sıfırlanır.
 *   ctl.update(dt, keys, pad)           her getState'te: keys {forward, back, left, right, jump, sprint}; pad Standard Gamepad | null → ctl.out (aynı nesne)
 *   ctl.out                             G.inputState.vehicle sözleşmesi: {steer, throttle, brake, handbrake, nitro, hop, steerDirect, cameraPressed, hornPressed, resetPressed}
 *                                       * kenar alanları TEK OKUMALIK (okununca silinir; sabit adım olmayan karede kaybolmaz, çok adımlı karede bir kez sayılır)
 *   ctl.keyDown(code) → bool            araç kipinde ezilen tuşlar: C kamera · H korna · R yola yerleştir · 1–9 radyo ön ayarı (true = tuş tüketildi)
 *   ctl.press(name, isDown) → bool      dokunmatik düğmeler: vhandbrake vnitro (basılı tutulur) · vcamera vhorn vradio vreset (dokunuş)
 *   ctl.wheel / ctl.slider / ctl.gas / ctl.brake   dokunmatik izleyiciler (bkz. inputVehicleMath); ctl.pointerEnd(id): işaretçi bırakıldı/iptal → hepsini bırakır
 *   ctl.setOption(name, v) / getOptions()   autoThrottle (bool) · laneAssist (null = yalnız dokunmatikte | bool) · steerMode ('wheel'|'slider')
 *   ctl.releaseAll()                    basılı her şeyi bırakır (blur, görünürlük, pointercancel, mod kapanışı)
 *
 * Olaylar (onEvent → input olay kuyruğu → sistemlerin onAction'ı; vehicle_audio dinler): 'radioSet' {index 0..5} (1–6 tuşu; 6 = Sessiz) · 'radioNext' · 'radioPrev'.
 */
import {
  ASSIST_MAX,
  AUTO_THROTTLE,
  RADIO_PRESETS,
  KEY_STEER_DOWN,
  KEY_STEER_UP,
  WHEEL_MAX_RAD,
  clamp,
  createPedalTracker,
  createSliderTracker,
  createWheelTracker,
  driveKeyAction,
  laneAssist,
  mixAssist,
  num,
  padDrive,
  radioIndexForCode,
  slew,
  steerCurve,
} from './inputVehicleMath.js';

export const VEHICLE_BUTTONS = Object.freeze(['vhandbrake', 'vnitro', 'vcamera', 'vhorn', 'vradio', 'vreset']);
const ASSIST_PERIOD = 0.05;

export function createVehicleInput(opts) {
  const o = opts || {};
  const emit = typeof o.onEvent === 'function' ? o.onEvent : () => {};
  const buzz = typeof o.haptic === 'function' ? o.haptic : () => {};
  const readTele = typeof o.getTelemetry === 'function' ? o.getTelemetry : () => null;
  const isTouch = typeof o.isTouch === 'function' ? o.isTouch : () => false;
  const calm = typeof o.reducedMotion === 'function' ? o.reducedMotion : () => false;

  let active = false;
  const options = { autoThrottle: false, laneAssist: null, steerMode: 'wheel' };
  const wheel = createWheelTracker();
  const slider = createSliderTracker();
  const gas = createPedalTracker();
  const brake = createPedalTracker();
  const hold = { handbrake: false, nitro: false };
  const edge = { camera: false, horn: false, reset: false };
  const sm = { steer: 0, throttle: 0, brake: 0 };
  const padOut = {
    steer: 0, throttle: 0, brake: 0, nitro: false, handbrake: false, active: false,
  };
  let assistT = 0;
  let assistTarget = 0;
  let assistCur = 0;
  let atLock = false;
  const tele0 = { speed: 0 };

  /* tek okumalık kenarlar: getter okununca silinir */
  const out = {
    steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, hop: false, steerDirect: true,
  };
  const edgeGetter = (name) => ({
    enumerable: true,
    configurable: false,
    get() {
      const v = edge[name];
      edge[name] = false;
      return v;
    },
  });
  Object.defineProperty(out, 'cameraPressed', edgeGetter('camera'));
  Object.defineProperty(out, 'hornPressed', edgeGetter('horn'));
  Object.defineProperty(out, 'resetPressed', edgeGetter('reset'));

  function neutralOut() {
    out.steer = 0;
    out.throttle = 0;
    out.brake = 0;
    out.handbrake = false;
    out.nitro = false;
    out.hop = false;
    out.steerDirect = true;
  }

  function releaseAll() {
    wheel.cancel();
    slider.cancel();
    gas.cancel();
    brake.cancel();
    hold.handbrake = false;
    hold.nitro = false;
    sm.steer = 0;
    sm.throttle = 0;
    sm.brake = 0;
    assistTarget = 0;
    assistCur = 0;
    atLock = false;
    neutralOut();
  }

  function resetAll() {
    releaseAll();
    wheel.reset();
    slider.reset();
    edge.camera = false;
    edge.horn = false;
    edge.reset = false;
  }

  function assistWanted() {
    if (options.laneAssist === false) return false;
    if (options.laneAssist === true) return true;
    return isTouch();
  }

  const ctl = {
    out,
    wheel,
    slider,
    gas,
    brake,
    get active() {
      return active;
    },
    setActive(on) {
      const next = Boolean(on);
      if (next === active) return;
      active = next;
      resetAll();
    },

    /** Bu tuş araç kipinde yürüme anlamından ezilir mi? (kenar tekrarı için: basılı tutma tekrarı yeniden tetiklemez, ama yine tüketilir) */
    handlesKey(code) {
      return active && (driveKeyAction(code) !== null || radioIndexForCode(code) >= 0);
    },

    /** Araç kipinde ezilen tuşlar; tüketildiyse true (çağıran tuşu yürüme eylemine çevirmez). */
    keyDown(code) {
      if (!active) return false;
      const a = driveKeyAction(code);
      if (a === 'camera') edge.camera = true;
      else if (a === 'horn') edge.horn = true;
      else if (a === 'reset') edge.reset = true;
      else {
        const i = radioIndexForCode(code);
        if (i < 0) return false;
        if (i < RADIO_PRESETS) emit('radioSet', { index: i });
        return true;
      }
      return true;
    },

    /** Dokunmatik düğme. Bilinmeyen ad → false. Basılı tutulanlar (vhandbrake, vnitro) bırakınca söner; dokunuşlar yalnız basışta tetiklenir. */
    press(name, isDown) {
      if (VEHICLE_BUTTONS.indexOf(name) < 0) return false;
      if (name === 'vhandbrake') hold.handbrake = Boolean(isDown) && active;
      else if (name === 'vnitro') hold.nitro = Boolean(isDown) && active;
      else if (isDown && active) {
        if (name === 'vcamera') edge.camera = true;
        else if (name === 'vhorn') edge.horn = true;
        else if (name === 'vreset') edge.reset = true;
        else if (name === 'vradio') emit('radioNext');
      }
      return true;
    },

    /** Oyun kolu olayı araç kipinde yeniden eşlenir (true = tüketildi): yukarı → kamera, RB → korna, LB → yola yerleştir, sol/sağ → radyo, çift A 'uç' ve atma yok. */
    mapPadEvent(type, extra) {
      if (!active) return false;
      if (type === 'camera') return ctl.press('vcamera', true);
      if (type === 'ability2') return ctl.press('vhorn', true);
      if (type === 'ability1') return ctl.press('vreset', true);
      if (type === 'hotbarDelta') {
        emit(extra && extra.delta < 0 ? 'radioPrev' : 'radioNext');
        return true;
      }
      return type === 'fly' || type === 'drop';
    },

    pointerEnd(id) {
      wheel.end(id);
      slider.end(id);
      gas.end(id);
      brake.end(id);
    },

    releaseAll,

    setOption(name, v) {
      if (name === 'autoThrottle') options.autoThrottle = v === true;
      else if (name === 'laneAssist') options.laneAssist = v === true ? true : v === false ? false : null;
      else if (name === 'steerMode') {
        const m = v === 'slider' ? 'slider' : 'wheel';
        if (m !== options.steerMode) {
          wheel.cancel();
          slider.cancel();
          options.steerMode = m;
        }
      } else return false;
      return true;
    },
    getOptions() {
      return { autoThrottle: options.autoThrottle, laneAssist: options.laneAssist, steerMode: options.steerMode };
    },

    /** Her getState: ham durumdan ctl.out'u üretir. keys: {forward, back, left, right, jump, sprint}. Kapalıyken null döner. */
    update(dtIn, keys, pad) {
      if (!active) return null;
      const dt = dtIn > 0 && Number.isFinite(dtIn) ? Math.min(0.1, dtIn) : 1 / 60;
      const k = keys || {};
      const tele = readTele() || tele0;
      const speed = Math.max(0, num(tele.speed));

      /* klavye */
      const kx = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      sm.steer = slew(sm.steer, kx, KEY_STEER_UP, KEY_STEER_DOWN, dt);
      sm.throttle = slew(sm.throttle, k.forward ? 1 : 0, 0.12, 0, dt);
      sm.brake = k.back ? 1 : 0;

      /* dokunmatik izleyiciler */
      wheel.update(dt);
      slider.update(dt);
      const touchSteer = options.steerMode === 'slider' ? slider.state.steer : wheel.state.steer;
      const touchOn = Math.abs(touchSteer) > 0;

      /* oyun kolu */
      padDrive(pad, null, padOut);

      let steer = sm.steer;
      const analog = touchOn ? touchSteer : padOut.steer;
      if (analog !== 0) steer = clamp(steer + steerCurve(analog, speed), -1, 1);

      /* şerit yardımı (20 Hz) */
      assistT += dt;
      if (assistT >= ASSIST_PERIOD) {
        assistT = 0;
        assistTarget = 0;
        if (assistWanted() && typeof tele.snap === 'function' && speed >= 5) {
          const lane = tele.snap(tele.x, tele.z, tele.y, tele.yaw);
          assistTarget = laneAssist(tele, lane);
        }
      }
      assistCur = slew(assistCur, assistTarget, 0.15, 0.15, dt);
      steer = mixAssist(steer, clamp(assistCur, -ASSIST_MAX, ASSIST_MAX));

      /* pedallar */
      let thr = Math.max(sm.throttle, gas.state.value, padOut.throttle);
      const brk = Math.max(sm.brake, brake.state.value, padOut.brake);
      const hb = Boolean(k.jump) || hold.handbrake || padOut.handbrake;
      if (options.autoThrottle && brk === 0 && !hb) thr = Math.max(thr, AUTO_THROTTLE);

      out.steer = clamp(num(steer), -1, 1);
      out.throttle = clamp(num(thr), 0, 1);
      out.brake = clamp(num(brk), 0, 1);
      out.handbrake = hb;
      out.hop = hb;
      out.nitro = Boolean(k.sprint) || hold.nitro || padOut.nitro;
      out.steerDirect = true;

      /* direksiyon sınırına varış titreşimi (azaltılmış harekette yok) */
      const lock = Math.abs(wheel.state.angle) >= WHEEL_MAX_RAD * 0.999;
      if (lock && !atLock && wheel.state.active && !calm()) buzz('light');
      atLock = lock;
      return out;
    },
  };
  return ctl;
}
