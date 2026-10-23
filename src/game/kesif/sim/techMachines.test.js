import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import {
  BUTTON_MODES, DRILL_MODES, createMachine, drillCells, drillTakeBuffer, drillTimeFor, furnaceInsert, furnaceRecipe, furnaceTake,
  furnaceTakeInput, furnaceTime, insertFuel, insertIntoSlots, isMachineType, loadDemand, pressButton, resetDrill, sanitizeMachine,
  skyAccess, startBurn, stepMachine, takeFuel, visualBlockId, visualOn, canStartBurn, generationRate, flushDrillBuffer,
} from './techMachines.js';
import { TECH_RATES } from './techData.js';
import { Inventory } from './inventory.js';
import { chargeOf } from './techCharge.js';
import { makeWorld, newTech, place, run } from './techTestKit.js';

const R = TECH_RATES;

function mctxFor(w, extra) {
  const events = [];
  return Object.assign({
    getBlock: (x, y, z) => w.getBlock(x, y, z),
    setBlock: (x, y, z, id) => w.setBlock(x, y, z, id),
    minY: w.yMin,
    maxY: w.yMax,
    events,
    stats: { drilled: 0, smelted: 0 },
    seed: 7,
    daylight: 1,
  }, extra || {});
}

describe('techMachines: varsayılan durum ve doğrulama', () => {
  it('her tür için varsayılan durum var; bilinmeyen tür null', () => {
    ['gunes', 'jenerator', 'pil', 'ocak', 'matkap', 'lamba', 'isinlayici', 'asansor', 'kapi', 'dugme', 'sensor', 'sarj'].forEach((t) => {
      const st = createMachine(t);
      expect(st.t).toBe(t);
      expect(isMachineType(t)).toBe(true);
      expect(sanitizeMachine(t, st)).toEqual(st);
    });
    expect(createMachine('yok')).toBeNull();
    expect(isMachineType('__proto__')).toBe(false);
    expect(isMachineType('constructor')).toBe(false);
    expect(sanitizeMachine('constructor', {})).toBeNull();
    expect(sanitizeMachine('__proto__', {})).toBeNull();
  });

  it('ETKİN varyant bloğu düğme/sensörü açık başlatır', () => {
    expect(createMachine('dugme', B.TECH_BUTTON_ON).on).toBe(true);
    expect(createMachine('dugme', B.TECH_BUTTON).on).toBe(false);
    expect(createMachine('sensor', B.TECH_SENSOR_ON).on).toBe(true);
  });

  it('sanitize: sınırlar, yanlış tipler, bilinmeyen alanlar atılır', () => {
    const p = sanitizeMachine('pil', { stored: 1e12, extra: 1 });
    expect(p.stored).toBe(R.battery.cap);
    expect(p.extra).toBeUndefined();
    expect(sanitizeMachine('pil', { stored: -5 }).stored).toBe(0);
    expect(sanitizeMachine('pil', { stored: 'abc' }).stored).toBe(0);
    expect(sanitizeMachine('pil', { stored: NaN }).stored).toBe(0);
    const j = sanitizeMachine('jenerator', { fuel: { item: 'item:elmas', count: 5 }, burnT: 99, burnTotal: 10 });
    expect(j.fuel).toBeNull(); // yakıt değil
    expect(j.burnT).toBe(10); // ≤ burnTotal
    const j2 = sanitizeMachine('jenerator', { fuel: { item: 'item:kömür', count: 999 }, burnT: 3, burnTotal: 40 });
    expect(j2.fuel).toEqual({ item: 'item:kömür', count: 64 });
    expect(sanitizeMachine('isinlayici', { freq: '0189' }).freq).toBeNull(); // 8,9 geçersiz
    expect(sanitizeMachine('isinlayici', { freq: '012' }).freq).toBeNull();
    expect(sanitizeMachine('isinlayici', { freq: '0123' }).freq).toBe('0123');
    expect(sanitizeMachine('isinlayici', { freq: 1234 }).freq).toBeNull();
    expect(sanitizeMachine('isinlayici', { buf: 1e9 }).buf).toBe(R.teleporter.cap);
    expect(sanitizeMachine('sensor', { radius: 99 }).radius).toBe(8);
    expect(sanitizeMachine('sensor', { radius: -1 }).radius).toBe(2);
    expect(sanitizeMachine('dugme', { mode: 'x' }).mode).toBe('toggle');
    expect(BUTTON_MODES).toContain(sanitizeMachine('dugme', { mode: 'pulse' }).mode);
    expect(DRILL_MODES).toContain(sanitizeMachine('matkap', { mode: 'alan' }).mode);
    expect(sanitizeMachine('matkap', { mode: 'bozuk' }).mode).toBe('column');
    expect(sanitizeMachine('matkap', { stop: 'rastgele' }).stop).toBeNull();
    expect(sanitizeMachine('matkap', { ly: 'x' }).ly).toBeNull();
    expect(sanitizeMachine('matkap', { ly: true }).ly).toBeNull();
    expect(sanitizeMachine('matkap', { ly: -50 }, { minY: -400, maxY: 362 }).ly).toBe(-50);
    expect(sanitizeMachine('matkap', { ly: -5000 }, { minY: -400, maxY: 362 }).ly).toBe(-401);
    const buf = sanitizeMachine('matkap', { buf: [{ item: 'blok:taş', count: 9999 }, { item: 'yok', count: 3 }, null, 5, { item: 'blok:toprak', count: 3 }] }).buf;
    expect(buf.every((s) => typeof s.item === 'string' && s.count > 0)).toBe(true);
    expect(buf.length).toBe(2);
    const o = sanitizeMachine('ocak', { inItem: 'blok:taş', inCount: 10, outItem: 'item:demir_külçe', outCount: 99 });
    expect(o.inItem).toBeNull(); // taşın ocak tarifi yok (kırıktaş var)
    expect(o.outCount).toBe(64);
  });

  it('sanitize fuzz: rastgele çöp girdi asla atmaz ve her zaman geçerli durum verir', () => {
    const junk = [null, undefined, 0, 1, -1, NaN, Infinity, 'a', '', [], {}, [1, 2], { __proto__: { t: 'x' } }, true, false, () => 1];
    const keys = ['stored', 'fuel', 'burnT', 'burnTotal', 'inItem', 'inCount', 'outItem', 'outCount', 'prog', 'mode', 'ly', 'ci', 'mined', 'stop',
      'buf', 'on', 'open', 'radius', 'freq', 'cd', 'left', 'sky', 'skyT', 'wait', 'blocked'];
    let seed = 12345;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    ['gunes', 'jenerator', 'pil', 'ocak', 'matkap', 'lamba', 'isinlayici', 'asansor', 'kapi', 'dugme', 'sensor', 'sarj'].forEach((t) => {
      for (let i = 0; i < 200; i++) {
        const raw = {};
        for (let k = 0; k < 6; k++) raw[keys[Math.floor(rnd() * keys.length)]] = junk[Math.floor(rnd() * junk.length)];
        const st = sanitizeMachine(t, raw, { minY: -400, maxY: 362 });
        expect(st.t).toBe(t);
        JSON.stringify(st);
        const again = sanitizeMachine(t, JSON.parse(JSON.stringify(st)), { minY: -400, maxY: 362 });
        expect(again).toEqual(st); // idempotent
      }
    });
    expect(sanitizeMachine('pil', null).stored).toBe(0);
    expect(sanitizeMachine('pil', 'abc').stored).toBe(0);
    expect(sanitizeMachine('pil', [1]).stored).toBe(0);
  });
});

describe('techMachines: jeneratör yakıtı', () => {
  it('yakıt kabulü: yalnız yakıt eşyası, aynı tür, 64 sınırı; alma geri verir', () => {
    const st = createMachine('jenerator');
    expect(insertFuel(st, 'item:elmas', 1)).toBe(0);
    expect(insertFuel(st, 'item:kömür', 0)).toBe(0);
    expect(insertFuel(st, 'item:kömür', 40)).toBe(40);
    expect(insertFuel(st, 'item:odun_kömürü', 5)).toBe(0); // farklı yakıt
    expect(insertFuel(st, 'item:kömür', 100)).toBe(24);
    expect(st.fuel.count).toBe(64);
    expect(takeFuel(st)).toEqual({ item: 'item:kömür', count: 64 });
    expect(st.fuel).toBeNull();
    expect(takeFuel(st)).toBeNull();
  });
  it('yanma: 1 yakıt tüketir, süresi tabloya göre; yanarken yenisi başlamaz', () => {
    const st = createMachine('jenerator');
    expect(canStartBurn(st)).toBe(false);
    insertFuel(st, 'item:kömür', 2);
    expect(canStartBurn(st)).toBe(true);
    expect(startBurn(st)).toBe(true);
    expect(st.fuel.count).toBe(1);
    expect(st.burnT).toBe(40);
    expect(canStartBurn(st)).toBe(false);
    expect(startBurn(st)).toBe(false);
    const mc = mctxFor(makeWorld());
    for (let i = 0; i < 40; i++) stepMachine('jenerator', st, '0,0,0', false, 1, mc);
    expect(st.burnT).toBe(0);
    expect(st.burnTotal).toBe(0);
    expect(generationRate('jenerator', st, mc, '0,0,0')).toBe(0);
    startBurn(st);
    expect(generationRate('jenerator', st, mc, '0,0,0')).toBe(R.generator.rate);
    expect(visualOn('jenerator', st)).toBe(true);
  });
});

describe('techMachines: elektrikli ocak', () => {
  it('tarif tablosu: yalnız tek girdili ocak tarifleri', () => {
    expect(furnaceRecipe('item:ham_demir')).toMatchObject({ out: 'item:demir_külçe', inCount: 1, count: 1 });
    expect(furnaceRecipe('item:kuantum_parçası')).toMatchObject({ out: 'item:kuantum_külçe', inCount: 2 });
    expect(furnaceRecipe('blok:kum').out).toBe('blok:cam');
    expect(furnaceRecipe('item:çiğ_balık').out).toBe('item:pişmiş_balık');
    expect(furnaceRecipe('item:elmas')).toBeNull();
    expect(furnaceRecipe('yok')).toBeNull();
    expect(furnaceTime()).toBe(5); // 10 sn / 2 hız
  });

  it('2 kat hızlı: 5 sn / parça; güç yokken ilerlemez; çıktı alınır', () => {
    const w = makeWorld();
    const mc = mctxFor(w);
    const st = createMachine('ocak');
    expect(furnaceInsert(st, 'item:ham_demir', 3)).toBe(3);
    expect(loadDemand('ocak', st, 1)).toBe(R.furnace.power);
    for (let i = 0; i < 6; i++) stepMachine('ocak', st, '0,60,0', false, 1, mc);
    expect(st.outCount).toBe(0);
    expect(visualOn('ocak', st)).toBe(false);
    for (let i = 0; i < 5; i++) stepMachine('ocak', st, '0,60,0', true, 1, mc);
    expect(st.outCount).toBe(1);
    expect(st.inCount).toBe(2);
    expect(visualOn('ocak', st)).toBe(true);
    for (let i = 0; i < 10; i++) stepMachine('ocak', st, '0,60,0', true, 1, mc);
    expect(st.outCount).toBe(3);
    expect(st.inItem).toBeNull();
    expect(loadDemand('ocak', st, 1)).toBe(0); // iş bitti → talep yok
    expect(mc.stats.smelted).toBe(3);
    expect(furnaceTake(st)).toEqual({ item: 'item:demir_külçe', count: 3 });
    expect(furnaceTake(st)).toBeNull();
  });

  it('uzun dt: tek adımda birden çok parça işlenir; kuantum 2 girdi ister', () => {
    const mc = mctxFor(makeWorld());
    const st = createMachine('ocak');
    furnaceInsert(st, 'item:ham_bakır', 10);
    stepMachine('ocak', st, '0,60,0', true, 12, mc);
    expect(st.outCount).toBe(2);
    const q = createMachine('ocak');
    furnaceInsert(q, 'item:kuantum_parçası', 3);
    for (let i = 0; i < 5; i++) stepMachine('ocak', q, '0,60,0', true, 1, mc);
    expect(q.outCount).toBe(1);
    expect(q.inCount).toBe(1);
    for (let i = 0; i < 10; i++) stepMachine('ocak', q, '0,60,0', true, 1, mc);
    expect(q.outCount).toBe(1); // tek parça kaldı: yetmez
    expect(loadDemand('ocak', q, 1)).toBe(0);
  });

  it('girdi/çıktı kuralları: farklı eşya karışmaz, çıktı alınmadan farklı tarif bloklanır, yığın sınırı', () => {
    const mc = mctxFor(makeWorld());
    const st = createMachine('ocak');
    expect(furnaceInsert(st, 'item:elmas', 1)).toBe(0);
    expect(furnaceInsert(st, 'item:ham_demir', 70)).toBe(64);
    expect(furnaceInsert(st, 'item:ham_bakır', 1)).toBe(0);
    expect(furnaceInsert(st, 'item:ham_demir', 1)).toBe(0); // dolu
    expect(furnaceTakeInput(st)).toEqual({ item: 'item:ham_demir', count: 64 });
    expect(furnaceTakeInput(st)).toBeNull();
    furnaceInsert(st, 'item:ham_demir', 1);
    stepMachine('ocak', st, '0,60,0', true, 5, mc);
    expect(st.outItem).toBe('item:demir_külçe');
    furnaceInsert(st, 'item:ham_bakır', 1); // girdi boşaldı → kabul
    expect(loadDemand('ocak', st, 1)).toBe(0); // çıktı yuvası demir doluyken bakır işlenmez
    for (let i = 0; i < 10; i++) stepMachine('ocak', st, '0,60,0', true, 1, mc);
    expect(st.outCount).toBe(1);
    furnaceTake(st);
    expect(loadDemand('ocak', st, 1)).toBe(R.furnace.power);
  });

  it('çıktı yığını 64\'te durur', () => {
    const mc = mctxFor(makeWorld());
    const st = createMachine('ocak');
    st.outItem = 'item:demir_külçe';
    st.outCount = 63;
    furnaceInsert(st, 'item:ham_demir', 5);
    stepMachine('ocak', st, '0,60,0', true, 100, mc);
    expect(st.outCount).toBe(64);
    expect(st.inCount).toBe(4);
  });
});

describe('techMachines: matkap (otomatik madenci)', () => {
  const KEY = '0,60,0';

  it('sütun modu: aşağı doğru kazar, kırılamaz kayada durur; eşyalar bitişik sandığa gider', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 39 });
    const chest = [];
    for (let i = 0; i < 27; i++) chest.push(null);
    w.set(1, 60, 0, B.CHEST);
    const mc = mctxFor(w, { chestAt: (x, y, z) => (x === 1 && y === 60 && z === 0 ? chest : null) });
    const st = createMachine('matkap');
    let steps = 0;
    while (!st.stop && steps++ < 200) stepMachine('matkap', st, KEY, true, 1, mc);
    expect(st.stop).toBe('ana_kaya');
    expect(st.mined).toBe(20); // y 59..40
    for (let y = 40; y <= 59; y++) expect(w.getBlock(0, y, 0), 'y' + y).toBe(0);
    expect(w.getBlock(0, 39, 0)).toBe(B.BEDROCK);
    expect(w.getBlock(1, 59, 0)).toBe(B.STONE); // komşu sütun dokunulmadı
    const total = chest.reduce((n, s) => n + (s ? s.count : 0), 0);
    expect(total).toBe(20);
    expect(chest[0].item).toBe('blok:kırıktaş');
    expect(mc.events.filter((e) => e.type === 'drillStopped')).toHaveLength(1);
    expect(mc.stats.drilled).toBe(20);
    // durduktan sonra enerji istemez ve değişmez
    expect(loadDemand('matkap', st, 1)).toBe(0);
    stepMachine('matkap', st, KEY, true, 10, mc);
    expect(st.mined).toBe(20);
  });

  it('süre: bloğun sertliğine bağlı; güçsüzken ilerlemez', () => {
    const w = makeWorld({ floorY: 59 });
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    stepMachine('matkap', st, KEY, false, 100, mc);
    expect(st.mined).toBe(0);
    expect(w.getBlock(0, 59, 0)).toBe(B.STONE);
    const need = drillTimeFor(B.STONE);
    expect(need).toBeCloseTo(2.5 * R.drill.timePerHardness, 5);
    stepMachine('matkap', st, KEY, true, need - 0.1, mc);
    expect(st.mined).toBe(0);
    expect(st.prog).toBeGreaterThan(0);
    stepMachine('matkap', st, KEY, true, 0.2, mc);
    expect(st.mined).toBe(1);
    expect(drillTimeFor(B.DIRT)).toBeGreaterThanOrEqual(R.drill.minTime);
    expect(drillTimeFor(B.QUANTUM_ORE)).toBeGreaterThan(drillTimeFor(B.DIAMOND_ORE));
    expect(drillTimeFor(B.AIR)).toBe(R.drill.minTime);
  });

  it('alan modu: 5x5 kazar (merkezden dışa), katman katman; komşu ötesi dokunulmaz', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 57 });
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    st.mode = 'alan';
    expect(drillCells('alan')).toHaveLength(25);
    expect(drillCells('alan')[0]).toEqual([0, 0]);
    expect(drillCells('column')).toHaveLength(1);
    let steps = 0;
    while (!st.stop && steps++ < 500) stepMachine('matkap', st, KEY, true, 5, mc);
    expect(st.stop).toBe('ana_kaya');
    expect(st.mined).toBe(50); // 25 × 2 katman (y 59, 58)
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        expect(w.getBlock(dx, 59, dz)).toBe(0);
        expect(w.getBlock(dx, 58, dz)).toBe(0);
      }
    }
    expect(w.getBlock(3, 59, 0)).toBe(B.STONE);
    expect(w.getBlock(0, 59, 3)).toBe(B.STONE);
    expect(w.getBlock(-3, 58, -3)).toBe(B.STONE);
  });

  it('sıvı ve havayı atlar (kazmaz), arkasındaki katıya devam eder', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 55 });
    w.set(0, 59, 0, B.WATER);
    w.set(0, 58, 0, 0);
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    let steps = 0;
    while (!st.stop && steps++ < 100) stepMachine('matkap', st, KEY, true, 2, mc);
    expect(w.getBlock(0, 59, 0)).toBe(B.WATER);
    expect(st.mined).toBe(2); // y59 su, y58 hava atlanır; y57 ve y56 taş kazılır; y55 ana kaya
  });

  it('yüklenmemiş bölgede bekler (durmaz) ve yüklenince sürdürür; ensure üretimi çağrılır', () => {
    let open = false;
    const w = makeWorld({ floorY: 59, bedrockY: 50, loaded: (x, y) => y >= 56 || open });
    const ensured = [];
    const mc = mctxFor(w, { ensure: (x, y, z) => { ensured.push([x, y, z]); } });
    const st = createMachine('matkap');
    for (let i = 0; i < 40; i++) stepMachine('matkap', st, KEY, true, 1, mc);
    expect(st.stop).toBeNull();
    expect(st.wait).toBe('yuk');
    expect(st.mined).toBe(4); // y 59..56
    expect(ensured.length).toBeGreaterThan(0);
    expect(visualOn('matkap', st)).toBe(false);
    open = true;
    for (let i = 0; i < 40; i++) stepMachine('matkap', st, KEY, true, 1, mc);
    expect(st.stop).toBe('ana_kaya');
    expect(st.mined).toBe(9); // y 59..51
  });

  it('dünya tabanı (minY): "dip" nedeniyle durur', () => {
    const w = makeWorld({ yMin: 45, floorY: 59 });
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    let steps = 0;
    while (!st.stop && steps++ < 200) stepMachine('matkap', st, KEY, true, 1, mc);
    expect(st.stop).toBe('dip');
    expect(st.mined).toBe(15); // y 59..45
  });

  it('derin dünya: negatif y ve -400 tabanı sorunsuz; ana kayada durur', () => {
    const w = makeWorld({ yMin: -400, yMax: 362, floorY: -380, bedrockY: -396 });
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    const key = '4,-370,4';
    let steps = 0;
    while (!st.stop && steps++ < 500) stepMachine('matkap', st, key, true, 2, mc);
    expect(st.stop).toBe('ana_kaya');
    expect(st.mined).toBe(-380 - -395 + 1); // y -380..-395
    expect(w.getBlock(4, -396, 4)).toBe(B.BEDROCK);
  });

  it('çıktı: sandık yoksa tampon; yere bırakma işlevi varsa en çok 6 yığın/adım bırakılır; tampon dolunca bekler', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 30 });
    const st = createMachine('matkap');
    const mc = mctxFor(w);
    for (let i = 0; i < 5; i++) stepMachine('matkap', st, KEY, true, 1.2, mc);
    expect(st.buf.reduce((n, s) => n + s.count, 0)).toBeGreaterThanOrEqual(4);
    const dropped = [];
    const mc2 = mctxFor(w, { drop: (d) => dropped.push(d) });
    stepMachine('matkap', st, KEY, true, 0.01, mc2);
    expect(dropped.length).toBeGreaterThanOrEqual(1);
    expect(dropped[0].item).toBe('blok:kırıktaş');
    expect(dropped[0].y).toBeGreaterThan(60);
    expect(st.buf).toHaveLength(0);
    // tampon doldur
    const full = createMachine('matkap');
    full.buf = [{ item: 'blok:taş', count: 64 }, { item: 'blok:toprak', count: 64 }, { item: 'blok:kum', count: 64 }, { item: 'blok:çakıl', count: 64 }];
    stepMachine('matkap', full, KEY, true, 5, mctxFor(w));
    expect(full.wait).toBe('dolu');
    expect(loadDemand('matkap', full, 1)).toBe(0);
    expect(full.mined).toBe(0);
    const taken = drillTakeBuffer(full);
    expect(taken).toHaveLength(4);
    expect(full.buf).toHaveLength(0);
    expect(full.wait).toBeNull();
    expect(flushDrillBuffer(full, KEY, mc2, 6)).toBe(0);
  });

  it('dolu sandık taşan eşyayı tampona alır (kaybolmaz)', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 50 });
    w.set(1, 60, 0, B.CHEST);
    const chest = new Array(27).fill(null).map(() => ({ item: 'blok:altın_bloğu', count: 1, dur: undefined }));
    const mc = mctxFor(w, { chestAt: () => chest });
    const st = createMachine('matkap');
    for (let i = 0; i < 5; i++) stepMachine('matkap', st, KEY, true, 1.2, mc);
    const inBuf = st.buf.reduce((n, s) => n + s.count, 0);
    expect(inBuf).toBe(st.mined);
    expect(st.mined).toBeGreaterThan(0);
  });

  it('kırılabilen cevherden doğru eşya düşer; dünya yazımı reddederse bekler', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 56 });
    w.set(0, 59, 0, B.COAL_ORE);
    w.set(0, 58, 0, B.DIAMOND_ORE);
    const mc = mctxFor(w);
    const st = createMachine('matkap');
    for (let i = 0; i < 20; i++) stepMachine('matkap', st, KEY, true, 1, mc);
    const items = {};
    st.buf.forEach((s) => { items[s.item] = (items[s.item] || 0) + s.count; });
    expect(items['item:kömür']).toBeGreaterThanOrEqual(1);
    expect(items['item:elmas']).toBe(1);
    const w2 = makeWorld({ floorY: 59 });
    const mc2 = mctxFor(w2, { setBlock: () => false });
    const s2 = createMachine('matkap');
    stepMachine('matkap', s2, KEY, true, 10, mc2);
    expect(s2.wait).toBe('yuk');
    expect(s2.mined).toBe(0);
  });

  it('mod değişimi ve yeniden başlatma sıfırlar', () => {
    const st = createMachine('matkap');
    st.stop = 'ana_kaya';
    st.ly = 40;
    st.ci = 3;
    resetDrill(st);
    expect(st).toMatchObject({ stop: null, ly: null, ci: 0, prog: 0, blocked: false });
  });

  it('belirlenimci: aynı tohum ve dünya aynı düşüşleri verir', () => {
    const results = [0, 1].map(() => {
      const w = makeWorld({ floorY: 59, bedrockY: 40 });
      for (let y = 41; y <= 59; y += 3) w.set(0, y, 0, B.COAL_ORE);
      const st = createMachine('matkap');
      const mc = mctxFor(w);
      for (let i = 0; i < 80; i++) stepMachine('matkap', st, KEY, true, 1, mc);
      return JSON.stringify(st.buf);
    });
    expect(results[0]).toBe(results[1]);
  });
});

describe('techMachines: kapı, lamba, düğme, anahtar yardımcıları', () => {
  it('lamba beslenmeye eşlenir; kapı beslenince açılır, güç gidince kapanır (içeride biri varsa bekler)', () => {
    const w = makeWorld();
    const mc = mctxFor(w);
    const l = createMachine('lamba');
    stepMachine('lamba', l, '0,60,0', true, 1, mc);
    expect(l.on).toBe(true);
    stepMachine('lamba', l, '0,60,0', false, 1, mc);
    expect(l.on).toBe(false);
    const d = createMachine('kapi');
    stepMachine('kapi', d, '0,60,0', true, 1, mc);
    expect(d.open).toBe(true);
    expect(visualBlockId('kapi', d.open)).toBe(B.TECH_DOOR_OPEN);
    let occupied = true;
    const mc2 = mctxFor(w, { isOccupied: () => occupied });
    stepMachine('kapi', d, '0,60,0', false, 1, mc2);
    expect(d.open).toBe(true);
    occupied = false;
    stepMachine('kapi', d, '0,60,0', false, 1, mc2);
    expect(d.open).toBe(false);
    expect(visualBlockId('kapi', false)).toBe(B.TECH_DOOR);
  });

  it('düğme modları', () => {
    const t = createMachine('dugme');
    expect(pressButton(t)).toBe(true);
    expect(pressButton(t)).toBe(false);
    t.mode = 'pulse';
    expect(pressButton(t)).toBe(true);
    expect(t.left).toBe(R.button.pulse);
  });

  it('görsel blok kimlikleri: taban ↔ etkin eşleşir; gün ışığı olmayan türlerde taban kalır', () => {
    expect(visualBlockId('lamba', true)).toBe(B.TECH_LAMP_ON);
    expect(visualBlockId('lamba', false)).toBe(B.TECH_LAMP);
    expect(visualBlockId('pil', true)).toBe(B.TECH_BATTERY);
    expect(visualBlockId('gunes', true)).toBe(B.TECH_SOLAR);
    expect(visualBlockId('isinlayici', true)).toBe(B.TECH_TELEPORTER_ON);
  });

  it('insertIntoSlots: yığınlama, yığınlanmayan eşya, dolu sandık', () => {
    const slots = [null, { item: 'blok:taş', count: 60 }, null];
    expect(insertIntoSlots(slots, 'blok:taş', 10)).toBe(0);
    expect(slots[1].count).toBe(64);
    expect(slots[0]).toEqual({ item: 'blok:taş', count: 6 });
    expect(insertIntoSlots(slots, 'item:kazma_demir', 2)).toBe(1); // 1 boş yuva kaldı, yığınlanmaz
    expect(insertIntoSlots(slots, 'blok:taş', 1)).toBe(0); // slots[0] 6/64 yığınına eklenir
    expect(slots[0].count).toBe(7);
    expect(insertIntoSlots(slots, 'blok:kum', 1)).toBe(1); // boş yuva kalmadı
  });
});

describe('techMachines: güneş gökyüzü erişimi', () => {
  it('opak tavan engeller; cam geçirir; yaprak tek başına geçirir, çok yaprak engeller; null yüklü değil → açık', () => {
    const w = makeWorld();
    const g = (x, y, z) => w.getBlock(x, y, z);
    expect(skyAccess(g, 0, 60, 0, 127)).toBe(true);
    w.set(0, 65, 0, B.STONE);
    expect(skyAccess(g, 0, 60, 0, 127)).toBe(false);
    w.set(0, 65, 0, B.GLASS);
    expect(skyAccess(g, 0, 60, 0, 127)).toBe(true);
    w.set(0, 65, 0, B.LEAVES_OAK);
    expect(skyAccess(g, 0, 60, 0, 127)).toBe(true);
    for (let y = 66; y <= 74; y++) w.set(0, y, 0, B.LEAVES_OAK);
    expect(skyAccess(g, 0, 60, 0, 127)).toBe(false);
    const w2 = makeWorld({ loaded: (x, y) => y < 70 });
    expect(skyAccess((x, y, z) => w2.getBlock(x, y, z), 0, 60, 0, 127)).toBe(true);
  });
});

describe('techState: ışınlanma platformları', () => {
  function pair() {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_TELEPORTER);
    place(w, tech, 20, 60, 5, B.TECH_TELEPORTER);
    return { w, tech };
  }

  it('frekans doğrulama ve benzersizlik: bir frekansta en çok iki platform', () => {
    const { w, tech } = pair();
    place(w, tech, 40, 60, 0, B.TECH_TELEPORTER);
    expect(tech.setMachineConfig(0, 60, 0, { freq: '0123' }).ok).toBe(true);
    expect(tech.setMachineConfig(20, 60, 5, { freq: '0123' }).ok).toBe(true);
    const third = tech.setMachineConfig(40, 60, 0, { freq: '0123' });
    expect(third.ok).toBe(false);
    expect(third.reason).toBe('dolu');
    expect(tech.get(40, 60, 0).freq).toBeNull();
    expect(tech.setMachineConfig(40, 60, 0, { freq: '9999' }).reason).toBe('frekans');
    expect(tech.setMachineConfig(40, 60, 0, { freq: '12' }).reason).toBe('frekans');
    expect(tech.setMachineConfig(40, 60, 0, { freq: 12345 }).reason).toBe('frekans');
    expect(tech.setMachineConfig(40, 60, 0, { freq: '0124' }).ok).toBe(true);
    expect(tech.setMachineConfig(0, 60, 0, { freq: null }).ok).toBe(true);
    expect(tech.get(0, 60, 0).freq).toBeNull();
    // aynı platformun kendi frekansını yeniden yazması "dolu" sayılmaz
    expect(tech.setMachineConfig(20, 60, 5, { freq: '0123' }).ok).toBe(true);
    expect(tech.setMachineConfig(99, 99, 99, { freq: '0123' }).ok).toBe(false);
    const info = tech.machineInfo(20, 60, 5);
    expect(info.symbols).toEqual(['üçgen', 'daire', 'kare', 'yıldız']);
  });

  it('ışınlanma: eş yoksa/frekanssızsa reddeder; enerji, bekleme ve maliyet', () => {
    const { w, tech } = pair();
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('frekans');
    tech.setMachineConfig(0, 60, 0, { freq: '1111' });
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('es_yok');
    tech.setMachineConfig(20, 60, 5, { freq: '1111' });
    const noE = tech.teleport(0, 60, 0, { world: w });
    expect(noE.reason).toBe('enerji');
    expect(noE.need).toBeGreaterThan(R.teleporter.baseCost);
    tech.get(0, 60, 0).buf = 240;
    const ok = tech.teleport(0, 60, 0, { world: w });
    expect(ok.ok).toBe(true);
    expect(ok.to).toEqual({ x: 20.5, y: 60.5, z: 5.5 });
    const dist = Math.hypot(20, 0, 5);
    expect(ok.cost).toBe(Math.round(R.teleporter.baseCost + R.teleporter.perDistance * dist));
    expect(tech.get(0, 60, 0).buf).toBeCloseTo(240 - ok.cost, 3);
    expect(ok.event.type).toBe('teleported');
    // ping-pong yok: hem kaynak hem hedef soğur
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('bekleme');
    tech.get(20, 60, 5).buf = 240;
    const back = tech.teleport(20, 60, 5, { world: w });
    expect(back.reason).toBe('bekleme');
    expect(back.left).toBeGreaterThan(0);
    run(tech, w, 6, {}, 1);
    expect(tech.get(0, 60, 0).cd).toBe(0);
    expect(tech.teleport(20, 60, 5, { world: w }).ok).toBe(true);
  });

  it('maliyet mesafeyle artar ve üst sınırla kırpılır; uzak platform yüklü değilse reddedilir', () => {
    const w = makeWorld({ loaded: (x) => x < 500 });
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_TELEPORTER);
    w.loaded = null;
    place(w, tech, 3000, 60, 0, B.TECH_TELEPORTER);
    tech.setMachineConfig(0, 60, 0, { freq: '7000' });
    tech.setMachineConfig(3000, 60, 0, { freq: '7000' });
    tech.get(0, 60, 0).buf = 240;
    w.loaded = (x) => x < 500;
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('yuklenmedi');
    w.loaded = null;
    const r = tech.teleport(0, 60, 0, { world: w });
    expect(r.ok).toBe(true);
    expect(r.cost).toBe(R.teleporter.maxCost);
    expect(tech.teleportTargetOf(0, 60, 0)).toEqual({ x: 3000, y: 60, z: 0 });
    expect(tech.teleportTargetOf(5, 5, 5)).toBeNull();
  });

  it('hedef üstü kapalıysa "engelli"; eş blok kırılmışsa kayıt temizlenir', () => {
    const { w, tech } = pair();
    tech.setMachineConfig(0, 60, 0, { freq: '2222' });
    tech.setMachineConfig(20, 60, 5, { freq: '2222' });
    tech.get(0, 60, 0).buf = 240;
    w.set(20, 62, 5, B.STONE);
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('engelli');
    expect(tech.get(0, 60, 0).buf).toBe(240); // enerji harcanmadı
    w.set(20, 62, 5, 0);
    w.set(20, 60, 5, 0);
    expect(tech.teleport(0, 60, 0, { world: w }).reason).toBe('es_yok');
    expect(tech.has(20, 60, 5)).toBe(false);
  });

  it('enerji ağıyla dolar: jeneratör + kablo → tampon artar ve ETKİN blok görünür', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_TELEPORTER);
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 10, {}, 1);
    // tek jeneratör (12 EU/sn) talebi (25 EU/sn) karşılayamaz ama tampon makine KISMİ beslenir
    const buf = tech.get(1, 60, 0).buf;
    expect(buf).toBeGreaterThanOrEqual(R.teleporter.minReady);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_TELEPORTER_ON);
    expect(buf).toBeLessThanOrEqual(R.teleporter.cap);
  });
});

describe('techState: asansör platformları', () => {
  function column() {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_LIFT);
    place(w, tech, 0, 70, 0, B.TECH_LIFT);
    place(w, tech, 0, 90, 0, B.TECH_LIFT);
    place(w, tech, 3, 75, 0, B.TECH_LIFT); // başka sütun
    [[0, 60, 0], [0, 70, 0], [0, 90, 0], [3, 75, 0]].forEach((p) => { tech.get(p[0], p[1], p[2]).buf = 80; });
    return { w, tech };
  }

  it('en yakın bağlı platforma çıkar/iner; maliyet mesafeyle; başka sütunla bağlanmaz', () => {
    const { w, tech } = column();
    const up = tech.lift(0, 60, 0, 1, { world: w });
    expect(up.ok).toBe(true);
    expect(up.to).toEqual({ x: 0.5, y: 70.5, z: 0.5 });
    expect(up.distance).toBe(10);
    expect(up.cost).toBe(15);
    expect(up.duration).toBeCloseTo(10 / R.lift.speed, 2);
    expect(tech.get(0, 60, 0).buf).toBe(65);
    const down = tech.lift(0, 90, 0, -1, { world: w });
    expect(down.to.y).toBe(70.5);
    expect(down.distance).toBe(20);
    expect(down.cost).toBe(30);
    expect(tech.lift(0, 90, 0, 1, { world: w }).reason).toBe('hedef_yok');
    expect(tech.lift(0, 60, 0, -1, { world: w }).reason).toBe('hedef_yok');
    expect(tech.lift(3, 75, 0, 1, { world: w }).reason).toBe('hedef_yok');
    expect(tech.machineInfo(0, 70, 0)).toMatchObject({ up: 90, down: 60 });
  });

  it('enerji, bekleme, engelli ve yüklenmedi durumları', () => {
    const { w, tech } = column();
    tech.get(0, 60, 0).buf = 3;
    expect(tech.lift(0, 60, 0, 1, { world: w }).reason).toBe('enerji');
    tech.get(0, 60, 0).buf = 80;
    expect(tech.lift(0, 60, 0, 1, { world: w }).ok).toBe(true);
    expect(tech.lift(0, 60, 0, 1, { world: w }).reason).toBe('bekleme');
    run(tech, w, 2, {}, 1);
    w.set(0, 72, 0, B.STONE); // hedef (0,70) üstü kapalı değil; 71-72 → 72 kapalı → engelli
    expect(tech.lift(0, 60, 0, 1, { world: w }).reason).toBe('engelli');
    w.set(0, 72, 0, 0);
    const w2 = makeWorld({ loaded: (x, y) => y < 65 });
    const t2 = newTech();
    place(w2, t2, 0, 60, 0, B.TECH_LIFT);
    w2.loaded = null;
    place(w2, t2, 0, 70, 0, B.TECH_LIFT);
    t2.get(0, 60, 0).buf = 80;
    w2.loaded = (x, y) => y < 65;
    expect(t2.lift(0, 60, 0, 1, { world: w2 }).reason).toBe('yuklenmedi');
    expect(tech.lift(9, 9, 9, 1, { world: w }).ok).toBe(false);
  });

  it('uzun yolculuk: bedel tamponla (80 EU) sınırlı; 96 blokluk bağlantı dolu tamponla kullanılabilir (QA5: kalıcı "enerji" hatası olmasın)', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 5, 0, B.TECH_LIFT);
    place(w, tech, 0, 101, 0, B.TECH_LIFT); // 96 blok
    place(w, tech, 5, 5, 0, B.TECH_LIFT);
    place(w, tech, 5, 85, 0, B.TECH_LIFT); // 80 blok → ⌈1,5×80⌉ = 120 > 80
    tech.get(0, 5, 0).buf = R.lift.cap;
    tech.get(5, 5, 0).buf = R.lift.cap;
    const far = tech.lift(0, 5, 0, 1, { world: w });
    expect(far.ok).toBe(true);
    expect(far.cost).toBe(R.lift.cap);
    expect(far.distance).toBe(96);
    const mid = tech.lift(5, 5, 0, 1, { world: w });
    expect(mid.ok).toBe(true);
    expect(mid.cost).toBe(R.lift.cap);
    tech.get(5, 85, 0).cd = 0;
    tech.get(5, 85, 0).buf = 79;
    expect(tech.lift(5, 85, 0, -1, { world: w }).reason).toBe('enerji'); // tampon dolmadan yine yetmez
  });

  it('menzil sınırı: çok uzak platform bağlanmaz', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 5, 0, B.TECH_LIFT);
    place(w, tech, 0, 120, 0, B.TECH_LIFT);
    tech.get(0, 5, 0).buf = 80;
    expect(tech.lift(0, 5, 0, 1, { world: w }).reason).toBe('hedef_yok'); // 115 > 96
  });
});

describe('techState: şarj istasyonu ve pil ile eşya şarjı', () => {
  it('Şarj İstasyonu yakındaki oyuncunun şarjlı eşyalarını tamponundan doldurur; uzaktaysa doldurmaz', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_CHARGER);
    tech.get(0, 60, 0).buf = 300;
    const inv = new Inventory();
    inv.addStack('item:jetpack', 1, undefined, undefined, 0);
    inv.addStack('item:tarayıcı', 1, undefined, undefined, 100);
    run(tech, w, 3, { player: { x: 50, y: 60, z: 50 }, inventory: inv }, 1);
    expect(chargeOf(inv.slots[0])).toBe(0);
    run(tech, w, 3, { player: { x: 1, y: 60, z: 1 }, inventory: inv }, 1);
    expect(chargeOf(inv.slots[0]) + chargeOf(inv.slots[1])).toBeGreaterThan(100);
    expect(tech.get(0, 60, 0).buf).toBeLessThan(300);
    expect(w.getBlock(0, 60, 0)).toBe(B.TECH_CHARGER_ON);
    run(tech, w, 60, { player: { x: 1, y: 60, z: 1 }, inventory: inv }, 1);
    expect(inv.slots[0].charge).toBeLessThanOrEqual(1000);
  });

  it('dischargeInto: Pil Bankasından envantere aktarır; boş kaynak/dolu eşya reddedilir', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_BATTERY);
    tech.get(0, 60, 0).stored = 1000;
    const inv = new Inventory();
    inv.addStack('item:kazma_elektrikli', 1, undefined, undefined, 100);
    const r = tech.dischargeInto(0, 60, 0, inv, 300);
    expect(r.ok).toBe(true);
    expect(r.used).toBe(300);
    expect(inv.slots[0].charge).toBe(400);
    expect(tech.get(0, 60, 0).stored).toBe(700);
    const r2 = tech.dischargeInto(0, 60, 0, inv, 5000);
    expect(r2.used).toBe(400); // 800 azami - 400 → 400
    expect(inv.slots[0].charge).toBe(800);
    expect(tech.dischargeInto(0, 60, 0, inv, 100).reason).toBe('dolu');
    tech.get(0, 60, 0).stored = 0;
    inv.slots[0].charge = 10;
    expect(tech.dischargeInto(0, 60, 0, inv, 100).reason).toBe('bos');
    expect(tech.dischargeInto(5, 5, 5, inv, 100).ok).toBe(false);
  });
});

describe('techState: bütünleşik makineler', () => {
  it('Elektrikli ocak jeneratör ağında eritir; ham demir → külçe, sandığa gitmez, çıktı alınır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_FURNACE);
    tech.insertFuel(0, 60, 0, 'item:kömür', 4);
    expect(tech.furnaceInsert(1, 60, 0, 'item:ham_demir', 4).accepted).toBe(4);
    expect(tech.furnaceInsert(1, 60, 0, 'item:elmas', 1).ok).toBe(false);
    const ev = run(tech, w, 22, {}, 1);
    expect(ev.filter((e) => e.type === 'smelted').length).toBe(4);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_FURNACE); // iş bitince söner
    expect(tech.furnaceTake(1, 60, 0)).toEqual({ item: 'item:demir_külçe', count: 4 });
    const info = tech.machineInfo(1, 60, 0);
    expect(info.inCount).toBe(0);
  });

  it('Matkap iki jeneratörle çalışır; tek jeneratör (12 < 20 EU/sn) yetmez; pil açığı kapatır', () => {
    // matkap (0,61,0) yan yana jeneratörlerle (±x) bağlı; altındaki sütun (0,60..) kazılır
    const mk = (nGen, withBattery) => {
      const w = makeWorld({ floorY: 59, bedrockY: 55 });
      const tech = newTech();
      place(w, tech, 0, 61, 0, B.TECH_DRILL);
      const spots = [[1, 61, 0], [-1, 61, 0]];
      for (let i = 0; i < nGen; i++) {
        place(w, tech, spots[i][0], spots[i][1], spots[i][2], B.TECH_GENERATOR);
        tech.insertFuel(spots[i][0], spots[i][1], spots[i][2], 'item:kömür', 64);
      }
      if (withBattery) {
        place(w, tech, -1, 61, 0, B.TECH_BATTERY);
        tech.get(-1, 61, 0).stored = 5000;
      }
      return { w, tech };
    };
    const one = mk(1, false);
    run(one.tech, one.w, 20, {}, 1);
    expect(one.tech.get(0, 61, 0).mined).toBe(0);
    const two = mk(2, false);
    run(two.tech, two.w, 30, {}, 1);
    expect(two.tech.get(0, 61, 0).mined).toBeGreaterThanOrEqual(4); // y59..56 (4 blok × 1,1 sn) ve y55 ana kaya
    expect(two.tech.get(0, 61, 0).stop).toBe('ana_kaya');
    const bat = mk(1, true);
    run(bat.tech, bat.w, 30, {}, 1);
    expect(bat.tech.get(0, 61, 0).mined).toBeGreaterThanOrEqual(4);
  });

  it('Güç Kapısı enerjiyle açılır (geçilebilir), enerji gidince kapanır', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 1, 60, 0, B.TECH_DOOR);
    tech.insertFuel(0, 60, 0, 'item:sopa', 2); // 5 sn
    run(tech, w, 2, {}, 1);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_DOOR_OPEN);
    run(tech, w, 8, {}, 1);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_DOOR);
  });

  it('kırılan makinenin içeriği geri verilir (jeneratör yakıtı, ocak girdisi, matkap tamponu)', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    place(w, tech, 5, 60, 0, B.TECH_FURNACE);
    place(w, tech, 9, 60, 0, B.TECH_DRILL);
    tech.insertFuel(0, 60, 0, 'item:kömür', 7);
    tech.furnaceInsert(5, 60, 0, 'item:ham_altın', 3);
    tech.get(9, 60, 0).buf = [{ item: 'blok:taş', count: 5 }];
    w.onChange((e) => {
      const r = tech.onBlockChange(e);
      r.items.forEach((s) => w.dropped = (w.dropped || []).concat(s));
    });
    w.setBlock(0, 60, 0, 0);
    w.setBlock(5, 60, 0, 0);
    w.setBlock(9, 60, 0, 0);
    expect(w.dropped).toEqual([
      { item: 'item:kömür', count: 7 }, { item: 'item:ham_altın', count: 3 }, { item: 'blok:taş', count: 5 },
    ]);
    expect(tech.count()).toBe(0);
  });

  it('blok durum varyantı değişimi (etkin↔pasif) makineyi silmez', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_LAMP);
    tech.get(0, 60, 0).on = true;
    const r = tech.onBlockChange({ x: 0, y: 60, z: 0, oldId: B.TECH_LAMP, newId: B.TECH_LAMP_ON });
    expect(r.items).toEqual([]);
    expect(tech.has(0, 60, 0)).toBe(true);
    expect(tech.get(0, 60, 0).on).toBe(true);
    tech.onBlockChange({ x: 0, y: 60, z: 0, oldId: B.TECH_LAMP_ON, newId: 0 });
    expect(tech.has(0, 60, 0)).toBe(false);
  });

  it('blok dünyada değişmişken (olay kaçtı): makine sonraki adımda temizlenir ve machineLost olayı içerikle gelir', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    tech.insertFuel(0, 60, 0, 'item:kömür', 5);
    w.set(0, 60, 0, B.STONE);
    const ev = run(tech, w, 2, {}, 1);
    const lost = ev.find((e) => e.type === 'machineLost');
    expect(lost).toMatchObject({ machine: 'jenerator', x: 0, y: 60, z: 0 });
    expect(lost.items).toEqual([{ item: 'item:kömür', count: 5 }]);
    expect(tech.has(0, 60, 0)).toBe(false);
  });

  it('yüklü olmayan chunk\'taki makine uyur: durumu korunur, ilerlemez, silinmez', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    tech.insertFuel(0, 60, 0, 'item:kömür', 5);
    place(w, tech, 1, 60, 0, B.TECH_LAMP);
    w.loaded = (x) => x > 100;
    run(tech, w, 5, {}, 1);
    expect(tech.has(0, 60, 0)).toBe(true);
    expect(tech.get(0, 60, 0).fuel.count).toBe(5);
    w.loaded = null;
    run(tech, w, 3, {}, 1);
    expect(w.getBlock(1, 60, 0)).toBe(B.TECH_LAMP_ON);
  });

  it('kayıtsız makine bloğu (olay kaçtı) ağ taramasında otomatik kaydedilir', () => {
    const w = makeWorld();
    const tech = newTech();
    place(w, tech, 0, 60, 0, B.TECH_GENERATOR);
    w.set(1, 60, 0, B.TECH_CABLE);
    w.set(2, 60, 0, B.TECH_LAMP); // place çağrılmadı
    tech.insertFuel(0, 60, 0, 'item:kömür', 2);
    run(tech, w, 3, {}, 1);
    expect(tech.has(2, 60, 0)).toBe(true);
    expect(w.getBlock(2, 60, 0)).toBe(B.TECH_LAMP_ON);
  });

  it('machineTick olayı özet taşır (üretim/tüketim/depo/matkap)', () => {
    const w = makeWorld({ floorY: 59, bedrockY: 55 });
    const tech = newTech();
    place(w, tech, 0, 61, 0, B.TECH_DRILL);
    place(w, tech, 1, 61, 0, B.TECH_GENERATOR);
    place(w, tech, -1, 61, 0, B.TECH_GENERATOR);
    tech.insertFuel(1, 61, 0, 'item:kömür', 4);
    tech.insertFuel(-1, 61, 0, 'item:kömür', 4);
    const ev = run(tech, w, 10, {}, 1);
    const ticks = ev.filter((e) => e.type === 'machineTick');
    expect(ticks.length).toBe(10);
    expect(ticks.reduce((n, e) => n + e.drilled, 0)).toBe(tech.get(0, 61, 0).mined);
    expect(ticks.some((e) => e.consumed > 0)).toBe(true);
    ticks.forEach((e) => {
      expect(e.machines).toBe(3);
      expect(e.generated).toBeGreaterThanOrEqual(0);
    });
  });
});
