import React from 'react';
import { FaMicrophone, FaComments, FaPlus } from 'react-icons/fa';
import MeydanIllustration from './MeydanIllustration';

const tiles = [
    {
        key: 'voice',
        icon: FaMicrophone,
        title: 'Sesli oda',
        text: 'Konuş, dinle, el kaldır.',
        chip: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
    },
    {
        key: 'text',
        icon: FaComments,
        title: 'Yazılı sohbet',
        text: 'Mesajlaşarak tartış.',
        chip: 'bg-coral/10 text-coral dark:bg-coral/15',
    },
];

/** Meydanda hiç oda yokken: çizim, sıcak bir davet ve iki oda türünün özeti. */
const CommunityEmptyState = ({ onCreate }) => (
    <section
        aria-labelledby="meydan-empty-title"
        className="relative overflow-hidden rounded-3xl border border-coral/15 dark:border-white/10 bg-gradient-to-br from-rose-50 via-white to-violet-50 dark:from-gray-800 dark:via-gray-800/90 dark:to-violet-950/50 px-4 py-8 sm:px-10 sm:py-10 text-center shadow-soft"
    >
        {/* Yumuşak renk lekeleri */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-gold/20 dark:bg-gold/10 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-coral/15 dark:bg-coral/10 blur-3xl" aria-hidden="true" />

        <div className="relative">
            <MeydanIllustration className="mx-auto w-full max-w-[300px] sm:max-w-[340px] h-auto" />

            <h2 id="meydan-empty-title" className="mt-4 text-2xl sm:text-[1.75rem] font-extrabold tracking-tight text-gray-900 dark:text-white">
                Meydan şimdilik sessiz
            </h2>
            <p className="mx-auto mt-2 max-w-md text-balance text-[15px] leading-relaxed text-gray-600 dark:text-gray-300">
                Bir konu aç, insanları topla. Sesli ya da yazılı, ilk sözü sen söyle.
            </p>

            <button
                type="button"
                onClick={onCreate}
                className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-coral to-orange-400 px-7 py-3 font-semibold text-white shadow-lg shadow-coral/30 transition hover:shadow-xl hover:shadow-coral/40 hover:brightness-105 active:scale-[0.98] motion-reduce:transition-none focus:outline-none focus-visible:ring-4 focus-visible:ring-coral/30"
            >
                <FaPlus aria-hidden="true" className="text-sm" />
                İlk odayı oluştur
            </button>

            <ul className="mx-auto mt-8 grid max-w-lg grid-cols-1 gap-3 text-left sm:grid-cols-2">
                {tiles.map(({ key, icon: Icon, title, text, chip }) => (
                    <li
                        key={key}
                        className="flex items-center gap-3 rounded-2xl bg-white/80 dark:bg-gray-900/50 p-3.5 ring-1 ring-gray-900/5 dark:ring-white/10 backdrop-blur-sm"
                    >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}>
                            <Icon aria-hidden="true" className="text-lg" />
                        </span>
                        <span className="min-w-0">
                            <span className="block font-semibold text-gray-900 dark:text-white">{title}</span>
                            <span className="block text-sm text-gray-500 dark:text-gray-400">{text}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    </section>
);

export default CommunityEmptyState;
