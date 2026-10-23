/*
 * KEŞİF render — büyü parıltısı (enchant glint): büyülü eşyaların üzerinde akan mor ışıltı.
 *
 *   GLINT_SUFFIX            '#e'  → model anahtarına eklenir ('item:kılıç_demir#e'); createHeldItemModel eki ayıklayıp parıltı uygular
 *   isGlintKey(k) · baseKey(k) · glintKey(k, on)
 *   glintMaterial(mat)      MeshStandardMaterial → paylaşılan, önbellekli parıltılı klon (diğer malzemeler olduğu gibi döner)
 *   applyGlint(model)       modelin tüm mesh malzemelerini parıltılı klonlarla değiştirir (modele özel kaynak üretmez)
 *   setGlintTime(sec, calm) tek paylaşılan uniform: zaman (kısıtlı harekette durağan, düşük şiddet)
 *   GLINT_FRAG              fragment kod parçası (outgoingLight'a ekler); viewmodel gölgelendiricisi de kullanır
 *
 * Parıltı, eşyanın görünüm uzayı konumundan (vViewPosition) çapraz kayan iki bant + yavaş soluk bir mor taban üretir; her mesh
 * aynı uniform'u paylaşır, bu yüzden tek bir değer tüm büyülü eşyaları sürer (kare başı ayırma yok). Işıksız (basic) malzemeler
 * (ateş, çekirdek, halo) dokunulmadan kalır.
 */
export const GLINT_SUFFIX = '#e';
export const GLINT_COLOR = 0xa86bff;

export function isGlintKey(k) {
  return typeof k === 'string' && k.length > GLINT_SUFFIX.length && k.slice(-GLINT_SUFFIX.length) === GLINT_SUFFIX;
}
export function baseKey(k) {
  return isGlintKey(k) ? k.slice(0, k.length - GLINT_SUFFIX.length) : k;
}
export function glintKey(k, on) {
  return k && on && !isGlintKey(k) ? k + GLINT_SUFFIX : k;
}

const uniforms = {
  uGlintT: { value: 0 },
  uGlintK: { value: 1 },
};

/** Zaman (sn) ve kısıtlı hareket: calm=true → bantlar durur, taban hafif sabit. */
export function setGlintTime(sec, calm) {
  uniforms.uGlintT.value = calm ? 0.35 : sec % 1000;
  uniforms.uGlintK.value = calm ? 0.55 : 1;
}

export const GLINT_DECL = 'uniform float uGlintT;\nuniform float uGlintK;';
/** outgoingLight tanımlandıktan sonra çalışır. */
export const GLINT_FRAG = `
  {
    vec3 gkP = vViewPosition;
    float gkS = gkP.x * 5.2 + gkP.y * 3.4 - uGlintT * 0.85;
    float gkA = smoothstep(0.80, 1.0, sin(gkS * 3.14159));
    float gkB = smoothstep(0.90, 1.0, sin(gkS * 1.7 + 1.9 + gkP.z * 2.0));
    float gkW = 0.5 + 0.5 * sin(uGlintT * 2.1 + gkP.y * 13.0 + gkP.x * 8.0);
    outgoingLight += vec3(0.62, 0.32, 1.0) * (0.12 + 0.14 * gkW + 0.85 * gkA + 0.45 * gkB) * uGlintK;
  }
`;

/** Standart malzeme gölgelendiricisine parıltıyı ekler (viewmodel kendi parçasını ayrıca kullanır). */
export function patchGlintShader(shader) {
  shader.uniforms.uGlintT = uniforms.uGlintT;
  shader.uniforms.uGlintK = uniforms.uGlintK;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + GLINT_DECL)
    .replace('#include <opaque_fragment>', GLINT_FRAG + '\n#include <opaque_fragment>');
}

/** Viewmodel malzemesi için uniform bağlayıcı. */
export function bindGlintUniforms(shaderUniforms) {
  shaderUniforms.uGlintT = uniforms.uGlintT;
  shaderUniforms.uGlintK = uniforms.uGlintK;
}

const cache = new Map();

export function glintMaterial(mat) {
  if (!mat || !mat.isMeshStandardMaterial) return mat;
  if (mat.userData && mat.userData.kxGlint) return mat;
  let c = cache.get(mat);
  if (!c) {
    c = mat.clone();
    c.userData.kxGlint = true;
    c.onBeforeCompile = patchGlintShader;
    c.customProgramCacheKey = () => 'kx-glint';
    cache.set(mat, c);
  }
  return c;
}

export function applyGlint(model) {
  if (!model) return model;
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (Array.isArray(o.material)) o.material = o.material.map(glintMaterial);
    else o.material = glintMaterial(o.material);
  });
  model.userData.glint = true;
  return model;
}

/** Paylaşılan parıltılı malzemeleri bırakır (oyun kapanırken). */
export function disposeGlint() {
  cache.forEach((m) => m.dispose());
  cache.clear();
}
