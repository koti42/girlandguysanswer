import React, { useState } from 'react';
import { FaPen, FaPlus, FaTrash } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { errorMessage } from '../../../panel/api/client';
import { useQuery } from '../../../panel/hooks/useQuery';
import { useToast } from '../../../panel/hooks/useToast';
import { Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, Switch, Textarea } from '../../../panel/ui';
import { formatDate, formatNumber } from '../../../panel/lib/format';
import { dateOnly, fieldErrors, listOf, toPagination } from './gameUtils';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
const EMPTY = { option_a: '', option_b: '', topic: '', publish_date: '', is_active: true };

/** İkilemler: liste + ekle/düzenle/sil. publish_date verilirse o günün ikilemi olur. */
export default function GameDilemmas() {
    const toast = useToast();
    const [page, setPage] = useState(1);
    const list = useQuery(() => gameAdminApi.dilemmas({ page }), [page]);
    const rows = listOf(list.data, 'dilemmas', 'items');
    const pagination = list.data?.pagination ? toPagination(list.data.pagination, rows.length) : undefined;

    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const t = today();

    const open = (d) => {
        setErrors({});
        setForm(d ? { option_a: d.option_a || '', option_b: d.option_b || '', topic: d.topic || '', publish_date: dateOnly(d.publish_date), is_active: d.is_active !== false && d.is_active !== 0 } : EMPTY);
        setEditing(d || {});
    };

    const save = async () => {
        const errs = {};
        if (!form.option_a.trim()) errs.option_a = 'A seçeneği gerekli.';
        if (!form.option_b.trim()) errs.option_b = 'B seçeneği gerekli.';
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const body = { option_a: form.option_a.trim(), option_b: form.option_b.trim(), topic: form.topic.trim() || null, publish_date: form.publish_date || null, is_active: !!form.is_active };
        setBusy(true);
        try {
            const r = editing?.id ? await gameAdminApi.updateDilemma(editing.id, body) : await gameAdminApi.createDilemma(body);
            toast.success(r?.data?.message || 'İkilem kaydedildi.');
            setEditing(null);
            list.refetch();
        } catch (e) {
            const fe = fieldErrors(e);
            if (fe) setErrors(fe);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const toggle = async (d, v) => {
        try { const r = await gameAdminApi.updateDilemma(d.id, { is_active: v }); toast.success(r?.data?.message || 'Kaydedildi.'); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); }
    };

    const remove = async () => {
        setBusy(true);
        try { const r = await gameAdminApi.deleteDilemma(confirmDelete.id); toast.success(r?.data?.message || 'İkilem silindi.'); setConfirmDelete(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const votes = (d) => d.votes_count ?? d.total_votes ?? d.results?.total;

    const columns = [
        { key: 'options', label: 'İkilem', render: (d) => (
            <div className="min-w-[220px] text-sm leading-snug">
                <div className="flex gap-2"><b className="p-tone-info shrink-0">A</b><span className="break-words">{d.option_a}</span></div>
                <div className="flex gap-2 mt-0.5"><b className="p-tone-warning shrink-0">B</b><span className="break-words">{d.option_b}</span></div>
            </div>
        ) },
        { key: 'topic', label: 'Konu', width: 110, render: (d) => (d.topic ? <Badge size="xs">{d.topic}</Badge> : <span className="p-muted">—</span>) },
        { key: 'publish_date', label: 'Yayın', width: 120, nowrap: true, render: (d) => {
            const pd = dateOnly(d.publish_date);
            if (!pd) return <span className="text-xs p-muted">havuzda</span>;
            return <span className="inline-flex flex-col text-xs">{formatDate(pd)}{pd === t && <Badge size="xs" tone="accent" className="mt-0.5 self-start">bugün</Badge>}</span>;
        } },
        { key: 'votes', label: 'Oy', width: 70, align: 'right', render: (d) => (votes(d) !== undefined ? formatNumber(votes(d)) : <span className="p-muted">—</span>) },
        { key: 'is_active', label: 'Aktif', width: 80, render: (d) => <Switch checked={d.is_active !== false && d.is_active !== 0} onChange={(v) => toggle(d, v)} /> },
        { key: '_', label: '', width: 150, render: (d) => (
            <div className="flex gap-1 justify-end">
                <Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(d)}>Düzenle</Button>
                <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setConfirmDelete(d)} aria-label="Sil" />
            </div>
        ) },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs p-muted flex-1 min-w-[200px]">Yayın tarihi olan ikilem o günün ikilemi olur; tarihsizler "sıradaki ikilem" havuzundan rastgele gelir.</p>
                <Button size="sm" variant="primary" icon={FaPlus} onClick={() => open(null)}>Yeni ikilem</Button>
            </div>

            <Card padded={false}>
                <DataTable columns={columns} rows={rows} loading={list.loading} error={list.error} onRetry={list.refetch} dense
                    rowTone={(d) => (d.is_active === false || d.is_active === 0 ? 'muted' : undefined)}
                    pagination={pagination} onPage={setPage}
                    empty={<p className="py-10 text-center text-xs p-muted">Henüz ikilem yok.</p>} />
            </Card>

            <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title={editing?.id ? 'İkilemi düzenle' : 'Yeni ikilem'} width="max-w-xl"
                footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save}>Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="A seçeneği *" className="sm:col-span-2" error={errors.option_a}><Textarea rows={2} value={form.option_a} onChange={(e) => setForm({ ...form, option_a: e.target.value })} maxLength={500} /></Field>
                    <Field label="B seçeneği *" className="sm:col-span-2" error={errors.option_b}><Textarea rows={2} value={form.option_b} onChange={(e) => setForm({ ...form, option_b: e.target.value })} maxLength={500} /></Field>
                    <Field label="Konu" hint="ör. yasam, iliski, yemek" error={errors.topic}><Input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} maxLength={50} /></Field>
                    <Field label="Yayın tarihi" hint="Boş bırakılırsa rastgele havuzda kalır." error={errors.publish_date}><Input type="date" value={form.publish_date} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} /></Field>
                    <div className="sm:col-span-2"><Switch checked={!!form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Aktif" /></div>
                </div>
            </Modal>

            <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="İkilem silinsin mi?" message={`"${confirmDelete?.option_a || ''}" / "${confirmDelete?.option_b || ''}" ve oyları silinecek. Yalnızca gizlemek için "Aktif" anahtarını kapatın.`} confirmLabel="Sil" danger loading={busy} onConfirm={remove} />
        </div>
    );
}
