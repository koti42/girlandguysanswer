import React, { useRef, useState } from 'react';
import { LuGlobe, LuSave } from 'react-icons/lu';
import GameDialog from '../avatar/GameDialog';
import kesifApiDefault from '../../../services/kesifApi';
import { DESC_MAX, TITLE_MAX, TITLE_MIN, classifyKesifError, kesifErrorText } from './kesifUtils';

/**
 * Harita yayınlama / bilgi düzenleme penceresi.
 *  mode="publish": başlık + açıklama + güvenlik onayı -> (değiştiyse) updateMap, sonra publish.
 *  mode="edit":    yalnızca başlık + açıklamayı kaydeder, yayın durumuna dokunmaz.
 * Başlık/açıklama sunucuda süzülür (422 text_blocked): hata ilgili alanın altında gösterilir.
 * `onDone(map, { published })` yeni MapMine ile çağrılır.
 */
const PublishForm = ({ map, mode, api, onClose, onDone }) => {
    const publishing = mode === 'publish';
    // Pencere kapanınca form sökülür: her açılış map'ten taze başlar (reset effect'i yok).
    const [title, setTitle] = useState(map.title || '');
    const [desc, setDesc] = useState(map.description || '');
    const [agree, setAgree] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState({ field: null, text: '' });
    const lock = useRef(false);

    const trimmed = title.trim();
    const titleOk = trimmed.length >= TITLE_MIN && trimmed.length <= TITLE_MAX;
    const changed = trimmed !== (map.title || '') || desc.trim() !== (map.description || '');
    const canSubmit = titleOk && (!publishing || agree) && !busy;

    const submit = async (e) => {
        e.preventDefault();
        if (lock.current) return;
        if (!titleOk) {
            setError({ field: 'title', text: `Başlık ${TITLE_MIN}-${TITLE_MAX} karakter olmalı.` });
            return;
        }
        if (publishing && !agree) {
            setError({ field: 'agree', text: 'Yayınlamak için onay kutusunu işaretle.' });
            return;
        }
        lock.current = true;
        setBusy(true);
        setError({ field: null, text: '' });
        try {
            let current = map;
            if (changed) {
                // Boş açıklama null gider: sunucuda temizlenir.
                const res = await api.updateMap(map.id, { title: trimmed, description: desc.trim() ? desc.trim() : null });
                current = res?.map || current;
            }
            if (publishing) {
                const res = await api.publish(map.id);
                current = res?.map || current;
            }
            onDone?.(current, { published: publishing });
        } catch (err) {
            const { kind, data } = classifyKesifError(err);
            const field = kind === 'text_blocked' ? (data.field === 'description' ? 'description' : 'title') : null;
            setError({ field, text: kesifErrorText(err, publishing ? 'Harita yayınlanamadı.' : 'Değişiklikler kaydedilemedi.') });
            lock.current = false;
        } finally {
            setBusy(false);
        }
    };

    const errFor = (f) => (error.field === f ? error.text : '');

    return (
        <GameDialog open title={publishing ? 'Haritayı yayınla' : 'Harita bilgileri'} onClose={onClose} dismissable={!busy} size="max-w-lg">
            <form onSubmit={submit} noValidate>
                {publishing && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Yayınlanan harita herkesin Topluluk Haritaları listesinde görünür. İstediğin zaman &quot;Gizle&quot; ile geri çekebilirsin.
                    </p>
                )}

                <label htmlFor="kesif-pub-title" className="mt-3 block text-sm font-semibold">
                    Başlık
                </label>
                <input
                    id="kesif-pub-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                    maxLength={TITLE_MAX}
                    data-autofocus
                    aria-invalid={Boolean(errFor('title'))}
                    aria-describedby={errFor('title') ? 'kesif-pub-title-err' : undefined}
                    autoComplete="off"
                    className="mt-1 min-h-[48px] w-full rounded-2xl border border-slate-200 bg-white px-3 text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
                />
                {errFor('title') && (
                    <p id="kesif-pub-title-err" role="alert" className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-300">
                        {errFor('title')}
                    </p>
                )}

                <label htmlFor="kesif-pub-desc" className="mt-3 block text-sm font-semibold">
                    Açıklama <span className="font-normal text-slate-500">(isteğe bağlı)</span>
                </label>
                <textarea
                    id="kesif-pub-desc"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value.slice(0, DESC_MAX))}
                    maxLength={DESC_MAX}
                    rows={3}
                    aria-invalid={Boolean(errFor('description'))}
                    aria-describedby={errFor('description') ? 'kesif-pub-desc-err' : undefined}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-white/15 dark:bg-white/5 dark:text-white"
                />
                <p className="text-right text-xs text-slate-500" aria-hidden="true">
                    {desc.length}/{DESC_MAX}
                </p>
                {errFor('description') && (
                    <p id="kesif-pub-desc-err" role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-300">
                        {errFor('description')}
                    </p>
                )}

                {publishing && (
                    <label className="mt-3 flex min-h-[48px] cursor-pointer items-start gap-3 rounded-2xl bg-indigo-50 px-3 py-3 text-sm text-indigo-950 dark:bg-indigo-500/10 dark:text-indigo-100">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-coral" />
                        <span>Haritamda kişisel bilgi, kötü söz, reklam ya da çocuklara uygun olmayan içerik yok. Uygunsuz haritalar kaldırılabilir.</span>
                    </label>
                )}
                {errFor('agree') && (
                    <p role="alert" className="mt-1 text-sm font-semibold text-rose-600 dark:text-rose-300">
                        {errFor('agree')}
                    </p>
                )}

                {error.text && !error.field && (
                    <p role="alert" className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-700 dark:text-rose-200">
                        {error.text}
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
                        disabled={!canSubmit}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 font-bold text-slate-950 shadow-lg game-press disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {publishing ? <LuGlobe aria-hidden="true" /> : <LuSave aria-hidden="true" />}
                        {busy ? 'Kaydediliyor…' : publishing ? 'Yayınla' : 'Kaydet'}
                    </button>
                </div>
            </form>
        </GameDialog>
    );
};

/** open=false ya da harita yokken hiçbir şey çizilmez; her açılış taze form. */
const PublishDialog = ({ open, map, mode = 'publish', api = kesifApiDefault, onClose, onDone }) =>
    open && map ? <PublishForm key={`${map.id}:${mode}`} map={map} mode={mode} api={api} onClose={onClose} onDone={onDone} /> : null;

export default PublishDialog;
