import React, { useState } from 'react';
import { PageHeader, Tabs } from '../../panel/ui';
import CatalogCrud from './CatalogCrud';
import { colorCell } from '../../panel/ui/cells';

export default function Catalog() {
    const [tab, setTab] = useState('categories');
    return (
        <div>
            <PageHeader title="Kataloglar" description="Soru kategorileri, hikâye kategorileri ve fenomen etiketleri.">
                <Tabs items={[{ key: 'categories', label: 'Soru kategorileri' }, { key: 'story-categories', label: 'Hikâye kategorileri' }, { key: 'feature-tags', label: 'Fenomen etiketleri' }]} value={tab} onChange={setTab} />
            </PageHeader>

            {tab === 'categories' && (
                <CatalogCrud type="categories" title="Soru kategorileri" description="Kullanımdaki kategori silinemez; önce soruları taşıyın." usageKey="questions_count"
                    fields={[{ key: 'name', label: 'Ad', required: true }, { key: 'slug', label: 'Slug', hint: 'Boş bırakılırsa addan üretilir' }, { key: 'color', label: 'Renk', type: 'color' }, { key: 'icon_url', label: 'İkon URL' }, { key: 'description', label: 'Açıklama', type: 'textarea' }]}
                    columns={[{ key: 'name', label: 'Ad', render: (r) => <b>{r.name}</b> }, { key: 'slug', label: 'Slug', render: (r) => <code className="text-xs">{r.slug}</code> }, { key: 'color', label: 'Renk', render: (r) => colorCell(r) }]} />
            )}
            {tab === 'story-categories' && (
                <CatalogCrud type="story-categories" title="Hikâye kategorileri" description="Ok tuşlarıyla sıralayın; sıra sitede aynen görünür." usageKey="stories_count" sortable
                    fields={[{ key: 'name', label: 'Ad', required: true }, { key: 'slug', label: 'Slug' }, { key: 'icon', label: 'İkon (emoji/ad)' }, { key: 'color', label: 'Renk', type: 'color' }, { key: 'is_active', label: 'Aktif', type: 'switch', hint: 'Pasif kategori seçilemez' }]}
                    columns={[{ key: 'name', label: 'Ad', render: (r) => <span className="inline-flex items-center gap-2">{r.icon && <span>{r.icon}</span>}<b>{r.name}</b></span> }, { key: 'is_active', label: 'Durum', width: 90, render: (r) => <span className={`text-xs ${r.is_active ? 'text-emerald-400' : 'p-muted'}`}>{r.is_active ? 'Aktif' : 'Pasif'}</span> }, { key: 'color', label: 'Renk', render: (r) => colorCell(r) }]} />
            )}
            {tab === 'feature-tags' && (
                <CatalogCrud type="feature-tags" title="Fenomen etiketleri" description="Kullanıcı profilinde dönen halka ve rozet olarak görünür." usageKey="users_count"
                    fields={[{ key: 'name', label: 'Ad', required: true }, { key: 'slug', label: 'Slug' }, { key: 'color', label: 'Renk', type: 'color' }, { key: 'description', label: 'Açıklama', type: 'textarea' }]}
                    columns={[{ key: 'name', label: 'Ad', render: (r) => <b>{r.name}</b> }, { key: 'slug', label: 'Slug', render: (r) => <code className="text-xs">{r.slug}</code> }, { key: 'color', label: 'Renk', render: (r) => colorCell(r) }]} />
            )}
        </div>
    );
}
