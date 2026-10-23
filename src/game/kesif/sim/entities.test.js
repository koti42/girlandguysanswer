import { describe, expect, it } from 'vitest';
import { EntityManager, toModelState } from './entities.js';
import {
  fillBox, makeEm, makePlayer, makeWorld, ofType, run,
} from './mobAITestKit.js';
import { B } from './blocks.js';

describe('EntityManager — doğma ve kimlik', () => {
  it('kimlikler sayaçla artar, bilinmeyen tür null', () => {
    const { em } = makeEm(makeWorld());
    const a = em.spawn('tavuk', 0, 1, 0);
    const b = em.spawn('golge', 5, 1, 5);
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(em.spawn('yok_boyle_bir_sey', 0, 1, 0)).toBeNull();
    expect(em.spawn('golgehukumdari', 0, 1, 0).key).toBe('golgehukumdar');
  });

  it('render sözleşmesi alanları vardır', () => {
    const { em } = makeEm(makeWorld());
    const e = em.spawn('koyun', 3, 1, 3);
    for (const k of ['id', 'type', 'x', 'y', 'z', 'yaw', 'vx', 'vy', 'vz', 'hp', 'maxHp', 'state', 'phase', 'attacking', 'hurt', 'dead', 'deadT', 'aim', 'fx']) {
      expect(k in e).toBe(true);
    }
    expect(Array.isArray(e.fx)).toBe(true);
    const ms = toModelState(e);
    expect(ms).toMatchObject({ speed: 0, attacking: false, hurt: false, dead: false, phase: 0, aim: null });
  });

  it('zorluk: kolay can ve hasar ölçeği', () => {
    const { em } = makeEm(makeWorld(), { difficulty: 'easy' });
    const g = em.spawn('golge', 0, 1, 0);
    expect(g.maxHp).toBe(16);
    expect(em.dmgMul).toBe(0.5);
  });
});

describe('EntityManager — hasar, ölüm, ganimet', () => {
  it('hasar can düşürür, geri tepme verir, mobHurt yayar', () => {
    const w = makeWorld();
    const { em, events } = makeEm(w);
    const g = em.spawn('golge', 0, 1, 0);
    const r = em.damage(g.id, 5, { kind: 'melee', x: -2, z: 0, strength: 6 });
    expect(r.dealt).toBe(5);
    expect(g.hp).toBe(15);
    expect(g.vx).toBeGreaterThan(0);
    expect(g.hurt).toBe(true);
    expect(ofType(events, 'mobHurt').length).toBe(1);
    expect(em.numbers.list.length).toBe(1);
  });

  it('ölüm: mobKilled + ganimet düşer + parçalanıp kaybolur', () => {
    const w = makeWorld();
    const { em, events } = makeEm(w);
    const k = em.spawn('koyun', 0, 1, 0);
    const r = em.damage(k.id, 999, { kind: 'melee', x: 0, z: -1, strength: 0 });
    expect(r.killed).toBe(true);
    expect(k.dead).toBe(true);
    expect(k.state).toBe('dead');
    const killed = ofType(events, 'mobKilled')[0];
    expect(killed.mob).toBe('koyun');
    expect(killed.xp).toBe(2);
    expect(killed.loot.length).toBeGreaterThan(0);
    expect(em.items.size).toBeGreaterThan(0);
    // ölü hasar almaz
    expect(em.damage(k.id, 5)).toBeNull();
    run(em, makePlayer(20, 1, 20), 1.6);
    expect(em.mobs.has(k.id)).toBe(false);
  });

  it('ganimet belirlenimci: aynı tohum+kimlik → aynı ganimet', () => {
    const loots = [];
    for (let n = 0; n < 2; n++) {
      const { em, events } = makeEm(makeWorld(), { seed: 777 });
      for (let i = 0; i < 6; i++) em.spawn('kemikci', i * 3, 1, 0);
      em.mobs.forEach((e) => em.damage(e.id, 999));
      loots.push(JSON.stringify(ofType(events, 'mobKilled').map((e) => e.loot)));
    }
    expect(loots[0]).toBe(loots[1]);
  });

  it('düşman yaratığın ışıkta/gündüz yanması yoktur', () => {
    const w = makeWorld();
    const { em } = makeEm(w);
    const g = em.spawn('golge', 0, 1, 0);
    run(em, makePlayer(100, 1, 100), 10, { dayFactor: 1 });
    expect(g.hp).toBe(g.maxHp);
  });
});

describe('EntityManager — yerdeki eşyalar', () => {
  it('düşer, birleşir, oyuncuya doğru çekilir ve toplanır', () => {
    const w = makeWorld();
    const { em, events } = makeEm(w);
    em.spawnItem('item:kömür', 3, 6, 4, 0, { delay: 0 });
    em.spawnItem('item:kömür', 2, 6.2, 4, 0.1, { delay: 0 });
    const p = makePlayer(0, 1, 0);
    const bag = {};
    run(em, p, 1.5, { pickup: (item, n) => { bag[item] = (bag[item] || 0) + n; return 0; } });
    // birleşme: 5 adet tek yığın (henüz çok uzak)
    expect(em.items.size).toBe(1);
    expect([...em.items.values()][0].count).toBe(5);
    p.x = 4.5; // mıknatıs menziline gir
    run(em, p, 3, { pickup: (item, n) => { bag[item] = (bag[item] || 0) + n; return 0; } });
    expect(bag['item:kömür']).toBe(5);
    expect(em.items.size).toBe(0);
    expect(ofType(events, 'itemPickup').length).toBe(1);
  });

  it('envanter doluysa (kalan>0) eşya yerde kalır', () => {
    const { em } = makeEm(makeWorld());
    em.spawnItem('item:elma', 4, 0.2, 1, 0, { delay: 0 });
    run(em, makePlayer(0, 1, 0), 1, { pickup: (item, n) => n });
    expect(em.items.size).toBe(1);
  });

  it('5 dk sonra kaybolur, lavda yanar, yığın üst sınırı aşılmaz', () => {
    const w = makeWorld();
    const { em } = makeEm(w);
    em.spawnItem('item:kömür', 1, 30, 1, 30, { delay: 0, life: 2 });
    run(em, makePlayer(90, 1, 90), 2.2);
    expect(em.items.size).toBe(0);

    em.spawnItem('item:elma', 30, 10, 1, 10, { delay: 0 });
    em.spawnItem('item:elma', 30, 10.1, 1, 10, { delay: 0 });
    run(em, makePlayer(90, 1, 90), 1.5);
    // 32 yığın sınırı: birleşmez
    expect(em.items.size).toBe(2);

    fillBox(w, 40, 0, 40, 42, 0, 42, B.LAVA);
    em.spawnItem('item:kömür', 1, 41, 3, 41, { delay: 0 });
    run(em, makePlayer(90, 1, 90), 2);
    expect([...em.items.values()].some((e) => e.x > 39 && e.x < 43)).toBe(false);
  });

  it('dayanıklılıklı eşya (dur) birleşmez ve dur korunur', () => {
    const { em } = makeEm(makeWorld());
    em.spawnItem('item:kılıç_demir', 1, 5, 1, 5, { delay: 0, dur: 100 });
    em.spawnItem('item:kılıç_demir', 1, 5.1, 1, 5, { delay: 0, dur: 120 });
    run(em, makePlayer(90, 1, 90), 1.5);
    expect(em.items.size).toBe(2);
  });
});

describe('EntityManager — serileştirme', () => {
  it('gidiş-dönüş: yaratıklar, eşyalar, sayaç ve rng durumu', () => {
    const w = makeWorld();
    const a = makeEm(w, { seed: 5 });
    const g = a.em.spawn('golge', 4, 1, 4, { persistent: true });
    a.em.damage(g.id, 6);
    a.em.spawn('tavuk', 8, 1, 8);
    a.em.spawnBoss('kokana', 20, 1, 20);
    a.em.spawnItem('item:kemik', 2, 3, 1, 3, { delay: 0 });
    a.em.populated.add('3,4');
    run(a.em, makePlayer(60, 1, 60), 0.5);
    const data = JSON.parse(JSON.stringify(a.em.serialize()));

    const b = makeEm(w, { seed: 5 });
    b.em.restore(data);
    expect(b.em.mobs.size).toBe(3);
    const g2 = b.em.get(g.id);
    expect(g2.hp).toBe(g.hp);
    expect(g2.persistent).toBe(true);
    expect(b.em.items.size).toBe(1);
    expect(b.em.nextId).toBe(a.em.nextId);
    expect(b.em.populated.has('3,4')).toBe(true);
    const boss = [...b.em.mobs.values()].find((e) => e.key === 'kokana');
    expect(boss.arena.r).toBe(22);
    // arena: ctx.arenas ile benimsenir
    const b2 = makeEm(w);
    const bs = b2.em.spawnBoss('tasbekci', 10, 1, 10);
    expect(bs.arena.r).toBe(24);
    run(b2.em, makePlayer(200, 1, 200), 0.1, { arenas: [{ x: 12, z: 11, r: 30 }] });
    expect(bs.arena).toEqual({ x: 12, z: 11, r: 30 });
    // yeni doğan kimlik çakışmaz
    const n = b.em.spawn('koyun', 0, 1, 0);
    expect(b.em.mobs.has(n.id)).toBe(true);
    expect(n.id).toBeGreaterThanOrEqual(data.nextId);
  });

  it('bozuk veriyle restore atmaz', () => {
    const { em } = makeEm(makeWorld());
    expect(() => em.restore(null)).not.toThrow();
    expect(() => em.restore({ mobs: [null, { type: 'x' }, { type: 'tavuk', x: 'a' }], items: [1, {}] })).not.toThrow();
    expect(em.mobs.size).toBe(0);
  });
});

describe('EntityManager — sorgu ve kaldırma', () => {
  it('uzamsal karma yarıçap sorgusu', () => {
    const { em } = makeEm(makeWorld());
    em.spawn('tavuk', 0, 1, 0);
    em.spawn('tavuk', 30, 1, 0);
    run(em, makePlayer(0, 1, 0), 0.05);
    expect(em.queryMobs(0, 0, 5).length).toBe(1);
    expect(em.queryMobs(15, 0, 20).length).toBe(2);
  });

  it('despawn kimliği siler; sayaçlar minyon/boss hariç sayar', () => {
    const { em } = makeEm(makeWorld());
    const a = em.spawn('tavuk', 0, 1, 0);
    em.spawn('golge', 5, 1, 0);
    em.spawn('golge', 6, 1, 0, { minion: true, owner: 99 });
    expect(em.counts()).toEqual({ hostile: 1, passive: 1, total: 2 });
    em.despawn(a.id);
    expect(em.get(a.id)).toBeNull();
  });
});

describe('EntityManager — bağımsız olay yayıcı', () => {
  it('emit verilmezse olaylar kuyruğa yazılır', () => {
    const em = new EntityManager({ seed: 1, world: makeWorld() });
    const g = em.spawn('golge', 0, 1, 0);
    em.damage(g.id, 3);
    const ev = em.drainEvents();
    expect(ev.some((e) => e.type === 'mobHurt')).toBe(true);
    expect(em.drainEvents().length).toBe(0);
  });
});

describe('EntityManager — yardımcılar', () => {
  it('pickMob: ışın doğrultusundaki en yakın canlı yaratığı verir', () => {
    const { em } = makeEm(makeWorld());
    const a = em.spawn('golge', 0, 1, -4);
    em.spawn('golge', 0, 1, -8);
    const dead = em.spawn('golge', 0, 1, -2);
    em.update(0.001, makePlayer(0, 1, 0), { dayFactor: 0 });
    em.damage(dead.id, 999);
    em.update(0.001, makePlayer(0, 1, 0), { dayFactor: 0 });
    const hit = em.pickMob(0, 2, 0, 0, 0, -1, 20);
    expect(hit.entity.id).toBe(a.id);
    expect(em.pickMob(0, 2, 0, 1, 0, 0, 20)).toBeNull();
  });

  it('sıvıda doğan balık hemen yüzer (düşmez)', () => {
    const w = makeWorld({
      fill: (x, y, z) => {
        if (x >= 0 && x <= 9 && z >= 0 && z <= 9) return y <= 1 ? B.STONE : y <= 5 ? B.WATER : 0;
        return y <= 5 ? B.STONE : 0;
      },
    });
    const { em } = makeEm(w);
    const f = em.spawn('balik', 5, 4, 5);
    expect(f.inWater).toBe(true);
    run(em, makePlayer(40, 6, 40), 2, { dayFactor: 1 });
    expect(f.state).toBe('swim');
    expect(f.y).toBeGreaterThan(2);
  });

  it('sıfır hasarlı yavaşlatma alanı playerEffect yayar', () => {
    const { em, events } = makeEm(makeWorld());
    const p = makePlayer(0, 1, 0);
    const owner = em.spawn('golge', 20, 1, 20);
    em.addHazard({
      shape: 'zone', x: 0, y: 1, z: 0, r: 3, windup: 0.1, active: 2, dmg: 0, tick: 0.5, effect: { kind: 'slow', t: 1, factor: 0.5 },
    }, owner);
    run(em, p, 1, { dayFactor: 1 });
    const e = ofType(events, 'playerEffect');
    expect(e.length).toBeGreaterThan(0);
    expect(e[0]).toMatchObject({ effect: 'slow', factor: 0.5 });
  });

  it('tehlike sahibi ölünce işaretler temizlenir', () => {
    const { em } = makeEm(makeWorld());
    const owner = em.spawn('golge', 20, 1, 20);
    const h = em.addHazard({ shape: 'circle', x: 0, y: 1, z: 0, r: 2, windup: 5, dmg: 3 }, owner);
    expect(owner.fx).toContain(h);
    em.damage(owner.id, 999);
    expect(owner.fx.length).toBe(0);
    expect(em.hazards.length).toBe(0);
  });
});
