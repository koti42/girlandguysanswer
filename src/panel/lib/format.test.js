import { describe, expect, it } from 'vitest';
import { compactNumber, hoursLabel, percentChange, relativeTime, truncate } from './format';

describe('compactNumber', () => {
    it('küçük sayıları olduğu gibi verir', () => {
        expect(compactNumber(0)).toBe('0');
        expect(compactNumber(999)).toBe('999');
    });
    it('binleri B, milyonları M ile kısaltır', () => {
        expect(compactNumber(12500)).toBe('12,5B');
        expect(compactNumber(1_250_000)).toBe('1,3M');
    });
    it('geçersiz girdide 0', () => {
        expect(compactNumber('abc')).toBe('0');
        expect(compactNumber(null)).toBe('0');
    });
});

describe('percentChange', () => {
    it('normal değişim', () => {
        expect(percentChange(150, 100)).toBe(50);
        expect(percentChange(50, 100)).toBe(-50);
    });
    it('sıfırdan büyüme +100, sıfırdan sıfır 0', () => {
        expect(percentChange(5, 0)).toBe(100);
        expect(percentChange(0, 0)).toBe(0);
    });
});

describe('hoursLabel', () => {
    it('saat ve gün birleşimi', () => {
        expect(hoursLabel(0.5)).toBe('<1s');
        expect(hoursLabel(5)).toBe('5s');
        expect(hoursLabel(24)).toBe('1g');
        expect(hoursLabel(30)).toBe('1g 6s');
    });
    it('geçersizde tire', () => {
        expect(hoursLabel(null)).toBe('—');
        expect(hoursLabel(-1)).toBe('—');
    });
});

describe('relativeTime', () => {
    it('geçmiş ve gelecek', () => {
        const now = new Date('2026-01-01T12:00:00Z').getTime();
        expect(relativeTime('2026-01-01T09:00:00Z', now)).toMatch(/saat/);
        expect(relativeTime('2026-01-03T12:00:00Z', now)).toMatch(/gün/);
    });
    it('boş/geçersiz girdide boş string', () => {
        expect(relativeTime(null)).toBe('');
        expect(relativeTime('tarih değil')).toBe('');
    });
});

describe('truncate', () => {
    it('HTML etiketlerini atıp keser', () => {
        expect(truncate('<b>Merhaba</b> dünya', 8)).toBe('Merhaba…');
        expect(truncate('kısa', 10)).toBe('kısa');
    });
});
