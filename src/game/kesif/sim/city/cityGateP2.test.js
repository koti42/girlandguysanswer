/*
 * qa_p2 — FAZ 2 KAPISI: TAM PLAN ulaşılabilirlik (sözleşme §19 "Faz kapısı G", §20 "BFS", §22.2–22.3).
 *
 * Varsayılan (G1, `npx vitest run`): 200 tohum × (örtüşme-öncelikli) 12 parsel plan düzeyi, 200 tohum × 2 parsel gerçek-blok BFS,
 * 200 parsel kesit birleşimi = bütün, 200 tohum kilit DAG. Tam tarama (kapı koşusu) ortam değişkenleriyle:
 *   KESIF_GATE_SEEDS=200  KESIF_GATE_LOTS=all   plan düzeyi: her tohumda İÇ MEKÂNLI TÜM parseller
 *   KESIF_GATE_BLOCK=all                         gerçek-blok BFS: her parsel (tohum başına ≈1000; 4 ms/parsel)
 *   KESIF_GATE_SHARD=i/n                         tohumları n parçaya böl (paralel süreç)
 *   KESIF_GATE_NAV=k                             ilk k (parça içi) tohumda TÜM ŞEHİR hücre BFS (sızıntı, tuzak, çatı, metro, terminal)
 * Her parsel için: planInterior null değil; validateInterior; planReachability; sokaktan gerçek bloklarda (kabuk + iç mekân + prop çarpışması, kilitler
 * çözülmüş) her oda ulaşılır, hava ≥ %70, TUZAK YOK (girilen her hücreden sokağa geri dönülür); kilit DAG sabit-nokta çözülebilir; metin güvenli.
 * Her tohum AYRI `it` (yük altında tek uzun senkron blok vitest RPC zaman aşımına düşmesin).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allLots } from './cityLots.js';
import { getCityPlan, planBuilding } from './cityPlan.js';
import { citySeed } from './cityPlanTestKit.js';
import { scanText } from './citySafeData.js';
import {
  INTERIOR_ERRORS, clearInteriorCache, planInterior, setInteriorStrict,
} from './interior/index.js';
import { INTERIOR_KINDS } from './interior/registry.js';
import {
  MIN_REACH, buildingOf, planReachability, reachableFromStreet, validateInterior,
} from './interior/graph.js';
import { solveCity } from './interior/locks.js';
import {
  chunkWorld, emitSlices, emitWhole, interiorLots, regionOf,
} from './interior/testKit.js';

const ENV = (globalThis.process && globalThis.process.env) || {};
const N_SEEDS = Number(ENV.KESIF_GATE_SEEDS || 200);
const PLAN_LOTS = ENV.KESIF_GATE_LOTS === 'all' ? Infinity : Number(ENV.KESIF_GATE_LOTS || 12);
const BLOCK_LOTS = ENV.KESIF_GATE_BLOCK === 'all' ? Infinity : Number(ENV.KESIF_GATE_BLOCK || 2);
const NAV_SEEDS = Number(ENV.KESIF_GATE_NAV || 0);
const SHARD = String(ENV.KESIF_GATE_SHARD || '0/1').split('/').map(Number);
const SEEDS = [];
for (let s = 0; s < N_SEEDS; s++) if (s % SHARD[1] === SHARD[0]) SEEDS.push(s);
const FV = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

/** Örtüşme öncelikli seçim: (tür, varyant, arketip) çiftlerinden en az görüleni önce; belirlenimci. */
function pick(list, n, seen) {
  if (n === Infinity || n >= list.length) return list;
  const idx = list.map((q, i) => ({ q, i, k: q.bp.interior.kind + ':' + q.bp.interior.variant + ':' + q.bp.archetype }));
  idx.sort((a, b) => (seen[a.k] || 0) - (seen[b.k] || 0) || a.i - b.i);
  const out = idx.slice(0, n);
  out.forEach((e) => { seen[e.k] = (seen[e.k] || 0) + 1; });
  return out.sort((a, b) => a.i - b.i).map((e) => e.q);
}

function strings(v, out, depth) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && depth < 6) Object.keys(v).forEach((k) => strings(v[k], out, depth + 1));
  return out;
}

/** Kesit birleşimi: chunk dilimleri (ileri/geri) tüm-parsel inşasıyla bayt bayt aynı mı → ilk farklar. */
function sliceDiffs(bp, lot, tag) {
  const region = regionOf(bp);
  const whole = emitWhole(bp, lot, region);
  const diffs = [];
  ['forward', 'reverse'].forEach((order) => {
    const sl = emitSlices(bp, lot, region, order);
    for (let cz = region.z0 / 16; cz < region.z1 / 16; cz++) {
      for (let cx = region.x0 / 16; cx < region.x1 / 16; cx++) {
        const arr = sl.get(cx + ',' + cz);
        for (let y = 0; y < 128; y++) {
          for (let lz = 0; lz < 16; lz++) {
            for (let lx = 0; lx < 16; lx++) {
              const a = arr[(y << 8) + (lz << 4) + lx];
              const b = whole.get(cx * 16 + lx, y, cz * 16 + lz);
              if (a !== b && diffs.length < 6) diffs.push(tag + ' ' + order + ' ' + [cx * 16 + lx, y, cz * 16 + lz] + ' ' + a + '≠' + b);
            }
          }
        }
      }
    }
  });
  return diffs;
}

setInteriorStrict(true);

const planSeen = {};
const blockSeen = {};
const sliceSeen = {};
const combos = new Set();
const stat = {
  plans: 0, blocks: 0, slices: 0, locks: 0, roofStarts: 0,
};

describe('Faz 2 kapısı — tam plan, gerçek bloklar, kilit DAG, kesit birleşimi (tohum başına)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s, () => {
      const seed = citySeed(s);
      const all = interiorLots(seed);
      const bad = [];
      // ---- 1) plan düzeyi
      const list = [];
      pick(all, PLAN_LOTS, planSeen).forEach(({ lot, bp }) => {
        stat.plans++;
        const it = planInterior(bp, lot);
        if (!it) { bad.push(bp.id + ' plan null ' + bp.interior.kind); return; }
        combos.add(bp.interior.kind + ':' + bp.interior.variant);
        const v = validateInterior(it);
        if (!v.ok) bad.push(bp.id + ' ' + bp.interior.kind + ' ' + v.errors.slice(0, 2).join('|'));
        const r = planReachability(it);
        if (r.unreachableRooms.length || r.startBlocked || r.fraction < MIN_REACH) bad.push(bp.id + ' erişim ' + r.fraction.toFixed(2) + ' ' + r.unreachableRooms.join('/'));
        // içeriden çıkış her zaman serbest: kilitleri yok sayan graf yolu (giriş odasından her odaya ⇔ her odadan girişe)
        const adj = new Map();
        it.rooms.forEach((rm) => adj.set(rm.id, []));
        it.graph.forEach((e) => { adj.get(e[0]).push(e[1]); adj.get(e[1]).push(e[0]); });
        const seenR = new Set([it.entry.room]);
        const q = [it.entry.room];
        for (let h = 0; h < q.length; h++) adj.get(q[h]).forEach((n) => { if (!seenR.has(n)) { seenR.add(n); q.push(n); } });
        if (seenR.size !== it.rooms.length) bad.push(bp.id + ' ' + bp.interior.kind + ' çıkışsız oda');
        strings({ o: it.owner, sg: it.signature, m: it.mood, d: it.doors.map((d) => d.lock && d.lock.data), p: it.props.map((p) => p.data) }, [], 0)
          .forEach((t) => { if (scanText(t).length) bad.push(bp.id + ' güvensiz metin ' + t); });
        stat.locks += it.doors.filter((d) => d.lock).length;
        list.push({ lotId: lot.id, interior: it });
      });
      // ---- 2) kilit DAG: şehir çapı kart kapanımı boştan çözülür
      const sc = solveCity(list, { seed, requireClues: true });
      if (!sc.ok) bad.push('kilit DAG çözülemedi ' + JSON.stringify(sc.unsolved.slice(0, 2)));
      // ---- 3) gerçek bloklarda BFS + tuzak
      const world = chunkWorld(seed);
      pick(all, BLOCK_LOTS, blockSeen).forEach(({ lot, bp }) => {
        stat.blocks++;
        const it = planInterior(bp, lot);
        const r = reachableFromStreet(world, it.props, buildingOf(bp, it), { trap: true });
        if (!r.streetOk) bad.push(bp.id + ' ' + bp.interior.kind + ' sokak kapısı önü kapalı (' + bp.archetype + ')');
        else if (!r.ok) bad.push(bp.id + ' ' + bp.interior.kind + ' erişim ' + r.fraction.toFixed(2) + ' ' + r.unreachableRooms.join('/'));
        else if (r.trapped.count) bad.push(bp.id + ' ' + bp.interior.kind + ' tuzak ' + JSON.stringify(r.trapped.samples.slice(0, 2)));
      });
      // ---- 4) çatı parkuru başlangıcı: dış merdiven kapı önünü kapatmaz
      const plan = getCityPlan(seed);
      const lots = allLots(plan);
      plan.roofRoutes.forEach((rr) => {
        const lot = lots.find((l) => l.id === rr.start.lot);
        const bp = planBuilding(seed, lot);
        const d = bp.doors[0];
        stat.roofStarts++;
        if (!d) { bad.push(lot.id + ' çatı başlangıcında kapı yok'); return; }
        const cells = bp.extStair.flights.concat(bp.extStair.landing.cells);
        for (let o = -1; o <= 1; o++) {
          for (let k = 1; k <= 2; k++) {
            const x = d.x + (d.axis === 'x' ? o : 0) + FV[d.face][0] * k;
            const z = d.z + (d.axis === 'z' ? o : 0) + FV[d.face][1] * k;
            if (cells.some((c) => c.x === x && c.z === z)) bad.push(lot.id + ' ' + lot.archetype + ' dış merdiven kapı önünde (w' + lot.w + ')');
          }
        }
      });
      // ---- 5) kesit birleşimi = bütün (tohum başına 1 parsel; 200 tohum → 200 parsel)
      pick(all, 1, sliceSeen).forEach(({ lot, bp }) => {
        stat.slices++;
        sliceDiffs(bp, lot, bp.id + ' ' + bp.interior.kind).forEach((d) => bad.push('kesit ' + d));
      });
      expect(bad).toEqual([]);
      expect(INTERIOR_ERRORS).toEqual([]);
    }, 900000);
  });

  it('toplam: 16 tür × 3 varyant kapsandı, yeterli kilit ve parsel sayısı', () => {
    if (SEEDS.length < 40) return;
    expect(INTERIOR_KINDS.length).toBe(16);
    const miss = [];
    INTERIOR_KINDS.forEach((k) => { for (let v = 0; v < 3; v++) if (!combos.has(k + ':' + v)) miss.push(k + ':' + v); });
    expect(miss).toEqual([]);
    expect(stat.locks).toBeGreaterThan(300);
    expect(stat.plans).toBeGreaterThanOrEqual(Math.min(SEEDS.length * PLAN_LOTS, 2400) * 0.99);
    expect(stat.blocks).toBeGreaterThanOrEqual(Math.min(SEEDS.length * BLOCK_LOTS, 400) * 0.99);
    expect(stat.slices).toBeGreaterThanOrEqual(SEEDS.length);
    expect(stat.roofStarts).toBe(SEEDS.length * 8);
  });
});

describe('Faz 2 kapısı — tüm şehir hücre BFS (sızıntı, tuzak, çatı, metro; KESIF_GATE_NAV=k)', () => {
  SEEDS.slice(0, NAV_SEEDS).forEach((s) => {
    it('tohum ' + s + ': kapalı kat sızıntısı 0, girilen her hücreden Kapı Meydanına dönülür, çatı başlangıçları, metro ve terminaller ulaşılır', async () => {
      const { buildNav } = await import('./cityNavKit.js');
      const { ARCHETYPES } = await import('./archetypes.js');
      const rep = [];
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      const nav = buildNav(seed, undefined, { maxLevels: 16 }); // 16 seviye: çok katlı binalarda çatı/üst kat da izlenir (vars. 4 çatıyı kesiyordu)
      const seen = nav.reach(0, 64, 2);
      const back = nav.reachBack(0, 64, 2);
      let trapped = 0;
      for (let q = 0; q < seen.length; q++) if (seen[q] && !back[q]) trapped++;
      if (trapped) rep.push('tuzak ' + trapped);
      const lots = allLots(plan);
      lots.forEach((lot) => {
        const A0 = ARCHETYPES[lot.archetype];
        if (!A0.building || lot.hill || lot.archetype === 'istasyon_girisi') return;
        const bp = planBuilding(seed, lot);
        (bp.tiers || []).forEach((t) => {
          const tierRoof = 64 + 4 * t.f1 + (t.f1 === bp.floors && bp.roof ? bp.roof.lift : 0);
          for (let z = t.z0; z < t.z0 + t.d; z++) {
            for (let x = t.x0; x < t.x0 + t.w; x++) {
              const lv = nav.levels(x, z);
              for (let k = 0; k < lv.length; k++) {
                if (lv[k] < tierRoof && nav.isReached(seen, x, z, lv[k]) && rep.length < 8) rep.push('sızıntı lot ' + lot.id + ' ' + [x, lv[k], z]);
              }
            }
          }
        });
      });
      plan.roofRoutes.forEach((rr) => {
        const lot = lots.find((l) => l.id === rr.start.lot);
        const bp = planBuilding(seed, lot);
        let any = false;
        bp.tiers.forEach((t) => {
          if (t.f1 !== bp.floors) return;
          const ry = 64 + 4 * t.f1 + (bp.roof ? bp.roof.lift : 0);
          for (let z = t.z0; z < t.z0 + t.d && !any; z++) for (let x = t.x0; x < t.x0 + t.w && !any; x++) if (nav.isReached(seen, x, z, ry)) any = true;
        });
        if (!any) rep.push('çatı parkuru başlangıcı ulaşılamıyor ' + rr.id);
      });
      plan.underground.metro.stations.forEach((st) => {
        let tot = 0;
        let got = 0;
        st.boxes.forEach((b) => {
          for (let z = b.z0; z < b.z1; z++) for (let x = b.x0; x < b.x1; x++) if (nav.levels(x, z).indexOf(44) >= 0) { tot++; if (nav.isReached(seen, x, z, 44)) got++; }
        });
        if (got !== tot) rep.push('metro istasyonu ' + got + '/' + tot);
      });
      plan.terminals.forEach((t) => {
        let ok = false;
        for (let dz = -3; dz <= 3 && !ok; dz++) for (let dx = -3; dx <= 3 && !ok; dx++) if (nav.isReached(seen, Math.floor(t.x) + dx, Math.floor(t.z) + dz, t.y)) ok = true;
        if (!ok) rep.push('terminal ' + t.index + ' ulaşılamıyor');
      });
      expect(rep).toEqual([]);
    }, 900000);
  });

  it('yeniden üretim belirlenimli: aynı parselin planı önbellek temizlenince birebir aynı', () => {
    const seed = citySeed(SEEDS[0] || 0);
    const { lot, bp } = interiorLots(seed, { limit: 1 })[0];
    const a = JSON.stringify(planInterior(bp, lot));
    clearInteriorCache();
    expect(JSON.stringify(planInterior(bp, lot))).toBe(a);
  });
});

/* ------------------------------------------------------------------------------------------------
 * Kaynak denetimleri: TODO/sahte kod 0; §2 gerçek marka/oyun adı 0 (web src, public, docs; kardeş API deposu config + docs)
 * ---------------------------------------------------------------------------------------------- */
const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__snapshots__']);
const SAFE_FILES = new Set([
  'src/game/kesif/sim/city/citySafeData.js', 'src/game/kesif/sim/city/cityRealBrands.js', 'src/game/kesif/sim/city/citySafe.test.js',
]);

function listFiles(dir, exts, out) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((n) => {
    if (SKIP_DIRS.has(n)) return;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) listFiles(p, exts, out);
    else if (exts.test(n)) out.push(p);
  });
  return out;
}

const rel = (p) => relative(ROOT, p).split(sep).join('/');
// adlar parçalardan kurulur: bu dosya kendi taramasına takılmasın
const NAMES = [['Cyber', 'punk'], ['Night', ' City'], ['Ara', 'saka'], ['Mili', 'tech'], ['CD ', 'Projekt'], ['John', 'ny'], ['Silver', 'hand'], ['Dela', 'main'],
  ['Brain', 'dance'], ['NC', 'PD'], ['Kiro', 'shi'], ['After', 'life'], ['Mine', 'craft']].map((a) => a.join(''));

describe('Faz 2 kapısı — kaynak denetimleri', () => {
  it('KEŞİF kaynaklarında TODO / FIXME / "not implemented" yok (test dosyaları hariç)', () => {
    const files = [];
    ['src/game/kesif', 'src/components/game/kesif', 'src/pages/game/kesif'].forEach((d) => listFiles(join(ROOT, d), /\.(js|jsx|css)$/, files));
    const hits = [];
    files.forEach((f) => {
      if (/\.test\.jsx?$/.test(f)) return;
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/\b(TODO|FIXME)\b|not implemented|NotImplemented/.test(l)) hits.push(rel(f) + ':' + (i + 1));
      });
    });
    expect(files.length).toBeGreaterThan(300);
    expect(hits).toEqual([]);
  });

  it('§2 gerçek oyun/marka adları: web src + public + docs (+ API deposu config/docs) içinde 0 isabet', () => {
    const files = [];
    listFiles(join(ROOT, 'src'), /\.(js|jsx|css|json|md|html)$/, files);
    listFiles(join(ROOT, 'public'), /\.(js|css|json|md|html|txt|svg)$/, files);
    listFiles(join(ROOT, 'docs'), /\.(md|txt|json)$/, files);
    const api = join(ROOT, '..', 'girlsandguys-api-v10');
    listFiles(join(api, 'config'), /\.php$/, files);
    listFiles(join(api, 'docs'), /\.(md|txt)$/, files);
    const esc = (n) => n.split('').map((ch) => (/[A-Za-z0-9 ]/.test(ch) ? ch : String.fromCharCode(92) + ch)).join('');
    const re = new RegExp(NAMES.map(esc).join('|'), 'i');
    const hits = [];
    files.forEach((f) => {
      if (SAFE_FILES.has(rel(f))) return;
      const t = readFileSync(f, 'utf8');
      if (re.test(t)) hits.push(rel(f));
    });
    expect(files.length).toBeGreaterThan(500);
    expect(hits).toEqual([]);
  });
});
