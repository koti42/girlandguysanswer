import React from 'react';
import Badge from './Badge';
import Avatar from './Avatar';
import { actionLabel, actionTone } from '../lib/moderation';
import { formatDateTime, relativeTime } from '../lib/format';

/** Moderasyon işlemleri dikey zaman çizelgesi. items: ModerationAction[] */
export default function Timeline({ items = [], showTarget = true, emptyText = 'Henüz işlem yok' }) {
    if (!items.length) return <p className="text-xs p-muted py-4 text-center">{emptyText}</p>;
    return (
        <ol className="relative border-l border-[var(--p-border)] ml-2 space-y-4">
            {items.map((a) => (
                <li key={a.id} className="pl-5 relative">
                    <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${dotClass(actionTone(a.action))}`} aria-hidden />
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={actionTone(a.action)}>{actionLabel(a.action)}</Badge>
                        {a.actor ? (
                            <span className="inline-flex items-center gap-1.5"><Avatar user={a.actor} size={16} /><b>{a.actor.username}</b></span>
                        ) : <span className="p-muted italic">sistem</span>}
                        {showTarget && a.target_user && a.target_user.id !== a.actor?.id && (
                            <span className="p-muted">→ <b className="text-[var(--p-text)]">{a.target_user.username}</b></span>
                        )}
                        <time className="p-muted ml-auto" title={formatDateTime(a.created_at)}>{relativeTime(a.created_at)}</time>
                    </div>
                    {a.reason && <p className="text-sm mt-1 leading-snug">{a.reason}</p>}
                    {a.meta?.until && <p className="text-[11px] p-muted mt-0.5">Bitiş: {formatDateTime(a.meta.until)}</p>}
                    {a.meta?.changed && (
                        <ul className="text-[11px] p-muted mt-1 space-y-0.5">
                            {Object.entries(a.meta.changed).map(([k, v]) => <li key={k}><code>{k}</code>: {String(v.from)} → <b className="text-[var(--p-text)]">{String(v.to)}</b></li>)}
                        </ul>
                    )}
                </li>
            ))}
        </ol>
    );
}

function dotClass(tone) {
    return { danger: 'bg-rose-400', warning: 'bg-amber-400', success: 'bg-emerald-400', info: 'bg-sky-400', neutral: 'bg-slate-400' }[tone] || 'bg-slate-400';
}
