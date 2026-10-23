/*
 * KEŞİF — "dimension" sistemi (order −120): boyut yöneticisi + geçiş makinesi + boyut kapısı + Boyut Terminali + şehir ölümü kuralları.
 * Sözleşme KESIF_CITY_CONTRACT §5, §14, §15, §20. gameSystems.js otomatik yükler (createSystem).
 *
 *   • `onDimension(G, from, to)` ZORUNLU kancadır: boyut yöneticisi (gameDimension.swap) her sisteme çağırır (ayrıca swap öncesi isteğe bağlı
 *     `beforeDimension(G, from, to)`); hiçbir sistem G.world'ü çağrı ötesinde önbelleğe alamaz, world.on abonelikleri yeniden bağlanır.
 *   • alwaysRun: geçiş sırasında (G.simFrozen) yalnız bu bayraklı sistemlerin fixedUpdate'i çalışır.
 *   • G'ye eklenenler: G.dimMgr (createDimensionManager), G.transition (geçiş makinesi), G.dimGate (kapı denetleyicisi), G.dimensionOp(op) (terminal),
 *     G.portalMode ('normal'|'boyut'; techPortalGun yazar), G.simFrozen / G.transitionActive (geçiş boyunca), G.dim, G.dimMeta, G.dimStats.
 *   • api: getDimensionInfo() → {dim, calibrated, visits, portalMode, gate, transition, terminalsFound}.
 *   • Olaylar: dimensionEntered{dim,first} dimensionLeft{dim} dimensionChanged{from,to} gateOpened gateClosed gateUsed dimCalibrated terminalFound dimensionAborted dimRefund.
 *   • Şehir ölümü: eşya düşmez (gamePlayer.onDeath), en yakın bulunmuş terminalde tam can (gamePlayer.respawn → dimMgr.respawnPoint),
 *     bu sistem "Sistem seni terminalde yeniden derledi." duyurusunu verir ve etkileri temizler.
 */
import { createGateVisual } from '../render/city/gateVisual.js';
import { createDimensionManager } from '../gameDimension.js';
import { createTransition } from '../gameTransition.js';
import { createGateController } from './dimGate.js';
import { installDimCommands } from './dimCommands.js';
import { clearEffects } from '../sim/magicEffects.js';
import { applyDimensionLook } from '../render/city/cityLook.js';

export const DIMENSION_ORDER = -120;

const STUB_VISUAL = Object.freeze({
  attach() {}, show() {}, hide() {}, setCharge() {}, setCalibration() {}, setReducedMotion() {}, setQuality() {}, update() {}, dispose() {}, state: 'gizli',
});

export function createSystem(G) {
  const sys = {
    hopMs: [],
    hopRun: null,
  };
  let mgr = null;
  let tr = null;
  let gc = null;
  let visual = null;
  let ownsMgr = false;
  let lastQuality = '';
  let loadHintT = 0;
  let unsubDenied = null;

  function tier() {
    const q = G.quality && G.quality.settings ? G.quality.settings.effTier : null;
    return q === 'low' || q === 'medium' || q === 'high' ? q : 'high';
  }

  function propsReady(st) {
    const pr = G.propRenderer;
    if (G.dim !== 'neon' || !pr || !pr.stats) return true;
    return pr.stats.rebuilds > st.propRebuilds;
  }

  /** Boyut koruması (şehir yapıları / yer doldu) bir yazımı reddedince oyuncu NEDENİNİ görür (sessiz başarısızlık yok). */
  function onDenied(e) {
    const text = e && typeof e.message === 'string' ? e.message : '';
    if (!text) return;
    if (typeof G.hint === 'function') G.hint(text, { ttl: 2600, priority: 3, key: 'dim:denied:' + (e.reason || 'x'), cooldown: 1200 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.sound === 'function') G.sound('ui_error', undefined, { vol: 0.4 });
  }

  /** Yalnız ETKİN dünyaya abone olunur (boyut değişince eskisinden çıkılır → dinleyici sayısı sabit). */
  function bindDenied() {
    if (typeof unsubDenied === 'function') unsubDenied();
    unsubDenied = null;
    const w = G.world;
    if (w && typeof w.on === 'function') unsubDenied = w.on('blockDenied', onDenied);
  }

  function writeHud() {    const hud = G.hud;
    if (!hud) return;
    hud.dim = G.dim;
    if (hud.portals && typeof hud.portals === 'object') hud.portals.mode = G.portalMode === 'boyut' ? 'boyut' : 'normal';
  }

  function hopStep() {
    const run = sys.hopRun;
    if (!run || tr.active) return;
    if (run.remaining <= 0) {
      sys.hopRun = null;
      return;
    }
    const t = G.time.seconds;
    if (t < run.nextAt) return;
    const to = G.dim === 'neon' ? 'overworld' : 'neon';
    // kapı açılışını taklit eder: varış önceden hazırlanır (prewarm), `lead` sn sonra geçiş başlar (lead 0 = soğuk geçiş)
    if (run.lead > 0) {
      if (run.armedFor !== to) {
        run.armedFor = to;
        run.armedAt = t;
        mgr.prewarm(to);
        return;
      }
      if (t - run.armedAt < run.lead) return;
    }
    run.armedFor = null;
    const b = G.body;
    const r = tr.start({
      to,
      reason: 'gate',
      linkFrom: to === 'neon' ? {
        x: b.x, y: b.y, z: b.z, yaw: G.player.yaw,
      } : undefined,
      onDone: () => {},
    });
    if (r.ok) {
      run.remaining--;
      run.started++;
      run.nextAt = G.time.seconds + run.lo + (run.hi - run.lo) * run.rng();
    }
  }

  const system = {
    name: 'dimension',
    order: DIMENSION_ORDER,
    alwaysRun: true,
    sys,

    init() {
      if (G.mode !== 'macera' && !G.dimMgr) return; // inşa/harita: boyut yok (sistem tamamen etkisiz)
      if (G.dimMgr) mgr = G.dimMgr;
      else {
        mgr = createDimensionManager(G, Object.assign({ applyLook: applyDimensionLook }, G.dimDeps || {}));
        G.dimMgr = mgr;
        ownsMgr = true;
      }
      visual = G.THREE ? createGateVisual(G.THREE, { quality: tier(), reducedMotion: !!(G.reducedMotion || G.accessibility) }) : STUB_VISUAL;
      if (G.THREE && G.scene && visual.group && !visual.group.parent) G.scene.add(visual.group);
      lastQuality = tier();
      tr = createTransition(G, {
        mgr,
        onCharge: (k) => visual.setCharge(k),
        propsReady,
        onPhase: (name) => {
          G.transitionPhase = name;
          // Keşif 'gecis' görünümü: çıkış (şarj başı) ve varış (warpOut başı) halkaları; skin yoksa hiçbir şey olmaz
          if (G.cosmetics && (name === 'charge' || name === 'warpOut')) G.cosmetics.arrive(name === 'warpOut' ? 1 : 0);
        },
        onFinish: (result, st) => {
          if (st.totalMs > 0) {
            sys.hopMs.push(st.totalMs);
            if (sys.hopMs.length > 200) sys.hopMs.shift();
          }
        },
      });
      G.transition = tr;
      gc = createGateController(G, { mgr, tr, visual });
      G.dimGate = gc;
      G.dimensionOp = (op) => (op === 'back' || op === 'home' ? gc.terminal(op) : false);
      if (G.portalMode === undefined) G.portalMode = 'normal';
      G.simFrozen = false;
      G.transitionActive = false;
      G.dimAutosaves = 0;
      installDimCommands(G, sys);
      bindDenied();
      writeHud();
    },

    fixedUpdate(_G, dt) {
      if (!gc || G.simFrozen) return;
      gc.tick(dt);
      if (G.dim === 'neon' && G.hud) G.hud.dim = 'neon';
    },

    frameUpdate(_G, dt) {
      if (!tr) return;
      tr.update(G.time.paused ? 0 : dt);
      // bekçi: geçiş makinesi boştayken kilit asılı kalmasın (soft-lock yok)
      if (!tr.active && (G.simFrozen === true || G.transitionActive === true)) {
        G.simFrozen = false;
        G.transitionActive = false;
      }
      mgr.tickPrewarm(dt);
      gc.frame(G.time.paused ? 0 : dt);
      hopStep();
      // yükleme çubuğu arayüzü (cityhud LoadingOverlay) gelene dek ve ona ek olarak: ipucu satırında "Boyut geçişi… %NN" (aria-live için okunur)
      if (G.dimLoading && G.dimLoading.active) {
        loadHintT -= dt;
        if (loadHintT <= 0) {
          loadHintT = 0.5;
          const txt = 'Boyut geçişi… %' + Math.round(G.dimLoading.progress * 100);
          if (typeof G.hint === 'function') G.hint(txt, { ttl: 900, priority: 5, key: 'dim:loading', cooldown: 0 });
          else if (G.hud) G.hud.hint = txt;
        }
      } else loadHintT = 0;
      const q = tier();
      if (q !== lastQuality) {
        lastQuality = q;
        visual.setQuality(q);
      }
      visual.setReducedMotion(!!(G.reducedMotion || G.accessibility));
      writeHud();
    },

    beforeDimension() {
      if (gc) gc.beforeDimension();
    },

    onDimension(g, from, to) {
      if (!mgr || !visual) return;
      // kapı görseli: yeni boyutun kökü (varsa o boyutun kapısı gösterilir — kapılar boyuta özgüdür ve kaynakta kapanır)
      const c = mgr.get(to && to.id ? to.id : G.dim);
      visual.attach(c ? c.entityRoot : null);
      G.portalMode = G.portalMode === 'boyut' ? 'boyut' : 'normal';
      bindDenied();
      writeHud();
    },

    onEvent(_G, e) {
      switch (e.type) {
        case 'terminalFound':
          if (G.dim === 'neon' && Number.isInteger(e.terminal)) mgr.markTerminal(e.terminal);
          break;
        case 'dimensionEntered':
          if (e.dim === 'neon') {
            if (typeof G.banner === 'function') {
              G.banner('Neon Meridyen', e.first ? 'Eve dönmek için Boyut Terminalini kullan.' : 'Hoş geldin.', {
                key: 'dim:welcome', kind: 'info', duration: e.first ? 4200 : 2600, priority: 2,
              });
            }
          } else if (e.dim === 'overworld' && typeof G.hint === 'function') {
            G.hint('Ana diyara döndün.', { ttl: 3500, priority: 2, key: 'dim:home', cooldown: 2000 });
          }
          break;
        case 'respawn':
          if (G.dim === 'neon') {
            if (G.magic && G.magic.state) clearEffects(G.magic.state.effects);
            if (G.survival) G.survival.hunger = Math.max(12, G.survival.hunger);
            if (typeof G.banner === 'function') G.banner('Sistem seni terminalde yeniden derledi.', '', { key: 'dim:respawn', kind: 'info', duration: 3200, priority: 3 });
            else if (G.hud) G.hud.hint = 'Sistem seni terminalde yeniden derledi.';
            if (typeof G.speak === 'function') G.speak('Sistem seni terminalde yeniden derledi.');
          }
          break;
        case 'saved':
          if (e.reason === 'dimension') G.dimAutosaves = (G.dimAutosaves || 0) + 1;
          break;
        default:
          break;
      }
    },

    api() {
      return {
        getDimensionInfo() {
          return {
            dim: G.dim,
            calibrated: !!(mgr && mgr.dimMeta.calibrated),
            visits: mgr ? mgr.dimMeta.visits : 0,
            portalMode: G.portalMode || 'normal',
            gate: gc ? gc.info() : null,
            transition: tr ? tr.info : null,
            terminalsFound: mgr && mgr.get('neon') ? mgr.get('neon').terminals.found : 0,
          };
        },
      };
    },

    dispose() {
      if (typeof unsubDenied === 'function') unsubDenied();
      unsubDenied = null;
      if (tr) tr.dispose();
      if (gc) gc.dispose();
      if (visual && visual.dispose) visual.dispose();
      if (mgr && G.dimMgr === mgr) {
        mgr.dispose();
        if (ownsMgr) G.dimMgr = null;
      }
      G.transition = null;
      G.dimGate = null;
      G.dimensionOp = null;
      G.simFrozen = false;
      G.transitionActive = false;
    },
  };

  return system;
}

export default createSystem;
