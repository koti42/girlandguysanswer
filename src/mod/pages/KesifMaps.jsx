import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaCube, FaFlag, FaHeart, FaPlay, FaShieldAlt, FaSync } from 'react-icons/fa';
import { modApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { usePanelAuth } from '../../panel/auth/PanelAuthContext';
import { MOD_DATA_CHANGED, emit } from '../../panel/lib/events';
import { formatNumber, relativeTime } from '../../panel/lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Pagination, ReasonDialog, SearchInput, Select, Skeleton, Tabs } from '../../panel/ui';
import KesifMapDrawer from './KesifMapDrawer';
import { HIDE_PRESETS, REMOVE_PRESETS, SORTS, reasonSummary, statusMeta, withStatus } from './kesifMapsUtils';

/*
 * Keşif haritaları moderasyonu (Google Play UGC: raporlanan içerik personelce incelenebilmeli).
 * Moderatör + admin: listele, incele, gizle, yeniden aç, raporları işlendi say (toplu dahil).
 * Yalnızca admin: Kaldır (kalıcı). Her işlem sunucuda denetim kaydına yazılır; gizle/kaldır gerekçe ister.
 */
const PER_PAGE = 24;
const TAB_PARAMS = {
    reported: { reported: 1 },
    hidden: { status: 'hidden' },
    removed: { status: 'removed' },
    all: {},
};

function MapCardRow({ map, selected, onSelect, onOpen, active }) {
    const st = statusMeta(map);
    const reasons = reasonSummary(map.reason_counts);
    return (
        <li className={`rounded-2xl p-surface overflow-hidden flex flex-col border ${active ? 'border-[var(--p-accent)]' : 'border-transparent'}`} data-testid={`kesif-card-${map.id}`}>
            <div className="relative">
                <button type="button" onClick={() => onOpen(map)} className="block w-full aspect-video p-fill grid place-items-center p-ring" aria-label={`İncele: ${map.title}`}>
                    {map.cover ? <img src={map.cover} alt="" loading="lazy" className="w-full h-full object-cover" /> : <FaCube className="text-2xl p-muted" aria-hidden />}
                </button>
                <label className="absolute left-2 top-2 h-7 w-7 rounded-md bg-black/55 grid place-items-center cursor-pointer">
                    <input type="checkbox" checked={selected} onChange={() => onSelect(map.id)} aria-label={`Seç: ${map.title}`} className="h-4 w-4 accent-[var(--p-accent)]" />
                </label>
                <div className="absolute right-2 top-2 flex gap-1.5">
                    {map.reports_open > 0 && <Badge tone="danger" dot>{map.reports_open} rapor</Badge>}
                </div>
            </div>
            <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => onOpen(map)} className="min-w-0 text-left font-semibold text-sm truncate hover:underline p-ring rounded" title={map.title}>{map.title}</button>
                    <Badge tone={st.tone} size="xs" className="ml-auto">{st.label}</Badge>
                </div>
                <div className="text-xs p-muted flex items-center gap-1.5 flex-wrap">
                    {map.author?.id ? <Link to={`/mod/users/${map.author.id}`} className="font-medium text-[var(--p-text)] hover:underline">@{map.author.username}</Link> : <span>yazar yok</span>}
                    <span aria-hidden>·</span><span>{relativeTime(map.created_at)}</span>
                </div>
                {reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1" data-testid="kesif-reasons">
                        {reasons.map((r) => <Badge key={r.key} tone="warning" size="xs">{r.label} ×{r.count}</Badge>)}
                    </div>
                )}
                <div className="mt-auto pt-1 flex items-center gap-3 text-[11px] p-muted tabular-nums">
                    <span className="inline-flex items-center gap-1" title="Oynanma"><FaPlay aria-hidden />{formatNumber(map.plays)}</span>
                    <span className="inline-flex items-center gap-1" title="Beğeni"><FaHeart aria-hidden />{formatNumber(map.likes)}</span>
                    <span className="inline-flex items-center gap-1" title="Toplam rapor"><FaFlag aria-hidden />{formatNumber(map.reports)}</span>
                    <span className="ml-auto">{formatNumber(map.block_count)} blok</span>
                </div>
            </div>
        </li>
    );
}

export default function KesifMaps() {
    const toast = useToast();
    const { isAdmin } = usePanelAuth();
    const [tab, setTab] = useState('reported');
    const [q, setQ] = useState('');
    const [visibility, setVisibility] = useState('');
    const [sort, setSort] = useState('reports');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [dialog, setDialog] = useState(null); // { type: hide|remove|restore|handle|bulk, map? }
    const [busy, setBusy] = useState(false);
    const lock = useRef(false);

    const list = useQuery(
        () => modApi.kesifMaps({ ...TAB_PARAMS[tab], q, visibility, sort, page, per_page: PER_PAGE }),
        [tab, q, visibility, sort, page]
    );
    const maps = useMemo(() => list.data?.maps || [], [list.data]);
    const counts = list.data?.counts || {};
    const pagination = list.data?.pagination ? { ...list.data.pagination, total_pages: list.data.pagination.total_pages ?? list.data.pagination.last_page } : { current_page: 1, total_pages: 1, total: maps.length };

    useEffect(() => { setPage(1); setSelected([]); }, [tab, q, visibility, sort]);

    const row = useMemo(() => maps.find((m) => m.id === activeId) || null, [maps, activeId]);
    const detail = useQuery(() => modApi.kesifMap(activeId), [activeId], { enabled: !!activeId });
    const detailBody = detail.data && detail.data.map?.id === activeId ? detail.data : null;

    const tabs = useMemo(() => [
        { key: 'reported', label: counts.reported != null ? `Raporlu (${counts.reported})` : 'Raporlu' },
        { key: 'hidden', label: counts.hidden != null ? `Gizli (${counts.hidden})` : 'Gizli' },
        { key: 'removed', label: counts.removed != null ? `Kaldırılan (${counts.removed})` : 'Kaldırılan' },
        { key: 'all', label: 'Tümü' },
    ], [counts.reported, counts.hidden, counts.removed]);

    const toggle = useCallback((id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);

    /** Satırı (ve açık ayrıntıyı) yerinde günceller; hata olursa geri almak için önceki değerleri döner. */
    const patch = useCallback((id, fn) => {
        list.setData((d) => (d ? { ...d, maps: d.maps.map((m) => (m.id === id ? fn(m) : m)) } : d));
        detail.setData((d) => (d && d.map?.id === id ? { ...d, map: fn(d.map) } : d));
    }, [list, detail]);

    const run = async (kind, map, body) => {
        if (lock.current || !map) return;
        lock.current = true;
        setBusy(true);
        const prevList = list.data;
        const prevDetail = detail.data;
        try {
            let res;
            if (kind === 'hide') { patch(map.id, (m) => withStatus(m, 'hidden')); res = await modApi.kesifHide(map.id, body); }
            else if (kind === 'remove') { patch(map.id, (m) => withStatus(m, 'removed')); res = await modApi.kesifRemove(map.id, body); }
            else if (kind === 'restore') { patch(map.id, (m) => withStatus(m, 'ok')); res = await modApi.kesifRestore(map.id, body); }
            else { patch(map.id, (m) => ({ ...m, reports_open: 0, reason_counts: {} })); res = await modApi.kesifHandleReports(map.id, body); }
            toast.success(res.data?.message || 'Güncellendi.');
            const server = res.data?.data?.map;
            if (server) patch(map.id, (m) => ({ ...m, ...server }));
            setDialog(null);
            emit(MOD_DATA_CHANGED);
            detail.refetch();
            list.refetch();
        } catch (e) {
            list.setData(prevList);
            detail.setData(prevDetail);
            toast.error(errorMessage(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    const bulkHandle = async () => {
        if (lock.current || selected.length === 0) return;
        lock.current = true;
        setBusy(true);
        const prev = list.data;
        const ids = selected.slice();
        list.setData((d) => (d ? { ...d, maps: d.maps.map((m) => (ids.includes(m.id) ? { ...m, reports_open: 0, reason_counts: {} } : m)) } : d));
        try {
            const res = await modApi.kesifBulkHandle({ ids });
            toast.success(res.data?.message || 'Raporlar işlendi.');
            setSelected([]);
            setDialog(null);
            emit(MOD_DATA_CHANGED);
            list.refetch();
        } catch (e) {
            list.setData(prev);
            toast.error(errorMessage(e));
        } finally {
            lock.current = false;
            setBusy(false);
        }
    };

    const onAction = (type, map) => setDialog({ type, map });
    const initial = list.loading && !list.data;

    return (
        <div>
            <PageHeader
                title="Keşif haritaları"
                description="Oyuncuların paylaştığı Keşif haritaları. Raporlanan haritaları incele; uygunsuz olanı gizle, gerekirse kaldır. Her işlem denetim kaydına yazılır."
                actions={<Button size="sm" icon={FaSync} onClick={list.refetch}>Yenile</Button>}
            />
            {counts.reported > 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm p-tone-danger" role="status" data-testid="kesif-alert">
                    <FaShieldAlt aria-hidden />
                    <span><b>{counts.reported}</b> haritada işlenmemiş rapor var. Çocuk güvenliğini ilgilendirenleri önce incele.</span>
                </div>
            )}

            <Card padded={false}>
                <div className="p-3 flex flex-wrap items-center gap-2 border-b border-[var(--p-border)]">
                    <Tabs size="sm" items={tabs} value={tab} onChange={setTab} />
                    <SearchInput value={q} onChange={setQ} placeholder="Başlık veya yazar ara…" className="w-full sm:w-64 sm:ml-auto" />
                    <Select value={visibility} onChange={(e) => setVisibility(e.target.value)} aria-label="Görünürlük" className="!w-auto h-9 text-xs">
                        <option value="">Tüm görünürlükler</option>
                        <option value="public">Herkese açık</option>
                        <option value="private">Özel</option>
                    </Select>
                    <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama" className="!w-auto h-9 text-xs">
                        {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </Select>
                </div>

                {selected.length > 0 && (
                    <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--p-border)] p-fill text-sm" data-testid="kesif-bulkbar">
                        <b>{selected.length}</b> harita seçili
                        <Button size="sm" icon={FaCheck} className="ml-auto" onClick={() => setDialog({ type: 'bulk' })} data-testid="kesif-bulk-handle">Raporları işlendi say</Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Seçimi temizle</Button>
                    </div>
                )}

                <div className="p-3" aria-busy={list.loading}>
                    {initial ? (
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5" data-testid="kesif-loading">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56" />)}</div>
                    ) : list.error && !list.data ? (
                        <ErrorState message={list.error} onRetry={list.refetch} />
                    ) : maps.length === 0 ? (
                        <EmptyState icon={FaCube} title={tab === 'reported' ? 'İşlenmemiş rapor yok' : 'Harita yok'} description={tab === 'reported' ? 'Raporlanan ve henüz incelenmemiş harita bulunmuyor.' : 'Bu filtrede harita bulunmuyor.'} />
                    ) : (
                        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5" data-testid="kesif-list">
                            {maps.map((m) => <MapCardRow key={m.id} map={m} selected={selected.includes(m.id)} onSelect={toggle} onOpen={(x) => setActiveId(x.id)} active={m.id === activeId} />)}
                        </ul>
                    )}
                </div>
                {pagination.total_pages > 1 && <Pagination pagination={pagination} onPage={setPage} />}
            </Card>

            <KesifMapDrawer
                open={!!activeId}
                onClose={() => setActiveId(null)}
                row={row}
                detail={detailBody}
                loading={detail.loading}
                error={detail.error}
                onRetry={detail.refetch}
                isAdmin={isAdmin}
                busy={busy}
                onAction={onAction}
            />

            <ReasonDialog
                open={dialog?.type === 'hide'}
                onClose={() => setDialog(null)}
                onSubmit={({ reason }) => run('hide', dialog.map, { reason })}
                loading={busy}
                title="Haritayı gizle"
                submitLabel="Gizle"
                description="Harita topluluk listesinden ve oyundan kalkar; sahibi “Gizlendi (inceleniyor)” görür. Yeniden açılabilir."
                presets={HIDE_PRESETS}
                maxLength={200}
                placeholder="Denetim kaydına yazılacak gerekçe (en az 3 karakter)"
            />
            <ReasonDialog
                open={dialog?.type === 'remove'}
                onClose={() => setDialog(null)}
                onSubmit={({ reason }) => run('remove', dialog.map, { reason })}
                loading={busy}
                danger
                title="Haritayı kaldır"
                submitLabel="Kalıcı olarak kaldır"
                description="Sahibi artık düzenleyemez veya yayınlayamaz ve harita hakkı geri açılmaz. Yalnızca yönetici yapabilir."
                presets={REMOVE_PRESETS}
                maxLength={200}
                placeholder="Denetim kaydına yazılacak gerekçe (en az 3 karakter)"
            />
            <ConfirmDialog
                open={dialog?.type === 'restore'}
                onClose={() => setDialog(null)}
                onConfirm={() => run('restore', dialog.map, {})}
                loading={busy}
                title="Haritayı yeniden aç"
                message={`“${dialog?.map?.title || ''}” yeniden görünür olur (yayında idiyse topluluk listesine döner). Açık raporlar işlenmiş sayılır.`}
                confirmLabel="Yeniden aç"
            />
            <ConfirmDialog
                open={dialog?.type === 'handle'}
                onClose={() => setDialog(null)}
                onConfirm={() => run('handle', dialog.map, {})}
                loading={busy}
                title="Raporları işlendi say"
                message={`“${dialog?.map?.title || ''}” için açık raporlar kapatılır; haritanın durumu değişmez. Sorun görmediysen kullan.`}
                confirmLabel="İşlendi say"
            />
            <ConfirmDialog
                open={dialog?.type === 'bulk'}
                onClose={() => setDialog(null)}
                onConfirm={bulkHandle}
                loading={busy}
                title="Seçili haritaların raporlarını işlendi say"
                message={`${selected.length} haritanın açık raporları kapatılır; haritaların durumu değişmez. Her harita için denetim kaydı yazılır.`}
                confirmLabel="İşlendi say"
            />
        </div>
    );
}
