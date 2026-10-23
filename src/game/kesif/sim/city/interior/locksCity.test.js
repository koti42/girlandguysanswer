import { describe, expect, it } from 'vitest';
import { interiorLots } from './testKit.js';
import { listInteriors, planInterior } from './index.js';
import { INTERIOR_KINDS } from './registry.js';
import {
  CARD_KEYS, LOCK_KINDS, assignClues, doorSides, lockSpec, lockStateKey, normalizeLock, onEntrySide, solveCity, solveReachability,
} from './locks.js';
import { propDefOf } from './graph.js';

/*
 * Lock DAG çözülebilirliği — GERÇEK iç mekân türleriyle (interior/kinds/*; sahte düzenek yok). 200 tohum × (tohum başına ilk 12 iç mekânlı bina) +
 * 16 tür × 12 tohum × 2 bina süpürmesi. Çözülebilirlik: kilit çözümü kilidin arkasında değil, kart/ipucu sağlayıcı grafı DAG (sabit nokta), hapis yok.
 */
const ID_OK = /^[0-9a-z]{1,10}$/;

function lockedDoors(it) {
  return it.doors.filter((d) => d && d.lock);
}

function collect(seeds, per, kinds) {
  const out = [];
  for (let s = 0; s < seeds; s++) {
    const lots = kinds ? interiorLots(s, { kinds, limit: per }) : interiorLots(s, { limit: per });
    lots.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      if (it) out.push({ seed: s, lot, bp, it });
    });
  }
  return out;
}

describe('gerçek iç mekân türleri: kilit modeli', () => {
  it('16 tür kayıtlı (gerçek, sahte değil)', () => {
    planInterior({ id: 0 }, { id: 0 }); // glob yüklemesini tetikler
    expect(listInteriors().sort()).toEqual(INTERIOR_KINDS.slice().sort());
  });

  const sample = collect(200, 12, null);

  it('örnek yeterince büyük ve çeşitli (≥ 2000 bina, ≥ 600 kilit, 4 kilit türünün hepsi)', () => {
    expect(sample.length).toBeGreaterThanOrEqual(2000);
    let n = 0;
    const kinds = new Set();
    sample.forEach((e) => lockedDoors(e.it).forEach((d) => {
      n++;
      kinds.add(d.lock.kind);
    }));
    expect(n).toBeGreaterThanOrEqual(600);
    LOCK_KINDS.forEach((k) => expect(kinds.has(k), k).toBe(true));
  }, 120000);

  it('kilit kimlikleri kayıt anahtarı kuralına uyar ve benzersiz; yalnız "door" kapılarında; sokak kapısı kilitsiz; normalize edilir', () => {
    const seen = new Set();
    sample.forEach(({ it, lot, seed }) => {
      lockedDoors(it).forEach((d) => {
        const L = normalizeLock(d.lock);
        expect(L, JSON.stringify(d.lock)).not.toBeNull();
        expect(ID_OK.test(d.lock.id), d.lock.id).toBe(true);
        expect(lockStateKey(lot.id, d.lock.id)).toBe(d.lock.id);
        expect(d.kind).toBe('door');
        expect(d.id).not.toBe('sokak');
        const k = seed + ':' + lot.id + ':' + d.lock.id;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      });
      const street = it.doors.find((d) => d.id === 'sokak');
      expect(street.lock).toBeUndefined();
    });
  });

  it('her kilitli kapıda düzenek propu var (çözümsüz/ulaşılamaz kilit yok)', () => {
    let missing = 0;
    let total = 0;
    sample.forEach(({ it }) => {
      lockedDoors(it).forEach((d) => {
        if (d.lock.kind === 'serbest') return;
        total++;
        const pads = it.props.filter((p) => {
          const def = propDefOf(p);
          if (!def || def.tags.indexOf('lockpad') < 0) return false;
          return Math.abs(p.x - (d.x + 0.5)) < 4 && Math.abs(p.z - (d.z + 0.5)) < 4;
        });
        if (pads.length === 0) missing++;
      });
    });
    expect(total).toBeGreaterThan(300);
    expect(missing).toBe(0);
  });

  it('kilit DAG sabit-nokta çözülebilirliği: her bina, dış kart varsayımıyla (kilit yapısı) ve ipucu zorunluyken', () => {
    const bad = [];
    sample.forEach(({ it, seed, lot }) => {
      const r = solveReachability(it, {
        seed, lotId: lot.id, requireClues: true, externalCards: [1, 2, 3],
      });
      if (!r.ok) bad.push(lot.id + ':' + r.unsolved.map((u) => u.id + '/' + u.reason).join(',') + ':' + r.unreachableRooms.join('+'));
    });
    expect(bad).toEqual([]);
  }, 120000);

  it('şehir çapı kapanım (kart havuzu boştan): tohum başına tüm kilitler çözülür, kartlar kilitlerden gelir', () => {
    const all = {};
    sample.forEach((e) => {
      (all[e.seed] = all[e.seed] || []).push({ lotId: e.lot.id, interior: e.it });
    });
    let fail = 0;
    const firstFail = [];
    Object.keys(all).forEach((s) => {
      const r = solveCity(all[s], { seed: Number(s), requireClues: true });
      if (!r.ok) {
        fail++;
        if (firstFail.length < 3) firstFail.push(s + ':' + JSON.stringify(r.unsolved.slice(0, 2)));
      }
    });
    expect(firstFail).toEqual([]);
    expect(fail).toBe(0);
  }, 120000);

  it('kart kilidi seviyesi 1..3; sağlayıcı kademesi < tüketici seviyesi (DAG ihlali yok)', () => {
    let kart = 0;
    sample.forEach(({ it, seed, lot }) => {
      const r = solveReachability(it, { seed, lotId: lot.id, externalCards: [1, 2, 3] });
      expect(r.dag.violations, String(lot.id)).toEqual([]);
      lockedDoors(it).forEach((d) => {
        if (d.lock.kind === 'kart') {
          kart++;
          const sp = lockSpec(normalizeLock(d.lock), 1);
          expect(sp.card).toBeGreaterThanOrEqual(1);
          expect(sp.card).toBeLessThanOrEqual(3);
          expect(CARD_KEYS[sp.card - 1]).toBeTruthy();
        }
      });
    });
    expect(kart).toBeGreaterThan(0);
  });

  it('hapis yok: her kilitli kapının derin tarafı "giriş tarafı değil" (çıkış serbest), giriş tarafında kilit uygulanır', () => {
    let checked = 0;
    sample.slice(0, 600).forEach(({ it }) => {
      const sides = doorSides(it);
      const byId = new Map(it.rooms.map((r) => [r.id, r]));
      lockedDoors(it).forEach((d) => {
        const s = sides.get(d.id);
        expect(s, d.id).toBeTruthy();
        const deep = byId.get(s.deep);
        const ent = byId.get(s.entry);
        const dc = [(deep.x0 + deep.x1) / 2, (deep.z0 + deep.z1) / 2];
        const ec = [(ent.x0 + ent.x1) / 2, (ent.z0 + ent.z1) / 2];
        expect(onEntrySide(s, dc[0], dc[1])).toBe(false);
        expect(onEntrySide(s, ec[0], ec[1])).toBe(true);
        checked++;
      });
    });
    expect(checked).toBeGreaterThan(150);
  });

  it('kod kilitleri: hane sayısı 3–4, her hane 1–6; ipucu notu ya da sahip ipucu var; verilen kod aynen kullanılır', () => {
    let kod = 0;
    sample.slice(0, 800).forEach(({ it, seed, lot }) => {
      const clues = assignClues(it);
      lockedDoors(it).forEach((d) => {
        if (d.lock.kind !== 'kod') return;
        kod++;
        const sp = lockSpec(normalizeLock(d.lock), seed + lot.id);
        expect(sp.digits === 3 || sp.digits === 4).toBe(true);
        sp.code.forEach((v) => expect(v >= 1 && v <= 6).toBe(true));
        if (d.lock.data && d.lock.data.code) expect(sp.code).toEqual(d.lock.data.code);
        expect(clues.has(d.lock.id) || (d.lock.data && d.lock.data.clue === 'owner')).toBe(true);
      });
    });
    expect(kod).toBeGreaterThan(100);
  });
});

describe('tür süpürmesi: 16 tür × 12 tohum × 2 bina', () => {
  it('her türün her örneği çözülebilir ve ulaşılabilir', () => {
    const bad = [];
    let n = 0;
    INTERIOR_KINDS.forEach((kind) => {
      const list = collect(12, 2, [kind]);
      list.forEach(({ it, seed, lot }) => {
        n++;
        const r = solveReachability(it, {
          seed, lotId: lot.id, requireClues: true, externalCards: [1, 2, 3],
        });
        if (!r.ok) bad.push(kind + '#' + lot.id);
      });
    });
    expect(n).toBeGreaterThan(300);
    expect(bad).toEqual([]);
  }, 120000);
});
