import { describe, expect, it } from 'vitest';
import { buildHead, escapeHtml, injectIntoShell, jsonLdScript, paragraphs, stripTags, truncate } from './html.js';

const SHELL = `<!doctype html><html lang="tr"><head><meta charset="UTF-8" />
<meta name="description" content="Varsayılan açıklama">
<title>Herkesler Soruyor</title>
</head><body><div id="root"></div><script type="module" src="/assets/index-abc.js"></script></body></html>`;

describe('escapeHtml', () => {
    it('beş özel karakteri kaçışlar', () => {
        expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    });
    it('null/undefined boş dize olur', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('stripTags', () => {
    it('etiketleri siler, blok sonlarını satıra çevirir, varlıkları açar', () => {
        const out = stripTags('<p>Birinci &amp; paragraf</p><p>İkinci<br>satır&nbsp;x</p><script>alert(1)</script>');
        expect(out).toBe('Birinci & paragraf\nİkinci\nsatır x\nalert(1)');
    });
    it('fazla boşlukları ve boş satırları sıkıştırır', () => {
        expect(stripTags('a   b\n\n\n  c  ')).toBe('a b\nc');
    });
});

describe('truncate', () => {
    it('kısa metne dokunmaz', () => {
        expect(truncate('kısa', 10)).toBe('kısa');
    });
    it('kelime sınırında keser ve üç nokta ekler', () => {
        const out = truncate('Bu oldukça uzun bir açıklama metni ve kesilmesi gerekiyor', 30);
        expect(out.length).toBeLessThanOrEqual(30);
        expect(out.endsWith('…')).toBe(true);
        expect(out).toBe('Bu oldukça uzun bir açıklama…');
    });
});

describe('paragraphs', () => {
    it('satırları kaçışlanmış <p> yapar, boşları atar', () => {
        expect(paragraphs('a <b>\n\n c')).toBe('<p>a &lt;b&gt;</p><p>c</p>');
    });
});

describe('jsonLdScript', () => {
    it('< karakterini kaçışlar ki </script> enjekte edilemesin', () => {
        const out = jsonLdScript({ name: '</script><script>alert(1)</script>' });
        expect(out).not.toContain('</script><script>');
        expect(out.startsWith('<script type="application/ld+json">')).toBe(true);
    });
});

describe('buildHead', () => {
    it('başlık, açıklama, canonical, OG ve twitter etiketlerini basar', () => {
        const head = buildHead({ title: 'A & B', description: 'D "x"', canonical: 'https://s.test/q/a', image: 'https://s.test/i.png', ogType: 'article' });
        expect(head).toContain('<title>A &amp; B</title>');
        expect(head).toContain('<meta name="description" content="D &quot;x&quot;">');
        expect(head).toContain('<link rel="canonical" href="https://s.test/q/a">');
        expect(head).toContain('<meta property="og:type" content="article">');
        expect(head).toContain('<meta property="og:image" content="https://s.test/i.png">');
        expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
        expect(head).not.toContain('name="robots"');
    });
    it('robots ve extraHead verilince eklenir, görsel yoksa summary kartı', () => {
        const head = buildHead({ title: 't', description: 'd', canonical: 'c', robots: 'noindex, follow', extraHead: '<meta name="rating" content="adult">' });
        expect(head).toContain('<meta name="robots" content="noindex, follow">');
        expect(head).toContain('<meta name="rating" content="adult">');
        expect(head).toContain('<meta name="twitter:card" content="summary">');
    });
});

describe('injectIntoShell', () => {
    const page = { title: 'Soru başlığı - Herkesler Soruyor', description: 'Açıklama', canonical: 'https://s.test/question/x', bodyHtml: '<main id="seo-ssr"><h1>Soru</h1></main>' };

    it('kabuktaki varsayılan title/description silinir, yenileri </head> öncesine gelir', () => {
        const html = injectIntoShell(SHELL, page);
        expect(html.match(/<title>/g)).toHaveLength(1);
        expect(html.match(/name="description"/g)).toHaveLength(1);
        expect(html).toContain('<title>Soru başlığı - Herkesler Soruyor</title>');
        expect(html).not.toContain('Varsayılan açıklama');
        expect(html.indexOf('<title>')).toBeLessThan(html.indexOf('</head>'));
    });

    it('kök div içine içerik basar, uygulama script etiketi korunur', () => {
        const html = injectIntoShell(SHELL, page);
        expect(html).toContain('<div id="root"><main id="seo-ssr"><h1>Soru</h1></main></div>');
        expect(html).toContain('/assets/index-abc.js');
    });

    it('kök div bulunamazsa gövdeye dokunmaz, head yine eklenir', () => {
        const html = injectIntoShell('<html><head></head><body><div id="app"></div></body></html>', page);
        expect(html).toContain('<div id="app"></div>');
        expect(html).toContain('<title>Soru başlığı - Herkesler Soruyor</title>');
    });
});
