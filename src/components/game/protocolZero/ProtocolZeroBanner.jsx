import React from 'react';
import { Link } from 'react-router-dom';
import { LuChevronRight, LuRadio } from 'react-icons/lu';
import { LOBBY_PATH } from './pzUtils';
import './protocolZero.css';

/**
 * Ana sayfa banner'ı: "Yapay Zeka Saldırısını Durdurabilir Misin? (Canlı Simülasyon)".
 * Oyun üyeliksiz oynanır; bağlantı doğrudan lobiye gider. `compact` dar şerit (menü/üst bar).
 */
const ProtocolZeroBanner = ({ compact = false, className = '' }) => {
    if (compact) {
        return (
            <Link
                to={LOBBY_PATH}
                className={`pz-banner-sweep relative flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-[#07122c] via-[#2a0a1f] to-[#07122c] px-3 py-2 text-xs font-bold text-white ring-1 ring-rose-400/40 ${className}`}
            >
                <span className="pz-blink text-base" aria-hidden="true">🚨</span>
                <span className="min-w-0 flex-1 truncate">Yapay Zeka Saldırısını Durdurabilir Misin? <span className="text-cyan-300">Canlı simülasyon</span></span>
                <LuChevronRight aria-hidden="true" />
            </Link>
        );
    }

    return (
        <section className={`max-w-7xl mx-auto px-4 md:px-6 ${className}`} aria-labelledby="pz-banner-title">
            <Link
                to={LOBBY_PATH}
                className="pz-banner-sweep game-hero-pz group relative flex flex-col gap-4 overflow-hidden rounded-3xl p-5 text-white shadow-2xl ring-1 ring-rose-400/30 transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral sm:flex-row sm:items-center sm:p-6"
            >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-rose-500/20 text-3xl ring-1 ring-rose-400/50 pz-alarm" aria-hidden="true">
                    🚨
                </span>
                <span className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200 ring-1 ring-cyan-300/30">
                        <LuRadio className="pz-blink" aria-hidden="true" /> Canlı simülasyon · Üyeliksiz
                    </span>
                    <span id="pz-banner-title" className="mt-2 block text-xl font-black leading-tight sm:text-2xl">
                        Yapay Zeka Saldırısını Durdurabilir Misin?
                    </span>
                    <span className="mt-1 block text-sm text-white/80">
                        PROTOCOL: ZERO — gerçek zamanlı taktik dünya haritasında 14 veri merkezini kontrolden çıkan yapay zekâya karşı savun. Skorunu paylaş, arkadaşlarına meydan oku.
                    </span>
                </span>
                <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full bg-white px-5 py-3 text-sm font-extrabold text-slate-900 shadow-lg">
                    Hemen oyna
                    <LuChevronRight className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
            </Link>
        </section>
    );
};

export default ProtocolZeroBanner;
