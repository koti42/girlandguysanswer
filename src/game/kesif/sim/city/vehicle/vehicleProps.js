/*
 * KEŞİF sim/city/vehicle — ARAÇ YÖNETİCİSİ + ARAÇ PROP'U (Faz 3, vehicle_phys). SAF (three/DOM yok); dünya/prop/ColliderIndex nesneleri `deps` işlevleriyle
 * her çağrıda taze okunur (hiçbir şey önbelleğe alınmaz). Sözleşme §6 (dinamik prop), §9 (garaj/kiralama/çağırma), §14 (kayıt).
 *
 * Prop katmanı: her etkin araç PropWorld'e DİNAMİK prop olarak eklenir (t = VEHICLE_T0 + sınıf sırası; tanım PropWorld.getDef sarmalayıcısıyla), böylece
 * hedef nişanı/ışın ("Araca bin"), kullan yolu (propUse → davranış `arac` → olay `vehicleUse`) ve ColliderIndex (park halindeki/sürülen araç; oyuncu ve
 * diğer sistemler çarpar) çalışır. Çarpışma kutusu tam OBB'nin AABB'sidir (prop yaw'ı 90° nicemlidir; yalnız ışın kutusu nicemli kalır).
 * Garaj terminali: dinamik prop `garaj_terminali` (t = GARAGE_T), davranış `garaj` → openUi 'garage'.
 *
 *   VEHICLE_T0 · GARAGE_T · VEHICLE_PROP_DEFS · GARAGE_DEF · classOfT(t) · propDefOf(t) · installVehicleDefs(pw)
 *   createVehicleManager(deps) → mgr          deps: {seed(), props(), world(), pois(), now(), wallet?, roadSnap?(x,z,y), isSoft?}
 *   mgr.entries Map<id, Entry>  mgr.version (eklenince/çıkınca artar)  mgr.driven  mgr.save (vehicleSave nesnesi, CANLI)  mgr.stats
 *   Entry = {id, propId, v (Vehicle), role:'owned'|'rental'|'display', ownedIdx, poi, parked, occupied, prev{…}, exitedAt, installed}
 *   mgr.list() · get(id) · nearest(x,y,z,r) · spawn(opts) · remove(id) · begin(id) · end() · syncProp(e) · recordPrev(e) · interp(e, alpha, out)
 *   mgr.stash() / mgr.unstash()   boyut değişimi            mgr.restore(raw)   mgr.serialize()   mgr.dispose()
 *   mgr.summon(from) · rent(cls, from) · buy(cls) · setActive(i) · paint(i, cos) · refreshDisplays(px,pz) · tick(dt, px,pz) → olay listesi
 */
import { hash3 } from '../../rng.js';
import { fx, registerPropBehavior } from '../../props/propBehaviors.js';
import {
  RENTAL_SECONDS, RENTAL_WARN_SECONDS, VEHICLE_CLASSES, VEHICLE_DEFS, defaultCosmetics, getVehicleDef, plateFor, purchasePrice, rentalPrice, sanitizeCosmetics, unlockStatus,
} from './vehicleData.js';
import {
  aabbOf, createVehicle, findFreePose, parkVehicle, restoreVehicle, setPose,
} from './vehiclePhysics.js';
import {
  MAX_OWNED, defaultVehicleSave, sanitizeVehicleSave,
} from './vehicleSave.js';

export const VEHICLE_T0 = 60101;
export const GARAGE_T = 60201;
export const ACTIVATE_R = 110;
export const DEACTIVATE_R = 150;
export const SUMMON_R = 40;
export const SUMMON_DESPAWN_FAR = 300;
export const SUMMON_DESPAWN_IDLE_FAR = 80;
export const SUMMON_DESPAWN_IDLE_SEC = 60;
export const ENTER_R = 2.8;

const STATE_PARKED = 0;
const STATE_RENTABLE = 1;
const STATE_OCCUPIED = 2;
const ROLE_CODE = { owned: 1, rental: 2, display: 3 };
const DISPLAY_CLASSES = Object.freeze(['taksi', 'motor', 'kamyonet', 'spor']);

function freezeDef(d) {
  return Object.freeze(Object.assign(d, {
    size: Object.freeze(d.size),
    colliders: Object.freeze(d.colliders.map((b) => Object.freeze(b))),
    tags: Object.freeze(d.tags),
    model: Object.freeze(d.model),
    interact: Object.freeze(d.interact),
    trigger: Object.freeze(d.trigger),
  }));
}

/** Sınıf başına prop tanımı: yerel Z = aracın uzun ekseni. */
export const VEHICLE_PROP_DEFS = Object.freeze(VEHICLE_CLASSES.map((cls, i) => {
  const d = VEHICLE_DEFS[cls];
  const q16 = (x) => Math.round(x * 16) / 16; // propDefs: çarpışma kutuları 1/16 katı (gerçek çarpışma ColliderIndex'te tam OBB'nin AABB'si ile ezilir)
  const hw = q16(d.width * 0.5);
  const hl = q16(d.length * 0.5);
  return freezeDef({
    t: VEHICLE_T0 + i,
    key: 'arac_' + cls,
    name: d.name,
    model: { meshKey: 'arac_' + cls },
    size: [d.width, d.height, d.length],
    colliders: [[-hw, 0, -hl, hw, q16(d.height), hl]],
    trigger: [-hw - 0.45, 0, -hl - 0.45, hw + 0.45, d.height + 0.3, hl + 0.45],
    interact: { kind: 'arac', prompt: 'Araca bin', range: 3.4 },
    states: 3,
    emissive: 0.5,
    light: undefined,
    holo: false,
    sign: undefined,
    tags: ['arac', 'dinamik'],
    dimBound: undefined,
    dyn: true,
  });
}));

export const GARAGE_DEF = freezeDef({
  t: GARAGE_T,
  key: 'garaj_terminali',
  name: 'Garaj Terminali',
  model: { meshKey: 'garaj_terminali' },
  size: [1, 2, 0.875],
  colliders: [[-0.5, 0, -0.4375, 0.5, 2, 0.4375]],
  trigger: [-0.6875, 0, -0.6, 0.6875, 2.1, 0.6],
  interact: { kind: 'garaj', prompt: 'Garaj terminalini kullan', range: 3.0 },
  states: 1,
  emissive: 1,
  light: { level: 10, hue: 'kehribar' },
  holo: false,
  sign: undefined,
  tags: ['garaj', 'terminal', 'dinamik'],
  dimBound: undefined,
  dyn: true,
});

const DEF_BY_T = Object.create(null);
VEHICLE_PROP_DEFS.forEach((d) => { DEF_BY_T[d.t] = d; });
DEF_BY_T[GARAGE_T] = GARAGE_DEF;

export function propDefOf(t) {
  return DEF_BY_T[t] || null;
}

export function classOfT(t) {
  const i = t - VEHICLE_T0;
  return Number.isInteger(i) && i >= 0 && i < VEHICLE_CLASSES.length ? VEHICLE_CLASSES[i] : null;
}

export function installVehicleDefs(pw) {
  if (!pw || pw.vehicleDefsInstalled) return false;
  const orig = pw.getDef;
  pw.getDef = (t) => DEF_BY_T[t] || orig.call(pw, t);
  pw.vehicleDefsInstalled = true;
  return true;
}

/* ------------------------------------------------------------------------------------------------
 * Davranışlar
 * ---------------------------------------------------------------------------------------------- */
registerPropBehavior('arac', {
  volatile: true,
  onUse(ctx, prop, st) {
    if (st.state === STATE_OCCUPIED) return { effects: [fx.message('Bu aracı zaten sürüyorsun.')] };
    return { effects: [fx.emit({ type: 'vehicleUse', propId: prop.id })] };
  },
  hint(st, prop) {
    const cls = classOfT(prop.t);
    const d = cls ? VEHICLE_DEFS[cls] : null;
    if (st.state === STATE_OCCUPIED) return 'Sürülüyor';
    if (st.state === STATE_RENTABLE && d) return d.rent > 0 ? 'Kirala: ' + d.name + ' — ' + d.rent + ' Kredi / 10 dk' : 'Bin: ' + d.name + ' (ücretsiz)';
    return d ? 'Araca bin: ' + d.name : 'Araca bin';
  },
});

registerPropBehavior('garaj', {
  volatile: true,
  onUse(ctx, prop) {
    return { effects: [fx.sound('ui_open', prop.x, prop.y + 1, prop.z), fx.emit({ type: 'garageUse', propId: prop.id }), fx.openUi('garage')] };
  },
  hint() {
    return 'Garaj terminalini kullan';
  },
});

/* ------------------------------------------------------------------------------------------------
 * Yönetici
 * ---------------------------------------------------------------------------------------------- */
const HALF_PI = Math.PI / 2;
const yawIndex = (yaw) => Math.round(yaw / HALF_PI) & 3;
const _box = {
  minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0,
};

export function createVehicleManager(deps) {
  const entries = new Map();
  const garageProps = new Map(); // poi.id → prop kimliği (garaj terminali)
  const displayCool = new Map(); // 'poi:slot' → şehir saniyesi (kiralanan sergi aracının yerine yenisi bu süre dolana dek konmaz)
  let save = defaultVehicleSave();
  let seq = 1;
  let stashed = false;
  let lastRefresh = -99;
  const stats = {
    spawned: 0, removed: 0, summons: 0, rentals: 0, purchases: 0, stashes: 0, despawned: 0,
  };
  const mgr = {
    entries,
    version: 0,
    driven: null,
    stats,
    deps,
  };

  const seed = () => (deps.seed ? deps.seed() | 0 : 0);
  const pw = () => (deps.props ? deps.props() : null);
  const world = () => (deps.world ? deps.world() : null);
  const wallet = () => (deps.wallet || null);
  const now = () => (deps.now ? deps.now() : 0);

  function newId(role, n) {
    const p = pw();
    let id = (hash3(n | 0, ROLE_CODE[role] | 0, 0x5645, seed()) | 0x80000000) >>> 0;
    while (entries.has(id) || (p && p.has(id))) id = (id + 1) >>> 0 || 0x80000001;
    return id;
  }

  /* ---------- prop + collider ---------- */
  function propState(e) {
    return e.occupied ? STATE_OCCUPIED : e.role === 'display' ? STATE_RENTABLE : STATE_PARKED;
  }

  function install(e) {
    const p = pw();
    if (!p || e.installed || stashed) return false;
    installVehicleDefs(p);
    const t = VEHICLE_T0 + VEHICLE_CLASSES.indexOf(e.v.cls);
    const v = e.v;
    const ok = p.addDynamic({
      id: e.propId, t, x: v.x, y: v.y, z: v.z, yaw: yawIndex(v.yaw), variant: 0, flags: 0,
    });
    if (!ok) return false;
    e.installed = true;
    p.setState(e.propId, propState(e));
    overrideCollider(e, p);
    return true;
  }

  function overrideCollider(e, p) {
    const cc = p.colliders;
    if (!cc) return;
    aabbOf(e.v, _box);
    cc.setDynamic(e.propId, _box, null);
  }

  function uninstall(e) {
    const p = pw();
    if (p && e.installed) p.removeDynamic(e.propId);
    e.installed = false;
  }

  /** Sürülen/park araç değişti: prop + collider güncelle (araç hızı platform taşıma için ColliderIndex'e verilir). */
  function syncProp(e) {
    const p = pw();
    if (!p || !e.installed) return false;
    const v = e.v;
    p.moveDynamic(e.propId, v.x, v.y, v.z, yawIndex(v.yaw), null);
    overrideCollider(e, p);
    const st = propState(e);
    if (p.state(e.propId) !== st) p.setState(e.propId, st);
    return true;
  }

  function recordPrev(e) {
    const v = e.v;
    const q = e.prev;
    q.x = v.x; q.y = v.y; q.z = v.z; q.yaw = v.yaw; q.pitch = v.pitch; q.roll = v.roll; q.wheelSpin = v.wheelSpin; q.steer = v.wheelAngle;
  }

  function interp(e, alpha, out) {
    const o = out || {};
    const v = e.v;
    const q = e.prev;
    const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
    o.x = q.x + (v.x - q.x) * a;
    o.y = q.y + (v.y - q.y) * a;
    o.z = q.z + (v.z - q.z) * a;
    let dy = v.yaw - q.yaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    else if (dy < -Math.PI) dy += Math.PI * 2;
    o.yaw = q.yaw + dy * a;
    o.pitch = q.pitch + (v.pitch - q.pitch) * a;
    o.roll = q.roll + (v.roll - q.roll) * a;
    o.wheelSpin = q.wheelSpin + (v.wheelSpin - q.wheelSpin) * a;
    o.steer = q.steer + (v.wheelAngle - q.steer) * a;
    return o;
  }

  /* ---------- oluşturma / silme ---------- */
  /**
   * opts {cls, x,y,z,yaw, role:'owned'|'rental'|'display', ownedIdx, poi, cosmetics, maxR, exact}
   * exact:true → yalnız verilen poz (boş değilse null); aksi halde en yakın boş poz aranır (maxR, varsayılan 6).
   */
  function spawn(opts) {
    const o = opts || {};
    const d = getVehicleDef(o.cls);
    const w = world();
    if (!d || !w || stashed) return null;
    const role = o.role === 'rental' || o.role === 'display' ? o.role : 'owned';
    let pose = { x: o.x, y: o.y, z: o.z, yaw: Number.isFinite(o.yaw) ? o.yaw : 0 };
    if (![pose.x, pose.y, pose.z].every(Number.isFinite)) return null;
    const free = findFreePose(w, d, pose.x, pose.y, pose.z, pose.yaw, { maxR: o.exact ? 0.01 : o.maxR || 6, colliders: w.colliders || null });
    if (!free) return null;
    pose = free;
    const id = newId(role, seq++);
    const v = createVehicle(o.cls, {
      id, propId: id, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, cosmetics: o.cosmetics || defaultCosmetics(o.cls, seed()), owner: role, dmg: o.dmg,
    });
    setPose(v, pose.x, pose.y, pose.z, pose.yaw);
    const e = {
      id,
      propId: id,
      v,
      role,
      ownedIdx: Number.isInteger(o.ownedIdx) ? o.ownedIdx : -1,
      poi: Number.isInteger(o.poi) ? o.poi : -1,
      parked: true,
      occupied: false,
      installed: false,
      exitedAt: now(),
      prev: {
        x: v.x, y: v.y, z: v.z, yaw: v.yaw, pitch: 0, roll: 0, wheelSpin: 0, steer: 0,
      },
    };
    entries.set(id, e);
    install(e);
    mgr.version++;
    stats.spawned++;
    return e;
  }

  function remove(id) {
    const e = entries.get(id);
    if (!e) return false;
    if (mgr.driven === e) mgr.driven = null;
    uninstall(e);
    entries.delete(id);
    mgr.version++;
    stats.removed++;
    return true;
  }

  function list() {
    return Array.from(entries.values());
  }

  function get(id) {
    return entries.get(id) || null;
  }

  function byProp(propId) {
    return entries.get(propId >>> 0) || null;
  }

  function nearest(x, y, z, r) {
    let best = null;
    let bd = (r > 0 ? r : ENTER_R) ** 2;
    entries.forEach((e) => {
      if (e.occupied) return;
      const v = e.v;
      // araç gövdesine (AABB) en kısa mesafe
      aabbOf(v, _box);
      const dx = x < _box.minX ? _box.minX - x : x > _box.maxX ? x - _box.maxX : 0;
      const dz = z < _box.minZ ? _box.minZ - z : z > _box.maxZ ? z - _box.maxZ : 0;
      const dy = y + 0.9 < v.y ? v.y - y - 0.9 : y + 0.9 > v.y + v.def.height ? y + 0.9 - v.y - v.def.height : 0;
      const d2 = dx * dx + dz * dz + dy * dy;
      if (d2 <= bd) {
        bd = d2;
        best = e;
      }
    });
    return best;
  }

  /* ---------- sürüş ---------- */
  function begin(id) {
    const e = entries.get(id);
    if (!e || e.occupied) return false;
    if (mgr.driven) end();
    e.occupied = true;
    e.parked = false;
    mgr.driven = e;
    recordPrev(e);
    const p = pw();
    if (p && e.installed) p.setState(e.propId, STATE_OCCUPIED);
    save.vstats.enters++;
    return true;
  }

  function end() {
    const e = mgr.driven;
    if (!e) return null;
    e.occupied = false;
    e.parked = true;
    e.exitedAt = now();
    mgr.driven = null;
    parkVehicle(e.v);
    const p = pw();
    if (p && e.installed) {
      p.setState(e.propId, propState(e));
      syncProp(e);
    }
    persistPoses();
    return e;
  }

  /* ---------- kayıt ---------- */
  function persistPoses() {
    entries.forEach((e) => {
      if (e.role === 'owned' && save.summoned && e.ownedIdx === save.summoned.idx) {
        save.summoned.x = Math.round(e.v.x * 100) / 100;
        save.summoned.y = Math.round(e.v.y * 100) / 100;
        save.summoned.z = Math.round(e.v.z * 100) / 100;
        save.summoned.yaw = Math.round(e.v.yaw * 1000) / 1000;
        save.summoned.dmg = Math.round(e.v.dmg * 100) / 100;
      } else if (e.role === 'rental' && save.rental) {
        save.rental.x = Math.round(e.v.x * 100) / 100;
        save.rental.y = Math.round(e.v.y * 100) / 100;
        save.rental.z = Math.round(e.v.z * 100) / 100;
        save.rental.yaw = Math.round(e.v.yaw * 1000) / 1000;
        save.rental.dmg = Math.round(e.v.dmg * 100) / 100;
      }
    });
  }

  function serialize() {
    persistPoses();
    return sanitizeVehicleSave(save);
  }

  /** Kayıttan yükle (ctx.city içeriği). Etkin araçlar kayıtlı pozda kurulur (boş poz aranır). */
  function restore(raw) {
    clearAll();
    save = sanitizeVehicleSave(raw);
    const s = save.summoned;
    if (s && save.garage.owned[s.idx]) {
      const o = save.garage.owned[s.idx];
      const e = spawn({
        cls: o.cls, x: s.x, y: s.y, z: s.z, yaw: s.yaw, role: 'owned', ownedIdx: s.idx, cosmetics: o.cos, maxR: 10, dmg: s.dmg,
      });
      if (!e) save.summoned = null;
    }
    const r = save.rental;
    if (r) {
      const e = spawn({
        cls: r.cls, x: r.x, y: r.y, z: r.z, yaw: r.yaw, role: 'rental', maxR: 10, dmg: r.dmg,
      });
      if (!e) save.rental = null;
    }
    return mgr;
  }

  function clearAll() {
    Array.from(entries.keys()).forEach((id) => remove(id));
    garageProps.forEach((pid) => {
      const p = pw();
      if (p) p.removeDynamic(pid);
    });
    garageProps.clear();
    mgr.driven = null;
  }

  /* ---------- garaj işlemleri ---------- */
  function ownedIndex(cls) {
    for (let i = 0; i < save.garage.owned.length; i++) if (save.garage.owned[i].cls === cls) return i;
    return -1;
  }

  function addOwned(cls) {
    if (!getVehicleDef(cls) || ownedIndex(cls) >= 0 || save.garage.owned.length >= MAX_OWNED) return -1;
    save.garage.owned.push({ cls, cos: defaultCosmetics(cls, seed()) });
    return save.garage.owned.length - 1;
  }

  function buy(cls) {
    const d = getVehicleDef(cls);
    if (!d) return { ok: false, reason: 'bilinmeyen' };
    if (ownedIndex(cls) >= 0) return { ok: false, reason: 'sahip' };
    if (save.garage.owned.length >= MAX_OWNED) return { ok: false, reason: 'dolu' };
    const u = unlockStatus(cls, { km: save.vstats.km });
    if (!u.ok) return { ok: false, reason: 'kilit', need: u.need };
    const price = purchasePrice(cls);
    const wl = wallet();
    if (price > 0) {
      if (!wl) return { ok: false, reason: 'cuzdan' };
      if (wl.get() < price) return { ok: false, reason: 'kredi', need: price };
      if (!wl.spend(price, 'arac:' + cls)) return { ok: false, reason: 'kredi', need: price };
    }
    const idx = addOwned(cls);
    stats.purchases++;
    return { ok: true, idx, price };
  }

  /** Kozmetik hasarı onarır (ücretsiz): çağrılmış/kiralık araçların dmg'si sıfırlanır. */
  function repair() {
    let n = 0;
    entries.forEach((e) => {
      if (e.v.dmg > 0 && e.role !== 'display') {
        e.v.dmg = 0;
        n++;
      }
    });
    if (save.summoned) save.summoned.dmg = 0;
    if (save.rental) save.rental.dmg = 0;
    return n;
  }

  function setActive(i) {
    if (!Number.isInteger(i) || i < 0 || i >= save.garage.owned.length) return false;
    save.garage.active = i;
    return true;
  }

  function paint(i, cos) {
    const o = save.garage.owned[i];
    if (!o) return false;
    o.cos = sanitizeCosmetics(Object.assign({}, o.cos, cos), o.cls);
    entries.forEach((e) => {
      if (e.role === 'owned' && e.ownedIdx === i) e.v.cosmetics = o.cos;
    });
    return true;
  }

  function freeSlotNear(x, z, r) {
    const pl = deps.pois ? deps.pois() : [];
    const w = world();
    let best = null;
    let bd = r * r;
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i];
      if (p.type !== 'park_slot') continue;
      const d2 = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d2 > bd) continue;
      let taken = false;
      entries.forEach((e) => {
        if ((e.v.x - p.x) ** 2 + (e.v.z - p.z) ** 2 < 9) taken = true;
      });
      if (taken) continue;
      if (w) best = p;
      bd = d2;
    }
    return best;
  }

  /** Aktif aracı çağır: ≤ 40 m'deki en yakın boş park yerine (yoksa en yakın yol kenarına) yerleştirir. */
  function summon(from) {
    if (stashed) return { ok: false, reason: 'boyut' };
    const owned = save.garage.owned[save.garage.active];
    if (!owned) return { ok: false, reason: 'arac-yok' };
    // zaten çağrılmış mı?
    let existing = null;
    entries.forEach((e) => {
      if (e.role === 'owned' && e.ownedIdx === save.garage.active) existing = e;
    });
    if (existing && existing.occupied) return { ok: false, reason: 'surulen' };
    if (existing) {
      // yer değiştir: aynı araç oyuncunun yanına taşınır (eski yerinden kaldırılır)
      remove(existing.id);
    }
    // başka bir sahip olunan araç çağrılmışsa garaja iade
    entries.forEach((e) => {
      if (e.role === 'owned' && !e.occupied) remove(e.id);
    });
    save.summoned = null;
    const slot = freeSlotNear(from.x, from.z, SUMMON_R);
    let pose = null;
    let how = 'park';
    if (slot) pose = { x: slot.x, y: slot.y, z: slot.z, yaw: slot.yaw };
    else if (deps.roadSnap) {
      const s = deps.roadSnap(from.x, from.z, from.y);
      if (s && (s.x - from.x) ** 2 + (s.z - from.z) ** 2 < SUMMON_R * SUMMON_R && Math.abs(s.y - from.y) < 3) {
        pose = { x: s.x, y: s.y, z: s.z, yaw: Number.isFinite(s.yaw) ? s.yaw : 0 };
        how = 'yol';
      }
    }
    if (!pose && Number.isFinite(from.x + from.z)) {
      // yol/park yeri yok (meydan, çatı…): oyuncunun yanındaki en yakın boş zemin
      pose = { x: from.x, y: from.y, z: from.z, yaw: Number.isFinite(from.yaw) ? from.yaw : 0 };
      how = 'yanin';
    }
    if (!pose) return { ok: false, reason: 'park' };
    const e = spawn({
      cls: owned.cls, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw, role: 'owned', ownedIdx: save.garage.active, cosmetics: owned.cos, maxR: how === 'yanin' ? 12 : 6,
    });
    if (!e) return { ok: false, reason: 'park' };
    save.summoned = {
      idx: save.garage.active, x: e.v.x, y: e.v.y, z: e.v.z, yaw: e.v.yaw,
    };
    stats.summons++;
    return { ok: true, entry: e, how };
  }

  /** Kirala: sınıf için ücret düşülür; kiralık araç `from` yakınında (ya da displayEntry konumunda) belirir; varsa eski kiralık teslim edilir. */
  function rent(cls, at, displayEntry) {
    const d = getVehicleDef(cls);
    if (!d) return { ok: false, reason: 'bilinmeyen' };
    if (stashed) return { ok: false, reason: 'boyut' };
    const price = rentalPrice(cls);
    const wl = wallet();
    if (price > 0) {
      if (!wl) return { ok: false, reason: 'cuzdan' };
      if (wl.get() < price) return { ok: false, reason: 'kredi', need: price };
    }
    let old = null;
    entries.forEach((e) => {
      if (e.role === 'rental') old = e;
    });
    if (old && old.occupied) return { ok: false, reason: 'surulen' };
    if (old) remove(old.id);
    const base = displayEntry ? { x: displayEntry.v.x, y: displayEntry.v.y, z: displayEntry.v.z, yaw: displayEntry.v.yaw } : at;
    const dispPoi = displayEntry ? displayEntry.poi : -1;
    const dispSlot = displayEntry ? displayEntry.slot : -1;
    if (displayEntry) remove(displayEntry.id); // sergi aracı kiralığa dönüşür: yeri açılır
    const e = spawn({
      cls, x: base.x, y: base.y, z: base.z, yaw: base.yaw || 0, role: 'rental', maxR: displayEntry ? 1 : 6,
    });
    if (!e || (price > 0 && !wl.spend(price, 'kira:' + cls))) {
      if (e) remove(e.id);
      if (displayEntry) {
        // sergiyi geri kur
        const back = spawn({
          cls, x: base.x, y: base.y, z: base.z, yaw: base.yaw || 0, role: 'display', poi: dispPoi, maxR: 1,
        });
        if (back) back.slot = dispSlot;
      }
      return { ok: false, reason: e ? 'kredi' : 'yer', need: price };
    }
    if (displayEntry) displayCool.set(dispPoi + ':' + dispSlot, now() + 20);
    save.rental = {
      cls, left: RENTAL_SECONDS, x: e.v.x, y: e.v.y, z: e.v.z, yaw: e.v.yaw,
    };
    e.warned = false;
    stats.rentals++;
    return { ok: true, entry: e, price };
  }

  /* ---------- sergi araçları + garaj terminalleri (POI'ler) ---------- */
  function poiDisplayClass(poi) {
    return DISPLAY_CLASSES[hash3(poi.id | 0, 0x4b49, 0x52, seed()) % DISPLAY_CLASSES.length];
  }

  function displayAt(poiId, slot) {
    let found = null;
    entries.forEach((e) => {
      if (e.role === 'display' && e.poi === poiId && e.slot === slot) found = e;
    });
    return found;
  }

  /** Oyuncuya yakın kiralama noktalarına sergi araçları (sınıf + ücretsiz Süzülkay), garaj kapılarına terminal kurar; uzakları kaldırır. */
  function refreshDisplays(px, pz) {
    if (stashed) return;
    const pl = deps.pois ? deps.pois() : [];
    const p = pw();
    const w = world();
    if (!p || !w) return;
    installVehicleDefs(p);
    for (let i = 0; i < pl.length; i++) {
      const poi = pl[i];
      if (poi.type !== 'rental' && poi.type !== 'garage') continue;
      const d2 = (poi.x - px) ** 2 + (poi.z - pz) ** 2;
      if (poi.type === 'rental') {
        for (let s = 0; s < 2; s++) {
          const cur = displayAt(poi.id, s);
          if (d2 <= ACTIVATE_R * ACTIVATE_R && !cur && now() >= (displayCool.get(poi.id + ':' + s) || 0)) {
            const cls = s === 0 ? poiDisplayClass(poi) : 'suzulkay';
            const sy = Math.sin(poi.yaw || 0);
            const cy = Math.cos(poi.yaw || 0);
            const side = s === 0 ? 4.5 : -3.2;
            const e = spawn({
              cls, x: poi.x + cy * side, y: poi.y, z: poi.z - sy * side, yaw: poi.yaw || 0, role: 'display', poi: poi.id, maxR: 7,
            });
            if (e) e.slot = s;
          } else if (d2 > DEACTIVATE_R * DEACTIVATE_R && cur && !cur.occupied) remove(cur.id);
        }
      } else {
        const have = garageProps.has(poi.id);
        if (d2 <= ACTIVATE_R * ACTIVATE_R && !have) {
          const sy = Math.sin(poi.yaw || 0);
          const cy = Math.cos(poi.yaw || 0);
          const id = newId('display', 100000 + poi.id);
          const ok = p.addDynamic({
            id, t: GARAGE_T, x: poi.x + cy * 2.2, y: poi.y, z: poi.z - sy * 2.2, yaw: yawIndex((poi.yaw || 0) + Math.PI), variant: 0, flags: 0,
          });
          if (ok) garageProps.set(poi.id, id);
        } else if (d2 > DEACTIVATE_R * DEACTIVATE_R && have) {
          p.removeDynamic(garageProps.get(poi.id));
          garageProps.delete(poi.id);
        }
      }
    }
  }

  /** Sabit adım zamanlayıcıları: kiralama süresi, çağrılmış aracın otomatik iadesi, sergi tazeleme. Olay listesi döner. */
  const _events = [];
  function tick(dt, px, pz) {
    _events.length = 0;
    if (stashed) return _events;
    const t = now();
    if (t - lastRefresh > 0.5 || t < lastRefresh) {
      lastRefresh = t;
      refreshDisplays(px, pz);
    }
    const toRemove = [];
    entries.forEach((e) => {
      if (e.role === 'rental' && save.rental) {
        save.rental.left -= dt;
        if (!e.warned && save.rental.left <= RENTAL_WARN_SECONDS) {
          e.warned = true;
          _events.push({ type: 'rentalWarn', id: e.id, left: Math.max(0, Math.round(save.rental.left)) });
        }
        if (save.rental.left <= 0) {
          _events.push({ type: 'rentalEnd', id: e.id, driven: e.occupied });
          toRemove.push(e);
        }
      } else if (e.role === 'owned' && !e.occupied) {
        const d2 = (e.v.x - px) ** 2 + (e.v.z - pz) ** 2;
        const idle = t - e.exitedAt;
        if (d2 > SUMMON_DESPAWN_FAR * SUMMON_DESPAWN_FAR || (d2 > SUMMON_DESPAWN_IDLE_FAR * SUMMON_DESPAWN_IDLE_FAR && idle > SUMMON_DESPAWN_IDLE_SEC)) {
          _events.push({ type: 'summonedDespawn', id: e.id });
          toRemove.push(e);
        }
      }
    });
    for (let i = 0; i < toRemove.length; i++) {
      const e = toRemove[i];
      if (e.role === 'rental') save.rental = null;
      else if (e.role === 'owned') save.summoned = null;
      if (e.occupied) {
        // sürülürken biten kiralama: sistem önce oyuncuyu indirir (rentalEnd olayı driven:true)
        e.pendingRemove = true;
      } else {
        remove(e.id);
        stats.despawned++;
      }
    }
    return _events;
  }

  /** Boyut değişimi: tüm araç propları ve collider'lar kaldırılır; çağrılmış/kiralık araçlar iade edilir (kayıttan siliniyor). */
  function stash() {
    stats.stashes++;
    displayCool.clear();
    Array.from(entries.values()).forEach((e) => {
      if (e.role === 'display') remove(e.id);
      else {
        if (e.role === 'rental') save.rental = null;
        if (e.role === 'owned') save.summoned = null;
        remove(e.id);
      }
    });
    clearAll();
    stashed = true;
  }

  function unstash() {
    stashed = false;
    lastRefresh = -99;
  }

  function dispose() {
    clearAll();
    stashed = true;
  }

  Object.assign(mgr, {
    list, get, byProp, nearest, spawn, remove, begin, end, repair, syncProp, recordPrev, interp, stash, unstash, restore, serialize, dispose, summon, rent, buy, setActive,
    paint, addOwned, ownedIndex, refreshDisplays, tick, install, uninstall, plateOf: (i) => plateFor(seed(), i),
  });
  Object.defineProperty(mgr, 'save', { get: () => save, enumerable: true });
  Object.defineProperty(mgr, 'stashed', { get: () => stashed, enumerable: true });
  void restoreVehicle;
  return mgr;
}
