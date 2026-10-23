// @vitest-environment jsdom
/*
 * Sürüş HUD'u (vehicle_ui): hız göstergesi, radyo çipi, mini harita bileşeni, VehicleHud kapsayıcısı ve KesifHud entegrasyonu.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import SpeedoGauge from '../city/SpeedoGauge.jsx';
import RadioChip from '../city/RadioChip.jsx';
import CityMinimap from '../city/CityMinimap.jsx';
import VehicleHud from '../city/VehicleHud.jsx';
import KesifHud from '../KesifHud.jsx';
import { createHudStore, sanitizeHud } from '../../../../game/kesif/hudStore.js';
import { createVehicleInput } from '../../../../game/kesif/inputVehicle.js';
import { dimSeed } from '../../../../game/kesif/sim/dim/dimensions.js';

const V = (o) => ({
  cls: 'taksi', kmh: 62, gear: 3, nitro: 0.5, drift: false, camera: 0, ...o,
});

/** 2B bağlam kaydedici: jsdom canvas getContext uygulamaz */
const ctxLog = { calls: {}, texts: [] };
function recordingCtx() {
  return new Proxy({}, {
    get(_t, name) {
      return (...a) => {
        ctxLog.calls[name] = (ctxLog.calls[name] || 0) + 1;
        if (name === 'fillText') ctxLog.texts.push(a[0]);
      };
    },
    set() {
      return true;
    },
  });
}
let getContextSpy = null;

beforeEach(() => {
  ctxLog.calls = {};
  ctxLog.texts = [];
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => recordingCtx());
  try {
    localStorage.clear();
    localStorage.setItem('kesif.hintSeen.v1', '1');
  } catch {
    // yok say
  }
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (getContextSpy) getContextSpy.mockRestore();
});

describe('SpeedoGauge', () => {
  it('araç yoksa hiçbir şey çizmez; varken km/sa, vites ve nitro gösterir', () => {
    const { container, rerender } = render(<SpeedoGauge vehicle={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SpeedoGauge vehicle={V()} />);
    expect(screen.getByTestId('gauge-kmh')).toHaveTextContent('62');
    expect(screen.getByTestId('gauge-gear')).toHaveTextContent('3');
    const nitro = screen.getByRole('meter', { name: 'Nitro' });
    expect(nitro).toHaveAttribute('aria-valuenow', '50');
    expect(nitro).toHaveAttribute('aria-valuemin', '0');
    expect(nitro).toHaveAttribute('aria-valuemax', '100');
    expect(nitro.querySelectorAll('u[data-lit="1"]')).toHaveLength(5);
    expect(nitro.querySelectorAll('u')).toHaveLength(10);
  });

  it('aria: role=img "Hız N kilometre saat"; etiket ≤ 0.5 Hz güncellenir (sürekli okunmaz)', () => {
    vi.useFakeTimers();
    const { rerender } = render(<SpeedoGauge vehicle={V({ kmh: 40 })} />);
    const el = screen.getByRole('img', { name: 'Hız 40 kilometre saat' });
    expect(el).toBeInTheDocument();
    for (let k = 41; k <= 60; k += 1) {
      rerender(<SpeedoGauge vehicle={V({ kmh: k })} />);
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    // 1 sn geçti: görsel sayı güncel, okunan etiket eski
    expect(screen.getByTestId('gauge-kmh')).toHaveTextContent('60');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Hız 40 kilometre saat');
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Hız 60 kilometre saat');
  });

  it('vites etiketleri: geri R (simgeli), boş N, hover H; kayma ve yükleniyor bayrakları metinli', () => {
    const { rerender } = render(<SpeedoGauge vehicle={V({ gear: -1, kmh: 5 })} />);
    expect(screen.getByTestId('gauge-gear')).toHaveTextContent('R');
    expect(screen.getByTestId('gauge-gear')).toHaveAttribute('data-reverse', '1');
    rerender(<SpeedoGauge vehicle={V({ gear: 0, kmh: 0 })} />);
    expect(screen.getByTestId('gauge-gear')).toHaveTextContent('N');
    rerender(<SpeedoGauge vehicle={V({ cls: 'hoverbike', gear: 1 })} />);
    expect(screen.getByTestId('gauge-gear')).toHaveTextContent('H');
    expect(screen.queryByTestId('gauge-drift')).toBeNull();
    rerender(<SpeedoGauge vehicle={V({ drift: true, slow: true, boost: true })} />);
    expect(screen.getByTestId('gauge-drift')).toHaveTextContent('KAYMA');
    expect(screen.getByTestId('gauge-slow')).toHaveTextContent('YÜKLENİYOR');
    expect(screen.getByTestId('gauge')).toHaveAttribute('data-boost', '1');
    expect(screen.getByTestId('gauge-nitro')).toHaveTextContent('NİTRO');
  });

  it('yay oranı hıza göre; her sınıf için ölçek çizilir; bozuk değerler çökertmez', () => {
    const { container, rerender } = render(<SpeedoGauge vehicle={V({ kmh: 0 })} />);
    const val = () => container.querySelector('.kv-arc-value').getAttribute('stroke-dasharray');
    expect(val()).toBe('0.00 100');
    rerender(<SpeedoGauge vehicle={V({ kmh: 400 })} />);
    expect(val()).toBe('100.00 100');
    ['taksi', 'spor', 'kamyonet', 'motor', 'hoverbike', 'suzulkay'].forEach((cls) => {
      rerender(<SpeedoGauge vehicle={V({ cls, kmh: 50 })} />);
      expect(Number(val().split(' ')[0])).toBeGreaterThan(0);
    });
    rerender(<SpeedoGauge vehicle={{ cls: 'taksi', kmh: undefined, gear: undefined, nitro: 0 }} />);
    expect(container.querySelector('.kv-gauge')).toBeInTheDocument();
  });

  it('hareket azaltma: data-calm', () => {
    render(<SpeedoGauge vehicle={V()} reducedMotion />);
    expect(screen.getByTestId('gauge')).toHaveAttribute('data-calm', '1');
  });
});

describe('RadioChip', () => {
  const mkApi = (over) => {
    let idx = 0;
    const names = ['Neon FM 88.8', 'Gece Taksisi', 'Sessiz'];
    const info = () => ({
      name: names[idx], silent: names[idx] === 'Sessiz', title: names[idx] === 'Sessiz' ? '' : 'Parlak Rota', artist: 'Mor Dalga', ticker: 'x',
    });
    return {
      getVehicleRadio: vi.fn(info),
      nextRadioStation: vi.fn(() => { idx = (idx + 1) % 3; }),
      prevRadioStation: vi.fn(() => { idx = (idx + 2) % 3; }),
      ...over,
    };
  };

  it('istasyon adı ve parça; dokun = sonraki; ◂ önceki; yalnız değişimde duyurulur', () => {
    const api = mkApi();
    render(<RadioChip api={api} />);
    expect(screen.getByRole('group', { name: 'Radyo' })).toBeInTheDocument();
    expect(screen.getByText('Neon FM 88.8')).toBeInTheDocument();
    expect(screen.getByText(/Parlak Rota/)).toBeInTheDocument();
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('');
    act(() => screen.getByTestId('radio-next').click());
    expect(api.nextRadioStation).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Gece Taksisi')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Radyo: Gece Taksisi.');
    act(() => screen.getByTestId('radio-prev').click());
    expect(api.prevRadioStation).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Neon FM 88.8')).toBeInTheDocument();
    act(() => screen.getByTestId('radio-prev').click());
    expect(screen.getByRole('status')).toHaveTextContent('Radyo kapalı.');
    expect(screen.getByTestId('radio-chip')).toHaveAttribute('data-silent', '1');
    expect(screen.getByText('Radyo kapalı')).toBeInTheDocument();
  });

  it('tüm düğmeler ≥ 44 px (CSS min boyut sınıfı) ve Türkçe adlı', () => {
    render(<RadioChip api={mkApi()} />);
    ['Önceki istasyon', 'Sonraki istasyon'].forEach((n) => expect(screen.getByRole('button', { name: n })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Radyo: Neon FM 88.8/ })).toBeInTheDocument();
  });

  it('api yoksa/başarısızsa yedek ad (hud.city.radio); ad yoksa hiçbir şey çizmez; api hatası çökertmez', () => {
    const { container, rerender } = render(<RadioChip api={null} name="" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RadioChip api={null} name="Hız Hattı" />);
    expect(screen.getByText('Hız Hattı')).toBeInTheDocument();
    rerender(<RadioChip api={{ getVehicleRadio: () => { throw new Error('x'); } }} name="Sessiz" />);
    expect(screen.getByTestId('radio-chip')).toHaveAttribute('data-silent', '1');
    act(() => screen.getByTestId('radio-next').click()); // nextRadioStation yok: sessizce geçer
  });

  it('~1 Hz yoklar; sekme gizliyken yoklamaz', () => {
    vi.useFakeTimers();
    const api = mkApi();
    render(<RadioChip api={api} />);
    const n0 = api.getVehicleRadio.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(api.getVehicleRadio.mock.calls.length - n0).toBe(3);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(api.getVehicleRadio.mock.calls.length - n0).toBe(3);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
});

describe('CityMinimap bileşeni', () => {
  it('role=img + Türkçe etiket; hedef uzaklığı ≤ ~1.5 sn aralıkla etikete girer; canvas boyutu', () => {
    vi.useFakeTimers();
    const api = {
      getDriveInfo: () => ({ x: 0, z: 0, yaw: 0, seed: 1, speed: 5 }),
      getTrafficDots: () => ({ count: 0, xz: new Float32Array(0) }),
      getDriveMarker: () => ({ x: 0, z: -300, label: 'Teslimat' }),
    };
    const { container } = render(<CityMinimap api={api} size={112} />);
    const el = screen.getByTestId('drive-map');
    expect(el).toHaveAttribute('role', 'img');
    expect(el).toHaveAttribute('aria-label', expect.stringContaining('Mini harita'));
    expect(el.style.width).toBe('112px');
    expect(container.querySelector('canvas')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('drive-map')).toBeInTheDocument();
  });

  it('gerçek çizim döngüsü: ~20 Hz poz okur, harita/araç/kuzey çizer, hedef uzaklığı etikete girer', async () => {
    const info = vi.fn(() => ({ x: 0, z: 0, yaw: 0.3, seed: dimSeed(777, 'neon'), speed: 12 }));
    const api = {
      getDriveInfo: info,
      getTrafficDots: () => ({ count: 1, xz: new Float32Array([10, 10]) }),
      getDriveMarker: () => ({ x: 0, z: -300, label: 'Teslimat' }),
    };
    render(<CityMinimap api={api} size={140} />);
    await waitFor(() => expect(ctxLog.calls.clip).toBeGreaterThanOrEqual(2));
    expect(ctxLog.texts).toContain('K');
    expect(ctxLog.calls.stroke).toBeGreaterThan(4);
    // yoklama hızı: 50 ms aralık (≤ 20 Hz)
    const n0 = info.mock.calls.length;
    await new Promise((r) => setTimeout(r, 400));
    expect(info.mock.calls.length - n0).toBeLessThanOrEqual(10);
    await waitFor(() => expect(screen.getByTestId('drive-map').getAttribute('aria-label')).toMatch(/Hedef Teslimat: 300 metre/), { timeout: 4000 });
  });

  it('duraklatılmışken çizim ve yoklama yok; sekme gizliyken çizim yok', async () => {
    const info = vi.fn(() => ({ x: 0, z: 0, yaw: 0, seed: dimSeed(777, 'neon'), speed: 0 }));
    const { rerender } = render(<CityMinimap api={{ getDriveInfo: info }} size={140} paused />);
    await new Promise((r) => setTimeout(r, 200));
    expect(info).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    rerender(<CityMinimap api={{ getDriveInfo: info }} size={140} paused={false} />);
    await new Promise((r) => setTimeout(r, 250));
    expect(info).not.toHaveBeenCalled();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    await waitFor(() => expect(info).toHaveBeenCalled());
  });

  it('bozuk motor verisi (NaN poz, hata fırlatan api) çökertmez', async () => {
    const api = { getDriveInfo: () => ({ x: NaN, z: 0, yaw: 0, seed: 1, speed: 0 }) };
    render(<CityMinimap api={api} size={140} />);
    await new Promise((r) => setTimeout(r, 150));
    cleanup();
    render(<CityMinimap api={{ getDriveInfo: () => { throw new Error('x'); } }} size={140} />);
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.getByTestId('drive-map')).toBeInTheDocument();
  });

  it('onOpen verilirse düğme olur ve büyük haritayı açar', () => {
    const onOpen = vi.fn();
    render(<CityMinimap api={null} onOpen={onOpen} />);
    const b = screen.getByRole('button', { name: /Büyük haritayı açmak için dokun/ });
    act(() => b.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

describe('VehicleHud', () => {
  const mkHud = (extra) => sanitizeHud({
    dim: 'neon', ui: 'none', vehicle: V(), city: { kredi: 100, radio: 'Neon FM 88.8' }, ...extra,
  });
  const api = {
    getDriveInfo: () => null, getVehicleRadio: () => ({ name: 'Neon FM 88.8', silent: false, title: 'Parlak Rota', artist: 'Mor Dalga' }), nextRadioStation: vi.fn(), prevRadioStation: vi.fn(),
  };

  it('araç yokken yalnız ekran okuyucu bölgesi; binince "Araca bindin" ve inince "Araçtan indin" duyurulur', () => {
    const noCar = mkHud({ vehicle: null });
    const { rerender } = render(<VehicleHud hud={noCar} api={api} inputRef={{ current: null }} actions={{}} touch={false} settings={{}} />);
    expect(screen.queryByTestId('vehicle-hud')).toBeNull();
    expect(screen.getByTestId('vehicle-live')).toHaveTextContent('');
    rerender(<VehicleHud hud={mkHud()} api={api} inputRef={{ current: null }} actions={{}} touch={false} settings={{}} />);
    expect(screen.getByTestId('vehicle-hud')).toBeInTheDocument();
    expect(screen.getByTestId('vehicle-live')).toHaveTextContent('Araca bindin: Meridyen Taksi.');
    rerender(<VehicleHud hud={mkHud({ vehicle: V({ kmh: 80 }) })} api={api} inputRef={{ current: null }} actions={{}} touch={false} settings={{}} />);
    expect(screen.getByTestId('vehicle-live')).toHaveTextContent('Araca bindin');
    rerender(<VehicleHud hud={mkHud({ vehicle: null })} api={api} inputRef={{ current: null }} actions={{}} touch={false} settings={{}} />);
    expect(screen.getByTestId('vehicle-live')).toHaveTextContent('Araçtan indin.');
    expect(screen.queryByTestId('vehicle-hud')).toBeNull();
  });

  it('masaüstü: göstergeler + tuş ipuçları (14 sn sonra kaybolur); dokunmatik denetim yok', () => {
    vi.useFakeTimers();
    render(<VehicleHud hud={mkHud()} api={api} inputRef={{ current: null }} actions={{}} touch={false} settings={{}} />);
    expect(screen.getByTestId('gauge')).toBeInTheDocument();
    expect(screen.getByTestId('radio-chip')).toBeInTheDocument();
    expect(screen.getByTestId('drive-map')).toBeInTheDocument();
    expect(screen.getByTestId('drive-keys')).toHaveTextContent('el freni');
    expect(screen.getByTestId('drive-keys')).toHaveTextContent('1–6');
    expect(screen.queryByTestId('drive-controls')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(screen.queryByTestId('drive-keys')).toBeNull();
  });

  it('dokunmatik: sürüş denetimleri çizilir, tuş ipucu yok, sol elli ayarı yansır; kiralık sayacı ve süre uyarısı', () => {
    const ctl = createVehicleInput({ isTouch: () => true });
    ctl.setActive(true);
    const inputRef = { current: { vehicle: ctl, pressButton: vi.fn() } };
    const { rerender } = render(<VehicleHud hud={mkHud({ vehicle: V({ rent: 300 }) })} api={api} inputRef={inputRef} actions={{}} touch settings={{ leftHanded: true }} />);
    expect(screen.getByTestId('drive-controls')).toBeInTheDocument();
    expect(screen.queryByTestId('drive-keys')).toBeNull();
    expect(screen.getByTestId('vehicle-hud')).toHaveAttribute('data-left', '1');
    const rent = screen.getByTestId('rent-chip');
    expect(rent).toHaveTextContent('5:00');
    expect(rent).toHaveAttribute('data-soon', '0');
    expect(rent).toHaveAttribute('aria-label', expect.stringContaining('5:00'));
    rerender(<VehicleHud hud={mkHud({ vehicle: V({ rent: 45 }) })} api={api} inputRef={inputRef} actions={{}} touch settings={{ leftHanded: true }} />);
    expect(screen.getByTestId('rent-chip')).toHaveAttribute('data-soon', '1');
    expect(screen.getByTestId('rent-chip')).toHaveTextContent('Süre doluyor');
    expect(screen.getByTestId('vehicle-live')).toHaveTextContent('dolmak üzere');
  });

  it('sol elli geçişi onSettings ile bildirilir; tercihler localStorage\'a yazılır', () => {
    const ctl = createVehicleInput({ isTouch: () => true });
    ctl.setActive(true);
    const onSettings = vi.fn();
    render(<VehicleHud hud={mkHud()} api={api} inputRef={{ current: { vehicle: ctl, pressButton: vi.fn() } }} actions={{}} touch settings={{}} onSettings={onSettings} />);
    act(() => screen.getByTestId('drive-options-btn').click());
    act(() => screen.getByTestId('opt-leftHanded').click());
    expect(onSettings).toHaveBeenCalledWith({ leftHanded: true });
    act(() => screen.getByTestId('opt-steerMode-slider').click());
    expect(JSON.parse(localStorage.getItem('kesif.drive.v1')).steerMode).toBe('slider');
    expect(ctl.getOptions().steerMode).toBe('slider');
    act(() => screen.getByTestId('opt-autoThrottle').click());
    expect(ctl.getOptions().autoThrottle).toBe(true);
  });

  it('kayıtlı tercihler açılışta okunur (bozuk kayıt varsayılana düşer)', () => {
    localStorage.setItem('kesif.drive.v1', JSON.stringify({ steerMode: 'slider', autoThrottle: true, laneAssist: 'off' }));
    const ctl = createVehicleInput({ isTouch: () => true });
    ctl.setActive(true);
    render(<VehicleHud hud={mkHud()} api={api} inputRef={{ current: { vehicle: ctl, pressButton: vi.fn() } }} actions={{}} touch settings={{}} />);
    expect(ctl.getOptions()).toEqual({ autoThrottle: true, laneAssist: false, steerMode: 'slider' });
    cleanup();
    localStorage.setItem('kesif.drive.v1', '{bozuk');
    const ctl2 = createVehicleInput({ isTouch: () => true });
    ctl2.setActive(true);
    render(<VehicleHud hud={mkHud()} api={api} inputRef={{ current: { vehicle: ctl2, pressButton: vi.fn() } }} actions={{}} touch settings={{}} />);
    expect(ctl2.getOptions().steerMode).toBe('wheel');
  });
});

describe('KesifHud: sürüş entegrasyonu', () => {
  function setup(props, initial) {
    const store = createHudStore();
    store.set({
      hp: 20, maxHp: 20, hunger: 20, dim: 'neon', district: 'Merkez', city: { kredi: 100, radio: 'Neon FM 88.8' }, ...initial,
    });
    const api = { getDriveInfo: () => null, getVehicleRadio: () => ({ name: 'Neon FM 88.8', silent: false, title: '', artist: '' }) };
    const ctl = createVehicleInput({ isTouch: () => true });
    ctl.setActive(true);
    const inputRef = { current: { vehicle: ctl, pressButton: vi.fn(), getTouchLayoutHints: () => null, getJoystickView: () => ({ active: false }) } };
    const utils = render(<KesifHud store={store} actions={{ pressButton: vi.fn(), pause: vi.fn(), openMap: vi.fn() }} driveApi={api} inputRef={inputRef} getMapInfo={() => null} {...props} />);
    return { store, ctl, ...utils };
  }

  it('sürerken kök data-driving=1, yürüme dokunmatik düğmeleri ve eşya çubuğu kalkar (CSS), sürüş denetimleri gelir', () => {
    const { store, container } = setup({ touch: true }, {});
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-driving', '0');
    expect(screen.queryByTestId('vehicle-hud')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kır veya saldır' })).toBeInTheDocument();
    act(() => {
      store.patch({ vehicle: V() });
    });
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-driving', '1');
    expect(screen.getByTestId('vehicle-hud')).toBeInTheDocument();
    expect(screen.getByTestId('drive-controls')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kır veya saldır' })).toBeNull();
    act(() => {
      store.patch({ vehicle: null });
    });
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-driving', '0');
    expect(screen.getByRole('button', { name: 'Kır veya saldır' })).toBeInTheDocument();
    expect(screen.queryByTestId('drive-controls')).toBeNull();
  });

  it('masaüstünde sürerken eski mini harita yerine CityMinimap; ana diyarda sürüş HUD\'u yok', () => {
    const { store, container } = setup({ touch: false }, { vehicle: V() });
    expect(screen.getByTestId('drive-map')).toBeInTheDocument();
    expect(container.querySelector('.kx-minimap:not([data-testid])')).toBeNull();
    act(() => {
      store.patch({ dim: 'overworld', vehicle: V() });
    });
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-driving', '0');
    expect(screen.queryByTestId('vehicle-hud')).toBeNull();
  });

  it('panel açıkken (ui != none) sürüş HUD\'u çizilmez; sürüş ayarları kutusu yürümeyi bozmaz', () => {
    setup({ touch: true }, { vehicle: V(), ui: 'inventory' });
    expect(screen.queryByTestId('vehicle-hud')).toBeNull();
  });

  it('ekran okuyucu bölgesi yerleşim içinde (inert dışı) ve garaj çipi yok', () => {
    const { container } = setup({ touch: false }, { vehicle: V() });
    const layer = container.querySelector('.kx-layer');
    expect(within(layer).getByTestId('vehicle-live')).toBeInTheDocument();
  });
});
