/*
 * Anahtar Tapınağı çıkış bacası: sarmaşık sütunu açık gökyüzüne/yüzeye çıkar.
 * Gerçek GPU oyun testinde (tohum başına tapınakların ~%20'si) baca ağzı, kule terasının dolgusu ya da 3B arazi çıkıntısı altında
 * kalıyordu: oyuncu sunaktan sonra tapınaktan çıkamıyordu. Baca zemin yüksekliğini heightAt'tan alıyor, teras dolgusunu görmüyordu.
 */
import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import { structuresInRegion } from './structures.js';
import { isPassable, isSolidId, makeWorldGet } from './structuresTestKit.js';

const SEEDS = [3057011836, 1, 2, 3, 4];

/** Sarmaşık sütununun en üst hücresi (sunak yanından yukarı kesintisiz). */
function vineTop(W, t) {
  const ex = t.exit;
  let y = t.altar.y + 1;
  if (W.get(ex.x, y, ex.z) !== B.VINE) return null;
  while (W.get(ex.x, y + 1, ex.z) === B.VINE) y++;
  return y;
}

/** Üst hücreden yatayda ≥3 blok uzaklıkta ayakta durulabilir bir yüzey hücresine yürünebilir mi (yukarı +1, aşağı ≤3). */
function escapesSideways(W, ex, topY) {
  const open = (x, y, z) => isPassable(W.get(x, y, z));
  const stand = (x, y, z) => open(x, y, z) && open(x, y + 1, z) && isSolidId(W.get(x, y - 1, z));
  const seen = new Set([ex.x + ',' + topY + ',' + ex.z]);
  const q = [[ex.x, topY, ex.z]];
  let head = 0;
  while (head < q.length && seen.size < 6000) {
    const [x, y, z] = q[head++];
    if (Math.hypot(x - ex.x, z - ex.z) >= 3 && stand(x, y, z)) return true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const nz = z + dz;
      if (Math.abs(nx - ex.x) > 8 || Math.abs(nz - ex.z) > 8) continue;
      for (let dy = 1; dy >= -3; dy--) {
        const ny = y + dy;
        if (dy === 1 && !open(x, y + 2, z)) continue;
        if (!stand(nx, ny, nz)) continue;
        const k = nx + ',' + ny + ',' + nz;
        if (seen.has(k)) break;
        seen.add(k);
        q.push([nx, ny, nz]);
        break;
      }
    }
  }
  return false;
}

describe('anahtar tapınağı: çıkış bacası', () => {
  it('çok tohumlu: sarmaşık sütununun üstü açık ve yüzeye yürünür', () => {
    let total = 0;
    const bad = [];
    for (const seed of SEEDS) {
      const W = makeWorldGet(seed);
      const list = structuresInRegion(seed, -2600, -2600, 2600, 2600).filter((s) => s.type === 'anahtartapinagi');
      expect(list.length, 'tohum ' + seed).toBeGreaterThanOrEqual(10);
      for (const t of list) {
        total++;
        const top = vineTop(W, t);
        if (top === null) { bad.push(seed + ' ' + t.id + ': sarmaşık yok'); continue; }
        const above = W.get(t.exit.x, top + 1, t.exit.z);
        if (isSolidId(above)) { bad.push(seed + ' ' + t.id + ': baca ağzı kapalı (üstte katı blok y=' + (top + 1) + ')'); continue; }
        if (!escapesSideways(W, t.exit, top)) bad.push(seed + ' ' + t.id + ': baca ağzından yüzeye yürünemiyor');
      }
      W.clear();
    }
    expect(total).toBeGreaterThan(50);
    expect(bad, bad.join(' | ')).toEqual([]);
  }, 900000);
});
