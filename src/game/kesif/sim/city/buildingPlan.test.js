import { describe, expect, it } from 'vitest';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { planBuilding as planBuildingRaw } from './buildingPlan.js';
import { allLots, footprintOf } from './cityLots.js';
import { ARCHETYPES, INTERIOR_FOOT } from './archetypes.js';
import { FACE_E, FACE_N, FACE_S, FACE_W, facadeBlock, facadePlan, makeStyle, windowState } from './buildingFacade.js';
import { CITY_BLOCK_IDS as B } from '../cityData.js';
import { citySeed } from './cityPlanTestKit.js';

const SEEDS = 12;

function partsOf(tiers) {
  const parts = {};
  tiers.forEach((t) => (parts[t.part] = parts[t.part] || []).push(t));
  Object.keys(parts).forEach((k) => parts[k].sort((a, b) => a.f0 - b.f0));
  return parts;
}

function insideAnyPart(parts, x, z) {
  return Object.keys(parts).some((k) => {
    const p = parts[k][0];
    return x >= p.x0 && x < p.x0 + p.w && z >= p.z0 && z < p.z0 + p.d;
  });
}

describe('planBuilding: kabuk planı değişmezleri', () => {
  it('kademeler iç içe ve kesintisiz; parçalar çakışmaz; üst kat = parsel katı; kapı duvarda, ön hücre dışarıda', () => {
    for (let s = 0; s < SEEDS; s++) {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      allLots(plan).forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        const bp = planBuilding(seed, lot);
        expect(bp.id).toBe(lot.id);
        expect(bp.archetype).toBe(lot.archetype);
        expect(bp.floorH).toBe(4);
        expect(bp.district).toBe(lot.district);
        if (lot.hill) {
          expect(bp.tiers.length).toBe(4);
          expect(bp.roof.y).toBe(112);
          return;
        }
        if (!A0.building && !A0.special) {
          expect(bp.open).toBe(true);
          expect(bp.tiers.length).toBe(0);
          expect(bp.doors.length).toBe(0);
          return;
        }
        const K = 'seed#' + s + ' lot ' + lot.id + ' ' + lot.archetype;
        const parts = partsOf(bp.tiers);
        let top = 0;
        Object.keys(parts).forEach((pk) => {
          let f = 0;
          parts[pk].forEach((t, q) => {
            if (t.f0 !== f) throw new Error('kademe boşluğu ' + K);
            if (t.f1 <= t.f0) throw new Error('boş kademe ' + K);
            if (t.x0 < lot.x0 || t.z0 < lot.z0 || t.x0 + t.w > lot.x1 || t.z0 + t.d > lot.z1) throw new Error('kademe parsel dışı ' + K);
            if (t.y0 !== 64 + 4 * t.f0 || t.y1 !== 64 + 4 * t.f1) throw new Error('kademe y ' + K);
            if (q > 0) {
              const a = parts[pk][q - 1];
              if (t.x0 < a.x0 || t.z0 < a.z0 || t.x0 + t.w > a.x0 + a.w || t.z0 + t.d > a.z0 + a.d) throw new Error('kademe iç içe değil ' + K);
            }
            f = t.f1;
          });
          top = Math.max(top, f);
        });
        expect(top).toBe(lot.floors);
        const ps = Object.keys(parts).map((k) => parts[k][0]);
        for (let a = 0; a < ps.length; a++) {
          for (let b = a + 1; b < ps.length; b++) {
            const p = ps[a];
            const q = ps[b];
            if (p.x0 < q.x0 + q.w && q.x0 < p.x0 + p.w && p.z0 < q.z0 + q.d && q.z0 < p.z0 + p.d) throw new Error('parçalar çakışıyor ' + K);
          }
        }
        const fp = footprintOf(lot);
        expect(bp.x0).toBe(fp.x0);
        expect(bp.z0).toBe(fp.z0);
        expect(bp.w).toBe(fp.x1 - fp.x0);
        expect(bp.d).toBe(fp.z1 - fp.z0);
        if (A0.building) {
          expect(bp.doors.length).toBe(1);
          const d = bp.doors[0];
          for (let k = -1; k <= 1; k++) {
            const x = d.x + (d.axis === 'x' ? k : 0);
            const z = d.z + (d.axis === 'z' ? k : 0);
            if (!insideAnyPart(parts, x, z)) throw new Error('kapı duvar dışı ' + K);
          }
          if (!insideAnyPart(parts, d.inside.x, d.inside.z)) throw new Error('kapı içi ' + K);
          if (insideAnyPart(parts, d.front.x, d.front.z)) throw new Error('kapı önü bina içinde ' + K);
          expect(d.w).toBe(3);
          expect(d.h).toBe(3);
        }
        // çatı: zirve ≤ y300 (+antenin ≤ y340), helipad üst kademede
        expect(bp.roof.y).toBeLessThanOrEqual(301);
        if (bp.roof.antenna) expect(bp.roof.antenna.y + bp.roof.antenna.h).toBeLessThanOrEqual(340);
        if (bp.roof.helipad) {
          const hp = bp.roof.helipad;
          const tt = bp.tiers.reduce((m, t) => (t.f1 > m.f1 ? t : m), bp.tiers[0]);
          expect(hp.x1 - hp.x0).toBe(15);
          expect(hp.x0 >= tt.x0 && hp.x1 <= tt.x0 + tt.w && hp.z0 >= tt.z0 && hp.z1 <= tt.z0 + tt.d).toBe(true);
        }
      });
    }
  });

  it('iç mekân rezervi: tür sahibin türü, kapı iç hücresini kapsar, ayak izine sığar; kule hacimleri fuaye/sky-lobi/kapalı ofis', () => {
    for (let s = 0; s < SEEDS; s++) {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      let owned = 0;
      allLots(plan).forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        const bp = planBuilding(seed, lot);
        if (bp.open || lot.hill) return;
        if (bp.owner) {
          owned++;
          expect(bp.ownerId).toBe(lot.owner);
          expect(bp.interior).toBeTruthy();
          expect(bp.interior.kind).toBe(bp.owner.interior);
        }
        if (bp.interior) {
          const r = bp.interior;
          const f = INTERIOR_FOOT[r.kind];
          const d = bp.doors[0];
          expect(d.inside.x >= r.x0 && d.inside.x < r.x1 && d.inside.z >= r.z0 && d.inside.z < r.z1).toBe(true);
          const rw = r.x1 - r.x0;
          const rd = r.z1 - r.z0;
          expect((rw === f[0] && rd === f[1]) || (rw === f[1] && rd === f[0])).toBe(true);
          expect(r.variant).toBeGreaterThanOrEqual(0);
          expect(r.variant).toBeLessThan(3);
        }
        bp.volumes.forEach((v) => {
          expect(v.x1).toBeGreaterThan(v.x0);
          expect(v.z1).toBeGreaterThan(v.z0);
          expect(v.y1).toBeGreaterThan(v.y0);
          expect(['fuaye', 'serbest', 'sky_lobi', 'ofis_kapali']).toContain(v.role);
        });
        if (A0.tower && lot.floors >= 8) {
          const roles = bp.volumes.map((v) => v.role);
          expect(roles).toContain('fuaye');
          expect(roles).toContain('ofis_kapali');
          bp.volumes.filter((v) => v.role === 'fuaye').forEach((v) => expect(v.f1 - v.f0).toBeLessThanOrEqual(3));
          bp.volumes.filter((v) => v.role === 'sky_lobi').forEach((v) => expect(v.f1 - v.f0).toBe(1));
          expect(bp.core.length).toBeGreaterThanOrEqual(1);
          bp.core.forEach((c) => expect(c.x1 - c.x0).toBe(4));
        } else if (!A0.special) {
          expect(bp.volumes.every((v) => v.role === 'serbest')).toBe(true);
        }
      });
      expect(owned).toBe(16);
    }
  });

  it('kule arketipleri: ikiz kule köprüleri her 12 katta, spiral kademeler kademeli küçülür, helipad 15×15, Merkez zirvesi ≤ y300', () => {
    let twins = 0;
    let spirals = 0;
    let helis = 0;
    let maxTop = 0;
    for (let s = 0; s < 25; s++) {
      const seed = citySeed(s);
      allLots(getCityPlan(seed)).forEach((lot) => {
        if (!ARCHETYPES[lot.archetype].tower) return;
        const bp = planBuilding(seed, lot);
        maxTop = Math.max(maxTop, bp.roof.y);
        if (lot.archetype === 'kule_ikiz') {
          twins++;
          const parts = new Set(bp.tiers.map((t) => t.part));
          expect(parts.size).toBe(2);
          bp.bridges.forEach((br, q) => {
            expect(br.f).toBe(11 + 12 * q);
            expect(br.y1 - br.y0).toBe(4);
            expect(br.x1 - br.x0 >= 3 || br.z1 - br.z0 >= 3).toBe(true);
          });
        } else if (lot.archetype === 'kule_spiral') {
          spirals++;
          const t = bp.tiers;
          expect(t.length).toBeGreaterThanOrEqual(2);
          for (let q = 2; q < t.length; q++) expect(t[q].w * t[q].d).toBeLessThanOrEqual(t[q - 1].w * t[q - 1].d + 1);
        } else if (lot.archetype === 'kule_helipad') {
          helis++;
          expect(bp.roof.helipad).toBeTruthy();
          expect(bp.roof.antenna).toBeNull();
        } else {
          expect(bp.tiers.length).toBeGreaterThanOrEqual(1);
        }
      });
    }
    expect(twins).toBeGreaterThan(3);
    expect(spirals).toBeGreaterThan(5);
    expect(helis).toBeGreaterThan(5);
    expect(maxTop).toBeLessThanOrEqual(300);
    expect(maxTop).toBeGreaterThan(250);
  });

  it('çıpalar: tabela yuvaları yüze dışa bakar ve zemin kat kapısıyla çakışmaz; çatı öğeleri üst kademe içinde; çip adayları yürünebilir', () => {
    for (let s = 0; s < SEEDS; s++) {
      const seed = citySeed(s);
      allLots(getCityPlan(seed)).forEach((lot) => {
        const bp = planBuilding(seed, lot);
        if (bp.open || lot.hill) return;
        const tt = bp.tiers.reduce((m, t) => (t.f1 > m.f1 || (t.f1 === m.f1 && t.w * t.d > m.w * m.d) ? t : m), bp.tiers[0]);
        bp.anchors.signs.forEach((sg) => {
          expect(sg.y).toBeGreaterThanOrEqual(64 + 4 * sg.floor + 1);
          if (sg.floor === 0) expect(sg.y).toBeGreaterThanOrEqual(67); // kapının (y64..66) üstünde
          if (sg.kind === 'billboard') expect(sg.floor).toBeGreaterThanOrEqual(1);
          expect(['tabela', 'billboard']).toContain(sg.kind);
          expect([FACE_N, FACE_E, FACE_S, FACE_W]).toContain(sg.face);
          // duvar düzleminin hemen dışında (yarım prop derinliği) ve ayak izi dışında
          const off = sg.kind === 'billboard' ? 0.25 : 0.125;
          const fpr = footprintOf(lot);
          const plane = sg.face === FACE_N ? fpr.z0 : sg.face === FACE_S ? fpr.z1 : sg.face === FACE_W ? fpr.x0 : fpr.x1;
          const coord = sg.face === FACE_N || sg.face === FACE_S ? sg.z : sg.x;
          const sign = sg.face === FACE_N || sg.face === FACE_W ? -1 : 1;
          expect(Math.abs(coord - (plane + sign * off))).toBeLessThan(1e-9);
          // arkasında duvar var: sign.floor katında, yüzün sign.u hücresini kapsayan bir kademe duvarı ayak izi düzleminde
          const faceName = ['n', 'e', 's', 'w'][sg.face];
          const backed = bp.tiers.some((t) => {
            if (sg.floor < t.f0 || sg.floor >= t.f1) return false;
            let sp = null;
            if (faceName === 'n') sp = t.z0 === fpr.z0 ? [t.x0 - fpr.x0, t.x0 + t.w - fpr.x0] : null;
            else if (faceName === 's') sp = t.z0 + t.d === fpr.z1 ? [t.x0 - fpr.x0, t.x0 + t.w - fpr.x0] : null;
            else if (faceName === 'w') sp = t.x0 === fpr.x0 ? [t.z0 - fpr.z0, t.z0 + t.d - fpr.z0] : null;
            else sp = t.x0 + t.w === fpr.x1 ? [t.z0 - fpr.z0, t.z0 + t.d - fpr.z0] : null;
            return sp !== null && sg.u >= sp[0] + 1 && sg.u < sp[1] - 1;
          });
          expect(backed).toBe(true);
        });
        bp.anchors.roofItems.forEach((it) => {
          expect(it.x).toBeGreaterThanOrEqual(tt.x0);
          expect(it.x).toBeLessThanOrEqual(tt.x0 + tt.w);
          expect(it.z).toBeGreaterThanOrEqual(tt.z0);
          expect(it.z).toBeLessThanOrEqual(tt.z0 + tt.d);
          expect(it.y).toBe(bp.roof.y);
        });
        bp.anchors.chips.forEach((c) => {
          expect(['roof', 'back', 'door', 'park']).toContain(c.slot);
          expect(Number.isFinite(c.x + c.y + c.z)).toBe(true);
        });
        // props: yalnız tabela/billboard; (lotId,slot) benzersiz
        const seen = new Set();
        bp.props.forEach((p) => {
          expect(['tabela', 'billboard']).toContain(p.kind);
          expect(p.lotId).toBe(lot.id);
          expect(p.variant).toBeGreaterThanOrEqual(0);
          expect(p.variant).toBeLessThan(8);
          expect(p.yaw).toBeGreaterThanOrEqual(0);
          expect(p.yaw).toBeLessThan(4);
          expect(seen.has(p.slot)).toBe(false);
          seen.add(p.slot);
          expect(typeof p.district).toBe('string');
        });
      });
    }
  });

  it('çatı parkuru başlangıç binasında dış merdiven: parselin ön boşluğunda, çatıya kadar +1 adımlarla', () => {
    let seen = 0;
    for (let s = 0; s < 20; s++) {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      plan.roofRoutes.forEach((rr) => {
        const lot = allLots(plan).find((l) => l.id === rr.start.lot);
        const bp = planBuilding(seed, lot);
        expect(bp.extStair).toBeTruthy();
        seen++;
        const e = bp.extStair;
        const cells = e.flights.concat([e.landing]);
        cells.forEach((c) => {
          if (c.x < lot.x0 || c.x >= lot.x1 || c.z < lot.z0 || c.z >= lot.z1) throw new Error('merdiven parsel dışı');
        });
        expect(e.top.y).toBe(bp.roof.y);
        // yükseklik adımları: A 65..64+nA, B yukarı devam
        const ys = e.flights.map((c) => c.y);
        for (let q = 1; q < ys.length; q++) expect(ys[q] - ys[q - 1]).toBe(1);
        expect(ys[ys.length - 1]).toBe(bp.roof.y);
        expect(ys[0]).toBe(65);
      });
    }
    expect(seen).toBe(160);
  });

  it('planBuilding(plan,lot) çağrılar arası aynı nesne (önbellek); id ile de çözülür; geçersiz id null', () => {
    const seed = citySeed(1);
    const plan = getCityPlan(seed);
    const lot = allLots(plan)[100];
    const a = planBuilding(seed, lot);
    expect(planBuilding(seed, lot)).toBe(a);
    expect(planBuilding(seed, lot.id)).toBe(a);
    expect(planBuilding(seed, 987654321)).toBeNull();
    expect(planBuildingRaw(plan, lot)).toBe(a);
  });
});

describe('cephe', () => {
  const lotStub = { id: 1234, district: 'merkez', front: 'n' };

  it('facadeBlock: döşeme/kolon/pencere düzeni, kule bandı ve kaburga, kule tacı, halka açık kat camı', () => {
    const style = makeStyle(77, lotStub, 'kule_cam', ARCHETYPES.kule_cam, null);
    expect(style.mode).toBe('curtain');
    expect(style.bayW).toBeGreaterThanOrEqual(3);
    expect(style.bayW).toBeLessThanOrEqual(5);
    expect(style.hues.length).toBeGreaterThanOrEqual(1);
    expect(style.hues.length).toBeLessThanOrEqual(3);
    // zemin alt 3 kat (fuaye) gerçek cam
    for (let f = 0; f < 3; f++) expect(facadeBlock(style, FACE_N, f, 1, 1, 1)).toBe(style.glass);
    const ids = new Set();
    for (let f = 3; f < 40; f++) for (let bay = 0; bay < 12; bay++) for (let r = 0; r < 4; r++) for (let c = 0; c < style.bayW; c++) ids.add(facadeBlock(style, FACE_E, f, bay, r, c));
    // yalnız şehir cephe blokları (pencere/panel/neon)
    ids.forEach((id) => {
      expect([B.WINDOW_DARK, B.WINDOW_WARM, B.WINDOW_COOL, B.FACADE_DARK, B.FACADE_LIGHT, B.NEON_CYAN, B.NEON_PINK, B.NEON_AMBER, B.NEON_LIME]).toContain(id);
    });
    expect(ids.has(B.WINDOW_DARK) && (ids.has(B.WINDOW_WARM) || ids.has(B.WINDOW_COOL))).toBe(true);
    // yatay neon bandı her 8 katta döşemede
    expect(style.hues).toContain(facadeBlock(style, FACE_N, 8, 2, 0, 1));
    expect(style.hues).toContain(facadeBlock(style, FACE_N, 16, 2, 0, 3));
    expect(style.hues).not.toContain(facadeBlock(style, FACE_N, 9, 2, 0, 1));
    // dikey kaburga: kolon hücresinde her 3. bay (katlar ≥ pub)
    expect(facadeBlock(style, FACE_N, 10, 3, 2, 0)).toBe(style.hues[0]);
    expect(facadeBlock(style, FACE_N, 10, 4, 2, 0)).toBe(style.panel);
    // tepe tacı
    expect(facadeBlock(style, FACE_N, 50, 1, 3, 1, true)).toBe(style.hues[0]);
    expect(facadeBlock(style, FACE_N, 50, 1, 3, 1, false)).toBe(style.panel);
  });

  it('pencere durumu: aç/sönük oranı ≈ winLit, sıcak/soğuk ≈ warm; deterministik ve konuma bağlı', () => {
    const style = makeStyle(5, lotStub, 'kule_cam', ARCHETYPES.kule_cam, null);
    let lit = 0;
    let warm = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const s = windowState(style, i & 3, 3 + (i >> 2) % 50, (i * 7) % 40);
      if (s > 0) lit++;
      if (s === 1) warm++;
    }
    expect(lit / n).toBeGreaterThan(0.4);
    expect(lit / n).toBeLessThan(0.5);
    expect(warm / lit).toBeGreaterThan(0.6);
    expect(warm / lit).toBeLessThan(0.7);
    expect(windowState(style, 1, 9, 9)).toBe(windowState(style, 1, 9, 9));
    const other = makeStyle(6, lotStub, 'kule_cam', ARCHETYPES.kule_cam, null);
    let diff = 0;
    for (let i = 0; i < 200; i++) if (windowState(style, 0, 5, i) !== windowState(other, 0, 5, i)) diff++;
    expect(diff).toBeGreaterThan(20);
  });

  it('alçak bina (punched): kenar hücreler duvar, orta pencere; konteyner rengi 75–80; dükkân zemin camı; boş duvar bölgesi', () => {
    const lot = { id: 99, district: 'konteyner', front: 's' };
    const st = makeStyle(3, lot, 'konteyner_yigini', ARCHETYPES.konteyner_yigini, { face: 's', faceIdx: FACE_S, u0: 4, u1: 10, w: 6, h: 4 });
    expect(st.mode).toBe('punched');
    expect(st.container).toBe(true);
    for (let f = 0; f < 4; f++) {
      const id = facadeBlock(st, FACE_N, f, 5, 2, 0);
      expect(id).toBeGreaterThanOrEqual(75);
      expect(id).toBeLessThanOrEqual(80);
    }
    // boş duvar: zemin katta u∈[4,10) pencere yok
    for (let u = 4; u < 10; u++) {
      const bay = Math.floor(u / st.bayW);
      const cell = u % st.bayW;
      for (let r = 0; r < 4; r++) {
        const id = facadeBlock(st, FACE_S, 0, bay, r, cell);
        expect([B.WINDOW_DARK, B.WINDOW_WARM, B.WINDOW_COOL, st.glass]).not.toContain(id);
      }
    }
    const shop = makeStyle(3, { id: 5, district: 'gece_pazari', front: 'n' }, 'dukkan_sirasi', ARCHETYPES.dukkan_sirasi, null);
    expect(shop.shop).toBe(true);
    expect(facadeBlock(shop, FACE_N, 0, 3, 1, 1)).toBe(shop.glass);
    expect(shop.awning).toBeGreaterThanOrEqual(83);
  });

  it('facadePlan: bay sayısı, yuvalar yüz içinde ve ≥5 uzunlukta', () => {
    const style = makeStyle(1, lotStub, 'kule_cam', ARCHETYPES.kule_cam, null);
    const fp = facadePlan(style, 30, 40, 2);
    expect(fp.bays).toBe(Math.ceil(30 / style.bayW));
    expect(fp.signSlots.length).toBeGreaterThanOrEqual(1);
    fp.signSlots.forEach((sl) => {
      expect(sl.u0).toBeGreaterThanOrEqual(0);
      expect(sl.u1).toBeLessThanOrEqual(30);
      expect(sl.u1 - sl.u0).toBeGreaterThanOrEqual(5);
    });
    expect(facadePlan(style, 6, 3, 2).signSlots.length).toBe(0);
    expect(facadePlan(style, 30, 40, 0).signSlots.length).toBe(0);
  });
});
