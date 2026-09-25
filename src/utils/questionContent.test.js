import { describe, expect, it } from 'vitest';
import { formatDate, getYoutubeVideoLinks } from './questionContent';

describe('getYoutubeVideoLinks', () => {
    it('metinden video kimliğini çıkarır', () => {
        const links = getYoutubeVideoLinks('Şuna bakın: https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(links).toHaveLength(1);
        expect(links[0].videoId).toBe('dQw4w9WgXcQ');
        expect(links[0].isMusic).toBe(false);
    });

    it('kısa, embed ve shorts biçimlerini de tanır', () => {
        const ids = getYoutubeVideoLinks(
            'https://youtu.be/aaaaaaaaaaa https://youtube.com/embed/bbbbbbbbbbb https://youtube.com/shorts/ccccccccccc'
        ).map((l) => l.videoId);
        expect(ids).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
    });

    it('music.youtube bağlantısını işaretler', () => {
        const [link] = getYoutubeVideoLinks('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
        expect(link.isMusic).toBe(true);
    });

    it('aynı videoyu tekrar saymaz', () => {
        const links = getYoutubeVideoLinks(
            'https://youtu.be/dQw4w9WgXcQ ve yine https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        );
        expect(links).toHaveLength(1);
    });

    it('protokolsüz bağlantıya https ekler', () => {
        const [link] = getYoutubeVideoLinks('youtu.be/dQw4w9WgXcQ adresine bakın');
        expect(link.url.startsWith('https://')).toBe(true);
    });

    /*
     * Paylaşılan global regex'in lastIndex'i çağrılar arasında taşınırsa
     * ikinci çağrı eşleşmeyi atlar. Fonksiyon her seferinde yeni bir örnek
     * kuruyor; bu test o davranışı kilitliyor.
     */
    it('art arda çağrıldığında aynı sonucu verir', () => {
        const text = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
        expect(getYoutubeVideoLinks(text)).toEqual(getYoutubeVideoLinks(text));
    });

    it('boş ve geçersiz girdide boş dizi döner', () => {
        expect(getYoutubeVideoLinks('')).toEqual([]);
        expect(getYoutubeVideoLinks(null)).toEqual([]);
        expect(getYoutubeVideoLinks(42)).toEqual([]);
        expect(getYoutubeVideoLinks('içinde video yok')).toEqual([]);
    });
});

describe('formatDate', () => {
    it('tarih yoksa "Az önce" der', () => {
        expect(formatDate(null)).toBe('Az önce');
        expect(formatDate('')).toBe('Az önce');
    });

    it('bozuk tarihte çökmez', () => {
        expect(formatDate('bu bir tarih değil')).toBe('Bilinmiyor');
    });

    it('geçerli tarihi Türkçe göreli biçimde verir', () => {
        const iki_saat_once = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        expect(formatDate(iki_saat_once)).toMatch(/saat önce/);
    });
});
