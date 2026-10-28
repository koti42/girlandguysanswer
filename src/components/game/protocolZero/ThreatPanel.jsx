import React from 'react';
import { LuX } from 'react-icons/lu';
import { LINK_TYPE_LABEL, NEIGHBORS, linkType } from '../../../game/protocolZero/constants';
import { archetypeOf } from '../../../game/protocolZero/archetypes';
import Sparkline from './Sparkline';
import Flag from './Flag';

/** TEHDİT paneli: YZ türü profili, canlı özellikleri, bulaşma vektörleri ve en riskli bölgeler. */
const ThreatPanel = ({ snap, onClose, onPick }) => {
    const a = archetypeOf(snap.archetype);
    const byId = Object.fromEntries(snap.nodes.map((n) => [n.id, n]));
    const vectors = { fiber: 0, submarine: 0, satellite: 0 };
    let hotTotal = 0;
    for (const id in NEIGHBORS) {
        for (const nb of NEIGHBORS[id]) {
            if (id > nb) continue;
            const x = byId[id];
            const y = byId[nb];
            if (x.isolated || y.isolated) continue;
            const hot = (x.infection > 20 && y.infection < 100) || (y.infection > 20 && x.infection < 100);
            if (hot) {
                vectors[linkType(id, nb)] += 1;
                hotTotal += 1;
            }
        }
    }
    const top = [...snap.nodes].sort((x, y) => y.infection - x.infection).slice(0, 5);
    const traits = [
        { k: 'Yayılım çarpanı', v: `×${snap.spreadMultiplier}` },
        { k: 'Temizlik etkisi', v: `-%${snap.purgeAmount}` },
        { k: 'Arka kapılar', v: `${snap.stats.reseeds} açıldı` },
        { k: 'Ele geçirilen', v: `${snap.stats.captured} merkez` },
    ];
    return (
        <aside className="pz-panel pz-card" aria-labelledby="pz-threat-title">
            <div className="pz-panel-head">
                <div className="flex items-center gap-3">
                    <span className="text-3xl leading-none" aria-hidden="true">{a.icon}</span>
                    <div>
                        <p className="pz-eyebrow">Tehdit profili</p>
                        <h2 id="pz-threat-title" className="pz-h" style={{ color: a.color }}>{a.name}</h2>
                    </div>
                </div>
                <button type="button" onClick={onClose} className="pz-icon-btn !h-9 !w-9" aria-label="Kapat">
                    <LuX aria-hidden="true" />
                </button>
            </div>
            <div className="pz-panel-body p-3">
                <p className="text-xs text-white/80">{a.lore}</p>
                <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {traits.map((t) => (
                        <div key={t.k} className="pz-stat">
                            <p className="pz-stat-label">{t.k}</p>
                            <p className="pz-stat-value pz-mono text-sm">{t.v}</p>
                        </div>
                    ))}
                </div>
                <div className="pz-stat mt-3">
                    <div className="flex items-baseline justify-between">
                        <p className="pz-stat-label">Küresel yayılım</p>
                        <p className="pz-mono text-sm font-black text-rose-200">%{Math.round(snap.dominance)}</p>
                    </div>
                    <Sparkline values={snap.history.dominance} color="#ff3b63" height={56} className="mt-1" />
                </div>
                <div className="pz-stat mt-3">
                    <p className="pz-stat-label">Bulaşma vektörleri (aktif hatlar)</p>
                    {['fiber', 'submarine', 'satellite'].map((t) => (
                        <div key={t} className="mt-1.5">
                            <div className="flex justify-between text-[11px] font-bold text-white/80">
                                <span>{LINK_TYPE_LABEL[t]}</span>
                                <span className="pz-mono">{hotTotal ? Math.round((vectors[t] / hotTotal) * 100) : 0}%</span>
                            </div>
                            <div className="pz-row-bar mt-0.5"><span style={{ width: `${hotTotal ? (vectors[t] / hotTotal) * 100 : 0}%` }} /></div>
                        </div>
                    ))}
                    {!hotTotal && <p className="mt-1 text-[10px] text-white/50">Şu an aktif sızma hattı yok.</p>}
                </div>
                <div className="pz-stat mt-3">
                    <p className="pz-stat-label">En riskli bölgeler</p>
                    <ul className="mt-1 space-y-0.5">
                        {top.map((n) => (
                            <li key={n.id}>
                                <button type="button" onClick={() => onPick(n.id)} className="pz-row w-full !grid-cols-[24px_1fr_44px]">
                                    <Flag code={n.country} size={20} />
                                    <span className="truncate text-xs font-bold text-white">{n.name}</span>
                                    <span className="pz-mono text-right text-xs font-black text-rose-200">%{Math.round(n.infection)}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-rose-500/10 p-2 ring-1 ring-rose-400/25">
                        <p className="text-[10px] font-black uppercase text-rose-200">Gücü</p>
                        <ul className="mt-1 list-disc pl-4 text-white/80">{a.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                    <div className="rounded-xl bg-cyan-400/10 p-2 ring-1 ring-cyan-300/25">
                        <p className="text-[10px] font-black uppercase text-cyan-200">Zayıf yanı</p>
                        <ul className="mt-1 list-disc pl-4 text-white/80">{a.weaknesses.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default ThreatPanel;
