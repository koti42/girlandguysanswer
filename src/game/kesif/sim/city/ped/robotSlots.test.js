/*
 * Robot doğma yuvaları: belirlenimcilik, güvenli bölge fuzz'ı (yuva YOK), katman kuralları, kimlik/konum geçerliliği.
 */
import { describe, expect, it } from 'vitest';
import { clearRobotSlotCache, robotSlotsForChunk, robotZoneOk } from './robotSlots.js';
import { ROBOT_KEYS, ROBOT_LAYERS } from './robotData.js';
import { getCityPlan, planZoneAt } from '../cityPlan.js';
import { SAFE_TERMINAL_R, districtAt, safeAt } from '../cityDistricts.js';
import { SURF, surfaceAt } from '../cityRoads.js';
import { SEWER, METRO } from '../cityUndergroundPlan.js';
import { dimSeed } from '../../dim/dimensions.js';

const WORLD_SEEDS = [1, 2, 12345, 987654321, -77, 424242, 31337, 2024];
const seedsOf = WORLD_SEEDS.map((w) => dimSeed(w, 'neon'));

function allSlots(seed, r) {
  const out = [];
  for (let cx = -r; cx < r; cx++) for (let cz = -r; cz < r; cz++) out.push(...robotSlotsForChunk(seed, cx, cz));
  return out;
}

describe('belirlenimcilik', () => {
  it('aynı (tohum, chunk) → aynı yuvalar; önbellek temizlenince de aynı', () => {
    const seed = seedsOf[2];
    const a = JSON.stringify(allSlots(seed, 30));
    clearRobotSlotCache();
    const b = JSON.stringify(allSlots(seed, 30));
    expect(b).toBe(a);
  });

  it('chunk sırası sonucu etkilemez (karışık sırada sorgula)', () => {
    const seed = seedsOf[3];
    const coords = [];
    for (let cx = -20; cx < 20; cx++) for (let cz = -20; cz < 20; cz++) coords.push([cx, cz]);
    const ref = new Map();
    coords.forEach(([cx, cz]) => ref.set(cx + ',' + cz, JSON.stringify(robotSlotsForChunk(seed, cx, cz))));
    clearRobotSlotCache();
    const shuffled = coords.slice().sort((p, q) => ((p[0] * 7919 + p[1] * 104729) % 1013) - ((q[0] * 7919 + q[1] * 104729) % 1013));
    shuffled.forEach(([cx, cz]) => expect(JSON.stringify(robotSlotsForChunk(seed, cx, cz))).toBe(ref.get(cx + ',' + cz)));
  });

  it('farklı tohumlar farklı yuva kümeleri üretir', () => {
    const a = JSON.stringify(allSlots(seedsOf[0], 25));
    const b = JSON.stringify(allSlots(seedsOf[1], 25));
    expect(a).not.toBe(b);
  });

  it('dönen yuvalar donmuş; aynı çağrı aynı nesneyi (önbellek) döndürür', () => {
    const seed = seedsOf[2];
    const s = allSlots(seed, 10).find(Boolean) || robotSlotsForChunk(seed, 0, -25)[0];
    if (s) expect(Object.isFrozen(s)).toBe(true);
    expect(robotSlotsForChunk(seed, 3, -30)).toBe(robotSlotsForChunk(seed, 3, -30));
  });
});

describe('güvenli bölgede yuva YOK (fuzz: 8 tohum × tüm şehir)', () => {
  it('hiçbir yuva safeAt (y verilerek de verilmeyerek), terminal çevresi 24, meydan r=90 ya da güvenli bölge içinde değil', () => {
    let total = 0;
    seedsOf.forEach((seed) => {
      const plan = getCityPlan(seed);
      const slots = allSlots(seed, 50);
      total += slots.length;
      expect(slots.length).toBeGreaterThan(300);
      slots.forEach((s) => {
        expect(safeAt(plan, s.x, s.z), 'safeAt xz').toBe(false);
        expect(safeAt(plan, s.x, s.z, s.y), 'safeAt xzy').toBe(false);
        expect(robotZoneOk(plan, s.x, s.z)).toBe(true);
        for (let i = 0; i < plan.terminals.length; i++) {
          const t = plan.terminals[i];
          expect(Math.hypot(s.x - t.x, s.z - t.z)).toBeGreaterThan(SAFE_TERMINAL_R);
        }
        expect(Math.hypot(s.x, s.z)).toBeGreaterThan(90);
        const d = districtAt(plan, s.x, s.z);
        expect(d === 'liman' || d === 'konteyner').toBe(true); // Merkez/Pazar/Teknoloji/Tepe güvenli
      });
    });
    expect(total).toBeGreaterThan(3000);
  });

  it('dolaşma halkası: yuvanın 8 blok çevresi de güvenli bölge dışında', () => {
    seedsOf.slice(0, 4).forEach((seed) => {
      const plan = getCityPlan(seed);
      allSlots(seed, 50).forEach((s) => {
        [[8, 0], [-8, 0], [0, 8], [0, -8]].forEach(([dx, dz]) => expect(safeAt(plan, s.x + dx, s.z + dz)).toBe(false));
      });
    });
  });

  it('robotZoneOk: terminal, meydan ve güvenli bölge noktaları reddedilir', () => {
    const plan = getCityPlan(seedsOf[2]);
    plan.terminals.forEach((t) => expect(robotZoneOk(plan, t.x, t.z)).toBe(false));
    expect(robotZoneOk(plan, 0, 0)).toBe(false);
    expect(robotZoneOk(plan, 40, 40)).toBe(false);
    const hill = plan.terminals[15];
    expect(robotZoneOk(plan, hill.x, hill.z)).toBe(false);
  });
});

describe('katman kuralları', () => {
  it('yüzey: kaldırım/rıhtım/meydan/park/zemin; asfalt, zebra, su yok; bina içi yok; y=64', () => {
    const okSurf = [SURF.SIDEWALK, SURF.QUAY, SURF.PLAZA, SURF.PARK, SURF.GROUND];
    seedsOf.slice(0, 4).forEach((seed) => {
      const plan = getCityPlan(seed);
      allSlots(seed, 50).filter((s) => s.layer === 'surface').forEach((s) => {
        expect(okSurf).toContain(surfaceAt(plan.roads, Math.floor(s.x), Math.floor(s.z)));
        expect(planZoneAt(plan, Math.floor(s.x), 64, Math.floor(s.z))).toBeNull();
        expect(planZoneAt(plan, Math.floor(s.x), 66, Math.floor(s.z))).toBeNull();
        expect(s.y).toBe(64);
      });
    });
  });

  it('yeraltı: kanalizasyon y=31 koridorunda, metro y=44 tünelinde, laboratuvar odasında; y değerleri düzgün', () => {
    let sewer = 0;
    let lab = 0;
    seedsOf.forEach((seed) => {
      const plan = getCityPlan(seed);
      allSlots(seed, 50).forEach((s) => {
        if (s.layer === 'sewer') {
          sewer++;
          expect(s.y).toBe(SEWER.floorY);
          const x = Math.floor(s.x);
          const z = Math.floor(s.z);
          const mx = ((x % 80) + 80) % 80;
          const mz = ((z % 80) + 80) % 80;
          const nearX = Math.min(mx, 80 - mx) <= 1;
          const nearZ = Math.min(mz, 80 - mz) <= 1;
          expect(nearX || nearZ).toBe(true);
        } else if (s.layer === 'metro') {
          expect(s.y).toBe(METRO.floorY);
          expect(Math.min(Math.abs(s.x), Math.abs(s.z))).toBeLessThanOrEqual(2.5);
        } else if (s.layer === 'lab') {
          lab++;
          const inRoom = plan.underground.labs.some((l) => l.rooms.some((q) => s.x >= q.x0 && s.x < q.x1 && s.z >= q.z0 && s.z < q.z1 && s.y === q.y0));
          expect(inRoom).toBe(true);
        }
        expect(ROBOT_KEYS).toContain(s.key);
        expect(ROBOT_LAYERS[s.layer].map((e) => e[0])).toContain(s.key);
      });
    });
    expect(sewer).toBeGreaterThan(100);
    expect(lab).toBeGreaterThan(0);
  });

  it('kasa (y<−90) ve istasyon kutuları yuva olmaz', () => {
    seedsOf.forEach((seed) => {
      const plan = getCityPlan(seed);
      allSlots(seed, 50).forEach((s) => {
        expect(s.y).toBeGreaterThan(-60);
        if (s.layer === 'metro') {
          plan.underground.metro.stations.forEach((st) => {
            const along = Math.abs(st.axis === 'z' ? s.z - st.z : s.x - st.x);
            const across = Math.abs(st.axis === 'z' ? s.x - st.x : s.z - st.z);
            expect(along < METRO.stationLen / 2 + 14 && across < 24).toBe(false);
          });
        }
      });
    });
  });

  it('tüm katmanlar (yüzey, kanalizasyon, laboratuvar) toplamda görülür; her tür seçilir', () => {
    const layers = new Set();
    const keys = new Set();
    seedsOf.forEach((seed) => allSlots(seed, 50).forEach((s) => { layers.add(s.layer); keys.add(s.key); }));
    ['surface', 'sewer', 'lab'].forEach((l) => expect(layers.has(l), l).toBe(true));
    ROBOT_KEYS.forEach((k) => expect(keys.has(k), k).toBe(true));
  });
});

describe('yuva geçerliliği', () => {
  it('konum tamsayı+0.5; kendi chunk içinde; kimlik tohum içinde benzersiz; aralıkta', () => {
    seedsOf.forEach((seed) => {
      const ids = new Set();
      let n = 0;
      for (let cx = -50; cx < 50; cx++) {
        for (let cz = -50; cz < 50; cz++) {
          robotSlotsForChunk(seed, cx, cz).forEach((s) => {
            n++;
            expect(s.x - Math.floor(s.x)).toBe(0.5);
            expect(s.z - Math.floor(s.z)).toBe(0.5);
            expect(Math.floor(s.x / 16)).toBe(cx);
            expect(Math.floor(s.z / 16)).toBe(cz);
            expect(Number.isFinite(s.yaw)).toBe(true);
            expect(Math.abs(s.x)).toBeLessThan(800);
            expect(Math.abs(s.z)).toBeLessThan(800);
            ids.add(s.id);
          });
        }
      }
      expect(ids.size).toBeGreaterThan(n * 0.995); // 32 bit kimlik: çarpışma ihmal edilebilir
    });
  });

  it('chunk başına en çok 2 yuva; aynı chunk yuvaları ≥ 6 blok ayrık', () => {
    const seed = seedsOf[2];
    for (let cx = -50; cx < 50; cx++) {
      for (let cz = -50; cz < 50; cz++) {
        const l = robotSlotsForChunk(seed, cx, cz);
        expect(l.length).toBeLessThanOrEqual(2);
        if (l.length === 2) expect(Math.abs(l[0].x - l[1].x) + Math.abs(l[0].z - l[1].z)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('şehir dışı chunk (uç) güvenle boş ya da geçerli döner; NaN/uç değerlerde atmaz', () => {
    const seed = seedsOf[0];
    [[-50, -50], [49, 49], [-50, 49], [49, -50]].forEach(([cx, cz]) => {
      expect(Array.isArray(robotSlotsForChunk(seed, cx, cz))).toBe(true);
    });
  });
});

describe('kapı önü', () => {
  it('yüzey yuvası bir cephe kapısının önünde (≤4 blok Manhattan) değildir (3 tohum)', async () => {
    const { lotAt } = await import('../cityLots.js');
    seedsOf.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      allSlots(seed, 50).filter((s) => s.layer === 'surface').forEach((s) => {
        const x = Math.floor(s.x);
        const z = Math.floor(s.z);
        for (let dz = -6; dz <= 6; dz++) {
          for (let dx = -6; dx <= 6; dx++) {
            const lot = lotAt(plan, x + dx, z + dz);
            if (!lot || !lot.door) continue;
            const fr = lot.door.front;
            expect(Math.abs(fr.x - x) + Math.abs(fr.z - z)).toBeGreaterThan(4);
          }
        }
      });
    });
  });
});
