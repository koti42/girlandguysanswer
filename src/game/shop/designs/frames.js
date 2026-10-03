/**
 * Jeton Mağazası — Profil Çerçeveleri (SPEC_V2 §F.2 / §F.3)
 *
 * Saf veri: React/DOM yok. Web (React DOM SVG) ve mobil (react-native-svg)
 * ShopArt bileşenleri bu diziyi birebir aynı şekilde çizer.
 *
 * Kurallar (frames.test.js doğrular):
 *  - viewBox 0 0 200 200, merkez (100,100). Fotoğraf r=70 dairesi BOŞ kalır;
 *    süslemeler r >= 72'den başlar, en dışta r = 100'e kadar uzanır.
 *  - Yalnızca path/circle/ellipse/rect/g/polygon ve F.2'deki prop kümesi.
 *    Gradyanlar defs ile; filter/mask/clipPath/pattern/text/image YOK.
 *  - Tüm koordinatlar modül yüklenirken hesaplanıp mutlak değere çevrilir;
 *    transform kullanılmaz (renderer'ın işini basit tutar).
 *  - defs id'leri tasarıma özel önekli ve global olarak benzersizdir; yine de
 *    renderer her örnekte id'leri kendi önekiyle yeniden yazar.
 *
 * Animasyon (`anim`, yalnızca epic/legendary) beklenen anlamları:
 *  - spin    : öğe çerçeve merkezi (100,100) etrafında yavaşça döner (~20-30 sn/tur)
 *  - pulse   : öğe çerçeve merkezinden hafifçe büyüyüp küçülür (ölçek ~1 → 1.03) + opaklık
 *  - shimmer : opaklık dalgalanır (1 → ~0.55 → 1), parıltı hissi
 *  - twinkle : öğe yanıp söner (opaklık 1 → ~0.25); aynı tasarımdaki birden çok
 *              twinkle grubu sırayla gecikmeli oynatılırsa daha canlı görünür
 *  - float   : öğe birkaç birim yukarı-aşağı süzülür
 * Animasyon kapalıyken (reduced-motion / düşük güç) her tasarım statik olarak
 * eksiksiz görünür.
 */

const CX = 100;
const CY = 100;
const VIEWBOX = '0 0 200 200';

/* ------------------------------------------------------------------ */
/* Geometri yardımcıları                                               */
/* ------------------------------------------------------------------ */

const r2 = (n) => Math.round(n * 100) / 100;
/** Açı derece cinsinden, 0 = tepe, saat yönünde artar. */
const toRad = (deg) => ((deg - 90) * Math.PI) / 180;
const polar = (r, deg) => [CX + r * Math.cos(toRad(deg)), CY + r * Math.sin(toRad(deg))];
const P = (p) => `${r2(p[0])} ${r2(p[1])}`;
const ident = (x, y) => [x, y];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
const norm = (v) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
};
/** Saat yönünde teğet (u) ve dışa doğru (v) birim vektörler. */
const tangentAt = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const outwardAt = (deg) => [Math.sin((deg * Math.PI) / 180), -Math.cos((deg * Math.PI) / 180)];

/**
 * Yerel koordinat sistemi: (x sağ, y yukarı). "Yukarı" ekranda `deg` açısının
 * gösterdiği yöne eşlenir. Sonuç (x, y) -> [X, Y] eşleme fonksiyonu.
 */
const mapAt = (ox, oy, deg, s = 1) => {
    const [ux, uy] = tangentAt(deg);
    const [vx, vy] = outwardAt(deg);
    return (x, y) => [ox + s * (x * ux + y * vx), oy + s * (x * uy + y * vy)];
};
/** Halka üzerinde, "yukarı" = dışarı. */
const outFrame = (r, deg, s = 1) => {
    const [x, y] = polar(r, deg);
    return mapAt(x, y, deg, s);
};
/** Halka üzerinde, "yukarı" = merkeze doğru. */
const inFrame = (r, deg, s = 1) => {
    const [x, y] = polar(r, deg);
    return mapAt(x, y, deg + 180, s);
};

/** [['M',x,y],['C',...],['Q',...],['L',...],['Z']] -> mutlak path d. */
const D = (cmds, m = ident) =>
    cmds
        .map(([c, ...n]) => {
            if (c === 'Z') return 'Z';
            const out = [];
            for (let i = 0; i < n.length; i += 2) out.push(P(m(n[i], n[i + 1])));
            return c + out.join(' ');
        })
        .join(' ');

/** Saat yönünde yay (a0 < a1). */
const arcD = (r, a0, a1) =>
    `M${P(polar(r, a0))} A${r2(r)} ${r2(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(polar(r, a1))}`;
/** Merkeze göre yerleştirilmiş, açıyla incelen dal/kuyruk şekli. */
const taperD = (a0, a1, rf, w0, w1, steps = 36) => {
    const outer = [];
    const inner = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const deg = a0 + (a1 - a0) * t;
        const r = rf(t);
        const w = w0 + (w1 - w0) * t;
        outer.push(P(polar(r + w / 2, deg)));
        inner.push(P(polar(r - w / 2, deg)));
    }
    return `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`;
};
/** Dört köşeli parıltı yıldızı. */
const sparkleD = (cx, cy, R, k = 0.2) =>
    D([
        ['M', cx, cy - R],
        ['Q', cx + k * R, cy - k * R, cx + R, cy],
        ['Q', cx + k * R, cy + k * R, cx, cy + R],
        ['Q', cx - k * R, cy + k * R, cx - R, cy],
        ['Q', cx - k * R, cy - k * R, cx, cy - R],
        ['Z'],
    ]);
const starPts = (cx, cy, R, ri, n, rot = 0) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const rr = i % 2 === 0 ? R : ri;
        const a = ((rot + (i * 180) / n - 90) * Math.PI) / 180;
        pts.push(`${r2(cx + rr * Math.cos(a))},${r2(cy + rr * Math.sin(a))}`);
    }
    return pts.join(' ');
};
/** Kalp: yerel (0,0) merkez, uç aşağıda, s ölçek. */
const HEART = [
    ['M', 0, -1],
    ['C', -0.25, -0.62, -1.02, -0.28, -1.02, 0.22],
    ['C', -1.02, 0.74, -0.38, 0.98, 0, 0.56],
    ['C', 0.38, 0.98, 1.02, 0.74, 1.02, 0.22],
    ['C', 1.02, -0.28, 0.25, -0.62, 0, -1],
    ['Z'],
];

/** Belirlenimci sözde-rastgele üreteç (her yüklemede aynı çıktı). */
const rng = (seed) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

/* ------------------------------------------------------------------ */
/* Öğe yardımcıları                                                    */
/* ------------------------------------------------------------------ */

const el = (tag, props, extra) => (extra ? { tag, props, ...extra } : { tag, props });
const group = (children, props = {}, anim) =>
    anim ? { tag: 'g', props, children, anim } : { tag: 'g', props, children };
const circle = (cx, cy, r, props) => el('circle', { cx: r2(cx), cy: r2(cy), r: r2(r), ...props });
const dot = (p, r, props) => circle(p[0], p[1], r, props);
const ring = (r, w, stroke, more = {}) =>
    circle(CX, CY, r, { fill: 'none', stroke, strokeWidth: w, ...more });
const path = (d, props) => el('path', { d, ...props });
const stopsOf = (stops) =>
    stops.map(([offset, color, opacity]) =>
        opacity === undefined ? { offset, color } : { offset, color, opacity },
    );
const lin = (id, [x1, y1, x2, y2], stops) => ({
    tag: 'linearGradient',
    id,
    props: { x1, y1, x2, y2 },
    stops: stopsOf(stops),
});
const radial = (id, props, stops) => ({
    tag: 'radialGradient',
    id,
    props: { cx: 0.5, cy: 0.5, r: 0.5, ...props },
    stops: stopsOf(stops),
});
const url = (id) => `url(#${id})`;

const frame = (key, name, rarity, description, defs, elements) => ({
    id: `frame:${key}`,
    category: 'frame',
    name,
    rarity,
    description,
    art: { viewBox: VIEWBOX, defs, elements },
});

/* ================================================================== */
/* 1. Gümüş İnci — common                                              */
/* ================================================================== */
function gumusInci() {
    const pearls = [];
    for (let i = 0; i < 24; i++) {
        const p = polar(88.5, i * 15);
        const big = i % 6 === 0;
        const even = i % 2 === 0;
        pearls.push(
            dot(p, big ? 5.8 : even ? 4.3 : 2.9, {
                fill: url(even ? 'gi-pearl' : 'gi-blush'),
                stroke: '#737D90',
                strokeWidth: 0.55,
            }),
        );
    }
    return frame(
        'gumus-inci',
        'Gümüş İnci',
        'common',
        'Parlak gümüş bir halka ve etrafını saran inci dizisi. Sade, zarif, her profile yakışır.',
        [
            lin('gi-band', [0, 0, 1, 1], [
                [0, '#FBFCFE'],
                [0.45, '#AEB6C4'],
                [0.7, '#E9ECF2'],
                [1, '#7A8496'],
            ]),
            radial('gi-pearl', { fx: 0.34, fy: 0.3 }, [
                [0, '#FFFFFF'],
                [0.55, '#EEF1F6'],
                [1, '#AAB3C2'],
            ]),
            radial('gi-blush', { fx: 0.34, fy: 0.3 }, [
                [0, '#FFFFFF'],
                [0.55, '#FBEDEF'],
                [1, '#D8B1BA'],
            ]),
        ],
        [
            ring(79, 6, url('gi-band')),
            ring(75.8, 0.8, '#6F798C'),
            ring(82.2, 0.8, '#6F798C'),
            ring(73, 1.1, '#D3D8E1'),
            ring(88.5, 1, '#8F98A9'),
            ...pearls,
        ],
    );
}

/* ================================================================== */
/* 2. Gün Batımı — common                                              */
/* ================================================================== */
function gunBatimi() {
    // Ufuk y=172: halkanın bu çizginin altında kalan kısmı deniz.
    const HZ = 172;
    const RO = 89.6;
    const RI = 74.6;
    const xo = Math.sqrt(RO * RO - (HZ - CY) ** 2);
    const xi = Math.sqrt(RI * RI - (HZ - CY) ** 2);
    const sea =
        `M${r2(CX + xo)} ${HZ} A${RO} ${RO} 0 0 1 ${r2(CX - xo)} ${HZ} ` +
        `L${r2(CX - xi)} ${HZ} A${RI} ${RI} 0 0 0 ${r2(CX + xi)} ${HZ} Z`;
    const sun = [143.2, 168.4];
    const rays = [];
    // ışınlar yalnızca merkezden uzağa bakan yarıda (fotoğraf alanına girmez)
    [12, 34, 56, 78, 100, 122, 144].forEach((a, i) => {
        const m = mapAt(sun[0], sun[1], a);
        rays.push(D([['M', -1.1, 10.4], ['L', 0, i % 2 ? 13 : 14.6], ['L', 1.1, 10.4], ['Z']], m));
    });
    const glint = (x, y, w, sw, op) =>
        path(`M${r2(x - w / 2)} ${r2(y)} L${r2(x + w / 2)} ${r2(y)}`, { fill: 'none', stroke: '#FFD98A', strokeWidth: sw, strokeLinecap: 'round', opacity: op });
    const bird = (x, y, s) =>
        path(D([['M', x - s, y - 0.3 * s], ['Q', x - 0.45 * s, y - 0.8 * s, x, y], ['Q', x + 0.45 * s, y - 0.8 * s, x + s, y - 0.3 * s]]), {
            fill: 'none',
            stroke: '#2E1A52',
            strokeWidth: 1,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
        });
    const stars = [
        [326, 83.5, 1],
        [344, 87, 0.7],
        [6, 80.5, 0.8],
        [20, 86, 1.1],
        [302, 86.5, 0.7],
        [38, 80.5, 0.6],
        [284, 81, 0.6],
    ].map(([a, r, s]) => dot(polar(r, a), s, { fill: '#FFFFFF', opacity: 0.9 }));
    return frame(
        'gun-batimi',
        'Gün Batımı',
        'common',
        'Mor alacakaranlıktan mercan ve altın tonlarına akan gökyüzü; ufukta denize batan güneş ve uzakta bir yelkenli.',
        [
            lin('gb-sky', [0.5, 0, 0.5, 1], [
                [0, '#3F2A7A'],
                [0.4, '#A63A7E'],
                [0.72, '#FF6B6B'],
                [1, '#FFB347'],
            ]),
            radial('gb-sun', { fx: 0.5, fy: 0.35 }, [
                [0, '#FFF8D6'],
                [0.55, '#FFD166'],
                [1, '#FF9440'],
            ]),
            radial('gb-glow', {}, [
                [0, '#FFF0B8', 0.95],
                [0.55, '#FFC46B', 0.45],
                [1, '#FFB347', 0],
            ]),
            lin('gb-sea', [0.5, 0, 0.5, 1], [
                [0, '#7A3A8C'],
                [0.5, '#4A2777'],
                [1, '#2A1857'],
            ]),
        ],
        [
            ring(82.1, 15, url('gb-sky')),
            ring(75.2, 1.2, '#FFE1B8', { opacity: 0.9 }),
            ...stars,
            bird(150, 33.5, 3.2),
            bird(158.5, 40, 2.2),
            bird(49, 44, 2),
            circle(sun[0], sun[1], 10.6, { fill: url('gb-glow') }),
            path(rays.join(' '), { fill: '#FFD166' }),
            circle(sun[0], sun[1], 8.4, { fill: url('gb-sun') }),
            path(sea, { fill: url('gb-sea') }),
            path(`M${r2(CX - xo)} ${HZ} L${r2(CX - xi)} ${HZ} M${r2(CX + xi)} ${HZ} L${r2(CX + xo)} ${HZ}`, {
                fill: 'none',
                stroke: '#FFC27A',
                strokeWidth: 0.9,
            }),
            glint(sun[0], 175.2, 13, 1.3, 0.95),
            glint(sun[0] - 1.5, 178.4, 9, 1.1, 0.8),
            glint(sun[0] - 3, 181.6, 5.4, 0.9, 0.65),
            glint(112, 185.5, 6, 0.8, 0.45),
            glint(88, 183, 5, 0.8, 0.4),
            // yelkenli
            path('M61.6 179.2 L74.4 179.2 L72.2 181.6 L63.6 181.6 Z M68.4 178.6 L68.4 169.6 L73.8 178.6 Z M67.6 178.6 L67.6 172.2 L63.6 178.6 Z', {
                fill: '#24154A',
            }),
            ring(89.6, 1, '#2E1A52', { opacity: 0.5 }),
        ],
    );
}

/* ================================================================== */
/* 3. Okyanus Dalgası — common                                         */
/* ================================================================== */
function okyanusDalgasi() {
    // Kıvrılan dalga tepesi (yerel: x = saat yönünde teğet, y = dışarı)
    const CURL = [
        ['M', -24, 0],
        ['C', -15, 1.2, -6.5, 5.6, -1.5, 11.2],
        ['C', 1.6, 14.8, 7.6, 16.4, 11.2, 13.6],
        ['C', 13.6, 11.6, 13, 8.2, 10.4, 7.6],
        ['C', 8.2, 7.2, 6.8, 9, 7.8, 10.6],
        ['C', 5, 10.8, 3.4, 8, 4.8, 5],
        ['C', 6, 2.6, 9.4, 0.8, 14, 0],
        ['Z'],
    ];
    // köpük: tepe kenarını izleyen ince hilal
    const FOAM = [
        ['M', -1.5, 11.2],
        ['C', 1.6, 14.8, 7.6, 16.4, 11.2, 13.6],
        ['C', 12.2, 12.8, 12.8, 11.6, 12.6, 10.4],
        ['C', 11.4, 13, 6.6, 14.2, 2.2, 12.2],
        ['C', 0.8, 11.6, -0.4, 11.4, -1.5, 11.2],
        ['Z'],
    ];
    const N = 10;
    const back = [];
    const front = [];
    const foam = [];
    const spray = [];
    for (let k = 0; k < N; k++) {
        const a = (k * 360) / N;
        const b = a + 18;
        back.push(D(CURL, outFrame(81, b, 0.82)));
        front.push(D(CURL, outFrame(80, a)));
        foam.push(D(FOAM, outFrame(80, a)));
        const m = outFrame(80, a);
        spray.push(dot(m(3.5, 17.6), 0.85, { fill: '#8EDDF0' }), dot(m(7.6, 18.1), 0.65, { fill: '#8EDDF0' }), dot(m(-0.4, 16.2), 0.55, { fill: '#8EDDF0' }));
    }
    const R = rng(7);
    const bubbles = [];
    for (let i = 0; i < 16; i++) {
        bubbles.push(
            dot(polar(76.2 + R() * 5.6, R() * 360), 0.6 + R() * 0.8, {
                fill: 'none',
                stroke: '#E6FBFF',
                strokeWidth: 0.5,
                opacity: 0.85,
            }),
        );
    }
    return frame(
        'okyanus-dalgasi',
        'Okyanus Dalgası',
        'common',
        'Birbirini kovalayan, köpüklü tepeleriyle kıvrılan turkuaz ve lacivert dalgalar.',
        [
            lin('ok-light', [0, 0, 1, 1], [
                [0, '#A6EEF7'],
                [0.5, '#5AD2E8'],
                [1, '#2BB3D6'],
            ]),
            lin('ok-deep', [0, 0, 1, 1], [
                [0, '#0EA5D6'],
                [0.5, '#0369A1'],
                [1, '#023E8A'],
            ]),
            lin('ok-band', [0, 0, 1, 1], [
                [0, '#0284C7'],
                [1, '#012F6B'],
            ]),
        ],
        [
            path(back.join(' '), { fill: url('ok-light'), stroke: '#1C8FB8', strokeWidth: 0.5, strokeLinejoin: 'round' }),
            ring(79, 9.4, url('ok-band')),
            path(front.join(' '), { fill: url('ok-deep'), stroke: '#012F6B', strokeWidth: 0.5, strokeLinejoin: 'round' }),
            path(foam.join(' '), { fill: '#FFFFFF', opacity: 0.95 }),
            ...spray,
            ring(74.8, 1.5, '#CAF0F8'),
            ...bubbles,
        ],
    );
}

/* ================================================================== */
/* 4. Mercan Kalp — common                                             */
/* ================================================================== */
function mercanKalp() {
    const hearts = [];
    for (let i = 0; i < 12; i++) {
        const a = i * 30;
        const big = i % 2 === 0;
        const s = i === 0 ? 7.8 : big ? 6.3 : 4.2;
        hearts.push(
            path(D(HEART, outFrame(91, a, s)), {
                fill: big ? url('mk-heart') : '#FFD9D9',
                stroke: big ? '#C93A5A' : '#FF6B6B',
                strokeWidth: big ? 0.5 : 0.6,
                strokeLinejoin: 'round',
            }),
        );
    }
    const dots = [];
    for (let i = 0; i < 24; i++) dots.push(dot(polar(80, i * 15 + 7.5), 0.9, { fill: '#FFFFFF', opacity: 0.8 }));
    return frame(
        'mercan-kalp',
        'Mercan Kalp',
        'common',
        'Sitenin mercan rengiyle parlayan halka; altın çizgiler ve etrafında atan küçük kalpler.',
        [
            lin('mk-band', [0, 0, 1, 1], [
                [0, '#FFA198'],
                [0.5, '#FF6B6B'],
                [1, '#E2476B'],
            ]),
            radial('mk-heart', { fx: 0.35, fy: 0.3 }, [
                [0, '#FFC2C2'],
                [0.5, '#FF6B6B'],
                [1, '#D63A5C'],
            ]),
        ],
        [
            ring(80, 8, url('mk-band')),
            ring(74.4, 1.4, '#E2B94C'),
            ring(85.4, 1, '#E2B94C'),
            ...dots,
            ...hearts,
        ],
    );
}

/* ================================================================== */
/* 5. Altın Defne — rare                                               */
/* ================================================================== */
function altinDefne() {
    const leafD = (B, dir, L, W) => {
        const n = [-dir[1], dir[0]];
        const T = add(B, dir, L);
        return [
            'M' + P(B),
            'C' + [add(add(B, dir, L * 0.3), n, W), add(add(B, dir, L * 0.78), n, W * 0.7), T].map(P).join(' '),
            'C' + [add(add(B, dir, L * 0.78), n, -W * 0.7), add(add(B, dir, L * 0.3), n, -W), B].map(P).join(' '),
            'Z',
        ].join(' ');
    };
    const ribD = (B, dir, L) => `M${P(add(B, dir, L * 0.12))} L${P(add(B, dir, L * 0.82))}`;
    const leaves = [];
    const ribs = [];
    const berries = [];
    const R0 = 87;
    const flip = (p, m) => (m ? [2 * CX - p[0], p[1]] : p);
    const flipV = (v, m) => (m ? [-v[0], v[1]] : v);
    for (const m of [false, true]) {
        const N = 13;
        for (let i = 0; i < N; i++) {
            const pr = i / (N - 1);
            const L = 15 - 5.5 * pr;
            const W = L * 0.34;
            for (const side of [1, -1]) {
                const phi = 171 - i * 11.4 - (side < 0 ? 5.7 : 0);
                const up = tangentAt(phi).map((c) => -c);
                const out = outwardAt(phi);
                const ang = 38;
                const c = Math.cos((ang * Math.PI) / 180);
                const s = Math.sin((ang * Math.PI) / 180) * side;
                const dir = flipV(norm([c * up[0] + s * out[0], c * up[1] + s * out[1]]), m);
                const B = flip(polar(R0, phi), m);
                leaves.push(path(leafD(B, dir, L, W), { fill: url(side > 0 ? 'ad-leaf' : 'ad-leaf2') }));
                ribs.push(ribD(B, dir, L));
            }
            if (i === 2 || i === 5 || i === 8) {
                berries.push(
                    dot(flip(polar(94.2, 171 - i * 11.4 - 4), m), 1.8, {
                        fill: url('ad-gold'),
                        stroke: '#8F6418',
                        strokeWidth: 0.4,
                    }),
                );
            }
        }
        const tipB = flip(polar(R0, 27), m);
        const tipDir = flipV(tangentAt(27).map((c) => -c), m);
        leaves.push(path(leafD(tipB, tipDir, 9.5, 3.1), { fill: url('ad-leaf') }));
        ribs.push(ribD(tipB, tipDir, 9.5));
    }
    const top = polar(88, 0);
    return frame(
        'altin-defne',
        'Altın Defne',
        'rare',
        'Zaferin simgesi altın defne dalları, mercan kurdeleyle bağlanmış. Kazananların çerçevesi.',
        [
            lin('ad-gold', [0, 0, 1, 1], [
                [0, '#FFF3C4'],
                [0.45, '#E9C46A'],
                [0.75, '#C99A2E'],
                [1, '#8F6418'],
            ]),
            lin('ad-leaf', [0, 0, 1, 1], [
                [0, '#FFF0B3'],
                [0.5, '#E2B94C'],
                [1, '#B07F22'],
            ]),
            lin('ad-leaf2', [0, 0, 1, 1], [
                [0, '#F2D27A'],
                [0.55, '#C99A2E'],
                [1, '#8F6418'],
            ]),
            lin('ad-ribbon', [0, 0, 0, 1], [
                [0, '#FF8A8A'],
                [1, '#D93F4C'],
            ]),
        ],
        [
            ring(74.4, 2.4, url('ad-gold')),
            ring(77.6, 0.8, '#C99A2E', { opacity: 0.75 }),
            path(`${arcD(R0, 27, 176)} ${arcD(R0, 184, 333)}`, {
                fill: 'none',
                stroke: '#A97A22',
                strokeWidth: 1.7,
                strokeLinecap: 'round',
            }),
            ...leaves,
            path(ribs.join(' '), { fill: 'none', stroke: '#8F6418', strokeWidth: 0.5, opacity: 0.7, strokeLinecap: 'round' }),
            ...berries,
            // kurdele
            path('M98.6 188 L91.4 198.6 L95.2 197.3 L96.7 199.8 L101.2 189.4 Z', { fill: '#C9363E' }),
            path('M101.4 188 L108.6 198.6 L104.8 197.3 L103.3 199.8 L98.8 189.4 Z', { fill: '#D93F4C' }),
            path('M100 186.6 C93 179.6 85 181.6 86.5 187.6 C87.5 192.1 94.5 190.6 100 186.6 Z', {
                fill: url('ad-ribbon'),
                stroke: '#B32F3A',
                strokeWidth: 0.5,
            }),
            path('M100 186.6 C107 179.6 115 181.6 113.5 187.6 C112.5 192.1 105.5 190.6 100 186.6 Z', {
                fill: url('ad-ribbon'),
                stroke: '#B32F3A',
                strokeWidth: 0.5,
            }),
            circle(100, 187, 3, { fill: '#C9363E', stroke: '#9E2630', strokeWidth: 0.5 }),
            // tepe yıldızı
            path(sparkleD(top[0], top[1], 6.4, 0.22), { fill: url('ad-gold'), stroke: '#A97A22', strokeWidth: 0.4 }),
            dot(polar(88, -8.5), 1.1, { fill: '#E2B94C' }),
            dot(polar(88, 8.5), 1.1, { fill: '#E2B94C' }),
        ],
    );
}

/* ================================================================== */
/* 6. Kiraz Çiçeği — rare                                              */
/* ================================================================== */
const PETAL = [
    ['M', 0, 0],
    ['C', -0.55, 0.22, -0.78, 0.82, -0.38, 1],
    ['L', 0, 0.84],
    ['L', 0.38, 1],
    ['C', 0.78, 0.82, 0.55, 0.22, 0, 0],
    ['Z'],
];
function blossom(cx, cy, s, rot, palette) {
    const petals = [];
    for (let k = 0; k < 5; k++) petals.push(D(PETAL, mapAt(cx, cy, rot + k * 72, s)));
    const stamens = [];
    const tips = [];
    for (let k = 0; k < 7; k++) {
        const a = rot + 25 + k * (360 / 7);
        const m = mapAt(cx, cy, a, s);
        stamens.push(D([['M', 0, 0.15], ['L', 0, 0.48]], m));
        tips.push(dot(m(0, 0.5), Math.max(0.45, s * 0.055), { fill: palette.tip }));
    }
    return [
        path(petals.join(' '), { fill: palette.petal, stroke: palette.edge, strokeWidth: 0.5, strokeLinejoin: 'round' }),
        circle(cx, cy, s * 0.3, { fill: palette.heart }),
        path(stamens.join(' '), { fill: 'none', stroke: palette.tip, strokeWidth: 0.45, strokeLinecap: 'round' }),
        ...tips,
    ];
}
function kirazCicegi() {
    const pal = { petal: '#FFDCE8', edge: '#EE93B5', heart: '#FF8FB1', tip: '#C2185B' };
    const pal2 = { petal: '#FFC4D8', edge: '#E07AA2', heart: '#FF6F9C', tip: '#AD1457' };
    const A0 = 206;
    const A1 = 352;
    const B0 = 154;
    const B1 = 10;
    const rA = (t) => 84.6 + 2.4 * Math.sin(t * Math.PI * 2.2);
    const rB = (t) => 84.4 - 2.2 * Math.sin(t * Math.PI * 2);
    const onA = (deg) => rA((deg - A0) / (A1 - A0));
    const onB = (deg) => rB((B0 - deg) / (B0 - B1));
    const twigBuds = [];
    const twig = (deg, rBase, lean, len, w) => {
        const m = outFrame(rBase, deg);
        const tip = m(lean * len * 0.5, len);
        const tipDeg = deg + (Math.atan2(lean * 0.5, 1) * 180) / Math.PI;
        twigBuds.push([tip, tipDeg]);
        return D(
            [
                ['M', -w / 2, 0],
                ['Q', lean * len * 0.2, len * 0.5, lean * len * 0.5, len],
                ['Q', lean * len * 0.15 + w * 0.2, len * 0.5, w / 2, 0],
                ['Z'],
            ],
            m,
        );
    };
    const branches = [
        taperD(A0, A1, rA, 5.6, 1.2),
        taperD(B0, B1, rB, 5.4, 1.1),
        twig(240, onA(240) + 1, 1, 6.5, 1.8),
        twig(312, onA(312) + 1, -1, 5.5, 1.5),
        twig(116, onB(116) + 1, -1, 6.5, 1.8),
        twig(46, onB(46) + 1, 1, 5.5, 1.5),
    ];
    const leaf = (deg, r, rot, s) =>
        path(
            D(
                [
                    ['M', 0, 0],
                    ['C', -0.45, 0.3, -0.35, 0.8, 0, 1],
                    ['C', 0.35, 0.8, 0.45, 0.3, 0, 0],
                    ['Z'],
                ],
                mapAt(...polar(r, deg), deg + rot, s),
            ),
            { fill: '#9CCB6B', stroke: '#6E9E42', strokeWidth: 0.4 },
        );
    const budAt = (p, dir, s) => {
        const m = mapAt(p[0], p[1], dir, s);
        return [
            path(D([['M', 0, 0], ['C', -0.42, 0.25, -0.38, 0.75, 0, 1], ['C', 0.38, 0.75, 0.42, 0.25, 0, 0], ['Z']], m), {
                fill: '#FF9EBB',
                stroke: '#D9467A',
                strokeWidth: 0.4,
            }),
            path(D([['M', -0.32, 0.04], ['L', 0, 0.34], ['L', 0.32, 0.04], ['Z']], m), { fill: '#7FA650' }),
        ];
    };
    const bud = (deg, r, rot, s) => budAt(polar(r, deg), deg + rot, s);
    const fall = (deg, r, rot, s, op = 1) =>
        path(D(PETAL, mapAt(...polar(r, deg), rot, s)), {
            fill: '#FFC9DA',
            stroke: '#E886AB',
            strokeWidth: 0.4,
            opacity: op,
        });
    const flowers = [
        [226, 85.6, 10.6, 12, pal],
        [246, 92.6, 5.2, 40, pal2],
        [262, 83.4, 8, 40, pal2],
        [292, 86.4, 11, 5, pal],
        [324, 84.4, 8.4, 50, pal2],
        [134, 85.6, 10.6, 20, pal],
        [114, 92.6, 5.2, 0, pal2],
        [99, 83.4, 8, 0, pal2],
        [68, 86.4, 11, 30, pal],
        [36, 84.4, 8.4, 10, pal2],
    ].flatMap(([a, r, s, rot, p]) => blossom(...polar(r, a), s, rot, p));
    return frame(
        'kiraz-cicegi',
        'Kiraz Çiçeği',
        'rare',
        'Fotoğrafını saran kiraz dallarında açan pembe çiçekler, tomurcuklar ve rüzgârda savrulan yapraklar.',
        [
            lin('kc-band', [0, 0, 1, 1], [
                [0, '#FFEAF1'],
                [0.5, '#FFCFE0'],
                [1, '#F8B4CC'],
            ]),
        ],
        [
            ring(77.4, 5, url('kc-band')),
            ring(74.5, 1, '#EE93B5'),
            path(branches.join(' '), { fill: '#5D3A35' }),
            leaf(214, 82, -120, 7.5),
            leaf(146, 86, 110, 7.5),
            leaf(278, 87.5, 40, 6),
            leaf(82, 87.5, -40, 6),
            ...bud(350, 85, 60, 5.4),
            ...bud(10, 85, -60, 5.4),
            ...bud(342, 90.5, 20, 4.4),
            ...bud(18, 90.5, -20, 4.4),
            ...bud(203, 89.5, -30, 4.6),
            ...bud(157, 89.5, 30, 4.6),
            ...twigBuds.flatMap(([p, dir]) => budAt(p, dir, 4.2)),
            ...flowers,
            fall(180, 91.5, 30, 4.6),
            fall(192, 96.5, 200, 3.6, 0.9),
            fall(168, 96, 120, 3.4, 0.85),
            fall(176, 82.5, 300, 3, 0.85),
            fall(0, 96.5, 250, 2.8, 0.8),
        ],
    );
}

/* ================================================================== */
/* 7. Lale Bahçesi — rare                                              */
/* ================================================================== */
function laleBahcesi() {
    const colors = [
        ['#FF5A5F', '#C81D25', '#FFC2C4'],
        ['#FF9EBB', '#D9487A', '#FFE0EA'],
        ['#B185DB', '#6F2DBD', '#E7D6F7'],
        ['#FFD166', '#E0912F', '#FFF1C7'],
    ];
    const tulips = [];
    for (let i = 0; i < 12; i++) {
        const a = i * 30;
        const m = outFrame(79.2, a, 1.16);
        const [main, dark, light] = colors[i % 4];
        tulips.push(
            path(D([['M', 0, 0], ['L', 0, 6.5]], m), { fill: 'none', stroke: '#2D6A4F', strokeWidth: 1.3, strokeLinecap: 'round' }),
            path(
                D(
                    [
                        ['M', 0, 0.6],
                        ['C', -2.6, 1.6, -4.6, 3.8, -6.2, 7.6],
                        ['C', -3.6, 6.2, -1.6, 4.4, 0, 2.6],
                        ['Z'],
                        ['M', 0, 0.6],
                        ['C', 2.6, 1.6, 4.6, 3.8, 6.2, 7.6],
                        ['C', 3.6, 6.2, 1.6, 4.4, 0, 2.6],
                        ['Z'],
                    ],
                    m,
                ),
                { fill: '#40916C' },
            ),
            path(
                D(
                    [
                        ['M', -0.4, 6.2],
                        ['C', -4.6, 7, -5.6, 11, -4.4, 15.4],
                        ['C', -3.4, 12.6, -2.2, 10.6, -0.4, 9.6],
                        ['Z'],
                        ['M', 0.4, 6.2],
                        ['C', 4.6, 7, 5.6, 11, 4.4, 15.4],
                        ['C', 3.4, 12.6, 2.2, 10.6, 0.4, 9.6],
                        ['Z'],
                    ],
                    m,
                ),
                { fill: dark },
            ),
            path(
                D(
                    [
                        ['M', 0, 5.4],
                        ['C', -3, 7.6, -3, 12.6, 0, 17.6],
                        ['C', 3, 12.6, 3, 7.6, 0, 5.4],
                        ['Z'],
                    ],
                    m,
                ),
                { fill: main, stroke: dark, strokeWidth: 0.4 },
            ),
            path(D([['M', 0, 7.6], ['Q', -1, 11, 0, 14.6]], m), {
                fill: 'none',
                stroke: light,
                strokeWidth: 0.6,
                strokeLinecap: 'round',
                opacity: 0.9,
            }),
        );
    }
    const gems = [];
    for (let i = 0; i < 12; i++) {
        const a = i * 30 + 15;
        const m = outFrame(88.4, a);
        gems.push(
            path(D([['M', 0, -2.4], ['L', 1.8, 0], ['L', 0, 3], ['L', -1.8, 0], ['Z']], m), {
                fill: url('lb-gold'),
                stroke: '#9C6F1E',
                strokeWidth: 0.35,
            }),
            dot(m(0, -5.4), 0.85, { fill: '#E2B94C' }),
            dot(m(0, 5.8), 0.75, { fill: '#E2B94C' }),
        );
    }
    const vine = [];
    for (let i = 0; i < 36; i++) vine.push(dot(polar(76.6, i * 10 + 5), 0.65, { fill: '#B7E4C7', opacity: 0.9 }));
    return frame(
        'lale-bahcesi',
        'Lale Bahçesi',
        'rare',
        'Klasik Osmanlı lale motifleri: zümrüt halka üstünde dört renk lale ve altın bezemeler.',
        [
            lin('lb-band', [0, 0, 1, 1], [
                [0, '#40916C'],
                [0.5, '#2D6A4F'],
                [1, '#1B4332'],
            ]),
            lin('lb-gold', [0, 0, 1, 1], [
                [0, '#FBE8A6'],
                [0.5, '#E2B94C'],
                [1, '#B8862B'],
            ]),
        ],
        [
            ring(76.6, 5.2, url('lb-band')),
            ring(73.6, 1.2, url('lb-gold')),
            ring(79.6, 1.2, url('lb-gold')),
            ...vine,
            ...gems,
            ...tulips,
        ],
    );
}

/* ================================================================== */
/* 8. Nazar — rare                                                     */
/* ================================================================== */
function nazar() {
    const bead = (deg, s) => {
        const [x, y] = polar(87, deg);
        return [
            circle(x, y, 8.4 * s, { fill: url('nz-glass'), stroke: '#0A2A6E', strokeWidth: 0.5 }),
            circle(x, y, 5.5 * s, { fill: '#FFFFFF' }),
            circle(x, y, 3.8 * s, { fill: url('nz-iris') }),
            circle(x, y, 1.9 * s, { fill: '#0A1633' }),
            circle(x - 1.1 * s, y - 1.2 * s, 0.75 * s, { fill: '#FFFFFF', opacity: 0.9 }),
            circle(x - 4.6 * s, y - 4.6 * s, 1.3 * s, { fill: '#FFFFFF', opacity: 0.55 }),
        ];
    };
    const beads = [];
    for (let k = 0; k < 6; k++) {
        const base = k * 60;
        for (const [off, kind] of [
            [11.5, 'g'],
            [18, 'b'],
            [24.2, 'g'],
            [30, 'B'],
            [35.8, 'g'],
            [42, 'b'],
            [48.5, 'g'],
        ]) {
            const p = polar(87, base + off);
            if (kind === 'g') beads.push(dot(p, 1.7, { fill: url('nz-gold'), stroke: '#9C6F1E', strokeWidth: 0.3 }));
            else
                beads.push(
                    dot(p, kind === 'B' ? 4.1 : 3.2, { fill: url('nz-small'), stroke: '#0A2A6E', strokeWidth: 0.4 }),
                    dot(add(p, [-0.9, -1]), kind === 'B' ? 1 : 0.8, { fill: '#FFFFFF', opacity: 0.8 }),
                );
        }
        beads.push(...bead(base, k === 0 ? 1.24 : 1.08));
    }
    return frame(
        'nazar',
        'Nazar',
        'rare',
        'Altın kordona dizilmiş el yapımı cam nazar boncukları. Kem gözlere karşı, şık ve geleneksel.',
        [
            radial('nz-glass', { fx: 0.32, fy: 0.28 }, [
                [0, '#7CC6FF'],
                [0.45, '#1F6FE0'],
                [1, '#0B2A75'],
            ]),
            radial('nz-iris', { fx: 0.4, fy: 0.35 }, [
                [0, '#B8E8FF'],
                [1, '#3FA9F5'],
            ]),
            radial('nz-small', { fx: 0.35, fy: 0.3 }, [
                [0, '#6EC1FF'],
                [0.6, '#1565C0'],
                [1, '#0B2E7A'],
            ]),
            radial('nz-gold', { fx: 0.35, fy: 0.3 }, [
                [0, '#FFF3C4'],
                [0.6, '#E2B94C'],
                [1, '#A97A22'],
            ]),
            lin('nz-band', [0, 0, 1, 1], [
                [0, '#3A7BE0'],
                [0.5, '#123C8C'],
                [1, '#2257B8'],
            ]),
        ],
        [
            ring(75.6, 4.2, url('nz-band')),
            ring(74.6, 0.6, '#FFFFFF', { opacity: 0.5 }),
            ring(87, 1.2, '#C9A23F'),
            ...beads,
        ],
    );
}

/* ================================================================== */
/* 9. Gökkuşağı — rare                                                 */
/* ================================================================== */
function gokkusagi() {
    const bands = ['#A55EEA', '#5F7BFF', '#3EC1F3', '#2ED19A', '#FECA57', '#FF9F43', '#FF5E5E'];
    const cloud = (cx, cy, s) => {
        const parts = [
            [-8, 2, 5],
            [-2.6, -2.2, 7],
            [5, 0, 6],
            [10.2, 3, 4],
        ];
        const shadow = parts.map(([x, y, r]) => circle(cx + x * s, cy + (y + 1.6) * s, r * s, { fill: '#C3D2EA' }));
        const body = parts.map(([x, y, r]) => circle(cx + x * s, cy + y * s, r * s, { fill: '#FFFFFF' }));
        return [
            ...shadow,
            el('rect', { x: r2(cx - 12 * s), y: r2(cy + 2.6 * s), width: r2(24 * s), height: r2(5 * s), rx: r2(2.5 * s), fill: '#C3D2EA' }),
            ...body,
            el('rect', { x: r2(cx - 12 * s), y: r2(cy + 1 * s), width: r2(24 * s), height: r2(5 * s), rx: r2(2.5 * s), fill: '#FFFFFF' }),
        ];
    };
    const sp = (a, r, R, color) => {
        const [x, y] = polar(r, a);
        return path(sparkleD(x, y, R), { fill: color });
    };
    const c1 = polar(87.5, 136);
    const c2 = polar(87.5, 224);
    return frame(
        'gokkusagi',
        'Gökkuşağı',
        'rare',
        'Yedi rengin hepsi: pulsuz pastel bir gökkuşağı halkası, iki ucunda pamuk bulutlar.',
        [],
        [
            ring(73.6, 1, '#FFFFFF', { opacity: 0.9 }),
            ...bands.map((c, i) => ring(75.4 + i * 2.55, 2.75, c)),
            ring(92.2, 0.9, '#FFFFFF', { opacity: 0.9 }),
            ...cloud(c1[0] + 2, c1[1], 0.92),
            ...cloud(c2[0] - 2, c2[1], 0.92),
            sp(52, 95, 3.4, '#FFD84D'),
            sp(308, 95, 3.4, '#FFD84D'),
            sp(66, 96.5, 1.9, '#FFFFFF'),
            sp(294, 96.5, 1.9, '#FFFFFF'),
            sp(0, 96, 2.6, '#FFD84D'),
        ],
    );
}

/* ================================================================== */
/* 10. Neon Gece — epic (shimmer)                                      */
/* ================================================================== */
function neonGece() {
    const tube = (d, color, core, extra = {}) => [
        path(d, { fill: 'none', stroke: color, strokeWidth: 6.5, opacity: 0.2, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra }),
        path(d, { fill: 'none', stroke: color, strokeWidth: 3.2, opacity: 0.55, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra }),
        path(d, { fill: 'none', stroke: core, strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra }),
    ];
    const ringD = (r) => `${arcD(r, 0, 180)} ${arcD(r, 180, 360)}`;
    // hilal: dış daire (100,8.5) r6.4, iç daire kaydırılmış
    const moon = (() => {
        const O = [100, 9.6];
        const R = 6.2;
        const I = [103.2, 7.6];
        const r = 5.2;
        // iki dairenin kesişimleri
        const dx = I[0] - O[0];
        const dy = I[1] - O[1];
        const d = Math.hypot(dx, dy);
        const a = (R * R - r * r + d * d) / (2 * d);
        const h = Math.sqrt(R * R - a * a);
        const xm = O[0] + (a * dx) / d;
        const ym = O[1] + (a * dy) / d;
        const p1 = [xm + (h * dy) / d, ym - (h * dx) / d];
        const p2 = [xm - (h * dy) / d, ym + (h * dx) / d];
        return `M${P(p1)} A${R} ${R} 0 1 0 ${P(p2)} A${r} ${r} 0 1 1 ${P(p1)} Z`;
    })();
    const heart = D(HEART, mapAt(100, 191, 0, 5.2));
    const spark = (a, R) => {
        const [x, y] = polar(84, a);
        return sparkleD(x, y, R, 0.16);
    };
    const R = rng(11);
    const lights = [];
    for (let i = 0; i < 34; i++) {
        lights.push(
            dot(polar(80.5 + R() * 7.5, R() * 360), 0.35 + R() * 0.5, {
                fill: R() > 0.5 ? '#B9A8FF' : '#FF9AD5',
                opacity: 0.45 + R() * 0.4,
            }),
        );
    }
    return frame(
        'neon-gece',
        'Neon Gece',
        'epic',
        'Gece yarısı tabelası gibi parlayan pembe ve camgöbeği neon tüpler, hilal ve kalp. Işıkları titreşir.',
        [
            lin('ng-bg', [0, 0, 1, 1], [
                [0, '#221650'],
                [0.5, '#120C33'],
                [1, '#1D0F3F'],
            ]),
        ],
        [
            ring(84.6, 25.2, url('ng-bg')),
            ring(72.7, 0.9, '#4A3A99'),
            ring(96.7, 0.9, '#4A3A99'),
            ...lights,
            group(tube(ringD(77.2), '#FF2E97', '#FFD3EC'), {}, 'shimmer'),
            group(
                [
                    ...tube(`${arcD(91.2, 16, 164)} ${arcD(91.2, 196, 344)}`, '#00E5FF', '#D9FCFF'),
                    ...tube(moon, '#FFE45E', '#FFF8C9'),
                    ...tube(heart, '#FF4D6D', '#FFD6DE'),
                ],
                {},
                'shimmer',
            ),
            group(
                [
                    path([spark(45, 3.4), spark(135, 3.4), spark(225, 3.4), spark(315, 3.4)].join(' '), {
                        fill: '#FFFFFF',
                        stroke: '#FF7AC8',
                        strokeWidth: 0.6,
                        strokeLinejoin: 'round',
                    }),
                ],
                {},
                'twinkle',
            ),
            group(
                [
                    path([spark(90, 2.4), spark(270, 2.4), spark(20, 1.8), spark(340, 1.8), spark(160, 1.8), spark(200, 1.8)].join(' '), {
                        fill: '#FFFFFF',
                        stroke: '#5CF0FF',
                        strokeWidth: 0.5,
                        strokeLinejoin: 'round',
                    }),
                ],
                {},
                'twinkle',
            ),
        ],
    );
}

/* ================================================================== */
/* 11. Galata Gecesi — epic                                            */
/* ================================================================== */
function galataGecesi() {
    const SIL = '#0E0A26';
    const base = 98.6; // zemin dış kenarda; binalar merkeze doğru yükselir
    const shapes = [];
    const windows = [];
    const box = (x0, x1, y0, y1) => [['M', x0, y0], ['L', x0, y1], ['L', x1, y1], ['L', x1, y0], ['Z']];
    const lit = (m, x, y, w = 0.9, h = 1.3) => windows.push(D(box(x, x + w, y, y + h), m));
    const R = rng(23);
    // kıyı şeridi
    shapes.push(taperD(180, 244, () => 96.6, 4.4, 0.4, 32), taperD(180, 116, () => 96.6, 4.4, 0.4, 32));
    // evler: 118°..242°, kule (180°) ve cami (148°) çevresi hariç
    const houses = [];
    for (let deg = 124; deg <= 236; ) {
        const w = 4.4 + R() * 3.2;
        const step = (w / (base * Math.PI)) * 180 * 0.9;
        const c = deg + step / 2;
        const far = Math.abs(c - 180) / 56; // kenarlara doğru alçalır
        const free = Math.abs(c - 180) > 7.5 && Math.abs(c - 148) > 8.5;
        if (free) houses.push([c, w, 4 + (1 - far) * 4 + R() * 6 * (1 - far * 0.6), R() > 0.45 ? 'gable' : 'flat']);
        deg += step;
    }
    for (const [deg, w, h, roof] of houses) {
        const m = inFrame(base, deg);
        shapes.push(D(box(-w / 2, w / 2, -0.6, h), m));
        if (roof === 'gable') shapes.push(D([['M', -w / 2 - 0.5, h - 0.1], ['L', 0, h + w * 0.4], ['L', w / 2 + 0.5, h - 0.1], ['Z']], m));
        for (let yy = 2; yy < h - 1.6; yy += 2.6) for (let xx = -w / 2 + 0.9; xx < w / 2 - 1.1; xx += 2) if (R() > 0.55) lit(m, xx, yy);
    }
    // cami silüeti (148°): kubbe, yarım kubbeler, iki ince minare
    const cm = inFrame(base, 148);
    shapes.push(
        D(
            [
                ...box(-7.5, 7.5, -0.6, 5),
                ...box(-4, 4, 4.8, 7.6),
                ['M', -4.6, 7.4],
                ['C', -4.6, 13.2, 4.6, 13.2, 4.6, 7.4],
                ['Z'],
                ...box(-0.25, 0.25, 11.6, 13.6),
                ['M', -7.4, 4.8],
                ['C', -7.4, 8.6, -2.6, 8.6, -2.6, 4.8],
                ['Z'],
                ['M', 2.6, 4.8],
                ['C', 2.6, 8.6, 7.4, 8.6, 7.4, 4.8],
                ['Z'],
                ...box(-9.6, -8.4, -0.6, 13.4),
                ...box(-10, -8, 10, 10.8),
                ['M', -9.6, 13.4],
                ['L', -9, 16.4],
                ['L', -8.4, 13.4],
                ['Z'],
                ...box(8.4, 9.6, -0.6, 13.4),
                ...box(8, 10, 10, 10.8),
                ['M', 8.4, 13.4],
                ['L', 9, 16.4],
                ['L', 9.6, 13.4],
                ['Z'],
            ],
            cm,
        ),
    );
    for (const x of [-6, -3.6, 2.4, 4.8]) lit(cm, x, 1.6, 1, 1.6);
    // Galata Kulesi (180°)
    const g = inFrame(base, 180);
    shapes.push(
        D(
            [
                ['M', -4.6, -0.6],
                ['L', -4.6, 13.4],
                ['L', -5.6, 13.4],
                ['L', -5.6, 14.8],
                ['L', -4.8, 14.8],
                ['L', -4.8, 17.6],
                ['L', -5.4, 17.6],
                ['L', 0, 24.4],
                ['L', 5.4, 17.6],
                ['L', 4.8, 17.6],
                ['L', 4.8, 14.8],
                ['L', 5.6, 14.8],
                ['L', 5.6, 13.4],
                ['L', 4.6, 13.4],
                ['L', 4.6, -0.6],
                ['Z'],
            ],
            g,
        ),
    );
    for (const y of [3, 7.4]) for (const x of [-2.7, 1.6]) lit(g, x, y, 1.1, 2);
    for (const x of [-3.6, -1.7, 0.2, 2.1]) lit(g, x, 15.4, 1.2, 1.6);
    // su yansımaları
    const reflections = [];
    for (const [a0, a1] of [[150, 158], [172, 177], [183, 190], [204, 211], [226, 232]]) reflections.push(arcD(97.2, a0, a1));
    // yıldızlar
    const Rs = rng(5);
    const starsA = [];
    const starsB = [];
    for (let i = 0; i < 22; i++) {
        const a = -100 + Rs() * 200;
        const r = 77 + Rs() * 19;
        (i % 2 ? starsA : starsB).push(dot(polar(r, a), 0.45 + Rs() * 0.7, { fill: i % 3 ? '#FFFFFF' : '#FFE9A8' }));
    }
    const sp = (a, r, s, color) => {
        const [x, y] = polar(r, a);
        return path(sparkleD(x, y, s, 0.18), { fill: color });
    };
    const moon = polar(86.5, 318);
    const gull = (a, r, s) => {
        const [x, y] = polar(r, a);
        return path(D([['M', x - s, y - 0.25 * s], ['Q', x - 0.45 * s, y - 0.85 * s, x, y], ['Q', x + 0.45 * s, y - 0.85 * s, x + s, y - 0.25 * s]]), {
            fill: 'none',
            stroke: '#FFFFFF',
            strokeWidth: 0.7,
            strokeLinecap: 'round',
            opacity: 0.85,
        });
    };
    return frame(
        'galata-gecesi',
        'Galata Gecesi',
        'epic',
        'İstanbul gecesi: ufukta Galata Kulesi, kubbeler ve ışıklı pencereler; mor gökyüzünde dolunay ve göz kırpan yıldızlar.',
        [
            lin('gg-sky', [0.5, 0, 0.5, 1], [
                [0, '#0A1033'],
                [0.45, '#1E1A5C'],
                [0.72, '#4B2A78'],
                [1, '#D0587F'],
            ]),
            radial('gg-moon', { fx: 0.4, fy: 0.35 }, [
                [0, '#FFFBEA'],
                [0.7, '#FBE7A1'],
                [1, '#E9C766'],
            ]),
            radial('gg-glow', {}, [
                [0, '#FFE8A3', 0.5],
                [1, '#FFE8A3', 0],
            ]),
            lin('gg-gold', [0, 0, 1, 1], [
                [0, '#F6E27A'],
                [0.5, '#E2B94C'],
                [1, '#A97A22'],
            ]),
        ],
        [
            ring(86, 27.4, url('gg-sky')),
            ...starsA,
            ...starsB,
            group([sp(-60, 88, 2.8, '#FFFFFF'), sp(22, 81, 2.2, '#FFE9A8'), sp(-18, 93, 1.8, '#FFFFFF'), sp(60, 90, 2.4, '#FFFFFF')], {}, 'twinkle'),
            group([sp(-30, 80, 1.9, '#FFE9A8'), sp(40, 94, 1.6, '#FFFFFF'), sp(85, 83, 2, '#FFE9A8'), sp(-88, 82, 1.7, '#FFFFFF')], {}, 'twinkle'),
            circle(moon[0], moon[1], 10.5, { fill: url('gg-glow') }),
            circle(moon[0], moon[1], 6.2, { fill: url('gg-moon') }),
            dot(add(moon, [1.8, 1.4]), 1.3, { fill: '#E9C766', opacity: 0.55 }),
            dot(add(moon, [-2, -0.8]), 0.8, { fill: '#E9C766', opacity: 0.5 }),
            gull(162, 79.5, 2),
            gull(167, 82.5, 1.4),
            path(shapes.join(' '), { fill: SIL }),
            group([path(windows.join(' '), { fill: '#FFD37A' })], {}, 'shimmer'),
            path(reflections.join(' '), { fill: 'none', stroke: '#FFD37A', strokeWidth: 0.7, strokeLinecap: 'round', opacity: 0.7 }),
            ring(73, 1.2, url('gg-gold')),
            ring(99.3, 1.4, url('gg-gold')),
        ],
    );
}

/* ================================================================== */
/* 12. Buz Kristali — epic                                             */
/* ================================================================== */
function buzKristali() {
    const shards = [];
    for (let i = 0; i < 12; i++) {
        const a = i * 30;
        const long = i % 2 === 0;
        const h = long ? 16 : 9.5;
        const w = long ? 7.4 : 5.2;
        const m = outFrame(83, a);
        const facetL = D([['M', 0, -1], ['L', -w / 2, h * 0.34], ['L', 0, h], ['Z']], m);
        const facetR = D([['M', 0, -1], ['L', w / 2, h * 0.34], ['L', 0, h], ['Z']], m);
        shards.push({ l: facetL, r: facetR });
        if (long) {
            for (const sgn of [-1, 1]) {
                const mm = mapAt(...m(sgn * 2.4, 1.2), a + sgn * 34);
                shards.push({
                    l: D([['M', 0, 0], ['L', -1.6, 2.4], ['L', 0, 7], ['Z']], mm),
                    r: D([['M', 0, 0], ['L', 1.6, 2.4], ['L', 0, 7], ['Z']], mm),
                });
            }
        }
    }
    const icicles = [];
    for (let i = 0; i < 36; i++) {
        const a = i * 10 + 5;
        const len = i % 3 === 0 ? 3.6 : 2.4;
        icicles.push(D([['M', -1.3, 0], ['L', 0, len], ['L', 1.3, 0], ['Z']], inFrame(75.6, a)));
    }
    const flake = (a, r, s) => {
        const [cx, cy] = polar(r, a);
        const segs = [];
        for (let k = 0; k < 6; k++) {
            const m = mapAt(cx, cy, k * 60, s);
            segs.push(D([['M', 0, 0], ['L', 0, 1]], m));
            segs.push(D([['M', -0.3, 0.75], ['L', 0, 0.52], ['L', 0.3, 0.75]], m));
        }
        const d = segs.join(' ');
        return [
            path(d, { fill: 'none', stroke: '#4E9FDB', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' }),
            path(d, { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
            circle(cx, cy, s * 0.16, { fill: '#FFFFFF', stroke: '#4E9FDB', strokeWidth: 0.4 }),
        ];
    };
    const glint = (a, r, s) => {
        const [x, y] = polar(r, a);
        return sparkleD(x, y, s, 0.14);
    };
    return frame(
        'buz-kristali',
        'Buz Kristali',
        'epic',
        'Kristal sivri uçlar, kırağı tutmuş bir iç kenar ve dönen kar taneleri. Kuzeyin soğuk ışıltısı.',
        [
            lin('bk-ice', [0, 0, 1, 1], [
                [0, '#F3FBFF'],
                [0.5, '#A9DCF7'],
                [1, '#4E9FDB'],
            ]),
            lin('bk-face-l', [0, 0, 1, 1], [
                [0, '#FFFFFF'],
                [1, '#CDEBFC'],
            ]),
            lin('bk-face-r', [0, 0, 1, 1], [
                [0, '#9FD6F5'],
                [1, '#5AA9E6'],
            ]),
        ],
        [
            path(shards.map((s) => s.r).join(' '), { fill: url('bk-face-r'), stroke: '#3D8FD1', strokeWidth: 0.45, strokeLinejoin: 'round' }),
            path(shards.map((s) => s.l).join(' '), { fill: url('bk-face-l'), stroke: '#3D8FD1', strokeWidth: 0.45, strokeLinejoin: 'round' }),
            ring(79.4, 9.2, url('bk-ice')),
            ring(84.4, 0.9, '#3D8FD1'),
            ring(75, 1, '#FFFFFF'),
            path(icicles.join(' '), { fill: '#E3F5FF', stroke: '#8CC8EE', strokeWidth: 0.35, strokeLinejoin: 'round' }),
            group([...flake(45, 91.5, 6), ...flake(135, 91.5, 6), ...flake(225, 91.5, 6), ...flake(315, 91.5, 6)], {}, 'pulse'),
            path(arcD(79.4, 300, 345), { fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeLinecap: 'round', opacity: 0.8 }),
            path(arcD(79.4, 120, 150), { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.4, strokeLinecap: 'round', opacity: 0.6 }),
            group([path([glint(15, 79.4, 3.2), glint(165, 79.4, 2.6), glint(255, 79.4, 3)].join(' '), { fill: '#FFFFFF' })], {}, 'twinkle'),
            group([path([glint(75, 79.4, 2.4), glint(205, 79.4, 3.2), glint(330, 96, 2.4)].join(' '), { fill: '#FFFFFF' })], {}, 'twinkle'),
        ],
    );
}

/* ================================================================== */
/* 13. İznik Çini — epic                                               */
/* ================================================================== */
function iznikCini() {
    const motifs = [];
    for (let i = 0; i < 8; i++) {
        const a = i * 45;
        if (i % 2 === 0) {
            // hatayi rozet
            const [cx, cy] = polar(85, a);
            const petals = [];
            for (let k = 0; k < 8; k++) {
                petals.push(
                    D(
                        [
                            ['M', 0, 1.8],
                            ['C', -2.4, 3.6, -2.2, 6.6, 0, 7.6],
                            ['C', 2.2, 6.6, 2.4, 3.6, 0, 1.8],
                            ['Z'],
                        ],
                        mapAt(cx, cy, a + k * 45 + 22.5, 1.2),
                    ),
                );
            }
            motifs.push(
                path(petals.join(' '), { fill: url('ic-cobalt'), stroke: '#0F2466', strokeWidth: 0.4 }),
                circle(cx, cy, 3.7, { fill: '#2AA7A5', stroke: '#0F2466', strokeWidth: 0.4 }),
                circle(cx, cy, 1.8, { fill: '#D2402A' }),
            );
            for (let k = 0; k < 8; k++) motifs.push(dot(mapAt(cx, cy, a + k * 45)(0, 6), 0.85, { fill: '#FFFFFF', opacity: 0.85 }));
        } else {
            // Osmanlı lalesi: sivri orta yaprak, dışa kıvrılan yan yapraklar
            const m = outFrame(77.4, a);
            motifs.push(
                path(D([['M', 0, 0], ['L', 0, 6]], m), { fill: 'none', stroke: '#2F7A4E', strokeWidth: 1.1, strokeLinecap: 'round' }),
                path(
                    D(
                        [
                            ['M', 0, 1],
                            ['C', -3, 2, -6, 4.5, -8, 9],
                            ['C', -5, 7.4, -2.6, 5.6, 0, 3.6],
                            ['Z'],
                            ['M', 0, 1],
                            ['C', 3, 2, 6, 4.5, 8, 9],
                            ['C', 5, 7.4, 2.6, 5.6, 0, 3.6],
                            ['Z'],
                        ],
                        m,
                    ),
                    { fill: '#3E8E5E', stroke: '#245C3B', strokeWidth: 0.35 },
                ),
                path(
                    D(
                        [
                            ['M', -0.4, 5.6],
                            ['C', -4.6, 6.4, -5.8, 10.4, -4.6, 14.8],
                            ['C', -3.4, 12, -2.2, 10, -0.4, 9],
                            ['Z'],
                            ['M', 0.4, 5.6],
                            ['C', 4.6, 6.4, 5.8, 10.4, 4.6, 14.8],
                            ['C', 3.4, 12, 2.2, 10, 0.4, 9],
                            ['Z'],
                        ],
                        m,
                    ),
                    { fill: '#A8281A', stroke: '#0F2466', strokeWidth: 0.4, strokeLinejoin: 'round' },
                ),
                path(D([['M', 0, 4.8], ['C', -3, 7, -3, 12, 0, 16.8], ['C', 3, 12, 3, 7, 0, 4.8], ['Z']], m), {
                    fill: '#D2402A',
                    stroke: '#0F2466',
                    strokeWidth: 0.5,
                    strokeLinejoin: 'round',
                }),
                path(D([['M', 0, 7], ['Q', -1, 10.5, 0, 14]], m), { fill: 'none', stroke: '#FFD9CF', strokeWidth: 0.6, strokeLinecap: 'round', opacity: 0.85 }),
            );
        }
    }
    // dal: motiflerden geçen dalgalı sarmaşık + üstünde saz yaprakları ve tomurcuklar
    const vineR = (deg) => 85 + 5 * Math.sin((8 * deg * Math.PI) / 180);
    const vinePts = [];
    for (let k = 0; k <= 360; k += 2) vinePts.push(P(polar(vineR(k), k)));
    const vine = `M${vinePts.join(' L')}`;
    const saz = [];
    const florets = [];
    for (let i = 0; i < 16; i++) {
        const a = i * 22.5 + 11.25;
        const out = i % 2 === 0;
        // yaprak sarmaşığın tepe noktasından dışa/içe, sarmaşık yönünde uzanır
        const m = mapAt(...polar(vineR(a), a), a + (out ? 55 : 125), 1);
        saz.push(
            D(
                [
                    ['M', 0, 0],
                    ['C', -2.6, 2.4, -2.2, 6.4, 0.6, 8.4],
                    ['C', 0.2, 6, 2, 3, 0, 0],
                    ['Z'],
                ],
                m,
            ),
        );
        const fp = polar(85, i * 22.5 + 22.5);
        if (i % 2 === 0) {
            for (let k = 0; k < 5; k++) florets.push(dot(mapAt(fp[0], fp[1], k * 72 + i * 11)(0, 1.5), 1, { fill: '#2B4BA3' }));
            florets.push(dot(fp, 0.9, { fill: '#D2402A' }));
        }
    }
    const borderDots = [];
    for (let i = 0; i < 48; i++) borderDots.push(dot(polar(97.3, i * 7.5), 0.55, { fill: '#FFFFFF', opacity: 0.85 }));
    return frame(
        'iznik-cini',
        'İznik Çini',
        'epic',
        'İznik çinisinden ilham: kobalt mavi hatayi rozetleri, mercan kırmızısı laleler ve saz yaprakları. Sırrı ışıkta parlar.',
        [
            lin('ic-cobalt', [0, 0, 1, 1], [
                [0, '#3558B5'],
                [1, '#16307A'],
            ]),
            lin('ic-tile', [0, 0, 1, 1], [
                [0, '#FFFDF7'],
                [0.6, '#F7F1E3'],
                [1, '#EDE3CC'],
            ]),
        ],
        [
            ring(85, 25, url('ic-tile')),
            ring(73.5, 2, url('ic-cobalt')),
            ring(76.2, 0.9, '#2AA7A5'),
            ring(93.8, 0.9, '#2AA7A5'),
            ring(97.3, 3.4, url('ic-cobalt')),
            ...borderDots,
            path(vine, { fill: 'none', stroke: '#2AA7A5', strokeWidth: 0.9, strokeLinecap: 'round' }),
            path(saz.join(' '), { fill: '#2AA7A5', stroke: '#1B7372', strokeWidth: 0.35 }),
            ...florets,
            ...motifs,
            group(
                [
                    path(arcD(89.5, 298, 336), { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.8, strokeLinecap: 'round', opacity: 0.75 }),
                    path(arcD(80.5, 118, 146), { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.6 }),
                ],
                {},
                'shimmer',
            ),
        ],
    );
}

/* ================================================================== */
/* 14. Yıldız Tozu — legendary (twinkle)                               */
/* ================================================================== */
function yildizTozu() {
    const R = rng(42);
    const dust = [[], [], []];
    for (let i = 0; i < 72; i++) {
        const c = R();
        dust[i % 3].push(
            dot(polar(75 + R() * 20.5, R() * 360), 0.35 + R() * 0.75, {
                fill: c < 0.5 ? '#FFFFFF' : c < 0.8 ? '#FFE9A8' : '#BFE9FF',
                opacity: 0.55 + R() * 0.45,
            }),
        );
    }
    const sp = (a, r, s, k = 0.18) => {
        const [x, y] = polar(r, a);
        return sparkleD(x, y, s, k);
    };
    const nebula = [
        [40, 86, 11.5, 'yt-neb1'],
        [70, 88, 9, 'yt-neb2'],
        [150, 86, 12, 'yt-neb2'],
        [200, 87, 10, 'yt-neb1'],
        [252, 86, 11.5, 'yt-neb1'],
        [292, 88, 9, 'yt-neb2'],
        [330, 86, 11, 'yt-neb2'],
        [108, 87, 9, 'yt-neb1'],
    ].map(([a, r, s, id]) => dot(polar(r, a), s, { fill: url(id) }));
    // kuyruklu yıldız: 206° başlık, saat yönünün tersine doğru incelen kuyruk
    const head = polar(90, 206);
    const trail = taperD(206, 148, (t) => 90 - t * 1.5, 3.6, 0.2, 40);
    const trailCore = taperD(206, 166, (t) => 90 - t * 1, 1.6, 0.1, 30);
    const top = polar(86, 0);
    const beads = [];
    for (let i = 0; i < 36; i++) beads.push(dot(polar(97.6, i * 10 + 5), 0.75, { fill: '#FFF3C4' }));
    return frame(
        'yildiz-tozu',
        'Yıldız Tozu',
        'legendary',
        'Galaksi kadar derin: renkli bulutsular, parıldayan yıldız tozu, altın tepe yıldızı ve çerçevenin çevresinde dolanan kuyruklu yıldız.',
        [
            lin('yt-space', [0, 0, 1, 1], [
                [0, '#2A1060'],
                [0.5, '#170B42'],
                [1, '#0E1E5B'],
            ]),
            lin('yt-gold', [0, 0, 1, 1], [
                [0, '#FFF6C9'],
                [0.45, '#F2C94C'],
                [0.7, '#FFE9A0'],
                [1, '#C98E1E'],
            ]),
            radial('yt-neb1', {}, [
                [0, '#FF7AD9', 0.55],
                [0.6, '#C04FD8', 0.22],
                [1, '#C04FD8', 0],
            ]),
            radial('yt-neb2', {}, [
                [0, '#5CE1FF', 0.5],
                [0.6, '#4F7BFF', 0.2],
                [1, '#4F7BFF', 0],
            ]),
            radial('yt-glow', {}, [
                [0, '#FFFFFF', 0.95],
                [0.3, '#FFF2B3', 0.6],
                [1, '#FFE08A', 0],
            ]),
        ],
        [
            ring(85, 25.2, url('yt-space')),
            ...nebula,
            group(dust[0], {}, 'twinkle'),
            group(dust[1], {}, 'twinkle'),
            ...dust[2],
            group(
                [
                    path([sp(30, 80, 3.2), sp(118, 92, 3.8), sp(205, 80, 2.8), sp(300, 91, 3.6)].join(' '), { fill: '#FFFFFF' }),
                    path([sp(75, 80.5, 2.4), sp(160, 81, 2.2), sp(270, 79.5, 2.4), sp(330, 80, 2.2)].join(' '), { fill: '#FFE9A8' }),
                ],
                {},
                'twinkle',
            ),
            group(
                [
                    path([sp(55, 93, 2.6), sp(140, 91, 2.2), sp(248, 93, 2.6), sp(318, 92.5, 2)].join(' '), { fill: '#BFE9FF' }),
                    path([sp(95, 85, 1.8), sp(185, 92, 1.8), sp(232, 79, 1.6), sp(12, 92.5, 1.8)].join(' '), { fill: '#FFFFFF' }),
                ],
                {},
                'twinkle',
            ),
            group(
                [
                    path(trail, { fill: '#FFF1C2', opacity: 0.5 }),
                    path(trailCore, { fill: '#FFFFFF', opacity: 0.85 }),
                    circle(head[0], head[1], 5, { fill: url('yt-glow') }),
                    circle(head[0], head[1], 1.7, { fill: '#FFFFFF' }),
                ],
                {},
                'spin',
            ),
            ring(73.3, 1.8, url('yt-gold')),
            ring(97.6, 2.6, url('yt-gold')),
            ...beads,
            ...[120, 240].flatMap((a) => {
                const [x, y] = polar(97, a);
                return [
                    circle(x, y, 5.6, { fill: url('yt-glow') }),
                    path(sparkleD(x, y, 4.6, 0.22), { fill: url('yt-gold'), stroke: '#B07A16', strokeWidth: 0.4, strokeLinejoin: 'round' }),
                ];
            }),
            // tepe yıldızı
            circle(top[0], top[1], 11, { fill: url('yt-glow') }),
            path(sparkleD(top[0], top[1], 10.5, 0.2), { fill: url('yt-gold'), stroke: '#B07A16', strokeWidth: 0.5, strokeLinejoin: 'round' }),
            el('polygon', { points: starPts(top[0], top[1], 6, 2.2, 4, 45), fill: '#FFF6C9', stroke: '#C98E1E', strokeWidth: 0.4, strokeLinejoin: 'round' }),
            circle(top[0], top[1], 1.6, { fill: '#FFFFFF' }),
        ],
    );
}

/* ================================================================== */
/* 15. Ateş Halkası — legendary (pulse)                                */
/* ================================================================== */
function atesHalkasi() {
    const flameLayer = (n, offset, hMin, hMax, wMin, wMax, seed, r0 = 76) => {
        const R = rng(seed);
        const parts = [];
        for (let i = 0; i < n; i++) {
            const a = offset + (i * 360) / n + (R() - 0.5) * 6;
            const h = hMin + R() * (hMax - hMin);
            const w = wMin + R() * (wMax - wMin);
            const L = (i % 2 ? 1 : -1) * (0.22 + R() * 0.3);
            const X = (v) => v * w;
            const Y = (v) => v * h;
            parts.push(
                D(
                    [
                        ['M', X(-0.5), 0],
                        ['C', X(-0.64), Y(0.3), X(-0.44), Y(0.5), X(-0.2), Y(0.64)],
                        ['C', X(0.0), Y(0.76), X(L * 0.9), Y(0.84), X(L), Y(1)],
                        ['C', X(L * 0.5 + 0.14), Y(0.84), X(0.36), Y(0.68), X(0.4), Y(0.44)],
                        ['C', X(0.44), Y(0.26), X(0.58), Y(0.12), X(0.5), 0],
                        ['Z'],
                    ],
                    outFrame(r0, a),
                ),
            );
        }
        return parts.join(' ');
    };
    const R = rng(99);
    const embers = [[], []];
    for (let i = 0; i < 26; i++) {
        const a = R() * 360;
        const r = 92 + R() * 6.5;
        const s = 0.5 + R() * 0.9;
        embers[i % 2].push(dot(polar(r, a), s, { fill: R() > 0.4 ? '#FFD166' : '#FF9F1C' }));
    }
    return frame(
        'ates-halkasi',
        'Ateş Halkası',
        'legendary',
        'Kor gibi yanan, nefes alır gibi kabarıp sönen üç katmanlı alevler ve etrafa saçılan kıvılcımlar. Gerçek efsanelere.',
        [
            radial('ah-heat', {}, [
                [0, '#FFF3B0'],
                [0.74, '#FFE066'],
                [0.82, '#FF9F1C'],
                [0.9, '#F3501E'],
                [1, '#B5121B'],
            ]),
            radial('ah-heat2', {}, [
                [0, '#FFF6C2'],
                [0.8, '#FFD23F'],
                [0.9, '#FF9F1C'],
                [1, '#FF6A00'],
            ]),
            radial('ah-heat3', {}, [
                [0, '#FFFFFF'],
                [0.86, '#FFF7CC'],
                [1, '#FFD23F'],
            ]),
            lin('ah-core', [0, 0, 1, 1], [
                [0, '#FFE066'],
                [0.5, '#FF9F1C'],
                [1, '#F3501E'],
            ]),
        ],
        [
            group(
                [
                    path(flameLayer(22, 0, 13, 23, 11, 15, 3), { fill: url('ah-heat') }),
                    path(flameLayer(22, 8, 9, 15.5, 9, 12, 4), { fill: url('ah-heat2') }),
                ],
                {},
                'pulse',
            ),
            ring(79.6, 7.6, url('ah-core')),
            group([path(flameLayer(26, 4, 5, 9, 5.5, 7.5, 5, 80.5), { fill: url('ah-heat3') })], {}, 'shimmer'),
            ring(74.4, 2.2, '#FFE8A3'),
            ring(76.4, 0.9, '#C1121F', { opacity: 0.7 }),
            ring(72.9, 0.8, '#B5121B', { opacity: 0.8 }),
            group(embers[0], {}, 'twinkle'),
            group(embers[1], {}, 'twinkle'),
        ],
    );
}

export const FRAMES = [
    gumusInci(),
    gunBatimi(),
    okyanusDalgasi(),
    mercanKalp(),
    altinDefne(),
    kirazCicegi(),
    laleBahcesi(),
    nazar(),
    gokkusagi(),
    neonGece(),
    galataGecesi(),
    buzKristali(),
    iznikCini(),
    yildizTozu(),
    atesHalkasi(),
];

export default FRAMES;
