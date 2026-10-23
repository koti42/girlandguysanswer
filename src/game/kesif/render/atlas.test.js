import { describe, it, expect } from 'vitest';
import { cpuMs, scaled } from '../../../test/perfScale.js';
import * as THREE from 'three';
import { TILE_NAMES, TILE_COUNT, tileIndex } from '../sim/blocks.js';
import {
  generateAtlasPixels, createAtlasTextures, tilePixel, hasPainter, painterNames, paintTileByName, SEAMLESS_TILES,
  TINT_DEFAULTS,
} from './atlas.js';
import { computeAtlasLayout, padFor } from './atlasLayout.js';

const t0 = cpuMs();
const px = generateAtlasPixels({ tileSize: 32 });
const genMs = cpuMs() - t0;
const N = px.tileSize;

// Harç/şerit/katman yapılı dokularda dikiş doğal bir yapı kenarıdır; yalnız en-kötü-iç-kenar sınırı uygulanır.
const STRUCTURED = new Set(['tuğla', 'taş_tuğla', 'kumtaşı_yan', 'kumtaşı_üst', 'kanyon_yan', 'bazalt_yan', 'bazalt_üst', 'akan_su', 'akan_lav', 'tahta_meşe', 'tahta_huş', 'tahta_çam', 'tahta_akasya']);

function tileStats(name, which = 'color') {
  const i = tileIndex(name);
  let sum = 0;
  let sum2 = 0;
  let aSum = 0;
  let aMin = 255;
  let aMax = 0;
  let chSum = [0, 0, 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = tilePixel(px, i, x, y, which);
      const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
      sum += l;
      sum2 += l * l;
      aSum += p[3];
      aMin = Math.min(aMin, p[3]);
      aMax = Math.max(aMax, p[3]);
      chSum = chSum.map((c, k) => c + p[k]);
    }
  }
  const n = N * N;
  const mean = sum / n;
  return {
    mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), aMean: aSum / n, aMin, aMax, ch: chSum.map((c) => c / n),
  };
}

describe('atlas: kayıt defteri ve yerleşim', () => {
  it('TILE_NAMES içindeki HER ad için boyayıcı var, fazlalık yok', () => {
    TILE_NAMES.forEach((n) => expect(hasPainter(n), n).toBe(true));
    const names = new Set(TILE_NAMES);
    painterNames().forEach((n) => expect(names.has(n), 'fazla boyayıcı ' + n).toBe(true));
    expect(painterNames().length).toBe(TILE_COUNT);
  });

  it('boyut 2 kuvveti, tamponlar tam, uv tablosu atlas içinde ve çakışmasız', () => {
    expect(px.tileCount).toBe(TILE_COUNT);
    expect(Math.log2(px.width) % 1).toBe(0);
    expect(Math.log2(px.height) % 1).toBe(0);
    expect(px.color.length).toBe(px.width * px.height * 4);
    expect(px.normal.length).toBe(px.color.length);
    expect(px.material.length).toBe(px.color.length);
    expect(px.pad).toBe(padFor(32));
    const seen = new Set();
    for (let i = 0; i < TILE_COUNT; i++) {
      const r = px.uvFor(i);
      expect(r[0]).toBeGreaterThanOrEqual(0);
      expect(r[2]).toBeLessThanOrEqual(1);
      expect(r[1]).toBeGreaterThanOrEqual(0);
      expect(r[3]).toBeLessThanOrEqual(1);
      expect((r[2] - r[0]) * px.width).toBeCloseTo(32, 4);
      expect((r[3] - r[1]) * px.height).toBeCloseTo(32, 4);
      const key = Math.round(r[0] * px.width) + ',' + Math.round(r[1] * px.height);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(Array.from(px.uvFor(5))).toEqual(Array.from(px.uvTable.slice(20, 24)));
    const layout = computeAtlasLayout({ tileCount: TILE_COUNT, tileSize: 32 });
    expect(layout.width).toBe(px.width);
    expect(Array.from(layout.uvTable)).toEqual(Array.from(px.uvTable));
  });

  it('kalite: düşük 16 px, 64 px desteklenir; boyutlar 2 kuvveti', () => {
    const lo = generateAtlasPixels({ quality: 'low' });
    expect(lo.tileSize).toBe(16);
    expect(lo.width).toBeLessThanOrEqual(px.width);
    expect(Math.log2(lo.width) % 1).toBe(0);
    const hi = generateAtlasPixels({ tileSize: 64 });
    expect(hi.tileSize).toBe(64);
    expect(Math.log2(hi.width) % 1).toBe(0);
    expect(hi.width).toBeGreaterThan(px.width);
  });

  it('başarım: tüm atlas üretimi', () => {
    console.log(`[atlas] ${TILE_COUNT} doku, ${px.width}x${px.height}, üretim ${genMs.toFixed(0)} ms`);
    expect(genMs).toBeLessThan(scaled(5000));
  });
});

describe('atlas: doku içeriği', () => {
  it('hiçbir doku boş/tek renk değil (dokular zengin)', () => {
    TILE_NAMES.forEach((n) => {
      const s = tileStats(n);
      expect(s.aMax, n + ' boş').toBeGreaterThan(20);
      // cam: renk düz olabilir ama alfa değişir
      const varied = s.std > 2 || s.aMax - s.aMin > 60;
      expect(varied, n + ' düz (std ' + s.std.toFixed(2) + ')').toBe(true);
    });
  });

  it('arazi dokularının kontrast ve ayrıntısı yeterli (std)', () => {
    ['taş', 'kırıktaş', 'toprak', 'çimen_üst', 'çakıl', 'kum', 'tuğla', 'taş_tuğla', 'bazalt_üst', 'cevher_elmas', 'tahta_meşe'].forEach((n) => {
      expect(tileStats(n).std, n).toBeGreaterThan(8);
    });
  });

  it('kesik dokularda (yaprak, bitki) delikler ve katı alan birlikte var', () => {
    ['yaprak_meşe', 'yaprak_huş', 'yaprak_çam', 'yaprak_akasya'].forEach((n) => {
      const s = tileStats(n);
      expect(s.aMin, n).toBe(0);
      expect(s.aMax, n).toBe(255);
      expect(s.aMean, n).toBeGreaterThan(160);
      expect(s.aMean, n).toBeLessThan(250);
    });
    ['gelincik', 'sarı_çiçek', 'uzun_ot', 'çalı', 'sarmaşık', 'meşale', 'ışıklı_mantar', 'kol', 'kol_açık'].forEach((n) => {
      const s = tileStats(n);
      expect(s.aMin, n).toBeLessThan(10);
      expect(s.aMean, n).toBeGreaterThan(20);
    });
  });

  it('şeffaf bloklar (cam, buz, su, bariyer, portal) kısmen saydam', () => {
    ['cam', 'cam_mavi', 'buz', 'su', 'akan_su', 'mühür_bariyeri', 'portal_mavi', 'portal_turuncu'].forEach((n) => {
      const s = tileStats(n);
      expect(s.aMean, n).toBeLessThan(235);
      expect(s.aMax, n).toBeGreaterThan(40);
    });
    // opak bloklar tam opak
    ['taş', 'toprak', 'tuğla', 'beton_mavi', 'ana_kaya'].forEach((n) => expect(tileStats(n).aMin, n).toBe(255));
  });

  it('kenar dolgusu karşı kenarı taşır (sarmalı bleed)', () => {
    const i = tileIndex('taş');
    const col = i % px.cols;
    const row = (i / px.cols) | 0;
    const base = (x, y) => {
      const gx = col * px.cell + px.pad + x;
      const gy = row * px.cell + px.pad + y; // GL satırı: y=0 alt
      const o = (gy * px.width + gx) * 4;
      return [px.color[o], px.color[o + 1], px.color[o + 2]];
    };
    for (let y = 0; y < N; y += 5) {
      expect(base(-1, y)).toEqual(base(N - 1, y));
      expect(base(N, y)).toEqual(base(0, y));
    }
    for (let x = 0; x < N; x += 5) {
      expect(base(x, -1)).toEqual(base(x, N - 1));
      expect(base(x, N)).toEqual(base(x, 0));
    }
  });

  it('döşenen dokular kenarlarda kusursuz birleşir (dikiş, iç kenarların en kötüsünden kötü değil)', () => {
    // E(x): x ile x+1 sütunları (son sütun → 0. sütun = dikiş) arasındaki ortalama renk farkı. Kusursuz döşemede dikiş
    // enerjisi, doku içindeki en sert sütun geçişini (harç çizgisi, çatlak) aşmaz.
    const energy = (i, axis) => {
      const e = [];
      for (let k = 0; k < N; k++) {
        let s = 0;
        for (let m = 0; m < N; m++) {
          const a = axis === 0 ? tilePixel(px, i, k, m) : tilePixel(px, i, m, k);
          const b = axis === 0 ? tilePixel(px, i, (k + 1) % N, m) : tilePixel(px, i, m, (k + 1) % N);
          s += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        }
        e.push(s / N);
      }
      return e;
    };
    SEAMLESS_TILES.forEach((n) => {
      const i = tileIndex(n);
      expect(i, n).toBeGreaterThanOrEqual(0);
      [0, 1].forEach((axis) => {
        const e = energy(i, axis);
        const seam = e[N - 1];
        const worstInner = Math.max(...e.slice(0, N - 1));
        const label = n + (axis ? ' dikey' : ' yatay') + ' dikiş';
        expect(seam, label).toBeLessThanOrEqual(worstInner * 1.3 + 5);
        if (!STRUCTURED.has(n)) {
          const mean = e.slice(0, N - 1).reduce((a, b) => a + b, 0) / (N - 1);
          expect(seam, label + ' (ortalama)').toBeLessThanOrEqual(mean * 2.2 + 2);
        }
      });
    });
  });

  it('normal haritası: birim vektörler, +Z yukarı; düz doku düze yakın, kaba doku eğimli', () => {
    const check = (name) => {
      const i = tileIndex(name);
      let dev = 0;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const p = tilePixel(px, i, x, y, 'normal');
          const nx = p[0] / 127.5 - 1;
          const ny = p[1] / 127.5 - 1;
          const nz = p[2] / 127.5 - 1;
          expect(Math.hypot(nx, ny, nz)).toBeGreaterThan(0.97);
          expect(Math.hypot(nx, ny, nz)).toBeLessThan(1.03);
          expect(nz).toBeGreaterThan(0);
          dev += Math.hypot(nx, ny);
        }
      }
      return dev / (N * N);
    };
    expect(check('kırıktaş')).toBeGreaterThan(check('kar') * 3);
    expect(check('tuğla')).toBeGreaterThan(0.05);
  });

  it('malzeme: kuantum, lav, rünler, meşale, alıcı_aktif ışır; taş/toprak ışımaz', () => {
    const emit = (n) => tileStats(n, 'material').ch[1];
    expect(emit('taş')).toBeLessThan(3);
    expect(emit('toprak')).toBeLessThan(3);
    expect(emit('cevher_kuantum')).toBeGreaterThan(emit('cevher_demir') + 8);
    expect(emit('lav')).toBeGreaterThan(80);
    expect(emit('akan_lav')).toBeGreaterThan(80);
    expect(emit('ışık_bloğu')).toBeGreaterThan(150);
    expect(emit('alıcı_aktif')).toBeGreaterThan(emit('alıcı') + 20);
    expect(emit('plaka_basılı')).toBeGreaterThan(emit('plaka') + 8);
    ['rün_kırmızı', 'rün_mavi', 'rün_yeşil', 'rün_sarı', 'rün_mor', 'mühür_bariyeri', 'meşale'].forEach((n) => {
      expect(emit(n), n).toBeGreaterThan(15);
    });
    // pürüzlülük: buz/ayna pürüzsüz, toprak pürüzlü
    const rough = (n) => tileStats(n, 'material').ch[0];
    expect(rough('ayna')).toBeLessThan(40);
    expect(rough('buz')).toBeLessThan(90);
    expect(rough('toprak')).toBeGreaterThan(190);
    // AO kanalı 0..255, tamamı opak malzeme alfası tonlanan dokularda 255
    expect(tileStats('çimen_üst', 'material').aMean).toBeGreaterThan(250);
  });

  it('çimen yanında ton maskesi: üst sarkık yeşil, alt toprak (maske 0)', () => {
    const i = tileIndex('çimen_yan');
    expect(tilePixel(px, i, 5, 1, 'material')[3]).toBe(255);
    expect(tilePixel(px, i, 5, 28, 'material')[3]).toBe(0);
    expect(px.tintKinds[tileIndex('çimen_üst')]).toBe(1);
    expect(px.tintKinds[i]).toBe(1);
    expect(px.tintKinds[tileIndex('toprak')]).toBe(0);
    expect(px.tintKinds[tileIndex('yaprak_meşe')]).toBe(2);
    expect(px.tintKinds[tileIndex('su')]).toBe(3);
    expect(px.tintKinds[tileIndex('taş')]).toBe(0);
    expect(TINT_DEFAULTS.grass).toBe(0x79bd4b);
  });

  it('rün taşları: beş FARKLI şekil (renk körlüğü), her biri kendi renginde', () => {
    const names = ['rün_kırmızı', 'rün_mavi', 'rün_yeşil', 'rün_sarı', 'rün_mor'];
    const masks = names.map((n) => {
      const i = tileIndex(n);
      const m = [];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) m.push(tilePixel(px, i, x, y, 'material')[1] > 200 ? 1 : 0);
      }
      return m;
    });
    const area = masks.map((m) => m.reduce((a, b) => a + b, 0));
    area.forEach((a) => expect(a).toBeGreaterThan(40));
    for (let a = 0; a < 5; a++) {
      for (let b = a + 1; b < 5; b++) {
        let inter = 0;
        let uni = 0;
        for (let k = 0; k < masks[a].length; k++) {
          inter += masks[a][k] & masks[b][k];
          uni += masks[a][k] | masks[b][k];
        }
        expect(inter / uni, names[a] + ' ~ ' + names[b]).toBeLessThan(0.78);
      }
    }
    // baskın kanal: kırmızı→R, mavi→B, yeşil→G
    const dom = (n) => {
      const i = tileIndex(n);
      const acc = [0, 0, 0];
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          if (tilePixel(px, i, x, y, 'material')[1] > 200) {
            const p = tilePixel(px, i, x, y);
            acc[0] += p[0];
            acc[1] += p[1];
            acc[2] += p[2];
          }
        }
      }
      return acc;
    };
    expect(dom('rün_kırmızı')[0]).toBeGreaterThan(dom('rün_kırmızı')[2] * 1.4);
    expect(dom('rün_mavi')[2]).toBeGreaterThan(dom('rün_mavi')[0] * 1.3);
    expect(dom('rün_yeşil')[1]).toBeGreaterThan(dom('rün_yeşil')[0] * 1.2);
    expect(dom('rün_sarı')[0] + dom('rün_sarı')[1]).toBeGreaterThan(dom('rün_sarı')[2] * 2.5);
    expect(dom('rün_mor')[2]).toBeGreaterThan(dom('rün_mor')[1] * 1.3);
  });

  it('cevherler birbirinden ve taştan ayırt edilir (renk imzası)', () => {
    const sig = (n) => tileStats(n).ch;
    const ores = ['cevher_kömür', 'cevher_bakır', 'cevher_demir', 'cevher_altın', 'cevher_elmas', 'cevher_kuantum', 'cevher_kızıltaş', 'cevher_zümrüt'];
    const stone = tileStats('taş').ch;
    // elmas: mavi/yeşil kanallar kırmızıdan baskın; altın: kırmızı>mavi
    const dia = sig('cevher_elmas');
    const gold = sig('cevher_altın');
    expect(dia[2]).toBeGreaterThan(dia[0] * 0.95);
    expect(gold[0] - gold[2]).toBeGreaterThan(stone[0] - stone[2] + 4);
    for (let a = 0; a < ores.length; a++) {
      const sa = paintTileByName(ores[a]);
      const stoneTile = paintTileByName('taş');
      let diff = 0;
      for (let i = 0; i < N * N; i++) diff += Math.abs(sa.c[i * 4] - stoneTile.c[i * 4]) + Math.abs(sa.c[i * 4 + 1] - stoneTile.c[i * 4 + 1]);
      expect(diff, ores[a]).toBeGreaterThan(8);
    }
  });
});

describe('atlas: belirlenimcilik', () => {
  it('aynı seed aynı özet, farklı seed farklı özet', () => {
    const a = generateAtlasPixels({ tileSize: 32 });
    expect(a.hash).toBe(px.hash);
    expect(Array.from(a.color.slice(0, 5000))).toEqual(Array.from(px.color.slice(0, 5000)));
    const b = generateAtlasPixels({ tileSize: 32, seed: 12345 });
    expect(b.hash).not.toBe(px.hash);
    expect(px.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('paintTileByName aynı girdiye aynı çıktı', () => {
    const a = paintTileByName('lav');
    const b = paintTileByName('lav');
    expect(Array.from(a.c)).toEqual(Array.from(b.c));
    expect(Array.from(a.h)).toEqual(Array.from(b.h));
    expect(() => paintTileByName('yok_boyle_doku')).toThrow();
  });
});

describe('atlas: three dokuları', () => {
  it('createAtlasTextures üç doku üretir (sRGB renk, mipmap, düz veri), dispose çalışır', () => {
    const tex = createAtlasTextures(THREE, px, { anisotropy: 8 });
    expect(tex.map.image.width).toBe(px.width);
    expect(tex.map.image.height).toBe(px.height);
    expect(tex.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(tex.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(tex.materialMap.colorSpace).toBe(THREE.NoColorSpace);
    expect(tex.map.generateMipmaps).toBe(true);
    expect(tex.map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.map.magFilter).toBe(THREE.NearestFilter);
    expect(tex.normalMap.magFilter).toBe(THREE.LinearFilter);
    expect(tex.map.anisotropy).toBe(8);
    expect(tex.map.flipY).toBe(false);
    expect(tex.map.image.data).toBeInstanceOf(Uint8Array);
    expect(tex.uvFor(7)).toEqual(px.uvFor(7));
    let disposed = 0;
    [tex.map, tex.normalMap, tex.materialMap].forEach((t) => t.addEventListener('dispose', () => { disposed++; }));
    tex.dispose();
    expect(disposed).toBe(3);
  });
});

describe('sprite dokularında dolgu (qaplay: uzun otun üstünde kesik kesik koyu çizgiler)', () => {
  // Çapraz bitki tek dörtgendir; sarmal dolgu karşı kenarı (kök satırları) üst kenara taşıyıp bilinear/mip örneklemede
  // otun üstünde yüzen koyu çizgi çiziyordu. Dolgu satırları kenar pikselinin kopyası olmalı.
  it.each(['uzun_ot', 'gelincik', 'sarı_çiçek'])('%s: üst/alt/yan dolgu kenar pikselini tekrarlar', (name) => {
    const i = tileIndex(name);
    const cols = px.cols;
    const col = i % cols;
    const row = (i / cols) | 0;
    const x0 = col * px.cell;
    const y0 = row * px.cell;
    const at = (gx, gy, c) => px.color[((y0 + gy) * px.width + x0 + gx) * 4 + c];
    const n = px.tileSize;
    const pad = px.pad;
    for (let gx = 0; gx < px.cell; gx++) {
      const cx = Math.min(n - 1, Math.max(0, gx - pad)) + pad;
      for (let k = 0; k < pad; k++) {
        for (let c = 0; c < 4; c++) {
          expect(at(gx, k, c)).toBe(at(cx, pad, c)); // GL altı tarafı dolgu = ilk içerik satırı
          expect(at(gx, pad + n + k, c)).toBe(at(cx, pad + n - 1, c)); // üst taraf dolgu = son içerik satırı
        }
      }
    }
    for (let gy = 0; gy < px.cell; gy++) {
      const cy = Math.min(n - 1, Math.max(0, gy - pad)) + pad;
      for (let k = 0; k < pad; k++) {
        for (let c = 0; c < 4; c++) {
          expect(at(k, gy, c)).toBe(at(pad, cy, c));
          expect(at(pad + n + k, gy, c)).toBe(at(pad + n - 1, cy, c));
        }
      }
    }
  });

  it('uzun_ot: tile üst dolgu satırları saydam (kök satırı üste sızmaz)', () => {
    const i = tileIndex('uzun_ot');
    const col = i % px.cols;
    const row = (i / px.cols) | 0;
    const x0 = col * px.cell;
    const y0 = row * px.cell;
    // veri satırı büyük = v yukarı (dokunun ÜSTü); üst dolgu son pad satırlarıdır
    for (let k = 0; k < px.pad; k++) {
      for (let gx = 0; gx < px.cell; gx++) {
        expect(px.color[((y0 + px.cell - 1 - k) * px.width + x0 + gx) * 4 + 3]).toBe(0);
      }
    }
  });

  it('döşenen (sarmal) dokular sarmal dolguyu korur (taş: dolgu satırı = karşı kenar)', () => {
    const i = tileIndex('taş');
    const x0 = (i % px.cols) * px.cell;
    const y0 = ((i / px.cols) | 0) * px.cell;
    const n = px.tileSize;
    const pad = px.pad;
    for (let gx = pad; gx < pad + n; gx++) {
      for (let c = 0; c < 3; c++) {
        expect(px.color[((y0 + pad - 1) * px.width + x0 + gx) * 4 + c]).toBe(px.color[((y0 + pad + n - 1) * px.width + x0 + gx) * 4 + c]);
      }
    }
  });

  it('uzun_ot: sprite boyası doku dışına taşıp karşı kenara sarmaz (üst 2 satır boş)', () => {
    const t = paintTileByName('uzun_ot', 0);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < t.n; x++) expect(t.c[(y * t.n + x) * 4 + 3]).toBe(0);
    }
  });
});
