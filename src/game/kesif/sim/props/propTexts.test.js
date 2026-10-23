import { describe, expect, it } from 'vitest';
import {
  BILGI, BOOK_TITLES, MENU_BOARDS, MSG_MAX, NOTICES, OPEN_TEXTS, SCORE_BOARDS, TEXTS, TOGGLE_TEXTS, pickList, pickText,
} from './propTexts.js';
import { INTERIOR_BY_KEY } from './propDefsInterior.js';
import { findBrandCollision, isSafeText } from '../city/citySafeData.js';
import { INTERIOR_KINDS } from '../city/ownerData.js';

function allStrings() {
  const out = [];
  Object.keys(TEXTS).forEach((k) => TEXTS[k].forEach((s) => out.push([k, s])));
  Object.keys(TOGGLE_TEXTS).forEach((k) => {
    TOGGLE_TEXTS[k].on.forEach((s) => out.push([k + '.on', s]));
    TOGGLE_TEXTS[k].off.forEach((s) => out.push([k + '.off', s]));
  });
  Object.keys(OPEN_TEXTS).forEach((k) => OPEN_TEXTS[k].forEach((s) => out.push([k, s])));
  Object.keys(BILGI).forEach((k) => BILGI[k].forEach((s) => out.push(['bilgi.' + k, s])));
  BOOK_TITLES.forEach((s) => out.push(['kitap adı', s]));
  [].concat(MENU_BOARDS, NOTICES, SCORE_BOARDS).forEach((b) => b.lines.forEach((s) => out.push(['pano', s])));
  return out;
}

describe('iç mekân metinleri', () => {
  it('tüm satırlar aile dostu (citySafe) ve gerçek marka adından uzak', () => {
    const all = allStrings();
    expect(all.length).toBeGreaterThan(150);
    all.forEach(([k, s]) => {
      expect(isSafeText(s), k + ': ' + s).toBe(true);
      expect(findBrandCollision(s), k + ': ' + s).toBeNull();
    });
  });

  it('mesaj satırları kısa; pano satırları ≤ 26; boş/yinelenen satır yok (tablo içinde)', () => {
    Object.keys(TEXTS).forEach((k) => {
      const t = TEXTS[k];
      expect(new Set(t).size, k).toBe(t.length);
      t.forEach((s) => {
        expect(s.length, s).toBeGreaterThan(5);
        expect(s.length, s).toBeLessThanOrEqual(MSG_MAX + 6);
      });
    });
    Object.keys(TOGGLE_TEXTS).forEach((k) => ['on', 'off'].forEach((w) => TOGGLE_TEXTS[k][w].forEach((s) => expect(s.length, s).toBeLessThanOrEqual(MSG_MAX))));
    Object.keys(OPEN_TEXTS).forEach((k) => OPEN_TEXTS[k].forEach((s) => expect(s.length, s).toBeLessThanOrEqual(MSG_MAX)));
    [].concat(MENU_BOARDS, NOTICES, SCORE_BOARDS).forEach((b) => {
      expect(b.lines.length).toBeGreaterThanOrEqual(3);
      expect(b.lines.length).toBeLessThanOrEqual(6);
      b.lines.forEach((s) => {
        expect(s.length, s).toBeLessThanOrEqual(26);
        expect(s.length).toBeGreaterThan(2);
      });
    });
  });

  it('anahtarlar tanımlarla eşleşir: açma/kapama ve dolap tabloları gerçek prop anahtarları; pano türleri iç mekân türleri', () => {
    Object.keys(TOGGLE_TEXTS).forEach((k) => expect(INTERIOR_BY_KEY[k], k).toBeTruthy());
    Object.keys(OPEN_TEXTS).forEach((k) => expect(INTERIOR_BY_KEY[k], k).toBeTruthy());
    [].concat(MENU_BOARDS, NOTICES).forEach((b) => expect(INTERIOR_KINDS).toContain(b.kind));
    Object.keys(BILGI).forEach((k) => { if (k !== 'genel') expect(INTERIOR_KINDS).toContain(k); });
    ['robot_kedi', 'mini_robot'].forEach((k) => expect(TEXTS[k].length).toBeGreaterThanOrEqual(3));
  });

  it('Türkçe karakterler korunur', () => {
    const joined = allStrings().map((a) => a[1]).join(' ');
    ['ç', 'ğ', 'ı', 'ö', 'ş', 'ü', 'İ'].forEach((c) => expect(joined.indexOf(c), c).toBeGreaterThanOrEqual(0));
  });

  it('pickText/pickList: belirlenimci, negatif/dev sayılara dayanıklı, boş tabloda boş metin', () => {
    expect(pickText('kitap', 3)).toBe(pickText('kitap', 3));
    expect(pickText('kitap', -1)).toBe(TEXTS.kitap[TEXTS.kitap.length - 1]);
    expect(pickText('yok', 1)).toBe('');
    expect(pickList([], 1)).toBe('');
    expect(pickList(['a', 'b'], 5)).toBe('b');
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(pickText('kitap', i));
    expect(seen.size).toBeGreaterThan(10);
  });
});
