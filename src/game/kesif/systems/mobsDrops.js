/*
 * KEŞİF mobs sistemi — yerdeki eşyaların görünümü + ölüm noktası ışık sütunu.
 *
 *   createDropViews(G) → { update(dt, alpha, cam), setMarker(m|null), dispose(), stats, count }
 *
 *  - em.items → render/heldItems.createDroppedItem modelleri (eşya anahtarına göre havuz; döner/salınır; mıknatısla oyuncuya uçuşu sim'dendir).
 *  - Yığın görünümü: adet büyüdükçe model biraz büyür (2+, 16+, 48+). Ömrünün son 10 sn'sinde göz kırpar (kısıtlı harekette sabit).
 *  - Konum: sim hızıyla kısa öngörü (render zamanı = adım + alpha). 40 blok ötesi çizilmez; en çok 56 görünüm, kademeye göre
 *    en yakın 18/30/48 tanesi çizilir (çizim çağrısı bütçesi).
 *  - Toplu çizim: model düzeyinde animasyonu olmayan eşyalar (geometri, malzeme) çiftlerine göre TEK InstancedMesh'te çizilir
 *    (render/dropBatch.js; 48 eşya ≈ 290 → ≈ 20-30 çizim çağrısı, görünüm birebir aynı). Diğerleri bireysel grup olarak çizilir.
 *  - Ölüm işareti: ölüm noktasında yumuşak ışık sütunu + yer halkası (5 dk ya da eşyalar toplanana dek).
 */
import { createDroppedItem } from '../render/heldItems.js';
import { createDropBatch } from '../render/dropBatch.js';
import { glintKey } from '../render/enchantGlint.js';
import { capDistance, dropCapFor } from './mobsLogic.js';

const MAX_VIEWS = 56;
const POOL_PER_KEY = 6;
const SHOW = 42;
const BLINK_LEFT = 10;
const TICK = 1 / 60;

/** Adet → yığın ölçeği. */
export function stackScale(count) {
  return count >= 48 ? 1.45 : count >= 16 ? 1.3 : count >= 2 ? 1.15 : 1;
}

/** Ömrü bitmek üzere olan eşya göz kırpar: görünür mü? */
export function blinkVisible(age, life, t, reduced) {
  if (reduced || life - age > BLINK_LEFT) return true;
  return Math.floor(t * 4) % 2 === 0;
}

function tierOfG(G) {
  const s = G.quality && G.quality.settings ? G.quality.settings : null;
  return s ? (s.effTier || s.tier) : 'medium';
}

export function createDropViews(G) {
  const tierOf = () => tierOfG(G);
  const THREE = G.THREE;
  const em = G.em;
  const root = G.entityRoot;
  const views = new Map();
  const pool = new Map();
  const stats = { views: 0, created: 0, reused: 0, batched: 0 };
  const batch = createDropBatch({ THREE, root, create: (key) => createDroppedItem(THREE, key) });
  const camV = { x: 0, y: 0, z: 0 };
  let frameId = 0;
  let alphaNow = 0;
  let dtNow = 0;
  let timeNow = 0;
  let disposed = false;
  const gone = [];
  const distBuf = new Float32Array(MAX_VIEWS + 8);
  const sortBuf = new Float32Array(MAX_VIEWS + 8);
  let nDist = 0;
  let capDist = Infinity;
  let cap = dropCapFor(tierOf());
  let capT = 0;
  const reduced = () => !!(G.reducedMotion || G.accessibility);

  function take(key) {
    const list = pool.get(key);
    if (list && list.length > 0) {
      stats.reused++;
      return list.pop();
    }
    stats.created++;
    return createDroppedItem(THREE, key); // atlas: render yığını setHeldItemAtlas ile bir kez verdi
  }

  function giveBack(key, group) {
    group.visible = false;
    let list = pool.get(key);
    if (!list) {
      list = [];
      pool.set(key, list);
    }
    if (list.length < POOL_PER_KEY) list.push(group);
    else if (group.parent) group.parent.remove(group);
  }

  function visit(e) {
    if (e.removed) return;
    const dx = e.x - camV.x;
    const dz = e.z - camV.z;
    const d2 = dx * dx + dz * dz;
    let v = views.get(e.id);
    if (!v) {
      if (d2 > SHOW * SHOW || views.size >= MAX_VIEWS) return;
      const vk = glintKey(e.item, !!e.ench); // büyülü eşya mor parıltılı model kullanır
      if (batch.supports(vk)) {
        v = { id: e.id, key: vk, group: null, seen: 0 };
      } else {
        const g = take(vk);
        if (g.parent !== root) root.add(g);
        v = { id: e.id, key: vk, group: g, seen: 0 };
      }
      views.set(e.id, v);
    } else if (d2 > (SHOW + 6) * (SHOW + 6)) {
      return;
    }
    v.seen = frameId;
    const g = v.group;
    const k = alphaNow * TICK;
    const px = e.x + e.vx * k;
    const py = e.y + e.vy * k;
    const pz = e.z + e.vz * k;
    const s = stackScale(e.count);
    // çizim bütçesi: en yakın `cap` eşya çizilir
    if (nDist < distBuf.length) distBuf[nDist++] = Math.sqrt(d2);
    const shown = (d2 <= capDist * capDist || d2 < 36) && blinkVisible(e.age, e.life, timeNow, reduced());
    if (!g) {
      // toplu yol: çizilecekse örnek matrisleri yazılır (konum/ölçek + şablonun dönme/salınımı)
      if (shown) batch.add(v.key, px, py, pz, s, e.age, dtNow);
      return;
    }
    g.position.set(px, py, pz);
    if (g.scale.x !== s) g.scale.setScalar(s);
    g.visible = shown;
    if (shown && g.userData.update) g.userData.update(e.age, dtNow);
  }
  const visitCb = (e) => visit(e);
  const goneCb = (v) => {
    if (v.seen !== frameId) gone.push(v);
  };

  /* ---- ölüm işareti ---- */
  let marker = null;
  let pillar = null;
  let ring = null;
  let pillarMat = null;
  let ringMat = null;
  function buildMarker() {
    const geo = new THREE.CylinderGeometry(0.28, 0.5, 46, 14, 1, true);
    geo.translate(0, 23, 0);
    pillarMat = new THREE.MeshBasicMaterial({
      color: 0xbfe6ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    pillar = new THREE.Mesh(geo, pillarMat);
    pillar.frustumCulled = false;
    pillar.renderOrder = 15;
    const rg = new THREE.RingGeometry(0.9, 1.25, 40);
    rg.rotateX(-Math.PI / 2);
    ringMat = new THREE.MeshBasicMaterial({
      color: 0xe8f6ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    ring = new THREE.Mesh(rg, ringMat);
    ring.renderOrder = 15;
    pillar.visible = false;
    ring.visible = false;
    root.add(pillar);
    root.add(ring);
  }

  function updateMarker(t) {
    if (!marker) {
      if (pillar) {
        pillar.visible = false;
        ring.visible = false;
      }
      return;
    }
    if (!pillar) buildMarker();
    const dx = marker.x - camV.x;
    const dz = marker.z - camV.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    const calm = reduced();
    const pulse = calm ? 0.8 : 0.75 + 0.25 * Math.sin(t * 2.2);
    pillar.visible = true;
    ring.visible = true;
    pillar.position.set(marker.x, marker.y - 1.5, marker.z);
    ring.position.set(marker.x, marker.y + 0.06, marker.z);
    // yakında sönük (görüşü kapatmasın), uzakta belirgin
    const near = Math.min(1, Math.max(0.25, (d - 2) / 14));
    pillarMat.opacity = 0.22 * pulse * near;
    ringMat.opacity = 0.6 * pulse;
    const fade = marker.life - marker.t < 8 ? Math.max(0, (marker.life - marker.t) / 8) : 1;
    pillarMat.opacity *= fade;
    ringMat.opacity *= fade;
    const sc = calm ? 1 : 1 + 0.06 * Math.sin(t * 3);
    ring.scale.set(sc, 1, sc);
  }

  return {
    stats,
    get count() { return views.size; },
    setMarker(m) { marker = m || null; },
    update(dt, alpha, cam, time) {
      if (disposed) return;
      frameId++;
      dtNow = dt > 0.1 ? 0.1 : dt;
      alphaNow = alpha;
      timeNow = time;
      camV.x = cam.x; camV.y = cam.y; camV.z = cam.z;
      nDist = 0;
      capT -= dtNow;
      if (capT <= 0) {
        capT = 1;
        cap = dropCapFor(tierOf());
      }
      batch.begin();
      em.items.forEach(visitCb);
      capDist = capDistance(distBuf, nDist, cap, sortBuf);
      gone.length = 0;
      views.forEach(goneCb);
      for (let i = 0; i < gone.length; i++) {
        if (gone[i].group) giveBack(gone[i].key, gone[i].group);
        views.delete(gone[i].id);
      }
      gone.length = 0;
      batch.end();
      stats.views = views.size;
      stats.batched = batch.stats.items;
      updateMarker(time);
    },
    clear() {
      views.forEach((v) => { if (v.group) giveBack(v.key, v.group); });
      views.clear();
      batch.begin();
      batch.end();
    },
    /** Isınma: toplu çizimin InstancedMesh'lerini (programlar) önceden kur; derleme/çizim ısınması bunları sahnede görür. */
    prime(keys) {
      return batch.prime(keys);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const rm = (g) => { if (g.parent) g.parent.remove(g); };
      views.forEach((v) => { if (v.group) rm(v.group); });
      views.clear();
      batch.dispose();
      pool.forEach((l) => { for (let i = 0; i < l.length; i++) rm(l[i]); l.length = 0; });
      pool.clear();
      if (pillar) {
        rm(pillar);
        rm(ring);
        pillar.geometry.dispose();
        ring.geometry.dispose();
        pillarMat.dispose();
        ringMat.dispose();
      }
    },
  };
}
