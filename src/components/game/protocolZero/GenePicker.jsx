import React from 'react';
import { LuLock } from 'react-icons/lu';
import { GENES, GENE_CATEGORIES, levelFor, unlockedGenes } from '../../../game/protocolZero/progression';

/**
 * Protokol Genleri (gen yuvaları): 5 kategori, her birinden en fazla bir gen.
 * Kilitli genler seviye gereksinimiyle gösterilir. `value` kuşanılan anahtarlar, `onChange(keys)`.
 */
const GenePicker = ({ xp = 0, value = [], onChange }) => {
    const unlocked = new Set(unlockedGenes(xp));
    const { level } = levelFor(xp);
    const toggle = (g) => {
        if (!unlocked.has(g.key)) return;
        const others = value.filter((k) => GENES.find((x) => x.key === k)?.category !== g.category);
        onChange(value.includes(g.key) ? others : [...others, g.key]);
    };
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="Protokol genleri">
            {GENE_CATEGORIES.map((cat) => (
                <div key={cat.key} className="rounded-2xl bg-black/25 p-2 ring-1 ring-white/10">
                    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider" style={{ color: cat.color }}>
                        <span aria-hidden="true">{cat.icon}</span> {cat.name}
                    </p>
                    <div className="space-y-1.5">
                        {GENES.filter((g) => g.category === cat.key).map((g) => {
                            const open = unlocked.has(g.key);
                            const active = value.includes(g.key);
                            return (
                                <button
                                    key={g.key}
                                    type="button"
                                    className="pz-gene"
                                    style={{ '--g': cat.color }}
                                    aria-pressed={active}
                                    disabled={!open}
                                    onClick={() => toggle(g)}
                                    aria-label={`${g.name}${open ? '' : `, seviye ${g.level} gerekir`}${active ? ', kuşanıldı' : ''}`}
                                >
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-extrabold">{g.name}</span>
                                        {open ? (
                                            <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-white/20'}`} aria-hidden="true" />
                                        ) : (
                                            <span className="flex items-center gap-1 text-[10px] font-bold text-white/60">
                                                <LuLock aria-hidden="true" /> Sv {g.level}
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-[10px] leading-snug text-white/70">{g.desc}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
            <p className="text-[11px] text-white/60 sm:col-span-2 lg:col-span-5">
                Seviye {level}: {unlocked.size}/{GENES.length} gen açık. Her görev tecrübe puanı kazandırır; her kategoriden tek gen kuşanılır.
            </p>
        </div>
    );
};

export default GenePicker;
