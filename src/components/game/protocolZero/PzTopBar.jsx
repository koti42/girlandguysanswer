import React from 'react';
import { LuCalendarDays, LuMenu, LuPause, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { DAY_SECONDS, SPEEDS } from '../../../game/protocolZero/constants';
import { formatGameDate } from './pzUtils';

const SPEED_LABEL = { 0: '||', 1: '>', 2: '>>', 4: '>>>' };
const SPEED_NAME = { 0: 'Duraklat', 1: 'Normal', 2: 'Hızlı', 4: 'Ultra' };

/**
 * Sağ üst: gerçek takvim (başlangıç tarihi + gün), gün içi ilerleme çubuğu, hız düğmeleri (|| > >> >>>),
 * ses ve menü. Sol üstte sıfırıncı gün saldırısı uyarısı (ayrı bileşen değil; burada çizilir).
 */
const PzTopBar = ({ snap, startDate, speed, onSpeed, muted, onToggleMute, onMenu, onIntervene }) => {
    const dayFrac = ((snap.time % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS / DAY_SECONDS;
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[34px] z-20 flex items-start justify-between gap-2 p-2 sm:top-[38px] sm:p-3">
            <div className="pointer-events-auto">
                {snap.breach && (
                    <div className="pz-glass pz-glass-red pz-alarm flex items-center gap-2 rounded-2xl px-3 py-2" role="alert">
                        <span className="text-lg" aria-hidden="true">🚨</span>
                        <span className="text-[11px] font-black uppercase leading-tight tracking-wider text-rose-100">
                            Sıfırıncı gün saldırısı
                            <span className="block text-sm normal-case text-white">
                                {snap.nodes.find((n) => n.id === snap.breach.nodeId)?.name} · <span className="pz-mono">{Math.ceil(snap.breach.remaining)} sn</span>
                            </span>
                        </span>
                        <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger !min-h-[40px] !px-3 text-xs">
                            MÜDAHALE ET
                        </button>
                    </div>
                )}
            </div>

            <div className="pointer-events-auto pz-glass flex flex-col gap-1.5 rounded-2xl px-3 py-2">
                <div className="flex items-center gap-2">
                    <LuCalendarDays className="shrink-0 text-cyan-300" aria-hidden="true" />
                    <span className="pz-mono text-sm font-black text-white" aria-label="Tarih">
                        {formatGameDate(startDate, snap.day)}
                    </span>
                    <span className="pz-mono text-[10px] font-bold text-white/60">Gün {snap.day}</span>
                </div>
                <div className="pz-meter pz-meter-decrypt !h-1" aria-hidden="true">
                    <span style={{ width: `${Math.round(dayFrac * 100)}%`, transition: 'none' }} />
                </div>
                <div className="flex items-center gap-1">
                    <div className="pz-speed inline-flex items-center gap-0.5 rounded-xl bg-black/30 p-0.5" role="group" aria-label="Oyun hızı">
                        {SPEEDS.map((s) => (
                            <button key={s} type="button" aria-pressed={speed === s} onClick={() => onSpeed(s)} aria-label={SPEED_NAME[s]} title={SPEED_NAME[s]}>
                                {s === 0 ? <LuPause className="mx-auto" aria-hidden="true" /> : SPEED_LABEL[s]}
                            </button>
                        ))}
                    </div>
                    <button type="button" className="pz-icon-btn !h-10 !w-10" onClick={onToggleMute} aria-pressed={!muted} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}>
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                    </button>
                    <button type="button" className="pz-icon-btn !h-10 !w-10" onClick={onMenu} aria-label="Menü">
                        <LuMenu aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PzTopBar;
