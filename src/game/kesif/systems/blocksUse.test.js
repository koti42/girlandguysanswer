import { describe, expect, it } from 'vitest';
import { B } from '../sim/blocks.js';
import { setClockPhase } from '../sim/daynight.js';
import { structuresInRegion } from '../sim/structures.js';
import { lootForChest } from '../sim/loot.js';
import {
  chestKey, lootAt, openChestSlots, restoreChests, serializeChests, slotsFromLoot, takeChestContents,
} from './blocksChest.js';
import { compassText, signText } from './blocksUse.js';
import { events, makeG, sounds } from './blocksTestKit.js';

function use(g, x, y, z, input) {
  g.aim(x, y, z);
  g.step(1, Object.assign({ placePressed: true }, input || {}));
}

describe('sandık', () => {
  it('sandığa sağ tık: sandık arayüzü açılır, G.chestPos ayarlanır, boş sandık oluşur', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    use(g, 8, 41, 5);
    expect(g.G.ui).toBe('chest');
    expect(g.G.chestPos).toEqual({ x: 8, y: 41, z: 5 });
    const slots = g.G.chests.get('8,41,5');
    expect(slots.length).toBe(27);
    expect(slots.every((s) => s === null)).toBe(true);
    expect(events(g.G, 'chestOpened')[0]).toMatchObject({ x: 8, y: 41, z: 5, id: B.CHEST });
    expect(sounds(g.G, 'chest_open').length).toBe(1);
  });

  it('arayüz kapanınca G.chestPos silinir; uzaklaşınca otomatik kapanır', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    use(g, 8, 41, 5);
    g.G.setUi(null);
    expect(g.G.chestPos).toBeNull();
    g.step(10);
    use(g, 8, 41, 5);
    expect(g.G.ui).toBe('chest');
    g.G.body.x = 30;
    g.step(2);
    expect(g.G.ui).toBe('none');
  });

  it('yapı sandığı ganimeti belirlenimcidir ve loot.lootForChest ile aynıdır', () => {
    const g = makeG();
    const seed = g.G.world.seed;
    const list = structuresInRegion(seed, -200, -200, 200, 200).filter((s) => s.chests.length > 0);
    expect(list.length).toBeGreaterThan(0);
    const c = list[0].chests[0];
    const a = lootAt(g.G, c.x, c.y, c.z);
    const b = lootAt(makeG().G, c.x, c.y, c.z);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(c.loot);
    const direct = lootForChest(seed, { x: c.x, y: c.y, z: c.z }, {
      structType: list[0].type, zone: list[0].zone, tier: list[0].difficulty, kind: c.kind, index: c.index,
    });
    expect(direct.length).toBeGreaterThan(0);
    const slots = openChestSlots(g.G, c.x, c.y, c.z);
    const total = (arr) => arr.reduce((n, e) => n + (e ? e.count : 0), 0);
    expect(total(slots)).toBe(total(a.map((e) => ({ count: e.count }))));
    expect(slots.filter(Boolean).length).toBeGreaterThanOrEqual(a.length);
    // ikinci açış aynı (tüketilmiş) hali verir
    slots[0] = null;
    expect(openChestSlots(g.G, c.x, c.y, c.z)[0]).toBeNull();
  });

  it('ganimet yığın sınırına bölünür; araçlar tek tek', () => {
    const slots = slotsFromLoot([{ item: 'blok:taş', count: 100 }, { item: 'item:kazma_taş', count: 1 }]);
    expect(slots[0]).toEqual({ item: 'blok:taş', count: 64 });
    expect(slots[1]).toEqual({ item: 'blok:taş', count: 36 });
    expect(slots[2].item).toBe('item:kazma_taş');
    expect(slots[2].dur).toBe(132);
  });

  it('sandık kırılınca içeriği saçılır ve kayıt silinir', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(8, 41, 5, B.CHEST);
    const slots = openChestSlots(G, 8, 41, 5);
    slots[3] = { item: 'item:elmas', count: 2 };
    G.inventory.setSlot(0, 'item:balta_taş', 1);
    g.aim(8, 41, 5);
    for (let i = 0; i < 200 && G.world.getBlock(8, 41, 5) === B.CHEST; i++) g.step(1, { breakHeld: true });
    expect(G.world.getBlock(8, 41, 5)).toBe(B.AIR);
    expect(G.chests.has('8,41,5')).toBe(false);
    const names = G.items.map((i) => i.item);
    expect(names).toContain('item:elmas');
    expect(names).toContain('blok:sandık');
  });

  it('serialize/restore: yalnız geçerli kayıtlar, dayanıklılık korunur', () => {
    const g = makeG();
    const { G } = g;
    const s = openChestSlots(G, 1, 41, 2);
    s[0] = { item: 'blok:taş', count: 5 };
    s[1] = { item: 'item:kazma_taş', count: 1, dur: 50 };
    const data = JSON.parse(JSON.stringify(serializeChests(G)));
    const h = makeG();
    restoreChests(h.G, data);
    expect(h.G.chests.get('1,41,2')[0]).toEqual({ item: 'blok:taş', count: 5 });
    expect(h.G.chests.get('1,41,2')[1].dur).toBe(50);
    restoreChests(h.G, [['x', []], ['1,2,3', 'oops'], ['4,5,6', [['bilinmeyen', 3], ['blok:taş', 999]]]]);
    expect(h.G.chests.has('x')).toBe(false);
    expect(h.G.chests.get('4,5,6')[0]).toBeNull();
    expect(h.G.chests.get('4,5,6')[1]).toEqual({ item: 'blok:taş', count: 64 });
    restoreChests(h.G, 'çöp');
    expect(h.G.chests.size).toBe(0);
    expect(chestKey(1, 2, 3)).toBe('1,2,3');
    expect(takeChestContents(h.G, 9, 9, 9)).toEqual([]);
  });

  it('sistem serialize/restore sandıkları ve yatak noktasını taşır', () => {
    const g = makeG();
    openChestSlots(g.G, 2, 41, 2)[0] = { item: 'blok:taş', count: 3 };
    g.G.bedSpawn = { x: 1.5, y: 42, z: 2.5 };
    const data = JSON.parse(JSON.stringify(g.sys.serialize(g.G)));
    const h = makeG();
    h.sys.restore(h.G, data);
    expect(h.G.chests.get('2,41,2')[0].count).toBe(3);
    expect(h.G.bedSpawn).toEqual({ x: 1.5, y: 42, z: 2.5 });
    h.sys.restore(h.G, null);
    h.sys.restore(h.G, { bed: { x: 'a' } });
  });
});

describe('kapı', () => {
  it('kapıya tıklayınca açılır, tekrar kapanır; dikey yığın birlikte', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(6, 41, 5, B.DOOR);
    G.world.setBlock(6, 42, 5, B.DOOR);
    use(g, 6, 41, 5);
    expect(G.world.getBlock(6, 41, 5)).toBe(B.DOOR_OPEN);
    expect(G.world.getBlock(6, 42, 5)).toBe(B.DOOR_OPEN);
    expect(events(G, 'doorToggled')[0]).toMatchObject({ open: true });
    expect(sounds(G, 'door_open').length).toBe(1);
    g.step(10);
    use(g, 6, 41, 5);
    expect(G.world.getBlock(6, 41, 5)).toBe(B.DOOR);
    expect(G.world.getBlock(6, 42, 5)).toBe(B.DOOR);
  });

  it('oyuncu kapının olduğu hücredeyse kapatılamaz', () => {
    const g = makeG();
    const { G } = g;
    G.world.setBlock(6, 41, 5, B.DOOR_OPEN);
    G.body.x = 6.5;
    G.body.z = 5.7; // gövde kapalı kapı kutusuna (z 5.8125..6) girer
    expect(g.G.blocks.toggleDoor(6, 41, 5)).toBe(true);
    expect(G.world.getBlock(6, 41, 5)).toBe(B.DOOR_OPEN);
    expect(G.hud.hint).toBe('Kapının önünde biri var.');
    G.body.z = 8.5;
    expect(g.G.blocks.toggleDoor(6, 41, 5)).toBe(true);
    expect(G.world.getBlock(6, 41, 5)).toBe(B.DOOR);
  });
});

describe('yatak', () => {
  function bedSetup() {
    const g = makeG();
    g.G.world.setBlock(6, 41, 5, B.BED);
    return g;
  }

  it('gündüz: doğma noktası ayarlanır ama uyunmaz', () => {
    const g = bedSetup();
    setClockPhase(g.G.clock, 0.25);
    use(g, 6, 41, 5);
    expect(g.G.bedSpawn).toEqual({ x: 6.5, y: 42, z: 5.5 });
    expect(Math.round(g.G.clock.time)).toBe(Math.round(0.25 * g.G.clock.dayLengthSec));
    expect(events(g.G, 'bedUsed').length).toBe(1);
    expect(events(g.G, 'slept').length).toBe(0);
  });

  it('gece ve düşman yok: sabaha atlar', () => {
    const g = bedSetup();
    setClockPhase(g.G.clock, 0.75);
    const day0 = g.G.clock.day;
    use(g, 6, 41, 5);
    expect(g.G.clock.day).toBe(day0 + 1);
    expect(g.G.clock.time).toBe(0);
    expect(events(g.G, 'slept').length).toBe(1);
  });

  it('gece ama yakında düşman var: uyunmaz', () => {
    const g = bedSetup();
    setClockPhase(g.G.clock, 0.75);
    g.G.em.queryMobs = (x, z, r, f) => [{ type: 'golge', dead: false, x: 7, y: 41, z: 6 }].filter(f);
    use(g, 6, 41, 5);
    expect(events(g.G, 'slept').length).toBe(0);
    expect(g.G.clock.time).toBeGreaterThan(0.7 * g.G.clock.dayLengthSec);
    expect(g.G.bedSpawn).toBeTruthy();
  });
});

describe('tabela, kitaplık, kol, istasyon', () => {
  it('yapı tabelası metni ve boş tabela', () => {
    const g = makeG();
    const list = structuresInRegion(g.G.world.seed, -200, -200, 200, 200).filter((s) => s.signs.length > 0);
    const sg = list[0].signs[0];
    expect(signText(g.G, sg.x, sg.y, sg.z)).toBe(sg.text);
    expect(signText(g.G, 5, 41, 5)).toMatch(/hiçbir şey/);
    g.G.world.setBlock(6, 41, 5, B.SIGN);
    use(g, 6, 41, 5);
    expect(g.G.log.some((e) => e[0] === 'speak' && /hiçbir şey/.test(e[1]))).toBe(true);
  });

  it('kitaplık konuma göre sabit bir Türkçe satır söyler', () => {
    const g = makeG();
    g.G.world.setBlock(6, 41, 5, B.BOOKSHELF);
    use(g, 6, 41, 5);
    const t = g.G.log.filter((e) => e[0] === 'speak').map((e) => e[1]);
    expect(t.length).toBe(1);
    const h = makeG();
    h.G.world.setBlock(6, 41, 5, B.BOOKSHELF);
    use(h, 6, 41, 5);
    expect(h.G.log.filter((e) => e[0] === 'speak').map((e) => e[1])).toEqual(t);
  });

  it('kol: bulmaca yoksa açılıp kapanır ve olay yayar', () => {
    const g = makeG();
    g.G.world.setBlock(6, 41, 5, B.LEVER);
    use(g, 6, 41, 5);
    expect(g.G.world.getBlock(6, 41, 5)).toBe(B.LEVER_ON);
    expect(events(g.G, 'leverToggled')[0].on).toBe(true);
    g.step(10);
    use(g, 6, 41, 5);
    expect(g.G.world.getBlock(6, 41, 5)).toBe(B.LEVER);
  });

  it('tezgah/ocak/örs: üretim arayüzü açılır ve istasyon sabitlenir', () => {
    ['tezgah', 'ocak', 'örs'].forEach((k, i) => {
      const g = makeG();
      const id = [B.WORKBENCH, B.FURNACE, B.IRON_BLOCK][i];
      g.G.world.setBlock(8, 41, 4, id);
      g.G.body.z = 8.5;
      use(g, 8, 41, 4);
      expect(g.G.ui).toBe('crafting');
      expect(g.S.pinned.kind).toBe(k);
      g.G.setUi(null);
      expect(g.S.pinned).toBeNull();
    });
  });

  it('inşa modunda tezgah arayüz açmaz (ipucu)', () => {
    const g = makeG({ mode: 'insa' });
    g.G.world.setBlock(8, 41, 4, B.WORKBENCH);
    use(g, 8, 41, 4);
    expect(g.G.ui).toBe('none');
  });

  it('pusula metni yön ve uzaklık verir', () => {
    const g = makeG();
    g.G.spawn = { x: 8.5, y: 41, z: -40 };
    expect(compassText(g.G)).toMatch(/kuzey yönünde, yaklaşık 49 blok/);
    g.G.spawn = { x: 8.5, y: 41, z: 8.5 };
    expect(compassText(g.G)).toBe('Başlangıç noktasındasın.');
  });
});

describe('kullanım sırası ve olaylar', () => {
  it('önce bulmaca yöneticisi sorulur; ele alırsa sandık açılmaz', () => {
    const g = makeG();
    const seen = [];
    g.G.puzzles = { handleInteract: (e) => { seen.push(e); return true; } };
    g.G.inventory.setSlot(0, 'item:küçük_anahtar', 1);
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    use(g, 8, 41, 5);
    expect(g.G.ui).toBe('none');
    expect(seen[0]).toMatchObject({
      type: 'use', x: 8, y: 41, z: 5, item: 'item:küçük_anahtar', playerId: 'player',
    });
    g.G.puzzles = { handleInteract: () => false };
    g.step(10);
    use(g, 8, 41, 5);
    expect(g.G.ui).toBe('chest');
  });

  it('tüketilmeyen sistem bloğu kullanımı blockUse olarak yayılır ve yerleştirme yapılmaz', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'blok:taş', 4);
    g.G.world.setBlock(8, 41, 5, B.ALTAR);
    use(g, 8, 41, 5);
    const ev = events(g.G, 'blockUse');
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ x: 8, y: 41, z: 5, id: B.ALTAR, item: 'blok:taş' });
    expect(events(g.G, 'blockPlaced').length).toBe(0);
    expect(g.G.inventory.held().count).toBe(4);
  });

  it('düz blok kullanımı da blockUse yayar (ardından yerleştirme)', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'blok:taş', 4);
    use(g, 8, 40, 5);
    expect(events(g.G, 'blockUse').length).toBe(1);
    expect(events(g.G, 'blockPlaced').length).toBe(1);
  });
});

describe('yeme, zırh, eşya kullanımı', () => {
  it('elma: basılı tutarak yenir (animasyon ilerler), açlık artar, 1 adet gider, eaten olayı', () => {
    const g = makeG();
    g.G.survival.hunger = 10;
    g.G.inventory.setSlot(0, 'item:elma', 3);
    g.step(1, { placePressed: true, placeHeld: true });
    expect(g.G.fpState.eating).toBeGreaterThanOrEqual(0);
    g.step(40, { placeHeld: true });
    expect(g.G.fpState.eating).toBeGreaterThan(0.3);
    expect(g.G.survival.hunger).toBe(10);
    g.step(60, { placeHeld: true });
    expect(g.G.survival.hunger).toBe(14);
    expect(g.G.inventory.held().count).toBe(2);
    expect(g.G.fpState.eating).toBe(-1);
    expect(events(g.G, 'eaten')[0].item).toBe('item:elma');
    // tuşu bırakmadan tekrar yemez
    g.step(120, { placeHeld: true });
    expect(g.G.inventory.held().count).toBe(2);
  });

  it('erken bırakınca yeme iptal olur ve hiçbir şey tüketilmez', () => {
    const g = makeG();
    g.G.survival.hunger = 10;
    g.G.inventory.setSlot(0, 'item:elma', 3);
    g.step(1, { placePressed: true, placeHeld: true });
    g.step(20, { placeHeld: true });
    g.step(5, {});
    expect(g.G.fpState.eating).toBe(-1);
    g.step(100, {});
    expect(g.G.inventory.held().count).toBe(3);
    expect(g.G.survival.hunger).toBe(10);
  });

  it('dokunmatikte bir dokunuş yeterli; hasar alınca iptal', () => {
    const g = makeG();
    g.G.survival.hunger = 10;
    g.G.inventory.setSlot(0, 'item:elma', 3);
    g.step(1, { placePressed: true, touch: true });
    g.step(100, { touch: true });
    expect(g.G.inventory.held().count).toBe(2);
    const h = makeG();
    h.G.survival.hunger = 10;
    h.G.inventory.setSlot(0, 'item:elma', 3);
    h.step(1, { placePressed: true, touch: true });
    h.step(20, { touch: true });
    h.G.survival.hp -= 3;
    h.step(5, { touch: true });
    expect(h.G.fpState.eating).toBe(-1);
  });

  it('tok iken yemez; ipucu verir', () => {
    const g = makeG();
    g.G.survival.hunger = g.G.survival.maxHunger;
    g.G.inventory.setSlot(0, 'item:elma', 3);
    g.step(1, { placePressed: true, placeHeld: true });
    expect(g.G.fpState.eating).toBe(-1);
    expect(g.G.hud.hint).toMatch(/tok|dolu/);
  });

  it('şifa iksiri canı doldurur; can doluysa içilmez', () => {
    const g = makeG();
    g.G.survival.hp = 5;
    g.G.inventory.setSlot(0, 'item:şifa_iksiri', 2);
    g.step(1, { placePressed: true, placeHeld: true });
    g.step(80, { placeHeld: true });
    expect(g.G.survival.hp).toBeGreaterThan(5);
    expect(g.G.inventory.held().count).toBe(1);
  });

  it('elde zırh: sağ tık giydirir, eski parça elde kalır', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'item:miğfer_demir', 1);
    g.step(1, { placePressed: true });
    expect(g.G.inventory.armor[0].item).toBe('item:miğfer_demir');
    expect(g.G.inventory.held()).toBeNull();
    expect(events(g.G, 'armorEquipped').length).toBe(1);
  });

  it('Q: tek adet fırlatır, çömelirken tüm yığın', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'blok:taş', 10);
    g.sys.onAction(g.G, { type: 'drop' });
    expect(g.G.inventory.held().count).toBe(9);
    expect(g.G.items.length).toBe(1);
    expect(g.G.items[0].opts.delay).toBeGreaterThan(1);
    g.G.inputState.crouch = true;
    g.sys.onAction(g.G, { type: 'drop' });
    expect(g.G.inventory.held()).toBeNull();
    expect(g.G.items[1].count).toBe(9);
  });

  it('yetenek eşyası: macerada yeteneği açar', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'item:çift_zıplama_botları', 1);
    g.step(1, { interactPressed: true });
    expect(g.G.abilities.doubleJump).toBe(true);
  });

  it('EntityManager toplama geri çağrısı: kalan döner, itemPickup olayı ses+olay üretir', () => {
    const g = makeG();
    const left = g.G.pickupItem('blok:taş', 70, undefined);
    expect(left).toBe(0);
    expect(g.G.inventory.count('blok:taş')).toBe(70);
    g.G.emit({ type: 'itemPickup', item: 'blok:taş', count: 3, x: 1, y: 2, z: 3 });
    expect(events(g.G, 'itemPickedUp')[0]).toMatchObject({ item: 'blok:taş', count: 3 });
    expect(sounds(g.G, 'pickup').length).toBe(1);
    const full = makeG();
    for (let i = 0; i < 40; i++) full.G.inventory.add('blok:taş', 64);
    expect(full.G.pickupItem('blok:taş', 64)).toBe(64);
    expect(full.G.pickupItem('item:kazma_demir', 1, 77)).toBe(1);
  });

  it('ölünce/arayüz açılınca yeme ve kırma durur', () => {
    const g = makeG();
    g.G.survival.hunger = 10;
    g.G.inventory.setSlot(0, 'item:elma', 3);
    g.step(1, { placePressed: true, placeHeld: true });
    g.G.setUi('inventory');
    expect(g.S.eat.active).toBe(false);
    expect(g.G.fpState.eating).toBe(-1);
  });
});

describe('içerik sistemiyle sözleşme', () => {
  it('blockUse ele alındıysa (evt.handled) düz blokta yerleştirme yapılmaz', () => {
    const g = makeG();
    const orig = g.G.emit;
    g.G.emit = (e) => {
      if (e.type === 'blockUse') e.handled = true;
      orig(e);
    };
    g.G.inventory.setSlot(0, 'blok:taş', 4);
    use(g, 8, 40, 5);
    expect(events(g.G, 'blockPlaced').length).toBe(0);
    expect(g.G.inventory.held().count).toBe(4);
  });

  it('tabela: içerik ele alırsa yerel okuma yapılmaz; almazsa yerel metin', () => {
    const g = makeG();
    g.G.world.setBlock(6, 41, 5, B.SIGN);
    const orig = g.G.emit;
    g.G.emit = (e) => {
      if (e.type === 'blockUse') e.handled = true;
      orig(e);
    };
    use(g, 6, 41, 5);
    expect(g.G.log.some((e) => e[0] === 'speak')).toBe(false);
  });

  it('savaş girdiyi tüketmişse (combatClaim.use) yerleştirme/kullanma olmaz; attack ise kırma olmaz', () => {
    const g = makeG();
    g.G.inventory.setSlot(0, 'blok:taş', 4);
    g.G.combatClaim = { attack: false, use: true };
    use(g, 8, 40, 5);
    expect(events(g.G, 'blockPlaced').length).toBe(0);
    g.G.combatClaim = { attack: true, use: false };
    g.G.world.setBlock(8, 40, 6, B.DIRT);
    g.G.inventory.setSlot(0, null);
    g.aim(8, 40, 6);
    g.step(120, { breakHeld: true, attackPressed: true });
    expect(g.G.world.getBlock(8, 40, 6)).toBe(B.DIRT);
    g.G.combatClaim = { attack: false, use: false };
    g.step(60, { breakHeld: true });
    expect(g.G.world.getBlock(8, 40, 6)).toBe(B.AIR);
  });

  it('bağlamsal ipucu: sandığa bakınca "[Sağ tık] Sandığı aç", dokunmatikte "Kullan: …", bakış kayınca silinir', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    g.aim(8, 41, 5);
    g.step(1);
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.hud.hint).toBe('[Sağ tık] Sandığı aç');
    g.G.inputState.touch = true;
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.hud.hint).toBe('Kullan: Sandığı aç'); // kendi bağlamsal ipucu yeni cihaza göre yenilenir
    g.G.inputState.touch = false;
    g.aim(3, 40, 8);
    g.step(1);
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.hud.hint).toBeNull();
  });

  it('başka sistemin ipucunu ezmez', () => {
    const g = makeG();
    g.G.world.setBlock(8, 41, 5, B.CHEST);
    g.aim(8, 41, 5);
    g.step(1);
    g.G.hud.hint = 'Bulmaca ipucu';
    g.sys.frameUpdate(g.G, 1 / 60, 1);
    expect(g.G.hud.hint).toBe('Bulmaca ipucu');
  });
});
