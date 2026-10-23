import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight } from 'react-icons/lu';
import KesifHeroArt from './KesifHeroArt';
import { LOBBY_PATH } from './kesifUtils';
import './kesifLobby.css';

/**
 * Oyun Merkezi'ndeki "Herkesler Keşfediyor" kartı (misafir + üye). İki sütunlu
 * ızgarada tam genişlikte durur (lg:col-span-2): geniş sinematik manzara.
 * Misafirde kilitli değil: macera ve inşa denemesi girişsiz oynanır.
 */
const KesifFeatureCard = ({ guest = false, className = '' }) => (
    <Link
        to={LOBBY_PATH}
        className={`group game-hero game-hero-kesif game-press relative flex min-h-[208px] overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
        aria-label={`Herkesler Keşfediyor: 3D voxel macera ve inşa oyunu. ${guest ? 'Keşfetmeye başla' : 'Dünyaya dal'}`}
    >
        <KesifHeroArt className="kesif-art-fade kesif-art-compact" />

        <span className="relative z-10 flex max-w-[68%] flex-col sm:max-w-[52%]">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-200 to-amber-200 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 shadow">
                Yeni · 3D
            </span>
            <span className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">Herkesler Keşfediyor</span>
            <span className="mt-1 text-sm text-white/85">
                Sınırsız dünyada bulmacaları çöz, mühürleri aç, canavarları yen. Kendi dünyanı inşa et, haritanı toplulukla paylaş.
            </span>
            <span className="mt-auto pt-4">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-lg">
                    {guest ? 'Keşfetmeye başla' : 'Dünyaya dal'}
                    <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
            </span>
        </span>
    </Link>
);

export default KesifFeatureCard;
