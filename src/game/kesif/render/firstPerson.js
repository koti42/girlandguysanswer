/*
 * KEŞİF birinci şahıs kollar + elde eşya (viewmodel).
 *
 *   createFirstPerson(THREE, camera, {avatarConfig, detail, reducedMotion}) →
 *     { group, update(dt, state), setHeld(itemKey), swing(kind), setSkin(config), setVisible(v), dispose(),
 *       light, flash(), triggerBow(...) yok → state.bowCharge/nocked ile sürülür }
 *
 * ÇİZİM KATMANI KARARI (duvara girmeme): "derinlik sıkıştırma" — viewmodel malzemelerinin köşe
 * gölgelendiricisi gl_Position.z'yi NDC derinlik aralığının en yakın %K'sına (varsayılan K=0.1)
 * sıkıştırır: z' = z*K - w*(1-K). Böylece kollar/eşya, kamera near düzleminin hemen ardındaki dar bir
 * derinlik bandında çizilir ve dünya geometrisinin (duvar, blok) HER ZAMAN önünde kalır; kendi içinde
 * derinlik sırası korunur. Ayrı geçiş/derinlik temizleme gerektirmez (game.js yalnızca sahneye kamerayı
 * eklemelidir: scene.add(camera)). Işık: sahne ışıklarına BAĞLI DEĞİL — update(state) ile verilen
 * skyLight/blockLight/sunDir/underwater değerlerinden kendi ışığını hesaplar (dünya ışık seviyesi).
 *
 * update(dt, state): state = {
 *   speed (m/s yatay), sprint, onGround, crouch, swimming, breaking (kırma tuşu basılı), eating (0..1 ilerleme | -1),
 *   bowCharge (0..1, yay geriliyor), nocked, yawRate, pitchRate (rad/s), skyLight (0..1), blockLight (0..1),
 *   sunDir {x,y,z} (dünya), underwater, reducedMotion }
 * swing(kind): 'mine'|'attack'|'slash'|'place'|'punch'|'fire'|'release'|'use'
 */
import * as THREE from 'three';
import { SkinBuilder } from './characterGeo.js';
import { makeContext, buildArms } from './characterBody.js';
import { buildArmWear } from './characterWear.js';
import { createHeldItemModel, getHeldPlacement, disposeHeldItemModel, HAND_SOCKET } from './heldItems.js';
import { GLINT_DECL, GLINT_FRAG, bindGlintUniforms } from './enchantGlint.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (x) => { const t = clamp(x, 0, 1); return 1 - (1 - t) * (1 - t); };
const easeIn = (x) => { const t = clamp(x, 0, 1); return t * t; };
const damp = (dt, rate) => 1 - Math.exp(-rate * Math.max(0, dt));

const FP_BONES = ['armL', 'foreArmL', 'handL', 'fingersL', 'armR', 'foreArmR', 'handR', 'fingersR'];
/** Omuz noktasının kamera uzayındaki konumu (x dışa, y aşağı, z ileri = -z). */
export const SHOULDER = { x: 0.25, y: -0.25, z: -0.1 };
const DEPTH_K = 0.1;

/* ------------------------------------------------------------------------------------------------
 * Poz hesabı (saf)
 * ---------------------------------------------------------------------------------------------- */
export const SWING_DURATION = { mine: 0.3, attack: 0.38, slash: 0.38, place: 0.24, punch: 0.28, fire: 0.22, release: 0.3, use: 0.4 };
export const HOLD_STANCE = {
  none: { x: 1.1, z: -0.12, f: 0.5, h: -0.1 },
  tool: { x: 1.15, z: -0.1, f: 0.6, h: -0.15 },
  sword: { x: 1.1, z: -0.1, f: 0.7, h: -0.2 },
  block: { x: 1.2, z: -0.14, f: 0.55, h: -0.1 },
  torch: { x: 1.25, z: -0.1, f: 0.6, h: -0.2 },
  gun: { x: 1.35, z: -0.06, f: 0.35, h: -0.1 },
  food: { x: 1.2, z: -0.14, f: 0.55, h: -0.1 },
  shield: { x: 1.2, z: -0.14, f: 0.55, h: -0.1 },
  bow: { x: 1.2, z: -0.1, f: 0.6, h: -0.1 },
};

/** Boş bir poz çıkışı. */
export function createFpPose() {
  return {
    R: { x: 0, y: 0, z: 0, f: 0, h: 0, g: 0 }, // sağ: kol x/y/z, önkol x, el x, parmak kıvrımı
    L: { x: 0, y: 0, z: 0, f: 0, h: 0, g: 0 },
    root: { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 },
    item: { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0 },
    flashAmount: 0,
    bowW: 0, // yay çekerken sağ el IK ağırlığı
    eatW: 0, // yerken el-ağız IK ağırlığı
  };
}

/**
 * İki kemikli IK (saf): omuz orijinde, hedef (tx,ty,tz) ve dirsek yönü ipucu (px,py,pz). a: üst kol, b: ön kol uzunluğu.
 * Sonuç out: {x,y,z (kol XYZ Euler), f (dirsek bükümü), reach (0..1 erişim oranı)}. Dirsek ekseni = kolun yerel +x'i.
 */
export function solveTwoBone(out, tx, ty, tz, px, py, pz, a, b) {
  let dist = Math.hypot(tx, ty, tz);
  const lo = Math.abs(a - b) + 0.01;
  const hi = a + b - 0.005;
  const reach = clamp((dist - lo) / (hi - lo), 0, 1);
  dist = clamp(dist, lo, hi);
  const vx = dist > 1e-6 ? tx / Math.hypot(tx, ty, tz) : 0;
  const vy = dist > 1e-6 ? ty / Math.hypot(tx, ty, tz) : -1;
  const vz = dist > 1e-6 ? tz / Math.hypot(tx, ty, tz) : 0;
  // ipucunun v'ye dik bileşeni
  let dp = px * vx + py * vy + pz * vz;
  let ox = px - dp * vx;
  let oy = py - dp * vy;
  let oz = pz - dp * vz;
  let ol = Math.hypot(ox, oy, oz);
  if (ol < 1e-6) { ox = 0; oy = -1; oz = 0; dp = 0; ol = 1; }
  ox /= ol; oy /= ol; oz /= ol;
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // dirsek
  const ex = a * (cosA * vx + sinA * ox);
  const ey = a * (cosA * vy + sinA * oy);
  const ez = a * (cosA * vz + sinA * oz);
  const d1l = Math.hypot(ex, ey, ez) || 1;
  const d1x = ex / d1l; const d1y = ey / d1l; const d1z = ez / d1l;
  let d2x = vx * dist - ex; let d2y = vy * dist - ey; let d2z = vz * dist - ez;
  const d2l = Math.hypot(d2x, d2y, d2z) || 1;
  d2x /= d2l; d2y /= d2l; d2z /= d2l;
  const cf = clamp(d1x * d2x + d1y * d2y + d1z * d2z, -1, 1);
  out.f = Math.acos(cf);
  // d2'nin d1'e dik bileşeni → ön kolun bükülme düzlemi
  let ux = d2x - cf * d1x; let uy = d2y - cf * d1y; let uz = d2z - cf * d1z;
  let ul = Math.hypot(ux, uy, uz);
  if (ul < 1e-6) { ux = -ox; uy = -oy; uz = -oz; ul = 1; }
  ux /= ul; uy /= ul; uz /= ul;
  // kol çerçevesi: Y_a = -d1, Z_a = -u, X_a = Y_a × Z_a
  const Yx = -d1x; const Yy = -d1y; const Yz = -d1z;
  const Zx = -ux; const Zy = -uy; const Zz = -uz;
  const Xx = Yy * Zz - Yz * Zy;
  // XYZ Euler (three): y = asin(m13), x = atan2(-m23, m33), z = atan2(-m12, m11)
  out.y = Math.asin(clamp(Zx, -1, 1));
  if (Math.abs(Zx) < 0.9999999) {
    out.x = Math.atan2(-Zy, Zz);
    out.z = Math.atan2(-Yx, Xx);
  } else {
    out.x = Math.atan2(Yz, Yy);
    out.z = 0;
  }
  out.reach = reach;
  return out;
}

/**
 * Hedef pozu hesaplar. p: {t, bobPhase, bobAmp, sprint 0..1, crouch 0..1, air 0..1, hold, miningK (-1 yok), swing {kind,k}|null,
 *   bowCharge, nocked, eatK (-1 yok), reduce 0..1 (hareket ölçeği), turnYaw, turnPitch}
 */
export function computeFpPose(out, p) {
  const st = HOLD_STANCE[p.hold] || HOLD_STANCE.none;
  const rd = p.reduce === undefined ? 1 : p.reduce;
  const R = out.R;
  const L = out.L;
  const rt = out.root;
  const it = out.item;
  // sıfırla
  R.x = st.x; R.y = 0; R.z = st.z; R.f = st.f; R.h = st.h; R.g = p.hold === 'none' ? 0.35 : 1.15;
  L.x = 0.15; L.y = 0; L.z = 0.1; L.f = 0.25; L.h = 0; L.g = 0.3; // sol kol varsayılan: aşağıda (görünmez)
  rt.px = 0; rt.py = 0; rt.pz = 0; rt.rx = 0; rt.ry = 0; rt.rz = 0;
  it.px = 0; it.py = 0; it.pz = 0; it.rx = 0; it.ry = 0; it.rz = 0;
  out.flashAmount = 0;
  out.bowW = 0;
  out.eatW = 0;

  if (p.hold === 'none') {
    // boş el: iki kol görünür
    L.x = st.x; L.z = -st.z; L.f = st.f; L.h = st.h;
    L.y = 0.05; R.y = -0.05;
  }
  if (p.hold === 'bow') {
    L.x = 1.5; L.z = 0.08; L.f = 0.1; L.h = -0.1; L.g = 1.1;
  }
  if (p.hold === 'shield') {
    L.x = 1.3; L.z = 0.3; L.f = 0.9; L.h = 0; L.g = 1.1;
  }

  // nefes ve hafif sallanma
  const br = Math.sin(p.t * 1.9);
  rt.py += br * 0.0025 * rd;
  R.x += br * 0.012 * rd;
  L.x += br * 0.012 * rd;
  rt.rz += Math.sin(p.t * 0.9) * 0.004 * rd;

  // yürüme salınımı
  const a = p.bobAmp * rd;
  if (a > 0.001) {
    const ph = p.bobPhase;
    rt.py += -Math.abs(Math.sin(ph)) * 0.026 * a * (1 + p.sprint * 0.5);
    rt.px += Math.cos(ph) * 0.016 * a;
    rt.rz += Math.cos(ph) * 0.04 * a;
    rt.rx += Math.sin(ph * 2) * 0.012 * a;
    R.x += Math.sin(ph) * 0.05 * a;
    L.x += -Math.sin(ph) * 0.05 * a;
  }
  // koşu eğimi
  if (p.sprint > 0.01 && p.hold !== 'bow') {
    rt.rx += 0.34 * p.sprint;
    rt.py += -0.07 * p.sprint;
    rt.px += 0.03 * p.sprint;
    rt.rz += -0.1 * p.sprint;
    R.x -= 0.16 * p.sprint;
    R.f += 0.3 * p.sprint;
  }
  rt.py += -0.05 * p.crouch;
  rt.py += 0.02 * p.air;
  rt.rx += -0.03 * p.air;
  // fare dönüşü gecikmesi
  rt.ry += clamp((p.turnYaw || 0) * -0.02, -0.12, 0.12) * rd;
  rt.rx += clamp((p.turnPitch || 0) * 0.02, -0.1, 0.1) * rd;

  // yay: kiriş çekme
  if (p.hold === 'bow') {
    const e = easeOut(p.bowCharge || 0);
    R.x = lerp(R.x, 1.38, e);
    R.z = lerp(R.z, -0.55, e);
    R.f = lerp(R.f, 1.75, e);
    R.h = lerp(R.h, -0.35, e);
    R.g = lerp(0.3, 0.7, e);
    rt.rx += -0.03 * e;
    if (e > 0.92) rt.px += Math.sin(p.t * 40) * 0.0016;
    out.bowW = ease(Math.min(1, (p.bowCharge || 0) * 2.5));
  }

  // yeme
  if (p.eatK >= 0) {
    const k = p.eatK;
    const up = ease(Math.min(1, k * 4)) * (1 - ease((k - 0.9) * 10));
    R.x = lerp(R.x, 1.7, up);
    R.z = lerp(R.z, -0.55, up);
    R.f = lerp(R.f, 2.1, up);
    R.h = lerp(R.h, -0.5, up);
    out.eatW = up;
    const chew = Math.sin(k * Math.PI * 12) * 0.012 * up;
    it.py += chew;
    it.pz += chew * 0.8;
  }

  // kırma döngüsü (basılı tutarken)
  if (p.miningK >= 0 && !p.swing) {
    applyMine(out, p.miningK, p.hold);
  }
  // tek seferlik darbe/eylem
  if (p.swing) applySwing(out, p.swing.kind, p.swing.k, p.hold);
}

function applyMine(out, k, hold) {
  const R = out.R;
  const rt = out.root;
  let a;
  let f;
  let tw;
  if (k < 0.36) { const u = easeOut(k / 0.36); a = lerp(R.x, 2.05, u); f = lerp(R.f, 1.35, u); tw = lerp(0, 0.1, u); }
  else if (k < 0.58) { const u = easeIn((k - 0.36) / 0.22); a = lerp(2.05, 0.8, u); f = lerp(1.35, 0.3, u); tw = lerp(0.1, -0.1, u); }
  else { const u = ease((k - 0.58) / 0.42); a = lerp(0.8, R.x, u); f = lerp(0.3, R.f, u); tw = lerp(-0.1, 0, u); }
  const strike = k >= 0.36 && k < 0.7 ? 1 - Math.abs((k - 0.48) / 0.22) : 0;
  R.x = a;
  R.f = f;
  R.h = -0.1 - 0.45 * strike;
  rt.ry += tw;
  rt.rx += -0.1 * strike;
  rt.pz += -0.03 * strike;
  if (hold === 'gun') { R.x = lerp(R.x, 1.35, 0.7); }
}

function applySwing(out, kind, k, hold) {
  const R = out.R;
  const rt = out.root;
  const it = out.item;
  if (kind === 'mine') { applyMine(out, k, hold); return; }
  if (kind === 'attack' || kind === 'slash') {
    let z;
    let x;
    let tw;
    if (k < 0.3) { const u = easeOut(k / 0.3); z = lerp(R.z, 0.7, u); x = lerp(R.x, 1.55, u); tw = lerp(0, -0.18, u); }
    else if (k < 0.6) { const u = easeIn((k - 0.3) / 0.3); z = lerp(0.7, -0.95, u); x = lerp(1.55, 1.25, u); tw = lerp(-0.18, 0.22, u); }
    else { const u = ease((k - 0.6) / 0.4); z = lerp(-0.95, R.z, u); x = lerp(1.25, R.x, u); tw = lerp(0.22, 0, u); }
    const strike = k >= 0.3 && k < 0.62 ? 1 : 0;
    R.z = z;
    R.x = x;
    R.f = lerp(R.f, 0.4, strike);
    rt.ry += tw;
    rt.rz += tw * 0.6;
    it.rz += strike * -0.4;
    return;
  }
  if (kind === 'place' || kind === 'punch' || kind === 'use') {
    const th = k < 0.38 ? easeOut(k / 0.38) : 1 - ease((k - 0.38) / 0.62);
    R.x += 0.4 * th;
    R.f = lerp(R.f, 0.25, th);
    rt.pz += -0.09 * th;
    rt.py += 0.02 * th;
    rt.rx += -0.06 * th;
    if (kind === 'punch') { R.g = 0.95; rt.ry += 0.05 * th; }
    return;
  }
  if (kind === 'fire') {
    const kick = k < 0.18 ? easeOut(k / 0.18) : 1 - ease((k - 0.18) / 0.82);
    rt.pz += 0.065 * kick;
    rt.rx += 0.16 * kick;
    R.x += 0.08 * kick;
    it.rx += 0.2 * kick;
    out.flashAmount = k < 0.3 ? 1 - k / 0.3 : 0;
    return;
  }
  if (kind === 'release') {
    const kick = k < 0.2 ? easeOut(k / 0.2) : 1 - ease((k - 0.2) / 0.8);
    R.z = lerp(R.z, -0.1, kick);
    R.f = lerp(R.f, 0.4, kick);
    rt.pz += 0.03 * kick;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Viewmodel malzemesi: derinlik sıkıştırma + kendi ışığı
 * ---------------------------------------------------------------------------------------------- */
function createLightUniforms() {
  return {
    uFpDepth: { value: DEPTH_K },
    uFpAmb: { value: new THREE.Vector3(0.6, 0.6, 0.62) },
    uFpSun: { value: new THREE.Vector3(0.8, 0.75, 0.65) },
    uFpSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uFpUp: { value: new THREE.Vector3(0, 1, 0) },
    uFpSky: { value: new THREE.Vector3(0.45, 0.6, 0.85) },
    uFpGround: { value: new THREE.Vector3(0.28, 0.24, 0.2) },
    uFpFlash: { value: new THREE.Vector3(0, 0, 0) },
    uSssColor: { value: new THREE.Color(1.0, 0.42, 0.3) },
  };
}

const VM_FRAG = `
{
  vec3 fpN = normalize(normal);
  vec3 fpV = normalize(vViewPosition);
  float fpNdl = max(dot(fpN, uFpSunDir), 0.0);
  float fpWrap = max((dot(fpN, uFpSunDir) + 0.35) / 1.35, 0.0);
  vec3 fpL = diffuseColor.rgb * (uFpAmb + uFpSun * mix(fpNdl, fpWrap, 0.5));
  float fpRim = pow(1.0 - clamp(dot(fpN, fpV), 0.0, 1.0), 3.0);
  fpL += diffuseColor.rgb * uFpSun * 0.22 * fpRim;
  vec3 fpH = normalize(uFpSunDir + fpV);
  float fpGloss = 1.0 - roughnessFactor;
  float fpSpec = pow(max(dot(fpN, fpH), 0.0), mix(6.0, 120.0, fpGloss)) * (0.15 + fpGloss * 0.85);
  fpL += uFpSun * fpSpec * mix(vec3(1.0), diffuseColor.rgb, metalnessFactor) * 0.55;
  vec3 fpR = reflect(-fpV, fpN);
  float fpUp = dot(fpR, uFpUp) * 0.5 + 0.5;
  fpL += mix(uFpGround, uFpSky, fpUp) * diffuseColor.rgb * (0.05 + metalnessFactor * 0.55 + fpGloss * 0.1);
  fpL += uFpFlash * (0.4 + 0.6 * fpNdl);
  SSS_PLACEHOLDER
  outgoingLight = fpL + totalEmissiveRadiance;
}
#include <opaque_fragment>`;

/** Bir malzemeyi viewmodel'e çevirir (köşe derinlik sıkıştırma + ışık). skin: ten alt-yüzey parıltısı (aSkin). */
function patchViewmodel(mat, U, skin) {
  const isLit = !!mat.isMeshStandardMaterial;
  const glint = isLit && !!(mat.userData && mat.userData.kxGlint); // büyülü eşya: render/enchantGlint parıltısı
  mat.onBeforeCompile = (shader) => {
    Object.keys(U).forEach((k) => { shader.uniforms[k] = U[k]; });
    if (glint) bindGlintUniforms(shader.uniforms);
    let vs = shader.vertexShader;
    vs = vs.replace('#include <common>', '#include <common>\nuniform float uFpDepth;' + (skin ? '\nattribute float aSkin;\nvarying float vSkin;' : ''));
    if (skin) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin;');
    vs = vs.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position.z = gl_Position.z * uFpDepth - gl_Position.w * (1.0 - uFpDepth);');
    shader.vertexShader = vs;
    if (isLit) {
      const sss = skin ? 'fpL += diffuseColor.rgb * uSssColor * vSkin * (0.05 + 0.4 * fpRim) * (0.4 + 0.6 * (uFpAmb.r + uFpSun.r));' : '';
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uFpAmb;\nuniform vec3 uFpSun;\nuniform vec3 uFpSunDir;\nuniform vec3 uFpUp;\nuniform vec3 uFpSky;\nuniform vec3 uFpGround;\nuniform vec3 uFpFlash;\nuniform vec3 uSssColor;' + (skin ? '\nvarying float vSkin;' : '') + (glint ? '\n' + GLINT_DECL : ''))
        .replace('#include <opaque_fragment>', VM_FRAG.replace('SSS_PLACEHOLDER', sss).replace('#include <opaque_fragment>', (glint ? GLINT_FRAG + '\n' : '') + '#include <opaque_fragment>'));
    }
  };
  mat.customProgramCacheKey = () => 'kesif-viewmodel-' + (isLit ? 'l' : 'b') + (skin ? 's' : '') + (glint ? 'g' : '');
  mat.depthWrite = mat.depthWrite !== false;
  return mat;
}

/* ------------------------------------------------------------------------------------------------
 * createFirstPerson
 * ---------------------------------------------------------------------------------------------- */
export function createFirstPerson(_THREE, camera, opts = {}) {
  const detail = opts.detail === 'low' ? 'low' : 'high';
  const U = createLightUniforms();
  const group = new THREE.Group();
  group.name = 'kesifFirstPerson';
  group.renderOrder = 1000;
  group.frustumCulled = false;
  const armsRoot = new THREE.Group();
  armsRoot.name = 'fpArms';
  group.add(armsRoot);
  if (camera) camera.add(group);

  const bones = {};
  FP_BONES.forEach((n) => { bones[n] = new THREE.Bone(); bones[n].name = n; });
  const sockets = { R: new THREE.Object3D(), L: new THREE.Object3D() };
  let meshes = [];
  let skeleton = null;
  let ownedMats = [];
  const fpMats = new Map(); // özgün malzeme → viewmodel klonu
  let disposed = false;
  let currentCfgKey = '';

  const matBody = patchViewmodel(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0 }), U, true);
  const matGloss = patchViewmodel(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0 }), U, false);
  ownedMats = [matBody, matGloss];

  // iskelet hiyerarşisi (dinlenme: kollar aşağı sarkar)
  const skelRoot = new THREE.Group();
  armsRoot.add(skelRoot);
  skelRoot.add(bones.armL, bones.armR);
  bones.armL.add(bones.foreArmL);
  bones.foreArmL.add(bones.handL);
  bones.handL.add(bones.fingersL);
  bones.armR.add(bones.foreArmR);
  bones.foreArmR.add(bones.handR);
  bones.handR.add(bones.fingersR);
  bones.handR.add(sockets.R);
  bones.handL.add(sockets.L);
  sockets.R.position.fromArray(HAND_SOCKET.R);
  sockets.L.position.fromArray(HAND_SOCKET.L);

  function buildArmsMesh(cfg) {
    const ctx = makeContext(cfg, detail);
    const key = JSON.stringify(ctx.cfg);
    if (key === currentCfgKey) return;
    currentCfgKey = key;
    // kollar kamera uzayında omuz genişliğinde dursun: ortak ölçüleri değiştirmeden kopyala
    ctx.d = { ...ctx.d, shX: SHOULDER.x };
    const d = ctx.d;
    const side = (n, s) => {
      bones['arm' + n].position.set(s * SHOULDER.x, d.shY, 0);
      bones['foreArm' + n].position.set(0, d.elbowY - d.shY, 0);
      bones['hand' + n].position.set(0, d.wristY - d.elbowY, 0);
      bones['fingers' + n].position.set(0, d.knuckleY - d.wristY, 0);
    };
    side('L', -1);
    side('R', 1);
    // kemik zinciri ve ağ, omuz hizasına göre aşağı kaydırılır; armsRoot omuz hizasında döner
    skelRoot.position.set(0, -d.shY, 0);
    const b = new SkinBuilder(FP_BONES);
    buildArms(b, ctx);
    buildArmWear(b, ctx);
    const geo = b.build();
    meshes.forEach((m) => { armsRoot.remove(m); m.geometry.dispose(); });
    meshes = [];
    if (skeleton) skeleton.dispose();
    const worldY = { arm: d.shY, foreArm: d.elbowY, hand: d.wristY, fingers: d.knuckleY };
    const inverses = FP_BONES.map((n) => {
      const s = n.endsWith('L') ? -1 : 1;
      const part = n.slice(0, n.length - 1);
      return new THREE.Matrix4().makeTranslation(-s * SHOULDER.x, -worldY[part], 0);
    });
    skeleton = new THREE.Skeleton(FP_BONES.map((n) => bones[n]), inverses);
    const identity = new THREE.Matrix4();
    ['body', 'gloss'].forEach((k) => {
      if (!geo[k]) return;
      const m = new THREE.SkinnedMesh(geo[k], k === 'body' ? matBody : matGloss);
      m.name = 'fp_' + k;
      m.position.set(0, -d.shY, 0);
      m.bind(skeleton, identity);
      m.frustumCulled = false;
      m.renderOrder = 1000;
      armsRoot.add(m);
      meshes.push(m);
    });
    armsRoot.updateMatrixWorld(true);
  }

  /* ---- elde eşya ---- */
  let held = null;
  let heldKey = null;
  let holdKind = 'none';
  let heldKindName = '';
  const flashGroup = new THREE.Group();
  flashGroup.visible = false;
  {
    const fm = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    patchViewmodel(fm, U, false);
    ownedMats.push(fm);
    const plane = new THREE.PlaneGeometry(0.16, 0.16);
    const plane2 = plane.clone();
    plane2.rotateY(Math.PI / 2);
    const core = new THREE.SphereGeometry(0.035, 8, 6);
    const fmC = fm.clone();
    fmC.color.set(0xffffff);
    patchViewmodel(fmC, U, false);
    ownedMats.push(fmC);
    flashGroup.add(new THREE.Mesh(plane, fm), new THREE.Mesh(plane2, fm), new THREE.Mesh(core, fmC));
    flashGroup.userData.geos = [plane, plane2, core];
  }
  const torchLight = new THREE.PointLight(0xffa24a, 0, 9, 2);
  torchLight.name = 'fpTorchLight';
  torchLight.position.set(0.25, -0.1, -0.5);
  group.add(torchLight);

  function viewmodelize(model) {
    model.traverse((o) => {
      if (!o.isMesh) return;
      const orig = o.material;
      let c = fpMats.get(orig);
      if (!c) {
        c = patchViewmodel(orig.clone(), U, false);
        fpMats.set(orig, c);
      }
      o.material = c;
      o.renderOrder = 1001;
      o.frustumCulled = false;
    });
  }

  let skins = null; // Keşif mağaza görünümü kümesi; viewmodel malzemeleri klonlandığı için ton döngüsü (anim) kapalı: ilk renk sabit

  function setHeld(itemKey, force) {
    if (disposed) return;
    if (itemKey === heldKey && held && !force) return;
    if (held) {
      if (held.parent) held.parent.remove(held);
      if (flashGroup.parent) flashGroup.parent.remove(flashGroup);
      disposeHeldItemModel(held);
      held = null;
    }
    heldKey = itemKey || null;
    holdKind = 'none';
    heldKindName = '';
    if (!itemKey) return;
    const model = createHeldItemModel(THREE, itemKey, undefined, skins);
    if (!model) return;
    viewmodelize(model);
    const pl = getHeldPlacement(model, 'fp');
    const sock = pl.hand === 'L' ? sockets.L : sockets.R;
    sock.add(model);
    model.position.fromArray(pl.pos);
    model.quaternion.fromArray(pl.quat);
    model.scale.setScalar(pl.scale);
    held = model;
    holdKind = pl.hold;
    heldKindName = pl.kind;
    if (model.userData.muzzle) {
      model.userData.muzzle.add(flashGroup);
      flashGroup.position.set(0, 0, 0);
    }
  }

  /* ---- animasyon durumu ---- */
  const target = createFpPose();
  const cur = createFpPose();
  let time = 0;
  let bobPhase = 0;
  let bobAmp = 0;
  let sprintK = 0;
  let crouchK = 0;
  let airK = 0;
  let miningT = 0;
  let swingKind = null;
  let swingT = 0;
  let swingDur = 0.3;
  let flashT = 0;
  let eatK = -1;
  let bowCharge = 0;
  let nockedNow = false;
  let turnYaw = 0;
  let turnPitch = 0;
  const params = {
    t: 0, bobPhase: 0, bobAmp: 0, sprint: 0, crouch: 0, air: 0, hold: 'none', miningK: -1, swing: null,
    bowCharge: 0, nocked: false, eatK: -1, reduce: 1, turnYaw: 0, turnPitch: 0,
  };
  const swingObj = { kind: '', k: 0 };
  const _q = new THREE.Quaternion();
  const _v = new THREE.Vector3();
  const _sunDir = new THREE.Vector3(0.35, 0.8, 0.45).normalize();

  buildArmsMesh(opts.avatarConfig);
  setPose(true);

  function applyChannels(side, c) {
    const arm = bones['arm' + side];
    const fore = bones['foreArm' + side];
    const hand = bones['hand' + side];
    const fing = bones['fingers' + side];
    arm.rotation.set(c.x, c.y, c.z);
    fore.rotation.set(c.f, 0, 0);
    hand.rotation.set(c.h, 0, 0);
    fing.rotation.set(0, 0, (side === 'L' ? 1 : -1) * c.g);
  }

  function setPose(snap) {
    if (snap) {
      computeFpPose(target, { ...params, hold: holdKind });
      copyPose(cur, target);
    }
    applyChannels('R', cur.R);
    applyChannels('L', cur.L);
    const r = cur.root;
    armsRoot.position.set(r.px, SHOULDER.y + r.py, SHOULDER.z + r.pz);
    armsRoot.rotation.set(r.rx, r.ry, r.rz);
    if (held) {
      const pl = getHeldPlacement(held, 'fp');
      held.position.set(pl.pos[0] + cur.item.px, pl.pos[1] + cur.item.py, pl.pos[2] + cur.item.pz);
      _q.set(pl.quat[0], pl.quat[1], pl.quat[2], pl.quat[3]);
      held.quaternion.copy(_q);
      held.rotateX(cur.item.rx);
      held.rotateY(cur.item.ry);
      held.rotateZ(cur.item.rz);
    }
  }

  function copyPose(dst, src) {
    ['R', 'L'].forEach((s) => Object.keys(dst[s]).forEach((k) => { dst[s][k] = src[s][k]; }));
    Object.keys(dst.root).forEach((k) => { dst.root[k] = src.root[k]; });
    Object.keys(dst.item).forEach((k) => { dst.item[k] = src.item[k]; });
  }
  function dampPose(dt, rate) {
    const k = damp(dt, rate);
    ['R', 'L'].forEach((s) => Object.keys(cur[s]).forEach((key) => { cur[s][key] += (target[s][key] - cur[s][key]) * k; }));
    Object.keys(cur.root).forEach((key) => { cur.root[key] += (target.root[key] - cur.root[key]) * k; });
    Object.keys(cur.item).forEach((key) => { cur.item[key] += (target.item[key] - cur.item[key]) * k; });
  }

  function updateLight(st) {
    const sky = clamp(st.skyLight === undefined ? 1 : st.skyLight, 0, 1);
    const blk = clamp(st.blockLight === undefined ? 0 : st.blockLight, 0, 1);
    const torch = heldKindName === 'torch' || heldKindName === 'lantern';
    const bl = Math.max(blk, torch ? 0.75 : 0);
    // ortam + güneş + blok ışığı
    const floor = 0.1;
    const ambR = floor + 0.36 * sky + 0.3 * bl;
    const ambG = floor + 0.38 * sky + 0.22 * bl;
    const ambB = floor + 0.45 * sky + 0.12 * bl;
    const under = st.underwater ? 1 : 0;
    U.uFpAmb.value.set(ambR * (1 - 0.35 * under), ambG * (1 - 0.15 * under), ambB * (1 + 0.1 * under));
    U.uFpSun.value.set(0.66 * sky, 0.62 * sky, 0.54 * sky).multiplyScalar(1 - 0.4 * under);
    U.uFpSky.value.set(0.4 * sky + 0.05, 0.55 * sky + 0.06, 0.85 * sky + 0.08);
    U.uFpGround.value.set(0.25 * sky + 0.12 * bl, 0.22 * sky + 0.08 * bl, 0.18 * sky + 0.04 * bl);
    // güneş yönü dünya → kamera uzayı
    if (st.sunDir) _sunDir.set(st.sunDir.x, st.sunDir.y, st.sunDir.z).normalize();
    if (camera) {
      camera.getWorldQuaternion(_q).invert();
      U.uFpSunDir.value.copy(_sunDir).applyQuaternion(_q);
      U.uFpUp.value.set(0, 1, 0).applyQuaternion(_q);
    } else {
      U.uFpSunDir.value.copy(_sunDir);
    }
    // meşale titreşimi
    if (torch) {
      const f = 0.85 + 0.12 * Math.sin(time * 13) + 0.07 * Math.sin(time * 29 + 1.7) + 0.04 * Math.sin(time * 47);
      torchLight.intensity = 3.2 * f;
      torchLight.position.set(0.22 + Math.sin(time * 5) * 0.01, -0.02, -0.45);
      const fl = 0.9 + 0.1 * Math.sin(time * 11);
      U.uFpAmb.value.x += 0.12 * fl; U.uFpAmb.value.y += 0.07 * fl;
    } else {
      torchLight.intensity = 0;
    }
    // ateş/namlu parlaması
    const fa = flashT > 0 ? flashT / 0.07 : 0;
    U.uFpFlash.value.set(0.35 * fa, 0.6 * fa, 0.8 * fa);
    flashGroup.visible = flashT > 0 && heldKindName !== '';
    if (flashGroup.visible) {
      flashGroup.rotation.z = time * 40;
      flashGroup.scale.setScalar(0.8 + 0.5 * fa);
    }
  }

  function update(dt, state) {
    if (disposed) return;
    const st = state || {};
    dt = clamp(dt, 0, 0.1);
    time += dt;
    const reduce = st.reducedMotion || opts.reducedMotion ? 0.35 : 1;
    const speed = Math.max(0, st.speed || 0);
    const grounded = st.onGround !== false;
    const moving = grounded && !st.swimming ? clamp(speed / 4.3, 0, 1.4) : st.swimming ? clamp(speed / 3, 0, 0.7) : 0;
    bobAmp += (moving - bobAmp) * damp(dt, 9);
    bobPhase += dt * (speed > 0.2 ? 5.2 + speed * 1.45 : 0) * (grounded ? 1 : 0.2);
    sprintK += ((st.sprint && speed > 3.5 ? 1 : 0) - sprintK) * damp(dt, 8);
    crouchK += ((st.crouch ? 1 : 0) - crouchK) * damp(dt, 10);
    airK += ((grounded ? 0 : 1) - airK) * damp(dt, 8);
    turnYaw += ((st.yawRate || 0) - turnYaw) * damp(dt, 10);
    turnPitch += ((st.pitchRate || 0) - turnPitch) * damp(dt, 10);
    eatK = st.eating === undefined || st.eating === null ? -1 : st.eating;
    bowCharge = clamp(st.bowCharge || 0, 0, 1);
    nockedNow = !!st.nocked || bowCharge > 0;
    if (st.breaking) miningT = (miningT + dt / 0.46) % 1;
    else miningT = 0;
    if (swingKind) {
      swingT += dt / swingDur;
      if (swingT >= 1) { swingKind = null; swingT = 0; }
    }
    if (flashT > 0) flashT = Math.max(0, flashT - dt);

    params.t = time;
    params.bobPhase = bobPhase;
    params.bobAmp = bobAmp;
    params.sprint = sprintK;
    params.crouch = crouchK;
    params.air = airK;
    params.hold = holdKind;
    params.miningK = st.breaking ? miningT : -1;
    if (swingKind) { swingObj.kind = swingKind; swingObj.k = swingT; params.swing = swingObj; } else params.swing = null;
    params.bowCharge = bowCharge;
    params.eatK = eatK;
    params.reduce = reduce;
    params.turnYaw = turnYaw;
    params.turnPitch = turnPitch;
    computeFpPose(target, params);
    dampPose(dt, swingKind || st.breaking ? 34 : eatK >= 0 ? 16 : 14);
    setPose(false);
    applyIK();

    // yay: kiriş + ok
    if (held && held.userData.bow) held.userData.bow.setDraw(bowCharge, nockedNow);
    if (held && held.userData.update) held.userData.update(time, dt);
    if (swingKind === 'fire' && swingT < 0.02) flashT = 0.07;
    updateLight(st);
  }

  const _ik = { x: 0, y: 0, z: 0, f: 0, reach: 0 };
  const _t = new THREE.Vector3();
  const ARM_A = 0.30;
  const ARM_B = 0.26;
  /** Yay çekme ve yeme: sağ el hedefe iki kemikli IK ile götürülür (ağırlıkla karıştırılır). */
  function applyIK() {
    const wBow = held && held.userData.bow ? target.bowW : 0;
    const wEat = target.eatW;
    if (wBow < 0.01 && wEat < 0.01) return;
    armsRoot.updateWorldMatrix(true, true);
    let w = 0;
    if (wBow >= wEat && held && held.userData.bow) {
      held.userData.bow.bead.getWorldPosition(_t);
      armsRoot.worldToLocal(_t);
      _t.z += 0.06;
      w = wBow;
    } else {
      group.updateWorldMatrix(true, false);
      _t.set(0.03, -0.15, -0.3);
      group.localToWorld(_t);
      armsRoot.worldToLocal(_t);
      w = wEat;
    }
    solveTwoBone(_ik, _t.x - SHOULDER.x, _t.y, _t.z, 0.9, -0.5, 0.35, ARM_A, ARM_B);
    const arm = bones.armR;
    const fore = bones.foreArmR;
    arm.rotation.set(lerp(arm.rotation.x, _ik.x, w), lerp(arm.rotation.y, _ik.y, w), lerp(arm.rotation.z, _ik.z, w));
    fore.rotation.x = lerp(fore.rotation.x, _ik.f, w);
    armsRoot.updateWorldMatrix(false, true);
  }

  function swing(kind) {
    if (disposed) return;
    const k = SWING_DURATION[kind] ? kind : 'mine';
    swingKind = k;
    swingT = 0;
    swingDur = SWING_DURATION[k];
    if (k === 'fire') flashT = 0.07;
  }

  function setSkin(config) {
    if (disposed) return;
    buildArmsMesh(config);
    setPose(true);
  }

  function setVisible(v) {
    group.visible = !!v;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (held) {
      if (held.parent) held.parent.remove(held);
      disposeHeldItemModel(held);
      held = null;
    }
    meshes.forEach((m) => { armsRoot.remove(m); m.geometry.dispose(); });
    meshes = [];
    if (skeleton) { skeleton.dispose(); skeleton = null; }
    ownedMats.forEach((m) => m.dispose());
    fpMats.forEach((m) => m.dispose());
    fpMats.clear();
    (flashGroup.userData.geos || []).forEach((g) => g.dispose());
    torchLight.dispose && torchLight.dispose();
    if (group.parent) group.parent.remove(group);
  }

  return {
    group,
    update,
    setHeld,
    setSkins(set) {
      if (disposed) return;
      const next = set && set.key ? Object.freeze(Object.assign({}, set, { anim: false, key: set.key.replace('+a', '') })) : null;
      if ((next ? next.key : '') === (skins ? skins.key : '')) return;
      skins = next;
      if (heldKey) setHeld(heldKey, true);
    },
    swing,
    setSkin,
    setVisible,
    dispose,
    light: torchLight,
    get held() { return held; },
    get holdKind() { return holdKind; },
    /** Test/teşhis: mevcut kol dönüşleri. */
    get pose() { return cur; },
    uniforms: U,
  };
}
