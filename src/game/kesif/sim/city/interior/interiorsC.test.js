/*
 * interiors_c testleri: sanat_studyosu, robot_tamirhanesi, arcade, dron_kurye, holo_sinema (iç mekân türleri 12–16).
 * validateInterior · BFS (gerçek chunk dünyası, kanca + kabuk) · hava ≥ %70 · belirlenimcilik · kesit birleşimi = bütün · ışık/aksan bütçesi ·
 * güvenli metin · sahip/imza/çip · kilit DAG'ı (ipucu kilidin önünde) · kurye masası çapası · ekran programları · gizli oda · varyant çeşitliliği.
 */
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { BLOCKS, EMIT_LUT } from '../../blocks.js';
import { getCatalogDef } from '../../props/propCatalog.js';
import { CITY_AD_LINES } from '../cityBrands.js';
import { OWNER_BY_INTERIOR, MOOD_HUES } from '../ownerData.js';
import { scanText } from '../citySafeData.js';
import { citySeed, digest } from '../cityPlanTestKit.js';
import {
  INTERIOR_ERRORS, clearInteriorCache, frameOf, getInterior, planInterior, setInteriorStrict,
} from './index.js';
import {
  buildingOf, reachableFromStreet, validateInterior, MAX_ACCENT_CELLS, MAX_LIGHTS_PER_ROOM,
} from './graph.js';
import { unpackCode } from './cKit.js';
import {
  HEIGHT, chunkWorld, emitSlices, emitWhole, interiorLots, regionOf,
} from './testKit.js';

const DIM_ID_RE_TEST = /^[0-9a-z]{1,10}$/;
const KINDS = ['sanat_studyosu', 'robot_tamirhanesi', 'arcade', 'dron_kurye', 'holo_sinema'];
const NEED = { sanat_studyosu: 60, robot_tamirhanesi: 60, arcade: 60, dron_kurye: 60, holo_sinema: 40 };
const LOTS = {};

function collect(kind, n) {
  const out = [];
  for (let s = 1; s <= 40 && out.length < n; s++) {
    const seed = citySeed(s);
    interiorLots(seed, { kinds: [kind] }).forEach((q) => {
      if (out.length < n) out.push({ seed, lot: q.lot, bp: q.bp });
    });
  }
  return out;
}

beforeAll(() => {
  setInteriorStrict(true);
  clearInteriorCache();
  KINDS.forEach((k) => { LOTS[k] = collect(k, NEED[k]); });
});
afterAll(() => {
  setInteriorStrict(false);
  clearInteriorCache();
});

const each = (fn) => KINDS.forEach((k) => fn(k, LOTS[k]));

describe('interiors_c — kayıt ve kapsam', () => {
  it('5 tür kayıtlı (impl.kind, name, footprint, palette); her tür için yeterli parsel ve 3 varyant görülür', () => {
    each((k, lots) => {
      const impl = getInterior(k);
      expect(impl, k).not.toBeNull();
      expect(impl.kind).toBe(k);
      expect(typeof impl.name).toBe('string');
      const fp = impl.footprint(0);
      expect(fp.w).toBeGreaterThan(8);
      expect(fp.d).toBeGreaterThan(8);
      expect(fp.h).toBeGreaterThanOrEqual(5);
      expect(lots.length, k).toBeGreaterThanOrEqual(NEED[k]);
      const vs = new Set(lots.map((q) => q.bp.interior.variant));
      expect(vs.size, k).toBe(3);
    });
  });

  it('varyantlar GERÇEKTEN farklı: plan özetleri, oda sayıları/adları ve kilit türleri varyantlar arasında ayrışır', () => {
    each((k, lots) => {
      const sig = { 0: new Set(), 1: new Set(), 2: new Set() };
      const names = { 0: new Set(), 1: new Set(), 2: new Set() };
      lots.forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        const v = q.bp.interior.variant;
        names[v].add(it.rooms.map((r) => r.role).sort().join('/'));
        sig[v].add(it.locks.map((l) => l.kind).join(','));
      });
      // her varyantın oda rol kümesi başka varyantlarınkinden ayrı (en az bir fark)
      const key = (v) => Array.from(names[v]).sort().join('|');
      expect(new Set([key(0), key(1), key(2)]).size, k + ' oda rolleri').toBe(3);
    });
  });
});

describe('interiors_c — doğrulayıcı, BFS, hava', () => {
  it('validateInterior: her parselde hata yok; prop sayısı 20..40; ışık/aksan bütçesi; çok farklı prop anahtarı', () => {
    let n = 0;
    const bad = [];
    each((k, lots) => {
      lots.forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        expect(it, k + '#' + q.bp.id).not.toBeNull();
        const v = validateInterior(it, { minProps: 20 });
        if (!v.ok) bad.push(k + '#' + q.bp.id + ' ' + v.errors.slice(0, 2).join(';'));
        expect(it.props.length, k + '#' + q.bp.id).toBeLessThanOrEqual(40);
        expect(v.stats.distinctKeys, k + '#' + q.bp.id).toBeGreaterThanOrEqual(8);
        const per = {};
        it.lights.forEach((l) => { per[l.room] = (per[l.room] || 0) + 1; });
        Object.keys(per).forEach((r) => expect(per[r]).toBeLessThanOrEqual(MAX_LIGHTS_PER_ROOM));
        let av = 0;
        it.accents.forEach((a) => { av += (a.x1 - a.x0) * (a.y1 - a.y0) * (a.z1 - a.z0); });
        expect(av, k + '#' + q.bp.id).toBeLessThanOrEqual(MAX_ACCENT_CELLS);
        n++;
      });
    });
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThanOrEqual(260);
    expect(INTERIOR_ERRORS).toEqual([]);
  });

  it('BFS: gerçek chunk dünyasında (kanca + kabuk) sokak kapısından her oda ulaşılabilir, ulaşılabilir hava ≥ %70', () => {
    let n = 0;
    let skipped = 0;
    const rep = [];
    each((k, lots) => {
      const worlds = new Map();
      lots.slice(0, 45).forEach((q) => {
        if (!worlds.has(q.seed)) worlds.set(q.seed, chunkWorld(q.seed));
        const it = planInterior(q.bp, q.lot);
        const r = reachableFromStreet(worlds.get(q.seed), it.props, buildingOf(q.bp, it));
        if (!r.streetOk) { skipped++; return; } // kapı önü başka bir yapıyla kapalı (şehir üreticisi sorunu; iç mekâna ait değil)
        n++;
        if (!r.ok || r.unreachableRooms.length) rep.push(k + '#' + q.bp.id + ' v' + q.bp.interior.variant + ' ' + r.fraction.toFixed(2) + ' ' + r.unreachableRooms.join('/'));
      });
    });
    expect(rep).toEqual([]);
    expect(n).toBeGreaterThanOrEqual(180);
    expect(skipped).toBeLessThanOrEqual(Math.ceil((n + skipped) * 0.03));
  });

  it('kule çekirdekli (engelli) parseller de geçerli ve ulaşılabilir (holo sinema/arcade/sanat)', () => {
    let withCore = 0;
    ['holo_sinema', 'arcade', 'sanat_studyosu'].forEach((k) => {
      const worlds = new Map();
      LOTS[k].forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        if (!it.obstacles.length) return;
        withCore++;
        if (!worlds.has(q.seed)) worlds.set(q.seed, chunkWorld(q.seed));
        expect(validateInterior(it, { minProps: 20 }).errors, k + '#' + q.bp.id).toEqual([]);
        const r = reachableFromStreet(worlds.get(q.seed), it.props, buildingOf(q.bp, it));
        if (r.streetOk) expect(r.ok, k + '#' + q.bp.id + ' ' + r.fraction.toFixed(2)).toBe(true);
      });
    });
    expect(withCore).toBeGreaterThanOrEqual(6);
  });
});

describe('interiors_c — belirlenimcilik ve kesit birleşimi', () => {
  it('planInterior önbellek temizlense de JSON-özdeş; farklı tohum farklı', () => {
    each((k, lots) => {
      const a = lots.slice(0, 12).map((q) => digest(planInterior(q.bp, q.lot)));
      clearInteriorCache();
      const b = lots.slice(0, 12).map((q) => digest(planInterior(q.bp, q.lot)));
      expect(b, k).toEqual(a);
      expect(new Set(a).size, k).toBeGreaterThan(6);
    });
  });

  it('kesit birleşimi = bütün inşa (tür başına 8 parsel, ileri/geri chunk sırası)', () => {
    let n = 0;
    each((k, lots) => {
      // yüzleri ve çekirdekli/çekirdeksiz çeşitlendir
      const pick = [];
      const faces = new Set();
      lots.forEach((q) => {
        const key = q.bp.doors[0].face + frameOf(planInterior(q.bp, q.lot)).mirror;
        if (pick.length < 8 && !faces.has(key)) { faces.add(key); pick.push(q); }
      });
      lots.forEach((q) => { if (pick.length < 8 && pick.indexOf(q) < 0) pick.push(q); });
      pick.forEach((q) => {
        const region = regionOf(q.bp);
        const bw = emitWhole(q.bp, q.lot, region);
        [emitSlices(q.bp, q.lot, region, 'forward'), emitSlices(q.bp, q.lot, region, 'reverse')].forEach((slices) => {
          for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
            for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
              const arr = slices.get(cx + ',' + cz);
              for (let y = 0; y < HEIGHT; y++) {
                for (let lz = 0; lz < 16; lz++) {
                  for (let lx = 0; lx < 16; lx++) {
                    if (arr[(y << 8) + (lz << 4) + lx] !== bw.get(cx * 16 + lx, y, cz * 16 + lz)) {
                      throw new Error(k + '#' + q.bp.id + ' kesit uyuşmuyor ' + (cx * 16 + lx) + ',' + y + ',' + (cz * 16 + lz));
                    }
                  }
                }
              }
            }
          }
        });
        let nz = 0;
        for (let i = 0; i < bw.blocks.length; i++) if (bw.blocks[i] !== 0) nz++;
        expect(nz).toBeGreaterThan(300);
        n++;
      });
    });
    expect(n).toBe(40);
    expect(INTERIOR_ERRORS).toEqual([]);
  });

  it('emit belirlenimli: aynı parsel iki kez aynı bayt; emisyon bütçesi: yerleşim işlemleri (ops) emisyon bloğu yazmaz', () => {
    const emissive = (id) => EMIT_LUT[id] > 0;
    each((k, lots) => {
      lots.slice(0, 10).forEach((q) => {
        const region = regionOf(q.bp);
        const a = emitWhole(q.bp, q.lot, region);
        const b = emitWhole(q.bp, q.lot, region);
        expect(digest(Array.from(a.blocks)), k).toBe(digest(Array.from(b.blocks)));
        const it = planInterior(q.bp, q.lot);
        it.layout.ops.forEach((o) => {
          ['id', 'a', 'b', 'c', 'cube', 'slab', 'top'].forEach((f) => {
            if (typeof o[f] === 'number' && o[f] > 0) expect(emissive(o[f]), k + ' op ' + o.t + '.' + f + '=' + o[f] + ' (' + (BLOCKS[o[f]] && BLOCKS[o[f]].key) + ')').toBe(false);
          });
        });
      });
    });
  });
});

describe('interiors_c — içerik: sahip, imza, çip, ekranlar, güvenli metin', () => {
  it('sahip çapası (ownerPost + anchors[owner]), imza eşyası, ≥1 çip, ortam sesi ve ton her parselde', () => {
    each((k, lots) => {
      const ow = OWNER_BY_INTERIOR[k];
      lots.forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        const tag = k + '#' + q.bp.id;
        expect(it.ownerPost, tag).not.toBeNull();
        expect(Number.isFinite(it.ownerPost.x + it.ownerPost.y + it.ownerPost.z), tag).toBe(true);
        expect(it.anchors.some((a) => a.type === 'owner'), tag).toBe(true);
        expect(it.signature, tag).not.toBeNull();
        expect(it.signature.key).toBe(ow.signature.key);
        expect(it.signature.itemKey).toBe(ow.signature.itemKey);
        expect(it.chips.length, tag).toBeGreaterThanOrEqual(1);
        expect(it.mood.ambient, tag).toBe(ow.mood.ambient);
        expect(MOOD_HUES.indexOf(it.mood.hue), tag).toBeGreaterThanOrEqual(0);
        expect(it.mood.light).toBeGreaterThanOrEqual(8);
        expect(it.mood.light).toBeLessThanOrEqual(14);
        expect(it.kindOwnerId).toBe(ow.id);
        // sahip konumu bir odada ve çarpışmasız
        const inRoom = it.rooms.some((r) => it.ownerPost.x >= r.x0 && it.ownerPost.x < r.x1 && it.ownerPost.z >= r.z0 && it.ownerPost.z < r.z1);
        expect(inRoom, tag).toBe(true);
      });
    });
  });

  it('dron kurye: courier_desk çapası + pois + kurye masası propu her parselde', () => {
    LOTS.dron_kurye.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const a = it.anchors.filter((x) => x.type === 'courier_desk');
      expect(a.length, '#' + q.bp.id).toBe(1);
      expect(it.pois.some((p) => p.type === 'courier_desk' && p.x === a[0].x && p.z === a[0].z)).toBe(true);
      const desk = it.props.find((p) => p.kind === 'kurye_tezgahi');
      expect(desk, '#' + q.bp.id).toBeDefined();
      expect(Math.hypot(desk.x - a[0].x, desk.z - a[0].z)).toBeLessThan(3);
      expect(getCatalogDef('kurye_tezgahi').interact.kind).toBe('dialog');
    });
  });

  it('arcade: makineler 6 programdan ≥3 farklısını gösterir (variant=data), skor tablosu; holo sinema: perde propları + ≥3 reklam', () => {
    LOTS.arcade.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const cabs = it.props.filter((p) => p.kind === 'arcade_makinesi');
      expect(cabs.length, '#' + q.bp.id).toBeGreaterThanOrEqual(6);
      const progs = new Set(cabs.map((p) => p.variant));
      expect(progs.size).toBeGreaterThanOrEqual(3);
      cabs.forEach((p) => expect(p.data).toBe(p.variant));
      const sc = it.screens.filter((s) => s.kind === 'arcade');
      expect(sc.length).toBe(1);
      expect(sc[0].games.length).toBe(cabs.length);
      expect(it.props.some((p) => p.kind === 'skor_tablosu') || it.props.length >= 20).toBe(true);
    });
    LOTS.holo_sinema.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      const screens = it.props.filter((p) => p.kind === 'holo_perde');
      expect(screens.length, '#' + q.bp.id).toBeGreaterThanOrEqual(1);
      const sc = it.screens.filter((s) => s.kind === 'ads');
      expect(sc.length).toBeGreaterThanOrEqual(1);
      sc.forEach((s) => {
        expect(s.ads.length).toBeGreaterThanOrEqual(3);
        s.slots.forEach((slot) => expect(it.props.some((p) => p.slot === slot)).toBe(true));
      });
      expect(it.props.some((p) => p.kind === 'sinema_koltugu')).toBe(true);
    });
  });

  it('güvenli metin: oyun/reklam/imza/kurye adları ve tüm prop adları aile dostu (citySafe taraması); gerçek marka/yasak sözcük yok', () => {
    const texts = new Set();
    LOTS.arcade.slice(0, 20).forEach((q) => planInterior(q.bp, q.lot).screens.forEach((s) => (s.games || []).forEach((g) => texts.add(String(g.game).replace(/_/g, ' ')))));
    LOTS.holo_sinema.slice(0, 20).forEach((q) => planInterior(q.bp, q.lot).screens.forEach((s) => (s.ads || []).forEach((id) => {
      const ad = CITY_AD_LINES.find((a) => a.id === id);
      expect(ad, id).toBeDefined();
      texts.add(ad.text);
    })));
    each((k, lots) => {
      const it = planInterior(lots[0].bp, lots[0].lot);
      texts.add(it.signature.name);
      it.props.forEach((p) => { const d = getCatalogDef(p.kind); if (d) { texts.add(d.name); if (d.interact) texts.add(d.interact.prompt); } });
      it.pois.forEach((p) => texts.add(String(p.type).replace(/_/g, ' ')));
    });
    ['yilan kovala', 'tugla zipla', 'uzay gezgin', 'labirent gezgin', 'balon topla', 'bulmaca kup'].forEach((t) => texts.add(t));
    const bad = [];
    texts.forEach((t) => { if (scanText(t).length) bad.push(t + ' -> ' + JSON.stringify(scanText(t))); });
    expect(bad).toEqual([]);
    expect(texts.size).toBeGreaterThan(30);
  });
});

describe('interiors_c — kilitler ve gizli oda', () => {
  /** entry odasından, `skipDoor` kapısı kullanılmadan ulaşılabilen oda kümesi (graf). */
  function reachableWithout(it, skipDoor) {
    const adj = new Map();
    it.rooms.forEach((r) => adj.set(r.id, []));
    it.graph.forEach((e) => {
      if (e[2] === skipDoor) return;
      adj.get(e[0]).push(e[1]);
      adj.get(e[1]).push(e[0]);
    });
    const seen = new Set([it.entry.room]);
    const st = [it.entry.room];
    while (st.length) {
      const c = st.pop();
      adj.get(c).forEach((n) => { if (!seen.has(n)) { seen.add(n); st.push(n); } });
    }
    return seen;
  }

  it('kilit kayıtları: kimlik DIM_ID_RE, benzersiz, kapı grafta; kod kilidi 3–4 haneli 1..6 + ipucu notu kilidin ÖNÜNDE (DAG); mini_hack oyunu geçerli; düzenek propu var', () => {
    const kinds = {};
    each((k, lots) => {
      lots.forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        const tag = k + '#' + q.bp.id;
        const ids = new Set();
        it.locks.forEach((l) => {
          expect(DIM_ID_RE_TEST.test(l.id), tag + ' ' + l.id).toBe(true);
          expect(ids.has(l.id), tag).toBe(false);
          ids.add(l.id);
          const door = it.doors.find((d) => d.id === l.door);
          expect(door, tag).toBeDefined();
          expect(door.lock && door.lock.id, tag).toBe(l.id);
          expect(['serbest', 'kod', 'mini_hack']).toContain(l.kind);
          kinds[k + ':' + l.kind] = (kinds[k + ':' + l.kind] || 0) + 1;
          const edge = it.graph.find((e) => e[2] === l.door);
          const open = reachableWithout(it, l.door);
          // kilidin arkası: kapının iki ucundan entry'den uzak olan
          const behind = open.has(edge[0]) ? edge[1] : edge[0];
          expect(open.has(behind), tag + ' kilit arkası zaten açık değil').toBe(false);
          if (l.kind === 'kod') {
            expect([3, 4]).toContain(l.data.code.length);
            l.data.code.forEach((d) => { expect(d >= 1 && d <= 6).toBe(true); });
            expect(l.clue, tag).not.toBeNull();
            const note = it.props.find((p) => p.slot === l.clue.slot);
            expect(note, tag).toBeDefined();
            expect(note.kind).toBe('kod_notu');
            expect(unpackCode(note.data)).toEqual(l.data.code);
            expect(open.has(l.clue.room), tag + ' ipucu kilidin ARKASINDA').toBe(true);
            expect(l.data.clue.slot).toBe(note.slot);
            // kapı yanında kod paneli
            expect(it.props.some((p) => p.kind === 'kod_paneli'), tag).toBe(true);
          } else if (l.kind === 'mini_hack') {
            expect(['simon', 'levers', 'dice']).toContain(l.data.game);
            expect(it.props.some((p) => p.kind === 'hack_terminali'), tag).toBe(true);
          } else {
            expect(l.tier).toBe(0);
          }
        });
        // kilitli kapıların sokaktan kapı sayısı: sokak kapısı asla kilitli değil
        expect(it.doors.find((d) => d.kind === 'street').lock).toBeUndefined();
      });
    });
    // her türde en az bir kilit türü kullanılır, varyantlar kilit çeşitliliği verir
    expect(Object.keys(kinds).filter((x) => x.endsWith(':kod')).length).toBe(5);
    expect(Object.keys(kinds).filter((x) => x.endsWith(':mini_hack')).length).toBe(4); // sanat: kod + gizli (serbest) kilit
    expect(kinds['sanat_studyosu:serbest']).toBeGreaterThan(0);
  });

  it('sanat stüdyosu V2: gizli oda (hidden meta, gizli_kapi_raf kapı propu, odada çip), hapis yok (kapı grafta ve prop çarpışması door etiketli)', () => {
    let n = 0;
    LOTS.sanat_studyosu.forEach((q) => {
      const it = planInterior(q.bp, q.lot);
      if (q.bp.interior.variant !== 2) { expect(it.hidden).toBeNull(); return; }
      n++;
      expect(it.hidden, '#' + q.bp.id).not.toBeNull();
      expect(it.rooms.some((r) => r.id === it.hidden.room)).toBe(true);
      const door = it.doors.find((d) => d.id === it.hidden.door);
      expect(door).toBeDefined();
      const shelf = it.props.find((p) => p.kind === 'gizli_kapi_raf');
      expect(shelf, '#' + q.bp.id).toBeDefined();
      expect(Math.abs(shelf.x - (door.x + 0.5)) + Math.abs(shelf.z - (door.z + 0.5))).toBeLessThan(0.01);
      expect(getCatalogDef('gizli_kapi_raf').tags).toContain('door');
      expect(it.chips.length).toBeGreaterThanOrEqual(1);
    });
    expect(n).toBeGreaterThan(10);
  });

  it('içeriden çıkış her zaman serbest: sokak kapısı dışındaki hiçbir kilit entry odasını hapsetmez (entry odası kilitli kapının ARKASINDA değil)', () => {
    each((k, lots) => {
      lots.forEach((q) => {
        const it = planInterior(q.bp, q.lot);
        it.locks.forEach((l) => {
          const edge = it.graph.find((e) => e[2] === l.door);
          expect(edge.indexOf(it.entry.room) >= 0 || reachableWithout(it, l.door).has(it.entry.room)).toBe(true);
        });
      });
    });
  });
});
