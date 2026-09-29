import { describe, expect, it } from 'vitest';
import { accuracyOf, questionPayload, questionToForm, toPagination, validateQuestion } from './gameUtils';

describe('gameUtils', () => {
    it('accuracyOf: times_correct / times_answered, cevapsızsa null', () => {
        expect(accuracyOf({ times_answered: 3, times_correct: 2 })).toBe(67);
        expect(accuracyOf({ times_answered: 0, times_correct: 0 })).toBeNull();
        expect(accuracyOf({ accuracy: 42.4 })).toBe(42);
    });

    it('toPagination: last_page → total_pages', () => {
        expect(toPagination({ current_page: 2, last_page: 5, per_page: 20, total: 90 })).toMatchObject({ current_page: 2, total_pages: 5, total: 90 });
        expect(toPagination(undefined, 3)).toEqual({ current_page: 1, total_pages: 1, total: 3 });
    });

    it('questionToForm → questionPayload gidiş-dönüşü; kategori nesnesi slug olur', () => {
        const form = questionToForm({ text: 'x', options: ['a', 'b', 'c', 'd'], correct_index: 3, difficulty: 3, explanation: '', category: { slug: 'tarih' }, is_active: false });
        expect(questionPayload(form, { includeActive: true })).toEqual({ category: 'tarih', text: 'x', options: ['a', 'b', 'c', 'd'], correct_index: 3, difficulty: 3, explanation: null, is_active: false });
        expect(questionPayload(form)).not.toHaveProperty('is_active');
    });

    it('validateQuestion: boş alanlar ve tekrarlayan şıklar', () => {
        expect(validateQuestion({ text: ' ', category: '', options: ['a', '', 'c', 'd'], correct_index: 0 })).toMatchObject({ text: expect.any(String), category: expect.any(String), 'options.1': expect.any(String) });
        expect(validateQuestion({ text: 'q', category: 'c', options: ['A', 'a', 'c', 'd'], correct_index: 0 })).toHaveProperty('options');
        expect(validateQuestion({ text: 'q', category: 'c', options: ['a', 'b', 'c', 'd'], correct_index: 2 })).toEqual({});
    });
});
