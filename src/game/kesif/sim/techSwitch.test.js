import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { TechState } from './techState.js';
import { LAMP_HUES, isSwitchable } from './techMachines.js';
import { makeWorld, newTech, place, run } from './techTestKit.js';

function lampRig() {
  const w = makeWorld({ floorY: 59, bedrockY: 50 });
  const tech = newTech(5);
  place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
  place(w, tech, 1, 60, 0, B.TECH_CABLE);
  place(w, tech, 2, 60, 0, B.TECH_LAMP);
  place(w, tech, 3, 60, 0, B.TECH_CABLE);
  place(w, tech, 4, 60, 0, B.TECH_FURNACE);
  tech.insertFuel(0, 60, 0, 'item:kömür', 10);
  return { w, tech };
}

describe('Makine açma/kapama anahtarı', () => {
  it('lamba kapatılınca söner ve talep etmez; açılınca yeniden yanar', () => {
    const { w, tech } = lampRig();
    run(tech, w, 3, {}, 0.5);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(tech.machineInfo(2, 60, 0).off).toBe(false);
    expect(tech.setMachineConfig(2, 60, 0, { off: true }).ok).toBe(true);
    run(tech, w, 1, {}, 0.5);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    expect(tech.machineInfo(2, 60, 0).off).toBe(true);
    expect(tech.machineInfo(2, 60, 0).network.demand).toBeLessThan(1e-6);
    tech.setMachineConfig(2, 60, 0, { off: false });
    run(tech, w, 2, {}, 0.5);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
  });

  it('kapalı jeneratör yakıt yakmaz ve üretmez; açılınca devam eder', () => {
    const { w, tech } = lampRig();
    tech.setMachineConfig(0, 60, 0, { off: true });
    const before = tech.get(0, 60, 0).fuel.count;
    run(tech, w, 10, {}, 0.5);
    expect(tech.get(0, 60, 0).fuel.count).toBe(before);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    tech.setMachineConfig(0, 60, 0, { off: false });
    run(tech, w, 3, {}, 0.5);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(tech.get(0, 60, 0).fuel.count).toBeLessThan(before);
  });

  it('kapalı ocak ilerlemez ve enerji çekmez', () => {
    const { w, tech } = lampRig();
    tech.furnaceInsert(4, 60, 0, 'item:ham_demir', 4);
    tech.setMachineConfig(4, 60, 0, { off: true });
    run(tech, w, 12, {}, 0.5);
    expect(tech.get(4, 60, 0).outCount).toBe(0);
    expect(tech.get(4, 60, 0).prog).toBe(0);
    tech.setMachineConfig(4, 60, 0, { off: false });
    run(tech, w, 12, {}, 0.5);
    expect(tech.get(4, 60, 0).outCount).toBeGreaterThan(0);
  });

  it('anahtarlanamayan makineler ve geçersiz renk reddedilir; kayıt gidiş-dönüşü off/hue korur', () => {
    const { w, tech } = lampRig();
    place(w, tech, 5, 60, 0, B.TECH_BATTERY);
    expect(isSwitchable('pil')).toBe(false);
    expect(tech.setMachineConfig(5, 60, 0, { off: true }).reason).toBe('ayar_yok');
    expect(tech.setMachineConfig(2, 60, 0, { hue: 99 }).reason).toBe('renk');
    expect(tech.setMachineConfig(2, 60, 0, { hue: 4 }).ok).toBe(true);
    expect(tech.machineInfo(2, 60, 0).hueName).toBe(LAMP_HUES[4].name);
    tech.setMachineConfig(4, 60, 0, { off: true });
    const json = JSON.parse(JSON.stringify(tech.serialize()));
    const back = new TechState({ seed: 5 }).restore(json, { minY: 0, maxY: 127 });
    expect(back.get(2, 60, 0).hue).toBe(4);
    expect(back.get(4, 60, 0).off).toBe(true);
    expect(back.get(0, 60, 0).off).toBeUndefined();
    expect(back.serialize()).toEqual(json);
  });

  it('bozuk kayıt: off yalnız true kabul edilir, hue sınırlanır', () => {
    const t = new TechState({ seed: 1 }).restore({
      v: 1, m: { '0,60,0': { t: 'lamba', on: true, off: 'evet', hue: 77 }, '1,60,0': { t: 'pil', off: true, hue: 3 }, '2,60,0': { t: 'ocak', off: true } },
    }, { minY: 0, maxY: 127 });
    const lamp = t.get(0, 60, 0);
    expect(lamp.off).toBeUndefined();
    expect(lamp.hue).toBe(LAMP_HUES.length - 1); // aralık dışı değer sınırlanır
    expect(t.get(1, 60, 0).off).toBeUndefined();
    expect(t.get(1, 60, 0).hue).toBeUndefined();
    expect(t.get(2, 60, 0).off).toBe(true);
  });
});
