import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import AvatarBust from '../avatar/AvatarBust';

/**
 * Oyun Merkezi'ndeki öne çıkan "Herkesler Koşuyor 2.0" kartı.
 * Misafirde de kilitli değil: antrenman moduna götürür.
 *
 * Köşedeki portre oyuncunun kendi karakteri (user.detail.game_avatar; yoksa
 * cinsiyete göre varsayılan) — oyunda koşan 3D karakterle aynı yapılandırma.
 */
const RunnerFeatureCard = ({ guest = false, avatar = null, gender, className = '' }) => (
    <Link
        to="/oyun/kosu"
        className={`group game-hero game-press relative flex min-h-[184px] overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
        aria-label={`Herkesler Koşuyor 2.0: 3D bilgi koşusu. ${guest ? 'Antrenmana başla' : 'Koşmaya başla'}`}
    >
        {/* Perspektifli yol: yalnızca CSS, hareket azaltıldığında durur. */}
        <span className="runner-road pointer-events-none absolute inset-y-0 right-0 w-1/2 sm:w-2/5" aria-hidden="true">
            <span className="runner-road-plane" />
        </span>
        <span
            className="pointer-events-none absolute bottom-3 right-3 sm:right-[8%] h-24 w-24 sm:h-28 sm:w-28 game-float overflow-hidden rounded-full bg-gradient-to-b from-white/25 to-white/5 ring-2 ring-white/30 shadow-[0_0_32px_rgba(255,107,107,0.45)]"
            aria-hidden="true"
        >
            <AvatarBust config={avatar} gender={gender} className="h-full w-full" />
        </span>

        <span className="relative z-10 flex max-w-[62%] flex-col sm:max-w-[60%]">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-gold to-coral px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 shadow">
                2.0 · Yeni
            </span>
            <span className="mt-2 text-2xl sm:text-3xl font-black leading-tight text-white">Herkesler Koşuyor</span>
            <span className="mt-1 text-sm text-white/80">
                Araç çatılarına tırman, rampadan uç, Süper Zıplama&apos;yı yakala; soru kapısında doğru şeridi seç.
            </span>
            <span className="mt-auto pt-4">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-lg">
                    {guest ? 'Antrenmana başla' : 'Koşmaya başla'}
                    <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
            </span>
        </span>
    </Link>
);

export default RunnerFeatureCard;
