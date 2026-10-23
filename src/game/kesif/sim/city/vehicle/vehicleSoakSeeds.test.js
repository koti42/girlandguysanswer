/*
 * QA5-A2: vehicleCity.test.js soak'u 3 tohumla kosar ve 'sansa' yesil kalabiliyordu (tohum sayisi artinca katida kalma ornekleri cikiyordu).
 * Kok nedenler (hepsi bu dosyadaki 40 tohum x 6 sinif x 2 bolge taramasiyla yakalanir):
 *   1) obbFree (yClimb ile) collider/prop engellerinde y+0,3 payi kullaniyordu; fizik (resolveObb) en yuksek tekerlek temasindan (gTop) sayar → bir tekerlegi kaldirimda olan arac
 *      onundeki alcak prop'a 'gomulu' raporlaniyordu (taksi/Gece9/tohum 5: 3,5 sn kalici).
 *   2) verticalStep govdeyi cozumden SONRA oynatir; yukselen/alcalan arac (ozellikle sulzulen hop) bir kare engele gomulu kaliyordu → ayni adimda yeniden cozulur.
 *   3) yuklenmemis (null) hucreler 'tam kati' olmali (vehicleCollide.test) ama basamak payi (>=1,05; hover 1,1; gTop egik) ile asilip uretilmemis alana girilebiliyordu.
 */
import { describe, expect, it } from 'vitest';
import { VEHICLE_DEFS } from './vehicleData.js';
import { createVehicle, findFreePose, stepVehicle } from './vehiclePhysics.js';
import { obbFree } from './vehicleWorld.js';
import { cityWorld, makeRng } from './vehicleTestKit.js';

const DT = 1 / 60;
const CLASSES = ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'];
const REGIONS = [
  { name: 'Merkez/Konteyner (4242)', seed: 4242, cx: [-14, -1], cz: [-14, -1], cxm: -120, czm: -120 },
  { name: 'Gece Pazari (9)', seed: 9, cx: [20, 31], cz: [4, 15], cxm: 400, czm: 130 },
];
const SEEDS = 40;
const SECS = 40;

REGIONS.forEach((R) => {
  describe('soak ' + R.name, () => {
    it(SEEDS + ' tohum x 6 sinif x ' + SECS + ' sn: katida kalma yok (her 0,5 sn ornek), uretilmemis alana >1 m girilmez', () => {
      const { world, layer } = cityWorld(R.seed, R.cx, R.cz);
      const x0 = R.cx[0] * 16;
      const x1 = (R.cx[1] + 1) * 16;
      const z0 = R.cz[0] * 16;
      const z1 = (R.cz[1] + 1) * 16;
      let inSolid = 0;
      let outside = 0;
      let checks = 0;
      const bad = [];
      for (let seed = 0; seed < SEEDS; seed++) {
        CLASSES.forEach((cls, ci) => {
          const rng = makeRng(1000 * seed + ci + 5);
          const start = findFreePose(world, VEHICLE_DEFS[cls], R.cxm + (rng() - 0.5) * 60, 64, R.czm + (rng() - 0.5) * 60, rng() * 6.28, { maxR: 16 });
          const v = createVehicle(cls, { x: start.x, y: start.y, z: start.z, yaw: start.yaw });
          let throttle = 1;
          let steer = 0;
          let hb = false;
          let nitro = false;
              for (let i = 0; i < SECS * 60; i++) {
            if (i % 45 === 0) {
              steer = (rng() - 0.5) * 2;
              throttle = rng() < 0.85 ? 0.4 + rng() * 0.6 : 0;
              hb = rng() < 0.08;
              nitro = rng() < 0.25;
            }
            stepVehicle(v, { steer, throttle, brake: throttle === 0 ? 0.8 : 0, handbrake: hb, nitro, hop: rng() < 0.02, steerDirect: true }, world, DT, { wet: (i % 1200) / 1200 });
            if (v.x < x0 - 1 || v.x > x1 + 1 || v.z < z0 - 1 || v.z > z1 + 1) { outside++; if (bad.length < 8) bad.push('OUT ' + cls + ' s' + seed + ' i' + i + ' ' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2) + ' gTop' + v.gTop.toFixed(2) + ' og' + v.onGround); }
            if (i % 30 === 0) {
              checks++;
              if (v.wedgeT === 0 && !obbFree(world, layer.colliders, v.x, v.y, v.z, v.yaw, v.def, v.propId, v.def.step[1] + 0.1, v.def.hover > 0 ? v.y : v.gTop)) {
                inSolid++;
                if (bad.length < 5) bad.push(cls + ' s' + seed + ' i' + i);
              }
            }
          }
        });
      }
      expect(checks).toBeGreaterThan(SEEDS * 6 * SECS * 2 - 10);
      expect(bad).toEqual([]);
      expect(inSolid).toBe(0);
      expect(outside).toBe(0);
    }, 120000);
  });
});
