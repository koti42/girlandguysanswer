// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TouchControls from '../TouchControls.jsx';

function setup(props = {}) {
  const actions = {
    pressButton: vi.fn(),
    pause: vi.fn(),
    openInventory: vi.fn(),
    openCrafting: vi.fn(),
    openMap: vi.fn(),
    toggleCamera: vi.fn(),
  };
  const utils = render(<TouchControls actions={actions} abilities={{}} {...props} />);
  return { actions, ...utils };
}

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

describe('TouchControls: oyun düğmeleri', () => {
  it('basınca pressButton(name,true), bırakınca (name,false) çağrılır', () => {
    const { actions } = setup();
    const btn = screen.getByRole('button', { name: 'Kır veya saldır' });
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('break', true);
    expect(btn).toHaveAttribute('data-down', '1');
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('break', false);
    expect(btn).toHaveAttribute('data-down', '0');
    expect(actions.pressButton).toHaveBeenCalledTimes(2);
  });

  it('çoklu dokunuş: zıpla ve kır aynı anda basılı kalabilir', () => {
    const { actions } = setup();
    const jump = screen.getByRole('button', { name: 'Zıpla' });
    const brk = screen.getByRole('button', { name: 'Kır veya saldır' });
    fireEvent.pointerDown(brk, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerDown(jump, { pointerId: 2, pointerType: 'touch' });
    expect(actions.pressButton.mock.calls).toEqual([
      ['break', true],
      ['jump', true],
    ]);
    fireEvent.pointerUp(jump, { pointerId: 2, pointerType: 'touch' });
    expect(brk).toHaveAttribute('data-down', '1');
    expect(jump).toHaveAttribute('data-down', '0');
    fireEvent.pointerCancel(brk, { pointerId: 1, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('break', false);
  });

  it('çift bırakma tek (name,false) üretir', () => {
    const { actions } = setup();
    const btn = screen.getByRole('button', { name: 'Zıpla' });
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerCancel(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.lostPointerCapture(btn, { pointerId: 1 });
    expect(actions.pressButton.mock.calls.filter((c) => c[1] === false)).toHaveLength(1);
  });

  it('gerçek basıştan sonra gelen click ikinci kez saymaz', () => {
    const { actions } = setup();
    const btn = screen.getByRole('button', { name: 'Yerleştir veya kullan' });
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.click(btn, { detail: 1 });
    expect(actions.pressButton).toHaveBeenCalledTimes(2);
  });

  it('ekran okuyucu etkinleştirmesi (işaretçisiz click) basma + bırakma gönderir', () => {
    vi.useFakeTimers();
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Zıpla' }), { detail: 0 });
    expect(actions.pressButton).toHaveBeenLastCalledWith('jump', true);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(actions.pressButton).toHaveBeenLastCalledWith('jump', false);
  });

  it('klavye: Enter basılı tutma ve bırakma', () => {
    const { actions } = setup();
    const btn = screen.getByRole('button', { name: 'Kır veya saldır' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    fireEvent.keyDown(btn, { key: 'Enter', repeat: true });
    fireEvent.keyUp(btn, { key: 'Enter' });
    expect(actions.pressButton.mock.calls).toEqual([
      ['break', true],
      ['break', false],
    ]);
  });

  it('söküldüğünde basılı düğme bırakılır', () => {
    const { actions, unmount } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kır veya saldır' }), { pointerId: 1, pointerType: 'touch' });
    unmount();
    expect(actions.pressButton).toHaveBeenLastCalledWith('break', false);
  });

  it('actions.pressButton yoksa inputRef.current.pressButton kullanılır', () => {
    const input = { pressButton: vi.fn(), getJoystickView: () => ({ active: false }) };
    render(<TouchControls inputRef={{ current: input }} abilities={{}} />);
    const btn = screen.getByRole('button', { name: 'Zıpla' });
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    expect(input.pressButton.mock.calls).toEqual([
      ['jump', true],
      ['jump', false],
    ]);
  });

  it('sağ tuş (fare) düğmeyi basmaz', () => {
    const { actions } = setup();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Zıpla' }), { pointerId: 1, pointerType: 'mouse', button: 2 });
    expect(actions.pressButton).not.toHaveBeenCalled();
  });

  it('bağlam menüsü engellenir', () => {
    setup();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: 'Zıpla' }).dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe('TouchControls: düzen ve bağlamsal düğmeler', () => {
  it('her etkileşimli öğe data-no-tap taşır ve hedefler >= 44 px', () => {
    const { container } = setup({ abilities: { grapple: true }, canInteract: true });
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(8);
    buttons.forEach((b) => expect(b.hasAttribute('data-no-tap')).toBe(true));
    container.querySelectorAll('.kx-tbtn').forEach((b) => expect(Number(b.style.getPropertyValue('--bs'))).toBeGreaterThanOrEqual(44));
  });

  it('Etkileş yalnız ipucu varken; yetenek düğmesi açık yetenekle', () => {
    const { rerender, actions } = setup();
    expect(screen.queryByRole('button', { name: 'Etkileş' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kanca' })).toBeNull();
    rerender(<TouchControls actions={actions} abilities={{ grapple: true }} canInteract />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Etkileş' }), { pointerId: 1, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('interact', true);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kanca' }), { pointerId: 2, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('ability1', true);
  });

  it('yetenek bekleme ve şarj göstergesi', () => {
    setup({ abilities: { portalGun: true }, abilityStatus: { portalGun: { cooldown: 0.5, charges: 2 } } });
    const btn = screen.getByRole('button', { name: 'Portal Silahı' });
    expect(btn.querySelector('.kx-tbtn-cd')).not.toBeNull();
    expect(btn.querySelector('.kx-tbtn-charges')).toHaveTextContent('2');
  });

  it('uçuşta etiketler değişir', () => {
    setup({ flying: true });
    expect(screen.getByRole('button', { name: 'Yukarı uç' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aşağı in' })).toBeInTheDocument();
  });

  it('sol elli ayar yerleşimi aynalar; düğme saydamlığı değişkene yazılır', () => {
    const { container } = setup({ settings: { leftHanded: true, buttonOpacity: 0.5 } });
    const root = container.querySelector('.kx-touch');
    expect(root).toHaveAttribute('data-left', '1');
    expect(root.style.getPropertyValue('--kx-btn-op')).toBe('0.5');
    expect(root.style.getPropertyValue('--kx-ax')).toContain('--kx-safe-l');
  });

  it('sol elli ayar verilmezse input ipucundan okunur', () => {
    const input = { getTouchLayoutHints: () => ({ leftHanded: true, state: {} }), getJoystickView: () => ({ active: false }) };
    const { container } = render(<TouchControls inputRef={{ current: input }} actions={{ pressButton: () => {} }} abilities={{}} />);
    expect(container.querySelector('.kx-touch')).toHaveAttribute('data-left', '1');
  });

  it('koşu kilidi düğmesi input durumundan aria-pressed alır', () => {
    let locked = false;
    const input = {
      getTouchLayoutHints: () => ({ leftHanded: false, state: { sprintLocked: locked, crouchLocked: false } }),
      getJoystickView: () => ({ active: false }),
    };
    const pressButton = vi.fn((name, down) => {
      if (name === 'sprintToggle' && down) locked = !locked;
    });
    render(<TouchControls inputRef={{ current: input }} actions={{ pressButton }} abilities={{}} />);
    const btn = screen.getByRole('button', { name: 'Koşmayı kilitle' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TouchControls: üst çubuk', () => {
  it('duraklat / envanter / üret / harita / kamera eylemleri çağırır', () => {
    const { actions } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Duraklat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Envanter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Üret' }));
    fireEvent.click(screen.getByRole('button', { name: 'Harita' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kamera' }));
    expect(actions.pause).toHaveBeenCalledTimes(1);
    expect(actions.openInventory).toHaveBeenCalledTimes(1);
    expect(actions.openCrafting).toHaveBeenCalledTimes(1);
    expect(actions.openMap).toHaveBeenCalledTimes(1);
    expect(actions.toggleCamera).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Günlük' })).toBeNull();
  });

  it('günlük düğmesi yalnız openJournal varsa; eylem yoksa input düğmesine düşer', () => {
    const openJournal = vi.fn();
    const pressButton = vi.fn();
    render(<TouchControls actions={{ openJournal, pressButton }} abilities={{}} cameraMode="tp" />);
    fireEvent.click(screen.getByRole('button', { name: 'Günlük' }));
    expect(openJournal).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Envanter' }));
    expect(pressButton.mock.calls.slice(-2)).toEqual([
      ['inventory', true],
      ['inventory', false],
    ]);
    expect(screen.getByRole('button', { name: 'Kamera' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TouchControls: yüzen joystick görseli', () => {
  it('rAF ile input.getJoystickView okunur, dönüşümler DOM düğümlerine yazılır', () => {
    const cbs = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      cbs.push(cb);
      return cbs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const view = { active: false, baseX: 0, baseY: 0, knobX: 0, knobY: 0, radius: 56, sprint: false };
    const input = { getJoystickView: () => view };
    const { container } = render(<TouchControls inputRef={{ current: input }} actions={{ pressButton: () => {} }} abilities={{}} />);
    const joy = container.querySelector('.kx-joy');
    const base = container.querySelector('.kx-joy-base');
    const knob = container.querySelector('.kx-joy-knob');
    const tick = () => {
      const run = cbs.splice(0);
      act(() => run.forEach((cb) => cb(0)));
    };
    tick();
    expect(joy).toHaveAttribute('data-active', '0');

    Object.assign(view, { active: true, baseX: 120, baseY: 240, knobX: 150, knobY: 220, radius: 60 });
    tick();
    expect(joy).toHaveAttribute('data-active', '1');
    expect(base.style.transform).toBe('translate3d(120px,240px,0)');
    expect(knob.style.transform).toBe('translate3d(150px,220px,0)');
    expect(base.style.width).toBe('120px');

    Object.assign(view, { knobX: 170, knobY: 200, sprint: true });
    tick();
    expect(joy).toHaveAttribute('data-sprint', '1');
    expect(knob.style.transform).toBe('translate3d(170px,200px,0)');

    Object.assign(view, { active: false, sprint: false });
    tick();
    expect(joy).toHaveAttribute('data-active', '0');
    // Kendiliğinden açılan kontrol ipucu balonu yoktur (kontroller Duraklat > Ayarlar > Nasıl Oynanır'da).
    expect(container.querySelector('.kx-coach')).toBeNull();
  });

  it('ilk açılışta da bekleme sırasında da kendiliğinden kontrol ipucu balonu çıkmaz', () => {
    vi.useFakeTimers();
    try {
      localStorage.clear();
    } catch {
      // yut
    }
    const { container } = setup();
    expect(container.querySelector('.kx-coach')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(container.querySelector('.kx-coach')).toBeNull();
    expect(container.textContent).not.toMatch(/Sol yarıda sürükle/);
  });
});
