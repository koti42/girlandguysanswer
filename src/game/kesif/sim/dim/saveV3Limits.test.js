import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { seededRandom } from '../rng.js';
import { estimateSaveSize, serializeGame } from '../save.js';
import { buildCloudEnvelope } from '../saveEnvelope.js';
import { DIM_SAVE_LIMITS } from './dimensions.js';
import {
  NEON_TRIM_STAGES, jsonBytes, limitNeon, neonEditsBytes, sanitizeNeon, trimNeonEdits,
} from './dimSanitize.js';
import { createDimCtxSim, serializeDim } from './dimState.js';
import {
  baseState, bigNeon, fakeWorld, installFlatCity, scatterEdits,
} from './dimTestKit.js';
import { unregisterDimGen } from './genRegistry.js';

let uninstall = null;
beforeEach(() => { uninstall = installFlatCity(); });
afterEach(() => { if (uninstall) uninstall(); unregisterDimGen('city'); });

describe('DIM_SAVE_LIMITS ve kırpma', () => {
  it('limitNeon: düzenlemeler ≤250 KB; en uzak chunk önce atılır (referansa göre)', () => {
    const edits = scatterEdits(320, 150, 77);
    expect(neonEditsBytes(edits)).toBeGreaterThan(DIM_SAVE_LIMITS.edits);
    const r = limitNeon(bigNeon({ edits }), [0, 0]);
    expect(neonEditsBytes(r.neon.edits)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.edits);
    expect(r.trimmed.some((t) => t.indexOf('edits:') === 0)).toBe(true);
    // atılanların hepsi, kalanların en uzağından daha uzak (ya da eşit)
    const dist = (k) => { const p = k.split(',').map(Number); return (p[0] * 16 + 8) ** 2 + (p[1] * 16 + 8) ** 2; };
    const kept = Object.keys(r.neon.edits);
    const dropped = Object.keys(edits).filter((k) => !(k in r.neon.edits));
    expect(dropped.length).toBeGreaterThan(0);
    const farKept = Math.max(...kept.map(dist));
    dropped.forEach((k) => expect(dist(k)).toBeGreaterThanOrEqual(farKept));
  });

  it('referans noktası değişince atılan kümeler değişir (oyuncuya en uzak chunk önce)', () => {
    const edits = scatterEdits(320, 150, 78);
    expect(neonEditsBytes(edits)).toBeGreaterThan(DIM_SAVE_LIMITS.edits);
    const a = trimNeonEdits(edits, [-600, -600], DIM_SAVE_LIMITS.edits).edits;
    const b = trimNeonEdits(edits, [600, 600], DIM_SAVE_LIMITS.edits).edits;
    expect(Object.keys(a).sort()).not.toEqual(Object.keys(b).sort());
    expect(trimNeonEdits(edits, [0, 0], 1e12).dropped).toBe(0);
    expect(trimNeonEdits({}, [0, 0], 0).dropped).toBe(0);
  });

  it('props ≤40 KB; city > 60 KB atılır; toplam ≤400 KB', () => {
    const props = {};
    for (let i = 0; i < 3000; i++) props[i.toString(36)] = [i & 255, i & 65535, { k: 'y'.repeat(40) }];
    let r = limitNeon(bigNeon({ props }), null);
    expect(jsonBytes(r.neon.props)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.props);
    expect(r.trimmed.some((t) => t.indexOf('props:') === 0)).toBe(true);
    const fat = { v: 1, junk: 'z'.repeat(70000) };
    r = limitNeon(bigNeon({ city: fat }), null);
    expect(r.neon.city).toBeNull();
    expect(r.trimmed).toContain('city');
    r = limitNeon(bigNeon({ edits: scatterEdits(400, 150, 9), props, chests: {} }), null);
    expect(jsonBytes(r.neon)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
  });

  it('kırpma aşamaları sırayla: npcs → vehicles → entities → props (girdi değişmez)', () => {
    const n = bigNeon();
    const snap = JSON.stringify(n);
    expect(NEON_TRIM_STAGES.map((s) => s.name)).toEqual(['npcs', 'vehicles', 'entities', 'props']);
    let cur = n;
    const a = NEON_TRIM_STAGES[0].fn(cur);
    expect(a.city.npcs).toEqual({});
    expect(a.city.summoned).not.toBeNull();
    cur = a;
    const b = NEON_TRIM_STAGES[1].fn(cur);
    expect(b.city.summoned).toBeNull();
    expect(b.city.garage.owned).toEqual(['x']); // garaj (sahip olunan araçlar) asla kırpılmaz
    cur = b;
    const c = NEON_TRIM_STAGES[2].fn(cur);
    expect(c.entities).toEqual([]);
    const d = NEON_TRIM_STAGES[3].fn(c);
    expect(d.props).toEqual({});
    expect(d.edits).toBe(n.edits); // düzenlemeler dokunulmadı
    expect(JSON.stringify(n)).toBe(snap);
    // zaten boşsa null (değişiklik yok)
    expect(NEON_TRIM_STAGES[3].fn(d)).toBeNull();
    expect(NEON_TRIM_STAGES[0].fn({ city: null })).toBeNull();
    expect(NEON_TRIM_STAGES[1].fn({ city: { summoned: null } })).toBeNull();
  });

  it('sanitizeNeon yüklemede de sınırları uygular ve uyarı verir', () => {
    const w = [];
    const r = sanitizeNeon(bigNeon({ edits: scatterEdits(320, 150, 3) }), w);
    expect(neonEditsBytes(r.edits)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.edits);
    expect(w.some((x) => x.indexOf('neon.limit:') === 0)).toBe(true);
    expect(jsonBytes(r)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
  });

  it('serializeDim sınırları uygular (büyük bağlam → kayıt ≤ limit)', () => {
    const ctx = createDimCtxSim('neon', 21);
    const ed = scatterEdits(1, 1, 1);
    expect(Object.keys(ed).length).toBe(1);
    // 160 farklı kesite dağınık düzenleme → >250 KB
    const rng = seededRandom(5);
    for (let s = 0; s < 170; s++) {
      const cx = rng.int(-45, 45);
      const cz = rng.int(-45, 45);
      for (let k = 0; k < 150; k++) ctx.world.edits.set((cx * 16 + rng.int(0, 15)) + ',' + (64 + rng.int(0, 15)) + ',' + (cz * 16 + rng.int(0, 15)), B.STONE);
    }
    const blob = serializeDim(ctx, { ref: [0, 0] });
    expect(neonEditsBytes(blob.edits)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.edits);
    expect(jsonBytes(blob)).toBeLessThanOrEqual(DIM_SAVE_LIMITS.total);
  });
});

describe('bulut zarfı: neon kırpma sırası (overworld verisi asla önce kırpılmaz)', () => {
  function saveWithNeon(neon, over) {
    const ow = new Map();
    for (let i = 0; i < 200; i++) ow.set(i + ',70,3', B.STONE);
    return serializeGame(Object.assign(baseState({
      world: fakeWorld(ow),
      dim: 'overworld',
      dims: { neon },
      chests: new Map([['1,64,1', [{ item: 'blok:taş', count: 3 }]]]),
    }), over || {}));
  }

  it('sığıyorsa hiçbir şey kırpılmaz', () => {
    const sv = saveWithNeon(bigNeon());
    const env = buildCloudEnvelope(sv, { maxBytes: 1500000 });
    expect(env.ok).toBe(true);
    expect(env.stripped).toEqual([]);
    expect(env.truncated).toBe(false);
  });

  it('sıra: neon:npcs → neon:vehicles → neon:entities → neon:props → neon:edits:N → (sonra overworld) entities → …', () => {
    const neon = bigNeon({ edits: scatterEdits(80, 150, 12) });
    const sv = saveWithNeon(neon);
    const full = estimateSaveSize(sv);
    const owEntities = JSON.stringify(sv.chests);
    // adım adım daralan sınır
    const prevStripped = [];
    const seq = [];
    for (let cut = 3000; cut < full; cut += 3500) {
      const env = buildCloudEnvelope(sv, { maxBytes: full - cut + 4096 });
      if (!env.ok) continue;
      const st = env.stripped.join('|');
      if (!seq.includes(st)) seq.push(st);
      // overworld düzenlemeleri ve sandıklar neon kırpılırken korunur
      if (env.stripped.every((s) => s.indexOf('neon:') === 0)) {
        expect(env.save.chests).toEqual(sv.chests);
        expect(env.save.edits).toEqual(sv.edits);
        expect(JSON.stringify(env.save.chests)).toBe(owEntities);
      }
      prevStripped.push(env.stripped);
    }
    const flat = seq.map((s) => s.split('|'));
    // her aşamada önek sırası değişmez
    const order = ['neon:npcs', 'neon:vehicles', 'neon:entities', 'neon:props'];
    flat.forEach((names) => {
      const idx = names.filter((n) => order.indexOf(n) >= 0).map((n) => order.indexOf(n));
      expect(idx).toEqual(idx.slice().sort((a, b) => a - b));
      const e = names.findIndex((n) => n.indexOf('neon:edits:') === 0);
      if (e >= 0) expect(names.slice(0, e).filter((n) => order.indexOf(n) >= 0)).toEqual(order); // edits'ten önce hepsi
      const ow = names.findIndex((n) => n === 'entities' || n === 'mapReveal' || n === 'chests' || n.indexOf('edits:') === 0);
      if (ow >= 0) expect(names.slice(0, ow).filter((n) => n.indexOf('neon:') === 0).length).toBeGreaterThan(0);
    });
    expect(seq.length).toBeGreaterThan(2);
  });

  it('neon düzenlemeleri en uzak chunk önce atılır; oyuncu şehirdeyse oyuncuya göre', () => {
    const neon = bigNeon({ edits: scatterEdits(100, 150, 14) });
    const sv = saveWithNeon(neon);
    const full = estimateSaveSize(sv);
    const env = buildCloudEnvelope(sv, { maxBytes: Math.floor(full * 0.5) });
    expect(env.ok).toBe(true);
    const names = env.stripped;
    expect(names.slice(0, 4)).toEqual(['neon:npcs', 'neon:vehicles', 'neon:entities', 'neon:props']);
    const ed = names.find((n) => n.indexOf('neon:edits:') === 0);
    expect(ed).toBeTruthy();
    expect(env.save.truncated).toBe(true);
    expect(env.bytes).toBeLessThanOrEqual(Math.floor(full * 0.5));
    // girdi değişmedi
    expect(Object.keys(sv.dims.neon.edits).length).toBe(Object.keys(neon.edits).length);
    expect(sv.dims.neon.entities.length).toBe(100);
  });

  it('şehirde kaydedilen oyuncu için "en uzak" oyuncunun konumuna göre ölçülür', () => {
    const neon = bigNeon({ edits: scatterEdits(100, 150, 15), spawn: [0.5, 64, 2.5] });
    const a = saveWithNeon(neon, { dim: 'neon', player: { pos: [-700, 70, -700] } });
    const b = saveWithNeon(neon, { dim: 'neon', player: { pos: [700, 70, 700] } });
    const lim = Math.floor(estimateSaveSize(a) * 0.6);
    const ea = buildCloudEnvelope(a, { maxBytes: lim });
    const eb = buildCloudEnvelope(b, { maxBytes: lim });
    expect(ea.ok && eb.ok).toBe(true);
    const ka = Object.keys(ea.save.dims.neon.edits).sort();
    const kb = Object.keys(eb.save.dims.neon.edits).sort();
    expect(ka).not.toEqual(kb);
    const nearA = ka.filter((k) => Number(k.split(',')[0]) < 0).length / ka.length;
    expect(nearA).toBeGreaterThan(0.5); // (-700,-700)'e yakın kısım korunur
  });

  it('oyuncu şehirdeyken overworld düzenlemeleri overworld konumuna (dimMeta.overworldPos) göre kırpılır', () => {
    const rng = seededRandom(404);
    const ow = new Map();
    const cluster = (cx0) => {
      for (let sct = 0; sct < 40; sct++) {
        const cx = cx0 + rng.int(0, 3);
        const cz = rng.int(60, 63);
        const y0 = 64 + 16 * rng.int(0, 4);
        for (let k = 0; k < 150; k++) ow.set((cx * 16 + rng.int(0, 15)) + ',' + (y0 + rng.int(0, 15)) + ',' + (cz * 16 + rng.int(0, 15)), B.STONE);
      }
    };
    cluster(60); // x ≈ +1000 (overworldPos yakını)
    cluster(-64); // x ≈ -1000 (uzak)
    const sv = serializeGame(baseState({
      world: fakeWorld(ow),
      dim: 'neon',
      dimMeta: { overworldPos: [1000, 70, 1000] },
      dims: { neon: serializeDim(createDimCtxSim('neon', 3)) },
      player: { pos: [0.5, 64, 2.5] },
    }));
    const full = estimateSaveSize(sv);
    const env = buildCloudEnvelope(sv, { maxBytes: Math.floor(full * 0.6) });
    expect(env.ok).toBe(true);
    const kept = Object.keys(env.save.edits);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(Object.keys(sv.edits).length);
    const near = kept.filter((k) => Number(k.split(',')[0]) > 0).length;
    expect(near / kept.length).toBeGreaterThan(0.8); // (+1000, +1000)'e yakın olanlar korunur
  });

  it('neon blob olmayan kaydın zarfı eskisi gibi (neon aşaması yok)', () => {
    const sv = serializeGame(baseState({ chests: new Map([['1,64,1', [{ item: 'blok:taş', count: 3 }]]]) }));
    const env = buildCloudEnvelope(sv, { maxBytes: 1500000 });
    expect(env.ok).toBe(true);
    expect(env.stripped).toEqual([]);
    const tiny = buildCloudEnvelope(sv, { maxBytes: 1200 });
    expect(tiny.ok === false || tiny.stripped.every((s) => s.indexOf('neon:') !== 0)).toBe(true);
  });
});

