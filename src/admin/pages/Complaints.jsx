import React from 'react';
import { Link } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';
import { Button, PageHeader } from '../../panel/ui';
import ComplaintQueue from '../../panel/features/ComplaintQueue';

export default function Complaints() {
    return (
        <div>
            <PageHeader title="Şikâyetler" description="Klavye ile hızlı triage için moderasyon panelini kullanın." actions={<Link to="/mod/queue"><Button size="sm" variant="secondary" icon={FaShieldAlt}>Moderasyon panelinde aç</Button></Link>} />
            <ComplaintQueue keyboard={false} />
        </div>
    );
}
