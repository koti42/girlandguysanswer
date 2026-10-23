import { describe, expect, it } from 'vitest';
import {
  buildNetworks, compareKeys, parseKey, pickGeneratorsToStart, posKey, solveNetwork,
} from './techPower.js';
import { B } from './blocks.js';
import { TECH_RATES } from './techData.js';
import { makeWorld, newTech, place, run } from './techTestKit.js';

describe('techPower: anahtarlar', () => {
  it('posKey / parseKey gidiş-dönüş, bozuk girdiyi reddeder', () => {
    expect(parseKey(posKey(3, -400, -12))).toEqual([3, -400, -12]);
    expect(parseKey('1,2')).toBeNull();
    expect(parseKey('a,b,c')).toBeNull();
    expect(parseKey('__proto__')).toBeNull();
    expect(parseKey('1,2,3,4')).toBeNull();
    expect(parseKey(' 1,2,3')).toBeNull();
    expect(parseKey('99999999,0,0')).toBeNull();
    expect(parseKey(null)).toBeNull();
    expect(parseKey(5)).toBeNull();
  });
  it('compareKeys sayısal (10 > 9) ve negatifleri doğru sıralar', () => {
    const keys = ['10,0,0', '9,0,0', '-3,5,0', '9,-1,0', '9,0,-2'];
    expect(keys.sort(compareKeys)).toEqual(['-3,5,0', '9,-1,0', '9,0,-2', '9,0,0', '10,0,0']);
  });
});

describe('techPower: solveNetwork (arz/talep dengesi)', () => {
  const gen = (key, rate) => ({ key, rate });
  const store = (key, stored, cap = 5000, io = 50) => ({
    key, stored, cap, io,
  });
  const load = (key, demand, prio = 1) => ({ key, demand, prio });

  it('yeterli üretim: tüketiciler beslenir, artan pili doldurur', () => {
    const r = solveNetwork({ gens: [gen('a', 12)], stores: [store('b', 0)], loads: [load('l', 1, 0), load('f', 10, 1)] }, 1);
    expect(r.powered.get('l')).toBe(true);
    expect(r.powered.get('f')).toBe(true);
    expect(r.gen).toBe(12);
    expect(r.supplied).toBe(11);
    expect(r.toStore).toBe(1);
    expect(r.storeDelta.get('b')).toBe(1);
    expect(r.wasted).toBe(0);
  });

  it('yetersiz üretim: düşük öncelik kesilir (kısmi besleme yok), yüksek öncelik korunur', () => {
    const r = solveNetwork({ gens: [gen('a', 12)], stores: [], loads: [load('drill', 20, 1), load('lamp', 1, 0), load('lamp2', 1, 0)] }, 1);
    expect(r.powered.get('lamp')).toBe(true);
    expect(r.powered.get('lamp2')).toBe(true);
    expect(r.powered.get('drill')).toBe(false);
    expect(r.supplied).toBe(2);
    expect(r.wasted).toBe(10 - 0); // 12 - 2 = 10 boşa
  });

  it('pil açığı kapatır: üretim 12 + pil 50 ≥ matkap 20', () => {
    const r = solveNetwork({ gens: [gen('a', 12)], stores: [store('b', 1000)], loads: [load('drill', 20)] }, 1);
    expect(r.powered.get('drill')).toBe(true);
    expect(r.fromGen).toBe(12);
    expect(r.fromStore).toBe(8);
    expect(r.storeDelta.get('b')).toBe(-8);
  });

  it('pil sınırları: boşalma azami io ve elde kalan enerji ile sınırlı', () => {
    const r = solveNetwork({ gens: [], stores: [store('b', 5)], loads: [load('x', 20)] }, 1);
    expect(r.powered.get('x')).toBe(false); // 5 EU/sn çıkabilir (stored/dt) < 20
    const r2 = solveNetwork({ gens: [], stores: [store('b', 5000, 5000, 50)], loads: [load('x', 60)] }, 1);
    expect(r2.powered.get('x')).toBe(false); // io 50 < 60
    const r3 = solveNetwork({ gens: [], stores: [store('b', 5000, 5000, 50)], loads: [load('x', 50)] }, 1);
    expect(r3.powered.get('x')).toBe(true);
    expect(r3.storeDelta.get('b')).toBe(-50);
  });

  it('şarj: en boş pil önce, io ve boş yer ile sınırlı', () => {
    const r = solveNetwork({
      gens: [gen('g', 70)], stores: [store('full', 4990), store('empty', 0), store('half', 2500)], loads: [],
    }, 1);
    // 70 EU/sn: boş (50) + yarım (20); dolu pil (10 boş yer) sonda kalır
    expect(r.storeDelta.get('empty')).toBe(50);
    expect(r.storeDelta.get('half')).toBe(20);
    expect(r.storeDelta.get('full')).toBe(0);
    expect(r.wasted).toBe(0);
  });

  it('deşarj: en dolu pil önce; eşit doluluk anahtar sırası (belirlenimci)', () => {
    const r = solveNetwork({
      gens: [], stores: [store('9,0,0', 1000), store('10,0,0', 1000), store('1,0,0', 100)], loads: [load('x', 30)],
    }, 1);
    expect(r.storeDelta.get('9,0,0')).toBe(-30); // "9,0,0" < "10,0,0" sayısal sıra
    expect(r.storeDelta.get('10,0,0')).toBe(0);
    expect(r.storeDelta.get('1,0,0')).toBe(0);
  });

  it('talepsiz yük "canlı" ağda beslenmiş sayılır; kaynaksız ağda sayılmaz', () => {
    expect(solveNetwork({ gens: [gen('g', 1)], stores: [], loads: [load('idle', 0)] }, 1).powered.get('idle')).toBe(true);
    expect(solveNetwork({ gens: [], stores: [], loads: [load('idle', 0)] }, 1).powered.get('idle')).toBe(false);
  });

  it('belirlenimcilik: giriş sırası sonucu değiştirmez; negatif/NaN değerler 0 sayılır', () => {
    const base = {
      gens: [gen('a', 5), gen('b', 5)], stores: [store('s', 100)], loads: [load('x', 4, 1), load('y', 4, 1), load('z', 4, 1)],
    };
    const r1 = solveNetwork(base, 1);
    const r2 = solveNetwork({ gens: base.gens.slice().reverse(), stores: base.stores, loads: base.loads.slice().reverse() }, 1);
    expect(Array.from(r1.powered.entries()).sort()).toEqual(Array.from(r2.powered.entries()).sort());
    expect(r1.supplied).toBe(r2.supplied);
    const r3 = solveNetwork({ gens: [gen('a', -5), gen('n', NaN)], stores: [], loads: [load('x', -3), load('y', NaN)] }, 1);
    expect(r3.gen).toBe(0);
    expect(r3.demand).toBe(0);
    expect(Number.isFinite(r3.supplied)).toBe(true);
  });

  it('dt ölçeği: 2 sn adımda enerji değişimi 2 katı', () => {
    const r = solveNetwork({ gens: [gen('g', 12)], stores: [store('b', 0)], loads: [load('l', 2)] }, 2);
    expect(r.storeDelta.get('b')).toBe(20); // (12-2) * 2
  });

  it('enerji korunur: kaynak = tüketim + şarj + boşa', () => {
    const r = solveNetwork({ gens: [gen('g', 33)], stores: [store('b', 0, 5000, 7)], loads: [load('x', 10), load('y', 4)] }, 1);
    expect(r.fromGen + r.toStore + r.wasted).toBeCloseTo(33, 5);
  });
});

describe('techPower: jeneratör başlatma kararı', () => {
  it('talep karşılanıyorsa başlatmaz; açık varsa anahtar sırasıyla yeterince başlatır', () => {
    const gens = [
      { key: '2,0,0', rate: 12, burning: false, canStart: true },
      { key: '1,0,0', rate: 12, burning: false, canStart: true },
      { key: '3,0,0', rate: 12, burning: false, canStart: false },
    ];
    expect(pickGeneratorsToStart(gens, 0, 0)).toEqual([]);
    expect(pickGeneratorsToStart(gens, -5, 0)).toEqual([]);
    expect(pickGeneratorsToStart(gens, 10, 0)).toEqual(['1,0,0']);
    expect(pickGeneratorsToStart(gens, 20, 0)).toEqual(['1,0,0', '2,0,0']);
    expect(pickGeneratorsToStart(gens, 100, 0)).toEqual(['1,0,0', '2,0,0']); // 3. başlatılamaz
    const burning = [{ key: '0,0,0', rate: 12, burning: true, canStart: false }].concat(gens);
    expect(pickGeneratorsToStart(burning, 12, 0)).toEqual([]);
    expect(pickGeneratorsToStart(burning, 13, 0)).toEqual(['1,0,0']);
  });
});

describe('techPower: ağ grafiği (buildNetworks) ve ağ sınırı', () => {
  const T = B.TECH_CABLE;
  function conducts() {
    return (id) => id === T || id === B.TECH_LAMP || id === B.TECH_GENERATOR || id === B.TECH_BATTERY;
  }

  it('yan yana iletkenler tek ağ; boşluk ağı böler; çapraz komşu bağlamaz', () => {
    const w = makeWorld();
    w.set(0, 70, 0, B.TECH_GENERATOR);
    w.set(1, 70, 0, T);
    w.set(2, 70, 0, B.TECH_LAMP);
    w.set(4, 70, 0, B.TECH_LAMP); // boşluk
    w.set(5, 71, 1, B.TECH_LAMP); // çapraz
    const machines = new Map([['0,70,0', {}], ['2,70,0', {}], ['4,70,0', {}], ['5,71,1', {}]]);
    const r = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z), keys: Array.from(machines.keys()), machineAt: (k) => machines.get(k) || null, conducts: conducts(w),
    });
    expect(r.networks).toHaveLength(3);
    expect(r.nodeNet.get('0,70,0')).toBe(r.nodeNet.get('2,70,0'));
    expect(r.nodeNet.get('4,70,0')).not.toBe(r.nodeNet.get('2,70,0'));
    expect(r.nodeNet.get('5,71,1')).not.toBe(r.nodeNet.get('4,70,0'));
    expect(r.networks[r.nodeNet.get('0,70,0')].count).toBe(3);
  });

  it('dikey bağlantı ve negatif koordinatlar çalışır; üretilmemiş chunk (null) iletken değildir', () => {
    const w = makeWorld({ yMin: -400, loaded: (x, y) => !(y === -50) });
    w.set(-5, -52, 3, B.TECH_GENERATOR);
    w.set(-5, -51, 3, T);
    w.set(-5, -50, 3, T); // yüklü değil → bağlantı kopar
    w.set(-5, -49, 3, B.TECH_LAMP);
    const machines = new Map([['-5,-52,3', {}], ['-5,-49,3', {}]]);
    const r = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z), keys: Array.from(machines.keys()), machineAt: (k) => machines.get(k) || null, conducts: conducts(w),
    });
    expect(r.nodeNet.get('-5,-52,3')).not.toBe(r.nodeNet.get('-5,-49,3'));
    w.loaded = null;
    const r2 = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z), keys: Array.from(machines.keys()), machineAt: (k) => machines.get(k) || null, conducts: conducts(w),
    });
    expect(r2.nodeNet.get('-5,-52,3')).toBe(r2.nodeNet.get('-5,-49,3'));
  });

  it('ağ boyutu sınırı: 2000 düğüm; ötesi ağa katılmaz ve overflow raporlanır', () => {
    const w = makeWorld();
    for (let x = 0; x <= 2100; x++) w.set(x, 70, 0, T);
    w.set(0, 70, 1, B.TECH_GENERATOR);
    w.set(2100, 70, 1, B.TECH_LAMP);
    const machines = new Map([['0,70,1', {}], ['2100,70,1', {}]]);
    const r = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z),
      keys: Array.from(machines.keys()),
      machineAt: (k) => machines.get(k) || null,
      conducts: conducts(w),
      maxNodes: TECH_RATES.network.maxNodes,
    });
    const net = r.networks[r.nodeNet.get('0,70,1')];
    expect(net.count).toBe(2000);
    // lamba jeneratör ağının DIŞINDA (kendi küçük, kaynaksız ağında)
    expect(r.nodeNet.get('2100,70,1')).not.toBe(r.nodeNet.get('0,70,1'));
    expect(r.overflow).toBeGreaterThan(0);
  });

  it('belirlenimci: anahtar sırası ve kayıt sırasından bağımsız aynı ağlar', () => {
    const w = makeWorld();
    for (let i = 0; i < 12; i++) w.set(i, 70, 0, i % 3 === 0 ? B.TECH_LAMP : T);
    const keys = [];
    for (let i = 0; i < 12; i += 3) keys.push(posKey(i, 70, 0));
    const run1 = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z), keys, machineAt: () => ({}), conducts: conducts(w),
    });
    const run2 = buildNetworks({
      getBlock: (x, y, z) => w.getBlock(x, y, z), keys: keys.slice().reverse(), machineAt: () => ({}), conducts: conducts(w),
    });
    expect(run1.networks.map((n) => n.machines)).toEqual(run2.networks.map((n) => n.machines));
  });
});

describe('techPower: bütünleşik (TechState) enerji akışı', () => {
  function setup() {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_CABLE);
    place(w, tech, 2, 60, 0, B.TECH_LAMP);
    return { w, tech };
  }

  it('yakıtlı jeneratör lambayı yakar (blok ETKİN varyanta döner) ve olay yayılır', () => {
    const { w, tech } = setup();
    expect(tech.insertFuel(0, 60, 0, 'item:kömür', 4)).toMatchObject({ ok: true, accepted: 4 });
    const ev = run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(w.getBlock(0, 60, 0)).toBe(B.TECH_GENERATOR_ON);
    const pc = ev.filter((e) => e.type === 'poweredChanged');
    expect(pc.some((e) => e.machine === 'lamba' && e.on === true)).toBe(true);
    expect(pc.some((e) => e.machine === 'jenerator' && e.on === true)).toBe(true);
    expect(tech.get(0, 60, 0).fuel.count).toBe(3); // 1 yakıt yanmaya başladı
  });

  it('yakıtsız jeneratör ve boş pil: lamba yanmaz; yakıt bitince söner', () => {
    const { w, tech } = setup();
    run(tech, w, 3);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:sopa', 1); // 2,5 sn yanar
    run(tech, w, 1);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    run(tech, w, 4);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    expect(w.getBlock(0, 60, 0)).toBe(B.TECH_GENERATOR);
  });

  it('talep yokken yakıt harcanmaz (talep-üzerine yakma)', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    tech.insertFuel(0, 60, 0, 'item:kömür', 8);
    run(tech, w, 10);
    expect(tech.get(0, 60, 0).fuel.count).toBe(8);
    expect(tech.get(0, 60, 0).burnT).toBe(0);
  });

  it('pil: fazla üretim şarj eder, jeneratör bitince pil lambayı besler', () => {
    const { w, tech } = setup();
    place(w, tech, 3, 60, 0, B.TECH_BATTERY);
    tech.insertFuel(0, 60, 0, 'item:sopa', 4);
    run(tech, w, 5);
    const stored = tech.get(3, 60, 0).stored;
    expect(stored).toBeGreaterThan(20); // ~ (12-1) EU/sn × ~2.5 sn
    run(tech, w, 20);
    // sopa bitti; pil lambayı 1 EU/sn besliyor
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(tech.get(3, 60, 0).stored).toBeLessThan(stored + 1);
    expect(tech.get(3, 60, 0).stored).toBeGreaterThan(0);
  });

  it('düğme akımı geçirir yalnız açıkken: lamba düğmeyle yanıp söner (anında)', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_BUTTON);
    place(w, tech, 2, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 3);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    expect(tech.pressButton(1, 60, 0)).toMatchObject({ ok: true, on: true });
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_BUTTON_ON);
    expect(tech.pressButton(1, 60, 0).on).toBe(false);
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_BUTTON);
  });

  it('darbeli düğme 3 sn sonra kendiliğinden kapanır; sensör yakın oyuncuyla açılır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_BUTTON);
    place(w, tech, 2, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    expect(tech.setMachineConfig(1, 60, 0, { mode: 'pulse' }).ok).toBe(true);
    tech.pressButton(1, 60, 0);
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);

    const w2 = makeWorld();
    const t2 = newTech();
    place(w2, t2, 0, 60, 0, B.TECH_GENERATOR);
    place(w2, t2, 1, 60, 0, B.TECH_SENSOR);
    place(w2, t2, 2, 60, 0, B.TECH_LAMP);
    t2.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(t2, w2, 3, { player: { x: 40, y: 60, z: 40 } });
    expect(w2.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    run(t2, w2, 3, { player: { x: 3, y: 60, z: 1 } });
    expect(w2.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(w2.getBlock(1, 60, 0)).toBe(B.TECH_SENSOR_ON);
    run(t2, w2, 3, { player: { x: 40, y: 60, z: 40 } });
    expect(w2.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
  });

  it('kablo kırılınca ağ bölünür ve lamba söner; geri koyunca yanar', () => {
    const { w, tech } = setup();
    tech.insertFuel(0, 60, 0, 'item:kömür', 4);
    run(tech, w, 3);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
    w.onChange((e) => tech.onBlockChange(e));
    w.setBlock(1, 60, 0, 0);
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP);
    w.setBlock(1, 60, 0, B.TECH_CABLE);
    run(tech, w, 2);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
  });

  it('güneş paneli: gündüz üretir, gece üretmez, üstü kapalıysa üretmez; yağmurda azalır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_SOLAR);
    place(w, tech, 1, 60, 0, B.TECH_BATTERY);
    run(tech, w, 10, { daylight: 1 });
    const day = tech.get(1, 60, 0).stored;
    expect(day).toBeGreaterThan(30); // 4 EU/sn × ~9 sn
    expect(day).toBeLessThanOrEqual(40.5);
    run(tech, w, 10, { daylight: 0 });
    expect(tech.get(1, 60, 0).stored).toBeCloseTo(day, 3);
    // yağmur
    const before = tech.get(1, 60, 0).stored;
    run(tech, w, 10, { daylight: 1, weather: 'rain' });
    const rainGain = tech.get(1, 60, 0).stored - before;
    expect(rainGain).toBeGreaterThan(5);
    expect(rainGain).toBeLessThan(day * 0.5);
    // üstü kapalı: taş tavan (solar yeniden denetimi 5 sn'de bir)
    w.set(0, 62, 0, B.STONE);
    run(tech, w, 8, { daylight: 1 });
    const s0 = tech.get(1, 60, 0).stored;
    run(tech, w, 10, { daylight: 1 });
    expect(tech.get(1, 60, 0).stored).toBeCloseTo(s0, 3);
    expect(tech.machineInfo(0, 60, 0).sky).toBe(false);
  });

  it('pil kapasite üstüne çıkmaz; io sınırı aşılmaz', () => {
    const w = makeWorld();
    const tech = newTech();
    for (let i = 0; i < 20; i++) place(w, tech, i, 60, 0, B.TECH_SOLAR);
    place(w, tech, 20, 60, 0, B.TECH_BATTERY);
    run(tech, w, 20);
    const st = tech.get(20, 60, 0).stored;
    // 20 güneş paneli 80 EU/sn üretir, pil en çok 50 EU/sn alır
    expect(st).toBeLessThanOrEqual(50 * 20 + 1);
    expect(st).toBeGreaterThan(50 * 15);
    expect(st).toBeLessThanOrEqual(TECH_RATES.battery.cap);
  });

  it('iki ayrı ağ birbirini beslemez', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_LAMP);
    place(w, tech, 10, 60, 0, B.TECH_LAMP);
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 3);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_LAMP_ON);
    expect(w.getBlock(10, 60, 0)).toBe(B.TECH_LAMP);
  });

  it('QA5: talep yokken yakıtlı jeneratör "beklemede" (standby) raporlanır; yakıtsızsa değil; talep gelince canlı', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_CABLE);
    place(w, tech, 2, 60, 0, B.TECH_DRILL);
    tech.setMachineConfig(2, 60, 0, { off: true }); // talep yok
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 3);
    const idle = tech.machineInfo(0, 60, 0).network;
    expect(idle.live).toBe(false);
    expect(idle.standby).toBe(true);
    expect(tech.get(0, 60, 0).fuel.count).toBe(2); // boşa yanmadı
    tech.setMachineConfig(2, 60, 0, { off: false });
    run(tech, w, 3);
    const busy = tech.machineInfo(0, 60, 0).network;
    expect(busy.live).toBe(true);
    expect(busy.standby).toBe(false);
    const w2 = makeWorld();
    const t2 = newTech();
    place(w2, t2, 0, 60, 0, B.TECH_GENERATOR);
    place(w2, t2, 1, 60, 0, B.TECH_LAMP);
    run(t2, w2, 3);
    expect(t2.machineInfo(0, 60, 0).network.standby).toBe(false); // yakıt yok → gerçekten kaynak yok
  });

  it('kullanım HUD ve machineInfo ağ özetini verir', () => {
    const { w, tech } = setup();
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 3);
    const info = tech.machineInfo(2, 60, 0);
    expect(info.ok).toBe(true);
    expect(info.type).toBe('lamba');
    expect(info.powered).toBe(true);
    expect(info.network.gen).toBe(12);
    expect(info.network.nodes).toBe(3);
    expect(tech.machineInfo(50, 60, 0).ok).toBe(false);
  });
});
