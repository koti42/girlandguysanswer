import React, { useState } from 'react';
import { FaPen } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Button, Card, DataTable, Field, Input, Modal, PageHeader, Switch } from '../../panel/ui';

export default function SpecialDays() {
    const toast = useToast();
    const list = useQuery(() => adminApi.specialDays(), []);
    const items = list.data?.items || list.data?.special_days || list.data || [];
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({});
    const [busy, setBusy] = useState(false);

    const toggle = async (row) => {
        try { await adminApi.toggleSpecialDay(row.id); toast.success(`${row.label} ${row.is_active ? 'kapatıldı' : 'açıldı'}.`); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); }
    };
    const save = async () => {
        setBusy(true);
        try { await adminApi.updateSpecialDay(editing.id, form); toast.success('Kaydedildi.'); setEditing(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const columns = [
        { key: 'emoji', label: '', width: 50, render: (r) => <span className="text-xl">{r.emoji}</span> },
        { key: 'label', label: 'Gün', render: (r) => <div><b>{r.label}</b><div className="text-xs p-muted">{r.short_label} · <code>{r.key}</code></div></div> },
        { key: 'badge_emoji', label: 'Rozet', width: 80, render: (r) => <span className="text-lg">{r.badge_emoji}</span> },
        { key: 'color', label: 'Renk', width: 110, render: (r) => <span className="inline-flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full" style={{ background: r.color }} /><code className="text-xs">{r.color}</code></span> },
        { key: 'is_active', label: 'Aktif', width: 90, render: (r) => <Switch checked={!!r.is_active} onChange={() => toggle(r)} /> },
        { key: '_', label: '', width: 110, render: (r) => <Button size="xs" variant="secondary" icon={FaPen} onClick={() => { setForm({ label: r.label, short_label: r.short_label, emoji: r.emoji, badge_emoji: r.badge_emoji, color: r.color }); setEditing(r); }}>Düzenle</Button> },
    ];

    return (
        <div>
            <PageHeader title="Özel günler" description="Açık olan gün, avatarlarda rozet ve sitede tema olarak görünür. Aynı anda birden fazla açılabilir." />
            <Card padded={false}><DataTable columns={columns} rows={items} loading={list.loading} error={list.error} onRetry={list.refetch} dense /></Card>
            <Modal open={!!editing} onClose={() => setEditing(null)} title={`${editing?.label} düzenle`} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save}>Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ad"><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></Field>
                    <Field label="Kısa ad"><Input value={form.short_label || ''} onChange={(e) => setForm({ ...form, short_label: e.target.value })} /></Field>
                    <Field label="Emoji"><Input value={form.emoji || ''} onChange={(e) => setForm({ ...form, emoji: e.target.value })} /></Field>
                    <Field label="Rozet emoji"><Input value={form.badge_emoji || ''} onChange={(e) => setForm({ ...form, badge_emoji: e.target.value })} /></Field>
                    <Field label="Renk" className="sm:col-span-2"><div className="flex gap-2"><input type="color" value={form.color || '#E30A17'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent border border-[var(--p-border)] p-1" aria-label="Renk" /><Input value={form.color || ''} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div></Field>
                </div>
            </Modal>
        </div>
    );
}
