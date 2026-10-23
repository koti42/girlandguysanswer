import React, { useEffect, useRef, useState } from 'react';
import { LuFlag, LuShieldCheck } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import kesifApiDefault from '../../../services/kesifApi';
import { NOTE_MAX, REPORT_REASONS, kesifErrorText } from './kesifUtils';

/**
 * Harita raporlama penceresi: neden (zorunlu) + isteğe bağlı kısa not.
 * Başarıda "teşekkürler" ekranı; yinelenen rapor da aynı dille karşılanır
 * (sunucu `duplicate` döner, sayaç artmaz). `onDone({ duplicate, hidden })`.
 */
const ReportDialog = ({ open, map, api = kesifApiDefault, onClose, onDone }) => {
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const lock = useRef(false);

    // Her açılışta temiz başla (aynı bileşen farklı haritalar için yeniden kullanılır).
    useEffect(() => {
        if (open) {
            setReason('');
            setNote('');
            setBusy(false);
            setError('');
            setDone(false);
            lock.current = false;
        }
    }, [open, map?.id]);

    if (!open || !map) return null;

    const submit = async (e) => {
        e.preventDefault();
        if (lock.current || !reason) {
            if (!reason) setError('Lütfen bir neden seç.');
            return;
        }
        lock.current = true;
        setBusy(true);
        setError('');
        try {
            const res = await api.report(map.id, { reason, note: note.trim() || undefined });
            setDone(true);
            onDone?.({ duplicate: Boolean(res?.duplicate), hidden: Boolean(res?.hidden), mapId: map.id });
        } catch (err) {
            setError(kesifErrorText(err, 'Rapor gönderilemedi.'));
            lock.current = false;
        } finally {
            setBusy(false);
        }
    };

    return (
        <GameDialog open={open} title={done ? 'Teşekkürler' : 'Haritayı raporla'} onClose={onClose} dismissable={!busy}>
            {done ? (
                <div className="text-center">
                    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
                        <LuShieldCheck className="text-3xl" aria-hidden="true" />
                    </span>
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-200" role="status">
                        Bildirimin bize ulaştı. Raporlanan haritaları ekibimiz inceler; yeterli bildirim gelirse harita otomatik olarak gizlenir.
                    </p>
                    <button
                        type="button"
                        onClick={onClose}
                        data-autofocus
                        className="mt-5 min-h-[48px] w-full rounded-2xl bg-slate-900 px-5 font-bold text-white game-press dark:bg-white dark:text-slate-900"
                    >
                        Tamam
                    </button>
                </div>
            ) : (
                <form onSubmit={submit} noValidate>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        <strong className="text-slate-900 dark:text-white">{map.title}</strong> haritasında seni rahatsız eden ne var?
                    </p>
                    <fieldset className="mt-3" aria-describedby={error ? 'kesif-report-error' : undefined}>
                        <legend className="sr-only">Rapor nedeni</legend>
                        <div className="space-y-1.5">
                            {REPORT_REASONS.map((r, i) => (
                                <label
                                    key={r.key}
                                    className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-coral ${
                                        reason === r.key
                                            ? 'border-coral bg-coral/10'
                                            : 'border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="kesif-report-reason"
                                        value={r.key}
                                        checked={reason === r.key}
                                        onChange={() => {
                                            setReason(r.key);
                                            setError('');
                                        }}
                                        data-autofocus={i === 0 ? true : undefined}
                                        className="mt-1 h-4 w-4 accent-coral"
                                    />
                                    <span>
                                        <span className="block font-bold">{r.label}</span>
                                        <span className="block text-xs text-slate-500 dark:text-slate-400">{r.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <label className="mt-3 block text-sm font-semibold" htmlFor="kesif-report-note">
                        Not <span className="font-normal text-slate-500">(isteğe bağlı)</span>
                    </label>
                    <textarea
                        id="kesif-report-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                        maxLength={NOTE_MAX}
                        rows={2}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
                        placeholder="Kısaca anlat"
                    />
                    <p className="text-right text-xs text-slate-500" aria-hidden="true">
                        {note.length}/{NOTE_MAX}
                    </p>

                    {error && (
                        <p id="kesif-report-error" role="alert" className="mt-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-200">
                            {error}
                        </p>
                    )}

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="min-h-[48px] rounded-2xl px-5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-white/10"
                        >
                            Vazgeç
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-rose-600 px-6 font-bold text-white game-press disabled:opacity-60"
                        >
                            <LuFlag aria-hidden="true" /> {busy ? 'Gönderiliyor…' : 'Raporla'}
                        </button>
                    </div>
                </form>
            )}
        </GameDialog>
    );
};

export default ReportDialog;
