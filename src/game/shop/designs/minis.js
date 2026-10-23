/**
 * Jeton Mağazası — Mini Avatarlar (SPEC_V2 §F.2 / §F.3).
 *
 * Saf veri: web (React DOM SVG) ve mobil (react-native-svg) aynı diziyi
 * aynı şekilde çizer. Yalnızca F.2'deki tag/prop kümesi kullanılır
 * (filter/mask/clipPath/pattern/text yok). Gradyanlar objectBoundingBox
 * birimlerinde (0..1). `anim` taşıyan öğelerde `transform` YOK — CSS/Animated
 * dönüşümü SVG transform özniteliğini ezeceği için animasyon her zaman
 * dönüşümsüz bir sarmalayıcı `g` üzerindedir.
 *
 * Stil ailesi: 64×64, şeffaf zemin, yumuşak gradyanlı dolgu + ince koyu
 * mor kontur (#2A2142), sol üstten parlama, altta yumuşak gölge.
 * Nadirlik zenginliği: common sade · rare + hale ve pırıltı ·
 * epic + animasyon ve mücevher detayı · legendary + aura, çoklu animasyon.
 *
 * Aşağıdaki küçük yardımcılar yalnızca modül yüklenirken düz veri üretir;
 * dışa açılan MINIS tamamen serileştirilebilir JSON'dur.
 */

const OL = '#2A2142'; // kontur
const SW = 2.2; // ana kontur kalınlığı
const SW_D = 1.5; // detay kontur kalınlığı

/* ---------- yardımcılar (düz veri üretir) ---------- */

const r2 = (n) => Math.round(n * 100) / 100;

const stop = (offset, color, opacity) =>
    opacity === undefined ? { offset, color } : { offset, color, opacity };

const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => ({
    tag: 'linearGradient', id, props: { x1, y1, x2, y2 }, stops,
});

const rad = (id, stops, cx = 0.5, cy = 0.5, r = 0.5, fx, fy) => ({
    tag: 'radialGradient',
    id,
    props: fx === undefined ? { cx, cy, r } : { cx, cy, r, fx, fy },
    stops,
});

const el = (tag, props, children, anim) => {
    const node = { tag, props };
    if (children) node.children = children;
    if (anim) node.anim = anim;
    return node;
};

const shadow = (rx = 17, cy = 60.5, ry = 2.6) =>
    el('ellipse', { cx: 32, cy, rx, ry, fill: OL, opacity: 0.16 });

/** 4 köşeli pırıltı yıldızı */
const sparkPath = (cx, cy, r) => {
    const k = r * 0.22;
    return `M${r2(cx)} ${r2(cy - r)} Q${r2(cx + k)} ${r2(cy - k)} ${r2(cx + r)} ${r2(cy)} `
        + `Q${r2(cx + k)} ${r2(cy + k)} ${r2(cx)} ${r2(cy + r)} `
        + `Q${r2(cx - k)} ${r2(cy + k)} ${r2(cx - r)} ${r2(cy)} `
        + `Q${r2(cx - k)} ${r2(cy - k)} ${r2(cx)} ${r2(cy - r)} Z`;
};
const spark = (cx, cy, r, fill, opacity = 1) =>
    el('path', { d: sparkPath(cx, cy, r), fill, opacity });

/** Göz: koyu bebek + iki parlama */
const eye = (cx, cy, rx = 3, ry = 3.6) => [
    el('ellipse', { cx, cy, rx, ry, fill: OL }),
    el('circle', { cx: r2(cx + rx * 0.35), cy: r2(cy - ry * 0.38), r: r2(rx * 0.42), fill: '#FFFFFF' }),
    el('circle', { cx: r2(cx - rx * 0.35), cy: r2(cy + ry * 0.4), r: r2(rx * 0.18), fill: '#FFFFFF', opacity: 0.85 }),
];

const blush = (cx, cy, color = '#FF7E8E', rx = 3.2, ry = 1.9) =>
    el('ellipse', { cx, cy, rx, ry, fill: color, opacity: 0.55 });

/** Yalnızca mutlak M/L/C/Q/Z komutlu yolu dikey eksende (x → 64 − x) aynalar */
const mirror = (d) => d.replace(/(-?\d*\.?\d+)[ ,](-?\d*\.?\d+)/g, (_m, x, y) => `${r2(64 - Number(x))} ${y}`);

/** Deterministik sözde rastgele (simit susamları için) */
const lcg = (seed) => {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
};

/* ---------- simit geometrisi ---------- */

const SIMIT = { cx: 32, cy: 33, rxO: 25, ryO: 20, rxI: 13, ryI: 9 };

const ringPath = (cx, cy, rxO, ryO, rxI, ryI) =>
    // dış saat yönü, iç ters yönde → nonzero kuralıyla delik
    `M${cx - rxO} ${cy} A${rxO} ${ryO} 0 1 1 ${cx + rxO} ${cy} A${rxO} ${ryO} 0 1 1 ${cx - rxO} ${cy} Z `
    + `M${cx - rxI} ${cy} A${rxI} ${ryI} 0 1 0 ${cx + rxI} ${cy} A${rxI} ${ryI} 0 1 0 ${cx - rxI} ${cy} Z`;

const simitTwists = () => {
    const out = [];
    const { cx, cy } = SIMIT;
    const n = 14;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        // iç kenardan dış kenara eğik bir burgu çizgisi
        const p0 = [cx + ca * (SIMIT.rxI + 1.4), cy + sa * (SIMIT.ryI + 1.2)];
        const p2 = [cx + Math.cos(a + 0.36) * (SIMIT.rxO - 1.4), cy + Math.sin(a + 0.36) * (SIMIT.ryO - 1.2)];
        const pm = [cx + Math.cos(a + 0.12) * ((SIMIT.rxO + SIMIT.rxI) / 2), cy + Math.sin(a + 0.12) * ((SIMIT.ryO + SIMIT.ryI) / 2)];
        out.push(el('path', {
            d: `M${r2(p0[0])} ${r2(p0[1])} Q${r2(pm[0])} ${r2(pm[1])} ${r2(p2[0])} ${r2(p2[1])}`,
            fill: 'none', stroke: '#9C4F1E', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.45,
        }));
    }
    return out;
};

const simitSesame = () => {
    const rnd = lcg(20261003);
    const out = [];
    const { cx, cy } = SIMIT;
    const n = 40;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rnd() * 0.25;
        const t = 0.12 + rnd() * 0.76; // halka kalınlığı boyunca
        const rx = SIMIT.rxI + 1.4 + t * (SIMIT.rxO - SIMIT.rxI - 2.8);
        const ry = SIMIT.ryI + 1.2 + t * (SIMIT.ryO - SIMIT.ryI - 2.4);
        const x = cx + Math.cos(a) * rx;
        const y = cy + Math.sin(a) * ry;
        const rot = (a * 180) / Math.PI + 90 + (rnd() - 0.5) * 70;
        out.push(el('ellipse', {
            cx: r2(x), cy: r2(y), rx: 1.25, ry: 0.62,
            fill: '#FFF2D2',
            transform: `rotate(${r2(rot)} ${r2(x)} ${r2(y)})`,
        }));
    }
    return out;
};

/* Zümrüdüanka kanat yolları (sol; sağ taraf mirror ile) */
const WING_O = 'M29 26.6 C22.4 19.6 14.6 11.6 5 5 C5.2 10.6 6.4 14.6 8.8 17.6 L3.6 19.6 C5.6 22.8 8 24.6 11 25.6 L6.6 29.6 C9.4 31.8 12.4 32.6 15.4 32.6 L12.8 37.4 C16 38.6 19.4 38.2 22 36.6 L21.8 41.6 C24.8 40 27.2 37.8 29 35.4 Z';
const WING_I = 'M29 29.6 C24.6 26.6 20 23.6 15.6 21.2 C15.4 23.6 16.2 25.4 17.8 26.6 L14.4 28.6 C16.4 30.4 18.4 31 20.6 31 L19.2 34.6 C22 35.2 24.6 34.6 26.4 33.2 L29 33 Z';
const WING_V = 'M26.6 27.4 C20.6 23.2 15.6 20.4 11.6 18.6 M26 30.4 C20 28.4 15 27.4 10.6 27.4 M26.4 33.6 C22.4 34 19.4 34.8 16.6 35.8';

/* ---------- tasarımlar ---------- */

export const MINIS = [
    /* 1 ─ Meraklı Kedi ───────────────────────────────────────── */
    {
        id: 'mini:merakli-kedi',
        category: 'mini_avatar',
        name: 'Meraklı Kedi',
        rarity: 'common',
        description: 'Başını yana eğmiş, her soruya kulak kabartan gümüş tekir.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('kd-fur', [stop(0, '#E4E8F4'), stop(0.6, '#B9C0D6'), stop(1, '#8C94B2')], 0.42, 0.3, 0.78),
                rad('kd-iris', [stop(0, '#C8F27A'), stop(1, '#5DBA3C')], 0.5, 0.6, 0.6),
            ],
            elements: [
                shadow(16),
                el('g', { transform: 'rotate(-8 32 38)' }, [
                    el('path', { d: 'M14 30 L12 9 L29 18 Z', fill: 'url(#kd-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                    el('path', { d: 'M16.5 25 L15.6 14 L24.5 18.6 Z', fill: '#FF9EAA' }),
                    el('path', { d: 'M50 30 L52 9 L35 18 Z', fill: 'url(#kd-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                    el('path', { d: 'M47.5 25 L48.4 14 L39.5 18.6 Z', fill: '#FF9EAA' }),
                    el('ellipse', { cx: 32, cy: 38, rx: 22, ry: 18.5, fill: 'url(#kd-fur)', stroke: OL, strokeWidth: SW }),
                    el('path', { d: 'M32 20.5 L32 26.4 M26.2 21.4 L27.8 26.4 M37.8 21.4 L36.2 26.4', fill: 'none', stroke: '#6B7394', strokeWidth: 2.1, strokeLinecap: 'round' }),
                    el('path', { d: 'M10.8 34.6 Q13.6 34.6 15.6 36 M11 39.6 Q13.4 39.4 15 40.4 M53.2 34.6 Q50.4 34.6 48.4 36 M53 39.6 Q50.6 39.4 49 40.4', fill: 'none', stroke: '#6B7394', strokeWidth: 1.7, strokeLinecap: 'round' }),
                    el('ellipse', { cx: 32, cy: 46, rx: 9.5, ry: 6.4, fill: '#FFF4E6' }),
                    el('ellipse', { cx: 21, cy: 28.6, rx: 5, ry: 2.6, fill: '#FFFFFF', opacity: 0.55, transform: 'rotate(-20 21 28.6)' }),
                    el('ellipse', { cx: 23.5, cy: 37, rx: 4.3, ry: 5.2, fill: OL }),
                    el('ellipse', { cx: 40.5, cy: 37, rx: 4.3, ry: 5.2, fill: OL }),
                    el('ellipse', { cx: 23.6, cy: 38.2, rx: 3, ry: 3.5, fill: 'url(#kd-iris)' }),
                    el('ellipse', { cx: 40.4, cy: 38.2, rx: 3, ry: 3.5, fill: 'url(#kd-iris)' }),
                    el('ellipse', { cx: 23.6, cy: 38.4, rx: 1.3, ry: 2.6, fill: OL }),
                    el('ellipse', { cx: 40.4, cy: 38.4, rx: 1.3, ry: 2.6, fill: OL }),
                    el('circle', { cx: 25.1, cy: 35.2, r: 1.6, fill: '#FFFFFF' }),
                    el('circle', { cx: 42, cy: 35.2, r: 1.6, fill: '#FFFFFF' }),
                    el('circle', { cx: 22.3, cy: 40, r: 0.7, fill: '#FFFFFF', opacity: 0.85 }),
                    el('circle', { cx: 39.2, cy: 40, r: 0.7, fill: '#FFFFFF', opacity: 0.85 }),
                    el('path', { d: 'M29.8 42.6 L34.2 42.6 L32 45 Z', fill: '#FF7A8A', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                    el('path', { d: 'M32 45 Q30.6 47.6 28 46.6 M32 45 Q33.4 47.6 36 46.6', fill: 'none', stroke: OL, strokeWidth: 1.4, strokeLinecap: 'round' }),
                    el('path', { d: 'M13 42.5 L21 43.4 M13.6 47.4 L21 45.6 M51 42.5 L43 43.4 M50.4 47.4 L43 45.6', fill: 'none', stroke: OL, strokeWidth: 1, strokeLinecap: 'round', opacity: 0.7 }),
                    blush(17.5, 44),
                    blush(46.5, 44),
                ]),
                // merak işareti: soru-cevap topluluğuna selam
                el('path', { d: 'M51.5 7.8 C51.8 4.2 58.4 4 58.4 7.6 C58.4 10.2 55 10.4 55 13.2', fill: 'none', stroke: '#FF6B6B', strokeWidth: 2.4, strokeLinecap: 'round' }),
                el('circle', { cx: 55, cy: 16.8, r: 1.4, fill: '#FF6B6B' }),
            ],
        },
    },

    /* 2 ─ Tilki ───────────────────────────────────────────────── */
    {
        id: 'mini:tilki',
        category: 'mini_avatar',
        name: 'Tilki',
        rarity: 'common',
        description: 'Kurnaz bakışlı, cevabı her zaman bir adım önden bilen tilki.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                lin('tk-fur', [stop(0, '#FFA45A'), stop(1, '#E35F26')]),
                lin('tk-ear', [stop(0, '#FF9C50'), stop(1, '#EA6A2C')]),
            ],
            elements: [
                shadow(14),
                el('path', { d: 'M15 32 L10 6 L29 19 Z', fill: 'url(#tk-ear)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M11.3 12.6 L10.4 7.6 L16.6 11.6 Z', fill: '#4A2C3C' }),
                el('path', { d: 'M16.8 27 L14 13.6 L24.4 20.4 Z', fill: '#FFE6CF' }),
                el('path', { d: 'M49 32 L54 6 L35 19 Z', fill: 'url(#tk-ear)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M52.7 12.6 L53.6 7.6 L47.4 11.6 Z', fill: '#4A2C3C' }),
                el('path', { d: 'M47.2 27 L50 13.6 L39.6 20.4 Z', fill: '#FFE6CF' }),
                el('path', {
                    d: 'M32 57.5 C25 57.5 9.5 47 8.5 34.5 C7.8 24.5 18 18 32 18 C46 18 56.2 24.5 55.5 34.5 C54.5 47 39 57.5 32 57.5 Z',
                    fill: 'url(#tk-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round',
                }),
                el('path', {
                    d: 'M32 56.3 C26 56.3 14.5 49 10.6 39.4 C17 40.2 25 43.2 32 49.6 C39 43.2 47 40.2 53.4 39.4 C49.5 49 38 56.3 32 56.3 Z',
                    fill: '#FFF6EC',
                }),
                el('path', { d: 'M32 22 C30 27 30 31 32 34 C34 31 34 27 32 22 Z', fill: '#FFC08A', opacity: 0.7 }),
                el('ellipse', { cx: 20, cy: 28, rx: 5, ry: 2.6, fill: '#FFFFFF', opacity: 0.3, transform: 'rotate(-18 20 28)' }),
                // kurnaz badem gözler
                el('path', { d: 'M18.4 35.4 C20.6 31.6 25.6 31.4 27.6 35 C25.4 37.8 20.8 38 18.4 35.4 Z', fill: OL }),
                el('circle', { cx: 24.6, cy: 34.1, r: 1.25, fill: '#FFFFFF' }),
                el('path', { d: 'M45.6 35.4 C43.4 31.6 38.4 31.4 36.4 35 C38.6 37.8 43.2 38 45.6 35.4 Z', fill: OL }),
                el('circle', { cx: 42.6, cy: 34.1, r: 1.25, fill: '#FFFFFF' }),
                el('ellipse', { cx: 32, cy: 51.4, rx: 3.3, ry: 2.4, fill: OL }),
                el('ellipse', { cx: 31.1, cy: 50.6, rx: 1.1, ry: 0.7, fill: '#FFFFFF', opacity: 0.8 }),
                el('path', { d: 'M32 53.8 Q30.4 55.6 28.6 54.6 M32 53.8 Q33.6 55.6 35.4 54.6', fill: 'none', stroke: OL, strokeWidth: 1.2, strokeLinecap: 'round' }),
                blush(18.5, 42.5),
                blush(45.5, 42.5),
            ],
        },
    },

    /* 3 ─ Panda ───────────────────────────────────────────────── */
    {
        id: 'mini:panda',
        category: 'mini_avatar',
        name: 'Panda',
        rarity: 'common',
        description: 'Kulağına bambu yaprağı takmış, keyfi yerinde bir panda.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('pd-ear', [stop(0, '#6A6390'), stop(1, '#2C2840')], 0.4, 0.35, 0.7),
                rad('pd-fur', [stop(0, '#FFFFFF'), stop(0.7, '#F4F3FA'), stop(1, '#DCDBE8')], 0.42, 0.34, 0.72),
                lin('pd-leaf', [stop(0, '#8BE08F'), stop(1, '#2F9B5C')], 0, 0, 1, 1),
            ],
            elements: [
                shadow(16),
                el('circle', { cx: 14.5, cy: 21, r: 7.4, fill: 'url(#pd-ear)', stroke: OL, strokeWidth: SW }),
                el('circle', { cx: 49.5, cy: 21, r: 7.4, fill: 'url(#pd-ear)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 32, cy: 38, rx: 22.5, ry: 19, fill: 'url(#pd-fur)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 22, cy: 37.5, rx: 6, ry: 7.6, fill: '#2E2A3C', transform: 'rotate(28 22 37.5)' }),
                el('ellipse', { cx: 42, cy: 37.5, rx: 6, ry: 7.6, fill: '#2E2A3C', transform: 'rotate(-28 42 37.5)' }),
                el('circle', { cx: 23, cy: 36.6, r: 2.6, fill: '#FFFFFF' }),
                el('circle', { cx: 23.5, cy: 36.9, r: 1.5, fill: OL }),
                el('circle', { cx: 41, cy: 36.6, r: 2.6, fill: '#FFFFFF' }),
                el('circle', { cx: 40.5, cy: 36.9, r: 1.5, fill: OL }),
                el('ellipse', { cx: 21, cy: 28.5, rx: 5, ry: 2.6, fill: '#FFFFFF', opacity: 0.8, transform: 'rotate(-18 21 28.5)' }),
                el('ellipse', { cx: 32, cy: 45, rx: 3.2, ry: 2.2, fill: '#2E2A3C' }),
                el('ellipse', { cx: 31.2, cy: 44.3, rx: 1, ry: 0.6, fill: '#FFFFFF', opacity: 0.7 }),
                el('path', { d: 'M32 47.2 Q30.4 49.6 28.2 48.6 M32 47.2 Q33.6 49.6 35.8 48.6', fill: 'none', stroke: OL, strokeWidth: 1.3, strokeLinecap: 'round' }),
                blush(16.5, 46, '#FF8FA0'),
                blush(47.5, 46, '#FF8FA0'),
                // bambu yaprağı
                el('path', { d: 'M50.6 15.6 C53.4 10.4 58.4 7.8 62.4 8.4 C60.6 12.8 56 16 50.6 15.6 Z', fill: 'url(#pd-leaf)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M49.6 14.4 C48.6 9.4 50.6 4.8 54 3.2 C55.2 7.4 53.4 11.8 49.6 14.4 Z', fill: 'url(#pd-leaf)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M51.6 14.6 C54.6 12.4 57.6 10.6 60.6 9.4 M50.2 12.6 C51 9.8 52 7.4 53.4 5.4', fill: 'none', stroke: '#D4F7C9', strokeWidth: 0.8, strokeLinecap: 'round', opacity: 0.8 }),
            ],
        },
    },

    /* 4 ─ Baykuş ──────────────────────────────────────────────── */
    {
        id: 'mini:baykus',
        category: 'mini_avatar',
        name: 'Baykuş',
        rarity: 'common',
        description: 'Gece yarısı sorularının koca gözlü bilgesi.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('bk-body', [stop(0, '#9C8BF0'), stop(1, '#5844B8')], 0.42, 0.3, 0.8),
                rad('bk-eye', [stop(0, '#FFE88A'), stop(1, '#E9A83A')], 0.4, 0.38, 0.65),
                lin('bk-belly', [stop(0, '#E6DEFF'), stop(1, '#C3B4F6')]),
            ],
            elements: [
                shadow(15),
                el('path', { d: 'M15 20 L11.5 6 L25 13.5 Z', fill: '#6C58C8', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M49 20 L52.5 6 L39 13.5 Z', fill: '#6C58C8', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', {
                    d: 'M32 9.5 C46.5 9.5 54 21 54 34.5 C54 48.5 45 58 32 58 C19 58 10 48.5 10 34.5 C10 21 17.5 9.5 32 9.5 Z',
                    fill: 'url(#bk-body)', stroke: OL, strokeWidth: SW,
                }),
                el('path', { d: 'M10.6 30 C6 38 7.4 49 15.6 54.4 C14.4 46 14 38 10.6 30 Z', fill: '#4A389E', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M53.4 30 C58 38 56.6 49 48.4 54.4 C49.6 46 50 38 53.4 30 Z', fill: '#4A389E', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('ellipse', { cx: 32, cy: 47, rx: 13, ry: 10, fill: 'url(#bk-belly)' }),
                el('path', { d: 'M22.5 44 Q24.6 46.4 26.8 44 Q29 46.4 31.2 44 Q33.4 46.4 35.6 44 Q37.8 46.4 40 44 M25 49.6 Q27.2 52 29.4 49.6 Q31.6 52 33.8 49.6 Q36 52 38.2 49.6', fill: 'none', stroke: '#8574D6', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                // yüz diski
                el('path', { d: 'M32 22 C27 17 15 18 14.4 28.6 C14 37 22 40 27 37.6 C29.6 36.4 31 35 32 33.6 C33 35 34.4 36.4 37 37.6 C42 40 50 37 49.6 28.6 C49 18 37 17 32 22 Z', fill: '#F1EBFF', opacity: 0.95 }),
                el('circle', { cx: 23.4, cy: 28.6, r: 6.8, fill: 'url(#bk-eye)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 40.6, cy: 28.6, r: 6.8, fill: 'url(#bk-eye)', stroke: OL, strokeWidth: SW_D }),
                ...eye(23.8, 29, 3.6, 3.8),
                ...eye(40.2, 29, 3.6, 3.8),
                el('path', { d: 'M32 33.4 L28.8 36.6 L32 41.4 L35.2 36.6 Z', fill: '#F5A53C', stroke: OL, strokeWidth: 1.2, strokeLinejoin: 'round' }),
                el('ellipse', { cx: 19.5, cy: 16.5, rx: 4.6, ry: 2.2, fill: '#FFFFFF', opacity: 0.35, transform: 'rotate(-28 19.5 16.5)' }),
                el('ellipse', { cx: 26, cy: 58.4, rx: 3.4, ry: 1.9, fill: '#F5A53C', stroke: OL, strokeWidth: 1.2 }),
                el('ellipse', { cx: 38, cy: 58.4, rx: 3.4, ry: 1.9, fill: '#F5A53C', stroke: OL, strokeWidth: 1.2 }),
            ],
        },
    },

    /* 5 ─ Ayıcık ──────────────────────────────────────────────── */
    {
        id: 'mini:ayicik',
        category: 'mini_avatar',
        name: 'Ayıcık',
        rarity: 'common',
        description: 'Papyonunu takmış, sarılmaya hazır tatlı ayıcık.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('ay-fur', [stop(0, '#D6A274'), stop(1, '#8F5B36')], 0.42, 0.32, 0.75),
                lin('ay-bow', [stop(0, '#FF8A8A'), stop(1, '#E2454F')]),
            ],
            elements: [
                shadow(15),
                el('circle', { cx: 15.2, cy: 19.6, r: 7.6, fill: 'url(#ay-fur)', stroke: OL, strokeWidth: SW }),
                el('circle', { cx: 48.8, cy: 19.6, r: 7.6, fill: 'url(#ay-fur)', stroke: OL, strokeWidth: SW }),
                el('circle', { cx: 15.6, cy: 20, r: 3.8, fill: '#F0C9A2' }),
                el('circle', { cx: 48.4, cy: 20, r: 3.8, fill: '#F0C9A2' }),
                el('ellipse', { cx: 32, cy: 36.5, rx: 21.5, ry: 19.5, fill: 'url(#ay-fur)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 21.5, cy: 26, rx: 5.4, ry: 2.6, fill: '#FFFFFF', opacity: 0.28, transform: 'rotate(-22 21.5 26)' }),
                el('ellipse', { cx: 32, cy: 44, rx: 9.6, ry: 7.4, fill: '#F3D7B6' }),
                ...eye(23.6, 34, 2.9, 3.3),
                ...eye(40.4, 34, 2.9, 3.3),
                el('ellipse', { cx: 32, cy: 40.6, rx: 3.6, ry: 2.6, fill: OL }),
                el('ellipse', { cx: 31, cy: 39.8, rx: 1.2, ry: 0.7, fill: '#FFFFFF', opacity: 0.8 }),
                el('path', { d: 'M32 43.2 L32 45.4 M32 45.4 Q30 48 27.4 46.6 M32 45.4 Q34 48 36.6 46.6', fill: 'none', stroke: OL, strokeWidth: 1.4, strokeLinecap: 'round' }),
                blush(18.6, 42),
                blush(45.4, 42),
                // mercan papyon
                el('path', { d: 'M32 56.5 L23.6 52 C22 51.4 21.4 52.4 21.4 53.6 L21.4 59.4 C21.4 60.6 22 61.6 23.6 61 L32 56.5 L40.4 61 C42 61.6 42.6 60.6 42.6 59.4 L42.6 53.6 C42.6 52.4 42 51.4 40.4 52 Z', fill: 'url(#ay-bow)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('rect', { x: 29.4, y: 53.8, width: 5.2, height: 5.4, rx: 1.6, fill: '#FF6B6B', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 25.4, cy: 56.6, r: 0.9, fill: '#FFFFFF', opacity: 0.7 }),
                el('circle', { cx: 38.6, cy: 56.6, r: 0.9, fill: '#FFFFFF', opacity: 0.7 }),
            ],
        },
    },

    /* 6 ─ Tavşan ──────────────────────────────────────────────── */
    {
        id: 'mini:tavsan',
        category: 'mini_avatar',
        name: 'Tavşan',
        rarity: 'common',
        description: 'Bir kulağı hep havada, bir kulağı hep dinlemede.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('tv-fur', [stop(0, '#FFFFFF'), stop(0.7, '#F7F2FF'), stop(1, '#E2D8F4')], 0.42, 0.34, 0.72),
                lin('tv-ear', [stop(0, '#FFC2CC'), stop(1, '#FF8FA3')]),
            ],
            elements: [
                shadow(15),
                el('ellipse', { cx: 23.5, cy: 17, rx: 6, ry: 14.5, fill: 'url(#tv-fur)', stroke: OL, strokeWidth: SW, transform: 'rotate(-10 23.5 17)' }),
                el('ellipse', { cx: 23.5, cy: 18, rx: 2.8, ry: 10.4, fill: 'url(#tv-ear)', transform: 'rotate(-10 23.5 18)' }),
                // kıvrık kulak
                el('path', { d: 'M36 29 C34.6 20 36.4 9 42.6 7.6 C47.6 6.6 52.6 10.4 53.4 16.2 C51.6 14.2 48.2 13.6 46 15.4 C44.4 19 44.4 24 44.6 29 Z', fill: 'url(#tv-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M39 27 C38.4 20 39.6 13.4 42.4 11.6 C43.4 15 42.8 21 41.8 27 Z', fill: 'url(#tv-ear)' }),
                el('ellipse', { cx: 32, cy: 41, rx: 19.5, ry: 17, fill: 'url(#tv-fur)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 23, cy: 32, rx: 5, ry: 2.4, fill: '#FFFFFF', opacity: 0.9, transform: 'rotate(-20 23 32)' }),
                ...eye(24.6, 39.6, 2.9, 3.4),
                ...eye(39.4, 39.6, 2.9, 3.4),
                el('path', { d: 'M30 44.6 Q32 43.6 34 44.6 L32 46.8 Z', fill: '#FF7A90', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('path', { d: 'M32 46.8 Q30.4 49 28.4 48.2 M32 46.8 Q33.6 49 35.6 48.2', fill: 'none', stroke: OL, strokeWidth: 1.3, strokeLinecap: 'round' }),
                el('rect', { x: 30.2, y: 47.6, width: 3.6, height: 3.4, rx: 0.9, fill: '#FFFFFF', stroke: OL, strokeWidth: 1 }),
                el('path', { d: 'M15 44.6 L21.6 45.4 M15.6 48.6 L21.6 47.2 M49 44.6 L42.4 45.4 M48.4 48.6 L42.4 47.2', fill: 'none', stroke: OL, strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.45 }),
                blush(18.4, 46, '#FF8FA3', 3.6, 2.2),
                blush(45.6, 46, '#FF8FA3', 3.6, 2.2),
            ],
        },
    },

    /* 7 ─ Uzaylı ──────────────────────────────────────────────── */
    {
        id: 'mini:uzayli',
        category: 'mini_avatar',
        name: 'Uzaylı',
        rarity: 'common',
        description: 'Dünyaya soru sormaya gelmiş, anten ışıkları yanan dost.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('uz-skin', [stop(0, '#B9F58C'), stop(1, '#43B556')], 0.42, 0.3, 0.8),
                rad('uz-eye', [stop(0, '#4B3A8C'), stop(1, '#120E2A')], 0.35, 0.3, 0.8),
                rad('uz-bulb', [stop(0, '#FFF6B0'), stop(1, '#FFB938')], 0.4, 0.35, 0.65),
            ],
            elements: [
                shadow(15),
                el('path', { d: 'M24.5 14 Q20.5 8 15.6 6.4 M39.5 14 Q43.5 8 48.4 6.4', fill: 'none', stroke: OL, strokeWidth: 2, strokeLinecap: 'round' }),
                el('circle', { cx: 15, cy: 6.2, r: 3.4, fill: 'url(#uz-bulb)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 49, cy: 6.2, r: 3.4, fill: 'url(#uz-bulb)', stroke: OL, strokeWidth: SW_D }),
                el('path', {
                    d: 'M32 11.5 C46.5 11.5 54 21.5 54 31.5 C54 44.5 42 57 32 57 C22 57 10 44.5 10 31.5 C10 21.5 17.5 11.5 32 11.5 Z',
                    fill: 'url(#uz-skin)', stroke: OL, strokeWidth: SW,
                }),
                el('circle', { cx: 32, cy: 17.6, r: 1.6, fill: '#2F9944', opacity: 0.45 }),
                el('circle', { cx: 27.4, cy: 19.4, r: 1.1, fill: '#2F9944', opacity: 0.45 }),
                el('circle', { cx: 36.6, cy: 19.4, r: 1.1, fill: '#2F9944', opacity: 0.45 }),
                el('ellipse', { cx: 20, cy: 21, rx: 5, ry: 2.4, fill: '#FFFFFF', opacity: 0.35, transform: 'rotate(-28 20 21)' }),
                el('path', { d: 'M14.6 30.4 C16.6 23.6 25.6 24.4 28.4 32.2 C27.4 38.2 17.6 38 14.6 30.4 Z', fill: 'url(#uz-eye)', stroke: OL, strokeWidth: 1.2 }),
                el('path', { d: 'M49.4 30.4 C47.4 23.6 38.4 24.4 35.6 32.2 C36.6 38.2 46.4 38 49.4 30.4 Z', fill: 'url(#uz-eye)', stroke: OL, strokeWidth: 1.2 }),
                el('ellipse', { cx: 20.6, cy: 29, rx: 2.4, ry: 1.5, fill: '#FFFFFF', transform: 'rotate(-20 20.6 29)' }),
                el('circle', { cx: 24.6, cy: 33.4, r: 0.9, fill: '#FFFFFF', opacity: 0.8 }),
                el('ellipse', { cx: 43.4, cy: 29, rx: 2.4, ry: 1.5, fill: '#FFFFFF', transform: 'rotate(20 43.4 29)' }),
                el('circle', { cx: 39.4, cy: 33.4, r: 0.9, fill: '#FFFFFF', opacity: 0.8 }),
                el('path', { d: 'M27.6 45 Q32 49 36.4 45', fill: 'none', stroke: OL, strokeWidth: 1.6, strokeLinecap: 'round' }),
                blush(20, 42, '#7ED06A', 3, 1.8),
                blush(44, 42, '#7ED06A', 3, 1.8),
            ],
        },
    },

    /* 8 ─ Robot ───────────────────────────────────────────────── */
    {
        id: 'mini:robot',
        category: 'mini_avatar',
        name: 'Robot',
        rarity: 'common',
        description: 'Ekranında hep bir gülümseme; cevapları milisaniyede işler.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                lin('rb-metal', [stop(0, '#EEF2FA'), stop(1, '#A7B4CC')]),
                lin('rb-screen', [stop(0, '#2B3A66'), stop(1, '#141C38')]),
                rad('rb-bulb', [stop(0, '#FFC2C2'), stop(1, '#FF5A5A')], 0.4, 0.35, 0.65),
            ],
            elements: [
                shadow(16),
                el('path', { d: 'M32 15 L32 8.6', fill: 'none', stroke: OL, strokeWidth: 2.2, strokeLinecap: 'round' }),
                el('circle', { cx: 32, cy: 6.4, r: 3.4, fill: 'url(#rb-bulb)', stroke: OL, strokeWidth: SW_D }),
                el('rect', { x: 5.6, y: 28, width: 6.4, height: 13, rx: 2.4, fill: '#8F9DB9', stroke: OL, strokeWidth: SW_D }),
                el('rect', { x: 52, y: 28, width: 6.4, height: 13, rx: 2.4, fill: '#8F9DB9', stroke: OL, strokeWidth: SW_D }),
                el('rect', { x: 22.5, y: 50, width: 19, height: 7.4, rx: 2, fill: '#8F9DB9', stroke: OL, strokeWidth: SW_D }),
                el('path', { d: 'M27 52.6 L27 55 M32 52.6 L32 55 M37 52.6 L37 55', fill: 'none', stroke: OL, strokeWidth: 1, strokeLinecap: 'round', opacity: 0.6 }),
                el('rect', { x: 10, y: 14.5, width: 44, height: 37, rx: 10, fill: 'url(#rb-metal)', stroke: OL, strokeWidth: SW }),
                el('rect', { x: 15, y: 21, width: 34, height: 22, rx: 6.5, fill: 'url(#rb-screen)', stroke: OL, strokeWidth: SW_D }),
                el('path', { d: 'M20.4 33 Q24.4 27 28.4 33 M35.6 33 Q39.6 27 43.6 33', fill: 'none', stroke: '#62F4F0', strokeWidth: 2.6, strokeLinecap: 'round' }),
                el('path', { d: 'M28 37.4 Q32 40 36 37.4', fill: 'none', stroke: '#62F4F0', strokeWidth: 1.8, strokeLinecap: 'round' }),
                el('circle', { cx: 19.6, cy: 38.4, r: 1.6, fill: '#FF6B6B', opacity: 0.75 }),
                el('circle', { cx: 44.4, cy: 38.4, r: 1.6, fill: '#FF6B6B', opacity: 0.75 }),
                el('path', { d: 'M18 24.4 Q21 23 24 23.4', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.35 }),
                el('circle', { cx: 14.4, cy: 18.8, r: 1.2, fill: OL, opacity: 0.55 }),
                el('circle', { cx: 49.6, cy: 18.8, r: 1.2, fill: OL, opacity: 0.55 }),
                el('circle', { cx: 14.4, cy: 47.2, r: 1.2, fill: OL, opacity: 0.55 }),
                el('circle', { cx: 49.6, cy: 47.2, r: 1.2, fill: OL, opacity: 0.55 }),
                el('rect', { x: 16, y: 16.2, width: 14, height: 2.2, rx: 1.1, fill: '#FFFFFF', opacity: 0.6 }),
            ],
        },
    },

    /* 9 ─ Hayalet (rare) ──────────────────────────────────────── */
    {
        id: 'mini:hayalet',
        category: 'mini_avatar',
        name: 'Hayalet',
        rarity: 'rare',
        description: 'Gece yarısı bildirimlerinin sevimli sahibi. Bööö!',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('hy-glow', [stop(0, '#B8A6FF', 0.55), stop(1, '#B8A6FF', 0)], 0.5, 0.5, 0.5),
                rad('hy-body', [stop(0, '#FFFFFF'), stop(0.65, '#F3EFFF'), stop(1, '#CFC4F5')], 0.42, 0.3, 0.8),
            ],
            elements: [
                el('circle', { cx: 32, cy: 32, r: 31, fill: 'url(#hy-glow)' }),
                shadow(12, 61, 2.2),
                el('path', { d: 'M13 33 C7.6 31.6 5.4 37.4 8.6 39.6 C10.8 41 13 38.8 13 37.4 Z', fill: 'url(#hy-body)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M51 33 C56.4 31.6 58.6 37.4 55.4 39.6 C53.2 41 51 38.8 51 37.4 Z', fill: 'url(#hy-body)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', {
                    d: 'M32 7 C45 7 52 17 52 30 L52 50 C52 53.4 49 54.4 47.4 51.8 C45.9 49.4 43 49.4 41.8 51.8 C40.6 54.6 37.4 55.2 36 52.4 C34.8 50 31.2 49.8 29.8 52.4 C28.4 55.2 24.8 54.8 23.4 51.8 C22.2 49.2 19 49.2 17.6 51.6 C16 54.2 12 53.4 12 50 L12 30 C12 17 19 7 32 7 Z',
                    fill: 'url(#hy-body)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round',
                }),
                el('ellipse', { cx: 21.6, cy: 16, rx: 5.6, ry: 2.6, fill: '#FFFFFF', opacity: 0.9, transform: 'rotate(-32 21.6 16)' }),
                ...eye(25, 28.5, 2.8, 3.8),
                ...eye(39, 28.5, 2.8, 3.8),
                el('path', { d: 'M27.4 35.6 Q32 41.6 36.6 35.6 Z', fill: '#4A2F6E', stroke: OL, strokeWidth: 1.2, strokeLinejoin: 'round' }),
                el('path', { d: 'M30.4 38.4 Q32 37.2 33.6 38.4 Q33.4 40.6 32 40.6 Q30.6 40.6 30.4 38.4 Z', fill: '#FF8FA8' }),
                blush(19.4, 35, '#FF9DB4', 3.2, 2),
                blush(44.6, 35, '#FF9DB4', 3.2, 2),
                spark(54, 10, 4.2, '#A994FF'),
                spark(9.6, 18, 2.8, '#C9BBFF'),
                spark(57, 46, 2.2, '#C9BBFF'),
            ],
        },
    },

    /* 10 ─ Çay Bardağı ────────────────────────────────────────── */
    {
        id: 'mini:cay-bardagi',
        category: 'mini_avatar',
        name: 'Çay Bardağı',
        rarity: 'common',
        description: 'İnce belli bardakta tavşan kanı demli çay; yanında bir kesme şeker.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                lin('cy-tea', [stop(0, '#E8521F'), stop(0.4, '#B8240F'), stop(1, '#6E0F08')]),
                lin('cy-glass', [stop(0, '#FFFFFF', 0.35), stop(0.3, '#FFFFFF', 0.04), stop(0.75, '#FFFFFF', 0.04), stop(1, '#FFFFFF', 0.3)], 0, 0, 1, 0),
                lin('cy-saucer', [stop(0, '#FFFFFF'), stop(1, '#D3D8E4')]),
            ],
            elements: [
                shadow(20, 60.2, 2.4),
                // tabak
                el('ellipse', { cx: 32, cy: 55, rx: 21, ry: 4.8, fill: 'url(#cy-saucer)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 32, cy: 54.6, rx: 15.4, ry: 3.1, fill: 'none', stroke: '#E2B94C', strokeWidth: 1.3 }),
                // kesme şeker
                el('rect', { x: 42.6, y: 47.4, width: 6.2, height: 6.2, rx: 1.2, fill: '#FFFFFF', stroke: OL, strokeWidth: 1.3, transform: 'rotate(-12 45.7 50.5)' }),
                // çay (bardağın içi)
                el('path', {
                    d: 'M20.6 19.5 C21.4 25 25.2 28.4 25.2 33.4 C25.2 38.2 21.2 41.2 21.2 46.2 C21.2 50.2 24 53 27.2 53 L36.8 53 C40 53 42.8 50.2 42.8 46.2 C42.8 41.2 38.8 38.2 38.8 33.4 C38.8 28.4 42.6 25 43.4 19.5 Z',
                    fill: 'url(#cy-tea)',
                }),
                el('ellipse', { cx: 32, cy: 19.5, rx: 11.4, ry: 2, fill: '#F59156' }),
                // bardak camı
                el('path', {
                    d: 'M19 14 C19 22.4 25 27 25 33.2 C25 38 21 41 21 46.2 C21 50.4 24 53.4 27.4 53.4 L36.6 53.4 C40 53.4 43 50.4 43 46.2 C43 41 39 38 39 33.2 C39 27 45 22.4 45 14 Z',
                    fill: 'url(#cy-glass)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round',
                }),
                el('ellipse', { cx: 32, cy: 14, rx: 13, ry: 2.6, fill: '#FFFFFF', opacity: 0.45, stroke: OL, strokeWidth: SW_D }),
                el('path', { d: 'M19.6 15.2 Q32 18.4 44.4 15.2', fill: 'none', stroke: '#E2B94C', strokeWidth: 1.1, strokeLinecap: 'round' }),
                el('path', { d: 'M23 19 C24 23.6 27.2 27.4 27.4 32 M24.4 42.4 C23.6 45 23.8 48 25.4 50', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.8, strokeLinecap: 'round', opacity: 0.75 }),
                // buhar
                el('path', { d: 'M27.4 10.6 C25.6 8.6 27.8 6.8 26.6 4.4 M33.6 10.4 C31.8 8 34.6 6 33 3 M39.4 10.6 C38 8.8 40 7.2 39 5.2', fill: 'none', stroke: '#B8C1D6', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.85 }),
            ],
        },
    },

    /* 11 ─ Simit ─────────────────────────────────────────────── */
    {
        id: 'mini:simit',
        category: 'mini_avatar',
        name: 'Simit',
        rarity: 'common',
        description: 'Fırından yeni çıkmış, pekmezli, bol susamlı, çıtır burgu simit.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('sm-top', [stop(0, '#EDAA58'), stop(0.55, '#C9772F'), stop(1, '#94481C')], 0.4, 0.3, 0.78),
                lin('sm-side', [stop(0, '#B8692F'), stop(1, '#7E3E17')]),
            ],
            elements: [
                shadow(22, 58, 2.8),
                el('path', { d: ringPath(SIMIT.cx, SIMIT.cy, SIMIT.rxO, SIMIT.ryO, SIMIT.rxI, SIMIT.ryI), fill: 'url(#sm-top)' }),
                // deliğin uzak duvarı (iç gölge hilali) ve alt kenarın koyu kalınlığı
                el('path', { d: `M${SIMIT.cx - SIMIT.rxI} ${SIMIT.cy} A${SIMIT.rxI} ${SIMIT.ryI} 0 0 1 ${SIMIT.cx + SIMIT.rxI} ${SIMIT.cy} A${SIMIT.rxI} ${SIMIT.ryI - 3} 0 0 0 ${SIMIT.cx - SIMIT.rxI} ${SIMIT.cy} Z`, fill: 'url(#sm-side)' }),
                el('path', { d: `M${SIMIT.cx - SIMIT.rxO} ${SIMIT.cy} A${SIMIT.rxO} ${SIMIT.ryO} 0 0 0 ${SIMIT.cx + SIMIT.rxO} ${SIMIT.cy} A${SIMIT.rxO} ${SIMIT.ryO - 3.4} 0 0 1 ${SIMIT.cx - SIMIT.rxO} ${SIMIT.cy} Z`, fill: 'url(#sm-side)', opacity: 0.85 }),
                ...simitTwists(),
                ...simitSesame(),
                el('path', { d: ringPath(SIMIT.cx, SIMIT.cy, SIMIT.rxO, SIMIT.ryO, SIMIT.rxI, SIMIT.ryI), fill: 'none', stroke: OL, strokeWidth: SW }),
                el('path', { d: 'M10.6 28 C12.6 21 19.4 16 27.4 14.8', fill: 'none', stroke: '#FFFFFF', strokeWidth: 2.2, strokeLinecap: 'round', opacity: 0.4 }),
            ],
        },
    },

    /* 12 ─ Türk Kahvesi (rare) ───────────────────────────────── */
    {
        id: 'mini:turk-kahvesi',
        category: 'mini_avatar',
        name: 'Türk Kahvesi',
        rarity: 'rare',
        description: 'Bol köpüklü, lale desenli fincanda; yanında lokumu. Kırk yıl hatırı var.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('tkh-glow', [stop(0, '#FFD98A', 0.5), stop(1, '#FFD98A', 0)], 0.5, 0.5, 0.5),
                lin('tkh-cup', [stop(0, '#FF8585'), stop(0.45, '#E04A57'), stop(1, '#A92B3A')], 0, 0, 1, 0),
                lin('tkh-saucer', [stop(0, '#FFFFFF'), stop(1, '#D9DCE8')]),
                rad('tkh-foam', [stop(0, '#F2D6AE'), stop(0.7, '#D2A06A'), stop(1, '#9E6A3C')], 0.45, 0.4, 0.6),
                lin('tkh-gold', [stop(0, '#FFE69A'), stop(1, '#D9A535')]),
                lin('tkh-lokum', [stop(0, '#FFB6C8'), stop(1, '#F07A9A')]),
            ],
            elements: [
                el('circle', { cx: 32, cy: 34, r: 30, fill: 'url(#tkh-glow)' }),
                shadow(22, 60.4, 2.4),
                el('ellipse', { cx: 32, cy: 54, rx: 23, ry: 5.6, fill: 'url(#tkh-saucer)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 32, cy: 53.4, rx: 16.6, ry: 3.6, fill: 'none', stroke: '#E2B94C', strokeWidth: 1.2 }),
                // lokum
                el('rect', { x: 7.6, y: 46.4, width: 8, height: 7, rx: 1.8, fill: 'url(#tkh-lokum)', stroke: OL, strokeWidth: 1.3 }),
                el('path', { d: 'M8.6 47.6 L14.6 47.6', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.9 }),
                el('circle', { cx: 10.4, cy: 50.4, r: 0.55, fill: '#FFFFFF' }),
                el('circle', { cx: 13, cy: 51.4, r: 0.55, fill: '#FFFFFF' }),
                // kulp
                el('path', { d: 'M44.4 27.4 C52.6 26 54 37.6 43.2 40.6', fill: 'none', stroke: OL, strokeWidth: 5.6, strokeLinecap: 'round' }),
                el('path', { d: 'M44.4 27.4 C52.6 26 54 37.6 43.2 40.6', fill: 'none', stroke: '#E04A57', strokeWidth: 2.6, strokeLinecap: 'round' }),
                // fincan gövdesi
                el('path', { d: 'M18 22.5 C18 34.5 20 44.6 25.4 49 L38.6 49 C44 44.6 46 34.5 46 22.5 Z', fill: 'url(#tkh-cup)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M18.5 27 Q32 32.2 45.5 27', fill: 'none', stroke: 'url(#tkh-gold)', strokeWidth: 1.8, strokeLinecap: 'round' }),
                el('path', { d: 'M22.6 44.6 Q32 48 41.4 44.6', fill: 'none', stroke: '#F2CF6B', strokeWidth: 1.1, strokeLinecap: 'round' }),
                // altın lale motifi
                el('path', { d: 'M32 42.4 C28.2 40 27.8 35.2 29.2 32.6 L30.9 35.2 L32 31.6 L33.1 35.2 L34.8 32.6 C36.2 35.2 35.8 40 32 42.4 Z', fill: 'url(#tkh-gold)', stroke: '#9A5A1E', strokeWidth: 0.6, strokeLinejoin: 'round' }),
                el('circle', { cx: 24.6, cy: 37.4, r: 0.9, fill: '#F2CF6B' }),
                el('circle', { cx: 39.4, cy: 37.4, r: 0.9, fill: '#F2CF6B' }),
                el('path', { d: 'M21.4 30 C21.8 36 23 41 25 44', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.45 }),
                // köpük
                el('ellipse', { cx: 32, cy: 22.5, rx: 13.4, ry: 3.3, fill: '#5C3219' }),
                el('ellipse', { cx: 32, cy: 22.7, rx: 11.8, ry: 2.6, fill: 'url(#tkh-foam)' }),
                el('circle', { cx: 27, cy: 22.2, r: 0.9, fill: '#F7E6CC' }),
                el('circle', { cx: 35.6, cy: 23.2, r: 0.7, fill: '#F7E6CC' }),
                el('circle', { cx: 31.2, cy: 21.6, r: 0.55, fill: '#F7E6CC' }),
                el('circle', { cx: 38.8, cy: 22, r: 0.5, fill: '#F7E6CC' }),
                el('ellipse', { cx: 32, cy: 22.5, rx: 14, ry: 3.6, fill: 'none', stroke: OL, strokeWidth: SW_D }),
                // buhar
                el('path', { d: 'M27.6 17.4 C25.8 15 28.4 12.8 26.8 10 M33.4 16.8 C31.6 14 34.6 11.6 32.8 8.2 M38.8 17.4 C37.4 15.4 39.4 13.6 38.2 11.4', fill: 'none', stroke: '#C2B6D6', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.85 }),
                spark(52, 12, 3.2, '#E2B94C'),
                spark(10, 30, 2.2, '#E2B94C', 0.8),
            ],
        },
    },

    /* 13 ─ Nazar Boncuğu ─────────────────────────────────────── */
    {
        id: 'mini:nazar-boncugu',
        category: 'mini_avatar',
        name: 'Nazar Boncuğu',
        rarity: 'common',
        description: 'El yapımı cam boncuk; kem gözlerden uzak, şansın yanında.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('nz-glass', [stop(0, '#3F83F0'), stop(0.75, '#1C46B8'), stop(1, '#122C82')], 0.4, 0.36, 0.7),
                rad('nz-light', [stop(0, '#A8E2FF'), stop(1, '#2F9BE8')], 0.4, 0.36, 0.7),
                lin('nz-gold', [stop(0, '#FFE69A'), stop(1, '#C9952E')]),
            ],
            elements: [
                shadow(16),
                el('path', { d: 'M32 11.6 C28.6 7.6 30 3.2 32 3.2 C34 3.2 35.4 7.6 32 11.6', fill: 'none', stroke: 'url(#nz-gold)', strokeWidth: 2.2, strokeLinecap: 'round' }),
                el('circle', { cx: 32, cy: 35, r: 23, fill: 'url(#nz-glass)', stroke: OL, strokeWidth: SW }),
                el('circle', { cx: 32, cy: 35, r: 20.6, fill: 'none', stroke: '#6FA2FF', strokeWidth: 1, opacity: 0.6 }),
                el('circle', { cx: 32, cy: 35, r: 13.4, fill: '#FFFFFF' }),
                el('circle', { cx: 32, cy: 35, r: 9.4, fill: 'url(#nz-light)' }),
                el('circle', { cx: 32, cy: 35, r: 5, fill: '#0D1633' }),
                el('circle', { cx: 30.4, cy: 33.4, r: 1.5, fill: '#FFFFFF', opacity: 0.9 }),
                el('path', { d: 'M15.4 29 C17.4 21.6 23.6 16.4 31 15.6', fill: 'none', stroke: '#FFFFFF', strokeWidth: 3, strokeLinecap: 'round', opacity: 0.55 }),
                el('circle', { cx: 15.2, cy: 34.6, r: 1.4, fill: '#FFFFFF', opacity: 0.55 }),
                el('path', { d: 'M42 52.6 C46.6 50.6 50.4 46.4 52 41.6', fill: 'none', stroke: '#0B1A55', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.35 }),
                spark(53.4, 15, 3.4, '#8FD3FF'),
            ],
        },
    },

    /* 14 ─ Lale (rare) ───────────────────────────────────────── */
    {
        id: 'mini:lale',
        category: 'mini_avatar',
        name: 'Lale',
        rarity: 'rare',
        description: 'İnce uçlu İstanbul lalesi; sarayların ve çinilerin zarif çiçeği.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('ll-glow', [stop(0, '#FF8A8A', 0.38), stop(1, '#FF8A8A', 0)], 0.5, 0.45, 0.5),
                lin('ll-petal', [stop(0, '#FF9A8A'), stop(0.55, '#F04155'), stop(1, '#B51F3C')]),
                lin('ll-back', [stop(0, '#E8455A'), stop(1, '#8E1530')]),
                lin('ll-leaf', [stop(0, '#7FD98A'), stop(1, '#237A4B')], 0, 0, 1, 1),
                lin('ll-gold', [stop(0, '#FFE69A'), stop(1, '#D9A535')]),
            ],
            elements: [
                el('circle', { cx: 32, cy: 30, r: 30, fill: 'url(#ll-glow)' }),
                shadow(13),
                // sap
                el('path', { d: 'M32 41 C32.6 47 31.2 52.6 32 59', fill: 'none', stroke: OL, strokeWidth: 4.6, strokeLinecap: 'round' }),
                el('path', { d: 'M32 41 C32.6 47 31.2 52.6 32 59', fill: 'none', stroke: '#3E9B5A', strokeWidth: 2.2, strokeLinecap: 'round' }),
                // yapraklar
                el('path', { d: 'M31.4 57.6 C23.6 55.6 16.6 47.6 15.4 37.6 C22 41.4 27.6 47.4 31.4 53.6 Z', fill: 'url(#ll-leaf)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M32.8 55.4 C39.6 52.6 45.4 45.4 47.8 35.4 C41.6 39.6 36.6 45.4 32.8 51.6 Z', fill: 'url(#ll-leaf)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M29.6 53.4 C25.6 49.6 21.6 45 18.6 40.6 M34.6 51 C38.4 47.4 42 43 44.6 38.6', fill: 'none', stroke: '#BDF2C4', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.6 }),
                // arka (orta) taç yaprağı
                el('path', { d: 'M32 4.6 C37.4 11 39.6 21 38.6 29.4 C37.6 37.6 26.4 37.6 25.4 29.4 C24.4 21 26.6 11 32 4.6 Z', fill: 'url(#ll-back)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                // yan taç yaprakları (ince, uçları dışa kıvrık)
                el('path', { d: 'M32 42.6 C23.6 42.6 18.6 36.4 18.6 26.4 C18.6 18.4 17.6 13 15.4 7.8 C22.8 10.8 29 17.4 31 26.4 C32.4 32.6 33 38.4 32 42.6 Z', fill: 'url(#ll-petal)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M32 42.6 C40.4 42.6 45.4 36.4 45.4 26.4 C45.4 18.4 46.4 13 48.6 7.8 C41.2 10.8 35 17.4 33 26.4 C31.6 32.6 31 38.4 32 42.6 Z', fill: 'url(#ll-petal)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M21.6 29 C21.4 22 20.6 17 19 12.6', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.6, strokeLinecap: 'round', opacity: 0.5 }),
                el('path', { d: 'M28.6 39.4 C30.4 35 30.4 29 29 24.4 M35.4 39.4 C33.6 35 33.6 29 35 24.4', fill: 'none', stroke: 'url(#ll-gold)', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.9 }),
                spark(52.6, 22, 3, '#E2B94C'),
                spark(11.4, 22.6, 2.2, '#E2B94C', 0.85),
            ],
        },
    },

    /* 15 ─ Taç (epic, shimmer) ───────────────────────────────── */
    {
        id: 'mini:tac',
        category: 'mini_avatar',
        name: 'Taç',
        rarity: 'epic',
        description: 'Mor kadife üzerine altın, yakut ve inci. Soruların hükümdarına.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('tc-glow', [stop(0, '#FFD66B', 0.55), stop(1, '#FFD66B', 0)], 0.5, 0.5, 0.5),
                lin('tc-gold', [stop(0, '#FFF0A8'), stop(0.45, '#F2C14E'), stop(1, '#B67A22')]),
                lin('tc-band', [stop(0, '#F7D36A'), stop(1, '#A86A1C')]),
                rad('tc-velvet', [stop(0, '#9A6CF0'), stop(1, '#4B2596')], 0.5, 0.35, 0.7),
                rad('tc-pearl', [stop(0, '#FFFFFF'), stop(1, '#D9D0F2')], 0.35, 0.3, 0.75),
                rad('tc-ruby', [stop(0, '#FFB0B0'), stop(0.5, '#F0384E'), stop(1, '#9C1430')], 0.35, 0.3, 0.75),
                rad('tc-sapph', [stop(0, '#B6E4FF'), stop(1, '#2350C8')], 0.35, 0.3, 0.75),
                rad('tc-emer', [stop(0, '#B4F7C8'), stop(1, '#16865A')], 0.35, 0.3, 0.75),
            ],
            elements: [
                el('circle', { cx: 32, cy: 34, r: 30, fill: 'url(#tc-glow)' }),
                shadow(20, 60, 2.4),
                // kadife iç
                el('path', { d: 'M15 42 C15 27 23 18.6 32 18.6 C41 18.6 49 27 49 42 Z', fill: 'url(#tc-velvet)', stroke: OL, strokeWidth: SW_D }),
                // taç dişleri
                el('path', { d: 'M13.4 45 L9.6 20.4 L21.4 32 L32 12.6 L42.6 32 L54.4 20.4 L50.6 45 Z', fill: 'url(#tc-gold)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M16 41 L13.8 27.6 L21.6 35.6 M32 18.8 L32 26 M48 41 L50.2 27.6 L42.4 35.6', fill: 'none', stroke: '#FFF6C8', strokeWidth: 1.2, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.7 }),
                // orta mücevher
                el('path', { d: 'M32 25.4 L36.2 31.4 L32 38.4 L27.8 31.4 Z', fill: 'url(#tc-sapph)', stroke: OL, strokeWidth: 1.3, strokeLinejoin: 'round' }),
                el('path', { d: 'M27.8 31.4 L36.2 31.4 M32 25.4 L30.2 31.4 L32 38.4 L33.8 31.4 Z', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.6, opacity: 0.6 }),
                // bant
                el('path', { d: 'M13 44 L51 44 L50 52.6 C40.6 55.4 23.4 55.4 14 52.6 Z', fill: 'url(#tc-band)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M14.6 46.4 C24 48.2 40 48.2 49.4 46.4', fill: 'none', stroke: '#FFF0A8', strokeWidth: 1, strokeLinecap: 'round', opacity: 0.8 }),
                el('ellipse', { cx: 32, cy: 49.4, rx: 3.8, ry: 3.2, fill: 'url(#tc-ruby)', stroke: OL, strokeWidth: 1.2 }),
                el('circle', { cx: 22, cy: 49.2, r: 2.5, fill: 'url(#tc-emer)', stroke: OL, strokeWidth: 1.1 }),
                el('circle', { cx: 42, cy: 49.2, r: 2.5, fill: 'url(#tc-emer)', stroke: OL, strokeWidth: 1.1 }),
                el('circle', { cx: 16.8, cy: 49, r: 1.1, fill: '#FFF6D6' }),
                el('circle', { cx: 27, cy: 49.6, r: 1.1, fill: '#FFF6D6' }),
                el('circle', { cx: 37, cy: 49.6, r: 1.1, fill: '#FFF6D6' }),
                el('circle', { cx: 47.2, cy: 49, r: 1.1, fill: '#FFF6D6' }),
                // inciler
                el('circle', { cx: 9.6, cy: 20.4, r: 3.2, fill: 'url(#tc-pearl)', stroke: OL, strokeWidth: 1.3 }),
                el('circle', { cx: 32, cy: 12.2, r: 3.6, fill: 'url(#tc-pearl)', stroke: OL, strokeWidth: 1.3 }),
                el('circle', { cx: 54.4, cy: 20.4, r: 3.2, fill: 'url(#tc-pearl)', stroke: OL, strokeWidth: 1.3 }),
                el('circle', { cx: 21.4, cy: 32, r: 1.9, fill: 'url(#tc-ruby)', stroke: OL, strokeWidth: 1 }),
                el('circle', { cx: 42.6, cy: 32, r: 1.9, fill: 'url(#tc-ruby)', stroke: OL, strokeWidth: 1 }),
                el('circle', { cx: 30.8, cy: 48.2, r: 1, fill: '#FFFFFF', opacity: 0.85 }),
                // parıltı (shimmer)
                el('g', { opacity: 0.9 }, [
                    el('path', { d: 'M22.6 43.4 L25.4 43.4 L31.2 17.4 L29.6 20.2 Z', fill: '#FFFFFF', opacity: 0.55 }),
                    el('path', { d: 'M16.6 51.6 L19 51.6 L21.4 44.8 L19.4 44.8 Z', fill: '#FFFFFF', opacity: 0.5 }),
                ], 'shimmer'),
                el('g', {}, [
                    spark(50, 9, 3.8, '#FFFFFF'),
                    spark(13, 9.6, 2.6, '#FFF0A8'),
                    spark(56.4, 38, 2.4, '#FFF0A8'),
                ], 'twinkle'),
            ],
        },
    },

    /* 16 ─ Ejderha (legendary, float) ────────────────────────── */
    {
        id: 'mini:ejderha',
        category: 'mini_avatar',
        name: 'Ejderha',
        rarity: 'legendary',
        description: 'Altın jetonunu bağrına basmış yavru ejderha. Hazinesine göz dikme!',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('ej-aura', [stop(0, '#FFD66B', 0.6), stop(0.55, '#B68CFF', 0.28), stop(1, '#B68CFF', 0)], 0.5, 0.5, 0.5),
                rad('ej-body', [stop(0, '#A98BFF'), stop(0.6, '#7552E8'), stop(1, '#4B2FB8')], 0.4, 0.3, 0.8),
                lin('ej-wing', [stop(0, '#FFB0BC'), stop(1, '#FF5E6E')], 0, 0, 1, 1),
                lin('ej-horn', [stop(0, '#FFF3C2'), stop(1, '#E2A93B')]),
                rad('ej-coin', [stop(0, '#FFF2A8'), stop(0.6, '#F6C445'), stop(1, '#C98A1E')], 0.38, 0.32, 0.75),
                lin('ej-belly', [stop(0, '#FFF1DA'), stop(1, '#F6D2A8')]),
                rad('ej-iris', [stop(0, '#8BFFE0'), stop(1, '#19A88A')], 0.45, 0.4, 0.6),
            ],
            elements: [
                el('circle', { cx: 32, cy: 33, r: 31, fill: 'url(#ej-aura)' }),
                shadow(15, 61.6, 2),
                el('g', {}, [
                    // kuyruk
                    el('path', { d: 'M42 50.6 C50.6 55.6 57.6 51 56.6 42.6 L60.6 38.6 L53.6 39.6 L55 43 C54.4 48.6 48.4 50.4 43.2 46.6 Z', fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    // kanatlar
                    el('path', { d: 'M20.4 33 C11.4 25.4 4.4 28.6 3.4 36.4 C7 34.6 9.4 36 9.6 39.6 C12.2 36.8 15.6 38 16.6 41.4 Z', fill: 'url(#ej-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    el('path', { d: 'M43.6 33 C52.6 25.4 59.6 28.6 60.6 36.4 C57 34.6 54.6 36 54.4 39.6 C51.8 36.8 48.4 38 47.4 41.4 Z', fill: 'url(#ej-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    el('path', { d: 'M18.6 34.6 C14 31 9.4 31 6.4 33.4 M17.4 36.6 C15 35 12.6 35.6 11.6 37 M45.4 34.6 C50 31 54.6 31 57.6 33.4 M46.6 36.6 C49 35 51.4 35.6 52.4 37', fill: 'none', stroke: '#C2364A', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.7 }),
                    // gövde
                    el('path', { d: 'M32 31 C42 31 46.4 40.6 46.4 48.4 C46.4 55.4 40.4 58.6 32 58.6 C23.6 58.6 17.6 55.4 17.6 48.4 C17.6 40.6 22 31 32 31 Z', fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW }),
                    el('ellipse', { cx: 32, cy: 48.6, rx: 9.6, ry: 8.6, fill: 'url(#ej-belly)' }),
                    el('path', { d: 'M24.6 45.4 Q32 47.6 39.4 45.4 M23.8 50 Q32 52.4 40.2 50 M25.4 54.4 Q32 56.4 38.6 54.4', fill: 'none', stroke: '#E0A86E', strokeWidth: 1, strokeLinecap: 'round', opacity: 0.8 }),
                    // ayaklar
                    el('ellipse', { cx: 24.4, cy: 58, rx: 5.2, ry: 3, fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW_D }),
                    el('ellipse', { cx: 39.6, cy: 58, rx: 5.2, ry: 3, fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW_D }),
                    el('path', { d: 'M21.6 59.6 L21.6 60.4 M24.4 60 L24.4 60.8 M27.2 59.6 L27.2 60.4 M36.8 59.6 L36.8 60.4 M39.6 60 L39.6 60.8 M42.4 59.6 L42.4 60.4', fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.2, strokeLinecap: 'round' }),
                    // altın jeton
                    el('circle', { cx: 32, cy: 48.4, r: 6.6, fill: 'url(#ej-coin)', stroke: OL, strokeWidth: 1.5 }),
                    el('circle', { cx: 32, cy: 48.4, r: 4.6, fill: 'none', stroke: '#C98A1E', strokeWidth: 0.9 }),
                    el('path', { d: 'M32 45.2 L32.95 47.3 L35.2 47.5 L33.5 49 L34 51.2 L32 50.1 L30 51.2 L30.5 49 L28.8 47.5 L31.05 47.3 Z', fill: '#FFF6C8', stroke: '#C98A1E', strokeWidth: 0.5, strokeLinejoin: 'round' }),
                    // kollar jetona sarılı
                    el('ellipse', { cx: 25.2, cy: 47.6, rx: 3.2, ry: 4, fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW_D, transform: 'rotate(-30 25.2 47.6)' }),
                    el('ellipse', { cx: 38.8, cy: 47.6, rx: 3.2, ry: 4, fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW_D, transform: 'rotate(30 38.8 47.6)' }),
                    // boynuzlar
                    el('path', { d: 'M21.4 14.6 C17.6 9.4 18 4.4 21 2 C21.4 7 23.4 10 26.2 12 Z', fill: 'url(#ej-horn)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    el('path', { d: 'M42.6 14.6 C46.4 9.4 46 4.4 43 2 C42.6 7 40.6 10 37.8 12 Z', fill: 'url(#ej-horn)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    // kulak yüzgeçleri
                    el('path', { d: 'M17.4 19.4 L8.6 14.6 L11 21 L7.6 24.4 L16.6 25.4 Z', fill: 'url(#ej-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    el('path', { d: 'M46.6 19.4 L55.4 14.6 L53 21 L56.4 24.4 L47.4 25.4 Z', fill: 'url(#ej-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    // baş
                    el('ellipse', { cx: 32, cy: 22.4, rx: 16.4, ry: 13.6, fill: 'url(#ej-body)', stroke: OL, strokeWidth: SW }),
                    el('path', { d: 'M29.2 9.6 L32 5.4 L34.8 9.6 Z', fill: '#FF6B6B', stroke: OL, strokeWidth: 1.2, strokeLinejoin: 'round' }),
                    el('ellipse', { cx: 22.4, cy: 13.8, rx: 4.6, ry: 2, fill: '#FFFFFF', opacity: 0.35, transform: 'rotate(-25 22.4 13.8)' }),
                    el('ellipse', { cx: 32, cy: 28.6, rx: 9.4, ry: 5.6, fill: '#B9A2FF' }),
                    el('ellipse', { cx: 29, cy: 27.4, rx: 1.1, ry: 0.8, fill: OL }),
                    el('ellipse', { cx: 35, cy: 27.4, rx: 1.1, ry: 0.8, fill: OL }),
                    el('path', { d: 'M28.4 30.6 Q32 33 35.6 30.6', fill: 'none', stroke: OL, strokeWidth: 1.3, strokeLinecap: 'round' }),
                    el('path', { d: 'M33.6 31.6 L34.4 33.4 L35.2 31.2 Z', fill: '#FFFFFF', stroke: OL, strokeWidth: 0.6, strokeLinejoin: 'round' }),
                    // gözler
                    el('ellipse', { cx: 24.6, cy: 20.4, rx: 3.8, ry: 4.4, fill: OL }),
                    el('ellipse', { cx: 39.4, cy: 20.4, rx: 3.8, ry: 4.4, fill: OL }),
                    el('circle', { cx: 24.8, cy: 21.6, r: 2.3, fill: 'url(#ej-iris)' }),
                    el('circle', { cx: 39.2, cy: 21.6, r: 2.3, fill: 'url(#ej-iris)' }),
                    el('circle', { cx: 25.9, cy: 18.6, r: 1.5, fill: '#FFFFFF' }),
                    el('circle', { cx: 40.5, cy: 18.6, r: 1.5, fill: '#FFFFFF' }),
                    el('circle', { cx: 23.4, cy: 22.6, r: 0.6, fill: '#FFFFFF' }),
                    el('circle', { cx: 38, cy: 22.6, r: 0.6, fill: '#FFFFFF' }),
                    blush(18.6, 27, '#FF7E9A', 2.8, 1.7),
                    blush(45.4, 27, '#FF7E9A', 2.8, 1.7),
                ], 'float'),
            ],
        },
    },
    /* 17 ─ Martı (bonus) ─────────────────────────────────────── */
    {
        id: 'mini:marti',
        category: 'mini_avatar',
        name: 'Martı',
        rarity: 'common',
        description: 'Boğaz\'ın kaşları çatık ama kalbi yumuşak bekçisi. Simidini sıkı tut!',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('mt-body', [stop(0, '#FFFFFF'), stop(0.65, '#F2F5FA'), stop(1, '#C9D2E2')], 0.42, 0.3, 0.8),
                lin('mt-wing', [stop(0, '#C3CCDC'), stop(1, '#8C98B2')]),
                lin('mt-beak', [stop(0, '#FFE070'), stop(1, '#F5B02E')]),
            ],
            elements: [
                el('path', { d: 'M4 60.4 Q8 57.6 12 60.4 Q16 63.2 20 60.4 Q24 57.6 28 60.4 Q32 63.2 36 60.4 Q40 57.6 44 60.4 Q48 63.2 52 60.4 Q56 57.6 60 60.4', fill: 'none', stroke: '#4FB0E8', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.85 }),
                el('path', { d: 'M24.4 54.4 L23 58.6 M23 58.6 L20.6 59.4 M23 58.6 L25.4 59.4 M39.6 54.4 L41 58.6 M41 58.6 L38.6 59.4 M41 58.6 L43.4 59.4', fill: 'none', stroke: '#F59A4A', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                el('path', {
                    d: 'M32 10 C45.4 10 52 20.6 52 33.4 C52 46.6 43.6 56 32 56 C20.4 56 12 46.6 12 33.4 C12 20.6 18.6 10 32 10 Z',
                    fill: 'url(#mt-body)', stroke: OL, strokeWidth: SW,
                }),
                el('path', { d: 'M13.4 30.4 C7.6 37 8.4 48.6 17.6 54.6 C16.2 46.4 15.6 38.4 13.4 30.4 Z', fill: 'url(#mt-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: mirror('M13.4 30.4 C7.6 37 8.4 48.6 17.6 54.6 C16.2 46.4 15.6 38.4 13.4 30.4 Z'), fill: 'url(#mt-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M9.8 45.6 C10.6 49.4 13.4 52.6 17.6 54.6 C17 52 16.6 49.6 16.2 47.2 Z', fill: '#343A52' }),
                el('path', { d: mirror('M9.8 45.6 C10.6 49.4 13.4 52.6 17.6 54.6 C17 52 16.6 49.6 16.2 47.2 Z'), fill: '#343A52' }),
                el('ellipse', { cx: 21.6, cy: 18.6, rx: 5.4, ry: 2.4, fill: '#FFFFFF', opacity: 0.95, transform: 'rotate(-32 21.6 18.6)' }),
                // çatık kaşlar
                el('path', { d: 'M20.4 23 L28.2 25.4 M43.6 23 L35.8 25.4', fill: 'none', stroke: '#8C98B2', strokeWidth: 2, strokeLinecap: 'round' }),
                ...eye(24.6, 29, 2.6, 3.1),
                ...eye(39.4, 29, 2.6, 3.1),
                el('path', { d: 'M26.4 33.4 Q32 31.4 37.6 33.4 L32.8 42.4 Q32 43.4 31.2 42.4 Z', fill: 'url(#mt-beak)', stroke: OL, strokeWidth: 1.4, strokeLinejoin: 'round' }),
                el('path', { d: 'M28.4 36.6 Q32 37.8 35.6 36.6', fill: 'none', stroke: '#C98314', strokeWidth: 0.9, strokeLinecap: 'round' }),
                el('circle', { cx: 33.4, cy: 39.2, r: 1.15, fill: '#E8413C' }),
                blush(18.6, 37, '#FFA3B4', 2.8, 1.7),
                blush(45.4, 37, '#FFA3B4', 2.8, 1.7),
            ],
        },
    },

    /* 18 ─ Zümrüdüanka (bonus, epic) ─────────────────────────── */
    {
        id: 'mini:zumruduanka',
        category: 'mini_avatar',
        name: 'Zümrüdüanka',
        rarity: 'epic',
        description: 'Kaf Dağı\'nın ardından gelen efsanevi kuş; zümrüt kanatlı, altın tüylü.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('za-glow', [stop(0, '#7CF2C2', 0.5), stop(0.6, '#F6D06B', 0.2), stop(1, '#F6D06B', 0)], 0.5, 0.5, 0.5),
                lin('za-wing', [stop(0, '#7CF5C4'), stop(0.55, '#19B07A'), stop(1, '#0B6B4E')], 0, 0, 1, 1),
                lin('za-wing-r', [stop(0, '#7CF5C4'), stop(0.55, '#19B07A'), stop(1, '#0B6B4E')], 1, 0, 0, 1),
                lin('za-gold', [stop(0, '#FFF0A8'), stop(1, '#E0A232')]),
                rad('za-body', [stop(0, '#6FEDB9'), stop(1, '#0F8C62')], 0.42, 0.3, 0.8),
                lin('za-tail', [stop(0, '#19B07A'), stop(1, '#0A5C5A')]),
                rad('za-eye', [stop(0, '#7CF5C4'), stop(0.5, '#0F8C62'), stop(1, '#E0A232')], 0.5, 0.5, 0.5),
            ],
            elements: [
                el('g', {}, [el('circle', { cx: 32, cy: 32, r: 30, fill: 'url(#za-glow)' })], 'pulse'),
                // kuyruk tüyleri
                el('path', { d: 'M30.4 43 C28 49.6 23.6 53.6 17.4 55.4 C13.8 57 14.6 62.6 19.8 62.4 C26.2 61.8 30.4 55.4 31.6 47.6 Z', fill: 'url(#za-tail)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: mirror('M30.4 43 C28 49.6 23.6 53.6 17.4 55.4 C13.8 57 14.6 62.6 19.8 62.4 C26.2 61.8 30.4 55.4 31.6 47.6 Z'), fill: 'url(#za-tail)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M32 42 C28.6 49.4 28 56.4 32 63 C36 56.4 35.4 49.4 32 42 Z', fill: 'url(#za-tail)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('circle', { cx: 18.4, cy: 59, r: 2.3, fill: 'url(#za-eye)', stroke: OL, strokeWidth: 0.9 }),
                el('circle', { cx: 45.6, cy: 59, r: 2.3, fill: 'url(#za-eye)', stroke: OL, strokeWidth: 0.9 }),
                el('circle', { cx: 32, cy: 57, r: 2.3, fill: 'url(#za-eye)', stroke: OL, strokeWidth: 0.9 }),
                // kanatlar: zümrüt dış (tüy dilimli), altın iç tüyler
                el('path', { d: WING_O, fill: 'url(#za-wing)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: mirror(WING_O), fill: 'url(#za-wing-r)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: WING_I, fill: 'url(#za-gold)', stroke: OL, strokeWidth: 1.1, strokeLinejoin: 'round' }),
                el('path', { d: mirror(WING_I), fill: 'url(#za-gold)', stroke: OL, strokeWidth: 1.1, strokeLinejoin: 'round' }),
                el('path', { d: WING_V, fill: 'none', stroke: '#C9FBE4', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.65 }),
                el('path', { d: mirror(WING_V), fill: 'none', stroke: '#C9FBE4', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.65 }),
                // gövde
                el('path', { d: 'M32 22.4 C37.4 22.4 39.6 28.6 38.6 34.6 C37.6 40.4 35.2 44.6 32 46.6 C28.8 44.6 26.4 40.4 25.4 34.6 C24.4 28.6 26.6 22.4 32 22.4 Z', fill: 'url(#za-body)', stroke: OL, strokeWidth: SW }),
                el('path', { d: 'M32 30 C35 30 35.8 34 35 37.4 C34.4 40.2 33.2 42.4 32 43.4 C30.8 42.4 29.6 40.2 29 37.4 C28.2 34 29 30 32 30 Z', fill: 'url(#za-gold)', opacity: 0.95 }),
                el('path', { d: 'M29.8 34.4 Q32 35.6 34.2 34.4 M30.2 37.8 Q32 39 33.8 37.8', fill: 'none', stroke: '#C98A1E', strokeWidth: 0.8, strokeLinecap: 'round' }),
                // taç tüyleri
                el('path', { d: 'M32 13 C30.6 9.4 30.8 6 32 3.4 C33.2 6 33.4 9.4 32 13 Z', fill: 'url(#za-wing)', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('path', { d: 'M30 13.6 C27.6 11.2 25.6 8.6 25 5.6 C27.8 7 29.8 9.6 30.8 12.6 Z', fill: 'url(#za-wing)', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('path', { d: mirror('M30 13.6 C27.6 11.2 25.6 8.6 25 5.6 C27.8 7 29.8 9.6 30.8 12.6 Z'), fill: 'url(#za-wing-r)', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('circle', { cx: 32, cy: 3.4, r: 1.6, fill: 'url(#za-gold)', stroke: OL, strokeWidth: 0.8 }),
                el('circle', { cx: 25, cy: 5.6, r: 1.3, fill: 'url(#za-gold)', stroke: OL, strokeWidth: 0.8 }),
                el('circle', { cx: 39, cy: 5.6, r: 1.3, fill: 'url(#za-gold)', stroke: OL, strokeWidth: 0.8 }),
                // baş
                el('circle', { cx: 32, cy: 19, r: 7.2, fill: 'url(#za-body)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 29.4, cy: 15.6, rx: 2.6, ry: 1.2, fill: '#FFFFFF', opacity: 0.4, transform: 'rotate(-30 29.4 15.6)' }),
                ...eye(29.2, 18.6, 1.7, 2),
                ...eye(34.8, 18.6, 1.7, 2),
                el('path', { d: 'M30.4 21.6 L33.6 21.6 L32 25 Z', fill: 'url(#za-gold)', stroke: OL, strokeWidth: 0.9, strokeLinejoin: 'round' }),
                el('g', {}, [
                    spark(53, 8, 3.4, '#FFE69A'),
                    spark(9.6, 30, 2.4, '#FFE69A'),
                    spark(56, 34, 2, '#C9FBE4'),
                ], 'twinkle'),
            ],
        },
    },

    /* 19 ─ Minik Çip (common) — Keşif Koleksiyonu ──────────────── */
    {
        id: 'mini:minik-cip',
        category: 'mini_avatar',
        name: 'Minik Çip',
        rarity: 'common',
        description: 'Gülümseyen küçük bir veri çipi; bacakları devre yolu.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                lin('mc-board', [stop(0, '#5BE0C6'), stop(0.55, '#26B39D'), stop(1, '#14766F')], 0, 0, 1, 1),
                lin('mc-die', [stop(0, '#34416E'), stop(1, '#161E3C')]),
                lin('mc-pin', [stop(0, '#FFE58A'), stop(1, '#E3A52B')], 0, 0, 1, 0),
                lin('mc-pin-v', [stop(0, '#FFE58A'), stop(1, '#E3A52B')], 0, 0, 0, 1),
            ],
            elements: [
                shadow(15, 61),
                // devre yolu bacaklar
                el('path', { d: 'M24 49 L24 55 L19 55 L19 59 M40 49 L40 55 L45 55 L45 59', fill: 'none', stroke: OL, strokeWidth: 4.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                el('path', { d: 'M24 49 L24 55 L19 55 L19 59 M40 49 L40 55 L45 55 L45 59', fill: 'none', stroke: '#7FF0D8', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                el('circle', { cx: 19, cy: 59.4, r: 2.3, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 45, cy: 59.4, r: 2.3, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: SW_D }),
                // yan pimler
                el('rect', { x: 11, y: 18, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 11, y: 28, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 11, y: 38, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 48, y: 18, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 48, y: 28, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 48, y: 38, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 20, y: 6, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin-v)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 29.5, y: 6, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin-v)', stroke: OL, strokeWidth: 1.2 }),
                el('rect', { x: 39, y: 6, width: 5, height: 5, rx: 1.2, fill: 'url(#mc-pin-v)', stroke: OL, strokeWidth: 1.2 }),
                // kart gövdesi
                el('rect', { x: 14, y: 9, width: 36, height: 41, rx: 8, fill: 'url(#mc-board)', stroke: OL, strokeWidth: SW }),
                // devre izleri
                el('path', { d: 'M18 16 L23 16 L23 20 M46 16 L41 16 L41 20 M18 44 L24 44 M46 44 L40 44', fill: 'none', stroke: '#C2FFF2', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.7 }),
                el('circle', { cx: 18, cy: 16, r: 1.2, fill: '#C2FFF2', opacity: 0.8 }),
                el('circle', { cx: 46, cy: 16, r: 1.2, fill: '#C2FFF2', opacity: 0.8 }),
                // çip çekirdeği
                el('rect', { x: 20, y: 17, width: 24, height: 25, rx: 5.4, fill: 'url(#mc-die)', stroke: OL, strokeWidth: SW_D }),
                el('rect', { x: 22, y: 19, width: 12, height: 2.2, rx: 1.1, fill: '#FFFFFF', opacity: 0.22 }),
                el('path', { d: 'M24.6 29.6 Q27.2 26 29.8 29.6 M34.2 29.6 Q36.8 26 39.4 29.6', fill: 'none', stroke: '#62F4F0', strokeWidth: 2.4, strokeLinecap: 'round' }),
                el('path', { d: 'M28.6 34.4 Q32 38 35.4 34.4', fill: 'none', stroke: '#62F4F0', strokeWidth: 2, strokeLinecap: 'round' }),
                blush(23.6, 34.8, '#FF7E9C', 2.2, 1.4),
                blush(40.4, 34.8, '#FF7E9C', 2.2, 1.4),
                el('ellipse', { cx: 21.4, cy: 13.4, rx: 4.8, ry: 1.8, fill: '#FFFFFF', opacity: 0.4, transform: 'rotate(-12 21.4 13.4)' }),
            ],
        },
    },

    /* 20 ─ Kurye Robotu (common) — Keşif Koleksiyonu ───────────── */
    {
        id: 'mini:kurye-robotu',
        category: 'mini_avatar',
        name: 'Kurye Robotu',
        rarity: 'common',
        description: 'Sırtında minik koli taşıyan, hiç yorulmayan teslimat robotu.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                lin('kr-metal', [stop(0, '#F3F6FC'), stop(1, '#AEBBD3')]),
                lin('kr-screen', [stop(0, '#2B3A66'), stop(1, '#141C38')]),
                lin('kr-cap', [stop(0, '#FFA45A'), stop(1, '#EA5F2A')]),
                lin('kr-box', [stop(0, '#E8B777'), stop(1, '#B9803F')], 0, 0, 1, 1),
                rad('kr-wheel', [stop(0, '#5B6486'), stop(1, '#262C48')], 0.4, 0.35, 0.7),
            ],
            elements: [
                shadow(18, 61),
                // sırttaki koli
                el('g', { transform: 'rotate(9 46 22)' }, [
                    el('rect', { x: 36, y: 8, width: 24, height: 22, rx: 3, fill: 'url(#kr-box)', stroke: OL, strokeWidth: SW }),
                    el('rect', { x: 45, y: 8, width: 6, height: 22, fill: '#F6DDB0', stroke: OL, strokeWidth: 1 }),
                    el('rect', { x: 39, y: 15, width: 4.4, height: 5.4, rx: 1, fill: '#FFFFFF', opacity: 0.9 }),
                    el('path', { d: 'M40 17.4 L42.4 17.4 M40 19 L42.4 19', fill: 'none', stroke: '#B9803F', strokeWidth: 0.7, strokeLinecap: 'round' }),
                ]),
                // koli askısı
                el('path', { d: 'M40 34 C37 28 34 27 31 28', fill: 'none', stroke: OL, strokeWidth: 3.6, strokeLinecap: 'round' }),
                el('path', { d: 'M40 34 C37 28 34 27 31 28', fill: 'none', stroke: '#FF7A45', strokeWidth: 1.6, strokeLinecap: 'round' }),
                // tekerlek gövde
                el('rect', { x: 18, y: 41, width: 28, height: 11, rx: 5, fill: '#8F9DB9', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 24, cy: 54, r: 5.4, fill: 'url(#kr-wheel)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 24, cy: 54, r: 2, fill: '#C7D0E6' }),
                el('circle', { cx: 40, cy: 54, r: 5.4, fill: 'url(#kr-wheel)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 40, cy: 54, r: 2, fill: '#C7D0E6' }),
                // kafa
                el('rect', { x: 11, y: 17, width: 42, height: 31, rx: 10, fill: 'url(#kr-metal)', stroke: OL, strokeWidth: SW }),
                el('rect', { x: 15.5, y: 22.5, width: 33, height: 20, rx: 6.5, fill: 'url(#kr-screen)', stroke: OL, strokeWidth: SW_D }),
                el('path', { d: 'M20.4 33 Q24.2 27.6 28 33 M36 33 Q39.8 27.6 43.6 33', fill: 'none', stroke: '#62F4F0', strokeWidth: 2.6, strokeLinecap: 'round' }),
                el('path', { d: 'M28.4 37 Q32 39.8 35.6 37', fill: 'none', stroke: '#62F4F0', strokeWidth: 1.8, strokeLinecap: 'round' }),
                el('circle', { cx: 19.8, cy: 37.6, r: 1.5, fill: '#FF6B6B', opacity: 0.75 }),
                el('circle', { cx: 44.2, cy: 37.6, r: 1.5, fill: '#FF6B6B', opacity: 0.75 }),
                el('rect', { x: 5.4, y: 28, width: 6.4, height: 12, rx: 2.4, fill: '#8F9DB9', stroke: OL, strokeWidth: SW_D }),
                // kurye şapkası
                el('path', { d: 'M13 21 C13 10 22 6 32 6 C42 6 51 10 51 21 Z', fill: 'url(#kr-cap)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M9.6 21.6 C20 18.6 44 18.6 54.4 21.6 C54.4 24.4 50 25 32 25 C14 25 9.6 24.4 9.6 21.6 Z', fill: '#C8481C', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('circle', { cx: 32, cy: 13.6, r: 3.6, fill: '#FFF2DA', stroke: OL, strokeWidth: 1.2 }),
                el('path', { d: 'M30.2 13.6 L33.8 13.6 M32 11.8 L32 15.4', fill: 'none', stroke: '#EA5F2A', strokeWidth: 1.2, strokeLinecap: 'round' }),
                el('ellipse', { cx: 21, cy: 11.6, rx: 4.2, ry: 1.7, fill: '#FFFFFF', opacity: 0.4, transform: 'rotate(-26 21 11.6)' }),
            ],
        },
    },

    /* 21 ─ Süzülen Tahta (rare) — Keşif Koleksiyonu ────────────── */
    {
        id: 'mini:suzulen-tahta',
        category: 'mini_avatar',
        name: 'Süzülen Tahta',
        rarity: 'rare',
        description: 'Yerden bir karış yukarıda süzülen neon hover tahta.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('st-halo', [stop(0, '#62F4F0', 0.5), stop(1, '#62F4F0', 0)], 0.5, 0.5, 0.5),
                rad('st-under', [stop(0, '#7DF4FF', 0.9), stop(0.55, '#3B9BFF', 0.35), stop(1, '#3B9BFF', 0)], 0.5, 0.5, 0.5),
                lin('st-deck', [stop(0, '#3A4A86'), stop(0.5, '#222C5C'), stop(1, '#131A3C')], 0, 0, 0, 1),
                lin('st-side', [stop(0, '#1B2350'), stop(1, '#0C1128')]),
                lin('st-neon', [stop(0, '#FF6FD0'), stop(0.5, '#B27CFF'), stop(1, '#62F4F0')], 0, 0, 1, 0),
            ],
            elements: [
                el('ellipse', { cx: 32, cy: 33, rx: 30, ry: 22, fill: 'url(#st-halo)' }),
                el('ellipse', { cx: 32, cy: 58.4, rx: 15, ry: 2.4, fill: OL, opacity: 0.2 }),
                el('ellipse', { cx: 32, cy: 52, rx: 21, ry: 6.4, fill: 'url(#st-under)' }),
                // gövde yan yüzü
                el('path', { d: 'M5.6 36.4 C5.6 42.6 14 46.6 32 46.6 C50 46.6 58.4 42.6 58.4 36.4 L58.4 32.4 L5.6 32.4 Z', fill: 'url(#st-side)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                // üst yüz
                el('path', { d: 'M4.6 32.4 C4.6 25.6 14 21.6 32 21.6 C50 21.6 59.4 25.6 59.4 32.4 C59.4 39.2 50 43.2 32 43.2 C14 43.2 4.6 39.2 4.6 32.4 Z', fill: 'url(#st-deck)', stroke: OL, strokeWidth: SW }),
                // neon kenar çizgisi
                el('path', { d: 'M8.4 32.4 C8.4 27.6 17 24.6 32 24.6 C47 24.6 55.6 27.6 55.6 32.4 C55.6 37.2 47 40.2 32 40.2 C17 40.2 8.4 37.2 8.4 32.4 Z', fill: 'none', stroke: 'url(#st-neon)', strokeWidth: 1.7 }),
                // yıldız çıkartması
                el('path', { d: 'M32 27.4 L33.6 31 L37.4 31.4 L34.6 34 L35.4 37.8 L32 35.9 L28.6 37.8 L29.4 34 L26.6 31.4 L30.4 31 Z', fill: '#FFE45E', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('ellipse', { cx: 18, cy: 27.4, rx: 7, ry: 1.7, fill: '#FFFFFF', opacity: 0.2, transform: 'rotate(-10 18 27.4)' }),
                // itici ışıkları
                el('ellipse', { cx: 16, cy: 45.4, rx: 3.6, ry: 1.4, fill: '#B8FBFF' }),
                el('ellipse', { cx: 48, cy: 45.4, rx: 3.6, ry: 1.4, fill: '#B8FBFF' }),
                // rüzgâr çizgileri ve parıltılar
                el('path', { d: 'M3 18 L12 18 M7 22.6 L14 22.6 M52 16 L61 16', fill: 'none', stroke: '#B9E8FF', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.6 }),
                spark(50, 11, 3.2, '#FFFFFF', 0.95),
                spark(12, 9, 2.2, '#9FF7FF', 0.9),
            ],
        },
    },

    /* 22 ─ Neon Kedi (rare) — Keşif Koleksiyonu ────────────────── */
    {
        id: 'mini:neon-kedi',
        category: 'mini_avatar',
        name: 'Neon Kedi',
        rarity: 'rare',
        description: 'Tabelalardan ışık toplayan, kuyruğu neon tüp olan kedi.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('nk-glow', [stop(0, '#FF4FB4', 0.4), stop(1, '#FF4FB4', 0)], 0.5, 0.5, 0.5),
                rad('nk-fur', [stop(0, '#6A5BC2'), stop(0.6, '#3E3394'), stop(1, '#241C5E')], 0.4, 0.28, 0.85),
                rad('nk-iris', [stop(0, '#B8FFF6'), stop(1, '#19C9C0')], 0.5, 0.55, 0.6),
            ],
            elements: [
                el('ellipse', { cx: 34, cy: 34, rx: 30, ry: 28, fill: 'url(#nk-glow)' }),
                shadow(16, 61),
                // neon kuyruk (dış parıltı, orta, çekirdek)
                el('path', { d: 'M44 54 C54 57 60 50 56 43.5 C54 40 50 40.6 51.4 43.6 C52.2 45.4 54.4 45 55 43.6', fill: 'none', stroke: '#FF2E97', strokeWidth: 7, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.22 }),
                el('path', { d: 'M44 54 C54 57 60 50 56 43.5 C54 40 50 40.6 51.4 43.6 C52.2 45.4 54.4 45 55 43.6', fill: 'none', stroke: '#FF4FB4', strokeWidth: 3.8, strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 0.6 }),
                el('path', { d: 'M44 54 C54 57 60 50 56 43.5 C54 40 50 40.6 51.4 43.6 C52.2 45.4 54.4 45 55 43.6', fill: 'none', stroke: '#FFE0F1', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
                // gövde
                el('path', { d: 'M32 30 C42 30 47 40 46 49 C45.5 55 40 58.6 32 58.6 C24 58.6 18.5 55 18 49 C17 40 22 30 32 30 Z', fill: 'url(#nk-fur)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 32, cy: 50, rx: 7, ry: 6.4, fill: '#8F83E0', opacity: 0.55 }),
                el('path', { d: 'M23.6 57.6 Q23.6 59.8 26.6 59.8 Q29.4 59.8 29.4 57.6 M34.6 57.6 Q34.6 59.8 37.4 59.8 Q40.4 59.8 40.4 57.6', fill: '#6A5BC2', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                // kulaklar
                el('path', { d: 'M15 24 L13 7 L27 15 Z', fill: 'url(#nk-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M17.4 20.4 L16.4 11.4 L23.4 15.4 Z', fill: '#FF4FB4' }),
                el('path', { d: 'M49 24 L51 7 L37 15 Z', fill: 'url(#nk-fur)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M46.6 20.4 L47.6 11.4 L40.6 15.4 Z', fill: '#FF4FB4' }),
                // kafa
                el('ellipse', { cx: 32, cy: 29, rx: 19, ry: 15.6, fill: 'url(#nk-fur)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 22, cy: 21.6, rx: 5.4, ry: 2.2, fill: '#FFFFFF', opacity: 0.22, transform: 'rotate(-24 22 21.6)' }),
                // neon yanak çizgileri (bıyık)
                el('path', { d: 'M9.6 29 L16.6 30.2 M10.4 34 L16.8 32.6 M54.4 29 L47.4 30.2 M53.6 34 L47.2 32.6', fill: 'none', stroke: '#62F4F0', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.9 }),
                // gözler
                el('ellipse', { cx: 24.4, cy: 28, rx: 4.2, ry: 5, fill: OL }),
                el('ellipse', { cx: 39.6, cy: 28, rx: 4.2, ry: 5, fill: OL }),
                el('ellipse', { cx: 24.4, cy: 29, rx: 3, ry: 3.6, fill: 'url(#nk-iris)' }),
                el('ellipse', { cx: 39.6, cy: 29, rx: 3, ry: 3.6, fill: 'url(#nk-iris)' }),
                el('ellipse', { cx: 24.4, cy: 29.2, rx: 1.1, ry: 2.5, fill: OL }),
                el('ellipse', { cx: 39.6, cy: 29.2, rx: 1.1, ry: 2.5, fill: OL }),
                el('circle', { cx: 25.8, cy: 26.4, r: 1.5, fill: '#FFFFFF' }),
                el('circle', { cx: 41, cy: 26.4, r: 1.5, fill: '#FFFFFF' }),
                el('path', { d: 'M30 33.4 L34 33.4 L32 35.6 Z', fill: '#FF6FA8', stroke: OL, strokeWidth: 1, strokeLinejoin: 'round' }),
                el('path', { d: 'M32 35.6 Q30.6 38 28.2 37 M32 35.6 Q33.4 38 35.8 37', fill: 'none', stroke: OL, strokeWidth: 1.3, strokeLinecap: 'round' }),
                blush(19.4, 34.4, '#FF7AC8', 3, 1.8),
                blush(44.6, 34.4, '#FF7AC8', 3, 1.8),
                el('g', {}, [spark(8, 14, 3, '#FFFFFF', 0.95), spark(58, 18, 2.2, '#9FF7FF', 0.95)]),
            ],
        },
    },

    /* 23 ─ Portal Minik (epic) — Keşif Koleksiyonu ─────────────── */
    {
        id: 'mini:portal-minik',
        category: 'mini_avatar',
        name: 'Portal Minik',
        rarity: 'epic',
        description: 'Portaldan başını uzatan meraklı küçük yaratık.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('pm-glow', [stop(0, '#3AA0FF', 0.5), stop(0.65, '#3AA0FF', 0.15), stop(1, '#3AA0FF', 0)], 0.5, 0.5, 0.5),
                rad('pm-void', [stop(0, '#0A1030'), stop(0.7, '#17255E'), stop(1, '#2B5BD0')], 0.5, 0.5, 0.5),
                lin('pm-rim', [stop(0, '#9FD6FF'), stop(0.5, '#3AA0FF'), stop(1, '#1E5FD6')], 0, 0, 0, 1),
                rad('pm-body', [stop(0, '#C7B8FF'), stop(0.6, '#8F78F0'), stop(1, '#5A44C2')], 0.4, 0.3, 0.8),
                rad('pm-eye', [stop(0, '#FFFFFF'), stop(1, '#E8EEFF')], 0.5, 0.5, 0.6),
            ],
            elements: [
                el('g', {}, [el('ellipse', { cx: 32, cy: 42, rx: 30, ry: 20, fill: 'url(#pm-glow)' })], 'pulse'),
                // portal ovali (arka)
                el('ellipse', { cx: 32, cy: 46, rx: 24, ry: 10.6, fill: 'url(#pm-void)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 32, cy: 46, rx: 19, ry: 7.4, fill: 'none', stroke: '#6FB8FF', strokeWidth: 1.1, opacity: 0.6 }),
                // yaratık
                el('path', { d: 'M23 48 C21 38 24 28 32 28 C40 28 43 38 41 48 Z', fill: 'url(#pm-body)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                el('path', { d: 'M24 11 C22 6 18 5 15 7 C18 8 19 11 20 14 Z', fill: '#8F78F0', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('path', { d: 'M40 11 C42 6 46 5 49 7 C46 8 45 11 44 14 Z', fill: '#8F78F0', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                el('circle', { cx: 32, cy: 24, r: 14, fill: 'url(#pm-body)', stroke: OL, strokeWidth: SW }),
                el('ellipse', { cx: 26, cy: 15.6, rx: 5, ry: 2.2, fill: '#FFFFFF', opacity: 0.45, transform: 'rotate(-26 26 15.6)' }),
                // meraklı bakış (yukarı-yana)
                el('circle', { cx: 26, cy: 24, r: 4.6, fill: 'url(#pm-eye)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 38, cy: 24, r: 4.6, fill: 'url(#pm-eye)', stroke: OL, strokeWidth: SW_D }),
                el('circle', { cx: 27.4, cy: 23, r: 2.4, fill: OL }),
                el('circle', { cx: 39.4, cy: 23, r: 2.4, fill: OL }),
                el('circle', { cx: 28.2, cy: 22, r: 0.9, fill: '#FFFFFF' }),
                el('circle', { cx: 40.2, cy: 22, r: 0.9, fill: '#FFFFFF' }),
                el('ellipse', { cx: 32, cy: 31, rx: 2.2, ry: 1.7, fill: OL }),
                blush(21, 29.4, '#FF8FB4', 2.8, 1.7),
                blush(43, 29.4, '#FF8FB4', 2.8, 1.7),
                // portal ön kenarı (alt yarı) — yaratığın bedenini örter
                el('path', { d: 'M8 46 C8 56 18 60 32 60 C46 60 56 56 56 46 C56 51 46 54.8 32 54.8 C18 54.8 8 51 8 46 Z', fill: 'url(#pm-rim)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                // portal kenarını tutan eller
                el('ellipse', { cx: 19.4, cy: 49.6, rx: 3.8, ry: 3, fill: '#A892FF', stroke: OL, strokeWidth: SW_D }),
                el('ellipse', { cx: 44.6, cy: 49.6, rx: 3.8, ry: 3, fill: '#A892FF', stroke: OL, strokeWidth: SW_D }),
                el('g', {}, [
                    spark(55, 24, 3.4, '#BFE4FF'),
                    spark(8, 30, 2.4, '#FFFFFF'),
                    spark(50, 8, 2, '#9FD6FF'),
                ], 'shimmer'),
            ],
        },
    },

    /* 24 ─ Holo Balina (legendary) — Keşif Koleksiyonu ─────────── */
    {
        id: 'mini:holo-balina',
        category: 'mini_avatar',
        name: 'Holo Balina',
        rarity: 'legendary',
        description: 'Gökdelenlerin arasında süzülen, ışıktan yapılmış dev ama sevimli balina.',
        art: {
            viewBox: '0 0 64 64',
            defs: [
                rad('hb-aura', [stop(0, '#9FF7FF', 0.55), stop(0.55, '#B27CFF', 0.22), stop(1, '#FF8AD8', 0)], 0.5, 0.5, 0.5),
                lin('hb-body', [stop(0, '#8CF8FF'), stop(0.45, '#8FA8FF'), stop(1, '#E58BFF')], 0, 0, 1, 1),
                lin('hb-belly', [stop(0, '#E6FEFF'), stop(1, '#C9D4FF')]),
                lin('hb-fluke', [stop(0, '#7FF0FF'), stop(1, '#C07DFF')], 0, 0, 1, 1),
                rad('hb-eye', [stop(0, '#FFFFFF'), stop(1, '#D6E4FF')], 0.5, 0.5, 0.6),
            ],
            elements: [
                el('g', {}, [el('circle', { cx: 32, cy: 33, r: 31, fill: 'url(#hb-aura)' })], 'pulse'),
                // gökdelen silüetleri (uzak)
                el('path', { d: 'M3 63 L3 52 L8 52 L8 46 L13 46 L13 63 Z M51 63 L51 49 L56 49 L56 43 L61 43 L61 63 Z', fill: '#2A3A86', opacity: 0.55 }),
                el('g', {}, [
                    // fıskiye parıltıları
                    el('path', { d: 'M40 15 C40 10 38 7 36 4 M40 15 C42 10 45 8 48 6', fill: 'none', stroke: '#CFFBFF', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.85 }),
                    el('circle', { cx: 36, cy: 3.6, r: 1.4, fill: '#FFFFFF' }),
                    el('circle', { cx: 48.4, cy: 5.8, r: 1.2, fill: '#FFFFFF' }),
                    // kuyruk
                    el('path', { d: 'M17 38 C12 36 9 31 8.6 26 C8 22 7 18 5.4 14 C9.6 14.6 12.6 16.6 14.4 20 C15.6 16 18.6 13 22 11.4 C22 16.4 21.4 21.4 22.4 26 Z', fill: 'url(#hb-fluke)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                    // gövde
                    el('path', { d: 'M58 38 C58 25 48 16 34 16.4 C23 16.8 14.6 24 13.4 34.6 C12.8 39.6 14.6 44.4 19.6 47.4 C26 51.4 38 52.4 47.2 48.4 C54.4 45.4 58 42 58 38 Z', fill: 'url(#hb-body)', stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
                    // karın
                    el('path', { d: 'M56.4 39.4 C53 45.4 44 49.6 34 49.8 C27 49.8 21 48 18 45.4 C24 47 32 46.4 40 43 C47 40 52 38 56.4 39.4 Z', fill: 'url(#hb-belly)', opacity: 0.92 }),
                    el('path', { d: 'M24 46 L31 40.6 M30 47.6 L37 42.4 M36 48.2 L43 43.4 M42 47.6 L48.6 43.4', fill: 'none', stroke: '#8FA8FF', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.55 }),
                    // hologram tarama çizgileri
                    el('path', { d: 'M22 26 L50 24.6 M17.6 31.4 L56 30 M15.6 36.4 L25 36', fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.35 }),
                    el('ellipse', { cx: 31, cy: 21.4, rx: 9, ry: 2.4, fill: '#FFFFFF', opacity: 0.5, transform: 'rotate(-6 31 21.4)' }),
                    // yüzgeç
                    el('path', { d: 'M33 43 C30 49 24 52 19 52.4 C22 49 24.4 46 25.6 42.4 Z', fill: 'url(#hb-fluke)', stroke: OL, strokeWidth: SW_D, strokeLinejoin: 'round' }),
                    // göz ve yüz
                    el('circle', { cx: 46, cy: 33, r: 4.6, fill: 'url(#hb-eye)', stroke: OL, strokeWidth: SW_D }),
                    el('circle', { cx: 46.8, cy: 33.4, r: 2.6, fill: OL }),
                    el('circle', { cx: 47.8, cy: 32.2, r: 1, fill: '#FFFFFF' }),
                    el('circle', { cx: 45.4, cy: 34.6, r: 0.5, fill: '#FFFFFF', opacity: 0.85 }),
                    el('path', { d: 'M52.6 41.4 Q49 43.8 45.6 42', fill: 'none', stroke: OL, strokeWidth: 1.5, strokeLinecap: 'round' }),
                    blush(41.2, 38.8, '#FF7AC8', 2.6, 1.6),
                ], 'float'),
                el('g', {}, [
                    spark(10, 8, 3.4, '#FFFFFF'),
                    spark(58, 28, 2.6, '#FFE9A8'),
                    spark(6, 46, 2.2, '#9FF7FF'),
                    spark(30, 6, 2, '#FFFFFF'),
                ], 'twinkle'),
            ],
        },
    },
];
