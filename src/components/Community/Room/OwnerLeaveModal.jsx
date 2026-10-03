import React, { useEffect, useId, useRef } from 'react';
import { FaDoorOpen } from 'react-icons/fa';

/**
 * Yazılı odanın sahibi çıkarken sorulan üç seçenekli onay:
 * odayı kapat / açık bırak / vazgeç. ConfirmationModal iki düğmeli olduğu
 * için ayrı, küçük ve erişilebilir bir pencere.
 */
const OwnerLeaveModal = ({ isOpen, busy = false, onCloseRoom, onKeepOpen, onCancel }) => {
    const titleId = useId();
    const descId = useId();
    const dialogRef = useRef(null);
    const cancelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;
        const previouslyFocused = document.activeElement;
        // Varsayılan odak en zararsız seçenekte: yanlışlıkla Enter odayı kapatmasın
        cancelRef.current?.focus();
        return () => {
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (!busy) onCancel?.();
                return;
            }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            // Odak pencerenin içinde dolaşsın
            const focusables = dialogRef.current.querySelectorAll('button:not([disabled])');
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen, busy, onCancel]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={busy ? undefined : onCancel}
                aria-hidden="true"
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="relative w-full max-w-sm rounded-3xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 p-6"
            >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-coral/10 text-coral">
                    <FaDoorOpen className="text-xl" aria-hidden="true" />
                </div>
                <h3 id={titleId} className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2">
                    Odanı kapatmak istiyor musun?
                </h3>
                <p id={descId} className="text-sm text-center text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
                    Kapatırsan oda herkes için sona erer. Açık bırakırsan sohbet devam eder; 48 saat içinde geri dönmezsen oda otomatik kapanır.
                </p>
                <div className="flex flex-col gap-2.5">
                    <button
                        type="button"
                        onClick={onKeepOpen}
                        disabled={busy}
                        className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-coral to-orange-400 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Açık bırak
                    </button>
                    <button
                        type="button"
                        onClick={onCloseRoom}
                        disabled={busy}
                        className="w-full min-h-[44px] rounded-xl bg-red-50 dark:bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-500/30 transition hover:bg-red-100 dark:hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Odayı kapat
                    </button>
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        className="w-full min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 transition hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        Vazgeç
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OwnerLeaveModal;
