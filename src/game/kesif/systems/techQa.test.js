/*
 * KEŞİF — QA5 (teknoloji katmanı + portal tabancası) regresyon testleri: matkap güvenliği, portal sınırları, jetpack/harita kuralları.
 * Gerçek World/Inventory/TechState + tech sistemi (techGameTestKit).
 */
import { describe, expect, it } from 'vitest';
import { B, makeTechG } from './techGameTestKit.js';
import { events } from './blocksTestKit.js';
import { structuresInRegion } from '../sim/structures.js';
import { structureGatedAt } from './techCtx.js';
import { techBaseId } from '../sim/techData.js';

const GROUND = 40;
const yawEastLocal = -Math.PI / 2;
const api = (sys) => sys.api();

function gen(k, x, y, z, coal = 20) {
  k.G.inventory.add('item:kömür', coal);
  k.place(x, y, z, B.TECH_GENERATOR);
  expect(api(k.sys).machineAction(x, y, z, { type: 'fuel', item: 'item:kömür', count: coal }).ok).toBe(true);
}

/** Madenci (10,42,10) iki jeneratörle çalışır; altındaki (10,41,10) hücresine `id` konur. */
function drillRig(id, opts) {
  const k = makeTechG();
  gen(k, 10, GROUND + 3, 10);
  gen(k, 9, GROUND + 3, 10);
  k.place(10, GROUND + 2, 10, B.TECH_DRILL);
  k.place(9, GROUND + 2, 10, B.TECH_CABLE);
  k.place(11, GROUND + 3, 10, B.TECH_CABLE);
  if (id !== null) k.place(10, GROUND + 1, 10, id);
  if (opts && opts.mode) api(k.sys).setMachineConfig(10, GROUND + 2, 10, { mode: opts.mode });
  k.moveTo(10.5, GROUND + 3, 15.5);
  return k;
}
const drillInfo = (k) => api(k.sys).getMachineInfo(10, GROUND + 2, 10);

describe('otomatik madenci güvenliği', () => {
  it('oyuncunun kurduğu etkileşimli ve teknoloji blokları kırılmaz: korumalı durur, blok yerinde kalır', () => {
    [B.CHEST, B.WORKBENCH, B.FURNACE, B.TECH_LAB, B.TECH_BATTERY, B.TECH_CABLE, B.TECH_TELEPORTER, B.ENCHANT_TABLE, B.BED].filter((id) => id !== undefined).forEach((id) => {
      const k = drillRig(id);
      k.step(60 * 8);
      const left = k.G.world.getBlock(10, GROUND + 1, 10);
      expect(left === id || (techBaseId(left) > 0 && techBaseId(left) === techBaseId(id)), 'blok ' + id).toBe(true);
      const info = drillInfo(k);
      expect(info.stop, 'durma nedeni ' + id).toBe('korumali');
      expect(info.mined).toBe(0);
      expect(events(k.G, 'drillStopped').map((e) => e.reason)).toEqual(['korumali']);
    });
  });

  it('korumalı bloğu kaldırıp "yeniden başlat" deyince sürdürür; sandık içeriği kaybolmaz', () => {
    const k = drillRig(B.CHEST);
    k.G.chests.set('10,' + (GROUND + 1) + ',10', [{ item: 'item:elmas', count: 3 }]);
    k.step(60 * 6);
    expect(drillInfo(k).stop).toBe('korumali');
    expect(k.G.chests.get('10,' + (GROUND + 1) + ',10')[0].count).toBe(3);
    k.G.world.setBlock(10, GROUND + 1, 10, 0);
    expect(api(k.sys).setMachineConfig(10, GROUND + 2, 10, { restart: true }).ok).toBe(true);
    k.step(60 * 10);
    expect(drillInfo(k).mined).toBeGreaterThan(0);
  });

  it('alan modunda komşu hücreler kazılır, korumalı hücrede katman bitince durur (ana kaya ile karışmaz)', () => {
    const k = drillRig(null, { mode: 'alan' });
    k.place(11, GROUND, 10, B.CHEST); // 5×5'in bir hücresi (çimen katmanı)
    k.step(60 * 40);
    const info = drillInfo(k);
    expect(k.G.world.getBlock(11, GROUND, 10)).toBe(B.CHEST);
    expect(info.stop).toBe('korumali');
    expect(info.mined).toBeGreaterThanOrEqual(12); // aynı katmandaki diğer hücreler kazıldı
  });

  it('bulmaca odasına ait hücreyi kırmaz (G.puzzles.ownerAt)', () => {
    const k = drillRig(null);
    k.G.puzzles = { ownerAt: (x, y, z) => (x === 10 && z === 10 && y <= GROUND ? 'oda1' : null) };
    k.step(60 * 20);
    const info = drillInfo(k);
    expect(info.stop).toBe('korumali');
    expect(k.G.world.getBlock(10, GROUND, 10)).not.toBe(0);
  });

  it('kilitli bölgeye kazmaz (isZoneUnlocked false)', () => {
    const k = drillRig(null);
    k.G.world.isZoneUnlocked = () => false;
    k.step(60 * 10);
    expect(drillInfo(k).stop).toBe('korumali');
    expect(k.G.world.getBlock(10, GROUND, 10)).not.toBe(0);
  });

  it('boss arenası / mühür sunağı sınırı korunur (structureGatedAt); sıradan yapılar etkilenmez', () => {
    const k = makeTechG();
    const list = structuresInRegion(k.G.seed, -1400, -1400, 1400, 1400);
    const gated = list.find((s) => s.type === 'muhursunagi');
    const plain = list.find((s) => s.type === 'kamp');
    expect(gated).toBeTruthy();
    const b = gated.bounds;
    expect(structureGatedAt(k.G, b.x0 + 2, b.y0 + 3, b.z0 + 2)).toBe(true);
    expect(structureGatedAt(k.G, b.x0 + 2, b.y1 + 30, b.z0 + 2)).toBe(false);
    expect(structureGatedAt(k.G, b.x0 - 5, b.y0 + 3, b.z0 - 5)).toBe(false);
    if (plain) expect(structureGatedAt(k.G, plain.bounds.x0 + 2, plain.bounds.y0 + 2, plain.bounds.z0 + 2)).toBe(false);
  });

  it('kayıt gidiş-dönüş: korumalı durma nedeni korunur; eski kayıtlar bozulmaz', () => {
    const k = drillRig(B.CHEST);
    k.step(60 * 6);
    const raw = JSON.parse(JSON.stringify(k.sys.serialize()));
    const k2 = makeTechG();
    k2.sys.restore(k2.G, raw);
    expect(api(k2.sys).getMachineInfo(10, GROUND + 2, 10).stop).toBe('korumali');
  });
});

describe('portal tabancası sınırları', () => {
  function walls(k) {
    for (let y = GROUND + 1; y <= GROUND + 4; y++) {
      for (let z = 6; z <= 10; z++) k.place(14, y, z, B.STONE);
      for (let x = 7; x <= 11; x++) k.place(x, y, 20, B.STONE);
    }
    k.G.inventory.setSlot(0, 'item:portal_tabancası', 1);
    k.G.inventory.selected = 0;
    k.moveTo(8.5, GROUND + 1, 8.5);
  }
  const yawEast = -Math.PI / 2;

  it('portalın ön hücresine blok konursa portal kapanır (görünmez portal kalmaz); içine çiçek gibi geçilebilir blok koymak kapatmaz', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(true);
    const fr = a.getPortals().mavi;
    const c = fr.cells[1];
    k.G.world.setBlock(c.x, c.y, c.z, B.TORCH || 0);
    k.step(30);
    expect(a.getPortals().mavi).toBeTruthy();
    k.G.world.setBlock(c.x, c.y, c.z, B.STONE);
    k.step(30);
    expect(a.getPortals().mavi).toBeNull();
    expect(events(k.G, 'portalClosed').length).toBe(1);
  });

  it('portalın komşu bloğa vurup bulmaca odasının içine açılması engellenir (hücre sahipliği), şarj harcanmaz', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    const gun = k.G.inventory.slots[0];
    const c0 = gun.charge;
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    // yalnız ön hücreler odanın: x=13 düzlemi
    k.G.puzzles = { ownerAt: (x) => (x === 13 ? 'oda1' : null) };
    expect(a.shootPortal('mavi')).toBe(false);
    expect(a.getPortals().mavi).toBeNull();
    expect(gun.charge).toBe(c0);
    k.G.puzzles = null;
    expect(a.shootPortal('mavi')).toBe(true);
  });

  it('kilitli bölgede biten çıkış: hücreler bölgeye göre denetlenir', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    // x ≥ 14 bölgesi kilitli sayılsın: vurulan blok (x=14) kilitli → reddedilir
    k.G.world.isZoneUnlocked = () => false;
    expect(a.shootPortal('mavi')).toBe(false);
    delete k.G.world.isZoneUnlocked;
    expect(a.shootPortal('mavi')).toBe(true);
  });
});

describe('parkur sırasında teknoloji kısayolları kapalı (jetpack gibi)', () => {
  function setup() {
    const k = makeTechG();
    for (let y = GROUND + 1; y <= GROUND + 4; y++) {
      for (let z = 6; z <= 10; z++) k.place(14, y, z, B.STONE);
      for (let x = 7; x <= 11; x++) k.place(x, y, 20, B.STONE);
    }
    k.G.inventory.setSlot(0, 'item:portal_tabancası', 1);
    k.G.inventory.selected = 0;
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.look(-Math.PI / 2, 0);
    return k;
  }

  it('portal atışı reddedilir, şarj harcanmaz; parkur bitince açılır', () => {
    const k = setup();
    const a = api(k.sys);
    const gun = k.G.inventory.slots[0];
    const c0 = gun.charge;
    k.G.hud.parkour = { timer: 3, checkpoint: 0, difficulty: 1 };
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(false);
    expect(gun.charge).toBe(c0);
    expect(k.G.hints.some((h) => /Parkur sırasında/.test(h[0]))).toBe(true);
    k.G.hud.parkour = null;
    expect(a.shootPortal('mavi')).toBe(true);
  });

  it('açık iki portalın içinden geçilemez (parkur); parkur bitince geçilir', () => {
    const k = setup();
    const a = api(k.sys);
    k.aim(14, GROUND + 2, 8);
    a.shootPortal('mavi');
    k.aim(9, GROUND + 2, 20);
    a.shootPortal('turuncu');
    k.G.hud.parkour = { timer: 1, checkpoint: 0, difficulty: 1 };
    k.look(yawEastLocal, 0);
    k.moveTo(10.5, GROUND + 1, 8.5);
    for (let i = 0; i < 200; i++) k.step(1, { moveZ: 1 });
    expect(events(k.G, 'portalUsed').length).toBe(0);
    k.G.hud.parkour = null;
    k.moveTo(10.5, GROUND + 1, 8.5);
    k.look(yawEastLocal, 0);
    for (let i = 0; i < 240 && events(k.G, 'portalUsed').length === 0; i++) k.step(1, { moveZ: 1 });
    expect(events(k.G, 'portalUsed').length).toBe(1);
  });

  it('ışınlanma platformu ve asansör parkurda reddedilir (neden "parkur")', () => {
    const k = makeTechG();
    k.G.inventory.add('item:kömür', 16);
    k.place(10, GROUND + 1, 10, B.TECH_TELEPORTER);
    k.place(14, GROUND + 1, 10, B.TECH_TELEPORTER);
    for (let x = 11; x <= 13; x++) k.place(x, GROUND + 1, 10, B.TECH_CABLE);
    k.place(12, GROUND + 2, 10, B.TECH_GENERATOR);
    k.moveTo(10.5, GROUND + 1.5, 11.5);
    const a = api(k.sys);
    a.machineAction(12, GROUND + 2, 10, { type: 'fuel', item: 'item:kömür', count: 8 });
    a.setMachineConfig(10, GROUND + 1, 10, { freq: '0123' });
    a.setMachineConfig(14, GROUND + 1, 10, { freq: '0123' });
    k.step(900);
    k.moveTo(10.5, GROUND + 1.5, 10.5);
    k.G.hud.parkour = { timer: 1, checkpoint: 0, difficulty: 1 };
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'teleport' }).reason).toBe('parkur');
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'lift', dir: 1 }).reason).toBe('parkur');
    k.G.hud.parkour = null;
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'teleport' }).ok).toBe(true);
  });
});
