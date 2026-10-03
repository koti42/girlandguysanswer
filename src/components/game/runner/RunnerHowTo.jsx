import React from 'react';
import { LuCoins, LuHand, LuKeyboard, LuMagnet, LuShield } from 'react-icons/lu';
import { CONTROL_ROWS } from './runnerUtils';

const Key = ({ children }) => (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-700 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100">
        {children}
    </kbd>
);

// Oyun içi ipucu da aynı listeden üretiliyor (runnerUtils.CONTROL_ROWS).
const ROWS = CONTROL_ROWS;

/** Kontroller ve kurallar özeti. */
const RunnerHowTo = ({ ranked }) => (
    <section id="runner-howto" className="game-card scroll-mt-4 rounded-3xl p-4 sm:p-5" aria-labelledby="runner-howto-title">
        <h2 id="runner-howto-title" className="font-extrabold">Nasıl oynanır?</h2>
        <ul className="mt-3 space-y-2">
            {ROWS.map((r) => (
                <li key={r.what} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                    <span className="w-28 shrink-0 font-bold">{r.what}</span>
                    <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <LuHand className="text-coral" aria-hidden="true" /> {r.touch}
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                        <LuKeyboard className="text-indigo-400" aria-hidden="true" />
                        {r.keys.map((k) => (
                            <Key key={k}>{k}</Key>
                        ))}
                        <span className="text-slate-400">/</span>
                        {r.alt.map((k) => (
                            <Key key={k}>{k}</Key>
                        ))}
                    </span>
                </li>
            ))}
        </ul>
        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-3">
            <li className="flex items-start gap-2">
                <LuCoins className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" /> Jetonları topla, her biri puan.
            </li>
            <li className="flex items-start gap-2">
                <LuMagnet className="mt-0.5 shrink-0 text-sky-500" aria-hidden="true" /> Mıknatıs 10 sn jetonları çeker.
            </li>
            <li className="flex items-start gap-2">
                <LuShield className="mt-0.5 shrink-0 text-emerald-500" aria-hidden="true" /> Kalkan bir çarpmayı affeder.
            </li>
        </ul>
        <p className="mt-3 rounded-2xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100">
            {ranked
                ? 'Soru kapısı yaklaşınca soru ekranın üstünde belirir: doğru şıkkın şeridinden geç! Her doğru çarpanı artırır (en fazla x5), yanlış x1’e düşürür.'
                : 'Antrenmanda soru kapısı yok. Giriş yaparsan kapılardan doğru şıkkı seçip çarpanını x5’e kadar büyütebilirsin.'}
        </p>
    </section>
);

export default RunnerHowTo;
