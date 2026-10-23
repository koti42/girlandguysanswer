// @vitest-environment jsdom
/*
 * Neon Meridyen foto modu arayüzü (photo_map): PhotoOverlay — sahte motor cephesi üzerinde. Sekmeler, kaydırıcılar, seçenekler (role=radio), sürükleme/kıstırma/tekerlek/klavye,
 * çekim akışı (ön izleme, Kaydet/Sil), erişilebilirlik (aria, 44 px CSS), hareket azaltma.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import PhotoOverlay from '../city/PhotoOverlay.jsx';
import { PHOTO_FILTERS, PHOTO_FRAMES, PHOTO_LIMITS, PHOTO_RAINS, PHOTO_TIMES, defaultPhotoSettings, sanitizePhotoPatch } from '../../../../game/kesif/sim/city/map/photoMath.js';

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../city/photo.css'), 'utf8');

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom 2B bağlam yok: çerçeve önizlemesi sessizce atlanır
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function fakeApi(over) {
  const st = {
    open: true,
    settings: defaultPhotoSettings(),
    shot: null,
    album: {
      taken: 2, count: 1, total: 8, done: false, assignment: '', subjects: [
        { id: 'terminal', name: 'Boyut Terminali', hint: 'Işıklı bir Boyut Terminalini kadraja al.', done: true },
        { id: 'tepe', name: 'Tepe Terası', hint: 'Terası çek.', done: false },
      ],
    },
  };
  const calls = [];
  const api = {
    calls,
    st,
    getPhotoState: () => ({
      open: st.open,
      canOpen: { ok: true, reason: 'acik', message: '' },
      settings: st.settings,
      view: { yaw: 0, pitch: 0, dist: 5, blocked: false },
      limits: PHOTO_LIMITS,
      filters: PHOTO_FILTERS,
      frames: PHOTO_FRAMES,
      times: PHOTO_TIMES,
      rains: PHOTO_RAINS,
      shot: st.shot,
      canShare: !!st.canShare,
      busy: false,
      saving: false,
      lastSave: null,
      reduced: false,
      album: st.album,
      version: 1,
    }),
    photoSet(p) { calls.push(['set', p]); st.settings = sanitizePhotoPatch(st.settings, p); return api.getPhotoState(); },
    photoOrbit(a, b) { calls.push(['orbit', a, b]); return true; },
    photoZoom(d) { calls.push(['zoom', d]); return 5; },
    photoCapture: vi.fn(async () => {
      calls.push(['capture']);
      st.shot = {
        id: 1, w: 1280, h: 720, bytes: 91234, name: 'neon-meridyen-20260101-000000.jpg', url: 'blob:x', subjects: ['Boyut Terminali'], kredi: 8, counted: true,
      };
      return { ok: true, bytes: 91234, subjects: ['Boyut Terminali'], kredi: 8 };
    }),
    photoSave: vi.fn(async () => { calls.push(['save']); return { ok: true, via: 'indirme' }; }),
    photoShare: vi.fn(async () => { calls.push(['share']); return { ok: true, via: 'paylasim', message: 'Fotoğraf paylaşıldı.' }; }),
    photoDiscard() { calls.push(['discard']); st.shot = null; return true; },
    photoClose() { calls.push(['close']); st.open = false; return { ok: true }; },
  };
  return Object.assign(api, over || null);
}

const flush = async () => { await act(async () => { await Promise.resolve(); }); };

describe('PhotoOverlay: yapı ve erişilebilirlik', () => {
  it('durum yokken «hazırlanıyor»; durum gelince katman, deklanşör, panel ve sekmeler çizilir', () => {
    const { container } = render(<PhotoOverlay api={{ getPhotoState: () => null }} onClose={() => {}} />);
    expect(screen.getByRole('status').textContent).toMatch(/hazırlanıyor/);
    cleanup();
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    expect(screen.getByTestId('photo-overlay')).toBeTruthy();
    expect(screen.getByTestId('photo-layer').getAttribute('aria-label')).toMatch(/Enter fotoğraf çeker/);
    expect(screen.getByTestId('photo-layer').getAttribute('tabindex')).toBe('0');
    expect(screen.getByLabelText('Fotoğraf çek')).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Kamera', 'Işık', 'Stil', 'Albüm']);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true').length).toBe(1);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('kph-tab-kamera');
    expect(container).toBeTruthy();
  });

  it('CSS: ≥ 44 px hedefler, odak halkası, HUD gizleme, hareket azaltma', () => {
    expect(/\.kph-btn\s*\{[^}]*min-height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kph-chip\s*\{[^}]*min-height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kph-tab\s*\{[^}]*min-height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kph-range\s*\{[^}]*height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kph-switch\s*\{[^}]*min-height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kph-shutter\s*\{[^}]*width:\s*76px/s.test(CSS)).toBe(true);
    expect(CSS).toMatch(/\.kx-root\[data-ui='photo'\]\s*\{\s*visibility:\s*hidden/);
    expect(CSS).toMatch(/outline:\s*3px solid/);
    expect(CSS).toMatch(/prefers-reduced-motion/);
    expect(CSS).toMatch(/\[data-calm='1'\] \.kph-flash \{ display: none/);
    expect(CSS).toMatch(/orientation: portrait/);
    expect(CSS).toMatch(/orientation: landscape/);
  });
});

describe('PhotoOverlay: ayarlar', () => {
  it('Kamera sekmesi: FOV/uzaklık/yükseklik kaydırıcıları ve anahtarlar api.photoSet çağırır', () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    const fov = screen.getByLabelText('Görüş açısı');
    fireEvent.change(fov, { target: { value: '45' } });
    expect(api.calls).toContainEqual(['set', { fov: 45 }]);
    expect(fov.getAttribute('min')).toBe('20');
    expect(fov.getAttribute('max')).toBe('90');
    expect(screen.getByLabelText('Uzaklık').getAttribute('max')).toBe('25');
    const sw = screen.getByRole('switch', { name: /Simülasyonu dondur/ });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(api.calls).toContainEqual(['set', { freeze: true }]);
    fireEvent.click(screen.getByRole('switch', { name: /Neon Meridyen/ }));
    expect(api.calls).toContainEqual(['set', { mark: false }]);
  });

  it('Işık sekmesi: pozlama/bloom/vinyet/gren + saat ve hava ön ayarları (radiogroup); dünyayı değiştirmediği notu', () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Işık' }));
    ['Pozlama', 'Neon parlaması', 'Vinyet', 'Film greni'].forEach((l) => expect(screen.getByLabelText(l)).toBeTruthy());
    const group = screen.getByRole('radiogroup', { name: /Saat/ });
    const gece = within(group).getByRole('radio', { name: /Gece/ });
    expect(gece.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(gece);
    expect(api.calls).toContainEqual(['set', { time: 'gece' }]);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: /Hava/ })).getByRole('radio', { name: /Yağmurlu/ }));
    expect(api.calls).toContainEqual(['set', { rain: 'yagmurlu' }]);
    expect(screen.getByText(/gerçek saati ve havası aynı kalır/)).toBeTruthy();
  });

  it('Stil sekmesi: 7 filtre + 5 çerçeve; seçili olan işaretlenir (renk + şekil + metin)', () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Stil' }));
    const f = screen.getByRole('radiogroup', { name: 'Filtre' });
    expect(within(f).getAllByRole('radio').length).toBe(7);
    expect(within(f).getByRole('radio', { name: /Filtre yok/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(f).getByRole('radio', { name: /Siyah Beyaz/ }));
    expect(api.calls).toContainEqual(['set', { filter: 'siyah_beyaz' }]);
    const fr = screen.getByRole('radiogroup', { name: 'Çerçeve' });
    expect(within(fr).getAllByRole('radio').length).toBe(5);
    fireEvent.click(within(fr).getByRole('radio', { name: /Sinema/ }));
    expect(api.calls).toContainEqual(['set', { frame: 'sinema' }]);
    expect(screen.getByLabelText('Filtre gücü')).toBeTruthy();
  });

  it('Albüm sekmesi: sayaç, konu listesi (✓/○ + metin), görev satırı', () => {
    const api = fakeApi();
    api.st.album.assignment = 'Irmak bir yer imi ister.';
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Albüm' }));
    const album = screen.getByTestId('photo-album');
    expect(album.textContent).toMatch(/1\/8/);
    expect(album.textContent).toMatch(/Görev: Irmak/);
    expect(within(album).getAllByRole('listitem').length).toBe(2);
    expect(album.textContent).toMatch(/Bulundu/);
    expect(album.textContent).toMatch(/Henüz yok/);
  });
});

describe('PhotoOverlay: kamera denetimi', () => {
  it('sürükleme yörünge, iki parmak yakınlaştırma, tekerlek yakınlaştırma', () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    const layer = screen.getByTestId('photo-layer');
    fireEvent.pointerDown(layer, { pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(layer, { pointerId: 1, clientX: 140, clientY: 90 });
    const o = api.calls.find((c) => c[0] === 'orbit');
    expect(o[1]).toBeCloseTo(40 * 0.006, 9);
    expect(o[2]).toBeCloseTo(-10 * 0.006, 9);
    fireEvent.pointerUp(layer, { pointerId: 1 });
    api.calls.length = 0;
    fireEvent.pointerDown(layer, { pointerId: 2, clientX: 100, clientY: 100 });
    fireEvent.pointerDown(layer, { pointerId: 3, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(layer, { pointerId: 3, clientX: 300, clientY: 100 });
    expect(api.calls.some((c) => c[0] === 'zoom' && c[1] < 0)).toBe(true); // açılan parmaklar → yaklaş
    expect(api.calls.some((c) => c[0] === 'orbit')).toBe(false);
    fireEvent.pointerCancel(layer, { pointerId: 2 });
    fireEvent.pointerCancel(layer, { pointerId: 3 });
    api.calls.length = 0;
    fireEvent.wheel(layer, { deltaY: 120 });
    expect(api.calls.some((c) => c[0] === 'zoom' && c[1] > 0)).toBe(true);
  });

  it('klavye: oklar, +/-, [ ], Enter; panel içindeyken yok sayılır (kaydırıcı okları bozulmaz)', async () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    const layer = screen.getByTestId('photo-layer');
    fireEvent.keyDown(layer, { key: 'ArrowLeft' });
    expect(api.calls.find((c) => c[0] === 'orbit')[1]).toBeCloseTo(0.06, 9);
    fireEvent.keyDown(layer, { key: '+' });
    expect(api.calls.some((c) => c[0] === 'zoom' && c[1] < 0)).toBe(true);
    fireEvent.keyDown(layer, { key: ']' });
    expect(api.calls).toContainEqual(['set', { fov: 65 }]);
    api.calls.length = 0;
    const fov = screen.getByLabelText('Görüş açısı');
    fireEvent.keyDown(fov, { key: 'ArrowLeft' });
    expect(api.calls.length).toBe(0);
    fireEvent.keyDown(layer, { key: 'Enter' });
    await flush();
    expect(api.photoCapture).toHaveBeenCalledTimes(1);
  });

  it('Kapat: photoClose + onClose; Paneli gizle panelı kaldırır', () => {
    const api = fakeApi();
    const onClose = vi.fn();
    render(<PhotoOverlay api={api} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('photo-toggle-panel'));
    expect(screen.queryByTestId('photo-dock')).toBeNull();
    expect(screen.getByTestId('photo-overlay').getAttribute('data-hidden')).toBe('1');
    fireEvent.click(screen.getByTestId('photo-toggle-panel'));
    expect(screen.getByTestId('photo-dock')).toBeTruthy();
    fireEvent.click(screen.getByTestId('photo-close'));
    expect(api.calls).toContainEqual(['close']);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('PhotoOverlay: çekim akışı', () => {
  it('Çek → ön izleme kartı (bayt, konu, Kredi) + aria-live duyuru; Kaydet ve Sil çalışır', async () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    expect(screen.queryByTestId('photo-shot')).toBeNull();
    fireEvent.click(screen.getByTestId('photo-shutter'));
    await flush();
    await flush();
    const card = screen.getByTestId('photo-shot');
    expect(card.textContent).toMatch(/1280×720/);
    expect(card.textContent).toMatch(/Boyut Terminali/);
    expect(card.textContent).toMatch(/\+8 Kredi/);
    expect(within(card).getByRole('img').getAttribute('src')).toBe('blob:x');
    expect(screen.getByTestId('photo-live').textContent).toMatch(/Kare yakalandı/);
    expect(screen.getByTestId('photo-live').textContent).toMatch(/8 Kredi/);
    fireEvent.click(screen.getByTestId('photo-save'));
    await flush();
    expect(api.photoSave).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('photo-live').textContent).toMatch(/kaydedildi/);
    fireEvent.click(screen.getByTestId('photo-discard'));
    await flush();
    expect(screen.queryByTestId('photo-shot')).toBeNull();
  });

  it('Paylaş düğmesi yalnız cihaz destekliyorsa görünür; motorun mesajı duyurulur', async () => {
    const api = fakeApi();
    api.st.canShare = false;
    const { unmount } = render(<PhotoOverlay api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('photo-shutter'));
    await flush();
    await flush();
    expect(screen.queryByTestId('photo-share')).toBeNull();
    unmount();
    const api2 = fakeApi();
    api2.st.canShare = true;
    render(<PhotoOverlay api={api2} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('photo-shutter'));
    await flush();
    await flush();
    fireEvent.click(screen.getByTestId('photo-share'));
    await flush();
    expect(api2.photoShare).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('photo-live').textContent).toMatch(/paylaşıldı/);
  });

  it('başarısız çekim: mesaj duyurulur, kart çıkmaz; kaydetme başarısız: tekrar dene mesajı', async () => {
    const api = fakeApi({ photoCapture: vi.fn(async () => ({ ok: false, reason: 'bos', message: 'Kare yakalanamadı.' })), photoSave: vi.fn(async () => ({ ok: false, message: 'Kaydedilemedi; tekrar dene.' })) });
    render(<PhotoOverlay api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('photo-shutter'));
    await flush();
    await flush();
    expect(screen.getByTestId('photo-live').textContent).toMatch(/yakalanamadı/);
    expect(screen.queryByTestId('photo-shot')).toBeNull();
    api.st.shot = { id: 2, w: 10, h: 10, bytes: 10, url: '', subjects: [], kredi: 0, counted: false };
    await act(async () => { await new Promise((r) => setTimeout(r, 230)); });
    fireEvent.click(screen.getByTestId('photo-save'));
    await flush();
    expect(screen.getByTestId('photo-live').textContent).toMatch(/tekrar dene/);
    expect(screen.getByTestId('photo-shot').textContent).toMatch(/sayaca eklenmedi/);
  });

  it('deklanşör parlaması: normalde kısa süre var, hareket azaltmada hiç yok', async () => {
    const run = async (props) => {
      const api = fakeApi();
      const { container, unmount } = render(<PhotoOverlay api={api} onClose={() => {}} {...props} />);
      fireEvent.click(screen.getByTestId('photo-shutter'));
      await flush();
      await flush();
      const has = !!container.querySelector('.kph-flash');
      unmount();
      return has;
    };
    expect(await run({})).toBe(true);
    expect(await run({ reducedMotion: true })).toBe(false);
    expect(await run({ accessibility: true })).toBe(false);
  });

  it('hareket azaltma/erişilebilirlik işaretleri kökte', () => {
    const api = fakeApi();
    render(<PhotoOverlay api={api} onClose={() => {}} reducedMotion accessibility />);
    const root = screen.getByTestId('photo-overlay');
    expect(root.getAttribute('data-calm')).toBe('1');
    expect(root.getAttribute('data-a11y')).toBe('1');
  });
});

describe('PhotoOverlay: odak yönetimi', () => {
  it('açılışta odak sahne katmanına gelir (klavye hemen çalışır); kapanınca açan öğeye döner', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const api = fakeApi();
    const { unmount } = render(<PhotoOverlay api={api} onClose={() => {}} />);
    expect(document.activeElement).toBe(screen.getByTestId('photo-layer'));
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
