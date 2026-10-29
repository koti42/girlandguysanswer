import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SECURITY_HEADERS } from './securityHeaders.js';

describe('güvenlik başlıkları', () => {
    it('public/_headers dosyası SECURITY_HEADERS ile birebir aynı', () => {
        const text = readFileSync(fileURLToPath(new URL('../../../public/_headers', import.meta.url)), 'utf8');
        const lines = text.split(/\r?\n/).filter((l) => l.startsWith('  '));
        const parsed = Object.fromEntries(
            lines.map((l) => {
                const i = l.indexOf(':');
                return [l.slice(2, i).trim(), l.slice(i + 1).trim()];
            }),
        );
        expect(parsed).toEqual(SECURITY_HEADERS);
        expect(text).toMatch(/^\/\*$/m);
    });

    it('tam CSP yok (yalnızca frame-ancestors) ve HSTS alt alanları kapsamaz', () => {
        expect(SECURITY_HEADERS['Content-Security-Policy']).toBe("frame-ancestors 'self'");
        expect(SECURITY_HEADERS['Strict-Transport-Security']).not.toContain('includeSubDomains');
    });

    it('_routes.json statik dosyaları dışarıda tutar, /embed fonksiyona gitmez', () => {
        const routes = JSON.parse(readFileSync(fileURLToPath(new URL('../../../public/_routes.json', import.meta.url)), 'utf8'));
        expect(routes.include).toEqual(['/*']);
        for (const p of ['/assets/*', '/embed', '/embed.html', '/robots.txt', '/og-default.jpg', '/logo.png']) expect(routes.exclude).toContain(p);
        expect(routes.exclude).not.toContain('/sitemap.xml');
        expect(routes.exclude.length).toBeLessThanOrEqual(100);
    });
});
