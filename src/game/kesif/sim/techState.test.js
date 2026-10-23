import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { Inventory } from './inventory.js';
import { TechState } from './techState.js';
import { createTech, techHud } from './tech.js';
import { MACHINE_TYPES, TECH_BLOCK_DEFS, TECH_RATES } from './techData.js';
import { isMachineType } from './techMachines.js';
import { makeWorld, newTech, place, run } from './techTestKit.js';

function bigBuild() {
  const w = makeWorld({ floorY: 59, bedrockY: 50 });
  const tech = newTech(77);
  place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
  place(w, tech, 1, 60, 0, B.TECH_CABLE);
  place(w, tech, 2, 60, 0, B.TECH_BATTERY);
  place(w, tech, 3, 60, 0, B.TECH_CABLE);
  place(w, tech, 4, 60, 0, B.TECH_LAMP);
  place(w, tech, 5, 60, 0, B.TECH_FURNACE);
  place(w, tech, 6, 60, 0, B.TECH_TELEPORTER);
  place(w, tech, 7, 60, 0, B.TECH_LIFT);
  place(w, tech, 8, 60, 0, B.TECH_DOOR);
  place(w, tech, 9, 60, 0, B.TECH_CHARGER);
  place(w, tech, 10, 60, 0, B.TECH_SOLAR);
  place(w, tech, 11, 60, 0, B.TECH_BUTTON);
  place(w, tech, 12, 60, 0, B.TECH_SENSOR);
  place(w, tech, 0, 61, 5, B.TECH_DRILL);
  place(w, tech, 1, 61, 5, B.TECH_GENERATOR);
  tech.insertFuel(0, 60, 0, 'item:kömür', 20);
  tech.insertFuel(1, 61, 5, 'item:kömür', 20);
  tech.furnaceInsert(5, 60, 0, 'item:ham_demir', 10);
  tech.setMachineConfig(6, 60, 0, { freq: '0123' });
  tech.setMachineConfig(0, 61, 5, { mode: 'alan' });
  tech.pressButton(11, 60, 0);
  return { w, tech };
}

describe('TechState: kayıt', () => {
  it('serialize → JSON → restore → serialize aynıdır (tüm makine türleri)', () => {
    const { w, tech } = bigBuild();
    run(tech, w, 15, { player: { x: 12, y: 60, z: 1 }, daylight: 0.7 }, 1);
    const types = new Set(Array.from(tech.machines.values()).map((m) => m.t));
    expect(Array.from(types).sort()).toEqual(MACHINE_TYPES.slice().sort()); // 12 türün hepsi kayıtlı
    const json = JSON.parse(JSON.stringify(tech.serialize()));
    const back = new TechState().restore(json, { minY: 0, maxY: 127 });
    expect(back.serialize()).toEqual(json);
    expect(back.count()).toBe(tech.count());
    expect(back.get(6, 60, 0).freq).toBe('0123');
    expect(back.get(0, 61, 5).mode).toBe('alan');
  });

  it('kaydet-yükle sürekliliği: yarıda kaydedip sürdürmek kesintisiz çalışmayla aynı sonucu verir', () => {
    const a = bigBuild();
    const b = bigBuild();
    run(a.tech, a.w, 20, { daylight: 1 }, 1);
    run(b.tech, b.w, 20, { daylight: 1 }, 1);
    const snap = JSON.parse(JSON.stringify(b.tech.serialize()));
    const restored = new TechState({ seed: 77 }).restore(snap, { minY: 0, maxY: 127 });
    restored.time = b.tech.time; // saat kaydı ayrı tutulur ama eşitle
    run(a.tech, a.w, 20, { daylight: 1 }, 1);
    run(restored, b.w, 20, { daylight: 1 }, 1);
    expect(restored.serialize()).toEqual(a.tech.serialize());
  });

  it('belirlenimcilik: aynı kurulum + aynı tohum iki çalışmada aynı kayıt', () => {
    const r = [0, 1].map(() => {
      const { w, tech } = bigBuild();
      run(tech, w, 30, { daylight: 0.5, player: { x: 4, y: 60, z: 4 } }, 0.5);
      return JSON.stringify(tech.serialize());
    });
    expect(r[0]).toBe(r[1]);
  });

  it('boş/bozuk girdi: restore asla atmaz, boş durum döner', () => {
    const t = newTech();
    [null, undefined, 5, 'x', [], true, () => 1, { m: 5 }, { m: [] }, { m: null, p: null }].forEach((raw) => {
      expect(() => t.restore(raw)).not.toThrow();
      expect(t.count()).toBe(0);
      expect(t.portals).toEqual({ mavi: null, turuncu: null });
    });
  });

  it('saldırgan kayıt: prototip anahtarları, taşkın koordinat, yanlış tür, aralık dışı y atılır; geçerliler korunur', () => {
    const raw = JSON.parse(`{
      "v": 1, "tm": -5, "cd": 99999,
      "m": {
        "__proto__": {"t": "pil", "stored": 5},
        "constructor": {"t": "pil"},
        "0,60,0": {"t": "pil", "stored": 100},
        "1,60,0": {"t": "__proto__"},
        "2,60,0": {"t": "toString"},
        "3,60,0": {"t": "lamba", "on": true, "__proto__": {"polluted": 1}},
        "99999999,60,0": {"t": "pil"},
        "0,5000,0": {"t": "pil"},
        "0,-5000,0": {"t": "pil"},
        "x,y,z": {"t": "pil"},
        "4,60,0": 5,
        "5,60,0": null,
        "6,60,0": {"t": 5},
        "7,60,0": {"t": "matkap", "buf": "yok", "ly": {"a": 1}},
        "8,60,0": {"t": "jenerator", "fuel": {"item": "__proto__", "count": 5}}
      },
      "p": {"mavi": "x"}
    }`);
    const t = newTech();
    t.restore(raw, { minY: -400, maxY: 362 });
    expect(Array.from(t.machines.keys()).sort()).toEqual(['0,60,0', '3,60,0', '7,60,0', '8,60,0']);
    expect(t.get(0, 60, 0).stored).toBe(100);
    expect(t.get(3, 60, 0).on).toBe(true);
    expect(t.get(3, 60, 0).polluted).toBeUndefined();
    expect(({}).polluted).toBeUndefined();
    expect(({}).stored).toBeUndefined();
    expect(t.get(7, 60, 0).buf).toEqual([]);
    expect(t.get(7, 60, 0).ly).toBeNull();
    expect(t.get(8, 60, 0).fuel).toBeNull();
    expect(t.time).toBe(0);
    expect(t.portalCd).toBeLessThanOrEqual(1);
  });

  it('makine sayısı sınırı (4000): fazlası atılır', () => {
    const m = {};
    for (let i = 0; i < 4500; i++) m[i + ',60,0'] = { t: 'lamba' };
    const t = newTech();
    t.restore({ v: 1, m });
    expect(t.count()).toBe(4000);
  });

  it('restore fuzz: rastgele nesneler asla atmaz; sonuç tekrar kayıt/yüklemede kararlı', () => {
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const junk = [null, 0, 1, -7, 1e12, NaN, 'a', '0123', '1,2,3', [], {}, true, { t: 'pil' }, { t: 'matkap', ly: 5 }, [1, 2, 3]];
    const types = MACHINE_TYPES.concat(['x', 5, null]);
    for (let n = 0; n < 150; n++) {
      const m = {};
      for (let k = 0; k < 8; k++) {
        const key = Math.floor(rnd() * 20 - 5) + ',' + Math.floor(rnd() * 130) + ',' + Math.floor(rnd() * 20);
        const rec = { t: types[Math.floor(rnd() * types.length)] };
        ['stored', 'fuel', 'freq', 'mode', 'buf', 'on', 'open', 'radius', 'ly', 'stop', 'inItem', 'inCount'].forEach((f) => {
          if (rnd() < 0.5) rec[f] = junk[Math.floor(rnd() * junk.length)];
        });
        m[key] = rnd() < 0.1 ? junk[Math.floor(rnd() * junk.length)] : rec;
      }
      const t = newTech();
      expect(() => t.restore({ v: 1, m, p: { mavi: junk[Math.floor(rnd() * junk.length)] } }, { minY: 0, maxY: 127 })).not.toThrow();
      const s1 = JSON.parse(JSON.stringify(t.serialize()));
      const t2 = newTech().restore(s1, { minY: 0, maxY: 127 });
      expect(t2.serialize()).toEqual(s1);
      t.machines.forEach((st) => expect(isMachineType(st.t)).toBe(true));
    }
  });
});

describe('TechState: zamanlama ve dayanıklılık', () => {
  it('enerji adımı 1 Hz: 0,25 sn × 4 = 1 adım; büyük dt en çok 5 adım ve birikim atılır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 4);
    let ticks = 0;
    for (let i = 0; i < 4; i++) {
      ticks += tech.tick(0.25, { world: w }).filter((e) => e.type === 'machineTick').length;
    }
    expect(ticks).toBe(1);
    const big = tech.tick(60, { world: w }).filter((e) => e.type === 'machineTick').length;
    expect(big).toBe(5); // dt 5 sn'ye kırpılır → 5 adım
    const huge = tech.tick(1e9, { world: w }).filter((e) => e.type === 'machineTick').length;
    expect(huge).toBeLessThanOrEqual(5);
    expect(tech.acc).toBeLessThan(1);
  });

  it('dt NaN / negatif / 0 / ctx yok: hata yok, zaman ilerlemez', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_LAMP);
    const t0 = tech.time;
    [NaN, -5, 0, undefined, null, 'x'].forEach((dt) => {
      expect(() => tech.tick(dt, { world: w })).not.toThrow();
    });
    expect(tech.time).toBe(t0);
    expect(tech.tick(1, null)).toEqual([]);
    expect(tech.tick(1, {})).toEqual([]);
  });

  it('olay dizisi paylaşılır: her tick başında sıfırlanır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 1);
    const e1 = tech.tick(1, { world: w });
    expect(e1.some((e) => e.type === 'machineTick')).toBe(true);
    const e2 = tech.tick(0.1, { world: w });
    expect(e2).toBe(e1);
    expect(e2.some((e) => e.type === 'machineTick')).toBe(false);
  });

  it('büyük ağ performansı: 1500 kablo + makineler, 10 enerji adımı hızlı', () => {
    const w = makeWorld();
    const tech = newTech();
    for (let x = 0; x < 1500; x++) w.set(x, 60, 0, B.TECH_CABLE);
    place(w, tech, 0, 61, 0, B.TECH_GENERATOR);
    for (let i = 1; i <= 30; i++) place(w, tech, i * 40, 61, 0, B.TECH_LAMP);
    tech.insertFuel(0, 61, 0, 'item:kömür', 10);
    const t0 = Date.now();
    run(tech, w, 10, {}, 1);
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(3000);
    expect(tech.networks[0].count).toBeGreaterThan(1500);
    expect(w.getBlock(40, 61, 0)).toBe(B.TECH_LAMP_ON);
  });

  it('matkap adımı sırasında başka bir makine dünyadan silinirse (patlama/başka oyuncu) adım çökmez; makine temizlenir', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 50 });
    const tech = newTech();
    let gone = false;
    w.onChange((e) => {
      tech.onBlockChange(e);
      if (!gone && e.newId === 0 && e.y === 59) { // matkap ilk bloğu kırdı: aynı adımda lamba silinir (matkaptan SONRA işlenecekti)
        gone = true;
        w.setBlock(1, 61, 0, 0);
      }
    });
    place(w, tech, 0, 61, 0, B.TECH_DRILL);
    place(w, tech, -1, 61, 0, B.TECH_GENERATOR);
    place(w, tech, 0, 61, 1, B.TECH_GENERATOR);
    tech.insertFuel(-1, 61, 0, 'item:kömür', 8);
    tech.insertFuel(0, 61, 1, 'item:kömür', 8);
    place(w, tech, 1, 61, 0, B.TECH_LAMP);
    expect(() => run(tech, w, 12, {}, 1)).not.toThrow();
    expect(gone).toBe(true);
    expect(tech.has(1, 61, 0)).toBe(false);
  });

  it('matkap teknoloji bloklarını (komşu lamba dahil, alt katmanda) kırmaz: korumalı durur', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 50 });
    const tech = newTech();
    w.onChange((e) => tech.onBlockChange(e));
    place(w, tech, 0, 61, 0, B.TECH_DRILL);
    place(w, tech, -1, 61, 0, B.TECH_GENERATOR);
    place(w, tech, 0, 61, 1, B.TECH_GENERATOR);
    tech.insertFuel(-1, 61, 0, 'item:kömür', 8);
    tech.insertFuel(0, 61, 1, 'item:kömür', 8);
    tech.setMachineConfig(0, 61, 0, { mode: 'alan' });
    place(w, tech, 1, 60, 0, B.TECH_LAMP);
    run(tech, w, 20, {}, 1);
    expect(tech.has(1, 60, 0)).toBe(true);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_LAMP);
    expect(tech.machineInfo(0, 61, 0).stop).toBe('korumali');
  });

  it('makine yokken machineTick olayı yayılmaz (boş dünya gürültü yapmaz)', () => {
    const w = makeWorld();
    const tech = newTech();
    expect(run(tech, w, 5, {}, 1).filter((e) => e.type === 'machineTick')).toEqual([]);
  });

  it('ağ taşması: olay yayılır ve overflow raporlanır', () => {
    const w = makeWorld();
    const tech = newTech();
    for (let x = 0; x <= 2100; x++) w.set(x, 60, 0, B.TECH_CABLE);
    place(w, tech, 0, 61, 0, B.TECH_GENERATOR);
    place(w, tech, 2100, 61, 0, B.TECH_LAMP);
    tech.insertFuel(0, 61, 0, 'item:kömür', 5);
    const ev = run(tech, w, 2, {}, 1);
    expect(ev.some((e) => e.type === 'networkOverflow' && e.count > 0)).toBe(true);
    expect(tech.overflow).toBeGreaterThan(0);
    expect(w.getBlock(2100, 61, 0)).toBe(B.TECH_LAMP); // 2000'in ötesi beslenmez
  });
});

describe('TechState: blok kancaları', () => {
  it('onBlockChange her iki imza; makine olmayan bloklar yok sayılır; bozuk koordinat güvenli', () => {
    const tech = newTech();
    tech.onBlockChange(0, 60, 0, 0, B.TECH_LAMP);
    expect(tech.has(0, 60, 0)).toBe(true);
    tech.onBlockChange({ x: 1, y: 60, z: 0, oldId: 0, newId: B.TECH_BATTERY });
    expect(tech.has(1, 60, 0)).toBe(true);
    tech.onBlockChange(5, 60, 0, 0, B.STONE);
    expect(tech.has(5, 60, 0)).toBe(false);
    tech.onBlockChange(2, 60, 0, 0, B.TECH_CABLE);
    expect(tech.has(2, 60, 0)).toBe(false); // kablo kayıtsız
    expect(tech.dirty).toBe(true);
    expect(tech.onBlockChange({ x: NaN, y: 1, z: 1, oldId: 1, newId: 0 })).toEqual({ items: [], lost: [] });
    expect(tech.onBlockChange(null)).toEqual({ items: [], lost: [] });
    expect(tech.onBlockChange(undefined)).toEqual({ items: [], lost: [] });
    const r = tech.onBlockChange(0, 60, 0, B.TECH_LAMP, 0);
    expect(r.lost).toEqual([{ key: '0,60,0', machine: 'lamba' }]);
    expect(tech.has(0, 60, 0)).toBe(false);
  });

  it('makine yerine başka makine konunca eskisi silinir, yenisi kaydolur', () => {
    const tech = newTech();
    tech.onBlockPlaced(0, 60, 0, B.TECH_GENERATOR);
    tech.insertFuel(0, 60, 0, 'item:kömür', 3);
    const r = tech.onBlockChange(0, 60, 0, B.TECH_GENERATOR, B.TECH_LAMP);
    expect(r.items).toEqual([{ item: 'item:kömür', count: 3 }]);
    expect(tech.get(0, 60, 0).t).toBe('lamba');
  });

  it('onBlockPlaced yalnız tech blokları kaydeder; kablo/lab null', () => {
    const tech = newTech();
    expect(tech.onBlockPlaced(0, 0, 0, B.STONE)).toBeNull();
    expect(tech.onBlockPlaced(0, 0, 0, B.TECH_CABLE)).toBeNull();
    expect(tech.onBlockPlaced(0, 0, 0, B.TECH_LAB)).toBeNull();
    expect(tech.onBlockPlaced(0, 0, 0, B.TECH_SOLAR).t).toBe('gunes');
    TECH_BLOCK_DEFS.filter((d) => d.type).forEach((d, i) => {
      const m = tech.onBlockPlaced(100 + i, 0, 0, d.id);
      expect(m.t).toBe(d.type);
    });
  });
});

describe('TechState: arayüz/etkileşim', () => {
  it('machineInfo her makine türü için çalışır ve JSON-güvenlidir', () => {
    const { w, tech } = bigBuild();
    run(tech, w, 5, {}, 1);
    tech.machines.forEach((st, key) => {
      const [x, y, z] = key.split(',').map(Number);
      const info = tech.machineInfo(x, y, z);
      expect(info.ok).toBe(true);
      expect(info.type).toBe(st.t);
      expect(typeof info.name).toBe('string');
      JSON.stringify(info);
    });
    const tp = tech.machineInfo(6, 60, 0);
    expect(tp.freq).toBe('0123');
    expect(tp.partner).toBeNull();
    expect(tp.ready).toBe(false);
    const drill = tech.machineInfo(0, 61, 5);
    expect(drill.mode).toBe('alan');
    expect(drill.cells).toBe(25);
    expect(tech.machineInfo(0, 0, 0).ok).toBe(false);
    expect(tech.machineInfo(0, 0, 0).reason).toBe('yok');
  });

  it('setMachineConfig: türe özel doğrulama ve reddetme nedenleri', () => {
    const { tech } = bigBuild();
    expect(tech.setMachineConfig(0, 61, 5, { mode: 'column' }).ok).toBe(true);
    expect(tech.get(0, 61, 5).mode).toBe('column');
    expect(tech.setMachineConfig(0, 61, 5, { mode: 'çılgın' }).reason).toBe('mod');
    expect(tech.setMachineConfig(12, 60, 0, { radius: 8 }).ok).toBe(true);
    expect(tech.get(12, 60, 0).radius).toBe(8);
    expect(tech.setMachineConfig(12, 60, 0, { radius: 9 }).reason).toBe('menzil');
    expect(tech.setMachineConfig(12, 60, 0, { radius: 1.5 }).reason).toBe('menzil');
    expect(tech.setMachineConfig(11, 60, 0, { mode: 'pulse' }).ok).toBe(true);
    expect(tech.setMachineConfig(11, 60, 0, { mode: 'hmm' }).reason).toBe('mod');
    expect(tech.setMachineConfig(4, 60, 0, { on: true }).reason).toBe('ayar_yok'); // lamba
    expect(tech.setMachineConfig(0, 60, 0, null).ok).toBe(false);
    expect(tech.setMachineConfig(123, 1, 1, {}).reason).toBe('yok');
  });

  it('matkap yeniden başlatma ve boşaltma', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 50 });
    const tech = newTech();
    place(w, tech, 0, 61, 0, B.TECH_DRILL);
    place(w, tech, 1, 61, 0, B.TECH_GENERATOR);
    place(w, tech, -1, 61, 0, B.TECH_GENERATOR);
    tech.insertFuel(1, 61, 0, 'item:kömür', 20);
    tech.insertFuel(-1, 61, 0, 'item:kömür', 20);
    run(tech, w, 30, {}, 1);
    const st = tech.get(0, 61, 0);
    expect(st.stop).toBe('ana_kaya');
    const buf = tech.drillTake(0, 61, 0);
    expect(buf.reduce((n, s) => n + s.count, 0)).toBe(st.mined);
    expect(tech.drillTake(0, 61, 0)).toEqual([]);
    expect(tech.drillTake(9, 9, 9)).toEqual([]);
    for (let y = 50; y <= 59; y++) w.set(0, y, 0, B.STONE);
    expect(tech.setMachineConfig(0, 61, 0, { restart: true }).ok).toBe(true);
    expect(st.stop).toBeNull();
    run(tech, w, 30, {}, 1);
    expect(tech.get(0, 61, 0).mined).toBeGreaterThan(st.mined - 1);
  });

  it('yakıt/ocak etkileşim hataları Türkçe mesajla döner', () => {
    const { tech } = bigBuild();
    expect(tech.insertFuel(0, 60, 0, 'item:elmas', 1)).toMatchObject({ ok: false, reason: 'yakit' });
    expect(tech.insertFuel(99, 60, 0, 'item:kömür', 1).reason).toBe('yok');
    expect(tech.furnaceInsert(5, 60, 0, 'item:elmas', 1).reason).toBe('girdi');
    expect(tech.furnaceInsert(0, 60, 0, 'item:ham_demir', 1).reason).toBe('yok');
    expect(tech.pressButton(0, 60, 0).reason).toBe('yok');
    expect(tech.takeFuel(5, 60, 0)).toBeNull();
    expect(tech.furnaceTake(0, 60, 0)).toBeNull();
    expect(tech.furnaceTakeInput(5, 60, 0).item).toBe('item:ham_demir');
    [tech.insertFuel(0, 60, 0, 'item:elmas', 1), tech.furnaceInsert(5, 60, 0, 'item:elmas', 1)].forEach((r) => {
      expect(typeof r.message).toBe('string');
      expect(r.message.length).toBeGreaterThan(5);
    });
  });
});

describe('tech.js: HUD ve giriş', () => {
  it('createTech ve techHud alanları: energy / jetpack / charge / scanner / shield', () => {
    const w = makeWorld();
    const tech = createTech(3);
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_BATTERY);
    place(w, tech, 2, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 5);
    run(tech, w, 5, {}, 1);
    const inv = new Inventory();
    inv.addStack('item:jetpack', 1, undefined, undefined, 400);
    inv.addStack('item:tarayıcı', 1, undefined, undefined, 300);
    inv.selected = 1;
    const h = techHud(tech, inv, { pos: { x: 3, y: 60.5, z: 0.5 } });
    expect(h.energy).toMatchObject({ max: TECH_RATES.battery.cap, gen: 12, live: true, nodes: 3 });
    expect(h.energy.value).toBeGreaterThan(0);
    expect(h.energy.net).toBeCloseTo(11, 1);
    expect(h.jetpack).toMatchObject({ fuel: 400, max: 1000 });
    expect(h.charge).toMatchObject({ item: 'item:tarayıcı', value: 300, max: 400, fraction: 0.75 });
    expect(h.scanner).toMatchObject({ charge: 300, max: 400 });
    expect(h.shield).toBeNull();
    const far = techHud(tech, inv, { pos: { x: 500, y: 60, z: 500 } });
    expect(far.energy).toBeNull();
    const none = techHud(null, null, {});
    expect(none).toEqual({
      energy: null, jetpack: null, charge: null, scanner: null, shield: null,
    });
  });
});
