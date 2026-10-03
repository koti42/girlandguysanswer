import React from 'react';

/*
 * Portrede görünmeyen parçaların (alt giysi, ayakkabı, koşu izi) ızgara
 * simgeleri. Basit, tek renkli glifler; renk seçili kumaş rengidir (iz
 * simgeleri kendi renkleriyle). 48x48 tuval.
 */

const stroke = (c) => ({ stroke: c, strokeWidth: 1.6, strokeLinejoin: 'round' });

function darken(hex) {
    // currentColor gibi hex olmayan değerde gölge de aynı renk (tek renk siluet).
    if (!/^#[0-9a-f]{6}$/i.test(String(hex))) return hex;
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.62).toString(16).padStart(2, '0');
    return `#${f((n >> 16) & 255)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const GLYPHS = {
    'bottom:jean': (c, d) => (
        <>
            <path d="M14 8h20l3 34h-9l-4-22-4 22h-9z" fill={c} {...stroke(d)} />
            <path d="M14 13h20M24 8v8" fill="none" {...stroke(d)} />
            <path d="M17 13c0 4 3 5 5 5M31 13c0 4-3 5-5 5" fill="none" stroke={d} strokeWidth="1.2" />
        </>
    ),
    'bottom:esofman': (c, d) => (
        <>
            <path d="M14 8h20l3 31-2 3h-7l-4-22-4 22h-7l-2-3z" fill={c} {...stroke(d)} />
            <path d="M15.5 13l-2.3 26M32.5 13l2.3 26" fill="none" stroke="#FFFFFF" strokeWidth="2" />
            <rect x="14" y="8" width="20" height="4" rx="2" fill={d} />
        </>
    ),
    'bottom:sort': (c, d) => (
        <>
            <path d="M12 12h24l3 20h-12l-3-10-3 10H9z" fill={c} {...stroke(d)} />
            <path d="M12 16h24M24 12v8" fill="none" {...stroke(d)} />
        </>
    ),
    'bottom:etek': (c, d) => (
        <>
            <path d="M16 12h16l8 24H8z" fill={c} {...stroke(d)} />
            <rect x="15" y="9" width="18" height="5" rx="2" fill={d} />
            <path d="M20 14l-4 22M28 14l4 22M24 14v22" fill="none" stroke={d} strokeWidth="1.1" opacity="0.6" />
        </>
    ),
    'shoes:spor': (c, d) => (
        <>
            <path d="M6 30c0-6 2-12 6-14l6 4c4 2 9 3 14 4 6 1 10 3 10 7v3H6z" fill={c} {...stroke(d)} />
            <rect x="5" y="32" width="38" height="6" rx="3" fill="#F8FAFC" {...stroke(d)} />
            <path d="M17 21l3 4M21 22l2 4" fill="none" stroke="#FFFFFF" strokeWidth="1.6" />
        </>
    ),
    'shoes:bot': (c, d) => (
        <>
            <path d="M12 6h14v20c6 1 14 3 15 9v3H10V10z" fill={c} {...stroke(d)} />
            <rect x="9" y="35" width="33" height="6" rx="2" fill={d} />
            <path d="M14 12h10M14 17h10M14 22h10" fill="none" stroke={d} strokeWidth="1.2" />
        </>
    ),
    'shoes:neon': (c, d) => (
        <>
            <rect x="4" y="36" width="40" height="5" rx="2.5" fill="#39FF88" opacity="0.45" />
            <path d="M6 30c0-6 2-12 6-14l6 4c4 2 9 3 14 4 6 1 10 3 10 7v3H6z" fill={c} {...stroke(d)} />
            <rect x="5" y="32" width="38" height="6" rx="3" fill="#39FF88" stroke="#0E9F55" strokeWidth="1.4" />
            <path d="M26 22l-4 6h4l-3 5" fill="none" stroke="#39FF88" strokeWidth="1.8" />
        </>
    ),
    'trail:none': () => (
        <>
            <circle cx="24" cy="24" r="13" fill="none" stroke="#94A3B8" strokeWidth="3" />
            <path d="M15 33l18-18" stroke="#94A3B8" strokeWidth="3" />
        </>
    ),
    'trail:kalp': () => (
        <>
            <path d="M28 40s-12-7-12-15a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 8-12 15-12 15z" fill="#FF4D8D" stroke="#BE185D" strokeWidth="1.4" />
            <path d="M12 20s-6-3.5-6-7.5a3 3 0 0 1 6-.5 3 3 0 0 1 6 .5c0 4-6 7.5-6 7.5z" fill="#FF8FB7" opacity="0.8" />
        </>
    ),
    'trail:yildiz': () => (
        <>
            <path d="M30 10l3.6 7.4 8.1 1.2-5.9 5.7 1.4 8.1L30 28.6l-7.2 3.8 1.4-8.1-5.9-5.7 8.1-1.2z" fill="#FACC15" stroke="#B45309" strokeWidth="1.3" />
            <circle cx="12" cy="30" r="2.4" fill="#FDE68A" />
            <circle cx="18" cy="39" r="1.6" fill="#FDE68A" />
            <circle cx="8" cy="38" r="1.2" fill="#FDE68A" />
        </>
    ),
    'trail:neon': () => (
        <>
            <path d="M4 32c8 0 8-12 16-12s8 12 16 12 8-8 8-8" fill="none" stroke="#22D3EE" strokeWidth="5" opacity="0.35" />
            <path d="M4 32c8 0 8-12 16-12s8 12 16 12 8-8 8-8" fill="none" stroke="#67E8F9" strokeWidth="2.4" />
            <path d="M4 38c8 0 8-8 16-8s8 8 16 8" fill="none" stroke="#F0ABFC" strokeWidth="2" />
        </>
    ),
    'trail:gokkusagi': () => (
        <>
            {['#EF4444', '#F97316', '#FACC15', '#22C55E', '#3B82F6', '#8B5CF6'].map((col, i) => (
                <path key={col} d={`M${6 + i * 2.6} 38a${18 - i * 2.6} ${18 - i * 2.6} 0 0 1 ${36 - i * 5.2} 0`} fill="none" stroke={col} strokeWidth="2.8" />
            ))}
        </>
    ),
};

/** `itemKey` ("slot:style") simgesi; bilinmeyen anahtarda hiçbir şey çizmez. */
const ItemIcon = ({ itemKey, color = '#64748B', className = '' }) => {
    const glyph = GLYPHS[itemKey];
    if (!glyph) return null;
    return (
        <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
            {glyph(color, darken(color))}
        </svg>
    );
};

export default ItemIcon;
