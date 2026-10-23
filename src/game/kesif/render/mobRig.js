/*
 * KEŞİF render — yaratık iskeleti (Rig): düğümler, birleşik ağ parçaları, malzemeler, geometri önbelleği,
 * iki kemikli IK ve yumuşak ışıma dokusu. getKit(THREE) tarafından kurulur; builder dosyaları rig.* ile kullanır.
 */
import {
  DETAIL_Q, clamp, rng, seedOf, smoothstep,
} from './mobMath.js';
import {
  SLOTS, boneSupport, boundsOf, cullSphere, mergePieces, normalizeKeep, patchRigidSkinShader, restSignature,
} from './mobMerge.js';

/** kit: {THREE, MeshBuilder, Tendril, rgb} — Rig, ik2, önbellek ve glowTexture eklenerek tamamlanır. */
export function createRigRuntime(THREE, kit) {
  const { MeshBuilder, Tendril } = kit;
  /* ---------------------------------------------------------------- iki kemikli IK (kol/bacak hedefe uzanır) */
  const ikA = new THREE.Vector3();
  const ikB = new THREE.Vector3();
  const ikC = new THREE.Vector3();
  const ikD = new THREE.Vector3();
  const ikDown = new THREE.Vector3(0, -1, 0);
  const ikInv = new THREE.Quaternion();
  const ikOut = { qU: new THREE.Quaternion(), qF: new THREE.Quaternion(), reach: 0 };
  /**
   * İki kemikli uzvu (üst kemik aşağı -Y sarkar) omuz s'den hedef t'ye uzatır; dirsek pole yönüne bükülür.
   * Dönen ortak nesne (yeniden kullanılır): qU üst düğümün, qF alt düğümün YEREL dönüşü; reach ulaşılan oran.
   */
  function ik2(l1, l2, sx, sy, sz, tx, ty, tz, px, py, pz) {
    ikA.set(tx - sx, ty - sy, tz - sz);
    const dist = ikA.length();
    const dc = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    if (dist < 1e-6) ikA.set(0, -1, 0); else ikA.divideScalar(dist);
    const cosA = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1);
    const sinA = Math.sqrt(1 - cosA * cosA);
    ikB.set(px, py, pz);
    ikB.addScaledVector(ikA, -ikB.dot(ikA));
    if (ikB.lengthSq() < 1e-8) { ikB.set(0, 0, 1); ikB.addScaledVector(ikA, -ikB.dot(ikA)); }
    ikB.normalize();
    ikC.copy(ikA).multiplyScalar(l1 * cosA).addScaledVector(ikB, l1 * sinA);
    ikD.copy(ikA).multiplyScalar(dc).sub(ikC);
    ikC.normalize();
    ikOut.qU.setFromUnitVectors(ikDown, ikC);
    ikInv.copy(ikOut.qU).invert();
    ikD.normalize().applyQuaternion(ikInv);
    ikOut.qF.setFromUnitVectors(ikDown, ikD);
    ikOut.reach = dist / (l1 + l2);
    return ikOut;
  }

  /* ---------------------------------------------------------------- yumuşak ışıma dokusu (sprite halo) */
  let glowTex = null;
  function glowTexture() {
    if (glowTex) return glowTex;
    const N = 64;
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dx = (x + 0.5) / N * 2 - 1;
        const dy = (y + 0.5) / N * 2 - 1;
        const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const a = Math.pow(1 - r, 2.2) * (1 - smoothstep(0.75, 1, r) * 0.0) + Math.exp(-r * r * 14) * 0.6;
        const i = (y * N + x) * 4;
        data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
        data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
      }
    }
    glowTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    glowTex.colorSpace = THREE.SRGBColorSpace;
    glowTex.magFilter = THREE.LinearFilter;
    glowTex.minFilter = THREE.LinearFilter;
    glowTex.needsUpdate = true;
    return glowTex;
  }

  /* ---------------------------------------------------------------- geometri önbelleği (türe göre paylaşımlı) */
  const cache = new Map();
  function acquire(key, make) {
    let e = cache.get(key);
    if (!e) {
      const geos = make();
      let tris = 0;
      for (let i = 0; i < geos.length; i++) if (geos[i]) tris += geos[i].index.count / 3;
      e = { geos, refs: 0, tris };
      cache.set(key, e);
    }
    e.refs++;
    return e;
  }
  function release(key) {
    const e = cache.get(key);
    if (!e) return;
    e.refs--;
    if (e.refs <= 0) {
      for (let i = 0; i < e.geos.length; i++) if (e.geos[i]) e.geos[i].dispose();
      cache.delete(key);
    }
  }

  /* ---------------------------------------------------------------- Rig: düğümler, parçalar, malzemeler */

  class Rig {
    /** opts: {key, level 0..2, variant, seed, reducedMotion, tint} */
    constructor(o) {
      this.kit = kit;
      this.THREE = THREE;
      this.key = o.key;
      this.level = o.level === undefined ? 2 : o.level;
      this.variant = o.variant || 0;
      this.reduced = !!o.reducedMotion;
      this.rand = rng(o.seed === undefined ? seedOf(o.key) : o.seed);
      this.root = new THREE.Group();
      this.root.name = 'rig:' + o.key;
      this.n = {};
      this.parts = [];
      this.dyn = [];
      this.sprites = [];
      this.mats = {};
      this.litMats = [];
      this.glowMats = [];
      this.stride = 5; // yürüyüş: bloğa düşen faz (rad)
      this.attackDur = 0.8;
      this.glowColor = 0xffffff;
      this.deathColor = 0xffffff;
      this.alpha = 1;
      this.fade = 1;
      this.onCue = null;
      this.tint = o.tint === undefined ? 0xffffff : o.tint;
      // Birleşik (SkinnedMesh) mod: parçalar malzeme başına tek deriye toplanır (bkz. mobMerge.js; finish() ile kurulur)
      this.mergeMode = !!o.merge && typeof THREE.SkinnedMesh === 'function' && typeof THREE.Skeleton === 'function';
      // Ortak kemik atlası (mobBones.js) verilmişse matrisler tek dokuda toplanır (kare başına tek yükleme); yoksa iskelet kendi dokusunu kullanır
      this.atlas = this.mergeMode && o.boneAtlas ? o.boneAtlas : null;
      this.uBase = { value: 0 };
      this.cache = null;
      this.lastBase = -1;
      this.atlasId = 0;
      this.bones = null;
      this.boneIndex = null;
      this.boneRest = null;
      this.boneInv = null;
      this.restSig = '';
      this.skeleton = null;
      this.mergedKey = null;
      this.mergedMeshes = new Map();
      this.finished = false;
      // Kemik matrisleri yalnız animasyon çalıştığında (touch()) yeniden hesaplanır/yüklenir; kök dünya matrisinden bağımsızdır (bkz. _updateBones)
      this.skeletonDirty = true;
      this._relPool = [];
      this._relMemo = new Map();
      this._m4 = new THREE.Matrix4();
      this._ident = new THREE.Matrix4();
      this.addMat('lit', 'lit', { color: this.tint });
      this.addMat('glow', 'glow', {});
    }

    cue(name, x, y, z) {
      if (this.onCue) this.onCue(name, x || 0, y || 0, z || 0);
    }

    /**
     * Malzeme ekler. kind: 'lit' (köşe renkli ışıklı) | 'glow' (ışıksız, HDR köşe rengi) |
     * 'additive' (toplamalı ışıma, saydam). o: {rough, metal, emissive, opacity, color, double}.
     */
    addMat(name, kind, o = {}) {
      let m;
      if (kind === 'lit') {
        const low = this.level === 0;
        m = low
          ? new THREE.MeshLambertMaterial({ vertexColors: true })
          : new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: o.rough === undefined ? 0.82 : o.rough, metalness: o.metal || 0,
          });
        if (o.color !== undefined) m.color.setHex(o.color);
        const em = o.emissive === undefined ? 0x000000 : o.emissive;
        m.emissive.setHex(em);
        m.userData.baseEmissive = m.emissive.clone();
        if (o.opacity !== undefined && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; }
        if (o.double) m.side = THREE.DoubleSide;
        this.litMats.push(m);
      } else {
        m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, fog: true });
        if (kind === 'additive') {
          m.transparent = true;
          m.blending = THREE.AdditiveBlending;
          m.depthWrite = false;
          m.opacity = o.opacity === undefined ? 0.4 : o.opacity;
        } else if (o.opacity !== undefined && o.opacity < 1) {
          m.transparent = true;
          m.opacity = o.opacity;
        }
        if (o.double) m.side = THREE.DoubleSide;
        this.glowMats.push(m);
      }
      // birleşik deri: köşe başına tek kemik okuyan hafif gölgelendirici (iskeletsiz ağlarda USE_SKINNING yok → kod aynı)
      if (this.mergeMode) {
        const uBase = this.atlas ? this.uBase : null;
        m.onBeforeCompile = (shader) => patchRigidSkinShader(shader, uBase);
        m.customProgramCacheKey = () => (uBase ? 'kesif-rigid-skin-atlas' : 'kesif-rigid-skin');
      }
      m.userData.baseTransparent = m.transparent;
      m.userData.baseOpacity = m.opacity;
      m.userData.k = 1;
      m.userData.name = name;
      m.userData.baseColor = kind === 'lit' ? null : new THREE.Color(1, 1, 1);
      this.mats[name] = m;
      return m;
    }

    /** Işıklı malzemenin taban parıltısı (vuruş/ölüm bunun üstüne biner). */
    baseEmissive(name, hex) {
      const m = this.mats[name];
      m.emissive.setHex(hex);
      m.userData.baseEmissive = m.emissive.clone();
    }

    /** Boş animasyon düğümü. */
    node(name, parent, pivot) {
      const g = new THREE.Group();
      g.name = name;
      if (pivot) g.position.set(pivot[0], pivot[1], pivot[2]);
      (parent || this.root).add(g);
      this.n[name] = g;
      return g;
    }

    /**
     * Düğüm + birleştirilmiş ağ. build(b, g, x): b = ışıklı, g = ışıma, x = ek (o.mats[2] malzemesi).
     * o.pk: önbellek anahtarı (aynı geometriyi paylaşan düğümler için), o.mats: [lit, glow, extra] adları.
     */
    part(name, parent, pivot, build, o = {}) {
      const node = this.node(name, parent, pivot);
      if (build) this.attach(node, o.pk || name, build, o);
      return node;
    }

    /**
     * o.keep (yalnız birleşik modda anlamlı): true → bu parçanın ağları birleşmez (düğüm görünürlüğü/ağ ölçeği animasyonla sürülür),
     * [slot,...] → yalnız o yuvalar ayrı kalır (0 ışıklı, 1 ışıma, 2 ek).
     */
    attach(node, pk, build, o = {}) {
      const mats = o.mats || ['lit', 'glow', 'lit'];
      const keep = normalizeKeep(o.keep);
      const entry = { node, pk, build, mats, meshes: [null, null, null], key: null, keep, merged: false };
      this.parts.push(entry);
      if (this.mergeMode) {
        entry.merged = !(keep[0] && keep[1] && keep[2]);
        if (entry.merged && !(keep[0] || keep[1] || keep[2])) return entry; // tamamen birleşik: ayrı ağ kurulmaz
      }
      this._apply(entry);
      return entry;
    }

    _apply(entry) {
      const key = this.key + ':' + this.variant + ':' + entry.pk + ':' + this.level;
      if (entry.key === key) return;
      const q = DETAIL_Q[this.level];
      const e = acquire(key, () => {
        const bs = [new MeshBuilder({ q }), new MeshBuilder({ glow: true, q }), new MeshBuilder({ q })];
        entry.build(bs[0], bs[1], bs[2], this);
        return bs.map((b) => (b.vertexCount ? b.build() : null));
      });
      if (entry.key) release(entry.key);
      entry.key = key;
      for (let i = 0; i < 3; i++) {
        const geo = this.mergeMode && !entry.keep[i] ? null : e.geos[i]; // birleşik modda yalnız `keep` yuvaları ayrı ağ olur
        let mesh = entry.meshes[i];
        if (geo) {
          if (!mesh) {
            mesh = new THREE.Mesh(geo, this.mats[entry.mats[i]]);
            mesh.name = entry.node.name + (i === 1 ? ':glow' : i === 2 ? ':x' : '');
            entry.node.add(mesh);
            entry.meshes[i] = mesh;
          } else mesh.geometry = geo;
        } else if (mesh) {
          entry.node.remove(mesh);
          entry.meshes[i] = null;
        }
      }
    }

    /** Detay kademesini değiştirir (önbellekten başka geometri bağlar). Dinamik tüpler etkilenmez. */
    setLevel(level) {
      if (level === this.level) return;
      this.level = level;
      for (let i = 0; i < this.parts.length; i++) {
        const e = this.parts[i];
        if (this.mergeMode && e.merged && !(e.keep[0] || e.keep[1] || e.keep[2])) continue;
        this._apply(e);
      }
      if (this.mergeMode && this.finished) this._applyMerged();
    }

    /**
     * Birleşik mod: builder bittikten ve animasyon başlamadan ÖNCE çağrılır. Düğümlerin o anki (dinlenme) pozunu kaydeder,
     * kemik iskeletini kurar ve birleşik deri ağlarını bağlar. Birleşik mod kapalıysa işlem yapmaz.
     */
    finish() {
      if (!this.mergeMode || this.finished) return this;
      const bones = [];
      const index = new Map();
      for (let i = 0; i < this.parts.length; i++) {
        const e = this.parts[i];
        if (!e.merged || index.has(e.node)) continue;
        index.set(e.node, bones.length);
        bones.push(e.node);
      }
      this.finished = true;
      if (bones.length === 0) { this.mergeMode = false; return this; }
      const rest = [];
      const inverses = [];
      for (let i = 0; i < bones.length; i++) {
        const m = new THREE.Matrix4();
        for (let p = bones[i]; p && p !== this.root; p = p.parent) {
          p.updateMatrix();
          m.premultiply(p.matrix);
        }
        rest.push(m);
        inverses.push(m.clone().invert());
      }
      this.bones = bones;
      this.boneIndex = index;
      this.boneRest = rest;
      this.boneInv = inverses.map((m) => m.elements);
      this.restSig = restSignature(rest.map((m) => m.elements));
      this.skeleton = new THREE.Skeleton(bones, inverses);
      // three her çizilen karede tüm kemiklerin dünya matrisini çarpıp dokuyu yeniden yüklerdi (yaratık başına ~2 KB/kare); burada yalnız
      // animasyon çalıştığında ve kök dünya matrisinden bağımsız hesaplanır (ayrık bağlama: ağın kendi dünya matrisi konumu zaten uygular)
      if (this.atlas) {
        this.cache = new Float32Array(bones.length * 16);
        this.skeleton.boneTexture = this.atlas.texture;
        this.skeleton.update = () => {}; // matrisleri atlas yazar (mobsModels.update sonunda, kare başına tek yükleme)
      } else {
        this.skeleton.update = () => this._updateBones();
      }
      this._applyMerged();
      return this;
    }

    /** Animasyon çalıştı: kemik matrisleri bir sonraki çizimde yeniden hesaplanır. */
    touch() {
      this.skeletonDirty = true;
    }

    _relOf(node) {
      if (node === this.root || !node) return this._ident;
      let i = this._relMemo.get(node);
      if (i !== undefined) return this._relPool[i];
      const parentRel = this._relOf(node.parent);
      i = this._relMemo.size;
      let m = this._relPool[i];
      if (!m) { m = new THREE.Matrix4(); this._relPool[i] = m; }
      node.updateMatrix(); // render dolaşmasına bağlı olmadan güncel yerel matris
      m.multiplyMatrices(parentRel, node.matrix);
      this._relMemo.set(node, i);
      return m;
    }

    /**
     * Kemik matrisi = (düğümün rig köküne göre güncel matrisi) × (dinlenme matrisinin tersi); ayrık bağlamada köşe = kemikMatrisi × köşe.
     * Atlas kipinde `cache`e, değilse iskeletin kendi dizisine yazılır. Dönüş: içerik yeniden hesaplandı mı.
     */
    refreshBones() {
      if (!this.skeletonDirty || !this.skeleton) return false;
      this.skeletonDirty = false;
      const sk = this.skeleton;
      const arr = this.atlas ? this.cache : sk.boneMatrices;
      const bones = this.bones;
      this._relMemo.clear();
      for (let i = 0; i < bones.length; i++) {
        this._m4.multiplyMatrices(this._relOf(bones[i]), sk.boneInverses[i]);
        this._m4.toArray(arr, i * 16);
      }
      return true;
    }

    _updateBones() {
      if (this.refreshBones() && this.skeleton.boneTexture) this.skeleton.boneTexture.needsUpdate = true;
    }

    _mergedCacheKey() {
      return this.key + ':' + this.variant + ':M:' + this.level + ':' + this.restSig;
    }

    /** Birleşik geometrileri (kademe başına bir kez) kurar: builder'ları taze MeshBuilder'larla çalıştırıp dinlenme matrisiyle toplar. */
    _bakeMerged() {
      const q = DETAIL_Q[this.level];
      const pieces = [];
      for (let i = 0; i < this.parts.length; i++) {
        const e = this.parts[i];
        if (!e.merged) continue;
        const bs = [new MeshBuilder({ q }), new MeshBuilder({ glow: true, q }), new MeshBuilder({ q })];
        e.build(bs[0], bs[1], bs[2], this);
        const bi = this.boneIndex.get(e.node);
        for (let k = 0; k < SLOTS; k++) {
          const b = bs[k];
          if (e.keep[k] || !b.vertexCount) continue;
          pieces.push({
            bone: bi, mat: e.mats[k], pos: b.pos, nor: b.nor, col: b.col, idx: b.idx, m: this.boneRest[bi].elements,
          });
        }
      }
      const groups = mergePieces(pieces);
      const geos = [];
      groups.forEach((g, name) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(g.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(g.nor, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(g.col, 3));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(g.skinIndex, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(g.skinWeight, 4));
        geo.setIndex(new THREE.BufferAttribute(g.idx, 1));
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        const b = boundsOf(g.pos);
        geo.userData = {
          mat: name, cull: cullSphere(b, 0.5), box: b, support: boneSupport(g.pos, g.skinIndex, this.boneInv),
        };
        geos.push(geo);
      });
      return geos;
    }

    _applyMerged() {
      const key = this._mergedCacheKey();
      if (key === this.mergedKey) return;
      const e = acquire(key, () => this._bakeMerged());
      if (this.mergedKey) release(this.mergedKey);
      this.mergedKey = key;
      const seen = new Set();
      for (let i = 0; i < e.geos.length; i++) {
        const geo = e.geos[i];
        const name = geo.userData.mat;
        let mesh = this.mergedMeshes.get(name);
        if (!mesh) {
          mesh = new THREE.SkinnedMesh(geo, this.mats[name]);
          mesh.name = 'skin:' + name;
          mesh.bindMode = THREE.DetachedBindMode;
          mesh.bind(this.skeleton, new THREE.Matrix4());
          mesh.boundingSphere = new THREE.Sphere();
          this.root.add(mesh);
          this.mergedMeshes.set(name, mesh);
        } else mesh.geometry = geo;
        const c = geo.userData.cull;
        mesh.boundingSphere.center.set(c.cx, c.cy, c.cz);
        mesh.boundingSphere.radius = c.r;
        mesh.visible = true;
        seen.add(name);
      }
      this.mergedMeshes.forEach((m, name) => { if (!seen.has(name)) m.visible = false; });
    }

    /** Birleşik modda dinlenme sınır kutusu birleşimi ({min:[3], max:[3]}; yoksa null). */
    mergedBox() {
      if (!this.mergeMode || !this.mergedKey) return null;
      const e = cache.get(this.mergedKey);
      if (!e) return null;
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < e.geos.length; i++) {
        const b = e.geos[i].userData.box;
        for (let k = 0; k < 3; k++) {
          if (b.min[k] < min[k]) min[k] = b.min[k];
          if (b.max[k] > max[k]) max[k] = b.max[k];
        }
      }
      return min[0] === Infinity ? null : { min, max };
    }

    /**
     * Kameraya dönük yumuşak ışıma (toplamalı sprite). Malzeme glowMats'a girer: userData.k ile ölçeklenir,
     * ölümde solar. Dönen: Sprite (scale = boyut).
     */
    glowSprite(parent, color, size, opacity = 0.5, name = 'halo') {
      const m = new THREE.SpriteMaterial({
        map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
      });
      m.userData.baseTransparent = true;
      m.userData.baseOpacity = opacity;
      m.userData.k = 1;
      m.userData.name = name;
      m.userData.baseColor = new THREE.Color(color);
      this.glowMats.push(m);
      const sp = new THREE.Sprite(m);
      sp.scale.setScalar(size);
      sp.name = name;
      (parent || this.root).add(sp);
      this.sprites.push(sp);
      return sp;
    }

    /** Dinamik tüp ekler (rig yaşam süresince kendi geometrisi). */
    tendril(parent, o) {
      const t = new Tendril({
        radial: this.level === 0 ? 4 : this.level === 1 ? 5 : 7,
        ...o,
        material: this.mats[o.mat || 'lit'],
      });
      (parent || this.root).add(t.mesh);
      this.dyn.push(t);
      return t;
    }

    stats() {
      let meshes = 0;
      let triangles = 0;
      for (let i = 0; i < this.parts.length; i++) {
        const e = this.parts[i];
        const c = e.key ? cache.get(e.key) : null;
        for (let k = 0; k < 3; k++) if (e.meshes[k]) meshes++;
        if (c) triangles += c.tris;
      }
      if (this.mergedKey) {
        const mc = cache.get(this.mergedKey);
        if (mc) triangles += mc.tris;
        this.mergedMeshes.forEach((m) => { if (m.visible) meshes++; });
      }
      for (let i = 0; i < this.dyn.length; i++) { meshes++; triangles += this.dyn[i].triangles; }
      return { meshes, triangles };
    }

    dispose() {
      if (this.mergedKey) release(this.mergedKey);
      this.mergedKey = null;
      this.mergedMeshes.forEach((m) => { if (m.parent) m.parent.remove(m); });
      this.mergedMeshes.clear();
      if (this.skeleton) {
        if (this.atlas) this.skeleton.boneTexture = null; // ortak doku iskeletle birlikte atılmasın
        this.skeleton.dispose();
        this.skeleton = null;
      }
      for (let i = 0; i < this.parts.length; i++) {
        const e = this.parts[i];
        if (e.key) release(e.key);
        e.key = null;
      }
      this.parts.length = 0;
      for (let i = 0; i < this.dyn.length; i++) this.dyn[i].dispose();
      this.dyn.length = 0;
      for (let i = 0; i < this.glowMats.length; i++) this.glowMats[i].dispose();
      const all = Object.keys(this.mats);
      for (let i = 0; i < all.length; i++) this.mats[all[i]].dispose();
    }
  }

  return {
    Rig,
    glowTexture,
    ik2,
    cacheSize: () => cache.size,
    cacheRefs: () => { let r = 0; cache.forEach((e) => { r += e.refs; }); return r; },
    acquire,
    release,
  };
}
