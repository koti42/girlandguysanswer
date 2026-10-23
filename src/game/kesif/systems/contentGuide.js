/*
 * KEŞİF content sistemi — REHBERLİK: sıradaki hedef ve pusula yönü (oyuncu asla kilitlenmesin).
 *
 *   anchorPubs(S) → [yapı tanımı]               çapa yapıları (tapınaklar, mühür kuleleri, boss arenaları, kamplar, parkurlar, ilk kule)
 *   nearestOfType(S, types, opts) → aday | null  opts: {zone, exclude(id)→bool}; adaylar = çapalar ∪ görülmüş yapılar (S.known)
 *   directionText(S, type, zone, excludeIds) → 'N blok kuzeydoğuda, solunda' | ''
 *   questTarget(S, quest) → aday | null          görevin hedef türüne göre yapı
 *   mainTarget(S) → {target, text} | null        ilerleme tabanlı ana yol (kristal → mühür → boss → sonraki bölge)
 *   getGuidance(S) → { nextGoal, hint, direction, target:{id,type,name,x,z,distance,compass,relYaw,side}|null, main:{...}|null, quest }
 *
 * Hesap pahalı kısmı (hedef seçimi) ≤ 1 Hz ve olay sürümünde yenilenir; yön her çağrıda canlı hesaplanır.
 * Yakın çevre dışındaki yapılar için maliyetli ızgara taraması YAPILMAZ: yalnızca önceden ısıtılmış çapalar ve görülmüş yapılar kullanılır.
 */
import { ZONES, ZONE_COUNT } from '../sim/constants.js';
import { getState } from '../sim/structuresLayout.js';
import { QUEST_BY_ID } from '../sim/quests.js';
import { bearingInfo, zoneCrystalKey } from './contentHelpers.js';

export function anchorPubs(S) {
  if (!S._anchors) {
    try {
      S._anchors = getState(S.seed).anchorList.map((p) => p.pub);
    } catch {
      S._anchors = [];
    }
  }
  return S._anchors;
}

function forEachCandidate(S, fn) {
  const seen = new Set();
  const a = anchorPubs(S);
  for (let i = 0; i < a.length; i++) {
    seen.add(a[i].id);
    fn(a[i]);
  }
  S.known.forEach((k) => {
    if (!seen.has(k.id)) fn(k);
  });
}

/** types: string | [string]. opts: {zone, exclude}. Oyuncuya en yakın aday. */
export function nearestOfType(S, types, opts) {
  // yapı/pusula hedefleri ana diyar koordinatlarıdır: şehirde (G.dim ≠ overworld) yön VERİLMEZ (aksi halde 'Anahtar Tapınağı 60 blok batıda' gibi anlamsız yön çıkar)
  if (S.G.dim !== undefined && S.G.dim !== 'overworld') return null;
  const o = opts || {};
  const b = S.G.body;
  const list = Array.isArray(types) ? types : [types];
  let best = null;
  let bd = Infinity;
  forEachCandidate(S, (c) => {
    if (list.indexOf(c.type) < 0) return;
    if (o.zone !== undefined && c.zone !== o.zone) return;
    if (o.exclude && o.exclude(c.id, c)) return;
    if (o.tier !== undefined) {
      const t = c.parkour ? c.parkour.tier : c.tier;
      if (t !== o.tier) return;
    }
    const d = (c.x - b.x) * (c.x - b.x) + (c.z - b.z) * (c.z - b.z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  });
  return best;
}

function describe(S, c) {
  if (!c) return null;
  const b = S.G.body;
  const info = bearingInfo(b.x, b.z, S.G.player.yaw, c.x, c.z);
  return {
    id: c.id, type: c.type, name: c.name, x: c.x, z: c.z, zone: c.zone, distance: info.dist, compass: info.compass, relYaw: info.relYaw, side: info.side, text: info.text,
  };
}

export function directionText(S, type, zone, excludeIds) {
  const ex = excludeIds && excludeIds.length ? excludeIds : null;
  const c = nearestOfType(S, type, { zone, exclude: ex ? (id) => ex.indexOf(id) >= 0 : undefined });
  if (!c) return '';
  const d = describe(S, c);
  return d.text;
}

function unsolvedPuzzle(S, c) {
  const rec = S.structs.get(c.id);
  if (!rec || !S.G.puzzles) return true;
  const list = rec.def.puzzles || [];
  for (let i = 0; i < list.length; i++) if (!S.G.puzzles.isSolved(list[i].id)) return true;
  return list.length === 0;
}

export function questTarget(S, q) {
  if (!q) return null;
  const def = QUEST_BY_ID[q.id];
  if (!def) return null;
  const g = def.goal;
  const p = S.G.progression;
  const disc = S.discSet || new Set();
  switch (g.type) {
    case 'discover':
      return nearestOfType(S, g.types, { exclude: (id) => disc.has(id) });
    case 'crystal':
      return nearestOfType(S, 'anahtartapinagi', { zone: g.zone, exclude: (id) => p.crystals[g.zone].indexOf(id) >= 0 });
    case 'sealPlace':
    case 'seal':
      return nearestOfType(S, 'muhursunagi', { zone: g.zone });
    case 'boss':
      return nearestOfType(S, 'bossarena', { zone: g.zone });
    case 'zone':
      return nearestOfType(S, 'muhursunagi', { zone: g.zone - 1 });
    case 'puzzle': {
      const z = g.zone;
      return nearestOfType(S, ['turbe', 'anahtartapinagi'], { zone: z, exclude: (id, c) => !unsolvedPuzzle(S, c) });
    }
    case 'parkour':
      return nearestOfType(S, 'parkur', { tier: g.tier });
    default:
      return null;
  }
}

/** İlerleme tabanlı ana yol. */
export function mainTarget(S) {
  const p = S.G.progression;
  if (!p || !p.active) return null;
  let top = 0;
  for (let i = 0; i < ZONE_COUNT; i++) if (p.zonesUnlocked[i]) top = i;
  for (let z = 1; z < top; z++) {
    if (p.seals[z] && !p.bossesDefeated[z]) {
      const c = nearestOfType(S, 'bossarena', { zone: z });
      if (c) return { target: c, text: ZONES[z].name + ' boss\'unu yen' };
    }
  }
  const req = ZONES[top].temples;
  if (!p.seals[top]) {
    if (p.crystals[top].length < req) {
      const c = nearestOfType(S, 'anahtartapinagi', { zone: top, exclude: (id) => p.crystals[top].indexOf(id) >= 0 });
      return c ? { target: c, text: 'Anahtar Tapınağı\'nı bul (' + p.crystals[top].length + '/' + req + ')' } : null;
    }
    const inv = S.G.inventory ? S.G.inventory.count(zoneCrystalKey(top)) : 0;
    const c = nearestOfType(S, 'muhursunagi', { zone: top });
    return c ? { target: c, text: 'Kristalleri Mühür Kulesi\'ne götür' + (inv > 0 ? '' : ' (kristal eşyan yoksa tapınak sunağından yeniden al)') } : null;
  }
  if (top >= 1 && !p.bossesDefeated[top]) {
    const c = nearestOfType(S, 'bossarena', { zone: top });
    if (c) return { target: c, text: ZONES[top].name + ' boss\'unu yen' };
  }
  return null;
}

function progressText(q) {
  return q.goal > 1 ? ' (' + q.progress + '/' + q.goal + ')' : '';
}

/** Hedef seçimi (önbellekli, ≈1 Hz). */
function compute(S) {
  const p = S.G.progression;
  const q = p && p.active ? p.activeQuest() : null;
  const qt = q ? questTarget(S, q) : null;
  const mt = mainTarget(S);
  return {
    q, qt, mt, version: S.version,
  };
}

export function getGuidance(S) {
  const G = S.G;
  const p = G.progression;
  const now = G.time.seconds;
  const gc = S.guideCache;
  if (!gc.value || now - gc.t > 1 || gc.key !== S.version) {
    gc.value = compute(S);
    gc.t = now;
    gc.key = S.version;
  }
  const v = gc.value;
  const q = v.q;
  const primary = v.qt || (v.mt ? v.mt.target : null);
  const target = describe(S, primary);
  const main = v.mt ? Object.assign({ goal: v.mt.text }, describe(S, v.mt.target)) : null;
  const nextGoal = q ? q.desc + progressText(q) : (v.mt ? v.mt.text : 'Dünyayı keşfetmeye ve inşa etmeye devam et.');
  let direction = '';
  if (target) direction = (target.name || 'Hedef') + ': ' + target.text;
  const hint = q ? q.hint : (v.mt ? v.mt.text : null);
  return {
    nextGoal,
    hint,
    direction,
    target,
    main,
    quest: q ? { id: q.id, title: q.title, desc: q.desc, progress: q.progress, goal: q.goal } : null,
    active: !!p && p.active,
  };
}
