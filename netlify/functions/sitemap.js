const SITEMAP_API = 'https://herkeslersoruyor.panalix.com.tr/api/sitemap.xml';
const CANONICAL_ORIGIN = process.env.CANONICAL_ORIGIN || process.env.VITE_CANONICAL_ORIGIN || 'https://herkeslersoruyor.com.tr';

function ensureCanonicalDomain(xmlContent) {
    const origin = CANONICAL_ORIGIN.replace(/\/$/, '');
    return xmlContent
        .replace(/https:\/\/herkeslersoruyor\.panalix\.com\.tr(?=\/|"|>|$)/g, origin)
        .replace(/https:\/\/herkeslersoruyor\.com(?=\/|"|>|$)/g, origin);
}

function stripScriptTags(xmlContent) {
    return xmlContent
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<script\b[^>]*\/>/gi, '');
}

exports.handler = async function () {
    try {
        const res = await fetch(SITEMAP_API);
        if (!res.ok) {
            return { statusCode: 502, body: 'Sitemap unavailable' };
        }
        let xml = await res.text();
        xml = stripScriptTags(xml);
        xml = ensureCanonicalDomain(xml);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/xml; charset=utf-8',
                'Cache-Control': 'public, max-age=3600',
            },
            body: xml,
        };
    } catch (err) {
        console.error('Sitemap function error:', err);
        return { statusCode: 502, body: 'Sitemap unavailable' };
    }
};
