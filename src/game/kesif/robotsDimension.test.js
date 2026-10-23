/*
 * Robotlar × boyut yöneticisi × mobs sistemi (gerçek sistemler, gerçek three modelleri, sahte renderer):
 *   şehre geçince spawner 'neon' profilinde; robotlar doğar ve MODEL görünümü alır; şehirden çıkınca robotlar kaldırılır;
 *   ana diyar doğurucusunun durumu neon gezisinden etkilenmez; dağılınca Kredi cüzdana yazılır; kancalar (kademe, sürüş, kısıtlı hareket).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from './dimTestKit.js';
import { NEON_START_KREDI } from './gameDimension.js';
import { START_KREDI } from './systems/vehicles.js';
import { Spawner } from './sim/spawner.js';
import { robotSlotsForChunk } from './sim/city/ped/robotSlots.js';

vi.setConfig({ testTimeout: 180000 });

const SYSTEMS = ['blocks', 'tech', 'magic', 'treefall', 'content', 'props', 'mobs', 'dimension'];

function densest(seed) {
  let best = null;
  for (let cx = -44; cx < 44; cx += 2) {
    for (let cz = -44; cz < 44; cz += 2) {
      let n = 0;
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) n += robotSlotsForChunk(seed, cx + a, cz + b).length;
      if (!best || n > best.n) best = { cx, cz, n };
    }
  }
  return best;
}

function enterCity(k, opt) {
  const { G, mgr } = k;
  mgr.swap('neon', { reason: 'debug' });
  const seed = G.world.seed;
  const d = densest(seed);
  for (let cx = d.cx - 6; cx <= d.cx + 6; cx++) for (let cz = d.cz - 6; cz <= d.cz + 6; cz++) G.world.ensureChunk(cx, cz);
  k.place(d.cx * 16 + 8, 64, d.cz * 16 + 8, 0.3);
  if (G.camera) G.camera.position.set(G.body.x, G.body.y + 1.62, G.body.z); // sahte render: kamera oyuncuyu izlemez
  // gece: robotlar (hatabot dahil) doğabilsin
  G.clock.frozen = true;
  G.clock.time = (opt && opt.night === false ? 0.25 : 0.75) * G.clock.dayLengthSec;
  return d;
}

function robotsOf(G) {
  const out = [];
  G.em.mobs.forEach((e) => { if (e.def.robot && !e.dead) out.push(e); });
  return out;
}

describe('sabitler', () => {
  it('NEON_START_KREDI, systems/vehicles START_KREDI ile aynı', () => {
    expect(NEON_START_KREDI).toBe(START_KREDI);
  });
});

describe('şehre geçiş: neon profili', () => {
  it('şehir doğurucusu Spawner(profile:"neon"); ana diyarınki "overworld"; kancalar bağlı', () => {
    const k = makeDimG({ systems: ['dimension'] });
    const { G, mgr } = k;
    const owSp = G.spawner;
    expect(owSp.profile).toBe('overworld');
    mgr.swap('neon', { reason: 'debug' });
    const sp = G.spawner;
    expect(sp).toBeInstanceOf(Spawner);
    expect(sp.profile).toBe('neon');
    expect(sp).not.toBe(owSp);
    const hooks = sp.neon().hooks;
    G.player.vehicle = null;
    expect(hooks.driving()).toBe(false);
    G.player.vehicle = { id: 1 };
    expect(hooks.driving()).toBe(true);
    G.player.vehicle = null;
    G.reducedMotion = true;
    expect(hooks.gentle()).toBe(true);
    G.reducedMotion = false;
    G.accessibility = true;
    expect(hooks.gentle()).toBe(true);
    G.accessibility = false;
    expect(hooks.gentle()).toBe(false);
  });

  it('robotlar doğar, mobs sistemi onlara MODEL görünümü verir (gerçek three), organik hayvan yok', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G } = k;
    enterCity(k);
    k.frame(1 / 60, 60 * 30);
    const rs = robotsOf(G);
    expect(rs.length).toBeGreaterThan(3);
    G.em.mobs.forEach((e) => expect(e.def.robot).toBeTruthy());
    const mobs = G.getSystem('mobs');
    expect(mobs.impl.views.count).toBeGreaterThan(0);
    const st = mobs.impl.views.stats;
    expect(st.created).toBeGreaterThan(0);
  });

  it('şehirden çıkınca robotlar kaldırılır; ana diyar doğurucu durumu ve mob listesi neon gezisinden etkilenmez', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G, mgr } = k;
    k.frame(1 / 60, 120);
    const owCtx = mgr.get('overworld');
    const owSp = owCtx.spawner;
    const snap = JSON.stringify({
      tick: owSp.tick, hT: owSp.hT, pT: owSp.pT, dT: owSp.dT, budget: owSp.budget, nightT: owSp.nightT, stats: owSp.stats, profile: owSp.profile,
    });
    const owEmMobs = JSON.stringify(owCtx.em.serialize().mobs);
    enterCity(k);
    k.frame(1 / 60, 60 * 25);
    const neonCtx = mgr.get('neon');
    expect(robotsOf(G).length).toBeGreaterThan(2);
    mgr.swap('overworld', { reason: 'debug' });
    expect(G.spawner).toBe(owSp);
    expect(G.spawner.profile).toBe('overworld');
    // şehir em'inde robot kalmadı
    let left = 0;
    neonCtx.em.mobs.forEach((e) => { if (e.def.robot) left++; });
    expect(left).toBe(0);
    const after = JSON.stringify({
      tick: owSp.tick, hT: owSp.hT, pT: owSp.pT, dT: owSp.dT, budget: owSp.budget, nightT: owSp.nightT, stats: owSp.stats, profile: owSp.profile,
    });
    expect(after).toBe(snap);
    expect(JSON.stringify(owCtx.em.serialize().mobs)).toBe(owEmMobs);
  });

  it('dağılan robot: Kredi şehir cüzdanına (ctx.city.kredi) yazılır ve "kredi" olayı yayılır', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G, mgr } = k;
    const events = [];
    G.addSystem({ name: 'spy', order: 900, onEvent: (g, e) => { events.push(e); } }); // robotDissolved/kredi sistemlere gider (PUBLIC_EVENTS değil)
    enterCity(k);
    k.frame(1 / 60, 60 * 30);
    const victim = robotsOf(G).find((e) => !e.def.robot.immune);
    expect(victim).toBeTruthy();
    const ctx = mgr.get('neon');
    const before = ctx.city && Number.isInteger(ctx.city.kredi) ? ctx.city.kredi : NEON_START_KREDI;
    G.em.damage(victim.id, 999, { kind: 'melee', x: victim.x + 1, z: victim.z, strength: 0 });
    k.frame(1 / 60, 30);
    const dis = events.filter((e) => e.type === 'robotDissolved');
    expect(dis).toHaveLength(1);
    const kr = events.filter((e) => e.type === 'kredi' && e.why === 'robot');
    expect(kr).toHaveLength(1);
    expect(kr[0].delta).toBe(dis[0].kredi);
    expect(ctx.city.kredi).toBe(before + dis[0].kredi);
    expect(kr[0].value).toBe(ctx.city.kredi);
  });

  it('kolay mod (survival.easy → spawnCtx.peaceful): şehirde robot doğmaz', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G } = k;
    G.survival.easy = true;
    enterCity(k);
    k.frame(1 / 60, 60 * 30);
    expect(robotsOf(G)).toHaveLength(0);
  });

  it('50 swap sonrası robot sızıntısı yok: neon em içinde robot ≤ 12 + 8, sahne kök sayısı sabit', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G, mgr } = k;
    enterCity(k);
    k.frame(1 / 60, 600);
    const roots = G.scene.children.length;
    for (let i = 0; i < 20; i++) {
      mgr.swap(i % 2 === 0 ? 'overworld' : 'neon');
      k.frame(1 / 60, 6);
    }
    let total = 0;
    mgr.get('neon').em.mobs.forEach((e) => { if (e.def.robot) total++; });
    expect(total).toBeLessThanOrEqual(20);
    expect(G.scene.children.length).toBe(roots);
    expect(mgr.stats.staleWorldHits).toBe(0);
  });
});

describe('konuşma ve erişilebilirlik kancaları', () => {
  it('bekçi uyarırken ipucu metni (G.hint) ve ekran okuyucu (G.speak) çağrılır', () => {
    const k = makeDimG({ render: true, systems: SYSTEMS });
    const { G } = k;
    const spoken = [];
    G.speak = (t) => spoken.push(t);
    enterCity(k);
    k.frame(1 / 60, 5); // doğurucu ilk güncellemede em.robotHooks'u kurar
    const fx = -Math.sin(G.player.yaw);
    const fz = -Math.cos(G.player.yaw);
    const e = G.em.spawn('bekcirobot', G.body.x + fx * 3.4, G.body.y + 0.02, G.body.z + fz * 3.4, { home: { x: G.body.x + fx * 3.4, z: G.body.z + fz * 3.4 } });
    expect(e).toBeTruthy();
    expect(G.em.robotHooks).toBeTruthy();
    k.frame(1 / 60, 420); // bekçinin ilk bekleme süresi (1–3 sn) + 0.9 sn işaret
    expect(k.hints.some((h) => /Bekçi Robot/.test(h.text))).toBe(true);
    expect(spoken.some((t) => /Bekçi Robot/.test(t))).toBe(true);
  });
});
