/*
 * KEŞİF mobs sistemi — dünya bağlantısı: em/spawner bağlamı, boss arenaları ve güvenli bölgeler (yapı verisinden), chunk sürüleri,
 * zorluk, boss doğurma/tekilleştirme, güvenli bölgeden düşman çıkarma.
 *
 *   createWorldGlue(G) → { init(), update(dt, body), emCtx, spawnCtx, refs, difficulty }
 *
 *  - peaceful: inşa/harita modunda düşman hiç doğmaz ve saldırmaz. Kolay mod (macera): doğal düşman doğmaz ama boss'lar savaşır
 *    (hasar zaten 0; böylece ilerleme kilitlenmez). em.peaceful yalnızca inşa/harita.
 *  - ilk gece adaleti (sim/earlyGame.js): 0. bölge + demir yok + ilk geceler + başlangıca yakınlık → spawnCtx.early.grace (doğma tavanı/aralığı/
 *    mesafesi) ve em.earlyMul/aggroMul (hasar tırmanışı, kovalama menzili); koruma yokken çarpanlar 1.
 *  - arenas: içerik sisteminin G.arenas listesi ({x,z,r,done,zone,key,y}); yoksa yapı verisinin `boss` alanı. Spawner'da bitmemiş
 *    arena çevresinde doğma yok; em boss'a arenasını verir.
 *  - safes: G.safeZones (kamp/köy güvenli yarıçapı; yoksa yapı verisi) — spawner'a pseudo-arena olarak verilir, içeri giren düşman sönerek yok edilir.
 *  - Boss doğurma: arena yakınlaşılınca (90 blok), chunk yüklüyse ve bölge boss'u yenilmediyse; zaten varsa (içerik sistemi doğurmuş
 *    olabilir) tekrar doğurmaz; aynı arenada çift boss varsa fazlası sessizce kaldırılır.
 */
import { structuresInRegion, warmStructures } from '../sim/structures.js';
import { populateChunk } from '../sim/spawner.js';
import { dayFactor } from '../sim/daynight.js';
import { CHUNK_SIZE, zoneIndexAt } from '../sim/constants.js';
import { difficultyOf } from '../sim/combat.js';
import { earlyGrace, hasIronGear } from '../sim/earlyGame.js';
import {
  chunkOffsets, deriveWorldRefs, inCircle, pickDifficulty, shouldEvictFromSafe,
} from './mobsLogic.js';

const REFRESH_EVERY = 1.5;
const REGION = 200;
const BOSS_NEAR = 90;
const POP_RADIUS = 5;
const POP_BUDGET = 2;

export function createWorldGlue(G, c) {
  const em = G.em;
  const world = G.world;
  const refs = { arenas: [], safes: [] };
  const spawnArenas = [];
  const emCtx = {
    dayFactor: 1, peaceful: false, pickup: null, luck: 0, arenas: null,
  };
  const early = { grace: 0 };
  const spawnCtx = {
    dayFactor: 1, peaceful: false, arenas: null, early,
  };
  const popDone = new Set();
  const state = {
    refreshT: 0, slowT: 0, popT: 0, earlyT: 0, lastX: 1e9, lastZ: 1e9, difficulty: 'normal', failed: false, structuresOk: false,
  };

  emCtx.pickup = (item, count, dur, ench, charge) => {
    if (typeof G.pickupItem === 'function') return G.pickupItem(item, count, dur, ench, charge); // blocks sistemi (ses/olay dahil)
    const inv = G.inventory;
    if (!inv) return count;
    return dur !== undefined || charge !== undefined ? inv.addStack(item, count, dur, ench, charge) : inv.add(item, count);
  };

  function init() {
    if (G.mode !== 'macera') return;
    try {
      warmStructures(G.seed);
      state.structuresOk = true;
    } catch {
      state.failed = true;
    }
  }

  function emPeaceful() {
    return G.mode === 'insa' || G.mode === 'harita';
  }

  /** İçerik sistemi G.arenas / G.safeZones doldurur (canlı: done/unlocked); yoksa yapı verisinden türet. */
  function refreshRefs(b) {
    if (G.mode !== 'macera') return;
    if (Array.isArray(G.arenas) || Array.isArray(G.safeZones)) {
      refs.arenas.length = 0;
      refs.safes.length = 0;
      const ar = Array.isArray(G.arenas) ? G.arenas : [];
      for (let i = 0; i < ar.length; i++) {
        const a = ar[i];
        if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.z)) continue;
        refs.arenas.push({
          x: a.x, z: a.z, r: a.r > 0 ? a.r : 22, done: !!a.done, zone: a.zone, key: a.key, y: a.y, name: a.name,
        });
      }
      const sz = Array.isArray(G.safeZones) ? G.safeZones : [];
      for (let i = 0; i < sz.length; i++) {
        const z = sz[i];
        if (z && z.r > 0) refs.safes.push({ x: z.x, z: z.z, r: z.r });
      }
    } else if (!state.failed) {
      try {
        const list = structuresInRegion(G.seed, b.x - REGION, b.z - REGION, b.x + REGION, b.z + REGION);
        deriveWorldRefs(list, G.progression ? G.progression.bossesDefeated : null, refs);
      } catch {
        state.failed = true;
        refs.arenas.length = 0;
        refs.safes.length = 0;
      }
    }
    spawnArenas.length = 0;
    for (let i = 0; i < refs.arenas.length; i++) spawnArenas.push(refs.arenas[i]);
    for (let i = 0; i < refs.safes.length; i++) {
      spawnArenas.push({ x: refs.safes[i].x, z: refs.safes[i].z, r: refs.safes[i].r, done: false });
    }
  }

  function bossesAt(a) {
    const out = [];
    em.mobs.forEach((e) => {
      if (!e.def.boss || e.isClone || e.removed || e.key !== a.key) return;
      const dx = e.home.x - a.x;
      const dz = e.home.z - a.z;
      if (dx * dx + dz * dz <= (a.r + 12) * (a.r + 12)) out.push(e);
    });
    return out;
  }

  function maintainBosses(b) {
    for (let i = 0; i < refs.arenas.length; i++) {
      const a = refs.arenas[i];
      if (!a.key) continue;
      const found = bossesAt(a);
      if (found.length > 1) {
        found.sort((p, q) => p.id - q.id);
        for (let k = 1; k < found.length; k++) em.despawn(found[k].id);
        continue;
      }
      const defeated = !!(G.progression && G.progression.bossesDefeated && G.progression.bossesDefeated[a.zone]);
      if (found.length === 1 || a.done || defeated) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      if (dx * dx + dz * dz > BOSS_NEAR * BOSS_NEAR) continue;
      if (!world.hasChunk(Math.floor(a.x) >> 4, Math.floor(a.z) >> 4)) continue;
      em.spawnBoss(a.key, a.x, a.y, a.z, { arena: { x: a.x, z: a.z, r: a.r } });
    }
  }

  function evictFromSafe() {
    if (refs.safes.length === 0) return;
    const gone = [];
    em.mobs.forEach((e) => {
      if (shouldEvictFromSafe(e, refs.safes)) gone.push(e);
    });
    for (let i = 0; i < gone.length; i++) em.dismiss(gone[i], 'mobFade');
  }

  function populate(b) {
    if (G.mode !== 'macera') return;
    const pcx = Math.floor(b.x / CHUNK_SIZE);
    const pcz = Math.floor(b.z / CHUNK_SIZE);
    const offs = chunkOffsets(POP_RADIUS);
    let budget = POP_BUDGET;
    for (let i = 0; i < offs.length && budget > 0; i++) {
      const cx = pcx + offs[i][0];
      const cz = pcz + offs[i][1];
      const key = (cx + 4096) * 8192 + (cz + 4096);
      if (popDone.has(key)) continue;
      if (!world.hasChunk(cx, cz)) continue;
      popDone.add(key);
      budget--;
      populateChunk(em, world, G.seed, cx, cz, null);
    }
  }

  /** Koruma derecesi (0..1) + em çarpanları. Yarım saniyede bir; ceza yok: yalnızca macera modunda anlamlı. */
  function refreshEarly(b) {
    let g = 0;
    if (G.mode === 'macera' && G.clock) {
      const sp = G.spawn;
      const dist = sp && Number.isFinite(sp.x) ? Math.hypot(b.x - sp.x, b.z - sp.z) : undefined;
      g = earlyGrace({
        zone: zoneIndexAt(b.x, b.z), day: G.clock.day, ironGear: hasIronGear(G.inventory), dist,
      });
    }
    early.grace = g;
    const tn = g > 0 && G.spawner ? G.spawner.tune : null;
    em.earlyMul = tn ? tn.dmgMul : 1;
    em.aggroMul = difficultyOf(em.difficulty).aggroMul * (tn ? tn.aggroMul : 1);
  }

  function update(dt, b) {
    const sv = G.survival;
    // bağlamlar
    const df = dayFactor(G.clock);
    emCtx.dayFactor = df;
    spawnCtx.dayFactor = df;
    emCtx.peaceful = emPeaceful();
    spawnCtx.peaceful = emPeaceful() || !!sv.easy;
    emCtx.arenas = refs.arenas.length > 0 ? refs.arenas : null;
    spawnCtx.arenas = spawnArenas.length > 0 ? spawnArenas : null;

    state.refreshT -= dt;
    if (state.refreshT <= 0) {
      state.refreshT = REFRESH_EVERY;
      const moved = Math.abs(b.x - state.lastX) + Math.abs(b.z - state.lastZ);
      if (moved > 12 || state.lastX > 1e8 || Array.isArray(G.arenas)) {
        state.lastX = b.x;
        state.lastZ = b.z;
        refreshRefs(b);
      }
    }
    state.slowT -= dt;
    if (state.slowT <= 0) {
      state.slowT = 1;
      const d = pickDifficulty({ easy: sv.easy, mode: G.mode, assist: c.assistActive() });
      if (d !== state.difficulty || em.difficulty !== d) {
        state.difficulty = d;
        em.setDifficulty(d);
      }
      if (G.mode === 'macera') {
        maintainBosses(b);
        evictFromSafe();
      }
    }
    state.earlyT -= dt;
    if (state.earlyT <= 0) {
      state.earlyT = 0.5;
      refreshEarly(b);
    }
    state.popT -= dt;
    if (state.popT <= 0) {
      state.popT = 0.5;
      populate(b);
    }
  }

  return {
    init,
    update,
    emCtx,
    spawnCtx,
    refs,
    state,
    isSafe: (x, z) => !!inCircle(refs.safes, x, z, 0),
    invalidate() {
      state.lastX = 1e9;
      state.refreshT = 0;
    },
    resetPopulation() {
      popDone.clear();
      state.lastX = 1e9;
      state.refreshT = 0;
    },
    get difficulty() { return state.difficulty; },
  };
}
