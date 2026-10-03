import React, { useId } from 'react';
import { BODIES, PALETTES } from './runnerUtils';

/*
 * Basit vektör önizleme. Asıl model motorda; burada yalnızca seçimin
 * (kız atkuyruğu / erkek şapka, hoodie rengi) anlaşılır olması yeterli.
 */
export const RunnerAvatar = ({ body = 'kiz', palette = 0, className = '' }) => {
    const p = PALETTES[palette] || PALETTES[0];
    const girl = body === 'kiz';
    return (
        <svg viewBox="0 0 64 80" className={className} aria-hidden="true" focusable="false">
            <ellipse cx="32" cy="76" rx="16" ry="3" fill="rgba(0,0,0,0.25)" />
            {/* bacaklar */}
            <rect x="23" y="52" width="7" height="20" rx="3" fill="#1e1b4b" />
            <rect x="34" y="52" width="7" height="20" rx="3" fill="#1e1b4b" />
            <rect x="21" y="69" width="10" height="5" rx="2.5" fill="#f8fafc" />
            <rect x="33" y="69" width="10" height="5" rx="2.5" fill="#f8fafc" />
            {/* hoodie */}
            <rect x="18" y="30" width="28" height="26" rx="9" fill={p.hoodie} />
            <rect x="12" y="33" width="8" height="18" rx="4" fill={p.hoodie} />
            <rect x="44" y="33" width="8" height="18" rx="4" fill={p.hoodie} />
            <rect x="26" y="42" width="12" height="7" rx="3" fill={p.accent} opacity="0.85" />
            {/* kafa */}
            <circle cx="32" cy="20" r="11" fill="#f6c7a1" />
            {girl ? (
                <>
                    <path d="M21 19c0-8 5-12 11-12s11 4 11 12c-3-4-7-6-11-6s-8 2-11 6z" fill="#3b1d12" />
                    <path d="M42 14c7 2 9 10 6 18-1-6-3-10-7-12z" fill="#3b1d12" />
                    <circle cx="43" cy="15" r="2.2" fill={p.accent} />
                </>
            ) : (
                <>
                    <path d="M20 18c0-7 5-11 12-11s12 4 12 11z" fill={p.accent} />
                    <rect x="30" y="15" width="18" height="4" rx="2" fill={p.accent} />
                    <path d="M21 19c2-1 4-1 6 0" stroke="#3b1d12" strokeWidth="2" fill="none" />
                </>
            )}
            <circle cx="28" cy="21" r="1.3" fill="#1e1b4b" />
            <circle cx="36" cy="21" r="1.3" fill="#1e1b4b" />
            <path d="M29 25.5c2 1.5 4 1.5 6 0" stroke="#9a3412" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </svg>
    );
};

/** Kız/Erkek × 4 renk seçici. Seçim üst bileşende saklanır (localStorage). */
const CharacterPicker = ({ value, onChange }) => {
    const id = useId();
    const body = value?.body === 'erkek' ? 'erkek' : 'kiz';
    const palette = Number.isInteger(value?.palette) ? value.palette : 0;

    return (
        <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`} className="font-extrabold">Karakterin</h2>
            <div className="mt-3 flex items-center gap-4">
                <div className="game-hero flex h-28 w-24 shrink-0 items-end justify-center rounded-2xl pb-1 shadow-inner">
                    <RunnerAvatar body={body} palette={palette} className="h-24 w-20 game-float" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                    <fieldset>
                        <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tip</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {BODIES.map((b) => (
                                <label key={b.key} className="relative cursor-pointer">
                                    <input
                                        type="radio"
                                        name={`${id}-body`}
                                        value={b.key}
                                        checked={body === b.key}
                                        onChange={() => onChange({ body: b.key, palette })}
                                        className="peer sr-only"
                                    />
                                    <span className="flex min-h-[44px] items-center justify-center rounded-xl border-2 border-transparent bg-slate-100 px-3 text-sm font-bold text-slate-700 transition peer-checked:border-coral peer-checked:bg-coral/10 peer-checked:text-coral peer-focus-visible:ring-2 peer-focus-visible:ring-coral dark:bg-white/10 dark:text-slate-200">
                                        {b.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Renk</legend>
                        <div className="flex flex-wrap gap-2">
                            {PALETTES.map((p, i) => (
                                <label key={p.name} className="relative cursor-pointer" title={p.name}>
                                    <input
                                        type="radio"
                                        name={`${id}-palette`}
                                        value={i}
                                        checked={palette === i}
                                        onChange={() => onChange({ body, palette: i })}
                                        className="peer sr-only"
                                        aria-label={`${p.name} renk`}
                                    />
                                    <span
                                        className="block h-11 w-11 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-white transition peer-checked:ring-coral peer-focus-visible:ring-indigo-400 dark:ring-offset-slate-900"
                                        style={{ background: `linear-gradient(135deg, ${p.hoodie} 0%, ${p.hoodie} 55%, ${p.accent} 100%)` }}
                                        aria-hidden="true"
                                    />
                                </label>
                            ))}
                        </div>
                    </fieldset>
                </div>
            </div>
        </section>
    );
};

export default CharacterPicker;
