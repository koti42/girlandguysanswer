import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeSitemapXml, serveSitemap } from './sitemap.js';

const API_XML = '<?xml version="1.0"?><urlset><url><loc>https://herkeslersoruyor.panalix.com.tr/question/a</loc></url><url><loc>https://herkeslersoruyor.com/opinions</loc></url><script>x</script></urlset>';

function ctx(assetsBody = '<urlset><url><loc>https://herkeslersoruyor.com.tr/static</loc></url></urlset>') {
    return {
        request: new Request('https://herkeslersoruyor.com.tr/sitemap.xml'),
        env: { ASSETS: { fetch: vi.fn(async () => new Response(assetsBody, { status: 200 })) } },
    };
}

describe('normalizeSitemapXml', () => {
    it('API ve eski alan adlarını canonical ile değiştirir, script etiketlerini siler', () => {
        const out = normalizeSitemapXml(API_XML, 'https://herkeslersoruyor.com.tr/');
        expect(out).toContain('<loc>https://herkeslersoruyor.com.tr/question/a</loc>');
        expect(out).toContain('<loc>https://herkeslersoruyor.com.tr/opinions</loc>');
        expect(out).not.toContain('panalix');
        expect(out).not.toContain('<script');
    });
});

describe('serveSitemap', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('API sitemap canlı döner, 1 saat edge önbelleği', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(API_XML, { status: 200 })));
        const res = await serveSitemap(ctx());
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/xml');
        expect(res.headers.get('cache-control')).toContain('s-maxage=3600');
        expect(res.headers.get('x-sitemap-source')).toBe('api');
        expect(await res.text()).toContain('https://herkeslersoruyor.com.tr/question/a');
    });

    it('API hata verirse statik yedek sunulur', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 502 })));
        const res = await serveSitemap(ctx());
        expect(res.headers.get('x-sitemap-source')).toBe('static');
        expect(await res.text()).toContain('/static');
    });

    it('API XML değilse (ör. HTML hata sayfası) statik yedek', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>oops</html>', { status: 200 })));
        const res = await serveSitemap(ctx());
        expect(res.headers.get('x-sitemap-source')).toBe('static');
    });

    it('ağ hatasında statik yedek', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('net'); }));
        const res = await serveSitemap(ctx());
        expect(res.headers.get('x-sitemap-source')).toBe('static');
    });
});
