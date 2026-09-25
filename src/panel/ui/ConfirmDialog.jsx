import React, { useState } from 'react';
import Modal from './Modal';
import Button from './Button';

/**
 * Onay kutusu. `danger` ise onay düğmesi kırmızı; `confirmText` verilirse
 * kullanıcı o metni yazmadan onaylayamaz (hesap silme gibi).
 */
export default function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Onayla', danger = false, confirmText = null, loading = false }) {
    const [typed, setTyped] = useState('');
    const blocked = confirmText ? typed.trim() !== confirmText : false;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            footer={(
                <>
                    <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
                    <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={blocked} loading={loading} data-testid="confirm-button">{confirmLabel}</Button>
                </>
            )}
        >
            <p className="text-sm leading-relaxed">{message}</p>
            {confirmText && (
                <label className="block mt-4 text-xs p-muted">
                    Devam etmek için <span className="font-mono font-bold text-[var(--p-text)]">{confirmText}</span> yazın
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5 w-full h-10 rounded-lg bg-black/30 border border-[var(--p-border)] px-3 text-sm text-[var(--p-text)] p-ring" data-testid="confirm-input" />
                </label>
            )}
        </Modal>
    );
}
