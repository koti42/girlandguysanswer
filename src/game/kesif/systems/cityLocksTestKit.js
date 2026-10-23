/*
 * KEŞİF — cityLocks testleri için ORTAK DÜZENEKLER (yalnız test dosyaları içe aktarır).
 *
 *   makeCityG(seed, opts?) → {G, world, pw, sys, events, said, sounds, tick(n), usedProp(prop)}
 *       GERÇEK şehir üretimi (generateCityChunk + iç mekân kancası) üstünde blok kaplaması (setBlock kaydı), GERÇEK PropWorld/ColliderIndex (propsForChunk, asansör
 *       düğmeleri dahil), gerçek Inventory; ince sahte G (emit/hint/speak/sound/setUi). opts.body {x,y,z}; opts.accessibility.
 *   findLockedBuilding(seed, kind, opts?) → {lot, bp, it, door, lock} | null     gerçek iç mekânlı, istenen kilit türünde kapısı olan bina
 *   propsAround(pw, x, z, r?) → [{id,key,x,y,z}]
 */
import { Inventory } from '../sim/inventory.js';
import { generateCityChunk } from '../sim/city/cityGen.js';
import { planInterior } from '../sim/city/interior/index.js';
import { interiorLots } from '../sim/city/interior/testKit.js';
import { ColliderIndex } from '../sim/props/colliderIndex.js';
import { PropWorld } from '../sim/props/propWorld.js';
import { createSystem } from './cityLocks.js';
import { lockSeed, lockSpec, normalizeLock } from '../sim/city/interior/locks.js';
import { isHiddenDoor } from '../sim/city/interior/lockLookup.js';

export function overlayWorld(seed) {
  const cache = new Map();
  const overlay = new Map();
  const writes = [];
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const world = {
    dim: 'neon',
    seed,
    colliders: null,
    yMin: -400,
    yMax: 362,
    overlay,
    writes,
    getBlock(x, y, z) {
      const k = key(x, y, z);
      if (overlay.has(k)) return overlay.get(k);
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const ck = cx + ',' + cz;
      let c = cache.get(ck);
      if (!c) {
        c = generateCityChunk(seed, cx, cz, { light: false });
        cache.set(ck, c);
      }
      return c.get(x - cx * 16, y, z - cz * 16);
    },
    setBlock(x, y, z, id, opts) {
      overlay.set(key(x, y, z), id);
      writes.push([x, y, z, id, opts && opts.record === false]);
      return true;
    },
  };
  return world;
}

export function makeCityG(seed, opts) {
  const o = opts || {};
  const world = overlayWorld(seed);
  const colliders = new ColliderIndex();
  const pw = new PropWorld({ citySeed: seed, colliders });
  world.colliders = colliders;
  const events = [];
  const said = [];
  const sounds = [];
  const store = o.store || {};
  const b = o.body || { x: 0.5, y: 64, z: 0.5 };
  const G = {
    dim: 'neon',
    world,
    props: pw,
    ui: 'none',
    time: { seconds: 0, tick: 0 },
    accessibility: !!o.accessibility,
    reducedMotion: false,
    hud: { hint: null },
    body: {
      x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: 0, h: 1.8, w: 0.6, eyeH: 1.62, onGround: true,
    },
    player: { dead: false, yaw: 0, pitch: 0 },
    inventory: new Inventory(),
    dimMgr: o.noDimMgr ? null : { get: () => ({ locks: store }) },
    entityRoot: null,
    THREE: null,
    emit: (e) => {
      events.push(e);
      if (G.sysList) G.sysList.forEach((s) => s.onEvent && s.onEvent(G, e));
    },
    hint: (t) => {
      G.hud.hint = t;
      said.push(t);
    },
    speak: (t) => said.push('speak:' + t),
    sound: (n, pos, op) => sounds.push([n, pos, op]),
    setUi: (n) => {
      const prev = G.ui;
      G.ui = n;
      G.emit({ type: 'uiChanged', ui: n, prev });
      return n;
    },
  };
  const sys = createSystem(G);
  G.sysList = [sys];
  sys.init(G);
  const kit = {
    G, world, pw, sys, events, said, sounds, store,
    loadAround(x, z, r) {
      const cx0 = Math.floor((x - r) / 16);
      const cx1 = Math.floor((x + r) / 16);
      const cz0 = Math.floor((z - r) / 16);
      const cz1 = Math.floor((z + r) / 16);
      for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) pw.loadChunk(cx, cz);
    },
    tick(n, dt) {
      const d = dt === undefined ? 1 / 60 : dt;
      for (let i = 0; i < n; i++) {
        G.time.seconds += d;
        G.time.tick++;
        pw.tick(d);
        sys.fixedUpdate(G, d);
      }
    },
    usedProp(p) {
      const e = pw.entry(p.id);
      G.emit({
        type: 'propUsed', id: p.id, key: e.def.key, t: e.prop.t, x: e.prop.x, y: e.prop.y, z: e.prop.z, effects: 0,
      });
    },
    put(x, y, z) {
      G.body.x = x;
      G.body.y = y;
      G.body.z = z;
    },
    input(act) {
      return sys.api().lockInput(act);
    },
    panel() {
      return sys.api().getLockPanel();
    },
  };
  return kit;
}

export function propsAround(pw, x, z, r) {
  const rr = r === undefined ? 12 : r;
  const out = [];
  for (let cx = Math.floor((x - rr) / 16); cx <= Math.floor((x + rr) / 16); cx++) {
    for (let cz = Math.floor((z - rr) / 16); cz <= Math.floor((z + rr) / 16); cz++) {
      pw.chunkProps(cx, cz).forEach((p) => {
        if (Math.abs(p.x - x) <= rr && Math.abs(p.z - z) <= rr) {
          const e = pw.entry(p.id);
          out.push({
            id: p.id, key: e.def.key, x: p.x, y: p.y, z: p.z, prop: p,
          });
        }
      });
    }
  }
  return out;
}

export function findLockedBuilding(seed, kind, opts) {
  const o = opts || {};
  const lots = interiorLots(seed, { limit: o.limit || 400 });
  for (let i = 0; i < lots.length; i++) {
    const { lot, bp } = lots[i];
    const it = planInterior(bp, lot);
    if (!it) continue;
    const door = it.doors.find((d) => {
      if (d.kind !== 'door') return false;
      if (kind === 'serbest' && o.hidden === true && !d.lock && isHiddenDoor(it, d)) return true;
      if (!d.lock || d.lock.kind !== kind) return false;
      if (o.tier !== undefined && d.lock.tier !== o.tier) return false;
      if (o.withProp && d.propSlot === undefined && !d.prop) return false;
      if (o.hidden !== undefined && isHiddenDoor(it, d) !== o.hidden) return false;
      if (o.game) {
        const sp = lockSpec(normalizeLock(d.lock), lockSeed(seed, lot.id, d.lock.id));
        if (sp.game !== o.game) return false;
      }
      return true;
    });
    if (door) return { lot, bp, it, door, lock: door.lock || null };
  }
  return null;
}

/** Kilitsiz, gizli olmayan, kapı propu olan sıradan bir iç kapı. */
export function findPlainDoor(seed, limit) {
  const lots = interiorLots(seed, { limit: limit || 400 });
  for (let i = 0; i < lots.length; i++) {
    const { lot, bp } = lots[i];
    const it = planInterior(bp, lot);
    if (!it) continue;
    const door = it.doors.find((d) => d.kind === 'door' && !d.lock && !isHiddenDoor(it, d) && d.propSlot !== undefined);
    if (door) return { lot, bp, it, door, lock: null };
  }
  return null;
}
