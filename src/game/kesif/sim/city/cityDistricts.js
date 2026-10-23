/*
 * KEŞİF sim/city — BÖLGELER: güç diyagramı (power diagram) ile 6 yüzey bölgesi (+ Alt Şehir katmanı) ve robot-güvenli bölge sorgusu.
 *
 *  buildDistricts(seed) → Districts {seed, sites[], districtAt(x,z)→key, districtIdx(x,z)→0..5, centerDist(x,z)}
 *  districtAt(plan, x, z) → key        (plan = getCityPlan(seed) sonucu ya da yalnız {districts})
 *  safeAt(plan, x, z, y?) → bool       true ⇒ robot DOĞMAZ: güvenli bölge (Merkez, Gece Pazarı, Teknoloji Parkı, Tepe) VEYA terminal/meydan
 *                                      çevresi 24 blok. `y` verilirse ve y<60 (yeraltı: metro/kanalizasyon/lab) → false (robotlar yeraltında yaşar;
 *                                      yalnız terminal 24 blok çevresi hariç değildir çünkü terminaller yüzeydedir).
 *  UNDERGROUND_KEY = 'alt_sehir'       y<60 katmanının adı (districtAt'ın döndürdüğü değil; HUD için sabit)
 *
 * Güç diyagramı: p noktası, güç uzaklığı |p−s|²−w² en küçük olan bölgeye aittir (w = ağırlık yarıçapı). Sınır 24 blok fbm2 ile dalgalıdır
 * (p, tohumlu gürültüyle ≤24 blok kaydırılır). Merkez (0,0) w=300; diğer 5 çapa halka yarıçapında (380–660) ve açılarda (±12° tohumlu sapma):
 * Pazar doğu, Liman güney (kanal bandını kapsar), Teknoloji batı-güneybatı, Tepe kuzeybatı, Konteyner kuzey-kuzeydoğu.
 */
import { createNoise } from '../noise.js';
import { DISTRICT_KEYS, DISTRICTS, SAFE_DISTRICTS } from './archetypes.js';
import { TAG, shf } from './cityPlanKit.js';

export const UNDERGROUND_KEY = 'alt_sehir';
export const SAFE_TERMINAL_R = 24;
const WARP = 24;

/* açı: derece (x=cos, z=sin; z güney +); r aralığı; w ağırlık yarıçapı */
const SITE_SPEC = Object.freeze({
  gece_pazari: { ang: 12, r0: 380, r1: 480, w: 235 },
  liman: { ang: 90, r0: 610, r1: 660, w: 400 },
  teknoloji: { ang: 160, r0: 420, r1: 500, w: 240 },
  tepe: { ang: 228, r0: 540, r1: 600, w: 235 },
  konteyner: { ang: 302, r0: 430, r1: 520, w: 240 },
});

export function buildDistricts(seed) {
  const sites = [];
  sites.push({ key: 'merkez', idx: 0, x: 0, z: 0, w: 300 });
  for (let k = 1; k < DISTRICT_KEYS.length; k++) {
    const key = DISTRICT_KEYS[k];
    const sp = SITE_SPEC[key];
    const jitter = (shf(seed, k, TAG.SITE_ANG) * 2 - 1) * 12;
    const ang = ((sp.ang + jitter) * Math.PI) / 180;
    const r = sp.r0 + shf(seed, k, TAG.SITE_R) * (sp.r1 - sp.r0);
    sites.push({ key, idx: k, x: Math.round(Math.cos(ang) * r), z: Math.round(Math.sin(ang) * r), w: sp.w });
  }
  const noise = createNoise((seed ^ 0x5eed1234) | 0);
  const n = sites.length;
  const sx = new Float64Array(n);
  const sz = new Float64Array(n);
  const sw2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    sx[i] = sites[i].x;
    sz[i] = sites[i].z;
    sw2[i] = sites[i].w * sites[i].w;
  }

  function idxAt(x, z) {
    const px = x + noise.fbm2(x / 90, z / 90, 3) * WARP;
    const pz = z + noise.fbm2(x / 90 + 17.3, z / 90 - 9.1, 3) * WARP;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = px - sx[i];
      const dz = pz - sz[i];
      const d = dx * dx + dz * dz - sw2[i];
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  return {
    seed,
    sites,
    districtIdx: idxAt,
    districtAt(x, z) {
      return DISTRICT_KEYS[idxAt(x, z)];
    },
    /** Merkez'e yatay uzaklık (kule yükseklik çarpanı). */
    centerDist(x, z) {
      return Math.sqrt(x * x + z * z);
    },
  };
}

/** plan ya da {districts} → bölge anahtarı. */
export function districtAt(plan, x, z) {
  return plan.districts.districtAt(x, z);
}

const SAFE_SET = Object.freeze(SAFE_DISTRICTS.reduce((m, k) => { m[k] = true; return m; }, {}));

/**
 * true ⇒ robot doğmaz. Yüzeyde: güvenli bölge VEYA herhangi bir terminale ≤24 blok (yatay). Yeraltında (y<60): robot bölgesi (false).
 * plan.terminals yoksa yalnız bölge kuralı uygulanır.
 */
export function safeAt(plan, x, z, y) {
  if (y !== undefined && y !== null && y < 60) return false;
  const ts = plan.terminals;
  if (ts) {
    const r2 = SAFE_TERMINAL_R * SAFE_TERMINAL_R;
    for (let i = 0; i < ts.length; i++) {
      const dx = x - ts[i].x;
      const dz = z - ts[i].z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    // Kapı Meydanı çevresi (merkez meydanı r=90 içinde robot yok)
    if (x * x + z * z <= 90 * 90) return true;
  }
  return SAFE_SET[plan.districts.districtAt(x, z)] === true;
}

/** Bölge adı (HUD) — Türkçe. */
export function districtName(key) {
  if (key === UNDERGROUND_KEY) return 'Alt Şehir';
  const d = DISTRICTS[key];
  return d ? d.name : '';
}
