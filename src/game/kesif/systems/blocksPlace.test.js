import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { checkAt } from './blocksPlace.js';
import { events, makeG, sounds } from './blocksTestKit.js';

describe('yerleştirme kuralları (checkAt)', () => {
  it('boş hücreye konur; dolu hücreye konmaz', () => {
    const { G } = makeG();
    expect(checkAt(G, 5, 41, 5, B.STONE).code).toBe('ok');
    expect(checkAt(G, 5, 40, 5, B.STONE).code).toBe('occupied');
    expect(checkAt(G, 5, 41, 5, B.STONE).ok).toBe(true);
  });

  it('oyuncunun içine çarpışmalı blok konmaz; meşale gibi çarpışmasız konabilir', () => {
    const { G } = makeG();
    expect(checkAt(G, 8, 41, 8, B.STONE).code).toBe('player');
    expect(checkAt(G, 8, 42, 8, B.STONE).code).toBe('player'); // gövde 1,8 yüksek
    expect(checkAt(G, 8, 43, 8, B.STONE).code).toBe('ok');
    expect(checkAt(G, 8, 41, 8, B.TORCH).code).toBe('ok'); // altı toprak: destekli, çarpışmasız
  });

  it('ayağın altına (oyuncunun durduğu hücrenin altı) blok konmaz çünkü dolu; yanına konur', () => {
    const { G } = makeG();
    expect(checkAt(G, 9, 41, 8, B.STONE).code).toBe('ok');
  });

  it('yaratıkla çakışan hücreye konmaz', () => {
    const { G } = makeG();
    G.em.queryMobs = () => [{ x: 5.5, y: 41, z: 5.5, w: 0.6, h: 1 }];
    expect(checkAt(G, 5, 41, 5, B.STONE).code).toBe('mob');
    expect(checkAt(G, 6, 41, 5, B.STONE).code).toBe('ok');
  });

  it('su ve ot/çiçek yerine konur, taş yerine konmaz', () => {
    const { G } = makeG();
    G.world.setBlock(5, 41, 5, B.WATER);
    G.world.setBlock(6, 41, 5, B.TALL_GRASS);
    G.world.setBlock(7, 41, 5, B.STONE);
    expect(checkAt(G, 5, 41, 5, B.STONE).ok).toBe(true);
    expect(checkAt(G, 6, 41, 5, B.STONE).ok).toBe(true);
    expect(checkAt(G, 7, 41, 5, B.COBBLE).code).toBe('occupied');
    G.world.setBlock(5, 41, 6, B.LAVA);
    expect(checkAt(G, 5, 41, 6, B.STONE).ok).toBe(true);
  });

  it('dünya yüksekliği sınırları (macera: -400..362; legacy: 1..127)', () => {
    const { G } = makeG();
    expect(checkAt(G, 5, -400, 5, B.STONE).code).toBe('height'); // taban ana kaya katmanı
    expect(checkAt(G, 5, -399, 5, B.STONE).code).toBe('occupied');
    expect(checkAt(G, 5, 363, 5, B.STONE).code).toBe('height'); // tavanın üstü
    expect(checkAt(G, 5, 362, 5, B.STONE).code).toBe('ok'); // tavan dahil inşa edilebilir
    expect(checkAt(G, 5, 128, 5, B.STONE).code).toBe('ok');
    const lg = makeG({ mode: 'insa' });
    expect(checkAt(lg.G, 5, 0, 5, B.STONE).code).toBe('height');
    expect(checkAt(lg.G, 5, 128, 5, B.STONE).code).toBe('height');
    expect(checkAt(lg.G, 5, 127, 5, B.STONE).code).toBe('ok');
  });

  it('üretilmemiş chunk', () => {
    const { G } = makeG();
    expect(checkAt(G, 400, 41, 400, B.STONE).code).toBe('unloaded');
  });

  it('inşa modunda çerçeve dışı yasak, içi serbest', () => {
    const { G } = makeG({ mode: 'insa' });
    expect(checkAt(G, -1, 41, 5, B.STONE).code).toBe('bounds');
    expect(checkAt(G, 32, 41, 5, B.STONE).code).toBe('bounds');
    expect(checkAt(G, 31, 41, 5, B.STONE).code).toBe('ok');
  });

  it('meşale/fener/bitki/kaktüs destek ister', () => {
    const { G } = makeG();
    expect(checkAt(G, 5, 50, 5, B.TORCH).code).toBe('support'); // havada
    expect(checkAt(G, 5, 41, 5, B.TORCH).code).toBe('ok'); // çimen üstünde
    G.world.setBlock(5, 50, 6, B.STONE);
    expect(checkAt(G, 5, 50, 5, B.TORCH).code).toBe('ok'); // yan duvara yaslanır
    expect(checkAt(G, 5, 41, 5, B.FLOWER_RED).code).toBe('ok'); // çimen
    expect(checkAt(G, 5, 50, 5, B.FLOWER_RED).code).toBe('support');
    G.world.setBlock(9, 40, 9, B.STONE);
    expect(checkAt(G, 9, 41, 9, B.FLOWER_RED).code).toBe('support'); // taş üstünde çiçek yok
    expect(checkAt(G, 5, 41, 5, B.CACTUS).code).toBe('support');
    G.world.setBlock(5, 40, 5, B.SAND);
    expect(checkAt(G, 5, 41, 5, B.CACTUS).code).toBe('ok');
  });
});

describe('yerleştirme eylemi', () => {
  function setup(opts) {
    const g = makeG(opts);
    g.G.inventory.setSlot(0, 'blok:taş', 10);
    g.G.inventory.selected = 0;
    return g;
  }

  it('sağ tık: hedef yüzün önüne koyar, 1 adet tüketir, olay + ses + sallama', () => {
    const g = setup();
    g.aim(8, 40, 5);
    g.step(1);
    const hit = g.S.target;
    expect(g.S.has).toBe(true);
    const { x, y, z } = hit.placeAt;
    expect(g.G.world.getBlock(x, y, z)).toBe(B.AIR);
    g.step(1, { placePressed: true, placeHeld: true });
    expect(g.G.world.getBlock(x, y, z)).toBe(B.STONE);
    expect(g.G.inventory.held().count).toBe(9);
    const ev = events(g.G, 'blockPlaced');
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ x, y, z, id: B.STONE, item: 'blok:taş' });
    expect(sounds(g.G, 'place:taş').length).toBe(1);
    expect(g.G.log.some((e) => e[0] === 'swing' && e[1] === 'place')).toBe(true);
  });

  it('son blok bitince yuva boşalır; yaratıcı modda tüketilmez', () => {
    const g = setup();
    g.G.inventory.setSlot(0, 'blok:taş', 1);
    g.aim(8, 40, 5);
    g.step(1, { placePressed: true });
    expect(g.G.inventory.held()).toBeNull();
    const c = makeG({ mode: 'insa' });
    c.G.inventory.selected = 0;
    const n0 = c.G.inventory.held().count;
    c.aim(8, 40, 5);
    c.step(1, { placePressed: true });
    expect(c.G.inventory.held().count).toBe(n0);
    expect(events(c.G, 'blockPlaced').length).toBe(1);
  });

  it('geçersizse konmaz, tüketmez ve ipucu verir', () => {
    const g = setup();
    g.G.world.setBlock(8, 41, 7, B.STONE);
    // hedef oyuncunun içine yerleştirecek bir konum: hedef blok oyuncunun hemen yanı
    g.aim(8, 40, 8); // ayağının altı: placeAt = oyuncunun hücresi
    g.step(1, { placePressed: true });
    expect(g.G.inventory.held().count).toBe(10);
    expect(g.G.hud.hint).toBe('Kendi içine blok koyamazsın.');
  });

  it('basılı tutunca tekrar yerleştirir (köprü)', () => {
    const g = setup();
    g.aim(8, 40, 4);
    g.step(1, { placePressed: true, placeHeld: true });
    const n1 = g.G.inventory.held().count;
    g.step(40, { placeHeld: true });
    expect(g.G.inventory.held().count).toBeLessThan(n1);
  });

  it('harita modunda yerleştirme olmaz', () => {
    const g = makeG({ mode: 'harita' });
    g.G.inventory.setSlot(0, 'blok:taş', 5);
    g.aim(8, 40, 5);
    g.step(2, { placePressed: true });
    expect(events(g.G, 'blockPlaced').length).toBe(0);
    expect(g.G.inventory.held().count).toBe(5);
  });

  it('inşa modunda sistem bloğu ve sıvı dışı yalnız inşa edilebilir bloklar', () => {
    const g = makeG({ mode: 'insa' });
    expect(checkAt(g.G, 5, 41, 5, B.BEDROCK).code).toBe('mode');
    expect(checkAt(g.G, 5, 41, 5, B.WATER).code).toBe('ok'); // inşa modunda sıvı kaynağı serbest
    const m = makeG();
    expect(checkAt(m.G, 5, 41, 5, B.WATER).code).toBe('mode'); // macera: sıvı kaynağı yerleştirilmez
  });

  it('macera modunda sıvı blok eşyası yerleştirilmez (checkPlacement)', () => {
    const g = setup();
    g.G.inventory.setSlot(0, 'blok:su', 1);
    g.aim(8, 40, 5);
    g.step(1, { placePressed: true });
    expect(events(g.G, 'blockPlaced').length).toBe(0);
  });

  it('çömelince sandığa blok yerleştirir; ayaktayken sandık açılır', () => {
    const g = setup();
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    g.aim(8, 41, 5);
    g.step(1, { placePressed: true, crouch: true });
    expect(g.G.ui).toBe('none');
    expect(events(g.G, 'blockPlaced').length).toBe(1);
    const h = makeG();
    h.G.inventory.setSlot(0, 'blok:taş', 5);
    h.G.world.setBlock(8, 41, 5, B.CHEST);
    h.aim(8, 41, 5);
    h.step(1, { placePressed: true });
    expect(h.G.ui).toBe('chest');
    expect(events(h.G, 'blockPlaced').length).toBe(0);
  });

  it('hayalet: geçerli/geçersiz renk ve hedef değişimi', () => {
    const g = setup();
    g.aim(8, 40, 5);
    g.step(1);
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    const hl = g.G.highlight.state;
    expect(hl.ghostId).toBe(B.STONE);
    expect(hl.ghostValid).toBe(true);
    g.G.inventory.setSlot(0, 'item:kazma_taş', 1);
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(hl.ghostId).toBe(-1);
    // meşale havada geçersiz: duvara bakınca geçerli
    g.G.inventory.setSlot(0, 'blok:meşale', 5);
    g.G.world.setBlock(8, 45, 3, B.STONE);
    g.G.eye.y = g.G.eyeSim.y = 45.5;
    g.aim(8, 45, 3);
    g.step(1);
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(hl.ghostId).toBe(B.TORCH);
    expect(hl.ghostValid).toBe(true);
  });

  it('kapı, merdiven, plaka, çit, yatak yerleştirilebilir (şekil blokları)', () => {
    const { G } = makeG();
    [B.DOOR, B.STAIRS, B.SLAB, B.FENCE, B.BED, B.CHEST, B.GLASS].forEach((id, i) => {
      expect(checkAt(G, 3 + i, 41, 3, id).ok, String(id)).toBe(true);
    });
  });

  it('yerleştirilen hücre için bulmaca bildirimi yapılır', () => {
    const g = setup();
    const seen = [];
    g.G.puzzles = { handleInteract: (e) => { seen.push(e); return false; } };
    g.aim(8, 40, 5);
    g.step(1, { placePressed: true });
    expect(seen.some((e) => e.type === 'blockPlaced' && e.id === B.STONE)).toBe(true);
    expect(seen.some((e) => e.type === 'use')).toBe(true); // önce use sorulur
  });

  it('G.readOnly (oturum sistemi) harita dışında da yerleştirmeyi kapatır ve actionDenied yayar', () => {
    const g = setup();
    g.G.readOnly = true;
    g.aim(8, 40, 5);
    g.step(1, { placePressed: true });
    expect(events(g.G, 'blockPlaced').length).toBe(0);
    expect(events(g.G, 'actionDenied')[0].reason).toBe('readOnly');
    expect(g.G.hud.hint).toBeTruthy(); // oturum sistemi yok: yerel ipucu
  });

  it('oturum sistemi varsa ipucunu o yazar (yerel ipucu yok); tavan ihlali actionDenied height', () => {
    const g = makeG({ mode: 'insa' });
    g.G.getSystem = (n) => (n === 'session' ? {} : null);
    g.G.inventory.setSlot(0, 'blok:taş', 5);
    g.G.inventory.selected = 0;
    g.G.eyeSim.y = 130;
    g.G.eye.y = 130;
    g.G.world.setBlock(8, 127, 6, B.STONE);
    g.aim(8, 127, 6);
    g.step(1, { placePressed: true });
    const ev = events(g.G, 'actionDenied');
    expect(ev.length).toBe(1);
    expect(ev[0].reason).toBe('height');
    expect(g.G.hud.hint).toBeNull();
    expect(g.G.world.getBlock(8, 128, 6)).toBe(B.AIR);
  });
});
