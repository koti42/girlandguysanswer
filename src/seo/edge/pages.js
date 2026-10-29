/*
 * API yanıtlarını edge ön-render sayfa modeline çevirir.
 *
 * Sayfa modeli: { title, description, canonical, robots?, ogType?, image?, imageWidth?, imageHeight?,
 *                 jsonLd: object[], extraHead?, bodyHtml, status }
 *
 * Kurallar:
 *  - Cevapsız soru: `noindex, follow` (ince içerik; sitemap de bu soruları yazmaz). Bağlantılar takip edilir
 *    ki tarayıcı kategori/soru listesine yürüsün.
 *  - Profil sayfaları giriş istiyor ve robots.txt'te kapalı: profil bağlantısı basılmaz, yalnız ad yazılır.
 *  - Kullanıcı içeriği her zaman kaçışlanır; HTML'li alanlar (görüş/hikâye) düz metne indirilip paragraflanır.
 *  - Varsayılan paylaşım görseli 1200x630 (/og-default.jpg); sayfanın kendi görseli varsa o kullanılır.
 */
import { escapeHtml, formatDate, paragraphs, stripTags, truncate } from './html.js';

export const SITE = 'Herkesler Soruyor';
export const SITE_TITLE = 'Herkesler Soruyor | Kadınlar ve Erkekler Soruyor, Cevaplıyor';
export const SITE_DESCRIPTION =
    'Anonim soru sor, kadın ve erkek bakış açısından samimi cevaplar al. İlişkiler, aile, kariyer, sağlık ve daha fazlası: binlerce soru ve cevap seni bekliyor.';
export const DEFAULT_OG_IMAGE = '/og-default.jpg';
const LOGO = '/logo.png';

function authorName(entity) {
    if (!entity || entity.is_anonymous) return 'Anonim';
    const u = entity.user || {};
    return u.name || u.username || 'Üye';
}

function person(entity) {
    return { '@type': 'Person', name: authorName(entity) };
}

function breadcrumb(origin, items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map(([name, path], i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name,
            item: origin + path,
        })),
    };
}

function breadcrumbNav(items) {
    const links = items.map(([name, path]) => `<a href="${escapeHtml(path)}">${escapeHtml(name)}</a>`);
    return `<nav aria-label="Sayfa yolu">${links.join(' › ')}</nav>`;
}

function organization(origin) {
    return {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: SITE,
        url: origin + '/',
        logo: { '@type': 'ImageObject', url: origin + LOGO, width: 1024, height: 1024 },
    };
}

function absolute(origin, url) {
    if (!url) return null;
    return /^https?:\/\//i.test(url) ? url : origin + (url.startsWith('/') ? url : '/' + url);
}

function defaultImage(origin) {
    return { image: origin + DEFAULT_OG_IMAGE, imageWidth: 1200, imageHeight: 630 };
}

function visibleAnswers(question) {
    const list = Array.isArray(question.answers) ? question.answers : [];
    return list.filter((a) => a && !a.removed_at && !a.hidden_at && !a.deleted_at);
}

/** Soru meta açıklaması: cevap varsa "… sorusuna N cevap: ilk cevap", yoksa soru metni. */
export function questionDescription(question, answers, answerCount) {
    const text = stripTags(question.description) || question.title;
    if (answers.length) {
        const first = stripTags(answers[0].content);
        if (first) return truncate(`${question.title} sorusuna ${answerCount} cevap: ${first}`, 160);
    }
    return truncate(text, 160);
}

export function questionPage(question, { origin, path }) {
    const canonical = origin + path;
    const title = `${question.title} - ${SITE}`;
    const text = stripTags(question.description) || question.title;
    const answers = visibleAnswers(question);
    const answerCount = Math.max(Number(question.answers_count ?? question.answer_count ?? 0) || 0, answers.length);
    const description = questionDescription(question, answers, answerCount);
    const category = question.category && question.category.slug ? question.category : null;
    const ownImage = absolute(origin, question.image);

    const crumbs = [['Ana Sayfa', '/'], ['Sorular', '/questions']];
    if (category) crumbs.push([category.name, `/questions/${category.slug}`]);
    crumbs.push([question.title, path]);

    const answerLd = answers.slice(0, 10).map((a) => ({
        '@type': 'Answer',
        text: stripTags(a.content),
        dateCreated: a.created_at,
        upvoteCount: Number(a.likes_count || 0),
        url: `${canonical}#answer-${a.id}`,
        author: person(a),
    }));
    const accepted = answers.find((a) => a.is_accepted);
    const mainEntity = {
        '@type': 'Question',
        name: question.title,
        text,
        answerCount,
        upvoteCount: Number(question.likes_count || 0),
        dateCreated: question.published_at || question.created_at,
        author: person(question),
    };
    if (accepted) {
        mainEntity.acceptedAnswer = answerLd.find((a) => a.url.endsWith(`#answer-${accepted.id}`));
        mainEntity.suggestedAnswer = answerLd.filter((a) => a !== mainEntity.acceptedAnswer);
    } else if (answerLd.length) {
        mainEntity.suggestedAnswer = answerLd;
    }

    const answersHtml = answers.length
        ? `<ol>${answers
            .map(
                (a) => `<li id="answer-${escapeHtml(a.id)}">${paragraphs(stripTags(a.content))}<footer>${escapeHtml(authorName(a))} · ${escapeHtml(formatDate(a.created_at))}${Number(a.likes_count) > 0 ? ` · ${Number(a.likes_count)} beğeni` : ''}</footer></li>`,
            )
            .join('')}</ol>`
        : '<p>Bu soruya henüz cevap yazılmadı. <a href="/login">Giriş yap</a> ve ilk cevabı sen ver.</p>';

    const tags = Array.isArray(question.tags) ? question.tags.filter(Boolean).map((t) => (typeof t === 'string' ? t : t.name)).filter(Boolean) : [];

    const bodyHtml =
        `<main id="seo-ssr">${breadcrumbNav(crumbs.slice(0, -1))}` +
        `<article><h1>${escapeHtml(question.title)}</h1>` +
        `<p class="meta">${escapeHtml(authorName(question))} · ${escapeHtml(formatDate(question.published_at || question.created_at))} · ${answerCount} cevap` +
        (category ? ` · <a href="/questions/${escapeHtml(category.slug)}">${escapeHtml(category.name)}</a>` : '') +
        `</p>` +
        `<div class="body">${paragraphs(text)}</div>` +
        (tags.length ? `<p class="meta">${tags.map((t) => `#${escapeHtml(t)}`).join(' ')}</p>` : '') +
        `<section><h2>Cevaplar (${answerCount})</h2>${answersHtml}</section></article>` +
        `<p class="more"><a href="/questions">Diğer sorular</a> · <a href="/ask">Soru sor</a></p></main>`;

    return {
        title,
        description,
        canonical,
        robots: answerCount === 0 ? 'noindex, follow' : undefined,
        ogType: 'article',
        ...(ownImage ? { image: ownImage } : defaultImage(origin)),
        jsonLd: [{ '@context': 'https://schema.org', '@type': 'QAPage', mainEntity }, breadcrumb(origin, crumbs)],
        bodyHtml,
        status: 200,
    };
}

function articlePage(entity, { origin, path }, { section, listPath, listName, adult = false }) {
    const canonical = origin + path;
    const title = `${entity.title} - ${section} | ${SITE}`;
    const text = stripTags(entity.content);
    const description = truncate(text || entity.title, 160);
    const images = (Array.isArray(entity.images) ? entity.images : []).map((u) => absolute(origin, u)).filter(Boolean);
    const crumbs = [['Ana Sayfa', '/'], [listName, listPath], [entity.title, path]];

    const bodyHtml =
        `<main id="seo-ssr">${breadcrumbNav(crumbs.slice(0, -1))}` +
        `<article><h1>${escapeHtml(entity.title)}</h1>` +
        `<p class="meta">${escapeHtml(authorName(entity))} · ${escapeHtml(formatDate(entity.created_at))}</p>` +
        (images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(entity.title)}" loading="lazy">` : '') +
        `<div class="body">${paragraphs(text)}</div></article>` +
        `<p class="more"><a href="${escapeHtml(listPath)}">${escapeHtml(listName)} listesine dön</a></p></main>`;

    const article = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: entity.title,
        description,
        datePublished: entity.created_at,
        dateModified: entity.updated_at || entity.created_at,
        author: person(entity),
        publisher: organization(origin),
        mainEntityOfPage: canonical,
    };
    if (images.length) article.image = images;

    return {
        title,
        description,
        canonical,
        robots: adult ? 'noindex, follow' : undefined,
        extraHead: adult ? '<meta name="rating" content="adult">' : undefined,
        ogType: 'article',
        ...(images[0] ? { image: images[0] } : defaultImage(origin)),
        jsonLd: [article, breadcrumb(origin, crumbs)],
        bodyHtml,
        status: 200,
    };
}

export function opinionPage(opinion, ctx) {
    return articlePage(opinion, ctx, { section: 'Görüşler', listPath: '/opinions', listName: 'Görüşler' });
}

export function storyPage(story, ctx) {
    return articlePage(story, ctx, { section: 'Hikayeler', listPath: '/stories', listName: 'Hikayeler', adult: Boolean(story.is_adult) });
}

function questionListItems(questions) {
    return questions.map((q) => {
        const excerpt = truncate(stripTags(q.description), 120);
        const count = Number(q.answers_count ?? q.answer_count ?? 0) || 0;
        return (
            `<li><a href="/question/${escapeHtml(q.slug)}"><strong>${escapeHtml(q.title)}</strong></a>` +
            (excerpt ? `<p>${escapeHtml(excerpt)}</p>` : '') +
            `<footer>${count} cevap · ${escapeHtml(formatDate(q.published_at || q.created_at))}</footer></li>`
        );
    });
}

export function categoryPage(data, { origin, path }) {
    const category = data.category || {};
    const questions = Array.isArray(data.questions) ? data.questions : [];
    const total = Number(data.pagination?.totalQuestions ?? questions.length) || questions.length;
    const canonical = origin + path;
    const name = category.name || 'Kategori';
    const title = `${name} Soruları - ${SITE}`;
    const description = truncate(
        stripTags(category.description) || `${name} kategorisinde ${total} soru: farklı bakış açılarından cevaplar, tartışmalar ve deneyimler.`,
        160,
    );
    const crumbs = [['Ana Sayfa', '/'], ['Sorular', '/questions'], [name, path]];
    const items = questionListItems(questions);

    const bodyHtml =
        `<main id="seo-ssr">${breadcrumbNav(crumbs.slice(0, -1))}` +
        `<h1>${escapeHtml(name)} Soruları</h1><p class="meta">${escapeHtml(description)}</p>` +
        (items.length ? `<ul>${items.join('')}</ul>` : '<p>Bu kategoride henüz soru yok.</p>') +
        `<p class="more"><a href="/questions">Tüm sorular</a> · <a href="/ask">Soru sor</a></p></main>`;

    const itemList = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonical,
        mainEntity: {
            '@type': 'ItemList',
            numberOfItems: total,
            itemListElement: questions.slice(0, 20).map((q, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                name: q.title,
                url: `${origin}/question/${q.slug}`,
            })),
        },
    };

    return {
        title,
        description,
        canonical,
        ogType: 'website',
        ...defaultImage(origin),
        jsonLd: [itemList, breadcrumb(origin, crumbs)],
        bodyHtml,
        status: 200,
    };
}

/**
 * Ana sayfa: değer önerisi, son sorular (iç bağlantı), kategoriler; Organization + WebSite (SearchAction).
 * `data`: { questions?, pagination?, categories? } — her biri eksik olabilir, sayfa yine üretilir.
 */
export function homePage(data, { origin }) {
    const canonical = origin + '/';
    const questions = Array.isArray(data.questions) ? data.questions : [];
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const total = Number(data.pagination?.totalQuestions || 0) || 0;

    const intro =
        `<p>Herkesler Soruyor, kadınların ve erkeklerin aynı soruya kendi penceresinden cevap verdiği anonim bir soru-cevap topluluğudur. ` +
        `İlişkiler, aile, arkadaşlık, kariyer, sağlık ya da gündelik hayat: aklındaki soruyu çekinmeden sor, karşı tarafın ne düşündüğünü ilk ağızdan öğren.</p>` +
        `<p>Sorular kategorilere ayrılır, cevaplar beğeniyle öne çıkar; görüş yazıları, hikâyeler ve bilgi yarışması oyunlarıyla topluluk her gün büyür.` +
        (total ? ` Şu ana kadar ${total.toLocaleString('tr-TR')} soru soruldu.` : '') +
        `</p>`;

    const latest = questions.length
        ? `<section><h2>Son Sorular</h2><ul>${questionListItems(questions).join('')}</ul>` +
        `<p class="more"><a href="/questions">Tüm soruları gör</a></p></section>`
        : '';

    const cats = categories.filter((c) => c && c.slug && c.name);
    const catsHtml = cats.length
        ? `<section><h2>Kategoriler</h2><p class="meta">${cats
            .map((c) => `<a href="/questions/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`)
            .join(' · ')}</p></section>`
        : '';

    const bodyHtml =
        `<main id="seo-ssr"><h1>Kadınlar ve Erkekler Soruyor, Cevaplıyor</h1>${intro}` +
        `<p class="more"><a href="/ask">Soru sor</a> · <a href="/questions">Soruları keşfet</a> · <a href="/opinions">Görüşler</a> · <a href="/stories">Hikayeler</a> · <a href="/oyun">Oyunlar</a></p>` +
        latest +
        catsHtml +
        `</main>`;

    const website = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        name: SITE,
        url: canonical,
        inLanguage: 'tr',
        publisher: { '@id': `${origin}/#organization` },
        potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${origin}/questions?search={search_term_string}` },
            'query-input': 'required name=search_term_string',
        },
    };

    return {
        title: SITE_TITLE,
        description: SITE_DESCRIPTION,
        canonical,
        ogType: 'website',
        ...defaultImage(origin),
        jsonLd: [{ '@context': 'https://schema.org', ...organization(origin) }, website],
        bodyHtml,
        status: 200,
    };
}

export function notFoundPage({ origin, path }, label = 'Sayfa') {
    return {
        title: `${label} bulunamadı - ${SITE}`,
        description: `Aradığınız ${label.toLowerCase()} kaldırılmış ya da hiç var olmamış olabilir.`,
        canonical: origin + path,
        robots: 'noindex, follow',
        ogType: 'website',
        ...defaultImage(origin),
        jsonLd: [],
        bodyHtml: `<main id="seo-ssr"><h1>${escapeHtml(label)} bulunamadı</h1><p><a href="/questions">Sorulara dön</a></p></main>`,
        status: 404,
    };
}
