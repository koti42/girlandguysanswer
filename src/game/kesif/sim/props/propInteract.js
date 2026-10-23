/*
 * KEŞİF sim/props — etkileşim sırası yardımcısı (saf). Sözleşme KESIF_CITY_CONTRACT §6:
 *   puzzles.handleInteract (yalnız overworld) → props.raycast vs voxel isabeti (EN YAKIN KAZANIR, eşitlikte PROP) → blok işlevleri → yerleştirme.
 *
 *   pickProp(pw, origin, dir, reach, voxelDist?) → {id,dist,t,def} | null
 *        Bakılan en yakın prop; voxel isabeti (varsa) propun gerisinde ya da TIE payı içinde ise prop kazanır.
 *   pickInteract(pw, origin, dir, reach, voxelDist?) → {id,dist,t,def,prompt} | null
 *        pickProp + etkileşimli olma + tanımın menzili (interact.range) içinde olma.
 * Dönen nesne paylaşılan tampondur (çağıran hemen okumalı).
 */
import { PROP_BY_T } from './propDefs.js';

/** Voxel ile prop mesafesi bu kadar yakınsa prop kazanır (blok). */
export const TIE = 0.05;
const _pick = { id: 0, dist: 0, t: 0, def: null, prompt: '' };

export function pickProp(pw, origin, dir, reach, voxelDist) {
  if (!pw) return null;
  const hit = pw.raycast(origin, dir, reach);
  if (!hit) return null;
  if (voxelDist !== undefined && voxelDist !== null && hit.dist > voxelDist + TIE) return null;
  _pick.id = hit.id;
  _pick.dist = hit.dist;
  _pick.t = hit.t;
  _pick.def = (pw.getDef ? pw.getDef(hit.t) : PROP_BY_T[hit.t]) || null;
  _pick.prompt = '';
  return _pick;
}

export function pickInteract(pw, origin, dir, reach, voxelDist) {
  const p = pickProp(pw, origin, dir, reach, voxelDist);
  if (!p || !p.def || !p.def.interact) return null;
  if (p.dist > p.def.interact.range) return null;
  p.prompt = p.def.interact.prompt;
  return p;
}
