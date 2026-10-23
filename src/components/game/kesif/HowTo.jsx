import React, { useState } from 'react';
import { DESKTOP_CONTROLS as DESKTOP, TOUCH_CONTROLS as TOUCH } from './kxHowTo.js';
import CityGuide from './CityGuide.jsx';
import { LuCompass, LuGem, LuHammer, LuHand, LuKeyboard, LuLock, LuPuzzle, LuShieldCheck, LuSwords } from 'react-icons/lu';

const Key = ({ children }) => (
    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] font-bold text-slate-700 shadow-sm dark:border-white/20 dark:bg-white/10 dark:text-slate-100">
        {children}
    </kbd>
);

const TIPS = [
    { icon: LuPuzzle, color: 'text-violet-500', text: 'Tapınaklardaki bulmacaları çöz, Anahtar Kristallerini topla. Hepsi tamamsa Mühür Sunağı bir sonraki bölgeyi açar.' },
    { icon: LuHammer, color: 'text-amber-500', text: 'Ağaç kes, R ile Üret menüsünü aç: kütük → tahta → tezgah → sandık, ocak, kazma. Madenler derinde: kömürden elmasa, en derinde kuantum kristali.' },
    { icon: LuSwords, color: 'text-rose-500', text: 'Geceleri ve mağaralarda gölgeler çıkar; meşale yakarsan kaçarlar. Her bölgenin sonunda bir koruyucu seni bekler.' },
    { icon: LuGem, color: 'text-cyan-500', text: 'Yeni bölgeler yeni yetenekler verir: çift zıplama, kanca, planör, portal silahı.' },
    { icon: LuCompass, color: 'text-emerald-500', text: 'Uzaktaki ışık hüzmeleri bir yapıyı ya da parkuru işaret eder. Rengi zorluğunu söyler.' },
];

/** Neon Meridyen rehberi: kapalı gelir, açılınca içerik çizilir (lobi sayfası hafif kalır). */
const CityGuideCard = () => {
    const [open, setOpen] = useState(false);
    return (
        <details className="kx-cg-lobby" data-testid="kesif-city-guide-card" onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>Neon Meridyen rehberi: Portal Tabancası, araçlar, görevler</summary>
            {open && <CityGuide openId="portal" headingId="kx-cg-lobby-h" />}
        </details>
    );
};

/** Kontroller, ipuçları ve güvenlik notu. */
const HowTo = () => (
    <section id="kesif-howto" className="game-card scroll-mt-4 rounded-3xl p-4 sm:p-5" aria-labelledby="kesif-howto-title">
        <h2 id="kesif-howto-title" className="font-extrabold">
            Nasıl oynanır?
        </h2>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <LuKeyboard className="text-indigo-400" aria-hidden="true" /> Bilgisayar
                </h3>
                <ul className="space-y-1.5">
                    {DESKTOP.map((r) => (
                        <li key={r.what} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                            <span className="w-40 shrink-0 font-bold">{r.what}</span>
                            <span className="inline-flex flex-wrap items-center gap-1">
                                {r.keys.map((k, i) => (k === '…' ? <span key={`gap${i}`} className="text-slate-400">…</span> : <Key key={k}>{k}</Key>))}
                            </span>
                            {r.note && <span className="text-xs text-slate-500 dark:text-slate-400">{r.note}</span>}
                        </li>
                    ))}
                </ul>
            </div>
            <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <LuHand className="text-coral" aria-hidden="true" /> Telefon ve tablet
                </h3>
                <ul className="space-y-1.5">
                    {TOUCH.map((r) => (
                        <li key={r.what} className="rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-white/5">
                            <span className="font-bold">{r.what}: </span>
                            <span className="text-slate-600 dark:text-slate-300">{r.how}</span>
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Telefonu yan çevirmeni öneririz; dikey de çalışır. Oyun kolu da desteklenir.</p>
            </div>
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-2.5 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
            {TIPS.map(({ icon: Icon, color, text }) => (
                <li key={text} className="flex items-start gap-2">
                    <Icon className={`mt-0.5 shrink-0 ${color}`} aria-hidden="true" /> {text}
                </li>
            ))}
            <li className="flex items-start gap-2">
                <LuLock className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" /> Üye olursan ilerlemen bulutta saklanır ve bölge ödülleri jeton kazandırır.
            </li>
        </ul>

        <CityGuideCard />

        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-500/10 dark:text-indigo-100">
            <LuShieldCheck className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
                Oyunda şiddet çizgi film düzeyindedir (kan yok). Sohbet yoktur; topluluk haritalarında uygunsuz bir şey görürsen raporla. Telefon, adres gibi kişisel bilgileri
                haritalara yazma.
            </span>
        </p>
    </section>
);

export default HowTo;
