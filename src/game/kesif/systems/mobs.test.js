import { describe, expect, it } from 'vitest';
import { makeMobsG } from './mobsTestKit.js';
import { createSystems } from './mobs.js';
import { createSystemRegistry } from '../gameRegistry.js';
import { qualityName, updateEvery, vis01 } from './mobsModels.js';
import { blinkVisible, stackScale } from './mobsDrops.js';

const impl = (k) => k.sys.main.impl;
const group = (k, name) => k.G.entityRoot.children.find((c) => c.name === name);

describe('kayıt', () => {
  it('iki sistem: mobs.combat (−60) ve mobs (40); api adları çakışmaz', () => {
    const k = makeMobsG({});
    const [a, b] = createSystems(k.G);
    expect(a.name).toBe('mobs.combat');
    expect(a.order).toBe(-60);
    expect(b.name).toBe('mobs');
    expect(b.order).toBe(40);
    const reg = createSystemRegistry();
    reg.add(a);
    reg.add(b);
    const api = reg.mergeApi({}, k.G);
    expect(Object.keys(api).sort()).toEqual(['getBossInfo', 'getMobStats', 'respawn']);
  });

  it('init yaratık yöneticisi yoksa sessizce atlar; olaylar/kareler çökmez', () => {
    const k = makeMobsG({});
    const [, main] = createSystems({ ...k.G, em: null });
    main.init({ ...k.G, em: null });
    expect(() => main.fixedUpdate(k.G, 1 / 60)).not.toThrow();
    expect(() => main.frameUpdate(k.G, 0.016, 1)).not.toThrow();
    expect(() => main.onEvent(k.G, { type: 'fx', name: 'slam' })).not.toThrow();
    expect(main.api(k.G).respawn()).toBe(false);
    expect(main.serialize(k.G)).toBeNull();
  });
});

describe('yaratık görünümleri', () => {
  it('yakındaki yaratık için model kurulur, konum enterpolasyonu uygulanır', () => {
    const k = makeMobsG({ render: true });
    const e = k.mobAt(6, 'golge');
    e.persistent = true;
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(1);
    const v = impl(k).views.viewOf(e.id);
    expect(v.model.root.visible).toBe(true);
    expect(v.model.root.position.z).toBeCloseTo(e.z, 3);
    // sim konumu ilerledi: önceki/şimdiki anlık görüntü arası alpha
    const z0 = e.z;
    e.z = z0 - 1;
    impl(k).views.afterStep();
    k.frame(1 / 60, 0.5);
    expect(v.model.root.position.z).toBeCloseTo(z0 - 0.5, 3);
    k.frame(1 / 60, 1);
    expect(v.model.root.position.z).toBeCloseTo(z0 - 1, 3);
  });

  it('yüklenmemiş chunk\'taki ve çok uzaktaki yaratık için model kurulmaz', () => {
    const k = makeMobsG({ render: true });
    const far = k.G.em.spawn('golge', 8.5, 41, 8.5 - 200, {});
    far.persistent = true;
    const unloaded = k.G.em.spawn('golge', 5000, 41, 5000, {});
    unloaded.persistent = true;
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(0);
  });

  it('uzaklaşınca havuza döner, yeni yaratık havuzdan alınır (model kurulumu artmaz)', () => {
    const k = makeMobsG({ render: true });
    const a = k.mobAt(6, 'golge');
    k.frame(1 / 60, 1);
    const created = impl(k).views.stats.created;
    expect(created).toBe(1);
    a.z = 8.5 - 150;
    impl(k).views.afterStep();
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(0);
    expect(impl(k).views.stats.pooled).toBe(1);
    const b = k.mobAt(5, 'golge');
    b.persistent = true;
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(1);
    expect(impl(k).views.stats.created).toBe(created);
    expect(impl(k).views.stats.reused).toBe(1);
  });

  it('yaratık kalkınca görünüm kapanır; gömülü (hidden) yaratık çizilmez; ölünce çözülme durumu', () => {
    const k = makeMobsG({ render: true });
    const e = k.mobAt(5, 'kumakrebi');
    k.frame(1 / 60, 1);
    const v = impl(k).views.viewOf(e.id);
    e.hidden = true;
    k.frame(1 / 60, 1);
    expect(v.model.root.visible).toBe(false);
    e.hidden = false;
    k.G.em.damage(e.id, 9999, { kind: 'melee' });
    for (let i = 0; i < 40; i++) {
      impl(k).views.afterStep();
      k.frame(1 / 60, 1);
    }
    expect(v.model.deathProgress).toBeGreaterThan(0.3);
    k.G.em.despawn(e.id);
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(0);
  });

  it('görünür model sayısı kademe sınırını aşmaz (en yakınlar çizilir; boss hariç)', () => {
    const k = makeMobsG({ render: true });
    k.G.settings.maxMobModels = 5;
    for (let i = 0; i < 14; i++) {
      const e = k.G.em.spawn('koyun', 8.5 + (i - 7) * 2, 41, 8.5 - 14 - i, {});
      e.persistent = true;
    }
    k.G.em.update(0.0001, k.G.body, { dayFactor: 1 });
    for (let i = 0; i < 12; i++) {
      k.G.time.frame++;
      k.frame(0.3, 1); // kalite/sınır güncellemesi ~1 sn'de bir
    }
    const st = impl(k).views.stats;
    expect(st.cap).toBe(5);
    expect(st.visible).toBeLessThanOrEqual(6);
    expect(st.visible).toBeGreaterThanOrEqual(4);
    // en yakın olan çizilir
    const nearest = [...k.G.em.mobs.values()].sort((a, b) => Math.hypot(a.x - 8.5, a.z - 8.5) - Math.hypot(b.x - 8.5, b.z - 8.5))[0];
    expect(impl(k).views.viewOf(nearest.id).model.root.visible).toBe(true);
  });

  it('aynı karede en çok 2 yeni model kurulur (yük dağıtımı)', () => {
    const k = makeMobsG({ render: true });
    for (let i = 0; i < 6; i++) k.mobAt(4 + i, 'koyun', i * 0.5);
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(2);
    k.frame(1 / 60, 1);
    k.frame(1 / 60, 1);
    expect(impl(k).views.count).toBe(6);
  });
});

describe('eşya, mermi, işaret, sayı görünümleri', () => {
  it('yerdeki eşya görünümü (toplu çizim): çizilir, alınınca kalkar; çiftler InstancedMesh', () => {
    const k = makeMobsG({ render: true });
    const batchMeshes = () => k.G.entityRoot.children.filter((c) => c.name === 'drop-batch');
    k.G.em.spawnItem('item:elmas', 3, 8.5, 42, 3, { vy: 0, delay: 99 });
    k.frame(1 / 60, 1);
    expect(impl(k).drops.count).toBe(1);
    expect(impl(k).drops.stats.batched).toBe(1);
    expect(k.G.entityRoot.children.filter((c) => c.name === 'dropped').length).toBe(0); // bireysel grup yok
    const vis = batchMeshes().filter((m) => m.visible);
    expect(vis.length).toBeGreaterThan(0);
    expect(vis.every((m) => m.isInstancedMesh && m.count === 1)).toBe(true);
    k.G.em.items.clear();
    k.frame(1 / 60, 1);
    expect(impl(k).drops.count).toBe(0);
    expect(batchMeshes().filter((m) => m.visible).length).toBe(0);
  });

  it('toplu çizilemeyen eşya (model düzeyi animasyonlu) bireysel grup olarak çizilir ve alınınca havuza döner', () => {
    const k = makeMobsG({ render: true });
    const key = 'item:asa_ates'; // büyü asası: model.userData.update var
    k.G.em.spawnItem(key, 1, 8.5, 42, 3, { vy: 0, delay: 99 });
    k.frame(1 / 60, 1);
    expect(impl(k).drops.count).toBe(1);
    expect(impl(k).drops.stats.batched).toBe(0);
    expect(k.G.entityRoot.children.filter((c) => c.name === 'dropped' && c.visible).length).toBe(1);
    k.G.em.items.clear();
    k.frame(1 / 60, 1);
    expect(impl(k).drops.count).toBe(0);
    k.G.em.spawnItem(key, 1, 8.5, 42, 3, { vy: 0, delay: 99 });
    k.frame(1 / 60, 1);
    expect(impl(k).drops.stats.reused).toBe(1);
  });

  it('çok eşya varken yalnızca en yakın kademe sınırı kadarı çizilir (toplu örnek sayısı)', () => {
    const k = makeMobsG({ render: true });
    for (let i = 0; i < 40; i++) {
      k.G.em.spawnItem('item:elmas', 1, 8.5 + (i % 8) * 3 - 10, 41.3, 8.5 - 8 - Math.floor(i / 8) * 3, { vy: 0, delay: 99, life: 999 });
    }
    for (let i = 0; i < 4; i++) k.frame(0.5, 1);
    const shown = impl(k).drops.stats.batched;
    expect(impl(k).drops.count).toBe(40);
    expect(shown).toBeGreaterThanOrEqual(18);
    expect(shown).toBeLessThanOrEqual(26); // 18 + yakın (6 blok) olanlar
    // çizim çağrısı: örnek sayısından bağımsız (aynı eşya → aynı (geometri, malzeme) çiftleri)
    const calls = k.G.entityRoot.children.filter((c) => c.name === 'drop-batch' && c.visible).length;
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(shown / 2);
  });

  it('em eşya toplama: envantere girer ve blocks olmasa bile çift olay yayılmaz', () => {
    const k = makeMobsG({});
    k.G.em.spawnItem('item:elma', 2, 8.5, 41, 8.5, { vy: 0, delay: 0 });
    k.step(30, {});
    expect(k.G.inventory.count('item:elma')).toBe(2);
    expect(k.G.events.filter((e) => e.type === 'itemPickup')).toHaveLength(1);
    expect(k.G.events.some((e) => e.type === 'itemPickedUp')).toBe(false);
  });

  it('mermiler: ok görünümü + saplanma; ışın flaşı yuvası', () => {
    const k = makeMobsG({ render: true });
    k.G.em.fireProjectile('ok', 8.5, 42.6, 6, 0, 0, -1, 20, 'player', { damage: 3 });
    k.frame(1 / 60, 0.5);
    expect(impl(k).shots.stats.projectiles).toBe(1);
    const grp = group(k, 'mermiler');
    expect(grp.children.some((c) => c.visible && c.position.z < 6)).toBe(true);
    k.G.em.projectiles.length = 0;
    k.frame(1 / 60, 1);
    expect(impl(k).shots.stats.projectiles).toBe(0);
    impl(k).shots.flash(0, 42, 0, 0, 42, -10, 0x7fe9ff, 0.04, 0.1);
    k.frame(0.02, 1);
    expect(impl(k).shots.stats.flashes).toBe(1);
    k.frame(0.2, 1);
    expect(impl(k).shots.stats.flashes).toBe(0);
  });

  it('tehlike işareti ve hasar sayısı görünür', () => {
    const k = makeMobsG({ render: true });
    const m = k.mobAt(8, 'golge');
    k.G.em.addHazard({
      shape: 'circle', x: 8.5, y: 41, z: 4, r: 2, windup: 1, dmg: 3,
    }, m);
    k.G.em.damage(m.id, 3, { kind: 'melee', crit: true });
    k.frame(1 / 60, 1);
    expect(impl(k).tele.stats.active).toBe(1);
    expect(impl(k).floaters.stats.active).toBe(1);
  });
});

describe('boss ve müzik gerilimi', () => {
  it('boss devreye girince HUD, getBossInfo ve combatLevel', () => {
    const k = makeMobsG({});
    const b = k.G.em.spawnBoss('tasbekci', 8.5, 41, 8.5 - 10, { arena: { x: 8.5, z: 8.5, r: 26 } });
    k.step(30, {});
    expect(k.G.hud.boss).toMatchObject({ name: 'Taş Bekçi', maxHp: b.maxHp });
    expect(k.G.hud.boss.phase).toBe(0);
    expect(k.sys.main.api(k.G).getBossInfo()).toMatchObject({ key: 'tasbekci', name: 'Taş Bekçi' });
    expect(k.G.combatLevel).toBeGreaterThan(0.6);
    expect(k.G.speaks.some((t) => /savaş başladı/.test(t))).toBe(true);
    k.G.em.damage(b.id, 99999, { kind: 'melee' });
    k.step(10, {});
    expect(k.G.hud.boss).toBeNull();
    k.step(60 * 8, {});
    expect(k.G.combatLevel).toBeLessThan(0.5);
  });

  it('avlanan düşman sayısı müzik gerilimini yükseltir; oyuncu ölünce sıfırlanır', () => {
    const k = makeMobsG({});
    const e = k.mobAt(8, 'golge');
    e.target = true;
    k.step(40, {});
    expect(k.G.combatLevel).toBeGreaterThan(0.3);
    k.G.player.dead = true;
    k.step(200, {});
    expect(k.G.combatLevel).toBe(0);
  });
});

describe('kamera sarsıntısı', () => {
  it('slam fx yakındayken kamerayı oynatır; kısıtlı harekette oynatmaz; uzakta etkisiz', () => {
    const k = makeMobsG({});
    const base = k.G.camera.position.y;
    k.G.emit({
      type: 'fx', name: 'slam', x: 8.5, y: 41, z: 4, r: 4, id: 0,
    });
    k.frame(0.016, 1);
    expect(k.G.camera.position.y).not.toBe(base);
    const r = makeMobsG({});
    r.G.reducedMotion = true;
    r.G.emit({
      type: 'fx', name: 'slam', x: 8.5, y: 41, z: 4, r: 4, id: 0,
    });
    r.frame(0.016, 1);
    expect(r.G.camera.position.y).toBe(42.62);
    const far = makeMobsG({});
    far.G.emit({
      type: 'fx', name: 'slam', x: 8.5, y: 41, z: -45, r: 4, id: 0,
    });
    far.frame(0.016, 1);
    expect(far.G.camera.position.y).toBe(42.62);
  });
});

describe('kayıt', () => {
  it('serialize/restore: hücre, işaret, kolaylaştırma sayacı', () => {
    const k = makeMobsG({});
    k.G.combat.cells = 4;
    k.G.emit({
      type: 'death', cause: 'yaratık', x: 5, y: 41, z: 6, lostCount: 2, kept: false,
    });
    k.G.emit({ type: 'died' });
    k.G.emit({ type: 'died' });
    const s = k.sys.main.serialize(k.G);
    expect(s).toMatchObject({ v: 1, combat: { cells: 4 }, marker: { x: 5, z: 6 } });
    expect(s.em).toBeUndefined(); // yaratık/eşya kaydı oturum sisteminde
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    const j = makeMobsG({});
    j.sys.main.restore(j.G, s);
    expect(j.G.combat.cells).toBe(4);
    expect(j.sys.main.impl.player.marker).toMatchObject({ x: 5, y: 41, z: 6 });
    expect(j.sys.main.impl.player.assist.deaths).toHaveLength(2);
  });

  it('bozuk kayıt çökmez', () => {
    const k = makeMobsG({});
    expect(() => k.sys.main.restore(k.G, null)).not.toThrow();
    expect(() => k.sys.main.restore(k.G, { combat: { cells: 'x' }, marker: { x: 'a' }, assist: { deaths: 'z' } })).not.toThrow();
    expect(() => k.sys.main.restore(k.G, { combat: { cells: 99 }, assist: { deaths: [1, 'a', NaN, 3] } })).not.toThrow();
    expect(k.G.combat.cells).toBe(6);
    expect(k.sys.main.impl.player.assist.deaths).toEqual([1, 3]);
  });

  it('dispose: görünümler kaldırılır, HUD boss temizlenir', () => {
    const k = makeMobsG({ render: true });
    k.mobAt(5, 'golge');
    k.frame(1 / 60, 1);
    k.G.hud.boss = { name: 'x', hp: 1, maxHp: 1 };
    k.sys.main.dispose(k.G);
    expect(k.G.hud.boss).toBeNull();
    expect(group(k, 'telegraf')).toBeUndefined();
    expect(() => k.sys.main.frameUpdate(k.G, 0.016, 1)).not.toThrow();
  });
});

describe('getMobStats', () => {
  it('sayaçlar tutarlı', () => {
    const k = makeMobsG({ render: true });
    k.mobAt(5, 'golge');
    k.mobAt(6, 'koyun');
    k.frame(1 / 60, 1);
    const st = k.sys.main.api(k.G).getMobStats();
    expect(st.mobs).toBe(2);
    expect(st.hostile).toBe(1);
    expect(st.passive).toBe(1);
    expect(st.views).toBeGreaterThanOrEqual(1);
    expect(st.difficulty).toBe('normal');
  });
});

describe('küçük yardımcılar', () => {
  it('updateEvery, vis01, qualityName', () => {
    expect(updateEvery(10)).toBe(1);
    expect(updateEvery(40)).toBe(2);
    expect(updateEvery(60)).toBe(3);
    for (let i = 0; i < 50; i++) {
      const v = vis01(i, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(vis01(3, 4)).toBe(vis01(3, 4));
    expect(vis01(3, 4)).not.toBe(vis01(4, 3));
    expect(qualityName({ quality: { settings: { tier: 'high', effTier: 'low' } } })).toBe('low');
    expect(qualityName({ quality: { settings: { tier: 'ultra' } } })).toBe('medium');
    expect(qualityName({})).toBe('medium');
  });

  it('yığın ölçeği ve ömür sonu göz kırpma', () => {
    expect(stackScale(1)).toBe(1);
    expect(stackScale(2)).toBeGreaterThan(1);
    expect(stackScale(20)).toBeGreaterThan(stackScale(2));
    expect(stackScale(64)).toBeGreaterThan(stackScale(20));
    expect(blinkVisible(0, 300, 0.1, false)).toBe(true);
    expect(blinkVisible(295, 300, 0.0, false)).toBe(true);
    expect(blinkVisible(295, 300, 0.3, false)).toBe(false);
    expect(blinkVisible(295, 300, 0.3, true)).toBe(true);
  });
});
