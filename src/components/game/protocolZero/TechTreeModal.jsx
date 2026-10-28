import React, { useEffect, useRef } from 'react';
import { LuCheck, LuLock, LuX } from 'react-icons/lu';
import { TECH_TREE } from '../../../game/protocolZero/constants';
import { fmtNum } from './pzUtils';

/**
 * Küresel Savunma Ağacı: 3 kategori × 3 geliştirme. `techs` = snapshot.techs, `budget`,
 * `onBuy(id)` → sim.buyTech sonucu; hata metni `lastError` ile gösterilir.
 */
const TechTreeModal = ({ open, techs, budget, onBuy, onClose, lastError }) => {
    const firstRef = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        firstRef.current?.focus();
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="pz-modal-backdrop" onClick={onClose}>
            <div className="pz-modal pz-glass pz-scan p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pz-tech-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Küresel Savunma Ağacı</p>
                        <h2 id="pz-tech-title" className="text-xl font-black text-white">Geliştirmeler</h2>
                        <p className="text-xs text-white/60">
                            Bütçe: <span className="pz-mono font-extrabold text-amber-200">{fmtNum(budget)} ₵</span> · Oyun duraklatıldı
                        </p>
                    </div>
                    <button ref={firstRef} type="button" onClick={onClose} className="pz-icon-btn" aria-label="Kapat">
                        <LuX aria-hidden="true" />
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    {TECH_TREE.map((cat) => (
                        <section key={cat.key} aria-labelledby={`pz-cat-${cat.key}`}>
                            <h3 id={`pz-cat-${cat.key}`} className="mb-2 text-xs font-black uppercase tracking-wider" style={{ color: cat.color }}>
                                {cat.name}
                            </h3>
                            <ul className="space-y-2">
                                {cat.items.map((t) => {
                                    const owned = Boolean(techs[t.id]);
                                    const locked = t.requires && !techs[t.requires];
                                    const affordable = budget >= t.cost;
                                    return (
                                        <li key={t.id}>
                                            <button
                                                type="button"
                                                disabled={owned || locked || !affordable}
                                                onClick={() => onBuy(t.id)}
                                                className={`w-full rounded-2xl border p-3 text-left transition ${
                                                    owned
                                                        ? 'border-emerald-400/50 bg-emerald-500/10'
                                                        : locked
                                                          ? 'border-white/10 bg-white/5 opacity-60'
                                                          : affordable
                                                            ? 'border-cyan-300/40 bg-cyan-400/10 hover:bg-cyan-400/20'
                                                            : 'border-white/10 bg-white/5'
                                                } focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
                                                aria-label={`${t.name}, ${t.cost} kredi${owned ? ', alındı' : locked ? ', kilitli' : ''}`}
                                            >
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-sm font-extrabold text-white">{t.name}</span>
                                                    <span className="pz-mono shrink-0 text-xs font-black text-amber-200">
                                                        {owned ? <LuCheck className="text-emerald-300" aria-hidden="true" /> : locked ? <LuLock aria-hidden="true" /> : `${fmtNum(t.cost)} ₵`}
                                                    </span>
                                                </span>
                                                <span className="mt-1 block text-[11px] leading-snug text-white/70">{t.desc}</span>
                                                {locked && <span className="mt-1 block text-[10px] font-bold text-white/50">Önce: {cat.items.find((x) => x.id === t.requires)?.name}</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
                {lastError && (
                    <p role="status" className="mt-3 text-xs font-semibold text-rose-200">
                        {lastError}
                    </p>
                )}
            </div>
        </div>
    );
};

export default TechTreeModal;
