import React, { useId } from 'react';

/** Küçük SVG çizgi grafik (0-100 ölçeği). `values` sayı dizisi; `color` çizgi/dolgu rengi. */
const Sparkline = ({ values = [], color = '#ff3b63', height = 56, max = 100, className = '' }) => {
    const id = useId().replace(/:/g, '');
    const w = 200;
    const h = height;
    const vals = values.length >= 2 ? values : [0, ...(values.length ? values : [0])];
    const step = w / (vals.length - 1);
    const y = (v) => h - 4 - (Math.max(0, Math.min(max, v)) / max) * (h - 8);
    const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
    const line = pts.join(' ');
    const area = `0,${h} ${line} ${w},${h}`;
    const last = vals[vals.length - 1];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`block w-full ${className}`} style={{ height }} aria-hidden="true">
            <defs>
                <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor={color} stopOpacity="0.45" />
                    <stop offset="1" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1="0" x2={w} y1={(h - 4) * g + 2} y2={(h - 4) * g + 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            ))}
            <polygon points={area} fill={`url(#sp-${id})`} />
            <polyline points={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={w} cy={y(last)} r="3" fill={color} />
        </svg>
    );
};

export default Sparkline;
