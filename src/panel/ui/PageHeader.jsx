import React from 'react';

export default function PageHeader({ title, description, actions, children }) {
    return (
        <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                    {description && <p className="text-sm p-muted mt-1">{description}</p>}
                </div>
                {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
            </div>
            {children}
        </div>
    );
}

export function Kbd({ children }) {
    return <kbd className="inline-block rounded border border-[var(--p-border)] p-inset px-1.5 py-0.5 text-[10px] font-mono leading-none p-muted">{children}</kbd>;
}
