import { describe, expect, it } from 'vitest';
import {
  PAGE_MAX, TYPEWRITER_CPS, buyLabel, choiceFromKey, clampQty, moodHue, paginateText, portraitSpec, sellLabel, stepperMax, typewriterShown,
} from '../city/npcPanelUtils.js';
import { NPCS, npcLook } from '../../../../game/kesif/sim/city/ped/npcData.js';
import { mulberry32 } from '../../../../game/kesif/sim/rng.js';

describe('paginateText', () => {
  it('kısa metin tek sayfa; boş/boşluk güvenli', () => {
    expect(paginateText('Merhaba dünya', 120)).toEqual(['Merhaba dünya']);
    expect(paginateText('', 50)).toEqual(['']);
    expect(paginateText('   ', 50)).toEqual(['']);
    expect(paginateText(null, 50)).toEqual(['']);
    expect(paginateText(undefined)).toEqual(['']);
    expect(paginateText('a   b\n\nc', 50)).toEqual(['a b c']);
  });

  it('uzun metin cümle sınırında, ardından sözcük sınırında bölünür; her sayfa ≤ sınır; metin kaybolmaz', () => {
    const t = 'Birinci cümle burada biter. İkinci cümle biraz daha uzundur ve devam eder! Üçüncü cümle de var mı? Evet var, hem de uzun uzun anlatıyor.';
    const pages = paginateText(t, 50);
    expect(pages.length).toBeGreaterThan(2);
    pages.forEach((p) => expect(p.length).toBeLessThanOrEqual(50));
    expect(pages.join(' ').replace(/\s+/g, ' ')).toBe(t);
    const one = 'x'.repeat(130);
    expect(paginateText(one, 50)).toEqual([one]); // tek sözcük bölünmez
    expect(paginateText('çok '.repeat(60).trim(), 40).every((p) => p.length <= 40)).toBe(true);
  });

  it('fuzz: rastgele metinlerde sayfa sınırı, içerik korunumu', () => {
    const rnd = mulberry32(5);
    const words = ['evet', 'hayır', 'Şehir', 'ışıl', 'neon.', 'çay!', 'yağmur?', 'x', 'kuantum', 'Merhaba'];
    for (let i = 0; i < 300; i++) {
      const n = 1 + Math.floor(rnd() * 50);
      const t = Array.from({ length: n }, () => words[Math.floor(rnd() * words.length)]).join(' ');
      const lim = 10 + Math.floor(rnd() * 100);
      const pages = paginateText(t, lim);
      expect(pages.join(' ')).toBe(t);
      pages.forEach((p) => { if (p.indexOf(' ') >= 0) expect(p.length).toBeLessThanOrEqual(lim); });
    }
    expect(PAGE_MAX).toBeGreaterThan(60);
  });
});

describe('typewriterShown', () => {
  it('ilerleme, tamamlanma, taşma ve geçersiz girdi', () => {
    expect(typewriterShown('Merhaba', 0)).toEqual({ shown: '', done: false });
    const half = typewriterShown('Merhaba', (3 / TYPEWRITER_CPS) * 1000);
    expect(half).toEqual({ shown: 'Mer', done: false });
    expect(typewriterShown('Merhaba', 1e9)).toEqual({ shown: 'Merhaba', done: true });
    expect(typewriterShown('', 0)).toEqual({ shown: '', done: true });
    expect(typewriterShown('abc', -50)).toEqual({ shown: '', done: false });
    expect(typewriterShown('abc', NaN).done).toBe(false);
    expect(typewriterShown('😀😀', 1000 / TYPEWRITER_CPS).shown).toBe('😀'); // surrogate güvenli
    expect(typewriterShown('abcd', 2000, 2)).toEqual({ shown: 'abcd', done: true });
  });
});

describe('choiceFromKey', () => {
  it('Digit/Numpad/rakam tuşları 1–4; diğerleri ve değiştirici tuşlar 0', () => {
    expect(choiceFromKey({ code: 'Digit1' })).toBe(1);
    expect(choiceFromKey({ code: 'Numpad4' })).toBe(4);
    expect(choiceFromKey({ key: '3' })).toBe(3);
    expect(choiceFromKey({ code: 'Digit5' })).toBe(0);
    expect(choiceFromKey({ code: 'Digit0' })).toBe(0);
    expect(choiceFromKey({ key: 'a' })).toBe(0);
    expect(choiceFromKey({ code: 'Digit2', ctrlKey: true })).toBe(0);
    expect(choiceFromKey({ code: 'Digit2', altKey: true })).toBe(0);
    expect(choiceFromKey({ code: 'Digit2', metaKey: true })).toBe(0);
    expect(choiceFromKey(null)).toBe(0);
    expect(choiceFromKey({})).toBe(0);
  });
});

describe('satıcı yardımcıları', () => {
  it('stepperMax: stok, günlük sınır ve Kredi en küçüğü; satın alınamazsa 0', () => {
    const o = { canBuy: true, left: 5, limit: 3, price: 10 };
    expect(stepperMax(o, 1000)).toBe(3);
    expect(stepperMax(Object.assign({}, o, { limit: 99 }), 1000)).toBe(5);
    expect(stepperMax(Object.assign({}, o, { limit: 99 }), 25)).toBe(2);
    expect(stepperMax(o, 9)).toBe(0);
    expect(stepperMax(Object.assign({}, o, { canBuy: false }), 1000)).toBe(0);
    expect(stepperMax(null, 100)).toBe(0);
    expect(stepperMax({ canBuy: true, left: 500, limit: 500, price: 1 }, 1e9)).toBe(64);
    expect(stepperMax({ canBuy: true, left: NaN, limit: 5, price: 1 }, 10)).toBe(0);
  });

  it('clampQty ve etiketler', () => {
    expect(clampQty(5, 3)).toBe(3);
    expect(clampQty(0, 3)).toBe(1);
    expect(clampQty(-4, 3)).toBe(1);
    expect(clampQty(2.7, 5)).toBe(2);
    expect(clampQty(3, 0)).toBe(1);
    expect(clampQty(NaN, 4)).toBe(1);
    expect(buyLabel({ name: 'Elma', price: 6 }, 3)).toBe('Satın al: Elma x3, 18 Kredi');
    expect(sellLabel({ name: 'Elma', price: 2 }, 4)).toBe('Sat: Elma x4, 8 Kredi kazan');
  });
});

describe('portraitSpec / moodHue', () => {
  it('46 NPC için renk ve şekil alanları dolu; robot bayrağı; çocuk ölçeği; bilinmeyen girdi güvenli', () => {
    NPCS.forEach((n) => {
      const p = portraitSpec(npcLook(n), n.kind);
      expect(p.skin).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.hair).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.top).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(p.robot).toBe(n.gender === 'r');
      if (n.kind === 'kid') expect(p.scale).toBeLessThan(1);
    });
    expect(portraitSpec(null).hairStyle).toBe('kisa');
    expect(portraitSpec({ skin: 99, hair: { color: -1 } }).skin).toMatch(/^#/);
    expect(moodHue('neşe')).toMatch(/^hsl\(/);
    expect(moodHue('yok')).toBe(moodHue('sakin'));
    expect(moodHue('__proto__')).toBe(moodHue('sakin'));
  });
});
