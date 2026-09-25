import React, { useState } from 'react';
import { PageHeader, Tabs } from '../../panel/ui';
import CatalogCrud from './CatalogCrud';
import { colorCell } from '../../panel/ui/cells';

export default function Gamification() {
    const [tab, setTab] = useState('points');
    return (
        <div>
            <PageHeader title="Oyunlaştırma" description="Puan kuralları, seviyeler ve rozetler. Değişiklik yeni işlemlere uygulanır; geçmiş puanlar yeniden hesaplanmaz.">
                <Tabs items={[{ key: 'points', label: 'Puan kuralları' }, { key: 'levels', label: 'Seviyeler' }, { key: 'badges', label: 'Rozetler' }]} value={tab} onChange={setTab} />
            </PageHeader>
            {tab === 'points' && (
                <CatalogCrud type="points" title="Puan kuralları" description="action_key kodda kullanılan anahtar; ör. answer_posted, reported_valid, content_removed_by_admin."
                    fields={[{ key: 'action_key', label: 'İşlem anahtarı', required: true, placeholder: 'answer_posted' }, { key: 'points', label: 'Puan', type: 'number', required: true, hint: 'Negatif olabilir (ceza)' }, { key: 'description', label: 'Açıklama', full: true }]}
                    columns={[{ key: 'action_key', label: 'Anahtar', render: (r) => <code className="text-xs">{r.action_key}</code> }, { key: 'points', label: 'Puan', width: 90, render: (r) => <b className={r.points < 0 ? 'p-tone-danger' : 'p-tone-success'}>{r.points > 0 ? '+' : ''}{r.points}</b> }, { key: 'description', label: 'Açıklama', render: (r) => <span className="text-xs p-muted">{r.description || '—'}</span> }]} />
            )}
            {tab === 'levels' && (
                <CatalogCrud type="levels" title="Seviyeler" description="min_xp benzersiz olmalı; seviyeler XP'ye göre sıralanır."
                    fields={[{ key: 'name', label: 'Ad', required: true }, { key: 'slug', label: 'Slug' }, { key: 'min_xp', label: 'Başlangıç XP', type: 'number', required: true }, { key: 'color', label: 'Renk', type: 'color' }, { key: 'icon_url', label: 'İkon URL', full: true }]}
                    columns={[{ key: 'name', label: 'Seviye', render: (r) => <b>{r.name}</b> }, { key: 'min_xp', label: 'Min XP', width: 100, align: 'right' }, { key: 'color', label: 'Renk', render: (r) => colorCell(r) }]} />
            )}
            {tab === 'badges' && (
                <CatalogCrud type="badges" title="Rozetler" description="condition_subject bir işlem anahtarı, condition_value eşik sayısı."
                    fields={[{ key: 'name', label: 'Ad', required: true }, { key: 'slug', label: 'Slug' }, { key: 'condition_type', label: 'Koşul tipi', placeholder: 'count' }, { key: 'condition_subject', label: 'Koşul konusu', placeholder: 'answer_posted' }, { key: 'condition_value', label: 'Eşik', type: 'number' }, { key: 'icon_url', label: 'İkon URL' }, { key: 'description', label: 'Açıklama', type: 'textarea' }]}
                    columns={[{ key: 'name', label: 'Rozet', render: (r) => <span className="inline-flex items-center gap-2">{r.icon_url && <img src={r.icon_url} alt="" className="h-6 w-6 rounded" />}<b>{r.name}</b></span> }, { key: 'condition', label: 'Koşul', render: (r) => <code className="text-xs">{r.condition_subject || '—'} ≥ {r.condition_value}</code> }, { key: 'description', label: 'Açıklama', render: (r) => <span className="text-xs p-muted">{r.description || '—'}</span> }]} />
            )}
        </div>
    );
}
