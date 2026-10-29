/*
 * Edge ön-render için saf HTML yardımcıları (Cloudflare Pages Functions'ta koşar: DOM yok, React yok).
 *
 * Amaç: SPA kabuğu (index.html) sunucudan boş `<div id="root">` ile gidiyordu. Googlebot içeriği ancak
 * JS render kuyruğunda görüyor, sosyal ağ botları (WhatsApp, Facebook, X) ise JS hiç çalıştırmıyor.
 * Bu modül kabuğa sayfaya özel <head> etiketlerini ve içeriğin HTML hâlini basar; React yüklenince
 * createRoot().render() kök içeriğini temizleyip devralır.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** HTML'i düz metne indirger; blok sonlarını satır sonuna çevirir, temel varlıkları açar. */
export function stripTags(html) {
    return String(html ?? '')
        .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6]|\/blockquote|\/tr)\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t\r]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

/** Kelime sınırında kısaltır; meta description için 160 varsayılan. */
export function truncate(text, max = 160) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    return (space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd() + '…';
}

/** Düz metni (satır sonu = paragraf) kaçışlanmış <p> bloklarına çevirir. */
export function paragraphs(text) {
    return String(text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join('');
}

/** JSON-LD script etiketi; `<` kaçışlanır ki içerik </script> ile sayfadan çıkamasın. */
export function jsonLdScript(data) {
    return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

export function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    try {
        return d.toLocaleDateString('tr-TR', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

export const SSR_STYLE = [
    '#seo-ssr{max-width:48rem;margin:0 auto;padding:1.25rem 1rem 3rem;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f2937;line-height:1.65}',
    '#seo-ssr h1{font-size:1.5rem;line-height:1.3;margin:.75rem 0}',
    '#seo-ssr h2{font-size:1.15rem;margin:1.75rem 0 .75rem}',
    '#seo-ssr nav{font-size:.85rem;color:#6b7280}',
    '#seo-ssr a{color:#be185d;text-decoration:none}',
    '#seo-ssr .meta,#seo-ssr footer{font-size:.85rem;color:#6b7280}',
    '#seo-ssr ol,#seo-ssr ul{list-style:none;padding:0;margin:0}',
    '#seo-ssr li{border:1px solid #e5e7eb;border-radius:.75rem;padding:.9rem 1rem;margin:.75rem 0}',
    '#seo-ssr img{max-width:100%;height:auto;border-radius:.75rem}',
].join('');

/**
 * Sayfa modelinden <head> parçasını üretir.
 * page: { title, description, canonical, robots?, ogType?, image?, jsonLd?: object[], extraHead?: string }
 */
export function buildHead(page) {
    const title = escapeHtml(page.title);
    const description = escapeHtml(page.description);
    const canonical = escapeHtml(page.canonical);
    const parts = [
        `<title>${title}</title>`,
        `<meta name="description" content="${description}">`,
        `<link rel="canonical" href="${canonical}">`,
    ];
    if (page.robots) parts.push(`<meta name="robots" content="${escapeHtml(page.robots)}">`);
    parts.push(
        `<meta property="og:type" content="${escapeHtml(page.ogType || 'website')}">`,
        `<meta property="og:site_name" content="Herkesler Soruyor">`,
        `<meta property="og:locale" content="tr_TR">`,
        `<meta property="og:title" content="${title}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${canonical}">`,
    );
    if (page.image) parts.push(`<meta property="og:image" content="${escapeHtml(page.image)}">`);
    parts.push(
        `<meta name="twitter:card" content="${page.image ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${title}">`,
        `<meta name="twitter:description" content="${description}">`,
    );
    if (page.image) parts.push(`<meta name="twitter:image" content="${escapeHtml(page.image)}">`);
    for (const ld of page.jsonLd || []) parts.push(jsonLdScript(ld));
    if (page.extraHead) parts.push(page.extraHead);
    parts.push(`<style>${SSR_STYLE}</style>`);
    return parts.join('\n');
}

/**
 * SPA kabuğuna head etiketlerini ve kök içeriğini basar.
 * Kabuktaki varsayılan <title> ve description kaldırılır (yinelenen etiket Google'ı şaşırtır).
 */
export function injectIntoShell(shell, page) {
    let html = String(shell)
        .replace(/<title>[^<]*<\/title>\s*/i, '')
        .replace(/<meta\s+name="description"[^>]*>\s*/i, '');

    const head = buildHead(page);
    html = html.includes('</head>')
        ? html.replace('</head>', `${head}\n</head>`)
        : `${head}\n${html}`;

    if (page.bodyHtml) {
        html = html.replace(/<div id="root"><\/div>/, `<div id="root">${page.bodyHtml}</div>`);
    }
    return html;
}
