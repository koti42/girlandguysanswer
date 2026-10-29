import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KINDS, renderSeoPage, resolveConfig } from './render.js';

const SHELL = '<!doctype html><html><head><meta name="description" content="eski"><title>Herkesler Soruyor</title></head><body><div id="root"></div></body></html>';

const questionJson = {
    success: true,
    data: {
        question: {
            id: 'q1',
            title: 'Edge soru',
            slug: 'edge-soru',
            description: 'Açıklama',
            answers_count: 1,
            answers: [{ id: 'a1', content: 'Cevap', created_at: '2026-05-05T09:59:18Z', user: { name: 'Ayşe' } }],
            created_at: '2026-05-01T10:00:00Z',
            category: { name: 'Kat', slug: 'kat' },
        },
    },
};

function makeContext(url, { env = {}, assets } = {}) {
    const assetsFetch = vi.fn(assets || (async () => new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html' } })));
    const waits = [];
    return {
        request: new Request(url),
        env: { ...env, ASSETS: { fetch: assetsFetch } },
        params: {},
        waitUntil: (p) => waits.push(p),
        _assetsFetch: assetsFetch,
        _waits: waits,
    };
}

describe('resolveConfig', () => {
    it('varsayılanlar ve ortam değişkeni geçersiz kılması', () => {
        expect(resolveConfig({})).toEqual({ api: 'https://herkeslersoruyor.panalix.com.tr/api', origin: 'https://herkeslersoruyor.com.tr' });
        expect(resolveConfig({ SEO_API_URL: 'http://127.0.0.1:8003/api/', CANONICAL_ORIGIN: 'https://staging.test/' })).toEqual({
            api: 'http://127.0.0.1:8003/api',
            origin: 'https://staging.test',
        });
    });
});

describe('KINDS', () => {
    it('API yollarını slug ile kurar ve kaçışlar', () => {
        expect(KINDS.question.api('a b')).toBe('/questions/a%20b');
        expect(KINDS.category.api('gundem')).toBe('/categories/gundem');
        expect(KINDS.opinion.api('x')).toBe('/opinions/x');
        expect(KINDS.story.api('y')).toBe('/stories/y');
    });
});

describe('renderSeoPage', () => {
    beforeEach(() => {
        vi.stubGlobal('caches', undefined);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('API başarılıysa kabuğa başlık, meta ve içerik basar; s-maxage ile önbelleklenebilir', async () => {
        vi.stubGlobal('fetch', vi.fn(async (url) => {
            expect(url).toBe('https://herkeslersoruyor.panalix.com.tr/api/questions/edge-soru');
            return new Response(JSON.stringify(questionJson), { status: 200, headers: { 'content-type': 'application/json' } });
        }));
        const ctx = makeContext('https://herkeslersoruyor.com.tr/question/edge-soru?utm=x');
        const res = await renderSeoPage(ctx, 'question', 'edge-soru');
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        expect(res.headers.get('cache-control')).toContain('s-maxage=300');
        expect(res.headers.get('x-seo-render')).toBe('question');
        expect(html).toContain('<title>Edge soru - Herkesler Soruyor</title>');
        expect(html).not.toContain('content="eski"');
        expect(html).toContain('<link rel="canonical" href="https://herkeslersoruyor.com.tr/question/edge-soru">');
        expect(html).toContain('<div id="root"><main id="seo-ssr">');
        expect(html).toContain('"@type":"QAPage"');
        // kabuk kök yoldan alınır (temiz URL yönlendirmesine takılmaz)
        expect(ctx._assetsFetch.mock.calls[0][0].url).toBe('https://herkeslersoruyor.com.tr/');
    });

    it('API 404 → 404 durum + noindex, kabuk yine döner (SPA kendi "bulunamadı" ekranını çizer)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
        const res = await renderSeoPage(makeContext('https://herkeslersoruyor.com.tr/question/yok'), 'question', 'yok');
        const html = await res.text();
        expect(res.status).toBe(404);
        expect(res.headers.get('cache-control')).toBe('no-store');
        expect(html).toContain('<meta name="robots" content="noindex, follow">');
        expect(html).toContain('<div id="root">');
    });

    it('API 5xx → kabuk olduğu gibi (fail-open), 200', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 502 })));
        const res = await renderSeoPage(makeContext('https://herkeslersoruyor.com.tr/question/x'), 'question', 'x');
        expect(res.status).toBe(200);
        expect(res.headers.get('x-seo-render')).toBe('bypass');
        expect(await res.text()).toBe(SHELL);
    });

    it('API ağ hatası / zaman aşımı → kabuk (fail-open)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
        const res = await renderSeoPage(makeContext('https://herkeslersoruyor.com.tr/opinion/x'), 'opinion', 'x');
        expect(res.status).toBe(200);
        expect(await res.text()).toBe(SHELL);
    });

    it('API JSON bozuksa kabuk (fail-open)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
        const res = await renderSeoPage(makeContext('https://herkeslersoruyor.com.tr/story/x'), 'story', 'x');
        expect(await res.text()).toBe(SHELL);
    });

    it('bilinmeyen tür ya da boş parametre kabuk döner, API çağrılmaz', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const res = await renderSeoPage(makeContext('https://herkeslersoruyor.com.tr/x'), 'nope', 'x');
        expect(await res.text()).toBe(SHELL);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('önbellek isabeti varsa API ve kabuk çağrılmaz; isabet yoksa 200 yanıt önbelleğe yazılır', async () => {
        const store = new Map();
        const cache = {
            match: vi.fn(async (req) => store.get(req.url)),
            put: vi.fn(async (req, res) => { store.set(req.url, res); }),
        };
        vi.stubGlobal('caches', { default: cache });
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(questionJson), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);

        const ctx1 = makeContext('https://herkeslersoruyor.com.tr/question/edge-soru?a=1');
        await renderSeoPage(ctx1, 'question', 'edge-soru');
        await Promise.all(ctx1._waits);
        expect(cache.put).toHaveBeenCalledTimes(1);
        // sorgu dizisi anahtara girmez
        expect(cache.put.mock.calls[0][0].url).toBe('https://herkeslersoruyor.com.tr/question/edge-soru');

        const ctx2 = makeContext('https://herkeslersoruyor.com.tr/question/edge-soru');
        const res = await renderSeoPage(ctx2, 'question', 'edge-soru');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(ctx2._assetsFetch).not.toHaveBeenCalled();
        expect(await res.text()).toContain('<title>Edge soru - Herkesler Soruyor</title>');
    });

    it('ortam değişkeniyle API ve canonical değişir', async () => {
        const fetchMock = vi.fn(async () => new Response(JSON.stringify(questionJson), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const ctx = makeContext('https://preview.pages.dev/question/edge-soru', { env: { SEO_API_URL: 'https://api.test/api', CANONICAL_ORIGIN: 'https://canon.test' } });
        const html = await (await renderSeoPage(ctx, 'question', 'edge-soru')).text();
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/api/questions/edge-soru');
        expect(html).toContain('href="https://canon.test/question/edge-soru"');
    });
});
