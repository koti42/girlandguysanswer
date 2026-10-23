// @vitest-environment jsdom
/*
 * KesifGameScreen ↔ foto modu ve şehir haritası (photo_map): hud.ui 'photo' → PhotoOverlay; hud.ui 'map' → Neon Meridyen'de CityMap, ana diyarda eski MapScreen;
 * dokunmatik üst çubukta «Foto» düğmesi yalnız şehirde; motor cephesi (FACADE_DEFAULTS) foto/harita/seyahat çağrılarını iletir.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act, cleanup, configure, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));

import { loadKesifEngine } from '../engineLoader';
import KesifGameScreen from '../KesifGameScreen';
import { FACADE_DEFAULTS, createPanelApi } from '../kesifPanelApi.js';
import { fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from './fakeKesifEngine';
import {
  PHOTO_FILTERS, PHOTO_FRAMES, PHOTO_LIMITS, PHOTO_RAINS, PHOTO_TIMES, defaultPhotoSettings,
} from '../../../../game/kesif/sim/city/map/photoMath.js';

const MACERA = { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null };
let engine;

async function ready() {
  await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
  act(() => engine.cb.onReady());
  await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

function mountScreen() {
  return render(
    <MemoryRouter>
      <KesifGameScreen entry={MACERA} user={null} avatar={null} api={fakeApi()} onExit={() => {}} />
    </MemoryRouter>,
  );
}

const photoState = () => ({
  open: true,
  canOpen: { ok: true, reason: 'acik', message: '' },
  settings: defaultPhotoSettings(),
  view: { yaw: 0, pitch: 0, dist: 5, blocked: false },
  limits: PHOTO_LIMITS,
  filters: PHOTO_FILTERS,
  frames: PHOTO_FRAMES,
  times: PHOTO_TIMES,
  rains: PHOTO_RAINS,
  shot: null,
  busy: false,
  saving: false,
  lastSave: null,
  reduced: false,
  album: { taken: 0, count: 0, total: 8, done: false, assignment: '', subjects: [] },
  version: 1,
});

const cityMap = () => ({
  dim: 'neon',
  zone: { id: 0, name: 'Merkez' },
  size: 1600,
  bounds: { minX: -800, minZ: -800, maxX: 800, maxZ: 800 },
  player: { x: 0, z: 0, yaw: 0 },
  spawn: { x: 0, z: 0 },
  tiles: { w: 2, h: 2, data: new Uint8Array([2, 3, 0, 0]), palette: ['#0b0f20', '#1c2140', '#4b5272', '#8d93b5'], paletteBase: 1 },
  zones: [],
  districts: [{ key: 'merkez', name: 'Merkez', x: 0, z: 0 }],
  markers: [{ id: 'terminal:0', type: 'terminal', name: 'Kapı Meydanı', x: 0, z: 0, discovered: true, color: '#4fe3d6' }],
  guide: null,
  explored: 0,
});

describe('kesifPanelApi: foto/harita/seyahat cephe varsayılanları', () => {
  it('anahtarlar tanımlı; motor yokken güvenli değerler; motor varsa çağrılar iletilir', () => {
    ['getPhotoState', 'photoOpen', 'photoClose', 'photoSet', 'photoOrbit', 'photoZoom', 'photoCapture', 'photoSave', 'photoShare', 'photoDiscard', 'getPhotoAlbum', 'getFastTravel', 'fastTravel', 'getMapRoute', 'openCityMap'].forEach((k) => {
      expect(Object.prototype.hasOwnProperty.call(FACADE_DEFAULTS, k), k).toBe(true);
    });
    const none = createPanelApi(() => null);
    expect(none.getPhotoState()).toBe(null);
    expect(none.photoOpen()).toMatchObject({ ok: false });
    expect(none.photoCapture()).toMatchObject({ ok: false });
    expect(none.photoSave()).toMatchObject({ ok: false });
    expect(none.getFastTravel()).toBe(null);
    expect(none.fastTravel('t3')).toMatchObject({ ok: false });
    expect(none.getMapRoute(1, 2)).toBe(null);
    expect(none.openCityMap()).toMatchObject({ ok: false });
    const g = { photoSet: vi.fn((p) => ({ ok: true, p })), fastTravel: vi.fn((id) => ({ ok: true, id })) };
    const api = createPanelApi(() => g);
    expect(api.photoSet({ fov: 40 })).toEqual({ ok: true, p: { fov: 40 } });
    expect(api.fastTravel('t3')).toEqual({ ok: true, id: 't3' });
  });
});

describe('KesifGameScreen: foto modu ve şehir haritası panelleri', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLCanvasElement.prototype.getContext = () => null;
    Element.prototype.scrollIntoView = vi.fn();
    engine = makeEngine();
    loadKesifEngine.mockResolvedValue(engine.mod);
  });
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 5));
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it("ui 'photo': PhotoOverlay çizilir; ayar motorun photoSet'ine gider; Kapat photoClose çağırır", async () => {
    engine.controls.getPhotoState = vi.fn(() => photoState());
    engine.controls.photoSet = vi.fn(() => photoState());
    engine.controls.photoClose = vi.fn(() => { engine.setUi('none'); return { ok: true }; });
    mountScreen();
    await ready();
    act(() => engine.hud({ dim: 'neon', ui: 'photo' }));
    expect(await screen.findByTestId('photo-overlay')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Görüş açısı'), { target: { value: '40' } });
    expect(engine.controls.photoSet).toHaveBeenCalledWith({ fov: 40 });
    fireEvent.click(screen.getByTestId('photo-close'));
    expect(engine.controls.photoClose).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('photo-overlay')).toBeNull());
  });

  it("ui 'map' + dim neon: CityMap (Şehir Haritası); ana diyarda eski Harita ekranı", async () => {
    engine.controls.getMapInfo = vi.fn(() => cityMap());
    engine.controls.getFastTravel = vi.fn(() => ({
      enabled: true, cost: 5, cooldown: 0, busy: false, here: 't0', kredi: 30, nodes: [{ id: 't0', kind: 'terminal', index: 0, name: 'Kapı Meydanı', x: 0, z: 0, dist: 3, ok: false, reason: 'ayni', message: 'Zaten buradasın.' }],
    }));
    mountScreen();
    await ready();
    act(() => engine.hud({ dim: 'neon', ui: 'map' }));
    expect(await screen.findByTestId('city-map')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Şehir Haritası' })).toBeInTheDocument();
    expect(screen.getByTestId('travel-status')).toHaveTextContent('Kredi: 30');
    act(() => engine.hud({ dim: 'overworld', ui: 'none' }));
    await waitFor(() => expect(screen.queryByTestId('city-map')).toBeNull());
    engine.controls.getMapInfo = vi.fn(() => null);
    act(() => engine.hud({ dim: 'overworld', ui: 'map' }));
    expect(await screen.findByTestId('map-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('city-map')).toBeNull();
  });
});
