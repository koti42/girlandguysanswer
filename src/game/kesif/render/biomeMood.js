/*
 * KEŞİF render — biyom/mağara ATMOSFER ruh hâli (saf; three/DOM yok).
 *
 * computeSky() bölge renklerini (zoneTint) verir; bu modül ÜSTÜNE oyuncunun bulunduğu biyomun gökyüzü/sis ruh hâlini (sim/biomeData
 * BIOME_INFO[k].sky: {top,hor,fog,amt,fogK}) ve yeraltında mağara stilinin sis tonunu (CAVE_STYLES[i].fog/amt) yumuşak geçişle bindirir.
 *   const mood = createBiomeMood();   mood.update(dt, biomeKey, caveKey|'' , underground);   mood.apply(skyState)
 * Geçiş ~3 sn'lik üstel yaklaşma; gece ruh hâli rengi karartılır ve gücü azalır (gece/gün batımı paletleri korunur).
 */
import { BIOME_INFO, CAVE_STYLES } from '../sim/biomeData.js';

function rgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

const CAVE_BY_KEY = {};
CAVE_STYLES.forEach((c) => { CAVE_BY_KEY[c.key] = c; });

export function createBiomeMood() {
  const st = {
    amt: 0, fogK: 1, hasTop: 0, hasHor: 0, hasFog: 0, top: [0.4, 0.6, 0.9], hor: [0.8, 0.9, 1], fog: [0.8, 0.9, 1],
    caveAmt: 0, caveFog: [0.05, 0.06, 0.08],
  };
  const tgt = {
    amt: 0, fogK: 1, hasTop: 0, hasHor: 0, hasFog: 0, top: [0, 0, 0], hor: [0, 0, 0], fog: [0, 0, 0], caveAmt: 0, caveFog: [0.05, 0.06, 0.08],
  };
  let lastBiome = '';
  let lastCave = '';
  let lastUnder = false;

  function setTargets(biomeKey, caveKey, underground) {
    lastBiome = biomeKey;
    lastCave = caveKey;
    lastUnder = underground;
    const info = BIOME_INFO[biomeKey];
    const sky = info && info.sky && !underground ? info.sky : null;
    if (sky) {
      tgt.amt = sky.amt;
      tgt.fogK = sky.fogK || 1;
      tgt.hasTop = sky.top !== undefined ? 1 : 0;
      tgt.hasHor = sky.hor !== undefined ? 1 : 0;
      tgt.hasFog = sky.fog !== undefined ? 1 : 0;
      if (sky.top !== undefined) tgt.top = rgb(sky.top);
      if (sky.hor !== undefined) tgt.hor = rgb(sky.hor);
      if (sky.fog !== undefined) tgt.fog = rgb(sky.fog);
    } else {
      tgt.amt = 0;
      tgt.fogK = 1;
    }
    const cave = underground ? CAVE_BY_KEY[caveKey] : null;
    if (cave && cave.amt > 0) {
      tgt.caveAmt = cave.amt;
      tgt.caveFog = rgb(cave.fog);
    } else {
      tgt.caveAmt = 0;
    }
  }

  return {
    state: st,
    /** biyom/mağara/yeraltı değişince hedefleri yeniler; her karede yumuşak yaklaşır. */
    update(dt, biomeKey, caveKey, underground) {
      const bk = biomeKey || '';
      const ck = caveKey || '';
      const ug = !!underground;
      if (bk !== lastBiome || ck !== lastCave || ug !== lastUnder) setTargets(bk, ck, ug);
      const k = 1 - Math.exp(-Math.max(0, dt) * 0.55);
      st.amt += (tgt.amt - st.amt) * k;
      st.fogK += (tgt.fogK - st.fogK) * k;
      st.caveAmt += (tgt.caveAmt - st.caveAmt) * k;
      // hedef rengi yalnız anlamlı olduğunda yaklaş (amt ≈ 0 iken renk atlaması görünmez)
      const kc = tgt.amt > 0.001 || st.amt > 0.02 ? k : 1;
      for (let c = 0; c < 3; c++) {
        st.top[c] += (tgt.top[c] - st.top[c]) * kc;
        st.hor[c] += (tgt.hor[c] - st.hor[c]) * kc;
        st.fog[c] += (tgt.fog[c] - st.fog[c]) * kc;
        st.caveFog[c] += (tgt.caveFog[c] - st.caveFog[c]) * k;
      }
      st.hasTop += (tgt.hasTop - st.hasTop) * kc;
      st.hasHor += (tgt.hasHor - st.hasHor) * kc;
      st.hasFog += (tgt.hasFog - st.hasFog) * kc;
    },
    /** skyState (computeSky çıktısı) üstüne ruh hâlini uygular (yerinde). */
    apply(sky) {
      const df = sky.dayFactor === undefined ? 1 : sky.dayFactor;
      if (st.amt > 0.003) {
        const dark = 0.12 + 0.88 * df;
        const a = st.amt * (0.3 + 0.7 * df);
        const chans = [['skyTop', st.top, st.hasTop], ['skyHorizon', st.hor, st.hasHor], ['fog', st.fog, st.hasFog]];
        for (let i = 0; i < 3; i++) {
          const dst = sky[chans[i][0]];
          const src = chans[i][1];
          const kk = a * chans[i][2];
          for (let c = 0; c < 3; c++) dst[c] += (src[c] * dark - dst[c]) * kk;
        }
        sky.fogDensity *= 1 + (st.fogK - 1) * (0.4 + 0.6 * Math.min(1, st.amt / 0.4));
      }
      if (st.caveAmt > 0.003) {
        const dst = sky.fog;
        for (let c = 0; c < 3; c++) dst[c] += (st.caveFog[c] - dst[c]) * st.caveAmt;
      }
    },
  };
}
