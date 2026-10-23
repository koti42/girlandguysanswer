import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { MOB_TYPES, mobsForZone } from './mobTypes.js';
import { SPAWN, Spawner, populateChunk, spawnerForChunk } from './spawner.js';
import {
  makeEm, makePlayer, makeWorld, ofType,
} from './mobAITestKit.js';

const DAY = { dayFactor: 1 };
const NIGHT = { dayFactor: 0 };

/** Spawner + EntityManager adımı. */
function sim(world, opts) {
  const o = opts || {};
  const kit = makeEm(world, { seed: o.seed || 31 });
  const p = makePlayer(o.x || 0, o.y || 1, o.z || 0);
  if (o.yaw !== undefined) p.yaw = o.yaw;
  const sp = new Spawner({ seed: o.seed || 31, world, em: kit.em });
  const step = (secs, ctx, hook) => {
    const n = Math.round(secs * 60);
    for (let i = 0; i < n; i++) {
      sp.update(1 / 60, p, ctx);
      kit.em.update(1 / 60, p, ctx);
      if (hook) hook(i);
    }
  };
  return { ...kit, p, sp, step };
}

describe('Spawner — tavanlar ve kısma', () => {
  it('gece karanlıkta ≤ 24 düşman; tavana yaklaşır ama aşmaz', () => {
    const w = makeWorld({ light: () => 0x00 });
    const s = sim(w);
    let peak = 0;
    s.step(120, NIGHT, () => {
      peak = Math.max(peak, s.sp.countsNear(s.p).hostile);
    });
    expect(peak).toBeLessThanOrEqual(SPAWN.hostileCap);
    expect(peak).toBeGreaterThan(5);
    expect(ofType(s.events, 'mobSpawned').length).toBeGreaterThan(5);
  });

  it('gündüz ≤ 20 pasif ve hiç düşman yok (yüzey, tam ışık)', () => {
    const s = sim(makeWorld());
    let peakP = 0;
    let peakH = 0;
    s.step(120, DAY, () => {
      const c = s.sp.countsNear(s.p);
      peakP = Math.max(peakP, c.passive);
      peakH = Math.max(peakH, c.hostile);
    });
    expect(peakP).toBeLessThanOrEqual(SPAWN.passiveCap);
    expect(peakP).toBeGreaterThan(2);
    expect(peakH).toBe(0);
  });

  it('doğma kısılır: ilk saniyede en çok maxPerSecond + bütçe kadar', () => {
    const s = sim(makeWorld({ light: () => 0x00 }));
    s.step(1, NIGHT);
    const n = ofType(s.events, 'mobSpawned').length;
    expect(n).toBeLessThanOrEqual(SPAWN.maxPerSecond + 1);
  });

  it('barışçıl modda (inşa) düşman doğmaz', () => {
    const s = sim(makeWorld({ light: () => 0x00 }));
    s.step(30, { dayFactor: 0, peaceful: true });
    expect(s.sp.countsNear(s.p).hostile).toBe(0);
  });

  it('oyuncu ölüyken doğmaz', () => {
    const s = sim(makeWorld({ light: () => 0x00 }));
    s.p.dead = true;
    s.step(10, NIGHT);
    expect(ofType(s.events, 'mobSpawned').length).toBe(0);
  });
});

describe('Spawner — kurallar', () => {
  it('hiçbir yaratık 8 bloktan yakın, görüş konisinde 14 bloktan yakın doğmaz', () => {
    const w = makeWorld({ light: () => 0x00 });
    const s = sim(w, { yaw: 0 });
    s.step(90, NIGHT);
    const ev = ofType(s.events, 'mobSpawned');
    expect(ev.length).toBeGreaterThan(5);
    for (const e of ev) {
      const d = Math.hypot(e.x - s.p.x, e.z - s.p.z);
      expect(d).toBeGreaterThanOrEqual(SPAWN.minDist - 1e-6);
    }
  });

  it('görüş konisi kuralı: doğrudan ön tarafta 14 blok içinde doğma yok (türlerin minDist\'i bypass edilse bile)', () => {
    // dar ışık: yalnızca oyuncunun hemen önü karanlık olsun
    const w = makeWorld({ light: (x, y, z) => (z < 0 && z > -14 && Math.abs(x) < 10 ? 0x00 : 0xf0) });
    const s = sim(w, { yaw: 0 });
    s.step(60, NIGHT);
    const ev = ofType(s.events, 'mobSpawned');
    for (const e of ev) expect(e.z < 0 && e.z > -14 && Math.abs(e.x) < 5).toBe(false);
  });

  it('kilitli/tamamlanmamış boss arenasında doğmaz; tamamlanınca doğar', () => {
    const w = makeWorld({ light: () => 0x00 });
    const arenas = [{ x: 0, z: -30, r: 40, done: false }];
    const s = sim(w);
    s.step(60, { dayFactor: 0, arenas });
    const ev = ofType(s.events, 'mobSpawned');
    for (const e of ev) expect(Math.hypot(e.x, e.z + 30)).toBeGreaterThanOrEqual(46 - 1e-6);
    const before = ev.length;
    arenas[0].done = true;
    [...s.em.mobs.keys()].forEach((id) => s.em.despawn(id)); // yer aç (tavan dolmuştu)
    s.step(60, { dayFactor: 0, arenas });
    const inside = ofType(s.events, 'mobSpawned').slice(before).filter((e) => Math.hypot(e.x, e.z + 30) < 40);
    expect(inside.length).toBeGreaterThan(0);
  });

  it('bölge kuralı: 0. bölgede yalnızca gölge; 2. bölgede bölge listesinden', () => {
    const w0 = makeWorld({ light: () => 0x00 });
    const s0 = sim(w0, { x: 0, z: 0 });
    s0.step(60, NIGHT);
    const types0 = new Set(ofType(s0.events, 'mobSpawned').map((e) => e.mob));
    expect([...types0].every((t) => t === 'golge')).toBe(true);
    expect(types0.size).toBeGreaterThan(0);

    const w2 = makeWorld({ light: () => 0x00, biome: () => 3 }); // 3 = col
    const s2 = sim(w2, { x: 230, z: 0 });
    s2.step(90, NIGHT);
    const allowed = new Set(mobsForZone(2, 'düşman').map((d) => d.key));
    const types2 = new Set(ofType(s2.events, 'mobSpawned').map((e) => e.mob));
    expect(types2.size).toBeGreaterThan(1);
    for (const t of types2) expect(allowed.has(t)).toBe(true);
    // yüzeyde mağara/su yaratıkları yok
    expect(types2.has('lavslime')).toBe(false);
    expect(types2.has('tasyarasasi')).toBe(false);
  });

  it('biyom kuralı: koyun yalnızca çayır/dağda, tavuk orman/çayırda', () => {
    const w = makeWorld({ biome: () => 3 }); // çöl
    const s = sim(w);
    s.step(120, DAY);
    const types = new Set(ofType(s.events, 'mobSpawned').map((e) => e.mob));
    expect(types.has('koyun')).toBe(false);
    expect(types.has('tavuk')).toBe(false);
    expect(types.has('ceylan')).toBe(true);
  });

  it('gece pasif doğmaz (gündüz kuralı), ateş böceği geceleri', () => {
    const w = makeWorld({ biome: () => 1 }); // orman
    const s = sim(w, { x: 120, z: 0 }); // 1. bölge
    s.step(90, NIGHT);
    const types = new Set(ofType(s.events, 'mobSpawned').filter((e) => MOB_TYPES[e.mob].passive).map((e) => e.mob));
    for (const t of types) expect(MOB_TYPES[t].spawn.day).toBe(false);
  });

  it('mağara: karanlık kapalı boşluklarda doğar, yüzeyde gündüz doğmaz', () => {
    // 40 kalınlıkta taş; y 20..24 arası geniş boşluk
    const fill = (x, y) => {
      if (y <= 0) return B.STONE;
      if (y <= 39) return y >= 20 && y <= 24 ? 0 : B.STONE;
      return 0;
    };
    const w = makeWorld({ fill, light: (x, y) => (y >= 40 ? 0xf0 : 0x00) });
    const s = sim(w, { x: 0, y: 20, z: 0 });
    s.step(90, DAY);
    const ev = ofType(s.events, 'mobSpawned').filter((e) => !MOB_TYPES[e.mob].passive);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.y).toBeLessThan(30);
      expect(e.habitat).toBe('mağara');
    }
  });

  it('mağara düşmanları toplam tavanı doldurmaz: gündüz mağara kalabalığı geceyi yüzeyde yaratıksız bırakmasın', () => {
    const fill = (x, y) => {
      if (y <= 0) return B.STONE;
      if (y <= 39) return y >= 20 && y <= 24 ? 0 : B.STONE;
      return 0;
    };
    const w = makeWorld({ fill, light: (x, y) => (y >= 40 ? 0xf0 : 0x00) });
    const s = sim(w, { x: 0, y: 40, z: 0 });
    s.step(240, DAY);
    const cDay = s.sp.countsNear(s.p);
    expect(cDay.cave).toBeLessThanOrEqual(SPAWN.caveCap);
    expect(cDay.hostile).toBeLessThanOrEqual(SPAWN.caveCap);
    const before = ofType(s.events, 'mobSpawned').length;
    s.step(90, NIGHT);
    const surf = ofType(s.events, 'mobSpawned').slice(before).filter((e) => !MOB_TYPES[e.mob].passive && e.habitat === 'yüzey');
    expect(surf.length).toBeGreaterThan(3);
  });

  it('üretilmemiş chunk\'a doğmaz', () => {
    const w = makeWorld({ light: () => 0x00, loaded: (x) => x < 0 });
    const s = sim(w);
    s.step(60, NIGHT);
    for (const e of ofType(s.events, 'mobSpawned')) expect(e.x).toBeLessThan(0);
  });

  it('belirlenimci: aynı tohum/girdi → aynı doğma listesi', () => {
    const lists = [];
    for (let n = 0; n < 2; n++) {
      const s = sim(makeWorld({ light: () => 0x00 }), { seed: 5 });
      s.step(40, NIGHT);
      lists.push(JSON.stringify(ofType(s.events, 'mobSpawned').map((e) => [e.mob, e.x.toFixed(3), e.z.toFixed(3)])));
    }
    expect(lists[0]).toBe(lists[1]);
    const other = sim(makeWorld({ light: () => 0x00 }), { seed: 6 });
    other.step(40, NIGHT);
    expect(JSON.stringify(ofType(other.events, 'mobSpawned').map((e) => [e.mob, e.x.toFixed(3), e.z.toFixed(3)]))).not.toBe(lists[0]);
  });
});

describe('Spawner — yok olma', () => {
  it('çok uzaktakiler yok olur; kalıcı, boss ve yavrular kalır', () => {
    const w = makeWorld();
    const s = sim(w);
    const far = s.em.spawn('tavuk', 130, 1, 0);
    const keep = s.em.spawn('tavuk', 130, 1, 5, { persistent: true });
    const boss = s.em.spawnBoss('kokana', 150, 1, 0);
    const minion = s.em.spawn('golge', 130, 1, 9, { minion: true, owner: boss.id });
    s.step(2.5, DAY);
    expect(s.em.mobs.has(far.id)).toBe(false);
    expect(s.em.mobs.has(keep.id)).toBe(true);
    expect(s.em.mobs.has(boss.id)).toBe(true);
    expect(s.em.mobs.has(minion.id)).toBe(true);
    expect(s.sp.stats.despawned).toBeGreaterThan(0);
  });

  it('ışıkta kalan düşman sönüp gider (yanmaz, hasar almaz)', () => {
    const w = makeWorld({ light: () => 0xfe });
    const s = sim(w);
    const g = s.em.spawn('golge', 20, 1, 20);
    s.step(16, DAY);
    expect(s.em.mobs.has(g.id)).toBe(false);
    expect(g.hp).toBe(g.maxHp);
  });
});

describe('spawnerForChunk / populateChunk', () => {
  it('belirlenimci ve geçerli sürü tanımları', () => {
    let cxh = 0;
    while (spawnerForChunk(77, cxh, -2).length === 0) cxh++;
    const a = spawnerForChunk(77, cxh, -2);
    const b = spawnerForChunk(77, cxh, -2);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    let herds = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const l = spawnerForChunk(1234, i % 25 - 12, Math.floor(i / 25) - 12);
      if (l.length) {
        herds++;
        for (const d of l) {
          expect(MOB_TYPES[d.type].passive).toBe(true);
          expect(d.x).toBeGreaterThanOrEqual((i % 25 - 12) * 16 - 4);
          expect(d.x).toBeLessThanOrEqual((i % 25 - 12) * 16 + 20);
          expect(d.chunk).toBe((i % 25 - 12) + ',' + (Math.floor(i / 25) - 12));
        }
        expect(l.length).toBeLessThanOrEqual(MOB_TYPES[l[0].type].spawn.group[1]);
      }
    }
    expect(herds / N).toBeGreaterThan(0.12);
    expect(herds / N).toBeLessThan(0.36);
    expect(spawnerForChunk(78, cxh, -2)).not.toEqual(a);
  });

  it('biyom filtresi türün biyom kuralını uygular', () => {
    for (let i = 0; i < 300; i++) {
      const l = spawnerForChunk(9, i, 0, { biomeAt: () => 'col' });
      for (const d of l) {
        const b = MOB_TYPES[d.type].spawn.biomes;
        expect(!b || b.indexOf('col') >= 0).toBe(true);
      }
    }
  });

  it('populateChunk zemine oturtur, chunk başına bir kez', () => {
    const w = makeWorld();
    const { em } = makeEm(w);
    let total = 0;
    for (let cx = -6; cx < 6; cx++) {
      for (let cz = -6; cz < 6; cz++) {
        const made = populateChunk(em, w, 55, cx, cz);
        total += made.length;
        for (const e of made) {
          expect(e.y).toBeCloseTo(1.02, 5);
          expect(e.x).toBeGreaterThanOrEqual(cx * 16 - 4);
          expect(e.x).toBeLessThanOrEqual(cx * 16 + 20);
          expect(e.def.passive).toBe(true);
        }
        expect(populateChunk(em, w, 55, cx, cz).length).toBe(0);
      }
    }
    expect(total).toBeGreaterThan(5);
    expect(em.populated.size).toBe(144);
    expect(em.mobs.size).toBe(total);
  });
});

describe('Spawner — ilk gece adaleti (ctx.early)', () => {
  const FIRST = { dayFactor: 0, early: { grace: 1 } };
  const spawnedList = (s) => ofType(s.events, 'mobSpawned');

  it('ilk gece: ≤ 6 düşman, gecenin başında tek düşman, doğma aralığı ≥ 5 sn', () => {
    const s = sim(makeWorld({ light: () => 0x00 }));
    let peak = 0;
    let peakEarly = 0;
    s.step(120, FIRST, (i) => {
      const n = s.sp.countsNear(s.p).hostile;
      peak = Math.max(peak, n);
      if (i < 11 * 60) peakEarly = Math.max(peakEarly, n);
    });
    expect(peak).toBeLessThanOrEqual(6);
    expect(peak).toBeGreaterThanOrEqual(4);
    expect(peakEarly).toBeLessThanOrEqual(1);
    // ilk 30 sn'de en çok ⌈30/6⌉ + 1 doğma
    const s2 = sim(makeWorld({ light: () => 0x00 }));
    s2.step(30, FIRST);
    expect(spawnedList(s2).length).toBeLessThanOrEqual(6);
  });

  it('ilk gece: hiçbir düşman oyuncuya 24 bloktan yakın doğmaz, sürü tek, doğarken izlemeye başlar', () => {
    const s = sim(makeWorld({ light: () => 0x00 }), { yaw: 0 });
    let hunters = 0;
    s.step(60, FIRST, () => {
      s.em.mobs.forEach((e) => {
        if (e.def.hostile && e.ai.aggroT > 0) hunters++;
      });
    });
    const ev = spawnedList(s).filter((e) => !MOB_TYPES[e.mob].passive);
    expect(ev.length).toBeGreaterThan(2);
    for (const e of ev) expect(Math.hypot(e.x - s.p.x, e.z - s.p.z)).toBeGreaterThanOrEqual(24);
    expect(hunters).toBeGreaterThan(0);
  });

  it('gündüz kuralı bozulmaz: koruma bağlamıyla da gündüz yüzeyde düşman yok', () => {
    const s = sim(makeWorld());
    let peakH = 0;
    s.step(60, { dayFactor: 1, early: { grace: 1 } }, () => {
      peakH = Math.max(peakH, s.sp.countsNear(s.p).hostile);
    });
    expect(peakH).toBe(0);
  });

  it('koruma 0 ya da yok → taban davranış birebir (aynı doğma listesi)', () => {
    const run = (ctx) => {
      const s = sim(makeWorld({ light: () => 0x00 }), { seed: 5 });
      s.step(40, ctx);
      expect(s.sp.tune).toBeNull();
      return JSON.stringify(spawnedList(s).map((e) => [e.mob, e.x.toFixed(3), e.z.toFixed(3)]));
    };
    const base = run(NIGHT);
    expect(run({ dayFactor: 0, early: { grace: 0 } })).toBe(base);
    expect(run({ dayFactor: 0, early: null })).toBe(base);
  });

  it('belirlenimci: aynı tohum → aynı ilk gece doğma listesi', () => {
    const run = () => {
      const s = sim(makeWorld({ light: () => 0x00 }), { seed: 9 });
      s.step(60, FIRST);
      return JSON.stringify(spawnedList(s).map((e) => [e.mob, e.x.toFixed(3), e.z.toFixed(3)]));
    };
    expect(run()).toBe(run());
  });

  it('gündüz olunca gece sayacı sıfırlanır: ertesi gece yine tek düşmanla başlar', () => {
    const s = sim(makeWorld({ light: () => 0x00 }));
    s.step(80, FIRST);
    expect(s.sp.nightT).toBeGreaterThan(70);
    s.step(2, { dayFactor: 1, early: { grace: 1 } });
    expect(s.sp.nightT).toBe(0);
    expect(s.sp.tune.hostileCap).toBeGreaterThan(1); // gündüz: tırmanma tamam sayılır
    s.step(1, FIRST);
    expect(s.sp.tune.hostileCap).toBe(1);
  });
});

describe('Spawner — derin dünya: dikey ilgi aralığı', () => {
  // y<=0 taş; (0,-200,0) çevresinde geniş bir mağara boşluğu (y -201..-197, yarıçap 40)
  const caveFill = (x, y, z) => {
    if (y > 0) return 0;
    if (y >= -201 && y <= -197 && x * x + z * z < 40 * 40) return 0;
    return B.STONE;
  };
  const dark = () => 0x00;
  const deepWorld = (o) => Object.assign(makeWorld(o), { yMin: -400, yMax: 362 });

  it('kapalı kaya içindeki oyuncu için yüzeyde (yüzlerce blok yukarıda) hiçbir şey doğmaz', () => {
    const s = sim(deepWorld({ light: dark }), { y: -200 });
    s.step(90, NIGHT);
    expect(ofType(s.events, 'mobSpawned').length).toBe(0);
  });

  it('mağarada gece düşman doğar; hepsi oyuncunun dikey ilgi aralığında', () => {
    const s = sim(deepWorld({ fill: caveFill, light: dark }), { y: -200 });
    s.step(120, NIGHT);
    const ev = ofType(s.events, 'mobSpawned');
    expect(ev.length).toBeGreaterThan(3);
    for (const e of ev) expect(Math.abs(e.y - s.p.y)).toBeLessThanOrEqual(SPAWN.maxDy);
  });

  it('çok yukarıdaki yaratıklar sayılmaz (mağara doğmasını aç bırakmaz) ve yok olur', () => {
    const s = sim(deepWorld({ fill: caveFill, light: dark }), { y: -200 });
    for (let i = 0; i < SPAWN.hostileCap + 4; i++) s.em.spawn('golge', 10 + i, 1, 10, {});
    expect(s.em.counts().hostile).toBeGreaterThan(SPAWN.hostileCap);
    expect(s.sp.countsNear(s.p).hostile).toBe(0); // 200 blok yukarıdalar: oyuncunun çevresi sayılmaz
    s.step(120, NIGHT);
    const kept = [];
    s.em.forEachMob((e) => { if (e.y > -100) kept.push(e); });
    expect(kept.length).toBe(0); // dikey olarak uzaktakiler yok oldu
    expect(ofType(s.events, 'mobSpawned').length).toBeGreaterThan(3); // mağara doğuyor
  });

  it('yüzeyde (oyuncu zeminde) davranış değişmez: aynı sayıda doğma, 24 tavanı', () => {
    const s = sim(makeWorld({ light: dark }));
    let peak = 0;
    s.step(120, NIGHT, () => { peak = Math.max(peak, s.sp.countsNear(s.p).hostile); });
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(SPAWN.hostileCap);
  });
});
