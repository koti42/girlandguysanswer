import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { generateCityChunk } from './cityGen.js';
import { buildNav } from './cityNavKit.js';
import { allLots, footprintOf } from './cityLots.js';
import {
  getCityPlan, groundY, lotAt, planBuilding, pois,
} from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';
import { CANAL, SURF, canalCenterZ, surfaceAt } from './cityRoads.js';
import { ARCHETYPES } from './archetypes.js';
import { SEWER } from './cityUndergroundPlan.js';
import { openCells } from './cityUndergroundLocks.js';

const SEEDS = [1, 5, 11].map(citySeed);
const navCache = new Map();
function navFor(seed) {
  let n = navCache.get(seed);
  if (!n) {
    const nav = buildNav(seed);
    n = { nav, seen: nav.reach(0, 64, 2) };
    navCache.set(seed, n);
  }
  return n;
}

function nearReached(nav, seen, x, z, y, r) {
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const lv = nav.levels(Math.floor(x) + dx, Math.floor(z) + dz);
      for (let k = 0; k < lv.length; k++) {
        if (Math.abs(lv[k] - y) <= 2 && nav.isReached(seen, Math.floor(x) + dx, Math.floor(z) + dz, lv[k])) return true;
      }
    }
  }
  return false;
}

describe('sokak düzeyi yürünebilirlik (üretilmiş bloklar üzerinde BFS)', () => {
  it('varış (0,64,2): tüm yer seviyesi sokak/meydan/park/rıhtım/tepe/tünel hücreleri ulaşılır — kapalı kalmış sokak YOK', () => {
    SEEDS.forEach((seed) => {
      const plan = getCityPlan(seed);
      const { nav, seen } = navFor(seed);
      let checked = 0;
      const bad = [];
      for (let z = -730; z < 730; z++) {
        for (let x = -730; x < 730; x++) {
          const s = surfaceAt(plan.roads, x, z);
          if (s === SURF.WATER || s === SURF.EDGE) continue;
          const gy = Math.round(groundY(seed, x, z));
          const lv = nav.levels(x, z);
          if (lv.indexOf(gy) < 0) continue; // çit/lamba/direk/baca hücresi: yürünemez
          const lot = lotAt(seed, x, z);
          if (lot) {
            const fp = footprintOf(lot);
            if (fp && x >= fp.x0 && x < fp.x1 && z >= fp.z0 && z < fp.z1) continue; // bina içi: kapı kapalı
          }
          checked++;
          if (!nav.isReached(seen, x, z, gy) && bad.length < 8) bad.push([x, z, s, gy]);
        }
      }
      expect(checked).toBeGreaterThan(1000000);
      expect(bad).toEqual([]);
    });
  }, 300000);

  it('16 terminal, kapı önleri, grafiti, çip (kapı/park), park yeri, kiralama, kurye masası, çatı parkuru başlangıcı, yarış kapıları ulaşılır', () => {
    SEEDS.forEach((seed) => {
      const { nav, seen } = navFor(seed);
      const plan = getCityPlan(seed);
      plan.terminals.forEach((t) => {
        if (!nearReached(nav, seen, t.x, t.z, t.y, 3)) throw new Error('terminal ' + t.index + ' ulaşılamıyor');
      });
      let n = 0;
      pois(seed).forEach((p) => {
        let want = false;
        if (p.type === 'door' || p.type === 'graffiti' || p.type === 'park_slot' || p.type === 'rental' || p.type === 'courier_desk') want = true;
        else if (p.type === 'roof_start' || p.type === 'race_gate') want = true;
        else if (p.type === 'chip' && (p.kind === 'kapi' || p.kind === 'park')) want = true;
        else if (p.type === 'photo_spot' && p.y === 64) want = true;
        if (!want) return;
        n++;
        const gy = p.type === 'roof_start' || p.type === 'race_gate' ? Math.round(p.y) : Math.round(groundY(seed, p.x, p.z));
        if (!nearReached(nav, seen, p.x, p.z, gy, 3)) throw new Error('POI ulaşılamıyor: ' + p.type + ' ' + JSON.stringify([p.x, p.y, p.z]) + ' seed ' + seed);
      });
      expect(n).toBeGreaterThan(300);
    });
  }, 300000);

  it('KİLİTLENME YOK: sokaktan ulaşılan her ayakta durulabilir hücreden Kapı Meydanına geri dönülür (ters BFS; tünel, metro, tepe, çatı merdiveni, rıhtım dahil)', () => {
    SEEDS.forEach((seed) => {
      const { nav, seen } = navFor(seed);
      const back = nav.reachBack(0, 64, 2);
      let total = 0;
      const trapped = [];
      for (let n = 0; n < seen.length; n++) {
        if (!seen[n]) continue;
        total++;
        if (!back[n] && trapped.length < 6) {
          const col = (n / nav.MAXL) | 0;
          trapped.push([nav.rect.x0 + (col % nav.W), nav.rect.z0 + ((col / nav.W) | 0), nav.lv[n]]);
        }
      }
      expect(total).toBeGreaterThan(1000000);
      expect(trapped).toEqual([]);
    });
  }, 300000);

  it('Kapı Meydanı 33×33: lamba direkleri dışında her hücre ulaşılır', () => {
    const seed = SEEDS[0];
    const { nav, seen } = navFor(seed);
    let walk = 0;
    for (let z = -16; z <= 16; z++) {
      for (let x = -16; x <= 16; x++) {
        const lv = nav.levels(x, z);
        if (lv.indexOf(64) < 0) continue;
        walk++;
        expect(nav.isReached(seen, x, z, 64)).toBe(true);
      }
    }
    expect(walk).toBeGreaterThan(33 * 33 - 12);
  });

  it('SIZINTI YOK: sokaktan hiçbir bina iç hacmine (kapalı kapı, kapalı ofis katı, fuaye) girilemez; yalnız kendi çatısına (çatı parkuru) ve istasyon kioskuna', () => {
    SEEDS.forEach((seed) => {
      const { nav, seen } = navFor(seed);
      const plan = getCityPlan(seed);
      let towers = 0;
      allLots(plan).forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        if (!A0.building || lot.hill || lot.archetype === 'istasyon_girisi') return;
        const bp = planBuilding(seed, lot);
        if (!bp.tiers || !bp.tiers.length) return;
        if (A0.tower) towers++;
        bp.tiers.forEach((t) => {
          const tierRoof = 64 + 4 * t.f1 + (t.f1 === bp.floors && bp.roof ? bp.roof.lift : 0);
          for (let z = t.z0; z < t.z0 + t.d; z++) {
            for (let x = t.x0; x < t.x0 + t.w; x++) {
              const lv = nav.levels(x, z);
              for (let k = 0; k < lv.length; k++) {
                const y = lv[k];
                if (y >= tierRoof) continue; // çatı yüzeyi
                if (nav.isReached(seen, x, z, y)) throw new Error('iç hacme sızıntı lot ' + lot.id + ' ' + lot.archetype + ' ' + [x, y, z]);
              }
            }
          }
        });
      });
      expect(towers).toBeGreaterThan(20);
    });
  }, 300000);

  it('çatıya yalnız çatı parkuru başlangıç binalarından çıkılır (dış merdiven); diğer çatılar yalnız bitişik/≤+1 komşuluktan', () => {
    const seed = SEEDS[1];
    const { nav, seen } = navFor(seed);
    const plan = getCityPlan(seed);
    const starts = new Set();
    plan.roofRoutes.forEach((r) => starts.add(r.start.lot));
    let reachedRoofs = 0;
    const roofLots = new Set();
    allLots(plan).forEach((lot) => {
      const A0 = ARCHETYPES[lot.archetype];
      if (!A0.building || lot.hill) return;
      const bp = planBuilding(seed, lot);
      if (!bp.tiers || !bp.tiers.length) return;
      let any = false;
      bp.tiers.forEach((t) => {
        if (t.f1 !== bp.floors) return;
        const ry = 64 + 4 * t.f1 + (bp.roof ? bp.roof.lift : 0);
        for (let z = t.z0; z < t.z0 + t.d && !any; z++) {
          for (let x = t.x0; x < t.x0 + t.w && !any; x++) if (nav.isReached(seen, x, z, ry)) any = true;
        }
      });
      if (any) {
        reachedRoofs++;
        roofLots.add(lot.id);
      }
    });
    // başlangıç çatılarının hepsi ulaşılır
    starts.forEach((id) => expect(roofLots.has(id)).toBe(true));
    expect(reachedRoofs).toBeLessThan(120);
  }, 300000);

  it('metro: her istasyonun platformu ve hatları sokaktan kioskların merdivenleriyle yürünerek ulaşılır', () => {
    SEEDS.forEach((seed) => {
      const { nav, seen } = navFor(seed);
      const m = getCityPlan(seed).underground.metro;
      m.stations.forEach((st) => {
        let tot = 0;
        let got = 0;
        st.boxes.forEach((b) => {
          for (let z = b.z0; z < b.z1; z++) {
            for (let x = b.x0; x < b.x1; x++) {
              if (nav.levels(x, z).indexOf(44) < 0) continue;
              tot++;
              if (nav.isReached(seen, x, z, 44)) got++;
            }
          }
        });
        expect(tot).toBeGreaterThan(800);
        expect(got).toBe(tot);
      });
    });
  }, 300000);

  it('kanal boyunca su sürekli (köprü altı dahil; kolonlar yalnız tabliye kenarında): her 40 blokta bir çıkış basamağı bulunur', () => {
    const seed = SEEDS[2];
    const g = new Map();
    const blk = (x, y, z) => {
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const k = cx + ',' + cz;
      let c = g.get(k);
      if (!c) {
        c = generateCityChunk(seed, cx, cz, { light: false });
        g.set(k, c);
      }
      return c.get(x - cx * 16, y, z - cz * 16);
    };
    for (let x = -729; x <= 729; x++) {
      const z = Math.floor(canalCenterZ(x + 0.5));
      for (let y = 44; y <= 58; y++) expect(blk(x, y, z)).toBe(B.WATER);
      expect(blk(x, 59, z)).toBe(0);
    }
    // her x için yakın (≤40) bir basamak sütunu
    for (let x = -700; x <= 700; x += 10) {
      let best = 1e9;
      for (let o = -45; o <= 45; o++) {
        const m = (((x + o) % 80) + 80) % 80;
        if ((m >= 20 && m < 23) || (m >= 60 && m < 63)) best = Math.min(best, Math.abs(o));
      }
      expect(best).toBeLessThanOrEqual(21);
    }
  }, 60000);

  it('rıhtım basamakları: kanaldan çıkış — su kenarındaki basamak hücreleri ulaşılabilir kıyıya bağlı', () => {
    const seed = SEEDS[0];
    const { nav, seen } = navFor(seed);
    for (let i = -8; i <= 8; i++) {
      for (const off of [20, 60]) {
        const x = i * 80 + off + 1;
        const zc = canalCenterZ(x + 0.5);
        for (const side of [-1, 1]) {
          // su kenarındaki ilk basamak (ayak 59) ulaşılır; rıhtıma (64) bağlanır
          const z = Math.floor(zc + side * (CANAL.half - 0.5) + (side > 0 ? 0.001 : -0.001));
          expect(nav.levels(x, z).indexOf(59)).toBeGreaterThanOrEqual(0);
          expect(nav.isReached(seen, x, z, 59)).toBe(true);
        }
      }
    }
  });
});

/* ------------------------------------------------------------------------------------------------
 * 3B boşluk bağlantısı: menhol → kanalizasyon → laboratuvar → kasa (merdivenli baca = dikey kenar)
 * ---------------------------------------------------------------------------------------------- */
function floodVoid(seed, start, box) {
  const cache = new Map();
  // Faz 2: giriş kapakları/bulkhead kapıları kilitlidir; bağlantı denetimi "kilitler çözülmüş" varsayımıyla (cityUndergroundLocks.openCells)
  const opened = openCells(getCityPlan(seed));
  const blk = (x, y, z) => {
    const ov = opened.get(x + ',' + y + ',' + z);
    if (ov !== undefined) return ov;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const k = cx + ',' + cz;
    let c = cache.get(k);
    if (!c) {
      c = generateCityChunk(seed, cx, cz, { light: false, sections: 'all' });
      cache.set(k, c);
    }
    return c.get(x - cx * 16, y, z - cz * 16);
  };
  const passable = (id) => id === 0 || id === B.LADDER || id === B.LANTERN || id === B.LIGHT_BLOCK || id === B.SLIDING_DOOR_OPEN;
  const key = (x, y, z) => ((y - box.y0) * (box.z1 - box.z0) + (z - box.z0)) * (box.x1 - box.x0) + (x - box.x0);
  const seen = new Uint8Array((box.x1 - box.x0) * (box.y1 - box.y0) * (box.z1 - box.z0));
  const q = [start];
  seen[key(start[0], start[1], start[2])] = 1;
  const D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  while (q.length) {
    const [x, y, z] = q.pop();
    for (let d = 0; d < 6; d++) {
      const nx = x + D[d][0];
      const ny = y + D[d][1];
      const nz = z + D[d][2];
      if (nx < box.x0 || nx >= box.x1 || ny < box.y0 || ny >= box.y1 || nz < box.z0 || nz >= box.z1) continue;
      const kk = key(nx, ny, nz);
      if (seen[kk]) continue;
      if (!passable(blk(nx, ny, nz))) continue;
      seen[kk] = 1;
      q.push([nx, ny, nz]);
    }
  }
  return { has: (x, y, z) => seen[key(x, y, z)] === 1, blk };
}

describe('alt şehir bağlantısı (boşluk akışı)', () => {
  it('menhol bacası sokaktan kanalizasyona iner, lab servis bacası kanalizasyondan en derin odaya, kasa bacası kasaya', () => {
    const seed = SEEDS[2];
    const plan = getCityPlan(seed);
    const lab = plan.underground.labs[2];
    const L0 = lab.rooms.find((r) => r.k === 0);
    const L2 = lab.rooms.find((r) => r.k === 2);
    // yola yakın menhol: lab bacasının en yakın kavşağı
    let best = null;
    plan.underground.sewer.manholes.forEach((m) => {
      const d = Math.abs(m.x - lab.shaft.x) + Math.abs(m.z - lab.shaft.z);
      if (best === null || d < best.d) best = { m, d };
    });
    const m = best.m;
    const box = {
      x0: Math.min(m.x, lab.box.x0, lab.shaft.x) - 12,
      x1: Math.max(m.x, lab.box.x1, lab.shaft.x) + 12,
      z0: Math.min(m.z, lab.box.z0, lab.shaft.z) - 12,
      z1: Math.max(m.z, lab.box.z1, lab.shaft.z) + 12,
      y0: -40,
      y1: 66,
    };
    const f = floodVoid(seed, [m.x, 64, m.z], box);
    expect(f.has(m.x, 40, m.z)).toBe(true);
    expect(f.has(m.x, SEWER.floorY, m.stub.z1 - 1)).toBe(true);
    expect(f.has(lab.shaft.x, SEWER.floorY, lab.shaft.z)).toBe(true);
    expect(f.has(lab.shaft.x, L2.y0, lab.shaft.z)).toBe(true);
    // zincirin en derin odası (merdivenle inilir)
    const cx = Math.floor((L0.x0 + L0.x1) / 2);
    const cz = Math.floor((L0.z0 + L0.z1) / 2);
    expect(f.has(cx, L0.y0, cz)).toBe(true);
    // kasa: en derin lab odası → kasa bacası → kasa
    const v = plan.underground.vault;
    if (v.labId === lab.id) {
      const f2 = floodVoid(seed, [cx, L0.y0, cz], {
        x0: v.x0 - 4, x1: v.x1 + 4, z0: v.z0 - 4, z1: v.z1 + 4, y0: v.y0 - 4, y1: L0.y1 + 2,
      });
      expect(f2.has(Math.floor((v.x0 + v.x1) / 2) + 3, v.y0, Math.floor((v.z0 + v.z1) / 2) + 3)).toBe(true);
    }
  }, 120000);

  it('her laboratuvar (12): servis bacasından en derin odaya boşluk bağlantısı; kasa bacası kasayı en derin odaya bağlar', () => {
    const seed = SEEDS[0];
    const plan = getCityPlan(seed);
    plan.underground.labs.forEach((lab) => {
      const L0 = lab.rooms.find((r) => r.k === 0);
      const bb = lab.box;
      const f = floodVoid(seed, [lab.shaft.x, SEWER.floorY, lab.shaft.z], {
        x0: Math.min(bb.x0, lab.shaft.x) - 6, x1: Math.max(bb.x1, lab.shaft.x) + 6, z0: Math.min(bb.z0, lab.shaft.z) - 6, z1: Math.max(bb.z1, lab.shaft.z) + 6, y0: -30, y1: 36,
      });
      const cx = Math.floor((L0.x0 + L0.x1) / 2);
      const cz = Math.floor((L0.z0 + L0.z1) / 2);
      expect(f.has(cx, L0.y0, cz)).toBe(true);
      lab.rooms.forEach((r) => expect(f.has(Math.floor((r.x0 + r.x1) / 2), r.y0, Math.floor((r.z0 + r.z1) / 2))).toBe(true));
    });
    const v = plan.underground.vault;
    const lab = plan.underground.labs[v.labId];
    const L0 = lab.rooms.find((r) => r.k === 0);
    const f = floodVoid(seed, [v.shaft.x, L0.y0, v.shaft.z], {
      x0: v.x0 - 3, x1: v.x1 + 3, z0: v.z0 - 3, z1: v.z1 + 3, y0: v.y0 - 3, y1: L0.y1 + 2,
    });
    expect(f.has(v.x0 + 2, v.y0, v.z0 + 2)).toBe(true);
    expect(f.has(v.x1 - 3, v.y1 - 1, v.z1 - 3)).toBe(true);
  }, 120000);
});
