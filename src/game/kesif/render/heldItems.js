/*
 * KEŞİF eşya 3D modelleri: elde tutulan, yere düşen ve birinci şahıs eşyaları.
 *
 *   createHeldItemModel(THREE, itemKey, atlasInfo?, skins?) → THREE.Group | null   (skins: skins.resolveSkinSet çıktısı; yoksa eski görünüm)
 *   getHeldPlacement(model, 'tp'|'fp') → {hand:'R'|'L', hold, pos:[x,y,z], quat:[x,y,z,w], scale}
 *   createDroppedItem(THREE, itemKey, atlasInfo?) → Group (userData.update(t, dt): dönme + salınım)
 *   disposeHeldItemModel(model), disposeHeldItemCache()
 *
 * Her eşya (sim/items.js) itemPalette.itemSpec ile bir `kind`'a çözülür; kind başına kurucu vardır
 * (BUILDERS ↔ itemPalette.MODEL_KINDS birebir; testle denetlenir). Geometri/malzemeler önbelleklidir
 * ve paylaşılır; modele özel kaynaklar userData.owned'dadır. Modeller gerçek ölçektedir (m), +Y eşya
 * uzunluğu, orijin tutma noktası. `THREE` parametresi API simetrisi içindir: modül kendi three
 * içe aktarımını kullanır (aynı örnek).
 *
 * atlasInfo (blok küpü için): { texture?: THREE.Texture, canvasColor?: HTMLCanvasElement, uvFor(tile) → [u0,v0,u1,v1] }.
 */
import * as THREE from 'three';
import { itemSpec, MODEL_KINDS } from './itemPalette.js';
import { TOOL_BUILDERS } from './heldItemsTools.js';
import { MISC_BUILDERS } from './heldItemsMisc.js';
import { MAGIC_BUILDERS } from './heldItemsMagic.js';
import { TECH_BUILDERS } from './heldItemsTech.js';
import { applyGlint, baseKey, disposeGlint, isGlintKey } from './enchantGlint.js';
import { G, stdMat, basicMat, mesh, unitSphere, disposeKit, setSkinScope, pruneSkinMats } from './heldItemsKit.js';
import { applySkinToSpec, skinForKind } from './skins.js';

/** El kemiğine göre tutma noktası (avuç içi, parmak kıvrımının içi): sağ/sol. Karakter ve viewmodel paylaşır. */
export const HAND_SOCKET = { R: [-0.034, -0.07, 0], L: [0.034, -0.07, 0] };

export const BUILDERS = {
  ...TOOL_BUILDERS, ...MISC_BUILDERS, ...MAGIC_BUILDERS, ...TECH_BUILDERS,
};
export const HELD_KINDS = MODEL_KINDS.slice();

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function basisQuat(X, Y, Z) {
  const m = new THREE.Matrix4().makeBasis(V(X), V(Y), V(Z));
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
/** Yumruğa göre "ileri eğimli" duruş: eşya +Y'si el -z yönünden α kadar -y (ileri) yana eğilir. */
function tilted(alpha) {
  const s = Math.sin(alpha);
  const c = Math.cos(alpha);
  return basisQuat([0, -c, s], [0, -s, -c], [1, 0, 0]);
}
/** α eğimli, bıçak yüzü ileri bakan (kürek). */
function tiltedFace(alpha) {
  const s = Math.sin(alpha);
  const c = Math.cos(alpha);
  return basisQuat([1, 0, 0], [0, -s, -c], [0, c, -s]);
}
const FORWARD_BARREL = () => basisQuat([1, 0, 0], [0, 0, -1], [0, 1, 0]);

/** kind → {hand, hold, pos, q, scale}. Konum el kemiğine göre (el yuvasına eklenir). */
const PLACEMENTS = {};
function place(kind, o) {
  PLACEMENTS[kind] = { hand: o.hand || 'R', pos: o.pos || [0, 0, 0], q: o.q, scale: o.scale || 1 };
}
place('sword', { q: tilted(0.5), pos: [0, 0.0, 0] });
place('pick', { q: tilted(0.35) });
place('axe', { q: tilted(0.35) });
place('shovel', { q: tiltedFace(0.4) });
place('torch', { q: tilted(0.3), pos: [0, 0.02, 0] });
place('lantern', { q: tilted(0.0), pos: [0, -0.03, 0] });
place('hook', { q: tilted(0.3) });
place('bow', { hand: 'L', q: FORWARD_BARREL() });
place('gun', { q: FORWARD_BARREL() });
place('portalgun', { q: FORWARD_BARREL() });
place('shield', { hand: 'L', q: basisQuat([-1, 0, 0], [0, 0, -1], [0, -1, 0]), pos: [0, -0.02, -0.0] });
place('glider', { q: basisQuat([1, 0, 0], [0, -1, 0], [0, 0, -1]), scale: 1.6 });
place('staff', { q: tilted(0.28), pos: [0, 0.02, 0] });
place('scanner', { q: tilted(0.45), pos: [0, 0.0, 0] });
place('jetpack', { q: tilted(0.7), pos: [0, 0.0, 0], scale: 1.2 });
place('block', { q: tilted(0.7), pos: [0, 0.0, 0] });
place('arrow', { q: tilted(0.7) });
const SMALL = ['plant', 'cell', 'boots', 'compass', 'armor', 'apple', 'strawberry', 'carrot', 'potato', 'drumstick', 'chop', 'fish', 'bowl',
  'potion', 'stick', 'coal', 'raw', 'ingot', 'gem', 'crystal', 'dust', 'string', 'wool', 'leather', 'feather', 'flint', 'bone', 'clay',
  'brick', 'paper', 'book', 'orb', 'star', 'dye', 'crystalkey', 'key', 'bosskey', 'flat'];
SMALL.forEach((k) => place(k, { q: tilted(0.65), pos: [0, 0.01, -0.01] }));
// Pusula: kadran (model +Z) birinci şahıs kameraya (dirsek yönüne) bakar; kenardan görünmesin
place('compass', { q: tiltedFace(0.55), pos: [0, 0.015, -0.01], scale: 1.3 });

const FP_TWEAK = {
  default: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.85 },
  pick: { rx: -0.25, ry: 0.0, rz: 0.0, s: 0.8 },
  axe: { rx: -0.25, ry: 0.0, rz: 0.0, s: 0.8 },
  shovel: { rx: -0.25, ry: 0.0, rz: 0.0, s: 0.8 },
  sword: { rx: -0.2, ry: 0.0, rz: 0.0, s: 0.85 },
  block: { rx: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
  plant: { rx: 0.0, ry: 0.0, rz: 0.0, s: 1.0 },
  bow: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.95 },
  gun: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.95 },
  portalgun: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.95 },
  glider: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.7 },
  staff: { rx: -0.12, ry: 0.0, rz: 0.0, s: 0.9 },
  scanner: { rx: -0.15, ry: 0.0, rz: 0.0, s: 1.0 },
  jetpack: { rx: 0.0, ry: 0.0, rz: 0.0, s: 0.85 },
};

/** Eşya modelinin elde duruşu. view: 'tp' (üçüncü şahıs) | 'fp' (birinci şahıs). */
const _fq = new THREE.Quaternion();
const _fe = new THREE.Euler();
export function getHeldPlacement(model, view) {
  const spec = (model && model.userData.spec) || itemSpec('');
  const p = PLACEMENTS[spec.kind] || PLACEMENTS.flat;
  let q = p.q;
  let scale = p.scale;
  if (view === 'fp') {
    const f = FP_TWEAK[spec.kind] || FP_TWEAK.default;
    // birinci şahıs: eşya biraz öne eğik ve merkeze dönük (kendi Y ekseni etrafında), ölçek küçük
    _fe.set(f.rx, f.ry, f.rz, 'YXZ');
    _fq.setFromEuler(_fe);
    q = _fq.clone().multiply(p.q);
    scale *= f.s;
  }
  return {
    hand: p.hand,
    hold: spec.hold,
    pos: p.pos.slice(),
    quat: [q.x, q.y, q.z, q.w],
    scale,
    kind: spec.kind,
  };
}

let defaultAtlas = null;
/** Blok küpü için varsayılan atlas (atlas.createAtlasTextures çıktısı: {map, uvFor}); createHeldItemModel atlas vermezse bunu kullanır. */
export function setHeldItemAtlas(atlasInfo) {
  defaultAtlas = atlasInfo || null;
}

/**
 * Eşya anahtarından 3D model (bilinmeyen anahtar genel 'flat' modele düşer; boş anahtar null).
 * skins (isteğe bağlı): Keşif mağaza görünümü kümesi; yalnız portal tabancası/kazma/balta/kürek/asa/jetpack etkilenir (parametre değişir:
 * renk/emissive; yeni malzeme türü, geometri ya da çizim çağrısı eklenmez). userData.skinKey: uygulanan skin ('' = varsayılan).
 */
export function createHeldItemModel(_THREE, itemKeyRaw, atlasInfo, skins) {
  if (!itemKeyRaw) return null;
  const glint = isGlintKey(itemKeyRaw); // 'item:kılıç#e' → büyülü eşya: mor parıltı
  const itemKey = glint ? baseKey(itemKeyRaw) : itemKeyRaw;
  const base = itemSpec(itemKey);
  const skin = skins ? skinForKind(skins, base.kind) : null;
  const spec = skin ? applySkinToSpec(base, skin) : base;
  const applied = spec !== base;
  const build = BUILDERS[spec.kind] || BUILDERS.flat;
  if (applied) setSkinScope(skin.key);
  let g;
  try {
    g = build(spec, { atlas: atlasInfo || defaultAtlas, anim: !!(applied && skins.anim) });
  } finally {
    if (applied) setSkinScope(null);
  }
  g.name = 'held:' + spec.kind;
  g.userData.spec = spec;
  g.userData.kind = spec.kind;
  g.userData.skinKey = applied ? skin.key : '';
  if (glint) applyGlint(g);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return g;
}

/** Modele özel kaynakları (owned) atar; paylaşılan önbelleğe dokunmaz. */
export function disposeHeldItemModel(model) {
  if (!model) return;
  if (model.parent) model.parent.remove(model);
  const owned = model.userData && model.userData.owned;
  if (owned) {
    owned.forEach((o) => { if (o && o.dispose) o.dispose(); });
    model.userData.owned = [];
  }
}

/** Skin'li malzemelerden artık kullanılmayanları atar (active: kullanımdaki skin anahtarları kümesi); varsayılan görünüm önbelleğine dokunmaz. */
export function pruneHeldSkinCache(active) {
  pruneSkinMats(active);
}

let cacheUsers = 0;
/** Oyun örneği önbelleği kullanmaya başlar/bırakır; SON örnek kapanınca önbellek boşaltılır (StrictMode/ardışık oyunlar canlı oyunun modellerini bozmaz). */
export function retainHeldItemCache() {
  cacheUsers++;
}
export function releaseHeldItemCache() {
  cacheUsers = Math.max(0, cacheUsers - 1);
  if (cacheUsers === 0) disposeHeldItemCache();
}

/** Tüm paylaşılan geometri/malzeme önbelleğini boşaltır (oyun kapanırken). */
export function disposeHeldItemCache() {
  disposeGlint();
  disposeKit();
}

/* ------------------------------------------------------------------------------------------------
 * Yere düşen eşya
 * ---------------------------------------------------------------------------------------------- */
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Yere düşen eşya: küçük, dönen ve salınan model + yumuşak parıltı + zemin gölgesi.
 * userData.update(t, dt): yerel zaman. userData.height: taban ile model merkezi arası.
 */
export function createDroppedItem(_THREE, itemKey, atlasInfo) {
  const group = new THREE.Group();
  group.name = 'dropped';
  const model = createHeldItemModel(THREE, itemKey, atlasInfo);
  if (!model) return group;
  const spec = model.userData.spec;
  const size = model.userData.size || 0.2;
  const target = spec.kind === 'block' ? 0.24 : 0.36;
  const k = Math.min(1.4, target / size);
  const pivot = new THREE.Group();
  model.scale.setScalar(k);
  // modeli merkeze oturt (uzun eşyalar +Y boyunca ortalanır)
  const box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.sub(c);
  pivot.add(model);
  group.add(pivot);
  // yumuşak parıltı
  const ench = model.userData.glint === true;
  const glowC = ench ? 0xa86bff : spec.glow > 0 ? spec.color : 0xffffff;
  const rare = ench ? 0.3 : spec.glow > 0 ? 0.18 : 0.07;
  const halo = mesh(unitSphere(), basicMat(glowC, { add: true, opacity: rare }), 0, 0, 0, 0, 0, 0, target * 0.62, target * 0.62, target * 0.62);
  pivot.add(halo);
  // zemin gölgesi
  const shadowGeo = G('drop:shadow', () => new THREE.CircleGeometry(0.5, 16));
  const shadow = new THREE.Mesh(shadowGeo, stdMat(0x000000, { rough: 1, opacity: 0.28 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.setScalar(target * 0.7);
  shadow.position.y = 0.01;
  group.add(shadow);
  const baseY = Math.max(0.12, target * 0.55);
  const phase = hash01(itemKey) * Math.PI * 2;
  pivot.position.y = baseY;
  group.userData.height = baseY;
  group.userData.spec = spec;
  group.userData.update = (t, dt) => {
    const tt = t + phase;
    pivot.rotation.y = tt * 1.4;
    pivot.position.y = baseY + Math.sin(tt * 2.1) * 0.04;
    const s = 1 + Math.sin(tt * 3) * 0.06;
    halo.scale.setScalar(target * 0.62 * s);
    shadow.scale.setScalar(target * (0.7 - Math.sin(tt * 2.1) * 0.05));
    if (model.userData.update) model.userData.update(t, dt);
  };
  return group;
}
