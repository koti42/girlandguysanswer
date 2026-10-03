import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import { RunnerAvatar } from './CharacterPicker';

/**
 * Oyun Merkezi'nde modların üstündeki öne çıkan "YENİ · 3D" kartı.
 * Misafirde de kilitli değil: antrenman moduna götürür.
 */
const RunnerFeatureCard = ({ guest = false }) => (
    <Link
        to="/oyun/kosu"
        className="group game-hero game-press relative mb-6 flex min-h-[168px] overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
        aria-label={`Herkesler Koşuyor: 3D bilgi koşusu. ${guest ? 'Antrenmana başla' : 'Koşmaya başla'}`}
    >
        {/* Perspektifli yol: yalnızca CSS, hareket azaltıldığında durur. */}
        <span className="runner-road pointer-events-none absolute inset-y-0 right-0 w-1/2 sm:w-2/5" aria-hidden="true">
            <span className="runner-road-plane" />
        </span>
        <span className="pointer-events-none absolute bottom-2 right-4 sm:right-[12%] h-24 w-20 game-float" aria-hidden="true">
            <RunnerAvatar body="kiz" palette={0} className="h-full w-full" />
        </span>

        <span className="relative z-10 flex max-w-[64%] flex-col sm:max-w-[60%]">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-gold to-coral px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 shadow">
                Yeni · 3D
            </span>
            <span className="mt-2 text-2xl sm:text-3xl font-black leading-tight text-white">Herkesler Koşuyor</span>
            <span className="mt-1 text-sm text-white/80">
                Neon caddede koş, engelleri aş, soru kapısında doğru şeridi seç. Çarpanı x5&apos;e çıkar!
            </span>
            <span className="mt-4 inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-lg">
                {guest ? 'Antrenmana başla' : 'Koşmaya başla'}
                <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
        </span>
    </Link>
);

export default RunnerFeatureCard;
