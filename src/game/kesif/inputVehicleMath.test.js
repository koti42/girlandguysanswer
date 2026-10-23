import { describe, expect, it } from 'vitest';
import {
  ASSIST_MAX,
  PEDAL_MIN,
  SLIDER_DEAD,
  SPRING_RATE,
  STEER_DEAD,
  WHEEL_MAX_RAD,
  clamp,
  createPedalTracker,
  createSliderTracker,
  createWheelTracker,
  deadZone,
  driveKeyAction,
  laneAssist,
  mixAssist,
  num,
  padDrive,
  pedalValue,
  radioIndexForCode,
  slew,
  steerCurve,
} from './inputVehicleMath.js';

const DEG = Math.PI / 180;
/** merkez (100,100), yarıçap 60; açı a (derece, saat yönü, 0 = yukarı) → ekran noktası */
const pt = (aDeg, r = 50) => [100 + Math.sin(aDeg * DEG) * r, 100 - Math.cos(aDeg * DEG) * r];

describe('inputVehicleMath: temel yardımcılar', () => {
  it('num/clamp NaN-güvenli', () => {
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
    expect(num('3')).toBe(0);
    expect(num(2.5)).toBe(2.5);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });

  it('deadZone: ölü bölge içinde 0, sonra 0..1 yeniden ölçekler, işaret korunur', () => {
    expect(deadZone(0.03, 0.04)).toBe(0);
    expect(deadZone(-0.04, 0.04)).toBe(0);
    expect(deadZone(1, 0.04)).toBeCloseTo(1, 9);
    expect(deadZone(-1, 0.04)).toBeCloseTo(-1, 9);
    expect(deadZone(0.52, 0.04)).toBeCloseTo(0.5, 9);
    expect(deadZone(NaN, 0.1)).toBe(0);
    expect(deadZone(9, 0.1)).toBeCloseTo(1, 9);
  });

  it('steerCurve: tam kilit korunur, küçük girdi hızla yumuşar, monoton, işaret simetrik', () => {
    expect(steerCurve(1, 40)).toBeCloseTo(1, 9);
    expect(steerCurve(-1, 0)).toBeCloseTo(-1, 9);
    expect(steerCurve(0.5, 0)).toBeCloseTo(0.5, 9);
    expect(steerCurve(0.5, 30)).toBeLessThan(0.5);
    expect(steerCurve(0.5, 30)).toBeGreaterThan(0.35);
    let prev = -2;
    for (let x = -1; x <= 1.0001; x += 0.05) {
      const y = steerCurve(x, 20);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = y;
      expect(steerCurve(-x, 20)).toBeCloseTo(-y, 9);
    }
    expect(steerCurve(NaN, 5)).toBe(0);
    expect(Number.isFinite(steerCurve(0.5, NaN))).toBe(true);
  });

  it('slew: sabit hızda yaklaşır, aşmaz, dt<=0 ve NaN güvenli', () => {
    expect(slew(0, 1, 0.18, 0.12, 0.09)).toBeCloseTo(0.5, 9);
    expect(slew(0, 1, 0.18, 0.12, 1)).toBe(1);
    expect(slew(1, 0, 0.18, 0.12, 0.06)).toBeCloseTo(0.5, 9);
    // yön değişimi (−1 → +1): azalan |değer| hızlı (down) yolu kullanır
    expect(slew(-1, 1, 0.18, 0.12, 0.06)).toBeCloseTo(-0.5, 9);
    expect(slew(0.3, 0.3, 0.18, 0.12, 0.1)).toBe(0.3);
    expect(slew(0.3, 1, 0.18, 0.12, 0)).toBe(0.3);
    expect(slew(NaN, 1, 0.18, 0.12, 0.05)).toBeCloseTo(0.05 / 0.18, 9);
    expect(slew(0, NaN, 0.18, 0.12, 0.05)).toBe(0);
    expect(slew(0, 1, 0.18, 0.12, NaN)).toBe(0);
  });

  it('pedalValue: en alt 0.6, en üst 1.0, ortası doğrusal, sınır dışı kıskaç', () => {
    expect(pedalValue(1)).toBeCloseTo(PEDAL_MIN, 9);
    expect(pedalValue(0)).toBeCloseTo(1, 9);
    expect(pedalValue(0.5)).toBeCloseTo(0.8, 9);
    expect(pedalValue(-3)).toBeCloseTo(1, 9);
    expect(pedalValue(9)).toBeCloseTo(PEDAL_MIN, 9);
    expect(pedalValue(NaN)).toBeCloseTo(1, 9);
  });

  it('radioIndexForCode / driveKeyAction', () => {
    expect(radioIndexForCode('Digit1')).toBe(0);
    expect(radioIndexForCode('Numpad9')).toBe(8);
    expect(radioIndexForCode('Digit0')).toBe(-1);
    expect(radioIndexForCode('KeyA')).toBe(-1);
    expect(radioIndexForCode(5)).toBe(-1);
    expect(driveKeyAction('KeyC')).toBe('camera');
    expect(driveKeyAction('KeyH')).toBe('horn');
    expect(driveKeyAction('KeyR')).toBe('reset');
    expect(driveKeyAction('KeyW')).toBeNull();
  });
});

describe('createWheelTracker: direksiyon eşlemesi', () => {
  it('üstten tutup 90° sağa çevirmek ≈ 0.67 steer (90/135, ölü bölge payı ile)', () => {
    const w = createWheelTracker();
    const [x0, y0] = pt(0);
    expect(w.begin(1, x0, y0, 100, 100, 60)).toBe(true);
    const [x1, y1] = pt(90);
    expect(w.move(1, x1, y1)).toBe(true);
    expect(w.state.angle).toBeCloseTo(90 * DEG, 5);
    const exp = (90 / 135 - STEER_DEAD) / (1 - STEER_DEAD);
    expect(w.state.steer).toBeCloseTo(exp, 5);
  });

  it('sola çevirmek negatif, simetrik', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(-60));
    const a = w.state.steer;
    const w2 = createWheelTracker();
    w2.begin(1, ...pt(0), 100, 100, 60);
    w2.move(1, ...pt(60));
    expect(a).toBeLessThan(0);
    expect(a).toBeCloseTo(-w2.state.steer, 9);
  });

  it('±135° sınırında kıskaç: steer tam ±1; daha fazla çevirmek aşmaz', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    for (let a = 0; a <= 170; a += 5) w.move(1, ...pt(a));
    expect(w.state.angle).toBeCloseTo(WHEEL_MAX_RAD, 9);
    expect(w.state.steer).toBeCloseTo(1, 9);
    // parmak sınırı aştıktan sonra geri dönünce hemen çözülür (sarma yok)
    w.move(1, ...pt(120));
    expect(w.state.angle).toBeLessThan(WHEEL_MAX_RAD);
  });

  it('±180° çizgisini geçen parmak sıçrama yaratmaz (artışlı açı)', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(100), 100, 100, 60);
    let prev = w.state.angle;
    for (let a = 100; a <= 260; a += 4) {
      w.move(1, ...pt(a));
      expect(Math.abs(w.state.angle - prev)).toBeLessThan(10 * DEG);
      prev = w.state.angle;
    }
  });

  it('merkeze çok yakın hareketler yok sayılır (açı belirsiz)', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(45));
    const a = w.state.angle;
    w.move(1, 100.5, 100.2);
    expect(w.state.angle).toBe(a);
  });

  it('bırakınca geri yay 6/sn: 1 sn sonra ~0; 0.1 sn sonra exp(-0.6)', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(120));
    const a0 = w.state.angle;
    expect(w.end(1)).toBe(true);
    for (let i = 0; i < 6; i++) w.update(1 / 60);
    expect(w.state.angle).toBeCloseTo(a0 * Math.exp(-SPRING_RATE * 0.1), 5);
    for (let i = 0; i < 80; i++) w.update(1 / 60);
    expect(w.state.angle).toBe(0);
    expect(w.state.steer).toBe(0);
  });

  it('parmak basılıyken update geri yay uygulamaz', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(60));
    const a = w.state.angle;
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    expect(w.state.angle).toBe(a);
  });

  it('çoklu dokunma yalıtımı: ikinci işaretçi başlayamaz, yabancı id hareketi/bırakmayı etkilemez', () => {
    const w = createWheelTracker();
    expect(w.begin(7, ...pt(0), 100, 100, 60)).toBe(true);
    expect(w.begin(8, ...pt(0), 100, 100, 60)).toBe(false);
    expect(w.move(8, ...pt(90))).toBe(false);
    expect(w.state.angle).toBe(0);
    expect(w.end(8)).toBe(false);
    expect(w.state.active).toBe(true);
    expect(w.move(7, ...pt(30))).toBe(true);
    expect(w.end(7)).toBe(true);
    expect(w.state.active).toBe(false);
  });

  it('ikinci tutuş mevcut açıdan devam eder (sıçrama yok)', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(80));
    w.end(1);
    const a = w.state.angle;
    w.begin(2, ...pt(200), 100, 100, 60);
    expect(w.state.angle).toBe(a);
    w.move(2, ...pt(210));
    expect(w.state.angle).toBeCloseTo(a + 10 * DEG, 5);
  });

  it('cancel() parmağı bırakır, reset() açıyı da sıfırlar', () => {
    const w = createWheelTracker();
    w.begin(1, ...pt(0), 100, 100, 60);
    w.move(1, ...pt(90));
    w.cancel();
    expect(w.state.active).toBe(false);
    expect(w.state.angle).not.toBe(0);
    w.reset();
    expect(w.state.angle).toBe(0);
    expect(w.state.steer).toBe(0);
  });

  it('NaN/Infinity girdileri durumu zehirlemez', () => {
    const w = createWheelTracker();
    w.begin(1, NaN, Infinity, NaN, 5, -3);
    w.move(1, NaN, NaN);
    w.move(1, Infinity, -Infinity);
    w.update(NaN);
    w.update(-1);
    expect(Number.isFinite(w.state.angle)).toBe(true);
    expect(Number.isFinite(w.state.steer)).toBe(true);
    expect(Math.abs(w.state.steer)).toBeLessThanOrEqual(1);
  });

  it('rastgele işaretçi akışı (fuzz): steer her zaman [-1,1] ve sonlu', () => {
    let s = 12345;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const w = createWheelTracker();
    for (let i = 0; i < 5000; i++) {
      const r = rnd();
      if (r < 0.1) w.begin(Math.floor(rnd() * 3), rnd() * 200, rnd() * 200, 100, 100, 60);
      else if (r < 0.2) w.end(Math.floor(rnd() * 3));
      else if (r < 0.25) w.cancel();
      else if (r < 0.8) w.move(Math.floor(rnd() * 3), rnd() * 200 - 20, rnd() * 200 - 20);
      else w.update(rnd() * 0.05);
      expect(Math.abs(w.state.steer)).toBeLessThanOrEqual(1);
      expect(Number.isFinite(w.state.angle)).toBe(true);
    }
  });
});

describe('createSliderTracker: kaydırıcı', () => {
  it('ilk dokunuş sıfır noktasıdır; yarım aralık = ±1 (ölü bölge sonrası)', () => {
    const s = createSliderTracker();
    s.begin(1, 300, 80);
    s.move(1, 300);
    expect(s.state.steer).toBe(0);
    s.move(1, 300 + 80 * SLIDER_DEAD * 0.9);
    expect(s.state.steer).toBe(0);
    s.move(1, 380);
    expect(s.state.steer).toBeCloseTo(1, 9);
    s.move(1, 220);
    expect(s.state.steer).toBeCloseTo(-1, 9);
    s.move(1, 300 + 40);
    expect(s.state.steer).toBeCloseTo((0.5 - SLIDER_DEAD) / (1 - SLIDER_DEAD), 9);
    s.move(1, 9999);
    expect(s.state.steer).toBeCloseTo(1, 9);
  });

  it('geri yay ve kimlik yalıtımı', () => {
    const s = createSliderTracker();
    expect(s.begin(1, 0, 60)).toBe(true);
    expect(s.begin(2, 0, 60)).toBe(false);
    s.move(1, 60);
    expect(s.move(2, -60)).toBe(false);
    expect(s.state.steer).toBeCloseTo(1, 9);
    s.end(1);
    for (let i = 0; i < 90; i++) s.update(1 / 60);
    expect(s.state.value).toBe(0);
    expect(s.state.steer).toBe(0);
  });

  it('NaN güvenli', () => {
    const s = createSliderTracker();
    s.begin(1, NaN, NaN);
    s.move(1, NaN);
    s.update(NaN);
    expect(Number.isFinite(s.state.steer)).toBe(true);
  });
});

describe('createPedalTracker', () => {
  it('analog değer ve kimlik yalıtımı', () => {
    const p = createPedalTracker();
    p.begin(3, 0.5);
    expect(p.state.value).toBeCloseTo(0.8, 9);
    expect(p.begin(4, 0)).toBe(false);
    expect(p.move(4, 0)).toBe(false);
    p.move(3, 0);
    expect(p.state.value).toBeCloseTo(1, 9);
    expect(p.end(4)).toBe(false);
    expect(p.end(3)).toBe(true);
    expect(p.state.value).toBe(0);
    expect(p.state.active).toBe(false);
  });
});

describe('padDrive', () => {
  const mk = (axes, vals) => {
    const buttons = [];
    for (let i = 0; i < 16; i++) buttons.push({ pressed: false, value: 0 });
    Object.keys(vals || {}).forEach((k) => {
      buttons[k] = { pressed: vals[k] > 0.5, value: vals[k] };
    });
    return { axes, buttons };
  };
  const out = {};
  it('RT gaz, LT fren, A nitro, B el freni, sol çubuk direksiyon', () => {
    padDrive(mk([0.6, 0, 0, 0], { 7: 0.8, 6: 0.3, 0: 1, 1: 1 }), null, out);
    expect(out.steer).toBeGreaterThan(0.3);
    expect(out.throttle).toBeCloseTo(0.8, 9);
    expect(out.brake).toBeCloseTo(0.3, 9);
    expect(out.nitro).toBe(true);
    expect(out.handbrake).toBe(true);
    expect(out.active).toBe(true);
  });
  it('ölü bölge ve boş kol', () => {
    padDrive(mk([0.1, 0.05, 0, 0], {}), null, out);
    expect(out.steer).toBe(0);
    expect(out.active).toBe(false);
    padDrive(null, null, out);
    expect(out.active).toBe(false);
    padDrive({ axes: [], buttons: [] }, null, out);
    expect(out.steer).toBe(0);
  });
  it('tetik yoksa sol çubuk y yedek (yukarı = gaz, aşağı = fren)', () => {
    padDrive(mk([0, -0.9, 0, 0], {}), null, out);
    expect(out.throttle).toBeGreaterThan(0.5);
    padDrive(mk([0, 0.9, 0, 0], {}), null, out);
    expect(out.brake).toBeGreaterThan(0.5);
    expect(out.throttle).toBe(0);
  });
  it('NaN eksenler 0 sayılır', () => {
    padDrive(mk([NaN, NaN, 0, 0], { 7: NaN }), null, out);
    expect(out.steer).toBe(0);
    expect(out.throttle).toBe(0);
  });
});

describe('laneAssist / mixAssist', () => {
  const lane = { x: 0, z: 0, yaw: 0 }; // yaw 0: ileri −Z, sağ = +X
  it('şeridin sağındaki araç sola (−), solundakiler sağa (+) çevrilir', () => {
    const right = laneAssist({ speed: 15, x: 1.5, z: 0, yaw: 0 }, lane);
    const left = laneAssist({ speed: 15, x: -1.5, z: 0, yaw: 0 }, lane);
    expect(right).toBeLessThan(0);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeCloseTo(-right, 9);
  });
  it('yön hatası: araç solu gösteriyorsa (yaw > laneYaw) sağa (+) çevrilir', () => {
    expect(laneAssist({ speed: 15, x: 0, z: 0, yaw: 0.2 }, lane)).toBeGreaterThan(0);
    expect(laneAssist({ speed: 15, x: 0, z: 0, yaw: -0.2 }, lane)).toBeLessThan(0);
  });
  it('düşük hız, yola dik, şeritten uzak, eksik veri → 0; her zaman ≤ 0.25', () => {
    expect(laneAssist({ speed: 3, x: 1, z: 0, yaw: 0 }, lane)).toBe(0);
    expect(laneAssist({ speed: 15, x: 0, z: 0, yaw: 1.2 }, lane)).toBe(0);
    expect(laneAssist({ speed: 15, x: 6, z: 0, yaw: 0 }, lane)).toBe(0);
    expect(laneAssist(null, lane)).toBe(0);
    expect(laneAssist({ speed: 15, x: 0, z: 0, yaw: 0 }, null)).toBe(0);
    expect(laneAssist({ speed: NaN, x: 0, z: 0, yaw: 0 }, lane)).toBe(0);
    for (let x = -3; x <= 3; x += 0.1) for (let yw = -0.4; yw <= 0.4; yw += 0.05) {
      const a = laneAssist({ speed: 20, x, z: 0, yaw: yw }, lane);
      expect(Math.abs(a)).toBeLessThanOrEqual(ASSIST_MAX + 1e-12);
      expect(Number.isFinite(a)).toBe(true);
    }
  });
  it('dönmüş şerit (yaw 90°) için yanal hata şerit eksenine göre', () => {
    const l2 = { x: 0, z: 0, yaw: Math.PI / 2 }; // ileri −X, sağ = (cos, −sin) = (0, −1)
    const a = laneAssist({ speed: 15, x: 0, z: -1.5, yaw: Math.PI / 2 }, l2); // sağında
    expect(a).toBeLessThan(0);
  });
  it('mixAssist: sürücü direksiyonu 0.1 ve üstünde yardım kapanır; 0.05 yarım; toplam [-1,1]', () => {
    expect(mixAssist(0, 0.2)).toBeCloseTo(0.2, 9);
    expect(mixAssist(0.05, 0.2)).toBeCloseTo(0.05 + 0.1, 9);
    expect(mixAssist(0.1, 0.2)).toBeCloseTo(0.1, 9);
    expect(mixAssist(0.8, 0.25)).toBeCloseTo(0.8, 9);
    expect(mixAssist(-1, -0.25)).toBe(-1);
    expect(mixAssist(NaN, NaN)).toBe(0);
  });
});
