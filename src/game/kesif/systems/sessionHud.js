/*
 * KEŞİF — HUD birleştirme (order 90, çekirdeğin hud.fill'inden SONRA, yayından ÖNCE).
 *
 *   createHudAssembler(G, deps) → { frame(dt), setIconFn(fn), stats }
 *     deps: {banners, hints, now?: ms, epoch?: ms, iconFor?: (itemKey) → dataURL|''}
 *
 * Çekirdek hp/açlık/koordinat/bölge/zaman/hotbar metnini doldurur. Bu birleştirici şunları yazar:
 *   hotbar[i].icon   renderItemIcon (48 px) tembel önbellekli veri-URL'si
 *   quest            macera: progression.questHud() (0,5 sn'de bir, yalnız değişince; content sistemi varsa o yazar); diğer modlar boş
 *   boss             başka sistem yazmadıysa em.bossHud() özeti (4 Hz; mobs sistemi varsa o yazar)
 *   banner           banner kuyruğunun o anki duyurusu {text, sub, until(epoch ms)}
 *   hint             ipucu kuyruğu; BAŞKA bir sistemin yazdığı ipucu (G.hud.hint) varsa ona dokunmaz
 * Kural: blocks `target`, content `parkour`/`boss`, core `coords/zone/...` alanlarını yazar; bu dosya onlara dokunmaz.
 * Önemli değişimde G.publishHud(true) çağrılır (banner/ipucu/görev başlığı); sürekli akış çekirdeğin 15 Hz yayıncısındadır.
 */
import { dayFactor } from '../sim/daynight.js';
import { renderItemIcon } from '../render/itemIcons.js';

const ICON_SIZE = 48;
const QUEST_EVERY = 0.5;
const BOSS_EVERY = 0.25;
const HINT_EVERY = 2;
const SPEAK_GAP_MS = 2500;

const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function linesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function createHudAssembler(G, deps) {
  const d = deps || {};
  const banners = d.banners;
  const hints = d.hints;
  const now = d.now || perfNow;
  const epoch = d.epoch || Date.now;
  let iconFn = d.iconFor || ((key) => renderItemIcon(key, ICON_SIZE));
  const icons = new Map();
  const bossObj = { name: '', hp: 1, maxHp: 1 };
  const hintCtx = {
    inventory: null, hp: 20, maxHp: 20, hunger: 20, isNight: false, underground: false, light: 15,
  };
  const st = {
    quest: QUEST_EVERY, boss: BOSS_EVERY, hint: HINT_EVERY, bannerKey: '', mineBanner: null, mineUntil: 0, mineHint: null, lastSpeak: -Infinity, lastHintSpoken: '', frames: 0,
  };

  function iconOf(key) {
    let v = icons.get(key);
    if (v === undefined) {
      try {
        v = iconFn(key) || '';
      } catch {
        v = '';
      }
      if (icons.size > 256) icons.clear();
      icons.set(key, v);
    }
    return v;
  }

  function fillIcons(hud) {
    const hb = hud.hotbar;
    for (let i = 0; i < hb.length; i++) {
      const s = hb[i];
      if (s.item) {
        const ic = iconOf(s.item);
        if (ic) {
          if (s.icon !== ic) s.icon = ic;
        } else if (s.icon !== undefined) delete s.icon;
      } else if (s.icon !== undefined) delete s.icon;
    }
  }

  /** content sistemi macera modunda görev HUD'unu ve bağlamsal ipuçlarını kendisi yönetir; çift yazım olmasın. */
  const contentLive = () => G.mode === 'macera' && typeof G.getSystem === 'function' && !!G.getSystem('content');
  const mobsLive = () => typeof G.getSystem === 'function' && !!G.getSystem('mobs');

  function updateQuest(hud) {
    if (contentLive()) return false;
    let q;
    if (G.mode === 'macera' && G.progression && typeof G.progression.questHud === 'function') q = G.progression.questHud();
    else q = null;
    const cur = hud.quest;
    if (!q) {
      if (cur.title !== '' || cur.lines.length > 0) {
        hud.quest = { title: '', lines: [] };
        return true;
      }
      return false;
    }
    if (cur.title === q.title && linesEqual(cur.lines, q.lines)) return false;
    hud.quest = { title: q.title, lines: q.lines.slice() };
    return cur.title !== q.title;
  }

  function updateBoss(hud) {
    const em = G.em;
    if (!em || typeof em.bossHud !== 'function' || mobsLive()) return false;
    if (hud.boss && hud.boss !== bossObj) return false; // başka sistem yönetiyor
    const b = em.bossHud();
    if (!b) {
      if (hud.boss === bossObj) {
        hud.boss = null;
        return true;
      }
      return false;
    }
    bossObj.name = b.name;
    bossObj.hp = b.hp;
    bossObj.maxHp = b.maxHp;
    if (hud.boss !== bossObj) {
      hud.boss = bossObj;
      return true;
    }
    return false;
  }

  function pollContextHint() {
    const p = G.progression;
    if (G.mode !== 'macera' || !p || typeof p.hintInfo !== 'function' || G.player.dead || G.ui !== 'none' || contentLive()) return;
    const b = G.body;
    const sv = G.survival;
    const bx = Math.floor(b.x);
    const by = Math.floor(b.y + b.eyeH);
    const bz = Math.floor(b.z);
    const packed = G.world.getLight(bx, by, bz);
    const sky = packed >> 4;
    const blockL = packed & 15;
    const df = dayFactor(G.clock);
    hintCtx.inventory = G.inventory;
    hintCtx.hp = sv.hp;
    hintCtx.maxHp = sv.maxHp;
    hintCtx.hunger = sv.hunger;
    hintCtx.isNight = df < 0.3;
    hintCtx.underground = sky <= 2 && b.y < 60;
    hintCtx.light = Math.max(blockL, Math.floor(sky * df));
    const info = p.hintInfo(hintCtx);
    if (info && info.text) {
      const quest = info.key.indexOf('görev:') === 0;
      hints.push({
        // aynı ipucu uzun süre tekrar etmez (oyuncunun durup beklemesi ipucu geri getirmez)
        text: info.text, key: 'p:' + info.key, ttl: quest ? 8000 : 7000, priority: quest ? 0 : 1, cooldown: 600000,
      });
    }
  }

  function updateHint(hud, t) {
    const cur = hud.hint;
    if (cur && cur !== st.mineHint) return false; // başka sistemin ipucu
    const next = hints.text(t);
    if (next === (cur || null)) {
      if (!next) st.mineHint = null;
      return false;
    }
    hud.hint = next;
    st.mineHint = next;
    if (next && G.accessibility && next !== st.lastHintSpoken && t - st.lastSpeak > SPEAK_GAP_MS) {
      st.lastSpeak = t;
      st.lastHintSpoken = next;
      G.speak(next);
    }
    return true;
  }

  function updateBanner(hud, t) {
    // başka sistem (content) büyük bir duyuru yazdıysa üzerine yazma; o bitince bizimki (süresi kaldıysa) geri gelir
    if (hud.banner && hud.banner !== st.mineBanner) return false;
    if (!hud.banner && st.mineBanner && st.bannerKey !== '') {
      if (t < st.mineUntil) {
        hud.banner = st.mineBanner;
        return true;
      }
    }
    const v = banners.update(t);
    if (!v) {
      if (st.bannerKey !== '') {
        st.bannerKey = '';
        if (hud.banner === st.mineBanner) hud.banner = null;
        st.mineBanner = null;
        return true;
      }
      return false;
    }
    const key = v.text + '|' + v.sub + '|' + v.until;
    if (key === st.bannerKey) return false;
    st.bannerKey = key;
    st.mineBanner = { text: v.text, sub: v.sub, until: epoch() + Math.max(0, v.until - t) };
    st.mineUntil = v.until;
    hud.banner = st.mineBanner;
    if (G.accessibility && t - st.lastSpeak > 600) {
      st.lastSpeak = t;
      G.speak(v.sub ? v.text + '. ' + v.sub : v.text);
    }
    return true;
  }

  return {
    frame(dt) {
      const hud = G.hud;
      const t = now();
      st.frames++;
      let important = false;
      fillIcons(hud);
      st.quest += dt;
      if (st.quest >= QUEST_EVERY) {
        st.quest = 0;
        if (updateQuest(hud)) important = true;
      }
      st.boss += dt;
      if (st.boss >= BOSS_EVERY) {
        st.boss = 0;
        if (updateBoss(hud)) important = true;
      }
      st.hint += dt;
      if (st.hint >= HINT_EVERY) {
        st.hint = 0;
        pollContextHint();
      }
      if (updateHint(hud, t)) important = true;
      if (updateBanner(hud, t)) important = true;
      if (important) G.publishHud(true);
    },
    setIconFn(fn) {
      if (typeof fn === 'function') {
        iconFn = fn;
        icons.clear();
      }
    },
    get stats() {
      return { icons: icons.size, frames: st.frames };
    },
  };
}
