/*
 * KEŞİF render/city — UZAK SİLUET (skyline impostor). Sözleşme §13: ≤600 kutu, TEK çizim çağrısı, görüş mesafesi ötesindeki kuleler sise
 * karışan siluet olarak görünür (y300'den bakınca şehir panoraması). Shader: skylineShaders.js.
 *
 *   normalizeSkylineBox(entry) → {cx,cz,w,d,h,y0,hue,seed}|null        cityPlan.skyline girdisi (nesne ya da dizi) → kutu
 *   buildSkylineInstances(list, max, base?) → {count, a:Float32Array(count*4), b:Float32Array(count*4), boxes[]}
 *                                      geçersizleri eler, en iri kutuları (yükseklik×taban) seçer, sıralı/belirlenimci (aynı girdi → aynı bayt)
 *   createSkylineImpostor(THREE, {uniforms, max, window groupA}) → {object3D, setBoxes(list), setMax(n), setWindowGroupA(b), getCount(),
 *                                      getBoxes(), dispose()}
 *      uniforms: chunk malzemesinin paylaşılan uniform nesnesi (materials.uniforms) — sis/gökyüzü/ışık/uNeon kareden kareye otomatik izlenir.
 *
 * Kutu girdisi (cityPlan.skyline[] uyumlu, esnek): {cx,cz | x,z (merkez) | x0,z0 (köşe), w,d, h|height|floors(×4), y0|baseY (varsayılan 64),
 * top|y1 (tepe y), district (bölge indeksi → o bölgenin neon tonları) | hue (doğrudan neon tonu 0..3), seed|id}; ya da [cx,cz,w,d,h,y0?,hue?].
 * Boyutlar kıstırılır (w,d 2..240, h 4..340); sonlu olmayan girdi atılır.
 */
import { SKYLINE_VERTEX, SKYLINE_FRAGMENT } from './skylineShaders.js';
import { hash32 } from '../../sim/rng.js';
import { DISTRICTS } from '../../sim/city/archetypes.js';

/** Bölge indeksi (cityPlan.skyline[].district) → o bölgenin neon tonu çifti (gerçek cepheler bölge paletini kullanır). */
const DISTRICT_HUES = [];
Object.keys(DISTRICTS).forEach((k) => {
  DISTRICT_HUES[DISTRICTS[k].idx] = DISTRICTS[k].hues;
});

export const SKYLINE_MAX = 600;
/** Zemin örneği (ek 1 kutu; "≤600 kutu" sayısına girmez): neon tonu yerine bu işaret shader'da zemini seçer. */
export const SKYLINE_GROUND_HUE = 9;
export const SKYLINE_GROUND_Y = 63;
export const SKYLINE_FLOOR_H = 4;
const GROUND_Y = 64;
const TWO32 = 4294967296;

function fin(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Tek girdi → {cx,cz,w,d,h,y0,hue,seed} | null. */
export function normalizeSkylineBox(e) {
  if (e === null || e === undefined) return null;
  let cx;
  let cz;
  let w;
  let d;
  let h;
  let y0 = GROUND_Y;
  let hue;
  let seed;
  let hues = null;
  if (Array.isArray(e)) {
    [cx, cz, w, d, h] = e;
    if (fin(e[5])) y0 = e[5];
    if (fin(e[6])) hue = e[6];
  } else if (typeof e === 'object') {
    w = fin(e.w) ? e.w : fin(e.width) ? e.width : e.sx;
    d = fin(e.d) ? e.d : fin(e.depth) ? e.depth : e.sz;
    if (fin(e.cx) && fin(e.cz)) {
      cx = e.cx;
      cz = e.cz;
    } else if (fin(e.x0) && fin(e.z0) && fin(w) && fin(d)) {
      cx = e.x0 + w / 2;
      cz = e.z0 + d / 2;
    } else {
      cx = e.x;
      cz = e.z;
    }
    if (fin(e.y0)) y0 = e.y0;
    else if (fin(e.baseY)) y0 = e.baseY;
    if (fin(e.h)) h = e.h;
    else if (fin(e.height)) h = e.height;
    else if (fin(e.floors)) h = e.floors * (fin(e.floorH) ? e.floorH : SKYLINE_FLOOR_H);
    else if (fin(e.top)) h = e.top - y0;
    else if (fin(e.y1)) h = e.y1 - y0;
    if (fin(e.district) && DISTRICT_HUES[Math.floor(e.district)]) hues = DISTRICT_HUES[Math.floor(e.district)];
    else if (fin(e.hue)) hue = e.hue;
    if (fin(e.seed)) seed = e.seed;
    else if (fin(e.id)) seed = e.id;
  } else {
    return null;
  }
  if (!fin(cx) || !fin(cz) || !fin(w) || !fin(d) || !fin(h) || !fin(y0)) return null;
  if (w <= 0 || d <= 0 || h <= 0) return null;
  return {
    cx,
    cz,
    w: clamp(w, 2, 240),
    d: clamp(d, 2, 240),
    h: clamp(h, 4, 340),
    y0: clamp(y0, -400, 362),
    hue: fin(hue) ? ((Math.floor(hue) % 4) + 4) % 4 : -1,
    hues,
    seed: fin(seed) ? seed : null,
  };
}

/** En iri kutuları seçip örnek tamponlarını kurar. Belirlenimci: aynı liste → aynı bayt (sıra: boyuta göre azalan, eşitlikte konum). */
export function buildSkylineInstances(list, max, wantGround) {
  const cap = clamp(Math.floor(fin(max) ? max : SKYLINE_MAX), 0, SKYLINE_MAX);
  const norm = [];
  const src = Array.isArray(list) ? list : [];
  for (let i = 0; i < src.length && i < 20000; i++) {
    const b = normalizeSkylineBox(src[i]);
    if (b) norm.push(b);
  }
  norm.sort((p, q) => {
    const sp = p.h * Math.sqrt(p.w * p.d);
    const sq = q.h * Math.sqrt(q.w * q.d);
    if (sq !== sp) return sq - sp;
    if (p.cx !== q.cx) return p.cx - q.cx;
    return p.cz - q.cz;
  });
  const nBox = Math.min(cap, norm.length);
  // zemin: seçilen kutuların kapsayan dikdörtgeni (+40 blok pay, en az 400×400), şehir zemininin hemen altında (gerçek zemin üstte kalır)
  let ground = null;
  if (wantGround !== false && nBox > 0) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i < nBox; i++) {
      const n = norm[i];
      x0 = Math.min(x0, n.cx - n.w / 2);
      x1 = Math.max(x1, n.cx + n.w / 2);
      z0 = Math.min(z0, n.cz - n.d / 2);
      z1 = Math.max(z1, n.cz + n.d / 2);
    }
    const gw = Math.max(400, x1 - x0 + 80);
    const gd = Math.max(400, z1 - z0 + 80);
    ground = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: gw, d: gd };
  }
  const count = nBox + (ground ? 1 : 0);
  const a = new Float32Array(count * 4);
  const b = new Float32Array(count * 4);
  const boxes = [];
  if (ground) {
    a[0] = ground.cx;
    a[1] = ground.cz;
    a[2] = ground.w;
    a[3] = ground.d;
    b[0] = SKYLINE_GROUND_Y - 0.5;
    b[1] = 0.5;
    b[2] = 0.5;
    b[3] = SKYLINE_GROUND_HUE;
  }
  const off = ground ? 1 : 0;
  for (let k = 0; k < nBox; k++) {
    const i = k + off;
    const n = norm[k];
    const hs = hash32(Math.imul(Math.round(n.cx * 4), 0x27d4eb2f) ^ Math.imul(Math.round(n.cz * 4), 0x165667b1) ^ Math.round(n.h * 8));
    // tohum: kimlik tam sayı olabilir → hash'le (kesir kısmı sıfır olurdu); aynı kimlik hep aynı değer
    const seed = n.seed !== null ? hash32(Math.floor(n.seed) | 0) / TWO32 : hs / TWO32;
    const hue = n.hues ? n.hues[(hs >>> 3) & 1] : n.hue >= 0 ? n.hue : hs % 4;
    a[i * 4] = n.cx;
    a[i * 4 + 1] = n.cz;
    a[i * 4 + 2] = n.w;
    a[i * 4 + 3] = n.d;
    b[i * 4] = n.y0;
    b[i * 4 + 1] = n.h;
    b[i * 4 + 2] = seed;
    b[i * 4 + 3] = hue;
    boxes.push(n);
  }
  return { count, boxCount: nBox, hasGround: !!ground, a, b, boxes };
}

/** Altı olmayan birim kutu (5 yüz, 20 köşe, 10 üçgen): konum [-0.5,0.5]³, yüz başına düz normal. */
function boxGeometryData() {
  const P = [];
  const N = [];
  const I = [];
  const face = (n, c) => {
    const base = P.length / 3;
    for (let k = 0; k < 4; k++) {
      P.push(c[k][0], c[k][1], c[k][2]);
      N.push(n[0], n[1], n[2]);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const h = 0.5;
  face([1, 0, 0], [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]]);
  face([-1, 0, 0], [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]]);
  face([0, 0, 1], [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]]);
  face([0, 0, -1], [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]]);
  face([0, 1, 0], [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]]);
  return { position: new Float32Array(P), normal: new Float32Array(N), index: new Uint16Array(I) };
}
export const SKYLINE_BOX_TRIANGLES = 10;

/**
 * @param {object} THREE three modülü
 * @param {{uniforms?:object, max?:number, windowGroupA?:boolean}} [opts] uniforms: materials.uniforms (paylaşılır)
 */
export function createSkylineImpostor(THREE, opts) {
  const o = opts || {};
  const shared = o.uniforms || {};
  let max = clamp(Math.floor(fin(o.max) ? o.max : SKYLINE_MAX), 0, SKYLINE_MAX);
  let boxesIn = [];
  let built = { count: 0, boxes: [] };
  let disposed = false;

  const bg = boxGeometryData();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(bg.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(bg.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(bg.index, 1));
  const attrA = new THREE.InstancedBufferAttribute(new Float32Array((SKYLINE_MAX + 1) * 4), 4);
  const attrB = new THREE.InstancedBufferAttribute(new Float32Array((SKYLINE_MAX + 1) * 4), 4);
  geo.setAttribute('aBoxA', attrA);
  geo.setAttribute('aBoxB', attrB);
  geo.instanceCount = 0;
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);

  const names = [
    'uNeon', 'uTime', 'uMotion', 'uSkyLight', 'uAmbientColor', 'uSunDir', 'uSunColor', 'uFogColor', 'uFogNear', 'uFogFar', 'uFadeEnd',
    'uSkyColor', 'uHorizonColor',
  ];
  const uniforms = { uFarClip: { value: 1600 }, uSkylineWindowA: { value: o.windowGroupA === false ? 0 : 1 } };
  const fallback = {
    uNeon: new THREE.Vector4(0, 0.45, 0, 0), uTime: 0, uMotion: 1, uSkyLight: 1, uAmbientColor: new THREE.Color(0.5, 0.58, 0.74),
    uSunDir: new THREE.Vector3(0.45, 0.8, 0.35).normalize(), uSunColor: new THREE.Color(0.62, 0.56, 0.44), uFogColor: new THREE.Color(0.3, 0.3, 0.4),
    uFogNear: 60, uFogFar: 150, uFadeEnd: 148, uSkyColor: new THREE.Color(0.1, 0.1, 0.3), uHorizonColor: new THREE.Color(0.3, 0.3, 0.5),
  };
  names.forEach((n) => {
    uniforms[n] = shared[n] || { value: fallback[n] };
  });

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKYLINE_VERTEX,
    fragmentShader: SKYLINE_FRAGMENT,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: true,
    depthTest: true,
    fog: false,
  });
  mat.name = 'kesif-siluet';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'kesif-siluet-kutular';
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (camera && Number.isFinite(camera.far)) uniforms.uFarClip.value = camera.far;
  };

  function rebuild() {
    built = buildSkylineInstances(boxesIn, max);
    attrA.array.fill(0);
    attrB.array.fill(0);
    attrA.array.set(built.a);
    attrB.array.set(built.b);
    attrA.needsUpdate = true;
    attrB.needsUpdate = true;
    geo.instanceCount = built.count;
    mesh.visible = built.count > 0;
  }

  return {
    object3D: mesh,
    /** cityPlan.skyline girdisi (bkz. normalizeSkylineBox); en iri `max` kutu çizilir. */
    setBoxes(list) {
      if (disposed) return 0;
      boxesIn = Array.isArray(list) ? list : [];
      rebuild();
      return built.boxCount || 0;
    },
    /** Kalite kademesine göre kutu tavanı (≤600). */
    setMax(n) {
      const m = clamp(Math.floor(fin(n) ? n : SKYLINE_MAX), 0, SKYLINE_MAX);
      if (m === max) return;
      max = m;
      if (!disposed) rebuild();
    },
    /** Düşük kademe: pencere grubu A kapalı. */
    setWindowGroupA(on) {
      uniforms.uSkylineWindowA.value = on ? 1 : 0;
    },
    /** Çizilen KUTU sayısı (zemin örneği hariç). */
    getCount() {
      return built.boxCount || 0;
    },
    /** Toplam örnek (kutular + zemin). */
    getInstanceCount() {
      return built.count;
    },
    getBoxes() {
      return built.boxes;
    },
    get drawCalls() {
      return mesh.visible && built.count > 0 ? 1 : 0;
    },
    get triangles() {
      return mesh.visible ? built.count * SKYLINE_BOX_TRIANGLES : 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      geo.dispose();
      mat.dispose();
      if (mesh.parent) mesh.parent.remove(mesh);
    },
  };
}
