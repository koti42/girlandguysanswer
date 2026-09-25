import React, { useEffect, useState } from 'react';
import { modApi } from '../../panel/api/endpoints';
import { usePagedQuery } from '../../panel/hooks/useQuery';
import { Card, PageHeader, Select, Tabs, Timeline } from '../../panel/ui';
import { actionLabel } from '../../panel/lib/moderation';
import { Button } from '../../panel/ui';

export default function Activity() {
    const [scope, setScope] = useState('mine');
    const [action, setAction] = useState('');
    const [page, setPage] = useState(1);
    const list = usePagedQuery(() => modApi.actions({ mine: scope === 'mine' ? 1 : undefined, action, page, per_page: 50 }), [scope, action, page]);
    useEffect(() => { setPage(1); }, [scope, action]);

    return (
        <div>
            <PageHeader title="Aktivite" description="Kendi işlemlerin ve ekibin denetim kaydı.">
                <div className="flex flex-wrap gap-2 items-center">
                    <Tabs items={[{ key: 'mine', label: 'Benim' }, { key: 'all', label: 'Herkes' }]} value={scope} onChange={setScope} />
                    <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto" aria-label="İşlem"><option value="">Tüm işlemler</option>{(list.extra?.actions || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}</Select>
                </div>
            </PageHeader>
            <Card>
                {list.loading ? <p className="text-xs p-muted">Yükleniyor…</p> : <Timeline items={list.items} />}
                {list.pagination.total_pages > 1 && (
                    <div className="flex items-center justify-between mt-4 text-xs">
                        <Button size="xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>Önceki</Button>
                        <span className="p-muted">{page}/{list.pagination.total_pages}</span>
                        <Button size="xs" disabled={page >= list.pagination.total_pages} onClick={() => setPage(page + 1)}>Sonraki</Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
