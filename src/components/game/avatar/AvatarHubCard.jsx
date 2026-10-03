import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import AvatarBust from './AvatarBust';

/*
 * Oyun Merkezi'ndeki "Karakterim" kartı (misafir + üye) -> /oyun/karakter.
 * Üyede kayıtlı karakter (user.detail.game_avatar; yoksa cinsiyete göre
 * varsayılan), misafirde varsayılan karakter; editör sayfası misafire kendi
 * giriş çağrısını gösteriyor.
 */
const AvatarHubCard = ({ avatar = null, gender, guest = false, className = '' }) => {
    const saved = !!avatar;
    const cta = guest ? 'Karakterine göz at' : saved ? 'Karakteri düzenle' : 'Karakterini oluştur';
    return (
        <Link
            to="/oyun/karakter"
            className={`group game-card game-press relative flex items-center gap-3 overflow-hidden rounded-3xl p-4 sm:p-5 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
            aria-label={`Karakterim: koşuda ve kulede seninle yarışan karakter. ${cta}`}
        >
            <span className="relative min-w-0 flex-1" aria-hidden="true">
                <span className="text-lg font-extrabold">Karakterim</span>
                <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">
                    {saved
                        ? 'Koşuda ve kulenin tepesinde bu karakterle yarışıyorsun. Saçını, kıyafetini, izini değiştir.'
                        : 'Saçını, kıyafetini, aksesuarını seç; koşuda ve kulede kendi karakterinle yarış.'}
                </span>
                <span className="mt-2.5 inline-flex items-center gap-1 text-sm font-extrabold text-coral">
                    {cta} <LuChevronRight className="transition-transform group-hover:translate-x-0.5" />
                </span>
            </span>
            <span
                className="game-hero relative flex h-24 w-24 shrink-0 items-end justify-center overflow-hidden rounded-2xl sm:h-28 sm:w-28"
                aria-hidden="true"
            >
                <AvatarBust config={avatar} gender={gender} className="h-full w-full transition-transform group-hover:scale-105" />
            </span>
        </Link>
    );
};

export default AvatarHubCard;
