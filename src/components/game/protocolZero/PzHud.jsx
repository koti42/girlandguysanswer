import React from 'react';
import { LuCpu, LuLogOut, LuPause, LuSiren, LuVolume2, LuVolumeX, LuWallet } from 'react-icons/lu';
import { SPEEDS } from '../../../game/protocolZero/constants';
import { fmtNum, fmtSeconds } from './pzUtils';

const Meter = ({ label, value, cls, suffix = '%' }) => (
    <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-1 text-[10px] font-bold uppercase tracking-wider text-white/70">
            <span className="truncate">{label}</span>
            <span className="pz-mono text-white">
                {Math.round(value)}
                {suffix}
            </span>
        </div>
        <div className={`pz-meter mt-1 ${cls}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
            <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
        </div>
    </div>
);

/**
 * Üst komuta çubuğu: YZ hakimiyeti / panik / deşifre ölçerleri, ₵ ve gün, hız (0/1/2/4), ses, ağaç, duraklat.
 * `snap` sim.snapshot(); hız değişimi `onSpeed(n)`.
 */
const PzHud = ({ snap, speed, onSpeed, muted, onToggleMute, onTech, onPause, onExit, onIntervene, breachAlarmActive }) => (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 p-2 sm:p-3" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <div className="pointer-events-auto pz-glass rounded-2xl px-3 py-2 sm:px-4">
            <div className="flex items-center gap-3">
                <Meter label="YZ Hakimiyeti" value={snap.dominance} cls="pz-meter-ai" />
                <Meter label="Küresel Panik" value={snap.panic} cls="pz-meter-panic" />
                <Meter label="Çekirdek Deşifre" value={snap.decrypt} cls="pz-meter-decrypt" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-300/10 px-2 py-1 font-extrabold text-amber-200 ring-1 ring-amber-300/30 pz-mono" title="Compute Kredisi">
                    <LuWallet aria-hidden="true" /> {fmtNum(snap.budget)} ₵
                    <span className="text-[10px] font-semibold text-amber-200/70">+{snap.income.toFixed(1)}/sn</span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 font-bold text-white/90 pz-mono" title="Geçen gün">
                    <LuCpu aria-hidden="true" /> Gün {snap.day}
                </span>
                <div className="pz-speed ml-auto inline-flex items-center gap-0.5 rounded-xl bg-black/30 p-0.5" role="group" aria-label="Oyun hızı">
                    {SPEEDS.map((s) => (
                        <button key={s} type="button" aria-pressed={speed === s} onClick={() => onSpeed(s)} aria-label={s === 0 ? 'Duraklat' : `${s} kat hız`}>
                            {s === 0 ? <LuPause className="mx-auto" aria-hidden="true" /> : `${s}x`}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1">
                    <button type="button" className="pz-icon-btn" onClick={onToggleMute} aria-pressed={!muted} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'} title={muted ? 'Sesi aç' : 'Sesi kapat'}>
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                    </button>
                    <button type="button" className="pz-btn pz-btn-amber !min-h-[44px] !px-3" onClick={onTech} aria-label="Küresel Savunma Ağacı">
                        <LuCpu aria-hidden="true" /> <span className="hidden sm:inline">Savunma Ağacı</span>
                        <span className="sm:hidden">Ağaç</span>
                    </button>
                    <button type="button" className="pz-icon-btn" onClick={onPause} aria-label="Menü">
                        <LuPause aria-hidden="true" />
                    </button>
                    <button type="button" className="pz-icon-btn hidden sm:inline-flex" onClick={onExit} aria-label="Lobiye dön" title="Lobiye dön">
                        <LuLogOut aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
        {snap.breach && (
            <div className="pointer-events-auto mx-auto mt-2 w-fit max-w-full">
                <div className={`pz-glass pz-glass-red flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 sm:px-4 ${breachAlarmActive ? 'pz-alarm' : ''}`} role="alert">
                    <LuSiren className="text-xl text-rose-300" aria-hidden="true" />
                    <span className="text-xs font-black uppercase tracking-wider text-rose-100">
                        Sıfırıncı gün saldırısı · {snap.nodes.find((n) => n.id === snap.breach.nodeId)?.name}
                    </span>
                    <span className="pz-mono rounded-lg bg-black/40 px-2 py-0.5 text-sm font-black text-white">{fmtSeconds(snap.breach.remaining)} sn</span>
                    <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger !min-h-[40px] !px-3 text-xs">
                        MÜDAHALE ET
                    </button>
                </div>
            </div>
        )}
    </header>
);

export default PzHud;
