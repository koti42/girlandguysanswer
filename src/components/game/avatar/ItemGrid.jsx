import React, { useId } from 'react';
import { LuCheck, LuCoins, LuLock } from 'react-icons/lu';
import { lockBadgeText, lockHint } from './avatarUtils';

/*
 * Stil ızgarası. Kilitli öğe de seçilebilir (önizlemede denenir); kaydetme
 * kilitli öğe varken kapalıdır ve satın alma/kilit bilgisi ızgaranın altında
 * gösterilir. Rozetler: kilit + fiyat / seviye, satın alınmışsa "Sende",
 * seçiliyse onay işareti.
 */
const ItemGrid = ({ legend, options, value, onChange, renderPreview }) => {
    const id = useId();
    return (
        <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{legend}</legend>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
                {options.map((opt) => {
                    const { state } = opt;
                    const checked = value === opt.id;
                    const locked = !state.unlocked;
                    const owned = state.owned && state.kind === 'price';
                    const a11y = [opt.label, locked ? `kilitli, ${lockHint(state)}` : null, owned ? 'sende' : null].filter(Boolean).join(', ');
                    return (
                        <label key={opt.id} className="relative block cursor-pointer" data-testid={`item-${opt.key}`}>
                            <input
                                type="radio"
                                name={`${id}-style`}
                                value={opt.id}
                                checked={checked}
                                onChange={() => onChange(opt.id)}
                                className="peer sr-only"
                                aria-label={a11y}
                            />
                            <span className="flex h-full flex-col items-stretch rounded-2xl border-2 border-transparent bg-slate-100 p-1.5 transition hover:-translate-y-0.5 peer-checked:border-coral peer-checked:bg-coral/10 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 dark:bg-white/[0.06]">
                                <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-gradient-to-b from-[#2a1a5e] to-[#151038]">
                                    {renderPreview(opt)}
                                    {locked && (
                                        <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                            {state.kind === 'price' ? (
                                                <LuCoins className="text-amber-300" aria-hidden="true" />
                                            ) : (
                                                <LuLock aria-hidden="true" />
                                            )}
                                            <span className="tabular-nums">{lockBadgeText(state)}</span>
                                        </span>
                                    )}
                                    {owned && (
                                        <span className="absolute right-1 top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white">Sende</span>
                                    )}
                                    {checked && (
                                        <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-coral text-white shadow">
                                            <LuCheck className="text-xs" aria-hidden="true" />
                                        </span>
                                    )}
                                </span>
                                <span className="mt-1 truncate px-0.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200">{opt.label}</span>
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
};

export default ItemGrid;
