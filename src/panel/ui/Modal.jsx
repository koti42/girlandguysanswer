import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes } from 'react-icons/fa';

/**
 * Ortalanmış diyalog. ESC ve arka plana tıklama kapatır; açılınca ilk
 * odaklanabilir öğeye odak verir, kapanınca eskisine döner.
 */
export default function Modal({ open, onClose, title, subtitle, children, footer, width = 'max-w-lg', panel }) {
    const boxRef = useRef(null);
    const prevFocus = useRef(null);

    useEffect(() => {
        if (!open) return;
        prevFocus.current = document.activeElement;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        const t = window.setTimeout(() => {
            const first = boxRef.current?.querySelector('input,textarea,select,button:not([data-close])');
            first?.focus();
        }, 10);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.clearTimeout(t);
            prevFocus.current?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center p-0 sm:p-4" data-panel={panel || document.querySelector('[data-panel]')?.dataset.panel || 'admin'} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div ref={boxRef} role="dialog" aria-modal="true" aria-label={title} className={`relative w-full ${width} p-surface rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col p-fade-in`}>
                <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-[var(--p-border)]">
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold">{title}</h2>
                        {subtitle && <p className="text-xs p-muted mt-0.5">{subtitle}</p>}
                    </div>
                    <button type="button" data-close onClick={onClose} aria-label="Kapat" className="h-8 w-8 rounded-lg grid place-items-center p-muted hover:text-[var(--p-text)] hover:bg-white/10 p-ring">
                        <FaTimes />
                    </button>
                </header>
                <div className="px-5 py-4 overflow-y-auto">{children}</div>
                {footer && <footer className="px-5 py-3 border-t border-[var(--p-border)] flex items-center justify-end gap-2">{footer}</footer>}
            </div>
        </div>,
        document.body
    );
}
