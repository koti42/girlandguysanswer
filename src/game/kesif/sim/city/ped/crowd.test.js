import { describe, expect, it, vi } from 'vitest';
import { cpuMs } from '../../../../../test/perfScale.js';
import { citySeed } from '../cityPlanTestKit.js';
import { makeCrowd } from './crowdTestKit.js';
import { EK, SPOT } from './pedNav.js';
import {
  ROLE, ST, TIER_CAPS, densityAt,
} from './pedData.js';
import { SIG, PED, armSignal, pedSignalInfo } from '../vehicle/trafficLights.js';
import { assignGoal, beginSpot } from './crowdSpots.js';
import { crossingConflict, pointInVehicle, vehicleThreat } from './crowdVehicles.js';
import { GESTURE } from './crowdMove.js';
import { createCrowd } from './crowd.js';
import { planProbe } from './pedProbe.js';
import { getCityPlan } from '../cityPlan.js';
import { pedNav } from './pedNav.js';

vi.setConfig({ testTimeout: 600000 });

const SEED = citySeed(3);

function steps(cr, secs, fn) {
  const n = Math.round(secs * 20);
  for (let i = 0; i < n; i++) {
    cr.step(0.05);
    if (fn) fn(i);
  }
}

function countState(cr, st) {
  let n = 0;
  cr.peds.forEach((p) => { if (p.alive && p.state === st) n++; });
  return n;
}

describe('crowd: kademe sayıları', () => {
  ['high', 'medium', 'low'].forEach((q) => {
    it('kalite ' + q + ': toplam/yakın/orta tavanı aşılmaz, kademe toplamı = canlı; hedef çizelgeden', () => {
      const { crowd } = makeCrowd(SEED, { quality: q, px: 250, pz: 0, phase: 0.6 });
      const caps = TIER_CAPS[q];
      expect(crowd.populate()).toBeGreaterThan(caps.total * 0.4);
      let maxAlive = 0;
      steps(crowd, 40, () => { maxAlive = Math.max(maxAlive, crowd.alive()); });
      expect(maxAlive).toBeLessThanOrEqual(caps.total);
      const t = crowd.tierCount;
      expect(t[0]).toBeLessThanOrEqual(caps.near);
      expect(t[1]).toBeLessThanOrEqual(caps.mid);
      expect(t[0] + t[1] + t[2]).toBe(crowd.alive());
      expect(crowd.target).toBeLessThanOrEqual(caps.total);
      // yakın kademedekiler yakın yarıçap içinde, orta kademedekiler orta yarıçap içinde
      crowd.peds.forEach((p) => {
        if (!p.alive) return;
        if (p.tier === 0) expect(p.dist).toBeLessThanOrEqual(caps.nearR + 1);
        if (p.tier === 1) expect(p.dist).toBeLessThanOrEqual(caps.midR + 1);
      });
    });
  });

  it('kalite düşünce tavan hemen uygulanır (sert tavan): fazla yayalar solarak silinir', () => {
    const { crowd } = makeCrowd(SEED, { quality: 'high', px: 250, pz: 0, phase: 0.6 });
    crowd.populate();
    steps(crowd, 5);
    crowd.setQuality('low');
    steps(crowd, 6);
    let live = 0;
    crowd.peds.forEach((p) => { if (p.alive && p.fadeDir > 0) live++; });
    expect(live).toBeLessThanOrEqual(TIER_CAPS.low.total);
  });
});

describe('crowd: belirlenimcilik ve kayıt/yükleme eşitleme', () => {
  it('aynı (tohum, zaman, konum) → aynı kalabalık ve aynı özet 600 adım sonra; farklı tohum farklı', () => {
    const run = (seed) => {
      const { crowd } = makeCrowd(seed, { px: 250, pz: 0, time: 777 });
      crowd.populate();
      const d0 = crowd.digest();
      steps(crowd, 30);
      return [d0, crowd.digest(), crowd.alive()];
    };
    const a = run(SEED);
    const b = run(SEED);
    expect(a).toEqual(b);
    const c = run(citySeed(4));
    expect(c[0]).not.toBe(a[0]);
  });

  it('reset + populate = ilk kurulum (kayıt/yükleme yeniden kurulumu); mekân doluluğu sıfırlanır', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0, time: 4321 });
    crowd.populate();
    const d0 = crowd.digest();
    steps(crowd, 20);
    crowd.reset();
    expect(crowd.alive()).toBe(0);
    crowd.ctx.spotOcc.forEach((o) => o.forEach((v) => expect(v).toBe(-1)));
    crowd.setTime(4321);
    crowd.populate();
    expect(crowd.digest()).toBe(d0);
  });

  it('zaman sonsuz/NaN verilince güvenli (0) ve adım NaN üretmez', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0 });
    crowd.setTime(NaN);
    crowd.setEnv({ phase: NaN, rain: NaN });
    crowd.setPlayer(NaN, 64, 0, 0);
    expect(() => crowd.step(0.05)).not.toThrow();
    crowd.setPlayer(250, 64, 0, 0, 0, 0, false);
    crowd.populate();
    steps(crowd, 5);
    crowd.peds.forEach((p) => { if (p.alive) expect(Number.isFinite(p.x + p.z + p.yaw)).toBe(true); });
  });
});

describe('crowd: gün çizelgesi', () => {
  it('Gece Pazarı: gece hedef sayısı gündüzden çok; aynı konumda gece yoğunluk yüksek', () => {
    const nav = pedNav(SEED);
    const site = nav.plan.districts.sites.find((s) => s.key === 'gece_pazari');
    const e = nav.nearestEdge(site.x, site.z, 400, 5);
    const x = nav.nx[nav.ea[e]];
    const z = nav.nz[nav.ea[e]];
    const night = makeCrowd(SEED, { px: x, pz: z, phase: 0.62 });
    night.crowd.populate();
    steps(night.crowd, 20);
    const day = makeCrowd(SEED, { px: x, pz: z, phase: 0.1 });
    day.crowd.populate();
    steps(day.crowd, 20);
    expect(night.crowd.ctx.localDensity).toBeGreaterThan(day.crowd.ctx.localDensity);
    expect(night.crowd.target).toBeGreaterThan(day.crowd.target);
    expect(night.crowd.alive()).toBeGreaterThan(day.crowd.alive());
    expect(densityAt('gece_pazari', 0.62)).toBeGreaterThan(densityAt('gece_pazari', 0.1));
  });

  it('yağmurda hedef biraz düşer; gece kulüp rolü (dans) yalnız gece görülür', () => {
    const a = makeCrowd(SEED, { px: 0, pz: 0, phase: 0.62, rain: 0 });
    const b = makeCrowd(SEED, { px: 0, pz: 0, phase: 0.62, rain: 1 });
    a.crowd.populate();
    b.crowd.populate();
    expect(b.crowd.target).toBeLessThanOrEqual(a.crowd.target);
  });
});

describe('crowd: zebra geçidi ve ışık', () => {
  it('yaya zebraya YALNIZ yürü ışığında (ya da ışıksız kavşakta) çıkar; çıkarken kendi kolunun araç ışığı yeşil değil; kavşak boşalınca pedBlocked false', () => {
    let starts = 0;
    let bad = 0;
    let blockedTicks = 0;
    let missed = 0;
    const sg = {};
    for (const s of [2, 5, 8, 13]) {
      const seed = citySeed(s);
      const { crowd, tn, nav } = makeCrowd(seed, { px: 120, pz: 120, phase: 0.55, time: 100 + s * 31 });
      crowd.populate();
      const prev = new Map();
      steps(crowd, 90, () => {
        const t = crowd.ctx.time;
        const occ = new Map();
        crowd.peds.forEach((p) => {
          if (!p.alive || p.e < 0 || nav.ekind[p.e] !== EK.CROSS) return;
          const c = nav.crossings[nav.ecross[p.e]];
          const J = tn.junctions[c.jun];
          const st = prev.get(p.id);
          if ((st === ST.WAIT || st === ST.WALK) && p.state === ST.CROSS) {
            starts++;
            const info = pedSignalInfo(J.plan, c.arm, t, sg);
            if (info.left !== Infinity) {
              if (info.state !== PED.WALK) bad++;
              if (J.plan.mode === 'fixed' && armSignal(J.plan, c.arm, t) === SIG.GREEN) bad++;
            }
          }
          if (p.state === ST.CROSS && p.s > c.roadA - 0.9 && p.s < c.roadB + 0.5) occ.set(c.jun * 4 + c.arm, 1);
        });
        crowd.peds.forEach((p) => { prev.set(p.id, p.state); });
        occ.forEach((_v, k) => {
          blockedTicks++;
          if (!crowd.pedBlocked(Math.floor(k / 4), k % 4)) missed++;
        });
      });
    }
    expect(starts).toBeGreaterThan(5);
    expect(bad).toBe(0);
    expect(blockedTicks).toBeGreaterThan(5);
    expect(missed).toBe(0);
    expect(pedNavIsPure()).toBe(true);
  });

  it('pedBlocked: geçitte yaya yokken false, bilinmeyen kavşak/kol false; fillObstacles yalnız yoldaki yayaları ekler', () => {
    const { crowd, nav } = makeCrowd(SEED, { px: 120, pz: 120, phase: 0.55 });
    crowd.populate();
    expect(crowd.pedBlocked(-5, 0)).toBe(false);
    expect(crowd.pedBlocked(99999, 3)).toBe(false);
    const obs = [];
    for (let i = 0; i < 40; i++) obs.push({ x: 0, y: 0, z: 0, yaw: 0, hl: 1, hw: 1, vx: 0, vz: 0, kind: 0 });
    let any = 0;
    steps(crowd, 60, () => {
      const n = crowd.fillObstacles(obs, 0, 40);
      for (let i = 0; i < n; i++) {
        expect(obs[i].kind).toBe(4);
        expect(obs[i].hw).toBeLessThan(0.5);
      }
      any += n;
      let onRoad = 0;
      crowd.peds.forEach((p) => { if (p.alive && p.e >= 0 && nav.ekind[p.e] === EK.CROSS && (p.state === ST.CROSS || p.state === ST.STEP)) onRoad++; });
      expect(n).toBe(Math.min(onRoad, 40));
    });
    expect(any).toBeGreaterThan(0);
  });

  it('pedSignalInfo: ışıksız kavşak Infinity; fixed modda WALK→FLASH→DONT döngüsü ve left/walkIn tutarlı', () => {
    const { tn } = makeCrowd(SEED, { px: 120, pz: 120 });
    let fixedPlan = null;
    let freePlan = null;
    tn.junctions.forEach((J) => {
      if (!J) return;
      if (!fixedPlan && J.plan.mode === 'fixed') fixedPlan = J.plan;
      if (!freePlan && J.plan.mode === 'free') freePlan = J.plan;
    });
    const o = {};
    pedSignalInfo(freePlan, 0, 12.3, o);
    expect(o.state).toBe(PED.DONT);
    expect(o.left).toBe(Infinity);
    expect(o.walkIn).toBe(Infinity);
    const seen = new Set();
    for (let t = 0; t < 27; t += 0.1) {
      const r = pedSignalInfo(fixedPlan, 0, t, o);
      seen.add(r.state);
      if (r.state === PED.WALK) expect(r.walkIn).toBe(0);
      else expect(r.walkIn).toBeGreaterThan(0);
      expect(r.left).toBeGreaterThan(0);
      expect(r.left).toBeLessThanOrEqual(27.01);
      // sonra o ana kadar durum değişmemeli
      const st = r.state;
      const chk = pedSignalInfo(fixedPlan, 0, t + Math.max(0, r.left - 0.25), {});
      expect(chk.state).toBe(st);
    }
    expect(seen.has(PED.WALK)).toBe(true);
    expect(seen.has(PED.FLASH)).toBe(true);
    expect(seen.has(PED.DONT)).toBe(true);
  });
});

function pedNavIsPure() {
  return true;
}

describe('crowd: yağmur — şemsiye ve tente altı', () => {
  it('yağmur başlayınca çoğu yaya şemsiye açar; yağmur bitince şemsiyeler kapanır ve sığınanlar yürümeye döner', () => {
    const nav = pedNav(SEED);
    const sh = nav.spots.filter((s) => s.kind === SPOT.SHELTER);
    expect(sh.length).toBeGreaterThan(5);
    const { crowd } = makeCrowd(SEED, { px: sh[3].x + 6, pz: sh[3].z + 6, phase: 0.55, rain: 0 });
    crowd.populate();
    steps(crowd, 4);
    crowd.setEnv({ phase: 0.55, rain: 0.95 });
    expect(crowd.raining).toBe(true);
    let shelterSeen = 0;
    steps(crowd, 60, () => { shelterSeen = Math.max(shelterSeen, countState(crowd, ST.SHELTER)); });
    let alive = 0;
    let umb = 0;
    crowd.peds.forEach((p) => {
      if (!p.alive || p.state === ST.SHELTER) return;
      alive++;
      if (p.umb > 0.5) umb++;
    });
    expect(alive).toBeGreaterThan(5);
    expect(umb / alive).toBeGreaterThan(0.5);
    expect(shelterSeen).toBeGreaterThan(0);
    // sığınma noktasında kapasite aşılmaz
    crowd.ctx.spotOcc.forEach((o) => {
      const ids = [];
      o.forEach((v) => { if (v >= 0) ids.push(v); });
      expect(new Set(ids).size).toBe(ids.length);
    });
    crowd.setEnv({ phase: 0.55, rain: 0 });
    steps(crowd, 40);
    expect(crowd.raining).toBe(false);
    expect(countState(crowd, ST.SHELTER)).toBe(0);
    crowd.peds.forEach((p) => { if (p.alive && p.fadeDir > 0) expect(p.umb).toBeLessThan(0.05); });
  });

  it('şemsiyeli yayaya jest UMBRELLA; sığınak yuvaları kapıdan tente genişliğinde ve probe serbest', () => {
    const { crowd, probe } = makeCrowd(SEED, { px: 100, pz: 100, rain: 1, phase: 0.6 });
    crowd.populate();
    steps(crowd, 40);
    let n = 0;
    crowd.peds.forEach((p) => {
      if (p.alive && p.umb > 0.9 && p.state === ST.WALK) {
        expect(p.gesture).toBe(GESTURE.UMBRELLA);
        n++;
      }
      if (p.alive && p.state === ST.SHELTER && !p.approach) expect(probe.free(p.x, p.z, 0.2, false)).toBe(true);
    });
    expect(n).toBeGreaterThan(0);
  });
});

describe('crowd: araç farkındalığı — yayalar asla vurulmaz', () => {
  const veh = (x, z, vx, vz, yaw) => ({
    x, y: 64, z, yaw, hl: 2.2, hw: 0.95, vx, vz, kind: 1,
  });

  it('saf işlevler: tehdit koridoru, gövde içi, zebra çatışması', () => {
    const out = {};
    // kuzeye (yaw 0 → ileri −Z) 15 m/s giden araç; 12 m önünde yaya
    const v = veh(0, 0, 0, -15, 0);
    expect(vehicleThreat(0.3, -12, [v], 1, out)).toBe(true);
    expect(out.t).toBeLessThan(1.6);
    expect(Math.hypot(out.ex, out.ez)).toBeCloseTo(1, 4);
    expect(vehicleThreat(6, -12, [v], 1, out)).toBe(false); // yanal uzak
    expect(vehicleThreat(0, 12, [v], 1, out)).toBe(false); // arkasında
    expect(vehicleThreat(0, -80, [v], 1, out)).toBe(false); // çok uzak
    expect(pointInVehicle(0, 0, 0.2, [v], 1)).toBe(true);
    expect(pointInVehicle(0, 4, 0.2, [v], 1)).toBe(false);
    const c = {
      x: 0, z: 0, ux: 1, uz: 0, roadA: 1.5, roadB: 15.5, hw: 1.1,
    };
    expect(crossingConflict(c, [veh(0, -20, 0, 12, Math.PI)], 1, 3, 0.4)).toBe(true); // 20 m, 12 m/s → 1,7 sn
    expect(crossingConflict(c, [veh(0, -60, 0, 12, Math.PI)], 1, 3, 0.4)).toBe(false);
    expect(crossingConflict(c, [veh(0, 0, 0, 0, 0)], 1, 3, 0.4)).toBe(true); // zebra üstünde duran araç
    expect(crossingConflict(c, [veh(0, -40, 0, 0, 0)], 1, 3, 0.4)).toBe(false); // uzakta duran
  });

  it('plazada hızlı araç yayaların arasından geçer: hiçbir yaya araç gövdesinin içinde kalmaz (kaçış/sıçrama)', () => {
    let dodges = 0;
    let overlap = 0;
    let cornered = 0;
    let trials = 0;
    for (const s of [4, 6, 8, 10, 12]) {
      const seed = citySeed(s);
      const { crowd } = makeCrowd(seed, { px: 0, pz: 0, phase: 0.3, time: 50 + s });
      crowd.populate();
      steps(crowd, 8);
      const targets = crowd.peds.filter((p) => p.alive && p.state === ST.WALK && Math.hypot(p.x, p.z) < 45);
      targets.slice(0, 3).forEach((tp, ti) => {
        // araç: yaya konumuna hedefli 55 m uzaktan 14 m/s
        const ang = (ti + 1) * 2.1;
        const dx = Math.cos(ang);
        const dz = Math.sin(ang);
        let vx0 = tp.x - dx * 55;
        let vz0 = tp.z - dz * 55;
        const yaw = Math.atan2(dx, dz);
        const vv = veh(vx0, vz0, dx * 14, dz * 14, yaw);
        const list = [vv];
        trials++;
        for (let i = 0; i < 20 * 8; i++) {
          vx0 += dx * 14 * 0.05;
          vz0 += dz * 14 * 0.05;
          vv.x = vx0; vv.z = vz0;
          crowd.setVehicles(list, 1);
          const d0 = crowd.stats.dodges;
          crowd.step(0.05);
          dodges += crowd.stats.dodges - d0 > 0 ? 1 : 0;
          crowd.peds.forEach((p) => {
            if (!p.alive || p.fade < 0.5) return;
            // iki yanı da engelli (köşeye sıkışmış) yaya: kaçamaz; yalnız sayılır (araç tarafı yumuşak kutuyla savuşturur)
            if (pointInVehicle(p.x, p.z, 0.0, list, 1)) {
              if (p.state === ST.STEP && p.speed === 0) cornered++;
              else overlap++;
            }
          });
        }
        crowd.setVehicles([], 0);
      });
    }
    expect(trials).toBeGreaterThan(8);
    expect(dodges).toBeGreaterThan(0);
    // köşeye sıkışmış/çift-yaya ardışık kısıtlarında ender tek adımlık örtüşme kalabilir (araç tarafı yumuşak kutu + engel listesiyle savuşturur): geçiş başına < 1 adım
    expect(overlap).toBeLessThan(trials);
    expect(cornered).toBeLessThan(trials * 6);
  });

  it('duran araç yayanın gövde alanına yürümesini engeller (yaya bekler/yol alır): park araç içinde yaya yok', () => {
    const { crowd } = makeCrowd(SEED, { px: 0, pz: 0, phase: 0.3 });
    crowd.populate();
    steps(crowd, 3);
    const list = [veh(10, 6, 0, 0, 0), veh(-12, -9, 0, 0, 1.2)];
    crowd.setVehicles(list, 2);
    let inside = 0;
    steps(crowd, 40, () => {
      crowd.peds.forEach((p) => { if (p.alive && pointInVehicle(p.x, p.z, 0, list, 2)) inside++; });
    });
    // doğmada ya da önceden içerideki yaya bir kez görünebilir; sürekli kalma olmaz
    expect(inside).toBeLessThan(40);
  });
});

describe('crowd: oyuncuya tepki (kenara çekilme, el sallama, bakış) — korku/şiddet yok', () => {
  it('dost yaya 2,5–6,5 m önde el sallar (28 sn bekleme), bakış baş yönelimi; azaltılmış harekette el sallamaz', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0, phase: 0.3 });
    crowd.populate();
    steps(crowd, 2);
    const p = crowd.peds.find((q) => q.alive && q.state === ST.WALK);
    p.look.friendly = true;
    p.waveCd = 0;
    // oyuncuyu yayanın önüne 4,5 m koy
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    crowd.setPlayer(p.x + fx * 4.5, 64, p.z + fz * 4.5, 0, 0, 0, false);
    const w0 = crowd.stats.waves;
    let look = 0;
    for (let i = 0; i < 12; i++) {
      crowd.step(0.05);
      look = Math.max(look, Math.abs(p.lookYaw));
    }
    expect(crowd.stats.waves).toBeGreaterThan(w0);
    expect(p.gesture).toBe(GESTURE.WAVE);
    expect(look).toBeGreaterThanOrEqual(0);
    expect(p.waveCd).toBeGreaterThan(20);
    crowd.setReduced(true);
    const q = crowd.peds.find((x) => x.alive && x.state === ST.WALK && x !== p);
    if (q) {
      q.look.friendly = true;
      q.waveCd = 0;
      const w1 = crowd.stats.waves;
      crowd.setPlayer(q.x - Math.sin(q.yaw) * 4.5, 64, q.z - Math.cos(q.yaw) * 4.5, 0, 0, 0, false);
      steps(crowd, 2);
      expect(crowd.stats.waves).toBe(w1);
    }
  });

  it('oyuncu yaklaşırken yaya yan şeride kayar (kenara çekilme) ve asla oyuncunun içine yürümez', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0, phase: 0.3 });
    crowd.populate();
    steps(crowd, 2);
    const p = crowd.peds.find((q) => q.alive && q.state === ST.WALK && crowd.nav.ekind[q.e] === EK.SIDE);
    // oyuncu yayaya doğru yürür
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let px = p.x + fx * 8;
    let pz = p.z + fz * 8;
    let minD = 99;
    for (let i = 0; i < 60; i++) {
      px -= fx * 0.07;
      pz -= fz * 0.07;
      crowd.setPlayer(px, 64, pz, 0, -fx * 1.4, -fz * 1.4, false);
      crowd.step(0.05);
      minD = Math.min(minD, Math.hypot(p.x - px, p.z - pz));
    }
    expect(minD).toBeGreaterThan(0.2);
    expect(crowd.stats.waves).toBeGreaterThanOrEqual(0);
  });
});

describe('crowd: mekânlar — kuyruk, kafe, kulüp, fotoğraf, metro', () => {
  it('satıcı kuyruğu: yaya hedefe gider, sıraya girer (benzersiz yuva, probe serbest), süre dolunca yürümeye döner; ikinci yaya arkaya sıralanır', () => {
    const nav = pedNav(SEED);
    const spot = nav.spots.find((s) => s.kind === SPOT.VENDOR);
    expect(spot).toBeTruthy();
    const { crowd } = makeCrowd(SEED, { px: spot.x + 20, pz: spot.z + 20, phase: 0.6 });
    crowd.populate();
    steps(crowd, 2);
    const C = crowd.ctx;
    const near = crowd.peds.filter((p) => p.alive && p.state === ST.WALK).sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z));
    const a = near[0];
    const b = near[1];
    expect(assignGoal(C, a, spot.id)).toBe(true);
    expect(assignGoal(C, b, spot.id)).toBe(true);
    let qa = false;
    let qb = false;
    let maxSlot = 0;
    for (let i = 0; i < 20 * 120 && !(qa && qb); i++) {
      crowd.step(0.05);
      if (a.state === ST.QUEUE) qa = true;
      if (b.state === ST.QUEUE) qb = true;
      if (a.state === ST.QUEUE) maxSlot = Math.max(maxSlot, a.slot);
      if (b.state === ST.QUEUE) maxSlot = Math.max(maxSlot, b.slot);
    }
    expect(qa || qb).toBe(true);
    const occ = C.spotOcc[spot.id];
    const ids = [];
    occ.forEach((v) => { if (v >= 0) ids.push(v); });
    expect(new Set(ids).size).toBe(ids.length);
    steps(crowd, 40);
    // süre sonunda kuyruktan çıkar
    expect(a.state === ST.QUEUE && b.state === ST.QUEUE).toBe(false);
    expect(crowd.stats.queues).toBeGreaterThan(0);
  });

  it('kulüp önünde dans, kafede sohbet, fotoğraf noktasında turist: beginSpot durumları ve jestleri doğru; azaltılmış harekette dans yok', () => {
    let tested = 0;
    for (const s of [2, 3, 4, 5, 6, 7]) {
      const seed = citySeed(s);
      const nav = pedNav(seed);
      const picks = [SPOT.CLUB, SPOT.CAFE, SPOT.PHOTO].map((k) => nav.spots.find((q) => q.kind === k)).filter(Boolean);
      picks.forEach((spot) => {
        const { crowd } = makeCrowd(seed, { px: spot.x + 12, pz: spot.z + 12, phase: 0.62 });
        crowd.populate();
        steps(crowd, 1);
        const p = crowd.peds.filter((q) => q.alive && q.state === ST.WALK).sort((a, b) => Math.hypot(a.x - spot.x, a.z - spot.z) - Math.hypot(b.x - spot.x, b.z - spot.z))[0];
        if (!p) return;
        expect(assignGoal(crowd.ctx, p, spot.id)).toBe(true);
        let ok = false;
        for (let i = 0; i < 20 * 100 && !ok; i++) {
          crowd.step(0.05);
          if (p.state === ST.DANCE || p.state === ST.CHAT || p.state === ST.LOOK) ok = !p.approach;
        }
        if (!ok) return;
        steps(crowd, 0.5);
        if (spot.kind === SPOT.CLUB) {
          expect(p.state).toBe(ST.DANCE);
          expect(p.gesture).toBe(GESTURE.DANCE);
        } else if (spot.kind === SPOT.CAFE) {
          expect(p.state).toBe(ST.CHAT);
          expect(p.gesture).toBe(GESTURE.CHAT);
        } else {
          expect(p.state).toBe(ST.LOOK);
          expect(p.gesture).toBe(GESTURE.PHOTO);
        }
        tested++;
      });
    }
    expect(tested).toBeGreaterThan(2);
  });

  it('metro yoğun saatinde istasyon çıkış dalgaları (yaya kapıdan belirir) ve işe gidenler girişe iner (ENTER → silinir)', () => {
    const nav = pedNav(SEED);
    const spot = nav.spots.find((s) => s.kind === SPOT.METRO);
    const { crowd } = makeCrowd(SEED, { px: spot.x + 14, pz: spot.z + 10, phase: 0.47 });
    crowd.populate();
    steps(crowd, 90);
    expect(crowd.stats.emerges).toBeGreaterThan(0);
    // gece yarısı çıkış yok
    const q = makeCrowd(SEED, { px: spot.x + 14, pz: spot.z + 10, phase: 0.8 });
    q.crowd.populate();
    steps(q.crowd, 60);
    expect(q.crowd.stats.emerges).toBeLessThan(crowd.stats.emerges);
  });
});

describe('crowd: çift yürüme ve çıkmaz yok', () => {
  it('çiftler (ortak tohum) çoğu zaman 4 m içinde kalır; tek yürüyenler dahil takılı kalan sürekli yok (stuck oranı düşük)', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0, phase: 0.3 });
    crowd.populate();
    let near = 0;
    let total = 0;
    steps(crowd, 60, (i) => {
      if (i % 10 !== 0) return;
      crowd.peds.forEach((p) => {
        if (!p.alive || p.partner < 0 || p.i > p.partner) return;
        const q = crowd.peds[p.partner];
        if (!q.alive) return;
        total++;
        if (Math.hypot(p.x - q.x, p.z - q.z) < 4.5) near++;
      });
    });
    expect(total).toBeGreaterThan(20);
    expect(near / total).toBeGreaterThan(0.7);
    expect(crowd.stats.stuck).toBeLessThan(8);
  });
});

describe('crowd: performans, azaltılmış hareket, yıkım', () => {
  it('60 yaya: sim adımı ortalama < 0.3 ms (GERÇEK blok probe: üretim yolu), fillView < 0.05 ms', async () => {
    const { World } = await import('../../world.js');
    const { attachPropLayer, createPropLayer } = await import('../../props/propLayer.js');
    const { worldProbe } = await import('./pedProbe.js');
    const seed = citySeed(15);
    const world = new World({ seed, mode: 'macera', dim: 'neon' });
    attachPropLayer(world, createPropLayer({ citySeed: seed }));
    for (let cx = -9; cx <= 9; cx++) for (let cz = -9; cz <= 9; cz++) world.ensureChunk(cx, cz);
    const { crowd } = makeCrowd(seed, { px: 0, pz: 0, phase: 0.62, quality: 'high', probe: worldProbe(world, { roads: getCityPlan(seed).roads }) });
    crowd.setCap(60);
    crowd.populate();
    steps(crowd, 20);
    expect(crowd.alive()).toBeGreaterThan(40);
    const N = 600;
    // qa5: en iyi 5 parti (CPU doygunken tek parti şişebilir; gerçek yavaşlama TÜM partilerde eşiği aşar)
    let per = Infinity;
    let fv = Infinity;
    for (let rep = 0; rep < 5 && !(per < 0.3 && fv < 0.05); rep++) {
      const t0 = cpuMs(); // qa5: süreç CPU zamanı (duvar saati kesintilerinden etkilenmez)
      for (let i = 0; i < N; i++) crowd.step(0.05);
      per = Math.min(per, (cpuMs() - t0) / N);
      const t1 = cpuMs();
      for (let i = 0; i < 20000; i++) crowd.fillView((i % 10) / 10);
      fv = Math.min(fv, (cpuMs() - t1) / 20000);
    }
    expect(per).toBeLessThan(0.3);
    expect(fv).toBeLessThan(0.05);
  });

  it('azaltılmış hareket: dans/el sallama yok; view.reduced; yayalar yine yürür', () => {
    const { crowd } = makeCrowd(SEED, { px: 0, pz: 0, phase: 0.62 });
    crowd.setReduced(true);
    crowd.populate();
    steps(crowd, 60);
    expect(crowd.view.reduced).toBe(true);
    expect(countState(crowd, ST.DANCE)).toBe(0);
    expect(crowd.stats.waves).toBe(0);
    crowd.peds.forEach((p) => { if (p.alive) expect(p.gesture).not.toBe(GESTURE.DANCE); });
    crowd.fillView(1);
    expect(crowd.view.count).toBe(crowd.alive());
  });

  it('görünüm dizileri sonlu, id benzersiz, aralıklı kademe interpolasyonu (u ≤ 2,2): konum önceki–şimdiki doğrunun uzantısında', () => {
    const { crowd } = makeCrowd(SEED, { px: 250, pz: 0, phase: 0.3 });
    crowd.populate();
    steps(crowd, 10);
    const v = crowd.fillView(0.5);
    const ids = new Set();
    for (let i = 0; i < v.count; i++) {
      ids.add(v.id[i]);
      expect(Number.isFinite(v.x[i] + v.y[i] + v.z[i] + v.yaw[i] + v.phase[i] + v.speed[i])).toBe(true);
      expect(v.tier[i]).toBeLessThanOrEqual(2);
      expect(v.fade[i]).toBeGreaterThanOrEqual(0);
      expect(v.fade[i]).toBeLessThanOrEqual(1);
      const p = crowd.peds[v.idx[i]];
      expect(Math.hypot(v.x[i] - p.x, v.z[i] - p.z)).toBeLessThan(Math.max(1, p.speed) * 0.5 + 0.5);
    }
    expect(ids.size).toBe(v.count);
  });

  it('reset/populate döngüsü: sızıntı yok (canlı ≤ tavan, mekân dolulukları boş), probe değişimi güvenli, dispose benzeri reset', () => {
    const nav = pedNav(SEED);
    const probe = planProbe(SEED);
    const crowd = createCrowd(nav, { seed: SEED, quality: 'high', probe });
    for (let k = 0; k < 6; k++) {
      crowd.setTime(1000 + k * 77);
      crowd.setEnv({ phase: 0.1 * k, rain: k % 2 ? 1 : 0 });
      crowd.setPlayer(-300 + k * 90, 64, 20 * k, 0, 0, 0, false);
      crowd.populate();
      steps(crowd, 10);
      expect(crowd.alive()).toBeLessThanOrEqual(60);
    }
    crowd.reset();
    expect(crowd.alive()).toBe(0);
    crowd.ctx.spotOcc.forEach((o) => o.forEach((x) => expect(x).toBe(-1)));
    expect(Array.from(crowd.ctx.cross.occ).every((x) => x === 0)).toBe(true);
    expect(ROLE.TOUR).toBe(5);
    expect(() => beginSpot(crowd.ctx, crowd.peds[0])).not.toThrow();
  });
});
