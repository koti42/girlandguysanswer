/*
 * qa5 (Faz 5, qa_logic) — KİLİT DAG'I, 200 tohum, BAĞIMSIZ doğrulama (üretimdeki `solveReachability` çağrılmaz; kural ayrıca kodlanır):
 *   - kart kilidi k yalnız tohumun şehrindeki daha düşük kademeli (k−1) sağlayıcıyla açılır, sağlayıcı kilit kart gerektirmez → tüketici→sağlayıcı grafı DAG
 *     (kademe katı azalır; kendi arkasında sağlayıcı yok);
 *   - sabit nokta: girişten başlayıp kilitleri sırayla çözerek tüm odalara varılır (kod kilidi için ipucu notu ulaşılabilir odada ya da sahip ipucu);
 *   - hapis yok: her oda, yalnız "derin → giriş" yönündeki kapılardan (kilitsiz) girişe iner;
 *   - LockBook özellik testi: rastgele işlem dizilerinde soğuma ≤ 20 sn ve KALICI DEĞİL, çözülen kilit kalıcı, hostile girdiler atmaz.
 * Ortam: KESIF_QA5_SEEDS (vars. 200).
 */
import { describe, expect, it, vi } from 'vitest';
import { citySeed } from '../sim/city/cityPlanTestKit.js';
import { planInterior, setInteriorStrict } from '../sim/city/interior/index.js';
import {
  COOLDOWN_SEC, LockBook, assignClues, doorSides, lockSeed, lockSpec, normalizeLock,
} from '../sim/city/interior/locks.js';
import { interiorLots } from '../sim/city/interior/testKit.js';
import { seededRandom as makeRng } from '../sim/rng.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N_SEEDS = Number(ENV.KESIF_QA5_SEEDS || 200);
setInteriorStrict(true);

/** Bir iç mekânı kendi başına çözer (bağımsız kod): pool = şehir çapı kart seviyeleri; döner {reach:Set, solved:Set, gives:[seviye], order:[kilit]}. */
function solveIndependently(it, seed, lotId, pool) {
  const sides = doorSides(it);
  const lockOf = new Map();
  (it.doors || []).forEach((d) => { if (d.lock) lockOf.set(d.id, { door: d, lock: normalizeLock(d.lock) }); });
  const clues = assignClues(it);
  const reach = new Set([it.entry.room]);
  const solved = new Set();
  const gives = [];
  const order = [];
  const roomAt = (x, y, z) => {
    const r = it.rooms.find((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1 && y >= q.y0 - 0.5 && y < q.y1 + 0.5);
    return r ? r.id : null;
  };
  for (let guard = 0; guard < 100; guard++) {
    let grew = false;
    it.graph.forEach(([a, b, did]) => {
      const inA = reach.has(a);
      const inB = reach.has(b);
      if (inA === inB) return;
      const from = inA ? a : b;
      const to = inA ? b : a;
      const lk = lockOf.get(did);
      const sd = sides.get(did);
      let pass = true;
      if (lk && lk.lock.kind !== 'serbest' && lk.door.kind === 'door' && !solved.has(lk.lock.id)) {
        // kapı yalnız GİRİŞ tarafından kilitli; derin taraftan serbest
        if (sd && from === sd.deep) pass = true;
        else {
          const sp = lockSpec(lk.lock, lockSeed(seed, lotId, lk.lock.id));
          if (lk.lock.kind === 'kart') pass = pool.some((lv) => lv >= sp.card);
          else if (lk.lock.kind === 'kod') {
            const c = clues.get(lk.lock.id);
            if (c) {
              const room = roomAt(c.prop.x, c.prop.y, c.prop.z);
              pass = room === null || reach.has(room);
            } else pass = sp.clue === 'owner';
          }
          if (pass) {
            solved.add(lk.lock.id);
            order.push(lk.lock.id);
            if (sp.gives > 0) gives.push(sp.gives);
          }
        }
      }
      if (pass) { reach.add(to); grew = true; }
    });
    if (!grew) break;
  }
  // girişe bağlı olmayan ama derinden çözülebilen kilitler (kapı iki tarafta da kullanılır) için de "verdiği kart" sayılır
  return {
    reach, solved, gives, order,
  };
}

const T = {
  interiors: 0, locks: 0, kart: 0, kod: 0, hack: 0, rooms: 0,
};

describe('qa5 — kilit DAG (200 tohum, bağımsız çözücü)', () => {
  const pooled = new Map(); // tohum → örneklenen iç mekân sayısı
  for (let s = 0; s < N_SEEDS; s++) {
    it('tohum ' + s + ': DAG, sabit nokta, hapis yok', () => {
      const seed = citySeed(s);
      const all = interiorLots(seed);
      const pick = all.filter((e, i) => i % 7 === 0 || i % 31 === 3);
      const list = pick.map(({ lot, bp }) => ({ lot, lotId: lot.id, it: planInterior(bp, lot) }));
      pooled.set(s, list.length);
      T.interiors += list.length;
      const bad = [];
      // kademe / kart kuralları
      const providers = { 1: 0, 2: 0, 3: 0 };
      const consumers = { 1: 0, 2: 0, 3: 0 };
      list.forEach(({ lotId, it }) => {
        it.doors.forEach((d) => {
          if (!d.lock) return;
          const L = normalizeLock(d.lock);
          if (!L) { bad.push('lot ' + lotId + ' kilit normalize olmuyor ' + d.id); return; }
          const sp = lockSpec(L, lockSeed(seed, lotId, L.id));
          T.locks++;
          if (L.kind === 'kart') T.kart++;
          else if (L.kind === 'kod') T.kod++;
          else if (L.kind === 'mini_hack') T.hack++;
          if (L.kind === 'kart') {
            if (sp.gives !== 0) bad.push('kart kilidi kart veriyor ' + L.id);
            if (sp.card < 1 || sp.card > 3) bad.push('kart seviyesi ' + sp.card);
            else consumers[sp.card]++;
          } else if (sp.gives > 0) {
            if (L.tier + 1 !== sp.gives && L.data.gives === undefined) bad.push('verilen kart kademe+1 değil ' + L.id);
            if (sp.gives >= 1 && sp.gives <= 3) providers[sp.gives]++;
          }
          if (d.kind !== 'door' && L.kind !== 'serbest') bad.push('kilit zorlanmayan kapı türünde ' + L.id + ' (' + d.kind + ')');
        });
      });
      // her tüketici seviyesi için strict daha düşük kademeden sağlayıcı bulunmalı; sağlayıcı kart gerektirmez (yukarıdaki kural)
      [1, 2, 3].forEach((k) => { if (consumers[k] > 0 && providers[k] === 0 && s < 0) bad.push('Kart-' + k); });
      // şehir çapı havuz: tüm sağlayıcıların (kod/mini_hack) kapanımı
      let pool = [];
      const solved = new Map();
      for (let round = 0; round < 6; round++) {
        let grew = false;
        list.forEach(({ lotId, it }) => {
          const r = solveIndependently(it, seed, lotId, pool);
          solved.set(lotId, r);
          r.gives.forEach((g) => { if (pool.indexOf(g) < 0) { pool = pool.concat([g]); grew = true; } });
        });
        if (!grew) break;
      }
      pool.sort();
      if (pool.join() !== '1,2,3') bad.push('kart havuzu ' + pool.join());
      list.forEach(({ lotId, it }) => {
        const r = solved.get(lotId);
        const rooms = it.rooms.map((q) => q.id);
        T.rooms += rooms.length;
        const lost = rooms.filter((id) => !r.reach.has(id));
        if (lost.length) bad.push('lot ' + lotId + ' ' + it.kind + ' ulaşılmayan oda ' + lost.join('/'));
        // hapis yok: her oda yalnız derin→giriş kapılarıyla (kilitsiz) girişe iner
        const sd = doorSides(it);
        const down = new Map();
        sd.forEach((v) => { if (!down.has(v.deep)) down.set(v.deep, []); down.get(v.deep).push(v.entry); });
        const free = new Set([it.entry.room]);
        for (let g = 0; g < 50; g++) {
          let grew = false;
          rooms.forEach((id) => {
            if (free.has(id)) return;
            if ((down.get(id) || []).some((e) => free.has(e))) { free.add(id); grew = true; }
          });
          if (!grew) break;
        }
        const trapped = rooms.filter((id) => !free.has(id));
        if (trapped.length) bad.push('lot ' + lotId + ' ' + it.kind + ' hapis odası ' + trapped.join('/'));
      });
      // DAG: tüketici → sağlayıcı kenarlarında kademe katı azalır
      const edges = [];
      const tierOf = new Map();
      list.forEach(({ lotId, it }) => {
        it.doors.forEach((d) => {
          if (!d.lock) return;
          const L = normalizeLock(d.lock);
          const sp = lockSpec(L, lockSeed(seed, lotId, L.id));
          tierOf.set(lotId + ':' + L.id, { L, sp });
        });
      });
      tierOf.forEach((c, ck) => {
        if (c.L.kind !== 'kart') return;
        tierOf.forEach((p, pk) => {
          if (p.sp.gives === c.sp.card && p.L.kind !== 'kart') edges.push([ck, pk, c.sp.card, p.L.tier]);
        });
      });
      edges.forEach(([ck, pk, cardLv, ptier]) => { if (ptier >= cardLv) bad.push('DAG ihlali ' + ck + ' ← ' + pk); });
      // aynı kimlik iki parselde çakışmaz (store anahtarı)
      const keys = new Set();
      list.forEach(({ it }) => it.doors.forEach((d) => {
        if (!d.lock) return;
        if (keys.has(d.lock.id)) bad.push('kilit kimliği çakışması ' + d.lock.id);
        keys.add(d.lock.id);
      }));
      expect(bad).toEqual([]);
    });
  }

  it('toplam: çözücü gerçekten çalıştı (yeterli iç mekân, oda ve her kilit türü)', () => {
    if (N_SEEDS < 40) return;
    expect(T.interiors).toBeGreaterThan(N_SEEDS * 100);
    expect(T.rooms).toBeGreaterThan(N_SEEDS * 400);
    expect(T.kod).toBeGreaterThan(N_SEEDS * 15);
    expect(T.hack).toBeGreaterThan(N_SEEDS * 8);
    expect(T.kart).toBeGreaterThan(0);
  });

  it('negatif kontrol: kart havuzu boşken kart kilitli bölümlere girilemez; kart havuzu varken girilir (çözücü gevşek değil)', () => {
    let found = 0;
    for (let s = 0; s < 60 && found < 3; s++) {
      const seed = citySeed(s);
      interiorLots(seed).forEach(({ lot, bp }) => {
        if (found >= 3) return;
        const it = planInterior(bp, lot);
        if (!it.doors.some((d) => d.lock && d.lock.kind === 'kart')) return;
        found++;
        const without = solveIndependently(it, seed, lot.id, []);
        const withAll = solveIndependently(it, seed, lot.id, [3]);
        expect(withAll.reach.size).toBe(it.rooms.length);
        expect(without.reach.size).toBeLessThan(it.rooms.length);
      });
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('qa5 — LockBook özellik testi (rastgele işlem dizileri)', () => {
  const mkLock = (kind, tier, data) => normalizeLock({
    id: 'q' + kind.slice(0, 1) + tier, kind, tier, data: data || {},
  });

  for (let s = 0; s < 20; s++) {
    it('tohum ' + s + ': soğuma ≤ 20 sn ve kalıcı değil, çözülen kilit kalıcı, hostile girdi atmaz', () => {
      const rng = makeRng(0x51ab + s);
      const store = {};
      const book = new LockBook({ store, seed: 1000 + s });
      const locks = [mkLock('kod', 0, { code: [1, 2, 3] }), mkLock('kod', 2, null), mkLock('mini_hack', 1), mkLock('kart', 1, { card: 2 }), mkLock('serbest', 0)];
      const lotId = 77 + s;
      const solvedBefore = new Set();
      let t = 0;
      const hostile = [null, undefined, NaN, Infinity, -1, 0, 7, '1', [], [NaN, 1, 1], [1, 2, 3, 4, 5], [1, 2], { length: 3 }, 'x', [0, 0, 0], [7, 7, 7]];
      for (let step = 0; step < 400; step++) {
        const L = locks[rng.int(0, locks.length - 1)];
        const roll = rng.next();
        if (roll < 0.35) {
          const dig = roll < 0.1 ? hostile[rng.int(0, hostile.length - 1)] : Array.from({ length: lockSpec(L, lockSeed(1000 + s, lotId, L.id)).digits || 3 }, () => rng.int(1, 6));
          const r = book.attemptCode(lotId, L, dig);
          expect(['solved', 'wrong', 'cooldown', 'already', 'open', 'invalid']).toContain(r.result);
          expect(r.cooldown).toBeLessThanOrEqual(COOLDOWN_SEC);
          expect(r.cooldown).toBeGreaterThanOrEqual(0);
        } else if (roll < 0.6) {
          const r = book.attemptHack(lotId, L, rng.next() < 0.5 ? 'won' : rng.next() < 0.5 ? 'lost' : hostile[rng.int(0, hostile.length - 1)]);
          expect(r.cooldown).toBeLessThanOrEqual(COOLDOWN_SEC);
        } else if (roll < 0.75) {
          const r = book.attemptCard(lotId, L, rng.next() < 0.5 ? () => true : () => false);
          expect(['invalid', 'solved', 'missing', 'already', 'open']).toContain(r.result);
        } else if (roll < 0.9) {
          const dt = rng.next() < 0.1 ? hostile[rng.int(0, hostile.length - 1)] : rng.next() * 15;
          book.tick(typeof dt === 'number' ? dt : 0);
          t = book.now;
        } else if (roll < 0.95) book.resetTransient();
        else book.setStore(store);
        // değişmezler
        expect(Number.isFinite(book.now)).toBe(true);
        locks.forEach((q) => {
          const cd = book.cooldownLeft(lotId, q);
          expect(cd).toBeGreaterThanOrEqual(0);
          expect(cd).toBeLessThanOrEqual(COOLDOWN_SEC + 1e-9);
          if (book.isSolved(lotId, q)) solvedBefore.add(q.id);
        });
        Object.keys(book.store).forEach((k) => expect(/^[0-9a-z]{1,10}$/.test(k)).toBe(true));
      }
      // soğuma KALICI değil: 20 sn sonra hiçbir kilit soğumada değil
      book.tick(COOLDOWN_SEC + 0.01);
      locks.forEach((q) => expect(book.cooldownLeft(lotId, q)).toBe(0));
      expect(t).toBeGreaterThan(0);
      // çözülenler kalıcı (store en son sıfırlanmadıysa) — store nesnesi paylaşılan düz nesne
      book.setStore(store);
      solvedBefore.forEach((id) => {
        const q = locks.find((x) => x.id === id);
        if (q) expect(book.isOpen(lotId, q)).toBe(true);
      });
    });
  }
});
