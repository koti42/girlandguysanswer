import React from 'react';

/*
 * Keşif'in kahraman görseli: yalnızca SVG + CSS (JS, canvas, three yok).
 * Şafakta voxel bir manzara: uzak dağlar, orman, çimenli yamaç, yüzen ada
 * üstünde parlayan kristal, tepede gözcü bir kaşif. Hareket (bulut kayması,
 * kristal nabzı) prefers-reduced-motion'da durur. Tamamen süs: aria-hidden.
 *
 * Katmanlar modül yüklenirken bir kez hesaplanır (render başına iş yok);
 * rastgelelik yok, sinüs tabanlı belirlenimci yükseklikler.
 */

const W = 960;
const H = 260;
const COL = 16;
const COLS = W / COL;
const snap = (v) => Math.round(v / 8) * 8;

function heights({ base, a1, f1, ph, a2, f2 }) {
    return Array.from({ length: COLS }, (_, i) => snap(base - a1 * (Math.sin(i * f1 + ph) + 1) * 0.5 - a2 * (Math.sin(i * f2 + ph * 2.3) + 1) * 0.5));
}

const FAR = heights({ base: 168, a1: 74, f1: 0.34, ph: 1.1, a2: 30, f2: 0.93 });
const MID = heights({ base: 196, a1: 42, f1: 0.27, ph: 3.4, a2: 16, f2: 1.17 });
const NEAR = heights({ base: 238, a1: 36, f1: 0.21, ph: 5.2, a2: 14, f2: 0.74 });

// Orman katmanındaki ağaçlar: [sütun, yükseklik çarpanı]
const TREES = [2, 5, 9, 12, 17, 21, 26, 30, 35, 39, 43, 47, 52, 56].map((c, i) => ({ c, tall: i % 3 === 0 }));

const Columns = ({ tops, fill, top, topH = 5, shade }) =>
    tops.map((y, i) => (
        <g key={i}>
            <rect x={i * COL} y={y} width={COL + 0.6} height={H - y} fill={fill} />
            <rect x={i * COL} y={y} width={COL + 0.6} height={topH} fill={top} />
            {shade && <rect x={i * COL + COL - 3} y={y + topH} width={3} height={H - y - topH} fill={shade} opacity="0.35" />}
        </g>
    ));

const Tree = ({ x, y, tall }) => {
    const trunk = tall ? 22 : 14;
    return (
        <g>
            <rect x={x + 6} y={y - trunk} width={5} height={trunk} fill="#5b3b24" />
            <rect x={x} y={y - trunk - 14} width={17} height={14} fill="#2f9a5a" />
            <rect x={x + 3} y={y - trunk - 26} width={11} height={12} fill="#3fb36a" />
            <rect x={x} y={y - trunk - 14} width={17} height={3} fill="#58cf84" />
        </g>
    );
};

const Cloud = ({ x, y, s = 1, cls }) => (
    <g className={cls} transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity="0.8">
        <rect x="0" y="8" width="52" height="10" />
        <rect x="8" y="0" width="28" height="10" />
        <rect x="30" y="4" width="26" height="8" />
    </g>
);

const KesifHeroArt = ({ className = '' }) => (
    <div className={`kesif-art ${className}`} aria-hidden="true">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMax slice" focusable="false">
            <defs>
                <radialGradient id="kesif-sun" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fff3cf" stopOpacity="1" />
                    <stop offset="35%" stopColor="#ffd08a" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#ff9a5a" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="kesif-crystal-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#7df9ff" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#7df9ff" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="kesif-haze" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb27a" stopOpacity="0" />
                    <stop offset="100%" stopColor="#ffb27a" stopOpacity="0.35" />
                </linearGradient>
                <pattern id="kesif-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                    <path d="M16 0H0V16" fill="none" stroke="#000" strokeOpacity="0.16" strokeWidth="1" />
                </pattern>
            </defs>

            {/* Güneş ve ışıltısı */}
            <circle cx="746" cy="92" r="92" fill="url(#kesif-sun)" />
            <rect x="726" y="72" width="40" height="40" fill="#fff0c4" />
            <rect x="726" y="72" width="40" height="8" fill="#ffffff" opacity="0.6" />

            <Cloud x={250} y={34} s={1.1} cls="kesif-cloud kesif-cloud-a" />
            <Cloud x={520} y={16} s={0.8} cls="kesif-cloud kesif-cloud-b" />
            <Cloud x={820} y={58} s={0.95} cls="kesif-cloud kesif-cloud-c" />
            <Cloud x={20} y={60} s={0.7} cls="kesif-cloud kesif-cloud-b" />

            {/* Uzak dağlar */}
            <Columns tops={FAR} fill="#41508f" top="#7a8bd0" topH={6} shade="#1b2350" />
            <rect x="0" y="120" width={W} height={H - 120} fill="url(#kesif-haze)" />

            {/* Yüzen ada + kuantum kristali */}
            <g transform="translate(664 46)">
                <rect x="8" y="46" width="80" height="12" fill="#6b4a2f" />
                <rect x="16" y="58" width="64" height="10" fill="#5a3d27" />
                <rect x="28" y="68" width="40" height="10" fill="#4a321f" />
                <rect x="40" y="78" width="16" height="8" fill="#3b2819" />
                <rect x="4" y="38" width="88" height="10" fill="#7cc653" />
                <rect x="4" y="38" width="88" height="3" fill="#a6e27b" />
                <rect x="14" y="26" width="6" height="12" fill="#5b3b24" />
                <rect x="8" y="12" width="18" height="16" fill="#2f9a5a" />
                <rect x="11" y="4" width="12" height="10" fill="#3fb36a" />
                <circle className="kesif-crystal-glow" cx="58" cy="22" r="26" fill="url(#kesif-crystal-glow)" />
                <polygon className="kesif-crystal" points="58,2 68,20 58,40 48,20" fill="#6df0ff" />
                <polygon points="58,2 68,20 58,20" fill="#c9fbff" opacity="0.85" />
                <polygon points="58,40 48,20 58,20" fill="#2fb7d6" opacity="0.9" />
            </g>

            {/* Orman */}
            <Columns tops={MID} fill="#1c5d56" top="#2f8f7a" topH={5} shade="#0c2f2d" />
            {TREES.map((t) => (
                <Tree key={t.c} x={t.c * COL} y={MID[t.c]} tall={t.tall} />
            ))}

            {/* Çimenli yamaç */}
            <Columns tops={NEAR} fill="#6b4a2f" top="#79c14f" topH={8} shade="#2c1c10" />
            <rect x="0" y="0" width={W} height={H} fill="url(#kesif-grid)" />

            {/* Gözcü kaşif */}
            <g transform={`translate(${37 * COL + 2} ${NEAR[37] - 42})`}>
                <rect x="-3" y="14" width="6" height="24" fill="#e2563f" transform="rotate(8 0 14)" />
                <rect x="0" y="12" width="12" height="18" fill="#2f4fa8" />
                <rect x="0" y="30" width="5" height="12" fill="#1b2a5e" />
                <rect x="7" y="30" width="5" height="12" fill="#1b2a5e" />
                <rect x="1" y="0" width="11" height="12" fill="#f0c9a4" />
                <rect x="0" y="-3" width="13" height="6" fill="#3b2415" />
                <rect x="12" y="16" width="14" height="3" fill="#cfd6e4" />
                <rect x="24" y="12" width="3" height="10" fill="#8a5a33" />
            </g>
        </svg>
    </div>
);

export default KesifHeroArt;
