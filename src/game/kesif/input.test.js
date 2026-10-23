// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKesifInput, detectTouchDevice } from './input.js';
import { MOUSE_RAD_PER_PX, TOUCH_RAD_PER_PX } from './inputMath.js';

const DT = 1 / 60;
let clock = 0;
const now = () => clock;

function rig(opts = {}) {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  const noTap = document.createElement('div');
  noTap.setAttribute('data-no-tap', '');
  const button = document.createElement('button');
  container.append(canvas, noTap, button);
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  const callbacks = { onGesture: vi.fn(), onHaptic: vi.fn(), onLockChange: vi.fn(), onControlsChange: vi.fn(), onTouchView: vi.fn() };
  const merged = { ...callbacks, ...(opts.callbacks || {}) };
  const input = createKesifInput({ container, canvas, controls: 'desktop', now, ...opts, callbacks: merged });
  return { container, canvas, noTap, button, input, callbacks };
}

function key(type, code, props = {}) {
  const e = new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true, ...props });
  (props.target || window).dispatchEvent(e);
  return e;
}
const keyDown = (code, props) => key('keydown', code, props);
const keyUp = (code, props) => key('keyup', code, props);

function pointer(target, type, props = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 0, clientY: 0, button: 0, ...props });
  target.dispatchEvent(e);
  return e;
}

function mouse(target, type, props = {}) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...props });
  if (props.movementX !== undefined) Object.defineProperty(e, 'movementX', { value: props.movementX });
  if (props.movementY !== undefined) Object.defineProperty(e, 'movementY', { value: props.movementY });
  target.dispatchEvent(e);
  return e;
}

function fakeLock(canvas) {
  let locked = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
  canvas.requestPointerLock = vi.fn(() => {
    locked = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    return Promise.resolve();
  });
  document.exitPointerLock = vi.fn(() => {
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  return {
    unlockExternally() {
      locked = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    },
  };
}

beforeEach(() => {
  clock = 1000;
});

afterEach(() => {
  document.body.innerHTML = '';
  try {
    delete document.pointerLockElement;
  } catch {
    // jsdom
  }
});

describe('klavye', () => {
  it('WASD hareketi, çapraz normalize, tuş bırakınca sıfır; aynı durum nesnesi', () => {
    const { input } = rig();
    const s0 = input.getState(DT);
    expect([s0.moveX, s0.moveZ]).toEqual([0, 0]);
    keyDown('KeyW');
    const s1 = input.getState(DT);
    expect(s1).toBe(s0);
    expect(s1.moveZ).toBe(1);
    keyDown('KeyD');
    expect(Math.hypot(input.getState(DT).moveX, input.getState(DT).moveZ)).toBeCloseTo(1, 6);
    expect(input.getState(DT).moveX).toBeGreaterThan(0);
    keyUp('KeyW');
    keyUp('KeyD');
    const s2 = input.getState(DT);
    expect([s2.moveX, s2.moveZ]).toEqual([0, 0]);
    input.dispose();
  });

  it('oklar da hareket eder; S geri', () => {
    const { input } = rig();
    keyDown('ArrowLeft');
    keyDown('KeyS');
    const s = input.getState(DT);
    expect(s.moveX).toBeLessThan(0);
    expect(s.moveZ).toBeLessThan(0);
    input.dispose();
  });

  it('Shift koşar, C ve Ctrl çömelir; Ctrl+W gibi birleşimde hareket tuşu yine çalışır', () => {
    const { input } = rig();
    keyDown('ShiftLeft');
    keyDown('KeyC');
    let s = input.getState(DT);
    expect([s.sprint, s.crouch]).toEqual([true, true]);
    keyUp('ShiftLeft');
    keyUp('KeyC');
    keyDown('ControlLeft', { ctrlKey: true });
    keyDown('KeyW', { ctrlKey: true });
    s = input.getState(DT);
    expect(s.crouch).toBe(true);
    expect(s.moveZ).toBe(1);
    input.dispose();
  });

  it('ayrık olaylar kuyruğa girer ve bir kez tüketilir', () => {
    const { input } = rig();
    keyDown('KeyE');
    keyDown('KeyQ');
    keyDown('F5');
    keyDown('Tab');
    keyDown('KeyR');
    keyDown('Digit3');
    keyDown('KeyZ');
    keyDown('KeyB');
    const ev = input.consumeEvents();
    expect(ev.map((e) => e.type)).toEqual(['inventory', 'drop', 'camera', 'map', 'craft', 'hotbarSet', 'ability1', 'ability4']);
    expect(ev[5].index).toBe(2);
    expect(ev[6].n).toBe(1);
    expect(input.consumeEvents()).toHaveLength(0);
    input.dispose();
  });

  it('tuş tekrarı (repeat) olayı yinelemez', () => {
    const { input } = rig();
    keyDown('KeyE');
    keyDown('KeyE', { repeat: true });
    keyDown('KeyE', { repeat: true });
    expect(input.consumeEvents()).toHaveLength(1);
    input.dispose();
  });

  it('F tuşu interactPressed (kenar) verir, olay kuyruğuna girmez', () => {
    const { input } = rig();
    keyDown('KeyF');
    expect(input.getState(DT).interactPressed).toBe(true);
    expect(input.getState(DT).interactPressed).toBe(false);
    expect(input.consumeEvents()).toHaveLength(0);
    input.dispose();
  });

  it('Space: jumpPressed bir kez, jump basılıyken; çok hızlı dokunuş da bir kare jump=true verir', () => {
    const { input } = rig();
    keyDown('Space');
    let s = input.getState(DT);
    expect([s.jump, s.jumpPressed]).toEqual([true, true]);
    s = input.getState(DT);
    expect([s.jump, s.jumpPressed]).toEqual([true, false]);
    keyUp('Space');
    expect(input.getState(DT).jump).toBe(false);
    keyDown('Space');
    keyUp('Space');
    s = input.getState(DT);
    expect([s.jump, s.jumpPressed]).toEqual([true, true]);
    input.dispose();
  });

  it('Space çift dokunuş fly olayı; yavaş ya da flyDoubleTap kapalıyken yok', () => {
    const a = rig();
    keyDown('Space');
    keyUp('Space');
    clock += 150;
    keyDown('Space');
    expect(a.input.consumeEvents().map((e) => e.type)).toEqual(['fly']);
    keyUp('Space');
    clock += 600;
    keyDown('Space');
    expect(a.input.consumeEvents()).toHaveLength(0);
    a.input.dispose();
    const b = rig({ settings: { flyDoubleTap: false } });
    keyDown('Space');
    keyUp('Space');
    clock += 100;
    keyDown('Space');
    expect(b.input.consumeEvents()).toHaveLength(0);
    b.input.dispose();
  });

  it('F5 ve Space varsayılan davranışı bastırılır; F12 ve Ctrl+R değil', () => {
    const { input } = rig();
    expect(keyDown('F5').defaultPrevented).toBe(true);
    expect(keyDown('Space').defaultPrevented).toBe(true);
    expect(keyDown('Tab').defaultPrevented).toBe(true);
    expect(keyDown('F12').defaultPrevented).toBe(false);
    expect(keyDown('KeyR', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(input.consumeEvents().map((e) => e.type)).not.toContain('craft');
    input.dispose();
  });

  it('isActive false iken hiçbir şey işlenmez ve varsayılan bastırılmaz', () => {
    let active = false;
    const { input } = rig({ isActive: () => active });
    expect(keyDown('Space').defaultPrevented).toBe(false);
    keyDown('KeyW');
    keyDown('KeyE');
    expect(input.consumeEvents()).toHaveLength(0);
    expect(input.getState(DT).moveZ).toBe(0);
    active = true;
    expect(input.getState(DT).moveZ).toBe(0);
    keyDown('KeyE');
    expect(input.consumeEvents()).toHaveLength(1);
    input.dispose();
  });

  it('metin kutusundayken tuşlar oyuna gitmez', () => {
    const { input, container } = rig();
    const field = document.createElement('input');
    container.appendChild(field);
    keyDown('KeyW', { target: field });
    keyDown('KeyE', { target: field });
    expect(input.getState(DT).moveZ).toBe(0);
    expect(input.consumeEvents()).toHaveLength(0);
    input.dispose();
  });

  it('odaktaki düğmede Space düğmenin kendisine aittir', () => {
    const { input, button } = rig();
    const e = keyDown('Space', { target: button });
    expect(e.defaultPrevented).toBe(false);
    expect(input.getState(DT).jumpPressed).toBe(false);
    input.dispose();
  });

  it('pencere odağı kaybedilince basılı tuşlar bırakılır (takılı tuş yok)', () => {
    const { input } = rig();
    keyDown('KeyW');
    keyDown('ShiftLeft');
    window.dispatchEvent(new Event('blur'));
    const s = input.getState(DT);
    expect([s.moveZ, s.sprint]).toEqual([0, false]);
    input.dispose();
  });

  it('sekme gizlenince de bırakılır', () => {
    const { input } = rig();
    keyDown('KeyD');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(input.getState(DT).moveX).toBe(0);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    input.dispose();
  });
});

describe('fare ve pointer lock', () => {
  it('ilk tıklama yalnızca yakalar (saldırı sayılmaz); kilitliyken sol tık kır/saldır, sağ tık yerleştir', () => {
    const { input, canvas } = rig();
    fakeLock(canvas);
    mouse(canvas, 'mousedown', { button: 0 });
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(canvas.requestPointerLock.mock.calls[0][0]).toEqual({ unadjustedMovement: true });
    let s = input.getState(DT);
    expect([s.attackPressed, s.breakHeld, s.locked]).toEqual([false, false, true]);
    expect(input.isLocked()).toBe(true);
    mouse(canvas, 'mousedown', { button: 0 });
    s = input.getState(DT);
    expect([s.attackPressed, s.breakHeld]).toEqual([true, true]);
    s = input.getState(DT);
    expect([s.attackPressed, s.breakHeld]).toEqual([false, true]);
    mouse(window, 'mouseup', { button: 0 });
    expect(input.getState(DT).breakHeld).toBe(false);
    mouse(canvas, 'mousedown', { button: 2 });
    s = input.getState(DT);
    expect([s.placePressed, s.placeHeld]).toEqual([true, true]);
    mouse(window, 'mouseup', { button: 2 });
    expect(input.getState(DT).placeHeld).toBe(false);
    input.dispose();
  });

  it('rawInput kapalıysa unadjustedMovement istenmez', () => {
    const { input, canvas } = rig({ settings: { rawInput: false } });
    fakeLock(canvas);
    input.requestPointerLock();
    expect(canvas.requestPointerLock.mock.calls[0][0]).toBeUndefined();
    input.dispose();
  });

  it('unadjustedMovement reddedilirse normal kilide düşer', async () => {
    const { input, canvas } = rig();
    fakeLock(canvas);
    let first = true;
    canvas.requestPointerLock = vi.fn(() => {
      if (first) {
        first = false;
        return Promise.reject(new Error('NotSupportedError'));
      }
      return Promise.resolve();
    });
    input.requestPointerLock();
    await Promise.resolve();
    await Promise.resolve();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
    input.dispose();
  });

  it('fare hareketi: radyan = px * sabit * hassasiyet; yukarı = lookDY +; invertY ters; tüketilir', () => {
    const { input, canvas } = rig({ settings: { sensitivity: 2 } });
    fakeLock(canvas);
    input.requestPointerLock();
    mouse(document, 'mousemove', { movementX: 100, movementY: -50 });
    let s = input.getState(DT);
    expect(s.lookDX).toBeCloseTo(100 * MOUSE_RAD_PER_PX * 2, 8);
    expect(s.lookDY).toBeCloseTo(50 * MOUSE_RAD_PER_PX * 2, 8);
    s = input.getState(DT);
    expect([s.lookDX, s.lookDY]).toEqual([0, 0]);
    input.setSettings({ invertY: true });
    mouse(document, 'mousemove', { movementX: 0, movementY: -50 });
    expect(input.getState(DT).lookDY).toBeLessThan(0);
    input.dispose();
  });

  it('birden çok fare olayı bir karede toplanır; sıçrama (>600 px) atılır; kilitli değilken yok sayılır', () => {
    const { input, canvas } = rig();
    mouse(document, 'mousemove', { movementX: 100, movementY: 0 });
    expect(input.getState(DT).lookDX).toBe(0);
    fakeLock(canvas);
    input.requestPointerLock();
    mouse(document, 'mousemove', { movementX: 10, movementY: 0 });
    mouse(document, 'mousemove', { movementX: 20, movementY: 0 });
    mouse(document, 'mousemove', { movementX: 5000, movementY: 0 });
    expect(input.getState(DT).lookDX).toBeCloseTo(30 * MOUSE_RAD_PER_PX, 8);
    input.dispose();
  });

  it('Esc ile kilit kaybı pause olayı üretir; releasePointerLock sessizdir', () => {
    const { input, canvas } = rig();
    const lock = fakeLock(canvas);
    input.requestPointerLock();
    lock.unlockExternally();
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['pause']);
    clock += 1000;
    input.requestPointerLock();
    expect(input.releasePointerLock()).toBe(true);
    expect(input.consumeEvents()).toHaveLength(0);
    expect(input.isLocked()).toBe(false);
    input.dispose();
  });

  it('Esc keydown ve kilit kaybı birlikte gelirse tek pause', () => {
    const { input, canvas } = rig();
    const lock = fakeLock(canvas);
    input.requestPointerLock();
    keyDown('Escape');
    lock.unlockExternally();
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['pause']);
    input.dispose();
  });

  it('kilit kaybı basılı fare düğmelerini bırakır', () => {
    const { input, canvas } = rig();
    const lock = fakeLock(canvas);
    input.requestPointerLock();
    mouse(canvas, 'mousedown', { button: 0 });
    expect(input.getState(DT).breakHeld).toBe(true);
    lock.unlockExternally();
    expect(input.getState(DT).breakHeld).toBe(false);
    input.dispose();
  });

  it('tekerlek hotbar değiştirir (aşağı = sonraki) ve sayfa kaydırmasını engeller', () => {
    const { input, canvas } = rig();
    const e = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(e, { deltaY: 100, deltaMode: 0 });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    const e2 = new Event('wheel', { bubbles: true, cancelable: true });
    Object.assign(e2, { deltaY: -100, deltaMode: 0 });
    canvas.dispatchEvent(e2);
    expect(input.consumeEvents()).toEqual([
      { type: 'hotbarDelta', delta: 1 },
      { type: 'hotbarDelta', delta: -1 },
    ]);
    input.dispose();
  });

  it('arayüz düğmesine tıklama oyun eylemi sayılmaz ve kilit istemez', () => {
    const { input, canvas, button } = rig();
    fakeLock(canvas);
    mouse(button, 'mousedown', { button: 0 });
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    input.dispose();
  });

  it('sağ tık menüsü engellenir', () => {
    const { input, canvas } = rig();
    const e = new Event('contextmenu', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    input.dispose();
  });

  it('pointer lock desteklenmiyorsa tıklama doğrudan eylem olur', () => {
    const { input, canvas } = rig();
    mouse(canvas, 'mousedown', { button: 0 });
    expect(input.getState(DT).attackPressed).toBe(true);
    input.dispose();
  });
});

describe('panel açıkken (setGameplayEnabled)', () => {
  it('hareket/bakış/eylem kapanır; yalnız panel olayları geçer; Tab serbest', () => {
    const { input } = rig();
    keyDown('KeyW');
    input.setGameplayEnabled(false);
    expect(input.gameplayEnabled).toBe(false);
    expect(input.getState(DT).moveZ).toBe(0);
    keyDown('KeyW');
    keyDown('KeyQ');
    keyDown('Digit2');
    keyDown('Space');
    const tab = keyDown('Tab');
    expect(tab.defaultPrevented).toBe(false);
    keyDown('KeyE');
    keyDown('Escape');
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['inventory', 'pause']);
    input.setGameplayEnabled(true);
    expect(input.getState(DT).moveZ).toBe(0); // basılı tuşlar bırakıldı
    input.dispose();
  });

  it('düğmeler: yalnız panel düğmeleri çalışır', () => {
    const { input } = rig();
    input.setGameplayEnabled(false);
    expect(input.pressButton('jump')).toBe(false);
    expect(input.pressButton('inventory')).toBe(true);
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['inventory']);
    input.dispose();
  });
});

describe('ekran düğmeleri (pressButton)', () => {
  it('basılı tutma düğmeleri: jump, break, place', () => {
    const { input } = rig();
    expect(input.pressButton('jump', true)).toBe(true);
    expect(input.pressButton('break', true)).toBe(true);
    expect(input.pressButton('place', true)).toBe(true);
    let s = input.getState(DT);
    expect([s.jump, s.jumpPressed, s.breakHeld, s.attackPressed, s.placeHeld, s.placePressed]).toEqual([true, true, true, true, true, true]);
    s = input.getState(DT);
    expect([s.jumpPressed, s.attackPressed, s.placePressed, s.breakHeld]).toEqual([false, false, false, true]);
    input.releaseButton('jump');
    input.releaseButton('break');
    input.pressButton('place', false);
    s = input.getState(DT);
    expect([s.jump, s.breakHeld, s.placeHeld]).toEqual([false, false, false]);
    input.dispose();
  });

  it('crouch basılı tutulur; crouchToggle ve crouchToggle ayarı kilitler', () => {
    const { input } = rig();
    input.pressButton('crouch');
    expect(input.getState(DT).crouch).toBe(true);
    input.releaseButton('crouch');
    expect(input.getState(DT).crouch).toBe(false);
    input.pressButton('crouchToggle');
    input.releaseButton('crouchToggle');
    expect(input.getState(DT).crouch).toBe(true);
    input.pressButton('crouchToggle');
    expect(input.getState(DT).crouch).toBe(false);
    input.setSettings({ crouchToggle: true });
    input.pressButton('crouch');
    input.releaseButton('crouch');
    expect(input.getState(DT).crouch).toBe(true);
    input.pressButton('sprintToggle');
    expect(input.getState(DT).sprint).toBe(true);
    input.dispose();
  });

  it('olay düğmeleri kuyruğa girer; yuva ve yetenek biçimleri', () => {
    const { input } = rig();
    ['inventory', 'craft', 'map', 'camera', 'pause', 'drop', 'fly', 'ability2', 'hotbarPrev', 'hotbarNext', 'hotbar5'].forEach((n) => expect(input.pressButton(n)).toBe(true));
    const ev = input.consumeEvents();
    expect(ev.map((e) => e.type)).toEqual(['inventory', 'craft', 'map', 'camera', 'pause', 'drop', 'fly', 'ability2', 'hotbarDelta', 'hotbarDelta', 'hotbarSet']);
    expect(ev[7].n).toBe(2);
    expect([ev[8].delta, ev[9].delta, ev[10].index]).toEqual([-1, 1, 4]);
    input.dispose();
  });

  it('interact kenar verir; bilinmeyen düğme false; isActive false iken basma reddedilir', () => {
    let active = true;
    const { input } = rig({ isActive: () => active });
    input.pressButton('interact');
    expect(input.getState(DT).interactPressed).toBe(true);
    expect(input.pressButton('nope')).toBe(false);
    expect(input.pressButton('constructor')).toBe(false);
    active = false;
    expect(input.pressButton('jump')).toBe(false);
    input.dispose();
  });

  it('jump düğmesine çift dokunuş fly üretir', () => {
    const { input } = rig();
    input.pressButton('jump');
    input.releaseButton('jump');
    clock += 120;
    input.pressButton('jump');
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['fly']);
    input.dispose();
  });

  it('düğme basışı titreşim ister', () => {
    const { input, callbacks } = rig();
    input.pressButton('inventory');
    expect(callbacks.onHaptic).toHaveBeenCalledWith('selection');
    clock += 100;
    input.pressButton('jump');
    expect(callbacks.onHaptic).toHaveBeenLastCalledWith('light');
    input.dispose();
  });
});

describe('dokunmatik', () => {
  const touchRig = (opts) => rig({ controls: 'touch', ...opts });

  it('sol bölgede joystick yüzer, ileri it = moveZ +; bırakınca sıfır', () => {
    const { input, container, callbacks } = touchRig();
    expect(input.isTouch).toBe(true);
    pointer(container, 'pointerdown', { pointerId: 5, clientX: 120, clientY: 300 });
    const v = input.getJoystickView();
    expect([v.active, v.baseX, v.baseY]).toEqual([true, 120, 300]);
    expect(callbacks.onTouchView).toHaveBeenCalled();
    pointer(window, 'pointermove', { pointerId: 5, clientX: 120, clientY: 250 });
    let s = input.getState(DT);
    expect(s.moveZ).toBeGreaterThan(0.8);
    expect(Math.abs(s.moveX)).toBeLessThan(0.01);
    expect(s.sprint).toBe(false);
    pointer(window, 'pointermove', { pointerId: 5, clientX: 200, clientY: 300 });
    s = input.getState(DT);
    expect(s.moveX).toBeGreaterThan(0.8);
    pointer(window, 'pointerup', { pointerId: 5, clientX: 200, clientY: 300 });
    s = input.getState(DT);
    expect([s.moveX, s.moveZ]).toEqual([0, 0]);
    expect(input.getJoystickView().active).toBe(false);
    input.dispose();
  });

  it('joystick halkanın dışına itilince koşar ve titreşim verir', () => {
    const { input, container, callbacks } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 5, clientX: 100, clientY: 300 });
    clock += 100;
    pointer(window, 'pointermove', { pointerId: 5, clientX: 100, clientY: 300 - 120 });
    expect(input.getState(DT).sprint).toBe(true);
    expect(callbacks.onHaptic).toHaveBeenCalledWith('light');
    clock += 100;
    pointer(window, 'pointermove', { pointerId: 5, clientX: 100, clientY: 280 });
    expect(input.getState(DT).sprint).toBe(false);
    input.dispose();
  });

  it('ekranın sağ yarısı bakıştır: sürükleme yumuşatılır, toplam korunur, sensitivity uygulanır', () => {
    const { input, container } = touchRig({ settings: { lookAccel: 0, lookSmoothing: 0.02, sensitivity: 1.5 } });
    pointer(container, 'pointerdown', { pointerId: 9, clientX: 600, clientY: 200 });
    pointer(window, 'pointermove', { pointerId: 9, clientX: 640, clientY: 180 });
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < 60; i++) {
      const s = input.getState(DT);
      sumX += s.lookDX;
      sumY += s.lookDY;
    }
    expect(sumX).toBeCloseTo(40 * TOUCH_RAD_PER_PX * 1.5, 6);
    expect(sumY).toBeCloseTo(20 * TOUCH_RAD_PER_PX * 1.5, 6); // yukarı sürükle = yukarı bak
    pointer(window, 'pointerup', { pointerId: 9, clientX: 640, clientY: 180 });
    input.dispose();
  });

  it('invertY dokunmatik bakışı da ters çevirir', () => {
    const { input, container } = touchRig({ settings: { lookAccel: 0, lookSmoothing: 0, invertY: true } });
    pointer(container, 'pointerdown', { pointerId: 9, clientX: 600, clientY: 200 });
    pointer(window, 'pointermove', { pointerId: 9, clientX: 600, clientY: 180 });
    expect(input.getState(DT).lookDY).toBeLessThan(0);
    input.dispose();
  });

  it('çoklu dokunma: joystick ve bakış parmakları birbirini bozmaz', () => {
    const { input, container } = touchRig({ settings: { lookAccel: 0, lookSmoothing: 0 } });
    pointer(container, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    pointer(container, 'pointerdown', { pointerId: 2, clientX: 600, clientY: 200 });
    pointer(window, 'pointermove', { pointerId: 1, clientX: 100, clientY: 260 });
    pointer(window, 'pointermove', { pointerId: 2, clientX: 650, clientY: 200 });
    const s = input.getState(DT);
    expect(s.moveZ).toBeGreaterThan(0.5);
    expect(s.lookDX).toBeCloseTo(50 * TOUCH_RAD_PER_PX, 6);
    // Bakış parmağı kalkınca joystick sürer
    pointer(window, 'pointerup', { pointerId: 2 });
    expect(input.getState(DT).moveZ).toBeGreaterThan(0.5);
    // İkinci sol parmak yok sayılır
    pointer(container, 'pointerdown', { pointerId: 3, clientX: 50, clientY: 100 });
    expect(input.getJoystickView().baseX).toBe(100);
    pointer(window, 'pointerup', { pointerId: 3 });
    expect(input.getJoystickView().active).toBe(true);
    pointer(window, 'pointerup', { pointerId: 1 });
    expect(input.getJoystickView().active).toBe(false);
    input.dispose();
  });

  it('kısa dokunuş = yerleştir (placePressed), titreşim; sürükleme dokunuş sayılmaz', () => {
    const { input, container, callbacks } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 200 });
    clock += 100;
    pointer(window, 'pointerup', { pointerId: 4, clientX: 600, clientY: 200 });
    let s = input.getState(DT);
    expect(s.placePressed).toBe(true);
    expect(callbacks.onHaptic).toHaveBeenCalledWith('light');
    expect(input.getState(DT).placePressed).toBe(false);
    pointer(container, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 200 });
    pointer(window, 'pointermove', { pointerId: 4, clientX: 680, clientY: 200 });
    clock += 100;
    pointer(window, 'pointerup', { pointerId: 4, clientX: 680, clientY: 200 });
    s = input.getState(DT);
    expect(s.placePressed).toBe(false);
    input.dispose();
  });

  it('uzun basış = kır/saldır (breakHeld, attackPressed) parmak kalkana dek; kalkınca tap sayılmaz', () => {
    const { input, container, callbacks } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 200 });
    clock += 200;
    expect(input.getState(DT).breakHeld).toBe(false);
    clock += 250;
    let s = input.getState(DT);
    expect([s.breakHeld, s.attackPressed]).toEqual([true, true]);
    expect(callbacks.onHaptic).toHaveBeenCalledWith('medium');
    s = input.getState(DT);
    expect([s.breakHeld, s.attackPressed]).toEqual([true, false]);
    clock += 100;
    pointer(window, 'pointerup', { pointerId: 4 });
    s = input.getState(DT);
    expect([s.breakHeld, s.placePressed]).toEqual([false, false]);
    input.dispose();
  });

  it('touchGestures kapalıyken dokunuş/uzun basış eylem üretmez', () => {
    const { input, container } = touchRig({ settings: { touchGestures: false } });
    pointer(container, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 200 });
    clock += 600;
    expect(input.getState(DT).breakHeld).toBe(false);
    pointer(window, 'pointerup', { pointerId: 4 });
    expect(input.getState(DT).placePressed).toBe(false);
    input.dispose();
  });

  it('[data-no-tap] ve düğme üzerindeki dokunuşlar yok sayılır', () => {
    const { input, noTap, button } = touchRig();
    pointer(noTap, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    pointer(button, 'pointerdown', { pointerId: 2, clientX: 600, clientY: 200 });
    expect(input.getJoystickView().active).toBe(false);
    pointer(window, 'pointermove', { pointerId: 2, clientX: 700, clientY: 200 });
    expect(input.getState(DT).lookDX).toBe(0);
    input.dispose();
  });

  it('touchmove sayfa kaydırmasını engeller; düğme üstünde engellemez', () => {
    const { input, canvas, button } = touchRig();
    const a = new Event('touchmove', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(a);
    expect(a.defaultPrevented).toBe(true);
    const b = new Event('touchmove', { bubbles: true, cancelable: true });
    button.dispatchEvent(b);
    expect(b.defaultPrevented).toBe(false);
    const g = new Event('gesturestart', { bubbles: true, cancelable: true });
    canvas.dispatchEvent(g);
    expect(g.defaultPrevented).toBe(true);
    input.dispose();
  });

  it('touch-action: none uygulanır ve dispose geri yükler', () => {
    const { input, container, canvas } = touchRig();
    expect(container.style.touchAction).toBe('none');
    expect(canvas.style.touchAction).toBe('none');
    input.dispose();
    expect(container.style.touchAction).toBe('');
    expect(canvas.style.touchAction).toBe('');
  });

  it('solak yerleşim: joystick sağda, bakış solda', () => {
    const { input, container } = touchRig({ settings: { leftHanded: true } });
    pointer(container, 'pointerdown', { pointerId: 1, clientX: 700, clientY: 300 });
    expect(input.getJoystickView().active).toBe(true);
    pointer(container, 'pointerdown', { pointerId: 2, clientX: 100, clientY: 300 });
    pointer(window, 'pointermove', { pointerId: 2, clientX: 140, clientY: 300 });
    expect(input.getState(DT).lookDX).toBeGreaterThan(0);
    input.dispose();
  });

  it('setTouchLayout bölgeyi değiştirir', () => {
    const { input, container } = touchRig();
    input.setTouchLayout({ joystickZone: 0.25 });
    pointer(container, 'pointerdown', { pointerId: 1, clientX: 250, clientY: 300 }); // 250 > 200 → bakış
    expect(input.getJoystickView().active).toBe(false);
    pointer(window, 'pointerup', { pointerId: 1 });
    input.setTouchLayout({ joystickZone: 0.5 });
    pointer(container, 'pointerdown', { pointerId: 2, clientX: 250, clientY: 300 });
    expect(input.getJoystickView().active).toBe(true);
    input.dispose();
  });

  it('yön değişimi (orientationchange) parmakları iptal eder; kilitli eylem kalmaz', () => {
    const { input, container } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    pointer(container, 'pointerdown', { pointerId: 2, clientX: 600, clientY: 200 });
    clock += 500;
    input.getState(DT);
    expect(input.getState(DT).breakHeld).toBe(true);
    window.dispatchEvent(new Event('orientationchange'));
    const s = input.getState(DT);
    expect([s.breakHeld, s.moveZ, s.moveX]).toEqual([false, 0, 0]);
    expect(input.getJoystickView().active).toBe(false);
    input.dispose();
  });

  it('kapsayıcı dikeyden yataya dönünce (resize) iptal; aynı yönde resize iptal etmez', () => {
    const { input, container } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 300 });
    window.dispatchEvent(new Event('resize'));
    expect(input.getJoystickView().active).toBe(true);
    container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 800 });
    window.dispatchEvent(new Event('resize'));
    expect(input.getJoystickView().active).toBe(false);
    input.dispose();
  });

  it('pointercancel dokunuşu iptal eder ve tap üretmez', () => {
    const { input, container } = touchRig();
    pointer(container, 'pointerdown', { pointerId: 4, clientX: 600, clientY: 200 });
    pointer(window, 'pointercancel', { pointerId: 4 });
    expect(input.getState(DT).placePressed).toBe(false);
    input.dispose();
  });

  it('auto modda masaüstü varsayılır; ilk gerçek dokunuşta dokunmatiğe geçer', () => {
    const mm = window.matchMedia;
    window.matchMedia = (q) => ({ matches: q.includes('fine') });
    const { input, container, callbacks } = rig({ controls: 'auto' });
    window.matchMedia = mm;
    expect(input.isTouch).toBe(false);
    pointer(container, 'pointerdown', { pointerType: 'mouse', pointerId: 1, clientX: 100, clientY: 300 });
    expect(input.isTouch).toBe(false);
    pointer(container, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 300 });
    expect(input.isTouch).toBe(true);
    expect(callbacks.onControlsChange).toHaveBeenCalledWith(true);
    expect(input.getJoystickView().active).toBe(true);
    input.dispose();
  });

  it('desktop modda dokunuş yok sayılır', () => {
    const { input, container } = rig({ controls: 'desktop' });
    pointer(container, 'pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 300 });
    expect(input.isTouch).toBe(false);
    expect(input.getJoystickView().active).toBe(false);
    input.dispose();
  });

  it('dokunmatik modda fare tıklaması pointer lock istemez', () => {
    const { input, canvas } = touchRig();
    fakeLock(canvas);
    mouse(canvas, 'mousedown', { button: 0 });
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(input.requestPointerLock()).toBe(false);
    input.dispose();
  });

  it('iOS ses kilidi: touchend ve dokunmatik pointerup onGesture çağırır', () => {
    const { input, container, callbacks } = touchRig();
    callbacks.onGesture.mockClear();
    container.dispatchEvent(new Event('touchend', { bubbles: true }));
    expect(callbacks.onGesture).toHaveBeenCalledTimes(1);
    pointer(window, 'pointerup', { pointerId: 99 });
    expect(callbacks.onGesture).toHaveBeenCalledTimes(2);
    input.dispose();
  });

  it('getTouchLayoutHints düğme tanımlarını ve bölgeleri verir', () => {
    const { input } = touchRig();
    const h = input.getTouchLayoutHints();
    expect(h.isTouch).toBe(true);
    expect(h.minTargetPx).toBe(44);
    expect(h.joystick.side).toBe('left');
    expect(h.joystick.zone).toBe(0.4);
    expect(h.look.zone).toBeCloseTo(0.6);
    expect(h.buttons.map((b) => b.name)).toContain('jump');
    expect(h.gestures.enabled).toBe(true);
    input.setSettings({ leftHanded: true });
    expect(input.getTouchLayoutHints().joystick.side).toBe('right');
    input.dispose();
  });
});

describe('jiroskop', () => {
  const orient = (alpha, beta, gamma) => {
    const e = new Event('deviceorientation');
    Object.assign(e, { alpha, beta, gamma });
    window.dispatchEvent(e);
  };

  it('ayar açılınca telefonu çevirmek bakışı döndürür; kapatınca dinleme biter', () => {
    const { input } = rig({ controls: 'touch', settings: { gyro: true } });
    orient(0, 90, 0);
    orient(-10, 90, 0); // sağa 10°
    let sum = 0;
    for (let i = 0; i < 30; i++) {
      orient(-10, 90, 0);
      sum += input.getState(DT).lookDX;
    }
    expect(sum).toBeGreaterThan(0.15);
    expect(sum).toBeLessThan(0.2);
    expect(input.getState(DT).gyro).toBe(true);
    input.setSettings({ gyro: false });
    orient(-60, 90, 0);
    expect(input.getState(DT).lookDX).toBe(0);
    input.dispose();
  });

  it('enableGyro izin verilmezse ayarı kapalı bırakır; izin varsa açar', async () => {
    const { input } = rig({ controls: 'touch' });
    const orig = window.DeviceOrientationEvent;
    window.DeviceOrientationEvent = { requestPermission: async () => 'denied' };
    expect(await input.enableGyro(true)).toBe(false);
    expect(input.getSettings().gyro).toBe(false);
    window.DeviceOrientationEvent = { requestPermission: async () => 'granted' };
    expect(await input.enableGyro(true)).toBe(true);
    expect(input.getSettings().gyro).toBe(true);
    expect(await input.enableGyro(false)).toBe(false);
    expect(input.getSettings().gyro).toBe(false);
    window.DeviceOrientationEvent = orig;
    input.dispose();
  });
});

describe('oyun kolu', () => {
  const padWith = (axes, pressed = []) => ({
    connected: true,
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  });

  it('çubuklar hareket/bakış, tetikler eylem, d-pad hotbar; usingGamepad ve aimAssist', () => {
    let pad = padWith([0, -1, 0.5, 0], [7]);
    const { input } = rig({ getGamepads: () => [pad] });
    let s = input.getState(DT);
    expect(s.moveZ).toBeGreaterThan(0.9);
    expect(s.lookDX).toBeGreaterThan(0);
    expect([s.breakHeld, s.attackPressed, s.usingGamepad]).toEqual([true, true, true]);
    expect(s.aimAssist).toBe(0.35);
    pad = padWith([0, 0, 0, 0], [15, 3]);
    input.getState(DT);
    expect(input.consumeEvents().map((e) => e.type)).toEqual(['inventory', 'hotbarDelta']);
    input.dispose();
  });

  it('klavye ve kol hareketi toplanır ve uzunluk 1e sıkışır', () => {
    const { input } = rig({ getGamepads: () => [padWith([1, 0, 0, 0])] });
    keyDown('KeyW');
    const s = input.getState(DT);
    expect(Math.hypot(s.moveX, s.moveZ)).toBeCloseTo(1, 6);
    input.dispose();
  });
});

describe('ayarlar ve yaşam döngüsü', () => {
  it('setSettings geçersiz değerleri sınırlar ve ayarları döndürür; fazladan alanlar atılır', () => {
    const { input } = rig();
    const c = input.setSettings({ sensitivity: 100, invertY: true, fov: 90, evil: 1, lookAccel: 9 });
    expect(c.sensitivity).toBe(1);
    expect(c.invertY).toBe(true);
    expect(c.lookAccel).toBe(1);
    expect(c.fov).toBeUndefined();
    expect(input.getSettings().evil).toBeUndefined();
    input.dispose();
  });

  it('aimAssist: dokunmatik varsayılan 0.5, masaüstü 0, açık ayar önceliklidir', () => {
    const t = rig({ controls: 'touch' });
    expect(t.input.getState(DT).aimAssist).toBe(0.5);
    t.input.setSettings({ aimAssist: 0.2 });
    expect(t.input.getState(DT).aimAssist).toBe(0.2);
    t.input.dispose();
    const d = rig();
    expect(d.input.getState(DT).aimAssist).toBe(0);
    d.input.dispose();
  });

  it('dispose dinleyicileri kaldırır, stili geri yükler, sonrasında nötr durum verir', () => {
    const { input, container } = rig();
    keyDown('KeyW');
    input.dispose();
    keyDown('KeyW');
    keyDown('KeyE');
    expect(input.consumeEvents()).toHaveLength(0);
    const s = input.getState(DT);
    expect([s.moveZ, s.jump]).toEqual([0, false]);
    expect(container.style.touchAction).toBe('');
    expect(input.pressButton('jump')).toBe(false);
    input.dispose(); // ikinci çağrı sorun çıkarmaz
  });

  it('container yoksa TypeError', () => {
    expect(() => createKesifInput({})).toThrow(TypeError);
  });

  it('dispose pointer lock tutuyorsa bırakır (sessizce)', () => {
    const { input, canvas } = rig();
    fakeLock(canvas);
    input.requestPointerLock();
    input.dispose();
    expect(document.exitPointerLock).toHaveBeenCalled();
  });

  it('detectTouchDevice: coarse → true, fine → false, yoksa ontouchstart', () => {
    expect(detectTouchDevice(null)).toBe(false);
    expect(detectTouchDevice({ matchMedia: (q) => ({ matches: q.includes('coarse') }) })).toBe(true);
    expect(detectTouchDevice({ matchMedia: (q) => ({ matches: q.includes('fine') }) })).toBe(false);
    expect(detectTouchDevice({ ontouchstart: null })).toBe(true);
    expect(detectTouchDevice({ navigator: { maxTouchPoints: 5 } })).toBe(true);
    expect(detectTouchDevice({ navigator: { maxTouchPoints: 0 } })).toBe(false);
  });

  it('isActive false iken getState nötr ve birikmiş fare/bakış atılır', () => {
    let active = true;
    const { input, canvas } = rig({ isActive: () => active });
    fakeLock(canvas);
    input.requestPointerLock();
    mouse(document, 'mousemove', { movementX: 50, movementY: 0 });
    active = false;
    expect(input.getState(DT).lookDX).toBe(0);
    active = true;
    expect(input.getState(DT).lookDX).toBe(0);
    input.dispose();
  });
});

describe('dokunmatik: ana iş parçacığı takılınca dokunuş süresi (olay zaman damgası)', () => {
  // Varsayılan saat (performance.now) kullanılır; sahte saatle olay damgası ve işlenme anı ayrı sürülür.
  function stallRig() {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
    let t = 5000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => t);
    const input = createKesifInput({ container, canvas, controls: 'touch' });
    const ev = (target, type, ts, props = {}) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { pointerType: 'touch', pointerId: 4, isPrimary: true, clientX: 600, clientY: 200, button: 0, ...props });
      Object.defineProperty(e, 'timeStamp', { value: ts });
      target.dispatchEvent(e);
    };
    return { input, container, ev, setT: (v) => { t = v; }, spy };
  }

  afterEach(() => vi.restoreAllMocks());

  it('80 ms süren dokunuş, olaylar 450 ms geç işlense de "yerleştir" sayılır (kaybolmaz)', () => {
    const { input, container, ev, setT } = stallRig();
    setT(5400); // kare 400 ms sürdü; ikisi de şimdi işleniyor, ama gerçek zamanları 5000 ve 5080
    ev(container, 'pointerdown', 5000);
    setT(5450);
    ev(window, 'pointerup', 5080);
    const s = input.getState(DT);
    expect(s.placePressed).toBe(true);
    expect(s.attackPressed).toBe(false);
    input.dispose();
  });

  it('gerçekten uzun basış (zaman damgası farkı > 230 ms) dokunuş sayılmaz', () => {
    const { input, container, ev, setT } = stallRig();
    setT(5000);
    ev(container, 'pointerdown', 5000);
    setT(5290);
    ev(window, 'pointerup', 5290);
    expect(input.getState(DT).placePressed).toBe(false);
    input.dispose();
  });

  it('damga geleceği ya da çok eskiyi gösteriyorsa saate düşer (bozuk damga güvenli)', () => {
    const { input, container, ev, setT } = stallRig();
    setT(6000);
    ev(container, 'pointerdown', 9999999); // gelecek: yok say -> şimdi=6000
    setT(6080);
    ev(window, 'pointerup', 0); // 0: yok say -> şimdi=6080
    expect(input.getState(DT).placePressed).toBe(true);
    input.dispose();
  });
});

describe('otomasyon tarayıcısı: imleç kilidi gerçek fareyi hapsetmez', () => {
  const setWebdriver = (v) => Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => v });
  afterEach(() => {
    delete navigator.webdriver;
  });

  it('navigator.webdriver=true iken requestPointerLock gerçek API\'yi ÇAĞIRMAZ ama oyun içinde kilitli sayılır', () => {
    setWebdriver(true);
    const { input, canvas, callbacks } = rig();
    canvas.requestPointerLock = vi.fn();
    document.exitPointerLock = vi.fn();
    expect(input.requestPointerLock()).toBe(true);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    expect(input.isLocked()).toBe(true);
    expect(callbacks.onLockChange).toHaveBeenLastCalledWith(true);
    input.releasePointerLock();
    expect(document.exitPointerLock).not.toHaveBeenCalled();
    expect(input.isLocked()).toBe(false);
    expect(callbacks.onLockChange).toHaveBeenLastCalledWith(false);
    input.dispose();
  });

  it('normal tarayıcıda (webdriver yok) gerçek kilit istenir', () => {
    const { input, canvas } = rig();
    fakeLock(canvas);
    input.requestPointerLock();
    expect(canvas.requestPointerLock).toHaveBeenCalled();
    expect(input.isLocked()).toBe(true);
    input.dispose();
  });
});
