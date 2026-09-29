import React from 'react';
import { leagueInfo } from './gameUtils';

const LeagueBadge = ({ league, size = 'md', className = '' }) => {
    const info = leagueInfo(league);
    const sizing = size === 'sm' ? 'text-[11px] px-2 py-0.5 gap-1' : 'text-xs px-3 py-1 gap-1.5';
    return (
        <span
            className={`inline-flex items-center rounded-full bg-gradient-to-r font-bold text-white shadow-sm ring-2 ${info.className} ${info.ring} ${sizing} ${className}`}
            title={`${info.name} Ligi`}
        >
            <span aria-hidden="true">{info.emoji}</span>
            {info.name}
        </span>
    );
};

export default LeagueBadge;
