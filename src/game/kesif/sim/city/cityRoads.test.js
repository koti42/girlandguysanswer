import { describe, expect, it } from 'vitest';
import { getCityPlan } from './cityPlan.js';
import {
  BK, BRIDGE_LIST, CANAL, GRID, LAND, NODE_COUNT, PLAZA, ROWS, SEGMENTS, SEG_COUNT, SURF, SURF_BLOCK, asphaltHalf, blockRect, bridgeAt, canalAt,
  canalCenterZ, halfWidth, hasRow, isArterial, isOpenKind, nextRow, nodeId, prevRow, roadYAt, rowIdx, segH, segMinR, segTunnelOf, segV, segmentPts,
  stationLattice, surfaceAt, tunnelAt, tunnelRoadY, tunnelZone,
} from './cityRoads.js';
import { CITY_BLOCK_IDS } from '../cityData.js';
import { citySeed } from './cityPlanTestKit.js';

const plan0 = getCityPlan(citySeed(0));

describe('ızgara ve yol genişlikleri', () => {
  it('arter (i%3==0) 20 = 14 asfalt + 3×2; ara sokak 12 = 8 + 2×2; Çevreyolu i,j=±6 arter; j=7 yok', () => {
    for (let k = -9; k <= 9; k++) {
      expect(isArterial(k)).toBe(((k % 3) + 3) % 3 === 0);
      expect(halfWidth(k)).toBe(isArterial(k) ? 10 : 6);
      expect(asphaltHalf(k)).toBe(isArterial(k) ? 7 : 4);
    }
    expect(isArterial(6) && isArterial(-6)).toBe(true);
    expect(hasRow(7)).toBe(false);
    expect(ROWS.length).toBe(18);
    expect(ROWS.indexOf(7)).toBe(-1);
    expect(nextRow(6)).toBe(8);
    expect(prevRow(8)).toBe(6);
    expect(NODE_COUNT).toBe(342);
    expect(SEG_COUNT).toBe(323 + 324);
    expect(nodeId(-9, -9)).toBe(0);
    expect(nodeId(9, 9)).toBe(341);
    expect(rowIdx(8)).toBe(16);
    // segment tablosu: her segmentin uçları ızgarada ve ardışık
    expect(SEGMENTS.length).toBe(SEG_COUNT);
    SEGMENTS.forEach((s, sid) => {
      expect(s.sid).toBe(sid);
      if (s.axis === 'v') expect(s.bj).toBe(nextRow(s.aj));
      else expect(s.bi).toBe(s.ai + 1);
    });
    expect(segV(0, 0)).not.toBe(segH(0, 0));
  });

  it('yatay/dikey koridor kesiti: orta blokta 3 kaldırım + 14 asfalt + 3 kaldırım (arter), 2+8+2 (ara sokak), şerit çizgileri', () => {
    const R = plan0.roads;
    // V_3 (x=240, arter) orta blok z=100
    const z = 100;
    const row = [];
    for (let x = 230; x < 250; x++) row.push(surfaceAt(R, x, z));
    expect(row.slice(0, 3).every((s) => s === SURF.SIDEWALK)).toBe(true);
    expect(row.slice(17).every((s) => s === SURF.SIDEWALK)).toBe(true);
    expect(row.slice(3, 17).every((s) => s !== SURF.SIDEWALK && s !== SURF.GROUND)).toBe(true);
    expect(row[9]).toBe(SURF.LANE_Z); // x=239
    expect(row[10]).toBe(SURF.LANE_Z); // x=240 (çift çizgi)
    // V_1? kesik olabilir → V_-4 (x=-320) ara sokak segmenti güvenli: i=-4 ara sokak, z=-150
    const row2 = [];
    for (let x = -326; x < -314; x++) row2.push(surfaceAt(R, x, -150));
    expect(row2.slice(0, 2).every((s) => s === SURF.SIDEWALK)).toBe(true);
    expect(row2.slice(10).every((s) => s === SURF.SIDEWALK)).toBe(true);
    expect(row2.slice(2, 10).every((s) => s !== SURF.SIDEWALK && s !== SURF.GROUND)).toBe(true);
    // şerit çizgisi kesikli: x=-320 hücresinde z boyunca hem LANE_Z hem ASPHALT
    const dash = new Set();
    for (let zz = -190; zz < -110; zz++) dash.add(surfaceAt(R, -320, zz));
    expect(dash.has(SURF.LANE_Z)).toBe(true);
    expect(dash.has(SURF.ASPHALT)).toBe(true);
  });

  it('zebra: kavşak kenarında 3 hücrelik bant, bir hücre aralıkla; ZEBRA_Z dikey yollarda, ZEBRA_X yatay yollarda', () => {
    const R = plan0.roads;
    let zebraZ = 0;
    let zebraX = 0;
    for (let i = -8; i <= 8; i++) for (let z = -700; z < 700; z += 1) {
      const s = surfaceAt(R, i * GRID + 2, z);
      if (s === SURF.ZEBRA_Z) zebraZ++;
      if (s === SURF.ZEBRA_X) throw new Error('dikey yolda ZEBRA_X');
    }
    for (let j = -8; j <= 8; j++) {
      if (!hasRow(j)) continue;
      for (let x = -700; x < 700; x += 1) {
        const s = surfaceAt(R, x, j * GRID + 2);
        if (s === SURF.ZEBRA_X) zebraX++;
        if (s === SURF.ZEBRA_Z) throw new Error('yatay yolda ZEBRA_Z');
      }
    }
    expect(zebraZ).toBeGreaterThan(100);
    expect(zebraX).toBeGreaterThan(100);
  });

  it('SURF → blok kimliği tablosu cityData ile aynı (223–228)', () => {
    expect(SURF_BLOCK[SURF.ASPHALT]).toBe(CITY_BLOCK_IDS.ASPHALT);
    expect(SURF_BLOCK[SURF.LANE_X]).toBe(CITY_BLOCK_IDS.LANE_X);
    expect(SURF_BLOCK[SURF.LANE_Z]).toBe(CITY_BLOCK_IDS.LANE_Z);
    expect(SURF_BLOCK[SURF.ZEBRA_X]).toBe(CITY_BLOCK_IDS.ZEBRA_X);
    expect(SURF_BLOCK[SURF.ZEBRA_Z]).toBe(CITY_BLOCK_IDS.ZEBRA_Z);
    expect(SURF_BLOCK[SURF.SIDEWALK]).toBe(CITY_BLOCK_IDS.SIDEWALK);
  });

  it('kara sınırı: |x|,|z| ≥ 730 → EDGE; kara dışına yol yok; blok iç dikdörtgenleri yol kenarına bitişik', () => {
    const R = plan0.roads;
    expect(surfaceAt(R, -731, 0)).toBe(SURF.EDGE);
    expect(surfaceAt(R, 730, 0)).toBe(SURF.EDGE);
    expect(surfaceAt(R, 0, -731)).toBe(SURF.EDGE);
    expect(surfaceAt(R, 729, 729)).not.toBe(SURF.EDGE);
    expect(LAND).toBe(730);
    const r = blockRect(0, 0);
    expect(r).toEqual({ x0: 10, z0: 10, x1: 74, z1: 74 });
    const e = blockRect(-10, 0);
    expect(e.x0).toBe(-800);
    expect(e.x1).toBe(-730);
  });
});

describe('kanal ve köprüler', () => {
  it('kanal ekseni z=560+30·sin(x/130), su genişliği 40, rıhtım 6; tüm x aralığında', () => {
    expect(CANAL.z0).toBe(560);
    expect(CANAL.half * 2).toBe(40);
    expect(CANAL.quay).toBe(6);
    for (let x = -790; x < 790; x += 7) {
      const zc = canalCenterZ(x + 0.5);
      expect(Math.abs(zc - (560 + 30 * Math.sin((x + 0.5) / 130)))).toBeLessThan(1e-9);
      expect(canalAt(x, Math.floor(zc))).toBe(true);
      expect(canalAt(x, Math.floor(zc - 21))).toBe(false);
    }
  });

  it('blok içinde: su (|dz|<20), rıhtım (20..26); yol koridorunda köprü tabliyesi su yerine yol kodu verir', () => {
    const R = plan0.roads;
    let water = 0;
    let quay = 0;
    for (let x = -700; x < 700; x++) {
      const zc = canalCenterZ(x + 0.5);
      const zi = Math.floor(zc);
      const s = surfaceAt(R, x, zi);
      const iV = Math.round((x + 0.5) / GRID);
      const inRoad = Math.abs(x + 0.5 - iV * GRID) <= halfWidth(iV);
      if (inRoad) {
        expect(s === SURF.ASPHALT || s === SURF.LANE_Z || s === SURF.SIDEWALK || s === SURF.ZEBRA_Z).toBe(true);
        expect(bridgeAt(R, x, zi)).toBe(true);
      } else {
        expect(s).toBe(SURF.WATER);
        water++;
        expect(bridgeAt(R, x, zi)).toBe(false);
        expect(surfaceAt(R, x, Math.floor(zc + 22))).toBe(SURF.QUAY);
        expect(surfaceAt(R, x, Math.floor(zc - 22))).toBe(SURF.QUAY);
        quay++;
      }
    }
    expect(water).toBeGreaterThan(1000);
    expect(quay).toBeGreaterThan(1000);
    expect(BRIDGE_LIST.length).toBe(19);
    BRIDGE_LIST.forEach((b) => {
      // tabliye açıklığı tüm yol genişliğinde kanalı örter
      for (let x = b.x - b.hw; x < b.x + b.hw; x++) {
        const zc = canalCenterZ(x + 0.5);
        expect(b.z0).toBeLessThanOrEqual(Math.floor(zc - CANAL.half));
        expect(b.z1).toBeGreaterThanOrEqual(Math.ceil(zc + CANAL.half));
      }
      expect(b.deckY).toBe(64);
    });
    // Çevreyolu j=6 (z=480) ve j=8 (z=640) kanaldan uzak: kıyı çizgisi dışında
    for (let x = -700; x < 700; x += 5) {
      expect(canalCenterZ(x) - CANAL.half - CANAL.quay).toBeGreaterThan(480 + 10);
      expect(canalCenterZ(x) + CANAL.half + CANAL.quay).toBeLessThan(640 - 10);
    }
  });
});

describe('Merkez Meydanı tüneli', () => {
  it('yol y: r≥90 → 64, r≤42 → 56, aradaki rampa doğrusal (1/6); bölgeler 0/1/2/3', () => {
    expect(tunnelRoadY(90)).toBe(64);
    expect(tunnelRoadY(120)).toBe(64);
    expect(tunnelRoadY(42)).toBe(56);
    expect(tunnelRoadY(0)).toBe(56);
    expect(tunnelRoadY(66)).toBeCloseTo(60, 9);
    expect(tunnelRoadY(66) - tunnelRoadY(60)).toBeCloseTo(1, 9);
    expect(tunnelZone(91)).toBe(0);
    expect(tunnelZone(90)).toBe(1);
    expect(tunnelZone(61)).toBe(1);
    expect(tunnelZone(60)).toBe(2);
    expect(tunnelZone(43)).toBe(2);
    expect(tunnelZone(42)).toBe(3);
    expect(PLAZA.ceilY).toBe(62);
    // örtü altında yol y ≤ 59: tavan 62 → ≥3 serbest yükseklik
    expect(tunnelRoadY(PLAZA.rCover)).toBeLessThanOrEqual(59.0001);
  });

  it('tunnelAt/roadYAt: yalnız x=0 ve z=0 koridorlarında; kapalı tünel üstü meydan güvertesi; hendek tabanı yol', () => {
    const R = plan0.roads;
    expect(tunnelAt(R, 0, 0)).toBe(3);
    expect(tunnelAt(R, 0, 30)).toBe(3);
    expect(tunnelAt(R, 5, 50)).toBe(2);
    expect(tunnelAt(R, -5, -75)).toBe(1);
    expect(tunnelAt(R, 70, 3)).toBe(1);
    expect(tunnelAt(R, 0, 95)).toBe(0);
    expect(tunnelAt(R, 30, 30)).toBe(0);
    expect(tunnelAt(R, 12, 30)).toBe(0);
    expect(surfaceAt(R, 0, 0)).toBe(SURF.PLAZA);
    expect(surfaceAt(R, 3, 55)).toBe(SURF.PLAZA);
    expect(surfaceAt(R, 3, 75)).not.toBe(SURF.PLAZA); // açık hendek tabanı = yol
    expect(roadYAt(R, 0, 0)).toBe(56);
    expect(roadYAt(R, 3, 100)).toBe(64);
    const y = roadYAt(R, 3, 75);
    expect(y).toBeGreaterThan(59);
    expect(y).toBeLessThan(64);
    // yol yüksekliği r ile tek yönlü artar
    let prev = -1;
    for (let z = 0; z <= 95; z++) {
      const yy = roadYAt(R, 3, z);
      if (z <= 89) {
        expect(yy).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = yy;
      }
    }
  });

  it('segmentPts: tünel segmentleri 42/90 kırılmalarını içerir; yükseklik tünel tabanından 64’e yükselir', () => {
    const R = plan0.roads;
    const s = segV(0, 0); // (0,0) → (0,1): r=0..80
    const pts = segmentPts(R, s);
    expect(pts[1]).toBe(56);
    expect(pts[pts.length - 2]).toBeCloseTo(tunnelRoadY(80), 5);
    const s2 = segV(0, 1); // (0,80) → (0,160): r=80..160, 90'da 64'e çıkar
    const p2 = segmentPts(R, s2);
    expect(p2.length).toBe(9);
    expect(p2[4]).toBe(64);
    expect(p2[5]).toBeCloseTo(90, 5);
    const s3 = segV(0, -1); // (0,-1) → (0,0): r=80 → 0; r=42'de kırılma
    const p3 = segmentPts(R, s3);
    expect(p3.length).toBe(9);
    expect(Math.abs(p3[5])).toBeCloseTo(42, 5);
    expect(segTunnelOf(SEGMENTS[s])).toBe(true);
    expect(segTunnelOf(SEGMENTS[segV(1, 0)])).toBe(false);
  });
});

describe('blok türleri ve kesikler', () => {
  it('kıyı 76, merkez haç 12, kanal 36, bölge meydanı 6, tepe 1, çatı parkuru 8; 20×20 = 400', () => {
    for (let i = 0; i < 40; i++) {
      const plan = getCityPlan(citySeed(i));
      const b = plan.roads.blocks;
      const cnt = {};
      for (let k = 0; k < 400; k++) cnt[b.kind[k]] = (cnt[b.kind[k]] || 0) + 1;
      expect(cnt[BK.EDGE]).toBe(76);
      expect(cnt[BK.CENTRAL]).toBe(12);
      expect(cnt[BK.CANAL_N]).toBe(18);
      expect(cnt[BK.CANAL_S]).toBe(18);
      expect(cnt[BK.DPLAZA]).toBe(6);
      expect(cnt[BK.HILL]).toBe(1);
      expect(b.routeBlocks.length).toBe(8);
      const open = (cnt[BK.PARK] || 0) + (cnt[BK.PLAZA] || 0) + (cnt[BK.PARKUR] || 0);
      expect(open).toBeGreaterThanOrEqual(5);
      expect(open).toBeLessThanOrEqual(70);
      expect(isOpenKind(BK.PARK) && isOpenKind(BK.CENTRAL) && !isOpenKind(BK.LOTS) && !isOpenKind(BK.HILL)).toBe(true);
      // istasyon köşe blokları açık olamaz
      const S = stationLattice();
      S.forEach(([si, sj]) => {
        for (let a = -1; a <= 0; a++) for (let c = -1; c <= 0; c++) {
          const k = b.kindAt(si + a, sj + c);
          expect(k === BK.LOTS || k === BK.CENTRAL).toBe(true);
        }
      });
    }
  });

  it('kesik kuralları: yalnız ara sokaklar kesilir; merkez diskine (r<96) değen ara sokaklar hep kesik; arter/köprü/tünel/yarış kesilmez', () => {
    for (let i = 0; i < 60; i++) {
      const plan = getCityPlan(citySeed(i));
      const R = plan.roads;
      let cuts = 0;
      for (let sid = 0; sid < SEG_COUNT; sid++) {
        const g = SEGMENTS[sid];
        if (R.cut[sid]) {
          cuts++;
          expect(g.arterial).toBe(false);
          expect(g.axis === 'v' && g.k === 6).toBe(false);
        } else if (!g.arterial) {
          // kesilmeyen ara sokak merkez diskine değmez
          expect(segMinR(g)).toBeGreaterThanOrEqual(PLAZA.padR);
        }
      }
      expect(cuts).toBeGreaterThan(8);
      expect(cuts).toBeLessThan(160);
      plan.raceTemplates.protect.forEach((sid) => expect(R.cut[sid]).toBe(0));
    }
  });
});
