/*
 * KEŞİF sim — macera kaydı (saf; DOM yok). Sözleşme §11.
 *
 *   serializeGame({world, inventory, survival, clock, weather, progression, puzzleManager, entities, chests, player, magic, tech,
 *                  seed, mode, name, playTime, createdAt, savedAt}) → JSON-güvenli nesne
 *   deserializeGame(jsonOrObject, {strict}) → {ok:true, game, warnings} | {ok:false, code, error}   (ASLA atmaz)
 *   applyGame(game, {world, inventory, survival, clock, progression, puzzleManager, magic, tech}) → {weather, player, entities,
 *                  drops, chests, warnings}                         canlı nesnelere uygular
 *   estimateSaveSize(save) → bayt (UTF-8)      summarizeSave(save) → liste özeti
 *   registerSaveMigration(from, fn) / migrateSave(data)
 *
 * Kayıt biçimi (v3 — boyutlar; v2 sessizce göç eder; v1 yalnız legacy/insa için göç edilir, v1 macera kaydı reddedilir: 'oldworld'):
 *   { v, mode, seed, name, createdAt, savedAt, playTime,
 *     player:{pos:[x,y,z], yaw, pitch, hp, hunger, saturation, exhaustion, oxygen, maxHp, inv, spawn:[x,y,z]|null, flags,
 *             magic?:{state,brew}, tech?:{v,tm,cd,m,p}},   (magic: büyü durumu; tech: teknoloji makineleri/portalları; eski kayıtlarda yok → varsayılan)
 *     time:{tick, time, day, dayLengthSec, weather:{seed,t}},
 *     edits:{"cx,cz,si":"<base64 RLE fark, 4096>"}  (saveEdits.js; yalnız dokunulan kesitler), editStats:{cells,chunks},
 *     progression:{...}, puzzleStates:{id:{type,solved,state}}, entities:[...], drops:[...], chests:{"x,y,z":[slots]},
 *     discovered:{structures:n, biomes:n}, truncated? }
 * createdAt/savedAt zaman damgasını ÇAĞIRAN verir (sim'de Date.now yok).
 *
 * v3 (Neon Meridyen, KESIF_CITY_CONTRACT §14; yalnız macera): yukarıdaki üst düzey alanlar OVERWORLD'dür; ek olarak
 *   player.dim 'overworld'|'neon' (pos/yaw/pitch BULUNULAN boyutundur), dimMeta {calibrated,visits,firstArrival,link,overworldPos,lastHopAt},
 *   dims {neon?: {v:1,edits,clock,weather,spawn,terminals,props,locks,chests,tech,entities,stash,city}} (sim/dim/dimSanitize.js).
 *   serializeGame state'ine `dim`, `dimMeta`, `dims` verilir (dims.neon = dimState.serializeDim(ctx)); deserializeGame bunları
 *   sıkı doğrulayarak game.player.dim / game.dimMeta / game.dims olarak döner (restoreDim ile bağlama uygulanır). v3'ü eski (v2) istemci
 *   mevcut "daha yeni sürümden" iletisiyle reddeder.
 */
import {
  SAVE_VERSION, WORLD_Y_MAX, WORLD_Y_MIN, ZONES,
} from './constants.js';
import { Inventory } from './inventory.js';
import { normalizeWorldCode, seedFromInput } from './rng.js';
import { restoreClock, restoreWeather, serializeClock, serializeWeather } from './daynight.js';
import { restoreSurvival, serializeSurvival } from './survival.js';
import { Progression } from './progression.js';
import { createMagic, restoreMagicAll, serializeMagicAll } from './magic.js';
import { TechState } from './techState.js';
import { xpLevel } from './progressionData.js';
import {
  applyEditsToWorld, decodeEdits, encodeEdits, migrateChunkDiffs,
} from './saveEdits.js';
import { NEON_BOUNDS, cleanDimId } from './dim/dimensions.js';
import {
  isShadowKey, normalizeDimsForSave, sanitizeDimMeta, sanitizeDims,
} from './dim/dimSanitize.js';
import {
  LIMITS, cleanDrop, cleanEntity, cleanInventoryJson, cleanName, cleanPos, cleanPuzzles, cleanSeed, collectEntities, decodeChests,
  encodeChests, isObj, num, round, toNum,
} from './saveSanitize.js';
import { arrivalPoint } from './dim/travel.js';

export { SAVE_VERSION };
export const SAVE_MODES = Object.freeze(['macera', 'insa', 'harita']);
export const MAX_SAVE_INPUT = 8 * 1024 * 1024;

/* ------------------------------------------------------------------------------------------------
 * Sürüm göçü
 * ---------------------------------------------------------------------------------------------- */
const MIGRATIONS = {
  // v0 (sürümsüz eski biçim): üst düzey inv/pos/yaw/pitch/hp/hunger ve düz "x,y,z"→id düzenleme nesnesi.
  0(d) {
    const o = Object.assign({}, d);
    const hasPlayer = isObj(o.player);
    if (!hasPlayer) {
      o.player = {
        pos: o.pos, yaw: o.yaw, pitch: o.pitch, hp: o.hp, hunger: o.hunger, inv: o.inv, spawn: o.spawn,
      };
    }
    ['pos', 'yaw', 'pitch', 'hp', 'hunger', 'inv', 'spawn'].forEach((k) => { delete o[k]; });
    if (isObj(o.edits)) {
      const keys = Object.keys(o.edits);
      const flat = keys.length > 0 && keys.every((k) => k.split(',').length === 3);
      if (flat) o.edits = encodeEdits(o.edits, 0).chunks; // v0 yalnız legacy (y 0..127) → doğrudan v2 kesit biçimi
      else o.edits = migrateChunkDiffs(o.edits);
    }
    o.v = 2;
    return o;
  },
  // v1 (sütun farkı "cx,cz" 32768 bayt): legacy/insa kayıtları kesit farklarına bölünür (macera v1 kaydı daha önce reddedilir).
  1(d) {
    const o = Object.assign({}, d);
    o.edits = migrateChunkDiffs(o.edits);
    o.v = 2;
    return o;
  },
};

/**
 * v2 → v3 (Neon Meridyen): oyuncu overworld'dedir; boyut üst verisi sıfırlanır, dims boş. Sessiz; tüm v2 alanları AYNEN kalır
 * (insa/harita kayıtları da geçer ama deserializeGame yalnız macera için boyut alanlarını okur).
 */
export function migrateV2toV3(d) {
  const p = isObj(d.player) ? d.player : {};
  return Object.assign({}, d, {
    v: 3,
    player: Object.assign({}, p, { dim: 'overworld' }),
    dimMeta: {
      calibrated: false, visits: 0, link: null, lastHopAt: 0, overworldPos: null,
    },
    dims: {},
  });
}
MIGRATIONS[2] = migrateV2toV3;

const BUILTIN_MIGRATIONS = Object.assign({}, MIGRATIONS);

export function registerSaveMigration(from, fn) {
  if (Number.isInteger(from) && from >= 0 && typeof fn === 'function') MIGRATIONS[from] = fn;
}
/** Kaydı geri alır; yerleşik göç varsa o geri yüklenir. */
export function unregisterSaveMigration(from) {
  if (BUILTIN_MIGRATIONS[from]) MIGRATIONS[from] = BUILTIN_MIGRATIONS[from];
  else delete MIGRATIONS[from];
}

/** {ok, data, from}: v < SAVE_VERSION olanlar zincirle yükseltilir; hata/atılan → ok:false. */
export function migrateSave(data) {
  if (!isObj(data)) return { ok: false, data: null, from: -1 };
  let d = data;
  const from = Number.isInteger(d.v) ? d.v : 0;
  let v = from;
  let guard = 0;
  while (v < SAVE_VERSION && guard++ < 32) {
    const fn = MIGRATIONS[v];
    if (!fn) return { ok: false, data: null, from };
    try {
      const next = fn(d);
      if (!isObj(next)) return { ok: false, data: null, from };
      d = next;
    } catch {
      return { ok: false, data: null, from };
    }
    const nv = Number.isInteger(d.v) ? d.v : v + 1;
    if (nv <= v) return { ok: false, data: null, from };
    v = nv;
  }
  return { ok: true, data: d, from };
}

/* ------------------------------------------------------------------------------------------------
 * Yardımcılar
 * ---------------------------------------------------------------------------------------------- */
/** UTF-8 bayt uzunluğu (TextEncoder gerektirmez). */
export function utf8Length(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export function estimateSaveSize(save) {
  try {
    return utf8Length(JSON.stringify(save));
  } catch {
    return 0;
  }
}

/** Tohum → 8 haneli Dünya Kodu (metin zaten kodsa kendisi). */
export function worldCodeOf(seed) {
  if (typeof seed === 'string') {
    const c = normalizeWorldCode(seed);
    if (c) return c;
  }
  const n = seedFromInput(seed);
  return n.toString(36).toUpperCase().padStart(8, '0');
}

function highestZone(prog) {
  const zu = prog && Array.isArray(prog.zonesUnlocked) ? prog.zonesUnlocked : [];
  let z = 0;
  for (let i = 1; i < ZONES.length; i++) if (zu[i] === true) z = i;
  return z;
}

/** Kayıt listesi/menü için küçük özet (doğrulanmamış veriden de güvenle). */
export function summarizeSave(save) {
  const s = isObj(save) ? save : {};
  const prog = isObj(s.progression) ? s.progression : {};
  const stats = isObj(prog.stats) ? prog.stats : {};
  const z = highestZone(prog);
  const seed = cleanSeed(s.seed);
  return {
    name: cleanName(s.name, 'Macera'),
    seed,
    worldCode: seed === null ? '' : worldCodeOf(seed),
    mode: SAVE_MODES.indexOf(s.mode) >= 0 ? s.mode : 'macera',
    playTime: Math.floor(num(s.playTime, 0, 1e9, 0)),
    savedAt: Math.floor(num(s.savedAt, 0, 4e12, 0)),
    createdAt: Math.floor(num(s.createdAt, 0, 4e12, 0)),
    zone: { id: z, name: ZONES[z].name },
    dim: cleanDimId(isObj(s.player) ? s.player.dim : undefined),
    level: xpLevel(num(stats.xp, 0, 1e9, 0)),
    truncated: s.truncated === true,
  };
}

function cleanFlags(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  const ks = Object.keys(raw);
  let n = 0;
  for (let i = 0; i < ks.length && n < 12; i++) {
    const k = ks[i];
    if (!/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k) || isShadowKey(k)) continue; // qa5: prototype/constructor/toString… bayrak adı olamaz
    const v = raw[k];
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 24);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = round(v, 2);
    else continue;
    n++;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Serileştirme
 * ---------------------------------------------------------------------------------------------- */
export function serializeGame(state) {
  const st = state || {};
  const world = st.world;
  const mode = SAVE_MODES.indexOf(st.mode) >= 0 ? st.mode : world && SAVE_MODES.indexOf(world.mode) >= 0 ? world.mode : 'macera';
  let seed = cleanSeed(st.seed !== undefined ? st.seed : world ? world.rawSeed : 0);
  if (seed === null) seed = 0;
  const pl = isObj(st.player) ? st.player : {};
  let pos = cleanPos(pl.pos || pl.position || [pl.x, pl.y, pl.z]) || [0, 64, 0];
  // boyutlar (yalnız macera): dims.neon yoksa şehirde "kaydedilmiş" gibi yazılmaz → overworld konumuna dönülür
  let dim = 'overworld';
  let dimMeta = null;
  let dims = null;
  if (mode === 'macera') {
    dim = cleanDimId(st.dim);
    dimMeta = sanitizeDimMeta(st.dimMeta);
    dims = normalizeDimsForSave(st.dims);
    if (dim === 'neon' && !dims.neon) {
      dim = 'overworld';
      if (dimMeta.overworldPos) pos = dimMeta.overworldPos;
    }
  }

  const sv = st.survival ? serializeSurvival(st.survival) : null;
  const flags = cleanFlags(pl.flags);
  if (typeof pl.flying === 'boolean') flags.flying = pl.flying;
  if (pl.cameraMode === 'fp' || pl.cameraMode === 'tp') flags.cameraMode = pl.cameraMode;
  const player = {
    pos,
    yaw: round(num(pl.yaw, -1e5, 1e5, 0), 3),
    pitch: round(num(pl.pitch, -1.6, 1.6, 0), 3),
  };
  if (sv) {
    player.hp = round(sv.hp, 2);
    player.hunger = round(sv.hunger, 2);
    player.saturation = round(sv.saturation, 2);
    player.exhaustion = round(sv.exhaustion, 2);
    player.oxygen = round(sv.oxygen, 2);
    player.maxHp = sv.maxHp;
  }
  player.inv = st.inventory && typeof st.inventory.toJSON === 'function' ? st.inventory.toJSON() : null;
  player.spawn = cleanPos(pl.spawn, null);
  player.flags = flags;
  if (mode === 'macera') player.dim = dim;
  // büyü durumu (enchantSeed, mana, etkiler, bilinen büyüler + demlenen kazanlar); yoksa alan hiç yazılmaz
  if (st.magic && st.magic.state && st.magic.brew) player.magic = serializeMagicAll(st.magic);
  // teknoloji durumu (makineler, portallar); yoksa alan hiç yazılmaz
  if (st.tech && typeof st.tech.serialize === 'function') player.tech = st.tech.serialize();

  const clock = st.clock ? serializeClock(st.clock) : null;
  const time = {
    tick: clock ? clock.tick : 0,
    time: clock ? round(clock.time, 2) : 0,
    day: clock ? clock.day : 0,
    dayLengthSec: clock ? clock.dayLengthSec : 1200,
    weather: st.weather ? serializeWeather(st.weather) : null,
  };
  if (time.weather) time.weather.t = round(time.weather.t, 1);

  const edits = world ? encodeEdits(world.edits, world.yMin) : { chunks: {}, count: 0, chunkCount: 0 };
  const prog = st.progression && typeof st.progression.serialize === 'function'
    ? st.progression.serialize()
    : isObj(st.progression) ? st.progression : null;
  const ents = collectEntities(st.entities, pos);
  const progStats = prog && isObj(prog.stats) ? prog.stats : {};
  const progDisc = prog && isObj(prog.discovered) ? prog.discovered : {};

  const out = {
    v: SAVE_VERSION,
    mode,
    seed,
    name: cleanName(st.name, 'Macera'),
    createdAt: Math.floor(num(st.createdAt, 0, 4e12, 0)),
    savedAt: Math.floor(num(st.savedAt, 0, 4e12, 0)),
    playTime: Math.floor(num(st.playTime !== undefined ? st.playTime : progStats.playTime, 0, 1e9, 0)),
    player,
    time,
    edits: edits.chunks,
    editStats: { cells: edits.count, chunks: edits.chunkCount },
    progression: prog,
    puzzleStates: cleanPuzzles(st.puzzleManager),
    entities: ents.entities,
    drops: ents.drops,
    chests: encodeChests(st.chests),
    discovered: {
      structures: Array.isArray(progDisc.structures) ? progDisc.structures.length : 0,
      biomes: Array.isArray(progDisc.biomes) ? progDisc.biomes.length : 0,
    },
  };
  if (mode === 'macera') {
    out.dimMeta = dimMeta;
    out.dims = dims;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Yükleme
 * ---------------------------------------------------------------------------------------------- */
function fail(code, error) {
  return { ok: false, code, error };
}

/** Şehir sınırı içine kıs (x,z ∈ [-800, 800)): yüklemede sınır dışı kayıtlı konum duvarın içinde kalmasın. */
function clampToNeon(pos) {
  if (!pos) return pos;
  const xl = NEON_BOUNDS.minCx * 16 + 1;
  const xh = (NEON_BOUNDS.maxCx + 1) * 16 - 2;
  const zl = NEON_BOUNDS.minCz * 16 + 1;
  const zh = (NEON_BOUNDS.maxCz + 1) * 16 - 2;
  return [round(num(pos[0], xl, xh, 0), 2), pos[1], round(num(pos[2], zl, zh, 0), 2)];
}

function loadPlayer(raw, warnings) {
  const p = isObj(raw) ? raw : {};
  const invRaw = p.inv;
  let inv = null;
  if (invRaw !== undefined && invRaw !== null) {
    if (isObj(invRaw)) inv = new Inventory().fromJSON(cleanInventoryJson(invRaw)).toJSON();
    else warnings.push('inv');
  }
  const hasSurvival = p.hp !== undefined || p.hunger !== undefined;
  const maxHp = num(p.maxHp, 2, 60, 20);
  return {
    dim: 'overworld',
    pos: cleanPos(p.pos, null),
    yaw: round(num(p.yaw, -1e5, 1e5, 0), 3),
    pitch: round(num(p.pitch, -1.6, 1.6, 0), 3),
    spawn: cleanPos(p.spawn, null),
    flags: cleanFlags(p.flags),
    magic: isObj(p.magic) ? serializeMagicAll(restoreMagicAll(createMagic(0), p.magic)) : null,
    tech: isObj(p.tech) ? new TechState().restore(p.tech, { minY: WORLD_Y_MIN, maxY: WORLD_Y_MAX }).serialize() : null,
    inventory: inv,
    survival: hasSurvival ? {
      maxHp,
      hp: num(p.hp, 0.5, maxHp, maxHp),
      hunger: num(p.hunger, 0, 20, 20),
      saturation: num(p.saturation, 0, 20, 0),
      exhaustion: num(p.exhaustion, 0, 4, 0),
      oxygen: num(p.oxygen, 0, 60, 15),
    } : null,
  };
}

function loadTime(raw) {
  const t = isObj(raw) ? raw : {};
  const len = num(t.dayLengthSec, 60, 86400, 1200);
  const w = isObj(t.weather) ? t.weather : null;
  return {
    clock: {
      dayLengthSec: len,
      time: num(t.time !== undefined ? t.time : toNum(t.tick) / 60, 0, len - 0.001, 0),
      day: Math.floor(num(t.day, 0, 1000000, 0)),
    },
    weather: w ? { seed: Math.floor(num(w.seed, 0, 4294967295, 0)), t: num(w.t, 0, 1e9, 0) } : null,
  };
}

/**
 * JSON metni ya da nesneyi doğrulayarak çözer. ASLA atmaz.
 * opts.strict: bozuk düzenleme chunk'ı bile hata sayılır (varsayılan: atla + uyarı).
 */
export function deserializeGame(input, opts) {
  const strict = !!(opts && opts.strict);
  try {
    let data = input;
    if (typeof input === 'string') {
      if (input.length > MAX_SAVE_INPUT) return fail('too_large', 'Kayıt çok büyük.');
      try {
        data = JSON.parse(input);
      } catch {
        return fail('json', 'Kayıt okunamadı (bozuk JSON).');
      }
    }
    if (!isObj(data)) return fail('format', 'Kayıt biçimi geçersiz.');
    if (Number.isInteger(data.v) && data.v > SAVE_VERSION) {
      return fail('newer', 'Bu kayıt daha yeni bir sürümden. Uygulamayı güncelle.');
    }
    // derin dünya: eski (v1) macera dünyaları yükseltilemez (yükseklik düzeni değişti) — çökmeden, açık mesajla reddedilir
    if (!Number.isInteger(data.v) || data.v < 2) {
      const m0 = data.mode === undefined ? 'macera' : data.mode;
      if (m0 === 'macera') return fail('oldworld', 'Bu dünya eski sürümden; yeni bir dünya başlat.');
    }
    const mig = migrateSave(data);
    if (!mig.ok) return fail('migrate', 'Kayıt sürümü yükseltilemedi.');
    const d = mig.data;
    const warnings = [];

    const seed = cleanSeed(d.seed);
    if (seed === null) return fail('seed', 'Kayıtta dünya tohumu yok.');
    const mode = d.mode === undefined ? 'macera' : d.mode;
    if (SAVE_MODES.indexOf(mode) < 0) return fail('mode', 'Kayıt modu geçersiz.');

    const ed = decodeEdits(d.edits, mode === 'macera' ? WORLD_Y_MIN : 0);
    if (!ed.ok) return fail('edits', 'Düzenleme verisi bozuk.');
    if (ed.bad.length > 0) {
      if (strict) return fail('edits', 'Bozuk düzenleme parçası: ' + ed.bad[0]);
      warnings.push('edits:' + ed.bad.length);
    }

    let progression = null;
    if (d.progression !== undefined && d.progression !== null) {
      const tmp = new Progression(seed, { mode });
      if (tmp.restore(d.progression)) progression = tmp.serialize();
      else warnings.push('progression');
    }

    const ents = collectEntities({ entities: Array.isArray(d.entities) ? d.entities : [], drops: Array.isArray(d.drops) ? d.drops : [] }, null);

    // boyutlar (yalnız macera): player.dim + dimMeta + dims sıkı doğrulanır; dims.neon yoksa şehir konumu atılır
    const player = loadPlayer(d.player, warnings);
    let dimMeta = sanitizeDimMeta(undefined);
    let dims = {};
    if (mode === 'macera') {
      dimMeta = sanitizeDimMeta(d.dimMeta);
      dims = sanitizeDims(d.dims, warnings);
      player.dim = cleanDimId(isObj(d.player) ? d.player.dim : undefined);
      if (player.dim === 'neon') {
        if (dims.neon) {
          // qa5: konum yok/bozuksa (kısmen bozuk bulut kaydı) şehir açılışı pos[0]'da çökmesin → son şehir doğuşu ya da Kapı Meydanı varışı
          let p0 = player.pos;
          if (!p0) {
            const a = arrivalPoint('neon');
            p0 = dims.neon.spawn || (a ? [a.x, a.y, a.z] : [0.5, 64, 2.5]);
            warnings.push('player.pos');
          }
          player.pos = clampToNeon(p0);
        } else {
          warnings.push('dim:neon');
          player.dim = 'overworld';
          player.pos = dimMeta.overworldPos;
        }
      }
    }

    const game = {
      v: SAVE_VERSION,
      migratedFrom: mig.from,
      mode,
      seed,
      name: cleanName(d.name, 'Macera'),
      createdAt: Math.floor(num(d.createdAt, 0, 4e12, 0)),
      savedAt: Math.floor(num(d.savedAt, 0, 4e12, 0)),
      playTime: Math.floor(num(d.playTime, 0, 1e9, 0)),
      player,
      dimMeta,
      dims,
      time: loadTime(d.time),
      edits: { list: ed.list, count: ed.count, chunkCount: ed.list.length },
      progression,
      puzzleStates: cleanPuzzles(d.puzzleStates),
      entities: ents.entities,
      drops: ents.drops,
      chests: decodeChests(d.chests),
      truncated: d.truncated === true,
    };
    return { ok: true, game, warnings };
  } catch {
    return fail('internal', 'Kayıt işlenemedi.');
  }
}

/* ------------------------------------------------------------------------------------------------
 * Canlı nesnelere uygulama
 * ---------------------------------------------------------------------------------------------- */
/**
 * deserializeGame().game'i canlı sim nesnelerine uygular. targets: {world, inventory, survival, clock, progression,
 * puzzleManager} (hepsi isteğe bağlı). Döner: {weather (yeni durum | null), player, entities, drops, chests (Map),
 * warnings}. Dünya düzenlemeleri uygulanır ve açık bölgelerin mühür halkaları açılır (world.unlockZone).
 */
export function applyGame(game, targets) {
  const t = targets || {};
  const warnings = [];
  if (t.inventory && game.player.inventory) t.inventory.fromJSON(game.player.inventory);
  if (t.survival && game.player.survival) restoreSurvival(t.survival, game.player.survival);
  if (t.magic && game.player.magic) restoreMagicAll(t.magic, game.player.magic);
  if (t.tech && game.player.tech && typeof t.tech.restore === 'function') t.tech.restore(game.player.tech, { minY: WORLD_Y_MIN, maxY: WORLD_Y_MAX });
  if (t.clock) restoreClock(t.clock, game.time.clock);
  const weather = game.time.weather ? restoreWeather(game.time.weather) : null;
  if (t.progression) {
    if (game.progression) t.progression.restore(game.progression);
  }
  if (t.world) {
    applyEditsToWorld(t.world, game.edits.list);
    const zu = t.progression ? t.progression.zonesUnlocked : null;
    if (zu && t.world.mode === 'macera') {
      for (let i = 1; i < zu.length; i++) if (zu[i]) t.world.unlockZone(i);
    }
  }
  if (t.puzzleManager && typeof t.puzzleManager.restore === 'function') {
    try {
      t.puzzleManager.restore(game.puzzleStates);
    } catch {
      warnings.push('puzzles');
    }
  }
  const chests = new Map();
  Object.keys(game.chests).forEach((k) => chests.set(k, game.chests[k]));
  return {
    weather, player: game.player, entities: game.entities, drops: game.drops, chests, warnings, dim: game.player.dim, dimMeta: game.dimMeta, dims: game.dims,
  };
}

export { LIMITS, cleanDrop, cleanEntity };
