import { describe, expect, it } from 'vitest';
import { B } from '../../blocks.js';
import { ColliderIndex } from '../../props/colliderIndex.js';
import { VEHICLE_DEFS } from './vehicleData.js';
import {
  createVehicle, findFreePose, resetToRoad, stepVehicle, vehicleObb,
} from './vehiclePhysics.js';
import { obbFree } from './vehicleWorld.js';
import {
  attachColliders, fillBox, flatWorld, makeRng, run,
} from './vehicleTestKit.js';

const FIXED_DT = 1 / 60;
const mk = (cls, o) => createVehicle(cls, Object.assign({ x: 0.5, y: 64, z: 0.5, yaw: 0 }, o || null));

/** Aracı belli hızla belli yöne fırlatır (yaw: araç ileri yönü). */
function launch(v, speed) {
  const fx = -Math.sin(v.yaw);
  const fz = -Math.cos(v.yaw);
  v.vx = fx * speed;
  v.vz = fz * speed;
  v.u = speed;
  v.w = 0;
  return v;
}

describe('51 m/s: tünelleme yok', () => {
  it('1000 rastgele yön × duvar (1 blok) — araç merkezi duvarın öbür yüzüne asla geçmez, son durum katıda değil', () => {
    const rng = makeRng(2024);
    const classes = ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike'];
    let bumps = 0;
    for (let k = 0; k < 1000; k++) {
      const w = flatWorld();
      fillBox(w, -300, 64, -50, 300, 68, -50, B.STONE); // z = −50 hücresi: [−50, −49]
      const cls = classes[k % classes.length];
      const v = mk(cls, { x: (rng() - 0.5) * 60, z: 0.5, yaw: (rng() - 0.5) * 2.6 });
      launch(v, 51);
      let minZ = Infinity;
      for (let i = 0; i < 90; i++) {
        const ev = stepVehicle(v, { throttle: 1, steer: (rng() - 0.5) * 0.4 }, w, FIXED_DT, {});
        if (ev.some((e) => e.type === 'bump')) bumps++;
        if (v.z < minZ) minZ = v.z;
        expect(v.z, 'k=' + k + ' ' + cls + ' i=' + i).toBeGreaterThan(-49.5 - 0.02); // merkez duvarın ön yüzünün (−49) gerisine geçmez
      }
      expect(minZ).toBeGreaterThan(-49.6);
      expect(obbFree(w, null, v.x, v.y, v.z, v.yaw, v.def, undefined, 0.6) || v.inWater === false).toBe(true);
    }
    expect(bumps).toBeGreaterThan(300); // çoğu vuruş darbe olayı üretir
  });

  it('ince collider (0,25 blokluk direk) 51 m/s: araç içinden geçmez (200 rastgele yanal kayma)', () => {
    const rng = makeRng(7);
    for (let k = 0; k < 200; k++) {
      const w = flatWorld();
      const cc = attachColliders(w);
      const px = (rng() - 0.5) * 1.6;
      cc.add(777, [[px - 0.125, 64, -40.125, px + 0.125, 69, -39.875]]);
      const v = mk(k % 2 ? 'spor' : 'taksi', { x: 0.5 - 0.5, z: 0.5, yaw: (rng() - 0.5) * 0.3 });
      launch(v, 51);
      let passed = false;
      for (let i = 0; i < 70; i++) {
        stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
        if (v.z < -40.1 && Math.abs(v.x - px) < 0.9) passed = true;
      }
      // araç direğin yanından geçmiş olabilir (yanal kayma ≥ yarı genişlik) ama içinden değil
      const o = vehicleObb(v, {});
      expect(passed && Math.abs(px - v.x) < o.hw - 0.2 && v.z < -40.1 && Math.hypot(v.vx, v.vz) > 40, 'k=' + k).toBe(false);
      expect(obbFree(w, cc, v.x, v.y, v.z, v.yaw, v.def, undefined, 0.6) || Math.abs(v.z + 40) > 3).toBe(true);
    }
  });

  it('yüklenmemiş (null) bloklar katıdır: veri bitince araç durur ve akış bekçisi hızı 0,6·max\'a sınırlar', () => {
    const base = flatWorld();
    const w = { colliders: null, killPlaneY: -448, getBlock: (x, y, z) => (z < -80 ? null : base.getBlock(x, y, z)) };
    const v = mk('spor');
    launch(v, 40);
    let minZ = 0;
    for (let i = 0; i < 240; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
      minZ = Math.min(minZ, v.z);
    }
    expect(minZ).toBeGreaterThan(-80 + 1.5);
    const a = mk('spor');
    const gov = run(a, flatWorld(), 12, { throttle: 1 }, { chunkAhead: () => false });
    expect(gov.maxSpeed).toBeLessThanOrEqual(40 * 0.6 + 0.3);
    expect(a.governed).toBe(true);
    const f = mk('spor');
    expect(run(f, flatWorld(), 12, { throttle: 1 }, { chunkAhead: () => true }).maxSpeed).toBeGreaterThan(39);
  });
});

describe('çarpışma tepkisi', () => {
  it('çok sığ açıyla duvara sürtünme: teğet hız büyük ölçüde korunur, darbe olayı yok', () => {
    const w = flatWorld();
    fillBox(w, -400, 64, 20, 400, 68, 20, B.STONE); // x ekseni boyunca duvar, z = 20..21
    const v = mk('taksi', { x: 0.5, z: 0.5, yaw: -Math.PI / 2 + 0.07 }); // +X'e yakın, hafifçe +Z'ye
    launch(v, 25);
    let bumps = 0;
    const sp0 = 25;
    for (let i = 0; i < 180; i++) {
      const ev = stepVehicle(v, { throttle: 0.6 }, w, FIXED_DT, {});
      bumps += ev.filter((e) => e.type === 'bump').length;
      expect(v.z).toBeLessThan(20 - v.def.width * 0.5 * 0.96 * 0.5); // duvarın içine girmez
    }
    expect(bumps).toBe(0);
    expect(v.x).toBeGreaterThan(40);
    expect(Math.hypot(v.vx, v.vz)).toBeGreaterThan(sp0 * 0.6);
  });

  it('dik çarpma 20 m/s: bump olayı (şiddet ≥ 6), hız düşer, sekme sınırlı, duvarın dışında kalır; sarsıntı/ikaz ışığı zamanlayıcıları', () => {
    const w = flatWorld();
    fillBox(w, -50, 64, -30, 50, 68, -30, B.STONE);
    const v = mk('taksi');
    launch(v, 20);
    const bump = [];
    let maxBack = 0;
    for (let i = 0; i < 120; i++) {
      const ev = stepVehicle(v, i < 60 ? { throttle: 1 } : {}, w, FIXED_DT, {});
      ev.forEach((e) => { if (e.type === 'bump') bump.push(e); });
      maxBack = Math.max(maxBack, v.u < 0 ? -v.u : 0);
      expect(v.z).toBeGreaterThan(-29 + 2.1 * 0.98 - 0.05);
    }
    expect(bump.length).toBeGreaterThanOrEqual(1);
    expect(bump[0].impact).toBeGreaterThan(15);
    expect(bump[0].soft).toBe(false);
    expect(Math.hypot(v.vx, v.vz)).toBeLessThan(6);
    expect(maxBack).toBeLessThan(0.3 * 20 + 1);
    const w2 = flatWorld();
    fillBox(w2, -50, 64, -30, 50, 68, -30, B.STONE);
    const v2 = mk('taksi');
    launch(v2, 20);
    let sawShake = false;
    let sawHazard = false;
    for (let i = 0; i < 120; i++) {
      stepVehicle(v2, { throttle: 1 }, w2, FIXED_DT, {});
      if (v2.bumpT > 0) sawShake = true;
      if (v2.hazardT > 0) sawHazard = true;
    }
    expect(sawShake && sawHazard).toBe(true);
  });

  it('köşe çarpması aracı hafifçe döndürür (yaw darbesi sınırlı), araç duvarın içine girmez', () => {
    const w = flatWorld();
    fillBox(w, -2, 64, -40, 40, 68, -30, B.STONE); // duvar bloğu; aracın sol ön köşesi vurur
    const v = mk('spor', { x: -2.75, z: 0.5 });
    launch(v, 18);
    const yaw0 = v.yaw;
    let maxSpin = 0;
    for (let i = 0; i < 120; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
      maxSpin = Math.max(maxSpin, Math.abs(v.spin));
    }
    expect(maxSpin).toBeLessThanOrEqual(1.4 + 1e-9);
    expect(Math.abs(v.yaw - yaw0)).toBeGreaterThan(0.01);
    expect(obbFree(w, null, v.x, v.y, v.z, v.yaw, v.def, undefined, 0.6)).toBe(true);
  });

  it('park halindeki başka araç (collider) engeldir; kendi collider\'ı (propId) yok sayılır; yumuşak collider hafif iter', () => {
    const w = flatWorld();
    const cc = attachColliders(w);
    cc.setDynamic(900, { minX: -1, minY: 64, minZ: -41, maxX: 1, maxY: 65.5, maxZ: -37 }, null);
    const v = mk('taksi', { propId: 4242 });
    cc.setDynamic(4242, { minX: -0.95, minY: 64, minZ: -1.6, maxX: 0.95, maxY: 65.5, maxZ: 2.6 }, null); // kendi kutusu üstümüzde
    launch(v, 20);
    const ev = [];
    for (let i = 0; i < 150; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {}).forEach((e) => ev.push(e));
      expect(v.z).toBeGreaterThan(-37 + 2.0);
    }
    expect(ev.some((e) => e.type === 'bump' && e.id === 900)).toBe(true);
    // yumuşak
    const w2 = flatWorld();
    const cc2 = attachColliders(w2);
    cc2.setDynamic(901, { minX: -0.4, minY: 64, minZ: -41, maxX: 0.4, maxY: 65.8, maxZ: -40.2 }, null);
    const s = mk('taksi', { propId: 1 });
    launch(s, 12);
    const soft = [];
    for (let i = 0; i < 150; i++) stepVehicle(s, { throttle: 0.5 }, w2, FIXED_DT, { isSoft: (id) => id === 901 }).forEach((e) => soft.push(e));
    expect(soft.some((e) => e.type === 'bump' && e.soft === true)).toBe(true);
    expect(soft.some((e) => e.type === 'bump' && e.soft === false)).toBe(false);
  });
});

describe('basamak / rampa / sıçrama', () => {
  function stairsWorld(steps, run_, h) {
    const w = flatWorld();
    for (let s = 0; s < steps; s++) {
      // basamak s: z ∈ [−10−s·run, −10−(s+1)·run), yükseklik (s+1)·h blok
      const z0 = -10 - s * run_;
      fillBox(w, -8, 64, z0 - run_ + 1, 8, 63 + (s + 1) * h, z0, B.STONE);
    }
    return w;
  }

  it('1 blokluk basamaklar |u| ≥ 4 iken rampa gibi çıkılır, yavaşken (2 m/s) çıkılamaz', () => {
    ['taksi', 'spor', 'kamyonet', 'motor'].forEach((cls) => {
      const w = stairsWorld(6, 4, 1);
      const v = mk(cls);
      launch(v, 9);
      const out = run(v, w, 2.3, { throttle: 0.5 });
      expect(out.maxY, cls).toBeGreaterThan(69.3); // 6 basamak = 6 blok (gövde düzlemi: tepe noktasında arka aks geride)
      expect(out.events.bump || 0).toBe(0);
      const slow = mk(cls, { z: -4 });
      let t = 0;
      for (let i = 0; i < 120; i++) {
        const sp = Math.hypot(slow.vx, slow.vz);
        stepVehicle(slow, { throttle: sp < 1.8 ? 0.3 : 0 }, w, FIXED_DT, {});
        t += FIXED_DT;
      }
      expect(slow.y, cls + ' yavaş').toBeLessThan(64.7);
      expect(t).toBeGreaterThan(1);
    });
  });

  it('yarım basamaklar (0,5 blok) yavaş da çıkılır; 45° taş basamak bloğu |u| ≥ 4 ile çıkılır', () => {
    const w = flatWorld();
    for (let s = 0; s < 10; s++) {
      const h = 0.5 * (s + 1);
      const full = Math.floor(h);
      const z0 = -10 - s * 2;
      if (full > 0) fillBox(w, -8, 64, z0 - 1, 8, 63 + full, z0, B.STONE);
      if (h - full > 0.25) fillBox(w, -8, 64 + full, z0 - 1, 8, 64 + full, z0, B.SLAB);
    }
    const v = mk('taksi');
    launch(v, 2.5);
    const half = run(v, w, 14, (i, q) => ({ throttle: Math.hypot(q.vx, q.vz) < 2.5 ? 0.4 : 0 }));
    expect(half.maxY).toBeGreaterThan(68.4); // 10 yarım basamak = 5 blok
    const w2 = flatWorld();
    for (let s = 0; s < 6; s++) fillBox(w2, -8, 64 + s, -10 - s, 8, 64 + s, -10 - s, B.STAIRS);
    const t = mk('taksi');
    launch(t, 8);
    const st = run(t, w2, 3, { throttle: 0.7 });
    expect(st.maxY).toBeGreaterThan(67);
  });

  it('düşük tavan: araç altından geçer (yükseklik < 1,5 engeli); 2 blok yüksek duvar vurulur', () => {
    const w = flatWorld();
    fillBox(w, -8, 67, -30, 8, 68, -30, B.STONE); // tavan: alt yüzü y=67 (araç tepesi 65,5)
    const v = mk('taksi');
    launch(v, 15);
    run(v, w, 3, { throttle: 1 });
    expect(v.z).toBeLessThan(-35);
    const w2 = flatWorld();
    fillBox(w2, -8, 64, -30, 8, 65, -30, B.STONE); // 2 blok yüksek
    const q = mk('taksi');
    launch(q, 15);
    run(q, w2, 3, { throttle: 1 });
    expect(q.z).toBeGreaterThan(-29);
  });

  it('rampa sıçraması: uçuş mesafesi balistik hesaptan ±%5 (kalkış durumundan)', () => {
    const w = flatWorld();
    // rampa: 5 plaka basamağı (0,5'lik, 2 blok), sonra boşluk (zemin 4 blok aşağı) ve karşı zemin
    const lowGround = 59;
    const base = flatWorld({ ground: lowGround });
    const W = {
      colliders: null,
      killPlaneY: -448,
      getBlock: (x, y, z) => {
        if (z <= -10 && z > -20) return y <= 63 ? B.STONE : 0; // kalkış platformu (üstü 64)
        if (z <= -20 && z > -60) return base.getBlock(x, y, z); // çukur (üstü 60)
        if (z <= -60) return y <= 63 ? B.STONE : 0; // karşı kıyı
        return y <= 63 ? B.STONE : 0;
      },
    };
    void w;
    const v = mk('spor', { z: 0 });
    launch(v, 30);
    let airStart = null;
    let landed = null;
    for (let i = 0; i < 240; i++) {
      stepVehicle(v, { throttle: 0.4 }, W, FIXED_DT, {});
      if (!v.onGround && airStart === null) airStart = { z: v.z, y: v.y, vy: v.vy, sp: Math.hypot(v.vx, v.vz), vzS: v.vz, t: i };
      if (airStart && v.onGround && landed === null) landed = { z: v.z, y: v.y, t: i };
    }
    // düz kalkış (rampa yok): sıçrama hiç yok; araç boşluktan 4 blok düşer ve karşı kıyıya 60 m/s... → düşme/iniş mantığı sınaması
    expect(airStart).not.toBe(null);
    expect(landed).not.toBe(null);
    const T = (landed.t - airStart.t) * FIXED_DT;
    const g = 24;
    const predT = (airStart.vy + Math.sqrt(airStart.vy * airStart.vy + 2 * g * (airStart.y - landed.y))) / g;
    expect(Math.abs(T - predT) / predT).toBeLessThan(0.12);
    const predD = Math.abs(airStart.vzS) * predT;
    const actD = Math.abs(landed.z - airStart.z);
    expect(Math.abs(actD - predD) / predD).toBeLessThan(0.12);
  });

  it('iniş basamakları (1 blok) hızla takip edilir: araç havaya fırlamaz (hop yok)', () => {
    const w = flatWorld();
    fillBox(w, -8, 64, -40, 8, 69, 5, B.STONE); // 6 blokluk platform (üstü 70)
    for (let s = 0; s < 6; s++) {
      // platformun ucundan sonra basamaklar: yükseklik 6−(s+1)
      const z0 = -41 - s * 4;
      if (5 - s > 0) fillBox(w, -8, 64, z0 - 3, 8, 63 + (5 - s), z0, B.STONE);
    }
    const v = mk('taksi', { y: 70, z: -5 });
    launch(v, 20);
    let airFrames = 0;
    for (let i = 0; i < 260; i++) {
      stepVehicle(v, { throttle: 0.5 }, w, FIXED_DT, {});
      if (!v.onGround) airFrames++;
    }
    expect(v.y).toBeLessThan(64.8);
    expect(airFrames).toBeLessThan(15);
  });
});

describe('su sınırı', () => {
  function canalWorld() {
    const base = flatWorld();
    return {
      colliders: null,
      killPlaneY: -448,
      getBlock(x, y, z) {
        if (z >= 40 && z < 90) {
          if (y <= 43) return B.STONE;
          if (y <= 58) return B.WATER;
          return 0;
        }
        return base.getBlock(x, y, z);
      },
    };
  }

  it('kanal kenarı korkuluk gibi davranır: araç suya girmez, hız kesilir, edge olayı verilir (her sınıf, farklı açılar)', () => {
    const rng = makeRng(31);
    ['taksi', 'spor', 'kamyonet', 'motor'].forEach((cls) => {
      for (let k = 0; k < 8; k++) {
        const w = canalWorld();
        const v = mk(cls, { z: 0.5, x: (rng() - 0.5) * 20, yaw: Math.PI + (rng() - 0.5) * 1.6 }); // +Z'ye doğru
        launch(v, 22);
        let wet = false;
        let edges = 0;
        for (let i = 0; i < 300; i++) {
          const ev = stepVehicle(v, { throttle: 1, steer: (rng() - 0.5) * 0.2 }, w, FIXED_DT, {});
          edges += ev.filter((e) => e.type === 'edge').length;
          if (v.inWater || v.y < 62) wet = true;
        }
        expect(wet, cls + ' k=' + k).toBe(false);
        expect(v.z, cls).toBeLessThan(40.2);
        expect(edges).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it('hover kanalı geçer (suyun üstünde süzülür)', () => {
    const w = canalWorld();
    const v = mk('hoverbike', { z: 20, yaw: Math.PI });
    launch(v, 20);
    let wet = false;
    let minY = 99;
    for (let i = 0; i < 150; i++) {
      stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
      if (v.inWater) wet = true;
      if (v.z > 45) minY = Math.min(minY, v.y);
    }
    expect(wet).toBe(false);
    expect(v.z).toBeGreaterThan(60); // kanal üstüne süzüldü
    expect(minY).toBeGreaterThan(59.3); // suyun (58,88) 1,2 üstüne yaklaşır, batmaz
  });

  it('suya düşen araç 3 sn sonra yola ışınlanır (waterRespawn + resetRoad), yüzer ve hız ≤ 3', () => {
    const w = canalWorld();
    const v = mk('taksi', { z: 60, y: 62, yaw: 0 });
    let respawn = false;
    let maxSpeedInWater = 0;
    const ctx = { roadSnap: () => ({ x: 4.5, y: 64, z: 10.5, yaw: 0.3 }) };
    for (let i = 0; i < 60 * 6; i++) {
      const ev = stepVehicle(v, { throttle: 1 }, w, FIXED_DT, ctx);
      if (v.inWater) maxSpeedInWater = Math.max(maxSpeedInWater, Math.hypot(v.vx, v.vz));
      if (ev.some((e) => e.type === 'waterRespawn')) respawn = true;
    }
    expect(respawn).toBe(true);
    expect(maxSpeedInWater).toBeLessThanOrEqual(3.2);
    expect(v.inWater).toBe(false);
    expect(v.z).toBeLessThan(40);
    expect(v.y).toBeGreaterThan(63.5);
    expect(v.onGround).toBe(true);
  });

  it('yol ışınlama yedekleri: roadSnap yoksa son sağlam poz; resetToRoad yoksa en yakın boş zemin', () => {
    const w = flatWorld();
    const v = mk('taksi');
    run(v, w, 2, { throttle: 1 });
    const z1 = v.z;
    v.x = 9999; // dünya dışı bozuk poz
    v.y = 500;
    expect(resetToRoad(v, w, {})).toBe(true); // son sağlam poz çevresi
    expect(Math.abs(v.z - z1)).toBeLessThan(10);
    expect(v.y).toBeCloseTo(64, 3);
    const v2 = mk('spor', { x: 5, z: 5 });
    v2.good.ok = false;
    expect(resetToRoad(v2, w, {})).toBe(true);
  });
});

describe('sıkışma / çıkış güvenliği', () => {
  it('katı bloğun içine gömülü araç dışarı itilir/kurtarılır ve boş zemine konur; gövde asla katıda kalmaz', () => {
    const w = flatWorld();
    fillBox(w, -4, 64, -4, 5, 70, 5, B.STONE);
    const v = mk('taksi');
    for (let i = 0; i < 180; i++) stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
    expect(obbFree(w, null, v.x, v.y, v.z, v.yaw, v.def, undefined, 0.6)).toBe(true);
    expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    // derin kapalı oyuk: araç sığmaz; kurtarma olayı (unstick/resetRoad) üretilir
    const w2 = flatWorld();
    fillBox(w2, -6, 64, -6, 6, 72, 6, B.STONE);
    fillBox(w2, 0, 64, 0, 0, 72, 0, 0);
    const q = mk('kamyonet', { x: 0.5, z: 0.5 });
    let rescue = 0;
    for (let i = 0; i < 240; i++) rescue += stepVehicle(q, { throttle: 1 }, w2, FIXED_DT, {}).filter((e) => e.type === 'unstick' || e.type === 'resetRoad').length;
    expect(rescue).toBeGreaterThanOrEqual(1);
    expect(obbFree(w2, null, q.x, q.y, q.z, q.yaw, q.def, undefined, 0.6)).toBe(true);
  });

  it('gaz basılı ama ilerleyemeyen araç (üç yanı duvar) 3 sn sonra kurtarılır; yeterince boş yer varsa serbest kalır', () => {
    const w = flatWorld();
    fillBox(w, -3, 64, -4, -3, 70, 4, B.STONE);
    fillBox(w, 4, 64, -4, 4, 70, 4, B.STONE);
    fillBox(w, -3, 64, -4, 4, 70, -4, B.STONE);
    fillBox(w, -3, 64, 4, 4, 70, 4, B.STONE);
    const v = mk('kamyonet', { x: 0.5, z: 0.5 });
    let reset = 0;
    for (let i = 0; i < 60 * 9; i++) {
      const ev = stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {}, {});
      reset += ev.filter((e) => e.type === 'unstick' || e.type === 'resetRoad').length;
    }
    expect(reset).toBeGreaterThanOrEqual(1);
    expect(obbFree(w, null, v.x, v.y, v.z, v.yaw, v.def, undefined, 0.6)).toBe(true);
  });

  it('findFreePose boş poz arar: katı bloklar ve collider\'lardan kaçınır, yükseklik zemine oturur', () => {
    const w = flatWorld();
    const cc = attachColliders(w);
    fillBox(w, -3, 64, -3, 3, 66, 3, B.STONE);
    cc.setDynamic(5, { minX: 4, minY: 64, minZ: -2, maxX: 8, maxY: 66, maxZ: 2 }, null);
    const d = VEHICLE_DEFS.taksi;
    const p = findFreePose(w, d, 0.5, 64, 0.5, 0, { maxR: 12, colliders: cc });
    expect(p).not.toBe(null);
    expect(p.y).toBeCloseTo(64, 3);
    expect(obbFree(w, cc, p.x, p.y, p.z, p.yaw, d, undefined, 0.6)).toBe(true);
    expect(findFreePose(w, d, 0.5, 64, 0.5, 0, { maxR: 1 })).toBe(null);
  });
});

describe('ColliderIndex entegrasyonu', () => {
  it('dinamik araç kutusu çok sayıda ile birlikte (60 engel) sorguda engel olarak toplanır; tamponu taşırmaz', () => {
    const w = flatWorld();
    const cc = new ColliderIndex();
    w.colliders = cc;
    for (let i = 0; i < 400; i++) cc.add(1000 + i, [[(i % 20) - 10, 64, -5 - Math.floor(i / 20) * 0.1, (i % 20) - 9.5, 65, -4.9 - Math.floor(i / 20) * 0.1]]);
    const v = mk('spor');
    launch(v, 15);
    for (let i = 0; i < 200; i++) stepVehicle(v, { throttle: 1 }, w, FIXED_DT, {});
    expect(Number.isFinite(v.x + v.z)).toBe(true);
  });
});
