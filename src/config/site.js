export const CANONICAL_ORIGIN = import.meta.env.VITE_CANONICAL_ORIGIN || 'https://herkeslersoruyor.com.tr';

export function getCanonicalHost() {
    try {
        return new URL(CANONICAL_ORIGIN).host;
    } catch {
        return 'herkeslersoruyor.com.tr';
    }
}

export function getCanonicalUrl(pathname = '/', search = '') {
    const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const base = CANONICAL_ORIGIN.replace(/\/$/, '');
    return `${base}${path}${search}`;
}
