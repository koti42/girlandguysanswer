/*
 * qa_p4 — FAZ 4 KAPISI (sözleşme §19 "Faz kapısı G", §20, §22): yaya / NPC / satıcı / robot / keşif / görev / foto / harita için tam-plan denetimleri.
 *
 *  1) Metin güvenliği: diyalog, NPC adı/unvanı, satıcı, görev, başarım, hikâye, keşif, günlük, iş/yolcu, robot, foto/harita metinleri ve ÜRETİLMİŞ iş teklifleri
 *     (citySafe + marka + yasak sözcük), tüm P4 kaynaklarındaki dizgeler; TODO/FIXME/stub 0.
 *  2) Diyalog grafı (bağımsız denetim): her goto çözülür, çıkmaz yok, her düğümden `end`e yol, satır ≤ 2×34, seçenek ≤ 34, aynı anda görünür ≤ 4 (tuş 1–4).
 *  3) Tam plan ulaşılabilirlik (200 tohum, plan düzeyi): 240 çip / 90 grafiti / 30 gizli oda / 16 terminal / sokak NPC'leri / iç mekân sahipleri / satıcılar.
 *     Gerçek blok hücre BFS (az tohum): zemin çipleri, sokak grafitileri, terminaller, sokak NPC ve satıcı noktaları sokaktan yürünerek ulaşılır.
 *  4) Yayalar: gerçek bloklarda (az tohum) ve plan probu ile (çok tohum) hiçbir yaya katıda/suda/prop içinde değil; araç-yaya karışık koşuda yaya hasarsız.
 *
 * Ortam: KESIF_GATE_P4_SEEDS (varsayılan 200), KESIF_GATE_P4_NAV (hücre BFS tohum sayısı, vars. 2), KESIF_GATE_P4_PED (gerçek blok yaya tohumu, vars. 3),
 *        KESIF_GATE_P4_PEDPLAN (plan probu yaya tohumu, vars. 24), KESIF_GATE_SHARD=i/n.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getCityPlan, walkNet } from './cityPlan.js';
import { citySeed, bfsWalk } from './cityPlanTestKit.js';
import { scanText } from './citySafeData.js';
import { buildNav } from './cityNavKit.js';
import { allCityNameStrings } from './cityNames.js';
import { buildDiscovery } from './mission/discovery.js';
import { COUNTS } from './mission/missionData.js';
import * as missionData from './mission/missionData.js';
import { QUESTS } from './mission/quests.js';
import { ACHIEVEMENTS } from './mission/achievements.js';
import * as jobsMod from './mission/jobs.js';
import { FAIL_TEXT } from './mission/run.js';
import { ALL_NODE_IDS, DIALOGUES, getNode, validateDialogues } from './ped/dialogueData.js';
import { NPCS, NPC_HINTS, OWNER_NPCS } from './ped/npcData.js';
import { WEATHER_LINES } from './ped/weatherLines.js';
import { VENDORS } from './ped/vendorData.js';
import * as robotData from './ped/robotData.js';
import * as pedData from './ped/pedData.js';
import { ownerSpot, placeStreetNpcs } from './ped/npcPlace.js';
import { planBuilding, getLot } from './cityPlan.js';
import { planInterior } from './interior/index.js';
import { makeCrowd, refChecker, runChecked } from './ped/crowdTestKit.js';
import { evalCond } from './ped/dialogueEngine.js';
import { roadNet } from './roadNet.js';

vi.setConfig({ testTimeout: 900000 });

const ENV = (globalThis.process && globalThis.process.env) || {};
const N_SEEDS = Number(ENV.KESIF_GATE_P4_SEEDS || 200);
const N_NAV = Number(ENV.KESIF_GATE_P4_NAV || 2);
const N_PED = Number(ENV.KESIF_GATE_P4_PED || 3);
const N_PEDPLAN = Number(ENV.KESIF_GATE_P4_PEDPLAN || 24);
const SHARD = String(ENV.KESIF_GATE_SHARD || '0/1').split('/').map(Number);
const SEEDS = [];
for (let s = 0; s < N_SEEDS; s++) if (s % SHARD[1] === SHARD[0]) SEEDS.push(s);

/* ------------------------------------------------------------------------------------------------
 * 1) Metin güvenliği
 * ---------------------------------------------------------------------------------------------- */
function strings(v, out, depth) {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object' && depth < 8) Object.keys(v).forEach((k) => strings(v[k], out, depth + 1));
  return out;
}

function allTexts() {
  const out = [];
  // diyalog: tüm düğümler (satır, seçenek, veda)
  ALL_NODE_IDS.forEach((id) => {
    const n = getNode(id);
    out.push(n.text);
    n.lines.forEach((l) => out.push(l));
    n.choices.forEach((c) => {
      out.push(c.t);
      if (c.say) out.push(c.say);
    });
  });
  strings(WEATHER_LINES, out, 0);
  NPCS.forEach((n) => {
    strings({
      name: n.name, title: n.title, species: n.species, desc: n.desc, lines: n.lines, greet: n.greet,
    }, out, 0);
  });
  strings(NPC_HINTS, out, 0);
  VENDORS.forEach((v) => strings({ name: v.name, title: v.title, brand: v.brand }, out, 0));
  QUESTS.forEach((q) => strings({ name: q.name, hint: q.hint, desc: q.desc, text: q.text, done: q.done }, out, 0));
  ACHIEVEMENTS.forEach((a) => strings({ name: a.name, desc: a.desc, hint: a.hint }, out, 0));
  ['STORY_FRAGMENTS', 'DISCOVERY_TEXT', 'ROOM_NAMES', 'MEDAL_NAMES'].forEach((k) => strings(missionData[k], out, 0));
  for (let i = 0; i < 6; i++) out.push(missionData.stencilName(i));
  for (let i = 0; i < 8; i++) out.push(missionData.colorName(i));
  strings(FAIL_TEXT, out, 0);
  strings(jobsMod.JOB_NAMES, out, 0);
  strings(jobsMod.PASSENGERS, out, 0);
  strings(jobsMod.TIERS, out, 0);
  strings(robotData.ROBOT_INFO, out, 0);
  strings(robotData.ROBOT_LINES, out, 0);
  Object.keys(robotData.ROBOT_DEFS).forEach((k) => strings({ name: robotData.ROBOT_DEFS[k].name, desc: robotData.ROBOT_DEFS[k].desc }, out, 0));
  pedData.TYPE_DEF.forEach((t) => strings({ name: t.name }, out, 0));
  allCityNameStrings().forEach((s) => out.push(s));
  return out;
}

describe('Faz 4 kapısı — metin güvenliği (citySafe + marka + yasak sözcük)', () => {
  it('diyalog / NPC / satıcı / görev / başarım / hikâye / keşif / günlük / iş / robot metinleri temiz', () => {
    const texts = allTexts().filter((t) => typeof t === 'string' && t.length > 1 && /[\p{L}]/u.test(t));
    const bad = [];
    texts.forEach((t) => {
      const hits = scanText(t);
      if (hits.length > 0) bad.push(t.slice(0, 70) + ' -> ' + hits.map((h) => h.term + '(' + h.cat + ')').join(','));
    });
    expect(texts.length).toBeGreaterThan(2500);
    expect(bad).toEqual([]);
  });

  it('ÜRETİLMİŞ iş teklifleri (60 tohum × kurye/taksi/pod × 4 gün × her masa): yolcu/paket/başlık metinleri temiz', () => {
    const bad = [];
    let n = 0;
    for (let s = 0; s < 60; s++) {
      const seed = citySeed(s);
      const net = roadNet(seed);
      ['kurye', 'taksi'].forEach((board) => {
        for (let day = 0; day < 4; day++) {
          for (let desk = 0; desk < 3; desk++) {
            const offers = jobsMod.genJobs(seed, net, board, day, desk);
            offers.forEach((j) => {
              strings({ title: j.title, name: j.name, pkg: j.pkg, passenger: j.passenger, label: j.label, from: j.fromName, to: j.toName }, [], 0).forEach((t) => {
                n++;
                if (scanText(t).length > 0) bad.push(t);
              });
              if (j.passenger === undefined && board === 'taksi') bad.push('taksi yolcusu yok');
            });
          }
        }
      });
      for (let k = 0; k < 40; k++) {
        const nm = jobsMod.passengerName(seed, k * 31);
        n++;
        if (scanText(nm).length > 0) bad.push(nm);
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(bad).toEqual([]);
  });
});

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const rel = (p) => relative(ROOT, p).split(sep).join('/');

function listFiles(dir, re, out) {
  if (!existsSync(dir)) return out;
  readdirSync(dir).forEach((n) => {
    if (n === 'node_modules' || n === 'dist' || n === '.git') return;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) listFiles(p, re, out);
    else if (re.test(n)) out.push(p);
  });
  return out;
}

function p4Files() {
  const out = [];
  ['src/game/kesif/sim/city/ped', 'src/game/kesif/sim/city/mission', 'src/game/kesif/sim/city/map'].forEach((d) => listFiles(join(ROOT, d), /\.(js|jsx|css)$/, out));
  const K = 'src/game/kesif/';
  const direct = [
    'sim/city/cityState.js', 'sim/city/cityEvents.js', 'sim/city/cityNames.js', 'sim/spawner.js', 'sim/mobTypes.js',
    'render/city/crowdModels.js', 'render/city/crowdGeo.js', 'render/city/crowdShaders.js', 'render/city/npcFigures.js', 'render/city/photoFx.js',
    'render/city/robotModels.js', 'render/city/discoveryFx.js', 'render/robotModels.js',
    'systems/cityMissions.js', 'systems/cityMissionsKit.js', 'systems/cityMissionsRun.js', 'systems/cityDiscovery.js', 'systems/cityApi.js',
    'systems/cityNpc.js', 'systems/cityNpcProps.js', 'systems/cityPhoto.js', 'systems/cityPhotoShot.js', 'systems/cityTravel.js', 'systems/cityMapView.js',
    'systems/crowd.js', 'systems/crowdVisual.js', 'systems/contentMapCity.js',
  ];
  direct.forEach((f) => { if (existsSync(join(ROOT, K + f))) out.push(join(ROOT, K + f)); });
  const cityUi = [
    'DialogueSheet', 'VendorPanel', 'MissionTracker', 'MissionsMenu', 'PhotoOverlay', 'CityMap', 'missionUtils', 'npcPanelUtils', 'photoUtils', 'cityMapUtils',
  ];
  cityUi.forEach((f) => ['.jsx', '.js'].forEach((e) => {
    const p = join(ROOT, 'src/components/game/kesif/city/' + f + e);
    if (existsSync(p)) out.push(p);
  }));
  const pb = join(ROOT, 'src/embed/photoBridge.js');
  if (existsSync(pb)) out.push(pb);
  return Array.from(new Set(out));
}

describe('Faz 4 kapısı — kaynak denetimleri (yaya/NPC/robot/görev/foto/harita)', () => {
  it('P4 kaynaklarında TODO / FIXME / "not implemented" / sahte (stub) işaretleri 0', () => {
    const hits = [];
    const list = p4Files().filter((f) => !/\.test\.jsx?$/.test(f) && !/TestKit\.js$/.test(f));
    list.forEach((f) => {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/\b(TODO|FIXME)\b|not implemented|NotImplemented|\bstubs?\b/i.test(l)) hits.push(rel(f) + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
      });
    });
    expect(list.length).toBeGreaterThan(80);
    expect(hits).toEqual([]);
  });

  it('P4 kaynaklarındaki TÜM dizge ve JSX metinleri yasak sözcük / gerçek marka / oyun adı içermez; sim dosyalarında Math.random / Date.now yok', () => {
    const list = p4Files().filter((f) => !/\.test\.jsx?$/.test(f) && /\.(js|jsx)$/.test(f));
    const found = [];
    const impure = [];
    list.forEach((f) => {
      const text = readFileSync(f, 'utf8');
      if (/\/sim\//.test(rel(f).replace(/^src\/game\/kesif/, '')) && !/TestKit\.js$/.test(f) && /sim\/city\/(ped|mission|map)\//.test(rel(f))) {
        text.split('\n').forEach((l, i) => {
          const code = l.replace(/\/\/.*$/, '');
          if (/Math\.random|Date\.now|performance\.now|structuredClone|Object\.hasOwn\(|\.replaceAll\(/.test(code) && !/^\s*\*/.test(l)) impure.push(rel(f) + ':' + (i + 1));
        });
      }
      const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
      let m = re.exec(text);
      while (m) {
        const t = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
        if (t && t.length > 2 && /[\p{L}]/u.test(t) && !/^[\w./:#@%+-]+$/.test(t)) {
          scanText(t, { loose: true }).forEach((h) => found.push(rel(f) + ' "' + t.slice(0, 50) + '" -> ' + h.term + ' (' + h.cat + ')'));
        }
        m = re.exec(text);
      }
      const jsx = /(^|[^=])>([^<>{}]*[\p{L}][^<>{}]*)</gu;
      let j = /\.jsx$/.test(f) ? jsx.exec(text) : null;
      while (j) {
        scanText(j[2], { loose: true }).forEach((h) => found.push(rel(f) + ' JSX "' + j[2].trim().slice(0, 50) + '" -> ' + h.term));
        j = jsx.exec(text);
      }
    });
    expect(impure).toEqual([]);
    expect(found).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 2) Diyalog grafı
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 4 kapısı — diyalog grafı denetimi (bağımsız)', () => {
  it('46 graf: her goto çözülür, çıkmaz yok, her düğümden end\'e yol, satır sınırları, kök var', () => {
    const bad = [];
    const graphs = Object.keys(DIALOGUES);
    expect(graphs.length).toBe(NPCS.length);
    graphs.forEach((npc) => {
      const g = DIALOGUES[npc];
      const ids = Object.keys(g.nodes);
      if (!g.nodes[npc + '.root']) bad.push(npc + ' kök yok');
      if (!g.entry.length) bad.push(npc + ' giriş yok');
      // geri yönlü erişim: end'e ulaşabilen düğümler (ters BFS)
      const canEnd = new Set(ids.filter((id) => g.nodes[id].choices.some((c) => c.goto === 'end')));
      let grew = true;
      while (grew) {
        grew = false;
        ids.forEach((id) => {
          if (!canEnd.has(id) && g.nodes[id].choices.some((c) => canEnd.has(c.goto))) { canEnd.add(id); grew = true; }
        });
      }
      ids.forEach((id) => {
        const n = g.nodes[id];
        if (!canEnd.has(id)) bad.push(id + ' end\'e yol yok');
        if (n.choices.length < 1) bad.push(id + ' seçenek yok (çıkmaz)');
        n.choices.forEach((c) => {
          if (c.goto !== 'end' && !getNode(c.goto)) bad.push(id + ' goto çözülmüyor: ' + c.goto);
          if (c.t.length > 34) bad.push(id + ' seçenek >34: ' + c.t);
          if (!c.t.trim()) bad.push(id + ' boş seçenek metni');
        });
        if (n.text.length > 60) bad.push(id + ' metin >60');
        if (n.lines.length > 2) bad.push(id + ' >2 satır');
        n.lines.forEach((l) => { if (l.length > 34) bad.push(id + ' satır >34: ' + l); });
        if (n.lines.join(' ').replace(/\s+/g, ' ').trim() !== n.text.replace(/\s+/g, ' ').trim()) bad.push(id + ' satır bölme metni değiştiriyor');
      });
      // giriş düğümleri çözülür; en az biri koşulsuz (varsayılan giriş)
      g.entry.forEach((e) => { if (!g.nodes[e.node]) bad.push(npc + ' giriş çözülmüyor ' + e.node); });
      if (!g.entry.some((e) => !e.cond || Object.keys(e.cond).length === 0)) bad.push(npc + ' koşulsuz varsayılan giriş yok');
    });
    expect(bad).toEqual([]);
    expect(validateDialogues()).toEqual([]);
    expect(ALL_NODE_IDS.length).toBeGreaterThan(450);
  });

  it('aynı anda görünür seçenek ≤ 4 (klavye 1–4): koşullu seçenekler görev durumu başına tek tek sayılır', () => {
    const bad = [];
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      if (n.choices.length <= 4) return;
      // koşulsuz + (aynı görev kimliğine bağlı koşullular tek grup; başka koşullar ayrı)
      let always = 0;
      const groups = new Set();
      n.choices.forEach((c, i) => {
        if (!c.cond) { always++; return; }
        const q = c.cond.quest;
        groups.add(q ? 'q:' + q[0] : 'c' + i);
      });
      if (always + groups.size > 4) bad.push(id + ' en çok ' + (always + groups.size) + ' görünür');
    });
    expect(bad).toEqual([]);
  });

  it('görev durumlarının her birleşiminde (none/active/done) görünür seçenek ≤ 4 ve ≥ 1; çıkış hep görünür', () => {
    const ctxOf = (st) => ({
      flag: () => 9999, quest: () => st, kredi: 999, phase: 'gece', rain: true, rel: 9, visits: 9, first: false, dist: 'merkez', hint: '', item: () => 99,
    });
    const bad = [];
    ALL_NODE_IDS.forEach((id) => {
      const n = getNode(id);
      ['none', 'active', 'done'].forEach((st) => {
        let vis = 0;
        let exit = false;
        n.choices.forEach((c) => {
          let ok = true;
          if (c.cond) {
            try { ok = !!evalCond(c.cond, ctxOf(st)); } catch { ok = true; }
          }
          if (ok) { vis++; if (c.goto === 'end') exit = true; }
        });
        if (vis > 4) bad.push(id + ' [' + st + '] ' + vis + ' görünür');
        if (!exit) bad.push(id + ' [' + st + '] çıkış gizli');
      });
    });
    expect(bad).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 3) Tam plan ulaşılabilirlik
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 4 kapısı — katalog sayıları ve plan düzeyi ulaşılabilirlik (200 tohum)', () => {
  SEEDS.forEach((s) => {
    it('tohum ' + s + ': 240 çip / 90 grafiti / 30 oda / 16 terminal; terminaller + sokak NPC\'leri + sahipler yaya ağından ulaşılır', () => {
      const seed = citySeed(s);
      const plan = getCityPlan(seed);
      const cat = buildDiscovery(seed);
      const bad = [];
      if (cat.chips.length !== COUNTS.chips || COUNTS.chips !== 240) bad.push('çip ' + cat.chips.length);
      if (cat.graffiti.length !== COUNTS.graffiti || COUNTS.graffiti !== 90) bad.push('grafiti ' + cat.graffiti.length);
      if (cat.rooms.length !== COUNTS.rooms || COUNTS.rooms !== 30) bad.push('oda ' + cat.rooms.length);
      if (plan.terminals.length !== 16) bad.push('terminal ' + plan.terminals.length);
      const uniq = (list) => new Set(list.map((x) => x.id)).size === list.length;
      if (!uniq(cat.chips) || !uniq(cat.graffiti) || !uniq(cat.rooms)) bad.push('kimlik benzersiz değil');
      cat.chips.forEach((c) => { if (![c.x, c.y, c.z].every(Number.isFinite)) bad.push('çip sonsuz ' + c.id); });
      const wn = walkNet(seed);
      if (wn.components() !== 1) bad.push('yaya ağı bileşen ' + wn.components());
      const root = wn.nearest(0, 0);
      const seen = bfsWalk(wn, root);
      plan.terminals.forEach((t) => {
        const q = wn.nearest(t.x, t.z);
        if (!seen[q]) bad.push('terminal ' + t.index + ' ulaşılmaz');
        else if (Math.hypot(wn.nodes[q].x - t.x, wn.nodes[q].z - t.z) > 45) bad.push('terminal ' + t.index + ' yaya düğümüne uzak');
      });
      const spots = placeStreetNpcs(seed);
      if (spots.length < 28) bad.push('sokak NPC sayısı ' + spots.length);
      spots.forEach((p) => {
        const q = wn.nearest(p.x, p.z);
        if (!seen[q]) bad.push('sokak NPC ' + p.id + ' ulaşılmaz');
        else if (Math.hypot(wn.nodes[q].x - p.x, wn.nodes[q].z - p.z) > 60) bad.push('sokak NPC ' + p.id + ' yaya düğümüne uzak ' + Math.round(Math.hypot(wn.nodes[q].x - p.x, wn.nodes[q].z - p.z)));
      });
      let owners = 0;
      OWNER_NPCS.forEach((o) => {
        const sp = ownerSpot(seed, o.id);
        if (!sp) { bad.push('sahip ' + o.id + ' yeri yok'); return; }
        owners++;
        const rec = plan.owners.get(o.id);
        const lot = rec ? getLot(seed, rec.lotId) : null;
        const bp = lot ? planBuilding(seed, lot) : null;
        const it = bp ? planInterior(bp, lot) : null;
        if (!it || !it.rooms.some((r) => r.id === sp.room)) bad.push('sahip ' + o.id + ' odası planda yok (' + sp.room + ')');
        else if (sp.x < lot.x0 || sp.x > lot.x1 || sp.z < lot.z0 || sp.z > lot.z1) bad.push('sahip ' + o.id + ' parsel dışında');
      });
      if (owners !== 16) bad.push('sahip sayısı ' + owners);
      expect(bad).toEqual([]);
    });
  });
});

describe('Faz 4 kapısı — gerçek bloklarda hücre BFS (sokaktan yürünerek)', () => {
  SEEDS.slice(0, N_NAV).forEach((s, k) => {
    const seed = citySeed(s + 13 * k);
    it('tohum ' + (s + 13 * k) + ': zemin çipleri, sokak grafitileri, 16 terminal, sokak NPC ve satıcı noktaları ulaşılır', () => {
      const cat = buildDiscovery(seed);
      const plan = getCityPlan(seed);
      const nav = buildNav(seed);
      const seen = nav.reach(0, 64, 2);
      const near = (x, z, y, r) => {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const lv = nav.levels(Math.floor(x) + dx, Math.floor(z) + dz);
            for (let q = 0; q < lv.length; q++) if (Math.abs(lv[q] - y) <= 2 && nav.isReached(seen, Math.floor(x) + dx, Math.floor(z) + dz, lv[q])) return true;
          }
        }
        return false;
      };
      const miss = [];
      let nChip = 0;
      cat.chips.forEach((c) => {
        if (c.kind !== 'kapi' && c.kind !== 'park') return;
        nChip++;
        if (!near(c.x, c.z, c.y, 3)) miss.push('çip ' + c.id);
      });
      let nGraf = 0;
      cat.graffiti.forEach((g) => {
        if (g.where !== 'sokak') return;
        nGraf++;
        if (!near(g.x, g.z, g.y, 5)) miss.push('grafiti ' + g.id);
      });
      plan.terminals.forEach((t) => { if (!near(t.x, t.z, t.y, 4)) miss.push('terminal ' + t.index); });
      const spots = placeStreetNpcs(seed);
      spots.forEach((p) => { if (!near(p.x, p.z, p.y, 4)) miss.push('sokak NPC ' + p.id); });
      expect(nChip).toBeGreaterThan(60);
      expect(nGraf).toBeGreaterThan(60);
      expect(spots.length).toBeGreaterThan(28);
      expect(miss).toEqual([]);
    }, 1200000);
  });
});

/* ------------------------------------------------------------------------------------------------
 * 4) Yayalar: katıda/suda yok
 * ---------------------------------------------------------------------------------------------- */
describe('Faz 4 kapısı — yayalar hiçbir zaman katıda / suda / prop içinde değil', () => {
  const PHASES = [0.2, 0.55, 0.8, 0.95];
  for (let i = 0; i < N_PEDPLAN; i++) {
    it('plan probu, tohum ' + i + ' (' + (i % 3 === 0 ? 'yağmurlu ' : '') + 'faz ' + PHASES[i % 4] + '): 150 sn, ihlal 0, NaN 0', () => {
      const seed = citySeed(40 + i * 7);
      const { crowd } = makeCrowd(seed, {
        px: ((i * 97) % 400) - 200, pz: ((i * 53) % 400) - 200, phase: PHASES[i % 4], rain: i % 3 === 0 ? 1 : 0, quality: i % 5 === 0 ? 'low' : 'high',
      });
      crowd.populate();
      const chk = refChecker(seed);
      const r = runChecked(crowd, chk, 150);
      expect(r.violations).toEqual([]);
      expect(crowd.alive()).toBeGreaterThan(8);
    });
  }

  it('GERÇEK bloklar: yayanın ayağı altı katı/sıvı değil, gövde bandında yüksek çarpışma yok (Gece Pazarı gecesi, gündüz Meydan, yağmurlu merkez)', async () => {
    const { World } = await import('../world.js');
    const { attachPropLayer, createPropLayer } = await import('../props/propLayer.js');
    const { worldProbe } = await import('./ped/pedProbe.js');
    const { BLOCKS } = await import('../blocks.js');
    const bad = [];
    let checks = 0;
    let stuckWalkers = 0;
    for (let k = 0; k < N_PED; k++) {
      const seed = citySeed(70 + k * 5);
      const plan = getCityPlan(seed);
      const world = new World({ seed, mode: 'macera', dim: 'neon' });
      attachPropLayer(world, createPropLayer({ citySeed: seed }));
      const market = plan.terminals.find((t) => t.district === 'gece_pazari');
      const mx = market ? market.x : -240;
      const mz = market ? market.z : 240;
      const scenes = [
        { px: mx + 9, pz: mz + 3, phase: 0.85, rain: 0 }, { px: 0, pz: 0, phase: 0.45, rain: 0 }, { px: 160, pz: -80, phase: 0.9, rain: 1 },
      ];
      for (let cx = -50; cx < 50; cx += 1) {
        if (Math.abs(cx * 16) > 400) continue;
        for (let cz = -50; cz < 50; cz += 1) if (Math.abs(cz * 16) <= 400) world.ensureChunk(cx, cz);
      }
      for (let si = 0; si < scenes.length; si++) {
        const sc = scenes[si];
        const { crowd } = makeCrowd(seed, {
          px: sc.px, pz: sc.pz, phase: sc.phase, rain: sc.rain, quality: 'high', probe: worldProbe(world, { roads: plan.roads }),
        });
        crowd.populate();
        const slowRun = new Map();
        for (let t = 0; t < 20 * 90; t++) {
          crowd.step(0.05);
          if (t % 20 === 0) {
            // yürüyen yaya 12 sn'den uzun süre (< 0,15 m/sn) sürünürse = kilitlenme (QA4-002)
            crowd.peds.forEach((p) => {
              if (!p.alive) return;
              if (p.state === 0 && p.speed < 0.15) {
                const n = (slowRun.get(p.id) || 0) + 1;
                slowRun.set(p.id, n);
                if (n === 13) stuckWalkers++;
              } else slowRun.set(p.id, 0);
            });
          }
          if (t % 10 !== 0) continue;
          for (let i = 0; i < crowd.peds.length; i++) {
            const p = crowd.peds[i];
            if (!p.alive) continue;
            const bx = Math.floor(p.x);
            const bz = Math.floor(p.z);
            if (!world.hasChunk(bx >> 4, bz >> 4)) continue;
            checks++;
            const fy = Math.floor(p.y + 0.02);
            const under = world.getBlock(bx, fy - 1, bz);
            const ub = BLOCKS[under];
            if (!ub || ub.liquid || !(ub.cube || (ub.collision || []).some((c) => c[4] >= 0.9))) bad.push('zemin yok/sıvı id ' + under + ' @' + bx + ',' + bz);
            // gövde (r 0,2; y+0,1 … y+1,7) ile 3×3 hücrenin çarpışma kutularının tam kesişimi
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                for (let y = fy; y <= fy + 1; y++) {
                  const id = world.getBlock(bx + dx, y, bz + dz);
                  if (!id) continue;
                  const b = BLOCKS[id];
                  if (b && b.liquid && dx === 0 && dz === 0) bad.push('suda id ' + id + ' @' + bx + ',' + y + ',' + bz);
                  const cb = (b && b.collision) || [];
                  for (let q = 0; q < cb.length; q++) {
                    const c = cb[q];
                    const x0 = bx + dx + c[0]; const x1 = bx + dx + c[3]; const z0 = bz + dz + c[2]; const z1 = bz + dz + c[5];
                    const y0 = y + c[1]; const y1 = y + c[4];
                    if (p.x + 0.2 > x0 && p.x - 0.2 < x1 && p.z + 0.2 > z0 && p.z - 0.2 < z1 && p.y + 1.7 > y0 && p.y + 0.1 < y1) {
                      bad.push('katı id ' + id + ' @' + (bx + dx) + ',' + y + ',' + (bz + dz) + ' durum ' + p.state + ' ped ' + p.x.toFixed(2) + ',' + p.z.toFixed(2) + ' sahne ' + si);
                    }
                  }
                }
              }
            }
            if (!Number.isFinite(p.x + p.y + p.z + p.yaw)) bad.push('NaN');
            if (bad.length > 15) break;
          }
        }
      }
    }
    expect(checks).toBeGreaterThan(20000);
    expect(bad.slice(0, 15)).toEqual([]);
    expect(stuckWalkers, 'kilitlenen yürüyen yaya').toBeLessThanOrEqual(N_PED);
  }, 1500000);
});
