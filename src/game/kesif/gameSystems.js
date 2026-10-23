/*
 * KEŞİF — dalga 3b sistemlerinin otomatik yüklenmesi.
 *
 * `systems/` altındaki giriş dosyaları (blocks.js, mobs.js, content.js, session.js, magic.js, treefall.js, tech.js, dimension.js, props.js, cityLocks.js, cityHud.js) varsa yüklenir (Vite import.meta.glob,
 * eager; dosya yoksa sessizce atlanır). Her dosya şu dışa aktarımlardan BİRİNİ verir (öncelik sırasıyla):
 *     export function createSystem(G) → sistem nesnesi | sistem dizisi
 *     export function createSystems(G) → sistem dizisi
 *     export default sistemNesnesi | (G) => sistemNesnesi | sistem dizisi
 *     export const system = sistemNesnesi
 * Yardımcı dosyalar (blocksBreak.js vb.) burada yüklenmez; giriş dosyaları kendileri içe aktarır.
 *
 *   resolveSystems(modules, G) → sistem nesneleri dizisi      (saf; test edilir)
 *   loadStandardSystems(G) → sistem nesneleri dizisi
 */
const STANDARD = import.meta.glob('./systems/{blocks,mobs,content,session,magic,treefall,tech,dimension,props,cityLocks,cityHud,vehicles,vehicleAudio,vehicleUi,vehicleVisual,traffic,cityNpc,crowd,crowdVisual,cityMissions,cityPhoto,cityDiscovery,cityApi}.js', { eager: true });

function pushAll(out, v) {
  if (!v) return;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) pushAll(out, v[i]);
  } else if (typeof v === 'object') out.push(v);
}

/** modules: {yol: modül}; yola göre sıralı (blocks, content, mobs, session → alfabetik değil, sabit) çözer. */
export function resolveSystems(modules, G) {
  const out = [];
  const keys = Object.keys(modules || {}).sort();
  for (let i = 0; i < keys.length; i++) {
    const m = modules[keys[i]];
    if (!m) continue;
    let made;
    if (typeof m.createSystem === 'function') made = m.createSystem(G);
    else if (typeof m.createSystems === 'function') made = m.createSystems(G);
    else if (m.default !== undefined) made = typeof m.default === 'function' ? m.default(G) : m.default;
    else if (m.system !== undefined) made = m.system;
    pushAll(out, made);
  }
  return out;
}

export function loadStandardSystems(G) {
  return resolveSystems(STANDARD, G);
}

export function standardSystemFiles() {
  return Object.keys(STANDARD).sort();
}
