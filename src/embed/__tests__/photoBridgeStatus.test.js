/*
 * Faz 5 / mobile_bridge: native `photoSaved` artık yazılı durum (status) taşıyabilir; web bunu bekleme süresini uzatmak (working),
 * kesin başarısızlığı Türkçe iletiye çevirmek ve WebView'de işe yaramayan indirmeye düşmemek için kullanır. Eski uygulamalar (status yok)
 * eskisi gibi davranır. Mevcut photoBridge.test.js değişmeden geçer; burada yalnız eklenen davranış sınanır.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetBridgeForTests, onNativeMessage, parseIncoming, postToNative, receiveFromNative,
} from '../bridge.js';
import { PHOTO_FAIL_STATUSES, createPhotoSaver } from '../photoBridge.js';

afterEach(() => {
  __resetBridgeForTests();
});

const blobOf = (n) => new Blob([new Uint8Array(n).fill(7)], { type: 'image/jpeg' });
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/** reply(head, send) native davranışı: üstbilgi gelince send(...) ile yanıt(lar) verir. */
function harness(reply, opts = {}) {
  const sent = [];
  const win = {
    ReactNativeWebView: {
      postMessage: (j) => {
        const m = JSON.parse(j);
        sent.push(m);
        if (m.type === 'savePhotoPart' && reply) {
          const head = sent.find((x) => x.type === 'savePhoto');
          if (sent.filter((x) => x.type === 'savePhotoPart').length === head.parts) reply(head, (msg) => setTimeout(() => receiveFromNative({ type: 'photoSaved', id: head.id, ...msg }), 0));
        }
      },
    },
  };
  const post = (type, payload) => postToNative(type, payload, win);
  const saver = createPhotoSaver({
    post, onMessage: onNativeMessage, timeoutMs: 80, workTimeoutMs: 600, newId: () => 'idx1', ...opts,
  });
  return { saver, sent };
}

describe('photoSaved status şeması', () => {
  it('status isteğe bağlı: yoksa eski ileti geçerli; biçimli dizeler geçer; bozuk türler/biçimler reddedilir', () => {
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: true })).toMatchObject({ ok: true });
    for (const status of ['working', 'saved', 'permission_denied', 'too_large', 'cancelled', 'busy', 'failed', 'gelecek_durum']) {
      expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: status === 'saved', status })).toMatchObject({ status });
    }
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: false, status: 5 })).toBeNull();
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: false, status: 'BÜYÜK HARF' })).toBeNull();
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: false, status: 'x'.repeat(40) })).toBeNull();
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: false, status: '' })).toBeNull();
  });
});

describe('createPhotoSaver · status', () => {
  it('saved → {ok:true,status:saved}; save() hâlâ boolean', async () => {
    const h = harness((head, send) => send({ ok: true, status: 'saved' }));
    expect(await h.saver.saveDetailed({ blob: blobOf(3000), name: 'a.jpg' })).toEqual({ ok: true, status: 'saved' });
    const h2 = harness((head, send) => send({ ok: true, status: 'saved' }));
    expect(await h2.saver.save({ blob: blobOf(3000), name: 'a.jpg' })).toBe(true);
  });

  it.each(PHOTO_FAIL_STATUSES)('%s → {ok:false,status} aynen', async (status) => {
    const h = harness((head, send) => send({ ok: false, status }));
    expect(await h.saver.saveDetailed({ blob: blobOf(3000), name: 'a.jpg' })).toEqual({ ok: false, status });
  });

  it('bilinmeyen başarısızlık durumu failed sayılır; eski uygulama (status yok, ok:false) status undefined bırakır', async () => {
    const h = harness((head, send) => send({ ok: false, status: 'gelecek_durum' }));
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false, status: 'failed' });
    const old = harness((head, send) => send({ ok: false }));
    expect(await old.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false });
    const oldOk = harness((head, send) => send({ ok: true }));
    expect(await oldOk.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: true, status: 'saved' });
  });

  it('ok:true ile çelişen başarısızlık durumu başarı sayılmaz', async () => {
    const h = harness((head, send) => send({ ok: true, status: 'failed' }));
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false, status: 'failed' });
  });

  it('working ara bildirimi bekleme süresini uzatır (izin penceresi): zaman aşımı süresinden sonra gelen saved yine kabul edilir', async () => {
    const h = harness((head, send) => {
      send({ ok: false, status: 'working' });
      setTimeout(() => send({ ok: true, status: 'saved' }), 250); // timeoutMs (80) aşılır, workTimeoutMs (600) aşılmaz
    });
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: true, status: 'saved' });
  });

  it('working sonrası native hiç bitirmezse workTimeoutMs sonunda {ok:false} (durumsuz)', async () => {
    const h = harness((head, send) => send({ ok: false, status: 'working' }), { workTimeoutMs: 150 });
    const t0 = Date.now();
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(120);
  });

  it('yanıt hiç gelmezse (eski uygulama) kısa sürede {ok:false}', async () => {
    const h = harness(null);
    const t0 = Date.now();
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false });
    expect(Date.now() - t0).toBeLessThan(5000); // varsayılan 20 sn beklemez (timeoutMs: 80)
  });

  it('eski uygulama (photoSave bildirmeyen): işleyici yoksa kısa sürede pes eder; yeni uygulamada normal süre beklenir', async () => {
    const legacy = harness(null, { timeoutMs: 400, legacyAckMs: 60, isLegacy: () => true });
    let t0 = Date.now();
    expect(await legacy.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false });
    const legacyMs = Date.now() - t0;
    const modern = harness(null, { timeoutMs: 400, legacyAckMs: 60, isLegacy: () => false });
    t0 = Date.now();
    expect(await modern.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false });
    expect(Date.now() - t0).toBeGreaterThan(legacyMs); // yük altında mutlak süre değil, göreli karşılaştırma
    expect(Date.now() - t0).toBeGreaterThanOrEqual(350);
  });

  it('başka kimliğin yanıtı yok sayılır', async () => {
    const h = harness((head, send) => {
      setTimeout(() => receiveFromNative({ type: 'photoSaved', id: 'baska', ok: true, status: 'saved' }), 0);
      setTimeout(() => send({ ok: false, status: 'permission_denied' }), 20);
    });
    expect(await h.saver.saveDetailed({ blob: blobOf(300), name: 'a.jpg' })).toEqual({ ok: false, status: 'permission_denied' });
  });

  it('sınırı aşan fotoğraf yerelde too_large (native\'e hiçbir şey gönderilmez)', async () => {
    const h = harness((head, send) => send({ ok: true, status: 'saved' }));
    const big = { arrayBuffer: async () => new ArrayBuffer(2500001) };
    expect(await h.saver.saveDetailed({ blob: big, name: 'a.jpg' })).toEqual({ ok: false, status: 'too_large' });
    expect(h.sent).toEqual([]);
  });

  it('boş/bozuk girdi ve köprü yok: durumsuz {ok:false}', async () => {
    const h = harness(null);
    expect(await h.saver.saveDetailed(null)).toEqual({ ok: false });
    expect(await h.saver.saveDetailed({ blob: new Blob([]), name: 'a.jpg' })).toEqual({ ok: false });
    const noNative = createPhotoSaver({ post: () => false, onMessage: onNativeMessage, timeoutMs: 50 });
    expect(await noNative.saveDetailed({ blob: blobOf(100), name: 'a.jpg' })).toEqual({ ok: false });
  });

  it('handler: detail.result boolean, detail.hostStatus söz çözülmeden ÖNCE yazılır', async () => {
    const h = harness((head, send) => send({ ok: false, status: 'too_large' }));
    const ev = { preventDefault() {}, detail: { blob: blobOf(300), name: 'a.jpg', hostStatus: '' } };
    h.saver.handler(ev, true);
    expect(await ev.detail.result).toBe(false);
    expect(ev.detail.hostStatus).toBe('too_large');
    await sleep(0);
    const ok = harness((head, send) => send({ ok: true, status: 'saved' }));
    const ev2 = { preventDefault() {}, detail: { blob: blobOf(300), name: 'a.jpg' } };
    ok.saver.handler(ev2, true);
    expect(await ev2.detail.result).toBe(true);
    expect(ev2.detail.hostStatus).toBe('saved');
  });
});
