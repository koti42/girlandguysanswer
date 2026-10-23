// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import KesifHud from '../KesifHud.jsx';
import PauseMenu from '../PauseMenu.jsx';
import { createHudStore } from '../../../../game/kesif/hudStore.js';
import { createAnnouncer } from '../kesifAnnouncer.js';
import { DESKTOP_CONTROLS, PLAY_TIPS, TOUCH_BUTTON_HELP } from '../kxHowTo.js';
import { HINT_SEEN_KEY, clearHintSeen, controlsToastText, markHintSeen, readHintSeen } from '../kxHintSeen.js';
import { HELD_ACTION_CODES, PRESS_ACTION_CODES } from '../../../../game/kesif/inputMath.js';

const pause = (extra = {}) => ({ onResume: vi.fn(), onSave: vi.fn(() => true), onExit: vi.fn(), onChange: vi.fn(), ...extra });

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // yok say
  }
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Nasıl Oynanır paneli (duraklatma menüsü)', () => {
  it('ana menüde Ayarlar altında bir giriş var; açılınca başlık, klavye listesi ve ipuçları görünür; Geri ana menüye döner', () => {
    render(<PauseMenu {...pause()} />);
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    const iSet = names.findIndex((t) => /Ayarlar/.test(t));
    const iHow = names.findIndex((t) => /Nasıl Oynanır \/ Kontroller/.test(t));
    expect(iHow).toBe(iSet + 1);
    fireEvent.click(screen.getByRole('button', { name: /Nasıl Oynanır \/ Kontroller/ }));
    const dlg = screen.getByRole('dialog', { name: 'Nasıl Oynanır / Kontroller' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Geri' })).toHaveFocus();
    const keys = within(dlg).getByRole('list', { name: 'Klavye ve fare kontrolleri' });
    expect(within(keys).getByText('Üret (tarifler)')).toBeInTheDocument();
    expect(within(keys).getByText('R')).toBeInTheDocument();
    PLAY_TIPS.forEach((t) => expect(within(dlg).getByText(t.title)).toBeInTheDocument());
    ['Üret', 'İnşa', 'Büyü', 'Teknoloji'].forEach((n) => expect(within(dlg).getByText(n)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
  });

  it('Ayarlar sayfasının en üstünde de giriş var (bildirim yolu: Esc, Ayarlar, Nasıl Oynanır); geri Ayarlar sayfasına döner', () => {
    render(<PauseMenu {...pause()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ayarlar$/ }));
    fireEvent.click(screen.getByTestId('kx-settings-howto'));
    expect(screen.getByRole('dialog', { name: 'Nasıl Oynanır / Kontroller' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Ayarlar' })).toBeInTheDocument();
  });

  it('dokunmatik: şema sekmesi açılır; her düğme için açıklama var; sol elli seçimi şemayı aynalar', () => {
    render(<PauseMenu {...pause({ touch: true, settings: { leftHanded: false } })} />);
    fireEvent.click(screen.getByRole('button', { name: /Nasıl Oynanır \/ Kontroller/ }));
    expect(screen.getByRole('button', { name: 'Dokunmatik', pressed: true })).toBeInTheDocument();
    const dlg = screen.getByRole('dialog');
    Object.values(TOUCH_BUTTON_HELP).forEach((txt) => expect(within(dlg).getByText(txt)).toBeInTheDocument());
    const left = (id) => parseFloat(dlg.querySelector(`.kx-ht-btn[data-id="${id}"]`).style.left);
    expect(left('break')).toBeGreaterThan(50);
    fireEvent.click(screen.getByRole('button', { name: 'Sol elli' }));
    expect(left('break')).toBeLessThan(50);
    expect(dlg.querySelector('.kx-ht-zone[data-id="move"]')).toHaveAttribute('data-side', 'right');
    // şema yalnız görsel; metin karşılığı listede
    expect(dlg.querySelector('.kx-ht-diagram')).toHaveAttribute('aria-hidden', 'true');
  });

  it('klavye sekmesi dokunmatikte de seçilebilir', () => {
    render(<PauseMenu {...pause({ touch: true })} />);
    fireEvent.click(screen.getByRole('button', { name: /Nasıl Oynanır \/ Kontroller/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Klavye ve fare' }));
    expect(screen.getByRole('list', { name: 'Klavye ve fare kontrolleri' })).toBeInTheDocument();
  });

  it('içerik gerçek tuş eşlemesiyle tutarlı (R = Üret, E = Envanter)', () => {
    expect(PRESS_ACTION_CODES.KeyR).toBe('craft');
    expect(PRESS_ACTION_CODES.KeyE).toBe('inventory');
    expect(DESKTOP_CONTROLS.find((r) => r.keys.indexOf('R') >= 0).what).toMatch(/Üret/);
    expect(DESKTOP_CONTROLS.find((r) => r.keys.indexOf('E') >= 0).what).toMatch(/Envanter/);
    // listedeki tek harfli her tuş motorda bir eyleme bağlı
    const bound = new Set(Object.keys(PRESS_ACTION_CODES));
    Object.keys(HELD_ACTION_CODES).forEach((k) => HELD_ACTION_CODES[k].forEach((c) => bound.add(c)));
    DESKTOP_CONTROLS.forEach((r) => r.keys.filter((k) => /^[A-Z]$/.test(k)).forEach((k) => expect(bound.has('Key' + k)).toBe(true)));
  });

  it('"İpuçlarını yeniden göster" görüldü işaretini siler', () => {
    markHintSeen();
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBe('1');
    render(<PauseMenu {...pause()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Ayarlar$/ }));
    fireEvent.click(screen.getByTestId('kx-reset-hints'));
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBeNull();
    expect(screen.getByText(/İpuçları sıfırlandı/)).toBeInTheDocument();
  });
});

describe('kxHintSeen: depolama kapalıyken de çökmez', () => {
  it('okuma, yazma ve silme hata fırlatan localStorage ile güvenli', () => {
    const boom = () => {
      throw new Error('kapalı');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(readHintSeen()).toBe(false);
    expect(markHintSeen()).toBe(false);
    expect(clearHintSeen()).toBe(false);
  });
  it('metin: masaüstü Esc, dokunmatik Duraklat', () => {
    expect(controlsToastText(false)).toBe('Kontroller için Esc → Ayarlar → Nasıl Oynanır');
    expect(controlsToastText(true)).toBe('Kontroller için Duraklat → Ayarlar → Nasıl Oynanır');
  });
});

function hud(props = {}, initial = {}) {
  const store = createHudStore();
  store.set({ hp: 20, maxHp: 20, hunger: 20, hotbar: [{ item: 'item:kazma_demir', count: 1, dur: 0.5 }], ...initial });
  const announcer = createAnnouncer();
  const utils = render(<KesifHud store={store} actions={{ pressButton: vi.fn() }} announcer={announcer} {...props} />);
  return { store, announcer, ...utils };
}

describe('KesifHud: etkileşim ipucu kendiliğinden gizlenir, beklemekle geri gelmez', () => {
  it('ipucu belirir, birkaç sn sonra gizlenir; aynı ipucu sürerken geri gelmez; bakışı çevirip dönmek yeniden gösterir', () => {
    vi.useFakeTimers();
    const { store } = hud();
    act(() => {
      store.patch({ hint: '[Sağ tık] Sandığı aç' });
    });
    expect(screen.getByText('Sandığı aç')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Sandığı aç')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Sandığı aç')).toBeNull();
    // oyuncu durup aynı sandığa bakmaya devam ediyor: 2 dakika boyunca geri gelmez
    act(() => {
      vi.advanceTimersByTime(120000);
    });
    expect(screen.queryByText('Sandığı aç')).toBeNull();
    // başka şeye bakıp geri dönmek yeni olaydır
    act(() => {
      store.patch({ hint: '' });
    });
    act(() => {
      store.patch({ hint: '[Sağ tık] Sandığı aç' });
    });
    expect(screen.getByText('Sandığı aç')).toBeInTheDocument();
  });

  it('etkileşim düğmesi (dokunmatik) ham ipucuna bağlı kalır: ipucu gizlense de bakılan şey kullanılabilir', () => {
    vi.useFakeTimers();
    const { store, container } = hud({ touch: true, inputRef: { current: null } });
    act(() => {
      store.patch({ hint: 'Kullan: Sandığı aç' });
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByText('Sandığı aç')).toBeNull();
    expect(container.querySelector('.kx-arc [aria-label="Etkileş"]')).not.toBeNull();
  });
});

describe('KesifHud: tek seferlik kontrol ipucu bildirimi', () => {
  it('dünya başlığı bittikten sonra bir kez çıkar, işaretlenir; yeniden bağlanınca çıkmaz; ayar silince yine çıkar', () => {
    vi.useFakeTimers();
    const first = hud();
    // dünya başlığı: 4 sn sürecek
    act(() => {
      first.store.patch({ banner: { text: 'Dünya Kodu: ABC', sub: 'Maceran başlıyor', until: Date.now() + 4000 } });
    });
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Kontroller için Esc → Ayarlar → Nasıl Oynanır')).toBeNull(); // başlık sürerken yok
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText('Kontroller için Esc → Ayarlar → Nasıl Oynanır')).toBeInTheDocument();
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBe('1');
    first.unmount();

    const second = hud();
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.queryByText(/Kontroller için/)).toBeNull();
    second.unmount();

    clearHintSeen();
    hud();
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Kontroller için Esc → Ayarlar → Nasıl Oynanır')).toBeInTheDocument();
  });

  it('dokunmatikte Duraklat yolunu söyler; menü açıkken (oynanmıyorken) çıkmaz', () => {
    vi.useFakeTimers();
    const { store } = hud({ touch: true, inputRef: { current: null } });
    act(() => {
      store.patch({ ui: 'pause' });
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(screen.queryByText(/Kontroller için/)).toBeNull();
    expect(localStorage.getItem(HINT_SEEN_KEY)).toBeNull();
    act(() => {
      store.patch({ ui: 'none' });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText('Kontroller için Duraklat → Ayarlar → Nasıl Oynanır')).toBeInTheDocument();
  });
});
