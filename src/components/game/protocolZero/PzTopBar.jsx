import React from 'react';
import { LuPause, LuSettings, LuSiren } from 'react-icons/lu';
import { SPEEDS } from '../../../game/protocolZero/constants';
import NewsTicker from './NewsTicker';

const SPEED_LABEL = { 0: '||', 1: '>', 2: '>>', 4: '>>>' };
const SPEED_NAME = { 0: 'Duraklat', 1: 'Normal (1x)', 2: 'Hızlı (2x)', 4: 'Ultra (4x)' };

/**
 * Üst komuta şeridi: kayan SON DAKİKA bandı + hız denetimi (|| > >> >>>, geçerli hız etiketi) + ayarlar.
 * Sıfırıncı gün saldırısı uyarısı bandın altında sol tarafta belirir.
 */
const PzTopBar = ({ snap, alert, speed, onSpeed, onSettings, onIntervene }) => (
    <>
        <div className="pz-topbar">
            <NewsTicker items={snap.log} alert={alert || Boolean(snap.breach)} />
            <div className="pz-speedbar" role="radiogroup" aria-label="Oyun hızı">
                {SPEEDS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={speed === s} aria-pressed={speed === s} onClick={() => onSpeed(s)} aria-label={SPEED_NAME[s]} title={SPEED_NAME[s]}>
                        {s === 0 ? <LuPause className="mx-auto" aria-hidden="true" /> : SPEED_LABEL[s]}
                    </button>
                ))}
                <span className="pz-speed-label pz-mono" aria-live="polite">{speed === 0 ? '0x' : `${speed}x`}</span>
                <button type="button" onClick={onSettings} className="pz-icon-btn !h-[30px] !w-[34px] !rounded-lg !border-0 !bg-transparent" aria-label="Ayarlar">
                    <LuSettings aria-hidden="true" />
                </button>
            </div>
        </div>
        {snap.breach && (
            <div className="pointer-events-auto absolute left-24 top-[60px] z-[27] hidden md:block">
                <div className="pz-card pz-card-red pz-alarm flex items-center gap-3 rounded-2xl px-3 py-2" role="alert">
                    <LuSiren className="text-xl text-rose-300" aria-hidden="true" />
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
            </div>
        )}
    </>
);

export default PzTopBar;
