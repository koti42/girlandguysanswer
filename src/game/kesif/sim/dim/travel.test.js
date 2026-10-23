import { afterEach, describe, expect, it } from 'vitest';
import { B, LIQUID_LUT, SOLID_LUT } from '../blocks.js';
import { Inventory } from '../inventory.js';
import { itemByKey } from '../items.js';
import { seededRandom } from '../rng.js';
import { World } from '../world.js';
import { makeCityWorld } from './dimTestKit.js';
import {
  CELL_ITEM, CORE_ITEM, GATE_RULES, TRAVEL_MESSAGES, arrivalPoint, canOpenGate, dimBoundOf, foundTerminalCount, gateCost, gateSpot, isTerminalFound,
  markTerminalFound, registerDimBound, respawnTerminal, returnStash, splitBoundItems, takeBoundItems, unregisterDimBound,
} from './travel.js';

afterEach(() => unregisterDimBound());

/** Her kuralı geçen taban durum. */
function okState(over) {
  return Object.assign({
    mode: 'macera',
    dim: 'overworld',
    abilities: { portalGun: true },
    dimMeta: { calibrated: true, lastHopAt: 0 },
    hasCore: false,
    charge: 24,
    cells: 0,
  }, over);
}
function okCtx(over) {
  return Object.assign({ time: 1000, zoneUnlocked: true }, over);
}

describe('sabit eşyalar', () => {
  it('Kuantum Çekirdeği ve Enerji Hücresi gerçek eşyalardır', () => {
    expect(itemByKey(CORE_ITEM)).toBeTruthy();
    expect(itemByKey(CELL_ITEM)).toBeTruthy();
    expect(itemByKey(CORE_ITEM).key).toBe(CORE_ITEM);
  });
});

describe('GATE_RULES', () => {
  it('sözleşme sayıları', () => {
    expect(GATE_RULES.cost).toBe(12);
    expect(GATE_RULES.ttl).toBe(30);
    expect(GATE_RULES.openCooldown).toBe(5);
    expect(GATE_RULES.hopCooldown).toBe(20);
    expect(GATE_RULES.calibrateSecs).toBe(3);
    expect([GATE_RULES.w, GATE_RULES.h, GATE_RULES.d]).toEqual([3, 4, 1]);
    expect(Object.isFrozen(GATE_RULES)).toBe(true);
  });
});

describe('gateCost', () => {
  it('kalibre boyutta yalnız 12 şarj; kalibre değilse + 1 Kuantum Çekirdeği (Kalibrasyon)', () => {
    expect(gateCost(okState())).toEqual({
      charges: 12, core: 0, calibrate: false, free: false,
    });
    expect(gateCost(okState({ dimMeta: { calibrated: false } }))).toEqual({
      charges: 12, core: 1, calibrate: true, free: false,
    });
    expect(gateCost()).toEqual({
      charges: 12, core: 1, calibrate: true, free: false,
    });
  });
  it('terminal dönüşü ücretsiz', () => {
    expect(gateCost(okState(), { free: true })).toEqual({
      charges: 0, core: 0, calibrate: false, free: true,
    });
  });
});

describe('canOpenGate — her kural ve ileti', () => {
  it('her şey uygunken ok + maliyet + varış boyutu', () => {
    const r = canOpenGate(okState(), okCtx());
    expect(r).toMatchObject({ ok: true, reason: null, message: null, kind: 'out', dest: 'neon' });
    expect(r.cost).toEqual({
      charges: 12, core: 0, calibrate: false, free: false,
    });
  });

  const rows = [
    ['mod', okState({ mode: 'insa' }), okCtx(), 'Boyut kapısı yalnızca macera modunda açılır.'],
    ['mod', okState({ mode: 'harita' }), okCtx(), TRAVEL_MESSAGES.mod],
    ['yetenek', okState({ abilities: { portalGun: false } }), okCtx(), 'Boyut kapısı için Portal Tabancası yeteneğini açmalısın.'],
    ['yetenek', okState({ abilities: null }), okCtx(), TRAVEL_MESSAGES.yetenek],
    ['gecis', okState(), okCtx({ transitioning: true }), 'Boyut geçişi sürüyor.'],
    ['parkur', okState(), okCtx({ inParkour: true }), 'Parkur sırasında boyut kapısı kapalı: yarışma adil kalsın.'],
    ['bulmaca', okState(), okCtx({ inPuzzle: true }), 'Bulmaca odalarında boyut kapısı açılamaz.'],
    ['boss', okState(), okCtx({ inBoss: true }), 'Boss arenasında boyut kapısı açılamaz.'],
    ['muhur', okState(), okCtx({ inSealAltar: true }), 'Mühür sunağının yanında boyut kapısı açılamaz.'],
    ['sualti', okState(), okCtx({ underwater: true }), 'Su altında boyut kapısı açılamaz.'],
    ['bolge', okState(), okCtx({ zoneUnlocked: false }), 'Mühürlü bölgede boyut kapısı açılamaz.'],
    ['kalibrasyon', okState({ dimMeta: { calibrated: false }, hasCore: false }), okCtx(), 'Portal Tabancasını boyutlara kalibre etmek için bir Kuantum Çekirdeği gerekli.'],
    ['sarj', okState({ charge: 11, cells: 0 }), okCtx(), 'Boyut kapısı için 12 portal şarjı gerekli (1 Enerji Hücresi 12 şarj yükler).'],
    ['yer', okState(), okCtx({ spot: null }), 'Buraya kapı açılamaz: 3×4 blokluk boş bir alan gerekli.'],
  ];
  rows.forEach(([reason, st, cx, msg]) => {
    it('red: ' + reason + ' — ' + msg, () => {
      const r = canOpenGate(st, cx);
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(reason);
      expect(r.message).toBe(msg);
      expect(r.cost).toBeUndefined();
    });
  });

  it('kalibrasyon: çekirdek (bool ya da sayı) varsa geçer; kalibreyse çekirdek aranmaz', () => {
    expect(canOpenGate(okState({ dimMeta: { calibrated: false }, hasCore: true }), okCtx()).ok).toBe(true);
    expect(canOpenGate(okState({ dimMeta: { calibrated: false }, hasCore: 1 }), okCtx()).ok).toBe(true);
    expect(canOpenGate(okState({ dimMeta: { calibrated: false }, hasCore: 0 }), okCtx()).reason).toBe('kalibrasyon');
    expect(canOpenGate(okState({ dimMeta: {}, hasCore: 'evet' }), okCtx()).reason).toBe('kalibrasyon');
    const r = canOpenGate(okState({ dimMeta: { calibrated: false }, hasCore: true }), okCtx());
    expect(r.cost).toMatchObject({ core: 1, calibrate: true, charges: 12 });
  });

  it('şarj: ≥12 yeter; <12 ise çantada ≥1 Enerji Hücresi (+12 yükler) yeter; sınır değerleri', () => {
    expect(canOpenGate(okState({ charge: 12 }), okCtx()).ok).toBe(true);
    expect(canOpenGate(okState({ charge: 11.99 }), okCtx()).reason).toBe('sarj');
    expect(canOpenGate(okState({ charge: 0, cells: 1 }), okCtx()).ok).toBe(true);
    expect(canOpenGate(okState({ charge: 5, cells: 3 }), okCtx()).ok).toBe(true);
    expect(canOpenGate(okState({ charge: 0, cells: 0 }), okCtx()).reason).toBe('sarj');
    expect(canOpenGate(okState({ charge: NaN, cells: NaN }), okCtx()).reason).toBe('sarj');
    expect(canOpenGate(okState({ charge: undefined, cells: undefined }), okCtx()).reason).toBe('sarj');
  });

  it('kapı açma bekleme 5 sn (son açılıştan): kalan süre iletide', () => {
    let r = canOpenGate(okState(), okCtx({ time: 1002, lastGateAt: 1000 }));
    expect(r).toMatchObject({ ok: false, reason: 'bekleme' });
    expect(r.message).toBe('Kapı hazırlanıyor: 3 sn bekle.');
    expect(r.wait).toBeCloseTo(3, 6);
    r = canOpenGate(okState(), okCtx({ time: 1004.2, lastGateAt: 1000 }));
    expect(r.message).toBe('Kapı hazırlanıyor: 1 sn bekle.');
    expect(canOpenGate(okState(), okCtx({ time: 1005, lastGateAt: 1000 })).ok).toBe(true);
    expect(canOpenGate(okState(), okCtx({ time: 1000, lastGateAt: undefined })).ok).toBe(true);
    expect(canOpenGate(okState(), okCtx({ time: 1000, lastGateAt: null })).ok).toBe(true);
  });

  it('atlama arası 20 sn (lastHopAt); kalan süre iletide; bitince geçer', () => {
    const st = okState({ dimMeta: { calibrated: true, lastHopAt: 990 } });
    let r = canOpenGate(st, okCtx({ time: 1000 }));
    expect(r).toMatchObject({ ok: false, reason: 'atlama' });
    expect(r.message).toBe('Boyutlar arası atlama için 10 sn daha bekle.');
    r = canOpenGate(st, okCtx({ time: 1009.5 }));
    expect(r.message).toBe('Boyutlar arası atlama için 1 sn daha bekle.');
    expect(canOpenGate(st, okCtx({ time: 1010 })).ok).toBe(true);
  });

  it('atlama beklemesi: lastHopAt=0 "hiç atlamadı" (oturum başında bile bekleme yok); gelecekteki (eski oturum) zaman bekleme sayılmaz', () => {
    expect(canOpenGate(okState({ dimMeta: { calibrated: true, lastHopAt: 0 } }), okCtx({ time: 3 })).ok).toBe(true);
    expect(canOpenGate(okState({ dimMeta: { calibrated: true, lastHopAt: 99999 } }), okCtx({ time: 5 })).ok).toBe(true);
    expect(canOpenGate(okState({ dimMeta: { calibrated: true, lastHopAt: -5 } }), okCtx({ time: 5 })).ok).toBe(true);
  });

  it('terminal dönüşü: yetenek, şarj, çekirdek ve atlama beklemesi muaf; mod/geçiş/açma beklemesi/yer geçerli', () => {
    const st = okState({
      dim: 'neon', abilities: { portalGun: false }, charge: 0, cells: 0, dimMeta: { calibrated: false, lastHopAt: 995 },
    });
    const r = canOpenGate(st, okCtx({ time: 1000, terminalReturn: true }));
    expect(r).toMatchObject({ ok: true, kind: 'back', dest: 'overworld' });
    expect(r.cost).toEqual({
      charges: 0, core: 0, calibrate: false, free: true,
    });
    expect(canOpenGate(st, okCtx({ terminalReturn: true, transitioning: true })).reason).toBe('gecis');
    expect(canOpenGate(st, okCtx({ terminalReturn: true, lastGateAt: 999, time: 1000 })).reason).toBe('bekleme');
    expect(canOpenGate(st, okCtx({ terminalReturn: true, spot: null })).reason).toBe('yer');
    expect(canOpenGate(Object.assign({}, st, { mode: 'insa' }), okCtx({ terminalReturn: true })).reason).toBe('mod');
  });

  it('şehirde tabanca ile geri kapı: kalibrasyon aranmaz ama şarj/yetenek/atlama aranır', () => {
    const st = okState({ dim: 'neon', dimMeta: { calibrated: false, lastHopAt: 0 }, charge: 12 });
    const r = canOpenGate(st, okCtx());
    expect(r).toMatchObject({ ok: true, kind: 'back', dest: 'overworld' });
    expect(canOpenGate(Object.assign({}, st, { charge: 3 }), okCtx()).reason).toBe('sarj');
    expect(canOpenGate(Object.assign({}, st, { abilities: {} }), okCtx()).reason).toBe('yetenek');
  });

  it('ctx.kind açıkça verilirse varsayılanı ezer', () => {
    expect(canOpenGate(okState(), okCtx({ kind: 'back' }))).toMatchObject({ ok: true, kind: 'back', dest: 'overworld' });
    expect(canOpenGate(okState({ dim: 'neon' }), okCtx({ kind: 'out' }))).toMatchObject({ ok: true, kind: 'out', dest: 'neon' });
    expect(canOpenGate(okState(), okCtx({ kind: 'saçma' })).kind).toBe('out');
  });

  it('öncelik sırası: mod > yetenek > geçiş > parkur > bulmaca > boss > mühür > su altı > bölge > kalibrasyon > şarj > bekleme > atlama > yer', () => {
    const worst = okState({
      mode: 'insa', abilities: {}, dimMeta: { calibrated: false, lastHopAt: 999 }, charge: 0, cells: 0,
    });
    const ctx = okCtx({
      transitioning: true, inParkour: true, inPuzzle: true, inBoss: true, inSealAltar: true, underwater: true, zoneUnlocked: false, lastGateAt: 999.5, spot: null, time: 1000,
    });
    const order = [];
    const st = Object.assign({}, worst);
    const cx = Object.assign({}, ctx);
    for (let i = 0; i < 14; i++) {
      const r = canOpenGate(st, cx);
      expect(r.ok).toBe(false);
      order.push(r.reason);
      if (r.reason === 'mod') st.mode = 'macera';
      else if (r.reason === 'yetenek') st.abilities = { portalGun: true };
      else if (r.reason === 'gecis') cx.transitioning = false;
      else if (r.reason === 'parkur') cx.inParkour = false;
      else if (r.reason === 'bulmaca') cx.inPuzzle = false;
      else if (r.reason === 'boss') cx.inBoss = false;
      else if (r.reason === 'muhur') cx.inSealAltar = false;
      else if (r.reason === 'sualti') cx.underwater = false;
      else if (r.reason === 'bolge') cx.zoneUnlocked = true;
      else if (r.reason === 'kalibrasyon') st.hasCore = true;
      else if (r.reason === 'sarj') st.charge = 24;
      else if (r.reason === 'bekleme') cx.lastGateAt = undefined;
      else if (r.reason === 'atlama') st.dimMeta = { calibrated: false, lastHopAt: 0 };
      else if (r.reason === 'yer') cx.spot = { x: 0, y: 64, z: 0 };
    }
    expect(order.slice(0, 14)).toEqual(['mod', 'yetenek', 'gecis', 'parkur', 'bulmaca', 'boss', 'muhur', 'sualti', 'bolge', 'kalibrasyon', 'sarj', 'bekleme', 'atlama', 'yer'].slice(0, 14));
  });

  it('spot undefined → "yer" değerlendirilmez; spot nesnesi → geçer', () => {
    expect(canOpenGate(okState(), okCtx({ spot: undefined })).ok).toBe(true);
    expect(canOpenGate(okState(), okCtx({ spot: { x: 1, y: 2, z: 3 } })).ok).toBe(true);
  });

  it('başarısızlık maliyet döndürmez; girdiler değişmez; null/boş girdide atmaz', () => {
    const st = okState({ charge: 3 });
    const snap = JSON.stringify(st);
    const r = canOpenGate(st, okCtx());
    expect(r.ok).toBe(false);
    expect(r.cost).toBeUndefined();
    expect(JSON.stringify(st)).toBe(snap);
    expect(canOpenGate(null, null).ok).toBe(false);
    expect(canOpenGate(undefined, undefined).reason).toBe('mod');
    expect(canOpenGate({}, {}).reason).toBe('mod');
  });

  it('fuzz: rastgele durumlarda hep {ok,reason,message} biçimi, atmaz', () => {
    const rng = seededRandom(9);
    const vals = [undefined, null, NaN, -1, 0, 5, 12, 1e9, 'x', true, false, {}, []];
    for (let i = 0; i < 3000; i++) {
      const pick = () => vals[rng.int(0, vals.length - 1)];
      const r = canOpenGate({
        mode: rng.chance(0.7) ? 'macera' : pick(), dim: pick(), abilities: rng.chance(0.5) ? { portalGun: pick() } : pick(), dimMeta: rng.chance(0.5) ? { calibrated: pick(), lastHopAt: pick() } : pick(), hasCore: pick(), charge: pick(), cells: pick(),
      }, {
        time: pick(), lastGateAt: pick(), transitioning: pick(), inParkour: pick(), underwater: pick(), zoneUnlocked: pick(), spot: pick(), terminalReturn: pick(), kind: pick(),
      });
      expect(typeof r.ok).toBe('boolean');
      if (r.ok) expect(r.message).toBeNull();
      else {
        expect(typeof r.message).toBe('string');
        expect(r.message.length).toBeGreaterThan(5);
        expect(r.message).not.toMatch(/\{n\}/);
        expect(Object.prototype.hasOwnProperty.call(TRAVEL_MESSAGES, r.reason)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * gateSpot
 * ---------------------------------------------------------------------------------------------- */
function loadedCity() {
  const w = makeCityWorld(5);
  for (let cz = -2; cz <= 2; cz++) for (let cx = -2; cx <= 2; cx++) w.ensureChunk(cx, cz);
  return w;
}
const EYE = 1.62;

function volume(world, spot) {
  // kapı hacminin hücreleri (merkez sütun ± genişlik, 4 yükseklik)
  const cells = [];
  const wx = spot.axis === 'x' ? 0 : 1;
  const wz = spot.axis === 'x' ? 1 : 0;
  for (let k = -1; k <= 1; k++) {
    for (let dy = 0; dy < 4; dy++) cells.push([Math.floor(spot.x) + wx * k, spot.y + dy, Math.floor(spot.z) + wz * k]);
  }
  return cells;
}

describe('gateSpot (düz sahte şehir)', () => {
  it('düz zeminde oyuncunun 4 blok önü, zemine oturur, oyuncuya dönük (yaw 0 → -Z bakar → kapı +Z yüzlü)', () => {
    const w = loadedCity();
    const s = gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0);
    expect(s).not.toBeNull();
    expect(s.dist).toBe(4);
    expect(s.x).toBe(5.5);
    expect(s.z).toBe(16.5);
    expect(s.y).toBe(64);
    expect(s.axis).toBe('z');
    expect([s.nx, s.nz]).toEqual([0, 1]);
    // kapı oyuncuya doğru bakar: yönü (-sin, -cos) = normal
    expect(-Math.sin(s.yaw)).toBeCloseTo(0, 9);
    expect(-Math.cos(s.yaw)).toBeCloseTo(1, 9);
    expect([s.w, s.h, s.d]).toEqual([3, 4, 1]);
    volume(w, s).forEach(([x, y, z]) => expect(w.getBlock(x, y, z)).toBe(0));
  });

  it('dört ana yön: normal oyuncuya bakar; eksen doğru', () => {
    const w = loadedCity();
    const eye = { x: 0.5, y: 64 + EYE, z: 0.5 };
    const cases = [
      [0, 'z', 0, 1], // -Z'ye bakıyor → kapı +Z yüzlü
      [Math.PI / 2, 'x', 1, 0], // -X'e bakıyor (yaw + sola) → kapı +X yüzlü
      [Math.PI, 'z', 0, -1], // +Z'ye bakıyor
      [-Math.PI / 2, 'x', -1, 0], // +X'e bakıyor
    ];
    cases.forEach(([yaw, axis, nx, nz]) => {
      const s = gateSpot(w, eye, yaw);
      expect(s, 'yaw ' + yaw).not.toBeNull();
      expect(s.axis).toBe(axis);
      expect([s.nx, s.nz]).toEqual([nx, nz]);
      expect(-Math.sin(s.yaw)).toBeCloseTo(nx, 9);
      expect(-Math.cos(s.yaw)).toBeCloseTo(nz, 9);
    });
  });

  it('eye dizi biçimi de olur; eğik bakışta baskın eksene oturur', () => {
    const w = loadedCity();
    const s = gateSpot(w, [0.5, 64 + EYE, 0.5], 0.3); // çoğunlukla -Z
    expect(s.axis).toBe('z');
    const t = gateSpot(w, [0.5, 64 + EYE, 0.5], Math.PI / 2 + 0.3);
    expect(t.axis).toBe('x');
  });

  it('4 blok ilerisi doluysa (duvar) yakın/uzak adaylara geçer; hacim hep boş', () => {
    const w = loadedCity();
    // (5, 64..67, 16±1) tuğla duvar
    for (let y = 64; y <= 67; y++) for (let x = 3; x <= 7; x++) w.setBlock(x, y, 16, B.BRICK, { force: true });
    const s = gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0);
    expect(s).not.toBeNull();
    expect(s.dist).not.toBe(4);
    volume(w, s).forEach(([x, y, z]) => expect(w.getBlock(x, y, z)).toBe(0));
  });

  it('çevre tamamen kapalıysa null', () => {
    const w = loadedCity();
    for (let d = 3; d <= 10; d++) for (let y = 64; y <= 70; y++) for (let x = 0; x <= 11; x++) w.setBlock(x, y, 20 - d, B.BRICK, { force: true });
    expect(gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0)).toBeNull();
  });

  it('yüklenmemiş chunk dolu sayılır → null', () => {
    const w = makeCityWorld(5);
    w.ensureChunk(0, 0);
    // +Z'ye bakıyor: 3..10 blok ilerisi (z ≥ 17) (0,1) chunk'ında, yüklü değil
    expect(gateSpot(w, { x: 5.5, y: 64 + EYE, z: 14.5 }, Math.PI)).toBeNull();
  });

  it('zemin yoksa (boşluk) ve su/mühür/portal hücresinde açılmaz', () => {
    const w = loadedCity();
    // zemini 8 blok derine kaldır → uçurum (kapı en çok 7 blok aşağıya oturur)
    for (let x = 0; x <= 11; x++) for (let z = 8; z <= 20; z++) for (let y = 56; y <= 63; y++) w.setBlock(x, y, z, 0, { force: true });
    expect(gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0)).toBeNull();
    // su zemini
    const w2 = loadedCity();
    for (let x = 0; x <= 11; x++) for (let z = 8; z <= 20; z++) w2.setBlock(x, 63, z, B.WATER, { force: true });
    expect(gateSpot(w2, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0)).toBeNull();
    // hacimde mühür bariyeri
    const w3 = loadedCity();
    for (let z = 8; z <= 20; z++) for (let x = 0; x <= 11; x++) w3.setBlock(x, 65, z, B.SEAL_BARRIER, { force: true });
    expect(gateSpot(w3, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0)).toBeNull();
    const w4 = loadedCity();
    for (let z = 8; z <= 20; z++) for (let x = 0; x <= 11; x++) w4.setBlock(x, 66, z, B.PORTAL_BLUE, { force: true });
    expect(gateSpot(w4, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0)).toBeNull();
  });

  it('basamakta zemine oturur (zemin 1 blok yüksek → y 65)', () => {
    const w = loadedCity();
    for (let x = 0; x <= 11; x++) for (let z = 8; z <= 17; z++) w.setBlock(x, 64, z, B.STONE, { force: true });
    const s = gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0);
    expect(s).not.toBeNull();
    expect(s.y).toBe(65);
    volume(w, s).forEach(([x, y, z]) => expect(w.getBlock(x, y, z)).toBe(0));
  });

  it('oyuncunun 2 blok üstündeki duvar tepesine oturmaz (zemin en çok ayak seviyesinin 1 üstü)', () => {
    const w = loadedCity();
    // oyuncunun 3..10 blok önünde 3 blok yüksek set; üstü düz → set üstü y=67 (ayak 64'ün 3 üstü)
    for (let z = 10; z <= 17; z++) for (let x = 0; x <= 11; x++) for (let y = 64; y <= 66; y++) w.setBlock(x, y, z, B.STONE, { force: true });
    const s = gateSpot(w, { x: 5.5, y: 64 + EYE, z: 20.5 }, 0);
    // set üzerine (y=67) değil, set önündeki zemine (y=64) oturur ya da null
    expect(s === null || s.y <= 65).toBe(true);
  });

  it('opts.accept: reddedilen adaylar atlanır; hepsi reddedilirse null', () => {
    const w = loadedCity();
    const eye = { x: 5.5, y: 64 + EYE, z: 20.5 };
    const seen = [];
    const s = gateSpot(w, eye, 0, { accept: (c) => { seen.push(c.dist); return c.dist >= 6; } });
    expect(seen[0]).toBe(4);
    expect(s.dist).toBe(6);
    expect(gateSpot(w, eye, 0, { accept: () => false })).toBeNull();
    expect(gateSpot(w, eye, 0, { accept: () => true }).dist).toBe(4);
    expect(gateSpot(w, eye, 0, { ahead: 5 }).dist).toBe(5);
  });

  it('aralık dışı dünya tavanında / geçersiz girdide null (atmaz)', () => {
    const w = loadedCity();
    expect(gateSpot(null, { x: 0, y: 0, z: 0 }, 0)).toBeNull();
    expect(gateSpot({}, { x: 0, y: 0, z: 0 }, 0)).toBeNull();
    expect(gateSpot(w, null, 0)).toBeNull();
    expect(gateSpot(w, { x: NaN, y: 64, z: 0 }, 0)).toBeNull();
    expect(gateSpot(w, { x: 0, y: 1e9, z: 0 }, 0)).toBeNull();
    expect(gateSpot(w, { x: 0.5, y: 64 + EYE, z: 0.5 }, NaN)).not.toBeNull(); // NaN yaw → 0
  });
});

describe('gateSpot — gerçek overworld üzerinde 500 rastgele noktada hacim hiçbir zaman katıya/suya/mühre binmez', () => {
  it('belirlenimci tarama', () => {
    const w = new World({ seed: 20261016, mode: 'macera' });
    for (let cz = -3; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) w.ensureChunk(cx, cz);
    const rng = seededRandom(31337);
    let found = 0;
    for (let i = 0; i < 500; i++) {
      const x = rng.int(-24, 24) + 0.5;
      const z = rng.int(-24, 24) + 0.5;
      const top = w.surfaceY(Math.floor(x), Math.floor(z), { ignoreFoliage: true });
      const eye = { x, y: top + 1 + EYE, z };
      const yaw = rng.float(-Math.PI, Math.PI);
      const s = gateSpot(w, eye, yaw);
      if (s === null) continue;
      found++;
      const wx = s.axis === 'x' ? 0 : 1;
      const wz = s.axis === 'x' ? 1 : 0;
      for (let k = -1; k <= 1; k++) {
        const cx = Math.floor(s.x) + wx * k;
        const cz = Math.floor(s.z) + wz * k;
        const floor = w.getBlock(cx, s.y - 1, cz);
        expect(SOLID_LUT[floor], 'zemin katı').toBe(1);
        expect(LIQUID_LUT[floor], 'zemin sıvı değil').toBe(0);
        for (let dy = 0; dy < 4; dy++) {
          const id = w.getBlock(cx, s.y + dy, cz);
          expect(id, 'yüklü').not.toBeNull();
          expect(SOLID_LUT[id], 'katı değil').toBe(0);
          expect(LIQUID_LUT[id], 'sıvı değil').toBe(0);
          expect(id).not.toBe(B.SEAL_BARRIER);
        }
      }
      // oyuncuya dönük: normal, oyuncudan kapıya yönün tersi
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      expect(s.nx * fx + s.nz * fz).toBeLessThan(0);
      expect(Math.abs(s.x - x) + Math.abs(s.z - z)).toBeGreaterThan(1.5);
      expect(s.dist).toBeGreaterThanOrEqual(3);
      expect(s.dist).toBeLessThanOrEqual(10);
    }
    expect(found).toBeGreaterThan(200); // çoğu açık arazide kapı bulunur
  });
});

/* ------------------------------------------------------------------------------------------------
 * varış / terminal
 * ---------------------------------------------------------------------------------------------- */
describe('arrivalPoint', () => {
  it("neon: terminal 0 (Kapı Meydanı) → 2 blok güneyde, terminale bakar (yaw 0 = -Z)", () => {
    const a = arrivalPoint('neon');
    expect(a).toEqual({
      x: 0.5, y: 64, z: 2.5, yaw: 0,
    });
    expect(arrivalPoint('neon', { x: 0, y: 64, z: 0 })).toEqual(a);
  });

  it('uzak terminal: merkeze doğru 2 blok önde, merkeze bakar', () => {
    const a = arrivalPoint('neon', [160, 64, 0]);
    expect(a.x).toBe(158.5);
    expect(a.z).toBe(0.5);
    expect(a.y).toBe(64);
    // yön (-1,0): yaw = +90° (sola)
    expect(-Math.sin(a.yaw)).toBeCloseTo(-1, 9);
    const b = arrivalPoint('neon', { x: 0, y: 80, z: -200 });
    expect(b.z).toBeCloseTo(-198 + 0.5, 6);
    expect(b.y).toBe(80);
    expect(-Math.cos(b.yaw)).toBeCloseTo(1, 9); // +Z (merkeze) bakar
  });

  it('overworld ve bilinmeyen boyut null; bozuk terminal atmaz', () => {
    expect(arrivalPoint('overworld')).toBeNull();
    expect(arrivalPoint('yok')).toBeNull();
    expect(arrivalPoint('__proto__')).toBeNull();
    const a = arrivalPoint('neon', { x: NaN, y: undefined, z: 'x' });
    expect(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z) && Number.isFinite(a.yaw)).toBe(true);
  });
});

describe('terminal maskesi', () => {
  it('terminal 0 her zaman bulunmuş; bit işaretleme; 16 bit sınırı', () => {
    expect(isTerminalFound(0, 0)).toBe(true);
    expect(isTerminalFound(0, 1)).toBe(false);
    const t = { found: 0 };
    expect(markTerminalFound(t, 5)).toBe(true);
    expect(markTerminalFound(t, 5)).toBe(false);
    expect(t.found).toBe(1 << 5);
    expect(isTerminalFound(t, 5)).toBe(true);
    expect(isTerminalFound(t.found, 5)).toBe(true);
    expect(markTerminalFound(t, 15)).toBe(true);
    expect(t.found).toBe((1 << 5) | (1 << 15));
    expect(markTerminalFound(t, 16)).toBe(false);
    expect(markTerminalFound(t, -1)).toBe(false);
    expect(markTerminalFound(t, 1.5)).toBe(false);
    expect(markTerminalFound(null, 3)).toBe(false);
    expect(isTerminalFound(0xffff, 16)).toBe(false);
    expect(foundTerminalCount(0)).toBe(1);
    expect(foundTerminalCount(0xffff)).toBe(16);
    expect(foundTerminalCount((1 << 3) | (1 << 9))).toBe(3);
  });
});

describe('respawnTerminal', () => {
  const list = [
    [0, 64, 0], [120, 64, 0], [-120, 64, 0], [0, 64, 120], [0, 64, -120], { x: 300, y: 64, z: 300 },
  ];
  it('yalnız bulunmuş terminaller; en yakını', () => {
    const ctx = { terminals: { found: (1 << 1) | (1 << 5), list } };
    expect(respawnTerminal(ctx, [130, 64, 5]).index).toBe(1);
    expect(respawnTerminal(ctx, [-130, 64, 5]).index).toBe(0); // 2 bulunmamış → 0 (-120'ye değil)
    expect(respawnTerminal(ctx, { x: 290, y: 64, z: 290 }).index).toBe(5);
    const r = respawnTerminal(ctx, [130, 64, 5]);
    expect(r).toMatchObject({ x: 120, y: 64, z: 0, found: true });
    expect(r.arrival).toEqual(arrivalPoint('neon', { x: 120, y: 64, z: 0 }));
  });

  it('terminal 0 bulunmuş sayılır (maske 0); eşitlikte küçük indeks; 3B uzaklık', () => {
    const ctx = { terminals: { found: 0, list } };
    expect(respawnTerminal(ctx, [500, 64, 500]).index).toBe(0);
    const tie = { terminals: { found: 0b110, list: [[0, 0, 0], [10, 0, 0], [-10, 0, 0]] } };
    expect(respawnTerminal(tie, [0, 0, 0]).index).toBe(0);
    const tie2 = { terminals: { found: 0b110, list: [[100, 0, 0], [10, 0, 0], [-10, 0, 0]] } };
    expect(respawnTerminal(tie2, [0, 0, 0]).index).toBe(1); // eşit mesafe → küçük indeks
    const stacked = { terminals: { found: 0b10, list: [[0, 64, 0], [0, 300, 0]] } };
    expect(respawnTerminal(stacked, [0, 280, 0]).index).toBe(1); // dikey uzaklık dikkate alınır
  });

  it('ctx doğrudan {found,list} olabilir; liste yoksa varsayılan terminal 0; bozuk girdide atmaz', () => {
    expect(respawnTerminal({ found: 2, list }, [119, 64, 0]).index).toBe(1);
    const d = respawnTerminal({}, [40, 64, 40]);
    expect(d).toMatchObject({ index: 0, x: 0, y: 64, z: 0, found: true });
    expect(d.arrival).toEqual({
      x: 0.5, y: 64, z: 2.5, yaw: 0,
    });
    expect(respawnTerminal(null, null).index).toBe(0);
    expect(respawnTerminal({ terminals: { found: NaN, list: [null, 5, 'x'] } }, [NaN, NaN, NaN]).index).toBe(0);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Boyuta bağlı eşyalar
 * ---------------------------------------------------------------------------------------------- */
function sampleInventory() {
  const inv = new Inventory();
  inv.add('blok:taş', 20);
  inv.add('item:ok', 4);
  inv.addStack('item:kazma_demir', 1, 100);
  inv.add(CELL_ITEM, 3);
  return inv;
}
const BOUND_KEYS = ['item:ok', 'item:kazma_demir'];
const resolve = (k) => (BOUND_KEYS.indexOf(k) >= 0 ? 'neon' : null);

describe('splitBoundItems / takeBoundItems / returnStash', () => {
  it('ayırır, girdiyi değiştirmez, bağlı yuvalar keep içinde null', () => {
    const inv = sampleInventory();
    const before = JSON.stringify(inv.toJSON());
    const sp = splitBoundItems(inv, { resolve });
    expect(sp.bound.map((e) => e.item).sort()).toEqual(['item:kazma_demir', 'item:ok']);
    const ekmek = sp.bound.find((e) => e.item === 'item:ok');
    expect(ekmek.count).toBe(4);
    const kazma = sp.bound.find((e) => e.item === 'item:kazma_demir');
    expect(kazma.dur).toBe(100);
    expect(sp.boundSlots).toHaveLength(2);
    expect(sp.keep).toHaveLength(inv.slots.length);
    sp.boundSlots.forEach((i) => expect(sp.keep[i]).toBeNull());
    expect(sp.keep.filter(Boolean).map((s) => s.item).sort()).toEqual(['blok:taş', CELL_ITEM]);
    expect(JSON.stringify(inv.toJSON())).toBe(before);
  });

  it('JSON biçimi (toJSON) ve dizi biçimi de ayrıştırılır; zırh yuvaları dahil', () => {
    const inv = sampleInventory();
    const json = inv.toJSON();
    const a = splitBoundItems(json, { resolve });
    expect(a.bound).toHaveLength(2);
    const b = splitBoundItems(json.slots, { resolve });
    expect(b.bound).toHaveLength(2);
    const armor = { slots: [], armor: [['item:ok', 1], 0, ['blok:taş', 1], null] };
    const c = splitBoundItems(armor, { resolve });
    expect(c.boundArmor).toEqual([0]);
    expect(c.bound).toEqual([{ item: 'item:ok', count: 1 }]);
    expect(c.keepArmor).toEqual([null, 0, ['blok:taş', 1], null]);
  });

  it('boyuta bağlı eşya yoksa envanter hiç değişmez (takeBoundItems boş)', () => {
    const inv = sampleInventory();
    const before = JSON.stringify(inv.toJSON());
    expect(takeBoundItems(inv, { resolve: () => null })).toEqual({ bound: [] });
    expect(JSON.stringify(inv.toJSON())).toBe(before);
    expect(splitBoundItems(inv, { resolve: () => null }).bound).toEqual([]);
  });

  it('gidiş-dönüş: al → yığın → geri ver: envanter özeti aynı (sayı, dayanıklılık)', () => {
    const inv = sampleInventory();
    const total = (i) => i.count('blok:taş') * 1000 + i.count('item:ok') * 10 + i.count('item:kazma_demir') + i.count(CELL_ITEM) * 100000;
    const t0 = total(inv);
    let changed = 0;
    const off = inv.onChange(() => { changed++; });
    const taken = takeBoundItems(inv, { resolve });
    expect(changed).toBeGreaterThan(0);
    off();
    expect(inv.count('item:ok')).toBe(0);
    expect(inv.count('item:kazma_demir')).toBe(0);
    expect(inv.count('blok:taş')).toBe(20); // global eşya taşınır
    const stash = taken.bound;
    expect(stash).toHaveLength(2);
    const back = returnStash(inv, stash);
    expect(back.rest).toEqual([]);
    expect(back.returned.map((e) => e.item).sort()).toEqual(['item:kazma_demir', 'item:ok']);
    expect(total(inv)).toBe(t0);
    const k = inv.slots.find((s) => s && s.item === 'item:kazma_demir');
    expect(k.dur).toBe(100);
  });

  it('envanter doluysa sığmayan eşya yığında kalır (kaybolmaz) ve sonra tekrar denenir', () => {
    const inv = new Inventory({ size: 2, hotbar: 1, armor: 0 });
    inv.add('blok:taş', 64);
    inv.add('blok:toprak', 64);
    const stash = [{ item: 'item:ok', count: 5 }, { item: 'item:kazma_demir', count: 1, dur: 50 }];
    const r = returnStash(inv, stash);
    expect(r.returned).toEqual([]);
    expect(r.rest).toEqual([{ item: 'item:ok', count: 5 }, { item: 'item:kazma_demir', count: 1, dur: 50 }]);
    inv.setSlot(1, null);
    const r2 = returnStash(inv, r.rest);
    expect(r2.returned).toEqual([{ item: 'item:ok', count: 5 }]);
    expect(r2.rest).toEqual([{ item: 'item:kazma_demir', count: 1, dur: 50 }]);
  });

  it('kısmi sığma: kalan adet yığında', () => {
    const inv = new Inventory({ size: 1, hotbar: 1, armor: 0 });
    inv.add('item:ok', 62);
    const r = returnStash(inv, [{ item: 'item:ok', count: 10 }]);
    expect(r.returned).toEqual([{ item: 'item:ok', count: 2 }]);
    expect(r.rest).toEqual([{ item: 'item:ok', count: 8 }]);
  });

  it('registerDimBound: items.js dimBound alanı olmasa da kayıtlı anahtarlar ayrılır (çekirdek örneği)', () => {
    expect(dimBoundOf(CORE_ITEM)).toBeNull();
    registerDimBound('neon', [CORE_ITEM, 'item:yok_boyle_esya', 5, null]);
    expect(dimBoundOf(CORE_ITEM)).toBe('neon');
    expect(dimBoundOf('item:yok_boyle_esya')).toBe('neon');
    expect(dimBoundOf('blok:taş')).toBeNull();
    const inv = new Inventory();
    inv.add(CORE_ITEM, 2);
    inv.add('blok:taş', 3);
    const sp = splitBoundItems(inv);
    expect(sp.bound).toEqual([{ item: CORE_ITEM, count: 2 }]);
    unregisterDimBound('neon');
    expect(dimBoundOf(CORE_ITEM)).toBeNull();
  });

  it('başka boyuta bağlı eşya "neon" ayrımına girmez', () => {
    registerDimBound('baska', ['item:ok']);
    expect(splitBoundItems(sampleInventory()).bound).toEqual([]);
    expect(splitBoundItems(sampleInventory(), { dim: 'baska' }).bound).toHaveLength(1);
  });

  it('bozuk girdi atmaz; sayılar sınırlanır', () => {
    expect(splitBoundItems(null).bound).toEqual([]);
    expect(splitBoundItems({ slots: [5, 'x', {}, [], [1, 2], { item: 7 }] }, { resolve }).bound).toEqual([]);
    const s = splitBoundItems({ slots: [['item:ok', -3], { item: 'item:ok', count: NaN }, { item: 'item:ok', count: 2.9 }] }, { resolve });
    expect(s.bound.map((e) => e.count)).toEqual([1, 1, 2]);
    expect(returnStash(null, [{ item: 'item:ok', count: 2 }]).rest).toEqual([{ item: 'item:ok', count: 2 }]);
    expect(returnStash(new Inventory(), 'x')).toEqual({ returned: [], rest: [] });
    expect(takeBoundItems(null)).toEqual({ bound: [] });
  });
});
