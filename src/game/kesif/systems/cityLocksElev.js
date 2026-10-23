/*
 * KEŞİF — cityLocks ASANSÖR ÇALIŞMA ZAMANI: oyuncuya yakın kule asansörlerini etkinleştirir (kabin = dinamik prop + görsel), kabini sabit adımda sürer,
 * durak kapılarını (blok 239/240, `record:false`) açıp kapar, platform taşımayı güvenceye alır (rideAssist), durum kaydeder. Saf sim: sim/city/elevators.js.
 *
 *   createElevators(deps) → {
 *     tick(dt)               sabit adım (oyuncu fiziğinden SONRA): tarama (0.5 sn), kabin adımı, olaylar, prop senkronu, kapı blokları (0.25 sn), taşıma güvencesi
 *     frame(alpha)           görseli ara değerler (kamera ile aynı alpha)
 *     onButton(prop) → string|null   durak düğmesi ya da kabin düğmesi kullanıldı (HUD iletisi döner)
 *     go(rec, i) / halt(rec) / view(rec)   asansör paneli işlemleri
 *     recFor(prop) → rec|null · active() → rec[] · dismiss(rec) · saveAll() · reset() · stats()
 *   }
 *   deps: { seed(), world(), props(), body(), store() (dims.neon.locks), say(text), sound(name,x,y,z,opts?), accessibility(), now(), root() (THREE.Group),
 *           THREE() , openPanel(rec) }
 * Hiçbir dünya/prop/oyuncu nesnesi önbelleğe alınmaz: hepsi `deps` işlevleriyle her çağrıda taze okunur (dimAudit).
 */
import { ID } from '../sim/city/cityEmit.js';
import { ARCHETYPES } from '../sim/city/archetypes.js';
import { lotsInRect } from '../sim/city/cityPlan.js';
import {
  CABIN_DEF, ELEVATOR_T, PLATFORM_THICK, cabinButtonSpot, cabinPropId, buttonPropId, createElevatorSim, doorCells, elevatorsOfLot, inBore, nearestStop,
  rideAssist, stopButtonSlot,
} from '../sim/city/elevators.js';
import { propIdFor } from '../sim/props/propPlan.js';
import { getPropDef } from '../sim/props/propDefs.js';
import { createElevatorVisual } from '../render/city/elevatorVisual.js';

const ACT_R = 110;
const DEACT_R = 150;
const SCAN_EVERY = 0.5;
const DOOR_EVERY = 0.25;
const BODY_R = 0.32;
const PLATFORM_ON_SEC = 0.7;

export function createElevators(deps) {
  const act = new Map(); // elId → rec
  let scanAcc = SCAN_EVERY;
  let doorAcc = DOOR_EVERY;
  const stats = {
    activations: 0, arrivals: 0, departures: 0, rescues: 0, doorWrites: 0,
  };

  function installDef(pw) {
    if (pw.cabinDefInstalled) return;
    const orig = pw.getDef;
    pw.getDef = (t) => (t === ELEVATOR_T ? CABIN_DEF : orig.call(pw, t));
    pw.cabinDefInstalled = true;
  }

  function save(rec) {
    const st = deps.store();
    if (!st) return;
    const v = rec.sim.serialize();
    if (v === null) delete st[rec.el.id];
    else st[rec.el.id] = v;
  }

  function doorBusy(el, i, b) {
    const cs = el.stops[i].cells;
    const xs = cs.map((c) => c[0]);
    const zs = cs.map((c) => c[1]);
    const x0 = Math.min.apply(null, xs) - BODY_R;
    const x1 = Math.max.apply(null, xs) + 1 + BODY_R;
    const z0 = Math.min.apply(null, zs) - BODY_R;
    const z1 = Math.max.apply(null, zs) + 1 + BODY_R;
    const y = el.stops[i].y;
    return b.x > x0 && b.x < x1 && b.z > z0 && b.z < z1 && b.y < y + 3 && b.y + 1.8 > y - 0.2;
  }

  function writeStopDoor(world, el, i, open) {
    const cells = doorCells(el, i);
    const id = open ? ID.DOOR_OPEN : ID.DOOR;
    for (let k = 0; k < cells.length; k++) world.setBlock(cells[k][0], cells[k][1], cells[k][2], id, { record: false });
    stats.doorWrites++;
  }

  function applyDoors(rec, closeAll) {
    const world = deps.world();
    if (!world) return;
    const el = rec.el;
    for (let i = 0; i < el.stops.length; i++) {
      const c = doorCells(el, i)[0];
      const cur = world.getBlock(c[0], c[1], c[2]);
      if (cur === null || cur === undefined) continue; // chunk yüklü değil: sonra
      const want = !closeAll && rec.sim.doorStop === i;
      const wantId = want ? ID.DOOR_OPEN : ID.DOOR;
      if (cur !== wantId) writeStopDoor(world, el, i, want);
    }
  }

  function setStopButtons(rec) {
    const pw = deps.props();
    if (!pw) return;
    const seed = deps.seed();
    const el = rec.el;
    for (let i = 0; i < el.stops.length; i++) {
      const id = propIdFor(seed, el.lotId, stopButtonSlot(el, i));
      if (pw.has(id)) pw.setState(id, rec.sim.target === i || rec.sim.queue.indexOf(i) >= 0 ? 1 : 0);
    }
    if (rec.btn) pw.setState(rec.btn, 0);
  }

  function syncProps(rec, force) {
    const pw = deps.props();
    if (!pw) return;
    const sim = rec.sim;
    if (!force && rec.lastY === sim.y && rec.lastVy === sim.vy) return;
    rec.lastY = sim.y;
    rec.lastVy = sim.vy;
    const vel = { x: 0, y: sim.vy, z: 0 };
    pw.moveDynamic(rec.cab, rec.el.cx, sim.y - PLATFORM_THICK, rec.el.cz, 0, vel);
    if (rec.btn) {
      const s = cabinButtonSpot(rec.el, sim.y);
      pw.moveDynamic(rec.btn, s.x, s.y, s.z, s.yaw, vel);
    }
  }

  function activate(el) {
    const pw = deps.props();
    if (!pw) return;
    installDef(pw);
    const store = deps.store();
    const sim = createElevatorSim(el, store ? store[el.id] : null);
    const rec = {
      el, sim, cab: cabinPropId(el.id), btn: 0, vis: null, lastY: NaN, lastVy: NaN, prevY: sim.y, platT: 0, dismissed: false, hasBtn: false, saveAcc: 0,
    };
    const ok = pw.addDynamic({
      id: rec.cab, t: ELEVATOR_T, x: el.cx, y: sim.y - PLATFORM_THICK, z: el.cz, yaw: 0, variant: 0, flags: 0,
    });
    if (!ok) return; // aynı kimlik zaten var (çift etkinleştirme) ya da prop dünyası reddetti
    const bd = getPropDef('asansor_dugmesi');
    if (bd) {
      const s = cabinButtonSpot(el, sim.y);
      const id = buttonPropId(el.id);
      if (pw.addDynamic({
        id, t: bd.t, x: s.x, y: s.y, z: s.z, yaw: s.yaw, variant: 0, flags: 0,
      })) {
        rec.btn = id;
        rec.hasBtn = true;
      }
    }
    const THREE = deps.THREE();
    const root = deps.root();
    if (THREE && root) {
      rec.vis = createElevatorVisual(THREE, { face: el.face });
      rec.vis.setXZ(el.cx, el.cz);
      rec.vis.setY(sim.y);
      root.add(rec.vis.group);
    }
    act.set(el.id, rec);
    stats.activations++;
    syncProps(rec, true);
    applyDoors(rec, false);
    setStopButtons(rec);
  }

  function deactivate(rec) {
    save(rec);
    const pw = deps.props();
    if (pw) {
      pw.removeDynamic(rec.cab);
      if (rec.btn) pw.removeDynamic(rec.btn);
    }
    applyDoors(rec, true); // etkin değilken kuyu kapıları KAPALI (kabin yokken düşme riski yok)
    if (rec.vis) rec.vis.dispose();
    act.delete(rec.el.id);
  }

  function scan() {
    const b = deps.body();
    const pw = deps.props();
    if (!b || !pw) return;
    const seed = deps.seed();
    const lots = lotsInRect(seed, b.x - ACT_R, b.z - ACT_R, b.x + ACT_R, b.z + ACT_R);
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i];
      const A0 = ARCHETYPES[lot.archetype];
      if (!A0 || !A0.tower || !lot.built) continue;
      const els = elevatorsOfLot(seed, lot);
      for (let k = 0; k < els.length; k++) if (!act.has(els[k].id)) activate(els[k]);
    }
    const far = [];
    act.forEach((rec) => {
      if (Math.abs(rec.el.cx - b.x) > DEACT_R || Math.abs(rec.el.cz - b.z) > DEACT_R) far.push(rec);
    });
    for (let i = 0; i < far.length; i++) deactivate(far[i]);
  }

  function onEvent(rec, e, b) {
    const el = rec.el;
    const st = el.stops;
    if (e.type === 'depart') {
      stats.departures++;
      applyDoors(rec, false);
      const s = st[e.from >= 0 ? e.from : 0];
      deps.sound('prop:door_shut', el.cx, s.y + 1, el.cz);
      save(rec);
      setStopButtons(rec);
    } else if (e.type === 'arrived') {
      stats.arrivals++;
      applyDoors(rec, false);
      deps.sound('prop:beep', el.cx, st[e.stop].y + 1.5, el.cz, { pitch: 1.5, vol: 0.9 });
      deps.sound('prop:door', el.cx, st[e.stop].y + 1, el.cz);
      save(rec);
      setStopButtons(rec);
      if (b && inBore(el, b.x, b.z, 0.2) && Math.abs(b.y - st[e.stop].y) < 0.6) deps.say(st[e.stop].name + '. Kapı açıldı.');
    }
  }

  return {
    active: () => Array.from(act.values()),
    stats: () => Object.assign({ active: act.size }, stats),
    recFor(prop) {
      let found = null;
      act.forEach((rec) => {
        if (rec.btn === prop.id) found = rec;
      });
      return found;
    },
    recById: (id) => act.get(id) || null,
    dismiss(rec) {
      rec.dismissed = true;
    },
    saveAll() {
      act.forEach((rec) => save(rec));
    },
    reset() {
      const all = Array.from(act.values());
      for (let i = 0; i < all.length; i++) {
        save(all[i]);
        const pw = deps.props();
        if (pw) {
          try {
            pw.removeDynamic(all[i].cab);
            if (all[i].btn) pw.removeDynamic(all[i].btn);
          } catch { /* boyut değişti */ }
        }
        if (all[i].vis) all[i].vis.dispose();
      }
      act.clear();
      scanAcc = SCAN_EVERY;
      doorAcc = DOOR_EVERY;
    },

    tick(dt) {
      const b = deps.body();
      if (!b || !deps.props()) return;
      scanAcc += dt;
      if (scanAcc >= SCAN_EVERY) {
        scanAcc = 0;
        scan();
      }
      act.forEach((rec) => {
        const sim = rec.sim;
        rec.prevY = sim.y;
        const ev = sim.step(dt, { blocked: (i) => doorBusy(rec.el, i, b) });
        if (sim.phase === 'closing') {
          rec.waitT = (rec.waitT || 0) + dt;
          if (rec.waitT > 1.5) {
            rec.waitT = -2.5; // kapı önünde duran oyuncuya neden kalkmadığı söylenir (4 sn'de bir)
            deps.say('Kapı kapanamıyor: kabinin içine biraz daha geç.');
          }
        } else rec.waitT = 0;
        for (let i = 0; i < ev.length; i++) onEvent(rec, ev[i], b);
        syncProps(rec, false);
        if (sim.phase === 'moving') {
          rec.saveAcc += dt;
          if (rec.saveAcc >= 0.5) {
            rec.saveAcc = 0; // yolculukta kabin konumu 0.5 sn'de bir kayda yazılır (otomatik kayıt boyut blobunu bu nesneden alır)
            save(rec);
          }
        }
        // oyuncu kabinin yakınındaysa: platform taşıma güvencesi (zıplayan oyuncu geride kalıp platformun içine/altına düşmesin)
        if (Math.abs(b.x - rec.el.cx) < 3 && Math.abs(b.z - rec.el.cz) < 3) {
          const code = rideAssist(rec.el, sim.y, sim.vy, b);
          if (code >= 2) {
            stats.rescues++;
            deps.say('Asansör seni güvenle platforma çıkardı.');
          }
          // kabine binince kat seçimi paneli (dokunmatik ve ekran okuyucu dostu); kapatılırsa platformdan inene dek yeniden açılmaz
          const onPlat = inBore(rec.el, b.x, b.z) && Math.abs(b.y - sim.y) < 0.3;
          if (onPlat && sim.phase === 'idle') {
            rec.platT += dt;
            if (rec.platT >= PLATFORM_ON_SEC && !rec.dismissed) {
              rec.platT = 0;
              deps.openPanel(rec);
            }
          } else if (!onPlat) {
            rec.platT = 0;
            rec.dismissed = false;
          }
        } else {
          rec.platT = 0;
          rec.dismissed = false; // platformdan uzaklaştı: bir sonraki binişte panel yine kendiliğinden açılır
        }
      });
      doorAcc += dt;
      if (doorAcc >= DOOR_EVERY) {
        doorAcc = 0;
        act.forEach((rec) => applyDoors(rec, false));
      }
    },

    frame(alpha) {
      const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
      act.forEach((rec) => {
        if (!rec.vis) return;
        const y = rec.prevY + (rec.sim.y - rec.prevY) * a;
        rec.vis.setY(y);
      });
    },

    /** Düğme kullanıldı: kabin düğmesi → panel; durak düğmesi → çağır. HUD iletisi döner. */
    onButton(prop) {
      const rec = this.recFor(prop);
      if (rec) {
        deps.openPanel(rec);
        return null;
      }
      let target = null;
      let stop = -1;
      act.forEach((r) => {
        for (let i = 0; i < r.el.stops.length; i++) {
          const bt = r.el.stops[i].button;
          if (Math.abs(bt.x - prop.x) < 0.6 && Math.abs(bt.z - prop.z) < 0.6 && Math.abs(bt.y - prop.y) < 0.8) {
            target = r;
            stop = i;
          }
        }
      });
      if (!target) return null;
      const sim = target.sim;
      if (sim.doorStop === stop) return 'Asansör burada. Kapı açık.';
      const was = sim.target === stop || sim.queue.indexOf(stop) >= 0;
      if (!was) sim.call(stop);
      setStopButtons(target);
      deps.sound('prop:beep', prop.x, prop.y, prop.z, { pitch: 1.2 });
      return was ? 'Asansör yolda.' : 'Asansör çağrıldı.';
    },

    view(rec) {
      const sim = rec.sim;
      const near = nearestStop(rec.el, sim.y);
      return {
        phase: sim.phase,
        stops: rec.el.stops.map((s) => ({
          i: s.i, name: s.name, floor: s.floor, here: sim.doorStop === s.i, current: near === s.i && sim.phase !== 'moving', target: sim.target === s.i,
        })),
      };
    },

    go(rec, i) {
      const el = rec.el;
      if (!(i >= 0 && i < el.stops.length)) return { ok: false, result: 'gecersiz', message: 'Bu kat yok.' };
      const sim = rec.sim;
      if (sim.doorStop === i) return { ok: false, result: 'burada', message: 'Zaten buradasın.' };
      sim.call(i);
      setStopButtons(rec);
      deps.sound('prop:beep', el.cx, sim.y + 1.2, el.cz, { pitch: 1.3 });
      return { ok: true, result: 'gidiliyor', message: el.stops[i].name + ' katına gidiyorsun.' };
    },

    halt(rec) {
      const ok = rec.sim.abort();
      return ok ? { ok: true, result: 'durdu', message: 'Asansör en yakın kata duruyor.' } : { ok: false, result: 'duruyor', message: 'Asansör zaten duruyor.' };
    },
  };
}
