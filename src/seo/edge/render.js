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
import { categoryPage, homePage, notFoundPage, opinionPage, questionPage, storyPage } from './pages.js';

export const DEFAULT_API = 'https://herkeslersoruyor.panalix.com.tr/api';
export const DEFAULT_ORIGIN = 'https://herkeslersoruyor.com.tr';
const API_TIMEOUT_MS = 4000;
const CACHE_TTL_SECONDS = 300;

const enc = (p) => encodeURIComponent(p);

/**
 * Sayfa türleri. `apis(param)` çağrılacak API yollarını, `build(jsonlar, ctx)` sayfa modelini verir.
 * `needsParam: false` olan türler (ana sayfa) parametre istemez.
 */
export const KINDS = {
    home: {
        label: 'Ana sayfa',
        needsParam: false,
        cacheSeconds: 120,
        apis: () => ['/questions?limit=12&sort=newest', '/categories'],
        build: ([questions, categories], ctx) =>
            homePage(
                {
                    questions: questions?.data?.questions,
                    pagination: questions?.data?.pagination,
                    categories: categories?.data?.categories,
                },
                ctx,
            ),
    },
    question: {
        label: 'Soru',
        apis: (p) => [`/questions/${enc(p)}`],
        build: ([json], ctx) => questionPage(json.data.question, ctx),
    },
    category: {
        label: 'Kategori',
        apis: (p) => [`/categories/${enc(p)}`],
        build: ([json], ctx) => categoryPage(json.data, ctx),
    },
    opinion: {
        label: 'Görüş',
        apis: (p) => [`/opinions/${enc(p)}`],
        build: ([json], ctx) => opinionPage(json.data.opinion, ctx),
    },
    story: {
        label: 'Hikaye',
        apis: (p) => [`/stories/${enc(p)}`],
        build: ([json], ctx) => storyPage(json.data.story, ctx),
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
export async function fetchShell(context) {
    const rootUrl = new URL('/', context.request.url);
    return context.env.ASSETS.fetch(new Request(rootUrl.toString(), { headers: { accept: 'text/html' } }));
}

/** Kabuğu olduğu gibi 200 ile döndürür (fail-open ve bilinen SPA rotaları). */
export async function serveShell(context) {
    const res = await fetchShell(context);
    return new Response(res.body, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-seo-render': 'bypass' },
    });
}

export async function renderSeoPage(context, kind, param) {
    const def = KINDS[kind];
    if (!def || (def.needsParam !== false && !param)) return serveShell(context);

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

        const [shellRes, ...apiResponses] = await Promise.all([
            fetchShell(context),
            ...def.apis(param).map((p) => fetchWithTimeout(api + p, { headers: { accept: 'application/json' } })),
        ]);
        if (!shellRes.ok) return serveShell(context);
        const shell = await shellRes.text();

        let page;
        if (apiResponses.some((r) => r.status === 404)) {
            page = notFoundPage(ctx, def.label);
        } else if (apiResponses.some((r) => !r.ok)) {
            return serveShell(context);
        } else {
            const jsons = await Promise.all(apiResponses.map((r) => r.json()));
            page = def.build(jsons, ctx);
        }

        const html = injectIntoShell(shell, page);
        const ttl = def.cacheSeconds || CACHE_TTL_SECONDS;
        const response = new Response(html, {
            status: page.status || 200,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': page.status === 200 ? `public, max-age=0, s-maxage=${ttl}` : 'no-store',
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
