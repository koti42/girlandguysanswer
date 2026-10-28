import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight, LuShieldAlert } from 'react-icons/lu';
import PzHeroArt from './PzHeroArt';
import { LOBBY_PATH } from './pzUtils';
import './protocolZero.css';

/**
 * Oyun Merkezi'ndeki "PROTOCOL: ZERO" kartı (misafir + üye). Üyeliksiz oynanır, kilit yok.
 */
const ProtocolZeroFeatureCard = ({ guest = false, className = '' }) => (
    <Link
        to={LOBBY_PATH}
        className={`group game-hero game-hero-pz game-press relative flex min-h-[208px] overflow-hidden rounded-3xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${className}`}
        aria-label={`PROTOCOL: ZERO: 3D küresel yapay zekâ karantinası simülasyonu. ${guest ? 'Üyeliksiz oyna' : 'Dünyayı savun'}`}
    >
        <PzHeroArt />
        <span className="relative z-10 flex max-w-[70%] flex-col sm:max-w-[56%]">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-400 to-cyan-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 shadow">
                <LuShieldAlert aria-hidden="true" /> Yeni · 3D Strateji
            </span>
            <span className="mt-2 text-2xl font-black leading-tight text-white sm:text-3xl">PROTOCOL: ZERO</span>
            <span className="mt-1 text-sm text-white/85">
                Kontrolden çıkan yapay zekâ 14 veri merkezine sızıyor. Güvenlik duvarlarını güçlendir, kabloları kes, çekirdek şifresini çöz. Panik %100 olmadan dünyayı kurtar.
            </span>
            <span className="mt-auto pt-4">
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-900 shadow-lg">
                    {guest ? 'Üyeliksiz oyna' : 'Dünyayı savun'}
                    <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
            </span>
        </span>
    </Link>
);

export default ProtocolZeroFeatureCard;
