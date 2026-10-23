import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { RECIPES, STATIONS } from '../sim/items.js';
import { createPlayerBody, stepPlayer } from '../sim/physics.js';
import { createProgression } from '../sim/progression.js';
import { nearbyStations } from './blocksCraft.js';
import { events, makeG } from './blocksTestKit.js';

const api = (g) => g.sys.api(g.G);

function use(g, x, y, z, input) {
  g.aim(x, y, z);
  g.step(1, Object.assign({ placePressed: true }, input || {}));
}

describe('üretim akışı: ağaç → tahta → tezgah → sandık → ocak → alet (gerçek envanter + sistem)', () => {
  it('kütükten tezgaha elle, tezgahta sandık/ocak/meşale/kazma; hiçbir adım atlanmaz', () => {
    const g = makeG();
    const a = api(g);
    const inv = g.G.inventory;
    inv.add('blok:meşe_kütük', 8);
    // 2x2 "el": tahta, sopa, tezgah — istasyon gerekmez
    expect(a.craft('tahta_meşe', { times: 4 })).toBe(true);
    expect(inv.count('blok:meşe_tahta')).toBe(16);
    expect(a.craft('sopa')).toBe(true);
    expect(a.craft('tezgah')).toBe(true);
    expect(inv.count('blok:tezgah')).toBe(1);
    // tezgah yokken tezgah tarifleri yapılamaz
    expect(a.craft('sandık')).toBe(false);
    expect(a.getRecipes({}).find((r) => r.id === 'sandık').craftable).toBe(false);
    // tezgahı yere koy (sağ tık), yanında tarifler açılır
    expect(inv.remove('blok:tezgah', 1)).toBe(true); // yere konan tezgah envanterden çıkar
    g.G.world.setBlock(10, 41, 8, B.WORKBENCH);
    expect(nearbyStations(g.G, g.S)).toContain('tezgah');
    expect(a.craft('sandık')).toBe(true);
    expect(inv.count('blok:sandık')).toBe(1);
    inv.add('blok:meşe_tahta', 3); // sandıktan sonra kalan 2 tahta kazmaya yetmez
    expect(a.craft('kazma_ahşap')).toBe(true);
    expect(inv.count('item:kazma_ahşap')).toBe(1);
    // meşale: kömür + sopa (el)
    inv.add('item:kömür', 1);
    expect(a.craft('meşale_kömür')).toBe(true);
    expect(inv.count('blok:meşale')).toBe(4);
    // ocak: 8 kırıktaş, tezgahta
    inv.add('blok:kırıktaş', 8);
    expect(a.craft('ocak')).toBe(true);
    expect(inv.count('blok:ocak')).toBe(1);
  });

  it('sandık: yerleştir, aç, çantadan sandığa koy → chestStored olayı ve içerik kalıcı', () => {
    const g = makeG();
    const a = api(g);
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    g.G.inventory.setSlot(0, 'item:elma', 5);
    use(g, 8, 41, 5);
    expect(g.G.ui).toBe('chest');
    expect(a.moveStack('s0', 'c0')).toBe(true);
    expect(events(g.G, 'chestStored')).toHaveLength(1);
    expect(events(g.G, 'chestStored')[0].item).toBe('item:elma');
    expect(g.G.chests.get('8,41,5')[0]).toMatchObject({ item: 'item:elma', count: 5 });
    // sandıktan geri almak chestStored saymaz
    expect(a.moveStack('c0', 's3')).toBe(true);
    expect(events(g.G, 'chestStored')).toHaveLength(1);
    // sandık kapanıp açılınca içerik korunur
    expect(a.moveStack('s3', 'c4')).toBe(true);
    g.G.setUi(null);
    g.step(10);
    use(g, 8, 41, 5);
    expect(g.G.chests.get('8,41,5')[4]).toMatchObject({ item: 'item:elma', count: 5 });
  });

  it('taş kesici ve dokuma tezgahı: sağ tıkla üretim açılır, istasyon sabitlenir, yakınlık algılanır', () => {
    [['kesici', B.STONECUTTER], ['dokuma', B.LOOM]].forEach(([kind, id]) => {
      const g = makeG();
      g.G.world.setBlock(8, 41, 4, id);
      g.G.body.z = 8.5;
      use(g, 8, 41, 4);
      expect(g.G.ui).toBe('crafting');
      expect(g.S.pinned.kind).toBe(kind);
      expect(api(g).getStations()).toContain(kind);
      g.G.setUi(null);
      expect(g.S.pinned).toBeNull();
      // 4 blok menzili de çalışır
      g.G.world.setBlock(12, 41, 8, id);
      expect(nearbyStations(g.G, g.S)).toContain(kind);
    });
  });

  it('getStationFocus: yalnız bir istasyon bloğuna sağ tıklanınca dolar; blok yok olunca null', () => {
    const g = makeG();
    expect(api(g).getStationFocus()).toBeNull();
    g.G.world.setBlock(8, 41, 4, B.FURNACE);
    use(g, 8, 41, 4);
    expect(api(g).getStationFocus()).toBe('ocak');
    g.G.world.setBlock(8, 41, 4, B.AIR);
    expect(api(g).getStationFocus()).toBeNull();
    g.G.setUi(null);
    expect(api(g).getStationFocus()).toBeNull();
  });

  it('taş kesici: 1 taş → 2 basamak; yalnız kesici yanında; yeni bloklar eşya olarak düşer', () => {
    const g = makeG();
    const a = api(g);
    g.G.inventory.add('blok:taş', 3);
    expect(a.craft('kesici:taş_basamak')).toBe(false); // kesici yok
    g.G.world.setBlock(10, 41, 8, B.STONECUTTER);
    expect(a.craft('kesici:taş_basamak', { times: 2 })).toBe(true);
    expect(g.G.inventory.count('blok:taş_basamak')).toBe(4);
    expect(g.G.inventory.count('blok:taş')).toBe(1);
    g.G.inventory.add('blok:meşe_tahta', 6);
    g.G.world.setBlock(9, 41, 11, B.WORKBENCH);
    expect(a.craft('meşe_basamak')).toBe(true);
    expect(g.G.inventory.count('blok:meşe_basamak')).toBe(4);
  });

  it('dokuma: ip → kumaş (ucuz) ve boyama toplu; boya yoksa yapılamaz', () => {
    const g = makeG();
    const a = api(g);
    g.G.inventory.add('item:ip', 6);
    g.G.world.setBlock(10, 41, 8, B.LOOM);
    expect(a.craft('dokuma:kumaş_beyaz', { times: 2 })).toBe(true);
    expect(g.G.inventory.count('blok:kumaş_beyaz')).toBe(4);
    expect(a.craft('dokuma:kumaş_kırmızı')).toBe(false); // boya yok
    g.G.inventory.add('item:boya_kırmızı', 1);
    expect(a.craft('dokuma:kumaş_kırmızı')).toBe(true);
    expect(g.G.inventory.count('blok:kumaş_kırmızı')).toBe(2);
    expect(g.G.inventory.count('blok:kumaş_beyaz')).toBe(2);
  });

  it('merdiven: tırmanılabilir blok (fizik: zıpla + ileri ile yükselir)', () => {
    const edits = new Map();
    const world = {
      getBlock(x, y, z) {
        const k = x + ',' + y + ',' + z;
        if (edits.has(k)) return edits.get(k);
        return y <= 0 || (x === 3 && y >= 1 && y <= 12) ? B.STONE : 0;
      },
    };
    for (let y = 1; y <= 12; y++) edits.set('2,' + y + ',0', B.LADDER);
    const body = createPlayerBody(2.5, 1, 0.5);
    for (let i = 0; i < 30; i++) stepPlayer(body, {}, world, 1 / 60);
    for (let i = 0; i < 120; i++) stepPlayer(body, { jump: true, moveZ: 1, yaw: -Math.PI / 2 }, world, 1 / 60);
    expect(body.y).toBeGreaterThan(4);
    expect(body.climbing).toBe(true);
  });

  it('tüm istasyonlar için en az bir tarif ve bir istasyon bloğu var', () => {
    STATIONS.filter((s) => s !== 'el').forEach((s) => {
      expect(RECIPES.some((r) => r.station === s), s).toBe(true);
    });
  });
});

describe('görev ve başarım ölçütleri (üretim)', () => {
  it('sandık zinciri: üret → koy → doldur; atölye/tam takım/zırhlı başarımları', () => {
    const p = createProgression(1);
    const craft = (item, count = 1) => p.onEvent({ type: 'itemCrafted', item, count });
    for (let i = 0; i < 3; i++) p.onEvent({ type: 'blockBroken', id: B.LOG_OAK });
    craft('blok:meşe_tahta', 8);
    craft('blok:tezgah');
    p.onEvent({ type: 'blockPlaced', id: B.WORKBENCH });
    craft('item:sopa', 4);
    craft('item:kazma_ahşap');
    expect(p.activeQuest().id).toBe('sandik_yap');
    craft('blok:sandık');
    expect(p.activeQuest().id).toBe('sandik_koy');
    p.onEvent({ type: 'blockPlaced', id: B.CHEST });
    expect(p.activeQuest().id).toBe('sandik_doldur');
    p.onEvent({ type: 'chestStored', item: 'item:elma' });
    expect(p.questsDone.sandik_doldur).toBe(true);
    expect(p.stats.chestStores).toBe(1);
    // başarımlar
    ['item:kazma_taş', 'item:balta_taş', 'item:kürek_taş', 'item:kılıç_taş'].forEach((k) => craft(k));
    craft('blok:ocak');
    craft('blok:taş_kesici');
    craft('blok:dokuma_tezgahı');
    ['item:miğfer_deri', 'item:göğüslük_deri', 'item:bacaklık_deri', 'item:çizme_deri'].forEach((k) => craft(k));
    p.onEvent({ type: 'sync' });
    const done = p.achievements.slice();
    ['ilk_uretim', 'tam_takim', 'zirhli', 'atolye'].forEach((id) => expect(done, id).toContain(id));
  });
});
