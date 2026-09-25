import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { FaBan, FaBolt, FaClock, FaEyeSlash, FaSync } from 'react-icons/fa';
import { BarRows, Button, Card, Donut, Kbd, PageHeader, Skeleton, StatCard, Timeline } from '../../panel/ui';
import { CONTENT_LABELS } from '../../panel/lib/moderation';
import { hoursLabel } from '../../panel/lib/format';

/** Moderatör özet ekranı: kuyruk ne durumda, ben bugün ne yaptım. */
export default function Home() {
    const { dash } = useOutletContext();
    const navigate = useNavigate();
    const d = dash.data;

    return (
        <div className="space-y-5">
            <PageHeader title="Özet" description="Kuyruk durumu ve bugünkü aktiviten." actions={<Button size="sm" icon={FaSync} onClick={dash.refetch}>Yenile</Button>} />
            {dash.loading || !d ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div> : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard label="Bekleyen şikâyet" value={d.queue.pending} sub={`bugün +${d.queue.today}`} icon={FaBolt} tone={d.queue.pending > 20 ? 'danger' : d.queue.pending > 0 ? 'warning' : 'success'} onClick={() => navigate('/mod/queue')} />
                        <StatCard label="En eski bekleyen" value={hoursLabel(d.queue.oldest_pending_hours)} sub={d.queue.oldest_pending_hours >= 24 ? '24 saati geçti — öncelikli' : 'süre'} icon={FaClock} tone={d.queue.oldest_pending_hours >= 24 ? 'danger' : 'neutral'} />
                        <StatCard label="Gizli içerik" value={d.queue.hidden_content} sub="şu an gizli" icon={FaEyeSlash} tone="warning" onClick={() => navigate('/mod/content')} />
                        <StatCard label="Yaptırımlı hesap" value={d.queue.banned_users + d.queue.frozen_users} sub={`${d.queue.banned_users} banlı · ${d.queue.frozen_users} donuk`} icon={FaBan} tone="danger" onClick={() => navigate('/mod/users?status=banned')} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Card title="Kuyruk: türe göre">
                            <Donut segments={Object.entries(d.queue.by_type || {}).map(([k, v]) => ({ label: CONTENT_LABELS[k] || k, value: v }))} centerLabel={String(d.queue.pending)} />
                            {!Object.keys(d.queue.by_type || {}).length && <p className="text-xs p-muted text-center mt-2">Kuyruk boş</p>}
                        </Card>
                        <Card title="Kuyruk: sebebe göre">
                            <BarRows items={(d.queue.by_reason || []).map((r) => ({ key: r.reason, label: r.reason, value: r.count }))} />
                        </Card>
                        <Card title="Bugün ben" subtitle="Kişisel sayaçlar">
                            <dl className="grid grid-cols-3 gap-2 text-center">
                                {[['İşlem', d.me.actions_today], ['Şikâyet', d.me.complaints_resolved_today], ['Bu hafta', d.me.actions_week]].map(([k, v]) => <div key={k} className="rounded-lg bg-white/[0.04] py-3"><dt className="text-[10px] uppercase p-muted">{k}</dt><dd className="text-2xl font-bold">{v}</dd></div>)}
                            </dl>
                            <div className="mt-4 text-xs p-muted space-y-1">
                                <div>Kuyrukta gez: <Kbd>j</Kbd> <Kbd>k</Kbd> · kabul <Kbd>a</Kbd> · ret <Kbd>r</Kbd></div>
                                <div>kabul+gizle <Kbd>h</Kbd> · kabul+ban <Kbd>b</Kbd> · sayfa <Kbd>1</Kbd>–<Kbd>5</Kbd></div>
                            </div>
                            <Button className="mt-4 w-full" variant="primary" icon={FaBolt} onClick={() => navigate('/mod/queue')}>Kuyruğa başla</Button>
                        </Card>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card title="Son işlemler" subtitle="Tüm moderatörler"><Timeline items={d.recent_actions || []} /></Card>
                        <Card title="Bu hafta moderatörler" subtitle="İşlem sayısı"><BarRows items={(d.leaderboard || []).map((m) => ({ key: m.user?.id, label: `@${m.user?.username || '?'}`, value: m.actions }))} /></Card>
                    </div>
                </>
            )}
        </div>
    );
}
