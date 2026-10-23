/*
 * KEŞİF — "cityMissions" sistemi (order 31): Neon Meridyen görevleri, işleri, yarışları, hikâye zinciri, başarımlar ve şehir sayaçları (Faz 4, paket discovery_missions).
 * Sözleşme §11, §16, §19–§20. Saf mantık sim/city/mission/* ve sim/city/cityState.js'tedir; bu dosya motora bağlar. Aile dostu: ceza yok, yolcu/paket zarar görmez.
 *
 *   G.cityMissions = {mm (görev yöneticisi), state, tracker(), info(), armRace(id), cancel(), busy(), questState(id), startQuest(id)}     G.cityDay() → şehir günü
 *   NPC efektleri (G.cityNpc.effects): mission{id} · job{board:'kurye'} · taxi{} · race{id} · photo{id}  — diyalog "Görev var mı?" durumu için sağlayıcı kaydedilir
 *   Olaylar (G.emit): jobAccepted jobDone raceStart raceCheckpoint raceDone missionCancelled questUpdate{title,done} achievement{title,desc} · Dinler: tüm motor olayları
 *      (cityEvents.reduceEvent sayaçları), death, uiChanged, dialogueEnd, dimensionEntered
 *   API (window.__game): getMissionInfo() getMissionTracker() getBoard() acceptJob(id) closeBoard() startRace(id) abandonMission() getCityJournal()
 *   Hata ayıklama komutları: mis | mis quest <id> | mis race <id> | mis job <kurye|taksi> | mis cancel | mis stat <anahtar> <n>
 */
import { districtAt, getCityPlan, pois } from '../sim/city/cityPlan.js';
import { DISTRICT_KEYS } from '../sim/city/cityBrands.js';
import { clockPhase, isNight } from '../sim/daynight.js';
import {
  ensureCityState, statAdd, statBit, statGet,
} from '../sim/city/cityState.js';
import { reduceEvent } from '../sim/city/cityEvents.js';
import { OWNER_NPCS } from '../sim/city/ped/npcData.js';
import {
  achievementRows, evaluateAchievements,
} from '../sim/city/mission/achievements.js';
import {
  QUEST_BY_ID, activeQuest, autoStart, evaluateQuests, questProgress, questRows, questState, questTarget, startQuest,
} from '../sim/city/mission/quests.js';
import { raceName } from '../sim/city/mission/races.js';
import { journalChips, journalGraffiti, journalRooms, journalStory, setStatus } from '../sim/city/mission/discovery.js';
import { registerCommand } from './sessionCommands.js';
import { getKit } from './cityMissionsKit.js';
import { createMissionManager } from './cityMissionsRun.js';

export const CITY_MISSIONS_ORDER = 31;
const DAY_SECONDS = 1200;
const SLOW_EVERY = 1;
const DISTRICT_EVERY = 0.5;
const OWNER_IDS = new Set(OWNER_NPCS.map((n) => n.id));

export function createSystem(G) {
  const kit = getKit(G);
  const mm = createMissionManager(G, kit);
  const st = {
    acc: 0,
    dAcc: 0,
    last: { x: 0, z: 0, valid: false },
    fracM: 0,
    fracS: 0,
    cityRef: null,
    hooked: false,
    markAcc: 0,
    paintSnap: '',
    garageOpen: false,
    journalCache: null,
    hudMission: { title: '', sub: '', dist: 0, timeLeft: -1 },
    firstDone: false,
    boardQueued: '',
    metroStations: null,
    metroSeed: -1,
    photoSpots: null,
    stats: { quests: 0, ach: 0, ticks: 0 },
  };
  G.cityMissions = {
    mm,
    st,
    tracker: () => mm.tracker(),
    armRace: (id) => mm.armRace(id),
    cancel: () => mm.cancel('iptal'),
    busy: () => mm.busy(),
    questState: (id) => questState(blob().quests, id),
    startQuest: (id) => startQuestApi(id),
  };

  function blob() {
    return kit.blob() || ensureCityState({});
  }

  function dayN() {
    return Math.floor(statGet(kit.blob(), 'citySeconds') / DAY_SECONDS);
  }
  G.cityDay = dayN;

  /* ---------------------------------------------------------------------------- NPC bağlantısı */
  function questMsg(id) {
    const q = QUEST_BY_ID[id];
    return q ? q.name + ': ' + q.hint : '';
  }

  function startQuestApi(id) {
    const q = QUEST_BY_ID[id];
    if (!q) return { ok: false, reason: 'yok', msg: 'Bu görev bilinmiyor.' };
    const c = blob();
    const s = questState(c.quests, id);
    if (s === 2) return { ok: true, msg: 'Bu görevi zaten tamamladın.' };
    if (s === 1) return { ok: true, msg: 'Görev zaten sürüyor: ' + q.hint };
    startQuest(c.quests, id);
    syncFlag(id, 1);
    G.emit({ type: 'questUpdate', title: q.name, done: false });
    const tg = kit.inCity() ? questTarget(kit.seed(), q, kit.pos().x, kit.pos().z) : null;
    if (tg && !mm.busy()) mm.setMarker(tg, tg.label);
    return { ok: true, msg: questMsg(id) };
  }

  function syncFlag(id, v) {
    const n = G.cityNpc;
    if (n && typeof n.setFlag === 'function') n.setFlag('q_' + id, v);
  }

  function photoEffect(e) {
    const c = blob();
    if (questState(c.quests, 'nm_fotograf') === 0) startQuest(c.quests, 'nm_fotograf');
    const seed = kit.seed();
    if (seed !== -1) {
      if (!st.photoSpots || st.photoSeed !== seed) {
        st.photoSpots = pois(seed).filter((p) => p.type === 'photo_spot');
        st.photoSeed = seed;
      }
      const pos = kit.pos();
      let best = null;
      let bd = Infinity;
      st.photoSpots.forEach((p) => {
        const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      });
      if (best && !mm.busy()) mm.setMarker(best, 'Foto noktası');
    }
    void e;
    return { ok: true, msg: 'Foto moduna geç ve güzel bir kare yakala.' };
  }

  function hookNpc() {
    const n = G.cityNpc;
    if (!n || !n.effects || st.hooked) return;
    st.hooked = true;
    const fx = n.effects;
    fx.on('mission', (e) => {
      const r = startQuestApi(e.id);
      return { ok: r.ok, msg: r.msg, reason: r.reason };
    });
    fx.on('job', (e) => {
      st.boardQueued = e.board === 'taksi' ? 'taksi' : 'kurye';
      return { ok: true, msg: 'Panoya bakalım…' };
    });
    fx.on('taxi', () => {
      st.boardQueued = 'taksi';
      return { ok: true, msg: 'Durakta yolcu bekleyenler var…' };
    });
    fx.on('race', (e) => {
      const r = mm.armRace(e.id);
      return r.ok ? { ok: true, msg: raceName(e.id) + ': başlangıç kapısına git ve dur.' } : { ok: false, msg: r.message, reason: r.reason };
    });
    if (!fx.has('photo')) fx.on('photo', photoEffect);
    if (typeof n.setProvider === 'function') {
      n.setProvider({
        quest: (id) => ['none', 'active', 'done'][questState(blob().quests, id)] || 'none',
        stat: () => 0,
      });
    }
  }

  /* ---------------------------------------------------------------------------- sayaçlar */
  function metroBit(pos) {
    if (pos.y > 56 || pos.y < 38) return -1;
    const seed = kit.seed();
    if (st.metroSeed !== seed) {
      st.metroSeed = seed;
      const ug = getCityPlan(seed).underground;
      st.metroStations = ug && ug.metro && ug.metro.stations ? ug.metro.stations : [];
    }
    for (let i = 0; i < st.metroStations.length; i++) {
      const s = st.metroStations[i];
      if (Math.abs(pos.x - s.x) <= 30 && Math.abs(pos.z - s.z) <= 30) return i;
    }
    return -1;
  }

  function stepCounters(dt, pos) {
    const c = blob();
    // süre
    st.fracS += dt;
    if (st.fracS >= 1) {
      const w = Math.floor(st.fracS);
      st.fracS -= w;
      statAdd(c, 'citySeconds', w);
      const wsim = G.weatherSim;
      if (wsim && wsim.intensity > 0.3 && wsim.renderKind === 'rain') statAdd(c, 'rainSeconds', w);
    }
    // yol
    if (st.last.valid) {
      const d = Math.hypot(pos.x - st.last.x, pos.z - st.last.z);
      if (d < 20) {
        st.fracM += d;
        if (st.fracM >= 1) {
          const m = Math.floor(st.fracM);
          st.fracM -= m;
          statAdd(c, 'cityM', m);
          const night = G.clock ? isNight(clockPhase(G.clock)) : false;
          if (pos.driving) {
            statAdd(c, 'driveM', m);
            if (night) statAdd(c, 'nightDriveM', m);
          } else if (night) statAdd(c, 'nightFootM', m);
        }
      }
    }
    st.last.x = pos.x;
    st.last.z = pos.z;
    st.last.valid = true;
    // bölge + metro
    st.dAcc += dt;
    if (st.dAcc >= DISTRICT_EVERY) {
      st.dAcc = 0;
      let key = '';
      try {
        key = districtAt(kit.seed(), pos.x, pos.z, pos.y);
      } catch {
        key = '';
      }
      const di = DISTRICT_KEYS.indexOf(key);
      if (di >= 0) statBit(c, 'dmask', di);
      const mb = metroBit(pos);
      if (mb >= 0 && mb < 29) statBit(c, 'mmask', mb);
    }
  }

  function slowTick() {
    const c = blob();
    st.stats.ticks++;
    const tm = kit.terminalMask();
    if (tm !== statGet(c, 'tmask')) c.stats.tmask = tm;
    let view = kit.metrics();
    // hikâye zinciri: başlat → ölçüt tamamsa bitir → sıradakini başlat
    const announceStart = (q) => {
      syncFlag(q.id, 1);
      kit.say('Yeni görev: ' + q.name + '. ' + q.hint, 'mis:q:' + q.id);
      G.emit({ type: 'questUpdate', title: q.name, done: false });
    };
    autoStart(view, c.quests).forEach(announceStart);
    const res = evaluateQuests(view, c.quests);
    autoStart(view, c.quests).forEach(announceStart);
    res.done.forEach((q) => {
      kit.kredi(q.kredi, 'gorev');
      syncFlag(q.id, 2);
      kit.banner('Görev tamamlandı: ' + q.name, '+' + q.kredi + ' Kredi', { kind: 'quest' });
      if (typeof G.sound === 'function') G.sound('quest');
      G.emit({ type: 'questUpdate', title: q.name, done: true });
      st.stats.quests++;
    });
    view = kit.metrics();
    const have = new Set(c.ach);
    const fresh = evaluateAchievements(view, have);
    fresh.forEach((a) => {
      if (c.ach.indexOf(a.id) >= 0 || c.ach.length >= 64) return;
      c.ach.push(a.id);
      if (a.kredi > 0) kit.kredi(a.kredi, 'basarim');
      G.emit({
        type: 'achievement', id: a.id, title: a.name, desc: a.desc,
      });
      if (typeof G.sound === 'function') G.sound('achievement');
      st.stats.ach++;
    });
    // araç boyası: garaj paneli kapanınca kozmetik değiştiyse
    detectPaint();
  }

  function detectPaint() {
    const c = kit.blob();
    if (!c || !c.garage || !Array.isArray(c.garage.owned)) return;
    let sig = '';
    for (let i = 0; i < c.garage.owned.length; i++) sig += JSON.stringify(c.garage.owned[i].cos || 0);
    if (G.ui === 'garage') {
      if (!st.garageOpen) {
        st.garageOpen = true;
        st.paintSnap = sig;
      }
      return;
    }
    if (st.garageOpen) {
      st.garageOpen = false;
      if (st.paintSnap && sig !== st.paintSnap) G.emit({ type: 'garagePaint' });
    }
  }

  /* ---------------------------------------------------------------------------- görünümler */
  function info() {
    const c = blob();
    const view = kit.metrics();
    const cat = kit.catalog();
    const ds = c.discovery;
    const aq = activeQuest(c.quests);
    const prog = aq ? questProgress(view, aq) : null;
    return {
      kredi: Number.isInteger(c.kredi) ? c.kredi : 0,
      day: dayN(),
      tracker: mm.tracker(),
      busy: mm.busy(),
      activeQuest: aq ? {
        id: aq.id, name: aq.name, hint: aq.hint, have: prog.have, need: prog.need,
      } : null,
      quests: questRows(view, c.quests),
      races: mm.raceRows(),
      achievements: achievementRows(view, c.ach),
      stats: {
        cityKm: Math.round(view.cityKm * 10) / 10,
        citySeconds: view.citySeconds,
        jobsDone: view.jobsDone,
        racesDone: view.racesDone,
        goldMedals: view.goldMedals,
        chipsFound: view.chipsFound,
        graffitiDone: view.graffitiDone,
        roomsFound: view.roomsFound,
        terminalsFound: view.terminalsFound,
        photosTaken: view.photosTaken,
        robotsDissolved: view.robotsDissolved,
        achievements: c.ach.length,
        earned: c.jobs.earned,
      },
      discovery: cat ? {
        chips: view.chipsFound,
        chipsTotal: cat.chips.length,
        graffiti: view.graffitiDone,
        graffitiTotal: cat.graffiti.length,
        rooms: view.roomsFound,
        roomsTotal: cat.rooms.length,
        terminals: view.terminalsFound,
        terminalsTotal: cat.terminals.length,
        sets: setStatus(cat, ds, kit.terminalMask()),
      } : null,
      claims: G.cityApi && typeof G.cityApi.view === 'function' ? G.cityApi.view() : null,
      version: mm.st.version,
    };
  }

  function journal() {
    const c = blob();
    const cat = kit.catalog();
    const view = kit.metrics();
    if (!cat) {
      return {
        chips: [], graffiti: [], rooms: [], story: [], races: [], jobs: { done: 0, earned: 0 }, stats: {}, vehicles: [],
      };
    }
    const ds = c.discovery;
    return {
      chips: journalChips(cat, ds),
      graffiti: journalGraffiti(cat, ds),
      rooms: journalRooms(cat, ds),
      story: journalStory(view.chipsFound),
      races: mm.raceRows().map((r) => ({
        id: r.id, name: r.name, medal: r.medal, best: r.bestText, done: r.done,
      })),
      jobs: { done: c.jobs.done, earned: c.jobs.earned },
      stats: { cityKm: view.cityKm, jobsDone: view.jobsDone, racesWon: view.racesWon, goldMedals: view.goldMedals },
      vehicles: c.garage && Array.isArray(c.garage.owned) ? c.garage.owned.map((o) => o.cls) : [],
      quests: questRows(view, c.quests).filter((q) => q.state !== 'locked' || q.title !== '???'),
      achievements: achievementRows(view, c.ach),
    };
  }

  /* ---------------------------------------------------------------------------- sistem */
  const system = {
    name: 'cityMissions',
    order: CITY_MISSIONS_ORDER,
    mm,
    st,

    init() {
      G.cityMissions.info = info;
      G.cityMissions.journal = journal;
      G.cityMissions.hud = st.hudMission;
      registerCommand('mis', 'mis | quest <id> | race <0-7> | job <kurye|taksi> | cancel | stat <anahtar> <n>', (g, a) => {
        const ok = (message, data) => ({ ok: true, message, data });
        const cmd = a && a[0] ? a[0] : '';
        if (!kit.inCity()) return { ok: false, message: "Görevler yalnız Neon Meridyen'de." };
        if (cmd === 'quest' && a[1]) {
          const r = startQuestApi(a[1]);
          return ok(r.msg || (r.ok ? 'Tamam.' : 'Olmadı.'), r);
        }
        if (cmd === 'race') {
          const r = mm.armRace(Number(a[1]) || 0);
          return ok(r.ok ? 'Yarış hazırlığı.' : r.message, r);
        }
        if (cmd === 'job') {
          st.boardQueued = a[1] === 'taksi' ? 'taksi' : 'kurye';
          return ok('Pano sıraya alındı.');
        }
        if (cmd === 'cancel') return ok('İptal.', mm.cancel('iptal'));
        if (cmd === 'stat' && a[1]) return ok(a[1] + ' = ' + statAdd(blob(), a[1], Number(a[2]) || 0));
        return ok('Etkin: ' + (mm.active() || 'yok'), { quests: blob().quests, stats: blob().stats });
      });
    },

    fixedUpdate(_G, dt) {
      if (!kit.inCity()) return;
      hookNpc();
      const blobNow = kit.ctx() ? kit.ctx().city : null;
      if (blobNow && st.cityRef !== blobNow) {
        // yükleme sonrası blob nesnesi değişir: etkin işi yeniden kur
        st.cityRef = blobNow;
        ensureCityState(blobNow);
        mm.restore();
      }
      const pos = kit.pos();
      stepCounters(dt, pos);
      mm.update(dt);
      if (st.boardQueued && G.ui === 'none' && !mm.busy() && !(G.cityNpc && G.cityNpc.state && G.cityNpc.state.ui)) {
        const k = st.boardQueued;
        st.boardQueued = '';
        const r = mm.openBoard(k);
        if (!r.ok && r.message) kit.say(r.message, 'mis:board');
      }
      st.acc += dt;
      if (st.acc >= SLOW_EVERY) {
        st.acc = 0;
        slowTick();
      }
      // etkin görev yokken hikâye görevi işareti
      st.markAcc += dt;
      if (st.markAcc >= 1.5) {
        st.markAcc = 0;
        if (!mm.busy()) {
          const q = activeQuest(blob().quests);
          const tg = q ? questTarget(kit.seed(), q, pos.x, pos.z) : null;
          mm.setMarker(tg, tg ? tg.label : '');
        }
      }
    },

    frameUpdate() {
      const hud = G.hud;
      if (!hud) return;
      if (!kit.inCity()) {
        if (hud.city && hud.city.mission) hud.city.mission = null;
        return;
      }
      if (hud.city) {
        const m = mm.hudMission(st.hudMission);
        if (m) hud.city.mission = m;
        else {
          const aq = activeQuest(blob().quests);
          if (aq) {
            const p = questProgress(kit.metrics(), aq);
            st.hudMission.title = aq.name;
            st.hudMission.sub = aq.hint + (aq.target > 1 ? ' (' + p.have + '/' + p.need + ')' : '');
            st.hudMission.dist = 0;
            st.hudMission.timeLeft = -1;
            hud.city.mission = st.hudMission;
          } else hud.city.mission = null;
        }
      }
    },

    onEvent(_G, evt) {
      if (!evt || typeof evt.type !== 'string' || !kit.inCity()) return;
      const c = kit.blob();
      if (c) {
        const r = reduceEvent(c, evt, { ownerIds: OWNER_IDS });
        if (r.notes.length > 0) kit.discover('Dükkân sahibiyle tanıştın');
      }
      switch (evt.type) {
        case 'death':
          if (mm.busy()) {
            mm.cancel('olum', true);
            kit.say('Görev yarıda kaldı. İstediğin zaman yenisini alabilirsin.', 'mis:death');
          }
          break;
        case 'bump':
          if (evt.soft !== true) mm.notify('bump', { impact: evt.impact });
          break;
        case 'uiChanged':
          if (mm.st.board && G.ui !== 'dialogue') {
            mm.st.board = null;
            mm.st.version++;
          }
          break;
        case 'photo':
        case 'photoTaken':
        case 'photoCaptured':
          mm.notify('photo');
          break;
        case 'vehicleEnter':
        case 'vehicleExit':
          mm.onVehicleChange();
          break;
        default:
          break;
      }
    },

    beforeDimension(_G, from) {
      const id = from && from.id ? from.id : from;
      if (id === 'neon') mm.leaveCity();
    },

    onDimension(_G, _from, to) {
      const toId = typeof to === 'string' ? to : (to && to.id) || 'overworld';
      st.last.valid = false;
      st.cityRef = null;
      mm.st.board = null;
      if (toId !== 'neon') {
        const hud = G.hud;
        if (hud && hud.city) hud.city.mission = null;
      }
    },

    api() {
      return {
        getMissionInfo: () => (kit.inCity() ? info() : null),
        getMissionTracker: () => (kit.inCity() ? mm.tracker() : null),
        getBoard: () => (kit.inCity() ? mm.boardView() : null),
        acceptJob: (id) => (kit.inCity() ? mm.acceptFromBoard(id) : { ok: false, reason: 'boyut', message: 'Şehirde değilsin.' }),
        closeBoard: () => mm.closeBoard(),
        startRace: (id) => (kit.inCity() ? mm.armRace(id | 0) : { ok: false, reason: 'boyut', message: 'Şehirde değilsin.' }),
        abandonMission: () => (mm.busy() ? mm.cancel('iptal') : { ok: false, reason: 'yok', message: 'Etkin görev yok.' }),
        getCityJournal: () => (kit.inCity() ? journal() : null),
      };
    },

    dispose() {
      mm.leaveCity();
      G.cityMissions = null;
      G.driveMarker = null;
    },
  };
  return system;
}

export default createSystem;
