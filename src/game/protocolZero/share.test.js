import { describe, expect, it, vi } from 'vitest';
import { buildShareText, buildShareUrl, shareResult, whatsappLink, xLink } from './share';

describe('paylaşım metni', () => {
    it('zafer metni gün, skor, zorluk ve site bağlantısını içerir', () => {
        const t = buildShareText({ outcome: 'victory', days: 42, score: 14500, difficulty: 'hard' });
        expect(t).toContain('42 günde');
        expect(t).toContain('14.500');
        expect(t).toContain('Zor');
        expect(t).toContain('herkeslersoruyor.com.tr/oyun/protocol-zero');
    });

    it('yenilgi metni farklı ve bağlantı yine var', () => {
        const t = buildShareText({ outcome: 'defeat', days: 17, score: 2100, difficulty: 'normal' }, buildShareUrl('https://ornek.test/'));
        expect(t).toContain('17. günde');
        expect(t).toContain('https://ornek.test/oyun/protocol-zero');
        expect(t).not.toContain('durdurdum');
    });

    it('WhatsApp ve X bağlantıları metni kodlar', () => {
        expect(whatsappLink('a b')).toBe('https://wa.me/?text=a%20b');
        expect(xLink('#x')).toContain('text=%23x');
    });
});

describe('shareResult', () => {
    it('Web Share varsa onu kullanır', async () => {
        const nav = { share: vi.fn().mockResolvedValue(undefined) };
        expect(await shareResult('m', { nav })).toBe('shared');
        expect(nav.share).toHaveBeenCalledWith({ title: 'PROTOCOL: ZERO', text: 'm' });
    });

    it('kullanıcı iptal ederse failed, yoksa panoya düşer', async () => {
        const abort = Object.assign(new Error('x'), { name: 'AbortError' });
        expect(await shareResult('m', { nav: { share: vi.fn().mockRejectedValue(abort) } })).toBe('failed');
        const nav = { share: vi.fn().mockRejectedValue(new Error('no')), clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };
        expect(await shareResult('m', { nav })).toBe('copied');
        expect(nav.clipboard.writeText).toHaveBeenCalledWith('m');
    });

    it('hiçbir yol yoksa failed', async () => {
        expect(await shareResult('m', { nav: {} })).toBe('failed');
    });
});
