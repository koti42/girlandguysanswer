// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

vi.mock('../viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import AvatarPreview from '../AvatarPreview';
import { loadAvatarViewer } from '../viewerLoader';
import { defaultAvatar } from '../../../../game/avatar/catalog';

const realGetContext = HTMLCanvasElement.prototype.getContext;

function fakeViewer({ ready = true } = {}) {
    const api = { setConfig: vi.fn(), resize: vi.fn(), destroy: vi.fn() };
    const created = [];
    const mod = {
        createAvatarViewer: vi.fn((opts) => {
            created.push(opts);
            Promise.resolve().then(() => opts.onReady(ready));
            return api;
        }),
    };
    loadAvatarViewer.mockResolvedValue(mod);
    return { api, mod, created };
}

describe('AvatarPreview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.WebGL2RenderingContext = function WebGL2RenderingContext() {};
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
    });
    afterEach(() => {
        delete window.WebGL2RenderingContext;
        HTMLCanvasElement.prototype.getContext = realGetContext;
    });

    it('WebGL2 varsa görüntüleyiciyi yükler, hazır olunca 3D moda geçer ve seçimi setConfig ile iletir', async () => {
        const { api, mod, created } = fakeViewer();
        const cfg = defaultAvatar('female');
        const { rerender, unmount } = render(<AvatarPreview config={cfg} />);
        // İlk karede portre görünür, boş kutu yok.
        expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', 'loading');
        expect(screen.getByRole('img', { name: 'Karakter önizlemesi' })).toBeInTheDocument();

        await waitFor(() => expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '3d'));
        expect(mod.createAvatarViewer).toHaveBeenCalledTimes(1);
        expect(created[0].config).toEqual(cfg);
        expect(created[0].transparent).toBe(true);
        expect(created[0].container).toBeInstanceOf(HTMLElement);
        expect(screen.getByText('Döndürmek için sürükle')).toBeInTheDocument();

        const next = { ...cfg, acc: 'tac' };
        rerender(<AvatarPreview config={next} />);
        expect(api.setConfig).toHaveBeenLastCalledWith(next);
        // Aynı içerikli yeni nesne: gereksiz setConfig yok.
        const calls = api.setConfig.mock.calls.length;
        rerender(<AvatarPreview config={{ ...next }} />);
        expect(api.setConfig.mock.calls.length).toBe(calls);

        unmount();
        expect(api.destroy).toHaveBeenCalledTimes(1);
    });

    it('görüntüleyici onReady(false) derse 2D portreye düşer', async () => {
        fakeViewer({ ready: false });
        render(<AvatarPreview config={defaultAvatar()} label="Önizleme" />);
        await waitFor(() => expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '2d'));
        expect(screen.getByRole('img', { name: 'Önizleme' })).toBeInTheDocument();
    });

    it('parça yüklenemezse 2D portreye düşer', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        loadAvatarViewer.mockRejectedValue(new Error('chunk'));
        render(<AvatarPreview config={defaultAvatar()} />);
        await waitFor(() => expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '2d'));
        spy.mockRestore();
    });

    it('StrictMode çift montajında tek görüntüleyici kalır, ilk örnek yok edilir', async () => {
        const { api, mod } = fakeViewer();
        const { unmount } = render(
            <StrictMode>
                <AvatarPreview config={defaultAvatar()} />
            </StrictMode>
        );
        await waitFor(() => expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '3d'));
        await act(async () => {});
        const live = mod.createAvatarViewer.mock.calls.length - api.destroy.mock.calls.length;
        expect(live).toBe(1);
        unmount();
        expect(api.destroy.mock.calls.length).toBe(mod.createAvatarViewer.mock.calls.length);
    });

    it('WebGL2 yoksa parçayı hiç indirmez', () => {
        delete window.WebGL2RenderingContext;
        render(<AvatarPreview config={defaultAvatar()} />);
        expect(screen.getByTestId('avatar-preview')).toHaveAttribute('data-mode', '2d');
        expect(loadAvatarViewer).not.toHaveBeenCalled();
    });
});
