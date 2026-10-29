import React, { useEffect, useRef } from 'react';
import { LuBiohazard, LuCpu, LuDna, LuGlobe, LuPause, LuPlay, LuSiren, LuSkull, LuWallet } from 'react-icons/lu';
import { DAY_SECONDS, SPEEDS } from '../../../game/protocolZero/constants';
import { fmtNum, formatGameDate } from './pzUtils';

const Pill = ({ icon: Icon, label, value, tone }) => (
    <div className="pz-pill" role="group" aria-label={`${label}: ${value}`}>
        <span className="pz-pill-icon" style={{ '--tone': tone }} aria-hidden="true">
            <Icon />
        </span>
        <span className="pz-pill-text">
            <span className="pz-pill-label">{label}</span>
            <span className="pz-pill-value pz-mono" style={{ color: tone }}>{value}</span>
        </span>
    </div>
);

/**
 * Alt gösterge paneli: sol — enfekte sunucu sayacı (+hız) ve bütçe + ağaç;
 * orta — oynat/duraklat, gün içi zaman çizgisi, tarih (telefonda hız döngü düğmesi); sağ — pil göstergeleri + DÜNYA DURUMU.
 * Gerçek yüksekliğini `--pz-bb-h` olarak ekrana yazar: yan menü ve paneller çakışmadan üstüne oturur.
 */
const PzBottomBar = ({ snap, startDate, speed, onSpeed, paused, onTogglePause, onTech, onWorld, onIntervene }) => {
    const ref = useRef(null);
    useEffect(() => {
        const el = ref.current;
        const screen = el?.closest('.pz-screen');
        if (!el || !screen || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => screen.style.setProperty('--pz-bb-h', `${Math.round(el.getBoundingClientRect().height)}px`));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const dayFrac = (((snap.time % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS) / DAY_SECONDS;
    const cycleSpeed = () => {
        const i = SPEEDS.indexOf(speed);
        onSpeed(SPEEDS[(i + 1) % SPEEDS.length]);
    };
    return (
        <footer ref={ref} className="pz-bottombar">
            <section className="pz-card pz-card-red pz-bb-left" aria-label="Küresel vaka ve bütçe">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-2xl text-rose-300 ring-1 ring-rose-400/40" aria-hidden="true">
                    <LuBiohazard />
                </span>
                <div className="min-w-0">
                    <p className="pz-pill-label">Enfekte sunucu</p>
                    <p className="flex items-baseline gap-2">
                        <span className="pz-bigstat pz-mono">{fmtNum(snap.infectedServers)}</span>
                        <span className={`pz-stat-sub pz-mono ${snap.infectedRate > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                            {snap.infectedRate >= 0 ? '+' : ''}
                            {fmtNum(snap.infectedRate)} / sn
                        </span>
                    </p>
                </div>
                <span className="ml-1 hidden h-10 w-px bg-white/10 sm:block" aria-hidden="true" />
                <div className="hidden min-w-0 sm:block">
                    <p className="pz-pill-label flex items-center gap-1"><LuWallet aria-hidden="true" /> Bütçe</p>
                    <p className="pz-mono text-base font-black text-amber-200">
                        {fmtNum(snap.budget)} ₵ <span className="text-[11px] font-semibold text-amber-200/70">+{snap.income.toFixed(1)}/sn</span>
                    </p>
                </div>
                <button type="button" onClick={onTech} className="pz-btn pz-btn-amber hidden !min-h-[44px] !px-3 text-xs md:inline-flex" aria-label="Savunma Ağacı">
                    <LuCpu aria-hidden="true" /> AĞAÇ
                </button>
            </section>

            <section className="pz-bb-center pz-card flex items-center gap-3 px-3 py-2" aria-label="Zaman">
                <button type="button" className="pz-play" onClick={onTogglePause} aria-pressed={paused} aria-label="Duraklat">
                    {paused ? <LuPlay aria-hidden="true" /> : <LuPause aria-hidden="true" />}
                </button>
                <button type="button" className="pz-speed-cycle" onClick={cycleSpeed} aria-label={`Hız: ${speed}x, değiştir`}>
                    {speed}x ▸
                </button>
                <div className="min-w-0 flex-1">
                    <div className="pz-timeline" role="progressbar" aria-valuenow={Math.round(dayFrac * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Gün içi ilerleme">
                        <span style={{ width: `${Math.round(dayFrac * 100)}%` }} />
                    </div>
                    <div className="pz-time-ticks mt-1.5 flex justify-between text-[10px] font-bold text-white/60">
                        <span>00:00</span>
                        <span className={snap.status === 'running' && !paused ? 'pz-blink text-rose-300' : ''}>{snap.status === 'running' && !paused ? '● CANLI' : '■ BEKLİYOR'}</span>
                        <span>24:00</span>
                    </div>
                </div>
                <div className="rounded-xl bg-white/5 px-3 py-1.5 text-right ring-1 ring-white/10">
                    <p className="pz-mono text-sm font-black leading-none text-white">{formatGameDate(startDate, snap.day)}</p>
                    <p className="mt-0.5 text-[10px] font-bold text-white/60">Gün {snap.day}</p>
                </div>
                {snap.breach && (
                    <button type="button" onClick={onIntervene} className="pz-btn pz-btn-danger pz-alarm !min-h-[44px] !px-3 text-xs md:hidden" aria-label="Sıfırıncı gün saldırısına müdahale et">
                        <LuSiren aria-hidden="true" /> {Math.ceil(snap.breach.remaining)} sn
                    </button>
                )}
            </section>

            <section className="pz-bb-right pz-card flex items-center gap-1 p-2" aria-label="Küresel durum">
                <Pill icon={LuBiohazard} label="Yayılma" value={`%${Math.round(snap.dominance)}`} tone="#ff5f7a" />
                <Pill icon={LuSkull} label="Panik" value={`%${Math.round(snap.panic)}`} tone="#fbbf24" />
                <Pill icon={LuDna} label="Deşifre" value={`%${Math.round(snap.decrypt)}`} tone="#a78bfa" />
                <button type="button" onClick={onWorld} className="pz-btn pz-btn-danger !min-h-[48px] !px-4 text-xs sm:text-sm">
                    <LuGlobe aria-hidden="true" /> DÜNYA DURUMU
                </button>
            </section>
        </footer>
    );
};

export default PzBottomBar;
