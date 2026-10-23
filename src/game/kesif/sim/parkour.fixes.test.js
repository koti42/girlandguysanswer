/*
 * Parkur: gerçek GPU oyun testinden çıkan düzeltmelerin regresyon testleri.
 *  1) Düşüş sıfırlama eşiği son kontrol noktasına değil KESİMİN en alçak platformuna göre: kademe 4-5'in çukur profili
 *     platformları son noktanın 7 blok altına indiriyordu, orada duran oyuncu anında geri ışınlanıyordu (kuantum tamamlanamıyordu).
 *  2) Kanca kısayolları: demir hedef platformun üstünde ve gerçek fizikte kullanılabilir (eskiden 30/30 kullanılamazdı).
 */
import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { makeCourse, parkourDynamics, parkourFallReset, segmentFloorY } from './parkour.js';
import { VANISH_STEP } from './parkourBuild.js';
import { simGrapple } from './parkourGrapple.js';

const params = (seed, tier, i) => ({
  seed, id: 'parkur:' + i + ',' + (i * 3), tier, zone: Math.min(4, tier - 1), cx: 100 + i * 64, cz: -200 + i * 64, floorY: 50 + (i % 9),
});

function blockWorld(course) {
  const map = new Map();
  course.blocks((x, y, z, id) => { map.set(x + ',' + y + ',' + z, id); });
  return { getBlock: (x, y, z) => map.get(x + ',' + y + ',' + z) || 0, map };
}

describe('düşüş sıfırlama: kesimin en alçak platformuna göre', () => {
  it('hiçbir platformun üstünde duran oyuncu geri ışınlanmaz (tüm kademeler)', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 14; i++) {
        const c = makeCourse(params(8100 + i * 211, tier, i));
        const L = c.platforms;
        let lastCp = -1;
        for (let k = 0; k < L.length; k++) {
          while (lastCp + 1 < c.checkpoints.length && c.checkpoints[lastCp + 1].index <= k) lastCp++;
          const q = L[k];
          const pos = { x: (q.x0 + q.x1 + 1) / 2, y: q.y + 1, z: (q.z0 + q.z1 + 1) / 2 };
          expect(parkourFallReset(c, pos, lastCp), 'kademe ' + tier + ' #' + i + ' platform ' + k + ' lastCp ' + lastCp).toBeNull();
        }
      }
    }
  });

  it('çukur profilli kademe 5: bir önceki kontrol noktasındayken de sonraki kesimin platformları sıfırlamaz', () => {
    let dipped = 0;
    for (let i = 0; i < 10; i++) {
      const c = makeCourse(params(4000 + i * 977, 5, i));
      c.checkpoints.forEach((cp, ci) => {
        const floor = segmentFloorY(c, ci);
        if (cp.y - floor > c.fallMargin) dipped++;
        // kesimin tabanının hemen altı (marj içi) hâlâ sıfırlamaz; marjın dışı sıfırlar
        const x = cp.x + 0.5;
        expect(parkourFallReset(c, { x, y: floor - c.fallMargin + 0.1, z: cp.z + 0.5 }, ci)).toBeNull();
        const r = parkourFallReset(c, { x, y: floor - c.fallMargin - 0.5, z: cp.z + 0.5 }, ci);
        expect(r).toBeTruthy();
        expect(r.y).toBe(cp.y);
      });
    }
    expect(dipped).toBeGreaterThan(0); // test gerçekten çukurlu parkurları kapsıyor
  });

  it('gerçek düşüş (kesim tabanının çok altı) hâlâ son noktaya döndürür; başlangıçta başlangıç plakasına', () => {
    const c = makeCourse(params(8, 3, 1));
    const low = { x: c.start.x + 0.5, y: segmentFloorY(c, -1) - 10, z: c.start.z + 0.5 };
    const r = parkourFallReset(c, low, -1);
    expect(r).toEqual({ x: c.start.x + 0.5, y: c.start.y, z: c.start.z + 0.5 });
    expect(parkourFallReset(c, { x: 5000, y: 0, z: 5000 }, -1)).toBeNull(); // alan dışı
  });
});

/** t anında dinamik platformun görünür olup olmadığı (parkourDynamics ile aynı kaynak). */
function visibleAt(course, index, t) {
  const cell = course.dynamics.find((d) => d.index === index).cells[0];
  const hit = parkourDynamics(course, t).find((c) => c.x === cell.x && c.y === cell.y && c.z === cell.z);
  return hit.id !== 0;
}

/** İki platformun KESİNTİSİZ ortak görünme süresinin (bir döngü boyunca) en uzunu, sn. */
function bestOverlap(course, i, j) {
  let best = 0;
  let run = 0;
  for (let t = 0; t < 8; t += 0.02) {
    if (visibleAt(course, i, t) && visibleAt(course, j, t)) {
      run += 0.02;
      if (run > best) best = run;
    } else run = 0;
  }
  return best;
}

describe('yok olan platformlar: ardışık çiftler insan için yapılabilir pencerede', () => {
  it('komşu (ardışık dizin) iki yok olan platformun ortak görünme penceresi >= 1,5 sn', () => {
    let pairs = 0;
    let worst = 99;
    for (const tier of [3, 4, 5]) {
      for (let i = 0; i < 40; i++) {
        const c = makeCourse(params(5100 + i * 313, tier, i));
        const idx = c.dynamics.map((d) => d.index);
        for (let k = 1; k < idx.length; k++) {
          if (idx[k] !== idx[k - 1] + 1) continue;
          pairs++;
          const ov = bestOverlap(c, idx[k - 1], idx[k]);
          worst = Math.min(worst, ov);
          expect(ov, 'kademe ' + tier + ' #' + i + ' ' + idx[k - 1] + '→' + idx[k]).toBeGreaterThanOrEqual(1.5);
        }
      }
    }
    expect(pairs).toBeGreaterThan(40); // ardışık çiftler gerçekten üretiliyor
    expect(worst).toBeGreaterThan(1.5);
  });

  it('görünme başlangıçları art arda VANISH_STEP sn arayla dizilir (dalga); döngü 3,9 sn, görünür 2,6 sn', () => {
    const c = makeCourse(params(5100, 4, 3));
    expect(c.dynamics.length).toBeGreaterThan(3);
    c.dynamics.forEach((d, n) => {
      expect(d.on).toBe(2.6);
      expect(d.off).toBe(1.3);
      const start = (3.9 - d.phase) % 3.9;
      const want = (n * VANISH_STEP) % 3.9;
      expect(Math.abs(start - want) < 0.01 || Math.abs(Math.abs(start - want) - 3.9) < 0.01).toBe(true);
    });
  });
});

describe('kanca kısayolları gerçek fizikte kullanılabilir', () => {
  it('kademe 4-5: her kısayol A platformundan kancayla hedef taş platforma inip durur', () => {
    let total = 0;
    for (const tier of [4, 5]) {
      for (let i = 0; i < 8; i++) {
        const c = makeCourse(params(4000 + i * 977, tier, i));
        const w = blockWorld(c);
        expect(c.grapple.length, 'kademe ' + tier + ' #' + i).toBeGreaterThan(0);
        c.grapple.forEach((g) => {
          total++;
          expect(w.map.get(g.x + ',' + g.y + ',' + g.z)).toBe(B.AMETHYST);
          const tgt = c.platforms[g.to];
          expect(tgt.kind).toBe('stone');
          // demir hedef platformun hemen üstünde (boşluğun ortasında değil)
          expect(g.x).toBeGreaterThanOrEqual(tgt.x0 - 3);
          expect(g.x).toBeLessThanOrEqual(tgt.x1 + 3);
          expect(g.z).toBeGreaterThanOrEqual(tgt.z0 - 3);
          expect(g.z).toBeLessThanOrEqual(tgt.z1 + 3);
          expect(g.y - (tgt.y + 1)).toBeGreaterThanOrEqual(2);
          expect(g.y - (tgt.y + 1)).toBeLessThanOrEqual(5);
          const r = simGrapple(w, c.platforms, g.from, g.to, g);
          expect(r.ok, 'kademe ' + tier + ' #' + i + ' ' + g.from + '→' + g.to).toBe(true);
        });
      }
    }
    expect(total).toBeGreaterThan(20);
  });

  it('eski yerleşim (demir iki platformun ortasında) kullanılamaz: test kanıtı yakalar', () => {
    const c = makeCourse(params(4000, 4, 0));
    const w = blockWorld(c);
    const g = c.grapple[0];
    const A = c.platforms[g.from];
    const Bp = c.platforms[g.to];
    const mid = {
      x: Math.round(((A.x0 + A.x1) / 2 + (Bp.x0 + Bp.x1) / 2) / 2), y: Math.max(A.y, Bp.y) + 5, z: Math.round(((A.z0 + A.z1) / 2 + (Bp.z0 + Bp.z1) / 2) / 2),
    };
    w.map.set(mid.x + ',' + mid.y + ',' + mid.z, B.AMETHYST);
    expect(simGrapple(w, c.platforms, g.from, g.to, mid).ok).toBe(false);
  });
});
