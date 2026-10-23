/*
 * KEŞİF — "cityHud" sistemi (order 38, sözleşme §12/§20): Neon Meridyen arayüz alanlarını doldurur.
 *
 *   hud.dim                 'neon' | 'overworld'
 *   hud.district            görünen bölge adı ('Gece Pazarı'); şehir dışında ''
 *   hud.zone / hud.biome    şehirde bölge adı / 'Neon Meridyen' (ana diyar bölge-biyom adları şehirde anlamsızdır; çekirdek hud.fill'den SONRA yazılır)
 *   hud.weather             şehirde 'yağmur' | 'fırtına' | 'duman' | ''
 *   hud.city                {kredi, district(anahtar), mission:null, radio:'', light} — şehir dışında null
 *   hud.city.light          en yakın ışık ipucu (şimdilik Boyut Terminali, ≤ 40 blok): şekil + metin çipi
 *
 * Bölge girişinde G.banner (öncelik 2, tür 'zone') + G.speak. Geçiş sürerken (G.transitionActive) ve ilk karede duyuru YOK; geçiş bitince bir kez verilir.
 * Hiçbir sistem G.world'ü önbelleğe almaz (her karede G.world okunur); onDimension durumu sıfırlar.
 */
import { districtAt, getCityPlan } from '../sim/city/cityPlan.js';
import {
  DISTRICT_TAGLINES, cityWeatherLabel, districtBannerSpec, districtDisplay, nearestLightHint,
} from '../sim/city/cityHudData.js';

export const CITY_HUD_ORDER = 38;
const DISTRICT_EVERY = 0.2;
const LIGHT_EVERY = 0.25;

export function createSystem(G) {
  const st = {
    key: '', pending: '', acc: DISTRICT_EVERY, lightAcc: LIGHT_EVERY, banners: 0,
  };
  const city = {
    kredi: 0, district: '', mission: null, radio: '', light: null,
  };
  const lightBuf = { kind: 'terminal', dist: 0, text: '' };

  function reset() {
    st.key = '';
    st.pending = '';
    st.acc = DISTRICT_EVERY;
    st.lightAcc = LIGHT_EVERY;
    city.district = '';
    city.light = null;
  }

  function leaveCity(hud) {
    if (hud.district !== '') hud.district = '';
    if (hud.city) hud.city = null;
    if (hud.dim !== 'overworld') hud.dim = 'overworld';
    if (st.key !== '') reset();
  }

  function kredi() {
    const m = G.dimMgr;
    const c = m && typeof m.get === 'function' ? m.get('neon') : null;
    const k = c && c.city ? c.city.kredi : 0;
    return Number.isFinite(k) && k > 0 ? Math.floor(k) : 0;
  }

  function announce(key) {
    const spec = districtBannerSpec(key);
    if (!spec) return;
    st.banners++;
    if (typeof G.banner === 'function') G.banner(spec.text, spec.sub, spec.opts);
    if (typeof G.speak === 'function') G.speak(spec.text + (spec.sub ? '. ' + spec.sub : ''));
  }

  return {
    name: 'cityHud',
    order: CITY_HUD_ORDER,
    state: st,

    frameUpdate(_G, dt) {
      const hud = G.hud;
      if (!hud) return;
      if (G.dim !== 'neon' || !G.world) {
        leaveCity(hud);
        return;
      }
      hud.dim = 'neon';
      const b = G.body;
      const seed = G.world.seed;
      st.acc += dt;
      if (st.acc >= DISTRICT_EVERY || st.key === '') {
        st.acc = 0;
        let key = '';
        try {
          key = districtAt(seed, b.x, b.z, b.y);
        } catch {
          key = '';
        }
        if (key && key !== st.key) {
          // geçiş sürerken kutuyu açma: yeni boyutta ilk duyuru geçiş bitince bir kez verilir
          if (!G.transitionActive && !G.simFrozen) {
            st.key = key;
            announce(key);
          }
        }
      }
      const key = st.key;
      const name = districtDisplay(key);
      hud.district = name;
      if (name) {
        hud.zone.id = 0;
        hud.zone.name = name;
        hud.biome = 'Neon Meridyen';
      }
      hud.weather = cityWeatherLabel(hud.weather, G.weatherSim ? G.weatherSim.smog : 0);

      st.lightAcc += dt;
      if (st.lightAcc >= LIGHT_EVERY) {
        st.lightAcc = 0;
        let plan = null;
        try {
          plan = getCityPlan(seed);
        } catch {
          plan = null;
        }
        city.light = nearestLightHint(plan, b.x, b.y, b.z, lightBuf);
      }
      city.kredi = kredi();
      city.district = key;
      hud.city = city;
    },

    onDimension() {
      reset();
      const hud = G.hud;
      if (hud && G.dim !== 'neon') leaveCity(hud);
    },

    api() {
      return {
        /** Hata ayıklama / QA: {dim, district, banners}. */
        getCityHudInfo() {
          return { dim: G.dim, district: st.key, banners: st.banners, tagline: DISTRICT_TAGLINES[st.key] || '' };
        },
      };
    },

    dispose() {
      reset();
    },
  };
}

export default createSystem;
