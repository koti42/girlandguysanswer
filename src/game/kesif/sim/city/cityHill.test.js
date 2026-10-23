import { describe, expect, it } from 'vitest';
import { HILL_LEVELS, HILL_RISE, HILL_STEP, buildHill, hillSurfaceY } from './cityHill.js';
import { getCityPlan, groundY } from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';

/** Oyuncu yürüyüş modeli: komşu hücreye adım ≤ +1 yukarı (otomatik basamak/zıplama), düşüş ≤ 3. */
function reachable(hill, startX, startZ) {
  const r = hill.rect;
  const seen = new Map();
  const key = (x, z) => x + ',' + z;
  const st = [[startX, startZ]];
  seen.set(key(startX, startZ), hillSurfaceY(hill, startX, startZ));
  while (st.length) {
    const [x, z] = st.pop();
    const y = seen.get(key(x, z));
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < r.x0 || nx >= r.x1 || nz < r.z0 || nz >= r.z1) return;
      if (seen.has(key(nx, nz))) return;
      const ny = hillSurfaceY(hill, nx, nz);
      if (ny - y > 1 || y - ny > 3) return;
      seen.set(key(nx, nz), ny);
      st.push([nx, nz]);
    });
  }
  return seen;
}

describe('tepe terası', () => {
  it('sabitler: 4 teras, 12 blok yükseliş, 6 blok geri çekilme; zirve y=112 (64+48)', () => {
    expect(HILL_LEVELS).toBe(4);
    expect(HILL_RISE).toBe(12);
    expect(HILL_STEP).toBe(6);
    const h = buildHill({ x0: 0, z0: 0, x1: 68, z1: 64 }, 0, 0);
    expect(h.maxY).toBe(112);
    expect(h.levels.map((l) => l.y)).toEqual([76, 88, 100, 112]);
    expect(h.levels.map((l) => l.inset)).toEqual([6, 12, 18, 24]);
    expect(h.top).toMatchObject({ x0: 24, z0: 24, x1: 44, z1: 40, y: 112 });
    expect(h.stairs.length).toBe(4);
    expect(h.stairs.map((s) => s.side)).toEqual(['s', 'e', 'n', 'w']);
  });

  it('yürünebilirlik (200 tohum): zemin halkasından zirveye adım ≤+1 ile çıkılır; tüm teras yüzeyleri ve basamaklar erişilir', () => {
    for (let i = 0; i < 200; i++) {
      const plan = getCityPlan(citySeed(i));
      const hill = plan.hill;
      const r = hill.rect;
      expect(r.x1 - r.x0).toBeGreaterThanOrEqual(60);
      expect(r.z1 - r.z0).toBeGreaterThanOrEqual(60);
      const start = [r.x0, r.z0]; // zemin halkası köşesi, y=64
      expect(hillSurfaceY(hill, start[0], start[1])).toBe(64);
      const seen = reachable(hill, start[0], start[1]);
      // zirve merkezine ulaşıldı
      const tx = Math.floor(hill.top.x);
      const tz = Math.floor(hill.top.z);
      if (seen.get(tx + ',' + tz) !== 112) throw new Error('zirveye çıkılamıyor: seed#' + i);
      // her teras yüzeyi (halka) ve her basamak hücresi erişilir
      for (let z = r.z0; z < r.z1; z++) {
        for (let x = r.x0; x < r.x1; x++) {
          if (!seen.has(x + ',' + z)) throw new Error('erişilemeyen hücre ' + x + ',' + z + ' seed#' + i);
        }
      }
      // basamaklar tam 12 adım, her adım +1
      hill.stairs.forEach((s) => {
        const ys = [];
        for (let z = s.z0; z < s.z1; z++) for (let x = s.x0; x < s.x1; x++) ys.push(hillSurfaceY(hill, x, z));
        const uniq = Array.from(new Set(ys)).sort((a, b) => a - b);
        expect(uniq.length).toBe(12);
        expect(uniq[0]).toBe(s.y0 + 1);
        expect(uniq[11]).toBe(s.y1);
        for (let q = 1; q < uniq.length; q++) expect(uniq[q] - uniq[q - 1]).toBe(1);
      });
    }
  });

  it('hillSurfaceY: blok dışı NaN; halkalar sabit yükseklik; groundY tepe/sokak/tünel/kanal', () => {
    const seed = citySeed(1);
    const plan = getCityPlan(seed);
    const r = plan.hill.rect;
    expect(Number.isNaN(hillSurfaceY(plan.hill, r.x0 - 1, r.z0))).toBe(true);
    expect(Number.isNaN(hillSurfaceY(plan.hill, r.x1, r.z1))).toBe(true);
    expect(groundY(seed, r.x0 + 1, r.z0 + 1)).toBe(64);
    expect(groundY(seed, plan.hill.top.x, plan.hill.top.z)).toBe(112);
    expect(groundY(seed, 100, 100)).toBe(64);
    expect(groundY(seed, 0.5, 0.5)).toBe(56);
    expect(groundY(seed, 3, 75)).toBeGreaterThan(59);
    expect(groundY(seed, 3, 75)).toBeLessThan(64);
    expect(groundY(seed, 50, 560)).toBe(44);
  });
});
