/*
 * Yeraltı ulaşılabilirlik (3B yürüme BFS), hapis yok, kilitler, parça birleşimi = bütün (chunk dilimleri ↔ rastgele hizalı büyük yazıcı).
 */
import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { getCityPlan } from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';
import { sewerExtras } from './cityUndergroundExtra.js';
import { emitUnderground } from './cityUndergroundShell.js';
import { emitUndergroundContent, lockGraph, undergroundDiscovery } from './cityUnderground.js';
import { labFrame } from './cityUndergroundLabs.js';
import { vaultData } from './cityUndergroundVault.js';
import {
  BigWriter, Nav3, denseReader, doorOverlay, sectionReader, sliceUnion,
} from './cityContentTestKit.js';

const S0 = citySeed(0);
const S1 = citySeed(4);

describe('kanalizasyon ağı: menholden her tünel, kavşak odası ve gizli oda (kilit çözülünce) ulaşılır; kapalıyken gizli oda mühürlü', () => {
  [S0, S1].forEach((seed, si) => {
    it('tohum ' + si + ': menhol tepelerinden BFS', () => {
      const plan = getCityPlan(seed);
      const G = lockGraph(plan);
      const ex = sewerExtras(plan);
      const run = (mode) => {
        const rd = denseReader(seed, 16, 64, { overlay: doorOverlay(G.doors, mode) });
        const nav = new Nav3(rd.getBlock);
        const starts = plan.underground.sewer.manholes.map((m) => [m.x, 63, m.z]);
        const res = nav.bfs(starts, { box: { x0: -740, x1: 740, z0: -740, z1: 740, y0: 28, y1: 64 }, maxNodes: 4000000 });
        return { nav, res, rd };
      };
      const closed = run('free');
      const open = run('all');
      const { nav, res } = open;
      expect(res.count).toBeGreaterThan(200000);
      expect(JSON.stringify(res.trapped), 'tuzak (sokağa dönülemeyen düğümler: ' + res.trappedCount + ')').toBe('[]');
      // her menhol: baca tabanı (31) ve ana tünele bağlantı
      plan.underground.sewer.manholes.forEach((m) => {
        expect(nav.has(res, m.x, 31, m.z), 'menhol tabanı ' + m.id).toBe(true);
        expect(nav.has(res, m.x, 31, m.stub.z1 - 1), 'menhol bağlantısı ' + m.id).toBe(true);
      });
      // hat uçları: her sewer hattının orta noktası ve iki ucu
      plan.underground.sewer.lines.forEach((l) => {
        const mid = Math.round((l.a + l.b) / 2);
        const c = l.c;
        const probe = l.axis === 'z' ? [c, 31, mid] : [mid, 31, c];
        // orta nokta ışık/boru/yosunla kesilebilir: ±3 içinde bir düğüm
        let ok = false;
        for (let d = -3; d <= 3 && !ok; d++) {
          const x = l.axis === 'z' ? probe[0] : probe[0] + d;
          const z = l.axis === 'z' ? probe[2] + d : probe[2];
          ok = nav.has(res, x, 31, z);
        }
        expect(ok, 'hat ' + l.axis + l.c).toBe(true);
      });
      // kavşak odaları: temiz hücrelerin tamamı (düğüm olabilenler) ulaşılır
      let jrCells = 0;
      ex.junctions.forEach((J) => {
        for (let z = J.clear.z0; z < J.clear.z1; z++) {
          for (let x = J.clear.x0; x < J.clear.x1; x++) {
            if (!nav.node(x, 31, z)) continue;
            jrCells++;
            expect(nav.has(res, x, 31, z), 'kavşak ' + J.id + ' hücre ' + x + ',' + z).toBe(true);
          }
        }
      });
      expect(jrCells).toBeGreaterThan(8000);
      // keşif: 40 kanalizasyon çipi sokaktan (menhol) ulaşılır
      const chips = undergroundDiscovery(plan).chips;
      expect(chips.length).toBe(40);
      chips.forEach((c) => expect(nav.has(res, Math.floor(c.x), 31, Math.floor(c.z)), 'çip ulaşılamıyor ' + c.x + ',' + c.z).toBe(true));
      // gizli odalar: açıkken tüm iç hücreler; kapalıyken (kilitli) hiçbiri
      let hrCells = 0;
      ex.hidden.forEach((H) => {
        const probes = [];
        for (let z = H.clear.z0; z < H.clear.z1; z++) for (let x = H.clear.x0; x < H.clear.x1; x++) probes.push([x, z]);
        let any = 0;
        let reached = 0;
        probes.forEach(([x, z]) => {
          if (!open.nav.node(x, 31, z)) return;
          any++;
          if (open.nav.has(open.res, x, 31, z)) reached++;
          expect(closed.nav.has(closed.res, x, 31, z), 'gizli oda ' + H.id + ' kilitliyken ulaşılıyor').toBe(false);
        });
        hrCells += any;
        expect(any).toBeGreaterThan(20);
        expect(reached, 'gizli oda ' + H.id).toBe(any);
      });
      expect(hrCells).toBeGreaterThan(30 * 20);
    }, 600000);
  });
});

describe('metro: kioskların basamaklarından salonlar, tren içi, personel odaları; kilitli personel odası kapalıyken mühürlü', () => {
  it('BFS (kioskların üstünden)', () => {
    const seed = S0;
    const plan = getCityPlan(seed);
    const G = lockGraph(plan);
    const ex = sewerExtras(plan);
    const mk = (mode) => {
      const rd = denseReader(seed, 16, 64, { overlay: doorOverlay(G.doors, mode) });
      return new Nav3(rd.getBlock);
    };
    const nAll = mk('all');
    const nFree = mk('free');
    plan.underground.metro.stations.forEach((st) => {
      const starts = st.entrances.map((E) => [E.top.x, 64, E.top.z]);
      const box = { x0: st.x - 60, x1: st.x + 61, z0: st.z - 60, z1: st.z + 61, y0: 40, y1: 66 };
      const rAll = nAll.bfs(starts, { box });
      const rFree = nFree.bfs(starts, { box });
      expect(JSON.stringify(rAll.trapped), 'istasyon ' + st.id + ' tuzak').toBe('[]');
      let tot = 0;
      st.boxes.forEach((b) => {
        for (let z = b.z0; z < b.z1; z++) {
          for (let x = b.x0; x < b.x1; x++) {
            if (!nAll.node(x, 44, z)) continue;
            tot++;
            expect(nAll.has(rAll, x, 44, z), 'salon ' + st.id + ' ' + x + ',' + z).toBe(true);
          }
        }
      });
      expect(tot).toBeGreaterThan(700);
      // tren içi (merkez dışı): koridor hücreleri ulaşılır
      const S = ex.staff.find((q) => q.station === st.id);
      if (S) {
        let any = 0;
        for (let z = S.clear.z0; z < S.clear.z1; z++) {
          for (let x = S.clear.x0; x < S.clear.x1; x++) {
            if (!nAll.node(x, 44, z)) continue;
            any++;
            expect(nAll.has(rAll, x, 44, z), 'personel odası ' + st.id).toBe(true);
          }
        }
        expect(any).toBeGreaterThan(30);
        const locked = G.doors.find((d) => d.id === 'sd' + st.id).lock !== null;
        const mid = S.cell(14, 0);
        expect(nFree.has(rFree, mid[0], 44, mid[1]), 'kilit durumu ' + st.id).toBe(!locked);
      }
    });
    // tren iç koridoru ulaşılır (dış istasyonlarda)
    plan.underground.metro.stations.filter((s) => !s.central).forEach((st) => {
      const b = st.boxes[0];
      const axisZ = b.x1 - b.x0 < b.z1 - b.z0;
      const c = axisZ ? st.x : st.z;
      const a = (axisZ ? b.z0 : b.x0) + 14 + 5;
      const probe = axisZ ? [c, 44, a] : [a, 44, c];
      const rd = denseReader(seed, 16, 64, { overlay: doorOverlay(G.doors, 'all') });
      expect(rd.getBlock(probe[0], 45, probe[2])).toBe(0); // tren içinde hava
      const nav = new Nav3(rd.getBlock);
      const r = nav.bfs(st.entrances.map((E) => [E.top.x, 64, E.top.z]), { box: { x0: st.x - 60, x1: st.x + 61, z0: st.z - 60, z1: st.z + 61, y0: 40, y1: 66 } });
      expect(nav.has(r, probe[0], 44, probe[2]), 'tren içi ' + st.id).toBe(true);
    });
  }, 300000);
});

describe('laboratuvarlar ve kasa: kilit sırası, tüm odalar ulaşılır, kapalıyken mühürlü, içeriden çıkış (geri dönüş) serbest', () => {
  it('12 laboratuvar: sokaktan baca → 3 oda (tüm düğümler) + kasa', () => {
    const seed = S0;
    const plan = getCityPlan(seed);
    const G = lockGraph(plan);
    const V = plan.underground.vault;
    const vd = vaultData(plan);
    plan.underground.labs.forEach((L) => {
      const s = L.shaft;
      const nearTunnel = L.axis === 'z' ? [s.x - L.side, 31, s.z] : [s.x, 31, s.z - L.side];
      const bb = L.box;
      const isV = L.id === V.labId;
      const box = {
        x0: Math.min(bb.x0, isV ? V.x0 : 1e9) - 3, x1: Math.max(bb.x1, isV ? V.x1 : -1e9) + 3, z0: Math.min(bb.z0, isV ? V.z0 : 1e9) - 3, z1: Math.max(bb.z1, isV ? V.z1 : -1e9) + 3, y0: isV ? -113 : -26, y1: 33,
      };
      const build = (mode) => {
        const rd = sectionReader(seed, { overlay: doorOverlay(G.doors, mode) });
        const nav = new Nav3(rd.getBlock);
        return { nav, res: nav.bfs([nearTunnel], { box, maxNodes: 600000 }) };
      };
      const all = build('all');
      expect(JSON.stringify(all.res.trapped), 'lab ' + L.id + ' tuzak').toBe('[]');
      const fr = labFrame(L);
      L.rooms.forEach((r) => {
        let any = 0;
        for (let z = r.z0; z < r.z1; z++) {
          for (let x = r.x0; x < r.x1; x++) {
            if (!all.nav.node(x, r.y0, z)) continue;
            any++;
            expect(all.nav.has(all.res, x, r.y0, z), 'lab ' + L.id + ' oda ' + r.k + ' ' + x + ',' + z).toBe(true);
          }
        }
        expect(any, 'lab ' + L.id + ' oda ' + r.k).toBeGreaterThan(60);
      });
      // kasa
      if (isV) {
        const cx = vd.center.x;
        const cz = vd.center.z;
        let any = 0;
        for (let z = V.z0; z < V.z1; z++) {
          for (let x = V.x0; x < V.x1; x++) {
            if (!all.nav.node(x, V.y0, z)) continue;
            any++;
            expect(all.nav.has(all.res, x, V.y0, z), 'kasa ' + x + ',' + z).toBe(true);
          }
        }
        expect(any).toBeGreaterThan(300);
        expect(all.nav.has(all.res, cx, V.y0, cz)).toBe(true);
        // ödül çapası ulaşılır
        expect(all.nav.has(all.res, Math.floor(vd.reward.anchor.x), V.y0, Math.floor(vd.reward.anchor.z))).toBe(true);
      }
      // kapalı kilitlerle (yalnız kilitsiz kapılar açık): hiçbir oda ulaşılmaz
      const none = build('free');
      const r2 = L.rooms.find((r) => r.k === 2);
      let reachedClosed = 0;
      for (let z = r2.z0; z < r2.z1; z++) for (let x = r2.x0; x < r2.x1; x++) if (none.nav.has(none.res, x, r2.y0, z)) reachedClosed++;
      expect(reachedClosed, 'lab ' + L.id + ' kilitliyken giriş salonu').toBe(0);
      // yalnız giriş kapağı açık: k=2 ulaşılır; çekirdek (k=0) bulkhead kilitli → ulaşılmaz
      const entryOnly = build(['le' + L.id]);
      const r0 = L.rooms.find((r) => r.k === 0);
      const c0 = [Math.floor((r0.x0 + r0.x1) / 2), Math.floor((r0.z0 + r0.z1) / 2)];
      expect(entryOnly.nav.has(entryOnly.res, Math.floor((r2.x0 + r2.x1) / 2), r2.y0, Math.floor((r2.z0 + r2.z1) / 2))).toBe(true);
      expect(entryOnly.nav.has(entryOnly.res, c0[0], r0.y0, c0[1]), 'lab ' + L.id + ' çekirdek kilitliyken').toBe(false);
      void fr;
    });
  }, 900000);
});

describe('parça birleşimi = bütün: chunk dilimleri ile rastgele hizalı büyük yazıcı aynı bloklar (kabuk + içerik)', () => {
  const emit = (plan) => (w) => {
    emitUnderground(w, plan);
    emitUndergroundContent(w, plan);
  };
  const compare = (plan, reg, label) => {
    const big = new BigWriter(reg.x0, reg.z0, reg.x1, reg.z1, reg.y0, reg.y1);
    big.blocks.fill(B.STONE);
    emit(plan)(big);
    const region = {
      x0: Math.floor(reg.x0 / 16) * 16, z0: Math.floor(reg.z0 / 16) * 16, x1: Math.ceil(reg.x1 / 16) * 16, z1: Math.ceil(reg.z1 / 16) * 16, y0: reg.y0, y1: reg.y1,
    };
    const fwd = sliceUnion(region, emit(plan), B.STONE, 'fwd');
    const rev = sliceUnion(region, emit(plan), B.STONE, 'reverse');
    let diff = 0;
    let nonStone = 0;
    for (let y = reg.y0; y < reg.y1; y++) {
      for (let z = reg.z0; z < reg.z1; z++) {
        for (let x = reg.x0; x < reg.x1; x++) {
          const a = big.get(x, y, z);
          if (a !== B.STONE) nonStone++;
          if (a !== fwd.get(x, y, z) || a !== rev.get(x, y, z)) {
            diff++;
            if (diff < 4) throw new Error(label + ' fark ' + [x, y, z] + ' büyük ' + a + ' dilim ' + fwd.get(x, y, z) + '/' + rev.get(x, y, z));
          }
        }
      }
    }
    expect(nonStone, label).toBeGreaterThan(200);
    expect(diff).toBe(0);
  };

  it('kavşak odası, gizli oda, metro istasyonu + personel odası, lab odaları, kasa (rastgele hizalı pencereler)', () => {
    const plan = getCityPlan(S1);
    const ex = sewerExtras(plan);
    const J = ex.junctions[5];
    compare(plan, { x0: J.x - 27, x1: J.x + 30, z0: J.z - 23, z1: J.z + 26, y0: 26, y1: 40 }, 'kavşak');
    const H = ex.hidden[7];
    compare(plan, { x0: H.clear.x0 - 21, x1: H.clear.x1 + 22, z0: H.clear.z0 - 19, z1: H.clear.z1 + 25, y0: 26, y1: 40 }, 'gizli');
    const st = plan.underground.metro.stations[2];
    compare(plan, { x0: st.x - 31, x1: st.x + 33, z0: st.z - 37, z1: st.z + 26, y0: 40, y1: 56 }, 'metro');
    const L = plan.underground.labs[3];
    compare(plan, { x0: L.box.x0 - 5, x1: L.box.x1 + 7, z0: L.box.z0 - 3, z1: L.box.z1 + 9, y0: -28, y1: 34 }, 'lab');
    const V = plan.underground.vault;
    compare(plan, { x0: V.x0 - 3, x1: V.x1 + 5, z0: V.z0 - 5, z1: V.z1 + 3, y0: -114, y1: -86 }, 'kasa');
  }, 300000);
});
