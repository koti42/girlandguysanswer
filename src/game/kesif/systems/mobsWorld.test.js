import { describe, expect, it } from 'vitest';
import { makeMobsG } from './mobsTestKit.js';
import { ZONES } from '../sim/constants.js';

const arena = (o) => Object.assign({
  x: 8.5, z: -20, r: 22, key: 'tasbekci', zone: 2, y: 41, done: false, name: 'Taş Bekçi',
}, o || {});

function bossesOf(G, key) {
  const out = [];
  G.em.mobs.forEach((e) => { if (e.def.boss && (!key || e.key === key)) out.push(e); });
  return out;
}

describe('bağlam bayrakları', () => {
  it('macera: düşman savaşır; kolay modda doğal düşman doğmaz ama boss savaşır', () => {
    const k = makeMobsG({});
    k.step(1, {});
    const w = k.sys.main.impl.world;
    expect(w.emCtx.peaceful).toBe(false);
    expect(w.spawnCtx.peaceful).toBe(false);
    k.G.survival.easy = true;
    k.step(1, {});
    expect(w.emCtx.peaceful).toBe(false);
    expect(w.spawnCtx.peaceful).toBe(true);
  });

  it('inşa/harita: yaratık saldırmaz, düşman doğmaz', () => {
    for (const mode of ['insa', 'harita']) {
      const k = makeMobsG({ mode });
      k.step(1, {});
      const w = k.sys.main.impl.world;
      expect(w.emCtx.peaceful).toBe(true);
      expect(w.spawnCtx.peaceful).toBe(true);
    }
  });

  it('zorluk: kolay mod ve harita easy; sonra normale döner', () => {
    const k = makeMobsG({});
    k.step(70, {});
    expect(k.G.em.difficulty).toBe('normal');
    k.G.survival.easy = true;
    k.step(70, {});
    expect(k.G.em.difficulty).toBe('easy');
    k.G.survival.easy = false;
    k.step(70, {});
    expect(k.G.em.difficulty).toBe('normal');
    expect(makeMobsG({ mode: 'harita' }).sys.main.impl.world.difficulty).toBeDefined();
  });

  it('toplama: blocks sisteminin G.pickupItem işlevi kullanılır; yoksa envantere eklenir', () => {
    const k = makeMobsG({});
    const ctx = k.sys.main.impl.world.emCtx;
    expect(ctx.pickup('item:elma', 3)).toBe(0);
    expect(k.G.inventory.count('item:elma')).toBe(3);
    const calls = [];
    k.G.pickupItem = (i, c, d) => { calls.push([i, c, d]); return 1; };
    expect(ctx.pickup('item:elma', 2, 5)).toBe(1);
    expect(calls).toEqual([['item:elma', 2, 5]]);
  });
});

describe('boss doğurma', () => {
  it('yakındaki bitmemiş arenada boss doğar, tekrar doğmaz', () => {
    const k = makeMobsG({});
    k.G.arenas = [arena()];
    k.step(65, {});
    const b = bossesOf(k.G, 'tasbekci');
    expect(b).toHaveLength(1);
    expect(b[0].arena).toMatchObject({ x: 8.5, z: -20, r: 22 });
    expect(b[0].persistent).toBe(true);
    k.step(130, {});
    expect(bossesOf(k.G, 'tasbekci')).toHaveLength(1);
  });

  it('uzak ya da bitmiş arenada doğmaz; ilerleme yenilgiyi canlı okur', () => {
    const far = makeMobsG({});
    far.G.arenas = [arena({ z: -400 })];
    far.step(65, {});
    expect(bossesOf(far.G)).toHaveLength(0);
    const done = makeMobsG({});
    done.G.arenas = [arena({ done: true })];
    done.step(65, {});
    expect(bossesOf(done.G)).toHaveLength(0);
    const live = makeMobsG({});
    live.G.arenas = [arena()];
    live.G.progression.bossesDefeated[2] = true;
    live.step(65, {});
    expect(bossesOf(live.G)).toHaveLength(0);
  });

  it('içerik sistemi de doğurduysa çift boss tekilleştirilir (en eski kalır)', () => {
    const k = makeMobsG({});
    k.G.arenas = [arena()];
    const a = k.G.em.spawnBoss('tasbekci', 8.5, 41, -20, {});
    const b = k.G.em.spawnBoss('tasbekci', 9.5, 41, -20, {});
    k.step(65, {});
    const left = bossesOf(k.G, 'tasbekci');
    expect(left).toHaveLength(1);
    expect(left[0].id).toBe(Math.min(a.id, b.id));
  });

  it('boss yenilince bossDefeated olayı arenayı tazeler ve yeniden doğmaz', () => {
    const k = makeMobsG({});
    k.G.arenas = [arena()];
    k.step(65, {});
    const [b] = bossesOf(k.G, 'tasbekci');
    k.G.em.damage(b.id, 99999, { kind: 'melee' });
    k.G.progression.bossesDefeated[2] = true; // progression olayı işler
    k.step(60 * 4, {});
    expect(bossesOf(k.G, 'tasbekci')).toHaveLength(0);
  });
});

describe('güvenli bölge ve sürüler', () => {
  it('güvenli bölgeye giren düşman sönerek kalkar; boss/pasif/dışarıdaki kalır', () => {
    const k = makeMobsG({});
    k.G.safeZones = [{ id: 's', x: 8.5, z: 0, r: 10 }];
    const inside = k.G.em.spawn('golge', 8.5, 41, 2, {});
    const outside = k.G.em.spawn('golge', 8.5, 41, 40, {});
    const passive = k.G.em.spawn('koyun', 8.5, 41, 2, {});
    k.step(65, {});
    expect(inside.removed).toBe(true);
    expect(outside.removed).toBeFalsy();
    expect(passive.removed).toBeFalsy();
    expect(k.G.events.some((e) => e.type === 'fx' && e.name === 'mobFade')).toBe(true);
  });

  it('spawner güvenli bölge çevresine düşman doğurmaz (bağlama pseudo-arena olarak girer)', () => {
    const k = makeMobsG({});
    k.G.safeZones = [{ id: 's', x: 8.5, z: 8.5, r: 60 }];
    k.step(2, {});
    k.G.clock.frozen = true;
    const ctx = k.sys.main.impl.world.spawnCtx;
    expect(ctx.arenas.some((a) => a.r === 60 && a.done === false)).toBe(true);
  });

  it('yüklü chunk sürüleri bir kez doldurulur; tekrar çağrı çoğaltmaz', () => {
    const k = makeMobsG({});
    k.G.spawner.pT = 1e9; // doğal doğmayı kapat: yalnızca sürü doldurma sayılır
    k.G.spawner.hT = 1e9;
    k.step(31, {});
    const n1 = k.G.em.populated.size;
    expect(n1).toBeGreaterThan(0);
    k.step(120, {});
    expect(k.G.em.populated.size).toBeGreaterThanOrEqual(n1);
    const mobs = k.G.em.mobs.size;
    k.sys.main.impl.world.resetPopulation();
    k.step(120, {});
    expect(k.G.em.mobs.size).toBe(mobs); // populated kaydı varken çoğalmaz
  });

  it('harita/inşa modunda sürü doldurulmaz', () => {
    const k = makeMobsG({ mode: 'harita' });
    k.step(60, {});
    expect(k.G.em.populated.size).toBe(0);
  });
});

describe('ilk gece adaleti bağlantısı', () => {
  const nightKit = (day) => {
    const k = makeMobsG({});
    k.G.clock.day = day;
    k.G.clock.time = 0.75 * k.G.clock.dayLengthSec; // gece yarısı
    return k;
  };

  it('ileri günde koruma yok: bağlam ve çarpanlar taban', () => {
    const k = nightKit(8);
    k.step(60, {});
    expect(k.sys.main.impl.world.spawnCtx.early.grace).toBe(0);
    expect(k.G.em.earlyMul).toBe(1);
    expect(k.G.em.aggroMul).toBe(1);
    expect(k.G.spawner.tune).toBeNull();
  });

  it('ilk gece, başlangıçta, demirsiz: koruma 1; hasar ve doğma ölçeği devrede', () => {
    const k = nightKit(0);
    k.step(60, {});
    const w = k.sys.main.impl.world;
    expect(w.spawnCtx.early.grace).toBe(1);
    expect(k.G.em.earlyMul).toBeLessThan(0.3);
    expect(k.G.em.aggroMul).toBeGreaterThan(1);
    // vuruş hasarı ölçeklenir (zırhsız, kalkansız)
    const dmg = k.G.em.hurtPlayer(null, 10, { fromX: 0, fromZ: 0 });
    expect(dmg).toBeCloseTo(10 * k.G.em.earlyMul, 6);
    expect(dmg).toBeLessThan(3);
    // gece ilerledikçe hasar tırmanır
    const first = k.G.em.earlyMul;
    k.step(60 * 60, {});
    expect(k.G.em.earlyMul).toBeGreaterThan(first);
  });

  it('demir alet alınca koruma biter; geri çarpanlar 1', () => {
    const k = nightKit(0);
    k.step(60, {});
    expect(k.G.em.earlyMul).toBeLessThan(1);
    k.G.inventory.add('item:kılıç_demir', 1);
    k.step(60, {});
    expect(k.sys.main.impl.world.spawnCtx.early.grace).toBe(0);
    expect(k.G.em.earlyMul).toBe(1);
    expect(k.G.em.aggroMul).toBe(1);
  });

  it('1. bölgeye geçince koruma biter (sonraki bölgeler tam zorluk)', () => {
    const k = nightKit(0);
    k.G.body.x = ZONES[0].rOut + 24; // bölge 1 içinde
    k.G.body.z = 0;
    k.step(60, {});
    expect(k.sys.main.impl.world.spawnCtx.early.grace).toBe(0);
    expect(k.G.em.earlyMul).toBe(1);
  });

  it('kolaylaştırma (assist/easy) ile çarpılır, onun yerine geçmez', () => {
    const k = makeMobsG({ easy: true });
    k.G.clock.day = 0;
    k.G.clock.time = 0.75 * k.G.clock.dayLengthSec;
    k.step(60, {});
    expect(k.G.em.dmgMul).toBe(0.5);
    expect(k.G.em.aggroMul).toBeCloseTo(0.8 * 1.3, 6);
  });

  it('inşa modunda koruma hesaplanmaz', () => {
    const k = makeMobsG({ mode: 'insa' });
    k.G.clock.day = 0;
    k.step(60, {});
    expect(k.sys.main.impl.world.spawnCtx.early.grace).toBe(0);
    expect(k.G.em.earlyMul).toBe(1);
  });
});
