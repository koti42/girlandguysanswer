// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import TouchDriveControls from '../city/TouchDriveControls.jsx';
import { createVehicleInput } from '../../../../game/kesif/inputVehicle.js';
import { MIN_TARGET } from '../city/vehicleHudUtils.js';

const DT = 1 / 60;
const VEH = {
  cls: 'taksi', kmh: 40, gear: 2, nitro: 0.5, drift: false,
};

/** pointer olayı: jsdom'da PointerEvent yoksa Event + özellikler */
function pe(el, type, props) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, {
    pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: 0, clientY: 0, button: 0, ...props,
  });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}

function rect(el, r) {
  el.getBoundingClientRect = () => ({
    left: r.left, top: r.top, width: r.width, height: r.height, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top,
  });
}

function setup(props) {
  const ctl = createVehicleInput({ isTouch: () => true });
  ctl.setActive(true);
  const input = {
    vehicle: ctl,
    pressButton: vi.fn((n, d) => {
      ctl.press(n, d);
      return true;
    }),
  };
  const actions = { pause: vi.fn(), openMap: vi.fn() };
  const onPrefs = vi.fn();
  const onLeftHanded = vi.fn();
  const utils = render(
    <TouchDriveControls
      inputRef={{ current: input }}
      cls={VEH.cls}
      actions={actions}
      settings={{ leftHanded: false }}
      prefs={{ steerMode: 'wheel', autoThrottle: false, laneAssist: 'auto' }}
      onPrefs={onPrefs}
      onLeftHanded={onLeftHanded}
      {...props}
    />
  );
  const tick = (n = 1) => {
    let o = null;
    for (let i = 0; i < n; i++) o = ctl.update(DT, {}, null);
    return o;
  };
  return {
    ctl, input, actions, onPrefs, onLeftHanded, tick, ...utils,
  };
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
});

describe('TouchDriveControls: direksiyon eşlemesi ve geri yay', () => {
  it('tekerleği parmakla sağa çevirmek steer > 0; bırakınca 6/sn geri yay; sola negatif', () => {
    const { ctl, tick } = setup();
    const steer = screen.getByTestId('drive-steer');
    rect(steer, { left: 0, top: 200, width: 150, height: 150 });
    // merkez (75,275), yarıçap 75; üstten (75,215) tut → sağa (140,275)
    pe(steer, 'pointerdown', { pointerId: 3, clientX: 75, clientY: 215 });
    expect(ctl.wheel.state.active).toBe(true);
    pe(steer, 'pointermove', { pointerId: 3, clientX: 140, clientY: 275 });
    const o = tick();
    expect(o.steer).toBeGreaterThan(0.5);
    pe(steer, 'pointerup', { pointerId: 3 });
    expect(ctl.wheel.state.active).toBe(false);
    const a0 = Math.abs(ctl.wheel.state.angle);
    tick(6);
    expect(Math.abs(ctl.wheel.state.angle)).toBeCloseTo(a0 * Math.exp(-6 * 0.1), 3);
    tick(90);
    expect(tick().steer).toBe(0);
    // sola
    pe(steer, 'pointerdown', { pointerId: 4, clientX: 75, clientY: 215 });
    pe(steer, 'pointermove', { pointerId: 4, clientX: 10, clientY: 275 });
    expect(tick().steer).toBeLessThan(-0.5);
  });

  it('kaydırıcı kipi: ilk dokunuş sıfır, yatay sapma steer', () => {
    const { ctl, tick } = setup({ prefs: { steerMode: 'slider', autoThrottle: false, laneAssist: 'auto' } });
    expect(ctl.getOptions().steerMode).toBe('slider');
    const steer = screen.getByTestId('drive-steer');
    expect(steer).toHaveAttribute('aria-label', 'Direksiyon kaydırıcısı');
    rect(steer, { left: 0, top: 250, width: 230, height: 100 });
    pe(steer, 'pointerdown', { pointerId: 1, clientX: 115, clientY: 300 });
    expect(tick().steer).toBe(0);
    pe(steer, 'pointermove', { pointerId: 1, clientX: 230, clientY: 300 });
    expect(tick().steer).toBeCloseTo(1, 1);
    pe(steer, 'pointerup', { pointerId: 1 });
    tick(90);
    expect(tick().steer).toBe(0);
  });

  it('klavye/anahtar erişimi: ← → direksiyonu çevirir (slider rolü)', () => {
    const { ctl, tick } = setup();
    const steer = screen.getByTestId('drive-steer');
    expect(steer).toHaveAttribute('role', 'slider');
    act(() => {
      steer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(ctl.wheel.state.angle).toBeGreaterThan(0);
    expect(tick().steer).toBeGreaterThan(0);
    act(() => {
      steer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
      steer.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    });
    expect(ctl.wheel.state.angle).toBeLessThan(0);
  });
});

describe('TouchDriveControls: pedallar ve düğmeler', () => {
  it('gaz pedalı dikey konumla analog (üst 1.0, alt 0.6); fren; bırakınca 0', () => {
    const { ctl, tick } = setup();
    const gas = screen.getByTestId('drive-gas');
    const brake = screen.getByTestId('drive-brake');
    rect(gas, { left: 700, top: 200, width: 96, height: 100 });
    rect(brake, { left: 620, top: 220, width: 72, height: 80 });
    pe(gas, 'pointerdown', { pointerId: 5, clientX: 740, clientY: 300 }); // en alt
    expect(tick().throttle).toBeCloseTo(0.6, 5);
    pe(gas, 'pointermove', { pointerId: 5, clientX: 740, clientY: 250 }); // orta
    expect(tick().throttle).toBeCloseTo(0.8, 5);
    pe(gas, 'pointermove', { pointerId: 5, clientX: 740, clientY: 200 }); // üst
    expect(tick().throttle).toBeCloseTo(1, 5);
    pe(brake, 'pointerdown', { pointerId: 6, clientX: 650, clientY: 220 });
    const o = tick();
    expect(o.brake).toBeCloseTo(1, 5);
    expect(o.throttle).toBeCloseTo(1, 5);
    pe(gas, 'pointerup', { pointerId: 5 });
    pe(brake, 'pointerup', { pointerId: 6 });
    const z = tick();
    expect(z.throttle).toBe(0);
    expect(z.brake).toBe(0);
    expect(ctl.gas.state.active).toBe(false);
  });

  it('çoklu dokunma yalıtımı: direksiyon + gaz + nitro aynı anda; birinin iptali ötekileri bırakmaz', () => {
    const { ctl, tick } = setup();
    const steer = screen.getByTestId('drive-steer');
    const gas = screen.getByTestId('drive-gas');
    const nitro = screen.getByTestId('drive-vnitro');
    rect(steer, { left: 0, top: 200, width: 150, height: 150 });
    rect(gas, { left: 700, top: 200, width: 96, height: 100 });
    pe(steer, 'pointerdown', { pointerId: 10, clientX: 75, clientY: 215 });
    pe(steer, 'pointermove', { pointerId: 10, clientX: 140, clientY: 275 });
    pe(gas, 'pointerdown', { pointerId: 11, clientX: 740, clientY: 200 });
    pe(nitro, 'pointerdown', { pointerId: 12 });
    let o = tick();
    expect(o.steer).toBeGreaterThan(0.4);
    expect(o.throttle).toBe(1);
    expect(o.nitro).toBe(true);
    // gazın iptali yalnız gazı bırakır
    pe(gas, 'pointercancel', { pointerId: 11 });
    o = tick();
    expect(o.throttle).toBe(0);
    expect(o.nitro).toBe(true);
    expect(ctl.wheel.state.active).toBe(true);
    // direksiyonu başka bir parmak ele geçiremez
    pe(steer, 'pointerdown', { pointerId: 13, clientX: 75, clientY: 215 });
    pe(steer, 'pointermove', { pointerId: 13, clientX: 10, clientY: 275 });
    expect(tick().steer).toBeGreaterThan(0.3);
    pe(nitro, 'pointerup', { pointerId: 12 });
    expect(tick().nitro).toBe(false);
  });

  it('pointercancel ve lostpointercapture her denetimi bırakır (takılı girdi yok)', () => {
    const { ctl, tick } = setup();
    const steer = screen.getByTestId('drive-steer');
    const brake = screen.getByTestId('drive-brake');
    const hand = screen.getByTestId('drive-vhandbrake');
    rect(steer, { left: 0, top: 200, width: 150, height: 150 });
    rect(brake, { left: 620, top: 220, width: 72, height: 80 });
    pe(steer, 'pointerdown', { pointerId: 20, clientX: 75, clientY: 215 });
    pe(brake, 'pointerdown', { pointerId: 21, clientX: 650, clientY: 230 });
    pe(hand, 'pointerdown', { pointerId: 22 });
    expect(tick().handbrake).toBe(true);
    pe(steer, 'pointercancel', { pointerId: 20 });
    pe(brake, 'lostpointercapture', { pointerId: 21 });
    pe(hand, 'pointercancel', { pointerId: 22 });
    expect(ctl.wheel.state.active).toBe(false);
    expect(ctl.brake.state.active).toBe(false);
    const o = tick();
    expect(o.brake).toBe(0);
    expect(o.handbrake).toBe(false);
  });

  it('düğmeler: nitro/el freni basılı tutulur; kamera/korna/yola/in dokunuş; Süzülkay\'da el freni "Zıpla"', () => {
    const { input, ctl, tick } = setup();
    pe(screen.getByTestId('drive-vhandbrake'), 'pointerdown', { pointerId: 30 });
    expect(input.pressButton).toHaveBeenLastCalledWith('vhandbrake', true);
    expect(tick().hop).toBe(true);
    pe(screen.getByTestId('drive-vhandbrake'), 'pointerup', { pointerId: 30 });
    expect(input.pressButton).toHaveBeenLastCalledWith('vhandbrake', false);
    pe(screen.getByTestId('drive-vcamera'), 'pointerdown', { pointerId: 31 });
    expect(ctl.out.cameraPressed).toBe(true);
    pe(screen.getByTestId('drive-vhorn'), 'pointerdown', { pointerId: 32 });
    expect(ctl.out.hornPressed).toBe(true);
    pe(screen.getByTestId('drive-vreset'), 'pointerdown', { pointerId: 33 });
    expect(ctl.out.resetPressed).toBe(true);
    pe(screen.getByTestId('drive-interact'), 'pointerdown', { pointerId: 34 });
    expect(input.pressButton).toHaveBeenLastCalledWith('interact', true);
  });

  it('Süzülkay: el freni düğmesi "Zıpla" etiketli', () => {
    setup({ cls: 'suzulkay' });
    expect(screen.getByRole('button', { name: 'Zıpla' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'El freni' })).toBeNull();
  });

  it('klavyeyle (Enter/Boşluk) basılı tutulan pedal ve düğme', () => {
    const { ctl, tick } = setup();
    const gas = screen.getByTestId('drive-gas');
    act(() => {
      gas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(tick().throttle).toBe(1);
    act(() => {
      gas.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(tick().throttle).toBe(0);
    expect(ctl.gas.state.active).toBe(false);
  });

  it('üst düğmeler: Duraklat ve Harita eylemleri çağırır', () => {
    const { actions } = setup();
    act(() => screen.getByTestId('drive-pause-btn').click());
    act(() => screen.getByTestId('drive-map-btn').click());
    expect(actions.pause).toHaveBeenCalledTimes(1);
    expect(actions.openMap).toHaveBeenCalledTimes(1);
  });

  it('söküldüğünde her şey bırakılır', () => {
    const { ctl, tick, unmount } = setup();
    const gas = screen.getByTestId('drive-gas');
    rect(gas, { left: 700, top: 200, width: 96, height: 100 });
    pe(gas, 'pointerdown', { pointerId: 40, clientX: 740, clientY: 200 });
    pe(screen.getByTestId('drive-vnitro'), 'pointerdown', { pointerId: 41 });
    expect(tick().nitro).toBe(true);
    unmount();
    expect(ctl.gas.state.active).toBe(false);
    expect(tick().nitro).toBe(false);
    expect(tick().throttle).toBe(0);
  });
});

describe('TouchDriveControls: boyut, erişilebilirlik, ayarlar', () => {
  it('tüm etkileşimli öğeler ≥ 44 px (satır içi ölçü) ve veri-no-tap işaretli', () => {
    setup();
    const root = screen.getByTestId('drive-controls');
    const items = root.querySelectorAll('button, [role="slider"]');
    expect(items.length).toBeGreaterThanOrEqual(11);
    items.forEach((el) => {
      const w = parseFloat(el.style.width);
      const h = parseFloat(el.style.height);
      expect(w, el.getAttribute('aria-label')).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(h, el.getAttribute('aria-label')).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(el.hasAttribute('data-no-tap'), el.getAttribute('aria-label')).toBe(true);
    });
    // şartname: gaz 96, fren 72, nitro 64, el freni 56 (taban)
    expect(parseFloat(screen.getByTestId('drive-gas').style.width)).toBeGreaterThanOrEqual(96);
    expect(parseFloat(screen.getByTestId('drive-brake').style.width)).toBeGreaterThanOrEqual(72);
    expect(parseFloat(screen.getByTestId('drive-vnitro').style.width)).toBeGreaterThanOrEqual(64);
    expect(parseFloat(screen.getByTestId('drive-vhandbrake').style.width)).toBeGreaterThanOrEqual(56);
  });

  it('her düğmenin Türkçe adı (aria-label) var', () => {
    setup();
    ['İn', 'Yola', 'Korna', 'Kamera', 'Harita', 'Duraklat', 'Sürüş ayarları', 'Gaz', 'Fren / Geri', 'Nitro', 'El freni', 'Direksiyon'].forEach((n) => {
      expect(screen.getByRole(n === 'Direksiyon' ? 'slider' : 'button', { name: n }), n).toBeInTheDocument();
    });
    expect(screen.getByRole('toolbar', { name: 'Sürüş düğmeleri' })).toBeInTheDocument();
  });

  it('sol elli: yerleşim aynalanır (data-left); ayarlar kutusu tercihleri ve sol eli bildirir', () => {
    const { onPrefs, onLeftHanded, rerender, ctl } = setup({ settings: { leftHanded: true } });
    expect(screen.getByTestId('drive-controls')).toHaveAttribute('data-left', '1');
    act(() => screen.getByTestId('drive-options-btn').click());
    expect(screen.getByRole('group', { name: 'Sürüş ayarları', hidden: false })).toBeInTheDocument();
    act(() => screen.getByTestId('opt-steerMode-slider').click());
    expect(onPrefs).toHaveBeenLastCalledWith({ steerMode: 'slider' });
    act(() => screen.getByTestId('opt-autoThrottle').click());
    expect(onPrefs).toHaveBeenLastCalledWith({ autoThrottle: true });
    act(() => screen.getByTestId('opt-laneAssist-off').click());
    expect(onPrefs).toHaveBeenLastCalledWith({ laneAssist: 'off' });
    act(() => screen.getByTestId('opt-leftHanded').click());
    expect(onLeftHanded).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('opt-steerMode-wheel')).toHaveAttribute('aria-pressed', 'true');
    // tercihler denetleyiciye uygulanır
    rerender(
      <TouchDriveControls
        inputRef={{ current: { vehicle: ctl, pressButton: () => true } }}
        cls={VEH.cls}
        actions={{}}
        settings={{ leftHanded: false }}
        prefs={{ steerMode: 'slider', autoThrottle: true, laneAssist: 'off' }}
      />
    );
    expect(ctl.getOptions()).toEqual({ autoThrottle: true, laneAssist: false, steerMode: 'slider' });
    expect(screen.getByTestId('drive-controls')).toHaveAttribute('data-left', '0');
    // Esc kutuyu kapatır
    const box = screen.getByTestId('drive-options');
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(screen.queryByTestId('drive-options')).toBeNull();
  });

  it('otomatik gaz tercihi gaz tabanını %70 yapar', () => {
    const { tick } = setup({ prefs: { steerMode: 'wheel', autoThrottle: true, laneAssist: 'auto' } });
    expect(tick().throttle).toBeCloseTo(0.7, 5);
  });

  it('dikey ve yatay: data-portrait, ölçü yedeği (jsdom 0 boyut) çökmez', () => {
    setup();
    expect(screen.getByTestId('drive-controls')).toHaveAttribute('data-portrait', '0');
  });

  it('girdi denetleyicisi yoksa (motor hazır değil) çökmez ve işaretçi olayları sessizce yutulur', () => {
    render(<TouchDriveControls inputRef={{ current: null }} cls={VEH.cls} actions={{}} settings={{}} prefs={null} />);
    const steer = screen.getByTestId('drive-steer');
    pe(steer, 'pointerdown', { pointerId: 1, clientX: 5, clientY: 5 });
    pe(steer, 'pointermove', { pointerId: 1, clientX: 15, clientY: 5 });
    pe(steer, 'pointerup', { pointerId: 1 });
    pe(screen.getByTestId('drive-gas'), 'pointerdown', { pointerId: 2, clientX: 5, clientY: 5 });
    pe(screen.getByTestId('drive-vnitro'), 'pointerdown', { pointerId: 3 });
    expect(screen.getByTestId('drive-controls')).toBeInTheDocument();
  });

  it('NaN koordinatlar steer\'ı bozmaz', () => {
    const { ctl, tick } = setup();
    const steer = screen.getByTestId('drive-steer');
    rect(steer, { left: 0, top: 200, width: 150, height: 150 });
    pe(steer, 'pointerdown', { pointerId: 1, clientX: NaN, clientY: NaN });
    pe(steer, 'pointermove', { pointerId: 1, clientX: NaN, clientY: Infinity });
    const o = tick();
    expect(Number.isFinite(o.steer)).toBe(true);
    expect(Math.abs(o.steer)).toBeLessThanOrEqual(1);
    expect(Number.isFinite(ctl.wheel.state.angle)).toBe(true);
  });
});
