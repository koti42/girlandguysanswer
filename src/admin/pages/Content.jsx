import React from 'react';
import { PageHeader } from '../../panel/ui';
import ContentBrowser from '../../panel/features/ContentBrowser';

export default function Content() {
    return (
        <div>
            <PageHeader title="İçerik" description="Soru, cevap, yorum, görüş ve hikâyeleri tek yerden yönetin. Satıra tıklayınca detay açılır." />
            <ContentBrowser />
        </div>
    );
}
