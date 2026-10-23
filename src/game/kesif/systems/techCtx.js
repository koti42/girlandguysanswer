/*
 * KEŞİF tech sistemi — ortak yardımcılar: tick bağlamı, konuma yakınlık, ipucu/okuma sınırlayıcı, eşya verme/bırakma.
 *
 *   createTickCtx(G) → ctx           TechState.tick bağlamı (dünya, gün ışığı, hava, oyuncu, envanter, sandık, bırakma, doluluk)
 *   weatherKind(G) → 'clear'|'rain'|'storm'
 *   nearPlayer(G, x, y, z, r) → bool        merkez (x+.5,y+.5,z+.5) oyuncuya r blok içinde mi
 *   say(T, key, text, opts)          ipucu + sesli okuma (aynı anahtar cooldown'lu)
 *   giveItems(G, list, x, y, z)      önce envantere, sığmayan yere (fırlatma); döner: yere düşen adet
 *   dropItems(G, list, x, y, z)      yere saçar
 *   zoneUnlockedAt(G, x, z)          bu (x,z) bölgesi açık mı (mühür kuralı)
 */
import { B } from '../sim/blocks.js';
import { dayFactor } from '../sim/daynight.js';
import { zoneIndexAt } from '../sim/constants.js';
import { structuresInRegion } from '../sim/structures.js';
import { indoorAt } from '../sim/props/propIndoor.js';
import { openChestSlots } from './blocksChest.js';
import { overlapsMobs, overlapsPlayer } from './blocksCore.js';

export function weatherKind(G) {
  const w = G.weatherSim;
  if (!w || !(w.intensity > 0.05) || w.renderKind === 'clear') return 'clear';
  if (w.renderKind === 'rain' && w.intensity > 0.8) return 'storm';
  return w.intensity > 0.25 ? 'rain' : 'clear';
}

export function nearPlayer(G, x, y, z, r) {
  const b = G.body;
  if (!b) return false;
  const dx = x + 0.5 - b.x;
  const dy = y + 0.5 - (b.y + 0.9);
  const dz = z + 0.5 - b.z;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

export function zoneUnlockedAt(G, x, z) {
  const w = G.world;
  if (!w || typeof w.isZoneUnlocked !== 'function') return true;
  return w.isZoneUnlocked(zoneIndexAt(x, z));
}

/** Kilit/kapı mantığı taşıyan yapılar: duvarlarına portal açılmaz, matkap bu yapının içine kazmaz. */
export const GATED_STRUCTURES = Object.freeze(['bossarena', 'muhursunagi']);

/**
 * Neon Meridyen: (x,y,z) hücresi bir İÇ MEKÂN hacminin ya da duvar halkasının (±1) içinde mi? Kapı/kilit mantığı taşıyan odalara portal açılmaz ve matkap kazmaz
 * (ışın kapı proplarından geçer: kilitli kapının ardındaki odaya portal açıp kilidi atlamak engellenir; qa_p2).
 */
export function cityInteriorGatedAt(G, x, y, z) {
  const w = G.world;
  if (!w || w.dim !== 'neon' || !Number.isFinite(x + y + z)) return false;
  const seed = w.seed;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      let c = null;
      try {
        c = indoorAt(seed, x + dx + 0.5, z + dz + 0.5);
      } catch {
        c = null;
      }
      if (c && c.bp && c.bp.interior && y >= 63 && y <= c.bp.interior.y1 + 1) return true;
    }
  }
  return false;
}

/** (x,y,z) hücresi kilitli yapıların (boss arenası, mühür sunağı; şehirde iç mekânlar) sınırında mı? (±1 pay) */
export function structureGatedAt(G, x, y, z) {
  if (cityInteriorGatedAt(G, x, y, z)) return true;
  let list = [];
  try {
    list = structuresInRegion(G.seed, x, z, x, z);
  } catch {
    return false;
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (GATED_STRUCTURES.indexOf(s.type) < 0 || !s.bounds) continue;
    const b = s.bounds;
    if (x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1) return true;
  }
  return false;
}

/** Parkur koşusu sürüyor mu? (jetpack gibi portal/ışınlanma/asansör de kapanır: rekor ve ödül adil kalsın) */
export function parkourActive(G) {
  return !!(G.hud && G.hud.parkour);
}

/** Bulmaca odasına (G.puzzles.ownerAt) ait hücre mi? */
export function puzzleOwned(G, x, y, z) {
  return !!(G.puzzles && typeof G.puzzles.ownerAt === 'function' && G.puzzles.ownerAt(x, y, z));
}

export function dropItems(G, list, x, y, z) {
  if (!list || list.length === 0 || !G.em || typeof G.em.spawnItem !== 'function') return 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || !(d.count > 0)) continue;
    const a = (i * 2.399) % (Math.PI * 2);
    const o = {
      vx: Math.cos(a) * 0.9, vy: 2.6, vz: Math.sin(a) * 0.9, delay: 0.5,
    };
    if (d.dur !== undefined) o.dur = d.dur;
    if (d.ench) o.ench = d.ench;
    if (d.charge !== undefined) o.charge = d.charge;
    if (G.em.spawnItem(d.item, d.count, x + 0.5, y + 0.6, z + 0.5, o)) n += d.count;
  }
  return n;
}

export function giveItems(G, list, x, y, z) {
  const inv = G.inventory;
  let dropped = 0;
  const rest = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    if (!d || !(d.count > 0)) continue;
    const left = inv ? inv.addStack(d.item, d.count, d.dur, d.ench, d.charge) : d.count;
    if (left > 0) rest.push({ item: d.item, count: left });
  }
  if (rest.length) {
    const b = G.body;
    dropped = dropItems(G, rest, x !== undefined ? x : b.x - 0.5, y !== undefined ? y : b.y + 0.4, z !== undefined ? z : b.z - 0.5);
  }
  return dropped;
}

export function say(T, key, text, opts) {
  const G = T.G;
  const o = opts || {};
  const t = G.time ? G.time.seconds : 0;
  const gap = o.cooldown !== undefined ? o.cooldown : 2.5;
  const last = T.sayT[key];
  if (last !== undefined && t >= last && t - last < gap) return false;
  T.sayT[key] = t;
  if (o.hint !== false) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: Math.round((o.secs || 3) * 1000), priority: o.priority || 3, key: 'tech:' + key, cooldown: Math.round(gap * 1000) });
    else if (G.hud) G.hud.hint = text;
  }
  if (o.speak !== false && typeof G.speak === 'function') G.speak(text);
  return true;
}

export function createTickCtx(G) {
  return {
    world: G.world,
    daylight: 1,
    weather: 'clear',
    player: G.body,
    inventory: G.inventory,
    chestAt(x, y, z) {
      try {
        return openChestSlots(G, x, y, z);
      } catch {
        return null;
      }
    },
    drop(d) {
      dropItems(G, [{ item: d.item, count: d.count }], d.x, d.y, d.z);
    },
    isOccupied(x, y, z) {
      return overlapsPlayer(G, x, y, z, B.TECH_DOOR) || overlapsMobs(G, x, y, z, B.TECH_DOOR);
    },
    /** Otomatik Madenci güvenliği: bulmaca odası, kilitli bölge, boss arenası / mühür sunağı kırılmaz (matkap 'korumali' durur). */
    canMine(x, y, z) {
      return !puzzleOwned(G, x, y, z) && zoneUnlockedAt(G, x, z) && !structureGatedAt(G, x, y, z);
    },
    refresh() {
      this.daylight = G.clock ? dayFactor(G.clock) : 1;
      this.weather = weatherKind(G);
      this.player = G.body;
      this.inventory = G.inventory;
      this.world = G.world;
    },
  };
}
