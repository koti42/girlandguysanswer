import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBan, FaClock, FaComments, FaExclamationTriangle, FaEyeSlash, FaGlobe, FaQuestionCircle, FaServer, FaSnowflake, FaSync, FaUserCheck, FaUserPlus, FaUsers } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { useQuery } from '../../panel/hooks/useQuery';
import { usePanelAuth } from '../../panel/auth/PanelAuthContext';
import { AreaChart, Avatar, Badge, BarRows, Button, Card, Donut, PageHeader, Skeleton, StatCard, Tabs, Timeline } from '../../panel/ui';
import { formatBytes, formatNumber, hoursLabel } from '../../panel/lib/format';

/**
 * Yönetim paneli açılış ekranı. Her widget kendi isteğini atar; biri yavaşsa
 * diğerleri beklemez.
 */
export default function Dashboard() {
    const navigate = useNavigate();
    const { isSuperAdmin } = usePanelAuth();
    const [days, setDays] = useState(30);

    const overview = useQuery(() => adminApi.overview(), []);
    const series = useQuery(() => adminApi.timeseries(days), [days]);
    const top = useQuery(() => adminApi.top(8), []);
    const activity = useQuery(() => adminApi.activity(12), []);
    const mods = useQuery(() => adminApi.moderators(30), []);
    const health = useQuery(() => adminApi.health(), [], { enabled: isSuperAdmin });

    const o = overview.data;
    const rows = series.data?.rows || [];
    const spark = (key) => rows.slice(-14).map((r) => r[key]);

    return (
        <div className="space-y-6">
            <PageHeader title="Panel" description="Sitenin bugünkü durumu ve son 30 gün." actions={<Button icon={FaSync} size="sm" onClick={() => { overview.refetch(); series.refetch(); top.refetch(); activity.refetch(); }}>Yenile</Button>} />

            {/* KPI */}
            {overview.loading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
            ) : o && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Toplam kullanıcı" value={o.users.total} sub={`bugün +${o.users.today} · hafta +${o.users.week}`} icon={FaUsers} tone="accent" spark={spark('users')} onClick={() => navigate('/cpl-manage/users')} />
                    <StatCard label="Çevrimiçi" value={o.users.online} sub={`son 7 günde aktif ${formatNumber(o.users.active_week)}`} icon={FaGlobe} tone="success" onClick={() => navigate('/cpl-manage/users?online=true')} />
                    <StatCard label="Bekleyen şikâyet" value={o.moderation.complaints_pending} sub={o.moderation.oldest_pending_hours != null ? `en eskisi ${hoursLabel(o.moderation.oldest_pending_hours)}` : 'kuyruk boş'} icon={FaExclamationTriangle} tone={o.moderation.complaints_pending > 20 ? 'danger' : o.moderation.complaints_pending > 0 ? 'warning' : 'success'} spark={spark('complaints')} onClick={() => navigate('/cpl-manage/complaints')} />
                    <StatCard label="Moderasyon işlemi" value={o.moderation.actions_today} sub={`bu hafta ${o.moderation.actions_week}`} icon={FaClock} tone="info" spark={spark('actions')} onClick={() => navigate('/cpl-manage/audit')} />
                    <StatCard label="Sorular" value={o.content.questions} sub={`bugün +${o.content.questions_today}`} icon={FaQuestionCircle} tone="info" spark={spark('questions')} compact onClick={() => navigate('/cpl-manage/content')} />
                    <StatCard label="Cevap + yorum" value={o.content.answers + o.content.comments} sub={`bugün +${o.content.answers_today + o.content.comments_today}`} icon={FaComments} tone="neutral" spark={rows.slice(-14).map((r) => r.answers + r.comments)} compact />
                    <StatCard label="Gizli içerik" value={o.content.hidden} sub="şu an gizli" icon={FaEyeSlash} tone={o.content.hidden > 0 ? 'warning' : 'neutral'} compact onClick={() => navigate('/cpl-manage/content')} />
                    <StatCard label="Yaptırımlı hesap" value={o.users.banned + o.users.frozen} sub={`${o.users.banned} banlı · ${o.users.frozen} donuk`} icon={FaBan} tone={o.users.banned + o.users.frozen > 0 ? 'danger' : 'neutral'} compact onClick={() => navigate('/cpl-manage/users?banned=true')} />
                </div>
            )}

            {/* Grafik + dağılım */}
            <div className="grid gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2" title="Aktivite" subtitle="Gün gün yeni kayıt ve içerik" actions={<Tabs size="sm" items={[{ key: 7, label: '7g' }, { key: 30, label: '30g' }, { key: 90, label: '90g' }]} value={days} onChange={setDays} />}>
                    {series.loading ? <Skeleton className="h-56" /> : <AreaChart rows={rows} series={[{ key: 'users', label: 'Kayıt' }, { key: 'questions', label: 'Soru' }, { key: 'answers', label: 'Cevap' }, { key: 'complaints', label: 'Şikâyet', color: '#f43f5e' }]} />}
                </Card>
                <Card title="Kullanıcı dağılımı">
                    {o ? (
                        <div className="space-y-5">
                            <Donut segments={[{ label: 'Kadın', value: o.users.female, color: '#f472b6' }, { label: 'Erkek', value: o.users.male, color: '#38bdf8' }, { label: 'Belirsiz', value: Math.max(0, o.users.total - o.users.female - o.users.male), color: '#64748b' }]} centerLabel={formatNumber(o.users.total)} />
                            <dl className="grid grid-cols-2 gap-2 text-xs">
                                {[[FaUserCheck, 'Doğrulanmış', o.users.verified], [FaUserPlus, 'Bu ay yeni', o.users.month], [FaSnowflake, 'Bot hesap', o.users.bots], [FaClock, 'Silinecek', o.users.deletion_scheduled]].map(([Icon, k, v]) => (
                                    <div key={k} className="rounded-lg bg-white/[0.04] px-3 py-2 flex items-center gap-2"><Icon className="p-muted" /><span className="p-muted flex-1">{k}</span><b>{formatNumber(v)}</b></div>
                                ))}
                            </dl>
                        </div>
                    ) : <Skeleton className="h-40" />}
                </Card>
            </div>

            {/* Listeler */}
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                <Card title="Son moderasyon işlemleri" actions={<Button size="xs" variant="ghost" onClick={() => navigate('/cpl-manage/audit')}>Tümü</Button>}>
                    {activity.loading ? <Skeleton className="h-40" /> : <Timeline items={activity.data?.actions || []} />}
                </Card>
                <Card title="En aktif kullanıcılar" subtitle="Son 30 gün">
                    {top.loading ? <Skeleton className="h-40" /> : (
                        <BarRows items={(top.data?.most_active || []).map((u) => ({ key: u.id, label: `@${u.username}`, value: (u.questions_count || 0) + (u.answers_count || 0) }))} formatValue={(v) => `${v} içerik`} />
                    )}
                </Card>
                <Card title="En çok şikâyet alanlar" subtitle="Son 30 gün">
                    {top.loading ? <Skeleton className="h-40" /> : top.data?.most_reported?.length ? (
                        <ul className="space-y-2">
                            {top.data.most_reported.map((u) => (
                                <li key={u.id}><button type="button" onClick={() => navigate(`/cpl-manage/users/${u.id}`)} className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.05] text-left p-ring"><Avatar user={u} size={28} /><span className="text-sm font-medium flex-1 truncate">@{u.username}</span><Badge tone={u.reports_count >= 5 ? 'danger' : 'warning'}>{u.reports_count} şikâyet</Badge></button></li>
                            ))}
                        </ul>
                    ) : <p className="text-xs p-muted py-6 text-center">Şikâyet alan yok 🎉</p>}
                </Card>
                <Card title="Moderatör performansı" subtitle="Son 30 gün, işlem sayısı">
                    {mods.loading ? <Skeleton className="h-32" /> : <BarRows items={(mods.data?.leaderboard || []).map((m) => ({ key: m.user?.id, label: `@${m.user?.username || '?'}`, value: m.actions }))} formatValue={(v) => `${v}`} />}
                </Card>
                {isSuperAdmin && (
                    <Card title="Sistem" subtitle="Anlık sağlık" actions={<Button size="xs" variant="ghost" icon={FaServer} onClick={() => navigate('/cpl-manage/system')}>Ayrıntı</Button>}>
                        {health.loading ? <Skeleton className="h-28" /> : health.data ? (
                            <dl className="grid grid-cols-2 gap-2 text-xs">
                                {[
                                    ['Veritabanı', health.data.database.ok ? `${health.data.database.latency_ms} ms` : 'HATA', health.data.database.ok ? 'success' : 'danger'],
                                    ['Önbellek', health.data.cache.ok ? health.data.cache.driver : 'HATA', health.data.cache.ok ? 'success' : 'danger'],
                                    ['Kuyruk', `${health.data.queue.size ?? '—'} bekleyen`, (health.data.queue.failed || 0) > 0 ? 'warning' : 'success'],
                                    ['Başarısız iş', String(health.data.queue.failed ?? 0), (health.data.queue.failed || 0) > 0 ? 'danger' : 'success'],
                                    ['Disk', health.data.disk.used_percent != null ? `%${health.data.disk.used_percent} dolu` : '—', (health.data.disk.used_percent || 0) > 85 ? 'danger' : 'success'],
                                    ['Bellek', formatBytes(health.data.memory.usage_bytes), 'neutral'],
                                ].map(([k, v, tone]) => <div key={k} className="rounded-lg bg-white/[0.04] px-3 py-2"><dt className="p-muted">{k}</dt><dd className="mt-0.5"><Badge tone={tone}>{v}</Badge></dd></div>)}
                            </dl>
                        ) : <p className="text-xs p-muted">Sağlık verisi alınamadı.</p>}
                    </Card>
                )}
            </div>
        </div>
    );
}
