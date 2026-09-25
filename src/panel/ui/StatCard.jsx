import React from 'react';
import { Sparkline } from './charts';
import { compactNumber } from '../lib/format';

const TONE_BG = {
    accent: 'p-accent-bg',
    info: 'bg-sky-500/20 text-sky-300',
    success: 'bg-emerald-500/20 text-emerald-300',
    warning: 'bg-amber-500/20 text-amber-300',
    danger: 'bg-rose-500/20 text-rose-300',
    neutral: 'bg-white/[0.08] text-[var(--p-text)]',
};

/** KPI kutusu: değer, alt bilgi, isteğe bağlı değişim ve mini grafik. */
export default function StatCard({ label, value, sub, delta, spark, icon: Icon, tone = 'neutral', onClick, compact = false }) {
    const Tag = onClick ? 'button' : 'div';
    const deltaTone = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'p-muted';
    return (
        <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`p-surface rounded-2xl text-left w-full p-fade-in ${compact ? 'p-4' : 'p-5'} ${onClick ? 'hover:bg-white/[0.03] transition-colors p-ring' : ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs font-semibold p-muted truncate">{label}</div>
                    <div className={`font-bold tabular-nums mt-1 ${compact ? 'text-xl' : 'text-2xl'}`}>{typeof value === 'number' ? compactNumber(value) : value}</div>
                    {(sub || delta !== undefined) && (
                        <div className="text-xs mt-1 flex items-center gap-2">
                            {delta !== undefined && <span className={`font-semibold ${deltaTone}`}>{delta > 0 ? '+' : ''}{delta}%</span>}
                            {sub && <span className="p-muted truncate">{sub}</span>}
                        </div>
                    )}
                </div>
                {Icon && <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${TONE_BG[tone]}`}><Icon /></div>}
            </div>
            {spark && spark.length > 1 && <div className="mt-3"><Sparkline values={spark} width={200} height={28} /></div>}
        </Tag>
    );
}
