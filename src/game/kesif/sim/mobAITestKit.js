/*
 * KEŞİF sim — yaratık/dövüş/doğma testleri için ortak donanım (yalnızca testlerde içe aktarılır; üretim koduna girmez).
 * Hızlı sahte dünya (düz zemin: y<=0 taş, ayak yüksekliği 1), oyuncu gövdesi, olay toplayıcı, adım koşturucu.
 */
import { B } from './blocks.js';
import { createPlayerBody } from './physics.js';
import { EntityManager } from './entities.js';

/**
 * Sahte dünya. opts: {fill(x,y,z)→id (taban; varsayılan düz zemin), light(x,y,z)→bayt, biome(x,z)→indeks, loaded(x,z)→bool}
 * setBlock düzenlemeleri fill'in önüne geçer.
 */
export function makeWorld(opts) {
  const o = opts || {};
  const edits = new Map();
  const fill = o.fill || ((x, y) => (y <= 0 ? B.STONE : 0));
  const w = {
    killPlaneY: -24,
    edits,
    getBlock(x, y, z) {
      if (o.loaded && !o.loaded(x, z)) return null;
      if (edits.size > 0) {
        const v = edits.get(x + ',' + y + ',' + z);
        if (v !== undefined) return v;
      }
      return fill(x, y, z);
    },
    setBlock(x, y, z, id) {
      edits.set(x + ',' + y + ',' + z, id);
      return true;
    },
    getLight: o.light ? o.light : () => 0xf0,
    getBiome: o.biome ? o.biome : () => 0,
    surfaceY(x, z) {
      for (let y = 127; y >= 0; y--) {
        const id = w.getBlock(x, y, z);
        if (id) return y;
      }
      return -1;
    },
    getChunkAt() {
      return {};
    },
  };
  return w;
}

/**
 * Çukurlu dünya: zemin üstü y=ground (ayak yüksekliği), rect içinde depth derinlikte çukur; çukur liquid (0 = boş) ile dolu.
 * Fizik y<0 hücrelerde çarpışma tanımadığı için zemin yüksekte tutulur.
 */
export function pitWorld(rect, liquid, depth = 4, ground = 6) {
  return makeWorld({
    fill: (x, y, z) => {
      const inside = x >= rect.x0 && x <= rect.x1 && z >= rect.z0 && z <= rect.z1;
      if (!inside) return y <= ground - 1 ? B.STONE : 0;
      if (y <= ground - 1 - depth) return B.STONE;
      if (y <= ground - 1) return liquid || 0;
      return 0;
    },
  });
}

export function fillBox(w, x0, y0, z0, x1, y1, z1, id) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) w.setBlock(x, y, z, id);
}

export function makePlayer(x = 0, y = 1, z = 0) {
  const p = createPlayerBody(x, y, z);
  p.dead = false;
  return p;
}

export function makeEm(world, o) {
  const events = [];
  const em = new EntityManager(Object.assign({ seed: 1234, world, emit: (e) => events.push(e) }, o || {}));
  return { em, events };
}

/** n saniye 60 Hz koştur; hook(i) her adımda çağrılır. */
export function run(em, player, seconds, ctx, hook) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    if (hook) hook(i);
    em.update(1 / 60, player, ctx);
  }
}

export function ofType(events, type) {
  return events.filter((e) => e.type === type);
}

export const NIGHT = Object.freeze({ dayFactor: 0 });
