import React, { memo, useSyncExternalStore } from 'react';
import { LuChevronsUp, LuCoins, LuMagnet, LuPause, LuShield, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { formatNumber } from '../gameUtils';
import { MULT_STYLES } from './runnerUtils';

/*
 * Süreli güçlendirme halkası (mıknatıs / Süper Zıplama): kalan süre halka
 * olarak azalır. Son %20'de halka yanıp söner (hareket azaltıldıysa durur,
 * game.css'teki animate-pulse tercihine uyar).
 */
const PowerRing = ({ pct, color, title, icon: Icon, iconClass, testId }) => {
    const r = 7;
    const c = 2 * Math.PI * r;
    return (
        <span className={`relative inline-flex h-5 w-5 items-center justify-center ${pct <= 20 ? 'motion-safe:animate-pulse' : ''}`} title={title} data-testid={testId}>
            <svg viewBox="0 0 18 18" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.2" />
                <circle
                    cx="9"
                    cy="9"
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct / 100)}
                />
            </svg>
            <Icon className={`relative text-[10px] ${iconClass}`} aria-hidden="true" />
            <span className="sr-only">
                {title} %{pct}
            </span>
        </span>
    );
};

const iconBtn =
    'pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950/55 text-xl text-white ring-1 ring-white/20 backdrop-blur-sm game-press hover:bg-slate-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

/**
 * Oyun ekranı üst çubuğu. Kapsayıcı `pointer-events-none`: kaydırma
 * hareketleri HUD'un üstünden başlasa da motora ulaşsın; yalnızca butonlar
 * tıklanabilir.
 */
const RunnerHud = ({ store, muted, onToggleMute, onPause, practice = false, canPause = true }) => {
    const hud = useSyncExternalStore(store.subscribe, store.get, store.get);
    const mult = hud.multiplier;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pl-[max(0.75rem,var(--hs-safe-left,env(safe-area-inset-left)))] pt-[max(0.5rem,var(--hs-safe-top,env(safe-area-inset-top)))] pr-[max(0.75rem,var(--hs-safe-right,env(safe-area-inset-right)))]">
            <div className="flex items-start gap-2">
                {/* Skor kutusu içeriği kadar: yatayda / masaüstünde ekran boyu bulanık şerit olmasın. */}
                <div className="min-w-0 max-w-xs rounded-2xl bg-slate-950/45 px-3 py-1.5 text-white ring-1 ring-white/10 backdrop-blur-sm">
                    <p className="flex items-baseline gap-1.5">
                        <span className="sr-only">Skor</span>
                        <span className="truncate text-xl sm:text-2xl font-black tabular-nums leading-tight game-text-gradient" data-testid="runner-score">
                            {formatNumber(hud.score)}
                        </span>
                        {practice && <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Antrenman</span>}
                    </p>
                    <p className="flex items-center gap-2 text-xs font-bold tabular-nums text-white/85">
                        <span>
                            {formatNumber(hud.distance)} <span className="font-semibold text-white/60">m</span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-amber-200">
                            <LuCoins aria-hidden="true" />
                            {formatNumber(hud.coins)}
                            <span className="sr-only">jeton</span>
                        </span>
                        {hud.magnetPct > 0 && <PowerRing pct={hud.magnetPct} color="#38bdf8" title="Mıknatıs" icon={LuMagnet} iconClass="text-sky-200" />}
                        {hud.superPct > 0 && (
                            <PowerRing pct={hud.superPct} color="#a3e635" title="Süper Zıplama" icon={LuChevronsUp} iconClass="text-lime-200" testId="runner-super" />
                        )}
                        {hud.shield && (
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/40 text-[11px] text-emerald-100 ring-1 ring-emerald-300/80" title="Kalkan">
                                <LuShield aria-hidden="true" />
                                <span className="sr-only">Kalkan aktif</span>
                            </span>
                        )}
                    </p>
                </div>

                <div className="ml-auto flex shrink-0 items-start gap-2">
                    {!practice && (
                        <span
                            className={`flex h-11 min-w-[3rem] shrink-0 items-center justify-center rounded-2xl px-2 text-lg font-black tabular-nums shadow-lg ring-1 ring-white/20 ${MULT_STYLES[mult] || MULT_STYLES[1]}`}
                            title="Çarpan"
                        >
                            <span className="sr-only">Çarpan </span>x{mult}
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={onToggleMute}
                        className={iconBtn}
                        aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
                    >
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={onPause} className={iconBtn} aria-label="Duraklat" disabled={!canPause}>
                        <LuPause aria-hidden="true" />
                    </button>
                </div>
            </div>

            {hud.stumbling && <div className="runner-stumble pointer-events-none fixed inset-0" aria-hidden="true" />}
        </div>
    );
};

export default memo(RunnerHud);
