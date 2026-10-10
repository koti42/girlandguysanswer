import React, { useState } from 'react';
import { FaMagic, FaPen, FaSync } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, Field, Modal, PageHeader, Select, Skeleton, Textarea } from '../../panel/ui';
import { CAPABILITY_LABELS } from '../../panel/lib/modLevels';
import { relativeTime } from '../../panel/lib/format';

const pct = (r) => `%${Math.round((Number(r) || 0) * 100)}`;
const limitLabel = (m) => (m >= 1440 ? `${Math.round(m / 1440)} gün` : `${Math.round(m / 60)} sa`);

/**
 * Kademeli moderasyon: her moderatörün seviyesi, dönem metrikleri (çözülen
 * şikâyet, iptal oranı, hakkındaki şikâyet, kıdem) ve hak ettiği seviye.
 * Seviye elle verilir ya da "Önerileri uygula" ile birer kademe taşınır;
 * otomatik uygulama Ayarlar > Moderasyon'dan açılır.
 */
export default function Moderators() {
    const toast = useToast();
    const [days, setDays] = useState(90);
    const report = useQuery(() => adminApi.moderatorReport({ days }), [days]);
    const data = report.data;
    const [edit, setEdit] = useState(null); // { row, level, reason }
    const [confirmApply, setConfirmApply] = useState(false);
    const [busy, setBusy] = useState(false);

    const levelsById = Object.fromEntries((data?.levels || []).map((l) => [l.level, l]));
    const tone = (lvl) => (lvl >= 5 ? 'danger' : lvl >= 3 ? 'warning' : 'info');

    const save = async () => {
        setBusy(true);
        try {
            const r = await adminApi.setModeratorLevel(edit.row.user.id, { level: Number(edit.level), reason: edit.reason || undefined });
            toast.success(r.data?.message || 'Seviye güncellendi.');
            setEdit(null);
            report.refetch();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const applyAll = async () => {
        setBusy(true);
        try {
            const r = await adminApi.reviewModerators({ apply: true, days });
            toast.success(r.data?.message || 'Uygulandı.');
            setConfirmApply(false);
            report.refetch();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const pending = (data?.moderators || []).filter((m) => m.next_level != null);

    const columns = [
        { key: 'user', label: 'Moderatör', width: 200, render: (m) => <span className="inline-flex items-center gap-2"><Avatar user={m.user} size={26} /><span><b>@{m.user.username}</b><div className="text-[11px] p-muted">{m.user.last_seen_at ? `son görülme ${relativeTime(m.user.last_seen_at)}` : '—'}</div></span></span> },
        { key: 'level', label: 'Seviye', width: 170, render: (m) => <span className="inline-flex items-center gap-2"><Badge tone={tone(m.level)}>{m.level} · {m.level_name}</Badge></span> },
        { key: 'resolved', label: 'Şikâyet', width: 110, align: 'right', render: (m) => <span className="tabular-nums" title={`${m.metrics.complaints_accepted} kabul · ${m.metrics.complaints_rejected} ret`}>{m.metrics.complaints_resolved}</span> },
        { key: 'overturn', label: 'İptal oranı', width: 110, align: 'right', render: (m) => <span className={`tabular-nums ${m.metrics.overturn_rate > 0.15 ? 'p-tone-danger' : ''}`} title={`${m.metrics.overturned}/${m.metrics.sanctions} yaptırım geri alındı`}>{pct(m.metrics.overturn_rate)}</span> },
        { key: 'against', label: 'Hakkında', width: 100, align: 'right', render: (m) => <span className={`tabular-nums ${m.metrics.complaints_against > 0 ? 'p-tone-warning' : ''}`} title="Pencerede kabul edilen şikâyet (bekleyen parantezde)">{m.metrics.complaints_against}{m.metrics.complaints_pending_against ? ` (${m.metrics.complaints_pending_against})` : ''}</span> },
        { key: 'tenure', label: 'Kıdem', width: 90, align: 'right', render: (m) => <span className="tabular-nums">{m.metrics.tenure_days} g</span> },
        { key: 'suggested', label: 'Hak ettiği', width: 180, render: (m) => m.suggested_level === m.level ? <span className="text-xs p-muted">uygun</span> : <Badge tone={m.suggested_level > m.level ? 'success' : 'danger'}>{m.suggested_level > m.level ? '↑' : '↓'} {m.suggested_level} · {m.suggested_name}</Badge> },
        { key: '_', label: '', width: 110, render: (m) => <div className="flex justify-end"><Button size="xs" variant="secondary" icon={FaPen} onClick={() => setEdit({ row: m, level: m.level, reason: '' })}>Seviye</Button></div> },
    ];

    return (
        <div className="space-y-5">
            <PageHeader title="Moderatörler" description="Kademeli moderasyon: yetki seviyesi, dönem performansı ve hak edilen seviye. Her seviye değişikliği denetim kaydına işlenir, moderatöre mesaj gider."
                actions={<div className="flex gap-2 items-center">
                    <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto" aria-label="Pencere"><option value={30}>Son 30 gün</option><option value={90}>Son 90 gün</option><option value={180}>Son 180 gün</option></Select>
                    <Button size="sm" icon={FaSync} onClick={report.refetch}>Yenile</Button>
                    <Button size="sm" variant="primary" icon={FaMagic} disabled={!pending.length} onClick={() => setConfirmApply(true)}>Önerileri uygula{pending.length ? ` (${pending.length})` : ''}</Button>
                </div>}>
                {data && (
                    <p className="text-xs p-muted">
                        Otomatik uygulama: <b>{data.auto_apply ? 'açık (günlük 04:00)' : 'kapalı'}</b> · <Link to="/cpl-manage/settings" className="underline">Ayarlar › Moderasyon</Link>
                    </p>
                )}
            </PageHeader>

            <Card padded={false}>
                <DataTable columns={columns} rows={data?.moderators || []} loading={report.loading} error={report.error} onRetry={report.refetch} dense empty="Moderatör rolünde kullanıcı yok. Roller sayfasından moderatör atayın." />
            </Card>

            <Card title="Seviyeler" subtitle="Her seviye bir öncekinin yetkilerini kapsar. Yönetici ve süper yönetici sınırsızdır.">
                {report.loading && !data ? <Skeleton className="h-32" /> : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {(data?.levels || []).map((l) => (
                            <div key={l.level} className="rounded-xl border border-[var(--p-border)] p-3">
                                <div className="flex items-center gap-2 mb-1"><Badge tone={tone(l.level)}>{l.level}</Badge><b className="text-sm">{l.name}</b></div>
                                <p className="text-xs p-muted mb-2">{l.description}</p>
                                <ul className="text-[11px] space-y-0.5">
                                    {l.capabilities.map((c) => <li key={c}>• {CAPABILITY_LABELS[c] || c}{l.limits?.[c] != null ? <span className="p-muted"> (en fazla {limitLabel(l.limits[c])})</span> : null}</li>)}
                                </ul>
                                {data?.thresholds && l.level > 1 && (
                                    <p className="text-[11px] p-muted mt-2 border-t border-[var(--p-border)] pt-2">
                                        Hak etme: ≥{data.thresholds.min_resolved?.[l.level]} şikâyet, ≥{data.thresholds.min_tenure_days?.[l.level]} gün, iptal ≤{pct(data.thresholds.max_overturn_rate?.[l.level])}, hakkında ≤{data.thresholds.max_complaints_against?.[l.level]}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `@${edit.row.user.username} seviyesi` : ''} subtitle="Değişiklik denetim kaydına yazılır ve moderatöre sistem mesajı gider."
                footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Vazgeç</Button><Button variant="primary" loading={busy} disabled={!edit || Number(edit.level) === edit.row.level} onClick={save}>Kaydet</Button></>}>
                {edit && (
                    <div className="space-y-3">
                        <Field label="Seviye">
                            <Select value={edit.level} onChange={(e) => setEdit({ ...edit, level: e.target.value })}>
                                {(data?.levels || []).map((l) => <option key={l.level} value={l.level}>{l.level} · {l.name}</option>)}
                            </Select>
                        </Field>
                        {levelsById[Number(edit.level)] && <p className="text-xs p-muted">{levelsById[Number(edit.level)].description}</p>}
                        <Field label="Not (isteğe bağlı)"><Textarea value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} rows={3} maxLength={500} placeholder="Moderatöre iletilecek kısa açıklama" /></Field>
                    </div>
                )}
            </Modal>

            <ConfirmDialog open={confirmApply} onClose={() => setConfirmApply(false)} title="Öneriler uygulansın mı?" confirmLabel="Uygula" loading={busy} onConfirm={applyAll}
                message={`${pending.length} moderatör hak ettiği seviyeye doğru bir kademe taşınacak: ${pending.map((m) => `@${m.user.username} ${m.level}→${m.next_level}`).join(', ')}.`} />
        </div>
    );
}
