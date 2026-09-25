import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaTimes, FaUserShield } from 'react-icons/fa';
import { modApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { usePagedQuery, useQuery } from '../hooks/useQuery';
import { useToast } from '../hooks/useToast';
import { useHotkeys } from '../hooks/useHotkeys';
import { Avatar, Badge, Button, Card, EmptyState, Kbd, ReasonDialog, SearchInput, Select, Tabs, Timeline, Skeleton } from '../ui';
import { COMPLAINT_STATUS, CONTENT_LABELS, RISK_TONE, urgencyOf } from '../lib/moderation';
import { hoursLabel, relativeTime, truncate } from '../lib/format';
import ContentPreview from './ContentPreview';
import UserActions from './UserActions';
import { emptySelection, toggleOne } from '../ui/selection';
import { MOD_DATA_CHANGED, emit } from '../lib/events';

/**
 * Şikâyet kuyruğu: sol liste + sağ detay. Her iki panelde de aynı bileşen;
 * mod paneli klavye ile, admin fareyle kullanır - ikisi de çalışır.
 *
 * Kısayollar: j/k gez · a kabul · r ret · h kabul+gizle · b kabul+ban · x seç
 */
export default function ComplaintQueue({ keyboard = true, initialStatus = 'pending' }) {
    const toast = useToast();
    const [status, setStatus] = useState(initialStatus);
    const [type, setType] = useState('');
    const [reason, setReason] = useState('');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('priority');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const [selection, setSelection] = useState(emptySelection());

    const list = usePagedQuery(() => modApi.complaints({ status, type, reason, search, sort, page, per_page: 30 }), [status, type, reason, search, sort, page]);
    const items = list.items;

    useEffect(() => { setPage(1); setSelection(emptySelection()); }, [status, type, reason, search, sort]);
    useEffect(() => { if (items.length && !items.some((i) => i.id === activeId)) setActiveId(items[0].id); }, [items, activeId]);

    const activeIndex = items.findIndex((i) => i.id === activeId);
    const move = (d) => { const n = Math.max(0, Math.min(items.length - 1, activeIndex + d)); if (items[n]) setActiveId(items[n].id); };

    const detail = useQuery(() => modApi.complaint(activeId), [activeId], { enabled: !!activeId });
    const complaint = detail.data?.complaint;

    const [dialog, setDialog] = useState(null); // {status, action?}
    const [busy, setBusy] = useState(false);

    const resolve = async (body) => {
        if (!activeId) return;
        setBusy(true);
        try {
            const res = await modApi.resolveComplaint(activeId, body);
            toast.success(res.data?.message || 'Karara bağlandı.');
            setDialog(null);
            // Listeden düş, sıradakine geç.
            const next = items[activeIndex + 1] || items[activeIndex - 1];
            list.setData((d) => d ? { ...d, items: d.items.filter((i) => i.id !== activeId) } : d);
            setActiveId(next?.id ?? null);
            emit(MOD_DATA_CHANGED);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const bulk = async (st) => {
        if (!selection.size) return;
        setBusy(true);
        try {
            const res = await modApi.bulkResolve({ ids: [...selection], status: st });
            toast.success(res.data?.message);
            setSelection(emptySelection());
            list.refetch();
            emit(MOD_DATA_CHANGED);
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    useHotkeys(keyboard ? {
        j: () => move(1), ArrowDown: () => move(1),
        k: () => move(-1), ArrowUp: () => move(-1),
        a: () => complaint?.status === 'pending' && resolve({ status: 'accepted' }),
        r: () => complaint?.status === 'pending' && setDialog({ status: 'rejected' }),
        h: () => complaint?.status === 'pending' && setDialog({ status: 'accepted', action: 'hide' }),
        b: () => complaint?.status === 'pending' && complaint?.reported_user && setDialog({ status: 'accepted', action: 'ban' }),
        x: () => activeId && setSelection((s) => toggleOne(s, activeId)),
        Escape: () => setDialog(null),
    } : {}, [items, activeIndex, complaint, activeId, keyboard]);

    const reasons = list.extra?.reasons || [];
    const tabs = useMemo(() => [
        { key: 'pending', label: 'Bekleyen' }, { key: 'accepted', label: 'Kabul' }, { key: 'rejected', label: 'Ret' }, { key: 'all', label: 'Tümü' },
    ], []);

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr] xl:grid-cols-[minmax(0,460px)_1fr]">
            {/* Liste */}
            <Card padded={false} className="flex flex-col min-h-[60vh] max-h-[calc(100vh-180px)]">
                <div className="p-3 space-y-2 border-b border-[var(--p-border)]">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Tabs size="sm" items={tabs} value={status} onChange={setStatus} />
                        <span className="ml-auto text-xs p-muted">{list.pagination.total} kayıt</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tür" className="h-9 text-xs">
                            <option value="">Tüm türler</option>
                            {Object.entries(CONTENT_LABELS).filter(([k]) => k !== 'other').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                        <Select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Sebep" className="h-9 text-xs">
                            <option value="">Tüm sebepler</option>
                            {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                        </Select>
                        <SearchInput value={search} onChange={setSearch} placeholder="Kullanıcı / açıklama" className="col-span-2 [&>input]:h-9 [&>input]:text-xs" />
                        <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama" className="h-9 text-xs col-span-2">
                            <option value="priority">Önce en çok şikâyet alan</option>
                            <option value="oldest">Önce en eski</option>
                            <option value="newest">Önce en yeni</option>
                        </Select>
                    </div>
                    {selection.size > 0 && (
                        <div className="flex items-center gap-2 text-xs rounded-lg bg-white/[0.05] px-2 py-1.5">
                            <b>{selection.size} seçili</b>
                            <Button size="xs" variant="success" onClick={() => bulk('accepted')} loading={busy}>Kabul</Button>
                            <Button size="xs" variant="secondary" onClick={() => bulk('rejected')} loading={busy}>Ret</Button>
                            <button type="button" className="ml-auto p-muted hover:text-[var(--p-text)]" onClick={() => setSelection(emptySelection())}>Temizle</button>
                        </div>
                    )}
                </div>
                <ul className="flex-1 overflow-y-auto divide-y divide-[var(--p-border)]" role="listbox" aria-label="Şikâyetler">
                    {list.loading && Array.from({ length: 6 }).map((_, i) => <li key={i} className="p-3"><Skeleton className="h-4 w-2/3 mb-2" /><Skeleton className="h-3 w-1/2" /></li>)}
                    {!list.loading && items.length === 0 && <li><EmptyState title="Kuyruk boş" description="Bu filtrede bekleyen şikâyet yok." /></li>}
                    {!list.loading && items.map((c) => {
                        const urgency = urgencyOf(c.age_hours, c.report_count);
                        const active = c.id === activeId;
                        return (
                            <li key={c.id} role="option" aria-selected={active}>
                                <button type="button" onClick={() => setActiveId(c.id)} className={`w-full text-left p-3 flex gap-3 transition-colors ${active ? 'bg-white/[0.07] border-l-2 border-l-[var(--p-accent)]' : 'hover:bg-white/[0.04] border-l-2 border-l-transparent'}`}>
                                    <input type="checkbox" checked={selection.has(c.id)} onChange={() => setSelection((s) => toggleOne(s, c.id))} onClick={(e) => e.stopPropagation()} className="mt-1 accent-[var(--p-accent)]" aria-label="Seç" />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 text-xs mb-1">
                                            <Badge tone="info" size="xs">{CONTENT_LABELS[c.type] || c.type}</Badge>
                                            {c.report_count > 1 && <Badge tone={urgency} size="xs">{c.report_count}× şikâyet</Badge>}
                                            {c.status !== 'pending' && <Badge tone={COMPLAINT_STATUS[c.status]?.tone} size="xs">{COMPLAINT_STATUS[c.status]?.label}</Badge>}
                                            <span className={`ml-auto ${urgency === 'danger' ? 'text-rose-400 font-semibold' : 'p-muted'}`}>{hoursLabel(c.age_hours)}</span>
                                        </div>
                                        <div className="text-sm font-medium truncate">{c.reason || 'Sebep belirtilmemiş'}</div>
                                        <div className="text-xs p-muted truncate">{c.reported_user ? `@${c.reported_user.username}` : 'bilinmeyen kullanıcı'} · {truncate(c.description || c.reportable?.title || c.reportable?.content || '', 70) || '—'}</div>
                                    </div>
                                </button>
                            </li>
                        );
                    })}
                </ul>
                {list.pagination.total_pages > 1 && (
                    <div className="p-2 border-t border-[var(--p-border)] flex items-center justify-between text-xs">
                        <Button size="xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</Button>
                        <span className="p-muted">{page}/{list.pagination.total_pages}</span>
                        <Button size="xs" disabled={page >= list.pagination.total_pages} onClick={() => setPage(page + 1)}>Sonraki</Button>
                    </div>
                )}
            </Card>

            {/* Detay */}
            <div className="space-y-4 min-w-0">
                {!activeId && <Card><EmptyState title="Şikâyet seçin" description="Soldaki listeden bir kayıt seçin." /></Card>}
                {activeId && detail.loading && <Card><Skeleton className="h-6 w-1/3 mb-3" /><Skeleton className="h-32" /></Card>}
                {activeId && !detail.loading && complaint && (
                    <>
                        <Card
                            title={<span className="flex items-center gap-2">Şikâyet <Badge tone={COMPLAINT_STATUS[complaint.status]?.tone}>{COMPLAINT_STATUS[complaint.status]?.label}</Badge></span>}
                            subtitle={`${complaint.reason || 'sebep yok'} · ${relativeTime(complaint.created_at)} · şikâyet eden: @${complaint.reporter?.username || '?'}`}
                            actions={complaint.status === 'pending' && (
                                <div className="flex gap-2 flex-wrap justify-end">
                                    <Button size="sm" variant="success" icon={FaCheck} loading={busy} onClick={() => resolve({ status: 'accepted' })}>Kabul {keyboard && <Kbd>a</Kbd>}</Button>
                                    <Button size="sm" variant="warning" onClick={() => setDialog({ status: 'accepted', action: 'hide' })}>Kabul + gizle {keyboard && <Kbd>h</Kbd>}</Button>
                                    {complaint.reported_user && <Button size="sm" variant="danger" onClick={() => setDialog({ status: 'accepted', action: 'ban' })}>Kabul + ban {keyboard && <Kbd>b</Kbd>}</Button>}
                                    <Button size="sm" variant="secondary" icon={FaTimes} onClick={() => setDialog({ status: 'rejected' })}>Ret {keyboard && <Kbd>r</Kbd>}</Button>
                                </div>
                            )}
                        >
                            {complaint.description && <p className="text-sm mb-3 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2"><b className="text-amber-300">Açıklama:</b> {complaint.description}</p>}
                            <ContentPreview type={complaint.type} item={complaint.reportable} />
                            {complaint.status !== 'pending' && (
                                <p className="text-xs p-muted mt-3">Karar: <b>{complaint.handled_by?.username || '—'}</b> · {relativeTime(complaint.handled_at)} {complaint.resolution_notes && <>· {complaint.resolution_notes}</>}</p>
                            )}
                        </Card>

                        <div className="grid gap-4 md:grid-cols-2">
                            <Card title="Şikâyet edilen kullanıcı" actions={complaint.reported_user && <UserActions user={complaint.reported_user} size="xs" onChanged={() => detail.refetch()} />}>
                                {complaint.reported_user ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <Avatar user={complaint.reported_user} size={40} />
                                            <div className="min-w-0">
                                                <div className="font-semibold truncate">@{complaint.reported_user.username}</div>
                                                <div className="text-xs p-muted">hesap {detail.data.reported_user_stats?.account_age_days} günlük</div>
                                            </div>
                                            {detail.data.reported_user_stats && (
                                                <Badge className="ml-auto" tone={RISK_TONE[detail.data.reported_user_stats.complaints_accepted >= 3 ? 'high' : detail.data.reported_user_stats.complaints_accepted >= 1 ? 'medium' : 'low']}>
                                                    {detail.data.reported_user_stats.complaints_accepted} kabul edilmiş
                                                </Badge>
                                            )}
                                        </div>
                                        {detail.data.reported_user_stats && (
                                            <dl className="grid grid-cols-3 gap-2 mt-4 text-center">
                                                {[['Şikâyet', detail.data.reported_user_stats.complaints_against], ['Uyarı', detail.data.reported_user_stats.warnings], ['Durum', detail.data.reported_user_stats.is_banned ? 'Banlı' : detail.data.reported_user_stats.is_frozen ? 'Donuk' : 'Aktif']].map(([k, v]) => (
                                                    <div key={k} className="rounded-lg bg-white/[0.04] py-2"><dt className="text-[10px] uppercase p-muted">{k}</dt><dd className="font-bold text-sm">{v}</dd></div>
                                                ))}
                                            </dl>
                                        )}
                                        <div className="mt-4"><div className="text-xs font-semibold p-muted mb-2 inline-flex items-center gap-1"><FaUserShield />Moderasyon geçmişi</div><Timeline items={detail.data.reported_user_history} showTarget={false} /></div>
                                    </>
                                ) : <p className="text-xs p-muted">Bu şikâyetin bir kullanıcı hedefi yok.</p>}
                            </Card>
                            <Card title={`Aynı hedefe diğer şikâyetler (${detail.data.related?.length || 0})`}>
                                {detail.data.related?.length ? (
                                    <ul className="space-y-2 text-xs">
                                        {detail.data.related.map((r) => (
                                            <li key={r.id} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2">
                                                <Badge tone={COMPLAINT_STATUS[r.status]?.tone} size="xs">{COMPLAINT_STATUS[r.status]?.label}</Badge>
                                                <span className="font-medium truncate">{r.reason || '—'}</span>
                                                <span className="p-muted ml-auto whitespace-nowrap">@{r.reporter?.username} · {relativeTime(r.created_at)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : <p className="text-xs p-muted">Bu içerik için başka şikâyet yok.</p>}
                            </Card>
                        </div>
                    </>
                )}
            </div>

            <ReasonDialog
                open={!!dialog}
                onClose={() => setDialog(null)}
                title={dialog?.status === 'rejected' ? 'Şikâyet reddedilsin mi?' : dialog?.action === 'ban' ? 'Kabul et ve kullanıcıyı banla' : dialog?.action === 'hide' ? 'Kabul et ve içeriği gizle' : 'Kabul et'}
                description={dialog?.status === 'rejected' ? 'Şikâyet edene "kurala aykırı bulunmadı" mesajı gider.' : 'Aynı hedefe açılmış diğer bekleyen şikâyetler de kapanır.'}
                submitLabel={dialog?.status === 'rejected' ? 'Reddet' : 'Uygula'}
                danger={dialog?.action === 'ban'}
                withDuration={dialog?.action === 'ban' || dialog?.action === 'hide'}
                loading={busy}
                presets={dialog?.status === 'rejected' ? ['Kural ihlali yok', 'Yetersiz kanıt', 'Mizah / bağlam', 'Mükerrer şikâyet'] : undefined}
                onSubmit={({ reason: r, minutes }) => resolve(dialog.status === 'rejected'
                    ? { status: 'rejected', notes: r }
                    : { status: 'accepted', notes: r, action: dialog.action, action_reason: r, action_minutes: minutes ?? undefined })}
            />
        </div>
    );
}
