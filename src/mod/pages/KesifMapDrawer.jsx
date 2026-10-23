import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaEyeSlash, FaTrash, FaUndo } from 'react-icons/fa';
import { Avatar, Badge, Button, Drawer, ErrorState, Skeleton, Timeline } from '../../panel/ui';
import { formatBytes, formatDateTime, formatNumber, relativeTime } from '../../panel/lib/format';
import { BLOCKS } from '../../game/kesif/sim/blocks.js';
import { accountAgeLabel, paletteRows, reasonLabel, statusMeta } from './kesifMapsUtils';

const blockName = (id) => BLOCKS[id]?.name || '';

const Stat = ({ label, value }) => (
    <div className="rounded-lg border border-[var(--p-border)] px-3 py-2">
        <dt className="text-[10px] uppercase p-muted">{label}</dt>
        <dd className="mt-0.5 text-sm font-semibold tabular-nums">{value}</dd>
    </div>
);

/** Palet: salt okunur önizleme (kapak + blok dağılımı). Kapak yoksa yalnızca istatistik. */
export function PaletteBars({ stats }) {
    const rows = useMemo(() => paletteRows(stats, blockName), [stats]);
    if (!rows.length) return <p className="text-xs p-muted">Harita verisinde blok bulunamadı.</p>;
    const max = rows[0].count || 1;
    return (
        <ul className="space-y-1.5" data-testid="kesif-palette">
            {rows.slice(0, 12).map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-2 text-xs">
                    <span className="truncate" title={`${r.name} (#${r.id})`}>{r.name}</span>
                    <span className="h-2 rounded-full p-fill overflow-hidden" aria-hidden><span className="block h-full rounded-full bg-[var(--p-accent)]" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} /></span>
                    <span className="tabular-nums p-muted">{formatNumber(r.count)} · %{r.pct}</span>
                </li>
            ))}
        </ul>
    );
}

/**
 * Harita ayrıntı çekmecesi: kapak, sayılar, blok paleti, rapor listesi, işlem geçmişi ve eylemler.
 * Eylemler üst bileşende (diyaloglar + iyimser güncelleme); burada yalnızca olay bildirilir.
 */
export default function KesifMapDrawer({ open, onClose, row, detail, loading, error, onRetry, isAdmin, busy, onAction }) {
    const map = detail?.map || row;
    const reports = detail?.reports || [];
    const stats = detail?.map?.stats;
    const st = map ? statusMeta(map) : null;
    const isHidden = map?.status === 'hidden';
    const isRemoved = map?.status === 'removed';
    const openReports = map?.reports_open || 0;

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={map?.title || 'Harita'}
            subtitle={map ? <span>@{map.author?.username || '-'} · {relativeTime(map.created_at)}</span> : null}
            width="max-w-xl"
            footer={map && (
                <>
                    {!isHidden && !isRemoved && <Button variant="warning" icon={FaEyeSlash} disabled={busy} onClick={() => onAction('hide', map)} data-testid="kesif-act-hide">Gizle</Button>}
                    {(isHidden || isRemoved) && <Button variant="success" icon={FaUndo} disabled={busy} onClick={() => onAction('restore', map)} data-testid="kesif-act-restore">Yeniden aç</Button>}
                    {openReports > 0 && <Button icon={FaCheck} disabled={busy} onClick={() => onAction('handle', map)} data-testid="kesif-act-handle">Raporları işlendi say</Button>}
                    {isAdmin && !isRemoved && <Button variant="danger" icon={FaTrash} disabled={busy} className="ml-auto" onClick={() => onAction('remove', map)} data-testid="kesif-act-remove">Kaldır</Button>}
                </>
            )}
        >
            {!map ? null : (
                <div className="space-y-5" data-testid="kesif-drawer">
                    <div className="rounded-xl overflow-hidden border border-[var(--p-border)] p-fill aspect-video grid place-items-center">
                        {map.cover
                            ? <img src={map.cover} alt={`${map.title} kapak görseli`} className="w-full h-full object-cover" />
                            : <span className="text-xs p-muted">Kapak görseli yok</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tone} dot>{st.label}</Badge>
                        <Badge tone={map.visibility === 'public' ? 'info' : 'neutral'}>{map.visibility === 'public' ? 'Herkese açık' : 'Özel'}</Badge>
                        {openReports > 0 && <Badge tone="danger">{openReports} açık rapor</Badge>}
                        {map.author_banned && <Badge tone="danger">Yazar yasaklı</Badge>}
                    </div>

                    {map.description && <p className="text-sm leading-relaxed whitespace-pre-wrap rounded-xl p-fill px-4 py-3">{map.description}</p>}

                    <div className="flex items-center gap-2 text-sm">
                        <Avatar user={map.author} size={24} />
                        {map.author?.id
                            ? <Link to={`/mod/users/${map.author.id}`} className="font-medium hover:underline" data-testid="kesif-author-link">@{map.author.username}</Link>
                            : <span className="p-muted">Yazar yok</span>}
                    </div>

                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Stat label="Blok" value={formatNumber(map.block_count)} />
                        <Stat label="Veri boyutu" value={formatBytes(map.data_bytes)} />
                        <Stat label="Oynanma" value={formatNumber(map.plays)} />
                        <Stat label="Beğeni" value={formatNumber(map.likes)} />
                        <Stat label="Toplam rapor" value={formatNumber(map.reports)} />
                        <Stat label="Chunk" value={stats ? formatNumber(stats.chunks) : '-'} />
                    </dl>

                    <section aria-labelledby="kesif-pal-h">
                        <h3 id="kesif-pal-h" className="text-xs font-semibold p-muted mb-2">Blok paleti (salt okunur önizleme)</h3>
                        {loading && !stats ? <Skeleton className="h-24" /> : stats ? (
                            <>
                                <PaletteBars stats={stats} />
                                <p className="text-[11px] p-muted mt-2">
                                    {stats.base ? `Zemin: ${stats.base}` : ''}{stats.time ? ` · Zaman: ${stats.time}` : ''}{Array.isArray(stats.size) ? ` · Boyut: ${stats.size.join('×')}` : ''}{Array.isArray(stats.spawn) ? ` · Başlangıç: ${stats.spawn.join(', ')}` : ''}
                                </p>
                            </>
                        ) : null}
                    </section>

                    <section aria-labelledby="kesif-rep-h">
                        <h3 id="kesif-rep-h" className="text-xs font-semibold p-muted mb-2">Raporlar ({reports.length})</h3>
                        {error ? <ErrorState message={error} onRetry={onRetry} />
                            : loading && !detail ? <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
                                : reports.length === 0 ? <p className="text-xs p-muted">Bu haritaya rapor yok.</p> : (
                                    <ul className="space-y-2" data-testid="kesif-reports">
                                        {reports.map((r) => (
                                            <li key={r.id} className={`rounded-lg border border-[var(--p-border)] px-3 py-2 text-sm ${r.handled_at ? 'opacity-60' : ''}`}>
                                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                                    <Badge tone={r.handled_at ? 'neutral' : 'danger'} size="xs">{reasonLabel(r.reason)}</Badge>
                                                    {r.user?.id ? <Link to={`/mod/users/${r.user.id}`} className="font-medium hover:underline">@{r.user.username}</Link> : <span className="p-muted">silinmiş kullanıcı</span>}
                                                    {accountAgeLabel(r.user_created_at) && <span className="p-muted">{accountAgeLabel(r.user_created_at)}</span>}
                                                    <time className="ml-auto p-muted" title={formatDateTime(r.created_at)}>{relativeTime(r.created_at)}</time>
                                                </div>
                                                {r.note && <p className="mt-1 leading-snug">{r.note}</p>}
                                                {r.handled_at && <p className="mt-1 text-[11px] p-muted">İşlendi · {formatDateTime(r.handled_at)}</p>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    </section>

                    <section aria-labelledby="kesif-his-h">
                        <h3 id="kesif-his-h" className="text-xs font-semibold p-muted mb-2">İşlem geçmişi</h3>
                        <Timeline items={detail?.actions || []} showTarget={false} emptyText="Bu haritaya henüz işlem yapılmadı." />
                    </section>
                </div>
            )}
        </Drawer>
    );
}
