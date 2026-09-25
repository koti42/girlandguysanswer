import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import { DURATION_PRESETS, REASON_PRESETS } from '../lib/moderation';

/**
 * Sebep + (isteğe bağlı) süre isteyen moderasyon diyaloğu. Gizleme, ban,
 * dondurma, kaldırma hep bunu kullanır; sebep zorunlu, ön ayarlar hızlı.
 */
export default function ReasonDialog({ open, onClose, onSubmit, title, submitLabel = 'Uygula', withDuration = false, danger = false, loading = false, presets = REASON_PRESETS, description }) {
    const [reason, setReason] = useState('');
    const [minutes, setMinutes] = useState(null);

    useEffect(() => { if (open) { setReason(''); setMinutes(withDuration ? 1440 : null); } }, [open, withDuration]);

    const canSubmit = reason.trim().length >= 3;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={title}
            subtitle={description}
            footer={(
                <>
                    <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
                    <Button variant={danger ? 'danger' : 'primary'} disabled={!canSubmit} loading={loading} onClick={() => onSubmit({ reason: reason.trim(), minutes })} data-testid="reason-submit">{submitLabel}</Button>
                </>
            )}
        >
            <div className="space-y-4">
                <div>
                    <div className="text-xs font-semibold p-muted mb-2">Hızlı sebep</div>
                    <div className="flex flex-wrap gap-1.5">
                        {presets.map((p) => (
                            <button key={p} type="button" onClick={() => setReason(p)} className={`text-xs rounded-full border px-2.5 py-1 transition-colors p-ring ${reason === p ? 'p-accent-bg border-transparent' : 'border-[var(--p-border)] p-hover'}`}>{p}</button>
                        ))}
                    </div>
                </div>
                <label className="block">
                    <span className="text-xs font-semibold p-muted">Sebep <span className="p-tone-danger">*</span></span>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        maxLength={500}
                        placeholder="Kullanıcıya iletilecek açıklama"
                        className="mt-1.5 w-full rounded-lg p-inset border border-[var(--p-border)] px-3 py-2 text-sm text-[var(--p-text)] p-ring resize-none"
                        data-testid="reason-input"
                    />
                    <span className="text-[11px] p-muted">{reason.length}/500</span>
                </label>
                {withDuration && (
                    <div>
                        <div className="text-xs font-semibold p-muted mb-2">Süre</div>
                        <div className="flex flex-wrap gap-1.5">
                            {DURATION_PRESETS.map((d) => (
                                <button key={d.label} type="button" onClick={() => setMinutes(d.minutes)} className={`text-xs rounded-full border px-2.5 py-1 transition-colors p-ring ${minutes === d.minutes ? 'p-accent-bg border-transparent' : 'border-[var(--p-border)] p-hover'}`}>{d.label}</button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
