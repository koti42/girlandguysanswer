import { describe, expect, it } from 'vitest';
import { ALLOWED_PROPS, ALLOWED_TAGS, BUST_VIEWBOX, buildBust, shade } from '../bust.js';
import { BODIES, CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, STYLES, defaultAvatar } from '../catalog.js';

/*
 * bust.js web ve mobilde (react-native-svg) aynı veriyi çiziyor: çıktının
 * yalnızca iki platformun da desteklediği etiket/prop'lardan oluştuğu ve
 * her stil kombinasyonunda geçerli olduğu burada güvenceye alınır.
 */

const PATH_D = /^[MLCQZHVA0-9 .,-]+$/;
const COLOR = /^(#[0-9A-Fa-f]{6}|none)$/;
const TRANSFORM = /^((translate|scale|rotate)\((-?\d+(\.\d+)? ?)+\) ?)+$/;
const NUMERIC = ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'strokeWidth', 'opacity'];

function walk(nodes, visit, depth = 0) {
    for (const n of nodes) {
        visit(n, depth);
        if (n.children) walk(n.children, visit, depth + 1);
    }
}

/** Ağacı denetler; ilk hatayı metin olarak döndürür (yoksa null). */
function validate(tree) {
    if (tree.viewBox !== BUST_VIEWBOX) return 'viewBox';
    if (!Array.isArray(tree.elements) || tree.elements.length < 10) return 'elements';
    let err = null;
    walk(tree.elements, (n, depth) => {
        if (err) return;
        if (depth > 2) err = 'derinlik';
        else if (!ALLOWED_TAGS.includes(n.tag)) err = `etiket ${n.tag}`;
        else if (!n.props || typeof n.props !== 'object') err = 'props';
        else if (n.children !== undefined && (!Array.isArray(n.children) || n.tag !== 'g')) err = 'children';
        else if (n.tag === 'g' && !n.children?.length) err = 'boş g';
        for (const [k, v] of Object.entries(n.props || {})) {
            if (err) break;
            if (!ALLOWED_PROPS.includes(k)) err = `prop ${k}`;
            else if (NUMERIC.includes(k) && !(typeof v === 'number' && Number.isFinite(v))) err = `${k}=${v}`;
            else if (k === 'd' && !(typeof v === 'string' && PATH_D.test(v) && /^M/.test(v))) err = `d=${v}`;
            else if ((k === 'fill' || k === 'stroke') && !COLOR.test(v)) err = `${k}=${v}`;
            else if (k === 'transform' && !TRANSFORM.test(v)) err = `transform=${v}`;
            else if (k === 'opacity' && (v < 0 || v > 1)) err = `opacity=${v}`;
        }
        // Şekil prop'ları eksiksiz.
        if (!err) {
            const p = n.props;
            if (n.tag === 'path' && !p.d) err = 'path d';
            if (n.tag === 'circle' && !(p.r > 0)) err = 'circle r';
            if (n.tag === 'ellipse' && !(p.rx > 0 && p.ry > 0)) err = 'ellipse rx/ry';
            if (n.tag === 'rect' && !(p.width > 0 && p.height > 0)) err = 'rect boyut';
            if (n.tag !== 'g' && p.fill === undefined) err = 'fill yok';
            // Yalnız kenar çizgili şekilde kenar rengi/kalınlığı olmalı.
            if (p.fill === 'none' && !(p.stroke && p.strokeWidth > 0)) err = 'görünmez şekil';
        }
    });
    return err;
}

const ids = (slot) => STYLES[slot].map((s) => s.id);

function allColors(tree) {
    const out = new Set();
    walk(tree.elements, (n) => {
        if (n.props.fill) out.add(n.props.fill.toUpperCase());
        if (n.props.stroke) out.add(n.props.stroke.toUpperCase());
    });
    return out;
}

describe('buildBust', () => {
    it('her saç × üst × aksesuar × vücut kombinasyonu geçerli, izinli eleman listesi üretir', () => {
        let count = 0;
        for (const body of BODIES.map((b) => b.id)) {
            for (const hair of ids('hair')) {
                for (const top of ids('top')) {
                    for (const acc of ids('acc')) {
                        const cfg = { ...defaultAvatar(), body, hair: { style: hair, color: count % 10 }, top: { style: top, color: count % 12 }, acc };
                        const err = validate(buildBust(cfg));
                        expect(err, `${body}/${hair}/${top}/${acc}`).toBeNull();
                        count++;
                    }
                }
            }
        }
        expect(count).toBe(2 * 8 * 5 * 8);
    });

    it('tüm ten, saç rengi ve kumaş renklerinde geçerli; renk çıktıda görünür', () => {
        SKIN_TONES.forEach((hex, skin) => {
            const t = buildBust({ ...defaultAvatar(), skin });
            expect(validate(t)).toBeNull();
            expect(allColors(t).has(hex.toUpperCase())).toBe(true);
        });
        HAIR_COLORS.forEach((hex, color) => {
            for (const style of ids('hair')) {
                const t = buildBust({ ...defaultAvatar(), hair: { style, color } });
                expect(validate(t)).toBeNull();
                expect(allColors(t).has(hex.toUpperCase()), `${style}/${color}`).toBe(true);
            }
        });
        CLOTH_COLORS.forEach((hex, color) => {
            for (const style of ids('top')) {
                const t = buildBust({ ...defaultAvatar(), top: { style, color } });
                expect(validate(t)).toBeNull();
                expect(allColors(t).has(hex.toUpperCase()), `${style}/${color}`).toBe(true);
            }
        });
    });

    it('her saç stili, üst giysi ve aksesuar görünür biçimde farklı çizilir', () => {
        for (const slot of ['hair', 'top']) {
            const outs = ids(slot).map((style) => JSON.stringify(buildBust({ ...defaultAvatar(), [slot]: { style, color: 2 } }).elements));
            expect(new Set(outs).size, slot).toBe(outs.length);
        }
        const accs = ids('acc').map((acc) => JSON.stringify(buildBust({ ...defaultAvatar(), acc }).elements));
        expect(new Set(accs).size).toBe(accs.length);
        // Vücut tipi siluette fark eder.
        expect(JSON.stringify(buildBust({ ...defaultAvatar(), body: 'kiz' }))).not.toBe(JSON.stringify(buildBust({ ...defaultAvatar(), body: 'erkek' })));
    });

    it('portrede görünmeyen parçalar (alt, ayakkabı, iz) çıktıyı değiştirmez', () => {
        const base = JSON.stringify(buildBust(defaultAvatar('female')));
        const other = { ...defaultAvatar('female'), bottom: { style: 'etek', color: 9 }, shoes: { style: 'neon', color: 2 }, trail: 'gokkusagi' };
        expect(JSON.stringify(buildBust(other))).toBe(base);
    });

    it('bozuk / eksik yapılandırmada çökmez, varsayılana düşer', () => {
        for (const bad of [null, undefined, 42, 'x', [], { hair: 'mohawk' }, { v: 9, skin: 99, top: { style: 'yok', color: -1 }, acc: '<script>' }]) {
            expect(validate(buildBust(bad))).toBeNull();
        }
        expect(JSON.stringify(buildBust(null, 'female'))).toBe(JSON.stringify(buildBust(defaultAvatar('female'))));
        expect(JSON.stringify(buildBust(undefined))).toBe(JSON.stringify(buildBust(defaultAvatar())));
    });

    it('saf ve deterministik: girdiyi değiştirmez, aynı girdiye aynı çıktı', () => {
        const cfg = Object.freeze({
            ...defaultAvatar('female'),
            hair: Object.freeze({ style: 'orgu', color: 5 }),
            top: Object.freeze({ style: 'ceket', color: 10 }),
            acc: 'gunes',
        });
        const a = buildBust(cfg);
        const b = buildBust(cfg);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(a.elements).not.toBe(b.elements);
    });

    it('şapka/bere altında tepe saç kütleleri (mohawk ibiği, topuz) çizilmez', () => {
        const crest = (acc) => JSON.stringify(buildBust({ ...defaultAvatar(), hair: { style: 'mohawk', color: 7 }, acc }));
        expect(crest('none')).toContain('L57.5 5');
        expect(crest('bere')).not.toContain('L57.5 5');
        expect(crest('sapka')).not.toContain('L57.5 5');
    });
});

describe('shade', () => {
    it('beyaza / siyaha karıştırır, geçersiz girdiyi olduğu gibi bırakır', () => {
        expect(shade('#808080', 0)).toBe('#808080');
        expect(shade('#808080', 1)).toBe('#FFFFFF');
        expect(shade('#808080', -1)).toBe('#000000');
        expect(shade('#FF0000', -0.5)).toBe('#800000');
        expect(shade('kırmızı', 0.3)).toBe('kırmızı');
    });
});
