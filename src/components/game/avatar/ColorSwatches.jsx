import React, { useId } from 'react';
import { LuCheck } from 'react-icons/lu';

/*
 * Renk paleti (renkler ücretsiz). Gerçek radyo düğmeleri: ok tuşlarıyla
 * gezilir, ekran okuyucu renk adını okur. Dokunma hedefi 44 px.
 */
const ColorSwatches = ({ legend, colors, names = [], value, onChange }) => {
    const id = useId();
    return (
        <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{legend}</legend>
            <div className="flex flex-wrap gap-2">
                {colors.map((hex, i) => {
                    const name = names[i] || `Renk ${i + 1}`;
                    const checked = value === i;
                    // Açık renklerde onay işareti koyu olsun.
                    const light = parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114 > 170;
                    return (
                        <label key={hex} className="relative cursor-pointer" title={name}>
                            <input
                                type="radio"
                                name={`${id}-color`}
                                value={i}
                                checked={checked}
                                onChange={() => onChange(i)}
                                className="peer sr-only"
                                aria-label={name}
                            />
                            <span
                                className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 ring-2 ring-transparent ring-offset-2 ring-offset-white transition peer-checked:ring-coral peer-focus-visible:ring-indigo-400 dark:border-white/15 dark:ring-offset-[#17123a]"
                                style={{ backgroundColor: hex }}
                                aria-hidden="true"
                            >
                                {checked && <LuCheck className={`text-lg ${light ? 'text-slate-900' : 'text-white'}`} />}
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
};

export default ColorSwatches;
