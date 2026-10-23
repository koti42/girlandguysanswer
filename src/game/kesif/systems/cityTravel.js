/*
 * KEŞİF — HIZLI SEYAHAT makinesi (photo_map, Neon Meridyen Faz 4). systems/cityPhoto.js kurar. Kurallar sim/city/map/fastTravel.js'te; burada motora bağlanır.
 *
 * Akış (geçiş makinesiyle AYNI güvenlik araçları: G.simFrozen, G.transitionActive, postfx fade, hud.dimLoading, chunkManager hazırlığı):
 *   start(id) → kural denetimi → Kredi (FAST_TRAVEL.cost) peşin → [out: karartma] → ışınlan → [hold: parçalar hazır (≥ 49 sütun) + en az 3 sn toplam] → [in: açılma]
 *   Kısıtlı hareket/erişilebilirlik: tek 0,4 sn karartma (≤ 3 Hz, sarsıntı yok). Parça yükleme 6 sn ilerlemezse (ya da 25 sn dolarsa) başlangıç noktasına döner + Kredi iade (takılı kalma YOK).
 *   Uyumsuz durumlar (ölüm, boyut değişimi, destroy) → cancel(): bayraklar/fade/yükleme temizlenir; ışınlanmadan iptalde iade.
 *
 *   createTraveler(G, kit, deps) → tv
 *      deps {lockedRoom() → bool (kilitli iç mekân odasında mı)}
 *      tv.info() → {enabled, cost, cooldown, busy, here, kredi, nodes:[{id, kind, index, name, x, z, dist, ok, reason, message}]}
 *      tv.start(id) → {ok, reason, message, node?}      tv.update(dt)      tv.cancel(why)      tv.cooldownLeft      tv.state
 */
import {
  FAST_TRAVEL, METRO_FOOT_Y, dangerNow, travelNodes, travelRules,
} from '../sim/city/map/fastTravel.js';

const ease = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
const OUT = 0.6;
const IN = 0.6;
const MIN_TOTAL = FAST_TRAVEL.blackout;
const R_OUT = 0.15;
const R_IN = 0.15;
const R_MIN = FAST_TRAVEL.blackoutReduced;
const LOADING_AFTER = 0.6;
const HERE_R = 14;

export function createTraveler(G, kit, deps) {
  const d = deps || {};
  const st = {
    phase: 'idle',
    t: 0,
    total: 0,
    holdT: 0,
    stallT: 0,
    lastProg: -1,
    frames: 0,
    node: null,
    origin: null,
    paid: 0,
    teleported: false,
    cooldown: 0,
    count: 0,
    reduced: false,
    loadingShown: false,
    aborted: 0,
    refunds: 0,
    last: null,
    lockMemo: { at: -9, v: false },
    clockT: 0,
  };

  const reducedNow = () => !!(G.reducedMotion || G.accessibility);

  function setFade(v) {
    if (G.postfx && typeof G.postfx.setEffects === 'function') G.postfx.setEffects({ fade: v });
  }

  function setLoading(on, progress) {
    if (on) G.dimLoading = { active: true, progress: Math.max(0, Math.min(1, progress)), label: 'Hızlı seyahat…' };
    else if (G.dimLoading) G.dimLoading = { active: false, progress: 1, label: '' };
    if (G.hud) G.hud.dimLoading = G.dimLoading || null;
    st.loadingShown = on;
  }

  function lockedRoomNow() {
    if (st.clockT - st.lockMemo.at < 0.5) return st.lockMemo.v;
    st.lockMemo.at = st.clockT;
    let v = false;
    try {
      v = typeof d.lockedRoom === 'function' ? !!d.lockedRoom() : false;
    } catch {
      v = false;
    }
    st.lockMemo.v = v;
    return v;
  }

  function baseCtx() {
    const pos = kit.pos();
    return {
      pos,
      inCity: kit.inCity(),
      dead: !!(G.player && G.player.dead),
      transition: st.phase !== 'idle' || !!(G.transition && G.transition.active) || (G.transitionActive === true && st.phase === 'idle'),
      ui: G.ui,
      mission: !!(G.cityMissions && typeof G.cityMissions.busy === 'function' && G.cityMissions.busy()),
      driving: !!pos.driving || !!(G.player && G.player.vehicle),
      danger: dangerNow({
        combat: G.combatLevel, hurtFlash: G.survival ? G.survival.hurtFlash : 0, boss: !!(G.hud && G.hud.boss),
      }),
      lockedInterior: kit.inCity() ? lockedRoomNow() : false,
      cooldown: st.cooldown,
      kredi: kit.wallet.get(),
    };
  }

  function listNodes() {
    if (!kit.inCity()) return [];
    return travelNodes(kit.seed(), kit.terminalMask(), kit.blob() ? (kit.blob().stats.mmask | 0) : 0);
  }

  function evaluate(node, base, found) {
    const dist = Math.hypot(node.x - base.pos.x, node.z - base.pos.z);
    const r = travelRules({
      node, found, inCity: base.inCity, dead: base.dead, transition: base.transition, ui: base.ui, mission: base.mission, driving: base.driving, danger: base.danger,
      lockedInterior: base.lockedInterior, cooldown: base.cooldown, kredi: base.kredi, dist,
    });
    return { dist, rule: r };
  }

  function info() {
    const inCity = kit.inCity();
    if (!inCity) {
      return {
        enabled: false, cost: FAST_TRAVEL.cost, cooldown: 0, busy: false, here: '', kredi: 0, nodes: [],
      };
    }
    const base = baseCtx();
    const nodes = listNodes();
    let here = '';
    let hd = HERE_R;
    const out = nodes.map((n) => {
      const e = evaluate(n, base, true);
      if (e.dist < hd) {
        hd = e.dist;
        here = n.id;
      }
      return {
        id: n.id, kind: n.kind, index: n.index, name: n.name, x: n.x, z: n.z, dist: Math.round(e.dist), ok: e.rule.ok, reason: e.rule.reason, message: e.rule.message,
      };
    });
    return {
      enabled: true,
      cost: FAST_TRAVEL.cost,
      cooldown: Math.ceil(st.cooldown),
      busy: st.phase !== 'idle',
      here,
      kredi: base.kredi,
      nodes: out,
    };
  }

  function start(id) {
    if (st.phase !== 'idle') return { ok: false, reason: 'gecis', message: 'Hızlı seyahat sürüyor.' };
    if (!kit.inCity()) return travelRules({ node: { id }, found: true, inCity: false });
    const nodes = listNodes();
    const node = nodes.find((n) => n.id === id) || null;
    const base = baseCtx();
    const e = node ? evaluate(node, base, true) : { dist: 0, rule: travelRules({ node: null, found: false }) };
    if (!e.rule.ok) return e.rule;
    if (!kit.wallet.spend(FAST_TRAVEL.cost, 'seyahat')) return travelRules({ node, found: true, inCity: true, kredi: 0, dist: 1e9 });
    st.paid = FAST_TRAVEL.cost;
    st.node = node;
    st.origin = {
      x: base.pos.x, y: base.pos.y, z: base.pos.z, yaw: G.player ? G.player.yaw : 0,
    };
    st.teleported = false;
    st.reduced = reducedNow();
    st.t = 0;
    st.total = 0;
    st.holdT = 0;
    st.stallT = 0;
    st.lastProg = -1;
    st.frames = 0;
    st.phase = 'out';
    if (G.ui !== 'none' && typeof G.setUi === 'function') G.setUi('none');
    hold();
    if (G.input && typeof G.input.releaseAll === 'function') G.input.releaseAll();
    if (typeof G.sound === 'function') G.sound('dim:charge', undefined, { vol: 0.6 });
    if (typeof G.speak === 'function' && (G.accessibility || st.reduced)) G.speak('Hızlı seyahat: ' + node.name + '.');
    G.emit({ type: 'fastTravelStart', to: node.id });
    return { ok: true, reason: 'tamam', message: node.name + ' noktasına gidiliyor.', node };
  }

  function teleportTo(x, y, z, yaw, maxR) {
    if (typeof G.teleport === 'function') G.teleport(x, y, z, { yaw, maxR });
  }

  function doTeleport() {
    const n = st.node;
    st.teleported = true;
    if (n.kind === 'terminal' && G.dimMgr && typeof G.dimMgr.arrivalFor === 'function') {
      let a = null;
      try {
        a = G.dimMgr.arrivalFor('neon', { terminal: n.index });
      } catch {
        a = null;
      }
      if (a && Number.isFinite(a.x)) {
        teleportTo(a.x, a.y, a.z, a.yaw, 12);
        return;
      }
    }
    teleportTo(n.x, n.kind === 'metro' ? METRO_FOOT_Y : n.y, n.z, n.yaw, n.kind === 'metro' ? 14 : 10);
  }

  function reset() {
    setFade(0);
    setLoading(false, 1);
    G.simFrozen = false;
    G.transitionActive = false;
  }

  function refund() {
    if (st.paid > 0) {
      kit.wallet.add(st.paid, 'iade');
      st.refunds++;
    }
    st.paid = 0;
  }

  function finish(ok, why) {
    reset();
    const node = st.node;
    st.phase = 'idle';
    st.count += ok ? 1 : 0;
    st.last = {
      ok, why: why || '', to: node ? node.id : '', name: node ? node.name : '',
    };
    if (ok) {
      st.cooldown = FAST_TRAVEL.cooldown;
      G.emit({ type: 'fastTravel', to: node.id, name: node.name, cost: st.paid });
      if (typeof G.sound === 'function') G.sound('dim:arrive', undefined, { vol: 0.6 });
      if (typeof G.speak === 'function') G.speak(node.name + ' noktasına vardın.');
      if (typeof kit.say === 'function') kit.say(node.name + ' noktasına vardın.', 'seyahat:' + node.id);
    }
    st.node = null;
    st.paid = 0;
    if (typeof G.requestSave === 'function') G.requestSave('seyahat');
  }

  function abortBack() {
    st.aborted++;
    const o = st.origin;
    if (o) teleportTo(o.x, o.y, o.z, o.yaw, 12);
    refund();
    if (typeof kit.say === 'function') kit.say('Hızlı seyahat tamamlanamadı: geri döndün, Kredin iade edildi.', 'seyahat:abort');
    st.phase = 'back';
    st.t = 0;
    st.holdT = 0;
    st.stallT = 0;
    st.lastProg = -1;
    st.frames = 0;
  }

  function readiness() {
    const m = G.dimMgr;
    if (m && typeof m.readiness === 'function') {
      try {
        return m.readiness(3);
      } catch {
        return { ready: true, progress: 1 };
      }
    }
    return { ready: true, progress: 1 };
  }

  function update(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    st.clockT += step;
    if (st.cooldown > 0) st.cooldown = Math.max(0, st.cooldown - step);
    if (st.phase === 'idle') return;
    try {
      tick(step);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] hızlı seyahat hatası:', err);
      if (G.opts && G.opts.strictSystems) throw err;
      cancel('hata');
    }
    // systems/dimension.frameUpdate'in «kilit asılı kalmasın» bekçisi geçiş makinesi boştayken bayrakları sıfırlar (order −120, bizden önce): seyahat sürerken her karede yeniden kurulur
    if (st.phase !== 'idle') hold();
  }

  function hold() {
    G.simFrozen = true;
    G.transitionActive = true;
  }

  function tick(step) {
    st.t += step;
    st.total += step;
    switch (st.phase) {
      case 'out': {
        const dd = st.reduced ? R_OUT : OUT;
        setFade(ease(st.t / dd));
        if (st.t >= dd) {
          setFade(1);
          doTeleport();
          st.phase = 'hold';
          st.t = 0;
          st.holdT = 0;
          st.stallT = 0;
          st.lastProg = -1;
          st.frames = 0;
        }
        break;
      }
      case 'hold':
      case 'back': {
        st.frames++;
        st.holdT += step;
        const rd = readiness();
        // zaman aşımı İLERLEMEYE bağlı (QA4-004): parçalar ilerliyorsa sayaç sıfırlanır; mutlak üst sınır maxHold
        if (rd.progress > st.lastProg + 0.004) {
          st.lastProg = rd.progress;
          st.stallT = 0;
        } else st.stallT += step;
        if (st.holdT >= LOADING_AFTER && !rd.ready) setLoading(true, rd.progress);
        else if (st.loadingShown && rd.ready) setLoading(true, 1);
        const need = st.reduced ? R_MIN - R_OUT - R_IN : MIN_TOTAL - OUT - IN;
        const ready = rd.ready && st.frames >= 3 && st.holdT >= Math.max(0, need);
        if (ready) {
          setLoading(false, 1);
          st.phase = st.phase === 'back' ? 'inback' : 'in';
          st.t = 0;
        } else if (st.stallT >= FAST_TRAVEL.timeout || st.holdT >= FAST_TRAVEL.maxHold) {
          setLoading(false, 1);
          if (st.phase === 'hold') abortBack();
          else {
            st.phase = 'inback'; // geri dönüş de gecikti: yine de aç (takılı kalma yok)
            st.t = 0;
          }
        }
        break;
      }
      case 'in':
      case 'inback': {
        const dd = st.reduced ? R_IN : IN;
        setFade(1 - ease(st.t / dd));
        if (st.t >= dd) finish(st.phase === 'in', st.phase === 'in' ? '' : 'zaman');
        break;
      }
      default:
        break;
    }
  }

  function cancel(why) {
    if (st.phase === 'idle') return;
    if (!st.teleported) refund();
    reset();
    st.phase = 'idle';
    st.node = null;
    st.paid = 0;
    st.last = {
      ok: false, why: why || 'iptal', to: '', name: '',
    };
  }

  return {
    info,
    start,
    update,
    cancel,
    get cooldownLeft() {
      return st.cooldown;
    },
    get busy() {
      return st.phase !== 'idle';
    },
    state: st,
  };
}
