/** Oyun yönetimi için saf yardımcılar (bileşen değil; testleri node ortamında). */

export const DIFFICULTIES = [
    { value: 1, label: 'Kolay', tone: 'success' },
    { value: 2, label: 'Orta', tone: 'warning' },
    { value: 3, label: 'Zor', tone: 'danger' },
];

export const difficultyOf = (d) => DIFFICULTIES.find((x) => x.value === Number(d)) || { value: d, label: d ?? '—', tone: 'neutral' };

/** times_correct / times_answered yüzdesi; hiç cevaplanmadıysa null. */
export function accuracyOf(q) {
    if (!q) return null;
    const answered = Number(q.times_answered) || 0;
    if (answered > 0) return Math.round(((Number(q.times_correct) || 0) / answered) * 100);
    if (q.accuracy !== undefined && q.accuracy !== null) return Math.round(Number(q.accuracy));
    return null;
}

export const accuracyTone = (pct) => pct === null ? 'neutral' : pct < 35 ? 'danger' : pct < 65 ? 'warning' : 'success';

/** Sözleşme `last_page` döner; panelin Pagination bileşeni `total_pages` bekler. */
export function toPagination(p, fallbackTotal = 0) {
    if (!p) return { current_page: 1, total_pages: 1, total: fallbackTotal };
    return { ...p, current_page: p.current_page ?? 1, total_pages: p.total_pages ?? p.last_page ?? 1, total: p.total ?? fallbackTotal };
}

/** Kategori nesne ya da slug olarak gelebilir. */
export const categorySlug = (c) => (c && typeof c === 'object' ? c.slug : c) || '';

/** Liste cevabı dizi ya da `{ key: [...] }` olabilir. */
export function listOf(data, ...keys) {
    if (Array.isArray(data)) return data;
    for (const k of keys) if (Array.isArray(data?.[k])) return data[k];
    return [];
}

export const emptyQuestionForm = (category = '') => ({
    text: '', options: ['', '', '', ''], correct_index: 0, difficulty: 2, explanation: '', category, is_active: true,
});

export const questionToForm = (q) => ({
    text: q.text || '',
    options: [0, 1, 2, 3].map((i) => q.options?.[i] ?? ''),
    correct_index: Number(q.correct_index) || 0,
    difficulty: Number(q.difficulty) || 1,
    explanation: q.explanation || '',
    category: categorySlug(q.category),
    is_active: q.is_active !== false && q.is_active !== 0,
});

/** İstemci tarafı doğrulama: sunucu da doğrular; bu yalnızca hızlı geri bildirim. */
export function validateQuestion(form) {
    const errors = {};
    if (!form.text.trim()) errors.text = 'Soru metni gerekli.';
    if (!form.category) errors.category = 'Kategori seçin.';
    form.options.forEach((o, i) => { if (!String(o).trim()) errors[`options.${i}`] = 'Şık boş olamaz.'; });
    const trimmed = form.options.map((o) => String(o).trim().toLocaleLowerCase('tr'));
    if (!Object.keys(errors).length && new Set(trimmed).size !== trimmed.length) errors.options = 'Şıklar birbirinden farklı olmalı.';
    if (![0, 1, 2, 3].includes(Number(form.correct_index))) errors.correct_index = 'Doğru şıkkı seçin.';
    return errors;
}

/** Sözleşmedeki gövde: { category: slug, text, options[4], correct_index, difficulty, explanation?, is_active? } */
export function questionPayload(form, { includeActive = false } = {}) {
    const body = {
        category: form.category,
        text: form.text.trim(),
        options: form.options.map((o) => String(o).trim()),
        correct_index: Number(form.correct_index),
        difficulty: Number(form.difficulty),
        explanation: form.explanation.trim() || null,
    };
    if (includeActive) body.is_active = !!form.is_active;
    return body;
}

/** Laravel 422 hatalarını { alan: ilk mesaj } biçimine çevirir. */
export const fieldErrors = (e) => {
    const errs = e?.response?.data?.errors;
    return errs ? Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])) : null;
};

/** "2026-09-29T00:00:00Z" → "2026-09-29" (date input için). */
export const dateOnly = (v) => (v ? String(v).slice(0, 10) : '');
