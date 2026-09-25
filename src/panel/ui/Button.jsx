import React from 'react';

const VARIANTS = {
    primary: 'p-accent-bg shadow-sm hover:brightness-110 disabled:opacity-50',
    secondary: 'bg-white/[0.06] border border-white/10 text-[var(--p-text)] hover:bg-white/[0.1] disabled:opacity-50',
    ghost: 'text-[var(--p-muted)] hover:text-[var(--p-text)] hover:bg-white/[0.06] disabled:opacity-50',
    danger: 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50',
    warning: 'bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50',
    success: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50',
};

const SIZES = {
    xs: 'h-7 px-2 text-xs gap-1 rounded-md',
    sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
    md: 'h-10 px-4 text-sm gap-2 rounded-xl',
    lg: 'h-12 px-5 text-base gap-2 rounded-xl',
};

export default function Button({ variant = 'secondary', size = 'md', loading = false, icon: Icon, children, className = '', type = 'button', ...rest }) {
    return (
        <button
            type={type}
            className={`inline-flex items-center justify-center font-medium transition-colors p-ring whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
            disabled={loading || rest.disabled}
            {...rest}
        >
            {loading ? (
                <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />
            ) : Icon ? <Icon className="text-[0.95em] shrink-0" aria-hidden /> : null}
            {children}
        </button>
    );
}

export function IconButton({ icon: Icon, label, size = 'md', variant = 'ghost', className = '', ...rest }) {
    const dims = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-xl';
    return (
        <button type="button" aria-label={label} title={label} className={`inline-flex items-center justify-center p-ring transition-colors ${VARIANTS[variant]} ${dims} ${className}`} {...rest}>
            <Icon aria-hidden />
        </button>
    );
}
