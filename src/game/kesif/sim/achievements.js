/*
 * KEŞİF sim — başarım değerlendirme (saf). Veri: achievementsData.js; ölçütler: progressionMetrics.
 *
 *   checkAchievements(p) → [yeni açılan tanım]   (p.achievements dizisine ekler; zincirleme "başarım sayısı" ölçütü dahil)
 *   achievementValue(p, a) → sayı      achievementProgressText(p, a) → '37/100 blok'
 *   getAchievementList(p) → [{id,title,desc,icon,done,progress,target,progressText,hidden,unit}]
 *   restoreAchievements(p, arr) → sayı (bilinmeyen kimlikler atılır)
 */
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from './achievementsData.js';
import { scalarMetric } from './progressionMetrics.js';

export { ACHIEVEMENTS, ACHIEVEMENT_BY_ID };

function doneSet(p) {
  if (!p._achSet || p._achSet.size !== p.achievements.length) {
    p._achSet = new Set(p.achievements);
  }
  return p._achSet;
}

export function achievementValue(p, a) {
  const v = scalarMetric(p, a.metric);
  return v < 0 ? 0 : v;
}

export function isAchievementDone(p, id) {
  return doneSet(p).has(id);
}

export function checkAchievements(p) {
  const fresh = [];
  const set = doneSet(p);
  for (let pass = 0; pass < 4; pass++) {
    let any = false;
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      if (set.has(a.id)) continue;
      if (achievementValue(p, a) >= a.target) {
        p.achievements.push(a.id);
        set.add(a.id);
        fresh.push(a);
        any = true;
      }
    }
    if (!any) break;
  }
  return fresh;
}

export function achievementProgressText(p, a) {
  const done = isAchievementDone(p, a.id);
  const v = done ? a.target : Math.min(a.target, Math.floor(achievementValue(p, a)));
  return v + '/' + a.target + (a.unit ? ' ' + a.unit : '');
}

export function getAchievementList(p) {
  const out = [];
  for (let i = 0; i < ACHIEVEMENTS.length; i++) {
    const a = ACHIEVEMENTS[i];
    const done = isAchievementDone(p, a.id);
    const secret = a.hidden && !done;
    out.push({
      id: a.id,
      title: secret ? '???' : a.title,
      desc: secret ? 'Gizli başarım: keşfettikçe açılır.' : a.desc,
      icon: secret ? 'yildiz' : a.icon,
      done,
      progress: done ? a.target : Math.min(a.target, Math.floor(achievementValue(p, a))),
      target: a.target,
      progressText: secret ? '' : achievementProgressText(p, a),
      hidden: secret,
      unit: a.unit,
    });
  }
  return out;
}

export function restoreAchievements(p, arr) {
  p.achievements = [];
  p._achSet = null;
  if (!Array.isArray(arr)) return 0;
  const seen = new Set();
  for (let i = 0; i < arr.length && i < 400; i++) {
    const id = arr[i];
    if (typeof id === 'string' && ACHIEVEMENT_BY_ID[id] && !seen.has(id)) {
      seen.add(id);
      p.achievements.push(id);
    }
  }
  return p.achievements.length;
}
