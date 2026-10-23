/*
 * KEŞİF sim/city/mission — SUNUCU TALEP KUYRUĞU (neon:* jeton talepleri). SAF (saat ve ağ dışarıdan enjekte), es2020. Oyunu ASLA bloklamaz: tüm işlem tek tek
 * ve eşzamansızdır; hata sessizdir. Kayıtta dayanıklıdır: `city.claims[k] = 1` (kazanıldı, sunucu henüz onaylamadı) kalıcıdır → çevrimdışı/çıkış/yeniden yükleme sonrası
 * kuyruk kendiliğinden yeniden kurulur. Sunucu tek-seferlik (unique) olduğu için aynı anahtarın tekrarı zararsızdır (409 already_claimed = onaylı say).
 *
 *   createClaimQueue({getCity, now, emit?, transport?, enabled?}) → q
 *     getCity() → city blob | null          now() → saniye (monoton; oyun saati)        emit(evt) → motor olayı (kip 'olay')
 *     transport(key, idemKey) → Promise<{claimed?:boolean}>   verilirse DOĞRUDAN kip; verilmezse OLAY kipi: `{type:'reward', key}` yayılır ve sayfanın talep yürütücüsü
 *                                                          (createRewardClaimer: oturum aç, geri çekilmeli yeniden deneme, 409/422 sınıflaması) ağ işini yapar.
 *     enabled() → bool                      false iken (giriş yapılmamış) HİÇBİR şey yayılmaz/gönderilmez; kuyruk kayıtta bekler
 *   q.tick() → bu karede gönderilen/yayılan anahtar sayısı        (saniyede ~1 kez çağrılması yeter)
 *   q.onClaimed(key) → bool            sayfa "talep işlendi" dediğinde (markRewardClaimed) çağrılır       q.pending() → ['neon:…']
 *   q.stats {sent, emitted, ok, retried, failed, skipped}      q.nextAt(key)      q.reset()
 *   Geri çekilme: 30 · 60 · 120 · 240 · 480 sn (tavan 600); başarıda biter. Olay kipi: ilk kazanımda hemen, sonra her 90 sn yeniden yayılır (onaylanana dek).
 *   Idempotency-Key: `neon-<anahtar>-<deneme>` (aynı anahtar için kararlı önek; sunucu zaten tek-seferlik).
 */
import { markClaimed, pendingClaims } from '../cityEvents.js';

export const BACKOFF = Object.freeze([30, 60, 120, 240, 480, 600]);
export const REEMIT_SEC = 90;

export function createClaimQueue(opts) {
  const o = opts || {};
  const stats = {
    sent: 0, emitted: 0, ok: 0, retried: 0, failed: 0, skipped: 0,
  };
  const st = new Map(); // key -> {next, tries, busy}
  const direct = typeof o.transport === 'function';
  const enabled = () => (typeof o.enabled === 'function' ? !!o.enabled() : true);
  const now = () => (typeof o.now === 'function' ? o.now() : 0);

  function entry(key) {
    let e = st.get(key);
    if (!e) {
      e = { next: -1, tries: 0, busy: false };
      st.set(key, e);
    }
    return e;
  }

  function classify(err) {
    const status = err && (err.status || (err.response && err.response.status)) ? (err.status || err.response.status) : 0;
    const reason = err && err.data && typeof err.data.reason === 'string' ? err.data.reason : (err && err.response && err.response.data && err.response.data.reason) || '';
    if (status === 409) return 'done';
    if (status === 401 || status === 403) return 'stop';
    if (status === 422 && (reason === 'world_cap' || reason === 'lifetime_cap')) return 'done';
    if (status === 422 && (reason === 'too_early' || reason === 'prerequisite' || reason === 'no_session')) return 'retry';
    if (status === 400 || status === 404 || status === 422) return 'done';
    return 'retry';
  }

  function attempt(key, e, t) {
    e.busy = true;
    e.tries++;
    stats.sent++;
    const idem = 'neon-' + key.slice(5) + '-' + e.tries;
    let p;
    try {
      p = o.transport(key, idem);
    } catch (err) {
      p = Promise.reject(err);
    }
    Promise.resolve(p).then((res) => {
      e.busy = false;
      if (res && res.claimed === false) {
        // günlük tavan doldu: tüketilmedi, ertesi gün
        e.next = now() + BACKOFF[BACKOFF.length - 1];
        stats.retried++;
        return;
      }
      stats.ok++;
      onClaimed(key);
    }, (err) => {
      e.busy = false;
      const k = classify(err);
      if (k === 'done') {
        stats.ok++;
        onClaimed(key);
      } else if (k === 'stop') {
        stats.failed++;
        e.next = now() + 3600;
      } else {
        stats.retried++;
        e.next = now() + BACKOFF[Math.min(BACKOFF.length - 1, e.tries - 1)];
      }
    });
    void t;
  }

  function tick() {
    const city = typeof o.getCity === 'function' ? o.getCity() : null;
    if (!city) return 0;
    const keys = pendingClaims(city);
    // onaylı anahtarların durumunu temizle
    st.forEach((e, k) => { if (keys.indexOf(k) < 0) st.delete(k); });
    if (!enabled()) {
      stats.skipped += keys.length;
      return 0;
    }
    const t = now();
    let n = 0;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const e = entry(key);
      if (e.busy || t < e.next) continue;
      if (direct) {
        attempt(key, e, t);
        n++;
      } else if (typeof o.emit === 'function') {
        o.emit({ type: 'reward', key });
        e.tries++;
        e.next = t + REEMIT_SEC;
        stats.emitted++;
        n++;
      }
    }
    return n;
  }

  function onClaimed(key) {
    const city = typeof o.getCity === 'function' ? o.getCity() : null;
    const was = city ? markClaimed(city, key) : false;
    st.delete(key);
    return was;
  }

  return {
    tick,
    onClaimed,
    pending: () => pendingClaims(typeof o.getCity === 'function' ? o.getCity() : null),
    stats,
    nextAt: (key) => (st.has(key) ? st.get(key).next : -1),
    reset: () => st.clear(),
    direct,
  };
}
