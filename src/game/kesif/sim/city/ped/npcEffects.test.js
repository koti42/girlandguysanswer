import { describe, expect, it } from 'vitest';
import {
  BUILTIN_KINDS, EFFECT_KINDS, EXTERNAL_KINDS, RUN_MAX, createEffectBus, validateEffect,
} from './npcEffects.js';
import { mulberry32 } from '../../rng.js';

describe('npcEffects: sözdizimi denetimi', () => {
  it('tür listeleri birleşimi ve benzersizlik', () => {
    expect(EFFECT_KINDS).toEqual(BUILTIN_KINDS.concat(EXTERNAL_KINDS));
    expect(new Set(EFFECT_KINDS).size).toBe(EFFECT_KINDS.length);
    ['mission', 'job', 'race', 'taxi', 'photo', 'travel'].forEach((k) => expect(EXTERNAL_KINDS).toContain(k));
  });

  it('geçerli efektler', () => {
    const ok = [
      { k: 'give', item: 'item:elma', n: 3 }, { k: 'take', item: 'blok:cam', n: 1 }, { k: 'kredi', n: 10 }, { k: 'kredi', n: -10 },
      { k: 'flag', key: 'q_nm_ilk_surus', v: 1 }, { k: 'flag', key: 'x', v: true }, { k: 'flag', key: 'x', v: false }, { k: 'rel', d: 1 },
      { k: 'vendor' }, { k: 'vendor', id: 'kerem' }, { k: 'garage' }, { k: 'hint', id: 'portal' }, { k: 'heal', hp: 5 }, { k: 'heal', food: 3 },
      { k: 'end' }, { k: 'mission', id: 'nm_ilk_surus' }, { k: 'job', board: 'kurye' }, { k: 'job', board: 'taksi' }, { k: 'race', id: 7 },
      { k: 'taxi' }, { k: 'photo', id: 'foto_ilk' }, { k: 'travel', to: 15 },
    ];
    ok.forEach((e) => expect(validateEffect(e), JSON.stringify(e)).toBe(null));
  });

  it('geçersiz efektler reddedilir (tür, sınırlar, prototip anahtarları, NaN)', () => {
    const bad = [
      null, undefined, 5, 'x', [], {}, { k: 'bilinmez' }, { k: '__proto__' }, { k: 'give', item: 'elma', n: 1 }, { k: 'give', item: 'item:elma', n: 0 },
      { k: 'give', item: 'item:elma', n: 65 }, { k: 'give', item: 'item:elma', n: 1.5 }, { k: 'give', item: 'item:el ma', n: 1 },
      { k: 'take', item: 'item:elma', n: NaN }, { k: 'kredi', n: 0 }, { k: 'kredi', n: 1000 }, { k: 'kredi', n: -1000 }, { k: 'kredi', n: 1.5 },
      { k: 'flag', key: '__proto__', v: 1 }, { k: 'flag', key: 'constructor', v: 1 }, { k: 'flag', key: 'A', v: 1 }, { k: 'flag', key: 'ab-c', v: 1 },
      { k: 'flag', key: 'x'.repeat(25), v: 1 }, { k: 'flag', key: 'x', v: 10000 }, { k: 'flag', key: 'x', v: -1 }, { k: 'flag', key: 'x', v: 'a' },
      { k: 'rel', d: 0 }, { k: 'rel', d: 3 }, { k: 'vendor', id: 'A B' }, { k: 'hint', id: '' }, { k: 'heal' }, { k: 'heal', hp: 21 },
      { k: 'heal', hp: 0, food: 0 }, { k: 'mission', id: 5 }, { k: 'job', board: 'x' }, { k: 'race', id: 8 }, { k: 'race', id: -1 }, { k: 'travel', to: 16 },
      { k: 'photo', id: 'A' },
    ];
    bad.forEach((e) => expect(validateEffect(e), JSON.stringify(e)).not.toBe(null));
  });
});

describe('npcEffects: efekt yolu (bus)', () => {
  it('işleyici yok → nohandler; kaydedince çalışır; off() geri alır; son kaydeden kazanır', () => {
    const bus = createEffectBus();
    const e = { k: 'mission', id: 'nm_a' };
    expect(bus.has('mission')).toBe(false);
    expect(bus.runOne(e, {})).toMatchObject({ ok: false, reason: 'nohandler', kind: 'mission' });
    const calls = [];
    const off = bus.on('mission', (eff, ctx) => { calls.push([eff.id, ctx.npc]); return { ok: true, msg: 'Görev başladı' }; });
    expect(bus.has('mission')).toBe(true);
    expect(bus.runOne(e, { npc: 'a' })).toMatchObject({ ok: true, msg: 'Görev başladı', kind: 'mission' });
    expect(calls).toEqual([['nm_a', 'a']]);
    const off2 = bus.on('mission', () => ({ ok: false, reason: 'yok' }));
    expect(bus.runOne(e, {}).ok).toBe(false);
    expect(off2()).toBe(true);
    expect(off2()).toBe(false);
    expect(bus.runOne(e, {}).ok).toBe(true);
    expect(off()).toBe(true);
    expect(bus.has('mission')).toBe(false);
  });

  it('işleyici fırlatırsa yakalanır; void/true/false dönüşleri normalleşir; geçersiz efekt işleyiciye gitmez', () => {
    const bus = createEffectBus();
    let hit = 0;
    bus.on('taxi', () => { hit++; throw new Error('x'); });
    expect(bus.runOne({ k: 'taxi' }, {})).toMatchObject({ ok: false, reason: 'hata' });
    bus.on('taxi', () => { hit++; });
    expect(bus.runOne({ k: 'taxi' }, {}).ok).toBe(true);
    bus.on('taxi', () => false);
    expect(bus.runOne({ k: 'taxi' }, {}).ok).toBe(false);
    bus.on('taxi', () => true);
    expect(bus.runOne({ k: 'taxi' }, {}).ok).toBe(true);
    bus.on('photo', () => { hit++; });
    expect(bus.runOne({ k: 'photo', id: 'A!' }, {})).toMatchObject({ ok: false, reason: 'gecersiz' });
    expect(hit).toBe(2);
    expect(bus.stats.errors).toBe(1);
    expect(bus.stats.invalid).toBe(1);
  });

  it('run: en çok RUN_MAX efekt, sırayla; dizi olmayan girdi boş döner; ileti uzunluğu kırpılır', () => {
    const bus = createEffectBus();
    const order = [];
    bus.on('rel', (e) => { order.push(e.d); return { ok: true, msg: 'm'.repeat(500) }; });
    const effects = [];
    for (let i = 0; i < 20; i++) effects.push({ k: 'rel', d: (i % 2) + 1 });
    const res = bus.run(effects, {});
    expect(res).toHaveLength(RUN_MAX);
    expect(order).toHaveLength(RUN_MAX);
    expect(res[0].msg.length).toBe(120);
    expect(bus.run('x', {})).toEqual([]);
    expect(bus.run(null, {})).toEqual([]);
    expect(bus.on('bilinmez', () => {})()).toBe(false);
    expect(bus.on('rel', 5)()).toBe(false);
  });

  it('fuzz: rastgele nesneler asla fırlatmaz, sonuç dizisi her zaman çözülür', () => {
    const bus = createEffectBus();
    EFFECT_KINDS.forEach((k) => bus.on(k, () => ({ ok: true })));
    const rnd = mulberry32(99);
    const junk = [null, undefined, 0, -1, 1e9, NaN, 'a', '__proto__', {}, [], true, 'item:elma', 'x'.repeat(100)];
    for (let i = 0; i < 3000; i++) {
      const e = {};
      const nk = Math.floor(rnd() * 5);
      for (let j = 0; j < nk; j++) e[['k', 'item', 'n', 'key', 'v', 'id', 'd', 'board', 'to', 'hp'][Math.floor(rnd() * 10)]] = junk[Math.floor(rnd() * junk.length)];
      if (rnd() < 0.5) e.k = EFFECT_KINDS[Math.floor(rnd() * EFFECT_KINDS.length)];
      const r = bus.runOne(e, {});
      expect(typeof r.ok).toBe('boolean');
    }
  });
});
