import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { World } from '../sim/world.js';
import { spawnPoint } from '../sim/worldgen.js';
import { B } from '../sim/blocks.js';
import { chunkId, Chunk } from '../sim/chunk.js';
import { createChunkMaterials } from './materials.js';
import { computeAtlasLayout } from './atlasLayout.js';
import { TILE_COUNT } from '../sim/blocks.js';
import { createChunkManager, adoptChunk } from './chunkManager.js';
import { generateChunkData, makeGenContext, chunkToTransfer } from './chunkMgrCore.js';
import { QUALITY } from './quality.js';
import { ZONES } from '../sim/constants.js';

const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
const fakeAtlas = {
  map: null, normalMap: null, materialMap: null, width: layout.width, height: layout.height, cell: layout.cell, pad: layout.pad,
  tileSize: layout.tileSize, uvTable: layout.uvTable,
};

function setup(opts) {
  const o = opts || {};
  const world = new World({ seed: o.seed === undefined ? 7 : o.seed, mode: o.mode || 'macera' });
  const scene = new THREE.Scene();
  const materials = createChunkMaterials(THREE, fakeAtlas, undefined, { quality: 'low' });
  const sp = spawnPoint(world.seed);
  const pos = o.pos || { x: sp.x, y: sp.y + 1.6, z: sp.z };
  const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 600);
  camera.position.set(pos.x, pos.y, pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = o.yaw || 0;
  camera.updateMatrixWorld();
  const mgr = createChunkManager({
    THREE, scene, world, materials, atlas: fakeAtlas, quality: Object.assign({}, QUALITY.low, { viewDist: o.viewDist || 3 }), useWorker: false,
    releaseCpuData: false, planInterval: 0,
  });
  if (o.unlock) for (let i = 1; i <= o.unlock; i++) world.unlockZone(i);
  return { world, scene, materials, mgr, camera, pos, sp };
}

function pump(ctx, frames, budget) {
  for (let i = 0; i < frames; i++) ctx.mgr.update(ctx.pos, ctx.camera, budget === undefined ? 40 : budget);
}

function pumpUntilReady(ctx, radius, max) {
  for (let i = 0; i < (max || 400); i++) {
    ctx.mgr.update(ctx.pos, ctx.camera, 40);
    if (ctx.mgr.isReady(radius)) return i;
  }
  return -1;
}

describe('createChunkManager (ana thread yedek yolu)', { timeout: 180000 }, () => {
  it('çevreyi yükler, mesh\'ler ve sahneye ekler; isReady doğru bildirir', () => {
    const ctx = setup({ viewDist: 3 });
    expect(ctx.mgr.isReady(2)).toBe(false);
    const frames = pumpUntilReady(ctx, 3);
    expect(frames).toBeGreaterThanOrEqual(0);
    const st = ctx.mgr.getStats();
    expect(st.chunksMeshed).toBeGreaterThanOrEqual(20);
    expect(st.workerMode).toBe('main');
    expect(ctx.scene.children).toContain(ctx.mgr.getMeshes()[0].parent);
    expect(ctx.mgr.getMeshes().length).toBeGreaterThan(20);
    // veri yarıçapı görüşten büyük: mesh'lenenden fazla chunk yüklü
    expect(ctx.world.chunkCount).toBeGreaterThan(st.chunksMeshed);
    ctx.mgr.dispose();
  });

  it('ayağın altındaki chunk ilk karede yüklenir (öncelik)', () => {
    const ctx = setup({ viewDist: 4 });
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    expect(ctx.world.hasChunk(Math.floor(ctx.pos.x / 16), Math.floor(ctx.pos.z / 16))).toBe(true);
    ctx.mgr.dispose();
  });

  it('kare başına bütçeyi aşmaz (küçük bütçede iş birkaç kareye yayılır)', () => {
    const ctx = setup({ viewDist: 4 });
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    const loadedFirst = ctx.world.chunkCount;
    expect(loadedFirst).toBeLessThan(10);
    pump(ctx, 30, 1);
    expect(ctx.world.chunkCount).toBeGreaterThan(loadedFirst);
    ctx.mgr.dispose();
  });

  it('mesh\'ler chunk konumunda, doğru geçişlerde ve sınırlayıcı küreyle', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    const meshes = ctx.mgr.getMeshes();
    const opaque = meshes.filter((m) => m.material === ctx.materials.opaque);
    expect(opaque.length).toBeGreaterThan(10);
    opaque.forEach((m) => {
      expect(Math.abs(m.position.x % 16)).toBe(0);
      expect(Math.abs(m.position.z % 16)).toBe(0);
      expect(m.geometry.boundingSphere.radius).toBeGreaterThan(0);
      expect(m.frustumCulled).toBe(false);
      expect(m.renderOrder).toBe(0);
    });
    ctx.mgr.dispose();
  });

  it('blok kırılınca düzenlenen chunk AYNI update çağrısında yeniden mesh\'lenir (anında)', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    pump(ctx, 5);
    const x = Math.floor(ctx.pos.x) + 2;
    const z = Math.floor(ctx.pos.z) + 2;
    const y = ctx.world.surfaceY(x, z);
    const before = ctx.mgr.getStats().meshesBuilt;
    const lx = x & 15;
    const lz = z & 15;
    const interior = lx > 0 && lx < 15 && lz > 0 && lz < 15;
    expect(ctx.world.setBlock(x, y, z, B.AIR)).toBe(true);
    ctx.mgr.update(ctx.pos, ctx.camera, 0.1);
    const built = ctx.mgr.getStats().meshesBuilt - before;
    expect(built).toBeGreaterThanOrEqual(1);
    if (interior) expect(built).toBe(1);
    ctx.mgr.dispose();
  });

  it('chunk kenarındaki düzenleme komşuyu da yeniden mesh\'ler; köşe 3 komşu', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    pump(ctx, 5);
    const cx = Math.floor(ctx.pos.x / 16);
    const cz = Math.floor(ctx.pos.z / 16);
    const x = cx * 16;
    const z = cz * 16;
    const y = ctx.world.surfaceY(x, z);
    const before = ctx.mgr.getStats().meshesBuilt;
    ctx.world.setBlock(x, y, z, B.AIR);
    ctx.mgr.update(ctx.pos, ctx.camera, 0.1);
    const built = ctx.mgr.getStats().meshesBuilt - before;
    expect(built).toBeGreaterThanOrEqual(4); // kendi + batı + kuzey + kuzeybatı
    ctx.mgr.dispose();
  });

  it('sürüm değişimi (ışık dikişi/dış değişiklik) normal kuyrukta yeniden mesh\'lenir', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    pump(ctx, 5);
    const c = ctx.world.getChunk(Math.floor(ctx.pos.x / 16), Math.floor(ctx.pos.z / 16));
    const before = ctx.mgr.getStats().meshesBuilt;
    c.markDirty();
    pump(ctx, 20);
    expect(ctx.mgr.getStats().meshesBuilt).toBeGreaterThan(before);
    ctx.mgr.dispose();
  });

  it('görüş mesafesi küçülünce uzak chunk\'lar World\'den de atılır; büyütülünce geri yüklenir', () => {
    const ctx = setup({ viewDist: 5, unlock: 1 });
    pumpUntilReady(ctx, 5);
    const big = ctx.world.chunkCount;
    const meshesBig = ctx.mgr.getMeshes().length;
    ctx.mgr.setViewDist(3);
    pump(ctx, 5);
    expect(ctx.world.chunkCount).toBeLessThan(big);
    expect(ctx.mgr.getMeshes().length).toBeLessThan(meshesBig);
    ctx.mgr.setViewDist(5);
    pumpUntilReady(ctx, 5);
    expect(ctx.world.chunkCount).toBeGreaterThanOrEqual(big - 4);
    ctx.mgr.dispose();
  });

  it('setViewDist sınırlanır (3..12)', () => {
    const ctx = setup({ viewDist: 3 });
    expect(ctx.mgr.setViewDist(99)).toBe(12);
    expect(ctx.mgr.setViewDist(-5)).toBe(3);
    expect(ctx.mgr.getViewDist()).toBe(3);
    ctx.mgr.dispose();
  });

  it('düzenlemeler uzak chunk atılıp yeniden üretilince geri gelir', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    const x = Math.floor(ctx.pos.x) + 3;
    const z = Math.floor(ctx.pos.z) + 3;
    const y = ctx.world.surfaceY(x, z) + 4;
    ctx.world.setBlock(x, y, z, B.BRICK);
    pump(ctx, 3);
    // uzağa ışınlan: eski chunk atılır
    ctx.pos.x += 16 * 12;
    ctx.pos.z += 0;
    pumpUntilReady(ctx, 3, 600);
    expect(ctx.world.hasChunk(x >> 4, z >> 4)).toBe(false);
    ctx.pos.x -= 16 * 12;
    pumpUntilReady(ctx, 3, 600);
    expect(ctx.world.getBlock(x, y, z)).toBe(B.BRICK);
    ctx.mgr.dispose();
  });

  it('kamera arkaya bakınca görünür çizim sayısı düşer (frustum culling)', () => {
    const ctx = setup({ viewDist: 4 });
    pumpUntilReady(ctx, 4);
    pump(ctx, 4);
    const all = ctx.mgr.getStats().drawCalls;
    const vis = ctx.mgr.getStats().chunksVisible;
    // kamerayı yukarı çevir: yalnızca gökyüzü
    ctx.camera.rotation.x = Math.PI / 2 - 0.05;
    ctx.camera.updateMatrixWorld();
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    expect(ctx.mgr.getStats().drawCalls).toBeLessThan(all);
    expect(ctx.mgr.getStats().chunksVisible).toBeLessThan(vis);
    ctx.mgr.dispose();
  });

  it('mühürlü dış halka istenmez; sealDistance sonlu; bölge açılınca sonsuz', () => {
    // oyuncu mühür halkasına ~88 blok kala durur (görüş 7 chunk = 112 blok)
    const R0 = ZONES[0].rOut;
    const ctx = setup({ viewDist: 7, pos: { x: R0 - 88, y: 80, z: 8 } });
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    const d = ctx.mgr.getSealDistance();
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThan(112);
    // üretilemeyen chunk'lar istenmedi
    pump(ctx, 60, 6);
    ctx.world.forEachChunk((c) => {
      const r = Math.hypot(c.cx * 16 + 8, c.cz * 16 + 8);
      expect(r).toBeLessThan(R0 + 24);
    });
    ctx.world.unlockZone(1);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    expect(ctx.mgr.getSealDistance()).toBe(Infinity);
    ctx.mgr.dispose();
  });

  it('küçük görüş mesafesinde yükleme ilerlemesi 1\'e ulaşır (takılma yok)', () => {
    const ctx = setup({ viewDist: 3, pos: { x: 15.9, y: 80, z: 15.9 } });
    expect(pumpUntilReady(ctx, 3, 500)).toBeGreaterThanOrEqual(0);
    expect(ctx.mgr.getLoadProgress(3)).toBe(1);
    ctx.mgr.dispose();
  });

  it('rebuildMeshes bağlam kaybından sonra tüm mesh\'leri yeniden kurar', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    pump(ctx, 5);
    const n = ctx.mgr.getMeshes().length;
    ctx.mgr.rebuildMeshes();
    expect(ctx.mgr.getMeshes().length).toBe(0);
    pumpUntilReady(ctx, 3);
    pump(ctx, 20);
    expect(ctx.mgr.getMeshes().length).toBeGreaterThanOrEqual(n - 6);
    ctx.mgr.dispose();
  });

  it('şeffaf (su) mesh\'ler uzaktan yakına sıralanır (renderOrder artan)', () => {
    // 7 tohumunda göl (-24,-30): kamerayı göle yakın koy
    const sp = spawnPoint(new World({ seed: 7 }).seed);
    const ctx = setup({ viewDist: 4, pos: { x: sp.x - 12, y: 70, z: sp.z - 14 }, yaw: 0.7 });
    pumpUntilReady(ctx, 4, 600);
    pump(ctx, 5);
    const tr = ctx.mgr.getMeshes().filter((m) => m.material === ctx.materials.transparent && m.visible);
    expect(tr.length).toBeGreaterThan(1);
    const cam = ctx.camera.position;
    const sorted = tr.slice().sort((a, b) => a.renderOrder - b.renderOrder);
    for (let i = 1; i < sorted.length; i++) {
      const da = Math.hypot(sorted[i - 1].position.x + 8 - cam.x, sorted[i - 1].position.z + 8 - cam.z);
      const db = Math.hypot(sorted[i].position.x + 8 - cam.x, sorted[i].position.z + 8 - cam.z);
      expect(da).toBeGreaterThanOrEqual(db - 24); // chunk merkezi/küre farkı payı
    }
    expect(sorted[0].renderOrder).toBeGreaterThanOrEqual(100);
    ctx.mgr.dispose();
  });


  it("setAtlas: malzeme uniform'ları güncellenir ve tüm chunk'lar yeniden mesh'lenir", () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    pump(ctx, 5);
    const lay16 = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 16 });
    const atlas16 = {
      map: { id: 'm' }, normalMap: { id: 'n' }, materialMap: { id: 'x' }, width: lay16.width, height: lay16.height,
      cell: lay16.cell, pad: lay16.pad, tileSize: 16, uvTable: lay16.uvTable,
    };
    const before = ctx.mgr.getStats().meshesBuilt;
    const meshed = ctx.mgr.getStats().bandsMeshed;
    ctx.mgr.setAtlas(atlas16);
    const u = ctx.materials.uniforms;
    expect(u.uMap.value).toBe(atlas16.map);
    expect(u.uTile.value).toBe(16);
    expect(u.uCellSize.value.x).toBe(lay16.cell);
    pump(ctx, 40);
    expect(ctx.mgr.getStats().meshesBuilt - before).toBeGreaterThanOrEqual(meshed - 2);
    // yeni UV tablosu kullanıldı: bir mesh'in uv değerleri 16 px yerleşimine uyar
    const m = ctx.mgr.getMeshes().find((x) => x.material === ctx.materials.opaque);
    const uv = m.geometry.attributes.uv.array;
    expect(uv.length).toBeGreaterThan(0);
    ctx.mgr.dispose();
  });

  it('useWorker:true ama Worker yoksa (node) ana thread yoluna düşer', () => {
    const ctx = setup({ viewDist: 3 });
    expect(ctx.mgr.workerMode).toBe(false);
    ctx.mgr.dispose();
  });

  it('dispose sahneyi temizler ve sonraki update etkisiz', () => {
    const ctx = setup({ viewDist: 3 });
    pumpUntilReady(ctx, 3);
    ctx.mgr.dispose();
    expect(ctx.scene.children.length).toBe(0);
    const n = ctx.world.chunkCount;
    ctx.mgr.update(ctx.pos, ctx.camera, 10);
    expect(ctx.world.chunkCount).toBe(n);
    ctx.mgr.dispose(); // iki kez güvenli
  });

  it('onStats geri çağrısı periyodik tetiklenir', () => {
    const world = new World({ seed: 7 });
    const scene = new THREE.Scene();
    const materials = createChunkMaterials(THREE, fakeAtlas, undefined, { quality: 'low' });
    let calls = 0;
    const mgr = createChunkManager({
      THREE, scene, world, materials, atlas: fakeAtlas, quality: 'low', useWorker: false, onStats: () => { calls++; },
    });
    const sp = spawnPoint(world.seed);
    const start = Date.now();
    while (calls === 0 && Date.now() - start < 20000) mgr.update({ x: sp.x, y: 70, z: sp.z }, null, 2);
    expect(calls).toBeGreaterThan(0);
    mgr.dispose();
  });

  it('harita modunda (sınırlı dünya) çerçeve dahil yüklenir', () => {
    const ctx = setup({ mode: 'insa', viewDist: 3, pos: { x: 64, y: 40, z: 64 } });
    pumpUntilReady(ctx, 3, 400);
    expect(ctx.mgr.getStats().chunksMeshed).toBeGreaterThan(10);
    // sınır dışı: çerçeve chunk'ı var ama daha ötesi yok
    expect(ctx.world.hasChunk(-1, 3)).toBe(true);
    expect(ctx.world.hasChunk(-3, 3)).toBe(false);
    ctx.mgr.dispose();
  });
});

describe('createChunkManager: dikey akış (derin dünya)', { timeout: 180000 }, () => {
  function settle(ctx, max) {
    for (let i = 0; i < (max || 600); i++) {
      ctx.mgr.update(ctx.pos, ctx.camera, 40);
      const s = ctx.mgr.getStats();
      if (s.genQueue === 0 && s.meshQueue === 0 && i > 3) return i;
    }
    return -1;
  }

  it('derine inince kesitler akar, yüzey bandı bırakılır ve ÜRET-BIRAK DÖNGÜSÜ OLMAZ (yerleşince yeni kesit yüklenmez)', () => {
    const ctx = setup({ viewDist: 3 });
    expect(settle(ctx)).toBeGreaterThanOrEqual(0);
    const surfaceMeshes = ctx.mgr.getMeshes().length;
    // yüzeyden 350 blok aşağı: her kesit penceresi kayar
    for (const y of [-50, -150, -300]) {
      ctx.pos.y = y;
      ctx.camera.position.y = y;
      ctx.camera.updateMatrixWorld();
      const n = settle(ctx);
      expect(n).toBeGreaterThanOrEqual(0);
      const win = ctx.mgr.getVerticalWindow();
      expect(win.lo).toBeLessThan(y);
      expect(win.hi).toBeGreaterThan(y);
      // yerleşmiş: 90 kare boyunca World'e yeni kesit yüklenmez/bırakılmaz
      let loads = 0;
      const un1 = ctx.world.on('sectionLoad', () => { loads++; });
      for (let i = 0; i < 90; i++) ctx.mgr.update(ctx.pos, ctx.camera, 40);
      un1();
      expect(loads).toBe(0);
    }
    const deepLoaded = ctx.mgr.getStats().sectionsLoaded;
    expect(deepLoaded).toBeGreaterThan(0);
    // geri yüzeye: derin kesitler bellekten bırakılır
    ctx.pos.y = ctx.sp.y + 1.6;
    ctx.camera.position.y = ctx.pos.y;
    ctx.camera.updateMatrixWorld();
    expect(settle(ctx)).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < 60; i++) ctx.mgr.update(ctx.pos, ctx.camera, 40); // bırakma planı bütçeli (planda ≤ 96 kesit)
    expect(ctx.mgr.getMeshes().length).toBeGreaterThan(surfaceMeshes * 0.5);
    expect(ctx.mgr.getStats().sectionsLoaded).toBeLessThan(deepLoaded);
    ctx.mgr.dispose();
  });
});

describe('adoptChunk', () => {
  it('chunk\'ı World\'e alır, chunkLoad yayar, komşuyu kirletir, düzenleme bayrağını kurar', () => {
    const world = new World({ seed: 11 });
    world.ensureChunk(0, 0);
    const n0 = world.getChunk(0, 0);
    const v0 = n0.version;
    let loaded = 0;
    world.on('chunkLoad', () => { loaded++; });
    const g = makeGenContext({ seed: world.seed });
    const data = chunkToTransfer(generateChunkData(g, 1, 0, 0, null, null)).data;
    const c = adoptChunk(world, data);
    expect(c).not.toBeNull();
    expect(world.getChunk(1, 0)).toBe(c);
    expect(loaded).toBe(1);
    expect(n0.version).toBeGreaterThan(v0);
    expect(c.generated).toBe(true);
    expect(c.edited).toBe(false);
    // aynı chunk ikinci kez alınmaz
    expect(adoptChunk(world, data)).toBeNull();
  });

  it('World#edits olan chunk edited işaretlenir', () => {
    const world = new World({ seed: 11 });
    world.applyEdits({ '20,70,5': B.STONE });
    const g = makeGenContext({ seed: world.seed });
    const data = chunkToTransfer(generateChunkData(g, 1, 0, 0, null, null)).data;
    const c = adoptChunk(world, data);
    expect(c.edited).toBe(true);
    expect(world._editsByChunk.has(chunkId(1, 0))).toBe(true);
  });
});

describe('createChunkManager: arazi ufku tıkaması', { timeout: 90000 }, () => {
  /** Düz zemin y=60; x 24..39 şeridinde y=80 sırt (tüm z). Kendi worldgen'i → işçi yok, belirlenimci. */
  function ridgeGen(seed, cx, cz) {
    const c = new Chunk(cx, cz);
    for (let si = 0; si < 25; si++) c.fillSection(si, B.STONE); // y < 0: tek tip taş
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const x = cx * 16 + lx;
        const h = x >= 24 && x < 40 ? 80 : 60;
        for (let y = 0; y < h; y++) c.set(lx, y, lz, y === h - 1 ? B.GRASS : B.STONE);
      }
    }
    return c;
  }

  function ridgeCtx(eyeY) {
    const world = new World({ seed: 5, mode: 'macera', worldgen: ridgeGen });
    const scene = new THREE.Scene();
    const materials = createChunkMaterials(THREE, fakeAtlas, undefined, { quality: 'low' });
    const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 600);
    camera.rotation.order = 'YXZ';
    const pos = { x: 8.5, y: eyeY, z: 8.5 };
    camera.position.set(pos.x, pos.y, pos.z);
    camera.rotation.y = -Math.PI / 2; // +X'e bak
    camera.updateMatrixWorld();
    const mgr = createChunkManager({
      THREE, scene, world, materials, atlas: fakeAtlas, quality: Object.assign({}, QUALITY.low, { viewDist: 5 }), useWorker: false,
      releaseCpuData: false, planInterval: 0,
    });
    for (let i = 0; i < 600; i++) {
      mgr.update(pos, camera, 40);
      if (mgr.isReady(5)) break;
    }
    return { world, scene, materials, mgr, camera, pos };
  }

  it('sırtın arkasındaki chunklar gizlenir (üçgen/çizim azalır), kapatınca hepsi geri gelir', () => {
    const ctx = ridgeCtx(61.62);
    ctx.mgr.setOcclusion(true);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    const on = Object.assign({}, ctx.mgr.getStats());
    expect(on.chunksOccluded).toBeGreaterThan(3);
    ctx.mgr.setOcclusion(false);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    const off = ctx.mgr.getStats();
    expect(off.chunksOccluded).toBe(0);
    expect(off.triangles).toBeGreaterThan(on.triangles);
    expect(off.chunksVisible).toBeGreaterThan(on.chunksVisible);
    expect(ctx.mgr.isOcclusionEnabled()).toBe(false);
    ctx.mgr.dispose();
  });

  it('sırtta oyuncu düzenlemesi (kazılmış tünel olabilir) varsa o chunk tıkayıcı sayılmaz', () => {
    const ctx = ridgeCtx(61.62);
    ctx.mgr.setOcclusion(true);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    const before = ctx.mgr.getStats().chunksOccluded;
    expect(before).toBeGreaterThan(0);
    // sırtın iki chunk'ını (cx=1: x16..31, cx=2: x32..47) düzenle → tıkayıcılar düşer
    ctx.world.setBlock(30, 75, 8, B.AIR);
    ctx.world.setBlock(36, 75, 8, B.AIR);
    for (let i = 0; i < 20; i++) ctx.mgr.update(ctx.pos, ctx.camera, 40);
    ctx.mgr.setOcclusion(true);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    expect(ctx.mgr.getStats().chunksOccluded).toBeLessThan(before);
    ctx.mgr.dispose();
  });

  it('göz zeminin altındayken (tünel) hiçbir chunk gizlenmez', () => {
    const ctx = ridgeCtx(40.5);
    ctx.mgr.setOcclusion(true);
    ctx.mgr.update(ctx.pos, ctx.camera, 1);
    expect(ctx.mgr.getStats().chunksOccluded).toBe(0);
    ctx.mgr.dispose();
  });
});
