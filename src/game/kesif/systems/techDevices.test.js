import { describe, expect, it } from 'vitest';
import { B, makeTechG } from './techGameTestKit.js';
import { events } from './blocksTestKit.js';

const GROUND = 40;
const api = (sys) => sys.api();

function powerSetup(k) {
  const { G } = k;
  G.inventory.add('item:kömür', 8);
  k.place(10, GROUND + 1, 10, B.TECH_GENERATOR);
  k.place(11, GROUND + 1, 10, B.TECH_CABLE);
  k.place(12, GROUND + 1, 10, B.TECH_LAMP);
  k.moveTo(10.5, GROUND + 1, 11.5);
  return api(k.sys);
}

describe('ışınlanma platformu ve asansör', () => {
  function pads(k) {
    const { G } = k;
    G.inventory.add('item:kömür', 16);
    k.place(10, GROUND + 1, 10, B.TECH_TELEPORTER);
    k.place(14, GROUND + 1, 10, B.TECH_TELEPORTER);
    for (let x = 11; x <= 13; x++) k.place(x, GROUND + 1, 10, B.TECH_CABLE);
    k.place(12, GROUND + 2, 10, B.TECH_GENERATOR);
    k.moveTo(10.5, GROUND + 1.5, 11.5);
    const a = api(k.sys);
    expect(a.machineAction(12, GROUND + 2, 10, { type: 'fuel', item: 'item:kömür', count: 8 }).ok).toBe(true);
    expect(a.setMachineConfig(10, GROUND + 1, 10, { freq: '0123' }).ok).toBe(true);
    expect(a.setMachineConfig(14, GROUND + 1, 10, { freq: '0123' }).ok).toBe(true);
    return a;
  }

  it('aynı frekanstaki eşe ışınlar: konum, enerji bedeli, olay; hazır olmadan reddeder', () => {
    const k = makeTechG();
    const a = pads(k);
    k.moveTo(10.5, GROUND + 1.5, 10.5);
    const early = a.machineAction(10, GROUND + 1, 10, { type: 'teleport' });
    expect(early.ok).toBe(false);
    k.step(900);
    k.moveTo(10.5, GROUND + 1.5, 10.5);
    const info = a.getMachineInfo(10, GROUND + 1, 10);
    expect(info.partner).toEqual({ x: 14, y: GROUND + 1, z: 10 });
    expect(info.ready).toBe(true);
    expect(info.onPad).toBe(true);
    const r = a.machineAction(10, GROUND + 1, 10, { type: 'teleport' });
    expect(r.ok).toBe(true);
    expect(k.G.body.x).toBeCloseTo(14.5, 1);
    expect(k.G.body.y).toBeCloseTo(GROUND + 1.5, 1);
    expect(events(k.G, 'teleported').length).toBe(1);
    const again = a.machineAction(14, GROUND + 1, 10, { type: 'teleport' });
    expect(again.ok).toBe(false);
    expect(['bekleme', 'enerji']).toContain(again.reason);
  });

  it('platformun üstünde değilken kullanılamaz; sağ tık ayarlı platformda ışınlanır', () => {
    const k = makeTechG();
    const a = pads(k);
    k.step(900);
    k.moveTo(10.5, GROUND + 1, 14.5);
    expect(a.machineAction(10, GROUND + 1, 10, { type: 'teleport' }).ok).toBe(false);
    k.moveTo(10.5, GROUND + 1.5, 10.5);
    k.aim(10, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.body.x).toBeCloseTo(14.5, 1);
  });

  it('kilitli bölgedeki hedefe ışınlanmaz (mühür kuralı)', () => {
    const k = makeTechG();
    const a = pads(k);
    k.step(900);
    k.G.world.isZoneUnlocked = () => false;
    k.moveTo(10.5, GROUND + 1.5, 10.5);
    const r = a.machineAction(10, GROUND + 1, 10, { type: 'teleport' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('kilitli');
    expect(k.G.body.x).toBeCloseTo(10.5, 1);
  });

  it('asansör: platformdan platforma yumuşakça taşır (animasyon), enerji harcar, aşağı için çömelir', () => {
    const k = makeTechG();
    const { G } = k;
    G.inventory.add('item:kömür', 16);
    const a = api(k.sys);
    k.place(20, GROUND + 1, 20, B.TECH_LIFT);
    k.place(20, GROUND + 7, 20, B.TECH_LIFT);
    k.place(21, GROUND + 1, 20, B.TECH_GENERATOR);
    k.place(21, GROUND + 7, 20, B.TECH_GENERATOR);
    k.place(21, GROUND + 6, 20, B.STONE);
    k.moveTo(20.5, GROUND + 1.5, 20.5);
    expect(a.machineAction(21, GROUND + 1, 20, { type: 'fuel', item: 'item:kömür', count: 4 }).ok).toBe(true);
    expect(a.machineAction(21, GROUND + 7, 20, { type: 'fuel', item: 'item:kömür', count: 4 }).ok).toBe(true);
    k.step(900);
    k.moveTo(20.5, GROUND + 1.5, 20.5);
    const info = a.getMachineInfo(20, GROUND + 1, 20);
    expect(info.up).toBe(GROUND + 7);
    expect(info.down).toBeNull();
    const r = a.machineAction(20, GROUND + 1, 20, { type: 'lift', dir: 1 });
    expect(r.ok).toBe(true);
    k.step(120, { physics: false });
    expect(k.G.body.y).toBeCloseTo(GROUND + 7.5, 1);
    expect(events(k.G, 'lifted').length).toBe(1);
    k.step(700);
    k.moveTo(20.5, GROUND + 7.5, 20.5);
    const down = a.machineAction(20, GROUND + 7, 20, { type: 'lift', dir: -1 });
    expect(down.ok).toBe(true);
  });
});

describe('portal tabancası (açık dünya)', () => {
  function walls(k) {
    // A duvarı: x=14 düzlemi (batıya bakan yüz), B duvarı: z=20 düzlemi (kuzeye bakan yüz)
    for (let y = GROUND + 1; y <= GROUND + 4; y++) {
      for (let z = 6; z <= 10; z++) k.place(14, y, z, B.STONE);
      for (let x = 7; x <= 11; x++) k.place(x, y, 20, B.STONE);
    }
    k.G.inventory.setSlot(0, 'item:portal_tabancası', 1);
    k.G.inventory.selected = 0;
    k.moveTo(8.5, GROUND + 1, 8.5);
  }
  const yawEast = -Math.PI / 2;

  it('iki portal açar: şarj düşer, olaylar, çerçeveler; aynı renk yenisi eskisini taşır', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    const gun = k.G.inventory.slots[0];
    const c0 = gun.charge;
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(true);
    k.aim(9, GROUND + 2, 20);
    expect(a.shootPortal('turuncu')).toBe(true);
    expect(gun.charge).toBe(c0 - 2);
    const fr = a.getPortals();
    expect(fr.mavi).toBeTruthy();
    expect(fr.turuncu).toBeTruthy();
    expect(fr.mavi.n).toEqual([-1, 0, 0]);
    expect(events(k.G, 'portalPlaced').length).toBe(2);
    k.aim(14, GROUND + 3, 7);
    expect(a.shootPortal('mavi')).toBe(true);
    expect(a.getPortals().mavi.cells[0].z).toBe(7);
    expect(events(k.G, 'portalPlaced').length).toBe(3);
  });

  it('geçersiz yüzeye ya da şarjsızken atış şarj harcamaz', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    const gun = k.G.inventory.slots[0];
    const c0 = gun.charge;
    k.look(yawEast, 1.2); // gökyüzü
    expect(a.shootPortal('mavi')).toBe(false);
    expect(gun.charge).toBe(c0);
    gun.charge = 0;
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(false); // hücre yok
    expect(gun.charge).toBe(0);
    k.G.inventory.add('item:enerji_hücresi', 1);
    expect(a.shootPortal('mavi')).toBe(true); // hücre otomatik yüklenir (+12, −1)
    expect(gun.charge).toBe(11);
  });

  it('portala yürüyünce öbür portaldan çıkar: konum, hız yönü, bakış (yaw), düşme hasarı sıfırlanır', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    a.shootPortal('mavi');
    k.aim(9, GROUND + 2, 20);
    a.shootPortal('turuncu');
    k.look(yawEast, 0);
    k.moveTo(10.5, GROUND + 1, 8.5);
    let used = 0;
    for (let i = 0; i < 240 && !used; i++) {
      k.step(1, { moveZ: 1 });
      used = events(k.G, 'portalUsed').length;
    }
    expect(used).toBe(1);
    const b = k.G.body;
    expect(b.z).toBeLessThan(20);
    expect(b.z).toBeGreaterThan(18);
    expect(b.x).toBeGreaterThan(8);
    expect(b.x).toBeLessThan(11);
    expect(b.vz).toBeLessThan(-3); // turuncu portalın normali −Z: o yöne çıkar
    const yaw = ((k.G.player.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    expect(Math.min(yaw, Math.PI * 2 - yaw)).toBeLessThan(0.3);
    expect(b.fallPeakY).toBeCloseTo(b.y, 3);
    k.step(30, { moveZ: 1 });
    expect(events(k.G, 'portalUsed').length).toBe(1); // ping-pong yok
  });

  it('yerdeki eşya ve yaratık portaldan geçer; eşya dördüncü geçişten sonra portalları yok sayar', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    a.shootPortal('mavi');
    k.aim(9, GROUND + 2, 20);
    a.shootPortal('turuncu');
    const fr = a.getPortals().mavi;
    const c = fr.center;
    const item = {
      id: 1, item: 'item:kömür', count: 1, x: c[0] + fr.n[0] * 0.25, y: c[1], z: c[2], vx: 3, vy: 0, vz: 0, w: 0.3, h: 0.3,
    };
    k.G.em.items = new Map([[1, item]]);
    const mob = {
      id: 2, type: 'koyun', x: c[0] + fr.n[0] * 0.25, y: c[1] - 0.9, z: c[2], vx: 2, vy: 0, vz: 0, w: 0.6, h: 1.0, yaw: 0,
    };
    k.G.em.queryMobs = () => [mob];
    k.step(15);
    expect(item.z).toBeGreaterThan(17); // turuncu portalın önüne çıktı (B duvarı z=20, normal −Z)
    expect(item.z).toBeLessThan(20);
    expect(item.vz).toBeLessThan(-3);
    expect(mob.z).toBeGreaterThan(17);
    expect(item._pn).toBe(1);
    item._pn = 4; // dördüncü geçişten sonra yok sayılır
    item._pcd = 0;
    item.x = c[0] + fr.n[0] * 0.25; item.y = c[1]; item.z = c[2]; item.vx = 3; item.vz = 0;
    k.step(30);
    expect(item.z).toBeCloseTo(c[2], 5);
  });

  it('bulmaca odasında ve mühürlü bölgede açılmaz; arka blok kırılınca portal kapanır', () => {
    const k = makeTechG();
    walls(k);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    k.G.puzzles = { ownerAt: () => ({ id: 'p' }) };
    expect(a.shootPortal('mavi')).toBe(false);
    expect(k.G.hints.some((h) => /Bulmaca odalarında/.test(h[0]))).toBe(true);
    k.G.puzzles = null;
    k.G.world.isZoneUnlocked = () => false;
    expect(a.shootPortal('mavi')).toBe(false);
    delete k.G.world.isZoneUnlocked;
    expect(a.shootPortal('mavi')).toBe(true);
    const fr = a.getPortals().mavi;
    k.place(fr.back[0].x, fr.back[0].y, fr.back[0].z, 0);
    k.step(30);
    expect(a.getPortals().mavi).toBeNull();
    expect(events(k.G, 'portalClosed').length).toBe(1);
  });

  it('sistem blokları (mühür bariyeri) ve harita modu: portal açılmaz', () => {
    const k = makeTechG();
    walls(k);
    k.place(14, GROUND + 2, 8, B.SEAL_BARRIER);
    const a = api(k.sys);
    k.look(yawEast, 0);
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(false);
    const h = makeTechG({ mode: 'harita' });
    expect(api(h.sys).shootPortal('mavi')).toBe(false);
  });
});

describe('kayıt ve modlar', () => {
  it('serialize → restore: makineler, yakıt, portallar geri gelir; bozuk veri atılır', () => {
    const k = makeTechG();
    const a = powerSetup(k);
    a.machineAction(10, GROUND + 1, 10, { type: 'fuel', item: 'item:kömür', count: 3 });
    for (let y = GROUND + 1; y <= GROUND + 3; y++) for (let z = 6; z <= 10; z++) k.place(14, y, z, B.STONE);
    k.G.inventory.setSlot(0, 'item:portal_tabancası', 1);
    k.G.inventory.selected = 0;
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.look(-Math.PI / 2, 0);
    k.aim(14, GROUND + 2, 8);
    expect(a.shootPortal('mavi')).toBe(true);
    k.step(200);
    const raw = JSON.parse(JSON.stringify(k.sys.serialize()));
    expect(raw.v).toBe(1);
    expect(Object.keys(raw.t.m).length).toBe(2); // jeneratör + lamba (kablo kayıtsız)
    const k2 = makeTechG();
    for (let y = GROUND + 1; y <= GROUND + 3; y++) for (let z = 6; z <= 10; z++) k2.place(14, y, z, B.STONE);
    k2.sys.restore(k2.G, raw);
    expect(k2.tech.count()).toBe(2);
    const st = k2.tech.get(10, GROUND + 1, 10);
    expect(st.t).toBe('jenerator');
    expect(k2.tech.portals.mavi).toBeTruthy();
    expect(k2.sys.serialize().t.p.mavi).toEqual(raw.t.p.mavi);
    k2.sys.restore(k2.G, { t: { m: { 'x,y,z': 5 }, p: { mavi: [1, 2, 3] } }, seen: [1, {}, 'ok'] });
    expect(k2.tech.count()).toBe(0);
    expect(k2.tech.portals.mavi).toBeNull();
    k2.sys.restore(k2.G, null);
    k2.sys.restore(k2.G, 'çöp');
  });

  it('insa/harita modunda tech kapalı: makine yok sayılır, HUD boş, serialize null, panel açılmaz', () => {
    ['insa', 'harita'].forEach((mode) => {
      const k = makeTechG({ mode });
      k.place(5, GROUND + 1, 5, B.TECH_GENERATOR);
      k.step(120);
      expect(k.G.hud.energy).toBeNull();
      expect(k.sys.serialize()).toBeNull();
      expect(api(k.sys).getMachineInfo(5, GROUND + 1, 5)).toBeNull();
      expect(api(k.sys).machineAction(5, GROUND + 1, 5, { type: 'press' }).ok).toBe(false);
      expect(k.G.survival.shieldHook).toBeUndefined();
    });
  });
});
