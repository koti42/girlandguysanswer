import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { Inventory } from './inventory.js';
import { SCANNER } from './techData.js';
import { chargeOf } from './techCharge.js';
import { pingNow, scanArea, scannerHud, tickScanner } from './techScanner.js';
import { makeWorld, newTech } from './techTestKit.js';

const C = { x: 0.5, y: 60, z: 0.5 };
const acc = (w) => ({ getBlock: (x, y, z) => w.getBlock(x, y, z) });

describe('techScanner: scanArea', () => {
  it('cevherleri yakından uzağa sıralar; tür/ad/renk/dist/yaw alanlarını verir', () => {
    const w = makeWorld();
    w.set(8, 60, 0, B.IRON_ORE); // doğuda 8
    w.set(0, 50, 0, B.DIAMOND_ORE); // aşağıda 10
    w.set(-15, 60, 0, B.COAL_ORE);
    const r = scanArea(acc(w), C);
    expect(r.pings.map((p) => p.kind)).toEqual(['demir', 'elmas', 'kömür']);
    const iron = r.pings[0];
    expect(iron).toMatchObject({ type: 'maden', name: 'Demir Cevheri', x: 8.5, y: 60.5, z: 0.5 });
    expect(iron.dist).toBeCloseTo(8, 0);
    expect(iron.dx).toBeCloseTo(8, 5);
    expect(iron.dz).toBeCloseTo(0, 5);
    // doğuya (+x) bakış yaw'ı: forward = (−sin yaw, −cos yaw) = (1,0) → yaw = −π/2
    expect(iron.yaw).toBeCloseTo(-Math.PI / 2, 5);
    const coal = r.pings[2];
    expect(coal.yaw).toBeCloseTo(Math.PI / 2, 5); // batı
    expect(r.pings[1].dy).toBeLessThan(0);
    expect(typeof iron.color).toBe('number');
  });

  it('yarıçap sınırı; küre dışı cevher yok; yüklü olmayan alan yok sayılır', () => {
    const w = makeWorld();
    w.set(23, 60, 0, B.GOLD_ORE);
    w.set(24, 60, 0, B.GOLD_ORE); // tam sınırda: 24² = r²
    w.set(0, 60, 25, B.GOLD_ORE); // dışarıda
    w.set(18, 60, 18, B.COPPER_ORE); // hypot 25.5 > 24
    const r = scanArea(acc(w), C);
    const kinds = r.pings.map((p) => p.kind + ':' + p.x);
    expect(kinds.some((k) => k.indexOf('altın:23') === 0)).toBe(true);
    expect(r.pings.some((p) => p.kind === 'bakır')).toBe(false);
    expect(r.pings.some((p) => p.z > 20)).toBe(false);
    const small = scanArea(acc(w), C, { radius: 10 });
    expect(small.pings).toEqual([]);
    const lost = makeWorld({ loaded: () => false });
    lost.set(3, 60, 0, B.IRON_ORE);
    expect(scanArea(acc(lost), C).pings).toEqual([]);
  });

  it('yakın aynı tür cevherler tek işaret olur (küme); uzaktakiler ayrı; tür başına en çok 5; toplam en çok 24', () => {
    const w = makeWorld();
    for (let i = 0; i < 6; i++) w.set(10 + (i % 2), 60 + Math.floor(i / 2), 0, B.IRON_ORE); // sıkı küme
    expect(scanArea(acc(w), C).pings.filter((p) => p.kind === 'demir')).toHaveLength(1);
    const w2 = makeWorld();
    for (let i = 0; i < 12; i++) w2.set(i * 2, 60, 12, B.COAL_ORE); // 2 aralıkla: kümeleme aralığı 4
    const coal = scanArea(acc(w2), C).pings.filter((p) => p.kind === 'kömür');
    expect(coal.length).toBeGreaterThan(1);
    expect(coal.length).toBeLessThanOrEqual(5);
    const w3 = makeWorld();
    const ores = [B.COAL_ORE, B.COPPER_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.QUANTUM_ORE, B.REDSTONE_ORE, B.EMERALD_ORE, B.AMETHYST];
    for (let i = 0; i < ores.length; i++) for (let k = 0; k < 5; k++) w3.set(-20 + i * 4 + (k % 2), 52 + k * 3, -5 - k * 4, ores[i]);
    const all = scanArea(acc(w3), C);
    expect(all.pings.length).toBeLessThanOrEqual(SCANNER.maxPings);
    const byKind = {};
    all.pings.forEach((p) => { byKind[p.kind] = (byKind[p.kind] || 0) + 1; });
    Object.keys(byKind).forEach((k) => expect(byKind[k]).toBeLessThanOrEqual(5));
  });

  it('yapı ve canlı erişimcileri: işaretler tür/ad/hostile ile eklenir; bozuk girdi atılır', () => {
    const w = makeWorld();
    const a = Object.assign(acc(w), {
      structures: () => [{ type: 'kamp', name: 'Kamp', x: 10, y: 61, z: 0 }, { type: 'x', x: NaN, z: 1 }, null],
      mobs: () => [{ type: 'golge', name: 'Gölge', x: 5, y: 60, z: 0, hostile: true }, { type: 'koyun', name: 'Koyun', x: 3, y: 60, z: 4 }, { x: 'a' }, undefined],
    });
    const r = scanArea(a, C);
    expect(r.pings.map((p) => p.type).sort()).toEqual(['canlı', 'canlı', 'yapı']);
    expect(r.pings.find((p) => p.kind === 'golge').hostile).toBe(true);
    expect(r.pings.find((p) => p.kind === 'koyun').hostile).toBe(false);
    expect(r.pings[0].dist).toBeLessThanOrEqual(r.pings[1].dist);
    expect(r.pings.find((p) => p.type === 'yapı').name).toBe('Kamp');
  });

  it('hücre sınırı: dev yarıçap kırpılır (≤ 48) ve maxCells aşılınca kesilir (truncated)', () => {
    const w = makeWorld();
    let calls = 0;
    const a = { getBlock: (x, y, z) => { calls++; return w.getBlock(x, y, z); } };
    const r = scanArea(a, C, { radius: 9999, maxCells: 5000 });
    expect(r.truncated).toBe(true);
    expect(calls).toBeLessThanOrEqual(5001);
    calls = 0;
    scanArea(a, C, { radius: 24 });
    expect(calls).toBeLessThanOrEqual(SCANNER.maxCells);
  });

  it('belirlenimci ve hızlı: aynı dünya aynı sonuç; r=24 taraması hızlı', () => {
    const w = makeWorld({ floorY: 40 });
    for (let i = 0; i < 80; i++) w.set((i * 7) % 40 - 20, 30 + ((i * 13) % 25), (i * 11) % 40 - 20, [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE][i % 3]);
    const t0 = Date.now();
    const a = scanArea(acc(w), C);
    const ms = Date.now() - t0;
    const b = scanArea(acc(w), C);
    expect(JSON.stringify(a.pings)).toBe(JSON.stringify(b.pings));
    expect(ms).toBeLessThan(1500);
  });
});

describe('techScanner: zamanlayıcı, şarj ve HUD', () => {
  function setup(charge) {
    const w = makeWorld();
    w.set(6, 60, 0, B.IRON_ORE);
    const inv = new Inventory();
    inv.addStack('item:tarayıcı', 1, undefined, undefined, charge);
    return { w, inv, tech: newTech(), ctx: { acc: acc(w), pos: C } };
  }

  it('çubukta taşırken 6 sn\'de bir tarar, 8 şarj harcar; olay scanPing', () => {
    const { inv, tech, ctx } = setup(100);
    let evs = [];
    for (let i = 0; i < 12; i++) {
      tech.time += 1;
      const e = tickScanner(tech, inv, 1, ctx);
      if (e) evs.push(e);
    }
    expect(evs).toHaveLength(2);
    expect(evs[0]).toMatchObject({ type: 'scanPing', count: 1, cost: SCANNER.cost });
    expect(chargeOf(inv.slots[0])).toBe(100 - 2 * SCANNER.cost);
    expect(tech.scanner.pings).toHaveLength(1);
    evs = [];
    const none = new Inventory();
    expect(tickScanner(tech, none, 10, ctx)).toBeNull();
  });

  it('şarj yetersizse taramaz; şarj gelince hemen tarar; çantada (çubuk dışı) taramaz', () => {
    const { inv, tech, ctx } = setup(5);
    for (let i = 0; i < 20; i++) {
      tech.time += 1;
      expect(tickScanner(tech, inv, 1, ctx)).toBeNull();
    }
    inv.slots[0].charge = 50;
    tech.time += 1;
    expect(tickScanner(tech, inv, 1, ctx)).toMatchObject({ type: 'scanPing' });
    const moved = new Inventory();
    moved.slots[15] = { item: 'item:tarayıcı', count: 1, charge: 100 };
    for (let i = 0; i < 10; i++) expect(tickScanner(tech, moved, 1, ctx)).toBeNull();
  });

  it('işaretler süresi dolunca temizlenir; bağlam eksikse güvenli', () => {
    const { inv, tech, ctx } = setup(100);
    for (let i = 0; i < 7; i++) {
      tech.time += 1;
      tickScanner(tech, inv, 1, ctx);
    }
    expect(tech.scanner.pings.length).toBe(1);
    const dry = new Inventory();
    tech.time += 30;
    tickScanner(tech, dry, 1, ctx);
    expect(tech.scanner.pings).toEqual([]);
    const { inv: i2, tech: t2 } = setup(100);
    for (let i = 0; i < 10; i++) expect(tickScanner(t2, i2, 1, null)).toBeNull();
    expect(chargeOf(i2.slots[0])).toBe(100);
  });

  it('pingNow: elle tarama (zamanlayıcıyı sıfırlar), nedenler', () => {
    const { inv, tech, ctx } = setup(20);
    const r = pingNow(tech, inv, ctx);
    expect(r.ok).toBe(true);
    expect(r.event.type).toBe('scanPing');
    expect(r.pings).toHaveLength(1);
    expect(tech.scanner.t).toBe(0);
    expect(chargeOf(inv.slots[0])).toBe(20 - SCANNER.cost);
    pingNow(tech, inv, ctx);
    expect(pingNow(tech, inv, ctx).reason).toBe('sarj'); // 4 şarj kaldı
    expect(pingNow(tech, new Inventory(), ctx).reason).toBe('yok');
    const { inv: i3, tech: t3 } = setup(50);
    expect(pingNow(t3, i3, null).reason).toBe('dunya');
  });

  it('scannerHud: şarj, işaretler, sonraki taramaya kalan süre', () => {
    const { inv, tech, ctx } = setup(100);
    expect(scannerHud(tech, new Inventory())).toBeNull();
    let h = scannerHud(tech, inv);
    expect(h).toMatchObject({ charge: 100, max: 400, empty: false });
    expect(h.nextIn).toBe(SCANNER.period);
    tech.time += 2;
    tickScanner(tech, inv, 2, ctx);
    h = scannerHud(tech, inv);
    expect(h.nextIn).toBeCloseTo(SCANNER.period - 2, 5);
    inv.slots[0].charge = 3;
    expect(scannerHud(tech, inv).empty).toBe(true);
  });
});
