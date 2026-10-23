/*
 * KEŞİF ses — saf yardımcılar (WebAudio yok; node'da test edilir).
 *
 *  - malzeme adı normalizasyonu (Türkçe/ASCII), mob → ses ailesi eşlemesi
 *  - mesafe sönümü, dinleyici yönü/pan hesabı
 *  - ortam karışımı: ambient bayraklarından yatak seviyeleri, yağış, yankı, alçak geçiren, rastgele olay hızları
 *  - ses sınırlayıcı (eşzamanlı ses tavanı, öncelik, mesafe)
 *  - yankı dürtüsü ve gürültü tamponu üretimi (tohumlu, belirlenimci)
 */
import { mulberry32 } from './sim/rng.js';
import { BIOME_INFO } from './sim/biomeData.js';

export const MATERIALS = Object.freeze(['taş', 'toprak', 'kum', 'ahşap', 'çim', 'kar', 'su', 'metal', 'yaprak', 'cam']);

/** Türkçe karakterleri ASCII'ye katlar, küçültür, boşluk/noktalama atar. */
export function foldKey(s) {
  if (typeof s !== 'string') return '';
  return s
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '');
}

const MATERIAL_ALIASES = {
  tas: 'taş',
  stone: 'taş',
  rock: 'taş',
  toprak: 'toprak',
  dirt: 'toprak',
  kil: 'toprak',
  camur: 'toprak',
  kum: 'kum',
  sand: 'kum',
  cakil: 'kum',
  ahsap: 'ahşap',
  odun: 'ahşap',
  wood: 'ahşap',
  cim: 'çim',
  grass: 'çim',
  kar: 'kar',
  snow: 'kar',
  buz: 'cam',
  su: 'su',
  water: 'su',
  metal: 'metal',
  demir: 'metal',
  iron: 'metal',
  yaprak: 'yaprak',
  leaf: 'yaprak',
  leaves: 'yaprak',
  cam: 'cam',
  glass: 'cam',
};

/** Blok `sound` alanı ya da serbest ad → kanonik malzeme; bilinmiyorsa 'taş'. */
export function normMaterial(name) {
  const k = foldKey(name);
  return Object.prototype.hasOwnProperty.call(MATERIAL_ALIASES, k) ? MATERIAL_ALIASES[k] : 'taş';
}

/* ------------------------------------------------------------------------------------------------
 * Yaratıklar → ses ailesi
 * ---------------------------------------------------------------------------------------------- */

const MOB_FAMILIES = {
  golge: { family: 'growl' },
  kemikci: { family: 'rattle' },
  kumakrebi: { family: 'skitter' },
  buzhortlagi: { family: 'hiss', icy: true },
  kristalbocegi: { family: 'skitter', crystal: true },
  lavslime: { family: 'gloop' },
  tasyarasasi: { family: 'flutter' },
  kokana: { family: 'roar', boss: 'kokana' },
  tasbekci: { family: 'roar', boss: 'tasbekci' },
  buzkral: { family: 'roar', boss: 'buzkral' },
  golgehukumdar: { family: 'roar', boss: 'golgehukumdar' },
  tavuk: { family: 'cluck' },
  koyun: { family: 'baa' },
  ormankedisi: { family: 'meow' },
  ceylan: { family: 'snort' },
  balik: { family: 'blub' },
  kelebek: { family: 'none' },
  atesbocegi: { family: 'none' },
  tilki: { family: 'meow' },
  kurbaga: { family: 'blub' },
  papagan: { family: 'cluck' },
};

export const MOB_FAMILY_NAMES = Object.freeze(['growl', 'rattle', 'skitter', 'hiss', 'gloop', 'flutter', 'roar', 'cluck', 'baa', 'meow', 'snort', 'blub']);

/** Mob anahtarı ya da aile adı → { family, icy?, crystal?, boss? } | null. */
export function mobSoundFor(key) {
  const k = foldKey(key);
  if (Object.prototype.hasOwnProperty.call(MOB_FAMILIES, k)) return MOB_FAMILIES[k].family === 'none' ? null : MOB_FAMILIES[k];
  if (MOB_FAMILY_NAMES.indexOf(k) >= 0) return { family: k };
  return null;
}

/* ------------------------------------------------------------------------------------------------
 * Mesafe ve yön
 * ---------------------------------------------------------------------------------------------- */

/** Ters mesafe modeli (PannerNode 'inverse' ile aynı); max ötesinde 0. */
export function distanceGain(dist, ref = 2, rolloff = 1.1, max = 48) {
  if (!(dist >= 0)) return 1;
  if (dist > max) return 0;
  if (dist <= ref) return 1;
  return ref / (ref + rolloff * (dist - ref));
}

/** Yaw (radyan; 0 = −Z'ye bakar, + = sola/saat yönü tersi, three.js kuralı) → yatay ileri vektör. */
export function forwardFromYaw(yaw) {
  return { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
}

const norm3 = (x, y, z, fx, fy, fz) => {
  const l = Math.hypot(x, y, z);
  return l > 1e-9 ? [x / l, y / l, z / l] : [fx, fy, fz];
};

/** Dinleyici tabanı: ileri, yukarı, sağ (sağ = ileri × yukarı). Geçersiz girişte varsayılan (−Z ileri, +Y yukarı). */
export function listenerBasis(forward, up, out = {}) {
  let f;
  if (typeof forward === 'number') f = forwardFromYaw(forward);
  else if (forward && Number.isFinite(forward.x) && Number.isFinite(forward.y) && Number.isFinite(forward.z)) f = forward;
  else f = { x: 0, y: 0, z: -1 };
  const u = up && Number.isFinite(up.x) && Number.isFinite(up.y) && Number.isFinite(up.z) ? up : { x: 0, y: 1, z: 0 };
  const [fx, fy, fz] = norm3(f.x, f.y, f.z, 0, 0, -1);
  const [ux, uy, uz] = norm3(u.x, u.y, u.z, 0, 1, 0);
  // right = forward × up
  const [rx, ry, rz] = norm3(fy * uz - fz * uy, fz * ux - fx * uz, fx * uy - fy * ux, 1, 0, 0);
  out.fx = fx;
  out.fy = fy;
  out.fz = fz;
  out.ux = ux;
  out.uy = uy;
  out.uz = uz;
  out.rx = rx;
  out.ry = ry;
  out.rz = rz;
  return out;
}

/** HRTF yoksa yedek: kaynağın dinleyiciye göre yatay konumu −1 (sol) .. +1 (sağ). */
export function panFor(basis, lx, ly, lz, x, y, z) {
  const dx = x - lx;
  const dy = y - ly;
  const dz = z - lz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-6) return 0;
  const p = (dx * basis.rx + dy * basis.ry + dz * basis.rz) / d;
  return p < -1 ? -1 : p > 1 ? 1 : p;
}

/* ------------------------------------------------------------------------------------------------
 * Ortam karışımı
 * ---------------------------------------------------------------------------------------------- */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const BIOME_MATCH = [
  // biyom genişletmesi (sim/biomeData): 'orman' içeren yeni adlar eski 'orman' eşleşmesinden ÖNCE gelir
  ['yagmurorman', 'yagmurorman'],
  ['yagmur', 'yagmurorman'],
  ['sonbahar', 'sonbahar'],
  ['kiraz', 'kiraz'],
  ['mangrov', 'mangrov'],
  ['savan', 'savan'],
  ['taiga', 'taiga'],
  ['karlicam', 'taiga'],
  ['buzul', 'buzul'],
  ['mantar', 'mantar'],
  ['bambu', 'bambu'],
  ['volkanik', 'volkanik'],
  ['mercan', 'mercan'],
  ['cicek', 'cicek'],
  ['golge', 'golge'],
  ['karacam', 'karacam'],
  ['kristal', 'kristal'],
  ['bataklik', 'bataklik'],
  ['tundra', 'tundra'],
  ['cayir', 'cayir'],
  ['orman', 'orman'],
  ['plaj', 'plaj'],
  ['deniz', 'plaj'],
  ['col', 'col'],
  ['kanyon', 'col'],
  ['dag', 'dag'],
  ['zirve', 'dag'],
];

/** Biyom anahtarı ya da Türkçe ad → kanonik anahtar ('cayir', 'orman', …) | ''. */
export function normBiome(b) {
  const k = foldKey(typeof b === 'object' && b ? b.key || b.name : b);
  if (!k) return '';
  for (let i = 0; i < BIOME_MATCH.length; i++) if (k.indexOf(BIOME_MATCH[i][0]) === 0) return BIOME_MATCH[i][1];
  for (let i = 0; i < BIOME_MATCH.length; i++) if (k.indexOf(BIOME_MATCH[i][0]) >= 0) return BIOME_MATCH[i][1];
  return '';
}

const ZONE_KEYS = ['baslangic', 'fisildayan', 'yanik', 'donmus', 'cekirdek'];

/** Bölge: sayı, {id}, anahtar ya da ad → 0..4. */
export function normZone(z) {
  if (typeof z === 'number' && Number.isFinite(z)) return Math.max(0, Math.min(4, Math.floor(z)));
  if (z && typeof z === 'object') return normZone(typeof z.id === 'number' ? z.id : z.key || z.name);
  const k = foldKey(typeof z === 'string' ? z : '');
  for (let i = 0; i < ZONE_KEYS.length; i++) if (k && k.indexOf(ZONE_KEYS[i]) === 0) return i;
  if (k.indexOf('fisilda') === 0) return 1;
  if (k.indexOf('yanik') === 0) return 2;
  if (k.indexOf('donmus') === 0) return 3;
  if (k.indexOf('cekirdek') === 0) return 4;
  return 0;
}

/** Hava: 'yağmur'|'rain' → 'rain', 'kar'|'snow' → 'snow', 'fırtına'|'storm' → 'storm', diğer → 'clear'. */
export function normWeather(w) {
  const k = foldKey(typeof w === 'string' ? w : '');
  if (!k) return 'clear';
  if (k.indexOf('firtina') >= 0 || k.indexOf('storm') >= 0) return 'storm';
  if (k.indexOf('yagmur') >= 0 || k.indexOf('rain') >= 0) return 'rain';
  if (k.indexOf('kar') === 0 || k.indexOf('snow') >= 0) return 'snow';
  return 'clear';
}

const BASE_WIND = { dag: 0.55, tundra: 0.5, col: 0.4, plaj: 0.3, cayir: 0.22, karacam: 0.2, kristal: 0.15, bataklik: 0.12, orman: 0.12 };
const BASE_REVERB = { orman: 0.18, karacam: 0.18, dag: 0.22, col: 0.24, kristal: 0.3, tundra: 0.16, plaj: 0.1, cayir: 0.1, bataklik: 0.14 };
const BIRD_BIOMES = { cayir: 0.3, orman: 0.4, karacam: 0.2, plaj: 0.25, bataklik: 0.15 };
const CRICKET_BIOMES = { cayir: 0.9, orman: 0.7, bataklik: 0.8, karacam: 0.4 };

/** Yeni biyomların ses ağırlıkları (sim/biomeData BIOME_INFO.audio): eski tablolarda yoksa buradan. */
function biomeAudio(biome, field, table) {
  if (table[biome] !== undefined) return table[biome];
  const info = BIOME_INFO[biome];
  const v = info && info.audio ? info.audio[field] : undefined;
  return v;
}

/** Mağara stili → ek ortam (damla, lav kabarcığı, yankı, hafif rüzgâr). Anahtar: biomeData.CAVE_STYLES. */
const CAVE_AUDIO = {
  cicekli: { drip: 0.55, frog: 0.15, reverb: 0.5 },
  geod: { drip: 0.25, reverb: 0.7 },
  dripstone: { drip: 0.9, reverb: 0.6 },
  buzul: { drip: 0.12, wind: 0.14, reverb: 0.6 },
  lavtup: { lava: 0.55, wind: 0.08, reverb: 0.5 },
  harabe: { drip: 0.22, reverb: 0.75 },
};

/**
 * ambient: { zone, biome, underground, underwater, night, weather, combat, water?, lava? }
 * Dönüş: yatak seviyeleri (0..1), saniyedeki rastgele olay hızları, yankı karışımı, süzgeç frekansı.
 */
export function ambientMix(amb) {
  const a = amb && typeof amb === 'object' ? amb : {};
  const zone = normZone(a.zone);
  const biome = normBiome(a.biome);
  const weather = normWeather(a.weather);
  const underground = Boolean(a.underground);
  const underwater = Boolean(a.underwater);
  const night = Boolean(a.night);
  const combat = typeof a.combat === 'number' ? clamp01(a.combat) : a.combat ? 1 : 0;
  const waterNear = clamp01(Number(a.water) || 0);
  const lavaNear = clamp01(Number(a.lava) || 0);

  const windBase = biomeAudio(biome, 'wind', BASE_WIND);
  let wind = (windBase !== undefined ? windBase : 0.18) + (zone === 3 ? 0.15 : zone === 2 ? 0.05 : 0);
  let rain = 0;
  if (weather === 'rain') {
    rain = 0.55;
    wind += 0.1;
  } else if (weather === 'storm') {
    rain = 0.9;
    wind += 0.3;
  } else if (weather === 'snow') {
    wind += 0.25;
  }
  let water = clamp01(waterNear * 0.55 + (biome === 'plaj' ? 0.12 : 0));
  let drip = 0;
  let reverb = BASE_REVERB[biome] !== undefined ? BASE_REVERB[biome] : 0.12;
  let bird = 0;
  let cricket = 0;
  let frog = 0;
  let lowpass = 20000;

  let cave = null;
  if (underground) {
    wind *= 0.08;
    rain *= 0.12;
    drip = 0.35;
    reverb = 0.55;
    cave = typeof a.cave === 'string' && CAVE_AUDIO[a.cave] ? CAVE_AUDIO[a.cave] : null;
    if (cave) {
      if (cave.drip !== undefined) drip = Math.max(drip, cave.drip);
      if (cave.reverb !== undefined) reverb = Math.max(reverb, cave.reverb);
      if (cave.wind !== undefined) wind = Math.max(wind, cave.wind);
      if (cave.frog !== undefined) frog = cave.frog;
    }
  } else {
    const birdW = biomeAudio(biome, 'bird', BIRD_BIOMES);
    const cricketW = biomeAudio(biome, 'cricket', CRICKET_BIOMES);
    const frogW = biomeAudio(biome, 'frog', {});
    // yağmur ormanı ıslak kuş sesini bastırmaz (sürekli yağmur → kuşlar hep ötüyor): ağırlık yağmura az duyarlı
    const wetBird = biome === 'yagmurorman' ? 0.7 : 0.15;
    if (!night && birdW !== undefined) bird = birdW * (rain > 0 ? wetBird : 1);
    if (night && cricketW !== undefined) cricket = cricketW * (rain > 0 ? 0.2 : 1);
    if (biome === 'bataklik') frog = (night ? 0.6 : 0.25) * (rain > 0 ? 1.4 : 1);
    else if (frogW !== undefined) frog = frogW * (night ? 0.65 : 0.22) * (rain > 0 ? 1.4 : 1);
  }
  if (underwater) {
    wind = 0;
    rain = 0;
    drip = 0;
    bird = 0;
    cricket = 0;
    frog = 0;
    water = Math.max(water, 0.12);
    reverb = 0.32;
    lowpass = 650;
  } else if (underground) {
    lowpass = 9000;
  }
  const duck = 1 - 0.5 * combat;
  return {
    zone,
    biome,
    weather,
    night,
    underground,
    underwater,
    combat,
    wind: clamp01(wind) * duck,
    rain: clamp01(rain) * duck,
    water: clamp01(water) * duck,
    drip,
    bird: bird * duck,
    cricket: cricket * duck,
    frog: frog * duck,
    lavaBubble: lavaNear * 2.2 + (cave && cave.lava ? cave.lava : 0),
    reverb: clamp01(reverb),
    lowpass,
  };
}

/** İki ambientMix değerinin sayısal alanlarını t (0..1) ile yaklaştırır; bayraklar hedefe geçer. */
export function blendMix(cur, target, t, out = cur) {
  const k = clamp01(t);
  const keys = Object.keys(target);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const tv = target[key];
    if (typeof tv === 'number') {
      const cv = typeof cur[key] === 'number' ? cur[key] : tv;
      // lowpass logaritmik karışsın (kulak oranlara duyarlı).
      out[key] = key === 'lowpass' ? Math.exp(Math.log(cv) + (Math.log(tv) - Math.log(cv)) * k) : cv + (tv - cv) * k;
    } else {
      out[key] = tv;
    }
  }
  return out;
}

/** Poisson süreci için bir sonraki olaya kadar saniye (rate olay/sn); rate ≤ 0 ise Infinity. */
export function nextEventDelay(rate, rand) {
  if (!(rate > 0)) return Infinity;
  const u = Math.max(1e-6, rand());
  return -Math.log(u) / rate;
}

/* ------------------------------------------------------------------------------------------------
 * Ses sınırlayıcı
 * ---------------------------------------------------------------------------------------------- */

/**
 * Eşzamanlı ses tavanı. admit() yeni sesin girip giremeyeceğini söyler; doluysa en düşük öncelikli
 * (eşitse en uzak, o da eşitse en eski) sesi çalmak üzere önerir.
 */
export function createVoiceLimiter({ max = 24 } = {}) {
  let voices = [];
  let limit = max;
  return {
    setMax(n) {
      limit = Math.max(1, Math.floor(n));
    },
    get max() {
      return limit;
    },
    get count() {
      return voices.length;
    },
    voices() {
      return voices;
    },
    /** Bitmiş sesleri döndürür ve listeden çıkarır. */
    sweep(now) {
      const ended = [];
      const alive = [];
      for (let i = 0; i < voices.length; i++) (voices[i].endAt <= now ? ended : alive).push(voices[i]);
      voices = alive;
      return ended;
    },
    /** candidate: { priority, dist }. → { ok, steal } (steal: kovulacak ses ya da null) */
    admit(candidate) {
      if (voices.length < limit) return { ok: true, steal: null };
      let victim = null;
      for (let i = 0; i < voices.length; i++) {
        const v = voices[i];
        if (
          !victim ||
          v.priority < victim.priority ||
          (v.priority === victim.priority && (v.dist > victim.dist || (v.dist === victim.dist && v.startedAt < victim.startedAt)))
        ) {
          victim = v;
        }
      }
      if (!victim) return { ok: false, steal: null };
      const better = candidate.priority > victim.priority || (candidate.priority === victim.priority && candidate.dist < victim.dist);
      return better ? { ok: true, steal: victim } : { ok: false, steal: null };
    },
    add(v) {
      voices.push(v);
      return v;
    },
    remove(v) {
      const i = voices.indexOf(v);
      if (i >= 0) voices.splice(i, 1);
    },
    clear() {
      const all = voices;
      voices = [];
      return all;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Tamponlar
 * ---------------------------------------------------------------------------------------------- */

/**
 * Gürültüyü yerinde doldurur. kind: 'white' | 'brown' (integre, derin). Değerler [-1, 1].
 */
export function fillNoise(data, kind = 'white', seed = 98765) {
  const rand = mulberry32(seed);
  if (kind === 'brown') {
    let b = 0;
    let peak = 1e-9;
    for (let i = 0; i < data.length; i++) {
      b = (b + 0.02 * (rand() * 2 - 1)) / 1.02;
      data[i] = b;
      const a = b < 0 ? -b : b;
      if (a > peak) peak = a;
    }
    const g = 0.95 / peak;
    for (let i = 0; i < data.length; i++) data[i] *= g;
  } else {
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  }
  return data;
}

/**
 * Yankı dürtüsü: üstel sönen, hafif düşük geçirgenli stereo gürültü. İlk ~12 ms erken yansıma yok
 * (konvolüsyonun "ön gecikmesi"), dekorelasyon için iki kanal farklı tohumlu. [L, R] döner.
 */
export function generateImpulse(sampleRate, seconds = 1.8, decay = 3.2, seed = 4242) {
  const len = Math.max(64, Math.floor(sampleRate * seconds));
  const preDelay = Math.floor(sampleRate * 0.012);
  const out = [new Float32Array(len), new Float32Array(len)];
  for (let c = 0; c < 2; c++) {
    const rand = mulberry32(seed + c * 7919);
    const d = out[c];
    let lp = 0;
    for (let i = preDelay; i < len; i++) {
      const t = (i - preDelay) / (len - preDelay);
      const env = Math.pow(1 - t, decay) * Math.exp(-3 * t);
      const w = rand() * 2 - 1;
      // Zamanla koyulaşan (yüksek frekansı sönen) kuyruk.
      const k = 0.25 + 0.7 * t;
      lp += (w - lp) * (1 - k);
      d[i] = lp * env * 1.6;
    }
  }
  return out;
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
