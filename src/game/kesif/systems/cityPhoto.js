/*
 * KEŞİF — "cityPhoto" sistemi (order 32): Neon Meridyen FOTO MODU, ŞEHİR HARİTASI KATMANI ve HIZLI SEYAHAT (Faz 4, paket photo_map). Sözleşme §11, §12, §19.
 * Saf mantık sim/city/map/* içindedir; görsel render/city/photoFx.js; kayıt hattı systems/cityPhotoShot.js; seyahat makinesi systems/cityTravel.js;
 * harita katmanı systems/cityMapView.js. Arayüz: components/game/kesif/city/PhotoOverlay.jsx + CityMap.jsx.
 *
 *   • Foto modu (V ya da arayüz düğmesi; yalnız şehirde): G.ui 'photo' — HUD gizlenir, serbest kamera oyuncunun (ya da aracın) çevresinde yörüngede (≤ 25 m, blok ışınıyla
 *     duvar önünde durur), FOV 20–90, pozlama/neon bloom/vinyet/film greni, 6 filtre, 4 çerçeve, saat ve yağmur ön ayarları (YALNIZ görsel: dünya saati/havası değişmez),
 *     «simülasyonu dondur» (G.simFrozen). Görev sürerken kapalı. Kapanınca her şey geri yüklenir.
 *   • Kayıt: kare JPEG'e (uzun kenar ≤ 1920) çevrilir; Kaydet = gömülü uygulama köprüsü (`kesif:savephoto` olayı → WebView `savePhoto`), yoksa indirme; Paylaş = Web Paylaşım (dosya, destekleyen cihazlarda). Yüklenmez.
 *   • Albüm: kadraja giren konular (terminal, tepe, yarış kapısı, kurye masası, sakin, robot, araç, kalabalık) ilk kez +8 Kredi; 8/8 +30; Irmak'ın `foto_ilk` görevi +15.
 *   • Harita: bölge sisi + bulunmuş POI/metro işaretleri (cityMapView); getMapInfo şehirde bu katmanı içerir. Hızlı seyahat: bulunmuş terminaller/metro durakları arası
 *     (5 Kredi, 10 sn bekleme, görevde/araçta/tehlikede/kilitli odada kapalı), 3 sn karartma, parçalar hazır olunca açılır.
 *
 *   G.cityPhoto = {st, open(), close(), canOpen(), set(patch), capture(), save(), fx, shooter, traveler}      G.cityMap = {decorate(info), view}
 *   Olaylar (G.emit): photoOpen photoClose photoCaptured{subjects[], n} photoSubject{id,name} photoAlbumDone photoQuestDone{id} photoSaved{via} fastTravelStart{to} fastTravel{to,name,cost} mapPoiFound{ids,names}
 *   NPC efektleri (G.cityNpc.effects): photo{id} (Fotoğrafçı Irmak: görevi başlatır, diyalog kapanınca foto modunu açar) · travel{to} (diyalog kapanınca hızlı seyahat)
 *   API (window.__game): getPhotoState() photoOpen() photoClose() photoSet(patch) photoOrbit(dyaw,dpitch) photoZoom(delta) photoCapture() photoSave() photoShare() photoDiscard() getPhotoAlbum()
 *        getFastTravel() fastTravel(id) getMapRoute(x,z) openCityMap()
 *   Hata ayıklama komutları: foto [ac|kapat|cek|kaydet|durum] · seyahat [liste|<id>] · harita [hepsi|durum]
 */
import { raycastBlocks, createRayHit } from '../sim/raycast.js';
import { getKit } from './cityMissionsKit.js';
import { registerCommand } from './sessionCommands.js';
import { createPhotoFx } from '../render/city/photoFx.js';
import { createShooter, gatherCandidates } from './cityPhotoShot.js';
import { createTraveler } from './cityTravel.js';
import { createMapView } from './cityMapView.js';
import {
  PHOTO_FILTERS, PHOTO_FRAMES, PHOTO_LIMITS, PHOTO_RAINS, PHOTO_TIMES, defaultPhotoSettings, initialOrbit, orbitTarget, sanitizePhotoPatch, solveOrbit, stepOrbit, zoomOrbit,
} from '../sim/city/map/photoMath.js';
import {
  PHOTO_ASSIGNMENTS, PHOTO_SUBJECTS, albumCount, applyShot, decodePhotoState, evaluateShot, staticCandidates,
} from '../sim/city/map/photoTargets.js';
import { insideLockedRoom } from '../sim/city/map/fastTravel.js';
import { mapPoiList } from '../sim/city/map/mapFog.js';

export const CITY_PHOTO_ORDER = 32;
export const PHOTO_KEY = 'KeyV';
const MIN_GAP = 2;
const OPEN_MSG = 'Foto modu: sürükle ya da ok tuşlarıyla bak, kaydırıcılarla ayarla, Çek ile kare yakala. Esc kapatır.';

const DENIED = Object.freeze({
  sehir: 'Foto modu yalnız Neon Meridyen\'de.',
  olu: 'Şu an foto modu açılamaz.',
  gecis: 'Geçiş sürerken foto modu kapalı.',
  arayuz: 'Önce açık paneli kapat.',
  gorev: 'Görev sürerken foto modu kapalı. Görevi bırakabilirsin.',
  arac: 'Foto modu şu an açılamaz.',
});

export function createSystem(G) {
  const kit = getKit(G);
  const fx = createPhotoFx(G);
  const ray = createRayHit();
  const rayOpts = { solidOnly: true, out: ray };
  const ro = { x: 0, y: 0, z: 0 };
  const rd = { x: 0, y: 0, z: 0 };
  const rayFn = (ox, oy, oz, dx, dy, dz, max) => {
    const w = G.world;
    if (!w) return null;
    ro.x = ox; ro.y = oy; ro.z = oz;
    rd.x = dx; rd.y = dy; rd.z = dz;
    const h = raycastBlocks(w, ro, rd, max, rayOpts);
    return h ? h.t : null;
  };
  const lockedRoom = () => {
    const b = G.body;
    const c = kit.ctx();
    if (!b || !kit.inCity()) return false;
    const locks = c && c.locks ? c.locks : null;
    return insideLockedRoom(kit.seed(), b.x, b.y, b.z, (id) => !!locks && locks[id] === 1);
  };
  const traveler = createTraveler(G, kit, { lockedRoom });
  const mapView = createMapView(G, kit);
  const win = typeof window !== 'undefined' ? window : null;
  const shooter = createShooter({
    canvas: () => (G.renderer ? G.renderer.domElement : null),
    renderNow: () => { if (G.postfx && typeof G.postfx.render === 'function') G.postfx.render(0); },
    makeCanvas: (w, h) => {
      if (G.opts && typeof G.opts.photoCanvas === 'function') return G.opts.photoCanvas(w, h); // yalnız testler
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
    win,
    stamp: () => {
      const t = new Date();
      return {
        y: t.getFullYear(), mo: t.getMonth() + 1, d: t.getDate(), h: t.getHours(), mi: t.getMinutes(), s: t.getSeconds(),
      };
    },
    now: () => (G.time ? G.time.seconds : 0),
  });

  const st = {
    open: false,
    settings: defaultPhotoSettings(),
    orbit: initialOrbit(0),
    pose: {
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, dist: 0, blocked: false,
    },
    target: { x: 0, y: 0, z: 0 },
    froze: false,
    shot: null,
    busy: false,
    saving: false,
    lastSave: null,
    canShare: null,
    counted: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, at: -99, valid: false },
    assignment: '',
    openQueued: false,
    travelQueued: '',
    hooked: false,
    offs: [],
    version: 0,
    candidates: [],
    stats: {
      opens: 0, shots: 0, counted: 0, saves: 0, travels: 0,
    },
    keyHandler: null,
  };

  const aspect = () => (G.camera && G.camera.aspect > 0 ? G.camera.aspect : 16 / 9);
  const reduced = () => !!(G.reducedMotion || G.accessibility);
  const say = (t, key) => kit.say(t, key);

  /* ---------------------------------------------------------------------------- foto modu */
  function canOpen() {
    if (st.open) return { ok: true, reason: 'acik', message: '' };
    if (!kit.inCity()) return { ok: false, reason: 'sehir', message: DENIED.sehir };
    if (G.player && G.player.dead) return { ok: false, reason: 'olu', message: DENIED.olu };
    if (traveler.busy || G.transitionActive === true || (G.transition && G.transition.active)) return { ok: false, reason: 'gecis', message: DENIED.gecis };
    if (G.ui !== 'none' && G.ui !== 'pause') return { ok: false, reason: 'arayuz', message: DENIED.arayuz };
    if (G.cityMissions && typeof G.cityMissions.busy === 'function' && G.cityMissions.busy()) return { ok: false, reason: 'gorev', message: DENIED.gorev };
    return { ok: true, reason: 'tamam', message: '' };
  }

  function freezeOn() {
    if (traveler.busy || G.transitionActive === true) return;
    G.simFrozen = true;
    st.froze = true;
  }

  function freezeOff() {
    if (st.froze && !traveler.busy && G.transitionActive !== true) G.simFrozen = false;
    st.froze = false;
  }

  function open() {
    const c = canOpen();
    if (!c.ok) return c;
    if (st.open) return { ok: true, reason: 'acik', message: '' };
    const pos = kit.pos();
    st.orbit = initialOrbit(pos.driving ? pos.yaw : (G.player ? G.player.yaw : 0));
    st.orbit.dist = st.settings.dist;
    if (typeof G.setUi === 'function') G.setUi('photo');
    if (G.ui !== 'photo') return { ok: false, reason: 'arayuz', message: DENIED.arayuz };
    st.open = true;
    fx.begin();
    if (st.settings.freeze) freezeOn();
    st.stats.opens++;
    st.version++;
    G.emit({ type: 'photoOpen' });
    if (typeof G.speak === 'function') G.speak('Foto modu açıldı.');
    return { ok: true, reason: 'tamam', message: OPEN_MSG };
  }

  function close(why) {
    if (!st.open) return { ok: true };
    st.open = false;
    freezeOff();
    fx.end();
    if (st.shot) {
      shooter.release(st.shot);
      st.shot = null;
    }
    st.busy = false;
    if (G.ui === 'photo' && typeof G.setUi === 'function') G.setUi('none');
    st.version++;
    G.emit({ type: 'photoClose', why: why || '' });
    return { ok: true };
  }

  function set(patch) {
    const prevFreeze = st.settings.freeze;
    st.settings = sanitizePhotoPatch(st.settings, patch);
    if (patch && typeof patch.dist === 'number' && Number.isFinite(patch.dist)) st.orbit.dist = st.settings.dist;
    if (st.open && prevFreeze !== st.settings.freeze) {
      if (st.settings.freeze) freezeOn();
      else freezeOff();
    }
    st.version++;
    return state();
  }

  function orbit(dyaw, dpitch) {
    stepOrbit(st.orbit, dyaw, dpitch);
    return true;
  }

  function zoom(delta) {
    zoomOrbit(st.orbit, delta);
    st.settings.dist = st.orbit.dist;
    st.version++;
    return st.orbit.dist;
  }

  function frame(dt) {
    if (!st.open) return;
    if (G.ui !== 'photo') {
      close('ui');
      return;
    }
    const pos = kit.pos();
    orbitTarget(pos, pos.driving, st.settings.height, st.target);
    solveOrbit(st.orbit, st.target, rayFn, st.pose);
    fx.apply(st.settings, st.pose, { hideSelf: st.settings.hideSelf, driving: pos.driving });
    void dt;
  }

  /* ---------------------------------------------------------------------------- kayıt */
  function distinctView() {
    const c = st.counted;
    if (!c.valid) return true;
    return Math.hypot(st.pose.x - c.x, st.pose.y - c.y, st.pose.z - c.z) > 0.5 || Math.abs(st.pose.yaw - c.yaw) > 0.1 || Math.abs(st.pose.pitch - c.pitch) > 0.1;
  }

  async function capture() {
    if (!st.open) return { ok: false, reason: 'kapali', message: 'Önce foto modunu aç.' };
    if (st.busy) return { ok: false, reason: 'mesgul', message: 'Kare hazırlanıyor.' };
    st.busy = true;
    try {
      if (st.shot) {
        shooter.release(st.shot);
        st.shot = null;
      }
      // kadraj, kare çizildiği andaki kameradır (await sonrası poz değişmiş olabilir)
      const cam = {
        x: st.pose.x, y: st.pose.y, z: st.pose.z, yaw: st.pose.yaw, pitch: st.pose.pitch, fov: st.settings.fov,
      };
      const shot = await shooter.capture(st.settings);
      if (!shot.ok) return { ok: false, reason: shot.reason, message: 'Kare yakalanamadı.' };
      if (!st.open) {
        // çekim sürerken foto modu kapandı: kare atılır, ödül/sayaç yok
        shooter.release(shot);
        return { ok: false, reason: 'kapali', message: 'Foto modu kapandı.' };
      }
      const seed = kit.seed();
      const cand = staticCandidates(seed).concat(gatherCandidates(G, cam, st.candidates));
      const ev = evaluateShot(cam, aspect(), cand, rayFn);
      const now = G.time ? G.time.seconds : 0;
      const counts = now - st.counted.at >= MIN_GAP && distinctView();
      let kredi = 0;
      const names = [];
      const newNames = [];
      ev.kinds.forEach((k) => {
        const s = PHOTO_SUBJECTS.find((q) => q.id === k);
        if (s) names.push(s.name);
      });
      if (counts) {
        const c = kit.blob();
        const ps = decodePhotoState(c ? c.photo : null);
        const r = applyShot(ps, ev.kinds, st.assignment);
        if (c) c.photo = ps;
        kredi = r.kredi;
        st.counted = {
          x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch, at: now, valid: true,
        };
        st.stats.counted++;
        G.emit({ type: 'photoCaptured', subjects: ev.kinds.slice(), n: ps.n });
        r.newSubjects.forEach((id) => {
          const s = PHOTO_SUBJECTS.find((q) => q.id === id);
          newNames.push(s ? s.name : id);
          G.emit({ type: 'photoSubject', id, name: s ? s.name : id });
        });
        if (r.albumDone) G.emit({ type: 'photoAlbumDone' });
        if (r.assignmentDone) {
          G.emit({ type: 'photoQuestDone', id: st.assignment });
          st.assignment = '';
        }
        if (kredi > 0) kit.kredi(kredi, 'foto');
        if (newNames.length > 0) {
          kit.banner('Albüm: ' + newNames.join(', '), '+' + kredi + ' Kredi', { kind: 'info' });
        }
      }
      st.stats.shots++;
      shot.subjects = names;
      shot.kredi = kredi;
      shot.counted = counts;
      st.shot = shot;
      st.version++;
      if (typeof G.sound === 'function') G.sound('ui_click', undefined, { vol: 0.6 });
      if (typeof G.speak === 'function') G.speak('Kare yakalandı.' + (names.length ? ' Kadrajda: ' + names.join(', ') + '.' : ''));
      return {
        ok: true, bytes: shot.bytes, w: shot.w, h: shot.h, name: shot.name, subjects: names, kredi, counted: counts, id: shot.id,
      };
    } finally {
      st.busy = false;
    }
  }

  const SAVE_MSG = {
    paylasim: 'Fotoğraf paylaşıldı.', iptal: 'Paylaşım iptal edildi.', zaman: 'Paylaşım yanıt vermedi; Kaydet düğmesini dene.', yok: 'Kaydedilemedi; tekrar dene.',
    // mobil uygulama köprüsünün kesin durumları (embed/photoBridge.js → cityPhotoShot.HOST_VIA)
    izin: 'Galeri izni verilmedi; fotoğraf kaydedilemedi. İzni telefonun Ayarlar bölümünden açabilirsin.',
    buyuk: 'Fotoğraf çok büyük; kaydedilemedi.',
    vazgec: 'Kaydetme iptal edildi.',
    mesgul: 'Önceki fotoğraf kaydediliyor; biraz bekleyip tekrar dene.',
  };

  async function save(opts) {
    if (!st.shot || !st.shot.ok) return { ok: false, via: 'yok', message: 'Önce bir kare yakala.' };
    if (st.saving) return { ok: false, via: 'yok', message: 'Kaydediliyor.' };
    st.saving = true;
    try {
      const r = await shooter.save(st.shot, opts);
      st.lastSave = r;
      if (r.ok) {
        st.stats.saves++;
        G.emit({ type: 'photoSaved', via: r.via });
        if (typeof G.speak === 'function') G.speak(r.via === 'paylasim' ? 'Fotoğraf paylaşıldı.' : 'Fotoğraf kaydedildi.');
      }
      st.version++;
      return Object.assign({ message: r.ok ? (r.via === 'paylasim' ? SAVE_MSG.paylasim : 'Fotoğraf kaydedildi.') : (SAVE_MSG[r.via] || SAVE_MSG.yok) }, r);
    } finally {
      st.saving = false;
    }
  }

  function discard() {
    if (st.shot) {
      shooter.release(st.shot);
      st.shot = null;
      st.version++;
    }
    return true;
  }

  /* ---------------------------------------------------------------------------- görünüm */
  function album() {
    const c = kit.inCity() ? kit.blob() : null;
    const ps = decodePhotoState(c ? c.photo : null);
    return {
      taken: ps.n,
      count: albumCount(ps),
      total: PHOTO_SUBJECTS.length,
      done: ps.w === 1,
      subjects: PHOTO_SUBJECTS.map((s, i) => ({
        id: s.id, name: s.name, hint: s.hint, done: ((ps.s >> i) & 1) === 1,
      })),
      assignment: st.assignment && PHOTO_ASSIGNMENTS[st.assignment] ? PHOTO_ASSIGNMENTS[st.assignment].hint : '',
    };
  }

  function shotView() {
    const s = st.shot;
    if (!s || !s.ok) return null;
    return {
      id: s.id, w: s.w, h: s.h, bytes: s.bytes, name: s.name, url: shooter.objectUrl(s), subjects: s.subjects || [], kredi: s.kredi || 0, counted: s.counted !== false,
    };
  }

  function canShare() {
    if (st.canShare === null) st.canShare = shooter.canShare();
    return st.canShare;
  }

  function state() {
    const c = canOpen();
    return {
      open: st.open,
      canOpen: { ok: c.ok, reason: c.reason, message: c.message },
      settings: Object.assign({}, st.settings, { dist: st.orbit.dist }),
      view: { yaw: st.orbit.yaw, pitch: st.orbit.pitch, dist: st.pose.dist, blocked: st.pose.blocked },
      limits: PHOTO_LIMITS,
      filters: PHOTO_FILTERS,
      frames: PHOTO_FRAMES,
      times: PHOTO_TIMES,
      rains: PHOTO_RAINS,
      shot: shotView(),
      busy: st.busy,
      saving: st.saving,
      lastSave: st.lastSave,
      canShare: canShare(),
      reduced: reduced(),
      album: album(),
      version: st.version,
    };
  }

  /* ---------------------------------------------------------------------------- NPC efektleri */
  function nearestPhotoSpot() {
    if (!kit.inCity()) return null;
    const p = kit.pos();
    let best = null;
    let bd = Infinity;
    mapPoiList(kit.seed()).forEach((q) => {
      if (q.type !== 'photo_spot') return;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = q;
      }
    });
    return best;
  }

  function photoEffect(e) {
    const q = G.cityMissions;
    if (q && typeof q.startQuest === 'function' && typeof q.questState === 'function' && q.questState('nm_fotograf') === 0) q.startQuest('nm_fotograf');
    const as = e && typeof e.id === 'string' && PHOTO_ASSIGNMENTS[e.id] ? e.id : '';
    if (as) st.assignment = as;
    const spot = nearestPhotoSpot();
    const mm = q && q.mm;
    if (spot && mm && typeof mm.setMarker === 'function' && !mm.busy()) mm.setMarker(spot, 'Foto noktası');
    st.openQueued = true;
    st.version++;
    return { ok: true, msg: as ? PHOTO_ASSIGNMENTS[as].hint : 'Fotoğraf modunu aç ve güzel bir kare yakala.' };
  }

  function travelEffect(e) {
    const id = 't' + (e && Number.isInteger(e.to) ? e.to : 0);
    const nodes = traveler.info().nodes;
    const n = nodes.find((x) => x.id === id);
    if (!n) return { ok: false, msg: 'Orayı henüz keşfetmedin.', reason: 'bilinmiyor' };
    if (!n.ok && n.reason !== 'arayuz') return { ok: false, msg: n.message, reason: n.reason };
    st.travelQueued = id;
    return { ok: true, msg: 'Diyalog bitince ' + n.name + ' noktasına gidelim.' };
  }

  function hookNpc() {
    const n = G.cityNpc;
    if (!n || !n.effects || st.hooked) return;
    st.hooked = true;
    st.offs.push(n.effects.on('photo', photoEffect), n.effects.on('travel', travelEffect));
  }

  function unhook() {
    st.offs.forEach((off) => { if (typeof off === 'function') off(); });
    st.offs.length = 0;
    st.hooked = false;
  }

  function processQueues() {
    if (G.ui !== 'none' || (G.cityNpc && G.cityNpc.state && G.cityNpc.state.ui)) return;
    if (st.openQueued) {
      st.openQueued = false;
      const r = open();
      if (!r.ok && r.message) say(r.message, 'foto:ac');
    }
    if (st.travelQueued) {
      const id = st.travelQueued;
      st.travelQueued = '';
      const r = traveler.start(id);
      if (!r.ok && r.message) say(r.message, 'seyahat:ret');
    }
  }

  /* ---------------------------------------------------------------------------- klavye */
  function onKey(e) {
    if (!e || e.code !== PHOTO_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
    if (st.open) {
      close('tus');
      e.preventDefault();
      return;
    }
    if (G.ui === 'none' && kit.inCity()) {
      const r = open();
      if (!r.ok && r.message) say(r.message, 'foto:ret');
      e.preventDefault();
    }
  }

  /* ---------------------------------------------------------------------------- sistem */
  const system = {
    name: 'cityPhoto',
    order: CITY_PHOTO_ORDER,
    st,

    init() {
      G.cityPhoto = {
        st, open, close, canOpen, set, capture, save, discard, fx, shooter, traveler, state, album,
      };
      G.cityMap = { decorate: (info) => mapView.decorate(info), view: mapView, traveler };
      if (win && typeof win.addEventListener === 'function') {
        st.keyHandler = onKey;
        win.addEventListener('keydown', onKey);
      }
      registerCommand('foto', 'foto | ac | kapat | cek | kaydet | durum', (g, a) => {
        const ok = (message, data) => ({ ok: true, message, data });
        const cmd = a && a[0] ? a[0] : 'durum';
        if (cmd === 'ac') {
          const r = open();
          return { ok: r.ok, message: r.message || (r.ok ? 'Foto modu açık.' : 'Açılamadı.'), data: r };
        }
        if (cmd === 'kapat') return ok('Kapandı.', close('komut'));
        if (cmd === 'cek') {
          capture().then((r) => say(r.ok ? 'Kare: ' + r.bytes + ' bayt.' : r.message, 'foto:cek'));
          return ok('Kare isteniyor…');
        }
        if (cmd === 'kaydet') {
          save().then((r) => say(r.message, 'foto:kaydet'));
          return ok('Kaydediliyor…');
        }
        const s = state();
        return ok('Foto: ' + (s.open ? 'açık' : 'kapalı') + ' · albüm ' + s.album.count + '/' + s.album.total, s);
      });
      registerCommand('seyahat', 'seyahat | liste | <t0..t15|m0..m4>', (g, a) => {
        const cmd = a && a[0] ? a[0] : 'liste';
        if (!kit.inCity()) return { ok: false, message: 'Hızlı seyahat yalnız Neon Meridyen\'de.' };
        if (cmd === 'liste') {
          const i = traveler.info();
          return { ok: true, message: i.nodes.map((n) => n.id + (n.ok ? '' : '(' + n.reason + ')')).join(' ') || 'yok', data: i };
        }
        const r = traveler.start(cmd);
        return { ok: r.ok, message: r.message, data: r };
      });
      registerCommand('harita', 'harita | hepsi | durum', (g, a) => {
        if (!kit.inCity()) return { ok: false, message: 'Şehir haritası yalnız Neon Meridyen\'de.' };
        if (a && a[0] === 'hepsi') return { ok: true, message: 'Tüm bölgeler, terminaller ve yerler açıldı.', data: mapView.revealAll() };
        return { ok: true, message: 'Harita: ' + mapView.stats.revealed + ' yer bulundu.', data: mapView.stats };
      });
    },

    fixedUpdate(_G, dt) {
      if (!kit.inCity()) return;
      hookNpc();
      mapView.tick(dt);
    },

    frameUpdate(_G, dt) {
      if (!kit.inCity()) {
        if (st.open) close('dim');
        return;
      }
      if (!st.hooked) hookNpc();
      traveler.update(dt);
      processQueues();
      // «simülasyonu dondur»: systems/dimension.frameUpdate bekçisi (order −120) bayrağı her kare sıfırlar → bizim sıramızda yeniden kurulur
      if (st.open && st.froze && !traveler.busy) G.simFrozen = true;
      frame(dt);
    },

    onEvent(_G, evt) {
      if (!evt || typeof evt.type !== 'string') return;
      switch (evt.type) {
        case 'uiChanged':
          if (st.open && evt.ui !== 'photo') close('ui');
          break;
        case 'death':
          if (st.open) close('olum');
          traveler.cancel('olum');
          st.openQueued = false;
          st.travelQueued = '';
          break;
        default:
          break;
      }
    },

    beforeDimension() {
      unhook();
      if (st.open) close('dim');
      traveler.cancel('dim');
      st.openQueued = false;
      st.travelQueued = '';
    },

    onDimension() {
      st.counted.valid = false;
      st.assignment = '';
    },

    api() {
      return {
        getPhotoState: () => state(),
        photoOpen: () => open(),
        photoClose: () => close('api'),
        photoSet: (patch) => set(patch),
        photoOrbit: (dy, dp) => orbit(dy, dp),
        photoZoom: (d) => zoom(d),
        photoCapture: () => capture(),
        photoSave: () => save(),
        photoShare: () => save({ mode: 'paylas' }),
        photoDiscard: () => discard(),
        getPhotoAlbum: () => album(),
        getFastTravel: () => traveler.info(),
        fastTravel: (id) => traveler.start(String(id)),
        getMapRoute: (x, z) => mapView.route({ x: Number(x), z: Number(z) }),
        openCityMap: () => {
          if (!kit.inCity()) return { ok: false, reason: 'sehir', message: 'Şehir haritası yalnız Neon Meridyen\'de.' };
          if (G.ui !== 'none' && G.ui !== 'pause') return { ok: false, reason: 'arayuz', message: DENIED.arayuz };
          if (typeof G.setUi === 'function') G.setUi('map');
          return { ok: G.ui === 'map', reason: 'tamam', message: '' };
        },
      };
    },

    dispose() {
      if (win && st.keyHandler) win.removeEventListener('keydown', st.keyHandler);
      st.keyHandler = null;
      unhook();
      if (st.open) close('dispose');
      fx.end();
      traveler.cancel('dispose');
      if (st.shot) shooter.release(st.shot);
      st.shot = null;
      G.cityPhoto = null;
      G.cityMap = null;
    },
  };
  return system;
}

export default createSystem;
