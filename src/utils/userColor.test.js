import { describe, expect, it } from 'vitest';
import { getProfileColor, getViewerPrefs } from './userColor';

/*
 * Renk, İÇERİĞİ YAZANIN cinsiyetine göre seçilir; ama hangi renk olacağını
 * BAKAN kullanıcı kendi ayarlarından belirler. İki tarafın karışması, herkesin
 * profilinin yanlış renge boyanması demek - bu yüzden ayrı ayrı sabitleniyor.
 */
describe('getProfileColor', () => {
    it('cinsiyete göre farklı renk verir', () => {
        const kadin = getProfileColor({ gender: 'female' });
        const erkek = getProfileColor({ gender: 'male' });
        expect(kadin).not.toBe(erkek);
    });

    it('Türkçe cinsiyet değerlerini de tanır', () => {
        expect(getProfileColor({ gender: 'kadın' })).toBe(getProfileColor({ gender: 'female' }));
        expect(getProfileColor({ gender: 'erkek' })).toBe(getProfileColor({ gender: 'male' }));
    });

    it('cinsiyet bilinmiyorsa nötr renge düşer', () => {
        const notr = getProfileColor({ gender: null });
        expect(notr).not.toBe(getProfileColor({ gender: 'female' }));
        expect(notr).not.toBe(getProfileColor({ gender: 'male' }));
        expect(getProfileColor(null)).toBe(notr);
    });

    it('bakan kullanıcının tercihi içeriğin rengini belirler', () => {
        const prefs = { profile_color_female: '#ff0000', profile_color_male: '#0000ff' };
        expect(getProfileColor({ gender: 'female' }, prefs)).toBe('#ff0000');
        expect(getProfileColor({ gender: 'male' }, prefs)).toBe('#0000ff');
    });
});

describe('getViewerPrefs', () => {
    it('hiç renk ayarlanmamışsa null döner (varsayılanlar kullanılsın)', () => {
        expect(getViewerPrefs(null)).toBe(null);
        expect(getViewerPrefs({ detail: {} })).toBe(null);
        expect(getViewerPrefs({ detail: { profile_color_female: null, profile_color_male: null } })).toBe(null);
    });

    it('tek renk bile ayarlıysa tercihleri döndürür', () => {
        expect(getViewerPrefs({ detail: { profile_color_female: '#abcdef' } }))
            .toEqual({ profile_color_female: '#abcdef', profile_color_male: null });
    });
});
