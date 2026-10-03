import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SKY_KEYS } from '../../../../game/tower/engine/palette';

/*
 * "Mükemmel!/Harika!/Efsane! + xN kombo" yazısı koyu yarı saydam bir hapın
 * içinde. Arkadaki gökyüzü her şey olabilir (gün batımı ufku, güneş diski,
 * pastel katlar); en kötü durum saf beyaz zemin. Hap rengi o zeminle
 * karıştırılıp yazı renkleriyle WCAG AA (normal metin 4,5:1) denetlenir.
 */
const css = readFileSync(fileURLToPath(new URL('../tower.css', import.meta.url)), 'utf8');

const cssVar = (name) => {
    const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`${name} tower.css'te yok`);
    return m[1].trim();
};

const parse = (v) => {
    let m = v.match(/^#([0-9a-f]{6})$/i);
    if (m) {
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
    }
    m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    throw new Error(`renk okunamadı: ${v}`);
};

const fromHex = (n) => ({ r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 });
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lum = ({ r, g, b }) => {
    const ch = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
const contrast = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const pill = parse(cssVar('--tower-pop-bg'));
const texts = {
    kelime: parse(cssVar('--tower-pop-word')),
    kombo: parse(cssVar('--tower-pop-combo')),
    'kat büyüdü': parse(cssVar('--tower-pop-grew')),
};

// Saf beyaz (güneş diski / en açık kat) + gökyüzünün tüm anahtar renkleri.
const backdrops = [{ name: 'beyaz', c: fromHex(0xffffff) }];
for (const k of SKY_KEYS) {
    for (const key of ['top', 'mid', 'horizon', 'fog', 'sunCol']) backdrops.push({ name: `${k.at}.kat ${key}`, c: fromHex(k[key]) });
}

describe('Kule "Mükemmel!" yazısı kontrastı', () => {
    it('hap yeterince koyu ve yarı saydam (zemin hafif görünür)', () => {
        expect(pill.a).toBeGreaterThanOrEqual(0.6);
        expect(pill.a).toBeLessThan(1);
    });

    it.each(Object.keys(texts))('%s her zeminde WCAG AA (≥ 4,5:1)', (name) => {
        const worst = backdrops
            .map(({ name: bg, c }) => ({ bg, ratio: contrast(texts[name], over(pill, c)) }))
            .sort((a, b) => a.ratio - b.ratio)[0];
        expect(worst.ratio, `en kötü zemin: ${worst.bg}`).toBeGreaterThanOrEqual(4.5);
    });

    it('hap olmadan beyaz yazı açık gökte okunmazdı (testin anlamı)', () => {
        expect(contrast(texts.kelime, fromHex(0xffc48a))).toBeLessThan(2);
    });
});
