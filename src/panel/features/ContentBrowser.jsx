import React, { useEffect, useState } from 'react';
import { FaEye, FaEyeSlash, FaTrash, FaTrashRestore } from 'react-icons/fa';
import { modApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { usePagedQuery } from '../hooks/useQuery';
import { useToast } from '../hooks/useToast';
import { Avatar, Badge, Button, Card, DataTable, Drawer, ReasonDialog, SearchInput, Select, Tabs, Timeline } from '../ui';
import { CONTENT_LABELS, CONTENT_TYPES } from '../lib/moderation';
import { relativeTime, truncate } from '../lib/format';
import ContentActions from './ContentActions';
import ContentPreview from './ContentPreview';
import { emptySelection } from '../ui/selection';

/**
 * Tüm içerik türleri için tek tarayıcı: tür sekmeleri, durum filtresi,
 * arama, çoklu seçim + toplu işlem, satıra tıklayınca detay çekmecesi.
 */
export default function ContentBrowser({ initialType = 'question', userId = null }) {
    const toast = useToast();
    const [type, setType] = useState(initialType);
    const [state, setState] = useState('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('newest');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [selection, setSelection] = useState(emptySelection());
    const [openId, setOpenId] = useState(null);
    const [bulkDialog, setBulkDialog] = useState(null);
    const [busy, setBusy] = useState(false);

    const list = usePagedQuery(() => modApi.content(type, { state, search, sort, page, per_page: perPage, user_id: userId }), [type, state, search, sort, page, perPage, userId]);
    useEffect(() => { setPage(1); setSelection(emptySelection()); }, [type, state, search, sort, perPage]);

    const patchRow = (updated) => {
        if (!updated) { list.refetch(); return; }
        list.setData((d) => d ? { ...d, items: d.items.map((i) => i.id === updated.id ? { ...i, ...updated, is_hidden: !!(updated.hidden_at && (!updated.hidden_until || new Date(updated.hidden_until) > new Date())), is_removed: !!updated.deleted_at } : i) } : d);
    };

    const bulk = async ({ reason, minutes }) => {
        setBusy(true);
        try {
            const res = await modApi.bulkContent(type, { ids: [...selection], action: bulkDialog, reason, minutes: minutes ?? undefined });
            toast.success(res.data?.message);
            if (res.data?.data?.failed?.length) toast.warning(`${res.data.data.failed.length} kayıt atlandı.`);
            setBulkDialog(null);
            setSelection(emptySelection());
            list.refetch();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const columns = [
        { key: 'user', label: 'Kullanıcı', width: 170, render: (r) => r.user ? <span className="inline-flex items-center gap-2 min-w-0"><Avatar user={r.user} size={24} /><span className="truncate">{r.user.username}</span></span> : <span className="p-muted">—</span> },
        { key: 'excerpt', label: 'İçerik', render: (r) => <div className="min-w-0"><div className="font-medium truncate max-w-[36ch]">{r.title || truncate(r.excerpt, 60)}</div>{r.title && <div className="text-xs p-muted truncate max-w-[40ch]">{truncate(r.excerpt, 70)}</div>}</div> },
        { key: 'state', label: 'Durum', width: 150, render: (r) => <span className="flex gap-1 flex-wrap">{r.is_removed ? <Badge tone="danger">Kaldırıldı</Badge> : r.is_hidden ? <Badge tone="warning">Gizli</Badge> : <Badge tone="success">Görünür</Badge>}{r.pending_reports > 0 && <Badge tone="danger">{r.pending_reports} şikâyet</Badge>}</span> },
        { key: 'created_at', label: 'Tarih', width: 110, nowrap: true, render: (r) => <span className="text-xs p-muted">{relativeTime(r.created_at)}</span> },
        { key: 'actions', label: '', width: 200, render: (r) => <ContentActions type={type} item={r} onChanged={patchRow} /> },
    ];

    const openItem = list.items.find((i) => i.id === openId);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Tabs items={CONTENT_TYPES.map((t) => ({ key: t, label: CONTENT_LABELS[t] }))} value={type} onChange={setType} />
                <Tabs size="sm" items={[{ key: 'all', label: 'Tümü' }, { key: 'visible', label: 'Görünür' }, { key: 'hidden', label: 'Gizli' }, { key: 'reported', label: 'Şikâyetli' }, { key: 'removed', label: 'Kaldırılan' }]} value={state} onChange={setState} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Metinde ara…" className="w-full sm:w-72" />
                <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto" aria-label="Sıralama">
                    <option value="newest">En yeni</option><option value="oldest">En eski</option><option value="reported">Çok şikâyetli</option>
                </Select>
                {selection.size > 0 && (
                    <div className="ml-auto flex items-center gap-2 text-xs rounded-xl p-fill px-3 py-2">
                        <b>{selection.size} seçili</b>
                        <Button size="xs" variant="warning" icon={FaEyeSlash} onClick={() => setBulkDialog('hide')}>Gizle</Button>
                        <Button size="xs" variant="success" icon={FaEye} onClick={() => setBulkDialog('unhide')}>Göster</Button>
                        <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setBulkDialog('remove')}>Kaldır</Button>
                        <Button size="xs" variant="secondary" icon={FaTrashRestore} onClick={() => setBulkDialog('restore')}>Geri al</Button>
                    </div>
                )}
            </div>
            <Card padded={false}>
                <DataTable
                    columns={columns} rows={list.items} loading={list.loading} error={list.error} onRetry={list.refetch}
                    selectable selection={selection} onSelectionChange={setSelection}
                    onRowClick={(r) => setOpenId(r.id)}
                    rowTone={(r) => r.is_removed ? 'muted' : r.pending_reports >= 3 ? 'danger' : r.is_hidden ? 'warning' : undefined}
                    pagination={list.pagination} onPage={setPage} perPage={perPage} onPerPage={setPerPage}
                />
            </Card>

            <Drawer open={!!openItem} onClose={() => setOpenId(null)} title={`${CONTENT_LABELS[type]} detayı`} subtitle={openItem?.user && `@${openItem.user.username} · ${relativeTime(openItem.created_at)}`}
                footer={openItem && <ContentActions type={type} item={openItem} size="sm" onChanged={(u) => { patchRow(u); }} />}>
                {openItem && <ItemDetail type={type} id={openItem.id} fallback={openItem} />}
            </Drawer>

            <ReasonDialog open={!!bulkDialog} onClose={() => setBulkDialog(null)} title={`${selection.size} içerik: ${({ hide: 'gizle', unhide: 'göster', remove: 'kaldır', restore: 'geri al' })[bulkDialog]}`}
                submitLabel="Uygula" danger={bulkDialog === 'remove'} withDuration={bulkDialog === 'hide'} loading={busy}
                presets={['unhide', 'restore'].includes(bulkDialog) ? ['İnceleme sonrası uygun bulundu', 'Yanlışlıkla işlenmiş'] : undefined}
                onSubmit={bulk} />
        </div>
    );
}

function ItemDetail({ type, id, fallback }) {
    const [data, setData] = useState(null);
    useEffect(() => {
        let alive = true;
        setData(null);
        modApi.contentItem(type, id).then((r) => { if (alive) setData(r.data.data); }).catch(() => { if (alive) setData({ content: fallback, complaints: [], actions: [] }); });
        return () => { alive = false; };
    }, [type, id, fallback]);

    if (!data) return <div className="space-y-3"><div className="h-24 animate-pulse rounded-lg p-fill" /></div>;
    return (
        <div className="space-y-5">
            <ContentPreview type={type} item={data.content} full />
            {data.content?.hidden_reason && <p className="text-xs rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">Gizleme sebebi: {data.content.hidden_reason}</p>}
            {data.content?.removed_reason && <p className="text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">Kaldırma sebebi: {data.content.removed_reason}</p>}
            <section><h4 className="text-xs font-semibold p-muted mb-2">Şikâyetler ({data.complaints?.length || 0})</h4>
                {data.complaints?.length ? <ul className="space-y-1.5 text-xs">{data.complaints.map((c) => <li key={c.id} className="rounded-lg p-fill px-3 py-2 flex gap-2"><Badge tone={c.status === 'pending' ? 'warning' : c.status === 'accepted' ? 'success' : 'neutral'} size="xs">{c.status}</Badge><span className="truncate">{c.reason} · @{c.reporter?.username}</span><span className="ml-auto p-muted">{relativeTime(c.created_at)}</span></li>)}</ul> : <p className="text-xs p-muted">Şikâyet yok.</p>}
            </section>
            <section><h4 className="text-xs font-semibold p-muted mb-2">İşlem geçmişi</h4><Timeline items={data.actions || []} showTarget={false} /></section>
        </div>
    );
}
