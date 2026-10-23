// @vitest-environment jsdom
/*
 * Neon Meridyen şehir haritası arayüzü (photo_map): CityMap — sahte motor cephesi üzerinde. Bulunmuş yerler, liste eşdeğeri, hızlı seyahat düğmeleri (kural nedeni yazılı),
 * yol tarifi, klavye/işaretçi, erişilebilirlik (aria, 44 px CSS).
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
import CityMap from '../city/CityMap.jsx';
import { worldToScreen, mapBounds } from '../panelMap.js';
import { cityOverview, normalizeCityMarkers } from '../city/cityMapUtils.js';

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../city/cityMap.css'), 'utf8');

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const PALETTE = ['#0b0f20', '#1c2140', '#4b5272', '#8d93b5', '#2f8f5a', '#2f6fb0', '#c04fa0', '#d8b878'];

function fakeApi(over) {
  const data = new Uint8Array(16).fill(0);
  data[5] = 2;
  data[6] = 3;
  const map = {
    dim: 'neon',
    zone: { id: 0, name: 'Merkez' },
    size: 1600,
    bounds: { minX: -800, minZ: -800, maxX: 800, maxZ: 800 },
    player: { x: 10, z: 20, yaw: 0 },
    spawn: { x: 0, z: 0 },
    tiles: { w: 4, h: 4, cell: 400, data, palette: PALETTE, paletteBase: 1 },
    zones: [],
    districts: [{ key: 'merkez', name: 'Merkez', x: 0, z: 0 }, { key: 'tepe', name: 'Tepe Konutları', x: -288, z: -458 }],
    markers: [
      { id: 'terminal:0', type: 'terminal', name: 'Kapı Meydanı', x: 0, z: 0, discovered: true, color: '#4fe3d6' },
      { id: 'terminal:3', type: 'terminal', name: 'Liman Terminali', x: -13, z: 643, discovered: true, color: '#4fe3d6' },
      { id: 'foto:5', type: 'foto', name: 'Foto Noktası', x: 60, z: 90, discovered: true, color: '#ff4fd0' },
    ],
    guide: null,
    explored: 0,
  };
  const travel = {
    enabled: true,
    cost: 5,
    cooldown: 0,
    busy: false,
    here: 't0',
    kredi: 40,
    nodes: [
      { id: 't0', kind: 'terminal', index: 0, name: 'Kapı Meydanı', x: 0, z: 0, dist: 22, ok: false, reason: 'ayni', message: 'Zaten buradasın.' },
      { id: 't3', kind: 'terminal', index: 3, name: 'Liman Terminali', x: -13, z: 643, dist: 625, ok: true, reason: 'tamam', message: 'Hazır.' },
    ],
  };
  const api = {
    map,
    travel,
    getMapInfo: () => ({ ...map }), // gerçek motor her çağrıda yeni nesne verir
    getFastTravel: () => travel,
    fastTravel: vi.fn(() => ({ ok: true, reason: 'tamam', message: 'Liman Terminali noktasına gidiliyor.' })),
    getMapRoute: vi.fn(() => ({ pts: [[10, 20], [0, 0], [-13, 643]], length: 700, straight: false })),
  };
  return Object.assign(api, over || null);
}

describe('CityMap: yapı', () => {
  it('başlık, bölge özeti, tuval özeti (role=img), araçlar, gösterge, keşfedilmemiş açıklaması', () => {
    render(<CityMap api={fakeApi()} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Şehir Haritası' })).toBeTruthy();
    expect(screen.getByText(/Bölgeler: 2\/6 \(Merkez, Tepe Konutları\)/)).toBeTruthy();
    const canvas = screen.getByTestId('city-map-canvas');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toMatch(/Şehir haritası.*3 keşfedilmiş yer/);
    expect(screen.getByLabelText('Yakınlaştır')).toBeTruthy();
    expect(screen.getByLabelText('Uzaklaştır')).toBeTruthy();
    const legend = screen.getByLabelText('Harita göstergesi');
    expect(legend.textContent).toMatch(/Boyut Terminali/);
    expect(legend.textContent).toMatch(/Foto noktası/);
    expect(legend.textContent).toMatch(/Keşfedilmemiş \(karanlık\)/);
    expect(screen.getByTestId('travel-status').textContent).toMatch(/Kredi: 40/);
    expect(screen.getByRole('tab', { name: 'Harita' }).getAttribute('aria-selected')).toBe('true');
  });

  it('bilgi yoksa «okunamadı»; seyahat api\'si yoksa (eski cephe) çökmez', () => {
    render(<CityMap api={{ getMapInfo: () => null }} onClose={() => {}} />);
    expect(screen.getByText('Harita okunamadı.')).toBeTruthy();
    cleanup();
    const api = fakeApi();
    delete api.getFastTravel;
    delete api.fastTravel;
    delete api.getMapRoute;
    render(<CityMap api={api} onClose={() => {}} />);
    expect(screen.getByTestId('city-map-canvas')).toBeTruthy();
  });

  it('CSS: ≥ 44 px düğmeler, kural nedeni görünür, dar ekran düzeni', () => {
    expect(CSS).toMatch(/\.kcm-actions \.kp-btn \{[^}]*min-height: 44px/);
    expect(CSS).toMatch(/\.kcm-go \{ min-height: 44px/);
    expect(CSS).toMatch(/\.kcm-why \{/);
    expect(CSS).toMatch(/@media \(max-width: 560px\)/);
    expect(CSS).toMatch(/@media \(max-height: 460px\)/);
  });
});

describe('CityMap: liste eşdeğeri ve hızlı seyahat', () => {
  it('Liste: bölge sayacı, hızlı seyahat satırları; kural reddi nedeniyle yazılı ve düğme kapalı; uygun olan etkin', () => {
    const api = fakeApi();
    render(<CityMap api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
    expect(screen.getByTestId('city-place-summary').textContent).toMatch(/Bölgeler: 2\/6.*3 keşfedilmiş yer/);
    const list = screen.getByLabelText('Hızlı seyahat noktaları');
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBe(2);
    const go0 = screen.getByTestId('travel-t0');
    expect(go0.disabled).toBe(true);
    expect(rows[0].textContent).toMatch(/Zaten buradasın/);
    const go3 = screen.getByTestId('travel-t3');
    expect(go3.disabled).toBe(false);
    expect(go3.textContent).toBe('Işınlan · 5 Kredi');
    fireEvent.click(go3);
    expect(api.fastTravel).toHaveBeenCalledWith('t3');
    expect(screen.getByTestId('city-map-live').textContent).toMatch(/Liman Terminali noktasına gidiliyor/);
  });

  it('reddedilen seyahat: motorun mesajı duyurulur; çağrı yine yapılır', () => {
    const api = fakeApi({ fastTravel: vi.fn(() => ({ ok: false, reason: 'kredi', message: 'Yeterli Kredin yok.' })) });
    render(<CityMap api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
    fireEvent.click(screen.getByTestId('travel-t3'));
    expect(screen.getByTestId('city-map-live').textContent).toMatch(/Yeterli Kredin yok/);
  });

  it('Liste: keşfedilen yer seçilince haritaya geçer ve seçili kart (yön + uzaklık) görünür', () => {
    const api = fakeApi();
    render(<CityMap api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
    fireEvent.click(screen.getByTestId('city-place-foto:5'));
    expect(screen.getByRole('tab', { name: 'Harita' }).getAttribute('aria-selected')).toBe('true');
    const card = screen.getByTestId('city-map-selected');
    expect(card.textContent).toMatch(/Foto Noktası/);
    expect(card.textContent).toMatch(/Foto noktası/);
    expect(card.textContent).toMatch(/güney|doğu|kuzey|batı/);
    expect(within(card).queryByText(/Işınlan/)).toBeNull(); // foto noktasına ışınlanılmaz
  });

  it('seçili terminal: Işınlan düğmesi kartta; yol tarifi açılır/kapanır ve rota uzunluğu yazılır', () => {
    const api = fakeApi();
    render(<CityMap api={api} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
    fireEvent.click(screen.getByTestId('city-place-terminal:3'));
    const card = screen.getByTestId('city-map-selected');
    const go = within(card).getByTestId('travel-t3');
    expect(go.disabled).toBe(false);
    const tog = screen.getByTestId('route-toggle');
    expect(tog.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(tog);
    expect(api.getMapRoute).toHaveBeenCalledWith(-13, 643);
    expect(screen.getByTestId('route-info').textContent).toMatch(/Rota: yaklaşık 700 m/);
    expect(screen.getByTestId('route-toggle').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('route-toggle'));
    expect(screen.queryByTestId('route-info')).toBeNull();
    fireEvent.click(go);
    expect(api.fastTravel).toHaveBeenCalledWith('t3');
  });

  it('bekleme süresi ve Kredi durum satırında; Kapı Meydanı terminali kartta Işınlan kapalı + nedeni', () => {
    const api = fakeApi();
    api.travel.cooldown = 7;
    render(<CityMap api={api} onClose={() => {}} />);
    expect(screen.getByTestId('travel-status').textContent).toMatch(/Bekleme: 7 sn/);
    fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
    fireEvent.click(screen.getByTestId('city-place-terminal:0'));
    const card = screen.getByTestId('city-map-selected');
    expect(within(card).getByTestId('travel-t0').disabled).toBe(true);
    expect(within(card).getByRole('note').textContent).toMatch(/Zaten buradasın/);
  });
});

function recorderCtx() {
  return new Proxy({}, { get: () => () => {}, set: () => true });
}

describe('CityMap: işaretçi ve klavye', () => {
  it('tuvale dokunma yakındaki işareti seçer; sürükleme seçmez; klavye olayı varsayılanı bastırır', async () => {
    HTMLCanvasElement.prototype.getContext.mockReturnValue(recorderCtx());
    const api = fakeApi();
    render(<CityMap api={api} onClose={() => {}} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); }); // ilk çizim görünümü kurar
    const canvas = screen.getByTestId('city-map-canvas');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400, right: 640, bottom: 400 });
    const bounds = mapBounds(api.map);
    const markers = normalizeCityMarkers(api.map.markers);
    const view = cityOverview(api.map, markers, bounds, 640, 400);
    const [sx, sy] = worldToScreen(view, 640, 400, 60, 90); // foto noktası
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: sx, clientY: sy });
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: sx, clientY: sy });
    expect(screen.queryByTestId('city-map-selected')).not.toBeNull();
    expect(screen.getByTestId('city-map-selected').textContent).toMatch(/Foto Noktası/);
    fireEvent.click(within(screen.getByTestId('city-map-selected')).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByTestId('city-map-selected')).toBeNull();
    // sürükleme
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: sx, clientY: sy });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: sx + 80, clientY: sy + 5 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: sx + 80, clientY: sy + 5 });
    expect(screen.queryByTestId('city-map-selected')).toBeNull();
    expect(fireEvent.keyDown(canvas, { key: 'ArrowLeft' })).toBe(false);
    expect(fireEvent.keyDown(canvas, { key: '+' })).toBe(false);
    expect(fireEvent.keyDown(canvas, { key: '0' })).toBe(false);
    expect(fireEvent.keyDown(canvas, { key: 'q' })).toBe(true);
  });

  it('Esc paneli kapatır (PanelShell); sürüm değişince yeniden okunur', () => {
    const api = fakeApi();
    const onClose = vi.fn();
    const { rerender } = render(<CityMap api={api} onClose={onClose} version={0} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    api.map.zone = { id: 0, name: 'Gece Pazarı' };
    rerender(<CityMap api={api} onClose={onClose} version={1} />);
    expect(screen.getByRole('dialog').textContent).toMatch(/Gece Pazarı/);
  });

  it('1,5 sn\'lik yenileme: yeni işaret görünür', async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    render(<CityMap api={api} onClose={() => {}} />);
    expect(screen.getByTestId('city-map-canvas').getAttribute('aria-label')).toMatch(/3 keşfedilmiş yer/);
    api.map.markers = api.map.markers.concat([{ id: 'yaris:20', type: 'yaris', name: 'Çevreyolu Turu', x: 5, z: 5, discovered: true, color: '#b6ff3d' }]);
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(screen.getByTestId('city-map-canvas').getAttribute('aria-label')).toMatch(/4 keşfedilmiş yer/);
    vi.useRealTimers();
  });
});
