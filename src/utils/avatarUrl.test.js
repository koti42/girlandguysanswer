import { describe, expect, it } from 'vitest';
import { normalizeAvatarUrl } from './avatarUrl';

/*
 * Avatar URL'leri sunucudan üç farklı biçimde gelebiliyor: tam adres,
 * protokolsüz adres ve `storage/...` göreli yolu. Üstüne bir de iki alan adının
 * birbirine yapıştığı bozuk biçim var (herkeslersoruyor.com.tr/
 * herkeslersoruyor.panalix.com.tr/...). Bu fonksiyon hepsini tek biçime indirir;
 * sessizce bozulursa kullanıcıya kırık görsel olarak yansır.
 */
describe('normalizeAvatarUrl', () => {
    it('tam adresi olduğu gibi bırakır', () => {
        const url = 'https://herkeslersoruyor.panalix.com.tr/storage/avatars/1.png';
        expect(normalizeAvatarUrl(url)).toBe(url);
    });

    it('iç içe geçmiş alan adını düzeltir', () => {
        expect(
            normalizeAvatarUrl('https://herkeslersoruyor.com.tr/herkeslersoruyor.panalix.com.tr/storage/a.png')
        ).toBe('https://herkeslersoruyor.panalix.com.tr/storage/a.png');
    });

    it('protokolsüz adrese https ekler', () => {
        expect(normalizeAvatarUrl('herkeslersoruyor.panalix.com.tr/storage/a.png'))
            .toBe('https://herkeslersoruyor.panalix.com.tr/storage/a.png');
    });

    it('tekrarlayan protokolü temizler', () => {
        expect(normalizeAvatarUrl('https://https://herkeslersoruyor.panalix.com.tr/storage/a.png'))
            .toBe('https://herkeslersoruyor.panalix.com.tr/storage/a.png');
    });

    it('storage göreli yolunu API tabanıyla birleştirir', () => {
        expect(normalizeAvatarUrl('storage/avatars/5.png'))
            .toMatch(/^https?:\/\/.+\/storage\/avatars\/5\.png$/);
    });

    it('metin hâlindeki null/undefined değerlerini eler', () => {
        expect(normalizeAvatarUrl('null')).toBe(null);
        expect(normalizeAvatarUrl('undefined')).toBe(null);
        expect(normalizeAvatarUrl('   ')).toBe(null);
    });

    it('boş girdiyi olduğu gibi geçirir', () => {
        expect(normalizeAvatarUrl(null)).toBe(null);
        expect(normalizeAvatarUrl(undefined)).toBe(undefined);
    });
});
