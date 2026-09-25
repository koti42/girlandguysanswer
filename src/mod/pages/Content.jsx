import React from 'react';
import { PageHeader } from '../../panel/ui';
import ContentBrowser from '../../panel/features/ContentBrowser';

export default function Content() {
    return (
        <div>
            <PageHeader title="İçerik" description="Şikâyetli, gizli ve kaldırılmış içerikler. Çoklu seçim ile toplu işlem." />
            <ContentBrowser initialType="question" />
        </div>
    );
}
