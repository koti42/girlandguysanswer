import { describe, expect, it } from 'vitest';
import { actionLabel, actionTone, publicPathFor, urgencyOf, userStatusOf } from './moderation';

describe('actionTone', () => {
    it('ceza / geri alma / bilgi ayrımı', () => {
        expect(actionTone('ban')).toBe('danger');
        expect(actionTone('hide')).toBe('warning');
        expect(actionTone('unban')).toBe('success');
        expect(actionTone('note')).toBe('neutral');
        expect(actionTone('role_change')).toBe('info');
    });
    it('profil teması işlemleri etiketlenir; kaldırma uyarı rengindedir', () => {
        expect(actionLabel('game_theme_grant')).toBe('Profil teması verildi');
        expect(actionLabel('game_theme_revoke')).toBe('Profil teması kaldırıldı');
        expect(actionTone('game_theme_revoke')).toBe('warning');
        expect(actionTone('game_theme_grant')).toBe('info');
    });
    it('bilinmeyen işlem için etiket işlemin kendisi', () => {
        expect(actionLabel('yeni_islem')).toBe('yeni_islem');
    });
});

describe('userStatusOf', () => {
    it('süresi dolmuş ban aktif sayılmaz', () => {
        expect(userStatusOf({ banned_at: '2026-01-01', banned_until: '2026-01-02' })).toBe('active');
    });
    it('süresiz ban banlı', () => {
        expect(userStatusOf({ banned_at: '2026-01-01', banned_until: null })).toBe('banned');
    });
    it('ban dondurmadan önce gelir', () => {
        expect(userStatusOf({ banned_at: '2026-01-01', frozen_at: '2026-01-01' })).toBe('banned');
    });
    it('sunucu status vermişse onu kullanır', () => {
        expect(userStatusOf({ status: 'frozen' })).toBe('frozen');
    });
});

describe('urgencyOf', () => {
    it('yaş ve şikâyet sayısı eşiği', () => {
        expect(urgencyOf(1, 1)).toBe('neutral');
        expect(urgencyOf(7, 1)).toBe('warning');
        expect(urgencyOf(1, 3)).toBe('warning');
        expect(urgencyOf(25, 1)).toBe('danger');
        expect(urgencyOf(1, 5)).toBe('danger');
    });
});

describe('publicPathFor', () => {
    it('slug varsa slug, yoksa id', () => {
        expect(publicPathFor('question', { id: 'x', slug: 'soru-1' })).toBe('/question/soru-1');
        expect(publicPathFor('opinion', { id: 'x' })).toBe('/opinion/x');
    });
    it('cevap soru sayfasına çıpa ile gider', () => {
        expect(publicPathFor('answer', { id: 'a1', question_id: 'q1' })).toBe('/question/q1#answer-a1');
    });
    it('yorumun herkese açık yolu yok', () => {
        expect(publicPathFor('comment', { id: 'c' })).toBeNull();
    });
});
