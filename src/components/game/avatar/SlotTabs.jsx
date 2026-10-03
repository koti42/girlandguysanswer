import React, { useRef } from 'react';
import { LuDroplet, LuFootprints, LuGlasses, LuPersonStanding, LuScissors, LuShirt, LuSparkles } from 'react-icons/lu';
import ItemIcon from './ItemIcon';
import { panelId, tabId } from './avatarUtils';

/*
 * Kategori sekmeleri (catalog SLOTS). 8 sekme dar ekranda 4x2 ızgara,
 * genişte tek satır: yatay kaydırma yok, hepsi görünür. WAI-ARIA sekme
 * deseni: ok tuşları / Home / End ile gezinme, yalnız seçili sekme Tab
 * sırasında. Kilitli seçim içeren sekmede küçük uyarı noktası.
 */
const PantsIcon = ({ className }) => (
    <span className={`inline-block h-[1.15em] w-[1.15em] ${className}`} aria-hidden="true">
        <ItemIcon itemKey="bottom:jean" color="currentColor" className="h-full w-full" />
    </span>
);

const ICONS = {
    body: LuPersonStanding,
    skin: LuDroplet,
    hair: LuScissors,
    top: LuShirt,
    bottom: PantsIcon,
    shoes: LuFootprints,
    acc: LuGlasses,
    trail: LuSparkles,
};

const SlotTabs = ({ slots, active, onChange, baseId, flagged = [] }) => {
    const refs = useRef({});

    const onKeyDown = (e) => {
        const i = slots.findIndex((s) => s.id === active);
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % slots.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + slots.length) % slots.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = slots.length - 1;
        if (next == null) return;
        e.preventDefault();
        const id = slots[next].id;
        onChange(id);
        refs.current[id]?.focus();
    };

    return (
        <div role="tablist" aria-label="Karakter parçaları" className="grid grid-cols-4 gap-1 rounded-2xl bg-slate-100 p-1 sm:grid-cols-8 dark:bg-white/[0.06]" onKeyDown={onKeyDown}>
            {slots.map((s) => {
                const Icon = ICONS[s.id] || LuSparkles;
                const selected = s.id === active;
                return (
                    <button
                        key={s.id}
                        ref={(el) => {
                            refs.current[s.id] = el;
                        }}
                        type="button"
                        role="tab"
                        id={tabId(baseId, s.id)}
                        aria-selected={selected}
                        aria-controls={panelId(baseId, s.id)}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(s.id)}
                        className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-coral sm:text-xs ${
                            selected
                                ? 'bg-gradient-to-r from-coral to-fuchsia-500 text-white shadow-md'
                                : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-white/10'
                        }`}
                    >
                        <Icon className="text-lg" aria-hidden="true" />
                        <span className="max-w-full truncate">{s.label}</span>
                        {flagged.includes(s.id) && (
                            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-[#17123a]" aria-label="kilitli seçim var" role="img" />
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default SlotTabs;
