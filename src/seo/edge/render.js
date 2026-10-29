/*
 * Cloudflare Pages Functions için edge ön-render işleyicisi.
 *
 * Akış: önbellek → SPA kabuğu (env.ASSETS, kök yol) → API → kabuğa head + içerik bas → önbelleğe yaz.
 * Her hatada "fail-open": kabuk olduğu gibi döner, site asla bu katman yüzünden kapanmaz.
 *
 * Herkese aynı HTML gider (bot ayrımı yok): farklı içerik göstermek "cloaking" sayılır.
 * React yüklenince createRoot().render() kökü temizler; sunucudan gelen içerik yalnızca
 * ilk boyama ve botlar için vardır.
 */
import { injectIntoShell } from './html.js';
import { categoryPage, notFoundPage, opinionPage, questionPage, storyPage } from './pages.js';

export const DEFAULT_API = 'https://herkeslersoruyor.panalix.com.tr/api';
export const DEFAULT_ORIGIN = 'https://herkeslersoruyor.com.tr';
const API_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 300;

export const KINDS = {
    question: {
        label: 'Soru',
        api: (p) => `/questions/${encodeURIComponent(p)}`,
        build: (json, ctx) => questionPage(json.data.question, ctx),
    },
    category: {
        label: 'Kategori',
        api: (p) => `/categories/${encodeURIComponent(p)}`,
        build: (json, ctx) => categoryPage(json.data, ctx),
    },
    opinion: {
        label: 'Görüş',
        api: (p) => `/opinions/${encodeURIComponent(p)}`,
        build: (json, ctx) => opinionPage(json.data.opinion, ctx),
    },
    story: {
        label: 'Hikaye',
        api: (p) => `/stories/${encodeURIComponent(p)}`,
        build: (json, ctx) => storyPage(json.data.story, ctx),
    },
};

export function resolveConfig(env = {}) {
    const api = String(env.SEO_API_URL || DEFAULT_API).replace(/\/$/, '');
    const origin = String(env.CANONICAL_ORIGIN || env.VITE_CANONICAL_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '');
    return { api, origin };
}

export async function fetchWithTimeout(url, init = {}, ms = API_TIMEOUT_MS) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
    try {
        return await fetch(url, { ...init, signal: controller ? controller.signal : undefined });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** SPA kabuğu: kök yol her zaman index.html'dir (temiz URL yönlendirmesine takılmaz). */
async function fetchShell(context) {
    const rootUrl = new URL('/', context.request.url);
    const res = await context.env.ASSETS.fetch(new Request(rootUrl.toString(), { headers: { accept: 'text/html' } }));
    return res;
}

async function serveShell(context) {
    const res = await fetchShell(context);
    return new Response(res.body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-seo-render': 'bypass' },
    });
}

export async function renderSeoPage(context, kind, param) {
    const def = KINDS[kind];
    if (!def || !param) return serveShell(context);

    try {
        const url = new URL(context.request.url);
        const cache = typeof caches !== 'undefined' && caches?.default ? caches.default : null;
        const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
        if (cache) {
            const hit = await cache.match(cacheKey);
            if (hit) return hit;
        }

        const { api, origin } = resolveConfig(context.env);
        const ctx = { origin, path: url.pathname };

        const [shellRes, apiRes] = await Promise.all([
            fetchShell(context),
            fetchWithTimeout(api + def.api(param), { headers: { accept: 'application/json' } }),
        ]);
        if (!shellRes.ok) return serveShell(context);
        const shell = await shellRes.text();

        let page;
        if (apiRes.status === 404) {
            page = notFoundPage(ctx, def.label);
        } else if (!apiRes.ok) {
            return serveShell(context);
        } else {
            const json = await apiRes.json();
            page = def.build(json, ctx);
        }

        const html = injectIntoShell(shell, page);
        const response = new Response(html, {
            status: page.status || 200,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': page.status === 200 ? `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}` : 'no-store',
                'x-seo-render': kind,
            },
        });
        if (cache && response.status === 200 && typeof context.waitUntil === 'function') {
            context.waitUntil(cache.put(cacheKey, response.clone()));
        }
        return response;
    } catch {
        return serveShell(context);
    }
}
