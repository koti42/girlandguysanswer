import { describe, expect, it } from 'vitest';
import {
  localToWorld, seatExits, seatPlacement, yawOfProp,
} from './propSeat.js';
import { INTERIOR_BY_KEY, INTERIOR_DEFS } from './propDefsInterior.js';

const prop = (yaw, x, z) => ({
  id: 77, t: 0, x: x === undefined ? 10 : x, y: 64, z: z === undefined ? 20 : z, yaw, variant: 0, flags: 0,
});

describe('oturma geometrisi', () => {
  it('yawOfProp: prop ön yüzüne (yerel +Z) bakan oyuncu yaw değeri; bakış vektörü prop yönüyle eşleşir', () => {
    const fwd = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (let k = 0; k < 4; k++) {
      const y = yawOfProp(k);
      const look = [-Math.sin(y), -Math.cos(y)];
      expect(look[0]).toBeCloseTo(fwd[k][0], 9);
      expect(look[1]).toBeCloseTo(fwd[k][1], 9);
      expect(y).toBeGreaterThan(-Math.PI - 1e-9);
      expect(y).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });

  it('localToWorld three rotation.y eşlemesiyle aynı (x\' = x·cosθ + z·sinθ, z\' = −x·sinθ + z·cosθ)', () => {
    for (let k = 0; k < 4; k++) {
      const th = (k * Math.PI) / 2;
      const w = localToWorld(prop(k), 0.3, 0.9);
      expect(w[0]).toBeCloseTo(10 + 0.3 * Math.cos(th) + 0.9 * Math.sin(th), 9);
      expect(w[1]).toBeCloseTo(20 - 0.3 * Math.sin(th) + 0.9 * Math.cos(th), 9);
    }
  });

  it('seatPlacement: oturak yüksekliği, göz, poz; çok yerli koltukta oyuncuya en yakın yer', () => {
    const d = INTERIOR_BY_KEY.kanepe;
    const p = prop(0);
    const mid = seatPlacement(d, p, { x: 10, z: 20 });
    expect(mid.spot).toBe(0);
    expect(mid.y).toBeCloseTo(64 + d.seat.h, 9);
    const left = seatPlacement(d, p, { x: 8.5, z: 21 });
    const right = seatPlacement(d, p, { x: 11.5, z: 21 });
    expect(left.spot).toBe(-0.8);
    expect(right.spot).toBe(0.8);
    expect(left.x).toBeLessThan(mid.x);
    expect(right.x).toBeGreaterThan(mid.x);
    const bed = seatPlacement(INTERIOR_BY_KEY.yatak, p, null);
    expect(bed.pose).toBe('lie');
    expect(bed.pitch).toBeGreaterThan(0.3);
    expect(seatPlacement(INTERIOR_BY_KEY.masa, p, null)).toBeNull();
    expect(seatPlacement(null, p, null)).toBeNull();
  });

  it('tüm oturma tanımları: yer sonlu, ayak izi içinde; kalkış adayları ayak izinin dışında ve 4 tane', () => {
    INTERIOR_DEFS.filter((d) => d.seat).forEach((d) => {
      for (let k = 0; k < 4; k++) {
        const p = prop(k, 5.5, -3.25);
        const pl = seatPlacement(d, p, { x: 5.5, z: -3.25 });
        expect(Number.isFinite(pl.x + pl.y + pl.z + pl.yaw + pl.pitch + pl.eye), d.key).toBe(true);
        const hw = Math.max(d.size[0], d.size[2]) / 2 + 0.01;
        expect(Math.abs(pl.x - p.x)).toBeLessThanOrEqual(hw);
        expect(Math.abs(pl.z - p.z)).toBeLessThanOrEqual(hw);
        const ex = seatExits(d, p, pl);
        expect(ex.length).toBe(4);
        ex.forEach((e) => {
          expect(Number.isFinite(e.x + e.y + e.z)).toBe(true);
          expect(e.y).toBe(p.y);
          const dx = Math.abs(e.x - p.x);
          const dz = Math.abs(e.z - p.z);
          const hx = d.size[(k & 1) === 0 ? 0 : 2] / 2;
          const hz = d.size[(k & 1) === 0 ? 2 : 0] / 2;
          expect(dx > hx - 0.01 || dz > hz - 0.01, d.key).toBe(true);
        });
      }
    });
  });

  it('yatakta kalkış önce yandan; sandalyede önden', () => {
    const d = INTERIOR_BY_KEY.yatak;
    const p = prop(0);
    const ex = seatExits(d, p, seatPlacement(d, p, null));
    expect(Math.abs(ex[0].x - p.x)).toBeGreaterThan(d.size[0] / 2);
    const s = INTERIOR_BY_KEY.sandalye;
    const es = seatExits(s, p, seatPlacement(s, p, null));
    expect(es[0].z).toBeGreaterThan(p.z);
  });
});
