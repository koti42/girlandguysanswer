/*
 * KEŞİF sim — parkur erişilebilirlik BOTU (gerçek fizik): ana yoldaki HER ardışık platform çifti için betikli denetleyici
 * (koşu payı, sprint, kenarda zıpla, havada gaz kes, inişte fren) araması yapar; kaygan buz, 1×1 sütun ve dar kiriş dahil.
 * Hiçbir denetleyici iniş + kalma sağlayamıyorsa o sıçrama "ulaşılamaz" sayılır (insan oyuncu da yapamaz varsayımı yerine
 * en az bir kusursuz betik gerekir).
 */
import { describe, expect, it } from 'vitest';
import { createPlayerBody, stepPlayer } from './physics.js';
import { PARKOUR_TIERS, makeCourse, makeFnWriter } from './parkour.js';

const params = (seed, tier, i) => ({
  seed, id: 'parkur:' + i + ',' + (i * 3), tier, zone: Math.min(4, tier - 1), cx: 100 + i * 64, cz: -200 + i * 64, floorY: 50 + (i % 9),
});

export function worldOf(course) {
  const map = new Map();
  const set = (x, y, z, id) => { map.set(x + ',' + y + ',' + z, id); };
  const W = makeFnWriter ? makeFnWriter(set) : null;
  course.blocks(set);
  void W;
  return { getBlock: (x, y, z) => map.get(x + ',' + y + ',' + z) || 0 };
}

function inRect(q, x, z, pad) {
  return x >= q.x0 - pad && x < q.x1 + 1 + pad && z >= q.z0 - pad && z < q.z1 + 1 + pad;
}

/** A'dan B'ye: verilen denetleyici parametreleriyle sıçra; B üstünde 0.8 sn kalırsa true. */
export function tryHop(world, A, B, c) {
  const ax = (A.x0 + A.x1 + 1) / 2;
  const az = (A.z0 + A.z1 + 1) / 2;
  const bx = (B.x0 + B.x1 + 1) / 2;
  const bz = (B.z0 + B.z1 + 1) / 2;
  // B üstünde hedef nokta: merkez ya da A'ya en yakın noktadan c.aim içeride
  const nx = Math.min(Math.max(ax, B.x0 + 0.5), B.x1 + 0.5);
  const nz = Math.min(Math.max(az, B.z0 + 0.5), B.z1 + 0.5);
  const tx = c.aim === 0 ? bx : nx + (bx - nx) * c.aim;
  const tz = c.aim === 0 ? bz : nz + (bz - nz) * c.aim;
  // kalkış: A üstünde B'ye en yakın nokta, geri gidilerek koşu payı
  const ex = Math.min(Math.max(tx, A.x0 + 0.3), A.x1 + 0.7);
  const ez = Math.min(Math.max(tz, A.z0 + 0.3), A.z1 + 0.7);
  let dx = tx - ex;
  let dz = tz - ez;
  const dl = Math.hypot(dx, dz) || 1;
  dx /= dl;
  dz /= dl;
  let sx = ex;
  let sz = ez;
  for (let k = 0; k < 40; k++) {
    const px = ex - dx * (c.run * k) / 40;
    const pz = ez - dz * (c.run * k) / 40;
    if (!inRect(A, px, pz, -0.25)) break;
    sx = px;
    sz = pz;
  }
  const body = createPlayerBody(sx, A.y + 1, sz);
  const yaw = Math.atan2(-dx, -dz);
  const st = { mode: 'macera' };
  // yere otur
  for (let i = 0; i < 20; i++) stepPlayer(body, { moveZ: 0, yaw }, world, 1 / 60, {}, st);
  let jumped = false;
  let air = 0;
  let landedAt = -1;
  for (let i = 0; i < 360; i++) {
    const inp = { moveX: 0, moveZ: c.speed, yaw, sprint: c.sprint, jump: false, jumpPressed: false, crouch: false };
    const px = body.x + dx * 0.3 * (c.sprint ? 1 : 0.8);
    const pz = body.z + dz * 0.3 * (c.sprint ? 1 : 0.8);
    const edge = !inRect(A, px, pz, c.jumpOff);
    if (!jumped && body.onGround && (edge || i > 200)) {
      inp.jump = true;
      inp.jumpPressed = true;
      jumped = true;
    }
    if (jumped) {
      air++;
      if (c.cut > 0 && air > c.cut) inp.moveZ = c.airback ? -1 : 0;
    }
    if (landedAt >= 0 && c.brake) {
      const sp = Math.hypot(body.vx, body.vz);
      inp.moveZ = sp > 0.4 ? -1 : 0;
      inp.sprint = false;
    } else if (landedAt >= 0) {
      inp.moveZ = 0;
    }
    stepPlayer(body, inp, world, 1 / 60, {}, st);
    if (body.y < Math.min(A.y, B.y) - 3) return false;
    if (jumped && body.onGround && landedAt < 0 && air > 3) {
      if (!inRect(B, body.x, body.z, 0.28) || Math.abs(body.y - (B.y + 1)) > 0.05) return false;
      landedAt = i;
    }
    if (landedAt >= 0 && i - landedAt > 60) {
      return inRect(B, body.x, body.z, 0.28) && body.onGround;
    }
  }
  return false;
}

export function feasible(world, A, B) {
  const sprints = [true, false];
  const runs = [0, 0.7, 1.4, 2.2, 3];
  const cuts = [0, 24, 18, 12, 30];
  const aims = [0, 0.5, 1];
  const offs = [0, 0.18];
  const brakes = [false, true];
  const speeds = [1, 0.55];
  const airbacks = [false, true];
  for (const speed of speeds) {
    for (const aim of aims) {
      for (const sprint of sprints) {
        if (sprint && speed < 1) continue;
        for (const run of runs) {
          for (const cut of cuts) {
            for (const airback of airbacks) {
              if (airback && cut === 0) continue;
              for (const jumpOff of offs) {
                for (const brake of brakes) {
                  const c = { sprint, run, cut, aim, jumpOff, brake, speed, airback };
                  if (tryHop(world, A, B, c)) return c;
                }
              }
            }
          }
        }
      }
    }
  }
  return null;
}

describe('parkur tabelası ilk sıçrama şeridinde durmaz', () => {
  it('tüm kademeler × tohum: tabela ilk platformun TERS yanında; ilk platform ile tabela arasında kalan boşluk hücresi boş', () => {
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 12; i++) {
        const c = makeCourse(params(9100 + i * 131, tier, i));
        const A = c.platforms[0];
        const B = c.platforms[1];
        const sg = c.signs[0];
        const dx = (B.x0 + B.x1) / 2 - (A.x0 + A.x1) / 2;
        const dz = (B.z0 + B.z1) / 2 - (A.z0 + A.z1) / 2;
        if (Math.abs(dx) >= Math.abs(dz)) {
          expect(Math.sign(sg.x - (A.x0 + A.x1) / 2), 'kademe ' + tier + ' #' + i).toBe(-Math.sign(dx));
        } else {
          expect(Math.sign(sg.z - (A.z0 + A.z1) / 2), 'kademe ' + tier + ' #' + i).toBe(-Math.sign(dz));
        }
        const world = worldOf(c);
        expect(world.getBlock(sg.x, sg.y, sg.z)).toBeGreaterThan(0);
      }
    }
  });
});

describe('parkur botu: ana yoldaki her sıçrama gerçek fizikte yapılabilir', () => {
  for (let tier = 1; tier <= 5; tier++) {
    it('kademe ' + tier + ' (' + PARKOUR_TIERS[tier].name + '): ardışık tüm platform çiftleri', () => {
      const bad = [];
      let hops = 0;
      const n = 10;
      for (let i = 0; i < n; i++) {
        const c = makeCourse(params(4000 + i * 977, tier, i));
        const world = worldOf(c);
        for (let k = 1; k < c.platforms.length; k++) {
          const A = c.platforms[k - 1];
          const B = c.platforms[k];
          hops++;
          if (!feasible(world, A, B)) bad.push({ i, k, a: A.kind + ' ' + A.w + 'x' + A.d, b: B.kind + ' ' + B.w + 'x' + B.d, dy: B.y - A.y });
        }
      }
      const byKind = {};
      bad.forEach((x) => { const k = x.b.split(' ')[0] + '/' + x.a.split(' ')[0]; byKind[k] = (byKind[k] || 0) + 1; });
      if (bad.length) console.log('kademe ' + tier + ' tur ozeti ' + JSON.stringify(byKind));
      if (bad.length) console.log('kademe ' + tier + ' ulaşılamaz sıçramalar ' + bad.length + '/' + hops + ': ' + JSON.stringify(bad.slice(0, 12)));
      expect(bad.length, JSON.stringify(bad.slice(0, 6))).toBe(0);
    }, 600000);
  }
});
