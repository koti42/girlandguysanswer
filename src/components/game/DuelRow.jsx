import React from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from '../UserAvatar';
import { DUEL_RESULT_LABELS, DUEL_STATUS_LABELS, duelMine, formatDate, formatNumber } from './gameUtils';

/** Düello listesi satırı. Sağ taraftaki eylemler `children` ile gelir. */
const DuelRow = ({ duel, children, showScores = false }) => {
    const d = duelMine(duel);
    const rivalName = d.rival?.username || (duel.is_random ? 'Rastgele rakip' : 'Rakip');
    const res = duel.result ? DUEL_RESULT_LABELS[duel.result] : null;

    return (
        <li className="game-card rounded-2xl p-3 sm:p-4">
            <div className="flex items-center gap-3">
                <Link to={`/oyun/duello/${duel.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <UserAvatar user={d.rival || { username: '?' }} size="md" />
                    <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900 dark:text-white">{rivalName}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {res ? (
                                <span className={`mr-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${res.className}`}>{res.text}</span>
                            ) : (
                                <span className="mr-1.5">{DUEL_STATUS_LABELS[duel.status] || duel.status}</span>
                            )}
                            {formatDate(duel.created_at)}
                        </p>
                    </div>
                </Link>
                {showScores && (
                    <p className="shrink-0 text-right text-sm font-extrabold tabular-nums">
                        {d.myScore != null ? formatNumber(d.myScore) : '–'}
                        <span className="mx-1 text-slate-400">:</span>
                        {d.theirScore != null ? formatNumber(d.theirScore) : '–'}
                    </p>
                )}
            </div>
            {children && <div className="mt-3 flex flex-wrap justify-end gap-2">{children}</div>}
        </li>
    );
};

export default DuelRow;
