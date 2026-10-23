import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SIGN_ATLAS_SIZE, SIGN_FONT_FAMILY, createSignAtlas, planSignAtlas,
} from './signAtlas.js';
import { SIGN_ENTRIES } from '../../sim/props/propSigns.js';
import { SIGN_GLYPHS } from '../../sim/city/cityBrands.js';

/** Metin genişliği tahmini: karakter başına 0.56 em (kalın), sabit. */
const measure = (k) => (text, px) => text.length * px * k;

function fakeCanvas() {
  const calls = [];
  const state = { font: '' };
  const ctx = {
    calls,
    set font(v) { state.font = v; },
    get font() { return state.font; },
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    beginPath() { calls.push(['beginPath']); },
    rect(x, y, w, h) { calls.push(['rect', x, y, w, h]); },
    clip() { calls.push(['clip']); },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]); },
    fillText(t, x, y) { calls.push(['fillText', t, x, y, state.font, ctx.shadowBlur]); },
    measureText(t) {
      const m = /(\d+(?:\.\d+)?)px/.exec(state.font);
      return { width: t.length * (m ? parseFloat(m[1]) : 10) * 0.56 };
    },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { canvas, ctx };
}

function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('planSignAtlas', () => {
  it('tüm dizgeler 1024²\'ye sığar; hücreler örtüşmez ve sınır içinde; yazı boyu okunur', () => {
    const plan = planSignAtlas(SIGN_ENTRIES, measure(0.56));
    expect(plan.fits).toBe(true);
    expect(plan.size).toBe(1024);
    expect(plan.cells.length).toBe(SIGN_ENTRIES.length);
    plan.cells.forEach((c) => {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(1024);
      expect(c.y + c.h).toBeLessThanOrEqual(1024);
      expect(c.px).toBeGreaterThanOrEqual(12);
    });
    for (let i = 0; i < plan.cells.length; i++) {
      for (let j = i + 1; j < plan.cells.length; j++) expect(overlap(plan.cells[i], plan.cells[j])).toBe(false);
    }
    expect(plan.fontScale).toBeGreaterThanOrEqual(0.55);
  });

  it('kötümser ölçüm (0.7 em) yazıyı küçülterek yine sığdırır; imkânsız ölçümde fits=false', () => {
    const wide = planSignAtlas(SIGN_ENTRIES, measure(0.7));
    const base = planSignAtlas(SIGN_ENTRIES, measure(0.56));
    expect(wide.fits).toBe(true);
    expect(wide.fontScale).toBeLessThanOrEqual(base.fontScale);
    const never = planSignAtlas(SIGN_ENTRIES, measure(3));
    expect(never.fits).toBe(false);
  });

  it('küçük özel tuval ve boş liste', () => {
    expect(planSignAtlas([], measure(0.56)).cells).toEqual([]);
    const p = planSignAtlas(SIGN_ENTRIES.slice(0, 5), measure(0.56), { size: 256 });
    expect(p.size).toBe(256);
    expect(p.fits).toBe(true);
  });

  it('belirlenimci: aynı girdi aynı yerleşim', () => {
    const a = planSignAtlas(SIGN_ENTRIES, measure(0.56));
    const b = planSignAtlas(SIGN_ENTRIES, measure(0.56));
    expect(JSON.stringify(a.cells.map((c) => [c.x, c.y, c.w, c.h, c.px]))).toBe(JSON.stringify(b.cells.map((c) => [c.x, c.y, c.w, c.h, c.px])));
  });
});

describe('createSignAtlas (sahte tuval)', () => {
  it('tüm dizgeler bir kez çizilir; Türkçe glifler olduğu gibi fillText\'e gider', () => {
    const { canvas, ctx } = fakeCanvas();
    const atlas = createSignAtlas({ createCanvas: (w, h) => { canvas.width = w; canvas.height = h; return canvas; } });
    expect(canvas.width).toBe(SIGN_ATLAS_SIZE);
    expect(canvas.height).toBe(SIGN_ATLAS_SIZE);
    expect(atlas.fits).toBe(true);
    const texts = ctx.calls.filter((c) => c[0] === 'fillText');
    const want = [];
    SIGN_ENTRIES.forEach((e) => e.lines.forEach((l) => want.push(l)));
    expect(texts.length).toBe(want.length * 3);
    const drawn = new Set(texts.map((c) => c[1]));
    want.forEach((l) => expect(drawn.has(l), l).toBe(true));
    // Türkçe örnekler
    ['KAPSÜLLERİ', 'HUZUR'].forEach((s) => expect(drawn.has(s), s).toBe(true));
    const joined = want.join('');
    'İŞĞÜÖÇ'.split('').forEach((ch) => expect(joined.includes(ch), ch).toBe(true));
    'ığşüöç'.split('').forEach((ch) => expect(joined.includes(ch) || SIGN_ENTRIES.some((e) => e.text.includes(ch)), ch).toBe(true));
    // yazı tipi ailesi ve ağırlık
    texts.forEach((c) => expect(c[4]).toContain(SIGN_FONT_FAMILY.split(',')[0]));
    expect(atlas.drawCount).toBe(texts.length);
  });

  it('her metin kendi hücresinin içinde ve kırpma dikdörtgeni ile çizilir', () => {
    const { canvas, ctx } = fakeCanvas();
    const atlas = createSignAtlas({ createCanvas: () => canvas });
    let rect = null;
    const seen = new Set();
    ctx.calls.forEach((c) => {
      if (c[0] === 'rect') rect = c;
      if (c[0] === 'fillText') {
        expect(rect).not.toBeNull();
        expect(c[2]).toBeGreaterThanOrEqual(rect[1]);
        expect(c[2]).toBeLessThanOrEqual(rect[1] + rect[3]);
        expect(c[3]).toBeGreaterThanOrEqual(rect[2]);
        expect(c[3]).toBeLessThanOrEqual(rect[2] + rect[4]);
        seen.add(c[1]);
      }
    });
    expect(seen.size).toBeGreaterThan(100);
    expect(atlas.cells.length).toBe(SIGN_ENTRIES.length);
  });

  it('rectOf: [0,1] içinde, u1>u0, v1>v0, hücreyle aynı bölge; geçersiz indeks ilk girişe düşer', () => {
    const { canvas } = fakeCanvas();
    const atlas = createSignAtlas({ createCanvas: () => canvas });
    for (let i = 0; i < SIGN_ENTRIES.length; i++) {
      const r = atlas.rectOf(i);
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[1]).toBeGreaterThanOrEqual(0);
      expect(r[2]).toBeLessThanOrEqual(1);
      expect(r[3]).toBeLessThanOrEqual(1);
      expect(r[2]).toBeGreaterThan(r[0]);
      expect(r[3]).toBeGreaterThan(r[1]);
      const c = atlas.cells[i];
      expect(r[0] * 1024).toBeGreaterThanOrEqual(c.x);
      expect(r[2] * 1024).toBeLessThanOrEqual(c.x + c.w);
    }
    expect(atlas.rectOf(-1)).toEqual(atlas.rectOf(0));
    expect(atlas.rectOf(99999)).toEqual(atlas.rectOf(0));
    expect(atlas.rectOf(1.5)).toEqual(atlas.rectOf(0));
  });

  it('THREE verilirse mipmaplı, flipY=false, doğrusal olmayan renk uzayı yok; dispose texture\'ı bırakır', () => {
    const { canvas } = fakeCanvas();
    const atlas = createSignAtlas({ THREE, createCanvas: () => canvas, anisotropy: 8 });
    expect(atlas.texture.isTexture).toBe(true);
    expect(atlas.texture.flipY).toBe(false);
    expect(atlas.texture.generateMipmaps).toBe(true);
    expect(atlas.texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(atlas.texture.anisotropy).toBe(8);
    expect(atlas.texture.colorSpace).toBe(THREE.NoColorSpace);
    atlas.dispose();
    expect(atlas.texture).toBeNull();
    atlas.dispose();
  });

  it('bağlam yoksa anlamlı hata', () => {
    expect(() => createSignAtlas({ createCanvas: () => ({ getContext: () => null }) })).toThrow(/bağlam/);
  });

  it('tüm tabela karakterleri citycontent SIGN_GLYPHS kümesinde (Türkçe harfler dahil)', () => {
    const set = new Set(SIGN_GLYPHS.split(''));
    const missing = new Set();
    SIGN_ENTRIES.forEach((e) => e.lines.forEach((l) => l.split('').forEach((ch) => { if (!set.has(ch)) missing.add(ch); })));
    expect(Array.from(missing)).toEqual([]);
  });

  it('ad satırları iki satıra bölünmüş ve satır başına ≤ 28 karakter; dükkân adları büyük harf (Türkçe İ)', () => {
    SIGN_ENTRIES.forEach((e) => {
      expect(e.lines.length).toBeLessThanOrEqual(2);
      e.lines.forEach((l) => expect(l.length).toBeLessThanOrEqual(e.kind === 'ad' ? 28 : 14));
    });
    const kapsul = SIGN_ENTRIES.find((e) => e.id === 'huzur_kapsul');
    expect(kapsul.lines).toEqual(['HUZUR', 'KAPSÜLLERİ']);
  });
});
