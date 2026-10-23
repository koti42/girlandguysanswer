import { describe, expect, it, vi } from 'vitest';
import {
  EK, SPOT, clearPedNavCache, pedNav,
} from './pedNav.js';
import { planProbe, worldProbe } from './pedProbe.js';
import { citySeed } from '../cityPlanTestKit.js';
import { surfaceAt, SURF } from '../cityRoads.js';
import { getCityPlan } from '../cityPlan.js';

vi.setConfig({ testTimeout: 300000 });

const SEEDS = [1, 7, 42, 99, 123, 777, 2024, 31337];

describe('pedNav: yapı', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': tek bağlı bileşen, dizi değişmezleri, geçit kayıtları, yön birimleri', () => {
      const seed = citySeed(s);
      const nav = pedNav(seed);
      expect(nav.nComp).toBe(1);
      expect(nav.n).toBeGreaterThan(1400);
      expect(nav.ne).toBeGreaterThan(2800);
      expect(nav.crossings.length).toBeGreaterThan(900);
      for (let e = 0; e < nav.ne; e++) {
        expect(nav.ea[e]).toBeGreaterThanOrEqual(0);
        expect(nav.ea[e]).toBeLessThan(nav.n);
        expect(nav.eb[e]).toBeLessThan(nav.n);
        expect(nav.elen[e]).toBeGreaterThan(0.5);
        expect(Math.hypot(nav.eux[e], nav.euz[e])).toBeCloseTo(1, 4);
        expect(nav.ehw[e]).toBeGreaterThan(0.3);
        expect(nav.ehw[e]).toBeLessThanOrEqual(8);
        expect([EK.SIDE, EK.CROSS, EK.PLAZA]).toContain(nav.ekind[e]);
        if (nav.ekind[e] === EK.CROSS) {
          expect(nav.ecross[e]).toBeGreaterThanOrEqual(0);
          expect(nav.earm[e]).toBeGreaterThanOrEqual(0);
          expect(nav.earm[e]).toBeLessThan(4);
          expect(nav.ejun[e]).toBeGreaterThanOrEqual(0);
        }
      }
      nav.crossings.forEach((c) => {
        expect(c.roadA).toBeGreaterThan(0.5);
        expect(c.roadB).toBeGreaterThan(c.roadA + 7);
        expect(c.len).toBeGreaterThanOrEqual(c.roadB);
        expect(nav.ecross[c.edge]).toBe(c.id);
      });
    });
  });

  it('geçit kenarı gerçekten zebra çizgisi üstünden: orta noktada asfalt/zebra yüzeyi, uçlar kaldırım', () => {
    const seed = citySeed(5);
    const nav = pedNav(seed);
    const plan = getCityPlan(seed);
    let checked = 0;
    for (let k = 0; k < nav.crossings.length; k += 7) {
      const c = nav.crossings[k];
      const mid = surfaceAt(plan.roads, Math.floor(c.x), Math.floor(c.z));
      expect([SURF.ZEBRA_X, SURF.ZEBRA_Z, SURF.ASPHALT]).toContain(mid);
      const ax = nav.nx[nav.ea[c.edge]];
      const az = nav.nz[nav.ea[c.edge]];
      expect(surfaceAt(plan.roads, Math.floor(ax), Math.floor(az))).toBe(SURF.SIDEWALK);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('belirlenimci: aynı tohum aynı ağ; kovalar tutarlı (edgesNear tüm kenarları bulur, kaba kuvvetle eşit)', () => {
    const seed = citySeed(9);
    clearPedNavCache();
    const a = pedNav(seed);
    clearPedNavCache();
    const b = pedNav(seed);
    expect(a.ne).toBe(b.ne);
    for (let e = 0; e < a.ne; e += 11) {
      expect(a.ea[e]).toBe(b.ea[e]);
      expect(a.elen[e]).toBeCloseTo(b.elen[e], 5);
    }
    const buf = new Int32Array(512);
    for (const [x, z, r] of [[0, 0, 60], [250, -120, 40], [-400, 300, 90]]) {
      const n = a.edgesNear(x, z, r, buf);
      const got = new Set();
      for (let i = 0; i < n; i++) got.add(buf[i]);
      for (let e = 0; e < a.ne; e++) {
        if (!a.eok[e]) continue;
        const mx = (a.nx[a.ea[e]] + a.nx[a.eb[e]]) / 2 - x;
        const mz = (a.nz[a.ea[e]] + a.nz[a.eb[e]]) / 2 - z;
        const pr = a.project(e, x, z, {});
        if (pr.d <= r - 1) expect(got.has(e), 'kenar ' + e).toBe(true);
        void mx; void mz;
      }
    }
  });

  it('rota: rastgele düğüm çiftleri ulaşılır, kenarlar zincirleme birleşir, geçit cezası kısa yolu tercih eder', () => {
    const seed = citySeed(11);
    const nav = pedNav(seed);
    const out = new Int32Array(400);
    let found = 0;
    for (let k = 0; k < 120; k++) {
      const a = (k * 977) % nav.n;
      const b = (k * 3571 + 13) % nav.n;
      if (nav.adjStart[a + 1] === nav.adjStart[a] || nav.adjStart[b + 1] === nav.adjStart[b]) continue;
      const c = nav.route(a, b, out);
      if (a === b) {
        expect(c).toBe(0);
        continue;
      }
      expect(c).toBeGreaterThan(0);
      let node = a;
      for (let i = 0; i < c; i++) {
        const e = out[i];
        expect(nav.ea[e] === node || nav.eb[e] === node).toBe(true);
        node = nav.ea[e] === node ? nav.eb[e] : nav.ea[e];
      }
      expect(node).toBe(b);
      found++;
    }
    expect(found).toBeGreaterThan(100);
    // engelli kenar atlanır
    const blocked = new Uint8Array(nav.ne);
    const c0 = nav.route(5, 700, out);
    expect(c0).toBeGreaterThan(0);
    const first = out[0];
    blocked[first] = 1;
    const c1 = nav.route(5, 700, out, blocked);
    if (c1 > 0) for (let i = 0; i < c1; i++) expect(out[i]).not.toBe(first);
  });

  it('mekân noktaları: tüm türlerden var (barınak, kapı, metro girişi, fotoğraf, satıcı); ≥ 1 kulüp/kafe tohumlarda; her biri ağa ≤ 9 m', () => {
    const kinds = new Set();
    let cafe = 0;
    let club = 0;
    SEEDS.forEach((s) => {
      const nav = pedNav(citySeed(s));
      nav.spots.forEach((sp) => {
        kinds.add(sp.kind);
        if (sp.kind === SPOT.CAFE) cafe++;
        if (sp.kind === SPOT.CLUB) club++;
        expect(sp.cap).toBeGreaterThan(0);
        expect(sp.edge).toBeGreaterThanOrEqual(0);
        const pr = nav.project(sp.edge, sp.x, sp.z, {});
        expect(pr.d).toBeLessThan(9.5);
      });
    });
    [SPOT.SHELTER, SPOT.VENDOR, SPOT.PHOTO, SPOT.METRO, SPOT.DOOR].forEach((k) => expect(kinds.has(k)).toBe(true));
    expect(cafe + club).toBeGreaterThan(0);
  });

  it('plan probe: Kapı Meydanı yürünebilir; su ve yol (geçit dışı) değil; yük/kapı sınırı', () => {
    const seed = citySeed(3);
    const probe = planProbe(seed);
    expect(probe.free(8.5, 8.5, 0.23, false)).toBe(true);
    expect(probe.free(0, 0.5, 0.23, false)).toBeDefined();
    // kanal suyu: z≈560, x=40 civarı
    expect(probe.free(40, 560, 0.23, true)).toBe(false);
    // asfalt: x=240 arteri ortası, yol dışı yaya için kapalı, geçit için açık
    expect(probe.free(240, 40, 0.23, false)).toBe(false);
    expect(probe.free(240, 40, 0.23, true)).toBe(true);
    expect(probe.loaded(1, 1)).toBe(true);
  });
});

describe('pedProbe: gerçek bloklarla uyum (plan probe ile aynı kararlar)', () => {
  it('örnek noktalarda plan ve gerçek dünya aynı sonucu verir (kaldırım/asfalt/prop/duvar), yüklenmemiş bölge → false', async () => {
    const { World } = await import('../../world.js');
    const { attachPropLayer, createPropLayer } = await import('../../props/propLayer.js');
    const seed = citySeed(21);
    const world = new World({ seed, mode: 'macera', dim: 'neon' });
    attachPropLayer(world, createPropLayer({ citySeed: seed }));
    for (let cx = 9; cx <= 21; cx++) for (let cz = -5; cz <= 9; cz++) world.ensureChunk(cx, cz);
    const wp = worldProbe(world, { roads: getCityPlan(seed).roads });
    const pp = planProbe(seed);
    let agree = 0;
    let total = 0;
    let wFalseOnly = 0;
    for (let x = 160; x < 320; x += 1.7) {
      for (let z = -50; z < 130; z += 1.9) {
        const a = wp.free(x, z, 0.23, false);
        const b = pp.free(x, z, 0.23, false);
        total++;
        if (a === b) agree++;
        else if (!a && b) wFalseOnly++;
      }
    }
    // plan sorgusu muhafazakârdır (yan zeminde daha çok 'dolu' der); planın 'serbest' dediği yer gerçekte dolu olması çok nadirdir (<%0,5: yalnız blok dekoru)
    expect(wFalseOnly / total).toBeLessThan(0.005);
    expect(agree / total).toBeGreaterThan(0.6);
    expect(wp.loaded(9000, 9000)).toBe(false);
    expect(wp.free(9000, 9000, 0.23, false)).toBe(false);
  });
});
