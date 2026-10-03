import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuGamepad2, LuPencil, LuSparkles } from 'react-icons/lu';
import AvatarBust from './AvatarBust';
import AvatarPreview from './AvatarPreview';
import GameDialog from './GameDialog';
import { avatarSummary } from './avatarUtils';
import { normalizeAvatar } from '../../../game/avatar/catalog';
import '../game.css';

/*
 * "Oyun Karakteri" kartı: site profili (variant 'site') ve oyuncu profili
 * (variant 'game').
 *  - Karakter kayıtlıysa: portre + özet + "3D gör" (+ kendi profilinde
 *    "Düzenle", site profilinde "Oyun profili").
 *  - Kayıtlı değilse: kendi profilinde "Karakterini oluştur" çağrısı,
 *    başkasının profilinde kart hiç çizilmez.
 */
const SHELL = {
    site: 'rounded-2xl border border-gray-100 bg-white p-4 shadow-soft sm:p-5 dark:border-gray-700 dark:bg-gray-800',
    game: 'game-card rounded-3xl p-4 sm:p-5',
};

const btn =
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral';

const AvatarCard = ({ avatar, gender, username, isOwn = false, level = null, variant = 'site' }) => {
    const [show3d, setShow3d] = useState(false);
    if (!avatar && !isOwn) return null;

    const config = normalizeAvatar(avatar, gender);
    const name = username ? `${username} adlı oyuncunun karakteri` : 'Oyun karakteri';

    return (
        <section className={SHELL[variant] || SHELL.site} aria-labelledby={`oyun-karakteri-${variant}`} data-testid="game-avatar-card">
            <div className="flex items-center gap-4">
                <div className={`game-hero flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl sm:h-28 sm:w-28 ${avatar ? '' : 'opacity-60'}`}>
                    <AvatarBust config={config} label={avatar ? name : undefined} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 id={`oyun-karakteri-${variant}`} className="font-extrabold text-gray-900 dark:text-white">
                            Oyun Karakteri
                        </h2>
                        {level != null && (
                            <span className="rounded-full bg-gradient-to-r from-gold to-coral px-2 py-0.5 text-[11px] font-extrabold text-slate-950">
                                Seviye {level}
                            </span>
                        )}
                    </div>

                    {avatar ? (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Karakter parçaları">
                            {avatarSummary(config).map((r) => (
                                <li key={r.slot} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-white/10 dark:text-indigo-200">
                                    <span className="sr-only">{r.label}: </span>
                                    {r.value}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Henüz bir oyun karakterin yok. Saçını, kıyafetini seç; koşuda ve kulede onunla yarış.
                        </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                        {avatar ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setShow3d(true)}
                                    className={`${btn} bg-gradient-to-r from-indigo-600 to-fuchsia-600 text-white`}
                                >
                                    <LuSparkles aria-hidden="true" /> 3D gör
                                </button>
                                {isOwn && (
                                    <Link to="/oyun/karakter" className={`${btn} bg-coral/10 text-coral dark:bg-coral/20`}>
                                        <LuPencil aria-hidden="true" /> Düzenle
                                    </Link>
                                )}
                            </>
                        ) : (
                            <Link to="/oyun/karakter" className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white game-glow-coral`}>
                                <LuSparkles aria-hidden="true" /> Karakterini oluştur
                            </Link>
                        )}
                        {variant === 'site' && username && (
                            <Link
                                to={`/oyun/profil/${encodeURIComponent(username)}`}
                                className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15`}
                            >
                                <LuGamepad2 aria-hidden="true" /> Oyun profili
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {avatar && (
                <GameDialog open={show3d} title="Oyun Karakteri" onClose={() => setShow3d(false)}>
                    {show3d && <AvatarPreview config={config} transparent={false} label={name} className="h-80 rounded-2xl game-hero sm:h-96" />}
                </GameDialog>
            )}
        </section>
    );
};

export default AvatarCard;
