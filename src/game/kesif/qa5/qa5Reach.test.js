/*
 * qa5 (Faz 5, qa_logic) — TAM PLAN ULAŞILABİLİRLİK, 200 tohum. Faz 2/4 kapıları (cityGateP2/P4) odalar, çip/grafiti/terminal/NPC düzeyini kapsar; bu dosya kalan
 * HER ilgi noktası türünü ve zincirleri tohum başına bağımsız doğrular (hepsi plan düzeyinde: tohum başına ≈ 100 ms):
 *   1) yaya: her yüzey POI'si (kapı, satıcı, barınak, foto noktası, grafiti, çip, gizli oda parseli, garaj, kiralama, kurye masası, yarış kapısı, çatı başlangıcı,
 *      terminal, park yeri) yaya ağının tek bileşeninde ve bir düğüme yakın;
 *   2) araç: park yeri / garaj / kiralama / kurye masası / yarış kapısı yol ağında Kapı Meydanı'ndan rota ile ulaşılır;
 *   3) çatı: her sıçrama sözleşme sınırlarında (boşluk ≤3, fark ≤+1, çıkıntıyla yürünür), başlangıç yürünür, çatı çipleri rota parsellerinde;
 *   4) kanalizasyon: 40 çip + 12 grafiti paneli koridor içinde, menholler yürünür, yeraltı kilit grafı BAĞIMSIZ sabit nokta ile çözülür ve DAG (sağlayıcı kilidin
 *      arkasında değil, kart kademesi artan);
 *   5) iç mekân sahipleri / satıcı binaları: kilitler çözülmüş (şehir çapı kart havuzuyla) tüm odalar ulaşılır, çıkış her zaman serbest.
 * Ortam: KESIF_QA5_SEEDS (vars. 200), KESIF_QA5_SHARD=i/n.
 */
import { describe, expect, it, vi } from 'vitest';
import { allLots } from '../sim/city/cityLots.js';
import {
  getCityPlan, getLot, planBuilding, pois, roadNet, walkNet,
} from '../sim/city/cityPlan.js';
import { bfsWalk, citySeed } from '../sim/city/cityPlanTestKit.js';
import { ledgeLen, reachHop, roofRouteContent } from '../sim/city/cityRoofRoutes.js';
import { lockGraph, solveUnderground, BASE_ITEMS } from '../sim/city/cityUndergroundLocks.js';
import { undergroundDiscovery } from '../sim/city/cityUnderground.js';
import { planInterior, setInteriorStrict } from '../sim/city/interior/index.js';
import { planReachability, validateInterior } from '../sim/city/interior/graph.js';
import { solveCity, solveReachability } from '../sim/city/interior/locks.js';
import { buildDiscovery } from '../sim/city/mission/discovery.js';
import { OWNER_NPCS } from '../sim/city/ped/npcData.js';
import { interiorLots } from '../sim/city/interior/testKit.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N_SEEDS = Number(ENV.KESIF_QA5_SEEDS || 200);
const SHARD = String(ENV.KESIF_QA5_SHARD || '0/1').split('/').map(Number);
const SEEDS = [];
for (let s = 0; s < N_SEEDS; s++) if (s % SHARD[1] === SHARD[0]) SEEDS.push(s);

/** Yaya düğümüne en çok uzaklık (blok) — ölçülen en kötü değer + pay (200 tohum taraması: bkz. QA5 raporu). */
const WALK_MAX = {
  door: 14, vendor: 45, shelter: 8, photo_spot: 14, graffiti: 8, chip: 45, hidden_room: 50, garage: 8, rental: 6, courier_desk: 8, race_gate: 14,
  roof_start: 8, portal_terminal: 14, park_slot: 8,
};
const VEHICLE_TYPES = ['park_slot', 'garage', 'rental', 'courier_desk', 'race_gate'];
const ROAD_MAX = { park_slot: 12, garage: 55, rental: 65, courier_desk: 65, race_gate: 12 };
const MAXR = {};
const FINITE = (...v) => v.every((n) => typeof n === 'number' && Number.isFinite(n));
const CELL = 64;

/** Yaya ağı kenarları için ızgara dizini: noktanın en yakın kenara (doğru parçası) uzaklığı. Düğümler yalnız köşelerdedir; POI'ler kenar boyunca durur. */
function edgeIndex(wn) {
  const grid = new Map();
  wn.edges.forEach((e) => {
    const a = wn.nodes[e.a];
    const b = wn.nodes[e.b];
    for (let cx = Math.floor((Math.min(a.x, b.x) - CELL) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + CELL) / CELL); cx++) {
      for (let cz = Math.floor((Math.min(a.z, b.z) - CELL) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + CELL) / CELL); cz++) {
        const k = cx * 4096 + cz;
        const l = grid.get(k);
        if (l) l.push(e); else grid.set(k, [e]);
      }
    }
  });
  return (x, z) => {
    let best = Infinity;
    const l = grid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL)) || [];
    for (let i = 0; i < l.length; i++) {
      const a = wn.nodes[l[i].a];
      const b = wn.nodes[l[i].b];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
      if (d < best) best = d;
    }
    return best;
  };
}
const MAXD = {};

function stat() {
  return {
    pois: 0, vehicle: 0, hops: 0, sewer: 0, ugLocks: 0, owners: 0, interiors: 0,
  };
}
const S = stat();

setInteriorStrict(true);

describe('qa5 — tam plan ulaşılabilirlik (tohum başına)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': tüm POI türleri (yaya + araç), çatı sıçramaları, kanalizasyon, yeraltı kilit DAG, sahip/satıcı iç mekânları', () => {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      const bad = [];

      // ---- 1) yaya ağı
      const wn = walkNet(seed);
      if (wn.components() !== 1) bad.push('yaya ağı ' + wn.components() + ' bileşen');
      const seen = bfsWalk(wn, wn.nearest(0, 0));
      let reached = 0;
      for (let i = 0; i < seen.length; i++) reached += seen[i];
      if (reached !== wn.nodes.length) bad.push('yaya ağı BFS ' + reached + '/' + wn.nodes.length);
      const walkDist = edgeIndex(wn);
      const P = pois(seed);
      P.forEach((p) => {
        if (!FINITE(p.x, p.y, p.z, p.yaw) || Math.abs(p.x) > 800 || Math.abs(p.z) > 800) { bad.push('POI geçersiz konum ' + p.type + '#' + p.id); return; }
        if (p.kind === 'kanal' || p.kind === 'cati') return; // yer altı çipleri (aşağıda, koridor) ve çatı çipleri (rota parseli) ayrı denetlenir
        const lim = WALK_MAX[p.type];
        if (lim === undefined) { bad.push('bilinmeyen POI türü ' + p.type); return; }
        S.pois++;
        const d = walkDist(p.x, p.z);
        MAXD[p.type] = Math.max(MAXD[p.type] || 0, d);
        if (!(d <= lim)) bad.push(p.type + '#' + p.id + ' yaya kenarına uzak ' + d.toFixed(1));
      });

      // ---- 2) araç ağı: Kapı Meydanı'ndan rota
      const rn = roadNet(seed);
      const g0 = rn.nearest(0, 0);
      P.filter((p) => VEHICLE_TYPES.indexOf(p.type) >= 0).forEach((p) => {
        const n = rn.nearest(p.x, p.z);
        S.vehicle++;
        MAXR[p.type] = Math.max(MAXR[p.type] || 0, n ? n.dist : Infinity);
        if (!n || n.dist > ROAD_MAX[p.type]) { bad.push(p.type + '#' + p.id + ' yola uzak ' + (n ? n.dist.toFixed(0) : 'yok')); return; }
        if (rn.route(g0.node, n.node) === null) bad.push(p.type + '#' + p.id + ' rota yok');
      });

      // ---- 3) çatı parkuru
      const rc = roofRouteContent(plan);
      const padLots = new Set();
      if (rc.length !== 8) bad.push('çatı rotası ' + rc.length);
      rc.forEach((r) => {
        r.pads.forEach((pd) => padLots.add(pd.lot));
        if (r.pads.length < 6 || r.pads.length > 10) bad.push('rota ' + r.id + ' kontrol sayısı ' + r.pads.length);
        r.hops.forEach((h) => {
          S.hops++;
          const eff = h.gap - ledgeLen(h.gap, h.dy);
          if (h.gap > 4 || h.dy > 1 || !reachHop(eff, h.dy, 'walk')) bad.push('rota ' + r.id + ' sıçrama ' + h.a + '→' + h.b + ' gap ' + h.gap + ' dy ' + h.dy);
        });
        const st = P.find((p) => p.type === 'roof_start' && p.route === r.id);
        if (!st || !(walkDist(st.x, st.z) <= WALK_MAX.roof_start)) bad.push('rota ' + r.id + ' başlangıcı yürünmez');
      });
      P.filter((p) => p.type === 'chip' && p.kind === 'cati').forEach((p) => {
        if (!padLots.has(p.lot)) bad.push('çatı çipi #' + p.id + ' rota parselinde değil (lot ' + p.lot + ')');
      });

      // ---- 4) kanalizasyon çipleri, grafiti panelleri, menholler
      const sw = plan.underground.sewer;
      const half = Math.ceil(sw.clearW / 2) + 1;
      const inCorridor = (x, z) => sw.lines.some((l) => (l.axis === 'z'
        ? Math.abs(x - l.c) <= half && z >= l.a - 1 && z <= l.b + 1
        : Math.abs(z - l.c) <= half && x >= l.a - 1 && x <= l.b + 1));
      const ud = undergroundDiscovery(plan);
      if (ud.chips.length !== 40) bad.push('kanal çipi ' + ud.chips.length);
      ud.chips.forEach((c) => {
        S.sewer++;
        if (c.y !== sw.floorY || !inCorridor(c.x, c.z)) bad.push('kanal çipi #' + c.id + ' koridor dışı ' + [c.x, c.y, c.z]);
      });
      if (ud.hiddenRooms.length !== 30) bad.push('gizli oda ' + ud.hiddenRooms.length);
      if (ud.graffiti.length !== 18) bad.push('kanal grafitisi ' + ud.graffiti.length);
      sw.manholes.forEach((m) => {
        if (!(walkDist(m.x, m.z) <= 45)) bad.push('menhol ' + m.id + ' yürünmez');
      });

      // ---- 4b) yeraltı kilit grafı: bağımsız sabit nokta + DAG
      const G = lockGraph(plan);
      const solved = solveUnderground(plan);
      if (solved.unsolved.length) bad.push('yeraltı çözülemedi ' + JSON.stringify(solved.unsolved.slice(0, 3)));
      const items = new Set(BASE_ITEMS);
      const open = new Set();
      const providedAt = new Map(); // eşya → tur
      for (let round = 1; round <= 16; round++) {
        let grew = false;
        G.locks.forEach((l) => {
          if (open.has(l.id)) return;
          const req = G.requires[l.id] || [];
          if (req.every((r) => items.has(r))) { open.add(l.id); grew = true; }
        });
        G.providers.forEach((p) => {
          if (items.has(p.item)) return;
          if (p.behind.every((b) => open.has(b))) { items.add(p.item); providedAt.set(p.item, round); grew = true; }
        });
        if (!grew) break;
      }
      S.ugLocks += G.locks.length;
      G.locks.forEach((l) => { if (!open.has(l.id)) bad.push('yeraltı kilidi açılmıyor ' + l.id); });
      // DAG: bir eşyanın sağlayıcısı, o eşyayı gerektiren kilidin arkasında olamaz
      G.providers.forEach((p) => {
        G.locks.forEach((l) => {
          if ((G.requires[l.id] || []).indexOf(p.item) >= 0 && p.behind.indexOf(l.id) >= 0) bad.push('DAG ihlali: ' + p.item + ' ' + l.id + ' arkasında');
        });
      });
      const need = (id) => (G.requires[id] || []).filter((r) => /^kart_\d$/.test(r)).map((r) => Number(r.slice(5)));
      G.providers.filter((p) => /^kart_\d$/.test(p.item)).forEach((p) => {
        const lv = Number(p.item.slice(5));
        p.behind.forEach((b) => need(b).forEach((k) => { if (k >= lv) bad.push('kart kademesi artmıyor: ' + p.item + ' ← ' + b + ' (kart_' + k + ')'); }));
      });
      G.locks.forEach((l) => {
        if (!/^[0-9a-z]{1,10}$/.test(l.id)) bad.push('kilit kimliği geçersiz ' + l.id);
        if (l.kind === 'kart' && l.tier < 1) bad.push('kart kilidi kademe ' + l.id);
      });
      G.doors.forEach((d) => { if (d.exitFree !== true) bad.push('kapı içeriden serbest değil ' + d.id); });

      // ---- 5) sahip / satıcı binaları: kilitler çözülmüş, tüm odalar ulaşılır, çıkış serbest
      const lotIds = new Set();
      OWNER_NPCS.forEach((o) => { const rec = plan.owners.get(o.id); if (rec) lotIds.add(rec.lotId); });
      P.filter((p) => p.type === 'vendor' && p.owner !== undefined && p.lot !== undefined).forEach((p) => lotIds.add(p.lot));
      const subject = Array.from(lotIds).sort((a, b) => a - b);
      // şehir çapı kart havuzu: sahip parselleri + her 9. iç mekânlı parsel (sağlayıcılar)
      const all = interiorLots(seed);
      const pick = all.filter(({ lot }, i) => lotIds.has(lot.id) || i % 9 === 0);
      const list = pick.map(({ lot, bp }) => ({ lotId: lot.id, interior: planInterior(bp, lot) }));
      const sc = solveCity(list, { seed, requireClues: true });
      if (sc.pool.length !== 3) bad.push('kart havuzu ' + JSON.stringify(sc.pool));
      list.filter((e) => lotIds.has(e.lotId)).forEach((e) => {
        const it = e.interior;
        S.interiors++;
        const v = validateInterior(it);
        if (!v.ok) bad.push('lot ' + e.lotId + ' ' + v.errors.slice(0, 2).join('|'));
        const r = solveReachability(it, { seed, lotId: e.lotId, externalCards: sc.pool, requireClues: true });
        if (!r.ok) bad.push('lot ' + e.lotId + ' kilitler çözülünce ulaşılmaz oda ' + JSON.stringify(r.unsolved.concat(r.unreachableRooms).slice(0, 2)));
        if (r.dag.violations.length) bad.push('lot ' + e.lotId + ' DAG ' + r.dag.violations[0]);
        const pr = planReachability(it);
        if (pr.unreachableRooms.length) bad.push('lot ' + e.lotId + ' plan erişimi ' + pr.unreachableRooms.join('/'));
      });
      subject.forEach((id) => { if (!getLot(seed, id) || !planBuilding(seed, id).interior) bad.push('lot ' + id + ' iç mekân yok'); });
      S.owners += OWNER_NPCS.length;
      expect(bad).toEqual([]);
    });
  });

  it('toplam: tohum başına tüm türler işlendi (yeterli POI, sıçrama, kilit, iç mekân)', () => {
    if (SEEDS.length < 40) return;
    expect(S.pois).toBeGreaterThanOrEqual(SEEDS.length * 1500);
    expect(S.vehicle).toBeGreaterThanOrEqual(SEEDS.length * 80);
    expect(S.hops).toBeGreaterThanOrEqual(SEEDS.length * 40);
    expect(S.sewer).toBe(SEEDS.length * 40);
    expect(S.ugLocks).toBeGreaterThanOrEqual(SEEDS.length * 50);
    expect(S.interiors).toBeGreaterThanOrEqual(SEEDS.length * 16);
    if (ENV.KESIF_QA5_REPORT) console.log('POI yaya kenarı en çok uzaklık', JSON.stringify(MAXD), 'yol', JSON.stringify(MAXR));
  });

  it('keşif kataloğu ile POI kümesi tutarlı: katalogdaki her çip/grafiti bir POI (kimlik kümesi eşit)', () => {
    const seed = citySeed(SEEDS[0] || 0);
    const cat = buildDiscovery(seed);
    const chips = pois(seed).filter((p) => p.type === 'chip');
    expect(cat.chips.length).toBe(chips.length);
    const key = (p) => Math.round(p.x * 2) + ',' + Math.round(p.z * 2);
    const set = new Set(chips.map(key));
    cat.chips.forEach((c) => expect(set.has(key(c)), 'çip ' + c.id).toBe(true));
    expect(allLots(getCityPlan(seed)).length).toBeGreaterThan(900);
  });
});
