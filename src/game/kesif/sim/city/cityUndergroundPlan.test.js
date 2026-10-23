import { describe, expect, it } from 'vitest';
import { getCityPlan, isNaturalFill, planIsNaturalFill } from './cityPlan.js';
import { LAB, METRO, SEWER, VAULT, cornerCell, engineeredAt, manholeCell } from './cityUndergroundPlan.js';
import { DISTRICT_KEYS } from './archetypes.js';
import { lotById } from './cityLots.js';
import { GRID, PLAZA, SURF, asphaltHalf, halfWidth, surfaceAt } from './cityRoads.js';
import { citySeed } from './cityPlanTestKit.js';

describe('kanalizasyon', () => {
  it('sözleşme sabitleri: zemin y31, tavan y35, temiz kesit 5×4; her yol çizgisinin altında; menhol KD köşesinde', () => {
    expect([SEWER.floorY, SEWER.ceilY, SEWER.clearW, SEWER.clear]).toEqual([31, 35, 5, 4]);
    for (let i = 0; i < 20; i++) {
      const plan = getCityPlan(citySeed(i));
      const u = plan.underground.sewer;
      expect(u.lines.length).toBe(19 + 18);
      u.lines.forEach((l) => {
        expect(l.a).toBe(-720);
        expect(l.b).toBe(720);
      });
      // 342 kavşak − merkez diski içindekiler (r<96: (0,0),(±1,0),(0,±1) = 5) = 337 menhol
      expect(u.manholes.length).toBe(337);
      const seen = new Set();
      u.manholes.forEach((m) => {
        const k = m.x + ',' + m.z;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
        expect(m.topY).toBe(64);
        expect(m.botY).toBe(31);
        // KD köşesi: kavşak merkezinin doğusunda (x>cx) ve kuzeyinde (z<cz), köşe karesi (kaldırım) hücresi
        const cx = m.i * GRID;
        const cz = m.j * GRID;
        expect(m.x).toBeGreaterThanOrEqual(cx + asphaltHalf(m.i));
        expect(m.x).toBeLessThan(cx + halfWidth(m.i));
        expect(m.z).toBeLessThan(cz - asphaltHalf(m.j) + 0);
        expect(m.z).toBeGreaterThanOrEqual(cz - halfWidth(m.j));
        expect(surfaceAt(plan.roads, m.x, m.z)).toBe(SURF.SIDEWALK);
        // ana tünele bağlantı: dipte z=cz−2'ye uzanır
        expect(m.stub.z1).toBe(cz - 2);
        expect(m.stub.z0).toBe(m.z);
      });
    }
  });

  it('cornerCell köşe karesi indeksleme: a,b asfalttan uzaklık; dört köşe benzersiz', () => {
    const c = new Set();
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
      const p = cornerCell(2, 3, sx, sz, 0, 0);
      c.add(p.x + ',' + p.z);
      expect(Math.abs(p.x - 160)).toBeGreaterThanOrEqual(4);
      expect(Math.abs(p.z - 240)).toBeGreaterThanOrEqual(7);
    });
    expect(c.size).toBe(4);
  });

  it('menhol dış köşe hücresi: istasyon salonlarının (temiz kutu) içine düşmez; direk/terminal hücreleriyle çakışmaz', () => {
    const plan = getCityPlan(citySeed(6));
    const st = plan.underground.metro.stations;
    plan.underground.sewer.manholes.forEach((m) => {
      expect(manholeCell(m.i, m.j)).toEqual({ x: m.x, z: m.z });
      st.forEach((s) => s.boxes.forEach((b) => {
        const inClear = m.x >= b.x0 && m.x < b.x1 && m.z >= b.z0 && m.z < b.z1;
        // Mor hat kavşaklarında baca duvar sütunundadır (x=±9); temiz salon hücresi (|x|≤8) olamaz
        if (inClear) throw new Error('menhol istasyon salonunda: ' + m.i + ',' + m.j);
      }));
    });
    plan.intersections.forEach((it) => {
      const mh = manholeCell(it.i, it.j);
      it.lights.forEach((l) => expect(Math.floor(l.x) === mh.x && Math.floor(l.z) === mh.z).toBe(false));
    });
    plan.terminals.forEach((t) => {
      if (t.kind !== 'ring') return;
      const mh = manholeCell(t.i, t.j);
      expect(Math.floor(t.x) === mh.x && Math.floor(t.z) === mh.z).toBe(false);
    });
  });
});

describe('metro', () => {
  it('Mor (x=0) ve Turuncu (z=0) hatlar, zemin y44 tavan y51; 5 istasyon; her istasyonda 4 giriş (10+10 basamak switchback)', () => {
    for (let i = 0; i < 40; i++) {
      const plan = getCityPlan(citySeed(i));
      const m = plan.underground.metro;
      expect([m.floorY, m.ceilY, m.tunnelW, m.stationW, m.platform, m.stationLen]).toEqual([44, 51, 9, 17, 4, 56]);
      expect(m.lines.map((l) => l.id)).toEqual(['mor', 'turuncu']);
      expect(m.stations.map((s) => [s.x, s.z])).toEqual([[0, 0], [0, 320], [0, -320], [320, 0], [-320, 0]]);
      m.stations.forEach((st) => {
        expect(st.entrances.length).toBe(4);
        st.entrances.forEach((e) => {
          const lot = lotById(plan, e.lot);
          expect(lot).toBeTruthy();
          expect(lot.archetype).toBe('istasyon_girisi');
          expect(lot.station.id).toBe(st.id);
          expect(lot.w).toBe(12);
          expect(lot.d).toBe(12);
          // iki kol: 10 basamak aşağı, sahanlık, 10 basamak aşağı: y 64→54, 54→44
          expect(e.flights.length).toBe(2);
          expect(e.flights[0].y0 - e.flights[0].y1).toBe(10);
          expect(e.flights[1].y0 - e.flights[1].y1).toBe(10);
          expect(e.landing.y).toBe(54);
          expect(e.bottom.y).toBe(44);
          expect(e.top.y).toBe(64);
          expect(e.link.y).toBe(44);
          // tüm basamaklar parsel içinde
          const inLot = (x, z) => x >= lot.x0 && x < lot.x1 && z >= lot.z0 && z < lot.z1;
          [e.top, e.bottom].forEach((p) => expect(inLot(p.x, p.z)).toBe(true));
          // hatta dik yürüme ekseni ve istasyon kutusuna bağlanan kısa bağlantı
          expect(e.u).toBe(st.axis === 'z' ? 'x' : 'z');
          expect(Math.abs(e.su)).toBe(1);
        });
      });
    }
  });

  it('istasyon kutuları 17 geniş × 56 uzun, hat altında; merkez istasyon iki kutu (artı)', () => {
    const plan = getCityPlan(citySeed(2));
    const st = plan.underground.metro.stations;
    expect(st[0].boxes.length).toBe(2);
    expect(st[1].boxes.length).toBe(1);
    st.forEach((s) => s.boxes.forEach((b) => {
      const dx = b.x1 - b.x0;
      const dz = b.z1 - b.z0;
      expect([dx, dz].sort((a, c) => a - c)).toEqual([17, 56]);
    }));
    // istasyon Mor (0,320): kutu x∈[−8,9), z∈[292,348)
    expect(st[1].boxes[0]).toEqual({ x0: -8, x1: 9, z0: 292, z1: 348 });
  });
});

describe('laboratuvarlar ve kasa', () => {
  it('12 laboratuvar (bölge başına 2), 3 oda 16×12×6 y −24/−18/−12, servis bacası kanalizasyondan y31→−12; giriş gizli/kod', () => {
    expect(LAB.count).toBe(12);
    for (let i = 0; i < 100; i++) {
      const plan = getCityPlan(citySeed(i));
      const labs = plan.underground.labs;
      expect(labs.length).toBe(12);
      DISTRICT_KEYS.forEach((k) => expect(labs.filter((l) => l.district === k).length).toBe(2));
      const boxes = [];
      labs.forEach((l) => {
        expect(l.rooms.length).toBe(3);
        const ys = l.rooms.map((r) => r.y0).sort((a, b) => a - b);
        expect(ys).toEqual([-24, -18, -12]);
        l.rooms.forEach((r) => {
          expect(r.y1 - r.y0).toBe(6);
          expect([r.x1 - r.x0, r.z1 - r.z0].sort((a, b) => a - b)).toEqual([12, 16]);
        });
        expect(l.shaft.yTop).toBe(31);
        expect(l.shaft.yBot).toBe(-12);
        expect(['gizli', 'kod']).toContain(l.entry.kind);
        // baca kanalizasyon temiz kesitinin içinde (yol çizgisinden ±2)
        const off = l.axis === 'z' ? l.shaft.x - l.line : l.shaft.z - l.line;
        expect(off >= -2 && off <= 2).toBe(true);
        // en yüzeye yakın oda (y −12) bacanın bitişiğinde
        const top = l.rooms.find((r) => r.y0 === -12);
        expect(l.shaft.x >= top.x0 - 1 && l.shaft.x <= top.x1).toBe(true);
        expect(l.shaft.z >= top.z0 - 1 && l.shaft.z <= top.z1).toBe(true);
        // sınırlar içinde, merkez diskinden uzak
        expect(l.box.x0).toBeGreaterThan(-700);
        expect(l.box.x1).toBeLessThan(700);
        boxes.push(l.box);
      });
      for (let a = 0; a < boxes.length; a++) {
        for (let b = a + 1; b < boxes.length; b++) {
          const p = boxes[a];
          const q = boxes[b];
          const overlap = p.x0 < q.x1 && q.x0 < p.x1 && p.z0 < q.z1 && q.z0 < p.z1;
          if (overlap) throw new Error('laboratuvarlar çakışıyor: seed#' + i);
        }
      }
    }
  });

  it('kasa: Teknoloji Parkı, y −110..−90, 24×24, kart 3, bacası laboratuvardan; kasa en derin laboratuvar odasının altında', () => {
    for (let i = 0; i < 100; i++) {
      const plan = getCityPlan(citySeed(i));
      const v = plan.underground.vault;
      expect(v.district).toBe('teknoloji');
      expect([v.y0, v.y1]).toEqual([VAULT.y0, VAULT.y1]);
      expect([v.x1 - v.x0, v.z1 - v.z0]).toEqual([24, 24]);
      expect(v.cardTier).toBe(3);
      const lab = plan.underground.labs[v.labId];
      expect(lab).toBeTruthy();
      expect(v.shaft.yTop).toBe(-24);
      expect(v.shaft.yBot).toBe(-110);
      const deep = lab.rooms.find((r) => r.y0 === -24);
      expect(v.shaft.x >= deep.x0 && v.shaft.x < deep.x1).toBe(true);
      expect(v.shaft.z >= deep.z0 && v.shaft.z < deep.z1).toBe(true);
    }
  });
});

describe('mühendislik hacmi ve isNaturalFill', () => {
  it('doğal dolgu y≤60; kanalizasyon/metro/lab/kasa/tünel/kanal yatağı kabuğu doğal değil; derin taş doğal', () => {
    const seed = citySeed(4);
    const plan = getCityPlan(seed);
    // yüzey üstü hiç doğal dolgu değil
    expect(planIsNaturalFill(plan, 100, 61, 100)).toBe(false);
    expect(isNaturalFill(seed, 100, 64, 100)).toBe(false);
    // kanalizasyon ekseni (V_1 x=80, z=200): y31..35 mühendislik
    expect(engineeredAt(plan, 80, 32, 200)).toBe(true);
    expect(isNaturalFill(seed, 80, 32, 200)).toBe(false);
    expect(isNaturalFill(seed, 80 + 20, 32, 200 + 20)).toBe(true); // iki yol arası taş
    // metro Mor hattı x=0 y44..51
    expect(engineeredAt(plan, 0, 46, 200)).toBe(true);
    expect(isNaturalFill(seed, 20, 46, 200)).toBe(true);
    // merkez tüneli
    expect(engineeredAt(plan, 0, 57, 10)).toBe(true);
    // kanal yatağı
    expect(engineeredAt(plan, 0, 50, 560)).toBe(true);
    // laboratuvar kutuları ve kasa
    const lab = plan.underground.labs[0];
    const r = lab.rooms[0];
    const cx = Math.floor((r.x0 + r.x1) / 2);
    const cz = Math.floor((r.z0 + r.z1) / 2);
    expect(engineeredAt(plan, cx, r.y0 + 2, cz)).toBe(true);
    const v = plan.underground.vault;
    expect(engineeredAt(plan, v.x0 + 5, -100, v.z0 + 5)).toBe(true);
    // doğal taş: kenar bandı, derin
    expect(isNaturalFill(seed, 600, 10, -600)).toBe(true);
    expect(isNaturalFill(seed, 600, -300, -600)).toBe(true);
    expect(PLAZA.yBot).toBe(56);
  });

  it('örneklem: yüzeye yakın bölgede doğal dolgu oranı yüksek (mühendislik hacmi seyrek); belirlenimci', () => {
    const plan = getCityPlan(citySeed(8));
    let nat = 0;
    let n = 0;
    for (let k = 0; k < 4000; k++) {
      const x = ((k * 7919) % 1400) - 700;
      const z = ((k * 104729) % 1400) - 700;
      const y = -300 + ((k * 31) % 360);
      n++;
      if (planIsNaturalFill(plan, x, y, z)) nat++;
      expect(planIsNaturalFill(plan, x, y, z)).toBe(planIsNaturalFill(plan, x, y, z));
    }
    expect(nat / n).toBeGreaterThan(0.9);
    expect(METRO.floorY).toBe(44);
  });
});
