import { describe, expect, it, vi } from 'vitest';
import { createTraffic, TICK } from './trafficAI.js';
import { lanePose, routeDedges, trafficNet } from './junctions.js';
import { createMonitor } from './trafficTestKit.js';
import { mulberry32 } from '../../rng.js';

vi.setConfig({ testTimeout: 300000 });

/*
 * Gerçek şehir ağı üstünde (açık sistem: doğma halkası, silme, oyuncu hareketi) bağımsız denetimli değişmez testleri.
 */

function mk(seed, px, pz, cap) {
  const tn = trafficNet(seed);
  const tr = createTraffic(tn, { seed, cap: cap || 30 });
  tr.setTime(500 + (seed % 97));
  tr.setPlayer(px, 64, pz, 0.7);
  tr.setEnv({ phase: 0.5 });
  tr.populate();
  return { tn, tr };
}

describe('trafficCity: gerçek şehir — 20 tohum × 240 sn (oyuncu duruyor)', () => {
  it.each(Array.from({ length: 20 }, (_, k) => k))('tohum %i', (k) => {
    const seed = 9000 + k * 131;
    const rng = mulberry32(seed);
    const { tn, tr } = mk(seed, Math.round((rng() - 0.5) * 900), Math.round((rng() - 0.5) * 900), 30);
    const mon = createMonitor(tn);
    let maxAlive = 0;
    for (let i = 0; i < 4800; i++) {
      tr.step(TICK);
      mon.step(tr, TICK, 2);
      if (tr.alive() > maxAlive) maxAlive = tr.alive();
    }
    const m = mon.result();
    expect(m.minGap, 'boşluk').toBeGreaterThan(0.5);
    expect(m.redViolations).toBe(0);
    expect(m.conflictViolations).toBe(0);
    expect(tr.stats.redRuns).toBe(0);
    expect(tr.stats.wallClamps).toBe(0);
    expect(tr.stats.gapClamps).toBe(0);
    expect(tr.stats.watchdog).toBe(0);
    expect(maxAlive).toBeLessThanOrEqual(30);
    expect(tr.stats.maxTicketAge).toBeLessThan(60);
    expect(m.maxStill).toBeLessThan(90);
  });
});

describe('trafficCity: regresyon tohumları (rastgele fırtınada bulunan hatalar; 15 dk)', () => {
  // 1377109: bilet kırmızıda silindiği için sol dönen yan şerit aracı 4 yeşil boyunca beklemişti (açlık) ·
  // 1678031: kavşaktan çıkmak üzere olan aracın çıkış noktasının önüne araç doğuyordu (boşluk ihlali) · 1749302: kutu tıkama (hareketli öncü payı)
  // 1305838: aynı koldan yan yana şeritler (paralel başlayan sol/düz) yanlışlıkla çatışıyordu
  it.each([1377109, 1678031, 1749302, 1305838])('tohum %i', (seed) => {
    const rng = mulberry32(seed);
    const px = Math.round((rng() - 0.5) * 1000);
    const pz = Math.round((rng() - 0.5) * 1000);
    const tn = trafficNet(seed);
    const tr = createTraffic(tn, { seed, cap: 30 });
    tr.setTime(rng() * 1e5);
    tr.setPlayer(px, 64, pz, rng() * 6);
    tr.setEnv({ phase: rng(), rain: rng() < 0.3 });
    tr.populate();
    const mon = createMonitor(tn);
    for (let i = 0; i < 18000; i++) {
      tr.step(TICK);
      mon.step(tr, TICK, 2);
    }
    const m = mon.result();
    expect(m.minGap).toBeGreaterThan(0.5);
    expect(m.redViolations).toBe(0);
    expect(m.conflictViolations).toBe(0);
    expect(tr.stats.gapClamps).toBe(0);
    expect(tr.stats.wallClamps).toBe(0);
    expect(tr.stats.watchdog).toBe(0);
    expect(m.maxStill).toBeLessThan(60);
  });
});

describe('trafficCity: hareketli oyuncu (40 dk simüle, 25 m/s gezinti): halka doldurma/silme, değişmezler', () => {
  it('tohum A: rotalar boyunca sürüş', () => {
    const seed = 4711;
    const { tn, tr } = mk(seed, 0, 0, 30);
    const mon = createMonitor(tn);
    const rng = mulberry32(5);
    const out = { x: 0, y: 0, z: 0, yaw: 0 };
    let t = 0;
    let maxAlive = 0;
    let spawnedAtStart = tr.stats.spawned;
    let legs = 0;
    const start = tn.dedges.filter((d) => d.lanes === 2);
    let cur = start[Math.floor(rng() * start.length)].id;
    while (t < 2400) {
      const goal = tn.dedges[Math.floor(rng() * tn.dedges.length)].id;
      const route = routeDedges(tn, cur, goal);
      if (!route) continue;
      legs++;
      for (let r = 0; r < route.length && t < 2400; r++) {
        const de = tn.dedges[route[r]];
        for (let s = de.s0; s < de.s1 && t < 2400; s += 25 * TICK) {
          lanePose(de, 0, s, out);
          tr.setPlayer(out.x, out.y, out.z, out.yaw);
          tr.step(TICK);
          mon.step(tr, TICK, 3);
          t += TICK;
          if (tr.alive() > maxAlive) maxAlive = tr.alive();
        }
        cur = de.id;
      }
    }
    const m = mon.result();
    expect(legs).toBeGreaterThan(3);
    expect(m.minGap).toBeGreaterThan(0.5);
    expect(m.redViolations).toBe(0);
    expect(m.conflictViolations).toBe(0);
    expect(tr.stats.wallClamps).toBe(0);
    expect(tr.stats.gapClamps).toBe(0);
    expect(tr.stats.watchdog).toBe(0);
    expect(maxAlive).toBeLessThanOrEqual(30);
    expect(tr.stats.spawned - spawnedAtStart).toBeGreaterThan(300);
    expect(tr.stats.despawned).toBeGreaterThan(250);
    spawnedAtStart = 0;
  });

  it('oyuncu ışınlanırsa (büyük sıçrama) eski halkadaki araçlar silinir, yenisi dolar; sayı tavanı aşmaz', () => {
    const seed = 321;
    const { tn, tr } = mk(seed, -300, -300, 30);
    for (let i = 0; i < 200; i++) tr.step(TICK);
    tr.setPlayer(500, 64, 500, 0);
    let seenFar = 0;
    for (let i = 0; i < 600; i++) {
      tr.step(TICK);
      expect(tr.alive()).toBeLessThanOrEqual(30);
    }
    tr.cars.forEach((c) => {
      if (c.alive && c.state === 1 && Math.hypot(c.x - 500, c.z - 500) > 155) seenFar++;
    });
    expect(seenFar).toBe(0);
    expect(tr.alive()).toBeGreaterThan(15);
    expect(tn).toBeTruthy();
  });
});

describe('trafficCity: rastgele işlem fırtınası (cap/yağmur/gece/populate/engel/çarpma/oyuncu)', () => {
  it('3000 rastgele işlem: istisna yok, sonlu durum, değişmezler (bump tutma hariç)', () => {
    const seed = 777;
    const { tn, tr } = mk(seed, -240, -120, 30);
    const rng = mulberry32(99);
    const mon = createMonitor(tn);
    const obs = [];
    for (let i = 0; i < 6; i++) {
      obs.push({
        x: 0, y: 64, z: 0, yaw: 0, hl: 2.1, hw: 0.95, vx: 0, vz: 0, kind: 1 + (i % 3),
      });
    }
    let ops = 0;
    for (let step = 0; step < 36000; step++) {
      if (step % 12 === 0) {
        ops++;
        const r = rng();
        if (r < 0.1) tr.setCap(Math.floor(rng() * 31));
        else if (r < 0.18) tr.setEnv({ rain: rng() < 0.5, night: rng() < 0.5, phase: rng() });
        else if (r < 0.2) tr.populate();
        else if (r < 0.3) {
          const n = Math.floor(rng() * 4);
          for (let i = 0; i < n; i++) {
            const ob = obs[i];
            ob.x = -240 + (rng() - 0.5) * 220;
            ob.z = -120 + (rng() - 0.5) * 220;
            ob.yaw = Math.floor(rng() * 4) * Math.PI / 2;
            ob.vx = rng() < 0.5 ? 0 : (rng() - 0.5) * 20;
            ob.vz = rng() < 0.5 ? 0 : (rng() - 0.5) * 20;
          }
          tr.setObstacles(obs, n);
        } else if (r < 0.4) {
          const alive = tr.cars.filter((c) => c.alive);
          if (alive.length) tr.bump(alive[Math.floor(rng() * alive.length)].id, 0.5 + rng());
        } else if (r < 0.5) tr.setPlayer(-240 + (rng() - 0.5) * 300, 64, -120 + (rng() - 0.5) * 300, rng() * 6);
        else if (r < 0.55) tr.setHooks(rng() < 0.5 ? { pedBlocked: () => rng() < 0.3 } : null);
      }
      tr.step(TICK);
      mon.step(tr, TICK, 6);
    }
    expect(ops).toBeGreaterThan(2500);
    tr.cars.forEach((c) => {
      if (c.alive) expect(Number.isFinite(c.x + c.y + c.z + c.yaw + c.v + c.s + c.p + c.lat)).toBe(true);
    });
    const m = mon.result();
    expect(m.redViolations).toBe(0);
    expect(m.conflictViolations).toBe(0);
    expect(tr.stats.wallClamps).toBeLessThanOrEqual(2);
    expect(tr.stats.gapClamps).toBeLessThanOrEqual(2);
    expect(tr.stats.crossings).toBeGreaterThan(200);
  });
});
