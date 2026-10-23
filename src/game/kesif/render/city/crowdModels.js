/*
 * KEŞİF render/city — KALABALIK ÇİZİCİSİ (Neon Meridyen Faz 4, paket crowd_ai). Sözleşme §10, §17.
 * Yontulmuş düşük-poli gelecek-şehir vatandaşları, KEMİKSİZ örnekli animasyon (köşe gölgelendiricide yürüyüş döngüsü + jestler), tek geometride tüm giysi/saç/şapka/aksesuar varyantları,
 * örnek başına renk çeşitliliği (üst, alt, aksan neon, saç, ten), ıslak/neon aydınlatma (araç ve prop ile aynı paylaşılan uniform'lar), 3 kademe:
 *   yakın (LOD0, tam animasyon) · orta (LOD1, ucuz animasyon, sadeleşmiş varyantlar) · uzak (kameraya dönük SDF afişler).
 * Çizim çağrıları: yakın 1 + orta 1 + uzak 1 + şemsiye 1 + gölge 1 = 5 (sözleşme: ≤ 12).
 *
 *   createCrowdRenderer({THREE?, uniforms?, quality?, reducedMotion?}) → cr
 *   cr.group                         sahneye eklenen kök (frustumCulled kapalı örnekli ağlar)
 *   cr.beginFrame(camera, dt, env)   env: {night, rain, wet, shelter, reduced}
 *   cr.add(d) → bool                 d: {look, x, y, z, yaw, speed, phase, gesture, tier, fade, umb, lookYaw, sky, blk, id}
 *   cr.endFrame()                    örnek tamponlarını kesinler, istatistik yazar
 *   cr.setQuality('low'|'medium'|'high') · cr.setReducedMotion(b) · cr.warm(renderer, scene, camera, opts) → ms · cr.getStats() · cr.dispose()
 *   cr.stats {near, mid, far, umbrellas, shadows, draws, tris, dropped}     RENDER_CAPS[kalite]
 */
import * as THREE_NS from 'three';
import {
  GROUP, buildCitizen, buildUmbrella, lodValue,
} from './crowdGeo.js';
import {
  BILLBOARD_FRAGMENT, BILLBOARD_VERTEX, CITIZEN_FRAGMENT, CITIZEN_VERTEX, SHADOW_FRAGMENT, SHADOW_VERTEX, UMBRELLA_FRAGMENT, UMBRELLA_VERTEX,
} from './crowdShaders.js';
import { sharedUniformsFor } from './vehicleRig.js';

export const RENDER_CAPS = Object.freeze({
  high: Object.freeze({ near: 22, mid: 24, total: 60 }),
  medium: Object.freeze({ near: 14, mid: 18, total: 40 }),
  low: Object.freeze({ near: 7, mid: 12, total: 24 }),
});
const CAP_NEAR = 26;
const CAP_MID = 30;
const CAP_FAR = 80;
const CAP_UMB = 72;
const CAP_SHADOW = 80;

const LIN = new Map();
function linRgb(hex) {
  let v = LIN.get(hex);
  if (!v) {
    const f = (c) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    v = [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
    LIN.set(hex, v);
  }
  return v;
}

/** Alt giysi stili (0 pantolon, 1 şort, 2 etek): görünümden belirlenimci. */
export function lowStyleOf(look) {
  const h = ((look.cTop >> 3) ^ (look.cBot >> 5) ^ (look.skin * 7) ^ (look.type * 13) ^ (look.hair * 3)) & 0xffff;
  const m = h % 9;
  if (look.type === 3 || look.type === 4 || look.type === 5) return m === 7 ? 1 : 0;
  return m < 6 ? 0 : m === 6 ? 1 : 2;
}

function mark(attr, count) {
  if (attr.clearUpdateRanges) attr.clearUpdateRanges();
  if (attr.addUpdateRange) attr.addUpdateRange(0, count * attr.itemSize);
  attr.needsUpdate = true;
}

export function createCrowdRenderer(o) {
  const opt = o || {};
  const THREE = opt.THREE || THREE_NS;
  const group = new THREE.Group();
  group.name = 'kesif-kalabalik';
  const shared = sharedUniformsFor(THREE, opt.uniforms);
  const own = {
    uCTime: { value: 0 },
    uMotion: { value: opt.reducedMotion ? 0.55 : 1 },
  };
  const uniforms = Object.assign({}, shared, own);
  let tierKey = RENDER_CAPS[opt.quality] ? opt.quality : 'high';
  let reduced = !!opt.reducedMotion;
  let disposed = false;

  const instAttr = (n, size) => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };

  /* ---------------------------------------------------------------------------------------- vatandaş */
  const citizenLayer = (lod, cap) => {
    const m = buildCitizen(lod);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
    geo.setAttribute('aMat', new THREE.BufferAttribute(m.aMat, 4));
    geo.setAttribute('aPivot', new THREE.BufferAttribute(m.aPivot, 3));
    geo.setIndex(new THREE.BufferAttribute(m.index, 1));
    const names = ['aPos', 'aAnim', 'aShape', 'aLook', 'aStyle', 'aCol0', 'aCol1', 'aCol2', 'aCol3', 'aLight'];
    const attrs = {};
    names.forEach((nm) => {
      attrs[nm] = instAttr(cap, 4);
      geo.setAttribute(nm, attrs[nm]);
    });
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1e5);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -10, -1e5), new THREE.Vector3(1e5, 400, 1e5));
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CITIZEN_VERTEX,
      fragmentShader: CITIZEN_FRAGMENT,
      side: THREE.FrontSide,
    });
    mat.name = 'kesif-yaya-' + (lod === 0 ? 'yakin' : 'orta');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'yaya-' + (lod === 0 ? 'yakin' : 'orta');
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return {
      lod, cap, geo, mat, mesh, attrs, n: 0, tris: m.tris, verts: m.verts, names,
    };
  };
  const near = citizenLayer(0, CAP_NEAR);
  const mid = citizenLayer(1, CAP_MID);

  /* ---------------------------------------------------------------------------------------- afiş */
  const quad = (names, cap, vs, fs, name, mo) => {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));
    const attrs = {};
    names.forEach((nm) => {
      attrs[nm] = instAttr(cap, 4);
      geo.setAttribute(nm, attrs[nm]);
    });
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial(Object.assign({
      uniforms, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide,
    }, mo || null));
    mat.name = name;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.visible = false;
    group.add(mesh);
    return {
      geo, mat, mesh, attrs, n: 0, cap, tris: 2, names,
    };
  };
  const far = quad(['aPos', 'aAnim', 'aShape', 'aLook', 'aStyle', 'aCol0', 'aCol1', 'aCol2', 'aCol3', 'aLight'], CAP_FAR, BILLBOARD_VERTEX, BILLBOARD_FRAGMENT, 'yaya-uzak');
  const shadow = quad(['aPos', 'aCol0'], CAP_SHADOW, SHADOW_VERTEX, SHADOW_FRAGMENT, 'yaya-golge', {
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  shadow.mesh.renderOrder = 3;

  /* ---------------------------------------------------------------------------------------- şemsiye */
  const um = buildUmbrella();
  const umGeo = new THREE.InstancedBufferGeometry();
  umGeo.setAttribute('position', new THREE.BufferAttribute(um.position, 3));
  umGeo.setAttribute('normal', new THREE.BufferAttribute(um.normal, 3));
  umGeo.setAttribute('aMat', new THREE.BufferAttribute(um.aMat, 4));
  umGeo.setIndex(new THREE.BufferAttribute(um.index, 1));
  const umAttrs = {};
  ['aPos', 'aUmb', 'aCol0', 'aLight'].forEach((nm) => {
    umAttrs[nm] = instAttr(CAP_UMB, 4);
    umGeo.setAttribute(nm, umAttrs[nm]);
  });
  umGeo.instanceCount = 0;
  const umMat = new THREE.ShaderMaterial({
    uniforms, vertexShader: UMBRELLA_VERTEX, fragmentShader: UMBRELLA_FRAGMENT, side: THREE.DoubleSide,
  });
  umMat.name = 'kesif-yaya-semsiye';
  const umMesh = new THREE.Mesh(umGeo, umMat);
  umMesh.name = 'yaya-semsiye';
  umMesh.frustumCulled = false;
  umMesh.visible = false;
  group.add(umMesh);
  const umb = {
    geo: umGeo, mat: umMat, mesh: umMesh, attrs: umAttrs, n: 0, cap: CAP_UMB, tris: um.tris,
  };

  const stats = {
    near: 0, mid: 0, far: 0, umbrellas: 0, shadows: 0, draws: 0, tris: 0, dropped: 0, tier: tierKey, warmMs: 0,
  };
  let dropped = 0;

  /* ---------------------------------------------------------------------------------------- yazma */
  function writeCitizen(L, d, lodFlag) {
    const i = L.n++;
    const a = L.attrs;
    const look = d.look;
    let g = d.gesture | 0;
    if (g === 0 && look.acc === 4) g = 9;
    const walk = d.speed;
    a.aPos.array[i * 4] = d.x; a.aPos.array[i * 4 + 1] = d.y; a.aPos.array[i * 4 + 2] = d.z; a.aPos.array[i * 4 + 3] = d.yaw;
    a.aAnim.array[i * 4] = d.phase; a.aAnim.array[i * 4 + 1] = walk; a.aAnim.array[i * 4 + 2] = g; a.aAnim.array[i * 4 + 3] = lodFlag;
    a.aShape.array[i * 4] = look.h; a.aShape.array[i * 4 + 1] = look.sh; a.aShape.array[i * 4 + 2] = look.gi; a.aShape.array[i * 4 + 3] = look.sp;
    const lod = L.lod;
    a.aLook.array[i * 4] = lodValue(lod, GROUP.HAIR, look.hair);
    a.aLook.array[i * 4 + 1] = look.hat;
    a.aLook.array[i * 4 + 2] = lodValue(lod, GROUP.ACC, look.acc);
    a.aLook.array[i * 4 + 3] = look.top;
    a.aStyle.array[i * 4] = lowStyleOf(look); a.aStyle.array[i * 4 + 1] = look.skin; a.aStyle.array[i * 4 + 2] = look.head; a.aStyle.array[i * 4 + 3] = d.lookYaw || 0;
    const ct = linRgb(look.cTop);
    const cb = linRgb(look.cBot);
    const ca = linRgb(look.cAcc);
    const ch = linRgb(look.cHair);
    a.aCol0.array[i * 4] = ct[0]; a.aCol0.array[i * 4 + 1] = ct[1]; a.aCol0.array[i * 4 + 2] = ct[2]; a.aCol0.array[i * 4 + 3] = look.glow;
    a.aCol1.array[i * 4] = cb[0]; a.aCol1.array[i * 4 + 1] = cb[1]; a.aCol1.array[i * 4 + 2] = cb[2]; a.aCol1.array[i * 4 + 3] = 0;
    a.aCol2.array[i * 4] = ca[0]; a.aCol2.array[i * 4 + 1] = ca[1]; a.aCol2.array[i * 4 + 2] = ca[2]; a.aCol2.array[i * 4 + 3] = 0;
    a.aCol3.array[i * 4] = ch[0]; a.aCol3.array[i * 4 + 1] = ch[1]; a.aCol3.array[i * 4 + 2] = ch[2]; a.aCol3.array[i * 4 + 3] = 0;
    a.aLight.array[i * 4] = d.sky === undefined ? 1 : d.sky; a.aLight.array[i * 4 + 1] = d.blk || 0; a.aLight.array[i * 4 + 2] = d.fade === undefined ? 1 : d.fade;
    a.aLight.array[i * 4 + 3] = ((d.id * 2654435761) >>> 0) / 4294967296;
  }

  function writeFar(d) {
    const L = far;
    const i = L.n++;
    const a = L.attrs;
    const look = d.look;
    a.aPos.array[i * 4] = d.x; a.aPos.array[i * 4 + 1] = d.y; a.aPos.array[i * 4 + 2] = d.z; a.aPos.array[i * 4 + 3] = d.yaw;
    a.aAnim.array[i * 4] = d.phase; a.aAnim.array[i * 4 + 1] = d.speed; a.aAnim.array[i * 4 + 2] = d.gesture | 0; a.aAnim.array[i * 4 + 3] = 2;
    a.aShape.array[i * 4] = look.h; a.aShape.array[i * 4 + 1] = look.sh; a.aShape.array[i * 4 + 2] = look.gi; a.aShape.array[i * 4 + 3] = 0;
    a.aLook.array[i * 4] = look.hair; a.aLook.array[i * 4 + 1] = look.hat; a.aLook.array[i * 4 + 2] = look.acc; a.aLook.array[i * 4 + 3] = look.top;
    a.aStyle.array[i * 4] = lowStyleOf(look); a.aStyle.array[i * 4 + 1] = look.skin; a.aStyle.array[i * 4 + 2] = look.head; a.aStyle.array[i * 4 + 3] = 0;
    const ct = linRgb(look.cTop);
    const cb = linRgb(look.cBot);
    const ca = linRgb(look.cAcc);
    const ch = linRgb(look.cHair);
    a.aCol0.array[i * 4] = ct[0]; a.aCol0.array[i * 4 + 1] = ct[1]; a.aCol0.array[i * 4 + 2] = ct[2]; a.aCol0.array[i * 4 + 3] = look.glow;
    a.aCol1.array[i * 4] = cb[0]; a.aCol1.array[i * 4 + 1] = cb[1]; a.aCol1.array[i * 4 + 2] = cb[2]; a.aCol1.array[i * 4 + 3] = 0;
    a.aCol2.array[i * 4] = ca[0]; a.aCol2.array[i * 4 + 1] = ca[1]; a.aCol2.array[i * 4 + 2] = ca[2]; a.aCol2.array[i * 4 + 3] = 0;
    a.aCol3.array[i * 4] = ch[0]; a.aCol3.array[i * 4 + 1] = ch[1]; a.aCol3.array[i * 4 + 2] = ch[2]; a.aCol3.array[i * 4 + 3] = 0;
    a.aLight.array[i * 4] = d.sky === undefined ? 1 : d.sky; a.aLight.array[i * 4 + 1] = d.blk || 0; a.aLight.array[i * 4 + 2] = d.fade === undefined ? 1 : d.fade;
    a.aLight.array[i * 4 + 3] = 0;
  }

  function writeShadow(d) {
    const L = shadow;
    if (L.n >= L.cap) return;
    const i = L.n++;
    const a = L.attrs;
    a.aPos.array[i * 4] = d.x; a.aPos.array[i * 4 + 1] = d.y; a.aPos.array[i * 4 + 2] = d.z; a.aPos.array[i * 4 + 3] = 0.95 * d.look.h * (0.9 + 0.1 * d.look.gi);
    a.aCol0.array[i * 4] = 0; a.aCol0.array[i * 4 + 1] = 0; a.aCol0.array[i * 4 + 2] = 0; a.aCol0.array[i * 4 + 3] = d.fade === undefined ? 1 : d.fade;
  }

  function writeUmbrella(d) {
    const L = umb;
    if (L.n >= L.cap) return;
    const i = L.n++;
    const a = L.attrs;
    const cu = linRgb(d.look.cUmb);
    a.aPos.array[i * 4] = d.x; a.aPos.array[i * 4 + 1] = d.y; a.aPos.array[i * 4 + 2] = d.z; a.aPos.array[i * 4 + 3] = d.yaw;
    a.aUmb.array[i * 4] = d.umb; a.aUmb.array[i * 4 + 1] = d.look.h; a.aUmb.array[i * 4 + 2] = (d.id % 97) * 0.37; a.aUmb.array[i * 4 + 3] = 0;
    a.aCol0.array[i * 4] = cu[0]; a.aCol0.array[i * 4 + 1] = cu[1]; a.aCol0.array[i * 4 + 2] = cu[2]; a.aCol0.array[i * 4 + 3] = 1;
    a.aLight.array[i * 4] = d.sky === undefined ? 1 : d.sky; a.aLight.array[i * 4 + 1] = d.blk || 0; a.aLight.array[i * 4 + 2] = d.fade === undefined ? 1 : d.fade; a.aLight.array[i * 4 + 3] = 0;
  }

  function finish(L, visible) {
    L.mesh.visible = visible && L.n > 0;
    L.geo.instanceCount = L.n;
    if (L.n > 0) {
      const names = L.names || Object.keys(L.attrs);
      for (let k = 0; k < names.length; k++) mark(L.attrs[names[k]], L.n);
    }
  }

  const cr = {
    group,
    stats,
    uniforms,
    layers: {
      near, mid, far, shadow, umbrella: umb,
    },
    beginFrame(camera, dt, env) {
      near.n = 0; mid.n = 0; far.n = 0; shadow.n = 0; umb.n = 0;
      dropped = 0;
      uniforms.uCTime.value += Math.min(0.1, Math.max(0, dt || 0));
      const rm = (env && env.reduced !== undefined ? !!env.reduced : reduced);
      uniforms.uMotion.value += ((rm ? 0.55 : 1) - uniforms.uMotion.value) * Math.min(1, (dt || 0.016) * 4);
      void camera;
    },
    add(d) {
      if (!d || !d.look || !Number.isFinite(d.x + d.y + d.z + d.yaw)) {
        dropped++;
        return false;
      }
      if (d.fade !== undefined && d.fade < 0.04) return false;
      let tier = d.tier | 0;
      const caps = RENDER_CAPS[tierKey];
      if (tier === 0 && (near.n >= caps.near || near.n >= near.cap)) tier = 1;
      if (tier === 1 && (mid.n >= caps.mid || mid.n >= mid.cap)) tier = 2;
      if (tier === 2 && far.n >= far.cap) {
        dropped++;
        return false;
      }
      if (tier === 0) writeCitizen(near, d, 0);
      else if (tier === 1) writeCitizen(mid, d, 1);
      else writeFar(d);
      if (d.umb > 0.02) writeUmbrella(d);
      writeShadow(d);
      return true;
    },
    endFrame() {
      finish(near, true);
      finish(mid, true);
      finish(far, true);
      finish(shadow, true);
      finish(umb, true);
      stats.near = near.n; stats.mid = mid.n; stats.far = far.n; stats.umbrellas = umb.n; stats.shadows = shadow.n;
      stats.draws = (near.n > 0 ? 1 : 0) + (mid.n > 0 ? 1 : 0) + (far.n > 0 ? 1 : 0) + (umb.n > 0 ? 1 : 0) + (shadow.n > 0 ? 1 : 0);
      stats.tris = near.n * near.tris + mid.n * mid.tris + far.n * 2 + umb.n * umb.tris + shadow.n * 2;
      stats.dropped = dropped;
      group.visible = near.n + mid.n + far.n > 0;
    },
    setQuality(q) {
      if (RENDER_CAPS[q]) {
        tierKey = q;
        stats.tier = q;
      }
    },
    setReducedMotion(b) {
      reduced = !!b;
    },
    /** Gölgelendiricileri önceden derler (ilk görünümde takılma olmasın). Her katman en az bir (gizli olmayan) örnekle çizilir. */
    warm(renderer, scene, camera, wo) {
      if (!renderer || typeof renderer.compile !== 'function') return 0;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      const w = wo || {};
      const meshes = [near.mesh, mid.mesh, far.mesh, umb.mesh, shadow.mesh];
      const vis = meshes.map((m) => m.visible);
      const counts = [near.geo.instanceCount, mid.geo.instanceCount, far.geo.instanceCount, umb.geo.instanceCount, shadow.geo.instanceCount];
      const gv = group.visible;
      meshes.forEach((m) => { m.visible = true; });
      [near.geo, mid.geo, far.geo, umb.geo, shadow.geo].forEach((g) => { g.instanceCount = 1; });
      group.visible = true;
      try {
        const variants = w.variants && w.variants.length ? w.variants : [null];
        for (let v = 0; v < variants.length; v++) {
          if (variants[v] && variants[v].enter) variants[v].enter();
          if (typeof renderer.compile === 'function') renderer.compile(scene, camera);
          if (variants[v] && variants[v].exit) variants[v].exit();
        }
      } catch {
        /* ısınma başarısız olsa da çizim derler */
      }
      meshes.forEach((m, i) => { m.visible = vis[i]; });
      [near.geo, mid.geo, far.geo, umb.geo, shadow.geo].forEach((g, i) => { g.instanceCount = counts[i]; });
      group.visible = gv;
      stats.warmMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
      return stats.warmMs;
    },
    getStats() {
      return stats;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      [near, mid, far, shadow, umb].forEach((L) => {
        L.geo.dispose();
        L.mat.dispose();
        group.remove(L.mesh);
      });
      group.clear();
    },
    get disposed() {
      return disposed;
    },
  };
  return cr;
}
