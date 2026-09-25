import { useCallback, useEffect, useState } from 'react';

/**
 * Panel teması: 'dark' | 'light' | 'system'. Tercih localStorage'da; 'system'
 * işletim sistemini izler. Renkler theme.css'te data-theme ile seçilir.
 */
export const THEME_KEY = 'panel_theme';

export function resolveTheme(pref, systemDark) {
    if (pref === 'light' || pref === 'dark') return pref;
    return systemDark ? 'dark' : 'light';
}

function readPref() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch { return 'dark'; }
}

function systemDark() {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

/** React dışından (portal, yükleme ekranı) o anki çözümlenmiş tema. */
export function currentTheme() {
    return resolveTheme(readPref(), systemDark());
}

export function usePanelTheme() {
    const [pref, setPref] = useState(readPref);
    const [sysDark, setSysDark] = useState(systemDark);

    useEffect(() => {
        const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
        if (!mq) return undefined;
        const on = (e) => setSysDark(e.matches);
        mq.addEventListener?.('change', on);
        return () => mq.removeEventListener?.('change', on);
    }, []);

    const setTheme = useCallback((next) => {
        setPref(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { /* yoksay */ }
    }, []);

    const resolved = resolveTheme(pref, sysDark);
    const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme]);

    return { pref, resolved, setTheme, toggle };
}
