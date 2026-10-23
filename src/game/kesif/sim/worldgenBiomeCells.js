/*
 * KEŞİF sim — biyom HÜCRELERİ (saf, belirlenimci; worldgenTerrain.sampleColumn kullanır).
 *
 * Kara biyomu "ağırlıklı Voronoi" hücrelerinden gelir: ~210 blokluk, atılmış (jitter) ve alan-bükülmüş (domain warp) hücreler;
 * her hücre kendi merkezinin bölge karışımından (ZONES[].biomes, bölge sınırında ±POOL_BLEND blokta harmanlanır) AĞIRLIKLI
 * RASTGELE bir biyom alır. Böylece:
 *   • yama genişliği 120–400 blok (hücre başına ağırlık çarpanı 0.7–1.4 ile değişken boyut), kenarlar bükülmüş/doğal;
 *   • bölge teması korunur (Z0 çayır/orman/çiçek/kiraz…, Z3 taiga/buzul/tundra… ) ve sınırda iki bölgenin biyomları iç içe geçer;
 *   • her biyomun payı bölge ağırlıklarını izler (test: istatistik).
 * Dağ (yükseklik), plaj/mercan (kıyı) ve sulak alan "kuru" takma adı (yüksek arazide bataklık → orman) sütun düzeyinde
 * worldgenTerrain'de uygulanır; burası yalnız hücre biyomunu + hücrenin iklim sıcaklığını verir.
 */
import {
  BIOME_KEYS, ZONES, ZONE_COUNT,
} from './constants.js';
import { hash2 } from './rng.js';

const ID = {};
BIOME_KEYS.forEach((k, i) => { ID[k] = i; });

export const CELL_SIZE = 150;
const JITTER = 0.9;
const WARP_AMP = 34;
const WARP_F = 0.0055;
export const POOL_BLEND = 45;
const HOME_SCALE = 0.62;
/** Başlangıç noktasını (0,0) içeren hücre her tohumda çayırdır: dünya yumuşak başlar. */

/** Hücre havuzuna girmeyen (yükseklik/kıyı kuralıyla gelen) biyomlar. */
const TERRAIN_ONLY = new Set([ID.dag, ID.plaj, ID.mercan]);

/** Her biyomun hücre sıcaklığı (-1.2 buzul … 1 volkanik): kar çizgisi, donma, kıyı türü (plaj/mercan) bundan türer. */
export const BIOME_TEMP = Object.freeze({
  cayir: 0.15, orman: 0.2, karacam: -0.4, col: 0.85, tundra: -0.85, dag: -0.1, bataklik: 0.35, plaj: 0.15, kristal: 0,
  sonbahar: -0.05, kiraz: 0.3, yagmurorman: 0.85, mangrov: 0.65, savan: 0.9, taiga: -0.65, buzul: -1.15, mantar: 0.1, bambu: 0.55,
  volkanik: 0.9, mercan: 0.8, cicek: 0.3, golge: -0.1,
});
const TEMP_BY_ID = BIOME_KEYS.map((k) => (BIOME_TEMP[k] === undefined ? 0 : BIOME_TEMP[k]));

/** Yüksek arazide sulak biyomun "kuru" karşılığı (bataklık/mangrov yalnız alçak, ıslak arazide kalır). */
export const DRY_ALIAS = Object.freeze((() => {
  const a = [];
  for (let i = 0; i < BIOME_KEYS.length; i++) a[i] = i;
  a[ID.bataklik] = ID.orman;
  a[ID.mangrov] = ID.yagmurorman;
  return a;
})());

/** Bölge başına havuz: [biyom kimlikleri], [ağırlıklar] (kara-yalnız biyomlar çıkarılmış, toplam 1'e normalize). */
const POOLS = ZONES.map((z) => {
  const ids = [];
  const ws = [];
  let sum = 0;
  BIOME_KEYS.forEach((k, i) => {
    const w = z.biomes[k] || 0;
    if (w > 0 && !TERRAIN_ONLY.has(i)) {
      ids.push(i);
      ws.push(w);
      sum += w;
    }
  });
  for (let i = 0; i < ws.length; i++) ws[i] /= sum;
  return { ids, ws };
});
// tüm bölge havuzlarının birleşik biyom listesi (harmanlama için ortak indeks uzayı)
const ALL_IDS = [];
POOLS.forEach((p) => p.ids.forEach((i) => { if (ALL_IDS.indexOf(i) < 0) ALL_IDS.push(i); }));
ALL_IDS.sort((a, b) => a - b);
const POOL_W = POOLS.map((p) => ALL_IDS.map((id) => {
  const k = p.ids.indexOf(id);
  return k < 0 ? 0 : p.ws[k];
}));

const smooth01 = (e0, e1, x) => {
  const t = (x - e0) / (e1 - e0);
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
};

/** Hücre merkezinin yarıçapına göre harmanlanmış havuz ağırlığı (kısmi bölge indeksi). */
function pickFromPool(rc, u) {
  let zi = 0;
  while (zi < ZONE_COUNT - 1 && rc >= ZONES[zi].rOut) zi++;
  // en yakın bölge sınırı: dışına doğru (zi+1) ya da içine doğru (zi-1) harman
  let other = -1;
  let f = 0;
  if (zi < ZONE_COUNT - 1) {
    const b = ZONES[zi].rOut;
    if (rc > b - POOL_BLEND) {
      other = zi + 1;
      f = smooth01(b - POOL_BLEND, b + POOL_BLEND, rc);
    }
  }
  if (other < 0 && zi > 0) {
    const b = ZONES[zi - 1].rOut;
    if (rc < b + POOL_BLEND) {
      other = zi - 1;
      f = 1 - smooth01(b - POOL_BLEND, b + POOL_BLEND, rc);
    }
  }
  const wa = POOL_W[zi];
  const wb = other >= 0 ? POOL_W[other] : wa;
  // 'f' = other bölgenin payı (zi tarafındayız → zi payı 1-f)
  let total = 0;
  for (let i = 0; i < ALL_IDS.length; i++) total += wa[i] * (1 - f) + wb[i] * f;
  let acc = 0;
  const target = u * total;
  for (let i = 0; i < ALL_IDS.length; i++) {
    acc += wa[i] * (1 - f) + wb[i] * f;
    if (target < acc) return ALL_IDS[i];
  }
  return ALL_IDS[ALL_IDS.length - 1];
}

function siteOf(g, ci, cj, out) {
  const h = hash2(ci, cj, g.seed ^ 0xce11b10);
  out.sx = (ci + 0.5 + (((h & 1023) / 1024) - 0.5) * JITTER) * CELL_SIZE;
  out.sz = (cj + 0.5 + ((((h >>> 10) & 1023) / 1024) - 0.5) * JITTER) * CELL_SIZE;
  out.w = 0.7 + (((h >>> 20) & 255) / 255) * 0.7;
  return out;
}

/**
 * Başlangıç hücreleri: (0,0)'a ağırlıklı en yakın hücre ÇAYIR (home); sonraki üç yakın hücre sırayla çiçek çayırı / kiraz / orman
 * (tohuma göre karışık sırayla) → Başlangıç Vadisi her tohumda 4 farklı yumuşak biyom görür. Hücre biyomu atamasından bağımsızdır.
 */
function starterOf(g) {
  if (g.bstarter) return g.bstarter;
  const C = g.c;
  const wx = C.simplex2(1500, -800) * WARP_AMP;
  const wz = C.simplex2(-2200, 400) * WARP_AMP;
  const ci = Math.floor(wx / CELL_SIZE);
  const cj = Math.floor(wz / CELL_SIZE);
  const s = { sx: 0, sz: 0, w: 1 };
  const list = [];
  for (let dj = -2; dj <= 2; dj++) {
    for (let di = -2; di <= 2; di++) {
      siteOf(g, ci + di, cj + dj, s);
      const dx = wx - s.sx;
      const dz = wz - s.sz;
      list.push({ key: (ci + di + 2048) * 4096 + (cj + dj + 2048), d: (dx * dx + dz * dz) / (s.w * s.w), w: s.w });
    }
  }
  list.sort((p, q) => p.d - q.d);
  const order = [ID.cicek, ID.kiraz, ID.orman];
  const sh = hash2(7, 11, g.seed ^ 0x57a47);
  for (let i = order.length - 1; i > 0; i--) {
    const j = ((sh >>> (i * 5)) & 31) % (i + 1);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const map = new Map();
  map.set(list[0].key, ID.cayir);
  for (let i = 0; i < 3; i++) map.set(list[i + 1].key, order[i]);
  // başlangıç hücresi küçültülür (Vadi birkaç biyom görsün) — yalnız (0,0) yine ona ait kalıyorsa
  g.bhomeScale = list[1].d > list[0].d / (HOME_SCALE * HOME_SCALE) ? HOME_SCALE : 1;
  g.bhome = list[0].key;
  g.bstarter = map;
  return map;
}

/** (cx,cz) hücresi: {sx,sz,w,biome} (seed başına önbellekli). */
function cellOf(g, ci, cj) {
  if (!g.bcells) g.bcells = new Map();
  const key = (ci + 2048) * 4096 + (cj + 2048);
  let c = g.bcells.get(key);
  if (c) return c;
  const s = siteOf(g, ci, cj, { sx: 0, sz: 0, w: 1 });
  const sx = s.sx;
  const sz = s.sz;
  let w = s.w;
  const rc = Math.sqrt(sx * sx + sz * sz);
  let biome;
  const starter = starterOf(g).get(key);
  if (starter !== undefined) {
    if (key === g.bhome) w *= g.bhomeScale;
    biome = starter;
  } else {
    const u = (hash2(ci, cj, g.seed ^ 0x5eed11) >>> 0) / 4294967296;
    biome = pickFromPool(rc, u);
  }
  c = { sx, sz, w, biome, temp: TEMP_BY_ID[biome] };
  if (g.bcells.size > 4000) g.bcells.clear();
  g.bcells.set(key, c);
  return c;
}

/** (x,z) → hücre kaydı (ortak nesne; yalnız okuma). Alan bükmesi + ağırlıklı en yakın merkez. */
export function biomeCellAt(g, x, z) {
  const C = g.c;
  const wx = x + C.simplex2(x * WARP_F + 1500, z * WARP_F - 800) * WARP_AMP;
  const wz = z + C.simplex2(x * WARP_F - 2200, z * WARP_F + 400) * WARP_AMP;
  const ci = Math.floor(wx / CELL_SIZE);
  const cj = Math.floor(wz / CELL_SIZE);
  let best = 1e30;
  let bc = null;
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const c = cellOf(g, ci + di, cj + dj);
      const dx = wx - c.sx;
      const dz = wz - c.sz;
      const d = (dx * dx + dz * dz) / (c.w * c.w);
      if (d < best) {
        best = d;
        bc = c;
      }
    }
  }
  return bc;
}
