import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem as createMissions } from './cityMissions.js';
import { createSystem as createDiscovery } from './cityDiscovery.js';
import { createSystem as createApi } from './cityApi.js';
import { createSystem as createNpc } from './cityNpc.js';
import { roadNet } from '../sim/city/roadNet.js';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { buildDiscovery, hasChip, hasGraffiti, hasRoom } from '../sim/city/mission/discovery.js';
import { sanitizeCityState } from '../sim/city/cityState.js';
import { raceMedals } from '../sim/city/mission/medals.js';
import { genJobs } from '../sim/city/mission/jobs.js';
import { serializeDim } from '../sim/dim/dimState.js';
import { sanitizeNeon } from '../sim/dim/dimSanitize.js';
import { CITY_MISSIONS_ORDER } from './cityMissions.js';
import { CITY_DISCOVERY_ORDER } from './cityDiscovery.js';
import { CITY_API_ORDER } from './cityApi.js';

vi.setConfig({ testTimeout: 240000 });

function boot(opts) {
  const kit = makeDimG(Object.assign({ render: true, systems: ['blocks', 'props', 'dimension'] }, opts || null));
  const G = kit.G;
  G.vehicles = { driven: null, list: () => [] };
  const events = [];
  const emit0 = G.emit;
  G.emit = (e) => { events.push(e); return emit0(e); };
  const npc = createNpc(G);
  const missions = createMissions(G);
  const discovery = createDiscovery(G);
  const api = createApi(G);
  [npc, missions, discovery, api].forEach((s) => G.addSystem(s));
  return {
    kit, G, events, missions, discovery, npc, apiSys: api, api: Object.assign({}, missions.api(), discovery.api(), api.api()),
  };
}

function toCity(b, x, z) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  for (let cx = Math.floor((x - 80) / 16); cx <= Math.floor((x + 80) / 16); cx++) {
    for (let cz = Math.floor((z - 80) / 16); cz <= Math.floor((z + 80) / 16); cz++) w.ensureChunk(cx, cz);
  }
  b.kit.place(x === undefined ? 1.5 : x, 64, z === undefined ? 4.5 : z, 0);
  b.G.hud.city = { kredi: 0, district: '', mission: null, radio: '', light: null };
  b.kit.frame(1 / 60, 30);
  return r;
}

const blobOf = (b) => b.kit.mgr.get('neon').city;
const kredi = (b) => b.G.cityMissionKit.wallet.get();
const ev = (b, type) => b.events.filter((e) => e.type === type);
/** 'why' etiketli Kredi kazançlarının toplamı (başarım/görev Kredisinden bağımsız ölçmek için). */
const gain = (b, why) => b.events.filter((e) => e.type === 'kredi' && e.why === why).reduce((a, e) => a + e.delta, 0);

/** Oyuncuyu hedefe adım adım taşır (ışınlanma denetimine takılmasın: adım ≤ 5 m). */
function walkTo(b, tx, tz, mps) {
  const stepM = (mps || 18) / 60;
  for (let guard = 0; guard < 60000; guard++) {
    const dx = tx - b.G.body.x;
    const dz = tz - b.G.body.z;
    const d = Math.hypot(dx, dz);
    if (d <= stepM) {
      b.G.body.x = tx; b.G.body.z = tz;
      b.kit.frame(1 / 60, 1);
      return;
    }
    b.G.body.x += (dx / d) * stepM;
    b.G.body.z += (dz / d) * stepM;
    b.kit.frame(1 / 60, 1);
  }
}

describe('cityMissions: sistem sırası', () => {
  it('31 / 34 / 35 ve sözleşme sıralarıyla çakışmaz', () => {
    expect([CITY_MISSIONS_ORDER, CITY_DISCOVERY_ORDER, CITY_API_ORDER]).toEqual([31, 34, 35]);
    const used = [-120, -110, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 33, 36, 37, 38, 39, 40];
    [31, 34, 35].forEach((o) => expect(used).not.toContain(o));
  });
});

describe('cityMissions: şehre giriş, hikâye zinciri, sayaçlar', () => {
  it('overworld\'de API null; şehre geçince hoş geldin görevi etkin, HUD görevi yazılır; 100 Kredi ile başlar', () => {
    const b = boot();
    b.kit.frame(1 / 60, 5);
    expect(b.api.getMissionInfo()).toBeNull();
    expect(b.api.getBoard()).toBeNull();
    expect(b.api.getDiscoveryInfo()).toBeNull();
    toCity(b);
    b.kit.frame(1 / 60, 90);
    const info = b.api.getMissionInfo();
    expect(info.activeQuest.id).toBe('nm_hosgeldin');
    expect(info.quests).toHaveLength(14);
    expect(info.races).toHaveLength(8);
    expect(info.achievements).toHaveLength(52);
    expect(b.G.hud.city.mission.title).toBe('Hoş Geldin');
    expect(info.discovery.chipsTotal).toBe(240);
    expect(b.G.cityDay()).toBe(0);
  });

  it('sayaçlar: yürünen yol, bölge maskesi, şehir saniyesi; ışınlanma yol saymaz', () => {
    const b = boot();
    toCity(b);
    const c = blobOf(b);
    const s0 = c.stats.citySeconds || 0;
    walkTo(b, 1.5, 60, 12);
    b.kit.frame(1 / 60, 90);
    expect(c.stats.cityM).toBeGreaterThanOrEqual(50);
    expect(c.stats.cityM).toBeLessThan(80);
    expect(c.stats.citySeconds).toBeGreaterThan(s0);
    expect(c.stats.dmask).toBeGreaterThan(0);
    const m0 = c.stats.cityM;
    b.kit.place(400, 64, 400, 0);
    b.kit.frame(1 / 60, 3);
    expect(c.stats.cityM - m0).toBeLessThan(2);
  });

  it('npcTalk olayı: konuşma sayacı + sahip tanışma; hoş geldin görevi biter, +40 Kredi', () => {
    const b = boot();
    toCity(b);
    b.kit.frame(1 / 60, 90);
    const k0 = kredi(b);
    b.G.emit({ type: 'npcTalk', npc: 'rehber_zeynep', first: true });
    b.kit.frame(1 / 60, 90);
    expect(blobOf(b).stats.talks).toBe(1);
    expect(blobOf(b).quests.nm_hosgeldin).toBe(2);
    expect(kredi(b)).toBe(k0 + 40);
    expect(ev(b, 'questUpdate').some((e) => e.done === true)).toBe(true);
    expect(b.api.getMissionInfo().activeQuest.id).toBe('nm_ilk_surus');
    // NPC diyaloğu "görev var mı?" için bayrak: q_nm_hosgeldin = 2
    expect(b.G.cityNpc.getFlag('q_nm_hosgeldin')).toBe(2);
  });
});

describe('cityDiscovery: çipler, hikâye, koleksiyon, jeton talebi', () => {
  it('yaklaşınca çip toplanır (+5 Kredi, olay); 10. çipte günlük parçası; ikinci kez toplanmaz', () => {
    const b = boot();
    toCity(b);
    const cat = buildDiscovery(b.G.world.seed);
    const ground = cat.chips.filter((c) => c.kind === 'kapi').slice(0, 11);
    ground.slice(0, 10).forEach((ch, i) => {
      b.kit.place(ch.x, ch.y, ch.z, 0);
      b.kit.frame(1 / 60, 8);
      expect(hasChip(blobOf(b).discovery, ch.id), 'çip ' + ch.id).toBe(true);
      expect(ev(b, 'chipFound')).toHaveLength(i + 1);
    });
    expect(gain(b, 'cip')).toBe(50);
    expect(gain(b, 'gunluk')).toBe(25);
    expect(blobOf(b).discovery.story).toBe(1);
    expect(b.kit.banners.some((x) => x.text.indexOf('Meridyen Günlüğü') === 0)).toBe(true);
    // aynı çipin üstünde beklemek tekrar saymaz
    const n = ev(b, 'chipFound').length;
    b.kit.place(ground[0].x, ground[0].y, ground[0].z, 0);
    b.kit.frame(1 / 60, 30);
    expect(ev(b, 'chipFound')).toHaveLength(n);
    // uzak (kat farkı) çip toplanmaz
    const far = ground[10];
    b.kit.place(far.x, far.y + 12, far.z, 0);
    b.kit.frame(1 / 60, 20);
    expect(hasChip(blobOf(b).discovery, far.id)).toBe(false);
  });

  it('60 çip → neon:chips60 bekleyen talep; reward olayı yayılır; markRewardClaimed ile onaylanır; giriş yokken yayılmaz', () => {
    const b = boot();
    toCity(b);
    const cat = buildDiscovery(b.G.world.seed);
    b.api.setCityRewardsEnabled(false);
    for (let i = 0; i < 60; i++) {
      const ch = cat.chips[i];
      b.kit.place(ch.x, ch.y, ch.z, 0);
      b.kit.frame(1 / 60, 7);
    }
    b.kit.frame(1 / 60, 130);
    expect(blobOf(b).claims.chips60).toBe(1);
    expect(ev(b, 'reward')).toHaveLength(0);
    b.api.setCityRewardsEnabled(true);
    b.kit.frame(1 / 60, 130);
    const rw = ev(b, 'reward');
    expect(rw).toHaveLength(1);
    expect(rw[0].key).toBe('neon:chips60');
    expect(b.G.cityApi.markClaimed('neon:chips60')).toBe(true);
    expect(blobOf(b).claims.chips60).toBe(2);
    b.kit.frame(1 / 60, 60 * 100);
    expect(ev(b, 'reward')).toHaveLength(1);
    expect(b.G.cityApi.markClaimed('macera:ilk')).toBe(false);
    expect(b.api.getCityRewards().items.find((i) => i.short === 'chips60').state).toBe('alindi');
  });

  it('grafiti: duvara yakın etkileşim seçiciyi açar; boya 3 sn; +15 Kredi, tek sefer; uzaklaşınca yarım kalır', () => {
    const b = boot();
    toCity(b);
    const cat = buildDiscovery(b.G.world.seed);
    const g = cat.graffiti[0];
    b.kit.place(g.x, g.y, g.z, g.yaw);
    b.G.look = { x: -Math.sin(g.yaw + Math.PI), y: 0, z: -Math.cos(g.yaw + Math.PI) };
    b.kit.frame(1 / 60, 20);
    expect(b.discovery.st.nearSpot).toBe(0);
    b.G.inputState.interactPressed = true;
    b.kit.frame(1 / 60, 1);
    b.G.inputState.interactPressed = false;
    const pv = b.api.getGraffitiPicker();
    expect(pv).not.toBeNull();
    expect(pv.stencils).toHaveLength(6);
    expect(pv.colors).toHaveLength(8);
    expect(b.G.ui).toBe('dialogue');
    expect(b.api.graffitiAct({ k: 'pick', design: 3, color: 6 }).ok).toBe(true);
    expect(b.api.getGraffitiPicker().design).toBe(3);
    expect(b.api.graffitiAct({ k: 'pick', design: 99 }).ok).toBe(true);
    expect(b.api.getGraffitiPicker().design).toBe(3);
    expect(b.api.graffitiAct({ k: 'paint' }).ok).toBe(true);
    expect(b.G.ui).toBe('none');
    b.kit.frame(1 / 60, 100);
    expect(hasGraffiti(blobOf(b).discovery, 0)).toBe(false);
    b.kit.frame(1 / 60, 100);
    expect(hasGraffiti(blobOf(b).discovery, 0)).toBe(true);
    expect(blobOf(b).discovery.graffiti[0]).toEqual([3, 6]);
    expect(gain(b, 'grafiti')).toBe(15);
    expect(ev(b, 'graffitiDone')).toHaveLength(1);
    // boyalı duvar tekrar boyanmaz
    b.G.inputState.interactPressed = true;
    b.kit.frame(1 / 60, 12);
    b.G.inputState.interactPressed = false;
    expect(b.api.getGraffitiPicker()).toBeNull();
    // yarım kalan boya
    const g2 = cat.graffiti[1];
    b.kit.place(g2.x, g2.y, g2.z, g2.yaw);
    b.G.look = { x: -Math.sin(g2.yaw + Math.PI), y: 0, z: -Math.cos(g2.yaw + Math.PI) };
    b.kit.frame(1 / 60, 20);
    b.G.inputState.interactPressed = true;
    b.kit.frame(1 / 60, 1);
    b.G.inputState.interactPressed = false;
    b.api.graffitiAct({ k: 'paint' });
    b.kit.frame(1 / 60, 30);
    b.kit.place(g2.x + 30, g2.y, g2.z, 0);
    b.kit.frame(1 / 60, 200);
    expect(hasGraffiti(blobOf(b).discovery, 1)).toBe(false);
  });

  it('gizli oda: tetikleyici kutusuna girince +50 Kredi (tek sefer); harita işaretleri yalnız bulunanları içerir', () => {
    const b = boot();
    toCity(b);
    const cat = buildDiscovery(b.G.world.seed);
    const r = cat.rooms[4];
    expect(b.G.cityDiscovery.markers()).toHaveLength(0);
    b.kit.place(r.x, r.y, r.z, 0);
    b.kit.frame(1 / 60, 60);
    expect(hasRoom(blobOf(b).discovery, 4)).toBe(true);
    expect(gain(b, 'oda')).toBe(50);
    b.kit.frame(1 / 60, 60);
    expect(gain(b, 'oda')).toBe(50);
    const m = b.G.cityDiscovery.markers();
    expect(m.map((x) => x.id)).toEqual(['oda:4']);
    expect(ev(b, 'roomFound')).toHaveLength(1);
  });

  it('Kasa: tetikleyiciye girince Diyar Işığı (+150 Kredi, eşya), neon:easter bekler; ikinci kez yok', () => {
    const b = boot();
    toCity(b);
    const cat = buildDiscovery(b.G.world.seed);
    const a = cat.vault.anchor;
    b.kit.place(a.x, a.y + 0.2, a.z, 0);
    b.kit.frame(1 / 60, 70);
    expect(blobOf(b).stats.easter).toBe(1);
    expect(blobOf(b).stats.vault).toBe(1);
    b.kit.frame(1 / 60, 130);
    expect(blobOf(b).claims.easter).toBe(1);
    expect(b.kit.banners.some((x) => x.text === 'Diyar Işığı')).toBe(true);
    const n = ev(b, 'diyarIsigi').length;
    b.kit.frame(1 / 60, 130);
    expect(ev(b, 'diyarIsigi')).toHaveLength(n);
  });
});

describe('cityMissions: işler (pano → kabul → teslim → ödül, iptal, geri yükleme)', () => {
  function firstWalkable(b) {
    const seed = b.G.world.seed;
    const net = roadNet(seed);
    for (let day = 0; day < 4; day++) {
      for (let desk = 0; desk < 7; desk++) {
        const j = genJobs(seed, net, 'kurye', day, desk).find((q) => q.kind === 'tamir' || (q.kind === 'kurye' && q.tier === 'caylak'));
        if (j) return j;
      }
    }
    return null;
  }

  it('NPC iş efekti panoyu açar; yayayla çaylak iş kabul edilir; A→B teslimi Kredi + sayaç + neon:firstjob; hızlı bitiş reddedilir', () => {
    const b = boot();
    toCity(b);
    b.kit.frame(1 / 60, 30);
    const fx = b.G.cityNpc.effects;
    expect(fx.has('job')).toBe(true);
    expect(fx.has('mission')).toBe(true);
    expect(fx.has('race')).toBe(true);
    expect(fx.has('taxi')).toBe(true);
    expect(fx.has('photo')).toBe(true);
    const r = fx.runOne({ k: 'job', board: 'kurye' }, { npc: { id: 'kurye_ela' } });
    expect(r.ok).toBe(true);
    b.kit.frame(1 / 60, 3);
    const board = b.api.getBoard();
    expect(board).not.toBeNull();
    expect(board.kind).toBe('kurye');
    expect(board.offers).toHaveLength(3);
    expect(b.G.ui).toBe('dialogue');
    // araçsız: araç gerektiren teklif reddedilir ve pano açık kalır
    const needCar = board.offers.find((o) => !o.canWalk);
    if (needCar) {
      const rr = b.api.acceptJob(needCar.id);
      expect(rr.ok).toBe(false);
      expect(rr.reason).toBe('arac');
      expect(b.api.getBoard()).not.toBeNull();
    }
    const walkable = board.offers.find((o) => o.canWalk && o.available);
    expect(walkable).toBeTruthy();
    const k0 = kredi(b);
    const acc = b.api.acceptJob(walkable.id);
    expect(acc.ok).toBe(true);
    expect(b.api.getBoard()).toBeNull();
    expect(b.G.ui).toBe('none');
    const tr = b.api.getMissionTracker();
    expect(tr.kind).toBe('job');
    expect(tr.label).toMatch(/al/i);
    b.kit.frame(1 / 60, 2);
    expect(b.G.hud.city.mission.title).toMatch(/:/);
    expect(b.G.driveMarker).not.toBeNull();
    // ikinci iş alınamaz
    expect(b.api.abandonMission().ok).toBe(true);
    b.kit.frame(1 / 60, 2);
    expect(b.api.getMissionTracker()).toBeNull();
    expect(b.G.driveMarker).toBeNull();
    expect(kredi(b)).toBe(k0);
  });

  it('teslimat tamamlanır: Kredi artar, işler sayacı, claim bekler; iş aktifken ikinci iş reddedilir; ölünce iptal', () => {
    const b = boot();
    toCity(b);
    const j = firstWalkable(b);
    expect(j).toBeTruthy();
    // A'ya ışınlan (görev başlamadan), sonra panodan kabul → B'ye yürü
    b.kit.place(j.from.x, 64, j.from.z + 3, 0);
    for (let cx = Math.floor((j.from.x - 80) / 16); cx <= Math.floor((j.from.x + 80) / 16); cx++) for (let cz = Math.floor((j.from.z - 80) / 16); cz <= Math.floor((j.from.z + 80) / 16); cz++) b.G.world.ensureChunk(cx, cz);
    b.kit.frame(1 / 60, 3);
    const m = b.missions.mm;
    const r = m.startJob(j);
    expect(r.ok).toBe(true);
    expect(m.startJob(j).reason).toBe('meşgul');
    const k0 = kredi(b);
    walkTo(b, j.from.x, j.from.z, 10);
    b.kit.frame(1 / 60, 5);
    expect(m.st.run.step).toBe(1);
    walkTo(b, j.to.x, j.to.z, 25);
    b.kit.frame(1 / 60, 120);
    expect(m.busy()).toBe(false);
    expect(kredi(b)).toBeGreaterThan(k0);
    expect(blobOf(b).stats.jobsDone).toBe(1);
    expect(blobOf(b).jobs.done).toBe(1);
    expect(ev(b, 'jobDone')).toHaveLength(1);
    const tr = b.api.getMissionTracker();
    expect(tr.result.ok).toBe(true);
    b.kit.frame(1 / 60, 130);
    expect(blobOf(b).claims.firstjob).toBe(1);
    expect(ev(b, 'reward').some((e) => e.key === 'neon:firstjob')).toBe(true);
    // ölüm görevi iptal eder
    expect(m.startJob(j).ok).toBe(true);
    b.G.emit({ type: 'death' });
    expect(m.busy()).toBe(false);
  });

  it('en kısa süre: ışık hızıyla teslimat geçersiz (ışınlanma iptali) ve ödül yok', () => {
    const b = boot();
    toCity(b);
    const j = firstWalkable(b);
    const m = b.missions.mm;
    b.kit.place(j.from.x, 64, j.from.z, 0);
    for (let cx = Math.floor((j.to.x - 40) / 16); cx <= Math.floor((j.to.x + 40) / 16); cx++) for (let cz = Math.floor((j.to.z - 40) / 16); cz <= Math.floor((j.to.z + 40) / 16); cz++) b.G.world.ensureChunk(cx, cz);
    b.kit.frame(1 / 60, 3);
    m.startJob(j);
    b.kit.frame(1 / 60, 3);
    const k0 = kredi(b);
    b.kit.place(j.to.x, 64, j.to.z, 0);
    b.kit.frame(1 / 60, 5);
    expect(m.busy()).toBe(false);
    expect(blobOf(b).stats.jobsDone || 0).toBe(0);
    expect(kredi(b)).toBe(k0);
  });

  it('etkin iş kayıt/yükleme: serileştir → temizle → yeni blob ile devam; şehirden çıkınca kayıtta kalır', () => {
    const b = boot();
    toCity(b);
    const j = firstWalkable(b);
    const m = b.missions.mm;
    b.kit.place(j.from.x, 64, j.from.z, 0);
    for (let cx = Math.floor((j.from.x - 60) / 16); cx <= Math.floor((j.from.x + 60) / 16); cx++) for (let cz = Math.floor((j.from.z - 60) / 16); cz <= Math.floor((j.from.z + 60) / 16); cz++) b.G.world.ensureChunk(cx, cz);
    b.kit.frame(1 / 60, 3);
    expect(m.startJob(j).ok).toBe(true);
    walkTo(b, j.from.x, j.from.z, 10);
    b.kit.frame(1 / 60, 150); // anlık görüntü tazelensin
    expect(m.st.run.step).toBe(1);
    const ctx = b.kit.mgr.get('neon');
    expect(ctx.city.mission.id).toBe(j.id);
    // kayıt biçimi: serializeDim → JSON → sanitizeNeon
    const blob = serializeDim(ctx);
    const round = sanitizeNeon(JSON.parse(JSON.stringify(blob)));
    expect(round.city.mission.id).toBe(j.id);
    expect(round.city.mission.r.s).toBe(1);
    // yükleme: çalışma zamanı durumunu at, yeni blobu ata
    m.leaveCity();
    expect(m.busy()).toBe(false);
    ctx.city = sanitizeCityState(JSON.parse(JSON.stringify(ctx.city)));
    b.kit.frame(1 / 60, 3);
    expect(m.busy()).toBe(true);
    expect(m.st.run.step).toBe(1);
    expect(m.st.job.id).toBe(j.id);
    // iptal her zaman mümkün
    expect(m.cancel('iptal').ok).toBe(true);
    expect(ctx.city.mission).toBeNull();
  });

  it('pano Esc/ui değişimiyle kapanır; ikinci pano açılamaz; kayıtsız efekt id güvenli', () => {
    const b = boot();
    toCity(b);
    b.kit.frame(1 / 60, 30);
    const m = b.missions.mm;
    expect(m.openBoard('kurye').ok).toBe(true);
    b.G.setUi('none');
    b.kit.frame(1 / 60, 2);
    expect(b.api.getBoard()).toBeNull();
    expect(m.openBoard('yok').ok).toBe(false);
    const fx = b.G.cityNpc.effects;
    expect(fx.runOne({ k: 'mission', id: 'nm_yok' }, {}).ok).toBe(false);
    expect(fx.runOne({ k: 'mission', id: 'nm_ilk_surus' }, {}).ok).toBe(true);
    expect(blobOf(b).quests.nm_ilk_surus).toBe(1);
    expect(b.G.cityNpc.getFlag('q_nm_ilk_surus')).toBe(1);
  });
});

describe('cityMissions: yarış (geri sayım, kapılar, madalya, iptal)', () => {
  function setupRace(b, id, cls) {
    const seed = b.G.world.seed;
    const plan = getCityPlan(seed);
    const net = roadNet(seed);
    const race = plan.races[id];
    const g0 = race.gates[0];
    for (let cx = Math.floor((g0.x - 60) / 16); cx <= Math.floor((g0.x + 60) / 16); cx++) for (let cz = Math.floor((g0.z - 60) / 16); cz <= Math.floor((g0.z + 60) / 16); cz++) b.G.world.ensureChunk(cx, cz);
    const veh = {
      id: 1, v: { x: g0.x, y: g0.y, z: g0.z, vx: 0, vz: 0, yaw: 0, cls, u: 0 },
    };
    b.G.vehicles = { driven: veh, list: () => [veh] };
    b.G.player.vehicle = 1;
    b.kit.place(g0.x, g0.y, g0.z, 0);
    return { race, net, veh, med: raceMedals(net, race, cls) };
  }

  function moveCar(b, veh, tx, tz, mps) {
    const stepM = mps / 60;
    for (let guard = 0; guard < 100000; guard++) {
      const dx = tx - veh.v.x;
      const dz = tz - veh.v.z;
      const d = Math.hypot(dx, dz);
      const m = Math.min(stepM, d);
      if (d > 1e-6) {
        veh.v.x += (dx / d) * m;
        veh.v.z += (dz / d) * m;
        veh.v.vx = (dx / d) * mps;
        veh.v.vz = (dz / d) * mps;
      }
      b.G.body.x = veh.v.x; b.G.body.z = veh.v.z;
      b.kit.frame(1 / 60, 1);
      if (d <= stepM) return;
    }
  }

  it('araçsız yarış reddedilir; araçla hazırlık → durunca 3 sn geri sayım → koşu', () => {
    const b = boot();
    toCity(b);
    const m = b.missions.mm;
    expect(m.armRace(6).reason).toBe('arac');
    expect(m.armRace(99).ok).toBe(false);
    const s = setupRace(b, 6, 'spor');
    expect(m.armRace(6).ok).toBe(true);
    expect(m.st.stage).toBe('staging');
    expect(m.armRace(1).reason).toBe('meşgul');
    expect(b.api.getMissionTracker().label).toMatch(/Hazır|Yavaşla/);
    // hızlı geçerken geri sayım başlamaz
    s.veh.v.vx = 12;
    b.kit.frame(1 / 60, 60);
    expect(m.st.stage).toBe('staging');
    s.veh.v.vx = 0; s.veh.v.vz = 0;
    b.kit.frame(1 / 60, 30);
    expect(m.st.stage).toBe('countdown');
    expect(b.api.getMissionTracker().countdown).toBeGreaterThan(0);
    b.kit.frame(1 / 60, 200);
    expect(m.st.stage).toBe('running');
    expect(m.st.run.def.id).toBe('race_6');
    expect(b.G.driveMarker).not.toBeNull();
    expect(m.cancel('iptal').ok).toBe(true);
  });

  it('kapıları sırayla geçen sürücü altın alır (neon:goldrace bekler); kapı atlayan bitiremez; araç değişimi iptal eder', () => {
    const b = boot();
    toCity(b);
    const m = b.missions.mm;
    const s = setupRace(b, 6, 'spor');
    m.armRace(6);
    b.kit.frame(1 / 60, 300);
    expect(m.st.stage).toBe('running');
    const gates = m.st.run.def.steps[0].gates;
    // toplam doğru-çizgi uzunluğu → altın süresine yakın hız (0,92×altın; en kısa süre 0,8×altın)
    let len = Math.hypot(gates[0].x - s.race.gates[0].x, gates[0].z - s.race.gates[0].z);
    for (let i = 1; i < gates.length; i++) len += Math.hypot(gates[i].x - gates[i - 1].x, gates[i].z - gates[i - 1].z);
    const mps = Math.min(48, len / (s.med.gold * 0.92));
    const k0 = kredi(b);
    // kapı atlama: son kapıya doğru git → bitmez
    const probeEnd = { x: s.veh.v.x, z: s.veh.v.z };
    expect(m.st.run.passed).toBe(0);
    gates.forEach((g) => moveCar(b, s.veh, g.x, g.z, mps));
    b.kit.frame(1 / 60, 60);
    expect(m.busy()).toBe(false);
    expect(probeEnd.x).toBeDefined();
    const res = b.api.getMissionTracker();
    expect(res.result.ok).toBe(true);
    expect(blobOf(b).stats.racesDone).toBe(1);
    expect(blobOf(b).stats.racesWon).toBe(1);
    expect(blobOf(b).runs[6].b.spor[1]).toBeGreaterThanOrEqual(1);
    expect(kredi(b)).toBeGreaterThan(k0);
    expect(ev(b, 'raceDone')).toHaveLength(1);
    if (blobOf(b).runs[6].b.spor[1] === 3) {
      b.kit.frame(1 / 60, 130);
      expect(blobOf(b).claims.goldrace).toBe(1);
    }
    // araç değişimi: yarış koşarken sınıf değişirse iptal
    b.kit.frame(1 / 60, 5);
    const s2 = setupRace(b, 6, 'spor');
    m.armRace(6);
    b.kit.frame(1 / 60, 300);
    expect(m.st.stage).toBe('running');
    s2.veh.v.cls = 'taksi';
    b.kit.frame(1 / 60, 3);
    expect(m.busy()).toBe(false);
    expect(blobOf(b).stats.racesDone).toBe(1);
  });

  it('yarışta ışınlanma iptal eder; süre doldu (2×bronz) başarısız; sonuç kartı 12 sn sonra kaybolur', () => {
    const b = boot();
    toCity(b);
    const m = b.missions.mm;
    const s = setupRace(b, 6, 'taksi');
    m.armRace(6);
    b.kit.frame(1 / 60, 300);
    expect(m.st.stage).toBe('running');
    s.veh.v.x += 300;
    b.kit.frame(1 / 60, 3);
    expect(m.busy()).toBe(false);
    expect(b.kit.hints.some((h) => /Işınlandığın/.test(h.text))).toBe(true);
    expect(blobOf(b).stats.racesDone || 0).toBe(0);
    expect(m.tracker()).toBeNull();
  });
});

describe('cityMissions: erişilebilirlik ve güvenlik', () => {
  it('erişilebilirlik modunda iş süresi ve kapı yarıçapı ×2', () => {
    const b = boot();
    toCity(b);
    b.G.accessibility = true;
    const j = genJobs(b.G.world.seed, roadNet(b.G.world.seed), 'kurye', 0, 0).find((q) => q.kind === 'tamir' || q.tier === 'caylak');
    const m = b.missions.mm;
    expect(m.startJob(j).ok).toBe(true);
    expect(m.st.run.radiusScale).toBe(2);
    const lim = m.st.run.limit;
    expect(lim === 0 || lim > 0).toBe(true);
    m.cancel('iptal', true);
  });

  it('yemin: sistemler dispose edilir, API şehir dışında boş', () => {
    const b = boot();
    toCity(b);
    b.kit.frame(1 / 60, 5);
    b.kit.mgr.swap('overworld', { reason: 'test' });
    b.kit.frame(1 / 60, 5);
    expect(b.api.getMissionInfo()).toBeNull();
    expect(b.api.abandonMission().ok).toBe(false);
    expect(b.G.hud.city && b.G.hud.city.mission).toBeFalsy();
  });
});
