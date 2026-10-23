/*
 * KEŞİF render — chunk işçi havuzu (ana thread tarafı). three/DOM'a bağımlı değildir; yalnız Worker kullanır.
 *
 *   workersSupported() → Worker + modül worker var mı
 *   createWorkerPool({count, init, perWorker, onMessage, onLost, onReady}) → pool
 *     pool.ready            (en az bir işçi hazır)
 *     pool.size / pool.alive
 *     pool.freeSlots()      şimdi kabul edilebilecek iş sayısı
 *     pool.post(msg, transfer) → boolean (işçiye atar; yer yoksa false). msg.id zorunlu (kayıp takibi için).
 *     pool.decorate         tüm hazır işçilerin kanca durumu birleşimi (hepsi true ise true)
 *     pool.broadcast(msg)   hazır tüm işçilere (setAtlas / setMeshOpts)
 *     pool.dispose()
 *     pool.attach({onMessage,onLost,onReady})   işleyicileri (yeniden) bağlar: havuz boyut geçişinde başka bir ChunkManager'a devredilir
 *     pool.detach()                             işleyicileri bırakır (devredilirken uçuştaki işlerin sonuçları sessizce atılır)
 *     pool.reinit(initMsg)                      hazır tüm işçilere yeni 'init' (tohum/üretici/sınır/epoch) gönderir; işçiler yeniden başlatılmaz
 *   nextJobSeq()  süreç genelinde artan iş kimliği: iki ChunkManager'ın iş kimlikleri asla çakışmaz (devredilen havuzda bayat yanıt yanlış işe eşleşmez)
 *
 * İşçi hata verirse ya da hazır olma süresi (8 sn) dolarsa ölü sayılır; uçuştaki işlerin kimlikleri onLost(ids) ile bildirilir
 * (yönetici bunları ana thread yoluna alır). Tüm işçiler ölürse onLost(ids, true) çağrılır.
 */

export function workersSupported() {
  try {
    return typeof Worker !== 'undefined' && typeof URL !== 'undefined';
  } catch {
    return false;
  }
}

const READY_TIMEOUT_MS = 8000;

let JOB_SEQ = 0;
/** Süreç genelinde benzersiz, artan iş kimliği (epoch ile birlikte bayat yanıtı ayıklar). */
export function nextJobSeq() {
  JOB_SEQ = (JOB_SEQ + 1) % 2147483000;
  return JOB_SEQ;
}

function spawn() {
  // Vite bu kalıbı (new Worker(new URL('./worker.js', import.meta.url), {type:'module'})) paketler.
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

export function createWorkerPool(opts) {
  const o = opts || {};
  const count = Math.max(1, Math.min(4, o.count | 0 || 1));
  const perWorker = Math.max(1, o.perWorker | 0 || 2);
  const slots = [];
  let disposed = false;
  const handlers = { onMessage: o.onMessage, onLost: o.onLost, onReady: o.onReady };

  function aliveCount() {
    let n = 0;
    for (let i = 0; i < slots.length; i++) if (!slots[i].dead) n++;
    return n;
  }

  function kill(s, why) {
    if (s.dead) return;
    s.dead = true;
    if (s.timer) clearTimeout(s.timer);
    try {
      s.w.terminate();
    } catch {
      /* yok say */
    }
    const ids = Array.from(s.jobs);
    s.jobs.clear();
    if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] chunk işçisi durdu:', why);
    if (!disposed && typeof handlers.onLost === 'function') handlers.onLost(ids, aliveCount() === 0);
  }

  for (let i = 0; i < count; i++) {
    let w = null;
    try {
      w = spawn();
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] işçi başlatılamadı:', e && e.message);
      break;
    }
    const s = { w, ready: false, dead: false, decorate: false, jobs: new Set(), timer: 0 };
    s.timer = setTimeout(() => {
      if (!s.ready) kill(s, 'hazır olma zaman aşımı');
    }, READY_TIMEOUT_MS);
    w.onmessage = (ev) => {
      const m = ev.data;
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'ready') {
        s.ready = true;
        s.decorate = !!m.decorate;
        if (s.timer) clearTimeout(s.timer);
        if (typeof handlers.onReady === 'function') handlers.onReady(s.decorate);
        return;
      }
      if (m.t === 'log') {
        if (typeof console !== 'undefined' && console.warn) console.warn('[kesif] işçi:', m.message);
        return;
      }
      if (m.id !== undefined) s.jobs.delete(m.id);
      if (typeof handlers.onMessage === 'function') handlers.onMessage(m);
    };
    w.onerror = (ev) => {
      if (ev && ev.preventDefault) ev.preventDefault();
      kill(s, ev && ev.message ? ev.message : 'bilinmeyen hata');
    };
    w.onmessageerror = () => kill(s, 'mesaj hatası');
    slots.push(s);
    try {
      w.postMessage(o.init);
    } catch (e) {
      kill(s, e && e.message);
    }
  }

  return {
    get size() {
      return slots.length;
    },
    get alive() {
      return aliveCount();
    },
    get ready() {
      for (let i = 0; i < slots.length; i++) if (slots[i].ready && !slots[i].dead) return true;
      return false;
    },
    /** Hazır tüm işçilerde kanca (decorate) etkinse true. */
    get decorate() {
      let any = false;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.dead || !s.ready) continue;
        any = true;
        if (!s.decorate) return false;
      }
      return any;
    },
    freeSlots() {
      let n = 0;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.ready && !s.dead) n += Math.max(0, perWorker - s.jobs.size);
      }
      return n;
    },
    post(msg, transfer) {
      let best = null;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s.ready || s.dead || s.jobs.size >= perWorker) continue;
        if (!best || s.jobs.size < best.jobs.size) best = s;
      }
      if (!best) return false;
      try {
        best.w.postMessage(msg, transfer || []);
      } catch (e) {
        kill(best, e && e.message);
        return false;
      }
      best.jobs.add(msg.id);
      return true;
    },
    broadcast(msg) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.ready && !s.dead) {
          try {
            s.w.postMessage(msg);
          } catch {
            /* yok say */
          }
        }
      }
    },
    attach(h) {
      const n = h || {};
      handlers.onMessage = n.onMessage;
      handlers.onLost = n.onLost;
      handlers.onReady = n.onReady;
    },
    detach() {
      handlers.onMessage = null;
      handlers.onLost = null;
      handlers.onReady = null;
    },
    /** Hazır tüm işçilere yeni init: iş kuyruğundaki sıraya girer (öncekiler eski bağlamla biter, yanıtları epoch ile atılır). */
    reinit(msg) {
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.dead) continue;
        try {
          s.w.postMessage(msg);
        } catch (e) {
          kill(s, e && e.message);
        }
      }
    },
    get isReadyNow() {
      return aliveCount() > 0;
    },
    dispose() {
      disposed = true;
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (s.timer) clearTimeout(s.timer);
        s.dead = true;
        try {
          s.w.postMessage({ t: 'dispose' });
          s.w.terminate();
        } catch {
          /* yok say */
        }
      }
      slots.length = 0;
    },
  };
}
