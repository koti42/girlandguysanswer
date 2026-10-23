/*
 * Neon Meridyen foto kaydı köprüsü (Keşif → mobil uygulama, protokol v1 eki). Motor fotoğrafı `kesif:savephoto` iptal edilebilir pencere olayıyla sunar
 * (detail {id, name, mime, bytes, width, height, blob, result}); gömülü uygulamada bu dosya olayı yakalar, JPEG'i base64 PARÇALARA bölüp native'e yollar ve
 * `result`'a «kaydedildi mi» sözünü yazar. Native yoksa / hata olursa söz false → motor kendi İNDİRME yoluna döner (zarif geri dönüş).
 *
 * Web → native (4096 karakter sınırı yüzünden üstbilgi + parçalar; sıra korunur):
 *   {type:'savePhoto',     id, name:'neon-meridyen-….jpg', mime:'image/jpeg', bytes, parts}
 *   {type:'savePhotoPart', id, index:0..parts-1, data:<base64, ≤ 3000 karakter>}
 * Native → web:
 *   {type:'photoSaved', id, ok:boolean, status?}  (Faz 5: mobil işleyici fotoğrafı albüme / klasöre / paylaşım menüsüne yazar)
 *      status: working (ara bildirim: izin penceresi / klasör seçici sürüyor → bekleme süresi uzar) | saved | permission_denied | too_large |
 *      cancelled | busy | failed. status YOKSA (eski uygulama) ok=false → web indirmeyi dener; status VARSA indirme denenmez (WebView'de işe
 *      yaramaz) ve kesin durum Türkçe iletiye çevrilir (detail.hostStatus → systems/cityPhotoShot.js).
 *
 *   planPhotoMessages(id, name, bytes) → [üstbilgi, ...parçalar]      saf; bytes Uint8Array
 *   createPhotoSaver({post, onMessage, timeoutMs, workTimeoutMs, legacyAckMs, isLegacy, newId, shield}) → { save(detail) → Promise<boolean>, saveDetailed(detail) → Promise<{ok,status}>, handler(e) }
 *      post(type, payload) → bool (bridge.postToNative)     onMessage(listener) → off (bridge.onNativeMessage)
 *      shield {on(), off()} (createPauseShield(window)): kayıt sürerken sistem pencerelerinin yol açtığı blur/visibilitychange motoru duraklatmasın
 */
import { PHOTO_MAX_BYTES, PHOTO_MAX_PARTS, PHOTO_PART_CHARS } from './bridge.js';

/** Parça başına bayt: 3000 base64 karakter = 2250 bayt (3'ün katı → parça içinde dolgu yok). */
export const PHOTO_PART_BYTES = (PHOTO_PART_CHARS / 4) * 3;

function b64(bytes, from, to) {
  let bin = '';
  for (let i = from; i < to; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function planPhotoMessages(id, name, bytes) {
  const n = bytes && typeof bytes.length === 'number' ? bytes.length : 0;
  if (!(n >= 1) || n > PHOTO_MAX_BYTES) return null;
  const parts = Math.ceil(n / PHOTO_PART_BYTES);
  if (parts > PHOTO_MAX_PARTS) return null;
  const out = [{
    type: 'savePhoto', id, name, mime: 'image/jpeg', bytes: n, parts,
  }];
  for (let i = 0; i < parts; i++) {
    out.push({
      type: 'savePhotoPart', id, index: i, data: b64(bytes, i * PHOTO_PART_BYTES, Math.min(n, (i + 1) * PHOTO_PART_BYTES)),
    });
  }
  return out;
}

const tick = () => new Promise((r) => { setTimeout(r, 0); });

/**
 * Kayıt sürerken sistem pencereleri (galeri izni, klasör seçici, paylaşım menüsü) sayfaya pencere blur / visibilitychange olayı
 * gönderebilir; motor bunu «oyun arka planda» sayıp duraklatır, foto modu kapanır ve «kaydedildi» iletisi görünmez olurdu. Kalkan yalnız
 * kayıt SÜRERKEN (+ kısa bir artçı süre) bu iki olayı motorun dinleyicilerine ulaşmadan yutar. Dinleyiciler oluşturulurken (motor başlamadan
 * ÖNCE) yakalama evresinde pencereye takılır: eski WebView'lerde hedefteki dinleyiciler kayıt sırasıyla çalıştığından erken kayıt şarttır.
 * Gerçek arka plan sesi/döngüsü en geç kayıt zaman aşımında (≤ ~90 sn) normale döner. dispose() dinleyicileri kaldırır; win yoksa etkisiz.
 */
export function createPauseShield(win, graceMs = 400) {
  let n = 0;
  let until = 0;
  const live = !!win && typeof win.addEventListener === 'function';
  const stop = (e) => {
    if (n === 0 && Date.now() >= until) return;
    // yalnız pencere/belge düzeyi: öğelerin kendi blur olayları (odak tuzağı vb.) etkilenmez
    if (e && !(e.target && e.target.nodeType === 1)) e.stopImmediatePropagation();
  };
  if (live) {
    win.addEventListener('blur', stop, true);
    win.addEventListener('visibilitychange', stop, true);
  }
  return {
    on() {
      n++;
    },
    off() {
      if (n > 0 && --n === 0) until = Date.now() + graceMs; // artçı: bazı WebView'ler odak olayını sonuçtan hemen sonra gönderir
    },
    dispose() {
      if (!live) return;
      win.removeEventListener('blur', stop, true);
      win.removeEventListener('visibilitychange', stop, true);
    },
    _active: () => n,
  };
}

/** Native'in bildirebileceği kesin başarısızlık durumları (web Türkçe iletiyi buna göre seçer). */
export const PHOTO_FAIL_STATUSES = ['permission_denied', 'too_large', 'cancelled', 'busy', 'failed'];

export function createPhotoSaver(deps) {
  const d = deps || {};
  const timeoutMs = d.timeoutMs > 0 ? d.timeoutMs : 20000; // aktarım + ilk yanıt (eski uygulama yanıt vermezse bu süre sonra pes)
  const legacyAckMs = d.legacyAckMs > 0 ? d.legacyAckMs : 6000; // savePhoto desteği bildirmeyen (eski) uygulamada ilk yanıt süresi: işleyici yoksa uzun beklenmez
  const workTimeoutMs = d.workTimeoutMs > 0 ? d.workTimeoutMs : 60000; // native 'working' dedikten sonra (izin penceresi, klasör seçici…)
  let seq = 0;
  const newId = d.newId || (() => 'p' + Date.now().toString(36) + (seq++).toString(36));

  /**
   * → {ok, status}. status: 'saved' | PHOTO_FAIL_STATUSES | undefined (native yanıt vermedi / eski uygulama yalnız ok:false dedi →
   * çağıran eski davranışı sürdürür: indirmeyi dener).
   */
  async function saveDetailed(detail) {
    const blob = detail && detail.blob;
    if (!blob || typeof blob.arrayBuffer !== 'function') return { ok: false };
    let bytes;
    try {
      bytes = new Uint8Array(await blob.arrayBuffer());
    } catch {
      return { ok: false };
    }
    const id = newId();
    const name = typeof detail.name === 'string' && /^[\w.-]{1,64}\.jpe?g$/i.test(detail.name) ? detail.name : 'neon-meridyen.jpg';
    const plan = planPhotoMessages(id, name, bytes);
    if (!plan) return bytes.length > PHOTO_MAX_BYTES ? { ok: false, status: 'too_large' } : { ok: false };
    // sonuç beklemeye ÖNCE başla (native hızlı yanıt verirse kaçmasın)
    const shield = d.shield || null;
    if (shield) shield.on();
    let off = () => {};
    let timer = 0;
    let working = false;
    let arm = () => {};
    const ack = new Promise((resolve) => {
      arm = (ms) => {
        clearTimeout(timer);
        timer = setTimeout(() => resolve({ ok: false }), ms);
      };
      off = d.onMessage((m) => {
        if (!m || m.type !== 'photoSaved' || m.id !== id) return;
        if (m.status === 'working') {
          working = true;
          arm(workTimeoutMs);
          return;
        }
        if (m.ok === true && (m.status === undefined || m.status === 'saved')) resolve({ ok: true, status: 'saved' });
        else if (typeof m.status === 'string') resolve({ ok: false, status: PHOTO_FAIL_STATUSES.includes(m.status) ? m.status : 'failed' });
        else resolve({ ok: false });
      });
      arm(timeoutMs);
    });
    try {
      for (let i = 0; i < plan.length; i++) {
        const m = plan[i];
        const { type, ...payload } = m;
        if (!d.post(type, payload)) {
          off();
          return { ok: false };
        }
        if (i % 24 === 23) await tick();
      }
      // aktarım bitti: native'in ilk yanıtı için süre yeniden başlar (eski uygulama hiç yanıt vermez: kısa tut)
      if (!working) arm(typeof d.isLegacy === 'function' && d.isLegacy() ? legacyAckMs : timeoutMs);
      return await ack;
    } finally {
      clearTimeout(timer);
      off();
      if (shield) shield.off();
    }
  }

  async function save(detail) {
    return (await saveDetailed(detail)).ok;
  }

  /**
   * window 'kesif:savephoto' dinleyicisi: yalnız native köprü varsa olayı iptal eder (motor beklemeye geçer).
   * detail.result → Promise<boolean>; detail.hostStatus (söz çözülmeden önce yazılır) → kesin durum (cityPhotoShot Türkçe iletiyi seçer).
   */
  function handler(e, hasNative) {
    if (!hasNative || !e || !e.detail || typeof e.preventDefault !== 'function') return;
    e.preventDefault();
    const detail = e.detail;
    detail.result = saveDetailed(detail).then((r) => {
      detail.hostStatus = r.status;
      return r.ok;
    });
  }

  return { save, saveDetailed, handler };
}
