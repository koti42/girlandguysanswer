import React, { useEffect, useRef } from 'react';
import { LuDoorOpen, LuFlag, LuMusic, LuPlay, LuRotateCcw, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { SAFE_AREA_PAD } from './towerUtils';

const btn =
    'flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 min-h-[52px] font-bold game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

const Switch = ({ on, label, icon: Icon, onClick }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onClick}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
        <span className="flex items-center gap-2">
            <Icon aria-hidden="true" /> {label}: {on ? 'Açık' : 'Kapalı'}
        </span>
        <span aria-hidden="true" className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-emerald-500' : 'bg-white/25'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </span>
    </button>
);

/**
 * Mola menüsü. Esc / P ile kapanması oturum kancasının klavye dinleyicisinde;
 * burada odak ilk butona taşınır ve Tab menüde döner. Molada soru paneli
 * gizlenir ve süre durur (sim de duruyor): bildirimle duraklayan oyuncu
 * cezalanmaz.
 */
const TowerPauseMenu = ({ ranked, muted, musicEnabled = true, onToggleMute, onToggleMusic, onResume, onRestart, onFinish, onExit, busy = false }) => {
    const firstRef = useRef(null);
    const boxRef = useRef(null);

    useEffect(() => {
        firstRef.current?.focus({ preventScroll: true });
    }, []);

    const onKeyDown = (e) => {
        if (e.key !== 'Tab') return;
        const items = boxRef.current?.querySelectorAll('button:not([disabled])');
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div className={`absolute inset-0 z-40 flex overflow-y-auto overscroll-contain bg-slate-950/70 backdrop-blur-sm ${SAFE_AREA_PAD}`}>
            <div
                ref={boxRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tower-pause-title"
                onKeyDown={onKeyDown}
                className="game-hero m-auto w-full max-w-sm rounded-3xl p-5 text-center shadow-2xl ring-1 ring-white/15 game-pop-in"
            >
                <h2 id="tower-pause-title" className="text-2xl font-black text-white">
                    Mola
                </h2>
                <p className="mt-1 text-sm text-white/70">{ranked ? 'Kulen bekliyor. Hazır olunca devam et.' : 'Antrenman duraklatıldı.'}</p>
                <div className="mt-5 space-y-2.5">
                    <button ref={firstRef} type="button" onClick={onResume} disabled={busy} className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white game-glow-coral`}>
                        <LuPlay aria-hidden="true" /> Devam et
                    </button>
                    <button type="button" onClick={onRestart} disabled={busy} className={`${btn} bg-white/15 text-white ring-1 ring-white/20 hover:bg-white/25`}>
                        <LuRotateCcw aria-hidden="true" /> Yeniden başlat
                    </button>
                    <button type="button" onClick={onFinish} disabled={busy} className={`${btn} bg-white/15 text-white ring-1 ring-white/20 hover:bg-white/25`}>
                        <LuFlag aria-hidden="true" /> {ranked ? 'Bitir ve kaydet' : 'Bitir'}
                    </button>
                    <button type="button" onClick={onExit} disabled={busy} className={`${btn} text-white/80 hover:text-white`}>
                        <LuDoorOpen aria-hidden="true" /> Çık
                    </button>
                </div>
                <div className="mt-3 space-y-2">
                    {onToggleMute && <Switch on={!muted} label="Ses" icon={muted ? LuVolumeX : LuVolume2} onClick={onToggleMute} />}
                    {onToggleMusic && <Switch on={musicEnabled} label="Müzik" icon={LuMusic} onClick={onToggleMusic} />}
                </div>
                {ranked && (
                    <p className="mt-3 text-[11px] leading-snug text-white/50">
                        &quot;Yeniden başlat&quot; ve &quot;Çık&quot; bu kuleyi kaydetmez. Puanını almak için &quot;Bitir ve kaydet&quot;.
                    </p>
                )}
            </div>
        </div>
    );
};

export default TowerPauseMenu;
