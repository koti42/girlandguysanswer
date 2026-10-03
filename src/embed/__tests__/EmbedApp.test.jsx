// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';

configure({ asyncUtilTimeout: 4000 });

vi.mock('../../pages/game/runner/engineLoader', () => ({ loadRunnerEngine: vi.fn(() => new Promise(() => {})) }));
vi.mock('../../pages/game/tower/engineLoader', () => ({ loadTowerEngine: vi.fn(() => new Promise(() => {})) }));
vi.mock('../../components/game/avatar/viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import { loadAvatarViewer } from '../../components/game/avatar/viewerLoader';
import { loadRunnerEngine } from '../../pages/game/runner/engineLoader';
import { loadTowerEngine } from '../../pages/game/tower/engineLoader';
import EmbedApp from '../EmbedApp';
import EmbedErrorBoundary from '../EmbedErrorBoundary';
import { __resetBridgeForTests, receiveFromNative } from '../bridge';
import { createEmbedApi } from '../embedApi';
import { normalizeAvatar } from '../../game/avatar/catalog';

const AVATAR = { v: 1, body: 'erkek', skin: 4, hair: { style: 'kivircik', color: 2 }, top: { style: 'forma', color: 6 }, bottom: { style: 'sort', color: 3 }, shoes: { style: 'bot', color: 10 }, acc: 'kulaklik', trail: 'neon' };

const config = (over = {}) => ({
    v: 1,
    platform: 'ios',
    token: null,
    user: { id: 'u1', username: 'mert', gender: 'male' },
    safeArea: null,
    muted: false,
    music: true,
    haptics: true,
    avatar: null,
    native: true,
    ...over,
});

let posted;
const lastOf = (type) => [...posted].reverse().find((m) => m.type === type);

describe('EmbedApp: mod yönlendirme', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        posted = [];
        window.ReactNativeWebView = { postMessage: (json) => posted.push(JSON.parse(json)) };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
        window.WebGL2RenderingContext = function WebGL2RenderingContext() {};
        document.documentElement.classList.remove('hs-embed-transparent');
    });

    afterEach(() => {
        cleanup();
        delete window.ReactNativeWebView;
        delete window.WebGL2RenderingContext;
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
    });

    it('game=kosu koşu oyununu açar (site kabuğu yok) ve ready bildirir', async () => {
        render(<EmbedApp config={config()} game="kosu" />);
        expect(await screen.findByTestId('runner-stage')).toBeInTheDocument();
        expect(loadRunnerEngine).toHaveBeenCalled();
        expect(posted.filter((m) => m.type === 'ready')).toEqual([{ type: 'ready', game: 'kosu' }]);
        expect(document.documentElement.classList.contains('hs-embed-transparent')).toBe(false);
    });

    it('game=kule kule oyununu açar (misafir antrenman) ve ready bildirir; yüklenirken "Vazgeç" çıkar', async () => {
        render(<EmbedApp config={config()} game="kule" />);
        expect(await screen.findByTestId('tower-stage')).toBeInTheDocument();
        await waitFor(() => expect(loadTowerEngine).toHaveBeenCalled());
        expect(loadRunnerEngine).not.toHaveBeenCalled();
        expect(posted.filter((m) => m.type === 'ready')).toEqual([{ type: 'ready', game: 'kule' }]);
        fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        expect(await screen.findByText('Oyundan çıkıldı.')).toBeInTheDocument();
    });

    it('bilinmeyen oyun: hata ekranı ve error mesajı', () => {
        render(<EmbedApp config={config()} game={null} />);
        expect(screen.getByRole('heading', { name: 'Oyun bulunamadı' })).toBeInTheDocument();
        expect(lastOf('error')).toEqual({ type: 'error', message: 'Bilinmeyen oyun.' });
        expect(lastOf('ready')).toBeUndefined();
    });

    it('game=avatar: şeffaf 3D önizleme, ilk görüntüde ready; setAvatar canlı uygulanır', async () => {
        const viewer = { setConfig: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
        let viewerOpts;
        loadAvatarViewer.mockResolvedValue({
            createAvatarViewer: vi.fn((o) => {
                viewerOpts = o;
                return viewer;
            }),
        });
        const view = render(<EmbedApp config={config({ avatar: AVATAR })} game="avatar" />);
        expect(document.documentElement.classList.contains('hs-embed-transparent')).toBe(true);
        await waitFor(() => expect(viewerOpts).toBeDefined());
        expect(viewerOpts.transparent).toBe(true);
        expect(viewerOpts.config).toEqual(normalizeAvatar(AVATAR, 'male'));
        expect(viewerOpts.container).toBeInstanceOf(HTMLElement);
        // Görüntü hazır olana kadar 2D portre görünür, ready gitmez.
        expect(screen.getByTestId('avatar-bust')).toBeInTheDocument();
        expect(lastOf('ready')).toBeUndefined();

        act(() => viewerOpts.onReady(true));
        expect(posted.filter((m) => m.type === 'ready')).toEqual([{ type: 'ready', game: 'avatar' }]);
        expect(screen.getByTestId('embed-avatar')).toHaveAttribute('data-mode', '3d');
        expect(screen.queryByTestId('avatar-bust')).toBeNull();

        act(() => {
            receiveFromNative({ type: 'setAvatar', avatar: { ...AVATAR, acc: 'tac', skin: 99 } });
        });
        expect(viewer.setConfig).toHaveBeenLastCalledWith({ ...AVATAR, acc: 'tac', skin: normalizeAvatar(null, 'male').skin });

        view.unmount();
        expect(viewer.destroy).toHaveBeenCalled();
    });

    it('game=avatar: WebGL 2 yoksa 2D portre ve hemen ready', async () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
        render(<EmbedApp config={config({ avatar: AVATAR })} game="avatar" />);
        expect(await screen.findByRole('img', { name: 'Karakter önizlemesi' })).toBeInTheDocument();
        expect(screen.getByTestId('embed-avatar')).toHaveAttribute('data-mode', '2d');
        expect(loadAvatarViewer).not.toHaveBeenCalled();
        await waitFor(() => expect(lastOf('ready')).toEqual({ type: 'ready', game: 'avatar' }));
    });

    it('game=avatar: görüntüleyici yüklenemezse 2D portreye düşer', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        loadAvatarViewer.mockRejectedValue(new Error('Failed to fetch dynamically imported module'));
        render(<EmbedApp config={config()} game="avatar" />);
        await waitFor(() => expect(screen.getByTestId('embed-avatar')).toHaveAttribute('data-mode', '2d'));
        expect(lastOf('ready')).toEqual({ type: 'ready', game: 'avatar' });
    });

    it('çizim hatası: yedek ekran, error mesajı ve çıkış', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => {
            throw new Error('boom');
        };
        render(
            <EmbedErrorBoundary>
                <Boom />
            </EmbedErrorBoundary>
        );
        expect(screen.getByTestId('embed-error')).toBeInTheDocument();
        expect(lastOf('error')).toEqual({ type: 'error', message: 'Oyun beklenmedik şekilde durdu.' });
        fireEvent.click(screen.getByRole('button', { name: 'Oyundan çık' }));
        expect(lastOf('exit')).toEqual({ type: 'exit' });
    });

    it('çizim hatası: hata ekranında native geri tuşu çıkış bildirir; söküldükten sonra dinlemez', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Boom = () => {
            throw new Error('boom');
        };
        const { unmount } = render(
            <EmbedErrorBoundary>
                <Boom />
            </EmbedErrorBoundary>
        );
        expect(screen.getByTestId('embed-error')).toBeInTheDocument();
        expect(posted.some((m) => m.type === 'exit')).toBe(false);
        expect(receiveFromNative({ type: 'back' })).toBe(true);
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        unmount();
        // Dinleyici kalmadı: native ok=false alır ve kendisi çıkar.
        expect(receiveFromNative({ type: 'back' })).toBe(false);
    });
});

describe('embedApi', () => {
    it('token yalnızca bellekten okunur, Authorization başlığına yazılır; localStorage\'a dokunulmaz', async () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const getItem = vi.spyOn(Storage.prototype, 'getItem');
        let token = '12|abc';
        const api = createEmbedApi(() => token);
        const seen = [];
        api.http.defaults.adapter = async (cfg) => {
            seen.push(cfg);
            return { data: { success: true, data: { run: { id: 'r1' } } }, status: 200, statusText: 'OK', headers: {}, config: cfg };
        };
        await expect(api.startRunner()).resolves.toEqual({ run: { id: 'r1' } });
        await api.finishRunner('r 1', { end_tick: 10, inputs: '1J', client_score: undefined });
        token = null;
        await api.abandonRunner('r1');

        expect(seen[0].headers.Authorization).toBe('Bearer 12|abc');
        expect(seen[0].headers['Idempotency-Key']).toBeTruthy();
        expect(seen[0].timeout).toBe(15000);
        expect(seen[1].url).toBe('/game/runner/r%201/finish');
        expect(JSON.parse(seen[1].data)).toEqual({ end_tick: 10, inputs: '1J' });
        expect(seen[1].headers['Idempotency-Key']).not.toBe(seen[0].headers['Idempotency-Key']);
        expect(seen[2].headers.Authorization).toBeUndefined();
        expect(setItem).not.toHaveBeenCalled();
        expect(getItem).not.toHaveBeenCalled();
    });

    it('403 (dondurulmuş hesap) sayfayı yönlendirmez, hata olduğu gibi döner', async () => {
        const api = createEmbedApi(() => 't');
        api.http.defaults.adapter = async (cfg) => {
            const err = new Error('Request failed with status code 403');
            err.response = { status: 403, data: { type: 'frozen', message: 'Hesabın donduruldu.' }, config: cfg };
            throw err;
        };
        const before = window.location.href;
        await expect(api.startRunner()).rejects.toMatchObject({ response: { status: 403 } });
        expect(window.location.href).toBe(before);
    });
});
