/*
 * KEŞİF sim/city/mission — GÖREV SONUÇLARI: yarış ve iş bitince şehir durumunu (Kredi, istatistik, en iyiler, tekrar bozunumu) güncelleyen SAF dönüşümler.
 * Kredi şehir-yereldir (jetona çevrilmez); jeton yalnız cityEvents.evaluateClaims → sunucu. Girdi `city` canlı blob (ensureCityState uygulanmış olmalı).
 *
 *   applyRaceResult(city, raceId, cls, time, medals) → {valid, medal, kredi, best, bestTime, medalUp, gold, first}
 *       medals: medals.raceMedals(...) ({gold, silver, bronze, minValid}); süre minValid altı → valid=false (kayda geçmez, ödül yok)
 *       en iyi süre sınıf başına (runs[id].b[cls] = [0,1 sn × 10, madalya]); ödül: madalya basamağı ilk kez yükseldiyse tam, aksi hâlde %25
 *   applyJobResult(city, job, info) → {kredi, items, decay, fast}      info {t, limit, bumps, nowSec}
 *       ödül: jobs.jobReward (hız çarpanı × tekrar bozunumu); jobsDone/courierDone/taxiDone/podDone/fixDone/fastJobs; jobs.log (son 10 dk)
 *   recordRoof(city, routeIdx) → bool (yeni mi)         bit maskesi rfmask
 *   bestMedal(city, raceId) → 0..3                       raceBest(city, raceId, cls) → {t, medal} | null
 */
import { ensureCityState, statAdd, statBit } from '../cityState.js';
import { KREDI } from './missionData.js';
import { medalFor } from './medals.js';
import {
  jobReward, pushLog, repeatDecay,
} from './jobs.js';

export function bestMedal(city, raceId) {
  const r = city && city.runs ? city.runs[raceId] : null;
  let m = 0;
  if (r && r.b) Object.keys(r.b).forEach((c) => { if (r.b[c][1] > m) m = r.b[c][1]; });
  return m;
}

export function raceBest(city, raceId, cls) {
  const r = city && city.runs ? city.runs[raceId] : null;
  const e = r && r.b ? r.b[cls] : null;
  return e ? { t: e[0] / 10, medal: e[1] } : null;
}

export function applyRaceResult(cityIn, raceId, cls, time, medals) {
  const city = ensureCityState(cityIn);
  const medal = medalFor(time, medals);
  const out = {
    valid: medal >= 0, medal: Math.max(0, medal), kredi: 0, best: false, bestTime: 0, medalUp: false, gold: false, first: false,
  };
  if (!out.valid) return out;
  const prevBest = bestMedal(city, raceId);
  if (!city.runs[raceId]) city.runs[raceId] = { n: 0, b: {} };
  const run = city.runs[raceId];
  run.n = Math.min(100000, run.n + 1);
  const ds = Math.max(1, Math.round(time * 10));
  const cur = run.b[cls];
  if (!cur || ds < cur[0]) {
    run.b[cls] = [ds, Math.max(medal, cur ? cur[1] : 0)];
    out.best = true;
  } else if (medal > cur[1]) {
    cur[1] = medal;
  }
  out.bestTime = run.b[cls][0] / 10;
  out.first = run.n === 1;
  out.medalUp = medal > prevBest;
  statAdd(city, 'racesDone', 1);
  statBit(city, 'rmask', raceId);
  if (medal >= 1) statAdd(city, 'racesWon', 1);
  if (medal === 3) {
    out.gold = true;
    statAdd(city, 'goldMedals', 1);
    statBit(city, 'gmask', raceId);
  }
  const base = KREDI.race[medal] || 0;
  out.kredi = Math.round(base * (out.medalUp ? 1 : 0.25));
  return out;
}

export function applyJobResult(cityIn, job, info) {
  const city = ensureCityState(cityIn);
  const t = info && Number.isFinite(info.t) ? info.t : 0;
  const limit = info && Number.isFinite(info.limit) ? info.limit : 0;
  const nowSec = info && Number.isFinite(info.nowSec) ? info.nowSec : 0;
  const bumps = info && Number.isFinite(info.bumps) ? info.bumps : 0;
  const decay = repeatDecay(city.jobs.log, nowSec);
  const rew = jobReward(job, Math.max(0, limit - t), limit, decay, bumps);
  const fast = limit > 0 && (limit - t) / limit >= 0.7;
  city.jobs.done = Math.min(1000000, city.jobs.done + 1);
  city.jobs.earned = Math.min(1000000000, city.jobs.earned + rew.kredi);
  pushLog(city.jobs.log, nowSec);
  statAdd(city, 'jobsDone', 1);
  if (job.kind === 'taksi') statAdd(city, 'taxiDone', 1);
  else {
    statAdd(city, 'courierDone', 1);
    if (job.kind === 'pod') statAdd(city, 'podDone', 1);
    if (job.kind === 'tamir') statAdd(city, 'fixDone', 1);
  }
  if (fast) statAdd(city, 'fastJobs', 1);
  return {
    kredi: rew.kredi, items: rew.items, decay, fast,
  };
}

export function recordRoof(cityIn, routeIdx) {
  const city = ensureCityState(cityIn);
  return statBit(city, 'rfmask', routeIdx);
}
