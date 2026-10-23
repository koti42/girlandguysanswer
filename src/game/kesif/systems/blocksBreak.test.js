import { describe, expect, it } from 'vitest';
import { B, breakTime } from '../sim/blocks.js';
import { events, makeG, sounds } from './blocksTestKit.js';

const TX = 8;
const TY = 40;
const TZ = 6;

/** Hedef bloğu kurar, nişan alır, kırılana dek sabit adım sayar (en çok 1500). */
function ticksToBreak(g, id, held) {
  const { G } = g;
  G.world.setBlock(TX, TY, TZ, id);
  if (held) {
    G.inventory.setSlot(0, held, 1);
    G.inventory.selected = 0;
  } else {
    G.inventory.setSlot(0, null);
  }
  g.aim(TX, TY, TZ);
  let n = 0;
  while (G.world.getBlock(TX, TY, TZ) === id && n < 1500) {
    g.step(1, { breakHeld: true });
    n++;
  }
  return n;
}

describe('kırma süresi ve alet kademeleri', () => {
  const cases = [
    ['toprak, elle', B.DIRT, null],
    ['toprak, taş kürek', B.DIRT, 'item:kürek_taş'],
    ['taş, ahşap kazma', B.STONE, 'item:kazma_ahşap'],
    ['taş, demir kazma', B.STONE, 'item:kazma_demir'],
    ['meşe kütük, elle', B.LOG_OAK, null],
    ['meşe kütük, taş balta', B.LOG_OAK, 'item:balta_taş'],
    ['kömür cevheri, taş kazma', B.COAL_ORE, 'item:kazma_taş'],
    ['demir cevheri, bakır kazma', B.IRON_ORE, 'item:kazma_bakır'],
  ];
  cases.forEach(([name, id, tool]) => {
    it(name + ': tik sayısı breakTime ile uyumlu', () => {
      const g = makeG();
      const n = ticksToBreak(g, id, tool);
      const expected = Math.ceil(breakTime(id, tool) * 60);
      expect(n).toBeGreaterThanOrEqual(expected - 2);
      expect(n).toBeLessThanOrEqual(expected + 4);
    });
  });

  it('daha yüksek kademe daha hızlı kırar (taş: ahşap > taş > demir)', () => {
    const t = (tool) => ticksToBreak(makeG(), B.STONE, tool);
    const a = t('item:kazma_ahşap');
    const b = t('item:kazma_taş');
    const c = t('item:kazma_demir');
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('yanlış alet yavaş: taşı balta ile kırmak kazmadan uzun sürer', () => {
    const t = (tool) => ticksToBreak(makeG(), B.STONE, tool);
    expect(t('item:balta_taş')).toBeGreaterThan(t('item:kazma_taş'));
  });
});

describe('düşen eşyalar', () => {
  it('taş + kazma → kırık taş düşer', () => {
    const g = makeG();
    ticksToBreak(g, B.STONE, 'item:kazma_ahşap');
    expect(g.G.items.map((i) => i.item)).toContain('blok:kırıktaş');
    const d = g.G.items.find((i) => i.item === 'blok:kırıktaş');
    expect(d.opts.vy).toBeGreaterThan(1);
  });

  it('taş elle kırılırsa eşya düşmez (yetersiz alet)', () => {
    const g = makeG();
    ticksToBreak(g, B.STONE, null);
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.AIR);
    expect(g.G.items.length).toBe(0);
  });

  it('demir cevheri taş kazmayla düşmez, bakır kazmayla düşer', () => {
    const a = makeG();
    ticksToBreak(a, B.IRON_ORE, 'item:kazma_taş');
    expect(a.G.items.length).toBe(0);
    const b = makeG();
    ticksToBreak(b, B.IRON_ORE, 'item:kazma_bakır');
    expect(b.G.items.map((i) => i.item)).toEqual(['item:ham_demir']);
  });

  it('çimenli toprak toprak bırakır; blockBroken olayı bilgi taşır', () => {
    const g = makeG();
    ticksToBreak(g, B.GRASS, null);
    expect(g.G.items.map((i) => i.item)).toEqual(['blok:toprak']);
    const ev = events(g.G, 'blockBroken');
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ x: TX, y: TY, z: TZ, id: B.GRASS, by: 'player' });
  });

  it('kırma sesi/parçacığı: kazma sesi tekrarlanır, kırılınca break sesi', () => {
    const g = makeG();
    ticksToBreak(g, B.STONE, 'item:kazma_ahşap');
    expect(sounds(g.G, 'dig:').length).toBeGreaterThanOrEqual(2);
    expect(sounds(g.G, 'break:taş').length).toBe(1);
    expect(g.G.log.some((e) => e[0] === 'particles.blockBreak')).toBe(true);
  });
});

describe('alet dayanıklılığı', () => {
  it('sert blok kırınca kazma 1 aşınır, kılıç 2', () => {
    const g = makeG();
    ticksToBreak(g, B.STONE, 'item:kazma_taş');
    const full = g.G.inventory.held().dur;
    expect(full).toBe(132 - 1);
    const h = makeG();
    ticksToBreak(h, B.STONE, 'item:kılıç_taş');
    expect(h.G.inventory.held().dur).toBe(132 - 2);
  });

  it('anında kırılan çiçek aleti aşındırmaz', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'item:kazma_taş', 1);
    g.G.world.setBlock(TX, TY, TZ, B.FLOWER_RED);
    g.aim(TX, TY, TZ);
    g.step(2, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.AIR);
    expect(g.G.inventory.held().dur).toBe(132);
  });

  it('dayanıklılık bitince alet kırılır ve duyurulur', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'item:kazma_altın', 1, 1);
    g.G.inventory.selected = 0;
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.aim(TX, TY, TZ);
    for (let i = 0; i < 400 && g.G.world.getBlock(TX, TY, TZ) === B.STONE; i++) g.step(1, { breakHeld: true });
    expect(g.G.inventory.held()).toBeNull();
    expect(g.G.log.some((e) => e[0] === 'speak' && /kırıldı/.test(e[1]))).toBe(true);
  });
});

describe('modlar ve kırılamazlar', () => {
  it('ana kaya (sistem bloğu) kırılmaz ve geri bildirim verir', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.BEDROCK);
    g.aim(TX, TY, TZ);
    g.step(2, { breakHeld: true, attackPressed: true });
    expect(g.G.hud.hint).toBe('Bu blok kırılamaz.');
    g.step(118, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.BEDROCK);
    expect(sounds(g.G, 'ui_error').length).toBeGreaterThan(0);
  });

  it('mühür bariyeri ve bulmaca kolu kırılamaz', () => {
    [B.SEAL_BARRIER, B.LEVER, B.ALTAR].forEach((id) => {
      const g = makeG();
      g.G.world.setBlock(TX, TY, TZ, id);
      g.aim(TX, TY, TZ);
      g.step(90, { breakHeld: true });
      expect(g.G.world.getBlock(TX, TY, TZ)).toBe(id);
    });
  });

  it('sıvılar hedeflenmez / kırılmaz', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.WATER);
    g.aim(TX, TY, TZ);
    g.step(60, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.WATER);
  });

  it('harita modunda kırma kapalı', () => {
    const g = makeG({ mode: 'harita' });
    g.G.world.setBlock(TX, TY, TZ, B.DIRT);
    g.aim(TX, TY, TZ);
    g.step(120, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.DIRT);
  });

  it('inşa modunda anında kırılır, eşya düşmez, envanter tüketilmez', () => {
    const g = makeG({ mode: 'insa' });
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.aim(TX, TY, TZ);
    g.step(2, { breakHeld: true, attackPressed: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.AIR);
    expect(g.G.items.length).toBe(0);
  });

  it('inşa modunda basılı tutunca kısa aralıkla art arda kırar', () => {
    const g = makeG({ mode: 'insa' });
    // iki blok yan yana: hedef hızla ilerlerken
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.aim(TX, TY, TZ);
    g.step(1, { breakHeld: true, attackPressed: true });
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.step(4, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.STONE); // bekleme süresi
    g.step(20, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.AIR);
  });

  it('UI açıkken kırma olmaz ve ilerleme sıfırlanır', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.aim(TX, TY, TZ);
    g.step(20, { breakHeld: true });
    expect(g.S.brk.progress).toBeGreaterThan(0);
    g.G.setUi('inventory');
    g.step(300, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.STONE);
    expect(g.S.brk.progress).toBe(0);
  });

  it('bırakınca ilerleme kısa süre sonra sıfırlanır; hedef değişince başa döner', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.G.world.setBlock(TX + 1, TY, TZ, B.STONE);
    g.G.inventory.setSlot(0, 'item:kazma_ahşap', 1);
    g.aim(TX, TY, TZ);
    g.step(30, { breakHeld: true });
    const p1 = g.S.brk.progress;
    expect(p1).toBeGreaterThan(0.1);
    g.step(20, { breakHeld: false });
    expect(g.S.brk.progress).toBe(0);
    g.step(10, { breakHeld: true });
    g.aim(TX + 1, TY, TZ);
    g.step(14, { breakHeld: true });
    expect(g.S.brk.x).toBe(TX + 1);
    expect(g.S.brk.progress).toBeLessThan(0.2);
  });

  it('nişandaki yaratık varsa (G.aimEntity) blok kırılmaz; yay elindeyken de kırılmaz', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.DIRT);
    g.aim(TX, TY, TZ);
    g.G.aimEntity = { id: 1 };
    g.step(120, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.DIRT);
    g.G.aimEntity = null;
    g.G.inventory.setSlot(0, 'item:yay', 1);
    g.step(120, { breakHeld: true });
    expect(g.G.world.getBlock(TX, TY, TZ)).toBe(B.DIRT);
  });
});

describe('kare görselleri', () => {
  it('çatlak ilerlemesi highlight.setBreakProgress ile eşlenir, hud.target dolar', () => {
    const g = makeG();
    g.G.world.setBlock(TX, TY, TZ, B.STONE);
    g.G.inventory.setSlot(0, 'item:kazma_ahşap', 1);
    g.aim(TX, TY, TZ);
    g.step(30, { breakHeld: true });
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.highlight.state.hasTarget).toBe(true);
    expect(g.G.highlight.state.progress).toBeGreaterThan(0.1);
    expect(g.G.hud.target.block).toBe(B.STONE);
    expect(g.G.hud.target.name).toBe('Taş');
    expect(g.G.hud.target.progress).toBeGreaterThan(0.1);
    g.G.setUi('inventory');
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.highlight.state.hasTarget).toBe(false);
    expect(g.G.hud.target.block).toBeNull();
  });
});
