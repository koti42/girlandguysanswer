// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));

import { loadKesifEngine } from '../engineLoader';
import KesifGameScreen from '../KesifGameScreen';
import useKesifCosmetics, { COSMETIC_SLOTS, cleanCosmetics } from '../useKesifCosmetics';
import { fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from './fakeKesifEngine';

const MEMBER = { id: 'u1', username: 'ayse', gender: 'female' };
const MACERA = { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null };
const LOADOUT = { portal: 'portal:neon-sokak', alet: null, asa: null, jet: 'jet:altin-kivilcim', arac: null, gecis: null };
const NONE = { portal: null, alet: null, asa: null, jet: null, arac: null, gecis: null };
const wrap = (x) => ({ loadout: x });

let engine;
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    engine = makeEngine();
    engine.controls.setCosmetics = vi.fn();
    loadKesifEngine.mockResolvedValue(engine.mod);
    Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await new Promise((r) => setTimeout(r, 5));
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
});

function renderScreen({ user = null, api, entry = MACERA } = {}) {
    return render(
        <MemoryRouter>
            <KesifGameScreen entry={entry} user={user} avatar={null} api={api} onExit={() => {}} />
        </MemoryRouter>
    );
}

describe('cleanCosmetics', () => {
    it('yalnız 6 yuva ve ≤64 karakterlik metinler; yoksa null; zarf kabul', () => {
        expect(COSMETIC_SLOTS).toEqual(['portal', 'alet', 'asa', 'jet', 'arac', 'gecis']);
        expect(cleanCosmetics(null)).toBeNull();
        expect(cleanCosmetics('x')).toBeNull();
        expect(cleanCosmetics({})).toBeNull();
        expect(cleanCosmetics(wrap(NONE))).toBeNull();
        expect(cleanCosmetics({ portal: 3, alet: {}, evil: 'portal:x' })).toBeNull();
        expect(cleanCosmetics({ portal: 'a'.repeat(65) })).toBeNull();
        expect(cleanCosmetics(wrap({ ...LOADOUT, evil: 'x' }))).toEqual(LOADOUT);
        expect(cleanCosmetics(LOADOUT)).toEqual(LOADOUT);
    });
});

describe('Keşif oyunu: mağaza görünümleri (loadout)', () => {
    it('üye: yük arka planda bir kez okunur; yanıt oyun kurulmadan geldiyse opts.cosmetics, sonra geldiyse setCosmetics ile uygulanır', async () => {
        const loadout = vi.fn(() => Promise.resolve(wrap(LOADOUT)));
        renderScreen({ user: MEMBER, api: fakeApi({ loadout }) });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        expect(loadout).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            const viaOpts = engine.opts.cosmetics && engine.opts.cosmetics.portal === 'portal:neon-sokak';
            const viaApi = engine.controls.setCosmetics.mock.calls.some((c) => c[0] && c[0].jet === 'jet:altin-kivilcim');
            expect(viaOpts || viaApi).toBe(true);
        });
    });

    it('yanıt GEÇ gelirse oyun başlangıcı BEKLEMEZ; geç gelen yük game.setCosmetics ile canlı uygulanır', async () => {
        let resolve;
        const loadout = vi.fn(() => new Promise((r) => { resolve = r; }));
        renderScreen({ user: MEMBER, api: fakeApi({ loadout }) });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled()); // yük hâlâ bekliyor
        expect(engine.opts.cosmetics).toBeUndefined();
        expect(engine.controls.setCosmetics).not.toHaveBeenCalled();
        await act(async () => { resolve(wrap(LOADOUT)); });
        await waitFor(() => expect(engine.controls.setCosmetics).toHaveBeenCalledWith(LOADOUT));
        expect(loadout).toHaveBeenCalledTimes(1);
    });

    it('misafir / çıkış yapmış: istek ATILMAZ ve opts.cosmetics yok', async () => {
        const loadout = vi.fn(() => Promise.resolve(wrap(LOADOUT)));
        renderScreen({ user: null, api: fakeApi({ loadout }) });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 30));
        expect(loadout).not.toHaveBeenCalled();
        expect(engine.opts.cosmetics).toBeUndefined();
        expect(engine.controls.setCosmetics).not.toHaveBeenCalled();
        act(() => { document.dispatchEvent(new Event('visibilitychange')); });
        window.dispatchEvent(new Event('focus'));
        expect(loadout).not.toHaveBeenCalled();
    });

    it('hata / senkron istisna / bozuk yanıt / boş yük: oyun açılır, sessiz, görünüm değişmez', async () => {
        const impls = [
            () => Promise.reject(new Error('ağ')),
            () => { throw new Error('senkron'); },
            () => Promise.resolve(null),
            () => Promise.resolve('bozuk'),
            () => Promise.resolve(wrap(NONE)),
            () => Promise.resolve({ loadout: { portal: 42 } }),
        ];
        for (const impl of impls) {
            cleanup();
            engine = makeEngine();
            engine.controls.setCosmetics = vi.fn();
            loadKesifEngine.mockResolvedValue(engine.mod);
            const loadout = vi.fn(impl);
            renderScreen({ user: MEMBER, api: fakeApi({ loadout }) });
            await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
            await new Promise((r) => setTimeout(r, 20));
            expect(loadout).toHaveBeenCalledTimes(1);
            expect(engine.controls.setCosmetics).not.toHaveBeenCalled();
            expect(engine.opts.cosmetics).toBeUndefined();
        }
    });

    it('api.loadout yoksa (eski api) sessizce atlanır', async () => {
        renderScreen({ user: MEMBER, api: fakeApi() });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        expect(engine.opts.cosmetics).toBeUndefined();
    });

    it('game.setCosmetics fırlatsa bile oturum düşmez', async () => {
        engine.controls.setCosmetics = vi.fn(() => { throw new Error('boom'); });
        let resolve;
        const loadout = vi.fn(() => new Promise((r) => { resolve = r; }));
        renderScreen({ user: MEMBER, api: fakeApi({ loadout }) });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        await act(async () => { resolve(wrap(LOADOUT)); });
        await waitFor(() => expect(engine.controls.setCosmetics).toHaveBeenCalled());
        expect(screen.getByTestId('kesif-stage')).toBeInTheDocument();
    });
});

/* ---------------------------------------------------------------- kanca: yeniden okuma kuralları */
const probe = { ref: null };
function Harness({ api, member, gameRef }) {
    const ref = useKesifCosmetics({ api, member, gameRef });
    React.useEffect(() => {
        probe.ref = ref;
    });
    return <div data-testid="h" />;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('useKesifCosmetics: sayfa odağı/görünürlüğü ile yeniden okuma (yoklama yok)', () => {
    it('görünür olunca ≥5 sn sonra yeniden okur; <5 sn içinde okumaz; değişim yoksa setCosmetics çağrılmaz; çıkarma → null', async () => {
        let now = 1000000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const seq = [wrap(LOADOUT), wrap(LOADOUT), wrap({ ...LOADOUT, jet: 'jet:gok-mavisi' }), wrap(NONE), wrap(NONE)];
        const loadout = vi.fn(() => Promise.resolve(seq.shift()));
        const game = { setCosmetics: vi.fn() };
        const gameRef = { current: game };
        const { unmount } = render(<Harness api={{ loadout }} member gameRef={gameRef} />);
        await flush();
        expect(loadout).toHaveBeenCalledTimes(1);
        expect(game.setCosmetics).toHaveBeenCalledTimes(1);
        expect(probe.ref.current).toEqual(LOADOUT); // motor (yeniden) kurulurken okunacak değer
        // 2 sn sonra odak: istek yok
        now += 2000;
        window.dispatchEvent(new Event('focus'));
        await flush();
        expect(loadout).toHaveBeenCalledTimes(1);
        // 6 sn sonra görünür: okur, aynı yük → setCosmetics yok
        now += 6000;
        document.dispatchEvent(new Event('visibilitychange'));
        await flush();
        expect(loadout).toHaveBeenCalledTimes(2);
        expect(game.setCosmetics).toHaveBeenCalledTimes(1);
        // mağazada değiştirdi → uygulanır
        now += 6000;
        window.dispatchEvent(new Event('focus'));
        await flush();
        expect(game.setCosmetics).toHaveBeenCalledTimes(2);
        expect(game.setCosmetics.mock.calls[1][0].jet).toBe('jet:gok-mavisi');
        // hepsini çıkardı → null
        now += 6000;
        window.dispatchEvent(new Event('focus'));
        await flush();
        expect(game.setCosmetics).toHaveBeenLastCalledWith(null);
        // gizliyken okumaz
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        now += 6000;
        document.dispatchEvent(new Event('visibilitychange'));
        await flush();
        expect(loadout).toHaveBeenCalledTimes(4);
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        unmount();
        now += 60000;
        window.dispatchEvent(new Event('focus'));
        document.dispatchEvent(new Event('visibilitychange'));
        await flush();
        expect(loadout).toHaveBeenCalledTimes(4); // söküldükten sonra dinleyici yok
    });

    it('uçuştaki istek varken ikinci istek atılmaz; sökülünce geç yanıt yok sayılır', async () => {
        let resolve;
        const loadout = vi.fn(() => new Promise((r) => { resolve = r; }));
        const game = { setCosmetics: vi.fn() };
        const { unmount } = render(<Harness api={{ loadout }} member gameRef={{ current: game }} />);
        await flush();
        const real = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(real + 60000);
        window.dispatchEvent(new Event('focus'));
        await flush();
        expect(loadout).toHaveBeenCalledTimes(1);
        unmount();
        await act(async () => { resolve(wrap(LOADOUT)); });
        expect(game.setCosmetics).not.toHaveBeenCalled();
    });

    it('3 sn zaman aşımı: yanıt gelmezse sessiz kalır ve sonraki odakta yeniden denenir', async () => {
        vi.useFakeTimers();
        try {
            const loadout = vi.fn(() => new Promise(() => {}));
            const game = { setCosmetics: vi.fn() };
            render(<Harness api={{ loadout }} member gameRef={{ current: game }} />);
            await act(async () => { await Promise.resolve(); });
            expect(loadout).toHaveBeenCalledTimes(1);
            await act(async () => { vi.advanceTimersByTime(3100); await Promise.resolve(); await Promise.resolve(); });
            expect(game.setCosmetics).not.toHaveBeenCalled();
            await act(async () => { vi.setSystemTime(Date.now() + 10000); window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
            expect(loadout).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it('member=false: kanca hiçbir şey yapmaz ve ref null kalır', async () => {
        const loadout = vi.fn(() => Promise.resolve(wrap(LOADOUT)));
        render(<Harness api={{ loadout }} member={false} gameRef={{ current: null }} />);
        await flush();
        window.dispatchEvent(new Event('focus'));
        expect(loadout).not.toHaveBeenCalled();
        expect(probe.ref.current).toBeNull();
    });
});
