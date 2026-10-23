// @vitest-environment jsdom
import React, { StrictMode, createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));

import { loadKesifEngine } from '../engineLoader';
import KesifGameScreen from '../KesifGameScreen';
import { SETTINGS_KEY } from '../kesifSessionUtils';
import * as saveStorage from '../../../../game/kesif/sim/saveStorage.js';
import { fakeApi, PROFILE_3_OF_5 } from '../../../../components/game/kesif/__tests__/kesifTestKit';
import { MAP, SAVE, httpErr, makeEngine } from './fakeKesifEngine';

const MEMBER = { id: 'u1', username: 'ayse', gender: 'female' };
const MACERA = { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null };
const INSA = { mode: 'insa', seed: 'ABCD1234', mapId: null, saveId: null, base: 'düz' };

let engine;

function renderScreen({ entry = MACERA, user = null, api, strict = false, ...props } = {}) {
    const a = api || fakeApi();
    const tree = (
        <MemoryRouter>
            <KesifGameScreen entry={entry} user={user} avatar={null} api={a} onExit={props.onExit || (() => {})} {...props} />
        </MemoryRouter>
    );
    const utils = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    return { api: a, ...utils };
}

async function ready() {
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => engine.cb.onReady());
    await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

const slotKeys = () => Object.keys(localStorage).filter((k) => k.indexOf('kesif:save:') === 0);

describe('KesifGameScreen: motor yaşam döngüsü', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        Element.prototype.scrollIntoView = vi.fn();
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    });

    it('yükleme ekranı -> motor seçenekleri -> ilerleme -> HUD; sökülünce destroy', async () => {
        engine = makeEngine({ progress: [0.2, 0.6, 1] });
        loadKesifEngine.mockResolvedValue(engine.mod);
        const { unmount } = renderScreen({ user: MEMBER, avatar: undefined });
        expect(screen.getByTestId('kesif-loading')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: 'Yükleme ilerlemesi' })).toBeInTheDocument();
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalledTimes(1));
        const o = engine.opts;
        expect(o).toMatchObject({ mode: 'macera', seed: 'ABCD1234', save: null, mapData: null, controls: 'auto', quality: 'auto', gender: 'female', accessibility: false, muted: false, music: true });
        expect(o.container).toBe(screen.getByTestId('kesif-stage'));
        for (const cb of ['onHud', 'onEvent', 'onSave', 'onHaptic', 'onPause', 'onSpeak', 'onReady', 'onError', 'onExit', 'onUi']) expect(typeof o.callbacks[cb]).toBe('function');
        // getLoadProgress yoklaması: ilerleme çubuğu güncellenir, 1'de oyun açılır
        await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
        expect(engine.controls.getLoadProgress).toHaveBeenCalled();
        expect(screen.getByRole('application')).toHaveAttribute('aria-roledescription', 'oyun');
        expect(document.querySelector('.kx-root')).toBeInTheDocument();
        unmount();
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
    });

    it('StrictMode: motor bir kez kurulur ve bir kez yok edilir', async () => {
        const { unmount } = renderScreen({ strict: true });
        await ready();
        expect(engine.mod.createKesifGame).toHaveBeenCalledTimes(1);
        expect(engine.controls.start).toHaveBeenCalledTimes(1);
        expect(engine.controls.destroy).not.toHaveBeenCalled();
        unmount();
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
    });

    it('motor yüklenirken sökülürse motor hiç kurulmaz; geç kurulan hemen yok edilir', async () => {
        let release;
        loadKesifEngine.mockImplementation(() => new Promise((r) => (release = r)));
        const { unmount } = renderScreen();
        unmount();
        await act(async () => release(engine.mod));
        expect(engine.mod.createKesifGame).not.toHaveBeenCalled();

        let finish;
        engine.mod.createKesifGame.mockImplementation(
            () =>
                new Promise((r) => {
                    finish = () => r(engine.controls);
                })
        );
        loadKesifEngine.mockResolvedValue(engine.mod);
        const second = renderScreen();
        await waitFor(() => expect(engine.mod.createKesifGame).toHaveBeenCalled());
        second.unmount();
        await act(async () => finish());
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
        expect(engine.controls.start).not.toHaveBeenCalled();
    });

    it('WebGL 2 yoksa 3D desteklenmiyor paneli; motor kurulmaz; çıkış çalışır', async () => {
        engine = makeEngine({ webgl: false });
        loadKesifEngine.mockResolvedValue(engine.mod);
        const onExit = vi.fn();
        renderScreen({ onExit });
        expect(await screen.findByRole('alertdialog', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(engine.mod.createKesifGame).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /Tekrar dene/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Lobiye dön/ }));
        await waitFor(() => expect(onExit).toHaveBeenCalled());
    });

    it('motor modülü yüklenemezse hata paneli ve tekrar dene', async () => {
        loadKesifEngine.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'));
        renderScreen();
        expect(await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' })).toHaveTextContent('Oyun yüklenemedi');
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalledTimes(1));
    });

    it('grafik bağlamı kaybı: panel, ilerleme saklanır, yeniden dene kayıttan başlatır', async () => {
        renderScreen({ entry: { ...MACERA, seed: 'ABCD1234' } });
        await ready();
        act(() => engine.cb.onError({ code: 'context_lost', message: 'WebGL context lost' }));
        const panel = await screen.findByRole('alertdialog', { name: 'Grafik durdu' });
        expect(panel).toHaveTextContent('İlerlemen saklandı');
        expect(engine.controls.save).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Yeniden dene/ }));
        await waitFor(() => expect(engine.mod.createKesifGame).toHaveBeenCalledTimes(2));
        expect(engine.controls.destroy).toHaveBeenCalledTimes(1);
        expect(engine.opts.save).toMatchObject({ seed: 4242, savedAt: 3000 });
        await ready();
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('beklenmedik motor hatası: genel hata paneli', async () => {
        renderScreen();
        await ready();
        act(() => engine.cb.onError(new Error('boom')));
        expect(await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' })).toBeInTheDocument();
    });

    it('erişilebilirlik: seçenekler ve konuşma; avatar canlı güncellenir', async () => {
        const speak = vi.fn();
        const synth = { speak, cancel: vi.fn() };
        window.speechSynthesis = synth;
        window.SpeechSynthesisUtterance = function (t) {
            this.text = t;
        };
        const av = { v: 1, body: 'kiz', skin: 1 };
        const { rerender } = renderScreen({ accessibility: true, avatar: av });
        await ready();
        expect(engine.opts.accessibility).toBe(true);
        act(() => engine.cb.onSpeak('Bulmaca çözüldü'));
        expect(speak).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('kesif-screen')).toHaveAttribute('data-a11y', '1');
        const av2 = { ...av, skin: 3 };
        rerender(
            <MemoryRouter>
                <KesifGameScreen entry={MACERA} user={null} avatar={av2} api={fakeApi()} accessibility onExit={() => {}} />
            </MemoryRouter>
        );
        expect(engine.controls.setAvatar).toHaveBeenLastCalledWith(av2);
        delete window.speechSynthesis;
        delete window.SpeechSynthesisUtterance;
    });
});

describe('KesifGameScreen: gerçek motor sözleşmesi ayrıntıları', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
    });

    it('onReady api dönmeden önce çağrılırsa oyun yine açılır; dünya kodu ve dokunmatik durum api gelince işlenir', async () => {
        const input = { isTouch: true, pressButton: vi.fn(() => true), getJoystickView: () => ({ active: false }), setSettings: vi.fn() };
        engine = makeEngine({ autoReady: true, input });
        loadKesifEngine.mockResolvedValue(engine.mod);
        const sessionRef = createRef();
        renderScreen({ sessionRef });
        await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
        // Yükleme perdesi onReady ile kalkar, api ise bir mikro-görev sonra döner: sıralamaya güvenme, bekle.
        await waitFor(() => expect(sessionRef.current.info.worldCode).toBe('ABCD1234'));
        expect(engine.controls.start).toHaveBeenCalledTimes(1);
        // api.input -> HUD dokunmatik kontrolleri: üst çubuktaki Harita düğmesi input.pressButton('map') çağırır
        expect(document.querySelector('.kx-root')).toHaveAttribute('data-touch', '1');
        fireEvent.click(await screen.findByRole('button', { name: /Harita/ }));
        expect(input.pressButton).toHaveBeenCalledWith('map', true);
    });

    it('onProgress gerçek ilerlemeyi gösterir', async () => {
        engine = makeEngine();
        let finish;
        const create = engine.mod.createKesifGame.getMockImplementation();
        engine.mod.createKesifGame.mockImplementation(async (o) => {
            await create(o);
            await new Promise((r) => (finish = r)); // gerçek motor gibi: ilk chunk halkası beklenirken api henüz dönmedi
            return engine.controls;
        });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await waitFor(() => expect(engine.mod.createKesifGame).toHaveBeenCalled());
        act(() => engine.cb.onProgress({ progress: 0.5, label: 'Dünya üretiliyor' }));
        const bar = screen.getByRole('progressbar', { name: 'Yükleme ilerlemesi' });
        expect(bar).toHaveAttribute('aria-valuenow', '50');
        expect(screen.getByTestId('kesif-loading')).toHaveTextContent('Dünya üretiliyor');
        expect(screen.getByTestId('kesif-loading')).toHaveTextContent('%50');
        await act(async () => finish());
    });

    it('geri kazanılabilir bağlam kaybı: kare sayacı yeniden ilerleyince panel kapanır, oyun menüde bekler', async () => {
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        let frames = 100;
        engine.controls.getStats.mockImplementation(() => ({ frames, playTime: 5 }));
        act(() => engine.cb.onError(Object.assign(new Error('Grafik bağlamı kayboldu'), { code: 'webgl_context_lost', recoverable: true })));
        expect(await screen.findByRole('alertdialog', { name: 'Grafik durdu' })).toHaveTextContent('kendiliğinden devam eder');
        frames = 400;
        await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Grafik durdu' })).toBeNull(), { timeout: 3500 });
        expect(await screen.findByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
    });

    it('yükleme sırasında motor hatası (render_init): yüklenemedi mesajı, tekrar dene', async () => {
        engine = makeEngine();
        engine.mod.createKesifGame.mockImplementation(async (o) => {
            const err = Object.assign(new Error('Grafik motoru başlatılamadı.'), { code: 'render_init' });
            o.callbacks.onError(err);
            throw err;
        });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        expect(await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' })).toHaveTextContent('Oyun yüklenemedi');
        expect(screen.getByRole('button', { name: /Tekrar dene/ })).toBeInTheDocument();
    });

    it('motorun webgl_unavailable hatası 3D desteklenmiyor panelini açar', async () => {
        engine = makeEngine();
        engine.mod.createKesifGame.mockImplementation(async (o) => {
            const err = Object.assign(new Error('Bu cihazda 3B grafik (WebGL2) kullanılamıyor.'), { code: 'webgl_unavailable' });
            o.callbacks.onError(err);
            throw err;
        });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        expect(await screen.findByRole('alertdialog', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Tekrar dene/ })).toBeNull();
    });

    it('J tuşu günlüğü açar/kapatır (motor destekliyorsa, yalnız macera)', async () => {
        engine = makeEngine();
        engine.controls.openJournal = vi.fn(() => engine.setUi('journal'));
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        fireEvent.keyDown(window, { key: 'j' });
        expect(engine.controls.openJournal).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId('journal-panel')).toBeInTheDocument();
        fireEvent.keyDown(window, { key: 'J' });
        expect(engine.controls.closeUi).toHaveBeenCalledTimes(1);
        cleanup();
        // inşa modunda günlük yok
        engine = makeEngine();
        engine.controls.openJournal = vi.fn();
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen({ entry: INSA });
        await ready();
        fireEvent.keyDown(window, { key: 'j' });
        expect(engine.controls.openJournal).not.toHaveBeenCalled();
    });

    it('hızlı çubuk / kamera / ipucu eylemleri motora gider', async () => {
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        fireEvent.click(screen.getByRole('button', { name: /^3. yuva/ }));
        expect(engine.controls.selectHotbar).toHaveBeenCalledWith(2);
    });
});

describe('KesifGameScreen: masaüstü / dokunmatik katmanlar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        delete document.fullscreenEnabled;
        sessionStorage.clear();
    });

    it('masaüstü: fare yakalanmamışken yalnızca küçük tek satır görünür (kontrol listesi yok); tıklama imleç kilidini ister; kilit açılınca gizlenir', async () => {
        const input = { isTouch: false, requestPointerLock: vi.fn() };
        engine = makeEngine({ input });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        const hint = await screen.findByTestId('kesif-lock');
        expect(hint).toHaveTextContent('Başlamak için tıkla');
        // kontrol listesi / ayrıntılı kart kendiliğinden çıkmaz
        expect(hint.querySelector('kbd, ul, li')).toBeNull();
        expect(screen.queryByText(/W A S D/)).toBeNull();
        expect(screen.queryByText(/Oynamak için tıkla/)).toBeNull();
        fireEvent.click(hint);
        expect(input.requestPointerLock).toHaveBeenCalledTimes(1);
        // tarayıcı kilidi verdi
        const stage = screen.getByTestId('kesif-stage');
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => stage });
        act(() => {
            document.dispatchEvent(new Event('pointerlockchange'));
        });
        expect(screen.queryByTestId('kesif-lock')).toBeNull();
        // Esc ile kilit bırakıldı: oyun duraklar ve menü açılır
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
        act(() => {
            document.dispatchEvent(new Event('pointerlockchange'));
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(await screen.findByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
        expect(screen.queryByTestId('kesif-lock')).toBeNull(); // menü açıkken ipucu yok
        delete document.pointerLockElement;
    });

    it('Esc ile duraklatıp devam edince (kilit yok) yalnızca "Devam etmek için tıkla" satırı çıkar; durup beklemek kontrol kartı getirmez', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            const input = { isTouch: false, requestPointerLock: vi.fn() };
            engine = makeEngine({ input });
            loadKesifEngine.mockResolvedValue(engine.mod);
            renderScreen();
            await ready();
            const stage = screen.getByTestId('kesif-stage');
            Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => stage });
            act(() => {
                document.dispatchEvent(new Event('pointerlockchange'));
            });
            Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
            act(() => {
                document.dispatchEvent(new Event('pointerlockchange'));
            });
            await screen.findByRole('dialog', { name: 'Duraklatıldı' });
            act(() => engine.setUi('none')); // devam et (tarayıcı kilidi geri vermedi)
            const hint = await screen.findByTestId('kesif-lock');
            expect(hint).toHaveTextContent('Devam etmek için tıkla');
            expect(hint.querySelector('kbd, ul, li')).toBeNull();
            // 2 dakika hareketsiz: yeni kart/satır çıkmaz, aynı tek satır kalır
            act(() => {
                vi.advanceTimersByTime(120000);
            });
            expect(screen.getAllByTestId('kesif-lock')).toHaveLength(1);
            expect(screen.queryByText(/W A S D/)).toBeNull();
            delete document.pointerLockElement;
        } finally {
            vi.useRealTimers();
        }
    });

    it('panel açıkken kilit bırakılırsa duraklatılmaz (panel kendi menüsüdür)', async () => {
        const input = { isTouch: false, requestPointerLock: vi.fn() };
        engine = makeEngine({ input });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        const stage = screen.getByTestId('kesif-stage');
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => stage });
        act(() => {
            document.dispatchEvent(new Event('pointerlockchange'));
        });
        act(() => engine.setUi('inventory'));
        Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => null });
        act(() => {
            document.dispatchEvent(new Event('pointerlockchange'));
        });
        expect(engine.controls.pause).not.toHaveBeenCalled();
        delete document.pointerLockElement;
    });

    it('dokunmatik: fare ipucu ve tam ekran düğmesi yok; dikey ekranda "yan çevir" önerisi çıkar ve kapatılabilir', async () => {
        const input = { isTouch: true, pressButton: vi.fn(), getJoystickView: () => ({ active: false }) };
        engine = makeEngine({ input });
        loadKesifEngine.mockResolvedValue(engine.mod);
        const w = window.innerWidth;
        const h = window.innerHeight;
        window.innerWidth = 390;
        window.innerHeight = 844;
        document.fullscreenEnabled = true;
        renderScreen();
        await ready();
        expect(screen.queryByTestId('kesif-lock')).toBeNull();
        expect(document.querySelector('.kxp-fs')).toBeNull();
        const hint = await screen.findByTestId('kesif-orient');
        expect(hint).toHaveTextContent('telefonunu yan çevir');
        fireEvent.click(within(hint).getByRole('button', { name: 'İpucunu kapat' }));
        expect(screen.queryByTestId('kesif-orient')).toBeNull();
        window.innerWidth = w;
        window.innerHeight = h;
    });

    it('dikey telefon önerisi birkaç sn sonra kendiliğinden kalkar ve oturumda bir daha çıkmaz', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const w = window.innerWidth;
        const h = window.innerHeight;
        try {
            const input = { isTouch: true, pressButton: vi.fn(), getJoystickView: () => ({ active: false }) };
            engine = makeEngine({ input });
            loadKesifEngine.mockResolvedValue(engine.mod);
            window.innerWidth = 390;
            window.innerHeight = 844;
            renderScreen();
            await ready();
            expect(await screen.findByTestId('kesif-orient')).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(9500);
            });
            expect(screen.queryByTestId('kesif-orient')).toBeNull();
            expect(sessionStorage.getItem('kesif.orient.hint')).toBe('1');
        } finally {
            window.innerWidth = w;
            window.innerHeight = h;
            vi.useRealTimers();
        }
    });

    it('yatay telefonda yön önerisi çıkmaz', async () => {
        const input = { isTouch: true, pressButton: vi.fn(), getJoystickView: () => ({ active: false }) };
        engine = makeEngine({ input });
        loadKesifEngine.mockResolvedValue(engine.mod);
        const w = window.innerWidth;
        const h = window.innerHeight;
        window.innerWidth = 844;
        window.innerHeight = 390;
        renderScreen();
        await ready();
        expect(screen.queryByTestId('kesif-orient')).toBeNull();
        window.innerWidth = w;
        window.innerHeight = h;
    });

    it('masaüstü tam ekran düğmesi: destek varsa görünür, menü açıkken gizlenir; gömmede yok', async () => {
        document.fullscreenEnabled = true;
        engine = makeEngine({ input: { isTouch: false, requestPointerLock: vi.fn() } });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        const btn = await screen.findByRole('button', { name: 'Tam ekran' });
        expect(btn).toHaveAttribute('aria-pressed', 'false');
        act(() => engine.setUi('pause'));
        expect(screen.queryByRole('button', { name: 'Tam ekran' })).toBeNull();
        cleanup();
        engine = makeEngine({ input: { isTouch: false, requestPointerLock: vi.fn() } });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen({ embedded: true });
        await ready();
        expect(screen.queryByRole('button', { name: 'Tam ekran' })).toBeNull();
    });

    it('sr-only canlı bölge: duyurular ekran okuyucuya iletilir', async () => {
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen();
        await ready();
        act(() => engine.cb.onEvent({ type: 'puzzleSolved', puzzleType: 'terazi' }));
        await waitFor(() => expect(document.querySelector('.sr-only[aria-live="polite"]')).toHaveTextContent('Bulmaca çözüldü. Terazi'));
    });
});

describe('KesifGameScreen: hud.ui panelleri', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
    });

    it('envanter, üretim, günlük ve harita ui değerine göre açılır; kapatma closeUi çağırır', async () => {
        renderScreen();
        await ready();
        for (const [ui, name, testId] of [
            ['inventory', 'Envanter', 'inventory-panel'],
            ['crafting', 'Üretim', 'crafting-panel'],
            ['journal', 'Günlük', 'journal-panel'],
            ['map', 'Harita', 'map-screen'],
        ]) {
            act(() => engine.setUi(ui));
            expect(await screen.findByTestId(testId)).toBeInTheDocument();
            expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
            act(() => engine.setUi('none'));
            expect(screen.queryByTestId(testId)).toBeNull();
        }
        act(() => engine.setUi('inventory'));
        fireEvent.click(await screen.findByRole('button', { name: 'Kapat' }));
        expect(engine.controls.closeUi).toHaveBeenCalledTimes(1);
        expect(engine.controls.getInventorySnapshot).toHaveBeenCalled();
    });

    it('inşa paleti ve sandık paneli; envanter değişimi (inventoryChanged) paneli tazeler', async () => {
        renderScreen({ entry: INSA });
        await ready();
        act(() => engine.setUi('build'));
        expect(await screen.findByTestId('build-palette')).toBeInTheDocument();
        act(() => engine.setUi('chest'));
        expect(await screen.findByTestId('chest-panel')).toBeInTheDocument();
        const before = engine.controls.getChest.mock.calls.length;
        act(() => engine.cb.onEvent({ type: 'inventoryChanged' }));
        await waitFor(() => expect(engine.controls.getChest.mock.calls.length).toBeGreaterThan(before));
    });

    it('duraklat ui: menü HUD katmanından gelir; devam et motoru sürdürür', async () => {
        renderScreen();
        await ready();
        act(() => engine.setUi('pause'));
        expect(await screen.findByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
        expect(engine.controls.resume).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Duraklatıldı' })).toBeNull());
    });

    it('ölüm ve zafer ekranları; ölüm olayından kayıp bilgisi', async () => {
        renderScreen();
        await ready();
        act(() => engine.cb.onEvent({ type: 'death', cause: 'fall', lost: 4 }));
        act(() => engine.setUi('dead'));
        const dead = await screen.findByRole('dialog', { name: /Bitkin düştün/ });
        expect(dead).toHaveTextContent('5 dakika');
        act(() => engine.setUi('none'));
        act(() => engine.cb.onEvent({ type: 'victory', stats: { puzzlesSolved: 22, playTime: 3600 } }));
        act(() => engine.setUi('victory'));
        const win = await screen.findByRole('dialog', { name: 'Dünya Fethedildi' });
        expect(within(win).getByText('Çözülen bulmaca')).toBeInTheDocument();
        fireEvent.click(within(win).getByRole('button', { name: /Keşfetmeye devam et/ }));
        expect(engine.controls.closeUi).toHaveBeenCalled();
    });
});

describe('KesifGameScreen: duraklat / geri / çıkış', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
    });

    it('tarayıcı geri hareketi: oyun duraklar, ikinci geri çıkış onayı açar; Vazgeç oyunu korur', async () => {
        const push = vi.spyOn(window.history, 'pushState');
        const onExit = vi.fn();
        renderScreen({ historyGuard: true, onExit });
        await ready();
        await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(push).toHaveBeenCalledTimes(2); // koruma yeniden eklendi
        act(() => {
            window.dispatchEvent(new PopStateEvent('popstate'));
        });
        const dlg = await screen.findByRole('dialog', { name: 'Çıkmak istiyor musun?' });
        expect(onExit).not.toHaveBeenCalled();
        fireEvent.click(within(dlg).getByRole('button', { name: 'Vazgeç' }));
        expect(screen.queryByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeNull();
        push.mockRestore();
    });

    it('geri tuşu: panel açıkken paneli kapatır, oyunda menüyü açar; yüklenirken çıkar', async () => {
        const onExit = vi.fn();
        const sessionRef = createRef();
        renderScreen({ onExit, sessionRef });
        // yükleniyor: geri = çıkış
        expect(sessionRef.current.actions.getPhase()).toBe('loading');
        await ready();
        act(() => engine.setUi('inventory'));
        await screen.findByTestId('inventory-panel');
        act(() => {
            sessionRef.current.actions.handleBack();
        });
        expect(engine.controls.closeUi).toHaveBeenCalledTimes(1);
        act(() => engine.setUi('none'));
        act(() => {
            sessionRef.current.actions.handleBack();
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        // ölüm ekranında geri: yanlışlıkla çıkış yok
        act(() => engine.setUi('dead'));
        act(() => {
            sessionRef.current.actions.handleBack();
        });
        expect(onExit).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeNull();
    });

    it('geri tuşu: Büyü Masası (enchant), Simya Kazanı (brew) ve Makine paneli (machine) panellerini de kapatır, duraklatma menüsü açmaz', async () => {
        const sessionRef = createRef();
        renderScreen({ sessionRef });
        await ready();
        for (const ui of ['enchant', 'brew', 'machine']) {
            engine.controls.closeUi.mockClear();
            engine.controls.pause.mockClear();
            act(() => engine.setUi(ui));
            act(() => {
                sessionRef.current.actions.handleBack();
            });
            expect(engine.controls.closeUi).toHaveBeenCalledTimes(1);
            expect(engine.controls.pause).not.toHaveBeenCalled();
            act(() => engine.setUi('none'));
        }
    });

    it('yükleme sırasında geri tuşu ve Vazgeç çıkış yapar', async () => {
        let release;
        loadKesifEngine.mockImplementation(() => new Promise((r) => (release = r)));
        const onExit = vi.fn();
        const sessionRef = createRef();
        renderScreen({ onExit, sessionRef });
        act(() => {
            sessionRef.current.actions.handleBack();
        });
        await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
        expect(onExit).toHaveBeenCalledTimes(1); // çift çıkış yok
        await act(async () => release(engine.mod));
    });

    it('sessionRef: pause / handleBack / setMuted(notify=false) / setMusic', async () => {
        const sessionRef = createRef();
        const onSettings = vi.fn();
        renderScreen({ sessionRef, onSettings, initialMuted: true, initialMusic: false });
        await ready();
        expect(engine.opts.muted).toBe(true);
        expect(engine.opts.music).toBe(false);
        const a = () => sessionRef.current.actions;
        expect(a().getPhase()).toBe('running');
        act(() => a().pause());
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(a().isPausedNow()).toBe(true);
        // menü açıkken ikinci pause çağrısı motoru tekrar durdurmaz
        act(() => a().pause());
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        // native'den gelen ses tercihi: motora uygulanır, geri bildirilmez
        act(() => a().setMuted(false, false));
        expect(engine.controls.setMuted).toHaveBeenLastCalledWith(false);
        act(() => a().setMusic(true, false));
        expect(engine.controls.setMusicEnabled).toHaveBeenLastCalledWith(true);
        expect(onSettings).not.toHaveBeenCalled();
        // oyuncu değiştirirse geri bildirilir
        act(() => a().setMuted(true));
        expect(onSettings).toHaveBeenLastCalledWith({ muted: true, music: true });
        // geri: menüdeyken çıkış onayı
        act(() => {
            a().handleBack();
        });
        expect(await screen.findByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeInTheDocument();
        act(() => {
            a().handleBack();
        });
        expect(screen.queryByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeNull();
    });

    it('çıkış onayı: Kaydetmeden çık onExit çağırır; Kaydet ve çık önce kaydeder', async () => {
        const onExit = vi.fn();
        const sessionRef = createRef();
        renderScreen({ onExit, sessionRef });
        await ready();
        act(() => engine.setUi('pause'));
        act(() => {
            sessionRef.current.actions.exit();
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Kaydetmeden çık' }));
        await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
        expect(slotKeys()).toEqual([]);
    });

    it('Kaydet ve çık: yerel yuvaya yazar ve çıkar; çıkışta tekrar kayıt yapılmaz', async () => {
        const onExit = vi.fn();
        const sessionRef = createRef();
        const { unmount } = renderScreen({ onExit, sessionRef });
        await ready();
        act(() => {
            sessionRef.current.actions.exit();
        });
        fireEvent.click(await screen.findByRole('button', { name: 'Kaydet ve çık' }));
        await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
        expect(slotKeys()).toEqual(['kesif:save:m-abcd1234']);
        engine.controls.save.mockClear();
        unmount();
        expect(engine.controls.save).not.toHaveBeenCalled(); // bilerek çıkıldı: sökme kaydı yok
        expect(engine.controls.destroy).toHaveBeenCalled();
    });

    it('bilmeden çıkış (sayfa söküldü): son durum yerel yuvaya bırakılır', async () => {
        const { unmount } = renderScreen();
        await ready();
        unmount();
        expect(engine.controls.save).toHaveBeenCalled();
        await waitFor(() => expect(slotKeys()).toEqual(['kesif:save:m-abcd1234']));
    });

    it('sekme gizlenince oyun duraklar', async () => {
        renderScreen();
        await ready();
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        delete document.hidden;
    });
});

describe('KesifGameScreen: kayıt, bulut ve ödül', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
    });

    it('onSave: yerel yuvaya yazılır; devam eden macera aynı yuvayı günceller; farklı dünya ayrı yuva', async () => {
        renderScreen();
        await ready();
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'auto', summary: {} }));
        expect(slotKeys()).toEqual(['kesif:save:m-abcd1234']);
        const stored = JSON.parse(localStorage.getItem('kesif:save:m-abcd1234'));
        expect(stored.seed).toBe(4242);
        expect(JSON.parse(localStorage.getItem('kesif:meta:m-abcd1234'))).toMatchObject({ name: 'Test macerası', mode: 'macera' });
        await act(async () => engine.cb.onSave({ save: { ...SAVE, playTime: 200 }, reason: 'manual', summary: {} }));
        expect(JSON.parse(localStorage.getItem('kesif:save:m-abcd1234')).playTime).toBe(200);
        expect(slotKeys().length).toBe(1);
    });

    it('aynı dünya koduyla yeni macera eski kaydı ezmez', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        await saveStorage.saveToSlot(mem, 'm-abcd1234', { ...SAVE, name: 'Eski' });
        renderScreen();
        await ready();
        await act(async () => engine.cb.onSave({ save: { ...SAVE, name: 'Yeni' }, reason: 'auto' }));
        expect(slotKeys().sort()).toEqual(['kesif:save:m-abcd1234', 'kesif:save:m-abcd1234-2']);
        expect(JSON.parse(localStorage.getItem('kesif:save:m-abcd1234')).name).toBe('Eski');
    });

    it('kayıttan devam: yerel kayıt motora ham nesne olarak verilir', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        await saveStorage.saveToSlot(mem, 'm-eski', SAVE);
        renderScreen({ entry: { mode: 'macera', seed: null, mapId: null, saveId: 'm-eski', base: null } });
        await ready();
        expect(engine.opts.save).toEqual(SAVE);
        expect(engine.opts.seed).toBe(4242);
        await act(async () => engine.cb.onSave({ save: { ...SAVE, playTime: 500 }, reason: 'auto' }));
        expect(JSON.parse(localStorage.getItem('kesif:save:m-eski')).playTime).toBe(500);
        expect(slotKeys()).toEqual(['kesif:save:m-eski']);
    });

    it('bozuk / eksik yerel kayıt: hata paneli, motor kurulmaz', async () => {
        renderScreen({ entry: { mode: 'macera', seed: null, mapId: null, saveId: 'm-yok', base: null } });
        expect(await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' })).toHaveTextContent('bulunamadı');
        expect(engine.mod.createKesifGame).not.toHaveBeenCalled();
    });

    it('kayıt alanı doluysa (20 yuva) kullanıcı bilgilendirilir ve oyun sürer', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        for (let i = 0; i < saveStorage.MAX_SLOTS; i++) await saveStorage.saveToSlot(mem, `dolu-${i}`, SAVE);
        renderScreen();
        await ready();
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'auto' }));
        expect((await screen.findAllByText(/Kayıt alanı dolu/)).length).toBeGreaterThan(0);
        expect(slotKeys().length).toBe(saveStorage.MAX_SLOTS);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('üye: bulut kaydı kısıtlanır (otomatik ardışık tek PUT), elle kayıt hemen gider; misafir bulut kullanmaz', async () => {
        const api = fakeApi({ putSave: vi.fn(() => Promise.resolve({ saved_at: 'x', bytes: 1 })) });
        renderScreen({ user: MEMBER, api });
        await ready();
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'auto' }));
        await act(async () => engine.cb.onSave({ save: { ...SAVE, playTime: 99 }, reason: 'auto' }));
        expect(api.putSave).toHaveBeenCalledTimes(1);
        expect(api.putSave.mock.calls[0][0].seed).toBe(4242);
        await act(async () => engine.cb.onSave({ save: { ...SAVE, playTime: 120 }, reason: 'manual' }));
        expect(api.putSave).toHaveBeenCalledTimes(2);
        expect(api.putSave.mock.calls[1][0].playTime).toBe(120);
        cleanup();

        const gapi = fakeApi({ putSave: vi.fn() });
        renderScreen({ user: null, api: gapi });
        await ready();
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'manual' }));
        expect(gapi.putSave).not.toHaveBeenCalled();
    });

    it('bulut yazımı hata verirse oyun etkilenmez (yerel kayıt yine yazılır)', async () => {
        const api = fakeApi({ putSave: vi.fn(() => Promise.reject(httpErr(503))) });
        renderScreen({ user: MEMBER, api });
        await ready();
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'manual' }));
        expect(api.putSave).toHaveBeenCalledTimes(1);
        expect(slotKeys().length).toBe(1);
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('bulut kaydıyla devam: üye getSave ile okur', async () => {
        const api = fakeApi({ getSave: vi.fn(() => Promise.resolve({ save: SAVE, saved_at: 'x', bytes: 10 })) });
        renderScreen({ user: MEMBER, api, entry: { mode: 'macera', seed: null, mapId: null, saveId: 'cloud', base: null } });
        await ready();
        expect(api.getSave).toHaveBeenCalledTimes(1);
        expect(engine.opts.save).toEqual(SAVE);
        expect(engine.opts.seed).toBe(4242);
    });

    it('ödül: üye claim eder, motora bildirir, jeton duyurulur', async () => {
        const api = fakeApi({ claim: vi.fn(() => Promise.resolve({ claimed: true, key: 'zone:1:boss', amount: 150, granted: 150, capped: false })) });
        renderScreen({ user: MEMBER, api });
        await ready();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('zone:1:boss'));
        expect(api.claim).toHaveBeenCalledWith('zone:1:boss', 'ABCD1234');
        expect(await screen.findAllByText(/150 jeton/)).not.toHaveLength(0);
    });

    it('ödül: 409 already_claimed de motora bildirilir', async () => {
        const api = fakeApi({ claim: vi.fn(() => Promise.reject(httpErr(409, { reason: 'already_claimed', key: 'k' }, 'Ödül zaten alındı'))) });
        renderScreen({ user: MEMBER, api });
        await ready();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:2:seal' }));
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('zone:2:seal'));
        expect(api.claim).toHaveBeenCalledTimes(1);
    });

    it('oyun oturumu: üye macera başlayınca play/start BİR kez (dünya kodu ile); misafir ve inşa modunda yok', async () => {
        const api = fakeApi();
        renderScreen({ user: MEMBER, api });
        await ready();
        await waitFor(() => expect(api.playStart).toHaveBeenCalledTimes(1));
        expect(api.playStart).toHaveBeenCalledWith('ABCD1234');
        cleanup();

        const guest = fakeApi();
        renderScreen({ user: null, api: guest });
        await ready();
        expect(guest.playStart).not.toHaveBeenCalled();
        cleanup();

        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        const insa = fakeApi();
        renderScreen({ user: MEMBER, api: insa, entry: INSA });
        await ready();
        expect(insa.playStart).not.toHaveBeenCalled();
    });

    it('oyun oturumu: start hatası oyunu bozmaz (sessiz); ödül talebi yine de denenir', async () => {
        const api = fakeApi({ playStart: vi.fn(() => Promise.reject(httpErr(503))), claim: vi.fn(() => Promise.resolve({ claimed: true, key: 'k', amount: 40, granted: 40 })) });
        renderScreen({ user: MEMBER, api });
        await ready();
        await waitFor(() => expect(api.playStart).toHaveBeenCalled());
        expect(screen.queryByRole('alertdialog')).toBeNull();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'parkour:1:first' }));
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('parkour:1:first'));
    });

    it('ödül: no_session -> play/start -> talep yeniden denenir ve motora bildirilir', async () => {
        const api = fakeApi({
            claim: vi.fn().mockRejectedValueOnce(httpErr(422, { reason: 'no_session', key: 'zone:1:boss' }, 'Önce oturum')).mockResolvedValue({ claimed: true, key: 'zone:1:boss', amount: 150, granted: 150, capped: false }),
        });
        renderScreen({ user: MEMBER, api });
        await ready();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('zone:1:boss'));
        expect(api.claim).toHaveBeenCalledTimes(2);
        expect(api.playStart.mock.calls.length).toBeGreaterThanOrEqual(1);
    });

    it('ödül: too_early -> motora "alındı" DENMEZ (bekleyen kuyrukta kalır); süre dolana dek tekrar olayı sunucuya gitmez', async () => {
        const api = fakeApi({ claim: vi.fn(() => Promise.reject(httpErr(422, { reason: 'too_early', key: 'zone:1:boss', remaining_seconds: 300 }, 'Biraz daha oyna'))) });
        renderScreen({ user: MEMBER, api });
        await ready();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        await waitFor(() => expect(api.claim).toHaveBeenCalledTimes(1));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(engine.controls.markRewardClaimed).not.toHaveBeenCalledWith('zone:1:boss');
        // Motor 90 sn'de bir yeniden yayar: erteleme süresi dolmadı, ikinci istek yok.
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss', retry: true }));
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(api.claim).toHaveBeenCalledTimes(1);
        expect(engine.controls.markRewardClaimed).not.toHaveBeenCalledWith('zone:1:boss');
    });

    it('ödül: misafir talep etmez, motora "alındı" demez; giriş önerilir', async () => {
        const api = fakeApi({ claim: vi.fn() });
        renderScreen({ user: null, api });
        await ready();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        expect(api.claim).not.toHaveBeenCalled();
        expect(engine.controls.markRewardClaimed).not.toHaveBeenCalled();
        expect(await screen.findAllByText(/giriş yap/i)).not.toHaveLength(0);
    });

    it('üye: alınmış ödüller overview.claimed ile motora bildirilir', async () => {
        const api = fakeApi({ overview: vi.fn(() => Promise.resolve({ profile: PROFILE_3_OF_5, wallet: { balance: 1 }, claimed: ['zone:1:boss', 'zone:1:seal'] })) });
        renderScreen({ user: MEMBER, api });
        await ready();
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledTimes(2));
        expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('zone:1:seal');
    });

    it('sonuç köprüsü: zafer ve çıkışta özet (bulmaca, bölge, süre)', async () => {
        const onResult = vi.fn();
        const sessionRef = createRef();
        renderScreen({ onResult, sessionRef, onExit: vi.fn() });
        await ready();
        act(() => engine.cb.onEvent({ type: 'puzzleSolved', id: 'p1' }));
        act(() => engine.cb.onEvent({ type: 'puzzleSolved', id: 'p2' }));
        act(() => engine.cb.onEvent({ type: 'zoneUnlocked', zone: 2 }));
        expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ puzzles: 3, zone: 2, mode: 'macera', final: false }));
        await act(async () => sessionRef.current.actions.leave());
        expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ final: true, playSeconds: 125 }));
    });

    it('ayarlar: değişiklik saklanır ve motora iletilir', async () => {
        const sessionRef = createRef();
        renderScreen({ sessionRef });
        await ready();
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Ayarlar/ }));
        const sens = await screen.findByRole('slider', { name: /Bakış hassasiyeti/ });
        fireEvent.change(sens, { target: { value: '2' } });
        expect(engine.controls.setSettings).toHaveBeenCalledWith(expect.objectContaining({ sensitivity: 2 }));
        expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).sensitivity).toBe(2);
    });

    it('kayıtlı ayarlar ve kalite tercihi motora başlangıçta verilir', async () => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ quality: 'low', fov: 80, muted: true, easy: true }));
        renderScreen();
        await ready();
        expect(engine.opts.quality).toBe('low');
        expect(engine.opts.settings).toMatchObject({ fov: 80, easy: true });
        expect(engine.opts.muted).toBe(true);
    });
});

describe('KesifGameScreen: inşa — kaydet / yayınla', () => {
    const flowApi = (over = {}) =>
        fakeApi({
            overview: vi.fn(() => Promise.resolve({ profile: PROFILE_3_OF_5, wallet: { balance: 12000 }, claimed: [] })),
            createMap: vi.fn((b) => Promise.resolve({ map: { id: 'new1', title: b.title, description: b.description, visibility: 'private' }, profile: PROFILE_3_OF_5 })),
            updateMap: vi.fn((id, b) => Promise.resolve({ map: { id, title: b.title || 'Evim', description: b.description || null, visibility: 'private' } })),
            publish: vi.fn((id) => Promise.resolve({ map: { id, title: 'Güzel Ev', visibility: 'public' } })),
            ...over,
        });

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
    });

    async function openPublish() {
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı yayınla/ }));
    }

    it('duraklat menüsünde günün saati seçilir ve motora (setMapTime) iletilir', async () => {
        renderScreen({ entry: INSA, user: MEMBER, api: flowApi() });
        await ready();
        act(() => engine.setUi('pause'));
        const group = await screen.findByRole('group', { name: 'Günün saati' });
        fireEvent.click(within(group).getByRole('button', { name: 'Gün batımı' }));
        expect(engine.controls.setMapTime).toHaveBeenCalledWith('gün batımı');
        expect(within(group).getByRole('button', { name: 'Gün batımı' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('boş hak varken: form -> createMap (kapakla) -> publish -> başarı penceresi', async () => {
        const api = flowApi();
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        await openPublish();
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı yayınla' });
        expect(api.overview).toHaveBeenCalled();
        const submit = within(dlg).getByRole('button', { name: /Kaydet ve yayınla/ });
        expect(submit).toBeDisabled();
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Güzel Ev' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(submit);
        await waitFor(() => expect(api.createMap).toHaveBeenCalledTimes(1));
        // ikinci argüman: yeniden denemede aynı Idempotency-Key (çift hak/harita olmasın)
        expect(api.createMap).toHaveBeenCalledWith(
            { title: 'Güzel Ev', description: null, data: MAP, cover: 'data:image/jpeg;base64,AAAA' },
            { key: expect.any(String) }
        );
        await waitFor(() => expect(api.publish).toHaveBeenCalledWith('new1'));
        expect(await screen.findByRole('dialog', { name: 'Harita yayında' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Tamam/ }));
        expect(screen.queryByRole('dialog', { name: 'Harita yayında' })).toBeNull();
        // sonraki kayıt aynı haritayı günceller (yeni hak yemez)
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı kaydet/ }));
        await waitFor(() => expect(api.updateMap).toHaveBeenCalledWith('new1', { data: MAP, cover: 'data:image/jpeg;base64,AAAA' }));
        expect(api.createMap).toHaveBeenCalledTimes(1);
    });

    it('özel kaydet: yayınlanmaz', async () => {
        const api = flowApi();
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı kaydet/ }));
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı kaydet' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Evim' } });
        fireEvent.click(within(dlg).getByRole('button', { name: 'Kaydet' }));
        await waitFor(() => expect(api.createMap).toHaveBeenCalled());
        expect(api.publish).not.toHaveBeenCalled();
        expect(await screen.findByRole('dialog', { name: 'Harita kaydedildi' })).toBeInTheDocument();
    });

    it('hak yoksa: Harita Hakkı Al penceresi; satın alınca forma geçer ve kaydeder', async () => {
        const api = flowApi({
            overview: vi.fn(() => Promise.resolve({ profile: { ...PROFILE_3_OF_5, maps_used: 5, slots_free: 0 }, wallet: { balance: 12000 }, claimed: [] })),
            buySlots: vi.fn(() => Promise.resolve({ profile: { ...PROFILE_3_OF_5, map_slots: 10, maps_used: 5, slots_free: 5 }, wallet: { balance: 2000 }, purchased: 5 })),
        });
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        await openPublish();
        const shop = await screen.findByRole('dialog', { name: /Harita Hakkı/ });
        expect(screen.queryByRole('dialog', { name: 'Haritayı yayınla' })).toBeNull();
        fireEvent.click(within(shop).getByRole('button', { name: /jetonla satın al/ }));
        await waitFor(() => expect(api.buySlots).toHaveBeenCalledTimes(1));
        // başarı ekranından kapat -> form
        fireEvent.click(await screen.findByRole('button', { name: 'Harika!' }));
        expect(await screen.findByRole('dialog', { name: 'Haritayı yayınla' })).toBeInTheDocument();
    });

    it('sunucu 422 no_slot derse (bayat sayaç) hak penceresine düşer', async () => {
        const api = flowApi({ createMap: vi.fn(() => Promise.reject(httpErr(422, { reason: 'no_slot', map_slots: 5, maps_used: 5 }, 'Hak yok'))) });
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        await openPublish();
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı yayınla' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Güzel Ev' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet ve yayınla/ }));
        expect(await screen.findByRole('dialog', { name: /Harita Hakkı/ })).toBeInTheDocument();
        expect(api.publish).not.toHaveBeenCalled();
    });

    it('başlık süzgeci (text_blocked) başlığın altında gösterilir', async () => {
        const api = flowApi({ createMap: vi.fn(() => Promise.reject(httpErr(422, { reason: 'text_blocked', field: 'title' }, 'Başlık uygun değil'))) });
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        await openPublish();
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı yayınla' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'kötü' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet ve yayınla/ }));
        expect(await within(dlg).findByText(/Başlıkta uygun olmayan bir ifade var/)).toBeInTheDocument();
        expect(within(dlg).getByLabelText('Başlık')).toHaveAttribute('aria-invalid', 'true');
    });

    it('harita yazıldı ama yayın başarısız: harita özel kalır, kullanıcı bilgilendirilir', async () => {
        const api = flowApi({ publish: vi.fn(() => Promise.reject(httpErr(403, null, 'Bu harita yayınlanamaz'))) });
        renderScreen({ entry: INSA, user: MEMBER, api });
        await ready();
        await openPublish();
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı yayınla' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Güzel Ev' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet ve yayınla/ }));
        const done = await screen.findByRole('dialog', { name: 'Harita kaydedildi' });
        expect(done).toHaveTextContent('yayınlanamadı');
    });

    it('misafir: giriş çağrısı; Giriş yap onLogin çağırır, Oynamaya devam et kapatır; Haritayı kaydet düğmesi yok', async () => {
        const onLogin = vi.fn();
        const api = flowApi();
        renderScreen({ entry: INSA, user: null, api, onLogin });
        await ready();
        act(() => engine.setUi('pause'));
        expect(screen.queryByRole('button', { name: /Haritayı kaydet/ })).toBeNull();
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı yayınla/ }));
        const dlg = await screen.findByRole('dialog', { name: 'Giriş yapman gerekiyor' });
        expect(api.createMap).not.toHaveBeenCalled();
        expect(engine.controls.exportMap).not.toHaveBeenCalled();
        fireEvent.click(within(dlg).getByRole('button', { name: /Giriş yap/ }));
        expect(onLogin).toHaveBeenCalledTimes(1);
        fireEvent.click(within(dlg).getByRole('button', { name: 'Oynamaya devam et' }));
        expect(screen.queryByRole('dialog', { name: 'Giriş yapman gerekiyor' })).toBeNull();
    });

    it('dışa aktarma hatası (ör. çok büyük harita) Türkçe hata penceresinde gösterilir', async () => {
        engine = makeEngine({ exportResult: { ok: false, errors: ['Harita en fazla 64 chunk olabilir.'] } });
        loadKesifEngine.mockResolvedValue(engine.mod);
        renderScreen({ entry: INSA, user: MEMBER, api: flowApi() });
        await ready();
        await openPublish();
        expect(await screen.findByRole('dialog', { name: 'Harita kaydedilemedi' })).toHaveTextContent('64 chunk');
    });

    it('harita düzenleme: mapId kendi haritanı yükler, motora mapData verir; Kaydet var olanı günceller', async () => {
        const api = flowApi({ map: vi.fn(() => Promise.resolve({ map: { id: 'm1', title: 'Evim', description: 'd', mine: true, data: MAP } })) });
        renderScreen({ entry: { ...INSA, mapId: 'm1', base: null }, user: MEMBER, api });
        await ready();
        expect(api.map).toHaveBeenCalledWith('m1');
        expect(engine.opts.mapData).toEqual(MAP);
        expect(engine.opts.mode).toBe('insa');
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı kaydet/ }));
        await waitFor(() => expect(api.updateMap).toHaveBeenCalledWith('m1', { data: MAP, cover: 'data:image/jpeg;base64,AAAA' }));
        expect(api.createMap).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: /Harita/ })).toBeNull();
    });

    it('harita modu: paylaşılan harita yüklenir, kayıt yazılmaz; yükleme hatasında yeniden denenebilir', async () => {
        const api = flowApi({
            map: vi.fn().mockRejectedValueOnce(httpErr(404, null, 'Bu harita bulunamadı')).mockResolvedValue({ map: { id: 'm9', title: 'Vadi', data: MAP } }),
        });
        renderScreen({ entry: { mode: 'harita', seed: null, mapId: 'm9', saveId: null, base: null }, user: MEMBER, api });
        const panel = await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' });
        expect(panel).toHaveTextContent('bulunamadı');
        fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/ }));
        await ready();
        expect(engine.opts).toMatchObject({ mode: 'harita', mapData: MAP });
        await act(async () => engine.cb.onSave({ save: SAVE, reason: 'auto' }));
        expect(slotKeys()).toEqual([]);
        expect(api.map).toHaveBeenCalledTimes(2);
    });
});
