/**
 * Jeton Mağazası — Keşif Koleksiyonu (kategori `kesif`, 29 görünüm).
 *
 * SAF VERİ: React/DOM yok. Web (React DOM SVG) ve mobil (react-native-svg) bu
 * diziyi birebir aynı şekilde çizer; mobil kopya BAYT BAYT aynıdır
 * (scripts/game-web-catalog.mjs bunu denetler). Oyun motoru (render/skins.js)
 * her öğenin `skin` verisini okur: skin yalnızca renk/parametredir, yeni
 * geometri ya da malzeme türü eklemez. Salt kozmetik: oynanışı etkilemez.
 *
 * Her öğe: { id, category:'kesif', kind, name, rarity, description, skin, art }
 *   id     `<önek>:<ad>`; önek = kind = kuşanma yuvası (portal alet asa jet arac gecis)
 *   skin   '#RRGGBB' düz JSON (şemalar aşağıda, KESIF_SKIN_SCHEMA)
 *   art    skin renklerinden ÜRETİLEN 64×64 mağaza önizlemesi (6 şablon: portal
 *          tabancası, alet üçlüsü, büyü asası, jetpack, araba, geçiş halkaları).
 *          Yalnızca F.2 etiket/prop kümesi; `anim` yalnız epic/legendary.
 *
 * Şema (hepsi '#RRGGBB'; sayılar belirtilen aralıkta):
 *   portal: { body, trim, a:{c,c2}, b:{c,c2} }           a = ilk portal, b = ikinci portal
 *   alet:   { palette:{ head, light, dark, edge, handle, handleDark, wrap, glow|null, rough, metal } }
 *   asa:    { crystal, ring?, cycle?:true }
 *   jet:    { flame:[c0,c1,c2], smoke, tank?, spark?:true }
 *   arac:   { body, accent, neon, under:0|1|2, wheels:0..3, rim?, nitro?:[c0,c1], cycle?:true }
 *   gecis:  { ring:[c0,c1], spark?:hex }
 *
 * Erişilebilirlik: portal çiftinin parlaklık (CIE L*) farkı ≥ 25 ve ton farkı ≥ 60°
 * (iki portal ayrıca halka ŞEKLİYLE de ayrışır: a düz, b kesikli); alet sapı/başı
 * kontrastı ≥ 3:1 (kesif.test.js doğrular).
 */

/* ------------------------------------------------------------------ */
/* Sabitler                                                            */
/* ------------------------------------------------------------------ */

export const KESIF_KINDS = ['portal', 'alet', 'asa', 'jet', 'arac', 'gecis'];

/** Tür başına arayüz metni (çip adı, "oyunda şöyle görünür" açıklaması). */
export const KESIF_KIND_INFO = {
    portal: { label: 'Portal', title: 'Portal Tabancası', hint: 'Portal Tabancası’nın gövdesi ve iki portalın renkleri değişir.' },
    alet: { label: 'Alet', title: 'Kazma, balta, kürek', hint: 'Kazma, balta ve küreğin başı ile sapı yeni renklere bürünür.' },
    asa: { label: 'Asa', title: 'Büyü asası', hint: 'Büyü asasının kristali ve halkası yeni renklere bürünür.' },
    jet: { label: 'Jetpack', title: 'Jetpack izi', hint: 'Jetpack’in egzoz ışığı ve dumanı yeni renklere bürünür.' },
    arac: { label: 'Araç', title: 'Araç boya kiti', hint: 'Sürdüğün araç yeni boya, şerit ve neon ışığıyla görünür.' },
    gecis: { label: 'Geçiş', title: 'Geçiş efekti', hint: 'Boyutlar arası geçişte halkalar ve parıltılar yeni renklerde olur.' },
};

/** Keşif rozetlerinin adları (rozetle açılan öğelerin kilit metni için). */
export const KESIF_BADGES = {
    kesif_ilk_adim: 'İlk Keşif',
    kesif_gezgin_5: 'Dünya Gezgini',
    kesif_bolge_1: 'Vadi Kâşifi',
    kesif_bolge_2: 'Fısıltı Dostu',
    kesif_bolge_3: 'Kanyon Aşıcı',
    kesif_bolge_4: 'Zirve Aşıcı',
    kesif_muhur_ustasi: 'Mühür Ustası',
    kesif_parkur_cirak: 'Parkur Çırağı',
    kesif_parkur_usta: 'Parkur Ustası',
    kesif_diyar_fatihi: 'Diyar Kâşifi',
    kesif_neon_ilk_is: 'İlk Kurye',
    kesif_neon_pist_altini: 'Pist Altını',
    kesif_neon_cip_60: 'Çip Koleksiyoncusu',
    kesif_neon_diyar_isigi: 'Diyar Işığı',
    kesif_neon_usta: 'Neon Meridyen Ustası',
    kesif_mimar: 'Mimar',
    kesif_populer_mimar: 'Popüler Mimar',
    kesif_harita_atolyesi: 'Harita Atölyesi',
};

const VIEWBOX = '0 0 64 64';
const OL = '#2A2142'; // kontur (mini avatarlarla aynı)
const SW = 2.1;

/* ------------------------------------------------------------------ */
/* Renk ve yapı yardımcıları (düz veri üretir)                          */
/* ------------------------------------------------------------------ */

const r2 = (n) => Math.round(n * 100) / 100;
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const mix = (a, b, t) => {
    const x = hx(a);
    const y = hx(b);
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
const light = (h, t) => mix(h, '#FFFFFF', t);
const dark = (h, t) => mix(h, '#1A1238', t);

const stop = (offset, color, opacity) => (opacity === undefined ? { offset, color } : { offset, color, opacity });
const lin = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => ({ tag: 'linearGradient', id, props: { x1, y1, x2, y2 }, stops });
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
const path = (d, props) => el('path', { d, ...props });
const circ = (cx, cy, r, props) => el('circle', { cx: r2(cx), cy: r2(cy), r: r2(r), ...props });
const ell = (cx, cy, rx, ry, props) => el('ellipse', { cx: r2(cx), cy: r2(cy), rx: r2(rx), ry: r2(ry), ...props });
const rect = (x, y, width, height, rx, props) => el('rect', { x: r2(x), y: r2(y), width: r2(width), height: r2(height), rx, ...props });
const g = (children, props = {}, anim) => el('g', props, children, anim);
const tf = (x, y, deg, s) => `translate(${r2(x)} ${r2(y)}) rotate(${r2(deg)} 0 0)${s && s !== 1 ? ` scale(${r2(s)})` : ''}`;

/** 4 köşeli parıltı yıldızı */
const sparkD = (cx, cy, r) => {
    const k = r * 0.22;
    return (
        `M${r2(cx)} ${r2(cy - r)} Q${r2(cx + k)} ${r2(cy - k)} ${r2(cx + r)} ${r2(cy)} ` +
        `Q${r2(cx + k)} ${r2(cy + k)} ${r2(cx)} ${r2(cy + r)} ` +
        `Q${r2(cx - k)} ${r2(cy + k)} ${r2(cx - r)} ${r2(cy)} ` +
        `Q${r2(cx - k)} ${r2(cy - k)} ${r2(cx)} ${r2(cy - r)} Z`
    );
};
const spark = (cx, cy, r, fill, opacity = 1) => path(sparkD(cx, cy, r), { fill, opacity });

/** Yumuşak yer gölgesi */
const groundShadow = (rx = 20, cy = 61.2) => ell(32, cy, rx, 2.4, { fill: OL, opacity: 0.18 });

/**
 * Nadirlik zenginliği (ortak): rare + pırıltı; epic + animasyonlu pırıltı ve nabızlı hale;
 * legendary + ikinci animasyon grubu. `a`/`b` pırıltı renkleri, `halo` hale rengi.
 */
function decor(rarity, id, { a, b, halo, cx = 32, cy = 32, r = 30 }) {
    const out = { before: [], after: [], defs: [] };
    if (rarity === 'common') return out;
    const spots = [
        [10, 12, 3.1, a],
        [55, 9, 2.4, b],
        [56, 52, 2.1, a],
    ];
    if (rarity === 'rare') {
        out.after.push(...spots.slice(0, 2).map(([x, y, s, c]) => spark(x, y, s, c, 0.95)));
        return out;
    }
    const haloId = `${id}-halo`;
    out.defs.push(rad(haloId, [stop(0, halo, 0.5), stop(0.6, halo, 0.16), stop(1, halo, 0)]));
    out.before.push(g([circ(cx, cy, r, { fill: `url(#${haloId})` })], {}, 'pulse'));
    out.after.push(g([spark(...spots[0].slice(0, 3), spots[0][3]), spark(...spots[2].slice(0, 3), spots[2][3])], {}, 'twinkle'));
    out.after.push(g([spark(...spots[1].slice(0, 3), spots[1][3]), spark(8, 40, 1.8, b, 0.95)], {}, rarity === 'legendary' ? 'shimmer' : 'twinkle'));
    return out;
}

const idOf = (key) => key.replace(':', '-');

/* ------------------------------------------------------------------ */
/* Şablon 1 — Portal Tabancası                                         */
/* ------------------------------------------------------------------ */

function portalArt(it) {
    const { skin: s, rarity } = it;
    const k = idOf(it.id);
    const d = decor(rarity, k, { a: s.a.c, b: s.b.c, halo: s.a.c });
    const hi = light(s.body, 0.5);
    const lo = dark(s.body, 0.3);
    const portal = (cx, cy, c, tag, dashed) => {
        const nodes = [
            ell(cx, cy, 13, 15.4, { fill: `url(#${k}-g${tag})` }),
            ell(cx, cy, 8.4, 12.4, { fill: `url(#${k}-v${tag})`, stroke: `url(#${k}-r${tag})`, strokeWidth: 3.2 }),
        ];
        if (dashed) {
            const segs = [];
            for (let i = 0; i < 12; i++) {
                const t0 = (i * 360) / 12;
                const t1 = t0 + 17;
                const p = (t) => `${r2(cx + 4.7 * Math.cos((t * Math.PI) / 180))} ${r2(cy + 8.6 * Math.sin((t * Math.PI) / 180))}`;
                segs.push(`M${p(t0)} L${p(t1)}`);
            }
            nodes.push(path(segs.join(' '), { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.85 }));
        } else {
            nodes.push(ell(cx, cy, 4.7, 8.6, { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.1, opacity: 0.8 }));
        }
        nodes.push(path(`M${r2(cx - 6.2)} ${r2(cy - 6.4)} Q${r2(cx - 5.4)} ${r2(cy - 10.2)} ${r2(cx)} ${r2(cy - 11)}`, { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.55 }));
        return nodes;
    };
    const defs = [
        lin(`${k}-body`, [stop(0, hi), stop(0.5, s.body), stop(1, lo)]),
        lin(`${k}-grip`, [stop(0, mix(s.body, s.trim, 0.25)), stop(1, dark(s.body, 0.5))]),
        rad(`${k}-ga`, [stop(0, s.a.c, 0.6), stop(1, s.a.c, 0)]),
        rad(`${k}-gb`, [stop(0, s.b.c, 0.6), stop(1, s.b.c, 0)]),
        rad(`${k}-va`, [stop(0, '#070B24'), stop(0.62, dark(s.a.c2, 0.62)), stop(1, s.a.c2)]),
        rad(`${k}-vb`, [stop(0, '#070B24'), stop(0.62, dark(s.b.c2, 0.62)), stop(1, s.b.c2)]),
        lin(`${k}-ra`, [stop(0, s.a.c), stop(1, s.a.c2)], 0, 0, 1, 1),
        lin(`${k}-rb`, [stop(0, s.b.c), stop(1, s.b.c2)], 0, 0, 1, 1),
        ...d.defs,
    ];
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [
            ...d.before,
            ...portal(15, 16.4, s.a, 'a', false),
            ...portal(49, 16.4, s.b, 'b', true),
            groundShadow(23),
            // kabza
            path('M19.6 47 L29.4 47 L27.6 59 C27.4 60.4 26.4 61 25 61 L22.6 61 C21 61 20.2 60.2 20.4 58.8 Z', { fill: `url(#${k}-grip)`, stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
            path('M21.6 51 L28.6 51 M21.2 54.4 L28.2 54.4', { fill: 'none', stroke: s.trim, strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.8 }),
            path('M31 50 C31 55.6 37.6 55.6 37.6 50', { fill: 'none', stroke: OL, strokeWidth: 1.9, strokeLinecap: 'round' }),
            // gövde ve namlu
            rect(8.4, 32.6, 39, 17.6, 7.4, { fill: `url(#${k}-body)`, stroke: OL, strokeWidth: SW }),
            rect(44, 36.2, 14.4, 10.8, 4.2, { fill: `url(#${k}-body)`, stroke: OL, strokeWidth: SW }),
            rect(47.2, 36.6, 1.8, 10, 0.6, { fill: s.trim }),
            rect(51.4, 36.6, 1.8, 10, 0.6, { fill: s.trim }),
            path('M12 42 L42 42', { fill: 'none', stroke: s.trim, strokeWidth: 2.2, strokeLinecap: 'round' }),
            // ekran
            rect(13.4, 35.4, 12.4, 5.4, 1.8, { fill: '#10153A', stroke: OL, strokeWidth: 1 }),
            circ(17.2, 38.1, 1.25, { fill: s.a.c }),
            circ(21.8, 38.1, 1.25, { fill: s.b.c }),
            // ağız: iki portal rengi yarım daire
            circ(57.4, 41.6, 4.4, { fill: '#10153A', stroke: OL, strokeWidth: 1.6 }),
            path('M57.4 37.8 A3.8 3.8 0 0 0 57.4 45.4 Z', { fill: s.a.c }),
            path('M57.4 37.8 A3.8 3.8 0 0 1 57.4 45.4 Z', { fill: s.b.c }),
            ell(24, 35, 10.6, 1.5, { fill: '#FFFFFF', opacity: 0.42 }),
            ...d.after,
        ],
    };
}

/* ------------------------------------------------------------------ */
/* Şablon 2 — Alet üçlüsü (kazma, balta, kürek)                         */
/* ------------------------------------------------------------------ */

function aletArt(it) {
    const { palette: p } = it.skin;
    const k = idOf(it.id);
    const d = decor(it.rarity, k, { a: p.light, b: p.glow || p.wrap, halo: p.glow || p.light, cx: 32, cy: 30, r: 29 });
    const defs = [
        lin(`${k}-head`, [stop(0, p.light), stop(0.45, p.head), stop(1, p.dark)], 0, 0, 0, 1),
        lin(`${k}-handle`, [stop(0, p.handle), stop(1, p.handleDark)], 0, 0, 1, 0),
        ...d.defs,
    ];
    if (p.glow) defs.push(rad(`${k}-glow`, [stop(0, p.glow, 0.7), stop(1, p.glow, 0)]));
    const glowAt = (x, y, r) => (p.glow ? [circ(x, y, r, { fill: `url(#${k}-glow)` })] : []);
    const handle = (len = 46) => [
        rect(-2.5, -len + 2, 5, len, 2.4, { fill: `url(#${k}-handle)`, stroke: p.edge, strokeWidth: 1.5 }),
        rect(-2.9, -13, 5.8, 9, 1.4, { fill: p.wrap, stroke: p.edge, strokeWidth: 1 }),
        path('M-2.9 -10.6 L2.9 -10.6 M-2.9 -8.2 L2.9 -8.2 M-2.9 -5.8 L2.9 -5.8', { fill: 'none', stroke: p.edge, strokeWidth: 0.6, opacity: 0.7 }),
        circ(0, 3, 2.7, { fill: p.dark, stroke: p.edge, strokeWidth: 1.2 }),
    ];
    const pick = () =>
        g([
            ...glowAt(0, -42, 17),
            ...handle(),
            path('M-20 -37 C-15 -46 -6 -50 0 -50 C6 -50 15 -46 20 -37 C14 -41 7 -42.4 3.4 -42.4 L-3.4 -42.4 C-7 -42.4 -14 -41 -20 -37 Z', { fill: `url(#${k}-head)`, stroke: p.edge, strokeWidth: 1.7, strokeLinejoin: 'round' }),
            rect(-4.6, -47, 9.2, 8, 2.4, { fill: p.dark, stroke: p.edge, strokeWidth: 1.4 }),
            path('M-16 -39.4 C-11 -44.6 -5 -47 -1 -47.4', { fill: 'none', stroke: p.light, strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.85 }),
        ], { transform: tf(31, 57, -2, 0.86) });
    const axe = () =>
        g([
            ...glowAt(10, -38, 14),
            ...handle(44),
            rect(-9.4, -43, 6.4, 10, 1.6, { fill: p.dark, stroke: p.edge, strokeWidth: 1.4 }),
            path('M2.6 -43.4 C11 -48.4 19 -46 21 -37.4 C22 -32 19.4 -27.4 15 -25.4 C13 -29.6 8.4 -32.6 2.6 -32.6 Z', { fill: `url(#${k}-head)`, stroke: p.edge, strokeWidth: 1.7, strokeLinejoin: 'round' }),
            path('M7 -42.4 C12 -44.6 17 -43.4 18.6 -39', { fill: 'none', stroke: p.light, strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.85 }),
        ], { transform: tf(35, 58.5, 22, 0.7) });
    const shovel = () =>
        g([
            ...glowAt(0, -42, 13),
            ...handle(42),
            rect(-5, -37, 10, 4.4, 1.6, { fill: p.dark, stroke: p.edge, strokeWidth: 1.3 }),
            path('M-8.4 -36 C-9.4 -45 -5 -52.4 0 -54.6 C5 -52.4 9.4 -45 8.4 -36 C7.4 -33.4 3.6 -32.4 0 -32.4 C-3.6 -32.4 -7.4 -33.4 -8.4 -36 Z', { fill: `url(#${k}-head)`, stroke: p.edge, strokeWidth: 1.7, strokeLinejoin: 'round' }),
            path('M-4 -37 C-4.6 -43 -2.6 -48 0 -50.6', { fill: 'none', stroke: p.light, strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.85 }),
            path('M0 -49 L0 -36', { fill: 'none', stroke: p.dark, strokeWidth: 0.9, strokeLinecap: 'round', opacity: 0.6 }),
        ], { transform: tf(27, 58.5, -31, 0.74) });
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [...d.before, groundShadow(20), shovel(), axe(), pick(), ...d.after],
    };
}

/* ------------------------------------------------------------------ */
/* Şablon 3 — Büyü asası                                                */
/* ------------------------------------------------------------------ */

function asaArt(it) {
    const { skin: s, rarity } = it;
    const k = idOf(it.id);
    const ring = s.ring || dark(s.crystal, 0.35);
    const d = decor(rarity, k, { a: light(s.crystal, 0.7), b: '#FFFFFF', halo: s.crystal, cx: 40, cy: 20, r: 24 });
    const cHi = light(s.crystal, 0.62);
    const cLo = dark(s.crystal, 0.38);
    const defs = [
        lin(`${k}-cry`, [stop(0, cHi), stop(0.5, s.crystal), stop(1, cLo)], 0, 0, 1, 1),
        lin(`${k}-cry2`, [stop(0, s.crystal), stop(1, cLo)], 1, 0, 0, 1),
        lin(`${k}-wood`, [stop(0, '#9A6A3E'), stop(1, '#5A3A20')], 0, 0, 1, 0),
        rad(`${k}-aura`, [stop(0, s.crystal, 0.65), stop(0.55, s.crystal, 0.2), stop(1, s.crystal, 0)]),
        ...d.defs,
    ];
    const staff = g(
        [
            rect(-2.6, -42, 5.2, 46, 2.5, { fill: `url(#${k}-wood)`, stroke: OL, strokeWidth: 1.7 }),
            rect(-3, -13, 6, 8, 1.6, { fill: ring, stroke: OL, strokeWidth: 1.1 }),
            path('M-3 -10.6 L3 -10.6 M-3 -8.2 L3 -8.2', { fill: 'none', stroke: OL, strokeWidth: 0.6, opacity: 0.6 }),
            circ(0, 3.6, 3, { fill: ring, stroke: OL, strokeWidth: 1.4 }),
            // taç: kristali tutan üç tırnak
            path('M-8.6 -40 C-11.6 -47 -9.6 -53.4 -6.4 -56.6', { fill: 'none', stroke: OL, strokeWidth: 4.2, strokeLinecap: 'round' }),
            path('M8.6 -40 C11.6 -47 9.6 -53.4 6.4 -56.6', { fill: 'none', stroke: OL, strokeWidth: 4.2, strokeLinecap: 'round' }),
            path('M-8.6 -40 C-11.6 -47 -9.6 -53.4 -6.4 -56.6', { fill: 'none', stroke: ring, strokeWidth: 2, strokeLinecap: 'round' }),
            path('M8.6 -40 C11.6 -47 9.6 -53.4 6.4 -56.6', { fill: 'none', stroke: ring, strokeWidth: 2, strokeLinecap: 'round' }),
            path('M-6.4 -41 L6.4 -41 L4.6 -37 L-4.6 -37 Z', { fill: ring, stroke: OL, strokeWidth: 1.5, strokeLinejoin: 'round' }),
            circ(0, -52, 17, { fill: `url(#${k}-aura)` }),
            // kristal
            path('M0 -68 L8.6 -56.4 L5.4 -42.6 L-5.4 -42.6 L-8.6 -56.4 Z', { fill: `url(#${k}-cry)`, stroke: OL, strokeWidth: 1.9, strokeLinejoin: 'round' }),
            path('M0 -68 L0 -42.6 M-8.6 -56.4 L8.6 -56.4', { fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.7, strokeLinejoin: 'round', opacity: 0.5 }),
            path('M0 -68 L8.6 -56.4 L0 -56.4 Z', { fill: `url(#${k}-cry2)`, opacity: 0.55 }),
            path('M-5 -63 L-6.2 -57.4', { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1.5, strokeLinecap: 'round', opacity: 0.85 }),
        ],
        { transform: tf(22.5, 62, 22, 0.9) }
    );
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [...d.before, groundShadow(16), staff, ...d.after],
    };
}

/* ------------------------------------------------------------------ */
/* Şablon 4 — Jetpack                                                   */
/* ------------------------------------------------------------------ */

function jetArt(it) {
    const { skin: s, rarity } = it;
    const k = idOf(it.id);
    const [c0, c1, c2] = s.flame;
    const tank = s.tank || mix(c1, '#8C96B8', 0.55);
    const d = decor(rarity, k, { a: c0, b: c1, halo: c1, cx: 32, cy: 46, r: 26 });
    const defs = [
        lin(`${k}-tank`, [stop(0, light(tank, 0.5)), stop(0.5, tank), stop(1, dark(tank, 0.35))], 0, 0, 1, 0),
        lin(`${k}-flame`, [stop(0, c0), stop(0.5, c1), stop(1, c2)], 0, 0, 0, 1),
        rad(`${k}-glow`, [stop(0, c1, 0.6), stop(1, c1, 0)]),
        ...d.defs,
    ];
    const flame = (cx, big) => {
        const h = big ? 17 : 14;
        return [
            path(`M${cx - 5} 46.6 C${cx - 6.4} 52 ${cx - 3} ${46 + h} ${cx} ${47 + h} C${cx + 3} ${46 + h} ${cx + 6.4} 52 ${cx + 5} 46.6 Z`, { fill: `url(#${k}-flame)`, opacity: 0.95 }),
            path(`M${cx - 3} 46.6 C${cx - 3.6} 50 ${cx - 1.6} ${45 + h * 0.8} ${cx} ${46 + h * 0.8} C${cx + 1.6} ${45 + h * 0.8} ${cx + 3.6} 50 ${cx + 3} 46.6 Z`, { fill: c0 }),
        ];
    };
    const smoke = [
        circ(10, 58, 4.2, { fill: s.smoke, opacity: 0.55 }),
        circ(15, 61, 3, { fill: s.smoke, opacity: 0.4 }),
        circ(54, 57.4, 4.6, { fill: s.smoke, opacity: 0.55 }),
        circ(49, 61, 3.2, { fill: s.smoke, opacity: 0.4 }),
    ];
    const sparks = s.spark
        ? [
              g([circ(12, 50, 1.1, { fill: c0 }), circ(52, 52, 1.3, { fill: c0 }), circ(21, 59, 0.9, { fill: c1 }), circ(43, 60, 1, { fill: c1 }), circ(32, 62, 1.2, { fill: c0 })], {}, it.rarity === 'common' || it.rarity === 'rare' ? undefined : 'twinkle'),
          ]
        : [];
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [
            ...d.before,
            ell(32, 52, 26, 11, { fill: `url(#${k}-glow)` }),
            ...smoke,
            ...flame(21.6, true),
            ...flame(42.4, true),
            // egzoz memeleri
            path('M16.4 42 L26.8 42 L25.2 47.4 L18 47.4 Z', { fill: '#4A4F6B', stroke: OL, strokeWidth: 1.6, strokeLinejoin: 'round' }),
            path('M37.2 42 L47.6 42 L46 47.4 L38.8 47.4 Z', { fill: '#4A4F6B', stroke: OL, strokeWidth: 1.6, strokeLinejoin: 'round' }),
            // tanklar
            rect(12.4, 7, 18.4, 36, 9, { fill: `url(#${k}-tank)`, stroke: OL, strokeWidth: SW }),
            rect(33.2, 7, 18.4, 36, 9, { fill: `url(#${k}-tank)`, stroke: OL, strokeWidth: SW }),
            rect(17, 9.6, 3.2, 20, 1.6, { fill: '#FFFFFF', opacity: 0.4 }),
            rect(37.8, 9.6, 3.2, 20, 1.6, { fill: '#FFFFFF', opacity: 0.4 }),
            path('M13 33.4 L30.2 33.4 M33.8 33.4 L51 33.4', { fill: 'none', stroke: dark(tank, 0.55), strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.7 }),
            // kontrol kutusu ve bağlantı
            rect(26, 18, 12, 14, 3, { fill: '#2D3358', stroke: OL, strokeWidth: 1.8 }),
            circ(32, 23.4, 2.3, { fill: c1, stroke: OL, strokeWidth: 0.9 }),
            circ(32, 23.4, 0.9, { fill: c0 }),
            path('M28.6 28.6 L35.4 28.6', { fill: 'none', stroke: '#8E97C8', strokeWidth: 1.2, strokeLinecap: 'round' }),
            // omuz askıları
            path('M17 7 C14 3 17 1.6 20 4', { fill: 'none', stroke: OL, strokeWidth: 2.6, strokeLinecap: 'round' }),
            path('M47 7 C50 3 47 1.6 44 4', { fill: 'none', stroke: OL, strokeWidth: 2.6, strokeLinecap: 'round' }),
            ...sparks,
            ...d.after,
        ],
    };
}

/* ------------------------------------------------------------------ */
/* Şablon 5 — Araba (boya kiti)                                         */
/* ------------------------------------------------------------------ */

function aracArt(it) {
    const { skin: s, rarity } = it;
    const k = idOf(it.id);
    const d = decor(rarity, k, { a: s.neon, b: '#FFFFFF', halo: s.neon, cx: 32, cy: 38, r: 30 });
    const [n0, n1] = s.nitro || [light(s.neon, 0.55), s.neon];
    const rim = s.rim || '#C7D0E6';
    const defs = [
        lin(`${k}-body`, [stop(0, light(s.body, 0.42)), stop(0.5, s.body), stop(1, dark(s.body, 0.32))]),
        lin(`${k}-glass`, [stop(0, '#DFF6FF'), stop(1, '#7FB4D8')], 0, 0, 1, 1),
        rad(`${k}-neon`, [stop(0, s.neon, 0.85), stop(0.6, s.neon, 0.3), stop(1, s.neon, 0)]),
        lin(`${k}-nitro`, [stop(0, n0), stop(1, n1)], 1, 0, 0, 0),
        rad(`${k}-wheel`, [stop(0, '#5B6486'), stop(1, '#232846')], 0.4, 0.35, 0.7),
        ...d.defs,
    ];
    // alt ışık: 0 düz, 1 nefes alan (iç içe iki elips), 2 dalga
    const under = [];
    if (s.under === 2) {
        under.push(ell(32, 54, 28, 5.4, { fill: `url(#${k}-neon)`, opacity: 0.6 }));
        under.push(path('M7 55 Q11.8 51.4 16.6 55 T26.2 55 T35.8 55 T45.4 55 T57 55', { fill: 'none', stroke: s.neon, strokeWidth: 1.7, strokeLinecap: 'round', opacity: 0.95 }));
    } else if (s.under === 1) {
        under.push(ell(32, 54, 29, 6, { fill: `url(#${k}-neon)`, opacity: 0.55 }));
        under.push(ell(32, 54.4, 20, 3.2, { fill: 'none', stroke: s.neon, strokeWidth: 1.5, opacity: 0.95 }));
        under.push(ell(32, 54.4, 13, 1.8, { fill: s.neon, opacity: 0.7 }));
    } else {
        under.push(ell(32, 54, 28, 5.6, { fill: `url(#${k}-neon)`, opacity: 0.85 }));
    }
    const wheel = (cx) => {
        const out = [circ(cx, 47, 7, { fill: `url(#${k}-wheel)`, stroke: OL, strokeWidth: SW })];
        if (s.wheels === 0) {
            out.push(circ(cx, 47, 3, { fill: rim, stroke: OL, strokeWidth: 1 }));
        } else if (s.wheels === 1) {
            out.push(circ(cx, 47, 4.4, { fill: rim, stroke: OL, strokeWidth: 0.9 }));
            out.push(path(`M${cx - 3.6} 47 L${cx + 3.6} 47 M${cx} 43.4 L${cx} 50.6 M${cx - 2.6} 44.4 L${cx + 2.6} 49.6 M${cx + 2.6} 44.4 L${cx - 2.6} 49.6`, { fill: 'none', stroke: OL, strokeWidth: 0.8, strokeLinecap: 'round' }));
        } else if (s.wheels === 2) {
            out.push(circ(cx, 47, 4.6, { fill: 'none', stroke: rim, strokeWidth: 1.4 }));
            out.push(circ(cx, 47, 2.2, { fill: rim, stroke: OL, strokeWidth: 0.8 }));
        } else {
            out.push(circ(cx, 47, 5, { fill: 'none', stroke: rim, strokeWidth: 1.8 }));
            out.push(circ(cx, 47, 5, { fill: 'none', stroke: '#FFFFFF', strokeWidth: 0.5, opacity: 0.8 }));
            out.push(circ(cx, 47, 2.3, { fill: rim, stroke: OL, strokeWidth: 0.8 }));
        }
        return out;
    };
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [
            ...d.before,
            groundShadow(27, 61.6),
            ...under,
            // nitro alevi (arka, sol)
            path('M10 38.6 C4 38.2 2 41.4 0.6 43 C3 43.6 4.4 45 6 46 C9.4 45.6 12 44 12 41.6 Z', { fill: `url(#${k}-nitro)`, opacity: 0.95 }),
            path('M10 40.2 C6.4 40.6 5 42 3.6 43 C6 43.2 8 43.8 10 44.2 Z', { fill: '#FFFFFF', opacity: 0.75 }),
            // gövde
            path('M6.4 41.6 C6.4 36.4 8.6 33.4 13 32.4 L19.4 22.2 C21 19.4 23.6 18.2 26.6 18.2 L39 18.2 C42.2 18.2 44.6 19.6 46.4 22.4 L50.4 31.4 C55.4 32 58.6 34.2 58.8 38.4 L58.8 43 C58.8 45.4 57 47 54.6 47 L52 47 L52 46 C52 41 48.6 40 45.6 40 C42.4 40 39.2 41 39.2 46 L39.2 47 L25.6 47 L25.6 46 C25.6 41 22.4 40 19.4 40 C16.2 40 13 41 13 46 L13 47 L9.8 47 C7.8 47 6.4 45.4 6.4 43.6 Z', { fill: `url(#${k}-body)`, stroke: OL, strokeWidth: SW, strokeLinejoin: 'round' }),
            // cam
            path('M21.4 31 L25.6 22.6 C26.2 21.4 27.2 20.8 28.4 20.8 L33 20.8 L33 31 Z', { fill: `url(#${k}-glass)`, stroke: OL, strokeWidth: 1.5, strokeLinejoin: 'round' }),
            path('M35.6 20.8 L39 20.8 C40.8 20.8 41.8 21.6 42.6 23 L46.4 31 L35.6 31 Z', { fill: `url(#${k}-glass)`, stroke: OL, strokeWidth: 1.5, strokeLinejoin: 'round' }),
            // şerit ve kapı çizgisi
            path('M8 37.6 L57 37.6', { fill: 'none', stroke: s.accent, strokeWidth: 2.4, strokeLinecap: 'round' }),
            path('M34.3 31.4 L34.3 41', { fill: 'none', stroke: OL, strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.55 }),
            rect(36.4, 34, 4.6, 1.4, 0.7, { fill: dark(s.body, 0.55), opacity: 0.8 }),
            // farlar
            path('M55.4 34.6 C57.4 34.8 58.6 36 58.6 37.4 L55.4 37.4 Z', { fill: '#FFF4B8', stroke: OL, strokeWidth: 0.9, strokeLinejoin: 'round' }),
            rect(6.6, 35.6, 3.2, 2.6, 1, { fill: '#FF6A6A' }),
            ell(22, 24, 5.2, 1.4, { fill: '#FFFFFF', opacity: 0.45 }),
            ...wheel(19.4),
            ...wheel(45.6),
            ...d.after,
        ],
    };
}

/* ------------------------------------------------------------------ */
/* Şablon 6 — Geçiş halkaları                                           */
/* ------------------------------------------------------------------ */

function gecisArt(it) {
    const { skin: s, rarity } = it;
    const k = idOf(it.id);
    const [c0, c1] = s.ring;
    const d = decor(rarity, k, { a: s.spark || light(c0, 0.6), b: light(c1, 0.5), halo: c0, cx: 32, cy: 30, r: 30 });
    const defs = [
        lin(`${k}-pillar`, [stop(0, c0, 0), stop(0.5, c0, 0.5), stop(1, c1, 0.8)]),
        lin(`${k}-r1`, [stop(0, light(c0, 0.5)), stop(1, c0)], 0, 0, 1, 1),
        lin(`${k}-r2`, [stop(0, mix(c0, c1, 0.5)), stop(1, c1)], 0, 0, 1, 1),
        rad(`${k}-core`, [stop(0, '#FFFFFF', 0.95), stop(0.4, c0, 0.55), stop(1, c1, 0)]),
        ...d.defs,
    ];
    const ring = (cy, rx, ry, w, op, stroke) => [
        ell(cy[0], cy[1], rx, ry, { fill: 'none', stroke: c1, strokeWidth: w + 2.6, opacity: 0.18 * op }),
        ell(cy[0], cy[1], rx, ry, { fill: 'none', stroke: `url(#${k}-${stroke})`, strokeWidth: w, opacity: op }),
    ];
    const stars = s.spark
        ? [
              g([spark(14, 22, 2.4, s.spark), spark(50, 30, 2.8, s.spark), spark(22, 44, 2, s.spark), spark(44, 12, 1.9, s.spark), spark(32, 54, 1.7, s.spark)], {}, rarity === 'common' || rarity === 'rare' ? undefined : 'twinkle'),
              path('M13 12 L16 17 M54 20 L51.4 24.6 M10 36 L12.6 40', { fill: 'none', stroke: s.spark, strokeWidth: 1.1, strokeLinecap: 'round', opacity: 0.7 }),
          ]
        : [];
    return {
        viewBox: VIEWBOX,
        defs,
        elements: [
            ...d.before,
            groundShadow(18, 61.6),
            path('M26 10 L38 10 L45 53 L19 53 Z', { fill: `url(#${k}-pillar)`, opacity: 0.55 }),
            ...ring([32, 52], 16, 5.4, 3.2, 1, 'r2'),
            ...ring([32, 41], 13, 4.5, 2.8, 0.95, 'r2'),
            ...ring([32, 31], 10.4, 3.7, 2.4, 0.95, 'r1'),
            ...ring([32, 22], 8, 2.9, 2, 0.9, 'r1'),
            ...ring([32, 14.4], 5.6, 2, 1.6, 0.85, 'r1'),
            ell(32, 31, 7, 7, { fill: `url(#${k}-core)` }),
            path('M32 54 L32 8', { fill: 'none', stroke: '#FFFFFF', strokeWidth: 1, strokeLinecap: 'round', opacity: 0.4 }),
            path('M14 52 L14 47 M50 52 L50 47 M8 43 L8 39 M56 43 L56 39', { fill: 'none', stroke: c0, strokeWidth: 1.3, strokeLinecap: 'round', opacity: 0.8 }),
            ...stars,
            ...d.after,
        ],
    };
}

/* ------------------------------------------------------------------ */
/* Katalog                                                              */
/* ------------------------------------------------------------------ */

const ART = { portal: portalArt, alet: aletArt, asa: asaArt, jet: jetArt, arac: aracArt, gecis: gecisArt };

const item = (id, name, rarity, description, skin) => {
    const kind = id.slice(0, id.indexOf(':'));
    const base = { id, category: 'kesif', kind, name, rarity, description, skin };
    return { ...base, art: ART[kind](base) };
};

const tool = (head, lightC, darkC, edge, handle, handleDark, wrap, glow, rough, metal) => ({
    palette: { head, light: lightC, dark: darkC, edge, handle, handleDark, wrap, glow, rough, metal },
});

export const KESIF = [
    /* ---- Portal Tabancası görünümleri ---- */
    item('portal:nane-ferahi', 'Nane Ferahı', 'common', 'Portal Tabancası’na nane yeşili gövde ve serin portallar.', {
        body: '#CDEFE0', trim: '#2E9C7C', a: { c: '#8CF5D5', c2: '#2DBFA0' }, b: { c: '#6B52E6', c2: '#3D2AA8' },
    }),
    item('portal:gul-kurusu', 'Gül Kurusu', 'common', 'Portal Tabancası’na toz pembe gövde ve sıcak portallar.', {
        body: '#F4D9E0', trim: '#C2607C', a: { c: '#FFE08A', c2: '#F0B73A' }, b: { c: '#D2386F', c2: '#8F1F4A' },
    }),
    item('portal:okyanus-akintisi', 'Okyanus Akıntısı', 'rare', 'Lacivert gövde, turkuaz ve mercan portallar.', {
        body: '#27467F', trim: '#5FD0E0', a: { c: '#4FE3D6', c2: '#1AA9B8' }, b: { c: '#E5503C', c2: '#A82A1C' },
    }),
    item('portal:neon-sokak', 'Neon Sokak', 'rare', 'Koyu gövde; pembe ve camgöbeği neon portallar.', {
        body: '#2A2650', trim: '#FF4FB4', a: { c: '#FF5FC0', c2: '#B8208A' }, b: { c: '#7DF4FF', c2: '#2AB7D6' },
    }),
    item('portal:altin-kapi', 'Altın Kapı', 'epic', 'Altın kaplama gövde; altın ve mor portallar.', {
        body: '#E8C45A', trim: '#8A5A12', a: { c: '#FFE27A', c2: '#E2A93C' }, b: { c: '#8B4FE0', c2: '#4A1FA0' },
    }),
    item('portal:kuantum-isigi', 'Kuantum Işığı', 'legendary', 'Sedef gövde; kuantum mavisi ve macenta portallar, ince ışıltı.', {
        body: '#EEEAF8', trim: '#8F9DE8', a: { c: '#9FD2FF', c2: '#4F8BFF' }, b: { c: '#C42BB8', c2: '#7A1A82' },
    }),

    /* ---- Alet görünümleri (kazma, balta, kürek) ---- */
    item('alet:cay-bahcesi', 'Çay Bahçesi', 'common', 'Kazma, balta ve küreğe zeytin yeşili sap ve demir uç.',
        tool('#D9DCE1', '#F7F9FC', '#9A9EA7', '#6A6E78', '#6E7F3A', '#4A5826', '#3A3A42', null, 0.34, 0.2)),
    item('alet:gunes-isigi', 'Gün Işığı', 'common', 'Alet uçlarına sıcak kehribar parlaklık.',
        tool('#F6C75A', '#FFE9A8', '#C98A1E', '#8A5A10', '#7A4A2A', '#52301A', '#B07018', '#FFA726', 0.28, 0.22)),
    item('alet:buz-mavisi', 'Buz Mavisi', 'rare', 'Buzul mavisi uçlar, beyaz sargılı saplar.',
        tool('#BFE6FF', '#EAF8FF', '#6FAEDC', '#3F78A8', '#3C5A78', '#243A52', '#F4FAFF', '#6FD0FF', 0.22, 0.25)),
    item('alet:lale-kirmizisi', 'Lale Kırmızısı', 'rare', 'Lale kırmızısı uç, altın sargı; Osmanlı lalesinden ilhamla.',
        tool('#E8384C', '#FF8A94', '#9E1F32', '#5E0F1E', '#2E1A12', '#1A0F0A', '#E8B93A', null, 0.3, 0.15)),
    item('alet:neon-serit', 'Neon Şerit', 'epic', 'Koyu gövde, kenarları neon şeritle parlayan aletler.',
        tool('#2B3358', '#5A6694', '#171C34', '#5CF0FF', '#8F9CC8', '#5B6694', '#00E5FF', '#38E0FF', 0.2, 0.4)),
    item('alet:yildiz-demiri', 'Yıldız Demiri', 'legendary', 'Gece mavisi metal; kenarlarında yıldız ışığı.',
        tool('#27408F', '#7F9BEA', '#142458', '#FFE9A8', '#D8DEF2', '#A5AFD6', '#FFD76A', '#B9C8FF', 0.18, 0.5)),

    /* ---- Büyü asası görünümleri ---- */
    item('asa:mercan', 'Mercan Kristal', 'common', 'Büyü asasının kristali mercan rengine bürünür.', { crystal: '#FF8A7A' }),
    item('asa:gece-moru', 'Gece Moru', 'rare', 'Mor-lacivert kristal, yavaş nabız gibi parlar.', { crystal: '#6C4DE0', ring: '#2B2A7A' }),
    item('asa:zumrut-orman', 'Zümrüt Orman', 'rare', 'Zümrüt yeşili kristal ve yosun yeşili halka.', { crystal: '#2FD27A', ring: '#6B8F3A' }),
    item('asa:gokkusagi-isigi', 'Gökkuşağı Işığı', 'epic', 'Kristal yavaşça renk değiştirir (hareket kısıtlıysa sabit).', { crystal: '#FF7AC8', ring: '#FFD76A', cycle: true }),

    /* ---- Jetpack izi görünümleri ---- */
    item('jet:gok-mavisi', 'Gök Mavisi İz', 'common', 'Jetpack egzozu gök mavisi ve beyaz.', {
        flame: ['#E6F8FF', '#7FD0FF', '#3A8DFF'], smoke: '#DDEFFF', tank: '#9CC6F2',
    }),
    item('jet:pembe-bulut', 'Pembe Bulut', 'rare', 'Pembe-şeftali egzoz, yumuşak pembe duman.', {
        flame: ['#FFF0E8', '#FFB39A', '#FF6FA8'], smoke: '#FFD3E4', tank: '#F4A3C0',
    }),
    item('jet:altin-kivilcim', 'Altın Kıvılcım', 'epic', 'Altın kıvılcımlı sıcak iz.', {
        flame: ['#FFF6C8', '#FFD34D', '#FF9A1F'], smoke: '#FFE9B0', tank: '#E8B83A', spark: true,
    }),
    item('jet:yildiz-izi', 'Yıldız İzi', 'legendary', 'Arkanda minik yıldız parıltıları bırakan iz.', {
        flame: ['#FFFFFF', '#BFD6FF', '#7A5CFF'], smoke: '#C9D4FF', tank: '#4B3FB8', spark: true,
    }),

    /* ---- Araç boya kitleri ---- */
    item('arac:limonata', 'Limonata Kiti', 'common', 'Limon sarısı gövde, beyaz şerit, limon neon.', {
        body: '#FFE04A', accent: '#FFFFFF', neon: '#E8FF4A', under: 0, wheels: 0,
    }),
    item('arac:gece-yolcusu', 'Gece Yolcusu', 'rare', 'Gece mavisi gövde, camgöbeği neon ve nefes alan alt ışık.', {
        body: '#27408F', accent: '#5CF0FF', neon: '#00E5FF', under: 1, wheels: 1,
    }),
    item('arac:gunes-batimi-turu', 'Gün Batımı Turu', 'rare', 'Mercan-turuncu gövde, kehribar neon, altın şerit.', {
        body: '#FF7A59', accent: '#FFD76A', neon: '#FFB347', under: 0, wheels: 0,
    }),
    item('arac:metro-esintisi', 'Metro Esintisi', 'epic', 'Gümüş-mavi gövde, mor neon, dalga alt ışığı.', {
        body: '#A9B8D8', accent: '#6A4DE0', neon: '#B27CFF', under: 2, wheels: 2,
    }),
    item('arac:holo-kristal', 'Holo Kristal', 'epic', 'Sedef gövde; neon rengi nitroda buz mavisinden pembeye geçer.', {
        body: '#F0EEFA', accent: '#9FD2FF', neon: '#9FEFFF', under: 1, wheels: 2, nitro: ['#BFEFFF', '#FF9AD5'], cycle: true,
    }),
    item('arac:meridyen-yildizi', 'Meridyen Yıldızı', 'legendary', 'Lacivert gövde, altın şerit, parlayan jantlar ve yıldız nitrosu.', {
        body: '#1E2E7A', accent: '#FFD76A', neon: '#FFE9A8', under: 2, wheels: 3, rim: '#FFD76A', nitro: ['#FFF1B0', '#7A5CFF'],
    }),

    /* ---- Geçiş efektleri ---- */
    item('gecis:neon-dalga', 'Neon Dalga', 'rare', 'Boyut geçişinde camgöbeği-pembe neon halkalar.', { ring: ['#00E5FF', '#FF4FB4'] }),
    item('gecis:yildiz-yagmuru', 'Yıldız Yağmuru', 'epic', 'Varışta altın renkli yıldız parıltıları yağar.', { ring: ['#FFE27A', '#FFB347'], spark: '#FFFFFF' }),
    item('gecis:aurora-gecidi', 'Aurora Geçidi', 'epic', 'Varışta yeşil-mor aurora halkaları.', { ring: ['#4DFFB0', '#A66BFF'], spark: '#C9FFEA' }),
];

/**
 * Önizleme çipleri için en çok 3 temsilî renk ("Oyunda şöyle görünür"). Yalnız skin verisinden.
 */
export function kesifSwatches(design) {
    const s = design?.skin;
    if (!s) return [];
    let list = [];
    switch (design.kind) {
        case 'portal': list = [s.a?.c, s.b?.c, s.body]; break;
        case 'alet': list = [s.palette?.head, s.palette?.handle, s.palette?.glow || s.palette?.wrap]; break;
        case 'asa': list = [s.crystal, s.ring]; break;
        case 'jet': list = [s.flame?.[1], s.flame?.[2], s.smoke]; break;
        case 'arac': list = [s.body, s.accent, s.neon]; break;
        case 'gecis': list = [s.ring?.[0], s.ring?.[1], s.spark]; break;
        default: break;
    }
    return list.filter((c) => typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 3);
}

export default KESIF;
