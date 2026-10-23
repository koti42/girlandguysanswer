/*
 * KEŞİF — çevre örnekleyici: oyuncunun bulunduğu bölge, biyom, yeraltı/gece/hava, su-lav yakınlığı (≈4 Hz) ve bunlardan
 * ses ortamı + parçacık ortamı türetme (saf yardımcılar test edilir).
 *
 *   ambientAudioFor(env) → audio.setAmbient girdisi        ambientParticlesFor(env) → particles.setAmbient girdisi
 *   weatherName(w) → 'clear'|'rain'|'snow'|'storm'          weatherLabel(w) → HUD metni ('' | 'yağmur' | 'kar' | 'fırtına')
 *   createEnvSampler(G) → { env, update(dt, x, y, z, skyRaw) → changed:{zone,biome} }
 *
 * env: {zone, zoneName, biomeKey, biomeName, underground, night, weather, temperature, water(0..1), lava(0..1),
 *       dayFactor, skyRaw, caveKey ('' | mağara stili anahtarı; yalnız yeraltında), caveName, rainFloor, snowFloor}
 *   changed: {zone, biome, cave}
 */
import { BIOMES, BIOME_KEYS, ZONES, zoneIndexAt } from './sim/constants.js';
import { BLOCKS } from './sim/blocks.js';
import { temperatureFor } from './sim/daynight.js';
import { BIOME_INFO, CAVE_STYLES } from './sim/biomeData.js';
import { caveStyleAt } from './sim/worldgenCaveStyles.js';

const BIOME_NAME = {};
BIOMES.forEach((b) => { BIOME_NAME[b.key] = b.name; });

export function weatherName(w) {
  if (!w || !(w.intensity > 0.15)) return 'clear';
  if (w.renderKind === 'snow') return 'snow';
  return w.intensity > 0.75 ? 'storm' : 'rain';
}

export function weatherLabel(w) {
  const n = weatherName(w);
  return n === 'rain' ? 'yağmur' : n === 'snow' ? 'kar' : n === 'storm' ? 'fırtına' : '';
}

export function ambientAudioFor(env) {
  return {
    zone: env.zone,
    biome: env.biomeKey,
    cave: env.underground ? env.caveKey : '',
    underground: env.underground,
    underwater: !!env.underwater,
    night: env.night,
    weather: env.weather,
    combat: env.combat || 0,
    water: env.water,
    lava: env.lava,
  };
}

/** Biyomun yüzey parçacık yoğunluğu (sim/biomeData BIOME_INFO[k].fx); bilinmeyen biyom 0. */
function fxOf(env, name) {
  const info = BIOME_INFO[env.biomeKey];
  const v = info ? info.fx[name] : 0;
  return v === undefined ? 0 : v;
}

const CAVE_BY_KEY = {};
CAVE_STYLES.forEach((c) => { CAVE_BY_KEY[c.key] = c; });

/** Parçacık ortamı (setAmbient: fireflies, pollen, dust, snow, embers, spores, leaves, petals, ash 0..1). `out` yeniden kullanılır. */
export function ambientParticlesFor(env, out) {
  const o = out || {};
  const dry = env.weather === 'clear';
  const surface = !env.underground && !env.underwater;
  const cave = env.underground && env.caveKey ? CAVE_BY_KEY[env.caveKey] : null;
  const cfx = cave ? cave.fx : null;
  o.fireflies = surface && env.night && dry ? fxOf(env, 'fireflies') : (cfx && cfx.fireflies ? cfx.fireflies : 0);
  o.pollen = surface && !env.night && dry ? fxOf(env, 'pollen') : 0;
  o.dust = env.underground ? (cfx && cfx.dust !== undefined ? cfx.dust : 0.5) : (dry && surface ? Math.max(fxOf(env, 'dust'), 0.05) : 0.05);
  // kar parçacığı: biyomun kendi yoğunluğu (kuru havada); yağışlı havada hava katmanı kar yağdırır
  o.snow = (surface && dry ? fxOf(env, 'snow') : 0) + (cfx && cfx.snow ? cfx.snow : 0);
  const emb = fxOf(env, 'embers');
  o.embers = env.zone >= 4 || env.lava > 0.3 ? Math.max(0.3, env.lava, surface ? emb : 0) : (surface ? emb : (cfx && cfx.embers ? cfx.embers : 0));
  o.spores = env.underground ? (cfx && cfx.spores !== undefined ? cfx.spores : 0.15) : (surface ? fxOf(env, 'spores') : 0);
  // yaprak/taçyaprağı/kül: yağmurda azalır (ıslak), rüzgârsız değil; yalnız yüzeyde
  const wet = (dry ? 1 : 0.35) * (env.night ? 0.3 : 1); // gece görünmez kare parçacıklar parlak durmasın
  o.leaves = surface ? fxOf(env, 'leaves') * wet : 0;
  o.petals = surface ? fxOf(env, 'petals') * wet : 0;
  o.ash = surface ? fxOf(env, 'ash') : 0;
  return o;
}

export function createEnvSampler(G) {
  const env = {
    zone: 0,
    zoneName: ZONES[0].name,
    biomeKey: 'cayir',
    biomeName: BIOME_NAME.cayir,
    underground: false,
    caveKey: '',
    caveName: '',
    rainFloor: 0,
    snowFloor: 0,
    night: false,
    weather: 'clear',
    temperature: 0.5,
    water: 0,
    lava: 0,
    dayFactor: 1,
    skyRaw: 15,
    underwater: false,
    combat: 0,
  };
  const changed = { zone: false, biome: false, cave: false };
  let caveEnterAt = -99;
  let clockT = 0;
  let acc = 1;
  let first = true;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

  function scanLiquids(bx, by, bz) {
    let water = 0;
    let lava = 0;
    const w = G.world;
    for (let r = 2; r <= 5; r += 3) {
      for (let k = 0; k < DIRS.length; k++) {
        for (let dy = -1; dy <= 0; dy++) {
          const id = w.getBlock(bx + DIRS[k][0] * r, by + dy, bz + DIRS[k][1] * r);
          if (!id) continue;
          const b = BLOCKS[id];
          if (!b || !b.liquid) continue;
          if (b.damage > 0) lava += 1;
          else water += 1;
        }
      }
    }
    env.water = Math.min(1, water / 10);
    env.lava = Math.min(1, lava / 5);
  }

  function update(dt, x, y, z, skyRaw, dayFactor) {
    changed.zone = false;
    changed.biome = false;
    changed.cave = false;
    acc += dt;
    clockT += dt;
    if (acc < 0.25 && !first) return changed;
    acc = 0;
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const zi = zoneIndexAt(bx, bz);
    if (zi !== env.zone || first) {
      env.zone = zi;
      env.zoneName = ZONES[zi].name;
      changed.zone = true;
    }
    const bi = G.world.getBiome(bx, bz);
    if (bi >= 0 && bi < BIOME_KEYS.length) {
      const k = BIOME_KEYS[bi];
      if (k !== env.biomeKey || first) {
        env.biomeKey = k;
        env.biomeName = BIOME_NAME[k] || k;
        const inf = BIOME_INFO[k];
        env.rainFloor = inf ? inf.rain : 0;
        env.snowFloor = inf ? inf.snow : 0;
        changed.biome = true;
      }
    }
    env.skyRaw = skyRaw;
    env.dayFactor = dayFactor;
    env.underground = skyRaw <= 2.5 && y < 60;
    // mağara stili (yalnız macera + yeraltı): bölge × derinlik × 2B gürültü; giriş ipucu ~8 sn aralıklı
    let ck = '';
    if (env.underground && G.mode === 'macera') ck = CAVE_STYLES[caveStyleAt(G.seed, bx, y, bz)].key;
    if (ck !== env.caveKey) {
      env.caveKey = ck;
      env.caveName = ck && CAVE_BY_KEY[ck] ? CAVE_BY_KEY[ck].name : '';
      if (ck && ck !== 'normal' && clockT - caveEnterAt > 8) {
        changed.cave = true;
        caveEnterAt = clockT;
      }
    }
    env.night = dayFactor < 0.3;
    env.weather = weatherName(G.weatherSim);
    env.temperature = temperatureFor(env.biomeKey, y);
    scanLiquids(bx, Math.floor(y), bz);
    first = false;
    return changed;
  }

  return { env, update };
}
