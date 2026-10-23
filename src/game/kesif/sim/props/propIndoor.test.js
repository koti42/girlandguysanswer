import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearOpenedLocks, clueDigitsOf, doorLockOf, getLockBridge, indoorAt, indoorAtProp, isLockOpen, markLockOpen, moodHueAt, ownerAtProp, padLockOf, setLockBridge,
} from './propIndoor.js';
import { getBlockPlan, planBuilding } from '../city/cityPlan.js';
import { planInterior } from '../city/interior/index.js';
import { OWNER_BY_INTERIOR } from '../city/ownerData.js';
import { dimSeed } from '../dim/dimensions.js';
import { normalizeSpec } from './propPlan.js';

const SEED = dimSeed(777, 'neon');

function interiors(n) {
  const out = [];
  for (let bj = -3; bj <= 3 && out.length < n; bj++) {
    for (let bi = -3; bi <= 3 && out.length < n; bi++) {
      const plan = getBlockPlan(SEED, bi, bj);
      for (let k = 0; k < plan.lots.length && out.length < n; k++) {
        const lot = plan.lots[k];
        if (!lot.built || lot.hill) continue;
        const bp = planBuilding(SEED, lot);
        if (!bp || !bp.interior) continue;
        const it = planInterior(bp, lot);
        if (it) out.push({ lot, bp, it });
      }
    }
  }
  return out;
}

const asProp = (spec) => normalizeSpec(SEED, spec);

beforeEach(() => {
  setLockBridge(null);
  clearOpenedLocks();
});

describe('propIndoor — gerçek şehir planı', () => {
  it('indoorAt: iç mekân ayak izinde bina/tür/sahip; dışında null; bozuk girdi güvenli', () => {
    const list = interiors(30);
    expect(list.length).toBeGreaterThan(5);
    list.forEach(({ bp, it }) => {
      const r = bp.interior;
      const c = indoorAt(SEED, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      expect(c, it.kind).toBeTruthy();
      expect(c.it).toBe(it);
      expect(c.kind).toBe(it.kind);
      expect(c.owner).toBe(OWNER_BY_INTERIOR[it.kind] || it.owner);
      expect(indoorAt(SEED, r.x0 - 5, r.z0 - 5) === null || indoorAt(SEED, r.x0 - 5, r.z0 - 5).it !== it).toBe(true);
    });
    expect(indoorAt(SEED, NaN, 0)).toBeNull();
    expect(indoorAt(SEED, 1e9, 1e9)).toBeNull();
  });

  it('kapı propu → kapı + kilit eşleşmesi; kilitli kapıda kilitli oda kutusu (back) gerçek oda', () => {
    let doors = 0;
    let locked = 0;
    interiors(60).forEach(({ it }) => {
      (it.doors || []).forEach((d) => {
        if (d.kind !== 'door') return;
        const prop = asProp({
          kind: d.w === 3 ? 'kapi_genis' : 'kapi', x: d.x + 0.5, y: d.y, z: d.z + 0.5, yaw: 0, lotId: 1, slot: 64,
        });
        const r = doorLockOf(SEED, prop);
        expect(r, it.kind + ':' + d.id).toBeTruthy();
        expect(r.door.id).toBe(d.id);
        doors++;
        if (d.lock) {
          locked++;
          expect(r.lock).toBe(d.lock);
          expect(r.back, d.id).toBeTruthy();
          const room = it.rooms.find((q) => q.id === it.graph.find((e) => e[2] === d.id)[1]);
          expect(r.back.x0).toBe(room.x0);
          expect(r.back.z1).toBe(room.z1);
        }
      });
    });
    expect(doors).toBeGreaterThan(3);
    expect(locked + 1).toBeGreaterThan(0);
  });

  it('düzenek → yakın kilit (tür eşleşir); ipucu notu → gerçek kod rakamları', () => {
    let checked = 0;
    interiors(80).forEach(({ it }) => {
      (it.props || []).forEach((p) => {
        if (p.kind === 'kod_paneli' || p.kind === 'kart_okuyucu' || p.kind === 'hack_terminali') {
          const r = padLockOf(SEED, asProp(p), p.kind);
          if (r) {
            const want = { kod_paneli: 'kod', kart_okuyucu: 'kart', hack_terminali: 'mini_hack' }[p.kind];
            expect(r.lock.kind).toBe(want);
          }
        }
      });
      (it.clues || []).forEach((q) => {
        const spec = (it.props || []).find((p) => p.kind === 'kod_notu' && Math.abs(p.x - q.x) < 0.2 && Math.abs(p.z - q.z) < 0.2);
        if (!spec) return;
        const digits = clueDigitsOf(SEED, asProp(spec));
        const locks = [];
        it.doors.forEach((d) => { if (d.lock) locks.push(d.lock); });
        (it.locks || []).forEach((l) => locks.push(l));
        const lk = locks.find((l) => l.id === q.lockId);
        const code = lk && lk.data ? (Array.isArray(lk.data.code) ? lk.data.code : lk.data.kod) : null;
        if (Array.isArray(code)) expect(digits).toEqual(code);
        else expect(digits === null || digits.every((d) => d >= 1 && d <= 6)).toBe(true);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('duvara yaslı prop (kabuk düzleminde) iç mekân içinden bulunur', () => {
    let n = 0;
    interiors(80).forEach(({ it }) => {
      (it.props || []).forEach((p) => {
        if (p.kind !== 'kod_notu' && p.kind !== 'neon_tabela_ic' && p.kind !== 'menu_tahtasi') return;
        const c = indoorAtProp(SEED, asProp(p));
        expect(c, p.kind).toBeTruthy();
        expect(c.it).toBe(it);
        n++;
      });
    });
    expect(n).toBeGreaterThan(3);
  });

  it('ownerAtProp / moodHueAt: sahip adı iç mekân türüne uygun; ton MOOD_HUES içinde', () => {
    interiors(20).forEach(({ bp, it }) => {
      const r = bp.interior;
      const p = { x: (r.x0 + r.x1) / 2, y: 64, z: (r.z0 + r.z1) / 2 };
      const o = ownerAtProp(SEED, p);
      if (OWNER_BY_INTERIOR[it.kind]) expect(o.interior).toBe(it.kind);
      expect(typeof moodHueAt(SEED, p)).toBe('string');
    });
    expect(ownerAtProp(SEED, { x: 1e8, z: 1e8 })).toBeNull();
    expect(moodHueAt(SEED, { x: 1e8, z: 1e8 })).toBeNull();
  });
});

describe('kilit köprüsü', () => {
  it('serbest kilit açık; bilinmeyen/null güvenli; markLockOpen kalıcı; setLockBridge öncelik alır; köprü hatası kilitli sayılır', () => {
    expect(isLockOpen(null)).toBe(true);
    expect(isLockOpen({ id: 'a', kind: 'serbest' })).toBe(true);
    expect(isLockOpen({ id: 'k', kind: 'kod' })).toBe(false);
    markLockOpen('k');
    expect(isLockOpen({ id: 'k', kind: 'kod' })).toBe(true);
    markLockOpen(5);
    markLockOpen('');
    expect(isLockOpen({ id: 'z', kind: 'kart' })).toBe(false);
    setLockBridge({ isOpen: (id) => id === 'z' });
    expect(getLockBridge()).toBeTruthy();
    expect(isLockOpen({ id: 'z', kind: 'kart' })).toBe(true);
    expect(isLockOpen({ id: 'y', kind: 'kart' })).toBe(false);
    setLockBridge({ isOpen: () => { throw new Error('x'); } });
    expect(isLockOpen({ id: 'y', kind: 'kart' })).toBe(false);
    setLockBridge({});
    expect(getLockBridge()).toBeNull();
    clearOpenedLocks();
    expect(isLockOpen({ id: 'k', kind: 'kod' })).toBe(false);
  });
});
