/*
 * ChunkManager boyut desteği: şehir mesh'i (aCity), readiness/whenReady, gizli yönetici, işçi havuzu devri ve EPOCH ile bayat sonuç ayıklama
 * (enjekte edilen gecikme), iş kimliği benzersizliği, dispose({keepPool}).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../sim/world.js';
import { createChunkMaterials } from './materials.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { TILE_COUNT } from '../sim/blocks.js';
import { createChunkManager } from './chunkManager.js';
import { chunkToTransfer, generateChunkData, makeGenContext } from './chunkMgrCore.js';
import { QUALITY } from './quality.js';
import { nextJobSeq } from './chunkMgrWorkers.js';
import { dimSeed } from '../sim/dim/dimensions.js';

const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
const fakeAtlas = {
  map: null, normalMap: null, materialMap: null, width: layout.width, height: layout.height, cell: layout.cell, pad: layout.pad,
  tileSize: layout.tileSize, uvTable: layout.uvTable,
};

const CITY_SEED = dimSeed(7, 'neon');

function city() {
  return new World({ seed: CITY_SEED, mode: 'macera', dim: 'neon' });
}

function rig(world, o) {
  const opt = o || {};
  const scene = new THREE.Scene();
  const materials = createChunkMaterials(THREE, fakeAtlas, undefined, { quality: 'low' });
  const mgr = createChunkManager(Object.assign({
    THREE, scene, world, materials, atlas: fakeAtlas, quality: Object.assign({}, QUALITY.low, { viewDist: 3 }), useWorker: false, releaseCpuData: false, planInterval: 0,
  }, opt));
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 900);
  camera.position.set(0.5, 65.6, 2.5);
  camera.updateMatrixWorld();
  return { scene, materials, mgr, camera, pos: { x: 0.5, y: 65.6, z: 2.5 } };
}

function pumpReady(r, radius, max) {
  for (let i = 0; i < (max || 600); i++) {
    r.mgr.update(r.pos, r.camera, 40);
    if (r.mgr.readiness(radius).ready) return i;
  }
  return -1;
}

function fakePool() {
  const p = {
    handlers: null,
    posted: [],
    inits: [],
    disposed: false,
    detached: 0,
    ready: true,
    alive: 1,
    decorate: false,
    attach(h) { p.handlers = h; },
    detach() { p.handlers = null; p.detached++; },
    reinit(m) { p.inits.push(m); },
    freeSlots() { return 6 - p.posted.filter((m) => !m.done).length; },
    post(m) { p.posted.push(m); return true; },
    broadcast() {},
    dispose() { p.disposed = true; },
  };
  return p;
}

describe('şehir ChunkManager (ana thread yolu)', { timeout: 240000 }, () => {
  it('şehir dünyasında mesher city seçeneği: geometrilerde aCity (Uint8×4 normalized); ana diyarda aCity YOK', () => {
    const r = rig(city());
    expect(pumpReady(r, 3)).toBeGreaterThanOrEqual(0);
    const meshes = r.mgr.getMeshes();
    expect(meshes.length).toBeGreaterThan(5);
    const withCity = meshes.filter((m) => m.geometry && m.geometry.attributes.aCity);
    expect(withCity.length).toBe(meshes.length);
    const a = withCity[0].geometry.attributes.aCity;
    expect(a.itemSize).toBe(4);
    expect(a.normalized).toBe(true);
    r.mgr.dispose();
    const ow = rig(new World({ seed: 7, mode: 'macera' }));
    for (let i = 0; i < 200; i++) ow.mgr.update({ x: 0, y: 70, z: 0 }, ow.camera, 40);
    const m2 = ow.mgr.getMeshes();
    expect(m2.length).toBeGreaterThan(0);
    expect(m2.every((m) => !m.geometry.attributes.aCity)).toBe(true);
    ow.mgr.dispose();
  });

  it('readiness: ilk planlamadan önce hazır değil; hazır olunca {ready:true, progress:1}; whenReady çözülür', async () => {
    const r = rig(city());
    expect(r.mgr.readiness(3)).toEqual({ ready: false, progress: 0 });
    const p = r.mgr.whenReady(3);
    expect(r.mgr.info().waiters).toBe(1);
    expect(pumpReady(r, 3)).toBeGreaterThanOrEqual(0);
    await expect(p).resolves.toBeUndefined();
    expect(r.mgr.info().waiters).toBe(0);
    expect(r.mgr.readiness(3).progress).toBe(1);
    await expect(r.mgr.whenReady(3)).resolves.toBeUndefined(); // zaten hazır
    r.mgr.dispose();
  });

  it('whenReady bekleyen söz dispose edilince reddedilir; sonra çağrı da reddedilir', async () => {
    const r = rig(city());
    const p = r.mgr.whenReady(3);
    r.mgr.dispose();
    await expect(p).rejects.toThrow(/atıldı/);
    await expect(r.mgr.whenReady(1)).rejects.toThrow(/atıldı/);
    expect(r.mgr.readiness(1)).toEqual({ ready: false, progress: 0 });
  });

  it('hidden: mesh kökü görünmez kurulur; setHidden ile açılır; hidden update çizim kökünü etkilemez', () => {
    const r = rig(city(), { hidden: true });
    expect(r.mgr.hidden).toBe(true);
    pumpReady(r, 3);
    const root = r.mgr.getMeshes()[0].parent;
    expect(root.visible).toBe(false);
    r.mgr.setHidden(false);
    expect(root.visible).toBe(true);
    expect(r.mgr.hidden).toBe(false);
    r.mgr.dispose();
  });

  it('epoch her yönetici için benzersiz ve artan', () => {
    const a = rig(city());
    const b = rig(city());
    expect(b.mgr.epoch).toBeGreaterThan(a.mgr.epoch);
    a.mgr.dispose();
    b.mgr.dispose();
  });

  it('nextJobSeq süreç genelinde benzersiz ve artan', () => {
    const ids = new Set();
    let prev = 0;
    for (let i = 0; i < 1000; i++) {
      const v = nextJobSeq();
      expect(v).toBeGreaterThan(prev);
      prev = v;
      ids.add(v);
    }
    expect(ids.size).toBe(1000);
  });
});

describe('işçi havuzu devri ve epoch (enjekte edilen gecikme)', { timeout: 240000 }, () => {
  let hadWorker;
  beforeEach(() => {
    hadWorker = globalThis.Worker;
    globalThis.Worker = function FakeWorker() {};
  });
  afterEach(() => {
    if (hadWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = hadWorker;
  });

  it('havuz bir yöneticiden diğerine devredilir: attach/detach/reinit; init mesajı yeni üretici anahtarı + epoch taşır', () => {
    const pool = fakePool();
    const a = rig(new World({ seed: 7, mode: 'macera' }), { useWorker: true, pool });
    expect(pool.inits).toHaveLength(1);
    expect(pool.inits[0].gen).toBe('overworld');
    expect(pool.inits[0].dim).toBeUndefined();
    expect(pool.inits[0].ep).toBe(a.mgr.epoch);
    expect(pool.handlers).toBeTruthy();
    const kept = a.mgr.dispose({ keepPool: true });
    expect(kept).toBe(pool);
    expect(pool.handlers).toBeNull();
    expect(pool.disposed).toBe(false);
    const b = rig(city(), { useWorker: true, pool: kept });
    expect(pool.inits).toHaveLength(2);
    expect(pool.inits[1].gen).toBe('city');
    expect(pool.inits[1].dim).toBe('neon');
    expect(pool.inits[1].ep).toBe(b.mgr.epoch);
    expect(pool.inits[1].meshOpts.city).toBe(true);
    expect(pool.inits[1].bounds.maxCx).toBe(49);
    expect(b.mgr.dispose()).toBeNull();
    expect(pool.disposed).toBe(true); // keepPool yok: havuz kapanır
  });

  it('BAYAT SONUÇ: eski epoch\'un geç gelen chunk yanıtı yeni boyutun dünyasına ALINMAZ; iş kimlikleri çakışmaz', () => {
    const pool = fakePool();
    const wa = new World({ seed: 7, mode: 'macera' });
    const a = rig(wa, { useWorker: true, pool });
    a.mgr.update(a.pos, a.camera, 4);
    const aGens = pool.posted.filter((m) => m.t === 'gen');
    expect(aGens.length).toBeGreaterThan(0);
    expect(aGens.every((m) => m.ep === a.mgr.epoch)).toBe(true);
    const stale = aGens[0];
    const handlersA = pool.handlers;
    a.mgr.dispose({ keepPool: true });
    pool.posted.length = 0;
    const wb = city();
    const b = rig(wb, { useWorker: true, pool });
    b.mgr.update(b.pos, b.camera, 4);
    const bGens = pool.posted.filter((m) => m.t === 'gen');
    expect(bGens.length).toBeGreaterThan(0);
    const idsA = new Set(aGens.map((m) => m.id));
    bGens.forEach((m) => {
      expect(idsA.has(m.id)).toBe(false); // global iş kimliği: çakışma yok
      expect(m.ep).toBe(b.mgr.epoch);
    });
    // geç gelen eski yanıt (A'nın bir işi): şehir dünyasına YAZILMAZ
    const stalePayload = generateChunkData(makeGenContext({ seed: wa.seed }), stale.cx, stale.cz, 0, null, null);
    const tr = chunkToTransfer(stalePayload);
    const before = wb.chunkCount;
    pool.handlers.onMessage({
      t: 'chunk', id: stale.id, ep: a.mgr.epoch, cx: stale.cx, cz: stale.cz, data: tr.data, ms: 1,
    });
    expect(wb.chunkCount).toBe(before);
    // eski yönetici işleyicisi hâlâ çağrılsa bile (kapalı): sessizce yutar
    expect(() => handlersA.onMessage({ t: 'chunk', id: stale.id, ep: a.mgr.epoch, data: tr.data })).not.toThrow();
    expect(wa.hasChunk(stale.cx, stale.cz)).toBe(false);
    // meşru yanıt: B'nin kendi işi şehir üretici anahtarıyla üretilmiş veriyle alınır
    const job = bGens[0];
    const ctx = makeGenContext({
      seed: wb.seed, gen: 'city', dim: 'neon', bounds: wb.bounds,
    });
    const good = chunkToTransfer(generateChunkData(ctx, job.cx, job.cz, 0, null, null));
    pool.handlers.onMessage({
      t: 'chunk', id: job.id, ep: b.mgr.epoch, cx: job.cx, cz: job.cz, data: good.data, ms: 1,
    });
    expect(wb.hasChunk(job.cx, job.cz)).toBe(true);
    // epoch'suz (eski sürüm) yanıt kabul edilir (geriye uyum)
    b.mgr.dispose();
  });

  it('uçuştaki iş sonuçları: devirden sonra A\'nın işleri jobs tablosundan düşer, B\'nin yeni işlerine karışmaz (gecikmeli teslim sırası)', () => {
    const pool = fakePool();
    const a = rig(new World({ seed: 7, mode: 'macera' }), { useWorker: true, pool });
    a.mgr.update(a.pos, a.camera, 4);
    const a0 = a.mgr.info().jobs;
    expect(a0).toBeGreaterThan(0);
    a.mgr.dispose({ keepPool: true });
    pool.posted.forEach((m) => { m.done = true; }); // işçi eski işleri bitirdi (yanıtlar epoch ile atılacak): yuvalar boşalır
    const wb = city();
    const b = rig(wb, { useWorker: true, pool });
    expect(b.mgr.info().jobs).toBe(0);
    b.mgr.update(b.pos, b.camera, 4);
    expect(b.mgr.info().jobs).toBeGreaterThan(0);
    b.mgr.dispose();
  });

  it('adoptPool (çalışan yönetici): işler temizlenir, yeni epoch ile init; havuzsuzsa false', () => {
    const p1 = fakePool();
    const m = rig(city(), { useWorker: true, pool: p1 });
    m.mgr.update(m.pos, m.camera, 4);
    const p2 = fakePool();
    expect(m.mgr.adoptPool(p2)).toBe(true);
    expect(p1.disposed).toBe(true);
    expect(p2.inits).toHaveLength(1);
    expect(p2.inits[0].ep).toBe(m.mgr.epoch);
    expect(m.mgr.info().jobs).toBe(0);
    const released = m.mgr.releasePool();
    expect(released).toBe(p2);
    expect(p2.handlers).toBeNull();
    m.mgr.dispose();
    expect(m.mgr.adoptPool(fakePool())).toBe(false);
  });

  it('özel worldgen (test/araç) işçi yolunu kullanmaz', () => {
    const pool = fakePool();
    const w = new World({
      seed: 3, mode: 'macera', worldgen: (seed, cx, cz) => new World({ seed }).ensureChunk(cx, cz),
    });
    const r = rig(w, { useWorker: true, pool });
    expect(pool.inits).toHaveLength(0);
    expect(r.mgr.workerMode).toBe(false);
    r.mgr.dispose();
  });
});
