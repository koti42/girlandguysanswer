/*
 * KEŞİF render — yere düşen eşyaları (geometri, malzeme) çiftlerine göre TOPLU (InstancedMesh) çizer.
 *
 *   createDropBatch({THREE, create(key) → Group, root, cap}) → {
 *     supports(key) → bool           bu eşya anahtarı toplu çizilebilir mi (model düzeyinde animasyonu/çoklu malzemesi olmayanlar)
 *     begin()                        kare başı: tüm örnek sayaçlarını sıfırla
 *     add(key, x, y, z, scale, t, dt) → bool   bir eşya örneği (şablonun update(t, dt)'si ile dönme/salınım uygulanır)
 *     end()                          sayaçları/instanceMatrix'i işle
 *     prime(keys)                    ısınma: bu anahtarların çiftleri için InstancedMesh kur (görünmez)
 *     stats {items, pairs, drawn}    dispose()
 *   }
 *
 * Neden: her yere düşen eşya modeli 3–25 ağdan oluşuyordu (küp 3, çiçek ~8, alet ~14, kılıç ~17): 48 eşya = ~290 çizim çağrısı. Geometri ve
 * malzemeler zaten önbellekli/paylaşımlı (heldItemsKit G/stdMat/basicMat) → AYNI (geometri, malzeme) çiftini kullanan tüm örnekler (ör. her
 * eşyanın zemin gölgesi, aynı renkli parıltı küresi, aynı bloğun yüzleri) tek InstancedMesh'e girer. Görünüm birebir aynıdır: örnek matrisi =
 * şablon grubunun (konum, ölçek, update(t,dt) dönme/salınımı) dünya matrisi × parça yerel matrisi.
 * Toplu OLMAYANLAR (model.userData.update olan, çoklu malzemeli, SkinnedMesh) bireysel grup olarak çizilmeye devam eder.
 */

const DEFAULT_CAP = 64;

export function pairKeyOf(geo, mat) {
  return geo.uuid + '|' + mat.uuid;
}

/**
 * Şablon grubunu çözümler: toplu çizilebilirse {parts:[{mesh, geo, mat, pk}]} yoksa null.
 * Toplu OLMAYAN: Mesh dışı çizilebilirler (Points/Line/Sprite), SkinnedMesh/InstancedMesh, çoklu malzeme, model düzeyi userData.update.
 */
export function analyzeTemplate(group) {
  if (!group || !group.isObject3D) return null;
  const parts = [];
  let ok = true;
  group.traverse((o) => {
    if (!ok || o === group) return;
    if (o.userData && typeof o.userData.update === 'function') { ok = false; return; } // model düzeyi animasyon
    if (o.isPoints || o.isLine || o.isSprite || o.isSkinnedMesh || o.isInstancedMesh) { ok = false; return; }
    if (o.isMesh) {
      if (!o.geometry || !o.material || Array.isArray(o.material)) { ok = false; return; }
      // özel gölgelendirici (instanceMatrix'i bilmeyebilir) ya da kullanıcı tanımlı onBeforeRender → bireysel kalır
      if (o.material.isShaderMaterial || o.material.isRawShaderMaterial) { ok = false; return; }
      if (Object.prototype.hasOwnProperty.call(o, 'onBeforeRender')) { ok = false; return; }
      parts.push({
        mesh: o, geo: o.geometry, mat: o.material, pk: pairKeyOf(o.geometry, o.material),
      });
    }
  });
  if (!ok || parts.length === 0) return null;
  return { parts };
}

export function createDropBatch(d) {
  const THREE = d.THREE;
  const cap = d.cap > 0 ? d.cap : DEFAULT_CAP;
  const root = d.root;
  const templates = new Map(); // key → {group, parts} | false
  const pairs = new Map(); // pk → {im, n}
  const stats = { items: 0, pairs: 0, drawn: 0, dropped: 0 };
  let disposed = false;

  function template(key) {
    let t = templates.get(key);
    if (t !== undefined) return t;
    const group = d.create(key);
    const a = analyzeTemplate(group);
    t = a ? { group, parts: a.parts } : false;
    templates.set(key, t);
    return t;
  }

  function pairFor(part) {
    let p = pairs.get(part.pk);
    if (p) return p;
    const im = new THREE.InstancedMesh(part.geo, part.mat, cap);
    im.frustumCulled = false;
    im.count = 0;
    im.visible = false;
    im.renderOrder = part.mesh.renderOrder;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.name = 'drop-batch';
    if (root) root.add(im);
    p = { im, n: 0 };
    pairs.set(part.pk, p);
    return p;
  }

  return {
    stats,
    get pairCount() { return pairs.size; },
    supports(key) {
      if (disposed) return false;
      return template(key) !== false;
    },
    begin() {
      stats.items = 0;
      pairs.forEach((p) => { p.n = 0; });
    },
    add(key, x, y, z, scale, t, dt) {
      if (disposed) return false;
      const tp = template(key);
      if (!tp) return false;
      const g = tp.group;
      g.position.set(x, y, z);
      g.scale.setScalar(scale);
      if (g.userData && typeof g.userData.update === 'function') g.userData.update(t, dt);
      g.updateMatrixWorld(true);
      let placed = true;
      for (let i = 0; i < tp.parts.length; i++) {
        const part = tp.parts[i];
        const p = pairFor(part);
        if (p.n >= cap) { stats.dropped++; placed = false; continue; }
        p.im.setMatrixAt(p.n++, part.mesh.matrixWorld);
      }
      stats.items++;
      return placed;
    },
    end() {
      let drawn = 0;
      pairs.forEach((p) => {
        if (p.im.count !== p.n) p.im.count = p.n;
        const vis = p.n > 0;
        if (p.im.visible !== vis) p.im.visible = vis;
        if (vis) {
          p.im.instanceMatrix.needsUpdate = true;
          drawn++;
        }
      });
      stats.pairs = pairs.size;
      stats.drawn = drawn;
    },
    /** Isınma: anahtarların parçaları için InstancedMesh kur (görünmez, count 0). Dönüş: toplu çizilebilen anahtar sayısı. */
    prime(keys) {
      let n = 0;
      for (let i = 0; i < keys.length; i++) {
        const tp = template(keys[i]);
        if (!tp) continue;
        n++;
        for (let k = 0; k < tp.parts.length; k++) pairFor(tp.parts[k]);
      }
      return n;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pairs.forEach((p) => {
        if (p.im.parent) p.im.parent.remove(p.im);
        p.im.dispose();
      });
      pairs.clear();
      templates.clear();
    },
  };
}
