import React, { useEffect, useRef, useState } from 'react';
import { LuBrush, LuCpu, LuGlobe, LuPlugZap, LuShieldPlus, LuSiren, LuWallet, LuX } from 'react-icons/lu';
import { COSTS } from '../../../game/protocolZero/constants';
import { STATUS_LABEL, fmtNum } from './pzUtils';

/** Sayı hedefe doğru yumuşakça akar (canlı sunucu sayacı). */
const useCountTo = (target, ms = 600) => {
    const [v, setV] = useState(target);
    const ref = useRef({ from: target, to: target, t0: 0 });
    useEffect(() => {
        const s = ref.current;
        s.from = v;
        s.to = target;
        s.t0 = performance.now();
        let raf = 0;
        const step = (now) => {
            const f = Math.min(1, (now - s.t0) / ms);
            const e = 1 - Math.pow(1 - f, 3);
            setV(Math.round(s.from + (s.to - s.from) * e));
            if (f < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // v kasıtlı olarak dışarıda: hedef değişince mevcut değerden başlar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target, ms]);
    return v;
};

const STATUS_CLS = {
    safe: 'text-cyan-300 ring-cyan-300/40 bg-cyan-400/10',
    warn: 'text-amber-200 ring-amber-300/40 bg-amber-400/10',
    lost: 'text-rose-200 ring-rose-400/50 bg-rose-500/15',
    isolated: 'text-slate-300 ring-slate-400/40 bg-slate-500/15',
};

/** Orta alt: seçili bölge/merkez bilgi barı + hızlı müdahale düğmeleri. */
const CountryInfo = ({ node, countryName, budget, breach, purgeAmount = COSTS.purgeAmount, onClose, onFirewall, onPurge, onIsolate, onIntervene, lastError }) => {
    const infected = useCountTo(node.infectedServers);
    const healthy = useCountTo(node.servers - node.infectedServers);
    const fwCost = node.firewallCost;
    const canFw = fwCost != null && budget >= fwCost;
    const canPurge = node.infection > 0 && budget >= COSTS.purge;
    const underAttack = breach && breach.nodeId === node.id;
    return (
        <section className="pz-glass pz-bottom-center rounded-2xl p-3" aria-label={`${node.name} bölge bilgisi`}>
            <div className="flex items-start gap-3">
                <span className="text-3xl leading-none" aria-hidden="true">{node.flag}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <h2 className="truncate text-base font-black text-white">{node.name}</h2>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold ring-1 ${STATUS_CLS[node.status]}`}>{STATUS_LABEL[node.status]}</span>
                    </div>
                    <p className="truncate text-[11px] text-white/60">
                        {countryName && countryName !== node.name ? `${countryName} bölgesi · ` : ''}
                        {node.country} · {fmtNum(node.computePower)} TFLOPS
                    </p>
                </div>
                <button type="button" onClick={onClose} className="pz-icon-btn !h-9 !w-9" aria-label="Bilgi barını kapat">
                    <LuX aria-hidden="true" />
                </button>
            </div>

            <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-xl bg-emerald-500/10 px-2 py-1.5 ring-1 ring-emerald-400/20">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-emerald-200/80">Sağlıklı sunucu</dt>
                    <dd className="pz-mono text-sm font-black text-emerald-200">{fmtNum(healthy)}</dd>
                </div>
                <div className="rounded-xl bg-rose-500/10 px-2 py-1.5 ring-1 ring-rose-400/20">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-rose-200/80">Enfekte sunucu</dt>
                    <dd className="pz-mono text-sm font-black text-rose-200">{fmtNum(infected)}</dd>
                </div>
                <div className="rounded-xl bg-white/5 px-2 py-1.5">
                    <dt className="text-[9px] font-bold uppercase tracking-wider text-white/60">Firewall</dt>
                    <dd className="pz-mono text-sm font-black text-white">
                        {node.firewall}<span className="text-[10px] text-white/50">/{COSTS.maxFirewall}</span>
                    </dd>
                </div>
            </dl>
            <div className="pz-meter pz-meter-node mt-1.5 !h-1.5" role="progressbar" aria-valuenow={Math.round(node.infection)} aria-valuemin={0} aria-valuemax={100} aria-label="YZ sızması">
                <span style={{ width: `${node.infection}%` }} />
            </div>

            {underAttack && (
                <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger pz-alarm mt-2 w-full !min-h-[44px] text-xs">
                    <LuSiren aria-hidden="true" /> MÜDAHALE ET · Sıfırıncı gün saldırısı
                </button>
            )}

            <div className="mt-2 grid grid-cols-3 gap-1.5">
                <button type="button" onClick={onFirewall} disabled={!canFw} className="pz-btn flex-col !gap-0 !px-1 !py-1.5 text-[11px]" title={fwCost == null ? 'En üst seviye' : `${fmtNum(fwCost)} ₵`}>
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
        </section>
    );
};

const MiniBar = ({ label, value, cls }) => (
    <div className="min-w-[88px]">
        <div className="flex items-baseline justify-between text-[9px] font-bold uppercase tracking-wider text-white/70">
            <span>{label}</span>
            <span className="pz-mono text-white">%{Math.round(value)}</span>
        </div>
        <div className={`pz-meter mt-0.5 !h-1.5 ${cls}`} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
    </div>
);

/**
 * Plague Inc. gösterge paneli: sol alt bütçe + SAVUNMA AĞACI; orta alt bölge bilgi barı; sağ alt DÜNYA DURUMU
 * (YZ hakimiyeti / panik / deşifre barları).
 */
const PzBottomBar = ({ snap, selectedNode, countryName, onTech, onWorld, onCloseNode, onFirewall, onPurge, onIsolate, onIntervene, lastError }) => (
    <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-2 sm:p-3" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
        {selectedNode ? (
            <div className="pointer-events-auto mx-auto w-full max-w-xl">
                <CountryInfo
                    node={selectedNode}
                    countryName={countryName}
                    budget={snap.budget}
                    breach={snap.breach}
                    purgeAmount={snap.purgeAmount}
                    onClose={onCloseNode}
                    onFirewall={onFirewall}
                    onPurge={onPurge}
                    onIsolate={onIsolate}
                    onIntervene={onIntervene}
                    lastError={lastError}
                />
            </div>
        ) : (
            <p className="pointer-events-none mx-auto rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold text-white/70">Haritada bir ülkeye ya da veri merkezine dokun</p>
        )}
        <div className="pointer-events-auto flex items-end justify-between gap-2">
            <div className="pz-glass flex items-center gap-2 rounded-2xl p-2">
                <span className="inline-flex items-center gap-1 rounded-xl bg-amber-300/10 px-2 py-1.5 text-xs font-black text-amber-200 ring-1 ring-amber-300/30 pz-mono" title="Savunma bütçesi">
                    <LuWallet aria-hidden="true" /> {fmtNum(snap.budget)} ₵
                    <span className="hidden text-[10px] font-semibold text-amber-200/70 sm:inline">+{snap.income.toFixed(1)}/sn</span>
                </span>
                <button type="button" onClick={onTech} className="pz-btn pz-btn-primary !min-h-[44px] !px-3 text-xs sm:!px-4 sm:text-sm">
                    <LuCpu aria-hidden="true" /> <span className="hidden sm:inline">SAVUNMA AĞACI</span>
                    <span className="sm:hidden">AĞAÇ</span>
                </button>
            </div>
            <div className="pz-glass flex items-center gap-2 rounded-2xl p-2">
                <div className="hidden items-center gap-2 sm:flex">
                    <MiniBar label="YZ hakimiyeti" value={snap.dominance} cls="pz-meter-ai" />
                    <MiniBar label="Panik" value={snap.panic} cls="pz-meter-panic" />
                    <MiniBar label="Deşifre" value={snap.decrypt} cls="pz-meter-decrypt" />
                </div>
                <button type="button" onClick={onWorld} className="pz-btn pz-btn-amber !min-h-[44px] !px-3 text-xs sm:text-sm">
                    <LuGlobe aria-hidden="true" /> <span className="hidden sm:inline">DÜNYA DURUMU</span>
                    <span className="sm:hidden pz-mono">YZ %{Math.round(snap.dominance)} · D %{Math.round(snap.decrypt)}</span>
                </button>
            </div>
        </div>
    </footer>
);

export default PzBottomBar;
