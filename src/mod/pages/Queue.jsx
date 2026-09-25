import React from 'react';
import { Kbd, PageHeader } from '../../panel/ui';
import ComplaintQueue from '../../panel/features/ComplaintQueue';

export default function Queue() {
    return (
        <div>
            <PageHeader title="Kuyruk" description={<span>Önce en çok şikâyet alan. <Kbd>j</Kbd>/<Kbd>k</Kbd> gez · <Kbd>a</Kbd> kabul · <Kbd>r</Kbd> ret · <Kbd>h</Kbd> kabul+gizle · <Kbd>b</Kbd> kabul+ban · <Kbd>x</Kbd> seç</span>} />
            <ComplaintQueue keyboard />
        </div>
    );
}
