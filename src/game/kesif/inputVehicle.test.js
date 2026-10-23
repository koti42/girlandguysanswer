// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVehicleInput, VEHICLE_BUTTONS } from './inputVehicle.js';
import { createKesifInput } from './input.js';
import { touchButtonDef, TOUCH_BUTTONS } from './inputMath.js';
import { AUTO_THROTTLE, WHEEL_MAX_RAD } from './inputVehicleMath.js';

const DT = 1 / 60;
const KEYS0 = Object.freeze({
  forward: false, back: false, left: false, right: false, jump: false, sprint: false,
});
const keys = (o) => Object.assign({}, KEYS0, o);
const step = (c, n, k, pad) => {
  let o = null;
  for (let i = 0; i < n; i++) o = c.update(DT, k || KEYS0, pad || null);
  return o;
};

describe('createVehicleInput: kip ve çıktı', () => {
  it('kapalıyken update null döner; açılınca nesne; kapanınca yine null', () => {
    const c = createVehicleInput();
    expect(c.active).toBe(false);
    expect(c.update(DT, KEYS0)).toBeNull();
    c.setActive(true);
    expect(c.active).toBe(true);
    expect(c.update(DT, KEYS0)).toBe(c.out);
    c.setActive(false);
    expect(c.update(DT, KEYS0)).toBeNull();
  });

  it('klavye: W gaz (yumuşak yükselir), S fren, A/D direksiyon 0.18 sn rampa, bırakınca 0.12 sn', () => {
    const c = createVehicleInput();
    c.setActive(true);
    let o = step(c, 1, keys({ forward: true }));
    expect(o.throttle).toBeGreaterThan(0);
    expect(o.throttle).toBeLessThan(0.3);
    o = step(c, 12, keys({ forward: true }));
    expect(o.throttle).toBe(1);
    o = step(c, 1, keys({}));
    expect(o.throttle).toBe(0); // bırakınca anında
    o = step(c, 1, keys({ back: true }));
    expect(o.brake).toBe(1);
    // direksiyon: 0.18 sn'de tam kilit
    c.setActive(false);
    c.setActive(true);
    o = step(c, 5, keys({ right: true }));
    expect(o.steer).toBeGreaterThan(0.4);
    expect(o.steer).toBeLessThan(0.6);
    o = step(c, 8, keys({ right: true }));
    expect(o.steer).toBeCloseTo(1, 9);
    o = step(c, 4, keys({}));
    expect(o.steer).toBeGreaterThan(0.2);
    expect(o.steer).toBeLessThan(0.8);
    o = step(c, 10, keys({}));
    expect(o.steer).toBe(0);
    o = step(c, 20, keys({ left: true }));
    expect(o.steer).toBeCloseTo(-1, 9);
    o = step(c, 20, keys({ left: true, right: true }));
    expect(Math.abs(o.steer)).toBeLessThan(1e-9);
  });

  it('Space el freni + zıplama (hop), Shift nitro; steerDirect her zaman true', () => {
    const c = createVehicleInput();
    c.setActive(true);
    const o = step(c, 2, keys({ jump: true, sprint: true }));
    expect(o.handbrake).toBe(true);
    expect(o.hop).toBe(true);
    expect(o.nitro).toBe(true);
    expect(o.steerDirect).toBe(true);
    const o2 = step(c, 2, keys({}));
    expect(o2.handbrake).toBe(false);
    expect(o2.nitro).toBe(false);
  });

  it('kenar alanları TEK OKUMALIK: kamera/korna/yola yerleştir (çok adımda bir kez, adım yoksa kaybolmaz)', () => {
    const c = createVehicleInput();
    c.setActive(true);
    expect(c.keyDown('KeyC')).toBe(true);
    expect(c.keyDown('KeyH')).toBe(true);
    expect(c.keyDown('KeyR')).toBe(true);
    c.update(DT, KEYS0); // adım atılmayan kare: kenar hâlâ bekler
    c.update(DT, KEYS0);
    expect(c.out.cameraPressed).toBe(true);
    expect(c.out.cameraPressed).toBe(false); // ikinci sabit adım görmez
    expect(c.out.hornPressed).toBe(true);
    expect(c.out.hornPressed).toBe(false);
    expect(c.out.resetPressed).toBe(true);
    expect(c.out.resetPressed).toBe(false);
  });

  it('kenar alanları numaralandırılabilir (nesne yayılımında kaybolmaz) ve yazılamaz yan etki yok', () => {
    const c = createVehicleInput();
    c.setActive(true);
    const keysOf = Object.keys(c.out);
    ['cameraPressed', 'hornPressed', 'resetPressed', 'steer', 'throttle', 'brake', 'handbrake', 'nitro', 'hop', 'steerDirect'].forEach((k) => expect(keysOf).toContain(k));
  });

  it('araç kipi kapalıyken tuşlar tüketilmez ve kenar birikmez; kapanışta bekleyen kenarlar silinir', () => {
    const c = createVehicleInput();
    expect(c.keyDown('KeyC')).toBe(false);
    expect(c.handlesKey('KeyC')).toBe(false);
    c.setActive(true);
    c.keyDown('KeyH');
    c.setActive(false);
    c.setActive(true);
    expect(c.out.hornPressed).toBe(false);
  });

  it('1–9 radyo ön ayarı olay üretir; diğer tuşlar tüketilmez', () => {
    const ev = [];
    const c = createVehicleInput({ onEvent: (t, x) => ev.push([t, x]) });
    c.setActive(true);
    expect(c.keyDown('Digit3')).toBe(true);
    expect(ev).toEqual([['radioSet', { index: 2 }]]);
    expect(c.keyDown('Digit8')).toBe(true); // 7–9: tüketilir ama istasyon yok → olay yok
    expect(ev).toHaveLength(1);
    expect(c.keyDown('KeyW')).toBe(false);
    expect(c.keyDown('Digit0')).toBe(false);
    expect(c.handlesKey('Digit9')).toBe(true);
    expect(c.handlesKey('KeyF')).toBe(false); // F bin/in hâlâ etkileşim
  });

  it('dokunmatik düğmeler: tutma (vhandbrake, vnitro) bırakınca söner; dokunuş (vcamera, vhorn, vreset) kenar; vradio olay', () => {
    const ev = [];
    const c = createVehicleInput({ onEvent: (t, x) => ev.push([t, x]) });
    c.setActive(true);
    expect(c.press('vhandbrake', true)).toBe(true);
    expect(c.press('vnitro', true)).toBe(true);
    let o = step(c, 1, KEYS0);
    expect(o.handbrake).toBe(true);
    expect(o.hop).toBe(true);
    expect(o.nitro).toBe(true);
    c.press('vhandbrake', false);
    c.press('vnitro', false);
    o = step(c, 1, KEYS0);
    expect(o.handbrake).toBe(false);
    expect(o.nitro).toBe(false);
    c.press('vcamera', true);
    c.press('vcamera', false); // bırakmak ikinci kenar üretmez
    expect(c.out.cameraPressed).toBe(true);
    expect(c.out.cameraPressed).toBe(false);
    c.press('vhorn', true);
    expect(c.out.hornPressed).toBe(true);
    c.press('vreset', true);
    expect(c.out.resetPressed).toBe(true);
    c.press('vradio', true);
    c.press('vradio', false);
    expect(ev).toEqual([['radioNext', undefined]]);
    expect(c.press('bilinmeyen', true)).toBe(false);
    expect(c.press('constructor', true)).toBe(false);
    VEHICLE_BUTTONS.forEach((n) => expect(touchButtonDef(n)).not.toBeNull());
  });

  it('araç kipi kapalıyken düğme basışı etkisizdir (takılı kalmaz)', () => {
    const c = createVehicleInput();
    c.press('vhandbrake', true);
    c.press('vcamera', true);
    c.setActive(true);
    const o = step(c, 1, KEYS0);
    expect(o.handbrake).toBe(false);
    expect(c.out.cameraPressed).toBe(false);
  });

  it('dokunmatik gaz/fren pedalı analog; otomatik gaz %70 tabanı (fren veya el freni basılıysa yok)', () => {
    const c = createVehicleInput();
    c.setActive(true);
    c.gas.begin(1, 0.5);
    let o = step(c, 1, KEYS0);
    expect(o.throttle).toBeCloseTo(0.8, 9);
    c.gas.end(1);
    c.brake.begin(2, 0);
    o = step(c, 1, KEYS0);
    expect(o.brake).toBeCloseTo(1, 9);
    c.brake.end(2);
    c.setOption('autoThrottle', true);
    o = step(c, 1, KEYS0);
    expect(o.throttle).toBeCloseTo(AUTO_THROTTLE, 9);
    c.gas.begin(3, 0);
    o = step(c, 1, KEYS0);
    expect(o.throttle).toBe(1);
    c.gas.end(3);
    c.brake.begin(4, 0.5);
    o = step(c, 1, KEYS0);
    expect(o.throttle).toBe(0);
    c.brake.end(4);
    c.press('vhandbrake', true);
    o = step(c, 1, KEYS0);
    expect(o.throttle).toBe(0);
    c.setOption('autoThrottle', false);
    c.press('vhandbrake', false);
    o = step(c, 1, KEYS0);
    expect(o.throttle).toBe(0);
  });

  it('dokunmatik direksiyon: açı → steer; steerMode kaydırıcı; geri yay; pointerEnd tüm izleyicileri bırakır', () => {
    const c = createVehicleInput();
    c.setActive(true);
    c.wheel.begin(5, 100, 50, 100, 100, 60);
    c.wheel.move(5, 160, 100);
    let o = step(c, 1, KEYS0);
    expect(o.steer).toBeGreaterThan(0.5);
    c.pointerEnd(5);
    expect(c.wheel.state.active).toBe(false);
    o = step(c, 80, KEYS0);
    expect(o.steer).toBe(0);
    expect(c.setOption('steerMode', 'slider')).toBe(true);
    expect(c.getOptions().steerMode).toBe('slider');
    c.slider.begin(9, 200, 60);
    c.slider.move(9, 260);
    o = step(c, 1, KEYS0);
    expect(o.steer).toBeCloseTo(1, 5);
    // tekerlek artık etkisiz
    c.wheel.begin(6, 100, 50, 100, 100, 60);
    c.wheel.move(6, 160, 100);
    c.slider.end(9);
    o = step(c, 90, KEYS0);
    expect(o.steer).toBe(0);
    expect(c.setOption('bilinmeyen', 1)).toBe(false);
    c.setOption('steerMode', 'qwerty');
    expect(c.getOptions().steerMode).toBe('wheel');
  });

  it('klavye ve dokunmatik direksiyon toplanır ama [-1,1] kıskaçta', () => {
    const c = createVehicleInput();
    c.setActive(true);
    c.wheel.begin(1, 100, 50, 100, 100, 60);
    c.wheel.move(1, 160, 100);
    const o = step(c, 30, keys({ right: true }));
    expect(o.steer).toBeLessThanOrEqual(1);
    expect(o.steer).toBeGreaterThan(0.99);
  });

  it('oyun kolu: RT gaz, LT fren, A nitro, sol çubuk direksiyon', () => {
    const c = createVehicleInput();
    c.setActive(true);
    const b = [];
    for (let i = 0; i < 16; i++) b.push({ pressed: false, value: 0 });
    b[7] = { pressed: true, value: 0.9 };
    b[0] = { pressed: true, value: 1 };
    const o = step(c, 1, KEYS0, { axes: [-0.8, 0, 0, 0], buttons: b });
    expect(o.throttle).toBeCloseTo(0.9, 9);
    expect(o.nitro).toBe(true);
    expect(o.steer).toBeLessThan(-0.5);
  });

  it('oyun kolu olayı eşleme: kamera/korna/yola yerleştir/radyo; uç/bırak yutulur; diğerleri geçer', () => {
    const ev = [];
    const c = createVehicleInput({ onEvent: (t, x) => ev.push([t, x]) });
    expect(c.mapPadEvent('camera')).toBe(false); // kip kapalı
    c.setActive(true);
    expect(c.mapPadEvent('camera')).toBe(true);
    expect(c.out.cameraPressed).toBe(true);
    expect(c.mapPadEvent('ability2')).toBe(true);
    expect(c.out.hornPressed).toBe(true);
    expect(c.mapPadEvent('ability1')).toBe(true);
    expect(c.out.resetPressed).toBe(true);
    expect(c.mapPadEvent('hotbarDelta', { delta: -1 })).toBe(true);
    expect(c.mapPadEvent('hotbarDelta', { delta: 1 })).toBe(true);
    expect(ev).toEqual([['radioPrev', undefined], ['radioNext', undefined]]);
    expect(c.mapPadEvent('fly')).toBe(true);
    expect(c.mapPadEvent('drop')).toBe(true);
    expect(c.mapPadEvent('inventory')).toBe(false);
    expect(c.mapPadEvent('pause')).toBe(false);
  });

  it('şerit yardımı: dokunmatikte otomatik açık, klavyede kapalı; seçenekle zorlanır; sürücü direksiyonu varsa kapanır', () => {
    let touch = true;
    const tele = {
      speed: 20, x: 1.5, y: 64, z: 0, yaw: 0, snap: () => ({ x: 0, z: 0, yaw: 0 }),
    };
    const c = createVehicleInput({ isTouch: () => touch, getTelemetry: () => tele });
    c.setActive(true);
    let o = step(c, 30, KEYS0);
    expect(o.steer).toBeLessThan(-0.05); // sağdaki araç sola çevrilir
    expect(o.steer).toBeGreaterThanOrEqual(-0.25 - 1e-9);
    touch = false;
    o = step(c, 30, KEYS0);
    expect(o.steer).toBe(0);
    c.setOption('laneAssist', true);
    o = step(c, 30, KEYS0);
    expect(o.steer).toBeLessThan(-0.05);
    c.setOption('laneAssist', false);
    touch = true;
    o = step(c, 30, KEYS0);
    expect(o.steer).toBe(0);
    c.setOption('laneAssist', null);
    // sürücü sağa çeviriyorsa yardım karışmaz
    o = step(c, 30, keys({ right: true }));
    expect(o.steer).toBeCloseTo(1, 9);
  });

  it('releaseAll: basılı her şey sıfırlanır', () => {
    const c = createVehicleInput();
    c.setActive(true);
    c.wheel.begin(1, 100, 50, 100, 100, 60);
    c.wheel.move(1, 160, 100);
    c.gas.begin(2, 0);
    c.brake.begin(3, 0);
    c.press('vnitro', true);
    c.press('vhandbrake', true);
    step(c, 10, keys({ forward: true, right: true }));
    c.releaseAll();
    expect(c.wheel.state.active).toBe(false);
    expect(c.gas.state.active).toBe(false);
    expect(c.brake.state.active).toBe(false);
    const o = c.update(DT, KEYS0);
    expect(o.throttle).toBe(0);
    expect(o.brake).toBe(0);
    expect(o.nitro).toBe(false);
    expect(o.handbrake).toBe(false);
    expect(Math.abs(o.steer)).toBeGreaterThan(0.2); // tekerlek açısı sıçramaz: geri yaylanır
    expect(step(c, 90, KEYS0).steer).toBe(0);
  });

  it('NaN/Infinity: dt, tuşlar, kol, telemetri bozuk olsa da çıktı sonlu ve sınırlı', () => {
    const tele = {
      speed: NaN, x: NaN, y: NaN, z: Infinity, yaw: NaN, snap: () => ({ x: NaN, z: NaN, yaw: NaN }),
    };
    const c = createVehicleInput({ getTelemetry: () => tele, isTouch: () => true });
    c.setActive(true);
    c.wheel.begin(1, NaN, NaN, NaN, NaN, NaN);
    c.wheel.move(1, Infinity, NaN);
    const bad = [NaN, Infinity, -1, 0, undefined];
    bad.forEach((dt) => {
      const o = c.update(dt, keys({ forward: true, right: true }), { axes: [NaN, NaN], buttons: [{ value: NaN }, null, undefined] });
      ['steer', 'throttle', 'brake'].forEach((k) => expect(Number.isFinite(o[k])).toBe(true));
      expect(Math.abs(o.steer)).toBeLessThanOrEqual(1);
      expect(o.throttle).toBeGreaterThanOrEqual(0);
      expect(o.throttle).toBeLessThanOrEqual(1);
    });
    expect(Number.isFinite(WHEEL_MAX_RAD)).toBe(true);
  });

  it('fuzz: rastgele olay/girdi akışı sonrası çıktı daima geçerli', () => {
    let s = 987;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const c = createVehicleInput({ isTouch: () => rnd() < 0.5, getTelemetry: () => ({ speed: rnd() * 50, x: rnd() * 5, y: 64, z: 0, yaw: rnd() - 0.5, snap: () => ({ x: 0, z: 0, yaw: 0 }) }) });
    c.setActive(true);
    const codes = ['KeyC', 'KeyH', 'KeyR', 'Digit1', 'KeyW', 'Numpad4'];
    for (let i = 0; i < 4000; i++) {
      const r = rnd();
      if (r < 0.05) c.keyDown(codes[Math.floor(rnd() * codes.length)]);
      else if (r < 0.1) c.press(VEHICLE_BUTTONS[Math.floor(rnd() * 6)], rnd() < 0.5);
      else if (r < 0.15) c.wheel.begin(Math.floor(rnd() * 3), rnd() * 200, rnd() * 200, 100, 100, 60);
      else if (r < 0.2) c.pointerEnd(Math.floor(rnd() * 3));
      else if (r < 0.25) c.wheel.move(Math.floor(rnd() * 3), rnd() * 200, rnd() * 200);
      else if (r < 0.27) c.gas.begin(Math.floor(rnd() * 3), rnd());
      else if (r < 0.29) c.brake.begin(Math.floor(rnd() * 3), rnd());
      else if (r < 0.3) c.releaseAll();
      else if (r < 0.31) c.setActive(rnd() < 0.8);
      const o = c.update(DT, keys({ forward: rnd() < 0.5, back: rnd() < 0.2, left: rnd() < 0.3, right: rnd() < 0.3, jump: rnd() < 0.1, sprint: rnd() < 0.1 }), null);
      if (o) {
        expect(Math.abs(o.steer)).toBeLessThanOrEqual(1);
        expect(o.throttle).toBeGreaterThanOrEqual(0);
        expect(o.throttle).toBeLessThanOrEqual(1);
        expect(o.brake).toBeGreaterThanOrEqual(0);
        expect(o.brake).toBeLessThanOrEqual(1);
      }
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * createKesifInput entegrasyonu
 * ---------------------------------------------------------------------------------------------- */
let clock = 0;
const now = () => clock;

function rig(opts) {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  const button = document.createElement('button');
  container.append(canvas, button);
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400,
  });
  let driving = false;
  const callbacks = {
    onGesture: vi.fn(), onHaptic: vi.fn(), isVehicleMode: () => driving,
  };
  const input = createKesifInput({
    container, canvas, controls: 'desktop', now, ...opts, callbacks: Object.assign(callbacks, (opts && opts.callbacks) || null),
  });
  return {
    container, canvas, button, input, callbacks, setDriving: (v) => { driving = v; },
  };
}
function key(type, code, props) {
  const e = new KeyboardEvent(type, {
    code, key: code, bubbles: true, cancelable: true, ...props,
  });
  window.dispatchEvent(e);
  return e;
}
const down = (c, p) => key('keydown', c, p);
const up = (c) => key('keyup', c);
function ptr(target, type, props) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 0, clientY: 0, button: 0, ...props,
  });
  target.dispatchEvent(e);
  return e;
}
const frame = (r) => {
  clock += 16;
  return r.input.getState(1 / 60);
};

describe('createKesifInput: sürüş kipi entegrasyonu', () => {
  let r;
  beforeEach(() => {
    clock = 1000;
    r = rig();
  });
  afterEach(() => {
    r.input.dispose();
    r.container.remove();
  });

  it('araç kipi yokken state.vehicle null ve yürüme davranışı değişmez', () => {
    down('KeyW');
    down('Space');
    const s = frame(r);
    expect(s.vehicle).toBeNull();
    expect(s.moveZ).toBe(1);
    expect(s.jump).toBe(true);
    // R = üret, C = çömel, H yok sayılır
    down('KeyR');
    down('KeyC');
    expect(r.input.consumeEvents().map((e) => e.type)).toEqual(['craft']);
    expect(frame(r).crouch).toBe(true);
  });

  it('araçtayken state.vehicle dolar: W gaz, A/D direksiyon, S fren, Space el freni, Shift nitro', () => {
    r.setDriving(true);
    down('KeyW');
    down('KeyD');
    down('Space');
    down('ShiftLeft');
    let s = null;
    for (let i = 0; i < 20; i++) s = frame(r);
    expect(s.vehicle).toBeTruthy();
    expect(s.vehicle.throttle).toBe(1);
    expect(s.vehicle.steer).toBeCloseTo(1, 5);
    expect(s.vehicle.handbrake).toBe(true);
    expect(s.vehicle.nitro).toBe(true);
    up('KeyW');
    up('KeyD');
    up('Space');
    up('ShiftLeft');
    down('KeyS');
    for (let i = 0; i < 20; i++) s = frame(r);
    expect(s.vehicle.brake).toBe(1);
    expect(s.vehicle.throttle).toBe(0);
    expect(s.vehicle.handbrake).toBe(false);
    r.setDriving(false);
    expect(frame(r).vehicle).toBeNull();
  });

  it('araçtayken C kamera, H korna, R yola yerleştir kenar olarak gelir ve yürüme eylemi (çömel/üret) üretmez', () => {
    r.setDriving(true);
    frame(r);
    const kC = down('KeyC');
    down('KeyH');
    down('KeyR');
    expect(kC.defaultPrevented).toBe(true);
    const s = frame(r);
    expect(s.crouch).toBe(false);
    expect(r.input.consumeEvents()).toEqual([]);
    expect(s.vehicle.cameraPressed).toBe(true);
    expect(s.vehicle.hornPressed).toBe(true);
    expect(s.vehicle.resetPressed).toBe(true);
    expect(s.vehicle.cameraPressed).toBe(false);
    // tuş tekrarı yeniden tetiklemez
    down('KeyC', { repeat: true });
    const s2 = frame(r);
    expect(s2.vehicle.cameraPressed).toBe(false);
  });

  it('araçtayken 1–9 radyo ön ayarı olayı verir (hotbar değil)', () => {
    r.setDriving(true);
    frame(r);
    down('Digit2');
    down('Digit6');
    down('Digit8'); // yok: 7–9 olay üretmez
    expect(r.input.consumeEvents()).toEqual([
      { type: 'radioSet', index: 1 },
      { type: 'radioSet', index: 5 },
    ]);
    r.setDriving(false);
    frame(r);
    down('Digit2');
    expect(r.input.consumeEvents()).toEqual([{ type: 'hotbarSet', index: 1 }]);
  });

  it('F hâlâ etkileşim (araçtan inme) kenarıdır', () => {
    r.setDriving(true);
    frame(r);
    down('KeyF');
    const s = frame(r);
    expect(s.interactPressed).toBe(true);
  });

  it('araçtayken fare tıklaması/tekerleği kır-yerleştir-hotbar üretmez', () => {
    r.setDriving(true);
    frame(r);
    const m = (type, props) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { button: 0, ...props });
      r.container.dispatchEvent(e);
    };
    m('mousedown', { button: 0 });
    m('mousedown', { button: 2 });
    const w = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(w, { deltaY: 400, deltaMode: 0 });
    r.container.dispatchEvent(w);
    const s = frame(r);
    expect(s.attackPressed).toBe(false);
    expect(s.placePressed).toBe(false);
    expect(s.breakHeld).toBe(false);
    expect(r.input.consumeEvents()).toEqual([]);
  });

  it('araçtayken serbest alana dokunmak joystick/bakış/yerleştirme başlatmaz', () => {
    const t = rig({ controls: 'touch' });
    t.setDriving(true);
    t.input.getState(1 / 60);
    ptr(t.container, 'pointerdown', { pointerId: 4, clientX: 100, clientY: 200 });
    ptr(window, 'pointermove', { pointerId: 4, clientX: 160, clientY: 200 });
    ptr(window, 'pointerup', { pointerId: 4, clientX: 160, clientY: 200 });
    ptr(t.container, 'pointerdown', { pointerId: 5, clientX: 600, clientY: 200 });
    ptr(window, 'pointerup', { pointerId: 5, clientX: 600, clientY: 200 });
    const s = t.input.getState(1 / 60);
    expect(s.moveX).toBe(0);
    expect(s.moveZ).toBe(0);
    expect(s.placePressed).toBe(false);
    expect(t.input.getJoystickView().active).toBe(false);
    t.input.dispose();
    t.container.remove();
  });

  it('pointercancel direksiyonu/pedalı bırakır; blur ve gizlenme her şeyi sıfırlar', () => {
    r.setDriving(true);
    frame(r);
    const veh = r.input.vehicle;
    veh.wheel.begin(7, 100, 50, 100, 100, 60);
    veh.wheel.move(7, 160, 100);
    veh.gas.begin(8, 0);
    veh.brake.begin(9, 0);
    expect(frame(r).vehicle.throttle).toBe(1);
    ptr(window, 'pointercancel', { pointerId: 7 });
    expect(veh.wheel.state.active).toBe(false);
    expect(veh.gas.state.active).toBe(true); // başka işaretçi etkilenmez
    ptr(window, 'pointercancel', { pointerId: 8 });
    expect(veh.gas.state.active).toBe(false);
    expect(veh.brake.state.active).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(veh.brake.state.active).toBe(false);
    down('KeyW');
    down('Space');
    for (let i = 0; i < 20; i++) frame(r);
    veh.press('vnitro', true);
    window.dispatchEvent(new Event('blur'));
    const s = frame(r);
    expect(s.vehicle.throttle).toBe(0);
    expect(s.vehicle.handbrake).toBe(false);
    expect(s.vehicle.nitro).toBe(false);
    // sekme gizlenince de
    down('KeyW');
    for (let i = 0; i < 20; i++) frame(r);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frame(r).vehicle.throttle).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('pressButton: sürüş düğmeleri denetleyiciye gider; yürüme düğmeleri eskisi gibi', () => {
    r.setDriving(true);
    frame(r);
    expect(r.input.pressButton('vnitro', true)).toBe(true);
    expect(frame(r).vehicle.nitro).toBe(true);
    r.input.pressButton('vnitro', false);
    expect(frame(r).vehicle.nitro).toBe(false);
    r.input.pressButton('vhorn', true);
    expect(frame(r).vehicle.hornPressed).toBe(true);
    r.input.pressButton('vradio', true);
    expect(r.input.consumeEvents()).toEqual([{ type: 'radioNext' }]);
    expect(r.input.pressButton('interact', true)).toBe(true);
    expect(frame(r).interactPressed).toBe(true);
    expect(r.input.pressButton('hakkinda-yok', true)).toBe(false);
  });

  it('setVehicleMode elle açar (geri çağrı yoksa); gamepad olayları eşlenir', () => {
    const t = rig({ callbacks: { isVehicleMode: undefined } });
    t.input.setVehicleMode(true);
    expect(t.input.getState(1 / 60).vehicle).toBeTruthy();
    t.input.setVehicleMode(false);
    expect(t.input.getState(1 / 60).vehicle).toBeNull();
    t.input.dispose();
    t.container.remove();
  });

  it('gamepad: araçtayken RT gaz, LT fren, kamera/korna eşlemesi, çift A uç olayı yutulur', () => {
    const buttons = [];
    for (let i = 0; i < 16; i++) buttons.push({ pressed: false, value: 0 });
    const pad = {
      connected: true, axes: [0.9, 0, 0, 0], buttons,
    };
    const t = rig({ getGamepads: () => [pad] });
    t.setDriving(true);
    buttons[7] = { pressed: true, value: 0.7 };
    let s = t.input.getState(1 / 60);
    expect(s.vehicle.throttle).toBeCloseTo(0.7, 5);
    expect(s.vehicle.steer).toBeGreaterThan(0.5);
    buttons[7] = { pressed: false, value: 0 };
    buttons[12] = { pressed: true, value: 1 }; // yukarı: yürümede kamera, araçta araç kamerası
    buttons[5] = { pressed: true, value: 1 }; // RB: yürümede yetenek 2, araçta korna
    clock += 16;
    s = t.input.getState(1 / 60);
    expect(s.vehicle.cameraPressed).toBe(true);
    expect(s.vehicle.hornPressed).toBe(true);
    expect(t.input.consumeEvents()).toEqual([]);
    t.input.dispose();
    t.container.remove();
  });

  it('TOUCH_BUTTONS: sürüş düğmeleri benzersiz, Türkçe, geçerli tür', () => {
    ['vhandbrake', 'vnitro', 'vcamera', 'vhorn', 'vradio', 'vreset'].forEach((n) => {
      expect(TOUCH_BUTTONS.filter((b) => b.name === n)).toHaveLength(1);
      expect(touchButtonDef(n).label.length).toBeGreaterThan(2);
    });
    expect(touchButtonDef('vnitro').kind).toBe('hold');
    expect(touchButtonDef('vhorn').kind).toBe('tap');
  });
});
