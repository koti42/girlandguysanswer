/*
 * Anahtar Tapınağı: bulmaca odaları gerçek dünyada EKSİKSİZ çizilir (her chunk kesiti).
 * Gerçek GPU oyun testinde derin salon (hareketli platform, zorluk 4–5: derinlik 35+) tapınakta son 3 satırı çizilmeden kalıyordu:
 * chunk kesiti oda origin'inden >30 blok uzaktaysa oda o kesit için hiç kurulmuyordu (sabit ±30 penceresi); bitiş adası/plaka yoktu.
 * Bu test odayı bağımsız (temiz) kurar ve gerçek dünyadaki İÇ HACİM bloklarını hücre hücre karşılaştırır (kabuk, koridor/komşu
 * yapı kesişimlerinde birkaç hücre farklı olabilir; oynanış iç hacimdedir).
 */
import { describe, expect, it } from 'vitest';
import { structuresInRegion } from './structures.js';
import { buildPuzzleRoom, getPuzzle, roomBounds } from './puzzles/index.js';
import { makeWorldGet } from './structuresTestKit.js';

const SEEDS = [3057011836, 1];

describe('tapınak odaları eksiksiz çizilir', () => {
  it('her bulmaca odası: temiz kurulumla gerçek dünya blokları birebir (derin odalar dahil)', () => {
    let rooms = 0;
    let deep = 0;
    const bad = [];
    for (const seed of SEEDS) {
      const W = makeWorldGet(seed);
      const list = structuresInRegion(seed, -2600, -2600, 2600, 2600).filter((s) => s.type === 'anahtartapinagi');
      for (const t of list) {
        for (const p of t.puzzles) {
          rooms++;
          const clean = new Map();
          buildPuzzleRoom({
            id: p.id, type: p.type, origin: p.origin, facing: p.facing, difficulty: p.difficulty, zone: p.zone === undefined ? t.zone : p.zone,
          }, { seed, setBlock: (x, y, z, id) => { clean.set(x + ',' + y + ',' + z, id); } });
          const fp = getPuzzle(p.type).footprint(p.difficulty);
          const inn = roomBounds(p.origin, p.facing, fp, fp.margin === undefined ? 2 : fp.margin).inner;
          let miss = 0;
          let far = 0;
          clean.forEach((id, k) => {
            const q = k.split(',');
            const qx = Number(q[0]);
            const qy = Number(q[1]);
            const qz = Number(q[2]);
            if (qx < inn.x0 || qx > inn.x1 || qz < inn.z0 || qz > inn.z1 || qy < inn.y0 || qy > inn.y1) return;
            if (W.get(qx, qy, qz) !== id) {
              miss++;
              if (Math.abs(Number(q[0]) - p.origin.x) + Math.abs(Number(q[2]) - p.origin.z) > 30) far++;
            }
          });
          if (far > 0) deep++;
          if (miss > 0) bad.push(seed + ' ' + p.id + ' ' + p.type + ' d' + p.difficulty + ': ' + miss + ' hücre farklı (origin\'den >30 blokta ' + far + ')');
        }
      }
      W.clear();
    }
    expect(rooms).toBeGreaterThan(40);
    expect(bad, bad.slice(0, 8).join(' | ')).toEqual([]);
    void deep;
  }, 1200000);
});
