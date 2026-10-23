// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { api, toast, auth } = vi.hoisted(() => ({
    api: {
        kesifMaps: vi.fn(), kesifMap: vi.fn(), kesifHide: vi.fn(), kesifRestore: vi.fn(), kesifRemove: vi.fn(),
        kesifHandleReports: vi.fn(), kesifBulkHandle: vi.fn(),
    },
    toast: { success: vi.fn(), error: vi.fn() },
    auth: { isAdmin: true },
}));

vi.mock('../../panel/api/endpoints', () => ({ modApi: api }));
vi.mock('../../panel/hooks/useToast', () => ({ useToast: () => toast }));
vi.mock('../../panel/auth/PanelAuthContext', () => ({ usePanelAuth: () => ({ isAdmin: auth.isAdmin }) }));

import KesifMaps from './KesifMaps';
import { accountAgeLabel, paletteRows, reasonSummary, statusMeta, withStatus } from './kesifMapsUtils';

const ok = (data, message = '') => Promise.resolve({ data: { success: true, message, data } });
const fail = (message, status = 403) => Promise.reject({ response: { status, data: { success: false, message } } });

const base = (o) => ({
    id: 'm1', title: 'Raporlu Kale', description: 'Büyük bir kale', status: 'ok', visibility: 'public',
    author: { id: 'u1', username: 'yapici_ali' }, likes: 3, plays: 7, reports: 3, reports_open: 3,
    reason_counts: { uygunsuz: 2, spam: 1 }, block_count: 1536, data_bytes: 2048, cover: 'data:image/jpeg;base64,AAAA',
    created_at: new Date().toISOString(), author_banned: false, ...o,
});
const rows = [base(), base({ id: 'm2', title: 'Temiz Ev', reports: 1, reports_open: 1, reason_counts: { diger: 1 }, cover: null })];

const detailOf = (m) => ({
    map: { ...m, stats: { chunks: 2, solid: 1536, base: 'düz', time: 'gündüz', size: { x: 128, z: 128 }, spawn: { 0: 8 }, palette: [{ id: 1, count: 1024 }, { id: 3, count: 512 }] } },
    reports: [
        { id: 11, reason: 'uygunsuz', note: 'Kötü yazı var', user: { id: 'r1', username: 'rapor_eden' }, user_created_at: new Date(Date.now() - 3 * 86400000).toISOString(), handled_at: null, created_at: new Date().toISOString() },
    ],
    actions: [{ id: 'a1', action: 'game_kesif_map_hide', reason: 'Önceki gizleme', actor: { id: 'mod1', username: 'mod_ayse' }, created_at: new Date().toISOString() }],
});

const listBody = (maps = rows, extra = {}) => ({ maps, pagination: { current_page: 1, last_page: 1, total_pages: 1, total: maps.length, per_page: 24 }, counts: { reported: maps.length, hidden: 0, removed: 0 }, ...extra });

beforeEach(() => {
    vi.clearAllMocks();
    auth.isAdmin = true;
    api.kesifMaps.mockImplementation(() => ok(listBody()));
    api.kesifMap.mockImplementation((id) => ok(detailOf(rows.find((r) => r.id === id) || rows[0])));
    // Sunucu gibi davran: işlemden sonra liste güncel durumu döner.
    api.kesifHide.mockImplementation(() => {
        api.kesifMaps.mockImplementation(() => ok(listBody([base({ status: 'hidden', reports_open: 0, reason_counts: {} }), rows[1]])));
        api.kesifMap.mockImplementation(() => ok(detailOf(base({ status: 'hidden', reports_open: 0, reason_counts: {} }))));
        return ok({ map: { ...rows[0], status: 'hidden', reports_open: 0, reason_counts: {} } }, 'Harita gizlendi.');
    });
    api.kesifRestore.mockImplementation(() => ok({ map: { ...rows[0], status: 'ok', reports_open: 0 } }, 'Harita yeniden açıldı.'));
    api.kesifRemove.mockImplementation(() => {
        api.kesifMaps.mockImplementation(() => ok(listBody([base({ status: 'removed', reports_open: 0, reason_counts: {} }), rows[1]])));
        return ok({ map: { ...rows[0], status: 'removed', reports_open: 0 } }, 'Harita kaldırıldı.');
    });
    api.kesifHandleReports.mockImplementation(() => ok({ handled: 3, map: { ...rows[0], reports_open: 0 } }, 'Raporlar işlendi.'));
    api.kesifBulkHandle.mockImplementation(() => ok({ handled: 4, maps: [] }, 'Raporlar işlendi.'));
});

const mount = () => render(<MemoryRouter><KesifMaps /></MemoryRouter>);
const openFirst = async () => {
    await screen.findByTestId('kesif-list');
    fireEvent.click(screen.getByRole('button', { name: 'İncele: Raporlu Kale' }));
    await screen.findByTestId('kesif-drawer');
};

describe('Mod > Keşif haritaları', () => {
    it('raporlu haritaları kartlarda gösterir: kapak, rapor sayısı, neden özeti, yazar bağlantısı', async () => {
        mount();
        const list = await screen.findByTestId('kesif-list');
        expect(api.kesifMaps).toHaveBeenCalledWith(expect.objectContaining({ reported: 1, sort: 'reports', page: 1 }));
        const card = within(list).getByTestId('kesif-card-m1');
        expect(within(card).getByText('3 rapor')).toBeInTheDocument();
        expect(within(card).getByText('Uygunsuz içerik ×2')).toBeInTheDocument();
        expect(within(card).getByText('Spam ×1')).toBeInTheDocument();
        expect(within(card).getByText('@yapici_ali').closest('a')).toHaveAttribute('href', '/mod/users/u1');
        expect(card.querySelector('img')).toHaveAttribute('src', 'data:image/jpeg;base64,AAAA');
        expect(screen.getByTestId('kesif-alert')).toHaveTextContent('2');
    });

    it('yükleniyor, boş ve hata durumlarını gösterir', async () => {
        api.kesifMaps.mockImplementationOnce(() => new Promise(() => {}));
        const { unmount } = mount();
        expect(screen.getByTestId('kesif-loading')).toBeInTheDocument();
        unmount();

        api.kesifMaps.mockImplementationOnce(() => ok(listBody([], { counts: { reported: 0, hidden: 0, removed: 0 } })));
        const second = mount();
        expect(await screen.findByText('İşlenmemiş rapor yok')).toBeInTheDocument();
        second.unmount();

        api.kesifMaps.mockImplementationOnce(() => fail('Sunucu hatası', 500));
        mount();
        expect(await screen.findByText('Sunucu hatası')).toBeInTheDocument();
        api.kesifMaps.mockImplementationOnce(() => ok(listBody()));
        fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
        expect(await screen.findByTestId('kesif-list')).toBeInTheDocument();
    });

    it('sekme, görünürlük, sıralama ve arama süzgeçlerini API parametresine çevirir', async () => {
        mount();
        await screen.findByTestId('kesif-list');
        fireEvent.click(screen.getByRole('tab', { name: /Gizli/ }));
        await waitFor(() => expect(api.kesifMaps).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'hidden' })));
        fireEvent.change(screen.getByLabelText('Görünürlük'), { target: { value: 'private' } });
        await waitFor(() => expect(api.kesifMaps).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'hidden', visibility: 'private' })));
        fireEvent.change(screen.getByLabelText('Sıralama'), { target: { value: 'newest' } });
        await waitFor(() => expect(api.kesifMaps).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'newest' })));
        fireEvent.change(screen.getByLabelText('Başlık veya yazar ara…'), { target: { value: 'ali' } });
        await waitFor(() => expect(api.kesifMaps).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'ali' })), { timeout: 2000 });
    });

    it('sayfalama: birden çok sayfada sonraki sayfayı ister', async () => {
        api.kesifMaps.mockImplementation(() => ok(listBody(rows, { pagination: { current_page: 1, last_page: 3, total_pages: 3, total: 60, per_page: 24 } })));
        mount();
        await screen.findByTestId('kesif-list');
        fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
        await waitFor(() => expect(api.kesifMaps).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    });

    it('ayrıntı çekmecesi: rapor listesi, palet adları, işlem geçmişi', async () => {
        mount();
        await openFirst();
        expect(api.kesifMap).toHaveBeenCalledWith('m1');
        const reports = await screen.findByTestId('kesif-reports');
        expect(within(reports).getByText('@rapor_eden')).toBeInTheDocument();
        expect(within(reports).getByText('Kötü yazı var')).toBeInTheDocument();
        expect(within(reports).getByText('hesap 3 gün')).toBeInTheDocument();
        const pal = await screen.findByTestId('kesif-palette');
        expect(within(pal).getAllByRole('listitem')).toHaveLength(2);
        expect(within(pal).getByText(/%66,7|%66\.7/)).toBeInTheDocument();
        expect(screen.getByText('Keşif haritası gizlendi')).toBeInTheDocument();
        expect(screen.getByText('Önceki gizleme')).toBeInTheDocument();
        expect(screen.getByTestId('kesif-author-link')).toHaveAttribute('href', '/mod/users/u1');
    });

    it('Gizle: gerekçe zorunlu; iyimser durum güncellenir ve başarı bildirimi çıkar', async () => {
        mount();
        await openFirst();
        fireEvent.click(screen.getByTestId('kesif-act-hide'));
        const submit = await screen.findByTestId('reason-submit');
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'Uygunsuz yapı' } });
        expect(submit).not.toBeDisabled();
        fireEvent.click(submit);
        await waitFor(() => expect(api.kesifHide).toHaveBeenCalledWith('m1', { reason: 'Uygunsuz yapı' }));
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Harita gizlendi.'));
        const card = screen.getByTestId('kesif-card-m1');
        await waitFor(() => expect(within(card).getByText('Gizli')).toBeInTheDocument());
        expect(within(card).queryByText('3 rapor')).not.toBeInTheDocument();
        expect(screen.getByTestId('kesif-act-restore')).toBeInTheDocument();
    });

    it('hata olursa iyimser güncelleme geri alınır ve sunucu mesajı gösterilir', async () => {
        api.kesifHide.mockImplementationOnce(() => fail('Bu işlem için moderasyon seviyeniz yetersiz.'));
        mount();
        await openFirst();
        fireEvent.click(screen.getByTestId('kesif-act-hide'));
        fireEvent.change(await screen.findByTestId('reason-input'), { target: { value: 'Uygunsuz yapı' } });
        fireEvent.click(screen.getByTestId('reason-submit'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Bu işlem için moderasyon seviyeniz yetersiz.'));
        const card = screen.getByTestId('kesif-card-m1');
        expect(within(card).getByText('3 rapor')).toBeInTheDocument();
        expect(within(card).queryByText('Gizli')).not.toBeInTheDocument();
    });

    it('Yeniden aç ve Raporları işlendi say onay ister', async () => {
        api.kesifMaps.mockImplementation(() => ok(listBody([base({ status: 'hidden' }), rows[1]])));
        api.kesifMap.mockImplementation(() => ok(detailOf(base({ status: 'hidden' }))));
        mount();
        await openFirst();
        fireEvent.click(await screen.findByTestId('kesif-act-restore'));
        fireEvent.click(await screen.findByTestId('confirm-button'));
        await waitFor(() => expect(api.kesifRestore).toHaveBeenCalledWith('m1', {}));

        fireEvent.click(await screen.findByTestId('kesif-act-handle'));
        fireEvent.click(await screen.findByTestId('confirm-button'));
        await waitFor(() => expect(api.kesifHandleReports).toHaveBeenCalledWith('m1', {}));
    });

    it('Kaldır yalnızca yöneticiye görünür ve gerekçe ister', async () => {
        auth.isAdmin = false;
        const first = mount();
        await openFirst();
        expect(screen.queryByTestId('kesif-act-remove')).not.toBeInTheDocument();
        first.unmount();

        auth.isAdmin = true;
        mount();
        await openFirst();
        fireEvent.click(screen.getByTestId('kesif-act-remove'));
        expect(await screen.findByText('Kalıcı olarak kaldır')).toBeInTheDocument();
        expect(screen.getByTestId('reason-submit')).toBeDisabled();
        fireEvent.change(screen.getByTestId('reason-input'), { target: { value: 'Çocuk güvenliği ihlali' } });
        fireEvent.click(screen.getByTestId('reason-submit'));
        await waitFor(() => expect(api.kesifRemove).toHaveBeenCalledWith('m1', { reason: 'Çocuk güvenliği ihlali' }));
        await waitFor(() => expect(within(screen.getByTestId('kesif-card-m1')).getByText('Kaldırıldı')).toBeInTheDocument());
    });

    it('toplu seçim: seçilenlerin raporlarını işlendi sayar', async () => {
        mount();
        await screen.findByTestId('kesif-list');
        fireEvent.click(screen.getByLabelText('Seç: Raporlu Kale'));
        fireEvent.click(screen.getByLabelText('Seç: Temiz Ev'));
        expect(screen.getByTestId('kesif-bulkbar')).toHaveTextContent('2');
        fireEvent.click(screen.getByTestId('kesif-bulk-handle'));
        fireEvent.click(await screen.findByTestId('confirm-button'));
        await waitFor(() => expect(api.kesifBulkHandle).toHaveBeenCalledWith({ ids: ['m1', 'm2'] }));
        await waitFor(() => expect(screen.queryByTestId('kesif-bulkbar')).not.toBeInTheDocument());
    });
});

describe('kesifMapsUtils', () => {
    it('durum etiketi görünürlükle okunur', () => {
        expect(statusMeta({ status: 'ok', visibility: 'public' }).label).toBe('Yayında');
        expect(statusMeta({ status: 'ok', visibility: 'private' }).label).toBe('Özel');
        expect(statusMeta({ status: 'hidden' })).toMatchObject({ label: 'Gizli', tone: 'warning' });
        expect(statusMeta({ status: 'removed' })).toMatchObject({ label: 'Kaldırıldı', tone: 'danger' });
    });
    it('neden özeti çoktan aza sıralanır, bilinmeyen anahtar olduğu gibi kalır', () => {
        expect(reasonSummary({ spam: 1, siddet: 4, x_yeni: 2, bos: 0 }).map((r) => [r.label, r.count])).toEqual([['Şiddet', 4], ['x_yeni', 2], ['Spam', 1]]);
        expect(reasonSummary(undefined)).toEqual([]);
    });
    it('hesap yaşı ve palet yüzdesi', () => {
        const now = Date.parse('2026-10-16T12:00:00Z');
        expect(accountAgeLabel('2026-10-16T05:00:00Z', now)).toBe('hesap 24 saatten yeni');
        expect(accountAgeLabel('2026-10-10T12:00:00Z', now)).toBe('hesap 6 gün');
        expect(accountAgeLabel(null, now)).toBe('');
        expect(paletteRows({ solid: 200, palette: [{ id: 1, count: 150 }, { id: 9, count: 50 }] }, (id) => (id === 1 ? 'Taş' : '')))
            .toEqual([{ id: 1, name: 'Taş', count: 150, pct: 75 }, { id: 9, name: 'Blok #9', count: 50, pct: 25 }]);
        expect(paletteRows({ solid: 0, palette: [{ id: 1, count: 0 }] })[0].pct).toBe(0);
    });
    it('withStatus açık raporları sıfırlar', () => {
        expect(withStatus({ id: 1, status: 'ok', reports_open: 3, reason_counts: { spam: 3 } }, 'hidden')).toEqual({ id: 1, status: 'hidden', reports_open: 0, reason_counts: {} });
    });
});
