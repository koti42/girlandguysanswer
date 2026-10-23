// @vitest-environment jsdom
/*
 * Neon Meridyen HUD parçaları (cityhud): bölge/saat/hava çipi, ışık ipucu (şekil + metin), boyut kipi çipi, dokunmatik "Boyut kipi" düğmesi,
 * KesifHud entegrasyonu (şehirde InfoChip yerine CityHud), bölge duyurusu (hud.banner) ve aria-live.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import CityHud, { LightHintChip, PortalModeChip } from '../city/CityHud.jsx';
import LightShape from '../city/LightShape.jsx';
import { LIGHT_SHAPES } from '../city/lightShapes.js';
import KesifHud from '../KesifHud.jsx';
import TouchControls from '../TouchControls.jsx';
import ZoneBanner from '../ZoneBanner.jsx';
import { createHudStore, sanitizeHud, HUD_LIGHT_KINDS } from '../../../../game/kesif/hudStore.js';
import { createAnnouncer } from '../kesifAnnouncer.js';
import { districtBannerSpec } from '../../../../game/kesif/sim/city/cityHudData.js';

const CITY = (extra = {}) => sanitizeHud({
  dim: 'neon',
  district: 'Gece Pazarı',
  time: 'gece 00:43',
  weather: 'yağmur',
  coords: { x: 439.2, y: 64, z: 120.4 },
  city: { kredi: 0, district: 'gece_pazari', light: { kind: 'terminal', dist: 12.3, text: 'Terminal' } },
  ...extra,
});

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

describe('CityHud: bölge / saat / hava çipi', () => {
  it('ana diyarda ve geçersiz girdide hiçbir şey çizmez', () => {
    const { container } = render(<CityHud hud={sanitizeHud({ dim: 'overworld', district: 'Merkez' })} />);
    expect(container).toBeEmptyDOMElement();
    expect(render(<CityHud hud={null} />).container).toBeEmptyDOMElement();
    expect(render(<CityHud hud={undefined} />).container).toBeEmptyDOMElement();
  });

  it('şehirde: bölge adı, saat (HH:MM + evre), hava simgesi ve koordinat; konum grubu erişilebilir', () => {
    render(<CityHud hud={CITY()} />);
    const grp = screen.getByRole('group', { name: 'Konum bilgisi' });
    expect(within(grp).getByText('Gece Pazarı')).toBeInTheDocument();
    expect(screen.getByTestId('city-clock')).toHaveTextContent('00:43');
    expect(screen.getByTestId('city-clock')).toHaveTextContent('gece');
    const wx = screen.getByRole('img', { name: 'Yağmur yağıyor' });
    expect(wx).toHaveAttribute('data-wx', 'yağmur');
    expect(wx).toHaveAttribute('title', 'Yağmur yağıyor');
    expect(grp).toHaveTextContent('X 439');
    expect(grp.getAttribute('data-district')).toBe('gece_pazari');
  });

  it('hava: fırtına ve duman ayrı simge/etiket; açıkta simge yok', () => {
    const { rerender } = render(<CityHud hud={CITY({ weather: 'fırtına' })} />);
    expect(screen.getByRole('img', { name: 'Fırtına var' })).toBeInTheDocument();
    rerender(<CityHud hud={CITY({ weather: 'duman' })} />);
    expect(screen.getByRole('img', { name: 'Hava dumanlı' })).toBeInTheDocument();
    rerender(<CityHud hud={CITY({ weather: '' })} />);
    expect(screen.queryByTestId('city-weather')).toBeNull();
    rerender(<CityHud hud={CITY({ weather: 'kar' })} />);
    expect(screen.queryByTestId('city-weather')).toBeNull();
  });

  it('bölge adı yoksa "Neon Meridyen"; saat etiketi bozuksa çökmez', () => {
    render(<CityHud hud={CITY({ district: '', time: '??' })} />);
    expect(screen.getByText('Neon Meridyen')).toBeInTheDocument();
    expect(screen.getByTestId('city-clock')).toHaveTextContent('??');
  });

  it('gündüz/akşam/şafak/gece simgeleri çökmeden çizilir', () => {
    ['gündüz 12:00', 'gün batımı 19:20', 'şafak 06:10', 'gece 23:30'].forEach((t) => {
      const { unmount } = render(<CityHud hud={CITY({ time: t })} />);
      expect(screen.getByTestId('city-clock')).toHaveTextContent(t.split(' ')[1]);
      unmount();
    });
  });
});

describe('LightHintChip: şekil + metin + uzaklık', () => {
  it('terminal: elmas şekli, metin, uzaklık; canlı bölge yalnız ad ("Terminal yakında.")', () => {
    render(<LightHintChip light={{ kind: 'terminal', dist: 12.3, text: 'Terminal' }} />);
    const chip = screen.getByTestId('city-light');
    expect(chip.querySelector('svg')).toHaveAttribute('data-shape', 'elmas');
    expect(chip.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(chip).toHaveTextContent('Terminal');
    expect(chip).toHaveTextContent('12 m');
    expect(within(chip).getByRole('status')).toHaveTextContent('Terminal yakında.');
    // uzaklık sayısı canlı bölgede YOK (gürültü olmaz)
    expect(within(chip).getByRole('status').textContent).not.toMatch(/\d/);
    expect(chip).toHaveAttribute('data-near', '0');
  });

  it('12 blok içinde "yakın" durumu; null ipucunda çizim yok', () => {
    const { rerender } = render(<LightHintChip light={{ kind: 'terminal', dist: 12, text: 'Terminal' }} />);
    expect(screen.getByTestId('city-light')).toHaveAttribute('data-near', '1');
    rerender(<LightHintChip light={null} />);
    expect(screen.queryByTestId('city-light')).toBeNull();
  });

  it('her tür farklı bir şekil çizer (renk körlüğü: şekil + metin); hiçbiri yalnız renkle ayrışmaz', () => {
    const shapes = new Set();
    HUD_LIGHT_KINDS.forEach((k) => {
      const { container, unmount } = render(<LightShape kind={k} />);
      const svg = container.querySelector('svg');
      shapes.add(svg.getAttribute('data-shape'));
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg.querySelector('polygon,circle')).not.toBeNull();
      unmount();
    });
    expect(shapes.size).toBe(HUD_LIGHT_KINDS.length);
    HUD_LIGHT_KINDS.forEach((k) => expect(LIGHT_SHAPES[k]).toBeTruthy());
    // bilinmeyen tür terminal şekline düşer
    const { container } = render(<LightShape kind="bilinmeyen" />);
    expect(container.querySelector('svg')).toHaveAttribute('data-shape', 'elmas');
  });

  it('CityHud ışık ipucunu hud.city.light\'ten çizer; yoksa çizmez', () => {
    const { rerender } = render(<CityHud hud={CITY()} />);
    expect(screen.getByTestId('city-light')).toBeInTheDocument();
    rerender(<CityHud hud={CITY({ city: { kredi: 0, district: 'merkez', light: null } })} />);
    expect(screen.queryByTestId('city-light')).toBeNull();
    rerender(<CityHud hud={CITY({ city: null })} />);
    expect(screen.queryByTestId('city-light')).toBeNull();
    expect(screen.getByTestId('city-chip')).toBeInTheDocument();
  });
});

describe('PortalModeChip: masaüstü anahtar ipucu', () => {
  const portals = (mode, held = true) => sanitizeHud({ portals: { held, mavi: false, turuncu: false, charge: 24, max: 24, cells: 1, canFire: true, next: 'mavi', mode } }).portals;

  it('tabanca yoksa çizilmez', () => {
    expect(render(<PortalModeChip portals={null} dim="overworld" />).container).toBeEmptyDOMElement();
    expect(render(<PortalModeChip portals={portals('normal', false)} dim="overworld" />).container).toBeEmptyDOMElement();
  });

  it('normal kip: "Normal kip" + T tuşu; boyut kipi: "Boyut kipi" + kısa ipucu; aria-label tam cümle', () => {
    const { rerender } = render(<PortalModeChip portals={portals('normal')} dim="overworld" />);
    let chip = screen.getByTestId('portal-mode');
    expect(chip).toHaveAttribute('data-mode', 'normal');
    expect(chip).toHaveTextContent('Normal kip');
    expect(chip.querySelector('kbd')).toHaveTextContent('T');
    expect(chip.getAttribute('aria-label')).toMatch(/Portal Tabancası: Normal kip\. Mavi ve turuncu portal açar\. T: boyut kipi\./);
    rerender(<PortalModeChip portals={portals('boyut')} dim="overworld" />);
    chip = screen.getByTestId('portal-mode');
    expect(chip).toHaveAttribute('data-mode', 'boyut');
    expect(chip).toHaveTextContent('Boyut kipi');
    expect(chip).toHaveTextContent('ateş: kapı açar');
    expect(chip.getAttribute('aria-label')).toMatch(/12 şarj/);
    expect(chip.getAttribute('title')).toMatch(/boyut kapısı/);
    rerender(<PortalModeChip portals={portals('boyut')} dim="neon" />);
    expect(screen.getByTestId('portal-mode')).toHaveTextContent('ateş: eve kapı');
    expect(screen.getByTestId('portal-mode').getAttribute('aria-label')).toMatch(/ana diyara/);
  });
});

describe('KesifHud entegrasyonu', () => {
  const setup = (hud, props = {}) => {
    const store = createHudStore();
    store.set({ hp: 20, maxHp: 20, hunger: 20, hotbar: [{ item: 'item:kazma_demir', count: 1 }], ...hud });
    const ann = createAnnouncer();
    const utils = render(<KesifHud store={store} actions={{ selectHotbar: vi.fn(), pressButton: vi.fn() }} announcer={ann} {...props} />);
    return { store, ann, ...utils };
  };

  it('ana diyarda InfoChip (bölge adı + biyom), CityHud yok', () => {
    setup({ zone: { id: 1, name: 'Zümrüt Vadisi' }, biome: 'Çayır', time: 'gündüz 12:00' });
    expect(screen.getByText('Zümrüt Vadisi')).toBeInTheDocument();
    expect(screen.queryByTestId('city-chip')).toBeNull();
    expect(screen.queryByTestId('portal-mode')).toBeNull();
  });

  it('şehirde InfoChip yerine CityHud (tek "Konum bilgisi" grubu); ana diyar bölge/biyom adı sızmaz', () => {
    setup({ dim: 'neon', district: 'Liman ve Sanayi', zone: { id: 3, name: 'Kızıl Dağlar' }, biome: 'Kayalık', time: 'gece 22:10', weather: 'yağmur' });
    expect(screen.getAllByRole('group', { name: 'Konum bilgisi' })).toHaveLength(1);
    expect(screen.getByText('Liman ve Sanayi')).toBeInTheDocument();
    expect(screen.queryByText('Kızıl Dağlar')).toBeNull();
    expect(screen.queryByText('Kayalık')).toBeNull();
    expect(screen.getByTestId('city-weather')).toBeInTheDocument();
  });

  it('boyut değişince canlı güncellenir: şehre girince CityHud, çıkınca InfoChip', () => {
    const { store } = setup({ zone: { id: 1, name: 'Zümrüt Vadisi' }, time: 'gündüz 12:00' });
    act(() => {
      store.set({ ...store.get(), dim: 'neon', district: 'Merkez' });
    });
    expect(screen.getByTestId('city-chip')).toBeInTheDocument();
    act(() => {
      store.set({ ...store.get(), dim: 'overworld', district: '' });
    });
    expect(screen.queryByTestId('city-chip')).toBeNull();
    expect(screen.getByText('Zümrüt Vadisi')).toBeInTheDocument();
  });

  it('masaüstünde boyut kipi çipi (tabanca varken), dokunmatikte çip yerine düğme', () => {
    const portals = { held: true, mavi: false, turuncu: false, charge: 24, max: 24, cells: 1, canFire: true, next: 'mavi', mode: 'boyut' };
    setup({ portals, abilities: { portalGun: true }, mode: 'macera' });
    expect(screen.getByTestId('portal-mode')).toHaveAttribute('data-mode', 'boyut');
    expect(screen.queryByRole('button', { name: 'Boyut kipi' })).toBeNull();
    cleanup();
    setup({ portals, abilities: { portalGun: true }, mode: 'macera' }, { touch: true });
    expect(screen.queryByTestId('portal-mode')).toBeNull();
    expect(screen.getByRole('button', { name: 'Boyut kipi' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('dokunmatik düğme yalnız Portal Tabancası yeteneği + macera modunda', () => {
    setup({ abilities: { portalGun: false }, mode: 'macera' }, { touch: true });
    expect(screen.queryByRole('button', { name: 'Boyut kipi' })).toBeNull();
    cleanup();
    setup({ abilities: { portalGun: true }, mode: 'insa' }, { touch: true });
    expect(screen.queryByRole('button', { name: 'Boyut kipi' })).toBeNull();
    cleanup();
    setup({ abilities: { portalGun: true }, mode: 'macera' }, { touch: true });
    expect(screen.getByRole('button', { name: 'Boyut kipi' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('TouchControls: Boyut kipi düğmesi', () => {
  const mount = (props = {}) => {
    const actions = { pressButton: vi.fn(), pause: vi.fn(), openInventory: vi.fn(), openCrafting: vi.fn(), openMap: vi.fn(), toggleCamera: vi.fn() };
    const utils = render(<TouchControls actions={actions} abilities={{ portalGun: true, grapple: true, glide: true }} mode="macera" dimButton {...props} />);
    return { actions, ...utils };
  };

  it('Portal düğmesinin yanında; basınca portalMode eylemi (down/up); basılı durum aria-pressed + data-lock', () => {
    const { actions, rerender } = mount();
    const btn = screen.getByRole('button', { name: 'Boyut kipi' });
    expect(btn).toHaveAttribute('data-icon', 'dimension');
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(btn).toHaveAttribute('data-lock', '0');
    fireEvent.pointerDown(btn, { pointerId: 3, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('portalMode', true);
    fireEvent.pointerUp(btn, { pointerId: 3, pointerType: 'touch' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('portalMode', false);
    rerender(<TouchControls actions={actions} abilities={{ portalGun: true, grapple: true, glide: true }} mode="macera" dimButton dimMode />);
    const on = screen.getByRole('button', { name: 'Boyut kipi' });
    expect(on).toHaveAttribute('aria-pressed', 'true');
    expect(on).toHaveAttribute('data-lock', '1');
    // Portal Tabancası ateş düğmesi ayrı ve yerinde
    expect(screen.getByRole('button', { name: 'Portal Silahı' })).toBeInTheDocument();
  });

  it('klavye (Enter/Space) ve ekran okuyucu etkinleştirmesi çalışır; çoklu dokunma yalıtılır', () => {
    const { actions } = mount();
    const btn = screen.getByRole('button', { name: 'Boyut kipi' });
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('portalMode', true);
    fireEvent.keyUp(btn, { key: 'Enter' });
    expect(actions.pressButton).toHaveBeenLastCalledWith('portalMode', false);
    actions.pressButton.mockClear();
    const jump = screen.getByRole('button', { name: 'Zıpla' });
    fireEvent.pointerDown(btn, { pointerId: 4, pointerType: 'touch' });
    fireEvent.pointerDown(jump, { pointerId: 5, pointerType: 'touch' });
    fireEvent.pointerUp(jump, { pointerId: 5, pointerType: 'touch' });
    expect(btn).toHaveAttribute('data-down', '1');
    fireEvent.pointerCancel(btn, { pointerId: 4, pointerType: 'touch' });
    expect(actions.pressButton.mock.calls).toEqual([['portalMode', true], ['jump', true], ['jump', false], ['portalMode', false]]);
  });

  it('dimButton yoksa düğme yok; yetenek yokken (dimButton false) mevcut düğme kümesi değişmez', () => {
    mount({ dimButton: false });
    expect(screen.queryByRole('button', { name: 'Boyut kipi' })).toBeNull();
    cleanup();
    const a = mount({ dimButton: false, abilities: {} });
    const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).not.toContain('Boyut kipi');
    expect(a.actions.pressButton).not.toHaveBeenCalled();
  });

  it('düğme gövdesi .kx-arc grubunda ve konum değişkenleri tanımlı (44 px alt sınırı CSS\'te)', () => {
    mount();
    const btn = screen.getByRole('button', { name: 'Boyut kipi' });
    expect(btn.closest('.kx-arc')).not.toBeNull();
    expect(btn.style.getPropertyValue('--bs')).not.toBe('');
    expect(btn.style.getPropertyValue('--bx')).not.toBe('');
    expect(btn.style.getPropertyValue('--by')).not.toBe('');
  });
});

describe('bölge duyurusu ve aria-live', () => {
  it('ZoneBanner bölge duyurusunu aria-live=polite bölgesinde gösterir; metin + alt başlık', () => {
    const spec = districtBannerSpec('gece_pazari');
    const { container } = render(<ZoneBanner banner={{ text: spec.text, sub: spec.sub, until: 0 }} toasts={[]} />);
    const live = container.querySelector('.kx-announce');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(within(live).getByRole('heading', { name: 'Gece Pazarı' })).toBeInTheDocument();
    expect(live).toHaveTextContent(spec.sub);
  });

  it('süresi dolunca bölge duyurusu kalkar; yeni duyuru gelince yenisi görünür', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const a = districtBannerSpec('liman');
    const until = Date.now() + 3400;
    const { rerender, container } = render(<ZoneBanner banner={{ text: a.text, sub: a.sub, until }} toasts={[]} />);
    expect(container.querySelector('.kx-banner-title')).toHaveTextContent('Liman ve Sanayi');
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(container.querySelector('.kx-banner-title')).toBeNull();
    const b = districtBannerSpec('tepe');
    rerender(<ZoneBanner banner={{ text: b.text, sub: b.sub, until: Date.now() + 3400 }} toasts={[]} />);
    expect(container.querySelector('.kx-banner-title')).toHaveTextContent('Tepe Konutları');
  });

  it('KesifHud: hud.banner bölge duyurusu şehirde görünür (üst duyuru katmanı)', () => {
    const store = createHudStore();
    const spec = districtBannerSpec('teknoloji');
    store.set({ hp: 20, maxHp: 20, hunger: 20, dim: 'neon', district: spec.text, banner: { text: spec.text, sub: spec.sub, until: 0 } });
    const { container } = render(<KesifHud store={store} actions={{}} announcer={createAnnouncer()} />);
    expect(container.querySelector('.kx-announce .kx-banner-title')).toHaveTextContent('Teknoloji Parkı');
    // çip de aynı adı taşır
    expect(screen.getByTestId('city-chip')).toHaveTextContent('Teknoloji Parkı');
  });
});
