/*
 * KEŞİF sim/city/mission — YARIŞLAR (8 pist × araç sınıfı). SAF, es2020. Pist/kapı verisi plan.races'tan (cityRaces); süre eşikleri medals.js. Yarış ailesi dostudur:
 * çarpışma cezası yok (yalnız yavaşlama; fizik çarpışmayı zaten sarsıntı olarak verir), hayalet (ghost) yok, rakip yok.
 *
 *   STAGE_R · START_SPEED · COUNTDOWN · STAGE_LEAVE_R
 *   raceName(id) · raceGates(race) → [{x,y,z,r}]     koşucu kapıları (bot ile aynı sıra: 1..G−1, kapalı pistte son kapı 0'a dönüş), tur sayısı race.laps
 *   raceRunDef(race, cls, medals) → run tanımı (kind 'race', cls kilitli, noTeleport, minTime = minValid, limit = 2×bronz)
 *   stagingState(race, pos, speed, st, dt) → 'uzak' | 'hazir' | 'geri_sayim' | 'basla'      (başlangıç kapısı yakınında dururken 3 sn geri sayım; hareket ederse sıfırlanır)
 *   raceListRow(race, city, cls, medals) → arayüz satırı {id, name, kind, laps, gates, length, best, medal, targets}
 */
import { RACE_NAMES } from '../cityNames.js';
import { fmtTime } from './missionData.js';
import { gatesStep } from './run.js';

export const STAGE_R = 24;
export const STAGE_LEAVE_R = 34;
export const START_SPEED = 3;
export const COUNTDOWN = 3;

export function raceName(id) {
  return RACE_NAMES[id] || 'Yarış';
}

export function raceGates(race) {
  const out = [];
  const G = race.gates.length;
  const g = (q) => ({
    x: q.x, y: q.y, z: q.z, r: q.r,
  });
  for (let k = 1; k < G; k++) out.push(g(race.gates[k]));
  if (race.closed) out.push(g(race.gates[0]));
  return out;
}

export function raceRunDef(race, cls, medals) {
  const gates = raceGates(race);
  return {
    id: 'race_' + race.id,
    kind: 'race',
    title: raceName(race.id),
    steps: [gatesStep(race.laps > 1 ? 'Kapıları geç (' + race.laps + ' tur)' : 'Kapıları geç', gates, race.laps)],
    limit: medals ? Math.ceil(medals.bronze * 2) : 0,
    minTime: medals ? medals.minValid : 0,
    cls,
    noTeleport: true,
    meta: { race: race.id, laps: race.laps, closed: race.closed },
  };
}

/**
 * Başlangıç hazırlığı. st: {t (geri sayım sayacı)}. Dönen: durum.
 * 'uzak' kapıya >STAGE_R · 'hazir' yakında ama hareketli · 'geri_sayim' yavaş ve kapıda (st.t artar) · 'basla' geri sayım bitti.
 */
export function stagingState(race, pos, speed, st, dt) {
  const g = race.gates[0];
  const d = Math.hypot(pos.x - g.x, pos.z - g.z);
  if (d > STAGE_LEAVE_R) {
    st.t = 0;
    return 'uzak';
  }
  if (d > STAGE_R) {
    st.t = 0;
    return st.wasNear ? 'hazir' : 'uzak';
  }
  st.wasNear = true;
  if (speed > START_SPEED) {
    st.t = 0;
    return 'hazir';
  }
  st.t += dt;
  return st.t >= COUNTDOWN ? 'basla' : 'geri_sayim';
}

export function raceListRow(race, city, cls, medals) {
  const r = city && city.runs ? city.runs[race.id] : null;
  const best = r && r.b && cls && r.b[cls] ? r.b[cls] : null;
  let bestMedal = 0;
  if (r && r.b) Object.keys(r.b).forEach((c) => { if (r.b[c][1] > bestMedal) bestMedal = r.b[c][1]; });
  return {
    id: race.id,
    name: raceName(race.id),
    kind: race.kind,
    laps: race.laps,
    gates: race.gates.length,
    length: Math.round(race.length * race.laps),
    best: best ? best[0] / 10 : 0,
    bestText: best ? fmtTime(best[0] / 10) : '',
    medal: bestMedal,
    targets: medals ? { gold: medals.gold, silver: medals.silver, bronze: medals.bronze } : null,
    done: r ? r.n : 0,
  };
}
