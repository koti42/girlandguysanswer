import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FaExternalLinkAlt } from 'react-icons/fa';
import { modApi } from '../../panel/api/endpoints';
import { usePagedQuery, useQuery } from '../../panel/hooks/useQuery';
import { Avatar, Badge, Card, DataTable, Drawer, PageHeader, SearchInput, Select, Skeleton, Tabs, Timeline } from '../../panel/ui';
import { COMPLAINT_STATUS, RISK_TONE, USER_STATUS, userStatusOf } from '../../panel/lib/moderation';
import { formatDateTime, relativeTime, truncate } from '../../panel/lib/format';
import UserActions from '../../panel/features/UserActions';
import ContentBrowser from '../../panel/features/ContentBrowser';

/** Moderatör kullanıcı görünümü: arama + risk profili. Hesap alanları yok. */
export default function Users() {
    const navigate = useNavigate();
    const { id } = useParams();
    const [sp] = useSearchParams();
    const [q, setQ] = useState('');
    const [status, setStatus] = useState(sp.get('status') || '');
    const [page, setPage] = useState(1);
    const list = usePagedQuery(() => modApi.users({ q, status, page, per_page: 25 }), [q, status, page]);
    useEffect(() => { setPage(1); }, [q, status]);

    const columns = [
        { key: 'username', label: 'Kullanıcı', render: (u) => <span className="inline-flex items-center gap-3"><Avatar user={u} size={30} /><span><b>{u.username}</b>{u.is_bot && <Badge size="xs" className="ml-1">bot</Badge>}<span className="block text-xs p-muted">kayıt {relativeTime(u.created_at)}</span></span></span> },
        { key: 'status', label: 'Durum', width: 130, render: (u) => <Badge tone={USER_STATUS[userStatusOf(u)].tone} dot>{USER_STATUS[userStatusOf(u)].label}</Badge> },
        { key: 'pending_reports', label: 'Bekleyen şikâyet', width: 140, align: 'right', render: (u) => u.pending_reports > 0 ? <Badge tone={u.pending_reports >= 3 ? 'danger' : 'warning'}>{u.pending_reports}</Badge> : <span className="p-muted text-xs">0</span> },
        { key: 'roles', label: 'Rol', width: 120, render: (u) => <span className="text-xs p-muted">{(u.roles || []).filter((r) => r !== 'user').join(', ') || '—'}</span> },
        { key: 'last_seen_at', label: 'Son görülme', width: 120, render: (u) => <span className="text-xs p-muted">{u.last_seen_at ? relativeTime(u.last_seen_at) : '—'}</span> },
    ];

    return (
        <div>
            <PageHeader title="Kullanıcılar" description="Şikâyet alanlar üstte. Satıra tıklayınca moderasyon profili açılır.">
                <div className="flex flex-wrap gap-2">
                    <SearchInput value={q} onChange={setQ} placeholder="Kullanıcı adı / e-posta" className="w-full sm:w-72" autoFocus={sp.get('focus') === '1'} />
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Durum"><option value="">Tümü</option><option value="banned">Banlı</option><option value="frozen">Donuk</option><option value="warned">Uyarılmış</option></Select>
                </div>
            </PageHeader>
            <Card padded={false}><DataTable columns={columns} rows={list.items} loading={list.loading} error={list.error} onRetry={list.refetch} onRowClick={(u) => navigate(`/mod/users/${u.id}`)} rowTone={(u) => userStatusOf(u) === 'banned' ? 'danger' : u.pending_reports >= 3 ? 'warning' : undefined} pagination={list.pagination} onPage={setPage} /></Card>
            <Profile id={id} onClose={() => navigate('/mod/users')} onChanged={() => list.refetch()} />
        </div>
    );
}

function Profile({ id, onClose, onChanged }) {
    const q = useQuery(() => modApi.user(id), [id], { enabled: !!id });
    const [tab, setTab] = useState('overview');
    useEffect(() => { setTab('overview'); }, [id]);
    const d = q.data;
    const u = d?.user;
    const refresh = () => { q.refetch(); onChanged?.(); };

    return (
        <Drawer open={!!id} onClose={onClose} width="max-w-3xl"
            title={u ? <span className="inline-flex items-center gap-3"><Avatar user={u} size={36} />@{u.username}<Badge tone={USER_STATUS[u.status].tone} dot>{USER_STATUS[u.status].label}</Badge>{d.risk && <Badge tone={RISK_TONE[d.risk.level]}>risk {d.risk.score}</Badge>}</span> : 'Kullanıcı'}
            subtitle={u && <span>{u.email} · kayıt {formatDateTime(u.created_at)} · {u.level?.name || 'seviye yok'} · {u.xp ?? 0} XP {u.username && <a href={`/profile/${u.username}`} target="_blank" rel="noreferrer" className="p-accent-text inline-flex items-center gap-1 ml-2"><FaExternalLinkAlt className="text-[10px]" />profil</a>}</span>}
            footer={u && <UserActions user={u} onChanged={refresh} />}>
            {q.loading && <Skeleton className="h-48" />}
            {u && (
                <div className="space-y-4">
                    {(u.banned_reason || u.frozen_reason) && <p className="text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">{u.banned_reason ? `Ban: ${u.banned_reason}` : `Dondurma: ${u.frozen_reason}`}{(u.banned_until || u.frozen_until) && ` · bitiş ${formatDateTime(u.banned_until || u.frozen_until)}`}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                        {[['Kabul edilen şikâyet', d.risk.factors.accepted, 'danger'], ['Bekleyen', d.risk.factors.pending, 'warning'], ['Uyarı', d.risk.factors.warnings, 'warning'], ['Yaptırım', d.risk.factors.sanctions, 'danger'], ['Hesap yaşı', `${d.risk.factors.account_age_days}g`, 'neutral']].map(([k, v, tone]) => (
                            <div key={k} className="rounded-lg bg-white/[0.04] py-2 px-1"><div className="text-[10px] uppercase p-muted leading-tight">{k}</div><div className={`font-bold ${v > 0 && tone === 'danger' ? 'text-rose-400' : v > 0 && tone === 'warning' ? 'text-amber-400' : ''}`}>{v}</div></div>
                        ))}
                    </div>
                    <Tabs items={[{ key: 'overview', label: 'Geçmiş', count: d.history?.length }, { key: 'against', label: 'Aldığı şikâyetler', count: d.complaints_against?.length }, { key: 'by', label: 'Yaptığı şikâyetler', count: d.complaints_by?.length }, { key: 'content', label: 'İçerik' }]} value={tab} onChange={setTab} />
                    {tab === 'overview' && <Timeline items={d.history || []} showTarget={false} emptyText="Temiz sicil." />}
                    {tab === 'against' && <ComplaintList items={d.complaints_against} who="reporter" />}
                    {tab === 'by' && <ComplaintList items={d.complaints_by} />}
                    {tab === 'content' && (
                        <div className="space-y-4">
                            <div className="grid sm:grid-cols-5 gap-2 text-center text-xs">{Object.entries(u.counts || {}).map(([k, v]) => <div key={k} className="rounded-lg bg-white/[0.04] py-2"><div className="uppercase text-[10px] p-muted">{k}</div><b>{v}</b></div>)}</div>
                            <ContentBrowser userId={u.id} />
                        </div>
                    )}
                </div>
            )}
        </Drawer>
    );
}

function ComplaintList({ items = [], who }) {
    if (!items.length) return <p className="text-xs p-muted py-4 text-center">Kayıt yok.</p>;
    return (
        <ul className="space-y-1.5 text-xs">
            {items.map((c) => (
                <li key={c.id} className="rounded-lg bg-white/[0.04] px-3 py-2 flex items-center gap-2 flex-wrap">
                    <Badge tone={COMPLAINT_STATUS[c.status]?.tone} size="xs">{COMPLAINT_STATUS[c.status]?.label}</Badge>
                    <b>{c.reason || '—'}</b>
                    {c.description && <span className="p-muted">{truncate(c.description, 60)}</span>}
                    {who === 'reporter' && c.reporter && <span className="p-muted">· @{c.reporter.username}</span>}
                    <span className="ml-auto p-muted">{relativeTime(c.created_at)}</span>
                </li>
            ))}
        </ul>
    );
}
