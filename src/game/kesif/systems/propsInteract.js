/*
 * KEŞİF props — blok sistemine takılan iki ince kanca (systems/blocksUse.js ve blocksTarget.js, tek satır çağrı):
 *
 *   propUse(G, S) → 'prop' | 'none'     kullan/dokun: bakılan EN YAKIN etkileşimli prop (voxel isabeti daha yakınsa voxel kazanır; eşitlikte
 *                                       prop) → PropWorld.use → efektler → olay 'propUsed'. Sıra (KESIF_CITY_CONTRACT §6): bulmaca → prop → blok işlevi → yerleştirme.
 *   propFrame(G, S) → boolean           çizim karesi: etkileşimli prop bakılıyorsa bağlamsal ipucu ("[Sağ tık] Terminali kullan") + HUD hedef adı yazılır,
 *                                       blok vurgusu/hayaleti temizlenir; true dönerse blok görselleri bu karede atlanır.
 * G.props yoksa (overworld) ikisi de hemen 'none'/false döner: davranış değişmez.
 * Çömelen oyuncu elinde yerleştirilebilir blok ya da asa tutuyorsa prop atlanır (blok koyma/büyü önce gelir; blok işleviyle aynı kural).
 */
import { ITEMS } from '../sim/items.js';
import { clockPhase, isNight } from '../sim/daynight.js';
import { pickInteract } from '../sim/props/propInteract.js';
import { propHint } from '../sim/props/propBehaviors.js';
import { reachFor, setContextHint, setHint } from './blocksCore.js';
import { runPropEffects } from './propsEffects.js';

function heldBlocksUse(G) {
  const key = G.inventory ? G.inventory.heldItem() : null;
  const it = key ? ITEMS[key] : null;
  return !!(it && (it.placesBlock || (it.magic && it.magic.staff)));
}

function voxelDistance(hit, eye) {
  if (!hit) return null;
  const p = hit.point;
  const dx = p.x - eye.x;
  const dy = p.y - eye.y;
  const dz = p.z - eye.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const USE_DESKTOP = '[Sağ tık] ';
const USE_TOUCH = 'Kullan: ';

export function propUse(G, S) {
  const pw = G.props;
  if (!pw || typeof pw.raycast !== 'function' || !G.eyeSim) return 'none';
  if (G.player && G.player.crouching && heldBlocksUse(G)) return 'none';
  const vd = S.has ? voxelDistance(S.target, G.eyeSim) : null;
  const hit = pickInteract(pw, G.eyeSim, G.look, reachFor(G), vd);
  if (!hit) return 'none';
  const id = hit.id;
  const def = hit.def;
  const actor = {
    crouch: !!(G.player && G.player.crouching),
    x: G.body ? G.body.x : 0,
    y: G.body ? G.body.y : 0,
    z: G.body ? G.body.z : 0,
    night: !!G.clock && isNight(clockPhase(G.clock)),
    rain: !!G.weatherSim && G.weatherSim.intensity > 0.3 && G.weatherSim.renderKind === 'rain',
  };
  const effects = pw.use(id, actor);
  if (G.viewModel && G.viewModel.swing) G.viewModel.swing('use');
  runPropEffects(G, effects, {
    say(text) {
      setHint(G, S, text, 5);
      if (typeof G.speak === 'function') G.speak(text);
    },
  });
  const p = pw.get(id);
  G.emit({
    type: 'propUsed',
    id,
    key: def ? def.key : '',
    t: p ? p.t : 0,
    x: p ? p.x : 0,
    y: p ? p.y : 0,
    z: p ? p.z : 0,
    effects: effects.length,
  });
  return 'prop';
}

export function propFrame(G, S) {
  const pw = G.props;
  if (!pw || typeof pw.raycast !== 'function' || !G.eye || G.ui !== 'none') return false;
  if (G.player && G.player.crouching && heldBlocksUse(G)) return false;
  const vd = S.frameHas ? voxelDistance(S.frameHit, G.eye) : null;
  const hit = pickInteract(pw, G.eye, G.look, reachFor(G), vd);
  if (!hit) return false;
  const e = pw.entry(hit.id);
  if (!e) return false;
  const s = G.inputState;
  const text = (s && (s.touch || s.usingGamepad) ? USE_TOUCH : USE_DESKTOP)
    + propHint(e.def, e, e.prop, {
      time: pw.time, choiceUi: pw.choiceUi, seed: pw.citySeed, def: e.def, world: pw,
    });
  const hl = G.highlight;
  if (hl && hl.state) {
    if (hl.state.hasTarget) hl.setTarget(null);
    if (hl.state.ghostId >= 0) hl.setPlacementGhost(null);
  }
  S.plc.ghostId = -1;
  S.frameHas = false;
  const t = G.hud.target;
  t.block = null;
  t.name = e.def.name;
  t.progress = 0;
  setContextHint(G, S, text);
  return true;
}
