import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PHOTO_MAX_BYTES, PHOTO_MAX_PARTS, PHOTO_PART_CHARS, __resetBridgeForTests, onNativeMessage, parseIncoming, postToNative, receiveFromNative, validateOutgoing,
} from '../bridge.js';
import { PHOTO_PART_BYTES, createPhotoSaver, planPhotoMessages } from '../photoBridge.js';

afterEach(() => {
  __resetBridgeForTests();
});

const jpegLike = (n) => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 31 + 7) & 255;
  return u;
};
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe('savePhoto köprü şeması', () => {
  it('geçerli üstbilgi/parça kabul; bozuk alanlar reddedilir (bilinmeyen tip, büyük boyut, kötü kimlik/ad/base64)', () => {
    const head = { type: 'savePhoto', id: 'p1', name: 'neon-meridyen-20260101-000000.jpg', mime: 'image/jpeg', bytes: 5000, parts: 3 };
    expect(validateOutgoing(head)).toBe(true);
    expect(validateOutgoing({ ...head, name: 'x.png' })).toBe(false);
    expect(validateOutgoing({ ...head, name: '../x.jpg' })).toBe(false);
    expect(validateOutgoing({ ...head, mime: 'image/png' })).toBe(false);
    expect(validateOutgoing({ ...head, bytes: 0 })).toBe(false);
    expect(validateOutgoing({ ...head, bytes: PHOTO_MAX_BYTES + 1 })).toBe(false);
    expect(validateOutgoing({ ...head, parts: PHOTO_MAX_PARTS + 1 })).toBe(false);
    expect(validateOutgoing({ ...head, parts: 1.5 })).toBe(false);
    expect(validateOutgoing({ ...head, id: 'a b' })).toBe(false);
    expect(validateOutgoing({ ...head, id: '' })).toBe(false);
    const part = { type: 'savePhotoPart', id: 'p1', index: 0, data: 'QUJDRA==' };
    expect(validateOutgoing(part)).toBe(true);
    expect(validateOutgoing({ ...part, data: 'A'.repeat(PHOTO_PART_CHARS + 4) })).toBe(false);
    expect(validateOutgoing({ ...part, data: 'bad data!' })).toBe(false);
    expect(validateOutgoing({ ...part, data: '' })).toBe(false);
    expect(validateOutgoing({ ...part, index: -1 })).toBe(false);
    expect(validateOutgoing({ ...part, index: PHOTO_MAX_PARTS })).toBe(false);
    expect(validateOutgoing({ type: 'savePhotoPart', id: 'p1', index: 0 })).toBe(false);
  });

  it('native → web photoSaved: kimlik + ok zorunlu; bozuk yok sayılır', () => {
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: true })).toEqual({ type: 'photoSaved', id: 'p1', ok: true });
    expect(parseIncoming('{"type":"photoSaved","id":"p1","ok":false}')).toMatchObject({ ok: false });
    expect(parseIncoming({ type: 'photoSaved', id: 'p 1', ok: true })).toBeNull();
    expect(parseIncoming({ type: 'photoSaved', id: 'p1' })).toBeNull();
    expect(parseIncoming({ type: 'photoSaved', id: 'p1', ok: 'evet' })).toBeNull();
  });

  it('postToNative: parça 4096 karakter sınırına sığar (üstbilgi + 3000 karakterlik parça)', () => {
    const sent = [];
    const win = { ReactNativeWebView: { postMessage: (j) => sent.push(j) } };
    const plan = planPhotoMessages('p9', 'a.jpg', jpegLike(5000));
    plan.forEach((m) => {
      const { type, ...payload } = m;
      expect(postToNative(type, payload, win)).toBe(true);
    });
    expect(sent.length).toBe(plan.length);
    sent.forEach((j) => expect(j.length).toBeLessThanOrEqual(4096));
    expect(postToNative('savePhoto', { id: 'x' }, win)).toBe(false);
    expect(postToNative('savePhotoPart', { id: 'p9', index: 0, data: 'QUJD' }, {})).toBe(false); // native yok
  });
});

describe('planPhotoMessages', () => {
  it('üstbilgi + sıralı parçalar; parçalar birleşince özgün baytlar (bayt-bayt)', () => {
    const bytes = jpegLike(PHOTO_PART_BYTES * 2 + 123);
    const plan = planPhotoMessages('abc', 'neon-meridyen-1.jpg', bytes);
    expect(plan[0]).toEqual({ type: 'savePhoto', id: 'abc', name: 'neon-meridyen-1.jpg', mime: 'image/jpeg', bytes: bytes.length, parts: 3 });
    expect(plan.length).toBe(4);
    plan.slice(1).forEach((m, i) => {
      expect(m.type).toBe('savePhotoPart');
      expect(m.index).toBe(i);
      expect(m.data.length).toBeLessThanOrEqual(PHOTO_PART_CHARS);
      expect(validateOutgoing(m)).toBe(true);
    });
    expect(validateOutgoing(plan[0])).toBe(true);
    const joined = new Uint8Array(bytes.length);
    let o = 0;
    plan.slice(1).forEach((m) => {
      const u = unb64(m.data);
      joined.set(u, o);
      o += u.length;
    });
    expect(o).toBe(bytes.length);
    expect(joined).toEqual(bytes);
  });

  it('tek bayt, tam sınır ve sınır aşımı', () => {
    expect(planPhotoMessages('a', 'a.jpg', jpegLike(1)).length).toBe(2);
    expect(planPhotoMessages('a', 'a.jpg', jpegLike(PHOTO_PART_BYTES)).length).toBe(2);
    expect(planPhotoMessages('a', 'a.jpg', jpegLike(PHOTO_PART_BYTES + 1)).length).toBe(3);
    expect(planPhotoMessages('a', 'a.jpg', new Uint8Array(0))).toBeNull();
    expect(planPhotoMessages('a', 'a.jpg', null)).toBeNull();
    expect(planPhotoMessages('a', 'a.jpg', { length: PHOTO_MAX_BYTES + 1 })).toBeNull();
  });
});

describe('createPhotoSaver', () => {
  const blobOf = (n) => new Blob([jpegLike(n)], { type: 'image/jpeg' });

  /** native: tüm parçalar gelince photoSaved{ok: reply} yollar (reply undefined → hiç yanıt yok). */
  function harness(reply) {
    const sent = [];
    const win = {
      ReactNativeWebView: {
        postMessage: (j) => {
          const m = JSON.parse(j);
          sent.push(m);
          const head = sent.find((x) => x.type === 'savePhoto');
          if (reply !== undefined && m.type === 'savePhotoPart' && head && sent.filter((x) => x.type === 'savePhotoPart').length === head.parts) {
            setTimeout(() => receiveFromNative({ type: 'photoSaved', id: head.id, ok: reply }), 0);
          }
        },
      },
    };
    const post = (type, payload) => postToNative(type, payload, win);
    const saver = createPhotoSaver({ post, onMessage: onNativeMessage, timeoutMs: 80, newId: () => 'idx1' });
    return { saver, sent };
  }

  it('native başarılı yanıt verince true; üstbilgi + tüm parçalar sırayla gönderildi', async () => {
    const { saver, sent } = harness(true);
    const ok = await saver.save({ blob: blobOf(6000), name: 'neon-meridyen-20260101-000000.jpg' });
    expect(ok).toBe(true);
    expect(sent[0]).toMatchObject({ type: 'savePhoto', id: 'idx1', bytes: 6000, parts: 3 });
    expect(sent.slice(1).map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it('native reddederse false; yanıt gelmezse zaman aşımıyla false; köprü yoksa false; bozuk girdi false', async () => {
    const h1 = harness(false);
    expect(await h1.saver.save({ blob: blobOf(3000), name: 'a.jpg' })).toBe(false);
    const h2 = harness();
    expect(await h2.saver.save({ blob: blobOf(3000), name: 'a.jpg' })).toBe(false); // yanıt yok → zaman aşımı
    const noNative = createPhotoSaver({ post: () => false, onMessage: onNativeMessage, timeoutMs: 50 });
    expect(await noNative.save({ blob: blobOf(100), name: 'a.jpg' })).toBe(false);
    expect(await h2.saver.save(null)).toBe(false);
    expect(await h2.saver.save({ blob: {}, name: 'a.jpg' })).toBe(false);
    expect(await h2.saver.save({ blob: new Blob([]), name: 'a.jpg' })).toBe(false);
  });

  it('handler: native varsa olayı iptal eder ve detail.result sözü yazar; yoksa dokunmaz (motor indirmeye döner)', async () => {
    const h = harness();
    const ev = { preventDefault: vi.fn(), detail: { blob: blobOf(100), name: 'a.jpg' } };
    h.saver.handler(ev, false);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(ev.detail.result).toBeUndefined();
    const ev2 = { preventDefault: vi.fn(), detail: { blob: blobOf(100), name: 'a.jpg' } };
    h.saver.handler(ev2, true);
    expect(ev2.preventDefault).toHaveBeenCalledTimes(1);
    expect(typeof ev2.detail.result.then).toBe('function');
    expect(await ev2.detail.result).toBe(false); // yanıt yok
    expect(() => h.saver.handler(null, true)).not.toThrow();
    expect(() => h.saver.handler({}, true)).not.toThrow();
  });
});
