import { describe, expect, it } from 'vitest';
import { angleBetween, arcControlPoint, latLngToVector3 } from './geo';
import { NODES } from './constants';

const len = (v) => Math.hypot(v.x, v.y, v.z);

describe('latLngToVector3', () => {
    it('kutuplar ve ekvator', () => {
        expect(latLngToVector3(90, 0).y).toBeCloseTo(1);
        expect(latLngToVector3(-90, 0).y).toBeCloseTo(-1);
        const eq = latLngToVector3(0, 0);
        expect(eq.y).toBeCloseTo(0);
        expect(len(eq)).toBeCloseTo(1);
    });

    it('tüm düğümler birim küre üzerinde ve birbirinden farklı', () => {
        const seen = new Set();
        for (const n of NODES) {
            const v = latLngToVector3(n.lat, n.lng);
            expect(len(v)).toBeCloseTo(1, 6);
            const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });

    it('kuzey yarımküre +y, güney −y', () => {
        expect(latLngToVector3(41, 29).y).toBeGreaterThan(0);
        expect(latLngToVector3(-33, 151).y).toBeLessThan(0);
    });
});

describe('yaylar', () => {
    it('uzun hat daha yüksekten geçer', () => {
        const ist = latLngToVector3(41.01, 28.98);
        const fra = latLngToVector3(50.11, 8.68);
        const syd = latLngToVector3(-33.87, 151.21);
        expect(angleBetween(ist, syd)).toBeGreaterThan(angleBetween(ist, fra));
        expect(len(arcControlPoint(ist, syd))).toBeGreaterThan(len(arcControlPoint(ist, fra)));
        expect(len(arcControlPoint(ist, fra))).toBeGreaterThan(1);
    });
});
