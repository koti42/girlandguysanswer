import { beforeAll, describe, expect, it } from 'vitest';
import * as physics from '../physics.js';
import { ColliderIndex } from '../props/colliderIndex.js';
import { PropWorld } from '../props/propWorld.js';
import { validatePropDef } from '../props/propDefs.js';
import { mulberry32 } from '../rng.js';
import { ARCHETYPES } from './archetypes.js';
import { allLots } from './cityLots.js';
import { getBlockPlan, getCityPlan, planBuilding } from './cityPlan.js';
import {
  CABIN_DEF, ELEVATOR_ACCEL, ELEVATOR_SPEED, ELEVATOR_T, PLATFORM_THICK, allElevators, bindInterior, buttonPropId, cabinButtonSpot, cabinPropId, createElevatorSim,
  doorCells, elevatorAt, elevatorPropSpecs, elevatorsOfLot, inBore, nearestStop, planElevators, restoreElevatorState, rideAssist,
} from './elevators.js';
import { planInterior } from './interior/index.js';
import { chunkWorld, registerGenericFakes } from './interior/testKit.js';
import { ID } from './cityEmit.js';
import { normalizeSpec } from '../props/propPlan.js';
import { scanText } from './citySafeData.js';

const DT = 1 / 60;
const { createPlayerBody, stepPlayer } = physics;
const ID_OK = /^[0-9a-z]{1,10}$/;

beforeAll(() => {
  registerGenericFakes();
  bindInterior(planInterior);
});

function sample(seed, n) {
  const all = allElevators(seed);
  const out = [];
  for (let i = 0; i < all.length && out.length < n; i += Math.max(1, Math.floor(all.length / n))) out.push(all[i]);
  return out;
}

describe('plan', () => {
  it('belirlenimci; kimlikler benzersiz ve kayıt anahtarı biçiminde; her asansörde ≥ 2 durak', () => {
    for (let s = 0; s < 6; s++) {
      const a = allElevators(s);
      expect(a.length).toBeGreaterThan(20);
      const ids = new Set();
      a.forEach((e) => {
        expect(ID_OK.test(e.id), e.id).toBe(true);
        expect(ids.has(e.id)).toBe(false);
        ids.add(e.id);
        expect(e.stops.length).toBeGreaterThanOrEqual(2);
      });
    }
    const x = JSON.stringify(allElevators(3).map((e) => [e.id, e.face, e.stops.map((q) => q.y)]));
    bindInterior(planInterior);
    expect(JSON.stringify(allElevators(3).map((e) => [e.id, e.face, e.stops.map((q) => q.y)]))).toBe(x);
  });

  it('geometri: kuyu 2×2, kapı halka hücresi, çıkış hücresi halkanın dışı, durak y = 64+4·kat, kat kuralı 14+15k', () => {
    for (let s = 0; s < 4; s++) {
      allElevators(s).forEach((e) => {
        const c = e.core;
        expect(e.bore.x1 - e.bore.x0).toBe(2);
        expect(e.bore.z1 - e.bore.z0).toBe(2);
        expect(c.x1 - c.x0).toBe(4);
        let prev = -1;
        e.stops.forEach((st, i) => {
          expect(st.i).toBe(i);
          expect(st.y).toBe(64 + 4 * st.floor);
          expect(st.y).toBeGreaterThan(prev);
          prev = st.y;
          if (i === 0) {
            expect(st.floor).toBe(0);
            expect(st.kind).toBe('zemin');
          } else {
            expect((st.floor - 14) % 15).toBe(0);
            expect(st.kind).toBe('sky');
          }
          expect(st.cells.length).toBe(2);
          st.cells.forEach(([x, z]) => {
            // halka (4×4) hücresi ama kuyu değil
            expect(x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1).toBe(true);
            expect(x >= e.bore.x0 && x < e.bore.x1 && z >= e.bore.z0 && z < e.bore.z1).toBe(false);
          });
          const [ox, oz] = st.out;
          expect(ox >= c.x0 && ox < c.x1 && oz >= c.z0 && oz < c.z1).toBe(false);
          expect(Math.abs(ox - st.cells[0][0]) + Math.abs(oz - st.cells[0][1])).toBe(1);
          expect(st.name.length).toBeGreaterThan(4);
          expect(scanText(st.name)).toEqual([]);
        });
        expect(e.yMin).toBe(64);
        expect(e.yMax).toBe(e.stops[e.stops.length - 1].y);
      });
    }
  });

  it('kapsama: ≥16 katlı kule çekirdeklerinin ≥ %75\'inde asansör var (6 tohum)', () => {
    let q = 0;
    let ok = 0;
    for (let s = 0; s < 6; s++) {
      allLots(getCityPlan(s)).forEach((l) => {
        const A = ARCHETYPES[l.archetype];
        if (!A || !A.tower || !l.built) return;
        const bp = planBuilding(s, l);
        const els = elevatorsOfLot(s, l);
        bp.core.forEach((c) => {
          const top = bp.tiers.filter((t) => t.part === c.part).reduce((m, t) => Math.max(m, t.f1), 0);
          if (top < 16) return;
          q++;
          if (els.some((e) => e.part === c.part)) ok++;
        });
      });
    }
    expect(q).toBeGreaterThan(200);
    expect(ok / q).toBeGreaterThan(0.75);
  });

  it('planElevators: çekirdeksiz/kule olmayan/bozuk bina → []', () => {
    expect(planElevators(null)).toEqual([]);
    expect(planElevators({})).toEqual([]);
    expect(planElevators({ core: [], tiers: [], archetype: 'kule_cam' })).toEqual([]);
    expect(planElevators({ core: [{ part: 0, x0: 1, z0: 1, x1: 5, z1: 5, f0: 0, f1: 20 }], tiers: [], archetype: 'dukkan_sirasi' })).toEqual([]);
  });

  it('kabin tanımı geçerli prop tanımı; kimlikler farklı', () => {
    expect(validatePropDef(CABIN_DEF)).toEqual([]);
    expect(CABIN_DEF.t).toBe(ELEVATOR_T);
    const e = allElevators(0)[0];
    expect(cabinPropId(e.id)).not.toBe(buttonPropId(e.id));
    expect(cabinPropId(e.id)).toBe(cabinPropId(e.id));
    const bs = cabinButtonSpot(e, 64);
    expect(inBore(e, bs.x, bs.z, 0.01)).toBe(true);
  });
});

describe('gerçek dünya (kabuk + iç mekân kancası): kapı hücreleri halka, kuyu hava, çıkış hücreleri boş', () => {
  it('24 asansör: kuyu boş; durak kapı hücreleri katı halka (kapalı kapı yerleşir); kapı önü 2×2 durak katında geçilebilir', () => {
    const picks = sample(1, 12).concat(sample(2, 12));
    expect(picks.length).toBeGreaterThanOrEqual(20);
    const worlds = new Map();
    const get = (seed, x, y, z) => {
      let w = worlds.get(seed);
      if (!w) {
        w = chunkWorld(seed);
        worlds.set(seed, w);
      }
      return w.getBlock(x, y, z);
    };
    const solid = (id) => id !== 0 && id !== ID.DOOR_OPEN;
    picks.forEach((e, k) => {
      const seed = k < 12 ? 1 : 2;
      // kuyu: tüm yükseklikte (durak aralığı) hava
      for (let y = e.yMin; y <= e.yMax + 2; y += 3) {
        for (let x = e.bore.x0; x < e.bore.x1; x++) for (let z = e.bore.z0; z < e.bore.z1; z++) expect(get(seed, x, y, z), e.id + ' kuyu ' + y).toBe(0);
      }
      e.stops.forEach((st) => {
        // kapı hücreleri üretimde katı halka (kabin yokken kuyuya düşme yok)
        doorCells(e, st.i).forEach(([x, y, z]) => expect(solid(get(seed, x, y, z)), e.id + ' kapı ' + y).toBe(true));
        // kapı önü: 2 derin × 2 geniş × 3 yüksek geçilebilir
        const d = e.dir;
        for (let dep = 0; dep < 2; dep++) {
          st.cells.forEach(([cx, cz]) => {
            const x = cx + d[0] * (dep + 1);
            const z = cz + d[1] * (dep + 1);
            for (let y = st.y; y < st.y + 3; y++) expect(solid(get(seed, x, y, z)), e.id + ' çıkış (' + x + ',' + y + ',' + z + ') kat ' + st.floor).toBe(false);
            expect(solid(get(seed, x, st.y - 1, z)), e.id + ' çıkış zemini').toBe(true);
          });
        }
      });
    });
  }, 120000);
});

describe('düğme PropSpec\'leri', () => {
  it('blok planlarından: normalizeSpec geçerli prop üretir; kimlikler benzersiz; çapa duvar düzleminde', () => {
    const seen = new Set();
    let count = 0;
    for (let bi = -4; bi <= 4; bi++) {
      for (let bj = -4; bj <= 4; bj++) {
        const bp = getBlockPlan(5, bi, bj);
        const specs = elevatorPropSpecs(5, bp);
        specs.forEach((sp) => {
          const p = normalizeSpec(5, sp);
          expect(p, JSON.stringify(sp)).not.toBeNull();
          expect(seen.has(p.id)).toBe(false);
          seen.add(p.id);
          expect(sp.kind).toBe('asansor_dugmesi');
          expect(sp.yaw >= 0 && sp.yaw <= 3).toBe(true);
          count++;
        });
        // rect süzgeci
        const half = elevatorPropSpecs(5, bp, { x0: bi * 80, z0: bj * 80, x1: bi * 80 + 40, z1: bj * 80 + 40 });
        expect(half.length).toBeLessThanOrEqual(specs.length);
      }
    }
    expect(count).toBeGreaterThan(30);
    expect(elevatorPropSpecs(5, null)).toEqual([]);
  });

  it('elevatorAt: düğme konumundan asansör + durak bulunur; uzakta null', () => {
    const e = allElevators(5)[3];
    e.stops.forEach((st) => {
      const r = elevatorAt(5, st.button.x, st.button.y, st.button.z);
      expect(r.el.id).toBe(e.id);
      expect(r.stop).toBe(st.i);
    });
    expect(elevatorAt(5, 9999, 70, 9999)).toBeNull();
  });
});

describe('kabin simülasyonu', () => {
  const el = allElevators(0).find((e) => e.stops.length === 4);

  function run(sim, seconds, env, cb) {
    const log = [];
    for (let t = 0; t < seconds / DT; t++) {
      const ev = sim.step(DT, env);
      if (cb) cb(sim, t);
      for (let i = 0; i < ev.length; i++) log.push(Object.assign({ t: t * DT }, ev[i]));
    }
    return log;
  }

  it('başlangıç: zemin katta, kapı açık (idle), kayıt boş (varsayılan)', () => {
    const s = createElevatorSim(el);
    expect(s.y).toBe(64);
    expect(s.doorStop).toBe(0);
    expect(s.serialize()).toBeNull();
  });

  it('çağrı → kapı kapanır, hız ≤ 8, ivme ≤ sınır, tam durağa oturur, kapı açılır; süre ≈ mesafe/8', () => {
    const s = createElevatorSim(el);
    expect(s.call(1)).toBe(true);
    let vmax = 0;
    let amax = 0;
    let prev = 0;
    let moving = false;
    const log = run(s, 40, {}, (sm) => {
      vmax = Math.max(vmax, Math.abs(sm.vy));
      amax = Math.max(amax, Math.abs(sm.vy - prev) / DT);
      prev = sm.vy;
      if (sm.phase === 'moving') moving = true;
    });
    expect(moving).toBe(true);
    expect(vmax).toBeLessThanOrEqual(ELEVATOR_SPEED + 1e-9);
    expect(vmax).toBeGreaterThan(7.5);
    expect(amax).toBeLessThanOrEqual(ELEVATOR_ACCEL * 1.01); // duruşta bile ani hız farkı yok
    expect(s.y).toBe(el.stops[1].y);
    expect(s.doorStop).toBe(1);
    const dep = log.find((e) => e.type === 'depart');
    const arr = log.find((e) => e.type === 'arrived');
    expect(dep.from).toBe(0);
    expect(dep.to).toBe(1);
    expect(arr.stop).toBe(1);
    const dist = el.stops[1].y - el.stops[0].y;
    const travel = arr.t - dep.t;
    expect(travel).toBeGreaterThan(dist / ELEVATOR_SPEED);
    expect(travel).toBeLessThan(dist / ELEVATOR_SPEED + ELEVATOR_SPEED / ELEVATOR_ACCEL + 0.3);
    // kapı yalnız durakta açık
    const s2 = createElevatorSim(el);
    s2.call(2);
    run(s2, 0.7, {});
    expect(s2.phase).toBe('moving');
    expect(s2.doorStop).toBe(-1);
    const s3 = createElevatorSim(el);
    s3.call(2);
    run(s3, 0.2, {});
    expect(s3.phase).toBe('closing');
    expect(s3.doorStop).toBe(0); // kapı kapanana dek açık
  });

  it('kapıda biri varken kapanmaz (güvenli kapı); çekilince kapanır ve yola çıkar', () => {
    const s = createElevatorSim(el);
    s.call(1);
    let blocked = true;
    run(s, 3, { blocked: () => blocked });
    expect(s.phase).toBe('closing');
    expect(s.doorStop).toBe(0);
    blocked = false;
    run(s, 40, { blocked: () => blocked });
    expect(s.doorStop).toBe(1);
  });

  it('kuyruk: yoldayken gelen çağrılar sırayla işlenir; aynı çağrı iki kez eklenmez; üst sınır 3', () => {
    const s = createElevatorSim(el);
    expect(s.call(0)).toBe(false); // zaten orada
    s.call(3);
    run(s, 0.8, {});
    expect(s.call(3)).toBe(false);
    expect(s.call(2)).toBe(true);
    expect(s.call(1)).toBe(true);
    expect(s.call(99)).toBe(false);
    expect(s.call(-1)).toBe(false);
    expect(s.call(NaN)).toBe(false);
    const order = [];
    run(s, 120, {}, (sm) => {
      if (sm.phase === 'idle' && (order.length === 0 || order[order.length - 1] !== sm.at)) order.push(sm.at);
    });
    expect(order).toEqual([3, 2, 1]);
  });

  it('abort(): yoldaki kabin en yakın durağa varır; kuyuda takılma yok', () => {
    const s = createElevatorSim(el);
    s.call(3);
    run(s, 5, {});
    expect(s.phase).toBe('moving');
    expect(s.abort()).toBe(true);
    run(s, 40, {});
    expect(s.phase).toBe('idle');
    expect(s.doorStop).toBeGreaterThanOrEqual(0);
    expect(el.stops.map((q) => q.y)).toContain(s.y);
    expect(createElevatorSim(el).abort()).toBe(false);
  });

  it('sonlu zaman: rastgele çağrı fırtınası (400 çağrı) her zaman bir durakta durur, NaN yok', () => {
    const rng = mulberry32(5);
    for (let k = 0; k < 20; k++) {
      const s = createElevatorSim(el);
      for (let i = 0; i < 20; i++) {
        s.call(Math.floor(rng() * 6) - 1);
        run(s, rng() * 3, { blocked: () => rng() < 0.2 });
        if (rng() < 0.2) s.abort();
        expect(Number.isFinite(s.y) && Number.isFinite(s.vy)).toBe(true);
        expect(s.y).toBeGreaterThanOrEqual(el.yMin - 1e-9);
        expect(s.y).toBeLessThanOrEqual(el.yMax + 1e-9);
      }
      run(s, 200, {});
      expect(s.phase).toBe('idle');
      expect(el.stops.map((q) => q.y)).toContain(s.y);
    }
  });

  it('dt sağlamlığı: NaN/negatif/dev dt hiçbir şey bozmaz', () => {
    const s = createElevatorSim(el);
    s.call(2);
    [NaN, -1, 0, Infinity, undefined, 5].forEach((d) => {
      expect(Array.isArray(s.step(d, {}))).toBe(true);
      expect(Number.isFinite(s.y)).toBe(true);
    });
    expect(s.y).toBeLessThanOrEqual(el.yMax);
  });

  it('kayıt: durakta {s}; yolda {s,t,y}; geri yükleme aynı konumdan sürer; bozuk veri → zemin kat', () => {
    const s = createElevatorSim(el);
    s.call(2);
    run(s, 6, {});
    const saved = s.serialize();
    expect(saved.s).toBe(0);
    expect(saved.t).toBe(2);
    expect(saved.y).toBeGreaterThan(64);
    expect(JSON.stringify(saved).length).toBeLessThan(160);
    const r = createElevatorSim(el, JSON.parse(JSON.stringify(saved)));
    expect(Math.abs(r.y - saved.y)).toBeLessThan(1e-9);
    expect(r.phase).toBe('moving');
    run(r, 80, {});
    expect(r.doorStop).toBe(2);
    expect(r.y).toBe(el.stops[2].y);
    // durakta duran
    const a = createElevatorSim(el);
    a.call(3);
    run(a, 80, {});
    expect(a.serialize()).toEqual({ s: 3 });
    const b = createElevatorSim(el, { s: 3 });
    expect(b.y).toBe(el.stops[3].y);
    expect(b.doorStop).toBe(3);
    [null, undefined, 5, 'x', [], {}, { s: 99 }, { s: -1 }, { s: 'a' }, { s: 1, t: 1, y: NaN }, { s: 0, t: 99 }, { s: 0, t: 2, y: 1e9 }].forEach((raw) => {
      const c = createElevatorSim(el, raw);
      expect(Number.isFinite(c.y)).toBe(true);
      expect(c.y).toBeGreaterThanOrEqual(el.yMin);
      expect(c.y).toBeLessThanOrEqual(el.yMax);
      expect(restoreElevatorState(el, raw) === null || typeof restoreElevatorState(el, raw) === 'object').toBe(true);
    });
    const evil = JSON.parse('{"__proto__":{"y":1},"s":1,"t":3,"y":100}');
    expect(createElevatorSim(el, evil).y).toBeGreaterThanOrEqual(el.stops[1].y);
    expect({}.y).toBeUndefined();
  });

  it('nearestStop', () => {
    expect(nearestStop(el, 64)).toBe(0);
    expect(nearestStop(el, el.yMax + 50)).toBe(el.stops.length - 1);
    expect(nearestStop(el, (el.stops[0].y + el.stops[1].y) / 2 + 1)).toBe(1);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Fizik: oyuncu kabinle taşınır (gerçek stepPlayer + ColliderIndex), 8 b/sn'de ejeksiyon/gömülme yok
 * ---------------------------------------------------------------------------------------------- */
describe('rideAssist (taşıma güvencesi)', () => {
  const e = allElevators(0)[0];
  const mk = (y, dx, dz) => ({ x: e.cx + (dx || 0), y, z: e.cz + (dz || 0), vy: -3 });
  it('kuyu dışı: dokunmaz; platformda/üstünde: 0; gömülü: platforma kaldırır (1); >1,2 altında: kurtarma (2); durağan kabinin >2,5 üstünde: indirir (3)', () => {
    expect(rideAssist(e, 100, 0, mk(100, 5, 5))).toBe(0);
    expect(rideAssist(e, 100, 0, mk(100.0))).toBe(0);
    expect(rideAssist(e, 100, 0, mk(101.5))).toBe(0);
    const b1 = mk(99.9);
    expect(rideAssist(e, 100, 8, b1)).toBe(1);
    expect(b1.y).toBe(100);
    expect(b1.vy).toBe(0);
    const b2 = mk(95);
    expect(rideAssist(e, 100, 8, b2)).toBe(2);
    expect(b2.y).toBe(100);
    const b3 = mk(110);
    expect(rideAssist(e, 100, 0, b3)).toBe(3);
    expect(b3.y).toBe(100);
    // hareketli kabinde zıplayan oyuncu (≤ 8 üstte) dokunulmaz
    expect(rideAssist(e, 100, -8, mk(104))).toBe(0);
    expect(rideAssist(e, 100, -8, mk(120))).toBe(3);
    const nan = { x: NaN, y: NaN, z: NaN, vy: 0 };
    expect(() => rideAssist(e, 100, 0, nan)).not.toThrow();
  });
});

describe('taşıma: oyuncu ve prop kabinle gider', () => {
  const el = allElevators(0).find((e) => e.stops.length >= 3);
  const c = el.core;

  /** Voxel dünyası: zemin y≤63 katı; halka katı (durak kapıları yalnız kabin orada iken açık); kuyu hava. */
  function makeWorld(idx, sim, opts) {
    const closed = !!(opts && opts.closed);
    return {
      colliders: idx,
      yMin: -400,
      yMax: 362, // Neon Meridyen dünyasıyla aynı (sim/dim DIMS.neon)
      getBlock(x, y, z) {
        if (y <= 63) return 1;
        const inRing = x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1;
        if (!inRing) {
          // durak katlarının döşemesi (kule içi hol zemini)
          for (let i = 1; i < el.stops.length; i++) if (y === el.stops[i].y - 1) return 1;
          return 0;
        }
        if (inBore(el, x, z)) return 0;
        for (let i = 0; i < el.stops.length; i++) {
          const st = el.stops[i];
          if (!closed && y >= st.y && y < st.y + 3 && st.cells.some((q) => q[0] === x && q[1] === z) && sim.doorStop === i) return 0;
        }
        return 1;
      },
    };
  }

  function setup(opts) {
    const idx = new ColliderIndex();
    const sim = createElevatorSim(el);
    const world = makeWorld(idx, sim, opts);
    const place = () => {
      const y = sim.y - PLATFORM_THICK;
      idx.setDynamic(77, [el.bore.x0, y, el.bore.z0, el.bore.x1, y + PLATFORM_THICK, el.bore.z1], { x: 0, y: sim.vy, z: 0 });
    };
    place();
    return { idx, sim, world, place };
  }

  function ride(opts) {
    const { idx, sim, world, place } = setup({ closed: true });
    const body = createPlayerBody(el.cx, el.stops[0].y, el.cz);
    const input = opts.input || (() => ({}));
    let maxDy = 0;
    let maxOff = 0;
    let airborne = 0;
    let steps = 0;
    sim.call(opts.to);
    let doneAt = -1;
    for (let t = 0; t < 60 * 60; t++) {
      // gerçek sıra: oyuncu fiziği, sonra platform sistemi
      stepPlayer(body, input(t, sim, body), world, DT, {}, { mode: 'macera' });
      sim.step(DT, {});
      place();
      rideAssist(el, sim.y, sim.vy, body);
      steps++;
      const top = sim.y;
      maxDy = Math.max(maxDy, Math.abs(body.y - top));
      maxOff = Math.max(maxOff, Math.abs(body.x - el.cx), Math.abs(body.z - el.cz));
      if (!body.onGround) airborne++;
      expect(Number.isFinite(body.x + body.y + body.z)).toBe(true);
      expect(body.y).toBeGreaterThan(top - 0.5); // kabinin altına düşme / gömülme yok
      if (sim.phase === 'idle' && sim.at === opts.to && doneAt < 0) doneAt = t;
      if (doneAt >= 0 && t > doneAt + 30) break;
    }
    return { body, sim, maxDy, maxOff, airborne, steps, doneAt, idx };
  }

  it('yukarı 8 b/sn: oyuncu platformda kalır (|Δy| < 0.03), kuyudan çıkmaz, havalanmaz', () => {
    const r = ride({ to: el.stops.length - 1 });
    expect(r.doneAt).toBeGreaterThan(0);
    expect(r.sim.y).toBe(el.yMax);
    expect(r.maxDy).toBeLessThan(0.03);
    expect(r.maxOff).toBeLessThan(0.9);
    expect(r.body.y).toBeCloseTo(el.yMax, 1);
    expect(r.airborne).toBeLessThan(5);
  });

  it('aşağı 8 b/sn (yukarıdan başlat): oyuncu birlikte iner, havalanmaz', () => {
    const { sim, world, place } = setup();
    const top = el.stops.length - 1;
    sim.call(top);
    do sim.step(DT, {}); while (sim.phase !== 'idle');
    expect(sim.at).toBe(top);
    place();
    const body = createPlayerBody(el.cx, el.yMax, el.cz);
    for (let i = 0; i < 20; i++) stepPlayer(body, {}, world, DT, {}, { mode: 'macera' });
    sim.call(0);
    let maxDy = 0;
    let airborne = 0;
    for (let t = 0; t < 60 * 90 && !(sim.phase === 'idle' && sim.at === 0); t++) {
      stepPlayer(body, {}, world, DT, {}, { mode: 'macera' });
      sim.step(DT, {});
      place();
      rideAssist(el, sim.y, sim.vy, body);
      maxDy = Math.max(maxDy, Math.abs(body.y - sim.y));
      if (!body.onGround) airborne++;
    }
    expect(sim.y).toBe(el.stops[0].y);
    expect(maxDy).toBeLessThan(0.06);
    expect(airborne).toBeLessThan(10);
    expect(body.y).toBeCloseTo(64, 1);
  });

  it('kabinde zıplayan ve hareket eden oyuncu: kuyudan çıkmaz, kabinin altına düşmez (NaN yok)', () => {
    const rng = mulberry32(9);
    const r = ride({
      to: el.stops.length - 1,
      input: () => ({
        moveX: rng() < 0.5 ? 1 : -1, moveZ: rng() < 0.5 ? 1 : -1, yaw: rng() * 6, jump: rng() < 0.1, jumpPressed: rng() < 0.05,
      }),
    });
    expect(r.maxOff).toBeLessThan(1.01);
    expect(r.sim.y).toBe(el.yMax);
  });

  it('varışta kapı açılır: oyuncu kapıdan çıkış hücresine yürüyebilir (hapis yok)', () => {
    const { idx, sim, world, place } = setup();
    const body = createPlayerBody(el.cx, el.stops[0].y, el.cz);
    sim.call(1);
    for (let t = 0; t < 60 * 60 && !(sim.phase === 'idle' && sim.at === 1); t++) {
      stepPlayer(body, {}, world, DT, {}, { mode: 'macera' });
      sim.step(DT, {});
      place();
      rideAssist(el, sim.y, sim.vy, body);
    }
    expect(sim.doorStop).toBe(1);
    // kapıya doğru yürü: yaw 0 → +Z; yön vektörüne göre yaw seç
    const d = el.dir;
    const yaw = Math.atan2(-d[0], -d[1]); // ileri = (−sin yaw, −cos yaw)
    const st = el.stops[1];
    let out = false;
    for (let t = 0; t < 60 * 4; t++) {
      stepPlayer(body, { moveZ: 1, yaw }, world, DT, {}, { mode: 'macera' });
      sim.step(DT, {});
      place();
      rideAssist(el, sim.y, sim.vy, body);
      const inside = inBore(el, body.x, body.z);
      if (!inside && Math.abs(body.y - st.y) < 0.2) {
        out = true;
        break;
      }
    }
    expect(out).toBe(true);
    expect(idx.size).toBeGreaterThan(0);
  });

  it('kabin prop\'u ve kabin düğmesi dinamik olarak hizalı gider (PropWorld.moveDynamic)', () => {
    const colliders = new ColliderIndex();
    const pw = new PropWorld({ citySeed: 1, colliders, planner: () => [] });
    const orig = pw.getDef;
    pw.getDef = (t) => (t === ELEVATOR_T ? CABIN_DEF : orig(t));
    const sim = createElevatorSim(el);
    const cab = {
      id: cabinPropId(el.id), t: ELEVATOR_T, x: el.cx, y: sim.y - PLATFORM_THICK, z: el.cz, yaw: 0, variant: 0, flags: 0,
    };
    expect(pw.addDynamic(cab)).toBe(true);
    const spot = cabinButtonSpot(el, sim.y);
    const btn = {
      id: buttonPropId(el.id), t: (pw.getDef(0) || { t: 0 }).t || 0, x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw, variant: 0, flags: 0,
    };
    expect(typeof btn.id).toBe('number');
    sim.call(2);
    let maxGap = 0;
    for (let t = 0; t < 60 * 60 && !(sim.phase === 'idle' && sim.at === 2); t++) {
      sim.step(DT, {});
      expect(pw.moveDynamic(cab.id, el.cx, sim.y - PLATFORM_THICK, el.cz, 0, { x: 0, y: sim.vy, z: 0 })).toBe(true);
      const p = pw.get(cab.id);
      maxGap = Math.max(maxGap, Math.abs(p.y + PLATFORM_THICK - sim.y));
    }
    expect(maxGap).toBeLessThan(1e-9);
    expect(pw.get(cab.id).y + PLATFORM_THICK).toBe(el.stops[2].y);
    expect(pw.removeDynamic(cab.id)).toBe(true);
    expect(colliders.size).toBe(0);
  });
});
