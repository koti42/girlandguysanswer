import React, { useEffect, useState } from 'react';
import { FaDownload } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { usePagedQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, DataTable, Input, PageHeader, Select } from '../../panel/ui';
import { actionLabel, actionTone } from '../../panel/lib/moderation';
import { formatDateTime, truncate } from '../../panel/lib/format';

export default function AuditLog() {
    const toast = useToast();
    const [f, setF] = useState({ action: '', from: '', to: '', actor_id: '', target_user_id: '' });
    const [page, setPage] = useState(1);
    const list = usePagedQuery(() => adminApi.actions({ ...f, page, per_page: 50 }), [f, page]);
    useEffect(() => { setPage(1); }, [f]);

    const columns = [
        { key: 'created_at', label: 'Zaman', width: 150, nowrap: true, render: (a) => <span className="text-xs">{formatDateTime(a.created_at)}</span> },
        { key: 'action', label: 'İşlem', width: 160, render: (a) => <Badge tone={actionTone(a.action)}>{actionLabel(a.action)}</Badge> },
        { key: 'actor', label: 'Yapan', width: 160, render: (a) => a.actor ? <span className="inline-flex items-center gap-2"><Avatar user={a.actor} size={22} />{a.actor.username}</span> : <i className="text-xs p-muted">sistem</i> },
        { key: 'target', label: 'Hedef', width: 180, render: (a) => a.target_user ? <span className="inline-flex items-center gap-2"><Avatar user={a.target_user} size={22} />{a.target_user.username}</span> : a.target_type ? <code className="text-xs">{a.target_type.split('\\').pop()}#{String(a.target_id).slice(0, 8)}</code> : '—' },
        { key: 'reason', label: 'Sebep / ayrıntı', render: (a) => <span className="text-xs">{a.reason ? truncate(a.reason, 90) : a.meta ? <code className="p-muted">{truncate(JSON.stringify(a.meta), 90)}</code> : '—'}</span> },
    ];

    const exportCsv = async () => {
        try { const r = await adminApi.export('actions'); const u = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = u; a.download = 'denetim-kaydi.csv'; a.click(); URL.revokeObjectURL(u); }
        catch (e) { toast.error(errorMessage(e)); }
    };

    return (
        <div>
            <PageHeader title="Denetim kaydı" description="Kim, neyi, kime, ne zaman. Panelden yapılan her işlem burada." actions={<Button size="sm" icon={FaDownload} onClick={exportCsv}>CSV</Button>}>
                <div className="flex flex-wrap gap-2">
                    <Select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })} className="w-auto" aria-label="İşlem"><option value="">Tüm işlemler</option>{(list.extra?.actions || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}</Select>
                    <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="w-auto" aria-label="Başlangıç" />
                    <Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value ? e.target.value + 'T23:59:59' : '' })} className="w-auto" aria-label="Bitiş" />
                    {(f.action || f.from || f.to) && <Button size="md" variant="ghost" onClick={() => setF({ action: '', from: '', to: '', actor_id: '', target_user_id: '' })}>Temizle</Button>}
                </div>
            </PageHeader>
            <Card padded={false}><DataTable columns={columns} rows={list.items} loading={list.loading} error={list.error} onRetry={list.refetch} pagination={list.pagination} onPage={setPage} dense /></Card>
        </div>
    );
}
