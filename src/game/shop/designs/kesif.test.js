import { describe, it, expect } from 'vitest';
import { KESIF, KESIF_BADGES, KESIF_KIND_INFO, KESIF_KINDS, kesifSwatches } from './kesif.js';
import { FRAMES } from './frames.js';
import { MINIS } from './minis.js';
import { TITLES, ICONS } from './titles.js';
import { scanText } from '../../kesif/sim/city/citySafeData.js';

/*
 * Keşif Koleksiyonu veri sözleşmesi: 29 görünüm (+ 5 çerçeve, 6 mini avatar, 6 unvan = 46 öğe).
 * Web ve mobil (bayt bayt kopya) aynı veriyi çizer; oyun motoru `skin`i okur. Burada:
 * anahtar/yuva eşlemesi, F.2 etiket/prop beyaz listesi, skin şeması ve erişilebilirlik
 * kuralları (portal çifti parlaklık + ton farkı, alet sap/uç kontrastı), nadirlik/animasyon
 * kuralları ve aile güvenliği taraması doğrulanır.
 */

const ELEMENT_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g', 'polygon']);
const ELEMENT_PROPS = new Set([
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'opacity', 'transform',
]);
const DEF_PROPS = { linearGradient: new Set(['x1', 'y1', 'x2', 'y2']), radialGradient: new Set(['cx', 'cy', 'r', 'fx', 'fy']) };
const ANIMS = new Set(['spin', 'pulse', 'shimmer', 'float', 'twinkle']);
const RARITIES = new Set(['common', 'rare', 'epic', 'legendary']);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const URL_REF = /^url\(#([A-Za-z0-9_-]+)\)$/;
const KEY_PATTERN = /^[a-z_]{1,16}:[a-z0-9-]{1,40}$/;
const NUM = '-?\\d*\\.?\\d+';
const TF_PART = new RegExp(`^(translate\\(${NUM} ${NUM}\\)|rotate\\(${NUM} ${NUM} ${NUM}\\)|scale\\(${NUM}\\))$`);

/** Şartname §2.4 — anahtar, ad, nadirlik, açıklama (açıklamalar mağaza kataloğuyla birebir). */
const EXPECTED = [
    ['portal:nane-ferahi', 'Nane Ferahı', 'common'],
    ['portal:gul-kurusu', 'Gül Kurusu', 'common'],
    ['portal:okyanus-akintisi', 'Okyanus Akıntısı', 'rare'],
    ['portal:neon-sokak', 'Neon Sokak', 'rare'],
    ['portal:altin-kapi', 'Altın Kapı', 'epic'],
    ['portal:kuantum-isigi', 'Kuantum Işığı', 'legendary'],
    ['alet:cay-bahcesi', 'Çay Bahçesi', 'common'],
    ['alet:gunes-isigi', 'Gün Işığı', 'common'],
    ['alet:buz-mavisi', 'Buz Mavisi', 'rare'],
    ['alet:lale-kirmizisi', 'Lale Kırmızısı', 'rare'],
    ['alet:neon-serit', 'Neon Şerit', 'epic'],
    ['alet:yildiz-demiri', 'Yıldız Demiri', 'legendary'],
    ['asa:mercan', 'Mercan Kristal', 'common'],
    ['asa:gece-moru', 'Gece Moru', 'rare'],
    ['asa:zumrut-orman', 'Zümrüt Orman', 'rare'],
    ['asa:gokkusagi-isigi', 'Gökkuşağı Işığı', 'epic'],
    ['jet:gok-mavisi', 'Gök Mavisi İz', 'common'],
    ['jet:pembe-bulut', 'Pembe Bulut', 'rare'],
    ['jet:altin-kivilcim', 'Altın Kıvılcım', 'epic'],
    ['jet:yildiz-izi', 'Yıldız İzi', 'legendary'],
    ['arac:limonata', 'Limonata Kiti', 'common'],
    ['arac:gece-yolcusu', 'Gece Yolcusu', 'rare'],
    ['arac:gunes-batimi-turu', 'Gün Batımı Turu', 'rare'],
    ['arac:metro-esintisi', 'Metro Esintisi', 'epic'],
    ['arac:holo-kristal', 'Holo Kristal', 'epic'],
    ['arac:meridyen-yildizi', 'Meridyen Yıldızı', 'legendary'],
    ['gecis:neon-dalga', 'Neon Dalga', 'rare'],
    ['gecis:yildiz-yagmuru', 'Yıldız Yağmuru', 'epic'],
    ['gecis:aurora-gecidi', 'Aurora Geçidi', 'epic'],
];

const NEW_FRAMES = [
    ['frame:neon-meridyen', 'Neon Meridyen', 'epic'],
    ['frame:veri-cipi', 'Veri Çipi', 'rare'],
    ['frame:portal-halkasi', 'Portal Halkası', 'epic'],
    ['frame:gece-pazari', 'Gece Pazarı', 'rare'],
    ['frame:diyar-isigi', 'Diyar Işığı', 'legendary'],
];
const NEW_MINIS = [
    ['mini:minik-cip', 'Minik Çip', 'common'],
    ['mini:kurye-robotu', 'Kurye Robotu', 'common'],
    ['mini:suzulen-tahta', 'Süzülen Tahta', 'rare'],
    ['mini:neon-kedi', 'Neon Kedi', 'rare'],
    ['mini:portal-minik', 'Portal Minik', 'epic'],
    ['mini:holo-balina', 'Holo Balina', 'legendary'],
];
const NEW_TITLES = [
    ['title:neon-gezgin', 'Neon Gezgin', 'common'],
    ['title:portal-ustasi', 'Portal Ustası', 'epic'],
    ['title:sehir-kuryesi', 'Şehir Kuryesi', 'common'],
    ['title:cip-avcisi', 'Çip Avcısı', 'rare'],
    ['title:usta-mimar', 'Usta Mimar', 'rare'],
    ['title:diyar-kasifi', 'Diyar Kâşifi', 'legendary'],
];

/* ---------------- renk matematiği ---------------- */

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = (h) => {
    const [r, g, b] = rgb(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
/** CIE L* (0–100) */
const lstar = (h) => {
    const y = luminance(h);
    return y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
};
const hue = (h) => {
    const [r, g, b] = rgb(h);
    const max = Math.max(r, g, b);
    const d = max - Math.min(r, g, b);
    if (d === 0) return 0;
    let x;
    if (max === r) x = ((g - b) / d) % 6;
    else if (max === g) x = (b - r) / d + 2;
    else x = (r - g) / d + 4;
    return (x * 60 + 360) % 360;
};
const hueGap = (a, b) => {
    const d = Math.abs(hue(a) - hue(b));
    return Math.min(d, 360 - d);
};

const walk = (nodes, fn, parentAnim = null) => {
    for (const n of nodes) {
        fn(n, parentAnim);
        if (n.children) walk(n.children, fn, parentAnim || n.anim || null);
    }
};

const allDesigns = [...FRAMES, ...MINIS, ...TITLES, ...KESIF];
const byId = new Map(allDesigns.map((d) => [d.id, d]));

describe('KESIF — katalog', () => {
    it('29 görünüm, şartnamedeki anahtar/ad/nadirlik sırasıyla', () => {
        expect(KESIF).toHaveLength(29);
        expect(KESIF.map((d) => [d.id, d.name, d.rarity])).toEqual(EXPECTED);
    });

    it('yuva sayıları: portal 6, alet 6, asa 4, jet 4, araç 6, geçiş 3', () => {
        const count = (k) => KESIF.filter((d) => d.kind === k).length;
        expect(KESIF_KINDS).toEqual(['portal', 'alet', 'asa', 'jet', 'arac', 'gecis']);
        expect(KESIF_KINDS.map(count)).toEqual([6, 6, 4, 4, 6, 3]);
    });

    it('anahtar deseni, önek = kind = yuva; anahtarlar tüm tasarımlarda benzersiz', () => {
        const ids = allDesigns.map((d) => d.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const d of KESIF) {
            expect(d.id).toMatch(KEY_PATTERN);
            expect(d.category).toBe('kesif');
            expect(KESIF_KINDS).toContain(d.kind);
            expect(d.id.startsWith(`${d.kind}:`)).toBe(true);
            expect(Object.keys(d).sort()).toEqual(['art', 'category', 'description', 'id', 'kind', 'name', 'rarity', 'skin']);
            expect(RARITIES.has(d.rarity)).toBe(true);
        }
    });

    it('metin sınırları: ad ≤ 80, açıklama 10–120 karakter; her tür için arayüz metni var', () => {
        for (const d of [...KESIF, ...NEW_FRAMES, ...NEW_MINIS, ...NEW_TITLES].map((x) => (Array.isArray(x) ? byId.get(x[0]) : x))) {
            expect(d.name.length, d.id).toBeLessThanOrEqual(80);
            expect(d.description.length, d.id).toBeGreaterThan(10);
            expect(d.description.length, d.id).toBeLessThanOrEqual(120);
        }
        for (const k of KESIF_KINDS) {
            expect(KESIF_KIND_INFO[k].label.length).toBeGreaterThan(2);
            expect(KESIF_KIND_INFO[k].hint.length).toBeGreaterThan(10);
        }
    });

    it('rozetle açılan öğelerin rozet adları kayıtlı (18 rozet)', () => {
        expect(Object.keys(KESIF_BADGES)).toHaveLength(18);
        for (const k of ['kesif_neon_ilk_is', 'kesif_neon_cip_60', 'kesif_populer_mimar']) expect(KESIF_BADGES[k]).toBeTruthy();
    });

    it('veri JSON\'a kayıpsız serileşir (mobil kopyayla paylaşılır)', () => {
        expect(JSON.parse(JSON.stringify(KESIF))).toEqual(KESIF);
    });
});

describe('Keşif dalgası — 46 öğe', () => {
    it('5 çerçeve + 6 mini avatar + 6 unvan şartnamedeki ad ve nadirlikle kayıtlı', () => {
        for (const [id, name, rarity] of [...NEW_FRAMES, ...NEW_MINIS, ...NEW_TITLES]) {
            const d = byId.get(id);
            expect(d, id).toBeDefined();
            expect(d.name).toBe(name);
            expect(d.rarity).toBe(rarity);
        }
        expect(NEW_FRAMES.length + NEW_MINIS.length + NEW_TITLES.length + KESIF.length).toBe(46);
    });

    it('yeni unvan ikonları kayıtlı ve eskilerden farklı', () => {
        const icons = TITLES.map((t) => t.style.icon);
        expect(new Set(icons).size).toBe(icons.length);
        for (const [id] of NEW_TITLES) expect(ICONS[byId.get(id).style.icon]).toBeDefined();
    });
});

describe('KESIF — mağaza önizlemesi (art)', () => {
    it('saf veri şeması: yalnız izinli tag/prop, hex/url/none renk, izinli transform, sonlu sayılar', () => {
        for (const d of KESIF) {
            expect(d.art.viewBox, d.id).toBe('0 0 64 64');
            expect(Object.keys(d.art).sort()).toEqual(['defs', 'elements', 'viewBox']);
            let nodes = 0;
            walk(d.art.elements, () => { nodes++; });
            expect(nodes, d.id).toBeGreaterThan(8);
            walk(d.art.elements, (n) => {
                expect(ELEMENT_TAGS.has(n.tag), `${d.id}: tag ${n.tag}`).toBe(true);
                for (const k of Object.keys(n)) expect(['tag', 'props', 'children', 'anim']).toContain(k);
                if (n.children) expect(n.tag).toBe('g');
                for (const [k, v] of Object.entries(n.props)) {
                    expect(ELEMENT_PROPS.has(k), `${d.id}: prop ${k}`).toBe(true);
                    expect(v === undefined || v === null || Number.isNaN(v), `${d.id}: ${k} boş`).toBe(false);
                    if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
                    if (k === 'fill' || k === 'stroke') expect(v === 'none' || HEX.test(v) || URL_REF.test(v), `${d.id}: ${k}=${v}`).toBe(true);
                    if (k === 'opacity') expect(v > 0 && v <= 1, `${d.id}: opacity ${v}`).toBe(true);
                    if (k === 'transform') {
                        for (const part of v.match(/\w+\([^)]*\)/g)) expect(TF_PART.test(part), `${d.id}: ${v}`).toBe(true);
                        expect(v.replace(/\w+\([^)]*\)/g, '').trim()).toBe('');
                    }
                    if (k === 'd') {
                        expect(v).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/);
                        expect(v).not.toMatch(/NaN|Infinity|e[+-]?\d/);
                    }
                    if (k === 'points') expect(v).toMatch(/^[0-9.,\s-]+$/);
                    if (k === 'strokeLinecap') expect(['round', 'butt', 'square']).toContain(v);
                    if (k === 'strokeLinejoin') expect(['round', 'miter', 'bevel']).toContain(v);
                }
            });
        }
    });

    it('defs: yalnız gradyan, izinli prop, geçerli duraklar; id\'ler tüm dosyada benzersiz; url(#) çözülür ve kullanılır', () => {
        const all = new Set();
        for (const d of KESIF) {
            const ids = new Set();
            for (const g of d.art.defs) {
                expect(DEF_PROPS[g.tag], `${d.id}: def ${g.tag}`).toBeDefined();
                expect(g.id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
                for (const [k, v] of Object.entries(g.props)) {
                    expect(DEF_PROPS[g.tag].has(k), `${d.id}: ${g.id}.${k}`).toBe(true);
                    expect(v >= 0 && v <= 1, `${d.id}: ${g.id}.${k}=${v}`).toBe(true);
                }
                expect(g.stops.length).toBeGreaterThanOrEqual(2);
                let prev = -1;
                for (const s of g.stops) {
                    expect(HEX.test(s.color)).toBe(true);
                    expect(s.offset).toBeGreaterThanOrEqual(prev);
                    expect(s.offset <= 1).toBe(true);
                    if (s.opacity !== undefined) expect(s.opacity >= 0 && s.opacity <= 1).toBe(true);
                    prev = s.offset;
                }
                expect(all.has(g.id), `yinelenen id ${g.id}`).toBe(false);
                all.add(g.id);
                ids.add(g.id);
            }
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

    it('animasyon yalnız epic/legendary; anim taşıyan öğede transform yok, iç içe anim yok', () => {
        for (const d of KESIF) {
            let count = 0;
            walk(d.art.elements, (n, parentAnim) => {
                if (!n.anim) return;
                count++;
                expect(['epic', 'legendary'], `${d.id}: anim`).toContain(d.rarity);
                expect(ANIMS.has(n.anim)).toBe(true);
                expect(n.props.transform, `${d.id}: anim + transform`).toBeUndefined();
                expect(parentAnim, `${d.id}: iç içe anim`).toBeNull();
            });
            if (d.rarity === 'epic' || d.rarity === 'legendary') expect(count, `${d.id}: epic/legendary animasyonsuz`).toBeGreaterThan(0);
            else expect(count).toBe(0);
        }
    });

    it('çizim 64×64 alanın içinde (dönüşümsüz şekiller; yaklaşık sınır kutusu)', () => {
        // Dönüşümlü grupların içi yerel koordinattadır: yalnız dönüşümsüz zincirdeki şekiller denetlenir.
        const flat = (nodes, out = []) => {
            for (const n of nodes) {
                if (n.props?.transform) continue;
                out.push(n);
                if (n.children) flat(n.children, out);
            }
            return out;
        };
        for (const d of KESIF) {
            flat(d.art.elements).forEach((n) => {
                const p = n.props;
                const sw = (p.strokeWidth || 0) / 2;
                let b = null;
                if (n.tag === 'circle') b = [p.cx - p.r - sw, p.cy - p.r - sw, p.cx + p.r + sw, p.cy + p.r + sw];
                else if (n.tag === 'ellipse') b = [p.cx - p.rx - sw, p.cy - p.ry - sw, p.cx + p.rx + sw, p.cy + p.ry + sw];
                else if (n.tag === 'rect') b = [p.x - sw, p.y - sw, p.x + p.width + sw, p.y + p.height + sw];
                if (!b) return;
                // Hale/parıltı daireleri (gradyan dolgu) kenara taşabilir: yalnız konturlu şekiller sınırlanır
                if (/^url\(/.test(String(p.fill)) && !p.stroke) return;
                expect(b[0], `${d.id} ${n.tag} sol`).toBeGreaterThanOrEqual(-0.5);
                expect(b[1], `${d.id} ${n.tag} üst`).toBeGreaterThanOrEqual(-0.5);
                expect(b[2], `${d.id} ${n.tag} sağ`).toBeLessThanOrEqual(64.5);
                expect(b[3], `${d.id} ${n.tag} alt`).toBeLessThanOrEqual(64.5);
            });
        }
    });

    it('nadirlik zenginliği: legendary/epic önizlemeler common ortalamasından daha detaylı', () => {
        const count = (d) => {
            let c = 0;
            walk(d.art.elements, () => { c++; });
            return c;
        };
        const avg = (r) => {
            const xs = KESIF.filter((d) => d.rarity === r).map(count);
            return xs.reduce((a, b) => a + b, 0) / xs.length;
        };
        expect(avg('legendary')).toBeGreaterThan(avg('common'));
        expect(avg('epic')).toBeGreaterThan(avg('common'));
    });
});

describe('KESIF — skin şeması (oyun motoru sözleşmesi)', () => {
    const hexes = (o) => Object.values(o).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : v && typeof v === 'object' ? hexes(v) : []));
    const isHex = (v) => typeof v === 'string' && HEX.test(v);

    it('her yuvanın skin şeması: yalnız bilinen alanlar, renkler #RRGGBB, sayılar aralıkta', () => {
        for (const d of KESIF) {
            const s = d.skin;
            const keys = Object.keys(s).sort();
            switch (d.kind) {
                case 'portal':
                    expect(keys, d.id).toEqual(['a', 'b', 'body', 'trim']);
                    expect(Object.keys(s.a).sort()).toEqual(['c', 'c2']);
                    expect(Object.keys(s.b).sort()).toEqual(['c', 'c2']);
                    break;
                case 'alet':
                    expect(keys, d.id).toEqual(['palette']);
                    expect(Object.keys(s.palette).sort()).toEqual(['dark', 'edge', 'glow', 'handle', 'handleDark', 'head', 'light', 'metal', 'rough', 'wrap']);
                    expect(s.palette.glow === null || isHex(s.palette.glow)).toBe(true);
                    for (const k of ['rough', 'metal']) {
                        expect(typeof s.palette[k]).toBe('number');
                        expect(s.palette[k]).toBeGreaterThanOrEqual(0);
                        expect(s.palette[k]).toBeLessThanOrEqual(1);
                    }
                    break;
                case 'asa':
                    expect(isHex(s.crystal)).toBe(true);
                    expect(keys.every((k) => ['crystal', 'ring', 'cycle'].includes(k)), d.id).toBe(true);
                    if (s.cycle !== undefined) expect(s.cycle).toBe(true);
                    break;
                case 'jet':
                    expect(s.flame).toHaveLength(3);
                    expect(isHex(s.smoke)).toBe(true);
                    expect(keys.every((k) => ['flame', 'smoke', 'tank', 'spark'].includes(k)), d.id).toBe(true);
                    if (s.spark !== undefined) expect(s.spark).toBe(true);
                    break;
                case 'arac':
                    expect(keys.every((k) => ['body', 'accent', 'neon', 'under', 'wheels', 'rim', 'nitro', 'cycle'].includes(k)), d.id).toBe(true);
                    expect([0, 1, 2]).toContain(s.under);
                    expect([0, 1, 2, 3]).toContain(s.wheels);
                    if (s.nitro) expect(s.nitro).toHaveLength(2);
                    if (s.cycle !== undefined) expect(s.cycle).toBe(true);
                    break;
                case 'gecis':
                    expect(s.ring).toHaveLength(2);
                    expect(keys.every((k) => ['ring', 'spark'].includes(k)), d.id).toBe(true);
                    if (s.spark !== undefined) expect(isHex(s.spark)).toBe(true);
                    break;
                default:
                    throw new Error(`bilinmeyen tür ${d.kind}`);
            }
            for (const h of hexes(s)) expect(isHex(h), `${d.id}: ${h}`).toBe(true);
        }
    });

    it('portal çifti: CIE L* farkı ≥ 25, ton farkı ≥ 60°, her iki portal görünür (L* ≥ 40)', () => {
        for (const d of KESIF.filter((x) => x.kind === 'portal')) {
            const { a, b } = d.skin;
            expect(Math.abs(lstar(a.c) - lstar(b.c)), `${d.id} parlaklık`).toBeGreaterThanOrEqual(25);
            expect(hueGap(a.c, b.c), `${d.id} ton`).toBeGreaterThanOrEqual(60);
            expect(lstar(a.c), `${d.id} a görünürlük`).toBeGreaterThanOrEqual(40);
            expect(lstar(b.c), `${d.id} b görünürlük`).toBeGreaterThanOrEqual(40);
        }
    });

    it('alet: uç ile sap arasında ≥ 3:1 kontrast; sargı sapla karışmaz', () => {
        for (const d of KESIF.filter((x) => x.kind === 'alet')) {
            const p = d.skin.palette;
            expect(contrast(p.head, p.handle), `${d.id} uç/sap`).toBeGreaterThanOrEqual(3);
            expect(contrast(p.light, p.dark), `${d.id} açık/koyu ton`).toBeGreaterThanOrEqual(1.4);
        }
    });

    it('araç: gövde ile şerit ayırt edilir; asa/jet/geçiş renkleri birbirinden farklı', () => {
        for (const d of KESIF.filter((x) => x.kind === 'arac')) expect(contrast(d.skin.body, d.skin.accent), d.id).toBeGreaterThanOrEqual(1.25);
        for (const d of KESIF.filter((x) => x.kind === 'gecis')) expect(new Set(d.skin.ring).size).toBe(2);
        for (const d of KESIF.filter((x) => x.kind === 'jet')) expect(new Set(d.skin.flame).size).toBe(3);
    });

    it('kesifSwatches: en çok 3 geçerli renk; bilinmeyen girdide boş', () => {
        for (const d of KESIF) {
            const sw = kesifSwatches(d);
            expect(sw.length, d.id).toBeGreaterThanOrEqual(1);
            expect(sw.length).toBeLessThanOrEqual(3);
            sw.forEach((c) => expect(c).toMatch(HEX));
        }
        expect(kesifSwatches(null)).toEqual([]);
        expect(kesifSwatches({ kind: 'x', skin: {} })).toEqual([]);
    });
});

describe('Keşif dalgası — aile güvenliği', () => {
    const wave = [...KESIF, ...NEW_FRAMES.map(([id]) => byId.get(id)), ...NEW_MINIS.map(([id]) => byId.get(id)), ...NEW_TITLES.map(([id]) => byId.get(id))];

    it('46 öğenin ad, açıklama ve unvan metni citySafe taramasından (tam kip, gevşek dahil) temiz çıkar', () => {
        expect(wave).toHaveLength(46);
        for (const d of wave) {
            for (const text of [d.name, d.description, d.style?.text].filter(Boolean)) {
                for (const opts of [{}, { loose: true }]) expect(scanText(text, opts), `${d.id}: ${text}`).toEqual([]);
            }
        }
    });

    it('rozet adları ve tür metinleri de temiz; kullanıcı metninde silah sözcüğü yok', () => {
        for (const v of Object.values(KESIF_BADGES)) expect(scanText(v), v).toEqual([]);
        for (const info of Object.values(KESIF_KIND_INFO)) {
            for (const t of [info.label, info.title, info.hint]) expect(scanText(t), t).toEqual([]);
        }
        const text = wave.map((d) => `${d.name} ${d.description}`).join(' ').toLocaleLowerCase('tr');
        for (const banned of ['silah', 'tüfek', 'bıçak', 'kılıç', 'kurşun', 'bomba', 'ölüm', 'kumar', 'gacha']) expect(text).not.toContain(banned);
        // "kan" yalnız bütün sözcük olarak yasak ("kanyon" vb. serbest)
        expect(text).not.toMatch(/(^|[^a-zçğıöşü])kan([^a-zçğıöşü]|$)/);
    });
});
