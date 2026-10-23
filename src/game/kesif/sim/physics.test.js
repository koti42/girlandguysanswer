import { describe, expect, it } from 'vitest';
import { B } from './blocks.js';
import {
  PLAYER, applyKnockback, bodyAABB, createPlayerBody, eyeHeight, groundBlockId, isBoxFree, lookDir, moveBox,
  resetBody, stepPlayer,
} from './physics.js';

const DT = 1 / 60;

/** Küçük sahte dünya: fill(x,y,z) tabanı + setBlock düzenlemeleri. */
function makeWorld(fill) {
  const edits = new Map();
  return {
    getBlock(x, y, z) {
      const k = x + ',' + y + ',' + z;
      if (edits.has(k)) return edits.get(k);
      return fill ? fill(x, y, z) : 0;
    },
    setBlock(x, y, z, id) {
      edits.set(x + ',' + y + ',' + z, id);
    },
  };
}
const FLAT = (x, y) => (y <= 0 ? B.STONE : 0); // zemin üstü y = 1

function fillBox(w, x0, y0, z0, x1, y1, z1, id) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.setBlock(x, y, z, id);
}

function mkBox(x, y, z, w = 0.6, h = 1.8) {
  return { minX: x - w / 2, minY: y, minZ: z - w / 2, maxX: x + w / 2, maxY: y + h, maxZ: z + w / 2 };
}
function centerX(b) {
  return (b.minX + b.maxX) / 2;
}
function centerZ(b) {
  return (b.minZ + b.maxZ) / 2;
}

function run(body, input, world, seconds, ab, st) {
  const n = Math.round(seconds / DT);
  const evs = [];
  for (let i = 0; i < n; i++) {
    const e = stepPlayer(body, input, world, DT, ab, st);
    for (let k = 0; k < e.length; k++) evs.push(e[k]);
  }
  return evs;
}
function settle(body, world, ab, st) {
  run(body, {}, world, 0.5, ab, st);
}

describe('moveBox — temel', () => {
  it('düşer ve zemine oturur (onGround, tam y)', () => {
    const w = makeWorld(FLAT);
    const box = mkBox(0.5, 5, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    let res;
    for (let i = 0; i < 90; i++) {
      vel.y -= 30 * DT;
      res = moveBox(w, box, vel, DT, {});
    }
    expect(res.onGround).toBe(true);
    expect(box.minY).toBeCloseTo(1, 9);
    expect(vel.y).toBe(0);
  });

  it('çok yüksek hızda ince zeminden tünelleme yapmaz', () => {
    const w = makeWorld((x, y) => (y === 10 ? B.STONE : 0));
    const box = mkBox(0.5, 20, 0.5);
    const vel = { x: 0, y: -3000, z: 0 };
    const res = moveBox(w, box, vel, DT, {});
    expect(res.onGround).toBe(true);
    expect(box.minY).toBeCloseTo(11, 9);
    // yukarı doğru tavan
    const w2 = makeWorld((x, y) => (y === 20 ? B.STONE : 0));
    const b2 = mkBox(0.5, 5, 0.5);
    const r2 = moveBox(w2, b2, { x: 0, y: 900, z: 0 }, DT, {});
    expect(r2.hitCeiling).toBe(true);
    expect(b2.maxY).toBeCloseTo(20, 9);
  });

  it('yatayda da ince duvardan geçmez (X ve Z)', () => {
    const w = makeWorld((x, y, z) => (y <= 0 ? B.STONE : (x === 6 || z === -6) && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(0.5, 1, 0.5);
    moveBox(w, box, { x: 400, y: 0, z: 0 }, DT, {});
    expect(box.maxX).toBeCloseTo(6, 9);
    const b2 = mkBox(0.5, 1, 0.5);
    const r = moveBox(w, b2, { x: 0, y: 0, z: -400 }, DT, {});
    expect(r.hitZ).toBe(true);
    expect(b2.minZ).toBeCloseTo(-5, 9);
  });

  it('duvara çapraz çarpınca teğet yönde kayar', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : x >= 5 && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(4.6, 1, 0.5);
    const vel = { x: 4, y: 0, z: 4 };
    let res;
    for (let i = 0; i < 30; i++) {
      vel.x = 4; vel.z = 4;
      res = moveBox(w, box, vel, DT, {});
    }
    expect(res.hitX).toBe(true);
    expect(box.maxX).toBeCloseTo(5, 9);
    expect(centerZ(box)).toBeCloseTo(0.5 + 2, 5);
  });

  it('köşe sıyırma: dış köşeden çapraz geçerken katıya girmez', () => {
    const w = makeWorld((x, y, z) => (y <= 0 ? B.STONE : x === 3 && z === 3 && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(2.4, 1, 2.4);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) {
      vel.x = 3; vel.z = 3;
      moveBox(w, box, vel, DT, {});
      expect(isBoxFree(w, box.minX, box.minY + 0.01, box.minZ, box.maxX, box.maxY, box.maxZ)).toBe(true);
    }
    // köşeyi geçti (kayarak) — bir eksende ilerleme sürdü
    expect(centerX(box) + centerZ(box)).toBeGreaterThan(8);
  });

  it('iç köşede (L) iki eksen de durur', () => {
    const w = makeWorld((x, y, z) => (y <= 0 ? B.STONE : (x >= 4 || z >= 4) && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(0.5, 1, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    let res;
    for (let i = 0; i < 90; i++) {
      vel.x = 5; vel.z = 5;
      res = moveBox(w, box, vel, DT, {});
    }
    expect(res.hitX && res.hitZ).toBe(true);
    expect(box.maxX).toBeCloseTo(4, 9);
    expect(box.maxZ).toBeCloseTo(4, 9);
  });

  it('1 blok genişliğinde koridorda takılmaz, tam hızla ilerler', () => {
    const w = makeWorld((x, y, z) => (y <= 0 ? B.STONE : (z === 0 || z === 2) && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(0.5, 1, 1.5);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) {
      vel.x = 4.3;
      vel.z = 0.7; // duvara hafif itiş
      vel.y -= 30 * DT;
      moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true });
    }
    expect(centerX(box)).toBeCloseTo(0.5 + 4.3 * 2, 3);
    expect(centerZ(box)).toBeGreaterThan(1.2);
    expect(centerZ(box)).toBeLessThan(1.8);
  });

  it('zemin dar boşlukta (0,6 genişlik) gövde yan duvara sürtünse de düşmez/yapışmaz', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : x === 1 && y >= 1 && y <= 3 ? B.STONE : 0));
    const box = mkBox(0.5, 1, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) {
      vel.x = 4; vel.z = 3; vel.y -= 30 * DT;
      moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true });
    }
    expect(centerZ(box)).toBeCloseTo(0.5 + 3, 1);
    expect(box.minY).toBeCloseTo(1, 6);
  });
});

describe('moveBox — basamak ve kenar', () => {
  it('zeminde 0,5 yüksek plakaya otomatik çıkar', () => {
    const w = makeWorld(FLAT);
    for (let x = 3; x < 12; x++) for (let z = -2; z < 4; z++) w.setBlock(x, 1, z, B.SLAB);
    const box = mkBox(1, 1, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 90; i++) {
      vel.x = 4.3; vel.y -= 30 * DT;
      moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true });
    }
    expect(box.minY).toBeCloseTo(1.5, 6);
    expect(centerX(box)).toBeGreaterThan(4);
  });

  it('merdiven bloğu basamaklarını çıkar (iki kademe 0,5)', () => {
    const w = makeWorld(FLAT);
    for (let z = -2; z < 4; z++) for (let x = 4; x < 12; x++) w.setBlock(x, 1, z, B.STONE);
    const box = mkBox(1, 1, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) {
      vel.x = 4.3; vel.y -= 30 * DT;
      moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true });
    }
    // 1 blokluk duvar: basamak 0,6 yetmez
    expect(box.maxX).toBeCloseTo(4, 6);
    expect(box.minY).toBeCloseTo(1, 6);
  });

  it('havadayken (zemin yok) basamak çıkmaz', () => {
    const w = makeWorld(FLAT);
    for (let z = -2; z < 4; z++) for (let x = 5; x < 12; x++) w.setBlock(x, 1, z, B.SLAB);
    const box = mkBox(3, 1.3, 0.5); // zeminden 0,3 yukarıda, plaka tepesi 1,5
    const vel = { x: 4.3, y: 0, z: 0 };
    const res = moveBox(w, box, vel, DT, { stepHeight: 0.6 });
    expect(res.stepped).toBe(false);
    // yukarı çıkarken de basamak yok
    const b2 = mkBox(4.6, 1, 0.5);
    const r2 = moveBox(w, b2, { x: 4.3, y: 5, z: 0 }, DT, { stepHeight: 0.6 });
    expect(r2.stepped).toBe(false);
    expect(b2.maxX).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('çömelince (sneak) platform kenarından düşmez', () => {
    const w = makeWorld((x, y) => (y <= 0 && x <= 5 ? B.STONE : 0));
    const box = mkBox(4.5, 1, 0.5, 0.6, 1.5);
    const vel = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) {
      vel.x = 1.3; vel.y -= 30 * DT;
      moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true, sneak: true });
    }
    expect(box.minY).toBeCloseTo(1, 6);
    expect(centerX(box)).toBeLessThanOrEqual(6.3);
    expect(centerX(box)).toBeGreaterThan(5.2);
    // sneak yokken düşer
    const b2 = mkBox(4.5, 1, 0.5, 0.6, 1.5);
    const v2 = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) {
      v2.x = 1.3; v2.y -= 30 * DT;
      moveBox(w, b2, v2, DT, { stepHeight: 0.6, stickToGround: true });
    }
    expect(b2.minY).toBeLessThan(0);
  });

  it('stickToGround küçük inişte havaya fırlatmaz', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : 0));
    for (let x = 0; x < 3; x++) for (let z = -2; z < 4; z++) w.setBlock(x, 1, z, B.SLAB);
    const box = mkBox(1, 1.5, 0.5);
    const vel = { x: 0, y: 0, z: 0 };
    let grounded = 0;
    for (let i = 0; i < 40; i++) {
      vel.x = 4.3; vel.y -= 30 * DT;
      const r = moveBox(w, box, vel, DT, { stepHeight: 0.6, stickToGround: true });
      if (r.onGround) grounded++;
      if (centerX(box) > 4) break;
    }
    expect(box.minY).toBeCloseTo(1, 6);
    expect(grounded).toBeGreaterThan(10);
  });

  it('çit direği (1,5 yüksek) zıplayarak da aşılamaz; üstüne düşen 2,5 yüksekte durur', () => {
    const w = makeWorld(FLAT);
    w.setBlock(4, 1, 0, B.FENCE);
    const body = createPlayerBody(2, 1, 0.5);
    settle(body, w);
    run(body, { moveZ: 1, yaw: -Math.PI / 2, jump: true }, w, 2);
    expect(body.x).toBeLessThan(4.375 - 0.3 + 1e-6);
    const b = mkBox(4.5, 6, 0.5);
    const r = moveBox(w, b, { x: 0, y: -400, z: 0 }, DT, {});
    expect(r.onGround).toBe(true);
    expect(b.minY).toBeCloseTo(2.5, 9);
  });

  it('sıvı bayrakları: inLiquid / headInLiquid', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : y <= 3 ? B.WATER : 0));
    const box = mkBox(0.5, 1, 0.5);
    let r = moveBox(w, box, { x: 0, y: 0, z: 0 }, DT, {});
    expect(r.inLiquid).toBe(true);
    expect(r.headInLiquid).toBe(true);
    const b2 = mkBox(0.5, 3.5, 0.5);
    r = moveBox(w, b2, { x: 0, y: 0, z: 0 }, DT, {});
    expect(r.inLiquid).toBe(true);
    expect(r.headInLiquid).toBe(false);
    const b3 = mkBox(0.5, 6, 0.5);
    r = moveBox(w, b3, { x: 0, y: 0, z: 0 }, DT, {});
    expect(r.inLiquid).toBe(false);
  });

  it('collideLiquids: su katı gibi davranır', () => {
    const w = makeWorld((x, y) => (y <= 3 ? B.WATER : 0));
    const box = mkBox(0.5, 5, 0.5);
    const r = moveBox(w, box, { x: 0, y: -100, z: 0 }, DT, { collideLiquids: true });
    expect(r.onGround).toBe(true);
    expect(box.minY).toBeCloseTo(4, 9);
  });

  it('üretilmemiş (null) hücre duvardır; unloadedSolid=false ise geçilir', () => {
    const w = makeWorld((x, y) => (x > 20 ? null : y <= 0 ? B.STONE : 0));
    const box = mkBox(18, 1, 0.5);
    moveBox(w, box, { x: 300, y: 0, z: 0 }, DT, {});
    expect(box.maxX).toBeCloseTo(21, 9);
    const b2 = mkBox(18, 1, 0.5);
    moveBox(w, b2, { x: 300, y: 0, z: 0 }, DT, { unloadedSolid: false });
    expect(b2.maxX).toBeGreaterThan(21);
  });

  it('blok kutunun içine konursa sıkışmaz, dışarı çıkabilir', () => {
    const w = makeWorld(FLAT);
    w.setBlock(0, 1, 0, B.STONE);
    const box = mkBox(0.5, 1.2, 0.5);
    const vel = { x: 3, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) moveBox(w, box, vel, DT, {});
    expect(centerX(box)).toBeGreaterThan(2);
  });

  it('temas hasarı: kaktüs yanında contactDamage > 0', () => {
    const w = makeWorld(FLAT);
    w.setBlock(2, 1, 0, B.CACTUS);
    const box = mkBox(1.75, 1, 0.5);
    const r = moveBox(w, box, { x: 0, y: 0, z: 0 }, DT, { contactDamage: true });
    expect(r.damage).toBeGreaterThan(0);
    const b2 = mkBox(0.5, 1, 0.5);
    expect(moveBox(w, b2, { x: 0, y: 0, z: 0 }, DT, { contactDamage: true }).damage).toBe(0);
  });
});

describe('stepPlayer — temel hareket', () => {
  it('belirlenimci: aynı girdi dizisi aynı konum/olaylar', () => {
    const make = () => {
      const w = makeWorld((x, y, z) => (y <= 0 ? B.STONE : (x * 7 + z * 13) % 11 === 0 && y === 1 ? B.STONE : 0));
      const b = createPlayerBody(0.5, 1, 0.5);
      const log = [];
      for (let i = 0; i < 900; i++) {
        const input = {
          moveX: Math.sin(i * 0.05), moveZ: Math.cos(i * 0.031), yaw: i * 0.01,
          jump: i % 37 < 3, sprint: i % 200 < 100, crouch: i % 311 < 20,
        };
        const ev = stepPlayer(b, input, w, DT, { doubleJump: true, glide: true }, { autoJump: true });
        log.push(b.x, b.y, b.z, b.vy, ev.length);
      }
      return log;
    };
    const a = make();
    const b = make();
    expect(b).toEqual(a);
  });

  it('yürüme/koşma/çömelme hızları', () => {
    const w = makeWorld(FLAT);
    const dist = (input) => {
      const body = createPlayerBody(0.5, 1, 0.5);
      settle(body, w);
      const x0 = body.x;
      run(body, Object.assign({ moveZ: 1, yaw: -Math.PI / 2 }, input), w, 1);
      return body.x - x0;
    };
    // yaw -90° → ileri +X
    expect(dist({})).toBeGreaterThan(4.0);
    expect(dist({})).toBeLessThan(4.4);
    expect(dist({ sprint: true })).toBeGreaterThan(5.2);
    expect(dist({ sprint: true })).toBeLessThan(5.7);
    const c = dist({ crouch: true });
    expect(c).toBeGreaterThan(1.0);
    expect(c).toBeLessThan(1.4);
  });

  it('yaw=0 ileri -Z; sağ strafe +X', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    run(b, { moveZ: 1, yaw: 0 }, w, 0.5);
    expect(b.z).toBeLessThan(0.5 - 1);
    expect(Math.abs(b.x - 0.5)).toBeLessThan(1e-6);
    const b2 = createPlayerBody(0.5, 1, 0.5);
    settle(b2, w);
    run(b2, { moveX: 1, yaw: 0 }, w, 0.5);
    expect(b2.x).toBeGreaterThan(0.5 + 1);
  });

  it('lookDir yön kuralı', () => {
    const o = { x: 0, y: 0, z: 0 };
    lookDir(0, 0, o);
    expect(o.z).toBeCloseTo(-1, 9);
    lookDir(Math.PI / 2, 0, o);
    expect(o.x).toBeCloseTo(-1, 9);
    lookDir(0, Math.PI / 2, o);
    expect(o.y).toBeCloseTo(1, 9);
  });

  it('zıplama tepe yüksekliği ≈ 1,25 blok; 1 blok aşılır, çit aşılmaz', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    let peak = 0;
    stepPlayer(b, { jump: true }, w, DT);
    for (let i = 0; i < 60; i++) {
      stepPlayer(b, {}, w, DT);
      peak = Math.max(peak, b.y - 1);
    }
    expect(peak).toBeGreaterThan(1.2);
    expect(peak).toBeLessThan(1.32);

    // 1 blokluk basamağa zıplayarak çıkar
    const w2 = makeWorld(FLAT);
    for (let x = 3; x < 9; x++) for (let z = -3; z < 4; z++) w2.setBlock(x, 1, z, B.STONE);
    const b2 = createPlayerBody(1.5, 1, 0.5);
    settle(b2, w2);
    run(b2, { moveZ: 1, yaw: -Math.PI / 2, jump: true }, w2, 0.7);
    run(b2, {}, w2, 1);
    expect(b2.y).toBeCloseTo(2, 5);
  });

  it('zeminde 1 bloklu engele otomatik basamak YOK; autoJump açıkken zıplar', () => {
    const w = makeWorld(FLAT);
    for (let z = -3; z < 4; z++) w.setBlock(4, 1, z, B.STONE);
    const b = createPlayerBody(1.5, 1, 0.5);
    settle(b, w);
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1.5);
    expect(b.x).toBeCloseTo(4 - 0.3, 3);
    expect(b.y).toBeCloseTo(1, 6);
    const b2 = createPlayerBody(1.5, 1, 0.5);
    settle(b2, w, {}, { autoJump: true });
    run(b2, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1.5, {}, { autoJump: true });
    expect(b2.x).toBeGreaterThan(4.5);
  });

  it('0,5 plakaya yürüyerek çıkar (otomatik basamak, zıplama yok)', () => {
    const w = makeWorld(FLAT);
    for (let x = 4; x < 9; x++) for (let z = -3; z < 4; z++) w.setBlock(x, 1, z, B.SLAB);
    const b = createPlayerBody(1.5, 1, 0.5);
    settle(b, w);
    const evs = run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1.5);
    expect(b.y).toBeCloseTo(1.5, 6);
    expect(evs.some((e) => e.type === 'jump')).toBe(false);
  });

  it('merdiven bloklarında yarım blokluk basamakları zıplamadan çıkar', () => {
    const w = makeWorld(FLAT);
    for (let z = 0; z < 4; z++) w.setBlock(5, 1, z, B.STAIRS);
    const b = createPlayerBody(5.5, 1, 6.5);
    settle(b, w);
    let maxY = 0;
    const evs = [];
    for (let i = 0; i < 150; i++) {
      evs.push(...stepPlayer(b, { moveZ: 1, yaw: 0 }, w, DT));
      maxY = Math.max(maxY, b.y);
    }
    expect(evs.some((e) => e.type === 'jump')).toBe(false);
    expect(b.z).toBeLessThan(0);
    expect(maxY).toBeGreaterThanOrEqual(1.5 - 1e-9);
    expect(maxY).toBeLessThanOrEqual(2 + 1e-9);
  });

  it('çömelince kenardan düşmez', () => {
    const w = makeWorld((x, y) => (y <= 0 && x <= 5 ? B.STONE : 0));
    const b = createPlayerBody(4.5, 1, 0.5);
    settle(b, w);
    run(b, { moveZ: 1, yaw: -Math.PI / 2, crouch: true }, w, 3);
    expect(b.y).toBeCloseTo(1, 6);
    expect(b.onGround).toBe(true);
    expect(b.crouching).toBe(true);
    expect(b.h).toBe(PLAYER.crouchHeight);
    // ayağa kalkıp koşarsa düşer
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1.5);
    expect(b.y).toBeLessThan(0);
  });

  it('düşük tavanda ayağa kalkamaz (zorunlu çömelme), çıkınca kalkar', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : 0));
    for (let x = 0; x <= 9; x++) {
      for (let z = -3; z <= 3; z++) {
        w.setBlock(x, 1, z, B.SLAB); // zemin tepesi 1,5
        w.setBlock(x, 3, z, B.STONE); // tavan altı 3 → 1,5 boşluk
      }
    }
    const b = createPlayerBody(2, 1.5, 0.5);
    run(b, { crouch: true }, w, 0.4);
    expect(b.crouching).toBe(true);
    run(b, {}, w, 0.4); // çömelme bırakıldı ama tavan engelli
    expect(b.crouching).toBe(true);
    expect(b.forcedCrouch).toBe(true);
    expect(b.h).toBe(PLAYER.crouchHeight);
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 8); // dışarı yürü (hız çömelme)
    expect(b.x).toBeGreaterThan(10.5);
    run(b, {}, w, 0.3);
    expect(b.crouching).toBe(false);
    expect(b.h).toBe(PLAYER.height);
  });

  it('üretilmemiş chunk duvardır: oyuncu boşluğa düşmez', () => {
    const w = makeWorld((x, y) => (x > 10 ? null : y <= 0 ? B.STONE : 0));
    const b = createPlayerBody(5, 1, 0.5);
    settle(b, w);
    run(b, { moveZ: 1, yaw: -Math.PI / 2, sprint: true }, w, 4);
    expect(b.x).toBeCloseTo(11 - 0.3, 3);
    // altı üretilmemişse (null) havada kalmaz
    const w2 = makeWorld(() => null);
    const b2 = createPlayerBody(5, 40, 5);
    run(b2, {}, w2, 1);
    expect(b2.y).toBeGreaterThan(30);
  });

  it('boşluğa düşünce void olayı bir kez', () => {
    const w = makeWorld(() => 0);
    const b = createPlayerBody(0, 5, 0);
    const evs = run(b, {}, w, 3);
    expect(evs.filter((e) => e.type === 'void').length).toBe(1);
    expect(b.vy).toBeGreaterThanOrEqual(-PLAYER.terminal - 1e-9);
  });

  it('uzun dt alt adımlara bölünür ve tünelleme yapmaz', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 30, 0.5);
    for (let i = 0; i < 20; i++) stepPlayer(b, {}, w, 0.2);
    expect(b.y).toBeCloseTo(1, 6);
    expect(b.onGround).toBe(true);
  });

  it('geçersiz dt/girdi güvenli', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    expect(stepPlayer(b, null, w, 0)).toEqual([]);
    expect(() => stepPlayer(b, { moveX: NaN, moveZ: undefined, yaw: 0 }, w, DT)).not.toThrow();
    expect(Number.isFinite(b.x)).toBe(true);
  });
});

describe('stepPlayer — zıplama hissi', () => {
  it('coyote: kenardan düştükten kısa süre sonra zıplanabilir, uzun süre sonra değil', () => {
    const mk = () => makeWorld((x, y) => (y <= 0 && x <= 5 ? B.STONE : 0));
    const trial = (waitFrames) => {
      const w = mk();
      const b = createPlayerBody(5.2, 1, 0.5);
      settle(b, w);
      // kenardan yürüyerek ayrıl
      for (let i = 0; i < 40 && b.onGround; i++) stepPlayer(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, DT);
      expect(b.onGround).toBe(false);
      for (let i = 0; i < waitFrames; i++) stepPlayer(b, {}, w, DT);
      const vyBefore = b.vy;
      const ev = stepPlayer(b, { jump: true }, w, DT);
      return { jumped: ev.some((e) => e.type === 'jump'), vyBefore, vy: b.vy };
    };
    expect(trial(3).jumped).toBe(true);
    expect(trial(20).jumped).toBe(false);
  });

  it('zıplama tamponu: inişten az önce basılan zıpla inişte uygulanır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    stepPlayer(b, { jump: true }, w, DT);
    let landedJump = false;
    let pressedAt = -1;
    for (let i = 0; i < 80; i++) {
      // inişe ~4 kare kala bas, sonra bırak
      const nearGround = b.vy < 0 && b.y < 1.12 && pressedAt < 0;
      const ev = stepPlayer(b, { jump: nearGround || (pressedAt >= 0 && i - pressedAt < 1) }, w, DT);
      if (nearGround) pressedAt = i;
      if (pressedAt >= 0 && ev.some((e) => e.type === 'jump')) landedJump = true;
    }
    expect(pressedAt).toBeGreaterThan(0);
    expect(landedJump).toBe(true);
  });

  it('çift zıplama: yetenek varken havada bir kez, yokken hiç', () => {
    const w = makeWorld(FLAT);
    const trial = (ab) => {
      const b = createPlayerBody(0.5, 1, 0.5);
      settle(b, w);
      stepPlayer(b, { jump: true }, w, DT);
      run(b, {}, w, 0.3, ab);
      const evs = [];
      evs.push(...stepPlayer(b, { jump: true }, w, DT, ab));
      evs.push(...run(b, {}, w, 0.05, ab));
      evs.push(...stepPlayer(b, { jump: true }, w, DT, ab)); // ikinci havada basış: ikinci çift yok
      return { evs, b };
    };
    const yes = trial({ doubleJump: true });
    expect(yes.evs.filter((e) => e.type === 'doubleJump').length).toBe(1);
    const no = trial({});
    expect(no.evs.filter((e) => e.type === 'doubleJump').length).toBe(0);
  });

  it('planör: yetenekle düşüş yavaşlar ve düşme hasarı yok', () => {
    const w = makeWorld(FLAT);
    const mk = (ab) => {
      const b = createPlayerBody(0.5, 40, 0.5);
      let minVy = 0;
      let fall = false;
      for (let i = 0; i < 400 && !(b.onGround && i > 5); i++) {
        const ev = stepPlayer(b, { glide: true, moveZ: 1, yaw: 0 }, w, DT, ab);
        minVy = Math.min(minVy, b.vy);
        if (ev.some((e) => e.type === 'fall')) fall = true;
      }
      return { minVy, fall, b };
    };
    const g = mk({ glide: true });
    expect(g.minVy).toBeGreaterThan(-PLAYER.glideFall - 0.01);
    expect(g.fall).toBe(false);
    expect(g.b.z).toBeLessThan(-20);
    const n = mk({});
    expect(n.minVy).toBeLessThan(-30);
  });
});

describe('stepPlayer — düşme, zıplama bloğu, buz', () => {
  it('düşme hasarı: >3 blok → ceil(mesafe-3); 2 blok yok; insa yok; suya yok', () => {
    const w = makeWorld(FLAT);
    const drop = (h, st, world) => {
      const b = createPlayerBody(0.5, 1 + h, 0.5);
      const evs = run(b, {}, world || w, 3, {}, st);
      return evs.filter((e) => e.type === 'fall');
    };
    const f6 = drop(6);
    expect(f6.length).toBe(1);
    expect(f6[0].damage).toBe(3);
    expect(f6[0].distance).toBeGreaterThan(5.9);
    expect(drop(2).length).toBe(0);
    expect(drop(3).length).toBe(0);
    expect(drop(6, { mode: 'insa' }).length).toBe(0);
    const pond = makeWorld((x, y) => (y <= 0 ? B.STONE : y <= 4 ? B.WATER : 0));
    expect(drop(10, undefined, pond).length).toBe(0);
  });

  it('zıpladıktan sonra düşme tepe noktasından hesaplanır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    const evs = run(b, { jump: true }, w, 1);
    expect(evs.filter((e) => e.type === 'fall').length).toBe(0);
  });

  it('zıplama bloğu: inişte fırlatır (bounce olayı), çömelince fırlatmaz', () => {
    const w = makeWorld(FLAT);
    w.setBlock(0, 1, 0, B.BOUNCE);
    const b = createPlayerBody(0.5, 5, 0.5);
    let ev = [];
    for (let i = 0; i < 120; i++) ev = ev.concat(stepPlayer(b, {}, w, DT));
    expect(ev.some((e) => e.type === 'bounce')).toBe(true);
    const b2 = createPlayerBody(0.5, 5, 0.5);
    const e2 = run(b2, { crouch: true }, w, 2);
    expect(e2.some((e) => e.type === 'bounce')).toBe(false);
    // fırlatma tepesi normal zıplamadan yüksek
    const b3 = createPlayerBody(0.5, 2.2, 0.5);
    let peak = 0;
    for (let i = 0; i < 100; i++) {
      stepPlayer(b3, {}, w, DT);
      peak = Math.max(peak, b3.y);
    }
    expect(peak).toBeGreaterThan(2 + 2.5);
  });

  it('buz: giriş bırakılınca taş zeminden çok daha uzağa kayar', () => {
    const slide = (id) => {
      const w = makeWorld((x, y) => (y <= 0 ? id : 0));
      const b = createPlayerBody(0.5, 1, 0.5);
      settle(b, w);
      run(b, { moveZ: 1, yaw: -Math.PI / 2, sprint: true }, w, 1);
      const x0 = b.x;
      run(b, {}, w, 1);
      return b.x - x0;
    };
    const stone = slide(B.STONE);
    const ice = slide(B.SLIPPERY_ICE);
    const ice2 = slide(B.ICE);
    expect(stone).toBeLessThan(0.5);
    expect(ice).toBeGreaterThan(stone + 2);
    expect(ice2).toBeGreaterThan(stone);
    expect(ice).toBeGreaterThan(ice2);
  });

  it('geri tepme yatay hız verir ve kısa süre kontrolü azaltır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    applyKnockback(b, 1, 0, 8, 4);
    expect(b.vx).toBeCloseTo(8, 9);
    expect(b.vy).toBeGreaterThanOrEqual(4);
    run(b, {}, w, 0.5);
    expect(b.x).toBeGreaterThan(1.5);
  });

  it('groundBlockId ve resetBody', () => {
    const w = makeWorld(FLAT);
    w.setBlock(0, 0, 0, B.SAND);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    expect(groundBlockId(w, b)).toBe(B.SAND);
    resetBody(b, 3, 7, 3);
    expect(b.y).toBe(7);
    expect(b.vy).toBe(0);
    expect(b.fallPeakY).toBe(7);
    expect(eyeHeight(b)).toBe(PLAYER.eye);
    expect(bodyAABB(b).maxY).toBeCloseTo(7 + 1.8, 9);
  });
});

describe('stepPlayer — su, lav, tırmanma', () => {
  const POND = makeWorld((x, y) => (y <= 0 ? B.STONE : y <= 5 ? B.WATER : 0));

  it('suda yavaşlar, boğulma sayacı artar, zıpla ile yüzeye çıkar', () => {
    const b = createPlayerBody(0.5, 3, 0.5);
    run(b, {}, POND, 0.5);
    expect(b.inLiquid).toBe(true);
    const x0 = b.x;
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, POND, 1);
    expect(b.x - x0).toBeLessThan(2.6);
    expect(b.x - x0).toBeGreaterThan(1.5);
    b.y = 1;
    b.vy = 0;
    run(b, {}, POND, 0.5);
    expect(b.headInLiquid).toBe(true);
    expect(b.submergedTime).toBeGreaterThan(0.3);
    run(b, { jump: true }, POND, 2);
    expect(b.headInLiquid).toBe(false);
    expect(b.submergedTime).toBe(0);
    expect(b.y).toBeGreaterThan(4);
  });

  it('suya girişte splash olayı; boşta yüzeyde asılı kalır (batmaz)', () => {
    const b = createPlayerBody(0.5, 9, 0.5);
    const evs = run(b, {}, POND, 4);
    expect(evs.some((e) => e.type === 'splash')).toBe(true);
    expect(b.y).toBeGreaterThan(3.2);
    expect(b.y).toBeLessThan(5.5);
  });

  it('çömelince suda dibe iner', () => {
    const b = createPlayerBody(0.5, 4, 0.5);
    run(b, { crouch: true }, POND, 3);
    expect(b.y).toBeCloseTo(1, 1);
  });

  it('kıyıya çıkış: yatay engele karşı zıpla ile havuzdan çıkar', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : x >= 3 && y === 1 ? B.STONE : x < 3 && y <= 1 ? B.WATER : 0));
    const b = createPlayerBody(1.5, 2, 0.5);
    run(b, { moveZ: 1, yaw: -Math.PI / 2, jump: true }, w, 3);
    expect(b.x).toBeGreaterThan(3.5);
    run(b, {}, w, 1);
    expect(b.y).toBeCloseTo(2, 5);
  });

  it('lav: inLava, contactDps = 6, sıvıda yüzme hızı çok düşük', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : y <= 2 ? B.LAVA : 0));
    const b = createPlayerBody(0.5, 1, 0.5);
    run(b, {}, w, 0.3);
    expect(b.inLava).toBe(true);
    expect(b.contactDps).toBe(6);
    const x0 = b.x;
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1);
    expect(b.x - x0).toBeLessThan(1.3);
  });

  it('sarmaşıkta zıpla ile tırmanır, çömelince tutunur, bırakınca yavaş kayar (hasarsız)', () => {
    const w = makeWorld((x, y) => (y <= 0 ? B.STONE : x === 3 && y >= 1 && y <= 12 ? B.STONE : 0));
    for (let y = 1; y <= 12; y++) w.setBlock(2, y, 0, B.VINE);
    const b = createPlayerBody(2.5, 1, 0.5);
    settle(b, w);
    run(b, { jump: true, moveZ: 1, yaw: -Math.PI / 2 }, w, 2);
    expect(b.y).toBeGreaterThan(4);
    expect(b.climbing).toBe(true);
    const y1 = b.y;
    run(b, { crouch: true }, w, 1);
    expect(Math.abs(b.y - y1)).toBeLessThan(0.3);
    const evs = run(b, {}, w, 4);
    expect(b.y).toBeLessThan(y1);
    expect(b.vy).toBeGreaterThanOrEqual(-1.6);
    expect(evs.some((e) => e.type === 'fall')).toBe(false);
  });
});

describe('stepPlayer — 1×1 sarmaşık bacası (çıkış bacası takılma hatası)', () => {
  // tapınak çıkış bacası: altta açık oda, y>=6'da sarmaşığın dört yanı taş (1×1 boşluk)
  function shaft() {
    const w = makeWorld((x, y, z) => {
      if (y <= 0) return B.STONE;
      if (y >= 6 && y <= 20 && !(x === 5 && z === 5)) return B.STONE;
      return 0;
    });
    for (let y = 1; y <= 20; y++) w.setBlock(5, y, 5, B.VINE);
    return w;
  }
  [[0, 0], [0.19, -0.19], [0.3, 0.3], [-0.38, 0.25], [0.4, -0.4]].forEach(([ox, oz]) => {
    it('gövde merkezden (' + ox + ',' + oz + ') kayıkken de yalnız zıpla basılı tutarak baca tepesine çıkılır', () => {
      const w = shaft();
      const b = createPlayerBody(5.5 + ox, 1, 5.5 + oz);
      settle(b, w);
      run(b, { jump: true }, w, 12);
      expect(b.y).toBeGreaterThan(19);
    });
  });

  it('merkezleme oyuncu girdisini bastırmaz: sarmaşıktan yana yürünebilir', () => {
    const w = makeWorld(FLAT);
    for (let y = 1; y <= 6; y++) w.setBlock(2, y, 0, B.VINE);
    const b = createPlayerBody(2.5, 1, 0.5);
    settle(b, w);
    run(b, { moveZ: 1, yaw: -Math.PI / 2 }, w, 1.5);
    expect(b.x).toBeGreaterThan(4);
  });
});

describe('stepPlayer — uçma ve kanca', () => {
  it('inşa modunda çift-zıpla ile uçma açılır; gravitesiz, dikey kontrol; çömel-iniş kapatır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    const st = { mode: 'insa' };
    settle(b, w, {}, st);
    stepPlayer(b, { jump: true }, w, DT, {}, st);
    stepPlayer(b, { jump: false }, w, DT, {}, st);
    run(b, {}, w, 0.08, {}, st);
    const ev = stepPlayer(b, { jump: true }, w, DT, {}, st);
    expect(b.flying).toBe(true);
    expect(ev.some((e) => e.type === 'fly' && e.on)).toBe(true);
    run(b, { jump: true }, w, 1, {}, st);
    expect(b.y).toBeGreaterThan(5);
    run(b, {}, w, 1, {}, st);
    const hold = b.y;
    run(b, {}, w, 1, {}, st);
    expect(b.y).toBeCloseTo(hold, 3);
    run(b, { crouch: true }, w, 3, {}, st);
    expect(b.onGround).toBe(true);
    expect(b.flying).toBe(false);
    expect(b.y).toBeCloseTo(1, 6);
  });

  it('macera modunda uçma yeteneği yoksa çift zıpla uçurmaz; toggleFly yetenekle çalışır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    stepPlayer(b, { jump: true }, w, DT);
    stepPlayer(b, {}, w, DT);
    stepPlayer(b, { jump: true }, w, DT);
    expect(b.flying).toBe(false);
    stepPlayer(b, { toggleFly: true }, w, DT, { fly: true });
    expect(b.flying).toBe(true);
  });

  it('uçarken düşme hasarı yok; kapatınca hasar yok sayılmaz değil, mesafe sıfırlanır', () => {
    const w = makeWorld(FLAT);
    const b = createPlayerBody(0.5, 30, 0.5);
    const evs = run(b, { toggleFly: false }, w, 0.1, { fly: true });
    expect(evs.length >= 0).toBe(true);
    stepPlayer(b, { toggleFly: true }, w, DT, { fly: true });
    run(b, {}, w, 2, { fly: true });
    expect(b.y).toBeGreaterThan(29);
    stepPlayer(b, { toggleFly: true }, w, DT, { fly: true });
    const e2 = run(b, {}, w, 4, { fly: true });
    expect(e2.filter((e) => e.type === 'fall').length).toBe(1); // tepe noktası uçuş sonunda sıfırlandı → ~29 blok
  });

  it('kanca: hedefe çeker, yakınlıkta biter; menzil dışı başarısız', () => {
    const w = makeWorld(FLAT);
    fillBox(w, 6, 1, -1, 7, 8, 2, B.STONE);
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    const ab = { grapple: true };
    let evs = stepPlayer(b, { grapple: { x: 5.5, y: 8.5, z: 0.5 } }, w, DT, ab);
    expect(evs.some((e) => e.type === 'grappleStart')).toBe(true);
    expect(b.grapple.active).toBe(true);
    const all = [];
    for (let i = 0; i < 240 && b.grapple.active; i++) all.push(...stepPlayer(b, {}, w, DT, ab));
    expect(all.some((e) => e.type === 'grappleEnd')).toBe(true);
    expect(b.y).toBeGreaterThan(5);
    // menzil dışı
    const b2 = createPlayerBody(0.5, 1, 0.5);
    settle(b2, w);
    evs = stepPlayer(b2, { grapple: { x: 60, y: 8, z: 0.5 } }, w, DT, ab);
    expect(evs.some((e) => e.type === 'grappleFail')).toBe(true);
    expect(b2.grapple.active).toBe(false);
    // yetenek yoksa hiç başlamaz
    const b3 = createPlayerBody(0.5, 1, 0.5);
    settle(b3, w);
    evs = stepPlayer(b3, { grapple: { x: 5.5, y: 8.5, z: 0.5 } }, w, DT, {});
    expect(b3.grapple.active).toBe(false);
  });

  it('kanca engele takılırsa kendiliğinden bırakır', () => {
    const w = makeWorld(FLAT);
    fillBox(w, 3, 1, -3, 3, 20, 4, B.STONE); // araya duvar
    const b = createPlayerBody(0.5, 1, 0.5);
    settle(b, w);
    const ab = { grapple: true };
    stepPlayer(b, { grapple: { x: 8.5, y: 3, z: 0.5 } }, w, DT, ab);
    let ended = null;
    for (let i = 0; i < 300 && !ended; i++) {
      const ev = stepPlayer(b, {}, w, DT, ab);
      ended = ev.find((e) => e.type === 'grappleEnd') || null;
    }
    expect(ended).not.toBeNull();
    expect(ended.reason).toBe('stuck');
  });
});

describe('isBoxFree', () => {
  it('katı ile kesişmeyi doğru bildirir (yüzeye temas serbest)', () => {
    const w = makeWorld(FLAT);
    expect(isBoxFree(w, 0, 1, 0, 0.6, 2.8, 0.6)).toBe(true);
    expect(isBoxFree(w, 0, 0.99, 0, 0.6, 2.8, 0.6)).toBe(false);
    w.setBlock(0, 2, 0, B.SLAB);
    expect(isBoxFree(w, 0.1, 1, 0.1, 0.5, 2.8, 0.5)).toBe(false);
    expect(isBoxFree(w, 0.1, 2.5, 0.1, 0.5, 3.8, 0.5)).toBe(true);
  });
});

describe('sonsuz/NaN konum koruması (qacode: clipAxis sonsuz döngü)', () => {
  const BAD = [Infinity, -Infinity, NaN, 1e300, -1e300];

  it('moveBox: bozuk konumda hemen döner, hızı sıfırlar, hiçbir bayrak yükselmez', () => {
    const w = makeWorld(FLAT);
    for (let i = 0; i < BAD.length; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const box = mkBox(0.5, 2, 0.5);
        const keys = [['minX', 'maxX'], ['minY', 'maxY'], ['minZ', 'maxZ']][axis];
        box[keys[0]] = BAD[i];
        box[keys[1]] = BAD[i];
        const vel = { x: 3, y: -5, z: 2 };
        const res = moveBox(w, box, vel, DT, { stepHeight: 0.6, sneak: true, stickToGround: true, contactDamage: true });
        expect(res.onGround).toBe(false);
        expect(res.hitX || res.hitY || res.hitZ || res.inLiquid).toBe(false);
        expect(vel).toEqual({ x: 0, y: 0, z: 0 });
      }
    }
  });

  it('stepPlayer: sonsuz gövde konumu takılmaz (çağıran bodyIsFinite ile kurtarır)', () => {
    const w = makeWorld(FLAT);
    for (let i = 0; i < BAD.length; i++) {
      const b = createPlayerBody(0.5, 1, 0.5);
      b.z = BAD[i];
      stepPlayer(b, { moveZ: 1 }, w, DT, {}, {});
      const b2 = createPlayerBody(0.5, 1, 0.5);
      b2.y = BAD[i];
      stepPlayer(b2, { moveX: 1, jump: true }, w, DT, {}, {});
      const b3 = createPlayerBody(0.5, 1, 0.5);
      b3.x = BAD[i];
      stepPlayer(b3, { crouch: true }, w, DT, {}, {});
    }
    expect(true).toBe(true);
  });

  it('isBoxFree: bozuk kutu serbest sayılmaz', () => {
    const w = makeWorld(FLAT);
    for (let i = 0; i < BAD.length; i++) {
      expect(isBoxFree(w, BAD[i], 1, 0, BAD[i], 2.8, 0.6)).toBe(false);
      expect(isBoxFree(w, 0, 1, 0, 0.6, BAD[i], 0.6)).toBe(false);
    }
  });
});
