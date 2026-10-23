/*
 * KEŞİF — ilk kullanım takılmasını önleyen ısınma çizimleri (yükleme ekranında).
 *
 *   warmRenderPrograms(G) → {characterMs, heldMs, kinds}     (hepsi isteğe bağlı: hatalar yutulur)
 *   createWarmSteps(G, perStep=4) → (() => {ms, what})[]      aynı ısınma, küçük adımlara bölünmüş (game.js yükleme döngüsü adım adım çalıştırır)
 *   warmCharacterPass(G) → ms | -1       üçüncü şahıs karakterinin shader programlarını GERÇEKTEN çizdirir
 *   warmHeldKinds(G, keys?) → {ms, kinds}       her eşya model türünün (kılıç, kazma, blok, meşale, pusula…) birinci şahıs kol modelini çizdirir
 *   precompileForState(THREE, renderer, scene, camera, postOn) → bool   kalite değişiminden hemen sonra programları PARALEL bağlatır
 *   heldKindKeys() → string[]            her model türü için temsilci eşya anahtarı (+ büyü parıltılı bir örnek)   (saf; test edilir)
 *
 * Neden `renderer.compile` yetmez (gerçek RTX 3060 + D3D11/ANGLE ölçümü): (1) çizim anında HLSL derlenir: karakterin skinned
 * MeshStandardMaterial programları TP'ye ilk geçişte ~420–500 ms, ilk blok/meşale/pusula tutuşu 60–210 ms donma yaratıyordu.
 * (2) Program anahtarı sahnedeki ışık sayısını içerir: kol grubundaki fpTorchLight FP'de görünür, TP'de gizli → farklı anahtar;
 * karakter ısınması kol GİZLİ durumunda yapılmalı. (3) Çıkış renk uzayı çizim hedefine bağlıdır: son işleme açıkken sahne yarı-kayan
 * noktalı hedefe çizilir. Bu yüzden aynı hedef türüne (postfx açıksa 8×8 HalfFloat, değilse ekran) dünya gizli bir kare çizilir.
 * Ekrana çizilen kare aynı görevde frame(0) ile ezilir (çağrı game.js'te ilk kareden önce, senkron).
 */
import { ITEM_LIST } from './sim/items.js';
import { GLINT_SUFFIX } from './render/enchantGlint.js';
import { createDroppedItem } from './render/heldItems.js';

const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** Her model türü için ilk eşya anahtarı (sıra: ITEM_LIST) + büyülü parıltı örneği (ilk kılıç/kazma). */
export function heldKindKeys() {
  const seen = {};
  const keys = [];
  let glintBase = null;
  for (let i = 0; i < ITEM_LIST.length; i++) {
    const it = ITEM_LIST[i];
    const k = it.model || 'flat';
    if (!seen[k]) {
      seen[k] = true;
      keys.push(it.key);
    }
    if (!glintBase && (k === 'sword' || k === 'tool')) glintBase = it.key;
  }
  if (glintBase) keys.push(glintBase + GLINT_SUFFIX);
  return keys;
}

function withState(G, set, body) {
  const r = G.renderer;
  const ch = G.character && G.character.root;
  const vm = G.viewModel && G.viewModel.group;
  const prev = {
    ch: ch ? ch.visible : false,
    vm: vm ? vm.visible : false,
    world: G.worldRoot ? G.worldRoot.visible : true,
    ent: G.entityRoot ? G.entityRoot.visible : true,
  };
  const prevRT = typeof r.getRenderTarget === 'function' ? r.getRenderTarget() : null;
  const THREE = G.THREE;
  let rt = null;
  if (G.postfx && G.postfx.enabled) rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
  try {
    if (ch) ch.visible = !!set.character;
    if (vm) vm.visible = !!set.viewModel;
    if (G.worldRoot) G.worldRoot.visible = false;
    if (G.entityRoot) G.entityRoot.visible = !!set.entities;
    r.setRenderTarget(rt);
    return body(r);
  } finally {
    r.setRenderTarget(prevRT);
    if (ch) ch.visible = prev.ch;
    if (vm) vm.visible = prev.vm;
    if (G.worldRoot) G.worldRoot.visible = prev.world;
    if (G.entityRoot) G.entityRoot.visible = prev.ent;
    if (rt) rt.dispose();
  }
}

function ready(G) {
  return !!(G.renderer && G.scene && G.camera && G.THREE && typeof G.renderer.render === 'function');
}

export function warmCharacterPass(G) {
  try {
    if (!ready(G) || !G.character || !G.character.root) return -1;
    const t0 = nowMs();
    // sırtta jetpack (teknoloji): ilk üçüncü şahıs itişinde malzeme derlemesi takılma yapmasın → ısınma karesinde görünür kıl
    const bp = G.techVisuals && G.techVisuals.backpack;
    withState(G, { character: true, viewModel: false }, (r) => {
      try {
        if (bp) bp.update(true, false, 0);
        r.render(G.scene, G.camera);
      } finally {
        if (bp) bp.update(false, false, 0);
      }
    });
    return nowMs() - t0;
  } catch {
    return -1;
  }
}

export function warmHeldKinds(G, onlyKeys) {
  const hl = G.highlight;
  const dropped = [];
  try {
    if (!ready(G) || !G.viewModel || typeof G.viewModel.setHeld !== 'function') return { ms: -1, kinds: 0 };
    const keys = Array.isArray(onlyKeys) ? onlyKeys : heldKindKeys();
    const t0 = nowMs();
    // Kameranın ~2 blok önü: hedef çerçevesi/çatlak/yerleştirme hayaleti ve yere düşen eşyalar kadraja girer (gerçek çizim)
    const cam = G.camera;
    const dir = new G.THREE.Vector3(0, 0, -1);
    if (typeof cam.getWorldDirection === 'function') cam.getWorldDirection(dir);
    const px = cam.position.x + dir.x * 2.2;
    const py = cam.position.y + dir.y * 2.2;
    const pz = cam.position.z + dir.z * 2.2;
    withState(G, { character: false, viewModel: true, entities: true }, (r) => {
      if (hl) {
        hl.setTarget({ x: Math.floor(px), y: Math.floor(py), z: Math.floor(pz), blockId: 1 });
        hl.setBreakProgress(0.5);
        hl.setPlacementGhost(1, { x: Math.floor(px) + 1, y: Math.floor(py), z: Math.floor(pz) }, true);
        if (typeof hl.update === 'function') hl.update(0.016);
      }
      for (let i = 0; i < keys.length; i++) {
        G.viewModel.setHeld(keys[i]);
        const d = createDroppedItem(G.THREE, keys[i]);
        d.position.set(cam.position.x + dir.x * 1.6, cam.position.y + dir.y * 1.6, cam.position.z + dir.z * 1.6);
        G.entityRoot.add(d);
        dropped.push(d);
        r.render(G.scene, G.camera);
      }
    });
    return { ms: nowMs() - t0, kinds: keys.length };
  } catch {
    return { ms: -1, kinds: 0 };
  } finally {
    for (let i = 0; i < dropped.length; i++) {
      const d = dropped[i];
      if (d.parent) d.parent.remove(d);
      d.traverse((o) => {
        const owned = o.userData && o.userData.owned;
        if (owned) owned.forEach((x) => { if (x && x.dispose) x.dispose(); });
      });
    }
    try {
      if (hl) {
        hl.setBreakProgress(0);
        hl.setTarget(null);
        hl.setPlacementGhost(null);
      }
    } catch { /* yut */ }
    try { if (G.viewModel) G.viewModel.setHeld(null); } catch { /* yut */ }
  }
}

/**
 * Kalite kademesi değişince (son işleme açık↔kapalı, malzeme kademesi) tüm programların anahtarı değişir; three bunları ilk çizimde
 * TEK TEK bağlar (gerçek GPU'da high→low ilk karesi ~1,1 sn). `renderer.compile` hepsini aynı anda başlatır (paralel derleme) ve
 * bekleme en yavaş programa iner (~0,5 sn). Çizim hedefi gerçek çizimle aynı olmalı (son işleme açıkken yarı-kayan noktalı ara hedef).
 */
export function precompileForState(THREE, renderer, scene, camera, postOn) {
  if (!THREE || !renderer || typeof renderer.compile !== 'function' || !scene || !camera) return false;
  let rt = null;
  let prev = null;
  try {
    prev = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
    if (postOn) rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.HalfFloatType });
    renderer.setRenderTarget(rt);
    renderer.compile(scene, camera);
    return true;
  } catch {
    return false;
  } finally {
    try { renderer.setRenderTarget(prev); } catch { /* yut */ }
    if (rt) rt.dispose();
  }
}

/**
 * Isınmayı küçük adımlara böler (karakter, sonra 4'erli eşya türleri): oyun her adım arasında yükleme çubuğunu çizdirir,
 * ana iş parçacığı tek seferde ~1-1,5 sn donmaz. Her adım {ms} döner ve hata fırlatmaz.
 */
export function createWarmSteps(G, perStep) {
  const steps = [() => ({ ms: warmCharacterPass(G), what: 'karakter' })];
  const keys = heldKindKeys();
  const n = perStep > 0 ? perStep : 4;
  for (let i = 0; i < keys.length; i += n) {
    const part = keys.slice(i, i + n);
    steps.push(() => ({ ms: warmHeldKinds(G, part).ms, what: 'eşya', kinds: part.length }));
  }
  return steps;
}

export function warmRenderPrograms(G) {
  const characterMs = warmCharacterPass(G);
  const held = warmHeldKinds(G);
  return { characterMs, heldMs: held.ms, kinds: held.kinds };
}
