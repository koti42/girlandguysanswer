import React from 'react';
import { LuCheck, LuLock, LuX } from 'react-icons/lu';
import { TECH_TREE } from '../../../game/protocolZero/constants';
import { GENE_BY_KEY } from '../../../game/protocolZero/progression';
import Sparkline from './Sparkline';
import { fmtNum } from './pzUtils';

/**
 * KÜRESEL ARAŞTIRMA paneli: çekirdek deşifre ilerlemesi ve grafiği, üç program (kategori) ilerleme çubuğu,
 * geliştirme satın alma, kuşanılan protokol genleri.
 */
const ResearchPanel = ({ snap, onBuy, onClose, lastError }) => {
    const owned = (cat) => cat.items.filter((t) => snap.techs[t.id]).length;
    return (
        <aside className="pz-panel pz-card" aria-labelledby="pz-research-title">
            <div className="pz-panel-head">
                <div>
                    <p className="pz-eyebrow">Küresel araştırma</p>
                    <h2 id="pz-research-title" className="pz-h">Savunma Ağacı</h2>
                </div>
                <div className="flex items-center gap-2">
                    <span className="pz-mono rounded-lg bg-amber-300/10 px-2 py-1 text-xs font-black text-amber-200 ring-1 ring-amber-300/30">{fmtNum(snap.budget)} ₵</span>
                    <button type="button" onClick={onClose} className="pz-icon-btn !h-9 !w-9" aria-label="Kapat">
                        <LuX aria-hidden="true" />
                    </button>
                </div>
            </div>
            <div className="pz-panel-body p-3">
                <div className="pz-stat">
                    <div className="flex items-baseline justify-between">
                        <p className="pz-stat-label">Çekirdek deşifre</p>
                        <p className="pz-mono text-xl font-black text-violet-200">%{Math.round(snap.decrypt)}</p>
                    </div>
                    <div className="pz-meter pz-meter-decrypt mt-1"><span style={{ width: `${snap.decrypt}%` }} /></div>
                    <p className="mt-1 text-[10px] text-white/55">+%{(snap.decryptRate * 60).toFixed(2)} / dk · temiz işlem gücü × hızlandırıcılar</p>
                    <Sparkline values={snap.history.decrypt} color="#a78bfa" height={44} className="mt-1" />
                </div>

                {TECH_TREE.map((cat) => (
                    <section key={cat.key} className="mt-3" aria-labelledby={`pz-rc-${cat.key}`}>
                        <div className="flex items-center justify-between">
                            <h3 id={`pz-rc-${cat.key}`} className="text-[11px] font-black uppercase tracking-wider" style={{ color: cat.color }}>
                                {cat.name}
                            </h3>
                            <span className="pz-mono text-[11px] font-bold text-white/70">%{Math.round((owned(cat) / cat.items.length) * 100)}</span>
                        </div>
                        <div className="pz-row-bar mt-1">
                            <span style={{ width: `${(owned(cat) / cat.items.length) * 100}%`, background: cat.color }} />
                        </div>
                        <ul className="mt-2 space-y-1.5">
                            {cat.items.map((t) => {
                                const has = Boolean(snap.techs[t.id]);
                                const locked = t.requires && !snap.techs[t.requires];
                                const cost = Math.round(t.cost * (snap.techCost || 1));
                                const can = !has && !locked && snap.budget >= cost;
                                return (
                                    <li key={t.id}>
                                        <button
                                            type="button"
                                            disabled={has || locked || !can}
                                            onClick={() => onBuy(t.id)}
                                            className={`w-full rounded-xl border p-2.5 text-left transition ${
                                                has ? 'border-emerald-400/50 bg-emerald-500/10' : locked ? 'border-white/10 bg-white/5 opacity-60' : can ? 'border-cyan-300/40 bg-cyan-400/10 hover:bg-cyan-400/20' : 'border-white/10 bg-white/5'
                                            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-white`}
                                            aria-label={`${t.name}, ${cost} kredi${has ? ', alındı' : locked ? ', kilitli' : ''}`}
                                        >
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-extrabold text-white">{t.name}</span>
                                                <span className="pz-mono shrink-0 text-xs font-black text-amber-200">
                                                    {has ? <LuCheck className="text-emerald-300" aria-hidden="true" /> : locked ? <LuLock aria-hidden="true" /> : `${fmtNum(cost)} ₵`}
                                                </span>
                                            </span>
                                            <span className="mt-0.5 block text-[11px] leading-snug text-white/70">{t.desc}</span>
                                            {locked && <span className="mt-0.5 block text-[10px] font-bold text-white/50">Önce: {cat.items.find((x) => x.id === t.requires)?.name}</span>}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}

                {snap.genes?.length > 0 && (
                    <section className="mt-3 pz-stat" aria-label="Kuşanılan protokol genleri">
                        <p className="pz-stat-label">Protokol genleri (etkin)</p>
                        <ul className="mt-1 flex flex-wrap gap-1">
                            {snap.genes.map((k) => (
                                <li key={k} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-cyan-100" title={GENE_BY_KEY[k]?.desc}>
                                    {GENE_BY_KEY[k]?.name || k}
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
                {lastError && (
                    <p role="status" className="mt-2 text-[11px] font-semibold text-rose-200">
                        {lastError}
                    </p>
                )}
            </div>
        </aside>
    );
};

export default ResearchPanel;
