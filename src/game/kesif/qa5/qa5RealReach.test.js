/*
 * qa5 (Faz 5, qa_logic) — GERÇEK BLOK hücre BFS'i (tüm şehir), plan düzeyi denetimlerin (qa5Reach, cityGateP2/P4) tamamlayıcısı: sokaktan (Kapı Meydanı) yürüyerek
 * HER yüzey POI TÜRÜ (kapı önü, satıcı, barınak, foto noktası, grafiti, zemin çipi, garaj, kiralama, kurye masası, yarış kapısı, park yeri, çatı parkuru başlangıcı,
 * terminal) ve menhollerden (kilitler çözülmüş) kanalizasyon çipleri, 18 kanal grafitisi, 30 gizli oda ulaşılır; yeraltı hapis yok.
 * Her tohum ≈ 1–2 dk: varsayılan 2 tohum (başka testlerin kullandığı tohumlardan FARKLI); ölçek için KESIF_QA5_REAL_SEEDS=k (tohum 40.. 40+k-1).
 */
import { describe, expect, it, vi } from 'vitest';
import { getCityPlan, pois } from '../sim/city/cityPlan.js';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { buildNav } from '../sim/city/cityNavKit.js';
import { lockGraph } from '../sim/city/cityUndergroundLocks.js';
import { Nav3, denseReader, doorOverlay } from '../sim/city/cityContentTestKit.js';
import { buildDiscovery } from '../sim/city/mission/discovery.js';

vi.setConfig({ testTimeout: 1800000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N = Number(ENV.KESIF_QA5_REAL_SEEDS || 2);
const SEEDS = Array.from({ length: N }, (_, i) => 40 + i * 11);
const SURFACE = ['door', 'vendor', 'shelter', 'photo_spot', 'graffiti', 'garage', 'rental', 'courier_desk', 'race_gate', 'park_slot', 'roof_start', 'portal_terminal'];

describe('qa5 gerçek blok BFS — yüzey: her POI türü sokaktan yürünür', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': 12 POI türü + zemin çipleri (kapı/park) Kapı Meydanı\'ndan hücre BFS ile ulaşılır', () => {
      const seed = citySeed(s);
      const nav = buildNav(seed);
      const seen = nav.reach(0, 64, 2);
      const near = (x, z, y, r) => {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const lv = nav.levels(Math.floor(x) + dx, Math.floor(z) + dz);
            for (let k = 0; k < lv.length; k++) if (Math.abs(lv[k] - y) <= 2 && nav.isReached(seen, Math.floor(x) + dx, Math.floor(z) + dz, lv[k])) return true;
          }
        }
        return false;
      };
      const miss = [];
      const per = {};
      pois(seed).forEach((p) => {
        if (SURFACE.indexOf(p.type) < 0 && !(p.type === 'chip' && (p.kind === 'kapi' || p.kind === 'park'))) return;
        const key = p.type === 'chip' ? 'chip_' + p.kind : p.type;
        per[key] = (per[key] || 0) + 1;
        // ayakta durulacak nokta POI'nin kendisi ya da önü (≤ 5 blok); y: POI y (zemin/kaldırım 64, tepe teraslarında yüksek)
        if (!near(p.x, p.z, p.y, 5)) miss.push(key + '#' + p.id + ' (' + p.x + ',' + p.y + ',' + p.z + ')');
      });
      expect(Object.keys(per).length).toBeGreaterThanOrEqual(12);
      expect(per.portal_terminal).toBe(16);
      expect(per.roof_start).toBe(8);
      expect(per.race_gate).toBe(8);
      expect(per.chip_kapi + per.chip_park).toBeGreaterThan(100);
      expect(miss.slice(0, 12)).toEqual([]);
    });
  });
});

describe('qa5 gerçek blok BFS — yeraltı: kanalizasyon hapis yok, çip/grafiti/gizli oda ulaşılır', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': menholden 3B BFS (kilitler çözülmüş): 40 çip, 18 grafiti, 30 gizli oda; sokağa dönülemeyen düğüm 0', () => {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      const cat = buildDiscovery(seed);
      const G = lockGraph(plan);
      const rd = denseReader(seed, 16, 64, { overlay: doorOverlay(G.doors, 'all') });
      const nav = new Nav3(rd.getBlock);
      const starts = plan.underground.sewer.manholes.map((m) => [m.x, 63, m.z]);
      const res = nav.bfs(starts, { box: { x0: -740, x1: 740, z0: -740, z1: 740, y0: 28, y1: 64 }, maxNodes: 4000000 });
      expect(res.count).toBeGreaterThan(200000);
      expect(res.trappedCount, 'tuzak (sokağa dönülemeyen düğüm)').toBe(0);
      const nearNode = (x, y, z, r) => {
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (nav.has(res, Math.floor(x) + dx, y, Math.floor(z) + dz)) return true;
        return false;
      };
      const bad = [];
      const chips = cat.chips.filter((c) => c.kind === 'kanal');
      expect(chips).toHaveLength(40);
      chips.forEach((c) => { if (!nearNode(c.x, 31, c.z, 1)) bad.push('çip ' + c.id); });
      const graf = cat.graffiti.filter((g) => g.where === 'kanal');
      expect(graf).toHaveLength(18);
      graf.forEach((g) => { if (!nearNode(g.x, 31, g.z, 1)) bad.push('grafiti ' + g.id); });
      expect(cat.rooms).toHaveLength(30);
      cat.rooms.forEach((r) => {
        const b = r.box;
        let any = false;
        for (let z = b.z0; z < b.z1 && !any; z++) for (let x = b.x0; x < b.x1 && !any; x++) if (nav.has(res, x, 31, z)) any = true;
        if (!any) bad.push('gizli oda ' + r.id);
      });
      expect(bad).toEqual([]);
    });
  });
});
