import React, { useEffect, useRef, useState } from 'react';
import { LuBrush, LuCable, LuPlugZap, LuSatellite, LuShieldPlus, LuShip, LuSiren, LuX } from 'react-icons/lu';
import Flag from './Flag';
import { COSTS, LINK_TYPE_LABEL, NEIGHBORS, NODE_BY_ID, linkType } from '../../../game/protocolZero/constants';
import CityArt from './CityArt';
import Sparkline from './Sparkline';
import { STATUS_LABEL, fmtNum } from './pzUtils';

/** Sayı hedefe doğru yumuşakça akar (canlı sunucu sayacı). */
const useCountTo = (target, ms = 600) => {
    const [v, setV] = useState(target);
    const ref = useRef({ from: target, to: target, t0: 0, cur: target });
    useEffect(() => {
        const s = ref.current;
        s.from = s.cur;
        s.to = target;
        s.t0 = performance.now();
        let raf = 0;
        const step = (now) => {
            const f = Math.min(1, (now - s.t0) / ms);
            const e = 1 - Math.pow(1 - f, 3);
            s.cur = Math.round(s.from + (s.to - s.from) * e);
            setV(s.cur);
            if (f < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [target, ms]);
    return v;
};

const STATUS_CLS = {
    safe: 'text-cyan-200 ring-cyan-300/40 bg-cyan-400/10',
    warn: 'text-amber-200 ring-amber-300/40 bg-amber-400/10',
    lost: 'text-rose-200 ring-rose-400/50 bg-rose-500/15',
    isolated: 'text-slate-200 ring-slate-400/40 bg-slate-500/15',
};
const ROUTE_ICON = { fiber: LuCable, submarine: LuShip, satellite: LuSatellite };

/**
 * Bölge paneli: şehir görseli, durum çubuğu, canlı sayaçlar, yayılma grafiği, bağlantı yolları ve hızlı müdahale.
 */
const RegionPanel = ({ node, nodes, countryName, budget, breach, purgeAmount = COSTS.purgeAmount, onClose, onFirewall, onPurge, onIsolate, onIntervene, onPick, lastError }) => {
    const infected = useCountTo(node.infectedServers);
    const healthy = useCountTo(node.servers - node.infectedServers);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    const def = NODE_BY_ID[node.id];
    const hist = node.history && node.history.length ? node.history : [node.infection];
    const rate = hist.length >= 2 ? (hist[hist.length - 1] - hist[hist.length - 2]) / 2 : 0;
    const fwCost = node.firewallCost;
    const canFw = fwCost != null && budget >= fwCost;
    const canPurge = node.infection > 0 && budget >= COSTS.purge;
    const underAttack = breach && breach.nodeId === node.id;
    const routes = NEIGHBORS[node.id].map((id) => {
        const nb = byId[id];
        const type = linkType(node.id, id);
        const off = node.isolated || nb.isolated;
        const hot = !off && ((nb.infection > 20 && node.infection < 100) || (node.infection > 20 && nb.infection < 100));
        return { id, nb, type, off, hot };
    });

    return (
        <aside className="pz-panel pz-card" aria-label={`${node.name} bölge paneli`}>
            <div className="pz-city">
                <CityArt nodeId={node.id} status={node.status} />
                <button type="button" onClick={onClose} className="pz-icon-btn absolute right-2 top-2 z-[2] !h-9 !w-9" aria-label="Paneli kapat">
                    <LuX aria-hidden="true" />
                </button>
                <div className="pz-city-cap">
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/40 ring-2" style={{ borderColor: 'transparent', boxShadow: `0 0 0 2px ${node.status === 'lost' ? '#ff003c' : node.status === 'warn' ? '#ffaa00' : node.status === 'isolated' ? '#64748b' : '#00f0ff'}` }}>
                        <Flag code={node.country} size={40} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="pz-eyebrow">{def?.countryName || node.country} · {fmtNum(node.computePower)} TFLOPS</p>
                        <h2 className="pz-h truncate text-2xl">{node.name}</h2>
                        {countryName && countryName !== node.name && countryName !== def?.countryName && <p className="truncate text-[11px] text-white/70">Seçilen ülke: {countryName}</p>}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1 ${STATUS_CLS[node.status]}`}>{STATUS_LABEL[node.status]}</span>
                </div>
            </div>

            <div className="pz-panel-body p-3">
                <div className="flex items-baseline justify-between">
                    <p className="pz-eyebrow">Bölge durumu</p>
                    <p className="pz-mono text-xl font-black text-white">%{Math.round(node.infection)}</p>
                </div>
                <div className="pz-meter pz-meter-node mt-1" role="progressbar" aria-valuenow={Math.round(node.infection)} aria-valuemin={0} aria-valuemax={100} aria-label="YZ sızması">
                    <span style={{ width: `${node.infection}%` }} />
                </div>

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <div className="pz-stat">
                        <p className="pz-stat-label">Enfekte sunucu</p>
                        <p className="pz-stat-value pz-mono text-rose-200">{fmtNum(infected)}</p>
                        <p className="pz-stat-sub text-rose-300/80">{rate >= 0 ? '+' : ''}{fmtNum(Math.round((rate / 100) * node.servers))} / sn</p>
                    </div>
                    <div className="pz-stat">
                        <p className="pz-stat-label">Temiz sunucu</p>
                        <p className="pz-stat-value pz-mono text-emerald-200">{fmtNum(healthy)}</p>
                        <p className="pz-stat-sub text-emerald-300/80">{Math.round(100 - node.infection)}% sağlıklı</p>
                    </div>
                    <div className="pz-stat">
                        <p className="pz-stat-label">Firewall</p>
                        <p className="pz-stat-value pz-mono">
                            {node.firewall}<span className="text-xs text-white/50">/{COSTS.maxFirewall}</span>
                        </p>
                        <div className="mt-1 flex gap-0.5" aria-hidden="true">
                            {Array.from({ length: COSTS.maxFirewall }, (_, i) => (
                                <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < node.firewall ? 'bg-cyan-300' : 'bg-white/15'}`} />
                            ))}
                        </div>
                    </div>
                </div>

                {underAttack && (
                    <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger pz-alarm mt-3 w-full !min-h-[46px] text-xs">
                        <LuSiren aria-hidden="true" /> MÜDAHALE ET · Sıfırıncı gün saldırısı · {Math.ceil(breach.remaining)} sn
                    </button>
                )}

                <div className="mt-3 grid grid-cols-3 gap-1.5">
                    <button type="button" onClick={onFirewall} disabled={!canFw} className="pz-btn flex-col !gap-0 !px-1 !py-1.5 text-[11px]">
                        <span className="flex items-center gap-1"><LuShieldPlus aria-hidden="true" /> Firewall kur</span>
                        <span className="text-[10px] font-semibold text-white/60">{fwCost == null ? 'Maks.' : `${fmtNum(fwCost)} ₵`}</span>
                    </button>
                    <button type="button" onClick={onPurge} disabled={!canPurge} className="pz-btn flex-col !gap-0 !px-1 !py-1.5 text-[11px]">
                        <span className="flex items-center gap-1"><LuBrush aria-hidden="true" /> Temizle</span>
                        <span className="text-[10px] font-semibold text-white/60">{node.infection <= 0 ? 'Temiz' : `${COSTS.purge} ₵ · -%${purgeAmount}`}</span>
                    </button>
                    <button type="button" onClick={onIsolate} aria-pressed={node.isolated} className={`pz-btn flex-col !gap-0 !px-1 !py-1.5 text-[11px] ${node.isolated ? 'pz-btn-ghost' : 'pz-btn-amber'}`}>
                        <span className="flex items-center gap-1"><LuPlugZap aria-hidden="true" /> {node.isolated ? 'Kabloyu aç' : 'Kabloyu kes'}</span>
                        <span className="text-[10px] font-semibold text-white/60">{node.isolated ? 'ağa bağla' : 'panik ↑ gelir ↓'}</span>
                    </button>
                </div>
                {lastError && (
                    <p role="status" className="mt-1.5 text-[11px] font-semibold text-rose-200">
                        {lastError}
                    </p>
                )}

                <div className="pz-region-grid mt-3">
                    <div className="pz-stat">
                        <div className="flex items-baseline justify-between">
                            <p className="pz-stat-label">Yayılma oranı</p>
                            <p className={`pz-mono text-sm font-black ${rate > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                                {rate > 0 ? '▲' : rate < 0 ? '▼' : '•'} %{Math.abs(rate).toFixed(1)}/sn
                            </p>
                        </div>
                        <Sparkline values={hist} color={node.status === 'safe' ? '#22d3ee' : '#ff3b63'} height={60} className="mt-1" />
                    </div>
                    <div className="pz-stat">
                        <p className="pz-stat-label">Bağlantı yolları</p>
                        <div className="mt-1">
                            {routes.map((r) => {
                                const RIcon = ROUTE_ICON[r.type];
                                return (
                                <button key={r.id} type="button" onClick={() => onPick?.(r.id)} className="pz-route w-full text-left" aria-label={`${r.nb.name}: ${LINK_TYPE_LABEL[r.type]}, %${Math.round(r.nb.infection)}`}>
                                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${r.hot ? 'bg-rose-500/20 text-rose-300' : 'bg-cyan-400/10 text-cyan-200'}`} aria-hidden="true"><RIcon /></span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-[11px] font-bold text-white">{r.nb.name}</span>
                                        <span className="block truncate text-[10px] text-white/65">{LINK_TYPE_LABEL[r.type]}</span>
                                    </span>
                                    <span className={`pz-mono text-[11px] font-black ${r.off ? 'text-slate-400' : r.hot ? 'text-rose-300' : 'text-cyan-200'}`}>
                                        {r.off ? 'kapalı' : `%${Math.round(r.nb.infection)}`}
                                    </span>
                                </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default RegionPanel;
