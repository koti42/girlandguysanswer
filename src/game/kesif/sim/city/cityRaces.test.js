import { describe, expect, it } from 'vitest';
import { getCityPlan } from './cityPlan.js';
import { RACE_KEYS, buildRoofRoutes, raceTemplates } from './cityRaces.js';
import { buildRoadNet } from './roadNet.js';
import { allLots, footprintOf } from './cityLots.js';
import { ARCHETYPES, DISTRICTS } from './archetypes.js';
import { RACE_NAMES } from './cityNames.js';
import { GRID, SEGMENTS, nodeId } from './cityRoads.js';
import { citySeed, digest } from './cityPlanTestKit.js';

/** Çatı zıplama modeli (physics sabitleri: zıplama ≈1,25 blok, koşu 5,6 b/sn): boşluk ≤3 yürüyerek/≤4 koşarak, fark ≤ +1. */
function reachJump(gap, dy, run) {
  if (dy > 1) return false;
  return gap <= (run ? 4 : 3);
}

describe('yarış rotaları (8)', () => {
  it('8 rota: sıra RACE_NAMES ile aynı; #0 Çevreyolu halkası (i,j=±6); 6 halka + 2 sprint', () => {
    expect(RACE_KEYS.length).toBe(8);
    expect(RACE_NAMES.length).toBe(8);
    expect(RACE_NAMES[0]).toBe('Çevreyolu Turu');
    expect(RACE_NAMES[6]).toBe('Kanal Sprinti');
    expect(RACE_NAMES[7]).toBe('Tepe Sprinti');
    for (let i = 0; i < 30; i++) {
      const plan = getCityPlan(citySeed(i));
      expect(plan.races.length).toBe(8);
      expect(plan.races.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(plan.races.filter((r) => r.kind === 'circuit').length).toBe(6);
      expect(plan.races.filter((r) => r.kind === 'sprint').length).toBe(2);
      const ring = plan.races[0];
      expect(ring.closed).toBe(true);
      expect(ring.length).toBe(3840);
      expect(ring.nodes.length).toBe(48);
      const ringNodes = new Set(ring.nodes);
      for (let k = -6; k <= 6; k++) {
        expect(ringNodes.has(nodeId(k, -6))).toBe(true);
        expect(ringNodes.has(nodeId(k, 6))).toBe(true);
        expect(ringNodes.has(nodeId(-6, k))).toBe(true);
        expect(ringNodes.has(nodeId(6, k))).toBe(true);
      }
    }
  });

  it('kapılar: 6–14 adet, yarıçap 7, ardışık aralık ≥60, yol merkez çizgisinde; devrede kapanış aralığı da ≥60; süre/uzunluk uygun', () => {
    for (let i = 0; i < 200; i++) {
      const plan = getCityPlan(citySeed(i));
      plan.races.forEach((r) => {
        expect(r.gates.length).toBeGreaterThanOrEqual(6);
        expect(r.gates.length).toBeLessThanOrEqual(14);
        expect(r.laps).toBeGreaterThanOrEqual(1);
        expect(r.laps).toBeLessThanOrEqual(3);
        if (r.kind === 'circuit') {
          expect(r.length).toBeGreaterThanOrEqual(900);
          expect(r.length).toBeLessThanOrEqual(3840);
        } else expect(r.length).toBeGreaterThanOrEqual(900);
        for (let g = 0; g < r.gates.length; g++) {
          const a = r.gates[g];
          expect(a.r).toBe(7);
          expect(a.index).toBe(g);
          expect(Math.abs(Math.hypot(a.dx, a.dz) - 1)).toBeLessThan(1e-9);
          // merkez çizgisinde: x ya da z kafes çizgisi üzerinde
          const onX = Math.abs(a.x - Math.round(a.x / GRID) * GRID) < 1e-6;
          const onZ = Math.abs(a.z - Math.round(a.z / GRID) * GRID) < 1e-6;
          expect(onX || onZ).toBe(true);
          if (g + 1 < r.gates.length || r.closed) {
            const b = r.gates[(g + 1) % r.gates.length];
            expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(60);
          }
        }
        expect(r.start.x).toBe(r.gates[0].x);
        // kenarlar var ve kesik değil
        r.sids.forEach((sid) => expect(plan.roads.cut[sid]).toBe(0));
      });
    }
  });

  it('düğüm zinciri yol grafıyla uyumlu (ardışık düğümler bir kenarla bağlı; devre kapanır); Kanal Sprinti köprüsüz j=8 hattı', () => {
    for (let i = 0; i < 30; i++) {
      const plan = getCityPlan(citySeed(i));
      const net = buildRoadNet(plan);
      plan.races.forEach((r) => {
        const n = r.nodes.length;
        const m = r.closed ? n : n - 1;
        for (let k = 0; k < m; k++) {
          const a = r.nodes[k];
          const b = r.nodes[(k + 1) % n];
          const e = net.edges.find((q) => (q.a === a && q.b === b) || (q.a === b && q.b === a));
          if (!e) throw new Error('yarış kenarı yok: seed#' + i + ' yarış ' + r.id + ' ' + a + '→' + b);
          expect(e.bridge).toBe(false);
          expect(e.tunnel).toBe(false);
        }
      });
      const canal = plan.races[6];
      canal.nodes.forEach((id) => expect(net.nodes[id].j).toBe(8));
    }
  });

  it('raceTemplates belirlenimci ve farklı tohumlarda çeşitlenir', () => {
    const a = raceTemplates(citySeed(1), getCityPlan(citySeed(1)).districts);
    const b = raceTemplates(citySeed(1), getCityPlan(citySeed(1)).districts);
    expect(digest(a.paths)).toBe(digest(b.paths));
    const set = new Set();
    for (let i = 0; i < 40; i++) set.add(digest(getCityPlan(citySeed(i)).races.map((r) => r.nodes)));
    expect(set.size).toBeGreaterThan(20);
  });
});

describe('çatı parkuru (8 rota)', () => {
  it('8 rota, her biri 6–10 kontrol noktası; boşluk ≤3, fark ≤+1; hepsi reachJump ile geçilebilir (yürüyüş)', () => {
    for (let i = 0; i < 80; i++) {
      const plan = getCityPlan(citySeed(i));
      expect(plan.roofRoutes.length).toBe(8);
      expect(plan.roofRoutes.map((r) => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      plan.roofRoutes.forEach((rr) => {
        expect(rr.pads.length).toBeGreaterThanOrEqual(6);
        expect(rr.pads.length).toBeLessThanOrEqual(10);
        expect(rr.jumps.length).toBe(rr.pads.length - 1);
        rr.jumps.forEach((j) => {
          if (!reachJump(j.gap, j.dy, false)) throw new Error('çatı zıplaması geçilemez: seed#' + i + ' rota ' + rr.id + ' gap ' + j.gap + ' dy ' + j.dy);
          expect(j.dy).toBeLessThanOrEqual(1);
          expect(j.dy).toBeGreaterThanOrEqual(-1);
        });
        expect(rr.maxGap).toBeLessThanOrEqual(3);
        // başlangıç: dış merdivenli bina kapı önünde; bitiş sandık çatısında
        expect(rr.start.stair).toBe(true);
        expect(rr.end.y).toBe(rr.pads[rr.pads.length - 1].y);
      });
    }
  });

  it('rota blokları: Konteyner 3 + Pazar 3 + Tepe 2; aynı kat sayısı; parselin çatı yüksekliği pad y ile uyumlu; çatı sandığı son padde', () => {
    for (let i = 0; i < 40; i++) {
      const plan = getCityPlan(citySeed(i));
      const per = {};
      plan.roofRoutes.forEach((rr) => {
        per[rr.district] = (per[rr.district] || 0) + 1;
        const lots = allLots(plan).filter((l) => l.roof && l.roof.route === rr.id);
        expect(lots.length).toBeGreaterThanOrEqual(5);
        const floors = new Set(lots.map((l) => l.floors));
        expect(floors.size).toBe(1);
        expect(lots[0].floors).toBe(rr.floors);
        const D0 = DISTRICTS[rr.district];
        expect(rr.floors * 4).toBeGreaterThanOrEqual(D0.hMin);
        expect(rr.floors * 4).toBeLessThanOrEqual(D0.hMax);
        lots.forEach((l) => {
          expect(ARCHETYPES[l.archetype].building).toBe(true);
          expect(l.roof.lift === 0 || l.roof.lift === 1).toBe(true);
          expect(l.setback.s).toBe(0);
          expect(l.setback.b).toBe(0);
          const fp = footprintOf(l);
          const pad = rr.pads.find((p) => p.lot === l.id);
          if (pad) {
            expect(pad.y).toBe(64 + 4 * l.floors + l.roof.lift);
            expect(pad.x0).toBe(fp.x0);
            expect(pad.x1).toBe(fp.x1);
          }
        });
      });
      expect(per.konteyner).toBe(3);
      expect(per.gece_pazari).toBe(3);
      expect(per.tepe).toBe(2);
    }
  });

  it('buildRoofRoutes yeniden çağrıda aynı sonucu verir (önbellekli yerleşimden)', () => {
    const plan = getCityPlan(citySeed(9));
    expect(digest(buildRoofRoutes(plan))).toBe(digest(plan.roofRoutes));
    expect(SEGMENTS.length).toBeGreaterThan(600);
  });
});
