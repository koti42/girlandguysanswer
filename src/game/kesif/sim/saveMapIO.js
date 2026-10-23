/*
 * KEŞİF sim — harita dışa/içe aktarma sarmalayıcıları (saf). mapFormat.js kuralları (id ≤ 99, ≤ 64 chunk, ≤ 700 KB,
 * PHP ile birebir) burada oyuna bağlanır.
 *
 *   buildInsaMap(world, opts) → {ok, map, errors, codes, stats, bytes}   inşa dünyasından yayınlanabilir harita
 *   importMap(input, {mode}) → {ok, map, spawn, base, time, meta, chunks:Map, worldOptions, errors}
 *   mapReplacementId(id)     sistem bloğu → izin verilen blok (hava ya da taş)
 *
 * ÖNEMLİ: 'ada'/'çayır' tabanları tohuma bağlıdır; insa/harita dünyaları MAP_BASE_SEED ile kurulmalı ki aynı harita
 * herkeste aynı tabanı verir. Tohum farklıysa buildInsaMap tabanı da (tüm chunk'ları) haritaya gömer.
 */
import { BUILDABLE_MAX, CHUNK_VOLUME } from './constants.js';
import { B, isSolid } from './blocks.js';
import { clockPhase, phaseNameAt } from './daynight.js';
import {
  MAP_BASES, MAP_TIMES, RULES, buildMap, chunkDenseBlocks, chunksFromMap, mapChunkKey, normalizeMap, validateMap,
} from './mapFormat.js';
import { toSeedInt } from './rng.js';

export const MAP_BASE_SEED = 20261016;

const REPLACE = new Uint8Array(256);
(function fillReplace() {
  for (let id = 0; id < 256; id++) {
    if (id <= BUILDABLE_MAX) REPLACE[id] = id;
    else if (id === B.REWARD_CHEST) REPLACE[id] = B.CHEST;
    else if (id === B.SEAL_BARRIER || id > 127) REPLACE[id] = B.AIR;
    else REPLACE[id] = isSolid(id) ? B.STONE : B.AIR;
  }
}());

/** Sistem bloğu (id > 99) → haritada izinli blok: katı mekanizma/ana kaya taşa, geri kalanı havaya; ödül sandığı sandığa. */
export function mapReplacementId(id) {
  return REPLACE[id & 255];
}

function cpCut(s, max) {
  const a = Array.from(String(s));
  return a.length > max ? a.slice(0, max).join('') : a.join('');
}

function clampSpawn(sp) {
  const d = [RULES.sizeX / 2, 64, RULES.sizeZ / 2];
  if (!Array.isArray(sp) || sp.length < 3) return d;
  const v = [Number(sp[0]), Number(sp[1]), Number(sp[2])];
  if (!v.every((n) => Number.isFinite(n))) return d;
  return [
    Math.min(RULES.sizeX - 0.5, Math.max(0.5, v[0])),
    Math.min(RULES.chunkHeight - 1, Math.max(1, v[1])),
    Math.min(RULES.sizeZ - 0.5, Math.max(0.5, v[2])),
  ];
}

function timeName(opts) {
  if (MAP_TIMES.indexOf(opts.time) >= 0) return opts.time;
  if (opts.clock) {
    const n = phaseNameAt(clockPhase(opts.clock));
    return n === 'gece' || n === 'gün batımı' ? n : 'gündüz';
  }
  return 'gündüz';
}

/**
 * İnşa dünyasından harita kurar. opts: {title, desc, base, spawn:[x,y,z]|player:{x,y,z}, time|clock, baseMap, all,
 * ensure=true}. Sistem blokları kurala göre değiştirilir. Kural ihlali (ör. 700 KB üstü) ok:false ve Türkçe hata döner.
 */
export function buildInsaMap(world, opts) {
  const o = opts || {};
  if (!world || typeof world.getChunk !== 'function') {
    return { ok: false, errors: ['Dünya geçersiz.'], codes: ['world'], stats: null, bytes: 0 };
  }
  const base = MAP_BASES.indexOf(o.base) >= 0 ? o.base : MAP_BASES.indexOf(world.base) >= 0 ? world.base : 'düz';
  const seedMismatch = toSeedInt(world.rawSeed === undefined ? 0 : world.rawSeed) !== toSeedInt(MAP_BASE_SEED);
  const baseKeys = new Set();
  if (o.baseMap && o.baseMap.chunks && typeof o.baseMap.chunks === 'object') {
    Object.keys(o.baseMap.chunks).forEach((k) => baseKeys.add(k));
  }
  const chunks = new Map();
  for (let cz = 0; cz < RULES.chunksZ; cz++) {
    for (let cx = 0; cx < RULES.chunksX; cx++) {
      if (o.ensure !== false && typeof world.ensureChunk === 'function') world.ensureChunk(cx, cz);
      const c = world.getChunk(cx, cz);
      const dense = chunkDenseBlocks(c);
      if (!dense) continue;
      const key = mapChunkKey(cx, cz);
      if (!(o.all || c.edited || seedMismatch || baseKeys.has(key))) continue;
      let out = dense;
      for (let i = 0; i < CHUNK_VOLUME; i++) {
        const id = out[i];
        if (id > BUILDABLE_MAX) {
          if (out === dense) out = Uint8Array.from(dense);
          out[i] = REPLACE[id];
        }
      }
      chunks.set(key, out);
    }
  }
  const sp = o.spawn || (o.player ? [o.player.x, o.player.y, o.player.z] : null);
  const map = buildMap({
    base,
    spawn: clampSpawn(sp),
    time: timeName(o),
    title: cpCut(o.title === undefined ? '' : o.title, RULES.titleMax),
    desc: cpCut(o.desc === undefined ? '' : o.desc, RULES.descMax),
    chunks,
  });
  const v = validateMap(map);
  let bytes = 0;
  try {
    bytes = JSON.stringify(map).length;
  } catch {
    bytes = 0;
  }
  return {
    ok: v.ok, map, errors: v.errors, codes: v.codes, stats: v.stats, bytes,
  };
}

/**
 * Harita (nesne ya da JSON metni) → oyuna hazır veri. mode: 'insa' (düzenlenebilir kopya) | 'harita' (salt oku).
 * worldOptions: new World(...) seçenekleri ({seed, mode, base, mapChunks}). Geçersizse {ok:false, errors}.
 */
export function importMap(input, opts) {
  const mode = opts && opts.mode === 'insa' ? 'insa' : 'harita';
  let data = input;
  if (typeof input === 'string') {
    if (input.length > 4 * 1024 * 1024) return { ok: false, errors: ['Harita çok büyük.'], codes: ['too_big'] };
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['Harita okunamadı (bozuk JSON).'], codes: ['json'] };
    }
  }
  const v = validateMap(data);
  if (!v.ok) return { ok: false, errors: v.errors, codes: v.codes };
  const map = normalizeMap(data);
  if (!map) return { ok: false, errors: ['Harita doğrulanamadı.'], codes: ['normalize'] };
  const chunks = chunksFromMap(map);
  return {
    ok: true,
    map,
    spawn: map.spawn.slice(),
    base: map.base,
    time: map.time,
    meta: map.meta,
    chunks,
    errors: [],
    worldOptions: {
      seed: MAP_BASE_SEED, mode, base: map.base, mapChunks: chunks,
    },
  };
}
