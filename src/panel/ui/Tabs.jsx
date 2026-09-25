import React from 'react';

/** items: [{ key, label, count?, icon? }] */
export default function Tabs({ items, value, onChange, className = '', size = 'md' }) {
    const pad = size === 'sm' ? 'px-3 h-8 text-xs' : 'px-4 h-10 text-sm';
    return (
        <div role="tablist" className={`inline-flex items-center gap-1 rounded-xl p-1 bg-white/[0.04] border border-[var(--p-border)] overflow-x-auto max-w-full ${className}`}>
            {items.map((it) => {
                const active = it.key === value;
                return (
                    <button
                        key={it.key}
                        role="tab"
                        aria-selected={active}
                        type="button"
                        onClick={() => onChange(it.key)}
                        className={`inline-flex items-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors p-ring ${pad} ${active ? 'bg-white/[0.1] text-[var(--p-text)] shadow-sm' : 'p-muted hover:text-[var(--p-text)]'}`}
                    >
                        {it.icon && <it.icon className="text-[0.9em]" aria-hidden />}
                        {it.label}
                        {it.count !== undefined && it.count !== null && (
                            <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${active ? 'p-accent-bg' : 'bg-white/10'}`}>{it.count}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
