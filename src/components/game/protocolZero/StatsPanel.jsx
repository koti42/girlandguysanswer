import React, { useEffect, useRef, useState } from 'react';
import { LuChevronRight, LuDna, LuGlobe, LuNewspaper, LuX } from 'react-icons/lu';
import { NODE_BY_ID, TECH_TREE } from '../../../game/protocolZero/constants';
import CityArt from './CityArt';
import Flag from './Flag';
import Sparkline from './Sparkline';
import { STATUS_LABEL, fmtNum } from './pzUtils';

const Bar = ({ label, value, color, sub }) => (
    <div>
        <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-wider text-white/70">
            <span>{label}</span>
            <span className="pz-mono text-sm text-white">%{Math.round(value)}</span>
        </div>
        <div className="pz-row-bar mt-1 !h-1.5">
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
        </div>
        {sub && <p className="mt-0.5 text-[10px] text-white/50">{sub}</p>}
    </div>
);

/**
 * DÜNYA DURUMU / DEŞİFRE: sol — küresel durum ve bölge listesi; orta — seçili bölge ve küresel grafikler;
 * sağ — küresel araştırma çubukları ve haberler.
 */
const StatsPanel = ({ open, snap, selectedId, onPick, onClose }) => {
    const [focus, setFocus] = useState(selectedId);
    const firstRef = useRef(null);
    useEffect(() => {
        if (open) {
            setFocus(selectedId || [...snap.nodes].sort((a, b) => b.infection - a.infection)[0]?.id || null);
            firstRef.current?.focus();
        }
        // snap kasıtlı olarak dışarıda: yalnızca açılışta ilk odak belirlenir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedId]);
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;

    const sorted = [...snap.nodes].sort((a, b) => b.infection - a.infection);
    const node = snap.nodes.find((n) => n.id === focus) || sorted[0];
    const def = NODE_BY_ID[node.id];
    const owned = (cat) => cat.items.filter((t) => snap.techs[t.id]).length;
    const news = snap.log.slice(0, 8);

    return (
        <div className="pz-modal-backdrop" onClick={onClose}>
            <div className="pz-modal pz-stats-modal pz-card pz-scan p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="pz-stats-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-200 ring-1 ring-cyan-300/30" aria-hidden="true">
                            <LuGlobe />
                        </span>
                        <div>
                            <p className="pz-eyebrow">Küresel durum</p>
                            <h2 id="pz-stats-title" className="pz-h text-2xl">Dünya Durumu / Deşifre</h2>
                        </div>
                    </div>
                    <button ref={firstRef} type="button" onClick={onClose} className="pz-icon-btn" aria-label="Kapat">
                        <LuX aria-hidden="true" />
                    </button>
                </div>

                <div className="pz-stats-grid mt-4">
                    {/* Sol: liste */}
                    <section className="pz-stat !p-2" aria-label="Bölge listesi">
                        <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/30">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-black text-white">Dünya Genel Durum</span>
                                <span className="pz-mono text-sm font-black text-rose-200">%{Math.round(snap.dominance)}</span>
                            </div>
                            <div className="pz-row-bar mt-1"><span style={{ width: `${snap.dominance}%` }} /></div>
                        </div>
                        <ul className="pz-stats-list mt-2 max-h-[52vh] space-y-0.5 overflow-y-auto pr-1">
                            {sorted.map((n) => (
                                <li key={n.id}>
                                    <button type="button" onClick={() => setFocus(n.id)} aria-current={n.id === node.id ? 'true' : undefined} className="pz-row w-full">
                                        <Flag code={n.country} size={22} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-xs font-bold text-white">{n.name}</span>
                                            <span className="pz-row-bar mt-0.5 block"><span style={{ width: `${n.infection}%`, background: n.status === 'isolated' ? '#64748b' : undefined }} /></span>
                                        </span>
                                        <span className="pz-mono text-right text-xs font-black text-white">%{Math.round(n.infection)}</span>
                                        <LuChevronRight className="text-white/40" aria-hidden="true" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>

                    {/* Orta: seçili bölge + küresel grafikler */}
                    <section className="pz-stat !p-0 overflow-hidden" aria-label="Seçili bölge">
                        <div className="pz-city !h-[120px]">
                            <CityArt nodeId={node.id} status={node.status} compact />
                            <div className="pz-city-cap">
                                <Flag code={node.country} size={40} />
                                <div className="min-w-0 flex-1">
                                    <h3 className="pz-h text-xl">{node.name}</h3>
                                    <p className="text-[11px] uppercase tracking-wider text-white/70">{def?.countryName || node.country} · {STATUS_LABEL[node.status]}</p>
                                </div>
                                <button type="button" onClick={() => { onPick(node.id); onClose(); }} className="pz-btn !min-h-[36px] !px-3 text-[11px]">
                                    Haritada göster
                                </button>
                            </div>
                        </div>
                        <div className="p-3">
                            <Bar label="Bölge durumu" value={node.infection} color="linear-gradient(90deg,#ffaa00,#ff003c)" />
                            <div className="mt-3 grid grid-cols-3 gap-1.5">
                                <div className="pz-stat">
                                    <p className="pz-stat-label">Enfekte sunucu</p>
                                    <p className="pz-stat-value pz-mono text-rose-200">{fmtNum(node.infectedServers)}</p>
                                </div>
                                <div className="pz-stat">
                                    <p className="pz-stat-label">Temiz sunucu</p>
                                    <p className="pz-stat-value pz-mono text-emerald-200">{fmtNum(node.servers - node.infectedServers)}</p>
                                </div>
                                <div className="pz-stat">
                                    <p className="pz-stat-label">Firewall</p>
                                    <p className="pz-stat-value pz-mono">{node.firewall}/5</p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="pz-stat">
                                    <p className="pz-stat-label">YZ hakimiyeti</p>
                                    <Sparkline values={snap.history.dominance} color="#ff3b63" height={48} />
                                </div>
                                <div className="pz-stat">
                                    <p className="pz-stat-label">Küresel panik</p>
                                    <Sparkline values={snap.history.panic} color="#fbbf24" height={48} />
                                </div>
                                <div className="pz-stat">
                                    <p className="pz-stat-label">Deşifre</p>
                                    <Sparkline values={snap.history.decrypt} color="#a78bfa" height={48} />
                                </div>
                            </div>
                            <p className="mt-2 text-[10px] text-white/50">
                                {fmtNum(snap.infectedServers)} / {fmtNum(snap.totalServers)} sunucu enfekte · YZ yayılım çarpanı ×{snap.spreadMultiplier}
                            </p>
                        </div>
                    </section>

                    {/* Sağ: araştırma + haberler */}
                    <section className="flex flex-col gap-3" aria-label="Araştırma ve haberler">
                        <div className="pz-stat">
                            <div className="flex items-center gap-2">
                                <LuDna className="text-violet-300" aria-hidden="true" />
                                <div>
                                    <p className="pz-eyebrow">Küresel araştırma</p>
                                    <p className="text-[11px] text-white/60">Dünya genelinde çalışmalar</p>
                                </div>
                            </div>
                            <div className="mt-3 space-y-3">
                                <Bar label="Çekirdek deşifre" value={snap.decrypt} color="linear-gradient(90deg,#67e8f9,#a78bfa)" sub={`+%${(snap.decryptRate * 60).toFixed(2)} / dk`} />
                                {TECH_TREE.map((cat) => (
                                    <Bar key={cat.key} label={cat.name} value={(owned(cat) / cat.items.length) * 100} color={cat.color} />
                                ))}
                                <Bar label="Küresel panik" value={snap.panic} color="linear-gradient(90deg,#ffd166,#ffaa00)" sub={snap.panicRate > 0 ? `+${snap.panicRate.toFixed(2)} / sn` : `${snap.panicRate.toFixed(2)} / sn`} />
                            </div>
                        </div>
                        <div className="pz-stat flex-1">
                            <div className="flex items-center gap-2">
                                <LuNewspaper className="text-cyan-200" aria-hidden="true" />
                                <p className="pz-eyebrow">Haberler</p>
                            </div>
                            <ul className="mt-2 space-y-1.5">
                                {news.map((l) => (
                                    <li key={l.id} className="flex items-start gap-2 text-[11px] leading-snug">
                                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${l.kind === 'alert' ? 'bg-rose-400' : l.kind === 'good' ? 'bg-emerald-400' : 'bg-cyan-300'}`} aria-hidden="true" />
                                        <span className="min-w-0 flex-1 text-white/85">{l.text}</span>
                                        <span className="shrink-0 pz-mono text-[10px] text-white/65">{snap.day - l.day === 0 ? 'bugün' : `${snap.day - l.day} gün önce`}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default StatsPanel;
