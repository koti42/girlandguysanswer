/*
 * KEŞİF — "tech" sistemi (order 28): enerji ağı + makineler, taşınan cihazlar (jetpack, tarayıcı, elektrikli alet, enerji kalkanı),
 * açık dünya portal tabancası, makine paneli, HUD, efektler. Saf sim: sim/tech*.js (KESIF_TECH.md); burası oyun katmanı.
 * gameSystems.js bu dosyayı otomatik yükler (createSystem → [tech.pre, tech]).
 *
 *   tech.pre (order −110) : fizik adımından ÖNCE gövde hızını saklar (portal girişinde çarpışma hızı sıfırlamadan önceki hız)
 *   fixedUpdate (60 Hz)   : TechState.tick (20 Hz, ağ/makine ilerlemesi sim içinde 1 Hz) → jetpack yakıtı → tarayıcı → portal geçişi →
 *                           asansör animasyonu → panel denetimi
 *   frameUpdate           : HUD (≈10 Hz), görseller (portal çerçeveleri, makine efektleri, tarama işaretleri)
 *   onEvent               : blockUse (makineler), uiChanged, shieldAbsorb, inventoryChanged, blockPlaced/itemCrafted (ipuçları)
 *   api()                 : getMachineInfo getMachineUi setMachineConfig machineAction getTechHud refuelJetpack scan shootPortal getPortals getTechInfo
 *   serialize             : {v, t: TechState.serialize(), seen:[ipucu anahtarları]}   (oturum kaydı systems.tech)
 *
 * G'ye eklenenler: G.tech (TechState), G.techUi {pos,type}, G.techUse(itemKey) (blocksUse.applyHeldItem), G.techUseSlot(index) (envanter "Kullan"),
 *   G.techPortalShoot(color, hit) (mobs.combat: bulmaca işlemediyse). Mod kuralı: yalnız macera (insa/harita: tüm davranışlar kapalı, HUD boş).
 */
import { B } from '../sim/blocks.js';
import { createTech } from '../sim/tech.js';
import { createShieldHook } from '../sim/techMods.js';
import { createTickCtx } from './techCtx.js';
import { blockChangeHook, reactToTechEvent } from './techEffects.js';
import { createGear } from './techGear.js';
import { createPortalGun } from './techPortalGun.js';
import { createTechApi } from './techApi.js';
import { writeTechHud, headingTick } from './techHudData.js';
import {
  onBlockUse, panelGuard, stepLift,
} from './techUse.js';
import { createTechVisuals } from '../render/techVisuals.js';

const TICK_EVERY = 0.05;
const HUD_EVERY = 0.1;
const PANEL_EVERY = 0.4;
const SEEN_MAX = 40;

const API_NAMES = [
  'getMachineInfo', 'getMachineUi', 'setMachineConfig', 'machineAction', 'getTechHud', 'refuelJetpack', 'scan', 'shootPortal',
  'getPortals', 'getTechInfo',
];
const API_DEFAULTS = {
  getMachineInfo: null,
  getMachineUi: null,
  setMachineConfig: { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' },
  machineAction: { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' },
  getTechHud: null,
  refuelJetpack: { ok: false, reason: 'yok' },
  scan: { ok: false, reason: 'yok' },
  shootPortal: false,
  getPortals: { mavi: null, turuncu: null },
  getTechInfo: null,
};

/** Yerleştirme / üretim ipuçları (bir kez gösterilir, kayda yazılır). */
const PLACE_HINTS = {
  [B.TECH_LAB]: ['lab', 'Laboratuvara sağ tıkla: Teknoloji tarifleri (kablo, makineler, jetpack, Portal Tabancası) açılır.'],
  [B.TECH_GENERATOR]: ['gen', 'Jeneratöre sağ tıkla ve kömür ya da odun koy. Yan yana dizilen enerji blokları ya da kablolar birleşir.'],
  [B.TECH_SOLAR]: ['solar', 'Güneş paneli gündüz enerji verir; üstü açık olmalı. Kablo ya da yan yana dizerek bağla.'],
  [B.TECH_DRILL]: ['drill', 'Madenciye enerji bağla: altındaki sütunu kazar. Yanına sandık koyarsan eşyaları oraya boşaltır.'],
  [B.TECH_TELEPORTER]: ['tp', 'İki ışınlanma platformunu aynı frekansa ayarla (çömelip sağ tık), enerji ver; üstüne çıkıp sağ tıkla.'],
  [B.TECH_LIFT]: ['lift', 'Asansör: platformun üstüne çık, sağ tıkla (yukarı). Çömelip sağ tıkla (aşağı).'],
  [B.TECH_BUTTON]: ['btn', 'Düğme akımı açıp kapatır: kablo hattının arasına koy. Çömelip sağ tıkla: darbe modu.'],
};
const CRAFT_HINTS = {
  'item:portal_tabancası': ['pgun', 'Portal Tabancası: sol tık mavi, sağ tık turuncu portal açar. İki portala da gir. Şarjı Enerji Hücresiyle dolar.'],
  'item:jetpack': ['jetpack', 'Jetpack: çubuğa koy, havada zıplama düğmesini basılı tut. Sağ tık: Enerji Hücresiyle yakıt doldur.'],
  'item:tarayıcı': ['scanner', 'Tarayıcıyı çubukta taşı: cevher, yapı ve canlıları işaretler. Sağ tık: hemen tara.'],
  'blok:teknoloji_laboratuvarı': ['labcraft', 'Laboratuvarı yere koy; yanındayken Üret menüsünde Teknoloji tarifleri açılır.'],
};

export function createSystem(G) {
  const T = {
    G,
    tech: null,
    ctx: null,
    tickAcc: 0,
    sayT: Object.create(null),
    jet: {
      acc: 0, accT: 0, soundT: 0, flameT: 0, thrusting: false, wasThrusting: false, has: false,
    },
    nz: [],
    pre: { vx: 0, vy: 0, vz: 0 },
    lift: null,
    hudT: 0,
    hudDirty: true,
    panelT: 0,
    scanFlash: -100,
    hintSeen: new Set(),
    visuals: null,
    api: null,
  };
  let gear = null;
  let pg = null;
  let unsub = null;
  const macera = () => G.mode === 'macera';

  function seenHint(key, text) {
    if (T.hintSeen.has(key) || T.hintSeen.size >= SEEN_MAX) return;
    T.hintSeen.add(key);
    if (typeof G.hint === 'function') G.hint(text, { ttl: 7000, priority: 3, key: 'tech:' + key, cooldown: 600000 });
    else if (G.hud) G.hud.hint = text;
  }

  const preSys = {
    name: 'tech.pre',
    order: -110,
    fixedUpdate() {
      const b = G.body;
      if (!b) return;
      T.pre.vx = b.vx; T.pre.vy = b.vy; T.pre.vz = b.vz;
    },
  };

  const sys = {
    name: 'tech',
    order: 28,

    init() {
      G.tech = T.tech = createTech(G.seed);
      G.techUi = { pos: null, type: null };
      T.ctx = createTickCtx(G);
      gear = createGear(T);
      pg = createPortalGun(T);
      T.api = createTechApi(T, gear, pg);
      G.techUse = (key) => gear.useHeld(key);
      G.techUseSlot = (i) => gear.useSlot(i);
      G.techPortalShoot = (color, hit) => pg.shoot(color, hit);
      if (macera()) {
        if (G.survival) G.survival.shieldHook = createShieldHook(G.inventory);
        if (G.world && typeof G.world.on === 'function') unsub = G.world.on('blockChange', (e) => blockChangeHook(T, e));
        if (G.scene && G.THREE) {
          try {
            T.visuals = createTechVisuals(G, T);
            G.techVisuals = T.visuals; // hata ayıklama / test
          } catch (err) {
            T.visuals = null;
            if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] tech görselleri kurulamadı:', err);
          }
        }
      }
    },

    /** Boyut değişmeden önce: asansör/jetpack animasyonu eski dünyada kesilir. */
    beforeDimension() {
      T.lift = null;
      if (gear) gear.flushJet(false);
    },

    /** Boyut değişti: TechState (G.tech = yeni ctx.tech), world 'blockChange' aboneliği, görseller (portal/makine/tarama) yeni dünya için. */
    onDimension() {
      if (!T.tech) return;
      T.tech = G.tech;
      T.lift = null;
      T.tickAcc = 0;
      if (T.ctx) T.ctx.refresh();
      if (typeof unsub === 'function') unsub();
      unsub = null;
      if (macera() && G.world && typeof G.world.on === 'function') unsub = G.world.on('blockChange', (e) => blockChangeHook(T, e));
      if (T.visuals) {
        T.visuals.dispose();
        T.visuals = null;
        if (macera() && G.scene && G.THREE) {
          try {
            T.visuals = createTechVisuals(G, T);
            G.techVisuals = T.visuals;
          } catch (err) {
            T.visuals = null;
            if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] tech görselleri kurulamadı:', err);
          }
        }
      }
      if (G.techUi) {
        G.techUi.pos = null;
        G.techUi.type = null;
      }
      T.hudDirty = true;
    },

    fixedUpdate(_G, dt) {
      if (!macera() || !G.worldReady || !T.tech) return;
      T.tickAcc += dt;
      if (T.tickAcc >= TICK_EVERY) {
        const step = T.tickAcc;
        T.tickAcc = 0;
        T.ctx.refresh();
        const events = T.tech.tick(step, T.ctx);
        if (events.length > 0) {
          const list = events.slice();
          for (let i = 0; i < list.length; i++) {
            reactToTechEvent(T, list[i]);
            G.emit(list[i]);
          }
        }
      }
      gear.stepJetpack(dt);
      if (!G.player.dead) {
        gear.stepScanner(dt);
        pg.step(dt);
        stepLift(T, dt);
      } else T.lift = null;
      T.panelT -= dt;
      if (T.panelT <= 0) {
        T.panelT = PANEL_EVERY;
        panelGuard(T);
      }
    },

    frameUpdate(_G, dt) {
      if (!macera()) {
        if (T.hudDirty) {
          T.hudDirty = false;
          writeTechHud(T);
        }
        return;
      }
      T.hudT += dt;
      if (T.hudDirty || T.hudT >= HUD_EVERY) {
        T.hudT = 0;
        T.hudDirty = false;
        writeTechHud(T);
      } else headingTick(T);
      if (T.visuals) T.visuals.update(dt);
    },

    onEvent(_G, e) {
      switch (e.type) {
        case 'blockUse':
          if (T.tech && e.handled !== true) onBlockUse(T, e);
          break;
        case 'uiChanged':
          if (e.ui !== 'machine' && G.techUi) {
            G.techUi.pos = null;
            G.techUi.type = null;
          }
          T.hudDirty = true;
          break;
        case 'shieldAbsorb':
          if (gear) gear.onShield(e);
          break;
        case 'inventoryChanged':
          T.hudDirty = true;
          break;
        case 'died':
          T.lift = null;
          if (gear) gear.flushJet(false);
          break;
        case 'blockPlaced': {
          const h = PLACE_HINTS[e.id];
          if (h && macera()) seenHint(h[0], h[1]);
          break;
        }
        case 'itemCrafted': {
          const h = CRAFT_HINTS[e.item];
          if (h && macera()) seenHint(h[0], h[1]);
          break;
        }
        default:
          break;
      }
    },

    onAction(_G, a) {
      if (a && a.type === 'portalMode' && pg && G.ui === 'none' && !G.player.dead) pg.toggleMode();
    },

    api() {
      // api(), init'ten önce de çağrılabilir: yöntemler çağrı anında T.api'ye yönlenir
      const out = {};
      API_NAMES.forEach((n) => {
        out[n] = (...args) => (T.api ? T.api[n](...args) : API_DEFAULTS[n]);
      });
      return out;
    },

    serialize() {
      if (!T.tech || !macera()) return null;
      return { v: 1, t: T.tech.serialize(), seen: Array.from(T.hintSeen) };
    },

    restore(_G, data) {
      if (!data || typeof data !== 'object' || !T.tech) return;
      const w = G.world;
      T.tech.restore(data.t, {
        minY: w && Number.isFinite(w.yMin) ? w.yMin : -1000,
        maxY: w && Number.isFinite(w.yMax) ? w.yMax : 1000,
      });
      T.hintSeen.clear();
      if (Array.isArray(data.seen)) {
        for (let i = 0; i < data.seen.length && i < SEEN_MAX; i++) if (typeof data.seen[i] === 'string' && data.seen[i].length < 24) T.hintSeen.add(data.seen[i]);
      }
      T.hudDirty = true;
    },

    dispose() {
      if (typeof unsub === 'function') unsub();
      unsub = null;
      if (T.visuals) T.visuals.dispose();
      T.visuals = null;
      G.techUse = null;
      G.techUseSlot = null;
      G.techPortalShoot = null;
      G.dimPortalFire = null;
    },
  };
  T.sys = sys;
  return [preSys, sys];
}
