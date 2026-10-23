/*
 * KEŞİF eşya modeli yapı taşları: geometri/malzeme önbelleği ve küçük kurucular (three, WebGL yok).
 *
 * Geometriler ve malzemeler anahtarla önbelleklenir ve eşya örnekleri arasında PAYLAŞILIR; bu yüzden
 * tek bir modeli dispose etmek önbelleği silmez (disposeHeldItemModel yalnızca modele özel `owned`
 * kaynakları atar). Tüm önbelleği boşaltmak için disposeKit().
 * Model yerel uzayı: +Y eşya uzunluğu, orijin tutma noktası, +Z kalınlık, +X genişlik (silah için ileri).
 */
import * as THREE from 'three';

const geos = new Map();
const mats = new Map();
/** Skin kapsamı: açıkken önbelleğe yeni giren malzemeler skin anahtarıyla işaretlenir (pruneSkinMats ile atılabilir; sınırsız büyüme yok). */
let skinScope = null;
const skinMats = new Map(); // malzeme önbellek anahtarı → bu malzemeyi kullanan skin anahtarları kümesi (farklı skin'ler aynı rengi paylaşabilir)
function markSkin(key) {
  let s = skinMats.get(key);
  if (!s) { s = new Set(); skinMats.set(key, s); }
  s.add(skinScope);
}
export function setSkinScope(key) {
  skinScope = key || null;
}
/** Etkin olmayan skin'lerin malzemelerini atar (three yeniden kullanımda programı yeniden bağlar; güvenli). */
export function pruneSkinMats(active) {
  skinMats.forEach((scopes, k) => {
    if (active) {
      let used = false;
      scopes.forEach((sk) => { if (active.has(sk)) used = true; });
      if (used) return;
    }
    const m = mats.get(k);
    if (m) m.dispose();
    mats.delete(k);
    skinMats.delete(k);
  });
}
/** Test/teşhis: önbellekteki malzeme sayısı ve skin'li olanlar. */
export function kitStats() {
  return { geos: geos.size, mats: mats.size, skinMats: skinMats.size };
}

/** Önbellekli geometri. */
export function G(key, make) {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

/** Standart (PBR) malzeme, önbellekli. o: rough, metal, emissive, ei, flat, side, opacity */
export function stdMat(color, o = {}) {
  const key = ['s', color, o.rough, o.metal, o.emissive, o.ei, o.flat, o.side, o.opacity].join('|');
  let m = mats.get(key);
  if (m && skinScope && skinMats.has(key)) markSkin(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough === undefined ? 0.6 : o.rough,
      metalness: o.metal === undefined ? 0 : o.metal,
      emissive: o.emissive === undefined ? 0x000000 : o.emissive,
      emissiveIntensity: o.ei === undefined ? 0 : o.ei,
      flatShading: !!o.flat,
      side: o.side === undefined ? THREE.FrontSide : o.side,
      transparent: o.opacity !== undefined && o.opacity < 1,
      opacity: o.opacity === undefined ? 1 : o.opacity,
    });
    mats.set(key, m);
    if (skinScope) markSkin(key);
  }
  return m;
}

/** Işıksız (parlak) malzeme: ateş, çekirdek, parıltı. o: add (eklemeli karışım), opacity, bright */
export function basicMat(color, o = {}) {
  const key = ['b', color, o.add, o.opacity, o.bright, o.side].join('|');
  let m = mats.get(key);
  if (m && skinScope && skinMats.has(key)) markSkin(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: !!o.add || (o.opacity !== undefined && o.opacity < 1),
      opacity: o.opacity === undefined ? 1 : o.opacity,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !o.add,
      side: o.side === undefined ? THREE.FrontSide : o.side,
      toneMapped: false,
    });
    if (o.bright) m.color.multiplyScalar(o.bright);
    mats.set(key, m);
    if (skinScope) markSkin(key);
  }
  return m;
}

/** Hızlı mesh: konum, dönüş (rad), ölçek. */
export function mesh(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  return m;
}

/* --- birim geometriler (ölçekle kullanılır) --- */
export const unitSphere = () => G('u:sphere', () => new THREE.SphereGeometry(1, 14, 10));
export const lowSphere = () => G('u:sphere:low', () => new THREE.SphereGeometry(1, 8, 6));
export const unitCyl = () => G('u:cyl', () => new THREE.CylinderGeometry(1, 1, 1, 14, 1));
export const unitCone = () => G('u:cone', () => new THREE.ConeGeometry(1, 1, 14, 1));
export const unitBox = () => G('u:box', () => new THREE.BoxGeometry(1, 1, 1));
export const unitOcta = () => G('u:octa', () => new THREE.OctahedronGeometry(1, 0));
export const unitIco = () => G('u:ico', () => new THREE.IcosahedronGeometry(1, 1));
export const unitTorus = () => G('u:torus', () => new THREE.TorusGeometry(1, 0.22, 8, 22));
export const unitPlane = () => G('u:plane', () => new THREE.PlaneGeometry(1, 1));

/** Yuvarlatılmış dikdörtgen şekli (w×h, köşe r). */
export function rrectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/** Çokgen noktalarından (x,y) pahlı ekstrüzyon; derinlik z'de ortalanır. */
export function shapeGeo(key, pts, depth, bevel = 0.005) {
  return G(key, () => {
    const s = new THREE.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    s.closePath();
    return extrude(s, depth, bevel);
  });
}
export function extrude(shape, depth, bevel = 0.005) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/** Yuvarlatılmış kutu (köşeleri pahlı). */
export function rbox(w, h, d, r = 0.006) {
  return G(`rbox:${w}:${h}:${d}:${r}`, () => {
    const g = extrude(rrectShape(w - 2 * r * 0.6, h - 2 * r * 0.6, r), Math.max(0.001, d - 2 * r), r * 0.6);
    return g;
  });
}

/** Çokgeni merkezine göre ölçekler/öteler (katmanlı silüetler için). */
export function insetPts(pts, s, ox = 0, oy = 0) {
  let cx = 0;
  let cy = 0;
  pts.forEach((p) => { cx += p[0]; cy += p[1]; });
  cx /= pts.length;
  cy /= pts.length;
  return pts.map((p) => [cx + (p[0] - cx) * s + ox, cy + (p[1] - cy) * s + oy]);
}

/** LatheGeometry: profile [[yarıçap, y], ...]. */
export function lathe(key, profile, seg = 16) {
  return G(key, () => {
    const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
    g.computeVertexNormals();
    return g;
  });
}

/** Eğri boyunca boru. pts: [[x,y,z]...] */
export function tubeGeo(key, pts, radius, tubular = 24, radial = 8) {
  return G(key, () => {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    return new THREE.TubeGeometry(c, tubular, radius, radial, false);
  });
}

/** Birim yüksekli silindirin p0→p1 arasını kaplayacak biçimde yerleştirir (ip/çubuk güncellemesi). */
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _vq = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
export function stretchBetween(m, p0, p1, thick) {
  _va.set(p0[0], p0[1], p0[2]);
  _vb.set(p1[0], p1[1], p1[2]);
  const len = _va.distanceTo(_vb) || 0.0001;
  m.position.copy(_va).add(_vb).multiplyScalar(0.5);
  _vq.setFromUnitVectors(_up, _vb.sub(_va).normalize());
  m.quaternion.copy(_vq);
  m.scale.set(thick, len, thick);
}

/** Modele özel (dispose edilecek) kaynakları kaydeder. */
export function own(model, obj) {
  if (!model.userData.owned) model.userData.owned = [];
  model.userData.owned.push(obj);
  return obj;
}

export function disposeKit() {
  geos.forEach((g) => g.dispose());
  geos.clear();
  mats.forEach((m) => m.dispose());
  mats.clear();
  skinMats.clear();
  skinScope = null;
}

export { THREE };
