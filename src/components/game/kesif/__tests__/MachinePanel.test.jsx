// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import MachinePanel from '../MachinePanel.jsx';

const NET = {
    id: 0, nodes: 12, machines: 4, overflow: 0, gen: 12, demand: 8, supplied: 8, stored: 1200, cap: 5000, live: true, wasted: 0,
};
const POS = { x: 10, y: 41, z: 10 };

/** Sahte api: info nesnesi canlı (test değiştirir); eylemler kayda geçer. */
function makeApi(info) {
    const cur = { value: { ok: true, pos: POS, powered: true, on: false, network: NET, ...info } };
    const api = {
        _cur: cur,
        getMachineInfo: vi.fn(() => cur.value),
        machineAction: vi.fn(() => ({ ok: true, message: 'Tamam.' })),
        setMachineConfig: vi.fn((x, y, z, cfg) => {
            Object.assign(cur.value, cfg.freq !== undefined ? { freq: cfg.freq } : {}, cfg.mode ? { mode: cfg.mode } : {}, cfg.radius ? { radius: cfg.radius } : {}, cfg.off !== undefined ? { off: cfg.off } : {}, cfg.hue !== undefined ? { hue: cfg.hue } : {});
            return { ok: true };
        }),
    };
    return api;
}

afterEach(() => {
    vi.useRealTimers();
});

describe('MachinePanel', () => {
    it('makine yoksa boş durum metni', () => {
        const api = { getMachineInfo: () => null, machineAction: vi.fn(), setMachineConfig: vi.fn() };
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('machine-closed')).toBeInTheDocument();
    });

    it('başlık adı, durum etiketi ve enerji ağı özeti (depo çubuğu, üretim/tüketim/fark)', () => {
        const api = makeApi({
            type: 'pil', name: 'Pil Bankası', stored: 1200, cap: 5000, io: 50,
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByRole('dialog')).toHaveAccessibleName('Pil Bankası');
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Şarjlı');
        const net = screen.getByTestId('machine-network');
        expect(net).toHaveAttribute('data-level', 'ok');
        expect(within(net).getByTestId('net-gen')).toHaveTextContent('12 EU/sn');
        expect(within(net).getByTestId('net-use')).toHaveTextContent('8 EU/sn');
        expect(within(net).getByTestId('net-net')).toHaveTextContent('+4 EU/sn');
        expect(within(net).getByRole('meter', { name: 'Depo' })).toHaveAttribute('aria-valuenow', '1200');
    });

    it('ağ yoksa açıklama; kaynaksız ağda uyarı', () => {
        const api = makeApi({
            type: 'lamba', name: 'Lamba', network: null,
        });
        const { rerender } = render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('net-none')).toHaveTextContent(/enerji ağı yok/);
        api._cur.value.network = { ...NET, live: false, gen: 0, supplied: 0 };
        rerender(<MachinePanel api={api} onClose={() => {}} version={1} />);
        expect(screen.getByTestId('machine-network')).toHaveAttribute('data-level', 'dead');
    });

    it('jeneratör: yakıt yuvası + halka; çantadaki yakıtlar listelenir, Ekle machineAction(fuel) çağırır; yakıtı geri al', () => {
        const api = makeApi({
            type: 'jenerator',
            name: 'Yakıt Jeneratörü',
            fuel: { item: 'item:kömür', count: 5 },
            burning: true,
            burnLeft: 20,
            burnTotal: 40,
            rate: 12,
            fuels: [{ item: 'blok:meşe_tahta', count: 12, seconds: 5 }],
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('km-fuel-slot')).toHaveAccessibleName(/Yakıt: Kömür ×5/);
        expect(screen.getByTestId('km-burn')).toHaveAttribute('aria-valuenow', '50');
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Yanıyor');
        fireEvent.click(screen.getByTestId('km-fuel-blok:meşe_tahta'));
        expect(api.machineAction).toHaveBeenCalledWith(10, 41, 10, { type: 'fuel', item: 'blok:meşe_tahta', count: 12 });
        expect(screen.getByTestId('live')).toHaveTextContent('Tamam.');
        fireEvent.click(screen.getByTestId('km-take-fuel'));
        expect(api.machineAction).toHaveBeenLastCalledWith(10, 41, 10, { type: 'takeFuel' });
    });

    it('ocak: girdi/ürün yuvaları, ürünleri al/girdiyi geri al, eritilebilir eşya ekle', () => {
        const api = makeApi({
            type: 'ocak',
            name: 'Elektrikli Ocak',
            inItem: 'item:ham_demir',
            inCount: 4,
            outItem: 'item:demir_külçe',
            outCount: 2,
            progress: 0.4,
            time: 5,
            on: true,
            smeltables: [{ item: 'item:ham_bakır', count: 3, out: 'item:bakır_külçe', outCount: 1 }],
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('km-smelt')).toHaveAttribute('aria-valuenow', '40');
        fireEvent.click(screen.getByTestId('km-take-out'));
        expect(api.machineAction).toHaveBeenLastCalledWith(10, 41, 10, { type: 'takeSmelt' });
        fireEvent.click(screen.getByTestId('km-take-in'));
        expect(api.machineAction).toHaveBeenLastCalledWith(10, 41, 10, { type: 'takeInput' });
        fireEvent.click(screen.getByTestId('km-smelt-item:ham_bakır'));
        expect(api.machineAction).toHaveBeenLastCalledWith(10, 41, 10, { type: 'smelt', item: 'item:ham_bakır', count: 3 });
    });

    it('madenci: mod seçimi setMachineConfig, tamponu boşalt, durunca yeniden başlat; durum metni', () => {
        const api = makeApi({
            type: 'matkap',
            name: 'Otomatik Madenci',
            mode: 'column',
            depth: 9,
            mined: 31,
            stop: null,
            wait: null,
            cells: 1,
            on: true,
            buffer: [{ item: 'item:kömür', count: 7 }],
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('km-mode-column')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('km-depth')).toHaveTextContent('9 blok');
        expect(screen.getByTestId('km-buffer-total')).toHaveTextContent('7 eşya');
        expect(screen.getByTestId('km-drill-restart')).toBeDisabled();
        fireEvent.click(screen.getByTestId('km-mode-alan'));
        expect(api.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { mode: 'alan' });
        fireEvent.click(screen.getByTestId('km-drill-take'));
        expect(api.machineAction).toHaveBeenLastCalledWith(10, 41, 10, { type: 'drillTake' });
        api._cur.value = { ...api._cur.value, stop: 'ana_kaya', on: false };
        act(() => {
            fireEvent.click(screen.getByTestId('km-mode-column'));
        });
        expect(screen.getByTestId('km-drill-status')).toHaveTextContent(/Ana kayaya ulaştı/);
        fireEvent.click(screen.getByTestId('km-drill-restart'));
        expect(api.setMachineConfig).toHaveBeenLastCalledWith(10, 41, 10, { restart: true });
    });

    it('ışınlayıcı: frekans seçici (şekil + ad), Uygula 4 sembolü gönderir; hazır değilken neden, hazırken Işınlan', () => {
        const api = makeApi({
            type: 'isinlayici',
            name: 'Işınlanma Platformu',
            freq: null,
            symbols: null,
            buf: 10,
            cap: 240,
            cooldown: 0,
            partner: null,
            cost: null,
            ready: false,
            onPad: true,
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Frekans ayarsız');
        expect(screen.getByTestId('km-teleport')).toBeDisabled();
        // 2. sembolü yıldız yap
        fireEvent.click(screen.getByTestId('km-freq-slot-1'));
        fireEvent.click(screen.getByTestId('km-freq-pick-3'));
        expect(screen.getByTestId('km-freq-slot-1')).toHaveAccessibleName('2. sembol: yıldız');
        fireEvent.click(screen.getByTestId('km-freq-apply'));
        expect(api.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { freq: '0323' });
        expect(screen.getByTestId('km-freq-msg')).toHaveTextContent('Frekans ayarlandı.');
        api._cur.value = {
            ...api._cur.value, freq: '0323', buf: 200, partner: { x: 14, y: 41, z: 10 }, cost: 61, ready: true,
        };
        act(() => {
            fireEvent.click(screen.getByTestId('km-freq-clear'));
        });
        // temizle → sunucu null yaptı
        expect(api.setMachineConfig).toHaveBeenLastCalledWith(10, 41, 10, { freq: null });
    });

    it('ışınlayıcı hazırken Işınlan düğmesi machineAction(teleport) çağırır', () => {
        const api = makeApi({
            type: 'isinlayici',
            name: 'Işınlanma Platformu',
            freq: '0123',
            symbols: ['üçgen', 'daire', 'kare', 'yıldız'],
            buf: 200,
            cap: 240,
            cooldown: 0,
            partner: { x: 14, y: 41, z: 10 },
            cost: 61,
            ready: true,
            onPad: true,
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Hazır');
        expect(screen.getByTestId('km-partner')).toHaveTextContent('14, 41, 10');
        expect(screen.getByTestId('km-cost')).toHaveTextContent('61 EU');
        fireEvent.click(screen.getByTestId('km-teleport'));
        expect(api.machineAction).toHaveBeenCalledWith(10, 41, 10, { type: 'teleport' });
    });

    it('asansör: yön düğmeleri hedefe ve platform üstüne bağlı', () => {
        const api = makeApi({
            type: 'asansor', name: 'Asansör Platformu', buf: 80, cap: 80, cooldown: 0, up: 47, down: null, onPad: true,
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('km-lift-up')).toBeEnabled();
        expect(screen.getByTestId('km-lift-down')).toBeDisabled();
        fireEvent.click(screen.getByTestId('km-lift-up'));
        expect(api.machineAction).toHaveBeenCalledWith(10, 41, 10, { type: 'lift', dir: 1 });
    });

    it('pil/şarj: şarj et düğmesi yalnız kaynak doluyken ve ihtiyaç varken; düğme anahtarı; sensör menzili', () => {
        const bat = makeApi({
            type: 'pil', name: 'Pil Bankası', stored: 900, cap: 5000, chargeNeed: 300,
        });
        const { unmount } = render(<MachinePanel api={bat} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId('km-charge'));
        expect(bat.machineAction).toHaveBeenCalledWith(10, 41, 10, { type: 'charge' });
        unmount();
        const empty = makeApi({
            type: 'pil', name: 'Pil Bankası', stored: 0, cap: 5000, chargeNeed: 300,
        });
        const r2 = render(<MachinePanel api={empty} onClose={() => {}} />);
        expect(screen.getByTestId('km-charge')).toBeDisabled();
        r2.unmount();
        const btn = makeApi({
            type: 'dugme', name: 'Düğme', mode: 'toggle', on: false, left: 0,
        });
        const r3 = render(<MachinePanel api={btn} onClose={() => {}} />);
        const sw = screen.getByTestId('km-switch');
        expect(sw).toHaveAttribute('role', 'switch');
        expect(sw).toHaveAttribute('aria-checked', 'false');
        fireEvent.click(sw);
        expect(btn.machineAction).toHaveBeenCalledWith(10, 41, 10, { type: 'press' });
        fireEvent.click(screen.getByTestId('km-btn-pulse'));
        expect(btn.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { mode: 'pulse' });
        r3.unmount();
        const sen = makeApi({ type: 'sensor', name: 'Sensör', radius: 5 });
        render(<MachinePanel api={sen} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId('km-radius-plus'));
        expect(sen.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { radius: 6 });
        expect(screen.getByTestId('km-radius')).toHaveTextContent('6 blok');
    });

    it('açıkken ≈ 4 Hz yeniler: dışarıdan değişen bilgi yansır; Esc kapatır', () => {
        vi.useFakeTimers();
        const api = makeApi({
            type: 'jenerator', name: 'Yakıt Jeneratörü', fuel: null, burning: false, burnLeft: 0, burnTotal: 0, rate: 12, fuels: [],
        });
        const onClose = vi.fn();
        render(<MachinePanel api={api} onClose={onClose} />);
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Yakıt yok');
        api._cur.value = {
            ...api._cur.value, fuel: { item: 'item:kömür', count: 2 }, burning: true, burnLeft: 30, burnTotal: 40,
        };
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Yanıyor');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });

    it('açma/kapama anahtarı: anahtarlanabilir makinede görünür, kapalıyken durum etiketi değişir; pilde yok', () => {
        const api = makeApi({
            type: 'ocak', name: 'Elektrikli Ocak', off: false, inItem: null, inCount: 0, outItem: null, outCount: 0, progress: 0, time: 5, smeltables: [],
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        const sw = screen.getByTestId('km-power-switch');
        expect(sw).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(sw);
        expect(api.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { off: true });
        expect(screen.getByTestId('km-power-switch')).toHaveAttribute('aria-checked', 'false');
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Kapalı (anahtar)');
        cleanup();
        const bat = makeApi({ type: 'pil', name: 'Pil Bankası', stored: 10, cap: 5000, io: 50 });
        render(<MachinePanel api={bat} onClose={() => {}} />);
        expect(screen.queryByTestId('km-power')).toBeNull();
    });

    it('lamba: 8 renk seçeneği (renk + ad), seçim yapılandırmaya gider', () => {
        const api = makeApi({
            type: 'lamba', name: 'Lamba Paneli', off: false, hue: 0, on: true,
        });
        render(<MachinePanel api={api} onClose={() => {}} />);
        expect(screen.getByTestId('machine-state')).toHaveTextContent('Yanıyor');
        const group = screen.getByRole('radiogroup', { name: 'Lamba rengi' });
        expect(within(group).getAllByRole('radio')).toHaveLength(8);
        expect(screen.getByTestId('km-hue-0')).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(screen.getByTestId('km-hue-4'));
        expect(api.setMachineConfig).toHaveBeenCalledWith(10, 41, 10, { hue: 4 });
        expect(screen.getByTestId('km-hue-4')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('km-hue-4')).toHaveTextContent('Mavi');
    });
});
