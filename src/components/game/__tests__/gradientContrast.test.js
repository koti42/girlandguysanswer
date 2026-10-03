import { describe, expect, it } from 'vitest';

/*
 * Altın/amber → mercan geçişli düğme ve rozetlerde beyaz yazı AA'yı
 * karşılamıyor (beyaz/#fbbf24 1,67:1). Opak bu geçişlerin üstünde koyu yazı
 * (text-slate-950) kullanılır; yarı saydam (/30) şeritler koyu zeminde
 * durduğu için beyaz kalabilir.
 */
const sources = import.meta.glob(['/src/**/*.jsx', '!/src/**/*.test.jsx'], { query: '?raw', import: 'default', eager: true });

describe('altın→mercan geçiş kontrastı', () => {
    it('opak from-amber-400/from-gold → to-coral sınıf dizilerinde text-white yok', () => {
        const offenders = [];
        for (const [file, src] of Object.entries(sources)) {
            src.split('\n').forEach((line, i) => {
                if (/\bfrom-(amber-400|gold)\s+to-coral\b/.test(line) && /\btext-white\b(?!\/)/.test(line)) {
                    offenders.push(`${file}:${i + 1}`);
                }
            });
        }
        expect(offenders).toEqual([]);
    });

    it('denetim gerçekten dosya tarıyor', () => {
        expect(Object.keys(sources).some((f) => f.endsWith('/shop/ItemDrawer.jsx'))).toBe(true);
    });
});
