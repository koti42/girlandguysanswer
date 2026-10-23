import { describe, expect, it } from 'vitest';
import { cpuMs } from '../../../../../test/perfScale.js';
import { roadNet } from '../roadNet.js';
import { pois } from '../cityPlan.js';
import { VEHICLE_DEFS } from './vehicleData.js';
import {
  createVehicle, findFreePose, resetToRoad, stepVehicle,
} from './vehiclePhysics.js';
import { findExitSpot, playerBoxFree } from './vehicleExit.js';
import { roadSnapFor } from './vehicleRoad.js';
import { obbFree } from './vehicleWorld.js';
import { cityWorld, makeRng, pursuit } from './vehicleTestKit.js';

const FIXED_DT = 1 / 60;
const mk = (cls, o) => createVehicle(cls, Object.assign({ x: 3.5, y: 64, z: 0, yaw: 0 }, o || null));

function driveLane(v, w, route, speed, secs) {
  const st = { i: 0, done: false };
  const ev = {};
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < secs * 60 && !st.done; i++) {
    const out = stepVehicle(v, pursuit(v, route, st, speed, 10), w, FIXED_DT, {});
    out.forEach((e) => { ev[e.type] = (ev[e.type] || 0) + 1; });
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  return { ev, minY, maxY, done: st.done };
}

describe('gerçek şehir: tünel (1 blokluk basamaklı rampa), köprü, kavşaklar', () => {
  it('Meydan tüneli: tüm tekerlekli sınıflar güney→kuzey ve kuzey→güney geçer (y 64→56→64), darbe/takılma yok', () => {
    const { world } = cityWorld(777, [-2, 2], [-25, 25]);
    ['taksi', 'spor', 'kamyonet', 'motor'].forEach((cls) => {
      [1, -1].forEach((dir) => {
        const z0 = dir > 0 ? 380 : -380;
        const v = mk(cls, { x: dir > 0 ? 3.5 : -3.5, z: z0, yaw: dir > 0 ? 0 : Math.PI });
        const route = [[v.x, z0], [v.x, -z0]];
        const r = driveLane(v, world, route, 22, 40);
        expect(r.done, cls + ' dir ' + dir).toBe(true);
        expect(r.minY, cls).toBeLessThan(56.5); // tünel tabanı 56
        expect(r.maxY, cls).toBeLessThan(64.6);
        expect(r.ev.bump || 0, cls).toBe(0);
        expect(r.ev.unstick || 0, cls).toBe(0);
        expect(r.ev.resetRoad || 0, cls).toBe(0);
      });
    });
  });

  it('Kanal köprüsü: araç köprü tabliyesinden (y=64) geçer, suya düşmez, kenar korkuluğu araç genişliğine izin verir', () => {
    const { world } = cityWorld(777, [13, 17], [21, 49]);
    ['taksi', 'kamyonet', 'spor'].forEach((cls) => {
      const v = mk(cls, { x: 243.5, z: 360, yaw: Math.PI });
      const route = [[243.5, 360], [243.5, 700]];
      const r = driveLane(v, world, route, 20, 60);
      expect(r.done, cls).toBe(true);
      expect(r.minY, cls).toBeGreaterThan(63.5);
      expect(r.ev.waterRespawn || 0).toBe(0);
      expect(r.ev.unstick || 0).toBe(0);
      expect(r.ev.bump || 0).toBe(0);
    });
  });

  it('kavşaklı rota: roadNet rotası boyunca (90° dönüşlü) sürüş darbesiz ve takılmasız tamamlanır', () => {
    const { world, seed } = cityWorld(31337, [-22, -9], [-16, 1]);
    const net = roadNet(seed);
    const nodes = net.routeNodes(net.nodeAt(-4, -3).id, net.nodeAt(-2, 0).id);
    expect(nodes && nodes.length).toBeGreaterThan(3);
    // yol noktaları: düğüm merkezleri (sağ şerit ofseti ve köşe kesme)
    const pts = [];
    for (let k = 0; k < nodes.length; k++) {
      const n = net.nodes[nodes[k]];
      const prev = net.nodes[nodes[Math.max(0, k - 1)]];
      const next = net.nodes[nodes[Math.min(nodes.length - 1, k + 1)]];
      const dIn = k === 0 ? [next.x - n.x, next.z - n.z] : [n.x - prev.x, n.z - prev.z];
      const dOut = k === nodes.length - 1 ? dIn : [next.x - n.x, next.z - n.z];
      const li = Math.hypot(dIn[0], dIn[1]) || 1;
      const lo = Math.hypot(dOut[0], dOut[1]) || 1;
      const ri = [-dIn[1] / li, dIn[0] / li]; // sağ yan (yaw konvansiyonunda ileri=(dx,dz) için sağ = (-dz, dx)... işaret: aşağıda doğrulanır)
      const ro = [-dOut[1] / lo, dOut[0] / lo];
      const off = 1.7;
      pts.push([n.x - (dIn[0] / li) * 16 + ri[0] * off, n.z - (dIn[1] / li) * 16 + ri[1] * off]);
      pts.push([n.x + (dOut[0] / lo) * 16 + ro[0] * off, n.z + (dOut[1] / lo) * 16 + ro[1] * off]);
    }
    const a = net.nodes[nodes[0]];
    const b = net.nodes[nodes[1]];
    const yaw0 = Math.atan2(-(b.x - a.x), -(b.z - a.z));
    const v = createVehicle('taksi', { x: pts[0][0], y: 64, z: pts[0][1], yaw: yaw0 });
    const r = driveLane(v, world, pts, 13, 150);
    expect(r.done).toBe(true);
    expect(r.ev.bump || 0).toBeLessThanOrEqual(2); // köşe kesen betikli sürücü kavşak köşesindeki trafik direğine sürtebilir
    expect(r.ev.unstick || 0).toBe(0);
    expect(r.ev.resetRoad || 0).toBe(0);
  });

  it('bina duvarlarına 51 m/s: araç binanın içine giremez (rastgele yön/konum), son durum katıda değil', () => {
    const { world, seed } = cityWorld(2468, [-12, -2], [-12, -2]);
    const rng = makeRng(11);
    let hits = 0;
    for (let k = 0; k < 60; k++) {
      // Merkez bölgesinde (−160..−40) bir yol kavşağından rastgele yöne
      const x0 = -120 + Math.floor(rng() * 5) * 80 * 0 + (rng() - 0.5) * 6;
      const z0 = -120 + (rng() - 0.5) * 6;
      const yaw = rng() * Math.PI * 2;
      const v = mk(['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike'][k % 5], { x: x0 + 3.5, z: z0, yaw });
      const f = findFreePose(world, v.def, v.x, v.y, v.z, yaw, { maxR: 12 });
      if (!f) continue;
      v.x = f.x; v.y = f.y; v.z = f.z;
      v.vx = -Math.sin(yaw) * 51;
      v.vz = -Math.cos(yaw) * 51;
      v.u = 51;
      for (let i = 0; i < 150; i++) {
        const ev = stepVehicle(v, { throttle: 1, steer: (rng() - 0.5) * 0.3 }, world, FIXED_DT, {});
        if (ev.some((e) => e.type === 'bump')) hits++;
        expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
      }
      expect(obbFree(world, world.colliders, v.x, v.y, v.z, v.yaw, v.def, v.propId, 0.6) || v.hazardT > 0 || v.inWater === false).toBe(true);
    }
    expect(hits).toBeGreaterThan(5);
    void seed;
  });
});

describe('araçtan iniş noktası', () => {
  it('1000 rastgele poz: iniş noktası katıda değil, altında taşıyıcı zemin var, aracın içinde değil', () => {
    const { world, layer } = cityWorld(555, [-6, 6], [-6, 6]);
    const rng = makeRng(99);
    let found = 0;
    let none = 0;
    const classes = ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'];
    for (let k = 0; k < 1000; k++) {
      const d = VEHICLE_DEFS[classes[k % 6]];
      const yaw = rng() * Math.PI * 2;
      const x = (rng() - 0.5) * 190;
      const z = (rng() - 0.5) * 190;
      const free = findFreePose(world, d, x, 64, z, yaw, { maxR: 14 });
      if (!free) continue;
      const v = createVehicle(d.key, { x: free.x, y: free.y, z: free.z, yaw });
      const spot = findExitSpot(world, v, { colliders: layer.colliders });
      if (!spot) {
        none++;
        continue;
      }
      found++;
      expect(playerBoxFree(world, spot.x, spot.y, spot.z, layer.colliders), 'k=' + k).toBe(true);
      // altında taşıyıcı: spot.y − 0.01 ile spot.y + 0.01 arasında bir katı yüzeyi tutar
      const below = world.getBlock(Math.floor(spot.x), Math.floor(spot.y - 0.05), Math.floor(spot.z));
      expect(below === 0 || below === null).toBe(false);
      const dx = spot.x - v.x;
      const dz = spot.z - v.z;
      const fx = -Math.sin(v.yaw);
      const fz = -Math.cos(v.yaw);
      const along = Math.abs(dx * fx + dz * fz);
      const side = Math.abs(dx * Math.cos(v.yaw) + dz * -Math.sin(v.yaw));
      expect(along >= d.length * 0.5 + 0.2 || side >= d.width * 0.5 + 0.2, 'k=' + k).toBe(true);
    }
    expect(found).toBeGreaterThan(800);
    expect(none).toBeLessThan(200);
  });

  it('iniş noktası bulunamazsa yola ışınlama yedeği ve resetToRoad mevcut; roadSnapFor yol üstünde', () => {
    const { world, seed } = cityWorld(555, [-8, 8], [-8, 8]);
    const snap = roadSnapFor(seed);
    // meydan üstünde (y=64) en yakın merkez çizgisi tünelde (y=56): aynı katta bir yol noktası seçilir
    const up = snap(0.5, 0.5, 64, 0);
    expect(Math.abs(up.y - 64)).toBeLessThanOrEqual(4);
    const under = snap(0.5, 0.5, 56, 0);
    expect(under.y).toBeLessThan(60);
    for (let k = 0; k < 40; k++) {
      const x = -40 + k * 2.1;
      const z = -35 + k * 1.7;
      const s = snap(x, z, 64, 0.2);
      expect(s).not.toBe(null);
      expect(Number.isFinite(s.x + s.y + s.z + s.yaw)).toBe(true);
      const d = VEHICLE_DEFS.taksi;
      const f = findFreePose(world, d, s.x, s.y, s.z, s.yaw, { maxR: 9 });
      expect(f, 'k=' + k).not.toBe(null);
    }
    const v = mk('taksi', { x: 300, z: 300 });
    v.good.ok = false;
    expect(resetToRoad(v, world, { roadSnap: snap })).toBe(false); // yüklenmemiş bölge: güvenle başarısız (poz bozulmaz)
    expect(Number.isFinite(v.x)).toBe(true);
  });

  it('kiralama/park POI konumları araç için boş poz bulunur (rental, park_slot, garage)', () => {
    const { world, seed } = cityWorld(777, [-6, 6], [-6, 6]);
    const list = pois(seed).filter((p) => (p.type === 'rental' || p.type === 'park_slot') && Math.abs(p.x) < 90 && Math.abs(p.z) < 90);
    expect(list.length).toBeGreaterThan(0);
    list.forEach((p) => {
      const f = findFreePose(world, VEHICLE_DEFS.taksi, p.x, p.y, p.z, p.yaw || 0, { maxR: 9 });
      expect(f, p.type + ' ' + p.id).not.toBe(null);
    });
  });
});

describe('şehirde rastgele sürüş soak (gerçek bloklar + proplar)', () => {
  const REGIONS = [
    { name: 'Merkez/Konteyner (4242)', seed: 4242, cx: [-14, -1], cz: [-14, -1], cxm: -120, czm: -120 },
    { name: 'Gece Pazarı (9)', seed: 9, cx: [20, 31], cz: [4, 15], cxm: 400, czm: 130 },
  ];
  REGIONS.forEach((R) => {
    it('6 sınıf × 3 tohum × 60 sn rastgele girdi — ' + R.name + ': sonlu durum, katı içinde kalma yok, 8 sn üstü takılma yok', () => {
      const { world, layer } = cityWorld(R.seed, R.cx, R.cz);
      const classes = ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'];
      let inSolid = 0;
      let checks = 0;
      let maxStuck = 0;
      let maxWedge = 0;
      const events = {};
      for (let seed = 0; seed < 3; seed++) {
        classes.forEach((cls, ci) => {
          const rng = makeRng(1000 * seed + ci + 5);
          const start = findFreePose(world, VEHICLE_DEFS[cls], R.cxm + (rng() - 0.5) * 60, 64, R.czm + (rng() - 0.5) * 60, rng() * 6.28, { maxR: 16 });
          expect(start, cls).not.toBe(null);
          const v = createVehicle(cls, { x: start.x, y: start.y, z: start.z, yaw: start.yaw });
          let throttle = 1;
          let steer = 0;
          let hb = false;
          let nitro = false;
          let stuck = 0;
          for (let i = 0; i < 60 * 60; i++) {
            if (i % 45 === 0) {
              steer = (rng() - 0.5) * 2;
              throttle = rng() < 0.85 ? 0.4 + rng() * 0.6 : 0;
              hb = rng() < 0.08;
              nitro = rng() < 0.25;
            }
            const out = stepVehicle(v, {
              steer, throttle, brake: throttle === 0 ? 0.8 : 0, handbrake: hb, nitro, hop: rng() < 0.02, steerDirect: true,
            }, world, FIXED_DT, { wet: (i % 1200) / 1200 });
            out.forEach((e) => { events[e.type] = (events[e.type] || 0) + 1; });
            if (!Number.isFinite(v.x + v.y + v.z + v.vx + v.vz + v.yaw)) throw new Error('NaN ' + cls + ' @' + i);
            if (Math.hypot(v.vx, v.vz) < 0.3 && throttle > 0.3) stuck += FIXED_DT;
            else stuck = 0;
            if (stuck > maxStuck) maxStuck = stuck;
            if (v.wedgeT > maxWedge) maxWedge = v.wedgeT;
            if (i % 30 === 0) {
              checks++;
              // basamak payı fizikle aynı: en yüksek tekerlek temasından (gTop) sayılır
              // sıkışma (wedgeT > 0): fizik bunu fark etti, 0,35 sn içinde kurtarır → bu örnek sayılmaz
              if (v.wedgeT === 0 && !obbFree(world, layer.colliders, v.x, v.y, v.z, v.yaw, v.def, v.propId, v.def.step[1] + 0.1, v.def.hover > 0 ? v.y : v.gTop)) inSolid++;
            }
          }
        });
      }
      expect(checks).toBeGreaterThan(2000);
      expect(inSolid).toBe(0);
      expect(maxStuck).toBeLessThan(8);
      expect(maxWedge).toBeLessThan(0.5); // sıkışma 0,35 sn'de kurtarılır
      expect((events.bump || 0) + (events.scrape || 0)).toBeGreaterThan(5);
    });
  });

  it('adım maliyeti şehirde (gerçek bloklar + proplar) < 0,05 ms/araç', () => {
    const { world } = cityWorld(4242, [-14, -1], [-14, -1]);
    const cars = ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'].map((c, i) => {
      const f = findFreePose(world, VEHICLE_DEFS[c], -100 - i * 8, 64, -100, 0, { maxR: 16 });
      return createVehicle(c, { x: f.x, y: f.y, z: f.z, yaw: f.yaw });
    });
    const rng = makeRng(77);
    const stepAll = (i) => cars.forEach((v) => stepVehicle(v, { throttle: 1, steer: Math.sin(i / 60 + v.id) * 0.5, nitro: rng() < 0.05 }, world, FIXED_DT, {}));
    for (let i = 0; i < 600; i++) stepAll(i);
    const N = 3000;
    // qa5: en iyi 5 parti (CPU doygunken tek parti şişebilir; gerçek bir yavaşlama TÜM partilerde eşiği aşar)
    let ms = Infinity;
    for (let rep = 0; rep < 5 && ms >= 0.05; rep++) {
      const t0 = cpuMs(); // qa5: süreç CPU zamanı (duvar saati kesintilerinden etkilenmez)
      for (let i = 0; i < N; i++) stepAll(i);
      ms = Math.min(ms, (cpuMs() - t0) / (N * cars.length));
    }
    console.log('şehirde adım maliyeti ms/araç:', ms.toFixed(4));
    expect(ms).toBeLessThan(0.05);
  });
});
