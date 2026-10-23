/*
 * Hücre düzeyinde yürünebilirlik (soyut yaya ağından bağımsız ikinci doğrulama): varış noktası (0.5, 64, 2.5)'ten başlayarak plandaki tüm yer
 * seviyesindeki ilgi noktalarına AYAKLA ulaşılabilmeli. Katı: bina ayak izi (kademe/parça), kıyı dışı, kanal suyu (köprü tabliyesi yürünür),
 * açık tünel hendeği (tünel girişi yol seviyesindedir, meydandan duvarla ayrılır). Tepe terası: basamak kuralı ≤ +1.
 */
import { describe, expect, it } from 'vitest';
import { getCityPlan, planBuilding, pois } from './cityPlan.js';
import { allLots } from './cityLots.js';
import { hillSurfaceY } from './cityHill.js';
import { SURF, surfaceAt, tunnelAt } from './cityRoads.js';
import { citySeed } from './cityPlanTestKit.js';

const N = 1460;
const O = 730;

function build(seed) {
  const plan = getCityPlan(seed);
  const solid = new Uint8Array(N * N);
  const idx = (x, z) => (z + O) * N + (x + O);
  const mark = (x0, z0, x1, z1) => {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) solid[idx(x, z)] = 1;
  };
  allLots(plan).forEach((l) => {
    if (l.hill) return;
    const bp = planBuilding(seed, l);
    bp.tiers.forEach((t) => {
      if (t.f0 === 0) mark(t.x0, t.z0, t.x0 + t.w, t.z0 + t.d);
    });
  });
  const hr = plan.hill.rect;
  const y = new Float32Array(N * N).fill(64);
  for (let z = -O; z < O; z++) {
    for (let x = -O; x < O; x++) {
      const i = idx(x, z);
      const s = surfaceAt(plan.roads, x, z);
      if (s === SURF.EDGE || s === SURF.WATER) solid[i] = 1;
      else if (tunnelAt(plan.roads, x, z) === 1) solid[i] = 1;
      if (x >= hr.x0 && x < hr.x1 && z >= hr.z0 && z < hr.z1) y[i] = hillSurfaceY(plan.hill, x, z);
    }
  }
  return { plan, solid, y, idx };
}

function bfs(world, sx, sz) {
  const { solid, y, idx } = world;
  const seen = new Uint8Array(N * N);
  const queue = new Int32Array(N * N);
  let head = 0;
  let tail = 0;
  const s = idx(sx, sz);
  seen[s] = 1;
  queue[tail++] = s;
  while (head < tail) {
    const c = queue[head++];
    const cx = (c % N) - O;
    const cz = Math.floor(c / N) - O;
    for (let d = 0; d < 4; d++) {
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const nz = cz + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < -O || nx >= O || nz < -O || nz >= O) continue;
      const n = idx(nx, nz);
      if (seen[n] || solid[n]) continue;
      if (y[n] - y[c] > 1 || y[c] - y[n] > 3) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  return seen;
}

describe('hücre düzeyinde yürünebilirlik (4 tohum)', () => {
  it('varış noktasından 16 terminale, tüm kapı önlerine, grafiti/çip/park yeri/meydan POI’lerine ayakla ulaşılır', () => {
    for (let i = 0; i < 4; i++) {
      const seed = citySeed(i * 17);
      const world = build(seed);
      const { plan, idx } = world;
      expect(world.solid[idx(0, 2)]).toBe(0);
      const seen = bfs(world, 0, 2);
      const reach = (x, z, what) => {
        const cx = Math.floor(x);
        const cz = Math.floor(z);
        if (!seen[idx(cx, cz)]) throw new Error('ulaşılamıyor: seed#' + i + ' ' + what + ' @' + cx + ',' + cz);
      };
      plan.terminals.forEach((t, k) => {
        // terminal hücresinin kendisi propla dolu olabilir; komşu hücrelerden biri erişilir olmalı
        const cx = Math.floor(t.x);
        const cz = Math.floor(t.z);
        let ok = false;
        for (let dz = -2; dz <= 2 && !ok; dz++) for (let dx = -2; dx <= 2 && !ok; dx++) if (seen[idx(cx + dx, cz + dz)]) ok = true;
        if (!ok) throw new Error('terminal ' + k + ' yanına ulaşılamıyor seed#' + i);
      });
      pois(seed).forEach((p) => {
        if (p.type === 'door') reach(p.x, p.z, 'kapı önü lot ' + p.lot);
        else if (p.type === 'graffiti') reach(p.x, p.z, 'grafiti');
        else if (p.type === 'chip' && (p.kind === 'kapi' || p.kind === 'park')) reach(p.x, p.z, 'çip ' + p.kind);
        else if (p.type === 'photo_spot' && p.y === 64) reach(p.x, p.z, 'foto noktası');
        else if (p.type === 'park_slot') reach(p.x, p.z, 'park yeri');
        else if (p.type === 'rental' || p.type === 'courier_desk') reach(p.x, p.z, p.type);
        else if (p.type === 'roof_start') reach(p.x, p.z, 'çatı parkuru başlangıcı');
      });
      // Tepe Terası zirvesi
      const t15 = plan.terminals[15];
      expect(seen[idx(Math.floor(t15.x), Math.floor(t15.z))] || seen[idx(Math.floor(t15.x) + 1, Math.floor(t15.z))]).toBe(1);
    }
  }, 120000);

  it('Kapı Meydanı: 33×33 merkez karesi tamamen yürünebilir ve varış noktasından erişilir; terminal çevresinde ≥4 blok boşluk', () => {
    const seed = citySeed(9);
    const world = build(seed);
    const seen = bfs(world, 0, 2);
    for (let z = -16; z <= 16; z++) {
      for (let x = -16; x <= 16; x++) {
        const k = world.idx(x, z);
        expect(world.solid[k]).toBe(0);
        expect(seen[k]).toBe(1);
      }
    }
  }, 60000);
});
