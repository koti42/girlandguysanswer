import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import TowerHeroArt from './TowerHeroArt';
import './tower.css';

/**
 * Oyun Merkezi'ndeki öne çıkan "Herkesler Yükseliyor" kartı (misafir + üye).
 * Misafirde kilitli değil: antrenman moduna götürür. Görsel yalnızca CSS
 * (TowerHeroArt); hareket azaltıldığında durur.
 */
const TowerFeatureCard = ({ guest = false, className = '' }) => (
    <Link
        to="/oyun/kule"
        className={`group game-hero game-hero-tower game-press relative flex min-h-[184px] overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
        aria-label={`Herkesler Yükseliyor: 3D gökdelen oyunu. ${guest ? 'Antrenmana başla' : 'Kuleyi dik'}`}
    >
        {/* Kule 132x196; kart yüksekliğine sığsın diye küçültülür (alttan hizalı). */}
        <span className="pointer-events-none absolute bottom-0 right-2 sm:right-[8%] origin-bottom scale-[0.72] sm:scale-[0.8]" aria-hidden="true">
            <TowerHeroArt />
        </span>

        <span className="relative z-10 flex max-w-[62%] flex-col sm:max-w-[60%]">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-300 to-violet-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 shadow">
                Yeni · 3D
            </span>
            <span className="mt-2 text-2xl sm:text-3xl font-black leading-tight text-white">Herkesler Yükseliyor</span>
            <span className="mt-1 text-sm text-white/80">
                Tek dokunuşla gökdelen dik: katı tam üstüne bırak, mükemmel seriyi yakala, soru katlarında doğru şıkkı seç.
            </span>
            <span className="mt-auto pt-4">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-lg">
                    {guest ? 'Antrenmana başla' : 'Kuleyi dik'}
                    <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
            </span>
        </span>
    </Link>
);

export default TowerFeatureCard;
