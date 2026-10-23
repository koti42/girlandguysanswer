import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { generateCityChunk } from './cityGen.js';
import { cityRulesFor } from './cityZone.js';
import { allLots } from './cityLots.js';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';
import {
  BRIDGE_LIST, CANAL, SURF, canalCenterZ, surfaceAt,
} from './cityRoads.js';
import { ARCHETYPES } from './archetypes.js';
import { LAB, METRO, SEWER } from './cityUndergroundPlan.js';

/** Bloğa erişen önbellekli sahte dünya (derin kesitler isteğe bağlı). */
function grid(seed, deep) {
  const cache = new Map();
  const chunkAt = (cx, cz) => {
    const k = cx + ',' + cz;
    let c = cache.get(k);
    if (!c) {
      c = generateCityChunk(seed, cx, cz, deep ? { light: false, sections: 'all' } : { light: false });
      cache.set(k, c);
    }
    return c;
  };
  return {
    chunkAt,
    get(x, y, z) {
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      return chunkAt(cx, cz).get(x - cx * 16, y, z - cz * 16);
    },
  };
}

const SEEDS = [0, 3, 8].map(citySeed);

describe('bina kabukları sızdırmaz', () => {
  it('her bina: çevre sütunları taban→çatı boşluksuz (kapı, gökyüzü köprüsü geçidi, istasyon girişi hariç); çatı döşemesi dolu', () => {
    let buildings = 0;
    let towers = 0;
    SEEDS.forEach((seed) => {
      const plan = getCityPlan(seed);
      const g = grid(seed);
      allLots(plan).forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        if (!A0.building || lot.hill) return;
        const bp = planBuilding(seed, lot);
        if (!bp.tiers || bp.tiers.length === 0) return;
        buildings++;
        if (A0.tower) towers++;
        const door = bp.doors[0];
        const openings = new Set();
        const gate = (x, z, y) => openings.add(x + ',' + y + ',' + z);
        if (door) {
          for (let o = -1; o <= 1; o++) for (let y = 64; y <= 66; y++) gate(door.axis === 'x' ? door.x + o : door.x, door.axis === 'x' ? door.z : door.z + o, y);
        }
        // istasyon girişi: merdiven ağzı duvarı deler (kiosk içi bilinçli geçit)
        if (lot.archetype === 'istasyon_girisi') return;
        bp.bridges.forEach((b) => {
          for (let x = b.x0 - 1; x <= b.x1; x++) for (let z = b.z0 - 1; z <= b.z1; z++) for (let y = b.y0 + 1; y <= b.y0 + 2; y++) gate(x, z, y);
        });
        bp.tiers.forEach((t) => {
          const yTo = 63 + 4 * t.f1 + (t.f1 === bp.floors ? (bp.roof ? bp.roof.lift : 0) : 0);
          const bad = [];
          const chk = (x, z) => {
            for (let y = 63 + 4 * t.f0; y <= yTo; y++) {
              if (openings.has(x + ',' + y + ',' + z)) continue;
              if (g.get(x, y, z) === 0) bad.push([x, y, z]);
            }
          };
          for (let x = t.x0; x < t.x0 + t.w; x++) {
            chk(x, t.z0);
            chk(x, t.z0 + t.d - 1);
          }
          for (let z = t.z0 + 1; z < t.z0 + t.d - 1; z++) {
            chk(t.x0, z);
            chk(t.x0 + t.w - 1, z);
          }
          if (bad.length) throw new Error('duvarda boşluk lot ' + lot.id + ' ' + lot.archetype + ' ' + JSON.stringify(bad.slice(0, 4)));
          // çatı döşemesi: üstte başka kademe ya da çekirdek olmayan tüm ayak izi dolu
          const above = (x, z) => bp.tiers.some((o) => o.part === t.part && o.f0 === t.f1 && x >= o.x0 && x < o.x0 + o.w && z >= o.z0 && z < o.z0 + o.d);
          const inCoreRect = (x, z) => bp.core.some((c) => x >= c.x0 && x < c.x1 && z >= c.z0 && z < c.z1);
          for (let z = t.z0; z < t.z0 + t.d; z++) {
            for (let x = t.x0; x < t.x0 + t.w; x++) {
              if (above(x, z) || inCoreRect(x, z)) continue;
              if (g.get(x, yTo, z) === 0) throw new Error('çatı delik lot ' + lot.id + ' ' + [x, yTo, z]);
            }
          }
        });
      });
    });
    expect(buildings).toBeGreaterThan(1500);
    expect(towers).toBeGreaterThan(40);
  }, 120000);

  it('kayar kapı (239) yalnız zemin katta ve tam bir kapı kadar (3×3); yapının üst katlarında (çevre duvarlar dahil) kapı yok', () => {
    SEEDS.forEach((seed) => {
      const plan = getCityPlan(seed);
      const g = grid(seed);
      let checked = 0;
      allLots(plan).forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        if (!A0.building || lot.hill || lot.archetype === 'istasyon_girisi') return;
        const bp = planBuilding(seed, lot);
        if (!bp.tiers || !bp.tiers.length) return;
        let n = 0;
        const x1 = bp.x0 + bp.w;
        const z1 = bp.z0 + bp.d;
        // zemin kat bandı: tüm ayak izi + çevre
        for (let y = 63; y <= 70; y++) {
          for (let z = bp.z0 - 1; z <= z1; z++) {
            for (let x = bp.x0 - 1; x <= x1; x++) {
              const id = g.get(x, y, z);
              if (id === B.SLIDING_DOOR || id === B.SLIDING_DOOR_OPEN) {
                n++;
                if (y < 64 || y > 66) throw new Error('kapı bloğu zemin kat dışında lot ' + lot.id + ' y' + y);
              }
            }
          }
        }
        // üst katlar: kademelerin çevre sütunları (duvar) — kapı bloğu yok
        const top = 63 + 4 * bp.floors + 3;
        bp.tiers.forEach((t) => {
          for (let y = 71; y <= top; y++) {
            for (let x = t.x0; x < t.x0 + t.w; x++) {
              if (g.get(x, y, t.z0) === B.SLIDING_DOOR || g.get(x, y, t.z0 + t.d - 1) === B.SLIDING_DOOR) throw new Error('üst katta kapı lot ' + lot.id);
            }
            for (let z = t.z0; z < t.z0 + t.d; z++) {
              if (g.get(t.x0, y, z) === B.SLIDING_DOOR || g.get(t.x0 + t.w - 1, y, z) === B.SLIDING_DOOR) throw new Error('üst katta kapı lot ' + lot.id);
            }
          }
        });
        expect(n).toBe(bp.doors.length ? 9 : 0);
        checked++;
      });
      expect(checked).toBeGreaterThan(400);
    });
  }, 120000);

  it('kule iç katları kapalı ofis: döşeme tam (çekirdek boşluğu hariç), fuaye kat 1–2 döşemesi yok, çekirdek halkası kapalı', () => {
    const seed = SEEDS[0];
    const plan = getCityPlan(seed);
    const g = grid(seed);
    let towers = 0;
    allLots(plan).forEach((lot) => {
      const A0 = ARCHETYPES[lot.archetype];
      if (!A0.tower) return;
      const bp = planBuilding(seed, lot);
      if (!bp.core.length) return;
      towers++;
      bp.tiers.forEach((t) => {
        const part = t.part;
        const core = bp.core.find((c) => c.part === part);
        const inCoreRect = (x, z) => core && x >= core.x0 && x < core.x1 && z >= core.z0 && z < core.z1;
        const inCore = (x, z) => core && x >= core.x0 + 1 && x < core.x1 - 1 && z >= core.z0 + 1 && z < core.z1 - 1;
        const topOfPart = Math.max.apply(null, bp.tiers.filter((q) => q.part === part).map((q) => q.f1));
        const mid = [Math.floor(t.x0 + t.w / 3), Math.floor(t.z0 + t.d / 3)];
        for (let f = Math.max(1, t.f0); f < t.f1; f++) {
          const y = 63 + 4 * f;
          const atrium = topOfPart >= 8 && (f === 1 || f === 2);
          for (let z = t.z0 + 1; z < t.z0 + t.d - 1; z += 3) {
            for (let x = t.x0 + 1; x < t.x0 + t.w - 1; x += 3) {
              if (inCoreRect(x, z)) {
                if (inCore(x, z) && g.get(x, y, z) !== 0) throw new Error('çekirdek boşluğu dolu lot ' + lot.id);
                continue;
              }
              // Faz 2: fuayedeki iç mekân (kulüp, hacker odası…) kendi duvar/tavan hacmini yazar — atrium denetimi o kutuyu atlar (qa_p2)
              const ib = bp.interior;
              if (atrium && ib && ib.part === part && x >= ib.x0 - 1 && x <= ib.x1 && z >= ib.z0 - 1 && z <= ib.z1) continue; // +1: iç mekânın çevre duvar halkası
              const id = g.get(x, y, z);
              if (atrium) {
                // fuaye hacmi: ışık bloğu (üst döşemeye gömülü) dışında boş
                if (id !== 0) throw new Error('fuaye döşemesi var lot ' + lot.id + ' f' + f);
              } else if (id === 0 && !(x === mid[0] && z === mid[1] && false)) {
                throw new Error('kat döşemesi delik lot ' + lot.id + ' f' + f + ' ' + [x, y, z]);
              }
            }
          }
        }
        // iç katta (f≥3) pencere yüksekliğinde iç hacim boş (kapalı ofis hava hücreleri)
        if (t.f1 - t.f0 >= 5) {
          const f = t.f0 + 4;
          const y = 64 + 4 * f;
          const x = Math.floor(t.x0 + t.w / 2) + 3;
          const z = Math.floor(t.z0 + t.d / 2) + 3;
          if (!inCore(x, z) && !(core && x >= core.x0 && x < core.x1 && z >= core.z0 && z < core.z1)) expect(g.get(x, y, z)).toBe(0);
        }
      });
    });
    expect(towers).toBeGreaterThan(20);
  }, 120000);
});

describe('kanal, köprü, tünel, kıyı', () => {
  it('su yalnız kanalda, denizde ve çeşme havuzlarında', () => {
    SEEDS.slice(0, 2).forEach((seed) => {
      const plan = getCityPlan(seed);
      let water = 0;
      for (let cz = -50; cz < 50; cz++) {
        for (let cx = -50; cx < 50; cx++) {
          const c = generateCityChunk(seed, cx, cz, { light: false });
          for (let si = 25; si < 30; si++) {
            const arr = c.getSectionBlocks(si);
            if (c.secBlocks[si] === null) continue;
            for (let i = 0; i < 4096; i++) {
              if (arr[i] !== B.WATER) continue;
              water++;
              const x = cx * 16 + (i & 15);
              const z = cz * 16 + ((i >> 4) & 15);
              const s = surfaceAt(plan.roads, x, z);
              const ok = s === SURF.WATER || s === SURF.EDGE || (s === SURF.ASPHALT || (s >= SURF.ASPHALT && s <= SURF.SIDEWALK)) /* köprü altı */ || s === SURF.PLAZA || s === SURF.PARK || s === SURF.GROUND;
              if (!ok) throw new Error('kanal dışında su ' + [x, z] + ' yüzey ' + s);
              if (s !== SURF.WATER && s !== SURF.EDGE) {
                // yol/meydan hücresinde su: köprü altı ya da çeşme havuzu olmalı
                const dz = Math.abs(z + 0.5 - canalCenterZ(x + 0.5));
                const poolOk = dz < CANAL.half + 1 || (s === SURF.PLAZA || s === SURF.PARK);
                if (!poolOk) throw new Error('beklenmedik su ' + [x, z] + ' yüzey ' + s);
              }
            }
          }
        }
      }
      expect(water).toBeGreaterThan(50000);
    });
  }, 180000);

  it('her köprü kanalı geçer: tabliye her hücrede katı (y63), altı su, kenarlarda çit; açıklık boyunca sürekli', () => {
    const seed = SEEDS[1];
    const g = grid(seed);
    const plan = getCityPlan(seed);
    BRIDGE_LIST.forEach((b) => {
      const xc = b.x + 3;
      let deck = 0;
      let waterUnder = 0;
      for (let z = b.z0; z < b.z1; z++) {
        const top = g.get(xc, 63, z);
        expect(top).not.toBe(0);
        deck++;
        if (g.get(xc, 50, z) === B.WATER) waterUnder++;
        // üstü 3 blok serbest geçit
        for (let y = 64; y <= 66; y++) expect([0, B.FENCE]).toContain(g.get(xc, y, z));
      }
      expect(deck).toBeGreaterThan(30);
      expect(waterUnder).toBeGreaterThan(20);
      // korkuluk: tabliyenin hemen dışında (su hücresi) duvar + çit; tabliye kenar hücresi boş (sokak donanımı için)
      const railX = b.x - b.hw - 1;
      let fences = 0;
      let edgeFence = 0;
      for (let z = b.z0; z < b.z1; z++) {
        if (g.get(railX, 64, z) === B.FENCE) fences++;
        if (g.get(b.x - b.hw, 64, z) === B.FENCE) edgeFence++; // yalnız lamba direği olabilir (16 blokta bir)
      }
      expect(edgeFence).toBeLessThanOrEqual(Math.ceil((b.z1 - b.z0) / 14));
      expect(fences).toBeGreaterThan(20);
    });
    expect(plan.canal.z0).toBe(560);
  }, 60000);

  it('Kapı Meydanı tüneli: yol zemini y56..64 sürekli, kapalı kısım tavanlı, açık hendek kenarında çit; yan duvarlar panel', () => {
    const seed = SEEDS[0];
    const g = grid(seed);
    // x=−3 şeridi (sol şerit) boyunca z=−100..100: zemin yüksekliği komşu farkı ≤ 1 ve baş boşluğu ≥ 2
    let prev = null;
    for (let z = -100; z <= 100; z++) {
      let foot = -1;
      for (let y = 70; y >= 50; y--) {
        if (g.get(-3, y - 1, z) !== 0 && g.get(-3, y - 1, z) !== B.FENCE && g.get(-3, y, z) === 0 && g.get(-3, y + 1, z) === 0) {
          // en alttaki (tünel) ayak yüksekliği: yukarıdan aşağı ilk bulunan kapalı tünel ya da üst güverte
          foot = y;
        }
      }
      expect(foot).toBeGreaterThanOrEqual(56);
      if (Math.abs(z) <= 58) expect(g.get(-3, 62, z)).not.toBe(0); // tavan
      if (prev !== null) expect(Math.abs(foot - prev)).toBeLessThanOrEqual(1);
      prev = foot;
    }
    // hendek çiti
    for (const z of [70, 75, 80, 85, 89]) {
      expect(g.get(10, 64, z)).toBe(B.FENCE);
      expect(g.get(-11, 64, z)).toBe(B.FENCE);
    }
  }, 60000);

  it('rıhtım basamakları: her 80 blokta iki çıkış, ayak 59→64 (5 basamak); su kenarından kıyıya', () => {
    const seed = SEEDS[2];
    const g = grid(seed);
    for (const x0 of [20, 60, 100, 140]) {
      const x = x0 + 1;
      const zc = canalCenterZ(x + 0.5);
      for (const side of [-1, 1]) {
        // su kenarından (u=−0.5) içeriye doğru ayak yükseklikleri
        const feet = [];
        for (let k = 0; k <= 5; k++) {
          const z = Math.floor(zc + side * (CANAL.half - 0.5 + k) + (side > 0 ? 0.001 : -0.001));
          let f = -1;
          for (let y = 70; y >= 50; y--) if (g.get(x, y - 1, z) !== 0 && g.get(x, y - 1, z) !== B.WATER && g.get(x, y, z) === 0) { f = y; break; }
          feet.push(f);
        }
        const rise = feet.filter((f) => f > 0);
        expect(rise.length).toBeGreaterThanOrEqual(5);
        for (let k = 1; k < feet.length; k++) {
          if (feet[k] > 0 && feet[k - 1] > 0) expect(feet[k] - feet[k - 1]).toBeLessThanOrEqual(1);
        }
        expect(Math.max.apply(null, feet)).toBe(64);
        expect(Math.min.apply(null, rise)).toBeLessThanOrEqual(60);
      }
    }
  }, 60000);

  it('deniz (doğu/güney) ve uçurum (kuzey/batı) kıyısı: çit çevreler, yamaç basamak ≤1, tabanlar belirlenimci', () => {
    const seed = SEEDS[0];
    const g = grid(seed);
    // kara çevresi: ilk dış hücre sırası (EDGE d=1) çitli; kaldırım hücreleri çitsiz/boş
    for (const [x, z] of [[730, 100], [-731, 100], [100, 730], [100, -731], [730, -400]]) {
      expect(surfaceAt(getCityPlan(seed).roads, x, z)).toBe(SURF.EDGE);
      expect(g.get(x, 64, z)).toBe(B.FENCE);
      expect(g.get(x, 63, z)).not.toBe(0);
    }
    for (const [x, z] of [[729, 100], [-730, 100], [100, 729], [100, -730]]) {
      expect(surfaceAt(getCityPlan(seed).roads, x, z)).not.toBe(SURF.EDGE);
      expect(g.get(x, 64, z)).not.toBe(B.FENCE);
    }
    // yamaç (batı uçurum): komşu sütun farkı ≤ 1
    let prev = 63;
    for (let x = -731; x >= -799; x--) {
      if (x === -731) {
        prev = 63;
      }
      let top = -1;
      for (let y = 63; y >= 0; y--) if (g.get(x, y, 100) !== 0) { top = y; break; }
      expect(Math.abs(top - prev)).toBeLessThanOrEqual(1);
      prev = top;
    }
    // deniz: su yüzeyi y58, dibi kum
    expect(g.get(760, 58, 100)).toBe(B.WATER);
    expect(g.get(760, 59, 100)).toBe(0);
    expect(g.get(100, 58, 760)).toBe(B.WATER);
  }, 60000);
});

describe('alt şehir kabuğu', () => {
  it('kanalizasyon: zemin y30, temiz y31..34, tavan y35; metro: temiz y44..50; istasyon salonu; menhol merdiveni y31..63', () => {
    const seed = SEEDS[0];
    const g = grid(seed, true);
    const plan = getCityPlan(seed);
    // V_3 sewer ekseni x=240, z=100
    expect(g.get(240, 30, 100)).toBe(B.COBBLE);
    for (let y = SEWER.floorY; y < SEWER.ceilY; y++) expect(g.get(240, y, 100)).not.toBe(B.STONE);
    expect(g.get(240, 33, 100)).toBe(0);
    expect(g.get(240, SEWER.ceilY, 100)).not.toBe(0);
    // Mor hat tüneli (x=0) z=200
    for (let y = METRO.floorY; y < METRO.ceilY; y++) expect(g.get(0, y, 200)).toBe(0);
    expect(g.get(0, METRO.ceilY, 200)).not.toBe(0);
    expect(g.get(0, METRO.floorY - 1, 200)).not.toBe(0);
    // merkez istasyonu platformu
    expect(g.get(5, METRO.floorY, 1)).toBe(0);
    // menhol: bütün baca merdivenle dolu
    const m = plan.underground.sewer.manholes[40];
    for (let y = 31; y < 64; y++) expect(g.get(m.x, y, m.z)).toBe(B.LADDER);
    expect(g.get(m.x, 64, m.z)).toBe(0);
    // bacadan sonra ana tünele iniş: stub hücreleri hava
    expect(g.get(m.x, 32, m.stub.z1 - 1)).toBe(0);
    void LAB;
  }, 60000);

  it('istasyon girişi: kiosk kapısı önünden istasyon salonuna her adım ≤1 basamak (10+10 inen merdiven), baş boşluğu ≥ 3', () => {
    const seed = SEEDS[1];
    const g = grid(seed);
    const plan = getCityPlan(seed);
    plan.underground.metro.stations.forEach((st) => {
      st.entrances.forEach((E) => {
        const ux = E.u === 'x';
        const cell = (u, v) => (ux ? [u, v] : [v, u]);
        const f1 = E.flights[0];
        const f2 = E.flights[1];
        const walk = [];
        for (let k = 0; k < 10; k++) walk.push([f1.u0 + f1.dirU * k, f1.v0, f1.y0 - k]);
        for (let v = E.landing.v0; v < E.landing.v1; v++) walk.push([E.landing.u, v, E.landing.y]);
        for (let k = 0; k < 10; k++) walk.push([f2.u0 + f2.dirU * k, f2.v0, f2.y0 - 1 - k]);
        walk.push([E.uNear, f2.v0, 44]);
        walk.forEach(([u, v, foot]) => {
          const [x, z] = cell(u, v);
          expect(g.get(x, foot - 1, z)).not.toBe(0);
          for (let h = 0; h < 3; h++) expect([0, B.LANTERN]).toContain(g.get(x, foot + h, z));
        });
        // bağlantı hücreleri
        for (let z = E.link.z0; z < E.link.z1; z++) {
          for (let x = E.link.x0; x < E.link.x1; x++) {
            for (let h = 0; h < 3; h++) expect(g.get(x, 44 + h, z)).toBe(0);
          }
        }
      });
    });
  }, 60000);
});

describe('sokak donanımı ile blok yazımı çakışmaz', () => {
  it('blok planındaki her prop hücresi (tabela/billboard hariç) boş ve altı katı; yalnız plan kaynaklı kiosk içi süs istisnası', () => {
    SEEDS.forEach((seed) => {
      const plan = getCityPlan(seed);
      const g = grid(seed);
      let total = 0;
      const bad = [];
      for (let bj = -10; bj <= 9; bj++) {
        for (let bi = -10; bi <= 9; bi++) {
          const bp = plan.lotsIndex.blockPlan(bi, bj);
          bp.props.concat(bp.streetFurniture).forEach((p) => {
            if (p.kind === 'tabela' || p.kind === 'billboard') return;
            total++;
            const x = Math.floor(p.x);
            const y = Math.floor(p.y);
            const z = Math.floor(p.z);
            if (g.get(x, y, z) !== 0 || g.get(x, y - 1, z) === 0) {
              const lot = plan.lotsIndex.lotAt(x, z);
              bad.push({ kind: p.kind, x, y, z, lot: lot ? lot.archetype : null });
            }
          });
        }
      }
      expect(total).toBeGreaterThan(9000);
      // plan kaynaklı çakışma: merkez meydanı ağaç ızgarası kiosk parseline taşabilir (cityplan: openBlock kiosk dikdörtgenini bilmiyor)
      const real = bad.filter((b) => b.lot !== 'istasyon_girisi');
      expect(real).toEqual([]);
      expect(bad.length).toBeLessThanOrEqual(4);
    });
  }, 120000);
});

describe('doğal dolgu tutarlılığı (tüm şehir)', () => {
  it('y≤60: taş/kum/kırıktaş dışı her blok isNaturalFill=false (mühendislik hacminde); yüzey bandı tüm chunk', () => {
    const seed = SEEDS[2];
    const rules = cityRulesFor(seed);
    let odd = 0;
    for (let cz = -50; cz < 50; cz++) {
      for (let cx = -50; cx < 50; cx++) {
        const c = generateCityChunk(seed, cx, cz, { light: false });
        for (let si = 25; si < 29; si++) {
          if (c.secBlocks[si] === null) continue;
          const arr = c.secBlocks[si];
          const base = si * 16 - 400;
          for (let i = 0; i < 4096; i++) {
            const id = arr[i];
            if (id === B.STONE || id === 0) continue;
            const y = base + (i >> 8);
            if (y > 60) continue;
            if (id === B.SAND || id === B.COBBLE || id === B.WATER) continue;
            const x = cx * 16 + (i & 15);
            const z = cz * 16 + ((i >> 4) & 15);
            if (rules.isNaturalFill(x, y, z)) {
              odd++;
              if (odd < 6) throw new Error('yapı bloğu doğal dolgu sayılıyor: ' + [x, y, z] + ' id ' + id);
            }
          }
        }
      }
    }
    expect(odd).toBe(0);
  }, 180000);
});
