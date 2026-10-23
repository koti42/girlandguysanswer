/*
 * KEŞİF — foto modu KAYIT hattı (photo_map): kareyi JPEG'e çevirir, kaydeder/paylaşır ve kadraja giren konuları toplar. systems/cityPhoto.js kullanır.
 *
 *   createShooter(deps) → { capture(settings) → Promise<shot>, save(shot, opts) → Promise<{ok, via}>, release(shot), stats }
 *      deps {canvas() → WebGL canvas, renderNow() (postfx.render(0): AYNI görevde çizer), makeCanvas(w,h), win (window | null), stamp() → {y,mo,d,h,mi,s}}
 *      shot {ok, reason?, blob, bytes, w, h, mime:'image/jpeg', name, url (object URL | ''), at}
 *   Kayıt: ham kare ≤ 1920 px (uzun kenar) 2B tuvale çizilir (çerçeve + isteğe bağlı «Neon Meridyen» imi), JPEG 0,92. Yüklenmez; HUD zaten DOM'dadır (tuvale girmez).
 *   save(shot): (1) gömülü uygulama köprüsü — `kesif:savephoto` iptal edilebilir olayı (mobil WebView `savePhoto` iletisi; işleyen olayı iptal eder ve detail.result'u
 *      doldurur), (2) indirme bağlantısı. save(shot, {mode:'paylas'}): Web Paylaşım (dosya; dokunmatik «Paylaş» düğmesi) — vazgeçme (AbortError) indirmeye DÜŞMEZ,
 *      60 sn'de dönmezse zaman aşımı. canShare() → cihaz dosya paylaşımını destekliyor mu. Hiçbiri olmazsa {ok:false}.
 *      Köprü kesin durum bildirirse (detail.hostStatus, bkz. embed/photoBridge.js) indirme DENENMEZ: via 'izin' | 'buyuk' | 'vazgec' | 'mesgul' | 'yok' (HOST_VIA).
 *   gatherCandidates(G, seed, cam, out) → [{kind, id, name, x, y, z, r}]   (NPC, robot, araç, yaya; sabit adaylar sistemden eklenir)
 */
import { captureDims, photoFileName, PHOTO_LIMITS } from '../sim/city/map/photoMath.js';
import { drawFrame } from '../render/city/photoFx.js';
import { getNpc } from '../sim/city/ped/npcData.js';

export const HOST_EVENT = 'kesif:savephoto';
// Üst sınır: aktarım 20 sn + native «çalışıyor» (izin penceresi / klasör seçici) 60 sn; embed/photoBridge kendi zaman aşımlarıyla daha önce döner.
const HOST_TIMEOUT_MS = 90000;
/** Uygulamanın kesin başarısızlık durumu → via (cityPhoto.js Türkçe iletiyi via'dan seçer). */
export const HOST_VIA = Object.freeze({
  permission_denied: 'izin', too_large: 'buyuk', cancelled: 'vazgec', busy: 'mesgul', failed: 'yok',
});
const JPEG_QUALITY = 0.92;
const SHARE_TIMEOUT_MS = 60000;

function toBlob(canvas, type, q) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (b) => {
      if (done) return;
      done = true;
      resolve(b || null);
    };
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(finish, type, q);
        return;
      }
    } catch {
      /* dataURL yoluna düş */
    }
    try {
      finish(dataUrlToBlob(canvas.toDataURL(type, q)));
    } catch {
      finish(null);
    }
  });
}

export function dataUrlToBlob(url) {
  if (typeof url !== 'string') return null;
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (!m) return null;
  const bin = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] });
}

export function createShooter(deps) {
  const d = deps || {};
  const stats = {
    captures: 0, failed: 0, saved: 0, host: 0, shared: 0, downloaded: 0, revoked: 0,
  };
  let seq = 0;

  async function capture(settings) {
    const s = settings || {};
    const src = d.canvas ? d.canvas() : null;
    if (!src || !(src.width > 0) || !(src.height > 0)) {
      stats.failed++;
      return { ok: false, reason: 'tuval' };
    }
    // AYNI görevde çiz + kopyala (WebGL tamponu preserveDrawingBuffer olmadan yalnız bu görev boyunca geçerlidir)
    if (typeof d.renderNow === 'function') d.renderNow();
    const dims = captureDims(src.width, src.height, PHOTO_LIMITS.captureMax);
    const out = d.makeCanvas(dims.w, dims.h);
    const ctx = out && out.getContext ? out.getContext('2d') : null;
    if (!ctx) {
      stats.failed++;
      return { ok: false, reason: 'tuval' };
    }
    try {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    } catch {
      /* yut */
    }
    ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, dims.w, dims.h);
    drawFrame(ctx, dims.w, dims.h, s.frame, { mark: s.mark !== false });
    const blob = await toBlob(out, 'image/jpeg', JPEG_QUALITY);
    if (!blob || !(blob.size > 0)) {
      stats.failed++;
      return { ok: false, reason: 'bos' };
    }
    stats.captures++;
    seq++;
    return {
      ok: true,
      id: seq,
      blob,
      bytes: blob.size,
      w: dims.w,
      h: dims.h,
      mime: 'image/jpeg',
      name: photoFileName(typeof d.stamp === 'function' ? d.stamp() : null),
      url: '',
      at: typeof d.now === 'function' ? d.now() : 0,
    };
  }

  function objectUrl(shot) {
    if (shot.url) return shot.url;
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') shot.url = URL.createObjectURL(shot.blob);
    } catch {
      shot.url = '';
    }
    return shot.url;
  }

  function release(shot) {
    if (shot && shot.url) {
      try {
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(shot.url);
      } catch {
        /* yut */
      }
      shot.url = '';
      stats.revoked++;
    }
  }

  /** → {ok, status}. status: işleyenin kesin durumu (detail.hostStatus: permission_denied | too_large | cancelled | busy | failed) ya da '' (yok / eski uygulama). */
  async function offerToHost(shot, win) {
    const none = { ok: false, status: '' };
    if (!win || typeof win.dispatchEvent !== 'function' || typeof win.CustomEvent !== 'function') return none;
    const detail = {
      id: shot.id, name: shot.name, mime: shot.mime, bytes: shot.bytes, width: shot.w, height: shot.h, blob: shot.blob, result: null, hostStatus: '',
    };
    let ev;
    try {
      ev = new win.CustomEvent(HOST_EVENT, { cancelable: true, detail });
    } catch {
      return none;
    }
    const notCancelled = win.dispatchEvent(ev);
    if (notCancelled) return none; // işleyen yok → sıradaki yol
    const p = detail.result && typeof detail.result.then === 'function' ? detail.result : Promise.resolve(detail.result === true);
    let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), HOST_TIMEOUT_MS); });
    let ok = false;
    try {
      ok = (await Promise.race([p, timeout])) === true;
    } catch {
      ok = false;
    }
    clearTimeout(timer);
    return { ok, status: !ok && typeof detail.hostStatus === 'string' ? detail.hostStatus : '' };
  }

  /** Web Paylaşım (dosya). AbortError = kullanıcı vazgeçti (indirmeye DÜŞÜLMEZ); başka hata/yok → null (çağıran karar verir); 60 sn içinde dönmezse zaman aşımı. */
  async function shareFile(shot, nav) {
    if (!canShareFiles(nav)) return null;
    let file;
    try {
      file = new File([shot.blob], shot.name, { type: shot.mime });
      if (!nav.canShare({ files: [file] })) return null;
    } catch {
      return null;
    }
    let timer = 0;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('zaman'), SHARE_TIMEOUT_MS); });
    try {
      return await Promise.race([nav.share({ files: [file], title: 'Neon Meridyen' }).then(() => 'tamam'), timeout]);
    } catch (err) {
      return err && err.name === 'AbortError' ? 'iptal' : null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cihaz dosya paylaşımını destekliyor mu? (arayüz «Paylaş» düğmesi için) */
  function canShareFiles(nav) {
    try {
      if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function' || typeof File !== 'function') return false;
      return !!nav.canShare({ files: [new File([new Uint8Array(1)], 'a.jpg', { type: 'image/jpeg' })] });
    } catch {
      return false;
    }
  }

  function download(shot, doc) {
    if (!doc || typeof doc.createElement !== 'function') return false;
    const url = objectUrl(shot);
    if (!url) return false;
    try {
      const a = doc.createElement('a');
      a.href = url;
      a.download = shot.name;
      a.rel = 'noopener';
      a.style.display = 'none';
      (doc.body || doc.documentElement).appendChild(a);
      a.click();
      if (a.remove) a.remove();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * mode 'kaydet' (varsayılan): köprü → indirme. mode 'paylas': yalnız Web Paylaşım (dokunmatik «Paylaş» düğmesi; kullanıcı jestiyle çağrılır).
   * Dönüş {ok, via: 'uygulama'|'indirme'|'paylasim'|'iptal'|'zaman'|'yok'}.
   */
  async function save(shot, opts) {
    if (!shot || !shot.ok || !shot.blob) return { ok: false, via: 'yok' };
    const o = opts || {};
    const win = o.win !== undefined ? o.win : d.win;
    if (o.mode === 'paylas') {
      const r = await shareFile(shot, win && win.navigator);
      if (r === 'tamam') {
        stats.saved++;
        stats.shared++;
        return { ok: true, via: 'paylasim' };
      }
      return { ok: false, via: r || 'yok' };
    }
    const host = await offerToHost(shot, win);
    if (host.ok) {
      stats.saved++;
      stats.host++;
      return { ok: true, via: 'uygulama' };
    }
    // Uygulama KESİN bir durum bildirdiyse (izin yok, çok büyük, vazgeçildi, meşgul, hata) indirme denenmez: WebView'de indirme sessizce
    // başarısız olur ve yanlış «kaydedildi» iletisi verirdi. Durum yoksa (eski uygulama) eski davranış: indirmeyi dene.
    if (HOST_VIA[host.status]) return { ok: false, via: HOST_VIA[host.status] };
    if (download(shot, win && win.document)) {
      stats.saved++;
      stats.downloaded++;
      return { ok: true, via: 'indirme' };
    }
    return { ok: false, via: 'yok' };
  }

  return {
    capture, save, release, objectUrl, stats, canShare: () => canShareFiles(d.win && d.win.navigator),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Kadraj adayları (çalışma zamanı konumları)
 * ---------------------------------------------------------------------------------------------- */
const MAX_NEAR = 70;
const NEAR_R = 60;

/**
 * Yaşayan konular: sokak NPC'leri/sahipler/dost robotlar (cityNpc figürleri), trafik araçları, oyuncunun aracı, yayalar.
 * cam {x,z}: yakınlık süzgeci (≤ 60 m). Eksik sistemler sessizce atlanır.
 */
export function gatherCandidates(G, cam, out) {
  const list = out || [];
  list.length = 0;
  const near = (x, z) => (x - cam.x) * (x - cam.x) + (z - cam.z) * (z - cam.z) <= NEAR_R * NEAR_R;
  try {
    const n = G.cityNpc;
    const figs = n && n.figures;
    const props = n && n.state && n.state.props;
    if (figs && typeof figs.get === 'function' && props && typeof props.forEach === 'function') {
      props.forEach((pid, id) => {
        const f = figs.get(id);
        if (!f || f.visible === false || !near(f.x, f.z)) return;
        const npc = getNpc(id);
        const robot = !!npc && npc.kind === 'robot';
        list.push({
          kind: robot ? 'robot' : 'sahip', id: 'n:' + id, name: npc ? npc.name : id, x: f.x, y: f.y + 1.0, z: f.z, r: 0.7,
        });
      });
    }
  } catch {
    /* NPC sistemi hazır değil */
  }
  try {
    const tv = G.traffic && G.traffic.view;
    if (tv && tv.count > 0) {
      for (let i = 0; i < tv.count && list.length < MAX_NEAR * 2; i++) {
        if (near(tv.x[i], tv.z[i])) {
          list.push({
            kind: 'arac', id: 'a:' + i, name: 'Araç', x: tv.x[i], y: tv.y[i] + 0.8, z: tv.z[i], r: 1.6,
          });
        }
      }
    }
    const dv = G.vehicles && G.vehicles.driven && G.vehicles.driven.v;
    if (dv && Number.isFinite(dv.x)) {
      list.push({
        kind: 'arac', id: 'a:own', name: 'Aracın', x: dv.x, y: dv.y + 0.8, z: dv.z, r: 1.8,
      });
    }
  } catch {
    /* trafik hazır değil */
  }
  try {
    const cv = G.crowd && G.crowd.view;
    if (cv && cv.count > 0) {
      for (let i = 0; i < cv.count && list.length < MAX_NEAR * 4; i++) {
        if (near(cv.x[i], cv.z[i])) {
          list.push({
            kind: 'yaya', id: 'y:' + i, name: 'Yaya', x: cv.x[i], y: cv.y[i] + 0.9, z: cv.z[i], r: 0.5,
          });
        }
      }
    }
  } catch {
    /* kalabalık hazır değil */
  }
  return list;
}
