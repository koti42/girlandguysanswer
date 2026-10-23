// @vitest-environment jsdom
/*
 * Duraklat > Nasıl Oynanır > "Neon Meridyen" sayfası (cityhud): kapı + terminal kontrolleri, adımlar, erişilebilirlik, içerik güvenliği ve doğruluğu.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import PauseMenu from '../PauseMenu.jsx';
import PauseHowTo from '../PauseHowTo.jsx';
import { CITY_CONTROLS, CITY_LEAD, CITY_STEPS, CITY_TOUCH, DESKTOP_CONTROLS, TOUCH_CONTROLS } from '../kxHowTo.js';
import { isSafeText } from '../../../../game/kesif/sim/city/citySafeData.js';
import { GATE_RULES } from '../../../../game/kesif/sim/dim/travel.js';
import { HELD_ACTION_CODES, PRESS_ACTION_CODES } from '../../../../game/kesif/inputMath.js';
import { TOUCH_BUTTONS } from '../../../../game/kesif/inputMath.js';

const pause = (extra = {}) => ({ onResume: vi.fn(), onSave: vi.fn(() => true), onExit: vi.fn(), onChange: vi.fn(), ...extra });

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // yok say
  }
});
afterEach(() => {
  cleanup();
});

describe('PauseHowTo: Neon Meridyen sekmesi', () => {
  it('üç sekme: Klavye ve fare / Dokunmatik / Neon Meridyen; varsayılan sekme değişmez', () => {
    render(<PauseHowTo touch={false} />);
    expect(screen.getByRole('button', { name: 'Klavye ve fare', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dokunmatik', pressed: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Neon Meridyen', pressed: false })).toBeInTheDocument();
    cleanup();
    render(<PauseHowTo touch />);
    expect(screen.getByRole('button', { name: 'Dokunmatik', pressed: true })).toBeInTheDocument();
  });

  it('sekmeye geçince: başlık, tanıtım, 5 adım (numaralı liste), şehir kontrolleri (klavye + dokunmatik); eski listeler gizlenir; geri dönülür', () => {
    render(<PauseHowTo />);
    fireEvent.click(screen.getByRole('button', { name: 'Neon Meridyen' }));
    expect(screen.getByRole('button', { name: 'Neon Meridyen', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Neon Meridyen' })).toBeInTheDocument();
    expect(screen.getByText(CITY_LEAD)).toBeInTheDocument();
    const steps = screen.getByRole('list', { name: 'Neon Meridyen yolculuk adımları' });
    expect(steps.tagName).toBe('OL');
    expect(within(steps).getAllByRole('listitem')).toHaveLength(CITY_STEPS.length);
    expect(CITY_STEPS).toHaveLength(5);
    CITY_STEPS.forEach((s) => expect(within(steps).getByText(s.title + ':', { exact: false })).toBeInTheDocument());
    const keys = screen.getByRole('list', { name: 'Neon Meridyen klavye ve fare kontrolleri' });
    expect(within(keys).getAllByRole('listitem')).toHaveLength(CITY_CONTROLS.length);
    expect(within(keys).getByText('Boyut kipi aç / kapat')).toBeInTheDocument();
    expect(within(keys).getByText('T')).toBeInTheDocument();
    const touch = screen.getByRole('list', { name: 'Neon Meridyen dokunmatik kontroller' });
    expect(within(touch).getAllByRole('listitem')).toHaveLength(CITY_TOUCH.length);
    // genel kontrol listeleri bu sayfada yok; tüm sayfalarda ortak ipuçları durur
    expect(screen.queryByRole('list', { name: 'Klavye ve fare kontrolleri' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Dokunmatik kontroller' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'İpuçları' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Klavye ve fare' }));
    expect(screen.getByRole('list', { name: 'Klavye ve fare kontrolleri' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Neon Meridyen yolculuk adımları' })).toBeNull();
  });

  it('dokunmatik sekmede el/ekran seçimi yalnız dokunmatik sayfada; şehir sayfasında yok', () => {
    render(<PauseHowTo touch />);
    expect(screen.getByRole('button', { name: 'Sağ elli' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Neon Meridyen' }));
    expect(screen.queryByRole('button', { name: 'Sağ elli' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Neon Meridyen dokunmatik kontroller' })).toBeInTheDocument();
  });

  it('PauseMenu içinden: Nasıl Oynanır → Neon Meridyen → Geri ana menüye', () => {
    render(<PauseMenu {...pause()} />);
    fireEvent.click(screen.getByRole('button', { name: /Nasıl Oynanır \/ Kontroller/ }));
    const dlg = screen.getByRole('dialog', { name: 'Nasıl Oynanır / Kontroller' });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Neon Meridyen' }));
    expect(within(dlg).getByRole('list', { name: 'Neon Meridyen yolculuk adımları' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
  });
});

describe('Neon Meridyen yardım içeriği: doğruluk ve güvenlik', () => {
  const texts = [CITY_LEAD]
    .concat(CITY_STEPS.map((s) => s.title + ' ' + s.text))
    .concat(CITY_CONTROLS.map((r) => r.what + ' ' + (r.note || '')))
    .concat(CITY_TOUCH.map((r) => r.what + ' ' + r.how));

  it('tüm metinler yasak liste + marka taramasından temiz', () => {
    texts.forEach((t) => expect(isSafeText(t), t).toBe(true));
  });

  it('sayılar gerçek kurallarla aynı: 12 şarj, 30 sn kapı ömrü, 3×4 alan, 6 sn terminal onayı', () => {
    const all = texts.join(' ');
    expect(all).toContain(GATE_RULES.cost + ' şarj');
    expect(all).toContain(GATE_RULES.ttl + ' saniye');
    expect(all).toContain(GATE_RULES.w + '×' + GATE_RULES.h);
    expect(all).toContain('6 saniye');
    expect(all).toContain('Kuantum Çekirdeği');
  });

  it('T tuşu gerçekten portalMode eylemine bağlı; dokunmatik düğme adı gerçek düğme tanımıyla aynı', () => {
    expect(PRESS_ACTION_CODES.KeyT === 'portalMode' || HELD_ACTION_CODES.KeyT === 'portalMode').toBe(true);
    const row = CITY_CONTROLS.find((r) => r.what === 'Boyut kipi aç / kapat');
    expect(row.keys).toEqual(['T']);
    expect(TOUCH_BUTTONS.find((b) => b.name === 'portalMode').label).toBe('Boyut kipi');
    expect(CITY_TOUCH[0].what).toBe('Boyut kipi');
  });

  it('genel kontrol tablolarına dokunulmadı: boyut kipi satırı (T) hâlâ var; tüm listeler donuk, anahtarlar benzersiz', () => {
    expect(DESKTOP_CONTROLS.some((r) => r.keys.indexOf('T') >= 0)).toBe(true);
    [CITY_STEPS, CITY_CONTROLS, CITY_TOUCH, DESKTOP_CONTROLS, TOUCH_CONTROLS].forEach((l) => expect(Object.isFrozen(l)).toBe(true));
    expect(new Set(CITY_STEPS.map((s) => s.key)).size).toBe(CITY_STEPS.length);
    expect(new Set(CITY_CONTROLS.map((r) => r.what)).size).toBe(CITY_CONTROLS.length);
    expect(new Set(CITY_TOUCH.map((r) => r.what)).size).toBe(CITY_TOUCH.length);
  });
});
