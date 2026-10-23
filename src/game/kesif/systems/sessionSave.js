/*
 * KEŞİF — oturum kaydı: serileştirme (artımlı düzenleme önbelleği), geri yükleme ve otomatik kayıt zamanlayıcısı.
 *
 *   createEditsCache(perfFn?) → { build(world) → {chunks:{"cx,cz":b64}, count, chunkCount}, warm(world, budgetMs) → kalan bayat chunk, size }
 *       sim/saveEdits.encodeEdits ile BİREBİR aynı çıktı; ama yalnızca değişen chunk'ları yeniden kodlar (sürüm + boyut + (yüklü
 *       olmayan chunk için) sağlama toplamı imzası). Çok düzenlenmiş dünyada ikinci ve sonraki kayıtlar ≈ 0 ms.
 *   buildSave(G, ctx) → save nesnesi                 ctx: {reason, name, createdAt, now, edits(cache)}
 *   insaBaseOf(save) → 'düz'|'ada'|'boş'|'çayır'|undefined      inşa kaydını açarken createKesifGame({base}) için
 *   readExt(raw) → {em:{nextId,time,rng,difficulty,populated}|null, ...}     güvenli okuma (bulut kaydı güvenilmez)
 *   resolveRestorePosition(world, x, y, z) → {x,y,z,how}                      kayıttaki konumu güvenli yere oturtur
 *   restoreFromSave(G, raw) → {ok, code?, error?, warnings:[], name, createdAt, systems|null, intro:boolean}
 *   createSaver(G, deps?) → {
 *       request(reason, opts?), save(reason, opts?) → {save, summary, bytes, ms}|null, tick(dt), summary(), stats, dispose() }
 *
 * Kayıt biçimi sim/save.js v1'dir; ek alanlar (bilinmeyenleri deserializeGame atar, biz ham nesneden okuruz):
 *   systems : {sistemAdı: obj}      G.registry.serialize (blocks/mobs/content kendi durumunu yazar)
 *   ext     : {v:1, em:{nextId,time,rng,difficulty,populated}, spawn:[x,y,z], bed:[x,y,z], intro:bool, insa:{base,title,time}}
 * Ölüyken kayıt "yeniden doğmuş" hâli yazar (konum = yatak/doğuş noktası, can dolu): yüklenince ölüm döngüsü olmaz.
 *
 * Boyutlar (Neon Meridyen, G.dimMgr varsa): üst düzey alanlar (düzenlemeler, saat, hava, sandıklar, varlıklar, bulmaca) HER ZAMAN overworld'ündür
 * (dimMgr.saveParts: şehirdeyken overworld donmuştur); `player.pos` bulunulan boyutun konumudur, `player.dim`/`dimMeta`/`dims.neon` şehri taşır.
 * Şehirde açılan kayıtta overworld normal kurulur, sistem durumları yüklenir ve `G.dimBoot` ile ekran kapalı şehre geçilir (game.js).
 */
import {
  applyGame, deserializeGame, estimateSaveSize, serializeGame, summarizeSave,
} from '../sim/save.js';
import { buildCloudEnvelope } from '../sim/saveEnvelope.js';
import { MAX_BLOCK_ID, SECTION_VOLUME } from '../sim/constants.js';
import { EDIT_UNCHANGED, encodeEdits } from '../sim/saveEdits.js';
import { encodeRle } from '../sim/mapFormat.js';
import { isLiquid } from '../sim/blocks.js';
import { isBoxFree } from '../sim/physics.js';
import { findSafeSpawn, standableAt } from '../gameWorld.js';

export const AUTOSAVE_SECONDS = 60;
export const AUTO_MIN_GAP_MS = 4000;
export const LOCAL_MAX_BYTES = 6 * 1024 * 1024;
const SYSTEM_MAX_JSON = 400000; // teknoloji fabrikaları (yüzlerce makine + tampon) 200 KB'ı aşabilir; aşan sistem durumu sessizce atılır
const WARM_BUDGET_MS = 6;
const EXT_POPULATED_MAX = 6000;
const EMPTY_EDITS = new Map();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ------------------------------------------------------------------------------------------------
 * Düzenleme önbelleği
 * ---------------------------------------------------------------------------------------------- */
function chunkOfId(cid) {
  return { cx: Math.floor(cid / 65536) - 32768, cz: (cid % 65536) - 32768 };
}

function editsHash(m) {
  let h = m.size | 0;
  m.forEach((id, idx) => {
    h = (Math.imul(h, 31) + idx * 131 + id + 7) | 0;
  });
  return h;
}

export function createEditsCache(perfFn) {
  const cache = new Map(); // cid → {sig, secs:[{key, str, cells}]}  (kesit başına RLE fark)
  const scratch = new Uint8Array(SECTION_VOLUME);
  const clock = perfFn || (() => nowPerf());

  /** Bütün düzenlenmiş chunk'ları dolaşır; bayat olanları (bütçe elverdikçe) yeniden kodlar. {list, count, stale} döner. */
  function pass(world, budgetMs) {
    const by = world._editsByChunk;
    const seen = new Set();
    const list = [];
    let count = 0;
    let stale = 0;
    const limited = budgetMs < Infinity;
    const t0 = limited ? clock() : 0;
    by.forEach((m, cid) => {
      if (!m || m.size === 0) return;
      const c = chunkOfId(cid);
      const loaded = world.chunks instanceof Map ? world.chunks.get(cid) : world.getChunk(c.cx, c.cz);
      const sig = loaded ? 'v' + loaded.version + ':' + m.size : 'u' + m.size + ':' + editsHash(m);
      seen.add(cid);
      let e = cache.get(cid);
      if (!e || e.sig !== sig) {
        if (limited && clock() - t0 >= budgetMs) {
          stale++;
          return;
        }
        // düzenlemeleri kesitlere ayır: idx = ((y - yMin) << 8) + (z << 4) + x → kesit = idx >> 12
        const bySec = new Map();
        m.forEach((id, idx) => {
          if (idx < 0 || !(id >= 0 && id <= MAX_BLOCK_ID)) return;
          const si = idx >> 12;
          let arr = bySec.get(si);
          if (!arr) {
            arr = [];
            bySec.set(si, arr);
          }
          arr.push(idx & 4095, id);
        });
        const secs = [];
        Array.from(bySec.keys()).sort((a, b) => a - b).forEach((si) => {
          const arr = bySec.get(si);
          scratch.fill(EDIT_UNCHANGED);
          let cells = 0;
          for (let i = 0; i < arr.length; i += 2) {
            if (scratch[arr[i]] === EDIT_UNCHANGED) cells++;
            scratch[arr[i]] = arr[i + 1];
          }
          secs.push({ key: c.cx + ',' + c.cz + ',' + si, str: encodeRle(scratch), cells });
        });
        e = { sig, secs };
        cache.set(cid, e);
      }
      for (let s = 0; s < e.secs.length; s++) {
        count += e.secs[s].cells;
        list.push(e.secs[s]);
      }
    });
    if (cache.size > seen.size) {
      Array.from(cache.keys()).forEach((cid) => { if (!seen.has(cid)) cache.delete(cid); });
    }
    return { list, count, stale };
  }

  return {
    get size() {
      return cache.size;
    },
    build(world) {
      if (!world || !(world._editsByChunk instanceof Map)) return encodeEdits(world ? world.edits : null, world ? world.yMin : 0);
      const r = pass(world, Infinity);
      r.list.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const chunks = {};
      for (let i = 0; i < r.list.length; i++) chunks[r.list[i].key] = r.list[i].str;
      return { chunks, count: r.count, chunkCount: r.list.length };
    },
    /** Önbelleği en çok budgetMs boyunca ısıtır; hâlâ bayat chunk sayısını döner (0 = sıcak). Boşta çağrılar için. */
    warm(world, budgetMs) {
      if (!world || !(world._editsByChunk instanceof Map)) return 0;
      return pass(world, budgetMs > 0 ? budgetMs : 4).stale;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * ext (güvenli okuma) ve sistem durumları
 * ---------------------------------------------------------------------------------------------- */
function finiteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function cleanPoint(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const a = [Number(v[0]), Number(v[1]), Number(v[2])];
  if (!a.every((n) => Number.isFinite(n) && Math.abs(n) < 1e6) || a[1] < -64 || a[1] > 400) return null;
  return { x: a[0], y: a[1], z: a[2] };
}

export function readExt(raw) {
  const out = {
    em: null, bed: null, spawn: null, intro: false,
  };
  if (!isObj(raw)) return out;
  if (isObj(raw.em)) {
    const e = raw.em;
    const em = {};
    if (finiteNum(e.nextId) && e.nextId >= 1 && e.nextId < 1e9) em.nextId = Math.floor(e.nextId);
    if (finiteNum(e.time) && e.time >= 0 && e.time < 1e9) em.time = e.time;
    if (finiteNum(e.rng)) em.rng = e.rng;
    if (e.difficulty === 'easy' || e.difficulty === 'normal') em.difficulty = e.difficulty;
    if (Array.isArray(e.populated)) {
      em.populated = [];
      for (let i = 0; i < e.populated.length && i < EXT_POPULATED_MAX; i++) {
        const s = e.populated[i];
        if (typeof s === 'string' && s.length <= 24) em.populated.push(s);
      }
    }
    out.em = em;
  }
  out.bed = cleanPoint(raw.bed);
  out.spawn = cleanPoint(raw.spawn);
  out.intro = raw.intro === true;
  return out;
}

function guardSystem(G) {
  return (sys, fn) => {
    try {
      return fn();
    } catch (err) {
      if (G.opts && G.opts.strictSystems) throw err;
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] sistem kayıt hatası ' + (sys && sys.name) + ':', err);
      return undefined;
    }
  };
}

/** Sistemlerin serialize() çıktıları; büyük/bozuk olanlar atılır. */
function serializeSystems(G, mgr) {
  const map = mgr ? mgr.serializeSystems(guardSystem(G)) : G.registry.serialize(G, guardSystem(G));
  const out = {};
  Object.keys(map).forEach((k) => {
    let n = 0;
    try {
      n = JSON.stringify(map[k]).length;
    } catch {
      n = SYSTEM_MAX_JSON + 1;
    }
    if (n <= SYSTEM_MAX_JSON) out[k] = map[k];
  });
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Serileştirme
 * ---------------------------------------------------------------------------------------------- */
function playerSnapshot(G, parts) {
  const b = G.body;
  const dead = !!G.player.dead;
  const city = !!parts && parts.dim !== 'overworld';
  const home = G.bedSpawn || (parts ? parts.spawn : G.spawn);
  let pos = dead ? [home.x, home.y, home.z] : [b.x, b.y, b.z];
  if (dead && city) {
    // şehirde ölü kayıt: en yakın bulunmuş terminalde "yeniden derlenmiş" konum
    const rp = G.dimMgr.respawnPoint();
    if (rp) pos = [rp.x, rp.y, rp.z];
  }
  const flags = { intro: G.introDone === true };
  return {
    pos,
    yaw: G.player.yaw,
    pitch: dead ? 0 : G.player.pitch,
    spawn: [home.x, home.y, home.z],
    flags,
    flying: dead ? false : !!b.flying,
    cameraMode: G.player.cameraMode === 'tp' ? 'tp' : 'fp',
  };
}

function survivalSnapshot(G) {
  const s = G.survival;
  if (!G.player.dead) return s;
  return Object.assign({}, s, {
    hp: s.maxHp, hunger: s.easy ? s.maxHunger : Math.max(14, s.hunger), saturation: 5, exhaustion: 0, oxygen: s.maxOxygen,
  });
}

/**
 * Canlı oyundan kayıt nesnesi kurar. ctx: {name, createdAt, now, edits(createEditsCache)}.
 * Düzenlemeler önbellekten gelir; yüklü olmayan kalan her şey sim/save.serializeGame ile yazılır.
 */
export function buildSave(G, ctx) {
  const c = ctx || {};
  const parts = G.dimMgr ? G.dimMgr.saveParts() : null; // boyut yöneticisi: üst düzey alanlar overworld'ün, dims.neon şehrin
  const world = parts ? parts.world : G.world;
  const shim = { mode: world.mode, rawSeed: world.rawSeed, edits: EMPTY_EDITS };
  const emSrc = parts ? parts.em : G.em;
  const em = emSrc && typeof emSrc.serialize === 'function' ? emSrc.serialize() : null;
  const state = {
    world: shim,
    mode: G.mode,
    seed: G.seedInput !== undefined && G.seedInput !== null ? G.seedInput : G.seed,
    name: c.name,
    createdAt: c.createdAt || 0,
    savedAt: c.now || 0,
    playTime: Math.floor(G.time.playTime),
    player: playerSnapshot(G, parts),
    inventory: G.inventory,
    survival: survivalSnapshot(G),
    clock: parts ? parts.clock : G.clock,
    weather: parts ? parts.weather : G.weatherSim,
    progression: G.progression,
    puzzleManager: parts ? parts.puzzles : G.puzzles,
    entities: em,
    chests: parts ? parts.chests : G.chests,
  };
  if (parts) {
    state.dim = parts.dim;
    state.dimMeta = parts.dimMeta;
    state.dims = parts.dims;
  }
  const save = serializeGame(state);
  const ed = c.edits ? c.edits.build(world) : encodeEdits(world.edits);
  save.edits = ed.chunks;
  save.editStats = { cells: ed.count, chunks: ed.chunkCount };
  save.systems = parts ? serializeSystems(G, G.dimMgr) : serializeSystems(G);
  const ext = { v: 1 };
  if (em) {
    ext.em = {
      nextId: em.nextId, time: em.time, rng: em.rng, difficulty: em.difficulty, populated: Array.isArray(em.populated) ? em.populated.slice(0, EXT_POPULATED_MAX) : [],
    };
  }
  const sp = parts ? parts.spawn : G.spawn;
  ext.spawn = [sp.x, sp.y, sp.z];
  if (G.bedSpawn) ext.bed = [G.bedSpawn.x, G.bedSpawn.y, G.bedSpawn.z];
  if (G.introDone === true) ext.intro = true;
  if (G.mode === 'insa' && G.mapMeta) ext.insa = { base: G.mapMeta.base, title: G.mapMeta.title || '', time: G.mapMeta.time };
  save.ext = ext;
  return save;
}

/** İnşa kaydının taban türü (createKesifGame({base}) için: kayıt düzenlemeleri aynı tabanın üzerine uygulanmalı); yoksa undefined. */
export function insaBaseOf(save) {
  const b = save && isObj(save.ext) && isObj(save.ext.insa) ? save.ext.insa.base : undefined;
  return b === 'düz' || b === 'ada' || b === 'boş' || b === 'çayır' ? b : undefined;
}

/** Kayıt boyutunun hızlı yaklaşığı (düzenleme metinleri + sabit pay). */
export function approxSaveSize(save) {
  let n = 24000;
  const ed = save && save.edits;
  if (ed) {
    const ks = Object.keys(ed);
    for (let i = 0; i < ks.length; i++) n += ks[i].length + ed[ks[i]].length + 6;
  }
  if (save && save.systems) n += 2000 * Object.keys(save.systems).length;
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Geri yükleme
 * ---------------------------------------------------------------------------------------------- */
const FEET_OFFS = [0, -1, 1, -2, 2, -3, 3, -4, 4];

/** Kayıttaki konumu güvenli bir yere oturtur: sıvı → olduğu gibi; ±4 blokta zemin → zemine; serbestse olduğu gibi; yoksa spiral arama. */
export function resolveRestorePosition(world, x, y, z) {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  const by = Math.floor(y);
  const ensure = (cx, cz) => {
    if (!world.hasChunk(cx, cz) && world.canGenerate(cx, cz)) world.ensureChunk(cx, cz);
  };
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ensure((bx >> 4) + dx, (bz >> 4) + dz);
  const feet = world.getBlock(bx, by, bz);
  if (feet !== null && feet !== undefined && feet !== 0 && isLiquid(feet)) return { x, y, z, how: 'liquid' };
  for (let i = 0; i < FEET_OFFS.length; i++) {
    const yy = by + FEET_OFFS[i];
    if (standableAt(world, bx, yy, bz)) {
      // oyuncu zaten orada durduysa tam konumu koru (blok merkezine kaydırma)
      const exact = isBoxFree(world, x - 0.3, yy + 0.001, z - 0.3, x + 0.3, yy + 1.8, z + 0.3);
      return exact ? { x, y: yy, z, how: 'ground' } : { x: bx + 0.5, y: yy, z: bz + 0.5, how: 'ground' };
    }
  }
  if (isBoxFree(world, x - 0.3, y + 0.001, z - 0.3, x + 0.3, y + 1.8, z + 0.3)) return { x, y, z, how: 'free' };
  const sp = findSafeSpawn(world, x, y, z, { maxR: 12 });
  return { x: sp.x, y: sp.y, z: sp.z, how: sp.ok ? 'search' : 'raw' };
}

function mobsFromGame(game) {
  return Array.isArray(game.entities) ? game.entities : [];
}

/**
 * Ham kaydı (nesne ya da JSON metni) canlı oyuna uygular. Dünya/envanter/hayatta kalma/saat/hava/ilerleme/bulmaca (bekleyen)/
 * varlıklar/düşen eşyalar/sandıklar/konum/doğuş. Sistem durumları (raw.systems) HEMEN uygulanmaz: `systems` döner,
 * çağıran tüm sistemlerin init'i bittikten sonra G.registry.restore ile uygular.
 */
export function restoreFromSave(G, raw) {
  const res = deserializeGame(raw);
  if (!res.ok) return { ok: false, code: res.code, error: res.error, warnings: [] };
  const game = res.game;
  const src = typeof raw === 'string' ? safeParse(raw) : raw;
  const ext = readExt(src && src.ext);
  const warnings = res.warnings.slice();

  const applied = applyGame(game, {
    world: G.world,
    inventory: G.inventory,
    survival: G.survival,
    clock: G.clock,
    progression: G.progression,
    puzzleManager: G.puzzles,
  });
  if (applied.weather && G.weatherSim) Object.assign(G.weatherSim, applied.weather);
  warnings.push.apply(warnings, applied.warnings);
  if (G.dimMgr && G.mode === 'macera') G.dimMgr.restoreMeta(game.dimMeta, game.dims);

  // sandıklar
  if (G.chests && typeof G.chests.clear === 'function') {
    G.chests.clear();
    applied.chests.forEach((v, k) => G.chests.set(k, v));
  }

  // varlıklar + düşen eşyalar
  if (G.em && typeof G.em.restore === 'function') {
    const d = Object.assign({}, ext.em || {}, { mobs: mobsFromGame(game), items: game.drops || [] });
    try {
      G.em.restore(d);
    } catch {
      warnings.push('entities');
    }
  }

  // oyuncu
  const pl = game.player;
  G.player.cameraMode = pl.flags && pl.flags.cameraMode === 'tp' ? 'tp' : G.player.cameraMode;
  if (ext.spawn) G.spawn = ext.spawn;
  if (ext.bed) G.bedSpawn = ext.bed;
  if (pl.dim === 'neon' && G.dimMgr && G.teleport) {
    // kayıt şehirde: overworld sessizce kurulur (kayıtlı çıkış noktasında), şehre geçiş game.js'te (sistem durumları yüklendikten sonra)
    const ow = game.dimMeta && game.dimMeta.overworldPos ? game.dimMeta.overworldPos : [G.spawn.x, G.spawn.y, G.spawn.z];
    const r0 = resolveRestorePosition(G.world, ow[0], ow[1], ow[2]);
    G.teleport(r0.x, r0.y, r0.z, { safe: false });
    G.dimBoot = { dim: 'neon', arrival: { x: pl.pos[0], y: pl.pos[1], z: pl.pos[2], yaw: pl.yaw, pitch: pl.pitch } };
  } else if (pl.pos && G.teleport) {
    const r = resolveRestorePosition(G.world, pl.pos[0], pl.pos[1], pl.pos[2]);
    G.teleport(r.x, r.y, r.z, { safe: false, yaw: pl.yaw, pitch: pl.pitch });
    if (G.mode === 'insa' && pl.flags && pl.flags.flying === true && G.body) G.body.flying = true;
  } else {
    G.player.yaw = pl.yaw;
    G.player.pitch = pl.pitch;
  }
  G.time.playTime = Math.max(0, game.playTime || 0);
  const sys = src && isObj(src.systems) ? src.systems : null;
  return {
    ok: true,
    warnings,
    name: game.name,
    createdAt: game.createdAt,
    systems: sys,
    intro: ext.intro === true || (pl.flags && pl.flags.intro === true),
    truncated: game.truncated === true,
  };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Otomatik kayıt zamanlayıcısı
 * ---------------------------------------------------------------------------------------------- */
function defaultIdle(fn) {
  try {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(fn, { timeout: 2000 });
      return () => { try { cancelIdleCallback(id); } catch { /* yut */ } };
    }
  } catch { /* yut */ }
  const t = setTimeout(fn, 40);
  return () => clearTimeout(t);
}

const nowEpoch = () => Date.now();
const nowPerf = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export function normalizeReason(r) {
  return r === 'manual' || r === 'exit' || r === 'dimension' ? r : 'auto';
}

export function createSaver(G, deps) {
  const d = deps || {};
  const epoch = d.now || nowEpoch;
  const perf = d.perf || nowPerf;
  const idle = d.idle || defaultIdle;
  const interval = d.interval > 0 ? d.interval : AUTOSAVE_SECONDS;
  const maxBytes = d.maxBytes > 0 ? d.maxBytes : LOCAL_MAX_BYTES;
  const cache = d.edits || createEditsCache();
  const st = {
    lastAt: -Infinity, lastTick: -1, accum: 0, cancelIdle: null, count: 0, lastMs: 0, lastBytes: 0, createdAt: 0, name: '', lastReason: '', errors: 0, warmRounds: 0,
  };
  const enabled = () => G.mode !== 'harita';

  function defaultName() {
    if (G.mode === 'insa') return 'İnşa Alanı';
    return 'Macera · ' + G.worldCode;
  }

  function build(reason) {
    const t0 = perf();
    const savedAt = epoch();
    if (!st.createdAt) st.createdAt = savedAt;
    let save = buildSave(G, {
      name: st.name || defaultName(), createdAt: st.createdAt, now: savedAt, edits: cache,
    });
    let bytes = approxSaveSize(save);
    if (bytes > maxBytes * 0.8) {
      bytes = estimateSaveSize(save);
      if (bytes > maxBytes) {
        const env = buildCloudEnvelope(save, { maxBytes });
        if (env.ok) {
          save = env.save;
          bytes = env.bytes;
        }
      }
    }
    const summary = summarizeSave(save);
    summary.bytes = bytes;
    summary.reason = reason;
    return {
      save, summary, bytes, ms: perf() - t0,
    };
  }

  function save(reasonIn, opts) {
    const o = opts || {};
    const reason = normalizeReason(reasonIn);
    if (!enabled()) return null;
    if (!G.worldReady && reason === 'auto') return null;
    if (G.destroyed && reason !== 'exit') return null;
    const t = perf();
    if (reason === 'auto' && G.transitionActive === true) return null; // boyut geçişi sürerken otomatik kayıt bastırılır (sonunda tek 'dimension' kaydı)
    if (reason === 'auto' && !o.force && (G.time.tick === st.lastTick || t - st.lastAt < AUTO_MIN_GAP_MS)) return null;
    if (o.minGap > 0 && t - st.lastAt < o.minGap && reason !== 'manual') return null;
    let out;
    try {
      out = build(reason);
    } catch (err) {
      st.errors++;
      if (st.errors <= 3 && typeof console !== 'undefined' && console.error) console.error('[kesif] kayıt hatası:', err);
      if (G.opts && G.opts.strictSystems) throw err;
      return null;
    }
    st.lastAt = t;
    st.lastTick = G.time.tick;
    st.count++;
    st.lastMs = out.ms;
    st.lastBytes = out.bytes;
    st.lastReason = reason;
    st.accum = 0;
    const cb = G.callbacks && G.callbacks.onSave;
    if (typeof cb === 'function') {
      try {
        const r = cb({ save: out.save, reason, summary: out.summary });
        if (r && typeof r.then === 'function') r.then(null, () => {});
      } catch (e) {
        if (G.opts && G.opts.strictSystems) throw e;
      }
    }
    if (!G.destroyed) G.emit({ type: 'saved', reason, bytes: out.bytes });
    return out;
  }

  /** Boşta, bütçeli (≤ WARM_BUDGET_MS/dilim) düzenleme önbelleğini ısıtır; bitince fn çağrılır (kare takılması olmasın). */
  function idleWarm(fn) {
    st.cancelIdle = idle(() => {
      st.cancelIdle = null;
      if (G.destroyed) return;
      const left = cache.warm(G.world, WARM_BUDGET_MS);
      if (left > 0 && st.warmRounds++ < 600) {
        idleWarm(fn);
        return;
      }
      st.warmRounds = 0;
      if (fn) fn();
    });
  }

  const api = {
    /** Çok düzenlenmiş dünya yüklendikten sonra ilk kaydın pahalı olmaması için önbelleği boşta ısıtır. */
    prewarm() {
      if (!enabled() || st.cancelIdle) return;
      idleWarm(null);
    },
    /** Kayıt iste: opts.idle → boşta (kare takılması olmasın), aksi hâlde hemen. */
    request(reason, opts) {
      const o = opts || {};
      if (!enabled()) return null;
      if (o.idle) {
        if (st.cancelIdle) return null; // bekleyen kayıt zaten var
        idleWarm(() => save(reason, o));
        return null;
      }
      return save(reason, o);
    },
    save,
    /** Sabit adımda çağrılır (duraklatılmışken çağrılmaz): her `interval` sn oyun süresinde boşta kayıt ister. */
    tick(dt) {
      if (!enabled() || !G.worldReady || G.player.dead || !(dt > 0)) return;
      st.accum += dt;
      if (st.accum >= interval) {
        st.accum = 0;
        if (typeof G.callbacks.onSave === 'function') api.request('auto', { idle: true, force: true });
      }
    },
    /** Kayıt adı / oluşturulma zamanı (yüklenen kayıttan). */
    adopt(name, createdAt) {
      if (typeof name === 'string' && name) st.name = name;
      if (createdAt > 0) st.createdAt = createdAt;
    },
    summary() {
      const s = summarizeSave({
        name: st.name || defaultName(),
        mode: G.mode,
        seed: G.seedInput !== undefined ? G.seedInput : G.seed,
        playTime: Math.floor(G.time.playTime),
        savedAt: st.lastAt > -Infinity ? epoch() : 0,
        createdAt: st.createdAt,
        progression: { zonesUnlocked: G.progression ? G.progression.zonesUnlocked : [], stats: G.progression ? { xp: G.progression.stats.xp } : {} },
      });
      s.worldCode = G.mode === 'macera' ? G.worldCode : '';
      return s;
    },
    get stats() {
      return {
        count: st.count, lastMs: st.lastMs, lastBytes: st.lastBytes, lastReason: st.lastReason, cacheChunks: cache.size,
      };
    },
    cache,
    dispose() {
      if (st.cancelIdle) {
        try { st.cancelIdle(); } catch { /* yut */ }
        st.cancelIdle = null;
      }
    },
  };
  return api;
}
