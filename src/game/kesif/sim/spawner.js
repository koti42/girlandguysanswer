/*
 * KEŞİF sim — doğal yaratık doğma/yok olma (saf; Math.random/Date.now yok).
 *
 *   const sp = new Spawner({ seed, world, em });
 *   sp.update(dt, player, { dayFactor, peaceful, arenas:[{x,z,r,done}], biomeAt(x,z)→anahtar, night? });
 *
 * Kurallar: ≤ 24 düşman + ≤ 20 pasif (oyuncu çevresinde); düşman yalnızca karanlıkta (ışık ≤ tür eşiği: gece yüzeyi ya da
 * mağara); tür/bölge/biyom/ışık/gece-gündüz/yükseklik kuralları mobTypes.canSpawnAt'tan; oyuncunun görüş konisinde 14 blok
 * içine ve hiçbir zaman 8 blok içine doğmaz; kilidi açılmamış/tamamlanmamış boss arenalarında doğmaz; doğma kısılır
 * (deneme aralığı + saniyelik bütçe). Her deneme kendi rng akışını (dünya tohumu + tik + deneme) kullanır → belirlenimci.
 * İlk gece adaleti: ctx.early = {grace 0..1} verilirse (earlyGame.js) tavan/aralık/mesafe/sürü boyu yeni oyuncu için küçülür.
 * Yok olma: çok uzaktakiler, ışıkta 12 sn'den uzun kalan düşmanlar, uzak pasifler (kalıcı/boss/yavru/savaştakiler hariç).
 *
 * spawnerForChunk(seed,cx,cz,opts) → chunk üretilirken sürü tanımları (yalnız tohum+koordinata bağlı);
 * populateChunk(em, world, seed, cx, cz, opts) bunları zemine oturtup doğurur (chunk başına bir kez).
 *
 * Profil: new Spawner({..., profile:'neon', neon:{tier,driving,gentle,say,grantKredi}}) → Neon Meridyen: organik doğma YOK; yalnızca dost/yaramaz robotlar
 * (sim/city/ped/robots.js, tohumlu yuvalardan). setProfile(ad) profili değiştirir (neon'dan çıkarken robotlar kaldırılır; ana diyar durumu
 * neon güncellemelerinden etkilenmez → geri dönünce birebir aynı); clearMobs() robotları kaldırır. Ana diyar profili bayt-bayt eskisi gibidir.
 */
import { BIOME_KEYS, CHUNK_SIZE, zoneIndexAt } from './constants.js';
import { hash2, hash3, hash3f, hash32, seededRandom } from './rng.js';
import { canSpawnAt, getMobType, mobsForZone } from './mobTypes.js';
import { isBoxFree } from './physics.js';
import { earlyTuning } from './earlyGame.js';
import { cellLiquid, cellSolid, effectiveLight } from './mobAIUtil.js';
import { createNeonRobots } from './city/ped/robots.js';

export const SPAWN = Object.freeze({
  hostileCap: 24,
  caveCap: 10, // mağara düşmanları toplam tavanı doldurup gece yüzey doğmasını aç bırakmasın
  passiveCap: 20,
  hostileEvery: 0.5,
  passiveEvery: 2,
  minDist: 8, // hiçbir yaratık oyuncuya bundan yakın doğmaz
  coneDist: 14, // görüş konisi içinde bu mesafeden yakın doğmaz
  coneCos: Math.cos((62 * Math.PI) / 180),
  hostileMin: 18,
  hostileMax: 48,
  passiveMin: 16,
  passiveMax: 40,
  tries: 6,
  maxPerSecond: 6,
  despawnFar: 96,
  despawnSoft: 64,
  // derin dünya: dikey ilgi aralığı. Mağaradaki oyuncunun yüzeyde (yüzlerce blok üstte) doğan yaratıklar tavanı doldurup
  // mağara doğmasını aç bırakmasın; çok yukarıda/aşağıda kalan yaratıklar sayılmaz ve yok olur.
  maxDy: 56, // bu kadar yukarı/aşağıdaki noktalarda doğmaz; sayımlara bu aralıktakiler girer
  despawnDy: 80, // oyuncudan dikeyde bu kadar uzaktakiler yok olur
  litSeconds: 12,
  nightDay: 0.32,
});

const TAU = Math.PI * 2;

function biomeKeyAt(world, ctx, x, z) {
  if (ctx && ctx.biomeAt) return ctx.biomeAt(x, z);
  if (typeof world.getBiome === 'function') {
    const i = world.getBiome(Math.floor(x), Math.floor(z));
    if (i >= 0 && i < BIOME_KEYS.length) return BIOME_KEYS[i];
  }
  return 'cayir';
}

/** Chunk üretilmiş mi (sütunun bir hücresi okunabiliyor mu)? */
function loadedAt(world, x, z) {
  const id = world.getBlock(Math.floor(x), 1, Math.floor(z));
  return id !== null && id !== undefined;
}

/** Yüzey noktası: {y, habitat:'yüzey'|'su'} | null. y = ayak hücresi. */
function surfaceSpot(world, x, z) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  if (typeof world.surfaceY !== 'function') return null;
  const sy = world.surfaceY(fx, fz, { ignoreFoliage: true, liquid: true });
  if (sy < 0) return null;
  const top = world.getBlock(fx, sy, fz);
  if (top === null || top === undefined) return null;
  if (cellLiquid(world, fx, sy, fz)) {
    // su: yüzeyin hemen altı (en az 2 su hücresi derin olmalı)
    if (!cellLiquid(world, fx, sy - 1, fz)) return null;
    return { y: sy - 1, habitat: 'su' };
  }
  const y = sy + 1;
  if (cellSolid(world, fx, y, fz) || cellSolid(world, fx, y + 1, fz)) return null;
  if (cellLiquid(world, fx, y, fz)) return null;
  return { y, habitat: 'yüzey' };
}

/** Mağara noktası: kapalı (gökyüzü ışığı düşük), altı katı, üstü 2 boş. y aralığı oyuncuya göre. */
function caveSpot(world, rng, x, z, py) {
  const fx = Math.floor(x);
  const fz = Math.floor(z);
  // derin dünya: mağara noktası oyuncunun yakın dikey çevresinde (tabandan tavana her yerde olabilir)
  const yLo = world.yMin !== undefined ? world.yMin : 0;
  const yHi = world.yMax !== undefined ? world.yMax : 127;
  const top = Math.min(yHi - 8, Math.floor(py) + 10);
  const bot = Math.max(yLo + 8, Math.floor(py) - 28);
  if (top <= bot) return null;
  const start = bot + Math.floor(rng.next() * (top - bot));
  for (let n = 0; n <= top - bot; n++) {
    let y = start - n;
    if (y < bot) y += top - bot + 1;
    if (cellSolid(world, fx, y, fz) || cellSolid(world, fx, y + 1, fz) || cellLiquid(world, fx, y, fz)) continue;
    if (!cellSolid(world, fx, y - 1, fz)) continue;
    if (typeof world.getLight === 'function' && (world.getLight(fx, y, fz) >> 4) > 7) continue; // açık gökyüzü: mağara değil
    return { y, habitat: 'mağara' };
  }
  return null;
}

export class Spawner {
  constructor(opts) {
    this.world = opts.world;
    this.em = opts.em;
    this.seed = (opts.seed === undefined ? 0 : opts.seed) | 0;
    this.tick = 0;
    this.hT = 0.25;
    this.pT = 1;
    this.dT = 1;
    this.budget = SPAWN.maxPerSecond;
    this.stats = { hostileSpawned: 0, passiveSpawned: 0, despawned: 0, attempts: 0 };
    this._ctx = null;
    this.nightT = 0; // gecenin başından beri sn (ilk gece tavan basamağı)
    this.tune = null; // earlyTuning çıktısı (koruma yokken null)
    this.profile = opts.profile === 'neon' ? 'neon' : 'overworld';
    this._neonOpts = opts.neon || null;
    this._neon = null; // Neon Meridyen robot doğurucusu (ilk neon güncellemesinde kurulur)
  }

  /** Profil değiştirir ('overworld' | 'neon'). Neon'dan çıkarken robotlar kaldırılır; ana diyar zamanlayıcıları/sayaçları dokunulmaz. */
  setProfile(name) {
    const next = name === 'neon' ? 'neon' : 'overworld';
    if (next === this.profile) return this;
    this.clearMobs();
    this.profile = next;
    return this;
  }

  /** Neon robotlarını kaldırır (boyut değişimi / profil geçişi); doğurucu durumu sıfırlanır. Dönüş: kaldırılan sayı. */
  clearMobs() {
    return this._neon ? this._neon.clearMobs() : 0;
  }

  /** Neon robot doğurucusu (yalnız neon profilinde; yoksa null). */
  neon() {
    if (this.profile !== 'neon') return null;
    if (!this._neon) this._neon = createNeonRobots({ seed: this.seed, world: this.world, em: this.em, hooks: this._neonOpts });
    return this._neon;
  }

  /** Oyuncu çevresindeki yaşayan sayılar (minyon/boss hariç). */
  countsNear(player) {
    let hostile = 0;
    let passive = 0;
    let cave = 0;
    const r2 = SPAWN.despawnFar * SPAWN.despawnFar;
    const world = this.world;
    const hasLight = typeof world.getLight === 'function';
    this.em.forEachMob((e) => {
      if (e.dead || e.minion || e.def.boss) return;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      if (dx * dx + dz * dz > r2) return;
      if (Math.abs(e.y - player.y) > SPAWN.maxDy) return; // dikeyde uzak: oyuncunun çevresi sayılmaz
      if (e.def.hostile) {
        hostile++;
        if (hasLight) {
          const fx = Math.floor(e.x);
          const fy = Math.floor(e.y + 0.5);
          const fz = Math.floor(e.z);
          // kapalı alan (gökyüzü ışığı düşük) = mağara; yüklü olmayan chunk'taki yaratık yüzey sayılır
          if (world.getBlock(fx, fy, fz) !== null && (world.getLight(fx, fy, fz) >> 4) <= 7) cave++;
        }
      } else passive++;
    });
    return { hostile, passive, cave };
  }

  /** ctx: {dayFactor, peaceful, arenas, biomeAt, night} */
  update(dt, player, ctx) {
    if (!(dt > 0) || !player) return;
    if (this.profile === 'neon') {
      this.neon().update(dt, player, ctx);
      return;
    }
    const c = ctx || {};
    this._ctx = c;
    this.tick++;
    const night = this._isNight(c);
    if (night) this.nightT += dt;
    else this.nightT = 0;
    // gündüz (mağara vb.) tırmanma tamamlanmış sayılır: yalnızca gecenin ilk dakikaları yumuşatılır
    this.tune = c.early && c.early.grace > 0 ? earlyTuning(c.early.grace, night ? this.nightT : Infinity, SPAWN) : null;
    this.budget = Math.min(SPAWN.maxPerSecond, this.budget + dt * SPAWN.maxPerSecond);
    this.hT -= dt;
    this.pT -= dt;
    this.dT -= dt;
    if (this.dT <= 0) {
      this.dT = 1;
      this._despawn(player);
    }
    if (player.dead) return;
    if (this.hT <= 0) {
      this.hT = this.tune ? this.tune.hostileEvery : SPAWN.hostileEvery;
      if (!c.peaceful) this._attempt(player, c, true);
    }
    if (this.pT <= 0) {
      this.pT = SPAWN.passiveEvery;
      this._attempt(player, c, false);
    }
  }

  _isNight(c) {
    if (c.night !== undefined) return !!c.night;
    const df = c.dayFactor === undefined ? 1 : c.dayFactor;
    return df < SPAWN.nightDay;
  }

  _blockedByArena(c, x, z) {
    const arenas = c.arenas;
    if (!arenas) return false;
    for (let i = 0; i < arenas.length; i++) {
      const a = arenas[i];
      if (a.done) continue;
      const dx = x - a.x;
      const dz = z - a.z;
      const rr = a.r + 6;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  _attempt(player, c, hostile) {
    const world = this.world;
    const counts = this.countsNear(player);
    const tn = hostile ? this.tune : null;
    const hostileCap = tn ? tn.hostileCap : SPAWN.hostileCap;
    const caveCap = tn ? tn.caveCap : SPAWN.caveCap;
    if (hostile ? counts.hostile >= hostileCap : counts.passive >= SPAWN.passiveCap) return;
    if (this.budget < 1) return;
    this.stats.attempts++;
    const night = this._isNight(c);
    const df = c.dayFactor === undefined ? 1 : c.dayFactor;
    const rng = seededRandom(hash3(this.seed, this.tick, hostile ? 0x4057 : 0x9a55));
    const minD = hostile ? (tn ? tn.hostileMin : SPAWN.hostileMin) : SPAWN.passiveMin;
    const maxD = hostile ? (tn ? tn.hostileMax : SPAWN.hostileMax) : SPAWN.passiveMax;
    const fx = -Math.sin(player.yaw || 0);
    const fz = -Math.cos(player.yaw || 0);

    for (let t = 0; t < SPAWN.tries; t++) {
      const ang = rng.next() * TAU;
      const dist = minD + Math.sqrt(rng.next()) * (maxD - minD);
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      const x = player.x + dx * dist;
      const z = player.z + dz * dist;
      if (dist < SPAWN.minDist) continue;
      if (dist < SPAWN.coneDist && fx * dx + fz * dz > SPAWN.coneCos) continue; // oyuncunun gözü önünde doğma
      if (!loadedAt(world, x, z)) continue;
      if (this._blockedByArena(c, x, z)) continue;

      // aday noktalar: yüzey ve (düşman ya da %30 pasif değil) mağara
      let spot = null;
      const caveRoom = !hostile || counts.cave < caveCap;
      const caveRoll = hostile ? rng.next() < 0.5 : false;
      const wantCave = caveRoll && caveRoom;
      if (wantCave) spot = caveSpot(world, rng, x, z, player.y);
      if (!spot) spot = surfaceSpot(world, x, z);
      // yüzey, oyuncunun dikey ilgi aralığı dışındaysa (mağaradayken yüzey ya da dağ tepesinde vadi) orada doğurma
      if (spot && Math.abs(spot.y - player.y) > SPAWN.maxDy) spot = null;
      if (!spot && hostile && !wantCave && caveRoom) spot = caveSpot(world, rng, x, z, player.y);
      if (!spot) continue;

      const zone = zoneIndexAt(x, z);
      const light = effectiveLight(world, x, spot.y + 0.5, z, df);
      const biome = biomeKeyAt(world, c, x, z);
      const kind = hostile ? 'düşman' : 'pasif';
      const cands = mobsForZone(zone, kind);
      const pool = [];
      const weights = [];
      for (let i = 0; i < cands.length; i++) {
        const d = cands[i];
        const s = d.spawn;
        const habitatCtx = spot.habitat;
        // 'hava' yaratıkları yüzey noktasının üstünde doğar
        const h = d.spawn.habitat === 'hava' && habitatCtx === 'yüzey' ? 'hava' : habitatCtx;
        if (!canSpawnAt(d, { zone, light, biome, y: spot.y, night, habitat: h })) continue;
        const dd = Math.sqrt((x - player.x) * (x - player.x) + (z - player.z) * (z - player.z));
        if (dd < s.minDist * 0.5 || dd > s.maxDist + 16) continue;
        pool.push(d);
        weights.push(s.weight);
      }
      if (pool.length === 0) continue;
      const pick = pool[rng.weighted(weights)];
      let n = rng.int(pick.spawn.group[0], pick.spawn.group[1]);
      if (tn && n > tn.groupMax) n = tn.groupMax;
      let room = hostile ? hostileCap - counts.hostile : SPAWN.passiveCap - counts.passive;
      if (hostile && spot.habitat === 'mağara') room = Math.min(room, caveCap - counts.cave);
      const want = Math.min(n, room, Math.floor(this.budget));
      let made = 0;
      for (let k = 0; k < want; k++) {
        const ox = k === 0 ? 0 : (rng.next() - 0.5) * 6;
        const oz = k === 0 ? 0 : (rng.next() - 0.5) * 6;
        if (this._place(pick, x + ox, z + oz, spot, rng, player, c, k > 0)) made++;
      }
      if (made > 0) {
        this.budget -= made;
        if (hostile) this.stats.hostileSpawned += made;
        else this.stats.passiveSpawned += made;
        return;
      }
    }
  }

  /** Tek yaratık yerleştirir (zemine oturtur, boşluk/yakınlık denetler). */
  _place(def, x, z, baseSpot, rng, player, c, rescan) {
    const world = this.world;
    let y = baseSpot.y;
    let habitat = baseSpot.habitat;
    if (rescan) {
      // grup üyesi: kendi sütununda yeniden bul
      const s = habitat === 'mağara' ? caveSpot(world, rng, x, z, y) : surfaceSpot(world, x, z);
      if (!s || s.habitat !== habitat) return null;
      y = s.y;
      habitat = s.habitat;
    }
    if (def.spawn.habitat === 'hava' && habitat === 'yüzey') y += 2 + Math.floor(rng.next() * 3);
    const dxp = x - player.x;
    const dzp = z - player.z;
    if (dxp * dxp + dzp * dzp < SPAWN.minDist * SPAWN.minDist) return null;
    if (this._blockedByArena(c, x, z)) return null;
    const hw = def.hitbox.w * 0.5;
    const liquidOk = habitat === 'su';
    if (!liquidOk) {
      if (!isBoxFree(world, x - hw, y + 0.01, z - hw, x + hw, y + def.hitbox.h, z + hw)) return null;
    }
    const ent = this.em.spawn(def.key, x, y + (habitat === 'su' ? 0.2 : 0.02), z, {
      yaw: rng.next() * TAU - Math.PI,
      aggro: !!(this.tune && this.tune.hunt && def.hostile), // ilk gece: yeni doğan düşman oyuncuyu sinsice izler
    });
    if (!ent) return null;
    this.em.emit({ type: 'mobSpawned', id: ent.id, mob: ent.key, x, y, z, habitat });
    return ent;
  }

  /* -------------------------------------------------------------------------------------------
   * Yok olma
   * ----------------------------------------------------------------------------------------- */
  _despawn(player) {
    const em = this.em;
    const far2 = SPAWN.despawnFar * SPAWN.despawnFar;
    const soft2 = SPAWN.despawnSoft * SPAWN.despawnSoft;
    const gone = [];
    em.forEachMob((e) => {
      if (e.dead || e.persistent || e.minion || e.def.boss) return;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > far2 || Math.abs(e.y - player.y) > SPAWN.despawnDy) {
        gone.push(e);
        return;
      }
      const r = hash3f(e.id, this.tick, this.seed);
      if (e.def.hostile) {
        // ışıkta kalan düşman sönüp gider (yanmaz)
        if (e.ai.lit && !e.target) e.ai.litT = (e.ai.litT || 0) + 1;
        else e.ai.litT = 0;
        if (e.ai.litT >= SPAWN.litSeconds) {
          gone.push(e);
          return;
        }
        if (d2 > soft2 && !e.target && r < 0.12) gone.push(e);
      } else if (d2 > soft2 && r < 0.06) {
        gone.push(e);
      }
    });
    for (let i = 0; i < gone.length; i++) {
      em.dismiss(gone[i], 'mobFade');
      this.stats.despawned++;
    }
    // sınır aşımı: pasifler fazlaysa en uzaktakini at
    const cn = this.countsNear(player);
    if (cn.passive > SPAWN.passiveCap + 6) {
      let worst = null;
      let wd = -1;
      em.forEachMob((e) => {
        if (e.dead || e.persistent || e.minion || e.def.hostile) return;
        const dx = e.x - player.x;
        const dz = e.z - player.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > wd) {
          wd = d2;
          worst = e;
        }
      });
      if (worst) {
        em.dismiss(worst, 'mobFade');
        this.stats.despawned++;
      }
    }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Chunk üretiminde sürüler (belirlenimci; yalnızca tohum + koordinat)
 * ---------------------------------------------------------------------------------------------- */
/**
 * Chunk için pasif sürü tanımları: [{type, x, z, yaw, chunk:'cx,cz'}] (y yoktur: zemine oturtmak populateChunk'ın işi).
 * opts: {biomeAt(x,z) → biyom anahtarı (verilirse türün biyom kuralı uygulanır)}.
 */
export function spawnerForChunk(seed, cx, cz, opts) {
  const s32 = seed | 0;
  const h = hash2(cx, cz, s32 ^ 0x2f1c9a37);
  const rng = seededRandom(hash32(h));
  const mx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const mz = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  const zone = zoneIndexAt(mx, mz);
  const chance = zone === 0 ? 0.24 : 0.15;
  if (rng.next() >= chance) return [];
  const biomeAt = opts && opts.biomeAt;
  const biome = biomeAt ? biomeAt(mx, mz) : undefined;
  const pool = [];
  const weights = [];
  const cands = mobsForZone(zone, 'pasif');
  for (let i = 0; i < cands.length; i++) {
    const d = cands[i];
    if (d.spawn.habitat !== 'yüzey' || d.spawn.night) continue;
    if (biome !== undefined && d.spawn.biomes && d.spawn.biomes.indexOf(biome) < 0) continue;
    pool.push(d);
    weights.push(d.spawn.weight);
  }
  if (pool.length === 0) return [];
  const type = pool[rng.weighted(weights)];
  const n = rng.int(type.spawn.group[0], type.spawn.group[1]);
  const out = [];
  const cxm = cx * CHUNK_SIZE + 3 + rng.next() * (CHUNK_SIZE - 6);
  const czm = cz * CHUNK_SIZE + 3 + rng.next() * (CHUNK_SIZE - 6);
  for (let i = 0; i < n; i++) {
    out.push({
      type: type.key,
      x: Math.round((cxm + (rng.next() - 0.5) * 5) * 100) / 100,
      z: Math.round((czm + (rng.next() - 0.5) * 5) * 100) / 100,
      yaw: Math.round((rng.next() * TAU - Math.PI) * 1000) / 1000,
      chunk: cx + ',' + cz,
    });
  }
  return out;
}

/**
 * Chunk sürülerini dünyaya oturtur (chunk başına bir kez; em.populated kayda girer). Dönüş: doğan yaratıklar.
 * opts: {biomeAt}. Gündüz, tam ışık varsayılır (chunk üretiminde zaman yok); kurallar yine canSpawnAt'tan.
 */
export function populateChunk(em, world, seed, cx, cz, opts) {
  if (world.dim !== undefined && world.dim !== 'overworld') return []; // şehirde organik sürü yok (yalnız robotlar)
  const key = cx + ',' + cz;
  if (em.populated.has(key)) return [];
  em.populated.add(key);
  if (em.mobs.size > em.maxMobs - 40) return [];
  const list = spawnerForChunk(seed, cx, cz, opts);
  const made = [];
  const biomeAt = opts && opts.biomeAt;
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const def = getMobType(d.type);
    const spot = surfaceSpot(world, d.x, d.z);
    if (!def || !spot || spot.habitat !== 'yüzey') continue;
    const zone = zoneIndexAt(d.x, d.z);
    const biome = biomeAt ? biomeAt(d.x, d.z) : biomeKeyAt(world, null, d.x, d.z);
    if (!canSpawnAt(def, { zone, light: 15, biome, y: spot.y, habitat: 'yüzey' })) continue;
    const hw = def.hitbox.w * 0.5;
    if (!isBoxFree(world, d.x - hw, spot.y + 0.01, d.z - hw, d.x + hw, spot.y + def.hitbox.h, d.z + hw)) continue;
    const e = em.spawn(def.key, d.x, spot.y + 0.02, d.z, { yaw: d.yaw });
    if (e) made.push(e);
  }
  return made;
}
