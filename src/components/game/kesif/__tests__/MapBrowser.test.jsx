// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-hot-toast', () => {
    const toast = vi.fn();
    toast.error = vi.fn();
    toast.success = vi.fn();
    return { default: toast };
});

import toast from 'react-hot-toast';
import MapBrowser from '../MapBrowser';
import { MAP_A, MAP_B, MAP_C, deferred, fakeApi, httpError } from './kesifTestKit';

const renderBrowser = (props = {}) => {
    const api = props.api || fakeApi();
    const onPlay = props.onPlay || vi.fn();
    const utils = render(
        <MemoryRouter>
            <MapBrowser api={api} member onPlay={onPlay} {...props} />
        </MemoryRouter>
    );
    return { api, onPlay, ...utils };
};

const cards = () => screen.getAllByTestId('kesif-map-card');

describe('MapBrowser', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('misafir: giriş çağrısı gösterilir, hiçbir istek atılmaz', () => {
        const api = fakeApi();
        render(
            <MemoryRouter>
                <MapBrowser api={api} member={false} />
            </MemoryRouter>
        );
        expect(screen.getByTestId('kesif-browser-guest')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /Giriş yap/ })).toHaveAttribute('href', '/login');
        expect(screen.getByRole('link', { name: 'Üye ol' })).toHaveAttribute('href', '/signup');
        expect(api.maps).not.toHaveBeenCalled();
    });

    it('üye: Yeni sekmesiyle yüklenir, kartlar kapak/başlık/yazar/beğeni/oynanma gösterir', async () => {
        const { api } = renderBrowser();
        expect(api.maps).toHaveBeenCalledWith({ sort: 'new', q: '', page: 1 });
        expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
        const first = cards()[0];
        expect(within(first).getByRole('link', { name: '@ayse' })).toHaveAttribute('href', '/oyun/profil/ayse');
        expect(within(first).getByLabelText('140 oynanma')).toBeInTheDocument();
        expect(within(first).getByRole('button', { name: /Beğen: Güzel Vadi\. 12 beğeni/ })).toHaveAttribute('aria-pressed', 'false');
        expect(within(first).getByTestId('kesif-cover')).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Yeni' })).toHaveAttribute('aria-selected', 'true');
        expect(cards()).toHaveLength(2);
    });

    it('Popüler sekmesi yeniden ve sort=popular ile ister; ok tuşlarıyla sekme değişir', async () => {
        const { api } = renderBrowser();
        await screen.findByText('Güzel Vadi');
        api.maps.mockResolvedValueOnce({ maps: [MAP_C], pagination: { current_page: 1, last_page: 1, total: 1 } });
        fireEvent.click(screen.getByRole('tab', { name: 'Popüler' }));
        expect(await screen.findByText('Ada Köyü')).toBeInTheDocument();
        expect(api.maps).toHaveBeenLastCalledWith({ sort: 'popular', q: '', page: 1 });
        expect(screen.queryByText('Güzel Vadi')).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Popüler' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.keyDown(screen.getByRole('tab', { name: 'Popüler' }), { key: 'ArrowRight' });
        await waitFor(() => expect(screen.getByRole('tab', { name: 'Yeni' })).toHaveAttribute('aria-selected', 'true'));
    });

    it('arama: gönderince q ile baştan ister; temizle düğmesi aramayı sıfırlar', async () => {
        const { api } = renderBrowser();
        await screen.findByText('Güzel Vadi');
        api.maps.mockResolvedValueOnce({ maps: [MAP_B], pagination: { current_page: 1, last_page: 1, total: 1 } });
        fireEvent.change(screen.getByLabelText('Harita ya da oyuncu ara'), { target: { value: '  kristal ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
        expect(await screen.findByText('Kristal Kule')).toBeInTheDocument();
        expect(api.maps).toHaveBeenLastCalledWith({ sort: 'new', q: 'kristal', page: 1 });

        fireEvent.click(screen.getByRole('button', { name: 'Aramayı temizle' }));
        await waitFor(() => expect(api.maps).toHaveBeenLastCalledWith({ sort: 'new', q: '', page: 1 }));
        expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
    });

    it('sonuç yoksa boş durum (aramada farklı metin)', async () => {
        const api = fakeApi({ maps: vi.fn(() => Promise.resolve({ maps: [], pagination: { current_page: 1, last_page: 1, total: 0 } })) });
        renderBrowser({ api });
        expect(await screen.findByText('Henüz yayınlanmış harita yok')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Harita ya da oyuncu ara'), { target: { value: 'yok' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ara' }));
        expect(await screen.findByText('Aramana uyan harita bulunamadı')).toBeInTheDocument();
    });

    it('sayfalama: "Daha fazla göster" 2. sayfayı ekler, tekrarlananı eler, son sayfada düğme kalkar', async () => {
        const api = fakeApi({
            maps: vi
                .fn()
                .mockResolvedValueOnce({ maps: [MAP_A, MAP_B], pagination: { current_page: 1, last_page: 2, total: 3 } })
                .mockResolvedValueOnce({ maps: [MAP_B, MAP_C], pagination: { current_page: 2, last_page: 2, total: 3 } }),
        });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        fireEvent.click(screen.getByRole('button', { name: 'Daha fazla göster' }));
        expect(await screen.findByText('Ada Köyü')).toBeInTheDocument();
        expect(api.maps).toHaveBeenLastCalledWith({ sort: 'new', q: '', page: 2 });
        expect(cards()).toHaveLength(3);
        expect(screen.queryByRole('button', { name: 'Daha fazla göster' })).not.toBeInTheDocument();
    });

    it('"Daha fazla" çift tıklamada tek istek atar', async () => {
        const d = deferred();
        const api = fakeApi({
            maps: vi
                .fn()
                .mockResolvedValueOnce({ maps: [MAP_A], pagination: { current_page: 1, last_page: 2, total: 2 } })
                .mockReturnValueOnce(d.promise),
        });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        const more = screen.getByRole('button', { name: 'Daha fazla göster' });
        fireEvent.click(more);
        fireEvent.click(more);
        expect(api.maps).toHaveBeenCalledTimes(2);
        d.resolve({ maps: [MAP_C], pagination: { current_page: 2, last_page: 2, total: 2 } });
        await screen.findByText('Ada Köyü');
    });

    it('yükleme hatası: uyarı ve "Tekrar dene" ile yeniden yükler', async () => {
        const api = fakeApi({ maps: vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValue({ maps: [MAP_A], pagination: { current_page: 1, last_page: 1, total: 1 } }) });
        renderBrowser({ api });
        expect(await screen.findByRole('alert')).toHaveTextContent('Sunucuda bir sorun oluştu');
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
    });

    it('beğeni: iyimser güncelleme, sunucu sayısı geçerli; çift tıklama tek istek', async () => {
        const d = deferred();
        const api = fakeApi({ like: vi.fn(() => d.promise) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        const btn = within(cards()[0]).getByRole('button', { name: /Beğen: Güzel Vadi/ });
        fireEvent.click(btn);
        fireEvent.click(btn);
        expect(api.like).toHaveBeenCalledTimes(1);
        // iyimser
        expect(within(cards()[0]).getByRole('button', { name: /Beğeniyi geri al: Güzel Vadi\. 13 beğeni/ })).toHaveAttribute('aria-pressed', 'true');
        d.resolve({ liked: true, likes: 15 });
        await waitFor(() => expect(within(cards()[0]).getByRole('button', { name: /15 beğeni/ })).toBeInTheDocument());
    });

    it('beğeni hatası geri alınır ve toast gösterir', async () => {
        const api = fakeApi({ like: vi.fn(() => Promise.reject(httpError(429))) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        fireEvent.click(within(cards()[0]).getByRole('button', { name: /Beğen: Güzel Vadi/ }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Çok hızlı')));
        expect(within(cards()[0]).getByRole('button', { name: /Beğen: Güzel Vadi\. 12 beğeni/ })).toHaveAttribute('aria-pressed', 'false');
    });

    it('kendi haritanda beğeni/raporla düğmesi yok', async () => {
        const api = fakeApi({ maps: vi.fn(() => Promise.resolve({ maps: [{ ...MAP_A, mine: true }], pagination: { current_page: 1, last_page: 1, total: 1 } })) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        expect(screen.queryByRole('button', { name: /^Beğen/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Raporla/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Oyna: Güzel Vadi' })).toBeInTheDocument();
    });

    it('Oyna: onPlay harita nesnesiyle çağrılır', async () => {
        const { onPlay } = renderBrowser();
        await screen.findByText('Güzel Vadi');
        fireEvent.click(screen.getByRole('button', { name: 'Oyna: Kristal Kule' }));
        expect(onPlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'map-b', title: 'Kristal Kule' }));
    });

    it('raporla: diyalog, neden zorunlu, gönderim ve teşekkür; yinelenen rapor da kabul', async () => {
        const api = fakeApi({ report: vi.fn(() => Promise.resolve({ reported: true, duplicate: true, hidden: false })) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        fireEvent.click(screen.getByRole('button', { name: 'Raporla: Güzel Vadi' }));
        const dlg = screen.getByRole('dialog', { name: 'Haritayı raporla' });
        expect(dlg).toHaveAttribute('aria-modal', 'true');

        // neden seçmeden gönderme
        fireEvent.click(within(dlg).getByRole('button', { name: 'Raporla' }));
        expect(await within(dlg).findByRole('alert')).toHaveTextContent('Lütfen bir neden seç.');
        expect(api.report).not.toHaveBeenCalled();

        fireEvent.click(within(dlg).getByLabelText(/Spam/));
        fireEvent.change(within(dlg).getByLabelText(/Not/), { target: { value: ' reklam var ' } });
        fireEvent.click(within(dlg).getByRole('button', { name: 'Raporla' }));
        expect(await screen.findByText('Teşekkürler')).toBeInTheDocument();
        expect(api.report).toHaveBeenCalledWith('map-a', { reason: 'spam', note: 'reklam var' });
        fireEvent.click(screen.getByRole('button', { name: 'Tamam' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('rapor eşiği aşıp harita gizlenirse listeden hemen kalkar', async () => {
        const api = fakeApi({ report: vi.fn(() => Promise.resolve({ reported: true, duplicate: false, hidden: true })) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        fireEvent.click(screen.getByRole('button', { name: 'Raporla: Güzel Vadi' }));
        fireEvent.click(screen.getByLabelText(/Uygunsuz içerik/));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Raporla' }));
        await screen.findByText('Teşekkürler');
        await waitFor(() => expect(screen.queryByText('Güzel Vadi')).not.toBeInTheDocument());
        expect(cards()).toHaveLength(1);
    });

    it('rapor hatası diyalogda gösterilir ve tekrar denenebilir', async () => {
        const api = fakeApi({ report: vi.fn().mockRejectedValueOnce(httpError(422, undefined, 'Kendi haritanı raporlayamazsın.')).mockResolvedValue({ reported: true, duplicate: false, hidden: false }) });
        renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        fireEvent.click(screen.getByRole('button', { name: 'Raporla: Güzel Vadi' }));
        fireEvent.click(screen.getByLabelText(/Diğer/));
        const send = () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Raporla' }));
        send();
        expect(await screen.findByRole('alert')).toHaveTextContent('Kendi haritanı raporlayamazsın.');
        send();
        expect(await screen.findByText('Teşekkürler')).toBeInTheDocument();
        expect(api.report).toHaveBeenCalledTimes(2);
    });

    it('kapak: güvenli data-URL görsel olarak, güvensiz kaynak yedek voxel olarak çizilir', async () => {
        const api = fakeApi({
            maps: vi.fn(() =>
                Promise.resolve({
                    maps: [
                        { ...MAP_A, cover: 'data:image/jpeg;base64,AAAA' },
                        { ...MAP_B, cover: 'https://evil.example/x.png' },
                    ],
                    pagination: { current_page: 1, last_page: 1, total: 2 },
                })
            ),
        });
        const { container } = renderBrowser({ api });
        await screen.findByText('Güzel Vadi');
        const imgs = container.querySelectorAll('img');
        expect(imgs).toHaveLength(1);
        expect(imgs[0].getAttribute('src')).toBe('data:image/jpeg;base64,AAAA');
        expect(imgs[0]).toHaveAttribute('alt', '');
    });
});
