import React, { useMemo, useState } from 'react';

/**
 * Bağımlılıksız SVG grafikler. Panel için yeterli: alan/çizgi, mini sparkline,
 * yatay çubuk, halka. Renkler tema değişkenlerinden.
 */

const PALETTE = ['var(--p-accent)', '#38bdf8', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa', '#fb7185', '#34d399'];

function scale(values, h, pad = 2) {
    const max = Math.max(1, ...values);
    return (v) => h - pad - (v / max) * (h - pad * 2);
}

export function Sparkline({ values = [], width = 120, height = 32, color = 'var(--p-accent)', fill = true }) {
    if (!values.length) return <svg width={width} height={height} aria-hidden />;
    const y = scale(values, height);
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const pts = values.map((v, i) => `${i * step},${y(v)}`).join(' ');
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
            {fill && <polygon points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity="0.15" />}
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

/**
 * Çok serili alan grafiği. rows: [{ date, a, b, ... }], series: [{ key, label, color? }]
 * Fare ile üstüne gelince dikey kılavuz ve değer kutusu.
 */
export function AreaChart({ rows = [], series = [], height = 220 }) {
    const [hover, setHover] = useState(null);
    const width = 720;
    const padL = 36, padR = 12, padT = 12, padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const { max, paths, xOf } = useMemo(() => {
        const all = series.flatMap((s) => rows.map((r) => Number(r[s.key]) || 0));
        const maxV = Math.max(1, ...all);
        const xOf_ = (i) => padL + (rows.length > 1 ? (i / (rows.length - 1)) * innerW : innerW / 2);
        const yOf = (v) => padT + innerH - (v / maxV) * innerH;
        const paths_ = series.map((s, si) => {
            const pts = rows.map((r, i) => `${xOf_(i)},${yOf(Number(r[s.key]) || 0)}`);
            return {
                ...s,
                color: s.color || PALETTE[si % PALETTE.length],
                line: pts.join(' '),
                area: `${padL},${padT + innerH} ${pts.join(' ')} ${xOf_(rows.length - 1)},${padT + innerH}`,
            };
        });
        return { max: maxV, paths: paths_, xOf: xOf_ };
    }, [rows, series, innerW, innerH]);

    if (!rows.length) return <div className="text-xs p-muted py-8 text-center">Veri yok</div>;

    const ticks = [0, 0.5, 1].map((t) => ({ y: padT + innerH - t * innerH, v: Math.round(max * t) }));
    const labelEvery = Math.max(1, Math.ceil(rows.length / 6));

    const onMove = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * width;
        const i = Math.round(((x - padL) / innerW) * (rows.length - 1));
        setHover(Math.max(0, Math.min(rows.length - 1, i)));
    };

    return (
        <div className="relative">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label="Zaman serisi" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
                {ticks.map((t) => (
                    <g key={t.v + '-' + t.y}>
                        <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} stroke="rgba(148,163,184,0.15)" strokeDasharray="3 4" />
                        <text x={padL - 6} y={t.y + 4} textAnchor="end" fontSize="10" fill="var(--p-muted)">{t.v}</text>
                    </g>
                ))}
                {paths.map((p) => (
                    <g key={p.key}>
                        <polygon points={p.area} fill={p.color} opacity="0.12" />
                        <polyline points={p.line} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />
                    </g>
                ))}
                {rows.map((r, i) => (i % labelEvery === 0 || i === rows.length - 1) && (
                    <text key={r.date} x={xOf(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--p-muted)">{String(r.date).slice(5)}</text>
                ))}
                {hover !== null && (
                    <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + innerH} stroke="var(--p-text)" opacity="0.35" />
                )}
            </svg>
            {hover !== null && (
                <div className="absolute top-2 right-2 p-surface rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none">
                    <div className="font-semibold mb-1">{rows[hover].date}</div>
                    {paths.map((p) => (
                        <div key={p.key} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.label}: <b>{rows[hover][p.key]}</b></div>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap gap-3 mt-2 text-xs p-muted">
                {paths.map((p) => <span key={p.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.label}</span>)}
            </div>
        </div>
    );
}

/** Yatay çubuklar: items [{ label, value, tone? }] - en büyük %100. */
export function BarRows({ items = [], max, formatValue = (v) => v }) {
    const top = max ?? Math.max(1, ...items.map((i) => Number(i.value) || 0));
    if (!items.length) return <div className="text-xs p-muted py-4 text-center">Veri yok</div>;
    return (
        <ul className="space-y-2.5">
            {items.map((it, i) => (
                <li key={it.key ?? it.label ?? i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                        <span className="truncate pr-2">{it.label}</span>
                        <b className="tabular-nums">{formatValue(it.value)}</b>
                    </div>
                    <div className="h-2 rounded-full p-fill overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((Number(it.value) || 0) / top) * 100)}%`, background: it.color || PALETTE[i % PALETTE.length] }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** Halka: segments [{ label, value, color? }] */
export function Donut({ segments = [], size = 140, thickness = 18, centerLabel }) {
    const total = Math.max(1, segments.reduce((s, x) => s + (Number(x.value) || 0), 0));
    const r = (size - thickness) / 2;
    const c = 2 * Math.PI * r;
    // Her dilimin başlangıç açısı önceden hesaplanır: çizim sırasında
    // sayaç değiştirmek yerine saf bir liste.
    const arcs = segments.reduce((acc, s) => {
        const frac = (Number(s.value) || 0) / total;
        acc.list.push({ ...s, frac, start: acc.offset });
        acc.offset += frac;
        return acc;
    }, { list: [], offset: 0 }).list;
    return (
        <div className="flex items-center gap-4">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Dağılım">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth={thickness} />
                {arcs.map((s, i) => (
                    <circle key={s.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color || PALETTE[i % PALETTE.length]} strokeWidth={thickness} strokeDasharray={`${s.frac * c} ${c}`} strokeDashoffset={-s.start * c} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="butt" />
                ))}
                {centerLabel && <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" fontSize="16" fontWeight="700" fill="var(--p-text)">{centerLabel}</text>}
            </svg>
            <ul className="text-xs space-y-1.5">
                {segments.map((s, i) => (
                    <li key={s.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color || PALETTE[i % PALETTE.length] }} /><span className="p-muted">{s.label}</span><b className="ml-auto tabular-nums">{s.value}</b></li>
                ))}
            </ul>
        </div>
    );
}
