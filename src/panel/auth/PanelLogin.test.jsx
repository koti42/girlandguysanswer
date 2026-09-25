// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = { login: vi.fn(), loginWithPasskey: vi.fn(), startGoogle: vi.fn(), adoptToken: vi.fn(), mainSession: null, user: null };
vi.mock('./PanelAuthContext', () => ({ usePanelAuth: () => auth }));
vi.mock('../api/endpoints', () => ({ authApi: { forgotPassword: vi.fn(() => Promise.resolve({})) }, passkeyApi: {} }));
vi.mock('../lib/webauthn', () => ({ passkeySupported: () => true, conditionalUiAvailable: () => Promise.resolve(false), isUserCancel: (e) => e?.name === 'NotAllowedError' }));

import PanelLogin from './PanelLogin';

function mount(path = '/cpl-manage/login', panel = 'admin') {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/cpl-manage/login" element={<PanelLogin panel={panel} />} />
                <Route path="/mod/login" element={<PanelLogin panel="mod" />} />
                <Route path="/cpl-manage" element={<div>ADMIN HOME</div>} />
                <Route path="/mod" element={<div>MOD HOME</div>} />
            </Routes>
        </MemoryRouter>
    );
}

const adminUser = { id: 'a', username: 'admin', roles: [{ slug: 'admin' }] };
const modUser = { id: 'm', username: 'mod', roles: [{ slug: 'moderator' }] };

describe('PanelLogin', () => {
    beforeEach(() => { Object.values(auth).forEach((f) => typeof f === 'function' && f.mockReset()); auth.user = null; auth.mainSession = null; });

    it('parola ile giriş sonrası panele gider', async () => {
        auth.login.mockResolvedValue(adminUser);
        mount();
        fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'a@b.c' } });
        fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'x' } });
        fireEvent.click(screen.getByTestId('login-submit'));
        await waitFor(() => expect(screen.getByText('ADMIN HOME')).toBeInTheDocument());
        expect(auth.login).toHaveBeenCalledWith('a@b.c', 'x');
    });

    it('moderatör admin girişinden mod paneline yönlenir', async () => {
        auth.login.mockResolvedValue(modUser);
        mount();
        fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'm@b.c' } });
        fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'x' } });
        fireEvent.click(screen.getByTestId('login-submit'));
        await waitFor(() => expect(screen.getByText('MOD HOME')).toBeInTheDocument());
    });

    it('yetkisiz hesap hatası gösterilir', async () => {
        const err = new Error('Bu hesabın panel erişimi yok.'); err.code = 'NO_PANEL_ACCESS';
        auth.login.mockRejectedValue(err);
        mount();
        fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'u@b.c' } });
        fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'x' } });
        fireEvent.click(screen.getByTestId('login-submit'));
        expect(await screen.findByRole('alert')).toHaveTextContent('panel erişimi yok');
    });

    it('Google düğmesi giriş sayfasına dönüş adresiyle akışı başlatır', () => {
        auth.startGoogle.mockResolvedValue();
        mount('/mod/login', 'mod');
        fireEvent.click(screen.getByTestId('login-google'));
        expect(auth.startGoogle).toHaveBeenCalledWith('/mod/login');
    });

    it('Google dönüşündeki token devralınır', async () => {
        auth.adoptToken.mockResolvedValue(adminUser);
        mount('/cpl-manage/login?token=abc');
        await waitFor(() => expect(screen.getByText('ADMIN HOME')).toBeInTheDocument());
        expect(auth.adoptToken).toHaveBeenCalledWith('abc', 'own');
    });

    it('passkey iptali hata göstermez', async () => {
        auth.loginWithPasskey.mockRejectedValue({ name: 'NotAllowedError' });
        mount();
        fireEvent.click(screen.getByTestId('login-passkey'));
        await waitFor(() => expect(auth.loginWithPasskey).toHaveBeenCalled());
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('şifremi unuttum akışı aynı kartta', async () => {
        mount();
        fireEvent.click(screen.getByText('Şifremi unuttum'));
        expect(screen.getByText('Parolanı sıfırla')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('E-posta'), { target: { value: 'a@b.c' } });
        fireEvent.click(screen.getByText('Bağlantı gönder'));
        expect(await screen.findByText('E-postanı kontrol et')).toBeInTheDocument();
    });

    it('ana sitede yetkisiz oturum varsa uyarı gösterir', () => {
        auth.mainSession = { username: 'ayse', hasAccess: false };
        mount();
        expect(screen.getByText(/@ayse/)).toBeInTheDocument();
    });
});
