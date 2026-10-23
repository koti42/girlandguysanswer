/*
 * KEŞİF — duyuru (banner) ve ipucu kuyrukları + olay → duyuru eşlemesi (saf mantık, node'da test edilir).
 *
 *   createBannerQueue({now?, max?, gapMs?}) → {
 *       push({text, sub?, priority?, duration?, key?, kind?}) → bool       kuyruğa/ekrana ekler (yinelenen atılır)
 *       update(nowMs?) → {text, sub, until} | null                         o an gösterilecek duyuru (kararlı nesne)
 *       clear(), size, current }
 *     Öncelik: büyük sayı önce. Gösterilen duyurudan YÜKSEK öncelikli yeni duyuru onu keser (kesilen, öncelik ≥ 4 ve
 *     süresinin yarısı dolmadıysa kuyruğun başına geri döner). İki duyuru arasında gapMs boşluk bırakılır.
 *   createHintQueue({now?}) → { push({text, ttl?, priority?, key?, cooldown?}) → bool, text(nowMs?) → string|null, clear(key?) }
 *     En yüksek öncelikli, süresi dolmamış ipucu; aynı anahtar cooldown (ms) dolmadan tekrar eklenmez.
 *   bannerForEvent(evt, opts?) → {text, sub, priority, duration, key, kind} | null
 *     opts.set: 'major' (varsayılan: bölge/mühür/boss/yetenek/boss kapısı/parkur rekoru) | 'all' (+bulmaca, kristal, başarım, keşif, görev)
 *     opts.skip: {olayTürü:1} → bu türler duyuru üretmez (başka sistem zaten gösteriyorsa)
 *   BANNER_SETS, ZONE_TAGLINES
 */
import { ZONES } from '../sim/constants.js';
import { getMobType } from '../sim/mobTypes.js';
import { PARKOUR_TIER_NAMES } from '../sim/progressionData.js';

const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export const BANNER_SETS = Object.freeze({
  major: Object.freeze({
    zoneEnter: 1, zoneUnlocked: 1, bossDefeated: 1, ability: 1, bossDoor: 1, parkourRecord: 1, victory: 1,
  }),
  all: Object.freeze({
    zoneEnter: 1, zoneUnlocked: 1, bossDefeated: 1, ability: 1, bossDoor: 1, parkourRecord: 1, victory: 1,
    puzzleSolved: 1, crystal: 1, achievement: 1, discover: 1, questUpdate: 1, sealProgress: 1,
  }),
});

export const ZONE_TAGLINES = Object.freeze([
  'Maceranın ilk adımı burada atılır',
  'Kökler fısıldar, bulmacalar saklanır',
  'Taş ve kor: dikkatli ilerle',
  'Buz kesen rüzgâr, uçurumlar ve zirveler',
  'Dünyanın çekirdeği: son sınav',
]);

const PUZZLE_NAMES = Object.freeze({
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
});

function cut(s, n) {
  const t = typeof s === 'string' ? s.trim() : '';
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function zoneName(i) {
  const z = ZONES[i];
  return z ? z.name : '';
}

function bossName(evt) {
  if (typeof evt.name === 'string' && evt.name) return evt.name;
  const key = evt.key || evt.bossKey || (Number.isInteger(evt.zone) && ZONES[evt.zone] ? ZONES[evt.zone].bossKey : null);
  const t = key ? getMobType(key) : null;
  return t && t.name ? t.name : 'Boss';
}

/** Olay → duyuru (null: bu olay duyuru üretmez). */
export function bannerForEvent(evt, opts) {
  if (!evt || typeof evt.type !== 'string') return null;
  const set = BANNER_SETS[(opts && opts.set) || 'major'] || BANNER_SETS.major;
  if (set[evt.type] !== 1) return null;
  if (opts && opts.skip && opts.skip[evt.type] === 1) return null;
  switch (evt.type) {
    case 'zoneEnter': {
      const z = Number.isInteger(evt.zone) ? evt.zone : -1;
      const name = cut(evt.name, 48) || zoneName(z);
      if (!name) return null;
      return {
        text: name, sub: ZONE_TAGLINES[z] || 'Yeni bir bölge', priority: 4, duration: 4600, key: 'zone:' + z, kind: 'zone',
      };
    }
    case 'zoneUnlocked': {
      const name = cut(evt.name, 48) || zoneName(evt.zone);
      return {
        text: 'Mühür kırıldı', sub: name ? name + ' artık açık' : 'Yeni bir bölge açıldı', priority: 7, duration: 6200, key: 'unlock:' + evt.zone, kind: 'unlock',
      };
    }
    case 'bossDefeated':
      return {
        text: bossName(evt) + ' yenildi', sub: 'Büyük ödül seni bekliyor', priority: 7, duration: 6000, key: 'boss:' + (evt.zone !== undefined ? evt.zone : evt.key), kind: 'boss',
      };
    case 'bossDoor':
      return {
        text: 'Boss kapısı açıldı', sub: 'Arenaya girmeye hazır olduğunda ilerle', priority: 5, duration: 5200, key: 'door:' + evt.zone, kind: 'boss',
      };
    case 'ability': {
      const sub = [cut(evt.name, 40), cut(evt.desc, 70)].filter(Boolean).join(' · ');
      return {
        text: 'Yeni yetenek', sub, priority: 6, duration: 6200, key: 'ability:' + (evt.key || evt.name), kind: 'ability',
      };
    }
    case 'victory':
      return {
        text: 'Dünya Fethedildi', sub: 'Keşfe ve inşaya dilediğin kadar devam edebilirsin', priority: 9, duration: 9000, key: 'victory', kind: 'victory',
      };
    case 'parkourRecord': {
      if (evt.first !== true && !(evt.best !== undefined && evt.ms !== undefined && evt.ms <= evt.best)) return null;
      const tier = PARKOUR_TIER_NAMES[evt.tier] || '';
      const sec = Number.isFinite(evt.ms) ? (evt.ms / 1000).toFixed(2).replace('.', ',') + ' sn' : '';
      return {
        text: evt.first === true ? 'Parkur tamamlandı' : 'Yeni rekor', sub: [tier, sec].filter(Boolean).join(' · '), priority: 4, duration: 4200, key: 'parkour:' + evt.id, kind: 'parkour',
      };
    }
    case 'puzzleSolved':
      return {
        text: 'Bulmaca çözüldü', sub: PUZZLE_NAMES[evt.puzzleType] || '', priority: 3, duration: 3600, key: 'puzzle:' + evt.id, kind: 'puzzle',
      };
    case 'crystal':
      return {
        text: 'Anahtar Kristali', sub: Number.isFinite(evt.count) ? evt.count + ' / ' + (evt.required || '?') + ' toplandı' : 'Kristal toplandı', priority: 4, duration: 4000, key: 'crystal:' + evt.id, kind: 'crystal',
      };
    case 'sealProgress':
      return {
        text: 'Mühür Sunağı', sub: evt.placed + ' / ' + evt.required + ' kristal yerleşti', priority: 4, duration: 4000, key: 'seal:' + evt.zone + ':' + evt.placed, kind: 'unlock',
      };
    case 'achievement':
      return {
        text: 'Başarım kazandın', sub: [cut(evt.title, 40), cut(evt.desc, 60)].filter(Boolean).join(' · '), priority: 3, duration: 4200, key: 'ach:' + evt.id, kind: 'achievement',
      };
    case 'discover': {
      const n = cut(evt.name, 48);
      if (!n) return null;
      return {
        text: 'Keşfettin', sub: n, priority: 2, duration: 3600, key: 'disc:' + evt.id, kind: 'discover',
      };
    }
    case 'questUpdate':
      if (evt.state !== 'done') return null;
      return {
        text: 'Görev tamamlandı', sub: cut(evt.title, 60), priority: 3, duration: 3800, key: 'quest:' + evt.id, kind: 'quest',
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Banner kuyruğu
 * ---------------------------------------------------------------------------------------------- */
export function createBannerQueue(o) {
  const opt = o || {};
  const now = opt.now || defaultNow;
  const max = opt.max > 0 ? opt.max : 6;
  const gapMs = opt.gapMs >= 0 ? opt.gapMs : 320;
  const queue = [];
  let cur = null; // {item, start, until}
  let gapUntil = 0;
  const view = { text: '', sub: '', until: 0 };
  let viewOn = false;
  const recent = new Map(); // key → son gösterim ms

  function sameKey(a, b) {
    return a.key !== undefined && a.key === b.key;
  }

  function enqueue(item, front) {
    if (front) queue.unshift(item);
    else queue.push(item);
    // öncelik (azalan), eşitlikte giriş sırası (kararlı sıralama)
    queue.sort((a, b) => (b.priority - a.priority) || (a.seq - b.seq));
    while (queue.length > max) {
      // en düşük öncelikli, en eski olanı at
      let drop = queue.length - 1;
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].priority < queue[drop].priority) drop = i;
      }
      queue.splice(drop, 1);
    }
  }

  let seq = 0;
  const api = {
    push(spec) {
      if (!spec || typeof spec.text !== 'string' || spec.text === '') return false;
      const t = now();
      const item = {
        text: spec.text,
        sub: typeof spec.sub === 'string' ? spec.sub : '',
        priority: Number.isFinite(spec.priority) ? spec.priority : 3,
        duration: Number.isFinite(spec.duration) && spec.duration > 300 ? spec.duration : 4200,
        key: spec.key,
        kind: spec.kind || 'info',
        seq: seq++,
      };
      if (item.key !== undefined) {
        const last = recent.get(item.key);
        if (last !== undefined && t - last < 4000) return false;
        if (cur && sameKey(cur.item, item)) return false;
        for (let i = 0; i < queue.length; i++) if (sameKey(queue[i], item)) return false;
      } else if ((cur && cur.item.text === item.text && cur.item.sub === item.sub) || queue.some((q) => q.text === item.text && q.sub === item.sub)) {
        return false;
      }
      // gösterilenden yüksek öncelikli → keser
      if (cur && item.priority > cur.item.priority) {
        const half = cur.start + (cur.until - cur.start) / 2;
        const keep = cur.item.priority >= 4 && t < half;
        const old = cur.item;
        cur = null;
        gapUntil = 0;
        viewOn = false;
        if (keep) enqueue(old, true);
      }
      enqueue(item, false);
      return true;
    },
    update(nowMs) {
      const t = nowMs === undefined ? now() : nowMs;
      if (cur && t >= cur.until) {
        cur = null;
        viewOn = false;
        gapUntil = t + gapMs;
      }
      if (!cur && queue.length > 0 && t >= gapUntil) {
        const item = queue.shift();
        cur = { item, start: t, until: t + item.duration };
        if (item.key !== undefined) {
          recent.set(item.key, t);
          if (recent.size > 64) recent.delete(recent.keys().next().value);
        }
        view.text = item.text;
        view.sub = item.sub;
        view.until = cur.until;
        viewOn = true;
      }
      return viewOn ? view : null;
    },
    clear() {
      queue.length = 0;
      cur = null;
      viewOn = false;
      gapUntil = 0;
    },
    get size() {
      return queue.length + (cur ? 1 : 0);
    },
    get current() {
      return cur ? cur.item : null;
    },
  };
  return api;
}

/* ------------------------------------------------------------------------------------------------
 * İpucu kuyruğu
 * ---------------------------------------------------------------------------------------------- */
export function createHintQueue(o) {
  const opt = o || {};
  const now = opt.now || defaultNow;
  const items = [];
  const last = new Map();
  return {
    push(spec) {
      if (!spec || typeof spec.text !== 'string' || spec.text === '') return false;
      const t = now();
      const key = spec.key !== undefined ? spec.key : spec.text;
      const cd = Number.isFinite(spec.cooldown) ? spec.cooldown : 0;
      const prev = last.get(key);
      if (cd > 0 && prev !== undefined && t - prev < cd) return false;
      last.set(key, t);
      if (last.size > 48) last.delete(last.keys().next().value);
      const ttl = Number.isFinite(spec.ttl) && spec.ttl > 200 ? spec.ttl : 6000;
      const pri = Number.isFinite(spec.priority) ? spec.priority : 1;
      for (let i = 0; i < items.length; i++) {
        if (items[i].key === key) {
          items[i].text = spec.text;
          items[i].until = t + ttl;
          items[i].priority = pri;
          return true;
        }
      }
      items.push({
        key, text: spec.text, until: t + ttl, priority: pri,
      });
      if (items.length > 8) items.shift();
      return true;
    },
    text(nowMs) {
      const t = nowMs === undefined ? now() : nowMs;
      let best = null;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (t >= it.until) {
          items.splice(i, 1);
          continue;
        }
        if (best === null || it.priority > best.priority || (it.priority === best.priority && it.until > best.until)) best = it;
      }
      return best ? best.text : null;
    },
    clear(key) {
      if (key === undefined) items.length = 0;
      else {
        for (let i = items.length - 1; i >= 0; i--) if (items[i].key === key) items.splice(i, 1);
      }
    },
    get size() {
      return items.length;
    },
  };
}
