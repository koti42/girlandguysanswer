/*
 * KEŞİF — moda göre dünya kurulumu (saf mantık; three/DOM yok, node'da test edilir).
 *
 *   resolveSeed(input) → {seed:uint32, worldCode:'XXXXXXXX'}     sayı / metin / Dünya Kodu → tohum + kod
 *   createModeWorld({mode, seed, mapData, base, zoneUnlocked, difficulty?}) → {
 *       world, spawn:{x,y,z}, yaw, time:'gündüz'|'gün batımı'|'gece', phase:0..1, frozenClock:boolean,
 *       worldCode, seed, mapMeta|null, errors:[...], mode }
 *   findSafeSpawn(world, x, y, z, opts) → {x,y,z,ok,moved}       güvenli (ayakta durulabilir) doğuş arama
 *   standableAt(world, bx, by, bz) → boolean
 *   mapTimePhase(name) → faz (0..1)                              harita zamanı → daynight fazı
 *
 *   macera : sınırsız dünya; World({seed, mode:'macera', decorate: structures.decorateChunk, zoneUnlocked});
 *            doğuş = worldgen.spawnPoint(seed) (güvenli çimen) ve çevresi eşzamanlı üretilip doğrulanır.
 *   insa   : sınırlı 8×8 chunk; mapData varsa importMap(...,{mode:'insa'}) (düzenlenebilir kopya), yoksa taban ('düz'|'ada'|
 *            'boş'|'çayır') MAP_BASE_SEED ile. Doğuş harita spawn'ından (güvenliye çekilerek) ya da taban doğuşundan.
 *   harita : yalnız importMap(...,{mode:'harita'}); geçersiz/eksik harita → 'düz' tabana düşer ve errors dolar.
 */
import { BLOCKS, isLiquid } from './sim/blocks.js';
import { CHUNK_SIZE, WORLD_H } from './sim/constants.js';
import {
  seedFromInput, normalizeWorldCode, parseWorldCode, makeWorldCode, seededRandom, stringSeedToInt,
} from './sim/rng.js';
import { World } from './sim/world.js';
import { decorateChunk, warmStructures } from './sim/structures.js';
import { spawnPoint, spawnYaw } from './sim/worldgen.js';
import { baseSpawn } from './sim/worldgenBases.js';
import { isBoxFree } from './sim/physics.js';
import { MAP_BASE_SEED, importMap } from './sim/saveMapIO.js';
import { MAP_BASES } from './sim/mapFormat.js';
import { worldCodeOf } from './sim/save.js';

const HALF_W = 0.3;
const BODY_H = 1.8;

/**
 * Girdi (sayı | metin | Dünya Kodu) → {seed, worldCode, seedInput}.
 *  - Dünya Kodu: seed = parseWorldCode(kod), kod aynen.
 *  - Serbest metin: metinden belirlenimci bir kod türetilir (makeWorldCode) ve seed o koddan çözülür → kod paylaşılınca AYNI dünya.
 *  - Sayı (kayıttan gelen çözülmüş tohum dahil): kimlik; kod = worldCodeOf(sayı).
 * seedInput: kayda yazılacak değer (kod metni ya da sayı) — yeniden yüklemede resolveSeed(seedInput) aynı dünyayı verir.
 */
export function resolveSeed(input) {
  const code = typeof input === 'string' ? normalizeWorldCode(input) : null;
  if (code) return { seed: parseWorldCode(code), worldCode: code, seedInput: code };
  if (typeof input === 'string' && input.trim() !== '' && !/^\d{1,10}$/.test(input.trim())) {
    const c = makeWorldCode(seededRandom(stringSeedToInt(input.trim())));
    return { seed: parseWorldCode(c), worldCode: c, seedInput: c };
  }
  const n = seedFromInput(input === undefined || input === null ? 0 : input);
  return { seed: n, worldCode: worldCodeOf(n), seedInput: n };
}

/**
 * İlerleme 'tick' olayı (0,25 sn): şehir (ana diyar dışı) koordinatları ana diyar haritasını/mesafesini/biyom keşfini ETKİLEMESİN
 * (progression yalnız sonlu x,z ile mesafe + harita açılımı yapar, biyom dizesiyle keşif yapar): şehirde x,z = NaN ve biyom yok;
 * süre (dt) her boyutta sayılır.
 */
export function progressTickEvent(dim, body, dt, light, torch, biome) {
  const home = dim === undefined || dim === null || dim === 'overworld';
  return {
    type: 'tick', dt, x: home ? body.x : NaN, z: home ? body.z : NaN, light, torch: !!torch, biome: home ? biome : undefined,
  };
}

/** Harita zamanı → daynight fazı (0 şafak, 0,25 öğle, 0,5 gün batımı, 0,75 gece yarısı). */
export function mapTimePhase(name) {
  if (name === 'gece') return 0.75;
  if (name === 'gün batımı') return 0.5;
  return 0.22;
}

function numOr(v, d) {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

/** (bx,by,bz) ayak hücresi: gövde sığıyor, ayak hücresi sıvı değil, altı katı ve zararsız mı? */
export function standableAt(world, bx, by, bz) {
  const yLo = world.legacy === false ? world.yMin + 1 : 1;
  const yHi = world.yMax !== undefined ? world.yMax : WORLD_H - 1;
  if (by < yLo || by > yHi - 1) return false;
  const under = world.getBlock(bx, by - 1, bz);
  if (under === null || under === undefined || under === 0) return false;
  const ub = BLOCKS[under];
  if (!ub || ub.liquid || !(ub.collision && ub.collision.length > 0) || ub.damage > 0) return false;
  const feet = world.getBlock(bx, by, bz);
  if (feet === null || feet === undefined) return false;
  if (feet !== 0 && isLiquid(feet)) return false;
  const head = world.getBlock(bx, by + 1, bz);
  if (head !== 0 && head !== null && head !== undefined && isLiquid(head)) return false;
  const cx = bx + 0.5;
  const cz = bz + 0.5;
  return isBoxFree(world, cx - HALF_W, by + 0.001, cz - HALF_W, cx + HALF_W, by + BODY_H, cz + HALF_W);
}

function ensureAround(world, bx, bz, r) {
  const cx0 = (bx - r) >> 4;
  const cx1 = (bx + r) >> 4;
  const cz0 = (bz - r) >> 4;
  const cz1 = (bz + r) >> 4;
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!world.hasChunk(cx, cz) && world.canGenerate(cx, cz)) world.ensureChunk(cx, cz);
    }
  }
}

function insideWorld(world, bx, bz) {
  return !world.frame || world.isBlockInBounds(bx, bz);
}

/**
 * Güvenli doğuş: önce verilen konum, yoksa spiral halkalarda (r ≤ maxR) en yakın ayakta durulabilir sütun.
 * y verilirse o sütunda önce (y-3..y+4) denenir, sonra yüzey. Chunk'lar gerekirse eşzamanlı üretilir.
 * Hiçbiri yoksa ok:false ve verilen konum (y yükseltilerek) döner.
 */
export function findSafeSpawn(world, x, y, z, opts) {
  const o = opts || {};
  const maxR = o.maxR > 0 ? o.maxR : 24;
  const sx = Math.floor(x);
  const sz = Math.floor(z);
  // Varsayılan (doğuş kurulumu): r ≤ 20 içindeki chunk'lar peşinen üretilir (yükleme ekranında; oyun başlarken çevre hazır olsun).
  // opts.lazy (oyun içi ışınlanma): yalnız merkez sütunun chunk'ı hemen üretilir; spiral aramada komşular GEREKİRSE (sütun ziyaret
  // edilince) üretilir. Peşin yol uzak ışınlanmada ~9 chunk ≈ 100–350 ms'yi tek karede harcıyordu.
  ensureAround(world, sx, sz, o.lazy ? 0 : Math.min(maxR, 20));
  const tryColumn = (bx, bz, hintY) => {
    if (!insideWorld(world, bx, bz)) return null;
    if (!world.hasChunk(bx >> 4, bz >> 4)) {
      if (!world.canGenerate(bx >> 4, bz >> 4)) return null;
      world.ensureChunk(bx >> 4, bz >> 4);
      if (!world.hasChunk(bx >> 4, bz >> 4)) return null;
    }
    if (hintY !== undefined) {
      // derin dünya: ipucu y'sinin çevresindeki derin kesitler hazır olsun (mağara içi ışınlanma/kayıt konumu)
      if (world.legacy === false && typeof world.ensureSectionsNear === 'function') world.ensureSectionsNear(bx, hintY, bz, 2, 10);
      for (let dy = 0; dy <= 4; dy++) {
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          if (dy === 0 && sgn > 0) continue;
          const yy = Math.floor(hintY) + sgn * dy;
          if (standableAt(world, bx, yy, bz)) return yy;
        }
      }
    }
    const top = world.surfaceY(bx, bz, { ignoreFoliage: true });
    if (top >= 0 && standableAt(world, bx, top + 1, bz)) return top + 1;
    return null;
  };
  const first = tryColumn(sx, sz, numOr(y, undefined));
  if (first !== null) return { x: sx + 0.5, y: first, z: sz + 0.5, ok: true, moved: Math.abs(x - (sx + 0.5)) > 0.51 || Math.abs(z - (sz + 0.5)) > 0.51 };
  for (let r = 1; r <= maxR; r++) {
    // halka r (Chebyshev): dış kenar hücreleri
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const yy = tryColumn(sx + dx, sz + dz, undefined);
        if (yy !== null) return { x: sx + dx + 0.5, y: yy, z: sz + dz + 0.5, ok: true, moved: true };
      }
    }
  }
  const t = world.surfaceY(sx, sz, { ignoreFoliage: true });
  return { x: sx + 0.5, y: (t >= 0 ? t + 1 : numOr(y, 64)) + 0.01, z: sz + 0.5, ok: false, moved: false };
}

function frameWorld(wopts, mapData, mode, errors) {
  // mapData → importMap; geçersizse taban dünyaya düş
  let imp = null;
  if ((mapData === undefined || mapData === null) && mode === 'harita') errors.push('Oynanacak harita verisi verilmedi; boş bir düzlük açıldı.');
  if (mapData !== undefined && mapData !== null) {
    imp = importMap(mapData, { mode });
    if (!imp.ok) {
      errors.push.apply(errors, imp.errors || ['Harita yüklenemedi.']);
      imp = null;
    }
  }
  if (imp) {
    const world = new World(imp.worldOptions);
    return {
      world, spawn: imp.spawn, time: imp.time, meta: imp.meta || null, base: imp.base,
    };
  }
  const base = MAP_BASES.indexOf(wopts.base) >= 0 ? wopts.base : 'düz';
  const world = new World({
    seed: MAP_BASE_SEED, mode, base,
  });
  return {
    world, spawn: baseSpawn(), time: 'gündüz', meta: null, base,
  };
}

/**
 * Mod dünyasını kurar (bkz. dosya başı). `zoneUnlocked(i)` macera için ilerleme bağlantısıdır.
 * @param {{mode?:string, seed?:any, mapData?:object|string|null, base?:string, zoneUnlocked?:Function}} opts
 */
export function createModeWorld(opts) {
  const o = opts || {};
  const mode = o.mode === 'insa' || o.mode === 'harita' ? o.mode : 'macera';
  const errors = [];
  if (mode === 'macera') {
    const { seed, worldCode, seedInput } = resolveSeed(o.seed);
    const world = new World({
      seed,
      mode: 'macera',
      decorate: decorateChunk,
      zoneUnlocked: typeof o.zoneUnlocked === 'function' ? o.zoneUnlocked : null,
    });
    warmStructures(seed); // yapı çapalarını ısıt: ilk chunk'larda takılma olmasın
    const sp = spawnPoint(seed);
    const safe = findSafeSpawn(world, sp.x, sp.y, sp.z, { maxR: 28 });
    return {
      world,
      mode,
      seed,
      worldCode,
      seedInput,
      spawn: { x: safe.x, y: safe.y, z: safe.z },
      yaw: spawnYaw(seed, safe.x, safe.z), // ilk bakış: en yakın ağaca (ilk görev odun toplamak)
      time: 'gündüz',
      phase: 0.1,
      frozenClock: false,
      mapMeta: null,
      errors,
    };
  }
  const f = frameWorld(o, o.mapData, mode, errors);
  const sp = f.spawn;
  const safe = findSafeSpawn(f.world, numOr(sp[0], 64), numOr(sp[1], 64), numOr(sp[2], 64), { maxR: 20 });
  const code = worldCodeOf(MAP_BASE_SEED);
  return {
    world: f.world,
    mode,
    seed: MAP_BASE_SEED,
    worldCode: code,
    seedInput: MAP_BASE_SEED,
    spawn: { x: safe.x, y: safe.y, z: safe.z },
    yaw: 0,
    time: f.time,
    phase: mapTimePhase(f.time),
    frozenClock: true,
    mapMeta: {
      title: f.meta && f.meta.title ? f.meta.title : '',
      desc: f.meta && f.meta.desc ? f.meta.desc : '',
      base: f.base,
      time: f.time,
      size: { x: CHUNK_SIZE * 8, z: CHUNK_SIZE * 8 },
      spawn: [safe.x, safe.y, safe.z],
    },
    errors,
  };
}
