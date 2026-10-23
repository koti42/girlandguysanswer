/*
 * KEŞİF render — toplu dışa aktarım + createKesifRenderer (WebGLRenderer kurulumu, bağlam kaybı, temizlik).
 *
 * worker.js BURADAN dışa aktarılmaz (worker ortamı `self` kullanır; chunkMgrWorkers.js Worker'ı oluşturur).
 * Ad çakışmasını (ör. mesher.KIND ↔ particles.KIND) önlemek için diğer modüller ad alanı olarak verilir.
 */
export * as atlasModule from './atlas.js';
export * as materialsModule from './materials.js';
export * as mesherModule from './mesher.js';
export * as particlesModule from './particles.js';
export * as blockHighlightModule from './blockHighlight.js';
export * as firstPersonModule from './firstPerson.js';
export * as characterModule from './character.js';
export * as heldItemsModule from './heldItems.js';
export * as mobModelsModule from './mobModels.js';
export * as itemIconsModule from './itemIcons.js';

export { generateAtlasPixels, createAtlasTextures } from './atlas.js';
export { createMaterialUniforms, createChunkMaterials, updateMaterialsFrame, createChunkGeometry } from './materials.js';
export { meshChunk } from './mesher.js';
export { createParticleSystem } from './particles.js';
export { createBlockHighlight } from './blockHighlight.js';
export { createFirstPerson } from './firstPerson.js';
export { createCharacter } from './character.js';
export { createHeldItemModel, setHeldItemAtlas } from './heldItems.js';
export { createMobModel } from './mobModels.js';

export {
  createChunkManager, adoptChunk,
} from './chunkManager.js';
export { createSky, getFogParams, srgbToLinear } from './sky.js';
export { createWeatherLayer, WEATHER_BOX } from './weather.js';
export { createPostFx } from './postfx.js';
export {
  QUALITY, QUALITY_KEYS, VIEW_DIST_MIN, VIEW_DIST_MAX, pickInitialTier, collectDeviceHints, readRendererString,
  loadQualityPref, saveQualityPref, createKesifQuality,
} from './quality.js';
export { generateChunkData, makeGenContext, meshFromWire, MESH_DEFAULTS } from './chunkMgrCore.js';
export { spiralOffsets, chunkPriority, frustumPlanes, sphereVisible } from './chunkMgrQueue.js';

/**
 * WebGLRenderer + tuval kurulumu (runner/engine/stage.js örüntüsü) ve WebGL bağlam kaybı yönetimi.
 *
 * @param {object} THREE three modülü
 * @param {{container:HTMLElement, antialias?:boolean, coarse?:boolean, pixelRatio?:number,
 *   toneMapping?:('neutral'|'aces'|'none'), exposure?:number, clearColor?:number,
 *   onContextLost?:Function, onContextRestored?:Function}} opts
 * @returns {{renderer, canvas, resize(force?:boolean):boolean, setPixelRatio(r:number):void, getSize():{width:number,height:number},
 *   readonly contextLost:boolean, readonly width:number, readonly height:number, dispose():void}}
 *
 * Antialias: dokunmatik cihazlarda kapalı (post-fx MSAA'sı ya da düşük dpr yeter), masaüstünde açık (post-fx
 * kapalıyken doğrudan çizimde de kenar yumuşatma olsun). Ton eşleme varsayılanı Khronos 'neutral' (görsel denemede ACES
 * dokuları hazeli/soluk gösterdi; neutral renkleri korur, parlak vurguları sıkıştırır). Post-fx açıksa ton eşleme son
 * birleştirme geçişinde (aynı renderer ayarıyla) yapılır.
 */
export function createKesifRenderer(THREE, opts) {
  const o = opts || {};
  const container = o.container;
  if (!container) throw new TypeError('createKesifRenderer: container gerekli');
  const antialias = o.antialias !== undefined ? !!o.antialias : !o.coarse;
  const renderer = new THREE.WebGLRenderer({
    antialias,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(o.pixelRatio > 0 ? o.pixelRatio : 1);
  renderer.setClearColor(o.clearColor !== undefined ? o.clearColor : 0xcfe6f5, 1);
  renderer.shadowMap.enabled = false;
  const tm = o.toneMapping || 'neutral';
  renderer.toneMapping = tm === 'none' ? THREE.NoToneMapping : tm === 'neutral' ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure > 0 ? o.exposure : 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';
  canvas.style.webkitTapHighlightColor = 'transparent';
  canvas.style.outline = 'none';
  canvas.setAttribute('aria-hidden', 'true');
  container.appendChild(canvas);

  let width = 1;
  let height = 1;
  let lost = false;
  let disposed = false;

  const onLost = (e) => {
    if (disposed) return;
    e.preventDefault();
    lost = true;
    if (typeof o.onContextLost === 'function') o.onContextLost(e);
  };
  const onRestored = (e) => {
    if (disposed) return;
    lost = false;
    if (typeof o.onContextRestored === 'function') o.onContextRestored(e);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  function resize(force) {
    const w = Math.max(1, Math.floor(container.clientWidth));
    const h = Math.max(1, Math.floor(container.clientHeight));
    if (!force && w === width && h === height) return false;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    return true;
  }
  resize(true);

  return {
    renderer,
    canvas,
    resize,
    setPixelRatio(r) {
      if (!(r > 0) || disposed) return;
      renderer.setPixelRatio(r);
      renderer.setSize(width, height, false);
    },
    getSize() {
      return { width, height };
    },
    get contextLost() {
      return lost;
    },
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      const gl = renderer.getContext();
      renderer.dispose();
      // Bağlamı hemen bırak: oyna-kapat döngüsünde tarayıcının WebGL bağlam sınırına takılmayalım.
      if (gl && !gl.isContextLost()) renderer.forceContextLoss();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
