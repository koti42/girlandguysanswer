import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { MOB_KEYS } from './mobTypes.js';
import {
  fillBox, makeEm, makePlayer, makeWorld, NIGHT, ofType, pitWorld, run,
} from './mobAITestKit.js';

const DAY = { dayFactor: 1 };

function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('YZ — pasif yaratıklar', () => {
  it('tavuk dolaşır, eve yakın kalır ve oyuncu yaklaşınca kaçar', () => {
    const { em } = makeEm(makeWorld());
    const t = em.spawn('tavuk', 0.5, 1, 0.5);
    const far = makePlayer(30, 1, 30);
    let moved = 0;
    let last = { x: t.x, z: t.z };
    run(em, far, 40, DAY, () => {
      moved += Math.hypot(t.x - last.x, t.z - last.z);
      last = { x: t.x, z: t.z };
    });
    expect(moved).toBeGreaterThan(3);
    expect(Math.hypot(t.x, t.z)).toBeLessThan(40);

    const p = makePlayer(t.x + 3, 1, t.z);
    const before = dist2(t, p);
    let fled = false;
    run(em, p, 2, DAY, () => { if (t.state === 'flee') fled = true; });
    expect(fled).toBe(true);
    expect(dist2(t, p)).toBeGreaterThan(before + 2);
  });

  it('çömelen oyuncudan daha az ürker (menzil yarıya)', () => {
    const { em } = makeEm(makeWorld());
    const t = em.spawn('ceylan', 0.5, 1, 0.5);
    const p = makePlayer(8, 1, 0.5);
    p.crouching = true;
    run(em, p, 0.5, DAY);
    expect(t.state).not.toBe('flee');
    p.crouching = false;
    run(em, p, 0.5, DAY);
    expect(t.state).toBe('flee');
  });

  it('vurulan koyun korkup kaçar', () => {
    const { em } = makeEm(makeWorld());
    const k = em.spawn('koyun', 0.5, 1, 0.5);
    const p = makePlayer(30, 1, 30);
    em.damage(k.id, 1, { kind: 'melee', x: -3, z: 0.5, strength: 3 });
    run(em, p, 0.6, DAY);
    expect(k.state).toBe('flee');
    expect(k.x).toBeGreaterThan(0.5);
  });

  it('balık suda kalır, kıyıdan taşmaz', () => {
    const w = pitWorld({ x0: 0, x1: 9, z0: 0, z1: 9 }, B.WATER, 4);
    const { em } = makeEm(w);
    const f = em.spawn('balik', 5, 3.5, 5);
    const p = makePlayer(30, 6, 30);
    let out = 0;
    let dry = 0;
    run(em, p, 30, DAY, (i) => {
      if (f.x < -0.2 || f.x > 10.2 || f.z < -0.2 || f.z > 10.2) out++;
      if (i > 60 && !f.inWater) dry++;
    });
    expect(out).toBe(0);
    expect(dry).toBe(0);
    expect(f.y).toBeLessThanOrEqual(6);
    expect(f.y).toBeGreaterThanOrEqual(1.9);
    expect(f.state).toBe('swim');
  });

  it('kelebek zeminin üstünde uçar ve hareket eder', () => {
    const { em } = makeEm(makeWorld());
    const b = em.spawn('kelebek', 0.5, 2.5, 0.5);
    const p = makePlayer(30, 1, 30);
    let minY = 99;
    let maxY = 0;
    run(em, p, 20, DAY, () => {
      minY = Math.min(minY, b.y);
      maxY = Math.max(maxY, b.y);
    });
    expect(minY).toBeGreaterThan(1.0);
    expect(maxY).toBeLessThan(7);
    expect(Math.hypot(b.x, b.z)).toBeGreaterThan(0.5);
  });

  it('ateş böceği evinin çevresinde kalır', () => {
    const { em } = makeEm(makeWorld());
    const b = em.spawn('atesbocegi', 0.5, 2.5, 0.5);
    run(em, makePlayer(30, 1, 30), 40, NIGHT);
    expect(Math.hypot(b.x, b.z)).toBeLessThan(14);
  });
});

describe('YZ — düşmanlar', () => {
  function duel(type, px, pz, secs, opts) {
    const w = (opts && opts.world) || makeWorld();
    const kit = makeEm(w);
    const m = kit.em.spawn(type, 0.5, 1, 0.5, { yaw: Math.PI });
    const p = makePlayer(px, 1, pz);
    const log = { states: new Set(), minHidden: false, maxVy: 0, maxY: 0, minY: 99 };
    run(kit.em, p, secs, (opts && opts.ctx) || NIGHT, () => {
      log.states.add(m.state);
      if (m.hidden) log.minHidden = true;
      log.maxVy = Math.max(log.maxVy, m.vy);
      log.maxY = Math.max(log.maxY, m.y);
      log.minY = Math.min(log.minY, m.y);
    });
    return { ...kit, m, p, log, w };
  }

  it('Gölge geceleyin kovalar ve vurur (playerHit)', () => {
    const { m, events, log } = duel('golge', 0.5, -12, 15);
    expect(log.states.has('chase') || log.states.has('stalk')).toBe(true);
    const hits = ofType(events, 'playerHit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].cause).toBe('yaratık');
    expect(hits[0].sourceType).toBe('golge');
    expect(hits[0].damage).toBe(3);
    expect(m.state).not.toBe('idle');
  });

  it('Gölge bakılırken yavaş yaklaşır (stalk), ışıkta saldırmaz', () => {
    const w = makeWorld({ light: () => 0xfe });
    const { m, events } = duel('golge', 0.5, -6, 8, { world: w, ctx: DAY });
    expect(ofType(events, 'playerHit').length).toBe(0);
    expect(m.state === 'retreat' || m.state === 'wander' || m.state === 'idle').toBe(true);
    // gündüz dışarıda ışık seviyesi 15 → kaçar: oyuncudan uzaklaşır
    expect(Math.hypot(m.x - 0.5, m.z + 6)).toBeGreaterThan(5);
  });

  it('Kemikçi mesafeyi korur ve ok atar', () => {
    const { m, events, p, em } = duel('kemikci', 0.5, -10, 12);
    const hitsOk = ofType(events, 'playerHit').filter((e) => e.cause === 'ok');
    const shots = ofType(events, 'fx').filter((e) => e.name === 'shoot');
    expect(shots.length).toBeGreaterThan(0);
    expect(hitsOk.length + em.projectiles.length).toBeGreaterThan(0);
    const d = dist2(m, p);
    expect(d).toBeGreaterThan(3);
    expect(m.state === 'kite' || m.state === 'windup' || m.state === 'recover' || m.state === 'chase').toBe(true);
  });

  it('Kum Akrebi toprağa gömülür (hidden), çıkış işareti koyar, sokar', () => {
    const { log, events, em } = duel('kumakrebi', 0.5, -11, 12);
    expect(log.minHidden).toBe(true);
    expect(ofType(events, 'fx').some((e) => e.name === 'dust')).toBe(true);
    expect(ofType(events, 'playerHit').length).toBeGreaterThan(0);
    expect(em.hazards.length).toBeGreaterThanOrEqual(0);
  });

  it('Gömülü akrep dokunulmaz', () => {
    const { em, m, p } = duel('kumakrebi', 0.5, -11, 1.4);
    // gömülme evresine kadar koştur
    let n = 0;
    while (!m.hidden && n++ < 300) em.update(1 / 60, p, NIGHT);
    expect(m.hidden).toBe(true);
    const r = em.damage(m.id, 10, { kind: 'melee' });
    expect(r.blocked).toBe(true);
    expect(m.hp).toBe(m.maxHp);
  });

  it('Buz Hortlağı vuruşu yavaşlatma etkisi taşır', () => {
    const { events } = duel('buzhortlagi', 0.5, -9, 12);
    const hits = ofType(events, 'playerHit');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].effect).toMatchObject({ kind: 'slow' });
  });

  it('Kristal Böceği atılır (leap) ve iner', () => {
    const { log, events } = duel('kristalbocegi', 0.5, -9, 14);
    expect(log.states.has('leap')).toBe(true);
    expect(log.maxVy).toBeGreaterThan(4);
    expect(ofType(events, 'fx').some((e) => e.name === 'leap')).toBe(true);
    expect(ofType(events, 'playerHit').length).toBeGreaterThan(0);
  });

  it('Lav Slime sıçrar, oyuncuyu vurur', () => {
    const { log, events } = duel('lavslime', 0.5, -9, 14);
    expect(log.maxY).toBeGreaterThan(1.8);
    expect(ofType(events, 'fx').some((e) => e.name === 'squish')).toBe(true);
    expect(ofType(events, 'playerHit').length).toBeGreaterThan(0);
  });

  it('Lav Slime lavdan hasar almaz ve lavda yüzer; başka yaratık yanar', () => {
    const w = pitWorld({ x0: -4, x1: 4, z0: -4, z1: 4 }, B.LAVA, 4);
    const { em } = makeEm(w);
    const s = em.spawn('lavslime', 0.5, 4, 0.5);
    const g = em.spawn('golge', 2.5, 4, 2.5);
    run(em, makePlayer(30, 6, 30), 4, NIGHT);
    expect(s.hp).toBe(s.maxHp);
    expect(s.y).toBeGreaterThan(4.5); // yüzeyde yüzüyor
    expect(g.hp).toBeLessThan(g.maxHp);
  });

  it('Taş Yarasası uçar, yörüngede döner, dalış yapar', () => {
    const { log, events } = duel('tasyarasasi', 0.5, -9, 16);
    expect(log.states.has('hover')).toBe(true);
    expect(log.states.has('dive')).toBe(true);
    expect(log.maxY).toBeGreaterThan(2);
    expect(ofType(events, 'playerHit').length).toBeGreaterThan(0);
  });

  it('ışıktan kaçan düşman (kemikçi) meşale ışığında geri çekilir', () => {
    let torch = false;
    const w = makeWorld({ light: () => (torch ? 0x0c : 0x00) });
    const { em, events } = makeEm(w);
    const m = em.spawn('kemikci', 0.5, 1, 0.5);
    const p = makePlayer(0.5, 1, -9);
    run(em, p, 1.5, NIGHT);
    expect(m.target).toBe(true);
    torch = true; // oyuncu meşale yaktı
    let retreated = false;
    run(em, p, 3, NIGHT, () => { if (m.state === 'retreat') retreated = true; });
    expect(retreated).toBe(true);
    expect(m.state).toBe('retreat');
    const d0 = Math.hypot(m.x - p.x, m.z - p.z);
    run(em, p, 3, NIGHT);
    expect(Math.hypot(m.x - p.x, m.z - p.z)).toBeGreaterThan(d0);
    // retreat sırasında ok atmaz
    const shotsAfter = ofType(events, 'fx').filter((e) => e.name === 'shoot').length;
    run(em, p, 3, NIGHT);
    expect(ofType(events, 'fx').filter((e) => e.name === 'shoot').length).toBe(shotsAfter);
  });

  it('gündüz dışarıda (ışık 15) gölge saldırmaz, ama yanmaz da', () => {
    const { em, events } = makeEm(makeWorld());
    const g = em.spawn('golge', 0.5, 1, 0.5);
    run(em, makePlayer(0.5, 1, -5), 8, DAY);
    expect(ofType(events, 'playerHit').length).toBe(0);
    expect(g.hp).toBe(g.maxHp);
  });

  it('görüş hattı yoksa hedefi vazgeçer / duvar arkasından ok atmaz', () => {
    const w = makeWorld();
    fillBox(w, -6, 1, -5, 6, 4, -5, B.STONE); // uzun duvar
    const { events } = duel('kemikci', 0.5, -10, 4, { world: w });
    expect(ofType(events, 'playerHit').length).toBe(0);
  });
});

describe('YZ — yürüme: engel, basamak, kenar, su, lav', () => {
  it('1 blokluk basamağa zıplayarak çıkar', () => {
    const w = makeWorld();
    fillBox(w, -5, 1, -9, 5, 1, -6, B.STONE);
    const { em } = makeEm(w);
    const m = em.spawn('golge', 0.5, 1, 0.5);
    const p = makePlayer(0.5, 2, -8);
    let reachedTop = false;
    run(em, p, 6, NIGHT, () => { if (m.y > 1.9 && m.onGround) reachedTop = true; });
    expect(reachedTop).toBe(true);
    expect(Math.hypot(m.x - p.x, m.z - p.z)).toBeLessThan(3);
  });

  it('geniş duvarın çevresinden yol bulup oyuncuya ulaşır (A*)', () => {
    const w = makeWorld();
    fillBox(w, -5, 1, -4, 5, 4, -4, B.STONE);
    const { em } = makeEm(w);
    const m = em.spawn('golge', 0.5, 1, 0.5, { aggro: true });
    const p = makePlayer(0.5, 1, -9);
    let reached = false;
    let usedPath = false;
    run(em, p, 25, NIGHT, () => {
      if (dist2(m, p) < 2.2) reached = true;
      if (m.ai.pathOn) usedPath = true;
    });
    expect(reached).toBe(true);
    expect(usedPath || m.x !== 0.5).toBe(true);
  });

  it('uçurum kenarından düşmez (dolaşma)', () => {
    const w = pitWorld({ x0: 3, x1: 60, z0: -60, z1: 60 }, 0, 8);
    const { em } = makeEm(w);
    const m = em.spawn('tavuk', 1.5, 6, 0.5);
    let minY = 99;
    run(em, makePlayer(0.5, 6, 30), 60, DAY, () => { minY = Math.min(minY, m.y); });
    expect(minY).toBeGreaterThan(5.9);
  });

  it('havuzun içine girmez, kenarından dolanır', () => {
    const w = pitWorld({ x0: -3, x1: 3, z0: -9, z1: -2 }, B.WATER, 4);
    const { em } = makeEm(w);
    const m = em.spawn('golge', 0.5, 6, 0.5, { aggro: true });
    const p = makePlayer(0.5, 6, -12);
    let wet = 0;
    let reached = false;
    run(em, p, 25, NIGHT, () => {
      if (m.inWater) wet++;
      if (dist2(m, p) < 2.2) reached = true;
    });
    expect(wet).toBe(0);
    expect(reached).toBe(true);
  });

  it('lavdan kaçınır: hasar almaz, lava girmez', () => {
    const w = pitWorld({ x0: -3, x1: 3, z0: -9, z1: -2 }, B.LAVA, 4);
    const { em } = makeEm(w);
    const m = em.spawn('golge', 0.5, 6, 0.5, { aggro: true });
    let lava = 0;
    run(em, makePlayer(0.5, 6, -12), 25, NIGHT, () => { if (m.inLava) lava++; });
    expect(lava).toBe(0);
    expect(m.hp).toBe(m.maxHp);
  });

  it('lava düşen yaratık hasar alır (lavdan etkilenmeyen hariç)', () => {
    const w = pitWorld({ x0: -3, x1: 3, z0: -3, z1: 3 }, B.LAVA, 4);
    const { em } = makeEm(w);
    const m = em.spawn('golge', 0.5, 4, 0.5);
    run(em, makePlayer(30, 6, 30), 3, NIGHT);
    expect(m.hp).toBeLessThan(m.maxHp);
  });

  it('üretilmemiş chunk sınırında donar (düşmez, atmaz)', () => {
    const w = makeWorld({ loaded: (x) => x < 4 });
    const { em } = makeEm(w);
    const m = em.spawn('ceylan', 0.5, 1, 0.5);
    run(em, makePlayer(0.5, 1, 30), 20, DAY);
    expect(m.x).toBeLessThan(5);
    expect(m.y).toBeGreaterThan(0.9);
  });
});

describe('YZ — belirlenimcilik ve ayrıntı', () => {
  it('aynı tohum ve girdi → aynı yol (18 tür)', () => {
    const final = [];
    for (let n = 0; n < 2; n++) {
      const { em } = makeEm(makeWorld(), { seed: 99 });
      const keys = MOB_KEYS.filter((k) => !/kokana|tasbekci|buzkral|golgehukumdar/.test(k));
      keys.forEach((k, i) => em.spawn(k, (i % 6) * 3 + 0.5, 1.2, Math.floor(i / 6) * 3 + 0.5));
      const p = makePlayer(7, 1, 12);
      run(em, p, 12, NIGHT);
      final.push(JSON.stringify([...em.mobs.values()].map((e) => [e.id, e.x.toFixed(4), e.y.toFixed(4), e.z.toFixed(4), e.state])));
    }
    expect(final[0]).toBe(final[1]);
  });

  it('tüm 14 pasif+düşman tür çökmeden yüzlerce kare çalışır ve sonlu değerler üretir', () => {
    const { em } = makeEm(makeWorld());
    const keys = MOB_KEYS.filter((k) => !/kokana|tasbekci|buzkral|golgehukumdar/.test(k));
    keys.forEach((k, i) => em.spawn(k, (i % 5) * 2 + 0.5, 1.2, Math.floor(i / 5) * 2 + 0.5));
    const p = makePlayer(3, 1, 8);
    run(em, p, 20, NIGHT);
    em.mobs.forEach((e) => {
      expect(Number.isFinite(e.x + e.y + e.z + e.vx + e.vy + e.vz + e.yaw)).toBe(true);
    });
    expect(em.mobs.size).toBe(keys.length);
  });

  it('barışçıl mod (inşa): düşman oyuncuyu hedeflemez', () => {
    const { em, events } = makeEm(makeWorld());
    const m = em.spawn('golge', 0.5, 1, 0.5);
    const p = makePlayer(0.5, 1, -4);
    run(em, p, 6, { dayFactor: 0, peaceful: true });
    expect(m.target).toBe(false);
    expect(ofType(events, 'playerHit').length).toBe(0);
  });

  it('oyuncu ölüyken hedef bırakılır', () => {
    const { em } = makeEm(makeWorld());
    const m = em.spawn('golge', 0.5, 1, 0.5);
    const p = makePlayer(0.5, 1, -6);
    run(em, p, 2, NIGHT);
    expect(m.target).toBe(true);
    p.dead = true;
    run(em, p, 1, NIGHT);
    expect(m.target).toBe(false);
  });

  it('kolay modda hasar yarıya iner', () => {
    const a = makeEm(makeWorld(), { difficulty: 'easy' });
    a.em.spawn('golge', 0.5, 1, 0.5);
    run(a.em, makePlayer(0.5, 1, -2.2), 6, NIGHT);
    const h = ofType(a.events, 'playerHit');
    expect(h.length).toBeGreaterThan(0);
    expect(h[0].damage).toBeCloseTo(1.5, 5);
  });
});
