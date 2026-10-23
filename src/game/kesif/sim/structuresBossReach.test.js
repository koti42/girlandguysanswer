/*
 * Boss arenası: kapıya DIŞARIDAN ulaşılır (gerçek dünya blokları üzerinde BFS).
 * Gerçek GPU oyun testinde tohum başına arenaların ~%50'si kapalıydı: giriş rampası dünya merkezine (çapraz) oyuluyor, kapı/yol
 * ise eksene hizalıydı; engebeli arazide yol, oyulmuş kanyondan çıkıp kayaya giriyordu. Ayrıca rampa göl/uçurum üstüne çıkabiliyordu.
 * Mevcut test yalnız girişten merkeze yürüyordu (arena içi) — dışarıyla bağlantıyı denetlemiyordu.
 */
import { describe, expect, it } from 'vitest';
import { bossRampRise } from './structuresBoss.js';
import { structuresInRegion } from './structures.js';
import { isPassable, isSolidId, makeWorldGet } from './structuresTestKit.js';

const RAMP = 36;
const SEEDS = [2, 3, 4, 5, 6, 9, 11, 12];

function escapeDistance(W, a) {
  const R = a.boss.radius;
  const e = a.boss.entrance;
  const open = (id) => isPassable(id);
  const stand = (x, y, z) => open(W.get(x, y, z)) && open(W.get(x, y + 1, z)) && isSolidId(W.get(x, y - 1, z));
  let sy = null;
  for (let dy = 3; dy >= -4; dy--) if (stand(e.x, e.y + dy, e.z)) { sy = e.y + dy; break; }
  if (sy === null) return -1;
  const seen = new Set([e.x + ',' + sy + ',' + e.z]);
  const q = [[e.x, sy, e.z]];
  let maxD = 0;
  let head = 0;
  const box = { x0: a.x - 130, x1: a.x + 130, z0: a.z - 130, z1: a.z + 130 };
  while (head < q.length && seen.size < 250000) {
    const [x, y, z] = q[head++];
    const d = Math.hypot(x - a.x, z - a.z);
    if (d > maxD) maxD = d;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (nx < box.x0 || nx > box.x1 || nz < box.z0 || nz > box.z1) continue;
      if (Math.hypot(nx - a.x, nz - a.z) < R + 1) continue; // arena içine girme (kapı kapalı)
      for (let dy = 1; dy >= -3; dy--) {
        const ny = y + dy;
        if (dy === 1 && !open(W.get(x, y + 2, z))) continue;
        if (!stand(nx, ny, nz)) continue;
        const k = nx + ',' + ny + ',' + nz;
        if (seen.has(k)) break;
        seen.add(k);
        q.push([nx, ny, nz]);
        break;
      }
    }
  }
  return maxD;
}

describe('boss arenası: kapıya dışarıdan ulaşılır', () => {
  // faz kapısı (qa_p2): tohum başına ayrı it (yük altında tek 53 sn senkron blok vitest RPC zaman aşımına düşüyordu); doğrulamalar aynı
  SEEDS.forEach((seed) => {
    it('girişten başlayan yürüyüş rampa + 8 blok ötesine (doğal araziye) çıkar (tohum ' + seed + ')', () => {
      const bad = [];
      const list = structuresInRegion(seed, -1500, -1500, 1500, 1500).filter((s2) => s2.type === 'bossarena');
      expect(list.length, 'tohum ' + seed).toBe(4);
      const W = makeWorldGet(seed);
      for (const a2 of list) {
        const need = a2.boss.radius + 3 + RAMP + 8;
        const got = escapeDistance(W, a2);
        if (got < need) bad.push('tohum ' + seed + ' bölge ' + a2.zone + ' ulaşılan ' + Math.round(got) + ' < ' + need);
      }
      W.clear();
      expect(bad, bad.join(' | ')).toEqual([]);
    }, 900000);
  });

  it('rampa sabit eğimlidir ve ±0,5 ile sınırlı; yol doğal araziyle aynı hizaya iner', () => {
    for (const seed of [3, 4]) {
      structuresInRegion(seed, -1500, -1500, 1500, 1500).filter((s) => s.type === 'bossarena').forEach((a) => {
        const k = bossRampRise(seed, { x: a.x, z: a.z }, a.boss.radius + 3, a.y - 1);
        expect(Math.abs(k)).toBeLessThanOrEqual(0.5);
        expect(Math.round(k * 8)).toBeCloseTo(k * 8, 6); // 1/8 adım
      });
    }
  });
});
