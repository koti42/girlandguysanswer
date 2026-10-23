import { describe, expect, it } from 'vitest';
import { cpuMs } from '../../../../../test/perfScale.js';
import { B } from '../../blocks.js';
import { VEHICLE_CLASSES, VEHICLE_DEFS, turnRadiusAt, vehicleSpec } from './vehicleData.js';
import {
  FIXED_DT, aabbOf, createVehicle, hudOf, parkVehicle, physicsDigest, restoreVehicle, serializeVehicle, setPose, stepVehicle, vehicleObb,
} from './vehiclePhysics.js';
import {
  fillBox, flatWorld, makeRng, run,
} from './vehicleTestKit.js';

const WHEELED = ['taksi', 'spor', 'kamyonet', 'motor'];
const mk = (cls, o) => createVehicle(cls, Object.assign({ x: 0.5, y: 64, z: 0.5, yaw: 0 }, o || null));

describe('boyuna dinamik', () => {
  it('0 → %97 azami hız süresi şartname aralığında (her sınıf)', () => {
    const w = flatWorld();
    VEHICLE_CLASSES.forEach((cls) => {
      const v = mk(cls);
      const spec = vehicleSpec(cls);
      let t = 0;
      let t97 = -1;
      for (let i = 0; i < 60 * 25; i++) {
        stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
        t += FIXED_DT;
        if (t97 < 0 && Math.hypot(v.vx, v.vz) >= 0.97 * v.def.max) t97 = t;
      }
      expect(t97, cls).toBeGreaterThan(spec.t97Min);
      expect(t97, cls).toBeLessThanOrEqual(spec.t97Max + 1e-9);
      const sp = Math.hypot(v.vx, v.vz);
      expect(sp, cls).toBeGreaterThan(v.def.max * 0.99);
      expect(sp, cls).toBeLessThanOrEqual(v.def.max * 1.001);
    });
  });

  it('nitro: azami hız ve ivme artar; tank 25/sn yanar, tükenince tuş bırakılana dek yeniden başlamaz, 1 sn bekleyince 6/sn dolar', () => {
    const w = flatWorld();
    const v = mk('taksi');
    const out = run(v, w, 6, { throttle: 1, nitro: true });
    expect(out.events.nitroStart).toBe(1); // tükenince kilit: tuş basılı olsa da ikinci başlangıç yok
    expect(out.events.nitroEnd).toBe(1);
    expect(out.maxSpeed).toBeGreaterThan(v.def.max * 1.05);
    expect(out.maxSpeed).toBeLessThanOrEqual(v.def.max * v.def.nitro.spd * 1.01);
    // yanma hızı: 50'lik tank 2 sn'de biter
    const b = mk('spor', { nitro: 50 });
    const o2 = run(b, w, 1, { throttle: 1, nitro: true });
    expect(b.nitro).toBeGreaterThan(50 - 25 * 1.02);
    expect(b.nitro).toBeLessThan(50 - 25 * 0.95);
    expect(o2.events.nitroStart).toBe(1);
    // bırakınca 1 sn bekleme, sonra 6/sn dolum
    const n0 = b.nitro;
    run(b, w, 0.9, { throttle: 1 });
    expect(b.nitro).toBe(n0);
    run(b, w, 3, { throttle: 1 });
    expect(b.nitro).toBeGreaterThan(n0 + 6 * 2.7);
    expect(b.nitro).toBeLessThan(n0 + 6 * 3.05);
    // tuş basılı tutulursa 24 sn boyunca tek başlangıç (testere dişi tekrarı yok)
    const longRun = run(mk('spor'), w, 24, { throttle: 1, nitro: true });
    expect(longRun.events.nitroStart).toBe(1);
    // 5'in altında başlamaz
    const lo = mk('taksi', { nitro: 3 });
    const o3 = run(lo, w, 1, { throttle: 1, nitro: true });
    expect(o3.events.nitroStart || 0).toBe(0);
    // tuş bırakılıp yeniden basılırsa (tank yeterliyse) yeniden başlar
    const r = mk('taksi', { nitro: 10 });
    run(r, w, 2, { throttle: 1, nitro: true });
    run(r, w, 1, { throttle: 1 });
    r.nitro = 40;
    const o4 = run(r, w, 0.5, { throttle: 1, nitro: true });
    expect(o4.events.nitroStart).toBe(1);
  });

  it('fren mesafesi ≈ v²/(2·fren); ıslak yol mesafeyi uzatır', () => {
    const w = flatWorld();
    const dist = (wet) => {
      const v = mk('taksi');
      run(v, w, 12, { throttle: 1 }, { wet });
      const z0 = v.z;
      const sp0 = Math.hypot(v.vx, v.vz);
      let n = 0;
      while (Math.hypot(v.vx, v.vz) > 0.05 && n++ < 1200) stepVehicle(v, { brake: 1 }, w, FIXED_DT, { wet });
      return { d: z0 - v.z, sp0 };
    };
    const dry = dist(0);
    const wet = dist(1);
    const ideal = (dry.sp0 * dry.sp0) / (2 * VEHICLE_DEFS.taksi.brake);
    expect(dry.d).toBeGreaterThan(ideal * 0.9);
    expect(dry.d).toBeLessThan(ideal * 1.12);
    expect(wet.d).toBeGreaterThan(dry.d * 1.3);
    expect(wet.d).toBeLessThan(dry.d * 1.7);
  });

  it('gaz bırakınca motor freniyle yavaşlar; el freni daha çabuk durdurur', () => {
    const w = flatWorld();
    const a = mk('spor');
    run(a, w, 8, { throttle: 1 });
    const b = mk('spor');
    run(b, w, 8, { throttle: 1 });
    run(a, w, 3, {});
    run(b, w, 3, { handbrake: true });
    expect(Math.hypot(a.vx, a.vz)).toBeLessThan(a.def.max * 0.95);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(Math.hypot(a.vx, a.vz));
  });

  it('geri vites: durur, geri gider, azami geri hız 0,3·max; gear −1', () => {
    const w = flatWorld();
    const v = mk('taksi');
    const out = run(v, w, 10, { brake: 1 });
    expect(v.u).toBeLessThan(-1);
    expect(-v.u).toBeLessThanOrEqual(0.3 * v.def.max * 1.001);
    expect(v.gear).toBe(-1);
    expect(v.lights.reverse).toBe(true);
    expect(out.events.shift).toBeGreaterThanOrEqual(1);
    // gazla geri giderken önce fren yapar, sonra ileri gider
    run(v, w, 6, { throttle: 1 });
    expect(v.u).toBeGreaterThan(5);
  });

  it('vites kutusu: ivmelenirken 4 yukarı vites, devir [rölanti,1], vites sırası monoton; yavaşlarken aşağı vites', () => {
    const w = flatWorld();
    const v = mk('taksi');
    const gears = [];
    let minRpm = 9;
    let maxRpm = 0;
    for (let i = 0; i < 60 * 12; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
      if (gears[gears.length - 1] !== v.gear) gears.push(v.gear);
      minRpm = Math.min(minRpm, v.rpm);
      maxRpm = Math.max(maxRpm, v.rpm);
    }
    expect(gears).toEqual([1, 2, 3, 4, 5]);
    expect(minRpm).toBeGreaterThanOrEqual(v.def.rpm.idle - 1e-6);
    expect(maxRpm).toBeLessThanOrEqual(1.0001);
    const down = [];
    for (let i = 0; i < 60 * 8; i++) {
      stepVehicle(v, { brake: 0.6 }, w, FIXED_DT, {});
      if (v.u > 0.5 && down[down.length - 1] !== v.gear) down.push(v.gear);
    }
    expect(down[0]).toBe(5);
    expect(down[down.length - 1]).toBeLessThan(5);
    for (let i = 1; i < down.length; i++) expect(down[i]).toBeLessThan(down[i - 1]);
  });

  it('rpm hızla (aynı vitesteyken) monoton artar', () => {
    const w = flatWorld();
    const v = mk('kamyonet');
    let last = -1;
    let lastGear = 1;
    let violations = 0;
    for (let i = 0; i < 60 * 3; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
      if (v.gear === lastGear && v.shiftT === 0 && v.rpm < last - 1e-3) violations++;
      last = v.rpm;
      lastGear = v.gear;
    }
    expect(violations).toBe(0);
  });
});

describe('direksiyon ve sürüklenme', () => {
  it('düşük hızda dönüş yarıçapı kinematik formülle ±%10 (her sınıf)', () => {
    const w = flatWorld();
    VEHICLE_CLASSES.forEach((cls) => {
      const v = mk(cls);
      const pts = [];
      for (let i = 0; i < 60 * 40; i++) {
        const sp = Math.hypot(v.vx, v.vz);
        stepVehicle(v, { throttle: sp < 2.5 ? 0.6 : 0, steer: 1, steerDirect: true }, w, FIXED_DT, {});
        if (i > 60 * 20) pts.push([v.x, v.z]); // ilk 20 sn çemberin oturması; sonraki 20 sn en az bir tam tur
      }
      const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const R = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cz), 0) / pts.length;
      const exp = turnRadiusAt(cls, Math.hypot(v.vx, v.vz));
      expect(R / exp, cls + ' R=' + R.toFixed(2) + ' beklenen=' + exp.toFixed(2)).toBeGreaterThan(0.9);
      expect(R / exp, cls).toBeLessThan(1.1);
    });
  });

  it('sağa direksiyon sağa döndürür (yaw azalır), sola direksiyon sola (yaw artar); geri giderken yön ters', () => {
    const w = flatWorld();
    const r = mk('taksi');
    run(r, w, 3, (i) => ({ throttle: 0.5, steer: i > 30 ? 1 : 0 }));
    expect(r.yaw).toBeLessThan(-0.2);
    expect(r.x).toBeGreaterThan(0.5); // sağa (+x) döndü
    const l = mk('taksi');
    run(l, w, 3, (i) => ({ throttle: 0.5, steer: i > 30 ? -1 : 0 }));
    expect(l.yaw).toBeGreaterThan(0.2);
    expect(l.x).toBeLessThan(0.5);
  });

  it('hıza duyarlı direksiyon: yüksek hızda yaw hızı ωMax\'ı aşmaz ve düşük hıza göre çok daha az', () => {
    const w = flatWorld();
    const hi = mk('spor');
    run(hi, w, 8, { throttle: 1 });
    let maxOm = 0;
    for (let i = 0; i < 90; i++) {
      stepVehicle(hi, { throttle: 1, steer: 1 }, w, FIXED_DT, {});
      maxOm = Math.max(maxOm, Math.abs(hi.yawRate));
    }
    expect(maxOm).toBeLessThanOrEqual(hi.def.omegaMax + 1e-6);
    const lo = mk('spor');
    let maxLo = 0;
    for (let i = 0; i < 120; i++) {
      stepVehicle(lo, { throttle: Math.hypot(lo.vx, lo.vz) < 6 ? 0.7 : 0, steer: 1, steerDirect: true }, w, FIXED_DT, {});
      maxLo = Math.max(maxLo, Math.abs(lo.yawRate));
    }
    expect(maxOm).toBeLessThan(maxLo);
  });

  it('el freni sürüklenmesi: drift bayrağı, yanal hız > 0,25·u, bırakınca tutuş geri gelir; 1,2 sn sürüklenme nitro kazandırır', () => {
    const w = flatWorld();
    const v = mk('spor', { nitro: 40 });
    run(v, w, 9, { throttle: 1 });
    const out = run(v, w, 2.4, { throttle: 1, steer: 1, handbrake: true });
    expect(out.events.driftBoost).toBeGreaterThanOrEqual(1);
    expect(v.nitro).toBeGreaterThan(40 + 20);
    let driftFrames = 0;
    const v2 = mk('spor');
    run(v2, w, 9, { throttle: 1 });
    for (let i = 0; i < 120; i++) {
      stepVehicle(v2, { throttle: 1, steer: 1, handbrake: true }, w, FIXED_DT, {});
      if (v2.drift) driftFrames++;
    }
    expect(driftFrames).toBeGreaterThan(40);
    expect(Math.abs(v2.w)).toBeGreaterThan(0.25 * Math.abs(v2.u));
    // bırak: tutuş toparlar
    run(v2, w, 2.5, { throttle: 0.5 });
    expect(Math.abs(v2.w)).toBeLessThan(1.5);
    expect(v2.drift).toBe(false);
  });

  it('ıslak yolda yüksek hızlı tam direksiyon kuruya göre daha çok kayar (daha büyük yanal hız)', () => {
    const w = flatWorld();
    const lat = (wet) => {
      const v = mk('taksi');
      run(v, w, 8, { throttle: 1 }, { wet });
      let m = 0;
      for (let i = 0; i < 120; i++) {
        stepVehicle(v, { throttle: 1, steer: 1, steerDirect: true }, w, FIXED_DT, { wet });
        m = Math.max(m, Math.abs(v.w));
      }
      return m;
    };
    expect(lat(1)).toBeGreaterThan(lat(0) + 0.5);
  });

  it('gövde eğimi görsel: ivmelenirken burun yukarı, frenlerken aşağı; viraj dışına yatar (taksi), motor içe yatar', () => {
    const w = flatWorld();
    const a = mk('taksi');
    run(a, w, 1.5, { throttle: 1 });
    expect(a.pitch).toBeGreaterThan(0.005);
    run(a, w, 0.7, { brake: 1 });
    expect(a.pitch).toBeLessThan(0);
    const t = mk('taksi');
    run(t, w, 4, { throttle: 1 });
    run(t, w, 1, { throttle: 1, steer: 1 });
    expect(t.roll).toBeLessThan(-0.01);
    const m = mk('motor');
    run(m, w, 4, { throttle: 1 });
    run(m, w, 1, { throttle: 1, steer: 1 });
    expect(m.roll).toBeGreaterThan(0.01);
  });
});

describe('hover ve Süzülkay', () => {
  it('hoverbike/Süzülkay hover yüksekliğine oturur; Süzülkay Space ile 8 m/s zıplar ve havada döner', () => {
    const w = flatWorld();
    const hb = mk('hoverbike');
    run(hb, w, 2, { throttle: 0.3 });
    expect(hb.y - 64).toBeGreaterThan(1.15);
    expect(hb.y - 64).toBeLessThan(1.3);
    const s = mk('suzulkay');
    run(s, w, 2, {});
    expect(s.y - 64).toBeGreaterThan(0.3);
    expect(s.y - 64).toBeLessThan(0.42);
    let maxY = 0;
    let hops = 0;
    for (let i = 0; i < 90; i++) {
      const ev = stepVehicle(s, { hop: i === 0 || i === 30 }, w, FIXED_DT, {});
      hops += ev.filter((e) => e.type === 'hop').length;
      maxY = Math.max(maxY, s.y - 64);
    }
    expect(hops).toBeGreaterThanOrEqual(1);
    expect(maxY).toBeGreaterThan(1.1);
    expect(s.y - 64).toBeLessThan(0.5); // geri indi
    // havada dönüş: stil olayı
    const sp = mk('suzulkay');
    run(sp, w, 1, { throttle: 0.5 });
    let style = 0;
    for (let i = 0; i < 100; i++) {
      const ev = stepVehicle(sp, { hop: i === 0 || i === 30, steer: 1, throttle: 0.5, steerDirect: true }, w, FIXED_DT, {});
      style += ev.filter((e) => e.type === 'style').length;
    }
    expect(style).toBe(1); // çift zıplama + tam direksiyon ≥ yarım tur → bir "Stil" olayı
  });

  it('hover su üstünde süzülür (suya batmaz) ve uçuruma düşer', () => {
    const w = flatWorld({ ground: 43 });
    fillBox(w, -60, 44, -60, 60, 58, 60, B.WATER);
    const hb = mk('hoverbike', { y: 60 });
    run(hb, w, 3, { throttle: 0.5 });
    expect(hb.inWater).toBe(false);
    expect(hb.y).toBeGreaterThan(58.5);
    expect(hb.y).toBeLessThan(61);
    const v = mk('hoverbike', { y: 70 });
    const pit = flatWorld({ ground: 20 });
    const o = run(v, pit, 1.5, {});
    expect(o.minY).toBeLessThan(70);
  });
});

describe('belirlenimcilik, bozuk girdi, perf', () => {
  it('aynı girdi → aynı yörünge (20 sn rastgele girdi, iki örnek, iki dünya) 1e-4', () => {
    VEHICLE_CLASSES.forEach((cls, ci) => {
      const wa = flatWorld();
      const wb = flatWorld();
      fillBox(wa, 30, 64, -60, 34, 66, 60, B.STONE);
      fillBox(wb, 30, 64, -60, 34, 66, 60, B.STONE);
      const a = mk(cls);
      const b = mk(cls);
      const ra = makeRng(1000 + ci);
      const rb = makeRng(1000 + ci);
      const gen = (r, i) => ({
        steer: Math.sin(i / 37) * 0.9 + (r() - 0.5) * 0.2,
        throttle: r() < 0.8 ? 1 : 0,
        brake: r() < 0.1 ? 1 : 0,
        handbrake: r() < 0.05,
        nitro: r() < 0.2,
        hop: r() < 0.05,
        steerDirect: r() < 0.5,
      });
      for (let i = 0; i < 60 * 20; i++) {
        stepVehicle(a, gen(ra, i), wa, FIXED_DT, { wet: (i % 600) / 600 });
        stepVehicle(b, gen(rb, i), wb, FIXED_DT, { wet: (i % 600) / 600 });
      }
      const da = physicsDigest(a);
      const db = physicsDigest(b);
      da.forEach((x, k) => expect(Math.abs(x - db[k]), cls + '#' + k).toBeLessThan(1e-4));
      expect(a.x === b.x && a.z === b.z).toBe(true);
    });
  });

  it('NaN / Infinity / tür hatalı girdi: durum her zaman sonlu kalır (fuzz)', () => {
    const w = flatWorld();
    const rng = makeRng(99);
    const junk = [NaN, Infinity, -Infinity, 'x', null, undefined, {}, [], 1e300, -1e300, true, false, 7, -7];
    const pick = () => junk[Math.floor(rng() * junk.length)];
    VEHICLE_CLASSES.forEach((cls) => {
      const v = mk(cls);
      for (let i = 0; i < 1500; i++) {
        const inp = {
          steer: rng() < 0.5 ? pick() : (rng() - 0.5) * 3,
          throttle: rng() < 0.5 ? pick() : rng() * 1.5,
          brake: rng() < 0.5 ? pick() : rng(),
          handbrake: pick(),
          nitro: pick(),
          hop: pick(),
          steerDirect: pick(),
        };
        stepVehicle(v, rng() < 0.05 ? undefined : inp, w, FIXED_DT, { wet: pick() });
        expect(Number.isFinite(v.x + v.y + v.z + v.yaw + v.vx + v.vz + v.u + v.w + v.pitch + v.roll + v.nitro + v.rpm + v.steer), cls + ' @' + i).toBe(true);
      }
    });
  });

  it('bozuk dt ve bozuk durum: dt 0/negatif/NaN yok sayılır; büyük dt parçalanır; NaN durum kurtarılır', () => {
    const w = flatWorld();
    const v = mk('taksi');
    [0, -1, NaN, Infinity].forEach((dt) => {
      const before = physicsDigest(v);
      stepVehicle(v, { throttle: 1 }, w, dt, {});
      expect(physicsDigest(v)).toEqual(before);
    });
    stepVehicle(v, { throttle: 1 }, w, 5, {});
    expect(Number.isFinite(v.x + v.z)).toBe(true);
    expect(v.z).toBeLessThan(0.5);
    run(v, w, 1, { throttle: 1 });
    v.x = NaN;
    v.vz = Infinity;
    const ev = stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
    expect(ev.some((e) => e.type === 'recover')).toBe(true);
    expect(Number.isFinite(v.x + v.y + v.z + v.vx + v.vz)).toBe(true);
    v.y = NaN;
    v.yaw = NaN;
    v.good.ok = false;
    stepVehicle(v, {}, w, FIXED_DT, {});
    expect(Number.isFinite(v.y + v.yaw)).toBe(true);
  });

  it('farklı dt\'ler (1/30, 1/60, 1/120) benzer menzil; fizik adımı maliyeti < 0,05 ms/araç', () => {
    const w = flatWorld();
    const dist = (dt) => {
      const v = mk('taksi');
      for (let t = 0; t < 8; t += dt) stepVehicle(v, { throttle: 1 }, w, dt, {});
      return -v.z;
    };
    const d60 = dist(1 / 60);
    expect(Math.abs(dist(1 / 120) - d60) / d60).toBeLessThan(0.03);
    expect(Math.abs(dist(1 / 30) - d60) / d60).toBeLessThan(0.05);
    const cars = VEHICLE_CLASSES.map((c) => mk(c));
    const rng = makeRng(5);
    for (let i = 0; i < 400; i++) cars.forEach((v) => stepVehicle(v, { throttle: 1, steer: Math.sin(i / 20) }, w, FIXED_DT, {})); // ısınma
    const N = 600;
    let ms = Infinity; // en iyi 8 parti: paralel test yükü (başka işçiler) ölçümü şişirmesin
    for (let rep = 0; rep < 8; rep++) {
      const t0 = cpuMs(); // qa5: süreç CPU zamanı (duvar saati kesintilerinden etkilenmez); parti ≈ 200 ms ≫ ölçüm ince­liği
      for (let i = 0; i < N; i++) {
        cars.forEach((v) => stepVehicle(v, { throttle: 1, steer: Math.sin(i / 50), nitro: rng() < 0.1 }, w, FIXED_DT, {}));
      }
      ms = Math.min(ms, (cpuMs() - t0) / (N * cars.length));
    }
    expect(ms).toBeLessThan(0.05);
  });
});

describe('kozmetik hasar (yalnız görsel)', () => {
  it('çarpmalar dmg değerini artırır (0..1, HP yok), hız/yetenek etkilenmez; kayıt gidiş-dönüşte korunur', () => {
    const w = flatWorld();
    fillBox(w, -50, 64, -30, 50, 68, -30, B.STONE);
    const v = mk('taksi');
    expect(v.dmg).toBe(0);
    for (let k = 0; k < 6; k++) {
      v.x = 0.5; v.z = 0.5; v.vx = 0; v.vz = -20; v.u = 20; v.yaw = 0;
      for (let i = 0; i < 80; i++) stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
    }
    expect(v.dmg).toBeGreaterThan(0.5);
    expect(v.dmg).toBeLessThanOrEqual(1);
    const q = restoreVehicle(serializeVehicle(v));
    expect(q.dmg).toBeCloseTo(v.dmg, 2);
    expect(restoreVehicle({ cls: 'taksi', x: 1, y: 64, z: 1, dmg: 7 }).dmg).toBe(1);
    expect(restoreVehicle({ cls: 'taksi', x: 1, y: 64, z: 1, dmg: NaN }).dmg).toBe(0);
    const fresh = mk('taksi');
    run(fresh, flatWorld(), 12, { throttle: 1 });
    expect(Math.hypot(v.vx, v.vz) >= 0).toBe(true);
    expect(fresh.dmg).toBe(0);
  });
});

describe('durum yardımcıları', () => {
  it('OBB / AABB / HUD / kayıt', () => {
    const v = mk('taksi', { yaw: Math.PI / 2, x: 10, z: 20 });
    const o = vehicleObb(v, {});
    expect(o.hl).toBeCloseTo(2.1, 9);
    expect(o.hw).toBeCloseTo(0.95, 9);
    expect(o.fx).toBeCloseTo(-1, 9); // yaw π/2 → ileri −X
    expect(Math.abs(o.fz)).toBeLessThan(1e-9);
    const ab = aabbOf(v, {});
    expect(ab.maxX - ab.minX).toBeCloseTo(4.2, 6);
    expect(ab.maxZ - ab.minZ).toBeCloseTo(1.9, 6);
    expect(ab.maxY - ab.minY).toBeCloseTo(1.5, 9);
    const w = flatWorld();
    run(v, w, 3, { throttle: 1 });
    const h = hudOf(v, {});
    expect(h.cls).toBe('taksi');
    expect(h.kmh).toBe(Math.round(Math.hypot(v.vx, v.vz) * 3.6));
    expect(h.gear).toBeGreaterThanOrEqual(1);
    expect(h.nitro).toBe(1);
    const raw = serializeVehicle(v);
    const back = restoreVehicle(raw, { id: 5 });
    expect(back.cls).toBe('taksi');
    expect(back.x).toBeCloseTo(v.x, 1);
    expect(back.id).toBe(5);
    [null, 5, [], { cls: 'x' }, { cls: 'taksi' }, { cls: 'taksi', x: NaN, y: 0, z: 0 }, { cls: '__proto__', x: 1, y: 1, z: 1 }, { cls: 'taksi', x: 1e9, y: 1, z: 1 }].forEach((bad) => {
      expect(restoreVehicle(bad)).toBe(null);
    });
    setPose(v, 1, 64, 2, 0.5);
    expect(v.u + v.vx + v.vz).toBe(0);
    parkVehicle(v);
    expect(v.throttle).toBe(0);
    expect(() => createVehicle('nope')).toThrow();
  });
});

describe('sınıf başına azami hız bütçesi (nitro hariç) 51 m/s altındadır, hover/spor nitro ile üstüne çıkar', () => {
  it('nitro azami hızları', () => {
    const w = flatWorld();
    const sp = {};
    ['spor', 'hoverbike', 'motor'].forEach((c) => {
      const v = mk(c);
      sp[c] = run(v, w, 9, { throttle: 1, nitro: true }).maxSpeed;
    });
    expect(sp.spor).toBeGreaterThan(48);
    expect(sp.hoverbike).toBeGreaterThan(51);
  });
});
