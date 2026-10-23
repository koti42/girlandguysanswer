/*
 * KEŞİF — görev yöneticisi (discovery_missions): etkin iş/yarış, hazırlık-geri sayım, sonuç kartı, işaret, kayıt anlık görüntüsü ve geri yükleme.
 * Saf mantık sim/city/mission/* içindedir (run, jobs, races, medals, results); burası motor G'ye bağlanır. cityMissions sistemi çağırır.
 *
 *   createMissionManager(G, kit) → mm
 *   mm.active() → 'job' | 'race' | '' · mm.busy() → bool (hızlı seyahat/foto görevde kapalı)
 *   mm.startJob(job) / mm.armRace(id) / mm.cancel(reason, silent) → {ok, reason?, message?}
 *   mm.update(dt) · mm.tracker() → görünüm | null · mm.hudMission(out) → {title, sub, dist, timeLeft} | null · mm.notify(name, data) · mm.onVehicleChange()
 *   mm.persist() · mm.restore() · mm.leaveCity() · mm.openBoard(kind) / mm.closeBoard() / mm.boardView() · mm.offers(kind) · mm.result
 *   Aile dostu: başarısızlıkta yalnız yeniden deneme önerilir; yolcu/paket zarar görmez; yarışta rakip/ceza yok.
 */
import { getCityPlan, pois } from '../sim/city/cityPlan.js';
import { roadNet } from '../sim/city/roadNet.js';
import { districtDisplay } from '../sim/city/cityHudData.js';
import { VEHICLE_DEFS, isVehicleClass } from '../sim/city/vehicle/vehicleData.js';
import { FAIL_TEXT, RUN_STATUS, createRun, restoreRun } from '../sim/city/mission/run.js';
import {
  TIERS, canWalk, genJobs, jobLimitFor, jobRunDef, parseJobId, repeatDecay,
} from '../sim/city/mission/jobs.js';
import {
  COUNTDOWN, STAGE_R, raceListRow, raceName, raceRunDef, stagingState,
} from '../sim/city/mission/races.js';
import { nextTarget, raceMedals } from '../sim/city/mission/medals.js';
import { applyJobResult, applyRaceResult } from '../sim/city/mission/results.js';
import { fmtClock, fmtDist, fmtTime, MEDAL_NAMES } from '../sim/city/mission/missionData.js';
import { statGet } from '../sim/city/cityState.js';

const SNAP_EVERY = 2;
const RESULT_SEC = 12;
const LEAVE_GRACE = 25;
const wrapPi = (a) => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};

export function createMissionManager(G, kit) {
  const st = {
    run: null,
    kind: '', // 'job' | 'race'
    stage: 'idle', // idle | staging | countdown | running
    job: null,
    race: null,
    medals: null,
    cls: '',
    stg: { t: 0, wasNear: false },
    cd: 0,
    result: null,
    resultAt: -99,
    snapAcc: 0,
    offFoot: 0,
    board: null,
    pendingBoard: null,
    near: null,
    markerSet: false,
    version: 0,
    cityRef: null,
    deskDist: 0,
    lastGateSay: 0,
    passengerOn: false,
    view: {},
    ctxIn: {
      x: 0, y: 0, z: 0, speed: 0, cls: null,
    },
    fails: 0,
  };
  const mm = { st };

  const now = () => (G.time ? G.time.seconds : 0);
  const secs = () => statGet(kit.blob(), 'citySeconds');
  const reduced = () => !!(G.reducedMotion || G.accessibility);

  function netPlan() {
    const s = kit.seed();
    return s === -1 ? null : { net: roadNet(s), plan: getCityPlan(s), seed: s };
  }

  function setMarker(t, label) {
    if (t) {
      G.driveMarker = { x: t.x, z: t.z, label: label || '' };
      st.markerSet = true;
    } else if (st.markerSet) {
      G.driveMarker = null;
      st.markerSet = false;
    }
  }

  function bump() {
    st.version++;
  }

  function clearActive() {
    st.run = null;
    st.kind = '';
    st.stage = 'idle';
    st.job = null;
    st.race = null;
    st.medals = null;
    st.passengerOn = false;
    st.offFoot = 0;
    setMarker(null);
    const c = kit.blob();
    if (c) c.mission = null;
    bump();
  }

  function setResult(r) {
    st.result = r;
    st.resultAt = now();
    bump();
  }

  /* ------------------------------------------------------------------------------------ iş */
  function startJob(job) {
    if (!job) return { ok: false, reason: 'yok', message: 'İş bulunamadı.' };
    if (st.kind) return { ok: false, reason: 'meşgul', message: 'Önce şu anki görevini bitir ya da bırak.' };
    const pos = kit.pos();
    if (!canWalk(job) && !pos.driving) return { ok: false, reason: 'arac', message: 'Bu iş için bir araca binmelisin.' };
    if (job.kind === 'taksi' && (!pos.driving || (VEHICLE_DEFS[pos.cls] && VEHICLE_DEFS[pos.cls].seats < 2))) {
      return { ok: false, reason: 'koltuk', message: 'Yolcu almak için en az 2 koltuklu bir araç gerek.' };
    }
    const acc = kit.accessible();
    const def = jobRunDef(job, pos.driving ? pos.cls : null);
    const run = createRun(def, { radiusScale: acc ? 2 : 1, timeScale: acc ? 2 : 1 });
    run.start();
    st.run = run;
    st.kind = 'job';
    st.stage = 'running';
    st.job = job;
    st.cls = pos.driving ? pos.cls : '';
    st.result = null;
    st.snapAcc = 0;
    st.offFoot = 0;
    const c = kit.blob();
    if (c) c.mission = snapshot();
    const first = def.steps[0];
    setMarker(first, first.label);
    kit.say('Görev başladı: ' + def.title + '. ' + first.label + '.', 'mis:start');
    G.emit({ type: 'jobAccepted', id: job.id, kind: job.kind });
    bump();
    return { ok: true, id: job.id };
  }

  function snapshot() {
    const j = st.job;
    if (!st.run || !j) return null;
    const p = parseJobId(j.id);
    return {
      k: 'job', id: j.id, c: st.cls || '', n: p && p.near && st.near ? [Math.round(st.near.x), Math.round(st.near.z)] : null, r: st.run.snapshot(),
    };
  }

  function finishJob(ev) {
    const j = st.job;
    const run = st.run;
    const c = kit.blob();
    if (!j || !run || !c) return;
    const r = applyJobResult(c, j, {
      t: run.t, limit: run.limit, bumps: run.bumps, nowSec: secs(),
    });
    kit.kredi(r.kredi, 'is');
    const given = [];
    r.items.forEach((it) => { if (kit.give(it.item, it.n) > 0) given.push(it); });
    const lines = ['Süre: ' + fmtTime(run.t), 'Ödül: +' + r.kredi + ' Kredi'];
    if (r.decay < 1) lines.push('Art arda iş: ödül %' + Math.round(r.decay * 100));
    if (j.kind === 'taksi' && run.bumps > 0) lines.push('Yolculuk sarsıntılıydı: bahşiş azaldı.');
    if (given.length) lines.push('Malzeme: ' + given.map((g) => g.n + '× parça').join(', '));
    setResult({
      type: 'job', ok: true, title: j.kind === 'taksi' ? 'Yolcu bırakıldı' : j.kind === 'tamir' ? 'Parça teslim edildi' : 'Teslimat tamam', lines, kredi: r.kredi, medal: 0, time: run.t,
    });
    kit.banner(st.result.title + '!', '+' + r.kredi + ' Kredi', { kind: 'reward' });
    if (typeof G.sound === 'function') G.sound('quest');
    G.emit({ type: 'jobDone', id: j.id, kind: j.kind, kredi: r.kredi, time: run.t });
    clearActive();
    void ev;
  }

  function failJob(reason) {
    const text = FAIL_TEXT[reason] || 'Görev bitti.';
    setResult({
      type: 'job', ok: false, title: 'Görev tamamlanamadı', lines: [text, 'Bir daha dene: kurye masasından yeni iş al.'], kredi: 0, medal: 0, time: st.run ? st.run.t : 0,
    });
    kit.say(text, 'mis:fail');
    clearActive();
  }

  /* ------------------------------------------------------------------------------------ yarış */
  function armRace(id) {
    if (st.kind) return { ok: false, reason: 'meşgul', message: 'Önce şu anki görevini bitir ya da bırak.' };
    const np = netPlan();
    if (!np || !Number.isInteger(id) || id < 0 || id >= np.plan.races.length) return { ok: false, reason: 'yok', message: 'Yarış bulunamadı.' };
    const pos = kit.pos();
    if (!pos.driving) return { ok: false, reason: 'arac', message: 'Yarış için bir araca bin.' };
    const race = np.plan.races[id];
    st.race = race;
    st.kind = 'race';
    st.stage = 'staging';
    st.cls = pos.cls;
    st.medals = raceMedals(np.net, race, pos.cls);
    st.stg = { t: 0, wasNear: false };
    st.run = null;
    st.result = null;
    st.offFoot = 0;
    setMarker(race.gates[0], raceName(id) + ' başlangıcı');
    kit.say(raceName(id) + ': başlangıç kapısına git ve dur.', 'mis:race');
    bump();
    return { ok: true, id };
  }

  function startRaceRun() {
    const np = netPlan();
    if (!np || !st.race || !st.medals) return;
    const def = raceRunDef(st.race, st.cls, st.medals);
    const acc = kit.accessible();
    // erişilebilirlik: kapı yarıçapı ×2 (süre sınırı yarışta uzatılmaz; altın eşiği değişmez)
    const run = createRun(def, { radiusScale: acc ? 2 : 1 });
    run.start();
    st.run = run;
    st.stage = 'running';
    st.cd = 0;
    const g = def.steps[0].gates[0];
    setMarker(g, 'Kapı 1');
    kit.banner('Başla!', raceName(st.race.id), { kind: 'info', duration: 1600 });
    G.emit({ type: 'raceStart', id: st.race.id, cls: st.cls });
    bump();
  }

  function finishRace() {
    const run = st.run;
    const race = st.race;
    const c = kit.blob();
    if (!run || !race || !c) return;
    const r = applyRaceResult(c, race.id, st.cls, run.t, st.medals);
    if (!r.valid) {
      setResult({
        type: 'race', ok: false, title: raceName(race.id), lines: ['Süre geçersiz sayıldı; yarış kaydedilmedi.', 'Kapıları sırayla ve sürerek geç.'], kredi: 0, medal: 0, time: run.t,
      });
      kit.say('Süre geçersiz sayıldı.', 'mis:race');
      clearActive();
      return;
    }
    kit.kredi(r.kredi, 'yaris');
    const lines = ['Süre: ' + fmtTime(run.t), 'Madalya: ' + MEDAL_NAMES[r.medal]];
    if (r.best) lines.push('En iyi sürenin: ' + fmtTime(r.bestTime));
    const nx = nextTarget(run.t, st.medals);
    if (nx) lines.push('Sonraki: ' + MEDAL_NAMES[nx.medal] + ' için ' + fmtTime(nx.time));
    if (r.kredi > 0) lines.push('Ödül: +' + r.kredi + ' Kredi');
    setResult({
      type: 'race', ok: true, title: raceName(race.id), lines, kredi: r.kredi, medal: r.medal, time: run.t,
    });
    kit.banner(raceName(race.id) + ': ' + (r.medal > 0 ? MEDAL_NAMES[r.medal] + ' madalya!' : 'bitti'), fmtTime(run.t) + (r.kredi ? ' · +' + r.kredi + ' Kredi' : ''), { kind: 'reward' });
    if (typeof G.sound === 'function') G.sound(r.medal === 3 ? 'achievement' : 'quest');
    G.emit({
      type: 'raceDone', id: race.id, cls: st.cls, medal: r.medal, time: run.t,
    });
    clearActive();
  }

  /* ------------------------------------------------------------------------------------ döngü */
  function handle(ev) {
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.type === 'gate' && st.kind === 'race') {
        if (typeof G.sound === 'function' && now() - st.lastGateSay > 0.05) G.sound('pickup', undefined, { vol: 0.4 });
        st.lastGateSay = now();
        const gs = st.run.def.steps[0].gates;
        const nxt = gs[(e.passed) % gs.length];
        if (e.passed < e.total) setMarker(nxt, 'Kapı ' + (e.passed + 1));
        G.emit({ type: 'raceCheckpoint', id: st.race.id, passed: e.passed, total: e.total });
      } else if (e.type === 'step' && st.kind === 'job') {
        const j = st.job;
        const steps = st.run.def.steps;
        const nx = steps[e.next];
        if (nx) {
          setMarker(nx, nx.label);
          if (j.kind === 'taksi') {
            st.passengerOn = true;
            kit.say('Yolcu bindi. Gideceği yere götür, sakin sür.', 'mis:pick');
          } else if (j.kind === 'pod') kit.say(e.index === 0 ? 'Kapsüller yüklendi. İlk durağa git.' : 'Kapsül bırakıldı (' + e.index + '/3).', 'mis:pod');
          else if (j.kind === 'tamir') kit.say('Yedek parça alındı. Tamirciye götür.', 'mis:fix');
          else kit.say('Paket alındı! Teslim noktasına git.', 'mis:parcel');
          if (typeof G.sound === 'function') G.sound('pickup');
        }
      } else if (e.type === 'done') {
        if (st.kind === 'job') finishJob(e);
        else if (st.kind === 'race') finishRace();
      } else if (e.type === 'failed') {
        if (st.kind === 'job') failJob(e.reason);
        else if (st.kind === 'race') {
          setResult({
            type: 'race', ok: false, title: raceName(st.race.id), lines: [FAIL_TEXT[e.reason] || 'Yarış bitti.', 'Bir daha dene!'], kredi: 0, medal: 0, time: e.time || 0,
          });
          kit.say(FAIL_TEXT[e.reason] || 'Yarış bitti.', 'mis:race');
          clearActive();
        }
      } else if (e.type === 'cancelled') {
        const text = FAIL_TEXT[e.reason] || 'Görev iptal oldu.';
        if (e.reason !== 'iptal') kit.say(text, 'mis:cancel');
        clearActive();
      }
    }
  }

  function update(dt) {
    if (!st.kind) return;
    const pos = kit.pos();
    const ci = st.ctxIn;
    ci.x = pos.x; ci.y = pos.y; ci.z = pos.z; ci.speed = pos.speed; ci.cls = pos.driving ? pos.cls : null;
    if (st.stage === 'staging' || st.stage === 'countdown') {
      if (!pos.driving) {
        st.offFoot += dt;
        if (st.offFoot > LEAVE_GRACE) {
          kit.say('Araçtan indiğin için yarış hazırlığı bitti.', 'mis:race');
          clearActive();
        }
        return;
      }
      st.offFoot = 0;
      if (pos.cls !== st.cls) {
        const np = netPlan();
        st.cls = pos.cls;
        if (np) st.medals = raceMedals(np.net, st.race, pos.cls);
        st.stg.t = 0;
      }
      const s = stagingState(st.race, pos, pos.speed, st.stg, dt);
      if (s === 'basla') startRaceRun();
      else if (s === 'geri_sayim') {
        const left = Math.ceil(COUNTDOWN - st.stg.t);
        if (st.stage !== 'countdown' || left !== st.cd) {
          st.cd = left;
          st.stage = 'countdown';
          if (typeof G.hint === 'function') G.hint(String(left), { ttl: 900, priority: 6, key: 'mis:cd', cooldown: 0 });
          if (typeof G.speak === 'function') G.speak(String(left));
          bump();
        }
      } else if (st.stage === 'countdown') {
        st.stage = 'staging';
        st.cd = 0;
        bump();
      }
      return;
    }
    if (!st.run) return;
    if (st.kind === 'job' && st.job && st.job.kind === 'taksi' && st.passengerOn && !pos.driving) {
      st.offFoot += dt;
      if (st.offFoot > LEAVE_GRACE) {
        failJob('arac_yok');
        return;
      }
    } else st.offFoot = 0;
    handle(st.run.update(dt, ci));
    if (st.kind) {
      st.snapAcc += dt;
      if (st.snapAcc >= SNAP_EVERY) {
        st.snapAcc = 0;
        persist();
      }
    }
  }

  function persist() {
    const c = kit.blob();
    if (!c) return;
    c.mission = st.kind === 'job' ? snapshot() : null;
  }

  function cancel(reason, silent) {
    if (!st.kind) return { ok: false, reason: 'yok', message: 'Etkin görev yok.' };
    if (st.run && st.run.status === RUN_STATUS.ACTIVE) st.run.cancel(reason || 'iptal');
    const id = st.job ? st.job.id : st.race ? 'race_' + st.race.id : '';
    clearActive();
    if (!silent) kit.say('Görevi bıraktın. İstediğin zaman yenisini alabilirsin.', 'mis:cancel');
    G.emit({ type: 'missionCancelled', id });
    return { ok: true };
  }

  function notify(name, data) {
    if (st.run && st.run.status === RUN_STATUS.ACTIVE) handle(st.run.notify(name, data));
  }

  function onVehicleChange() {
    // sürülen araç değişti: yarış sırasında koşucu kendisi iptal eder (def.cls); iş için yalnız bilgilendirme
  }

  function restore() {
    const c = kit.blob();
    if (!c || !c.mission || st.kind) return false;
    const m = c.mission;
    const np = netPlan();
    if (!np || m.k !== 'job') {
      c.mission = null;
      return false;
    }
    const p = parseJobId(m.id);
    if (!p) {
      c.mission = null;
      return false;
    }
    const near = m.n ? { x: m.n[0], z: m.n[1] } : null;
    const offers = genJobs(np.seed, np.net, p.board, p.day, p.desk, near);
    const job = offers.find((o) => o.id === m.id);
    if (!job) {
      c.mission = null;
      return false;
    }
    const cls = isVehicleClass(m.c) ? m.c : null;
    const def = jobRunDef(job, cls);
    const acc = kit.accessible();
    const run = restoreRun(def, m.r, { radiusScale: acc ? 2 : 1, timeScale: acc ? 2 : 1 });
    if (!run) {
      c.mission = null;
      return false;
    }
    st.run = run;
    st.kind = 'job';
    st.stage = 'running';
    st.job = job;
    st.cls = cls || '';
    st.near = near;
    st.passengerOn = job.kind === 'taksi' && run.step > 0;
    const s = def.steps[Math.min(run.step, def.steps.length - 1)];
    setMarker(s, s.label);
    kit.say('Görevine devam: ' + def.title + '.', 'mis:resume');
    bump();
    return true;
  }

  function leaveCity() {
    // şehirden ayrılırken iş anlık görüntüsü kayıtta kalır (geri dönüşte sürer); yarış hazırlığı/koşusu sessizce iptal
    if (!st.kind) return;
    if (st.kind === 'job') {
      persist();
      st.run = null;
      st.kind = '';
      st.stage = 'idle';
      st.job = null;
      setMarker(null);
    } else {
      cancel('iptal', true);
    }
    bump();
  }

  /* ------------------------------------------------------------------------------------ pano */
  function offers(kind) {
    const np = netPlan();
    if (!np) return [];
    const pos = kit.pos();
    const dayN = Math.floor(statGet(kit.blob(), 'citySeconds') / 1200);
    let deskIdx = 0;
    let near = null;
    if (kind === 'kurye') {
      const desks = deskList(np.seed);
      let bd = Infinity;
      for (let i = 0; i < desks.length; i++) {
        const d = Math.hypot(desks[i].x - pos.x, desks[i].z - pos.z);
        if (d < bd) {
          bd = d;
          deskIdx = i;
        }
      }
      st.deskDist = bd;
    } else {
      near = { x: pos.x, z: pos.z };
      st.near = near;
    }
    return genJobs(np.seed, np.net, kind, dayN, deskIdx, near);
  }

  let deskCache = { seed: -1, list: [] };
  function deskList(seed) {
    if (deskCache.seed === seed) return deskCache.list;
    // courier_desk POI sırası genJobs ile aynı (cityPois sırası)
    const l = pois(seed).filter((p) => p.type === 'courier_desk');
    deskCache = { seed, list: l };
    return l;
  }

  function openBoard(kind) {
    if (st.kind) return { ok: false, reason: 'meşgul', message: 'Önce şu anki görevini bitir ya da bırak.' };
    if (kind !== 'kurye' && kind !== 'taksi') return { ok: false, reason: 'yok' };
    if (typeof G.setUi !== 'function' || G.ui !== 'none') return { ok: false, reason: 'ui' };
    st.board = { kind, msg: '' };
    G.setUi('dialogue');
    if (G.ui !== 'dialogue') {
      st.board = null;
      return { ok: false, reason: 'ui' };
    }
    bump();
    return { ok: true };
  }

  function closeBoard() {
    if (!st.board) return false;
    st.board = null;
    if (G.ui === 'dialogue' && typeof G.setUi === 'function') G.setUi('none');
    bump();
    return true;
  }

  function boardView() {
    if (!st.board) return null;
    const kind = st.board.kind;
    const pos = kit.pos();
    const list = offers(kind);
    const cls = pos.driving ? pos.cls : null;
    const c = kit.blob();
    const decay = c ? repeatDecay(c.jobs.log, secs()) : 1;
    return {
      type: 'board',
      kind,
      title: kind === 'taksi' ? 'Taksi Durağı' : 'Kurye Panosu',
      subtitle: kind === 'taksi' ? 'Yolcu bekleyenler' : 'Bugünün işleri',
      driving: pos.driving,
      cls: cls || '',
      decay,
      msg: st.board.msg || '',
      offers: list.map((j) => {
        const need = !canWalk(j) && !pos.driving ? 'Araç gerekli' : j.kind === 'taksi' && (!pos.driving || (VEHICLE_DEFS[pos.cls] && VEHICLE_DEFS[pos.cls].seats < 2)) ? '2+ koltuklu araç gerekli' : '';
        const tier = TIERS.find((t) => t.key === j.tier) || TIERS[0];
        return {
          id: j.id,
          kind: j.kind,
          tier: j.tier,
          tierName: tier.name,
          name: j.name,
          dist: Math.round(j.dist),
          distText: fmtDist(j.dist),
          limit: jobLimitFor(j, cls),
          limitText: jobLimitFor(j, cls) > 0 ? fmtClock(jobLimitFor(j, cls)) : 'süresiz',
          reward: Math.max(1, Math.round(j.base * decay)),
          fragile: j.fragile,
          canWalk: canWalk(j),
          stops: j.stops ? 3 : 0,
          fromText: districtDisplay(distOf(j.from)),
          toText: districtDisplay(distOf(j.to)),
          available: need === '',
          why: need,
        };
      }),
      version: st.version,
    };
  }

  function distOf(p) {
    const np = netPlan();
    try {
      return np ? np.plan.districts.districtAt(p.x, p.z) : 'merkez';
    } catch {
      return 'merkez';
    }
  }

  function acceptFromBoard(id) {
    if (!st.board) return { ok: false, reason: 'yok', message: 'Pano kapalı.' };
    const list = offers(st.board.kind);
    const job = list.find((j) => j.id === id);
    if (!job) return { ok: false, reason: 'yok', message: 'Bu iş artık yok.' };
    const r = startJob(job);
    if (!r.ok) {
      st.board.msg = r.message;
      bump();
      return r;
    }
    closeBoard();
    return r;
  }

  /* ------------------------------------------------------------------------------------ görünümler */
  function tracker() {
    const v = st.view;
    const t = now();
    const hasResult = !!st.result && t - st.resultAt < RESULT_SEC;
    if (!st.kind) {
      v.kind = hasResult ? 'result' : '';
      v.result = hasResult ? st.result : null;
      v.version = st.version;
      return hasResult ? v : null;
    }
    const pos = kit.pos();
    v.version = st.version;
    v.kind = st.kind;
    v.stage = st.stage;
    v.result = hasResult ? st.result : null;
    v.countdown = st.stage === 'countdown' ? st.cd : 0;
    v.hint = '';
    if (st.stage === 'staging' || st.stage === 'countdown') {
      const g = st.race.gates[0];
      const d = Math.hypot(g.x - pos.x, g.z - pos.z);
      v.title = raceName(st.race.id);
      v.label = d > STAGE_R ? 'Başlangıç kapısına git' : pos.speed > 3 ? 'Yavaşla ve dur' : 'Hazır ol…';
      v.dist = Math.round(d);
      v.timeLeft = -1;
      v.t = 0;
      v.gate = 0;
      v.gates = 0;
      v.target = { x: g.x, z: g.z };
      v.targets = st.medals ? { gold: st.medals.gold, silver: st.medals.silver, bronze: st.medals.bronze } : null;
    } else if (st.run) {
      const rv = st.run.view();
      v.title = rv.title;
      v.label = rv.label;
      v.dist = rv.dist;
      v.timeLeft = rv.timeLeft;
      v.t = rv.t;
      v.gate = rv.gate;
      v.gates = rv.gates;
      v.target = rv.target ? { x: rv.target.x, z: rv.target.z } : null;
      v.targets = st.kind === 'race' && st.medals ? { gold: st.medals.gold, silver: st.medals.silver, bronze: st.medals.bronze } : null;
    }
    if (v.target) {
      const dx = v.target.x - pos.x;
      const dz = v.target.z - pos.z;
      v.bearing = wrapPi(Math.atan2(-dx, -dz) - pos.yaw);
    } else v.bearing = 0;
    v.cancellable = true;
    return v;
  }

  function hudMission(out) {
    if (!st.kind) return null;
    const v = tracker();
    if (!v || !v.title) return null;
    const o = out || {};
    o.title = v.title;
    o.sub = st.kind === 'race' && st.stage === 'running' ? (v.gates ? 'Kapı ' + Math.min(v.gate + 1, v.gates) + '/' + v.gates + ' · ' + fmtTime(v.t) : fmtTime(v.t)) : v.label || '';
    o.dist = v.dist || 0;
    o.timeLeft = v.timeLeft;
    return o;
  }

  function raceRows() {
    const np = netPlan();
    if (!np) return [];
    const c = kit.blob();
    const pos = kit.pos();
    const cls = pos.driving ? pos.cls : 'taksi';
    return np.plan.races.map((r) => raceListRow(r, c, cls, raceMedals(np.net, r, cls)));
  }

  Object.assign(mm, {
    active: () => st.kind,
    busy: () => !!st.kind,
    startJob,
    armRace,
    cancel,
    update,
    tracker,
    hudMission,
    notify,
    onVehicleChange,
    persist,
    restore,
    leaveCity,
    openBoard,
    closeBoard,
    boardView,
    acceptFromBoard,
    offers,
    raceRows,
    setMarker,
    deskList,
    get result() {
      return st.result;
    },
    reduced,
  });
  return mm;
}
