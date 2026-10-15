import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaBug, FaCheck, FaChild, FaEnvelope, FaExclamationTriangle, FaEyeSlash, FaLightbulb, FaSearch, FaShieldAlt, FaUserSlash, FaEllipsisH, FaSync } from 'react-icons/fa';
import { modApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { usePagedQuery, useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, EmptyState, Modal, PageHeader, Select, Skeleton, Tabs, Textarea } from '../../panel/ui';
import { formatDateTime, relativeTime, truncate } from '../../panel/lib/format';
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_PLATFORM_LABELS as PLATFORM_LABELS, FEEDBACK_STATUS } from '../../panel/lib/feedback';

/*
 * Geri bildirim / güvenlik bildirimi kuyruğu (uygulama içi form, POST /feedback).
 * Google Play Çocuk Güvenliği Standartları: child_safety kayıtları en üstte,
 * kırmızı rozetle; önce onlar ele alınır.
 */
const CATEGORY_META = {
    child_safety: { tone: 'danger', icon: FaChild },
    harassment: { tone: 'warning', icon: FaUserSlash },
    inappropriate_content: { tone: 'warning', icon: FaEyeSlash },
    spam_fraud: { tone: 'warning', icon: FaExclamationTriangle },
    bug: { tone: 'info', icon: FaBug },
    suggestion: { tone: 'success', icon: FaLightbulb },
    other: { tone: 'neutral', icon: FaEllipsisH },
};

export default function Feedback() {
    const toast = useToast();
    const [status, setStatus] = useState('open');
    const [category, setCategory] = useState('');
    const [page, setPage] = useState(1);
    const [activeId, setActiveId] = useState(null);
    const [dialog, setDialog] = useState(null); // { status: 'resolved' }
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);

    const list = usePagedQuery(() => modApi.feedback({ status, category, page, per_page: 30 }), [status, category, page]);
    const items = list.items;
    const counts = list.extra?.counts || {};

    useEffect(() => { setPage(1); }, [status, category]);
    useEffect(() => { if (items.length && !items.some((i) => i.id === activeId)) setActiveId(items[0].id); }, [items, activeId]);

    const detail = useQuery(() => modApi.feedbackItem(activeId), [activeId], { enabled: !!activeId });
    const fb = detail.data?.feedback;

    const resolve = async (st) => {
        if (!activeId) return;
        setBusy(true);
        try {
            const res = await modApi.resolveFeedback(activeId, { status: st, resolution_notes: notes.trim() || undefined });
            toast.success(res.data?.message || 'Güncellendi.');
            setDialog(null); setNotes('');
            const updated = res.data?.data?.feedback;
            // Durum filtresine artık uymuyorsa listeden düş; uyuyorsa yerinde güncelle.
            list.setData((d) => {
                if (!d) return d;
                const keep = status === 'all' || st === status;
                return { ...d, items: keep ? d.items.map((i) => (i.id === activeId ? { ...i, ...(updated || { status: st }) } : i)) : d.items.filter((i) => i.id !== activeId) };
            });
            if (updated) detail.setData({ feedback: updated });
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    const tabs = useMemo(() => [
        { key: 'open', label: counts.open != null ? `Açık (${counts.open})` : 'Açık' },
        { key: 'in_review', label: 'İnceleniyor' },
        { key: 'resolved', label: 'Çözüldü' },
        { key: 'all', label: 'Tümü' },
    ], [counts.open]);

    return (
        <div>
            <PageHeader
                title="Geri bildirim"
                description="Uygulama içi güvenlik ve geri bildirim formundan gelen kayıtlar. Çocuk güvenliği bildirimleri her zaman en üstte."
                actions={<Button size="sm" icon={FaSync} onClick={list.refetch}>Yenile</Button>}
            />
            {counts.child_safety_open > 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm p-tone-danger" role="alert" data-testid="child-safety-alert">
                    <FaShieldAlt />
                    <span><b>{counts.child_safety_open}</b> açık çocuk güvenliği bildirimi var. 24 saat içinde incelenmeli; gerekirse yetkili kurumlara iletilir.</span>
                </div>
            )}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
                <Card padded={false} className="flex flex-col min-h-[60vh] max-h-[calc(100vh-200px)]">
                    <div className="p-3 space-y-2 border-b border-[var(--p-border)]">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Tabs size="sm" items={tabs} value={status} onChange={setStatus} />
                            <span className="ml-auto text-xs p-muted">{list.pagination.total} kayıt</span>
                        </div>
                        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Konu" className="h-9 text-xs">
                            <option value="">Tüm konular</option>
                            {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </Select>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {list.loading ? <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
                            : items.length === 0 ? <EmptyState icon={FaSearch} title="Kayıt yok" description="Bu filtrede geri bildirim bulunmuyor." />
                                : (
                                    <ul className="divide-y divide-[var(--p-border)]" data-testid="feedback-list">
                                        {items.map((it) => {
                                            const meta = CATEGORY_META[it.category] || CATEGORY_META.other;
                                            const active = it.id === activeId;
                                            return (
                                                <li key={it.id}>
                                                    <button type="button" onClick={() => setActiveId(it.id)} className={`w-full text-left px-3 py-3 flex gap-3 p-ring ${active ? 'p-fill-strong' : 'p-hover'}`} aria-current={active ? 'true' : undefined} data-testid={`feedback-row-${it.id}`}>
                                                        <span className={`h-9 w-9 shrink-0 rounded-lg grid place-items-center ${it.category === 'child_safety' ? 'bg-rose-500/15 p-tone-danger' : 'p-fill p-muted'}`}><meta.icon /></span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="flex items-center gap-2">
                                                                <Badge tone={meta.tone} size="xs">{FEEDBACK_CATEGORY_LABELS[it.category] || it.category}</Badge>
                                                                {status === 'all' && <Badge tone={FEEDBACK_STATUS[it.status]?.tone} size="xs">{FEEDBACK_STATUS[it.status]?.label || it.status}</Badge>}
                                                                <span className="ml-auto text-[11px] p-muted whitespace-nowrap">{relativeTime(it.created_at)}</span>
                                                            </span>
                                                            <span className="block text-sm mt-1 leading-snug">{truncate(it.message, 110)}</span>
                                                            <span className="block text-[11px] p-muted mt-1">{it.user?.username ? `@${it.user.username}` : (it.contact_email || 'anonim')} · {PLATFORM_LABELS[it.platform] || it.platform || '-'}</span>
                                                        </span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                    </div>
                    {list.pagination.total_pages > 1 && (
                        <div className="flex items-center justify-between p-3 border-t border-[var(--p-border)] text-xs">
                            <Button size="xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</Button>
                            <span className="p-muted">{page}/{list.pagination.total_pages}</span>
                            <Button size="xs" disabled={page >= list.pagination.total_pages} onClick={() => setPage(page + 1)}>Sonraki</Button>
                        </div>
                    )}
                </Card>

                {/* Detay */}
                <Card>
                    {!activeId ? <EmptyState title="Bir kayıt seç" description="Soldaki listeden bir geri bildirim seç." />
                        : detail.loading || !fb ? <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /><Skeleton className="h-10 w-1/3" /></div>
                            : (
                                <div className="space-y-5" data-testid="feedback-detail">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge tone={(CATEGORY_META[fb.category] || CATEGORY_META.other).tone}>{FEEDBACK_CATEGORY_LABELS[fb.category] || fb.category}</Badge>
                                        <Badge tone={FEEDBACK_STATUS[fb.status]?.tone}>{FEEDBACK_STATUS[fb.status]?.label || fb.status}</Badge>
                                        {fb.category === 'child_safety' && <Badge tone="danger" dot>Öncelikli</Badge>}
                                        <span className="ml-auto text-xs p-muted" title={formatDateTime(fb.created_at)}>{relativeTime(fb.created_at)}</span>
                                    </div>

                                    <div className="rounded-xl p-fill p-4 text-sm whitespace-pre-wrap leading-relaxed" data-testid="feedback-message">{fb.message}</div>

                                    <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                                        <div className="rounded-lg border border-[var(--p-border)] p-3">
                                            <dt className="text-[10px] uppercase p-muted">Gönderen</dt>
                                            <dd className="mt-1 flex items-center gap-2">
                                                {fb.user ? (<><Avatar user={fb.user} size={24} /><Link to={`/mod/users/${fb.user.id}`} className="font-medium hover:underline">@{fb.user.username}</Link></>) : <span className="p-muted">Anonim (giriş yok)</span>}
                                            </dd>
                                        </div>
                                        <div className="rounded-lg border border-[var(--p-border)] p-3">
                                            <dt className="text-[10px] uppercase p-muted">İletişim</dt>
                                            <dd className="mt-1 flex items-center gap-2">
                                                {fb.contact_email ? <a href={`mailto:${fb.contact_email}`} className="inline-flex items-center gap-1 hover:underline"><FaEnvelope className="text-xs" />{fb.contact_email}</a> : <span className="p-muted">-</span>}
                                                {fb.wants_reply && <Badge tone="info" size="xs">Geri dönüş istiyor</Badge>}
                                            </dd>
                                        </div>
                                        <div className="rounded-lg border border-[var(--p-border)] p-3">
                                            <dt className="text-[10px] uppercase p-muted">İlgili kullanıcı / bağlantı</dt>
                                            <dd className="mt-1 break-all">{fb.related_url || <span className="p-muted">-</span>}</dd>
                                        </div>
                                        <div className="rounded-lg border border-[var(--p-border)] p-3">
                                            <dt className="text-[10px] uppercase p-muted">Platform</dt>
                                            <dd className="mt-1">{PLATFORM_LABELS[fb.platform] || fb.platform || '-'}{fb.app_version ? ` · v${fb.app_version}` : ''}</dd>
                                        </div>
                                    </dl>

                                    {fb.handled_by && (
                                        <p className="text-xs p-muted">Son işlem: @{fb.handled_by.username} · {formatDateTime(fb.handled_at)}{fb.resolution_notes ? ` · “${fb.resolution_notes}”` : ''}</p>
                                    )}

                                    {fb.status !== 'resolved' && (
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--p-border)]">
                                            {fb.status === 'open' && <Button icon={FaSearch} loading={busy} onClick={() => resolve('in_review')} data-testid="feedback-review">İncelemeye al</Button>}
                                            <Button variant="primary" icon={FaCheck} onClick={() => { setNotes(''); setDialog({ status: 'resolved' }); }} data-testid="feedback-resolve">Çözüldü olarak işaretle</Button>
                                        </div>
                                    )}
                                </div>
                            )}
                </Card>
            </div>

            <Modal
                open={!!dialog}
                onClose={() => setDialog(null)}
                title="Çözüldü olarak işaretle"
                subtitle="Not isteğe bağlı; ekibin ne yapıldığını görmesi için kısa bir açıklama bırak."
                footer={(
                    <>
                        <Button variant="ghost" onClick={() => setDialog(null)}>Vazgeç</Button>
                        <Button variant="primary" loading={busy} onClick={() => resolve('resolved')} data-testid="feedback-resolve-submit">Çözüldü</Button>
                    </>
                )}
            >
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Örn. Kullanıcı uyarıldı, içerik kaldırıldı." maxLength={2000} data-testid="feedback-notes" />
            </Modal>
        </div>
    );
}
