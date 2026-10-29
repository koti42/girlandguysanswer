/*
 * Catch-all edge işleyicisi: bilinmeyen yollara gerçek 404.
 *
 * Sorun: SPA fallback (`/* -> /index.html 200`) yüzünden var olmayan her adres 200 + HTML dönüyordu
 * ("soft 404"): tarama bütçesi israfı, indeks şişmesi, hatalı bağlantıların hiç fark edilmemesi.
 *
 * Kural:
 *  - Uzantılı yol (/x.js, /y.xml): statik sunucuya bırakılır. Dosya yoksa SPA fallback HTML döndürür;
 *    .html olmayan bir uzantıya HTML gelmesi "dosya yok" demektir → 404 düz metin.
 *  - Bilinen SPA rotası: kabuk 200 (React çizer).
 *  - Diğer her şey: kabuk + noindex head, HTTP 404 (React yine kendi "bulunamadı" ekranını çizer).
 *
 * ROUTE_PATTERNS, App.jsx'teki <Route path> değerlerinin kopyasıdır; catchAll.test.js App.jsx'i
 * ayrıştırıp eksik rota olmadığını doğrular. Yeni rota eklendiğinde buraya da eklenmeli.
 */
import { injectIntoShell } from './html.js';
import { notFoundPage } from './pages.js';
import { fetchShell, renderSeoPage, resolveConfig, serveShell } from './render.js';

export const ROUTE_PATTERNS = [
    '/',
    '/500',
    '/ask',
    '/auth/google/callback',
    '/blog',
    '/cerez-politikasi',
    '/cocuk-guvenligi',
    '/communities',
    '/community-invitations',
    '/community/:uuid',
    '/complete-profile',
    '/cpl-manage',
    '/cpl-manage/*',
    '/etiketler',
    '/feature-tags',
    '/follow-requests',
    '/forgot-password',
    '/gizlilik-politikasi',
    '/iletisim',
    '/kullanim-kilavuzu',
    '/kullanim-kurallari',
    '/leaderboard',
    '/login',
    '/messages',
    '/messages/:username',
    '/mod',
    '/mod/*',
    '/notifications',
    '/opinion/:slugOrId',
    '/opinions',
    '/opinions/yaz',
    '/ortaklik',
    '/oyun',
    '/oyun/arena',
    '/oyun/duello',
    '/oyun/duello/:id',
    '/oyun/gunluk',
    '/oyun/ikilem',
    '/oyun/karakter',
    '/oyun/kesif',
    '/oyun/kesif/oyna',
    '/oyun/kosu',
    '/oyun/kosu/oyna',
    '/oyun/kule',
    '/oyun/kule/oyna',
    '/oyun/liderlik',
    '/oyun/magaza',
    '/oyun/oyna/:sessionId',
    '/oyun/profil/:username',
    '/oyun/protocol-zero',
    '/oyun/protocol-zero/oyna',
    '/oyun/sonuc/:sessionId',
    '/profile/:username',
    '/profile/:username/followers',
    '/profile/:username/following',
    '/question-submitted',
    '/question/:slug',
    '/questions',
    '/questions/:slug',
    '/reklam',
    '/reset-password',
    '/search',
    '/settings',
    '/signup',
    '/site-sozlesmesi',
    '/sss',
    '/stories',
    '/stories/yaz',
    '/story/:slugOrId',
    '/xper-puan',
    '/yardim-merkezi',
];

/** Statik olarak var olan, fonksiyonun dokunmaması gereken uzantısız yollar (temiz URL). */
export const STATIC_PASSTHROUGH = new Set(['/embed']);

function patternToRegex(pattern) {
    const body = pattern
        .split('/')
        .map((seg) => {
            if (seg === '*') return '.*';
            if (seg.startsWith(':')) return '[^/]+';
            return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/');
    return new RegExp(`^${body}$`);
}

const ROUTE_REGEXES = ROUTE_PATTERNS.map(patternToRegex);

export function normalizePath(pathname) {
    let p = pathname || '/';
    try {
        p = decodeURIComponent(p);
    } catch {
        // bozuk kaçış dizisi: olduğu gibi bırak
    }
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '') || '/';
    return p;
}

export function isKnownRoute(pathname) {
    const p = normalizePath(pathname);
    return ROUTE_REGEXES.some((re) => re.test(p));
}

export function hasFileExtension(pathname) {
    return /\.[a-z0-9]{1,8}$/i.test(pathname);
}

export async function handleCatchAll(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
        // Kök yol: functions/index.js ile yarışmasın; catch-all önce eşleşirse de ana sayfa ön-render'ı çalışsın.
        if (path === '/') return renderSeoPage(context, 'home', '');

        if (STATIC_PASSTHROUGH.has(path)) return env.ASSETS.fetch(request);

        if (hasFileExtension(path)) {
            const res = await env.ASSETS.fetch(request);
            const type = res.headers.get('content-type') || '';
            if (type.includes('text/html') && !/\.html?$/i.test(path)) {
                return new Response('Not Found', {
                    status: 404,
                    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-seo-render': 'missing-asset' },
                });
            }
            return res;
        }

        if (isKnownRoute(path)) return serveShell(context);

        const shellRes = await fetchShell(context);
        if (!shellRes.ok) return serveShell(context);
        const { origin } = resolveConfig(env);
        const html = injectIntoShell(await shellRes.text(), notFoundPage({ origin, path: url.pathname }, 'Sayfa'));
        return new Response(html, {
            status: 404,
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-seo-render': 'not-found' },
        });
    } catch {
        return serveShell(context);
    }
}
