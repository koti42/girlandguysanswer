import React from 'react';
import { LuBuilding2, LuCircleHelp, LuHand, LuKeyboard, LuSparkles } from 'react-icons/lu';

const Key = ({ children }) => (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-700 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100">
        {children}
    </kbd>
);

/** Kontroller ve kurallar özeti. */
const TowerHowTo = ({ ranked }) => (
    <section id="tower-howto" className="game-card scroll-mt-4 rounded-3xl p-4 sm:p-5" aria-labelledby="tower-howto-title">
        <h2 id="tower-howto-title" className="font-extrabold">
            Nasıl oynanır?
        </h2>
        <ul className="mt-3 space-y-2">
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                <span className="w-28 shrink-0 font-bold">Katı bırak</span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                    <LuHand className="text-coral" aria-hidden="true" /> Ekranın herhangi bir yerine dokun
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                    <LuKeyboard className="text-indigo-400" aria-hidden="true" /> <Key>Boşluk</Key> <span className="text-slate-400">/</span> <Key>Enter</Key>
                </span>
            </li>
            <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                <span className="w-28 shrink-0 font-bold">Duraklat</span>
                <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                    <LuHand className="text-coral" aria-hidden="true" /> Sağ üstteki buton
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                    <LuKeyboard className="text-indigo-400" aria-hidden="true" /> <Key>Esc</Key> <span className="text-slate-400">/</span> <Key>P</Key>
                </span>
            </li>
        </ul>
        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
            <li className="flex items-start gap-2">
                <LuBuilding2 className="mt-0.5 shrink-0 text-indigo-500" aria-hidden="true" /> Taşan parça kesilir; kule daralır. Hiç değmezse oyun biter.
            </li>
            <li className="flex items-start gap-2">
                <LuSparkles className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /> Tam üstüne bırak: mükemmel! Seri yaptıkça kat yeniden büyür.
            </li>
            <li className="flex items-start gap-2">
                <LuCircleHelp className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" /> Yükseldikçe gökyüzü değişir: gün batımı, gece, yıldızlar…
            </li>
        </ul>
        <p className="mt-3 rounded-2xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100">
            {ranked
                ? 'Her 12 katta bir soru katı: kule durur, iki şıktan doğrusunu seç. Doğru cevap +150 puan; 8 saniyen var.'
                : 'Antrenmanda soru katı yok. Giriş yaparsan her 12 katta bir soru gelir; doğru cevap +150 puan, jeton ve XP kazandırır.'}
        </p>
    </section>
);

export default TowerHowTo;
