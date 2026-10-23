import React from 'react';
import { Link } from 'react-router-dom';
import { LuEye, LuEyeOff, LuFlag, LuHammer, LuHeart, LuPencil, LuPlay, LuTrash2, LuUsers } from 'react-icons/lu';
import { coverPalette, formatCount, mapState, relativeTime } from './kesifUtils';

const TONES = {
    emerald: 'bg-emerald-500/90 text-white',
    amber: 'bg-amber-400 text-slate-950',
    rose: 'bg-rose-600 text-white',
    slate: 'bg-slate-700/90 text-white',
};

/** Kapak görseli; yoksa kimlikten türeyen sabit voxel manzarası. */
export const MapCover = ({ map }) => {
    const p = coverPalette(map.id);
    return (
        <div
            className="kesif-cover"
            style={{ '--kc-sky': p.sky, '--kc-hill': p.hill, '--kc-ground': p.ground, '--kc-spark': p.spark }}
            data-testid="kesif-cover"
        >
            {map.cover ? <img src={map.cover} alt="" loading="lazy" decoding="async" /> : <span className="kesif-cover-art" aria-hidden="true" />}
        </div>
    );
};

const actionBase =
    'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold game-press disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral';
const actionQuiet = `${actionBase} bg-slate-100 text-slate-800 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15`;

/**
 * Harita kartı. `variant="browse"`: topluluk (beğen, raporla, oyna);
 * `variant="mine"`: Haritalarım (durum etiketi, düzenle, yayınla/gizle, sil).
 * Kart yalnızca olay bildirir; ağ işi üst bileşende.
 */
const MapCard = ({
    map,
    variant = 'browse',
    busy = false,
    onPlay,
    onLike,
    onReport,
    onEdit,
    onRename,
    onPublish,
    onUnpublish,
    onDelete,
}) => {
    const mine = variant === 'mine';
    const state = mine ? mapState(map) : null;
    const own = map.mine || mine;
    const when = relativeTime(map.publishedAt || map.updatedAt);
    const titleId = `kesif-map-${map.id}`;
    const playable = !mine || state.key !== 'removed';

    return (
        <article className="game-card flex h-full flex-col overflow-hidden rounded-3xl" aria-labelledby={titleId} data-testid="kesif-map-card">
            <div className="relative">
                <MapCover map={map} />
                {mine && (
                    <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${TONES[state.tone]}`}>{state.label}</span>
                )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-3.5">
                <div className="min-w-0">
                    <h3 id={titleId} className="truncate text-base font-extrabold" title={map.title}>
                        {map.title}
                    </h3>
                    {!mine && (
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {map.author.username ? (
                                <Link to={`/oyun/profil/${encodeURIComponent(map.author.username)}`} className="font-semibold hover:text-coral hover:underline">
                                    @{map.author.username}
                                </Link>
                            ) : null}
                            {when ? ` · ${when}` : ''}
                        </p>
                    )}
                    {mine && state.note && <p className="mt-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{state.note}</p>}
                    {map.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{map.description}</p>
                    )}
                </div>

                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {mine || own ? (
                        <span className="inline-flex min-h-[28px] items-center gap-1" aria-label={`${map.likes} beğeni`}>
                            <LuHeart aria-hidden="true" className="text-rose-500" /> {formatCount(map.likes)}
                        </span>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onLike?.(map)}
                            disabled={busy}
                            aria-pressed={map.liked}
                            aria-label={`${map.liked ? 'Beğeniyi geri al' : 'Beğen'}: ${map.title}. ${map.likes} beğeni`}
                            className={`inline-flex min-h-[44px] min-w-[44px] items-center gap-1 rounded-xl px-2 -ml-2 font-bold game-press disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                                map.liked ? 'text-rose-600 dark:text-rose-400' : 'hover:text-rose-500'
                            }`}
                        >
                            <LuHeart aria-hidden="true" className={map.liked ? 'fill-current' : ''} /> {formatCount(map.likes)}
                        </button>
                    )}
                    <span className="inline-flex items-center gap-1" aria-label={`${map.plays} oynanma`}>
                        <LuUsers aria-hidden="true" /> {formatCount(map.plays)}
                    </span>
                    {mine && map.blockCount > 0 && <span className="ml-auto">{formatCount(map.blockCount)} blok</span>}
                </div>

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                    {playable && (
                        <button
                            type="button"
                            onClick={() => onPlay?.(map)}
                            disabled={busy}
                            aria-label={`Oyna: ${map.title}`}
                            className={`${actionBase} flex-1 bg-gradient-to-r from-teal-500 to-cyan-500 text-slate-950 shadow-md`}
                        >
                            <LuPlay aria-hidden="true" /> Oyna
                        </button>
                    )}
                    {!mine && !own && (
                        <button type="button" onClick={() => onReport?.(map)} disabled={busy} aria-label={`Raporla: ${map.title}`} className={`${actionQuiet} w-11 px-0`}>
                            <LuFlag aria-hidden="true" />
                        </button>
                    )}
                    {mine && (
                        <>
                            {state.canEdit && (
                                <button type="button" onClick={() => onEdit?.(map)} disabled={busy} aria-label={`İnşa modunda düzenle: ${map.title}`} className={actionQuiet}>
                                    <LuHammer aria-hidden="true" /> Düzenle
                                </button>
                            )}
                            {state.canEdit && (
                                <button type="button" onClick={() => onRename?.(map)} disabled={busy} aria-label={`Ad ve açıklamayı değiştir: ${map.title}`} className={`${actionQuiet} w-11 px-0`}>
                                    <LuPencil aria-hidden="true" />
                                </button>
                            )}
                            {state.canPublish && (
                                <button type="button" onClick={() => onPublish?.(map)} disabled={busy} aria-label={`Yayınla: ${map.title}`} className={`${actionBase} bg-emerald-600 text-white hover:bg-emerald-700`}>
                                    <LuEye aria-hidden="true" /> Yayınla
                                </button>
                            )}
                            {state.canUnpublish && (
                                <button type="button" onClick={() => onUnpublish?.(map)} disabled={busy} aria-label={`Yayından kaldır: ${map.title}`} className={actionQuiet}>
                                    <LuEyeOff aria-hidden="true" /> Gizle
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onDelete?.(map)}
                                disabled={busy}
                                aria-label={`Sil: ${map.title}`}
                                className={`${actionBase} w-11 bg-rose-50 px-0 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-200`}
                            >
                                <LuTrash2 aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </article>
    );
};

export default MapCard;
