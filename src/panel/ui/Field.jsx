import React from 'react';

const base = 'w-full rounded-lg p-inset border border-[var(--p-border)] px-3 text-sm text-[var(--p-text)] placeholder:text-[var(--p-muted)] p-ring disabled:opacity-50';

export function Field({ label, hint, error, children, className = '' }) {
    return (
        <label className={`block ${className}`}>
            {label && <span className="block text-xs font-semibold p-muted mb-1.5">{label}</span>}
            {children}
            {error ? <span className="block text-xs p-tone-danger mt-1">{error}</span> : hint ? <span className="block text-[11px] p-muted mt-1">{hint}</span> : null}
        </label>
    );
}

export function Input({ className = '', ...rest }) {
    return <input className={`${base} h-10 ${className}`} {...rest} />;
}

export function Textarea({ className = '', rows = 3, ...rest }) {
    return <textarea rows={rows} className={`${base} py-2 resize-y ${className}`} {...rest} />;
}

export function Select({ className = '', children, ...rest }) {
    return (
        <select className={`${base} h-10 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238b96ad%22 stroke-width=%222%22><path d=%22M6 9l6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center] ${className}`} {...rest}>
            {children}
        </select>
    );
}

export function Switch({ checked, onChange, label, description, disabled }) {
    return (
        <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left w-full p-ring rounded-lg disabled:opacity-50">
            <span className={`mt-0.5 relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--p-accent)]' : 'p-fill-strong'}`}>
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
            </span>
            {(label || description) && (
                <span className="min-w-0">
                    {label && <span className="block text-sm font-medium">{label}</span>}
                    {description && <span className="block text-xs p-muted">{description}</span>}
                </span>
            )}
        </button>
    );
}
