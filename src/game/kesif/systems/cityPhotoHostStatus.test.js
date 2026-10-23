// @vitest-environment jsdom
/*
 * Faz 5 / mobile_bridge: foto kaydı köprüsü kesin durum bildirirse (detail.hostStatus) shooter indirmeye DÜŞMEZ ve doğru via'yı verir;
 * durum yoksa (eski uygulama) eski davranış: indirmeyi dener. Mevcut cityPhoto.test.js değişmeden geçer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_EVENT, HOST_VIA, createShooter } from './cityPhotoShot.js';

let click;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:photo');
  URL.revokeObjectURL = vi.fn();
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

const shot = () => ({
  ok: true, id: 1, blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }), bytes: 10, w: 4, h: 3, mime: 'image/jpeg', name: 'neon-meridyen-1.jpg', url: '',
});

/** işleyici: olayı iptal eder, result'a söz yazar, isteğe bağlı hostStatus koyar. */
function handle({ result, status, delay = 0 }) {
  const fn = (e) => {
    e.preventDefault();
    e.detail.result = new Promise((r) => { setTimeout(() => { if (status !== undefined) e.detail.hostStatus = status; r(result); }, delay); });
  };
  window.addEventListener(HOST_EVENT, fn);
  return () => window.removeEventListener(HOST_EVENT, fn);
}

describe('createShooter.save · köprü durumları', () => {
  it('HOST_VIA tablosu: her kesin durum bir via\'ya çevrilir', () => {
    expect(HOST_VIA).toEqual({
      permission_denied: 'izin', too_large: 'buyuk', cancelled: 'vazgec', busy: 'mesgul', failed: 'yok',
    });
  });

  it.each([
    ['permission_denied', 'izin'],
    ['too_large', 'buyuk'],
    ['cancelled', 'vazgec'],
    ['busy', 'mesgul'],
    ['failed', 'yok'],
  ])('köprü %s derse {ok:false, via:%s}; indirme denenmez', async (status, via) => {
    const off = handle({ result: false, status });
    const s = createShooter({ win: window });
    const r = await s.save(shot());
    off();
    expect(r).toEqual({ ok: false, via });
    expect(click).not.toHaveBeenCalled();
    expect(s.stats.saved).toBe(0);
    expect(s.stats.downloaded).toBe(0);
  });

  it('köprü başarılı: via uygulama, indirme yok', async () => {
    const off = handle({ result: true, status: 'saved' });
    const s = createShooter({ win: window });
    expect(await s.save(shot())).toEqual({ ok: true, via: 'uygulama' });
    off();
    expect(click).not.toHaveBeenCalled();
    expect(s.stats.host).toBe(1);
  });

  it('durumsuz ret (eski uygulama): eski davranış, indirmeye düşer', async () => {
    const off = handle({ result: false });
    const s = createShooter({ win: window });
    expect(await s.save(shot())).toEqual({ ok: true, via: 'indirme' });
    off();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('bilinmeyen durum dizesi ve boş durum indirmeye düşer (güvenli varsayılan)', async () => {
    for (const status of ['', 'gelecek_durum', 'saved']) {
      click.mockClear();
      const off = handle({ result: false, status });
      const s = createShooter({ win: window });
      const r = await s.save(shot());
      off();
      expect(r).toEqual({ ok: true, via: 'indirme' });
      expect(click).toHaveBeenCalledTimes(1);
    }
  });

  it('işleyen yoksa doğrudan indirme', async () => {
    const s = createShooter({ win: window });
    expect(await s.save(shot())).toEqual({ ok: true, via: 'indirme' });
  });

  it('gecikmeli köprü sonucu (izin penceresi gibi) beklenir; zaman aşımı yalnız çok uzun beklemede', async () => {
    const off = handle({ result: false, status: 'permission_denied', delay: 150 });
    const s = createShooter({ win: window });
    expect(await s.save(shot())).toEqual({ ok: false, via: 'izin' });
    off();
  });
});
