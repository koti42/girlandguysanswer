import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, passkeyApi } from '../api/endpoints';
import { PANEL_TOKEN_KEY, PANEL_USER_KEY, errorMessage, setUnauthorizedHandler } from '../api/client';
import { can, panelsFor } from '../lib/permissions';
import { loginWithPasskey as webauthnLogin } from '../lib/webauthn';

const Ctx = createContext(null);
/** Token nereden geldi: 'own' (panelde giriş) | 'main' (ana siteden devralındı). */
const PANEL_SOURCE_KEY = 'panel_token_source';
/** Ana uygulamanın kendi oturum anahtarı (src/context/AuthContext). */
const MAIN_TOKEN_KEY = 'token';

export function usePanelAuth() {
    const v = useContext(Ctx);
    if (!v) throw new Error('usePanelAuth, PanelAuthProvider içinde kullanılmalı');
    return v;
}

const read = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, val) => { try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val); } catch { /* yoksay */ } };

function persist(token, user, source) {
    write(PANEL_TOKEN_KEY, token);
    write(PANEL_USER_KEY, JSON.stringify(user));
    write(PANEL_SOURCE_KEY, source);
}
function clear() {
    write(PANEL_TOKEN_KEY, null);
    write(PANEL_USER_KEY, null);
    write(PANEL_SOURCE_KEY, null);
}

/**
 * İki panelin ortak kimlik bağlamı.
 *
 * Giriş yolları: e-posta/parola, Google (dönüşte token), passkey, ve ana
 * siteden DEVRALMA: kullanıcı ana sitede zaten girişliyse ve rolü yetiyorsa
 * panel açılışta o oturumu benimser - ikinci kez giriş sorulmaz.
 *
 * Devralınan oturumda "çıkış" yalnızca panel anahtarlarını siler; sunucuya
 * logout GİTMEZ, yoksa kullanıcı ana siteden de düşerdi.
 */
export function PanelAuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const raw = read(PANEL_USER_KEY);
        if (!raw || !read(PANEL_TOKEN_KEY)) return null;
        try { return JSON.parse(raw); } catch { return null; }
    });
    const [booting, setBooting] = useState(true);
    /** Ana sitede oturum var ama rolü yetmiyor / henüz devralınmadı - giriş ekranı bunu gösterir. */
    const [mainSession, setMainSession] = useState(null);

    const adoptToken = useCallback(async (token, source = 'own') => {
        const res = await authApi.meWith(token);
        const u = res.data?.data?.user ?? res.data?.data ?? null;
        if (!u || !panelsFor(u).length) {
            const err = new Error('Bu hesabın panel erişimi yok.');
            err.code = 'NO_PANEL_ACCESS';
            err.user = u;
            throw err;
        }
        persist(token, u, source);
        setUser(u);
        return u;
    }, []);

    // Açılış: (1) saklı panel oturumunu tazele, (2) yoksa ana site oturumunu dene.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const own = read(PANEL_TOKEN_KEY);
            if (own) {
                try {
                    const res = await authApi.me();
                    const fresh = res.data?.data?.user ?? res.data?.data ?? null;
                    if (!cancelled) {
                        if (fresh && panelsFor(fresh).length) { setUser(fresh); write(PANEL_USER_KEY, JSON.stringify(fresh)); }
                        else { clear(); setUser(null); }
                    }
                } catch { /* 401 interceptor temizler */ }
                if (!cancelled) setBooting(false);
                return;
            }

            const main = read(MAIN_TOKEN_KEY);
            if (main) {
                try {
                    await adoptToken(main, 'main');
                } catch (err) {
                    if (!cancelled && err.code === 'NO_PANEL_ACCESS' && err.user) setMainSession({ username: err.user.username, hasAccess: false });
                }
            }
            if (!cancelled) setBooting(false);
        })();
        return () => { cancelled = true; };
    }, [adoptToken]);

    useEffect(() => {
        setUnauthorizedHandler(() => { clear(); setUser(null); });
        return () => setUnauthorizedHandler(null);
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await authApi.login(email, password);
        const { token, user: u } = res.data.data;
        if (!panelsFor(u).length) {
            const err = new Error('Bu hesabın panel erişimi yok.');
            err.code = 'NO_PANEL_ACCESS';
            throw err;
        }
        persist(token, u, 'own');
        setUser(u);
        return u;
    }, []);

    const loginWithPasskey = useCallback(async (opts = {}) => {
        const { token, user: u } = await webauthnLogin(passkeyApi, opts);
        if (!panelsFor(u).length) {
            const err = new Error('Bu hesabın panel erişimi yok.');
            err.code = 'NO_PANEL_ACCESS';
            throw err;
        }
        persist(token, u, 'own');
        setUser(u);
        return u;
    }, []);

    /** Google: sunucudan URL al ve oraya git; dönüşte login sayfası ?token= ile adoptToken çağırır. */
    const startGoogle = useCallback(async (returnPath) => {
        const redirectUri = `${window.location.origin}${returnPath}`;
        const res = await authApi.googleUrl(redirectUri);
        window.location.assign(res.data.data.url);
    }, []);

    const logout = useCallback(async () => {
        const borrowed = read(PANEL_SOURCE_KEY) === 'main';
        if (!borrowed) {
            try { await authApi.logout(); } catch { /* token zaten geçersiz olabilir */ }
        }
        clear();
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user, booting, mainSession,
        login, loginWithPasskey, startGoogle, adoptToken, logout,
        panels: panelsFor(user),
        isModerator: can.moderate(user),
        isAdmin: can.admin(user),
        isSuperAdmin: can.superAdmin(user),
        borrowedSession: read(PANEL_SOURCE_KEY) === 'main',
        errorMessage,
    }), [user, booting, mainSession, login, loginWithPasskey, startGoogle, adoptToken, logout]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
