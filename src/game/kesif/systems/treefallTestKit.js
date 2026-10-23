/*
 * KEŞİF "treefall" sistemi — test düzeneği (yalnız testler içe aktarır; oyun yüklemez).
 *
 *   makeTreeG(opts) → { G, kit, sys, S, tick(n), plant(enum, x, z, hash), setNatural(x,y,z,id), dropsOf(item), cut(x,y,z) }
 *     blocksTestKit'in düz dünyası (y 40 çimen) + gerçek World + blocks sistemi + treefall sistemi + gerçek THREE (sahte malzeme/atlas).
 *     opts: { mode, held, inv }
 */
import * as THREE from 'three';
import { B, TILE_COUNT } from '../sim/blocks.js';
import { buildTreeEnumCells } from '../sim/treeGrow.js';
import { computeAtlasLayout } from '../render/atlasLayout.js';
import { makeG } from './blocksTestKit.js';
import { createSystem } from './treefall.js';

export const GROUND = 40;

export function makeTreeG(opts) {
  const kit = makeG(opts);
  const G = kit.G;
  const items = G.items;
  const mobs = [];
  const damages = [];
  const rngState = { a: 123 };
  G.THREE = THREE;
  G.worldRoot = new THREE.Group();
  G.camera = new THREE.PerspectiveCamera();
  G.materials = {
    opaque: new THREE.MeshBasicMaterial(),
    cutout: new THREE.MeshBasicMaterial(),
    transparent: new THREE.MeshBasicMaterial(),
  };
  G.atlas = { uvTable: computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 }).uvTable };
  G.em = {
    rng: { next: () => { rngState.a = (rngState.a * 16807) % 2147483647; return rngState.a / 2147483647; } },
    items,
    mobs,
    damages,
    spawnItem(item, count, x, y, z, o) {
      items.push({
        item, count, x, y, z, opts: o,
      });
      return { item, count };
    },
    queryMobs(x, z, r) {
      return mobs.filter((m) => Math.hypot(m.x - x, m.z - z) <= r);
    },
    damage(id, dmg, src) {
      damages.push({ id, dmg, src });
      return { dealt: dmg, killed: false, blocked: false };
    },
  };
  const origEmit = G.emit;
  G.emit = (evt) => origEmit(evt);
  const sys = createSystem(G);
  sys.init(G);
  const S = G.treefall.state;

  function tick(n) {
    for (let i = 0; i < n; i++) {
      kit.step(1);
      sys.fixedUpdate(G, 1 / 60);
      sys.frameUpdate(G, 1 / 60, 0.5);
    }
  }
  /** Doğal ağaç (kayıt YOK: dünya üretimi gibi). enum = worldgenFlora.TREE. Hücreleri döner. */
  function plant(treeEnum, x, z, hash) {
    const cells = buildTreeEnumCells(treeEnum, x, GROUND + 1, z, hash === undefined ? 4242 : hash);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (G.world.getBlock(c.x, c.y, c.z) === 0) G.world.setBlock(c.x, c.y, c.z, c.id, { record: false, silent: true });
    }
    return cells;
  }
  /** Oyuncunun koyduğu blok (kayıtlı). */
  function setPlaced(x, y, z, id) {
    G.world.setBlock(x, y, z, id);
  }
  function dropsOf(substr) {
    return items.filter((d) => d.item.indexOf(substr) >= 0).reduce((n, d) => n + d.count, 0);
  }
  function events(type) {
    return kit.G.log.filter((l) => l[0] === 'event' && l[1] === type).map((l) => l[2]);
  }
  function cut(x, y, z) {
    G.world.setBlock(x, y, z, 0);
  }
  return {
    G, kit, sys, S, tick, plant, setPlaced, dropsOf, events, cut, mobs, damages, B,
  };
}
