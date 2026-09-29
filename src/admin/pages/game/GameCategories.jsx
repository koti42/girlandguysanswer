import React, { useState } from 'react';
import { FaPen } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { errorMessage } from '../../../panel/api/client';
import { useQuery } from '../../../panel/hooks/useQuery';
import { useToast } from '../../../panel/hooks/useToast';
import { Badge, Button, Card, DataTable, Field, Input, Modal, Switch } from '../../../panel/ui';
import { colorCell } from '../../../panel/ui/cells';
import { fieldErrors, listOf } from './gameUtils';

const HEX = /^#[0-9a-f]{6}$/i;

/** Oyun kategorileri: ad, ikon, renk, sıra, aktiflik. Kategoriler seed ile gelir; burada yalnızca düzenlenir. */
export default function GameCategories() {
    const toast = useToast();
    const list = useQuery(() => gameAdminApi.categories(), []);
    const rows = [...listOf(list.data, 'categories', 'items')].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);

    const open = (c) => {
        setErrors({});
        setForm({ name: c.name || '', icon: c.icon || '', color: c.color || '', sort_order: c.sort_order ?? 0, is_active: c.is_active !== false && c.is_active !== 0 });
        setEditing(c);
    };

    const update = async (id, body, ok) => {
        setBusy(true);
        try {
            const r = await gameAdminApi.updateCategory(id, body);
            toast.success(r?.data?.message || ok);
            setEditing(null);
            list.refetch();
        } catch (e) {
            const fe = fieldErrors(e);
            if (fe) setErrors(fe);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const save = () => {
        if (!form.name.trim()) { setErrors({ name: 'Ad gerekli.' }); return; }
        if (form.color && !HEX.test(form.color)) { setErrors({ color: 'Renk #RRGGBB biçiminde olmalı.' }); return; }
        update(editing.id, { name: form.name.trim(), icon: form.icon.trim() || null, color: form.color || null, sort_order: Number(form.sort_order) || 0, is_active: !!form.is_active }, 'Kategori kaydedildi.');
    };

    const columns = [
        { key: 'name', label: 'Kategori', render: (c) => (
            <span className="inline-flex items-center gap-2 min-w-0">
                <span className="h-7 w-7 rounded-lg shrink-0 border border-[var(--p-border)]" style={{ background: HEX.test(c.color || '') ? c.color : 'transparent' }} aria-hidden />
                <span className="min-w-0"><b className="block truncate">{c.name}</b><code className="text-[11px] p-muted">{c.slug}</code></span>
            </span>
        ) },
        { key: 'icon', label: 'İkon', width: 120, render: (c) => (c.icon ? <code className="text-xs">{c.icon}</code> : <span className="p-muted">—</span>) },
        { key: 'color', label: 'Renk', width: 130, render: (c) => colorCell(c) },
        { key: 'question_count', label: 'Soru', width: 80, align: 'right', render: (c) => <Badge tone={(c.question_count ?? c.questions_count ?? 0) > 0 ? 'info' : 'neutral'}>{c.question_count ?? c.questions_count ?? 0}</Badge> },
        { key: 'sort_order', label: 'Sıra', width: 70, align: 'right' },
        { key: 'is_active', label: 'Aktif', width: 80, render: (c) => <Switch checked={c.is_active !== false && c.is_active !== 0} disabled={busy} onChange={(v) => update(c.id, { is_active: v }, v ? 'Kategori açıldı.' : 'Kategori kapatıldı.')} /> },
        { key: '_', label: '', width: 110, render: (c) => <div className="flex justify-end"><Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(c)}>Düzenle</Button></div> },
    ];

    return (
        <>
            <Card title="Kategoriler" subtitle="Kapalı kategori oyuncu arayüzünde listelenmez ve karışık oyunlara soru vermez. Sıra küçükten büyüğe." padded={false}>
                <DataTable columns={columns} rows={rows} loading={list.loading} error={list.error} onRetry={list.refetch} dense
                    rowTone={(c) => (c.is_active === false || c.is_active === 0 ? 'muted' : undefined)}
                    empty={<p className="py-10 text-center text-xs p-muted">Kategori yok. İçerik tohumlayıcısını çalıştırın (GameContentSeeder).</p>} />
            </Card>

            <Modal open={!!editing} onClose={() => !busy && setEditing(null)} title={`${editing?.name || ''} düzenle`} subtitle={editing?.slug}
                footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save}>Kaydet</Button></>}>
                <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Ad *" error={errors.name}><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} /></Field>
                    <Field label="İkon" hint="İkon anahtarı, ör. landmark" error={errors.icon}><Input value={form.icon || ''} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={50} /></Field>
                    <Field label="Renk" error={errors.color}>
                        <div className="flex gap-2">
                            <input type="color" value={HEX.test(form.color || '') ? form.color : '#6366f1'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent border border-[var(--p-border)] p-1 shrink-0" aria-label="Renk seç" />
                            <Input value={form.color || ''} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#RRGGBB" maxLength={7} />
                        </div>
                    </Field>
                    <Field label="Sıra" error={errors.sort_order}><Input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field>
                    <div className="sm:col-span-2"><Switch checked={!!form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Aktif" /></div>
                </div>
            </Modal>
        </>
    );
}
