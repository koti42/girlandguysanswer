/*
 * KEŞİF — OTURUM SİSTEMİ (giriş dosyası). gameSystems.js bunu otomatik yükler: `createSystems(G)` iki sistem verir.
 *
 *   'session'      order 10   kayıt/yükleme (init'te geri yükleme, 60 sn'de bir + ölümde + duraklatmada + çıkışta kayıt), mod kuralları
 *                             (harita salt-okunur, inşa sınırı ipuçları), açılış duyuruları, ses melodileri, hata ayıklama komutları, api
 *   'session.hud'  order 90   HUD birleştirme: hotbar simgeleri, görev, boss yedeği, duyuru/ipucu kuyruğu (çekirdeğin hud.fill'inden sonra)
 *
 * Dosyalar: sessionSave.js (kayıt), sessionModes.js (mod/dışa aktarma), sessionHud.js (HUD), sessionBanner.js (kuyruklar + olay→duyuru),
 *           sessionAudio.js (melodiler), sessionCommands.js (komutlar), sessionApi.js (api).
 *
 * G'ye eklenen alanlar (diğer sistemler kullanabilir):
 *   G.hint(text, {ttl?, priority?, key?, cooldown?})   ipucu satırı (hud.hint) — kuyruklu, öncelikli
 *   G.banner(text, sub?, {priority?, duration?, key?}) büyük duyuru (hud.banner) — kuyruklu, öncelikli
 *   G.readOnly                                         harita modunda true: blocks sistemi kırma/yerleştirmeyi reddeder
 *   G.buildBounds                                      insa/harita yapı alanı {minCx,maxCx,minCz,maxCz} | null
 *   G.introDone, G.restoreInfo, G.cheats {god,fly}, G.bedSpawn (yatak doğuşu; çekirdek respawn'ı okur)
 * Olaylar: sistemler `{type:'actionDenied', reason:'readOnly'|'bounds'|'height'|'system'|'protected'}` yayınlarsa ipucu gösterilir.
 *          `G.requestSave('manual'|'auto')` kayıt ister. Yayınlanan: 'saved' {reason, bytes}.
 * Kayıt tetikleyicileri: 60 sn (boşta) · ölüm · duraklatma · bölge açılışı/boss/yetenek/zafer (boşta) · sekme gizlenince · çıkış (dispose).
 */
import { bannerForEvent, createBannerQueue, createHintQueue } from './sessionBanner.js';
import { createSessionAudio } from './sessionAudio.js';
import { createHudAssembler } from './sessionHud.js';
import {
  boundsContact, deniedText, introFor, setupMode,
} from './sessionModes.js';
import { createSaver, restoreFromSave } from './sessionSave.js';
import { buildSessionApi } from './sessionApi.js';

const SAVE_EVENTS = Object.freeze({
  zoneUnlocked: 1, bossDefeated: 1, ability: 1, victory: 1,
});
const ZONE_REPEAT_MS = 120000;

function guard(G) {
  return (sys, fn) => {
    try {
      return fn();
    } catch (err) {
      if (G.opts && G.opts.strictSystems) throw err;
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] oturum geri yükleme hatası ' + (sys && sys.name) + ':', err);
      return undefined;
    }
  };
}

export function createSessionRuntime(G, deps) {
  const d = deps || {};
  const banners = createBannerQueue(d.bannerOpts);
  const hints = createHintQueue(d.hintOpts);
  const saver = createSaver(G, d.saverDeps);
  const hudAsm = createHudAssembler(G, Object.assign({ banners, hints }, d.hudDeps || {}));
  const saudio = createSessionAudio(G);
  const bannerSet = G.opts && G.opts.banners === 'all' ? 'all' : 'major';
  // content sistemi varsa mühür açılış duyurusunu kendisi gösterir (çift duyuru olmasın)
  const contentLive = () => G.mode === 'macera' && typeof G.getSystem === 'function' && !!G.getSystem('content');
  const SKIP_WITH_CONTENT = { zoneUnlocked: 1 };
  const st = {
    pendingSystems: null, zoneShown: -1, zoneShownAt: 0, firstZone: true, listeners: [], disposed: false,
  };

  const pushBanner = (spec) => banners.push(spec);

  function onZoneEnter(evt) {
    const t = Date.now();
    const z = Number.isInteger(evt.zone) ? evt.zone : -1;
    if (st.firstZone) {
      st.firstZone = false;
      if (G.time.playTime < 3) {
        // oyunun ilk bölge bildirimi: açılış duyurusu zaten gösteriliyor
        st.zoneShown = z;
        st.zoneShownAt = t;
        return false;
      }
    }
    if (st.zoneShown === z && t - st.zoneShownAt < ZONE_REPEAT_MS) return false;
    st.zoneShown = z;
    st.zoneShownAt = t;
    return true;
  }

  function handleEvent(evt) {
    switch (evt.type) {
      case 'uiChanged':
        if (evt.ui === 'pause') saver.request('auto', { force: true, minGap: 1500 });
        return;
      case 'death':
        saver.request('auto', { force: true });
        break;
      case 'actionDenied':
        hints.push({
          text: deniedText(evt.reason), key: 'denied:' + evt.reason, ttl: 3500, priority: 3, cooldown: 2500,
        });
        if (G.accessibility) G.speak(deniedText(evt.reason));
        return;
      default:
        break;
    }
    if (SAVE_EVENTS[evt.type] === 1) saver.request('auto', { force: true, idle: true });
    if (evt.type === 'zoneEnter' && !onZoneEnter(evt)) return;
    const spec = bannerForEvent(evt, { set: bannerSet, skip: contentLive() ? SKIP_WITH_CONTENT : null });
    if (spec) {
      pushBanner(spec);
    } else if (G.accessibility && bannerSet === 'major' && !(contentLive() && evt.type === 'puzzleSolved')) {
      // ekranda büyük duyuru çıkmayan ama önemli olaylar yine de sesli okunur
      const ann = bannerForEvent(evt, { set: 'all' });
      if (ann) G.speak(ann.sub ? ann.text + '. ' + ann.sub : ann.text);
    }
  }

  function applyIntro(resumed, restoreError) {
    const intro = introFor(G, { resumed, restoreError, contentLive: contentLive() });
    for (let i = 0; i < intro.banners.length; i++) pushBanner(intro.banners[i]);
    for (let i = 0; i < intro.hints.length; i++) hints.push(intro.hints[i]);
  }

  function addDomListeners() {
    if (typeof document !== 'undefined' && document.addEventListener) {
      const onVis = () => {
        if (document.hidden) saver.request('auto', { force: true, minGap: 3000 });
      };
      document.addEventListener('visibilitychange', onVis);
      st.listeners.push(() => document.removeEventListener('visibilitychange', onVis));
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      const onHide = () => saver.request('exit', { force: true, minGap: 1500 });
      window.addEventListener('pagehide', onHide);
      st.listeners.push(() => window.removeEventListener('pagehide', onHide));
    }
  }

  const core = {
    name: 'session',
    order: 10,

    init() {
      setupMode(G);
      G.cheats = { god: false, fly: false };
      G.introDone = false;
      G.hint = (text, o) => {
        const op = o || {};
        return hints.push({
          text, ttl: op.ttl, priority: op.priority, key: op.key, cooldown: op.cooldown,
        });
      };
      G.banner = (text, sub, o) => {
        const op = o || {};
        return banners.push({
          text, sub, priority: op.priority, duration: op.duration, key: op.key, kind: op.kind,
        });
      };
      G.saveHooks.push((reason) => {
        const r = reason === 'manual' || reason === 'exit' || reason === 'dimension' ? reason : 'auto';
        return saver.request(r, { force: true });
      });
      let resumed = false;
      let restoreError = false;
      if (G.opts && G.opts.save && (typeof G.opts.save === 'object' || typeof G.opts.save === 'string')) {
        const r = restoreFromSave(G, G.opts.save);
        G.restoreInfo = r;
        if (r.ok) {
          resumed = true;
          st.pendingSystems = r.systems;
          saver.adopt(r.name, r.createdAt);
          G.introDone = r.intro === true;
          G._invDirty = true;
          G.markDirty('all');
          if (G.world.edits.size > 4000) saver.prewarm();
        } else {
          restoreError = r.code === 'oldworld' ? 'oldworld' : true;
          G.speak(r.error || 'Kayıt okunamadı.');
        }
      }
      applyIntro(resumed, restoreError);
      G.introDone = true;
      addDomListeners();
    },

    fixedUpdate(_G, dt) {
      saver.tick(dt);
      const c = G.cheats;
      if (c && c.god) {
        const s = G.survival;
        if (s.invuln < 1) s.invuln = 1;
        s.lastDamage = Infinity; // dokunulmazlıkta büyük (örn. 400 blok düşüş) hasarın farkı da geçmez
        s.hp = s.maxHp;
        s.oxygen = s.maxOxygen;
        s.hunger = s.maxHunger;
      }
    },

    frameUpdate() {
      if (st.pendingSystems) {
        const map = st.pendingSystems;
        st.pendingSystems = null;
        G.registry.restore(G, map, guard(G));
      }
      if (G.ui === 'none' && !G.player.dead) {
        const contact = boundsContact(G);
        if (contact) {
          hints.push({
            text: deniedText(contact), key: 'bounds', ttl: 3200, priority: 3, cooldown: 6000,
          });
        }
      }
      saudio.frame(G);
    },

    onEvent(_G, evt) {
      if (!evt || typeof evt.type !== 'string') return;
      saudio.onEvent(G, evt);
      handleEvent(evt);
    },

    onAction(_G, a) {
      saudio.onAction(G, a);
    },

    api() {
      return buildSessionApi(G, { saver });
    },

    dispose() {
      if (st.disposed) return;
      st.disposed = true;
      // çekirdek (destroyApi) çıkış kaydını sistemler sökülmeden önce zaten yazdıysa tekrar yazma (sökülmüş sistemler eksik kayıt üretir)
      if (G.worldReady && saver.stats.lastReason !== 'exit') saver.save('exit', { force: true });
      saver.dispose();
      for (let i = 0; i < st.listeners.length; i++) {
        try { st.listeners[i](); } catch { /* yut */ }
      }
      st.listeners.length = 0;
    },
  };

  const hudSys = {
    name: 'session.hud',
    order: 90,
    frameUpdate(_G, dt) {
      hudAsm.frame(dt);
    },
  };

  return {
    core, hud: hudSys, banners, hints, saver, hudAsm, state: st,
  };
}

export function createSystems(G) {
  const rt = createSessionRuntime(G);
  return [rt.core, rt.hud];
}
