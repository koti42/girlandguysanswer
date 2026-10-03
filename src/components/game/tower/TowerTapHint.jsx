import React from 'react';
import { LuHand, LuKeyboard } from 'react-icons/lu';

/*
 * İlk kulelerde "katı bırak" ipucu (ilk yerleşimle kalkar). Oyun bir
 * zıplama oyunu değil: karakter kayan katın üstünden kendiliğinden atlar,
 * oyuncu yalnızca katı kulenin üstüne bırakır. Bunu açıkça söyler.
 */
const TowerTapHint = ({ touch }) => {
    const Icon = touch ? LuHand : LuKeyboard;
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4" role="note">
            <div className="flex max-w-md items-start gap-3 rounded-2xl bg-slate-950/75 px-4 py-3 text-left text-white shadow-lg ring-1 ring-gold/40 backdrop-blur-sm game-fade-up">
                <Icon className="tower-tap mt-0.5 shrink-0 text-2xl text-gold" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-sm font-black sm:text-base">Kayan katı kulenin üstüne bırak</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-white/85 sm:text-sm">
                        {touch ? (
                            'Kat kulenin tam üstüne geldiğinde ekrana dokun.'
                        ) : (
                            <>
                                Kat kulenin tam üstüne geldiğinde{' '}
                                <kbd className="rounded-md bg-white/15 px-1.5 py-0.5 font-sans text-xs font-bold ring-1 ring-white/25">Boşluk</kbd> tuşuna bas.
                            </>
                        )}
                    </p>
                    <p className="mt-1 text-xs text-white/65">Zıplamak yok: karakter kendiliğinden atlar, sen yalnızca katı bırakırsın.</p>
                </div>
            </div>
        </div>
    );
};

export default TowerTapHint;
