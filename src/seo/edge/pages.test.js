import { describe, expect, it } from 'vitest';
import { categoryPage, notFoundPage, opinionPage, questionPage, storyPage } from './pages.js';

const ctx = (path) => ({ origin: 'https://s.test', path });

const answer = (over = {}) => ({
    id: 'a1',
    content: 'Bence <b>önce</b> konuşmalısın.',
    created_at: '2026-05-05T09:59:18.000000Z',
    likes_count: 3,
    is_accepted: false,
    is_anonymous: false,
    user: { username: 'ayse', name: 'Ayşe' },
    ...over,
});

const question = (over = {}) => ({
    id: 'q1',
    title: 'Eşimin arkadaşı <script>alert(1)</script> ne yapmalıyım?',
    slug: 'esimin-arkadasi',
    description: '<p>Merhaba &amp; selam.</p><p>İkinci paragraf.</p>',
    answers_count: 1,
    likes_count: 7,
    created_at: '2026-05-01T10:00:00.000000Z',
    published_at: '2026-05-01T10:00:00.000000Z',
    is_anonymous: true,
    user: { username: 'gizli', name: 'Gizli' },
    category: { name: 'İlişkiler', slug: 'ask-iliskileri' },
    tags: ['evlilik', { name: 'arkadaş' }],
    image: null,
    answers: [answer()],
    ...over,
});

describe('questionPage', () => {
    it('başlık, açıklama, canonical ve QAPage JSON-LD üretir', () => {
        const page = questionPage(question(), ctx('/question/esimin-arkadasi'));
        expect(page.title).toContain('Eşimin arkadaşı');
        expect(page.title.endsWith(' - Herkesler Soruyor')).toBe(true);
        expect(page.description).toBe('Merhaba & selam. İkinci paragraf.');
        expect(page.canonical).toBe('https://s.test/question/esimin-arkadasi');
        expect(page.robots).toBeUndefined();
        expect(page.status).toBe(200);

        const qa = page.jsonLd.find((l) => l['@type'] === 'QAPage');
        expect(qa.mainEntity.answerCount).toBe(1);
        expect(qa.mainEntity.upvoteCount).toBe(7);
        expect(qa.mainEntity.author.name).toBe('Anonim');
        expect(qa.mainEntity.suggestedAnswer).toHaveLength(1);
        expect(qa.mainEntity.suggestedAnswer[0].text).toBe('Bence önce konuşmalısın.');
        expect(qa.mainEntity.suggestedAnswer[0].url).toBe('https://s.test/question/esimin-arkadasi#answer-a1');
        expect(qa.mainEntity.acceptedAnswer).toBeUndefined();

        const crumbs = page.jsonLd.find((l) => l['@type'] === 'BreadcrumbList');
        expect(crumbs.itemListElement.map((i) => i.item)).toEqual([
            'https://s.test/',
            'https://s.test/questions',
            'https://s.test/questions/ask-iliskileri',
            'https://s.test/question/esimin-arkadasi',
        ]);
    });

    it('kullanıcı içeriğini gövdede kaçışlar; ham script asla geçmez', () => {
        const page = questionPage(question(), ctx('/question/esimin-arkadasi'));
        expect(page.bodyHtml).not.toContain('<script>alert(1)</script>');
        expect(page.bodyHtml).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
        expect(page.bodyHtml).toContain('<h1>');
        expect(page.bodyHtml).toContain('<p>Bence önce konuşmalısın.</p>');
        expect(page.bodyHtml).toContain('<a href="/questions/ask-iliskileri">İlişkiler</a>');
        expect(page.bodyHtml).toContain('#evlilik #arkadaş');
        expect(page.bodyHtml).toContain('Cevaplar (1)');
        expect(page.bodyHtml).toContain('Ayşe');
        expect(page.bodyHtml).not.toContain('/profile/');
    });

    it('cevapsız soru noindex, follow alır ve çağrı metni basar', () => {
        const page = questionPage(question({ answers: [], answers_count: 0 }), ctx('/question/x'));
        expect(page.robots).toBe('noindex, follow');
        expect(page.bodyHtml).toContain('henüz cevap yazılmadı');
        const qa = page.jsonLd.find((l) => l['@type'] === 'QAPage');
        expect(qa.mainEntity.answerCount).toBe(0);
        expect(qa.mainEntity.suggestedAnswer).toBeUndefined();
    });

    it('gizli/kaldırılmış cevapları saymaz, kabul edilen cevabı acceptedAnswer yapar', () => {
        const page = questionPage(
            question({
                answers_count: 0,
                answers: [answer({ id: 'h', hidden_at: '2026-01-01' }), answer({ id: 'ok', is_accepted: true }), answer({ id: 'o2' })],
            }),
            ctx('/question/x'),
        );
        const qa = page.jsonLd.find((l) => l['@type'] === 'QAPage');
        expect(qa.mainEntity.answerCount).toBe(2);
        expect(qa.mainEntity.acceptedAnswer.url).toContain('#answer-ok');
        expect(qa.mainEntity.suggestedAnswer.map((a) => a.url)).toEqual(['https://s.test/question/x#answer-o2']);
        expect(page.bodyHtml).not.toContain('answer-h"');
    });

    it('görsel yoksa site logosunu og:image yapar, varsa mutlak URL', () => {
        expect(questionPage(question(), ctx('/q')).image).toBe('https://s.test/logo.png');
        expect(questionPage(question({ image: '/storage/x.jpg' }), ctx('/q')).image).toBe('https://s.test/storage/x.jpg');
        expect(questionPage(question({ image: 'https://cdn.test/x.jpg' }), ctx('/q')).image).toBe('https://cdn.test/x.jpg');
    });

    it('anonim olmayan yazarın adını yazar', () => {
        const page = questionPage(question({ is_anonymous: false, user: { username: 'mehmet', name: 'Mehmet Y.' } }), ctx('/q'));
        expect(page.bodyHtml).toContain('Mehmet Y.');
    });
});

describe('opinionPage / storyPage', () => {
    const opinion = {
        id: 'o1',
        title: 'Nar kesme tekniği',
        slug: 'nar-kesme-teknigi',
        content: '<p>Narı <i>yatay</i> kesmeyin.</p><p>Perdeleri izleyin.</p>',
        images: ['https://api.test/storage/opinions/a.jpeg'],
        created_at: '2026-06-25T21:15:54.000000Z',
        updated_at: '2026-10-23T06:24:27.000000Z',
        user: { username: 'ali', name: 'Ali' },
    };

    it('görüş: Article JSON-LD, görsel, paragraflar', () => {
        const page = opinionPage(opinion, ctx('/opinion/nar-kesme-teknigi'));
        expect(page.title).toBe('Nar kesme tekniği - Görüşler | Herkesler Soruyor');
        expect(page.description).toBe('Narı yatay kesmeyin. Perdeleri izleyin.');
        expect(page.image).toBe('https://api.test/storage/opinions/a.jpeg');
        expect(page.robots).toBeUndefined();
        const art = page.jsonLd.find((l) => l['@type'] === 'Article');
        expect(art.headline).toBe('Nar kesme tekniği');
        expect(art.dateModified).toBe('2026-10-23T06:24:27.000000Z');
        expect(art.author.name).toBe('Ali');
        expect(art.image).toEqual(['https://api.test/storage/opinions/a.jpeg']);
        expect(page.bodyHtml).toContain('<p>Narı yatay kesmeyin.</p><p>Perdeleri izleyin.</p>');
        expect(page.bodyHtml).toContain('<img src="https://api.test/storage/opinions/a.jpeg"');
        expect(page.bodyHtml).toContain('<a href="/opinions">');
    });

    it('hikâye: yetişkin içerik noindex ve rating=adult alır', () => {
        const page = storyPage({ ...opinion, is_adult: true, images: null }, ctx('/story/x'));
        expect(page.title).toContain('- Hikayeler | Herkesler Soruyor');
        expect(page.robots).toBe('noindex, follow');
        expect(page.extraHead).toContain('rating" content="adult"');
        expect(page.image).toBe('https://s.test/logo.png');
        expect(page.bodyHtml).not.toContain('<img');
    });

    it('hikâye: normal içerik indekslenir', () => {
        expect(storyPage({ ...opinion, is_adult: false }, ctx('/story/x')).robots).toBeUndefined();
    });
});

describe('categoryPage', () => {
    const data = {
        category: { name: 'Gündem & Haber', slug: 'gundem', description: null },
        questions: [
            { title: 'Bugün ne oldu?', slug: 'bugun-ne-oldu', description: '<p>Mangal yaptık.</p>', answers_count: 2, created_at: '2026-10-26T17:50:37Z' },
            { title: 'İkinci soru', slug: 'ikinci-soru', description: '', answers_count: 0, created_at: '2026-10-25T17:50:37Z' },
        ],
        pagination: { currentPage: 1, totalPages: 257, totalQuestions: 513 },
    };

    it('başlık, açıklama ve soru bağlantı listesi üretir', () => {
        const page = categoryPage(data, ctx('/questions/gundem'));
        expect(page.title).toBe('Gündem & Haber Soruları - Herkesler Soruyor');
        expect(page.description).toContain('513 soru');
        expect(page.bodyHtml).toContain('<h1>Gündem &amp; Haber Soruları</h1>');
        expect(page.bodyHtml).toContain('<a href="/question/bugun-ne-oldu"><strong>Bugün ne oldu?</strong></a>');
        expect(page.bodyHtml).toContain('<p>Mangal yaptık.</p>');
        expect(page.bodyHtml).toContain('2 cevap');
        expect(page.robots).toBeUndefined();

        const coll = page.jsonLd.find((l) => l['@type'] === 'CollectionPage');
        expect(coll.mainEntity.numberOfItems).toBe(513);
        expect(coll.mainEntity.itemListElement[0].url).toBe('https://s.test/question/bugun-ne-oldu');
    });

    it('boş kategori', () => {
        const page = categoryPage({ category: { name: 'Boş', slug: 'bos' }, questions: [] }, ctx('/questions/bos'));
        expect(page.bodyHtml).toContain('henüz soru yok');
        expect(page.description).toContain('0 soru');
    });
});

describe('notFoundPage', () => {
    it('404 + noindex', () => {
        const page = notFoundPage(ctx('/question/yok'), 'Soru');
        expect(page.status).toBe(404);
        expect(page.robots).toBe('noindex, follow');
        expect(page.title).toBe('Soru bulunamadı - Herkesler Soruyor');
    });
});
