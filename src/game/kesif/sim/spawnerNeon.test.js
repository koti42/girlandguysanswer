/*
 * Spawner profilleri: 'overworld' (varsayılan, bayt-bayt eskisi gibi) ↔ 'neon' (yalnız robotlar). Profil geçişi ana diyar durumunu bozmaz,
 * neon mobları temizler; şehir dünyasında organik sürü doldurma (populateChunk) yapılmaz.
 */
import { describe, expect, it } from 'vitest';
import { Spawner, populateChunk } from './spawner.js';
import { EntityManager } from './entities.js';
import { makeEm, makePlayer, makeWorld, NIGHT as NIGHT_CTX } from './mobAITestKit.js';
import { cityWorld } from './city/vehicle/vehicleTestKit.js';
import { robotSlotsForChunk } from './city/ped/robotSlots.js';
import { createPlayerBody } from './physics.js';

function state(sp) {
  return JSON.stringify({
    tick: sp.tick, hT: sp.hT, pT: sp.pT, dT: sp.dT, budget: sp.budget, nightT: sp.nightT, stats: sp.stats, tune: sp.tune, profile: sp.profile,
  });
}

function overworldRig(seed) {
  const world = makeWorld();
  const { em, events } = makeEm(world, { seed });
  const sp = new Spawner({ seed, world, em });
  const p = makePlayer(0, 1, 0);
  return {
    world, em, events, sp, p,
  };
}

function ticks(r, n, ctx) {
  for (let i = 0; i < n; i++) {
    r.sp.update(1 / 20, r.p, ctx || NIGHT_CTX);
  }
}

const spawnedList = (events) => JSON.stringify(events.filter((e) => e.type === 'mobSpawned').map((e) => [e.mob, e.x, e.y, e.z]));

describe('profil API', () => {
  it('varsayılan profil overworld; bilinmeyen ad overworld; aynı profile geçmek no-op', () => {
    const r = overworldRig(5);
    expect(r.sp.profile).toBe('overworld');
    expect(r.sp.neon()).toBeNull();
    expect(r.sp.setProfile('overworld')).toBe(r.sp);
    expect(r.sp.setProfile('baska')).toBe(r.sp);
    expect(r.sp.profile).toBe('overworld');
    expect(r.sp.clearMobs()).toBe(0);
    const n = new Spawner({ seed: 1, world: r.world, em: r.em, profile: 'neon' });
    expect(n.profile).toBe('neon');
    expect(new Spawner({ seed: 1, world: r.world, em: r.em, profile: '__proto__' }).profile).toBe('overworld');
  });

  it('açıkça profile:"overworld" ile kurulan doğurucu varsayılanla BİREBİR aynı doğurur', () => {
    const a = overworldRig(21);
    const world = makeWorld();
    const { em, events } = makeEm(world, { seed: 21 });
    const b = { sp: new Spawner({ seed: 21, world, em, profile: 'overworld' }), em, events, p: makePlayer(0, 1, 0) };
    ticks(a, 400);
    ticks(b, 400);
    expect(spawnedList(a.events).length).toBeGreaterThan(10);
    expect(spawnedList(b.events)).toBe(spawnedList(a.events));
    expect(state(b.sp)).toBe(state(a.sp));
  });
});

describe('neon profili', () => {
  it('organik doğma YOK: 120 sn gece boyunca (düz dünyada) hiçbir ana diyar yaratığı doğmaz; doğanlar yalnız robot', () => {
    const world = makeWorld();
    const { em } = makeEm(world, { seed: 4 });
    const sp = new Spawner({ seed: 4, world, em, profile: 'neon' });
    const p = makePlayer(0, 1, 0);
    for (let i = 0; i < 120 * 20; i++) sp.update(1 / 20, p, NIGHT_CTX);
    em.mobs.forEach((e) => expect(e.def.robot).toBeTruthy());
    expect(sp.stats.hostileSpawned + sp.stats.passiveSpawned).toBe(0);
    expect(sp.tick).toBe(0);
  });

  it('neon güncellemeleri ana diyar sayaçlarına dokunmaz (tick, zamanlayıcılar, bütçe, istatistik)', () => {
    const r = overworldRig(9);
    ticks(r, 200);
    const before = state(r.sp);
    r.sp.setProfile('neon');
    ticks(r, 300);
    r.sp.setProfile('overworld');
    expect(state(r.sp)).toBe(before);
  });

  it('neon profilinden çıkarken robotlar temizlenir, ana diyar mobları dokunulmaz', () => {
    const { world, seed } = cityWorld(31, [0, 0], [0, 0]);
    let best = null;
    for (let cx = -44; cx < 44; cx += 2) {
      for (let cz = -44; cz < 44; cz += 2) {
        let n = 0;
        for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) n += robotSlotsForChunk(seed, cx + a, cz + b).length;
        if (!best || n > best.n) best = { cx, cz, n };
      }
    }
    for (let cx = best.cx - 6; cx <= best.cx + 6; cx++) for (let cz = best.cz - 6; cz <= best.cz + 6; cz++) world.ensureChunk(cx, cz);
    const em = new EntityManager({ seed, world, emit: () => {} });
    const sp = new Spawner({ seed, world, em, profile: 'neon' });
    const p = createPlayerBody(best.cx * 16 + 8, 64, best.cz * 16 + 8);
    p.dead = false;
    const hen = em.spawn('tavuk', best.cx * 16 + 20, 64.02, best.cz * 16 + 20, {});
    for (let i = 0; i < 40 * 20; i++) sp.update(1 / 20, p, NIGHT_CTX);
    let robots = 0;
    em.mobs.forEach((e) => { if (e.def.robot) robots++; });
    expect(robots).toBeGreaterThan(2);
    sp.setProfile('overworld');
    let left = 0;
    em.mobs.forEach((e) => { if (e.def.robot) left++; });
    expect(left).toBe(0);
    expect(em.mobs.has(hen.id)).toBe(true);
    expect(sp.profile).toBe('overworld');
  });

  it('SIFIR robot gezisi tam eşitlik: kısa neon ziyareti (ilk deneme öncesi) sonrası ana diyar doğma listesi + em kaydı eskisiyle bayt-bayt aynı', () => {
    const run = (excursion) => {
      const r = overworldRig(33);
      ticks(r, 160);
      if (excursion) {
        r.sp.setProfile('neon');
        for (let i = 0; i < 6; i++) r.sp.update(1 / 60, r.p, NIGHT_CTX); // 0.1 sn: robot doğurma denemesi (0.5 sn) yok
        r.sp.setProfile('overworld');
      }
      ticks(r, 240);
      return JSON.stringify([spawnedList(r.events), r.em.serialize(), state(r.sp)]);
    };
    const ref = run(false);
    expect(JSON.stringify(JSON.parse(ref)[0]).length).toBeGreaterThan(50);
    expect(run(true)).toBe(ref);
  });

  it('setProfile(neon→overworld→neon) tekrarı sızıntı yapmaz: her seferinde robot sayısı sıfırlanır', () => {
    const r = overworldRig(2);
    for (let k = 0; k < 5; k++) {
      r.sp.setProfile('neon');
      ticks(r, 40);
      r.sp.setProfile('overworld');
      let n = 0;
      r.em.mobs.forEach((e) => { if (e.def.robot) n++; });
      expect(n).toBe(0);
    }
  });
});

describe('populateChunk (chunk sürüleri)', () => {
  it('şehir dünyasında (world.dim "neon") sürü doldurma YOK; ana diyar/yalın dünyada eskisi gibi', () => {
    const { world } = cityWorld(31, [0, 0], [0, 0]);
    const em = new EntityManager({ seed: 1, world, emit: () => {} });
    for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) expect(populateChunk(em, world, 1, cx, cz, null)).toEqual([]);
    expect(em.mobs.size).toBe(0);
    expect(em.populated.size).toBe(0);
    // yalın dünya (dim yok) → eskisi gibi çalışır (yüzey olmayan sahte dünyada boş dönebilir ama atmaz)
    const flat = makeWorld();
    const em2 = new EntityManager({ seed: 1, world: flat, emit: () => {} });
    expect(() => populateChunk(em2, flat, 1, 0, 0, null)).not.toThrow();
    expect(em2.populated.has('0,0')).toBe(true);
  });
});
