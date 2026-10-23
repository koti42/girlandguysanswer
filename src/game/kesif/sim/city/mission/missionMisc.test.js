import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getCityPlan } from '../cityPlan.js';
import { citySeed } from '../cityPlanTestKit.js';
import { roadNet } from '../roadNet.js';
import { ensureCityState } from '../cityState.js';
import { VEHICLE_CLASSES } from '../vehicle/vehicleData.js';
import { CAL, estimateBotTime, isTimeValid, medalFor, nextTarget, raceMedals } from './medals.js';
import {
  COUNTDOWN, START_SPEED, STAGE_R, raceGates, raceListRow, raceName, raceRunDef, stagingState,
} from './races.js';
import { applyRaceResult, bestMedal, raceBest, recordRoof } from './results.js';
import { createRun, RUN_STATUS, validateDef } from './run.js';
import {
  fmtClock, fmtDist, fmtTime, stencilName, colorName, STORY_FRAGMENTS,
} from './missionData.js';
import { PALETTE, STENCIL_NAMES, CAPS, createDiscoveryFx } from '../../../render/city/discoveryFx.js';

describe('medals', () => {
  it('eşikler 1,08 / 1,12 / 1,25 × betik süresi; geçerlilik alt sınırı altının %80\'i; madalya sınıflandırma', () => {
    const seed = citySeed(1);
    const net = roadNet(seed);
    const race = getCityPlan(seed).races[0];
    const m = raceMedals(net, race, 'taksi');
    expect(raceMedals(net, race, 'taksi')).toBe(m);
    expect(m.gold).toBeCloseTo(m.bot * 1.08, 0);
    expect(m.silver).toBeCloseTo(m.bot * 1.12, 0);
    expect(m.bronze).toBeCloseTo(m.bot * 1.25, 0);
    expect(m.minValid).toBeCloseTo(m.gold * 0.8, 0);
    expect(m.gold).toBeLessThan(m.silver);
    expect(m.silver).toBeLessThan(m.bronze);
    expect(medalFor(m.gold, m)).toBe(3);
    expect(medalFor(m.gold + 0.2, m)).toBe(2);
    expect(medalFor(m.silver + 0.2, m)).toBe(1);
    expect(medalFor(m.bronze + 0.2, m)).toBe(0);
    expect(medalFor(m.minValid - 0.5, m)).toBe(-1);
    expect(isTimeValid(m.minValid, m)).toBe(true);
    expect(isTimeValid(NaN, m)).toBe(false);
    expect(isTimeValid(5, null)).toBe(false);
    expect(nextTarget(m.bronze + 5, m)).toEqual({ medal: 1, time: m.bronze });
    expect(nextTarget(m.gold + 0.1, m).medal).toBe(3);
    expect(nextTarget(m.gold - 1, m)).toBeNull();
    expect(estimateBotTime(net, race, 'bilinmez')).toBeNull();
    expect(Object.keys(CAL).sort()).toEqual(VEHICLE_CLASSES.slice().sort());
  });

  it('8 yarış × 6 sınıf: süreler sonlu ve sınıf hızıyla makul sıralı (hoverbike/spor ≤ kamyonet); 3 tohumda belirlenimli', () => {
    [2, 9, 40].forEach((i) => {
      const seed = citySeed(i);
      const net = roadNet(seed);
      const plan = getCityPlan(seed);
      plan.races.forEach((race) => {
        const t = {};
        VEHICLE_CLASSES.forEach((c) => {
          const m = raceMedals(net, race, c);
          expect(Number.isFinite(m.bot) && m.bot > 10, race.key + ' ' + c).toBe(true);
          t[c] = m.bot;
        });
        expect(t.spor).toBeLessThanOrEqual(t.kamyonet);
        expect(t.hoverbike).toBeLessThanOrEqual(t.kamyonet);
        expect(estimateBotTime(net, race, 'spor')).toBe(estimateBotTime(net, race, 'spor'));
      });
    });
  });
});

describe('races', () => {
  const seed = citySeed(3);
  const plan = getCityPlan(seed);
  const net = roadNet(seed);

  it('koşucu tanımı geçerli; kapılar bot ile aynı sıra (1..G−1 + kapalı pistte 0); tur sayısı; cls kilitli; en kısa süre = minValid', () => {
    plan.races.forEach((race) => {
      const med = raceMedals(net, race, 'spor');
      const def = raceRunDef(race, 'spor', med);
      expect(validateDef(def)).toBeNull();
      expect(def.cls).toBe('spor');
      expect(def.noTeleport).toBe(true);
      expect(def.minTime).toBe(med.minValid);
      expect(def.limit).toBe(Math.ceil(med.bronze * 2));
      const gates = raceGates(race);
      expect(gates).toHaveLength(race.closed ? race.gates.length : race.gates.length - 1);
      expect(gates[0].x).toBe(race.gates[1].x);
      if (race.closed) expect(gates[gates.length - 1].x).toBe(race.gates[0].x);
      const run = createRun(def);
      run.start();
      expect(run.total).toBe(gates.length * race.laps);
    });
  });

  it('hazırlık durum makinesi: uzak → hazır → 3 sn geri sayım → başla; hareket ederse sıfırlanır; çok uzaklaşınca uzak', () => {
    const race = plan.races[6];
    const g = race.gates[0];
    const st = { t: 0, wasNear: false };
    const at = (d) => ({ x: g.x + d, z: g.z });
    expect(stagingState(race, at(100), 0, st, 0.1)).toBe('uzak');
    expect(stagingState(race, at(STAGE_R - 1), START_SPEED + 5, st, 0.1)).toBe('hazir');
    let s = '';
    for (let i = 0; i < 12; i++) s = stagingState(race, at(STAGE_R - 1), 0.5, st, 0.1);
    expect(s).toBe('geri_sayim');
    expect(st.t).toBeCloseTo(1.2, 5);
    expect(stagingState(race, at(STAGE_R - 1), START_SPEED + 1, st, 0.1)).toBe('hazir');
    expect(st.t).toBe(0);
    for (let i = 0; i < Math.ceil(COUNTDOWN / 0.1) + 1; i++) s = stagingState(race, at(2), 0, st, 0.1);
    expect(s).toBe('basla');
    expect(stagingState(race, at(500), 0, st, 0.1)).toBe('uzak');
    expect(st.t).toBe(0);
  });

  it('liste satırı: en iyi süre sınıfa göre, madalya tüm sınıflardan en iyisi; ad tablosu', () => {
    const race = plan.races[1];
    const city = ensureCityState({});
    const med = raceMedals(net, race, 'spor');
    applyRaceResult(city, race.id, 'spor', med.gold, med);
    applyRaceResult(city, race.id, 'taksi', raceMedals(net, race, 'taksi').bronze, raceMedals(net, race, 'taksi'));
    const row = raceListRow(race, city, 'spor', med);
    expect(row.name).toBe(raceName(race.id));
    expect(row.medal).toBe(3);
    expect(row.best).toBeCloseTo(med.gold, 0);
    expect(row.bestText).toMatch(/^\d+:\d\d\.\d$/);
    expect(row.done).toBe(2);
    expect(raceListRow(race, city, 'motor', null).best).toBe(0);
    expect(raceListRow(plan.races[4], city, 'spor', med).medal).toBe(0);
  });
});

describe('results', () => {
  const seed = citySeed(4);
  const net = roadNet(seed);
  const race = getCityPlan(seed).races[2];
  const med = raceMedals(net, race, 'taksi');

  it('geçerli bitiş: en iyi süre/madalya kaydı, sayaçlar, ilk madalya tam ödül; aynı madalya tekrar %25', () => {
    const c = ensureCityState({});
    const r1 = applyRaceResult(c, race.id, 'taksi', med.bronze - 0.1, med);
    expect(r1.valid).toBe(true);
    expect(r1.medal).toBe(1);
    expect(r1.medalUp).toBe(true);
    expect(r1.kredi).toBe(40);
    expect(c.stats.racesDone).toBe(1);
    expect(c.stats.racesWon).toBe(1);
    expect(c.stats.rmask).toBe(1 << race.id);
    const r2 = applyRaceResult(c, race.id, 'taksi', med.bronze - 0.5, med);
    expect(r2.medalUp).toBe(false);
    expect(r2.kredi).toBe(10);
    expect(r2.best).toBe(true);
    expect(raceBest(c, race.id, 'taksi').t).toBeCloseTo(med.bronze - 0.5, 0);
    const r3 = applyRaceResult(c, race.id, 'taksi', med.gold - 0.1, med);
    expect(r3.gold).toBe(true);
    expect(r3.kredi).toBe(120);
    expect(c.stats.goldMedals).toBe(1);
    expect(c.stats.gmask).toBe(1 << race.id);
    expect(bestMedal(c, race.id)).toBe(3);
    // kötü süre en iyiyi bozmaz
    applyRaceResult(c, race.id, 'taksi', med.bronze + 30, med);
    expect(raceBest(c, race.id, 'taksi').medal).toBe(3);
    expect(c.runs[race.id].n).toBe(4);
  });

  it('geçersiz süre (0,8×altın altı) kaydedilmez, ödül yok, sayaç artmaz', () => {
    const c = ensureCityState({});
    const r = applyRaceResult(c, race.id, 'taksi', med.gold * 0.5, med);
    expect(r.valid).toBe(false);
    expect(r.kredi).toBe(0);
    expect(c.stats.racesDone || 0).toBe(0);
    expect(c.runs[race.id]).toBeUndefined();
    expect(applyRaceResult(c, race.id, 'taksi', NaN, med).valid).toBe(false);
  });

  it('çatı parkuru: her rota bir kez', () => {
    const c = ensureCityState({});
    expect(recordRoof(c, 3)).toBe(true);
    expect(recordRoof(c, 3)).toBe(false);
    expect(recordRoof(c, 5)).toBe(true);
    expect(c.stats.rfmask).toBe((1 << 3) | (1 << 5));
  });
});

describe('missionData biçimleri', () => {
  it('süre/mesafe/kalıp adları', () => {
    expect(fmtTime(83.46)).toBe('1:23.4');
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtDist(999)).toBe('999 m');
    expect(fmtDist(1500)).toBe('1,5 km');
    expect(stencilName(2)).toBe('Robot');
    expect(stencilName(-1)).toBe('Dalga');
    expect(colorName(9)).toBe('Turuncu');
    expect(STORY_FRAGMENTS).toHaveLength(24);
  });
});

describe('discoveryFx (düğüm: GL yok)', () => {
  it('4 çizim çağrısı: çip/grafiti/halka örnekli ağlar + ışın; kapasite kademeleri; setChips/Decals/Rings/Beam sayaçları', () => {
    const fx = createDiscoveryFx({ THREE, quality: 'high' });
    expect(fx.group.children).toHaveLength(4);
    expect(fx.stats.draws).toBe(4);
    expect(CAPS.low.chips).toBeLessThan(CAPS.high.chips);
    const chips = Array.from({ length: 80 }, (_, i) => ({ x: i, y: 64, z: 0, hot: i % 2 === 0 }));
    fx.setChips(chips, chips.length);
    expect(fx.stats.chips).toBe(64); // yüksek kademe tavanı
    fx.setQuality('low');
    fx.setChips(chips, chips.length);
    expect(fx.stats.chips).toBe(32);
    const decals = Array.from({ length: 95 }, (_, i) => ({
      cx: i, cy: 66, cz: 0, yaw: 0.5, w: 6, h: 4, design: i, color: i,
    }));
    fx.setDecals(decals, decals.length);
    expect(fx.stats.decals).toBe(60);
    fx.setRings([{ x: 0, y: 64, z: 0, r: 7, nx: 0, nz: 1, role: 'sonraki' }, { x: 0, y: 64, z: 0, r: 7, nx: 1, nz: 0, role: 'hedef' }], 2);
    expect(fx.stats.rings).toBe(2);
    fx.setBeam({ x: 1, y: 64, z: 1, r: 7 });
    expect(fx.beamMesh.visible).toBe(true);
    fx.setBeam(null);
    expect(fx.beamMesh.visible).toBe(false);
    fx.update(0.016, { night: 0.5, reduced: false });
    fx.update(0.016, { night: 0.5, reduced: true });
    // NaN güvenli
    fx.update(NaN, { night: NaN });
    expect(Number.isFinite(fx.chipMesh.instanceMatrix.array[12])).toBe(true);
    expect(PALETTE).toHaveLength(8);
    expect(STENCIL_NAMES).toHaveLength(6);
    fx.dispose();
  });

  it('çip örneği matrisleri konumu taşır; indirgenmiş harekette bobbing yok (yükseklik sabit)', () => {
    const fx = createDiscoveryFx({ THREE, quality: 'high', reducedMotion: true });
    fx.setChips([{ x: 10, y: 64, z: 20, hot: false }], 1);
    fx.update(0.5, { night: 0 });
    const m = fx.chipMesh.instanceMatrix.array;
    const y0 = m[13];
    expect(m[12]).toBeCloseTo(10, 3);
    expect(m[14]).toBeCloseTo(20, 3);
    fx.update(0.5, { night: 0 });
    expect(fx.chipMesh.instanceMatrix.array[13]).toBeCloseTo(y0, 6);
    const fx2 = createDiscoveryFx({ THREE, quality: 'high' });
    fx2.setChips([{ x: 10, y: 64, z: 20, hot: false }], 1);
    fx2.update(0.3, { night: 0 });
    const a = fx2.chipMesh.instanceMatrix.array[13];
    fx2.update(0.3, { night: 0 });
    expect(fx2.chipMesh.instanceMatrix.array[13]).not.toBeCloseTo(a, 6);
    expect(RUN_STATUS.DONE).toBe('done');
    fx.dispose();
    fx2.dispose();
  });
});
