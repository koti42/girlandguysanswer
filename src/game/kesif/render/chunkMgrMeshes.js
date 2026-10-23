/*
 * KEŞİF render — chunk mesh deposu: mesher çıktısını three Mesh'lerine çevirir, Mesh nesnelerini havuzlar, geometriyi atar.
 *
 *   createMeshStore(THREE, {materials, releaseCpuData}) → store
 *     store.root                THREE.Group (sahneye eklenecek)
 *     store.apply(rec, mesh)    rec.meshes[0..2] (opak/kesik/şeffaf) güncellenir; rec.tris, rec.sphere hazırlanır
 *     store.clear(rec)          rec'in mesh'lerini havuza iade eder, geometriyi dispose eder
 *     store.setVisible(rec, v)
 *     store.dispose()
 *
 * Mesh nesneleri matrixAutoUpdate=false ile bir kez konumlanır; frustum culling chunkManager'da (stats için) yapılır,
 * bu yüzden mesh.frustumCulled=false. releaseCpuData: GPU'ya yüklendikten sonra köşe dizilerini bırakır (bellek yarıya iner);
 * bağlam kaybından sonra chunk'lar yeniden mesh'lenmelidir (chunkManager.rebuildMeshes).
 */
import { createCityGeometry as createChunkGeometry } from './cityGeometry.js'; // aCity yalnız mesher opts.city çıktısında (şehir boyutu) eklenir; ana diyarda bayt-aynı
import { PASS_NAMES } from './mesher.js';

/** renderOrder tabanları: opak 0, kesik 1, şeffaf 100+ (chunkManager chunk uzaklığına göre sıralar). */
export const RENDER_ORDER = Object.freeze({ opaque: 0, cutout: 1, transparentBase: 100 });

function releaseOnUpload() {
  this.array = null;
}

export function createMeshStore(THREE, opts) {
  const o = opts || {};
  const materials = o.materials;
  const release = o.releaseCpuData !== false;
  const root = new THREE.Group();
  root.name = 'kesif-chunks';
  root.matrixAutoUpdate = false;
  const pool = [];
  const mats = [materials.opaque, materials.cutout, materials.transparent];

  function takeMesh(pass) {
    const m = pool.pop() || new THREE.Mesh(undefined, undefined);
    m.material = mats[pass];
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = pass === 0 ? RENDER_ORDER.opaque : pass === 1 ? RENDER_ORDER.cutout : RENDER_ORDER.transparentBase;
    return m;
  }

  function freeGeometry(g) {
    if (g) g.dispose();
  }

  function giveBack(m) {
    if (!m) return;
    root.remove(m);
    freeGeometry(m.geometry);
    m.geometry = undefined;
    m.visible = true;
    pool.push(m);
  }

  return {
    root,

    /**
     * @param {object} rec chunkManager BANT kaydı: {cx, cz, baseY, meshes:[m|null ×3], tris:[n ×3], sphere:{x,y,z,r}, box}
     * @param {object} mesh mesher çıktısı (opaque/cutout/transparent/bounds)
     * @returns {number} üçgen sayısı toplamı
     */
    apply(rec, mesh) {
      const ox = rec.cx * 16;
      const oz = rec.cz * 16;
      const oy = rec.baseY || 0;
      let total = 0;
      for (let p = 0; p < 3; p++) {
        const pass = mesh[PASS_NAMES[p]];
        const geo = pass && pass.vertexCount > 0 ? createChunkGeometry(THREE, pass, mesh.bounds) : null;
        let m = rec.meshes[p];
        if (!geo) {
          if (m) {
            giveBack(m);
            rec.meshes[p] = null;
          }
          rec.tris[p] = 0;
          continue;
        }
        if (release) {
          const attrs = geo.attributes;
          for (const k in attrs) attrs[k].onUpload(releaseOnUpload);
          geo.index.onUpload(releaseOnUpload);
        }
        if (!m) {
          m = takeMesh(p);
          m.visible = rec.visible !== false;
          m.position.set(ox, oy, oz);
          m.updateMatrix();
          m.matrixWorld.copy(m.matrix);
          root.add(m);
          rec.meshes[p] = m;
        } else {
          freeGeometry(m.geometry);
        }
        m.geometry = geo;
        rec.tris[p] = pass.indexCount / 3;
        total += rec.tris[p];
      }
      const b = mesh.bounds;
      rec.sphere.x = ox + b.center[0];
      rec.sphere.y = oy + b.center[1];
      rec.sphere.z = oz + b.center[2];
      rec.sphere.r = b.radius + 1;
      const bx = rec.box;
      bx[0] = ox + b.min[0] - 0.5;
      bx[1] = oy + b.min[1] - 0.5;
      bx[2] = oz + b.min[2] - 0.5;
      bx[3] = ox + b.max[0] + 0.5;
      bx[4] = oy + b.max[1] + 0.5;
      bx[5] = oz + b.max[2] + 0.5;
      rec.hasMesh = total > 0 || rec.meshes[0] !== null || rec.meshes[1] !== null || rec.meshes[2] !== null;
      return total;
    },

    clear(rec) {
      for (let p = 0; p < 3; p++) {
        if (rec.meshes[p]) {
          giveBack(rec.meshes[p]);
          rec.meshes[p] = null;
        }
        rec.tris[p] = 0;
      }
      rec.hasMesh = false;
    },

    setVisible(rec, v) {
      for (let p = 0; p < 3; p++) {
        const m = rec.meshes[p];
        if (m && m.visible !== v) m.visible = v;
      }
    },

    dispose() {
      const kids = root.children.slice();
      for (let i = 0; i < kids.length; i++) {
        root.remove(kids[i]);
        freeGeometry(kids[i].geometry);
      }
      pool.length = 0;
    },
  };
}
