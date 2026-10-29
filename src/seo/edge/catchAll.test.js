import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROUTE_PATTERNS, handleCatchAll, hasFileExtension, isKnownRoute, normalizePath } from './catchAll.js';

const SHELL = '<!doctype html><html><head><title>Herkesler Soruyor</title></head><body><div id="root"></div></body></html>';

function ctx(url, assets) {
    const assetsFetch = vi.fn(
        assets ||
            (async () => new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );
    return { request: new Request(url), env: { ASSETS: { fetch: assetsFetch } }, waitUntil: () => {}, _assets: assetsFetch };
}

describe('ROUTE_PATTERNS App.jsx ile eşleşir', () => {
    const appJsx = readFileSync(fileURLToPath(new URL('../../App.jsx', import.meta.url)), 'utf8');
    const appRoutes = [...appJsx.matchAll(/<Route\s[^>]*path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');

    it('App.jsx içindeki her rota listede var (yeni rota eklendiğinde buraya da ekle)', () => {
        const missing = appRoutes.filter((p) => !ROUTE_PATTERNS.includes(p));
        expect(missing).toEqual([]);
    });

    it('listedeki her rota App.jsx içinde var (silinen rota burada kalmasın)', () => {
        // /cpl-manage ve /mod kökleri alt uygulamaların (AdminApp, ModApp) index rotası; App.jsx yalnızca /* biçimini bilir.
        const PANEL_ROOTS = ['/cpl-manage', '/mod'];
        const stale = ROUTE_PATTERNS.filter((p) => !appRoutes.includes(p) && !PANEL_ROOTS.includes(p));
        expect(stale).toEqual([]);
    });

    it('her App.jsx rotası parametreleri doldurulunca bilinen sayılır', () => {
        for (const p of appRoutes) {
            const concrete = p.replace(/:[a-zA-Z]+/g, 'abc-123').replace(/\*$/, 'x/y');
            expect(isKnownRoute(concrete), concrete).toBe(true);
        }
    });
});

describe('isKnownRoute / normalizePath / hasFileExtension', () => {
    it('bilinmeyen yollar', () => {
        for (const p of ['/bu-sayfa-yok', '/question', '/question/a/b', '/questionz/x', '/oyun/bilinmeyen', '/profile', '/wp-admin', '/index.php'])
            expect(isKnownRoute(p), p).toBe(false);
    });
    it('sondaki eğik çizgi ve URL kaçışı tolere edilir', () => {
        expect(normalizePath('/questions/')).toBe('/questions');
        expect(normalizePath('/')).toBe('/');
        expect(normalizePath('/question/%C3%A7ay')).toBe('/question/çay');
        expect(isKnownRoute('/opinions/')).toBe(true);
    });
    it('uzantı algısı', () => {
        expect(hasFileExtension('/sitemap_index.xml')).toBe(true);
        expect(hasFileExtension('/assets/index-abc.js')).toBe(true);
        expect(hasFileExtension('/question/soru-3.5-yil')).toBe(false);
        expect(hasFileExtension('/question/x.y')).toBe(true);
    });
});

describe('handleCatchAll', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('bilinen rota → kabuk 200', async () => {
        const c = ctx('https://s.test/opinions');
        const res = await handleCatchAll(c);
        expect(res.status).toBe(200);
        expect(res.headers.get('x-seo-render')).toBe('bypass');
        expect(await res.text()).toBe(SHELL);
    });

    it('bilinmeyen yol → kabuk + noindex, 404', async () => {
        const res = await handleCatchAll(ctx('https://s.test/bu-sayfa-yok-123'));
        expect(res.status).toBe(404);
        expect(res.headers.get('x-seo-render')).toBe('not-found');
        const html = await res.text();
        expect(html).toContain('<meta name="robots" content="noindex, follow">');
        expect(html).toContain('<title>Sayfa bulunamadı - Herkesler Soruyor</title>');
        expect(html).toContain('<div id="root"><main id="seo-ssr">');
    });

    it('uzantılı yol, dosya yok (SPA fallback HTML geldi) → 404 düz metin', async () => {
        const res = await handleCatchAll(ctx('https://s.test/wp-sitemap.xml'));
        expect(res.status).toBe(404);
        expect(res.headers.get('x-seo-render')).toBe('missing-asset');
    });

    it('uzantılı yol, dosya var → statik yanıt olduğu gibi', async () => {
        const c = ctx('https://s.test/some.css', async () => new Response('body{}', { status: 200, headers: { 'content-type': 'text/css' } }));
        const res = await handleCatchAll(c);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('body{}');
    });

    it('.html uzantısı HTML gelirse normal (embed.html)', async () => {
        const res = await handleCatchAll(ctx('https://s.test/embed.html'));
        expect(res.status).toBe(200);
    });

    it('/embed statik geçiş: fonksiyon dokunmaz', async () => {
        const c = ctx('https://s.test/embed', async () => new Response('<embed>', { status: 200, headers: { 'content-type': 'text/html' } }));
        const res = await handleCatchAll(c);
        expect(await res.text()).toBe('<embed>');
        expect(c._assets.mock.calls[0][0].url).toBe('https://s.test/embed');
    });

    it('kabuk alınamazsa fail-open', async () => {
        const c = ctx('https://s.test/yok', async () => { throw new Error('assets down'); });
        await expect(handleCatchAll(c)).rejects.toThrow(); // serveShell de kabuğa muhtaç; hata yukarı taşınır ve Pages 500 verir
    });
});

describe('handleCatchAll: kök yol ana sayfa ön-render\'ına gider', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('/ → home render (title ve WebSite şeması), catch-all kabuk vermez', async () => {
        vi.stubGlobal('caches', undefined);
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url) =>
                new Response(
                    JSON.stringify(url.includes('/categories') ? { data: { categories: [] } } : { data: { questions: [], pagination: {} } }),
                    { status: 200 },
                ),
            ),
        );
        const res = await handleCatchAll(ctx('https://s.test/'));
        expect(res.headers.get('x-seo-render')).toBe('home');
        const html = await res.text();
        expect(html).toContain('<title>Herkesler Soruyor | Kadınlar ve Erkekler Soruyor, Cevaplıyor</title>');
        expect(html).toContain('"@type":"WebSite"');
    });
});
