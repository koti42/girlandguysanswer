import React, { memo, useSyncExternalStore } from 'react';
import { LuFlame, LuPause, LuVolume2, LuVolumeX } from 'react-icons/lu';
import { formatNumber } from '../gameUtils';

const iconBtn =
    'pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950/55 text-xl text-white ring-1 ring-white/20 backdrop-blur-sm game-press hover:bg-slate-900/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:opacity-50';

/**
 * Oyun ekranı üst çubuğu: kat (büyük), skor, kombo rozeti, ses ve mola.
 * Kapsayıcı `pointer-events-none`: HUD'un üstüne dokunuş da katı bırakır;
 * yalnızca butonlar tıklanabilir. Skor, cevabın doğruluğu sunucudan
 * gelene kadar soru puanını içermez.
 */
const TowerHud = ({ store, muted, onToggleMute, onPause, practice = false, canPause = true }) => {
    const hud = useSyncExternalStore(store.subscribe, store.get, store.get);
    const combo = hud.combo;

    return (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pl-[max(0.75rem,env(safe-area-inset-left))] pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))]">
            <div className="flex items-start gap-2">
                <div className="min-w-0 rounded-2xl bg-slate-950/45 px-3 py-1.5 text-white ring-1 ring-white/10 backdrop-blur-sm">
                    <p className="flex items-baseline gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">Kat</span>
                        <span key={hud.floor} className="tower-floor-tick text-3xl font-black tabular-nums leading-none" data-testid="tower-floor">
                            {formatNumber(hud.floor)}
                        </span>
                        {practice && <span className="ml-1 shrink-0 self-center rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">Antrenman</span>}
                    </p>
                    <p className="mt-0.5 flex items-baseline gap-1 text-sm font-extrabold tabular-nums">
                        <span className="sr-only">Skor</span>
                        <span className="game-text-gradient" data-testid="tower-score">
                            {formatNumber(hud.score)}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-white/55">puan</span>
                    </p>
                </div>

                <div className="flex min-w-0 flex-1 justify-center pt-1">
                    {combo >= 2 && (
                        <span
                            key={combo}
                            className="tower-combo-bump inline-flex max-w-full items-center gap-1 overflow-hidden whitespace-nowrap rounded-full bg-gradient-to-r from-gold to-coral px-2.5 py-1.5 text-sm font-black tabular-nums text-slate-950 shadow-lg ring-1 ring-white/30 sm:px-3"
                            data-testid="tower-combo"
                        >
                            <LuFlame aria-hidden="true" /> x{combo}
                            {/* Dar telefonda "kombo" yazısı ses düğmesinin altına taşıyordu; ekran okuyucu yine duyar. */}
                            <span className="sr-only sm:not-sr-only text-[10px] font-extrabold uppercase tracking-wide">kombo</span>
                        </span>
                    )}
                </div>

                <div className="flex shrink-0 items-start gap-2">
                    <button type="button" onClick={onToggleMute} className={iconBtn} aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}>
                        {muted ? <LuVolumeX aria-hidden="true" /> : <LuVolume2 aria-hidden="true" />}
                    </button>
                    <button type="button" onClick={onPause} className={iconBtn} aria-label="Duraklat" disabled={!canPause}>
                        <LuPause aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default memo(TowerHud);
