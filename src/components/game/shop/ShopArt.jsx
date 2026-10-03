import React, { memo, useId } from 'react';
import { getDesign, ICONS } from '../../../game/shop';
import './shop.css';

/*
 * Mağaza tasarım çizici (SPEC_V2 §F.2): designs/*.js'teki saf veri ağacını
 * DOM SVG'ye çevirir. Mobilde aynı veriyi react-native-svg ile çizen
 * ShopArt.js var; ikisi birebir aynı görünmeli.
 *
 *  - Yalnızca F.2'deki etiket/prop kümesi çizilir (beyaz liste). Bilinmeyen
 *    etiket ya da prop sessizce atlanır; bilinmeyen anahtar hiçbir şey
 *    çizmez (çökme yok). Veri koddan gelir, yine de `href`, `style`, olay
 *    özniteliği vb. hiçbir yoldan DOM'a ulaşamaz.
 *  - defs id'leri her örnekte benzersiz önekle yeniden yazılır, `url(#id)`
 *    başvuruları da aynı önekle: aynı sayfada aynı tasarımın iki kopyası
 *    (ızgara + çekmece + profil önizlemesi) birbirinin gradyanını ezmez.
 *    `url(#…)` dışındaki `url(…)` değerleri atılır.
 *  - `anim` (spin/pulse/shimmer/float/twinkle) CSS keyframes sınıfına
 *    dönüşür (shop.css). Animasyonlu öğede transform yoktur; CSS dönüşümü
 *    sarmalayıcı `g`'ye uygulanır. `prefers-reduced-motion` ve
 *    `animate={false}` animasyonu kapatır; tasarım statik hâliyle eksiksizdir.
 */

const TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'g', 'polygon']);
const GRADIENTS = new Set(['linearGradient', 'radialGradient']);
const PROPS = new Set([
    'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points',
    'fill', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'opacity', 'transform',
]);
const GRADIENT_PROPS = new Set(['x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'fx', 'fy']);
const ANIMS = new Set(['spin', 'pulse', 'shimmer', 'float', 'twinkle']);
// twinkle grupları sırayla gecikmeli yanıp sönsün (aynı tasarımda birden çok grup)
const TWINKLE_DELAYS = [0, 0.55, 1.1, 0.3, 0.85];

const URL_RE = /url\(\s*#([A-Za-z0-9_-]+)\s*\)/g;

/** Tek bir öznitelik değerini güvenli hâle getirir; uygun değilse undefined. */
function safeValue(value, prefix) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string') return undefined;
    if (value.length > 20000) return undefined;
    const rewritten = value.replace(URL_RE, (_, id) => `url(#${prefix}${id})`);
    // Yeniden yazılmamış (yerel olmayan) url(...) ya da betik kalıntısı → at
    if (/url\(\s*(?!#)/i.test(rewritten) || /javascript:|expression\(/i.test(rewritten)) return undefined;
    return rewritten;
}

function pickProps(props, allowed, prefix) {
    const out = {};
    if (!props || typeof props !== 'object') return out;
    for (const [k, v] of Object.entries(props)) {
        if (!allowed.has(k)) continue;
        const safe = safeValue(v, prefix);
        if (safe !== undefined) out[k] = safe;
    }
    return out;
}

function renderNodes(nodes, ctx, depth = 0) {
    if (!Array.isArray(nodes) || depth > 12) return null;
    return nodes.map((node, i) => {
        if (!node || !TAGS.has(node.tag)) return null;
        const Tag = node.tag;
        const props = pickProps(node.props, PROPS, ctx.prefix);
        const anim = ANIMS.has(node.anim) ? node.anim : null;
        if (anim) {
            // F.2: animasyonlu öğede transform yok — olsa bile CSS dönüşümü ezer
            delete props.transform;
            props.className = `shop-anim shop-anim-${anim}`;
            if (anim === 'twinkle') {
                props.style = { animationDelay: `${TWINKLE_DELAYS[ctx.twinkle % TWINKLE_DELAYS.length]}s` };
                ctx.twinkle += 1;
            }
        }
        return (
            <Tag key={i} {...props}>
                {node.children ? renderNodes(node.children, ctx, depth + 1) : null}
            </Tag>
        );
    });
}

function renderDefs(defs, prefix) {
    if (!Array.isArray(defs) || defs.length === 0) return null;
    const out = [];
    defs.forEach((d, i) => {
        if (!d || !GRADIENTS.has(d.tag) || typeof d.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(d.id)) return;
        const Tag = d.tag;
        const stops = Array.isArray(d.stops) ? d.stops : [];
        out.push(
            <Tag key={i} id={`${prefix}${d.id}`} {...pickProps(d.props, GRADIENT_PROPS, prefix)}>
                {stops.map((s, j) => {
                    const color = safeValue(s?.color, prefix);
                    const offset = Number(s?.offset);
                    if (color === undefined || !Number.isFinite(offset)) return null;
                    return (
                        <stop
                            key={j}
                            offset={offset}
                            stopColor={color}
                            {...(Number.isFinite(s?.opacity) ? { stopOpacity: s.opacity } : {})}
                        />
                    );
                })}
            </Tag>
        );
    });
    return out.length ? <defs>{out}</defs> : null;
}

/** Anahtar / ikon / doğrudan tasarımdan çizilecek `art` nesnesini bulur. */
function resolveArt({ itemKey, icon, design }) {
    if (design?.art) return design.art;
    if (icon) return ICONS[icon] ?? null;
    if (itemKey) {
        const d = getDesign(itemKey);
        if (d?.art) return d.art;
        if (d?.icon) return ICONS[d.icon] ?? null;
    }
    return null;
}

/** React useId'yi id/url(#) içinde güvenle kullanılabilir öneke çevirir. */
function idPrefix(rawId) {
    return `sa${String(rawId).replace(/[^A-Za-z0-9_-]/g, '')}-`;
}

/**
 * @param itemKey  `frame:…` / `mini:…` / `ticket:message` (tasarım anahtarı)
 * @param icon     ICONS anahtarı (jeton, cüzdan, kilit…)
 * @param design   doğrudan tasarım nesnesi (önizleme/test)
 * @param size     px ya da CSS uzunluğu; verilmezse className ile boyutlanır
 * @param label    erişilebilir ad; verilmezse süs sayılır (aria-hidden)
 * @param animate  false → animasyon kapalı (ör. küçük satır görselleri)
 */
const ShopArt = ({ itemKey, icon, design, size, label, className = '', animate = true, style }) => {
    const rawId = useId();
    const art = resolveArt({ itemKey, icon, design });
    if (!art || !Array.isArray(art.elements)) return null;

    const prefix = idPrefix(rawId);
    const viewBox = typeof art.viewBox === 'string' && /^[\d.\s-]+$/.test(art.viewBox) ? art.viewBox : '0 0 200 200';
    const ctx = { prefix, twinkle: 0 };
    const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' };

    return (
        <svg
            viewBox={viewBox}
            width={size}
            height={size}
            className={`shop-art${animate ? '' : ' shop-art-static'} ${className}`.trim()}
            style={style}
            xmlns="http://www.w3.org/2000/svg"
            data-testid="shop-art"
            {...a11y}
        >
            {renderDefs(art.defs, prefix)}
            {renderNodes(art.elements, ctx)}
        </svg>
    );
};

export default memo(ShopArt);
