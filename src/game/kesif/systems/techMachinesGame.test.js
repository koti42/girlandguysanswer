import { describe, expect, it } from 'vitest';
import { B, makeTechG } from './techGameTestKit.js';
import { events } from './blocksTestKit.js';

const GROUND = 40;
const api = (sys) => sys.api();

function gen(k, x, y, z, coal = 8) {
  k.G.inventory.add('item:kömür', coal);
  k.place(x, y, z, B.TECH_GENERATOR);
  expect(api(k.sys).machineAction(x, y, z, { type: 'fuel', item: 'item:kömür', count: coal }).ok).toBe(true);
}

describe('düğme, kapı, sensör', () => {
  it('düğme sağ tıkla devreyi açıp kapatır: lamba yanar/söner; çömelince panel açılır', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10);
    k.place(11, GROUND + 1, 10, B.TECH_BUTTON);
    k.place(12, GROUND + 1, 10, B.TECH_CABLE);
    k.place(13, GROUND + 1, 10, B.TECH_LAMP);
    k.moveTo(11.5, GROUND + 1, 12.5);
    k.step(120);
    expect(k.G.world.getBlock(13, GROUND + 1, 10)).toBe(B.TECH_LAMP); // düğme kapalı: akım geçmez
    k.aim(11, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(events(k.G, 'buttonPressed').length).toBe(1);
    k.step(120);
    expect(k.G.world.getBlock(13, GROUND + 1, 10)).toBe(B.TECH_LAMP_ON);
    k.step(30);
    k.aim(11, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    k.step(120);
    expect(k.G.world.getBlock(13, GROUND + 1, 10)).toBe(B.TECH_LAMP);
    // çömelirken (boş elle) panel açılır
    k.G.player.crouching = true;
    k.step(30);
    k.aim(11, GROUND + 1, 10);
    k.step(2, { placePressed: true, crouch: true });
    expect(k.G.ui).toBe('machine');
    expect(api(k.sys).getMachineInfo().type).toBe('dugme');
  });

  it('lamba sağ tıkla panel açar (renk + anahtar); anahtarı kapatınca söner; çömelip blok koyunca panel açılmaz', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10);
    k.place(11, GROUND + 1, 10, B.TECH_CABLE);
    k.place(12, GROUND + 1, 10, B.TECH_LAMP);
    k.moveTo(12.5, GROUND + 1, 14.5);
    k.step(120);
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_LAMP_ON);
    k.aim(12, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.ui).toBe('machine');
    const info = api(k.sys).getMachineInfo();
    expect(info.type).toBe('lamba');
    expect(info.off).toBe(false);
    expect(api(k.sys).setMachineConfig(12, GROUND + 1, 10, { hue: 5 }).ok).toBe(true);
    expect(api(k.sys).setMachineConfig(12, GROUND + 1, 10, { off: true }).ok).toBe(true);
    k.step(30);
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_LAMP);
    expect(api(k.sys).getMachineInfo(12, GROUND + 1, 10)).toMatchObject({ off: true, hue: 5, on: false });
    k.G.setUi(null);
    // çömel + elinde blok: yerleştirme önceliklidir, panel açılmaz
    k.G.inventory.setSlot(0, 'blok:taş', 4);
    k.G.inventory.selected = 0;
    k.G.player.crouching = true;
    k.aim(12, GROUND + 1, 10);
    k.step(3, { placePressed: true, crouch: true });
    expect(k.G.ui).not.toBe('machine');
  });

  it('güç kapısı: enerji varken açılır (çarpışma yok), enerji gidince kapanır; içeride oyuncu varsa kapanmaz', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10, 1);
    k.place(11, GROUND + 1, 10, B.TECH_CABLE);
    k.place(12, GROUND + 1, 10, B.TECH_DOOR);
    k.moveTo(12.5, GROUND + 1, 14.5);
    k.step(240);
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_DOOR_OPEN);
    // oyuncu kapı hücresinde dururken yakıt biter → kapanmaz
    k.moveTo(12.5, GROUND + 1, 10.5);
    for (let i = 0; i < 60; i++) {
      const g = k.tech.get(10, GROUND + 1, 10);
      g.fuel = null; g.burnT = 0;
      k.step(30, { physics: false });
    }
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_DOOR_OPEN);
    k.moveTo(12.5, GROUND + 1, 14.5);
    k.step(180);
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_DOOR);
  });
});

describe('ocak, madenci, şarj', () => {
  it('elektrikli ocak: ham demiri eritir (panel eylemleri), ürünü alır, girdiyi geri alır; geçersiz girdi reddedilir', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10);
    k.place(11, GROUND + 1, 10, B.TECH_FURNACE);
    k.G.inventory.add('item:ham_demir', 4);
    k.G.inventory.add('item:sopa', 2);
    k.moveTo(11.5, GROUND + 1, 12.5);
    const a = api(k.sys);
    expect(a.machineAction(11, GROUND + 1, 10, { type: 'smelt', item: 'item:sopa', count: 2 }).ok).toBe(false);
    const r = a.machineAction(11, GROUND + 1, 10, { type: 'smelt', item: 'item:ham_demir', count: 4 });
    expect(r.ok).toBe(true);
    expect(k.G.inventory.count('item:ham_demir')).toBe(0);
    k.step(60 * 14);
    const info = a.getMachineInfo(11, GROUND + 1, 10);
    expect(info.outCount).toBeGreaterThanOrEqual(2);
    const t = a.machineAction(11, GROUND + 1, 10, { type: 'takeSmelt' });
    expect(t.ok).toBe(true);
    expect(k.G.inventory.count('item:demir_külçe')).toBeGreaterThanOrEqual(2);
    const back = a.machineAction(11, GROUND + 1, 10, { type: 'takeInput' });
    expect(back.ok).toBe(true);
    expect(a.machineAction(11, GROUND + 1, 10, { type: 'takeInput' }).ok).toBe(false);
  });

  it('otomatik madenci: aşağı kazar, eşyalar bitişik sandığa gider; sandık yoksa tampon (drillTake)', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 3, 10, 16);
    gen(k, 9, GROUND + 2, 10, 16); // madenci 20 EU/sn ister: tek jeneratör (12) yetmez
    k.place(10, GROUND + 2, 10, B.TECH_DRILL);
    k.place(11, GROUND + 2, 10, B.CHEST);
    k.place(10, GROUND + 2, 11, B.TECH_CABLE);
    k.place(10, GROUND + 2, 12, B.TECH_CABLE);
    k.moveTo(10.5, GROUND + 3, 14.5);
    // zemin: drill'in altı dolu (y ≤ 40) ve üstündeki hücre
    k.step(60 * 12);
    const info = api(k.sys).getMachineInfo(10, GROUND + 2, 10);
    expect(info.type).toBe('matkap');
    expect(info.mined + 0).toBeGreaterThan(0);
    const chest = k.G.chests.get('11,' + (GROUND + 2) + ',10');
    const inChest = chest ? chest.filter(Boolean).reduce((n, s) => n + s.count, 0) : 0;
    expect(inChest + info.buffer.reduce((n, s) => n + s.count, 0)).toBeGreaterThan(0);
    expect(events(k.G, 'drilled').length).toBeGreaterThan(0);
  });

  it('pil bankası: şarjlı eşya elde sağ tık → eşya dolar, EU düşer; boşken neden; şarj istasyonu çantayı doldurur', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10, 8);
    k.place(11, GROUND + 1, 10, B.TECH_BATTERY);
    k.place(11, GROUND + 2, 10, B.TECH_LAMP); // tüketici: jeneratör yalnız talep varken yanar, artan enerji pili doldurur
    k.moveTo(11.5, GROUND + 1, 12.5);
    k.step(60 * 20);
    const bat = k.tech.get(11, GROUND + 1, 10);
    expect(bat.stored).toBeGreaterThan(100);
    k.G.inventory.setSlot(0, 'item:kazma_elektrikli', 1);
    k.G.inventory.selected = 0;
    k.G.inventory.slots[0].charge = 100;
    const before = bat.stored;
    k.aim(11, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.inventory.slots[0].charge).toBeGreaterThan(100);
    expect(bat.stored).toBeLessThan(before);
    expect(k.G.ui).toBe('none'); // doldurma paneli açmaz
    expect(k.G.log.some((e) => e[0] === 'sound' && e[1] === 'tech:charge')).toBe(true);
    // şarj istasyonu (sonradan eklenir: tamponu dolana dek ağın artan enerjisini emer): yanında dururken tamponundan çantayı doldurur
    k.place(12, GROUND + 1, 10, B.TECH_CHARGER);
    k.step(2);
    const ch = k.tech.get(12, GROUND + 1, 10);
    ch.buf = 300;
    k.G.inventory.slots[0].charge = 10;
    k.step(120);
    expect(k.G.inventory.slots[0].charge).toBeGreaterThan(10);
  });
});

describe('laboratuvar, kırılma, doğrulama', () => {
  it('Laboratuvara sağ tık: üret paneli laboratuvar istasyonu sabitlenerek açılır; yakındaki istasyon listesine girer', () => {
    const k = makeTechG();
    k.place(10, GROUND + 1, 10, B.TECH_LAB);
    k.moveTo(10.5, GROUND + 1, 12.5);
    k.aim(10, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.ui).toBe('crafting');
    const bapi = k.k.sys.api();
    expect(bapi.getStationFocus()).toBe('laboratuvar');
    expect(bapi.getStations()).toContain('laboratuvar');
    const rec = bapi.getRecipes({ station: 'laboratuvar' });
    expect(rec.length).toBeGreaterThanOrEqual(25);
    expect(rec.some((r) => r.id === 'portal_tabancası')).toBe(true);
  });

  it('makine kırılınca içeriği (yakıt, ocak, madenci tamponu) yere düşer; panel açıksa kapanır', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10, 5);
    k.moveTo(10.5, GROUND + 1, 12.5);
    k.aim(10, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.ui).toBe('machine');
    k.clearLog();
    k.G.world.setBlock(10, GROUND + 1, 10, 0);
    expect(k.G.items.some((i) => i.item === 'item:kömür' && i.count === 5)).toBe(true);
    k.step(2);
    expect(k.G.ui).toBe('none');
    expect(k.tech.has(10, GROUND + 1, 10)).toBe(false);
  });

  it('machineAction doğrulama: uzak, olmayan makine, bilinmeyen eylem, ölü oyuncu, bozuk sayı', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10, 2);
    const a = api(k.sys);
    k.moveTo(40.5, GROUND + 1, 40.5);
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'takeFuel' }).reason).toBe('uzak');
    k.moveTo(10.5, GROUND + 1, 12.5);
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'bilinmeyen' }).reason).toBe('eylem');
    expect(a.machineAction(30, GROUND + 1, 10, { type: 'press' }).ok).toBe(false);
    expect(a.machineAction(NaN, 1, 1, { type: 'press' }).ok).toBe(false);
    expect(a.machineAction(10, GROUND + 1, 10, null).ok).toBe(false);
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'fuel', item: 'item:elmas', count: 1 }).ok).toBe(false);
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'fuel', item: 'item:kömür', count: -5 }).ok).toBe(false);
    k.G.player.dead = true;
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'takeFuel' }).reason).toBe('olu');
    k.G.player.dead = false;
    expect(a.setMachineConfig(10, GROUND + 1, 10, { mode: 'x' }).ok).toBe(false);
    expect(a.setMachineConfig(NaN, 0, 0, {}).ok).toBe(false);
    expect(a.getMachineInfo(5, 5, 5)).toBeNull();
  });

  it('HUD: yakındaki makinenin ağı; uzaklaşınca kaybolur; eldeki şarjlı eşya', () => {
    const k = makeTechG();
    gen(k, 10, GROUND + 1, 10, 4);
    k.place(11, GROUND + 1, 10, B.TECH_BATTERY);
    k.place(10, GROUND + 2, 10, B.TECH_LAMP);
    k.moveTo(10.5, GROUND + 1, 12.5);
    k.step(120);
    expect(k.G.hud.energy).toBeTruthy();
    expect(k.G.hud.energy.max).toBe(5000);
    expect(k.G.hud.energy.live).toBe(true);
    k.moveTo(40.5, GROUND + 1, 40.5);
    k.step(30);
    expect(k.G.hud.energy).toBeNull();
    k.G.inventory.setSlot(0, 'item:kazma_elektrikli', 1);
    k.G.inventory.selected = 0;
    k.step(10);
    expect(k.G.hud.charge.item).toBe('item:kazma_elektrikli');
    expect(k.G.hud.charge.name).toBe('Elektrikli Kazma');
  });
});
