import { describe, expect, it } from 'vitest';
import { hoursUntilClose } from './communityClosing';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const inHours = (h) => new Date(NOW + h * 3_600_000).toISOString();

describe('hoursUntilClose', () => {
    it('tarih yoksa ya da bozuksa null', () => {
        expect(hoursUntilClose(null, NOW)).toBeNull();
        expect(hoursUntilClose(undefined, NOW)).toBeNull();
        expect(hoursUntilClose('bozuk', NOW)).toBeNull();
    });

    it('süre geçtiyse null', () => {
        expect(hoursUntilClose(inHours(0), NOW)).toBeNull();
        expect(hoursUntilClose(inHours(-3), NOW)).toBeNull();
    });

    it('kalan saati yukarı yuvarlar, en az 1', () => {
        expect(hoursUntilClose(inHours(48), NOW)).toBe(48);
        expect(hoursUntilClose(inHours(47.2), NOW)).toBe(48);
        expect(hoursUntilClose(inHours(0.1), NOW)).toBe(1);
    });
});
