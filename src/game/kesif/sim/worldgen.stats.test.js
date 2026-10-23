/*
 * Dünya üretimi istatistik özeti (regresyon yakalayıcı) — DERİN DÜNYA (y -400..367).
 * Her bölgeden belirlenimci örnek sütunlar (yüzey bandı + tüm derin kesitler) üretir; yükseklik histogramı, biyom payları, su payı,
 * derinlik bantlarına göre mağara/sıvı hacmi ve maden sayılarını ASCII olarak yazdırır ve savunulabilir aralıkları doğrular.
 * Arazi ayarı (worldgenTerrain/Caves/Deep/Ores) bilinçli değiştirildiyse aralıklar buradan güncellenir.
 */
import { describe, expect, it } from 'vitest';
import {
  BIOME_KEYS, DEPTH_BANDS, SEA_LEVEL, WORLD_Y_MAX, ZONES,
} from './constants.js';
import { B, isLiquid } from './blocks.js';
import { generateChunk, zoneForChunk } from './worldgen.js';

const SEEDS = [20261016, 777];
const PER_ZONE = 24;
const ORE_IDS = [B.COAL_ORE, B.COPPER_ORE, B.IRON_ORE, B.GOLD_ORE, B.REDSTONE_ORE, B.DIAMOND_ORE, B.QUANTUM_ORE, B.EMERALD_ORE];
const ORE_NAMES = ['kömür', 'bakır', 'demir', 'altın', 'kızıltaş', 'elmas', 'kuantum', 'zümrüt'];
// [yMin, yMax] dahil; derinlik bantlarına karşılık gelir (Dip, Ham Kayalık, Derin, Mağaralar, yüzey, gökyüzü)
const BANDS = [[-400, -341], [-340, -221], [-220, -81], [-80, 19], [20, 119], [120, 367]];
const BAND_NAMES = ['Dip', 'Ham Kayalık', 'Derin Mağaralar', 'Mağaralar', 'Yüzey (≤119)', 'Yüksek'];
const BAND_OF = new Int8Array(768);
for (let i = 0; i < 768; i++) {
  const y = -400 + i;
  BAND_OF[i] = BANDS.findIndex((b) => y >= b[0] && y <= b[1]);
}

function newStats() {
  return {
    cols: 0,
    water: 0,
    biome: new Array(BIOME_KEYS.length).fill(0),
    heights: [],
    band: BANDS.map(() => ({
      total: 0, air: 0, water: 0, lava: 0, stone: 0, basalt: 0,
    })),
    ore: ORE_IDS.map(() => BANDS.map(() => 0)),
    oreMinY: ORE_IDS.map(() => 999),
    oreMaxY: ORE_IDS.map(() => -999),
  };
}

function isFoliageOrPlant(b) {
  return b >= 40 && b <= 59 && b !== B.CACTUS;
}

function collect() {
  const zones = ZONES.map(() => newStats());
  let chunks = 0;
  for (let s = 0; s < SEEDS.length; s++) {
    for (let zi = 0; zi < ZONES.length; zi++) {
      const z = ZONES[zi];
      for (let k = 0; k < PER_ZONE; k++) {
        const ang = k * 2.399963 + zi + s * 1.7;
        const r = z.rIn + 12 + (((k * 37 + s * 11) % 100) / 100) * (z.rOut - z.rIn - 24);
        const cx = Math.floor((Math.cos(ang) * r) / 16);
        const cz = Math.floor((Math.sin(ang) * r) / 16);
        if (zoneForChunk(cx, cz) !== zi) continue;
        const c = generateChunk(SEEDS[s], cx, cz, { light: false, seal: false, sections: 'all' });
        const d = c.toDense(-400, 768);
        chunks++;
        const st = zones[zi];
        for (let col = 0; col < 256; col++) {
          st.cols++;
          st.biome[c.biomeMap[col]]++;
          let y = c.heightMap[col];
          while (y > 0) {
            const b = c.get(col & 15, y, col >> 4);
            if (b === 0 || isLiquid(b) || isFoliageOrPlant(b) || b === B.ICE) y--;
            else break;
          }
          st.heights.push(y);
          if (y < SEA_LEVEL) st.water++;
        }
        for (let i = 0; i < d.length; i++) {
          const bi = BAND_OF[i >> 8];
          if (bi < 0) continue;
          const y = -400 + (i >> 8);
          const b = d[i];
          const bs = st.band[bi];
          bs.total++;
          if (b === 0) bs.air++;
          else if (b === B.WATER) bs.water++;
          else if (b === B.LAVA) bs.lava++;
          else if (b === B.STONE) bs.stone++;
          else if (b === B.BASALT) bs.basalt++;
          if (b >= B.COAL_ORE && b <= B.EMERALD_ORE) {
            const oi = ORE_IDS.indexOf(b);
            if (oi >= 0) {
              st.ore[oi][bi]++;
              if (y < st.oreMinY[oi]) st.oreMinY[oi] = y;
              if (y > st.oreMaxY[oi]) st.oreMaxY[oi] = y;
            }
          }
        }
      }
    }
  }
  return { zones, chunks };
}

function pct(arr, p) {
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
}

function histogram(heights) {
  const bins = new Array(26).fill(0); // 0-9, 10-19 ... 250+
  heights.forEach((h) => {
    bins[Math.min(25, Math.floor(h / 10))]++;
  });
  const max = Math.max(...bins);
  const last = bins.reduce((acc, n, i) => (n > 0 ? i : acc), 0);
  return bins.slice(0, last + 1).map((n, i) => String(i * 10).padStart(3) + '-' + String(i * 10 + 9).padEnd(3)
    + ' ' + '#'.repeat(Math.round((n / max) * 28)) + ' ' + (100 * n / heights.length).toFixed(1) + '%').join('\n');
}

describe('dünya üretimi istatistikleri (derin dünya)', { timeout: 120000 }, () => {
  const { zones, chunks } = collect();
  const all = newStats();
  zones.forEach((z) => {
    all.cols += z.cols;
    all.water += z.water;
    z.biome.forEach((n, i) => {
      all.biome[i] += n;
    });
    z.heights.forEach((h) => all.heights.push(h));
    z.band.forEach((b, bi) => {
      Object.keys(b).forEach((k) => {
        all.band[bi][k] += b[k];
      });
    });
    z.ore.forEach((row, oi) => row.forEach((n, bi) => {
      all.ore[oi][bi] += n;
    }));
    z.oreMinY.forEach((v, oi) => {
      all.oreMinY[oi] = Math.min(all.oreMinY[oi], v);
    });
    z.oreMaxY.forEach((v, oi) => {
      all.oreMaxY[oi] = Math.max(all.oreMaxY[oi], v);
    });
  });
  const stoneish = all.band.reduce((a, b) => a + b.stone + b.basalt, 0);

  it('özet raporu yazdırılır', () => {
    const lines = ['[worldgen istatistik] ' + chunks + ' chunk, ' + all.cols + ' sütun'];
    zones.forEach((z, i) => {
      lines.push('--- Bölge ' + i + ' ' + ZONES[i].name + ' ---');
      lines.push('zemin yüksekliği p5/p25/p50/p75/p95/p99/max: '
        + [0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1].map((p) => pct(z.heights, p)).join('/')
        + '  su sütunu %' + (100 * z.water / z.cols).toFixed(1));
      lines.push('biyom %: ' + BIOME_KEYS.map((k, j) => k + ' ' + (100 * z.biome[j] / z.cols).toFixed(0)).join(' | '));
      lines.push(histogram(z.heights));
    });
    lines.push('--- Derinlik bantları: hava / su / lav / taş / bazalt % ---');
    all.band.forEach((b, bi) => {
      const f = (v) => (100 * v / b.total).toFixed(1).padStart(5);
      lines.push(BAND_NAMES[bi].padEnd(16) + f(b.air) + f(b.water) + f(b.lava) + f(b.stone) + f(b.basalt));
    });
    lines.push('--- Maden sayıları (bantlar ' + BANDS.map((b) => b[0] + '..' + b[1]).join(', ') + ') ---');
    ORE_NAMES.forEach((n, oi) => {
      const total = all.ore[oi].reduce((a, b) => a + b, 0);
      lines.push(n.padEnd(9) + all.ore[oi].map((v) => String(v).padStart(7)).join('') + '  toplam ' + total
        + '  y ' + all.oreMinY[oi] + '..' + all.oreMaxY[oi] + '  /1000 taş: ' + (1000 * total / stoneish).toFixed(2));
    });
    console.log(lines.join('\n'));
    expect(chunks).toBeGreaterThan(80);
  });

  it('zemin yüksekliği: vadi yumuşak, zirveler çok yüksek, kanyon engebeli; asla tavanı aşmaz', () => {
    const h = (i, p) => pct(zones[i].heights, p);
    expect(pct(all.heights, 0.5)).toBeGreaterThanOrEqual(48);
    expect(pct(all.heights, 0.5)).toBeLessThanOrEqual(68);
    expect(pct(all.heights, 0.99)).toBeGreaterThanOrEqual(120);
    expect(pct(all.heights, 1)).toBeGreaterThanOrEqual(140); // en yüksek zirve
    expect(pct(all.heights, 1)).toBeLessThanOrEqual(WORLD_Y_MAX - 60); // inşa tavanının çok altında
    expect(h(0, 0.5)).toBeGreaterThanOrEqual(44);
    expect(h(0, 0.5)).toBeLessThanOrEqual(62);
    expect(h(0, 0.95)).toBeLessThanOrEqual(100); // başlangıç vadisi yürünebilir kalır
    expect(h(3, 0.95)).toBeGreaterThanOrEqual(110);
    expect(h(3, 0.95)).toBeGreaterThan(h(0, 0.95) + 30);
    expect(h(2, 0.95) - h(2, 0.05)).toBeGreaterThanOrEqual(35);
  });

  it('su payı savunulabilir (deniz/nehir/göl var ama kara baskın)', () => {
    const share = all.water / all.cols;
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.25);
    zones.forEach((z) => expect(z.water / z.cols).toBeLessThan(0.3));
  });

  it('biyom payları bölge temalarına uyar ve dokuz biyomun hepsi görülür', () => {
    const share = (st, ...keys) => keys.reduce((a, k) => a + st.biome[BIOME_KEYS.indexOf(k)], 0) / st.cols;
    // bölge temaları (biyom genişletmesi): Z0 yumuşak, Z1 ormanlar, Z2 kurak/yanardağ, Z3 soğuk, Z4 gizemli
    expect(share(zones[0], 'cayir', 'orman', 'cicek', 'kiraz')).toBeGreaterThan(0.45);
    expect(share(zones[1], 'orman', 'karacam', 'sonbahar', 'yagmurorman', 'mangrov', 'bambu', 'golge', 'bataklik')).toBeGreaterThan(0.3);
    expect(share(zones[2], 'col', 'savan', 'volkanik')).toBeGreaterThan(0.3);
    expect(share(zones[3], 'tundra', 'dag', 'taiga', 'buzul')).toBeGreaterThan(0.5);
    expect(share(zones[4], 'kristal', 'golge', 'mantar')).toBeGreaterThan(0.25);
    BIOME_KEYS.forEach((k, i) => {
      expect(all.biome[i], 'biyom ' + k).toBeGreaterThan(0);
    });
    expect(share(all, 'plaj')).toBeGreaterThan(0.005);
    expect(share(all, 'dag')).toBeGreaterThan(0.08);
  });

  it('mağara hacmi: her derinlik bandında boşluk/sıvı payı savunulabilir (ne tıkalı ne delik deşik)', () => {
    const voids = (b) => (b.air + b.water + b.lava) / b.total;
    // Mağaralar (-80..19), Derin (-220..-81), Ham Kayalık (-340..-221), Dip (-400..-341)
    for (let bi = 0; bi < 4; bi++) {
      expect(voids(all.band[bi]), BAND_NAMES[bi]).toBeGreaterThan(0.08);
      expect(voids(all.band[bi]), BAND_NAMES[bi]).toBeLessThan(0.45);
    }
    // yer altı kayası derine gittikçe bazalta döner
    const bas = (b) => b.basalt / (b.basalt + b.stone);
    expect(bas(all.band[0])).toBeGreaterThan(bas(all.band[1]));
    expect(bas(all.band[1])).toBeGreaterThan(bas(all.band[2]));
    expect(bas(all.band[2])).toBeGreaterThan(bas(all.band[3]));
    expect(bas(all.band[0])).toBeGreaterThan(0.7);
    expect(bas(all.band[3])).toBeLessThan(0.3);
  });

  it('sıvılar: lav yalnız çok derinde, yeraltı suyu y > -150; lav denizi Dip\'te', () => {
    // yüzeye yakın mağara salonlarında küçük lav havuzları ve Volkanik Çorak'ta yüzey lav gölleri olabilir; gökyüzünde lav yok, lav denizi Dip'te
    expect(all.band[5].lava).toBe(0);
    expect(all.band[4].lava).toBeLessThan(0.004 * all.band[4].total);
    expect(all.band[3].lava + all.band[2].lava).toBeLessThan(0.01 * (all.band[3].total + all.band[2].total));
    expect(all.band[0].lava).toBeGreaterThan(0.05 * all.band[0].total);
    expect(all.band[1].lava).toBeGreaterThan(0);
    expect(all.band[0].water + all.band[1].water).toBe(0);
    expect(all.band[2].water).toBeGreaterThan(0);
    expect(all.band[3].water).toBeGreaterThan(0);
  });

  it('madenler derinliğe göre: kömür her yerde; bakır/demir orta; altın/kızıltaş derin; elmas/kuantum çok derin ve daha nadir', () => {
    const tot = (oi) => all.ore[oi].reduce((a, b) => a + b, 0);
    const [coal, copper, iron, gold, redstone, diamond, quantum, emerald] = ORE_IDS.map((_, i) => tot(i));
    const perMille = (n) => (1000 * n) / stoneish;
    expect(perMille(coal)).toBeGreaterThan(3);
    expect(perMille(coal)).toBeLessThan(40);
    expect(coal).toBeGreaterThan(copper);
    expect(coal).toBeGreaterThan(iron);
    expect(iron).toBeGreaterThan(gold);
    expect(gold).toBeGreaterThan(diamond);
    expect(diamond).toBeGreaterThan(quantum);
    expect(quantum).toBeGreaterThan(0);
    expect(redstone).toBeGreaterThan(0);
    expect(emerald).toBeGreaterThan(0);
    // derinlik sınırları
    expect(all.oreMinY[1]).toBeGreaterThanOrEqual(-82); // bakır -80..70
    expect(all.oreMaxY[1]).toBeLessThanOrEqual(75);
    expect(all.oreMinY[2]).toBeGreaterThanOrEqual(-204); // demir -200..50
    expect(all.oreMaxY[2]).toBeLessThanOrEqual(56);
    expect(all.oreMinY[3]).toBeGreaterThanOrEqual(-334); // altın -330..-40
    expect(all.oreMaxY[3]).toBeLessThanOrEqual(-34);
    expect(all.oreMinY[5]).toBeGreaterThanOrEqual(-400); // elmas -400..-110
    expect(all.oreMaxY[5]).toBeLessThanOrEqual(-104);
    expect(all.oreMaxY[6]).toBeLessThanOrEqual(45); // kuantum (kristal salon kabuğu dahil)
    // kömür her derinlik bandında (gökyüzü hariç)
    for (let bi = 0; bi < 5; bi++) expect(all.ore[0][bi]).toBeGreaterThan(0);
    // elmas yalnız en derin üç bantta, çoğu Dip + Ham Kayalık
    for (let bi = 3; bi < BANDS.length; bi++) expect(all.ore[5][bi]).toBe(0);
    expect((all.ore[5][0] + all.ore[5][1]) / diamond).toBeGreaterThan(0.6);
    // nadirlik derinde artar: Dip'te elmas, Derin Mağaralar'dakinden daha yoğun (taş başına)
    const dens = (oi, bi) => all.ore[oi][bi] / (all.band[bi].stone + all.band[bi].basalt);
    expect(dens(5, 0)).toBeGreaterThan(dens(5, 2));
    // kuantum: Kanyon ve sonrası bölgelerde, bölge 0'dan belirgin sık
    const q = (i) => zones[i].ore[6].reduce((a, b) => a + b, 0) / (zones[i].band.reduce((a, b) => a + b.stone + b.basalt, 0));
    expect(q(2) + q(3) + q(4)).toBeGreaterThan(q(0) + q(1));
    expect(DEPTH_BANDS.length).toBe(5);
  });
});
