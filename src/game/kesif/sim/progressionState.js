/*
 * KEŞİF sim — ilerleme durumu: boş durum, serileştirme, doğrulayarak yükleme ve sürüm göçü (saf).
 * `p` bir Progression örneğidir (alanları progression.js açıklar). Yükleme ASLA atmaz: bozuk veri sınırlanır/atılır.
 */
import { BIOME_KEYS, MAX_BLOCK_ID, ZONE_COUNT } from './constants.js';
import {
  DEFAULT_DIFFICULTY, DIFFICULTIES, PROGRESSION_VERSION, STAT_COUNTERS, STAT_LIMIT, canonKey, emptyStats, isRewardKey,
  safeId, safeMobKey,
} from './progressionData.js';
import {
  MAP_CELLS, countRevealed, createRevealGrid, decodeReveal, encodeReveal,
} from './progressionMap.js';
import { restoreAchievements } from './achievements.js';
import { restoreQuests, serializeQuests } from './quests.js';

const CAP = { structures: 2000, solved: 800, crystals: 12, parkour: 300, rewards: 64 };

function cnum(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return n < lo ? lo : n > hi ? hi : n;
}
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Yeni, boş durum alanlarını p'ye yazar. */
export function resetProgression(p) {
  p.zonesUnlocked = [true, false, false, false, false];
  p.crystals = {};
  p.placed = {};
  p.seals = {};
  p.bossDoors = {};
  p.bossesDefeated = {};
  p.abilities = { doubleJump: false, grapple: false, glide: false, portalGun: false };
  p.zonesVisited = { 0: true };
  p.parkourTiers = {};
  p.discovered = { structures: [], biomes: [] };
  p.solved = [];
  p.flags = { victory: false };
  p.rewards = { pending: [], claimed: [] };
  p.stats = emptyStats();
  p.questsDone = {};
  p.achievements = [];
  p.reveal = createRevealGrid();
  p.revealCount = 0;
  p.difficulty = DEFAULT_DIFFICULTY;
  p._achSet = null;
  p._qSeen = {};
  p._structSet = new Set();
  p._solvedSet = new Set();
  for (let z = 0; z < ZONE_COUNT; z++) {
    p.crystals[z] = [];
    p.placed[z] = [];
  }
}

/* ------------------------------------------------------------------------------------------------
 * Serileştirme
 * ---------------------------------------------------------------------------------------------- */
function compactMap(m, int) {
  const out = {};
  Object.keys(m).sort().forEach((k) => {
    const v = m[k];
    if (v > 0) out[k] = int ? Math.floor(v) : v;
  });
  return out;
}

function trueMap(m) {
  const out = {};
  Object.keys(m).forEach((k) => { if (m[k]) out[k] = true; });
  return out;
}

export function serializeProgression(p) {
  const st = p.stats;
  const stats = {};
  STAT_COUNTERS.forEach((k) => {
    const v = st[k];
    stats[k] = k === 'distance' || k === 'playTime' || k === 'jetpackSeconds' ? Math.round(v * 10) / 10 : Math.floor(v);
  });
  stats.broken = compactMap(st.broken, true);
  stats.placed = compactMap(st.placed, true);
  stats.crafted = compactMap(st.crafted, true);
  stats.smeltedBy = compactMap(st.smeltedBy, true);
  stats.picked = compactMap(st.picked, true);
  stats.mobKinds = compactMap(st.mobKinds, true);
  stats.eaten = compactMap(st.eaten, true);
  stats.puzzlesByZone = compactMap(st.puzzlesByZone, true);
  stats.parkourBest = {};
  Object.keys(st.parkourBest).sort().forEach((k) => { stats.parkourBest[k] = Math.floor(st.parkourBest[k]); });
  const crystals = {};
  const placed = {};
  for (let z = 0; z < ZONE_COUNT; z++) {
    crystals[z] = p.crystals[z].slice();
    placed[z] = p.placed[z].slice();
  }
  return {
    v: PROGRESSION_VERSION,
    difficulty: p.difficulty,
    zonesUnlocked: p.zonesUnlocked.slice(),
    crystals,
    placed,
    seals: trueMap(p.seals),
    bossDoors: trueMap(p.bossDoors),
    bossesDefeated: trueMap(p.bossesDefeated),
    abilities: Object.assign({}, p.abilities),
    zonesVisited: trueMap(p.zonesVisited),
    parkourTiers: trueMap(p.parkourTiers),
    quests: serializeQuests(p),
    achievements: p.achievements.slice(),
    discovered: { structures: p.discovered.structures.slice(), biomes: p.discovered.biomes.slice() },
    solved: p.solved.slice(),
    flags: { victory: !!p.flags.victory },
    rewards: { pending: p.rewards.pending.slice(), claimed: p.rewards.claimed.slice() },
    stats,
    mapReveal: p.revealCount > 0 ? encodeReveal(p.reveal) : '',
  };
}

/* ------------------------------------------------------------------------------------------------
 * Sürüm göçü: from sürümünden from+1'e dönüştürücüler. v0 = sürümsüz eski biçim.
 * ---------------------------------------------------------------------------------------------- */
const MIGRATIONS = {
  0(d) {
    // v0: `zones` dizisi ve düz `crystalCount` kullanılıyordu.
    const o = Object.assign({}, d);
    if (Array.isArray(o.zones) && !Array.isArray(o.zonesUnlocked)) o.zonesUnlocked = o.zones;
    delete o.zones;
    o.v = 1;
    return o;
  },
};

const BUILTIN_MIGRATIONS = Object.assign({}, MIGRATIONS);

/** Test/gelecek sürümler için göç dönüştürücüsü kaydı: fn(data) → yeni veri (v alanını artırır). */
export function registerProgressionMigration(from, fn) {
  if (Number.isInteger(from) && from >= 0 && typeof fn === 'function') MIGRATIONS[from] = fn;
}
/** Kaydı geri alır; yerleşik göç varsa o geri yüklenir. */
export function unregisterProgressionMigration(from) {
  if (BUILTIN_MIGRATIONS[from]) MIGRATIONS[from] = BUILTIN_MIGRATIONS[from];
  else delete MIGRATIONS[from];
}

/** {ok, data, from} — atmaz. Bilinmeyen/gelecek sürüm: alanlar olduğu gibi sınırlanarak okunur. */
export function migrateProgression(data) {
  if (!isObj(data)) return { ok: false, data: null, from: -1 };
  let d = data;
  const from = Number.isInteger(d.v) ? d.v : 0;
  let v = from;
  let guard = 0;
  while (v < PROGRESSION_VERSION && guard++ < 32) {
    const fn = MIGRATIONS[v];
    if (!fn) break;
    try {
      const next = fn(d);
      if (!isObj(next)) return { ok: false, data: null, from };
      d = next;
    } catch {
      return { ok: false, data: null, from };
    }
    const nv = Number.isInteger(d.v) ? d.v : v + 1;
    if (nv <= v) break;
    v = nv;
  }
  return { ok: true, data: d, from };
}

/* ------------------------------------------------------------------------------------------------
 * Yükleme
 * ---------------------------------------------------------------------------------------------- */
function loadCounterMap(src, keyFn, int) {
  const out = {};
  if (!isObj(src)) return out;
  const ks = Object.keys(src);
  for (let i = 0; i < ks.length && i < 700; i++) {
    const k = keyFn(ks[i]);
    if (k === null) continue;
    const v = cnum(src[ks[i]], 0, STAT_LIMIT, 0);
    if (v > 0) out[k] = (out[k] || 0) + (int ? Math.floor(v) : v);
  }
  return out;
}
function boolMapZones(src) {
  const out = {};
  if (!isObj(src)) return out;
  for (let z = 0; z < ZONE_COUNT; z++) if (src[z] === true) out[z] = true;
  return out;
}
function idList(src, cap) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(src)) return out;
  for (let i = 0; i < src.length && out.length < cap; i++) {
    const id = safeId(src[i]);
    if (id !== null && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Doğrulayarak yükler. Başarılıysa true (veri nesnesi değilse false ve durum boş kalır).
 */
export function restoreProgression(p, raw) {
  resetProgression(p);
  const mig = migrateProgression(raw);
  if (!mig.ok) return false;
  const d = mig.data;

  p.difficulty = DIFFICULTIES[d.difficulty] ? d.difficulty : DEFAULT_DIFFICULTY;

  for (let z = 0; z < ZONE_COUNT; z++) {
    p.crystals[z] = isObj(d.crystals) ? idList(d.crystals[z], CAP.crystals) : [];
    p.placed[z] = isObj(d.placed) ? idList(d.placed[z], CAP.crystals) : [];
  }
  p.seals = boolMapZones(d.seals);
  p.bossDoors = boolMapZones(d.bossDoors);
  p.bossesDefeated = boolMapZones(d.bossesDefeated);
  p.zonesVisited = Object.assign({ 0: true }, boolMapZones(d.zonesVisited));
  // bölge kilitleri: ardışık; mühürü bitmiş bölgenin ardılı açık sayılır
  const zu = Array.isArray(d.zonesUnlocked) ? d.zonesUnlocked : [];
  p.zonesUnlocked = [true];
  for (let z = 1; z < ZONE_COUNT; z++) {
    const open = (zu[z] === true || p.seals[z - 1] === true) && p.zonesUnlocked[z - 1] === true;
    p.zonesUnlocked.push(open);
  }
  // kilitli bölgenin mührü/boss'u tutarsızdır: temizle
  for (let z = 0; z < ZONE_COUNT; z++) {
    if (!p.zonesUnlocked[z]) {
      delete p.seals[z];
      delete p.bossDoors[z];
      delete p.bossesDefeated[z];
      delete p.zonesVisited[z];
    }
  }
  if (isObj(d.abilities)) {
    Object.keys(p.abilities).forEach((k) => { p.abilities[k] = d.abilities[k] === true; });
  }
  if (isObj(d.parkourTiers)) {
    for (let t = 1; t <= 5; t++) if (d.parkourTiers[t] === true) p.parkourTiers[t] = true;
  }
  if (isObj(d.discovered)) {
    p.discovered.structures = idList(d.discovered.structures, CAP.structures);
    const bs = [];
    if (Array.isArray(d.discovered.biomes)) {
      d.discovered.biomes.forEach((b) => {
        if (BIOME_KEYS.indexOf(b) >= 0 && bs.indexOf(b) < 0) bs.push(b);
      });
    }
    p.discovered.biomes = bs;
  }
  p._structSet = new Set(p.discovered.structures);
  p.solved = idList(d.solved, CAP.solved);
  p._solvedSet = new Set(p.solved);
  p.flags.victory = isObj(d.flags) && d.flags.victory === true && p.bossesDefeated[ZONE_COUNT - 1] === true;

  if (isObj(d.rewards)) {
    const ok = (a) => (Array.isArray(a) ? a.filter((k, i) => isRewardKey(k) && a.indexOf(k) === i).slice(0, CAP.rewards) : []);
    p.rewards.claimed = ok(d.rewards.claimed);
    p.rewards.pending = ok(d.rewards.pending).filter((k) => p.rewards.claimed.indexOf(k) < 0);
  }

  const s = isObj(d.stats) ? d.stats : {};
  STAT_COUNTERS.forEach((k) => { p.stats[k] = cnum(s[k], 0, STAT_LIMIT, 0); });
  p.stats.broken = loadCounterMap(s.broken, (k) => (/^\d{1,3}$/.test(k) && Number(k) <= MAX_BLOCK_ID ? k : null), true);
  p.stats.placed = loadCounterMap(s.placed, (k) => (/^\d{1,3}$/.test(k) && Number(k) <= MAX_BLOCK_ID ? k : null), true);
  p.stats.crafted = loadCounterMap(s.crafted, canonKey, true);
  p.stats.smeltedBy = loadCounterMap(s.smeltedBy, canonKey, true);
  p.stats.picked = loadCounterMap(s.picked, canonKey, true);
  p.stats.eaten = loadCounterMap(s.eaten, canonKey, true);
  p.stats.mobKinds = loadCounterMap(s.mobKinds, safeMobKey, true);
  p.stats.puzzlesByZone = loadCounterMap(s.puzzlesByZone, (k) => (/^[0-4]$/.test(k) ? k : null), true);
  if (isObj(s.parkourBest)) {
    const ks = Object.keys(s.parkourBest);
    for (let i = 0; i < ks.length && i < CAP.parkour; i++) {
      const id = safeId(ks[i]);
      const ms = cnum(s.parkourBest[ks[i]], 0, 86400000, 0);
      if (id !== null && ms >= 1) p.stats.parkourBest[id] = Math.floor(ms);
    }
  }

  const grid = decodeReveal(d.mapReveal);
  if (grid && grid.length === MAP_CELLS) {
    p.reveal = grid;
    p.revealCount = countRevealed(grid);
  }

  restoreQuests(p, d.quests);
  restoreAchievements(p, d.achievements);
  return true;
}
