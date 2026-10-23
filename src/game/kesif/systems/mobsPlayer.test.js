import { describe, expect, it } from 'vitest';
import { makeMobsG } from './mobsTestKit.js';

function hit(k, mob, dmg, info) {
  return k.G.em.hurtPlayer(mob, dmg, info);
}

describe('yaratık vuruşu', () => {
  it('can düşer, geri tepme uygulanır, playerHurtBy yayılır', () => {
    const k = makeMobsG({});
    const m = k.mobAt(2, 'golge');
    const hp0 = k.G.survival.hp;
    hit(k, m, 4, {});
    expect(k.G.survival.hp).toBeLessThan(hp0);
    // kaynak −Z'de: oyuncu +Z'ye itilir
    expect(k.G.body.vz).toBeGreaterThan(2);
    expect(k.G.events.some((e) => e.type === 'playerHurtBy' && e.mob === 'golge')).toBe(true);
    expect(k.G.lastHit).toMatchObject({ mob: 'golge' });
  });

  it('kalkan önden gelen hasarı azaltır, ses çalar, geri tepme zayıflar', () => {
    const a = makeMobsG({ held: 'item:kalkan' });
    const ma = a.mobAt(2, 'golge');
    a.step(2, { placeHeld: true });
    expect(a.G.body.blocking).toBe(true);
    hit(a, ma, 6, {});
    const lost = 20 - a.G.survival.hp;
    const b = makeMobsG({});
    hit(b, b.mobAt(2, 'golge'), 6, {});
    const lostNo = 20 - b.G.survival.hp;
    expect(lost).toBeLessThan(lostNo);
    expect(a.G.sounds.some((s) => s[0] === 'block')).toBe(true);
    expect(Math.abs(a.G.body.vz)).toBeLessThan(Math.abs(b.G.body.vz));
    // kalkan aşındı
    expect(a.G.inventory.held().dur).toBeLessThan(336);
  });

  it('kolay modda hasar yok; yumuşak geri itme 0,6 sn aralıkla', () => {
    const k = makeMobsG({ easy: true });
    const m = k.mobAt(2, 'golge');
    hit(k, m, 6, {});
    expect(k.G.survival.hp).toBe(20);
    const vz1 = k.G.body.vz;
    expect(vz1).toBeGreaterThan(0.5);
    k.G.body.vz = 0;
    hit(k, m, 6, {});
    expect(k.G.body.vz).toBe(0); // bekleme içinde
    k.step(50, {});
    hit(k, m, 6, {});
    expect(k.G.body.vz).toBeGreaterThan(0.5);
    expect(k.G.events.some((e) => e.type === 'playerHurtBy')).toBe(false);
  });

  it('ölüyken vuruş işlenmez', () => {
    const k = makeMobsG({});
    const m = k.mobAt(2, 'golge');
    k.G.player.dead = true;
    k.G.body.dead = true;
    expect(hit(k, m, 5, {})).toBe(0);
    expect(k.G.survival.hp).toBe(20);
  });
});

describe('yavaşlatma etkisi', () => {
  it('slow: adım yer değiştirmesi çarpanla ölçeklenir, süre bitince normale döner', () => {
    const k = makeMobsG({});
    k.G.em.emit({ type: 'playerEffect', effect: 'slow', t: 0.5, factor: 0.5 });
    expect(k.G.speaks).toContain('Yavaşladın.');
    k.G._rs.px = 8.5;
    k.G._rs.pz = 8.5;
    k.G.body.x = 9.5;
    k.G.body.z = 8.5;
    k.step(1, {});
    // sistem fixedUpdate afterStep: x = 8.5 + 1*0.5
    expect(k.G.body.x).toBeCloseTo(9.0, 1);
    k.step(40, {});
    expect(k.sys.main.impl.player.status.slowT).toBe(0);
    expect(k.sys.main.impl.player.status.slowF).toBe(1);
    k.G._rs.px = 8.5;
    k.G.body.x = 9.5;
    k.step(1, {});
    expect(k.G.body.x).toBeCloseTo(9.5, 5);
  });

  it('bilinmeyen etki yok sayılır; duvara gömülecek yer değiştirme uygulanmaz', () => {
    const k = makeMobsG({});
    k.G.em.emit({ type: 'playerEffect', effect: 'garip', t: 5, factor: 0.1 });
    expect(k.sys.main.impl.player.status.slowT).toBe(0);
  });

  it('yavaşlatan vuruş etkisi (slow) hasar alınınca uygulanır', () => {
    const k = makeMobsG({});
    const m = k.mobAt(2, 'buzhortlagi');
    hit(k, m, 3, { effect: { kind: 'slow', t: 1.5, factor: 0.7 } });
    expect(k.sys.main.impl.player.status.slowT).toBeGreaterThan(1);
    expect(k.sys.main.impl.player.status.slowF).toBeCloseTo(0.7);
  });
});

describe('ölüm, işaret, yeniden doğuş', () => {
  it('ölüm olayı düşen eşya varsa işaret koyar; eşyalar tutuldu ise koymaz', () => {
    const k = makeMobsG({});
    k.G.emit({
      type: 'death', cause: 'yaratık', x: 5, y: 41, z: 6, lostCount: 12, kept: false,
    });
    expect(k.sys.main.impl.player.marker).toMatchObject({ x: 5, y: 41, z: 6 });
    const j = makeMobsG({});
    j.G.emit({
      type: 'death', cause: 'yaratık', x: 5, y: 41, z: 6, lostCount: 12, kept: true,
    });
    expect(j.sys.main.impl.player.marker).toBeNull();
    const n = makeMobsG({});
    n.G.emit({
      type: 'death', cause: 'yaratık', x: 5, y: 41, z: 6, lostCount: 0, kept: false,
    });
    expect(n.sys.main.impl.player.marker).toBeNull();
  });

  it('işaret eşya kalmayınca kalkar; eşya varken sürer', () => {
    const k = makeMobsG({});
    k.G.emit({
      type: 'death', cause: 'yaratık', x: 5, y: 41, z: 6, lostCount: 3, kept: false,
    });
    k.G.em.spawnItem('item:elma', 1, 5, 41.5, 6, { delay: 99, life: 999, vy: 0 });
    k.step(60 * 20, {});
    expect(k.sys.main.impl.player.marker).not.toBeNull();
    k.G.em.items.clear();
    k.step(60 * 12, {});
    expect(k.sys.main.impl.player.marker).toBeNull();
  });

  it('art arda 3 ölüm → bir süre kolaylaştırma: zorluk easy olur ve duyurulur', () => {
    const k = makeMobsG({});
    k.step(1, {});
    expect(k.G.em.difficulty).toBe('normal');
    k.G.emit({ type: 'died' });
    k.G.emit({ type: 'died' });
    expect(k.G.speaks.some((t) => /kolaylaştırdık/.test(t))).toBe(false);
    k.G.emit({ type: 'died' });
    expect(k.G.speaks.some((t) => /kolaylaştırdık/.test(t))).toBe(true);
    k.step(70, {});
    expect(k.G.em.difficulty).toBe('easy');
    expect(k.sys.main.impl.player.assistActive()).toBe(true);
  });

  it('respawn(): ölü değilken false; ölüyken çekirdeği çağırır, yakın düşman ve mob mermileri temizlenir', () => {
    const k = makeMobsG({});
    const api = k.sys.main.api(k.G);
    expect(api.respawn()).toBe(false);
    const near = k.mobAt(5, 'golge');
    const far = k.G.em.spawn('golge', 8.5, 41, 8.5 - 40, {});
    const boss = k.G.em.spawnBoss('kokana', 8.5, 41, 8.5 - 10, {});
    k.G.em.fireProjectile('ok', 8.5, 42, 5, 0, 0, 1, 10, near, {});
    k.G.player.dead = true;
    k.G.body.dead = true;
    expect(api.respawn()).toBe(true);
    expect(k.G.player.dead).toBe(false);
    expect(k.G.events.some((e) => e.type === 'respawn')).toBe(true);
    expect(near.removed).toBe(true);
    expect(far.removed).toBeFalsy();
    expect(boss.removed).toBeFalsy();
    expect(k.G.em.projectiles).toHaveLength(0);
  });
});
