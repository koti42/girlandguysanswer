/*
 * interiors_b testleri: 7–11. iç mekân türleri (garaj atölyesi, kulüp, market, çatı bahçesi, kitap-kafe) — gerçek şehir planı, gerçek chunk üretimi.
 * validateInterior · BFS ulaşılabilirlik · hava ≥ %70 · belirlenimcilik · kesit birleşimi = bütün · ışık/aksan bütçesi · güvenli metin · sahip/imza/çip/kilit.
 */
import {
  afterAll, beforeAll, describe, expect, it, vi,
} from 'vitest';
import { EMIT_LUT } from '../../blocks.js';
import { getCatalogDef } from '../../props/propCatalog.js';
import { citySeed, digest } from '../cityPlanTestKit.js';
import { scanText } from '../citySafeData.js';
import { AMBIENT_KEYS, OWNER_BY_INTERIOR } from '../ownerData.js';
import {
  INTERIOR_ERRORS, clearInteriorCache, frameOf, getInterior, planInterior, setInteriorStrict,
} from './index.js';
import {
  buildingOf, reachableFromStreet, validateInterior, MAX_ACCENT_CELLS, MAX_LIGHTS_PER_ROOM,
} from './graph.js';
import { assignClues, normalizeLock, solveReachability } from './locks.js';
import {
  HEIGHT, chunkWorld, emitSlices, emitWhole, interiorLots, regionOf,
} from './testKit.js';
import { emissiveCount, volumeStats, asciiPlan } from './kindsBTestKit.js';
import { propBoxes } from './graph.js';

// qa5: geniş tarama testi boşta ≈ 37 sn; CPU doygunken 60 sn varsayılanını aşabiliyordu (zaman aşımı, mantık hatası değil)
vi.setConfig({ testTimeout: 600000 });

const KINDS = ['garaj_atolyesi', 'kulup', 'market', 'cati_bahcesi', 'kitap_kafe'];
const SEEDS = [1, 2, 3, 4, 5, 6].map(citySeed);
const LOT_CAP = 36;

/** tür başına örnek: her varyanttan en çok LOT_CAP/3, tohumlar arasında dengeli; çekirdekli/çekirdeksiz karışık. */
function sample(kind, per) {
  const out = [];
  const cnt = [0, 0, 0];
  const lim = per || Math.ceil(LOT_CAP / 3);
  for (let s = 0; s < SEEDS.length; s++) {
    interiorLots(SEEDS[s], { kinds: [kind] }).forEach(({ lot, bp }) => {
      const v = bp.interior.variant;
      if (cnt[v] < lim) {
        cnt[v]++;
        out.push({ seed: SEEDS[s], lot, bp });
      }
    });
  }
  return out;
}

const SAMPLES = {};
KINDS.forEach((k) => { SAMPLES[k] = sample(k); });

function allStrings(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => { out.push(k); allStrings(v[k], out); });
  return out;
}

describe('interiors_b — kayıt', () => {
  beforeAll(() => {
    setInteriorStrict(true);
    clearInteriorCache();
  });
  afterAll(() => {
    setInteriorStrict(false);
    clearInteriorCache();
  });

  it('5 tür kayıtlı (ownerData sırası 7–11), ayak izi rezerve sığar, sahip eşleşir', () => {
    const order = ['garaj_atolyesi', 'kulup', 'market', 'cati_bahcesi', 'kitap_kafe'];
    order.forEach((k) => {
      const impl = getInterior(k);
      expect(impl, k).not.toBeNull();
      expect(impl.kind).toBe(k);
      const fp = impl.footprint(0);
      expect(fp.w).toBeGreaterThan(8);
      expect(fp.h).toBeGreaterThanOrEqual(4);
      expect(OWNER_BY_INTERIOR[k]).toBeDefined();
    });
    expect(['garaj_atolyesi', 'kulup', 'market', 'cati_bahcesi', 'kitap_kafe']).toEqual(order);
  });

  it('her tür için örnek yeterli: 3 varyant × ≥ 6 parsel', () => {
    KINDS.forEach((k) => {
      const cnt = [0, 0, 0];
      SAMPLES[k].forEach((q) => cnt[q.bp.interior.variant]++);
      cnt.forEach((n, v) => expect(n, k + ' V' + v).toBeGreaterThanOrEqual(6));
    });
  });
});

KINDS.forEach((kind) => {
  describe('interiors_b/' + kind, () => {
    beforeAll(() => {
      setInteriorStrict(true);
      clearInteriorCache();
      INTERIOR_ERRORS.length = 0;
    });
    afterAll(() => {
      setInteriorStrict(false);
      clearInteriorCache();
    });

    it('planInterior → validateInterior temiz; 20–40 katalog propu; eksik/yerleşemeyen anahtar yok', () => {
      const keys = new Set();
      SAMPLES[kind].forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        expect(it, kind + '#' + bp.id).not.toBeNull();
        const v = validateInterior(it, { minProps: 20 });
        expect(v.errors, kind + '#' + bp.id + ' V' + it.variant + '\n' + asciiPlan(it)).toEqual([]);
        expect(it.props.length).toBeGreaterThanOrEqual(20);
        expect(it.props.length, kind + ' V' + it.variant).toBeLessThanOrEqual(40);
        it.props.forEach((p) => {
          expect(getCatalogDef(p.kind), p.kind).not.toBeNull();
          keys.add(p.kind);
        });
      });
      expect(keys.size).toBeGreaterThanOrEqual(10);
      expect(INTERIOR_ERRORS).toEqual([]);
    });

    it('3 varyant gerçekten farklı: düzen kimliği V=0,1,2; yapı parmak izi (oda rolleri + kapı türleri + kilit türü/kademe) ya da prop dağılımı farklı', () => {
      const hist = [{}, {}, {}];
      const cnt = [0, 0, 0];
      const fps = [new Set(), new Set(), new Set()];
      SAMPLES[kind].forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        expect(it.layout.v).toBe(it.variant);
        cnt[it.variant]++;
        it.props.forEach((p) => { hist[it.variant][p.kind] = (hist[it.variant][p.kind] || 0) + 1; });
        fps[it.variant].add([
          it.rooms.map((r) => r.role).sort().join('+'),
          it.doors.map((d) => d.kind).sort().join('+'),
          it.locks.map((l) => l.kind + ':' + l.tier + ':' + (l.data.game || l.data.clue || '')).sort().join('+'),
        ].join('|'));
      });
      const norm = hist.map((h, v) => { const o = {}; Object.keys(h).forEach((k) => { o[k] = h[k] / cnt[v]; }); return o; });
      for (let a = 0; a < 3; a++) {
        for (let c = a + 1; c < 3; c++) {
          const ks = new Set(Object.keys(norm[a]).concat(Object.keys(norm[c])));
          let d = 0;
          ks.forEach((k) => { d += Math.abs((norm[a][k] || 0) - (norm[c][k] || 0)); });
          const common = Array.from(fps[a]).filter((q) => fps[c].has(q));
          expect(d > 6 || common.length === 0, kind + ' V' + a + '/V' + c + ' d=' + d.toFixed(1) + ' ortak=' + common.join(';')).toBe(true);
        }
      }
    });

    it('BFS: sokaktan her oda ulaşılabilir (blok + prop çarpışması), ulaşılabilir hava ≥ %70', () => {
      const bad = [];
      let minFrac = 1;
      const worlds = new Map();
      SAMPLES[kind].forEach(({ seed, lot, bp }) => {
        if (!worlds.has(seed)) worlds.set(seed, chunkWorld(seed));
        const it = planInterior(bp, lot);
        const r = reachableFromStreet(worlds.get(seed), it.props, buildingOf(bp, it));
        minFrac = Math.min(minFrac, r.fraction);
        if (!r.ok || r.unreachableRooms.length || r.fraction < 0.7) bad.push(bp.id + ' V' + it.variant + ' ' + r.streetOk + ' ' + r.fraction.toFixed(3) + ' ' + r.unreachableRooms.join('/'));
      });
      expect(bad).toEqual([]);
      expect(minFrac).toBeGreaterThanOrEqual(0.7);
    });

    it('planlar belirlenimci (önbellek temizlenince JSON özdeş) ve tohuma duyarlı', () => {
      const pick = SAMPLES[kind].slice(0, 12);
      const d1 = pick.map(({ lot, bp }) => digest(planInterior(bp, lot)));
      clearInteriorCache();
      const d2 = pick.map(({ lot, bp }) => digest(planInterior(bp, lot)));
      expect(d2).toEqual(d1);
      const others = SAMPLES[kind].slice(12, 24).map(({ lot, bp }) => digest(planInterior(bp, lot)));
      expect(others.join()).not.toBe(d1.join());
    });

    it('blok yayımı belirlenimci; kesit birleşimi = bütün inşa (ileri/geri chunk sırası)', () => {
      const pick = [];
      const seenV = [0, 0, 0];
      SAMPLES[kind].forEach((q) => {
        const v = q.bp.interior.variant;
        if (seenV[v] < 4) {
          seenV[v]++;
          pick.push(q);
        }
      });
      pick.forEach(({ lot, bp }) => {
        const region = regionOf(bp);
        const a = emitWhole(bp, lot, region);
        const b2 = emitWhole(bp, lot, region);
        expect(a.blocks.length === b2.blocks.length && a.blocks.every((q, i) => q === b2.blocks[i]), 'belirlenimci ' + bp.id).toBe(true);
        const s1 = emitSlices(bp, lot, region, 'forward');
        const s2 = emitSlices(bp, lot, region, 'reverse');
        [s1, s2].forEach((slices) => {
          for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
            for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
              const arr = slices.get(cx + ',' + cz);
              for (let y = 0; y < HEIGHT; y++) {
                for (let lz = 0; lz < 16; lz++) {
                  for (let lx = 0; lx < 16; lx++) {
                    const x = cx * 16 + lx;
                    const z = cz * 16 + lz;
                    if (arr[(y << 8) + (lz << 4) + lx] !== a.get(x, y, z)) throw new Error('kesit uyuşmazlığı lot ' + bp.id + ' (' + x + ',' + y + ',' + z + ')');
                  }
                }
              }
            }
          }
        });
        let nz = 0;
        for (let i = 0; i < a.blocks.length; i++) if (a.blocks[i] !== 0) nz++;
        expect(nz).toBeGreaterThan(400);
      });
    });

    it('ışık bütçesi: oda başına ≤ 4 ışık, aksan ≤ 120 hücre, ışıma hücresi toplamı sınırlı, tüm ışıklar odasında', () => {
      let maxEmit = 0;
      SAMPLES[kind].slice(0, 18).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const per = {};
        it.lights.forEach((l) => { per[l.room] = (per[l.room] || 0) + 1; });
        Object.keys(per).forEach((r) => expect(per[r], r).toBeLessThanOrEqual(MAX_LIGHTS_PER_ROOM));
        let av = 0;
        it.accents.forEach((a) => { av += (a.x1 - a.x0) * (a.y1 - a.y0) * (a.z1 - a.z0); });
        expect(av).toBeLessThanOrEqual(MAX_ACCENT_CELLS);
        const bw = emitWhole(bp, lot, regionOf(bp));
        const n = emissiveCount((x, y, z) => bw.get(x, y, z), it.bounds);
        maxEmit = Math.max(maxEmit, n);
        // her oda en az 1 ışık
        it.rooms.forEach((r) => expect(per[r.id] || 0, 'oda ışıksız: ' + r.id).toBeGreaterThanOrEqual(1));
      });
      expect(maxEmit).toBeLessThanOrEqual(190);
    });

    it('sahip, imza, çip, çapa, ortam sesi, kilit kaydı ve çözülebilirlik', () => {
      const own = OWNER_BY_INTERIOR[kind];
      SAMPLES[kind].forEach(({ seed, lot, bp }) => {
        const it = planInterior(bp, lot);
        expect(it.kindOwnerId).toBe(own.id);
        expect(it.signature).not.toBeNull();
        expect(it.signature.key).toBe(own.signature.key);
        expect(it.ownerPost).not.toBeNull();
        expect(it.anchors.some((a) => a.type === 'owner')).toBe(true);
        expect(it.chips.length).toBeGreaterThanOrEqual(1);
        expect(AMBIENT_KEYS).toContain(it.mood.ambient);
        expect(it.mood.ambient).toBe(own.mood.ambient);
        expect(it.ambient).toBe(own.mood.ambient);
        expect(it.mood.hue).toBe(own.mood.hue);
        expect(it.locks.length).toBeGreaterThanOrEqual(1);
        it.locks.forEach((l) => {
          expect(l.id).toMatch(/^[0-9a-z]{1,10}$/);
          expect(normalizeLock({ id: l.id, kind: l.kind, tier: l.tier, data: l.data })).not.toBeNull();
          const door = it.doors.find((d) => d.id === l.door);
          expect(door && door.lock && door.lock.id).toBe(l.id);
        });
        // kilit çözümü kilidin arkasında değil + hapis yok (giriş her zaman serbest: kilitli kapı iç kapıdır)
        const sr = solveReachability(it, { seed, lotId: lot.id });
        expect(sr.ok, JSON.stringify(sr.unsolved)).toBe(true);
        expect(sr.dag.violations).toEqual([]);
        // kod notu eşleşmesi
        const clues = assignClues(it);
        it.locks.filter((l) => l.kind === 'kod' && l.clue).forEach((l) => expect(clues.has(l.id)).toBe(true));
        // sokak kapısı kilitsiz; çip/imza hacmin içinde
        expect(it.doors.find((d) => d.kind === 'street').lock).toBeUndefined();
        const b = it.bounds;
        [it.signature].concat(it.chips).forEach((p) => {
          expect(p.x).toBeGreaterThanOrEqual(b.x0);
          expect(p.x).toBeLessThanOrEqual(b.x1);
          expect(p.z).toBeGreaterThanOrEqual(b.z0);
          expect(p.z).toBeLessThanOrEqual(b.z1);
        });
      });
    });

    it('çapalar (sahip duruşu, satıcı, park yeri) ve çipler bir odanın içinde, çarpışmasız zemin hücresinde', () => {
      SAMPLES[kind].forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const pb = propBoxes(it.props);
        const inRoom = (p) => it.rooms.some((r) => p.x >= r.x0 && p.x < r.x1 && p.z >= r.z0 && p.z < r.z1 && p.y >= r.y0 - 0.01 && p.y < r.y1);
        const blocked = (p) => pb.some((e) => e.def && e.def.tags.indexOf('door') < 0 && e.boxes.some((b) => p.x > b[0] + 1e-6 && p.x < b[3] - 1e-6 && p.z > b[2] + 1e-6 && p.z < b[5] - 1e-6 && b[4] > p.y + 0.5 && b[1] < p.y + 1.8));
        const obst = (p) => it.obstacles.some((o) => p.x >= o.x0 && p.x < o.x1 && p.z >= o.z0 && p.z < o.z1);
        it.anchors.concat(it.chips, it.ownerPost ? [it.ownerPost] : []).forEach((p) => {
          const tag = kind + '#' + bp.id + ' V' + it.variant + ' ' + (p.type || p.slot || 'post');
          expect(inRoom(p), tag + ' odada değil').toBe(true);
          expect(obst(p), tag + ' çekirdek içinde').toBe(false);
          expect(blocked(p), tag + ' çarpışma içinde').toBe(false);
        });
      });
    });

    it('güvenli metin: kayıt adı, oda rolleri, anahtarlar ve düzen dizgeleri yasak sözcük/marka taramasından geçer', () => {
      const impl = getInterior(kind);
      const strs = [impl.name];
      SAMPLES[kind].slice(0, 20).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        allStrings([it.kind, it.rooms.map((r) => r.role), it.props.map((p) => p.kind), it.anchors.map((a) => a.type), it.layout, it.mood, it.locks.map((l) => [l.id, l.kind, l.data])], strs);
      });
      const uniq = Array.from(new Set(strs));
      uniq.forEach((s) => expect(scanText(String(s)).length, s).toBe(0));
    });

    it('bloklar: dolu hacim, ayırt edici çeşitlilik, zemin/tavan yazılı, çerçeve dışına taşma yok', () => {
      const ids = new Set();
      SAMPLES[kind].slice(0, 12).forEach(({ lot, bp }) => {
        const it = planInterior(bp, lot);
        const fr = frameOf(it);
        const region = regionOf(bp);
        const bw = emitWhole(bp, lot, region);
        const st = volumeStats((x, y, z) => bw.get(x, y, z), { x0: it.bounds.x0, x1: it.bounds.x1, z0: it.bounds.z0, z1: it.bounds.z1, y0: it.bounds.y0, y1: it.bounds.y1 });
        st.blocks.forEach((n, id) => { if (id) ids.add(id); });
        const total = st.air + st.solid;
        expect(st.air / total, 'hava oranı').toBeGreaterThan(0.45);
        // ayrılan hacmin dışındaki hücreler (bina içi zemin satırı altı hariç) yazılmadı: bounds + 1 halka dışı
        for (let x = region.x0; x < region.x1; x++) {
          for (let z = region.z0; z < region.z1; z++) {
            const inB = x >= it.bounds.x0 - 1 && x <= it.bounds.x1 && z >= it.bounds.z0 - 1 && z <= it.bounds.z1;
            if (inB) continue;
            for (let y = 0; y < HEIGHT; y++) if (bw.get(x, y, z) !== 0) throw new Error('hacim dışına yazıldı ' + x + ',' + y + ',' + z);
          }
        }
        expect(fr.H).toBeGreaterThanOrEqual(4);
      });
      expect(ids.size).toBeGreaterThanOrEqual(10);
    });
  });
});

describe('interiors_b — türe özgü', () => {
  beforeAll(() => {
    setInteriorStrict(true);
    clearInteriorCache();
  });
  afterAll(() => {
    setInteriorStrict(false);
    clearInteriorCache();
  });

  it('garaj: araç bölmeleri (park_slot çapaları), lift, yarım+ rulo/cam; her varyantta ≥ 1 park yeri ve ≥ 1 lift', () => {
    SAMPLES.garaj_atolyesi.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      const slots = it.anchors.filter((a) => a.type === 'park_slot');
      expect(slots.length, 'V' + it.variant).toBeGreaterThanOrEqual(1);
      expect(it.props.filter((p) => p.kind === 'arac_lifti').length).toBeGreaterThanOrEqual(1);
      slots.forEach((a) => expect(Number.isInteger(a.bay)).toBe(true));
      expect(it.layout.bays.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('market: satıcı çapası + kasa masası dükkân propu + reyonlar; çekirdekli binada da', () => {
    SAMPLES.market.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      expect(it.anchors.some((a) => a.type === 'vendor')).toBe(true);
      expect(it.props.some((p) => p.kind === 'kasa_masasi' && getCatalogDef('kasa_masasi').interact.kind === 'buy')).toBe(true);
      expect(it.props.filter((p) => ['market_rafi', 'raf_unitesi', 'market_buzluk', 'vitrin'].indexOf(p.kind) >= 0).length).toBeGreaterThanOrEqual(3);
    });
  });

  it('kulüp: çoğu kule çekirdeğinin yanından dolanır; strobo yok (yalnız sabit/yavaş ışık), pist+sahne+bar propları', () => {
    let core = 0;
    SAMPLES.kulup.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      if (it.obstacles.length) core++;
      const keys = it.props.map((p) => p.kind);
      expect(keys).toContain('dj_standi');
      expect(keys).toContain('dans_zemini');
      expect(keys).toContain('meyve_bari');
      expect(keys).toContain('isik_demeti');
      expect(it.layout.dance.length).toBeGreaterThanOrEqual(1);
      expect(it.layout.stage).not.toBeNull();
      expect(it.fx).toEqual({ wash: true, periodSec: 6, strobe: false });
      expect(1 / it.fx.periodSec).toBeLessThanOrEqual(3);
    });
    expect(core).toBeGreaterThan(0);
  });

  it('çatı bahçesi: gök freski + yeşil mood + kuş/rüzgâr ortamı; saksı/sera/havuz propları; en az bir cam sera', () => {
    SAMPLES.cati_bahcesi.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      expect(it.mood.ambient).toBe('kus_ruzgar');
      expect(it.mood.hue).toBe('yesil');
      expect(it.layout.glass.length).toBeGreaterThanOrEqual(1);
      expect(it.fx.sky).toBe(true);
      expect(it.fx.wind).toBe(true);
      expect(it.roofAnchors === null || Number.isFinite(it.roofAnchors.y)).toBe(true);
      const keys = it.props.map((p) => p.kind);
      expect(keys.filter((k) => k === 'saksi_buyuk' || k === 'sera_rafi').length).toBeGreaterThanOrEqual(4);
      expect(it.rooms.some((r) => r.role === 'sera')).toBe(true);
    });
  });

  it('kitap-kafe: V1 gizli oda (gizli_kapi_raf, hidden bildirimi) ve V0 kod_notu ipucu kilidin önündeki odada', () => {
    SAMPLES.kitap_kafe.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      if (it.variant === 1) {
        expect(it.hidden).not.toBeNull();
        expect(it.hidden.room).toBe('gizli');
        expect(it.props.some((p) => p.kind === 'gizli_kapi_raf')).toBe(true);
        expect(it.doors.find((d) => d.id === it.hidden.door).hidden).toBe(true);
      }
      if (it.variant === 0) {
        const l = it.locks.find((q) => q.kind === 'kod');
        expect(l.clue.key).toBe('kod_notu');
        expect(l.clue.room).toBe('salon');
        const note = it.props.find((p) => p.slot === l.clue.slot);
        expect(note.kind).toBe('kod_notu');
      }
    });
  });
});

describe('interiors_b — geniş tarama (24 tohum, tüm parseller)', () => {
  beforeAll(() => {
    setInteriorStrict(true);
    clearInteriorCache();
    INTERIOR_ERRORS.length = 0;
  });
  afterAll(() => {
    setInteriorStrict(false);
    clearInteriorCache();
  });

  it('her parselde plan geçerli (validateInterior, ≥ 20 prop, ≥ %70 hava, kilit çözülebilir), kapı önü ve prop örtüşmesi temiz', () => {
    const seeds = [];
    for (let i = 10; i < 34; i++) seeds.push(citySeed(i));
    let n = 0;
    const bad = [];
    const perKind = {};
    seeds.forEach((seed) => {
      interiorLots(seed, { kinds: KINDS }).forEach(({ lot, bp }) => {
        let it = null;
        n++;
        perKind[bp.interior.kind] = (perKind[bp.interior.kind] || 0) + 1;
        try {
          it = planInterior(bp, lot);
        } catch (e) {
          bad.push(bp.interior.kind + '#' + bp.id + ' V' + bp.interior.variant + ' ' + e.message + ' ' + bp.interior.x1 + 'x' + bp.interior.z1);
          return;
        }
        if (!it) { bad.push(bp.id + ' null'); return; }
        const v = validateInterior(it, { minProps: 20, reach: true });
        if (!v.ok || it.props.length > 40) bad.push(bp.interior.kind + '#' + bp.id + ' V' + it.variant + ' ' + v.errors.slice(0, 2).join(';') + ' props=' + it.props.length);
        const sr = solveReachability(it, { seed, lotId: lot.id });
        if (!sr.ok) bad.push(bp.interior.kind + '#' + bp.id + ' kilit ' + JSON.stringify(sr.unsolved));
      });
    });
    expect(bad.slice(0, 8)).toEqual([]);
    expect(n).toBeGreaterThan(1500);
    KINDS.forEach((k) => expect(perKind[k], k).toBeGreaterThan(40));
    expect(INTERIOR_ERRORS).toEqual([]);
  });

  it('blok yayımı: 60 parselde istisnasız (sıkı kip), hacim dışına taşmaz ve boş değil', () => {
    const picks = [];
    [20, 21, 22, 23, 24].forEach((i) => {
      KINDS.forEach((k) => {
        let c = 0;
        interiorLots(citySeed(i), { kinds: [k] }).forEach((q) => {
          if (c < 3 && (q.bp.interior.variant + i + c) % 2 === 0) { c++; picks.push(q); }
        });
      });
    });
    expect(picks.length).toBeGreaterThanOrEqual(40);
    picks.forEach(({ lot, bp }) => {
      const it = planInterior(bp, lot);
      const bw = emitWhole(bp, lot, regionOf(bp));
      let nz = 0;
      for (let i = 0; i < bw.blocks.length; i++) if (bw.blocks[i] !== 0) nz++;
      expect(nz, bp.interior.kind + '#' + bp.id).toBeGreaterThan(400);
      expect(it.bounds.y1 - it.bounds.y0).toBeGreaterThanOrEqual(4);
    });
    expect(INTERIOR_ERRORS).toEqual([]);
  });
});
