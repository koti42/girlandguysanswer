import { describe, expect, it } from 'vitest';
import { TILE_COUNT, TILE_NAMES, tileIndex, getBlock } from '../sim/blocks.js';
import { CITY_BLOCK_DEFS, WET_BLOCK_IDS, WET_TILE_NAMES } from '../sim/cityData.js';
import {
  generateAtlasPixels, hasPainter, paintTileByName, tilePixel, painterNames,
} from './atlas.js';
import { CITY_PAINTERS, CITY_TILE_NAMES, NEON_COLORS } from './atlasTilesCity.js';
import { computeAtlasLayout } from './atlasLayout.js';

const N = 32;
const px = generateAtlasPixels({ tileSize: 32 });

function stats(name, which = 'color') {
  const i = tileIndex(name);
  let sum = 0;
  let sum2 = 0;
  let aMin = 255;
  let aMax = 0;
  let aSum = 0;
  const ch = [0, 0, 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = tilePixel(px, i, x, y, which);
      const l = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
      sum += l;
      sum2 += l * l;
      aMin = Math.min(aMin, p[3]);
      aMax = Math.max(aMax, p[3]);
      aSum += p[3];
      ch[0] += p[0];
      ch[1] += p[1];
      ch[2] += p[2];
    }
  }
  const mean = sum / (N * N);
  return {
    mean, std: Math.sqrt(Math.max(0, sum2 / (N * N) - mean * mean)), aMin, aMax, aMean: aSum / (N * N), ch: ch.map((c) => c / (N * N)),
  };
}

/** Sanat koordinatında piksel kanalı (tilePixel y=0 üst). */
const col = (name, x, y, which = 'color') => tilePixel(px, tileIndex(name), x, y, which);

describe('atlasTilesCity: kayıt ve atlas invariantları', () => {
  it('yeni doku sayısı ≤ 24 (20), hepsinin boyayıcısı var ve TILE_NAMES içinde, bitişik blok olarak sona eklenmiş', () => {
    expect(CITY_TILE_NAMES).toHaveLength(20);
    expect(CITY_TILE_NAMES.length).toBeLessThanOrEqual(24);
    const idx = CITY_TILE_NAMES.map((n) => tileIndex(n)).sort((a, b) => a - b);
    idx.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    expect(idx[idx.length - 1] - idx[0]).toBe(idx.length - 1); // bitişik
    CITY_TILE_NAMES.forEach((n) => {
      expect(hasPainter(n), n).toBe(true);
      expect(typeof CITY_PAINTERS[n]).toBe('function');
    });
    // mevcut dokuların indeksleri değişmedi: taş 0'da, şehir dokuları hepsinden SONRA
    expect(tileIndex('taş')).toBe(0);
    const nonCity = TILE_NAMES.filter((n) => CITY_TILE_NAMES.indexOf(n) < 0);
    expect(idx[0]).toBe(nonCity.length);
    // şehir blokları yalnız bu dokulardan ve mevcut 'cephe_koyu' yeniden kullanımından oluşur
    CITY_BLOCK_DEFS.forEach((d) => {
      const r = getBlock(d.id);
      [r.tileNames.top, r.tileNames.bottom, r.tileNames.side].forEach((n) => expect(CITY_TILE_NAMES).toContain(n));
    });
  });

  it('atlas hâlâ 512×1024 (32 px) ve 261 dokuya kadar sığar; tüm boyayıcılar ad kümesiyle bire bir', () => {
    expect(TILE_COUNT).toBeLessThanOrEqual(264);
    expect(px.width).toBe(512);
    expect(px.height).toBe(1024);
    const l = computeAtlasLayout({ tileCount: 261, tileSize: 32 });
    expect(l.width).toBe(512);
    expect(l.height).toBe(1024);
    expect(painterNames().length).toBe(TILE_COUNT);
  });

  it('belirlenimci: aynı tohum aynı piksel; her doku boyanabilir ve zengin', () => {
    CITY_TILE_NAMES.forEach((n) => {
      const a = paintTileByName(n, 0);
      const b = paintTileByName(n, 0);
      expect(Array.from(a.c), n).toEqual(Array.from(b.c));
      expect(Array.from(a.e)).toEqual(Array.from(b.e));
      const s = stats(n);
      expect(s.aMax, n).toBeGreaterThan(200);
      expect(s.std > 3 || s.aMax - s.aMin > 100, n + ' düz').toBe(true);
      // NaN yok
      a.c.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });
  });

  it('ıslak yüzey tablosu bloklarla tutarlı', () => {
    WET_BLOCK_IDS.forEach((id) => expect(WET_TILE_NAMES).toContain(getBlock(id).tileNames.top));
    WET_TILE_NAMES.forEach((n) => expect(CITY_TILE_NAMES).toContain(n));
  });
});

describe('atlasTilesCity: yol dokuları', () => {
  it('asfalt opak, koyu, tanecikli; pürüzlülükte "cilalı yama" varyasyonu var (ıslak yansıma verisi)', () => {
    const s = stats('asfalt');
    expect(s.aMin).toBe(255);
    expect(s.mean).toBeLessThan(110);
    expect(s.mean).toBeGreaterThan(25);
    expect(s.std).toBeGreaterThan(5);
    const r = stats('asfalt', 'material');
    // R = pürüzlülük: genel pürüzlü ama düşük pürüzlü yamalar da var
    const i = tileIndex('asfalt');
    let lo = 255;
    let hi = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = tilePixel(px, i, x, y, 'material')[0];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    expect(hi).toBeGreaterThan(200);
    expect(lo).toBeLessThan(195);
    expect(hi - lo).toBeGreaterThan(25);
    expect(r.ch[1]).toBeLessThan(3); // asfalt ışımaz
  });

  it('asfalt kusursuz döşenir (her iki eksende dikiş en kötü iç kenardan kötü değil)', () => {
    const energy = (name, axis) => {
      const i = tileIndex(name);
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
    [['asfalt', [0, 1]], ['asfalt_çizgi_x', [0]], ['asfalt_çizgi_z', [1]], ['zebra_x', [0]], ['zebra_z', [1]], ['asfalt_yan', [0]],
      ['kaldırım_yan', [0]], ['neon_camgöbeği', [0]], ['neon_pembe', [0]], ['neon_kehribar', [0]], ['neon_limon', [0]]]
      .forEach(([name, axes]) => {
        axes.forEach((axis) => {
          const e = energy(name, axis);
          const worst = Math.max(...e.slice(0, N - 1));
          expect(e[N - 1], name + ' dikiş ' + axis).toBeLessThanOrEqual(worst * 1.3 + 5);
        });
      });
  });

  it('şerit çizgileri: X çizgisi satır, Z çizgisi sütun boyunca (yönler farklı); boya sarı, aşınmış', () => {
    const rowMean = (name, y) => {
      let s = 0;
      for (let x = 0; x < N; x++) s += tilePixel(px, tileIndex(name), x, y)[0];
      return s / N;
    };
    const colMean = (name, x) => {
      let s = 0;
      for (let y = 0; y < N; y++) s += tilePixel(px, tileIndex(name), x, y)[0];
      return s / N;
    };
    // X: orta satırlar parlak, kenar satırlar koyu
    expect(rowMean('asfalt_çizgi_x', 15)).toBeGreaterThan(rowMean('asfalt_çizgi_x', 5) + 60);
    expect(colMean('asfalt_çizgi_z', 15)).toBeGreaterThan(colMean('asfalt_çizgi_z', 5) + 60);
    // X çizgisi sütun boyunca düz (ortalama sütun farkı küçük), Z çizgisi satır boyunca düz
    const spreadCols = [];
    for (let x = 0; x < N; x++) spreadCols.push(colMean('asfalt_çizgi_x', x));
    expect(Math.max(...spreadCols) - Math.min(...spreadCols)).toBeLessThan(25);
    const p = col('asfalt_çizgi_x', 16, 15);
    expect(p[0]).toBeGreaterThan(p[2] + 30); // sarı: R/G >> B
  });

  it('zebra: X çubuğu yatay (satır kümeleri), Z çubuğu dikey; beyaz kapsama %30–60', () => {
    const white = (name) => {
      let n = 0;
      const i = tileIndex(name);
      const rows = new Array(N).fill(0);
      const cols = new Array(N).fill(0);
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const p = tilePixel(px, i, x, y);
          if (p[0] > 140 && p[1] > 140) {
            n++;
            rows[y]++;
            cols[x]++;
          }
        }
      }
      return { frac: n / (N * N), rows, cols };
    };
    const zx = white('zebra_x');
    const zz = white('zebra_z');
    expect(zx.frac).toBeGreaterThan(0.25);
    expect(zx.frac).toBeLessThan(0.6);
    expect(zz.frac).toBeGreaterThan(0.25);
    expect(zz.frac).toBeLessThan(0.6);
    const maxRows = Math.max(...zx.rows);
    expect(maxRows).toBeGreaterThan(20);
    expect(Math.max(...zx.cols)).toBeLessThan(maxRows); // sütunlarda dolu değil (bir çubuk 14/32)
    expect(Math.max(...zz.cols)).toBeGreaterThan(20);
    expect(Math.max(...zz.rows)).toBeLessThan(Math.max(...zz.cols));
  });

  it('kaldırım: plaka derzleri + sol-alt dokunsal kubbeli plaka (yükseklik/normal farkı); yan: dudak aydınlık', () => {
    const t = paintTileByName('kaldırım', 0);
    // yükseklik haritası: dokunsal plakada belirgin varyasyon, normal plakada düz
    const hv = (x0, y0) => {
      let mn = 9;
      let mx = -9;
      for (let y = y0; y < y0 + 14; y++) {
        for (let x = x0; x < x0 + 14; x++) {
          const h = t.h[y * N + x];
          mn = Math.min(mn, h);
          mx = Math.max(mx, h);
        }
      }
      return mx - mn;
    };
    expect(hv(1, 17)).toBeGreaterThan(0.25); // tactile
    expect(hv(17, 1)).toBeLessThan(0.15); // düz plaka
    expect(stats('kaldırım').mean).toBeGreaterThan(stats('asfalt').mean + 40);
    // derz: x=0 sütunu komşu iç piksellerden koyu
    expect(col('kaldırım', 0, 8)[0]).toBeLessThan(col('kaldırım', 8, 8)[0]);
    const side = stats('kaldırım_yan');
    expect(side.aMin).toBe(255);
    expect(tilePixel(px, tileIndex('kaldırım_yan'), 8, 1)[0]).toBeGreaterThan(tilePixel(px, tileIndex('kaldırım_yan'), 8, 30)[0]);
  });

  it('yol kesiti: üstte asfalt koyu bant, altı açık dolgu', () => {
    const top = col('asfalt_yan', 8, 1);
    const mid = col('asfalt_yan', 8, 12);
    expect(top[0] + top[1] + top[2]).toBeLessThan(mid[0] + mid[1] + mid[2] + 10);
    expect(stats('asfalt_yan').aMin).toBe(255);
  });
});

describe('atlasTilesCity: neon tüpler', () => {
  const domOf = (name) => {
    const s = stats(name);
    return s.ch;
  };

  it('dört tüp: çekirdek tam ışır (e=255), halka sönümlü, gövde karanlık; renkler birbirinden ayrı ve doğru baskın kanal', () => {
    const names = ['neon_camgöbeği', 'neon_pembe', 'neon_kehribar', 'neon_limon'];
    names.forEach((n) => {
      const core = col(n, 8, 16, 'material');
      expect(core[1], n + ' çekirdek').toBeGreaterThan(245);
      const edge = col(n, 8, 11, 'material');
      expect(edge[1], n + ' kenar').toBeGreaterThan(100);
      expect(edge[1]).toBeLessThan(core[1]);
      const halo = col(n, 8, 8, 'material');
      expect(halo[1], n + ' hale').toBeGreaterThan(5);
      expect(halo[1], n + ' hale').toBeLessThan(edge[1]);
      expect(col(n, 8, 0, 'material')[1], n + ' gövde').toBeLessThan(15);
      // kenet ışımayı keser
      expect(col(n, 0, 16, 'material')[1], n + ' kenet').toBeLessThan(10);
    });
    const [cy, pk, am, lm] = names.map(domOf);
    expect(cy[2]).toBeGreaterThan(cy[0] + 8); // camgöbeği: B,G > R
    expect(cy[1]).toBeGreaterThan(cy[0] + 8);
    expect(pk[0]).toBeGreaterThan(pk[1] + 10); // pembe: R > G
    expect(pk[2]).toBeGreaterThan(pk[1]);
    expect(am[0]).toBeGreaterThan(am[2] + 20); // kehribar: R > B
    expect(am[1]).toBeGreaterThan(am[2]);
    expect(lm[1]).toBeGreaterThan(lm[2] + 20); // limon: G > B
    expect(lm[0]).toBeGreaterThan(lm[2]);
    // çekirdek rengi beyaza yakın ama tondan kopmaz
    const pc = col('neon_pembe', 8, 16);
    expect(pc[0]).toBeGreaterThan(pc[1]);
    expect(NEON_COLORS.pembe[0]).toBeGreaterThan(NEON_COLORS.pembe[1]);
  });

  it('tüp gövdeden belirgin parlak; tüm yüksek ışımalı piksellerin ortalama parlaklığı > gövde', () => {
    ['neon_camgöbeği', 'neon_pembe', 'neon_kehribar', 'neon_limon'].forEach((n) => {
      const core = col(n, 8, 16);
      const body = col(n, 8, 1);
      expect(core[0] + core[1] + core[2]).toBeGreaterThan((body[0] + body[1] + body[2]) * 5);
    });
  });
});

describe('atlasTilesCity: pencereler (3 durum)', () => {
  it('sönük: ışımaz (yalnız minik bekleme ışığı), cam parlak yansıtır (düşük pürüzlülük); yanık: parlak ve ışır', () => {
    const dark = stats('pencere_karanlık', 'material');
    expect(dark.ch[1]).toBeLessThan(2);
    const rough = col('pencere_karanlık', 16, 16, 'material')[0];
    expect(rough).toBeLessThan(70);
    const warm = stats('pencere_sıcak', 'material');
    const cool = stats('pencere_soğuk', 'material');
    expect(warm.ch[1]).toBeGreaterThan(90);
    expect(cool.ch[1]).toBeGreaterThan(90);
    expect(stats('pencere_sıcak').mean).toBeGreaterThan(stats('pencere_karanlık').mean * 3);
    expect(stats('pencere_soğuk').mean).toBeGreaterThan(stats('pencere_karanlık').mean * 3);
  });

  it('sıcak: kırmızı/sarı baskın; soğuk: mavi baskın; üçü de opak (çerçeve + cam)', () => {
    const w = stats('pencere_sıcak').ch;
    const c = stats('pencere_soğuk').ch;
    expect(w[0]).toBeGreaterThan(w[2] + 40);
    expect(c[2]).toBeGreaterThan(c[0] + 30);
    ['pencere_karanlık', 'pencere_sıcak', 'pencere_soğuk'].forEach((n) => expect(stats(n).aMin, n).toBe(255));
  });

  it('çerçeve koyu ve ışımaz; cam alanı çerçeveden ayrışır (yanık)', () => {
    ['pencere_sıcak', 'pencere_soğuk'].forEach((n) => {
      const frame = col(n, 10, 30); // denizlik
      const glass = col(n, 16, 11);
      const fl = frame[0] + frame[1] + frame[2];
      const gl = glass[0] + glass[1] + glass[2];
      expect(gl, n).toBeGreaterThan(fl * 2);
      expect(col(n, 10, 30, 'material')[1], n + ' çerçeve ışıması').toBeLessThan(10);
      expect(col(n, 16, 11, 'material')[1], n + ' cam ışıması').toBeGreaterThan(100);
    });
  });

  it('iç mekân silüetleri: soğukta ekran en parlak nokta (e≈255); sıcakta tavan lambası', () => {
    const screen = col('pencere_soğuk', 12, 16, 'material');
    expect(screen[1]).toBeGreaterThan(240);
    const lamp = col('pencere_sıcak', 11, 4);
    expect(lamp[0]).toBeGreaterThan(220);
    expect(lamp[1]).toBeGreaterThan(200);
  });
});

describe('atlasTilesCity: cephe, holo, kapılar', () => {
  it('cephe paneli: koyu ≪ açık; ikisi de opak ve yüksek-frekanslı detaylı', () => {
    const d = stats('cephe_koyu');
    const l = stats('cephe_açık');
    expect(d.aMin).toBe(255);
    expect(l.aMin).toBe(255);
    expect(l.mean).toBeGreaterThan(d.mean + 80);
    expect(d.mean).toBeLessThan(70);
    expect(d.std).toBeGreaterThan(2);
    expect(l.std).toBeGreaterThan(6);
    expect(stats('cephe_koyu', 'material').ch[1]).toBeLessThan(2);
  });

  it('holo panel: tarama çizgileri (tek satırlar daha koyu), yüksek ışıma, çerçeve en parlak', () => {
    const i = tileIndex('holo_panel');
    let even = 0;
    let odd = 0;
    for (let y = 4; y < 28; y++) {
      let s = 0;
      for (let x = 4; x < 28; x++) {
        const p = tilePixel(px, i, x, y);
        s += p[0] + p[1] + p[2];
      }
      if (y % 2 === 0) even += s;
      else odd += s;
    }
    expect(even).toBeGreaterThan(odd * 1.25);
    expect(stats('holo_panel', 'material').ch[1]).toBeGreaterThan(60);
    expect(col('holo_panel', 0, 10, 'material')[1]).toBeGreaterThan(245);
    expect(stats('holo_panel').aMin).toBe(255);
  });

  it('kayar kapı: kapalı tam opak; açık orta boşluk (alfa 0) + opak çerçeve; çerçeve kapalıda camgöbeği, açıkta yeşil', () => {
    const closed = stats('kayar_kapı');
    const open = stats('kayar_kapı_açık');
    expect(closed.aMin).toBe(255);
    expect(open.aMin).toBe(0);
    expect(open.aMax).toBe(255);
    expect(open.aMean).toBeLessThan(closed.aMean - 40);
    expect(col('kayar_kapı_açık', 16, 14)[3]).toBe(0); // açıklık
    expect(col('kayar_kapı_açık', 16, 1)[3]).toBe(255); // üst çerçeve
    expect(col('kayar_kapı_açık', 1, 14)[3]).toBe(255); // yan çerçeve
    const fc = col('kayar_kapı', 1, 14);
    const fo = col('kayar_kapı_açık', 1, 14);
    expect(fc[2]).toBeGreaterThan(fc[0] + 40); // camgöbeği
    expect(fo[1]).toBeGreaterThan(fo[2] + 20); // yeşil
    expect(col('kayar_kapı', 1, 14, 'material')[1]).toBeGreaterThan(240);
    expect(col('kayar_kapı_açık', 1, 14, 'material')[1]).toBeGreaterThan(240);
    // her ikisinde tehlike şeridi (alt) sarı/siyah dönüşümlü
    const ys = [];
    for (let x = 4; x < 28; x++) ys.push(col('kayar_kapı', x, 27)[0]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(120);
  });
});
