/*
 * KEŞİF sim/city/ped — YAYA TEST KİTİ (yalnız testler/ölçümler içe aktarır). Bağımsız (kaba kuvvet) engel denetleyicisi + kalabalık kurucu.
 *
 *   makeCrowd(seed, o) → {nav, probe, crowd, tn}         o {quality, phase, rain, px, pz, time, probe}
 *   refChecker(seed) → {check(p, nav) → '' | hata metni}     yayanın konumu: yürünebilir yüzey, bina ayak izi/prop kutusu içinde değil, asfaltta yalnız zebra kenarında
 *   runChecked(crowd, checker, seconds, onTick?) → {violations[], ticks}
 */
import { pedNav, EK } from './pedNav.js';
import { planProbe } from './pedProbe.js';
import { createCrowd } from './crowd.js';
import { trafficNet } from '../vehicle/junctions.js';
import { pedSignalInfo } from '../vehicle/trafficLights.js';
import { getCityPlan } from '../cityPlan.js';
import { SURF, surfaceAt } from '../cityRoads.js';
import { footprintOf, lotAt } from '../cityLots.js';
import { ARCHETYPES } from '../archetypes.js';
import { propsForChunk } from '../../props/propPlan.js';
import { PROP_BY_T, worldBoxes } from '../../props/propDefs.js';

export function makeCrowd(seed, o) {
  const opt = o || {};
  const nav = pedNav(seed);
  const probe = opt.probe || planProbe(seed);
  const tn = trafficNet(seed);
  const crowd = createCrowd(nav, { seed, quality: opt.quality || 'high', probe });
  crowd.setSignals((j, a, t, out) => {
    const J = tn.junctions[j];
    return J ? pedSignalInfo(J.plan, a, t, out) : null;
  });
  crowd.setTime(opt.time === undefined ? 1000 + (seed % 97) : opt.time);
  crowd.setEnv({ phase: opt.phase === undefined ? 0.6 : opt.phase, rain: opt.rain || 0 });
  crowd.setPlayer(opt.px === undefined ? 240 : opt.px, 64, opt.pz === undefined ? 80 : opt.pz, 0, 0, 0, false);
  return { nav, probe, crowd, tn };
}

export function refChecker(seed) {
  const plan = getCityPlan(seed);
  const cache = new Map();
  const boxes = (cx, cz) => {
    const k = (cx + 4096) * 8192 + (cz + 4096);
    let v = cache.get(k);
    if (!v) {
      v = [];
      const props = propsForChunk(seed, cx, cz, { lamps: true });
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        const d = PROP_BY_T[p.t];
        if (!d || !d.colliders.length) continue;
        const bx = worldBoxes(d, p.x, p.y, p.z, p.yaw, []);
        for (let q = 0; q < bx.length; q++) if (bx[q][1] < 65.7 && bx[q][4] > 64.15) v.push(bx[q]);
      }
      if (cache.size > 200) cache.clear();
      cache.set(k, v);
    }
    return v;
  };
  const R = 0.2;
  return {
    check(p, nav) {
      if (!Number.isFinite(p.x + p.z + p.yaw)) return 'NaN';
      const onCross = p.e >= 0 && nav.ekind[p.e] === EK.CROSS;
      const cx0 = Math.floor(p.x - R);
      const cx1 = Math.floor(p.x + R);
      const cz0 = Math.floor(p.z - R);
      const cz1 = Math.floor(p.z + R);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const s = surfaceAt(plan.roads, cx, cz);
          if (s === SURF.WATER || s === SURF.EDGE || s === SURF.QUAY) return 'su/kenar ' + s;
          if (s === SURF.ASPHALT || s === SURF.LANE_X || s === SURF.LANE_Z || s === SURF.ZEBRA_X || s === SURF.ZEBRA_Z) {
            if (!onCross) return 'asfaltta yaya (geçit dışı)';
          }
          if (s === SURF.GROUND || s === SURF.PLAZA || s === SURF.PARK) {
            const l = lotAt(plan, cx, cz);
            if (l) {
              const A0 = ARCHETYPES[l.archetype];
              if (A0 && (A0.building || A0.special)) {
                const fp = footprintOf(l);
                if (fp && cx >= fp.x0 && cx < fp.x1 && cz >= fp.z0 && cz < fp.z1) return 'bina içinde';
              }
            }
          }
        }
      }
      for (let bx = Math.floor((p.x - R) / 16); bx <= Math.floor((p.x + R) / 16); bx++) {
        for (let bz = Math.floor((p.z - R) / 16); bz <= Math.floor((p.z + R) / 16); bz++) {
          const list = boxes(bx, bz);
          for (let i = 0; i < list.length; i++) {
            const b = list[i];
            if (b[0] < p.x + R && b[3] > p.x - R && b[2] < p.z + R && b[5] > p.z - R) return 'prop içinde';
          }
        }
      }
      return '';
    },
  };
}

export function runChecked(crowd, checker, seconds, onTick) {
  const nav = crowd.nav;
  const v = [];
  const ticks = Math.round(seconds * 20);
  for (let i = 0; i < ticks; i++) {
    crowd.step(0.05);
    for (let k = 0; k < crowd.peds.length; k++) {
      const p = crowd.peds[k];
      if (!p.alive) continue;
      const r = checker.check(p, nav);
      if (r && v.length < 20) v.push({ tick: i, ped: p.id, x: p.x, z: p.z, state: p.state, why: r });
    }
    if (onTick) onTick(i, crowd);
  }
  return { violations: v, ticks };
}
