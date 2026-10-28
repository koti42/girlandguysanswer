import React, { useEffect, useRef } from 'react';
import { LuX } from 'react-icons/lu';
import { STATUS_LABEL, fmtNum } from './pzUtils';

const Bar = ({ label, value, cls, sub }) => (
    <div>
        <div className="flex items-baseline justify-between text-[11px] font-bold uppercase tracking-wider text-white/70">
            <span>{label}</span>
            <span className="pz-mono text-base text-white">%{Math.round(value)}</span>
        </div>
        <div className={`pz-meter mt-1 ${cls}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
        {sub && <p className="mt-0.5 text-[10px] text-white/50">{sub}</p>}
    </div>
);

const DOT = { safe: 'bg-cyan-300', warn: 'bg-amber-300', lost: 'bg-rose-400', isolated: 'bg-slate-400' };

/** "DÜNYA DURUMU / DEŞİFRE" penceresi: küresel barlar + 14 merkezin listesi (dokununca seçer). */
const WorldStatusModal = ({ open, snap, onClose, onPick }) => {
    const firstRef = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        firstRef.current?.focus();
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;
    const totalServers = snap.nodes.reduce((s, n) => s + n.servers, 0);
    const infected = snap.nodes.reduce((s, n) => s + n.infectedServers, 0);
    const sorted = [...snap.nodes].sort((a, b) => b.infection - a.infection);

    return (
        <div className="pz-modal-backdrop" onClick={onClose}>
            <div className="pz-modal pz-glass pz-scan max-w-lg p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="pz-world-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Küresel durum</p>
                        <h2 id="pz-world-title" className="text-xl font-black text-white">Dünya Durumu / Deşifre</h2>
                    </div>
                    <button ref={firstRef} type="button" onClick={onClose} className="pz-icon-btn" aria-label="Kapat">
                        <LuX aria-hidden="true" />
                    </button>
                </div>
                <div className="mt-4 space-y-3">
                    <Bar label="Küresel YZ hakimiyeti" value={snap.dominance} cls="pz-meter-ai" sub={`${fmtNum(infected)} / ${fmtNum(totalServers)} sunucu enfekte`} />
                    <Bar label="Küresel panik" value={snap.panic} cls="pz-meter-panic" sub={snap.panicRate > 0 ? `+${snap.panicRate.toFixed(2)} / sn yükseliyor` : `${snap.panicRate.toFixed(2)} / sn düşüyor`} />
                    <Bar label="Çekirdek deşifre" value={snap.decrypt} cls="pz-meter-decrypt" sub={`+${(snap.decryptRate * 60).toFixed(2)} / dk · temiz işlem gücü ve hızlandırıcılarla artar`} />
                </div>
                <ul className="mt-4 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {sorted.map((n) => (
                        <li key={n.id}>
                            <button
                                type="button"
                                onClick={() => {
                                    onPick(n.id);
                                    onClose();
                                }}
                                className="flex w-full items-center gap-2 rounded-xl bg-white/5 px-2 py-1.5 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                            >
                                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[n.status]}`} aria-hidden="true" />
                                <span className="text-base leading-none" aria-hidden="true">{n.flag}</span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{n.name}</span>
                                <span className="text-[10px] font-semibold text-white/50">{STATUS_LABEL[n.status]}</span>
                                <span className="pz-mono text-sm font-black text-white">%{Math.round(n.infection)}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default WorldStatusModal;
