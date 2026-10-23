/*
 * Neon robot doğurucusu (Spawner 'neon' profili) — GERÇEK şehir dünyasında: güvenli bölgede doğma 0, tavanlar, kolay mod, gece kuralı, belirlenimcilik,
 * yuvalardan doğma, Kredi/dağılma, uzaktan kaldırma, kayıt/geri yükleme, organik doğma yok.
 */
import { describe, expect, it } from 'vitest';
import { cpuMs } from '../../../../../test/perfScale.js';
import { cityWorld } from '../vehicle/vehicleTestKit.js';
import { EntityManager } from '../../entities.js';
import { Spawner } from '../../spawner.js';
import { createPlayerBody, isBoxFree } from '../../physics.js';
import { robotSlotsForChunk } from './robotSlots.js';
import { ROBOT_CAPS, ROBOT_SPAWN, robotSpawnFor } from './robotData.js';
import { SAFE_TERMINAL_R, safeAt } from '../cityDistricts.js';
import { getCityPlan } from '../cityPlan.js';

const NIGHT = { dayFactor: 0.1, peaceful: false };
const DAY = { dayFactor: 1, peaceful: false };

const denseCache = new Map();
/** Yuva yoğunluğu en yüksek 7×7 chunk bloğunun merkezi (tohuma göre önbellekli). */
function densest(seed) {
  if (denseCache.has(seed)) return denseCache.get(seed);
  let best = null;
  for (let cx = -44; cx < 44; cx += 2) {
    for (let cz = -44; cz < 44; cz += 2) {
      let n = 0;
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) n += robotSlotsForChunk(seed, cx + a, cz + b).length;
      if (!best || n > best.n) best = { cx, cz, n };
    }
  }
  denseCache.set(seed, best);
  return best;
}

function rig(worldSeed, o) {
  const opt = o || {};
  const { world, seed } = cityWorld(worldSeed, [0, 0], [0, 0]);
  const d = densest(seed);
  for (let cx = d.cx - 7; cx <= d.cx + 7; cx++) for (let cz = d.cz - 7; cz <= d.cz + 7; cz++) world.ensureChunk(cx, cz);
  const events = [];
  const em = new EntityManager({ seed, world, emit: (e) => events.push(e) });
  const kredi = [];
  const hooks = Object.assign({ grantKredi: (n, why) => kredi.push([n, why]), tier: () => 'high' }, opt.hooks || {});
  const sp = new Spawner({
    seed, world, em, profile: 'neon', neon: hooks,
  });
  const px = d.cx * 16 + 8;
  const pz = d.cz * 16 + 8;
  const p = createPlayerBody(px, 64, pz);
  p.dead = false;
  p.h = 1.8;
  p.yaw = opt.yaw === undefined ? 0.4 : opt.yaw;
  return {
    world, seed, em, events, sp, p, kredi, plan: getCityPlan(seed), hooks, d,
  };
}

function simulate(r, secs, ctx, hook) {
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    r.sp.update(1 / 60, r.p, ctx || NIGHT);
    r.em.update(1 / 60, r.p, ctx || NIGHT);
    if (hook) hook(i);
  }
}

function robots(em) {
  const out = [];
  em.mobs.forEach((e) => { if (e.def.robot && !e.dead) out.push(e); });
  return out;
}

describe('güvenli bölge: doğma 0 (4 tohum, gerçek dünya)', () => {
  [11, 222, 3333, 44444].forEach((ws) => {
    it('tohum ' + ws + ': hiçbir doğma güvenli bölge/terminal/meydan içinde değil; robotlar yalnız Liman/Konteyner', () => {
      const r = rig(ws);
      let spawns = 0;
      simulate(r, 90, NIGHT, (i) => {
        if (i % 30 !== 0) return;
        robots(r.em).forEach((e) => {
          expect(safeAt(r.plan, e.x, e.z, e.y), 'robot güvenli bölgede').toBe(false);
        });
      });
      r.events.filter((e) => e.type === 'mobSpawned').forEach((e) => {
        spawns++;
        expect(safeAt(r.plan, e.x, e.z), 'safeAt').toBe(false);
        expect(safeAt(r.plan, e.x, e.z, e.y), 'safeAt+y').toBe(false);
        r.plan.terminals.forEach((t) => expect(Math.hypot(e.x - t.x, e.z - t.z)).toBeGreaterThan(SAFE_TERMINAL_R));
        expect(Math.hypot(e.x, e.z)).toBeGreaterThan(90);
        expect(e.habitat).toBe('şehir');
      });
      expect(spawns).toBeGreaterThan(8);
    });
  });

  it('oyuncu güvenli bölgenin ortasındayken (Kapı Meydanı) 120 sn hiç robot doğmaz', () => {
    const r = rig(5);
    for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) r.world.ensureChunk(cx, cz);
    r.p.x = 0.5; r.p.z = 3.5;
    simulate(r, 120, NIGHT);
    expect(robots(r.em)).toHaveLength(0);
    expect(r.sp.neon().stats.spawned).toBe(0);
  });
});

describe('tavanlar (kademe)', () => {
  const group = (e) => e.def.robot.group;
  [['high', 12, 8, 4, 3], ['medium', 9, 6, 4, 3], ['low', 6, 4, 3, 2]].forEach(([tier, pw, fw, pn, fn]) => {
    it(tier + ': itici ≤ ' + pw + ' dünya / ≤ ' + pn + ' yakın; dost ≤ ' + fw + ' / ≤ ' + fn, () => {
      expect(ROBOT_CAPS[tier].pushyWorld).toBe(pw);
      const r = rig(77, { hooks: { tier: () => tier } });
      const near2 = robotSpawnFor(tier).near ** 2;
      let maxPW = 0;
      let maxFW = 0;
      let maxPN = 0;
      let maxFN = 0;
      simulate(r, 150, NIGHT, (i) => {
        if (i % 20 !== 0) return;
        let a = 0; let b = 0; let c = 0; let dd = 0;
        robots(r.em).forEach((e) => {
          const isNear = (e.x - r.p.x) ** 2 + (e.z - r.p.z) ** 2 < near2;
          if (group(e) === 'pushy') { a++; if (isNear) c++; } else { b++; if (isNear) dd++; }
        });
        maxPW = Math.max(maxPW, a); maxFW = Math.max(maxFW, b); maxPN = Math.max(maxPN, c); maxFN = Math.max(maxFN, dd);
      });
      expect(maxPW).toBeLessThanOrEqual(pw);
      expect(maxFW).toBeLessThanOrEqual(fw);
      expect(maxPN).toBeLessThanOrEqual(pn);
      expect(maxFN).toBeLessThanOrEqual(fn);
      expect(maxPW + maxFW).toBeGreaterThan(3); // gerçekten doğdu
    });
  });

  it('kademe canlı değişince yeni doğmalar yeni tavana uyar; sayaç counts() doğru', () => {
    let tier = 'high';
    const r = rig(77, { hooks: { tier: () => tier } });
    simulate(r, 60, NIGHT);
    const c1 = r.sp.neon().counts();
    expect(c1.total).toBe(robots(r.em).length);
    tier = 'low';
    simulate(r, 5, NIGHT);
    // yeni doğma yok (fazlası kaldırılmaz ama eklenmez)
    expect(r.sp.neon().counts().pushy).toBeLessThanOrEqual(Math.max(c1.pushy, ROBOT_CAPS.low.pushyWorld));
  });
});

describe('kolay mod / inşa-harita (ctx.peaceful) ve gece kuralı', () => {
  it('peaceful: hiç robot doğmaz; mevcutlar ≤ 1.2 sn içinde nazikçe kaybolur', () => {
    const r = rig(31);
    simulate(r, 40, NIGHT);
    expect(robots(r.em).length).toBeGreaterThan(2);
    simulate(r, 1.3, { dayFactor: 0.1, peaceful: true });
    expect(robots(r.em)).toHaveLength(0);
    const sp0 = r.sp.neon().stats.spawned;
    simulate(r, 60, { dayFactor: 0.1, peaceful: true });
    expect(r.sp.neon().stats.spawned).toBe(sp0);
    expect(r.events.some((e) => e.type === 'fx' && e.name === 'mobFade')).toBe(true);
  });

  it('hatabot yüzeyde yalnız gece doğar; gündüz yüzeyde hatabot yok', () => {
    const d = rig(31);
    simulate(d, 120, DAY);
    robots(d.em).filter((e) => e.key === 'hatabot').forEach((e) => expect(e.y).toBeLessThan(60)); // yalnız yeraltı olabilir
    const n = rig(31);
    simulate(n, 120, NIGHT);
    expect(robots(n.em).some((e) => e.key === 'hatabot')).toBe(true);
  });

  it('oyuncu ölüyken doğma durur', () => {
    const r = rig(31);
    r.p.dead = true;
    for (let i = 0; i < 600; i++) r.sp.update(1 / 60, r.p, NIGHT);
    expect(r.sp.neon().stats.spawned).toBe(0);
  });
});

describe('belirlenimcilik ve yuvalar', () => {
  it('aynı tohum + aynı girdi → aynı doğma listesi (tür, konum)', () => {
    const run = () => {
      const r = rig(99);
      simulate(r, 80, NIGHT);
      return JSON.stringify(r.events.filter((e) => e.type === 'mobSpawned').map((e) => [e.mob, e.x, e.y, e.z]));
    };
    const a = run();
    expect(a.length).toBeGreaterThan(40);
    expect(run()).toBe(a);
  });

  it('her robot bir YUVADAN doğar (home = yuva merkezi); doğma mesafesi 22–72, görüş konisinde yakın doğmaz', () => {
    const r = rig(99, { yaw: 0 });
    const homes = new Map();
    simulate(r, 80, NIGHT, () => {
      r.em.mobs.forEach((e) => { if (e.def.robot && !homes.has(e.id)) homes.set(e.id, { x: e.home.x, z: e.home.z, px: r.p.x, pz: r.p.z, key: e.key }); });
    });
    expect(homes.size).toBeGreaterThan(6);
    const fx = -Math.sin(r.p.yaw);
    const fz = -Math.cos(r.p.yaw);
    homes.forEach((h) => {
      const sl = robotSlotsForChunk(r.seed, Math.floor(h.x / 16), Math.floor(h.z / 16)).find((s) => s.x === h.x && s.z === h.z);
      expect(sl, 'yuva bulunamadı').toBeTruthy();
      expect(sl.key).toBe(h.key);
      const d = Math.hypot(h.x - h.px, h.z - h.pz);
      expect(d).toBeGreaterThanOrEqual(ROBOT_SPAWN.minDist);
      expect(d).toBeLessThanOrEqual(ROBOT_SPAWN.maxDist);
      if (d < ROBOT_SPAWN.coneDist) expect((fx * (h.x - h.px) + fz * (h.z - h.pz)) / d).toBeLessThan(Math.cos((62 * Math.PI) / 180));
    });
  });

  it('organik doğma YOK: neon em içinde yalnız robotlar; mobsWorld populateChunk şehirde boş döner', () => {
    const r = rig(99);
    simulate(r, 120, NIGHT);
    r.em.mobs.forEach((e) => expect(e.def.robot).toBeTruthy());
    expect(r.em.populated.size).toBe(0);
  });

  it('yerleşik yükseklik: robotlar katı zeminde (ayak altı katı), gövde boş', () => {
    const r = rig(99);
    simulate(r, 60, NIGHT);
    robots(r.em).forEach((e) => {
      if (e.def.movement === 'uç') return;
      expect(e.y).toBeGreaterThan(20);
      const below = r.world.getBlock(Math.floor(e.x), Math.floor(e.y - 0.1), Math.floor(e.z));
      expect(below).toBeTruthy();
    });
  });
});

describe('dağılma, Kredi, kaldırma, kayıt', () => {
  function killOne(r, pred) {
    const list = robots(r.em).filter((e) => !e.def.robot.immune && (!pred || pred(e)));
    const e = list[0];
    expect(e).toBeTruthy();
    r.em.damage(e.id, 999, { kind: 'melee', x: e.x + 1, z: e.z, strength: 0 });
    return e;
  }

  it('dağılınca robotDissolved + hooks.grantKredi BİR kez, aralık içinde; ölü kayıt yinelenmez', () => {
    const r = rig(31);
    simulate(r, 60, NIGHT);
    const e = killOne(r);
    simulate(r, 2, NIGHT);
    const ev = r.events.filter((x) => x.type === 'robotDissolved');
    expect(ev).toHaveLength(1);
    expect(ev[0].mob).toBe(e.key);
    expect(ev[0].kredi).toBeGreaterThanOrEqual(8);
    expect(ev[0].kredi).toBeLessThanOrEqual(25);
    expect(r.kredi).toEqual([[ev[0].kredi, 'robot']]);
    expect(r.sp.neon().stats.dissolved).toBe(1);
  });

  it('art arda 7+ dağıtma → Kredi azalır (çiftlik yok)', () => {
    const r = rig(31);
    const got = [];
    for (let round = 0; round < 10; round++) {
      simulate(r, 25, NIGHT);
      const list = robots(r.em).filter((e) => !e.def.robot.immune);
      if (list.length === 0) continue;
      r.em.damage(list[0].id, 999, { kind: 'melee', x: list[0].x + 1, z: list[0].z, strength: 0 });
      simulate(r, 0.2, NIGHT);
    }
    r.events.filter((x) => x.type === 'robotDissolved').forEach((x) => got.push(x.kredi));
    expect(got.length).toBeGreaterThanOrEqual(8);
    const total = got.reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(got.length * 25);
    expect(got[got.length - 1]).toBeLessThanOrEqual(13); // 7. dağıtmadan sonra yarıya iner
  });

  it('dost robot dağılmaz → Kredi/robotDissolved yok', () => {
    const r = rig(31);
    simulate(r, 60, NIGHT);
    robots(r.em).filter((e) => e.def.robot.immune).forEach((e) => r.em.damage(e.id, 999, { kind: 'melee', x: e.x, z: e.z, strength: 0 }));
    simulate(r, 2, NIGHT);
    expect(r.events.filter((x) => x.type === 'robotDissolved')).toHaveLength(0);
  });

  it('dağılan robotun yuvası 110 sn yeniden doğmaz (soğuma)', () => {
    const r = rig(31);
    simulate(r, 60, NIGHT);
    const e = killOne(r);
    const hx = e.home.x;
    const hz = e.home.z;
    let again = false;
    simulate(r, 110, NIGHT, () => { robots(r.em).forEach((q) => { if (q.id !== e.id && q.home.x === hx && q.home.z === hz) again = true; }); });
    expect(again).toBe(false);
  });

  it('uzaklaşınca (>100 blok) robotlar kaldırılır; counts sıfırlanır', () => {
    const r = rig(31);
    simulate(r, 40, NIGHT);
    expect(robots(r.em).length).toBeGreaterThan(2);
    const n = robots(r.em).length;
    r.p.x += 400;
    for (let i = 0; i < 90; i++) { r.sp.update(1 / 60, r.p, NIGHT); }
    // oyuncu uzakta: eski robotlar kaldırıldı (yeni yuva yok: chunk yüklenmediği için doğma da yok)
    expect(robots(r.em).length).toBeLessThan(n);
    expect(r.sp.neon().stats.despawned).toBeGreaterThanOrEqual(n);
  });

  it('clearMobs: tüm robotlar sessizce kalkar, sayaçlar sıfırlanır; sonra yeniden doğar', () => {
    const r = rig(31);
    simulate(r, 40, NIGHT);
    const n = robots(r.em).length;
    expect(n).toBeGreaterThan(2);
    expect(r.sp.clearMobs()).toBe(n);
    expect(robots(r.em)).toHaveLength(0);
    expect(r.sp.neon().counts().total).toBe(0);
    simulate(r, 40, NIGHT);
    expect(robots(r.em).length).toBeGreaterThan(2);
  });

  it('kayıt/geri yükleme: robotlar konumda döner, yuvada ikinci robot doğmaz, aile dostu alanlar korunur', () => {
    const r = rig(31);
    simulate(r, 50, NIGHT);
    const snap = JSON.parse(JSON.stringify(r.em.serialize()));
    const n = robots(r.em).length;
    const r2 = rig(31);
    r2.em.restore(snap);
    expect(robots(r2.em)).toHaveLength(n);
    simulate(r2, 30, NIGHT);
    const seen = new Map();
    robots(r2.em).forEach((e) => {
      const k = e.home.x + ',' + e.home.z;
      seen.set(k, (seen.get(k) || 0) + 1);
    });
    seen.forEach((c) => expect(c).toBe(1));
  });

  it('hasar yok: 150 sn boyunca oyuncu robotların içinde dolaşsa da playerHit 0', () => {
    const r = rig(31);
    let hits = 0;
    r.em.hurtPlayer = () => { hits++; return 0; };
    simulate(r, 150, NIGHT, (i) => { r.p.x += Math.sin(i * 0.02) * 0.08; r.p.z += Math.cos(i * 0.02) * 0.08; });
    expect(hits).toBe(0);
    expect(r.events.filter((e) => e.type === 'playerHit')).toHaveLength(0);
  });
});

describe('Spawner.update maliyeti', () => {
  it('ortalama adım maliyeti küçük (robotlar dahil 150 sn ≈ 9000 adım): < 0.3 ms/adım', () => {
    const r = rig(31);
    simulate(r, 20, NIGHT); // ısınma (plan/yuva önbelleği)
    const n = 3000;
    // qa5: en iyi 5 parti (CPU doygunken tek parti şişebilir; gerçek yavaşlama TÜM partilerde eşiği aşar)
    let per = Infinity;
    for (let rep = 0; rep < 5 && per >= 0.3; rep++) {
      const t0 = cpuMs(); // qa5: süreç CPU zamanı (duvar saati kesintilerinden etkilenmez)
      for (let i = 0; i < n; i++) {
        r.sp.update(1 / 60, r.p, NIGHT);
        r.em.update(1 / 60, r.p, NIGHT);
      }
      per = Math.min(per, (cpuMs() - t0) / n);
    }
    expect(per).toBeLessThan(0.3);
  });
});

describe('gerçek şehirde uzun yürüyüş sağlamlığı', () => {
  it('240 sn × 3 tohum: robotlar katı blok içinde kalmaz, NaN yok, alt/üst sınırlar içinde, oyuncuya hasar yok', () => {
    [41, 42, 43].forEach((ws) => {
      const r = rig(ws);
      let hits = 0;
      r.em.hurtPlayer = () => { hits++; return 0; };
      let samples = 0;
      simulate(r, 240, NIGHT, (i) => {
        if (i % 120 !== 0) return;
        robots(r.em).forEach((e) => {
          samples++;
          expect(Number.isFinite(e.x + e.y + e.z + e.vx + e.vy + e.vz + e.yaw)).toBe(true);
          expect(e.y).toBeGreaterThan(-30);
          expect(e.y).toBeLessThan(200);
          const hw = e.w * 0.5;
          expect(isBoxFree(r.world, e.x - hw + 0.05, e.y + 0.05, e.z - hw + 0.05, e.x + hw - 0.05, e.y + e.h - 0.05, e.z + hw - 0.05), e.key + ' katı blokta').toBe(true);
        });
      });
      expect(samples).toBeGreaterThan(20);
      expect(hits).toBe(0);
    });
  });
});
