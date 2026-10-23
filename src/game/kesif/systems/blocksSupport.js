/*
 * KEŞİF blok sistemi — destek kuralları (bitki/meşale/sarmaşık/kaktüs/plaka) ve düşen bloklar (kum, çakıl).
 *
 *   supportKind(id)                       'plant'|'mushroom'|'cactus'|'torch'|'vine'|'plate'|null (yalnız id ≤ 99; sistem blokları patlamaz)
 *   isSupported(world, kind, id, x,y,z)   desteği var mı (üretilmemiş komşu = destekli say)
 *   isFalling(id)                         kum / kızıl kum / çakıl
 *   removeUnsupportedAround(G,S,x,y,z)    (x,y,z) boşalınca komşu bağımlı blokları zincirleme düşürür (en çok 96)
 *   enqueueFall(S,x,y,z) / tickFall(G,S,dt)   ertelenmiş yerleşme: 20 Hz, adım başına ≤ 24 hücre, kuyruk ≤ 256
 *
 * Meşale/fener: altı katı (küp ya da çit) VEYA yan komşusu opak ise tutunur; fener ayrıca üstten asılabilir.
 * Bitkiler (çiçek, ot, çalı): altında toprak benzeri blok (toprak, çimen, kar-çimen, çamur, yosun, kum, kızıl kum, kil).
 */
import {
  B, BLOCKS, CUBE_LUT, OPAQUE_LUT, LIQUID_LUT, resolveDrops,
} from '../sim/blocks.js';
import { BUILDABLE_MAX, MAX_BLOCK_ID } from '../sim/constants.js';
import { isSaplingId } from '../sim/treeData.js';
import { BIOME_HANGING_IDS, BIOME_PLANT_IDS, BIOME_SOIL_IDS } from '../sim/biomeData.js';
import {
  overlapsMobs, overlapsPlayer, rngNext, soundFor, spawnDrops,
} from './blocksCore.js';

const SOIL = new Uint8Array(256);
[B.DIRT, B.GRASS, B.SNOW_GRASS, B.MUD, B.MOSS, B.SAND, B.RED_SAND, B.CLAY, B.GRAVEL, B.BASALT].forEach((i) => { SOIL[i] = 1; });
BIOME_SOIL_IDS.forEach((i) => { SOIL[i] = 1; }); // miselyum, kül, çiçekli yosun, mercan blokları
// Fidan yalnız gerçek toprakta tutunur (taş/bazalt/çakıl değil): ağaç kökü taşta büyümez.
const SAPLING_SOIL = new Uint8Array(256);
[B.DIRT, B.GRASS, B.SNOW_GRASS, B.MUD, B.MOSS, B.SAND, B.RED_SAND, B.CLAY].forEach((i) => { SAPLING_SOIL[i] = 1; });
BIOME_SOIL_IDS.forEach((i) => { SAPLING_SOIL[i] = 1; });
const BIOME_PLANT = new Uint8Array(256);
BIOME_PLANT_IDS.forEach((i) => { BIOME_PLANT[i] = 1; });
const BIOME_HANG = new Uint8Array(256);
BIOME_HANGING_IDS.forEach((i) => { BIOME_HANG[i] = 1; });
const FALLING = new Uint8Array(128);
[B.SAND, B.RED_SAND, B.GRAVEL].forEach((i) => { FALLING[i] = 1; });

export const MAX_CHAIN = 96;
const FALL_QUEUE_MAX = 256;
const FALL_STEP = 1 / 20;
const FALL_PER_PASS = 24;
const FALL_RETRY_MAX = 20;

export function isFalling(id) {
  return id > 0 && id < 128 && FALLING[id] === 1;
}

export function supportKind(id) {
  if (isSaplingId(id)) return 'plant'; // fidan (treeData.js): toprak benzeri zemin ister, zemin kalkınca düşer
  if (id > 0 && id < 256) {
    if (BIOME_PLANT[id] === 1) return 'plant'; // biyom bitkileri (bambu, çiçekler, eğrelti, kamış, mercan yelpazesi...)
    if (BIOME_HANG[id] === 1) return 'vine'; // parlak meyve sarmaşığı: tavandan sarkar
  }
  if (id < 1 || id > BUILDABLE_MAX) return null;
  const b = BLOCKS[id];
  if (!b) return null;
  if (b.shape === 'cross') {
    if (id === B.VINE) return 'vine';
    if (id === B.MUSHROOM) return 'mushroom';
    return 'plant';
  }
  if (id === B.CACTUS) return 'cactus';
  if (b.shape === 'torch') return 'torch';
  if (b.shape === 'plate') return 'plate';
  return null;
}

/** Üst yüzü ayakta durulacak/üstüne konacak kadar tam olan blok mu? */
function topSolid(id) {
  if (id < 1 || id > MAX_BLOCK_ID) return false;
  if (CUBE_LUT[id] === 1) return true;
  const b = BLOCKS[id];
  return b.shape === 'fence' || id === B.CHEST || id === B.REWARD_CHEST;
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Yan komşulardan biri opak küp mü (null = bilinmiyor → true sayılmaz, çağıran ayrıca ele alır). */
function sideOpaque(world, x, y, z) {
  for (let i = 0; i < 4; i++) {
    const n = world.getBlock(x + NB[i][0], y, z + NB[i][1]);
    if (n && OPAQUE_LUT[n] === 1) return true;
  }
  return false;
}

function anyUnknown(world, x, y, z) {
  if (world.getBlock(x, y - 1, z) === null) return true;
  for (let i = 0; i < 4; i++) if (world.getBlock(x + NB[i][0], y, z + NB[i][1]) === null) return true;
  return false;
}

export function isSupported(world, kind, id, x, y, z) {
  if (anyUnknown(world, x, y, z)) return true; // üretilmemiş komşu: dokunma
  const below = world.getBlock(x, y - 1, z) || 0;
  switch (kind) {
    case 'plant':
      return isSaplingId(id) ? SAPLING_SOIL[below] === 1 : SOIL[below] === 1;
    case 'mushroom':
      return topSolid(below);
    case 'cactus':
      return below === B.SAND || below === B.RED_SAND || below === B.CACTUS;
    case 'torch': {
      if (topSolid(below)) return true;
      if (sideOpaque(world, x, y, z)) return true;
      if (id === B.LANTERN) {
        const up = world.getBlock(x, y + 1, z) || 0;
        return CUBE_LUT[up] === 1;
      }
      return false;
    }
    case 'vine': {
      if (sideOpaque(world, x, y, z)) return true;
      const up = world.getBlock(x, y + 1, z) || 0;
      return up === B.VINE || BIOME_HANG[up] === 1 || OPAQUE_LUT[up] === 1;
    }
    case 'plate':
      return CUBE_LUT[below] === 1;
    default:
      return true;
  }
}

const N6 = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

/**
 * (x,y,z) hücresi değişti/boşaldı: komşu bağımlı bloklar desteksizse doğal olarak düşer (eşya bırakır, parçacık, olay).
 * Zincirleme (bir bitkinin altındaki destek de bağımlı olabilir). Düşürülen blok sayısını döner.
 */
export function removeUnsupportedAround(G, S, x, y, z) {
  const world = G.world;
  const queue = [x, y, z];
  let head = 0;
  let popped = 0;
  while (head < queue.length && popped < MAX_CHAIN) {
    const cx = queue[head++];
    const cy = queue[head++];
    const cz = queue[head++];
    for (let i = 0; i < 6; i++) {
      const nx = cx + N6[i][0];
      const ny = cy + N6[i][1];
      const nz = cz + N6[i][2];
      const id = world.getBlock(nx, ny, nz);
      if (!id) continue;
      const kind = supportKind(id);
      if (!kind || isSupported(world, kind, id, nx, ny, nz)) continue;
      if (popBlock(G, S, nx, ny, nz, id)) {
        popped++;
        queue.push(nx, ny, nz);
        enqueueAbove(G, S, nx, ny, nz);
      }
    }
  }
  return popped;
}

/** Desteksiz bloğu doğal kır: eşya + parçacık + ses + blockBroken('support'). */
function popBlock(G, S, x, y, z, id) {
  if (!G.world.setBlock(x, y, z, 0)) return false;
  const drops = resolveDrops(id, () => rngNext(G, S), null);
  if (G.mode !== 'insa') spawnDrops(G, S, drops, x + 0.5, y + 0.4, z + 0.5);
  if (G.particles && G.particles.blockBreak) {
    S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
    G.particles.blockBreak(id, S.pos, 0.8);
  }
  S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
  G.sound(soundFor('break', id), S.pos, { vol: 0.6 });
  G.emit({
    type: 'blockBroken', x, y, z, id, by: 'support',
  });
  return true;
}

function enqueueAbove(G, S, x, y, z) {
  const up = G.world.getBlock(x, y + 1, z);
  if (up && isFalling(up)) enqueueFall(S, x, y + 1, z);
}

/** Boşalan hücrenin üstündeki düşen blok(lar)ı kuyruğa alır. */
export function afterRemoval(G, S, x, y, z) {
  removeUnsupportedAround(G, S, x, y, z);
  enqueueAbove(G, S, x, y, z);
}

/** Bir blok bırakıldı/yerleştirildi: düşen türdense kuyruğa. */
export function afterPlacement(G, S, x, y, z, id) {
  if (isFalling(id)) enqueueFall(S, x, y, z);
}

export function enqueueFall(S, x, y, z) {
  const f = S.fall;
  for (let i = 0; i < f.xs.length; i++) {
    if (f.xs[i] === x && f.ys[i] === y && f.zs[i] === z) return;
  }
  if (f.xs.length >= FALL_QUEUE_MAX) {
    f.xs.shift(); f.ys.shift(); f.zs.shift(); f.moved.shift(); f.tries.shift();
  }
  f.xs.push(x); f.ys.push(y); f.zs.push(z); f.moved.push(0); f.tries.push(0);
}

function canFallInto(id) {
  if (id === 0) return true;
  if (id === null) return false;
  const b = BLOCKS[id];
  return !!b && b.shape === 'cross' && b.hardness === 0 && LIQUID_LUT[id] === 0;
}

/** Kuyruğu işler (20 Hz). Düşen blok bir hücre aşağı kayar; zemine oturunca ses çıkar. */
export function tickFall(G, S, dt) {
  const f = S.fall;
  if (f.xs.length === 0) {
    f.acc = 0;
    return;
  }
  f.acc += dt;
  if (f.acc < FALL_STEP) return;
  f.acc -= FALL_STEP;
  if (f.acc > FALL_STEP) f.acc = 0;
  const world = G.world;
  // kuyruğun anlık kopyası üstünden yürü (yeni girişler sonraki geçişe kalır)
  const n = Math.min(f.xs.length, FALL_PER_PASS);
  const nx = [];
  const ny = [];
  const nz = [];
  const nm = [];
  const nt = [];
  for (let i = 0; i < n; i++) {
    const x = f.xs[i];
    const y = f.ys[i];
    const z = f.zs[i];
    const m = f.moved[i];
    const tr = f.tries[i];
    const id = world.getBlock(x, y, z);
    if (!id || !isFalling(id)) continue;
    const below = y > 0 ? world.getBlock(x, y - 1, z) : 1;
    if (below === null) continue; // alt chunk yok: bekleme
    if (y > 0 && canFallInto(below)) {
      if (overlapsPlayer(G, x, y - 1, z, id) || overlapsMobs(G, x, y - 1, z, id)) {
        if (tr < FALL_RETRY_MAX) {
          nx.push(x); ny.push(y); nz.push(z); nm.push(m); nt.push(tr + 1);
        }
        continue;
      }
      if (world.setBlock(x, y - 1, z, id)) {
        world.setBlock(x, y, z, 0);
        nx.push(x); ny.push(y - 1); nz.push(z); nm.push(m + 1); nt.push(0);
        const up = world.getBlock(x, y + 1, z);
        if (up && isFalling(up)) {
          nx.push(x); ny.push(y + 1); nz.push(z); nm.push(0); nt.push(0);
        }
        // altta çiçek/ot vardıysa ezildi; destek bağımlıları (üstteki bitki vb.) için
        removeUnsupportedAround(G, S, x, y, z);
      }
    } else if (m > 0) {
      S.pos.x = x + 0.5; S.pos.y = y + 0.5; S.pos.z = z + 0.5;
      G.sound(soundFor('place', id), S.pos, { vol: 0.7 });
      if (G.particles && G.particles.blockDust) G.particles.blockDust(id, S.pos);
      G.emit({
        type: 'blockLanded', x, y, z, id,
      });
    }
  }
  f.xs.splice(0, n); f.ys.splice(0, n); f.zs.splice(0, n); f.moved.splice(0, n); f.tries.splice(0, n);
  for (let i = 0; i < nx.length; i++) {
    let dup = false;
    for (let j = 0; j < f.xs.length; j++) {
      if (f.xs[j] === nx[i] && f.ys[j] === ny[i] && f.zs[j] === nz[i]) { dup = true; break; }
    }
    if (!dup && f.xs.length < FALL_QUEUE_MAX) {
      f.xs.push(nx[i]); f.ys.push(ny[i]); f.zs.push(nz[i]); f.moved.push(nm[i]); f.tries.push(nt[i]);
    }
  }
}
