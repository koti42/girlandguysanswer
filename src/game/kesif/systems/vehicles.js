/*
 * KEŞİF — "vehicles" sistemi (order 26): sürülebilir araçlar (Neon Meridyen Faz 3). Sözleşme KESIF_CITY_CONTRACT §9, §12, §14, §20. gameSystems.js otomatik yükler.
 * Sırası: oyuncu hareketinden (core.player −100) SONRA, kameradan ÖNCE. Sürüş sırasında core.player stepPlayer'ı atlar (G.player.vehicle) ve oyuncu gövdesini
 * araç koltuğuna bu sistem sabitler; kamera donanımı (gameCamera) çalıştıktan sonra frameUpdate'te sürücü kamerası kamerayı ezer.
 *
 *   G.vehicles            boyut-bağlı VehicleManager (sim/city/vehicle/vehicleProps.js; overworld'de null). G.player.vehicle: sürülen araç kimliği | null.
 *   G.vehicleCam          sürücü kamerası {mode, cycle()}        G.vehicleInput  son okunan sürüş girdisi
 *   Girdi: G.inputState.vehicle (vehicle_ui) ya da standart girdiden türetme (bkz. vehiclesInput.js). F: bin/in (iniş ≤ 6 m/sn, yoksa uyarı).
 *   Olaylar (G.emit): vehicleEnter {id,cls,role} · vehicleExit {id,cls,reason} · vehiclePhys {ev:{type,…}, id, cls} (her fizik olayı: bump shift land driftBoost …)
 *                     bump {impact,soft,x,y,z} · driftBoost {gain} · vehicleSummon {id,cls,how} · vehicleRent {id,cls,price} · vehicleRentalEnd · kredi {value,delta,why}
 *   Dinler: vehicleUse (araç propu kullanıldı) · propUi {ui:'garage'} · death/respawn · dimensionChanged.
 *   API: getVehicleState() · enterVehicle() · exitVehicle() · summonVehicle() · rentVehicle(cls) · getGarage() · setGarage({active, paint}) · buyVehicle(cls) · setVehicleCamera(n)
 *   Hata ayıklama komutları: car <sınıf> · kredi <n> · vstat · vreset
 * Kayıt: araç durumu `dims.neon.city` içinde (garage/summoned/rental/vstats; bkz. vehicleSave.js) CANLI tutulur; boyut kaydına ayrı iş gerekmez.
 */
import { resetBody } from '../sim/physics.js';
import { pois as cityPois } from '../sim/city/cityPlan.js';
import { roadSnapFor } from '../sim/city/vehicle/vehicleRoad.js';
import { stepVehicle, hudOf, resetToRoad } from '../sim/city/vehicle/vehiclePhysics.js';
import { findExitSpot } from '../sim/city/vehicle/vehicleExit.js';
import { createVehicleManager, ENTER_R } from '../sim/city/vehicle/vehicleProps.js';
import {
  COSMETICS, VEHICLE_CLASSES, VEHICLE_DEFS, purchasePrice, rentalPrice, unlockStatus, isVehicleClass,
} from '../sim/city/vehicle/vehicleData.js';
import { writeVehicleSave } from '../sim/city/vehicle/vehicleSave.js';
import { createDriveInputState, readDriveInput } from './vehiclesInput.js';
import { createDriverCamera } from './vehiclesCam.js';
import { installVehicleCommands } from './vehiclesCommands.js';

export const VEHICLES_ORDER = 26;
export const START_KREDI = 100;
export const MAX_EXIT_SPEED = 6;
const FLUSH_EVERY = 1;
const ENTER_GUARD_TICKS = 14;

export function createSystem(G) {
  const inState = createDriveInputState();
  const input = {
    steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false, hop: false, steerDirect: false, cameraPressed: false, hornPressed: false, resetPressed: false, exitPressed: false,
  };
  const cam = createDriverCamera(G);
  const interp = {};
  const vctx = {
    wet: 0, roadSnap: null, chunkAhead: null, isSoft: null,
  };
  let flushAcc = 0;
  let enteredTick = -1000;
  let useTick = -1000;
  let kmMark = 0;
  let hintAt = -10;
  let pendingRaw = null;
  let pendingT = 0;
  const styleLog = [];
  const sys = { stats: { steps: 0, enters: 0, exits: 0, forcedExits: 0 } };

  /* ---------- yardımcılar ---------- */
  function say(text, key) {
    if (typeof G.hint === 'function') G.hint(text, { ttl: 4200, priority: 4, key: key || 'veh:' + text, cooldown: 600 });
    else if (G.hud) G.hud.hint = text;
    if (typeof G.speak === 'function') G.speak(text);
  }

  function citySeed() {
    return G.world ? G.world.seed : 0;
  }

  function neonCtx() {
    return G.dimMgr ? G.dimMgr.get('neon') : null;
  }

  function cityBlob() {
    const c = neonCtx();
    if (!c) return null;
    if (!c.city || typeof c.city !== 'object') c.city = { v: 1 };
    return c.city;
  }

  const wallet = {
    get() {
      const c = cityBlob();
      if (!c) return 0;
      if (!Number.isInteger(c.kredi)) c.kredi = START_KREDI;
      return c.kredi;
    },
    spend(n, why) {
      const c = cityBlob();
      if (!c || !Number.isInteger(n) || n < 0) return false;
      if (wallet.get() < n) return false;
      c.kredi -= n;
      if (n > 0) G.emit({ type: 'kredi', value: c.kredi, delta: -n, why: why || '' });
      return true;
    },
    add(n, why) {
      const c = cityBlob();
      if (!c || !Number.isInteger(n) || n <= 0 || n > 1000000000) return false;
      c.kredi = Math.min(1000000000, wallet.get() + n); // qa5: üst sınır kayıt doğrulayıcısıyla aynı (1e9)
      G.emit({ type: 'kredi', value: c.kredi, delta: n, why: why || '' });
      return true;
    },
  };

  function poisNow() {
    return G.world ? cityPois(citySeed()) : [];
  }

  function wetNow() {
    const u = G.materials && G.materials.uniforms && G.materials.uniforms.uWet ? G.materials.uniforms.uWet.value : 0;
    return Number.isFinite(u) ? Math.max(0, Math.min(1, u)) : 0;
  }

  function makeManager() {
    return createVehicleManager({
      seed: () => citySeed(),
      props: () => G.props,
      world: () => G.world,
      pois: () => poisNow(),
      now: () => G.time.seconds,
      wallet,
      roadSnap: (x, z, y) => (G.world ? roadSnapFor(citySeed())(x, z, y) : null),
    });
  }

  /** Geçerli boyut şehirse yöneticiyi doğrular/kurar (idempotent). */
  function manager() {
    if (G.dim !== 'neon' || !G.world) return null;
    let mgr = G.vehicles;
    if (!mgr || !mgr.entries) {
      mgr = makeManager();
      G.vehicles = mgr;
      const ctx = neonCtx();
      if (ctx) ctx.vehicles = mgr;
      pendingRaw = cityBlob();
      pendingT = 0;
    }
    if (mgr.stashed && !G.transitionActive) {
      mgr.unstash();
      pendingRaw = cityBlob();
      pendingT = 0;
    }
    return mgr;
  }

  function flush(mgr) {
    const c = cityBlob();
    if (c && mgr) writeVehicleSave(c, mgr.serialize());
  }

  function vehicleCtx() {
    vctx.wet = wetNow();
    vctx.isSoft = typeof G.isSoftCollider === 'function' ? G.isSoftCollider : null; // yayalar (Faz 4 crowd) yumuşak collider olarak kayıt olur
    if (!vctx.roadSnap) {
      vctx.roadSnap = (x, z, y) => (G.world ? roadSnapFor(citySeed())(x, z, y) : null);
      vctx.chunkAhead = (x, z) => {
        const w = G.world;
        if (!w) return true;
        const cx = Math.floor(x) >> 4;
        const cz = Math.floor(z) >> 4;
        return w.hasChunk(cx, cz) || !w.canGenerate(cx, cz);
      };
    }
    return vctx;
  }

  /** Süzülkay havada dönüşleri "Stil": 1–5 Kredi, dakikada en çok 30. */
  function styleReward(spins) {
    const t = G.time.seconds;
    while (styleLog.length > 0 && t - styleLog[0].t > 60) styleLog.shift();
    let sum = 0;
    for (let i = 0; i < styleLog.length; i++) sum += styleLog[i].n;
    const n = Math.max(1, Math.min(5, spins | 0 || 1));
    const give = Math.min(n, 30 - sum);
    if (give <= 0) return;
    styleLog.push({ t, n: give });
    wallet.add(give, 'stil');
    say('Stil! +' + give + ' Kredi', 'veh:style');
  }

  /* ---------- bin / in ---------- */
  function seatBody(e) {
    const b = G.body;
    const v = e.v;
    resetBody(b, v.x, v.y, v.z);
    b.flying = false;
    b.onGround = true;
    b.speed = 0;
    // yürüme fiziği çalışmadığı için ortam bayrakları bayat kalmasın (boğulma/sıvı/temas hasarı)
    b.inLiquid = false; b.headInLiquid = false; b.inLava = false; b.contactDps = 0; b.swimming = false; b.submergedTime = 0; b.touchClimbable = false; b.climbing = false;
    G.player.yaw = v.yaw;
    G.player.sprinting = false;
    G.player.crouching = false;
    G.eyeSim.x = b.x;
    G.eyeSim.y = b.y + b.eyeH;
    G.eyeSim.z = b.z;
    if (G._rs) {
      G._rs.px = b.x; G._rs.py = b.y; G._rs.pz = b.z; G._rs.peh = b.eyeH;
    }
  }

  function enter(e) {
    const mgr = G.vehicles;
    const p = G.player;
    if (!mgr || !e || p.dead || p.vehicle || G.simFrozen || G.transitionActive) return false;
    if (!mgr.begin(e.id)) return false;
    p.vehicle = e.id;
    kmMark = e.v.km;
    enteredTick = G.time.tick;
    cam.reset(e);
    cam.mode = G.isTouch || (G.inputState && G.inputState.touch) ? 0 : cam.mode;
    seatBody(e);
    if (G.ui !== 'none') G.setUi(null);
    sys.stats.enters++;
    G.emit({
      type: 'vehicleEnter', id: e.id, cls: e.v.cls, role: e.role,
    });
    say('Araçtasın. Çıkmak için F.', 'veh:enter');
    flush(mgr);
    return true;
  }

  function exitSpotFor(e) {
    const w = G.world;
    const cc = w.colliders || null;
    let spot = findExitSpot(w, e.v, { ignoreId: e.propId, colliders: cc });
    if (!spot) {
      // yedek 1: araca yakın herhangi bir güvenli zemin (findSafeSpawn benzeri halka), yedek 2: en yakın yol merkezi
      const snap = roadSnapFor(citySeed())(e.v.x, e.v.z, e.v.y, e.v.yaw);
      if (snap) {
        const probe = { x: snap.x, y: snap.y, z: snap.z, yaw: snap.yaw, def: e.v.def };
        spot = findExitSpot(w, probe, { ignoreId: e.propId, colliders: cc, maxR: 9 });
        if (!spot) spot = { x: snap.x, y: snap.y + 0.002, z: snap.z, yaw: snap.yaw };
      }
    }
    return spot;
  }

  function exit(opts) {
    const o = opts || {};
    const mgr = G.vehicles;
    const e = mgr ? mgr.driven : null;
    if (!e) {
      G.player.vehicle = null;
      return false;
    }
    const sp = Math.sqrt(e.v.vx * e.v.vx + e.v.vz * e.v.vz);
    if (!o.force && sp > MAX_EXIT_SPEED) {
      if (G.time.seconds - hintAt > 1.5) {
        hintAt = G.time.seconds;
        say('Önce yavaşla: araçtan 6 m/sn altında inebilirsin.', 'veh:slow');
      }
      return false;
    }
    const spot = exitSpotFor(e);
    const p = G.player;
    mgr.end();
    p.vehicle = null;
    if (G.hud) G.hud.vehicle = null;
    const v = e.v;
    if (spot && typeof G.teleport === 'function') {
      G.teleport(spot.x, spot.y, spot.z, { safe: false, yaw: spot.yaw, pitch: 0 });
    } else if (typeof G.teleport === 'function') {
      G.teleport(v.x, v.y + 1, v.z, { safe: true, maxR: 12, yaw: v.yaw });
    }
    // QA5-A-002: bu basış tüketildi. Kenar bayrağı karenin TÜM sabit adımlarında kilitli kalır (game.js clearEdges); tüketilmezse aynı karenin 2. adımında yürüme dalı
    // (ve blocks 'kullan') aynı basışı 'en yakın araca bin' diye okuyup oyuncuyu hemen geri bindirir → 'İn' hiçbir şey yapmamış görünür (≥ 2 adımlık kare: yük/düşük fps)
    if (o.reason === 'user' && G.inputState) G.inputState.interactPressed = false;
    sys.stats.exits++;
    if (o.force) sys.stats.forcedExits++;
    G.emit({
      type: 'vehicleExit', id: e.id, cls: v.cls, reason: o.reason || 'user', role: e.role,
    });
    flush(mgr);
    if (e.pendingRemove) mgr.remove(e.id);
    return true;
  }

  function handleUse(propId) {
    const mgr = G.vehicles;
    if (!mgr || G.player.vehicle) return false;
    useTick = G.time.tick;
    const e = mgr.byProp(propId);
    if (!e) return false;
    if (e.role === 'display') {
      const price = rentalPrice(e.v.cls);
      const r = mgr.rent(e.v.cls, null, e);
      if (!r.ok) {
        if (r.reason === 'kredi') say('Yetersiz Kredi: ' + price + ' Kredi gerekli.', 'veh:kredi');
        else if (r.reason === 'surulen') say('Önce şu anki kiralık aracını bırak.', 'veh:rentbusy');
        else say('Kiralama şu an yapılamıyor.', 'veh:rentfail');
        return false;
      }
      if (price > 0) say(VEHICLE_DEFS[e.v.cls].name + ' kiralandı: ' + price + ' Kredi, 10 dakika.', 'veh:rent');
      G.emit({
        type: 'vehicleRent', id: r.entry.id, cls: r.entry.v.cls, price,
      });
      flush(mgr);
      return enter(r.entry);
    }
    return enter(e);
  }

  function nearestEnterable() {
    const mgr = G.vehicles;
    const b = G.body;
    if (!mgr || !b) return null;
    return mgr.nearest(b.x, b.y, b.z, ENTER_R);
  }

  /* ---------- sürüş adımı ---------- */
  function driveStep(mgr, dt) {
    const e = mgr.driven;
    const v = e.v;
    const inp = readDriveInput(G, inState, input);
    G.vehicleInput = inp;
    if (inp.cameraPressed) cam.cycle();
    if (inp.hornPressed) G.emit({ type: 'vehicleHorn', id: e.id, cls: v.cls });
    if (inp.resetPressed) {
      // R: yola yerleştir (vehicle_ui); sürülen araç yola ışınlanır, sesli/görsel duyuru 'resetRoad' olayından gelir
      const rs = resetToRoad(v, G.world, vehicleCtx());
      if (rs) mgr.syncProp(e);
      say(rs ? 'Araç yola yerleştirildi.' : 'Yakında yol bulunamadı.', 'veh:reset');
    }
    if (inp.exitPressed && G.time.tick - enteredTick > ENTER_GUARD_TICKS) exit({ reason: 'user' });
    if (!mgr.driven) return;
    mgr.recordPrev(e);
    const ev = stepVehicle(v, inp, G.world, dt, vehicleCtx());
    sys.stats.steps++;
    if (v.km > kmMark) mgr.save.vstats.km += v.km - kmMark; // kilometre: garaj kilidi (satın alma) için
    kmMark = v.km;
    for (let i = 0; i < ev.length; i++) {
      const x = ev[i];
      G.emit({
        type: 'vehiclePhys', ev: x, id: e.id, cls: v.cls,
      });
      if (x.type === 'bump') {
        cam.bump(x.impact);
        G.emit({
          type: 'bump', impact: x.impact, soft: !!x.soft, x: x.x, y: x.y, z: x.z,
        });
        if (typeof G.haptic === 'function') G.haptic(x.impact > 12 ? 'heavy' : 'medium');
      } else if (x.type === 'driftBoost') G.emit({ type: 'driftBoost', gain: x.gain });
      else if (x.type === 'style') styleReward(x.spins);
      else if (x.type === 'waterRespawn') say('Su sınırına geldin: yola ışınlandın.', 'veh:water');
      else if (x.type === 'unstick' || x.type === 'resetRoad' || x.type === 'fell') say('Araç yola yerleştirildi.', 'veh:reset');
      else if (x.type === 'edge') say('Kanal kenarı: geri dön.', 'veh:edge');
    }
    mgr.syncProp(e);
    seatBody(e);
    if (G.hud) {
      const hv = G.hud.vehicle || (G.hud.vehicle = {});
      hudOf(v, hv);
      hv.camera = cam.mode;
      hv.boost = !!v.nitroOn;
      hv.slow = !!v.governed;
      hv.rent = e.role === 'rental' && mgr.save.rental ? Math.round(mgr.save.rental.left) : 0;
    }
    flushAcc += dt;
    if (flushAcc >= FLUSH_EVERY) {
      flushAcc = 0;
      flush(mgr);
    }
  }

  function handleManagerEvents(mgr, evs) {
    for (let i = 0; i < evs.length; i++) {
      const x = evs[i];
      if (x.type === 'rentalWarn') say('Kiralık aracın süresi dolmak üzere: ' + x.left + ' sn.', 'veh:rentwarn');
      else if (x.type === 'rentalEnd') {
        if (x.driven && G.vehicles && G.vehicles.driven && G.vehicles.driven.id === x.id) exit({ force: true, reason: 'kira' });
        say('Kiralama süresi doldu: araç teslim edildi.', 'veh:rentend');
        G.emit({ type: 'vehicleRentalEnd', id: x.id });
        flush(mgr);
      } else if (x.type === 'summonedDespawn') {
        say('Aracın garaja geri döndü.', 'veh:despawn');
        flush(mgr);
      }
    }
    // sürülürken biten kiralık araç: indirildi, şimdi kaldır
    mgr.entries.forEach((e) => {
      if (e.pendingRemove && !e.occupied) mgr.remove(e.id);
    });
  }

  function trySpawnPending(mgr, dt) {
    if (!pendingRaw) return;
    pendingT += dt;
    const w = G.world;
    const raw = pendingRaw;
    const loaded = () => {
      const s = raw.summoned;
      const r = raw.rental;
      const ok = (q) => !q || !Number.isFinite(q.x) || w.hasChunk(Math.floor(q.x) >> 4, Math.floor(q.z) >> 4);
      return ok(s) && ok(r);
    };
    if (!loaded() && pendingT < 20) return;
    pendingRaw = null;
    mgr.restore(raw);
    // oyuncu kayıtta araçla iç içe yüklendiyse güvenli yere taşı
    const b = G.body;
    const near = mgr.nearest(b.x, b.y + 0.9, b.z, 0.2);
    if (near) {
      const spot = findExitSpot(w, near.v, { ignoreId: near.propId });
      if (spot && typeof G.teleport === 'function') G.teleport(spot.x, spot.y, spot.z, { safe: false, yaw: G.player.yaw });
    }
  }

  /* ---------- garaj / API ---------- */
  function garageView() {
    const mgr = G.vehicles;
    const save = mgr ? mgr.save : null;
    const km = save ? save.vstats.km : 0;
    const owned = save ? save.garage.owned : [];
    const catalog = VEHICLE_CLASSES.map((cls) => {
      const d = VEHICLE_DEFS[cls];
      const u = unlockStatus(cls, { km });
      return {
        cls, name: d.name, desc: d.desc, price: d.price, rent: d.rent, maxKmh: Math.round(d.max * 3.6), seats: d.seats, parcels: d.parcels, kind: d.kind,
        unlocked: u.ok, needKm: u.need, owned: owned.some((o) => o.cls === cls),
      };
    });
    return {
      active: save ? save.garage.active : 0,
      owned: owned.map((o, i) => ({
        idx: i, cls: o.cls, name: VEHICLE_DEFS[o.cls].name, cos: Object.assign({}, o.cos, { under: Object.assign({}, o.cos.under) }),
      })),
      summoned: save ? !!save.summoned : false,
      rental: save && save.rental ? { cls: save.rental.cls, left: Math.round(save.rental.left) } : null,
      kredi: mgr ? wallet.get() : 0,
      capacity: 6,
      km: Math.round(km * 10) / 10,
      catalog,
      swatches: {
        body: COSMETICS.body.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
        accent: COSMETICS.accent.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
        neon: COSMETICS.neon.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
        wheels: COSMETICS.wheels.map((s) => ({ name: s.name, shape: s.shape })),
        horns: COSMETICS.horns.map((s) => ({ name: s.name, shape: s.shape })),
        underPatterns: COSMETICS.underPatterns.slice(),
      },
    };
  }

  function grantStarter(mgr) {
    if (mgr.save.garage.owned.length === 0 && mgr.addOwned('suzulkay') >= 0) {
      say('Garaj Çırağı sana bir Süzülkay hediye etti!', 'veh:starter');
      flush(mgr);
    }
  }

  function summon() {
    const mgr = G.vehicles;
    if (!mgr) return { ok: false, reason: 'boyut' };
    if (G.player.vehicle) return { ok: false, reason: 'surulen' };
    grantStarter(mgr);
    const b = G.body;
    const r = mgr.summon({ x: b.x, y: b.y, z: b.z });
    if (!r.ok) {
      const msgs = {
        'arac-yok': 'Garajında araç yok.',
        park: 'Yakında boş park yeri yok: bir garaja ya da yola yaklaş.',
        surulen: 'Aracı şu an sürüyorsun.',
        boyut: 'Şehirde değilsin.',
      };
      say(msgs[r.reason] || 'Araç çağrılamadı.', 'veh:summonfail');
      return r;
    }
    G.emit({
      type: 'vehicleSummon', id: r.entry.id, cls: r.entry.v.cls, how: r.how,
    });
    say(VEHICLE_DEFS[r.entry.v.cls].name + ' yanında hazır.', 'veh:summon');
    flush(mgr);
    return { ok: true, id: r.entry.id, how: r.how };
  }

  function rentApi(cls) {
    const mgr = G.vehicles;
    if (!mgr || !isVehicleClass(cls)) return { ok: false, reason: 'bilinmeyen' };
    // kiralama yalnız bir kiralama noktasının yakınında
    const b = G.body;
    const pl = poisNow();
    let near = false;
    for (let i = 0; i < pl.length; i++) {
      if (pl[i].type === 'rental' && (pl[i].x - b.x) ** 2 + (pl[i].z - b.z) ** 2 < 40 * 40) near = true;
    }
    if (!near) return { ok: false, reason: 'uzak' };
    const r = mgr.rent(cls, { x: b.x + 3, y: b.y, z: b.z, yaw: G.player.yaw });
    if (r.ok) {
      G.emit({
        type: 'vehicleRent', id: r.entry.id, cls, price: r.price,
      });
      flush(mgr);
      return { ok: true, id: r.entry.id, price: r.price };
    }
    return r;
  }

  /* ---------- sistem ---------- */
  const system = {
    name: 'vehicles',
    order: VEHICLES_ORDER,
    sys,

    init() {
      G.vehicleCam = cam;
      G.vehicleInput = input;
      if (G.player && G.player.vehicle === undefined) G.player.vehicle = null;
      if (G.vehicles === undefined) G.vehicles = null;
      installVehicleCommands(G, { sys, wallet, enter, exit, nearestEnterable, manager, flush });
    },

    fixedUpdate(_G, dt) {
      const mgr = manager();
      if (!mgr) {
        if (G.player.vehicle) G.player.vehicle = null;
        return;
      }
      trySpawnPending(mgr, dt);
      const b = G.body;
      const p = G.player;
      if (p.dead && mgr.driven) exit({ force: true, reason: 'olum' });
      const evs = mgr.tick(dt, b.x, b.z);
      if (evs.length > 0) handleManagerEvents(mgr, evs);
      if (mgr.driven) {
        driveStep(mgr, dt);
        return;
      }
      if (p.vehicle) p.vehicle = null;
      // yürürken F: en yakın araca bin (isabet eden prop'u blocks sistemi zaten işledi → yalnız tüketilmediyse)
      const s = G.inputState;
      if (s.interactPressed && !p.dead && G.ui === 'none' && G.time.tick - enteredTick > ENTER_GUARD_TICKS) {
        const e = nearestEnterable();
        if (e && useTick !== G.time.tick) {
          if (e.role === 'display') handleUse(e.propId);
          else if (enter(e)) s.interactPressed = false; // basış tüketildi (QA5-A-002)
        }
      }
    },

    frameUpdate(_G, dt, alpha) {
      const mgr = G.vehicles;
      if (!mgr || !mgr.driven || !G.player.vehicle) return;
      mgr.interp(mgr.driven, alpha, interp);
      cam.update(dt, interp, mgr.driven);
    },

    beforeDimension() {
      const mgr = G.vehicles;
      if (!mgr) return;
      if (mgr.driven) exit({ force: true, reason: 'dimension' });
      mgr.stash();
      flush(mgr);
      pendingRaw = null;
    },

    onDimension() {
      G.player.vehicle = null;
      if (G.hud) G.hud.vehicle = null;
      cam.reset(null);
      pendingRaw = null;
      flushAcc = 0;
    },

    onEvent(_G, e) {
      if (!e) return;
      switch (e.type) {
        case 'vehicleUse':
          handleUse(e.propId);
          break;
        case 'propUi':
          if (e.ui === 'garage' && G.vehicles && !G.player.vehicle) {
            grantStarter(G.vehicles);
            G.setUi('garage');
          }
          break;
        case 'death':
          if (G.vehicles && G.vehicles.driven) exit({ force: true, reason: 'olum' });
          break;
        default:
          break;
      }
    },

    api() {
      return {
        getVehicleState() {
          const mgr = G.vehicles;
          const e = mgr ? mgr.driven : null;
          if (!e) {
            return {
              driving: false, cls: null, kmh: 0, gear: 0, nitro: 0, drift: false, camera: cam.mode, rentalLeft: mgr && mgr.save.rental ? Math.round(mgr.save.rental.left) : 0,
            };
          }
          const h = hudOf(e.v, {});
          return Object.assign(h, {
            driving: true, id: e.id, camera: cam.mode, role: e.role, rentalLeft: mgr.save.rental ? Math.round(mgr.save.rental.left) : 0, rpm: e.v.rpm, onGround: e.v.onGround,
          });
        },
        enterVehicle() {
          const e = nearestEnterable();
          if (!e) return false;
          return e.role === 'display' ? handleUse(e.propId) : enter(e);
        },
        exitVehicle() {
          return exit({ reason: 'api' });
        },
        summonVehicle: summon,
        rentVehicle: rentApi,
        getGarage: garageView,
        setGarage(patch) {
          const mgr = G.vehicles;
          if (!mgr || !patch || typeof patch !== 'object') return false;
          let ok = false;
          if (Number.isInteger(patch.active)) ok = mgr.setActive(patch.active) || ok;
          if (patch.repair === true) ok = mgr.repair() > 0 || ok;
          if (patch.paint && typeof patch.paint === 'object' && Number.isInteger(patch.paint.idx)) ok = mgr.paint(patch.paint.idx, patch.paint.cos || {}) || ok;
          if (ok) flush(mgr);
          return ok;
        },
        buyVehicle(cls) {
          const mgr = G.vehicles;
          if (!mgr) return { ok: false, reason: 'boyut' };
          const r = mgr.buy(cls);
          if (r.ok) {
            say(VEHICLE_DEFS[cls].name + ' garajına eklendi.', 'veh:buy');
            flush(mgr);
          } else {
            const m = {
              kredi: 'Yetersiz Kredi: ' + purchasePrice(cls) + ' Kredi gerekli.', kilit: 'Bu araç için daha çok sürüş yapmalısın.', sahip: 'Bu araç zaten garajında.', dolu: 'Garaj dolu (en çok 6 araç).',
            };
            say(m[r.reason] || 'Satın alma yapılamadı.', 'veh:buyfail');
          }
          return r;
        },
        setVehicleCamera(n) {
          cam.mode = n;
          return cam.mode;
        },
      };
    },

    dispose() {
      if (G.vehicles && G.vehicles.entries) {
        try {
          G.vehicles.dispose();
        } catch { /* yut */ }
      }
      G.vehicles = null;
      G.vehicleCam = null;
      G.vehicleInput = null;
      if (G.player) G.player.vehicle = null;
    },
  };
  return system;
}

export default createSystem;
