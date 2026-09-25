import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';

/** Sağdan açılan panel: kayıt detayı, düzenleme. */
export default function Drawer({ open, onClose, title, subtitle, children, footer, width = 'max-w-2xl', panel }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[850]" data-panel={panel || document.querySelector('[data-panel]')?.dataset.panel || 'admin'}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
            <aside role="dialog" aria-modal="true" aria-label={title} className={`absolute right-0 top-0 h-full w-full ${width} p-surface border-l shadow-2xl flex flex-col p-fade-in`}>
                <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--p-border)]">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold truncate">{title}</h2>
                        {subtitle && <div className="text-xs p-muted mt-0.5">{subtitle}</div>}
                    </div>
                    <button type="button" onClick={onClose} aria-label="Kapat" className="h-8 w-8 rounded-lg grid place-items-center p-muted hover:text-[var(--p-text)] hover:bg-white/10 p-ring shrink-0"><FaTimes /></button>
                </header>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && <footer className="px-5 py-3 border-t border-[var(--p-border)] flex items-center gap-2 flex-wrap">{footer}</footer>}
            </aside>
        </div>,
        document.body
    );
}
