import React from 'react';
import { badgeIcon } from './gameIcons';

/** Rozet koleksiyonu; kazanılmayanlar soluk ve gri. */
const BadgeGrid = ({ badges = [], limit, compact = false }) => {
    const list = Array.isArray(badges) ? badges : [];
    const sorted = [...list].sort((a, b) => Number(Boolean(b.earned_at)) - Number(Boolean(a.earned_at)));
    const shown = limit ? sorted.slice(0, limit) : sorted;

    if (shown.length === 0) {
        return <p className="text-sm text-slate-500 dark:text-slate-400">Henüz rozet yok. İlk oyununu oyna, ilk rozetini kap!</p>;
    }

    return (
        <ul className={`grid gap-2.5 ${compact ? 'grid-cols-4 sm:grid-cols-6' : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6'}`}>
            {shown.map((b) => {
                const Icon = badgeIcon(b.icon);
                const earned = Boolean(b.earned_at);
                return (
                    <li
                        key={b.key}
                        title={`${b.name} - ${b.description}${earned ? '' : ' (henüz kazanılmadı)'}`}
                        className={`flex flex-col items-center text-center rounded-2xl p-2.5 transition ${
                            earned ? 'bg-gradient-to-b from-amber-50 to-white dark:from-amber-400/10 dark:to-transparent' : 'opacity-40 grayscale'
                        }`}
                    >
                        <span
                            className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                                earned
                                    ? 'bg-gradient-to-br from-gold to-coral text-slate-950 shadow-md'
                                    : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                            }`}
                        >
                            <Icon aria-hidden="true" />
                        </span>
                        <span className="mt-1.5 text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200 line-clamp-2">
                            {b.name}
                        </span>
                        {!compact && (
                            <span className="mt-0.5 text-[10px] leading-tight text-slate-500 dark:text-slate-400 line-clamp-2">
                                {b.description}
                            </span>
                        )}
                        <span className="sr-only">{earned ? 'Kazanıldı' : 'Kazanılmadı'}</span>
                    </li>
                );
            })}
        </ul>
    );
};

export default BadgeGrid;
