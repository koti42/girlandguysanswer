/*
 * KEŞİF — HUD temel alanları ve yayın (≤ 15 Hz, önemli değişimde anında).
 *
 *   createGameHud(G, player) → { store, publish(immediate?), fill(dt, info), flush(), dispose() }
 *   timeLabel(phase) → 'gündüz 12:30'          (saf)
 *
 * Çekirdek şu alanları doldurur: hp/maxHp/hunger/oxygen, xpLevel, hotbar/selected/held, coords, zone, biome, time, weather, fps,
 * flying, sprinting, underwater, cameraMode, mode, ui, abilities. Sistemler target, quest, boss, banner, parkour, hint yazar.
 * Yayın: hudStore.set (sanitize) + callbacks.onHud(temiz HUD) — içerik değişmediyse çağrılmaz.
 */
import { createHudStore, createHudPublisher } from './hudStore.js';
import { formatClockTime, phaseNameAt } from './sim/daynight.js';
import { xpLevel } from './sim/progressionData.js';
import { ITEMS } from './sim/items.js';
import { DEPTH_BANDS, depthBandAt, relativeToSea } from './sim/constants.js';

/** Derinlik bandı başlığı alt metni (bant geçişinde ZoneBanner'da). */
const DEPTH_SUB = {
  yuzey: 'Güneş ışığına döndün',
  magaralar: 'Karanlık geçitler ve mağaralar — yanına meşale al',
  derin: 'Büyük salonlar ve yeraltı gölleri',
  ham: 'Ham kayalık, uçurumlar ve lav gölleri',
  dip: 'Dünyanın dibi — daha aşağısı kırılamaz ana kaya',
};
/** Bant sınırında titreşmeyi önleyen histerezis (blok). */
const BAND_HYS = 5;

/** y için histerezisli bant: mevcut banttan ancak sınırı BAND_HYS kadar aşınca çıkılır. */
export function depthBandWithHysteresis(y, prevKey) {
  const cur = depthBandAt(y);
  if (!prevKey || cur.key === prevKey) return cur;
  const prev = DEPTH_BANDS.find((b) => b.key === prevKey);
  if (!prev) return cur;
  const i = DEPTH_BANDS.indexOf(prev);
  const top = i > 0 ? DEPTH_BANDS[i - 1].minY : Infinity; // bandın üst sınırı
  if (y >= prev.minY - BAND_HYS && y < top + BAND_HYS) return prev;
  return cur;
}

const BASE_LABEL = { düz: 'Düz Arazi', ada: 'Ada', boş: 'Boşluk', çayır: 'Çayır' };

export function timeLabel(phase) {
  return phaseNameAt(phase) + ' ' + formatClockTime(phase);
}

export function createGameHud(G, player) {
  const store = createHudStore();
  const hud = G.hud;
  let disposed = false;
  let hotbarDirty = true;
  let acc = 1;
  let lastHeld = null;
  let lastMinuteKey = '';
  let depthKey = '';

  const publisher = createHudPublisher((h) => {
    if (disposed) return;
    const changed = store.set(h);
    if (changed && typeof G.callbacks.onHud === 'function') {
      try {
        G.callbacks.onHud(store.get());
      } catch (e) {
        if (G.opts.strictSystems) throw e;
      }
    }
  }, { hz: 15 });

  function markDirty(name) {
    if (name === 'hotbar' || name === 'all' || name === undefined) hotbarDirty = true;
  }

  function heldName(key) {
    if (!key) return null;
    const it = ITEMS[key];
    return it && it.name ? it.name : key;
  }

  /** Her karede çağrılır; ucuz alan kopyaları. info: {env, fps, phase, camMode, underwater}. */
  function fill(dt, info) {
    const sv = G.survival;
    const b = G.body;
    hud.hp = sv.hp;
    hud.maxHp = sv.maxHp;
    hud.hunger = sv.hunger;
    hud.oxygen = sv.oxygen;
    hud.mode = G.mode;
    hud.cameraMode = G.player.cameraMode;
    hud.ui = G.ui;
    hud.coords.x = b.x;
    hud.coords.y = b.y;
    hud.coords.z = b.z;
    if (G.mode === 'macera') {
      // derin dünya: deniz seviyesine göre yükseklik/derinlik + bant başlığı (bant geçişinde ZoneBanner + sesli okuma)
      const band = depthBandWithHysteresis(b.y, depthKey);
      hud.depth.rel = relativeToSea(b.y);
      hud.depth.band = band.name;
      hud.depth.key = band.key;
      if (band.key !== depthKey) {
        const first = depthKey === '';
        depthKey = band.key;
        if (!first && !G.player.dead) {
          const sub = DEPTH_SUB[band.key] || '';
          if (typeof G.banner === 'function') G.banner(band.name, sub, { key: 'depth', kind: 'info', duration: 3200, priority: 4 });
          if (typeof G.speak === 'function') G.speak(band.name + '. ' + sub);
        }
      }
      hud.zone.id = info.env.zone;
      hud.zone.name = info.env.zoneName;
      // yeraltında mağara stili (Çiçekli Mağara, Buzul Mağarası…) biyom yerine gösterilir
      hud.biome = info.env.underground && info.env.caveKey && info.env.caveKey !== 'normal' && info.env.caveName ? info.env.caveName : info.env.biomeName;
    } else {
      hud.zone.id = 0;
      hud.zone.name = G.mode === 'insa' ? 'İnşa Alanı' : ((G.mapMeta && G.mapMeta.title) || 'Topluluk Haritası');
      hud.biome = (G.mapMeta && BASE_LABEL[G.mapMeta.base]) || '';
    }
    hud.fps = info.fps;
    hud.flying = b.flying;
    hud.sprinting = b.sprinting && b.speed > 2;
    hud.underwater = info.underwater;
    hud.weather = info.weatherLabel;
    const ab = G.abilities;
    hud.abilities.doubleJump = ab.doubleJump;
    hud.abilities.grapple = ab.grapple;
    hud.abilities.glide = ab.glide;
    hud.abilities.portalGun = ab.portalGun;
    acc += dt;
    if (acc >= 0.5) {
      acc = 0;
      const key = phaseKeyOf(info.phase);
      if (key !== lastMinuteKey) {
        lastMinuteKey = key;
        hud.time = timeLabel(info.phase);
      }
      if (G.progression) hud.xpLevel = xpLevel(G.progression.stats ? G.progression.stats.xp : 0);
    }
    const inv = G.inventory;
    if (inv) {
      hud.selected = inv.selected;
      const held = inv.heldItem();
      if (held !== lastHeld) {
        lastHeld = held;
        hotbarDirty = true;
      }
      hud.held = heldName(held);
    }
    if (hotbarDirty) {
      hotbarDirty = false;
      player.hotbarFill(hud.hotbar);
    }
  }

  function phaseKeyOf(phase) {
    // dakika çözünürlüğünde (24 saat = 1200 sn → 1 oyun dakikası ≈ 0,83 sn)
    return String(Math.floor(phase * 1440));
  }

  return {
    store,
    markDirty,
    publish(immediate) {
      if (disposed) return;
      publisher.push(hud, { immediate: !!immediate });
    },
    fill,
    flush() {
      publisher.flush();
    },
    dispose() {
      disposed = true;
      publisher.cancel();
    },
  };
}
