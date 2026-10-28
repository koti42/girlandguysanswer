import React, { useEffect, useRef } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';

/**
 * Kriz ikilemi kartı: oyun durur, iki zor seçenek. `dilemma` = snapshot.dilemma; `onChoose(index)`.
 * Kapatılamaz: bir seçim yapılmadan oyun sürmez.
 */
const DilemmaModal = ({ dilemma, onChoose }) => {
    const firstRef = useRef(null);
    useEffect(() => {
        if (dilemma) firstRef.current?.focus();
    }, [dilemma]);
    if (!dilemma) return null;

    return (
        <div className="pz-modal-backdrop">
            <div className="pz-modal pz-glass pz-scan max-w-lg p-5 sm:p-6" role="alertdialog" aria-modal="true" aria-labelledby="pz-dilemma-title" aria-describedby="pz-dilemma-body">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200 ring-1 ring-amber-300/30">
                    <LuTriangleAlert aria-hidden="true" /> Kriz kartı · Karar gerekli
                </p>
                <h2 id="pz-dilemma-title" className="mt-3 text-xl font-black leading-tight text-white sm:text-2xl">
                    {dilemma.title}
                </h2>
                <p id="pz-dilemma-body" className="mt-2 text-sm text-white/80">
                    {dilemma.body}
                </p>
                <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {dilemma.options.map((o, i) => (
                        <button
                            key={o.label}
                            ref={i === 0 ? firstRef : null}
                            type="button"
                            onClick={() => onChoose(i)}
                            className={`flex min-h-[64px] flex-col items-start rounded-2xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${
                                i === 0 ? 'border-cyan-300/50 bg-cyan-400/10 hover:bg-cyan-400/20' : 'border-rose-300/50 bg-rose-500/10 hover:bg-rose-500/20'
                            }`}
                        >
                            <span className="text-xs font-black uppercase tracking-wider text-white/60">{i === 0 ? 'A' : 'B'}</span>
                            <span className="text-sm font-extrabold text-white">{o.label}</span>
                            <span className="mt-0.5 text-[11px] text-white/70">{o.hint}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DilemmaModal;
