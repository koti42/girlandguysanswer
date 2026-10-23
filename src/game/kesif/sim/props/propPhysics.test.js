import { describe, expect, it } from 'vitest';
import * as physics from '../physics.js';
import { ColliderIndex } from './colliderIndex.js';
import { makeArenaWorld, goldenPhysicsDigest, makeBench } from './propPhysicsKit.js';
import { hash32 } from '../rng.js';

const {
  createPlayerBody, stepPlayer, moveBox, isBoxFree, bodyAABB,
} = physics;
const DT = 1 / 60;
/** physics.js kancasından ÖNCE, özgün dosyayla üretilen altın özet (KESIF_CITY_CONTRACT §6, risk 3). */
const GOLDEN = 'bebf916e';

function flatWorld(colliders) {
  return {
    colliders: colliders === undefined ? null : colliders,
    getBlock: (x, y) => (y <= 0 ? 1 : 0),
  };
}
function walk(body, world, input, steps, abilities) {
  for (let i = 0; i < steps; i++) stepPlayer(body, input, world, DT, abilities || {}, { mode: 'macera' });
}
function overlapsAny(idx, a) {
  const out = new Float64Array(64 * 6);
  const n = idx.queryRaw(a.minX + 1e-5, a.minY + 1e-5, a.minZ + 1e-5, a.maxX - 1e-5, a.maxY - 1e-5, a.maxZ - 1e-5, out, 64);
  return n > 0;
}

describe('fizik kancası — world.colliders yokken bayt-bayt aynı', () => {
  it('world.colliders === null: altın özet özgün fizikle aynı', () => {
    expect(goldenPhysicsDigest(physics, makeArenaWorld())).toBe(GOLDEN);
  });
  it('world.colliders === undefined: aynı', () => {
    const w = makeArenaWorld();
    delete w.colliders;
    expect(goldenPhysicsDigest(physics, w)).toBe(GOLDEN);
  });
  it('boş ColliderIndex: aynı', () => {
    expect(goldenPhysicsDigest(physics, makeArenaWorld({ colliders: new ColliderIndex() }))).toBe(GOLDEN);
  });
  it('uzaktaki proplar (hiç kesişmeyen): aynı', () => {
    const idx = new ColliderIndex();
    for (let i = 0; i < 500; i++) idx.add(i + 1, [[100 + (i % 20) * 2, 1, 100 + Math.floor(i / 20) * 2, 100.5 + (i % 20) * 2, 2, 100.5 + Math.floor(i / 20) * 2]]);
    expect(goldenPhysicsDigest(physics, makeArenaWorld({ colliders: idx }))).toBe(GOLDEN);
  });
  it('özet duyarlı: engel eklenince değişir', () => {
    const idx = new ColliderIndex();
    idx.add(1, [[-3, 1, -3, 3, 3, 3]]);
    expect(goldenPhysicsDigest(physics, makeArenaWorld({ colliders: idx }))).not.toBe(GOLDEN);
  });
});

describe('moveBox + colliders — engeller', () => {
  it('bank (yükseklik 1.2): yürüme durur, Z hit', () => {
    const idx = new ColliderIndex();
    idx.add(1, [[-1, 1, -3, 2, 2.2, -2]]);
    const w = flatWorld(idx);
    const body = createPlayerBody(0.5, 1, 0.5);
    walk(body, w, { moveZ: 1, yaw: 0 }, 180);
    expect(body.z).toBeGreaterThanOrEqual(-2 + 0.3 - 1e-6);
    expect(body.z).toBeLessThan(-2 + 0.3 + 0.02);
    expect(body.hitZ).toBe(true);
    expect(body.y).toBeCloseTo(1, 6);
  });

  it('otomat (1.0×2.0×0.8): sağa yürüme durur', () => {
    const idx = new ColliderIndex();
    idx.add(2, [[3, 1, 0, 4, 3, 0.8]]);
    const w = flatWorld(idx);
    const body = createPlayerBody(0.5, 1, 0.4);
    walk(body, w, { moveX: 1, yaw: 0 }, 180);
    expect(body.x).toBeLessThanOrEqual(3 - 0.3 + 1e-6);
    expect(body.x).toBeGreaterThan(3 - 0.3 - 0.02);
  });

  it('alçak kutu (0.5): otomatik basamak, üstünde durur', () => {
    const idx = new ColliderIndex();
    idx.add(3, [[-1, 1, -4, 2, 1.5, -2]]);
    const w = flatWorld(idx);
    const body = createPlayerBody(0.5, 1, 0.5);
    let topY = 0;
    for (let i = 0; i < 100; i++) {
      stepPlayer(body, { moveZ: 1, yaw: 0 }, w, DT, {}, { mode: 'macera' });
      if (body.onGround && body.z < -2.3 && body.z > -3.7) topY = body.y;
    }
    expect(topY).toBeCloseTo(1.5, 5); // kutunun üstünde yürüdü
    expect(body.z).toBeLessThan(-2);
  });

  it('1 blok yüksek kutuya zıplayıp çıkılır', () => {
    const idx = new ColliderIndex();
    idx.add(4, [[-1, 1, -3, 2, 2, -1.2]]);
    const w = flatWorld(idx);
    const body = createPlayerBody(0.5, 1, 0.5);
    let up = false;
    for (let i = 0; i < 240 && !up; i++) {
      stepPlayer(body, { moveZ: 1, yaw: 0, jump: body.z < -0.6 && body.z > -1.4 }, w, DT, {}, { mode: 'macera' });
      if (body.onGround && body.y > 1.9) up = true;
    }
    expect(up).toBe(true);
  });

  it('duvar boyunca kayma: çapraz yürürken paralel eksen sürer', () => {
    const idx = new ColliderIndex();
    idx.add(5, [[2, 1, -10, 3, 4, 10]]);
    const w = flatWorld(idx);
    const body = createPlayerBody(0.5, 1, 0.5);
    // yaw=0: ileri = -Z, sağ = +X: çapraz hareket duvara (X) sürtünür, Z'de akar
    walk(body, w, { moveX: 1, moveZ: 1, yaw: 0 }, 120);
    expect(body.x).toBeLessThanOrEqual(2 - 0.3 + 1e-6);
    expect(body.z).toBeLessThan(-5);
  });

  it('kutu içine gömülü başlayan gövde dışarı çıkabilir (sıkışmaz)', () => {
    const idx = new ColliderIndex();
    idx.add(6, [[-1, 1, -1, 1, 3, 1]]);
    const w = flatWorld(idx);
    const box = { minX: -0.3, minY: 1, minZ: -0.3, maxX: 0.3, maxY: 2.8, maxZ: 0.3 };
    const vel = { x: 3, y: 0, z: 0 };
    moveBox(w, box, vel, DT, {});
    expect(box.minX).toBeGreaterThan(-0.3);
  });

  it('çok yüksek hızda ince collider tünellenmez', () => {
    const idx = new ColliderIndex();
    idx.add(7, [[5, 1, -2, 5.0625, 5, 2]]);
    const w = flatWorld(idx);
    const box = { minX: 0, minY: 1, minZ: 0, maxX: 0.6, maxY: 2.8, maxZ: 0.6 };
    const vel = { x: 5000, y: 0, z: 0 };
    const r = moveBox(w, box, vel, DT, {});
    expect(r.hitX).toBe(true);
    expect(box.maxX).toBeCloseTo(5, 5);
    // yukarıdan aşağı
    idx.add(8, [[10, 3, 10, 12, 3.0625, 12]]);
    const b2 = { minX: 10.5, minY: 20, minZ: 10.5, maxX: 11.1, maxY: 21.8, maxZ: 11.1 };
    const v2 = { x: 0, y: -4000, z: 0 };
    const r2 = moveBox(w, b2, v2, DT, {});
    expect(r2.onGround).toBe(true);
    expect(b2.minY).toBeCloseTo(3.0625, 5);
  });

  it('isBoxFree collider içinde false, dışında true', () => {
    const idx = new ColliderIndex();
    idx.add(9, [[0, 1, 0, 1, 2, 1]]);
    const w = flatWorld(idx);
    expect(isBoxFree(w, 0.2, 1, 0.2, 0.8, 2.8, 0.8)).toBe(false);
    expect(isBoxFree(w, 2.2, 1, 2.2, 2.8, 2.8, 2.8)).toBe(true);
    expect(isBoxFree(flatWorld(null), 0.2, 1, 0.2, 0.8, 2.8, 0.8)).toBe(true);
  });

  it('çömelen oyuncu: collider üstünden kenar koruması da çalışır (düşmez)', () => {
    const idx = new ColliderIndex();
    idx.add(10, [[-2, 0.0625, -2, 2, 1, 2]]);
    const w = {
      colliders: idx,
      getBlock: (x, y) => (y <= -2 ? 1 : 0), // derin zemin; kutu üstünde duruyor
    };
    const body = createPlayerBody(0, 1, 0);
    for (let i = 0; i < 20; i++) stepPlayer(body, {}, w, DT, {}, { mode: 'macera' });
    expect(body.onGround).toBe(true);
    for (let i = 0; i < 240; i++) stepPlayer(body, { moveX: 1, yaw: 0, crouch: true }, w, DT, {}, { mode: 'macera' });
    expect(body.x).toBeLessThanOrEqual(2.31);
    expect(body.y).toBeCloseTo(1, 5);
  });
});

describe('moveBox + colliders — platform taşıma', () => {
  function platformSim(vx, vy, steps, rider) {
    const idx = new ColliderIndex();
    const w = flatWorld(idx);
    const plat = { x: 0, y: 0.5, z: 0 }; // üst yüzey y=1.0 (zemin 1'de değil: zemin üstü y=1 → platform üst yüzeyi 1.0+0.5)
    const box = () => [plat.x - 1, plat.y, plat.z - 1, plat.x + 1, plat.y + 0.5, plat.z + 1];
    plat.y = 1;
    idx.setDynamic(1, box(), { x: 0, y: 0, z: 0 });
    const body = createPlayerBody(0, 1.5, 0);
    for (let i = 0; i < 10; i++) stepPlayer(body, {}, w, DT, {}, { mode: 'macera' }); // platformun üstüne otur
    idx.setDynamic(1, box(), { x: vx, y: vy, z: 0 });
    const errs = [];
    for (let i = 0; i < steps; i++) {
      // gerçek sıra: oyuncu fiziği, sonra platform sistemi
      if (rider) stepPlayer(body, {}, w, DT, {}, { mode: 'macera' });
      plat.x += vx * DT;
      plat.y += vy * DT;
      idx.setDynamic(1, box(), { x: vx, y: vy, z: 0 });
      errs.push([body.x - plat.x, body.y - (plat.y + 0.5)]);
    }
    return { body, plat, errs };
  }

  it('yatay hareket eden platformdaki oyuncu onunla gider', () => {
    const { body, plat, errs } = platformSim(2, 0, 180, true);
    expect(plat.x).toBeCloseTo(6, 3);
    expect(body.onGround).toBe(true);
    for (let i = 5; i < errs.length; i++) {
      expect(Math.abs(errs[i][0])).toBeLessThan(0.05);
      expect(Math.abs(errs[i][1])).toBeLessThan(0.02);
    }
  });

  it('yukarı çıkan platform (asansör 8 b/sn): oyuncu batmaz ve geride kalmaz', () => {
    const { body, plat, errs } = platformSim(0, 8, 120, true);
    expect(plat.y).toBeCloseTo(1 + 16, 3);
    expect(body.onGround).toBe(true);
    for (let i = 5; i < errs.length; i++) {
      expect(Math.abs(errs[i][1])).toBeLessThan(0.02);
    }
    expect(body.y).toBeCloseTo(plat.y + 0.5, 1);
  });

  it('aşağı inen platform: oyuncu birlikte iner (havalanmaz)', () => {
    const { body, plat, errs } = platformSim(0, -4, 60, true);
    expect(body.onGround).toBe(true);
    for (let i = 5; i < errs.length; i++) expect(Math.abs(errs[i][1])).toBeLessThan(0.02);
    expect(body.y).toBeCloseTo(plat.y + 0.5, 1);
  });

  it('platformda olmayan oyuncu taşınmaz', () => {
    const idx = new ColliderIndex();
    const w = flatWorld(idx);
    idx.setDynamic(1, [10, 1, 10, 12, 1.5, 12], { x: 5, y: 0, z: 0 });
    const body = createPlayerBody(0, 1, 0);
    walk(body, w, {}, 60);
    expect(body.x).toBeCloseTo(0, 9);
    expect(body.z).toBeCloseTo(0, 9);
  });

  it('hız verilmeyen dinamik kutu statik gibi davranır', () => {
    const idx = new ColliderIndex();
    const w = flatWorld(idx);
    idx.setDynamic(1, [-1, 1, -1, 1, 1.5, 1]);
    const body = createPlayerBody(0, 1.5, 0);
    walk(body, w, {}, 60);
    expect(body.y).toBeCloseTo(1.5, 6);
    expect(body.x).toBeCloseTo(0, 9);
  });

  it('oyuncuya doğru gelen dinamik kutu: ilk temasta içine girmez (adım sonu konumuna karşı kırpılır)', () => {
    const idx = new ColliderIndex();
    const w = flatWorld(idx);
    const body = createPlayerBody(0, 1, 0);
    let bx = 8;
    let contact = false;
    let pen = 0;
    for (let i = 0; i < 300 && !contact; i++) {
      stepPlayer(body, { moveX: 1, yaw: 0 }, w, DT, {}, { mode: 'macera' });
      bx -= 3 * DT;
      idx.setDynamic(2, [bx, 1, -1, bx + 2, 3, 1], { x: -3, y: 0, z: 0 });
      const a = bodyAABB(body, {});
      if (a.maxX > bx - 0.01) {
        contact = true;
        pen = Math.max(0, a.maxX - bx);
      }
    }
    expect(contact).toBe(true);
    expect(pen).toBeLessThan(0.01);
  });
});

describe('moveBox + colliders — fuzz', () => {
  it('rastgele proplar + rastgele yürüyüş: gömülme yok, NaN yok', () => {
    const idx = new ColliderIndex();
    const q = (v) => Math.round(v * 16) / 16;
    const r = (seed, i) => hash32((seed + Math.imul(i, 0x9e3779b1)) | 0) / 4294967296;
    for (let i = 0; i < 60; i++) {
      const x = q((r(1, i * 3) - 0.5) * 30);
      const z = q((r(1, i * 3 + 1) - 0.5) * 30);
      const hgt = 0.5 + r(1, i * 3 + 2) * 2;
      idx.add(i + 1, [[x, 1, z, x + 0.5 + r(2, i) * 1.5, 1 + hgt, z + 0.5 + r(3, i) * 1.5]]);
    }
    const w = flatWorld(idx);
    let bad = 0;
    for (let s = 0; s < 6; s++) {
      const body = createPlayerBody(-14 + s * 5.3, 1, 14 - s * 4.1);
      // başlangıç gömülüyse kaydır
      for (let i = 0; i < 900; i++) {
        const phase = Math.floor(i / 30);
        const input = {
          moveX: (r(10 + s, phase * 2) - 0.5) * 2,
          moveZ: r(10 + s, phase * 2 + 1) > 0.2 ? 1 : 0,
          yaw: r(20 + s, phase) * 6.28,
          jump: r(30 + s, i) > 0.97,
          sprint: r(40 + s, phase) > 0.5,
        };
        stepPlayer(body, input, w, DT, {}, { mode: 'macera' });
        if (!Number.isFinite(body.x + body.y + body.z)) bad++;
      }
      const a = bodyAABB(body, {});
      if (overlapsAny(idx, a) && s > 0) bad++;
    }
    expect(bad).toBe(0);
  });
});

describe('moveBox + colliders — verim', () => {
  function timeIt(fn, laps) {
    const t = [];
    for (let i = 0; i < laps; i++) {
      const s = performance.now();
      fn();
      t.push(performance.now() - s);
    }
    t.sort((a, b) => a - b);
    return t[0] * 0.5 + t[Math.floor(t.length * 0.25)] * 0.5;
  }

  it('boş indeks ve gerçekçi yoğunlukta ≥ taban − %10', () => {
    const empty = new ColliderIndex();
    const props = new ColliderIndex();
    let id = 1;
    for (let i = 0; i < 60; i++) {
      const x = Math.round((hash32(i * 3) / 4294967296 - 0.5) * 40 * 16) / 16;
      const z = Math.round((hash32(i * 3 + 1) / 4294967296 - 0.5) * 24 * 16) / 16;
      props.add(id++, [[x, 1, z, x + 0.5, 2, z + 0.5]]);
    }
    for (let i = 0; i < 3000; i++) {
      const x = Math.round((60 + (hash32(i * 5) / 4294967296) * 300) * 16) / 16;
      const z = Math.round(((hash32(i * 5 + 1) / 4294967296) - 0.5) * 300 * 16) / 16;
      props.add(id++, [[x, 1, z, x + 0.5, 2, z + 0.5]]);
    }
    const A = makeBench(physics, null);
    const B = makeBench(physics, empty);
    const C = makeBench(physics, props);
    for (let k = 0; k < 3; k++) {
      timeIt(A, 30); timeIt(B, 30); timeIt(C, 30);
    }
    const ratios = [];
    for (let rep = 0; rep < 4; rep++) {
      const a = timeIt(A, 80);
      const b = timeIt(B, 80);
      const c = timeIt(C, 80);
      ratios.push([a / b, a / c]);
    }
    ratios.sort((x, y) => x[0] - y[0]);
    const bestEmpty = Math.max(...ratios.map((x) => x[0]));
    const bestProps = Math.max(...ratios.map((x) => x[1]));
    expect(bestEmpty).toBeGreaterThanOrEqual(0.9);
    expect(bestProps).toBeGreaterThanOrEqual(0.9);
  });
});
