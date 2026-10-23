import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  RIGID_SKIN, SLOTS, SUPPORT_DIRS, boneSupport, boundsOf, cullSphere, lodLevelFor, mergePieces, mobDrawEstimate, normalizeKeep,
  patchRigidSkinShader, restSignature,
} from './mobMerge.js';
import { createMobModel, MOB_TYPES } from './mobModels.js';
import { createBoneAtlas } from './mobBones.js';
import { getKit } from './mobGeo.js';
import { MOB_KEYS } from '../sim/mobTypes.js';

const I16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const tri = (extra) => Object.assign({
  bone: 0, mat: 'lit', pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nor: [0, 0, 1, 0, 0, 1, 0, 0, 1], col: [1, 0, 0, 0, 1, 0, 0, 0, 1], idx: [0, 1, 2], m: I16,
}, extra || {});

describe('mergePieces (saf birleştirme matematiği)', () => {
  it('malzeme başına gruplar, tepe ofsetli dizinler, kemik indeksi ağırlık 1', () => {
    const out = mergePieces([tri({ bone: 0 }), tri({ bone: 2 }), tri({ bone: 1, mat: 'glow' })]);
    expect([...out.keys()]).toEqual(['lit', 'glow']);
    const lit = out.get('lit');
    expect(lit.vertexCount).toBe(6);
    expect(lit.triangleCount).toBe(2);
    expect([...lit.idx]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...lit.skinIndex].filter((_, i) => i % 4 === 0)).toEqual([0, 0, 0, 2, 2, 2]);
    expect([...lit.skinWeight].filter((_, i) => i % 4 === 0).every((w) => w === 1)).toBe(true);
    expect(out.get('glow').vertexCount).toBe(3);
  });

  it('dinlenme matrisi konumu ve normali dönüştürür (öteleme + döndürme + eşitsiz ölçek)', () => {
    // 90° Y dönüşü + (1,2,3) ötelemesi, x'te 2 kat ölçek: m = T·R·S
    const m = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(2, 1, 1));
    const out = mergePieces([tri({ m: Array.from(m.elements) })]).get('lit');
    const v = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      v.set(tri().pos[i * 3], tri().pos[i * 3 + 1], tri().pos[i * 3 + 2]).applyMatrix4(m);
      expect(out.pos[i * 3]).toBeCloseTo(v.x, 5);
      expect(out.pos[i * 3 + 1]).toBeCloseTo(v.y, 5);
      expect(out.pos[i * 3 + 2]).toBeCloseTo(v.z, 5);
    }
    // normal: ters-devrik matris (three normalMatrix ile aynı), birim uzunluk
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const n = new THREE.Vector3(0, 0, 1).applyMatrix3(nm).normalize();
    expect(out.nor[0]).toBeCloseTo(n.x, 5);
    expect(out.nor[1]).toBeCloseTo(n.y, 5);
    expect(out.nor[2]).toBeCloseTo(n.z, 5);
    expect(Math.hypot(out.nor[0], out.nor[1], out.nor[2])).toBeCloseTo(1, 5);
  });

  it('boş parça atlanır; 65535 tepeyi aşan grup Uint32 dizin kullanır', () => {
    expect(mergePieces([tri({ pos: [], nor: [], col: [], idx: [] })]).size).toBe(0);
    const n = 70000;
    const big = { bone: 0, mat: 'lit', pos: new Array(n * 3).fill(0), nor: new Array(n * 3).fill(0), col: new Array(n * 3).fill(0), idx: [0, 1, n - 1], m: I16 };
    const g = mergePieces([big]).get('lit');
    expect(g.idx).toBeInstanceOf(Uint32Array);
    expect(g.vertexCount).toBe(n);
  });
});

describe('küçük saf yardımcılar', () => {
  it('restSignature: aynı matris aynı imza, farklı poz farklı imza; 1/4096 altı gürültü yok sayılır', () => {
    const a = [I16.slice(), I16.slice()];
    const b = [I16.slice(), I16.slice()];
    expect(restSignature(a)).toBe(restSignature(b));
    b[1][13] = 0.5;
    expect(restSignature(a)).not.toBe(restSignature(b));
    const c = [I16.slice(), I16.slice()];
    c[1][12] = 1e-6;
    expect(restSignature(a)).toBe(restSignature(c));
  });

  it('normalizeKeep: true / dizi / yok', () => {
    expect(normalizeKeep(undefined)).toEqual([false, false, false]);
    expect(normalizeKeep(true)).toEqual([true, true, true]);
    expect(normalizeKeep([1])).toEqual([false, true, false]);
    expect(normalizeKeep([7, -1, 2])).toEqual([false, false, true]);
  });

  it('boundsOf + cullSphere: küre tüm tepeleri kapsar, payla şişer', () => {
    const b = boundsOf([0, 0, 0, 2, 4, 6]);
    expect(b.min).toEqual([0, 0, 0]);
    expect(b.max).toEqual([2, 4, 6]);
    expect(b.cx).toBe(1);
    expect(b.r).toBeCloseTo(Math.hypot(1, 2, 3), 6);
    const s = cullSphere(b, 0.5);
    expect(s.r).toBeGreaterThan(b.r * 1.5);
    expect(boundsOf([]).r).toBe(0);
  });

  it('lodLevelFor: eşikler ve histerezis', () => {
    expect(lodLevelFor(5, 2, 2, 36, 20)).toBe(2);
    expect(lodLevelFor(25, 2, 2, 36, 20)).toBe(1);
    expect(lodLevelFor(50, 2, 1, 36, 20)).toBe(0);
    // histerezis: kademe 1'den 2'ye dönmek için mid-3'ün altına inmek gerekir
    expect(lodLevelFor(18, 2, 1, 36, 20)).toBe(1);
    expect(lodLevelFor(16, 2, 1, 36, 20)).toBe(2);
    // kademe 0'dan çıkmak için far-4'ün altına inmek gerekir
    expect(lodLevelFor(34, 2, 0, 36, 20)).toBe(0);
    expect(lodLevelFor(30, 2, 0, 36, 20)).toBe(1);
    // kalite tavanı 1 ise kademe 2'ye çıkmaz
    expect(lodLevelFor(1, 1, 1, 36, 20)).toBe(1);
  });

  it('mobDrawEstimate: birleşik mod malzeme sayısına iner, keep yuvaları ayrı sayılır', () => {
    const parts = [];
    for (let i = 0; i < 12; i++) parts.push({ mats: ['lit', 'glow', 'lit'], has: [true, i % 3 === 0, false], keep: [false, false, false] });
    expect(mobDrawEstimate(parts, false)).toBe(12 + 4);
    expect(mobDrawEstimate(parts, true)).toBe(2);
    parts.push({ mats: ['lit', 'glow', 'lit'], has: [true, true, false], keep: [false, true, false] });
    expect(mobDrawEstimate(parts, true, 1)).toBe(1 + 1 + 2);
    expect(SLOTS).toBe(3);
  });

  it('boneSupport: kemik-yerel uç noktalar (26 yön), kutu köşeleri yakalanır', () => {
    // iki kemik: kemik 1 dinlenme matrisi (0,5,0) ötelemesi; tepeler dünyada y=5..6, yerelde y=0..1
    const rest1 = I16.slice(); rest1[13] = 5;
    const inv1 = I16.slice(); inv1[13] = -5;
    const pos = [0, 0, 0, 1, 0, 0, 0, 5, 0, 0.5, 6, 0.25];
    const skin = new Uint16Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    const sp = boneSupport(pos, skin, [I16, inv1]);
    expect(SUPPORT_DIRS.length).toBe(26);
    expect(sp.bones.length).toBeGreaterThan(0);
    let maxY1 = -Infinity;
    for (let i = 0; i < sp.bones.length; i++) if (sp.bones[i] === 1) maxY1 = Math.max(maxY1, sp.pts[i * 3 + 1]);
    expect(maxY1).toBeCloseTo(1, 5);
    expect(rest1[13]).toBe(5);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Eşdeğerlik: birleşik deri ile ayrı ağlar AYNI pozda aynı dünya-uzayı tepe kümesini üretmeli.
 * ---------------------------------------------------------------------------------------------- */
function worldStats(model, atlas) {
  const root = model.root;
  root.updateMatrixWorld(true); // (updateWorldMatrix SkinnedMesh.bindMatrixInverse'i yenilemez; render yolu updateMatrixWorld kullanır)
  const per = {};
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (let p = o.parent; p; p = p.parent) if (p.visible === false) return;
    const name = o.material.userData.name;
    const st = per[name] || (per[name] = {
      n: 0, sx: 0, sy: 0, sz: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity],
    });
    const pos = o.geometry.attributes.position;
    let bm = null;
    let src = null;
    let off = 0;
    if (o.isSkinnedMesh) {
      // GPU deri hesabının CPU taklidi (ayrık bağlama): köşe = ağ dünya matrisi × kemikMatrisi[kemik] × köşe (bindMatrix = birim)
      expect(o.bindMode).toBe('detached');
      if (atlas) {
        // ortak kemik atlası: dilim tabanı uBoneBase (shader'daki skinIndex.x + uBoneBase)
        expect(model.rig.atlas).toBe(atlas);
        src = atlas.texture.image.data;
        off = model.rig.uBase.value;
      } else {
        o.skeleton.update();
        src = o.skeleton.boneMatrices;
      }
      bm = new THREE.Matrix4();
    }
    for (let i = 0; i < pos.count; i++) {
      if (bm) {
        bm.fromArray(src, (off + o.geometry.attributes.skinIndex.getX(i)) * 16);
        v.fromBufferAttribute(pos, i).applyMatrix4(bm);
      } else o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      st.n++; st.sx += v.x; st.sy += v.y; st.sz += v.z;
      st.min[0] = Math.min(st.min[0], v.x); st.max[0] = Math.max(st.max[0], v.x);
      st.min[1] = Math.min(st.min[1], v.y); st.max[1] = Math.max(st.max[1], v.y);
      st.min[2] = Math.min(st.min[2], v.z); st.max[2] = Math.max(st.max[2], v.z);
    }
  });
  return per;
}

const NON_BOSS = MOB_KEYS.filter((k) => !MOB_TYPES[k].boss);

describe('birleşik deri ≡ ayrı ağlar (dünya-uzayı tepe kümesi)', () => {
  for (const key of NON_BOSS) {
    it(key + ': yürüme + saldırı + vuruş sonrası malzeme başına merkez/kutu aynı (3 kademe)', () => {
      for (const q of ['low', 'medium', 'high']) {
        const a = createMobModel(THREE, key, { quality: q, seed: 11, merge: false });
        const b = createMobModel(THREE, key, { quality: q, seed: 11, merge: true });
        expect(b.rig.mergeMode).toBe(true);
        for (let i = 0; i < 45; i++) {
          const st = { speed: i < 25 ? 2.2 : 0, attacking: i >= 25 && i < 40, hurt: i === 30 };
          a.update(1 / 60, st);
          b.update(1 / 60, st);
        }
        const sa = worldStats(a);
        const sb = worldStats(b);
        expect(Object.keys(sb).sort()).toEqual(Object.keys(sa).sort());
        for (const name of Object.keys(sa)) {
          expect(sb[name].n).toBe(sa[name].n);
          for (const k of ['sx', 'sy', 'sz']) expect(Math.abs(sb[name][k] - sa[name][k]) / Math.max(1, sa[name].n)).toBeLessThan(2e-3);
          for (let d = 0; d < 3; d++) {
            expect(sb[name].min[d]).toBeCloseTo(sa[name].min[d], 2);
            expect(sb[name].max[d]).toBeCloseTo(sa[name].max[d], 2);
          }
        }
        a.dispose();
        b.dispose();
      }
    });
  }

  it('LOD değişimi (0↔2) birleşik geometriyi değiştirir ve geri döner; çağrı sayısı küçük kalır', () => {
    for (const key of ['golge', 'kumakrebi', 'koyun']) {
      const m = createMobModel(THREE, key, { quality: 'high', seed: 5 });
      const calls = () => {
        let n = 0;
        m.root.traverse((o) => { if ((o.isMesh || o.isSprite) && o.visible) n++; });
        return n;
      };
      const t2 = m.stats().triangles;
      const c2 = calls();
      m.setDetail(0);
      const t0 = m.stats().triangles;
      expect(t0).toBeLessThan(t2);
      expect(calls()).toBeLessThanOrEqual(c2 + 1);
      m.setDetail(2);
      expect(m.stats().triangles).toBe(t2);
      expect(c2).toBeLessThanOrEqual(7); // eskiden 7–31
      m.dispose();
    }
  });

  it('iki örnek aynı birleşik geometriyi paylaşır; tümü atılınca önbellek boşalır', () => {
    const kit = getKit(THREE);
    const base = kit.cacheSize();
    const a = createMobModel(THREE, 'kemikci', { quality: 'medium', seed: 1 });
    const mid = kit.cacheSize();
    const b = createMobModel(THREE, 'kemikci', { quality: 'medium', seed: 2 });
    expect(kit.cacheSize()).toBe(mid);
    a.dispose();
    b.dispose();
    expect(kit.cacheSize()).toBe(base);
  });

  it('boss modelleri birleşmez (tam ayrıntı, ayrı ağlar)', () => {
    const m = createMobModel(THREE, 'kokana', { quality: 'low', seed: 1 });
    expect(m.rig.mergeMode).toBe(false);
    expect(m.stats().meshes).toBeGreaterThan(15);
    m.dispose();
  });

  it('keep: göz kırpan kedi başı ışıma ağı ayrı kalır, ok düğümü görünürlükle sürülür', () => {
    const c = createMobModel(THREE, 'ormankedisi', { quality: 'medium', seed: 2 });
    const head = c.rig.n.head;
    expect(head.children.some((o) => o.name.endsWith(':glow'))).toBe(true);
    c.dispose();
    const k = createMobModel(THREE, 'kemikci', { quality: 'medium', seed: 2 });
    expect(k.rig.n.arrow.children.some((o) => o.isMesh)).toBe(true);
    k.dispose();
  });

  it('kemik matrisleri yalnız animasyon çalışınca yeniden hesaplanır (touch) ve kök dünya matrisinden bağımsızdır', () => {
    const m = createMobModel(THREE, 'kemikci', { quality: 'medium', seed: 8 });
    m.update(1 / 60, { speed: 2 });
    m.root.updateMatrixWorld(true);
    const sk = m.rig.skeleton;
    sk.update();
    const first = sk.boneMatrices.slice(0, sk.bones.length * 16);
    // dünyada ilerlet/döndür: kemik matrisleri değişmez (dünya konumunu ağın kendi matrisi uygular)
    m.root.position.set(40, 7, -12);
    m.root.rotation.y = 1.1;
    m.root.updateMatrixWorld(true);
    m.rig.touch();
    sk.update();
    for (let i = 0; i < first.length; i++) expect(sk.boneMatrices[i]).toBeCloseTo(first[i], 6);
    // kirli değilse hesaplanmaz: dizi elle bozulursa update() dokunmaz
    sk.boneMatrices[0] = 123;
    sk.update();
    expect(sk.boneMatrices[0]).toBe(123);
    // animasyon (update) çalışınca yeniden hesaplanır
    m.update(1 / 60, { speed: 2, attacking: true });
    m.root.updateMatrixWorld(true);
    sk.update();
    expect(sk.boneMatrices[0]).not.toBe(123);
    m.dispose();
  });

  it('ölüm çözülmesi ve vuruş parlaması malzemeyi sürer (birleşik ağlar aynı malzemeyi paylaşır)', () => {
    const m = createMobModel(THREE, 'golge', { quality: 'medium', seed: 4 });
    const skinned = [];
    m.root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
    expect(skinned.length).toBeGreaterThan(0);
    for (const s of skinned) expect(m.rig.litMats.concat(m.rig.glowMats)).toContain(s.material);
    m.deathDissolve(0.6);
    expect(m.rig.mats.lit.transparent).toBe(true);
    expect(m.root.visible).toBe(true);
    m.deathDissolve(1);
    expect(m.root.visible).toBe(false);
    m.dispose();
  });
});

describe('hafif deri gölgelendiricisi (tek kemik, ağırlık 1)', () => {
  it('three gölgelendiricilerindeki üç deri parçasını değiştirir; yineleme/eksik parça güvenli', () => {
    for (const lib of ['standard', 'basic', 'lambert']) {
      const sh = { vertexShader: THREE.ShaderLib[lib].vertexShader };
      patchRigidSkinShader(sh);
      expect(sh.vertexShader).toContain('rigidSkin');
      expect(sh.vertexShader).not.toContain('#include <skinbase_vertex>');
      expect(sh.vertexShader).not.toContain('#include <skinning_vertex>');
      expect(sh.vertexShader).not.toContain('#include <skinnormal_vertex>');
      const once = sh.vertexShader;
      patchRigidSkinShader(sh); // ikinci kez: değişmez
      expect(sh.vertexShader).toBe(once);
    }
    const bare = { vertexShader: 'void main() {}' };
    patchRigidSkinShader(bare);
    expect(bare.vertexShader).toBe('void main() {}');
    expect(() => patchRigidSkinShader(null)).not.toThrow();
    expect(() => patchRigidSkinShader({})).not.toThrow();
    // yalnız ilk kemik okunur (varsayılan 4 kemik/16 doku okuması yerine)
    expect(RIGID_SKIN.base).toContain('skinIndex.x');
    expect(RIGID_SKIN.base).not.toContain('skinIndex.y');
    expect(RIGID_SKIN.vertex).not.toContain('skinWeight');
  });

  it('birleşik modeller bu gölgelendiriciyi kullanır (ayrı önbellek anahtarı); birleşmeyenler (boss, merge:false) varsayılanda kalır', () => {
    const m = createMobModel(THREE, 'golge', { quality: 'medium', seed: 3 });
    expect(typeof m.rig.mats.lit.onBeforeCompile).toBe('function');
    expect(m.rig.mats.lit.customProgramCacheKey()).toBe('kesif-rigid-skin');
    expect(m.rig.mats.glow.customProgramCacheKey()).toBe('kesif-rigid-skin');
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader };
    m.rig.mats.lit.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('rigidSkin');
    m.dispose();
    const u = createMobModel(THREE, 'golge', { quality: 'medium', seed: 3, merge: false });
    expect(u.rig.mats.lit.customProgramCacheKey()).not.toBe('kesif-rigid-skin');
    u.dispose();
    const b = createMobModel(THREE, 'kokana', { quality: 'low', seed: 3 });
    expect(b.rig.mats.lit.customProgramCacheKey()).not.toBe('kesif-rigid-skin');
    b.dispose();
  });
});

describe('ortak kemik atlası', () => {
  function frame(models, atlas) {
    atlas.begin();
    const bases = models.map((m) => atlas.add(m.rig));
    atlas.end();
    return bases;
  }

  it('atlas yolu da ayrı ağlarla aynı dünya-uzayı tepe kümesini verir (her tür, düşük ve yüksek kademe)', () => {
    for (const key of NON_BOSS) {
      for (const q of ['low', 'high']) {
        const atlas = createBoneAtlas(THREE);
        const a = createMobModel(THREE, key, { quality: q, seed: 21, merge: false });
        const b = createMobModel(THREE, key, { quality: q, seed: 21, merge: true, boneAtlas: atlas });
        for (let i = 0; i < 40; i++) {
          const st = { speed: i < 20 ? 2 : 0, attacking: i >= 20 && i < 34, hurt: i === 25 };
          a.update(1 / 60, st);
          b.update(1 / 60, st);
        }
        expect(frame([b], atlas)).toEqual([0]);
        const sa = worldStats(a);
        const sb = worldStats(b, atlas);
        expect(Object.keys(sb).sort()).toEqual(Object.keys(sa).sort());
        for (const name of Object.keys(sa)) {
          expect(sb[name].n).toBe(sa[name].n);
          for (let d = 0; d < 3; d++) {
            expect(sb[name].min[d]).toBeCloseTo(sa[name].min[d], 2);
            expect(sb[name].max[d]).toBeCloseTo(sa[name].max[d], 2);
          }
        }
        a.dispose();
        b.dispose();
        atlas.dispose();
      }
    }
  });

  it('ardışık dilimler, atlas yerleşimi ve gereksiz yüklemeyi önleme (sürüm yalnız değişince artar)', () => {
    const atlas = createBoneAtlas(THREE);
    const m1 = createMobModel(THREE, 'kemikci', { quality: 'medium', seed: 1, boneAtlas: atlas });
    const m2 = createMobModel(THREE, 'koyun', { quality: 'medium', seed: 2, boneAtlas: atlas });
    const n1 = m1.rig.bones.length;
    const n2 = m2.rig.bones.length;
    m1.update(1 / 60, { speed: 1 });
    m2.update(1 / 60, { speed: 1 });
    expect(frame([m1, m2], atlas)).toEqual([0, n1]);
    expect(atlas.used).toBe(n1 + n2);
    expect(m1.rig.uBase.value).toBe(0);
    expect(m2.rig.uBase.value).toBe(n1);
    // içerik, rig önbelleğinin birebir kopyası
    const data = atlas.texture.image.data;
    for (let i = 0; i < n1 * 16; i++) expect(data[i]).toBe(m1.rig.cache[i]);
    for (let i = 0; i < n2 * 16; i++) expect(data[n1 * 16 + i]).toBe(m2.rig.cache[i]);
    // değişiklik yok → doku yeniden yüklenmez
    const v0 = atlas.texture.version;
    frame([m1, m2], atlas);
    expect(atlas.texture.version).toBe(v0);
    // yalnız m2 animasyon çalıştırdı → yüklenir
    m2.update(1 / 60, { speed: 1, attacking: true });
    frame([m1, m2], atlas);
    expect(atlas.texture.version).toBeGreaterThan(v0);
    // yerleşim değişti (m1 gizlendi) → m2 tabana kayar ve içerik yeniden yazılır
    frame([m2], atlas);
    expect(m2.rig.uBase.value).toBe(0);
    for (let i = 0; i < n2 * 16; i++) expect(data[i]).toBe(m2.rig.cache[i]);
    atlas.dispose();
    m1.dispose();
    m2.dispose();
  });

  it('başka yaratığın ezdiği dilim, aynı tabana dönen yaratık için yeniden yazılır (bayat veri yok)', () => {
    const atlas = createBoneAtlas(THREE);
    const a = createMobModel(THREE, 'kumakrebi', { quality: 'low', seed: 3, boneAtlas: atlas });
    const p = createMobModel(THREE, 'kumakrebi', { quality: 'low', seed: 4, boneAtlas: atlas });
    const z = createMobModel(THREE, 'golge', { quality: 'low', seed: 5, boneAtlas: atlas });
    [a, p, z].forEach((m) => m.update(1 / 60, { speed: 1.5 }));
    // kare 1: [p, a]  → a, p'nin arkasında
    frame([p, a], atlas);
    expect(a.rig.uBase.value).toBe(p.rig.bones.length);
    // kare 2: yalnız z (kemik sayısı farklı): p'nin dilimini ve a'nın başını ezer; a yok
    frame([z], atlas);
    // kare 3: [p, a] yine; a eski tabanına döner ama başı ezilmişti → içerik doğru olmalı
    frame([p, a], atlas);
    const data = atlas.texture.image.data;
    const n = a.rig.bones.length;
    for (let i = 0; i < n * 16; i++) expect(data[a.rig.uBase.value * 16 + i]).toBe(a.rig.cache[i]);
    for (let i = 0; i < p.rig.bones.length * 16; i++) expect(data[p.rig.uBase.value * 16 + i]).toBe(p.rig.cache[i]);
    atlas.dispose();
    [a, p, z].forEach((m) => m.dispose());
  });

  it('kapasite dolunca add -1 döner (çağıran yaratığı gizler); iskelet atılınca ortak doku atılmaz', () => {
    const atlas = createBoneAtlas(THREE, { rows: 1 }); // 64 matris
    const ms = [];
    for (let i = 0; i < 4; i++) ms.push(createMobModel(THREE, 'kumakrebi', { quality: 'low', seed: i, boneAtlas: atlas }));
    atlas.begin();
    const res = ms.map((m) => atlas.add(m.rig));
    atlas.end();
    expect(res.some((r) => r < 0)).toBe(true);
    expect(res[0]).toBe(0);
    ms.forEach((m) => m.dispose());
    expect(atlas.texture.image.data.length).toBeGreaterThan(0);
    atlas.dispose();
  });

  it('atlas malzemeleri: ayrı önbellek anahtarı + uBoneBase uniform + skinIndex.x + uBoneBase', () => {
    const atlas = createBoneAtlas(THREE);
    const m = createMobModel(THREE, 'golge', { quality: 'medium', seed: 3, boneAtlas: atlas });
    expect(m.rig.mats.lit.customProgramCacheKey()).toBe('kesif-rigid-skin-atlas');
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, uniforms: {} };
    m.rig.mats.lit.onBeforeCompile(sh);
    expect(sh.uniforms.uBoneBase).toBe(m.rig.uBase);
    expect(sh.vertexShader).toContain('uniform float uBoneBase;');
    expect(sh.vertexShader).toContain('skinIndex.x + uBoneBase');
    // atlas verilmeyen modelde uniform yok
    const n = createMobModel(THREE, 'golge', { quality: 'medium', seed: 3 });
    const sh2 = { vertexShader: THREE.ShaderLib.standard.vertexShader, uniforms: {} };
    n.rig.mats.lit.onBeforeCompile(sh2);
    expect(sh2.uniforms.uBoneBase).toBeUndefined();
    expect(sh2.vertexShader).not.toContain('uBoneBase');
    m.dispose();
    n.dispose();
    atlas.dispose();
  });
});
