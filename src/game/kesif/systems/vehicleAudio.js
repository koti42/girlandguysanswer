/*
 * KEŞİF — "vehicleAudio" sistemi (order 37; Neon Meridyen Faz 3, paket vehicle_audio): araç motoru/trafik sesi + araç radyosu bağlantısı.
 * gameSystems.js otomatik yükler. Sıra: vehicles (26), traffic (27) ve cityLook (36) SONRA, cityHud (38) ÖNCE.
 *
 *   G.radio                  {next(), prev(), set(idOrIndex), info(), station, stations}   (vehicle_ui RadioChip/R tuşu bunu kullanır)
 *   G.hud.city.radio         araçtayken seçili istasyonun adı ('' araç dışında); ayrıntı için G.radio.info()
 *   Dinler (G.emit): vehiclePhys {ev:{type,…}} (bump scrape land shift hop splash nitroStart) · vehicleHorn · trafficHonk {id,x,z} (uzamsal) · vehicleEnter · vehicleExit · dimensionChanged
 *                    radio / radioNext (sonraki istasyon) · radioPrev · radioSet {station|index}
 *   onAction (inputVehicle olay kuyruğu): {type:'radioNext'|'radioPrev'|'radioSet', index 0..5 (5 = Sessiz)}
 *   API (gameApi'ye eklenir; `setRadio` cityApi'ye (Faz 4) bırakıldı, o G.radio.set()'i çağırabilir): getVehicleRadio() · selectRadioStation(idOrIndex) · nextRadioStation() · prevRadioStation() · getVehicleAudioStats()
 *   Ayarlar: G.settings.musicVolume / sfxVolume / masterVolume (0..1, varsa) → audio.setVolumes; muted/music anahtarları audio.js'e gameUi tarafından gider.
 *
 * Ses bağlamı audio.js `getLoopContext()` ile alınır: jest öncesi/sessiz/gizli sekmede null/askıda → hiçbir şey kurulmaz, kurulu her şey bırakılır.
 * Radyo saati: dünya saati (G.clock: gün·gün uzunluğu + zaman) ile hizalanır (kayıt/yükleme tutarlı "canlı yayın"); sonra kare dt'si ile ilerler
 * (saat donmuşken müzik takılmaz; saat sıçramasında yeniden hizalanır). Trafik sesi: G.traffic.view (struct-of-arrays) → en yakın ≤3 araç.
 */
import { createVehicleAudio } from '../audioVehicle.js';
import { createRadio, radioCapFor, STATIONS, SILENT_INDEX } from '../audioRadio.js';
import { cityQualityFor } from '../render/quality.js';
import { cityZoneAt } from '../sim/city/cityZone.js';

export const VEHICLE_AUDIO_ORDER = 37;
const FEED_MAX = 64;
const SETTINGS_EVERY = 0.25;
const CLOCK_JUMP = 2;
const ZONE_EVERY = 0.25;

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Radyo saati takibi: ilk/sıçrama anında saate hizalanır, sonra kare dt'siyle ilerler. */
export function createRadioClock() {
  let t = 0;
  let lastClock = NaN;
  return {
    update(dt, clockSec) {
      const c = fin(clockSec) ? clockSec : 0;
      const d = fin(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
      if (!fin(lastClock) || Math.abs(c - lastClock - d) > CLOCK_JUMP) t = c;
      else t += d;
      lastClock = c;
      return t;
    },
    get t() {
      return t;
    },
    reset() {
      lastClock = NaN;
    },
  };
}

/** G.clock → monoton saniye (gün · uzunluk + zaman). */
export function clockSeconds(clock) {
  if (!clock) return 0;
  const len = fin(clock.dayLengthSec) && clock.dayLengthSec > 0 ? clock.dayLengthSec : 600;
  const day = fin(clock.day) ? clock.day : 0;
  const time = fin(clock.time) ? clock.time : 0;
  return day * len + time;
}

/** Açık hava 1 … kapalı alan/tünel 0 (sığınak 0..1 ve bina/oda bölgesi). */
export function duckFor(shelter, inZone) {
  const s = clamp01(fin(shelter) ? shelter : 0);
  let d = 1 - 0.75 * s;
  if (inZone && d > 0.5) d = 0.5;
  return d;
}

/** traffic.view (SoA) → [{id,x,z,vx,vz}] (önceden ayrılmış nesneler); dönüş: sayı. Yok olan/şeffaf araçlar atlanır. */
export function fillTrafficFeed(view, feed) {
  if (!view || !(view.count > 0) || !view.x || !view.z) return 0;
  const n = Math.min(view.count | 0, feed.length);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (view.fade && view.fade[i] < 0.3) continue;
    const f = feed[k];
    const yaw = view.yaw ? view.yaw[i] : 0;
    const sp = view.speed ? view.speed[i] : 0;
    f.id = view.id ? view.id[i] : i;
    f.x = view.x[i];
    f.z = view.z[i];
    f.vx = -Math.sin(yaw) * sp;
    f.vz = -Math.cos(yaw) * sp;
    k++;
  }
  return k;
}

export function createSystem(G) {
  const feed = [];
  for (let i = 0; i < FEED_MAX; i++) feed.push({ id: 0, x: 0, z: 0, vx: 0, vz: 0 });
  const st = {
    v: null, wet: 0, listener: { x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0 }, traffic: feed, trafficN: 0,
  };
  const clock = createRadioClock();
  const getLoop = () => (G.audio && typeof G.audio.getLoopContext === 'function' ? G.audio.getLoopContext() : null);
  const va = createVehicleAudio({ getLoop, nodeCap: 24 });
  const radio = createRadio({ getLoop, nodeCap: radioCapFor(24), seed: 0 });
  let capSeen = -1;
  let active = false;
  let userStation = false;
  let setAcc = SETTINGS_EVERY;
  let lastVol = '';
  let rt = 0;
  let zoneAcc = 1;
  let inZone = false;

  function currentCap() {
    const q = G.quality && G.quality.settings ? G.quality.settings : null;
    let cap = cityQualityFor(q).audioNodes;
    const loop = getLoop();
    if (loop && loop.lowPower && cap > 12) cap = 12;
    return cap;
  }

  function applyCap() {
    const cap = currentCap();
    if (cap === capSeen) return;
    capSeen = cap;
    va.setNodeCap(cap);
    radio.setNodeCap(radioCapFor(cap));
  }

  function applyVolumes() {
    const s = G.settings;
    const a = G.audio;
    if (!s || !a || typeof a.setVolumes !== 'function') return;
    const v = {};
    if (fin(s.masterVolume)) v.master = clamp01(s.masterVolume);
    if (fin(s.sfxVolume)) v.sfx = clamp01(s.sfxVolume);
    if (fin(s.musicVolume)) v.music = clamp01(s.musicVolume);
    const key = (v.master === undefined ? '' : v.master) + '|' + (v.sfx === undefined ? '' : v.sfx) + '|' + (v.music === undefined ? '' : v.music);
    if (key === '||' || key === lastVol) return;
    lastVol = key;
    a.setVolumes(v);
  }

  function setStation(x) {
    userStation = true;
    const ch = radio.setStation(x);
    if (ch) announceStation();
    return radio.station;
  }

  function announceStation() {
    G.emit({ type: 'radioStation', station: radio.station.id, index: radio.station.index, name: radio.station.name });
    if (typeof G.speak === 'function') G.speak(radio.station.silent ? 'Radyo kapalı' : 'Radyo: ' + radio.station.name);
  }

  function next() {
    userStation = true;
    radio.next();
    announceStation();
    return radio.station;
  }

  function prev() {
    userStation = true;
    radio.prev();
    announceStation();
    return radio.station;
  }

  G.radio = {
    next,
    prev,
    set: setStation,
    info: () => radio.info(rt),
    get station() {
      return radio.station;
    },
    stations: STATIONS,
  };

  function haltAll() {
    va.halt();
    radio.halt();
    active = false;
    st.v = null;
    clock.reset();
  }

  function horn(driven) {
    const c = driven && driven.v && driven.v.cosmetics ? driven.v.cosmetics.horn : 0;
    va.event('horn', { variant: fin(c) ? c : 0 });
  }

  return {
    name: 'vehicleAudio',
    order: VEHICLE_AUDIO_ORDER,

    frameUpdate(_G, dt) {
      if (G.dim !== 'neon' || !G.world) {
        if (active) haltAll();
        else if (G.hud && G.hud.city && G.hud.city.radio) G.hud.city.radio = '';
        return;
      }
      active = true;
      setAcc += dt;
      if (setAcc >= SETTINGS_EVERY) {
        setAcc = 0;
        applyCap();
        applyVolumes();
      }
      const mgr = G.vehicles;
      const driven = mgr && mgr.driven ? mgr.driven : null;
      const v = driven ? driven.v : null;
      st.v = v;
      const look = G.cityLook && G.cityLook.state ? G.cityLook.state : null;
      st.wet = look && fin(look.wet) ? look.wet : 0;
      const eye = G.eye || G.body;
      const L = st.listener;
      if (eye) {
        L.x = eye.x;
        L.y = eye.y;
        L.z = eye.z;
      }
      if (G.look && fin(G.look.x) && fin(G.look.z)) L.yaw = Math.atan2(-G.look.x, -G.look.z);
      L.vx = v ? v.vx : 0;
      L.vz = v ? v.vz : 0;
      st.trafficN = fillTrafficFeed(G.traffic ? G.traffic.view : null, feed);
      va.update(dt, st);

      rt = clock.update(dt, clockSeconds(G.clock));
      zoneAcc += dt;
      if (zoneAcc >= ZONE_EVERY) {
        zoneAcc = 0;
        inZone = false;
        if (v) {
          try {
            inZone = Boolean(cityZoneAt(v.x, v.y + 1, v.z, G.world.seed));
          } catch {
            inZone = false;
          }
        }
      }
      radio.setDuck(duckFor(look && fin(look.shelter) ? look.shelter : 0, inZone));
      const playing = Boolean(v) && !G.paused && !G.transitionActive;
      radio.update(G.paused ? 0 : dt, rt, playing);
      const hud = G.hud;
      if (hud && hud.city) hud.city.radio = v ? radio.station.name : '';
    },

    onEvent(_G, e) {
      if (!e || typeof e.type !== 'string') return;
      switch (e.type) {
        case 'vehiclePhys': {
          const x = e.ev;
          if (!x) break;
          if (x.type === 'bump') va.event('bump', { impact: x.impact, soft: x.soft });
          else if (x.type === 'scrape' || x.type === 'land' || x.type === 'shift' || x.type === 'hop' || x.type === 'splash' || x.type === 'nitroStart') {
            va.event(x.type, x);
          }
          break;
        }
        case 'vehicleHorn':
          horn(G.vehicles && G.vehicles.driven);
          break;
        case 'trafficHonk':
          va.event('trafficHonk', e);
          break;
        case 'vehicleEnter': {
          // araç kozmetiğindeki radyo (garaj) yalnız oyuncu henüz kendi seçmediyse uygulanır
          const d = G.vehicles && G.vehicles.driven;
          const c = d && d.v && d.v.cosmetics ? d.v.cosmetics.radio : undefined;
          if (!userStation && fin(c) && c >= 0 && c < STATIONS.length) radio.setStation(c);
          break;
        }
        case 'radio':
        case 'radioNext':
          next();
          break;
        case 'radioPrev':
          prev();
          break;
        case 'radioSet':
          setStation(e.station !== undefined ? e.station : e.index);
          break;
        default:
          break;
      }
    },

    onAction(_G, a) {
      if (!a) return;
      if (a.type === 'radio' || a.type === 'radioNext') next();
      else if (a.type === 'radioPrev') prev();
      else if (a.type === 'radioSet') setStation(a.index !== undefined ? a.index : a.station);
    },

    onDimension() {
      haltAll();
      if (G.hud && G.hud.city) G.hud.city.radio = '';
    },

    api() {
      return {
        getVehicleRadio: () => radio.info(rt),
        selectRadioStation: (x) => setStation(x).id,
        nextRadioStation: () => next().id,
        prevRadioStation: () => prev().id,
        getVehicleAudioStats: () => ({
          vehicle: va.getStats(), radio: radio.getStats(), cap: capSeen, station: radio.station.id, silentIndex: SILENT_INDEX,
        }),
      };
    },

    dispose() {
      va.dispose();
      radio.dispose();
      if (G.radio) G.radio = null;
    },
  };
}
