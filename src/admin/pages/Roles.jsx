import React, { useState } from 'react';
import { FaPen, FaPlus, FaTrash, FaUsers } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, Field, Input, Modal, PageHeader, Skeleton, Textarea } from '../../panel/ui';

export default function Roles() {
    const toast = useToast();
    const list = useQuery(() => adminApi.roles(), []);
    const roles = list.data?.roles || list.data || [];
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ name: '', slug: '', description: '' });
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [membersOf, setMembersOf] = useState(null);
    const members = useQuery(() => adminApi.roleUsers(membersOf?.id), [membersOf?.id], { enabled: !!membersOf });

    const open = (r) => { setForm({ name: r?.name || '', slug: r?.slug || '', description: r?.description || '' }); setEditing(r || {}); };
    const save = async () => {
        setBusy(true);
        try { const res = editing.id ? await adminApi.updateRole(editing.id, form) : await adminApi.createRole(form); toast.success(res.data?.message || 'Kaydedildi.'); setEditing(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };
    const remove = async () => {
        setBusy(true);
        try { await adminApi.deleteRole(confirm.id); toast.success('Rol silindi.'); setConfirm(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const columns = [
        { key: 'name', label: 'Rol', render: (r) => <span className="inline-flex items-center gap-2"><b>{r.name}</b>{r.is_system && <Badge size="xs">sistem</Badge>}</span> },
        { key: 'slug', label: 'Slug', render: (r) => <code className="text-xs">{r.slug}</code> },
        { key: 'description', label: 'Açıklama', render: (r) => <span className="text-xs p-muted">{r.description || '—'}</span> },
        { key: 'users_count', label: 'Üye', width: 80, align: 'right', render: (r) => r.users_count ?? '—' },
        { key: '_', label: '', width: 220, render: (r) => <div className="flex gap-1 justify-end"><Button size="xs" variant="ghost" icon={FaUsers} onClick={() => setMembersOf(r)}>Üyeler</Button><Button size="xs" variant="secondary" icon={FaPen} onClick={() => open(r)}>Düzenle</Button><Button size="xs" variant="danger" icon={FaTrash} disabled={r.is_system} onClick={() => setConfirm(r)}>Sil</Button></div> },
    ];

    return (
        <div>
            <PageHeader title="Roller" description="Sistem rolleri (super_admin, admin, moderator, user) silinemez; yetkileri koddan gelir." actions={<Button size="sm" variant="primary" icon={FaPlus} onClick={() => open(null)}>Yeni rol</Button>} />
            <Card padded={false}><DataTable columns={columns} rows={roles} loading={list.loading} error={list.error} onRetry={list.refetch} dense /></Card>

            <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Rolü düzenle' : 'Yeni rol'} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={save} disabled={!form.name.trim()}>Kaydet</Button></>}>
                <div className="space-y-3">
                    <Field label="Ad *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                    <Field label="Slug" hint="Küçük harf, alt çizgi"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} disabled={!!editing?.is_system} /></Field>
                    <Field label="Açıklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                </div>
            </Modal>
            <Modal open={!!membersOf} onClose={() => setMembersOf(null)} title={`${membersOf?.name} üyeleri`}>
                {members.loading ? <Skeleton className="h-24" /> : (
                    <ul className="divide-y divide-[var(--p-border)]">
                        {(members.data?.users || members.data?.items || []).map((u) => <li key={u.id} className="py-2 flex items-center gap-3 text-sm"><Avatar user={u} size={28} /><span>{u.username}</span><span className="ml-auto text-xs p-muted">{u.email}</span></li>)}
                        {!(members.data?.users || members.data?.items || []).length && <li className="py-6 text-center text-xs p-muted">Üye yok.</li>}
                    </ul>
                )}
            </Modal>
            <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title="Rol silinsin mi?" message={`"${confirm?.name}" silinecek; bu roldeki kullanıcılar rolü kaybeder.`} confirmLabel="Sil" danger loading={busy} onConfirm={remove} />
        </div>
    );
}
