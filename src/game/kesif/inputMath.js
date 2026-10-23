/*
 * KEŞİF — girdi saf mantığı (DOM yok; node'da sahte olaylarla test edilir).
 *
 * input.js yalnızca olay dinleyicilerini ve durum nesnesini bağlar; matematik, eşleme tabloları,
 * ayar doğrulama, joystick, bakış yumuşatma, dokunma jesti, oyun kolu ve jiroskop burada.
 *
 * Eksen sözleşmesi (tüm modüllerde aynı):
 *   moveX  +1 = sağa      moveZ  +1 = İLERİ (−1 geri)
 *   lookDX +  = sağa dön  lookDY +  = YUKARI bak   (radyan, bu karede; invertY ve hassasiyet uygulanmış)
 * Ekran koordinatı (piksel): x sağa, y aşağıya artar.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Açıyı (−π, π] aralığına sarar. */
export function wrapAngle(a) {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  else if (r <= -Math.PI) r += Math.PI * 2;
  return r;
}

/* ------------------------------------------------------------------------------------------------
 * Ayarlar
 * ---------------------------------------------------------------------------------------------- */

export const DEFAULT_INPUT_SETTINGS = Object.freeze({
  sensitivity: 1, // çarpan; 0.1..4 (5'ten büyük değer yüzde sayılır: 100 → 1)
  invertY: false,
  lookAccel: 0.25, // dokunmatik bakış ivmesi 0..1
  lookSmoothing: 0.022, // dokunmatik bakış yumuşatma zaman sabiti (sn)
  gyro: false,
  gyroSensitivity: 1,
  aimAssist: null, // null = otomatik (dokunmatik 0.5, oyun kolu 0.35, fare/klavye 0)
  touchGestures: true, // sağ yarıda dokun = yerleştir, uzun bas = kır/saldır
  flyDoubleTap: true, // Space/Zıpla çift dokunuş = 'fly' olayı (motor yalnız inşa modunda dinler)
  rawInput: true, // fare için unadjustedMovement iste
  crouchToggle: false, // dokunmatik düğme / oyun kolu için çömelme kilidi
  leftHanded: false,
  joystickScale: 1,
  joystickZone: 0.4, // ekranın bu kesri joystick bölgesi
  gamepadDeadZone: 0.18,
  gamepadSensitivity: 1,
  haptics: true,
});

export function normalizeSensitivity(v) {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 1;
  if (v > 5) v /= 100;
  return clamp(v, 0.1, 4);
}

const bool = (v, def) => (typeof v === 'boolean' ? v : def);
const range = (v, lo, hi, def) => {
  if (typeof v === 'string' && v.trim() !== '') v = Number(v);
  return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def;
};

/** Ham ayarlardan temiz ayar nesnesi üretir (bilinmeyen alan atılır, eksikler `prev`ten gelir). */
export function normalizeInputSettings(raw, prev = DEFAULT_INPUT_SETTINGS) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const has = (k) => Object.prototype.hasOwnProperty.call(r, k) && r[k] !== undefined;
  const p = prev || DEFAULT_INPUT_SETTINGS;
  let aim = p.aimAssist;
  if (has('aimAssist')) aim = r.aimAssist === null ? null : range(r.aimAssist, 0, 1, p.aimAssist);
  return {
    sensitivity: has('sensitivity') ? normalizeSensitivity(r.sensitivity) : p.sensitivity,
    invertY: has('invertY') ? bool(r.invertY, p.invertY) : p.invertY,
    lookAccel: has('lookAccel') ? range(r.lookAccel, 0, 1, p.lookAccel) : p.lookAccel,
    lookSmoothing: has('lookSmoothing') ? range(r.lookSmoothing, 0, 0.1, p.lookSmoothing) : p.lookSmoothing,
    gyro: has('gyro') ? bool(r.gyro, p.gyro) : p.gyro,
    gyroSensitivity: has('gyroSensitivity') ? range(r.gyroSensitivity, 0.2, 3, p.gyroSensitivity) : p.gyroSensitivity,
    aimAssist: aim,
    touchGestures: has('touchGestures') ? bool(r.touchGestures, p.touchGestures) : p.touchGestures,
    flyDoubleTap: has('flyDoubleTap') ? bool(r.flyDoubleTap, p.flyDoubleTap) : p.flyDoubleTap,
    rawInput: has('rawInput') ? bool(r.rawInput, p.rawInput) : p.rawInput,
    crouchToggle: has('crouchToggle') ? bool(r.crouchToggle, p.crouchToggle) : p.crouchToggle,
    leftHanded: has('leftHanded') ? bool(r.leftHanded, p.leftHanded) : p.leftHanded,
    joystickScale: has('joystickScale') ? range(r.joystickScale, 0.6, 1.6, p.joystickScale) : p.joystickScale,
    joystickZone: has('joystickZone') ? range(r.joystickZone, 0.25, 0.6, p.joystickZone) : p.joystickZone,
    gamepadDeadZone: has('gamepadDeadZone') ? range(r.gamepadDeadZone, 0.05, 0.5, p.gamepadDeadZone) : p.gamepadDeadZone,
    gamepadSensitivity: has('gamepadSensitivity') ? range(r.gamepadSensitivity, 0.2, 3, p.gamepadSensitivity) : p.gamepadSensitivity,
    haptics: has('haptics') ? bool(r.haptics, p.haptics) : p.haptics,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Klavye eşlemesi
 * ---------------------------------------------------------------------------------------------- */

/** Basılı tutulan eylemler → tuş kodları. */
export const HELD_ACTION_CODES = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft', 'ControlRight'],
});

/** Tek seferlik eylemler → tuş kodu (olay kuyruğuna girer). */
export const PRESS_ACTION_CODES = Object.freeze({
  KeyE: 'inventory',
  KeyR: 'craft',
  KeyQ: 'drop',
  F5: 'camera',
  Tab: 'map',
  KeyM: 'map',
  Escape: 'pause',
  KeyP: 'pause',
  KeyF: 'interact',
  KeyZ: 'ability1',
  KeyX: 'ability2',
  KeyG: 'ability3',
  KeyB: 'ability4',
  KeyT: 'portalMode',
});

const CODE_TO_HELD = {};
Object.keys(HELD_ACTION_CODES).forEach((a) => HELD_ACTION_CODES[a].forEach((c) => (CODE_TO_HELD[c] = a)));

/** 'Digit3' / 'Numpad3' → 2 (hotbar indeksi 0..8), değilse −1. */
export function hotbarIndexForCode(code) {
  if (typeof code !== 'string') return -1;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}

/**
 * Tuş kodu → { kind:'held'|'press'|'hotbar', action, index? } | null.
 * `action` held için 'forward'|'back'|…, press için 'inventory'|'pause'|… ('interact' dahil).
 */
export function keyToAction(code) {
  if (typeof code !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(CODE_TO_HELD, code)) return { kind: 'held', action: CODE_TO_HELD[code] };
  if (Object.prototype.hasOwnProperty.call(PRESS_ACTION_CODES, code)) return { kind: 'press', action: PRESS_ACTION_CODES[code] };
  const i = hotbarIndexForCode(code);
  if (i >= 0) return { kind: 'hotbar', action: 'hotbarSet', index: i };
  return null;
}

/** Ctrl/Alt/Meta basılıyken yine de oyuna ait olan tuşlar (hareket, zıplama, koşma, çömelme). */
export function isModifierSafeCode(code) {
  return Object.prototype.hasOwnProperty.call(CODE_TO_HELD, code);
}

/** Tarayıcının varsayılan davranışını (kaydırma, F5 yenileme, Tab odak) bastırılacak tuşlar. */
export function shouldPreventKey(code) {
  return keyToAction(code) !== null || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown';
}

/** Basılı eylem bayraklarından [-1,1] eksenler; çapraz hareket uzunluk 1'e normalize edilir. */
export function keyboardAxes(down, out) {
  let x = (down.right ? 1 : 0) - (down.left ? 1 : 0);
  let z = (down.forward ? 1 : 0) - (down.back ? 1 : 0);
  if (x !== 0 && z !== 0) {
    x *= Math.SQRT1_2;
    z *= Math.SQRT1_2;
  }
  out.x = x;
  out.z = z;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Olay kuyruğu
 * ---------------------------------------------------------------------------------------------- */

const EMPTY_EVENTS = Object.freeze([]);

/**
 * Ayrık olaylar için sınırlı kuyruk. `dedupMs` verilen türler (örn. pause) bu süre içinde yinelenmez
 * (Esc hem keydown hem pointerlockchange üretebilir).
 */
export function createEventQueue({ max = 64, dedupMs = { pause: 250 } } = {}) {
  let list = [];
  const lastAt = {};
  const lastLock = {};
  return {
    push(ev, now = 0) {
      if (!ev || typeof ev.type !== 'string') return false;
      const gap = dedupMs[ev.type];
      if (gap) {
        // Yalnızca imleç kilidi kaybı (source:'lock') ile klavye arasındaki çift tetik yok sayılır; art arda iki gerçek Esc basışı
        // (duraklat → devam) aralık kısa olsa da kaybolmaz (yavaş karede de, hızlı çift basışta da).
        const prev = lastAt[ev.type];
        const lock = ev.source === 'lock';
        if (prev !== undefined && now - prev < gap && (lock || lastLock[ev.type])) return false;
        lastAt[ev.type] = now;
        lastLock[ev.type] = lock;
      }
      if (list.length >= max) list.shift();
      list.push(ev);
      return true;
    },
    /** Birikenleri döndürür ve kuyruğu boşaltır; boşsa paylaşılan donuk dizi. */
    drain() {
      if (list.length === 0) return EMPTY_EVENTS;
      const out = list;
      list = [];
      return out;
    },
    clear() {
      list = [];
    },
    get length() {
      return list.length;
    },
  };
}

/** Çift dokunma algılayıcı (Space/Zıpla → uç). Zaman ms. */
export function createDoubleTap(windowMs = 280) {
  let last = -Infinity;
  return {
    /** İkinci dokunuş pencere içindeyse true ve sıfırlanır. */
    tap(t) {
      if (t - last <= windowMs && t >= last) {
        last = -Infinity;
        return true;
      }
      last = t;
      return false;
    },
    reset() {
      last = -Infinity;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Fare
 * ---------------------------------------------------------------------------------------------- */

export const MOUSE_RAD_PER_PX = 0.0022;
export const TOUCH_RAD_PER_PX = 0.0046;

/** Pointer lock'ta bazen gelen sıçrama (tek olayda yüzlerce piksel) hareketini yok say. */
export function filterMouseDelta(d, limit = 600) {
  return Number.isFinite(d) && Math.abs(d) <= limit ? d : 0;
}

/** Tekerlek delta'sını piksele çevirir. */
export function wheelDeltaPx(deltaY, deltaMode) {
  const d = Number.isFinite(deltaY) ? deltaY : 0;
  if (deltaMode === 1) return d * 33;
  if (deltaMode === 2) return d * 800;
  return d;
}

/** Biriktirici: dokunmatik yüzey kayması küçük delta'larla gelir. steps>0 = sonraki yuva. */
export function wheelSteps(acc, deltaY, deltaMode, threshold = 90, maxSteps = 3) {
  let a = acc + wheelDeltaPx(deltaY, deltaMode);
  let steps = 0;
  while (a >= threshold && steps < maxSteps) {
    a -= threshold;
    steps++;
  }
  while (a <= -threshold && steps > -maxSteps) {
    a += threshold;
    steps--;
  }
  // Üst sınıra takılınca artığı at (ataletli kaydırma taşmasın).
  if (Math.abs(a) >= threshold) a = 0;
  return { acc: a, steps };
}

/* ------------------------------------------------------------------------------------------------
 * Dokunmatik: joystick
 * ---------------------------------------------------------------------------------------------- */

export const JOYSTICK_DEFAULTS = Object.freeze({
  deadZone: 0.12,
  sprintRatio: 1.35, // halkanın bu kadar dışına itilince koş
  sprintOffRatio: 1.0, // halkanın içine dönünce koşma biter (histerezis)
  followRatio: 2.2, // parmak bu kadar uzaklaşırsa taban parmağı izler
});

/** Ekran kayması (dx sağa, dy aşağı, px) → joystick ekseni (x sağ, y İLERİ). Ölü bölge sonrası 0..1'e yeniden ölçeklenir. */
export function stickAxes(dx, dy, radius, deadZone, out) {
  const d = Math.hypot(dx, dy);
  if (!(d > 0) || !(radius > 0)) {
    out.x = 0;
    out.y = 0;
    out.mag = 0;
    return out;
  }
  const m = Math.min(1, d / radius);
  if (m < deadZone) {
    out.x = 0;
    out.y = 0;
    out.mag = 0;
    return out;
  }
  const s = (m - deadZone) / (1 - deadZone);
  out.x = (dx / d) * s;
  out.y = ((0 - dy) / d) * s;
  out.mag = s;
  return out;
}

/** Ekran boyutuna göre joystick yarıçapı (px). */
export function joystickRadius(width, height, scale = 1) {
  const base = clamp(Math.round(Math.min(width, height) * 0.14), 44, 84);
  return Math.round(base * clamp(scale, 0.6, 1.6));
}

/**
 * Yüzen joystick. begin() parmağın düştüğü yeri tabana alır. move() dönüşü: 'sprintOn' | 'sprintOff' |
 * 'ring' (halka sınırı geçildi) | null; çağıran bunları titreşime çevirir.
 */
export function createJoystick(opts = {}) {
  const cfg = { ...JOYSTICK_DEFAULTS, ...opts };
  const state = {
    active: false,
    id: null,
    radius: opts.radius || 56,
    baseX: 0,
    baseY: 0,
    knobX: 0,
    knobY: 0,
    x: 0,
    y: 0,
    mag: 0,
    sprint: false,
  };
  let outside = false;

  function reset() {
    state.active = false;
    state.id = null;
    state.knobX = state.baseX;
    state.knobY = state.baseY;
    state.x = 0;
    state.y = 0;
    state.mag = 0;
    state.sprint = false;
    outside = false;
  }

  return {
    state,
    begin(id, x, y) {
      state.active = true;
      state.id = id;
      state.baseX = x;
      state.baseY = y;
      state.knobX = x;
      state.knobY = y;
      state.x = 0;
      state.y = 0;
      state.mag = 0;
      state.sprint = false;
      outside = false;
    },
    move(x, y) {
      if (!state.active) return null;
      const r = state.radius;
      let dx = x - state.baseX;
      let dy = y - state.baseY;
      let d = Math.hypot(dx, dy);
      const maxD = r * cfg.followRatio;
      if (d > maxD) {
        // Taban parmağı izler: uzağa kayan parmak tersine döndüğünde gecikme olmaz.
        const k = (d - maxD) / d;
        state.baseX += dx * k;
        state.baseY += dy * k;
        dx = x - state.baseX;
        dy = y - state.baseY;
        d = Math.hypot(dx, dy);
      }
      const kd = d > r ? r / d : 1;
      state.knobX = state.baseX + dx * kd;
      state.knobY = state.baseY + dy * kd;
      stickAxes(dx, dy, r, cfg.deadZone, state);
      const ratio = d / r;
      const prevSprint = state.sprint;
      if (!prevSprint && ratio > cfg.sprintRatio) state.sprint = true;
      else if (prevSprint && ratio < cfg.sprintOffRatio) state.sprint = false;
      const nowOutside = ratio >= 1;
      let ev = null;
      if (state.sprint !== prevSprint) ev = state.sprint ? 'sprintOn' : 'sprintOff';
      else if (nowOutside !== outside) ev = 'ring';
      outside = nowOutside;
      return ev;
    },
    end() {
      reset();
    },
    setRadius(r) {
      if (r > 0) state.radius = r;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Dokunmatik: bakış
 * ---------------------------------------------------------------------------------------------- */

/** Parmak hızına (px/sn) bağlı kazanç; accel 0 ise 1. Yavaş hareket doğru, hızlı fırlatma çabuk döner. */
export function touchLookGain(speedPxPerSec, accel) {
  if (!(accel > 0)) return 1;
  return 1 + accel * 2 * smoothstep(200, 1600, speedPxPerSec);
}

/**
 * Hareketi kaybetmeden yumuşatır: push() biriktirir, consume(dt) birikenin üssel bir kesrini verir
 * (toplam korunur; yalnızca ~tau saniye gecikir). tau 0 ise geçirgen.
 */
export function createLookSmoother(tau = 0.022) {
  let rx = 0;
  let ry = 0;
  let t = tau;
  return {
    setTau(v) {
      t = Math.max(0, v);
    },
    push(dx, dy) {
      rx += dx;
      ry += dy;
    },
    consume(dt, out) {
      const f = t <= 0 ? 1 : dt <= 0 ? 0 : 1 - Math.exp(-dt / t);
      let ox = rx * f;
      let oy = ry * f;
      rx -= ox;
      ry -= oy;
      // Küçük artığı sonsuza taşıma.
      if (Math.abs(rx) < 1e-7) {
        ox += rx;
        rx = 0;
      }
      if (Math.abs(ry) < 1e-7) {
        oy += ry;
        ry = 0;
      }
      out.x = ox;
      out.y = oy;
      return out;
    },
    clear() {
      rx = 0;
      ry = 0;
    },
    get pending() {
      return Math.abs(rx) + Math.abs(ry);
    },
  };
}

/**
 * Dokunma jesti: kısa dokun = 'tap' (yerleştir), basılı tut = 'hold' (kır/saldır; parmak kalkınca 'holdEnd').
 * Parmak eşikten fazla kayarsa sürükleme olur: ne tap ne hold. Zaman ms.
 */
export function createTapGesture({ tapMs = 230, holdMs = 380, slop = 12 } = {}) {
  let state = 'idle';
  let t0 = 0;
  let x0 = 0;
  let y0 = 0;
  return {
    begin(t, x, y) {
      state = 'down';
      t0 = t;
      x0 = x;
      y0 = y;
    },
    move(x, y) {
      if (state === 'down' && Math.hypot(x - x0, y - y0) > slop) state = 'drag';
    },
    /** Basılı tutma eşiği dolduysa bir kez 'hold' döner. */
    tick(t) {
      if (state === 'down' && t - t0 >= holdMs) {
        state = 'hold';
        return 'hold';
      }
      return null;
    },
    end(t) {
      const s = state;
      state = 'idle';
      if (s === 'down' && t - t0 <= tapMs) return 'tap';
      if (s === 'hold') return 'holdEnd';
      return null;
    },
    cancel() {
      const s = state;
      state = 'idle';
      return s === 'hold' ? 'holdEnd' : null;
    },
    get state() {
      return state;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Hedef yardımı
 * ------------------------------------------------------------------------------------------------ */

/**
 * delta: {x,y} hedefin nişangâha göre açısal uzaklığı (radyan; x sağ +, y yukarı +).
 * Dönüş (out): bu karede bakışa eklenecek açı. Hedef yakınken mıknatıs, merkezde ve uzakta yok,
 * asla hedefi aşmaz. strength 0..1.
 */
export function aimAssist(delta, strength, dt = 1 / 60, out = { x: 0, y: 0 }, radius = 0.14) {
  out.x = 0;
  out.y = 0;
  if (!delta || !(strength > 0)) return out;
  const dx = delta.x;
  const dy = delta.y;
  const d = Math.hypot(dx, dy);
  if (!(d > 0.0015) || d >= radius) return out;
  const w = 1 - d / radius; // yaklaştıkça güçlenir
  const rate = Math.min(1, 8 * Math.max(0, dt)); // kare süresinden bağımsız
  const k = Math.min(1, strength) * w * rate * 0.6;
  out.x = dx * k;
  out.y = dy * k;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Jiroskop (DeviceOrientation)
 * ---------------------------------------------------------------------------------------------- */

/**
 * W3C DeviceOrientation (derece) → kameranın baktığı yön: az (radyan, + = sağa), pitch (+ = yukarı).
 * three DeviceOrientationControls ile aynı kuaterniyon zinciri; ekran dönüşü (0/90/180/270) dahil.
 */
export function deviceLookAngles(alphaDeg, betaDeg, gammaDeg, screenAngleDeg, out) {
  const D = Math.PI / 180;
  // Euler (x=beta, y=alpha, z=-gamma), sıra YXZ.
  const x = betaDeg * D;
  const y = alphaDeg * D;
  const z = -gammaDeg * D;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  let qx = s1 * c2 * c3 + c1 * s2 * s3;
  let qy = c1 * s2 * c3 - s1 * c2 * s3;
  let qz = c1 * c2 * s3 - s1 * s2 * c3;
  let qw = c1 * c2 * c3 + s1 * s2 * s3;
  const mul = (ax, ay, az, aw, bx, by, bz, bw) => {
    qx = aw * bx + ax * bw + ay * bz - az * by;
    qy = aw * by - ax * bz + ay * bw + az * bx;
    qz = aw * bz + ax * by - ay * bx + az * bw;
    qw = aw * bw - ax * bx - ay * by - az * bz;
  };
  // Kamera cihazın arkasına bakar: −90° X.
  const h = Math.SQRT1_2;
  mul(qx, qy, qz, qw, -h, 0, 0, h);
  // Ekran yönelimi: Z ekseninde −açı.
  const o = (-screenAngleDeg * D) / 2;
  mul(qx, qy, qz, qw, 0, 0, Math.sin(o), Math.cos(o));
  // (0,0,−1) vektörünü döndür.
  const vx = 0;
  const vy = 0;
  const vz = -1;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  const fx = vx + qw * tx + (qy * tz - qz * ty);
  const fy = vy + qw * ty + (qz * tx - qx * tz);
  const fz = vz + qw * tz + (qx * ty - qy * tx);
  out.az = Math.atan2(fx, -fz);
  out.pitch = Math.asin(clamp(fy, -1, 1));
  return out;
}

/**
 * Jiroskop bakışı: ardışık yönelimlerden fark üretir, düşük geçirgenle süzer (DC kazancı 1: toplam korunur),
 * çok küçük titreşimi yok sayar. consume() birikeni (radyan) verir.
 */
export function createGyroLook({ smoothing = 0.55, deadband = 0.0004, maxStep = 0.6 } = {}) {
  const angles = { az: 0, pitch: 0 };
  let has = false;
  let prevAz = 0;
  let prevPitch = 0;
  let fx = 0;
  let fy = 0;
  let accX = 0;
  let accY = 0;
  return {
    reset() {
      has = false;
      fx = 0;
      fy = 0;
      accX = 0;
      accY = 0;
    },
    /** Sensör değeri geçerliyse true. */
    update(alpha, beta, gamma, screenAngle, sens = 1) {
      if (![alpha, beta, gamma].every((v) => typeof v === 'number' && Number.isFinite(v))) return false;
      deviceLookAngles(alpha, beta, gamma, screenAngle || 0, angles);
      if (!has) {
        has = true;
        prevAz = angles.az;
        prevPitch = angles.pitch;
        return true;
      }
      // Tam yukarı/aşağı bakarken yatay açı belirsizdir.
      let dAz = Math.abs(angles.pitch) > 1.5 ? 0 : wrapAngle(angles.az - prevAz);
      let dPitch = angles.pitch - prevPitch;
      prevAz = angles.az;
      prevPitch = angles.pitch;
      dAz = clamp(dAz, -maxStep, maxStep);
      dPitch = clamp(dPitch, -maxStep, maxStep);
      if (Math.abs(dAz) < deadband) dAz = 0;
      if (Math.abs(dPitch) < deadband) dPitch = 0;
      fx = fx * smoothing + dAz * (1 - smoothing);
      fy = fy * smoothing + dPitch * (1 - smoothing);
      accX += fx * sens;
      accY += fy * sens;
      return true;
    },
    consume(out) {
      out.x = accX;
      out.y = accY;
      accX = 0;
      accY = 0;
      return out;
    },
    get active() {
      return has;
    },
  };
}

/** Jiroskop izni: iOS requestPermission ister (kullanıcı jesti içinde çağır); diğerlerinde olay desteği yeter. */
export async function requestGyroPermission(win = typeof window !== 'undefined' ? window : null) {
  if (!win || typeof win.DeviceOrientationEvent === 'undefined') return false;
  const DOE = win.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    try {
      return (await DOE.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Oyun kolu (Standard Gamepad eşlemesi)
 * ---------------------------------------------------------------------------------------------- */

export const GP_BUTTON = Object.freeze({
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
});

export const GP_LOOK_RATE = 3.4; // rad/sn tam itişte (hassasiyet 1)

/** Dairesel ölü bölge + yeniden ölçekleme (yön korunur). out.x/y/mag. */
export function radialDeadZone(x, y, dz, out) {
  const px = Number.isFinite(x) ? x : 0;
  const py = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(px, py);
  if (m < dz || m === 0) {
    out.x = 0;
    out.y = 0;
    out.mag = 0;
    return out;
  }
  const s = (Math.min(1, m) - dz) / (1 - dz);
  out.x = (px / m) * s;
  out.y = (py / m) * s;
  out.mag = s;
  return out;
}

function buttonValue(b) {
  if (!b) return 0;
  if (typeof b.value === 'number' && Number.isFinite(b.value)) return Math.max(b.value, b.pressed ? 1 : 0);
  return b.pressed ? 1 : 0;
}

/** Düğme/tetik basılı mı (analog tetikte eşik). */
export function gamepadDown(b, threshold = 0.5) {
  return buttonValue(b) >= threshold;
}

/** Kullanılabilir ilk oyun kolu (bağlı, en az 2 çubuk ekseni çifti ve 10 düğme). */
export function pickGamepad(pads) {
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    const p = pads[i];
    if (p && p.connected !== false && p.axes && p.axes.length >= 4 && p.buttons && p.buttons.length >= 10) return p;
  }
  return null;
}

export function createGamepadState() {
  return {
    prev: [],
    sprintLatch: false,
    crouchLatch: false,
    doubleTap: createDoubleTap(),
    edges: new Array(16).fill(false),
    tmp: { x: 0, y: 0, mag: 0 },
  };
}

/**
 * Kolu durumunu `out`a yazar ve ayrık olayları emit(type, extra) ile bildirir.
 * out: { moveX, moveZ, lookX, lookY, jump, crouch, sprint, breakHeld, placeHeld,
 *        jumpPressed, attackPressed, placePressed, interactPressed, active }
 * cfg: { deadZone, sensitivity, invertY, crouchToggle, flyDoubleTap }
 */
export function pollGamepad(pad, gs, cfg, dt, t, out, emit) {
  out.moveX = 0;
  out.moveZ = 0;
  out.lookX = 0;
  out.lookY = 0;
  out.jump = false;
  out.crouch = false;
  out.sprint = false;
  out.breakHeld = false;
  out.placeHeld = false;
  out.jumpPressed = false;
  out.attackPressed = false;
  out.placePressed = false;
  out.interactPressed = false;
  out.active = false;
  if (!pad) {
    gs.prev.length = 0;
    gs.sprintLatch = false;
    gs.crouchLatch = false;
    return out;
  }
  const axes = pad.axes;
  const b = pad.buttons;
  const tmp = gs.tmp;
  const dz = cfg.deadZone;

  radialDeadZone(axes[0], axes[1], dz, tmp);
  out.moveX = tmp.x;
  out.moveZ = 0 - tmp.y;
  const moveMag = tmp.mag;

  radialDeadZone(axes[2], axes[3], dz, tmp);
  if (tmp.mag > 0) {
    const curved = Math.pow(tmp.mag, 1.7) * GP_LOOK_RATE * cfg.sensitivity * dt;
    out.lookX = (tmp.x / tmp.mag) * curved;
    out.lookY = ((0 - tmp.y) / tmp.mag) * curved * (cfg.invertY ? -1 : 1);
  }
  const stickActive = moveMag > 0 || tmp.mag > 0;

  let anyButton = false;
  const prev = gs.prev;
  const down = (i) => gamepadDown(b[i], i === GP_BUTTON.LT || i === GP_BUTTON.RT ? 0.4 : 0.5);
  const edges = gs.edges;
  for (let i = 0; i < 16; i++) {
    const d = down(i);
    edges[i] = d && !prev[i];
    if (d) anyButton = true;
  }
  const e = (i) => edges[i];

  out.jump = down(GP_BUTTON.A);
  if (e(GP_BUTTON.A)) {
    out.jumpPressed = true;
    if (gs.doubleTap.tap(t) && cfg.flyDoubleTap) emit('fly');
  }
  if (cfg.crouchToggle) {
    if (e(GP_BUTTON.B)) gs.crouchLatch = !gs.crouchLatch;
    out.crouch = gs.crouchLatch;
  } else {
    gs.crouchLatch = false;
    out.crouch = down(GP_BUTTON.B);
  }
  out.breakHeld = down(GP_BUTTON.RT);
  out.attackPressed = e(GP_BUTTON.RT);
  out.placeHeld = down(GP_BUTTON.LT);
  out.placePressed = e(GP_BUTTON.LT);
  out.interactPressed = e(GP_BUTTON.X);

  if (e(GP_BUTTON.LS)) gs.sprintLatch = !gs.sprintLatch;
  if (moveMag < 0.1) gs.sprintLatch = false;
  out.sprint = gs.sprintLatch;

  if (e(GP_BUTTON.Y)) emit('inventory');
  if (e(GP_BUTTON.LB)) emit('ability1');
  if (e(GP_BUTTON.RB)) emit('ability2');
  if (e(GP_BUTTON.BACK)) emit('map');
  if (e(GP_BUTTON.START)) emit('pause');
  if (e(GP_BUTTON.RS)) emit('drop');
  if (e(GP_BUTTON.UP)) emit('camera');
  if (e(GP_BUTTON.DOWN)) emit('craft');
  if (e(GP_BUTTON.LEFT)) emit('hotbarDelta', { delta: -1 });
  if (e(GP_BUTTON.RIGHT)) emit('hotbarDelta', { delta: 1 });

  for (let i = 0; i < 16; i++) prev[i] = down(i);
  out.active = stickActive || anyButton;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Dokunmatik düğme tanımları (React TouchControls.jsx bunları çizer ve pressButton(name, down) çağırır)
 * ---------------------------------------------------------------------------------------------- */

/**
 * kind: 'hold' = basılıyken etkin, 'tap' = bir kez tetiklenir, 'toggle' = her basışta kilit değişir.
 * slot: yerleşim ipucu (arayüz serbestçe düzenleyebilir).
 */
export const TOUCH_BUTTONS = Object.freeze([
  { name: 'jump', label: 'Zıpla', kind: 'hold', slot: 'primary' },
  { name: 'break', label: 'Kır / Saldır', kind: 'hold', slot: 'primary' },
  { name: 'place', label: 'Yerleştir / Kullan', kind: 'hold', slot: 'primary' },
  { name: 'interact', label: 'Etkileş', kind: 'tap', slot: 'secondary' },
  { name: 'crouch', label: 'Çömel / Aşağı', kind: 'hold', slot: 'secondary' },
  { name: 'crouchToggle', label: 'Çömel (kilit)', kind: 'toggle', slot: 'secondary' },
  { name: 'sprint', label: 'Koş', kind: 'hold', slot: 'secondary' },
  { name: 'sprintToggle', label: 'Koş (kilit)', kind: 'toggle', slot: 'secondary' },
  { name: 'fly', label: 'Uç', kind: 'tap', slot: 'secondary' },
  { name: 'inventory', label: 'Envanter', kind: 'tap', slot: 'top' },
  { name: 'craft', label: 'Üret', kind: 'tap', slot: 'top' },
  { name: 'map', label: 'Harita', kind: 'tap', slot: 'top' },
  { name: 'camera', label: 'Kamera', kind: 'tap', slot: 'top' },
  { name: 'pause', label: 'Duraklat', kind: 'tap', slot: 'top' },
  { name: 'drop', label: 'Bırak', kind: 'tap', slot: 'secondary' },
  { name: 'ability1', label: 'Yetenek 1', kind: 'tap', slot: 'ability' },
  { name: 'ability2', label: 'Yetenek 2', kind: 'tap', slot: 'ability' },
  { name: 'ability3', label: 'Yetenek 3', kind: 'tap', slot: 'ability' },
  { name: 'ability4', label: 'Yetenek 4', kind: 'tap', slot: 'ability' },
  { name: 'portalMode', label: 'Boyut kipi', kind: 'tap', slot: 'ability' },
  // sürüş (vehicle_ui; inputVehicle.js): yalnız araç kipinde etkin
  { name: 'vhandbrake', label: 'El freni', kind: 'hold', slot: 'drive' },
  { name: 'vnitro', label: 'Nitro', kind: 'hold', slot: 'drive' },
  { name: 'vcamera', label: 'Araç kamerası', kind: 'tap', slot: 'drive' },
  { name: 'vhorn', label: 'Korna', kind: 'tap', slot: 'drive' },
  { name: 'vradio', label: 'Radyo', kind: 'tap', slot: 'drive' },
  { name: 'vreset', label: 'Yola yerleştir', kind: 'tap', slot: 'drive' },
  { name: 'hotbarPrev', label: 'Önceki yuva', kind: 'tap', slot: 'hotbar' },
  { name: 'hotbarNext', label: 'Sonraki yuva', kind: 'tap', slot: 'hotbar' },
  ...Array.from({ length: 9 }, (_, i) => ({ name: 'hotbar' + (i + 1), label: 'Yuva ' + (i + 1), kind: 'tap', slot: 'hotbar' })),
]);

const BUTTON_BY_NAME = {};
TOUCH_BUTTONS.forEach((d) => (BUTTON_BY_NAME[d.name] = d));

export function touchButtonDef(name) {
  return Object.prototype.hasOwnProperty.call(BUTTON_BY_NAME, name) ? BUTTON_BY_NAME[name] : null;
}

/** Etkileşimli öğe (düğme, bağlantı, girdi…) ya da [data-no-tap] altında mı? */
export const INTERACTIVE_SELECTOR =
  '[data-no-tap], button, a[href], input, textarea, select, label, [role="button"], [role="switch"], [role="dialog"], [contenteditable]';

export function isInteractiveTarget(target) {
  return Boolean(target && typeof target.closest === 'function' && target.closest(INTERACTIVE_SELECTOR));
}

export function isEditableTarget(target) {
  return Boolean(target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable]'));
}

/** Dokunmatik bölge: x (container içi px) joystick için mi, bakış için mi? */
export function touchZoneFor(x, width, zone, leftHanded) {
  const w = Math.max(1, width);
  const edge = w * zone;
  if (leftHanded) return x >= w - edge ? 'joystick' : 'look';
  return x < edge ? 'joystick' : 'look';
}
