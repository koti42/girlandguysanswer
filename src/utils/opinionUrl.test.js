import { describe, expect, it } from 'vitest';
import { buildOpinionPath, extractOpinionId } from './opinionUrl';
import { buildStoryPath, extractStoryId } from './storyUrl';

describe('buildOpinionPath', () => {
    it('slug varsa onu kullanır', () => {
        expect(buildOpinionPath({ id: 'abc', slug: 'kahve-uzerine' })).toBe('/opinion/kahve-uzerine');
    });

    it('slug boşsa başlıktan üretir ve kimliği sona ekler', () => {
        expect(buildOpinionPath({ id: '42', title: 'Kahve Üzerine' })).toBe('/opinion/kahve-uzerine-42');
    });

    it('Türkçe karakterleri sadeleştirir', () => {
        expect(buildOpinionPath({ id: '1', title: 'Çiğ Köfte, Şiş ve Ayran' }))
            .toBe('/opinion/cig-kofte-sis-ve-ayran-1');
    });

    it('başlıktaki HTML etiketlerini atar', () => {
        expect(buildOpinionPath({ id: '7', title: '<b>Kalın</b> başlık' }))
            .toBe('/opinion/kalin-baslik-7');
    });

    it('kimlik yoksa liste sayfasına düşer', () => {
        expect(buildOpinionPath({ title: 'Başlıksız' })).toBe('/opinions');
        expect(buildOpinionPath(null)).toBe('/opinions');
    });

    it('sadece boşluktan oluşan slug kullanılmaz', () => {
        expect(buildOpinionPath({ id: '9', slug: '   ', title: 'Yedek' })).toBe('/opinion/yedek-9');
    });
});

describe('extractOpinionId', () => {
    it('slug içinden UUID çıkarır', () => {
        const uuid = 'a2d43912-8b0a-40e2-ae8a-3bce6ec2a05f';
        expect(extractOpinionId(`kahve-uzerine-${uuid}`)).toBe(uuid);
    });

    it('UUID yoksa girdiyi olduğu gibi döndürür', () => {
        expect(extractOpinionId('kahve-uzerine')).toBe('kahve-uzerine');
    });

    it('boş girdiyi olduğu gibi geçirir', () => {
        expect(extractOpinionId('')).toBe('');
        expect(extractOpinionId(null)).toBe(null);
    });
});

describe('story yolları', () => {
    it('hikâye yolu aynı kurallarla kurulur', () => {
        expect(buildStoryPath({ id: '5', title: 'Gece Yarısı' })).toBe('/story/gece-yarisi-5');
    });

    it('hikâye kimliği slug içinden çıkarılır', () => {
        const uuid = 'a2d43912-8b0a-40e2-ae8a-3bce6ec2a05f';
        expect(extractStoryId(`gece-yarisi-${uuid}`)).toBe(uuid);
    });
});
