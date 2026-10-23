// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

configure({ asyncUtilTimeout: 15000 }); // soğuk başlangıç (dinamik içe aktarma) yük altında 4 sn’yi aşabiliyor
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../../pages/game/kesif/engineLoader', () => ({ loadKesifEngine: vi.fn() }));
// Site istemcisi gömmede asla kullanılmamalı: çağrılırsa test düşer.
vi.mock('../../services/kesifApi', () => {
    const boom = () => {
        throw new Error('site kesifApi gömmede kullanılmamalı');
    };
    const api = new Proxy({}, { get: () => boom });
    return { default: api, kesifApi: api, createKesifApi: boom };
});

import { loadKesifEngine } from '../../pages/game/kesif/engineLoader';
import EmbedApp from '../EmbedApp';
import { __resetBridgeForTests, receiveFromNative } from '../bridge';
import { summarizeKesifResult } from '../embedResult';
import { fakeApi, MAP_A, MINE_PRIVATE, PROFILE_3_OF_5 } from '../../components/game/kesif/__tests__/kesifTestKit';
import { MAP, SAVE, httpErr, makeEngine } from '../../pages/game/kesif/__tests__/fakeKesifEngine';
import { defaultAvatar, normalizeAvatar } from '../../game/avatar/catalog';
import * as saveStorage from '../../game/kesif/sim/saveStorage.js';

const AVATAR = { v: 1, body: 'kiz', skin: 3, hair: { style: 'mohawk', color: 7 }, top: { style: 'ceket', color: 2 }, bottom: { style: 'etek', color: 1 }, shoes: { style: 'neon', color: 6 }, acc: 'tac', trail: 'kalp' };

let engine;
let posted;
const types = () => posted.map((m) => m.type);
const lastOf = (type) => [...posted].reverse().find((m) => m.type === type);

const memberConfig = (over = {}) => ({
    v: 1,
    platform: 'android',
    token: '12|tok',
    user: { id: 'u1', username: 'ayse', gender: 'female' },
    safeArea: { top: 30, right: 0, bottom: 20, left: 0 },
    muted: false,
    music: true,
    haptics: true,
    avatar: AVATAR,
    native: true,
    ...over,
});
const guestConfig = (over = {}) => memberConfig({ token: null, user: null, avatar: null, ...over });

const makeApi = (kesif = {}) => ({ kesif: fakeApi(kesif) });

const setSearch = (q) => window.history.pushState({}, '', q ? `/embed.html${q}` : '/embed.html');

function renderEmbed(config, api, { strict = false } = {}) {
    const tree = <EmbedApp config={config} game="kesif" api={api} />;
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const started = () => waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
async function inGame() {
    await started();
    act(() => engine.cb.onReady());
    await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

describe('Embed: keşif', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        localStorage.clear();
        setSearch('');
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
        posted = [];
        window.ReactNativeWebView = { postMessage: (json) => posted.push(JSON.parse(json)) };
        HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ getExtension: () => null }));
        window.WebGL2RenderingContext = function WebGL2RenderingContext() {};
    });

    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        delete window.ReactNativeWebView;
        delete window.WebGL2RenderingContext;
        setSearch('');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
    });

    it('misafir: kayıt yoksa doğrudan yeni macera; ready bildirilir, varsayılan karakter, sunucuya gidilmez', async () => {
        const api = makeApi();
        renderEmbed(guestConfig(), api);
        await started();
        expect(lastOf('ready')).toEqual({ type: 'ready', game: 'kesif' });
        expect(engine.opts.mode).toBe('macera');
        expect(engine.opts.seed).toMatch(/^[0-9A-Z]{8}$/);
        expect(engine.opts.save).toBeNull();
        expect(engine.opts.avatar).toEqual(normalizeAvatar(null, undefined));
        expect(engine.opts.avatar).toEqual(defaultAvatar());
        expect(engine.opts.muted).toBe(false);
        expect(engine.opts.music).toBe(true);
        act(() => engine.cb.onReady());
        act(() => engine.cb.onHaptic('success'));
        expect(posted.filter((m) => m.type === 'haptic')).toEqual([{ type: 'haptic', style: 'success' }]);
        // misafir: hiçbir istek yok
        expect(Object.values(api.kesif).every((fn) => !fn.mock || fn.mock.calls.length === 0)).toBe(true);
        expect(localStorage.getItem('token')).toBeNull();
    });

    it('StrictMode: tek motor, tek ready', async () => {
        renderEmbed(guestConfig(), makeApi(), { strict: true });
        await started();
        expect(engine.mod.createKesifGame).toHaveBeenCalledTimes(1);
        expect(posted.filter((m) => m.type === 'ready')).toHaveLength(1);
    });

    it('üye + yerel kayıt: devam / yeni macera seçimi; devam kaydı motora verir', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        await saveStorage.saveToSlot(mem, 'm-eski', { ...SAVE, savedAt: Date.now() });
        const api = makeApi();
        renderEmbed(memberConfig(), api);
        const card = await screen.findByRole('alertdialog', { name: 'Maceraya devam et' });
        expect(card).toHaveTextContent('Test macerası');
        expect(api.kesif.overview).toHaveBeenCalled();
        fireEvent.click(within(card).getByRole('button', { name: /Kaldığın yerden devam et/ }));
        await started();
        expect(engine.opts.save).toEqual({ ...SAVE, savedAt: expect.any(Number) });
        expect(engine.opts.seed).toBe(4242);
        expect(engine.opts.gender).toBe('female');
        expect(engine.opts.avatar).toEqual(normalizeAvatar(AVATAR, 'female'));
    });

    it('seçim ekranında "Yeni macera başlat" taze dünya açar; çıkış native\'e gider', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        await saveStorage.saveToSlot(mem, 'm-eski', SAVE);
        renderEmbed(memberConfig(), makeApi());
        fireEvent.click(await screen.findByRole('button', { name: /Yeni macera başlat/ }));
        await started();
        expect(engine.opts.save).toBeNull();
        expect(engine.opts.seed).toMatch(/^[0-9A-Z]{8}$/);
    });

    it('seçim ekranında native geri tuşu çıkış yapar', async () => {
        const mem = saveStorage.createLocalStorageAdapter();
        await saveStorage.saveToSlot(mem, 'm-eski', SAVE);
        renderEmbed(memberConfig(), makeApi());
        await screen.findByRole('alertdialog', { name: 'Maceraya devam et' });
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        expect(await screen.findByText('Oyundan çıkıldı.')).toBeInTheDocument();
    });

    it('üye + bulut kaydı: seçimde görünür, devam bulut kaydını okur', async () => {
        const api = makeApi({
            overview: vi.fn(() => Promise.resolve({ profile: PROFILE_3_OF_5, wallet: { balance: 1 }, stats: { name: 'Bulut Macerası', playTime: 600, zonesUnlocked: 2 }, claimed: [], cloud_save: { exists: true, saved_at: '2026-10-10T10:00:00Z', bytes: 100 } })),
            getSave: vi.fn(() => Promise.resolve({ save: SAVE, saved_at: 'x', bytes: 10 })),
        });
        renderEmbed(memberConfig(), api);
        const card = await screen.findByRole('alertdialog', { name: 'Maceraya devam et' });
        expect(card).toHaveTextContent('Bulut Macerası');
        fireEvent.click(within(card).getByRole('button', { name: /Kaldığın yerden devam et/ }));
        await started();
        expect(api.kesif.getSave).toHaveBeenCalledTimes(1);
        expect(engine.opts.save).toEqual(SAVE);
    });

    it('oturum düşmüşse (401) giriş ister; misafir olarak oynanabilir (sunucu çağrısı yok)', async () => {
        const api = makeApi({ overview: vi.fn(() => Promise.reject(httpErr(401, null, 'Unauthenticated.'))), claim: vi.fn() });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('alertdialog', { name: 'Oturumun sona ermiş' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        fireEvent.click(screen.getByRole('button', { name: /Misafir olarak oyna/ }));
        await started();
        expect(engine.opts.gender).toBeNull();
        act(() => engine.cb.onReady());
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        expect(api.kesif.claim).not.toHaveBeenCalled();
    });

    it('WebGL 2 yoksa hiçbir istek atılmaz; geri tuşu çıkar', async () => {
        HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
        const api = makeApi();
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('alertdialog', { name: '3D desteklenmiyor' })).toBeInTheDocument();
        expect(api.kesif.overview).not.toHaveBeenCalled();
        expect(engine.mod.createKesifGame).not.toHaveBeenCalled();
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
    });

    it('?mode=insa: yeni inşa; yayınla -> kayıt -> "Haritalarım" native lobiyi açar', async () => {
        setSearch('?mode=insa');
        const api = makeApi({
            createMap: vi.fn((b) => Promise.resolve({ map: { id: 'n1', title: b.title, visibility: 'private' } })),
            publish: vi.fn((id) => Promise.resolve({ map: { id, title: 'Ev', visibility: 'public' } })),
        });
        renderEmbed(memberConfig(), api);
        await started();
        expect(engine.opts).toMatchObject({ mode: 'insa', base: 'düz' });
        act(() => engine.cb.onReady());
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı yayınla/ }));
        const dlg = await screen.findByRole('dialog', { name: 'Haritayı yayınla' });
        fireEvent.change(within(dlg).getByLabelText('Başlık'), { target: { value: 'Ev' } });
        fireEvent.click(within(dlg).getByRole('checkbox'));
        fireEvent.click(within(dlg).getByRole('button', { name: /Kaydet ve yayınla/ }));
        await screen.findByRole('dialog', { name: 'Harita yayında' });
        expect(api.kesif.createMap).toHaveBeenCalledWith(expect.objectContaining({ data: MAP, title: 'Ev' }), expect.objectContaining({ key: expect.any(String) }));
        fireEvent.click(screen.getByRole('button', { name: /Haritalarım/ }));
        expect(lastOf('openUrl')).toEqual({ type: 'openUrl', url: '/oyun/kesif' });
    });

    it('?mode=insa misafir: yayınla giriş çağrısı native girişe gider', async () => {
        setSearch('?mode=insa');
        renderEmbed(guestConfig(), makeApi());
        await started();
        act(() => engine.cb.onReady());
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı yayınla/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
    });

    it('?mode=harita&map=ID: paylaşılan harita doğrudan oynanır', async () => {
        setSearch('?mode=harita&map=abc-123');
        const api = makeApi({ map: vi.fn(() => Promise.resolve({ map: { id: 'abc-123', title: 'Vadi', data: MAP } })) });
        renderEmbed(memberConfig(), api);
        await started();
        expect(api.kesif.map).toHaveBeenCalledWith('abc-123');
        expect(engine.opts).toMatchObject({ mode: 'harita', mapData: MAP });
    });

    it('?mode=topluluk (üye): lobi bileşenleri çizilir; harita oyna -> çıkışta lobiye dönülür, native çıkış yok', async () => {
        setSearch('?mode=topluluk');
        const api = makeApi({ map: vi.fn(() => Promise.resolve({ map: { id: MAP_A.id, title: MAP_A.title, data: MAP } })) });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByRole('heading', { name: 'Keşif Haritaları' })).toBeInTheDocument();
        expect(await screen.findByText('Güzel Vadi')).toBeInTheDocument();
        expect(api.kesif.maps).toHaveBeenCalled();
        expect(api.kesif.overview).toHaveBeenCalled();
        fireEvent.click(screen.getAllByRole('button', { name: /Oyna/ })[0]);
        await started();
        expect(api.kesif.play).toHaveBeenCalledWith(MAP_A.id);
        expect(engine.opts).toMatchObject({ mode: 'harita', mapData: MAP });
        act(() => engine.cb.onReady());
        // oyundan çık: pause menüsünde Çıkış -> onay -> lobiye dönüş
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Çıkış/ }));
        fireEvent.click(await screen.findByRole('button', { name: /^Çık$/ }));
        expect(await screen.findByRole('heading', { name: 'Keşif Haritaları' })).toBeInTheDocument();
        expect(types()).not.toContain('exit');
        // lobiden çık native'e bildirir
        fireEvent.click(screen.getByRole('button', { name: 'Çık' }));
        expect(lastOf('exit')).toEqual({ type: 'exit' });
    });

    it('?mode=topluluk sekmesi Haritalarım: hak sayacı ve düzenleme', async () => {
        setSearch('?mode=haritalarim');
        const api = makeApi({ map: vi.fn(() => Promise.resolve({ map: { id: MINE_PRIVATE.id, title: 'Evim', mine: true, data: MAP } })) });
        renderEmbed(memberConfig(), api);
        expect(await screen.findByLabelText('Harita hakkı: 3/5')).toBeInTheDocument();
        expect(await screen.findByText('Evim')).toBeInTheDocument();
        fireEvent.click(screen.getAllByRole('button', { name: /İnşa modunda düzenle/ })[0]);
        await started();
        expect(api.kesif.map).toHaveBeenCalledWith(MINE_PRIVATE.id);
        expect(engine.opts).toMatchObject({ mode: 'insa', mapData: MAP });
    });

    it('?mode=slots (üye): harita hakkı penceresi açık gelir ve satın alma çalışır', async () => {
        setSearch('?mode=slots');
        const api = makeApi();
        renderEmbed(memberConfig(), api);
        const dlg = await screen.findByRole('dialog', { name: 'Harita Hakkı Al' });
        await waitFor(() => expect(api.kesif.overview).toHaveBeenCalled());
        fireEvent.click(within(dlg).getByRole('button', { name: /jetonla satın al/ }));
        await waitFor(() => expect(api.kesif.buySlots).toHaveBeenCalledTimes(1));
    });

    it('?mode=topluluk misafir: giriş çağrısı; misafir olarak maceraya başlanabilir', async () => {
        setSearch('?mode=topluluk');
        const api = makeApi();
        renderEmbed(guestConfig(), api);
        expect(await screen.findByRole('alertdialog', { name: 'Topluluk haritaları için giriş yap' })).toBeInTheDocument();
        expect(api.kesif.maps).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Giriş yap/ }));
        expect(lastOf('login')).toEqual({ type: 'login' });
        fireEvent.click(screen.getByRole('button', { name: /Misafir olarak maceraya başla/ }));
        await started();
        expect(engine.opts.mode).toBe('macera');
    });

    it('native pause molayı açar; setMuted / setMusic motora uygulanır ama geri bildirilmez; setAvatar canlı', async () => {
        renderEmbed(guestConfig({ muted: true, music: false }), makeApi());
        await inGame();
        expect(engine.opts.muted).toBe(true);
        expect(engine.opts.music).toBe(false);
        act(() => {
            receiveFromNative({ type: 'pause' });
        });
        expect(engine.controls.pause).toHaveBeenCalled();
        act(() => {
            receiveFromNative({ type: 'resume' });
        });
        expect(engine.controls.resume).not.toHaveBeenCalled();
        act(() => {
            receiveFromNative({ type: 'setMuted', muted: false });
        });
        expect(engine.controls.setMuted).toHaveBeenLastCalledWith(false);
        act(() => {
            receiveFromNative({ type: 'setMusic', music: true });
        });
        expect(engine.controls.setMusicEnabled).toHaveBeenLastCalledWith(true);
        expect(types()).not.toContain('settings');
        act(() => {
            receiveFromNative({ type: 'setAvatar', avatar: AVATAR });
        });
        await waitFor(() => expect(engine.controls.setAvatar).toHaveBeenLastCalledWith(normalizeAvatar(AVATAR, undefined)));
    });

    it('oyunda ses ayarı değişince native\'e settings gider', async () => {
        renderEmbed(guestConfig(), makeApi());
        await inGame();
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Ayarlar/ }));
        const music = await screen.findByRole('switch', { name: 'Müzik' });
        fireEvent.click(music);
        expect(lastOf('settings')).toEqual({ type: 'settings', muted: false, music: false });
    });

    it('native geri tuşu: oyunda menü, menüde çıkış onayı, onayda çıkış (köprüye exit + sonuç)', async () => {
        renderEmbed(memberConfig(), makeApi({ putSave: vi.fn(() => Promise.resolve({})) }));
        await inGame();
        act(() => engine.cb.onEvent({ type: 'puzzleSolved', id: 'p1' }));
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(engine.controls.pause).toHaveBeenCalledTimes(1);
        expect(types()).not.toContain('exit');
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        const dlg = await screen.findByRole('dialog', { name: 'Çıkmak istiyor musun?' });
        fireEvent.click(within(dlg).getByRole('button', { name: 'Kaydetmeden çık' }));
        await waitFor(() => expect(lastOf('exit')).toEqual({ type: 'exit' }));
        const result = lastOf('result');
        // motor istatistiği (3 bulmaca, bölge 1) olay sayaçlarından büyükse o geçerlidir
        expect(result).toMatchObject({ game: 'kesif', mode: 'macera', puzzles: 3, zone: 1, score: 550, playSeconds: 125 });
        expect(posted.indexOf(result)).toBeLessThan(posted.findIndex((m) => m.type === 'exit'));
        expect(engine.controls.destroy).toHaveBeenCalled();
        expect(await screen.findByText('Oyundan çıkıldı.')).toBeInTheDocument();
    });

    it('bölge açılınca ve zaferde sonuç özeti native\'e gider (geçerli köprü mesajı)', async () => {
        renderEmbed(guestConfig(), makeApi());
        await started();
        engine.controls.getStats.mockReturnValue({}); // yalnızca olay sayaçları
        await inGame();
        act(() => engine.cb.onEvent({ type: 'puzzleSolved' }));
        act(() => engine.cb.onEvent({ type: 'zoneUnlocked', zone: 1 }));
        expect(lastOf('result')).toMatchObject({ type: 'result', game: 'kesif', zone: 1, puzzles: 1, score: 350 });
        act(() => engine.cb.onEvent({ type: 'victory', stats: {} }));
        expect(lastOf('result')).toMatchObject({ victory: true, score: 2350 });
    });

    it('yükleme sırasında geri tuşu çıkar', async () => {
        let release;
        loadKesifEngine.mockImplementation(() => new Promise((r) => (release = r)));
        renderEmbed(guestConfig(), makeApi());
        await screen.findByTestId('kesif-loading');
        act(() => {
            receiveFromNative({ type: 'back' });
        });
        expect(lastOf('exit')).toEqual({ type: 'exit' });
        await act(async () => release(engine.mod));
    });

    it('erişilebilirlik: konuşma native TTS köprüsüne gider', async () => {
        renderEmbed(guestConfig({ accessibility: true }), makeApi());
        await inGame();
        expect(engine.opts.accessibility).toBe(true);
        act(() => engine.cb.onSpeak('Bulmaca çözüldü.'));
        expect(lastOf('speak')).toEqual({ type: 'speak', text: 'Bulmaca çözüldü.' });
    });

    it('üye ödül talebi gömme istemcisiyle gider; kimlik sunucuya değil köprüye bağlı', async () => {
        const api = makeApi({ claim: vi.fn(() => Promise.resolve({ claimed: true, key: 'zone:1:boss', amount: 150, granted: 150 })) });
        renderEmbed(memberConfig(), api);
        await inGame();
        act(() => engine.cb.onEvent({ type: 'reward', key: 'zone:1:boss' }));
        await waitFor(() => expect(engine.controls.markRewardClaimed).toHaveBeenCalledWith('zone:1:boss'));
        expect(api.kesif.claim).toHaveBeenCalledWith('zone:1:boss', 'ABCD1234');
    });
});

describe('summarizeKesifResult', () => {
    it('düz değerler; puan = bulmaca x100 + bölge x250 + boss x500 (+2000)', () => {
        expect(summarizeKesifResult({ puzzles: 4, zone: 2, bosses: 1, victory: true, playSeconds: 90.9, mode: 'macera' })).toEqual({
            game: 'kesif',
            mode: 'macera',
            score: 400 + 500 + 500 + 2000,
            zone: 2,
            puzzles: 4,
            bosses: 1,
            victory: true,
            playSeconds: 90,
        });
        const s = summarizeKesifResult(null);
        expect(s).toMatchObject({ game: 'kesif', score: 0, mode: null, victory: false });
        expect(summarizeKesifResult({ puzzles: -5, zone: 'x', mode: 'hack' })).toMatchObject({ puzzles: 0, zone: 0, mode: null, score: 0 });
        expect(Object.values(summarizeKesifResult({ puzzles: 1 })).every((v) => v === null || ['number', 'boolean', 'string'].includes(typeof v))).toBe(true);
    });
});
