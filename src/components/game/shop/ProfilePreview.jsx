import React from 'react';
import FramedAvatar from './FramedAvatar';
import MiniAvatarBadge from './MiniAvatarBadge';
import TitlePill from './TitlePill';

/*
 * "Profilinde nasıl görünür" canlı önizlemesi: kullanıcının kendi fotoğrafı
 * ve kullanıcı adıyla çerçeve + mini avatar + unvan. Site profil başlığının
 * küçültülmüş hâli (açık/koyu tema).
 */
const ProfilePreview = ({ user, cosmetics, animate = true, className = '' }) => {
    const name = user?.username || 'kullanici';
    return (
        <figure
            className={`rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-slate-900/70 ${className}`}
            data-testid="profile-preview"
        >
            <div className="flex items-center gap-3">
                <FramedAvatar user={user} frameKey={cosmetics?.frame} size={88} animate={animate} />
                <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5 text-base font-bold text-slate-800 dark:text-white">
                        <span className="truncate">{name}</span>
                        <MiniAvatarBadge itemKey={cosmetics?.mini_avatar} size={24} animate={animate} />
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">@{name}</p>
                    {cosmetics?.title && (
                        <div className="mt-1.5">
                            <TitlePill itemKey={cosmetics.title} size="sm" animate={animate} />
                        </div>
                    )}
                </div>
            </div>
            <figcaption className="sr-only">Profil önizlemesi</figcaption>
        </figure>
    );
};

export default ProfilePreview;
