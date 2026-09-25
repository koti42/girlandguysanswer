import React, { useState } from 'react';
import { FaBroom, FaRedo, FaSync, FaTrash } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Badge, Button, Card, ConfirmDialog, PageHeader, Skeleton, StatCard } from '../../panel/ui';
import { formatBytes, formatDateTime } from '../../panel/lib/format';

export default function System() {
    const toast = useToast();
    const health = useQuery(() => adminApi.health(), []);
    const jobs = useQuery(() => adminApi.failedJobs(), []);
    const [confirmCache, setConfirmCache] = useState(false);
    const [busy, setBusy] = useState(false);
    const h = health.data;

    const run = async (fn, ok) => {
        setBusy(true);
        try { const r = await fn(); toast.success(ok || r.data?.message); setConfirmCache(false); jobs.refetch(); health.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    return (
        <div>
            <PageHeader title="Sistem" description="Sağlık göstergeleri ve bakım işlemleri. Yalnızca süper admin." actions={<><Button size="sm" icon={FaSync} onClick={() => { health.refetch(); jobs.refetch(); }}>Yenile</Button><Button size="sm" variant="warning" icon={FaBroom} onClick={() => setConfirmCache(true)}>Önbelleği temizle</Button></>} />
            {health.loading ? <Skeleton className="h-40" /> : h && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-4">
                        <StatCard label="Veritabanı" value={h.database.ok ? `${h.database.latency_ms} ms` : 'HATA'} sub={h.database.driver} tone={h.database.ok ? 'success' : 'danger'} compact />
                        <StatCard label="Önbellek" value={h.cache.ok ? 'OK' : 'HATA'} sub={h.cache.driver} tone={h.cache.ok ? 'success' : 'danger'} compact />
                        <StatCard label="Kuyruk" value={h.queue.size ?? '—'} sub={`${h.queue.driver} · ${h.queue.failed ?? 0} başarısız`} tone={(h.queue.failed || 0) > 0 ? 'warning' : 'success'} compact />
                        <StatCard label="Disk" value={h.disk.used_percent != null ? `%${h.disk.used_percent}` : '—'} sub={h.disk.free_bytes ? `${formatBytes(h.disk.free_bytes)} boş` : ''} tone={(h.disk.used_percent || 0) > 85 ? 'danger' : 'success'} compact />
                    </div>
                    <Card title="Uygulama" className="mb-4">
                        <dl className="grid sm:grid-cols-3 gap-3 text-sm">
                            {[['Ortam', h.app.env], ['Debug', h.app.debug ? 'AÇIK' : 'kapalı'], ['Laravel', h.app.laravel], ['PHP', h.app.php], ['Saat dilimi', h.app.timezone], ['Bellek', `${formatBytes(h.memory.usage_bytes)} / ${h.memory.limit}`]].map(([k, v]) => (
                                <div key={k} className="rounded-lg bg-white/[0.04] px-3 py-2"><dt className="text-[10px] uppercase p-muted">{k}</dt><dd className={`font-medium ${k === 'Debug' && h.app.debug ? 'text-rose-400' : ''}`}>{v}</dd></div>
                            ))}
                        </dl>
                        {h.app.debug && h.app.env === 'production' && <p className="mt-3 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">Canlı ortamda APP_DEBUG açık: hata sayfaları kod ve ayar sızdırır. Kapatın.</p>}
                    </Card>
                </>
            )}
            <Card title="Başarısız işler" subtitle="Kuyrukta patlayan işler; tekrar denenebilir veya silinebilir." padded={false}>
                {jobs.loading ? <Skeleton className="h-24 m-4" /> : (jobs.data?.items || []).length === 0 ? <p className="py-10 text-center text-xs p-muted">Başarısız iş yok 🎉</p> : (
                    <ul className="divide-y divide-[var(--p-border)]">
                        {jobs.data.items.map((j) => (
                            <li key={j.uuid} className="p-4 flex gap-3 items-start">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap"><code className="text-xs font-semibold">{j.job}</code><Badge size="xs">{j.queue}</Badge><span className="text-xs p-muted">{formatDateTime(j.failed_at)}</span></div>
                                    <pre className="mt-1 text-[11px] p-muted whitespace-pre-wrap break-all max-h-24 overflow-y-auto">{j.exception}</pre>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <Button size="xs" variant="secondary" icon={FaRedo} loading={busy} onClick={() => run(() => adminApi.retryJob(j.uuid))}>Tekrar</Button>
                                    <Button size="xs" variant="danger" icon={FaTrash} loading={busy} onClick={() => run(() => adminApi.forgetJob(j.uuid))}>Sil</Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>
            <ConfirmDialog open={confirmCache} onClose={() => setConfirmCache(false)} title="Önbellek temizlensin mi?" message="Uygulama ve yapılandırma önbelleği silinir; ilk istekler biraz yavaşlar. Veri kaybı olmaz." confirmLabel="Temizle" loading={busy} onConfirm={() => run(() => adminApi.clearCache(), 'Önbellek temizlendi.')} />
        </div>
    );
}
