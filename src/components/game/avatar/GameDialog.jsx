import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';

/*
 * Oyun Merkezi diline uygun erişilebilir pencere: Esc / arka plana dokunma
 * kapatır, odak pencerede tutulur ve kapanınca açan öğeye döner, sayfa
 * kaydırması kilitlenir. Dar ekranda alttan açılan çekmece, geniş ekranda
 * ortada kart.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const GameDialog = ({ open, title, onClose, children, dismissable = true, size = 'max-w-md' }) => {
    const titleId = useId();
    const panelRef = useRef(null);
    const closeRef = useRef(onClose);
    const dismissRef = useRef(dismissable);

    useEffect(() => {
        closeRef.current = onClose;
        dismissRef.current = dismissable;
    }, [onClose, dismissable]);

    useEffect(() => {
        if (!open) return undefined;
        const opener = document.activeElement;
        const panel = panelRef.current;
        const first = panel?.querySelector('[data-autofocus]') || panel?.querySelector(FOCUSABLE);
        (first || panel)?.focus();
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const onKey = (e) => {
            if (e.key === 'Escape') {
                if (dismissRef.current) {
                    e.stopPropagation();
                    closeRef.current?.();
                }
                return;
            }
            if (e.key !== 'Tab' || !panel) return;
            const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => !el.hasAttribute('disabled'));
            if (!items.length) {
                e.preventDefault();
                return;
            }
            const firstEl = items[0];
            const lastEl = items[items.length - 1];
            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
            if (opener && typeof opener.focus === 'function') opener.focus();
        };
    }, [open]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] game-fade-up"
                aria-hidden="true"
                onClick={() => dismissable && onClose?.()}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`relative w-full ${size} max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-slate-900 shadow-2xl outline-none dark:bg-[#17123a] dark:text-slate-100 game-pop-in`}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 id={titleId} className="text-lg font-extrabold leading-tight">
                        {title}
                    </h2>
                    {dismissable && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
                            aria-label="Kapat"
                        >
                            <LuX className="text-xl" aria-hidden="true" />
                        </button>
                    )}
                </div>
                {children}
            </div>
        </div>,
        document.body
    );
};

export default GameDialog;
