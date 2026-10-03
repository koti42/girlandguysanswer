// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
 * Yazılı odanın sahibi çıkarken: kapat / açık bırak / vazgeç penceresi ve
 * örtük çıkışlarda (unmount, beforeunload) odanın sessizce kapanmaması.
 * Sesli oda ve sahibi olmayan kullanıcı eski akışta kalır.
 */

const auth = { user: { id: 7, username: 'ayse' } };
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../layouts/MainLayout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../components/Widgets', () => ({ TrendsWidget: () => null, TopUsersWidget: () => null }));
vi.mock('../../components/SEO', () => ({ default: () => null }));
vi.mock('@livekit/components-styles', () => ({}));
vi.mock('@livekit/components-react', () => ({ LiveKitRoom: ({ children }) => <div>{children}</div> }));
vi.mock('../../components/Community/Room/TextRoomUI', () => ({
    default: ({ onLeave }) => <button type="button" onClick={onLeave}>Yazılı odadan ayrıl</button>,
}));
vi.mock('../../components/Community/Room/VoiceRoomUI', () => ({
    default: ({ onLeave }) => <button type="button" onClick={onLeave}>Sesli odadan ayrıl</button>,
}));
vi.mock('../../components/Community/Room/InRoomChat', () => ({ default: () => null }));
vi.mock('../../services/echo', () => {
    const channel = { listen: () => channel };
    return { echo: { private: () => channel, leave: vi.fn() } };
});
vi.mock('react-hot-toast', () => {
    const toast = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() });
    return { toast, default: toast };
});
vi.mock('../../services/api', () => ({
    communityAPI: { join: vi.fn(), leave: vi.fn(), raiseHand: vi.fn() },
}));

import { communityAPI } from '../../services/api';
import { toast } from 'react-hot-toast';
import RoomPage from '../RoomPage';

const joinResponse = ({ uuid, type, isOwner }) => ({
    data: {
        data: {
            community: {
                id: 1,
                uuid,
                type,
                title: 'Oda',
                participants_count: 2,
                current_user: { is_owner: isOwner, role: isOwner ? 'host' : 'listener' },
            },
            livekit_token: type === 'voice' ? 'lk-token' : null,
            livekit_url: type === 'voice' ? 'wss://lk' : null,
        },
    },
});

const renderRoom = (uuid) =>
    render(
        <MemoryRouter initialEntries={[`/community/${uuid}`]}>
            <Routes>
                <Route path="/community/:uuid" element={<RoomPage />} />
                <Route path="/communities" element={<div>Meydan listesi</div>} />
            </Routes>
        </MemoryRouter>
    );

const DIALOG_TITLE = 'Odanı kapatmak istiyor musun?';

describe('RoomPage — yazılı oda sahibinin çıkışı', () => {
    let fetchMock;

    beforeEach(() => {
        vi.clearAllMocks();
        communityAPI.leave.mockResolvedValue({ data: { data: { community_closed: true } } });
        fetchMock = vi.fn(() => Promise.resolve({}));
        vi.stubGlobal('fetch', fetchMock);
        // Eski akış tam sayfa yönlendirir (window.location.href); jsdom'da taklit
        vi.stubGlobal('location', { ...window.location, href: 'http://localhost/community/x' });
        localStorage.setItem('token', 'tkn');
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('sahip çıkış düğmesine basınca onay penceresi açılır; Vazgeç odada tutar', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        const user = userEvent.setup();
        renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        const dialog = screen.getByRole('dialog', { name: DIALOG_TITLE });
        expect(dialog).toHaveTextContent('48 saat içinde geri dönmezsen oda otomatik kapanır');
        expect(screen.getByRole('button', { name: 'Vazgeç' })).toHaveFocus();

        await user.click(screen.getByRole('button', { name: 'Vazgeç' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(communityAPI.leave).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Yazılı odadan ayrıl' })).toBeInTheDocument();
    });

    it('Escape pencereyi kapatır, istek gitmez', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        const user = userEvent.setup();
        renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(communityAPI.leave).not.toHaveBeenCalled();
    });

    it('"Odayı kapat" keep_open false gönderir ve listeye döner; ardından ikinci istek yok', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        const user = userEvent.setup();
        const { unmount } = renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        await user.click(screen.getByRole('button', { name: 'Odayı kapat' }));

        expect(await screen.findByText('Meydan listesi')).toBeInTheDocument();
        expect(communityAPI.leave).toHaveBeenCalledTimes(1);
        expect(communityAPI.leave).toHaveBeenCalledWith('txt', { keepOpen: false });

        window.dispatchEvent(new Event('beforeunload'));
        unmount();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(communityAPI.leave).toHaveBeenCalledTimes(1);
    });

    it('"Açık bırak" keep_open true gönderir, bilgi verir ve listeye döner', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        communityAPI.leave.mockResolvedValue({
            data: { data: { community_closed: false, closes_at: '2026-10-05T12:00:00Z' } },
        });
        const user = userEvent.setup();
        renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        await user.click(screen.getByRole('button', { name: 'Açık bırak' }));

        expect(await screen.findByText('Meydan listesi')).toBeInTheDocument();
        expect(communityAPI.leave).toHaveBeenCalledTimes(1);
        expect(communityAPI.leave).toHaveBeenCalledWith('txt', { keepOpen: true });
        expect(toast).toHaveBeenCalledWith(
            'Odan açık kalıyor. 48 saat içinde dönmezsen kapanacak.',
            expect.anything()
        );
    });

    it('"Açık bırak" isteği başarısızsa odada kalır ve hata gösterir', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        communityAPI.leave.mockRejectedValue(new Error('ağ'));
        const user = userEvent.setup();
        renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        await user.click(screen.getByRole('button', { name: 'Açık bırak' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalled());
        expect(screen.queryByText('Meydan listesi')).toBeNull();
        expect(screen.getByRole('dialog', { name: DIALOG_TITLE })).toBeInTheDocument();
    });

    it('sahip olmayan kullanıcıya pencere çıkmaz, doğrudan ayrılır', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: false }));
        const user = userEvent.setup();
        renderRoom('txt');

        await user.click(await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(window.location.href).toBe('/communities'));
        expect(communityAPI.leave).toHaveBeenCalledTimes(1);
        expect(communityAPI.leave.mock.calls[0]).toEqual(['txt']);
    });

    it('sesli oda sahibine pencere çıkmaz; ayrılış eskisi gibi (keep_open yok)', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'ses', type: 'voice', isOwner: true }));
        const user = userEvent.setup();
        renderRoom('ses');

        await user.click(await screen.findByRole('button', { name: 'Sesli odadan ayrıl' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(window.location.href).toBe('/communities'));
        expect(communityAPI.leave).toHaveBeenCalledTimes(1);
        expect(communityAPI.leave.mock.calls[0]).toEqual(['ses']);
    });

    it('yazılı oda sahibi sayfadan çıkınca (unmount) oda açık kalır: keep_open true', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        const { unmount } = renderRoom('txt');
        await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' });

        unmount();
        await waitFor(() => expect(communityAPI.leave).toHaveBeenCalledTimes(1));
        expect(communityAPI.leave).toHaveBeenCalledWith('txt', { keepOpen: true });
    });

    it('yazılı oda sahibi sekmeyi kapatınca keepalive isteği keep_open true taşır', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: true }));
        renderRoom('txt');
        await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' });

        window.dispatchEvent(new Event('beforeunload'));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/communities\/txt\/leave$/);
        expect(init.keepalive).toBe(true);
        expect(JSON.parse(init.body)).toEqual({ keep_open: true });
    });

    it('sesli oda sahibinin örtük çıkışı eskisi gibi odayı kapatır', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'ses', type: 'voice', isOwner: true }));
        const { unmount } = renderRoom('ses');
        await screen.findByRole('button', { name: 'Sesli odadan ayrıl' });

        window.dispatchEvent(new Event('beforeunload'));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({});

        unmount();
        await waitFor(() => expect(communityAPI.leave).toHaveBeenCalledTimes(1));
        expect(communityAPI.leave).toHaveBeenCalledWith('ses', undefined);
    });

    it('sahip olmayan kullanıcının örtük çıkışı leave göndermez', async () => {
        communityAPI.join.mockResolvedValue(joinResponse({ uuid: 'txt', type: 'text', isOwner: false }));
        const { unmount } = renderRoom('txt');
        await screen.findByRole('button', { name: 'Yazılı odadan ayrıl' });

        window.dispatchEvent(new Event('beforeunload'));
        unmount();
        await Promise.resolve();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(communityAPI.leave).not.toHaveBeenCalled();
    });
});
