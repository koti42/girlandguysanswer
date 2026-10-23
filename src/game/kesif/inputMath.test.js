import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INPUT_SETTINGS,
  GP_BUTTON,
  HELD_ACTION_CODES,
  JOYSTICK_DEFAULTS,
  TOUCH_BUTTONS,
  aimAssist,
  createDoubleTap,
  createEventQueue,
  createGamepadState,
  createGyroLook,
  createJoystick,
  createLookSmoother,
  createTapGesture,
  deviceLookAngles,
  filterMouseDelta,
  gamepadDown,
  hotbarIndexForCode,
  isInteractiveTarget,
  isModifierSafeCode,
  joystickRadius,
  keyToAction,
  keyboardAxes,
  normalizeInputSettings,
  normalizeSensitivity,
  pickGamepad,
  pollGamepad,
  radialDeadZone,
  requestGyroPermission,
  shouldPreventKey,
  smoothstep,
  stickAxes,
  touchButtonDef,
  touchLookGain,
  touchZoneFor,
  wheelSteps,
  wrapAngle,
} from './inputMath.js';

const D = Math.PI / 180;

describe('ayarlar', () => {
  it('normalizeSensitivity: çarpan, yüzde, geçersiz, sınırlar', () => {
    expect(normalizeSensitivity(1)).toBe(1);
    expect(normalizeSensitivity('2')).toBe(2);
    expect(normalizeSensitivity(100)).toBe(1);
    expect(normalizeSensitivity(50)).toBe(0.5);
    expect(normalizeSensitivity(250)).toBe(2.5);
    expect(normalizeSensitivity(0)).toBe(1);
    expect(normalizeSensitivity(-3)).toBe(1);
    expect(normalizeSensitivity(NaN)).toBe(1);
    expect(normalizeSensitivity(undefined)).toBe(1);
    expect(normalizeSensitivity(0.01)).toBe(0.1);
    expect(normalizeSensitivity(4.8)).toBe(4);
    expect(normalizeSensitivity(100000)).toBe(4);
  });

  it('normalizeInputSettings: bilinmeyen alan atılır, eksikler önceki değerden, sınırlar uygulanır', () => {
    const s = normalizeInputSettings({ sensitivity: 2, invertY: true, fov: 90, viewDist: 8, easy: true, hack: 1 });
    expect(s.sensitivity).toBe(2);
    expect(s.invertY).toBe(true);
    expect(s.fov).toBeUndefined();
    expect(s.hack).toBeUndefined();
    expect(s.lookAccel).toBe(DEFAULT_INPUT_SETTINGS.lookAccel);
    const t = normalizeInputSettings({ lookAccel: 5, joystickScale: 0, joystickZone: 0.9, gamepadDeadZone: -1, invertY: 'evet' }, s);
    expect(t.lookAccel).toBe(1);
    expect(t.joystickScale).toBe(0.6);
    expect(t.joystickZone).toBe(0.6);
    expect(t.gamepadDeadZone).toBe(0.05);
    expect(t.invertY).toBe(true); // geçersiz tür → önceki
    expect(t.sensitivity).toBe(2);
  });

  it('aimAssist ayarı null (otomatik) ya da 0..1', () => {
    expect(normalizeInputSettings({}).aimAssist).toBeNull();
    expect(normalizeInputSettings({ aimAssist: 3 }).aimAssist).toBe(1);
    expect(normalizeInputSettings({ aimAssist: null }, { ...DEFAULT_INPUT_SETTINGS, aimAssist: 0.4 }).aimAssist).toBeNull();
    expect(normalizeInputSettings(null).sensitivity).toBe(1);
    expect(Object.isFrozen(DEFAULT_INPUT_SETTINGS)).toBe(true);
  });
});

describe('tuş eşlemesi', () => {
  it('hareket, zıplama, koşma, çömelme basılı eylemlerdir', () => {
    expect(keyToAction('KeyW')).toEqual({ kind: 'held', action: 'forward' });
    expect(keyToAction('ArrowLeft')).toEqual({ kind: 'held', action: 'left' });
    expect(keyToAction('Space')).toEqual({ kind: 'held', action: 'jump' });
    expect(keyToAction('ShiftRight')).toEqual({ kind: 'held', action: 'sprint' });
    expect(keyToAction('KeyC')).toEqual({ kind: 'held', action: 'crouch' });
    expect(keyToAction('ControlLeft')).toEqual({ kind: 'held', action: 'crouch' });
  });

  it('tek seferlik eylemler', () => {
    const map = { KeyE: 'inventory', KeyQ: 'drop', F5: 'camera', Tab: 'map', Escape: 'pause', KeyF: 'interact', KeyR: 'craft', KeyZ: 'ability1', KeyX: 'ability2', KeyG: 'ability3', KeyB: 'ability4' };
    Object.keys(map).forEach((c) => expect(keyToAction(c)).toEqual({ kind: 'press', action: map[c] }));
  });

  it('sayı tuşları hotbar indeksi verir (1→0 … 9→8, Numpad dahil)', () => {
    for (let i = 1; i <= 9; i++) {
      expect(keyToAction('Digit' + i)).toEqual({ kind: 'hotbar', action: 'hotbarSet', index: i - 1 });
      expect(hotbarIndexForCode('Numpad' + i)).toBe(i - 1);
    }
    expect(hotbarIndexForCode('Digit0')).toBe(-1);
    expect(hotbarIndexForCode('Digit10')).toBe(-1);
    expect(hotbarIndexForCode(5)).toBe(-1);
  });

  it('bilinmeyen/yanlış türde kod null; prototip anahtarları sızmaz', () => {
    expect(keyToAction('KeyJ')).toBeNull();
    expect(keyToAction(undefined)).toBeNull();
    expect(keyToAction('constructor')).toBeNull();
    expect(keyToAction('__proto__')).toBeNull();
    expect(keyToAction('toString')).toBeNull();
  });

  it('modifier güvenli kodlar ve engellenecek tuşlar', () => {
    expect(isModifierSafeCode('KeyW')).toBe(true);
    expect(isModifierSafeCode('KeyR')).toBe(false);
    expect(shouldPreventKey('F5')).toBe(true);
    expect(shouldPreventKey('Tab')).toBe(true);
    expect(shouldPreventKey('Space')).toBe(true);
    expect(shouldPreventKey('F12')).toBe(false);
    expect(shouldPreventKey('KeyL')).toBe(false);
  });

  it('her tuş yalnız bir eyleme bağlı (çakışma yok)', () => {
    const seen = new Map();
    Object.keys(HELD_ACTION_CODES).forEach((a) =>
      HELD_ACTION_CODES[a].forEach((c) => {
        expect(seen.has(c)).toBe(false);
        seen.set(c, a);
      })
    );
    expect(keyToAction('KeyV')).toBeNull();
  });

  it('keyboardAxes: karşıt tuşlar iptal, çapraz normalize', () => {
    const out = { x: 0, z: 0 };
    keyboardAxes({ forward: true }, out);
    expect([out.x, out.z]).toEqual([0, 1]);
    keyboardAxes({ forward: true, back: true, left: true }, out);
    expect([out.x, out.z]).toEqual([-1, 0]);
    keyboardAxes({ forward: true, right: true }, out);
    expect(Math.hypot(out.x, out.z)).toBeCloseTo(1, 10);
    expect(out.x).toBeGreaterThan(0);
    expect(out.z).toBeGreaterThan(0);
    keyboardAxes({}, out);
    expect([out.x, out.z]).toEqual([0, 0]);
  });
});

describe('olay kuyruğu', () => {
  it('sırayı korur ve drain boşaltır; boşken paylaşılan donuk dizi', () => {
    const q = createEventQueue();
    expect(q.drain()).toHaveLength(0);
    expect(Object.isFrozen(q.drain())).toBe(true);
    q.push({ type: 'inventory' });
    q.push({ type: 'hotbarSet', index: 2 });
    expect(q.length).toBe(2);
    const a = q.drain();
    expect(a.map((e) => e.type)).toEqual(['inventory', 'hotbarSet']);
    expect(q.length).toBe(0);
    expect(q.drain()).toHaveLength(0);
  });

  it('geçersiz olay reddedilir; kapasite aşılınca en eski düşer', () => {
    const q = createEventQueue({ max: 3 });
    expect(q.push(null)).toBe(false);
    expect(q.push({})).toBe(false);
    expect(q.push({ type: 5 })).toBe(false);
    for (let i = 0; i < 5; i++) q.push({ type: 'hotbarDelta', delta: i });
    expect(q.drain().map((e) => e.delta)).toEqual([2, 3, 4]);
  });

  it('pause: imleç kilidi kaybı ile klavye Esc kısa sürede yinelenmez (her iki sırada)', () => {
    const q = createEventQueue();
    expect(q.push({ type: 'pause', source: 'lock' }, 1000)).toBe(true);
    expect(q.push({ type: 'pause' }, 1100)).toBe(false);
    expect(q.push({ type: 'pause' }, 1300)).toBe(true);
    expect(q.push({ type: 'pause', source: 'lock' }, 1400)).toBe(false);
    expect(q.push({ type: 'inventory' }, 1301)).toBe(true);
    expect(q.push({ type: 'inventory' }, 1302)).toBe(true);
    expect(q.drain()).toHaveLength(4);
  });

  it('pause: art arda iki gerçek Esc basışı (duraklat → devam) kısa aralıkta da kaybolmaz', () => {
    const q = createEventQueue();
    expect(q.push({ type: 'pause' }, 1000)).toBe(true);
    expect(q.push({ type: 'pause' }, 1090)).toBe(true);
    expect(q.push({ type: 'pause' }, 1150)).toBe(true);
    expect(q.drain()).toHaveLength(3);
  });

  it('clear kuyruğu temizler', () => {
    const q = createEventQueue();
    q.push({ type: 'map' });
    q.clear();
    expect(q.length).toBe(0);
  });
});

describe('çift dokunma', () => {
  it('pencere içinde ikinci dokunuş true; üçüncü yeniden başlar', () => {
    const d = createDoubleTap(280);
    expect(d.tap(0)).toBe(false);
    expect(d.tap(200)).toBe(true);
    expect(d.tap(300)).toBe(false);
    expect(d.tap(700)).toBe(false);
    expect(d.tap(900)).toBe(true);
    d.tap(1000);
    d.reset();
    expect(d.tap(1050)).toBe(false);
  });
});

describe('fare / tekerlek', () => {
  it('filterMouseDelta sıçramayı atar', () => {
    expect(filterMouseDelta(12)).toBe(12);
    expect(filterMouseDelta(-599)).toBe(-599);
    expect(filterMouseDelta(2000)).toBe(0);
    expect(filterMouseDelta(NaN)).toBe(0);
  });

  it('wheelSteps: fare tekerleği tek adım, dokunmatik yüzey birikimi, satır modu', () => {
    expect(wheelSteps(0, 100, 0)).toEqual({ acc: 10, steps: 1 });
    expect(wheelSteps(0, -100, 0)).toEqual({ acc: -10, steps: -1 });
    let acc = 0;
    let total = 0;
    for (let i = 0; i < 30; i++) {
      const r = wheelSteps(acc, 10, 0);
      acc = r.acc;
      total += r.steps;
    }
    expect(total).toBe(3); // 300 px / 90
    expect(wheelSteps(0, 3, 1).steps).toBe(1); // 3 satır = 99 px
    expect(wheelSteps(0, 5000, 0).steps).toBe(3); // üst sınır
    expect(wheelSteps(0, 5000, 0).acc).toBe(0);
    expect(wheelSteps(0, NaN, 0)).toEqual({ acc: 0, steps: 0 });
  });
});

describe('joystick', () => {
  it('stickAxes: ölü bölge, yeniden ölçekleme, yön (ileri = y +)', () => {
    const o = { x: 0, y: 0, mag: 0 };
    stickAxes(3, 0, 60, 0.12, o);
    expect([o.x, o.y, o.mag]).toEqual([0, 0, 0]);
    stickAxes(0, -60, 60, 0.12, o); // ekranda yukarı = ileri
    expect(o.x).toBeCloseTo(0);
    expect(o.y).toBeCloseTo(1);
    stickAxes(60, 0, 60, 0.12, o);
    expect(o.x).toBeCloseTo(1);
    stickAxes(0, 200, 60, 0.12, o); // halkanın dışı: 1'e sıkışır, geri
    expect(o.y).toBeCloseTo(-1);
    stickAxes(0, 0, 60, 0.12, o);
    expect(o.mag).toBe(0);
    stickAxes(10, 10, 0, 0.12, o);
    expect(o.mag).toBe(0);
    // Ölü bölge sınırında süreklilik
    stickAxes(60 * 0.1201, 0, 60, 0.12, o);
    expect(o.mag).toBeLessThan(0.01);
  });

  it('createJoystick: begin tabanı belirler, move ekseni verir, end sıfırlar', () => {
    const j = createJoystick({ radius: 50 });
    j.begin(7, 100, 300);
    expect(j.state.active).toBe(true);
    expect(j.state.id).toBe(7);
    j.move(150, 300);
    expect(j.state.x).toBeCloseTo(1);
    expect(j.state.knobX).toBeCloseTo(150);
    j.move(100, 250);
    expect(j.state.y).toBeCloseTo(1);
    j.end();
    expect(j.state.active).toBe(false);
    expect([j.state.x, j.state.y, j.state.sprint]).toEqual([0, 0, false]);
    expect(j.move(1, 1)).toBeNull();
  });

  it('halkanın dışına itmek koşturur; histerezis ve titreşim olayları', () => {
    const j = createJoystick({ radius: 50 });
    j.begin(1, 0, 0);
    expect(j.move(0, -30)).toBeNull();
    expect(j.state.sprint).toBe(false);
    expect(j.move(0, -52)).toBe('ring'); // halka sınırı geçildi
    expect(j.state.sprint).toBe(false);
    expect(j.move(0, -50 * JOYSTICK_DEFAULTS.sprintRatio - 2)).toBe('sprintOn');
    expect(j.state.sprint).toBe(true);
    expect(j.move(0, -55)).toBeNull(); // histerezis: hâlâ koşuyor
    expect(j.state.sprint).toBe(true);
    expect(j.move(0, -30)).toBe('sprintOff');
    expect(j.state.sprint).toBe(false);
  });

  it('parmak çok uzaklaşınca taban izler (ters yöne dönüşte gecikme yok)', () => {
    const j = createJoystick({ radius: 50 });
    j.begin(1, 0, 0);
    j.move(400, 0);
    expect(j.state.baseX).toBeGreaterThan(200);
    expect(j.state.baseX).toBeLessThan(400);
    const distToFinger = Math.hypot(400 - j.state.baseX, 0);
    expect(distToFinger).toBeCloseTo(50 * JOYSTICK_DEFAULTS.followRatio, 5);
    // Parmak biraz geri dönünce yön hemen değişir
    j.move(400 - 120, 0);
    expect(j.state.x).toBeLessThan(1);
    j.move(400 - 400, 0);
    expect(j.state.x).toBeLessThan(0);
  });

  it('joystickRadius ekrana göre sınırlı ve ölçeklenir', () => {
    expect(joystickRadius(100, 100)).toBe(44);
    expect(joystickRadius(1000, 1000)).toBe(84);
    expect(joystickRadius(800, 400)).toBe(56);
    expect(joystickRadius(800, 400, 2)).toBe(Math.round(56 * 1.6));
    expect(joystickRadius(800, 400, 0.1)).toBe(Math.round(56 * 0.6));
  });
});

describe('dokunmatik bakış', () => {
  it('touchLookGain: accel 0 → 1; hız arttıkça kazanç artar ve sınırlıdır', () => {
    expect(touchLookGain(5000, 0)).toBe(1);
    expect(touchLookGain(0, 0.5)).toBe(1);
    expect(touchLookGain(100, 0.5)).toBe(1);
    const mid = touchLookGain(900, 0.5);
    const fast = touchLookGain(5000, 0.5);
    expect(mid).toBeGreaterThan(1);
    expect(fast).toBeGreaterThan(mid);
    expect(fast).toBeCloseTo(2, 5);
    expect(touchLookGain(1e9, 1)).toBeCloseTo(3, 5);
  });

  it('smoothstep ve wrapAngle', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.2)).toBeCloseTo(0.2);
    expect(wrapAngle(Math.PI * 2 + 0.1)).toBeCloseTo(0.1);
  });

  it('createLookSmoother toplam hareketi korur (kayıp yok) ve gecikmesi sınırlıdır', () => {
    const s = createLookSmoother(0.03);
    const out = { x: 0, y: 0 };
    s.push(1, -2);
    let sx = 0;
    let sy = 0;
    const first = s.consume(1 / 60, out);
    expect(first.x).toBeGreaterThan(0);
    expect(first.x).toBeLessThan(1); // yumuşatıldı
    sx += out.x;
    sy += out.y;
    for (let i = 0; i < 120; i++) {
      s.consume(1 / 60, out);
      sx += out.x;
      sy += out.y;
    }
    expect(sx).toBeCloseTo(1, 6);
    expect(sy).toBeCloseTo(-2, 6);
    expect(s.pending).toBe(0);
  });

  it('kare hızından bağımsız: 30 ve 120 FPS aynı toplamı verir', () => {
    const run = (fps) => {
      const s = createLookSmoother(0.03);
      const out = { x: 0, y: 0 };
      s.push(0.5, 0);
      let sum = 0;
      for (let i = 0; i < fps; i++) {
        s.consume(1 / fps, out);
        sum += out.x;
      }
      return sum;
    };
    expect(run(30)).toBeCloseTo(run(120), 3);
  });

  it('tau 0 geçirgen; dt 0 hareket tüketmez', () => {
    const out = { x: 0, y: 0 };
    const p = createLookSmoother(0);
    p.push(0.3, 0.1);
    p.consume(0.016, out);
    expect([out.x, out.y]).toEqual([0.3, 0.1]);
    const s = createLookSmoother(0.05);
    s.push(1, 1);
    s.consume(0, out);
    expect([out.x, out.y]).toEqual([0, 0]);
    expect(s.pending).toBe(2);
    s.clear();
    expect(s.pending).toBe(0);
    s.setTau(0);
    s.push(2, 0);
    s.consume(0.01, out);
    expect(out.x).toBe(2);
  });
});

describe('dokunma jesti (dokun = yerleştir, uzun bas = kır)', () => {
  it('kısa dokunuş tap verir', () => {
    const g = createTapGesture();
    g.begin(0, 100, 100);
    expect(g.tick(100)).toBeNull();
    expect(g.end(150)).toBe('tap');
    expect(g.state).toBe('idle');
  });

  it('eşik dolunca bir kez hold, parmak kalkınca holdEnd; tap yok', () => {
    const g = createTapGesture({ holdMs: 380 });
    g.begin(0, 0, 0);
    expect(g.tick(379)).toBeNull();
    expect(g.tick(380)).toBe('hold');
    expect(g.tick(500)).toBeNull();
    expect(g.end(900)).toBe('holdEnd');
  });

  it('hold sonrası kayma hold durumunu bozmaz (kazarken bakış sürüklenebilir)', () => {
    const g = createTapGesture();
    g.begin(0, 0, 0);
    g.tick(400);
    g.move(300, 300);
    expect(g.state).toBe('hold');
    expect(g.end(800)).toBe('holdEnd');
  });

  it('kayma eşiği aşılırsa sürükleme: ne tap ne hold', () => {
    const g = createTapGesture({ slop: 12 });
    g.begin(0, 0, 0);
    g.move(5, 5);
    expect(g.state).toBe('down');
    g.move(30, 0);
    expect(g.state).toBe('drag');
    expect(g.tick(1000)).toBeNull();
    expect(g.end(1100)).toBeNull();
  });

  it('tapMs ile holdMs arası ne tap ne hold; cancel hold bitirir', () => {
    const g = createTapGesture({ tapMs: 230, holdMs: 380 });
    g.begin(0, 0, 0);
    expect(g.end(300)).toBeNull();
    g.begin(0, 0, 0);
    g.tick(400);
    expect(g.cancel()).toBe('holdEnd');
    expect(g.cancel()).toBeNull();
  });
});

describe('aimAssist', () => {
  it('hedef yoksa/uzaksa/merkezdeyse/güç 0 ise sıfır', () => {
    expect(aimAssist(null, 1)).toEqual({ x: 0, y: 0 });
    expect(aimAssist({ x: 0.5, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
    expect(aimAssist({ x: 0.0005, y: 0 }, 1)).toEqual({ x: 0, y: 0 });
    expect(aimAssist({ x: 0.05, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(aimAssist({ x: 0.05, y: 0 }, -2)).toEqual({ x: 0, y: 0 });
  });

  it('hedefe doğru çeker, asla aşmaz, güçle artar, yöne saygı duyar', () => {
    const a = aimAssist({ x: 0.05, y: -0.03 }, 0.5);
    expect(a.x).toBeGreaterThan(0);
    expect(a.y).toBeLessThan(0);
    expect(Math.abs(a.x)).toBeLessThan(0.05);
    expect(Math.abs(a.y)).toBeLessThan(0.03);
    const strong = aimAssist({ x: 0.05, y: 0 }, 1);
    const weak = aimAssist({ x: 0.05, y: 0 }, 0.2);
    expect(strong.x).toBeGreaterThan(weak.x);
    // Aşmama: uç değerlerde bile çekim ≤ uzaklık
    for (let d = 0.002; d < 0.14; d += 0.002) {
      const r = aimAssist({ x: d, y: 0 }, 5, 1);
      expect(r.x).toBeLessThanOrEqual(d);
      expect(r.x).toBeGreaterThan(0);
    }
  });

  it('kare süresinden bağımsız yaklaşık aynı sonuç (60 vs 30 FPS 2 karede)', () => {
    const run = (fps) => {
      let d = 0.08;
      for (let i = 0; i < fps / 6; i++) {
        d -= aimAssist({ x: d, y: 0 }, 0.5, 1 / fps).x;
      }
      return d;
    };
    expect(Math.abs(run(60) - run(30))).toBeLessThan(0.01);
  });

  it('out parametresi yeniden kullanılır', () => {
    const out = { x: 9, y: 9 };
    expect(aimAssist({ x: 0.05, y: 0 }, 1, 1 / 60, out)).toBe(out);
    expect(aimAssist(null, 1, 1 / 60, out)).toBe(out);
    expect(out).toEqual({ x: 0, y: 0 });
  });
});

describe('jiroskop', () => {
  const o = { az: 0, pitch: 0 };

  it('dik tutulan telefon (beta 90) yatay ileri bakar; düz telefon (beta 0) aşağı bakar', () => {
    deviceLookAngles(0, 90, 0, 0, o);
    expect(o.pitch).toBeCloseTo(0, 6);
    expect(o.az).toBeCloseTo(0, 6);
    deviceLookAngles(0, 0, 0, 0, o);
    expect(o.pitch).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('telefonu yukarı eğmek (beta 90→120) yukarı bakar', () => {
    deviceLookAngles(0, 120, 0, 0, o);
    expect(o.pitch).toBeCloseTo(30 * D, 5);
    deviceLookAngles(0, 60, 0, 0, o);
    expect(o.pitch).toBeCloseTo(-30 * D, 5);
  });

  it('alpha artışı (saat yönünün tersine dönüş) sola döndürür: az azalır', () => {
    deviceLookAngles(0, 90, 0, 0, o);
    const a0 = o.az;
    deviceLookAngles(20, 90, 0, 0, o);
    expect(o.az - a0).toBeCloseTo(-20 * D, 5);
    deviceLookAngles(-20, 90, 0, 0, o);
    expect(o.az - a0).toBeCloseTo(20 * D, 5);
  });

  it('yatay ekran (90 / 270) dik tutulunca yatay bakar ve dönüş yönü korunur', () => {
    deviceLookAngles(0, 0, -90, 90, o);
    expect(o.pitch).toBeCloseTo(0, 5);
    const a0 = o.az;
    deviceLookAngles(15, 0, -90, 90, o);
    expect(o.az - a0).toBeCloseTo(-15 * D, 4);
    deviceLookAngles(0, 0, 90, 270, o);
    expect(o.pitch).toBeCloseTo(0, 5);
  });

  it('createGyroLook: ilk örnek referans, sonrası fark; toplam korunur; küçük titreşim yok sayılır', () => {
    const g = createGyroLook({ smoothing: 0.5 });
    const out = { x: 0, y: 0 };
    expect(g.update(0, 90, 0, 0)).toBe(true);
    expect(g.active).toBe(true);
    g.consume(out);
    expect(out).toEqual({ x: 0, y: 0 });
    // Telefonu sağa 10° döndür (alpha azalır), bir kerede
    g.update(-10, 90, 0, 0);
    let sum = 0;
    for (let i = 0; i < 40; i++) {
      g.update(-10, 90, 0, 0); // sabit
      g.consume(out);
      sum += out.x;
    }
    // Süzgeç toplamı korur
    g.update(-10, 90, 0, 0);
    g.consume(out);
    expect(sum + out.x).toBeGreaterThan(0);
    // Hassasiyet 1 iken ilk fark 10°'nin radyanı (kalan artık dahil toplam yakınsar)
    const g2 = createGyroLook({ smoothing: 0.5 });
    g2.update(0, 90, 0, 0);
    g2.update(-10, 90, 0, 0);
    let s2 = 0;
    for (let i = 0; i < 60; i++) {
      g2.update(-10, 90, 0, 0);
      g2.consume(out);
      s2 += out.x;
    }
    expect(s2).toBeCloseTo(10 * D, 4);
    // Titreşim
    const g3 = createGyroLook({ smoothing: 0.5 });
    g3.update(0, 90, 0, 0);
    g3.update(0.005, 90, 0, 0);
    g3.consume(out);
    expect(out.x).toBe(0);
  });

  it('createGyroLook: null/NaN sensör, reset, 360° sarma, hassasiyet', () => {
    const g = createGyroLook({ smoothing: 0 });
    const out = { x: 0, y: 0 };
    expect(g.update(null, 90, 0, 0)).toBe(false);
    expect(g.update(NaN, 90, 0, 0)).toBe(false);
    expect(g.active).toBe(false);
    g.update(359, 90, 0, 0);
    g.update(1, 90, 0, 0, 2); // alpha +2° (sola 2°), hassasiyet 2 → −4°
    g.consume(out);
    expect(out.x).toBeCloseTo(-4 * D, 4);
    g.reset();
    expect(g.active).toBe(false);
    g.update(0, 90, 0, 0);
    g.update(0, 100, 0, 0);
    g.consume(out);
    expect(out.y).toBeCloseTo(10 * D, 4);
  });

  it('requestGyroPermission: pencere yok → false; iOS izin akışı; izin reddi', async () => {
    expect(await requestGyroPermission(null)).toBe(false);
    expect(await requestGyroPermission({})).toBe(false);
    expect(await requestGyroPermission({ DeviceOrientationEvent: function X() {} })).toBe(true);
    expect(await requestGyroPermission({ DeviceOrientationEvent: { requestPermission: async () => 'granted' } })).toBe(true);
    expect(await requestGyroPermission({ DeviceOrientationEvent: { requestPermission: async () => 'denied' } })).toBe(false);
    expect(
      await requestGyroPermission({
        DeviceOrientationEvent: {
          requestPermission: async () => {
            throw new Error('x');
          },
        },
      })
    ).toBe(false);
  });
});

describe('oyun kolu', () => {
  const btn = (pressed = false, value) => ({ pressed, value: value === undefined ? (pressed ? 1 : 0) : value });
  const makePad = (over = {}) => ({
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => btn()),
    ...over,
  });
  const press = (pad, ...ids) => {
    ids.forEach((i) => (pad.buttons[i] = btn(true)));
    return pad;
  };
  const newOut = () => ({});
  const cfg = { deadZone: 0.18, sensitivity: 1, invertY: false, crouchToggle: false, flyDoubleTap: true };
  const collect = () => {
    const ev = [];
    return { ev, emit: (type, extra) => ev.push({ type, ...(extra || {}) }) };
  };

  it('radialDeadZone: ölü bölge, yön korunur, 1e sıkışır', () => {
    const o = { x: 0, y: 0, mag: 0 };
    radialDeadZone(0.1, 0.1, 0.18, o);
    expect(o.mag).toBe(0);
    radialDeadZone(0.5, 0, 0.18, o);
    expect(o.x).toBeCloseTo((0.5 - 0.18) / 0.82);
    expect(o.y).toBe(0);
    radialDeadZone(3, 4, 0.18, o);
    expect(o.mag).toBeCloseTo(1);
    expect(o.x).toBeCloseTo(0.6);
    radialDeadZone(NaN, undefined, 0.18, o);
    expect(o.mag).toBe(0);
  });

  it('gamepadDown: analog tetik eşiği ve pressed', () => {
    expect(gamepadDown(btn(false, 0.3), 0.4)).toBe(false);
    expect(gamepadDown(btn(false, 0.5), 0.4)).toBe(true);
    expect(gamepadDown({ pressed: true }, 0.4)).toBe(true);
    expect(gamepadDown(undefined)).toBe(false);
  });

  it('pickGamepad bağlı ve yeterli düğmeli ilkini seçer', () => {
    const good = makePad();
    expect(pickGamepad([null, { connected: false, axes: [0, 0, 0, 0], buttons: good.buttons }, { axes: [0, 0], buttons: [] }, good])).toBe(good);
    expect(pickGamepad(null)).toBeNull();
    expect(pickGamepad([])).toBeNull();
  });

  it('sol çubuk hareket (yukarı = ileri), sağ çubuk bakış (yukarı = yukarı bak), invertY', () => {
    const gs = createGamepadState();
    const { emit } = collect();
    const pad = makePad({ axes: [0.9, -0.9, 0, 0] });
    const out = pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), emit);
    expect(out.moveX).toBeGreaterThan(0);
    expect(out.moveZ).toBeGreaterThan(0);
    expect(out.active).toBe(true);
    const pad2 = makePad({ axes: [0, 0, 1, -1] });
    const look = pollGamepad(pad2, gs, cfg, 1 / 60, 0, newOut(), emit);
    expect(look.lookX).toBeGreaterThan(0);
    expect(look.lookY).toBeGreaterThan(0);
    const inv = pollGamepad(pad2, gs, { ...cfg, invertY: true }, 1 / 60, 0, newOut(), emit);
    expect(inv.lookY).toBeLessThan(0);
    // Tam itiş: hız ≈ GP_LOOK_RATE * dt (çapraz uzunluk 1)
    expect(Math.hypot(look.lookX, look.lookY)).toBeCloseTo(3.4 / 60, 4);
  });

  it('ölü bölge içi çubuk hiçbir şey üretmez ve aktif sayılmaz', () => {
    const gs = createGamepadState();
    const out = pollGamepad(makePad({ axes: [0.1, -0.1, 0.12, 0.05] }), gs, cfg, 1 / 60, 0, newOut(), () => {});
    expect([out.moveX, out.moveZ, out.lookX, out.lookY, out.active]).toEqual([0, 0, 0, 0, false]);
  });

  it('bakış hızı kare süresine orantılı ve ince nişan için eğrisel (yarı itiş < yarı hız)', () => {
    const gs = createGamepadState();
    const full = pollGamepad(makePad({ axes: [0, 0, 1, 0] }), gs, cfg, 1 / 60, 0, newOut(), () => {}).lookX;
    const half = pollGamepad(makePad({ axes: [0, 0, 0.59, 0] }), gs, cfg, 1 / 60, 0, newOut(), () => {}).lookX;
    expect(half).toBeLessThan(full * 0.5);
    const slow = pollGamepad(makePad({ axes: [0, 0, 1, 0] }), gs, cfg, 1 / 30, 0, newOut(), () => {}).lookX;
    expect(slow).toBeCloseTo(full * 2, 8);
  });

  it('düğmeler: A zıpla, RT kır, LT yerleştir, X etkileşim; kenar yalnız ilk karede', () => {
    const gs = createGamepadState();
    const { emit } = collect();
    const pad = press(makePad(), GP_BUTTON.A, GP_BUTTON.RT, GP_BUTTON.LT, GP_BUTTON.X);
    const a = pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), emit);
    expect([a.jump, a.jumpPressed, a.breakHeld, a.attackPressed, a.placeHeld, a.placePressed, a.interactPressed]).toEqual([true, true, true, true, true, true, true]);
    const b = pollGamepad(pad, gs, cfg, 1 / 60, 16, newOut(), emit);
    expect([b.jump, b.jumpPressed, b.breakHeld, b.attackPressed, b.placePressed, b.interactPressed]).toEqual([true, false, true, false, false, false]);
  });

  it('analog tetik eşiği: 0.3 basılı sayılmaz, 0.5 sayılır', () => {
    const gs = createGamepadState();
    const pad = makePad();
    pad.buttons[GP_BUTTON.RT] = btn(false, 0.3);
    expect(pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), () => {}).breakHeld).toBe(false);
    pad.buttons[GP_BUTTON.RT] = btn(false, 0.5);
    expect(pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), () => {}).breakHeld).toBe(true);
  });

  it('ayrık olaylar: Y envanter, Back harita, Start duraklat, d-pad hotbar/kamera/üret, RS bırak, LB/RB yetenek', () => {
    const gs = createGamepadState();
    const c = collect();
    const pad = press(makePad(), GP_BUTTON.Y, GP_BUTTON.BACK, GP_BUTTON.START, GP_BUTTON.LEFT, GP_BUTTON.RIGHT, GP_BUTTON.UP, GP_BUTTON.DOWN, GP_BUTTON.RS, GP_BUTTON.LB, GP_BUTTON.RB);
    pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), c.emit);
    const types = c.ev.map((e) => e.type).sort();
    expect(types).toEqual(['ability1', 'ability2', 'camera', 'craft', 'drop', 'hotbarDelta', 'hotbarDelta', 'inventory', 'map', 'pause']);
    expect(c.ev.filter((e) => e.type === 'hotbarDelta').map((e) => e.delta).sort()).toEqual([-1, 1]);
    // Basılı tutmak olayı yinelemez
    pollGamepad(pad, gs, cfg, 1 / 60, 16, newOut(), c.emit);
    expect(c.ev).toHaveLength(10);
  });

  it('A çift dokunuş fly olayı (flyDoubleTap kapalıysa yok)', () => {
    const gs = createGamepadState();
    const c = collect();
    const up = makePad();
    const down = press(makePad(), GP_BUTTON.A);
    pollGamepad(down, gs, cfg, 1 / 60, 0, newOut(), c.emit);
    pollGamepad(up, gs, cfg, 1 / 60, 50, newOut(), c.emit);
    pollGamepad(down, gs, cfg, 1 / 60, 150, newOut(), c.emit);
    expect(c.ev.map((e) => e.type)).toEqual(['fly']);
    const gs2 = createGamepadState();
    const c2 = collect();
    const nofly = { ...cfg, flyDoubleTap: false };
    pollGamepad(down, gs2, nofly, 1 / 60, 0, newOut(), c2.emit);
    pollGamepad(up, gs2, nofly, 1 / 60, 50, newOut(), c2.emit);
    pollGamepad(down, gs2, nofly, 1 / 60, 150, newOut(), c2.emit);
    expect(c2.ev).toHaveLength(0);
  });

  it('LS koşu kilidi; çubuk bırakılınca kilit açılır', () => {
    const gs = createGamepadState();
    const moving = makePad({ axes: [0, -1, 0, 0] });
    pollGamepad(moving, gs, cfg, 1 / 60, 0, newOut(), () => {});
    const withLs = press(makePad({ axes: [0, -1, 0, 0] }), GP_BUTTON.LS);
    expect(pollGamepad(withLs, gs, cfg, 1 / 60, 16, newOut(), () => {}).sprint).toBe(true);
    expect(pollGamepad(moving, gs, cfg, 1 / 60, 32, newOut(), () => {}).sprint).toBe(true);
    expect(pollGamepad(makePad(), gs, cfg, 1 / 60, 48, newOut(), () => {}).sprint).toBe(false);
    expect(pollGamepad(moving, gs, cfg, 1 / 60, 64, newOut(), () => {}).sprint).toBe(false);
  });

  it('B çömelme: basılıyken; crouchToggle ile kilit', () => {
    const gs = createGamepadState();
    const pad = press(makePad(), GP_BUTTON.B);
    expect(pollGamepad(pad, gs, cfg, 1 / 60, 0, newOut(), () => {}).crouch).toBe(true);
    expect(pollGamepad(makePad(), gs, cfg, 1 / 60, 16, newOut(), () => {}).crouch).toBe(false);
    const t = { ...cfg, crouchToggle: true };
    const gs2 = createGamepadState();
    expect(pollGamepad(pad, gs2, t, 1 / 60, 0, newOut(), () => {}).crouch).toBe(true);
    expect(pollGamepad(makePad(), gs2, t, 1 / 60, 16, newOut(), () => {}).crouch).toBe(true);
    expect(pollGamepad(pad, gs2, t, 1 / 60, 32, newOut(), () => {}).crouch).toBe(false);
  });

  it('kol yoksa sıfır çıktı ve durum sıfırlanır', () => {
    const gs = createGamepadState();
    pollGamepad(press(makePad(), GP_BUTTON.A), gs, cfg, 1 / 60, 0, newOut(), () => {});
    const out = pollGamepad(null, gs, cfg, 1 / 60, 16, newOut(), () => {});
    expect(out.active).toBe(false);
    expect(out.jump).toBe(false);
    expect(gs.prev).toHaveLength(0);
    // Yeniden bağlanınca basılı düğme yeni kenar sayılır (kayıp olay yok)
    const c = collect();
    pollGamepad(press(makePad(), GP_BUTTON.Y), gs, cfg, 1 / 60, 32, newOut(), c.emit);
    expect(c.ev).toHaveLength(1);
  });

  it('eksik axes/buttons dizileri çökertmez', () => {
    const gs = createGamepadState();
    const out = pollGamepad({ axes: [], buttons: [] }, gs, cfg, 1 / 60, 0, newOut(), () => {});
    expect(out.active).toBe(false);
  });
});

describe('dokunmatik bölge ve düğme tanımları', () => {
  it('touchZoneFor sol/sağ elli', () => {
    expect(touchZoneFor(100, 1000, 0.4, false)).toBe('joystick');
    expect(touchZoneFor(399, 1000, 0.4, false)).toBe('joystick');
    expect(touchZoneFor(400, 1000, 0.4, false)).toBe('look');
    expect(touchZoneFor(900, 1000, 0.4, true)).toBe('joystick');
    expect(touchZoneFor(100, 1000, 0.4, true)).toBe('look');
    expect(touchZoneFor(5, 0, 0.4, false)).toBe('look');
  });

  it('TOUCH_BUTTONS benzersiz adlar, Türkçe etiket, geçerli tür', () => {
    const names = new Set();
    TOUCH_BUTTONS.forEach((b) => {
      expect(names.has(b.name)).toBe(false);
      names.add(b.name);
      expect(['hold', 'tap', 'toggle']).toContain(b.kind);
      expect(b.label.length).toBeGreaterThan(0);
    });
    ['jump', 'break', 'place', 'interact', 'crouch', 'sprint', 'inventory', 'craft', 'camera', 'map', 'pause', 'drop', 'fly', 'ability1', 'ability4', 'hotbar1', 'hotbar9', 'hotbarPrev', 'hotbarNext'].forEach((n) => expect(names.has(n)).toBe(true));
    expect(touchButtonDef('jump').kind).toBe('hold');
    expect(touchButtonDef('nope')).toBeNull();
    expect(touchButtonDef('constructor')).toBeNull();
  });

  it('isInteractiveTarget closest ile çalışır; closest yoksa false', () => {
    expect(isInteractiveTarget(null)).toBe(false);
    expect(isInteractiveTarget({})).toBe(false);
    expect(isInteractiveTarget({ closest: (sel) => (sel.includes('[data-no-tap]') ? {} : null) })).toBe(true);
    expect(isInteractiveTarget({ closest: () => null })).toBe(false);
  });
});
