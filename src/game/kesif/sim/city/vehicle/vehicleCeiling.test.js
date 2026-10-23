import { describe, expect, it } from 'vitest';
import { createVehicle, stepVehicle } from './vehiclePhysics.js';
import { cityWorld } from './vehicleTestKit.js';

/*
 * QA4-007: dünya duvarı = sınır dışı hücreler BEDROCK (y ≤ yMax). Hover/süzülen araçların yüksek basamak payı bu duvarı TIRMANIP y=363'e çıkıyor ve duvarın tepesinde (y > yMax: hava,
 * altı sonsuz BEDROCK düzlemi) dünya dışına |z| > 1500'e sürüyordu. Düzeltme: araç konumu dünya sınırına (bounds) kenetlenir; sınır içinde kalır.
 */
describe('araç dünya sınırı: duvar tırmanılıp dışına çıkılmaz (QA4-007)', () => {
  ['suzulkay', 'hoverbike', 'spor', 'motor'].forEach((cls) => {
    it(cls + ': sınıra tam gaz (kuzey kenarı) 40 sn: |z| ≤ sınır ve y ≤ yMax − 1', () => {
      const { world } = cityWorld(7771, [-2, 2], [-52, -45]);
      const b = world.bounds;
      const zMin = b.minCz * 16;
      for (let cx = -2; cx <= 2; cx++) for (let cz = b.minCz; cz <= b.minCz + 4; cz++) world.ensureChunk(cx, cz);
      const v = createVehicle(cls, { x: 1.7, y: 64, z: zMin + 40, yaw: 0 });
      let maxY = -1e9;
      let minZ = 1e9;
      for (let i = 0; i < 60 * 40; i++) {
        stepVehicle(v, { throttle: 1, steer: 0, nitro: false }, world, 1 / 60, {});
        maxY = Math.max(maxY, v.y);
        minZ = Math.min(minZ, v.z);
      }
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
      expect(minZ).toBeGreaterThanOrEqual(zMin - 0.5);
      expect(maxY).toBeLessThan(world.yMax - 1);
    });
  });
});
