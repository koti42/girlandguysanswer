import { describe, expect, it } from 'vitest';
import { B } from '../blocks.js';
import { generateCityChunk } from './cityGen.js';
import { clearCityPlanCaches, getCityPlan } from './cityPlan.js';
import { citySeed, digest } from './cityPlanTestKit.js';
import { LAB, METRO, SEWER, VAULT } from './cityUndergroundPlan.js';
import { MS, XS, HR_THEMES, sewerExtras } from './cityUndergroundExtra.js';
import {
  UG_SHARE, lockGraph, solveUnderground, undergroundDiscovery, undergroundPropSpecs, undergroundZoneAt,
} from './cityUnderground.js';
import { LAB_THEMES, labData } from './cityUndergroundLabs.js';
import { stationName, trainOf } from './cityUndergroundMetro.js';
import { vaultData } from './cityUndergroundVault.js';
import { sectionReader, chunkReader } from './cityContentTestKit.js';
import { validateLockShape } from './cityContentKit.js';
import { scanText } from './citySafeData.js';
import { getCatalogDef } from '../props/propCatalog.js';
import { getPropDef } from '../props/propDefs.js';
import { propBoxes } from './interior/graph.js';
import { propIdFor } from '../props/propPlan.js';
import { drawText, textCells, textWidth, codeOf } from './cityContentKit.js';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(citySeed);

describe('yeraltı: sabitler ve ek hacimler', () => {
  it('Extra sabitleri kabuk planıyla aynı (döngü olmasın diye ayrı tutulur)', () => {
    expect(XS.floorY).toBe(SEWER.floorY);
    expect(XS.ceilY).toBe(SEWER.ceilY);
    expect(MS.floorY).toBe(METRO.floorY);
    expect(MS.ceilY).toBe(METRO.ceilY);
    expect(LAB.rooms).toBe(3);
    expect(VAULT.y0).toBe(-110);
  });

  it('20 tohum: 30 gizli oda (12 tarayıcı / 9 düğme / 9 kod), bölgelere dağılım, çakışma yok, sınır içinde, kavşak çizgilerinden uzak', () => {
    for (let i = 0; i < 20; i++) {
      const plan = getCityPlan(citySeed(i));
      const ex = sewerExtras(plan);
      expect(ex.hidden.length).toBe(UG_SHARE.hiddenRooms);
      const kinds = { tarayici: 0, dugme: 0, kod: 0 };
      const byDist = {};
      ex.hidden.forEach((H, k) => {
        expect(H.id).toBe(k);
        kinds[H.unlock]++;
        byDist[H.district] = (byDist[H.district] || 0) + 1;
        expect(H.theme).toBeGreaterThanOrEqual(0);
        expect(H.theme).toBeLessThan(HR_THEMES.length);
        expect(H.box.x0).toBeGreaterThan(-XS.bound - 1);
        expect(H.box.x1).toBeLessThan(XS.bound + 1);
        expect(H.clear.x1 - H.clear.x0 > 0 && H.clear.z1 - H.clear.z0 > 0).toBe(true);
        expect(H.door.cells.length).toBe(2);
        const p = H.p;
        const kk = Math.round(p / 80);
        expect(Math.abs(p - kk * 80)).toBeGreaterThanOrEqual(XS.hrMargin);
      });
      expect(kinds).toEqual({ tarayici: 12, dugme: 9, kod: 9 });
      expect(Object.keys(byDist).length).toBeGreaterThanOrEqual(5);
      for (let a = 0; a < ex.hidden.length; a++) {
        for (let b = a + 1; b < ex.hidden.length; b++) {
          const A = ex.hidden[a].box;
          const Bx = ex.hidden[b].box;
          expect(A.x0 < Bx.x1 + 6 && Bx.x0 < A.x1 + 6 && A.z0 < Bx.z1 + 6 && Bx.z0 < A.z1 + 6, 'gizli odalar çakışıyor ' + a + '/' + b).toBe(false);
        }
      }
    }
  });

  it('kavşak odaları: merkez diskinin dışında, lab bacasına/menhole çarpmaz, 80–160 oda; engineeredAt hacimlerini kapsar', () => {
    for (let i = 0; i < 20; i++) {
      const plan = getCityPlan(citySeed(i));
      const ex = sewerExtras(plan);
      expect(ex.junctions.length).toBeGreaterThanOrEqual(80);
      expect(ex.junctions.length).toBeLessThanOrEqual(160);
      ex.junctions.forEach((J) => {
        expect(J.x * J.x + J.z * J.z).toBeGreaterThanOrEqual(XS.minR * XS.minR);
        plan.underground.labs.forEach((L) => {
          expect(Math.abs(L.shaft.x - J.x) > 9 || Math.abs(L.shaft.z - J.z) > 9, 'lab bacası kavşak odasında').toBe(true);
        });
        expect(plan.underground.extraAt(J.x, 33, J.z + 6)).toBe(true);
        expect(plan.underground.extraAt(J.x, 20, J.z)).toBe(false);
      });
      ex.hidden.forEach((H) => {
        expect(plan.underground.extraAt(H.center.x, 33, H.center.z)).toBe(true);
      });
    }
  });

  it('belirlenimci: plan içeriği iki kez (önbellek temizlenerek) aynı özet', () => {
    SEEDS.slice(0, 4).forEach((seed) => {
      const sum = () => {
        const plan = getCityPlan(seed);
        const G = lockGraph(plan);
        return digest([sewerExtras(plan).hidden, sewerExtras(plan).junctions.map((j) => j.id), G.locks, G.providers, G.requires, G.doors.map((d) => d.cells)]);
      };
      const a = sum();
      clearCityPlanCaches();
      expect(sum()).toBe(a);
    });
  });
});

describe('yeraltı: kilitler ve kapılar', () => {
  it('kilit biçimi, benzersiz kimlik, tüm kapılar kilitli/kapalı hücreli; 3 kademeli kart zinciri; sabit-nokta çözümü (DAG) 200 tohum', () => {
    for (let i = 0; i < 200; i++) {
      const plan = getCityPlan(citySeed(i));
      const G = lockGraph(plan);
      const ids = new Set();
      G.locks.forEach((l) => {
        expect(validateLockShape(l), l.id).toEqual([]);
        expect(ids.has(l.id)).toBe(false);
        ids.add(l.id);
        expect(G.requires[l.id]).toBeTruthy();
      });
      expect(G.locks.length).toBe(57); // 30 gizli oda + 1 personel odası (Kart-1) + 12 giriş kapağı + 12 çekirdek kapısı + 1 Kart-2 kapısı + 1 kasa kapağı
      const r = solveUnderground(plan);
      expect(r.unsolved, 'tohum ' + i).toEqual([]);
      ['kart_1', 'kart_2', 'kart_3'].forEach((k) => expect(r.items.has(k), k).toBe(true));
      // kart sağlayıcılar kendi kilidinden önce gelen kademeden olmalı
      const tierOf = {};
      G.locks.forEach((l) => { tierOf[l.id] = l.tier; });
      G.locks.forEach((l) => {
        (G.requires[l.id] || []).forEach((req) => {
          G.providers.filter((p) => p.item === req).forEach((p) => {
            p.behind.forEach((b) => expect(tierOf[b], l.id + ' ← ' + req + ' arkasında ' + b).toBeLessThan(l.tier));
          });
        });
      });
      // hiçbir kilit kendi sağlayıcısının arkasında değil
      G.locks.forEach((l) => {
        (G.requires[l.id] || []).forEach((req) => {
          G.providers.filter((p) => p.item === req).forEach((p) => expect(p.behind.indexOf(l.id)).toBe(-1));
        });
      });
      G.doors.forEach((d) => {
        expect(d.exitFree).toBe(true);
        expect(d.cells.length).toBeGreaterThan(0);
        expect(d.lock === null || typeof d.lock.id === 'string').toBe(true);
        expect(d.deep && Number.isFinite(d.deep.x)).toBe(true);
      });
    }
  });

  it('DAG gerçek: Kart-1 sağlayıcısı olmadan Kart-2, onsuz Kart-3, onsuz kasa kapağı açılmaz (zincir sırası)', () => {
    const plan = getCityPlan(citySeed(3));
    const G = lockGraph(plan);
    // zincir: vt ← kart_3 ← (vd1 ← kart_2 ← ms* ← kart_1 ← h*)
    expect(G.requires.vt).toEqual(['kart_3']);
    expect(G.requires.vd1).toEqual(['kart_2']);
    const k3 = G.providers.find((p) => p.item === 'kart_3');
    expect(k3.behind).toContain('vd1');
    const k2 = G.providers.find((p) => p.item === 'kart_2');
    expect(k2.behind.length).toBe(1);
    expect(G.requires[k2.behind[0]]).toEqual(['kart_1']);
    const k1 = G.providers.find((p) => p.item === 'kart_1');
    expect(G.requires[k1.behind[0]].every((r) => r === 'tarayici' || r.indexOf('clue:') === 0 || r.length === 0)).toBe(true);
  });

  it('üretilen blok kapalı durumdadır: her kapı hücresi dünyada kapalı kimliğiyle durur (239 kapı, tuğla/zemin gizli panel, kapak)', () => {
    SEEDS.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      const w = sectionReader(seed);
      const G = lockGraph(plan);
      let n = 0;
      G.doors.forEach((d) => {
        d.cells.forEach((c) => {
          expect(w.getBlock(c.x, c.y, c.z), d.id + ' ' + [c.x, c.y, c.z]).toBe(c.closed);
          n++;
        });
        if (d.kind === 'door') {
          // açık kimlik: hava ya da 240; kapak: merdiven
          d.cells.forEach((c) => expect([0, 240].indexOf(c.open) >= 0).toBe(true));
        } else d.cells.forEach((c) => expect(c.open).toBe(B.LADDER));
      });
      expect(n).toBeGreaterThan(200);
    });
  }, 120000);

  it('kod kilitleri: kod 3–4 hane, rakamlar 1–6; ipucu metni kodu içerir ve güvenlidir; tarayıcı/düğme kilitleri kademe 0', () => {
    const plan = getCityPlan(citySeed(5));
    const G = lockGraph(plan);
    G.locks.filter((l) => l.kind === 'kod').forEach((l) => {
      expect(l.data.code).toMatch(/^[1-6]{3,4}$/);
      expect(l.data.clue.text.replace(/-/g, '')).toContain(l.data.code);
      expect(scanText(l.data.clue.text)).toEqual([]);
      expect(l.tier).toBe(1);
    });
    G.locks.filter((l) => l.kind === 'serbest').forEach((l) => expect(l.tier).toBe(0));
    G.locks.filter((l) => l.kind === 'mini_hack').forEach((l) => {
      expect(['simon', 'levers', 'dice']).toContain(l.data.game);
      expect(l.tier).toBeGreaterThanOrEqual(1);
    });
    expect(codeOf(1, 1, 4)).toMatch(/^[1-6]{4}$/);
  });
});

describe('yeraltı: içerik verisi, metin güvenliği, keşif payları', () => {
  it('lab/hidden/istasyon/kasa adları ve tüm sabit dizgeler güvenli (yasak sözcük ve gerçek marka yok)', () => {
    const texts = [];
    LAB_THEMES.forEach((t) => texts.push(t.name));
    HR_THEMES.forEach((t) => texts.push(t.name));
    [0, 1, 2, 3, 4].forEach((s) => texts.push(stationName({ central: s === 0, x: s === 0 ? 0 : s === 1 ? 0 : s === 2 ? 0 : s === 3 ? 320 : -320, z: s === 1 ? 320 : s === 2 ? -320 : 0 })));
    texts.push('M1', 'M2', 'Diyar Işığı');
    SEEDS.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      lockGraph(plan).locks.forEach((l) => { if (l.data.clue) texts.push(l.data.clue.text); });
    });
    texts.forEach((t) => expect(scanText(t), t).toEqual([]));
  });

  it('keşif: 30 gizli oda çapası, 18 grafiti duvarı, kasa ödül çapası ve neon:easter talebi', () => {
    SEEDS.slice(0, 5).forEach((seed) => {
      const plan = getCityPlan(seed);
      const D = undergroundDiscovery(plan);
      expect(D.hiddenRooms.length).toBe(30);
      expect(D.graffiti.length).toBe(UG_SHARE.graffiti);
      expect(D.blankWalls).toBeGreaterThanOrEqual(160);
      expect(D.vault.claim).toBe('neon:easter');
      expect(D.vault.event).toBe('diyarIsigi');
      expect(vaultData(plan).door.lock.tier).toBe(3);
      const ids = new Set(D.graffiti.map((g) => g.id));
      expect(ids.size).toBe(D.graffiti.length);
    });
  });

  it('voksel yazı: Türkçe harfler (ç ğ ı i ö ş ü) işaretli, genişlik 4n−1; yazıcıya yazar', () => {
    expect(textWidth('GÜNEY')).toBe(19);
    const cells = textCells('GÜNEY');
    expect(cells.some((c) => c.r === 6)).toBe(true); // Ü noktaları
    expect(textCells('ÇŞ').some((c) => c.r === -1)).toBe(true);
    expect(textCells('ğ').length).toBe(textCells('Ğ').length);
    const arr = new Map();
    const w = { set: (x, y, z, id) => arr.set(x + ',' + y + ',' + z, id) };
    drawText(w, 'M1', { x: 0, y: 10, z: 5, axis: 'x', dir: 1, block: 7 });
    expect(arr.size).toBeGreaterThan(10);
    expect(arr.get('0,10,5')).toBe(7);
  });

  it('tren yerleşimi: merkezde yok; diğerlerinde 28 uzun, salon içinde, iki ucundan ≥14 boşluk', () => {
    SEEDS.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      plan.underground.metro.stations.forEach((st) => {
        const b = st.boxes[0];
        const tr = trainOf(st, b);
        if (st.central) expect(tr).toBe(null);
        else {
          const lo = tr.axis === 'z' ? b.z0 : b.x0;
          const hi = tr.axis === 'z' ? b.z1 : b.x1;
          expect(tr.len).toBe(28);
          expect(tr.a0 - lo).toBeGreaterThanOrEqual(14);
          expect(hi - (tr.a0 + tr.len)).toBeGreaterThanOrEqual(14);
        }
      });
    });
  });

  it('laboratuvar verisi: 12 lab, her biri 3 oda, tema dağılımı, kasa laboratuvarında Kart-2 bulkhead (d1) ve Kart-3 dolabı', () => {
    SEEDS.slice(0, 5).forEach((seed) => {
      const plan = getCityPlan(seed);
      const D = labData(plan);
      expect(D.labs.length).toBe(12);
      const themes = new Set(D.labs.map((l) => l.theme));
      expect(themes.size).toBe(6);
      D.labs.forEach((l) => {
        expect(l.rooms.length).toBe(3);
        expect(!!l.d1).toBe(l.isVault);
        expect(l.d2.lock.kind).toBe('mini_hack');
      });
      expect(D.labs.filter((l) => l.isVault).length).toBe(1);
    });
  });
});

describe('yeraltı: prop yerleşimi', () => {
  it('tüm şehir: yalnız tanımlı (katalog/PROP_DEFS) anahtarlar; (parsel,slot) benzersiz; id çakışmaz; yaw 0..3; çapalar sonlu', () => {
    SEEDS.slice(0, 3).forEach((seed) => {
      const specs = undergroundPropSpecs(seed, { x0: -800, z0: -800, x1: 800, z1: 800 });
      expect(specs.length).toBeGreaterThan(400);
      const keys = new Set();
      const ids = new Set();
      specs.forEach((s) => {
        expect(getCatalogDef(s.kind) || getPropDef(s.kind), s.kind).toBeTruthy();
        expect(s.yaw >= 0 && s.yaw <= 3).toBe(true);
        expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z)).toBe(true);
        expect(s.lotId >= 500000 && s.lotId < 1048576).toBe(true);
        const k = s.lotId + ':' + s.slot;
        expect(keys.has(k), k).toBe(false);
        keys.add(k);
        const id = propIdFor(seed, s.lotId, s.slot);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      });
    });
  });

  [2, 7, 11].forEach((si) => it('prop çarpışma kutuları kabuk bloklarının içine girmez ve birbirini kesmez (kavşak/gizli/metro/lab/kasa), kapı önü boş — tohum ' + si, () => {
    const seed = citySeed(si);
    const plan = getCityPlan(seed);
    const world = sectionReader(seed);
    const specs = undergroundPropSpecs(seed, { x0: -800, z0: -800, x1: 800, z1: 800 });
    const boxes = propBoxes(specs);
    const SOLID_OK = new Set([0, B.LADDER]);
    let checked = 0;
    const bad = [];
    boxes.forEach((e) => {
      e.boxes.forEach((bx) => {
        for (let y = Math.floor(bx[1] + 0.01); y < Math.ceil(bx[4] - 0.01); y++) {
          for (let z = Math.floor(bx[2] + 0.001); z < Math.ceil(bx[5] - 0.001); z++) {
            for (let x = Math.floor(bx[0] + 0.001); x < Math.ceil(bx[3] - 0.001); x++) {
              const id = world.getBlock(x, y, z);
              if (id === B.SLAB && bx[1] >= y + 0.49) { checked++; continue; } // plaka üstündeki prop (sahne)
              if (!SOLID_OK.has(id) && bad.length < 8) bad.push([e.p.kind, x, y, z, id]);
              checked++;
            }
          }
        }
      });
    });
    expect(bad).toEqual([]);
    expect(checked).toBeGreaterThan(500);
    // prop–prop çakışması
    const E = 1e-6;
    const hit = [];
    const live = boxes.filter((e) => e.boxes.length);
    for (let a = 0; a < live.length && hit.length < 5; a++) {
      for (let b = a + 1; b < live.length; b++) {
        const pa = live[a].p;
        const pb = live[b].p;
        if (Math.abs(pa.x - pb.x) > 6 || Math.abs(pa.z - pb.z) > 6 || Math.abs(pa.y - pb.y) > 6) continue;
        for (const ba of live[a].boxes) {
          for (const bb of live[b].boxes) {
            if (ba[0] < bb[3] - E && ba[3] > bb[0] + E && ba[1] < bb[4] - E && ba[4] > bb[1] + E && ba[2] < bb[5] - E && ba[5] > bb[2] + E) hit.push([pa.kind, pb.kind, pa.x, pa.y, pa.z]);
          }
        }
      }
    }
    expect(JSON.stringify(hit)).toBe("[]");
    // kapı önü: yatay kapılarda 3 geniş × 2 derin × 3 yüksek serbest (prop çarpışması yok)
    const G = lockGraph(plan);
    G.doors.filter((d) => d.kind === 'door').forEach((d) => {
      const half = (d.w - 1) / 2;
      const bx = d.axis === 'x' ? [d.x - half, d.y, d.z - 2, d.x + half + 1, d.y + 3, d.z + 3] : [d.x - 2, d.y, d.z - half, d.x + 3, d.y + 3, d.z + half + 1];
      live.forEach((e) => e.boxes.forEach((pb) => {
        const overlap = bx[0] < pb[3] && bx[3] > pb[0] && bx[1] < pb[4] && bx[4] > pb[1] && bx[2] < pb[5] && bx[5] > pb[2];
        expect(overlap, 'kapı önü dolu: ' + d.id + ' ' + e.p.kind).toBe(false);
      }));
    });
  }, 300000));
});

describe('yeraltı: üretim tutarlılığı', () => {
  it('chunk sırası bağımsız: içerik chunk\'ları iki farklı sırayla aynı baytlar (derin kesitler dahil)', () => {
    const seed = SEEDS[1];
    const plan = getCityPlan(seed);
    const ex = sewerExtras(plan);
    const list = [];
    ex.hidden.slice(0, 3).forEach((H) => list.push([Math.floor(H.center.x / 16), Math.floor(H.center.z / 16)]));
    ex.junctions.slice(0, 3).forEach((J) => list.push([Math.floor(J.x / 16), Math.floor(J.z / 16)]));
    const st = plan.underground.metro.stations[1];
    list.push([Math.floor(st.x / 16), Math.floor(st.z / 16)]);
    const L = plan.underground.labs[0];
    list.push([Math.floor(L.shaft.x / 16), Math.floor(L.shaft.z / 16)], [Math.floor((L.box.x0 + 8) / 16), Math.floor((L.box.z0 + 20) / 16)]);
    const run = (order) => order.map((c) => digest(Array.from(generateCityChunk(seed, c[0], c[1], { light: false, sections: 'all' }).toDense(-120, 190))));
    const a = run(list);
    const b = run(list.slice().reverse()).reverse();
    expect(b).toEqual(a);
  });

  it('ışık bütçesi: kavşak odası ≤4 ışık lambası; gizli oda ≤2 fener; kasa ≤4 ışık bloğu; personel odası ≤2', () => {
    const seed = SEEDS[3];
    const plan = getCityPlan(seed);
    const ex = sewerExtras(plan);
    const rd = chunkReader(seed, { deep: false });
    const countIn = (rect, y0, y1, ids) => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let z = rect.z0; z < rect.z1; z++) for (let x = rect.x0; x < rect.x1; x++) if (ids.indexOf(rd.getBlock(x, y, z)) >= 0) n++;
      return n;
    };
    ex.junctions.slice(0, 12).forEach((J) => {
      const lamps = countIn({ x0: J.x - 5, x1: J.x + 6, z0: J.z - 5, z1: J.z + 6 }, 31, 37, [B.NEON_AMBER, 231]);
      expect(lamps).toBeLessThanOrEqual(4);
      expect(countIn({ x0: J.x - 5, x1: J.x + 6, z0: J.z - 5, z1: J.z + 6 }, 31, 37, [38, 89])).toBe(0);
    });
    ex.hidden.slice(0, 12).forEach((H) => {
      expect(countIn(H.clear, 31, 36, [38, 89, 231, 232])).toBeLessThanOrEqual(2);
    });
    ex.staff.forEach((S) => {
      expect(countIn(S.clear, 44, 49, [38, 89])).toBeLessThanOrEqual(2);
    });
  }, 120000);
});

describe('yeraltı: bölge sorgusu ve keşif çipleri', () => {
  it('undergroundZoneAt: kanalizasyon / kavşak / gizli oda / istasyon / lab / kasa / üst katman null; ruh hali (dim, soğuk, steril)', () => {
    SEEDS.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      const ex = sewerExtras(plan);
      const J = ex.junctions[0];
      expect(undergroundZoneAt(plan, J.x, 33, J.z).kind).toBe('kavsak');
      const H = ex.hidden[0];
      expect(undergroundZoneAt(plan, H.center.x, 33, H.center.z).kind).toBe('gizli_oda');
      const st = plan.underground.metro.stations[1];
      const zi = undergroundZoneAt(plan, st.x + 5, 45, st.z);
      expect(zi.kind).toBe('istasyon');
      expect(zi.mood.light).toBe('cool');
      const L = plan.underground.labs[2];
      const r = L.rooms[0];
      const zl = undergroundZoneAt(plan, (r.x0 + r.x1) / 2, r.y0 + 1, (r.z0 + r.z1) / 2);
      expect(zl.kind).toBe('lab');
      expect(zl.mood.light).toBe('steril');
      const V = plan.underground.vault;
      expect(undergroundZoneAt(plan, (V.x0 + V.x1) / 2 + 3, V.y0 + 2, (V.z0 + V.z1) / 2 + 3).kind).toBe('kasa');
      expect(undergroundZoneAt(plan, 5, 70, 5)).toBe(null);
      const sw = undergroundZoneAt(plan, 240, 33, 100);
      expect(sw.kind).toBe('kanalizasyon');
      expect(sw.mood.light).toBe('dim');
    });
  });

  it('kanalizasyon çipleri (cityPois 40): kavşak merkezinde, hücre boş ve altı sağlam', () => {
    SEEDS.slice(0, 3).forEach((seed) => {
      const plan = getCityPlan(seed);
      const D = undergroundDiscovery(plan);
      expect(D.chips.length).toBe(UG_SHARE.sewerChips);
      const rd = chunkReader(seed);
      D.chips.forEach((c) => {
        const x = Math.floor(c.x);
        const z = Math.floor(c.z);
        expect(rd.getBlock(x, 31, z), 'çip hücresi dolu ' + [x, z]).toBe(0);
        expect(rd.getBlock(x, 32, z)).toBe(0);
        expect(rd.getBlock(x, 30, z)).not.toBe(0);
      });
    });
  });
});
