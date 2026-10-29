/*
 * API yanıtlarını edge ön-render sayfa modeline çevirir.
 *
 * Sayfa modeli: { title, description, canonical, robots?, ogType?, image?, jsonLd: object[], extraHead?, bodyHtml, status }
 *
 * Kurallar:
 *  - Cevapsız soru: `noindex, follow` (ince içerik; sitemap de bu soruları yazmaz). Bağlantılar takip edilir
 *    ki tarayıcı kategori/soru listesine yürüsün.
 *  - Profil sayfaları giriş istiyor ve robots.txt'te kapalı: profil bağlantısı basılmaz, yalnız ad yazılır.
 *  - Kullanıcı içeriği her zaman kaçışlanır; HTML'li alanlar (görüş/hikâye) düz metne indirilip paragraflanır.
 */
import { escapeHtml, formatDate, paragraphs, stripTags, truncate } from './html.js';

const SITE = 'Herkesler Soruyor';
const DEFAULT_IMAGE = '/logo.png';

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

function publisher(origin) {
    return {
        '@type': 'Organization',
        name: SITE,
        logo: { '@type': 'ImageObject', url: origin + DEFAULT_IMAGE },
    };
}

function absolute(origin, url) {
    if (!url) return null;
    return /^https?:\/\//i.test(url) ? url : origin + (url.startsWith('/') ? url : '/' + url);
}

function visibleAnswers(question) {
    const list = Array.isArray(question.answers) ? question.answers : [];
    return list.filter((a) => a && !a.removed_at && !a.hidden_at && !a.deleted_at);
}

export function questionPage(question, { origin, path }) {
    const canonical = origin + path;
    const title = `${question.title} - ${SITE}`;
    const text = stripTags(question.description) || question.title;
    const description = truncate(text, 160);
    const answers = visibleAnswers(question);
    const answerCount = Math.max(Number(question.answers_count ?? question.answer_count ?? 0) || 0, answers.length);
    const category = question.category && question.category.slug ? question.category : null;
    const image = absolute(origin, question.image) || origin + DEFAULT_IMAGE;

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
        image,
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
    const image = images[0] || origin + DEFAULT_IMAGE;
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
        publisher: publisher(origin),
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
        image,
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

    const items = questions.map((q) => {
        const excerpt = truncate(stripTags(q.description), 120);
        const count = Number(q.answers_count ?? q.answer_count ?? 0) || 0;
        return (
            `<li><a href="/question/${escapeHtml(q.slug)}"><strong>${escapeHtml(q.title)}</strong></a>` +
            (excerpt ? `<p>${escapeHtml(excerpt)}</p>` : '') +
            `<footer>${count} cevap · ${escapeHtml(formatDate(q.published_at || q.created_at))}</footer></li>`
        );
    });

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
        image: origin + DEFAULT_IMAGE,
        jsonLd: [itemList, breadcrumb(origin, crumbs)],
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
        jsonLd: [],
        bodyHtml: `<main id="seo-ssr"><h1>${escapeHtml(label)} bulunamadı</h1><p><a href="/questions">Sorulara dön</a></p></main>`,
        status: 404,
    };
}
