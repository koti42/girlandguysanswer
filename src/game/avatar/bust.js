/*
 * Oyun karakterinin 2D yarım boy portresi (profil kartı, liderlik, editör
 * ızgarası).
 *
 * Saf veri: React/DOM yok. `buildBust(config)` bir SVG eleman ağacı döndürür;
 * web `components/game/avatar/AvatarBust.jsx` bunu DOM SVG'ye, mobil
 * `AvatarBust.js` react-native-svg'ye (Path/Circle/Ellipse/Rect/G) eşler. Dosya
 * mobile birebir kopyalanır, bu yüzden:
 *  - yalnızca path/circle/ellipse/rect/g etiketleri,
 *  - yalnızca ALLOWED_PROPS'taki prop'lar (strokeLinecap, gradient, filter,
 *    clipPath, text YOK — react-native-svg ile birebir aynı görünsün),
 *  - değerler sayı ya da düz metin (renk, path verisi, transform).
 *
 * Tuval 120x120. Çizim sırası: arka saç -> boyun -> gövde/üst giysi -> öndeki
 * saç tutamları -> kulak -> baş -> yüz -> ön saç -> aksesuar. Alt giysi,
 * ayakkabı ve koşu izi portrede görünmez (3D'de görünür).
 *
 * 32 px'te de okunsun diye ana hatlar koyu kenarlı, gözler iri; ayrıntılar
 * (kaş, kirpik, dikiş) küçük boyutta kaybolsa da siluet bozulmaz.
 */

import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, normalizeAvatar } from './catalog.js';

export const BUST_VIEWBOX = '0 0 120 120';

export const ALLOWED_TAGS = ['path', 'circle', 'ellipse', 'rect', 'g'];

export const ALLOWED_PROPS = [
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height',
    'fill', 'stroke', 'strokeWidth', 'opacity', 'transform',
];

/* ------------------------------------------------------------------ */
/* Renk yardımcıları                                                   */
/* ------------------------------------------------------------------ */

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** `amt` > 0 beyaza, < 0 siyaha doğru karıştırır (-1..1). */
export function shade(hex, amt) {
    const v = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!v) return hex;
    const n = parseInt(v[1], 16);
    const mix = (c) => (amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
    return `#${hex2(mix((n >> 16) & 255))}${hex2(mix((n >> 8) & 255))}${hex2(mix(n & 255))}`.toUpperCase();
}

/** Algılanan parlaklık 0..1 (açık kumaşta koyu, koyu kumaşta açık ayrıntı için). */
function luma(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const contrast = (hex) => (luma(hex) > 0.62 ? '#1F2937' : '#FFFFFF');

/* ------------------------------------------------------------------ */
/* Eleman kurucular                                                     */
/* ------------------------------------------------------------------ */

const path = (d, fill, extra) => ({ tag: 'path', props: { d, fill, ...extra } });
const circle = (cx, cy, r, fill, extra) => ({ tag: 'circle', props: { cx, cy, r, fill, ...extra } });
const ellipse = (cx, cy, rx, ry, fill, extra) => ({ tag: 'ellipse', props: { cx, cy, rx, ry, fill, ...extra } });
const rect = (x, y, width, height, rx, fill, extra) => ({
    tag: 'rect',
    props: { x, y, width, height, ...(rx ? { rx } : {}), fill, ...extra },
});
const group = (children, transform) => ({ tag: 'g', props: transform ? { transform } : {}, children });
const line = (d, stroke, strokeWidth, extra) => path(d, 'none', { stroke, strokeWidth, ...extra });

// Yatay ayna: sol tarafta çizilen şeklin sağ eşi.
const MIRROR = 'translate(120 0) scale(-1 1)';
const mirrored = (els) => [...els, group(els, MIRROR)];

const INK = '#231A33';
const MOUTH = '#9B3B4C';
const BLUSH = '#FF9AAC';

// Aksesuar renkleri 3D modelle (build3d.js ACC) aynı: iki görünüm tutarlı olsun.
const ACC = {
    capMain: '#FF6B6B', capPanel: '#FFF4EC', beanie: '#E2B94C', beanieCuff: '#C79A33', pom: '#FFF4DD',
    frame: '#2A2440', gold: '#F2C14E', goldEdge: '#A87A1E', lens: '#1B1530', phone: '#F6F3FF',
    phoneEdge: '#A59CC9', phoneCushion: '#FF6B9E', earInner: '#FFA8C5', gems: ['#FF3B6B', '#38BDF8', '#34F5A0'],
};

/* ------------------------------------------------------------------ */
/* Gövde ve üst giysi                                                   */
/* ------------------------------------------------------------------ */

// Omuz yarı genişliği: kızda daha dar, erkekte daha geniş (yalnız siluet).
const SHOULDER = { kiz: 35, erkek: 42 };

function torsoPath(w) {
    const l = 60 - w;
    const r = 60 + w;
    return `M${l} 121 C${l} 101 ${l + 12} 91 49 87.5 L71 87.5 C${r - 12} 91 ${r} 101 ${r} 121 Z`;
}

function buildTop(top, w, skin) {
    const c = CLOTH_COLORS[top.color];
    const dark = shade(c, -0.22);
    const edge = shade(c, -0.4);
    const ink = contrast(c);
    const neck = shade(skin, -0.14);
    const els = [
        path(torsoPath(w), c, { stroke: edge, strokeWidth: 1.5 }),
        // Başın gövdeye düşen yumuşak gölgesi.
        ellipse(60, 89, 15, 4, '#000000', { opacity: 0.12 }),
    ];

    switch (top.style) {
        case 'tisort':
            els.push(
                path('M49 87.5 Q60 98 71 87.5 Z', neck),
                line('M48.5 87.5 Q60 99.5 71.5 87.5', dark, 2.6),
                // Kısa kol dikişleri.
                ...mirrored([line(`M${60 - w + 7} 104 Q${60 - w + 10} 112 ${60 - w + 11} 121`, dark, 1.4)])
            );
            break;
        case 'ceket': {
            const shirt = luma(c) > 0.62 ? '#1F2937' : '#F8FAFC';
            els.push(
                path('M49 87.5 L60 114 L71 87.5 Z', shirt),
                path('M51 87.5 Q60 96 69 87.5 Z', neck),
                ...mirrored([
                    path('M49 87 L42 97 L50 100 L60 116 L52 89 Z', dark, { stroke: edge, strokeWidth: 1 }),
                    // Deri parlaması.
                    path(`M${60 - w + 6} 103 Q${60 - w + 9} 94 ${60 - w + 18} 91 Q${60 - w + 12} 96 ${60 - w + 10} 104 Z`, '#FFFFFF', {
                        opacity: 0.18,
                    }),
                ]),
                circle(66, 108, 1.6, edge),
                circle(66, 116, 1.6, edge)
            );
            break;
        }
        case 'forma':
            els.push(
                path('M50 87.5 L60 99 L70 87.5 Z', neck),
                line('M49 87.5 L60 100.5 L71 87.5', ink, 2.8),
                ...mirrored([
                    line(`M${60 - w + 8} 121 C${60 - w + 9} 104 ${60 - w + 14} 95 ${60 - w + 20} 90.5`, ink, 2.6, { opacity: 0.9 }),
                ]),
                rect(52, 104, 16, 12, 3, ink, { opacity: 0.92 }),
                rect(55.5, 106.5, 9, 7, 2, c)
            );
            break;
        case 'kazak': {
            // Göğüste iki sıra zikzak örgü deseni.
            const zigzag = (top) => {
                const l = 60 - w + 4;
                const r = 60 + w - 4;
                let d = `M${l} ${top + 5}`;
                for (let x = l, up = true; x < r; x += 6, up = !up) d += ` L${Math.min(x + 6, r)} ${up ? top : top + 5}`;
                return d;
            };
            els.push(
                line(zigzag(100), ink, 2.4, { opacity: 0.85 }),
                line(zigzag(106), dark, 1.6),
                // Balıkçı yaka (boğazlı).
                rect(47.5, 79, 25, 12, 6, dark, { stroke: edge, strokeWidth: 1.2 }),
                line('M53 81 L53 89 M57 81 L57 89 M61 81 L61 89 M65 81 L65 89 M69 81 L69 89', edge, 0.9, { opacity: 0.5 })
            );
            break;
        }
        case 'hoodie':
        default:
            els.push(
                // Kapüşon yakası.
                path('M41 88 Q60 101 79 88 Q75 84.5 70.5 85.5 Q60 94 49.5 85.5 Q45 84.5 41 88 Z', dark, {
                    stroke: edge,
                    strokeWidth: 1,
                }),
                ...mirrored([rect(54, 92, 2.2, 13, 1.1, '#F8FAFC'), circle(55.1, 106, 1.8, '#F8FAFC')]),
                // Kanguru cebi.
                path('M43 121 L45.5 111 Q60 107 74.5 111 L77 121 Z', dark, { opacity: 0.55 })
            );
            break;
    }
    return els;
}

/* ------------------------------------------------------------------ */
/* Saç                                                                  */
/* ------------------------------------------------------------------ */

// Baş: elips (60, 52) rx 24 ry 25 -> tepe y 27, çene y 77, yanlar x 36..84.

/** Arka saç (başın ve gövdenin arkasında). */
function hairBack(style, h, d, hat, tie) {
    const e = { stroke: d, strokeWidth: 1.2 };
    switch (style) {
        case 'dalgali':
            return [
                path(
                    'M33 52 C30 30 45 20 60 20 C75 20 90 30 87 52 C90 62 93 71 88 80 C85 86 79 85 79 80 L41 80 C41 85 35 86 32 80 C27 71 30 62 33 52 Z',
                    h,
                    e
                ),
            ];
        case 'atkuyrugu':
            return [
                path('M75 31 C93 28 100 47 96 66 C94 78 88 87 82 93 C84 81 87 70 83 58 C81 48 77 41 71 37 Z', h, e),
                circle(80.5, 33.5, 3.4, tie, { stroke: shade(tie, -0.35), strokeWidth: 0.8 }),
            ];
        case 'uzun':
            return [path('M33 50 C30 28 45 19 60 19 C75 19 90 28 87 50 L89 92 L31 92 Z', h, e)];
        case 'topuz':
            return hat ? [] : [circle(60, 22, 11, h, e), ellipse(60, 31.5, 8, 2.6, tie)];
        case 'orgu':
            return [path('M34 52 C31 30 45 21 60 21 C75 21 89 30 86 52 C86 60 84 66 80 70 L40 70 C36 66 34 60 34 52 Z', h, e)];
        case 'kivircik':
            return [
                ...[
                    [36, 40, 10], [46, 28, 10], [60, 23, 10.5], [74, 28, 10], [84, 40, 10],
                    [88, 54, 9], [32, 54, 9], [34, 67, 8], [86, 67, 8],
                ].map(([cx, cy, r]) => circle(cx, cy, r, h, e)),
            ];
        default:
            return [];
    }
}

/** Gövdenin önüne düşen tutamlar (uzun saç, örgü). */
function hairFront(style, h, d, tie) {
    const e = { stroke: d, strokeWidth: 1.2 };
    if (style === 'uzun') {
        return mirrored([path('M36.5 50 C34 70 37 90 33 106 C38 109 45 106 47 101 C44.5 86 44 68 44.5 56 Z', h, e)]);
    }
    if (style === 'orgu') {
        const links = [74, 82, 90, 98, 106].map((cy, i) =>
            ellipse(i % 2 ? 39 : 40, cy, 6.2, 5.4, i % 2 ? shade(h, -0.08) : h, e)
        );
        return [...links, rect(35.5, 110, 8, 4, 2, tie), path('M36 114 L39.5 121 L43 114 Z', h, e)];
    }
    return [];
}

/** Ön saç (perçem); şapka/berenin altında kalan kısmı onlar örter. */
function hairTop(style, h, d, hat) {
    const e = { stroke: d, strokeWidth: 1.2 };
    const shine = ellipse(49, 33, 7, 2.6, '#FFFFFF', { opacity: 0.22, transform: 'rotate(-24 49 33)' });
    switch (style) {
        case 'dalgali':
            return [path('M35 56 C32 32 46 22 61 22 C76 22 88 32 85 56 C83 46 78 40 72 37 C66 44 52 46 44 40 C41 47 37 50 35 56 Z', h, e), shine];
        case 'atkuyrugu':
        case 'topuz':
            return [path('M35 54 C33 33 46 25 60 25 C74 25 87 33 85 54 C82 42 73 35 60 35 C47 35 38 42 35 54 Z', h, e), shine];
        case 'uzun':
        case 'orgu':
            return [
                path('M35 56 C33 32 46 22 60 22 C74 22 87 32 85 56 C82 44 73 37 61 34 L60 36.5 L59 34 C47 37 38 44 35 56 Z', h, e),
                shine,
            ];
        case 'kivircik':
            if (hat) return [];
            return [
                ...[[44, 38, 7], [53, 33.5, 7.5], [63, 32.5, 7.5], [72, 35, 7], [79, 41, 6], [39, 44, 5.5]].map(([cx, cy, r]) =>
                    circle(cx, cy, r, h, e)
                ),
                circle(51, 31.5, 2.2, '#FFFFFF', { opacity: 0.25 }),
                circle(61, 30.5, 2.2, '#FFFFFF', { opacity: 0.25 }),
            ];
        case 'mohawk':
            return [
                // Kazınmış yanlar.
                path('M36 52 C34 34 46 26 60 26 C74 26 86 34 84 52 C80 40 72 34 60 34 C48 34 40 40 36 52 Z', h, { opacity: 0.35 }),
                ...(hat
                    ? []
                    : [
                        path('M50 35 L45 13 L54.5 25 L57.5 5 L63 24 L71 10 L70 33 C64 36.5 56 36.5 50 35 Z', h, e),
                        path('M56 30 L57.5 9 L59.5 25 Z', '#FFFFFF', { opacity: 0.22 }),
                    ]),
            ];
        case 'kisa':
        default:
            return [path('M35 55 C32 33 45 23 61 23 C77 23 88 34 85 55 C84 47 81 42 77 40 C70 44 58 44 50 38 C46 43 40 46 35 55 Z', h, e), shine];
    }
}

/* ------------------------------------------------------------------ */
/* Yüz                                                                  */
/* ------------------------------------------------------------------ */

function buildFace(skin, brow, body) {
    const els = [
        // Gözler; parıltılar ikisinde de aynı yanda (tek ışık kaynağı).
        ...mirrored([ellipse(51, 57.5, 3.9, 4.7, INK)]),
        circle(52.4, 55.6, 1.4, '#FFFFFF'),
        circle(70.4, 55.6, 1.4, '#FFFFFF'),
        ...mirrored([path('M46 49.5 Q51 46.6 56 49.3 Q51 48.4 46 49.5 Z', brow, { stroke: brow, strokeWidth: 1.1 })]),
        ...mirrored([ellipse(44, 65, 4.6, 2.8, BLUSH, { opacity: 0.5 })]),
        ellipse(60, 62.5, 1.7, 1.15, shade(skin, -0.28), { opacity: 0.8 }),
        path('M54 66 Q60 73 66 66 Q60 68.6 54 66 Z', MOUTH, { stroke: MOUTH, strokeWidth: 0.8 }),
    ];
    if (body === 'kiz') {
        // Dış köşede minik kirpik.
        els.push(...mirrored([path('M47.6 54.4 L44.4 52.4 L46.2 55.6 Z', INK)]));
    }
    return els;
}

/* ------------------------------------------------------------------ */
/* Aksesuar                                                             */
/* ------------------------------------------------------------------ */

function buildAcc(acc, hair) {
    switch (acc) {
        case 'sapka': {
            const edge = shade(ACC.capMain, -0.4);
            return [
                path('M34 45 C33 27 46 18.5 60 18.5 C74 18.5 87 27 86 45 Z', ACC.capMain, { stroke: edge, strokeWidth: 1.3 }),
                // Krem ön panel.
                path('M47 44 C46 31 52 22.5 60 22 C68 22.5 74 31 73 44 Z', ACC.capPanel, { stroke: edge, strokeWidth: 0.8 }),
                circle(60, 19, 2.4, ACC.capPanel, { stroke: edge, strokeWidth: 0.8 }),
                path('M29 45 C40 38.5 80 38.5 91 45 C88.5 50.5 31.5 50.5 29 45 Z', shade(ACC.capMain, -0.12), {
                    stroke: edge,
                    strokeWidth: 1.3,
                }),
            ];
        }
        case 'bere': {
            const edge = shade(ACC.beanie, -0.45);
            return [
                circle(60, 13.5, 6.5, ACC.pom, { stroke: edge, strokeWidth: 1.1 }),
                path('M34 45 C32 24 46 15 60 15 C74 15 88 24 86 45 Z', ACC.beanie, { stroke: edge, strokeWidth: 1.3 }),
                rect(31.5, 37, 57, 10, 5, ACC.beanieCuff, { stroke: edge, strokeWidth: 1.2 }),
                line('M38 38.5 L38 45.5 M44 38.5 L44 45.5 M50 38.5 L50 45.5 M56 38.5 L56 45.5 M62 38.5 L62 45.5 M68 38.5 L68 45.5 M74 38.5 L74 45.5 M80 38.5 L80 45.5', edge, 0.9, {
                    opacity: 0.45,
                }),
            ];
        }
        case 'gozluk':
            return [
                ...mirrored([circle(51, 57.5, 7.2, '#FFFFFF', { opacity: 0.2 })]),
                ...mirrored([circle(51, 57.5, 7.2, 'none', { stroke: ACC.frame, strokeWidth: 2 })]),
                line('M58 56.5 Q60 54.6 62 56.5', ACC.frame, 1.8),
                ...mirrored([line('M43.9 55.8 L37 54', ACC.frame, 1.8)]),
            ];
        case 'gunes':
            return [
                ...mirrored([
                    path('M41 51.5 L58 51.5 L57.2 59 C56.4 63.5 44.6 63.5 43 59 Z', ACC.lens, { stroke: ACC.gold, strokeWidth: 1.3 }),
                    path('M44.5 54 L50 54 L46 59.5 L44 58 Z', '#C8D8FF', { opacity: 0.55 }),
                    line('M41 52.5 L36.5 54', ACC.gold, 1.6),
                ]),
                line('M58 52.6 L62 52.6', ACC.gold, 1.6),
            ];
        case 'kulaklik':
            return [
                line('M34.5 52 C33 21 87 21 85.5 52', ACC.phoneEdge, 5.4),
                line('M34.5 52 C33 21 87 21 85.5 52', ACC.phone, 3.4),
                ...mirrored([
                    rect(28.5, 47, 11, 19, 5, ACC.phone, { stroke: ACC.phoneEdge, strokeWidth: 1.2 }),
                    ellipse(34, 56.5, 3, 6, ACC.phoneCushion),
                ]),
            ];
        case 'kedi': {
            const edge = shade(hair, -0.45);
            return [
                line('M36 44 C38 26 82 26 84 44', edge, 2.4),
                ...mirrored([
                    path('M37 37 L39.5 16 L53 29 Z', hair, { stroke: edge, strokeWidth: 1.3 }),
                    path('M40.5 32.5 L41.8 21.5 L49 28.8 Z', ACC.earInner),
                ]),
            ];
        }
        case 'tac':
            return [
                path('M43 33 L41 15.5 L50.5 24 L60 11 L69.5 24 L79 15.5 L77 33 Z', ACC.gold, { stroke: ACC.goldEdge, strokeWidth: 1.4 }),
                rect(42.5, 29.5, 35, 4.5, 1.5, shade(ACC.gold, -0.12), { stroke: ACC.goldEdge, strokeWidth: 1 }),
                circle(60, 25, 2.6, ACC.gems[0]),
                circle(50.5, 27.5, 1.8, ACC.gems[1]),
                circle(69.5, 27.5, 1.8, ACC.gems[2]),
                ...[[41, 15.5], [60, 11], [79, 15.5]].map(([cx, cy]) => circle(cx, cy, 1.9, '#FDE68A', { stroke: ACC.goldEdge, strokeWidth: 0.8 })),
            ];
        default:
            return [];
    }
}

/* ------------------------------------------------------------------ */
/* Portre                                                               */
/* ------------------------------------------------------------------ */

/**
 * @param {object} config avatar yapılandırması (catalog biçimi); bozuk/eksik
 *   alanlar `normalizeAvatar` ile varsayılana düşer.
 * @param {string} [gender] config hiç yoksa vücut tipinin seçimi için.
 * @returns {{viewBox: string, elements: Array<{tag: string, props: object, children?: Array}>}}
 */
export function buildBust(config, gender) {
    const a = normalizeAvatar(config, gender);
    const skin = SKIN_TONES[a.skin];
    const skinEdge = shade(skin, -0.32);
    const h = HAIR_COLORS[a.hair.color];
    const hd = shade(h, -0.35);
    const w = SHOULDER[a.body] ?? SHOULDER.erkek;
    const hat = a.acc === 'sapka' || a.acc === 'bere';
    const top = CLOTH_COLORS[a.top.color];

    const elements = [
        ...hairBack(a.hair.style, h, hd, hat, top),
        // Boyun.
        rect(52.5, 68, 15, 22, 5, shade(skin, -0.1), { stroke: skinEdge, strokeWidth: 1.2 }),
        rect(53.2, 70, 13.6, 7, 3, shade(skin, -0.24), { opacity: 0.55 }),
        ...buildTop(a.top, w, skin),
        ...hairFront(a.hair.style, h, hd, top),
        // Kulaklar.
        ...mirrored([
            circle(36.5, 56, 5.4, skin, { stroke: skinEdge, strokeWidth: 1.2 }),
            circle(36.8, 56.2, 2.6, shade(skin, -0.16)),
        ]),
        // Baş.
        ellipse(60, 52, 24, 25, skin, { stroke: skinEdge, strokeWidth: 1.4 }),
        ...buildFace(skin, shade(h, -0.2), a.body),
        ...hairTop(a.hair.style, h, hd, hat),
        ...buildAcc(a.acc, h),
    ];

    return { viewBox: BUST_VIEWBOX, elements };
}

export default buildBust;
