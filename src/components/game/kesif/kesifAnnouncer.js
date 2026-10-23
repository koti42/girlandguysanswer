/*
 * KEŞİF duyuru kuyruğu (React'ten bağımsız, useSyncExternalStore uyumlu).
 *
 * Oturum motorun onEvent(evt) geri çağrısını buraya bağlar; ZoneBanner kuyruğu gösterir:
 *   const announcer = createAnnouncer();
 *   callbacks.onEvent = (evt) => announcer.push(evt);
 *   <KesifHud announcer={announcer} .../>
 *
 * Olay şekilleri esnek okunur (alan yoksa güvenli varsayılan). Bilinmeyen/gürültülü olaylar
 * (inventoryChanged, uiChanged, death…) duyuru üretmez.
 *
 * Başlangıç sakinliği: oyunun ilk ~6 sn'sinde ekranda yalnızca motorun açılış (dünya kodu) duyurusu + ilk görev ipucu kalır;
 * düşük öncelikli olaylar bu sürede yığılmaz — 'Görev güncellendi' atılır (görev takipçisi zaten gösterir), ilk bölgeye giriş atılır
 * (açılış duyurusu bölgeyi söylüyor), 'Keşfettin' ertelenir (sürede en sonuncusu, süre bitince tek duyuru). Aynı anda en çok 2 duyuru görünür;
 * taşarsa en düşük öncelikli (eşitte en eski) düşer; aynı türden düşük öncelikli duyuru (keşif/görev) yığılmaz, yerinde güncellenir;
 * aynı duyuru 6 sn içinde tekrarlanmaz.
 */

import { touchText } from './kxHudUtils.js';

/** Tür öncelikleri (büyük = önemli). Görev tamamlandı (done) 3, güncelleme 2. */
export const KIND_PRIORITY = Object.freeze({
  info: 1, hint: 1, quest: 2, discover: 2, zone: 3, puzzle: 3, achievement: 3, crystal: 4, parkour: 4, reward: 4, ability: 6, unlock: 7, boss: 7,
});
export const STARTUP_MS = 6000;
const DUP_MS = 6000;
const COALESCE_KINDS = Object.freeze({ discover: 1, quest: 1 });

export const ANNOUNCE_KINDS = Object.freeze(['zone', 'unlock', 'puzzle', 'crystal', 'boss', 'achievement', 'ability', 'parkour', 'discover', 'quest', 'reward', 'info', 'hint']);

const str = (v, max = 90) => {
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

const nameOf = (v) => {
  if (!v) return '';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'object') return str(v.name || v.title || v.label || '');
  return '';
};

function fmtMs(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return m + ':' + (r < 10 ? '0' : '') + r.toFixed(2);
}

const PUZZLE_NAMES = {
  basincplakasi: 'Basınç Plakası',
  runedizisi: 'Rün Dizisi',
  renkkollari: 'Renk Kolları',
  isinayna: 'Işın ve Ayna',
  itilebilirblok: 'İtilebilir Blok',
  hareketliplatform: 'Hareketli Platform',
  golgekopru: 'Gölge Köprüsü',
  portaloda: 'Portal Odası',
  terazi: 'Terazi',
  kodkilidi: 'Kod Kilidi',
  suakisi: 'Su Akışı',
};

const ABILITY_NAMES = { doubleJump: 'Çift Zıplama', grapple: 'Kanca', glide: 'Planör', portalGun: 'Portal Silahı' };

/** Motor olayını duyuruya çevirir: { kind, text, sub } ya da null. */
export function eventToAnnouncement(evt) {
  if (!evt || typeof evt !== 'object') return null;
  switch (evt.type) {
    case 'zoneEnter': {
      const n = nameOf(evt.zone) || str(evt.name);
      return n ? { kind: 'zone', text: n, sub: str(evt.sub) || 'Yeni bölgeye girdin' } : null;
    }
    case 'zoneUnlocked': {
      const n = nameOf(evt.zone) || str(evt.name);
      return { kind: 'unlock', text: 'Mühür kırıldı', sub: n ? n + ' artık açık' : 'Yeni bir bölge açıldı' };
    }
    case 'puzzleSolved': {
      const n = PUZZLE_NAMES[evt.puzzleType] || str(evt.name);
      return { kind: 'puzzle', text: 'Bulmaca çözüldü', sub: n };
    }
    case 'crystal': {
      const c = typeof evt.count === 'number' ? evt.count : null;
      const t = typeof evt.total === 'number' ? evt.total : null;
      return { kind: 'crystal', text: 'Anahtar Kristali', sub: c !== null && t !== null ? c + ' / ' + t + ' toplandı' : 'Kristal toplandı' };
    }
    case 'bossDefeated': {
      const n = nameOf(evt.boss) || str(evt.name);
      return { kind: 'boss', text: n ? n + ' yenildi' : 'Boss yenildi', sub: str(evt.sub) || 'Büyük ödül seni bekliyor' };
    }
    case 'achievement': {
      const n = str(evt.title) || nameOf(evt.achievement) || str(evt.name);
      return { kind: 'achievement', text: 'Başarım kazandın', sub: n ? n + (evt.desc ? ' · ' + str(evt.desc, 60) : '') : '' };
    }
    case 'ability': {
      const n = ABILITY_NAMES[evt.key] || ABILITY_NAMES[evt.ability] || str(evt.name);
      return { kind: 'ability', text: 'Yeni yetenek', sub: n };
    }
    case 'parkourDone': {
      const ms = typeof evt.timeMs === 'number' ? evt.timeMs : typeof evt.time === 'number' ? evt.time * 1000 : null;
      const best = evt.newBest === true || evt.best === true;
      return { kind: 'parkour', text: best ? 'Yeni rekor' : 'Parkur tamamlandı', sub: ms !== null ? fmtMs(ms) : '' };
    }
    case 'discover': {
      const n = nameOf(evt.what) || str(evt.name);
      return n ? { kind: 'discover', text: 'Keşfettin', sub: n } : null;
    }
    case 'questUpdate': {
      const n = str(evt.title) || nameOf(evt.quest);
      return n ? { kind: 'quest', text: evt.done ? 'Görev tamamlandı' : 'Görev güncellendi', sub: n, done: Boolean(evt.done) } : null;
    }
    case 'reward': {
      const amt = typeof evt.amount === 'number' && evt.amount > 0 ? formatInt(evt.amount) + ' jeton' : '';
      return { kind: 'reward', text: 'Ödül kazandın', sub: amt };
    }
    case 'saved':
      return { kind: 'info', text: 'Oyun kaydedildi', sub: '', quiet: true };
    case 'announce': {
      const t = touchText(str(evt.text));
      return t ? { kind: ANNOUNCE_KINDS.indexOf(evt.kind) >= 0 ? evt.kind : 'info', text: t, sub: touchText(str(evt.sub, 140)) } : null;
    }
    default:
      return null;
  }
}

function formatInt(n) {
  try {
    return new Intl.NumberFormat('tr-TR').format(Math.round(n));
  } catch {
    return String(Math.round(n));
  }
}

const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const priorityOf = (a) => {
  if (Number.isFinite(a.priority)) return a.priority;
  if (a.kind === 'quest' && a.done) return 3;
  return KIND_PRIORITY[a.kind] || 2;
};

/**
 * Kuyruk (bkz. dosya başı). Seçenekler: max (2), now, startupMs (STARTUP_MS). Süre dolumu bileşende (ZoneBanner) yönetilir;
 * burada yalnızca veri tutulur. begin(): başlangıç süresini yeniden başlatır (motor hazır olunca çağrılır); çağrılmazsa ilk push'ta başlar.
 */
export function createAnnouncer({ max = 2, now = defaultNow, startupMs = STARTUP_MS } = {}) {
  let items = [];
  let seq = 0;
  let startAt = null;
  let initialZone = null;
  let deferred = null;
  let timer = null;
  const listeners = new Set();
  const lastSeen = new Map();
  const emit = () => {
    listeners.forEach((l) => {
      try {
        l();
      } catch {
        // abone hatası yutulur
      }
    });
  };
  const inGrace = (t) => startAt !== null && t - startAt < startupMs;
  const cap = Math.max(1, max);
  const api = {
    get: () => items,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    /** Başlangıç sakinliğini şimdiden başlatır (yeni oturum). */
    begin() {
      startAt = now();
      initialZone = null;
      deferred = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    /** Süre dolduysa ertelenen duyuruyu bırakır (zamanlayıcı ve push çağırır; testler elle çağırabilir). */
    tick() {
      if (deferred && !inGrace(now())) {
        const d = deferred;
        deferred = null;
        return api.push(d);
      }
      return null;
    },
    /** Motor olayı ya da hazır duyuru ({kind,text,sub}) kabul eder; eklendiyse kimliği döner. */
    push(evtOrAnn) {
      const a = evtOrAnn && evtOrAnn.type ? eventToAnnouncement(evtOrAnn) : evtOrAnn;
      if (!a || !a.text) return null;
      const t = now();
      if (startAt === null) startAt = t;
      if (!inGrace(t) && deferred) api.tick();
      if (inGrace(t)) {
        if (a.kind === 'quest' && !a.done) return null;
        if (a.kind === 'zone') {
          const zs = a.text + '|' + (a.sub || '');
          if (initialZone === null) initialZone = zs;
          if (zs === initialZone) return null;
        }
        if (a.kind === 'discover') {
          deferred = a;
          if (!timer && typeof setTimeout === 'function') {
            timer = setTimeout(() => {
              timer = null;
              api.tick();
            }, Math.max(0, startAt + startupMs - t) + 30);
          }
          return null;
        }
      }
      const sig = a.kind + '|' + a.text + '|' + (a.sub || '');
      const prev = lastSeen.get(sig);
      if (prev !== undefined && t - prev < DUP_MS) return null;
      lastSeen.set(sig, t);
      if (lastSeen.size > 64) lastSeen.delete(lastSeen.keys().next().value);
      const pri = priorityOf(a);
      seq += 1;
      const item = {
        id: seq, kind: a.kind || 'info', text: a.text, sub: a.sub || '', quiet: Boolean(a.quiet), priority: pri,
      };
      // aynı türden düşük öncelikli duyuru yığılmaz: yerinde güncellenir (yeni kimlik → süre yeniden başlar)
      const same = COALESCE_KINDS[item.kind] === 1 ? items.findIndex((x) => x.kind === item.kind) : -1;
      const next = items.slice();
      if (same >= 0) next.splice(same, 1);
      next.push(item);
      while (next.length > cap) {
        let drop = -1;
        for (let i = 0; i < next.length; i++) {
          if (drop < 0 || next[i].priority < next[drop].priority) drop = i;
        }
        next.splice(drop, 1);
      }
      if (next.indexOf(item) < 0) return null;
      items = next;
      emit();
      return item.id;
    },
    dismiss(id) {
      const next = items.filter((x) => x.id !== id);
      if (next.length === items.length) return false;
      items = next;
      emit();
      return true;
    },
    clear() {
      if (!items.length) return;
      items = [];
      emit();
    },
  };
  return api;
}
