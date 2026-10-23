/*
 * KEŞİF content sistemi — ses/parçacık/ileti/duyuru yardımcıları.
 *
 *   createContentFx(G) → {
 *     sound(name, x, y, z, pitch?)            G.sound (konumlu; hata yutulur)
 *     particles(name, x, y, z, color?, opts?) beyaz listedeki parçacık efektleri (puzzle efekt adları dahil)
 *     blockDust(blockId, x, y, z)             blok tozu (G.particles.blockBreak)
 *     message(text, o?)                       HUD ipucu satırında sırayla gösterir + G.speak (o: {speak=true, key})
 *     banner(text, sub?, ms?, force?)         hud.banner (büyük başlık); başka sistemin gösterdiği duyurunun üzerine yazmaz (force: yazar)
 *     announce(kind, text, sub?)              callbacks.onEvent({type:'announce',...}) — duyuru kuyruğuna doğrudan
 *     frame(dt)                               ileti kuyruğu + banner süresi (dt gerçek kare süresi; duraklatılmışken 0)
 *     current() → string | null               şu an gösterilen ileti (hud.hint için)
 *     reset()
 *   }
 *
 * İletiler uzun metni cümle sınırlarında ≤ 150 karakterlik parçalara böler (hud.hint sınırı 160) ve okuma hızına göre sırayla
 * gösterir; aynı ileti 1,5 sn içinde tekrarlanmaz. Parçacık/ses konumları tek bir ortak nesneye yazılır (kare başına ayırma yok).
 */
import { messageSeconds, splitMessage } from './contentHelpers.js';

const POS = { x: 0, y: 0, z: 0 };
const PARTICLE_FX = {
  magicBurst: (P, p, c, o) => P.magicBurst(p, c === undefined ? 0xb08cff : c, o),
  levelUp: (P, p, c, o) => P.levelUp(p, c === undefined ? 0xffd24a : c, o),
  portalSwirl: (P, p, c, o) => P.portalSwirl(p, c === undefined ? 0x3a8fff : c, o),
  pickup: (P, p, c) => P.pickup(p, c),
  hitSpark: (P, p, c) => P.hitSpark(p, undefined, c),
  healHearts: (P, p) => P.healHearts(p),
  deathMotes: (P, p, c) => P.deathMotes(p, c === undefined ? 0xb08cff : c, 1),
  achievement: (P, p) => P.achievement(p),
  bossShockwave: (P, p, c, o) => P.bossShockwave(p, Object.assign({ color: c }, o || {})),
  xpOrb: (P, p, c) => P.xpOrb(p, c),
};

export function createContentFx(G) {
  const queue = [];
  let cur = null;
  let curLeft = 0;
  let curAge = 0;
  let lastText = '';
  let lastTextAt = -10;
  let clock = 0;
  let bannerObj = null;

  function sound(name, x, y, z, pitch) {
    if (!name || typeof G.sound !== 'function') return;
    try {
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        POS.x = x;
        POS.y = y;
        POS.z = z;
        G.sound(name, POS, pitch !== undefined && pitch !== 1 ? { pitch } : undefined);
      } else {
        G.sound(name, undefined, pitch !== undefined && pitch !== 1 ? { pitch } : undefined);
      }
    } catch { /* ses hatası oyunu durdurmaz */ }
  }

  function particles(name, x, y, z, color, opts) {
    const P = G.particles;
    const f = PARTICLE_FX[name];
    if (!P || !f || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    try {
      POS.x = x;
      POS.y = y;
      POS.z = z;
      f(P, POS, Number.isFinite(color) ? color : undefined, opts);
    } catch { /* parçacık hatası oyunu durdurmaz */ }
  }

  function blockDust(blockId, x, y, z) {
    const P = G.particles;
    if (!P || typeof P.blockBreak !== 'function') return;
    try {
      POS.x = x + 0.5;
      POS.y = y + 0.5;
      POS.z = z + 0.5;
      P.blockBreak(blockId, POS, 0.6);
    } catch { /* yut */ }
  }

  function message(text, o) {
    const op = o || {};
    const parts = splitMessage(text, 150);
    if (parts.length === 0) return;
    const joined = parts.join(' ');
    if (joined === lastText && clock - lastTextAt < 1.5) return;
    lastText = joined;
    lastTextAt = clock;
    if (cur !== null && parts.length === 1 && cur === parts[0]) {
      curLeft = Math.max(curLeft, messageSeconds(cur));
      return;
    }
    // yeni ileti eskimiş sıradakileri iptal eder; gösterilen ileti ≥ 1,2 sn okunduysa hemen yerini verir
    queue.length = 0;
    if (cur !== null && curAge >= 1.2) cur = null;
    for (let i = 0; i < parts.length; i++) queue.push(parts[i]);
    if (op.speak !== false && typeof G.speak === 'function') G.speak(joined);
  }

  function banner(text, sub, ms, force) {
    if (!text) return false;
    const cb = G.hud.banner;
    // nazik: başka bir sistemin (oturum duyuru kuyruğu) gösterdiği duyurunun üzerine yazma (force hariç)
    if (!force && cb && cb !== bannerObj && !(cb.until > 0 && cb.until < Date.now() + 700)) return false;
    const b = { text: String(text), sub: sub ? String(sub) : '', until: Date.now() + (ms > 0 ? ms : 4500) };
    bannerObj = b;
    G.hud.banner = b;
    if (typeof G.publishHud === 'function') G.publishHud(true);
    return true;
  }

  function announce(kind, text, sub) {
    const cb = G.callbacks && G.callbacks.onEvent;
    if (typeof cb !== 'function' || !text) return;
    try {
      cb({
        type: 'announce', kind: kind || 'info', text: String(text), sub: sub ? String(sub) : '',
      });
    } catch { /* yut */ }
  }

  function frame(dt) {
    clock += dt;
    if (dt > 0) {
      if (cur !== null) {
        curLeft -= dt;
        curAge += dt;
        if (curLeft <= 0) cur = null;
      }
      if (cur === null && queue.length > 0) {
        cur = queue.shift();
        curLeft = messageSeconds(cur);
        curAge = 0;
      }
    }
    if (bannerObj !== null && G.hud.banner === bannerObj && bannerObj.until > 0 && Date.now() > bannerObj.until) {
      G.hud.banner = null;
      bannerObj = null;
    }
  }

  function reset() {
    queue.length = 0;
    cur = null;
    curLeft = 0;
    curAge = 0;
  }

  return {
    sound, particles, blockDust, message, banner, announce, frame, reset, current: () => cur,
  };
}
