/*
 * /sitemap.xml edge işleyicisi: API'nin canlı sitemap'ini çekip canonical alan adına çevirir.
 *
 * Neden: public/sitemap.xml build anında üretilen statik bir kopyaydı ve aylarca eski kalabiliyordu
 * (tüm lastmod değerleri aynı güne denk gelmişti). API ulaşılamazsa statik kopya yedek olarak sunulur.
 */
import { fetchWithTimeout, resolveConfig } from './render.js';

const CACHE_TTL_SECONDS = 3600;

export function normalizeSitemapXml(xml, origin) {
    const base = String(origin).replace(/\/$/, '');
    return String(xml)
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<script\b[^>]*\/>/gi, '')
        .replace(/https:\/\/herkeslersoruyor\.panalix\.com\.tr(?=\/|"|>|<|$)/g, base)
        .replace(/https:\/\/herkeslersoruyor\.com(?=\/|"|>|<|$)/g, base);
}

export async function serveSitemap(context) {
    const { api, origin } = resolveConfig(context.env);
    try {
        const res = await fetchWithTimeout(`${api}/sitemap.xml`, { headers: { accept: 'application/xml' } }, 8000);
        if (res.ok) {
            const xml = await res.text();
            if (xml.includes('<urlset') || xml.includes('<sitemapindex')) {
                return new Response(normalizeSitemapXml(xml, origin), {
                    status: 200,
                    headers: {
                        'content-type': 'application/xml; charset=utf-8',
                        'cache-control': `public, max-age=0, s-maxage=${CACHE_TTL_SECONDS}`,
                        'x-sitemap-source': 'api',
                    },
                });
            }
        }
    } catch {
        // yedeğe düş
    }
    const fallback = await context.env.ASSETS.fetch(context.request);
    return new Response(fallback.body, {
        status: fallback.status,
        headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600', 'x-sitemap-source': 'static' },
    });
}
