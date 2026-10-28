import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
    LuArrowLeft, LuGamepad2, LuSwords, LuSplit, LuTrophy, LuCalendarCheck, LuBrain, LuFootprints, LuBuilding2,
    LuShoppingBag, LuUserRound, LuShieldAlert,
} from 'react-icons/lu';
import MainLayout from '../../layouts/MainLayout';
import { useGameTitle } from './useNow';
import './game.css';

/*
 * 11 sekme. Tasarım kararı: md ve üstünde tek satır 11 sütunlu ızgara
 * (tümü görünür; ikon üstte, etiket altta — max-w-3xl sayfalarda da
 * sütun ~68 px'e sığar); dar ekranda (360-767 px) yatay kaydırılan sekme şeridi.
 * "Daha fazla" menüsü yerine şerit seçildi: her sekme tek dokunuşla, ekran
 * okuyucuda düz bir bağlantı listesi olarak kalır; yeni 3D oyunlar ve
 * Mağaza/Karakter başta olduğundan 360 px'te ilk ekranda görünür. Kenardaki
 * solma devamı olduğunu gösterir; etkin sekme her sayfada görünür alana
 * kaydırılır. Erişilebilir ad her zaman tam etiket (aria-label); `short` dar
 * ekranda çizilen kısa etiket.
 */
const NAV = [
    { to: '/oyun', label: 'Merkez', icon: LuGamepad2, end: true },
    { to: '/oyun/kosu', label: 'Koşu', icon: LuFootprints },
    { to: '/oyun/kule', label: 'Kule', icon: LuBuilding2 },
    { to: '/oyun/protocol-zero', label: 'PROTOCOL: ZERO', short: 'Zero', icon: LuShieldAlert },
    { to: '/oyun/magaza', label: 'Mağaza', icon: LuShoppingBag },
    { to: '/oyun/karakter', label: 'Karakter', icon: LuUserRound },
    { to: '/oyun/arena', label: 'Arena', icon: LuBrain },
    { to: '/oyun/gunluk', label: 'Günlük', icon: LuCalendarCheck },
    { to: '/oyun/duello', label: 'Düello', icon: LuSwords },
    { to: '/oyun/ikilem', label: 'İkilem', icon: LuSplit },
    { to: '/oyun/liderlik', label: 'Liderlik', short: 'Lig', icon: LuTrophy },
];

// Test ortamı (jsdom) ve SSR'da useLayoutEffect uyarısı olmasın.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const GameNav = () => {
    const listRef = useRef(null);
    const { pathname } = useLocation();
    const [fade, setFade] = useState({ start: false, end: false });

    const measure = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        const next = { start: el.scrollLeft > 4, end: max > 4 && el.scrollLeft < max - 4 };
        setFade((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
    }, []);

    // Etkin sekmeyi görünür alana getir (yalnız yatay; sayfa dikeyde kaymaz).
    useIsoLayoutEffect(() => {
        const el = listRef.current;
        const active = el?.querySelector('[aria-current="page"]');
        if (el && active && el.scrollWidth > el.clientWidth) {
            const li = active.parentElement || active;
            const left = li.offsetLeft - (el.clientWidth - li.offsetWidth) / 2;
            el.scrollLeft = Math.max(0, Math.min(left, el.scrollWidth - el.clientWidth));
        }
        measure();
    }, [pathname, measure]);

    useEffect(() => {
        const el = listRef.current;
        if (!el) return undefined;
        el.addEventListener('scroll', measure, { passive: true });
        window.addEventListener('resize', measure);
        return () => {
            el.removeEventListener('scroll', measure);
            window.removeEventListener('resize', measure);
        };
    }, [measure]);

    return (
        <nav aria-label="Oyun Merkezi bölümleri" className="mb-5">
            <div className="rounded-2xl p-1 game-card">
                <ul
                    ref={listRef}
                    className={`game-nav-strip flex gap-0.5 overflow-x-auto overscroll-x-contain md:grid md:grid-cols-11 md:gap-1 md:overflow-visible ${
                        fade.start ? 'game-nav-fade-start' : ''
                    } ${fade.end ? 'game-nav-fade-end' : ''}`}
                >
                    {NAV.map(({ to, label, short, icon: Icon, end }) => (
                        <li key={to} className="w-[4.25rem] shrink-0 md:w-auto md:min-w-0">
                            <NavLink
                                to={to}
                                end={end}
                                aria-label={label}
                                className={({ isActive }) =>
                                    `flex flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 sm:px-1 py-2 min-h-[52px] text-[11px] sm:text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-coral ${
                                        isActive
                                            ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow-md'
                                            : 'text-slate-600 hover:bg-indigo-50 dark:text-slate-300 dark:hover:bg-white/10'
                                    }`
                                }
                            >
                                <Icon className="text-lg shrink-0" aria-hidden="true" />
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
            </div>
        </nav>
    );
};

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
