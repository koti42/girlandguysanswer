/*
 * KEŞİF sim — rehberli görev zinciri (saf). Veri: questsData.js. Hedefler toplam istatistiklerden hesaplanır
 * (progressionMetrics.goalValue), bu yüzden görevler sıradan bağımsız ilerler ve geç açılan görev önceden yapılmış
 * işi hemen sayar (otomatik ilerleme; birden çok görev art arda tamamlanabilir).
 *
 * Görev durumu: 'done' | 'active' (tüm `requires` bitti) | 'locked'. Kalıcı olan yalnızca p.questsDone ({id:true}).
 *
 *   syncQuests(p) → {completed:[görev], changed:[{quest,progress,goal}]}   (p.questsDone'ı günceller; ödülü ÇAĞIRAN verir)
 *   getActiveQuest(p) → bilgi | null   ana görev (sıradaki ilk uygun görev)
 *   getActiveQuests(p, max) → [bilgi]
 *   getQuestLines(p, max=3) → [metin]  HUD satırları (ana görev açıklaması + diğer açık görevler)
 *   getQuestHud(p) → {title, lines} | null
 *   getQuestList(p, {includeLocked, chain}) → günlük girdileri
 *   getHint(p, ctx) / getHintInfo(p, ctx) → bağlamsal ipucu
 */
import { QUESTS, QUEST_BY_ID, QUEST_CHAINS, QUEST_ORDER } from './questsData.js';
import { goalValue } from './progressionMetrics.js';

export { QUESTS, QUEST_BY_ID, QUEST_CHAINS };

export function getQuest(id) {
  return QUEST_BY_ID[id] || null;
}

export function isQuestAvailable(p, q) {
  for (let i = 0; i < q.requires.length; i++) if (!p.questsDone[q.requires[i]]) return false;
  return true;
}

export function questState(p, q) {
  if (p.questsDone[q.id]) return 'done';
  return isQuestAvailable(p, q) ? 'active' : 'locked';
}

/** Mevcut ilerleme (0..n). */
export function questProgress(p, q) {
  if (p.questsDone[q.id]) return q.n;
  const v = goalValue(p, q.goal);
  return v >= q.n ? q.n : v < 0 ? 0 : Math.floor(v);
}

function info(p, q) {
  const state = questState(p, q);
  return {
    id: q.id,
    chain: q.chain,
    title: q.title,
    desc: q.desc,
    hint: q.hint,
    state,
    progress: state === 'done' ? q.n : questProgress(p, q),
    goal: q.n,
    rewards: q.rewards,
    index: QUEST_ORDER[q.id],
  };
}

/**
 * Görevleri günceller: tamamlananları p.questsDone'a yazar (zincirleme açılanlar aynı çağrıda değerlendirilir),
 * açık görevlerin ilerleme değişimlerini döner. p._qSeen (kalıcı değil) son bildirilen ilerlemeyi tutar.
 */
export function syncQuests(p) {
  const completed = [];
  const changed = [];
  if (!p._qSeen) p._qSeen = {};
  for (let pass = 0; pass < 12; pass++) {
    let any = false;
    for (let i = 0; i < QUESTS.length; i++) {
      const q = QUESTS[i];
      if (p.questsDone[q.id] || !isQuestAvailable(p, q)) continue;
      const v = goalValue(p, q.goal);
      if (v >= q.n) {
        p.questsDone[q.id] = true;
        p._qSeen[q.id] = q.n;
        completed.push(q);
        any = true;
      }
    }
    if (!any) break;
  }
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    if (p.questsDone[q.id] || !isQuestAvailable(p, q)) continue;
    const prog = questProgress(p, q);
    const seen = p._qSeen[q.id];
    if (seen === undefined) {
      p._qSeen[q.id] = prog;
      if (prog > 0) changed.push({ quest: q, progress: prog, goal: q.n });
    } else if (seen !== prog) {
      p._qSeen[q.id] = prog;
      changed.push({ quest: q, progress: prog, goal: q.n });
    }
  }
  return { completed, changed };
}

export function getActiveQuests(p, max = 3) {
  const out = [];
  for (let i = 0; i < QUESTS.length && out.length < max; i++) {
    const q = QUESTS[i];
    if (p.questsDone[q.id] || !isQuestAvailable(p, q)) continue;
    out.push(info(p, q));
  }
  return out;
}

export function getActiveQuest(p) {
  const l = getActiveQuests(p, 1);
  return l.length ? l[0] : null;
}

function progressText(a) {
  return a.goal > 1 ? ' (' + a.progress + '/' + a.goal + ')' : '';
}

export function getQuestLines(p, max = 3) {
  const list = getActiveQuests(p, Math.max(1, max));
  return list.map((a, i) => (i === 0 ? a.desc : a.title) + progressText(a));
}

export function getQuestHud(p) {
  const list = getActiveQuests(p, 3);
  if (list.length === 0) {
    return { title: 'Tüm görevler tamam', lines: ['Dünyayı keşfetmeye ve inşa etmeye devam edebilirsin.'] };
  }
  return {
    title: list[0].title,
    lines: list.map((a, i) => (i === 0 ? a.desc : a.title) + progressText(a)),
  };
}

/** Günlük listesi: açık görevler (sıralı), sonra biten görevler; includeLocked ile kilitliler de. */
export function getQuestList(p, opts) {
  const o = opts || {};
  const act = [];
  const done = [];
  const lock = [];
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    if (o.chain && q.chain !== o.chain) continue;
    const a = info(p, q);
    if (a.state === 'done') done.push(a);
    else if (a.state === 'active') act.push(a);
    else if (o.includeLocked) lock.push(a);
  }
  return act.concat(done, lock);
}

/** Kayıt biçimi (sözleşme §8): [{id,state,progress}] — kilitli olmayanlar. */
export function serializeQuests(p) {
  const out = [];
  for (let i = 0; i < QUESTS.length; i++) {
    const q = QUESTS[i];
    const s = questState(p, q);
    if (s === 'locked') continue;
    out.push({ id: q.id, state: s, progress: questProgress(p, q) });
  }
  return out;
}

/** Kayıttan yükle: yalnızca bilinen kimliklerin 'done' girdileri güvenilir (açık görevler yeniden hesaplanır). */
export function restoreQuests(p, arr) {
  p.questsDone = {};
  p._qSeen = {};
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (let i = 0; i < arr.length && i < 400; i++) {
    const e = arr[i];
    if (e && typeof e === 'object' && e.state === 'done' && typeof e.id === 'string' && QUEST_BY_ID[e.id]) {
      p.questsDone[e.id] = true;
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------------------------------------
 * Bağlamsal ipucu
 * ctx: {hp, maxHp, hunger, isNight, light(0..15), underground, inventory:{count(key)}, zone, puzzleHint}
 * ---------------------------------------------------------------------------------------------- */
const FOOD_KEYS = [
  'item:elma', 'item:çilek', 'item:havuç', 'item:pişmiş_patates', 'item:pişmiş_tavuk', 'item:pişmiş_koyun_eti',
  'item:pişmiş_balık', 'item:mantar_çorbası', 'item:meyve_salatası', 'item:altın_elma',
];

function hasAny(inv, keys) {
  if (!inv || typeof inv.count !== 'function') return false;
  for (let i = 0; i < keys.length; i++) if (inv.count(keys[i]) > 0) return true;
  return false;
}

export function getHintInfo(p, ctx) {
  const c = ctx || {};
  const inv = c.inventory;
  if (c.maxHp > 0 && c.hp > 0 && c.hp <= c.maxHp * 0.3) {
    return {
      key: 'düşük_can',
      text: hasAny(inv, ['item:şifa_iksiri'])
        ? 'Canın azaldı: şifa iksirini kullan ya da güvenli bir yere çekil.'
        : 'Canın azaldı: yaratıklardan uzaklaş, yemek ye ve dinlen.',
    };
  }
  if (c.hunger !== undefined && c.hunger <= 6) {
    return {
      key: 'aç',
      text: hasAny(inv, FOOD_KEYS)
        ? 'Karnın acıktı: yiyeceği seç ve sağ tıkla.'
        : 'Karnın acıktı: elma topla, hayvan avla ve etleri ocakta pişir.',
    };
  }
  const noTorch = inv && typeof inv.count === 'function' ? inv.count('blok:meşale') === 0 : false;
  // ilk akşamlar: karanlık basmadan nazik uyarı (gün batımının ilk dakikası, ilk iki gün)
  if (c.dusk && noTorch && !c.underground) {
    return { key: 'gece_geliyor', text: 'Gece geliyor: meşale yap, barınak kur veya yatağa uzan.' };
  }
  if (c.isNight && noTorch && !c.underground) {
    return { key: 'gece', text: 'Gece oldu: meşale yap, bir sığınak kur ya da yatakla sabaha geç.' };
  }
  if (c.underground && c.light !== undefined && c.light <= 3 && noTorch) {
    return { key: 'karanlık', text: 'Burası çok karanlık: meşale yerleştir; yaratıklar ışıktan kaçar.' };
  }
  if (c.puzzleHint) return { key: 'bulmaca', text: String(c.puzzleHint) };
  const q = getActiveQuest(p);
  if (q) return { key: 'görev:' + q.id, text: q.hint };
  return null;
}

export function getHint(p, ctx) {
  const h = getHintInfo(p, ctx);
  return h ? h.text : null;
}
