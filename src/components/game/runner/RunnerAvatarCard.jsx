import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { LuLogIn, LuPencil } from 'react-icons/lu';
import AvatarBust from '../avatar/AvatarBust';
import { normalizeAvatar, styleLabel } from '../../../game/avatar/catalog';

const btn =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

/**
 * Lobideki karakter özeti (v1'in CharacterPicker'ının yerine). Üyede
 * sunucudaki avatar (user.detail.game_avatar; kaydetmemişse cinsiyete göre
 * varsayılan) ve "Karakteri düzenle" -> /oyun/karakter; misafirde varsayılan
 * karakter ve giriş çağrısı. Koşuda aynı yapılandırma 3D olarak giyilir.
 */
const RunnerAvatarCard = ({ user = null }) => {
    const id = useId();
    const member = Boolean(user);
    const config = normalizeAvatar(member ? user.detail?.game_avatar : null, user?.gender);
    const parts = [styleLabel('hair', config.hair.style), styleLabel('top', config.top.style), styleLabel('shoes', config.shoes.style)];
    if (config.acc !== 'none') parts.push(styleLabel('acc', config.acc));
    const trail = config.trail !== 'none' ? styleLabel('trail', config.trail) : null;

    return (
        <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby={`${id}-title`} data-testid="runner-avatar-card">
            <h2 id={`${id}-title`} className="font-extrabold">
                Karakterin
            </h2>
            <div className="mt-3 flex items-center gap-4">
                <div className="game-hero flex h-28 w-28 shrink-0 items-end justify-center overflow-hidden rounded-2xl shadow-inner">
                    <AvatarBust config={config} gender={user?.gender} label="Oyun karakterin" className="h-full w-full game-float" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{parts.join(' · ')}</p>
                    {trail && <p className="mt-0.5 text-xs font-semibold text-coral">Koşu izi: {trail}</p>}
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {member
                            ? 'Koşuda bu karakterle koşarsın. Jetonlarınla yeni saç, kıyafet ve koşu izleri açabilirsin.'
                            : 'Antrenmanda varsayılan karakterle koşarsın. Kendi karakterini oluşturmak için giriş yap.'}
                    </p>
                    <div className="mt-3">
                        {member ? (
                            <Link to="/oyun/karakter" className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white game-glow-coral`}>
                                <LuPencil aria-hidden="true" /> Karakteri düzenle
                            </Link>
                        ) : (
                            <Link to="/login" className={`${btn} bg-indigo-50 text-indigo-700 dark:bg-white/10 dark:text-white`}>
                                <LuLogIn aria-hidden="true" /> Giriş yap
                            </Link>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default RunnerAvatarCard;
