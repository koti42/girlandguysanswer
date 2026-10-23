import { afterEach, describe, expect, it, vi } from 'vitest';
import { ITEM_LIST } from '../sim/items.js';
import { BLOCKS, blockByKey } from '../sim/blocks.js';
import { ICON_PAINTERS, iconColorFor, paintItemIcon, renderItemIcon, setAtlasPixels } from './itemIcons.js';
import { MODEL_KINDS, TIER_KEYS, TIER_PALETTES, itemSpec } from './itemPalette.js';
import { cssColor, mixColor, rgba, shadeColor } from './heldItemsColor.js';
import { bestOf, cpuMs, scaled } from '../../../test/perfScale.js';

/** Çizim çağrılarını sayan sahte 2D bağlam (canvas yok). */
function mockCtx(size = 64) {
  const calls = { n: 0, byName: {} };
  const grad = { addColorStop() { calls.n++; } };
  let imageData = null;
  const target = {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData(img) { imageData = img; calls.n++; },
    createLinearGradient() { calls.n++; return grad; },
    createRadialGradient() { calls.n++; return grad; },
    measureText() { return { width: 10 }; },
    get imageData() { return imageData; },
    calls,
    size,
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      // bilinmeyen özellik: fonksiyon gibi davran (canvas yöntemleri)
      return (...a) => { calls.n++; calls.byName[k] = (calls.byName[k] || 0) + 1; void a; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

describe('itemIcons: kapsam ve çizim', () => {
  it('her model türünün çizicisi vardır ve çizici tablosu fazladan tür içermez', () => {
    MODEL_KINDS.forEach((k) => expect(typeof ICON_PAINTERS[k], k).toBe('function'));
    Object.keys(ICON_PAINTERS).forEach((k) => expect(MODEL_KINDS).toContain(k));
  });

  it('items.js\'teki HER eşya hatasız çizilir ve en az bir çizim komutu üretir', () => {
    ITEM_LIST.forEach((it) => {
      const ctx = mockCtx();
      expect(() => paintItemIcon(ctx, it.key, 64), it.key).not.toThrow();
      expect(ctx.calls.n, it.key).toBeGreaterThan(5);
    });
  });

  it('plaka ve basamak simgeleri küpten az alan kaplar (yarım yükseklik), basamak plakadan çok', () => {
    const cover = (key) => {
      const ctx = mockCtx();
      paintItemIcon(ctx, key, 64);
      const d = ctx.imageData.data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++;
      return n;
    };
    const cube = cover('blok:cilalı_taş');
    const slab = cover('blok:taş_plaka');
    const stair = cover('blok:taş_basamak');
    expect(cube).toBeGreaterThan(1500);
    expect(slab).toBeLessThan(cube * 0.75);
    expect(slab).toBeGreaterThan(cube * 0.35);
    expect(stair).toBeGreaterThan(slab);
    expect(stair).toBeLessThan(cube);
    // genişletme blokları da aynı yolu kullanır
    expect(cover('blok:meşe_plaka')).toBe(cover('blok:çam_plaka'));
    expect(cover('blok:meşe_basamak')).toBe(stair);
  });

  it('simge rengi tablosu: her eşyanın temsilî rengi sonlu; alet/kılıç rengi kademe paletinden', () => {
    ITEM_LIST.forEach((it) => expect(Number.isFinite(iconColorFor(it.key)), it.key).toBe(true));
    TIER_KEYS.forEach((k) => {
      expect(iconColorFor('item:kazma_' + k)).toBe(TIER_PALETTES[k].head);
      expect(iconColorFor('item:kılıç_' + k)).toBe(TIER_PALETTES[k].head);
    });
    const spec = itemSpec('item:balta_altın');
    expect(spec.kind).toBe('axe');
    expect(spec.tier).toBe('altın');
  });

  it('çizici hata atarsa yedek glif çizilir (bozuk bağlam bile çökertmez)', () => {
    const orig = ICON_PAINTERS.apple;
    ICON_PAINTERS.apple = () => { throw new Error('boom'); };
    const ctx = mockCtx();
    expect(paintItemIcon(ctx, 'item:elma', 64)).toBe(false);
    expect(ctx.calls.byName.fillText).toBe(1);
    ICON_PAINTERS.apple = orig;
  });

  it('document yoksa renderItemIcon boş dize döner (SSR/worker güvenli)', () => {
    expect(typeof document).toBe('undefined');
    expect(renderItemIcon('item:elma', 64)).toBe('');
    expect(renderItemIcon('blok:taş')).toBe('');
  });
});

describe('itemIcons: CPU destekli tuval (QA: GPU tuvalinde toDataURL okuma senkronu simge başına 30-170 ms donma)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it('renderItemIcon 2D bağlamı willReadFrequently ile ister ve sonucu önbelleğe alır', () => {
    const opts = [];
    const fakeCtx = mockCtx(32);
    const canvas = { width: 0, height: 0, getContext: (t, o) => { opts.push([t, o]); return fakeCtx; }, toDataURL: () => 'data:image/png;base64,AAAA' };
    const create = vi.fn(() => canvas);
    vi.stubGlobal('document', { createElement: create });
    const u1 = renderItemIcon('item:elma', 32);
    const u2 = renderItemIcon('item:elma', 32);
    expect(u1).toBe('data:image/png;base64,AAAA');
    expect(u2).toBe(u1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(opts).toEqual([['2d', { willReadFrequently: true }]]);
  });
});

describe('itemIcons: izometrik blok küpü', () => {
  // sentetik atlas: her hücre tek renk (üst kırmızı, yan yeşil) → yüz gölgesi ve yerleşim doğrulanır
  const n = 8;
  const pad = 2;
  const cell = n + 2 * pad;
  const cols = 8;
  const tileCount = BLOCKS.reduce((m, b) => Math.max(m, b.tiles.top, b.tiles.side, b.tiles.bottom), 0) + 1;
  const rows = Math.ceil(tileCount / cols);
  const W = cols * cell;
  const H = rows * cell;
  const data = new Uint8ClampedArray(W * H * 4);
  function fillTile(tile, r, g, b) {
    const col = tile % cols;
    const row = (tile / cols) | 0;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const i = ((row * cell + y) * W + col * cell + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
  }
  const stone = blockByKey('kumtaşı');
  fillTile(stone.tiles.top, 240, 0, 0);
  fillTile(stone.tiles.side, 0, 240, 0);
  const pixels = { color: data, width: W, height: H, cols, cell, pad, tileSize: n };

  it('setAtlasPixels geçersiz girdiyi reddeder', () => {
    expect(() => setAtlasPixels({})).toThrow(TypeError);
  });

  it('atlas dokusundan: üst yüz üstte (kırmızı, en parlak), sol/sağ yüzler yeşil ve sağ yüz sola göre karanlık; köşeler saydam', () => {
    setAtlasPixels(pixels);
    const size = 64;
    const ctx = mockCtx(size);
    paintItemIcon(ctx, 'blok:kumtaşı', size);
    const img = ctx.imageData;
    expect(img).toBeTruthy();
    const px = (x, y) => {
      const i = (y * size + x) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    };
    const top = px(32, 14);
    const left = px(18, 40);
    const right = px(46, 40);
    expect(top[3]).toBe(255);
    expect(top[0]).toBeGreaterThan(200);
    expect(top[1]).toBeLessThan(20);
    expect(left[1]).toBeGreaterThan(150); // yeşil, ×0.78
    expect(right[1]).toBeGreaterThan(100);
    expect(left[1]).toBeGreaterThan(right[1]); // sol yüz sağdan aydınlık
    expect(px(1, 1)[3]).toBe(0); // köşe saydam
    expect(px(62, 62)[3]).toBe(0);
    setAtlasPixels(null);
  });

  it('atlas yoksa tek renkli yedek küp çizilir (opak merkez, saydam köşe)', () => {
    setAtlasPixels(null);
    const size = 48;
    const ctx = mockCtx(size);
    paintItemIcon(ctx, 'blok:taş', size);
    const img = ctx.imageData;
    const c = (24 * size + 24) * 4;
    expect(img.data[c + 3]).toBe(255);
    expect(img.data[3]).toBe(0);
  });

  it('hızlı: 64 px blok simgesi ortalama < 6 ms (node, sahte bağlam)', () => {
    setAtlasPixels(pixels);
    const keys = ['blok:taş', 'blok:çimen', 'blok:kum', 'blok:tuğla', 'blok:cam'];
    keys.forEach((k) => paintItemIcon(mockCtx(), k, 64)); // ısınma
    const N = 150;
    const avg = bestOf(3, () => {
      const t0 = cpuMs();
      for (let i = 0; i < N; i++) paintItemIcon(mockCtx(), keys[i % keys.length], 64);
      return (cpuMs() - t0) / N;
    });
    expect(avg).toBeLessThan(scaled(6));
    setAtlasPixels(null);
  });
});

describe('heldItemsColor', () => {
  it('mixColor/shadeColor/cssColor/rgba', () => {
    expect(mixColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mixColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(shadeColor(0x808080, 2)).toBe(0xffffff);
    expect(shadeColor(0xffffff, 0.5)).toBe(0x808080);
    expect(cssColor(0x0a0b0c)).toBe('#0a0b0c');
    expect(rgba(0xff8000, 0.5)).toBe('rgba(255,128,0,0.5)');
  });
});
