import { describe, it, expect } from 'vitest';
import { TITLES, ICONS, RARITY } from './titles.js';

/*
 * Mağaza tasarım verisi sözleşmesi (SPEC_V2 §F.2): web ve mobil renderer'ların
 * birebir çizebilmesi için yalnızca izinli tag/prop kümesi, çözülen defs
 * referansları, benzersiz id'ler ve okunur unvan pill'leri.
 */

const ELEMENT_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g', 'polygon']);
const DEF_TAGS = new Set(['linearGradient', 'radialGradient']);
const ELEMENT_PROPS = new Set([
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'opacity', 'transform',
]);
const LINEAR_PROPS = new Set(['x1', 'y1', 'x2', 'y2']);
const RADIAL_PROPS = new Set(['cx', 'cy', 'r', 'fx', 'fy']);
const ANIMS = new Set(['spin', 'pulse', 'shimmer', 'float', 'twinkle']);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const URL_REF = /^url\(#([A-Za-z0-9_-]+)\)$/;
const TRANSFORM_PART = /^(translate\(-?[\d.]+ -?[\d.]+\)|rotate\(-?[\d.]+ -?[\d.]+ -?[\d.]+\)|scale\(-?[\d.]+\))$/;
const NUMERIC = new Set(['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'strokeWidth', 'opacity']);

/* WCAG 2.x göreli parlaklık / kontrast */
function luminance(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** Bir art nesnesini doğrular; bulunan hataları döndürür, id'leri `seenIds`e ekler. */
function validateArt(name, art, seenIds) {
    const errs = [];
    const localIds = new Set();
    if (!/^0 0 \d+ \d+$/.test(art.viewBox)) errs.push(`${name}: viewBox ${art.viewBox}`);
    const [, , vw, vh] = art.viewBox.split(' ').map(Number);

    for (const d of art.defs || []) {
        if (!DEF_TAGS.has(d.tag)) errs.push(`${name}: def tag ${d.tag}`);
        if (!d.id || seenIds.has(d.id)) errs.push(`${name}: def id çakışması/boş ${d.id}`);
        seenIds.add(d.id);
        localIds.add(d.id);
        const allowed = d.tag === 'linearGradient' ? LINEAR_PROPS : RADIAL_PROPS;
        for (const [k, v] of Object.entries(d.props || {})) {
            if (!allowed.has(k)) errs.push(`${name}: ${d.tag}.${k}`);
            if (typeof v !== 'number' || v < -1 || v > 2) errs.push(`${name}: ${d.id}.${k}=${v}`);
        }
        if (!Array.isArray(d.stops) || d.stops.length < 2) errs.push(`${name}: ${d.id} durak sayısı`);
        for (const s of d.stops || []) {
            if (!HEX.test(s.color)) errs.push(`${name}: ${d.id} durak rengi ${s.color}`);
            if (typeof s.offset !== 'number' || s.offset < 0 || s.offset > 1) errs.push(`${name}: offset ${s.offset}`);
            for (const k of Object.keys(s)) if (!['offset', 'color', 'opacity'].includes(k)) errs.push(`${name}: stop.${k}`);
        }
    }

    const walk = (e, path) => {
        if (!ELEMENT_TAGS.has(e.tag)) errs.push(`${path}: tag ${e.tag}`);
        for (const k of Object.keys(e)) if (!['tag', 'props', 'children', 'anim'].includes(k)) errs.push(`${path}: anahtar ${k}`);
        if (e.anim !== undefined && !ANIMS.has(e.anim)) errs.push(`${path}: anim ${e.anim}`);
        for (const [k, v] of Object.entries(e.props || {})) {
            if (!ELEMENT_PROPS.has(k)) { errs.push(`${path}: prop ${k}`); continue; }
            if (NUMERIC.has(k) && (typeof v !== 'number' || !Number.isFinite(v))) errs.push(`${path}: ${k} sayı değil`);
            if (k === 'fill' || k === 'stroke') {
                const m = typeof v === 'string' && v.match(URL_REF);
                if (m) { if (!localIds.has(m[1])) errs.push(`${path}: çözülmeyen ${v}`); }
                else if (v !== 'none' && !HEX.test(v)) errs.push(`${path}: renk ${v}`);
            }
            if (k === 'transform') {
                for (const part of String(v).match(/[a-z]+\([^)]*\)/g) || ['<boş>']) {
                    if (!TRANSFORM_PART.test(part)) errs.push(`${path}: transform ${part}`);
                }
            }
            if (k === 'opacity' && (v < 0 || v > 1)) errs.push(`${path}: opacity ${v}`);
            if (k === 'strokeLinecap' && !['butt', 'round', 'square'].includes(v)) errs.push(`${path}: linecap ${v}`);
            if (k === 'strokeLinejoin' && !['miter', 'round', 'bevel'].includes(v)) errs.push(`${path}: linejoin ${v}`);
            if (k === 'd' && !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(v)) errs.push(`${path}: d sözdizimi`);
        }
        // Yaklaşık sınır kontrolü (dönüşümsüz şekiller): viewBox dışına 1 birimden fazla taşma yok
        const p = e.props || {};
        if (!p.transform) {
            if (e.tag === 'circle' && (p.cx - p.r < -1 || p.cx + p.r > vw + 1 || p.cy - p.r < -1 || p.cy + p.r > vh + 1)) errs.push(`${path}: daire taşıyor`);
            if (e.tag === 'rect' && (p.x < -1 || p.y < -1 || p.x + p.width > vw + 1 || p.y + p.height > vh + 1)) errs.push(`${path}: rect taşıyor`);
            if (e.tag === 'polygon') {
                const nums = p.points.trim().split(/[\s,]+/).map(Number);
                if (nums.some((n, i) => n < -1 || n > (i % 2 ? vh : vw) + 1)) errs.push(`${path}: polygon taşıyor`);
            }
        }
        (e.children || []).forEach((c, i) => walk(c, `${path}>${i}`));
    };
    art.elements.forEach((e, i) => walk(e, `${name}[${i}]`));
    if (!art.elements.length) errs.push(`${name}: boş`);
    return errs;
}

describe('ICONS', () => {
    it('F.2 tag/prop kümesine uyar, id\'ler benzersiz, defs referansları çözülür', () => {
        const seen = new Set();
        const errs = Object.entries(ICONS).flatMap(([k, art]) => validateArt(k, art, seen));
        expect(errs).toEqual([]);
    });

    it('hepsi 24×24', () => {
        for (const art of Object.values(ICONS)) expect(art.viewBox).toBe('0 0 24 24');
    });

    it('mağaza arayüzü ikonları mevcut', () => {
        for (const k of ['jeton', 'frame', 'mini', 'title', 'ticket', 'wallet', 'rarity', 'shop', 'avatar', 'lock', 'check']) {
            expect(ICONS[k], k).toBeDefined();
        }
    });

    it('jeton koşu oyunundaki altın jeton paletini kullanır', () => {
        const json = JSON.stringify(ICONS.jeton);
        for (const c of ['#FFF3B0', '#FFD34D', '#D79A1E', '#B8740F', '#A8650C', '#FFF6C8']) expect(json).toContain(c);
    });
});

describe('TITLES', () => {
    it('F.3\'teki 8 unvan var, anahtarlar title: önekli ve benzersiz', () => {
        const names = TITLES.map((t) => t.name);
        for (const n of ['Gece Kuşu', 'Bilgi Kurdu', 'Maratoncu', 'Kule Ustası', 'Soru Avcısı', 'Çay Ustası', 'Meraklı Kedi', 'Efsane']) {
            expect(names).toContain(n);
        }
        const ids = TITLES.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const t of TITLES) {
            expect(t.id).toMatch(/^title:[a-z0-9-]+$/);
            expect(t.category).toBe('title');
            expect(t.art).toBeUndefined();
            expect(typeof t.description).toBe('string');
            expect(t.description.length).toBeGreaterThan(10);
        }
    });

    it('stil: 2–3 hex renk, ikon ICONS\'ta, anim yalnızca epic/legendary', () => {
        for (const t of TITLES) {
            const s = t.style;
            expect(Object.keys(RARITY)).toContain(t.rarity);
            expect(s.text).toBe(t.name);
            expect(s.colors.length).toBeGreaterThanOrEqual(2);
            expect(s.colors.length).toBeLessThanOrEqual(3);
            s.colors.forEach((c) => expect(c).toMatch(HEX));
            expect(s.textColor).toMatch(HEX);
            expect(ICONS[s.icon], `${t.id} ikon ${s.icon}`).toBeDefined();
            if (s.anim !== undefined) {
                expect(ANIMS.has(s.anim)).toBe(true);
                expect(['epic', 'legendary']).toContain(t.rarity);
            }
        }
        const efsane = TITLES.find((t) => t.id === 'title:efsane');
        expect(efsane.rarity).toBe('legendary');
        expect(efsane.style.anim).toBe('shimmer');
    });

    it('metin her gradyan durağına karşı WCAG AA (≥ 4.5) kontrast', () => {
        for (const t of TITLES) {
            for (const c of t.style.colors) {
                expect(contrast(t.style.textColor, c), `${t.id} ${c}`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('unvan ikonları birbirinden farklı', () => {
        const icons = TITLES.map((t) => t.style.icon);
        expect(new Set(icons).size).toBe(icons.length);
    });
});

describe('RARITY', () => {
    it('dört seviye, etiketler ve sıra', () => {
        expect(Object.keys(RARITY)).toEqual(['common', 'rare', 'epic', 'legendary']);
        expect(RARITY.common.label).toBe('Sıradan');
        expect(RARITY.rare.label).toBe('Nadir');
        expect(RARITY.epic.label).toBe('Epik');
        expect(RARITY.legendary.label).toBe('Efsanevi');
        Object.values(RARITY).forEach((r, i) => {
            expect(r.order).toBe(i);
            expect(typeof r.glow).toBe('boolean');
            expect(r.glowColor).toMatch(HEX);
            r.colors.forEach((c) => {
                expect(c).toMatch(HEX);
                expect(contrast(r.textColor, c), `${r.label} ${c}`).toBeGreaterThanOrEqual(4.5);
            });
        });
        expect(RARITY.common.glow).toBe(false);
        expect(RARITY.legendary.glow).toBe(true);
    });
});
