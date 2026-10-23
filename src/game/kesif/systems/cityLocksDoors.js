/*
 * KEŞİF — cityLocks KAPILARI: (1) cephe girişi kayar kapıları (blok 239 kapalı / 240 açık, `record:false`; sözleşme §1.10) ve (2) iç kapı propları
 * (durum 0 kapalı / 1 açık + ColliderIndex çarpışma aç/kapa). Dünya/prop/oyuncu ERİŞİMİ yalnız `deps` işlevleriyle (her çağrıda taze; önbellek yok).
 *
 *   createStreetDoors(deps) → { tick(dt), openCount(), closeAll(), reset() }
 *       deps: {seed(), world(), body(), accessibility()}            oyuncu ≤2 blokta açılır; kapıdayken kapanmaz (isOccupied); uzaklaşınca 0.6 sn sonra kapanır
 *   createInteriorDoors(deps) → { tick(dt), reset(), infoOf(prop), stats() }
 *       deps: {seed(), props(), body(), book, accessibility(), sound(name,x,y,z), hint(text)}
 *       kapı kuralı: kilitsiz/serbest → yaklaşınca açılır · kilitli → yalnız çözüldüyse YA DA oyuncu derin (çıkış) taraftaysa açılır (hapis yok) ·
 *       gizli kapı (serbest + hidden) → yalnız bulununca (kayıtlı çözüm) açık kalır
 */
import { ID } from '../sim/city/cityEmit.js';
import { lotsInRect, planBuilding } from '../sim/city/cityPlan.js';
import { onEntrySide } from '../sim/city/interior/locks.js';
import { doorOfProp } from '../sim/city/interior/lockLookup.js';
import { worldBoxes } from '../sim/props/propDefs.js';

const BODY_R = 0.35;
const BODY_H = 1.8;
const STEP = 0.1;
const CLOSE_DELAY = 0.6;

/* ------------------------------------------------------------------------------------------------
 * Cephe girişi (kayar kapı)
 * ---------------------------------------------------------------------------------------------- */
function doorCellsOf(d) {
  const out = [];
  for (let o = -1; o <= 1; o++) {
    for (let y = 64; y <= 66; y++) out.push(d.axis === 'x' ? [d.x + o, y, d.z] : [d.x, y, d.z + o]);
  }
  return out;
}

function readDoor(world, d) {
  return world.getBlock(d.x, 65, d.z);
}

function writeDoor(world, d, open) {
  const id = open ? ID.DOOR_OPEN : ID.DOOR;
  const cells = doorCellsOf(d);
  for (let i = 0; i < cells.length; i++) world.setBlock(cells[i][0], cells[i][1], cells[i][2], id, { record: false });
}

function occupied(d, b) {
  const x0 = (d.axis === 'x' ? d.x - 1 : d.x) - BODY_R;
  const x1 = (d.axis === 'x' ? d.x + 2 : d.x + 1) + BODY_R;
  const z0 = (d.axis === 'x' ? d.z : d.z - 1) - BODY_R;
  const z1 = (d.axis === 'x' ? d.z + 1 : d.z + 2) + BODY_R;
  return b.x > x0 && b.x < x1 && b.z > z0 && b.z < z1 && b.y < 67 && b.y + BODY_H > 64;
}

export function createStreetDoors(deps) {
  const open = new Map(); // lotId → {d, far}
  const doors = new Map(); // lotId → door | null (planlar önbelleği)
  let acc = STEP;

  function doorOf(seed, lot) {
    if (doors.has(lot.id)) return doors.get(lot.id);
    let d = null;
    try {
      const bp = planBuilding(seed, lot);
      d = bp && bp.doors && bp.doors[0] ? bp.doors[0] : null;
    } catch {
      d = null;
    }
    if (doors.size > 400) doors.clear();
    doors.set(lot.id, d);
    return d;
  }

  function within(d, b, k, grow) {
    const along = d.axis === 'x' ? b.x - (d.x + 0.5) : b.z - (d.z + 0.5);
    const across = d.axis === 'x' ? b.z - (d.z + 0.5) : b.x - (d.x + 0.5);
    return Math.abs(along) <= (2.5 + grow) * k && Math.abs(across) <= (2.2 + grow) * k && Math.abs(b.y - 64) < 3.5;
  }

  return {
    tick(dt) {
      acc += dt;
      if (acc < STEP) return;
      const step = acc;
      acc = 0;
      const world = deps.world();
      const b = deps.body();
      if (!world || !b) return;
      const seed = deps.seed();
      const k = deps.accessibility() ? 2 : 1;
      if (b.y < 70) {
        const lots = lotsInRect(seed, b.x - 8 * k, b.z - 8 * k, b.x + 8 * k, b.z + 8 * k);
        for (let i = 0; i < lots.length; i++) {
          const lot = lots[i];
          if (!lot.built || !lot.door || open.has(lot.id)) continue;
          const d = doorOf(seed, lot);
          if (!d || !within(d, b, k, 0)) continue;
          const cur = readDoor(world, d);
          if (cur === ID.DOOR) {
            writeDoor(world, d, true);
            open.set(lot.id, { d, far: 0 });
          } else if (cur === ID.DOOR_OPEN) open.set(lot.id, { d, far: 0 });
        }
      }
      const done = [];
      open.forEach((rec, id) => {
        if (within(rec.d, b, k, 1.2) || occupied(rec.d, b)) {
          rec.far = 0;
          // yükleme/yeniden üretim kapıyı kapatmış olabilir: açık olması gereken kapı yeniden açılır
          if (readDoor(world, rec.d) === ID.DOOR) writeDoor(world, rec.d, true);
          return;
        }
        rec.far += step;
        if (rec.far >= CLOSE_DELAY) {
          const cur = readDoor(world, rec.d);
          if (cur === ID.DOOR_OPEN) writeDoor(world, rec.d, false);
          if (cur !== null) done.push(id);
          else if (rec.far > 30) done.push(id); // chunk boşaltıldı: kaydı bırak
        }
      });
      for (let i = 0; i < done.length; i++) open.delete(done[i]);
    },
    openCount: () => open.size,
    closeAll() {
      const world = deps.world();
      open.forEach((rec) => {
        if (world && readDoor(world, rec.d) === ID.DOOR_OPEN) writeDoor(world, rec.d, false);
      });
      open.clear();
    },
    reset() {
      open.clear();
      doors.clear();
      acc = STEP;
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * İç kapılar (prop)
 * ---------------------------------------------------------------------------------------------- */
export function createInteriorDoors(deps) {
  const infos = new Map(); // propId → info | null
  const removed = new Map(); // propId → true (çarpışma kaldırıldı)
  const closeT = new Map(); // propId → sn
  const hintAt = new Map();
  let acc = STEP;
  let ver = -1;
  const stats = { managed: 0, opened: 0, closed: 0 };

  function infoOf(prop) {
    if (infos.has(prop.id)) return infos.get(prop.id);
    let info = null;
    try {
      info = doorOfProp(deps.seed(), prop);
    } catch {
      info = null;
    }
    if (infos.size > 800) infos.clear();
    infos.set(prop.id, info);
    return info;
  }

  function nearTest(prop, info, b, grow) {
    const d = info.door;
    const half = (d.w || 1) / 2;
    const along = d.axis === 'x' ? b.x - prop.x : b.z - prop.z;
    const across = d.axis === 'x' ? b.z - prop.z : b.x - prop.x;
    return Math.abs(along) <= half + 0.9 + grow && Math.abs(across) <= 2.1 + grow && b.y > prop.y - 1.2 && b.y < prop.y + 3.2;
  }

  function syncCollider(pw, entry, wantOpen) {
    const cc = pw.colliders;
    if (!cc) return;
    const id = entry.prop.id;
    if (wantOpen) {
      if (!removed.get(id)) {
        cc.remove(id);
        removed.set(id, true);
      }
    } else if (removed.get(id)) {
      const p = entry.prop;
      cc.add(id, worldBoxes(entry.def, p.x, p.y, p.z, p.yaw, []));
      removed.delete(id);
    }
  }

  function setOpen(pw, entry, want, now) {
    const id = entry.prop.id;
    const target = want ? 1 : 0;
    const st = entry.state;
    const wasOpen = st >= 1;
    if (wasOpen !== want && entry.def.states > 1) {
      pw.setState(id, target);
      if (want) stats.opened++;
      else stats.closed++;
      const last = hintAt.get('s' + id) || -9;
      if (now - last > 0.4) {
        deps.sound(want ? 'prop:door' : 'prop:door_shut', entry.prop.x, entry.prop.y + 1, entry.prop.z);
        hintAt.set('s' + id, now);
      }
    }
    syncCollider(pw, entry, want);
  }

  function wantOpen(prop, entry, info, b, now) {
    const lock = info.lock;
    const book = deps.book;
    if (info.hidden && lock) return book.isSolved(info.lotId, lock);
    const near = nearTest(prop, info, b, entry.state >= 1 ? 1 : 0);
    if (!lock || lock.kind === 'serbest') return near;
    if (book.isSolved(info.lotId, lock)) return near;
    // kilitli: derin (çıkış) taraftan serbest; giriş tarafından kapalı + ipucu
    const entrySide = info.side ? onEntrySide(info.side, b.x, b.z) : true;
    if (!entrySide) return near;
    if (near) {
      const last = hintAt.get('h' + prop.id) || -99;
      if (now - last > 7 && Math.abs(b.x - prop.x) + Math.abs(b.z - prop.z) < 3.2) {
        hintAt.set('h' + prop.id, now);
        deps.hint('Kapı kilitli. Yanındaki düzeneği kullan.');
      }
    }
    return false;
  }

  return {
    infoOf,
    stats: () => Object.assign({}, stats, { cached: infos.size, removed: removed.size }),
    reset() {
      infos.clear();
      removed.clear();
      closeT.clear();
      hintAt.clear();
      acc = STEP;
      ver = -1;
    },
    /** Kapıyı doğrudan (kilit çözülünce) aç: bir sonraki adımda yaklaşma kuralı yönetir; burada yalnız durum 1 + çarpışma kalkar. */
    openNow(pw, prop) {
      const e = pw.entry(prop.id);
      if (e) setOpen(pw, e, true, deps.now());
    },
    tick(dt) {
      acc += dt;
      if (acc < STEP) return;
      const step = acc;
      acc = 0;
      const pw = deps.props();
      const b = deps.body();
      if (!pw || !b) return;
      if (pw.version !== ver) {
        ver = pw.version;
        removed.clear(); // chunk yüklemesi çarpışmaları varsayılan (kapalı) kurar
      }
      const now = deps.now();
      const cx = Math.floor(b.x / 16);
      const cz = Math.floor(b.z / 16);
      let managed = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = pw.chunkProps(cx + dx, cz + dz);
          for (let i = 0; i < list.length; i++) {
            const p = list[i];
            const e = pw.entry(p.id);
            if (!e || !e.def || e.def.tags.indexOf('door') < 0) continue;
            const info = infoOf(p);
            if (!info) continue;
            managed++;
            const want = wantOpen(p, e, info, b, now);
            const hidden = !!info.hidden;
            if (want) {
              closeT.delete(p.id);
              setOpen(pw, e, true, now);
            } else if (e.state >= 1) {
              // gizli kapı açıksa kapanmaz (bulundu); diğerleri gecikmeyle kapanır
              if (hidden) {
                setOpen(pw, e, true, now);
              } else {
                const t = (closeT.get(p.id) || 0) + step;
                if (t >= CLOSE_DELAY) {
                  closeT.delete(p.id);
                  setOpen(pw, e, false, now);
                } else {
                  closeT.set(p.id, t);
                  syncCollider(pw, e, true);
                }
              }
            } else {
              setOpen(pw, e, false, now);
            }
          }
        }
      }
      stats.managed = managed;
    },
  };
}
