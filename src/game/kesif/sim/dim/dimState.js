/*
 * KEŞİF sim — boyut bağlamı (DimCtx) saf kısmı + boyut kaydı (saf; DOM/three yok). Sözleşme §5, §14.
 *
 *   createDimCtxSim(dimId, worldSeed, opts?) → ctx
 *       {id, def, seed, world, tech, chests:Map, clock, weatherSim, spawn:[x,y,z]|null, terminals:{found:int16 maske, list:null|[...]},
 *        locks:{}, stash:[], city:null, em:null, spawner:null, puzzles:null, props:null, colliders:null, crowd:null, vehicles:null}
 *       (props/colliders/crowd/vehicles/em/spawner motor katmanında — gameDimension.js — doldurulur; opts.makeEm(world, seed) ile em verilebilir.)
 *   serializeDim(ctx, opts?) → dims.neon blobu | null (overworld kaydı üst düzeydedir)      opts.ref [x,z]: kırpma referansı
 *   restoreDim(ctx, obj) → {ok, warnings}     sanitizeNeon ile doğrular, SONRA yerinde uygular (clock/weather/tech/chests/locks aynı nesne)
 *   DIM_SAVE_LIMITS
 *
 * Kayıt tek yönlüdür: serializeDim(ctx) → serializeGame({dims:{neon: blob}}) → deserializeGame().game.dims.neon → restoreDim(ctx, blob).
 */
import { WORLD_Y_MAX, WORLD_Y_MIN } from '../constants.js';
import {
  createClock, createWeather, restoreClock, restoreWeather, serializeClock, serializeWeather,
} from '../daynight.js';
import { TechState } from '../techState.js';
import { World } from '../world.js';
import { applyEditsToWorld, decodeEdits, encodeEdits } from '../saveEdits.js';
import { encodeChests, decodeChests } from '../saveSanitize.js';
import {
  DIM_SAVE_LIMITS, dimSeed, getDim, subHash,
} from './dimensions.js';
import { sanitizeNeon } from './dimSanitize.js';

export { DIM_SAVE_LIMITS };

const WEATHER_TAG = 0x57454154; // 'WEAT'

function isFn(f) {
  return typeof f === 'function';
}

/**
 * Boyutun saf bağlamını kurar. opts: {world (hazır dünya), decorate, zoneUnlocked, worldgen, sectionGen (World'e geçer), makeEm}.
 * Bilinmeyen boyut → atar.
 */
export function createDimCtxSim(dimId, worldSeed, opts) {
  const def = getDim(dimId);
  if (def === null) throw new Error('Bilinmeyen boyut: ' + String(dimId));
  const o = opts || {};
  const seed = dimSeed(worldSeed, dimId);
  const world = o.world || new World({
    seed,
    mode: 'macera',
    dim: dimId,
    decorate: o.decorate,
    zoneUnlocked: o.zoneUnlocked,
    worldgen: o.worldgen,
    sectionGen: o.sectionGen,
  });
  const clock = createClock(def.day ? { dayLengthSec: def.day.lenSec, startPhase: def.day.startPhase } : {});
  const weatherSim = createWeather(def.id === 'overworld' ? seed : subHash(seed, 1, WEATHER_TAG), { table: def.weather || 'overworld' });
  const ctx = {
    id: dimId,
    def,
    seed,
    world,
    tech: new TechState({ seed }),
    chests: new Map(),
    clock,
    weatherSim,
    spawn: null,
    terminals: { found: 0, list: null },
    locks: {},
    stash: [],
    city: null,
    em: null,
    spawner: null,
    puzzles: null,
    props: null,
    colliders: null,
    crowd: null,
    vehicles: null,
  };
  if (isFn(o.makeEm)) ctx.em = o.makeEm(world, seed);
  return ctx;
}

/** Bağlam → dims.<id> blobu (neon) | null (overworld). Sınırlar uygulanır; atmaz (hata → null). */
export function serializeDim(ctx, opts) {
  if (!ctx || ctx.id !== 'neon') return null;
  const o = opts || {};
  const world = ctx.world;
  let props = {};
  try {
    props = ctx.props && isFn(ctx.props.serialize) ? ctx.props.serialize() : {};
  } catch {
    props = {};
  }
  let entities = [];
  try {
    const es = ctx.em && isFn(ctx.em.serialize) ? ctx.em.serialize() : null;
    if (Array.isArray(es)) entities = es;
    else if (es && typeof es === 'object') entities = [].concat(Array.isArray(es.mobs) ? es.mobs : [], Array.isArray(es.items) ? es.items : []);
  } catch {
    entities = [];
  }
  const raw = {
    v: 1,
    edits: world ? encodeEdits(world.edits, world.yMin).chunks : {},
    clock: ctx.clock ? serializeClock(ctx.clock) : null,
    weather: ctx.weatherSim ? serializeWeather(ctx.weatherSim) : null,
    spawn: ctx.spawn || null,
    terminals: ctx.terminals ? ctx.terminals.found : 0,
    props,
    locks: ctx.locks || {},
    chests: encodeChests(ctx.chests),
    tech: ctx.tech && isFn(ctx.tech.serialize) ? ctx.tech.serialize() : null,
    entities,
    stash: ctx.stash || [],
    city: ctx.city || null,
  };
  return sanitizeNeon(raw, null, { trustEdits: true, ref: o.ref || null });
}

/** Kayıttaki karışık varlık listesi → em.restore biçimi {mobs, items} (tür alanı olanlar yaratık, diğerleri düşen eşya). */
export function splitEntities(list) {
  const mobs = [];
  const items = [];
  const a = Array.isArray(list) ? list : [];
  for (let i = 0; i < a.length; i++) {
    const e = a[i];
    if (e && typeof e.type === 'string') mobs.push(e);
    else if (e && typeof e.item === 'string') items.push(e);
  }
  return { mobs, items };
}

function replaceKeys(target, src) {
  Object.keys(target).forEach((k) => { delete target[k]; });
  Object.keys(src).forEach((k) => { target[k] = src[k]; });
}

/**
 * dims.neon blobunu bağlama uygular: önce sanitizeNeon (zaten temizse idempotent), sonra YERİNDE (nesne kimlikleri korunur).
 * Döner {ok, warnings}; geçersiz blob → ok:false ve bağlama dokunulmaz.
 */
export function restoreDim(ctx, obj) {
  const warnings = [];
  if (!ctx || ctx.id !== 'neon') return { ok: false, warnings };
  const n = sanitizeNeon(obj, warnings);
  if (n === null) return { ok: false, warnings };
  const ed = decodeEdits(n.edits, WORLD_Y_MIN);
  if (ed.ok && ctx.world) applyEditsToWorld(ctx.world, ed.list);
  if (n.clock && ctx.clock) restoreClock(ctx.clock, n.clock);
  if (n.weather && ctx.weatherSim) {
    const w = restoreWeather(n.weather);
    Object.assign(ctx.weatherSim, w);
  }
  if (n.spawn) ctx.spawn = n.spawn;
  if (ctx.terminals) ctx.terminals.found = n.terminals;
  if (ctx.locks) replaceKeys(ctx.locks, n.locks);
  if (ctx.chests) {
    ctx.chests.clear();
    const ch = decodeChests(n.chests);
    Object.keys(ch).forEach((k) => ctx.chests.set(k, ch[k]));
  }
  if (n.tech && ctx.tech && isFn(ctx.tech.restore)) ctx.tech.restore(n.tech, { minY: WORLD_Y_MIN, maxY: WORLD_Y_MAX });
  if (ctx.em && isFn(ctx.em.restore)) {
    try {
      ctx.em.restore(splitEntities(n.entities));
    } catch {
      warnings.push('neon.entities');
    }
  }
  if (ctx.props && isFn(ctx.props.restore)) {
    try {
      ctx.props.restore(n.props);
    } catch {
      warnings.push('neon.props');
    }
  }
  if (Array.isArray(ctx.stash)) {
    ctx.stash.length = 0;
    for (let i = 0; i < n.stash.length; i++) ctx.stash.push(n.stash[i]);
  } else {
    ctx.stash = n.stash.slice();
  }
  ctx.city = n.city;
  return { ok: true, warnings };
}
