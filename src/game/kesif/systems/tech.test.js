import { describe, expect, it } from 'vitest';
import { B, makeTechG } from './techGameTestKit.js';
import { events } from './blocksTestKit.js';
import { applyDamage } from '../sim/survival.js';

const GROUND = 40;

function api(sys) {
  return sys.api();
}

/** Jeneratör (10,41,10) – kablo (11,41,10) – lamba (12,41,10); jeneratöre kömür koyar. */
function powerSetup(k) {
  const { G } = k;
  G.inventory.add('item:kömür', 8);
  k.place(10, GROUND + 1, 10, B.TECH_GENERATOR);
  k.place(11, GROUND + 1, 10, B.TECH_CABLE);
  k.place(12, GROUND + 1, 10, B.TECH_LAMP);
  k.moveTo(10.5, GROUND + 1, 11.5);
  return api(k.sys);
}

describe('tech sistemi: kurulum ve enerji ağı', () => {
  it('init: G.tech, G.techUi, kancalar ve kalkan kancası kurulur', () => {
    const k = makeTechG();
    expect(k.G.tech).toBeTruthy();
    expect(k.G.techUi).toEqual({ pos: null, type: null });
    expect(typeof k.G.techUse).toBe('function');
    expect(typeof k.G.techPortalShoot).toBe('function');
    expect(typeof k.G.survival.shieldHook).toBe('function');
  });

  it('makine blokları yerleştirilince kayıt defterine girer, kırılınca silinir', () => {
    const k = makeTechG();
    k.place(10, GROUND + 1, 10, B.TECH_BATTERY);
    expect(k.tech.has(10, GROUND + 1, 10)).toBe(true);
    k.place(10, GROUND + 1, 10, 0);
    expect(k.tech.has(10, GROUND + 1, 10)).toBe(false);
  });

  it('jeneratör + kablo + lamba: yakıt konunca lamba yanar (etkin blok), yakıt bitince söner', () => {
    const k = makeTechG();
    const a = powerSetup(k);
    const r = a.machineAction(10, GROUND + 1, 10, { type: 'fuel', item: 'item:kömür', count: 1 });
    expect(r.ok).toBe(true);
    expect(k.G.inventory.count('item:kömür')).toBe(7);
    k.step(200);
    expect(k.G.world.getBlock(12, GROUND + 1, 10)).toBe(B.TECH_LAMP_ON);
    expect(k.G.world.getBlock(10, GROUND + 1, 10)).toBe(B.TECH_GENERATOR_ON);
    const ev = events(k.G, 'poweredChanged');
    expect(ev.some((e) => e.machine === 'lamba' && e.on)).toBe(true);
    const info = a.getMachineInfo(10, GROUND + 1, 10);
    expect(info.type).toBe('jenerator');
    expect(info.network.nodes).toBe(3);
  });

  it('makine paneli: sağ tık G.setUi(machine) açar; uzaklaşınca kapanır', () => {
    const k = makeTechG();
    powerSetup(k);
    k.aim(10, GROUND + 1, 10);
    k.step(2, { placePressed: true });
    expect(k.G.ui).toBe('machine');
    expect(k.G.techUi.pos).toEqual({ x: 10, y: GROUND + 1, z: 10 });
    expect(api(k.sys).getMachineUi().type).toBe('jenerator');
    k.moveTo(40.5, GROUND + 1, 11.5);
    k.step(40);
    expect(k.G.ui).toBe('none');
  });
});

function hold(k, key, count = 1) {
  const { G } = k;
  G.inventory.setSlot(0, key, count);
  G.inventory.selected = 0;
  return G.inventory.slots[0];
}

describe('jetpack', () => {
  it('çubukta + yakıtlı: zıplama basılı tutulunca zıplama tepesinin ÜSTÜNE çıkar, yakıt azalır, olay yayılır', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:jetpack');
    slot.charge = 1000;
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.step(5);
    let peak = k.G.body.y;
    k.step(1, { jump: true, jumpPressed: true });
    for (let i = 0; i < 90; i++) {
      k.step(1, { jump: true });
      peak = Math.max(peak, k.G.body.y);
    }
    expect(peak).toBeGreaterThan(GROUND + 1 + 4); // normal zıplama ≈1,25 blok
    expect(slot.charge).toBeLessThan(1000);
    expect(slot.charge).toBeGreaterThan(900);
    expect(k.G.tech && k.G.hud.jetpack).toBeTruthy();
    expect(events(k.G, 'jetpackFuel').length).toBeGreaterThan(0);
    expect(k.G.log.some((e) => e[0] === 'sound' && e[1] === 'tech:jetpack')).toBe(true);
  });

  it('yakıt bitince itiş durur; çantada Enerji Hücresi varsa kendiliğinden yakıta çevrilir', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:jetpack');
    slot.charge = 4;
    k.G.inventory.add('item:enerji_hücresi', 2);
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.step(1, { jump: true, jumpPressed: true });
    for (let i = 0; i < 120; i++) k.step(1, { jump: true });
    expect(k.G.inventory.count('item:enerji_hücresi')).toBeLessThan(2); // hücre harcandı
    expect(k.G.hints.some((h) => /Enerji Hücresi yakıta/.test(h[0]))).toBe(true);
  });

  it('parkur sürerken itiş kapalıdır', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:jetpack');
    slot.charge = 1000;
    k.G.hud.parkour = { timer: 3, checkpoint: 0, difficulty: 1 };
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.step(1, { jump: true, jumpPressed: true });
    let peak = 0;
    for (let i = 0; i < 60; i++) {
      k.step(1, { jump: true });
      peak = Math.max(peak, k.G.body.y);
    }
    expect(peak).toBeLessThan(GROUND + 1 + 2);
    expect(slot.charge).toBe(1000);
  });

  it('sağ tık: Enerji Hücresiyle yakıt doldurur; hücre yoksa neden söylenir', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:jetpack');
    slot.charge = 100;
    k.look(0, 1.4); // gökyüzüne bak: hedef blok yok → eşya kullanımı
    k.G.inventory.add('item:enerji_hücresi', 1);
    k.step(2, { placePressed: true });
    expect(slot.charge).toBe(320);
    expect(k.G.inventory.count('item:enerji_hücresi')).toBe(0);
    k.step(20);
    k.step(2, { placePressed: true });
    expect(k.G.hints.some((h) => /Enerji Hücren yok/.test(h[0]))).toBe(true);
  });
});

describe('tarayıcı', () => {
  it('sağ tık: çevredeki cevheri bulur, şarj harcar, olay + HUD + ses', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:tarayıcı');
    const before = slot.charge;
    k.place(14, GROUND + 3, 8, 28); // elmas cevheri
    k.place(10, GROUND - 6, 10, 26); // demir
    k.look(0, 1.4);
    k.step(2, { placePressed: true });
    expect(slot.charge).toBe(before - 8);
    const ev = events(k.G, 'scanPing');
    expect(ev.length).toBe(1);
    expect(ev[0].count).toBeGreaterThanOrEqual(2);
    const pings = k.tech.scanner.pings;
    expect(pings.some((p) => p.kind === 'elmas')).toBe(true);
    k.step(10);
    const hs = k.G.hud.scanner;
    expect(hs.pings.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(hs.heading)).toBeLessThanOrEqual(Math.PI + 1e-6);
    expect(k.G.log.some((e) => e[0] === 'sound' && e[1] === 'tech:scan')).toBe(true);
  });

  it('çubukta taşırken 6 sn aralıkla kendiliğinden tarar; şarj bitince taramaz', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:tarayıcı');
    k.place(12, GROUND + 2, 12, 27);
    k.step(60 * 7);
    expect(events(k.G, 'scanPing').length).toBeGreaterThanOrEqual(1);
    slot.charge = 3;
    k.clearLog();
    k.step(60 * 7);
    expect(events(k.G, 'scanPing').length).toBe(0);
  });
});

describe('elektrikli alet ve kalkan', () => {
  it('elektrikli kazma her kırılan blokta 2 şarj harcar', () => {
    const k = makeTechG();
    const slot = hold(k, 'item:kazma_elektrikli');
    const before = slot.charge;
    k.aim(8, GROUND, 6);
    k.moveTo(8.5, GROUND + 1, 8.5);
    k.aim(8, GROUND, 7);
    k.step(240, { breakHeld: true, attackPressed: true });
    expect(k.G.world.getBlock(8, GROUND, 7)).toBe(0);
    expect(slot.charge).toBeLessThan(before);
    expect((before - slot.charge) % 2).toBe(0);
  });

  it('Kuantum Zırhı: şarjlı parçalar hasarın bir kısmını emer ve şarjı harcar; olay shieldAbsorb', () => {
    const k = makeTechG();
    const inv = k.G.inventory;
    ['miğfer_kzırh', 'göğüslük_kzırh'].forEach((n) => {
      inv.addStack('item:' + n, 1);
      const idx = inv.slots.findIndex((s) => s && s.item === 'item:' + n);
      inv.equip(idx);
    });
    const charges = inv.armor.filter(Boolean).map((s) => s.charge);
    expect(charges.length).toBe(2);
    const hp0 = k.G.survival.hp;
    const dmg = applyDamage(k.G.survival, 10, { type: 'yaratık', mode: 'macera' });
    expect(dmg).toBeLessThan(10);
    expect(k.G.survival.hp).toBeGreaterThan(hp0 - 10);
    const after = inv.armor.filter(Boolean).map((s) => s.charge);
    expect(after[0] + after[1]).toBeLessThan(charges[0] + charges[1]);
    expect(k.G.survival.events.some((e) => e.type === 'shieldAbsorb')).toBe(true);
  });
});
