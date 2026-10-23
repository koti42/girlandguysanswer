// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armLateClickGuard, LATE_MS, LATE_RADIUS } from '../lateClick.js';

/* final_gate regresyonu: "İn" (araçtan in) dokunuşu sonrası gecikmeli click yürüme çubuğundaki Duraklat'a düşüp oyunu duraklatıyordu.
 * jsdom'da MouseEvent.isTrusted salt okunur (hep false): tarayıcı click'ini taklit etmek için sahte pencere + düz olay nesneleri kullanılır. */

function fakeWin() {
  const ls = [];
  return {
    addEventListener: (t, f) => { if (t === 'click') ls.push(f); },
    removeEventListener: (t, f) => { const i = ls.indexOf(f); if (i >= 0) ls.splice(i, 1); },
    count: () => ls.length,
    /** tarayıcının dokunuştan ürettiği click: güvenilir, detail 1 */
    fire(target, x, y, over) {
      const e = {
        target, clientX: x, clientY: y, detail: 1, isTrusted: true, swallowed: false,
        preventDefault() { this.swallowed = true; },
        stopPropagation() { this.swallowed = true; },
        stopImmediatePropagation() { this.swallowed = true; },
        ...(over || {}),
      };
      ls.slice().forEach((f) => f(e));
      return e;
    },
  };
}

function setup() {
  const exitBtn = document.createElement('button');
  const pauseBtn = document.createElement('button');
  document.body.append(exitBtn, pauseBtn);
  return { exitBtn, pauseBtn, win: fakeWin() };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('armLateClickGuard', () => {
  it('basılan öğe sökülünce yakın noktadaki ilk tıklamayı yutar (Duraklat tetiklenmez)', () => {
    const { exitBtn, pauseBtn, win } = setup();
    armLateClickGuard(exitBtn, 492, 32, { win });
    exitBtn.remove(); // arayüz değişti
    expect(win.fire(pauseBtn, 492, 32).swallowed).toBe(true);
    // yalnız BİR tıklama yutulur: sonraki gerçek dokunuş çalışır
    expect(win.count()).toBe(0);
    expect(win.fire(pauseBtn, 492, 32).swallowed).toBe(false);
  });

  it('öğe yerindeyse kendi tıklamasını yutmaz ve süzgeci bırakır', () => {
    const { exitBtn, pauseBtn, win } = setup();
    armLateClickGuard(exitBtn, 10, 10, { win });
    expect(win.fire(exitBtn, 10, 10).swallowed).toBe(false);
    expect(win.count()).toBe(0);
    expect(win.fire(pauseBtn, 10, 10).swallowed).toBe(false);
  });

  it('uzak (> yarıçap) tıklamaya dokunmaz; süre dolunca da yutmaz', () => {
    vi.useFakeTimers();
    const { exitBtn, pauseBtn, win } = setup();
    armLateClickGuard(exitBtn, 100, 100, { win });
    exitBtn.remove();
    expect(win.fire(pauseBtn, 100 + LATE_RADIUS + 5, 100).swallowed).toBe(false);
    expect(win.count()).toBe(1); // süzgeç hâlâ canlı
    vi.advanceTimersByTime(LATE_MS + 200);
    expect(win.count()).toBe(0);
    expect(win.fire(pauseBtn, 100, 100).swallowed).toBe(false);
  });

  it('yazılımla üretilen (güvenilmez) ve klavye/ekran okuyucu (detail 0) tıklamalarını yutmaz', () => {
    const { exitBtn, pauseBtn, win } = setup();
    armLateClickGuard(exitBtn, 0, 0, { win });
    exitBtn.remove();
    expect(win.fire(pauseBtn, 0, 0, { isTrusted: false }).swallowed).toBe(false);
    expect(win.fire(pauseBtn, 0, 0, { detail: 0 }).swallowed).toBe(false);
    expect(win.fire(pauseBtn, 0, 0).swallowed).toBe(true); // gerçek gecikmeli tıklama hâlâ yutulur
  });

  it('zaman penceresi (gecikmiş tıklama) dışında yutmaz', () => {
    let t = 1000;
    const { exitBtn, pauseBtn, win } = setup();
    armLateClickGuard(exitBtn, 5, 5, { win, now: () => t });
    exitBtn.remove();
    t += LATE_MS + 50;
    expect(win.fire(pauseBtn, 5, 5).swallowed).toBe(false);
    expect(win.count()).toBe(0);
  });

  it('süzgeç iptal edilebilir ve geçersiz girdide hiçbir şey kurmaz', () => {
    const { exitBtn, pauseBtn, win } = setup();
    const off = armLateClickGuard(exitBtn, 5, 5, { win });
    off();
    exitBtn.remove();
    expect(win.fire(pauseBtn, 5, 5).swallowed).toBe(false);
    const w2 = fakeWin();
    expect(typeof armLateClickGuard(null, NaN, 3, { win: w2 })).toBe('function');
    expect(w2.count()).toBe(0);
  });
});
