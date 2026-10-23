/*
 * KEŞİF render — karakterin SIRTINDAKİ jetpack: çubukta jetpack taşınırken üçüncü şahıs karakterinin göğüs kemiğine takılan model.
 *
 *   createBackpack(THREE, G) → { update(show, thrusting, time), nozzles(out) → [{x,y,z}…] (dünya konumu), dispose() }
 *
 * Model heldItemsTech.buildJetpack (aynı geometri/malzeme önbelleği). Karakter yeniden kurulsa da kemikler kalıcıdır; kemik yoksa sessizce atlanır.
 */
import { createHeldItemModel, disposeHeldItemModel } from './heldItems.js';

export function createBackpack(THREE, G) {
  let model = null;
  let chest = null;
  let skins = G.cosmetics ? G.cosmetics.skins : null; // Keşif görünümü (jetpack tankı); null = varsayılan
  const v = new THREE.Vector3();

  function ensure() {
    if (model) return true;
    const rig = G.character && G.character.rig;
    if (!rig || !rig.chest) return false;
    chest = rig.chest;
    model = createHeldItemModel(THREE, 'item:jetpack', undefined, skins);
    if (!model) return false;
    model.position.set(0, -0.12, 0.17);
    model.rotation.set(0, Math.PI, 0);
    model.scale.setScalar(1.55);
    model.visible = false;
    chest.add(model);
    return true;
  }

  function update(show, thrusting, time) {
    if (!show && !model) return;
    if (!ensure()) return;
    model.visible = !!show;
    if (show && model.userData && typeof model.userData.update === 'function') model.userData.update(time);
  }

  /** Lüle uçlarının dünya konumları (alev parçacığı için); model görünür değilse boş. */
  function nozzles(out) {
    out.length = 0;
    if (!model || !model.visible) return out;
    model.updateWorldMatrix(true, false);
    [-0.056, 0.056].forEach((x) => {
      v.set(x, -0.06, 0);
      v.applyMatrix4(model.matrixWorld);
      out.push({ x: v.x, y: v.y, z: v.z });
    });
    return out;
  }

  /** Keşif görünümü kümesi değişti: model yeniden kurulur (kurulduysa). */
  function setSkins(set) {
    const next = set && set.key ? set : null;
    if ((next ? next.key : '') === (skins ? skins.key : '')) return;
    skins = next;
    if (model) {
      const wasVisible = model.visible;
      if (chest) chest.remove(model);
      disposeHeldItemModel(model);
      model = null;
      if (ensure()) model.visible = wasVisible;
    }
  }

  function dispose() {
    if (model) {
      if (chest) chest.remove(model);
      disposeHeldItemModel(model);
      model = null;
    }
  }

  return { update, nozzles, dispose, setSkins };
}
