import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Barındırıcı yönlendirme kuralları (netlify.toml) için Netlify ilk-eşleşen-kazanır
 * simülasyonu. Amaç: eksik /assets/* dosyası SPA fallback'inden (200 text/html) değil
 * gerçek 404'ten dönsün; SPA yolları, /embed, /embed.html, robots/sitemap/ads bozulmasın.
 *
 * Netlify anlamı:
 *  - kurallar yukarıdan aşağı; ilk eşleşen kazanır
 *  - force=false iken (varsayılan) istenen yolda DOSYA varsa kural hiç çalışmaz
 *  - temiz URL: /embed -> embed.html (barındırıcı kendisi sunar, kural yok)
 *  - sorgu dizisi eşleşmeye girmez
 */
const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const read = (p) => readFileSync(root(p), 'utf8');

/** netlify.toml içindeki [[redirects]] bloklarını sırayla çıkarır (bağımlılıksız mini ayrıştırıcı). */
function parseNetlifyRedirects(toml) {
    const rules = [];
    let current = null;
    for (const raw of toml.split(/\r?\n/)) {
        const line = raw.replace(/\s+#.*$/, '').trim();
        if (!line || line.startsWith('#')) continue;
        if (line === '[[redirects]]') {
            current = { force: false };
            rules.push(current);
            continue;
        }
        if (line.startsWith('[')) {
            current = null;
            continue;
        }
        const m = current && line.match(/^(\w+)\s*=\s*(.+)$/);
        if (!m) continue;
        const v = m[2].trim();
        if (v === 'true' || v === 'false') current[m[1]] = v === 'true';
        else if (/^\d+$/.test(v)) current[m[1]] = Number(v);
        else current[m[1]] = v.replace(/^"|"$/g, '');
    }
    return rules;
}

const patternMatches = (from, path) => {
    if (from === '/*') return true;
    if (from.endsWith('/*')) {
        const prefix = from.slice(0, -1); // "/assets/"
        return path.startsWith(prefix) || path === prefix.slice(0, -1);
    }
    return path === from;
};

/**
 * @param {string} url          istek (sorgu dizisi olabilir)
 * @param {Set<string>} files   yayın klasöründeki dosyalar ("/assets/a.js" biçiminde)
 */
function resolveNetlify(url, files, rules) {
    const path = url.split('?')[0].split('#')[0];
    const fileFor = (p) => {
        if (files.has(p)) return p;
        if (p === '/' && files.has('/index.html')) return '/index.html';
        if (!/\.[a-z0-9]+$/i.test(p) && files.has(`${p}.html`)) return `${p}.html`; // temiz URL
        return null;
    };
    const existing = fileFor(path);
    for (const rule of rules) {
        if (!patternMatches(rule.from, path)) continue;
        if (existing && !rule.force) continue; // dosya varsa kural çalışmaz
        return { kind: 'rule', status: rule.status, to: rule.to, from: rule.from };
    }
    if (existing) return { kind: 'file', status: 200, to: existing };
    return { kind: 'miss', status: 404 };
}

const rules = parseNetlifyRedirects(read('netlify.toml'));

// Gerçek public/ içeriği + derleme çıktısını taklit eden dosyalar.
const publicFiles = readdirSync(root('public'), { withFileTypes: true })
    .filter((d) => d.isFile() && d.name !== '_redirects')
    .map((d) => `/${d.name}`);
const files = new Set([
    ...publicFiles,
    '/index.html',
    '/embed.html',
    '/assets/index-abc.js',
    '/assets/index-abc.css',
    '/assets/RunnerPlayPage-Zx81.js',
    '/images/exists.png',
]);

describe('netlify.toml yönlendirme sırası', () => {
    it('kurallar ayrıştırılır ve genel fallback sonuncudur', () => {
        expect(rules.length).toBeGreaterThanOrEqual(5);
        const last = rules[rules.length - 1];
        expect(last).toMatchObject({ from: '/*', to: '/index.html', status: 200 });
        expect(rules.filter((r) => r.from === '/*')).toHaveLength(1);
    });

    it("404 kuralları genel fallback'ten ÖNCE gelir ve force kullanmaz", () => {
        const fallback = rules.findIndex((r) => r.from === '/*');
        const notFound = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 404);
        expect(notFound.length).toBeGreaterThan(0);
        for (const { r, i } of notFound) {
            expect(i).toBeLessThan(fallback);
            expect(r.force).toBe(false);
        }
        expect(notFound.map(({ r }) => r.from)).toContain('/assets/*');
    });

    it("/embed için /embed.html'e yeniden yazma kuralı YOK (Cloudflare 308 döngüsü)", () => {
        expect(rules.filter((r) => /^\/embed/.test(r.from))).toEqual([]);
        expect(rules.filter((r) => /embed\.html/.test(r.to))).toEqual([]);
        const active = read('public/_redirects')
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith('#'));
        expect(active.filter((l) => /^\/embed/.test(l.trim()))).toEqual([]);
        expect(active.filter((l) => /embed\.html/.test(l))).toEqual([]);
    });

    it('public/_redirects (Cloudflare) yalnızca desteklenen durum kodlarını kullanır', () => {
        const active = read('public/_redirects')
            .split(/\r?\n/)
            .filter((l) => l.trim() && !l.trim().startsWith('#'));
        for (const line of active) {
            const status = Number(line.trim().split(/\s+/)[2]);
            expect([200, 301, 302, 303, 307, 308], line).toContain(status);
        }
    });
});

describe('Netlify ilk-eşleşen simülasyonu', () => {
    const table = [
        // [istek, beklenen tür, beklenen durum, beklenen hedef/dosya]
        ['/', 'file', 200, '/index.html'],
        ['/embed', 'file', 200, '/embed.html'],
        ['/embed.html', 'file', 200, '/embed.html'],
        ['/embed?game=kosu', 'file', 200, '/embed.html'],
        ['/embed?game=kesif&v=2', 'file', 200, '/embed.html'],
        ['/oyun/kesif', 'rule', 200, '/index.html'],
        ['/oyun/kosu/oyna', 'rule', 200, '/index.html'],
        ['/profile/devadmin', 'rule', 200, '/index.html'],
        ['/cpl-manage/users', 'rule', 200, '/index.html'],
        ['/mod/queue', 'rule', 200, '/index.html'],
        // var olan dosyalar kurallara girmeden servis edilir
        ['/assets/index-abc.js', 'file', 200, '/assets/index-abc.js'],
        ['/assets/index-abc.css', 'file', 200, '/assets/index-abc.css'],
        ['/assets/RunnerPlayPage-Zx81.js', 'file', 200, '/assets/RunnerPlayPage-Zx81.js'],
        ['/images/exists.png', 'file', 200, '/images/exists.png'],
        ['/robots.txt', 'file', 200, '/robots.txt'],
        ['/ads.txt', 'file', 200, '/ads.txt'],
        ['/favicon-32x32.png', 'file', 200, '/favicon-32x32.png'],
        // eksik statik dosyalar gerçek 404
        ['/assets/index-OLD123.js', 'rule', 404, '/404.html'],
        ['/assets/RunnerPlayPage-eski.js', 'rule', 404, '/404.html'],
        ['/assets/index-OLD123.css', 'rule', 404, '/404.html'],
        ['/assets/index-OLD123.js.map', 'rule', 404, '/404.html'],
        ['/assets/logo-old.png', 'rule', 404, '/404.html'],
        ['/assets/pic-old.webp', 'rule', 404, '/404.html'],
        ['/assets/data-old.json', 'rule', 404, '/404.html'],
        ['/assets/index-OLD123.js?v=1', 'rule', 404, '/404.html'],
        ['/images/missing.webp', 'rule', 404, '/404.html'],
    ];

    for (const [url, kind, status, target] of table) {
        it(`${url} -> ${status} ${target}`, () => {
            const res = resolveNetlify(url, files, rules);
            expect(res.kind).toBe(kind);
            expect(res.status).toBe(status);
            expect(res.to).toBe(target);
        });
    }

    it('sitemap.xml: dosya varken Netlify kuralı gölgelenir (mevcut davranış korunur)', () => {
        const res = resolveNetlify('/sitemap.xml', files, rules);
        expect(res.kind).toBe('file');
    });

    it('sitemap.xml dosyası yoksa fonksiyon kuralı çalışır', () => {
        const noSitemap = new Set([...files].filter((f) => f !== '/sitemap.xml'));
        expect(resolveNetlify('/sitemap.xml', noSitemap, rules)).toMatchObject({
            kind: 'rule',
            status: 200,
            to: '/.netlify/functions/sitemap',
        });
    });

    it('hiçbir SPA yolu 404 kuralına düşmez', () => {
        for (const p of ['/', '/oyun', '/oyun/kesif', '/sorular/ilk-soru', '/profile/devadmin', '/assetsx', '/imagesx']) {
            expect(resolveNetlify(p, files, rules).status, p).toBe(200);
        }
    });
});
