import React, { useMemo } from 'react';
import { createRng } from '../../../game/protocolZero/rng';

/*
 * Bölge paneli başlık görseli: her veri merkezi için prosedürel SVG şehir silueti + simgesel yapı
 * (İstanbul: Boğaz köprüsü ve kubbe; Londra: saat kulesi; Kahire: piramitler…). Harici görsel yok.
 * Gökyüzü düğüm durumuna göre tonlanır (güvenli: alacakaranlık turkuazı, sızma: amber, ele geçirilmiş: kızıl).
 */

const SKY = {
    safe: ['#0b2a5c', '#1a4b8f', '#0ea5c9'],
    warn: ['#2a1130', '#7a2d3a', '#f59e0b'],
    lost: ['#1a0410', '#6b0420', '#ff003c'],
    isolated: ['#0f172a', '#1e293b', '#64748b'],
};

const hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
};

/** Simgesel yapılar: 400×160 tuval, zemin y=128. */
const LANDMARKS = {
    ist: (c) => (
        <g fill={c} stroke={c}>
            <rect x="120" y="70" width="8" height="58" />
            <rect x="250" y="70" width="8" height="58" />
            <path d="M60 128 Q124 40 189 100 Q254 40 320 128" fill="none" strokeWidth="2" />
            <path d="M124 72 L124 100 M254 72 L254 100" strokeWidth="2" />
            {[...Array(12)].map((_, i) => <line key={i} x1={128 + i * 10} y1={100 - Math.abs(6 - i) * 7} x2={128 + i * 10} y2="110" strokeWidth="1" />)}
            <rect x="60" y="110" width="270" height="4" />
            <ellipse cx="345" cy="108" rx="22" ry="16" />
            <rect x="323" y="108" width="44" height="20" />
            <rect x="314" y="70" width="4" height="58" />
            <rect x="372" y="70" width="4" height="58" />
        </g>
    ),
    fra: (c) => (
        <g fill={c}>
            <rect x="150" y="40" width="22" height="88" />
            <rect x="178" y="56" width="18" height="72" />
            <rect x="130" y="72" width="16" height="56" />
            <rect x="202" y="30" width="26" height="98" />
            <rect x="213" y="8" width="3" height="24" />
            <rect x="234" y="66" width="20" height="62" />
            <rect x="260" y="84" width="14" height="44" />
        </g>
    ),
    vir: (c) => (
        <g fill={c}>
            <rect x="120" y="98" width="160" height="30" />
            <rect x="160" y="80" width="80" height="20" />
            <path d="M166 80 Q200 36 234 80 Z" />
            <rect x="197" y="24" width="6" height="14" />
            <rect x="72" y="36" width="10" height="92" />
            <path d="M72 36 L77 20 L82 36 Z" />
        </g>
    ),
    svl: (c) => (
        <g fill={c}>
            <path d="M0 128 Q80 70 160 118 T330 110 T400 128 Z" opacity="0.7" />
            <rect x="200" y="104" width="90" height="24" />
            <rect x="110" y="110" width="70" height="18" />
            <path d="M330 100 a26 14 0 0 1 52 0 L356 112 Z" />
            <rect x="354" y="100" width="4" height="28" />
            {[...Array(6)].map((_, i) => <rect key={i} x={120 + i * 11} y="100" width="8" height="6" />)}
        </g>
    ),
    lon: (c) => (
        <g fill={c} stroke={c}>
            <rect x="150" y="48" width="18" height="80" />
            <path d="M150 48 L159 28 L168 48 Z" />
            <circle cx="159" cy="62" r="6" fill="none" strokeWidth="2" />
            <rect x="170" y="90" width="70" height="38" />
            <circle cx="300" cy="80" r="40" fill="none" strokeWidth="3" />
            {[...Array(8)].map((_, i) => <line key={i} x1="300" y1="80" x2={300 + 40 * Math.cos((i * Math.PI) / 4)} y2={80 + 40 * Math.sin((i * Math.PI) / 4)} strokeWidth="1" />)}
            <path d="M285 128 L300 80 L315 128" fill="none" strokeWidth="3" />
        </g>
    ),
    mos: (c) => (
        <g fill={c}>
            <rect x="100" y="112" width="220" height="16" />
            {[150, 210, 270].map((x, i) => (
                <g key={x}>
                    <rect x={x - 12} y={78 - i * 6} width="24" height={50 + i * 6} />
                    <ellipse cx={x} cy={74 - i * 6} rx="16" ry="14" />
                    <path d={`M${x} ${48 - i * 6} L${x} ${62 - i * 6}`} stroke={c} strokeWidth="3" />
                </g>
            ))}
            <rect x="90" y="60" width="18" height="68" />
            <path d="M90 60 L99 40 L108 60 Z" />
        </g>
    ),
    tyo: (c) => (
        <g fill={c} stroke={c}>
            <path d="M200 20 L172 128 L228 128 Z" fill="none" strokeWidth="3" />
            <path d="M186 70 L214 70 M178 100 L222 100" strokeWidth="2" />
            <rect x="198" y="6" width="4" height="16" />
            <path d="M290 110 L330 110 L326 96 L294 96 Z M296 96 L324 96 L320 84 L300 84 Z M302 84 L318 84 L314 74 L306 74 Z" />
            <rect x="80" y="84" width="40" height="44" />
            <rect x="126" y="96" width="30" height="32" />
        </g>
    ),
    sgp: (c) => (
        <g fill={c}>
            {[160, 200, 240].map((x) => <rect key={x} x={x - 12} y="56" width="24" height="72" />)}
            <path d="M140 56 Q200 36 262 56 L262 48 Q200 28 140 48 Z" />
            <rect x="80" y="96" width="36" height="32" />
            <rect x="300" y="88" width="28" height="40" />
        </g>
    ),
    syd: (c) => (
        <g fill={c} stroke={c}>
            <path d="M60 128 Q200 10 340 128" fill="none" strokeWidth="4" />
            <path d="M80 128 Q200 40 320 128" fill="none" strokeWidth="2" />
            <path d="M190 128 Q210 86 250 100 L250 128 Z M230 128 Q252 80 292 98 L292 128 Z M270 128 Q290 92 320 104 L320 128 Z" />
            <rect x="140" y="118" width="200" height="10" />
        </g>
    ),
    sao: (c) => (
        <g fill={c}>
            <path d="M0 128 Q90 60 180 128 Z" />
            <rect x="86" y="44" width="6" height="30" />
            <rect x="74" y="52" width="30" height="5" />
            <path d="M80 74 L98 74 L96 92 L82 92 Z" />
            {[200, 224, 246, 272, 300, 326, 350].map((x, i) => <rect key={x} x={x} y={60 + (i % 3) * 14} width="18" height={68 - (i % 3) * 14} />)}
        </g>
    ),
    cai: (c) => (
        <g fill={c}>
            <path d="M80 128 L150 48 L220 128 Z" />
            <path d="M200 128 L250 70 L300 128 Z" opacity="0.85" />
            <path d="M290 128 L322 94 L354 128 Z" opacity="0.7" />
            <rect x="40" y="112" width="40" height="16" />
            <rect x="60" y="100" width="14" height="12" />
        </g>
    ),
    mum: (c) => (
        <g fill={c} stroke={c}>
            <rect x="160" y="70" width="80" height="58" />
            <path d="M176 128 L176 96 Q200 70 224 96 L224 128 Z" fill="#000" opacity="0.6" />
            <rect x="152" y="60" width="12" height="68" />
            <rect x="236" y="60" width="12" height="68" />
            <rect x="60" y="40" width="18" height="88" />
            <rect x="84" y="56" width="22" height="72" />
            <rect x="300" y="48" width="20" height="80" />
            <rect x="326" y="76" width="16" height="52" />
        </g>
    ),
    seo: (c) => (
        <g fill={c}>
            <path d="M0 128 Q90 70 170 120 Q260 60 400 128 Z" opacity="0.7" />
            <rect x="196" y="30" width="8" height="98" />
            <ellipse cx="200" cy="52" rx="18" ry="7" />
            <rect x="198" y="10" width="4" height="20" />
            <rect x="260" y="84" width="22" height="44" />
            <rect x="290" y="96" width="30" height="32" />
        </g>
    ),
    rek: (c) => (
        <g fill={c}>
            <path d="M0 128 Q60 80 120 110 T240 104 T400 128 Z" opacity="0.7" />
            <path d="M160 128 L160 90 L186 70 L200 36 L214 70 L240 90 L240 128 Z" />
            <path d="M160 92 L130 112 L130 128 L160 128 Z M240 92 L270 112 L270 128 L240 128 Z" />
        </g>
    ),
};

const CityArt = ({ nodeId = 'ist', status = 'safe', className = '', compact = false }) => {
    const starCount = compact ? 18 : 36;
    const [top, mid, glow] = SKY[status] || SKY.safe;
    const buildings = useMemo(() => {
        const rng = createRng(hash(nodeId));
        const out = [];
        let x = 0;
        while (x < 400) {
            const w = 10 + Math.floor(rng() * 22);
            const h = 14 + Math.floor(rng() * 54);
            out.push({ x, w, h, lit: rng() < 0.6 });
            x += w + 2 + Math.floor(rng() * 6);
        }
        return out;
    }, [nodeId]);
    const stars = useMemo(() => {
        const rng = createRng(hash(nodeId) ^ 0x9e37);
        return Array.from({ length: starCount }, () => [Math.round(rng() * 400), Math.round(rng() * 70), rng() < 0.3 ? 1.4 : 0.8]);
    }, [nodeId, starCount]);
    const Landmark = LANDMARKS[nodeId];
    const ids = `pz-city-${nodeId}`;

    return (
        <svg viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice" className={`block h-full w-full ${className}`} aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`${ids}-sky`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={top} />
                    <stop offset="0.7" stopColor={mid} />
                    <stop offset="1" stopColor={glow} stopOpacity="0.9" />
                </linearGradient>
                <linearGradient id={`${ids}-water`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={glow} stopOpacity="0.45" />
                    <stop offset="1" stopColor="#02060f" />
                </linearGradient>
                <radialGradient id={`${ids}-sun`} cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor={glow} stopOpacity="0.9" />
                    <stop offset="1" stopColor={glow} stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width="400" height="160" fill={`url(#${ids}-sky)`} />
            {stars.map(([sx, sy, r], i) => <circle key={i} cx={sx} cy={sy} r={r} fill="#fff" opacity="0.7" />)}
            <circle cx="320" cy="60" r="60" fill={`url(#${ids}-sun)`} />
            <g fill="#050b1a" opacity="0.95">
                {buildings.map((b, i) => (
                    <rect key={i} x={b.x} y={128 - b.h} width={b.w} height={b.h} />
                ))}
            </g>
            <g fill={glow} opacity="0.55">
                {buildings.filter((b) => b.lit).map((b, i) => (
                    <g key={i}>
                        {[...Array(Math.max(1, Math.floor(b.h / 12)))].map((_, j) => (
                            <rect key={j} x={b.x + 3} y={128 - b.h + 4 + j * 11} width={Math.max(2, b.w - 6)} height="2" />
                        ))}
                    </g>
                ))}
            </g>
            <rect y="104" width="400" height="24" fill={glow} opacity="0.22" />
            {Landmark ? (
                <g stroke={glow} strokeOpacity="0.7" strokeWidth="1" paintOrder="stroke" style={{ filter: `drop-shadow(0 0 4px ${glow})` }}>
                    {Landmark('#0a1430')}
                </g>
            ) : null}
            <rect y="128" width="400" height="32" fill={`url(#${ids}-water)`} />
            <rect y="126" width="400" height="2" fill={glow} opacity="0.8" />
        </svg>
    );
};

export default CityArt;
