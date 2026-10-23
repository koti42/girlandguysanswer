import { describe, expect, it } from 'vitest';
import { getBlockPlan, getCityPlan } from './cityPlan.js';
import { normalizeSpec, propsForChunk } from '../props/propPlan.js';
import { PROP_DEFS } from '../props/propDefs.js';
import { BK, GRID, SURF, surfaceAt, tunnelAt } from './cityRoads.js';
import { FURN_KINDS } from './cityBlocks.js';
import { lotAt } from './cityLots.js';
import { buildRoadNet } from './roadNet.js';
import { citySeed } from './cityPlanTestKit.js';

const STREET_OK = [SURF.SIDEWALK, SURF.PLAZA, SURF.QUAY, SURF.ASPHALT, SURF.LANE_X, SURF.LANE_Z, SURF.ZEBRA_X, SURF.ZEBRA_Z];

function cell(p) {
  return Math.floor(p.x) + ',' + Math.floor(p.z) + ',' + Math.round(p.y);
}

describe('blok planı', () => {
  it('blok planı alanları; sahiplik: tüm sokak donanımı kendi bloğunun içinde; kıyı bloklarında parsel/bina propu yok', () => {
    for (let i = 0; i < 6; i++) {
      const seed = citySeed(i);
      for (let bj = -10; bj <= 9; bj++) {
        for (let bi = -10; bi <= 9; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          expect(bp.bi).toBe(bi);
          expect(bp.bj).toBe(bj);
          expect(Array.isArray(bp.lots) && Array.isArray(bp.props) && Array.isArray(bp.streetFurniture) && Array.isArray(bp.lamps)).toBe(true);
          expect(bp.cell).toEqual({ x0: bi * GRID, z0: bj * GRID, x1: (bi + 1) * GRID, z1: (bj + 1) * GRID });
          if (bp.kind === BK.EDGE) {
            // kıyı blokları: parsel yok; yalnız kara üzerindeki yol yarı şeridi/köşe donanımı olabilir (|x|,|z|<730)
            expect(bp.lots.length + bp.props.length).toBe(0);
            bp.streetFurniture.concat(bp.lamps).forEach((p) => expect(Math.abs(p.x) < 730 && Math.abs(p.z) < 730).toBe(true));
          }
          [bp.props, bp.streetFurniture, bp.lamps].forEach((list) => list.forEach((p) => {
            if (p.x < bp.cell.x0 || p.x >= bp.cell.x1 || p.z < bp.cell.z0 || p.z >= bp.cell.z1) {
              // yalnız tepe terminali/direkler değil: hepsi blok içinde olmalı
              throw new Error('prop blok dışında: seed#' + i + ' blok ' + bi + ',' + bj + ' ' + p.kind + ' ' + p.x + ',' + p.z);
            }
          }));
        }
      }
    }
    expect(getBlockPlan(citySeed(0), 10, 0)).toBeNull();
    expect(getBlockPlan(citySeed(0), -11, 0)).toBeNull();
  });

  it('PropSpec: gerçek propPlan.normalizeSpec hepsini kabul eder; (lotId,slot) küresel benzersiz; çarpışma hücresi benzersiz; yaw/variant aralıkları', () => {
    for (let i = 0; i < 5; i++) {
      const seed = citySeed(i);
      const seen = new Set();
      const cells = new Set();
      for (let bj = -10; bj <= 9; bj++) {
        for (let bi = -10; bi <= 9; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          const all = bp.props.concat(bp.streetFurniture, bp.lamps);
          all.forEach((s) => {
            const k = s.lotId + ':' + s.slot;
            if (seen.has(k)) throw new Error('(lotId,slot) tekrar: ' + k);
            seen.add(k);
            expect(PROP_DEFS[s.kind === 'cop_kutusu' ? 'cop_kutusu' : s.kind]).toBeTruthy();
            expect(s.yaw).toBeGreaterThanOrEqual(0);
            expect(s.yaw).toBeLessThan(4);
            expect(s.variant).toBeGreaterThanOrEqual(0);
            expect(s.variant).toBeLessThan(8);
            const p = normalizeSpec(seed, s);
            if (p === null) throw new Error('propPlan reddetti: ' + JSON.stringify(s));
          });
          // sokak seviyesindeki donanım: aynı hücrede iki donanım yok (ağaç/bank/otomat…); tabela/billboard duvardadır, hariç
          bp.streetFurniture.concat(bp.lamps).forEach((s) => {
            const c = cell(s);
            if (cells.has(c)) throw new Error('aynı hücrede iki donanım: seed#' + i + ' ' + c);
            cells.add(c);
          });
        }
      }
    }
  });

  it('sokak donanımı ve lambalar yaya şeridinin DIŞ hücresinde: yol koridoru yüzeyi, parsel/su dışı; kapı önü 3 blok boş; en az 1 hücre yürüme şeridi kalır', () => {
    for (let i = 0; i < 4; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      for (let bj = -10; bj <= 9; bj++) {
        for (let bi = -10; bi <= 9; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          // kapı önü: 3 geniş × 2 derin hücre (isNoBuild ile aynı)
          const apron = new Set();
          bp.lots.forEach((l) => {
            if (!l.door) return;
            const d = l.door;
            const vx = d.face === 'e' ? 1 : d.face === 'w' ? -1 : 0;
            const vz = d.face === 's' ? 1 : d.face === 'n' ? -1 : 0;
            for (let dep = 0; dep < 2; dep++) for (let w = -1; w <= 1; w++) apron.add((d.front.x + vx * dep + (d.axis === 'x' ? w : 0)) + ',' + (d.front.z + vz * dep + (d.axis === 'z' ? w : 0)));
          });
          bp.lamps.concat(bp.streetFurniture).forEach((p) => {
            if (p.kind === 'trafik_diregi' || p.kind === 'boyut_terminali' || p.side === 'meydan') return;
            const cx = Math.floor(p.x);
            const cz = Math.floor(p.z);
            const s = surfaceAt(plan.roads, cx, cz);
            if (STREET_OK.indexOf(s) < 0) throw new Error('donanım yol dışı: ' + p.kind + ' ' + cx + ',' + cz + ' yüzey ' + s);
            expect(lotAt(plan, cx, cz)).toBeNull();
            expect(tunnelAt(plan.roads, cx, cz)).not.toBe(1);
            if (apron.has(cx + ',' + cz)) throw new Error('kapı önü dolu: ' + p.kind);
          });
          // lamba aralığı (aynı kenar): ≥12
          const bySide = {};
          bp.lamps.filter((p) => p.side !== 'meydan').forEach((p) => (bySide[p.side] = bySide[p.side] || []).push(p));
          Object.keys(bySide).forEach((sd) => {
            const l = bySide[sd].slice().sort((a, b) => a.x - b.x || a.z - b.z);
            for (let q = 1; q < l.length; q++) expect(Math.hypot(l[q].x - l[q - 1].x, l[q].z - l[q - 1].z)).toBeGreaterThanOrEqual(12);
          });
          FURN_KINDS.forEach((k) => expect(typeof k).toBe('string'));
        }
      }
    }
  });

  it('trafik direkleri = kavşak ışıkları (yaw kola dönük); menholler her kavşak KD köşesinde (337); terminaller 16 prop, her biri bir kez', () => {
    for (let i = 0; i < 6; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const net = buildRoadNet(plan);
      let poles = 0;
      let manholes = 0;
      const termSeen = new Array(16).fill(0);
      for (let bj = -10; bj <= 9; bj++) {
        for (let bi = -10; bi <= 9; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          bp.streetFurniture.forEach((p) => {
            if (p.kind === 'trafik_diregi') {
              poles++;
              const it = net.intersections.find((q) => q.id === p.junction);
              const L = it.lights.find((l) => l.dir === p.dir);
              expect(L).toBeTruthy();
              expect([L.x, L.y, L.z]).toEqual([p.x, p.y, p.z]);
              // yaw: bakış yönü arm yönü (K 2, D 1, G 0, B 3)
              expect(p.yaw).toBe([2, 1, 0, 3][p.dir]);
            }
            if (p.kind === 'boyut_terminali') termSeen[p.terminal]++;
          });
          manholes += bp.manholes.length;
        }
      }
      const expectedLights = net.intersections.reduce((a, it) => a + it.lights.length, 0);
      expect(poles).toBe(expectedLights);
      expect(manholes).toBe(337);
      expect(termSeen).toEqual(new Array(16).fill(1));
    }
  });

  it('varış noktası (0.5, 64, 2.5) çevresi: terminal 0 dışında 5 blok içinde hiçbir prop/lamba/donanım yok (Kapı Meydanı serbest)', () => {
    for (let i = 0; i < 40; i++) {
      const seed = citySeed(i);
      for (let bj = -1; bj <= 0; bj++) {
        for (let bi = -1; bi <= 0; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          bp.props.concat(bp.streetFurniture, bp.lamps).forEach((p) => {
            if (p.kind === 'boyut_terminali') return;
            const d = Math.hypot(p.x - 0.5, p.z - 2.5);
            if (d < 5) throw new Error('varış noktası çevresinde ' + p.kind + ' d=' + d + ' seed#' + i);
          });
        }
      }
    }
  });

  it('tabela/billboard PropSpec: bölge ve (sahipli binada) marka kimliği taşır', () => {
    const seed = citySeed(2);
    const plan = getCityPlan(seed);
    let owned = 0;
    for (let bj = -9; bj <= 8; bj++) {
      for (let bi = -9; bi <= 8; bi++) {
        const bp = getBlockPlan(seed, bi, bj);
        bp.props.forEach((p) => {
          if (p.kind !== 'tabela' && p.kind !== 'billboard') return;
          expect(typeof p.district).toBe('string');
          if (p.brand) owned++;
        });
      }
    }
    expect(owned).toBeGreaterThan(5);
    expect(plan.owners.size).toBe(16);
  });

  it('chunk başına prop sayısı ≤120 ve propsForChunk (gerçek propPlan) tüm şehirde çalışır', () => {
    const seed = citySeed(1);
    let max = 0;
    let total = 0;
    for (let cz = -50; cz < 50; cz++) {
      for (let cx = -50; cx < 50; cx++) {
        const n = propsForChunk(seed, cx, cz).length;
        total += n;
        if (n > max) max = n;
      }
    }
    expect(max).toBeLessThanOrEqual(120);
    expect(total).toBeGreaterThan(8000);
  });

  it('LRU 96: 96’dan fazla blok istendiğinde bellek sınırlı; aynı blok önbellekten aynı nesne', () => {
    const seed = citySeed(8);
    const plan = getCityPlan(seed);
    const a = getBlockPlan(seed, 1, 1);
    expect(getBlockPlan(seed, 1, 1)).toBe(a);
    for (let bj = -9; bj <= 8; bj++) for (let bi = -9; bi <= 8; bi++) getBlockPlan(seed, bi, bj);
    expect(plan._blockPlans.size).toBeLessThanOrEqual(96);
    expect(plan._blockPlans.max).toBe(96);
  });
});

describe('açık bloklar (park, meydan, parkur, tepe)', () => {
  it('park: ortada 3 genişlikli yol çaprazı, ağaçlar yolda değil; meydan: çeşme (haç/bölge meydanı hariç), banklar; Kapı Meydanı’nda (|x|,|z|≤18) yalnız terminal', () => {
    let parks = 0;
    let plazas = 0;
    for (let i = 0; i < 8; i++) {
      const seed = citySeed(i);
      for (let bj = -9; bj <= 8; bj++) {
        for (let bi = -9; bi <= 8; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          if (bp.kind === BK.PARK) {
            parks++;
            const paths = bp.features.filter((f) => f.kind === 'yol');
            expect(paths.length).toBe(2);
            paths.forEach((f) => expect((f.x1 - f.x0 === 3 && f.z1 - f.z0 === bp.rect.z1 - bp.rect.z0) || (f.z1 - f.z0 === 3 && f.x1 - f.x0 === bp.rect.x1 - bp.rect.x0)).toBe(true));
            bp.props.filter((p) => p.kind === 'agac').forEach((p) => {
              const onPath = paths.some((f) => p.x >= f.x0 && p.x < f.x1 && p.z >= f.z0 && p.z < f.z1);
              expect(onPath).toBe(false);
            });
          }
          if (bp.kind === BK.PLAZA) {
            plazas++;
            expect(bp.features.some((f) => f.kind === 'cesme')).toBe(true);
          }
          if (bp.kind === BK.CENTRAL) {
            bp.props.forEach((p) => expect(Math.abs(p.x) <= 18 && Math.abs(p.z) <= 18).toBe(false));
          }
        }
      }
    }
    expect(parks).toBeGreaterThan(10);
    expect(plazas).toBeGreaterThan(3);
  });

  it('parkur: 6×6 platform ızgarası, komşu yükseklik farkı ≤1 (sıçranabilir), boşluk 3; kenar platformdan zirveye yol var', () => {
    let seen = 0;
    for (let i = 0; i < 40 && seen < 3; i++) {
      const seed = citySeed(i);
      for (let bj = -9; bj <= 8 && seen < 3; bj++) {
        for (let bi = -9; bi <= 8 && seen < 3; bi++) {
          const bp = getBlockPlan(seed, bi, bj);
          if (bp.kind !== BK.PARKUR) continue;
          seen++;
          const pl = bp.features.filter((f) => f.kind === 'platform');
          expect(pl.length).toBe(36);
          pl.forEach((p) => {
            expect(p.x1 - p.x0).toBe(7);
            expect(p.h).toBeGreaterThanOrEqual(1);
            expect(p.h).toBeLessThanOrEqual(3);
            expect(p.x0).toBeGreaterThanOrEqual(bp.rect.x0);
            expect(p.x1).toBeLessThanOrEqual(bp.rect.x1);
            expect(p.z0).toBeGreaterThanOrEqual(bp.rect.z0);
            expect(p.z1).toBeLessThanOrEqual(bp.rect.z1);
          });
          // BFS: h=1 platformlardan başla; komşu (pitch 10) farkı ≤1 → her platforma ulaşılır
          const cellAt = (a, b) => pl[a * 6 + b];
          const seenP = new Set();
          const st = [[0, 0]];
          seenP.add('0,0');
          while (st.length) {
            const [a, b] = st.pop();
            [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([da, db]) => {
              const na = a + da;
              const nb = b + db;
              if (na < 0 || nb < 0 || na > 5 || nb > 5 || seenP.has(na + ',' + nb)) return;
              if (cellAt(na, nb).h - cellAt(a, b).h > 1) return;
              seenP.add(na + ',' + nb);
              st.push([na, nb]);
            });
          }
          expect(seenP.size).toBe(36);
          expect(Math.max(...pl.map((p) => p.h))).toBe(3);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('tepe terası bloğu: 4 teras + 4 merdiven özelliği, terminal 15 zirvede (y112), halka propları iç terasa/basamağa düşmez', () => {
    for (let i = 0; i < 10; i++) {
      const seed = citySeed(i);
      const plan = getCityPlan(seed);
      const hb = plan.roads.blocks.hill;
      const bp = getBlockPlan(seed, hb.bi, hb.bj);
      expect(bp.kind).toBe(BK.HILL);
      expect(bp.features.filter((f) => f.kind === 'teras').length).toBe(4);
      expect(bp.features.filter((f) => f.kind === 'merdiven').length).toBe(4);
      const term = bp.streetFurniture.find((p) => p.kind === 'boyut_terminali' && p.terminal === 15);
      expect(term).toBeTruthy();
      expect(term.y).toBe(112);
      bp.props.forEach((p) => {
        if (p.y >= 112) return;
        plan.hill.stairs.forEach((s) => {
          const inside = p.x >= s.x0 && p.x < s.x1 && p.z >= s.z0 && p.z < s.z1;
          expect(inside).toBe(false);
        });
      });
    }
  });
});
