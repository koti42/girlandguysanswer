// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, render, waitFor } from '@testing-library/react';

configure({ asyncUtilTimeout: 15000 });
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
import { __resetBridgeForTests } from '../bridge';
import { fakeApi } from '../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from '../../pages/game/kesif/__tests__/fakeKesifEngine';

const LOADOUT = { portal: 'portal:altin-kapi', alet: null, asa: 'asa:mercan', jet: null, arac: 'arac:limonata', gecis: null };
let engine;

const memberConfig = (over = {}) => ({
    v: 1,
    platform: 'android',
    token: '12|tok',
    user: { id: 'u1', username: 'ayse', gender: 'female' },
    safeArea: { top: 30, right: 0, bottom: 20, left: 0 },
    muted: false,
    music: true,
    haptics: true,
    avatar: null,
    native: true,
    ...over,
});
const guestConfig = () => memberConfig({ token: null, user: null });
const started = () => waitFor(() => expect(engine.controls.start).toHaveBeenCalled());

describe('Embed: Keşif mağaza görünümleri', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetBridgeForTests();
        localStorage.clear();
        window.history.pushState({}, '', '/embed.html');
        engine = makeEngine();
        engine.controls.setCosmetics = vi.fn();
        loadKesifEngine.mockResolvedValue(engine.mod);
        window.ReactNativeWebView = { postMessage: () => {} };
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

    it('üye: yük gömmenin jetonlu istemcisinden okunur ve oyuna iletilir (köprü protokolü değişmez)', async () => {
        const loadout = vi.fn(() => Promise.resolve({ loadout: LOADOUT }));
        render(<EmbedApp config={memberConfig()} game="kesif" api={{ kesif: fakeApi({ loadout }) }} />);
        await started();
        expect(loadout).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            const viaOpts = engine.opts.cosmetics && engine.opts.cosmetics.arac === 'arac:limonata';
            const viaApi = engine.controls.setCosmetics.mock.calls.some((c) => c[0] && c[0].arac === 'arac:limonata');
            expect(viaOpts || viaApi).toBe(true);
        });
    });

    it('yük geç gelir: oyun beklemeden açılır, sonra canlı uygulanır', async () => {
        let resolve;
        const loadout = vi.fn(() => new Promise((r) => { resolve = r; }));
        render(<EmbedApp config={memberConfig()} game="kesif" api={{ kesif: fakeApi({ loadout }) }} />);
        await started();
        expect(engine.opts.cosmetics).toBeUndefined();
        await act(async () => { resolve({ loadout: LOADOUT }); });
        await waitFor(() => expect(engine.controls.setCosmetics).toHaveBeenCalledWith(LOADOUT));
    });

    it('misafir: loadout isteği YOK', async () => {
        const loadout = vi.fn(() => Promise.resolve({ loadout: LOADOUT }));
        render(<EmbedApp config={guestConfig()} game="kesif" api={{ kesif: fakeApi({ loadout }) }} />);
        await started();
        await new Promise((r) => setTimeout(r, 30));
        expect(loadout).not.toHaveBeenCalled();
        expect(engine.opts.cosmetics).toBeUndefined();
    });

    it('istek hatası: oyun normal açılır, görünüm değişmez', async () => {
        const loadout = vi.fn(() => Promise.reject(new Error('zaman aşımı')));
        render(<EmbedApp config={memberConfig()} game="kesif" api={{ kesif: fakeApi({ loadout }) }} />);
        await started();
        await new Promise((r) => setTimeout(r, 30));
        expect(engine.controls.setCosmetics).not.toHaveBeenCalled();
        expect(engine.opts.cosmetics).toBeUndefined();
    });
});
