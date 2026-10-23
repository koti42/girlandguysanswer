// @vitest-environment jsdom
/*
 * Boyut geçişi yükleme paneli (cityhud LoadingOverlay): 0,6 sn gecikme, ilerleme çubuğu, aria-live duyuruları (25'lik basamak),
 * ipucu dönüşü, hareket azaltma / erişilebilirlik, kısa geçişte hiç görünmeme, sızıntısız abonelik.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import LoadingOverlay from '../city/LoadingOverlay.jsx';
import KesifHud from '../KesifHud.jsx';
import { createHudStore } from '../../../../game/kesif/hudStore.js';
import { createAnnouncer } from '../kesifAnnouncer.js';
import { LOADING_DELAY_MS, LOADING_DONE_TEXT, LOADING_HINT_PREFIX, LOADING_TIPS, TIP_EVERY_MS } from '../../../../game/kesif/sim/city/cityHudData.js';
import { TRANSITION_MESSAGES } from '../../../../game/kesif/gameTransition.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const L = (progress, active = true, label = 'Boyut geçişi…') => ({ dimLoading: { active, progress, label } });

function setup(props = {}) {
  const store = createHudStore();
  store.set({ hp: 20 });
  const utils = render(<LoadingOverlay store={store} {...props} />);
  const set = (patch) => act(() => {
    store.set({ ...store.get(), ...patch });
  });
  const advance = (ms) => act(() => {
    vi.advanceTimersByTime(ms);
  });
  return { store, set, advance, ...utils };
}
const live = () => screen.getByTestId('city-loading-live');
const panel = () => screen.queryByTestId('city-loading');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(1_700_000_000_000));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('LoadingOverlay: gecikme', () => {
  it('yükleme yokken hiçbir panel yok; canlı bölge her zaman bağlı ve boş', () => {
    setup();
    expect(panel()).toBeNull();
    expect(live()).toHaveAttribute('role', 'status');
    expect(live()).toHaveAttribute('aria-live', 'polite');
    expect(live()).toHaveAttribute('aria-atomic', 'true');
    expect(live()).toHaveTextContent('');
  });

  it('geçiş makinesi dimLoading\'i HOLD\'un 0,6. sn\'sinde açar: panel yalnız 150 ms\'lik yanıp sönme korumasını bekler (toplam gecikme 0,6 sn + 150 ms değil)', () => {
    const { set, advance } = setup();
    set(L(0.1));
    expect(panel()).toBeNull();
    advance(100);
    expect(panel()).toBeNull();
    advance(60);
    expect(panel()).not.toBeNull();
  });

  it('genel ui=loading durumunda (geçiş makinesi gecikmesi yok) panel 0,6 sn bekler (öncesinde değil)', () => {
    expect(LOADING_DELAY_MS).toBe(600);
    const { set, advance } = setup();
    set({ ui: 'loading' });
    expect(panel()).toBeNull();
    advance(LOADING_DELAY_MS - 50);
    expect(panel()).toBeNull();
    advance(100);
    expect(panel()).not.toBeNull();
  });

  it('korumadan kısa süren etkinlik (tek kare) panel hiç göstermez ve "tamamlandı" duyurulmaz (yanıp sönme yok)', () => {
    const { set, advance } = setup();
    set(L(0.3));
    advance(100);
    set({ dimLoading: null });
    advance(1000);
    expect(panel()).toBeNull();
    expect(live()).toHaveTextContent('');
    // ui=loading: 0,6 sn dolmadan biterse de görünmez
    set({ ui: 'loading' });
    advance(400);
    set({ ui: 'none' });
    advance(1000);
    expect(panel()).toBeNull();
    expect(live()).toHaveTextContent('');
  });

  it('gecikmeler özelleştirilebilir (guardMs: dimLoading, delayMs: ui=loading)', () => {
    const a = setup({ guardMs: 20 });
    a.set(L(0.3));
    a.advance(30);
    expect(panel()).not.toBeNull();
    cleanup();
    const b = setup({ delayMs: 100 });
    b.set({ ui: 'loading' });
    b.advance(120);
    expect(panel()).not.toBeNull();
  });

  it('yeniden başlayan yükleme korumayı baştan bekler', () => {
    const { set, advance } = setup();
    set(L(0.3));
    advance(700);
    expect(panel()).not.toBeNull();
    set({ dimLoading: null });
    expect(panel()).toBeNull();
    set(L(0.1));
    expect(panel()).toBeNull();
    advance(100);
    expect(panel()).toBeNull();
    advance(60);
    expect(panel()).not.toBeNull();
  });
});

describe('LoadingOverlay: içerik ve aria', () => {
  it('başlık (etiket), ilerleme çubuğu (aria-valuenow/text), yüzde ve ipucu; panel aria-busy grup', () => {
    const { set, advance } = setup();
    set(L(0.42));
    advance(650);
    const p = panel();
    expect(p).toHaveAttribute('role', 'group');
    expect(p).toHaveAttribute('aria-busy', 'true');
    expect(p).toHaveAttribute('aria-label', 'Boyut geçişi yükleniyor');
    expect(screen.getByRole('heading', { name: 'Boyut geçişi…' })).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Boyut geçişi ilerlemesi' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuetext', 'Yüzde 42');
    expect(bar).toHaveAttribute('data-indeterminate', '0');
    expect(bar.firstChild.style.getPropertyValue('--kcl-p')).toBe('42%');
    expect(p).toHaveTextContent('%42');
    expect(screen.getByTestId('city-loading-tip')).toHaveTextContent('İpucu');
    // ilerleme güncellenir
    set(L(0.8));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
    expect(panel()).toHaveTextContent('%80');
  });

  it('ilerleme 0 iken belirsiz çubuk (aria-valuenow yok, "Hazırlanıyor"); ui=loading ve dimLoading yokken de belirsiz panel', () => {
    const { set, advance } = setup();
    set(L(0));
    advance(650);
    let bar = screen.getByRole('progressbar');
    expect(bar).not.toHaveAttribute('aria-valuenow');
    expect(bar).toHaveAttribute('aria-valuetext', 'Hazırlanıyor');
    expect(bar).toHaveAttribute('data-indeterminate', '1');
    set({ dimLoading: null, ui: 'loading' });
    expect(panel()).not.toBeNull();
    bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('data-indeterminate', '1');
    set({ ui: 'none' });
    expect(panel()).toBeNull();
  });

  it('canlı bölge: başlangıçta "yükleniyor.", ilerledikçe yalnız 25\'lik basamakta değişir, bitince "tamamlandı" (2,5 sn sonra silinir)', () => {
    const { set, advance } = setup();
    set(L(0));
    expect(live()).toHaveTextContent('');
    advance(650);
    expect(live()).toHaveTextContent('Boyut geçişi yükleniyor.');
    const seen = new Set();
    for (let p = 0; p <= 1.0001; p += 0.02) {
      set(L(Math.min(1, p)));
      seen.add(live().textContent);
    }
    expect([...seen].sort()).toEqual([
      'Boyut geçişi yükleniyor, yüzde 100.',
      'Boyut geçişi yükleniyor, yüzde 25.',
      'Boyut geçişi yükleniyor, yüzde 50.',
      'Boyut geçişi yükleniyor, yüzde 75.',
      'Boyut geçişi yükleniyor.',
    ]);
    set({ dimLoading: null });
    expect(panel()).toBeNull();
    expect(live()).toHaveTextContent(LOADING_DONE_TEXT);
    advance(2400);
    expect(live()).toHaveTextContent(LOADING_DONE_TEXT);
    advance(200);
    expect(live()).toHaveTextContent('');
  });

  it('görsel metinler ekran okuyucuyu boğmaz: yüzde ve ipucu aria-hidden', () => {
    const { set, advance } = setup();
    set(L(0.5));
    advance(650);
    expect(panel().querySelector('.kcl-pct')).toHaveAttribute('aria-hidden', 'true');
    expect(panel().querySelector('.kcl-tip')).toHaveAttribute('aria-hidden', 'true');
    expect(panel().querySelector('.kcl-ico')).toHaveAttribute('aria-hidden', 'true');
  });

  it('etiket boşsa varsayılan başlık "Boyut geçişi…"', () => {
    const { set, advance } = setup();
    set(L(0.5, true, ''));
    advance(650);
    expect(screen.getByRole('heading', { name: 'Boyut geçişi…' })).toBeInTheDocument();
  });
});

describe('LoadingOverlay: ipuçları', () => {
  it('ipucu TIP_EVERY_MS\'de bir döner, listeden gelir ve aile dostu metindir', () => {
    expect(TIP_EVERY_MS).toBeGreaterThanOrEqual(3000);
    const { set, advance } = setup();
    set(L(0.3));
    advance(650);
    const tipText = () => screen.getByTestId('city-loading-tip').textContent.replace('İpucu · ', '');
    const first = tipText();
    expect(LOADING_TIPS).toContain(first);
    advance(TIP_EVERY_MS + 50);
    const second = tipText();
    expect(LOADING_TIPS).toContain(second);
    expect(second).not.toBe(first);
    expect(LOADING_TIPS.indexOf(second)).toBe((LOADING_TIPS.indexOf(first) + 1) % LOADING_TIPS.length);
  });

  it('hareket azaltmada ipucu sabit kalır; panel data-reduced=1', () => {
    const { set, advance } = setup({ reducedMotion: true });
    set(L(0.3));
    advance(650);
    const t0 = screen.getByTestId('city-loading-tip').textContent;
    advance(TIP_EVERY_MS * 3);
    expect(screen.getByTestId('city-loading-tip').textContent).toBe(t0);
    expect(panel()).toHaveAttribute('data-reduced', '1');
  });

  it('erişilebilirlik modu işaretlenir (büyük yazı, opak zemin CSS\'te)', () => {
    const { set, advance } = setup({ accessibility: true });
    set(L(0.3));
    advance(650);
    expect(panel()).toHaveAttribute('data-a11y', '1');
    expect(panel()).toHaveAttribute('data-reduced', '0');
  });
});

describe('LoadingOverlay: yaşam döngüsü', () => {
  it('söküldükten sonra depo güncellemesi hata vermez; zamanlayıcı kalmaz', () => {
    const { set, advance, unmount, store } = setup();
    set(L(0.3));
    unmount();
    expect(() => act(() => store.set({ ...store.get(), ...L(0.9) }))).not.toThrow();
    advance(5000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abonelik sızıntısı yok: 20 bağla/sök sonrası dinleyici sayısı başa döner', () => {
    const store = createHudStore();
    let subs = 0;
    const orig = store.subscribe;
    store.subscribe = (fn) => {
      subs++;
      const off = orig(fn);
      return () => {
        subs--;
        off();
      };
    };
    for (let i = 0; i < 20; i++) render(<LoadingOverlay store={store} />).unmount();
    expect(subs).toBe(0);
  });

  it('geçersiz dimLoading (NaN ilerleme, etiketsiz) çökmez; sanitize 0..1 verir', () => {
    const { set, advance } = setup();
    set({ dimLoading: { active: true, progress: NaN, label: null } });
    advance(650);
    expect(panel()).not.toBeNull();
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-indeterminate', '1');
  });

  it('tıklamayı engellemez: panel CSS\'te pointer-events:none ve düğme/giriş öğesi içermez', () => {
    const { set, advance } = setup();
    set(L(0.3));
    advance(650);
    expect(panel().querySelectorAll('button, a, input, select, textarea')).toHaveLength(0);
  });
});

describe('KesifHud ile birlikte (SPA ekran düzeni)', () => {
  it('yükleme paneli HUD\'u bozmaz: HUD çipi altta durur, panel üstte; yükleme bitince HUD aynı', () => {
    const store = createHudStore();
    store.set({ hp: 20, maxHp: 20, hunger: 20, dim: 'neon', district: 'Merkez', time: 'gece 22:10' });
    render(
      <>
        <KesifHud store={store} actions={{}} announcer={createAnnouncer()} />
        <LoadingOverlay store={store} />
      </>
    );
    expect(screen.getByTestId('city-chip')).toBeInTheDocument();
    act(() => {
      store.set({ ...store.get(), ...L(0.5) });
    });
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(panel()).not.toBeNull();
    expect(screen.getByTestId('city-chip')).toBeInTheDocument();
    act(() => {
      store.set({ ...store.get(), dimLoading: null });
    });
    expect(panel()).toBeNull();
    expect(screen.getByTestId('city-chip')).toBeInTheDocument();
  });
});

describe('KesifHud: yükleme ipucu satırı gizlenir', () => {
  const hintOf = (hint) => {
    const store = createHudStore();
    store.set({ hp: 20, maxHp: 20, hunger: 20, hint });
    const { container, unmount } = render(<KesifHud store={store} actions={{}} announcer={createAnnouncer()} />);
    const text = container.querySelector('.kx-hint') ? container.querySelector('.kx-hint').textContent : '';
    unmount();
    return text;
  };

  it('"Boyut geçişi… %NN" ipucu gösterilmez (panel + aria-live yeterli); başka ipuçları gösterilir', () => {
    expect(hintOf('Boyut geçişi… %37')).toBe('');
    expect(hintOf('Boyut geçişi… %100')).toBe('');
    expect(hintOf('[Sağ tık] Terminali kullan')).toContain('Terminali kullan');
    expect(hintOf('Ana diyara döndün.')).toContain('Ana diyara döndün.');
    expect(hintOf(null)).toBe('');
  });

  it('önek, systems/dimension.js ve gameTransition mesajıyla uyumlu (yazıldığı yerler değişirse bu test kırılır)', () => {
    const dim = fs.readFileSync(path.join(here, '../../../../game/kesif/systems/dimension.js'), 'utf8');
    expect(dim).toContain("'Boyut geçişi… %'");
    expect(LOADING_HINT_PREFIX).toBe('Boyut geçişi…');
    expect(TRANSITION_MESSAGES.loading.indexOf(LOADING_HINT_PREFIX)).toBe(0);
    expect('Boyut geçişi… %55'.indexOf(LOADING_HINT_PREFIX)).toBe(0);
  });
});
