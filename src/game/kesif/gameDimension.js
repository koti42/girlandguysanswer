/*
 * KEŞİF — BOYUT YÖNETİCİSİ (Neon Meridyen). Sözleşme KESIF_CITY_CONTRACT §5, §14, §15. Tek canlı boyut; `G.world` swap ile ATOMİK yeniden atanır.
 *
 *   createDimensionManager(G, deps?) → mgr
 *       deps: {render:{makeChunkManager(world,o), setChunkManager(cm)}, applyLook(dimId,G), now(), heapFraction(), cityPlan(seed), makeCtx?}
 *   mgr.current                       'overworld'|'neon'          (G.dim ile aynı)
 *   mgr.get(id) → DimCtx|null         ensure(id) → DimCtx (yoksa kurar; neon: dünya + em + prop katmanı + terminaller + kayıttan gelen blob)
 *   mgr.prewarm(id, {pos}) → bool     varış DimCtx'ini + GİZLİ ChunkManager'ı (1 işçi, r=3) kurar; yığın %85'in üstündeyse iptal (false)
 *   mgr.tickPrewarm(dt)               hazırlanan yöneticiyi varış noktasından sürer (frameUpdate)     mgr.cancelPrewarm(id?)
 *   mgr.readiness(radius)             etkin yöneticinin {ready, progress}'i (geçiş makinesi "hold" evresi)
 *   mgr.swap(to, {reason, arrival?, linkFrom?, home?, terminal?, silent?, refund?}) → {ok, from, to, pos} | {ok:false, reason}
 *   mgr.arrivalFor(to, opts) → {x,y,z,yaw,pitch}                varış noktası (güvenli ayakta durulabilir hâle çekilmiş)
 *   mgr.respawnPoint() → {x,y,z,yaw}|null                       şehir ölümü: en yakın BULUNMUŞ terminal (overworld: null)
 *   mgr.markTerminal(i) → bool                                   terminal bulundu (ilk kez ise true); ctx.spawn = o terminalin varış noktası
 *   mgr.saveParts() → {dim, dimMeta, dims, world, clock, weather, chests, em, puzzles, spawn, ref}   kayıt: üst düzey alanlar HER ZAMAN overworld'ündür
 *   mgr.serializeSystems(guard) → {ad: obj}                      oturum `systems` haritası (şehirdeyken boyuta özgü sistemler donmuş overworld anlık görüntüsünden)
 *   mgr.restoreMeta(dimMeta, dims)    kayıt yüklenirken dimMeta + dims blobu (şehir ctx'i tembel kurulurken uygulanır)
 *   mgr.dimMeta                       {calibrated, visits, firstArrival, link, overworldPos, lastHopAt} (G.dimMeta aynı nesne)
 *   mgr.stats                         {swaps, prewarms, prewarmAborts, staleWorldHits, lastSwapMs, ...} (G.dimStats aynı nesne)
 *   mgr.dispose()
 *
 * DIM_BOUND_FIELDS (tek dizi, SIRA SÖZLEŞME): swap bu alanları G'ye atar (world, tech, chests, em, spawner, puzzles, props, colliders, crowd, vehicles, clock,
 * weatherSim, spawn, chunkManager, worldRoot, entityRoot). Paylaşılanlar G'de kalır: envanter, hayatta kalma, gövde, yetenekler, ilerleme, büyü durumu, hud, girdi, ses, çizici.
 *
 * Swap sırası: (1) outgoing yakala (alanlar + çıkış pozu + overworld sistem anlık görüntüsü) → (2) sistemlere beforeDimension → (3) eski chunkManager
 * dispose({keepPool}) → (4) eski dünyayı 5×5 hariç boşalt + retire (bayat başvuru tuzağı) → (5) DIM_BOUND_FIELDS ata, G.dim → (6) yeni dünya revive,
 * yönetici (varsa prewarm'dan) havuzu devralır, render.setChunkManager → (7) gövdeyi varışa taşı (resetBody) → (8) her sistemin onDimension(G,from,to)
 * → (9) applyDimensionLook → (10) dimensionLeft/dimensionEntered/dimensionChanged olayları. Kilit (G.simFrozen) çağıranındır (geçiş makinesi).
 */
import { EntityManager } from './sim/entities.js';
import { Spawner } from './sim/spawner.js';
import { PuzzleManager } from './sim/puzzles/index.js';
import { createPropLayer, attachPropLayer } from './sim/props/propLayer.js';
import {
  cleanDimId, DIM_SAVE_LIMITS, getDim, TERMINAL_COUNT,
} from './sim/dim/dimensions.js';
import { createDimCtxSim, restoreDim, serializeDim } from './sim/dim/dimState.js';
import { sanitizeDimMeta } from './sim/dim/dimSanitize.js';
import {
  arrivalPoint, isTerminalFound, markTerminalFound, respawnTerminal, returnStash, takeBoundItems,
} from './sim/dim/travel.js';
import { getCityPlan } from './sim/city/cityPlan.js';
import { findSafeSpawn } from './gameWorld.js';
import { callSafe } from './gameCtx.js';

/** swap'ın G'ye atadığı boyuta bağlı alanlar (SIRA SÖZLEŞME). */
export const DIM_BOUND_FIELDS = Object.freeze([
  'world', 'tech', 'chests', 'em', 'spawner', 'puzzles', 'props', 'colliders', 'crowd', 'vehicles', 'clock', 'weatherSim', 'spawn', 'chunkManager', 'worldRoot', 'entityRoot',
]);

/** Şehirde donmuş overworld anlık görüntüsünden yazılan, boyuta özgü sistemler (diğerleri — büyü, oturum… — paylaşılır ve CANLI yazılır). */
export const PER_DIM_SYSTEMS = Object.freeze(['blocks', 'mobs', 'content', 'treefall', 'tech', 'props']);

export const PREWARM_RADIUS = 3;
export const HEAP_ABORT_FRACTION = 0.85;
/** Boştaki boyutta tutulan chunk karesi (çıkış çevresi 5×5). */
export const DORMANT_KEEP_RADIUS = 2;

/** Şehir cüzdanı başlangıç Kredisi (systems/vehicles.js START_KREDI ile aynı; test eşitliği denetler). */
export const NEON_START_KREDI = 100;

/** Şehirde organik doğma YOK: `neon` profilli doğurucu yalnızca dost/yaramaz robotları (sim/city/ped/robots.js) doğurur. */
function makeNeonSpawner(world, em, hooks) {
  return new Spawner({
    seed: world.seed, world, em, profile: 'neon', neon: hooks,
  });
}

function nowDefault() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function heapDefault() {
  try {
    const m = typeof performance !== 'undefined' ? performance.memory : null;
    if (m && m.jsHeapSizeLimit > 0) return m.usedJSHeapSize / m.jsHeapSizeLimit;
  } catch {
    /* yut */
  }
  return 0;
}

function pose(G) {
  const b = G.body;
  return {
    x: b.x, y: b.y, z: b.z, yaw: G.player.yaw, pitch: G.player.pitch,
  };
}

function toastLine(items) {
  return items.map((e) => (e.count > 1 ? e.count + '× ' : '') + e.item.replace(/^(item|blok):/, '').replace(/_/g, ' ')).join(', ');
}

export function createDimensionManager(G, deps) {
  const d = deps || {};
  const now = d.now || nowDefault;
  const heapFraction = d.heapFraction || heapDefault;
  const planFor = d.cityPlan || ((seed) => getCityPlan(seed));
  const ctxs = { overworld: null, neon: null };
  const stats = {
    swaps: 0, prewarms: 0, prewarmAborts: 0, staleWorldHits: 0, lastSwapMs: 0, stashed: 0, restored: 0, hops: 0, hookMs: {}, stageMs: {},
  };
  const dimMeta = sanitizeDimMeta(undefined);
  let current = cleanDimId(G.dim);
  let pendingDims = {};
  let disposed = false;
  let heapAbortFrac = HEAP_ABORT_FRACTION;

  G.dim = current;
  G.dimMeta = dimMeta;
  G.dimStats = stats;

  /* ---------------------------------------------------------------------------------------------
   * Bağlam (DimCtx) kurulumu
   * ------------------------------------------------------------------------------------------- */
  function emit(e) {
    G.emit(e);
  }

  function emDifficulty() {
    return G.survival && G.survival.easy ? 'easy' : 'normal';
  }

  function adoptOverworld() {
    const def = getDim('overworld');
    const ctx = {
      id: 'overworld',
      def,
      seed: G.seed,
      world: G.world,
      tech: G.tech || null,
      chests: G.chests,
      em: G.em,
      spawner: G.spawner,
      puzzles: G.puzzles,
      props: null,
      colliders: null,
      crowd: null,
      vehicles: null,
      clock: G.clock,
      weatherSim: G.weatherSim,
      spawn: G.spawn,
      terminals: { found: 0, list: null },
      locks: {},
      stash: [],
      city: null,
      chunkManager: G.chunkManager,
      worldRoot: G.worldRoot,
      entityRoot: G.entityRoot,
      exit: null,
      gate: null,
      sysSnap: null,
      prewarm: null,
      retired: false,
    };
    ctxs.overworld = ctx;
    return ctx;
  }

  function makeRoots(ctx) {
    const THREE = G.THREE;
    if (!THREE || !G.scene) return;
    ctx.worldRoot = new THREE.Group();
    ctx.worldRoot.name = 'kesif-dunya-' + ctx.id;
    ctx.entityRoot = new THREE.Group();
    ctx.entityRoot.name = 'kesif-varliklar-' + ctx.id;
    G.scene.add(ctx.worldRoot, ctx.entityRoot);
  }

  function terminalList(ctx) {
    try {
      const plan = planFor(ctx.world.seed);
      const out = [];
      for (let i = 0; i < TERMINAL_COUNT; i++) {
        const t = plan && plan.terminals ? plan.terminals[i] : null;
        out.push(t ? { x: t.x, y: t.y, z: t.z } : { x: 0, y: 64, z: 0 });
      }
      return out;
    } catch {
      return null;
    }
  }

  /** Şehir robotlarının oyun kancaları (kademe, sürüş, kısıtlı hareket, konuşma, dağılınca küçük Kredi). */
  function robotHooks(ctx) {
    return {
      tier: () => (G.quality && G.quality.settings ? G.quality.settings.effTier : 'high'),
      driving: () => !!(G.player && G.player.vehicle),
      gentle: () => !!(G.reducedMotion || G.accessibility),
      say: (text, key) => say(text, key),
      grantKredi: (n, why) => {
        if (!Number.isInteger(n) || n <= 0 || n > 1000000000) return false;
        if (!ctx.city || typeof ctx.city !== 'object') ctx.city = { v: 1 };
        const c = ctx.city;
        c.kredi = Math.min(1000000000, (Number.isInteger(c.kredi) ? c.kredi : NEON_START_KREDI) + n); // qa5: üst sınır = kayıt doğrulayıcısı (1e9)
        emit({
          type: 'kredi', value: c.kredi, delta: n, why: why || '',
        });
        return true;
      },
    };
  }

  function buildNeon() {
    const ctx = createDimCtxSim('neon', G.seed, { zoneUnlocked: () => true });
    ctx.exit = null;
    ctx.gate = null;
    ctx.sysSnap = null;
    ctx.prewarm = null;
    ctx.retired = false;
    ctx.crowd = null;
    ctx.vehicles = null;
    ctx.em = new EntityManager({
      seed: ctx.seed,
      world: ctx.world,
      emit: (e) => emit(e),
      difficulty: emDifficulty(),
      abilityLoot: false,
    });
    ctx.spawner = makeNeonSpawner(ctx.world, ctx.em, robotHooks(ctx));
    // şehirde bulmaca yok: boş yönetici (ownerAt → null, handleInteract → false) — null'a güvenmeyen okuyucular çökmesin
    ctx.puzzles = new PuzzleManager({
      world: ctx.world,
      seed: ctx.world.seed,
      emit: (e) => emit(e),
      spawnEntity: (type, x, y, z, o) => (ctx.em ? ctx.em.spawn(type, x, y, z, o) : null),
    });
    const tier = G.quality && G.quality.settings ? G.quality.settings.effTier : 'high';
    const layer = createPropLayer({ citySeed: ctx.world.seed, density: tier === 'low' ? 0.5 : tier === 'medium' ? 0.8 : 1 });
    ctx.props = layer.props;
    ctx.colliders = layer.colliders;
    attachPropLayer(ctx.world, layer);
    ctx.terminals.list = terminalList(ctx);
    const t0 = ctx.terminals.list ? ctx.terminals.list[0] : null;
    const a = arrivalPoint('neon', t0 || undefined);
    ctx.spawn = { x: a.x, y: a.y, z: a.z };
    makeRoots(ctx);
    if (pendingDims && pendingDims.neon) {
      const r = restoreDim(ctx, pendingDims.neon);
      if (r.ok) {
        delete pendingDims.neon;
        // kayıtlı spawn yoksa (eski blob) varsayılan kalır
      }
    }
    if (!ctx.spawn) ctx.spawn = { x: a.x, y: a.y, z: a.z };
    ctxs.neon = ctx;
    return ctx;
  }

  function ensure(id) {
    const key = cleanDimId(id);
    if (ctxs[key]) return ctxs[key];
    if (key === 'overworld') return adoptOverworld();
    return buildNeon();
  }

  function get(id) {
    return ctxs[cleanDimId(id)] || null;
  }

  /** Etkin boyutun canlı G alanlarını bağlama geri yazar (sistemler G.spawn/G.tech'i yeniden atamış olabilir). */
  function capture(ctx) {
    for (let i = 0; i < DIM_BOUND_FIELDS.length; i++) {
      const f = DIM_BOUND_FIELDS[i];
      ctx[f] = G[f] === undefined ? null : G[f];
    }
  }

  function bind(ctx) {
    for (let i = 0; i < DIM_BOUND_FIELDS.length; i++) {
      const f = DIM_BOUND_FIELDS[i];
      G[f] = ctx[f] === undefined ? null : ctx[f];
    }
    G.dim = ctx.id;
  }

  /* ---------------------------------------------------------------------------------------------
   * Dünya boşaltma / emeklilik
   * ------------------------------------------------------------------------------------------- */
  /** (cx,cz) çevresindeki (2r+1)² kare dışındaki tüm chunk'ları bellekten atar (düzenlemeler world.edits'te kalır). */
  function trimWorld(world, cx, cz, r) {
    const drop = [];
    world.forEachChunk((c) => {
      if (Math.abs(c.cx - cx) > r || Math.abs(c.cz - cz) > r) drop.push(c);
    });
    for (let i = 0; i < drop.length; i++) world.unloadChunk(drop[i].cx, drop[i].cz);
    return drop.length;
  }

  function retire(ctx) {
    if (!ctx.world || typeof ctx.world.retire !== 'function') return;
    ctx.world.retire({
      onStale: () => {
        stats.staleWorldHits++;
      },
    });
    ctx.retired = true;
  }

  function revive(ctx) {
    if (ctx.world && typeof ctx.world.revive === 'function') ctx.world.revive();
    ctx.retired = false;
  }

  /* ---------------------------------------------------------------------------------------------
   * ChunkManager yönetimi / prewarm
   * ------------------------------------------------------------------------------------------- */
  function makeManager(ctx, o) {
    if (typeof d.makeManager === 'function') return d.makeManager(ctx, o || {});
    if (d.render && typeof d.render.makeChunkManager === 'function') return d.render.makeChunkManager(ctx.world, o || {});
    return null;
  }

  function arrivalOf(ctx) {
    if (ctx.id === 'neon') {
      const list = ctx.terminals.list;
      return arrivalPoint('neon', list ? list[0] : undefined);
    }
    const l = dimMeta.link;
    if (l && Array.isArray(l.from)) return { x: l.from[0], y: l.from[1], z: l.from[2], yaw: l.from[3] || 0 };
    if (ctx.exit) return { x: ctx.exit.x, y: ctx.exit.y, z: ctx.exit.z, yaw: ctx.exit.yaw || 0 };
    const s = ctx.spawn || G.spawn;
    return { x: s.x, y: s.y, z: s.z, yaw: 0 };
  }

  function prewarm(id, o) {
    const key = cleanDimId(id);
    if (disposed || key === current) return false;
    if (heapFraction() >= heapAbortFrac) {
      stats.prewarmAborts++;
      return false;
    }
    const ctx = ensure(key);
    if (ctx.chunkManager) {
      if (o && o.pos) ctx.prewarm = { pos: o.pos, since: now() };
      return true;
    }
    const pos = (o && o.pos) || arrivalOf(ctx);
    revive(ctx);
    const cm = makeManager(ctx, { hidden: true, workerCount: 1, viewDist: PREWARM_RADIUS });
    if (!cm) return false;
    ctx.chunkManager = cm;
    ctx.prewarm = { pos: { x: pos.x, y: pos.y, z: pos.z }, since: now() };
    stats.prewarms++;
    return true;
  }

  function tickPrewarm() {
    for (const id of ['overworld', 'neon']) {
      const ctx = ctxs[id];
      if (!ctx || !ctx.prewarm || !ctx.chunkManager || id === current) continue;
      if (heapFraction() >= heapAbortFrac) {
        cancelPrewarm(id);
        stats.prewarmAborts++;
        continue;
      }
      ctx.chunkManager.update(ctx.prewarm.pos, null, 2.5);
    }
  }

  function cancelPrewarm(id) {
    const ids = id ? [cleanDimId(id)] : ['overworld', 'neon'];
    for (let i = 0; i < ids.length; i++) {
      const ctx = ctxs[ids[i]];
      if (!ctx || !ctx.prewarm || ids[i] === current) continue;
      if (ctx.chunkManager) {
        try { ctx.chunkManager.dispose(); } catch { /* yut */ }
        ctx.chunkManager = null;
      }
      ctx.prewarm = null;
      const p = arrivalOf(ctx);
      trimWorld(ctx.world, Math.floor(p.x) >> 4, Math.floor(p.z) >> 4, DORMANT_KEEP_RADIUS);
      retire(ctx);
    }
  }

  function readiness(radius) {
    const cm = G.chunkManager;
    if (!cm || typeof cm.readiness !== 'function') return { ready: true, progress: 1 };
    return cm.readiness(radius === undefined ? PREWARM_RADIUS : radius);
  }

  /* ---------------------------------------------------------------------------------------------
   * Varış / yeniden doğuş
   * ------------------------------------------------------------------------------------------- */
  function settle(ctx, p, maxR) {
    const w = ctx.world;
    const sp = findSafeSpawn(w, p.x, p.y, p.z, { maxR: maxR || 28, lazy: true });
    return {
      x: sp.x, y: sp.y, z: sp.z, yaw: p.yaw || 0, pitch: Number.isFinite(p.pitch) ? p.pitch : 0, ok: sp.ok,
    };
  }

  function arrivalFor(to, o) {
    const opts = o || {};
    const ctx = ensure(to);
    let base;
    if (opts.arrival) base = opts.arrival;
    else if (ctx.id === 'neon') {
      const list = ctx.terminals.list;
      const idx = Number.isInteger(opts.terminal) ? opts.terminal : 0;
      base = arrivalPoint('neon', list && list[idx] ? list[idx] : undefined);
      // Kapı Meydanı terminali meydanın merkezindedir: ilk bakış terminalin yakın planı yerine meydana/gökdelenlere olsun (uzak terminaller zaten merkeze bakar)
      const t0 = list && list[idx] ? list[idx] : { x: 0, z: 0 };
      if (Math.abs(t0.x) < 0.5 && Math.abs(t0.z) < 0.5) base = { x: base.x, y: base.y, z: base.z, yaw: base.yaw + Math.PI };
    } else if (opts.home) {
      const s = ctx.spawn || G.spawn;
      base = { x: s.x, y: s.y, z: s.z, yaw: 0 };
    } else base = arrivalOf(ctx);
    return base;
  }

  function respawnPoint() {
    if (current === 'overworld') return null;
    const ctx = ctxs[current];
    const rt = respawnTerminal(ctx, G.body);
    const p = rt.arrival;
    const out = settle(ctx, p, 12);
    return {
      x: out.x, y: out.y, z: out.z, yaw: p.yaw, index: rt.index,
    };
  }

  function markTerminal(i) {
    const ctx = ctxs[current];
    if (!ctx || current !== 'neon') return false;
    const first = markTerminalFound(ctx.terminals, i);
    const list = ctx.terminals.list;
    if (list && list[i]) {
      const a = arrivalPoint('neon', list[i]);
      ctx.spawn = { x: a.x, y: a.y, z: a.z };
      G.spawn = ctx.spawn;
    }
    return first;
  }

  /* ---------------------------------------------------------------------------------------------
   * Swap
   * ------------------------------------------------------------------------------------------- */
  function runHook(name, from, to) {
    const list = G.registry.list().slice();
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      if (typeof s[name] !== 'function') continue;
      const t0 = now();
      callSafe(G, s, name, () => s[name](G, from, to));
      stats.hookMs[name + ':' + s.name] = Math.round((now() - t0) * 10) / 10;
    }
  }

  function snapshotSystems(ctx) {
    ctx.sysSnap = G.registry.serialize(G, (sys, fn) => {
      try {
        return fn();
      } catch (err) {
        if (G.opts && G.opts.strictSystems) throw err;
        return undefined;
      }
    });
  }

  function say(text, key) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: 6500, priority: 4, key: key || 'dim:toast', cooldown: 500 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function stashOnLeave(fctx) {
    if (fctx.id !== 'neon' || !G.inventory) return;
    const r = takeBoundItems(G.inventory);
    if (r.bound.length === 0) return;
    for (let i = 0; i < r.bound.length && fctx.stash.length < DIM_SAVE_LIMITS.stash; i++) fctx.stash.push(r.bound[i]);
    stats.stashed += r.bound.length;
    say('Şehir eşyaların saklandı: ' + toastLine(r.bound) + '. Neon Meridyen\'e dönünce geri verilecek.', 'dim:stash');
  }

  function stashOnEnter(tctx) {
    if (tctx.id !== 'neon' || !G.inventory || tctx.stash.length === 0) return;
    const r = returnStash(G.inventory, tctx.stash);
    tctx.stash.length = 0;
    for (let i = 0; i < r.rest.length; i++) tctx.stash.push(r.rest[i]);
    if (r.returned.length > 0) {
      stats.restored += r.returned.length;
      say('Şehir eşyaların geri verildi: ' + toastLine(r.returned) + '.', 'dim:stash');
    }
  }

  function swap(to, o) {
    const opts = o || {};
    const target = cleanDimId(to);
    if (disposed) return { ok: false, reason: 'atildi' };
    if (target === current) return { ok: false, reason: 'ayni' };
    const t0 = now();
    const stage = (k, t) => { stats.stageMs[k] = Math.round((now() - t) * 10) / 10; return now(); };
    let tp = now();
    const from = current;
    const fctx = ensure(from);
    const tctx = ensure(target);
    tp = stage('ensure', tp);
    // (1) outgoing: alanları + çıkış pozunu yakala
    capture(fctx);
    fctx.exit = pose(G);
    if (from === 'overworld') snapshotSystems(fctx);
    stashOnLeave(fctx);
    if (from === 'neon' && fctx.spawner && typeof fctx.spawner.clearMobs === 'function') fctx.spawner.clearMobs(); // şehirden çıkarken robotlar kaldırılır
    tp = stage('capture', tp);
    // (2) çalışmakta olan işleri eski dünyada bitirme fırsatı (treefall kuyruğu vb.)
    runHook('beforeDimension', fctx, tctx);
    tp = stage('before', tp);
    // (3) eski yönetici: havuzu devret
    let pool = null;
    if (fctx.chunkManager) {
      pool = fctx.chunkManager.dispose({ keepPool: true });
      fctx.chunkManager = null;
    }
    if (G.particles && typeof G.particles.clear === 'function') G.particles.clear();
    // (4) eski dünya: çıkış çevresi hariç boşalt + retire
    const ex = fctx.exit;
    trimWorld(fctx.world, Math.floor(ex.x) >> 4, Math.floor(ex.z) >> 4, DORMANT_KEEP_RADIUS);
    retire(fctx);
    tp = stage('dispose+trim', tp);
    // (5)(6) yeni dünya: yönetici (prewarm'dan ya da yeni) + havuz
    revive(tctx);
    let cm = tctx.chunkManager;
    if (!cm) cm = makeManager(tctx, { viewDist: G.chunkManager ? G.chunkManager.getViewDist() : undefined, pool: pool || undefined });
    else if (pool) {
      const adopted = typeof cm.adoptPool === 'function' ? cm.adoptPool(pool) : false;
      if (!adopted) pool.dispose();
    }
    tctx.chunkManager = cm;
    tctx.prewarm = null;
    bind(tctx);
    if (d.render && typeof d.render.setChunkManager === 'function' && cm) d.render.setChunkManager(cm);
    current = target;
    tp = stage('bind', tp);
    // (7) gövde: varış
    const base = arrivalFor(target, opts);
    const pos = settle(tctx, base, opts.maxR);
    if (typeof G.teleport === 'function') G.teleport(pos.x, pos.y, pos.z, { safe: false, yaw: pos.yaw, pitch: pos.pitch });
    if (opts.linkFrom && target === 'neon') {
      dimMeta.link = { from: [opts.linkFrom.x, opts.linkFrom.y, opts.linkFrom.z, opts.linkFrom.yaw || 0] };
      dimMeta.overworldPos = [fctx.exit.x, fctx.exit.y, fctx.exit.z];
    }
    if (target === 'neon') {
      dimMeta.visits++;
      if (!dimMeta.firstArrival) dimMeta.firstArrival = Math.floor(typeof Date !== 'undefined' ? Date.now() : 1);
    }
    if (opts.reason === 'gate' || opts.reason === 'terminal' || opts.reason === 'home') {
      dimMeta.lastHopAt = Math.round(G.time.seconds * 100) / 100;
      stats.hops++;
    }
    stashOnEnter(tctx);
    tp = stage('teleport', tp);
    // (8) sistemler
    runHook('onDimension', fctx, tctx);
    tp = stage('systems', tp);
    // (9) görünüm
    if (typeof d.applyLook === 'function') callSafe(G, { name: 'dimension' }, 'applyLook', () => d.applyLook(target, G));
    stage('look', tp);
    // (10) olaylar
    const first = target === 'neon' && dimMeta.visits === 1;
    if (!opts.silent) {
      emit({ type: 'dimensionLeft', dim: from });
      emit({ type: 'dimensionEntered', dim: target, first });
      emit({ type: 'dimensionChanged', from, to: target, reason: opts.reason || 'swap' });
    }
    stats.swaps++;
    stats.lastSwapMs = now() - t0;
    G.markDirty && G.markDirty('all');
    return { ok: true, from, to: target, pos, first };
  }

  /* ---------------------------------------------------------------------------------------------
   * Kayıt
   * ------------------------------------------------------------------------------------------- */
  function liveCtx() {
    const c = ctxs[current] || ensure(current);
    capture(c);
    return c;
  }

  function saveParts() {
    const cur = liveCtx();
    const ow = ctxs.overworld || cur;
    const dims = {};
    const neon = ctxs.neon;
    let ref = null;
    if (neon) {
      const exit = current === 'neon' ? pose(G) : neon.exit;
      ref = exit ? [exit.x, exit.z] : null;
      if (current === 'neon') neon.spawn = neon.spawn || G.spawn;
      const blob = serializeDim(neon, { ref });
      if (blob) dims.neon = blob;
    } else if (pendingDims && pendingDims.neon) {
      dims.neon = pendingDims.neon;
    }
    const meta = Object.assign({}, dimMeta);
    if (current === 'overworld') meta.overworldPos = meta.overworldPos || null;
    return {
      dim: current,
      dimMeta: meta,
      dims,
      world: ow.world,
      clock: ow.clock,
      weather: ow.weatherSim,
      chests: ow.chests,
      em: ow.em,
      puzzles: ow.puzzles,
      spawn: ow.spawn,
      tech: ow.tech,
      ref,
    };
  }

  function serializeSystems(guard) {
    const live = G.registry.serialize(G, guard);
    if (current === 'overworld') return live;
    const ow = ctxs.overworld;
    const snap = ow && ow.sysSnap ? ow.sysSnap : {};
    for (let i = 0; i < PER_DIM_SYSTEMS.length; i++) {
      const k = PER_DIM_SYSTEMS[i];
      if (Object.prototype.hasOwnProperty.call(snap, k)) live[k] = snap[k];
      else delete live[k];
    }
    return live;
  }

  function restoreMeta(meta, dims) {
    const m = sanitizeDimMeta(meta);
    Object.keys(dimMeta).forEach((k) => { dimMeta[k] = m[k]; });
    pendingDims = dims && typeof dims === 'object' ? Object.assign({}, dims) : {};
  }

  /** Kayıt şehirde açıldı: overworld tamamen kurulduktan SONRA sessizce şehre geçilir (çağıran: game.js, sistem restore'larından sonra). */
  function startIn(dim, p) {
    const target = cleanDimId(dim);
    if (target === current) return { ok: false, reason: 'ayni' };
    return swap(target, {
      reason: 'restore', silent: true, arrival: p ? { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch } : undefined, maxR: 12,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ['overworld', 'neon'].forEach((id) => {
      const c = ctxs[id];
      if (!c) return;
      if (c.chunkManager && c.chunkManager !== G.chunkManager) {
        try { c.chunkManager.dispose(); } catch { /* yut */ }
      }
      if (id === 'neon') {
        if (c.worldRoot && c.worldRoot.parent) c.worldRoot.parent.remove(c.worldRoot);
        if (c.entityRoot && c.entityRoot.parent) c.entityRoot.parent.remove(c.entityRoot);
      }
      if (c.world && c.world !== G.world) {
        try { c.world.dispose(); } catch { /* yut */ }
      }
    });
  }

  const mgr = {
    get current() {
      return current;
    },
    get stats() {
      return stats;
    },
    get disposed() {
      return disposed;
    },
    dimMeta,
    get,
    ensure,
    prewarm,
    tickPrewarm,
    cancelPrewarm,
    readiness,
    swap,
    arrivalFor,
    respawnPoint,
    markTerminal,
    isTerminalFound(i) {
      const c = ctxs.neon;
      return !!c && isTerminalFound(c.terminals, i);
    },
    saveParts,
    serializeSystems,
    restoreMeta,
    startIn,
    capture,
    liveCtx,
    trimWorld,
    setHeapAbort(f) {
      heapAbortFrac = f > 0 ? f : HEAP_ABORT_FRACTION;
    },
    say,
    dispose,
  };
  // overworld bağlamı hemen benimsenir (G.world şu anki canlı dünyadır)
  adoptOverworld();
  return mgr;
}
