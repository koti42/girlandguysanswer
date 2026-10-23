// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

const auth = { isAuthenticated: false, user: null, loading: false };
vi.mock('../../../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));
vi.mock('../../../../services/kesifApi', async () => {
    const { fakeApi } = await import('../../../../components/game/kesif/__tests__/kesifTestKit');
    const api = fakeApi();
    return { default: api, kesifApi: api };
});

import { loadKesifEngine } from '../engineLoader';
import KesifPlayPage from '../KesifPlayPage';
import { makeEngine } from './fakeKesifEngine';

let engine;
const LocationProbe = () => {
    const loc = useLocation();
    return <output data-testid="loc">{`${loc.pathname}|${JSON.stringify(loc.state)}`}</output>;
};

const renderAt = (state) =>
    render(
        <MemoryRouter initialEntries={[{ pathname: '/oyun/kesif/oyna', state }]}>
            <LocationProbe />
            <Routes>
                <Route path="/oyun/kesif" element={<div>LOBİ</div>} />
                <Route path="/oyun/kesif/oyna" element={<KesifPlayPage />} />
                <Route path="/login" element={<div>GİRİŞ</div>} />
            </Routes>
        </MemoryRouter>
    );

describe('KesifPlayPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        Object.assign(auth, { isAuthenticated: false, user: null, loading: false });
        engine = makeEngine();
        loadKesifEngine.mockResolvedValue(engine.mod);
    });
    afterEach(async () => {
        cleanup();
        await new Promise((r) => setTimeout(r, 5));
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
    });

    it('giriş durumu yoksa lobiye döner; motor yüklenmez', async () => {
        renderAt(undefined);
        expect(await screen.findByText('LOBİ')).toBeInTheDocument();
        expect(loadKesifEngine).not.toHaveBeenCalled();
    });

    it('geçersiz / tüketilmiş giriş lobiye döner', async () => {
        renderAt({ entry: { mode: 'macera' } });
        expect(await screen.findByText('LOBİ')).toBeInTheDocument();
        cleanup();
        renderAt({ consumed: true });
        expect(await screen.findByText('LOBİ')).toBeInTheDocument();
    });

    it('misafir macera: oyun açılır, durum "tüketildi" olarak işaretlenir (yenilemede tekrar başlamaz)', async () => {
        renderAt({ entry: { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null } });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        expect(engine.opts).toMatchObject({ mode: 'macera', seed: 'ABCD1234', gender: null, accessibility: false });
        expect(document.title).toContain('Herkesler Keşfediyor');
        await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('{"consumed":true}'));
        expect(screen.getByTestId('kesif-stage')).toBeInTheDocument();
    });

    it('üye: karakter ve cinsiyet motora gider; erişilebilirlik modu seçenek olur', async () => {
        const game_avatar = { v: 1, body: 'kiz', skin: 2, hair: { style: 'uzun', color: 3 }, top: { style: 'hoodie', color: 0 }, bottom: { style: 'jean', color: 3 }, shoes: { style: 'spor', color: 11 }, acc: 'none', trail: 'none' };
        Object.assign(auth, { isAuthenticated: true, user: { id: 'u1', username: 'ayse', gender: 'female', detail: { game_avatar, accessibility_mode: true } } });
        renderAt({ entry: { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null } });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        expect(engine.opts.gender).toBe('female');
        expect(engine.opts.avatar).toMatchObject({ body: 'kiz', skin: 2, hair: { style: 'uzun', color: 3 } });
        expect(engine.opts.accessibility).toBe(true);
    });

    it('çıkış lobiye (replace) döner ve motor yok edilir', async () => {
        renderAt({ entry: { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null } });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        act(() => engine.cb.onReady());
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Çıkış/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Kaydetmeden çık/ }));
        expect(await screen.findByText('LOBİ')).toBeInTheDocument();
        expect(engine.controls.destroy).toHaveBeenCalled();
    });

    it('misafir inşa: yayınla -> giriş çağrısı -> /login', async () => {
        renderAt({ entry: { mode: 'insa', seed: 'ABCD1234', base: 'düz' } });
        await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
        act(() => engine.cb.onReady());
        act(() => engine.setUi('pause'));
        fireEvent.click(await screen.findByRole('button', { name: /Haritayı yayınla/ }));
        fireEvent.click(await screen.findByRole('button', { name: /Giriş yap/ }));
        expect(await screen.findByText('GİRİŞ')).toBeInTheDocument();
        expect(engine.opts.base).toBe('düz');
    });

    it('motor kurulurken hata: panel ve çıkış sunulur', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        engine.mod.createKesifGame.mockImplementation(async () => {
            throw new Error('boom');
        });
        renderAt({ entry: { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null } });
        expect(await screen.findByRole('alertdialog', { name: 'Bir aksilik oldu' })).toBeInTheDocument();
        vi.restoreAllMocks();
    });
});
