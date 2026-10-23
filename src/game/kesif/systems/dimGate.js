/*
 * KEŞİF — BOYUT KAPISI denetleyicisi (systems/dimension.js kurar). Sözleşme KESIF_CITY_CONTRACT §5 "Yolculuk".
 *
 *   createGateController(G, deps) → gc
 *       deps: {mgr (gameDimension), tr (gameTransition), visual (render/city/gateVisual), now?()}
 *   gc.fire() → bool                 Portal Tabancası 'boyut' kipinde ateş: bulunulan boyuta göre 'out' (Neon Meridyen'e) / 'back' (eve) kapısı açar
 *   gc.terminal(op) → bool           Boyut Terminali: 'back' (eve dön) | 'home' (başlangıç noktası) — ÜCRETSİZ; kapı açılır ve oyuncu otomatik girer.
 *                                    Kapı için yer yoksa kapısız doğrudan geçiş (hapis yok)
 *   gc.tick(dt)                      sabit adım: kalibrasyon, ömür (30 sn), tetik hacmi → geçiş
 *   gc.frame(dt)                     görsel (girdap, parçacık) + uğultu sesi
 *   gc.close(why, instant?)          açık kapıyı kapatır      gc.current() → GateEntity | null     gc.cost(), gc.info()
 *   gc.beforeDimension()             boyut değişmeden önce: kaynak kapı hemen kapanır
 *   GateEntity {id, kind:'out'|'back', dest, x,y,z (orta sütun merkezi, y ayak), nx,nz, axis, yaw, lookYaw, openedAt, ttl, state:'kalibrasyon'|'acik'|'girildi',
 *               free, home, auto, cost:{charges,core,calibrated}, calibrateUntil}   — yalnız entityRoot'ta yaşar, KAYDA GİRMEZ
 *
 * Maliyet: her açılış 12 portal şarjı (şarj yoksa 1 Enerji Hücresi 12 şarj yükler); boyut kalibre değilse ayrıca 1 Kuantum Çekirdeği (3 sn "Kalibrasyon").
 * Maliyet YALNIZ kapı varlığı başarıyla yaratılınca alınır; geçiş zaman aşımına uğrarsa iade edilir. Bekleme: kapı açma 5 sn, atlama arası 20 sn
 * (terminal dönüşü muaf). Boyut başına en çok 1 kapı (yenisi eskisini kapatır).
 */
import {
  canOpenGate, CELL_ITEM, CORE_ITEM, gateCost, GATE_RULES, gateSpot,
} from '../sim/dim/travel.js';
import { addChargeToSlot, chargeOf, drainSlot } from '../sim/techCharge.js';
import { PORTAL_GUN_ITEM } from '../sim/techData.js';
import { structuresInRegion } from '../sim/structures.js';
import { zoneIndexAt } from '../sim/constants.js';

const OPEN_ANIM = 0.55;
const TRIGGER = Object.freeze({ halfW: 0.8, halfH: 1.3, halfD: 0.4, cy: 1.4 });
const HUM_EVERY = 2.4;
const HUM_RANGE = 26;
const BODY_R = 0.3;

function gatedKindAt(G, x, y, z) {
  let list = [];
  try {
    list = structuresInRegion(G.seed, x, z, x, z);
  } catch {
    return null;
  }
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if ((s.type !== 'bossarena' && s.type !== 'muhursunagi') || !s.bounds) continue;
    const b = s.bounds;
    if (x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1) return s.type;
  }
  return null;
}

export function createGateController(G, deps) {
  const { mgr, tr, visual } = deps;
  const now = deps.now || (() => (G.time ? G.time.seconds : 0));
  let seq = 0;
  let lastGateAt;
  let humT = 0.5;
  let disposed = false;

  function say(text, key, secs) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: Math.round((secs || 3.5) * 1000), priority: 4, key: key || 'dim:gate', cooldown: 1500 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function fail(text, key) {
    if (typeof G.sound === 'function') G.sound('tech:portal_fail', undefined, { vol: 0.55 });
    say(text, 'gate:' + (key || 'fail'), 3.2);
    return false;
  }

  function cheats() {
    return G.cheats && G.cheats.nocost === true;
  }

  function heldGun() {
    const inv = G.inventory;
    const s = inv && typeof inv.held === 'function' ? inv.held() : null;
    return s && s.item === PORTAL_GUN_ITEM ? s : null;
  }

  function anyGunSlot() {
    const inv = G.inventory;
    if (!inv || !inv.slots) return null;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (s && s.item === PORTAL_GUN_ITEM) return s;
    }
    return null;
  }

  /** Kapı aday konumundaki 3×4 hücre bulmaca / mühürlü bölge / boss arenası / mühür sunağı ise reddedilir (yalnız overworld). */
  function accepts(spot) {
    if (G.dim !== 'overworld') return true;
    const wx = spot.nx !== 0 ? 0 : 1;
    const wz = spot.nx !== 0 ? 1 : 0;
    const bx = Math.floor(spot.x);
    const bz = Math.floor(spot.z);
    for (let k = -1; k <= 1; k++) {
      const x = bx + wx * k;
      const z = bz + wz * k;
      if (G.world.isZoneUnlocked && !G.world.isZoneUnlocked(zoneIndexAt(x, z))) return false;
      for (let dy = 0; dy < spot.h; dy += 2) {
        const y = spot.y + dy;
        if (G.puzzles && typeof G.puzzles.ownerAt === 'function' && G.puzzles.ownerAt(x, y, z)) return false;
        if (gatedKindAt(G, x, y, z)) return false;
      }
    }
    return true;
  }

  function stateFor(free) {
    const inv = G.inventory;
    const gun = heldGun();
    const meta = Object.assign({}, mgr.dimMeta);
    if (cheats()) {
      meta.calibrated = true;
      meta.lastHopAt = 0;
    }
    const rich = cheats(); // nocost (hata ayıklama): maliyet kuralları kapalı
    return {
      mode: G.mode,
      dim: G.dim,
      abilities: free || rich ? { portalGun: true } : G.abilities,
      dimMeta: meta,
      hasCore: rich ? 1 : inv ? inv.count(CORE_ITEM) : 0,
      charge: rich ? GATE_RULES.cost : gun ? chargeOf(gun) : 0,
      cells: inv ? inv.count(CELL_ITEM) : 0,
    };
  }

  function ctxFor(kind, free, spot) {
    const b = G.body;
    const ow = G.dim === 'overworld';
    const gk = ow ? gatedKindAt(G, b.x, b.y + 0.5, b.z) : null;
    return {
      time: now(),
      lastGateAt: cheats() || free ? undefined : lastGateAt, // Boyut Terminali dönüşü bekleme sürelerinden muaf
      transitioning: tr.active,
      inParkour: ow && !!(G.hud && G.hud.parkour),
      inPuzzle: ow && !!(G.puzzles && typeof G.puzzles.ownerAt === 'function' && G.puzzles.ownerAt(Math.floor(b.x), Math.floor(b.y + 0.5), Math.floor(b.z))),
      inBoss: gk === 'bossarena',
      inSealAltar: gk === 'muhursunagi',
      underwater: !!(b.headInLiquid || (G.hud && G.hud.underwater)),
      zoneUnlocked: !ow || !G.world.isZoneUnlocked || G.world.isZoneUnlocked(zoneIndexAt(b.x, b.z)),
      spot,
      kind,
      terminalReturn: free,
    };
  }

  function current() {
    const c = mgr.get(G.dim);
    return c ? c.gate : null;
  }

  /* ---------------------------------------------------------------------------------------------
   * Maliyet
   * ------------------------------------------------------------------------------------------- */
  function pay(gate) {
    const inv = G.inventory;
    if (inv.infinite || cheats()) return true;
    const gun = heldGun();
    if (!gun) return false;
    if (chargeOf(gun) < GATE_RULES.cost) {
      if (inv.count(CELL_ITEM) < 1 || !inv.remove(CELL_ITEM, 1)) return false;
      addChargeToSlot(gun, 12);
    }
    drainSlot(gun, GATE_RULES.cost);
    gate.cost.charges = GATE_RULES.cost;
    if (gate.cost.calibrated) {
      if (!inv.remove(CORE_ITEM, 1)) {
        addChargeToSlot(gun, GATE_RULES.cost);
        gate.cost.charges = 0;
        return false;
      }
      gate.cost.core = 1;
    }
    if (typeof inv._emit === 'function') inv._emit();
    return true;
  }

  function refund(gate, why) {
    const inv = G.inventory;
    if (!inv || !gate || !gate.cost || gate.free) return;
    if (gate.cost.charges > 0) {
      const slot = anyGunSlot();
      const back = slot ? addChargeToSlot(slot, gate.cost.charges) : 0;
      if (back < gate.cost.charges) inv.add(CELL_ITEM, 1);
    }
    if (gate.cost.core > 0) {
      inv.add(CORE_ITEM, 1);
      mgr.dimMeta.calibrated = false;
    }
    gate.cost.charges = 0;
    gate.cost.core = 0;
    if (typeof inv._emit === 'function') inv._emit();
    G.emit({ type: 'dimRefund', why: why || 'zaman' });
  }

  /* ---------------------------------------------------------------------------------------------
   * Açma / kapatma
   * ------------------------------------------------------------------------------------------- */
  function show(gate, ctx) {
    visual.attach(ctx.entityRoot || null);
    visual.setReducedMotion(!!(G.reducedMotion || G.accessibility));
    visual.show({
      id: gate.id, kind: gate.kind, x: gate.x, y: gate.y, z: gate.z, nx: gate.nx, nz: gate.nz, w: GATE_RULES.w, h: GATE_RULES.h, calibrating: gate.state === 'kalibrasyon',
    });
  }

  function close(why, instant) {
    const ctx = mgr.get(G.dim);
    const gate = ctx ? ctx.gate : null;
    if (!gate) return false;
    if (gate.state === 'kalibrasyon') finishCalibration(gate);
    ctx.gate = null;
    visual.hide({ instant: !!instant });
    if (!instant && why === 'ttl') {
      if (typeof G.sound === 'function') G.sound('dim:gateClose', { x: gate.x, y: gate.y + 1.5, z: gate.z }, { vol: 0.6 });
      say('Boyut kapısı kapandı.', 'gate:closed', 2.5);
    }
    const dest = gate.dest;
    if (!tr.active || tr.state.to !== dest) mgr.cancelPrewarm(dest);
    G.emit({ type: 'gateClosed', kind: gate.kind, why: why || 'kapat' });
    return true;
  }

  function finishCalibration(gate) {
    if (gate.state !== 'kalibrasyon') return;
    gate.state = 'acik';
    gate.openedAt = now();
    if (gate.cost.calibrated) {
      mgr.dimMeta.calibrated = true;
      G.emit({ type: 'dimCalibrated' });
      say('Portal Tabancası boyutlara kalibre edildi.', 'gate:calibrated', 4);
    }
    visual.setCalibration(1);
    const ctx = mgr.get(G.dim);
    if (ctx && ctx.gate === gate) show(gate, ctx);
    if (typeof G.sound === 'function') G.sound('dim:gateOpen', { x: gate.x, y: gate.y + 1.5, z: gate.z }, { vol: 0.8 });
  }

  function build(kind, spot, free, extra) {
    const calibrate = kind === 'out' && !free && !cheats() && mgr.dimMeta.calibrated !== true;
    const b = G.body;
    return {
      id: ++seq,
      kind,
      dest: kind === 'out' ? 'neon' : 'overworld',
      x: spot.x,
      y: spot.y,
      z: spot.z,
      nx: spot.nx,
      nz: spot.nz,
      axis: spot.axis,
      yaw: spot.yaw,
      lookYaw: G.player.yaw,
      openedAt: now(),
      ttl: GATE_RULES.ttl * (G.accessibility ? 2 : 1), // erişilebilirlik modu: süre ×2 (sözleşme §2)
      state: calibrate ? 'kalibrasyon' : 'acik',
      free: !!free,
      home: !!(extra && extra.home),
      auto: !!(extra && extra.auto),
      calibrateUntil: calibrate ? now() + GATE_RULES.calibrateSecs : 0,
      calibrateFrom: now(),
      cost: { charges: 0, core: 0, calibrated: calibrate },
      by: { x: b.x, y: b.y, z: b.z },
    };
  }

  function openAt(kind, spot, free, extra) {
    const ctx = mgr.get(G.dim);
    if (!ctx) return null;
    if (ctx.gate) close('yeni', true);
    const gate = build(kind, spot, free, extra);
    if (!free && !pay(gate)) {
      fail('Boyut kapısı için Portal Tabancasını ele al ve 12 portal şarjı (ya da Enerji Hücresi) taşı.', 'pay');
      return null;
    }
    if (!free) lastGateAt = now();
    ctx.gate = gate;
    show(gate, ctx);
    if (gate.state === 'kalibrasyon') {
      say('Kalibrasyon: Portal Tabancası boyutlara ayarlanıyor (3 sn)…', 'gate:calib', 3.2);
      if (typeof G.sound === 'function') G.sound('dim:charge', { x: gate.x, y: gate.y + 1.5, z: gate.z }, { vol: 0.7 });
    } else if (typeof G.sound === 'function') G.sound('dim:gateOpen', { x: gate.x, y: gate.y + 1.5, z: gate.z }, { vol: 0.8 });
    if (typeof G.haptic === 'function') G.haptic('medium');
    // varış boyutunu hazırla (gizli ChunkManager, 1 işçi, r=3)
    mgr.prewarm(gate.dest, gate.home ? { pos: mgr.arrivalFor('overworld', { home: true }) } : undefined);
    G.emit({
      type: 'gateOpened', kind, dest: gate.dest, x: gate.x, y: gate.y, z: gate.z, free: !!free,
    });
    return gate;
  }

  function fire() {
    if (disposed) return false;
    if (tr.active) return fail('Boyut geçişi sürüyor.', 'busy');
    if (!heldGun() && !G.inventory.infinite) return fail('Boyut kapısı için Portal Tabancasını ele almalısın.', 'gun');
    const kind = G.dim === 'neon' ? 'back' : 'out';
    const eye = G.eyeSim;
    const spot = gateSpot(G.world, eye, G.player.yaw, { accept: accepts });
    const chk = canOpenGate(stateFor(false), ctxFor(kind, false, spot));
    if (!chk.ok) return fail(chk.message, chk.reason);
    return !!openAt(kind, spot, false);
  }

  function terminal(op) {
    if (disposed) return false;
    if (G.dim !== 'neon') return fail('Boyut terminali yalnızca Neon Meridyen\'de çalışır.', 'terminal');
    if (tr.active) return false;
    const home = op === 'home';
    const eye = G.eyeSim;
    // terminalden dönüş: kapı oyuncuyla terminal arasında (2 blok önde) açılır; terminalin arkasında kalıp görünmez olmasın
    const spot = gateSpot(G.world, eye, G.player.yaw, { accept: accepts, ahead: 2 });
    const chk = canOpenGate(stateFor(true), ctxFor('back', true, spot));
    if (!chk.ok && chk.reason !== 'yer') return fail(chk.message, chk.reason);
    if (spot && chk.ok) {
      const gate = openAt('back', spot, true, { home, auto: true });
      if (gate) return true;
    }
    // kapıya yer yok: kapısız doğrudan geçiş (hapis yok)
    say('Terminal seni doğrudan eve gönderiyor.', 'gate:direct', 3);
    enter(null, { home });
    return true;
  }

  function enter(gate, extra) {
    const home = gate ? gate.home : !!(extra && extra.home);
    const free = gate ? gate.free : true;
    if (gate) {
      gate.state = 'girildi';
    }
    const spec = {
      to: gate ? gate.dest : 'overworld',
      reason: free ? (home ? 'home' : 'terminal') : 'gate',
      linkFrom: gate && gate.kind === 'out'
        ? {
          x: gate.x + gate.nx * 2, y: gate.y, z: gate.z + gate.nz * 2, yaw: gate.lookYaw,
        }
        : undefined,
      home,
      refund: (why) => { if (gate) refund(gate, why); },
      onDone: (res) => {
        if (res && res.ok && gate) G.emit({ type: 'gateUsed', kind: gate.kind, dest: gate.dest });
      },
    };
    const r = tr.start(spec);
    if (!r.ok && gate) gate.state = 'acik';
    return r.ok;
  }

  /* ---------------------------------------------------------------------------------------------
   * Sabit adım / kare
   * ------------------------------------------------------------------------------------------- */
  function inside(gate) {
    const b = G.body;
    const rx = b.x - gate.x;
    const rz = b.z - gate.z;
    const wx = gate.nx !== 0 ? 0 : 1;
    const wz = gate.nx !== 0 ? 1 : 0;
    const du = rx * wx + rz * wz;
    const dn = rx * gate.nx + rz * gate.nz;
    const k = G.accessibility ? 2 : 1; // erişilebilirlik modu: kapı yarıçapı ×2
    if (Math.abs(du) > (TRIGGER.halfW + BODY_R) * k || Math.abs(dn) > (TRIGGER.halfD + BODY_R) * k) return false;
    const lo = gate.y + TRIGGER.cy - TRIGGER.halfH;
    const hi = gate.y + TRIGGER.cy + TRIGGER.halfH;
    return b.y + 1.8 > lo && b.y < hi;
  }

  function tick() {
    if (disposed || tr.active) return;
    const ctx = mgr.get(G.dim);
    const gate = ctx ? ctx.gate : null;
    if (!gate) return;
    const t = now();
    if (gate.state === 'kalibrasyon') {
      const k = (t - gate.calibrateFrom) / GATE_RULES.calibrateSecs;
      visual.setCalibration(k);
      if (t >= gate.calibrateUntil) finishCalibration(gate);
      return;
    }
    if (gate.state !== 'acik') return;
    if (t - gate.openedAt >= gate.ttl) {
      close('ttl');
      return;
    }
    if (G.player.dead || (G.ui !== 'none' && !gate.auto)) return;
    if (gate.auto) {
      if (t - gate.openedAt >= OPEN_ANIM + 0.15) enter(gate);
      return;
    }
    if (inside(gate)) enter(gate);
  }

  function frame(dt) {
    if (disposed) return;
    visual.update(dt);
    const ctx = mgr.get(G.dim);
    const gate = ctx ? ctx.gate : null;
    if (!gate || gate.state === 'girildi' || tr.active) return;
    humT -= dt;
    if (humT <= 0) {
      humT = HUM_EVERY;
      const b = G.body;
      const dx = gate.x - b.x;
      const dz = gate.z - b.z;
      if (dx * dx + dz * dz < HUM_RANGE * HUM_RANGE && typeof G.sound === 'function') {
        G.sound('dim:gateHum', { x: gate.x, y: gate.y + 1.5, z: gate.z }, { vol: 0.35 });
      }
    }
  }

  function beforeDimension() {
    const ctx = mgr.get(G.dim);
    if (ctx && ctx.gate) {
      const g = ctx.gate;
      if (g.state === 'kalibrasyon') finishCalibration(g);
      ctx.gate = null;
      visual.hide({ instant: true });
    }
  }

  return {
    fire,
    terminal,
    tick,
    frame,
    close,
    current,
    beforeDimension,
    refund,
    cost: () => gateCost({ dimMeta: mgr.dimMeta }),
    info() {
      const g = current();
      return g ? {
        id: g.id, kind: g.kind, dest: g.dest, state: g.state, age: now() - g.openedAt, ttl: g.ttl, x: g.x, y: g.y, z: g.z, free: g.free,
      } : null;
    },
    resetCooldown() {
      lastGateAt = undefined;
    },
    dispose() {
      disposed = true;
    },
  };
}
