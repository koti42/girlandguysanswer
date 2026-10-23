/*
 * KEŞİF blok sistemi — hedef seçimi, çerçeve/çatlak/hayalet görselleri ve HUD hedef alanı.
 *
 *   acquireFixed(G,S)        sabit adım: sim gözünden (G.eyeSim) ışın; S.target/S.has (kırma-yerleştirme için yetkili)
 *   frameVisuals(G,S,dt)     çizim karesi: enterpolasyonlu gözden ışın; highlight.setTarget/çatlak/hayalet + hud.target
 *   clearVisuals(G,S)        UI açık/ölü/duraklatılmış: çerçeve ve hayaleti gizle, hud.target boşalt
 *   heldPlaceBlock(G)        eldeki eşya yerleştirilebilir blok mu → blok kimliği | 0
 *
 * Işın: raycastBlocks (sıvı atlanır), erişim macera 5 / inşa 8; kare başına ayırma yok (paylaşılan çarpma nesneleri).
 * Hayalet yalnız eldeki blok eşyası için ve yerleştirme geçerli/geçersiz rengiyle çizilir.
 */
import { BLOCKS } from '../sim/blocks.js';
import { ITEMS } from '../sim/items.js';
import { raycastBlocks } from '../sim/raycast.js';
import {
  clearContextHint, isReadOnly, reachFor, setContextHint,
} from './blocksCore.js';
import { checkPlacement } from './blocksPlace.js';
import { propFrame } from './propsInteract.js';

const rayOpts = { hitLiquid: false, solidOnly: false, out: null };

/** Etkileşimli blok → ipucu eylemi. Masaüstü "[Sağ tık] …", dokunmatik/kol "Kullan: …" (metinler önceden kurulur: kare başı ayırma yok). */
const USE_LABELS = {
  sandık: 'Sandığı aç',
  ödül_sandığı: 'Ödül sandığını aç',
  tezgah: 'Üretim tezgahını kullan',
  ocak: 'Ocağı kullan',
  örs: 'Örsü kullan',
  kapı_aç: 'Kapıyı aç',
  kapı_kapat: 'Kapıyı kapat',
  yatak: 'Yatağı kullan',
  levha: 'Tabelayı oku',
  kitaplık: 'Kitaplığa bak',
  kol: 'Kolu çevir',
  sunak: 'Sunağı kullan',
  rün: 'Rün taşına dokun',
  büyü_masası: "Büyü Masası'nı kullan",
  simya_kazanı: "Simya Kazanı'nı kullan",
  laboratuvar: 'Teknoloji Laboratuvarını kullan',
  makine: 'Makineyi aç',
  düğme: 'Düğmeye bas',
  ışınlayıcı: 'Platformu kullan',
  asansör: 'Asansörü kullan',
};
const HINT_DESKTOP = {};
const HINT_TOUCH = {};
Object.keys(USE_LABELS).forEach((k) => {
  HINT_DESKTOP[k] = '[Sağ tık] ' + USE_LABELS[k];
  HINT_TOUCH[k] = 'Kullan: ' + USE_LABELS[k];
});

/** Hedef blok için etkileşim ipucu metni | null. */
export function interactHintText(G, id) {
  const rec = BLOCKS[id];
  if (!rec || !rec.interact) return null;
  const s = G.inputState;
  const table = s && (s.touch || s.usingGamepad) ? HINT_TOUCH : HINT_DESKTOP;
  return table[rec.interact] || null;
}

export function heldPlaceBlock(G) {
  const key = G.inventory ? G.inventory.heldItem() : null;
  if (!key) return 0;
  const it = ITEMS[key];
  return it && it.placesBlock ? it.placesBlock : 0;
}

function cast(G, S, eye, hit) {
  rayOpts.out = hit;
  return raycastBlocks(G.world, eye, G.look, reachFor(G), rayOpts) !== null;
}

export function acquireFixed(G, S) {
  S.has = cast(G, S, G.eyeSim, S.target);
  return S.has;
}

function hudTarget(G, id, progress) {
  const t = G.hud.target;
  if (id > 0) {
    t.block = id;
    t.name = BLOCKS[id] ? BLOCKS[id].name : null;
  } else {
    t.block = null;
    t.name = null;
  }
  t.progress = progress;
}

export function clearVisuals(G, S) {
  S.frameHas = false;
  clearContextHint(G, S);
  if (G.highlight) {
    if (G.highlight.state && G.highlight.state.hasTarget) G.highlight.setTarget(null);
    if (G.highlight.state && G.highlight.state.ghostId >= 0) G.highlight.setPlacementGhost(null);
  }
  S.plc.ghostId = -1;
  hudTarget(G, 0, 0);
}

export function frameVisuals(G, S) {
  const hl = G.highlight;
  S.frameHas = cast(G, S, G.eye, S.frameHit);
  if (G.props && propFrame(G, S)) return;
  if (!S.frameHas) {
    if (hl) {
      if (hl.state.hasTarget) hl.setTarget(null);
      if (hl.state.ghostId >= 0) hl.setPlacementGhost(null);
    }
    S.plc.ghostId = -1;
    hudTarget(G, 0, 0);
    clearContextHint(G, S);
    return;
  }
  const h = S.frameHit;
  const brk = S.brk;
  const sameBreak = brk.active && brk.x === h.x && brk.y === h.y && brk.z === h.z;
  const progress = sameBreak ? brk.progress : 0;
  if (hl) {
    const o = S.hl;
    o.x = h.x; o.y = h.y; o.z = h.z; o.blockId = h.id;
    o.nx = h.face.nx; o.ny = h.face.ny; o.nz = h.face.nz;
    hl.setTarget(o);
    hl.setBreakProgress(progress);
  }
  hudTarget(G, h.id, progress);
  const hintText = G.aimEntity || (G.player.crouching && heldPlaceBlock(G) > 0) ? null : interactHintText(G, h.id);
  if (hintText) setContextHint(G, S, hintText);
  else clearContextHint(G, S);

  // yerleştirme hayaleti
  if (!hl) return;
  const tr = BLOCKS[h.id];
  const usable = !!(tr && tr.interact) && !G.player.crouching; // kullanılabilir blokta tıklama yerleştirmez (çömelince yerleştirir)
  const bid = isReadOnly(G) || usable ? 0 : heldPlaceBlock(G);
  if (!bid) {
    if (S.plc.ghostId >= 0) {
      hl.setPlacementGhost(null);
      S.plc.ghostId = -1;
    }
    return;
  }
  const res = checkPlacement(G, S, h, bid);
  const p = S.plc;
  const px = h.placeAt.x;
  const py = h.placeAt.y;
  const pz = h.placeAt.z;
  if (p.ghostId !== bid || p.ghostX !== px || p.ghostY !== py || p.ghostZ !== pz || p.ghostOk !== res.ok) {
    p.ghostId = bid; p.ghostX = px; p.ghostY = py; p.ghostZ = pz; p.ghostOk = res.ok;
    S.pos2.x = px; S.pos2.y = py; S.pos2.z = pz;
    hl.setPlacementGhost(bid, S.pos2, res.ok);
  }
}
