import { describe, expect, it } from 'vitest';
import {
  EMPTY_HUD, HUD_UI_STATES, createHudStore, hudEqual, sanitizeHud,
} from './hudStore.js';

describe('teknoloji HUD alanları (energy, jetpack, charge, scanner, shield, portals)', () => {
  it('EMPTY_HUD: hepsi null; ui listesi machine içerir ve sanitize eder', () => {
    ['energy', 'jetpack', 'charge', 'scanner', 'shield', 'portals'].forEach((k) => expect(EMPTY_HUD[k]).toBeNull());
    expect(HUD_UI_STATES).toContain('machine');
    expect(sanitizeHud({ ui: 'machine' }).ui).toBe('machine');
    expect(sanitizeHud({ ui: 'Machine' }).ui).toBe('none');
  });

  it('geçerli alanlar sınırlanarak geçer; bilinmeyen alan atılır; hotbar yuvası şarj oranı taşır', () => {
    const h = sanitizeHud({
      energy: { value: 420.7, max: 5000, gen: 12.34, use: 8, net: 4.34, live: true, nodes: 9, name: 'jenerator', bogus: 1 },
      jetpack: { fuel: 2000, max: 1000, fraction: 3, empty: false, cells: -4, thrusting: true },
      charge: { item: 'item:kazma_elektrikli', name: 'Elektrikli Kazma', value: 100, max: 800, fraction: 0.125 },
      shield: { pieces: 9, charge: 10, max: 500, fraction: 0.02 },
      portals: { held: true, mavi: true, turuncu: 'evet', charge: 3, max: 24, cells: 1, canFire: true, next: 'mor' },
      hotbar: [{ item: 'item:jetpack', count: 1, charge: 0.4 }, { item: 'item:elma', count: 2, charge: 7 }],
    });
    expect(h.energy.value).toBe(420);
    expect(h.energy.gen).toBe(12.3);
    expect(h.energy.bogus).toBeUndefined();
    expect(h.jetpack.fuel).toBe(1000);
    expect(h.jetpack.fraction).toBe(1);
    expect(h.jetpack.cells).toBe(0);
    expect(h.jetpack.thrusting).toBe(true);
    expect(h.shield.pieces).toBe(4);
    expect(h.portals.turuncu).toBe(false); // yalnız true kabul
    expect(h.portals.next).toBe('mavi');
    expect(h.portals.held).toBe(true);
    expect(h.hotbar[0].charge).toBe(0.4);
    expect(h.hotbar[1].charge).toBe(1); // 0..1'e kıskaç
    expect(h.hotbar[2].charge).toBeUndefined();
  });

  it('tarayıcı: en çok 8 işaret, tür beyaz listesi, sonsuz/NaN değerler güvenli', () => {
    const pings = [];
    for (let i = 0; i < 20; i++) pings.push({ type: i === 0 ? 'bilinmeyen' : 'maden', kind: 'elmas', name: 'Elmas', color: 0x4fe3d6, dist: i, yaw: i === 1 ? NaN : 0.2, dy: Infinity, hostile: false });
    const h = sanitizeHud({
      scanner: { charge: 50, max: 400, empty: false, nextIn: 2.25, heading: 99, pings },
    });
    expect(h.scanner.pings).toHaveLength(8);
    expect(h.scanner.pings[0].type).toBe('maden');
    expect(Number.isFinite(h.scanner.pings[1].yaw)).toBe(true);
    expect(Number.isFinite(h.scanner.pings[2].dy)).toBe(true);
    expect(h.scanner.heading).toBe(10);
    expect(sanitizeHud({ scanner: 5 }).scanner).toBeNull();
    expect(sanitizeHud({ energy: [] }).energy).toBeNull();
  });

  it('depo: içerik değişince yayar, aynıyken yayar mı (hudEqual) ve donuk kopya', () => {
    const store = createHudStore();
    const base = { jetpack: { fuel: 500, max: 1000, fraction: 0.5, empty: false, cells: 1, thrusting: false } };
    expect(store.set(base)).toBe(true);
    expect(store.set(JSON.parse(JSON.stringify(base)))).toBe(false);
    expect(store.set({ jetpack: { ...base.jetpack, fuel: 499, fraction: 0.499 } })).toBe(true);
    expect(store.get().jetpack.fuel).toBe(499);
    expect(hudEqual(store.get().jetpack, sanitizeHud(store.get()).jetpack)).toBe(true);
  });
});
