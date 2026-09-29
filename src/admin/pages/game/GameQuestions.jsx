import React, { useState } from 'react';
import { FaBan, FaCheck, FaPen, FaPlus } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { errorMessage } from '../../../panel/api/client';
import { useQuery } from '../../../panel/hooks/useQuery';
import { useToast } from '../../../panel/hooks/useToast';
import { Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, SearchInput, Select, Switch, Textarea } from '../../../panel/ui';
import { formatNumber } from '../../../panel/lib/format';
import {
    DIFFICULTIES, accuracyOf, accuracyTone, categorySlug, difficultyOf, emptyQuestionForm, fieldErrors, listOf,
    questionPayload, questionToForm, toPagination, validateQuestion,
} from './gameUtils';

const LETTERS = ['A', 'B', 'C', 'D'];
const EMPTY_FILTERS = { search: '', category: '', difficulty: '', is_active: '' };

/** Oyun soruları: filtreli, sayfalı liste + ekle/düzenle modalı + pasife al. */
export default function GameQuestions() {
    const toast = useToast();
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null); // null | {} (yeni) | soru
    const [form, setForm] = useState(emptyQuestionForm());
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirmOff, setConfirmOff] = useState(null);

    const cats = useQuery(() => gameAdminApi.categories(), []);
    const categories = listOf(cats.data, 'categories', 'items');
    const catName = (c) => (c && typeof c === 'object' ? c.name : categories.find((x) => x.slug === c)?.name) || categorySlug(c) || '—';

    const list = useQuery(() => gameAdminApi.questions({ ...filters, page }), [filters, page]);
    const rows = listOf(list.data, 'questions', 'items');
    const pagination = toPagination(list.data?.pagination, rows.length);

    // Filtre değişince ilk sayfaya dön (efekt yerine aynı güncellemede).
    const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

    const open = (q) => {
        setErrors({});
        setForm(q ? questionToForm(q) : emptyQuestionForm(filters.category || categories[0]?.slug || ''));
        setEditing(q || {});
    };
    const close = () => { if (!busy) setEditing(null); };
    const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
    const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

    const save = async () => {
        const errs = validateQuestion(form);
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setBusy(true);
        try {
            const r = editing?.id
                ? await gameAdminApi.updateQuestion(editing.id, questionPayload(form, { includeActive: true }))
                : await gameAdminApi.createQuestion(questionPayload(form));
            toast.success(r?.data?.message || (editing?.id ? 'Soru güncellendi.' : 'Soru eklendi.'));
            setEditing(null);
            list.refetch();
        } catch (e) {
            const fe = fieldErrors(e);
            if (fe) setErrors(fe);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const deactivate = async () => {
        setBusy(true);
        try {
            const r = await gameAdminApi.deactivateQuestion(confirmOff.id);
            toast.success(r?.data?.message || 'Soru pasife alındı.');
            setConfirmOff(null);
            list.refetch();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const activate = async (q) => {
        try {
            const r = await gameAdminApi.updateQuestion(q.id, { is_active: true });
            toast.success(r?.data?.message || 'Soru yeniden aktif.');
            list.refetch();
        } catch (e) { toast.error(errorMessage(e)); }
    };

    const isActive = (q) => q.is_active !== false && q.is_active !== 0;

    const columns = [
        { key: 'text', label: 'Soru', render: (q) => (
            <div className="min-w-[220px] max-w-xl">
                <p className="text-sm leading-snug line-clamp-2 break-words" title={q.text}>{q.text}</p>
                {Array.isArray(q.options) && q.options[q.correct_index] !== undefined && <p className="text-[11px] p-muted mt-0.5 truncate">Doğru: <b className="p-tone-success">{LETTERS[q.correct_index]}</b> · {q.options[q.correct_index]}</p>}
            </div>
        ) },
        { key: 'category', label: 'Kategori', width: 130, render: (q) => <span className="text-xs">{catName(q.category)}</span> },
        { key: 'difficulty', label: 'Zorluk', width: 90, render: (q) => { const d = difficultyOf(q.difficulty); return <Badge size="xs" tone={d.tone}>{d.label}</Badge>; } },
        { key: 'accuracy', label: 'Doğruluk', width: 110, align: 'right', nowrap: true, render: (q) => {
            const acc = accuracyOf(q);
            return acc === null ? <span className="text-xs p-muted">—</span> : <span className="inline-flex flex-col items-end"><Badge tone={accuracyTone(acc)}>%{acc}</Badge><span className="text-[10px] p-muted mt-0.5">{formatNumber(q.times_correct ?? 0)}/{formatNumber(q.times_answered ?? 0)}</span></span>;
        } },
        { key: 'is_active', label: 'Durum', width: 90, render: (q) => <Badge tone={isActive(q) ? 'success' : 'neutral'} dot>{isActive(q) ? 'Aktif' : 'Pasif'}</Badge> },
        { key: '_actions', label: '', width: 190, render: (q) => (
            <div className="flex gap-1 justify-end">
                <Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(q)} aria-label={`Düzenle: ${q.text}`}>Düzenle</Button>
                {isActive(q)
                    ? <Button size="xs" variant="danger" icon={FaBan} onClick={() => setConfirmOff(q)}>Pasife al</Button>
                    : <Button size="xs" variant="success" icon={FaCheck} onClick={() => activate(q)}>Aktifleştir</Button>}
            </div>
        ) },
    ];

    const filtered = Object.values(filters).some((v) => v !== '');

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={filters.search} onChange={setFilter('search')} placeholder="Soru metninde ara" className="w-full sm:w-72" />
                <Select value={filters.category} onChange={(e) => setFilter('category')(e.target.value)} className="w-full sm:w-auto" aria-label="Kategori">
                    <option value="">Tüm kategoriler</option>
                    {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                </Select>
                <Select value={filters.difficulty} onChange={(e) => setFilter('difficulty')(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-auto" aria-label="Zorluk">
                    <option value="">Tüm zorluklar</option>
                    {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </Select>
                <Select value={filters.is_active} onChange={(e) => setFilter('is_active')(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-auto" aria-label="Durum">
                    <option value="">Aktif + pasif</option>
                    <option value="1">Aktif</option>
                    <option value="0">Pasif</option>
                </Select>
                {filtered && <Button size="sm" variant="ghost" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Temizle</Button>}
                <Button size="sm" variant="primary" icon={FaPlus} className="sm:ml-auto" onClick={() => open(null)}>Yeni soru</Button>
            </div>

            <Card padded={false}>
                <DataTable columns={columns} rows={rows} loading={list.loading} error={list.error} onRetry={list.refetch} dense
                    rowTone={(q) => (isActive(q) ? undefined : 'muted')}
                    pagination={pagination} onPage={setPage}
                    empty={<p className="py-10 text-center text-xs p-muted">{filtered ? 'Filtreye uyan soru yok.' : 'Henüz soru yok.'}</p>} />
            </Card>

            <Modal open={!!editing} onClose={close} title={editing?.id ? 'Soruyu düzenle' : 'Yeni soru'} width="max-w-2xl"
                footer={<><Button variant="ghost" onClick={close}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save} data-testid="question-save">Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Soru metni *" className="sm:col-span-2" error={errors.text}>
                        <Textarea rows={3} value={form.text} onChange={(e) => setF('text', e.target.value)} maxLength={500} data-testid="question-text" />
                    </Field>

                    <fieldset className="sm:col-span-2">
                        <legend className="block text-xs font-semibold p-muted mb-1.5">Şıklar * <span className="font-normal">(doğru şıkkı işaretleyin)</span></legend>
                        <div className="grid gap-2">
                            {form.options.map((o, i) => (
                                <div key={i}>
                                    <div className={`flex items-center gap-2 rounded-lg ${Number(form.correct_index) === i ? 'ring-1 ring-emerald-500/60' : ''}`}>
                                        <label className="flex items-center gap-1.5 shrink-0 cursor-pointer pl-1">
                                            <input type="radio" name="correct_index" checked={Number(form.correct_index) === i} onChange={() => setF('correct_index', i)} className="accent-[var(--p-accent)] h-4 w-4" aria-label={`Doğru şık ${LETTERS[i]}`} />
                                            <b className="text-xs w-3">{LETTERS[i]}</b>
                                        </label>
                                        <Input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={200} placeholder={`${LETTERS[i]} şıkkı`} aria-label={`${LETTERS[i]} şıkkı`} />
                                    </div>
                                    {errors[`options.${i}`] && <span className="block text-xs p-tone-danger mt-1">{errors[`options.${i}`]}</span>}
                                </div>
                            ))}
                        </div>
                        {(errors.options || errors.correct_index) && <span className="block text-xs p-tone-danger mt-1">{errors.options || errors.correct_index}</span>}
                    </fieldset>

                    <Field label="Kategori *" error={errors.category}>
                        <Select value={form.category} onChange={(e) => setF('category', e.target.value)} aria-label="Soru kategorisi">
                            <option value="">Seçin</option>
                            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                        </Select>
                    </Field>
                    <Field label="Zorluk" error={errors.difficulty}>
                        <Select value={form.difficulty} onChange={(e) => setF('difficulty', Number(e.target.value))} aria-label="Soru zorluğu">
                            {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </Select>
                    </Field>
                    <Field label="Açıklama" hint="Cevaptan sonra oyuncuya gösterilir (isteğe bağlı)." className="sm:col-span-2" error={errors.explanation}>
                        <Textarea rows={2} value={form.explanation} onChange={(e) => setF('explanation', e.target.value)} maxLength={500} />
                    </Field>
                    {editing?.id && (
                        <div className="sm:col-span-2"><Switch checked={!!form.is_active} onChange={(v) => setF('is_active', v)} label="Aktif" description="Pasif sorular yeni oyunlarda çıkmaz; geçmiş oturumlar etkilenmez." /></div>
                    )}
                </div>
            </Modal>

            <ConfirmDialog open={!!confirmOff} onClose={() => setConfirmOff(null)} title="Soru pasife alınsın mı?" message={`"${confirmOff?.text || ''}" yeni oyunlarda çıkmayacak. Oynanmış sorular silinmez; istediğiniz zaman yeniden aktifleştirebilirsiniz.`} confirmLabel="Pasife al" danger loading={busy} onConfirm={deactivate} />
        </div>
    );
}
