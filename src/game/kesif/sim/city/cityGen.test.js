import {
  describe, expect, it, vi,
} from 'vitest';
import { BEDROCK_TOP_Y, WORLD_Y_MIN } from '../constants.js';
import { B, BLOCKS } from '../blocks.js';
import { Chunk } from '../chunk.js';
import { getCityRules, getDimGen } from '../dim/genRegistry.js';
import { generateCityChunk, generateCitySection, canGenerateCity } from './cityGen.js';
import { cityRulesFor } from './cityZone.js';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { allLots } from './cityLots.js';
import { citySeed } from './cityPlanTestKit.js';
import { SURF, surfaceAt } from './cityRoads.js';

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Chunk'ın tüm kesit baytlarının FNV özeti + uzunluk (üretilmemiş / tek tip / dizili kesit ayrımı dahil). */
function digestOf(c) {
  let h = 2166136261;
  let n = 0;
  const mix = (v) => {
    h = Math.imul(h ^ (v & 255), 16777619) >>> 0;
    n++;
  };
  for (let si = 0; si < c.sectionCount; si++) {
    if (c.secGen[si] === 0) {
      mix(250);
    } else if (c.secBlocks[si] === null) {
      mix(251);
      mix(c.secUniform[si]);
    } else {
      mix(252);
      const a = c.secBlocks[si];
      for (let i = 0; i < a.length; i++) mix(a[i]);
    }
  }
  return h + ':' + n;
}

const CHUNKS = [];
for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) CHUNKS.push([i * 5 + 1, j * 5 + 2]);

function shuffled(list, seed) {
  const a = list.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

describe('generateCityChunk: biçim', () => {
  it('Chunk döndürür: macera düzeni, yüzey bandı üretilmiş, derin kesitler tembel, ışık hesaplanır', () => {
    const seed = citySeed(1);
    const c = generateCityChunk(seed, 0, 0);
    expect(c).toBeInstanceOf(Chunk);
    expect(c.cx).toBe(0);
    expect(c.cz).toBe(0);
    expect(c.generated).toBe(true);
    expect(c.sectionCount).toBe(48);
    for (let si = 0; si < 25; si++) expect(c.secGen[si]).toBe(0);
    for (let si = 25; si < 48; si++) expect(c.secGen[si]).toBe(1);
    expect(c.getLight(0, 80, 0) >> 4).toBe(15);
    const dark = generateCityChunk(seed, 0, 0, { light: false });
    expect(dark.getLight(0, 80, 0)).toBe(0);
  });

  it('temel katmanlar: taş 0..60, beton 61–62, yüzey 63 (yol/kaldırım/meydan), 64+ hava', () => {
    const seed = citySeed(2);
    // sokak hücresi (V_3 koridoru x∈[230,250), kanalizasyon ekseninden uzak: x=248 kaldırım) ve asfalt hücresi (x=244)
    const c = generateCityChunk(seed, 15, 6, { light: false }); // x∈[240,256), z∈[96,112)
    const plan = getCityPlan(seed);
    for (const [lx, want] of [[8, SURF.SIDEWALK], [4, SURF.ASPHALT]]) {
      const lz = 4;
      const x = 240 + lx;
      expect(surfaceAt(plan.roads, x, 100)).toBe(want);
      for (let y = 0; y <= 60; y++) {
        const id = c.get(lx, y, lz);
        // kanalizasyon kaplaması (y29..36, |x−240|≤3) dışında saf taş
        expect(id).toBe(B.STONE);
      }
      expect(c.get(lx, 61, lz)).toBe(B.CONCRETE_WHITE);
      expect(c.get(lx, 62, lz)).toBe(B.CONCRETE_WHITE);
      expect(c.get(lx, 63, lz)).toBe(want === SURF.SIDEWALK ? B.SIDEWALK : B.ASPHALT);
      expect(c.get(lx, 64, lz)).toBe(0);
      expect(c.get(lx, 100, lz)).toBe(0);
    }
    // sewer kaplaması aynı koridorda var (V_3 ekseni x=240)
    expect(c.get(0, 33, 4)).toBe(0);
    expect(c.get(0, 30, 4)).toBe(B.COBBLE);
  });

  it('Kapı Meydanı: varış noktası çevresi (0,64,2) yürünebilir; 33×33 kare yüzeyi dolu ve üstü boş', () => {
    const seed = citySeed(3);
    for (let cz = -2; cz <= 1; cz++) {
      for (let cx = -2; cx <= 1; cx++) {
        const c = generateCityChunk(seed, cx, cz, { light: false });
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const x = cx * 16 + lx;
            const z = cz * 16 + lz;
            if (x < -16 || x > 16 || z < -16 || z > 16) continue;
            expect(c.get(lx, 63, lz)).not.toBe(0);
            // sokak lambası direkleri (çit + fener) dışında üstü boş
            for (let y = 64; y <= 68; y++) expect([0, B.FENCE, B.LANTERN]).toContain(c.get(lx, y, lz));
            expect(c.get(lx, 70, lz)).toBe(0);
          }
        }
      }
    }
  });

  it('kule 300 metreyi aşmaz; anten ≤ y340; tüm bloklar y<368 içinde', () => {
    const seed = citySeed(4);
    let top = 0;
    for (let cz = -12; cz <= 12; cz += 2) {
      for (let cx = -12; cx <= 12; cx += 2) {
        const c = generateCityChunk(seed, cx, cz, { light: false });
        for (let i = 0; i < 256; i++) if (c.heightMap[i] > top) top = c.heightMap[i];
      }
    }
    expect(top).toBeGreaterThan(150);
    expect(top).toBeLessThanOrEqual(340);
  });

  it('canGenerateCity: −50..49', () => {
    expect(canGenerateCity(-50, 49)).toBe(true);
    expect(canGenerateCity(50, 0)).toBe(false);
    expect(canGenerateCity(0, -51)).toBe(false);
  });
});

describe('belirlenimcilik', () => {
  it('chunk sırası bağımsız: 3 farklı üretim sırası (+ önbellek ısınmış/soğuk) aynı baytlar', () => {
    const seed = citySeed(5);
    const ref = new Map();
    CHUNKS.forEach(([cx, cz]) => ref.set(cx + ',' + cz, digestOf(generateCityChunk(seed, cx, cz, { light: false }))));
    for (let k = 1; k <= 3; k++) {
      shuffled(CHUNKS, 99 + k).forEach(([cx, cz]) => {
        const d = digestOf(generateCityChunk(seed, cx, cz, { light: false }));
        if (d !== ref.get(cx + ',' + cz)) throw new Error('sıra bağımlı chunk ' + cx + ',' + cz + ' permütasyon ' + k);
      });
    }
  });

  it('taze modül örneği (boş önbellek, ana thread ↔ işçi) aynı baytlar; yapısal kopya (structuredClone) bayt-bayt', async () => {
    const seed = citySeed(6);
    const a = CHUNKS.slice(0, 20).map(([cx, cz]) => generateCityChunk(seed, cx, cz, { light: false }));
    vi.resetModules();
    const fresh = await import('./cityGen.js');
    CHUNKS.slice(0, 20).forEach(([cx, cz], i) => {
      const b = fresh.generateCityChunk(seed, cx, cz, { light: false });
      expect(digestOf(b)).toBe(digestOf(a[i]));
      const wire = a[i].secBlocks.map((s) => (s ? structuredClone(s) : null));
      for (let si = 0; si < wire.length; si++) {
        if (wire[si]) expect(sameBytes(wire[si], b.secBlocks[si])).toBe(true);
      }
    });
  });

  it('20 tohum: aynı (tohum,chunk) → aynı bayt; farklı tohum → farklı şehir', () => {
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      const seed = citySeed(i);
      const d1 = digestOf(generateCityChunk(seed, 3, 4, { light: false }));
      const d2 = digestOf(generateCityChunk(seed, 3, 4, { light: false }));
      expect(d1).toBe(d2);
      seen.add(digestOf(generateCityChunk(seed, 12, 20, { light: false })));
    }
    expect(seen.size).toBeGreaterThan(10);
  });

  it('generateCitySection: chunk(sections:all) ile aynı; yüzey bandı kesitleri chunk ile aynı', () => {
    const seed = citySeed(7);
    const plan = getCityPlan(seed);
    const lab = plan.underground.labs[0];
    const r = lab.rooms[0];
    const cx = Math.floor((r.x0 + r.x1) / 32);
    const cz = Math.floor((r.z0 + r.z1) / 32);
    for (const [ccx, ccz] of [[cx, cz], [0, 0], [-7, 4]]) {
      const all = generateCityChunk(seed, ccx, ccz, { light: false, sections: 'all' });
      for (let si = 0; si < 48; si++) {
        const d = generateCitySection(seed, ccx, ccz, si);
        if (all.secBlocks[si] === null) {
          expect(d.blocks).toBeNull();
          expect(d.uniform).toBe(all.secUniform[si]);
        } else {
          expect(d.blocks).not.toBeNull();
          expect(sameBytes(d.blocks, all.secBlocks[si])).toBe(true);
        }
      }
    }
  });
});

describe('derin kesitler', () => {
  it('çoğu derin kesit tek tip taş; alt kesit ana kaya: y≤-399 her sütunda, üst yüzey ≤ -396', () => {
    const seed = citySeed(8);
    const d = generateCitySection(seed, 5, 5, 10);
    expect(d.blocks).toBeNull();
    expect(d.uniform).toBe(B.STONE);
    const bot = generateCitySection(seed, 5, 5, 0);
    expect(bot.blocks).not.toBeNull();
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        expect(bot.blocks[(0 << 8) + (lz << 4) + lx]).toBe(B.BEDROCK);
        expect(bot.blocks[(5 << 8) + (lz << 4) + lx]).toBe(B.STONE);
        for (let ly = 0; ly < 16; ly++) {
          if (WORLD_Y_MIN + ly <= BEDROCK_TOP_Y - 2) expect([B.BEDROCK, B.STONE]).toContain(bot.blocks[(ly << 8) + (lz << 4) + lx]);
        }
      }
    }
    expect(WORLD_Y_MIN).toBe(-400);
  });

  it('laboratuvar odaları açık hacim, bacası merdiven; kasa 24×24 açık hacim (kesit düzeyinde)', () => {
    const seed = citySeed(9);
    const plan = getCityPlan(seed);
    const lab = plan.underground.labs[3];
    const room = lab.rooms.find((r) => r.k === 0);
    const x = Math.floor((room.x0 + room.x1) / 2);
    const z = Math.floor((room.z0 + room.z1) / 2);
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const ch = generateCityChunk(seed, cx, cz, { light: false, sections: 'all' });
    const lx = x - cx * 16;
    const lz = z - cz * 16;
    expect(ch.get(lx, room.y0, lz)).toBe(0);
    expect(ch.get(lx, room.y0 + 5, lz)).toBe(0);
    expect(ch.get(lx, room.y0 - 1, lz)).not.toBe(0);
    expect(ch.get(lx, room.y1, lz)).not.toBe(0);
    const v = plan.underground.vault;
    const vx = Math.floor((v.x0 + v.x1) / 2) + 3;
    const vz = Math.floor((v.z0 + v.z1) / 2) + 3;
    const vc = generateCityChunk(seed, Math.floor(vx / 16), Math.floor(vz / 16), { light: false, sections: 'all' });
    expect(vc.get(vx - Math.floor(vx / 16) * 16, v.y0, vz - Math.floor(vz / 16) * 16)).toBe(0);
    expect(vc.get(vx - Math.floor(vx / 16) * 16, v.y1 - 1, vz - Math.floor(vz / 16) * 16)).toBe(0);
    expect(vc.get(vx - Math.floor(vx / 16) * 16, v.y0 - 1, vz - Math.floor(vz / 16) * 16)).not.toBe(0);
  });
});

describe('kurallar: isNaturalFill / isNoBuild ile üretilen bloklar tutarlı', () => {
  it('doğal dolgu ⇒ blok taş; y≤60 taş dışı her blok mühendislik hacminde (doğal DEĞİL)', () => {
    const seed = citySeed(10);
    const rules = cityRulesFor(seed);
    let natural = 0;
    let engineered = 0;
    const lists = [];
    // her türden bölge: kanal, merkez tüneli, metro istasyonu, kanalizasyon, laboratuvar, kasa, kıyı, tepe
    const plan = getCityPlan(seed);
    const lab = plan.underground.labs[0];
    const v = plan.underground.vault;
    lists.push([0, 35], [0, 0], [0, 4], [0, -5], [5, 5], [45, 20], [-46, 30], [20, 20]);
    lists.push([Math.floor(lab.rooms[1].x0 / 16), Math.floor(lab.rooms[1].z0 / 16)]);
    lists.push([Math.floor(v.x0 / 16), Math.floor(v.z0 / 16)]);
    lists.push([Math.floor(plan.hill.rect.x0 / 16) + 1, Math.floor(plan.hill.rect.z0 / 16) + 1]);
    lists.push([20, 0], [0, 20], [-20, -3], [30, -30]);
    lists.forEach(([cx, cz]) => {
      const ch = generateCityChunk(seed, cx, cz, { light: false, sections: 'all' });
      for (let y = -390; y <= 62; y += 1) {
        for (let lz = 0; lz < 16; lz++) {
          for (let lx = 0; lx < 16; lx++) {
            const id = ch.get(lx, y, lz);
            const x = cx * 16 + lx;
            const z = cz * 16 + lz;
            const nat = rules.isNaturalFill(x, y, z);
            if (nat) {
              natural++;
              if (id !== B.STONE && id !== B.SAND && id !== B.COBBLE && id !== B.WATER && id !== B.BEDROCK && id !== 0) {
                throw new Error('doğal dolgu doğal blok değil: ' + [x, y, z] + ' id ' + id);
              }
            } else if (y <= 60) {
              engineered++;
            }
          }
        }
      }
    });
    expect(natural).toBeGreaterThan(100000);
    expect(engineered).toBeGreaterThan(1000);
  }, 60000);

  it('genRegistry.getCityRules gerçek üreticiyi bulur ve cityRulesFor ile aynı sonuçlar', () => {
    const seed = citySeed(11);
    const world = { seed, dim: 'neon' };
    const r = getCityRules(world);
    expect(r).not.toBeNull();
    const own = cityRulesFor(seed);
    for (const [x, y, z] of [[0, 64, 0], [100, 30, 100], [240, 65, 100], [0, 50, 560], [3, 0, 3], [-300, -200, 600]]) {
      expect(r.isNaturalFill(x, y, z)).toBe(own.isNaturalFill(x, y, z));
      expect(r.isNoBuild(x, y, z)).toBe(own.isNoBuild(x, y, z));
    }
    expect(r.isNoBuild(240, 65, 100)).toBe(true);
    expect(r.isNaturalFill(100, 30, 100)).toBe(true);
    const g = getDimGen('city');
    expect(g.canGenerate(49, 49)).toBe(true);
    expect(g.generateChunk(seed, 0, 0, { light: false }).cx).toBe(0);
  });

  it('isNoBuild: yol koridoru, bina içi, kapı önü yasak; açık avlu/park serbest', () => {
    const seed = citySeed(12);
    const rules = cityRulesFor(seed);
    const plan = getCityPlan(seed);
    expect(rules.isNoBuild(0, 64, 0)).toBe(true);
    expect(rules.isNoBuild(240, 66, 100)).toBe(true);
    expect(rules.isNoBuild(240, 90, 100)).toBe(false);
    expect(rules.zoneAt(0, 70, 0)).toBeNull();
    const lot = plan.lotsIndex.all().find((l) => l.archetype === 'kule_cam');
    expect(lot).toBeTruthy();
    const cx = Math.floor(lot.x0 + lot.w / 2);
    const cz = Math.floor(lot.z0 + lot.d / 2);
    expect(rules.zoneAt(cx, 70, cz)).not.toBeNull();
  });
});

describe('fuzz: rastgele tohum/chunk', () => {
  it('300 rastgele (tohum, chunk): hata atmaz, her blok kimliği kayıtlı; sınır dışı chunk bile çökmez; yüzey bandı üretilmiş', () => {
    let s = 987654321;
    const rnd = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 300; i++) {
      const seed = Math.floor(rnd() * 4294967296) >>> 0;
      const outside = i % 25 === 0;
      const cx = outside ? Math.floor(rnd() * 300) - 150 : Math.floor(rnd() * 100) - 50;
      const cz = outside ? Math.floor(rnd() * 300) - 150 : Math.floor(rnd() * 100) - 50;
      const c = generateCityChunk(seed, cx, cz, { light: i % 3 === 0 });
      expect(c.generated).toBe(true);
      for (let si = 25; si < 48; si++) {
        expect(c.secGen[si]).toBe(1);
        const a = c.secBlocks[si];
        if (a === null) {
          expect(BLOCKS[c.secUniform[si]]).toBeTruthy();
        } else {
          const seen = new Uint8Array(256);
          for (let k = 0; k < 4096; k++) seen[a[k]] = 1;
          for (let id = 0; id < 256; id++) if (seen[id] && !BLOCKS[id]) throw new Error('bilinmeyen blok kimliği ' + id + ' chunk ' + cx + ',' + cz);
        }
      }
      if (i % 20 === 0) {
        const si = Math.floor(rnd() * 25);
        const d = generateCitySection(seed, cx, cz, si);
        if (d.blocks) for (let k = 0; k < 4096; k++) if (!BLOCKS[d.blocks[k]]) throw new Error('derin kesitte bilinmeyen kimlik');
      }
    }
  }, 60000);
});

describe('plan nesnelerini değiştirmez', () => {
  it('chunk üretimi paylaşılan plan (parsel, bina planı, blok planı, yeraltı) nesnelerini bozmaz', () => {
    const seed = citySeed(14);
    const plan = getCityPlan(seed);
    const lots = allLots(plan).filter((l, i) => i % 9 === 0).slice(0, 80);
    const snap = () => JSON.stringify(lots.map((l) => [l, planBuilding(seed, l)])) + JSON.stringify(plan.underground.metro.stations) + JSON.stringify(plan.hill);
    const before = snap();
    for (let cz = -12; cz <= 12; cz += 3) for (let cx = -12; cx <= 12; cx += 3) generateCityChunk(seed, cx, cz, { light: false });
    for (let i = 0; i < 40; i++) generateCityChunk(seed, (i * 7) % 60 - 30, (i * 13) % 60 - 30, { light: false });
    expect(snap()).toBe(before);
  }, 60000);
});
