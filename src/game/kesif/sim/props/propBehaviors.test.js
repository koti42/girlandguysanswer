import { describe, expect, it } from 'vitest';
import {
  EFFECT_KINDS, fx, getPropBehavior, isEffect, listPropBehaviors, propHint, registerPropBehavior,
} from './propBehaviors.js';
import { PROP_DEFS, PROP_LIST } from './propDefs.js';
import { SIGN_ENTRIES } from './propSigns.js';
import { isSafeText } from '../city/citySafeData.js';

const ctx = (t, choiceUi) => ({
  time: t || 0, seed: 1, def: null, world: null, choiceUi: !!choiceUi,
});
const prop = (key, flags, id) => ({
  id: id || 77, t: PROP_DEFS[key].t, x: 5, y: 64, z: 5, yaw: 0, variant: 0, flags: flags || 0,
});
const st0 = () => ({
  state: 0, rflags: 0, extra: undefined, tmp: null,
});

describe('registerPropBehavior', () => {
  it('yerleşikler kayıtlı; her etkileşim türünün davranışı var', () => {
    ['dinlen', 'otomat', 'oku', 'terminal', 'boyut'].forEach((k) => expect(getPropBehavior(k), k).not.toBeNull());
    PROP_LIST.forEach((d) => { if (d.interact) expect(getPropBehavior(d.interact.kind), d.key).not.toBeNull(); });
    expect(listPropBehaviors().length).toBeGreaterThanOrEqual(5);
    expect(getPropBehavior('yok')).toBeNull();
    expect(getPropBehavior('__proto__')).toBeNull();
  });

  it('doğrulama: geçersiz kind/onUse/tick/hint ve çift kayıt hata fırlatır; yenisi eklenir', () => {
    expect(() => registerPropBehavior('Bad Kind', { onUse() {} })).toThrow(/kind/);
    expect(() => registerPropBehavior('', { onUse() {} })).toThrow();
    expect(() => registerPropBehavior(5, { onUse() {} })).toThrow();
    expect(() => registerPropBehavior('x1', null)).toThrow(/onUse/);
    expect(() => registerPropBehavior('x2', {})).toThrow(/onUse/);
    expect(() => registerPropBehavior('x3', { onUse() {}, tick: 5 })).toThrow(/tick/);
    expect(() => registerPropBehavior('x4', { onUse() {}, hint: 'a' })).toThrow(/hint/);
    expect(() => registerPropBehavior('dinlen', { onUse() {} })).toThrow(/zaten/);
    const b = { onUse: () => ({ effects: [] }) };
    expect(registerPropBehavior('test_kind_a', b)).toBe(b);
    expect(getPropBehavior('test_kind_a')).toBe(b);
  });
});

describe('efekt sözlüğü', () => {
  it('fx yardımcıları sözlük türlerini üretir; isEffect doğrular', () => {
    const list = [
      fx.sound('a', 1, 2, 3), fx.particles('p', 1, 2, 3, 0xff), fx.message('m'), fx.giveItem('i'), fx.spawn('t', 1, 2, 3), fx.setBlock(1, 2, 3, 4),
      fx.dialog('n', 'd'), fx.openUi('ui', { a: 1 }), fx.lock('l', 'open'), fx.setProp(1, 2), fx.emit({ type: 'x' }), fx.dimension('back'),
    ];
    list.forEach((e) => expect(isEffect(e)).toBe(true));
    expect(list.map((e) => e.kind).sort()).toEqual(EFFECT_KINDS.slice().sort());
    expect(fx.giveItem('i').count).toBe(1);
    expect(fx.openUi('ui', { a: 1 })).toEqual({ kind: 'openUi', ui: 'ui', a: 1 });
    [null, undefined, 5, 'x', {}, { kind: 'yok' }, { kind: 5 }, { kind: '__proto__' }].forEach((e) => expect(isEffect(e)).toBe(false));
  });
});

describe('yerleşik davranışlar', () => {
  it('bank: iletiler güvenli ve değişken; sayaç artar; durum yok', () => {
    const b = getPropBehavior('dinlen');
    const seen = new Set();
    let st = st0();
    for (let i = 0; i < 40; i++) {
      const r = b.onUse(ctx(), prop('bank', 0, 100 + i), st, null);
      r.effects.forEach((e) => expect(isEffect(e)).toBe(true));
      const m = r.effects.find((e) => e.kind === 'message');
      expect(isSafeText(m.text)).toBe(true);
      expect(m.text.length).toBeLessThanOrEqual(60);
      seen.add(m.text);
      st = Object.assign(st, { extra: r.extra });
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(b.volatile).toBe(true);
  });

  it('otomat: tüm satırlar güvenli ve ≤ 60 karakter; yanıp sönme 1.6 sn; tick sıfırlar', () => {
    const b = getPropBehavior('otomat');
    const lines = new Set();
    for (let i = 1; i <= 200; i++) {
      const r = b.onUse(ctx(0), prop('otomat', 0, i), { state: 0, rflags: 0, extra: i, tmp: null }, null);
      const m = r.effects.find((e) => e.kind === 'message');
      lines.add(m.text);
    }
    expect(lines.size).toBe(4);
    lines.forEach((t) => {
      expect(isSafeText(t)).toBe(true);
      expect(t.length).toBeLessThanOrEqual(60);
    });
    const r = b.onUse(ctx(10), prop('otomat'), st0(), null);
    expect(r.state).toBe(1);
    expect(r.tmp.until).toBeCloseTo(11.6, 9);
    expect(r.active).toBe(true);
    const running = { state: 1, rflags: 0, extra: r.extra, tmp: r.tmp };
    expect(b.tick(ctx(11), prop('otomat'), running, 0.016)).toBeNull();
    expect(b.tick(ctx(11.7), prop('otomat'), running, 0.016)).toEqual({ state: 0, tmp: null, active: false });
    expect(b.onUse(ctx(10.5), prop('otomat'), running, null).effects).toEqual([]);
    expect(b.hint(running)).toBe('Otomat çalışıyor…');
    expect(b.hint(st0())).toBe('Otomatı kullan');
  });

  it('oku: her tabela/reklam girişi için güvenli ileti; geçersiz indeks boş; ipucu dükkân adını içerir', () => {
    const b = getPropBehavior('oku');
    SIGN_ENTRIES.forEach((e, i) => {
      const r = b.onUse(ctx(), prop('tabela', i), st0(), null);
      const m = r.effects[0];
      expect(m.kind).toBe('message');
      expect(isSafeText(m.text)).toBe(true);
      expect(m.text.length).toBeLessThanOrEqual(90);
      if (e.kind === 'brand') expect(m.text.indexOf(e.text)).toBe(0);
    });
    expect(b.onUse(ctx(), prop('tabela', 60000), st0(), null).effects).toEqual([]);
    expect(b.hint(st0(), prop('tabela', 0))).toContain(SIGN_ENTRIES[0].text);
    expect(b.hint(st0(), prop('billboard', 70))).toBe('Reklamı oku');
    expect(b.hint(st0(), prop('tabela', 60000))).toBe('Oku');
    expect(b.hint(st0(), null)).toBe('Oku');
  });

  it('terminal: ilk kullanım bulundu + emit; sonra openUi; terminal no flags & 15', () => {
    const b = getPropBehavior('terminal');
    const r1 = b.onUse(ctx(), prop('terminal', 0x12), st0(), null);
    expect(r1.state).toBe(1);
    expect(r1.effects.find((e) => e.kind === 'emit').evt).toEqual({ type: 'terminalFound', terminal: 2, first: true });
    const r2 = b.onUse(ctx(), prop('terminal', 0x12), { state: 1, rflags: 0, extra: undefined, tmp: null }, null);
    expect(r2.effects.some((e) => e.kind === 'emit')).toBe(false);
    expect(r2.effects.find((e) => e.kind === 'openUi').terminal).toBe(2);
    r1.effects.concat(r2.effects).forEach((e) => {
      expect(isEffect(e)).toBe(true);
      if (e.kind === 'message') expect(isSafeText(e.text)).toBe(true);
    });
    expect(b.hint({ state: 0 })).toBe('Terminali etkinleştir');
    expect(b.hint({ state: 1 })).toBe('Terminali kullan');
  });

  it('boyut: bulundu + seçim paneli; onay penceresi 6 sn; çömelme başlangıç; panel varsa doğrudan seçim; kalıcı durum', () => {
    const b = getPropBehavior('boyut');
    const p = prop('boyut_terminali', 9);
    const r1 = b.onUse(ctx(0, false), p, st0(), null);
    expect(r1.state).toBe(1);
    expect(r1.tmp.until).toBe(6);
    expect(r1.active).toBe(true);
    expect(r1.effects.find((e) => e.kind === 'emit').evt).toEqual({ type: 'terminalFound', terminal: 9, first: true });
    const ui = r1.effects.find((e) => e.kind === 'openUi');
    expect(ui.choices.map((c) => c.id)).toEqual(['back', 'home']);
    expect(Object.isFrozen(ui.choices)).toBe(true);
    const armed = { state: 1, rflags: 0, extra: undefined, tmp: r1.tmp };
    expect(b.hint(armed, p, ctx(3))).toBe('Eve dön (çömel: başlangıç noktası)');
    expect(b.hint(armed, p, ctx(7))).toBe('Boyut terminalini kullan');
    expect(b.hint(st0(), p, ctx(0))).toBe('Terminali etkinleştir');
    const r2 = b.onUse(ctx(3), p, armed, null);
    expect(r2.effects.find((e) => e.kind === 'dimension')).toEqual({ kind: 'dimension', op: 'back' });
    expect(r2.effects.some((e) => e.kind === 'emit')).toBe(false);
    expect(r2.tmp).toBeNull();
    expect(b.onUse(ctx(3), p, armed, { crouch: true }).effects.find((e) => e.kind === 'dimension').op).toBe('home');
    // süre dolunca onay sayılmaz
    expect(b.onUse(ctx(7), p, armed, null).effects.some((e) => e.kind === 'dimension')).toBe(false);
    // seçim paneli: doğrudan seçim, kurulum gerekmez
    expect(b.onUse(ctx(0, true), p, { state: 1, rflags: 0, tmp: null }, { choice: 'home' }).effects.find((e) => e.kind === 'dimension').op).toBe('home');
    expect(b.onUse(ctx(0, true), p, { state: 1, rflags: 0, tmp: null }, { choice: 'zzz' }).effects.some((e) => e.kind === 'dimension')).toBe(false);
    // tick: süre dolunca temizler
    expect(b.tick(ctx(2), p, armed, 0.016)).toBeNull();
    expect(b.tick(ctx(6), p, armed, 0.016)).toEqual({ tmp: null, active: false });
    expect(b.tick(ctx(1), p, st0(), 0.016)).toEqual({ tmp: null, active: false });
    expect(b.volatile).toBeUndefined(); // durum (bulundu) kalıcı
  });

  it('propHint: davranış ipucu yoksa tanım istemine düşer; etkileşimsiz prop boş', () => {
    expect(propHint(PROP_DEFS.lamba, st0(), prop('lamba'), ctx())).toBe('');
    expect(propHint(PROP_DEFS.bank, st0(), prop('bank'), ctx())).toBe('Bankta dinlen');
    expect(propHint(null, st0(), null, ctx())).toBe('');
  });

  it('tüm yerleşik ileti metinleri aile dostu ve ASCII olmayan Türkçe harfleri doğru kullanır', () => {
    const all = [];
    const g = (key, flags, st, actor, c) => {
      const b = getPropBehavior(PROP_DEFS[key].interact.kind);
      const r = b.onUse(c || ctx(), prop(key, flags), st || st0(), actor || null);
      (r.effects || []).forEach((e) => { if (e.kind === 'message') all.push(e.text); });
    };
    g('bank'); g('otomat'); g('tabela', 3); g('billboard', 70); g('terminal', 2); g('boyut_terminali', 2);
    g('boyut_terminali', 2, { state: 1, rflags: 0, tmp: null }, null, ctx(0, false));
    all.forEach((t) => {
      expect(isSafeText(t)).toBe(true);
      expect(t.length).toBeGreaterThan(5);
    });
    expect(all.length).toBeGreaterThanOrEqual(7);
  });
});
