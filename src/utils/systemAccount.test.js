import { describe, expect, it } from 'vitest';
import { SYSTEM_USERNAME, canOfferBlock, isSystemAccount } from './systemAccount';

describe('isSystemAccount', () => {
    it('backend sistem kullanıcı adını tanır (harf, boşluk ve @ duyarsız)', () => {
        expect(SYSTEM_USERNAME).toBe('herkeslersoruyor-system');
        expect(isSystemAccount('herkeslersoruyor-system')).toBe(true);
        expect(isSystemAccount(' @HerkeslerSoruyor-System ')).toBe(true);
        expect(isSystemAccount({ username: 'herkeslersoruyor-system' })).toBe(true);
    });

    it('diğer kullanıcılar ve geçersiz girdiler sistem hesabı sayılmaz', () => {
        expect(isSystemAccount('herkeslersoruyor')).toBe(false);
        expect(isSystemAccount('ayse')).toBe(false);
        expect(isSystemAccount(null)).toBe(false);
        expect(isSystemAccount(undefined)).toBe(false);
        expect(isSystemAccount({})).toBe(false);
        expect(isSystemAccount(42)).toBe(false);
    });
});

describe('canOfferBlock', () => {
    it('sistem hesabında engelleme sunulmaz; eski engel varsa kaldırma sunulur', () => {
        expect(canOfferBlock('herkeslersoruyor-system')).toBe(false);
        expect(canOfferBlock('herkeslersoruyor-system', true)).toBe(true);
        expect(canOfferBlock('ayse')).toBe(true);
        expect(canOfferBlock('ayse', true)).toBe(true);
    });
});
