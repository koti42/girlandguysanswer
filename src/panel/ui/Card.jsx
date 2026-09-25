import React from 'react';

export default function Card({ title, subtitle, actions, children, className = '', padded = true, ...rest }) {
    return (
        <section className={`p-surface rounded-2xl p-fade-in ${className}`} {...rest}>
            {(title || actions) && (
                <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--p-border)]">
                    <div className="min-w-0">
                        {title && <h3 className="text-sm font-semibold tracking-tight truncate">{title}</h3>}
                        {subtitle && <p className="text-xs p-muted mt-0.5">{subtitle}</p>}
                    </div>
                    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
                </header>
            )}
            <div className={padded ? 'p-5' : ''}>{children}</div>
        </section>
    );
}
