import React from 'react';

const TONES = {
    neutral: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
    success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    warning: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    danger: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
    accent: 'p-accent-bg border-transparent',
};

export default function Badge({ tone = 'neutral', children, dot = false, className = '', size = 'sm' }) {
    const pad = size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-[11px]';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide whitespace-nowrap ${pad} ${TONES[tone] || TONES.neutral} ${className}`}>
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
            {children}
        </span>
    );
}
