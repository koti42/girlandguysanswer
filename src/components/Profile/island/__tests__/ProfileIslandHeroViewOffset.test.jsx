// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
 * Ada kahramanı: dar ekranda bilgi kartı (alt sayfa) adayı örter; kahraman, kartın
 * kapladığı oranı ölçüp motora setViewOffset({ y }) ile iletir. Motor sahte; jsdom'da
 * yerleşim olmadığı için ölçüler (clientHeight / offsetTop / offsetParent) prototip
 * düzeyinde taklit edilir.
 */

const env = vi.hoisted(() => ({ webgl: true, reduced: false }));
vi.mock('../../../game/avatar/avatarUtils', async (importOriginal) => ({
    ...(await importOriginal()),
    hasWebGL2: () => env.webgl,
    prefersReducedMotion: () => env.reduced,
}));
vi.mock('../islandLoader', () => ({ loadIslandScene: vi.fn(), loadIslandHero: vi.fn() }));

import { loadIslandScene } from '../islandLoader';
import { resetIslandSupportCache } from '../islandUtils';
import ProfileIslandHero from '../ProfileIslandHero';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const PROFILE = {
    id: 'u1',
    username: 'devadmin',
    name: 'devadmin',
    gender: 'male',
    bio: 'Merhaba',
    level: { name: 'Usta Üye', color: '#8b5cf6' },
    ranks: { general: 7, gender: 3 },
    badges: [],
    stats: { questions: 1, answers: 2, opinions: 0, followers: 3, following: 4, likes: 5 },
    isPrivate: false,
    allow_messaging: true,
    messaging_mode: 'everyone',
    profile_theme: { key: 'ada', active: true },
};

let scene;
let layout;
let mq;
const protos = {};

const installEngine = () => {
    scene = {
        goTo: vi.fn(),
        next: vi.fn(),
        prev: vi.fn(),
        getStop: vi.fn(() => 0),
        resize: vi.fn(),
        setPaused: vi.fn(),
        setViewOffset: vi.fn(),
        destroy: vi.fn(),
    };
    const create = vi.fn(async (opts) => {
        opts.onReady();
        return scene;
    });
    loadIslandScene.mockResolvedValue({ createIslandScene: create });
    return create;
};

const installLayout = () => {
    const layer = (el) => el.classList.contains('ih-overlay') || el.classList.contains('ih');
    protos.clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    protos.offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    protos.offsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get() {
            return layer(this) ? layout.height : 0;
        },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
        configurable: true,
        get() {
            return this.classList.contains('ih-dock') ? layout.dockTop : 0;
        },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
        configurable: true,
        get() {
            return this.classList.contains('ih-dock') ? this.closest('.ih-overlay') : null;
        },
    });
};

const restoreLayout = () => {
    for (const k of ['clientHeight', 'offsetTop', 'offsetParent']) {
        if (protos[k]) Object.defineProperty(HTMLElement.prototype, k, protos[k]);
        else delete HTMLElement.prototype[k];
    }
};

const setNarrow = (matches) => {
    mq.matches = matches;
    window.matchMedia = vi.fn((q) => ({
        get matches() {
            return /max-width:\s*767px/.test(q) ? mq.matches : false;
        },
        media: q,
        addEventListener: (_t, cb) => mq.listeners.add(cb),
        removeEventListener: (_t, cb) => mq.listeners.delete(cb),
    }));
};

const renderHero = (props = {}) =>
    render(
        <MemoryRouter>
            <ProfileIslandHero profile={PROFILE} questions={[]} {...props} />
        </MemoryRouter>
    );

const lastY = () => scene.setViewOffset.mock.calls.map((c) => c[0].y);

beforeEach(() => {
    vi.clearAllMocks();
    env.webgl = true;
    env.reduced = false;
    resetIslandSupportCache();
    document.documentElement.removeAttribute('data-a11y');
    window.scrollBy = vi.fn();
    layout = { height: 600, dockTop: 300 };
    mq = { matches: true, listeners: new Set() };
    installLayout();
    setNarrow(true);
    installEngine();
});

afterEach(() => {
    restoreLayout();
    delete window.matchMedia;
});

describe('ProfileIslandHero: dar ekranda görünüm kaydırması', () => {
    it('kartın kapladığı oran (600px sahnenin alt 300px) -> y = 0.25 motora iletilir', async () => {
        renderHero();
        await flush();
        await waitFor(() => expect(scene.setViewOffset).toHaveBeenCalled());
        // İlk ölçüm sahne kurulmadan yapıldı: kurulunca anında (geçişsiz) uygulanır.
        expect(scene.setViewOffset).toHaveBeenLastCalledWith({ y: 0.25, immediate: true });
    });

    it('geniş ekranda kaydırma uygulanmaz (0 zaten 0: motora çağrı yok)', async () => {
        setNarrow(false);
        renderHero();
        await flush();
        expect(screen.getByTestId('island-hero')).toHaveAttribute('data-phase', 'ready');
        expect(scene.setViewOffset).not.toHaveBeenCalled();
    });

    it('kart gizlenince yalnız gezinti kalır: kaydırma küçülür; geri açılınca büyür', async () => {
        renderHero();
        await flush();
        expect(lastY().at(-1)).toBe(0.25);

        layout.dockTop = 540; // yalnız gezinti çubuğu (60px)
        fireEvent.click(screen.getByRole('button', { name: 'Bilgi kartını gizle' }));
        await flush();
        expect(lastY().at(-1)).toBeCloseTo(0.05, 10);

        layout.dockTop = 300;
        fireEvent.click(screen.getByRole('button', { name: 'Bilgi kartını göster' }));
        await flush();
        expect(lastY().at(-1)).toBe(0.25);
    });

    it('durak değişince kart yüksekliği değişirse yeniden ölçülür', async () => {
        renderHero();
        await flush();
        layout.dockTop = 360;
        fireEvent.click(screen.getByRole('button', { name: 'Sonraki durak' }));
        await flush();
        expect(lastY().at(-1)).toBeCloseTo(0.2, 10);
    });

    it('pencere boyutu değişince (döndürme/klavye) yeniden ölçülür', async () => {
        renderHero();
        await flush();
        layout.height = 400;
        layout.dockTop = 200;
        await act(async () => {
            window.dispatchEvent(new Event('resize'));
        });
        // 400px sahnede alt 200px örtülü: oran 0.5 -> y 0.25 (aynı) ; farklı oran için dockTop'u değiştir
        layout.dockTop = 100;
        await act(async () => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(lastY().at(-1)).toBe(0.36); // 300/400 / 2 = 0.375 -> üst sınır
    });

    it('geniş ekrana geçilince sıfırlanır (0 gönderilir)', async () => {
        renderHero();
        await flush();
        expect(lastY().at(-1)).toBe(0.25);
        setNarrow(false);
        await act(async () => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(lastY().at(-1)).toBe(0);
    });

    it('aşırı büyük kart: y üst sınırda (0.36), adanın görünür bölgesi hiç yok olmaz', async () => {
        layout.dockTop = 20;
        renderHero();
        await flush();
        expect(lastY().at(-1)).toBe(0.36);
    });

    it('ölçü yok (jsdom/yerleşim sıfır): motora kaydırma gönderilmez', async () => {
        layout.height = 0;
        renderHero();
        await flush();
        expect(scene.setViewOffset).not.toHaveBeenCalled();
    });

    it('sahne geç yüklenirse istenen kaydırma saklanır ve kurulunca anında uygulanır', async () => {
        let release;
        const create = vi.fn(async (opts) => {
            opts.onReady();
            return scene;
        });
        loadIslandScene.mockReturnValue(new Promise((res) => { release = res; }));
        renderHero();
        // Sahne yokken ölçüm yapıldı; motora henüz gidecek bir yer yok.
        expect(scene.setViewOffset).not.toHaveBeenCalled();
        await act(async () => { release({ createIslandScene: create }); });
        await waitFor(() => expect(scene.setViewOffset).toHaveBeenCalled());
        expect(scene.setViewOffset).toHaveBeenCalledWith({ y: 0.25, immediate: true });
    });

    it('hareketi azalt açıkken sahne hiç kurulmaz (kaydırma da yok)', async () => {
        env.reduced = true;
        renderHero({ fallback: <div data-testid="fb" /> });
        await flush();
        expect(screen.getByTestId('fb')).toBeInTheDocument();
        expect(scene.setViewOffset).not.toHaveBeenCalled();
    });

    it('sökülürken dinleyiciler kaldırılır', async () => {
        const remove = vi.spyOn(window, 'removeEventListener');
        const { unmount } = renderHero();
        await flush();
        unmount();
        expect(remove.mock.calls.some(([t]) => t === 'resize')).toBe(true);
        expect(mq.listeners.size).toBe(0);
        remove.mockRestore();
    });
});
