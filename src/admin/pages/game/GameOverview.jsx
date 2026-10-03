import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBalanceScale, FaBuilding, FaCalendarDay, FaCheckCircle, FaFistRaised, FaPlay, FaQuestionCircle, FaRunning, FaSync, FaUsers } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { useQuery } from '../../../panel/hooks/useQuery';
import { Avatar, Badge, Button, Card, DataTable, ErrorState, Skeleton, StatCard } from '../../../panel/ui';
import { formatDateTime, formatNumber } from '../../../panel/lib/format';
import { accuracyOf, accuracyTone, difficultyOf } from './gameUtils';

const pct = (v) => (v === null || v === undefined ? '—' : `%${Math.round(Number(v))}`);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// Sunucunun reject_reason kodları (RunnerService::REJECT_*); bilinmeyen kod olduğu gibi yazılır.
const REJECT_REASONS = { time: 'Zaman tutarsızlığı', lane: 'Şerit uyuşmazlığı' };
// Kule: TowerService::REJECT_* ve suspicionReasons() kodları.
const TOWER_REJECT_REASONS = { time: 'Zaman tutarsızlığı', answer: 'Cevap uyuşmazlığı' };
const TOWER_SUSPICION = { combo: 'Aşırı uzun kombo', max_ticks: 'Süre sınırına dayandı', score: 'Olağandışı yüksek skor' };
const labelOf = (map, code) => (Object.prototype.hasOwnProperty.call(map, code) && map[code]) || String(code);
const arr = (v) => (Array.isArray(v) ? v : []);

function RunnerUserCell({ user, sub, onUser }) {
    return (
        <button type="button" disabled={!user?.id} onClick={() => onUser(user.id)} className="flex items-center gap-2 min-w-0 flex-1 basis-44 rounded-lg px-1 py-1 text-left p-hover p-ring disabled:cursor-default">
            <Avatar user={user} size={28} />
            <span className="min-w-0">
                <span className="block text-sm font-medium truncate">@{user?.username || '?'}</span>
                {sub && <code className="block text-[10px] p-muted truncate">{sub}</code>}
            </span>
        </button>
    );
}

/*
 * Herkesler Koşuyor özeti: en yüksek skorlar ve doğrulanamayan (reddedilen)
 * koşular. Eski API sürümü bu alanları göndermiyorsa bölüm hiç çizilmez.
 */
function RunnerSection({ runner, onUser }) {
    const top = Array.isArray(runner?.top) ? runner.top : [];
    const rejected = Array.isArray(runner?.rejected) ? runner.rejected : [];
    return (
        <div className="grid gap-4 xl:grid-cols-2" data-testid="game-runner">
            <Card title="Koşu: en yüksek skorlar" subtitle="Herkesler Koşuyor, tüm zamanlar">
                {top.length ? (
                    <ol className="divide-y divide-[var(--p-border)]">
                        {top.map((r, i) => (
                            <li key={r.run_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                <span className="text-xs font-bold p-muted tabular-nums w-5 shrink-0">{i + 1}.</span>
                                <RunnerUserCell user={r.user} sub={r.at ? formatDateTime(r.at) : null} onUser={onUser} />
                                {/* Dar ekranda puan ve mesafe birlikte alt satıra geçer (kullanıcı adı kırpılmaz). */}
                                <span className="ml-auto flex shrink-0 items-center gap-2">
                                    <Badge tone="accent">{formatNumber(r.score ?? 0)} puan</Badge>
                                    <Badge tone="neutral">{formatNumber(r.distance_m ?? r.distance ?? 0)} m</Badge>
                                </span>
                            </li>
                        ))}
                    </ol>
                ) : <p className="text-xs p-muted py-6 text-center">Henüz bitmiş koşu yok.</p>}
            </Card>
            <Card title="Koşu: reddedilenler" subtitle="Sunucu doğrulamasından geçemeyen son koşular (zaman / şerit tutarsızlığı)">
                {rejected.length ? (
                    <ul className="divide-y divide-[var(--p-border)]" data-testid="game-runner-rejected">
                        {rejected.map((r, i) => (
                            <li key={r.run_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                <RunnerUserCell user={r.user} sub={r.run_id} onUser={onUser} />
                                {r.reason && <span className="text-xs font-medium p-tone-danger break-words min-w-0">{(Object.prototype.hasOwnProperty.call(REJECT_REASONS, r.reason) && REJECT_REASONS[r.reason]) || String(r.reason)}</span>}
                                {r.at && <span className="text-[11px] p-muted">{formatDateTime(r.at)}</span>}
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-xs p-muted py-6 text-center">Reddedilen koşu yok.</p>}
            </Card>
        </div>
    );
}

/*
 * Herkesler Yükseliyor (kule) özeti: en yüksek skorlar, reddedilen ve
 * şüpheli işaretlenen oyunlar. Koşu bölümüyle aynı düzen; alanlar yoksa çizilmez.
 */
function TowerSection({ tower, onUser }) {
    const top = arr(tower?.top);
    const rejected = arr(tower?.rejected);
    const suspicious = arr(tower?.suspicious);
    return (
        <div className="grid gap-4 xl:grid-cols-2" data-testid="game-tower">
            <Card title="Kule: en yüksek skorlar" subtitle="Herkesler Yükseliyor, tüm zamanlar">
                {top.length ? (
                    <ol className="divide-y divide-[var(--p-border)]">
                        {top.map((r, i) => (
                            <li key={r.run_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                <span className="text-xs font-bold p-muted tabular-nums w-5 shrink-0">{i + 1}.</span>
                                <RunnerUserCell user={r.user} sub={r.at ? formatDateTime(r.at) : null} onUser={onUser} />
                                <span className="ml-auto flex shrink-0 items-center gap-2">
                                    <Badge tone="accent">{formatNumber(r.score ?? 0)} puan</Badge>
                                    <Badge tone="neutral">{formatNumber(r.floors ?? 0)} kat</Badge>
                                </span>
                            </li>
                        ))}
                    </ol>
                ) : <p className="text-xs p-muted py-6 text-center">Henüz bitmiş kule oyunu yok.</p>}
            </Card>
            <div className="grid gap-4">
                <Card title="Kule: reddedilenler" subtitle="Sunucu doğrulamasından geçemeyen son oyunlar (zaman / cevap tutarsızlığı)">
                    {rejected.length ? (
                        <ul className="divide-y divide-[var(--p-border)]" data-testid="game-tower-rejected">
                            {rejected.map((r, i) => (
                                <li key={r.run_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                    <RunnerUserCell user={r.user} sub={r.run_id} onUser={onUser} />
                                    {r.reason && <span className="text-xs font-medium p-tone-danger break-words min-w-0">{labelOf(TOWER_REJECT_REASONS, r.reason)}</span>}
                                    {r.at && <span className="text-[11px] p-muted">{formatDateTime(r.at)}</span>}
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-xs p-muted py-6 text-center">Reddedilen kule oyunu yok.</p>}
                </Card>
                <Card title="Kule: şüpheliler" subtitle="Sayılan ama incelenmesi önerilen son oyunlar">
                    {suspicious.length ? (
                        <ul className="divide-y divide-[var(--p-border)]" data-testid="game-tower-suspicious">
                            {suspicious.map((r, i) => (
                                <li key={r.run_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                    <RunnerUserCell user={r.user} sub={r.at ? formatDateTime(r.at) : r.run_id} onUser={onUser} />
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        <Badge tone="accent">{formatNumber(r.score ?? 0)} puan</Badge>
                                        <Badge tone="neutral">{formatNumber(r.floors ?? 0)} kat</Badge>
                                        {isNum(r.max_combo) && <Badge tone="neutral">{formatNumber(r.max_combo)} kombo</Badge>}
                                        {arr(r.reasons).map((code) => <Badge key={code} tone="warning">{labelOf(TOWER_SUSPICION, code)}</Badge>)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-xs p-muted py-6 text-center">Şüpheli kule oyunu yok.</p>}
                </Card>
            </div>
        </div>
    );
}

/** Oyun Merkezi genel bakış: /admin/game/stats. */
export default function GameOverview() {
    const navigate = useNavigate();
    const stats = useQuery(() => gameAdminApi.stats(), []);
    const s = stats.data;
    const t = s?.totals || {};

    const categoryCols = [
        { key: 'name', label: 'Kategori', render: (r) => <span className="font-medium">{r.name || r.slug}</span> },
        { key: 'questions', label: 'Soru', width: 80, align: 'right', render: (r) => formatNumber(r.questions ?? 0) },
        { key: 'answered', label: 'Cevap', width: 90, align: 'right', render: (r) => formatNumber(r.answered ?? 0) },
        { key: 'accuracy', label: 'Doğruluk', width: 100, align: 'right', render: (r) => r.accuracy === null || r.accuracy === undefined || !r.answered ? <span className="p-muted">—</span> : <Badge tone={accuracyTone(Number(r.accuracy))}>{pct(r.accuracy)}</Badge> },
    ];

    const hardest = s?.hardest || [];
    const suspicious = s?.suspicious || [];

    return (
        <div className="space-y-6">
            <div className="flex justify-end -mt-2"><Button size="sm" icon={FaSync} onClick={stats.refetch} loading={stats.loading}>Yenile</Button></div>

            {stats.loading && !s ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : stats.error ? (
                <Card><ErrorState message={stats.error} onRetry={stats.refetch} /></Card>
            ) : s && (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" data-testid="game-totals">
                    <StatCard label="Soru" value={t.questions ?? 0} sub={`${formatNumber(t.active_questions ?? 0)} aktif`} icon={FaQuestionCircle} tone="accent" onClick={() => navigate('/cpl-manage/game/questions')} />
                    <StatCard label="Aktif soru" value={t.active_questions ?? 0} sub={t.questions ? `%${Math.round(((t.active_questions ?? 0) / t.questions) * 100)} yayında` : undefined} icon={FaCheckCircle} tone="success" onClick={() => navigate('/cpl-manage/game/questions')} />
                    <StatCard label="İkilem" value={t.dilemmas ?? 0} icon={FaBalanceScale} tone="info" onClick={() => navigate('/cpl-manage/game/dilemmas')} />
                    <StatCard label="Oyuncu" value={t.players ?? 0} icon={FaUsers} tone="neutral" />
                    <StatCard label="Oturum" value={t.sessions ?? 0} icon={FaPlay} tone="info" compact />
                    <StatCard label="Bugünkü oturum" value={t.sessions_today ?? 0} icon={FaCalendarDay} tone="warning" compact />
                    <StatCard label="Düello" value={t.duels ?? 0} icon={FaFistRaised} tone="danger" compact />
                    {isNum(t.runner_runs) && <StatCard label="Koşu" value={t.runner_runs} sub={isNum(t.runner_runs_today) ? `${formatNumber(t.runner_runs_today)} bugün` : undefined} icon={FaRunning} tone="accent" compact />}
                    {isNum(t.tower_runs) && <StatCard label="Kule" value={t.tower_runs} sub={isNum(t.tower_runs_today) ? `${formatNumber(t.tower_runs_today)} bugün` : undefined} icon={FaBuilding} tone="info" compact />}
                </div>
            )}

            {!stats.error && (
                <div className="grid gap-4 xl:grid-cols-2">
                    <Card title="Kategoriler" subtitle="Soru sayısı ve oyuncuların doğruluk oranı" padded={false}>
                        <DataTable columns={categoryCols} rows={s?.by_category || []} rowKey="slug" loading={stats.loading && !s} dense empty={<p className="py-8 text-center text-xs p-muted">Kategori yok.</p>} />
                    </Card>

                    <Card title="En zor sorular" subtitle="En düşük doğruluk oranı">
                        {stats.loading && !s ? <Skeleton className="h-40" /> : hardest.length ? (
                            <ol className="space-y-2">
                                {hardest.map((q, i) => {
                                    const acc = accuracyOf(q);
                                    const diff = q.difficulty ? difficultyOf(q.difficulty) : null;
                                    return (
                                        <li key={q.id ?? i} className="flex items-start gap-3 rounded-lg p-fill px-3 py-2">
                                            <span className="text-xs font-bold p-muted tabular-nums w-5 shrink-0 pt-0.5">{i + 1}.</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm leading-snug break-words">{q.text || q.question}</p>
                                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] p-muted">
                                                    {(q.category?.name || q.category_name || (typeof q.category === 'string' && q.category)) && <span>{q.category?.name || q.category_name || q.category}</span>}
                                                    {diff && <Badge size="xs" tone={diff.tone}>{diff.label}</Badge>}
                                                    {q.times_answered !== undefined && <span>{formatNumber(q.times_answered)} cevap</span>}
                                                </div>
                                            </div>
                                            <Badge tone={accuracyTone(acc)}>{pct(acc)}</Badge>
                                        </li>
                                    );
                                })}
                            </ol>
                        ) : <p className="text-xs p-muted py-6 text-center">Henüz yeterli veri yok.</p>}
                    </Card>
                </div>
            )}

            {!stats.error && s?.runner && typeof s.runner === 'object' && (
                <RunnerSection runner={s.runner} onUser={(id) => navigate(`/cpl-manage/users/${id}`)} />
            )}

            {!stats.error && s?.tower && typeof s.tower === 'object' && (
                <TowerSection tower={s.tower} onUser={(id) => navigate(`/cpl-manage/users/${id}`)} />
            )}

            {!stats.error && (
                <Card title="Şüpheli oturumlar" subtitle="Ortalama cevap süresi 1,2 sn altında ve doğruluk %90 ve üzeri olan bitmiş oturumlar">
                    {stats.loading && !s ? <Skeleton className="h-24" /> : suspicious.length ? (
                        <ul className="divide-y divide-[var(--p-border)]" data-testid="game-suspicious">
                            {suspicious.map((r, i) => (
                                <li key={r.session_id ?? i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                                    <button type="button" disabled={!r.user?.id} onClick={() => navigate(`/cpl-manage/users/${r.user.id}`)} className="flex items-center gap-2 min-w-0 flex-1 basis-44 rounded-lg px-1 py-1 text-left p-hover p-ring disabled:cursor-default">
                                        <Avatar user={r.user} size={28} />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-medium truncate">@{r.user?.username || '?'}</span>
                                            {r.session_id && <code className="block text-[10px] p-muted truncate">{r.session_id}</code>}
                                        </span>
                                    </button>
                                    <Badge tone="danger">{r.avg_time_ms !== undefined && r.avg_time_ms !== null ? `${formatNumber(Math.round(r.avg_time_ms))} ms ort.` : '—'}</Badge>
                                    <Badge tone="warning">{r.correct_count ?? 0} doğru</Badge>
                                </li>
                            ))}
                        </ul>
                    ) : <p className="text-xs p-muted py-6 text-center">Şüpheli oturum yok.</p>}
                </Card>
            )}
        </div>
    );
}
