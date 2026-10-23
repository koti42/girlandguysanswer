/*
 * hareketliplatform — çözülen salondan ÇIKIŞ yürünebilir (gerçek fizik).
 * Gerçek GPU oyun testinde (zorluk 3–5: bitiş adası +2 yüksek) arka kapı 3 blok yüksekliğinde ve zeminden başladığı için ada üstündeki
 * oyuncu kapıya sığmıyordu: bulmaca çözülüyor ama türbe hazine odası / zincirdeki sonraki oda ulaşılmaz kalıyordu.
 */
import { describe, expect, it } from 'vitest';
import { createPlayerBody, stepPlayer } from '../physics.js';
import {
  buildPuzzleRoom, fakeManager, frame,
} from './index.js';
import './hareketliplatform.js';

const ORIGIN = { x: 40, y: 30, z: 40 };

function solveAndWalkOut(difficulty, facing, seed) {
  const h = fakeManager({ seed });
  const desc = {
    id: 'hpx:' + difficulty + ':' + facing + ':' + seed, type: 'hareketliplatform', origin: ORIGIN, facing, difficulty, zone: 1,
  };
  buildPuzzleRoom(desc, { seed, setBlock: h.world.writer() });
  h.mgr.register(desc.id, desc);
  const F = frame({
    origin: ORIGIN, facing, seed: 0, setBlock() {},
  });
  const e = h.mgr.get(desc.id);
  const L = e.state.lay;
  const goal = L.isl[L.isl.length - 1];
  const plate = F.toWorld(goal.plate.lx, goal.y, goal.plate.lz);
  h.mgr.handleInteract({
    type: 'step', x: plate.x, y: plate.y, z: plate.z,
  });
  expect(h.mgr.get(desc.id).state.done, 'çözülmedi').toBe(true);
  const dir = F.dir(0, 1);
  const door = e.anchors.door;
  const world = { getBlock: (x, y, z) => h.world.getBlock(x, y, z) };
  const body = createPlayerBody(plate.x + 0.5, plate.y, plate.z + 0.5);
  for (let i = 0; i < 20; i++) stepPlayer(body, { yaw: 0 }, world, 1 / 60, {}, { mode: 'macera' });
  const startY = body.y;
  const yaw = Math.atan2(-dir.dx, -dir.dz);
  const along = (x, z) => x * dir.dx + z * dir.dz;
  const doorA = along(door.x + 0.5, door.z + 0.5);
  let passed = false;
  for (let i = 0; i < 900; i++) {
    stepPlayer(body, {
      moveX: 0, moveZ: 1, yaw, sprint: false,
    }, world, 1 / 60, {}, { mode: 'macera' });
    if (along(body.x, body.z) > doorA + 1.5 && body.onGround) { passed = true; break; }
  }
  return { passed, startY, endY: body.y, door, goalY: goal.y };
}

describe('hareketliplatform: çözülen salondan çıkış', () => {
  for (const d of [3, 4, 5]) {
    it('zorluk ' + d + ': bitiş adasından arka kapıdan yürüyerek çıkılır (4 yön × 3 tohum)', () => {
      for (let f = 0; f < 4; f++) {
        for (const seed of [3, 7, 19]) {
          const r = solveAndWalkOut(d, f, seed);
          expect(r.passed, 'd' + d + ' yön ' + f + ' tohum ' + seed + ' ' + JSON.stringify(r)).toBe(true);
          expect(r.goalY).toBeGreaterThanOrEqual(2); // test gerçekten yüksek bitiş adasını kapsıyor
        }
      }
    });
  }

  it('zorluk 1–2 (düz bitiş adası) çıkış davranışı bozulmadı', () => {
    for (const d of [1, 2]) {
      const r = solveAndWalkOut(d, 0, 7);
      expect(r.passed, JSON.stringify(r)).toBe(true);
    }
  });
});
