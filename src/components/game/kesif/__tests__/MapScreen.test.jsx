// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import MapScreen from '../MapScreen.jsx';
import { makeFakeApi, makeFakeCtx } from './panelsTestKit.js';

const W = 16;
const H = 16;
function mapInfo(over = {}) {
    const data = new Uint8Array(W * H);
    for (let i = 0; i < data.length; i++) data[i] = i % 7 === 0 ? 0 : 1 + (i % 3);
    return {
        zone: { id: 0, name: 'Başlangıç Vadisi' },
        size: 400,
        player: { x: 10, z: -20, yaw: 0.5 },
        spawn: { x: 0, z: 0 },
        tiles: { w: W, h: H, data, palette: ['#3a8f3a', '#c8b070', '#3a7fd0'] },
        markers: [
            { type: 'gozcukulesi', name: 'Eski Kule', x: 10, z: -120, discovered: true, color: '#ffcc33' },
            { type: 'hazine', name: 'Hazine Adası', x: 60, z: 30, discovered: true, color: '#ff77aa' },
            { type: 'anahtartapinagi', name: 'Gizli Tapınak', x: -40, z: 20, discovered: false, color: '#66ccff' },
        ],
        ...over,
    };
}

let ctx;
let origGetContext;
beforeEach(() => {
    ctx = makeFakeCtx();
    origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => ctx;
});
afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext;
    vi.useRealTimers();
});

const calls = (name) => ctx.calls.filter((c) => c[0] === name);
const flushFrame = () => act(() => new Promise((r) => setTimeout(r, 30)));

describe('MapScreen', () => {
    it('canvas çizilir: kareler, halkalar, işaretler, oyuncu oku; erişilebilir etiket', async () => {
        const api = makeFakeApi({ map: mapInfo() });
        render(<MapScreen api={api} onClose={() => {}} />);
        await flushFrame();
        const canvas = screen.getByTestId('map-canvas');
        expect(canvas).toHaveAttribute('role', 'img');
        expect(canvas.getAttribute('aria-label')).toMatch(/Başlangıç Vadisi.*2 keşfedilmiş yer, 1 keşfedilmemiş yer/);
        expect(screen.getByText(/Başlangıç Vadisi · Konum 10, -20/)).toBeInTheDocument();
        expect(calls('drawImage').length).toBeGreaterThan(0);
        expect(calls('arc').length).toBeGreaterThan(0); // halkalar + işaretler
        expect(calls('fillText').some((c) => c[1] === 'K')).toBe(true); // pusula
        expect(calls('fillText').some((c) => c[1] === '?')).toBe(true); // keşfedilmemiş işaret
    });

    it('gösterge: renk + şekil; keşfedilmemiş sayısı', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        const legend = screen.getByRole('list', { name: 'Harita göstergesi' });
        expect(legend).toHaveTextContent('Sen');
        expect(legend).toHaveTextContent('Gözcü Kulesi');
        expect(legend).toHaveTextContent('Hazine');
        expect(legend).toHaveTextContent('Keşfedilmemiş (1)');
        expect(legend).toHaveTextContent('Bölge sınırı');
        expect(legend.querySelectorAll('svg polygon').length).toBeGreaterThanOrEqual(3);
    });

    it('Liste sekmesi: yalnız keşfedilenler, yakından uzağa, yön ve uzaklık', () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
        expect(screen.getByTestId('place-summary')).toHaveTextContent('2 keşfedilmiş yer, 1 keşfedilmemiş');
        const items = screen.getAllByRole('button', { name: /m$|km$/ });
        const texts = items.map((b) => b.textContent);
        expect(texts[0]).toContain('Hazine Adası'); // (60,30) → 111 m ; (10,-120) → 100 m
        expect(texts.length).toBe(2);
        expect(texts.join(' ')).not.toContain('Gizli Tapınak');
        const kule = items.find((b) => b.textContent.includes('Eski Kule'));
        expect(kule).toHaveTextContent('kuzey · 100 m');
    });

    it('listeden yere dokununca haritaya döner ve işaret kartı açılır', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
        fireEvent.click(screen.getByRole('button', { name: /Eski Kule/ }));
        expect(screen.getByRole('tab', { name: 'Harita' })).toHaveAttribute('aria-selected', 'true');
        const card = screen.getByTestId('map-selected');
        expect(card).toHaveTextContent('Eski Kule');
        expect(card).toHaveTextContent('Gözcü Kulesi');
        expect(card).toHaveTextContent('kuzey · 100 m');
        fireEvent.click(within(card).getByRole('button', { name: 'Kapat' }));
        expect(screen.queryByTestId('map-selected')).toBeNull();
    });

    it('hiç yer yoksa liste boş mesajı gösterir', () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo({ markers: [] }) })} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Liste' }));
        expect(screen.getByText(/Henüz yer keşfetmedin/)).toBeInTheDocument();
    });

    it('kontroller çökmeden çalışır: yakınlaştır, uzaklaştır, merkeze dön, başlangıca git', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        await flushFrame();
        const before = calls('drawImage').length;
        fireEvent.click(screen.getByRole('button', { name: 'Yakınlaştır' }));
        fireEvent.click(screen.getByRole('button', { name: 'Uzaklaştır' }));
        fireEvent.click(screen.getByRole('button', { name: 'Merkeze dön' }));
        expect(screen.getByTestId('live')).toHaveTextContent('konumuna döndü');
        fireEvent.click(screen.getByRole('button', { name: 'Başlangıca git' }));
        expect(screen.getByTestId('live')).toHaveTextContent('başlangıç noktasına');
        await flushFrame();
        expect(calls('drawImage').length).toBeGreaterThan(before);
    });

    it('ölçek değişince çizim ölçeği değişir (tekerlek ve klavye)', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        await flushFrame();
        const canvas = screen.getByTestId('map-canvas');
        const lastImg = () => calls('drawImage').slice(-1)[0];
        const w0 = lastImg()[4];
        fireEvent.wheel(canvas, { deltaY: -400, clientX: 100, clientY: 100 });
        await flushFrame();
        expect(lastImg()[4]).toBeGreaterThan(w0);
        const w1 = lastImg()[4];
        fireEvent.keyDown(canvas, { key: '-' });
        await flushFrame();
        expect(lastImg()[4]).toBeLessThan(w1);
        const x0 = lastImg()[2];
        fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
        await flushFrame();
        expect(lastImg()[2]).toBeGreaterThan(x0); // harita sağa kaydı (görüş sola)
    });

    it('sürükleyerek kaydırma ve işaret seçme (dokunma)', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        await flushFrame();
        const canvas = screen.getByTestId('map-canvas');
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400, right: 640, bottom: 400 });
        const lastImg = () => calls('drawImage').slice(-1)[0];
        const x0 = lastImg()[2];
        fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
        fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 160, clientY: 130 });
        fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 160, clientY: 130 });
        await flushFrame();
        expect(lastImg()[2]).toBeGreaterThan(x0);
        expect(screen.queryByTestId('map-selected')).toBeNull(); // sürükleme seçim sayılmaz
    });

    it('iki parmakla yakınlaştırma', async () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        await flushFrame();
        const canvas = screen.getByTestId('map-canvas');
        canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 400, right: 640, bottom: 400 });
        const w0 = calls('drawImage').slice(-1)[0][4];
        fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 300, clientY: 200 });
        fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 340, clientY: 200 });
        fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 350, clientY: 200 }); // mesafe 40 → 50 (ilk ölçüm)
        fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 420, clientY: 200 }); // 50 → 120
        fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 420, clientY: 200 });
        fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 300, clientY: 200 });
        await flushFrame();
        expect(calls('drawImage').slice(-1)[0][4]).toBeGreaterThan(w0);
    });

    it('harita yoksa/bozuksa güvenli; canvas bağlamı yoksa çökmez', async () => {
        HTMLCanvasElement.prototype.getContext = () => null;
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        await flushFrame();
        expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
    });

    it('getMapInfo null ise "okunamadı" gösterir', () => {
        render(<MapScreen api={makeFakeApi({ map: null })} onClose={() => {}} />);
        expect(screen.getByText('Harita okunamadı.')).toBeInTheDocument();
        expect(screen.queryByTestId('map-canvas')).toBeNull();
    });

    it('periyodik yenileme getMapInfo çağırır; Esc kapatır', () => {
        vi.useFakeTimers();
        const onClose = vi.fn();
        const api = makeFakeApi({ map: mapInfo() });
        render(<MapScreen api={api} onClose={onClose} />);
        const n = api.getMapInfo.mock.calls.length;
        act(() => {
            vi.advanceTimersByTime(3200);
        });
        expect(api.getMapInfo.mock.calls.length).toBeGreaterThan(n);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('erişilebilirlik: sekmeler ok tuşuyla gezilir', () => {
        render(<MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />);
        const tab = screen.getByRole('tab', { name: 'Harita' });
        tab.focus();
        fireEvent.keyDown(tab, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Liste' })).toHaveAttribute('aria-selected', 'true');
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Liste' }));
        expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });

    it('StrictMode: efekt sök-kur sonrası da çizim kuyruğu tıkanmaz (harita boş kalmaz)', async () => {
        render(
            <React.StrictMode>
                <MapScreen api={makeFakeApi({ map: mapInfo() })} onClose={() => {}} />
            </React.StrictMode>
        );
        await flushFrame();
        expect(calls('drawImage').length).toBeGreaterThan(0);
        expect(calls('fillRect').length).toBeGreaterThan(0);
    });
});
