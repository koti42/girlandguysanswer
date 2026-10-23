import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { RECIPES, getRecipe } from '../sim/items.js';
import { nearbyStations } from './blocksCraft.js';
import { events, makeG, sounds } from './blocksTestKit.js';

const api = (g) => g.sys.api(g.G);

describe('yakındaki istasyonlar', () => {
  it('yalnız el; tezgah yanında tezgah; uzakta yok; ocak/örs de', () => {
    const g = makeG();
    expect(api(g).getStations()).toEqual(['el']);
    g.G.world.setBlock(10, 41, 8, B.WORKBENCH);
    expect(api(g).getStations()).toEqual(['el', 'tezgah']);
    g.G.world.setBlock(8, 42, 11, B.FURNACE);
    g.G.world.setBlock(6, 41, 6, B.IRON_BLOCK);
    expect(api(g).getStations()).toEqual(['el', 'tezgah', 'ocak', 'örs']);
    g.G.body.x = 30;
    g.G.body.z = 30;
    expect(api(g).getStations()).toEqual(['el']);
  });

  it('4 blok menzili: 4 blok uzak içeride, 6 blok uzak dışarıda', () => {
    const g = makeG();
    g.G.world.setBlock(12, 41, 8, B.WORKBENCH); // 3,5 blok
    expect(nearbyStations(g.G, g.S)).toContain('tezgah');
    g.G.world.setBlock(12, 41, 8, B.AIR);
    g.G.world.setBlock(14, 41, 8, B.WORKBENCH); // 5,5 blok
    expect(nearbyStations(g.G, g.S)).not.toContain('tezgah');
  });

  it('tıklanan istasyon menzil dışında bile açıkken sayılır (pin), blok yok olunca düşer', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 3, B.WORKBENCH); // 5,5 blok
    expect(api(g).getStations()).toEqual(['el']);
    g.S.pinned = { x: 8, y: 41, z: 3, kind: 'tezgah' };
    expect(api(g).getStations()).toEqual(['el', 'tezgah']);
    g.G.world.setBlock(8, 41, 3, B.AIR);
    expect(api(g).getStations()).toEqual(['el']);
  });
});

describe('getRecipes', () => {
  it('tüm tarifler; satır biçimi; have/craftable/heat', () => {
    const g = makeG();
    g.G.inventory.add('blok:meşe_kütük', 3);
    const list = api(g).getRecipes({});
    expect(list.length).toBe(RECIPES.length);
    const planks = list.find((r) => r.id === 'tahta_meşe');
    expect(planks).toMatchObject({
      out: { item: 'blok:meşe_tahta', count: 4 }, station: 'el', category: 'yapı', craftable: true, heat: 0,
    });
    expect(planks.in).toEqual([{ item: 'blok:meşe_kütük', count: 1, have: 3 }]);
    const furnace = list.find((r) => r.id === 'ocak:demir');
    expect(furnace.heat).toBe(10);
    expect(furnace.craftable).toBe(false);
    expect(furnace.in[0].have).toBe(0);
    const bench = list.find((r) => r.id === 'ocak');
    expect(bench.craftable).toBe(false); // tezgah yok
  });

  it('istasyon, kategori, sorgu süzgeçleri (Türkçe harf duyarsız)', () => {
    const g = makeG();
    const a = api(g);
    expect(a.getRecipes({ station: 'ocak' }).every((r) => r.station === 'ocak')).toBe(true);
    expect(a.getRecipes({ category: 'zırh' }).every((r) => r.category === 'zırh')).toBe(true);
    const q = a.getRecipes({ query: 'KAZMA demir' });
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((r) => /kazma|demir/i.test(r.outName + r.in.map((i) => i.item).join(' ')))).toBe(true);
    expect(a.getRecipes({ query: 'kazma' }).map((r) => r.id)).toEqual(a.getRecipes({ query: 'KAZMA' }).map((r) => r.id));
    expect(a.getRecipes({ query: 'ahsap' }).length).toBeGreaterThan(0);
    expect(a.getRecipes({ query: 'olmayan şey xyz' })).toEqual([]);
  });

  it('istasyon yakına gelince craftable açılır; çıktı sığmazsa kapanır', () => {
    const g = makeG();
    g.G.inventory.add('blok:kırıktaş', 8);
    expect(api(g).getRecipes({ station: 'tezgah' }).find((r) => r.id === 'ocak').craftable).toBe(false);
    g.G.world.setBlock(10, 41, 8, B.WORKBENCH);
    expect(api(g).getRecipes({ station: 'tezgah' }).find((r) => r.id === 'ocak').craftable).toBe(true);
    // dolu envanter: girdi yuvası boşalırsa çıktı sığar (craftable), boşalmazsa sığmaz
    const full = makeG();
    for (let i = 0; i < 36; i++) full.G.inventory.setSlot(i, 'item:elmas', 64);
    full.G.inventory.setSlot(0, 'blok:meşe_kütük', 1);
    expect(api(full).getRecipes({}).find((r) => r.id === 'tahta_meşe').craftable).toBe(true);
    full.G.inventory.setSlot(0, 'blok:meşe_kütük', 2);
    expect(api(full).getRecipes({}).find((r) => r.id === 'tahta_meşe').craftable).toBe(false);
    expect(api(full).craft('tahta_meşe')).toBe(false);
    expect(full.G.inventory.count('blok:meşe_kütük')).toBe(2);
  });
});

describe('craft', () => {
  it('tahta üretir: girdi tüketilir, çıktı eklenir, olay + ses', () => {
    const g = makeG();
    g.G.inventory.add('blok:meşe_kütük', 2);
    expect(api(g).craft('tahta_meşe')).toBe(true);
    expect(g.G.inventory.count('blok:meşe_kütük')).toBe(1);
    expect(g.G.inventory.count('blok:meşe_tahta')).toBe(4);
    const ev = events(g.G, 'itemCrafted');
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ item: 'blok:meşe_tahta', count: 4, recipeId: 'tahta_meşe', station: 'el' });
    expect(sounds(g.G, 'craft').length).toBe(1);
    expect(g.G._invDirty).toBe(true);
  });

  it('times: çoklu üretim; yetmezse ATOMİK başarısız (envanter değişmez)', () => {
    const g = makeG();
    g.G.inventory.add('blok:meşe_kütük', 3);
    expect(api(g).craft('tahta_meşe', { times: 3 })).toBe(true);
    expect(g.G.inventory.count('blok:meşe_tahta')).toBe(12);
    expect(events(g.G, 'itemCrafted').length).toBe(3);
    const h = makeG();
    h.G.inventory.add('blok:meşe_kütük', 2);
    expect(api(h).craft('tahta_meşe', { times: 5 })).toBe(false);
    expect(h.G.inventory.count('blok:meşe_kütük')).toBe(2);
    expect(h.G.inventory.count('blok:meşe_tahta')).toBe(0);
    expect(events(h.G, 'itemCrafted').length).toBe(0);
    expect(api(h).craft('tahta_meşe', { times: 2 })).toBe(true);
  });

  it('istasyon gerekir: tezgah olmadan kazma olmaz, tezgah yanında olur', () => {
    const g = makeG();
    g.G.inventory.add('blok:meşe_tahta', 10);
    g.G.inventory.add('item:sopa', 4);
    expect(api(g).craft('kazma_ahşap')).toBe(false);
    g.G.world.setBlock(10, 41, 8, B.WORKBENCH);
    expect(api(g).craft('kazma_ahşap')).toBe(true);
    expect(g.G.inventory.count('item:kazma_ahşap')).toBe(1);
    expect(g.G.inventory.count('blok:meşe_tahta')).toBe(7);
  });

  it('ocak: ham demir erir, yakıt yanar, kalan ısı taşınır (kömür 80, eritme 10)', () => {
    const g = makeG();
    g.G.world.setBlock(10, 41, 8, B.FURNACE);
    g.G.inventory.add('item:ham_demir', 3);
    g.G.inventory.add('item:kömür', 1);
    expect(api(g).getInventorySnapshot().heat).toBe(0);
    expect(api(g).craft('ocak:demir')).toBe(true);
    expect(g.G.inventory.count('item:demir_külçe')).toBe(1);
    expect(g.G.inventory.count('item:kömür')).toBe(0);
    expect(api(g).getInventorySnapshot().heat).toBe(70);
    expect(api(g).craft('ocak:demir', { times: 2 })).toBe(true);
    expect(api(g).getInventorySnapshot().heat).toBe(50);
    expect(g.G.inventory.count('item:demir_külçe')).toBe(3);
  });

  it('ocak: yakıt yoksa üretilmez ve eşya kaybolmaz', () => {
    const g = makeG();
    g.G.world.setBlock(10, 41, 8, B.FURNACE);
    g.G.inventory.add('item:ham_demir', 2);
    const r = api(g).getRecipes({}).find((x) => x.id === 'ocak:demir');
    expect(r.craftable).toBe(false);
    expect(api(g).craft('ocak:demir')).toBe(false);
    expect(g.G.inventory.count('item:ham_demir')).toBe(2);
    g.G.inventory.add('blok:meşe_tahta', 1);
    expect(api(g).getRecipes({}).find((x) => x.id === 'ocak:demir').craftable).toBe(true);
  });

  it('ocak: odun kömürü tarifinde kütük hem malzeme hem yakıt olarak çift sayılmaz', () => {
    const g = makeG();
    g.G.world.setBlock(10, 41, 8, B.FURNACE);
    g.G.inventory.add('blok:meşe_kütük', 1);
    expect(api(g).craft('ocak:odun_kömürü_meşe')).toBe(false);
    g.G.inventory.add('item:sopa', 2);
    expect(api(g).craft('ocak:odun_kömürü_meşe')).toBe(true);
    expect(g.G.inventory.count('item:odun_kömürü')).toBe(1);
  });

  it('geçersiz tarif, harita modu ve ölüm: false', () => {
    const g = makeG();
    expect(api(g).craft('yok')).toBe(false);
    expect(api(g).craft(undefined)).toBe(false);
    g.G.inventory.add('blok:meşe_kütük', 2);
    g.G.player.dead = true;
    expect(api(g).craft('tahta_meşe')).toBe(false);
    const h = makeG({ mode: 'harita' });
    h.G.inventory.add('blok:meşe_kütük', 2);
    expect(api(h).craft('tahta_meşe')).toBe(false);
    expect(api(h).getRecipes({}).every((r) => r.craftable === false)).toBe(true);
  });

  it('yaratıcı modda malzeme tüketilmez', () => {
    const g = makeG({ mode: 'insa' });
    const n0 = g.G.inventory.count('blok:meşe_tahta');
    expect(api(g).craft('sopa')).toBe(true);
    expect(g.G.inventory.count('blok:meşe_tahta')).toBe(n0);
    expect(g.G.inventory.count('item:sopa')).toBe(4);
  });

  it('tarif sayısı ve çıktı eşyalarının tümü geçerli', () => {
    RECIPES.forEach((r) => expect(getRecipe(r.id)).toBe(r));
    expect(RECIPES.length).toBeGreaterThan(150);
  });
});
