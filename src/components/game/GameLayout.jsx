import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LuArrowLeft, LuGamepad2, LuSwords, LuSplit, LuTrophy, LuCalendarCheck, LuBrain, LuFootprints } from 'react-icons/lu';
import MainLayout from '../../layouts/MainLayout';
import { useGameTitle } from './useNow';
import './game.css';

/*
 * 7 sekme 360 px'e de sığsın diye dar ekranda kısa etiket (`short`) çiziliyor;
 * erişilebilir ad her zaman tam etiket (aria-label).
 */
const NAV = [
    { to: '/oyun', label: 'Merkez', icon: LuGamepad2, end: true },
    { to: '/oyun/kosu', label: 'Koşu', icon: LuFootprints },
    { to: '/oyun/arena', label: 'Arena', icon: LuBrain },
    { to: '/oyun/gunluk', label: 'Günlük', icon: LuCalendarCheck },
    { to: '/oyun/duello', label: 'Düello', icon: LuSwords },
    { to: '/oyun/ikilem', label: 'İkilem', icon: LuSplit },
    { to: '/oyun/liderlik', label: 'Liderlik', short: 'Lig', icon: LuTrophy },
];

export const GameNav = () => (
    <nav aria-label="Oyun Merkezi bölümleri" className="mb-5">
        <ul className="grid grid-cols-7 gap-0.5 sm:gap-1 rounded-2xl p-1 game-card">
            {NAV.map(({ to, label, short, icon: Icon, end }) => (
                <li key={to} className="min-w-0">
                    <NavLink
                        to={to}
                        end={end}
                        aria-label={label}
                        className={({ isActive }) =>
                            `flex flex-col lg:flex-row items-center justify-center gap-0.5 lg:gap-1.5 rounded-xl px-0.5 sm:px-1 py-2 min-h-[48px] text-[10px] sm:text-xs lg:text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral ${
                                isActive
                                    ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow-md'
                                    : 'text-slate-600 hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-white/10'
                            }`
                        }
                    >
                        <Icon className="text-lg lg:text-base shrink-0" aria-hidden="true" />
                        {short ? (
                            <>
                                <span className="truncate max-w-full sm:hidden" aria-hidden="true">{short}</span>
                                <span className="hidden truncate max-w-full sm:inline" aria-hidden="true">{label}</span>
                            </>
                        ) : (
                            <span className="truncate max-w-full" aria-hidden="true">{label}</span>
                        )}
                    </NavLink>
                </li>
            ))}
        </ul>
    </nav>
);

/**
 * Oyun sayfalarının ortak iskeleti: sitenin başlığı + oyun zemini.
 * `showNav` oyun ekranında kapatılır ki soru dikkati dağılmasın.
 */
const GameLayout = ({ children, title, docTitle, subtitle, back, showNav = true, maxWidth = 'max-w-5xl', actions }) => {
    useGameTitle(docTitle ?? title);

    return (
        <MainLayout fullWidth>
            <div className="game-page min-h-[calc(100vh-64px)] pb-28 md:pb-16 text-slate-900 dark:text-slate-100">
                <div className={`${maxWidth} mx-auto px-4 pt-4 md:pt-8`}>
                    {showNav && <GameNav />}
                    {back && (
                        <Link
                            to={back.to}
                            className="inline-flex items-center gap-1.5 mb-3 text-sm font-semibold text-slate-500 hover:text-coral dark:text-slate-400 min-h-[44px]"
                        >
                            <LuArrowLeft aria-hidden="true" /> {back.label}
                        </Link>
                    )}
                    {(title || actions) && (
                        <div className="flex items-start justify-between gap-3 mb-5">
                            <div className="min-w-0">
                                {title && (
                                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                                        {title}
                                    </h1>
                                )}
                                {subtitle && <p className="mt-1 text-sm md:text-base text-slate-600 dark:text-slate-400">{subtitle}</p>}
                            </div>
                            {actions}
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </MainLayout>
    );
};

export default GameLayout;
