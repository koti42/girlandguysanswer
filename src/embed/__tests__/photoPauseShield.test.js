// @vitest-environment jsdom
/*
 * Faz 5 / mobile_bridge: foto kaydı sürerken sistem pencereleri (izin, klasör seçici, paylaşım menüsü) pencere blur / visibilitychange
 * olayı yollar → motor otomatik duraklatır, foto modu kapanır. createPauseShield bu iki olayı yalnız kayıt SÜRERKEN yutar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBridgeForTests, onNativeMessage, postToNative, receiveFromNative,
} from '../bridge.js';
import { createPauseShield, createPhotoSaver } from '../photoBridge.js';

afterEach(() => {
  __resetBridgeForTests();
  vi.restoreAllMocks();
});

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
const blobOf = (n) => new Blob([new Uint8Array(n).fill(7)], { type: 'image/jpeg' });
const fire = (target, type) => target.dispatchEvent(new Event(type, { bubbles: type === 'visibilitychange' }));

/** motorun otomatik duraklatma dinleyicileri (game.js onVis/onBlur ile aynı yerler: window blur, document visibilitychange). */
function engineListeners() {
  const blur = vi.fn();
  const vis = vi.fn();
  window.addEventListener('blur', blur);
  document.addEventListener('visibilitychange', vis);
  return {
    blur, vis, dispose: () => { window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', vis); },
  };
}

describe('createPauseShield', () => {
  it('kapalıyken olaylar motora ulaşır; açıkken pencere blur ve visibilitychange yutulur; kapanınca (artçıdan sonra) yeniden ulaşır', async () => {
    const shield = createPauseShield(window, 20); // motor dinleyicilerinden ÖNCE kurulur (EmbedKesif'te de böyle)
    const eng = engineListeners();
    fire(window, 'blur');
    fire(document, 'visibilitychange');
    expect(eng.blur).toHaveBeenCalledTimes(1);
    expect(eng.vis).toHaveBeenCalledTimes(1);

    shield.on();
    fire(window, 'blur');
    fire(document, 'visibilitychange');
    expect(eng.blur).toHaveBeenCalledTimes(1);
    expect(eng.vis).toHaveBeenCalledTimes(1);

    shield.off();
    fire(window, 'blur'); // artçı süresi içinde hâlâ yutulur
    expect(eng.blur).toHaveBeenCalledTimes(1);
    await sleep(40);
    fire(window, 'blur');
    fire(document, 'visibilitychange');
    expect(eng.blur).toHaveBeenCalledTimes(2);
    expect(eng.vis).toHaveBeenCalledTimes(2);
    expect(shield._active()).toBe(0);
    eng.dispose();
    shield.dispose();
  });

  it('öğe düzeyindeki blur (odak tuzağı, giriş kutuları) yutulmaz', () => {
    const shield = createPauseShield(window, 5);
    const btn = document.createElement('button');
    document.body.appendChild(btn);
    const onBlur = vi.fn();
    btn.addEventListener('blur', onBlur);
    shield.on();
    btn.dispatchEvent(new Event('blur'));
    expect(onBlur).toHaveBeenCalledTimes(1);
    shield.off();
    shield.dispose();
    btn.remove();
  });

  it('iç içe on/off sayaçlıdır; fazladan off zararsız; win yoksa etkisiz', async () => {
    const shield = createPauseShield(window, 5);
    const eng = engineListeners();
    shield.on();
    shield.on();
    shield.off();
    expect(shield._active()).toBe(1);
    fire(window, 'blur');
    expect(eng.blur).not.toHaveBeenCalled();
    shield.off();
    shield.off();
    expect(shield._active()).toBe(0);
    await sleep(20);
    fire(window, 'blur');
    expect(eng.blur).toHaveBeenCalledTimes(1);
    expect(() => { const s = createPauseShield(null); s.on(); s.off(); s.dispose(); }).not.toThrow();
    eng.dispose();
    shield.dispose();
  });
});

describe('createPhotoSaver + kalkan', () => {
  function harness(replyFn) {
    const sent = [];
    const win = {
      ReactNativeWebView: {
        postMessage: (j) => {
          const m = JSON.parse(j);
          sent.push(m);
          const head = sent.find((x) => x.type === 'savePhoto');
          if (m.type === 'savePhotoPart' && sent.filter((x) => x.type === 'savePhotoPart').length === head.parts) replyFn(head);
        },
      },
    };
    const shield = createPauseShield(window, 5);
    const saver = createPhotoSaver({
      post: (type, payload) => postToNative(type, payload, win), onMessage: onNativeMessage, timeoutMs: 200, workTimeoutMs: 600, newId: () => 'sh1', shield,
    });
    return { saver, shield };
  }

  it('kayıt boyunca blur motora ulaşmaz (izin penceresi senaryosu); bitince kalkan iner', async () => {
    const h = harness((head) => {
      setTimeout(() => receiveFromNative({ type: 'photoSaved', id: head.id, ok: false, status: 'working' }), 0);
      setTimeout(() => fire(window, 'blur'), 10); // sistem izin penceresi odağı alır
      setTimeout(() => fire(document, 'visibilitychange'), 15);
      setTimeout(() => receiveFromNative({ type: 'photoSaved', id: head.id, ok: true, status: 'saved' }), 60);
    });
    const eng = engineListeners(); // kalkan (harness içinde) zaten kurulu: motor sonradan dinler
    const p = h.saver.saveDetailed({ blob: blobOf(500), name: 'a.jpg' });
    await sleep(5);
    expect(h.shield._active()).toBe(1);
    expect(await p).toEqual({ ok: true, status: 'saved' });
    expect(eng.blur).not.toHaveBeenCalled();
    expect(eng.vis).not.toHaveBeenCalled();
    expect(h.shield._active()).toBe(0);
    await sleep(30);
    fire(window, 'blur');
    expect(eng.blur).toHaveBeenCalledTimes(1);
    eng.dispose();
    h.shield.dispose();
  });

  it('başarısızlıkta ve zaman aşımında da kalkan iner (takılı kalmaz)', async () => {
    const h1 = harness((head) => setTimeout(() => receiveFromNative({ type: 'photoSaved', id: head.id, ok: false, status: 'permission_denied' }), 0));
    expect(await h1.saver.saveDetailed({ blob: blobOf(500), name: 'a.jpg' })).toEqual({ ok: false, status: 'permission_denied' });
    expect(h1.shield._active()).toBe(0);
    const h2 = harness(() => {});
    expect(await h2.saver.saveDetailed({ blob: blobOf(500), name: 'a.jpg' })).toEqual({ ok: false });
    expect(h2.shield._active()).toBe(0);
    const h3 = createPhotoSaver({ post: () => false, onMessage: onNativeMessage, timeoutMs: 50, shield: createPauseShield(window, 5) });
    expect(await h3.saveDetailed({ blob: blobOf(100), name: 'a.jpg' })).toEqual({ ok: false });
    expect(await h3.saveDetailed({ blob: null })).toEqual({ ok: false });
  });
});
