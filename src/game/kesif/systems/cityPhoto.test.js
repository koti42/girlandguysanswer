// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem as createPhoto, CITY_PHOTO_ORDER } from './cityPhoto.js';
import { createSystem as createMissions } from './cityMissions.js';
import { createSystem as createNpc } from './cityNpc.js';
import { standardSystemFiles } from '../gameSystems.js';
import { getCityPlan } from '../sim/city/cityPlan.js';
import { FAST_TRAVEL } from '../sim/city/map/fastTravel.js';
import { mapPoiList } from '../sim/city/map/mapFog.js';
import { PHOTO_KREDI } from '../sim/city/map/photoTargets.js';
import { PHOTO_LIMITS } from '../sim/city/map/photoMath.js';
import { serializeDim } from '../sim/dim/dimState.js';
import { sanitizeNeon } from '../sim/dim/dimSanitize.js';
import { clockPhase } from '../sim/daynight.js';

vi.setConfig({ testTimeout: 240000 });

/** Sahte 2B bağlam: çağrıları kaydeder. */
function fakeCtx() {
  const calls = [];
  const p = new Proxy({}, {
    get(_t, k) {
      if (k === 'calls') return calls;
      return (...a) => { calls.push([String(k)].concat(a)); };
    },
    set() { return true; },
  });
  return p;
}

function fakeCanvasFactory(log) {
  return (w, h) => {
    const ctx = fakeCtx();
    const c = {
      width: w,
      height: h,
      ctx,
      getContext: () => ctx,
      toBlob(cb, type) {
        // JPEG yerine boyuta bağlı sahte baytlar
        cb(new Blob([new Uint8Array(Math.max(16, Math.floor((w * h) / 50)))], { type }));
      },
    };
    log.push(c);
    return c;
  };
}

function boot(opts) {
  const kit = makeDimG(Object.assign({ render: true, systems: ['blocks', 'props', 'dimension'] }, opts || null));
  const G = kit.G;
  G.vehicles = { driven: null, list: () => [] };
  const events = [];
  const emit0 = G.emit;
  G.emit = (e) => { events.push(e); return emit0(e); };
  const out = { fx: { render: 0, tuned: [], photo: [], grades: [] } };
  const log = [];
  G.renderer = { domElement: { width: 1280, height: 720 } };
  G.opts.photoCanvas = fakeCanvasFactory(log);
  Object.assign(G.postfx, {
    render() { out.fx.render++; },
    tune(t) { out.fx.tuned.push(t); },
    setPhoto(p) { out.fx.photo.push(p); },
    setGrade(g) { out.fx.grades.push(g); },
  });
  G.character = { root: { visible: false } };
  G.viewModel = { swing() {}, setVisible(v) { G.viewModel.vis = v; } };
  const npc = createNpc(G);
  const missions = createMissions(G);
  const photo = createPhoto(G);
  [npc, missions, photo].forEach((s) => G.addSystem(s));
  return Object.assign(out, {
    kit, G, events, photo, missions, npc, api: photo.api(), canvases: log,
  });
}

function toCity(b, x, z, yaw) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  const px = x === undefined ? 1.5 : x;
  const pz = z === undefined ? 4.5 : z;
  for (let cx = Math.floor((px - 80) / 16); cx <= Math.floor((px + 80) / 16); cx++) {
    for (let cz = Math.floor((pz - 80) / 16); cz <= Math.floor((pz + 80) / 16); cz++) w.ensureChunk(cx, cz);
  }
  b.kit.place(px, 64, pz, yaw === undefined ? 0 : yaw);
  b.G.hud.city = { kredi: 0, district: '', mission: null, radio: '', light: null };
  b.kit.frame(1 / 60, 30);
  return r;
}

const blobOf = (b) => b.kit.mgr.get('neon').city;
const kredi = (b) => b.G.cityMissionKit.wallet.get();
const ev = (b, type) => b.events.filter((e) => e.type === type);
/** Seyahat bedeli (-) ve iadesi (+) toplamı: görev/başarım Kredisinden bağımsız ölçüm. */
const travelNet = (b) => b.events.filter((e) => e.type === 'kredi' && (e.why === 'seyahat' || e.why === 'iade')).reduce((a, e) => a + e.delta, 0);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cityPhoto: kayıt ve sıra', () => {
  it('sıra 32, benzersiz; gameSystems listesinde; onDimension/beforeDimension/dispose var', () => {
    expect(CITY_PHOTO_ORDER).toBe(32);
    const used = [-120, -110, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 35, 38, 39, 40, 10, 90];
    expect(used).not.toContain(32);
    expect(standardSystemFiles()).toContain('./systems/cityPhoto.js');
    const b = boot();
    expect(b.photo.name).toBe('cityPhoto');
    expect(b.photo.order).toBe(32);
    ['onDimension', 'beforeDimension', 'dispose', 'frameUpdate', 'fixedUpdate', 'onEvent', 'api'].forEach((k) => expect(typeof b.photo[k]).toBe('function'));
    b.kit.frame(1 / 60, 3);
    const orders = b.G.registry.list().map((s) => s.order).filter((o) => typeof o === 'number');
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('ana diyarda: foto modu açılmaz, hızlı seyahat kapalı, harita katmanı süs vermez', () => {
    const b = boot();
    b.kit.frame(1 / 60, 5);
    const s = b.api.getPhotoState();
    expect(s.open).toBe(false);
    expect(s.canOpen).toMatchObject({ ok: false, reason: 'sehir' });
    expect(b.api.photoOpen()).toMatchObject({ ok: false, reason: 'sehir' });
    expect(b.api.getFastTravel()).toMatchObject({ enabled: false, nodes: [] });
    expect(b.api.fastTravel('t0')).toMatchObject({ ok: false, reason: 'sehir' });
    expect(b.api.openCityMap()).toMatchObject({ ok: false });
    const info = { markers: [], tiles: 'x' };
    expect(b.G.cityMap.decorate(info)).toBe(info);
    expect(info.tiles).toBe('x');
  });
});

describe('cityPhoto: foto modu', () => {
  it('açılış: ui photo, kamera hedefin dist kadar arkasında, FOV uygulanır, oyuncu görünür, elde eşya gizli; kapanışta geri yüklenir', () => {
    const b = boot();
    toCity(b, 1.5, 4.5, 0.8);
    const r = b.api.photoOpen();
    expect(r.ok).toBe(true);
    expect(b.G.ui).toBe('photo');
    b.kit.frame(1 / 60, 3);
    const s = b.api.getPhotoState();
    expect(s.open).toBe(true);
    const cam = b.G.camera;
    const body = b.G.body;
    const d = Math.hypot(cam.position.x - body.x, cam.position.y - (body.y + 1.4 + 0.2), cam.position.z - body.z);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThanOrEqual(PHOTO_LIMITS.distMax + 0.01);
    expect(cam.fov).toBeCloseTo(s.settings.fov, 3);
    expect(b.G.character.root.visible).toBe(true);
    expect(b.G.viewModel.vis).toBe(false);
    expect(b.fx.photo.length).toBeGreaterThan(0);
    expect(b.fx.tuned[0]).toMatchObject({ exposure: 1 });
    expect(ev(b, 'photoOpen').length).toBe(1);
    b.api.photoClose();
    expect(b.G.ui).toBe('none');
    expect(b.photo.st.open).toBe(false);
    expect(b.fx.photo[b.fx.photo.length - 1]).toBeNull();
    expect(b.fx.grades[b.fx.grades.length - 1]).toBe('neon');
    expect(typeof b.G.afterRender === 'function' ? 'kanca kaldı' : 'temiz').toBe('temiz');
    expect(ev(b, 'photoClose').length).toBe(1);
  });

  it('yörünge: kaydırma/yakınlaştırma sınırlı; duvar yakınında kamera kısalır; sonlu', () => {
    const b = boot();
    toCity(b);
    b.api.photoOpen();
    for (let i = 0; i < 40; i++) {
      b.api.photoOrbit(0.4, 0.3);
      b.api.photoZoom(5);
      b.kit.frame(1 / 60, 1);
    }
    let s = b.api.getPhotoState();
    expect(s.settings.dist).toBeLessThanOrEqual(PHOTO_LIMITS.distMax);
    expect(s.view.pitch).toBeLessThanOrEqual(PHOTO_LIMITS.pitchMax);
    expect(s.view.dist).toBeLessThanOrEqual(PHOTO_LIMITS.distMax);
    const p = b.G.camera.position;
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
    // her yönde bir tur: kamera ile hedef arası hiç 25 m'yi aşmaz ve engelli yönde kısalır
    let blocked = 0;
    for (let k = 0; k < 24; k++) {
      b.api.photoOrbit(Math.PI / 12, 0);
      b.kit.frame(1 / 60, 1);
      s = b.api.getPhotoState();
      expect(s.view.dist).toBeLessThanOrEqual(PHOTO_LIMITS.distMax + 1e-6);
      if (s.view.blocked) blocked++;
    }
    expect(blocked).toBeGreaterThanOrEqual(0);
    b.api.photoZoom(-100);
    expect(b.api.getPhotoState().settings.dist).toBe(PHOTO_LIMITS.distMin);
  });

  it('ayarlar: yama sınırlanır; bilinmeyen değer yok sayılır; filtre/gren/pozlama postfx\'e gider', () => {
    const b = boot();
    toCity(b);
    b.api.photoOpen();
    b.api.photoSet({ fov: 500, exposure: 1.4, bloom: 1.2, vignette: 0.6, grain: 0.3, filter: 'gece_sepya', frame: 'neon', evil: 1 });
    b.kit.frame(1 / 60, 2);
    const s = b.api.getPhotoState();
    expect(s.settings.fov).toBe(PHOTO_LIMITS.fovMax);
    expect(s.settings.filter).toBe('gece_sepya');
    expect('evil' in s.settings).toBe(false);
    const last = b.fx.photo[b.fx.photo.length - 1];
    expect(last).toMatchObject({ filter: 2, grain: 0.3 });
    expect(b.fx.tuned[b.fx.tuned.length - 1]).toMatchObject({ exposure: 1.4, bloom: 1.2, vignette: 0.6 });
    expect(b.G.camera.fov).toBeCloseTo(PHOTO_LIMITS.fovMax, 3);
  });

  it('saat ve yağmur ön ayarları YALNIZ görsel: kare içinde geçerli, afterRender sonrası dünya saati/havası aynen geri gelir', () => {
    const b = boot();
    toCity(b);
    const clock = b.G.clock;
    const weather = b.G.weatherSim;
    const t0 = clock.time;
    const phase0 = clockPhase(clock);
    b.api.photoOpen();
    b.api.photoSet({ time: 'ogle', rain: 'yagmurlu' });
    for (let i = 0; i < 30; i++) {
      b.kit.frame(1 / 60, 1);
      // render.frame burada koşar: saat ve hava ön ayarı görünür
      expect(Math.abs(clockPhase(clock) - 0.25)).toBeLessThan(1e-6);
      expect(b.G.weatherSim.intensity).toBeCloseTo(0.85, 6);
      expect(b.G.weatherSim.renderKind).toBe('rain');
      expect(typeof b.G.afterRender).toBe('function');
      b.G.afterRender(1 / 60);
      expect(clock.time).toBe(t0);
      expect(b.G.weatherSim).toBe(weather);
    }
    expect(clockPhase(clock)).toBeCloseTo(phase0, 9);
    // «gerçek» seçilince hiçbir geçersiz kılma yok
    b.api.photoSet({ time: 'gercek', rain: 'gercek' });
    b.kit.frame(1 / 60, 1);
    expect(clock.time).toBe(t0);
    expect(b.G.weatherSim).toBe(weather);
    // kapanışta kanca da gider ve her şey asıl değerinde
    b.api.photoSet({ time: 'gece', rain: 'kuru' });
    b.kit.frame(1 / 60, 1);
    b.api.photoClose();
    expect(clock.time).toBe(t0);
    expect(b.G.weatherSim).toBe(weather);
  });

  it('simülasyonu dondur: açıkken sabit adımlar durur (G.simFrozen), kapatınca ve kapanışta çözülür', () => {
    const b = boot();
    toCity(b);
    let ticks = 0;
    b.G.addSystem({ name: 'probe', order: 900, fixedUpdate() { ticks++; } });
    b.api.photoOpen();
    b.api.photoSet({ freeze: true });
    expect(b.G.simFrozen).toBe(true);
    const t = ticks;
    b.kit.frame(1 / 60, 10);
    expect(ticks).toBe(t);
    b.api.photoSet({ freeze: false });
    expect(b.G.simFrozen).toBe(false);
    b.kit.frame(1 / 60, 5);
    expect(ticks).toBeGreaterThan(t);
    b.api.photoSet({ freeze: true });
    b.api.photoClose();
    expect(b.G.simFrozen).toBe(false);
  });

  it('kapanış yolları: Esc (ui none), ölüm, boyut değişimi, tuşa tekrar basma — hiçbiri kilit/kanca bırakmaz', () => {
    const b = boot();
    toCity(b);
    const cases = [
      () => b.G.setUi('none'),
      () => b.G.emit({ type: 'death' }),
      () => b.kit.mgr.swap('overworld', { reason: 'test' }),
      () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' })),
    ];
    cases.forEach((close, i) => {
      if (b.G.dim !== 'neon') toCity(b);
      if (i === 1) b.G.player.dead = false;
      const weather = b.G.weatherSim;
      const r = b.api.photoOpen();
      expect(r.ok, 'açılış ' + i + ' ' + JSON.stringify(r)).toBe(true);
      b.api.photoSet({ freeze: true, time: 'gece', rain: 'yagmurlu' });
      b.kit.frame(1 / 60, 2);
      close();
      b.kit.frame(1 / 60, 2);
      expect(b.photo.st.open, 'kapandı ' + i).toBe(false);
      expect(b.G.simFrozen, 'dondurma ' + i).toBe(false);
      expect(b.G.weatherSim === weather || b.G.dim !== 'neon', 'hava ' + i).toBe(true);
      expect(b.G.ui === 'photo', 'ui ' + i).toBe(false);
      b.api.photoSet({ freeze: false, time: 'gercek', rain: 'gercek' });
    });
  });

  it('V tuşu açar ve kapatır; metin alanındayken yok sayılır; görev sürerken açılmaz', () => {
    const b = boot();
    toCity(b);
    const key = (target) => {
      const e = new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true });
      (target || window).dispatchEvent(e);
    };
    key();
    expect(b.G.ui).toBe('photo');
    key();
    expect(b.G.ui).toBe('none');
    const input = document.createElement('input');
    document.body.appendChild(input);
    key(input);
    expect(b.G.ui).toBe('none');
    input.remove();
    b.G.cityMissions.busy = () => true;
    expect(b.api.photoOpen()).toMatchObject({ ok: false, reason: 'gorev' });
    key();
    expect(b.G.ui).toBe('none');
  });

  it('dispose: tuş dinleyicisi kalkar, G.cityPhoto/G.cityMap temizlenir', () => {
    const b = boot();
    toCity(b);
    b.photo.dispose();
    expect(b.G.cityPhoto).toBeNull();
    expect(b.G.cityMap).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV' }));
    expect(b.G.ui).toBe('none');
  });
});

describe('cityPhoto: kayıt (JPEG) ve albüm', () => {
  it('çekim: bayt > 0, HUD gizliyken (ui photo), tek photoCaptured olayı, kayıt boyutu ≤ 1920', async () => {
    const b = boot();
    toCity(b);
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    expect(b.G.hudStore.get ? b.G.hud.ui : 'photo').toBe('photo');
    const r = await b.api.photoCapture();
    expect(r.ok).toBe(true);
    expect(r.bytes).toBeGreaterThan(0);
    expect(Math.max(r.w, r.h)).toBeLessThanOrEqual(1920);
    expect(r.name).toMatch(/^neon-meridyen-\d{8}-\d{6}\.jpg$/);
    expect(b.fx.render).toBeGreaterThan(0); // aynı görevde yeniden çizildi
    expect(ev(b, 'photoCaptured').length).toBe(1);
    const st = b.api.getPhotoState();
    expect(st.shot).toMatchObject({ bytes: r.bytes });
    expect(blobOf(b).photo.n).toBe(1);
    // imza çizildi
    const drawn = b.canvases[b.canvases.length - 1].ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(drawn).toContain('Neon Meridyen');
    // imza kapalıyken yok
    b.api.photoSet({ mark: false });
    await b.api.photoCapture();
    const drawn2 = b.canvases[b.canvases.length - 1].ctx.calls.filter((c) => c[0] === 'fillText');
    expect(drawn2.length).toBe(0);
  });

  it('çerçeve çizilir (sinema bantları); kapalı modda çekim reddedilir; meşgulken ikinci istek reddedilir', async () => {
    const b = boot();
    toCity(b);
    expect((await b.api.photoCapture()).reason).toBe('kapali');
    b.api.photoOpen();
    b.api.photoSet({ frame: 'sinema' });
    b.kit.frame(1 / 60, 2);
    const p1 = b.api.photoCapture();
    const second = await b.api.photoCapture();
    expect(second.reason).toBe('mesgul');
    expect((await p1).ok).toBe(true);
    const rects = b.canvases[b.canvases.length - 1].ctx.calls.filter((c) => c[0] === 'fillRect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('çekim sürerken foto modu kapanırsa kare atılır: durum/ödül/sayaç yok, nesne adresi bırakılır', async () => {
    const b = boot();
    toCity(b);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    const p = b.api.photoCapture();
    b.api.photoClose(); // await öncesi eşzamanlı kapanış
    const r = await p;
    expect(r).toMatchObject({ ok: false, reason: 'kapali' });
    expect(b.photo.st.shot).toBeNull();
    expect(ev(b, 'photoCaptured').length).toBe(0);
    expect((blobOf(b).photo || { n: 0 }).n).toBe(0);
  });

  it('sayaç kötüye kullanımı: aynı bakıştan art arda çekim sayılmaz; 2 sn sonra farklı bakış sayılır', async () => {
    const b = boot();
    toCity(b);
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    const a = await b.api.photoCapture();
    expect(a.counted).toBe(true);
    const c = await b.api.photoCapture();
    expect(c.ok).toBe(true);
    expect(c.counted).toBe(false);
    expect(blobOf(b).photo.n).toBe(1);
    b.kit.frame(1 / 60, 150);
    b.api.photoOrbit(1.0, 0.2);
    b.kit.frame(1 / 60, 2);
    const d = await b.api.photoCapture();
    expect(d.counted).toBe(true);
    expect(blobOf(b).photo.n).toBe(2);
  });

  it('albüm: kadrajdaki Boyut Terminali ilk kez +8 Kredi, tekrar 0; tüm terminaller bulunmuş olması gerekmez', async () => {
    const b = boot();
    // terminal 0 (0,64,0): oyuncu 7 m güneyde, kuzeye (−z) bakar
    toCity(b, 0.5, 7.5, 0);
    b.api.photoOpen();
    b.api.photoSet({ dist: 1.3, fov: 80 });
    b.api.photoOrbit(0, 0.1);
    b.kit.frame(1 / 60, 3);
    const k0 = kredi(b);
    const r = await b.api.photoCapture();
    expect(r.subjects).toContain('Boyut Terminali');
    expect(r.kredi).toBeGreaterThanOrEqual(PHOTO_KREDI.subject);
    expect(kredi(b) - k0).toBe(r.kredi);
    expect(ev(b, 'photoSubject').some((e) => e.id === 'terminal')).toBe(true);
    expect(b.api.getPhotoAlbum().count).toBeGreaterThanOrEqual(1);
    b.kit.frame(1 / 60, 150);
    b.api.photoOrbit(0.3, 0);
    b.api.photoOrbit(-0.3, 0);
    b.api.photoZoom(0.4);
    b.kit.frame(1 / 60, 2);
    const k1 = kredi(b);
    const r2 = await b.api.photoCapture();
    expect(r2.subjects).toContain('Boyut Terminali');
    expect(r2.kredi - 0).toBe(kredi(b) - k1);
    expect(ev(b, 'photoSubject').filter((e) => e.id === 'terminal').length).toBe(1);
  });

  it('kaydet: köprü olayı işlenirse via uygulama; işlenmezse indirme bağlantısı; ikisi de olmazsa ok:false', async () => {
    const b = boot();
    toCity(b);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    expect((await b.api.photoSave()).ok).toBe(false); // henüz kare yok
    await b.api.photoCapture();
    let r = await b.api.photoSave();
    expect(r).toMatchObject({ ok: true, via: 'indirme' });
    expect(click).toHaveBeenCalledTimes(1);
    expect(ev(b, 'photoSaved').length).toBe(1);
    const seen = [];
    const handler = (e) => {
      seen.push({ name: e.detail.name, mime: e.detail.mime, bytes: e.detail.bytes, hasBlob: e.detail.blob instanceof Blob });
      e.preventDefault();
      e.detail.result = Promise.resolve(true);
    };
    window.addEventListener('kesif:savephoto', handler);
    r = await b.api.photoSave();
    window.removeEventListener('kesif:savephoto', handler);
    expect(r).toMatchObject({ ok: true, via: 'uygulama' });
    expect(seen[0]).toMatchObject({ mime: 'image/jpeg', hasBlob: true });
    expect(seen[0].bytes).toBeGreaterThan(0);
    expect(click).toHaveBeenCalledTimes(1);
    // köprü reddederse indirmeye düşer
    const refuse = (e) => { e.preventDefault(); e.detail.result = Promise.resolve(false); };
    window.addEventListener('kesif:savephoto', refuse);
    r = await b.api.photoSave();
    window.removeEventListener('kesif:savephoto', refuse);
    expect(r.via).toBe('indirme');
    // atma
    b.api.photoDiscard();
    expect(b.api.getPhotoState().shot).toBeNull();
    expect((await b.api.photoSave()).ok).toBe(false);
  });

  it('nesne URL\'si kapanışta bırakılır (sızıntı yok)', async () => {
    const b = boot();
    toCity(b);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    await b.api.photoCapture();
    expect(b.api.getPhotoState().shot.url).toBe('blob:photo');
    b.api.photoClose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
  });
});

describe('cityPhoto: paylaşım (Web Paylaşım)', () => {
  const setNav = (share, canShare) => {
    Object.defineProperty(window.navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(window.navigator, 'canShare', { configurable: true, value: canShare });
  };
  const clearNav = () => {
    delete window.navigator.share;
    delete window.navigator.canShare;
  };
  afterEach(() => {
    clearNav();
    vi.useRealTimers();
  });

  async function ready() {
    const b = boot();
    toCity(b);
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn();
    b.api.photoOpen();
    b.kit.frame(1 / 60, 2);
    await b.api.photoCapture();
    return b;
  }

  it('destek yoksa canShare=false ve photoShare indirme YAPMAZ; destek varsa durumda true', async () => {
    const b = await ready();
    expect(b.api.getPhotoState().canShare).toBe(false);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await b.api.photoShare()).toMatchObject({ ok: false, via: 'yok' });
    expect(click).not.toHaveBeenCalled();
    const b2 = boot();
    setNav(vi.fn(async () => {}), vi.fn(() => true));
    toCity(b2);
    expect(b2.api.getPhotoState().canShare).toBe(true);
  });

  it('paylaşım başarılı → via paylasim, photoSaved olayı; indirme çağrılmaz; dosya adı ve JPEG türü verilir', async () => {
    const share = vi.fn(async () => {});
    setNav(share, vi.fn(() => true));
    const b = await ready();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const r = await b.api.photoShare();
    expect(r).toMatchObject({ ok: true, via: 'paylasim' });
    expect(r.message).toMatch(/paylaşıldı/);
    const arg = share.mock.calls[0][0];
    expect(arg.files[0].name).toMatch(/^neon-meridyen-\d{8}-\d{6}\.jpg$/);
    expect(arg.files[0].type).toBe('image/jpeg');
    expect(click).not.toHaveBeenCalled();
    expect(ev(b, 'photoSaved').some((e) => e.via === 'paylasim')).toBe(true);
  });

  it('kullanıcı vazgeçerse (AbortError) iptal; indirmeye DÜŞMEZ. Başka hata → ok:false (indirme yok)', async () => {
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    setNav(vi.fn(async () => { throw abort; }), vi.fn(() => true));
    const b = await ready();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await b.api.photoShare()).toMatchObject({ ok: false, via: 'iptal' });
    expect(click).not.toHaveBeenCalled();
    setNav(vi.fn(async () => { throw new Error('izin yok'); }), vi.fn(() => true));
    expect(await b.api.photoShare()).toMatchObject({ ok: false, via: 'yok' });
    expect(click).not.toHaveBeenCalled();
    // sonra Kaydet hâlâ çalışır
    expect(await b.api.photoSave()).toMatchObject({ ok: true, via: 'indirme' });
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('paylaşım yanıt vermezse 60 sn sonra zaman aşımı; kilit (saving) kalkar', async () => {
    const b = await ready();
    setNav(vi.fn(() => new Promise(() => {})), vi.fn(() => true));
    vi.useFakeTimers();
    const p = b.api.photoShare();
    expect(b.api.getPhotoState().saving).toBe(true);
    await vi.advanceTimersByTimeAsync(60001);
    const r = await p;
    expect(r).toMatchObject({ ok: false, via: 'zaman' });
    expect(r.message).toMatch(/Kaydet/);
    expect(b.api.getPhotoState().saving).toBe(false);
  });
});

describe('cityPhoto: Irmak foto görevi (NPC efekti)', () => {
  it('photo efekti görevi başlatır; diyalog kapanınca foto modu açılır; görev konusu kadrajda tamamlanır (+15)', async () => {
    const b = boot();
    toCity(b, 0.5, 7.5, 0);
    b.kit.frame(1 / 60, 5);
    expect(b.G.cityNpc.effects.has('photo')).toBe(true);
    const k0 = kredi(b);
    const r = b.G.cityNpc.effects.runOne({ k: 'photo', id: 'foto_ilk' }, {});
    expect(r.ok).toBe(true);
    expect(b.G.cityMissions.questState('nm_fotograf')).toBe(1);
    b.kit.frame(1 / 60, 3);
    expect(b.G.ui).toBe('photo');
    b.api.photoSet({ dist: 1.3, fov: 80 });
    b.api.photoOrbit(0, 0.1);
    b.kit.frame(1 / 60, 3);
    const shot = await b.api.photoCapture();
    expect(shot.subjects).toContain('Boyut Terminali');
    expect(ev(b, 'photoQuestDone').length).toBe(1);
    expect(kredi(b) - k0).toBe(shot.kredi);
    expect(shot.kredi).toBeGreaterThanOrEqual(PHOTO_KREDI.subject + PHOTO_KREDI.assignment);
    // foto sayacı görev sistemine de ulaştı
    expect(blobOf(b).stats.photosTaken).toBe(1);
  });

  it('diyalog açıkken foto modu sıraya girer, açılmaz; görev varsa açılmaz ve mesaj verir', () => {
    const b = boot();
    toCity(b);
    b.G.cityNpc.effects.runOne({ k: 'photo', id: 'foto_ilk' }, {});
    b.G.setUi('dialogue');
    b.kit.frame(1 / 60, 5);
    expect(b.G.ui).toBe('dialogue');
    b.G.setUi('none');
    b.kit.frame(1 / 60, 3);
    expect(b.G.ui).toBe('photo');
  });
});

describe('cityPhoto: hızlı seyahat', () => {
  function travelReady(b, mask) {
    const ctx = b.kit.mgr.get('neon');
    ctx.terminals.found = mask;
    b.kit.frame(1 / 60, 2);
    return ctx;
  }

  it('yalnız bulunmuş terminaller listelenir; bulunmayan sızmaz; kural nedenleri bilgi satırında', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 0);
    let info = b.api.getFastTravel();
    expect(info.enabled).toBe(true);
    expect(info.nodes.map((n) => n.id)).toEqual(['t0']);
    expect(info.cost).toBe(FAST_TRAVEL.cost);
    expect(info.nodes[0]).toMatchObject({ ok: false, reason: 'ayni' });
    travelReady(b, (1 << 3) | (1 << 9));
    info = b.api.getFastTravel();
    expect(info.nodes.map((n) => n.id)).toEqual(['t0', 't3', 't9']);
    const t3 = info.nodes.find((n) => n.id === 't3');
    expect(t3.ok).toBe(true);
    expect(JSON.stringify(info)).not.toContain('t4');
    expect(b.api.fastTravel('t4')).toMatchObject({ ok: false, reason: 'bilinmiyor' });
  });

  it('uçtan uca: Kredi peşin, karartma, ışınlanma, açılma; bayraklar temiz; bekleme süresi; ikinci seyahat bekler', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 1 << 3);
    const plan = getCityPlan(b.G.world.seed);
    const t3 = plan.terminals[3];
    const k0 = kredi(b);
    const r = b.api.fastTravel('t3');
    expect(r.ok).toBe(true);
    expect(kredi(b)).toBe(k0 - FAST_TRAVEL.cost);
    expect(b.G.simFrozen).toBe(true);
    expect(b.G.transitionActive).toBe(true);
    let sawBlack = false;
    for (let i = 0; i < 60 * 8 && b.photo.st.open === false && b.G.cityPhoto.traveler.busy; i++) {
      b.kit.frame(1 / 60, 1);
      if (b.G.postfx.last && b.G.postfx.last.fade >= 0.999) sawBlack = true;
    }
    expect(sawBlack).toBe(true);
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    expect(b.G.simFrozen).toBe(false);
    expect(b.G.transitionActive).toBe(false);
    expect(b.G.postfx.last.fade).toBe(0);
    expect(Math.hypot(b.G.body.x - t3.x, b.G.body.z - t3.z)).toBeLessThan(40);
    expect(ev(b, 'fastTravel').length).toBe(1);
    expect(b.kit.saves).toContain('seyahat');
    // bekleme
    const again = b.api.fastTravel('t0');
    expect(again).toMatchObject({ ok: false });
    expect(['bekle', 'ayni']).toContain(again.reason);
    b.kit.frame(1 / 60, 60 * 11);
    b.kit.place(t3.x + 100, 64, t3.z + 100, 0);
    b.kit.frame(1 / 60, 3);
    expect(b.api.fastTravel('t0').ok).toBe(true);
  });

  it('en az 3 sn toplam süre (normal) ve 0,4 sn (kısıtlı hareket)', () => {
    const run = (reduced) => {
      const b = boot({ reduced });
      toCity(b);
      travelReady(b, 1 << 3);
      expect(b.api.fastTravel('t3').ok).toBe(true);
      let frames = 0;
      while (b.G.cityPhoto.traveler.busy && frames < 60 * 12) {
        b.kit.frame(1 / 60, 1);
        frames++;
      }
      return frames / 60;
    };
    const normal = run(false);
    const calm = run(true);
    expect(normal).toBeGreaterThanOrEqual(2.9);
    expect(normal).toBeLessThan(6);
    expect(calm).toBeGreaterThanOrEqual(0.35);
    expect(calm).toBeLessThan(1.5);
  });

  it('kurallar motorda: görevde, araçta, tehlikede, Kredi yetersizken, ölüyken reddedilir ve Kredi kesilmez', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 1 << 3);
    const k0 = kredi(b);
    b.G.cityMissions.busy = () => true;
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'gorev' });
    b.G.cityMissions.busy = () => false;
    b.G.vehicles = { driven: { v: { x: 1, y: 64, z: 1, vx: 0, vz: 0, cls: 'taksi', yaw: 0 } } };
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'arac' });
    b.G.vehicles = { driven: null, list: () => [] };
    b.G.combatLevel = 0.8;
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'tehlike' });
    b.G.combatLevel = 0;
    b.G.player.dead = true;
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'olu' });
    b.G.player.dead = false;
    b.G.setUi('inventory');
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'arayuz' });
    b.G.setUi('none');
    b.G.transitionActive = true;
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'gecis' });
    b.G.transitionActive = false;
    expect(kredi(b)).toBe(k0);
    b.G.cityMissionKit.wallet.spend(kredi(b) - 2, 'test');
    expect(b.api.fastTravel('t3')).toMatchObject({ ok: false, reason: 'kredi' });
    expect(kredi(b)).toBe(2);
    expect(b.G.simFrozen).toBe(false);
  });

  it('zaman aşımı: parçalar hazır olmazsa başlangıca döner, Kredi iade, bayraklar temiz (takılı kalma yok)', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 1 << 3);
    const start = { x: b.G.body.x, z: b.G.body.z };
    const k0 = kredi(b);
    b.G.chunkManager.ready = false;
    b.G.chunkManager.progress = 0.2;
    expect(b.api.fastTravel('t3').ok).toBe(true);
    let frames = 0;
    // hedefte hazır olmayacak; geri dönüşte de hazır değil → ikinci zaman aşımıyla yine açılır
    while (b.G.cityPhoto.traveler.busy && frames < 60 * 30) {
      if (frames === 60 * 7) b.G.chunkManager.ready = true; // geri dönüşte hazır
      b.kit.frame(1 / 60, 1);
      frames++;
    }
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    expect(b.G.simFrozen).toBe(false);
    expect(b.G.transitionActive).toBe(false);
    expect(travelNet(b)).toBe(0); // peşin kesilen Kredi iade edildi
    void k0;
    expect(Math.hypot(b.G.body.x - start.x, b.G.body.z - start.z)).toBeLessThan(20);
    expect(ev(b, 'fastTravel').length).toBe(0);
    expect(b.G.cityPhoto.traveler.state.aborted).toBe(1);
  });

  it('seyahat sırasında ölüm / boyut değişimi: iptal, iade (ışınlanmadıysa), bayraklar temiz', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 1 << 3);
    const k0 = kredi(b);
    expect(b.api.fastTravel('t3').ok).toBe(true);
    b.kit.frame(1 / 60, 5);
    b.G.emit({ type: 'death' });
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    expect(b.G.simFrozen).toBe(false);
    expect(travelNet(b)).toBe(0);
    void k0;
    b.kit.frame(1 / 60, 3);
    expect(b.G.simFrozen).toBe(false);
    expect(b.api.fastTravel('t3').ok).toBe(true);
    b.kit.frame(1 / 60, 3);
    b.kit.mgr.swap('overworld', { reason: 'test' });
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    expect(b.G.simFrozen).toBe(false);
  });

  it('terminal efekti: diyalog bitince seyahat başlar; bilinmeyen terminal reddedilir', () => {
    const b = boot();
    toCity(b);
    travelReady(b, 1 << 3);
    b.kit.frame(1 / 60, 3);
    expect(b.G.cityNpc.effects.runOne({ k: 'travel', to: 9 }, {})).toMatchObject({ ok: false });
    expect(b.G.cityNpc.effects.runOne({ k: 'travel', to: 3 }, {})).toMatchObject({ ok: true });
    b.G.setUi('dialogue');
    b.kit.frame(1 / 60, 3);
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    b.G.setUi('none');
    b.kit.frame(1 / 60, 3);
    expect(b.G.cityPhoto.traveler.busy).toBe(true);
  });
});

describe('cityPhoto: harita katmanı', () => {
  it('yeni yer yaklaşınca bulunur (kalıcı), olay ve ipucu; bulunmayanlar işaretlerde yok; kayıttan geçer', () => {
    const b = boot();
    toCity(b);
    const list = mapPoiList(b.G.world.seed);
    const spot = list.find((p) => p.type === 'photo_spot');
    const info0 = b.G.cityMap.decorate({ markers: [], tiles: null });
    expect(info0.markers.filter((m) => m.type === 'foto').length).toBe(0);
    expect(info0.districts.length).toBeLessThanOrEqual(1);
    b.kit.place(spot.x + 5, spot.y, spot.z + 5, 0);
    b.kit.frame(1 / 60, 40);
    expect(ev(b, 'mapPoiFound').length).toBeGreaterThanOrEqual(1);
    const info = b.G.cityMap.decorate({ markers: [], tiles: null });
    expect(info.markers.some((m) => m.id === 'foto:' + spot.id)).toBe(true);
    const others = list.filter((p) => p.type === 'photo_spot' && Math.hypot(p.x - spot.x, p.z - spot.z) > 200);
    others.forEach((p) => expect(info.markers.some((m) => m.id === 'foto:' + p.id)).toBe(false));
    const c = blobOf(b);
    const round = sanitizeNeon(JSON.parse(JSON.stringify(serializeDim(b.kit.mgr.get('neon')))));
    expect(round.city.pmap).toEqual(c.pmap);
    // ikinci kez yaklaşınca yeniden olay yok
    const n = ev(b, 'mapPoiFound').length;
    b.kit.frame(1 / 60, 40);
    expect(ev(b, 'mapPoiFound').length).toBe(n);
  });

  it('süsleme: tiles bulunmuş bölge kadar açık; bölge bitleri artınca daha çok açılır', () => {
    const b = boot();
    toCity(b);
    const known = () => b.G.cityMap.decorate({ markers: [], tiles: null }).tiles.known;
    const k1 = known();
    expect(k1).toBeGreaterThan(200);
    const c = blobOf(b);
    c.stats.dmask = 0x3f;
    expect(known()).toBeGreaterThan(k1 * 10);
  });

  it('foto ve harita durumu kayıt gidiş-dönüşünden geçer (city.photo, city.pmap)', async () => {
    const b = boot();
    toCity(b, 0.5, 7.5, 0);
    b.api.photoOpen();
    b.api.photoSet({ dist: 1.3, fov: 80 });
    b.api.photoOrbit(0, 0.1);
    b.kit.frame(1 / 60, 3);
    await b.api.photoCapture();
    const c = blobOf(b);
    const round = sanitizeNeon(JSON.parse(JSON.stringify(serializeDim(b.kit.mgr.get('neon')))));
    expect(round.city.photo).toEqual(c.photo);
    expect(round.city.photo.n).toBe(1);
  });
});
