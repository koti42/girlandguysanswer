/*
 * KEŞİF render — kare başına görünürlük: frustum + sis mesafesi + arazi ufku tıkaması, şeffaf bant sıralaması, kare istatistiği.
 *
 *   const culler = createCuller({recs, store, stats, occlusion, getViewDist, meshesBuilt})
 *   culler.dirtyRecs() / culler.dirtyBands()   kayıt/bant kümesi değişti (dizi önbelleği yenilenir)
 *   culler.tick(dt)                            kare süresi (tıkama yeniden hesap aralığı için)
 *   culler.cull(camera)                        görünürlüğü günceller; stats alanları (drawCalls, triangles, chunksVisible, bandsMeshed...) yazılır
 *   culler.setOcclusion(bool) / isOcclusionEnabled() / setFogDistance(d) / clear()
 */
import { boxDistance, boxVisible, frustumPlanes, sphereVisible } from './chunkMgrQueue.js';
import { RENDER_ORDER } from './chunkMgrMeshes.js';
import { createOcclusion } from './chunkOcclusion.js';
import { byScoreDesc } from './chunkMgrWorld.js';

/** Arazi ufku tıkaması: göz bu kadar (blok) oynamadan/chunk kümesi değişmeden yeniden hesaplanmaz. */
const OCC_MOVE = 0.5;
const OCC_MIN_INTERVAL_S = 0.12;

export function createCuller(c) {
  const { recs, store, stats } = c;
  const recArr = []; // kare başına döngü için
  let recArrDirty = true;
  const bandArr = []; // tüm bant kayıtları
  let bandArrDirty = true;
  const planes = new Float64Array(24);
  const tlist = [];
  const occlusion = createOcclusion();
  let occEnabled = c.occlusion !== false;
  let occX = 1e9;
  let occY = 1e9;
  let occZ = 1e9;
  let occAge = 1e9;
  let occSig = -1;
  let occHidden = 0;
  let fogCull = 0;
  let sortX = 1e9;
  let sortZ = 1e9;
  let lastTCount = -1;

  /** Arazi ufku tıkaması (chunkOcclusion.js): göz ≥ OCC_MOVE oynadı ya da kümesi değiştiyse, en çok ~8 Hz yeniden hesaplanır. */
  function runOcclusion(ex, ey, ez) {
    if (!occEnabled) {
      if (occHidden > 0) {
        for (let i = 0; i < recArr.length; i++) recArr[i].occluded = false;
        occHidden = 0;
      }
      stats.chunksOccluded = 0;
      return;
    }
    const sig = c.meshesBuilt() + recArr.length * 7919;
    const moved = Math.abs(ex - occX) + Math.abs(ey - occY) + Math.abs(ez - occZ) >= OCC_MOVE;
    if ((moved || sig !== occSig) && occAge >= OCC_MIN_INTERVAL_S) {
      occHidden = occlusion.run(ex, ey, ez, recArr, recArr.length);
      occX = ex;
      occY = ey;
      occZ = ez;
      occSig = sig;
      occAge = 0;
    }
    stats.chunksOccluded = occHidden;
  }

  function cull(camera) {
    camera.updateMatrixWorld();
    frustumPlanes(camera.projectionMatrix.elements, camera.matrixWorldInverse.elements, planes);
    const cam = camera.matrixWorld.elements;
    const cxw = cam[12];
    const cyw = cam[13];
    const czw = cam[14];
    const viewDist = c.getViewDist();
    const far = fogCull > 0 ? fogCull : (viewDist + 1) * 16;
    let dc = 0;
    let tris = 0;
    let vis = 0;
    let meshedCols = 0;
    let loaded = 0;
    let bands = 0;
    tlist.length = 0;
    if (recArrDirty) {
      recArr.length = 0;
      recs.forEach((r) => recArr.push(r));
      recArrDirty = false;
    }
    if (bandArrDirty) {
      bandArr.length = 0;
      for (let i = 0; i < recArr.length; i++) {
        const bs = recArr[i].bands;
        if (!bs) continue;
        for (let k = 0; k < bs.length; k++) if (bs[k]) bandArr.push(bs[k]);
      }
      bandArrDirty = false;
    }
    runOcclusion(cxw, cyw, czw);
    for (let ri = 0; ri < recArr.length; ri++) {
      const rec = recArr[ri];
      if (rec.loaded) loaded++;
      if (rec.planned && rec.pending === 0 && rec.loaded && rec.dist <= viewDist + 0.5) meshedCols++;
    }
    for (let bi = 0; bi < bandArr.length; bi++) {
      const band = bandArr[bi];
      if (!band.hasMesh) continue;
      bands++;
      const s = band.sphere;
      const dx = s.x - cxw;
      const dy = s.y - cyw;
      const dz = s.z - czw;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const v = !band.col.occluded && d - s.r <= far && sphereVisible(planes, s.x, s.y, s.z, s.r)
        && boxDistance(band.box, cxw, cyw, czw) <= far && boxVisible(planes, band.box);
      if (v !== band.visible) {
        band.visible = v;
        store.setVisible(band, v);
      }
      if (!v) continue;
      vis++;
      for (let p = 0; p < 3; p++) {
        if (band.meshes[p]) {
          dc++;
          tris += band.tris[p];
        }
      }
      if (band.meshes[2]) {
        band.score = d;
        tlist.push(band);
      }
    }
    // şeffaf geçiş: uzaktan yakına (renderOrder artan = önce çizilir)
    if (tlist.length > 1 && (Math.abs(cxw - sortX) + Math.abs(czw - sortZ) > 2 || tlist.length !== lastTCount)) {
      tlist.sort(byScoreDesc);
      for (let i = 0; i < tlist.length; i++) tlist[i].meshes[2].renderOrder = RENDER_ORDER.transparentBase + i;
      sortX = cxw;
      sortZ = czw;
    }
    lastTCount = tlist.length;
    stats.drawCalls = dc;
    stats.triangles = tris;
    stats.chunksVisible = vis;
    stats.chunksMeshed = meshedCols;
    stats.chunksLoaded = loaded;
    stats.bandsMeshed = bands;
  }

  return {
    cull,
    dirtyRecs() { recArrDirty = true; },
    dirtyBands() { bandArrDirty = true; },
    tick(dt) { occAge += dt; },
    setOcclusion(on) {
      occEnabled = !!on;
      occSig = -1;
      occAge = 1e9;
    },
    isOcclusionEnabled() { return occEnabled; },
    setFogDistance(d) { fogCull = Number.isFinite(d) && d > 0 ? d : 0; },
    clear() {
      recArr.length = 0;
      bandArr.length = 0;
    },
  };
}
