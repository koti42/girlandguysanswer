import React, { useEffect, useState } from 'react';
import { FaDoorClosed, FaDoorOpen, FaTrash } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { usePagedQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, DataTable, PageHeader, ReasonDialog, SearchInput, Select } from '../../panel/ui';
import { relativeTime } from '../../panel/lib/format';

export default function Communities() {
    const toast = useToast();
    const [search, setSearch] = useState('');
    const [active, setActive] = useState('');
    const [type, setType] = useState('');
    const [page, setPage] = useState(1);
    const [dialog, setDialog] = useState(null); // {kind, row}
    const [busy, setBusy] = useState(false);
    const list = usePagedQuery(() => adminApi.communities({ search, active, type, page, per_page: 25 }), [search, active, type, page]);
    useEffect(() => { setPage(1); }, [search, active, type]);

    const run = async (fn, ok) => {
        setBusy(true);
        try { const r = await fn(); toast.success(ok || r.data?.message); setDialog(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const columns = [
        { key: 'title', label: 'Oda', render: (c) => <div><div className="font-medium">{c.title}</div><div className="text-xs p-muted truncate max-w-[40ch]">{c.description || '—'}</div></div> },
        { key: 'owner', label: 'Sahip', render: (c) => c.owner && <span className="inline-flex items-center gap-2"><Avatar user={c.owner} size={22} />{c.owner.username}</span> },
        { key: 'type', label: 'Tür', width: 90, render: (c) => <Badge tone={c.type === 'voice' ? 'info' : 'neutral'}>{c.type === 'voice' ? 'Sesli' : 'Yazılı'}</Badge> },
        { key: 'participants_count', label: 'Katılımcı', width: 90, align: 'right' },
        { key: 'is_active', label: 'Durum', width: 100, render: (c) => <Badge tone={c.is_active ? 'success' : 'neutral'} dot>{c.is_active ? 'Açık' : 'Kapalı'}</Badge> },
        { key: 'created_at', label: 'Açılış', width: 110, render: (c) => <span className="text-xs p-muted">{relativeTime(c.created_at)}</span> },
        { key: 'actions', label: '', width: 220, render: (c) => (
            <div className="flex gap-1.5">
                {c.is_active ? <Button size="xs" variant="warning" icon={FaDoorClosed} onClick={() => setDialog({ kind: 'close', row: c })}>Kapat</Button>
                    : <Button size="xs" variant="success" icon={FaDoorOpen} loading={busy} onClick={() => run(() => adminApi.reopenCommunity(c.uuid), 'Oda açıldı.')}>Aç</Button>}
                <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setDialog({ kind: 'delete', row: c })}>Sil</Button>
            </div>
        ) },
    ];

    return (
        <div>
            <PageHeader title="Topluluk odaları" description="Sesli ve yazılı odalar; kapatılan oda kalır ama girilemez.">
                <div className="flex flex-wrap gap-2">
                    <SearchInput value={search} onChange={setSearch} placeholder="Oda adı" className="w-full sm:w-64" />
                    <Select value={active} onChange={(e) => setActive(e.target.value)} className="w-auto"><option value="">Hepsi</option><option value="true">Açık</option><option value="false">Kapalı</option></Select>
                    <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto"><option value="">Tür</option><option value="voice">Sesli</option><option value="text">Yazılı</option></Select>
                </div>
            </PageHeader>
            <Card padded={false}><DataTable columns={columns} rows={list.items} loading={list.loading} error={list.error} onRetry={list.refetch} pagination={list.pagination} onPage={setPage} /></Card>
            <ReasonDialog open={dialog?.kind === 'close'} onClose={() => setDialog(null)} title={`"${dialog?.row?.title}" kapatılsın mı?`} submitLabel="Kapat" loading={busy} presets={['Kural ihlali', 'Sahibi talep etti', 'Etkin değil']} onSubmit={({ reason }) => run(() => adminApi.closeCommunity(dialog.row.uuid, { reason }), 'Oda kapatıldı.')} />
            <ReasonDialog open={dialog?.kind === 'delete'} onClose={() => setDialog(null)} title={`"${dialog?.row?.title}" silinsin mi?`} description="Geri alınamaz; mesajlar ve katılımcılar da silinir." submitLabel="Sil" danger loading={busy} presets={['Kural ihlali', 'Spam oda']} onSubmit={({ reason }) => run(() => adminApi.deleteCommunity(dialog.row.uuid, { reason }), 'Oda silindi.')} />
        </div>
    );
}
