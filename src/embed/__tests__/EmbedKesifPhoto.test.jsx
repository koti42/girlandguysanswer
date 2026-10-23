// @vitest-environment jsdom
/*
 * Gömülü Keşif ↔ foto kaydı köprüsü (photo_map): motorun `kesif:savephoto` olayı native `savePhoto` iletilerine çevrilir;
 * native yoksa olay iptal EDİLMEZ (motor kendi indirme yoluna döner); native `photoSaved` ile onaylar.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';

configure({ asyncUtilTimeout: 15000 }); // soğuk başlangıç (dinamik içe aktarma) yük altında 4 sn’yi aşabiliyor
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../../pages/game/kesif/engineLoader', () => ({ loadKesifEngine: vi.fn() }));
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
import { fakeApi } from '../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from '../../pages/game/kesif/__tests__/fakeKesifEngine';

let engine;
let posted;

const guestConfig = () => ({
    v: 1, platform: 'android', token: null, user: null, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, muted: false, music: true, haptics: true, avatar: null, native: true,
});

async function inGame() {
    await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
    act(() => engine.cb.onReady());
    await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

function savePhotoEvent(bytes = 5000) {
    const u = new Uint8Array(bytes);
    for (let i = 0; i < bytes; i++) u[i] = (i * 13) & 255;
    const detail = { id: 1, name: 'neon-meridyen-20260101-000000.jpg', mime: 'image/jpeg', bytes, width: 640, height: 360, blob: new Blob([u], { type: 'image/jpeg' }), result: null };
    return new CustomEvent('kesif:savephoto', { cancelable: true, detail });
}

describe('Embed: keşif foto kaydı', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        localStorage.clear();
        window.history.pushState({}, '', '/embed.html');
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
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        vi.restoreAllMocks();
    });

    it('native varken olay iptal edilir; üstbilgi + sıralı parçalar gider; photoSaved ok → söz true', async () => {
        render(<EmbedApp config={guestConfig()} game="kesif" api={{ kesif: fakeApi() }} />);
        await inGame();
        const ev = savePhotoEvent(5000);
        const notCancelled = window.dispatchEvent(ev);
        expect(notCancelled).toBe(false);
        expect(typeof ev.detail.result.then).toBe('function');
        await waitFor(() => expect(posted.filter((m) => m.type === 'savePhotoPart').length).toBe(3));
        const head = posted.find((m) => m.type === 'savePhoto');
        expect(head).toMatchObject({ mime: 'image/jpeg', bytes: 5000, parts: 3, name: 'neon-meridyen-20260101-000000.jpg' });
        expect(posted.filter((m) => m.type === 'savePhotoPart').map((m) => m.index)).toEqual([0, 1, 2]);
        act(() => { receiveFromNative({ type: 'photoSaved', id: head.id, ok: true }); });
        expect(await ev.detail.result).toBe(true);
    });

    it('native reddederse söz false (motor indirmeye düşer)', async () => {
        render(<EmbedApp config={guestConfig()} game="kesif" api={{ kesif: fakeApi() }} />);
        await inGame();
        const ev = savePhotoEvent(100);
        window.dispatchEvent(ev);
        await waitFor(() => expect(posted.some((m) => m.type === 'savePhoto')).toBe(true));
        const head = posted.find((m) => m.type === 'savePhoto');
        await waitFor(() => expect(posted.filter((m) => m.type === 'savePhotoPart').length).toBe(1));
        act(() => { receiveFromNative({ type: 'photoSaved', id: head.id, ok: false }); });
        expect(await ev.detail.result).toBe(false);
    });

    it('native köprü yoksa olay iptal EDİLMEZ (motor indirmeyi dener)', async () => {
        render(<EmbedApp config={guestConfig()} game="kesif" api={{ kesif: fakeApi() }} />);
        await inGame();
        delete window.ReactNativeWebView;
        const ev = savePhotoEvent(100);
        expect(window.dispatchEvent(ev)).toBe(true);
        expect(ev.detail.result).toBeNull();
        expect(posted.some((m) => m.type === 'savePhoto')).toBe(false);
    });

    it('bileşen sökülünce dinleyici kalkar', async () => {
        const { unmount } = render(<EmbedApp config={guestConfig()} game="kesif" api={{ kesif: fakeApi() }} />);
        await inGame();
        unmount();
        const ev = savePhotoEvent(100);
        expect(window.dispatchEvent(ev)).toBe(true);
    });
});
