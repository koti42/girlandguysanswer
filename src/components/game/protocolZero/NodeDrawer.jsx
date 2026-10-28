import React from 'react';
import { LuBrush, LuPlugZap, LuShieldPlus, LuSiren, LuX } from 'react-icons/lu';
import { COSTS } from '../../../game/protocolZero/constants';
import { STATUS_LABEL, fmtNum } from './pzUtils';

const STATUS_CLS = {
    safe: 'text-cyan-300 ring-cyan-300/40 bg-cyan-400/10',
    warn: 'text-amber-200 ring-amber-300/40 bg-amber-400/10',
    lost: 'text-rose-200 ring-rose-400/50 bg-rose-500/15',
    isolated: 'text-slate-300 ring-slate-400/40 bg-slate-500/15',
};

/**
 * Düğüm kontrol paneli: dar ekranda alt çekmece, geniş ekranda sağ panel.
 * node: snapshot.nodes[i]; breach: snapshot.breach; actions: { firewall, purge, isolate, intervene }.
 */
const NodeDrawer = ({ node, budget, breach, onClose, onFirewall, onPurge, onIsolate, onIntervene, lastError }) => {
    if (!node) return null;
    const fwCost = node.firewallCost;
    const canFw = fwCost != null && budget >= fwCost;
    const canPurge = node.infection > 0 && budget >= COSTS.purge;
    const underAttack = breach && breach.nodeId === node.id;

    return (
        <aside className="pz-sheet pz-glass z-30 p-4" aria-label={`${node.name} düğüm paneli`}>
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">{node.country} · {fmtNum(node.computePower)} TFLOPS</p>
                    <h2 className="truncate text-xl font-black text-white">{node.name}</h2>
                    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ${STATUS_CLS[node.status]}`}>{STATUS_LABEL[node.status]}</span>
                </div>
                <button type="button" onClick={onClose} className="pz-icon-btn" aria-label="Paneli kapat">
                    <LuX aria-hidden="true" />
                </button>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/5 p-2">
                    <dt className="text-[10px] font-bold uppercase text-white/60">YZ sızması</dt>
                    <dd className="pz-mono text-lg font-black text-white">%{Math.round(node.infection)}</dd>
                    <div className="pz-meter pz-meter-node mt-1 !h-1.5"><span style={{ width: `${node.infection}%` }} /></div>
                </div>
                <div className="rounded-xl bg-white/5 p-2">
                    <dt className="text-[10px] font-bold uppercase text-white/60">Firewall</dt>
                    <dd className="pz-mono text-lg font-black text-white">
                        {node.firewall}<span className="text-xs text-white/50">/{COSTS.maxFirewall}</span>
                    </dd>
                    <div className="mt-1 flex justify-center gap-0.5" aria-hidden="true">
                        {Array.from({ length: COSTS.maxFirewall }, (_, i) => (
                            <span key={i} className={`h-1.5 w-3 rounded-sm ${i < node.firewall ? 'bg-cyan-300' : 'bg-white/15'}`} />
                        ))}
                    </div>
                </div>
                <div className="rounded-xl bg-white/5 p-2">
                    <dt className="text-[10px] font-bold uppercase text-white/60">Yerel panik</dt>
                    <dd className="pz-mono text-lg font-black text-white">%{node.panic}</dd>
                    <div className="pz-meter pz-meter-panic mt-1 !h-1.5"><span style={{ width: `${node.panic}%` }} /></div>
                </div>
            </dl>

            {underAttack && (
                <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger pz-alarm mt-3 w-full !min-h-[52px] text-sm">
                    <LuSiren aria-hidden="true" /> MÜDAHALE ET · Sıfırıncı gün saldırısı
                </button>
            )}

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" onClick={onFirewall} disabled={!canFw} className="pz-btn flex-col !items-start !gap-0.5 !py-2 text-left">
                    <span className="flex items-center gap-1"><LuShieldPlus aria-hidden="true" /> Firewall güçlendir</span>
                    <span className="text-[11px] font-semibold text-white/60">{fwCost == null ? 'En üst seviye' : `${fmtNum(fwCost)} ₵ · sızmayı yavaşlatır`}</span>
                </button>
                <button type="button" onClick={onPurge} disabled={!canPurge} className="pz-btn flex-col !items-start !gap-0.5 !py-2 text-left">
                    <span className="flex items-center gap-1"><LuBrush aria-hidden="true" /> Anti-YZ temizliği</span>
                    <span className="text-[11px] font-semibold text-white/60">{node.infection <= 0 ? 'Düğüm temiz' : `${COSTS.purge} ₵ · anında -%${COSTS.purgeAmount}`}</span>
                </button>
                <button type="button" onClick={onIsolate} aria-pressed={node.isolated} className={`pz-btn flex-col !items-start !gap-0.5 !py-2 text-left ${node.isolated ? 'pz-btn-ghost' : 'pz-btn-amber'}`}>
                    <span className="flex items-center gap-1"><LuPlugZap aria-hidden="true" /> {node.isolated ? 'Ağa yeniden bağla' : 'Kabloyu kes (izole et)'}</span>
                    <span className="text-[11px] font-semibold text-white/60">{node.isolated ? 'Gelir ve YZ geçişi geri gelir' : 'YZ geçişi durur · panik ↑ · gelir kesilir'}</span>
                </button>
            </div>
            {lastError && (
                <p role="status" className="mt-2 text-xs font-semibold text-rose-200">
                    {lastError}
                </p>
            )}
        </aside>
    );
};

export default NodeDrawer;
