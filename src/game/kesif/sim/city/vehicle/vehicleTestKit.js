/*
 * KEŞİF sim/city/vehicle — TEST KİTİ (yalnız testler/ölçümler): sahte düz dünya, kutu yerleştirme, gerçek şehir dünyası, sürücü (pure pursuit), özet yardımcıları.
 *
 *   flatWorld({ground=63, fill=B.STONE}) → world {getBlock, setBlock, colliders:null, edits}   (üst yüzey y = ground+1)
 *   fillBox(w, x0,y0,z0,x1,y1,z1, id)            tamsayı hücre kutusu (dahil)
 *   attachColliders(w) → ColliderIndex            world.colliders atar
 *   cityWorld(seed, [cx0,cx1], [cz0,cz1]) → {world, layer, seed}     gerçek neon World + prop katmanı, aralıktaki chunk'lar üretilmiş
 *   makeRng(seed) → () → [0,1)
 *   run(v, world, secs, inputOrFn, ctx) → {steps, events:{tip:n}, maxSpeed, minY, maxY, maxPenetration?}
 *   pursuit(v, route, state) → input     basit hedef noktası izleyici (yol boyunca sürüş testleri)
 */
import { B } from '../../blocks.js';
import { World } from '../../world.js';
import { dimSeed } from '../../dim/dimensions.js';
import { ColliderIndex } from '../../props/colliderIndex.js';
import { attachPropLayer, createPropLayer } from '../../props/propLayer.js';
import { mulberry32 } from '../../rng.js';
import { stepVehicle } from './vehiclePhysics.js';

export function flatWorld(opts) {
  const o = opts || {};
  const ground = o.ground === undefined ? 63 : o.ground;
  const fill = o.fill === undefined ? B.STONE : o.fill;
  const edits = new Map();
  return {
    colliders: null,
    killPlaneY: -448,
    edits,
    getBlock(x, y, z) {
      const k = x + ',' + y + ',' + z;
      const e = edits.get(k);
      if (e !== undefined) return e;
      return y <= ground ? fill : 0;
    },
    setBlock(x, y, z, id) {
      edits.set(x + ',' + y + ',' + z, id);
    },
  };
}

export function fillBox(w, x0, y0, z0, x1, y1, z1, id) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.setBlock(x, y, z, id);
}

export function attachColliders(w) {
  const cc = new ColliderIndex();
  w.colliders = cc;
  return cc;
}

export function cityWorld(seedIn, cxs, czs) {
  const seed = dimSeed(seedIn, 'neon');
  const world = new World({ seed, mode: 'macera', dim: 'neon' });
  const layer = createPropLayer({ citySeed: seed });
  attachPropLayer(world, layer);
  for (let cx = cxs[0]; cx <= cxs[1]; cx++) for (let cz = czs[0]; cz <= czs[1]; cz++) world.ensureChunk(cx, cz);
  return { world, layer, seed };
}

export function makeRng(seed) {
  return mulberry32(seed >>> 0);
}

export function run(v, world, secs, input, ctx) {
  const n = Math.round(secs * 60);
  const out = {
    steps: n, events: {}, maxSpeed: 0, minY: Infinity, maxY: -Infinity, bumps: 0,
  };
  for (let i = 0; i < n; i++) {
    const inp = typeof input === 'function' ? input(i, v) : input;
    const ev = stepVehicle(v, inp, world, 1 / 60, ctx);
    for (let k = 0; k < ev.length; k++) out.events[ev[k].type] = (out.events[ev[k].type] || 0) + 1;
    const sp = Math.hypot(v.vx, v.vz);
    if (sp > out.maxSpeed) out.maxSpeed = sp;
    if (v.y < out.minY) out.minY = v.y;
    if (v.y > out.maxY) out.maxY = v.y;
  }
  return out;
}

/**
 * pursuit: route = [[x,z],…] (sırayla); state {i}. Hedef noktaya doğru direksiyon, hız hedefi (speed) için gaz/fren.
 * Dönüş: input {steer, throttle, brake}. Son noktaya ulaşınca state.done = true.
 */
export function pursuit(v, route, state, speed, look) {
  const st = state;
  const L = look || 9;
  while (st.i < route.length - 1) {
    const dx = route[st.i][0] - v.x;
    const dz = route[st.i][1] - v.z;
    if (dx * dx + dz * dz < L * L) st.i++;
    else break;
  }
  const t = route[st.i];
  if (st.i >= route.length - 1 && Math.hypot(t[0] - v.x, t[1] - v.z) < 3) st.done = true;
  const dx = t[0] - v.x;
  const dz = t[1] - v.z;
  const want = Math.atan2(-dx, -dz);
  let diff = want - v.yaw;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const sp = Math.sqrt(v.vx * v.vx + v.vz * v.vz);
  const steer = Math.max(-1, Math.min(1, -diff * 1.6));
  return {
    steer,
    throttle: sp < speed ? Math.min(1, (speed - sp) * 0.5 + 0.2) : 0,
    brake: sp > speed + 3 ? Math.min(1, (sp - speed - 3) * 0.2) : 0,
  };
}
