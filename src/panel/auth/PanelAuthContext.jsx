import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/endpoints';
import { PANEL_TOKEN_KEY, PANEL_USER_KEY, errorMessage, setUnauthorizedHandler } from '../api/client';
import { can, panelsFor } from '../lib/permissions';

const Ctx = createContext(null);

export function usePanelAuth() {
    const v = useContext(Ctx);
    if (!v) throw new Error('usePanelAuth, PanelAuthProvider içinde kullanılmalı');
    return v;
}

const read = (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key, val) => {
    try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val); } catch { /* yoksay */ }
};

/**
 * İki panelin ortak kimlik bağlamı. Giriş yapan kullanıcının rolüne göre
 * `panels` hesaplanır; shell'ler kendi panelini bu listede arar.
 */
export function PanelAuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const raw = read(PANEL_USER_KEY);
        if (!raw || !read(PANEL_TOKEN_KEY)) return null;
        try { return JSON.parse(raw); } catch { return null; }
    });
    const [booting, setBooting] = useState(!!user);

    // Saklı kullanıcıyı sunucudan tazele: rolü değiştiyse veya token
    // iptal edildiyse panel açılışta düşsün.
    useEffect(() => {
        if (!user) { setBooting(false); return; }
        let cancelled = false;
        authApi.me()
            .then((res) => {
                if (cancelled) return;
                const fresh = res.data?.data?.user ?? res.data?.data ?? null;
                if (fresh && panelsFor(fresh).length) {
                    setUser(fresh);
                    write(PANEL_USER_KEY, JSON.stringify(fresh));
                } else {
                    setUser(null);
                    write(PANEL_TOKEN_KEY, null);
                    write(PANEL_USER_KEY, null);
                }
            })
            .catch(() => { /* 401 interceptor halleder */ })
            .finally(() => { if (!cancelled) setBooting(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setUnauthorizedHandler(() => setUser(null));
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
        write(PANEL_TOKEN_KEY, token);
        write(PANEL_USER_KEY, JSON.stringify(u));
        setUser(u);
        return u;
    }, []);

    const logout = useCallback(async () => {
        try { await authApi.logout(); } catch { /* token zaten geçersiz olabilir */ }
        write(PANEL_TOKEN_KEY, null);
        write(PANEL_USER_KEY, null);
        setUser(null);
    }, []);

    const value = useMemo(() => ({
        user,
        booting,
        login,
        logout,
        panels: panelsFor(user),
        isModerator: can.moderate(user),
        isAdmin: can.admin(user),
        isSuperAdmin: can.superAdmin(user),
        errorMessage,
    }), [user, booting, login, logout]);

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
