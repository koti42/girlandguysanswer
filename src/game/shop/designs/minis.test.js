import { describe, it, expect } from 'vitest';
import { MINIS } from './minis.js';

/* SPEC_V2 §F.2 — web (React DOM SVG) ve mobil (react-native-svg) ortak alt küme */
const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g', 'polygon']);
const PROPS = new Set([
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'opacity', 'transform',
]);
const DEF_PROPS = {
    linearGradient: new Set(['x1', 'y1', 'x2', 'y2']),
    radialGradient: new Set(['cx', 'cy', 'r', 'fx', 'fy']),
};
const ANIMS = new Set(['spin', 'pulse', 'shimmer', 'float', 'twinkle']);
const RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const URL_REF = /^url\(#([A-Za-z][\w-]*)\)$/;
const NUM = '-?\\d*\\.?\\d+';
const TF_PART = new RegExp(`^(translate\\(${NUM} ${NUM}\\)|rotate\\(${NUM} ${NUM} ${NUM}\\)|scale\\(${NUM}\\))$`);

/** F.3 listesi (ad → beklenen nadirlik, null = serbest) */
const F3 = {
    'Meraklı Kedi': null, 'Tilki': null, 'Panda': null, 'Baykuş': null, 'Ayıcık': null,
    'Tavşan': null, 'Uzaylı': null, 'Robot': null, 'Hayalet': 'rare', 'Çay Bardağı': null,
    'Simit': null, 'Türk Kahvesi': 'rare', 'Nazar Boncuğu': null, 'Lale': null,
    'Taç': 'epic', 'Ejderha': 'legendary',
};

const walk = (nodes, fn, parentAnim = null) => {
    for (const n of nodes) {
        fn(n, parentAnim);
        if (n.children) walk(n.children, fn, parentAnim || n.anim || null);
    }
};

const isColor = (v) => v === 'none' || HEX.test(v) || URL_REF.test(v);

/** Bir öğenin yaklaşık sınır kutusu (transform yok sayılır; yalnız kaba taşma kontrolü) */
const bounds = (n) => {
    const p = n.props;
    const sw = (p.strokeWidth || 0) / 2;
    switch (n.tag) {
        case 'circle': return [p.cx - p.r - sw, p.cy - p.r - sw, p.cx + p.r + sw, p.cy + p.r + sw];
        case 'ellipse': {
            const m = Math.max(p.rx, p.ry); // döndürülmüş olabilir
            const rx = p.transform ? m : p.rx;
            const ry = p.transform ? m : p.ry;
            return [p.cx - rx - sw, p.cy - ry - sw, p.cx + rx + sw, p.cy + ry + sw];
        }
        case 'rect': return [p.x - sw, p.y - sw, p.x + p.width + sw, p.y + p.height + sw];
        case 'path':
        case 'polygon': {
            if (/[Aa]/.test(p.d || '')) return null; // yay bayrakları çift-koordinat okumayı bozar
            const nums = (p.d || p.points).replace(/[A-Za-z]/g, ' ').trim().split(/[\s,]+/).map(Number);
            const xs = nums.filter((_, i) => i % 2 === 0);
            const ys = nums.filter((_, i) => i % 2 === 1);
            return [Math.min(...xs) - sw, Math.min(...ys) - sw, Math.max(...xs) + sw, Math.max(...ys) + sw];
        }
        default: return null;
    }
};

describe('MINIS — mini avatarlar (F.2/F.3)', () => {
    it('saf veri: JSON gidiş-dönüşünde birebir aynı', () => {
        expect(JSON.parse(JSON.stringify(MINIS))).toEqual(MINIS);
    });

    it('F.3\'teki 16 mini avatarın hepsi var, anahtarlar mini: önekli ve benzersiz', () => {
        expect(MINIS.length).toBeGreaterThanOrEqual(16);
        const names = MINIS.map((d) => d.name);
        for (const name of Object.keys(F3)) expect(names).toContain(name);
        const ids = MINIS.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const d of MINIS) {
            expect(d.id).toMatch(/^mini:[a-z0-9]+(-[a-z0-9]+)*$/);
            expect(d.category).toBe('mini_avatar');
            expect(RARITIES.has(d.rarity)).toBe(true);
            expect(typeof d.name).toBe('string');
            expect(d.description.length).toBeGreaterThan(10);
            expect(d.art.viewBox).toBe('0 0 64 64');
        }
    });

    it('F.3 nadirlikleri ve animasyonları: Taç epic+shimmer, Ejderha legendary+float', () => {
        for (const [name, rarity] of Object.entries(F3)) {
            if (rarity) expect(MINIS.find((d) => d.name === name).rarity).toBe(rarity);
        }
        const anims = (d) => {
            const s = new Set();
            walk(d.art.elements, (n) => n.anim && s.add(n.anim));
            return s;
        };
        expect(anims(MINIS.find((d) => d.name === 'Taç')).has('shimmer')).toBe(true);
        expect(anims(MINIS.find((d) => d.name === 'Ejderha')).has('float')).toBe(true);
    });

    it('animasyon yalnızca epic/legendary; anim taşıyan öğede transform yok, iç içe anim yok', () => {
        for (const d of MINIS) {
            walk(d.art.elements, (n, parentAnim) => {
                if (!n.anim) return;
                expect(['epic', 'legendary'], `${d.id} anim`).toContain(d.rarity);
                expect(ANIMS.has(n.anim)).toBe(true);
                expect(n.props.transform, `${d.id}: anim + transform çakışır`).toBeUndefined();
                expect(parentAnim, `${d.id}: iç içe anim`).toBeNull();
            });
        }
    });

    it('yalnız izinli tag/prop; renkler hex/url/none; transform sözdizimi; sayılar sonlu', () => {
        for (const d of MINIS) {
            walk(d.art.elements, (n) => {
                expect(TAGS.has(n.tag), `${d.id}: tag ${n.tag}`).toBe(true);
                for (const k of Object.keys(n)) expect(['tag', 'props', 'children', 'anim']).toContain(k);
                if (n.children) expect(n.tag).toBe('g');
                for (const [k, v] of Object.entries(n.props)) {
                    expect(PROPS.has(k), `${d.id}: prop ${k}`).toBe(true);
                    if (k === 'fill' || k === 'stroke') expect(isColor(v), `${d.id}: ${k}=${v}`).toBe(true);
                    if (k === 'transform') {
                        for (const part of v.match(/\w+\([^)]*\)/g)) expect(TF_PART.test(part), `${d.id}: ${v}`).toBe(true);
                        expect(v.replace(/\w+\([^)]*\)/g, '').trim()).toBe('');
                    }
                    if (k === 'opacity') expect(v > 0 && v <= 1).toBe(true);
                    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
                    if (k === 'd') expect(v).toMatch(/^[MLCQAZHVmlcqazhvs\d\s.,-]+$/);
                    if (k === 'strokeLinecap') expect(['round', 'butt', 'square']).toContain(v);
                    if (k === 'strokeLinejoin') expect(['round', 'miter', 'bevel']).toContain(v);
                }
            });
        }
    });

    it('defs: yalnız gradyan, izinli prop, geçerli duraklar; id\'ler dosya genelinde benzersiz', () => {
        const all = new Set();
        for (const d of MINIS) {
            for (const g of d.art.defs) {
                expect(DEF_PROPS[g.tag], `${d.id}: def ${g.tag}`).toBeDefined();
                for (const [k, v] of Object.entries(g.props)) {
                    expect(DEF_PROPS[g.tag].has(k), `${d.id}: ${g.id}.${k}`).toBe(true);
                    expect(v >= 0 && v <= 1).toBe(true);
                }
                expect(g.stops.length).toBeGreaterThanOrEqual(2);
                let prev = -1;
                for (const s of g.stops) {
                    expect(HEX.test(s.color)).toBe(true);
                    expect(s.offset).toBeGreaterThanOrEqual(prev);
                    expect(s.offset >= 0 && s.offset <= 1).toBe(true);
                    if (s.opacity !== undefined) expect(s.opacity >= 0 && s.opacity <= 1).toBe(true);
                    prev = s.offset;
                }
                expect(all.has(g.id), `yinelenen id ${g.id}`).toBe(false);
                all.add(g.id);
            }
        }
    });

    it('her url(#id) kendi tasarımının defs\'inde çözülüyor; kullanılmayan def yok', () => {
        for (const d of MINIS) {
            const ids = new Set(d.art.defs.map((g) => g.id));
            const used = new Set();
            walk(d.art.elements, (n) => {
                for (const k of ['fill', 'stroke']) {
                    const m = URL_REF.exec(n.props[k] || '');
                    if (m) {
                        expect(ids.has(m[1]), `${d.id}: çözülmeyen ${m[1]}`).toBe(true);
                        used.add(m[1]);
                    }
                }
            });
            for (const id of ids) expect(used.has(id), `${d.id}: kullanılmayan def ${id}`).toBe(true);
        }
    });

    it('çizim 64×64 alanın içinde kalıyor (yaklaşık sınır kutusu)', () => {
        for (const d of MINIS) {
            walk(d.art.elements, (n) => {
                const b = bounds(n);
                if (!b) return;
                expect(b[0], `${d.id} ${n.tag} sol`).toBeGreaterThanOrEqual(-0.5);
                expect(b[1], `${d.id} ${n.tag} üst`).toBeGreaterThanOrEqual(-0.5);
                expect(b[2], `${d.id} ${n.tag} sağ`).toBeLessThanOrEqual(64.5);
                expect(b[3], `${d.id} ${n.tag} alt`).toBeLessThanOrEqual(64.5);
            });
        }
    });

    it('nadirlik zenginliği: rare+ tasarımlar common ortalamasından daha detaylı', () => {
        const count = (d) => {
            let c = 0;
            walk(d.art.elements, () => { c++; });
            return c;
        };
        const avg = (r) => {
            const xs = MINIS.filter((d) => d.rarity === r).map(count);
            return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        expect(avg('legendary')).toBeGreaterThan(avg('common'));
        expect(avg('epic')).toBeGreaterThan(avg('common'));
    });
});
