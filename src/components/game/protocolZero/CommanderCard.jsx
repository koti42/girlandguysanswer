import React from 'react';
import { LuMedal } from 'react-icons/lu';
import { levelFor } from '../../../game/protocolZero/progression';
import { fmtNum } from './pzUtils';

/** Komutan rütbesi ve XP ilerlemesi. */
const CommanderCard = ({ xp = 0, name, compact = false }) => {
    const lv = levelFor(xp);
    return (
        <div className={`pz-rank-card rounded-2xl ring-1 ring-cyan-300/20 ${compact ? 'p-3' : 'p-4'}`} role="group" aria-label={`Rütbe: ${lv.rank}, seviye ${lv.level}`}>
            <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-2xl text-white shadow-lg" aria-hidden="true">
                    <LuMedal />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Seviye {lv.level} · {name || 'Komutan'}</p>
                    <p className="truncate text-lg font-black">{lv.rank}</p>
                </div>
                <p className="pz-mono text-right text-xs font-bold text-white/70">
                    {fmtNum(lv.xp)} XP
                    {lv.next != null && <span className="block text-[10px] text-white/50">/ {fmtNum(lv.next)}</span>}
                </p>
            </div>
            <div className="pz-meter pz-meter-decrypt mt-3" role="progressbar" aria-valuenow={lv.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Seviye ilerlemesi">
                <span style={{ width: `${lv.percent}%` }} />
            </div>
            {!compact && <p className="mt-1 text-[11px] text-white/60">{lv.max ? 'En yüksek rütbe.' : `Bir sonraki rütbeye ${fmtNum(lv.next - lv.xp)} XP.`}</p>}
        </div>
    );
};

export default CommanderCard;
