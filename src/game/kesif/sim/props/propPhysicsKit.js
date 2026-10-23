/*
 * KEŞİF sim/props — fizik test kiti (yalnız testler ve ölçümler kullanır; oyun kodu içe aktarmaz).
 *
 *   makeArenaWorld(opts?)                 sahte voxel dünyası (zemin y<=0 taş; duvar, plaka, merdiven, çit, su, buz, merdiven…)
 *   goldenPhysicsDigest(physics, world)   belirlenimci betikli oturum → tek metin özeti ("altın" bayt-aynılık denetimi)
 *   makeBench(colliders?)                 moveBox çıktı verimi ölçümü için sabit iş yükü
 *
 * `goldenPhysicsDigest` fizik kancasından ÖNCE üretilen özetle karşılaştırılır (propPhysics.golden.test.js): world.colliders===null
 * (ve boş ColliderIndex) iken sonuçlar bayt-bayt aynı olmalıdır. Girdi dizileri yalnız hash32'den gelir (Math.random yok).
 */
import { B } from '../blocks.js';
import { hash32 } from '../rng.js';

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

/** FNV-1a tabanlı kayan nokta özetleyici (float64 bit düzeni). */
export function createDigest() {
  let h = 0x811c9dc5;
  const mix = (v) => {
    h ^= v >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  return {
    f(v) {
      F64[0] = v;
      mix(U32[0]);
      mix(U32[1]);
    },
    b(v) {
      mix(v ? 1 : 0);
    },
    i(v) {
      mix(v | 0);
    },
    hex() {
      return (h >>> 0).toString(16).padStart(8, '0');
    },
  };
}

/** Çalışma alanı: x,z ∈ [-24,24]; zemin y<=0; üstünde çeşitli engeller. */
export function makeArenaWorld(opts) {
  const o = opts || {};
  const edits = new Map();
  const world = {
    colliders: o.colliders === undefined ? null : o.colliders,
    getBlock(x, y, z) {
      const k = x + ',' + y + ',' + z;
      if (edits.has(k)) return edits.get(k);
      if (y <= 0) {
        if (x >= -8 && x <= -4 && z >= 0 && z <= 4 && y === 0) return B.WATER;
        if (x >= 14 && x <= 20 && z >= -8 && z <= -2 && y === 0) return B.SLIPPERY_ICE;
        return B.STONE;
      }
      if (y > 40) return 0;
      if (x === 6 && y >= 1 && y <= 3 && z >= -10 && z <= 10) return B.STONE;
      if (z === -14 && y >= 1 && y <= 2 && x >= -10 && x <= 10) return B.FENCE;
      if (y === 1 && x === 3 && z === 0) return B.SLAB;
      if (x >= 10 && x <= 13 && z >= 2 && z <= 4 && y >= 1 && y <= x - 9) return B.STONE;
      if (x === -12 && z === 8 && y >= 1 && y <= 6) return B.LADDER;
      if (x === -13 && z === 8 && y >= 1 && y <= 6) return B.STONE;
      if (x === 0 && z === 12 && y === 2) return B.STONE; // alçak tavan kirişi
      return 0;
    },
    setBlock(x, y, z, id) {
      edits.set(x + ',' + y + ',' + z, id);
    },
  };
  return world;
}

function rnd(seed, i) {
  return hash32((seed + Math.imul(i, 0x9e3779b1)) | 0) / 4294967296;
}

/**
 * Betikli oturum: 3 farklı başlangıç noktası × 480 adım rastgele (hash) girdi ile stepPlayer, ardından 400 moveBox çağrısı
 * (farklı seçeneklerle). Her adımın tüm sayısal çıktısı özete girer.
 */
export function goldenPhysicsDigest(physics, world) {
  const d = createDigest();
  const {
    createPlayerBody, stepPlayer, moveBox, isBoxFree,
  } = physics;
  const starts = [[0.5, 1, 0.5], [8.5, 1, 6.5], [-6.5, 2, 2.5]];
  const abilities = { doubleJump: true, glide: false, grapple: false, fly: false };
  for (let s = 0; s < starts.length; s++) {
    const body = createPlayerBody(starts[s][0], starts[s][1], starts[s][2]);
    for (let i = 0; i < 480; i++) {
      const r = (k) => rnd(1000 + s * 77, i * 8 + k);
      const phase = Math.floor(i / 40);
      const input = {
        moveX: phase % 3 === 0 ? 0 : (r(0) - 0.5) * 2,
        moveZ: phase % 4 === 1 ? 0 : (r(1) > 0.25 ? 1 : -0.5),
        yaw: (phase * 0.9 + r(2) * 0.2) % 6.283,
        jump: r(3) > 0.8,
        sprint: r(4) > 0.4,
        crouch: phase % 5 === 4,
        jumpPressed: false,
      };
      const ev = stepPlayer(body, input, world, 1 / 60, abilities, { mode: 'macera', autoJump: s === 2 });
      d.f(body.x); d.f(body.y); d.f(body.z); d.f(body.vx); d.f(body.vy); d.f(body.vz);
      d.b(body.onGround); d.b(body.hitX); d.b(body.hitZ); d.b(body.inLiquid); d.i(ev.length);
    }
  }
  const box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const out = {};
  for (let i = 0; i < 400; i++) {
    const r = (k) => rnd(5150, i * 8 + k);
    const w = 0.4 + r(0) * 0.8;
    const h = 0.5 + r(1) * 1.6;
    const cx = (r(2) - 0.5) * 36;
    const cz = (r(3) - 0.5) * 36;
    const cy = 1 + r(4) * 6;
    box.minX = cx - w / 2; box.maxX = cx + w / 2;
    box.minZ = cz - w / 2; box.maxZ = cz + w / 2;
    box.minY = cy; box.maxY = cy + h;
    vel.x = (r(5) - 0.5) * 30; vel.y = (r(6) - 0.6) * 20; vel.z = (r(7) - 0.5) * 30;
    const opts = {
      stepHeight: i % 3 === 0 ? 0.6 : 0,
      stickToGround: i % 4 === 0,
      collideLiquids: i % 7 === 0,
      sneak: i % 5 === 0,
      contactDamage: i % 2 === 0,
      out,
    };
    const res = moveBox(world, box, vel, 1 / 60, opts);
    d.f(box.minX); d.f(box.minY); d.f(box.minZ); d.f(box.maxX); d.f(box.maxY); d.f(box.maxZ);
    d.f(vel.x); d.f(vel.y); d.f(vel.z);
    d.b(res.onGround); d.b(res.hitX); d.b(res.hitY); d.b(res.hitZ); d.b(res.stepped); d.b(res.inLiquid);
    d.b(isBoxFree(world, box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ));
  }
  return d.hex();
}

/**
 * moveBox verim ölçümü için sabit iş yükü: oyuncu boyutunda kutu, yürüme hızında, ~2 sn döngü. colliders verilirse dünyaya takılır.
 * Dönen işlev bir "tur" (240 çağrı) çalıştırır ve özet döner.
 */
export function makeBench(physics, colliders) {
  const world = makeArenaWorld({ colliders: colliders || null });
  const { moveBox } = physics;
  const box = { minX: -0.3, minY: 1, minZ: -0.3, maxX: 0.3, maxY: 2.8, maxZ: 0.3 };
  const vel = { x: 0, y: 0, z: 0 };
  const out = {};
  const opts = {
    stepHeight: 0.6, stickToGround: true, collideLiquids: false, sneak: false, contactDamage: true, out,
  };
  let t = 0;
  return function lap() {
    let acc = 0;
    for (let i = 0; i < 240; i++) {
      t += 1;
      const a = t * 0.013;
      vel.x = Math.cos(a) * 4.3;
      vel.z = Math.sin(a) * 4.3;
      vel.y -= 30 / 60;
      moveBox(world, box, vel, 1 / 60, opts);
      if (box.minX < -20 || box.maxX > 20 || box.minZ < -12 || box.maxZ > 12) {
        box.minX = -0.3; box.maxX = 0.3; box.minZ = -0.3; box.maxZ = 0.3; box.minY = 1; box.maxY = 2.8;
      }
      acc += box.minX + box.minZ;
    }
    return acc;
  };
}
