/*
 * KEŞİF — "qaplay" (macera ilk 30 dk) regresyon testleri: gerçek G benzeri bağlam (render yok).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeTestG } from './sessionTestKit.js';
import { rollLoot, ABILITY_ITEMS } from '../sim/combat.js';
import { seededRandom } from '../sim/rng.js';

// gerçek dünya üreten testler: paralel CPU yükünde varsayılan 20 sn yetmeyebilir (gerçek bir gerileme değil)
vi.setConfig({ testTimeout: 90000 });

function groundCount(G, item) {
  let n = 0;
  G.em.items.forEach((e) => { if (e.item === item) n += e.count; });
  return n;
}

describe('boss ganimeti: yetenek eşyası çift verilmez', () => {
  it('rollLoot opts.abilityItem=false → yetenek eşyası yok; varsayılan hâlâ var', () => {
    const k = 'kokana';
    const item = ABILITY_ITEMS.doubleJump;
    expect(rollLoot(k, seededRandom(3), {}).some((x) => x.item === item)).toBe(true);
    expect(rollLoot(k, seededRandom(3), { abilityItem: false }).some((x) => x.item === item)).toBe(false);
  });

  it('gerçek G: boss ölünce eşya yalnız ilerleme sisteminden gelir (yerde 0, envanterde 1)', () => {
    const G = makeTestG({ mode: 'macera', seed: 'ABCD1234' });
    expect(G.em.abilityLoot).toBe(false);
    const item = ABILITY_ITEMS.doubleJump;
    const b = G.body;
    const boss = G.em.spawn('kokana', b.x + 6, b.y, b.z);
    expect(boss).toBeTruthy();
    const id = typeof boss === 'object' ? boss.id : boss;
    G.em.damage(id, 100000, { kind: 'player' });
    G.em.drainEvents && G.em.drainEvents();
    expect(G.progression.abilities.doubleJump).toBe(true);
    expect(G.inventory.count(item)).toBe(1);
    expect(groundCount(G, item)).toBe(0);
  });

  it('ilerleme etkin değilse (ör. başka mod) eski davranış korunur', () => {
    const G = makeTestG({ mode: 'insa', seed: 'ABCD1234' });
    // insa'da ilerleme etkin değil → boss ganimeti yetenek eşyasını koruyabilir
    expect(G.em.abilityLoot).toBe(!(G.progression && G.progression.active));
  });
});

describe('açılış ipucu: ilk görevin ipucu hazır olunca gösterilir', () => {
  it('yeni oyun → ~3 sn sonra hud.hint ilk görev ipucu (ağaç/kır), 14 sn sonra söner', async () => {
    const { makeContentG } = await import('./contentTestKit.js');
    const kit = makeContentG({ seed: 'ABCD1234', pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    kit.load(0, 0, 3);
    kit.step(60 * 4);
    const q = kit.G.progression.activeQuest();
    expect(q && q.id).toBe('ilk_odun');
    expect(kit.G.hud.hint).toBe(q.hint);
    kit.step(60 * 20);
    expect(kit.G.hud.hint).not.toBe(q.hint);
  });
});

describe('ölüm: yetenek eşyası ruha bağlı (çanta + yeniden doğuş kopyası = çift eşya olmasın)', () => {
  it('yetenek eşyası ölümde yerdeki çantaya düşmez, envanterde kalır; diğer eşyalar düşer', async () => {
    const { createPlayerCore } = await import('../gamePlayer.js');
    const { applyDamage } = await import('../sim/survival.js');
    const G = makeTestG({ mode: 'macera', seed: 'ABCD1234' });
    const item = ABILITY_ITEMS.doubleJump;
    G.survival.easy = false;
    G.inventory.add(item, 1);
    G.inventory.add('blok:taş', 12);
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    applyDamage(G.survival, 1000, { cause: 'genel' });
    core.postSystem.fixedUpdate(G, 1 / 60);
    expect(G.player.dead).toBe(true);
    expect(G.inventory.count(item)).toBe(1);
    expect(groundCount(G, item)).toBe(0);
    expect(G.inventory.count('blok:taş')).toBe(0);
    expect(groundCount(G, 'blok:taş')).toBe(12);
    expect(G.player.deathInfo.lostCount).toBe(12);
  });
});

describe('çanta dolu: yerdeki eşya alınamayınca oyuncuya neden söylenir (sessiz kalmaz)', () => {
  it('dolu çantada G.pickupItem kalanı döner ve 4 sn aralıkla "Çanta dolu" ipucu yazar', async () => {
    const { makeG } = await import('./blocksTestKit.js');
    const g = makeG();
    for (let i = 0; i < 40; i++) g.G.inventory.add('blok:taş', 64);
    g.G.hud.hint = null;
    expect(g.G.pickupItem('blok:taş', 64)).toBe(64);
    expect(g.G.hud.hint).toMatch(/Çanta dolu/);
    g.G.hud.hint = null;
    g.G.time.seconds += 1;
    g.G.pickupItem('blok:taş', 64); // 4 sn dolmadan tekrar yazmaz
    expect(g.G.hud.hint).toBe(null);
    g.G.time.seconds += 5;
    g.G.pickupItem('blok:taş', 64);
    expect(g.G.hud.hint).toMatch(/Çanta dolu/);
  });

  it('yer varsa ipucu yazılmaz', async () => {
    const { makeG } = await import('./blocksTestKit.js');
    const g = makeG();
    g.G.hud.hint = null;
    expect(g.G.pickupItem('blok:taş', 10)).toBe(0);
    expect(g.G.hud.hint).toBe(null);
  });
});

describe('ipucu bağlamı: ağaç tacı yeraltı sayılmaz', () => {
  it('büyük bir ağacın altında (üstte yaprak) underground=false → sahte "çok karanlık" ipucu çıkmaz', async () => {
    const { makeContentG } = await import('./contentTestKit.js');
    const { hintContext } = await import('./contentProgress.js');
    const { B } = await import('../sim/blocks.js');
    const kit = makeContentG({ seed: 'ABCD1234', pos: { x: 0, y: 70, z: 0 } });
    kit.init();
    kit.load(0, 0, 32);
    const w = kit.G.world;
    const gy = w.surfaceY(0, 0, { ignoreFoliage: true });
    kit.tp(0.5, gy + 1, 0.5);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.setBlock(dx, gy + 9, dz, B.LEAVES_OAK);
    expect(w.surfaceY(0, 0)).toBeGreaterThanOrEqual(gy + 9); // yaprak dahil yüzey tacın tepesi
    expect(hintContext(kit.S).underground).toBe(false);
    // gerçek yeraltı hâlâ yeraltı
    kit.tp(0.5, gy - 12, 0.5);
    expect(hintContext(kit.S).underground).toBe(true);
  });
});

describe('yatak doğuşu: kırılmış yatakta doğulmaz', () => {
  async function setup(breakBed) {
    const { createPlayerCore } = await import('../gamePlayer.js');
    const { applyDamage } = await import('../sim/survival.js');
    const { B } = await import('../sim/blocks.js');
    const G = makeTestG({ mode: 'macera', seed: 'ABCD1234' });
    G.survival.easy = false;
    const w = G.world;
    for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.ensureChunk(cx, cz);
    const gy = w.surfaceY(6, 6, { ignoreFoliage: true });
    w.setBlock(6, gy + 1, 6, B.BED);
    G.bedSpawn = { x: 6.5, y: gy + 2, z: 6.5 };
    if (breakBed) w.setBlock(6, gy + 1, 6, 0);
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    applyDamage(G.survival, 1000, { cause: 'genel' });
    core.postSystem.fixedUpdate(G, 1 / 60);
    return { G, core };
  }

  it('yatak yerindeyken: ölüm bilgisi "yatak", yatakta doğar', async () => {
    const { G, core } = await setup(false);
    expect(G.player.deathInfo.respawn).toBe('yatak');
    core.respawn('manual');
    expect(G.bedSpawn).not.toBe(null);
    expect(Math.abs(G.body.x - 6.5)).toBeLessThan(7);
    expect(G.player.dead).toBe(false);
  });

  it('yatak kırılmışsa: ölüm bilgisi "başlangıç", kayıt silinir, başlangıç noktasında doğar + ipucu', async () => {
    const { G, core } = await setup(true);
    expect(G.player.deathInfo.respawn).toBe('başlangıç');
    expect(G.bedSpawn).toBe(null);
    core.respawn('manual');
    expect(Math.hypot(G.body.x - G.spawn.x, G.body.z - G.spawn.z)).toBeLessThan(7);
    expect(G.player.dead).toBe(false);
  });
});
