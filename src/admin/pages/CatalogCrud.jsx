import React, { useState } from 'react';
import { FaArrowDown, FaArrowUp, FaPen, FaPlus, FaTrash } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, Select, Switch, Textarea } from '../../panel/ui';

/**
 * Küçük referans tabloları için tek CRUD: sütunlar ve form alanları şema ile
 * verilir. fields: [{ key, label, type: text|number|color|textarea|switch|select, options?, required?, hint? }]
 */
export default function CatalogCrud({ type, title, description, fields, columns, sortable = false, usageKey, emptyText }) {
    const toast = useToast();
    const list = useQuery(() => adminApi.catalog(type), [type]);
    const items = list.data?.items || [];
    const [editing, setEditing] = useState(null); // null | {} (new) | item
    const [form, setForm] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const open = (item) => {
        const base = {};
        fields.forEach((f) => { base[f.key] = item?.[f.key] ?? (f.type === 'switch' ? true : f.type === 'number' ? 0 : ''); });
        setForm(base); setErrors({}); setEditing(item || {});
    };

    const save = async () => {
        setBusy(true); setErrors({});
        try {
            const payload = {};
            fields.forEach((f) => { payload[f.key] = f.type === 'number' ? Number(form[f.key]) : form[f.key]; });
            const r = editing?.id ? await adminApi.updateCatalog(type, editing.id, payload) : await adminApi.createCatalog(type, payload);
            toast.success(r.data?.message); setEditing(null); list.refetch();
        } catch (e) {
            const errs = e.response?.data?.errors;
            if (errs) setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v[0]])));
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const remove = async () => {
        setBusy(true);
        try { const r = await adminApi.deleteCatalog(type, confirmDelete.id); toast.success(r.data?.message); setConfirmDelete(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const move = async (idx, dir) => {
        const ids = items.map((i) => i.id);
        const j = idx + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[idx], ids[j]] = [ids[j], ids[idx]];
        try { await adminApi.reorderCatalog(type, ids); list.refetch(); } catch (e) { toast.error(errorMessage(e)); }
    };

    const cols = [
        ...columns,
        ...(usageKey ? [{ key: usageKey, label: 'Kullanım', width: 100, align: 'right', render: (r) => <Badge tone={r[usageKey] > 0 ? 'info' : 'neutral'}>{r[usageKey] ?? 0}</Badge> }] : []),
        { key: '_actions', label: '', width: sortable ? 200 : 140, render: (r) => (
            <div className="flex gap-1 justify-end">
                {sortable && <><Button size="xs" variant="ghost" icon={FaArrowUp} onClick={() => move(items.indexOf(r), -1)} aria-label="Yukarı" /><Button size="xs" variant="ghost" icon={FaArrowDown} onClick={() => move(items.indexOf(r), 1)} aria-label="Aşağı" /></>}
                <Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(r)}>Düzenle</Button>
                <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setConfirmDelete(r)} disabled={usageKey && r[usageKey] > 0} title={usageKey && r[usageKey] > 0 ? 'Kullanımda; silinemez' : undefined}>Sil</Button>
            </div>
        ) },
    ];

    return (
        <Card title={title} subtitle={description} padded={false} actions={<Button size="sm" variant="primary" icon={FaPlus} onClick={() => open(null)}>Yeni</Button>}>
            <DataTable columns={cols} rows={items} loading={list.loading} error={list.error} onRetry={list.refetch} dense empty={<p className="py-10 text-center text-xs p-muted">{emptyText || 'Kayıt yok.'}</p>} />

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Düzenle' : 'Yeni kayıt'} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save}>Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    {fields.map((f) => (
                        <div key={f.key} className={f.type === 'textarea' || f.full ? 'sm:col-span-2' : ''}>
                            {f.type === 'switch' ? (
                                <Switch checked={!!form[f.key]} onChange={(v) => setForm({ ...form, [f.key]: v })} label={f.label} description={f.hint} />
                            ) : (
                                <Field label={f.label + (f.required ? ' *' : '')} hint={f.hint} error={errors[f.key]}>
                                    {f.type === 'textarea' ? <Textarea value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                                        : f.type === 'select' ? <Select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
                                            : f.type === 'color' ? <div className="flex gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(form[f.key] || '') ? form[f.key] : '#6366f1'} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent border border-[var(--p-border)] p-1" aria-label={f.label} /><Input value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder="#RRGGBB" /></div>
                                                : <Input type={f.type === 'number' ? 'number' : 'text'} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />}
                                </Field>
                            )}
                        </div>
                    ))}
                </div>
            </Modal>

            <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Silinsin mi?" message={`"${confirmDelete?.name || confirmDelete?.action_key}" kalıcı olarak silinecek.`} confirmLabel="Sil" danger loading={busy} onConfirm={remove} />
        </Card>
    );
}
