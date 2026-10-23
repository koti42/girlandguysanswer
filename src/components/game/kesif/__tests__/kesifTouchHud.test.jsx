// @vitest-environment jsdom
/*
 * Dokunmatik HUD yapısı: duyuru yığını, durum etkileri, etkileşim ipucu, "telefonunu çevir" yuvası ve eşya çubuğu şeridi.
 * (CSS konumları kesifTouchLayout.test.js sözleşmesinde; gerçek ölçüm _kesifHarness/touchui-* senaryolarında.)
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import KesifHud from '../KesifHud.jsx';
import Hotbar from '../Hotbar.jsx';
import ZoneBanner from '../ZoneBanner.jsx';
import { A11Y_TOAST_MS, QUIET_MS, TOAST_MS, TOUCH_QUIET_MS, TOUCH_TOAST_MS, toastDuration } from '../toastTiming.js';
import { createHudStore } from '../../../../game/kesif/hudStore.js';
import { createAnnouncer } from '../kesifAnnouncer.js';
import InventoryPanel from '../InventoryPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';
import { TOUCH_DRAG_HOLD_MS } from '../panelHooks.js';

const EFFECT = { key: 'hiz', name: 'Hız', icon: 'hiz', level: 1, secondsLeft: 30, fraction: 0.5 };

function setup(props = {}, initial = {}) {
  const store = createHudStore();
  store.set({ hp: 20, maxHp: 20, hunger: 20, hotbar: [{ item: 'item:kazma_demir', count: 1 }], effects: [EFFECT], ...initial });
  const ann = createAnnouncer();
  const utils = render(<KesifHud store={store} actions={{ selectHotbar: vi.fn(), pressButton: vi.fn() }} announcer={ann} {...props} />);
  return { store, ann, ...utils };
}

beforeEach(() => {
  try {
    localStorage.setItem('kesif.hintSeen.v1', '1');
  } catch {
    // yok say
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('dokunmatik HUD: duyuru yığını üst-orta öbekte', () => {
  it('dokunmatikte duyurular .kx-tcwrap içinde (akışta), ZoneBanner katmanında değil; masaüstünde .kx-announce içinde', () => {
    const touch = setup({ touch: true });
    act(() => {
      touch.ann.push({ kind: 'achievement', text: 'Başarım kazandın', sub: 'İlk madenci' });
    });
    expect(touch.container.querySelector('.kx-tcwrap .kx-toasts .kx-toast')).not.toBeNull();
    expect(touch.container.querySelector('.kx-announce .kx-toast')).toBeNull();
    // yığın kendi canlı bölgesi (üst-orta öbek duyuru katmanının dışında)
    expect(touch.container.querySelector('.kx-tcwrap .kx-toasts').getAttribute('aria-live')).toBe('polite');
    cleanup();

    const desk = setup({ touch: false });
    act(() => {
      desk.ann.push({ kind: 'achievement', text: 'Başarım kazandın', sub: 'İlk madenci' });
    });
    expect(desk.container.querySelector('.kx-announce .kx-toast')).not.toBeNull();
    expect(desk.container.querySelector('.kx-tcwrap .kx-toast')).toBeNull();
  });

  it('dokunmatikte duyuruya dokunmak kapatır; masaüstünde dokunma kapatmaz', () => {
    const t = setup({ touch: true });
    act(() => {
      t.ann.push({ kind: 'crystal', text: 'Anahtar Kristali', sub: '3 / 5 toplandı' });
    });
    fireEvent.click(t.container.querySelector('.kx-toast'));
    expect(t.container.querySelector('.kx-toast')).toBeNull();
    cleanup();
    const d = setup({ touch: false });
    act(() => {
      d.ann.push({ kind: 'crystal', text: 'Anahtar Kristali', sub: '3 / 5 toplandı' });
    });
    fireEvent.click(d.container.querySelector('.kx-toast'));
    expect(d.container.querySelector('.kx-toast')).not.toBeNull();
  });

  it('süre: dokunmatik masaüstünden kısa, erişilebilirlik modu en uzun; sessiz olan her zaman daha kısa', () => {
    expect(TOUCH_TOAST_MS).toBeLessThan(TOAST_MS);
    expect(TOUCH_QUIET_MS).toBeLessThan(QUIET_MS);
    expect(TOUCH_QUIET_MS).toBeLessThan(TOUCH_TOAST_MS);
    expect(A11Y_TOAST_MS).toBeGreaterThan(TOAST_MS);
    expect(toastDuration({}, { touch: true })).toBe(TOUCH_TOAST_MS);
    expect(toastDuration({ quiet: true }, { touch: true })).toBe(TOUCH_QUIET_MS);
    expect(toastDuration({ quiet: true }, {})).toBe(QUIET_MS);
    expect(toastDuration({}, { touch: true, a11y: true })).toBe(A11Y_TOAST_MS);
  });

  it('dokunmatik duyuru kendiliğinden TOUCH_TOAST_MS sonra kalkar (masaüstü TOAST_MS)', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<ZoneBanner banner={null} toasts={[{ id: 7, kind: 'info', text: 'Merhaba', sub: '' }]} onDismiss={onDismiss} touch />);
    act(() => {
      vi.advanceTimersByTime(TOUCH_TOAST_MS - 50);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onDismiss).toHaveBeenCalledWith(7);
  });

  it('başlangıç sakinliği (kesifAnnouncer) bozulmaz: ilk bölge girişi ve "Görev güncellendi" yığına girmez', () => {
    let t = 0;
    const ann = createAnnouncer({ now: () => t });
    const store = createHudStore();
    store.set({ hp: 20, maxHp: 20, hunger: 20 });
    const { container } = render(<KesifHud store={store} actions={{}} announcer={ann} touch />);
    act(() => {
      ann.begin();
      ann.push({ type: 'zoneEnter', zone: { name: 'Başlangıç Vadisi' } });
      ann.push({ type: 'questUpdate', title: 'İlk Odunlar' });
    });
    expect(container.querySelector('.kx-toast')).toBeNull();
    act(() => {
      ann.push({ kind: 'achievement', text: 'Başarım kazandın', sub: 'x' });
    });
    expect(container.querySelectorAll('.kx-toast')).toHaveLength(1);
  });
});

describe('dokunmatik HUD: sol öbek, orta öbek ve ölçerler', () => {
  it('durum etkileri dokunmatikte sol sütunda (akışta), masaüstünde ayrı üst-sağ sarmalayıcıda', () => {
    const t = setup({ touch: true });
    expect(t.container.querySelector('.kx-tl-col .kx-fx-wrap .kx-fx-item')).not.toBeNull();
    expect(t.container.querySelectorAll('.kx-fx-wrap')).toHaveLength(1);
    cleanup();
    const d = setup({ touch: false });
    expect(d.container.querySelector('.kx-tl-col .kx-fx-wrap')).toBeNull();
    expect(d.container.querySelector('.kx-fx-wrap .kx-fx-item')).not.toBeNull();
  });

  it('etkileşim ipucu dokunmatikte ölçerlerin en üstünde (akışta); masaüstünde ortada ayrı katmanda', () => {
    const t = setup({ touch: true }, { hint: 'Sandığı aç' });
    const g = t.container.querySelector('.kx-gauges');
    expect(g.firstElementChild.className).toContain('kx-mid');
    expect(g.querySelector('.kx-hint')).not.toBeNull();
    cleanup();
    const d = setup({ touch: false }, { hint: 'Sandığı aç' });
    expect(d.container.querySelector('.kx-gauges .kx-mid')).toBeNull();
    expect(d.container.querySelector('.kx-mid .kx-hint')).not.toBeNull();
  });

  it('ölçer sırası: ipucu (geçici) üstte, mana/teknoloji altta → geçici öğe belirince kalıcı ölçerler kaymaz', () => {
    const t = setup({ touch: true }, {
      hint: 'Sandığı aç',
      mana: { value: 30, max: 100 },
      spell: { key: 'ates', name: 'Ateş', manaCost: 20, cooldown01: 0, ready: true },
      jetpack: { fuel: 50, max: 100, fraction: 0.5, cells: 1, thrusting: false, empty: false },
    });
    const order = Array.from(t.container.querySelector('.kx-gauges').children).map((c) => c.className.split(' ')[0]);
    expect(order.indexOf('kx-mid')).toBe(0);
    expect(order.indexOf('kx-tech')).toBeLessThan(order.indexOf('kx-mana'));
  });

  it('enerji çipi dokunmatikte ölçerlerle birlikte (sol öbek kısa kalır); masaüstünde sol öbekte', () => {
    const energy = { value: 100, max: 500, gen: 5, use: 2, net: 3, live: true, standby: false, nodes: 3, name: 'Ağ' };
    const t = setup({ touch: true }, { energy });
    expect(t.container.querySelector('.kx-gauges [data-testid="hud-energy"]')).not.toBeNull();
    expect(t.container.querySelector('.kx-tl-col [data-testid="hud-energy"]')).toBeNull();
    cleanup();
    const d = setup({ touch: false }, { energy });
    expect(d.container.querySelector('.kx-tl-col [data-testid="hud-energy"]')).not.toBeNull();
  });

  it('topSlot yalnız dokunmatikte üst-orta öbeğe (.kx-tc) girer', () => {
    const slot = <p data-testid="slot">çevir</p>;
    const t = setup({ touch: true, topSlot: slot });
    expect(t.container.querySelector('.kx-tc [data-testid="slot"]')).not.toBeNull();
    cleanup();
    const d = setup({ touch: false, topSlot: slot });
    expect(d.container.querySelector('[data-testid="slot"]')).toBeNull();
  });

  it('üst yerleşim: .kx-top sol öbek + orta sarmalayıcı; kx-hide-ui paneller açıkken öbekleri gizlemeye devam eder', () => {
    const t = setup({ touch: true });
    const top = t.container.querySelector('.kx-top');
    expect(top.querySelector(':scope > .kx-tl.kx-hide-ui')).not.toBeNull();
    expect(top.querySelector(':scope > .kx-tcwrap > .kx-tc.kx-hide-ui')).not.toBeNull();
    expect(t.container.querySelector('.kx-bottom .kx-gauges')).not.toBeNull();
  });
});

/** jsdom ölçü vermez: şerit mantığı için scrollWidth/clientWidth/offsetLeft sahtelenir. */
function stubLayout({ client = 200, scroll = 440, slotW = 44, gap = 4, pad = 5 } = {}) {
  const protoDefs = {
    scrollWidth: { configurable: true, get() { return this.classList.contains('kx-hotbar') ? scroll : 0; } },
    clientWidth: { configurable: true, get() { return this.classList.contains('kx-hotbar') ? client : 0; } },
    offsetLeft: { configurable: true, get() { return this.classList.contains('kx-slot') ? pad + Number(this.getAttribute('data-index')) * (slotW + gap) : 0; } },
    offsetWidth: { configurable: true, get() { return this.classList.contains('kx-slot') ? slotW : 0; } },
  };
  const saved = {};
  Object.keys(protoDefs).forEach((k) => {
    saved[k] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, k);
    Object.defineProperty(HTMLElement.prototype, k, protoDefs[k]);
  });
  return () => Object.keys(saved).forEach((k) => {
    if (saved[k]) Object.defineProperty(HTMLElement.prototype, k, saved[k]);
    else delete HTMLElement.prototype[k];
  });
}

describe('Hotbar: dar ekranda yatay şerit', () => {
  const slots = Array.from({ length: 9 }, (_, i) => ({ item: i % 2 ? 'blok:taş' : 'item:yay', count: 1 }));
  const iconFor = () => 'data:image/png;base64,AAAA';
  let restore;
  afterEach(() => {
    if (restore) restore();
    restore = null;
  });

  it('sığmıyorsa data-scroll=1 ve kenar solması; seçili yuva görünür kalır', () => {
    restore = stubLayout({ client: 200, scroll: 440 });
    const { container } = render(<Hotbar slots={slots} selected={7} iconFor={iconFor} onSelect={() => {}} />);
    const bar = container.querySelector('.kx-hotbar');
    expect(bar.getAttribute('data-scroll')).toBe('1');
    // 8. yuva (index 7): sağ kenarı + 30 px pay görünür alana kaydırılır
    const right = 5 + 7 * 48 + 44;
    expect(bar.scrollLeft).toBe(right + 30 - 200);
  });

  it('seçim değişince şerit seçili yuvayı izler (sola ve sağa)', () => {
    restore = stubLayout({ client: 200, scroll: 440 });
    const { container, rerender } = render(<Hotbar slots={slots} selected={0} iconFor={iconFor} onSelect={() => {}} />);
    const bar = container.querySelector('.kx-hotbar');
    expect(bar.scrollLeft).toBe(0);
    rerender(<Hotbar slots={slots} selected={8} iconFor={iconFor} onSelect={() => {}} />);
    expect(bar.scrollLeft).toBe(5 + 8 * 48 + 44 + 30 - 200);
    rerender(<Hotbar slots={slots} selected={1} iconFor={iconFor} onSelect={() => {}} />);
    expect(bar.scrollLeft).toBe(5 + 48 - 30);
  });

  it('sığıyorsa şerit işareti yok (geniş yatay ve masaüstü değişmez)', () => {
    restore = stubLayout({ client: 440, scroll: 440 });
    const { container } = render(<Hotbar slots={slots} selected={3} iconFor={iconFor} onSelect={() => {}} />);
    const bar = container.querySelector('.kx-hotbar');
    expect(bar.getAttribute('data-scroll')).toBeNull();
    expect(bar.getAttribute('data-fade')).toBeNull();
  });

  it('tüm yuvalar (gizli olanlar dahil) odaklanabilir ve dokununca seçilir', () => {
    restore = stubLayout({ client: 200, scroll: 440 });
    const onSelect = vi.fn();
    render(<Hotbar slots={slots} selected={0} iconFor={iconFor} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /9\. yuva/ }));
    expect(onSelect).toHaveBeenCalledWith(8);
  });
});

describe('paneller: dokunuş sonrası sahte fare olayı bilgi kartını oynatmaz (tap-tap kaymasını önler)', () => {
  it('dokunmatik pointerdown sonrası mouseenter eşya bilgisini değiştirmez; fare ile üzerine gelince değişir', () => {
    const api = makeFakeApi({ items: { 9: ['blok:taş', 5], 10: ['blok:kum', 3] } });
    render(<InventoryPanel api={api} onClose={() => {}} />);
    const info = () => document.querySelector('.kp-info');
    // fare: üzerine gelince bilgi gösterilir
    fireEvent.mouseEnter(screen.getByTestId('slot-s10'));
    expect(info().textContent).toMatch(/Kum/);
    fireEvent.mouseLeave(screen.getByTestId('slot-s10'));
    // dokunmatik: seç (s9), sonra başka yuvaya dokun → tarayıcı mouseenter gönderir; bilgi seçili eşyada KALIR
    fireEvent.pointerDown(screen.getByTestId('slot-s9'), { pointerType: 'touch', pointerId: 1, button: 0, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(screen.getByTestId('slot-s9'), { pointerType: 'touch', pointerId: 1 });
    fireEvent.click(screen.getByTestId('slot-s9'));
    expect(info().textContent).toMatch(/Taş/);
    fireEvent.pointerDown(screen.getByTestId('slot-s10'), { pointerType: 'touch', pointerId: 2, button: 0, clientX: 50, clientY: 5 });
    fireEvent.mouseEnter(screen.getByTestId('slot-s10'));
    expect(info().textContent).toMatch(/Taş/);
    expect(info().textContent).not.toMatch(/Kum/);
  });
});

describe('paneller: dokunmatik sürükleme basılı tutunca başlar, kaydırma yuvalardan yapılabilir', () => {
  const setupInv = () => {
    vi.useFakeTimers();
    const api = makeFakeApi({ items: { 9: ['blok:taş', 5] } });
    render(<InventoryPanel api={api} onClose={() => {}} />);
    const zone = screen.getByRole('button', { name: /Yere bırak/ });
    const original = document.elementFromPoint;
    document.elementFromPoint = vi.fn(() => zone);
    return { api, restore: () => { document.elementFromPoint = original; } };
  };

  it('basılı tutmadan kaydırma sürükleme sayılmaz (panel kaydırılır, hayalet çıkmaz, bırakma yok)', () => {
    const { api, restore } = setupInv();
    const s9 = screen.getByTestId('slot-s9');
    fireEvent.pointerDown(s9, { pointerId: 1, clientX: 0, clientY: 0, button: 0, pointerType: 'touch' });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 60 }); // tutmadan dikey kaydırma
    expect(document.querySelector('.kp-ghost')).toBeNull();
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 0, clientY: 90 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 0, clientY: 90 });
    restore();
    expect(api.dropSlot).not.toHaveBeenCalled();
    expect(document.querySelector('.kp-ghost')).toBeNull();
  });

  it('tutunca yuva hazır olur (data-armed), touchmove kaydırması engellenir; hareket sürükler; bırakınca temizlenir', () => {
    const { api, restore } = setupInv();
    const s9 = screen.getByTestId('slot-s9');
    fireEvent.pointerDown(s9, { pointerId: 2, clientX: 0, clientY: 0, button: 0, pointerType: 'touch' });
    expect(s9.getAttribute('data-armed')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOUCH_DRAG_HOLD_MS + 10);
    });
    expect(s9.getAttribute('data-armed')).toBe('1');
    const tm = new Event('touchmove', { cancelable: true, bubbles: true });
    document.dispatchEvent(tm);
    expect(tm.defaultPrevented).toBe(true);
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 50, clientY: 50 });
    expect(document.querySelector('.kp-ghost')).not.toBeNull();
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 50, clientY: 50 });
    restore();
    expect(api.dropSlot).toHaveBeenCalledWith('s9', 5);
    expect(s9.getAttribute('data-armed')).toBeNull();
    const tm2 = new Event('touchmove', { cancelable: true, bubbles: true });
    document.dispatchEvent(tm2);
    expect(tm2.defaultPrevented).toBe(false); // engel kalktı: panel yine kaydırılabilir
  });

  it('fare (pointerType mouse) eskisi gibi 7 px hareketle hemen sürükler', () => {
    const { api, restore } = setupInv();
    const s9 = screen.getByTestId('slot-s9');
    fireEvent.pointerDown(s9, { pointerId: 3, clientX: 0, clientY: 0, button: 0, pointerType: 'mouse' });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 30, clientY: 30 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 30, clientY: 30 });
    restore();
    expect(api.dropSlot).toHaveBeenCalledWith('s9', 5);
  });
});
