import { describe, expect, it } from 'vitest';
import {
  BOARDS, BOARD_ENTRIES, boardAt, boardIndexFor, boardText, boardTypeOf, pickBoardForProp,
} from './propSignsIndoor.js';
import { INTERIOR_BY_KEY } from './propDefsInterior.js';
import { planSignAtlas } from '../../render/props/signAtlas.js';
import { SIGN_COUNT } from './propSigns.js';

describe('iç mekân yazı panoları', () => {
  it('pano tablosu: türler, indeksler, donuk; atlas girdisi biçimi', () => {
    expect(BOARDS.length).toBeGreaterThanOrEqual(20);
    BOARDS.forEach((b, i) => {
      expect(b.i).toBe(i);
      expect(['menu', 'notice', 'score']).toContain(b.type);
      expect(Object.isFrozen(b)).toBe(true);
      expect(b.hue).toBeGreaterThanOrEqual(0);
      expect(b.hue).toBeLessThan(4);
      expect(BOARD_ENTRIES[i].lines).toBe(b.lines);
      expect(BOARD_ENTRIES[i].kind).toBe('ad');
    });
    expect(boardAt(-1)).toBeNull();
    expect(boardAt(BOARDS.length)).toBeNull();
    expect(boardAt(0)).toBe(BOARDS[0]);
    expect(boardText(BOARDS[0])).toContain(' · ');
    expect(boardText(null)).toBe('');
  });

  it('pano atlası 1024²\'ye sığar ve yazı boyu anlamlı kalır; sokak tabela sayısı tavanı (≤140) etkilenmez', () => {
    const p = planSignAtlas(BOARD_ENTRIES, (t, px) => t.length * px * 0.6, { size: 1024 });
    expect(p.fits).toBe(true);
    expect(p.fontScale).toBeGreaterThan(0.7);
    expect(SIGN_COUNT).toBeLessThanOrEqual(140);
  });

  it('boardTypeOf ve türe uygun seçim: menü ramen barında ramen menüsü; belirlenimci; bilinmeyen türde yedek', () => {
    expect(boardTypeOf('menu_tahtasi')).toBe('menu');
    expect(boardTypeOf('ilan_panosu')).toBe('notice');
    expect(boardTypeOf('skor_tablosu')).toBe('score');
    expect(boardTypeOf('masa')).toBeNull();
    expect(boardTypeOf('__proto__')).toBeNull();
    for (let n = 0; n < 30; n++) {
      const i = boardIndexFor('menu', 'ramen_bari', n);
      expect(BOARDS[i].kind).toBe('ramen_bari');
    }
    expect(BOARDS[boardIndexFor('menu', 'olmayan_tur', 3)].type).toBe('menu');
    expect(boardIndexFor('menu', 'ramen_bari', 7)).toBe(boardIndexFor('menu', 'ramen_bari', 7));
    const prop = {
      id: 1234, t: 0, x: 0, y: 0, z: 0, yaw: 0, variant: 0, flags: 0,
    };
    const b = pickBoardForProp(INTERIOR_BY_KEY.menu_tahtasi, prop, 'ramen_bari');
    expect(b.type).toBe('menu');
    expect(pickBoardForProp(INTERIOR_BY_KEY.masa, prop, 'ramen_bari')).toBeNull();
    const seen = new Set();
    for (let id = 0; id < 80; id++) seen.add(pickBoardForProp(INTERIOR_BY_KEY.skor_tablosu, Object.assign({}, prop, { id }), null).i);
    expect(seen.size).toBeGreaterThan(1);
  });
});
