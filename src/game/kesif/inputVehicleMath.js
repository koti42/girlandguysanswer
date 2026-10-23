/*
 * KEŞİF — sürüş girdisi saf mantığı (vehicle_ui, Neon Meridyen Faz 3). DOM/three/Math.random/Date.now YOK; node'da test edilir; es2020.
 * inputVehicle.js bunları bir denetleyiciye bağlar; React TouchDriveControls işaretçi olaylarını burada tanımlı izleyicilere iletir.
 *
 * Eksen sözleşmesi (araç fiziğiyle aynı): steer −1..1 (+ SAĞ), throttle/brake 0..1. Ekran koordinatı: x sağa, y aşağıya artar.
 *
 *   createWheelTracker(opts)   dokunmatik DİREKSİYON: parmak merkez çevresinde döner, tekerlek açısı ±135° → steer ±1; bırakınca 6/sn geri yay
 *   createSliderTracker(opts)  dokunmatik KAYDIRICI: ilk dokunuş sıfır noktasıdır, yatay sapma steer; ölü bölge + geri yay
 *   pedalValue(relY, min)      pedal üzerindeki dikey konum → 0.6..1.0 analog değer
 *   steerCurve(x, speed)       merkez çevresinde hassasiyet (hızla artan üs); tam kilit korunur
 *   slew(cur, target, up, down, dt)   sabit hızda yaklaşma (tuş yumuşatma)
 *   padDrive(pad, cfg, out)    standart oyun kolu: sol çubuk x = direksiyon, RT gaz, LT fren/geri, A nitro, B el freni
 *   laneAssist(tele, out)      şerit yardımı: şerit merkezine ≤ 0.25 direksiyon payı (yalnız |sürücü direksiyonu| < 0.1 iken)
 *   radioIndexForCode(code)    Digit1..9 / Numpad1..9 → 0..8
 *   driveKeyAction(code)       araç kipinde ezilen tuşlar → 'camera'|'horn'|'reset'|null
 * Tüm girdilerde NaN/Infinity güvenlidir (0 sayılır).
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Tekerlek kilidi (derece): ±135° → ±1. */
export const WHEEL_MAX_DEG = 135;
export const WHEEL_MAX_RAD = (WHEEL_MAX_DEG * Math.PI) / 180;
/** Bırakınca geri yay hızı (1/sn, üstel). */
export const SPRING_RATE = 6;
/** Direksiyon / kaydırıcı ölü bölgesi (|x| oranı). */
export const STEER_DEAD = 0.04;
export const SLIDER_DEAD = 0.07;
/** Tekerleğin merkezine bu orandan yakın dokunuşlarda açı belirsizdir: o hareketler yok sayılır. */
export const WHEEL_MIN_R = 0.14;
/** Gaz/fren pedalı alt sınırı (pedalın en altına basınca). */
export const PEDAL_MIN = 0.6;
/** Otomatik gaz payı. */
export const AUTO_THROTTLE = 0.7;
/** Tuş yumuşatma: tam kilide çıkış süresi (sn) ve geri dönüş süresi (sn). */
export const KEY_STEER_UP = 0.18;
export const KEY_STEER_DOWN = 0.12;
/** Radyo ön ayarı sayısı: 1–5 istasyon, 6 Sessiz (audioRadio.STATIONS ile aynı sıra; 7–9 tuşları tüketilir ama olay üretmez). */
export const RADIO_PRESETS = 6;
/** Şerit yardımı sınırı (direksiyon payı). */
export const ASSIST_MAX = 0.25;

const TWO_PI = Math.PI * 2;
function wrapPi(a) {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  else if (r <= -Math.PI) r += TWO_PI;
  return r;
}

/** cur'u target'a doğru sabit hızla (up: büyüyen |değer| saniye/1.0, down: küçülen) yaklaştırır. Yön değişiminde ikisinin hızlısı. */
export function slew(cur, target, upSec, downSec, dt) {
  const c = num(cur);
  const t = num(target);
  const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
  if (c === t) return c;
  const growing = Math.abs(t) > Math.abs(c) && c * t >= 0;
  const sec = growing ? upSec : downSec;
  const step = sec > 0 ? d / sec : Infinity;
  if (t > c) return Math.min(t, c + step);
  return Math.max(t, c - step);
}

/** Ölü bölge sonrası 0..1'e yeniden ölçekleme (işaret korunur). */
export function deadZone(x, dz) {
  const v = clamp(num(x), -1, 1);
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * ((a - dz) / (1 - dz));
}

/**
 * Hıza göre merkez hassasiyeti: us = 1 + 0.35·min(1, speed/30). |x|^us → küçük girdi daha yumuşak, tam kilit (1) aynen.
 * (Fizik zaten hızla direksiyon açısını azaltır; bu yalnız ince ayar çözünürlüğünü artırır.)
 */
export function steerCurve(x, speed) {
  const v = clamp(num(x), -1, 1);
  const sp = Math.max(0, num(speed));
  const us = 1 + 0.35 * Math.min(1, sp / 30);
  return Math.sign(v) * Math.pow(Math.abs(v), us);
}

/** Pedal üzerindeki dikey konum (0 üst, 1 alt) → 0.6 (en alt) .. 1.0 (en üst). */
export function pedalValue(relY, min) {
  const m = min === undefined ? PEDAL_MIN : min;
  const r = clamp(num(relY), 0, 1);
  return m + (1 - m) * (1 - r);
}

/* ------------------------------------------------------------------------------------------------
 * Direksiyon (tekerlek) izleyicisi
 * ---------------------------------------------------------------------------------------------- */
/**
 * state: { active, id, angle (rad, ±WHEEL_MAX_RAD), steer (−1..1, ölü bölge uygulanmış), cx, cy, r }
 * begin(id, x, y, cx, cy, r)   parmağın indiği nokta + tekerlek merkezi/yarıçapı (aynı koordinat uzayı)
 * move(id, x, y) → true: bu işaretçiye ait     end(id) → true: bu işaretçiyi bıraktı     cancel() her şeyi sıfırlar (durum: geri yay)
 * update(dt)     bırakılmışken geri yay: açı·exp(−6·dt)
 * Açı artışlı toplanır (wrap'li fark): parmak ±180° sınırını geçse bile sıçrama olmaz; sınıra dayanınca sınırda kalır, parmak dönünce hemen çözülür.
 */
export function createWheelTracker(opts) {
  const o = opts || {};
  const max = o.maxRad > 0 ? o.maxRad : WHEEL_MAX_RAD;
  const dead = o.dead === undefined ? STEER_DEAD : o.dead;
  const spring = o.spring === undefined ? SPRING_RATE : o.spring;
  const st = {
    active: false, id: null, angle: 0, steer: 0, cx: 0, cy: 0, r: 40,
  };
  let prevA = 0;
  let raw = 0;

  function recompute() {
    st.steer = deadZone(st.angle / max, dead);
  }
  function angleOf(x, y) {
    return Math.atan2(x - st.cx, -(y - st.cy));
  }
  return {
    state: st,
    max,
    begin(id, x, y, cx, cy, r) {
      if (st.active) return false;
      st.active = true;
      st.id = id;
      st.cx = num(cx);
      st.cy = num(cy);
      st.r = r > 0 ? r : 40;
      const px = num(x);
      const py = num(y);
      const d = Math.hypot(px - st.cx, py - st.cy);
      prevA = d >= st.r * WHEEL_MIN_R ? angleOf(px, py) : 0;
      raw = st.angle;
      return true;
    },
    move(id, x, y) {
      if (!st.active || id !== st.id) return false;
      const px = num(x);
      const py = num(y);
      const d = Math.hypot(px - st.cx, py - st.cy);
      if (d < st.r * WHEEL_MIN_R) return true;
      const a = angleOf(px, py);
      raw += wrapPi(a - prevA);
      prevA = a;
      raw = clamp(raw, -max, max);
      st.angle = raw;
      recompute();
      return true;
    },
    end(id) {
      if (!st.active || (id !== undefined && id !== null && id !== st.id)) return false;
      st.active = false;
      st.id = null;
      return true;
    },
    cancel() {
      st.active = false;
      st.id = null;
    },
    /** Erişilebilirlik: klavye/anahtar erişimiyle açıyı artırır (parmak yokken; bırakılınca geri yay işler). */
    nudge(rad) {
      if (st.active) return;
      st.angle = clamp(st.angle + num(rad), -max, max);
      raw = st.angle;
      recompute();
    },
    /** Sıfırlama: açıyı da bırakır (mod değişimi / araçtan inme). */
    reset() {
      st.active = false;
      st.id = null;
      st.angle = 0;
      st.steer = 0;
      raw = 0;
    },
    update(dt) {
      if (st.active) return;
      if (st.angle === 0) {
        st.steer = 0;
        return;
      }
      const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
      st.angle *= Math.exp(-spring * d);
      if (Math.abs(st.angle) < 0.004) st.angle = 0;
      raw = st.angle;
      recompute();
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Kaydırıcı izleyicisi (eğme gerektirmez)
 * ---------------------------------------------------------------------------------------------- */
/**
 * begin(id, x, halfRange): parmağın indiği x sıfırdır; halfRange px'lik sapma = ±1. move(id, x) → steer. Bırakınca 6/sn geri yay.
 * state: { active, id, value (−1..1 ham), steer (ölü bölge uygulanmış), x0, half }
 */
export function createSliderTracker(opts) {
  const o = opts || {};
  const dead = o.dead === undefined ? SLIDER_DEAD : o.dead;
  const spring = o.spring === undefined ? SPRING_RATE : o.spring;
  const st = {
    active: false, id: null, value: 0, steer: 0, x0: 0, half: 60,
  };
  return {
    state: st,
    begin(id, x, half) {
      if (st.active) return false;
      st.active = true;
      st.id = id;
      st.x0 = num(x);
      st.half = half > 0 ? half : 60;
      return true;
    },
    move(id, x) {
      if (!st.active || id !== st.id) return false;
      st.value = clamp((num(x) - st.x0) / st.half, -1, 1);
      st.steer = deadZone(st.value, dead);
      return true;
    },
    end(id) {
      if (!st.active || (id !== undefined && id !== null && id !== st.id)) return false;
      st.active = false;
      st.id = null;
      return true;
    },
    cancel() {
      st.active = false;
      st.id = null;
    },
    reset() {
      st.active = false;
      st.id = null;
      st.value = 0;
      st.steer = 0;
    },
    update(dt) {
      if (st.active) return;
      if (st.value === 0) {
        st.steer = 0;
        return;
      }
      const d = dt > 0 && Number.isFinite(dt) ? dt : 0;
      st.value *= Math.exp(-spring * d);
      if (Math.abs(st.value) < 0.004) st.value = 0;
      st.steer = deadZone(st.value, dead);
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Pedal izleyicisi (analog, çoklu dokunuşa yalıtılmış)
 * ---------------------------------------------------------------------------------------------- */
export function createPedalTracker(min) {
  const st = { active: false, id: null, value: 0 };
  return {
    state: st,
    begin(id, relY) {
      if (st.active) return false;
      st.active = true;
      st.id = id;
      st.value = pedalValue(relY, min);
      return true;
    },
    move(id, relY) {
      if (!st.active || id !== st.id) return false;
      st.value = pedalValue(relY, min);
      return true;
    },
    end(id) {
      if (!st.active || (id !== undefined && id !== null && id !== st.id)) return false;
      st.active = false;
      st.id = null;
      st.value = 0;
      return true;
    },
    cancel() {
      st.active = false;
      st.id = null;
      st.value = 0;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Tuşlar
 * ---------------------------------------------------------------------------------------------- */
/** Araç kipinde yürüme anlamı ezilen tuşlar. */
export function driveKeyAction(code) {
  if (code === 'KeyC') return 'camera';
  if (code === 'KeyH') return 'horn';
  if (code === 'KeyR') return 'reset';
  return null;
}

export function radioIndexForCode(code) {
  if (typeof code !== 'string') return -1;
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  return m ? Number(m[1]) - 1 : -1;
}

/* ------------------------------------------------------------------------------------------------
 * Oyun kolu
 * ---------------------------------------------------------------------------------------------- */
const btnVal = (b) => {
  if (!b) return 0;
  // analog tetik: pressed eşiği (≈0.5) değeri 1'e çıkarmasın → value öncelikli; value yoksa pressed
  if (typeof b.value === 'number' && Number.isFinite(b.value)) return clamp(b.value, 0, 1);
  return b.pressed ? 1 : 0;
};

/**
 * pad: Standard Gamepad. cfg: {deadZone}. out: {steer, throttle, brake, nitro, handbrake, active}.
 * Sol çubuk x = direksiyon (dairesel olmayan eksen ölü bölgesi), RT (7) gaz, LT (6) fren/geri, A (0) nitro, B (1) el freni. Tetik yoksa sol çubuk y yedek.
 */
export function padDrive(pad, cfg, out) {
  out.steer = 0;
  out.throttle = 0;
  out.brake = 0;
  out.nitro = false;
  out.handbrake = false;
  out.active = false;
  if (!pad || !pad.axes || !pad.buttons) return out;
  const dz = cfg && cfg.deadZone > 0 ? cfg.deadZone : 0.18;
  out.steer = deadZone(pad.axes[0], dz);
  const rt = btnVal(pad.buttons[7]);
  const lt = btnVal(pad.buttons[6]);
  out.throttle = rt > 0.05 ? rt : 0;
  out.brake = lt > 0.05 ? lt : 0;
  const ly = -deadZone(pad.axes[1], dz);
  if (out.throttle === 0 && ly > 0) out.throttle = ly;
  if (out.brake === 0 && ly < 0) out.brake = -ly;
  out.nitro = btnVal(pad.buttons[0]) >= 0.5;
  out.handbrake = btnVal(pad.buttons[1]) >= 0.5;
  out.active = out.steer !== 0 || out.throttle > 0 || out.brake > 0 || out.nitro || out.handbrake;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Şerit yardımı
 * ---------------------------------------------------------------------------------------------- */
const ASSIST_MIN_SPEED = 5;
const ASSIST_MAX_HEADING = 0.35; // rad
const ASSIST_MAX_OFFSET = 2.4; // m
const KE = 0.1; // yanal sapma kazancı (direksiyon/m, 18 m/sn'de; hızla ters orantılı — çevrim hızı sabit kalır)
const KH = 1.8; // yön hatası kazancı (direksiyon/rad): sönüm terimi (ζ ≈ 0.8); kapalı çevrim testiyle ayarlandı (inputVehicleAssist.test.js)

/**
 * tele: { speed, x, z, yaw } araç; lane: { x, z, yaw } şerit merkezi (roadSnapFor sonucu). out: { steer }.
 * Dönüş: assist ∈ [−0.25, 0.25] (+ sağ). Aralık dışı (düşük hız, yola dik, şeritten uzak) → 0.
 * İşaret: e > 0 (araç şerit merkezinin SAĞINDA) → sola (−) çevir; yön hatası h = yaw − laneYaw > 0 (araç solu gösteriyor) → sağa (+) çevir.
 */
export function laneAssist(tele, lane) {
  if (!tele || !lane) return 0;
  const sp = num(tele.speed);
  if (!(sp >= ASSIST_MIN_SPEED)) return 0;
  const h = wrapPi(num(tele.yaw) - num(lane.yaw));
  if (Math.abs(h) > ASSIST_MAX_HEADING) return 0;
  const rx = Math.cos(lane.yaw);
  const rz = -Math.sin(lane.yaw);
  const e = (num(tele.x) - num(lane.x)) * rx + (num(tele.z) - num(lane.z)) * rz;
  if (Math.abs(e) > ASSIST_MAX_OFFSET) return 0;
  const fade = 1 - Math.abs(e) / ASSIST_MAX_OFFSET * 0.4;
  return clamp((-KE * (18 / Math.max(8, sp)) * e + KH * h) * fade, -ASSIST_MAX, ASSIST_MAX);
}

/**
 * Sürücünün kendi direksiyonu ile yardımı birleştirir: yardım yalnız |sürücü| < 0.1 iken tam, 0.1'de sıfır (doğrusal); toplam [−1, 1].
 */
export function mixAssist(driverSteer, assist) {
  const d = num(driverSteer);
  const a = Math.abs(d);
  const k = a >= 0.1 ? 0 : 1 - a / 0.1;
  return clamp(d + num(assist) * k, -1, 1);
}
